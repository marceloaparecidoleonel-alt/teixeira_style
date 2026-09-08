/* ============================================================
   TEIXEIRA STYLE — settings-loader.js
   Carrega store_settings/main do Firestore e aplica na página.
   Incluído em: index.html, catalogo.html, produto.html
   ============================================================ */

(function () {
  'use strict';

  /* Aguarda o Firebase estar pronto (window.fbDb populado por firebase-config.js) */
  function runWhenReady(fn) {
    if (window.fbDb) { fn(); return; }
    window.addEventListener('load', fn);
  }

  async function applyStoreSettings() {
    var db = window.fbDb;
    if (!db) return;

    var cfg;
    try {
      var snap = await db.collection('store_settings').doc('main').get();
      if (!snap.exists) return;
      cfg = snap.data();
    } catch (e) {
      if (e.code === 'permission-denied') {
        console.warn(
          '[Settings] Permissão negada para ler store_settings.\n' +
          'No Firebase Console > Firestore > Rules, adicione:\n' +
          '  match /store_settings/{doc} { allow read: if true; allow write: if request.auth != null; }'
        );
      }
      return;
    }

    /* ---- helpers ---- */
    function setHref(id, v) { var el = document.getElementById(id); if (el) el.href = v; }
    function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }
    function setHTML(id, v) { var el = document.getElementById(id); if (el) el.innerHTML = v; }
    function setAll(sel, prop, v) {
      document.querySelectorAll(sel).forEach(function(el) { el[prop] = v; });
    }

    /* ---- WhatsApp ---- */
    if (cfg.whatsapp) {
      var wa    = String(cfg.whatsapp).replace(/\D/g, '');
      var waUrl = 'https://wa.me/' + wa;
      var waDisplay = wa.length >= 12
        ? '(' + wa.slice(-11, -9) + ') ' + wa.slice(-9, -8) + ' ' + wa.slice(-8, -4) + '-' + wa.slice(-4)
        : wa;

      /* IDs específicos da home */
      setHref('heroWaLink',      waUrl);
      setHref('ctaWaLink',       waUrl);
      setHref('navMobileWaLink', waUrl);
      setHref('footerWaLink',    waUrl);
      setText('footerWaText',    waDisplay);

      /* Links estáticos de produto/banner (classe .static-wa-link) */
      setAll('.static-wa-link', 'href', waUrl);

      /* Links WA gerados dinamicamente pelo catálogo */
      window.storeWhatsapp = wa;

      /* catalogo.html — botão CTA fixo */
      setHref('catCtaWaLink', waUrl);

      /* produto.html — botão de dúvidas */
      setHref('produtoWaLink', waUrl);
    }

    /* ---- Instagram ---- */
    if (cfg.instagram) {
      var igRaw    = String(cfg.instagram).replace(/^@/, '').trim();
      var igHandle = '@' + igRaw;
      var igUrl    = 'https://instagram.com/' + igRaw;

      /* home */
      setHref('navInstagramLink',         igUrl);
      setText('navInstagramText',         igHandle);
      setHref('navMobileInstagramLink',   igUrl);
      setHref('footerBrandInstagramLink', igUrl);
      setText('footerBrandInstagramText', igHandle);
      setHref('footerInstagramLink',      igUrl);
      setText('footerInstagramText',      igHandle);
      setText('igSectionHandle',          igHandle);
      setHref('igCtaLink',                igUrl);
      setAll('.instagram__item', 'href',  igUrl);
    }

    /* ---- Endereço ---- */
    if (cfg.address) {
      setHTML('footerAddress', cfg.address);
    }

    /* ---- Topbar texto ---- */
    if (cfg.topbarText) {
      /* home — topbar__inner com animação marquee CSS (-50%) */
      var inner = document.getElementById('topbarInner');
      if (inner) {
        var parts = cfg.topbarText.split('·').map(function(t) { return t.trim(); }).filter(Boolean);
        if (parts.length === 0) parts = [cfg.topbarText.trim()];
        /* Uma "faixa" de itens separados por | */
        var strip = parts.map(function(t) {
          return '<span class="topbar__item">' + t + '</span><span class="topbar__sep">|</span>';
        }).join('');
        /* Repete 8x para garantir que preenche qualquer tela, depois duplica para o loop -50% */
        var repeated = strip.repeat(8);
        inner.innerHTML = repeated + repeated;
        /* Velocidade proporcional ao conteúdo — original era 30s para ~6 itens hardcoded.
           Mantemos ~15s para parecer mais rápido como o usuário pediu. */
        /* topbarSpeed é "velocidade" (10=lento, 80=rápido) → converte para duração invertida */
        var spd = (cfg.topbarSpeed && cfg.topbarSpeed >= 10) ? cfg.topbarSpeed : 30;
        inner.style.animationDuration = (90 - spd) + 's';
      }
      /* catálogo/cliente — topbar__marquee com animação CSS própria */
      var marquee = document.querySelector('.topbar__marquee');
      if (marquee) {
        var mparts = cfg.topbarText.split('·').map(function(t) { return t.trim(); }).filter(Boolean);
        if (mparts.length === 0) mparts = [cfg.topbarText.trim()];
        var mstrip = mparts.map(function(t) {
          return '<span>' + t.toUpperCase() + '</span>';
        }).join('');
        marquee.innerHTML = mstrip.repeat(8) + mstrip.repeat(8);
        var mspd = (cfg.topbarSpeed && cfg.topbarSpeed >= 10) ? cfg.topbarSpeed : 30;
        marquee.style.animationDuration = Math.round((90 - mspd) * 1.25) + 's';
      }
    }

    /* ---- Barra de anúncios ---- */
    var bar = document.getElementById('topbar');
    if (bar) {
      bar.style.display = (cfg.topbarActive === false) ? 'none' : '';
    }

    /* ---- Cor de destaque + contraste automático ---- */
    if (cfg.accentColor && /^#[0-9a-fA-F]{6}$/.test(cfg.accentColor)) {
      var hex = cfg.accentColor;

      /* Calcula luminância relativa (WCAG) para decidir se texto deve ser preto ou branco */
      var r = parseInt(hex.slice(1,3), 16) / 255;
      var g = parseInt(hex.slice(3,5), 16) / 255;
      var b = parseInt(hex.slice(5,7), 16) / 255;
      var toLinear = function(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      var lum = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
      /* Cor escura → texto branco; cor clara → texto preto */
      var btnText = lum > 0.179 ? '#0B0B0F' : '#FFFFFF';

      /* Variáveis CSS — style.css usa --color-gold, catalogo.css usa --gold */
      document.documentElement.style.setProperty('--color-gold',     hex);
      document.documentElement.style.setProperty('--gold',           hex);
      /* Texto dos botões que usam a cor de destaque como fundo */
      document.documentElement.style.setProperty('--color-btn-text', btnText);

      /* Na home (index.html): .topbar usa background: var(--color-gold) no CSS,
         então basta setar a variável — feito acima com setProperty.
         No catálogo/cliente: background está hardcoded #000 no CSS, precisa de override inline. */
      var marqueeEl = document.querySelector('.topbar__marquee');
      if (marqueeEl) {
        marqueeEl.parentElement.parentElement.style.background = hex; /* .topbar */
        marqueeEl.style.color = btnText;
      }

      /* Botões .btn--gold (style.css) — força cor do texto via CSS inline na variável */
      /* O CSS usa color: #0B0B0F hardcoded — precisamos sobrescrever via injeção de style */
      var styleTag = document.getElementById('__settings-btn-style');
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = '__settings-btn-style';
        document.head.appendChild(styleTag);
      }
      var sepColor = lum > 0.179 ? 'rgba(11,11,15,0.35)' : 'rgba(255,255,255,0.35)';
      styleTag.textContent =
        /* Botões com fundo na cor de destaque */
        '.btn--gold { color: ' + btnText + ' !important; }' +
        '.btn--gold:hover { color: var(--color-gold) !important; }' +
        /* Filtros do catálogo */
        '.cat-btn.active { color: ' + btnText + ' !important; }' +
        '.cat-btn:hover { color: var(--gold) !important; }' +
        /* Texto interno da topbar (home — style.css hardcoded) */
        '.topbar__item { color: ' + btnText + ' !important; }' +
        '.topbar__sep  { color: ' + sepColor + ' !important; }';
    }

    /* ---- Modo manutenção ---- */
    if (cfg.maintenance === true) {
      document.body.innerHTML =
        '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'min-height:100vh;background:#0b0b0f;color:#fff;font-family:sans-serif;text-align:center;gap:1.5rem;padding:2rem">' +
        '<img src="assets/images/imagem.png" style="width:120px;opacity:0.85" alt="Teixeira Style" />' +
        '<h1 style="font-size:2rem;font-weight:700;letter-spacing:.05em">Site em manutenção</h1>' +
        '<p style="color:#888;max-width:420px;line-height:1.6">Estamos realizando melhorias. Voltamos em breve!</p>' +
        '</div>';
    }
  }

  runWhenReady(applyStoreSettings);
})();
