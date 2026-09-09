/* ============================================================
   TEIXEIRA STYLE — ADMIN PANEL (Firebase + Cloudinary)
   ============================================================ */

const auth    = window.fbAuth;
const db      = window.fbDb;

/* ---- Cloudinary config (apenas Cloud Name e Upload Preset — NUNCA coloque API Secret aqui) ---- */
const CLOUDINARY_CLOUD_NAME    = 'dvin8hkmv';
const CLOUDINARY_UPLOAD_PRESET = 'teixeira_produtos';
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

/* ============================================================
   LIMITES DE CATÁLOGO — fonte única de verdade
   Ajuste aqui para refletir em todo o sistema.
   ============================================================ */
const CATALOG_LIMITS = {
  MAX_PRODUCTS:          100,   /* máximo de produtos no catálogo      */
  MAX_IMAGES_PER_PRODUCT:  4,   /* máximo de fotos por produto          */
  MAX_TOTAL_IMAGES:      400,   /* 100 produtos × 4 fotos               */
  MAX_IMAGE_SIZE_MB:       5,   /* tamanho máximo por arquivo (MB)      */
  ALLOWED_FORMATS: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
};
const MAX_IMAGE_SIZE_BYTES = CATALOG_LIMITS.MAX_IMAGE_SIZE_MB * 1024 * 1024;

/* Arquivos novos selecionados aguardando upload (feito somente no submit) */
let pendingImageFiles = [];   /* File[]  — novas imagens selecionadas     */
let existingImageUrls = [];   /* string[] — URLs já existentes (edição)  */

let editingProductId  = null;
let _uploadInProgress = false;

/* ---- DOM REFS ---- */
const loginScreen = document.getElementById('loginScreen');
const adminPanel  = document.getElementById('adminPanel');

/* ============================================================
   UTILITÁRIOS
   ============================================================ */
function makeSlug(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

let toastTimer;
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast' + (type === 'error' ? ' toast--error' : '');
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
}

function setTodayDate() {
  const el = document.getElementById('todayDate');
  if (!el) return;
  el.textContent = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

function getSelectedSizes() {
  return Array.from(document.querySelectorAll('#productForm .size-check input:checked'))
    .map(cb => cb.closest('.size-check').querySelector('span').textContent).join(',');
}

function setSelectedSizes(sizesStr) {
  const sizes = (sizesStr || '').split(',').map(s => s.trim());
  document.querySelectorAll('#productForm .size-check input').forEach(cb => {
    cb.checked = sizes.includes(cb.closest('.size-check').querySelector('span').textContent);
  });
}

/* ============================================================
   AUTH — Google + verificação de ADMIN_EMAIL
   ============================================================ */

const ADMIN_EMAIL = 'teixeirastyle@gmail.com';

function isAdminEmail(email) {
  return typeof email === 'string' && email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

/* Impede que o painel seja inicializado mais de uma vez na mesma sessão */
let _adminPanelReady = false;

function _showAdminPanel(user) {
  loginScreen.classList.add('hidden');
  adminPanel.classList.remove('hidden');
  const nameEl   = document.querySelector('.topbar-username');
  const avatarEl = document.querySelector('.topbar-avatar');
  const firstName = user.displayName ? user.displayName.split(' ')[0] : user.email;
  if (nameEl) nameEl.textContent = firstName;
  if (avatarEl) {
    if (user.photoURL) {
      avatarEl.innerHTML = `<img src="${user.photoURL}" alt="${firstName}" referrerpolicy="no-referrer" />`;
    } else {
      avatarEl.textContent = firstName.charAt(0).toUpperCase();
    }
  }
  if (!_adminPanelReady) {
    _adminPanelReady = true;
    setTodayDate();
    loadDashboard();
  }
}

function _showLoginScreen(msg) {
  loginScreen.classList.remove('hidden');
  adminPanel.classList.add('hidden');
  _adminPanelReady = false;
  if (msg) {
    const errEl = document.getElementById('loginError');
    if (errEl) { errEl.textContent = msg; setTimeout(() => { errEl.textContent = ''; }, 4000); }
  }
}

auth.onAuthStateChanged(async user => {
  if (user) {
    if (isAdminEmail(user.email)) {
      _showAdminPanel(user);
    } else {
      /* Não é administrador: mostra tela de login e encerra a sessão.
         IMPORTANTE: signOut() é chamado FORA do fluxo síncrono do listener
         para evitar loop onAuthStateChanged → signOut → onAuthStateChanged. */
      _showLoginScreen('Acesso não autorizado para este e-mail.');
      setTimeout(() => auth.signOut(), 0);
    }
  } else {
    _showLoginScreen();
  }
});

/* Botão de login com Google na tela de login do admin */
let _adminLoginInProgress = false;

document.getElementById('adminGoogleBtn')?.addEventListener('click', async () => {
  if (_adminLoginInProgress) return;
  _adminLoginInProgress = true;
  const errEl = document.getElementById('loginError');
  if (errEl) errEl.textContent = '';
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await auth.signInWithPopup(provider);
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
      console.error('Admin login error:', err.code, err.message);
      if (errEl) errEl.textContent = 'Erro ao autenticar. Tente novamente.';
    }
  } finally {
    _adminLoginInProgress = false;
  }
});

/* Logout: encerra sessão e redireciona para o site público */
document.getElementById('logoutBtn').addEventListener('click', async () => {
  _adminPanelReady = false;
  await auth.signOut();
  window.location.href = 'index.html';
});

/* ============================================================
   NAVIGATION
   ============================================================ */
function goToPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar__link').forEach(l => l.classList.remove('active'));
  const page = document.getElementById(`page-${pageId}`);
  if (page) page.classList.add('active');
  const link = document.querySelector(`.sidebar__link[data-page="${pageId}"]`);
  if (link) link.classList.add('active');
  switch (pageId) {
    case 'dashboard':  loadDashboard();   break;
    case 'products':   loadProducts();    break;
    case 'categories': loadCategories();  break;
    case 'customers':  loadContacts();    break;
    case 'orders':     loadOrders();      break;
    case 'gallery':    loadGallery();     break;
    case 'settings':   loadSettings();   break;
  }
}

document.querySelectorAll('.sidebar__link[data-page]').forEach(link => {
  link.addEventListener('click', e => { e.preventDefault(); goToPage(link.dataset.page); });
});
document.querySelectorAll('[data-goto]').forEach(btn => {
  btn.addEventListener('click', () => goToPage(btn.dataset.goto));
});
document.getElementById('sidebarToggle')?.addEventListener('click', () => {
  document.getElementById('sidebar')?.classList.toggle('open');
});

/* ============================================================
   ACTIVITY LOG — grava ações administrativas no Firestore
   Máximo de 1 escrita por ação. Leve e assíncrono (não bloqueia).
   ============================================================ */
