/* ============================================================
   TEIXEIRA STYLE — Carrinho (localStorage + Firestore sync)
   Cada carrinho é isolado pelo UID do Firebase Authentication.
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

/* clearLocalCart: limpa SOMENTE o estado local (localStorage + UI).
   Usado no logout para evitar que o carrinho de uma conta apareça para outra.
   NÃO apaga os dados do Firestore — o carrinho da conta permanece salvo. */
function clearLocalCart() {
  localStorage.removeItem(CART_KEY);
  if (typeof updateCartCount === 'function') updateCartCount();
  if (typeof renderCart === 'function') renderCart();
}

/* clearCart: alias público que limpa local e sincroniza exclusão ao Firestore.
   Usado quando o usuário clica em "Limpar carrinho" intencionalmente. */
async function clearCart() {
  localStorage.removeItem(CART_KEY);
  if (typeof updateCartCount === 'function') updateCartCount();
  if (typeof renderCart === 'function') renderCart();
  const user = window.currentUser;
  if (user && db) {
    try {
      await db.collection('carts').doc(user.uid).set(
        { items: [], updated_at: firebase.firestore.FieldValue.serverTimestamp() }
      );
    } catch (e) { console.error('Clear cart Firestore error:', e); }
  }
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

/* loadCartFromFirestore: limpa o localStorage ANTES de carregar os dados do Firestore.
   Isso impede que dados da conta anterior contaminem a sessão da nova conta. */
async function loadCartFromFirestore() {
  const user = window.currentUser;
  if (!user || !db) return;
  /* Limpa estado local imediatamente para evitar vazamento entre contas */
  localStorage.removeItem(CART_KEY);
  if (typeof updateCartCount === 'function') updateCartCount();
  try {
    const doc = await db.collection('carts').doc(user.uid).get();
    if (doc.exists) {
      const data = doc.data();
      const items = (data.items && Array.isArray(data.items)) ? data.items : [];
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    } else {
      localStorage.setItem(CART_KEY, '[]');
    }
    if (typeof updateCartCount === 'function') updateCartCount();
    if (typeof renderCart === 'function') renderCart();
  } catch (e) { console.error('Load cart error:', e); }
}

window.loadCartFromFirestore = loadCartFromFirestore;
window.getCart = getCart;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateQty = updateQty;
window.clearCart = clearCart;
window.clearLocalCart = clearLocalCart;
window.cartTotal = cartTotal;
window.syncCartToFirestore = syncCartToFirestore;
