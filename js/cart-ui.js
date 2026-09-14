/* ============================================================
   TEIXEIRA STYLE — UI da Página Carrinho
   ============================================================ */

const itemsEl = document.getElementById('cartItems');
const emptyEl = document.getElementById('cartEmpty');
const contentEl = document.getElementById('cartContent');
const subtotalEl = document.getElementById('subtotal');
const totalEl = document.getElementById('total');

function showCartToast(msg) {
  let toast = document.getElementById('cartStockToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'cartStockToast';
    toast.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#C9A66B;color:#0B0B0F;padding:.65rem 1.4rem;border-radius:4px;font-weight:600;z-index:9999;font-size:.9rem;pointer-events:none;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.display = 'none'; }, 2500);
}

function renderCart() {
  const cart = getCart();
  if (!cart.length) {
    emptyEl.classList.remove('hidden');
    contentEl.classList.add('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  contentEl.classList.remove('hidden');

  itemsEl.innerHTML = cart.map((item, idx) => {
    const stock = item.stock != null ? parseInt(item.stock, 10) : Infinity;
    const atMax = stock !== Infinity && item.qty >= stock;
    return `
    <div class="cart-item">
      <img src="${item.image_url || 'assets/images/camiseta.png'}" alt="${item.name}" class="cart-item__img" />
      <div class="cart-item__info">
        <h3 class="cart-item__name">${item.name}</h3>
        <p class="cart-item__size">Tamanho: ${item.size}</p>
        <p class="cart-item__price">R$ ${Number(item.price).toFixed(2).replace('.', ',')}</p>
        <div class="cart-item__qty">
          <button class="qty-btn" data-idx="${idx}" data-delta="-1">-</button>
          <span>${item.qty}</span>
          <button class="qty-btn" data-idx="${idx}" data-delta="1" ${atMax ? 'data-maxstock="1"' : ''} style="${atMax ? 'opacity:.4;cursor:not-allowed' : ''}">+</button>
        </div>
        ${atMax ? '<p style="font-size:.72rem;color:#C9A66B;margin:.25rem 0 0">Máximo em estoque</p>' : ''}
      </div>
      <button class="cart-item__remove" data-idx="${idx}">✕</button>
    </div>`;
  }).join('');

  const sub = cartTotal();
  subtotalEl.textContent = `R$ ${sub.toFixed(2).replace('.', ',')}`;
  totalEl.textContent = `R$ ${sub.toFixed(2).replace('.', ',')}`;
}

itemsEl?.addEventListener('click', e => {
  const btn = e.target.closest('.qty-btn');
  const rm = e.target.closest('.cart-item__remove');
  if (btn) {
    const idx   = parseInt(btn.dataset.idx);
    const delta = parseInt(btn.dataset.delta);
    const cart  = getCart();
    if (!cart[idx]) return;
    const item  = cart[idx];
    const stock = item.stock != null ? parseInt(item.stock, 10) : Infinity;

    if (delta > 0 && stock !== Infinity && item.qty >= stock) {
      showCartToast(`Limite de estoque atingido: ${stock} un.`);
      return;
    }

    item.qty += delta;
    if (item.qty < 1) item.qty = 1;
    /* Garante que não ultrapassa o estoque mesmo com manipulação direta */
    if (stock !== Infinity && item.qty > stock) item.qty = stock;

    saveCart(cart);
    renderCart();
  }
  if (rm) {
    const idx  = parseInt(rm.dataset.idx);
    const cart = getCart();
    const item = cart[idx];
    if (item) { removeFromCart(item.id, item.size); renderCart(); }
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