function logActivity(type, description, color) {
  /* color: 'gold' | 'green' | 'blue' | 'red' */
  db.collection('activity_logs').add({
    type, description, color: color || 'gold',
    created_at: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(() => {}); /* falha silenciosa — log nunca bloqueia */
}

/* ============================================================
   DASHBOARD
   ============================================================ */
async function loadDashboard() {
  /* Data real do sistema */
  setTodayDate();

  /* Início do mês atual para calcular "novos este mês" */
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStartSec = monthStart.getTime() / 1000;

  function _countThisMonth(docs, tsField) {
    return docs.filter(d => {
      const ts = d.data()[tsField];
      return ts && ts.seconds >= monthStartSec;
    }).length;
  }

  function _setStatChange(id, n, singLabel, plurLabel) {
    const el = document.getElementById(id);
    if (!el) return;
    if (n > 0) {
      el.textContent = `+${n} ${n === 1 ? singLabel : plurLabel} este mês`;
      el.className = 'stat-card__change positive';
    } else {
      el.textContent = 'Nenhum este mês';
      el.className = 'stat-card__change';
    }
  }

  /* ---- Consultas paralelas — 1 lote único ---- */
  let prodSnap, catSnap, clientSnap, gallSnap, actSnap;
  try {
    [prodSnap, catSnap, clientSnap, gallSnap, actSnap] = await Promise.all([
      db.collection('products').get(),
      db.collection('categories').get(),
      db.collection('clients').get(),
      db.collection('gallery').get(),
      db.collection('activity_logs').orderBy('created_at', 'desc').limit(8).get()
    ]);
  } catch (err) {
    console.error('Dashboard — erro ao carregar dados:', err);
    ['products','gallery','clients','categories'].forEach(k => {
      const el = document.querySelector(`[data-stat="${k}"]`);
      if (el) el.textContent = '—';
    });
    ['statProductsMonth','statGalleryMonth','statClientsMonth','statCategoriesInfo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = 'Erro ao carregar'; el.className = 'stat-card__change'; }
    });
    return;
  }

  /* ---- Cards de estatísticas ---- */
  document.querySelectorAll('[data-stat]').forEach(el => {
    const map = {
      products:   prodSnap.size,
      categories: catSnap.size,
      clients:    clientSnap.size,
      gallery:    gallSnap.size
    };
    if (map[el.dataset.stat] !== undefined) el.textContent = map[el.dataset.stat];
  });

  _setStatChange('statProductsMonth',
    _countThisMonth(prodSnap.docs, 'created_at'), 'adicionado', 'adicionados');
  _setStatChange('statGalleryMonth',
    _countThisMonth(gallSnap.docs, 'created_at'), 'adicionada', 'adicionadas');
  _setStatChange('statClientsMonth',
    _countThisMonth(clientSnap.docs, 'criado_em'), 'novo', 'novos');

  const catInfo = document.getElementById('statCategoriesInfo');
  if (catInfo) {
    catInfo.textContent = catSnap.size
      ? `${catSnap.size} categoria${catSnap.size !== 1 ? 's' : ''} no catálogo`
      : 'Nenhuma categoria';
    catInfo.className = 'stat-card__change';
  }

  /* ---- Clientes recentes ---- */
  const tbody = document.getElementById('dashContactsBody');
  if (tbody) {
    const sorted = [...clientSnap.docs].sort((a, b) => {
      const ta = a.data().criado_em?.seconds || 0;
      const tb = b.data().criado_em?.seconds || 0;
      return tb - ta;
    }).slice(0, 5);
    tbody.innerHTML = sorted.length
      ? sorted.map(doc => {
          const c = doc.data();
          const d = c.criado_em
            ? new Date(c.criado_em.seconds * 1000).toLocaleDateString('pt-BR')
            : '—';
          return `<tr>
            <td>${c.nome || '—'}</td>
            <td style="font-size:0.8rem">${c.email || '—'}</td>
            <td>${c.cidade || 'Não informado'}</td>
            <td>${d}</td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="4" style="text-align:center;color:#888">Nenhum cliente cadastrado.</td></tr>';
  }

  /* ---- Produtos recentes (5 mais recentes por created_at) ---- */
  const topProdEl = document.getElementById('dashTopProducts');
  if (topProdEl) {
    const sorted = [...prodSnap.docs].sort((a, b) => {
      const ta = a.data().created_at?.seconds || 0;
      const tb = b.data().created_at?.seconds || 0;
      return tb - ta;
    }).slice(0, 5);
    if (!sorted.length) {
      topProdEl.innerHTML = '<p style="color:#888;text-align:center;padding:1rem">Nenhum produto cadastrado.</p>';
    } else {
      topProdEl.innerHTML = sorted.map((doc, i) => {
        const p = doc.data();
        const stock = p.stock != null ? p.stock : (p.availability === 'available' ? 1 : 0);
        const avail = stock > 0 ? `${stock} un.` : 'Indisponível';
        const badgeClass = stock > 0 ? 'success' : 'danger';
        return `<div class="top-product">
          <div class="top-product__rank">${i + 1}</div>
          <div class="top-product__info">
            <p class="top-product__name">${p.name || '—'}</p>
            <p class="top-product__cat">${p.category_name || '—'}</p>
          </div>
          <span class="badge badge--${badgeClass}" style="font-size:0.75rem">${avail}</span>
        </div>`;
      }).join('');
    }
  }

  /* ---- Produtos por Categoria ---- */
  const catBarsEl = document.getElementById('dashCatBars');
  if (catBarsEl) {
    /* Agrupa produtos por category_id em memória */
    const countByCatId = {};
    prodSnap.docs.forEach(d => {
      const cid = d.data().category_id;
      if (cid) countByCatId[cid] = (countByCatId[cid] || 0) + 1;
    });
    const totalProds = prodSnap.size || 1; /* evita divisão por zero */

    /* Ordena categorias por quantidade de produtos (maior primeiro) */
    const cats = catSnap.docs
      .map(d => ({ id: d.id, name: d.data().name || '—', count: countByCatId[d.id] || 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6); /* máx. 6 barras para não estourar o card */

    if (!cats.length) {
      catBarsEl.innerHTML = '<p style="color:#888;text-align:center;padding:1rem">Nenhuma categoria.</p>';
    } else {
      catBarsEl.innerHTML = cats.map(c => {
        const pct = Math.round((c.count / totalProds) * 100);
        return `<div class="cat-bar">
          <span class="cat-bar__label">${c.name}</span>
          <div class="cat-bar__track">
            <div class="cat-bar__fill" style="width:0%" data-target="${pct}%"></div>
          </div>
          <span class="cat-bar__pct">${pct}% <small style="color:#666">(${c.count})</small></span>
        </div>`;
      }).join('');
      /* Animação das barras após render */
      setTimeout(() => {
        catBarsEl.querySelectorAll('.cat-bar__fill[data-target]').forEach(bar => {
          bar.style.width = bar.dataset.target;
        });
      }, 80);
    }
  }

  /* ---- Atividade Rápida ---- */
  const actEl = document.getElementById('dashActivityFeed');
  if (actEl) {
    const dotColor = { gold: 'gold', green: 'green', blue: 'blue', red: 'red' };
    if (actSnap.empty) {
      actEl.innerHTML = '<p style="color:#888;text-align:center;padding:1rem">Nenhuma atividade registrada ainda.</p>';
    } else {
      actEl.innerHTML = actSnap.docs.map(doc => {
        const a = doc.data();
        const color = dotColor[a.color] || 'gold';
        const ago   = _timeAgo(a.created_at);
        return `<div class="activity-item">
          <div class="activity-dot activity-dot--${color}"></div>
          <div>
            <p class="activity-text">${a.description || '—'}</p>
            <span class="activity-time">${ago}</span>
          </div>
        </div>`;
      }).join('');
    }
  }
}

/* Formata timestamp Firestore como "há X min / h / dias" */
function _timeAgo(ts) {
  if (!ts || !ts.seconds) return '—';
  const diff = Math.floor((Date.now() / 1000) - ts.seconds);
  if (diff < 60)    return 'agora';
  if (diff < 3600)  return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  const d = Math.floor(diff / 86400);
  return `há ${d} dia${d !== 1 ? 's' : ''}`;
}

/* ============================================================
   PRODUCTS
   ============================================================ */
let allProducts = [];

async function loadProducts() {
  const tbody = document.getElementById('productsBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Carregando...</td></tr>';
  await populateCatFilter();
  try {
    const snap = await db.collection('products').orderBy('created_at', 'desc').get();
    allProducts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    /* Calcular total de imagens para o contador de limites */
    const totalImages = allProducts.reduce((acc, p) => {
      return acc + (Array.isArray(p.images) ? p.images.length : (p.image_url ? 1 : 0));
    }, 0);
    updateLimitsDisplay(allProducts.length, totalImages);
    renderProductsTable(allProducts);
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#e74c3c">Erro ao carregar</td></tr>';
  }
}

function renderProductsTable(products) {
  const tbody = document.getElementById('productsBody');
  if (!tbody) return;
  if (!products.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888">Nenhum produto</td></tr>';
    return;
  }
  tbody.innerHTML = products.map(p => `
    <tr>
      <td><input type="checkbox" /></td>
      <td>
        <div class="product-cell">
          <div class="product-thumb" style="${p.image_url ? `background-image:url(${p.image_url});background-size:cover` : ''}"></div>
          <span>${p.name}</span>
        </div>
      </td>
      <td>${p.category_name || '-'}</td>
      <td>${p.reference_code || '-'}</td>
      <td><span class="badge badge--${(p.stock != null ? p.stock : (p.availability === 'available' ? 1 : 0)) > 0 ? 'success' : 'danger'}">${p.stock != null ? (p.stock > 0 ? p.stock + ' un.' : 'Esgotado') : (p.availability === 'available' ? 'Disponível' : 'Indisponível')}</span></td>
      <td>
        <div class="action-btns">
          <button class="action-btn action-btn--edit" onclick="openEditProduct('${p.id}')" title="Editar">✏️</button>
          <button class="action-btn action-btn--del"  onclick="deleteProduct('${p.id}')"   title="Excluir">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function populateCatFilter() {
  const sel = document.getElementById('productCatFilter');
  if (!sel) return;
  const snap = await db.collection('categories').get();
  sel.innerHTML = '<option value="">Todas as categorias</option>' +
    snap.docs.map(d => `<option value="${d.id}">${d.data().name}</option>`).join('');
}

document.getElementById('productSearch')?.addEventListener('input', function () {
  const q = this.value.toLowerCase();
  renderProductsTable(allProducts.filter(p =>
    p.name.toLowerCase().includes(q) || (p.reference_code||'').toLowerCase().includes(q)
  ));
});
document.getElementById('productCatFilter')?.addEventListener('change', function () {
  renderProductsTable(this.value ? allProducts.filter(p => p.category_id === this.value) : allProducts);
});

/* ============================================================
   CONTADOR DE LIMITES — atualiza o span no painel de produtos
   ============================================================ */
function updateLimitsDisplay(productCount, totalImages) {
  const el  = document.getElementById('catalogLimitsInfo');
  const btn = document.getElementById('addProductBtn');
  if (!el) return;
  const nearLimit = productCount >= CATALOG_LIMITS.MAX_PRODUCTS * 0.9;
  const atLimit   = productCount >= CATALOG_LIMITS.MAX_PRODUCTS;
  el.textContent  = `Produtos: ${productCount} / ${CATALOG_LIMITS.MAX_PRODUCTS}  ·  Imagens: ${totalImages} / ${CATALOG_LIMITS.MAX_TOTAL_IMAGES}`;
  el.style.color  = atLimit ? '#e74c3c' : nearLimit ? '#e67e22' : '#888';
  if (btn) {
    btn.disabled  = atLimit;
    btn.title     = atLimit ? 'Limite de produtos atingido.' : '';
  }
}

/* ============================================================
   CLOUDINARY — upload de UM arquivo (sem API Secret, sem transformações)
   Retorna a secure_url ou lança erro.
   ============================================================ */
async function uploadOneToCloudinary(file) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: fd });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message || `Cloudinary erro ${res.status}`);
  }
  const data = await res.json();
  if (!data.secure_url) throw new Error('secure_url não retornada pelo Cloudinary');
  /* Força alta qualidade inserindo transformações na URL do Cloudinary.
     q_auto:best = melhor qualidade automática; f_auto = formato ideal (webp/avif).
     Ex: .../upload/v123/img.jpg → .../upload/q_auto:best,f_auto/v123/img.jpg */
  const url = data.secure_url.replace('/upload/', '/upload/q_auto:best,f_auto/');
  return url;
}

