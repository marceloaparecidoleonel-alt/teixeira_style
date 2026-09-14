/* ============================================================
   TEIXEIRA STYLE — Checkout (PIX via Mercado Pago)
   ============================================================ */

const db = window.fbDb;

/* ---- Estado global do checkout ---- */
let _orderId      = null;
let _paymentId    = null;
let _pollInterval = null;
let _orderItems   = null;
let _orderTotal   = 0;

/* ---- Detecta se está rodando local ou em produção ---- */
const _IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE  = _IS_LOCAL ? '' : '';  /* mesmo domínio em ambos os casos */

/* ============================================================
   RENDERIZAR RESUMO DO CARRINHO
   ============================================================ */
const itemsEl = document.getElementById('checkoutItems');
const totalEl = document.getElementById('totalPrice');

function renderSummary() {
  const cart = getCart();
  if (!cart.length) {
    if (itemsEl) itemsEl.innerHTML = '<p style="color:#888">Carrinho vazio.</p>';
    if (totalEl) totalEl.textContent = 'R$ 0,00';
    return;
  }
  if (itemsEl) {
    itemsEl.innerHTML = cart.map(item => `
      <div class="checkout-item">
        <span>${item.qty}x ${item.name} (${item.size})</span>
        <span>R$ ${(item.price * item.qty).toFixed(2).replace('.', ',')}</span>
      </div>
    `).join('');
  }
  if (totalEl) totalEl.textContent = `R$ ${cartTotal().toFixed(2).replace('.', ',')}`;
}

/* ---- Mostra/oculta info do WhatsApp conforme método selecionado ---- */
document.querySelectorAll('input[name="payment"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const infoBox  = document.getElementById('whatsappInfoBox');
    const note     = document.getElementById('checkoutNote');
    const isWa     = radio.value === 'whatsapp';
    if (infoBox) infoBox.style.display = isWa ? '' : 'none';
    if (note)    note.textContent = isWa
      ? 'Ao finalizar, você será redirecionado ao WhatsApp.'
      : 'Pagamento via PIX — QR Code gerado após confirmar.';
  });
});

/* ============================================================
   FINALIZAR PEDIDO
   ============================================================ */
document.getElementById('finishOrder')?.addEventListener('click', async () => {
  /* Garante que auth está pronto */
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
  if (!cart.length) { alert('Seu carrinho está vazio.'); return; }

  const fullName = document.getElementById('fullName')?.value.trim();
  const whatsapp = document.getElementById('whatsapp')?.value.trim();
  const city     = document.getElementById('city')?.value.trim();
  const address  = document.getElementById('address')?.value.trim();

  if (!fullName || !whatsapp || !city || !address) {
    alert('Preencha todos os dados de entrega.');
    return;
  }

  const payment = document.querySelector('input[name="payment"]:checked')?.value || 'pix';
  const total   = cartTotal();

  /* Monta dados do pedido */
  const order = {
    user_id:         window.currentUser.uid,
    user_email:      window.currentUser.email,
    user_name:       window.currentUser.displayName || fullName,
    full_name:       fullName,
    whatsapp,
    city,
    address,
    items:           cart,
    payment:         payment,
    total,
    status:          payment === 'pix' ? 'aguardando_pagamento' : 'aguardando_confirmacao',
    paymentStatus:   payment === 'pix' ? 'pending' : null,
    paymentProvider: payment === 'pix' ? 'mercadopago' : null,
    paymentMethod:   payment === 'pix' ? 'pix' : null,
    created_at:      firebase.firestore.FieldValue.serverTimestamp()
  };

  const btn = document.getElementById('finishOrder');
  btn.disabled = true;
  btn.textContent = 'Processando...';

  try {
    /* Salva o pedido no Firestore */
    const docRef = await db.collection('orders').add(order);
    _orderId    = docRef.id;
    _orderItems = cart;
    _orderTotal = total;

    /* Log de atividade */
    db.collection('activity_logs').add({
      type: 'pedido_recebido',
      description: `Novo pedido <strong>#${_orderId.slice(-6)}</strong> de ${order.full_name}`,
      color: 'green',
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});

    if (payment === 'pix') {
      await initPixPayment(order, cart);
    } else {
      /* Fluxo WhatsApp existente */
      await handleWhatsappFlow(order, _orderId, cart, total);
    }

  } catch (err) {
    console.error('[Checkout] Erro:', err);
    alert('Erro ao processar pedido. Tente novamente.');
    btn.disabled = false;
    btn.textContent = 'Finalizar pedido';
  }
});

