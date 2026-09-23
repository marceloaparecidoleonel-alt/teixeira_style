/* ============================================================
   TEIXEIRA STYLE — Checkout (PIX via Mercado Pago)
   ============================================================ */

/* Getter dinâmico: evita race condition onde window.fbDb é undefined
   no momento do parse do script mas já está disponível quando as
   funções são chamadas. */
const _checkoutDb = new Proxy({}, {
  get(_, prop) {
    const db = window.fbDb;
    if (!db) throw new Error('[Checkout] Firebase ainda não inicializado');
    return typeof db[prop] === 'function' ? db[prop].bind(db) : db[prop];
  }
});
/* Em localhost o Live Server (porta 5500) não processa /api — redireciona para o
   Express local na porta 3000. Em produção (Vercel) usa mesmo domínio. */
const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:3000'
  : '';

/* ---- Estado da sessão de pagamento ---- */
let _orderId         = null;
let _paymentId       = null;
let _pollInterval    = null;
let _orderItems      = null;
let _orderTotal      = 0;
let _isCreatingOrder  = false; /* guarda contra duplo clique */
let _paymentApproved  = false; /* true após pagamento confirmado — evita re-poll */

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

/* ============================================================
   AUTO-PREENCHIMENTO DE CEP VIA VIACEP
   ============================================================ */
