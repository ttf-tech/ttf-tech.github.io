(function () {
  const page = window.location.pathname.split('/').pop() || 'index.html';

  try {
    const authHint = JSON.parse(sessionStorage.getItem('ttf_auth_ui_hint_v1') || 'null');
    if (authHint && authHint.signedIn === true) document.body.classList.add('mg-auth-restoring');
  } catch (_) {}

  const NAV_LINKS = [
    { href: 'index.html',       icon: 'fa-home',         label: 'Accueil', title: 'Home · 首頁' },
    { href: 'events.html',      icon: 'fa-calendar-alt', label: 'Agenda',  title: 'Events · 活動' },
    { href: 'jobs.html',        icon: 'fa-briefcase',    label: 'Offres',  title: 'Jobs · 職缺' },
    { href: 'resources.html',   icon: 'fa-book-open',    label: 'Docs',    title: 'Resources · 資源' },
    { href: 'vote.html',        icon: 'fa-poll',         label: 'Vote',    title: 'Sondages · 投票' },
    { href: 'association.html', icon: 'fa-landmark',     label: 'Assoc',   title: 'Association · 協會' },
    { href: 'adhesion.html',    icon: 'fa-id-card',      label: 'Membre',  title: 'Adhésion · 成為會員' },
  ];

  function link(l, extraClass) {
    const cls = 'sidebar-link' + (page === l.href ? ' active' : '') + (extraClass ? ' ' + extraClass : '');
    return `<a href="${l.href}" class="${cls}" title="${l.title}"><i class="fas ${l.icon}"></i><span>${l.label}</span></a>`;
  }

  const el = document.getElementById('app-sidebar');
  if (!el) return;

  const transitionStyle = document.createElement('style');
  transitionStyle.textContent = `
    @view-transition { navigation: auto; }
    ::view-transition-old(root) { animation: ttf-page-out 90ms ease both; }
    ::view-transition-new(root) { animation: ttf-page-in 140ms ease both; }
    @keyframes ttf-page-out { to { opacity: 0.92; } }
    @keyframes ttf-page-in { from { opacity: 0.92; } }
    @media (prefers-reduced-motion: reduce) {
      ::view-transition-old(root), ::view-transition-new(root) { animation: none; }
    }
  `;
  document.head.appendChild(transitionStyle);

  el.innerHTML =
    `<img class="sidebar-logo" src="logo.png" alt="TTF">` +
    `<nav class="sidebar-nav">` +
    NAV_LINKS.map(l => link(l)).join('') +
    link({ href: 'admin.html', icon: 'fa-lock', label: 'Admin', title: 'Admin' }, 'sidebar-link-admin') +
    `</nav>`;

  const prefetched = new Set();
  function prefetchPage(href) {
    if (!href || href === page || prefetched.has(href)) return;
    prefetched.add(href);
    const prefetchLink = document.createElement('link');
    prefetchLink.rel = 'prefetch';
    prefetchLink.href = href;
    document.head.appendChild(prefetchLink);
  }

  el.querySelectorAll('.sidebar-link').forEach(anchor => {
    const href = anchor.getAttribute('href');
    anchor.addEventListener('pointerenter', () => prefetchPage(href), { once: true });
    anchor.addEventListener('focus', () => prefetchPage(href), { once: true });
    anchor.addEventListener('touchstart', () => prefetchPage(href), { once: true, passive: true });
  });

  const prefetchPublicPages = () => NAV_LINKS.forEach(item => prefetchPage(item.href));
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(prefetchPublicPages, { timeout: 2500 });
  } else {
    window.setTimeout(prefetchPublicPages, 1200);
  }
})();