/* ============================================================
   PREVIEW MÚLTIPLO — renderiza miniaturas das fotos selecionadas + existentes
   ============================================================ */
function renderImagePreviews() {
  const wrap     = document.getElementById('imgPreviewWrap');
  const dropText = document.getElementById('imgDropText');
  if (!wrap) return;

  const total = existingImageUrls.length + pendingImageFiles.length;
  if (total === 0) {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    if (dropText) dropText.textContent = 'Clique para selecionar até 4 fotos';
    return;
  }
  wrap.style.display = 'flex';
  wrap.innerHTML = '';

  /* Miniaturas das URLs já existentes (edição) */
  existingImageUrls.forEach((url, i) => {
    const div = document.createElement('div');
    div.style.cssText = 'position:relative;display:inline-block';
    div.innerHTML = `
      <img src="${url}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid #2a2a32" />
      <button type="button" data-idx="${i}" data-type="existing"
        style="position:absolute;top:-6px;right:-6px;background:#e74c3c;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;cursor:pointer;line-height:18px;text-align:center">×</button>`;
    wrap.appendChild(div);
  });

  /* Miniaturas dos arquivos novos */
  pendingImageFiles.forEach((file, i) => {
    const div = document.createElement('div');
    div.style.cssText = 'position:relative;display:inline-block';
    const url = URL.createObjectURL(file);
    div.innerHTML = `
      <img src="${url}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:2px solid #C9A66B" />
      <button type="button" data-idx="${i}" data-type="new"
        style="position:absolute;top:-6px;right:-6px;background:#e74c3c;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;cursor:pointer;line-height:18px;text-align:center">×</button>`;
    wrap.appendChild(div);
  });

  /* Botões de remover */
  wrap.querySelectorAll('button[data-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx  = parseInt(btn.dataset.idx);
      const type = btn.dataset.type;
      if (type === 'existing') existingImageUrls.splice(idx, 1);
      else                     pendingImageFiles.splice(idx, 1);
      renderImagePreviews();
      setImgStatus('');
    });
  });

  if (dropText) dropText.textContent =
    `${total} foto(s) selecionada(s). Máx: ${CATALOG_LIMITS.MAX_IMAGES_PER_PRODUCT}`;
}

function setImgStatus(msg, color = '#C9A66B') {
  const el = document.getElementById('imgUploadStatus');
  if (!el) return;
  if (!msg) { el.style.display = 'none'; return; }
  el.textContent = msg; el.style.color = color; el.style.display = 'block';
}

/* ---- Seleção de arquivos — valida e gera preview (SEM upload ainda) ---- */
document.getElementById('productImgInput')?.addEventListener('change', function () {
  const files = Array.from(this.files);
  this.value  = ''; /* limpa input para permitir re-seleção do mesmo arquivo */
  if (!files.length) return;

  const currentTotal = existingImageUrls.length + pendingImageFiles.length;
  const remaining    = CATALOG_LIMITS.MAX_IMAGES_PER_PRODUCT - currentTotal;

  if (remaining <= 0) {
    setImgStatus(`Máximo de ${CATALOG_LIMITS.MAX_IMAGES_PER_PRODUCT} fotos por produto já atingido.`, '#e74c3c');
    return;
  }

  const toAdd = files.slice(0, remaining);
  if (files.length > remaining) {
    setImgStatus(`Apenas ${remaining} foto(s) adicionada(s). Limite máximo: ${CATALOG_LIMITS.MAX_IMAGES_PER_PRODUCT} por produto.`, '#e67e22');
  }

  let errors = [];
  toAdd.forEach(file => {
    if (!CATALOG_LIMITS.ALLOWED_FORMATS.includes(file.type)) {
      errors.push(`"${file.name}": formato inválido (use JPG, PNG ou WEBP)`);
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      errors.push(`"${file.name}": muito grande (máx ${CATALOG_LIMITS.MAX_IMAGE_SIZE_MB} MB)`);
      return;
    }
    pendingImageFiles.push(file);
  });

  if (errors.length) setImgStatus(errors.join(' | '), '#e74c3c');
  else if (!files.length || toAdd.length === files.length) setImgStatus('Fotos prontas. Clique em "Salvar Produto" para enviar.', '#C9A66B');
  renderImagePreviews();
});

/* ---- Reset campos de imagem (abre modal novo ou edição) ---- */
function resetImageFields(existingUrls = []) {
  document.getElementById('productImgInput').value = '';
  existingImageUrls = Array.isArray(existingUrls) ? [...existingUrls] : (existingUrls ? [existingUrls] : []);
  pendingImageFiles = [];
  setImgStatus('');
  renderImagePreviews();
}

/* ---- PRODUCT MODAL ---- */
async function openAddProduct() {
  /* Verifica limite de produtos ANTES de abrir o modal */
  try {
    const snap = await db.collection('products').get();
    if (snap.size >= CATALOG_LIMITS.MAX_PRODUCTS) {
      showToast(`Limite de ${CATALOG_LIMITS.MAX_PRODUCTS} produtos atingido. Não é possível cadastrar novos produtos no momento.`, 'error');
      return;
    }
  } catch { /* se falhar, deixa abrir e valida no submit */ }
  editingProductId = null;
  document.getElementById('modalTitle').textContent = 'Novo Produto';
  document.getElementById('productForm').reset();
  setSelectedSizes('');
  resetImageFields([]);
  await loadCatsIntoSelect();
  document.getElementById('productModal').classList.remove('hidden');
}

async function openEditProduct(id) {
  editingProductId = id;
  document.getElementById('modalTitle').textContent = 'Editar Produto';
  try {
    const docSnap = await db.collection('products').doc(id).get();
    const p = docSnap.data();
    document.getElementById('modalProductName').value  = p.name || '';
    document.getElementById('modalProductRef').value   = p.reference_code || '';
    document.getElementById('modalProductPrice').value = p.price != null ? p.price : '';
    document.getElementById('modalProductDesc').value  = p.description || '';
    document.getElementById('modalProductStock').value = p.stock != null ? p.stock : (p.availability === 'available' ? 10 : 0);
    setSelectedSizes(p.sizes || '');
    /* Carrega URLs existentes: prioriza array images[], fallback image_url */
    const urls = Array.isArray(p.images) && p.images.length ? p.images : (p.image_url ? [p.image_url] : []);
    resetImageFields(urls);
    await loadCatsIntoSelect(p.category_id);
    document.getElementById('productModal').classList.remove('hidden');
  } catch { showToast('Erro ao carregar produto.', 'error'); }
}

