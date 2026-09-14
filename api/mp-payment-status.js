/* ============================================================
   TEIXEIRA STYLE — Serverless: Consultar Status do Pagamento
   GET /api/mp-payment-status?paymentId=XXXX
   ============================================================ */

const https = require('https');

function mpGet(paymentId) {
  return new Promise((resolve, reject) => {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) return reject(new Error('MERCADOPAGO_ACCESS_TOKEN não configurado'));

    const options = {
      hostname: 'api.mercadopago.com',
      path: `/v1/payments/${paymentId}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
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
    req.end();
  });
}

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

    const mpData = mpResponse.body;

    return res.status(200).json({
      paymentId:        mpData.id,
      status:           mpData.status,
      statusDetail:     mpData.status_detail,
      externalReference: mpData.external_reference,
      total:            mpData.transaction_amount
    });

  } catch (err) {
    console.error('[MP Status] Erro:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
