/* ============================================================
   TEIXEIRA STYLE — Painel do Cliente (protegido por Google Auth)
   ============================================================ */

(function () {
  'use strict';

  const auth = window.fbAuth;

  const loadingEl  = document.getElementById('clienteLoading');
  const contentEl  = document.getElementById('clienteContent');
  const nomeEl     = document.getElementById('clienteNome');
  const emailEl    = document.getElementById('clienteEmail');
  const fotoEl     = document.getElementById('clienteFoto');

  function showContent() {
    if (loadingEl) loadingEl.classList.add('hidden');
    if (contentEl) contentEl.classList.remove('hidden');
  }

  function updateClienteInfo(user) {
    if (!user) return;
    if (nomeEl) nomeEl.textContent = user.displayName || (user.email ? user.email.split('@')[0] : 'Cliente');
    if (emailEl) emailEl.textContent = user.email || '';
    if (fotoEl) {
      fotoEl.src = user.photoURL || 'assets/images/imagem.png';
      fotoEl.style.display = 'block';
    }
  }

  auth.onAuthStateChanged(user => {
    if (!user) {
      /* Redireciona para a home se não estiver logado */
      window.location.replace('index.html');
      return;
    }
    updateClienteInfo(user);
    showContent();
  });
})();