async function loadCatsIntoSelect(selectedId = '') {
  const sel = document.getElementById('modalCatSelect');
  if (!sel) return;
  const snap = await db.collection('categories').get();
  sel.innerHTML = '<option value="">— Selecione —</option>' +
    snap.docs.map(d => `<option value="${d.id}" ${d.id === selectedId ? 'selected' : ''}>${d.data().name}</option>`).join('');
}

document.getElementById('productForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  if (_uploadInProgress) return; /* proteção contra duplo clique */

  const name  = document.getElementById('modalProductName').value.trim();
  const ref   = document.getElementById('modalProductRef').value.trim();
  const price = parseFloat(document.getElementById('modalProductPrice').value);
  const desc  = document.getElementById('modalProductDesc').value.trim();
  const stock = Math.max(0, parseInt(document.getElementById('modalProductStock').value, 10) || 0);
  const avail = stock > 0 ? 'available' : 'unavailable';
  const catId = document.getElementById('modalCatSelect').value;

  /* Validações dos campos */
  if (!name)                     { showToast('Nome do produto é obrigatório.', 'error'); return; }
  if (isNaN(price) || price < 0) { showToast('Preço inválido.', 'error'); return; }
  if (!catId)                    { showToast('Selecione uma categoria.', 'error'); return; }
  if (!editingProductId && existingImageUrls.length === 0 && pendingImageFiles.length === 0) {
    showToast('Selecione ao menos uma foto para o produto.', 'error'); return;
  }

  const saveBtn = document.querySelector('#productForm button[type="submit"]');
  _uploadInProgress = true;
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvando...'; }

  try {
    /* 1. Verificar limite de produtos no Firestore (antes de gravar) */
    if (!editingProductId) {
      const countSnap = await db.collection('products').get();
      if (countSnap.size >= CATALOG_LIMITS.MAX_PRODUCTS) {
        showToast(`Limite de ${CATALOG_LIMITS.MAX_PRODUCTS} produtos atingido. Não é possível cadastrar novos produtos no momento.`, 'error');
        return;
      }
      /* 2. Verificar limite total de imagens */
      const allImgCount = countSnap.docs.reduce((acc, d) => {
        const imgs = d.data().images;
        return acc + (Array.isArray(imgs) ? imgs.length : (d.data().image_url ? 1 : 0));
      }, 0);
      if (allImgCount + pendingImageFiles.length > CATALOG_LIMITS.MAX_TOTAL_IMAGES) {
        showToast(`Limite total de ${CATALOG_LIMITS.MAX_TOTAL_IMAGES} imagens atingido. Reduza o número de fotos.`, 'error');
        return;
      }
    }

    /* 3. Upload das novas imagens para o Cloudinary (1 por vez, sem duplicar) */
    if (pendingImageFiles.length > 0) {
      setImgStatus('Enviando imagens...', '#C9A66B');
      if (saveBtn) saveBtn.textContent = 'Enviando imagens...';
      for (const file of pendingImageFiles) {
        const url = await uploadOneToCloudinary(file);
        existingImageUrls.push(url);
      }
      pendingImageFiles = []; /* evita re-upload acidental */
      setImgStatus('\u2713 Imagens enviadas!', '#2ecc71');
    }

    /* 4. Montar o objeto do produto */
    let catName = '', catSlug = '';
    if (catId) {
      const cDoc = await db.collection('categories').doc(catId).get();
      if (cDoc.exists) { catName = cDoc.data().name; catSlug = cDoc.data().slug || ''; }
    }

    /* image_url = primeira imagem (compat. com catálogo e produto.js) */
    const imageUrl = existingImageUrls[0] || '';

    const data = {
      name, slug: makeSlug(name), reference_code: ref, price,
      description: desc, sizes: getSelectedSizes(), availability: avail, stock,
      status: 'active', category_id: catId, category_name: catName,
      category_slug: catSlug,
      image_url: imageUrl,       /* campo principal — compat. com catálogo */
      images: existingImageUrls, /* array de até 4 URLs — compat. com produto.js */
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    };

    /* 5. Salvar no Firestore */
    if (editingProductId) {
      await db.collection('products').doc(editingProductId).update(data);
      logActivity('produto_atualizado', `Produto <strong>${name}</strong> atualizado`, 'blue');
      showToast('Produto atualizado!');
    } else {
      data.created_at = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('products').add(data);
      logActivity('produto_criado', `Produto <strong>${name}</strong> adicionado ao catálogo`, 'gold');
      /* Incrementar product_count da categoria */
      if (catId) {
        db.collection('categories').doc(catId).update({
          product_count: firebase.firestore.FieldValue.increment(1)
        }).catch(() => {}); /* não bloqueia o fluxo se falhar */
      }
      showToast('Produto criado com sucesso!');
    }

    document.getElementById('productModal').classList.add('hidden');
    loadProducts();
  } catch (err) {
    console.error('Erro ao salvar produto:', err);
    setImgStatus('Erro: ' + err.message, '#e74c3c');
    showToast('Erro ao salvar: ' + (err.message || 'tente novamente.'), 'error');
  } finally {
    _uploadInProgress = false;
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salvar Produto'; }
  }
});

async function deleteProduct(id) {
  if (!confirm('Excluir este produto?')) return;
  try {
    /* Recuperar category_id antes de excluir para decrementar o counter */
    const snap = await db.collection('products').doc(id).get();
    const catId  = snap.exists ? snap.data().category_id : null;
    const pName  = snap.exists ? snap.data().name : id;
    await db.collection('products').doc(id).delete();
    logActivity('produto_excluido', `Produto <strong>${pName}</strong> removido do catálogo`, 'red');
    if (catId) {
      db.collection('categories').doc(catId).update({
        product_count: firebase.firestore.FieldValue.increment(-1)
      }).catch(() => {});
    }
    showToast('Produto excluído!'); loadProducts();
  } catch { showToast('Erro ao excluir.', 'error'); }
}

document.getElementById('addProductBtn')?.addEventListener('click', openAddProduct);
document.getElementById('modalClose')?.addEventListener('click',  () => document.getElementById('productModal').classList.add('hidden'));
document.getElementById('modalCancel')?.addEventListener('click', () => document.getElementById('productModal').classList.add('hidden'));
document.getElementById('productModal')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden'); });

/* ============================================================
   CATEGORIES
   ============================================================ */

/* Estado do modal de categoria */
let editingCatId       = null;
let catPendingFile     = null;   /* File novo selecionado */
let catExistingImgUrl  = '';     /* URL já existente no Firestore */
let _catUploadInProgress = false;

/* ---- Helpers de UI do modal ---- */
function setCatImgStatus(msg, color = '#C9A66B') {
  const el = document.getElementById('catImgStatus');
  if (!el) return;
  if (!msg) { el.style.display = 'none'; return; }
  el.textContent = msg; el.style.color = color; el.style.display = 'block';
}

function resetCatModal() {
  document.getElementById('catForm')?.reset();
  document.getElementById('catImgInput').value = '';
  document.getElementById('catImgPreview').src = '';
  document.getElementById('catImgPreviewWrap').style.display = 'none';
  document.getElementById('catImgDropText').textContent = 'Clique para selecionar uma imagem';
  setCatImgStatus('');
  catPendingFile    = null;
  catExistingImgUrl = '';
  editingCatId      = null;
}

function openCatModal(title) {
  document.getElementById('catModalTitle').textContent = title;
  document.getElementById('catModal').classList.remove('hidden');
}

function closeCatModal() {
  document.getElementById('catModal').classList.add('hidden');
  resetCatModal();
}

/* ---- Seleção de imagem: validar + preview local (sem upload ainda) ---- */
document.getElementById('catImgInput')?.addEventListener('change', function () {
  const file = this.files[0];
  this.value = '';
  catPendingFile = null;
  setCatImgStatus('');

  if (!file) return;

  if (!CATALOG_LIMITS.ALLOWED_FORMATS.includes(file.type)) {
    setCatImgStatus('Formato inválido. Use JPG, PNG ou WEBP.', '#e74c3c'); return;
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    setCatImgStatus(`Imagem muito grande. Máx ${CATALOG_LIMITS.MAX_IMAGE_SIZE_MB} MB.`, '#e74c3c'); return;
  }

  catPendingFile = file;
  const reader = new FileReader();
  reader.onload = ev => {
    const preview = document.getElementById('catImgPreview');
    const wrap    = document.getElementById('catImgPreviewWrap');
    const dropTxt = document.getElementById('catImgDropText');
    preview.src = ev.target.result;
    wrap.style.display = 'block';
    if (dropTxt) dropTxt.textContent = `${file.name} (${(file.size/1024).toFixed(0)} KB)`;
    setCatImgStatus('Imagem pronta. Clique em "Salvar Categoria" para enviar.', '#C9A66B');
  };
  reader.readAsDataURL(file);
});

