/* ============================================================
   TEIXEIRA STYLE — Carrinho (localStorage + Firestore sync)
   ============================================================ */

const db = window.fbDb;

const CART_KEY = 'ts_cart';

function getCart() {
  return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  if (typeof updateCartCount === 'function') updateCartCount();
  syncCartToFirestore();
}

function addToCart(product, size, qty = 1) {
  const cart = getCart();
  const existing = cart.find(i => i.id === product.id && i.size === size);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      image_url: product.image_url || '',
      price: product.price || 0,
      size,
      qty
    });
  }
  saveCart(cart);
}

function removeFromCart(productId, size) {
  let cart = getCart();
  cart = cart.filter(i => !(i.id === productId && i.size === size));
  saveCart(cart);
}

function updateQty(productId, size, qty) {
  const cart = getCart();
  const item = cart.find(i => i.id === productId && i.size === size);
  if (!item) return;
  item.qty = Math.max(1, parseInt(qty) || 1);
  saveCart(cart);
}

function clearCart() {
  localStorage.removeItem(CART_KEY);
  if (typeof updateCartCount === 'function') updateCartCount();
}

function cartTotal() {
  return getCart().reduce((sum, i) => sum + (i.price * i.qty), 0);
}

/* ---- Sync com Firestore quando logado ---- */
async function syncCartToFirestore() {
  const user = window.currentUser || (window.fbAuth && window.fbAuth.currentUser);
  if (!user || !db) return;
  try {
    await db.collection('carts').doc(user.uid).set({
      items: getCart(),
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) { console.error('Sync cart error:', e); }
}

async function loadCartFromFirestore() {
  const user = window.currentUser;
  if (!user || !db) return;
  try {
    const doc = await db.collection('carts').doc(user.uid).get();
    if (doc.exists) {
      const data = doc.data();
      if (data.items && data.items.length) {
        localStorage.setItem(CART_KEY, JSON.stringify(data.items));
        if (typeof updateCartCount === 'function') updateCartCount();
      }
    }
  } catch (e) { console.error('Load cart error:', e); }
}
window.loadCartFromFirestore = loadCartFromFirestore;
window.getCart = getCart;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateQty = updateQty;
window.clearCart = clearCart;
window.cartTotal = cartTotal;
window.syncCartToFirestore = syncCartToFirestore;
