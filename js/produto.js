/* ============================================================
   TEIXEIRA STYLE — produto.js
   Carrega dados do produto via URL ?id=... do Firestore
   ============================================================ */


let currentProduct = null;
let currentQty = 1;

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
  currentQty++;
  document.getElementById('qtyVal').textContent = currentQty;
});

/* --- Get selected size --- */
function getSize() {
  const sel = document.querySelector('.produto-size-btn.selected');
  return sel ? sel.dataset.size : 'Único';
}

/* --- Buy now --- */
document.getElementById('produtoBuyNow')?.addEventListener('click', () => {
  if (!currentProduct) return;
  if (!window.currentUser) {
    /* Salva a ação para ser executada automaticamente após o login */
    window.__pendingCartAction = {
      type: 'buyNow',
      product: currentProduct,
      size: getSize(),
      qty: currentQty
    };
    if (typeof signInWithGoogle === 'function') signInWithGoogle();
    return;
  }
  if (typeof addToCart === 'function') addToCart(currentProduct, getSize(), currentQty);
  window.location.href = 'checkout.html';
});

/* --- Add to cart --- */
document.getElementById('produtoAddCart')?.addEventListener('click', () => {
  if (!currentProduct) return;
  if (!window.currentUser) {
    /* Salva a ação para ser executada automaticamente após o login */
    window.__pendingCartAction = {
      type: 'addToCart',
      product: currentProduct,
      size: getSize(),
      qty: currentQty,
      onSuccess: () => showToast('Produto adicionado ao carrinho!')
    };
    if (typeof signInWithGoogle === 'function') signInWithGoogle();
    return;
  }
  if (typeof addToCart === 'function') addToCart(currentProduct, getSize(), currentQty);
  showToast('Produto adicionado ao carrinho!');
});

/* --- Init --- */
window.addEventListener('DOMContentLoaded', loadProduct);
