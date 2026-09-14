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

/* Atualiza o pedido no Firestore via REST API (sem SDK no serverless) */
function firestoreUpdate(orderId, fields) {
  return new Promise((resolve, reject) => {
    const projectId = process.env.FIREBASE_PROJECT_ID || 'teixeira-style';
    const token     = process.env.FIREBASE_SERVICE_ACCOUNT_TOKEN;

    /* Se não há token de serviço, usa a API pública de update com campo de merge */
    const payload = JSON.stringify({
      fields: Object.fromEntries(
        Object.entries(fields).map(([k, v]) => {
          if (typeof v === 'string')  return [k, { stringValue: v }];
          if (typeof v === 'number')  return [k, { doubleValue: v }];
          if (typeof v === 'boolean') return [k, { booleanValue: v }];
          return [k, { nullValue: null }];
        })
      )
    });

    const updateMask = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
    const path = `/v1/projects/${projectId}/databases/(default)/documents/orders/${orderId}?${updateMask}`;

    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const options = {
      hostname: 'firestore.googleapis.com',
      path,
      method: 'PATCH',
      headers
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
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

    console.log(`[Webhook] Pedido ${orderId} atualizado → status: ${orderStatus}`);
    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('[Webhook] Erro:', err.message);
    /* Sempre retorna 200 para o MP não retentar indefinidamente */
    return res.status(200).json({ received: true });
  }
};