document.getElementById('catImgRemoveBtn')?.addEventListener('click', () => {
  catPendingFile    = null;
  catExistingImgUrl = '';
  document.getElementById('catImgPreview').src = '';
  document.getElementById('catImgPreviewWrap').style.display = 'none';
  document.getElementById('catImgDropText').textContent = 'Clique para selecionar uma imagem';
  setCatImgStatus('');
});

/* ---- Fechar modal ---- */
document.getElementById('catModalClose')?.addEventListener('click',  closeCatModal);
document.getElementById('catModalCancel')?.addEventListener('click', closeCatModal);
document.getElementById('catModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeCatModal();
});

/* ---- Submit: validar → upload (se houver) → salvar no Firestore ---- */
document.getElementById('catForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  if (_catUploadInProgress) return;

  const name = document.getElementById('catModalName').value.trim();
  if (!name) { showToast('Nome da categoria é obrigatório.', 'error'); return; }

  /* Verificar duplicidade (case-insensitive) */
  try {
    const allCats = await db.collection('categories').get();
    const duplicate = allCats.docs.find(d => {
      if (d.id === editingCatId) return false; /* ignora a si mesmo na edição */
      return d.data().name.toLowerCase() === name.toLowerCase();
    });
    if (duplicate) {
      showToast(`Já existe uma categoria com o nome "${duplicate.data().name}".`, 'error'); return;
    }
  } catch { /* se falhar, segue mesmo assim */ }

  const saveBtn = document.getElementById('catSaveBtn');
  _catUploadInProgress = true;
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvando...'; }

  try {
    /* Upload da nova imagem para Cloudinary (reutiliza a mesma função dos produtos) */
    let imageUrl = catExistingImgUrl;
    if (catPendingFile) {
      setCatImgStatus('Enviando imagem...', '#C9A66B');
      if (saveBtn) saveBtn.textContent = 'Enviando imagem...';
      imageUrl = await uploadOneToCloudinary(catPendingFile);
      catPendingFile = null;
      setCatImgStatus('✓ Imagem enviada!', '#2ecc71');
    }

    const slug = makeSlug(name);
    const ts   = firebase.firestore.FieldValue.serverTimestamp();

    if (editingCatId) {
      /* Edição: preservar product_count existente */
      await db.collection('categories').doc(editingCatId).update({
        name, slug, image_url: imageUrl, updated_at: ts
      });
      logActivity('categoria_atualizada', `Categoria <strong>${name}</strong> atualizada`, 'blue');
      showToast('Categoria atualizada!');
    } else {
      await db.collection('categories').add({
        name, slug, image_url: imageUrl, product_count: 0,
        created_at: ts, updated_at: ts
      });
      logActivity('categoria_criada', `Categoria <strong>${name}</strong> criada`, 'green');
      showToast('Categoria criada!');
    }

    closeCatModal();
    loadCategories();
  } catch (err) {
    console.error('Erro ao salvar categoria:', err);
    setCatImgStatus('Erro: ' + err.message, '#e74c3c');
    showToast('Erro ao salvar categoria.', 'error');
  } finally {
    _catUploadInProgress = false;
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salvar Categoria'; }
  }
});

