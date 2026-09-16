/* ============================================================
   TEIXEIRA STYLE — Histórico de Pedidos do Cliente
   ============================================================ */

const db = window.fbDb;
const listEl = document.getElementById('ordersList');

async function loadOrders(user) {
  if (!listEl) return;
  if (!user) {
    listEl.innerHTML = '<p class="orders-empty">Faça login para ver seus pedidos.</p>';
    return;
  }
  listEl.innerHTML = '<p class="orders-empty">Carregando...</p>';
  try {
    const snap = await db.collection('orders')
      .where('user_id', '==', user.uid)
      .get();
    if (snap.empty) {
      listEl.innerHTML = '<p class="orders-empty">Nenhum pedido encontrado.</p>';
      return;
    }
    /* Ordena do mais recente para o mais antigo no cliente (evita índice composto) */
    const docs = snap.docs.slice().sort((a, b) => {
      const ta = a.data().created_at?.seconds || 0;
      const tb = b.data().created_at?.seconds || 0;
      return tb - ta;
    });
    const statusMap = {
      aguardando_confirmacao: 'Aguardando confirmação',
      aguardando_pagamento:   'Aguardando pagamento PIX',
      pago:                   '✅ Pago',
      cancelado:              '❌ Cancelado',
      reembolsado:            'Reembolsado',
      enviado:                '🚚 Enviado',
      entregue:               '📦 Entregue'
    };
    /* Recupera estoque não baixado para pedidos pagos (em background, não bloqueia render) */
    docs.forEach(doc => {
      const o = doc.data();
      if (o.status === 'pago' && !o.stockDecremented && Array.isArray(o.items)) {
        recoverMissingStockDecrement(doc.id, o.items);
      }
    });

    listEl.innerHTML = docs.map(doc => {
      const o        = doc.data();
      const d        = o.created_at ? new Date(o.created_at.seconds * 1000).toLocaleDateString('pt-BR') : '-';
      const status   = statusMap[o.status] || o.status || '-';
      const payLabel = o.payment === 'pix' ? 'PIX' : (o.payment === 'mercadopago' ? 'Mercado Pago' : 'WhatsApp');
      const itemsHtml = Array.isArray(o.items)
        ? o.items.map(i => `<p>• ${i.qty}x ${i.name}${i.size ? ' (' + i.size + ')' : ''}</p>`).join('')
        : '';
      return `
        <div class="order-card">
          <div class="order-card__header">
            <span class="order-card__id">#${doc.id.slice(-6)}</span>
            <span class="order-card__status order-card__status--${o.status}">${status}</span>
          </div>
          <div class="order-card__meta"><span>${d}</span><span>${payLabel}</span></div>
          <div class="order-card__items">${itemsHtml}</div>
          <div class="order-card__total">Total: R$ ${Number(o.total || 0).toFixed(2).replace('.', ',')}</div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('[Pedidos]', err);
    listEl.innerHTML = '<p class="orders-empty">Erro ao carregar pedidos.</p>';
  }
}

/* ============================================================
   Recuperação retroativa de estoque:
   Se um pedido está "pago" mas stockDecremented != true,
   a baixa não ocorreu (polling não estava ativo quando aprovado).
   Corrige aqui usando o SDK autenticado do cliente.
   ============================================================ */
async function recoverMissingStockDecrement(orderId, items) {
  if (!db || !orderId || !Array.isArray(items) || !items.length) return;
  try {
    const orderSnap = await db.collection('orders').doc(orderId).get();
    if (!orderSnap.exists) return;
    const d = orderSnap.data();
    if (d.stockDecremented === true) return; /* já foi feito */
    if (d.status !== 'pago') return;         /* só para pedidos pagos */

    /* Marca primeiro para evitar duplicação */
    await db.collection('orders').doc(orderId).update({ stockDecremented: true });

    for (const item of items) {
      const productId = item.id || item.productId;
      const qty       = parseInt(item.qty, 10) || 0;
      if (!productId || qty <= 0) continue;
      try {
        await db.runTransaction(async tx => {
          const ref  = db.collection('products').doc(productId);
          const snap = await tx.get(ref);
          if (!snap.exists) return;
          const data     = snap.data();
          const current  = data.stock != null ? parseInt(data.stock, 10) : 0;
          if (current <= 0) return;
          tx.update(ref, { stock: Math.max(0, current - qty) });
        });
      } catch(e) { console.warn('[Stock recovery]', productId, e.message); }
    }
    console.log('[Stock recovery] Estoque recuperado para pedido', orderId);
  } catch(e) { console.warn('[Stock recovery] Erro:', e.message); }
}

/* Usa o user recebido diretamente pelo callback — evita race condition
   com window.currentUser que pode não estar definido ainda */
window.fbAuth?.onAuthStateChanged(user => loadOrders(user));
