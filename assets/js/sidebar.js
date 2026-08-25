(function () {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  const authHintKey = 'ttf_auth_ui_hint_v1';
  let initialAuthHint = null;

  try {
    initialAuthHint = JSON.parse(sessionStorage.getItem(authHintKey) || 'null');
    if (initialAuthHint && initialAuthHint.signedIn === true) document.body.classList.add('mg-auth-restoring');
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
    const hrefPage = l.href.split('?')[0];
    const cls = 'sidebar-link' + (page === hrefPage ? ' active' : '') + (extraClass ? ' ' + extraClass : '');
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
    link({ href: 'admin.html?v=3', icon: 'fa-lock', label: 'Admin', title: 'Admin' }, 'sidebar-link-admin') +
    `</nav>`;

  let accountWidget = null;
  let accountChip = null;
  let accountPanel = null;

  if (page === 'index.html') {
    accountWidget = document.createElement('div');
    accountWidget.className = 'auth-account-widget';
    accountWidget.innerHTML = `
      <button id="auth-account-chip" class="auth-account-chip" type="button"
              aria-expanded="false" aria-controls="auth-account-panel">
        <i class="fas fa-user-circle" aria-hidden="true"></i>
        <span data-account-email></span>
        <i class="fas fa-chevron-down auth-account-chevron" aria-hidden="true"></i>
      </button>
      <section id="auth-account-panel" class="auth-account-panel" hidden
               aria-label="會員帳號資訊">
        <div class="auth-account-panel-label">目前登入帳號</div>
        <div class="auth-account-panel-email" data-panel-email></div>
        <div class="auth-member-status checking" data-member-status>
          <span class="auth-member-status-icon"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i></span>
          <div>
            <div class="auth-member-status-title">正在確認會員狀態…</div>
            <div class="auth-member-status-copy">請稍候，我們正在讀取你的 Asso 會員資料。</div>
          </div>
        </div>
        <button id="member-profile-open" class="auth-account-edit" type="button" style="display:none;">
          <i class="fas fa-user-edit" aria-hidden="true"></i>
          編輯我的會員資料
        </button>
      </section>`;
    document.body.appendChild(accountWidget);
    accountChip = accountWidget.querySelector('#auth-account-chip');
    accountPanel = accountWidget.querySelector('#auth-account-panel');

    accountChip.addEventListener('click', () => {
      const willOpen = accountPanel.hidden;
      accountPanel.hidden = !willOpen;
      accountChip.setAttribute('aria-expanded', String(willOpen));
    });
    accountWidget.querySelector('#member-profile-open')?.addEventListener('click', () => {
      accountPanel.hidden = true;
      accountChip.setAttribute('aria-expanded', 'false');
    });

    document.addEventListener('click', event => {
      if (!accountPanel.hidden && !accountWidget.contains(event.target)) {
        accountPanel.hidden = true;
        accountChip.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !accountPanel.hidden) {
        accountPanel.hidden = true;
        accountChip.setAttribute('aria-expanded', 'false');
        accountChip.focus();
      }
    });

    document.addEventListener('ttf:member-profile-state', event => {
      const state = event.detail || {};
      const status = accountWidget.querySelector('[data-member-status]');
      const title = accountWidget.querySelector('.auth-member-status-title');
      const copy = accountWidget.querySelector('.auth-member-status-copy');
      const icon = accountWidget.querySelector('.auth-member-status-icon');
      const editButton = accountWidget.querySelector('#member-profile-open');
      if (!status || !title || !copy || !icon || !editButton) return;

      status.className = 'auth-member-status';
      editButton.style.display = state.canEdit ? 'inline-flex' : 'none';
      if (!state.resolved) {
        status.classList.add('checking');
        icon.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>';
        title.textContent = '正在確認會員狀態…';
        copy.textContent = '請稍候，我們正在讀取你的 Asso 會員資料。';
      } else if (state.isAdmin) {
        status.classList.add('admin');
        icon.innerHTML = '<i class="fas fa-user-shield" aria-hidden="true"></i>';
        title.textContent = '管理員';
        copy.textContent = '此帳號具有網站管理權限，可在這裡更新自己的管理團隊資料。';
      } else if (!state.isAssoMember) {
        status.classList.add('not-member');
        icon.innerHTML = '<i class="fas fa-user" aria-hidden="true"></i>';
        title.textContent = '尚未加入';
        copy.textContent = '目前僅使用 Google 登入，尚未成為 Asso 正式會員。';
      } else if (state.isComplete) {
        status.classList.add('complete');
        icon.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i>';
        title.textContent = 'Asso 完整會員';
        copy.textContent = '正式會員資格有效，會員資料已完整填寫。';
      } else {
        status.classList.add('member');
        icon.innerHTML = '<i class="fas fa-landmark" aria-hidden="true"></i>';
        title.textContent = 'Asso 正式會員';
        copy.textContent = `正式會員資格有效，會員資料尚缺 ${state.missingCount || 0} 項。`;
      }
    });
  }

  function showSignedInAccount(email) {
    const normalizedEmail = String(email || '').trim();
    if (!accountChip) return;
    const emailElement = accountChip.querySelector('[data-account-email]');
    const panelEmail = accountWidget.querySelector('[data-panel-email]');
    if (!normalizedEmail) {
      accountChip.classList.remove('visible');
      accountChip.removeAttribute('title');
      if (emailElement) emailElement.textContent = '';
      if (panelEmail) panelEmail.textContent = '';
      if (accountPanel) accountPanel.hidden = true;
      accountChip.setAttribute('aria-expanded', 'false');
      return;
    }
    if (emailElement) emailElement.textContent = normalizedEmail;
    if (panelEmail) panelEmail.textContent = normalizedEmail;
    accountChip.title = `Compte connecté · 已登入帳號：${normalizedEmail}`;
    accountChip.classList.add('visible');
  }

  showSignedInAccount(initialAuthHint?.signedIn ? initialAuthHint.email : '');

  if (typeof firebase !== 'undefined' && firebase.auth) {
    firebase.auth().onAuthStateChanged(user => {
      if (user) {
        try {
          sessionStorage.setItem(authHintKey, JSON.stringify({
            signedIn: true,
            email: user.email || '',
            savedAt: Date.now()
          }));
        } catch (_) {}
        showSignedInAccount(user.email);
      } else {
        try { sessionStorage.removeItem(authHintKey); } catch (_) {}
        showSignedInAccount('');
      }
    });
  }

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
