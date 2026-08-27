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
function initHeroSlideshow() {
  const slides = document.querySelectorAll('.hero__slide');
  if (slides.length < 2) return;

  let current = 0;
  const interval = 5000; /* 5 segundos por slide */

  function nextSlide() {
    slides[current].classList.remove('hero__slide--active');
    current = (current + 1) % slides.length;
    slides[current].classList.add('hero__slide--active');
  }

  setInterval(nextSlide, interval);
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
   12. DESTAQUES DINÂMICOS
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
          <a href="https://wa.me/5543960197610?text=Ol%C3%A1!%20Interesse%20em:%20${encodeURIComponent(p.name)}" target="_blank" rel="noopener" class="btn btn--outline btn--sm product-card__btn">Ver mais</a>
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
  initHeroSlideshow();
  initSearch();
  loadHighlights();
}

/* Aguarda o DOM estar pronto */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
