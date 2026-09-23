/* ============================================================
   TEIXEIRA STYLE — Firebase Auth Proxy
   Proxy transparente para /__/auth/* → teixeira-style.firebaseapp.com/__/auth/*

   Necessário para que signInWithRedirect funcione com authDomain
   apontando para o domínio personalizado (www.teixeirastyle.com.br).
   Sem este proxy, o Chrome mobile bloqueia os cookies de sessão do
   Firebase como third-party cookies, fazendo getRedirectResult() retornar null.

   Referência: https://firebase.google.com/docs/auth/web/redirect-best-practices
   ============================================================ */

const https = require('https');
const http  = require('http');

const FIREBASE_AUTH_HOST = 'teixeira-style.firebaseapp.com';

module.exports = async function handler(req, res) {
  /* Reconstrói o path: /api/auth-proxy → /__/auth/...
     O vercel.json mapeia /__/auth/(.*) → /api/auth-proxy?path=$1 */
  const subpath = req.query.path || '';

  let search = '';
  if (req.url.includes('?')) {
    const qs = new URLSearchParams(req.url.split('?').slice(1).join('?'));
    qs.delete('path');
    const remaining = qs.toString();
    if (remaining) search = '?' + remaining;
  }

  const targetPath = `/__/auth/${subpath}${search}`;

  /* Remove headers que causariam problemas no proxy */
  const proxyHeaders = { ...req.headers };
  delete proxyHeaders['host'];
  delete proxyHeaders['x-forwarded-host'];
  proxyHeaders['host'] = FIREBASE_AUTH_HOST;

  const options = {
    hostname: FIREBASE_AUTH_HOST,
    path:     targetPath,
    method:   req.method,
    headers:  proxyHeaders
  };

  return new Promise((resolve) => {
    const proxyReq = https.request(options, (proxyRes) => {
      /* Repassa status e headers da resposta original */
      res.statusCode = proxyRes.statusCode;

      Object.entries(proxyRes.headers).forEach(([key, value]) => {
        /* Ajusta Set-Cookie para funcionar no domínio personalizado */
        if (key.toLowerCase() === 'set-cookie') {
          const cookies = Array.isArray(value) ? value : [value];
          const adjusted = cookies.map(c =>
            c.replace(/domain=[^;]+;?\s*/gi, '')
             .replace(/samesite=none/gi, 'SameSite=None')
          );
          res.setHeader('Set-Cookie', adjusted);
        } else if (key.toLowerCase() !== 'transfer-encoding') {
          res.setHeader(key, value);
        }
      });

      proxyRes.pipe(res);
      proxyRes.on('end', resolve);
    });

    proxyReq.on('error', (err) => {
      console.error('[AuthProxy] Erro:', err.message);
      res.status(502).end('Auth proxy error');
      resolve();
    });

    /* Repassa body (para POST) */
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.pipe(proxyReq);
    } else {
      proxyReq.end();
    }
  });
};
