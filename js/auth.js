/* ============================================================
   TEIXEIRA STYLE — Autenticação do Cliente (Google)
   ============================================================ */

const auth = window.fbAuth;

/* Sessão persistente — mantém login ao fechar/reabrir o browser */
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

/* Estado do usuário */
window.currentUser = null;

/* ---- UI do botão de login/logout ---- */
function updateAuthUI() {
  const user = window.currentUser;
  document.querySelectorAll('.auth-btn').forEach(el => {
    if (user) {
      const photo = user.photoURL
        ? `<img src="${user.photoURL}" class="auth-btn__avatar" alt="" referrerpolicy="no-referrer" />`
        : `<span class="auth-btn__avatar auth-btn__avatar--initials">${(user.displayName || user.email || '?')[0].toUpperCase()}</span>`;
      const name = user.displayName ? user.displayName.split(' ')[0] : '';
      el.innerHTML = `${photo}${name ? `<span class="auth-btn__name">${name}</span>` : ''}<span class="auth-btn__sair">· Sair</span>`;
      el.dataset.action = 'logout';
      el.classList.remove('navbar__google-btn');
      el.classList.add('navbar__logout-btn');
    } else {
      el.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" style="flex-shrink:0"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Entrar com Google`;
      el.dataset.action = 'login';
      el.classList.add('navbar__google-btn');
      el.classList.remove('navbar__logout-btn');
    }
  });
  document.querySelectorAll('.auth-name').forEach(el => {
    el.textContent = user ? (user.displayName || user.email) : '';
  });
}

/* ---- Login com Google (popup) ---- */
let _loginInProgress = false;

async function signInWithGoogle() {
  if (_loginInProgress) return;
  _loginInProgress = true;
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await auth.signInWithPopup(provider);
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
      console.error('Login error:', err.code);
    }
  } finally {
    _loginInProgress = false;
  }
}

/* ---- Modal de confirmação de logout ---- */
function showLogoutModal() {
  let modal = document.getElementById('logoutModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'logoutModal';
    modal.innerHTML = `
      <div class="logout-modal__backdrop"></div>
      <div class="logout-modal__box">
        <p class="logout-modal__msg">Deseja sair da sua conta?</p>
        <div class="logout-modal__actions">
          <button class="logout-modal__btn logout-modal__btn--cancel">Cancelar</button>
          <button class="logout-modal__btn logout-modal__btn--confirm">Sair</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.logout-modal__backdrop').addEventListener('click', () => hideLogoutModal());
    modal.querySelector('.logout-modal__btn--cancel').addEventListener('click', () => hideLogoutModal());
    modal.querySelector('.logout-modal__btn--confirm').addEventListener('click', async () => {
      hideLogoutModal();
      await auth.signOut();
    });
  }
  modal.classList.add('logout-modal--visible');
}

function hideLogoutModal() {
  const modal = document.getElementById('logoutModal');
  if (modal) modal.classList.remove('logout-modal--visible');
}

/* ---- Listener de estado de autenticação ---- */
auth.onAuthStateChanged(user => {
  window.currentUser = user;
  updateAuthUI();
  if (user && typeof loadCartFromFirestore === 'function') loadCartFromFirestore();
});

/* ---- Delegação de cliques ---- */
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action="login"], [data-action="logout"]');
  if (!btn) return;
  if (btn.dataset.action === 'login') signInWithGoogle();
  else showLogoutModal();
});

/* ---- Contador do carrinho ---- */
function updateCartCount() {
  const cart = JSON.parse(localStorage.getItem('ts_cart') || '[]');
  document.querySelectorAll('.cart-count').forEach(el => { el.textContent = cart.length; });
}
window.updateCartCount = updateCartCount;
updateCartCount();
window.addEventListener('storage', e => { if (e.key === 'ts_cart') updateCartCount(); });