/* ---- Carregar categorias ---- */
async function loadCategories() {
  const grid = document.getElementById('categoriesGrid');
  if (!grid) return;
  try {
    const snap = await db.collection('categories').orderBy('name').get();
    const cards = snap.docs.map(doc => {
      const c = doc.data();
      const imgStyle = c.image_url
        ? `background-image:url(${c.image_url});background-size:cover;background-position:center`
        : `background:#1a1a2e`;
      const safeName = (c.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `<div class="cat-manage-card">
        <div class="cat-manage-card__img" style="${imgStyle}"></div>
        <div class="cat-manage-card__body">
          <h4>${c.name || ''}</h4>
          <p>${c.product_count || 0} produto(s)</p>
        </div>
        <div class="cat-manage-card__actions">
          <button class="action-btn action-btn--edit" onclick="openEditCategory('${doc.id}')" title="Editar">✏️</button>
          <button class="action-btn action-btn--del"  onclick="deleteCategory('${doc.id}','${safeName}')" title="Excluir">🗑️</button>
        </div>
      </div>`;
    });
    cards.push(`<div class="cat-manage-card cat-manage-card--add" onclick="openAddCategory()" style="cursor:pointer">
      <div class="cat-add-icon">+</div><p>Nova categoria</p>
    </div>`);
    grid.innerHTML = cards.join('');
  } catch (err) {
    console.error('Erro ao carregar categorias:', err);
    showToast('Erro ao carregar categorias.', 'error');
  }
}

/* ---- Abrir modal para nova categoria ---- */
function openAddCategory() {
  resetCatModal();
  openCatModal('Nova Categoria');
}

/* ---- Abrir modal para editar categoria ---- */
async function openEditCategory(id) {
  resetCatModal();
  editingCatId = id;
  try {
    const docSnap = await db.collection('categories').doc(id).get();
    if (!docSnap.exists) { showToast('Categoria não encontrada.', 'error'); return; }
    const c = docSnap.data();
    document.getElementById('catModalName').value = c.name || '';
    /* Se já tem imagem, mostrar preview */
    if (c.image_url) {
      catExistingImgUrl = c.image_url;
      document.getElementById('catImgPreview').src = c.image_url;
      document.getElementById('catImgPreviewWrap').style.display = 'block';
      document.getElementById('catImgDropText').textContent = 'Imagem atual (selecione para trocar)';
    }
  } catch { showToast('Erro ao carregar categoria.', 'error'); return; }
  openCatModal('Editar Categoria');
}

/* ---- Excluir categoria (com proteção de produtos vinculados) ---- */
async function deleteCategory(id, name) {
  if (!confirm(`Tem certeza que deseja excluir a categoria "${name}"?`)) return;
  try {
    /* Verificar se há produtos vinculados */
    const prodSnap = await db.collection('products').where('category_id', '==', id).limit(1).get();
    if (!prodSnap.empty) {
      showToast(`Não é possível excluir "${name}": existem produtos vinculados a esta categoria.`, 'error');
      return;
    }
    await db.collection('categories').doc(id).delete();
    logActivity('categoria_excluida', `Categoria <strong>${name}</strong> excluída`, 'red');
    showToast('Categoria excluída!');
    loadCategories();
  } catch (err) {
    console.error('Erro ao excluir categoria:', err);
    showToast('Erro ao excluir categoria.', 'error');
  }
}

/* ---- Conectar botão "+ Nova Categoria" do header ---- */
document.getElementById('addCatBtn')?.addEventListener('click', openAddCategory);

/* ============================================================
   CLIENTS
   ============================================================ */

const CLIENTS_PER_PAGE = 15;
let _allClients      = [];   /* todos os clientes carregados (com dados de pedidos) */
let _filteredClients = [];   /* após filtro/ordenação */
let _clientsPage     = 1;

function _fmt(ts) {
  if (!ts) return 'Não informado';
  return new Date(ts.seconds * 1000).toLocaleDateString('pt-BR');
}
function _fmtMoney(v) {
  return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
}

async function loadContacts() {
  /* Alias mantido para compatibilidade com goToPage('customers') */
  return loadClients();
}

async function loadClients() {
  const tbody    = document.getElementById('clientsBody');
  const countEl  = document.getElementById('clientsCount');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center">Carregando...</td></tr>';
  if (countEl) countEl.textContent = 'Carregando...';

  try {
    /* 1. Busca todos os clientes de uma vez (sem listener) */
    const clientSnap = await db.collection('clients').get();

    /* 2. Busca todos os pedidos de uma vez — evita N consultas individuais */
    const orderSnap  = await db.collection('orders').get();

    /* 3. Agrupa pedidos por user_id */
    const ordersByUid = {};
    orderSnap.docs.forEach(doc => {
      const o = doc.data();
      const uid = o.user_id;
      if (!uid) return;
      if (!ordersByUid[uid]) ordersByUid[uid] = { count: 0, total: 0, last: null };
      ordersByUid[uid].count++;
      ordersByUid[uid].total += Number(o.total) || 0;
      const ts = o.created_at ? o.created_at.seconds : 0;
      if (!ordersByUid[uid].last || ts > ordersByUid[uid].last.seconds) {
        ordersByUid[uid].last = o.created_at;
      }
    });

    /* 4. Monta array de clientes enriquecido */
    _allClients = clientSnap.docs.map(doc => {
      const c  = doc.data();
      const od = ordersByUid[doc.id] || { count: 0, total: 0, last: null };
      return {
        uid:           doc.id,
        nome:          c.nome          || '',
        email:         c.email         || '',
        foto:          c.foto          || '',
        telefone:      c.telefone      || '',
        cidade:        c.cidade        || '',
        estado:        c.estado        || '',
        endereco:      c.endereco      || '',
        cep:           c.cep           || '',
        criado_em:     c.criado_em     || null,
        ultimo_acesso: c.ultimo_acesso || null,
        pedidos:       od.count,
        total_gasto:   od.total,
        ultimo_pedido: od.last
      };
    });

    _clientsPage = 1;
    _applyClientFilters();

  } catch (err) {
    console.error('Clientes:', err);
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#e74c3c">Erro ao carregar clientes</td></tr>';
  }
}

function _applyClientFilters() {
  const query = (document.getElementById('clientSearch')?.value || '').toLowerCase().trim();
  const sort  =  document.getElementById('clientSort')?.value || 'ultimo_acesso_desc';

  /* Filtro por texto */
  _filteredClients = query
    ? _allClients.filter(c =>
        c.nome.toLowerCase().includes(query)     ||
        c.email.toLowerCase().includes(query)    ||
        c.telefone.toLowerCase().includes(query) ||
        c.cidade.toLowerCase().includes(query)
      )
    : [..._allClients];

  /* Ordenação */
  _filteredClients.sort((a, b) => {
    switch (sort) {
      case 'criado_em_desc':   return (b.criado_em?.seconds||0)     - (a.criado_em?.seconds||0);
      case 'criado_em_asc':    return (a.criado_em?.seconds||0)     - (b.criado_em?.seconds||0);
      case 'nome_asc':         return a.nome.localeCompare(b.nome, 'pt-BR');
      case 'nome_desc':        return b.nome.localeCompare(a.nome, 'pt-BR');
      case 'pedidos_desc':     return b.pedidos  - a.pedidos;
      case 'total_desc':       return b.total_gasto - a.total_gasto;
      default: /* ultimo_acesso_desc */
        return (b.ultimo_acesso?.seconds||0) - (a.ultimo_acesso?.seconds||0);
    }
  });

  _renderClientsPage();
}

function _renderClientsPage() {
  const tbody   = document.getElementById('clientsBody');
  const countEl = document.getElementById('clientsCount');
  const pagEl   = document.getElementById('clientsPagination');
  if (!tbody) return;

  const total = _filteredClients.length;
  const pages = Math.ceil(total / CLIENTS_PER_PAGE) || 1;
  if (_clientsPage > pages) _clientsPage = pages;

  const start = (_clientsPage - 1) * CLIENTS_PER_PAGE;
  const slice = _filteredClients.slice(start, start + CLIENTS_PER_PAGE);

  if (countEl) countEl.textContent = `Mostrando ${start + 1}–${Math.min(start + slice.length, total)} de ${total} cliente${total !== 1 ? 's' : ''}`;

  if (!slice.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#888">Nenhum cliente encontrado</td></tr>';
    if (pagEl) pagEl.innerHTML = '';
    return;
  }

  tbody.innerHTML = slice.map(c => {
    const avatar = c.foto
      ? `<img src="${c.foto}" referrerpolicy="no-referrer" style="width:32px;height:32px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:8px" />`
      : `<span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:#333;color:#C9A66B;font-weight:700;margin-right:8px;font-size:0.85rem;vertical-align:middle">${(c.nome||c.email||'?')[0].toUpperCase()}</span>`;
    const nome    = c.nome  || '<span style="color:#888">Sem nome</span>';
    const email   = c.email || '<span style="color:#888">—</span>';
    const tel     = c.telefone || '<span style="color:#888">—</span>';
    const cidade  = c.cidade   || '<span style="color:#888">—</span>';
    const acesso  = _fmt(c.ultimo_acesso);
    return `<tr>
      <td><div style="display:flex;align-items:center">${avatar}${nome}</div></td>
      <td style="font-size:0.82rem">${email}</td>
      <td>${tel}</td>
      <td>${cidade}</td>
      <td style="text-align:center">${c.pedidos}</td>
      <td>${_fmtMoney(c.total_gasto)}</td>
      <td style="font-size:0.82rem">${acesso}</td>
      <td><button class="action-btn action-btn--edit" onclick="openClientModal('${c.uid}')" title="Ver detalhes">�</button></td>
    </tr>`;
  }).join('');

  /* Paginação */
  if (pagEl) {
    let btns = '';
    for (let i = 1; i <= pages; i++) {
      if (pages > 7 && i > 2 && i < pages - 1 && Math.abs(i - _clientsPage) > 1) {
        if (i === 3 || i === pages - 2) btns += `<span class="page-ellipsis">…</span>`;
        continue;
      }
      btns += `<button class="page-btn${i === _clientsPage ? ' active' : ''}" onclick="_goClientPage(${i})">${i}</button>`;
    }
    pagEl.innerHTML = btns;
  }
}

function _goClientPage(n) {
  _clientsPage = n;
  _renderClientsPage();
}

function openClientModal(uid) {
  const c = _allClients.find(x => x.uid === uid);
  if (!c) return;

  const modal   = document.getElementById('clientModal');
  const title   = document.getElementById('clientModalTitle');
  const body    = document.getElementById('clientModalBody');
  if (!modal || !body) return;

  const avatar = c.foto
    ? `<img src="${c.foto}" referrerpolicy="no-referrer" style="width:72px;height:72px;border-radius:50%;object-fit:cover;display:block;margin:0 auto 1rem" />`
    : `<div style="width:72px;height:72px;border-radius:50%;background:#222;color:#C9A66B;font-size:1.8rem;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem">${(c.nome||c.email||'?')[0].toUpperCase()}</div>`;

  function row(label, value) {
    return `<div style="display:flex;justify-content:space-between;padding:0.55rem 0;border-bottom:1px solid #222">
      <span style="color:#888;font-size:0.85rem">${label}</span>
      <span style="font-size:0.9rem;max-width:60%;text-align:right;word-break:break-all">${value || '<span style="color:#555">Não informado</span>'}</span>
    </div>`;
  }

  if (title) title.textContent = c.nome || c.email || 'Cliente';

  body.innerHTML = `
    ${avatar}
    ${row('UID Firebase', `<span style="font-family:monospace;font-size:0.78rem">${c.uid}</span>`)}
    ${row('Nome', c.nome)}
    ${row('E-mail', c.email)}
    ${row('Telefone', c.telefone)}
    ${row('Cidade', c.cidade)}
    ${row('Estado', c.estado)}
    ${row('Endereço', c.endereco)}
    ${row('CEP', c.cep)}
    ${row('Cadastro', _fmt(c.criado_em))}
    ${row('Último acesso', _fmt(c.ultimo_acesso))}
    <div style="margin-top:1rem;padding:0.8rem;background:#111;border-radius:8px">
      <p style="color:#C9A66B;font-weight:600;margin-bottom:0.5rem">Resumo de Pedidos</p>
      ${row('Quantidade de pedidos', c.pedidos || '0')}
      ${row('Total gasto', _fmtMoney(c.total_gasto))}
      ${row('Último pedido', _fmt(c.ultimo_pedido))}
    </div>`;

  modal.classList.remove('hidden');
}

/* Fechar modal de cliente */
document.getElementById('clientModalClose')?.addEventListener('click', () => {
  document.getElementById('clientModal')?.classList.add('hidden');
});
document.getElementById('clientModal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('clientModal')) {
    document.getElementById('clientModal').classList.add('hidden');
  }
});

/* Busca e ordenação em tempo real */
document.getElementById('clientSearch')?.addEventListener('input', () => {
  _clientsPage = 1;
  _applyClientFilters();
});
document.getElementById('clientSort')?.addEventListener('change', () => {
  _clientsPage = 1;
  _applyClientFilters();
});

/* Botão Atualizar */
document.getElementById('refreshClientsBtn')?.addEventListener('click', () => loadClients());

/* ============================================================
   GALLERY
   ============================================================ */
