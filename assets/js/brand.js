/* Brand components merged from the former /branding-site/.
 *   <div data-ttf-carousel></div>   → community photo carousel
 *   <ul data-ttf-partners></ul>     → partner logo grid
 *   <form data-ttf-contact>         → Formspree submit via fetch with inline feedback
 *   <nav class="assoc-subnav">      → highlights the section currently in view
 */
(function () {
  // Newest first — add new photos at the top of this list.
  const PHOTOS = [
    { src: 'assets/img/community/ose-industrie-workshop-2.jpeg', w: 1024, h: 575, fit: true,
      caption: 'Ose l’Industrie : visite chez Tournaire · 工廠參訪',
      alt: 'Ose l’Industrie : participantes devant le site Tournaire, en gilets jaunes lors de la visite des ateliers, puis présentation en salle' },
    { src: 'assets/img/community/ose-industrie-workshop.jpeg', w: 1024, h: 1024, fit: true,
      caption: 'Atelier Ose l’Industrie · 女性職涯工作坊',
      alt: 'Atelier carrière Ose l’Industrie : intervenante, mur de post-it et participantes prenant des notes' },
    { src: 'assets/img/community/ttf-calissons.webp', w: 1000, h: 1333,
      caption: 'Saveurs de Provence · 普羅旺斯風味',
      alt: 'Pièce montée de calissons provençaux à côté des drapeaux français et taïwanais' },
    { src: 'assets/img/community/ttf-reception.webp', w: 1100, h: 825, fit: true,
      caption: 'Réception officielle · 官方酒會交流',
      alt: 'Salle de réception officielle décorée de drapeaux français et taïwanais' },
    { src: 'assets/img/community/ttf-paris-meetup-2.jpeg', w: 1200, h: 1600,
      caption: 'Meetup Paris V2 · 巴黎小聚 V2',
      alt: 'Membres de Taiwan Tech France réunis autour d’une longue table lors du deuxième meetup parisien' },
    { src: 'assets/img/community/ttf-paris-meetup.webp', w: 1100, h: 768, fit: true,
      caption: 'Premier meetup à Paris · 首次巴黎小聚',
      alt: 'Membres de Taiwan Tech France posant dans une rue de Paris avec la banderole du premier meetup' },
  ];

  const PARTNERS = [
    { name: 'noet-ia', url: 'https://noet-ia.com/', logo: 'noet-logo-2.png' },
    { name: 'AAFT AURA', url: 'https://www.aaft-aura.org/', logo: 'aaft-logo.jpeg', square: true },
    { name: 'Hellébore Gestion Privée', url: 'https://helleboregestionprivee.fr/', logo: 'hellebore-logo.svg' },
    { name: 'Jump', url: 'https://www.join-jump.com/', logo: 'jump-logo.svg' },
    { name: 'Proxiel', url: 'https://www.proxiel.com/', logo: 'proxiel-logo.png' },
    { name: 'Slasify', url: 'https://slasify.com/', logo: 'Slasify_Logo_Black.png' },
    { name: 'ubune network', url: 'https://www.ubune.network/', logo: 'ubune-logo.svg', square: true },
    { name: 'OVO Agency', url: 'https://www.ovo-agency.com/', logo: 'ovo-logo.svg', dark: true },
    { name: 'Bureau de Taipei à Aix · 駐普羅旺斯臺北辦事處', url: 'https://www.roc-taiwan.org/frprv/index.html',
      logo: 'taiwan-en-provence-logo.jpeg', square: true },
  ];

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ── Carousel ─────────────────────────────────────────────── */
  function renderCarousel(root) {
    root.classList.add('ttf-carousel');
    root.setAttribute('role', 'group');
    root.setAttribute('aria-roledescription', 'carousel');
    root.setAttribute('aria-label', 'Photos de la communauté · 社群照片');
    const slides = PHOTOS.map((p, i) => `
      <figure class="hero-slide${p.fit ? ' hero-slide--fit' : ''}${i === 0 ? ' is-active' : ''}"${p.fit ? ` style="--hero-bg:url('${p.src}')"` : ''}>
        <img src="${p.src}" alt="${esc(p.alt)}" width="${p.w}" height="${p.h}" decoding="async"${i === 0 ? ' fetchpriority="high"' : ' loading="lazy"'}>
        <figcaption class="hero-badge"><span aria-hidden="true">🇫🇷 🇹🇼</span>${esc(p.caption)}</figcaption>
      </figure>`).join('');
    const dots = PHOTOS.map((_, i) =>
      `<button type="button" class="hero-dot${i === 0 ? ' is-active' : ''}" aria-label="Photo ${i + 1}" aria-current="${i === 0}"></button>`).join('');
    root.innerHTML = `<div class="hero-slides">${slides}</div><div class="hero-dots">${dots}</div>`;
    animateCarousel(root);
  }

  function animateCarousel(root) {
    const slides = Array.from(root.querySelectorAll('.hero-slide'));
    const dots = Array.from(root.querySelectorAll('.hero-dot'));
    if (slides.length < 2) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let index = 0, timer = null, leaveTimer = null;

    const show = next => {
      const previous = slides[index];
      index = (next + slides.length) % slides.length;
      if (previous !== slides[index]) {
        slides.forEach(s => s.classList.remove('is-leaving'));
        previous.classList.add('is-leaving');
        clearTimeout(leaveTimer);
        leaveTimer = setTimeout(() => previous.classList.remove('is-leaving'), 1200);
      }
      slides.forEach((s, i) => {
        s.classList.toggle('is-active', i === index);
        s.setAttribute('aria-hidden', String(i !== index));
      });
      dots.forEach((d, i) => {
        d.classList.toggle('is-active', i === index);
        d.setAttribute('aria-current', String(i === index));
      });
    };
    const stop = () => { clearInterval(timer); timer = null; };
    const start = () => {
      if (timer || reducedMotion.matches || document.hidden) return;
      timer = setInterval(() => show(index + 1), 5500);
    };

    dots.forEach((d, i) => d.addEventListener('click', () => { show(i); stop(); start(); }));
    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', start);
    root.addEventListener('focusin', stop);
    root.addEventListener('focusout', start);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    reducedMotion.addEventListener?.('change', () => (reducedMotion.matches ? stop() : start()));
    show(0);
    start();
  }

  /* ── Partners ─────────────────────────────────────────────── */
  function renderPartners(list) {
    list.classList.add('ttf-partner-grid');
    list.innerHTML = PARTNERS.map(p => `
      <li>
        <a class="ttf-partner-link" href="${p.url}" target="_blank" rel="noopener noreferrer" aria-label="${esc(p.name)} — site officiel · 官方網站">
          <span class="ttf-partner-mark${p.dark ? ' ttf-partner-mark--dark' : ''}">
            <img src="assets/img/partners/${p.logo}" alt="${esc(p.name)} logo"${p.square ? ' class="is-square"' : ''} loading="lazy" decoding="async">
          </span>
          <span class="ttf-partner-footer"><span>${esc(p.name)}</span><span aria-hidden="true">↗</span></span>
        </a>
      </li>`).join('');
  }

  /* ── Contact form (Formspree) ─────────────────────────────── */
  function wireContactForm(form) {
    const button = form.querySelector('button[type="submit"]');
    const feedback = form.querySelector('.brand-contact-feedback');
    const idleLabel = button ? button.innerHTML : '';
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      if (button) { button.disabled = true; button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi… · 傳送中…'; }
      if (feedback) { feedback.className = 'brand-contact-feedback'; feedback.textContent = ''; }
      try {
        const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(String(res.status));
        form.reset();
        if (feedback) { feedback.classList.add('ok'); feedback.textContent = 'Merci ! Nous vous répondrons par email. · 已收到，我們會以 email 回覆你。'; }
      } catch (_) {
        if (feedback) { feedback.classList.add('err'); feedback.textContent = 'Échec de l’envoi — écrivez-nous à ttf-tech@zohomail.eu · 傳送失敗，請直接寄信給我們。'; }
      } finally {
        if (button) { button.disabled = false; button.innerHTML = idleLabel; }
      }
    });
  }

  /* ── Association sub-nav: highlight current section ───────── */
  function wireSubnav(nav) {
    const links = Array.from(nav.querySelectorAll('a[href^="#"]'));
    const targets = links.map(a => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
    if (!('IntersectionObserver' in window) || !targets.length) return;
    const setCurrent = id => links.forEach(a => {
      const on = a.getAttribute('href') === '#' + id;
      a.classList.toggle('is-current', on);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
    const io = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setCurrent(visible[0].target.id);
    }, { rootMargin: '-15% 0px -70% 0px' });
    targets.forEach(t => io.observe(t));
  }

  function init() {
    document.querySelectorAll('[data-ttf-carousel]').forEach(renderCarousel);
    document.querySelectorAll('[data-ttf-partners]').forEach(renderPartners);
    document.querySelectorAll('form[data-ttf-contact]').forEach(wireContactForm);
    document.querySelectorAll('.assoc-subnav').forEach(wireSubnav);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
