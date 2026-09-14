/* ============================================================
   TEIXEIRA STYLE — Checkout (PIX via Mercado Pago)
   ============================================================ */

const db = window.fbDb;
const API_BASE = '';  /* mesmo domínio — Vercel serverless */

/* ---- Estado da sessão de pagamento ---- */
let _orderId      = null;
let _paymentId    = null;
let _pollInterval = null;
let _orderItems   = null;
let _orderTotal   = 0;

/* Chave de sessão para persistência durante reload */
const _SESSION_KEY = 'ts_checkout_session';

/* ============================================================
   RESUMO DO CARRINHO
   CAUSA DO R$ 0,00: renderSummary() era chamado imediatamente,
   antes de loadCartFromFirestore() completar. Agora é chamado
   somente quando o carrinho já está carregado.
   ============================================================ */
function renderSummary() {
  const itemsEl = document.getElementById('checkoutItems');
  const totalEl = document.getElementById('totalPrice');
  if (!itemsEl || !totalEl) return;

  const cart = getCart();
  if (!cart.length) {
    itemsEl.innerHTML = '<p style="color:#888;font-size:.9rem">Carrinho vazio.</p>';
    totalEl.textContent = 'R$ 0,00';
    return;
  }

  itemsEl.innerHTML = cart.map(item => {
    const price    = parseFloat(item.price)   || 0;
    const qty      = parseInt(item.qty, 10)   || 1;
    const subtotal = price * qty;
    return `
      <div class="checkout-item">
        <span>${qty}x ${item.name}${item.size ? ' (' + item.size + ')' : ''}</span>
        <span>R$\u00a0${subtotal.toFixed(2).replace('.', ',')}</span>
      </div>`;
  }).join('');

  /* cartTotal() soma price*qty de cada item — fonte única de verdade */
  totalEl.textContent = `R$\u00a0${cartTotal().toFixed(2).replace('.', ',')}`;
}

/* ============================================================
   MÁSCARAS
   ============================================================ */
function maskCep(el) {
  el.addEventListener('input', () => {
    let v = el.value.replace(/\D/g, '').slice(0, 8);
    if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5);
    el.value = v;
  });
}

function maskPhone(el) {
  el.addEventListener('input', () => {
    let v = el.value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 10) {
      v = '(' + v.slice(0,2) + ') ' + v.slice(2,7) + '-' + v.slice(7);
    } else if (v.length > 6) {
      v = '(' + v.slice(0,2) + ') ' + v.slice(2,6) + '-' + v.slice(6);
    } else if (v.length > 2) {
      v = '(' + v.slice(0,2) + ') ' + v.slice(2);
    }
    el.value = v;
  });
}

/* ============================================================
   PERSISTÊNCIA DE SESSÃO DE PAGAMENTO
   Evita perder o pedido/QR Code ao recarregar a página
   ============================================================ */
function saveSession(data) {
  try { sessionStorage.setItem(_SESSION_KEY, JSON.stringify(data)); } catch(e) {}
}
function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(_SESSION_KEY) || 'null'); } catch(e) { return null; }
}
function clearSession() {
  try { sessionStorage.removeItem(_SESSION_KEY); } catch(e) {}
}

/* ============================================================
   VALIDAÇÃO DOS CAMPOS
   ============================================================ */
function highlightField(id, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.borderColor = ok ? '' : '#e74c3c';
  el.style.boxShadow  = ok ? '' : '0 0 0 2px rgba(231,76,60,0.25)';
}

