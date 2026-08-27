/* ============================================================
   TEIXEIRA STYLE — produto.js
   Carrega dados do produto via URL ?id=... (Firestore + fallback estático)
   ============================================================ */

const staticProducts = {
  'camiseta-oversize-preta': { id: 'camiseta-oversize-preta', name: 'Camiseta Oversize Preta', category_name: 'Camisetas', price: '', image_url: 'assets/images/camiseta.png', images: ['assets/images/camiseta.png', 'assets/images/camiseta2.png'], description: 'Camiseta Oversize em malha premium 100% algodão. Corte amplo e confortável, ideal para o dia a dia streetwear. Gramaturas pesadas que garantem caimento perfeito e durabilidade.', sizes: 'P,M,G,GG', availability: 'available', material: '100% Algodão Premium', badge: 'Novo' },
  'moletom-essential-cinza': { id: 'moletom-essential-cinza', name: 'Moletom Essential Cinza', category_name: 'Moletons', price: '', image_url: 'assets/images/camiseta2.png', images: ['assets/images/camiseta2.png', 'assets/images/camiseta.png'], description: 'Moletom Essential com capuz em moletom felpado. Estampa exclusiva Teixeira Style. Peça versátil para looks casuais urbanos com acabamento premium.', sizes: 'M,G,GG,XG', availability: 'available', material: 'Moletom Felpado 380g', badge: '' },
  'bone-trucker-branco': { id: 'bone-trucker-branco', name: 'Boné Trucker Branco', category_name: 'Bonés', price: '', image_url: 'assets/images/camiseta.png', images: ['assets/images/camiseta.png'], description: 'Boné Trucker com tela traseira e bordado frontal exclusivo Teixeira Style. Ajuste snapback universal que se adapta a qualquer tamanho de cabeça.', sizes: 'Único', availability: 'available', material: 'Algodão + Tela', badge: 'Esgotando' },
  'calca-cargo-bege': { id: 'calca-cargo-bege', name: 'Calça Cargo Bege', category_name: 'Calças', price: '', image_url: 'assets/images/camiseta2.png', images: ['assets/images/camiseta2.png'], description: 'Calça Cargo com múltiplos bolsos e cintura ajustável. Tecido sarja resistente e confortável para o dia a dia ativo. Corte relaxed moderno.', sizes: '38,40,42,44', availability: 'available', material: 'Sarja 98% Algodão', badge: 'Novo' },
  'jaqueta-corta-vento-preta': { id: 'jaqueta-corta-vento-preta', name: 'Jaqueta Corta-Vento Preta', category_name: 'Jaquetas', price: '', image_url: 'assets/images/camiseta.png', images: ['assets/images/camiseta.png', 'assets/images/camiseta2.png'], description: 'Jaqueta corta-vento leve e resistente. Zíper duplo e bolsos laterais com fecho. Ideal para transições de clima com estilo urbano.', sizes: 'P,M,G', availability: 'available', material: 'Nylon Ripstop', badge: '' },
  'camiseta-cropped-branca': { id: 'camiseta-cropped-branca', name: 'Camiseta Cropped Branca', category_name: 'Camisetas', price: '', image_url: 'assets/images/camiseta2.png', images: ['assets/images/camiseta2.png', 'assets/images/camiseta.png'], description: 'Camiseta Cropped feminina com estampa gráfica exclusiva. Malha leve e macia perfeita para looks de verão com estilo streetwear autêntico.', sizes: 'P,M,G', availability: 'available', material: '100% Algodão Penteado', badge: 'Novo' },
  'moletom-cropped-nude': { id: 'moletom-cropped-nude', name: 'Moletom Cropped Nude', category_name: 'Moletons', price: '', image_url: 'assets/images/camiseta.png', images: ['assets/images/camiseta.png'], description: 'Moletom Cropped na cor nude com ribana. Peça sofisticada e confortável. Atualmente fora de estoque — entre na lista de espera pelo WhatsApp.', sizes: 'P,M,G', availability: 'unavailable', material: 'Moletom Felpado 320g', badge: '' },
  'mochila-streetwear-preta': { id: 'mochila-streetwear-preta', name: 'Mochila Streetwear Preta', category_name: 'Acessórios', price: '', image_url: 'assets/images/camiseta2.png', images: ['assets/images/camiseta2.png', 'assets/images/camiseta.png'], description: 'Mochila streetwear com compartimentos organizados e estampa exclusiva. Capacidade 25L com suporte para notebook até 15". Material resistente à água.', sizes: 'Único', availability: 'available', material: 'Nylon + Poliéster', badge: 'Novo' },
};

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
    } catch(e) {}
  }
  if (!p) p = staticProducts[id] || null;
  if (!p) { window.location.href = 'catalogo.html'; return; }

  currentProduct = p;
  renderProduct(p);
}

/* --- Render --- */
function renderProduct(p) {
  const available = p.availability === 'available';

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
  document.getElementById('produtoAvail').textContent = available ? 'Disponível' : 'Indisponível';

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
  const user = window.currentUser;
  if (!user) {
    const go = confirm('Faça login com Google para comprar.\nDeseja fazer login agora?');
    if (go && window.signInWithGoogle) signInWithGoogle();
    return;
  }
  if (typeof addToCart === 'function') addToCart(currentProduct, getSize(), currentQty);
  window.location.href = 'checkout.html';
});

/* --- Add to cart --- */
document.getElementById('produtoAddCart')?.addEventListener('click', () => {
  if (!currentProduct) return;
  const user = window.currentUser;
  if (!user) {
    const go = confirm('Faça login com Google para adicionar ao carrinho.\nDeseja fazer login agora?');
    if (go && window.signInWithGoogle) signInWithGoogle();
    return;
  }
  if (typeof addToCart === 'function') addToCart(currentProduct, getSize(), currentQty);
  showToast('Produto adicionado ao carrinho!');
});

/* --- Init --- */
window.addEventListener('DOMContentLoaded', loadProduct);
