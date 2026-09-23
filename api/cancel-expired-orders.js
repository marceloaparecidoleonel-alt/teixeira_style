/* ============================================================
   TEIXEIRA STYLE — Cron: Cancelar pedidos expirados
   Executado automaticamente pelo Vercel Cron a cada hora.
   Cancela pedidos com status "aguardando_pagamento" que foram
   criados há mais de 1 hora e ainda não foram pagos.
   ============================================================ */

const https = require('https');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'teixeira-style';
const EXPIRY_MS  = 40 * 60 * 1000; /* 40 minutos — PIX expira em 30min, margem de segurança */

/* ---- Firestore REST: runQuery (para buscar múltiplos docs com filtro) ---- */
function firestoreQuery(projectId, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const path    = `/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
    const req = https.request({
      hostname: 'firestore.googleapis.com',
      path,
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/* ---- Firestore REST: PATCH (atualiza campos específicos) ---- */
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
      method:  'PATCH',
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

/* ============================================================
   HANDLER PRINCIPAL
   ============================================================ */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* Segurança: só restringe se CRON_SECRET estiver configurado */
  const authHeader = req.headers['authorization'] || '';
  const cronSecret = process.env.CRON_SECRET || '';
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now       = Date.now();
    const cutoffSec = Math.floor((now - EXPIRY_MS) / 1000); /* timestamp de corte em segundos */

    /* Busca pedidos aguardando pagamento criados antes do cutoff */
    const queryBody = {
      structuredQuery: {
        from: [{ collectionId: 'orders' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: 'status' },
                  op:    'EQUAL',
                  value: { stringValue: 'aguardando_pagamento' }
                }
              }
            ]
          }
        },
        limit: 200
      }
    };

    const queryRes = await firestoreQuery(PROJECT_ID, queryBody);
    if (queryRes.status !== 200) {
      console.error('[CancelCron] Erro na query Firestore:', queryRes.status);
      return res.status(502).json({ error: 'Erro ao consultar Firestore' });
    }

    const docs = Array.isArray(queryRes.body) ? queryRes.body : [];
    let cancelled = 0;
    let skipped   = 0;

    for (const entry of docs) {
      if (!entry.document) continue; /* resultado vazio da query */

      const fields  = entry.document.fields || {};
      const docName = entry.document.name   || '';
      const docId   = docName.split('/').pop();

      /* Extrai created_at (pode ser timestampValue ou integerValue em segundos) */
      let createdSec = null;
      if (fields.created_at?.timestampValue) {
        createdSec = Math.floor(new Date(fields.created_at.timestampValue).getTime() / 1000);
      } else if (fields.created_at?.integerValue) {
        createdSec = parseInt(fields.created_at.integerValue, 10);
      }

      /* Se não tem created_at ou ainda está dentro do prazo, pula */
      if (createdSec === null || createdSec > cutoffSec) {
        skipped++;
        continue;
      }

      /* Nunca cancelar pedido que já foi pago (paymentStatus = approved ou status = pago) */
      const currentStatus        = fields.status?.stringValue        || '';
      const currentPaymentStatus = fields.paymentStatus?.stringValue || '';
      if (currentStatus === 'pago' || currentPaymentStatus === 'approved') {
        skipped++;
        console.log(`[CancelCron] Pedido ${docId} ignorado — já pago.`);
        continue;
      }

      /* Cancela o pedido */
      await firestorePatch(PROJECT_ID, 'orders', docId, {
        status:        'cancelado',
        paymentStatus: 'expired',
        cancelledAt:   new Date().toISOString()
      });

      console.log(`[CancelCron] Pedido ${docId} cancelado (criado em ${new Date(createdSec * 1000).toISOString()})`);
      cancelled++;
    }

    console.log(`[CancelCron] Concluído: ${cancelled} cancelado(s), ${skipped} dentro do prazo.`);
    return res.status(200).json({ cancelled, skipped, checkedAt: new Date().toISOString() });

  } catch (err) {
    console.error('[CancelCron] Erro:', err.message);
    return res.status(500).json({ error: 'Erro interno', detail: err.message });
  }
};
