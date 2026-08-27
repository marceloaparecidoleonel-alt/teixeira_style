/* ============================================================
   TEIXEIRA STYLE — Checkout
   ============================================================ */

const db = window.fbDb;
const itemsEl = document.getElementById('checkoutItems');
const totalEl = document.getElementById('totalPrice');

/* ============================================================
   RENDERIZAR RESUMO
   ============================================================ */
function renderSummary() {
  const cart = getCart();
  if (!cart.length) {
    itemsEl.innerHTML = '<p style="color:#888">Carrinho vazio.</p>';
    totalEl.textContent = 'R$ 0,00';
    return;
  }
  itemsEl.innerHTML = cart.map(item => `
    <div class="checkout-item">
      <span>${item.qty}x ${item.name} (${item.size})</span>
      <span>R$ ${(item.price * item.qty).toFixed(2).replace('.', ',')}</span>
    </div>
  `).join('');
  totalEl.textContent = `R$ ${cartTotal().toFixed(2).replace('.', ',')}`;
}

/* ============================================================
   MERCADO PAGO — STUB PARA INTEGRAÇÃO FUTURA
   ------------------------------------------------------------
   Para ativar:
   1. Criar backend (ex. Cloud Function ou Node.js) que chame
      POST https://api.mercadopago.com/checkout/preferences
      com o token de acesso da conta.
   2. Retornar o preference_id ao frontend.
   3. Renderizar o botão de pagamento com mp.checkout({...}).
   4. Ouvir o retorno pelo webhook /mp-webhook (salvar no Firestore).
   5. Remover o atributo `disabled` do radio Mercado Pago em checkout.html.
   6. Descomentar o SDK em checkout.html.

   Referência: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/
   ============================================================ */
async function processMercadoPago(order, orderId) {
  /* TODO: chamar seu backend para criar a preferência de pagamento
  const res = await fetch('/api/mp/create-preference', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: order.items.map(i => ({
        title: `${i.name} (${i.size})`,
        unit_price: i.price,
        quantity: i.qty,
        currency_id: 'BRL'
      })),
      payer: { email: order.user_email, name: order.full_name },
      external_reference: orderId,
      back_urls: {
        success: `${location.origin}/pedidos.html?status=success&id=${orderId}`,
        failure: `${location.origin}/checkout.html?status=failure`,
        pending: `${location.origin}/pedidos.html?status=pending&id=${orderId}`
      },
      auto_return: 'approved',
      notification_url: `${location.origin}/api/mp-webhook`
    })
  });
  const { preferenceId } = await res.json();
  window.mp.checkout({ preference: { id: preferenceId }, render: { container: '#mp-button', label: 'Pagar com Mercado Pago' } });
  */
  console.warn('[MP] processMercadoPago chamado — integração pendente. orderId:', orderId);
}

/* ============================================================
   FINALIZAR PEDIDO
   ============================================================ */
document.getElementById('finishOrder')?.addEventListener('click', async () => {
  if (!window.currentUser) {
    alert('Faça login para finalizar o pedido.');
    return;
  }
  const cart = getCart();
  if (!cart.length) { alert('Seu carrinho está vazio.'); return; }

  const fullName = document.getElementById('fullName').value.trim();
  const whatsapp = document.getElementById('whatsapp').value.trim();
  const city     = document.getElementById('city').value.trim();
  const address  = document.getElementById('address').value.trim();

  if (!fullName || !whatsapp || !city || !address) {
    alert('Preencha todos os dados de entrega.');
    return;
  }

  const payment = document.querySelector('input[name="payment"]:checked')?.value || 'whatsapp';
  const total   = cartTotal();

  const order = {
    user_id:    window.currentUser.uid,
    user_email: window.currentUser.email,
    user_name:  window.currentUser.displayName || fullName,
    full_name:  fullName,
    whatsapp,
    city,
    address,
    items:   cart,
    payment,
    total,
    /* Status inicial:
       - 'aguardando_confirmacao' para WhatsApp (loja confirma manualmente)
       - 'aguardando_pagamento' será usado quando Mercado Pago estiver ativo */
    status: 'aguardando_confirmacao',
    created_at: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    const docRef = await db.collection('orders').add(order);
    clearCart();

    if (payment === 'mercadopago') {
      /* TODO: quando integração estiver ativa, chamar processMercadoPago ao invés de redirecionar */
      await processMercadoPago(order, docRef.id);
      return;
    }

    /* WhatsApp — fluxo ativo */
    const itensTexto = cart
      .map(i => `• ${i.qty}x ${i.name} (${i.size}) - R$ ${(i.price * i.qty).toFixed(2).replace('.', ',')}`)
      .join('%0A');

    const msg = encodeURIComponent(
      `Olá! Finalizei o pedido *#${docRef.id.slice(-6)}* no site.\n\n` +
      cart.map(i => `• ${i.qty}x ${i.name} (${i.size}) - R$ ${(i.price * i.qty).toFixed(2).replace('.', ',')}`).join('\n') +
      `\n\nTotal: R$ ${total.toFixed(2).replace('.', ',')}\n` +
      `Nome: ${fullName}\nEndereço: ${address}, ${city}`
    );

    window.open(`https://wa.me/5543996019761?text=${msg}`, '_blank');
    window.location.href = 'pedidos.html';

  } catch (err) {
    console.error(err);
    alert('Erro ao finalizar pedido. Tente novamente.');
  }
});

renderSummary();