function validateFields() {
  const fields = [
    { id: 'fullName',    label: 'Nome completo' },
    { id: 'whatsapp',   label: 'WhatsApp' },
    { id: 'cep',        label: 'CEP' },
    { id: 'city',       label: 'Cidade' },
    { id: 'estado',     label: 'Estado' },
    { id: 'address',    label: 'Endereço' },
    { id: 'numero',     label: 'Número' },
    { id: 'complemento', label: 'Complemento (escreva "Sem complemento" se não houver)' }
  ];

  /* Limpa destaques anteriores */
  fields.forEach(f => highlightField(f.id, true));

  const missing = fields.filter(f => {
    const el = document.getElementById(f.id);
    return !el || !el.value.trim();
  });

  if (missing.length) {
    /* Destaca cada campo vazio */
    missing.forEach(f => highlightField(f.id, false));
    const names = missing.map(f => f.label).join('\n• ');
    alert(`Preencha os campos obrigatórios:\n\n• ${names}`);
    document.getElementById(missing[0].id)?.focus();
    return false;
  }

  const cepVal = document.getElementById('cep').value.replace(/\D/g, '');
  if (cepVal.length !== 8) {
    highlightField('cep', false);
    alert('CEP inválido. Digite os 8 números do CEP.');
    document.getElementById('cep').focus();
    return false;
  }
  return true;
}

/* ============================================================
   FINALIZAR PEDIDO
   ============================================================ */
document.getElementById('finishOrder')?.addEventListener('click', async () => {
  /* Aguarda auth estar pronto (firebase.auth() é assíncrono) */
  if (!window.__authReady) {
    await new Promise(r => {
      const iv = setInterval(() => { if (window.__authReady) { clearInterval(iv); r(); } }, 80);
      setTimeout(() => { clearInterval(iv); r(); }, 5000);
    });
  }

  if (!window.currentUser) {
    if (typeof signInWithGoogle === 'function') signInWithGoogle();
    return;
  }

  const cart = getCart();
  if (!cart.length) {
    alert('Seu carrinho está vazio. Adicione produtos antes de finalizar.');
    return;
  }

  if (!validateFields()) return;

  /* Recalcula total localmente para exibição — backend recalcula independentemente */
  const total = cartTotal();
  if (total <= 0) {
    alert('Total do pedido inválido. Verifique os produtos no carrinho.');
    return;
  }

  /* Valida estoque atual no Firestore para cada item do carrinho */
  const btn = document.getElementById('finishOrder');
  btn.disabled    = true;
  btn.textContent = 'Verificando estoque...';
  try {
    for (const item of cart) {
      const qty = parseInt(item.qty, 10) || 0;
      if (qty < 1) {
        alert(`Quantidade inválida para o produto "${item.name}".`);
        btn.disabled = false; btn.textContent = 'Finalizar pedido'; return;
      }
      const snap = await db.collection('products').doc(item.id).get();
      if (!snap.exists) {
        alert(`Produto "${item.name}" não encontrado. Remova-o do carrinho e tente novamente.`);
        btn.disabled = false; btn.textContent = 'Finalizar pedido'; return;
      }
      const pData = snap.data();
      const stock = pData.stock != null ? parseInt(pData.stock, 10) : (pData.availability === 'available' ? 1 : 0);
      if (stock <= 0) {
        alert(`"${item.name}" está esgotado. Remova-o do carrinho para continuar.`);
        btn.disabled = false; btn.textContent = 'Finalizar pedido'; return;
      }
      if (qty > stock) {
        alert(`"${item.name}": você tem ${qty} no carrinho, mas o estoque disponível é ${stock}. Ajuste a quantidade e tente novamente.`);
        btn.disabled = false; btn.textContent = 'Finalizar pedido'; return;
      }
    }
  } catch (stockErr) {
    console.error('[Checkout] Erro ao verificar estoque:', stockErr);
    alert('Não foi possível verificar o estoque. Verifique sua conexão e tente novamente.');
    btn.disabled = false; btn.textContent = 'Finalizar pedido'; return;
  }

  const fullName    = document.getElementById('fullName').value.trim();
  const whatsapp    = document.getElementById('whatsapp').value.trim();
  const cep         = document.getElementById('cep').value.replace(/\D/g, '');
  const city        = document.getElementById('city').value.trim();
  const estado      = document.getElementById('estado').value.trim();
  const address     = document.getElementById('address').value.trim();
  const numero      = document.getElementById('numero').value.trim();
  const complemento = document.getElementById('complemento').value.trim();

  const order = {
    user_id:         window.currentUser.uid,
    user_email:      window.currentUser.email,
    user_name:       window.currentUser.displayName || fullName,
    full_name:       fullName,
    whatsapp,
    cep,
    city,
    estado,
    address,
    numero,
    complemento,
    items:           cart,
    payment:         'pix',
    total,
    status:          'aguardando_pagamento',
    paymentStatus:   'pending',
    paymentProvider: 'mercadopago',
    paymentMethod:   'pix',
    created_at:      firebase.firestore.FieldValue.serverTimestamp()
  };

  btn.textContent = 'Gerando PIX...';

  try {
    const docRef = await db.collection('orders').add(order);
    _orderId    = docRef.id;
    _orderItems = cart;
    _orderTotal = total;

    db.collection('activity_logs').add({
      type:        'pedido_recebido',
      description: `Novo pedido <strong>#${_orderId.slice(-6)}</strong> de ${fullName}`,
      color:       'green',
      created_at:  firebase.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});

    await initPixPayment(order, cart);

  } catch (err) {
    console.error('[Checkout] Erro ao criar pedido:', err);
    alert('Erro ao processar pedido. Tente novamente.');
    btn.disabled    = false;
    btn.textContent = 'Finalizar pedido';
  }
});