/* ============================================================
   FLUXO PIX
   ============================================================ */
async function initPixPayment(order, cart) {
  try {
    const res = await fetch(`${API_BASE}/api/mp-create-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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

    /* Atualiza o pedido com o ID do pagamento */
    await db.collection('orders').doc(_orderId).update({
      mercadopagoPaymentId: String(_paymentId),
      externalReference:    _orderId
    });

    /* Limpa carrinho somente após pagamento criado com sucesso */
    clearCart();

    /* Exibe tela PIX */
    showPixScreen(data);

    /* Inicia polling de status a cada 5s */
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
  document.getElementById('pixScreen').style.display = 'block';
  window.scrollTo(0, 0);

  /* Valor */
  const totalEl = document.getElementById('pixTotal');
  if (totalEl) totalEl.textContent = `R$ ${Number(data.total).toFixed(2).replace('.', ',')}`;

  /* QR Code */
  const qrImg = document.getElementById('pixQrImg');
  if (qrImg && data.qrCodeBase64) {
    qrImg.src = `data:image/png;base64,${data.qrCodeBase64}`;
  } else if (qrImg) {
    document.getElementById('pixQrWrap').style.display = 'none';
  }

  /* Código copia e cola */
  const codeEl = document.getElementById('pixCode');
  if (codeEl) codeEl.textContent = data.qrCode || '';

  /* Botão copiar */
  document.getElementById('pixCopyBtn')?.addEventListener('click', () => {
    const code = data.qrCode || '';
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      const btn = document.getElementById('pixCopyBtn');
      if (btn) { btn.textContent = '✅ Copiado!'; setTimeout(() => { btn.textContent = '📋 Copiar código PIX'; }, 2000); }
    }).catch(() => {
      /* Fallback para browsers antigos */
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  });

  /* Botão verificar manualmente */
  document.getElementById('pixCheckBtn')?.addEventListener('click', () => checkPaymentStatus());
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
    updatePixStatusUI(data.status, data.statusDetail);
  } catch (err) {
    /* Não interrompe o polling por erro de rede */
    console.warn('[Poll] Erro ao verificar status:', err.message);
  }
}

function updatePixStatusUI(status, statusDetail) {
  const statusEl = document.getElementById('pixStatus');
  const waBtn    = document.getElementById('pixWaBtn');

  if (status === 'approved') {
    /* Para o polling */
    clearInterval(_pollInterval);
    _pollInterval = null;

    /* Atualiza UI */
    if (statusEl) {
      statusEl.textContent = '✅ Pagamento aprovado!';
      statusEl.className = 'pix-status pix-status--approved';
    }

    /* Atualiza Firestore (confirmação adicional no cliente) */
    if (_orderId) {
      db.collection('orders').doc(_orderId).update({
        status:        'pago',
        paymentStatus: 'approved',
        paidAt:        new Date().toISOString()
      }).catch(() => {});
    }

    /* Exibe botão do WhatsApp */
    if (waBtn) {
      waBtn.classList.remove('hidden');
      buildWaLink(waBtn);
    }

  } else if (status === 'rejected' || status === 'cancelled') {
    clearInterval(_pollInterval);
    if (statusEl) {
      statusEl.textContent = `❌ Pagamento ${status === 'rejected' ? 'recusado' : 'cancelado'}. Tente novamente.`;
      statusEl.className = 'pix-status pix-status--rejected';
    }
    if (_orderId) {
      db.collection('orders').doc(_orderId).update({
        status:        'cancelado',
        paymentStatus: status
      }).catch(() => {});
    }
  } else {
    if (statusEl && !statusEl.classList.contains('pix-status--approved')) {
      statusEl.textContent = 'Aguardando pagamento...';
    }
  }
}

/* ============================================================
   LINK WHATSAPP PÓS-PAGAMENTO
   ============================================================ */
async function buildWaLink(waBtn) {
  let waNum = '5543996019761'; /* fallback */
  try {
    const cfgSnap = await db.collection('store_settings').doc('main').get();
    if (cfgSnap.exists && cfgSnap.data().whatsapp) {
      waNum = String(cfgSnap.data().whatsapp).replace(/\D/g, '');
    }
  } catch(e) { /* usa fallback */ }

  const items   = _orderItems || getCart();
  const total   = _orderTotal || cartTotal();
  const orderId = _orderId ? `#${_orderId.slice(-6)}` : '';

  const itensTexto = items.map(i =>
    `• ${i.qty}x ${i.name} (${i.size}) - R$ ${(i.price * i.qty).toFixed(2).replace('.', ',')}`
  ).join('\n');

  const msg = encodeURIComponent(
    `Olá! Gostaria de confirmar meu pedido na Teixeira Style.\n\n` +
    `Pedido: ${orderId}\n\n` +
    `Produtos:\n${itensTexto}\n\n` +
    `Total: R$ ${Number(total).toFixed(2).replace('.', ',')}\n` +
    `Pagamento: PIX\n` +
    `Status: Pago ✅\n\n` +
    `Gostaria de confirmar com vocês como será feito o frete/forma de entrega e combinar os detalhes da entrega.\n\n` +
    `Obrigado!`
  );

  waBtn.href = `https://wa.me/${waNum}?text=${msg}`;

  /* Registra que o cliente clicou no WhatsApp */
  waBtn.addEventListener('click', () => {
    if (_orderId) {
      db.collection('orders').doc(_orderId).update({ whatsappConfirmed: true }).catch(() => {});
    }
  }, { once: true });
}

/* ============================================================
   FLUXO WHATSAPP (mantém comportamento original)
   ============================================================ */
async function handleWhatsappFlow(order, orderId, cart, total) {
  /* Notificação WhatsApp para o dono */
  try {
    const cfgSnap = await db.collection('store_settings').doc('main').get();
    const cfg = cfgSnap.exists ? cfgSnap.data() : {};
    if (cfg.notifyWhatsapp && cfg.whatsapp) {
      const ownerNum = String(cfg.whatsapp).replace(/\D/g, '');
      const itensNot = cart.map(i => `• ${i.qty}x ${i.name} (${i.size}) - R$ ${(i.price * i.qty).toFixed(2).replace('.', ',')}`).join('\n');
      const notifMsg = encodeURIComponent(
        `🛍️ *Novo pedido #${orderId.slice(-6)}* recebido no site!\n\n` +
        `👤 Cliente: ${order.full_name}\n📱 WhatsApp: ${order.whatsapp}\n📍 Cidade: ${order.city}\n\n` +
        `🛒 Itens:\n${itensNot}\n\n💰 Total: R$ ${total.toFixed(2).replace('.', ',')}\n💳 Pagamento: WhatsApp`
      );
      window.open(`https://wa.me/${ownerNum}?text=${notifMsg}`, '_blank');
    }
  } catch(e) {}

  clearCart();

  const itensTexto = cart.map(i =>
    `• ${i.qty}x ${i.name} (${i.size}) - R$ ${(i.price * i.qty).toFixed(2).replace('.', ',')}`
  ).join('\n');

  const msg = encodeURIComponent(
    `Olá! Finalizei o pedido *#${orderId.slice(-6)}* no site.\n\n` +
    itensTexto +
    `\n\nTotal: R$ ${total.toFixed(2).replace('.', ',')}\nNome: ${order.full_name}\nEndereço: ${order.address}, ${order.city}`
  );

  let waNum = '5543996019761';
  try {
    const cfgSnap = await db.collection('store_settings').doc('main').get();
    if (cfgSnap.exists && cfgSnap.data().whatsapp) waNum = String(cfgSnap.data().whatsapp).replace(/\D/g, '');
  } catch(e) {}

  window.open(`https://wa.me/${waNum}?text=${msg}`, '_blank');
  window.location.href = 'pedidos.html';
}

/* ============================================================
   INIT
   ============================================================ */
renderSummary();
