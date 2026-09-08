/* ============================================================
   TEIXEIRA STYLE — script.js
   Vanilla JS | Organizado por funcionalidade
   ============================================================ */

'use strict';

/* ============================================================
   1. CURSOR PERSONALIZADO
   ============================================================ */
function initCursor() {
  const cursor = document.getElementById('cursor');
  const follower = document.getElementById('cursorFollower');

  if (!cursor || !follower) return;

  /* Verifica se é dispositivo touch */
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    cursor.style.display = 'none';
    follower.style.display = 'none';
    return;
  }

  let mouseX = 0, mouseY = 0;
  let followerX = 0, followerY = 0;

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    cursor.style.left = mouseX + 'px';
    cursor.style.top  = mouseY + 'px';
  });

  /* Follower suavizado via rAF */
  function animateFollower() {
    followerX += (mouseX - followerX) * 0.12;
    followerY += (mouseY - followerY) * 0.12;
    follower.style.left = followerX + 'px';
    follower.style.top  = followerY + 'px';
    requestAnimationFrame(animateFollower);
  }
  animateFollower();

  /* Hover em elementos interativos */
  const hoverTargets = document.querySelectorAll('a, button, .category-card, .product-card, .instagram__item');

  hoverTargets.forEach((el) => {
    el.addEventListener('mouseenter', () => {
      cursor.classList.add('cursor--hover');
      follower.classList.add('cursor-follower--hover');
    });
    el.addEventListener('mouseleave', () => {
      cursor.classList.remove('cursor--hover');
      follower.classList.remove('cursor-follower--hover');
    });
  });

  /* Esconde ao sair da janela */
  document.addEventListener('mouseleave', () => {
    cursor.style.opacity  = '0';
    follower.style.opacity = '0';
  });
  document.addEventListener('mouseenter', () => {
    cursor.style.opacity  = '1';
    follower.style.opacity = '1';
  });
}

/* ============================================================
   2. NAVBAR — scroll + mobile menu
   ============================================================ */
function initNavbar() {
  const navbar     = document.getElementById('navbar');
  const hamburger  = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');
  const mobileLinks = document.querySelectorAll('.navbar__mobile-link, .navbar__mobile-cta');

  if (!navbar) return;

  /* Scroll: adiciona classe .scrolled */
  function onScroll() {
    if (window.scrollY > 60) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); /* Inicializa no estado correto */

  /* Hamburger toggle */
  function toggleMenu() {
    const isOpen = mobileMenu.classList.toggle('open');
    hamburger.classList.toggle('active', isOpen);
    hamburger.setAttribute('aria-expanded', isOpen.toString());
    document.body.style.overflow = isOpen ? 'hidden' : '';
  }

  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', toggleMenu);

    /* Fecha ao clicar em link */
    mobileLinks.forEach((link) => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        hamburger.classList.remove('active');
        hamburger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      });
    });

    /* Fecha ao pressionar ESC */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileMenu.classList.contains('open')) {
        toggleMenu();
      }
    });
  }

  /* Active link no scroll */
  const sections = document.querySelectorAll('section[id]');
  const navLinks  = document.querySelectorAll('.navbar__link');

  function updateActiveLink() {
    const scrollY = window.scrollY + 120;

    sections.forEach((section) => {
      const top    = section.offsetTop;
      const height = section.offsetHeight;
      const id     = section.getAttribute('id');
      const link   = document.querySelector(`.navbar__link[href="#${id}"]`);

      if (link) {
        if (scrollY >= top && scrollY < top + height) {
          navLinks.forEach((l) => l.style.color = '');
          link.style.color = 'var(--color-gold)';
        }
      }
    });
  }

  window.addEventListener('scroll', updateActiveLink, { passive: true });
}

/* ============================================================
   3. SCROLL REVEAL — IntersectionObserver
   ============================================================ */
function initScrollReveal() {
  const elements = document.querySelectorAll('.reveal');

  if (!elements.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.12,
      rootMargin: '0px 0px -60px 0px',
    }
  );

  elements.forEach((el) => observer.observe(el));
}

/* ============================================================
   4. PARALLAX — Hero e Banner
   ============================================================ */