async function loadGallery() {
  const grid = document.getElementById('galleryGrid');
  if (!grid) return;
  try {
    const snap = await db.collection('gallery').orderBy('created_at', 'desc').get();
    const items = snap.docs.map(doc => {
      const g   = doc.data();
      const id  = doc.id;
      const onHome    = g.showOnHome === true;
      const safeTitle = (g.title || '').replace(/'/g, "\\'");
      return `<div class="gallery-item" id="gitem-${id}">
        <img src="${g.image_url}" alt="${g.title || ''}" />
        <div class="gallery-item__overlay">
          <button class="gallery-btn" onclick="deleteGalleryItem('${id}')" title="Excluir">🗑️</button>
        </div>
        <span class="gallery-item__name">${g.title || ''}</span>
        <button
          class="gallery-home-btn${onHome ? ' gallery-home-btn--active' : ''}"
          onclick="toggleGalleryHome('${id}', ${onHome})"
          title="${onHome ? 'Remover da Home' : 'Mostrar na Home'}"
        >${onHome ? '✓ Home' : '○ Home'}</button>
      </div>`;
    });
    items.push(`<label class="gallery-upload-area" for="uploadInput"><span>+</span><p>Adicionar</p></label>`);
    grid.innerHTML = items.join('');
  } catch (err) {
    console.error('Erro ao carregar galeria:', err);
    showToast('Erro ao carregar galeria.', 'error');
  }
}

/* Upload via Cloudinary (mesmo padrão dos produtos — sem Firebase Storage) */
document.getElementById('uploadInput')?.addEventListener('change', async e => {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  const btn = document.querySelector('.btn-upload');
  if (btn) { btn.textContent = 'Enviando...'; btn.style.pointerEvents = 'none'; }
  try {
    for (const file of files) {
      /* Valida formato e tamanho antes de enviar */
      if (!CATALOG_LIMITS.ALLOWED_FORMATS.includes(file.type)) {
        showToast(`Formato não suportado: ${file.name}`, 'error'); continue;
      }
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        showToast(`Imagem muito grande (máx. ${CATALOG_LIMITS.MAX_IMAGE_SIZE_MB}MB): ${file.name}`, 'error'); continue;
      }
      const url = await uploadOneToCloudinary(file);
      await db.collection('gallery').add({
        image_url:   url,
        title:       file.name,
        showOnHome:  false,
        created_at:  firebase.firestore.FieldValue.serverTimestamp()
      });
      logActivity('galeria_upload', `Imagem <strong>${file.name}</strong> adicionada à galeria`, 'gold');
    }
    showToast('Imagem(ns) enviada(s)!');
    loadGallery();
  } catch (err) {
    showToast('Erro no upload: ' + (err.message || 'tente novamente.'), 'error');
    console.error('Gallery upload error:', err);
  } finally {
    if (btn) { btn.textContent = '+ Upload Imagem'; btn.style.pointerEvents = ''; }
    e.target.value = '';
  }
});

/* Ativa/desativa imagem no carrossel da Home.
   Espelha o estado na coleção pública 'home_slides' para que
   a Home consiga ler sem autenticação (independente das Rules da 'gallery'). */