/* ============================================================
   FLUXO PIX — cria pagamento no backend
   ============================================================ */
async function initPixPayment(order, cart) {
  try {
    const res = await fetch(`${API_BASE}/api/mp-create-payment`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        orderId: _orderId,
        items:   cart,
        payer:   { email: order.user_email, name: order.full_name },
        userId:  order.user_id
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    _paymentId = data.paymentId;

    await db.collection('orders').doc(_orderId).update({
      mercadopagoPaymentId: String(_paymentId),
      externalReference:    _orderId,
      total:                data.total  /* total confirmado pelo backend */
    });

    /* Salva sessão para sobreviver a reloads */
    saveSession({
      orderId:      _orderId,
      paymentId:    _paymentId,
      orderItems:   _orderItems,
      orderTotal:   data.total,
      qrCode:       data.qrCode       || null,
      qrCodeBase64: data.qrCodeBase64 || null,
      expiresAt:    data.expiresAt    || null,
      status:       'pending'
    });

    clearCart();
    showPixScreen(data);
    startPolling();

  } catch (err) {
    console.error('[PIX] Erro ao criar pagamento:', err);
    alert(`Erro ao gerar PIX: ${err.message}. Tente novamente.`);
    const btn = document.getElementById('finishOrder');
    if (btn) { btn.disabled = false; btn.textContent = 'Finalizar pedido'; }
  }
}

/* ============================================================
   TELA PIX
   ============================================================ */
function showPixScreen(data) {
  document.getElementById('checkoutForm').style.display = 'none';
  const pixEl = document.getElementById('pixScreen');
  pixEl.style.display = 'block';
  window.scrollTo(0, 0);

  const totalEl = document.getElementById('pixTotal');
  if (totalEl) totalEl.textContent = `R$\u00a0${Number(data.total).toFixed(2).replace('.', ',')}`;

  /* QR Code */
  const qrImg  = document.getElementById('pixQrImg');
  const qrWrap = document.getElementById('pixQrWrap');
  if (qrImg && data.qrCodeBase64) {
    qrImg.src = `data:image/png;base64,${data.qrCodeBase64}`;
  } else if (qrWrap) {
    qrWrap.style.display = 'none';
  }

  /* Copia e cola */
  const codeEl = document.getElementById('pixCode');
  if (codeEl) codeEl.textContent = data.qrCode || '(código indisponível)';

  /* Botão copiar — remove listener anterior clonando */
  const copyBtn = document.getElementById('pixCopyBtn');
  if (copyBtn) {
    const clone = copyBtn.cloneNode(true);
    copyBtn.parentNode.replaceChild(clone, copyBtn);
    clone.addEventListener('click', () => {
      const code = data.qrCode || '';
      if (!code) return;
      navigator.clipboard.writeText(code).then(() => {
        clone.textContent = '✅ Copiado!';
        setTimeout(() => { clone.textContent = '📋 Copiar código PIX'; }, 2000);
      }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = code; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        clone.textContent = '✅ Copiado!';
        setTimeout(() => { clone.textContent = '📋 Copiar código PIX'; }, 2000);
      });
    });
  }

  /* Botão verificar manualmente — remove listener anterior */
  const checkBtn = document.getElementById('pixCheckBtn');
  if (checkBtn) {
    const clone = checkBtn.cloneNode(true);
    checkBtn.parentNode.replaceChild(clone, checkBtn);
    clone.addEventListener('click', () => checkPaymentStatus());
  }

  /* Se sessão já estava aprovada (reload pós-pagamento) */
  const sess = loadSession();
  if (sess && sess.status === 'approved') {
    updatePixStatusUI('approved');
  }
}