function initParallax() {
  const heroBg    = document.querySelector('.hero__bg');
  const heroImg   = document.querySelector('.hero__img');
  const bannerImg = document.querySelector('.banner__img');

  if (!heroImg && !bannerImg) return;

  /* Verifica preferência de movimento reduzido */
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  function onScroll() {
    const scrollY = window.scrollY;

    /* Hero parallax */
    if (heroImg && heroBg) {
      const speed  = 0.35;
      heroImg.style.transform = `scale(1.08) translateY(${scrollY * speed}px)`;
    }

    /* Banner parallax */
    if (bannerImg) {
      const banner = bannerImg.closest('.banner');
      if (!banner) return;
      const bannerTop    = banner.offsetTop;
      const bannerHeight = banner.offsetHeight;
      const relativeScroll = scrollY - bannerTop + window.innerHeight;
      if (relativeScroll > 0 && relativeScroll < bannerHeight + window.innerHeight) {
        bannerImg.style.transform = `translateY(${relativeScroll * 0.15}px)`;
      }
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
}

/* ============================================================
   5. LAZY LOADING — imagens com data-src
   ============================================================ */
function initLazyLoading() {
  /* As imagens já usam loading="lazy" nativo.
     Este módulo adiciona uma classe de fade-in ao carregar. */
  const images = document.querySelectorAll('img[loading="lazy"]');

  images.forEach((img) => {
    img.style.opacity = '0';
    img.style.transition = 'opacity 0.6s ease';

    if (img.complete) {
      img.style.opacity = '1';
    } else {
      img.addEventListener('load', () => {
        img.style.opacity = '1';
      });
      img.addEventListener('error', () => {
        img.style.opacity = '1';
      });
    }
  });
}

/* ============================================================
   6. BACK TO TOP
   ============================================================ */
function initBackToTop() {
  const btn = document.getElementById('backToTop');
  if (!btn) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 500) {
      btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
    }
  }, { passive: true });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ============================================================
   7. SMOOTH SCROLL — links âncora
   ============================================================ */
function initSmoothScroll() {
  const anchorLinks = document.querySelectorAll('a[href^="#"]');

  anchorLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href === '#' || href === '#!') return;

      const target = document.querySelector(href);
      if (!target) return;

      e.preventDefault();

      const navbarHeight = document.getElementById('navbar')?.offsetHeight || 80;
      const targetTop    = target.getBoundingClientRect().top + window.scrollY - navbarHeight;

      window.scrollTo({ top: targetTop, behavior: 'smooth' });
    });
  });
}

/* ============================================================
   8. ANIMAÇÃO CONTADORES (About stats)
   ============================================================ */
function initCounters() {
  const statNumbers = document.querySelectorAll('.about__stat-number');
  if (!statNumbers.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const rawText = el.textContent.trim();

          /* Extrai o número e o sufixo */
          const match = rawText.match(/^([0-9]+)/);
          if (!match) return;

          const target   = parseInt(match[1], 10);
          const suffix   = rawText.replace(/^[0-9]+/, '');
          const duration = 1800;
          const start    = performance.now();

          function easeOut(t) {
            return 1 - Math.pow(1 - t, 3);
          }

          function tick(now) {
            const elapsed  = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const current  = Math.floor(easeOut(progress) * target);
            el.textContent = current + suffix;
            if (progress < 1) {
              requestAnimationFrame(tick);
            } else {
              el.textContent = target + suffix;
            }
          }

          requestAnimationFrame(tick);
          observer.unobserve(el);
        }
      });
    },
    { threshold: 0.5 }
  );

  statNumbers.forEach((el) => observer.observe(el));
}

/* ============================================================
   9. NAVBAR LOGO FALLBACK
   ============================================================ */
function initLogoFallback() {
  /* Garante que o texto de fallback apareça caso a logo não carregue */
  const logoImages = document.querySelectorAll('.navbar__logo-img, .footer__logo');

  logoImages.forEach((img) => {
    img.addEventListener('error', function () {
      this.style.display = 'none';
      const fallback = this.nextElementSibling;
      if (fallback) {
        fallback.style.display = 'flex';
      }
    });
  });
}

/* ============================================================
   10. HOVER CARD TILT — efeito premium nos product-cards
   ============================================================ */
