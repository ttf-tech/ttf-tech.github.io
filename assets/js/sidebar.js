(function () {
  const page = window.location.pathname.split('/').pop() || 'index.html';

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

  el.innerHTML =
    `<img class="sidebar-logo" src="logo.png" alt="TTF">` +
    `<nav class="sidebar-nav">` +
    NAV_LINKS.map(l => link(l)).join('') +
    link({ href: 'admin.html', icon: 'fa-lock', label: 'Admin', title: 'Admin' }, 'sidebar-link-admin') +
    `</nav>`;
})();
