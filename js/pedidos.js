/* ============================================================
   TEIXEIRA STYLE — Histórico de Pedidos do Cliente
   ============================================================ */

const db = window.fbDb;
const listEl = document.getElementById('ordersList');

async function loadOrders() {
  const user = window.currentUser;
  if (!user) {
    listEl.innerHTML = '<p class="orders-empty">Faça login para ver seus pedidos.</p>';
    return;
  }
  listEl.innerHTML = '<p class="orders-empty">Carregando...</p>';
  try {
    const snap = await db.collection('orders').where('user_id', '==', user.uid).orderBy('created_at', 'desc').get();
    if (snap.empty) {
      listEl.innerHTML = '<p class="orders-empty">Nenhum pedido encontrado.</p>';
      return;
    }
    listEl.innerHTML = snap.docs.map(doc => {
      const o = doc.data();
      const d = o.created_at ? new Date(o.created_at.seconds * 1000).toLocaleDateString('pt-BR') : '-';
      const status = { aguardando_confirmacao: 'Aguardando confirmação', aguardando_pagamento: 'Aguardando pagamento', pago: 'Pago', enviado: 'Enviado', entregue: 'Entregue' }[o.status] || o.status;
      return `
        <div class="order-card">
          <div class="order-card__header">
            <span class="order-card__id">#${doc.id.slice(-6)}</span>
            <span class="order-card__status order-card__status--${o.status}">${status}</span>
          </div>
          <div class="order-card__meta"><span>${d}</span><span>${o.payment === 'pix' ? 'PIX' : 'WhatsApp'}</span></div>
          <div class="order-card__items">
            ${o.items.map(i => `<p>• ${i.qty}x ${i.name} (${i.size})</p>`).join('')}
          </div>
          <div class="order-card__total">Total: R$ ${Number(o.total).toFixed(2).replace('.', ',')}</div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
    listEl.innerHTML = '<p class="orders-empty">Erro ao carregar pedidos.</p>';
  }
}

window.fbAuth?.onAuthStateChanged(() => loadOrders());