function initCardTilt() {
  const cards = document.querySelectorAll('.product-card, .diff-card');

  /* Apenas em dispositivos não-touch */
  if ('ontouchstart' in window) return;

  cards.forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect   = card.getBoundingClientRect();
      const centerX = rect.left + rect.width  / 2;
      const centerY = rect.top  + rect.height / 2;
      const deltaX  = (e.clientX - centerX) / (rect.width  / 2);
      const deltaY  = (e.clientY - centerY) / (rect.height / 2);

      const rotateX =  deltaY * -4;
      const rotateY =  deltaX *  4;

      card.style.transform    = `translateY(-8px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
      card.style.transition   = 'transform 0.1s ease';
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform  = '';
      card.style.transition = 'transform 0.4s ease, box-shadow 0.4s ease';
    });
  });
}

/* ============================================================
   11. HERO SLIDESHOW
   ============================================================ */

let _heroSlideshowTimer = null;
let _heroCurrentSlide   = 0;
let _heroSlidesLoaded   = false; /* evita chamadas duplas simultâneas */

function initHeroSlideshow() {
  if (_heroSlideshowTimer) return; /* já existe um timer — não duplicar */

  const slides = document.querySelectorAll('#heroSlides .hero__slide');
  if (slides.length === 0) return; /* sem slides ainda — loadHeroSlides() chama depois */

  /* Ativa o primeiro slide */
  slides.forEach((s, i) => s.classList.toggle('hero__slide--active', i === 0));
  _heroCurrentSlide = 0;

  if (slides.length < 2) return; /* apenas 1 slide — não precisa de timer */

  _heroSlideshowTimer = setInterval(() => {
    const all = document.querySelectorAll('#heroSlides .hero__slide');
    if (all.length < 2) return;
    all[_heroCurrentSlide].classList.remove('hero__slide--active');
    _heroCurrentSlide = (_heroCurrentSlide + 1) % all.length;
    all[_heroCurrentSlide].classList.add('hero__slide--active');
  }, 5000);
}

/* Adiciona slides da Galeria ao slideshow base.
   Lê da coleção 'home_slides' (pública, sem auth) — espelhada pelo Admin ao marcar "Home".
   Fallback: tenta 'gallery where showOnHome=true' caso home_slides esteja vazia.
   Chamada uma única vez no evento window 'load'. */
async function loadHeroSlides() {
  if (_heroSlidesLoaded) return;

  const container = document.getElementById('heroSlides');
  if (!container) return;

  const db = window.fbDb;
  if (!db) {
    console.error('[Hero] window.fbDb não disponível.');
    return;
  }

  let images = [];

  /* --- Tentativa 1: coleção pública home_slides --- */
  try {
    console.log('[Hero] Lendo coleção home_slides...');
    const snap = await db.collection('home_slides').get();
    console.log(`[Hero] home_slides retornou ${snap.size} documento(s).`);

    if (!snap.empty) {
      images = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(g => g.image_url)
        .sort((a, b) => (a.created_at?.seconds || 0) - (b.created_at?.seconds || 0));
    }
  } catch (err) {
    console.error('[Hero] Erro ao ler home_slides:', err.code, err.message);
  }

  /* --- Tentativa 2 (fallback): gallery where showOnHome=true --- */
  if (images.length === 0) {
    try {
      console.log('[Hero] home_slides vazia — tentando gallery where showOnHome=true...');
      const snap2 = await db.collection('gallery')
        .where('showOnHome', '==', true)
        .get();
      console.log(`[Hero] gallery retornou ${snap2.size} documento(s) com showOnHome=true.`);
      images = snap2.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(g => g.image_url)
        .sort((a, b) => (a.created_at?.seconds || 0) - (b.created_at?.seconds || 0));
    } catch (err2) {
      console.error('[Hero] Erro ao ler gallery:', err2.code, err2.message,
        '— Se for permission-denied, abra Firebase Console > Firestore > Rules e adicione: ' +
        "match /gallery/{doc} { allow read: if true; }");
    }
  }

  if (images.length === 0) {
    console.log('[Hero] Sem imagens para Home — slides base mantidos.');
    _heroSlidesLoaded = true;
    return;
  }

  console.log(`[Hero] ${images.length} imagem(ns) encontrada(s):`, images.map(i => i.image_url));

  /* Evita duplicação: verifica IDs já inseridos */
  const alreadyAdded = new Set(
    Array.from(container.querySelectorAll('[data-gallery-id]'))
      .map(el => el.dataset.galleryId)
  );

  let added = 0;
  const fragment = document.createDocumentFragment();
  images.forEach(img => {
    if (alreadyAdded.has(img.id)) return;
    const div = document.createElement('div');
    div.className = 'hero__slide';
    div.dataset.galleryId = img.id;
    div.innerHTML = `<img src="${img.image_url}" alt="${img.title || 'Teixeira Style'}" class="hero__slide-img" loading="lazy" />`;
    fragment.appendChild(div);
    added++;
  });

  if (added > 0) {
    container.appendChild(fragment);
    console.log(`[Hero] ${added} slide(s) adicionado(s) ao carrossel. Total no DOM:`,
      container.querySelectorAll('.hero__slide').length);
  }

  _heroSlidesLoaded = true;

  /* Inicia o slideshow depois que todos os slides estão no DOM */
  initHeroSlideshow();
}

/* ============================================================
   12. BARRA DE PESQUISA — navbar
   ============================================================ */
function initSearch() {
  const toggle   = document.getElementById('searchToggle');
  const box      = document.getElementById('searchBox');
  const closeBtn = document.getElementById('searchClose');
  const input    = document.getElementById('searchInput');

  if (!toggle || !box) return;

  function openSearch() {
    box.classList.add('open');
    if (input) input.focus();
  }

  function closeSearch() {
    box.classList.remove('open');
    if (input) input.value = '';
  }

  toggle.addEventListener('click', () => {
    box.classList.contains('open') ? closeSearch() : openSearch();
  });

  if (closeBtn) closeBtn.addEventListener('click', closeSearch);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSearch();
  });

  /* Fecha ao clicar fora */
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#navSearch')) closeSearch();
  });
}

/* ============================================================
   12. CATEGORIAS DINÂMICAS
   ============================================================ */

/* Fallback por slug — usado quando a categoria ainda não tem imagem no Firestore */
const CAT_FALLBACK_IMGS = {
  streetwear: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&q=80',
  casual:     'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&q=80',
  tenis:      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80',
  esportivo:  'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600&q=80',
  infantil:   'https://images.unsplash.com/photo-1476234251651-f353703a034d?w=600&q=80',
  cueca:      'https://images.unsplash.com/photo-1617952739218-c1b0fc50b5d8?w=600&q=80',
  meia:       'https://images.unsplash.com/photo-1586350977771-b3b0abd50c82?w=600&q=80',
  bone:       'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=600&q=80',
  relogios:   'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80',
  oculos:     'https://images.unsplash.com/photo-1508296695146-257a814070b4?w=600&q=80'
};
const CAT_IMG_DEFAULT = 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=600&q=80';

async function loadHomeCategories() {
  const grid = document.getElementById('categoriesGrid');
  if (!grid) return;
  const db = window.fbDb;
  if (!db) return;
  try {
    const snap = await db.collection('categories').orderBy('name').get();
    if (snap.empty) return;
    const cards = snap.docs.map((doc, i) => {
      const c    = doc.data();
      const slug = c.slug || '';
      /* Prioridade: imagem do Firestore → fallback pelo slug → fallback genérico */
      const img  = c.image_url || CAT_FALLBACK_IMGS[slug] || CAT_IMG_DEFAULT;
      const delay = (i * 0.1).toFixed(1);
      return `<div class="category-card reveal" style="--delay: ${delay}s">
        <div class="category-card__img-wrap">
          <img src="${img}" alt="${c.name}" class="category-card__img" loading="lazy" />
          <div class="category-card__overlay"></div>
        </div>
        <div class="category-card__content">
          <h3 class="category-card__name">${c.name}</h3>
          <a href="catalogo.html" class="category-card__link">Explorar <span>\u2192</span></a>
        </div>
      </div>`;
    });
    grid.innerHTML = cards.join('');
    /* Registrar novos elementos para scroll-reveal e lazy-loading */
    initScrollReveal();
    initLazyLoading();
  } catch (err) {
    /* Firestore indisponível — grid permanece vazio sem quebrar a página */
    console.warn('loadHomeCategories:', err);
  }
}

/* ============================================================
   13. DESTAQUES DINÂMICOS
   ============================================================ */
async function loadHighlights() {
  const grid = document.getElementById('highlightsGrid');
  if (!grid) return;
  try {
    const db = window.fbDb;
    if (!db) return;
    const snap = await db.collection('products').where('status', '==', 'active').limit(6).get();
    if (snap.empty) return;
    const products = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const featured = products.slice(0, 6);
    const badges = ['Novo', 'Destaque', 'Hot', 'Novo', '', 'Novo'];
    grid.innerHTML = featured.map((p, i) => `
      <article class="product-card reveal" style="--delay: ${i * 0.1}s">
        <div class="product-card__img-wrap">
          <img src="${p.image_url || 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=600&q=80'}" alt="${p.name}" class="product-card__img" loading="lazy" />
          ${badges[i] ? `<div class="product-card__badge">${badges[i]}</div>` : ''}
        </div>
        <div class="product-card__info">
          <span class="product-card__category">${p.category_name || ''}</span>
          <h3 class="product-card__name">${p.name}</h3>
          <a href="https://wa.me/${window.storeWhatsapp||'5543996019761'}?text=Ol%C3%A1!%20Interesse%20em:%20${encodeURIComponent(p.name)}" target="_blank" rel="noopener" class="btn btn--outline btn--sm product-card__btn">Ver mais</a>
        </div>
      </article>
    `).join('');
    initScrollReveal();
  } catch (err) {
    /* API indisponível — mantém conteúdo estático */
  }
}

/* ============================================================
   13. INICIALIZAÇÃO
   ============================================================ */
function init() {
  initCursor();
  initNavbar();
  initScrollReveal();
  initParallax();
  initLazyLoading();
  initBackToTop();
  initSmoothScroll();
  initCounters();
  initLogoFallback();
  initCardTilt();
  initSearch();
  loadHomeCategories();
  loadHighlights();
}

/* Aguarda o DOM estar pronto */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/* loadHeroSlides() é chamada no window 'load', que dispara depois de todos os
   scripts externos (Firebase CDN) estarem 100% prontos. As configurações da loja
   são carregadas por js/settings-loader.js, incluído em cada HTML separadamente. */
window.addEventListener('load', () => {
  loadHeroSlides();
});
