/* ============================================================
   TEIXEIRA STYLE — CATÁLOGO JS
   ============================================================ */

const API_BASE = '/api';
const grid        = document.getElementById('productGrid');
const catBtns    = document.querySelectorAll('.cat-btn');
const searchInput = document.getElementById('searchInput');
const sortSelect  = document.getElementById('sortSelect');
const noResults   = document.getElementById('noResults');
const resultCount = document.getElementById('resultCount');

let allProducts = [];
let currentCat  = 'todos';
let currentSearch = '';

/* ---- LOAD PRODUCTS FROM API ---- */
async function loadProducts() {
  try {
    const db = window.fbDb;
    if (!db) throw new Error('Firebase not ready');
    const snap = await db.collection('products').where('status', '==', 'active').get();
    const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (data.length > 0) {
      allProducts = data;
      renderProducts();
    } else {
      if (resultCount) resultCount.textContent = '0';
      if (noResults) noResults.classList.remove('hidden');
    }
  } catch (err) {
    console.error('Failed to load products:', err);
    if (resultCount) resultCount.textContent = '0';
    if (noResults) noResults.classList.remove('hidden');
  }
}

/* ---- RENDER PRODUCTS ---- */
function renderProducts() {
  let filtered = allProducts.filter(p => {
    const slug = p.category_slug || (p.category_name ? p.category_name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-') : '');
    const matchCat = currentCat === 'todos' || slug === currentCat;
    const matchSearch = p.name.toLowerCase().includes(currentSearch) || (p.reference_code && p.reference_code.toLowerCase().includes(currentSearch));
    return matchCat && matchSearch;
  });

  /* sort */
  if (sortSelect.value === 'az') {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortSelect.value === 'za') {
    filtered.sort((a, b) => b.name.localeCompare(a.name));
  } else if (sortSelect.value === 'new') {
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  /* render */
  if (filtered.length === 0) {
    grid.innerHTML = '';
    noResults.classList.remove('hidden');
  } else {
    noResults.classList.add('hidden');
    grid.innerHTML = filtered.map(p => createProductCard(p)).join('');
  }

  resultCount.textContent = filtered.length;
}

/* ---- CREATE PRODUCT CARD ---- */
function createProductCard(product) {
  const catSlug = product.category_slug || (product.category_name ? product.category_name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-') : '');
  const availabilityClass = product.availability === 'available' ? 'available' : 'unavailable';
  const availabilityText = product.availability === 'available' ? 'Disponível' : 'Indisponível';
  const price = product.price ? `R$ ${Number(product.price).toFixed(2).replace('.', ',')}` : '';
  const unavailable = product.availability !== 'available';

  return `
    <article class="product-card" data-cat="${catSlug}" data-name="${product.name}" data-id="${product.id}" onclick="window.location.href='produto.html?id=${product.id}'" style="cursor:pointer">
      <div class="product-card__img-wrap">
        <img src="${product.image_url || 'assets/images/camiseta.png'}" alt="${product.name}" class="product-card__img" loading="lazy" />
        <div class="product-card__overlay">
          ${unavailable
            ? `<button type="button" class="product-card__cta product-card__cta--disabled" disabled>Indisponível</button>`
            : `<button type="button" class="product-card__cta product-card__cta--buy" onclick="event.stopPropagation(); window.location.href='produto.html?id=${product.id}&action=buy'">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 001.98 1.61h9.72a2 2 0 001.98-1.61L23 6H6"/></svg>
                Comprar
              </button>
              <button type="button" class="product-card__cta product-card__cta--cart" onclick="event.stopPropagation(); window.location.href='produto.html?id=${product.id}'">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Carrinho
              </button>`
          }
        </div>
        ${product.status === 'active' ? '<span class="product-card__badge">Novo</span>' : ''}
      </div>
      <div class="product-card__info">
        <p class="product-card__cat">${product.category_name || 'Geral'}</p>
        <h3 class="product-card__name">${product.name}</h3>
        ${price ? `<span class="product-card__price">${price}</span>` : ''}
        <div class="product-card__sizes">
          ${product.sizes ? product.sizes.split(',').map(s => `<span class="size-tag">${s.trim()}</span>`).join('') : '<span class="size-tag">Único</span>'}
        </div>
        <span class="product-card__status ${availabilityClass}">${availabilityText}</span>
      </div>
    </article>
  `;
}


/* ---- PRODUCT MODAL ---- */
let currentModalProduct = null;

async function openProductModal(id, action = 'cart') {
  const db = window.fbDb;
  let p = null;

  if (db) {
    try {
      const doc = await db.collection('products').doc(id).get();
      if (doc.exists) p = { id: doc.id, ...doc.data() };
    } catch(e) {}
  }

  if (!p) return;

  currentModalProduct = p;

  const img = document.getElementById('modalImg');
  const title = document.getElementById('modalTitle');
  const cat = document.getElementById('modalCat');
  const desc = document.getElementById('modalDesc');
  const price = document.getElementById('modalPrice');
  const sizes = document.getElementById('modalSizes');
  const addBtn = document.getElementById('modalAddToCart');
  const materialEl = document.getElementById('modalMaterial');
  const availEl = document.getElementById('modalAvail');

  img.src = p.image_url || 'assets/images/camiseta.png';
  img.alt = p.name;
  title.textContent = p.name;
  cat.textContent = p.category_name || 'Geral';
  desc.textContent = p.description || 'Sem descrição.';
  price.textContent = p.price ? `R$ ${Number(p.price).toFixed(2).replace('.', ',')}` : 'Consultar preço';
  if (materialEl) materialEl.textContent = p.material || '100% Algodão Premium';
  if (availEl) availEl.textContent = p.availability === 'available' ? 'Disponível' : 'Indisponível';

  const sizeArr = p.sizes ? p.sizes.split(',').map(s => s.trim()).filter(Boolean) : ['Único'];
  sizes.innerHTML = sizeArr.map(s => `<button type="button" class="modal-size" data-size="${s}">${s}</button>`).join('');
  sizes.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      sizes.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
  if (sizes.firstElementChild) sizes.firstElementChild.classList.add('selected');

  const buyBtn = document.getElementById('modalBuyNow');

  if (p.availability !== 'available') {
    addBtn.disabled = true;
    addBtn.textContent = 'Indisponível';
    if (buyBtn) { buyBtn.disabled = true; buyBtn.textContent = 'Indisponível'; }
  } else {
    addBtn.disabled = false;
    addBtn.textContent = 'Adicionar ao carrinho';
    if (buyBtn) { buyBtn.disabled = false; buyBtn.textContent = 'Comprar agora'; }
  }

  document.getElementById('productModal').classList.remove('hidden');

  if (action === 'buy' && buyBtn && !buyBtn.disabled) {
    buyBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function closeProductModal() {
  document.getElementById('productModal').classList.add('hidden');
  currentModalProduct = null;
}

function getSelectedSize() {
  const sel = document.querySelector('#modalSizes .modal-size.selected');
  return sel ? sel.dataset.size : 'Único';
}

document.getElementById('modalAddToCart')?.addEventListener('click', () => {
  if (!currentModalProduct || currentModalProduct.availability !== 'available') return;
  if (!window.currentUser) {
    /* Salva a ação para ser executada automaticamente após o login */
    window.__pendingCartAction = {
      type: 'addToCart',
      product: currentModalProduct,
      size: getSelectedSize(),
      qty: 1,
      onSuccess: () => showToastModal('Produto adicionado ao carrinho!')
    };
    if (typeof signInWithGoogle === 'function') signInWithGoogle();
    return;
  }
  addToCart(currentModalProduct, getSelectedSize(), 1);
  showToastModal('Produto adicionado ao carrinho!');
});

document.getElementById('modalBuyNow')?.addEventListener('click', () => {
  if (!currentModalProduct || currentModalProduct.availability !== 'available') return;
  if (!window.currentUser) {
    window.__pendingCartAction = {
      type: 'buyNow',
      product: currentModalProduct,
      size: getSelectedSize(),
      qty: 1
    };
    if (typeof signInWithGoogle === 'function') signInWithGoogle();
    return;
  }
  addToCart(currentModalProduct, getSelectedSize(), 1);
  window.location.href = 'checkout.html';
});

function showToastModal(msg) {
  const toast = document.getElementById('modalToast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2000);
}

document.getElementById('modalClose')?.addEventListener('click', closeProductModal);
document.getElementById('productModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeProductModal();
});

/* ---- CATEGORY FILTER ---- */
function bindCatBtns() {
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCat = btn.dataset.cat;
      renderProducts();
    });
  });
}

async function loadCategoryFilters() {
  const container = document.getElementById('catFilters');
  if (!container) { bindCatBtns(); return; }
  const db = window.fbDb;
  if (!db) { bindCatBtns(); return; }
  try {
    const snap = await db.collection('categories').orderBy('name').get();
    if (snap.empty) { bindCatBtns(); return; }
    /* Monta botões a partir do Firestore */
    const btns = ['<button class="cat-btn active" data-cat="todos">Todos</button>'];
    snap.docs.forEach(doc => {
      const c = doc.data();
      const slug = c.slug || (c.name ? c.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'') : '');
      btns.push(`<button class="cat-btn" data-cat="${slug}">${c.name}</button>`);
    });
    container.innerHTML = btns.join('');
  } catch {
    /* Se falhar, mantém os botões estáticos do HTML */
  }
  bindCatBtns();
}

/* ---- SEARCH ---- */
searchInput.addEventListener('input', () => {
  currentSearch = searchInput.value.toLowerCase().trim();
  renderProducts();
});

/* ---- SORT ---- */
sortSelect.addEventListener('change', renderProducts);

/* ---- NAVBAR SCROLL SHADOW ---- */
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.style.boxShadow = window.scrollY > 10
    ? '0 4px 24px rgba(0,0,0,0.5)'
    : 'none';
}, { passive: true });

/* ---- INIT ---- */
loadCategoryFilters().then(loadProducts);