async function toggleGalleryHome(id, currentState) {
  try {
    const newState = !currentState;

    /* 1. Atualiza o campo showOnHome na galeria */
    const galleryRef = db.collection('gallery').doc(id);
    await galleryRef.update({ showOnHome: newState });

    /* 2. Espelha na coleção pública home_slides (mesma ID) */
    const homeRef = db.collection('home_slides').doc(id);
    if (newState) {
      /* Ativar: busca os dados atuais da imagem e copia para home_slides */
      const galleryDoc = await galleryRef.get();
      const g = galleryDoc.data();
      await homeRef.set({
        image_url:  g.image_url,
        title:      g.title || '',
        created_at: g.created_at || firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      /* Desativar: remove da coleção pública */
      await homeRef.delete().catch(() => {});
    }

    logActivity(
      'galeria_home',
      `Imagem ${newState ? '<strong>ativada</strong>' : 'removida'} do carrossel da Home`,
      newState ? 'green' : 'blue'
    );

    /* Atualiza apenas o botão sem recarregar todo o grid */
    const item = document.getElementById(`gitem-${id}`);
    if (item) {
      const btn = item.querySelector('.gallery-home-btn');
      if (btn) {
        btn.classList.toggle('gallery-home-btn--active', newState);
        btn.textContent = newState ? '✓ Home' : '○ Home';
        btn.title       = newState ? 'Remover da Home' : 'Mostrar na Home';
        btn.setAttribute('onclick', `toggleGalleryHome('${id}', ${newState})`);
      }
    }
    showToast(newState ? 'Imagem ativada na Home!' : 'Imagem removida da Home.');
  } catch (err) {
    showToast('Erro ao atualizar.', 'error');
    console.error('toggleGalleryHome error:', err);
  }
}

async function deleteGalleryItem(id) {
  if (!confirm('Excluir imagem da galeria? Esta ação não pode ser desfeita.')) return;
  try {
    await db.collection('gallery').doc(id).delete();
    /* Remove também da coleção pública caso estivesse ativa na Home */
    await db.collection('home_slides').doc(id).delete().catch(() => {});
    logActivity('galeria_excluida', `Imagem removida da galeria`, 'red');
    showToast('Imagem excluída!');
    loadGallery();
  } catch { showToast('Erro ao excluir.', 'error'); }
}

/* ============================================================
   ORDERS
   ============================================================ */
async function loadOrders() {
  const tbody = document.getElementById('ordersBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center">Carregando...</td></tr>';
  try {
    const snap = await db.collection('orders').orderBy('created_at', 'desc').get();
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#888">Nenhum pedido</td></tr>';
      return;
    }
    tbody.innerHTML = snap.docs.map(doc => {
      const o = doc.data();
      const d = o.created_at ? new Date(o.created_at.seconds * 1000).toLocaleDateString('pt-BR') : '-';
      const statusMap = { aguardando_pagamento: 'Aguardando pagamento', pago: 'Pago', enviado: 'Enviado', entregue: 'Entregue' };
      const payLabel = { whatsapp: 'WhatsApp', pix: 'PIX', mercadopago: 'Mercado Pago' }[o.payment] || o.payment;
      return `<tr>
        <td>#${doc.id.slice(-6)}</td>
        <td>${o.full_name || o.user_name || '-'}</td>
        <td>${o.whatsapp || '-'}</td>
        <td>R$ ${Number(o.total).toFixed(2).replace('.', ',')}</td>
        <td>${payLabel}</td>
        <td><select class="status-select" data-id="${doc.id}">
          <option value="aguardando_confirmacao" ${o.status==='aguardando_confirmacao'?'selected':''}>Aguardando confirmação</option>
          <option value="aguardando_pagamento" ${o.status==='aguardando_pagamento'?'selected':''}>Aguardando pagamento</option>
          <option value="pago" ${o.status==='pago'?'selected':''}>Pago</option>
          <option value="enviado" ${o.status==='enviado'?'selected':''}>Enviado</option>
          <option value="entregue" ${o.status==='entregue'?'selected':''}>Entregue</option>
        </select></td>
        <td>${d}</td>
        <td><button class="action-btn" onclick="window.open('https://wa.me/${String(o.whatsapp).replace(/\D/g,'')}','_blank')">WhatsApp</button></td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.status-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        try {
          await db.collection('orders').doc(sel.dataset.id).update({ status: sel.value, updated_at: firebase.firestore.FieldValue.serverTimestamp() });
          showToast('Status atualizado!');
        } catch { showToast('Erro ao atualizar status.', 'error'); }
      });
    });
  } catch { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#e74c3c">Erro</td></tr>'; }
}

/* ============================================================
   SETTINGS — Configurações da Loja (Firestore: store_settings/main)
   ============================================================ */

const SETTINGS_DOC = () => db.collection('store_settings').doc('main');

/* Valores padrão — usados quando nenhum dado existe ainda no Firestore */
const SETTINGS_DEFAULTS = {
  whatsapp:      '5543996019761',
  instagram:     'loja_teixeira_style',
  address:       'R. Cel. Joaquim Ribeiro Gomes, 20 — Ribeirão Claro/PR',
  accentColor:   '#C9A66B',
  topbarText:    'Atendimento via WhatsApp · Ribeirão Claro — PR · @loja_teixeira_style',
  topbarActive:     true,
  topbarSpeed:       30,
  maintenance:       false,
  notifyWhatsapp:    false
};

/* Carrega as configurações do Firestore e preenche os campos */
async function loadSettings() {
  /* Exibe o email do admin logado no campo Usuário (independe do Firestore) */
  const userEl = document.getElementById('settingsUsername');
  if (userEl && auth.currentUser) userEl.value = auth.currentUser.email || '';

  try {
    const snap = await SETTINGS_DOC().get();
    const data = snap.exists ? { ...SETTINGS_DEFAULTS, ...snap.data() } : SETTINGS_DEFAULTS;
    if (snap.exists) {
      console.log('[Settings] Dados carregados do Firestore:', data);
    } else {
      console.log('[Settings] Sem dados no Firestore — usando defaults.');
    }

    const set    = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };

    set('settingsWhatsapp',  data.whatsapp);
    set('settingsInstagram', data.instagram);
    set('settingsAddress',   data.address);
    set('settingsColorPick', data.accentColor);
    set('settingsColorText', data.accentColor);
    set('settingsTopbar',    data.topbarText);
    setChk('settingsTopbarActive', data.topbarActive);
    setChk('settingsMaintenance',  data.maintenance);
    setChk('settingsNotifyWhatsapp', data.notifyWhatsapp);
    const speedEl = document.getElementById('settingsTopbarSpeed');
    if (speedEl) speedEl.value = data.topbarSpeed ?? 30;

  } catch (err) {
    console.error('[Settings] Erro ao carregar configurações:', err.code, err.message);
    if (err.code === 'permission-denied') {
      showToast('Sem permissão para ler configurações. Verifique as Firestore Rules.', 'error');
    }
  }
}

/* Salvar: Informações da Loja */
document.getElementById('settingsInfoBtn')?.addEventListener('click', async () => {
  const wa  = (document.getElementById('settingsWhatsapp')?.value  || '').trim().replace(/\D/g, '');
  const ig  = (document.getElementById('settingsInstagram')?.value || '').trim().replace(/^@/, '');
  const adr = (document.getElementById('settingsAddress')?.value   || '').trim();

  if (!wa)  { showToast('Informe o número do WhatsApp.', 'error');  return; }
  if (!ig)  { showToast('Informe o Instagram.', 'error');            return; }
  if (!adr) { showToast('Informe o endereço.', 'error');             return; }

  const btn = document.getElementById('settingsInfoBtn');
  if (btn) btn.textContent = 'Salvando…';
  try {
    const notifyWa = !!(document.getElementById('settingsNotifyWhatsapp')?.checked);
    await SETTINGS_DOC().set({ whatsapp: wa, instagram: ig, address: adr, notifyWhatsapp: notifyWa }, { merge: true });
    showToast('Informações da loja salvas!');
  } catch (err) {
    showToast('Erro ao salvar: ' + (err.message || 'tente novamente.'), 'error');
    console.error('settingsInfoBtn error:', err);
  } finally {
    if (btn) btn.textContent = 'Salvar';
  }
});

/* Sincroniza color picker ↔ text input */
document.getElementById('settingsColorPick')?.addEventListener('input', function () {
  const txt = document.getElementById('settingsColorText');
  if (txt) txt.value = this.value;
});
document.getElementById('settingsColorText')?.addEventListener('input', function () {
  const pick = document.getElementById('settingsColorPick');
  if (pick && /^#[0-9a-fA-F]{6}$/.test(this.value)) pick.value = this.value;
});

/* Salvar: Aparência */
document.getElementById('settingsAppearanceBtn')?.addEventListener('click', async () => {
  const color       = (document.getElementById('settingsColorText')?.value    || '').trim();
  const topbarText  = (document.getElementById('settingsTopbar')?.value       || '').trim();
  const topbarActive = document.getElementById('settingsTopbarActive')?.checked ?? true;
  const maintenance  = document.getElementById('settingsMaintenance')?.checked ?? false;
  const topbarSpeed  = parseInt(document.getElementById('settingsTopbarSpeed')?.value || '30', 10);

  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    showToast('Cor inválida. Use formato #RRGGBB.', 'error'); return;
  }

  const btn = document.getElementById('settingsAppearanceBtn');
  if (btn) btn.textContent = 'Salvando…';
  try {
    await SETTINGS_DOC().set({
      accentColor:  color  || SETTINGS_DEFAULTS.accentColor,
      topbarText:   topbarText || SETTINGS_DEFAULTS.topbarText,
      topbarActive,
      topbarSpeed,
      maintenance
    }, { merge: true });
    showToast('Aparência salva!');
  } catch (err) {
    showToast('Erro ao salvar: ' + (err.message || 'tente novamente.'), 'error');
    console.error('settingsAppearanceBtn error:', err);
  } finally {
    if (btn) btn.textContent = 'Salvar';
  }
});


/* ============================================================
   BUSCA GLOBAL — topbar
   Pesquisa em Produtos e Clientes; navega e filtra ao clicar.
   ============================================================ */
(function initGlobalSearch() {
  const input  = document.querySelector('.topbar-search-input');
  if (!input) return;

  /* Cria dropdown de resultados */
  const dropdown = document.createElement('div');
  dropdown.className = 'global-search-dropdown';
  dropdown.style.cssText = [
    'position:absolute','top:calc(100% + 6px)','left:0','right:0',
    'background:var(--bg-card,#1a1a1f)','border:1px solid var(--border,#2a2a32)',
    'border-radius:8px','max-height:360px','overflow-y:auto',
    'z-index:9999','display:none','box-shadow:0 8px 24px rgba(0,0,0,0.4)'
  ].join(';');

  /* O pai do input precisa de position:relative */
  const wrap = input.closest('.topbar-search');
  if (wrap) { wrap.style.position = 'relative'; wrap.appendChild(dropdown); }

  function closeDropdown() { dropdown.style.display = 'none'; dropdown.innerHTML = ''; }

  function renderResults(q) {
    if (!q) { closeDropdown(); return; }

    const results = [];

    /* Produtos */
    (allProducts || []).forEach(p => {
      const haystack = `${p.name} ${p.reference_code || ''} ${p.category_name || ''}`.toLowerCase();
      if (haystack.includes(q)) results.push({ section: 'Produtos', icon: '📦', label: p.name, sub: p.reference_code || '', page: 'products', filter: q });
    });

    /* Clientes */
    (_allClients || []).forEach(c => {
      const haystack = `${c.name || ''} ${c.email || ''}`.toLowerCase();
      if (haystack.includes(q)) results.push({ section: 'Clientes', icon: '👤', label: c.name || c.email, sub: c.email || '', page: 'customers', filter: q });
    });

    if (!results.length) {
      dropdown.innerHTML = '<p style="padding:1rem;color:var(--text-dim,#666);font-size:0.82rem;text-align:center">Nenhum resultado encontrado.</p>';
      dropdown.style.display = 'block';
      return;
    }

    /* Agrupa por seção */
    const sections = {};
    results.forEach(r => { (sections[r.section] = sections[r.section] || []).push(r); });

    let html = '';
    Object.entries(sections).forEach(([sec, items]) => {
      html += `<div style="padding:0.45rem 0.8rem;font-size:0.68rem;font-weight:700;letter-spacing:0.08em;color:var(--text-dim,#666);text-transform:uppercase;border-bottom:1px solid var(--border,#2a2a32)">${sec}</div>`;
      items.slice(0, 6).forEach((item, idx) => {
        html += `<div class="gsearch-item" data-idx="${results.indexOf(item)}"
          style="display:flex;align-items:center;gap:0.65rem;padding:0.6rem 0.8rem;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.04);transition:background 0.15s">
          <span style="font-size:1rem">${item.icon}</span>
          <div style="min-width:0">
            <div style="font-size:0.82rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.label}</div>
            ${item.sub ? `<div style="font-size:0.72rem;color:var(--text-dim,#666)">${item.sub}</div>` : ''}
          </div>
          <span style="margin-left:auto;font-size:0.68rem;color:var(--gold,#C9A66B);flex-shrink:0">${item.section}</span>
        </div>`;
      });
    });

    dropdown.innerHTML = html;
    dropdown.style.display = 'block';

    /* Hover */
    dropdown.querySelectorAll('.gsearch-item').forEach(el => {
      el.addEventListener('mouseenter', () => el.style.background = 'rgba(201,166,107,0.07)');
      el.addEventListener('mouseleave', () => el.style.background = '');
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        const item = results[+el.dataset.idx];
        /* Navega para a seção */
        goToPage(item.page);
        /* Aplica filtro na seção correspondente */
        setTimeout(() => {
          if (item.page === 'products') {
            const ps = document.getElementById('productSearch');
            if (ps) { ps.value = item.filter; ps.dispatchEvent(new Event('input')); }
          } else if (item.page === 'customers') {
            const cs = document.getElementById('clientSearch');
            if (cs) { cs.value = item.filter; cs.dispatchEvent(new Event('input')); }
          }
        }, 150);
        input.value = '';
        closeDropdown();
      });
    });
  }

  input.addEventListener('input', () => renderResults(input.value.trim().toLowerCase()));
  input.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDropdown(); input.blur(); } });
  document.addEventListener('click', e => { if (!wrap?.contains(e.target)) closeDropdown(); });
  input.addEventListener('focus', () => { if (input.value.trim()) renderResults(input.value.trim().toLowerCase()); });
})();

