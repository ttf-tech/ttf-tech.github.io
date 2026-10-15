/* resources.html enhancements: live search, category chips, favorites, copy link, dark mode.
 * Progressive enhancement — the page stays a plain list of links if this file fails to load.
 * Preferences live in localStorage only (per browser, never sent anywhere). */
(function () {
  'use strict';

  const FAV_KEY = 'ttf_res_favs_v1';
  const THEME_KEY = 'ttf_res_theme';

  const CHIPS = [
    { id: 'all',       fr: 'Tout',         zh: '全部',   icon: 'fa-border-all' },
    { id: 'community', fr: 'Communauté',   zh: '社群' },
    { id: 'work',      fr: 'Travail',      zh: '工作' },
    { id: 'tech',      fr: 'Tech',         zh: '科技' },
    { id: 'official',  fr: 'Officiel',     zh: '官方' },
    { id: 'partners',  fr: 'Partenaires',  zh: '夥伴' },
    { id: 'life',      fr: 'Vie pratique', zh: '生活' },
    { id: 'fav',       fr: 'Favoris',      zh: '收藏',   icon: 'fa-star' }
  ];

  const wrap = document.querySelector('.resources-wrap');
  if (!wrap) return;

  const store = {
    get(key, fallback) {
      try { const raw = localStorage.getItem(key); return raw === null ? fallback : raw; } catch (_) { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, value); } catch (_) { /* storage blocked: stay in-memory */ } }
  };

  let favs = new Set();
  try { favs = new Set(JSON.parse(store.get(FAV_KEY, '[]'))); } catch (_) { favs = new Set(); }
  const state = { cat: 'all', query: '' };

  // Accent- and case-insensitive matching ("logement" finds "Logement", "visa" finds "Visá").
  const norm = (text) => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  // ── Toolbar ────────────────────────────────────────────────
  const toolbar = document.createElement('div');
  toolbar.className = 'res-toolbar';
  toolbar.innerHTML = `
    <div class="res-toolbar-row">
      <label class="res-search">
        <i class="fas fa-search" aria-hidden="true"></i>
        <input id="res-search-input" type="search" autocomplete="off"
               placeholder="Rechercher : visa, devops, logement… · 搜尋資源"
               aria-label="Rechercher une ressource · 搜尋資源">
        <button type="button" class="res-search-clear" id="res-search-clear" aria-label="Effacer · 清除">
          <i class="fas fa-times"></i>
        </button>
      </label>
      <button type="button" class="res-theme-btn" id="res-theme-btn" aria-label="Mode sombre · 深色模式"></button>
    </div>
    <div class="res-chips" role="tablist" aria-label="Catégories · 分類">
      ${CHIPS.map(c => `<button type="button" class="res-chip${c.id === 'all' ? ' active' : ''}" role="tab"
          data-chip="${c.id}" aria-selected="${c.id === 'all'}">${c.icon ? `<i class="fas ${c.icon}"></i> ` : ''}${c.fr} · ${c.zh}${c.id === 'fav' ? '<span class="res-chip-n" id="res-fav-n"></span>' : ''}</button>`).join('')}
    </div>
    <div class="res-count" id="res-count" aria-live="polite"></div>`;
  wrap.insertBefore(toolbar, wrap.firstChild);

  const empty = document.createElement('div');
  empty.className = 'res-empty';
  empty.hidden = true;
  wrap.appendChild(empty);

  const toast = document.createElement('div');
  toast.className = 'res-toast';
  toast.setAttribute('role', 'status');
  document.body.appendChild(toast);
  let toastTimer = null;
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  // ── Cards: wrap each link so the action buttons sit beside it, not nested inside the <a> ──
  document.querySelectorAll('.res-card').forEach((card) => {
    const holder = document.createElement('div');
    holder.className = 'res-card-wrap';
    holder.dataset.href = card.href;
    card.parentNode.insertBefore(holder, card);
    holder.appendChild(card);

    const actions = document.createElement('div');
    actions.className = 'res-card-actions';
    actions.innerHTML = `
      <button type="button" class="res-act fav" data-act="fav" aria-label="Ajouter aux favoris · 加入收藏"><i class="fas fa-star"></i></button>
      <button type="button" class="res-act" data-act="copy" aria-label="Copier le lien · 複製連結"><i class="fas fa-link"></i></button>`;
    holder.appendChild(actions);
  });

  function paintFavs() {
    document.querySelectorAll('.res-card-wrap').forEach((holder) => {
      const btn = holder.querySelector('.res-act.fav');
      const on = favs.has(holder.dataset.href);
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    const n = document.getElementById('res-fav-n');
    if (n) n.textContent = favs.size ? `(${favs.size})` : '';
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  wrap.addEventListener('click', async (event) => {
    const btn = event.target.closest('.res-act');
    if (!btn) return;
    const holder = btn.closest('.res-card-wrap');
    const href = holder.dataset.href;
    if (btn.dataset.act === 'fav') {
      if (favs.has(href)) favs.delete(href); else favs.add(href);
      store.set(FAV_KEY, JSON.stringify([...favs]));
      paintFavs();
      if (state.cat === 'fav') applyFilters();
      showToast(favs.has(href) ? 'Ajouté aux favoris · 已加入收藏' : 'Retiré des favoris · 已移除收藏');
    } else {
      const ok = await copyText(href);
      showToast(ok ? 'Lien copié · 已複製連結' : 'Copie impossible · 無法複製');
    }
  });

  // ── Filtering ──────────────────────────────────────────────
  function applyFilters() {
    const q = norm(state.query);
    const { cat } = state;
    let total = 0;

    document.querySelectorAll('.res-section').forEach((section) => {
      if (section.hasAttribute('data-promo')) { section.hidden = !(cat === 'all' && !q); return; }

      const sectionCat = section.dataset.cat;
      const holders = section.querySelectorAll('.res-card-wrap');
      if (!holders.length) {
        // Slides & Replays: dynamic member content, matched as a whole.
        section.hidden = !((cat === 'all' || cat === sectionCat) && (!q || norm(section.textContent).includes(q)));
        return;
      }

      const title = norm(section.querySelector('.res-section-title')?.textContent);
      let visible = 0;
      holders.forEach((holder) => {
        const inCat = cat === 'all' || cat === 'fav' || cat === sectionCat;
        const inFav = cat !== 'fav' || favs.has(holder.dataset.href);
        const matches = !q || norm(holder.textContent).includes(q) || title.includes(q) || norm(holder.dataset.href).includes(q);
        const show = inCat && inFav && matches;
        holder.hidden = !show;
        if (show) visible++;
      });
      section.hidden = visible === 0;
      total += visible;
    });

    document.querySelectorAll('.res-group').forEach((group) => {
      group.hidden = !group.querySelector('.res-section:not([hidden])');
    });

    document.getElementById('res-count').textContent = (q || cat !== 'all')
      ? `${total} ressource${total !== 1 ? 's' : ''} · ${total} 項資源`
      : '';

    const anyVisible = document.querySelector('.res-section:not([hidden])');
    empty.hidden = !!anyVisible;
    if (!anyVisible) {
      empty.innerHTML = cat === 'fav' && !q && favs.size === 0
        ? '<i class="far fa-star"></i>Aucun favori pour l’instant — cliquez sur l’étoile d’une carte.<br>尚無收藏，點擊卡片上的星星即可加入。'
        : '<i class="fas fa-magnifying-glass"></i>Aucune ressource trouvée.<br>找不到符合的資源。';
    }
  }

  const input = document.getElementById('res-search-input');
  const clearBtn = document.getElementById('res-search-clear');

  input.addEventListener('input', () => {
    state.query = input.value;
    clearBtn.classList.toggle('show', !!input.value);
    applyFilters();
  });
  clearBtn.addEventListener('click', () => {
    input.value = '';
    input.dispatchEvent(new Event('input'));
    input.focus();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && input.value) { event.preventDefault(); clearBtn.click(); }
  });
  document.addEventListener('keydown', (event) => {
    const tag = (event.target.tagName || '').toLowerCase();
    if (event.key === '/' && !event.metaKey && !event.ctrlKey && tag !== 'input' && tag !== 'textarea') {
      event.preventDefault();
      input.focus();
    }
  });

  toolbar.querySelector('.res-chips').addEventListener('click', (event) => {
    const chip = event.target.closest('.res-chip');
    if (!chip) return;
    state.cat = chip.dataset.chip;
    toolbar.querySelectorAll('.res-chip').forEach((c) => {
      const active = c === chip;
      c.classList.toggle('active', active);
      c.setAttribute('aria-selected', String(active));
    });
    applyFilters();
  });

  // ── Dark mode ──────────────────────────────────────────────
  const themeBtn = document.getElementById('res-theme-btn');
  function paintTheme() {
    const dark = document.documentElement.dataset.resTheme === 'dark';
    themeBtn.innerHTML = `<i class="fas ${dark ? 'fa-sun' : 'fa-moon'}"></i>`;
    themeBtn.setAttribute('aria-pressed', String(dark));
  }
  themeBtn.addEventListener('click', () => {
    const dark = document.documentElement.dataset.resTheme === 'dark';
    if (dark) delete document.documentElement.dataset.resTheme;
    else document.documentElement.dataset.resTheme = 'dark';
    store.set(THEME_KEY, dark ? 'light' : 'dark');
    paintTheme();
  });

  paintFavs();
  paintTheme();
  applyFilters();
})();
