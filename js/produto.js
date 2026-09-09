/* ============================================================
   TEIXEIRA STYLE — produto.js
   Carrega dados do produto via URL ?id=... do Firestore
   ============================================================ */


let currentProduct = null;
let currentQty = 1;
let currentStock = 0;

/* --- Helpers --- */
function getParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

function showToast(msg) {
  const t = document.getElementById('produtoToast');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2500);
}

/* --- Load product --- */
async function loadProduct() {
  const id = getParam('id');
  if (!id) { window.location.href = 'catalogo.html'; return; }

  let p = null;
  const db = window.fbDb;
  if (db) {
    try {
      const doc = await db.collection('products').doc(id).get();
      if (doc.exists) p = { id: doc.id, ...doc.data() };
    } catch(e) { console.error('Erro ao carregar produto:', e); }
  }
  if (!p) { window.location.href = 'catalogo.html'; return; }

  currentProduct = p;
  renderProduct(p);
}

/* --- Render --- */
function renderProduct(p) {
  const stockQty = p.stock != null ? p.stock : (p.availability === 'available' ? 1 : 0);
  const available = stockQty > 0;
  currentStock = stockQty;
  currentQty = 1;
  const qtyVal = document.getElementById('qtyVal');
  if (qtyVal) qtyVal.textContent = '1';

  document.title = `${p.name} — Teixeira Style`;

  /* Breadcrumb */
  const breadCat = document.getElementById('breadCat');
  const breadName = document.getElementById('breadName');
  if (breadCat) breadCat.textContent = p.category_name || 'Catálogo';
  if (breadName) breadName.textContent = p.name;

  /* Main image */
  const img = document.getElementById('produtoImg');
  img.src = p.image_url || 'assets/images/camiseta.png';
  img.alt = p.name;

  /* Badge */
  const badge = document.getElementById('produtoBadge');
  if (badge) badge.textContent = p.badge || '';

  /* Thumbnails */
  const thumbs = document.getElementById('produtoThumbs');
  const images = p.images || [p.image_url || 'assets/images/camiseta.png'];
  if (thumbs && images.length > 1) {
    thumbs.innerHTML = images.map((src, i) =>
      `<img src="${src}" alt="Foto ${i+1}" class="produto-thumb${i === 0 ? ' active' : ''}" data-src="${src}" />`
    ).join('');
    thumbs.querySelectorAll('.produto-thumb').forEach(t => {
      t.addEventListener('click', () => {
        img.src = t.dataset.src;
        thumbs.querySelectorAll('.produto-thumb').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
      });
    });
  }

  /* Info */
  document.getElementById('produtoCat').textContent = p.category_name || 'Geral';
  document.getElementById('produtoTitle').textContent = p.name;
  document.getElementById('produtoDesc').textContent = p.description || '';
  document.getElementById('produtoPrice').textContent = p.price
    ? `R$ ${Number(p.price).toFixed(2).replace('.', ',')}`
    : 'Consultar preço';

  document.getElementById('produtoMaterial').textContent = p.material || '100% Algodão';
  document.getElementById('produtoAvail').textContent = available ? `${stockQty} un.` : 'Esgotado';

  /* Sizes */
  const sizesEl = document.getElementById('produtoSizes');
  const sizeArr = p.sizes ? p.sizes.split(',').map(s => s.trim()).filter(Boolean) : ['Único'];
  sizesEl.innerHTML = sizeArr.map(s =>
    `<button type="button" class="produto-size-btn" data-size="${s}">${s}</button>`
  ).join('');
  sizesEl.querySelectorAll('.produto-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sizesEl.querySelectorAll('.produto-size-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
  if (sizesEl.firstElementChild) sizesEl.firstElementChild.classList.add('selected');

  /* Action buttons */
  const buyBtn = document.getElementById('produtoBuyNow');
  const cartBtn = document.getElementById('produtoAddCart');
  if (!available) {
    buyBtn.disabled = true;
    cartBtn.disabled = true;
    buyBtn.textContent = 'Indisponível';
    cartBtn.textContent = 'Indisponível';
  }

  /* Show page */
  document.getElementById('produtoLoading').style.display = 'none';
  document.getElementById('produtoPage').classList.remove('hidden');
}

/* --- Qty --- */
document.getElementById('qtyMinus')?.addEventListener('click', () => {
  if (currentQty > 1) { currentQty--; document.getElementById('qtyVal').textContent = currentQty; }
});
document.getElementById('qtyPlus')?.addEventListener('click', () => {
  if (currentStock > 0 && currentQty >= currentStock) {
    showToast(`Estoque máximo: ${currentStock} un.`);
    return;
  }
  currentQty++;
  document.getElementById('qtyVal').textContent = currentQty;
});

/* --- Get selected size --- */
function getSize() {
  const sel = document.querySelector('.produto-size-btn.selected');
  return sel ? sel.dataset.size : 'Único';
}

/* --- Helper: pede login se necessário --- */
function requireLogin(pendingAction) {
  window.__pendingCartAction = pendingAction;
  /* Tenta abrir o popup de login */
  if (typeof signInWithGoogle === 'function') {
    signInWithGoogle();
  }
  /* Mensagem visual */
  showToast('Faça login para continuar');
  /* Destaca o botão de login na navbar */
  const authBtn = document.querySelector('.auth-btn');
  if (authBtn) {
    authBtn.style.outline = '2px solid #C9A66B';
    authBtn.style.borderRadius = '4px';
    setTimeout(() => { authBtn.style.outline = ''; }, 2500);
    authBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/* --- Aguarda auth estar pronto e executa a ação --- */
function whenAuthReady(fn) {
  if (window.__authReady) { fn(); return; }
  const iv = setInterval(() => {
    if (window.__authReady) { clearInterval(iv); fn(); }
  }, 80);
  setTimeout(() => clearInterval(iv), 5000);
}

/* --- Buy now --- */
document.getElementById('produtoBuyNow')?.addEventListener('click', () => {
  if (!currentProduct) return;
  const size = getSize();
  whenAuthReady(() => {
    if (!window.currentUser) {
      requireLogin({ type: 'buyNow', product: currentProduct, size, qty: currentQty });
      return;
    }
    if (typeof addToCart === 'function') addToCart(currentProduct, size, currentQty);
    window.location.href = 'checkout.html';
  });
});

/* --- Add to cart --- */
document.getElementById('produtoAddCart')?.addEventListener('click', () => {
  if (!currentProduct) return;
  const size = getSize();
  whenAuthReady(() => {
    if (!window.currentUser) {
      requireLogin({
        type: 'addToCart',
        product: currentProduct,
        size,
        qty: currentQty,
        onSuccess: () => showToast('Produto adicionado ao carrinho!')
      });
      return;
    }
    if (typeof addToCart === 'function') addToCart(currentProduct, size, currentQty);
    showToast('Produto adicionado ao carrinho!');
  });
});

/* --- Init --- */
window.addEventListener('DOMContentLoaded', loadProduct);
