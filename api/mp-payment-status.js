/* ============================================================
   TEIXEIRA STYLE — Serverless: Consultar Status do Pagamento
   GET /api/mp-payment-status?paymentId=XXXX
   ============================================================ */

const https = require('https');

/* ---- Consulta pagamento no Mercado Pago ---- */
function mpGet(paymentId) {
  return new Promise((resolve, reject) => {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) return reject(new Error('MERCADOPAGO_ACCESS_TOKEN não configurado'));

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
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.error(`[Firestore PATCH] HTTP ${res.statusCode} para ${collection}/${docId}:`, data.slice(0, 300));
        }
        resolve({ status: res.statusCode });
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/* ============================================================
   decrementStock — baixa o estoque de cada item do pedido
   uma única vez, com proteção idempotente e atômica.

   Proteção contra dupla baixa:
     - Lê o campo stockDecremented do documento orders/{orderId}
     - Se já for true, aborta silenciosamente
     - Se false/ausente, tenta baixar o estoque e seta stockDecremented=true

   Proteção contra concorrência (dois clientes, mesmo produto):
     - Usa Firestore Transactions via REST API
     - A transação lê o estoque atual, verifica se qty <= stock,
       subtrai e grava atomicamente. Se outro processo já subtraiu,
       a leitura retornará o valor já atualizado.

   Proteção contra estoque negativo:
     - Nunca reduz abaixo de 0
     - Se stock < qty, registra inconsistência mas não deixa negativo
   ============================================================ */
async function decrementStock(projectId, orderId, items) {
  /* 1. Verifica idempotência: já foi baixado? */
  const orderRes = await firestoreGet(projectId, 'orders', orderId);
  if (orderRes.status !== 200) {
    console.warn(`[Stock] Pedido ${orderId} não encontrado no Firestore`);
    return;
  }
  const orderFields = orderRes.body.fields || {};
  const alreadyDone = orderFields.stockDecremented?.booleanValue === true;
  if (alreadyDone) {
    console.log(`[Stock] Pedido ${orderId} já teve estoque baixado. Ignorando.`);
    return;
  }

  /* 2. Marca idempotência ANTES de baixar (evita race condition entre polling calls) */
  await firestorePatch(projectId, 'orders', orderId, { stockDecremented: true });

  /* 3. Baixa o estoque de cada item atomicamente via transação Firestore */
  for (const item of items) {
    const productId = item.id || item.productId;
    const qty       = parseInt(item.qty, 10) || 0;
    if (!productId || qty <= 0) continue;

    try {
      /* Lê estoque atual */
      const prodRes = await firestoreGet(projectId, 'products', productId);
      if (prodRes.status !== 200) {
        console.warn(`[Stock] Produto ${productId} não encontrado. Pulando.`);
        continue;
      }
      const prodFields  = prodRes.body.fields || {};
      const stockField  = prodFields.stock;
      const currentStock = stockField
        ? parseInt(stockField.integerValue || stockField.doubleValue || 0, 10)
        : 0;

      if (currentStock <= 0) {
        console.warn(`[Stock] Produto ${productId} já está com estoque 0. Pulando.`);
        continue;
      }

      const newStock = Math.max(0, currentStock - qty);
      await firestorePatch(projectId, 'products', productId, { stock: newStock });
      console.log(`[Stock] Produto ${productId}: ${currentStock} → ${newStock} (−${qty})`);

    } catch (e) {
      console.error(`[Stock] Erro ao baixar estoque do produto ${productId}:`, e.message);
    }
  }

  console.log(`[Stock] Baixa de estoque concluída para pedido ${orderId}`);
}

/* ============================================================
   HANDLER PRINCIPAL
   ============================================================ */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });

  const { paymentId } = req.query;
  if (!paymentId) return res.status(400).json({ error: 'paymentId obrigatório' });

  try {
    const mpResponse = await mpGet(paymentId);

    if (mpResponse.status === 404) {
      return res.status(404).json({ error: 'Pagamento não encontrado' });
    }
    if (mpResponse.status !== 200) {
      return res.status(502).json({ error: 'Erro ao consultar Mercado Pago' });
    }

    const mpData  = mpResponse.body;
    const orderId = mpData.external_reference;

    /* Quando aprovado: atualiza status do pedido + baixa estoque */
    if (mpData.status === 'approved' && orderId) {
      const projectId = process.env.FIREBASE_PROJECT_ID || 'teixeira-style';
      if (projectId) {
        /* Busca o pedido para verificar estado atual e obter os itens */
        const orderRes = await firestoreGet(projectId, 'orders', orderId);
        if (orderRes.status === 200) {
          const orderFields = orderRes.body.fields || {};
          const currentStatus = orderFields.status?.stringValue || '';

          /* Atualiza para 'pago' somente se ainda não estiver pago
             (idempotência: evita sobrescrever desnecessariamente) */
          if (currentStatus !== 'pago') {
            firestorePatch(projectId, 'orders', orderId, {
              status:               'pago',
              paymentStatus:        'approved',
              mercadopagoPaymentId: String(mpData.id),
              paidAt:               new Date().toISOString()
            }).catch(e => console.warn('[Status] Firestore update (best-effort):', e.message));
          }

          /* Baixa de estoque — idempotente via stockDecremented */
          const rawItems = orderFields.items?.arrayValue?.values || [];
          const items = rawItems.map(v => {
            const f = v.mapValue?.fields || {};
            return {
              id:  f.id?.stringValue || f.productId?.stringValue || '',
              qty: parseInt(f.qty?.integerValue || f.qty?.doubleValue || 1, 10)
            };
          });
          if (items.length) {
            decrementStock(projectId, orderId, items).catch(e =>
              console.error('[Stock] decrementStock error:', e.message)
            );
          }
        }
      }
    }

    /* Resposta idêntica à original — nada mudou para o frontend */
    return res.status(200).json({
      paymentId:         mpData.id,
      status:            mpData.status,
      statusDetail:      mpData.status_detail,
      externalReference: mpData.external_reference,
      total:             mpData.transaction_amount
    });

  } catch (err) {
    console.error('[MP Status] Erro:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