/* ============================================================
   POLLING DE STATUS
   ============================================================ */
function startPolling() {
  if (_pollInterval) clearInterval(_pollInterval);
  _pollInterval = setInterval(checkPaymentStatus, 5000);
}

async function checkPaymentStatus() {
  if (!_paymentId) return;
  try {
    const res = await fetch(`${API_BASE}/api/mp-payment-status?paymentId=${_paymentId}`);
    if (!res.ok) return;
    const data = await res.json();
    updatePixStatusUI(data.status);
  } catch (err) {
    console.warn('[Poll] Erro ao verificar status:', err.message);
  }
}

function updatePixStatusUI(status) {
  const statusEl = document.getElementById('pixStatus');
  const waBtn    = document.getElementById('pixWaBtn');

  if (status === 'approved') {
    clearInterval(_pollInterval);
    _pollInterval = null;

    if (statusEl) {
      statusEl.textContent = '✅ Pagamento aprovado!';
      statusEl.className   = 'pix-status pix-status--approved';
    }

    /* Atualiza Firestore */
    if (_orderId) {
      db.collection('orders').doc(_orderId).update({
        status:        'pago',
        paymentStatus: 'approved',
        paidAt:        new Date().toISOString()
      }).catch(() => {});
    }

    /* Persiste estado aprovado na sessão */
    const sess = loadSession();
    if (sess) saveSession({ ...sess, status: 'approved' });

    /* Exibe botão WhatsApp */
    if (waBtn) {
      waBtn.classList.remove('hidden');
      buildWaLink(waBtn);
    }

  } else if (status === 'rejected' || status === 'cancelled') {
    clearInterval(_pollInterval);
    if (statusEl) {
      statusEl.textContent = `❌ Pagamento ${status === 'rejected' ? 'recusado' : 'cancelado'}. Tente novamente.`;
      statusEl.className   = 'pix-status pix-status--rejected';
    }
    if (_orderId) {
      db.collection('orders').doc(_orderId).update({
        status:        'cancelado',
        paymentStatus: status
      }).catch(() => {});
    }
    clearSession();

  } else {
    if (statusEl && !statusEl.classList.contains('pix-status--approved')) {
      statusEl.textContent = 'Aguardando pagamento...';
    }
  }
}

/* ============================================================
   LINK WHATSAPP — só aparece após pagamento aprovado
   ============================================================ */
