/* ============================================================
   TEIXEIRA STYLE — Serverless: Criar Pagamento PIX (Mercado Pago)
   POST /api/mp-create-payment
   Body: { orderId, items: [{name, price, qty, size}], payer: {email, name}, total }
   ============================================================ */

const https = require('https');

/* ---- Consulta estoque de um produto via Firestore REST API ---- */
function getProductStock(projectId, productId) {
  return new Promise((resolve) => {
    const path = `/v1/projects/${projectId}/databases/(default)/documents/products/${productId}`;
    const options = {
      hostname: 'firestore.googleapis.com',
      path,
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const doc = JSON.parse(data);
          const fields = doc.fields || {};
          /* Firestore REST retorna { integerValue } ou { doubleValue } */
          const stockField = fields.stock;
          if (stockField) {
            const stock = parseInt(stockField.integerValue || stockField.doubleValue || 0, 10);
            return resolve({ stock, found: true });
          }
          /* Fallback: availability === 'available' → stock = 1 */
          const avail = fields.availability?.stringValue;
          return resolve({ stock: avail === 'available' ? 1 : 0, found: true });
        } catch(e) { resolve({ stock: null, found: false }); }
      });
    });
    req.on('error', () => resolve({ stock: null, found: false }));
    req.end();
  });
}

function mpRequest(path, method, body, idempotencyKey) {
  return new Promise((resolve, reject) => {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) return reject(new Error('MERCADOPAGO_ACCESS_TOKEN não configurado'));

    const payload = JSON.stringify(body);
    const options = {
      hostname: 'api.mercadopago.com',
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Idempotency-Key': idempotencyKey || '',
        'Content-Length': Buffer.byteLength(payload)
      }
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
    req.write(payload);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  /* CORS */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  try {
    const { orderId, items, payer, userId } = req.body;

    /* Validações básicas */
    if (!orderId || !items || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Dados inválidos: orderId e items obrigatórios' });
    }
    if (!payer || !payer.email) {
      return res.status(400).json({ error: 'Dados do pagador obrigatórios' });
    }

    /* Recalcula o total no backend — NUNCA confiar no valor do frontend */
    const calculatedTotal = items.reduce((sum, i) => {
      const price = parseFloat(i.price);
      const qty   = parseInt(i.qty, 10);
      if (isNaN(price) || isNaN(qty) || price <= 0 || qty <= 0) {
        throw new Error(`Item inválido: ${JSON.stringify(i)}`);
      }
      return sum + price * qty;
    }, 0);

    const totalRounded = Math.round(calculatedTotal * 100) / 100;
    if (totalRounded <= 0) {
      return res.status(400).json({ error: 'Total calculado inválido' });
    }

    /* Valida estoque no Firestore (backend — cliente não pode contornar) */
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (projectId) {
      for (const item of items) {
        const qty = parseInt(item.qty, 10);
        const { stock, found } = await getProductStock(projectId, item.id || item.productId || '');
        if (!found) continue; /* se não conseguiu consultar, não bloqueia (evita falso positivo) */
        if (stock !== null && qty > stock) {
          return res.status(400).json({
            error: `Estoque insuficiente`,
            detail: `"${item.name}": solicitado ${qty}, disponível ${stock}`
          });
        }
        if (stock === 0) {
          return res.status(400).json({
            error: `Produto esgotado`,
            detail: `"${item.name}" está sem estoque`
          });
        }
      }
    }

    /* Chave de idempotência — baseada no orderId (previne duplicatas) */
    const idempotencyKey = `teixeira-${orderId}`;

    /* Monta payload para o Mercado Pago */
    const description = items.map(i => `${i.qty}x ${i.name} (${i.size || ''})`).join(', ');

    const mpBody = {
      transaction_amount: totalRounded,
      description: description.slice(0, 250),
      payment_method_id: 'pix',
      payer: {
        email: payer.email,
        first_name: (payer.name || '').split(' ')[0] || 'Cliente',
        last_name:  (payer.name || '').split(' ').slice(1).join(' ') || 'Teixeira'
      },
      external_reference: orderId,
      notification_url: process.env.WEBHOOK_URL || null
    };

    /* Remove notification_url se não configurado (opcional) */
    if (!mpBody.notification_url) delete mpBody.notification_url;

    const mpResponse = await mpRequest('/v1/payments', 'POST', mpBody, idempotencyKey);

    if (mpResponse.status !== 201 && mpResponse.status !== 200) {
      console.error('[MP] Erro ao criar pagamento:', mpResponse.body);
      return res.status(502).json({
        error: 'Erro ao criar pagamento no Mercado Pago',
        detail: mpResponse.body?.message || mpResponse.body?.error
      });
    }

    const mpData = mpResponse.body;

    /* Retorna ao frontend apenas o necessário */
    return res.status(200).json({
      paymentId:     mpData.id,
      status:        mpData.status,
      statusDetail:  mpData.status_detail,
      total:         totalRounded,
      qrCode:        mpData.point_of_interaction?.transaction_data?.qr_code        || null,
      qrCodeBase64:  mpData.point_of_interaction?.transaction_data?.qr_code_base64 || null,
      expiresAt:     mpData.date_of_expiration || null
    });

  } catch (err) {
    console.error('[MP] Erro interno:', err.message);
    return res.status(500).json({ error: 'Erro interno no servidor' });
  }
};