function setupCepAutoFill(cepEl) {
  const cityEl   = document.getElementById('city');
  const estadoEl = document.getElementById('estado');
  if (!cepEl || !cityEl || !estadoEl) return;

  let _lastCep  = '';
  let _abort    = null;

  function lookupCep() {
    const digits = cepEl.value.replace(/\D/g, '');
    if (digits.length !== 8) return;
    if (digits === _lastCep) return; /* mesmo CEP — não repete */
    _lastCep = digits;

    /* Cancela requisição anterior se ainda em curso */
    if (_abort) { _abort.abort(); }
    _abort = new AbortController();

    fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: _abort.signal })
      .then(r => r.json())
      .then(data => {
        if (data.erro) return; /* CEP não encontrado — deixa usuário preencher */
        if (data.localidade && !cityEl.value.trim()) {
          cityEl.value = data.localidade;
        }
        if (data.uf) {
          const opt = [...estadoEl.options].find(o => o.value === data.uf || o.text === data.uf);
          if (opt) estadoEl.value = opt.value;
        }
      })
      .catch(e => {
        if (e.name !== 'AbortError') {
          console.warn('[CEP] Falha na consulta:', e.message);
        }
      });
  }

  /* Dispara ao sair do campo */
  cepEl.addEventListener('blur', lookupCep);

  /* Dispara também quando o usuário termina de digitar os 8 dígitos no input */
  cepEl.addEventListener('input', () => {
    const digits = cepEl.value.replace(/\D/g, '');
    if (digits.length === 8) lookupCep();
    /* Se o CEP foi apagado, reseta o último CEP para permitir nova consulta */
    if (digits.length === 0) _lastCep = '';
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
  /* Proteção contra duplo clique / chamada simultânea */
  if (_isCreatingOrder) return;

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

  /* Garante que qualquer sessão pendente abandonada seja descartada antes de criar novo pedido */
  clearSession();
  if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; }

  /* Valida estoque atual no Firestore para cada item do carrinho */
  _isCreatingOrder = true;
  const btn = document.getElementById('finishOrder');
  btn.disabled    = true;
  btn.textContent = 'Verificando estoque...';
  try {
    for (const item of cart) {
      const qty = parseInt(item.qty, 10) || 0;
      if (qty < 1) {
        alert(`Quantidade inválida para o produto "${item.name}".`);
        btn.disabled = false; btn.textContent = 'Finalizar pedido'; _isCreatingOrder = false; return;
      }
      const snap = await _checkoutDb.collection('products').doc(item.id).get();
      if (!snap.exists) {
        alert(`Produto "${item.name}" não encontrado. Remova-o do carrinho e tente novamente.`);
        btn.disabled = false; btn.textContent = 'Finalizar pedido'; _isCreatingOrder = false; return;
      }
      const pData = snap.data();
      const stock = pData.stock != null ? parseInt(pData.stock, 10) : (pData.availability === 'available' ? 1 : 0);
      if (stock <= 0) {
        alert(`"${item.name}" está esgotado. Remova-o do carrinho para continuar.`);
        btn.disabled = false; btn.textContent = 'Finalizar pedido'; _isCreatingOrder = false; return;
      }
      if (qty > stock) {
        alert(`"${item.name}": você tem ${qty} no carrinho, mas o estoque disponível é ${stock}. Ajuste a quantidade e tente novamente.`);
        btn.disabled = false; btn.textContent = 'Finalizar pedido'; _isCreatingOrder = false; return;
      }
    }
  } catch (stockErr) {
    console.error('[Checkout] Erro ao verificar estoque:', stockErr);
    alert('Não foi possível verificar o estoque. Verifique sua conexão e tente novamente.');
    btn.disabled = false; btn.textContent = 'Finalizar pedido'; _isCreatingOrder = false; return;
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
    const docRef = await _checkoutDb.collection('orders').add(order);
    _orderId    = docRef.id;
    _orderItems = cart;
    _orderTotal = total;

    _checkoutDb.collection('activity_logs').add({
      type:        'pedido_recebido',
      description: `Novo pedido <strong>#${_orderId.slice(-6)}</strong> de ${fullName}`,
      color:       'green',
      created_at:  firebase.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});

    /* Atualiza dados de endereço/contato no perfil do cliente (para o painel admin) */
    _checkoutDb.collection('clients').doc(window.currentUser.uid).set({
      telefone:      whatsapp,
      cidade:        city,
      estado:        estado,
      endereco:      address ? `${address}${numero ? ', ' + numero : ''}` : '',
      complemento:   complemento,
      cep:           cep,
      ultimo_acesso: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(() => {});

    await initPixPayment(order, cart);

  } catch (err) {
    console.error('[Checkout] Erro ao criar pedido:', err);
    alert('Erro ao processar pedido. Tente novamente.');
    btn.disabled    = false;
    btn.textContent = 'Finalizar pedido';
    _isCreatingOrder = false;
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

    await _checkoutDb.collection('orders').doc(_orderId).update({
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
      savedAt:      Date.now(),         /* timestamp para detectar sessão expirada */
      status:       'pending'
    });

    await clearCart();
    showPixScreen(data);
    startPolling();
    /* Libera guarda somente depois de tudo estar montado */
    _isCreatingOrder = false;

  } catch (err) {
    console.error('[PIX] Erro ao criar pagamento:', err);
    /* Limpa sessão parcial para não contaminar próxima tentativa */
    clearSession();
    alert(`Erro ao gerar PIX: ${err.message}. Tente novamente.`);
    const btn = document.getElementById('finishOrder');
    if (btn) { btn.disabled = false; btn.textContent = 'Finalizar pedido'; }
    _isCreatingOrder = false;
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
  /* Timeout máximo de 35 minutos — PIX expira em 30min */
  setTimeout(() => {
    if (_pollInterval && !_paymentApproved) {
      clearInterval(_pollInterval);
      _pollInterval = null;
      console.log('[Poll] Timeout de 35min atingido — polling encerrado.');
    }
  }, 35 * 60 * 1000);
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
    _paymentApproved = true;

    if (statusEl) {
      statusEl.textContent = '✅ Pagamento aprovado!';
      statusEl.className   = 'pix-status pix-status--approved';
    }

    /* Atualiza Firestore */
    if (_orderId) {
      _checkoutDb.collection('orders').doc(_orderId).update({
        status:        'pago',
        paymentStatus: 'approved',
        paidAt:        new Date().toISOString()
      }).catch(() => {});

      /* Baixa de estoque — ocorre uma única vez por pedido (idempotência via stockDecremented) */
      _decrementStockOnce(_orderId, _orderItems).catch(e =>
        console.warn('[Checkout/Stock] Erro ao baixar estoque:', e.message)
      );
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
      _checkoutDb.collection('orders').doc(_orderId).update({
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
    const cfgSnap = await _checkoutDb.collection('store_settings').doc('main').get();
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

  /* Recupera dados de entrega do formulário (ainda na página) ou da sessão */
  const fullName    = document.getElementById('fullName')?.value.trim()    || '';
  const whatsapp    = document.getElementById('whatsapp')?.value.trim()    || '';
  const address     = document.getElementById('address')?.value.trim()     || '';
  const numero      = document.getElementById('numero')?.value.trim()      || '';
  const complemento = document.getElementById('complemento')?.value.trim() || '';
  const city        = document.getElementById('city')?.value.trim()        || '';
  const estado      = document.getElementById('estado')?.value.trim()      || '';
  const cep         = document.getElementById('cep')?.value.trim()         || '';

  const enderecoTexto = address
    ? `${address}${numero ? ', ' + numero : ''}${complemento && complemento !== 'Sem complemento' ? ' - ' + complemento : ''}, ${city} - ${estado}, CEP: ${cep}`
    : 'Não informado';

  const msg = encodeURIComponent(
    `Olá! Gostaria de confirmar meu pedido na Teixeira Style.\n\n` +
    `Pedido: ${orderId}\n` +
    `Cliente: ${fullName || 'Não informado'}\n` +
    `WhatsApp: ${whatsapp || 'Não informado'}\n\n` +
    `Produtos:\n${itensTexto}\n\n` +
    `Total: R$ ${Number(total).toFixed(2).replace('.', ',')}\n` +
    `Pagamento: PIX\n` +
    `Status: Pago ✅\n\n` +
    `Endereço de entrega:\n${enderecoTexto}\n\n` +
    `Obrigado!`
  );

  waBtn.href = `https://wa.me/${waNum}?text=${msg}`;
  waBtn.addEventListener('click', () => {
    if (_orderId) _checkoutDb.collection('orders').doc(_orderId).update({ whatsappConfirmed: true }).catch(() => {});
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

  /* Sessão já aprovada: não mostrar tela PIX de novo, apenas limpar */
  if (sess.status === 'approved') {
    clearSession();
    return false;
  }

  /* Sessão muito antiga (> 35 min sem pagar) = expirada, descarta.
     NÃO cancelar automaticamente no Firestore: o pagamento pode ter sido
     aprovado enquanto a página estava fechada. O cron cancel-expired-orders
     é o responsável por cancelar pedidos realmente não pagos. */
  const MAX_AGE_MS = 35 * 60 * 1000;
  if (sess.savedAt && (Date.now() - sess.savedAt) > MAX_AGE_MS) {
    console.log('[Checkout] Sessão PIX expirada — descartando (sem cancelar no Firestore).');
    clearSession();
    return false;
  }

  /* Sessão obsoleta: total salvo não bate com o carrinho atual.
     Isso indica que o cliente abandonou e voltou com itens diferentes
     (ou o carrinho mudou). Descarta a sessão velha para evitar R$X errado.
     NÃO cancela no Firestore: o pagamento pode já ter sido aprovado. */
  const currentTotal = (typeof cartTotal === 'function') ? cartTotal() : 0;
  if (currentTotal > 0 && Math.abs((sess.orderTotal || 0) - currentTotal) > 0.01) {
    console.log(`[Checkout] Total da sessão (${sess.orderTotal}) ≠ carrinho atual (${currentTotal}) — descartando.`);
    clearSession();
    return false;
  }

  _orderId    = sess.orderId;
  _paymentId  = sess.paymentId;
  _orderItems = sess.orderItems || [];
  _orderTotal = sess.orderTotal || 0;

  showPixScreen({
    total:        sess.orderTotal,
    qrCode:       sess.qrCode,
    qrCodeBase64: sess.qrCodeBase64
  });

  /* Verifica status imediatamente ao restaurar — captura pagamentos aprovados
     enquanto a página estava fechada. _orderId é zerado por updatePixStatusUI
     quando approved, então usamos isso como sinal. */
  checkPaymentStatus().then(() => {
    /* Inicia polling apenas se pagamento ainda não foi aprovado */
    if (!_paymentApproved) startPolling();
  }).catch(() => { if (!_paymentApproved) startPolling(); });

  return true;
}

/* ============================================================
   BAIXA DE ESTOQUE — executada pelo cliente autenticado via SDK
   (o SDK já possui o token do usuário logado, que satisfaz as
   regras do Firestore: allow write if request.auth != null)

   Idempotência: lê stockDecremented do pedido antes de agir.
   Se já for true, aborta. Caso contrário, marca true e subtrai.
   Estoque nunca fica negativo: Math.max(0, atual - qty).
   ============================================================ */
async function _decrementStockOnce(orderId, items) {
  if (!orderId || !items || !items.length) return;

  const db = window.fbDb;
  if (!db) { console.warn('[Stock] Firebase não pronto, abortando baixa de estoque'); return; }

  /* 1. Lê o pedido para verificar idempotência */
  const orderSnap = await db.collection('orders').doc(orderId).get();
  if (!orderSnap.exists) return;
  if (orderSnap.data().stockDecremented === true) {
    console.log('[Stock] Estoque já baixado para pedido', orderId, '— ignorando.');
    return;
  }

  /* 2. Marca idempotência antes de subtrair */
  await db.collection('orders').doc(orderId).update({ stockDecremented: true });

  /* 3. Subtrai estoque de cada item atomicamente */
  for (const item of items) {
    const productId = item.id || item.productId;
    const qty       = parseInt(item.qty, 10) || 0;
    if (!productId || qty <= 0) continue;

    try {
      await db.runTransaction(async tx => {
        const prodRef  = db.collection('products').doc(productId);
        const prodSnap = await tx.get(prodRef);
        if (!prodSnap.exists) return;

        const data     = prodSnap.data();
        const current  = data.stock != null
          ? parseInt(data.stock, 10)
          : (data.availability === 'available' ? 1 : 0);

        if (current <= 0) return; /* já esgotado */

        const newStock = Math.max(0, current - qty);
        tx.update(prodRef, { stock: newStock });
        console.log(`[Stock] Produto ${productId}: ${current} → ${newStock} (−${qty})`);
      });
    } catch (e) {
      console.error('[Stock] Erro na transação do produto', productId, ':', e.message);
    }
  }

  console.log('[Stock] Baixa concluída para pedido', orderId);
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
  if (cepEl)   setupCepAutoFill(cepEl);
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
