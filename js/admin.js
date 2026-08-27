/* ============================================================
   TEIXEIRA STYLE — ADMIN PANEL (Firebase)
   ============================================================ */

const auth    = window.fbAuth;
const db      = window.fbDb;
const storage = window.fbStorage;

let editingProductId = null;

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
   AUTH
   ============================================================ */
auth.onAuthStateChanged(user => {
  if (user) {
    loginScreen.classList.add('hidden');
    adminPanel.classList.remove('hidden');
    setTodayDate();
    const nameEl = document.querySelector('.topbar-username');
    if (nameEl) nameEl.textContent = user.email.split('@')[0];
    loadDashboard();
  } else {
    loginScreen.classList.remove('hidden');
    adminPanel.classList.add('hidden');
  }
});

document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const raw   = document.getElementById('loginUser').value.trim();
  const pass  = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginError');
  const email = raw.includes('@') ? raw : `${raw}@teixeirastyle.com.br`;
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch {
    errEl.textContent = 'E-mail ou senha incorretos.';
    setTimeout(() => { errEl.textContent = ''; }, 3000);
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => auth.signOut());

document.getElementById('togglePass')?.addEventListener('click', () => {
  const inp = document.getElementById('loginPass');
  inp.type = inp.type === 'password' ? 'text' : 'password';
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

/* ---- CATEGORY BARS ANIMATION ---- */
setTimeout(() => {
  document.querySelectorAll('.cat-bar__fill').forEach(bar => {
    const w = bar.style.width; bar.style.width = '0';
    setTimeout(() => { bar.style.width = w; }, 300);
  });
}, 600);

/* ============================================================
   DASHBOARD
   ============================================================ */
async function loadDashboard() {
  try {
    const [prodSnap, catSnap, contSnap, gallSnap] = await Promise.all([
      db.collection('products').get(),
      db.collection('categories').get(),
      db.collection('contacts').get(),
      db.collection('gallery').get()
    ]);
    const map = { products: prodSnap.size, categories: catSnap.size, contacts: contSnap.size, gallery: gallSnap.size };
    document.querySelectorAll('[data-stat]').forEach(el => {
      if (map[el.dataset.stat] !== undefined) el.textContent = map[el.dataset.stat];
    });
    const tbody = document.getElementById('dashContactsBody');
    if (tbody) {
      const recent = await db.collection('contacts').orderBy('created_at', 'desc').limit(5).get();
      tbody.innerHTML = recent.empty
        ? '<tr><td colspan="4" style="text-align:center;color:#888">Nenhum contato</td></tr>'
        : recent.docs.map(doc => {
            const c = doc.data();
            const d = c.created_at ? new Date(c.created_at.seconds * 1000).toLocaleDateString('pt-BR') : '-';
            return `<tr><td>${c.name||'-'}</td><td>${c.phone||'-'}</td><td>${c.city||'-'}</td><td>${d}</td></tr>`;
          }).join('');
    }
  } catch (err) { console.error('Dashboard:', err); }
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
      <td><span class="badge badge--${p.availability === 'available' ? 'success' : 'danger'}">${p.availability === 'available' ? 'Disponível' : 'Indisponível'}</span></td>
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

/* ---- PRODUCT MODAL ---- */
async function openAddProduct() {
  editingProductId = null;
  document.getElementById('modalTitle').textContent = 'Novo Produto';
  document.getElementById('productForm').reset();
  setSelectedSizes('');
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
    document.getElementById('modalProductAvail').value = p.availability || 'available';
    setSelectedSizes(p.sizes || '');
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
  const name    = document.getElementById('modalProductName').value.trim();
  const ref     = document.getElementById('modalProductRef').value.trim();
  const price   = parseFloat(document.getElementById('modalProductPrice').value) || 0;
  const desc    = document.getElementById('modalProductDesc').value.trim();
  const avail   = document.getElementById('modalProductAvail').value;
  const catId   = document.getElementById('modalCatSelect').value;
  const imgFile = document.getElementById('productImgInput').files[0];
  if (!name) { showToast('Nome obrigatório.', 'error'); return; }
  try {
    let imageUrl = '';
    if (editingProductId) {
      const ex = await db.collection('products').doc(editingProductId).get();
      imageUrl = ex.data().image_url || '';
    }
    if (imgFile) {
      const path = `products/${Date.now()}_${imgFile.name}`;
      const snap = await storage.ref(path).put(imgFile);
      imageUrl = await snap.ref.getDownloadURL();
    }
    let catName = '', catSlug = '';
    if (catId) {
      const cDoc = await db.collection('categories').doc(catId).get();
      if (cDoc.exists) { catName = cDoc.data().name; catSlug = cDoc.data().slug; }
    }
    const data = {
      name, slug: makeSlug(name), reference_code: ref, price,
      description: desc, sizes: getSelectedSizes(), availability: avail,
      status: 'active', category_id: catId, category_name: catName,
      category_slug: catSlug, image_url: imageUrl,
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (editingProductId) {
      await db.collection('products').doc(editingProductId).update(data);
      showToast('Produto atualizado!');
    } else {
      data.created_at = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('products').add(data);
      showToast('Produto criado!');
    }
    document.getElementById('productModal').classList.add('hidden');
    loadProducts();
  } catch (err) { showToast('Erro ao salvar produto.', 'error'); console.error(err); }
});

async function deleteProduct(id) {
  if (!confirm('Excluir este produto?')) return;
  try {
    await db.collection('products').doc(id).delete();
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
async function loadCategories() {
  const grid = document.getElementById('categoriesGrid');
  if (!grid) return;
  try {
    const snap = await db.collection('categories').get();
    const colors = ['#1a1a2e','#2e1a1a','#1a2e1a','#2e2e1a','#1a2e2e','#2e1a2e','#1e2a1e','#2a1e1e','#1e1e2a','#2a2a1e'];
    const cards = snap.docs.map((doc, i) => {
      const c = doc.data();
      return `<div class="cat-manage-card">
        <div class="cat-manage-card__img" style="background:${colors[i%colors.length]}"></div>
        <div class="cat-manage-card__body"><h4>${c.name}</h4><p>${c.product_count||0} produtos</p></div>
        <div class="cat-manage-card__actions">
          <button class="action-btn action-btn--edit" onclick="editCategory('${doc.id}','${c.name.replace(/'/g,'\\\'')}')" >✏️</button>
          <button class="action-btn action-btn--del"  onclick="deleteCategory('${doc.id}')">🗑️</button>
        </div>
      </div>`;
    });
    cards.push(`<div class="cat-manage-card cat-manage-card--add" onclick="addCategoryPrompt()">
      <div class="cat-add-icon">+</div><p>Nova categoria</p>
    </div>`);
    grid.innerHTML = cards.join('');
  } catch { showToast('Erro ao carregar categorias.', 'error'); }
}

async function addCategoryPrompt() {
  const name = prompt('Nome da nova categoria:');
  if (!name) return;
  try {
    await db.collection('categories').add({
      name: name.trim(), slug: makeSlug(name), product_count: 0,
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('Categoria criada!'); loadCategories();
  } catch { showToast('Erro ao criar categoria.', 'error'); }
}

async function editCategory(id, currentName) {
  const name = prompt('Novo nome:', currentName);
  if (!name || name === currentName) return;
  try {
    await db.collection('categories').doc(id).update({ name: name.trim(), slug: makeSlug(name) });
    showToast('Categoria atualizada!'); loadCategories();
  } catch { showToast('Erro ao atualizar.', 'error'); }
}

async function deleteCategory(id) {
  if (!confirm('Excluir categoria?')) return;
  try {
    await db.collection('categories').doc(id).delete();
    showToast('Categoria excluída!'); loadCategories();
  } catch { showToast('Erro ao excluir.', 'error'); }
}

document.getElementById('addCatBtn')?.addEventListener('click', addCategoryPrompt);

/* ============================================================
   CONTACTS
   ============================================================ */
async function loadContacts() {
  const tbody = document.getElementById('contactsBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Carregando...</td></tr>';
  try {
    const snap = await db.collection('contacts').orderBy('created_at', 'desc').get();
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888">Nenhum contato</td></tr>';
      return;
    }
    tbody.innerHTML = snap.docs.map(doc => {
      const c = doc.data();
      const d = c.created_at ? new Date(c.created_at.seconds * 1000).toLocaleDateString('pt-BR') : '-';
      return `<tr>
        <td>${c.name||'-'}</td><td>${c.phone||'-'}</td><td>${c.city||'-'}</td>
        <td>${c.interest||'-'}</td><td>${d}</td>
        <td><button class="action-btn action-btn--del" onclick="deleteContact('${doc.id}')">🗑️</button></td>
      </tr>`;
    }).join('');
  } catch { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#e74c3c">Erro</td></tr>'; }
}

async function deleteContact(id) {
  if (!confirm('Excluir este contato?')) return;
  try {
    await db.collection('contacts').doc(id).delete();
    showToast('Contato excluído!'); loadContacts();
  } catch { showToast('Erro ao excluir.', 'error'); }
}

/* ============================================================
   GALLERY
   ============================================================ */
async function loadGallery() {
  const grid = document.getElementById('galleryGrid');
  if (!grid) return;
  try {
    const snap = await db.collection('gallery').orderBy('created_at', 'desc').get();
    const items = snap.docs.map(doc => {
      const g = doc.data();
      return `<div class="gallery-item">
        <img src="${g.image_url}" alt="${g.title||''}" />
        <div class="gallery-item__overlay">
          <button class="gallery-btn" onclick="deleteGalleryItem('${doc.id}','${g.storage_path||''}')">🗑️</button>
        </div>
        <span class="gallery-item__name">${g.title||''}</span>
      </div>`;
    });
    items.push(`<label class="gallery-upload-area" for="uploadInput"><span>+</span><p>Adicionar</p></label>`);
    grid.innerHTML = items.join('');
  } catch { showToast('Erro ao carregar galeria.', 'error'); }
}

document.getElementById('uploadInput')?.addEventListener('change', async e => {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  try {
    for (const file of files) {
      const path = `gallery/${Date.now()}_${file.name}`;
      const snap = await storage.ref(path).put(file);
      const url  = await snap.ref.getDownloadURL();
      await db.collection('gallery').add({
        image_url: url, storage_path: path, title: file.name,
        created_at: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    showToast('Imagem(ns) enviada(s)!'); loadGallery();
  } catch (err) { showToast('Erro no upload.', 'error'); console.error(err); }
  e.target.value = '';
});

async function deleteGalleryItem(id, path) {
  if (!confirm('Excluir imagem?')) return;
  try {
    await db.collection('gallery').doc(id).delete();
    if (path) await storage.ref(path).delete().catch(() => {});
    showToast('Imagem excluída!'); loadGallery();
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
   SETTINGS
   ============================================================ */
document.getElementById('settingsPwdBtn')?.addEventListener('click', async () => {
  const newPass  = document.getElementById('settingsNewPwd').value;
  const confirm_ = document.getElementById('settingsConfirmPwd').value;
  if (!newPass || newPass !== confirm_) { showToast('As senhas não coincidem.', 'error'); return; }
  if (newPass.length < 6) { showToast('Mínimo 6 caracteres.', 'error'); return; }
  try {
    await auth.currentUser.updatePassword(newPass);
    showToast('Senha alterada com sucesso!');
    document.getElementById('settingsNewPwd').value = '';
    document.getElementById('settingsConfirmPwd').value = '';
  } catch (err) {
    showToast(err.code === 'auth/requires-recent-login'
      ? 'Faça login novamente para alterar a senha.' : 'Erro ao alterar senha.', 'error');
  }
});

