/* ============================================================
   TEIXEIRA STYLE — Serverless: Webhook do Mercado Pago
   POST /api/mp-webhook
   Recebe notificações de pagamento e atualiza o Firestore
   ============================================================ */

const https = require('https');

/* Consulta o pagamento diretamente no MP para confirmar o status real */
function mpGetPayment(paymentId) {
  return new Promise((resolve, reject) => {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) return reject(new Error('Token não configurado'));

    const options = {
      hostname: 'api.mercadopago.com',
      path: `/v1/payments/${paymentId}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/* ---- Firestore REST: GET de um documento ---- */
function firestoreGet(projectId, collection, docId) {
  return new Promise((resolve, reject) => {
    const path = `/v1/projects/${projectId}/databases/(default)/documents/${collection}/${docId}`;
    const req = https.request({ hostname: 'firestore.googleapis.com', path, method: 'GET' }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/* ---- Firestore REST: PATCH (merge) de campos em um documento ---- */
function firestorePatch(projectId, collection, docId, fields) {
  return new Promise((resolve, reject) => {
    const encoded = Object.fromEntries(
      Object.entries(fields).map(([k, v]) => {
        if (typeof v === 'string')  return [k, { stringValue: v }];
        if (typeof v === 'number')  return [k, { integerValue: String(Math.round(v)) }];
        if (typeof v === 'boolean') return [k, { booleanValue: v }];
        return [k, { nullValue: null }];
      })
    );
    const payload = JSON.stringify({ fields: encoded });
    const mask    = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const path    = `/v1/projects/${projectId}/databases/(default)/documents/${collection}/${docId}?${mask}`;

    const req = https.request({
      hostname: 'firestore.googleapis.com',
      path,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/* Alias para compatibilidade com a lógica de update do pedido */
function firestoreUpdate(orderId, fields) {
  const projectId = process.env.FIREBASE_PROJECT_ID || 'teixeira-style';
  return firestorePatch(projectId, 'orders', orderId, fields);
}

/* ============================================================
   decrementStock — mesma lógica do mp-payment-status.js
   Idempotente: stockDecremented=true impede dupla baixa.
   Protege contra estoque negativo: Math.max(0, stock - qty)
   ============================================================ */
async function decrementStock(projectId, orderId, items) {
  const orderRes = await firestoreGet(projectId, 'orders', orderId);
  if (orderRes.status !== 200) {
    console.warn(`[Webhook/Stock] Pedido ${orderId} não encontrado`);
    return;
  }
  const orderFields = orderRes.body.fields || {};
  if (orderFields.stockDecremented?.booleanValue === true) {
    console.log(`[Webhook/Stock] Pedido ${orderId} já teve estoque baixado. Ignorando.`);
    return;
  }

  await firestorePatch(projectId, 'orders', orderId, { stockDecremented: true });

  for (const item of items) {
    const productId = item.id || item.productId;
    const qty       = parseInt(item.qty, 10) || 0;
    if (!productId || qty <= 0) continue;
    try {
      const prodRes = await firestoreGet(projectId, 'products', productId);
      if (prodRes.status !== 200) { console.warn(`[Webhook/Stock] Produto ${productId} não encontrado.`); continue; }
      const prodFields   = prodRes.body.fields || {};
      const stockField   = prodFields.stock;
      const currentStock = stockField ? parseInt(stockField.integerValue || stockField.doubleValue || 0, 10) : 0;
      if (currentStock <= 0) { console.warn(`[Webhook/Stock] Produto ${productId} já com estoque 0.`); continue; }
      const newStock = Math.max(0, currentStock - qty);
      await firestorePatch(projectId, 'products', productId, { stock: newStock });
      console.log(`[Webhook/Stock] Produto ${productId}: ${currentStock} → ${newStock} (−${qty})`);
    } catch (e) {
      console.error(`[Webhook/Stock] Erro produto ${productId}:`, e.message);
    }
  }
  console.log(`[Webhook/Stock] Baixa concluída para pedido ${orderId}`);
}

module.exports = async function handler(req, res) {
  /* Mercado Pago envia GET para validar o endpoint + POST com notificações */
  if (req.method === 'GET') return res.status(200).send('OK');
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { type, data, action } = req.body || {};

    /* Aceita apenas notificações de pagamento */
    const isPayment = type === 'payment' || action === 'payment.updated' || action === 'payment.created';
    if (!isPayment) return res.status(200).json({ received: true });

    const paymentId = data?.id;
    if (!paymentId) return res.status(200).json({ received: true });

    /* Consulta o status REAL no Mercado Pago (nunca confia no payload do webhook) */
    const mpResponse = await mpGetPayment(paymentId);
    if (mpResponse.status !== 200) {
      console.warn('[Webhook] Pagamento não encontrado no MP:', paymentId);
      return res.status(200).json({ received: true });
    }

    const mpData = mpResponse.body;
    const orderId = mpData.external_reference;

    if (!orderId) {
      console.warn('[Webhook] external_reference ausente para payment:', paymentId);
      return res.status(200).json({ received: true });
    }

    /* Mapeia status do MP para status interno */
    const mpStatus = mpData.status;
    let orderStatus      = 'aguardando_pagamento';
    let paymentStatus    = mpStatus;

    if (mpStatus === 'approved') {
      orderStatus = 'pago';
    } else if (mpStatus === 'rejected' || mpStatus === 'cancelled') {
      orderStatus = 'cancelado';
    } else if (mpStatus === 'refunded') {
      orderStatus = 'reembolsado';
    }

    /* Atualiza o Firestore */
    await firestoreUpdate(orderId, {
      status:               orderStatus,
      paymentStatus:        paymentStatus,
      paymentProvider:      'mercadopago',
      paymentMethod:        'pix',
      mercadopagoPaymentId: String(paymentId),
      paidAt:               mpStatus === 'approved' ? new Date().toISOString() : ''
    });

    /* Baixa estoque somente quando aprovado — idempotente */
    if (mpStatus === 'approved') {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      if (projectId) {
        const orderRes = await firestoreGet(projectId, 'orders', orderId);
        if (orderRes.status === 200) {
          const rawItems = orderRes.body.fields?.items?.arrayValue?.values || [];
          const items = rawItems.map(v => {
            const f = v.mapValue?.fields || {};
            return {
              id:  f.id?.stringValue || f.productId?.stringValue || '',
              qty: parseInt(f.qty?.integerValue || f.qty?.doubleValue || 1, 10)
            };
          });
          if (items.length) {
            decrementStock(projectId, orderId, items).catch(e =>
              console.error('[Webhook/Stock] decrementStock error:', e.message)
            );
          }
        }
      }
    }

    console.log(`[Webhook] Pedido ${orderId} atualizado → status: ${orderStatus}`);
    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('[Webhook] Erro:', err.message);
    /* Sempre retorna 200 para o MP não retentar indefinidamente */
    return res.status(200).json({ received: true });
  }
};