async function buildWaLink(waBtn) {
  let waNum = '5543996019761'; /* fallback */
  try {
    const cfgSnap = await db.collection('store_settings').doc('main').get();
    if (cfgSnap.exists && cfgSnap.data().whatsapp) {
      waNum = String(cfgSnap.data().whatsapp).replace(/\D/g, '');
    }
  } catch(e) {}

  const items   = _orderItems || [];
  const total   = _orderTotal || 0;
  const orderId = _orderId ? `#${_orderId.slice(-6)}` : '';

  const itensTexto = items.map(i => {
    const price = parseFloat(i.price) || 0;
    const qty   = parseInt(i.qty, 10) || 1;
    return `• ${qty}x ${i.name}${i.size ? ' (' + i.size + ')' : ''} - R$ ${(price * qty).toFixed(2).replace('.', ',')}`;
  }).join('\n');

  const msg = encodeURIComponent(
    `Olá! Gostaria de confirmar meu pedido na Teixeira Style.\n\n` +
    `Pedido: ${orderId}\n\n` +
    `Produtos:\n${itensTexto}\n\n` +
    `Total: R$ ${Number(total).toFixed(2).replace('.', ',')}\n` +
    `Pagamento: PIX\n` +
    `Status: Pago ✅\n\n` +
    `Gostaria de confirmar com vocês como será feito o frete/forma de entrega.\n\n` +
    `Obrigado!`
  );

  waBtn.href = `https://wa.me/${waNum}?text=${msg}`;
  waBtn.addEventListener('click', () => {
    if (_orderId) db.collection('orders').doc(_orderId).update({ whatsappConfirmed: true }).catch(() => {});
    clearSession();
  }, { once: true });
}

/* ============================================================
   RESTAURA SESSÃO APÓS RELOAD
   Evita criar novo pedido/pagamento se usuário recarregou a página
   ============================================================ */
function tryRestoreSession() {
  const sess = loadSession();
  if (!sess || !sess.paymentId || !sess.orderId) return false;

  _orderId    = sess.orderId;
  _paymentId  = sess.paymentId;
  _orderItems = sess.orderItems || [];
  _orderTotal = sess.orderTotal || 0;

  showPixScreen({
    total:       sess.orderTotal,
    qrCode:      sess.qrCode,
    qrCodeBase64: sess.qrCodeBase64
  });

  if (sess.status !== 'approved') {
    startPolling();
  }
  return true;
}

/* ============================================================
   INIT — aguarda carrinho + auth antes de renderizar

   CAUSA RAIZ DO R$ 0,00 (CORRIGIDA):
   auth.js chama loadCartFromFirestore() pelo nome local da função
   (escopo de script), não via window.loadCartFromFirestore.
   Sobrescrever window.loadCartFromFirestore no checkout.js era ineficaz.
   Solução: cart.js dispara o evento 'cartLoaded' após carregar o Firestore.
   checkout.js escuta esse evento para re-renderizar o resumo.
   ============================================================ */
function initCheckout() {
  /* Tenta restaurar sessão de pagamento em andamento */
  if (tryRestoreSession()) return;

  /* Aplica máscaras */
  const cepEl   = document.getElementById('cep');
  const phoneEl = document.getElementById('whatsapp');
  if (cepEl)   maskCep(cepEl);
  if (phoneEl) maskPhone(phoneEl);

  /* 1ª renderização: dados que já estão no localStorage (usuário com sessão ativa) */
  renderSummary();

  /* Escuta o evento disparado por cart.js após loadCartFromFirestore completar.
     Esta é a solução real: auth.js chama loadCartFromFirestore() pelo escopo
     local — sobrescrever window.loadCartFromFirestore era ignorado. */
  window.addEventListener('cartLoaded', () => {
    renderSummary();
  });

  /* Fallback: se o usuário já estava logado e o carrinho já estava
     no localStorage antes do script carregar, renderiza após auth resolver */
  const authPoll = setInterval(() => {
    if (window.__authReady) {
      clearInterval(authPoll);
      renderSummary();
    }
  }, 150);
  /* Timeout máximo de segurança — garante render mesmo em erros de rede */
  setTimeout(() => { clearInterval(authPoll); renderSummary(); }, 7000);
}

initCheckout();
