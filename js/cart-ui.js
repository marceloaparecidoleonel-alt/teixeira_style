/* ============================================================
   TEIXEIRA STYLE — UI da Página Carrinho
   ============================================================ */

const itemsEl = document.getElementById('cartItems');
const emptyEl = document.getElementById('cartEmpty');
const contentEl = document.getElementById('cartContent');
const subtotalEl = document.getElementById('subtotal');
const totalEl = document.getElementById('total');

function renderCart() {
  const cart = getCart();
  if (!cart.length) {
    emptyEl.classList.remove('hidden');
    contentEl.classList.add('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  contentEl.classList.remove('hidden');

  itemsEl.innerHTML = cart.map((item, idx) => `
    <div class="cart-item">
      <img src="${item.image_url || 'assets/images/camiseta.png'}" alt="${item.name}" class="cart-item__img" />
      <div class="cart-item__info">
        <h3 class="cart-item__name">${item.name}</h3>
        <p class="cart-item__size">Tamanho: ${item.size}</p>
        <p class="cart-item__price">R$ ${Number(item.price).toFixed(2).replace('.', ',')}</p>
        <div class="cart-item__qty">
          <button class="qty-btn" data-idx="${idx}" data-delta="-1">-</button>
          <span>${item.qty}</span>
          <button class="qty-btn" data-idx="${idx}" data-delta="1">+</button>
        </div>
      </div>
      <button class="cart-item__remove" data-idx="${idx}">✕</button>
    </div>
  `).join('');

  const sub = cartTotal();
  subtotalEl.textContent = `R$ ${sub.toFixed(2).replace('.', ',')}`;
  totalEl.textContent = `R$ ${sub.toFixed(2).replace('.', ',')}`;
}

itemsEl?.addEventListener('click', e => {
  const btn = e.target.closest('.qty-btn');
  const rm = e.target.closest('.cart-item__remove');
  if (btn) {
    const idx = parseInt(btn.dataset.idx);
    const delta = parseInt(btn.dataset.delta);
    const cart = getCart();
    if (cart[idx]) {
      cart[idx].qty += delta;
      if (cart[idx].qty < 1) cart[idx].qty = 1;
      saveCart(cart);
      renderCart();
    }
  }
  if (rm) {
    const idx = parseInt(rm.dataset.idx);
    const cart = getCart();
    const item = cart[idx];
    if (item) {
      removeFromCart(item.id, item.size);
      renderCart();
    }
  }
});

document.getElementById('clearCartBtn')?.addEventListener('click', () => {
  if (confirm('Limpar todo o carrinho?')) { clearCart(); renderCart(); }
});

document.getElementById('checkoutBtn')?.addEventListener('click', e => {
  if (!window.currentUser) {
    e.preventDefault();
    alert('Faça login com Google para continuar para o pagamento.');
  }
});

renderCart();
