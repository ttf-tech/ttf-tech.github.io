/* ── stastic_member.js ───────────────────────────────────────── */
'use strict';

const STORE_KEY = 'grp_hub_v2';

// ── Firebase shared persistence ────────────────────────────────
// SETUP (one-time, 5 min):
//   1. Go to https://console.firebase.google.com → Add project
//   2. Build → Realtime Database → Create database → Start in test mode
//   3. Project Settings → Your apps → </> Web → Register → copy config
//   4. Replace the YOUR_* values below
// ───────────────────────────────────────────────────────────────
const _FB_CONFIG = {
  apiKey:            'AIzaSyCSfJ6-F9OEdmXQvwVHX9hpYvkp57mpeO8',
  authDomain:        'groupe-tech-fr.firebaseapp.com',
  databaseURL:       'https://groupe-tech-fr-default-rtdb.europe-west1.firebasedatabase.app',
  projectId:         'groupe-tech-fr',
  storageBucket:     'groupe-tech-fr.firebasestorage.app',
  messagingSenderId: '461066170665',
  appId:             '1:461066170665:web:1b090d8e383404c4320738'
};

// Auto-detects whether config has been filled in
const _FB_READY = typeof firebase !== 'undefined' &&
                  !_FB_CONFIG.apiKey.startsWith('YOUR_');
let _fbRef = null;
let _adminProfilesRef = null;
let _adminProfilesHandler = null;
let _fbSyncDone = false; // true after first Firebase on('value') fires
if (_FB_READY) {
  try {
    if (!firebase.apps.length) firebase.initializeApp(_FB_CONFIG);
    _fbRef = firebase.database().ref(STORE_KEY);
    _adminProfilesRef = firebase.database().ref('adminProfiles');
  } catch (e) {
    console.warn('[Firebase] init failed, falling back to localStorage', e);
  }
}

// ── Chart instances (tracked for destroy-before-rerender) ──────
let _chartTech   = null;
let _chartInvest = null;
let _chartCity   = null;
let _chartStatus = null;

// ── Color palette matching invest.html ────────────────────────
const PALETTE = [
  '#1d4ed8', '#059669', '#d97706', '#7c3aed', '#be123c',
  '#0e7490', '#15803d', '#b45309', '#1a5f7a', '#64748b'
];

// ── Utilities ─────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' });
}

function showToast(msg, ms = 2800) {
  let el = document.getElementById('sm-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sm-toast';
    el.className = 'sm-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}

// ══════════════════════════════════════════════════════════════
// STATIC SEED DATA — never stored in Firebase, always from code
// Charts render instantly without waiting for Firebase.
// ══════════════════════════════════════════════════════════════

const SEED_SURVEYS = [
  {
    id: 'seed_s1_tech',
    title: '你的主要技術領域是？（可複選）',
    titleFr: 'Quel est votre domaine technique principal ? (choix multiple)',
    description: '來自 WhatsApp 社群調查 / Sondage WhatsApp communautaire',
    type: 'multi', privacy: 'count_only', status: 'open',
    isLegacy: true, source: 'WhatsApp',
    createdAt: '2026-01-15T13:44:00.000Z',
    options: [
      { id: 'Backend Dev',         label: 'Backend Developer' },
      { id: 'Frontend Dev',        label: 'Frontend Developer' },
      { id: 'Full Stack',          label: 'Full Stack Developer' },
      { id: 'DevOps/SRE/Cloud',    label: 'DevOps / SRE / Cloud' },
      { id: 'Data/AI/ML',          label: 'Data / AI / ML' },
      { id: 'Mobile',              label: 'Mobile (iOS / Android)' },
      { id: 'QA/Test',             label: 'QA / Test / Automation' },
      { id: 'Security/Cybersec',   label: 'Security / Cybersecurity' },
      { id: 'Architect/Tech Lead', label: 'Architect / Tech Lead' },
      { id: 'PM',                  label: 'PM (Product / Project)' },
      { id: 'Designer',            label: 'Designer' },
      { id: 'Biz Manager',         label: 'Business Manager' },
      { id: 'Others',              label: 'Others' }
    ],
    legacyCounts: {
      'Backend Dev': 3, 'Frontend Dev': 2, 'Full Stack': 2,
      'DevOps/SRE/Cloud': 2, 'Data/AI/ML': 11, 'Mobile': 1,
      'QA/Test': 1, 'Security/Cybersec': 1, 'Architect/Tech Lead': 2,
      'PM': 10, 'Designer': 1, 'Biz Manager': 4, 'Others': 14
    }
  },
  {
    id: 'seed_s2_invest',
    title: '是否有興趣交流「在法國投資/長期發展」？',
    titleFr: 'Êtes-vous intéressé(e) par les échanges sur l\'investissement / développement long terme en France ?',
    description: '來自 WhatsApp 社群調查 / Sondage WhatsApp communautaire',
    type: 'multi', privacy: 'count_only', status: 'open',
    isLegacy: true, source: 'WhatsApp',
    createdAt: '2024-10-01T10:00:00.000Z',
    options: [
      { id: '不感興趣',          label: '不感興趣 (Pas intéressé(e))' },
      { id: '有興趣但無額外資金',  label: '有興趣但無額外資金 (Intéressé mais sans fonds)' },
      { id: '有興趣且已在投資',    label: '有興趣且已在投資 (Intéressé et déjà investi)' },
      { id: '很有興趣願增加',      label: '很有興趣願增加 (Très intéressé, prêt à augmenter)' },
      { id: '有興趣但不方便GMeet', label: '有興趣但不方便GMeet (Intéressé mais pas dispo GMeet)' },
      { id: '有興趣可參加GMeet',   label: '有興趣可參加GMeet (Intéressé et dispo GMeet)' }
    ],
    legacyCounts: {
      '不感興趣': 0, '有興趣但無額外資金': 5, '有興趣且已在投資': 4,
      '很有興趣願增加': 0, '有興趣但不方便GMeet': 0, '有興趣可參加GMeet': 11
    }
  },
  {
    id: 'seed_s3_city',
    title: '你目前主要所在城市是？（可複選）',
    titleFr: 'Dans quelle ville êtes-vous principalement basé(e) ?',
    description: '來自 WhatsApp 社群調查 / Sondage WhatsApp communautaire',
    type: 'single', privacy: 'count_only', status: 'open',
    isLegacy: true, source: 'WhatsApp',
    createdAt: '2026-01-15T13:42:00.000Z',
    options: [
      { id: 'Paris',      label: 'Paris / Île-de-France' },
      { id: 'Lyon',       label: 'Lyon' },
      { id: 'Toulouse',   label: 'Toulouse' },
      { id: 'Bordeaux',   label: 'Bordeaux' },
      { id: 'Lille',      label: 'Lille' },
      { id: 'Strasbourg', label: 'Strasbourg' },
      { id: 'Nice',       label: 'Nice / Sophia Antipolis' },
      { id: 'Taiwan',     label: '台灣（計畫來法國 / Prévu de venir en France）' },
      { id: 'Autres',     label: '其他城市（請留言 / Autre ville）' }
    ],
    legacyCounts: {
      'Paris': 38, 'Lyon': 5, 'Toulouse': 0, 'Bordeaux': 2,
      'Lille': 0, 'Strasbourg': 0, 'Nice': 2, 'Taiwan': 8, 'Autres': 8
    }
  },
  {
    id: 'seed_s4_status',
    title: '你目前的狀態是？',
    titleFr: 'Quel est votre statut professionnel actuel ?',
    description: '想了解大家目前的狀態，方便未來分享 job / mission 或協助媒合。來自 WhatsApp 社群調查 / Sondage WhatsApp communautaire',
    type: 'multi', privacy: 'count_only', status: 'open',
    isLegacy: true, source: 'WhatsApp',
    createdAt: '2026-01-15T13:35:00.000Z',
    options: [
      { id: 'CDI',        label: '已在法國工作（CDI）' },
      { id: 'Freelance',  label: 'Freelance / Consultant' },
      { id: 'Searching',  label: '正在找新機會 (En recherche active)' },
      { id: 'Stable',     label: '目前穩定，但願意了解機會 (Stable, ouvert aux opportunités)' },
      { id: 'Hiring',     label: '公司有職缺，可分享資訊 (Mon entreprise recrute)' },
      { id: 'NewArrival', label: '剛到法國 / 準備來法國發展 (Nouvel arrivant / En préparation)' }
    ],
    legacyCounts: {
      'CDI': 17, 'Freelance': 4, 'Searching': 37,
      'Stable': 7, 'Hiring': 2, 'NewArrival': 10
    }
  }
];

const SEED_MEMBERS = (() => {
  const joined = '2026-01-15T00:00:00.000Z';
  return [
    'Chia-Hsin', 'Yu-Peng', 'Sabrina C.', 'Ashley', 'Paul',
    'Amber', 'Catherine', 'Chen-Yu', 'Chi', 'Chi Yun',
    'Chi-Wei', 'Chia Lun', 'Chiawei', 'Chieh Yang', 'Chieh Yu Chen',
    'Chiung-Yueh', 'Chris', 'CJ Eileen', 'EJ', 'Ella Chenyu Chen',
    'Enli Jen', 'Fay', 'Fuwei', 'Houwen', 'HWC',
    'I-Chun', 'IChing (Yi-Jin) Chen', 'James', 'Jenny Yen', 'Johnny',
    'Karen', 'Kevin', 'Kevin (2)', 'Linghan Liao', 'Lu',
    'Manping', 'Miriam C.', 'Miya Lee', 'Nai Chieh Lin', 'Nancy',
    'Peggy Liao', 'Pz', 'S-P', 'Sanny', 'Sheepo',
    'Shuhan Chang (Shelly)', 'Sun', 'Sylvia', 'Tachun Lin', 'Terry TAN',
    'Tina', 'Vivi N', 'W', 'Wallace', 'Wan-Erh (Annie)',
    'Wen', 'Wen (2)', 'Wentzu 文慈', 'Yih-Dar', 'Yochen Shih',
    'Yu Ting Chao', 'Yu-Chuan Cheng', 'Yuhsin', 'Yun-Hsuan',
    'ZHANG ZUO AN (Joanne)', 'Zoe (lo-yi) Wu', 'Zoe T', 'Brett'
  ].map((name, i) => ({ id: 'seed_m_' + i, name, joinedAt: joined, note: '' }));
})();

// ══════════════════════════════════════════════════════════════
// ASSO MEMBER CONSTANTS
// ══════════════════════════════════════════════════════════════

const ASSO_GOALS = [
  { id: 'networking', zh: '擴展人脈與社群連結',              fr: 'Networking'      },
  { id: 'jobs',       zh: '獲取或分享科技業職缺機會',         fr: 'Job Opps'        },
  { id: 'knowledge',  zh: '技術交流與職涯經驗分享',           fr: 'Knowledge'       },
  { id: 'longterm',   zh: '探討在法長期發展（房產、退休、投資）', fr: 'Long terme'   },
  { id: 'local',      zh: '參與不同城市的在地線下小聚',       fr: 'Local Chapters'  },
  { id: 'info',       zh: '獲取法國生活實用資訊（行政、簽證、日常）', fr: 'Vie pratique' },
  { id: 'collab',     zh: '推動台法機構、學校或企業間的官方合作', fr: 'Collaboration' },
  { id: 'fiscal',     zh: '了解法國稅務與資產規劃',           fr: 'Fiscalité'       }
];

const ASSO_CITIES = ['Paris', 'Lyon', 'Toulouse', 'Bordeaux', 'Grenoble',
                     'Sophia Antipolis', 'Montpellier', 'Taiwan', 'Autres'];

// HelloAsso's "Pourquoi devenir membre officiel ?" answer text doesn't use the
// same wording as ASSO_GOALS, so goal checkboxes are inferred from keywords
// rather than an exact match.
const GOAL_KEYWORDS = {
  networking: ['network', 'réseau', 'reseau', '人脈', '社群', '連結'],
  jobs:       ['job', 'emploi', '職缺', '機會'],
  knowledge:  ['carrière', 'carriere', '職涯', '技術交流', 'knowledge', '經驗分享'],
  longterm:   ['long terme', 'longterme', '長期', '房產', '退休', '投資', 'retraite', 'immobilier', 'investissement'],
  local:      ['local', 'chapter', '在地', '線下', '小聚'],
  info:       ['pratique', 'vie pratique', '生活', '簽證', '行政'],
  collab:     ['collaboration', '合作', '機構'],
  fiscal:     ['fiscal', 'fiscalité', 'fiscalite', '稅務', '資產規劃']
};

function inferGoalsFromMotivation(text) {
  if (!text) return [];
  const t = text.toLowerCase();
  return ASSO_GOALS
    .filter(g => (GOAL_KEYWORDS[g.id] || []).some(kw => t.includes(kw.toLowerCase())))
    .map(g => g.id);
}

// ══════════════════════════════════════════════════════════════
// DYNAMIC STATE — only user-created content (Firebase + cache)
// ══════════════════════════════════════════════════════════════

const _DYN_KEY = STORE_KEY + '_dyn';

function _emptyDynamic() {
  return { addedMembers: [], announcements: [], jobs: [], sharings: [], meetings: [], expenses: [], surveyVotes: {}, userSurveys: [], assoMembers: [] };
}

// Load dynamic data from localStorage cache (fast, instant)
// Returns { dyn, savedAt } where savedAt is the timestamp of the last local save
function loadDynamic() {
  try {
    const raw = localStorage.getItem(_DYN_KEY);
    if (!raw) return { dyn: _emptyDynamic(), savedAt: 0 };
    const p = JSON.parse(raw);
    return {
      savedAt: p.savedAt || 0,
      dyn: {
        addedMembers:  Array.isArray(p.addedMembers)  ? p.addedMembers  : [],
        announcements: Array.isArray(p.announcements) ? p.announcements : [],
        jobs:          Array.isArray(p.jobs)           ? p.jobs          : [],
        sharings:      Array.isArray(p.sharings)       ? p.sharings      : [],
        meetings:      Array.isArray(p.meetings)       ? p.meetings      : [],
        expenses:      Array.isArray(p.expenses)       ? p.expenses      : [],
        surveyVotes:   (p.surveyVotes && typeof p.surveyVotes === 'object') ? p.surveyVotes : {},
        userSurveys:   Array.isArray(p.userSurveys)   ? p.userSurveys   : [],
        assoMembers:   Array.isArray(p.assoMembers)    ? p.assoMembers   : []
      }
    };
  } catch (_) { return { dyn: _emptyDynamic(), savedAt: 0 }; }
}

function _saveDynLocal(dyn) {
  const savedAt = Date.now();
  localStorage.setItem(_DYN_KEY, JSON.stringify({ ...dyn, savedAt }));
  return savedAt;
}

// Merge static seeds + dynamic user data into the shared `state` object
function rebuildState(dyn) {
  const votes = dyn.surveyVotes || {};
  state.surveys      = SEED_SURVEYS.map(s => ({ ...s, votesByMember: votes[s.id] || {} }))
                         .concat((dyn.userSurveys || []).map(s => ({
                           ...s,
                           votesByMember: votes[s.id] || s.votesByMember || {}
                         })));
  state.members      = [...SEED_MEMBERS, ...(dyn.addedMembers || [])];
  state.announcements = dyn.announcements || [];
  state.jobs          = dyn.jobs          || [];
  state.sharings      = dyn.sharings      || [];
  state.meetings      = dyn.meetings      || [];
  state.expenses      = dyn.expenses      || [];
  state.assoMembers   = dyn.assoMembers   || [];
}

// Extract only dynamic user data from state (what gets saved to Firebase)
function extractDynamic() {
  return {
    addedMembers:  state.members.filter(m => !m.id.startsWith('seed_m_')),
    announcements: state.announcements,
    jobs:          state.jobs,
    sharings:      state.sharings,
    meetings:      state.meetings,
    expenses:      state.expenses,
    surveyVotes:   Object.fromEntries(
                     state.surveys.map(s => [s.id, s.votesByMember || {}])
                   ),
    userSurveys:   state.surveys.filter(s => !s.isLegacy),
    assoMembers:   state.assoMembers
  };
}

// Save dynamic data to localStorage + Firebase
function saveState() {
  const dyn = extractDynamic();
  _saveDynLocal(dyn);
  _fbWrite(dyn);
}

// ── Shared state object (always has seeds, dynamic parts filled immediately from cache)
const state = { members: [], surveys: [], sharings: [], meetings: [], expenses: [], announcements: [], jobs: [], assoMembers: [], adminProfiles: [] };
rebuildState(loadDynamic().dyn); // instant render from localStorage cache

// ensureSeed is now a no-op — seeds are always applied via rebuildState()
function ensureSeed() {}

// ── Compute merged vote counts for a survey ────────────────────
function computeCounts(survey) {
  const counts = {};
  // Start with legacy base counts
  if (survey.legacyCounts) {
    for (const [k, v] of Object.entries(survey.legacyCounts)) {
      counts[k] = (counts[k] || 0) + v;
    }
  }
  // Add live votes by member
  if (survey.votesByMember) {
    for (const votes of Object.values(survey.votesByMember)) {
      for (const optId of votes) {
        counts[optId] = (counts[optId] || 0) + 1;
      }
    }
  }
  return counts;
}

// ── Compute KPIs ───────────────────────────────────────────────
function computeKPIs(st) {
  return {
    totalMembers: st.members.length,
    jobCount:     (st.jobs          || []).length,
    eventCount:   (st.announcements || []).length
  };
}

// ── KPI render ─────────────────────────────────────────────────
function renderKPIs() {
  const kpi = computeKPIs(state);
  const elM = document.getElementById('kpi-members');
  const elJ = document.getElementById('kpi-jobs');
  const elE = document.getElementById('kpi-events');
  if (elM) elM.textContent = kpi.totalMembers;
  if (elJ) elJ.textContent = kpi.jobCount;
  if (elE) elE.textContent = kpi.eventCount;
}

// ── Tab switching ──────────────────────────────────────────────
function setTab(name) {
  document.querySelectorAll('.sm-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.dataset.tab === name);
  });

  if (name === 'dashboard') renderDashboard();
  if (name === 'members')   renderMembers();
  if (name === 'asso')      renderAssoMembers();
  if (name === 'surveys')   renderSurveys();
  if (name === 'sharing')   renderSharings();
  if (name === 'meetings')  renderMeetings();
  if (name === 'comptable') renderComptable();
}

// ── Dashboard ─────────────────────────────────────────────────
function renderDashboard() {
  renderKPIs();
  renderAnnouncements();
  renderJobs();
  renderTechChart();
  renderInvestChart();
  renderCityChart();
  renderStatusChart();
}

function renderTechChart() {
  const survey = state.surveys.find(s => s.id === 'seed_s1_tech');
  const canvas = document.getElementById('chart-tech');
  if (!canvas) return;

  if (_chartTech) { _chartTech.destroy(); _chartTech = null; }

  if (!survey) { canvas.parentElement.innerHTML = '<p class="sm-empty" style="padding:1rem;color:#94a3b8;font-size:0.8rem;">Sondage tech introuvable.</p>'; return; }

  const counts = computeCounts(survey);
  const labels = survey.options.map(o => o.label);
  const data   = survey.options.map(o => counts[o.id] || 0);

  const total = data.reduce((a, b) => a + b, 0);

  _chartTech = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Réponses',
        data,
        backgroundColor: PALETTE.map(c => c + 'cc'),
        borderColor: PALETTE,
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      layout: { padding: { right: 48 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pct = total > 0 ? ((ctx.parsed.x / total) * 100).toFixed(1) : 0;
              return ` ${ctx.parsed.x} réponse${ctx.parsed.x !== 1 ? 's' : ''} (${pct}%)`;
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { stepSize: 1, font: { size: 11 } },
          grid: { color: '#f1f5f9' }
        },
        y: {
          ticks: { font: { size: 10 } }
        }
      }
    },
    plugins: [{
      id: 'barPctLabels',
      afterDatasetsDraw(chart) {
        const { ctx, data: d, scales: { x } } = chart;
        const tot = d.datasets[0].data.reduce((a, b) => a + b, 0);
        if (!tot) return;
        ctx.save();
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        chart.getDatasetMeta(0).data.forEach((bar, i) => {
          const val = d.datasets[0].data[i];
          if (!val) return;
          const pct = ((val / tot) * 100).toFixed(1);
          const xPos = x.getPixelForValue(val) + 5;
          ctx.fillStyle = '#64748b';
          ctx.fillText(`${pct}%`, xPos, bar.y);
        });
        ctx.restore();
      }
    }]
  });
}

function renderInvestChart() {
  const survey = state.surveys.find(s => s.id === 'seed_s2_invest');
  const canvas = document.getElementById('chart-invest');
  if (!canvas) return;

  if (_chartInvest) { _chartInvest.destroy(); _chartInvest = null; }

  if (!survey) { canvas.parentElement.innerHTML = '<p class="sm-empty" style="padding:1rem;color:#94a3b8;font-size:0.8rem;">Sondage investissement introuvable.</p>'; return; }

  const counts = computeCounts(survey);
  const labels = survey.options.map(o => o.label);
  const data   = survey.options.map(o => counts[o.id] || 0);

  const investTotal = data.reduce((a, b) => a + b, 0);

  _chartInvest = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: PALETTE.map(c => c + 'cc'),
        borderColor: '#fff',
        borderWidth: 2,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      cutout: '55%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { size: 10 },
            padding: 10,
            boxWidth: 12,
            generateLabels(chart) {
              const ds = chart.data.datasets[0];
              return chart.data.labels.map((lbl, i) => {
                const val = ds.data[i];
                const pct = investTotal > 0 ? ((val / investTotal) * 100).toFixed(1) : 0;
                return {
                  text: `${lbl}  ${pct}%`,
                  fillStyle: ds.backgroundColor[i],
                  strokeStyle: ds.borderColor[i] || '#fff',
                  lineWidth: 1,
                  index: i,
                  hidden: false
                };
              });
            }
          }
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pct = investTotal > 0 ? ((ctx.parsed / investTotal) * 100).toFixed(1) : 0;
              return ` ${ctx.parsed} réponse${ctx.parsed !== 1 ? 's' : ''} — ${pct}%`;
            }
          }
        }
      }
    },
    plugins: [{
      id: 'doughnutPctLabels',
      afterDatasetsDraw(chart) {
        const { ctx, chartArea: { width, height, left, top } } = chart;
        const tot = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
        if (!tot) return;
        const cx = left + width / 2;
        const cy = top  + height / 2;
        ctx.save();
        chart.getDatasetMeta(0).data.forEach((arc, i) => {
          const val = chart.data.datasets[0].data[i];
          if (!val) return;
          const pct = ((val / tot) * 100).toFixed(1);
          if (parseFloat(pct) < 4) return; // skip tiny slices
          const angle  = (arc.startAngle + arc.endAngle) / 2;
          const radius = (arc.innerRadius + arc.outerRadius) / 2;
          const x = cx + Math.cos(angle) * radius;
          const y = cy + Math.sin(angle) * radius;
          ctx.font      = 'bold 11px system-ui, sans-serif';
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${pct}%`, x, y);
        });
        ctx.restore();
      }
    }]
  });
}

function renderCityChart() {
  const survey = state.surveys.find(s => s.id === 'seed_s3_city');
  const canvas  = document.getElementById('chart-city');
  if (!canvas) return;
  if (_chartCity) { _chartCity.destroy(); _chartCity = null; }
  if (!survey) return;

  const counts = computeCounts(survey);
  const labels = survey.options.map(o => o.label);
  const data   = survey.options.map(o => counts[o.id] || 0);

  const cityTotal = data.reduce((a, b) => a + b, 0);

  _chartCity = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Membres',
        data,
        backgroundColor: PALETTE.map(c => c + 'cc'),
        borderColor: PALETTE,
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      layout: { padding: { right: 48 } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => {
          const pct = cityTotal > 0 ? ((ctx.parsed.x / cityTotal) * 100).toFixed(1) : 0;
          return ` ${ctx.parsed.x} membre${ctx.parsed.x !== 1 ? 's' : ''} (${pct}%)`;
        }}}
      },
      scales: {
        x: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: '#f1f5f9' } },
        y: { ticks: { font: { size: 10 } } }
      }
    },
    plugins: [{
      id: 'cityPctLabels',
      afterDatasetsDraw(chart) {
        const { ctx, data: d, scales: { x } } = chart;
        const tot = d.datasets[0].data.reduce((a, b) => a + b, 0);
        if (!tot) return;
        ctx.save();
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        chart.getDatasetMeta(0).data.forEach((bar, i) => {
          const val = d.datasets[0].data[i];
          if (!val) return;
          const pct = ((val / tot) * 100).toFixed(1);
          ctx.fillStyle = '#64748b';
          ctx.fillText(`${pct}%`, x.getPixelForValue(val) + 5, bar.y);
        });
        ctx.restore();
      }
    }]
  });
}

function renderStatusChart() {
  const survey = state.surveys.find(s => s.id === 'seed_s4_status');
  const canvas  = document.getElementById('chart-status');
  if (!canvas) return;
  if (_chartStatus) { _chartStatus.destroy(); _chartStatus = null; }
  if (!survey) return;

  const counts = computeCounts(survey);
  const labels = survey.options.map(o => o.label);
  const data   = survey.options.map(o => counts[o.id] || 0);

  const statusTotal = data.reduce((a, b) => a + b, 0);

  _chartStatus = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: PALETTE.map(c => c + 'cc'),
        borderColor: '#fff',
        borderWidth: 2,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      cutout: '55%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { size: 10 }, padding: 10, boxWidth: 12,
            generateLabels(chart) {
              const ds = chart.data.datasets[0];
              return chart.data.labels.map((lbl, i) => {
                const val = ds.data[i];
                const pct = statusTotal > 0 ? ((val / statusTotal) * 100).toFixed(1) : 0;
                return {
                  text: `${lbl}  ${pct}%`,
                  fillStyle: ds.backgroundColor[i],
                  strokeStyle: '#fff',
                  lineWidth: 1,
                  index: i,
                  hidden: false
                };
              });
            }
          }
        },
        tooltip: { callbacks: { label: ctx => {
          const pct = statusTotal > 0 ? ((ctx.parsed / statusTotal) * 100).toFixed(1) : 0;
          return ` ${ctx.parsed} réponse${ctx.parsed !== 1 ? 's' : ''} — ${pct}%`;
        }}}
      }
    },
    plugins: [{
      id: 'statusPctLabels',
      afterDatasetsDraw(chart) {
        const { ctx, chartArea: { width, height, left, top } } = chart;
        const tot = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
        if (!tot) return;
        const cx = left + width / 2;
        const cy = top  + height / 2;
        ctx.save();
        chart.getDatasetMeta(0).data.forEach((arc, i) => {
          const val = chart.data.datasets[0].data[i];
          if (!val) return;
          const pct = ((val / tot) * 100).toFixed(1);
          if (parseFloat(pct) < 4) return;
          const angle  = (arc.startAngle + arc.endAngle) / 2;
          const radius = (arc.innerRadius + arc.outerRadius) / 2;
          const x = cx + Math.cos(angle) * radius;
          const y = cy + Math.sin(angle) * radius;
          ctx.font      = 'bold 11px system-ui, sans-serif';
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${pct}%`, x, y);
        });
        ctx.restore();
      }
    }]
  });
}

// ── Members tab ────────────────────────────────────────────────
function renderMembers(filter = '') {
  const container = document.getElementById('members-grid');
  if (!container) return;

  const query = (filter || document.getElementById('member-search')?.value || '').toLowerCase();
  const list = state.members.filter(m =>
    !query || m.name.toLowerCase().includes(query) || (m.note || '').toLowerCase().includes(query)
  );

  if (list.length === 0) {
    container.innerHTML = `
      <div class="sm-empty" style="grid-column:1/-1;">
        <i class="fas fa-users"></i>
        <h3>Aucun membre${query ? ' trouvé' : ''}</h3>
        <p>${query ? 'Essayez un autre terme de recherche.' : 'Cliquez sur « + Ajouter membre » pour commencer.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = list.map(m => {
    const initials = m.name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
    return `
      <div class="sm-member-card" data-id="${escHtml(m.id)}" onclick="openMemberModal('${escHtml(m.id)}')">
        <div class="sm-member-avatar">${escHtml(initials)}</div>
        <div class="sm-member-name">${escHtml(m.name)}</div>
        <div class="sm-member-joined"><i class="fas fa-calendar-alt" style="margin-right:0.3rem;opacity:0.5;"></i>${fmtDate(m.joinedAt)}</div>
        ${m.note ? `<div class="sm-member-note">${escHtml(m.note)}</div>` : ''}
      </div>`;
  }).join('');
}

// ── Asso Membres tab ───────────────────────────────────────────
function renderAssoMembers() {
  const container = document.getElementById('asso-grid');
  if (!container) return;

  const query   = (document.getElementById('asso-search')?.value   || '').toLowerCase();
  const cityFlt = (document.getElementById('asso-city-filter')?.value || '');

  const adminEmails = (typeof ADMIN_EMAILS !== 'undefined' && Array.isArray(ADMIN_EMAILS))
    ? ADMIN_EMAILS.map(email => email.trim().toLowerCase())
    : [];
  const adminEmailSet = new Set(adminEmails);
  const adminProfileMap = new Map(
    (state.adminProfiles || []).map(profile => [(profile.email || '').trim().toLowerCase(), profile])
  );
  const officialEmailSet = new Set(
    (state.assoMembers || []).map(member => (member.email || '').trim().toLowerCase())
  );
  const officialRows = (state.assoMembers || []).map(member => {
    const email = (member.email || '').trim().toLowerCase();
    const isAdmin = adminEmailSet.has(email);
    const adminProfile = isAdmin ? adminProfileMap.get(email) : null;
    return {
      ...member,
      ...(adminProfile || {}),
      id: member.id,
      email: member.email,
      name: member.name,
      joinedAt: member.joinedAt,
      _isOfficial: true,
      _isAdmin: isAdmin
    };
  });
  const adminOnlyRows = adminEmails
    .filter(email => !officialEmailSet.has(email))
    .map(email => ({
      id: `admin_view_${email}`,
      email,
      name: email.split('@')[0],
      source: 'admin',
      ...(adminProfileMap.get(email) || {}),
      _isOfficial: false,
      _isAdmin: true
    }));

  const list = [...officialRows, ...adminOnlyRows].filter(m => {
    const matchQ    = !query   || (m.name || '').toLowerCase().includes(query) ||
                      (m.nickname || '').toLowerCase().includes(query) ||
                      (m.email || '').toLowerCase().includes(query)    ||
                      (m.job  || '').toLowerCase().includes(query)     ||
                      (m.expertise || '').toLowerCase().includes(query) ||
                      (m.intro|| '').toLowerCase().includes(query);
    const matchCity = !cityFlt || m.city === cityFlt;
    return matchQ && matchCity;
  });

  if (list.length === 0) {
    container.innerHTML = `
      <div class="sm-empty" style="grid-column:1/-1;">
        <i class="fas fa-landmark"></i>
        <h3>Aucun membre officiel${query || cityFlt ? ' trouvé' : ''}</h3>
        <p>${query || cityFlt ? 'Essayez un autre filtre.' : 'Cliquez sur « + Ajouter membre Asso » pour enregistrer le premier membre officiel.'}</p>
      </div>`;
    return;
  }

  const goalMap = Object.fromEntries(ASSO_GOALS.map(g => [g.id, g.fr]));
  container.innerHTML = list.map(m => {
    const initials = (m.name || m.email || '?').split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const goals    = (m.goals || []).slice(0, 3).map(g =>
      `<span class="sm-asso-goal-badge">${escHtml(goalMap[g] || g)}</span>`
    ).join('') + (m.goals?.length > 3 ? `<span class="sm-asso-goal-badge sm-asso-goal-more">+${m.goals.length - 3}</span>` : '');
    const badge = m._isOfficial && m._isAdmin
      ? '<span class="sm-asso-paid-badge sm-asso-role-badge combined"><i class="fas fa-user-shield"></i> Membre officiel · Administrateur</span>'
      : m._isAdmin
        ? '<span class="sm-asso-paid-badge sm-asso-role-badge admin"><i class="fas fa-user-shield"></i> Administrateur</span>'
        : '<span class="sm-asso-paid-badge sm-asso-role-badge official"><i class="fas fa-check-circle"></i> Membre officiel</span>';
    const cardAction = m._isOfficial ? `onclick="openAssoMemberModal('${escHtml(m.id)}')"` : '';
    return `
      <div class="sm-member-card sm-asso-card${m._isOfficial ? '' : ' sm-admin-profile-card'}" data-id="${escHtml(m.id)}" ${cardAction}>
        <div class="sm-asso-card-top">
          <div class="sm-member-avatar sm-asso-avatar">${escHtml(initials)}</div>
          <div class="sm-asso-card-info">
            <div class="sm-member-name">${escHtml(m.name)}</div>
            ${m.nickname ? `<div class="sm-asso-city"><i class="fas fa-user-tag"></i> ${escHtml(m.nickname)}</div>` : ''}
            ${m.city ? `<div class="sm-asso-city"><i class="fas fa-map-marker-alt"></i> ${escHtml(m.city)}</div>` : ''}
            ${m.job  ? `<div class="sm-asso-job">${escHtml(m.job)}</div>` : ''}
            ${m.expertise ? `<div class="sm-asso-job" style="opacity:0.7;">${escHtml(m.expertise)}</div>` : ''}
          </div>
        </div>
        ${goals ? `<div class="sm-asso-goals">${goals}</div>` : ''}
        ${m.motivation ? `<div class="sm-asso-city" style="margin-top:0.3rem;"><i class="fas fa-comment-dots" style="opacity:0.6;"></i> ${escHtml(m.motivation.length > 80 ? m.motivation.slice(0, 80) + '…' : m.motivation)}</div>` : ''}
        <div class="sm-asso-card-footer">
          ${badge}
          ${m.linkedin ? `<a href="${escHtml(m.linkedin)}" target="_blank" onclick="event.stopPropagation()" class="sm-asso-linkedin"><i class="fab fa-linkedin"></i></a>` : ''}
        </div>
        <div class="sm-member-joined"><i class="fas fa-calendar-alt" style="margin-right:0.3rem;opacity:0.5;"></i>${fmtDate(m.joinedAt || m.createdAt)}</div>
      </div>`;
  }).join('');
}

let _assoModalId = null;

function openAssoMemberModal(id = null) {
  _assoModalId = id;
  const overlay = document.getElementById('asso-member-modal');
  const title   = document.getElementById('asso-modal-title');
  const delBtn  = document.getElementById('asso-modal-delete');

  // City dropdown
  const cityEl = document.getElementById('am-city');
  if (cityEl && !cityEl.dataset.built) {
    cityEl.innerHTML = '<option value="">— Sélectionner une ville —</option>' +
      ASSO_CITIES.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
    cityEl.dataset.built = '1';
  }

  // Goals checkboxes
  const goalsEl = document.getElementById('am-goals-list');
  if (goalsEl && !goalsEl.dataset.built) {
    goalsEl.innerHTML = ASSO_GOALS.map(g => `
      <label class="sm-asso-goal-check">
        <input type="checkbox" name="am-goal" value="${escHtml(g.id)}">
        <span>${escHtml(g.zh)} <em>(${escHtml(g.fr)})</em></span>
      </label>`).join('');
    goalsEl.dataset.built = '1';
  }

  if (id) {
    const m = state.assoMembers.find(x => x.id === id);
    if (!m) return;
    if (title) title.textContent = 'Modifier membre Asso';
    _setVal('am-name',     m.name);
    _setVal('am-nickname', m.nickname || '');
    _setVal('am-gender',   m.gender || '');
    _setVal('am-city',     m.city || '');
    _setVal('am-email',    m.email || '');
    _setVal('am-job',      m.job  || '');
    _setVal('am-expertise',m.expertise || '');
    _setVal('am-intro',    m.intro || '');
    _setVal('am-linkedin', m.linkedin || '');
    _setVal('am-phone',    m.phone || '');
    _setVal('am-helloasso',m.helloassoRef || '');
    _setVal('am-motivation',m.motivation || '');
    _setVal('am-joined',   m.joinedAt ? m.joinedAt.slice(0, 10) : '');
    _setChecked('am-accepts-rules', !!m.acceptsRules);
    _setChecked('am-notification-consent', !!m.notificationConsent);
    // Check goals — use saved selection if any, otherwise infer from the
    // free-text HelloAsso answer so it isn't shown empty on first edit.
    const effectiveGoals = (m.goals && m.goals.length) ? m.goals : inferGoalsFromMotivation(m.motivation);
    overlay.querySelectorAll('input[name="am-goal"]').forEach(cb => {
      cb.checked = effectiveGoals.includes(cb.value);
    });
    if (delBtn) delBtn.classList.remove('hidden');
  } else {
    if (title) title.textContent = 'Ajouter membre Asso · 新增協會成員';
    ['am-name','am-nickname','am-gender','am-email','am-city','am-job','am-expertise','am-intro','am-linkedin','am-phone','am-helloasso','am-motivation'].forEach(id => _setVal(id, ''));
    _setVal('am-joined', new Date().toISOString().slice(0, 10));
    _setChecked('am-accepts-rules', false);
    _setChecked('am-notification-consent', false);
    overlay?.querySelectorAll('input[name="am-goal"]').forEach(cb => { cb.checked = false; });
    if (delBtn) delBtn.classList.add('hidden');
  }

  if (overlay) overlay.classList.remove('hidden');
}

function _setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function _setChecked(id, checked) {
  const el = document.getElementById(id);
  if (el) el.checked = checked;
}

function closeAssoMemberModal() {
  _assoModalId = null;
  document.getElementById('asso-member-modal')?.classList.add('hidden');
}

function saveAssoMember() {
  const name = document.getElementById('am-name')?.value.trim();
  if (!name) { showToast('Le nom est obligatoire · 姓名為必填'); return; }

  const goals = [...document.querySelectorAll('input[name="am-goal"]:checked')].map(cb => cb.value);
  const existing = _assoModalId ? state.assoMembers.find(x => x.id === _assoModalId) : null;
  const acceptsRules = !!document.getElementById('am-accepts-rules')?.checked;
  const notificationConsent = !!document.getElementById('am-notification-consent')?.checked;
  const member = {
    name,
    nickname:     document.getElementById('am-nickname')?.value.trim() || '',
    gender:       document.getElementById('am-gender')?.value || '',
    email:        document.getElementById('am-email')?.value.trim() || '',
    city:         document.getElementById('am-city')?.value      || '',
    job:          document.getElementById('am-job')?.value.trim() || '',
    expertise:    document.getElementById('am-expertise')?.value.trim() || '',
    intro:        document.getElementById('am-intro')?.value.trim() || '',
    linkedin:     document.getElementById('am-linkedin')?.value.trim() || '',
    phone:        document.getElementById('am-phone')?.value.trim() || '',
    helloassoRef: document.getElementById('am-helloasso')?.value.trim() || '',
    motivation:   document.getElementById('am-motivation')?.value.trim() || '',
    joinedAt:     new Date(document.getElementById('am-joined')?.value || Date.now()).toISOString(),
    goals,
    acceptsRules,
    acceptsRulesAt: acceptsRules ? (existing?.acceptsRulesAt || new Date().toISOString()) : '',
    notificationConsent,
    notificationConsentAt: notificationConsent ? (existing?.notificationConsentAt || new Date().toISOString()) : ''
  };

  const dyn = extractDynamic();
  if (_assoModalId) {
    const idx = dyn.assoMembers.findIndex(x => x.id === _assoModalId);
    if (idx >= 0) dyn.assoMembers[idx] = { ...dyn.assoMembers[idx], ...member };
    showToast('Membre Asso mis à jour · 協會成員已更新');
  } else {
    dyn.assoMembers.push({ id: uid(), ...member });
    showToast('Membre Asso ajouté · 協會成員已新增');
  }

  rebuildState(dyn);
  _saveDynLocal(dyn);
  _fbWrite(dyn);
  closeAssoMemberModal();
  renderAssoMembers();
}

function deleteAssoMember() {
  if (!_assoModalId) return;
  if (!confirm('Supprimer ce membre officiel ? · 確定刪除此協會成員？')) return;

  const dyn = extractDynamic();
  const idx = dyn.assoMembers.findIndex(x => x.id === _assoModalId);
  if (idx < 0) return;
  dyn.assoMembers.splice(idx, 1);

  rebuildState(dyn);
  _saveDynLocal(dyn);
  _fbWrite(dyn);
  closeAssoMemberModal();
  renderAssoMembers();
  showToast('Membre supprimé · 已刪除');
}

function exportAssoCSV() {
  if (!state.assoMembers.length) { showToast('Aucun membre officiel à exporter.'); return; }

  const goalMap = Object.fromEntries(ASSO_GOALS.map(g => [g.id, g.fr]));
  const cols = ['Nom','Surnom','Genre','Email','Ville','Poste / Entreprise',"Domaine d'expertise",'Téléphone','LinkedIn','Relation / Objectifs','Intro','Pourquoi devenir membre','Statuts acceptés','Date acceptation statuts','Notifications acceptées','Date consentement notifications','Réf HelloAsso','Date adhésion'];

  const escape = v => `"${String(v || '').replace(/"/g, '""')}"`;

  const rows = state.assoMembers.map(m => [
    m.name,
    m.nickname     || '',
    m.gender       || '',
    m.email        || '',
    m.city         || '',
    m.job          || '',
    m.expertise    || '',
    m.phone        || '',
    m.linkedin     || '',
    (m.goals || []).map(g => goalMap[g] || g).join(' | '),
    m.intro        || '',
    m.motivation   || '',
    m.acceptsRules ? 'Oui' : 'Non',
    m.acceptsRulesAt ? m.acceptsRulesAt.slice(0, 10) : '',
    m.notificationConsent ? 'Oui' : 'Non',
    m.notificationConsentAt ? m.notificationConsentAt.slice(0, 10) : '',
    m.helloassoRef || '',
    m.joinedAt ? m.joinedAt.slice(0, 10) : ''
  ].map(escape).join(','));

  const csv  = [cols.map(escape).join(','), ...rows].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `ttf-asso-membres-${new Date().toISOString().slice(0,10)}.csv`
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Export CSV · ${state.assoMembers.length} membre(s)`);
}

// ── Sync Asso: trigger the HelloAsso → Firebase GitHub Action ───
// admin.html has no server, so this can't call the GitHub/HelloAsso APIs
// directly (that would require shipping a token in a public JS file).
// Instead: open the workflow's "Run workflow" page for the admin to
// confirm, then watch the *existing* real-time Firebase listener
// (initFirebase, below) for `dyn.lastAssoSync` — scripts/sync-helloasso.js
// writes that record on *every* run, even when it finds 0 new members, so
// the browser shows the exact same message the Action logged instead of
// guessing from a timeout.

const HELLOASSO_SYNC_WORKFLOW_URL =
  'https://github.com/ttf-tech/ttf-tech.github.io/actions/workflows/sync-helloasso.yml';
const ASSO_SYNC_WATCH_TIMEOUT_MS = 45 * 1000; // safety net only — real runs finish in ~10-15s

let _assoSyncWatching = false;
let _assoSyncTimer = null;
let _lastSeenAssoSyncTs = 0;

function _assoSyncStatus(text) {
  const el = document.getElementById('asso-sync-status');
  const textEl = document.getElementById('asso-sync-status-text');
  if (!el || !textEl) return;
  if (text) { textEl.textContent = text; el.style.display = 'block'; }
  else { el.style.display = 'none'; }
}

function triggerAssoSync() {
  _assoSyncWatching = true;
  clearTimeout(_assoSyncTimer);
  _assoSyncTimer = setTimeout(() => {
    if (!_assoSyncWatching) return;
    _assoSyncWatching = false;
    _assoSyncStatus(null);
    showToast('Pas encore de résultat — vérifiez sur GitHub Actions · 尚未收到結果，請至 GitHub Actions 確認', 10000);
  }, ASSO_SYNC_WATCH_TIMEOUT_MS);

  window.open(HELLOASSO_SYNC_WORKFLOW_URL, '_blank', 'noopener');
  _assoSyncStatus('En attente du résultat de synchronisation… · 等待同步結果…');
  showToast('Onglet GitHub ouvert : cliquez « Run workflow » pour lancer la synchro · 請在開啟的分頁點擊「Run workflow」開始同步', 6000);
}

// Called from initFirebase()'s real-time listener with the raw
// `dyn.lastAssoSync` record whenever fresh Firebase data arrives.
function handleLastAssoSync(sync) {
  if (!sync || !sync.ts || sync.ts <= _lastSeenAssoSyncTs) return;
  _lastSeenAssoSyncTs = sync.ts;
  if (!_assoSyncWatching) return; // ignore syncs from before the admin clicked the button

  _assoSyncWatching = false;
  clearTimeout(_assoSyncTimer);
  _assoSyncStatus(null);
  showToast(sync.message, 10000);
}

// ── Surveys tab ────────────────────────────────────────────────
function renderSurveys() {
  const container = document.getElementById('surveys-list');
  if (!container) return;

  if (state.surveys.length === 0) {
    container.innerHTML = `
      <div class="sm-empty">
        <i class="fas fa-poll"></i>
        <h3>Aucun sondage</h3>
        <p>Créez votre premier sondage via l'onglet « + Créer sondage ».</p>
      </div>`;
    return;
  }

  container.innerHTML = state.surveys.map(survey => buildSurveyCard(survey)).join('');

  // Bind action buttons
  container.querySelectorAll('[data-action="vote"]').forEach(btn => {
    btn.addEventListener('click', () => openVoteModal(btn.dataset.sid));
  });
  container.querySelectorAll('[data-action="toggle"]').forEach(btn => {
    btn.addEventListener('click', () => toggleSurveyStatus(btn.dataset.sid));
  });
  container.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteSurvey(btn.dataset.sid));
  });
}

function buildSurveyCard(survey) {
  const counts = computeCounts(survey);
  const total  = Object.values(counts).reduce((a, b) => a + b, 0);
  const isOpen = survey.status === 'open';

  const optBars = survey.options.map((opt, i) => {
    const count = counts[opt.id] || 0;
    const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
    const colorCls = 'color-' + (i % 9);

    let votersHtml = '';
    if (!survey.isLegacy && survey.privacy === 'show_voters') {
      const voters = Object.entries(survey.votesByMember || {})
        .filter(([, v]) => v.includes(opt.id))
        .map(([name]) => escHtml(name));
      votersHtml = voters.length
        ? `<div class="sm-option-voters">${voters.join(', ')}</div>`
        : '';
    }

    return `
      <div class="sm-option-row">
        <div class="sm-option-label-row">
          <span class="sm-option-label">${escHtml(opt.label)}</span>
          <span class="sm-option-count">${count} <span style="font-weight:400;color:#94a3b8;">(${pct}%)</span></span>
        </div>
        <div class="sm-bar-track">
          <div class="sm-bar-fill ${colorCls}" style="width:${pct}%;"></div>
        </div>
        ${votersHtml}
      </div>`;
  }).join('');

  const legacyBadge = survey.isLegacy
    ? `<span class="sm-badge sm-badge-legacy"><i class="fab fa-whatsapp"></i> WhatsApp (importé)</span>`
    : '';

  const toggleLabel = isOpen ? 'Clôturer' : 'Ré-ouvrir';
  const toggleIcon  = isOpen ? 'fa-lock' : 'fa-lock-open';

  const liveVoters = Object.keys(survey.votesByMember || {}).length;
  const footerInfo = survey.isLegacy
    ? `<span style="font-size:0.68rem;color:#94a3b8;margin-right:auto;">Total réponses : ${total}</span>`
    : `<span style="font-size:0.68rem;color:#94a3b8;margin-right:auto;">${liveVoters} votant${liveVoters !== 1 ? 's' : ''} · ${total} vote${total !== 1 ? 's' : ''}</span>`;

  return `
    <div class="sm-survey-card">
      <div class="sm-survey-header">
        <div class="sm-survey-title">${escHtml(survey.title)}</div>
        ${survey.titleFr ? `<div class="sm-survey-title-fr">${escHtml(survey.titleFr)}</div>` : ''}
        <div class="sm-survey-badges">
          ${legacyBadge}
          <span class="sm-badge ${isOpen ? 'sm-badge-open' : 'sm-badge-closed'}">
            <i class="fas ${isOpen ? 'fa-circle' : 'fa-check-circle'}"></i>
            ${isOpen ? 'Ouvert' : 'Clôturé'}
          </span>
          <span class="sm-badge ${survey.type === 'multi' ? 'sm-badge-multi' : 'sm-badge-single'}">
            ${survey.type === 'multi' ? 'Choix multiple' : 'Choix unique'}
          </span>
          <span class="sm-badge ${survey.privacy === 'show_voters' ? 'sm-badge-named' : 'sm-badge-anon'}">
            <i class="fas ${survey.privacy === 'show_voters' ? 'fa-eye' : 'fa-eye-slash'}"></i>
            ${survey.privacy === 'show_voters' ? 'Noms visibles' : 'Anonyme'}
          </span>
        </div>
        ${survey.description ? `<div style="font-size:0.75rem;color:#64748b;margin-top:0.25rem;">${escHtml(survey.description)}</div>` : ''}
        <div style="font-size:0.65rem;color:#94a3b8;margin-top:0.1rem;">
          Créé : ${fmtDate(survey.createdAt)}
          ${survey.closedAt ? ` · Clôturé : ${fmtDate(survey.closedAt)}` : ''}
          ${survey.source ? ` · Source : ${escHtml(survey.source)}` : ''}
        </div>
      </div>
      <div class="sm-options-list">${optBars}</div>
      <div class="sm-survey-footer">
        ${footerInfo}
        <button class="sm-btn-sm vote" data-action="vote" data-sid="${survey.id}"><i class="fas fa-vote-yea"></i> Voter</button>
        ${!survey.isLegacy ? `<button class="sm-btn-sm" data-action="toggle" data-sid="${survey.id}"><i class="fas ${toggleIcon}"></i> ${escHtml(toggleLabel)}</button>` : ''}
        ${!survey.isLegacy ? `<button class="sm-btn-sm danger" data-action="delete" data-sid="${survey.id}"><i class="fas fa-trash"></i> Supprimer</button>` : ''}
      </div>
    </div>`;
}

// ── Survey actions ─────────────────────────────────────────────
function toggleSurveyStatus(sid) {
  const survey = state.surveys.find(s => s.id === sid);
  if (!survey) return;
  if (survey.status === 'open') {
    survey.status = 'closed';
    survey.closedAt = new Date().toISOString();
  } else {
    survey.status = 'open';
    survey.closedAt = null;
  }
  saveState();
  renderSurveys();
  renderKPIs();
  showToast(survey.status === 'open' ? 'Sondage ré-ouvert.' : 'Sondage clôturé.');
}

function deleteSurvey(sid) {
  if (!confirm('Supprimer ce sondage et tous ses votes ?')) return;
  const idx = state.surveys.findIndex(s => s.id === sid);
  if (idx < 0) return;
  state.surveys.splice(idx, 1);
  saveState();
  renderSurveys();
  renderKPIs();
  showToast('Sondage supprimé.');
}

// ── Create survey ──────────────────────────────────────────────
function initCreateTab() {
  const addOptBtn = document.getElementById('add-option-btn');
  const createBtn = document.getElementById('create-survey-btn');
  if (addOptBtn) addOptBtn.addEventListener('click', addOptionRow);
  if (createBtn) createBtn.addEventListener('click', handleCreateSurvey);

  // Add two default option rows
  addOptionRow();
  addOptionRow();
}

function addOptionRow(value = '') {
  const builder = document.getElementById('option-builder');
  if (!builder) return;
  const row = document.createElement('div');
  row.className = 'sm-option-row-build';
  row.innerHTML = `
    <input type="text" class="sm-input builder-opt" placeholder="Libellé de l'option" value="${escHtml(value)}" style="flex:1;">
    <button class="sm-btn-remove" type="button"><i class="fas fa-times"></i></button>`;
  row.querySelector('.sm-btn-remove').addEventListener('click', () => row.remove());
  builder.appendChild(row);
}

function handleCreateSurvey() {
  const title   = document.getElementById('c-title')?.value.trim();
  const titleFr = document.getElementById('c-title-fr')?.value.trim();
  const desc    = document.getElementById('c-desc')?.value.trim();
  const type    = document.getElementById('c-type')?.value || 'multi';
  const privacy = document.getElementById('c-privacy')?.value || 'count_only';

  if (!title) { showToast('Veuillez saisir un titre.'); return; }

  const optEls = document.querySelectorAll('.builder-opt');
  const options = Array.from(optEls)
    .map(el => el.value.trim())
    .filter(Boolean)
    .map(label => ({ id: uid(), label }));

  if (options.length < 2) { showToast('Ajoutez au moins 2 options.'); return; }

  const survey = {
    id: uid(),
    title,
    titleFr: titleFr || '',
    description: desc || '',
    type,
    privacy,
    status: 'open',
    isLegacy: false,
    source: 'Manual',
    createdAt: new Date().toISOString(),
    closedAt: null,
    options,
    votesByMember: {},
    legacyCounts: {}
  };

  state.surveys.unshift(survey);
  saveState();

  // Reset form
  ['c-title', 'c-title-fr', 'c-desc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const builder = document.getElementById('option-builder');
  if (builder) builder.innerHTML = '';
  addOptionRow();
  addOptionRow();

  showToast('Sondage créé !');
  renderKPIs();
  setTab('surveys');
}

// ── Vote modal ─────────────────────────────────────────────────
let _voteModalSid = null;

function openVoteModal(sid) {
  const survey = state.surveys.find(s => s.id === sid);
  if (!survey || survey.status !== 'open') {
    showToast('Ce sondage est clôturé.');
    return;
  }
  _voteModalSid = sid;

  const overlay = document.getElementById('vote-modal');
  const title   = document.getElementById('vote-modal-title');
  const opts    = document.getElementById('vote-modal-options');
  const nameEl  = document.getElementById('vote-member-name');
  const datalist = document.getElementById('vote-member-datalist');

  if (title) title.textContent = survey.title;

  // Populate member datalist
  if (datalist) {
    datalist.innerHTML = state.members.map(m =>
      `<option value="${escHtml(m.name)}">`
    ).join('');
  }

  if (nameEl) nameEl.value = '';
  const errEl2 = document.getElementById('vote-name-error');
  if (errEl2) errEl2.style.display = 'none';

  // Build option inputs
  if (opts) {
    const inputType = survey.type === 'single' ? 'radio' : 'checkbox';
    opts.innerHTML = survey.options.map(opt => `
      <label class="sm-vote-option">
        <input type="${inputType}" name="vote-opt" value="${escHtml(opt.id)}">
        ${escHtml(opt.label)}
      </label>`).join('');
  }

  if (overlay) overlay.classList.remove('hidden');
}

function closeVoteModal() {
  _voteModalSid = null;
  const overlay = document.getElementById('vote-modal');
  if (overlay) overlay.classList.add('hidden');
}

function submitVote() {
  if (!_voteModalSid) return;
  const survey = state.surveys.find(s => s.id === _voteModalSid);
  if (!survey || survey.status !== 'open') {
    showToast('Sondage clôturé.');
    closeVoteModal();
    return;
  }

  const nameEl = document.getElementById('vote-member-name');
  const errEl  = document.getElementById('vote-name-error');
  const name   = nameEl?.value.trim();

  if (errEl) errEl.style.display = 'none';

  if (!name) { showToast('Veuillez saisir votre nom.'); return; }

  const isMember = state.members.some(m => m.name.trim().toLowerCase() === name.toLowerCase());
  if (!isMember) {
    if (errEl) {
      errEl.innerHTML =
        '<i class="fas fa-exclamation-triangle" style="margin-right:0.35rem;"></i>' +
        'Votre nom n\'est pas dans la liste des membres. Rendez-vous dans l\'onglet <strong>Membres</strong> pour créer votre profil.' +
        '<br><span style="opacity:0.8;">您的名字不在成員名單中，請先前往「<strong>成員</strong>」分頁建立您的成員資料後再投票。</span>';
      errEl.style.display = 'block';
    }
    if (nameEl) nameEl.focus();
    return;
  }

  const checked = Array.from(document.querySelectorAll('#vote-modal-options input:checked'))
    .map(el => el.value);

  if (checked.length === 0) { showToast('Sélectionnez au moins une option.'); return; }

  survey.votesByMember[name] = checked;
  saveState();
  closeVoteModal();
  renderSurveys();
  renderKPIs();
  showToast(`Vote de ${name} enregistré !`);
}

// ── Member modal ───────────────────────────────────────────────
let _memberModalId = null;

function openMemberModal(id = null) {
  _memberModalId = id;
  const overlay  = document.getElementById('member-modal');
  const title    = document.getElementById('member-modal-title');
  const nameEl   = document.getElementById('m-name');
  const joinEl   = document.getElementById('m-joined');
  const noteEl   = document.getElementById('m-note');
  const delBtn   = document.getElementById('member-modal-delete');
  const errEl    = document.getElementById('m-name-error');
  if (errEl) errEl.style.display = 'none'; // always clear on open

  if (id) {
    const m = state.members.find(x => x.id === id);
    if (!m) return;
    if (title)  title.textContent = 'Modifier le membre';
    if (nameEl) nameEl.value = m.name;
    if (joinEl) joinEl.value = m.joinedAt ? m.joinedAt.slice(0, 10) : '';
    if (noteEl) noteEl.value = m.note || '';
    if (delBtn) delBtn.classList.remove('hidden');
  } else {
    if (title)  title.textContent = 'Ajouter un membre';
    if (nameEl) nameEl.value = '';
    if (joinEl) joinEl.value = new Date().toISOString().slice(0, 10);
    if (noteEl) noteEl.value = '';
    if (delBtn) delBtn.classList.add('hidden');
  }

  if (overlay) overlay.classList.remove('hidden');
}

function closeMemberModal() {
  _memberModalId = null;
  const overlay = document.getElementById('member-modal');
  if (overlay) overlay.classList.add('hidden');
}

function saveMember() {
  const nameEl  = document.getElementById('m-name');
  const joinEl  = document.getElementById('m-joined');
  const noteEl  = document.getElementById('m-note');
  const errEl   = document.getElementById('m-name-error');

  const name   = nameEl?.value.trim();
  const joined = joinEl?.value;
  const note   = noteEl?.value.trim();

  if (errEl) errEl.style.display = 'none';

  if (!name) { showToast('Le nom est obligatoire.'); return; }

  // Duplicate name check — skip for edits of the same member
  const nameLower = name.toLowerCase();
  const duplicate = state.members.find(m =>
    m.name.trim().toLowerCase() === nameLower && m.id !== _memberModalId
  );
  if (duplicate) {
    if (errEl) {
      errEl.innerHTML =
        '<i class="fas fa-exclamation-triangle" style="margin-right:0.35rem;"></i>' +
        `<strong>Ce nom existe déjà · 名字已存在：「${duplicate.name}」</strong><br>` +
        'Veuillez utiliser un nom différent, par exemple en ajoutant un chiffre ou un prénom supplémentaire.<br>' +
        '<span style="opacity:0.8;">請更換名稱，例如：Terry Chen、Terry 2、Wei (Paris)…</span>';
      errEl.style.display = 'block';
    }
    nameEl?.focus();
    return;
  }

  // Work directly on addedMembers (non-seed) — never mutate SEED_MEMBERS
  const dyn = extractDynamic();

  if (_memberModalId) {
    // Could be editing a seed member (read-only) or an added member
    const added = dyn.addedMembers.find(x => x.id === _memberModalId);
    if (added) {
      added.name     = name;
      added.joinedAt = joined ? new Date(joined).toISOString() : added.joinedAt;
      added.note     = note;
    }
    // Seed members cannot be edited (their data is hardcoded)
    showToast('Membre mis à jour.');
  } else {
    dyn.addedMembers.push({
      id: uid(),
      name,
      joinedAt: joined ? new Date(joined).toISOString() : new Date().toISOString(),
      note
    });
    showToast('Membre ajouté.');
  }

  rebuildState(dyn);
  _saveDynLocal(dyn);
  _fbWrite(dyn);
  closeMemberModal();
  renderMembers();
  renderKPIs();
}

function deleteMember() {
  if (!_memberModalId) return;
  if (!confirm('Supprimer ce membre ?')) return;

  const dyn = extractDynamic();
  const idx = dyn.addedMembers.findIndex(x => x.id === _memberModalId);
  if (idx < 0) { showToast('Les membres initiaux ne peuvent pas être supprimés.'); return; }
  dyn.addedMembers.splice(idx, 1);

  rebuildState(dyn);
  _saveDynLocal(dyn);
  _fbWrite(dyn);
  closeMemberModal();
  renderMembers();
  renderKPIs();
  showToast('Membre supprimé.');
}

// ── Announcements ──────────────────────────────────────────────
const ANNC_TYPE_COLORS = {
  'Webinaire':  { bg: '#dbeafe', color: '#1d4ed8' },
  'Coffee Chat':{ bg: '#fce7f3', color: '#9d174d' },
  'Partage':    { bg: '#d1fae5', color: '#065f46' },
  'Networking': { bg: '#ede9fe', color: '#5b21b6' },
  'Autre':      { bg: '#f1f5f9', color: '#475569' }
};

const MONTH_FR = ['jan.','fév.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];

function renderAnnouncements() {
  const container = document.getElementById('annc-list');
  if (!container) return;

  const upcoming = [...state.announcements]
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (upcoming.length === 0) {
    container.innerHTML = `
      <div class="sm-annc-empty">
        <i class="fas fa-bullhorn"></i>
        Aucune annonce pour le moment · 目前沒有公告
      </div>`;
    return;
  }

  const now = new Date();
  container.innerHTML = upcoming.map(a => {
    const d = new Date(a.date);
    const isPast = d < now;
    const day   = d.getDate();
    const month = MONTH_FR[d.getMonth()];
    const time  = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const typeStyle = ANNC_TYPE_COLORS[a.type] || ANNC_TYPE_COLORS['Autre'];

    const meetBtn = a.link
      ? `<a class="sm-annc-meet-btn" href="${escHtml(a.link)}" target="_blank" rel="noopener">
           <i class="fas fa-video"></i> Rejoindre · 加入會議
         </a>`
      : '';

    return `
      <div class="sm-annc-card" ${isPast ? 'style="opacity:0.65;"' : ''}>
        <div class="sm-annc-date-col">
          <div class="sm-annc-day">${day}</div>
          <div class="sm-annc-month">${month}</div>
          <div class="sm-annc-time-badge">${time}</div>
        </div>
        <div class="sm-annc-body">
          <div class="sm-annc-card-meta">
            <span class="sm-annc-type-badge" style="background:${typeStyle.bg};color:${typeStyle.color};">${escHtml(a.type)}</span>
            <span class="sm-annc-host-tag"><i class="fas fa-user"></i>${escHtml(a.host)}</span>
          </div>
          <div class="sm-annc-card-title">${escHtml(a.title)}</div>
          ${a.description ? `<div class="sm-annc-card-desc">${escHtml(a.description)}</div>` : ''}
          ${meetBtn}
        </div>
        <div class="sm-annc-actions">
          <button class="sm-annc-edit-btn" data-action="edit-annc" data-aid="${a.id}">
            <i class="fas fa-edit"></i> Modifier
          </button>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('[data-action="edit-annc"]').forEach(btn => {
    btn.addEventListener('click', () => openAnncModal(btn.dataset.aid));
  });
}

// ── Announcement modal ─────────────────────────────────────────
let _anncModalId = null;

function openAnncModal(id = null) {
  _anncModalId = id;
  const overlay  = document.getElementById('annc-modal');
  const titleEl  = document.getElementById('annc-modal-title');
  const delBtn   = document.getElementById('annc-modal-delete');
  const authorEl = document.getElementById('annc-author');
  const errEl    = document.getElementById('annc-author-error');
  const dl1      = document.getElementById('annc-author-datalist');
  const dl2      = document.getElementById('annc-host-datalist');

  // Populate member datalists
  const opts = state.members.map(m => `<option value="${escHtml(m.name)}">`).join('');
  if (dl1) dl1.innerHTML = opts;
  if (dl2) dl2.innerHTML = opts;
  if (errEl) errEl.style.display = 'none';

  if (id) {
    const a = state.announcements.find(x => x.id === id);
    if (!a) return;
    if (titleEl) titleEl.textContent = 'Modifier l\'annonce · 修改公告';
    if (delBtn)  delBtn.classList.remove('hidden');
    if (authorEl) authorEl.value = a.author || '';
    _fillAnncForm(a);
  } else {
    if (titleEl) titleEl.textContent = 'Nouvelle annonce · 新增公告';
    if (delBtn)  delBtn.classList.add('hidden');
    if (authorEl) authorEl.value = '';
    _clearAnncForm();
  }

  if (overlay) overlay.classList.remove('hidden');
}

function _fillAnncForm(a) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('annc-title',         a.title);
  set('annc-date',          a.date ? a.date.slice(0, 16) : '');
  set('annc-host',          a.host);
  set('annc-type',          a.type || 'Webinaire');
  set('annc-desc',          a.description || '');
  set('annc-link',          a.link || '');
  set('annc-replay',        a.replayUrl || '');
  set('annc-slides',        a.slideUrl  || '');
  set('annc-speaker-title', a.speakerTitle || '');
  set('annc-topics',        Array.isArray(a.topics) ? a.topics.join(', ') : (a.topics || ''));
}

function _clearAnncForm() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('annc-title', '');
  const now = new Date();
  set('annc-date', new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  set('annc-host',          '');
  set('annc-type',          'Webinaire');
  set('annc-desc',          '');
  set('annc-link',          '');
  set('annc-replay',        '');
  set('annc-slides',        '');
  set('annc-speaker-title', '');
  set('annc-topics',        '');
}

function closeAnncModal() {
  _anncModalId = null;
  const overlay = document.getElementById('annc-modal');
  if (overlay) overlay.classList.add('hidden');
}

function saveAnnc() {
  const get    = id => document.getElementById(id)?.value.trim() || '';
  const author = get('annc-author');
  const title  = get('annc-title');
  const date   = get('annc-date');
  const host   = get('annc-host');
  const errEl  = document.getElementById('annc-author-error');

  if (errEl) errEl.style.display = 'none';

  // Member gate
  if (!author) { showToast('Veuillez saisir votre nom.'); return; }
  const isMember = state.members.some(m => m.name.trim().toLowerCase() === author.toLowerCase());
  if (!isMember) {
    if (errEl) {
      errEl.innerHTML =
        '<i class="fas fa-exclamation-triangle" style="margin-right:0.35rem;"></i>' +
        'Vous devez être membre pour ajouter une annonce. Allez dans l\'onglet <strong>Membres</strong> pour créer votre profil.' +
        '<br><span style="opacity:0.8;">您必須是成員才能新增公告，請先前往「<strong>成員</strong>」分頁建立您的成員資料。</span>';
      errEl.style.display = 'block';
    }
    document.getElementById('annc-author')?.focus();
    return;
  }

  if (!title) { showToast('Veuillez saisir un titre.'); return; }
  if (!date)  { showToast('Veuillez saisir une date.'); return; }
  if (!host)  { showToast('Veuillez saisir un hôte.'); return; }

  const desc         = get('annc-desc');
  const type         = get('annc-type');
  const link         = get('annc-link');
  const replayUrl    = get('annc-replay');
  const slideUrl     = get('annc-slides');
  const speakerTitle = get('annc-speaker-title');
  const topicsRaw    = get('annc-topics');
  const topics       = topicsRaw ? topicsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  if (_anncModalId) {
    const a = state.announcements.find(x => x.id === _anncModalId);
    if (a) {
      a.title        = title;
      a.date         = new Date(date).toISOString();
      a.host         = host;
      a.type         = type;
      a.description  = desc;
      a.link         = link;
      a.author       = author;
      a.replayUrl    = replayUrl;
      a.slideUrl     = slideUrl;
      a.speakerTitle = speakerTitle;
      a.topics       = topics;
    }
    showToast('Annonce mise à jour · 公告已更新');
  } else {
    state.announcements.unshift({
      id:           uid(),
      title,
      date:         new Date(date).toISOString(),
      host,
      type,
      description:  desc,
      link,
      author,
      replayUrl,
      slideUrl,
      speakerTitle,
      topics,
      createdAt:    new Date().toISOString()
    });
    showToast('Annonce ajoutée ! · 公告已新增！');
  }

  saveState();
  closeAnncModal();
  renderAnnouncements();
}

function deleteAnnc() {
  if (!_anncModalId) return;
  if (!confirm('Supprimer cette annonce ? · 確定刪除此公告？')) return;
  const idx = state.announcements.findIndex(x => x.id === _anncModalId);
  if (idx >= 0) state.announcements.splice(idx, 1);
  saveState();
  closeAnncModal();
  renderAnnouncements();
  showToast('Annonce supprimée · 公告已刪除');
}

// ── Job sharing block ──────────────────────────────────────────
const JOB_CONTRACT_COLORS = {
  'CDI':        { bg: '#dbeafe', color: '#1e40af' },
  'CDD':        { bg: '#fef3c7', color: '#92400e' },
  'Stage':      { bg: '#ede9fe', color: '#5b21b6' },
  'Alternance': { bg: '#fce7f3', color: '#9d174d' },
  'Freelance':  { bg: '#d1fae5', color: '#065f46' },
  'Autre':      { bg: '#f1f5f9', color: '#475569' }
};

const _JOB_EXPAND_LIMIT = 400;

function _makeExpandable(text, cls) {
  const escaped = escHtml(text);
  if (text.length <= _JOB_EXPAND_LIMIT) return `<div class="${cls}">${escaped}</div>`;
  const preview = escHtml(text.slice(0, _JOB_EXPAND_LIMIT));
  return `
    <div class="${cls} sm-expandable">
      <span class="sm-expandable-short">${preview}…</span>
      <span class="sm-expandable-full" style="display:none">${escaped}</span>
    </div>
    <button class="sm-job-expand-btn" type="button">展開 · Voir plus <i class="fas fa-chevron-down"></i></button>`;
}

function renderJobs() {
  const container = document.getElementById('job-list');
  if (!container) return;

  const list = [...(state.jobs || [])].sort((a, b) => {
    // Open jobs always before closed
    const statusDiff = (b.status === 'open' ? 1 : 0) - (a.status === 'open' ? 1 : 0);
    if (statusDiff !== 0) return statusDiff;
    // Within same status: most recent first
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  if (list.length === 0) {
    container.innerHTML = `
      <div class="sm-job-empty">
        <i class="fas fa-briefcase"></i>
        Aucune offre pour le moment · 目前沒有職缺分享
      </div>`;
    return;
  }

  container.innerHTML = list.map(j => {
    const contractStyle = JOB_CONTRACT_COLORS[j.contract] || JOB_CONTRACT_COLORS['Autre'];
    const cvBtn = j.email
      ? `<a class="sm-job-cv-btn" href="mailto:${escHtml(j.email)}?subject=${encodeURIComponent('Candidature – ' + j.title)}">
           <i class="fas fa-paper-plane"></i> Envoyer CV · 投遞履歷
         </a>`
      : '';
    const reqsBlock = j.requirements
      ? `<div class="sm-job-card-reqs">
           <div class="sm-job-card-reqs-label">【條件 / Conditions】</div>
           ${_makeExpandable(j.requirements, 'sm-job-card-reqs-body')}
         </div>`
      : '';
    const salaryBlock = j.salary
      ? `<div class="sm-job-salary"><i class="fas fa-coins" style="margin-right:0.25rem;"></i>${escHtml(j.salary)}</div>`
      : '';

    return `
      <div class="sm-job-card">
        <div class="sm-job-left">
          <div class="sm-job-card-meta">
            <span class="sm-job-contract-badge" style="background:${contractStyle.bg};color:${contractStyle.color};">${escHtml(j.contract)}</span>
            <span class="sm-job-location-tag"><i class="fas fa-map-marker-alt"></i>${escHtml(j.location)}</span>
            <span class="sm-job-poster-tag"><i class="fas fa-user"></i>${escHtml(j.poster)}</span>
          </div>
          <div class="sm-job-card-title">${escHtml(j.title)}</div>
          ${salaryBlock}
          ${_makeExpandable(j.description, 'sm-job-card-desc')}
          ${reqsBlock}
          ${cvBtn}
        </div>
        <div class="sm-job-actions">
          <button class="sm-job-edit-btn" data-action="edit-job" data-jid="${j.id}">
            <i class="fas fa-edit"></i> Modifier
          </button>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('[data-action="edit-job"]').forEach(btn => {
    btn.addEventListener('click', () => openJobModal(btn.dataset.jid));
  });
}

let _jobModalId = null;

function openJobModal(id = null) {
  _jobModalId = id;
  const overlay  = document.getElementById('job-modal');
  const titleEl  = document.getElementById('job-modal-title');
  const delBtn   = document.getElementById('job-modal-delete');
  const posterEl = document.getElementById('job-poster');
  const errEl    = document.getElementById('job-poster-error');
  const dl       = document.getElementById('job-poster-datalist');

  const opts = state.members.map(m => `<option value="${escHtml(m.name)}">`).join('');
  if (dl) dl.innerHTML = opts;
  if (errEl) errEl.style.display = 'none';

  if (id) {
    const j = (state.jobs || []).find(x => x.id === id);
    if (!j) return;
    if (titleEl) titleEl.textContent = 'Modifier l\'offre · 修改職缺';
    if (delBtn)  delBtn.classList.remove('hidden');
    if (posterEl) posterEl.value = j.poster || '';
    _fillJobForm(j);
  } else {
    if (titleEl) titleEl.textContent = 'Nouvelle offre · 新增職缺';
    if (delBtn)  delBtn.classList.add('hidden');
    if (posterEl) posterEl.value = '';
    _clearJobForm();
  }

  if (overlay) overlay.classList.remove('hidden');
}

function _fillJobForm(j) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('job-title',    j.title);
  set('job-company',  j.company || '');
  set('job-location', j.location);
  set('job-contract', j.contract || 'CDI');
  set('job-salary',   j.salary || '');
  set('job-desc',     j.description);
  set('job-reqs',     j.requirements || '');
  set('job-email',    j.email || '');
  set('job-expires',  j.expiresAt ? j.expiresAt.slice(0, 10) : '');
}

function _clearJobForm() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('job-title',    '');
  set('job-company',  '');
  set('job-location', '');
  set('job-contract', 'CDI');
  set('job-salary',   '');
  set('job-desc',     '');
  set('job-reqs',     '');
  set('job-email',    '');
  set('job-expires',  '');
}

function closeJobModal() {
  _jobModalId = null;
  const overlay = document.getElementById('job-modal');
  if (overlay) overlay.classList.add('hidden');
}

function saveJob() {
  const get    = id => document.getElementById(id)?.value.trim() || '';
  const poster = get('job-poster');
  const title  = get('job-title');
  const loc    = get('job-location');
  const email  = get('job-email');
  const errEl  = document.getElementById('job-poster-error');

  if (errEl) errEl.style.display = 'none';

  if (!poster) {
    if (errEl) {
      errEl.innerHTML = 'Veuillez indiquer votre nom de membre · 請輸入您的成員名稱。' +
        '<br><span style="opacity:0.8;">您必須是成員才能新增職缺，請先前往「<strong>成員</strong>」分頁建立您的成員資料。</span>';
      errEl.style.display = 'block';
    }
    document.getElementById('job-poster')?.focus();
    return;
  }
  const isMember = state.members.some(m => m.name.trim().toLowerCase() === poster.toLowerCase());
  if (!isMember) {
    if (errEl) {
      errEl.innerHTML = `« ${escHtml(poster)} » n'est pas reconnu comme membre · 此名稱非成員名單中的成員。` +
        '<br><span style="opacity:0.8;">請確認名稱與成員名單中一致，或先前往「<strong>成員</strong>」分頁新增您的資料。</span>';
      errEl.style.display = 'block';
    }
    document.getElementById('job-poster')?.focus();
    return;
  }

  if (!title)  { showToast('Veuillez saisir un titre de poste.'); return; }
  if (!loc)    { showToast('Veuillez saisir un lieu.'); return; }

  const contract  = get('job-contract') || 'CDI';
  const company   = get('job-company');
  const salary    = get('job-salary');
  const desc      = get('job-desc');
  const reqs      = get('job-reqs');
  const expiresRaw = get('job-expires');
  const expiresAt  = expiresRaw ? new Date(expiresRaw).toISOString() : '';

  if (!state.jobs) state.jobs = [];

  if (_jobModalId) {
    const j = state.jobs.find(x => x.id === _jobModalId);
    if (j) {
      j.poster       = poster;
      j.title        = title;
      j.company      = company;
      j.location     = loc;
      j.contract     = contract;
      j.salary       = salary;
      j.description  = desc;
      j.requirements = reqs;
      j.email        = email;
      j.expiresAt    = expiresAt;
    }
    showToast('Offre mise à jour · 職缺已更新');
  } else {
    state.jobs.unshift({
      id: uid(),
      poster,
      title,
      company,
      location:     loc,
      contract,
      salary,
      description:  desc,
      requirements: reqs,
      email,
      expiresAt,
      createdAt:    new Date().toISOString()
    });
    showToast('Offre ajoutée · 職缺已新增');
  }

  saveState();
  closeJobModal();
  renderJobs();
}

function deleteJob() {
  if (!_jobModalId) return;
  if (!confirm('Supprimer cette offre ? · 確定刪除此職缺？')) return;
  const idx = (state.jobs || []).findIndex(x => x.id === _jobModalId);
  if (idx >= 0) state.jobs.splice(idx, 1);
  saveState();
  closeJobModal();
  renderJobs();
  showToast('Offre supprimée · 職缺已刪除');
}

// ── Sharing tab ────────────────────────────────────────────────
const TAG_COLORS = {
  'Finance':  { bg: '#d1fae5', color: '#065f46' },
  'Tech':     { bg: '#dbeafe', color: '#1d4ed8' },
  'Visa':     { bg: '#ede9fe', color: '#5b21b6' },
  'Vie':      { bg: '#fef3c7', color: '#92400e' },
  'Carrière': { bg: '#fce7f3', color: '#9d174d' },
  'Autre':    { bg: '#f1f5f9', color: '#475569' }
};

function toEmbedUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    // Google Drive file: .../file/d/ID/view → .../file/d/ID/preview
    const driveFile = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (driveFile) {
      return `https://drive.google.com/file/d/${driveFile[1]}/preview`;
    }
    // Google Docs: /document/d/ID/...
    const gDoc = u.pathname.match(/\/document\/d\/([^/]+)/);
    if (gDoc) {
      return `https://docs.google.com/document/d/${gDoc[1]}/preview`;
    }
    // Google Slides: /presentation/d/ID/...
    const gSlides = u.pathname.match(/\/presentation\/d\/([^/]+)/);
    if (gSlides) {
      return `https://docs.google.com/presentation/d/${gSlides[1]}/preview`;
    }
    // Google Sheets: /spreadsheets/d/ID/...
    const gSheets = u.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    if (gSheets) {
      return `https://docs.google.com/spreadsheets/d/${gSheets[1]}/preview`;
    }
    return null;
  } catch (_) {
    return null;
  }
}

function renderSharings() {
  const container = document.getElementById('sharing-list');
  if (!container) return;

  if (state.sharings.length === 0) {
    container.innerHTML = `
      <div class="sm-empty">
        <i class="fas fa-lightbulb"></i>
        <h3>Aucun partage</h3>
        <p>Cliquez sur « + Nouveau partage » pour ajouter une session.</p>
      </div>`;
    return;
  }

  const sorted = [...state.sharings].sort((a, b) => new Date(b.date) - new Date(a.date));
  container.innerHTML = sorted.map(sh => buildSharingCard(sh)).join('');

  // Bind edit buttons
  container.querySelectorAll('[data-action="edit-sharing"]').forEach(btn => {
    btn.addEventListener('click', () => openSharingModal(btn.dataset.sid));
  });

  // Notes auto-save on blur
  container.querySelectorAll('.sm-sharing-notes-input').forEach(ta => {
    ta.addEventListener('blur', () => {
      const sh = state.sharings.find(s => s.id === ta.dataset.sid);
      if (sh && sh.notes !== ta.value) {
        sh.notes = ta.value;
        saveState();
        showToast('Notes sauvegardées.', 1500);
      }
    });
  });

  // Embed toggle buttons
  container.querySelectorAll('[data-action="toggle-embed"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = btn.dataset.sid;
      const frameWrap = document.getElementById('embed-' + sid);
      if (!frameWrap) return;
      const isHidden = frameWrap.style.display === 'none' || !frameWrap.style.display;
      frameWrap.style.display = isHidden ? 'block' : 'none';
      btn.innerHTML = isHidden
        ? '<i class="fas fa-compress-alt"></i> Masquer l\'aperçu'
        : '<i class="fas fa-expand-alt"></i> Aperçu';
    });
  });
}

function buildSharingCard(sh) {
  const tagStyle = sh.tag && TAG_COLORS[sh.tag]
    ? `background:${TAG_COLORS[sh.tag].bg};color:${TAG_COLORS[sh.tag].color};`
    : 'background:#f1f5f9;color:#475569;';

  const tagBadge = sh.tag
    ? `<span class="sm-sharing-tag" style="${tagStyle}">${escHtml(sh.tag)}</span>`
    : '';

  const dateStr = sh.date
    ? new Date(sh.date).toLocaleString('fr-FR', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })
    : '—';

  const descHtml = sh.description
    ? `<div class="sm-sharing-desc">${escHtml(sh.description)}</div>`
    : '';

  // Doc section
  let docSection = '';
  if (sh.docUrl) {
    const embedUrl = toEmbedUrl(sh.docUrl);
    const embedBtn = embedUrl
      ? `<button class="sm-sharing-embed-toggle" data-action="toggle-embed" data-sid="${sh.id}">
           <i class="fas fa-expand-alt"></i> Aperçu
         </button>`
      : '';
    const embedFrame = embedUrl
      ? `<div id="embed-${sh.id}" class="sm-sharing-embed-frame" style="display:none;">
           <iframe src="${escHtml(embedUrl)}" allowfullscreen loading="lazy"></iframe>
         </div>`
      : '';
    docSection = `
      <div class="sm-sharing-section">
        <div class="sm-sharing-section-label"><i class="fas fa-file-alt"></i> Document</div>
        <div class="sm-sharing-doc-row">
          <a class="sm-sharing-doc-btn" href="${escHtml(sh.docUrl)}" target="_blank" rel="noopener">
            <i class="fas fa-external-link-alt"></i> Ouvrir le document
          </a>
          ${embedBtn}
        </div>
        ${embedFrame}
      </div>`;
  }

  // Notes section (always visible)
  const notesSection = `
    <div class="sm-sharing-section">
      <div class="sm-sharing-section-label"><i class="fas fa-sticky-note"></i> Notes</div>
      <textarea class="sm-sharing-notes-input" data-sid="${sh.id}"
                placeholder="Ajouter des notes sur cette session… (sauvegarde automatique)"
                rows="3">${escHtml(sh.notes || '')}</textarea>
    </div>`;

  return `
    <div class="sm-sharing-card">
      <div class="sm-sharing-head">
        <div class="sm-sharing-meta">
          <span class="sm-sharing-date"><i class="fas fa-calendar-alt"></i>${dateStr}</span>
          <span class="sm-sharing-host"><i class="fas fa-user"></i>${escHtml(sh.host)}</span>
          ${tagBadge}
        </div>
        <div class="sm-sharing-title">${escHtml(sh.title)}</div>
        ${descHtml}
      </div>
      ${docSection}
      ${notesSection}
      <div class="sm-sharing-footer">
        <span class="sm-sharing-created">Ajouté le ${fmtDate(sh.createdAt)}</span>
        <button class="sm-btn-sm" data-action="edit-sharing" data-sid="${sh.id}">
          <i class="fas fa-edit"></i> Modifier
        </button>
      </div>
    </div>`;
}

// ── Sharing modal ──────────────────────────────────────────────
let _sharingModalId = null;

function openSharingModal(id = null) {
  _sharingModalId = id;
  const overlay = document.getElementById('sharing-modal');
  const titleEl = document.getElementById('sharing-modal-title');
  const delBtn  = document.getElementById('sharing-modal-delete');
  const datalist = document.getElementById('sh-host-datalist');

  // Populate member datalist for host field
  if (datalist) {
    datalist.innerHTML = state.members.map(m =>
      `<option value="${escHtml(m.name)}">`
    ).join('');
  }

  if (id) {
    const sh = state.sharings.find(s => s.id === id);
    if (!sh) return;
    if (titleEl) titleEl.textContent = 'Modifier le partage';
    if (delBtn)  delBtn.classList.remove('hidden');
    _fillSharingForm(sh);
  } else {
    if (titleEl) titleEl.textContent = 'Nouveau partage';
    if (delBtn)  delBtn.classList.add('hidden');
    _clearSharingForm();
  }

  if (overlay) overlay.classList.remove('hidden');
}

function _fillSharingForm(sh) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('sh-title', sh.title);
  // datetime-local expects "YYYY-MM-DDTHH:MM"
  set('sh-date', sh.date ? sh.date.slice(0, 16) : '');
  set('sh-host', sh.host);
  set('sh-tag',  sh.tag || '');
  set('sh-desc', sh.description || '');
  set('sh-doc',  sh.docUrl || '');
}

function _clearSharingForm() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('sh-title', '');
  // Default to now
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  set('sh-date', local);
  set('sh-host', '');
  set('sh-tag', '');
  set('sh-desc', '');
  set('sh-doc', '');
}

function closeSharingModal() {
  _sharingModalId = null;
  const overlay = document.getElementById('sharing-modal');
  if (overlay) overlay.classList.add('hidden');
}

function saveSharing() {
  const get = id => document.getElementById(id)?.value.trim() || '';
  const title = get('sh-title');
  const date  = get('sh-date');
  const host  = get('sh-host');
  if (!title) { showToast('Veuillez saisir un titre.'); return; }
  if (!date)  { showToast('Veuillez saisir une date.'); return; }
  if (!host)  { showToast('Veuillez saisir un hôte.'); return; }

  const docUrl = get('sh-doc');
  const tag    = get('sh-tag');
  const desc   = get('sh-desc');

  if (_sharingModalId) {
    const sh = state.sharings.find(s => s.id === _sharingModalId);
    if (sh) {
      sh.title       = title;
      sh.date        = new Date(date).toISOString();
      sh.host        = host;
      sh.tag         = tag;
      sh.description = desc;
      sh.docUrl      = docUrl;
    }
    showToast('Partage mis à jour.');
  } else {
    state.sharings.unshift({
      id:          uid(),
      title,
      date:        new Date(date).toISOString(),
      host,
      tag,
      description: desc,
      docUrl,
      notes:       '',
      createdAt:   new Date().toISOString()
    });
    showToast('Partage ajouté !');
  }

  saveState();
  closeSharingModal();
  renderSharings();
}

function deleteSharing() {
  if (!_sharingModalId) return;
  if (!confirm('Supprimer ce partage ?')) return;
  const idx = state.sharings.findIndex(s => s.id === _sharingModalId);
  if (idx >= 0) state.sharings.splice(idx, 1);
  saveState();
  closeSharingModal();
  renderSharings();
  showToast('Partage supprimé.');
}

// ── Meeting Points ─────────────────────────────────────────────
function renderMeetings() {
  const container = document.getElementById('meeting-list');
  if (!container) return;
  if (state.meetings.length === 0) {
    container.innerHTML = '<div style="padding:1.5rem;text-align:center;color:#94a3b8;font-size:0.82rem;">Aucune réunion enregistrée · 尚無會議記錄</div>';
    return;
  }
  const sorted = [...state.meetings].sort((a, b) => new Date(b.date) - new Date(a.date));
  container.innerHTML = sorted.map(mt => {
    const d = new Date(mt.date);
    const dateStr = d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
    const pointsHtml = mt.points
      ? mt.points.split('\n').filter(l => l.trim()).map(l =>
          `<li style="margin-bottom:0.25rem;">${escHtml(l.trim())}</li>`).join('')
      : '';
    return `
    <div class="sm-sharing-card" style="margin-bottom:0.65rem;">
      <div class="sm-sharing-head">
        <div class="sm-sharing-meta">
          <span class="sm-sharing-date"><i class="fas fa-calendar-alt"></i>${dateStr} ${timeStr}</span>
          <span class="sm-sharing-host"><i class="fas fa-user-edit"></i>${escHtml(mt.secretary)}</span>
          ${mt.attendees ? `<span class="sm-sharing-host" style="color:#0e7490;"><i class="fas fa-users"></i>${escHtml(mt.attendees)}</span>` : ''}
        </div>
        <button class="sm-btn-sm" data-action="edit-meeting" data-mid="${mt.id}" style="margin-left:auto;">
          <i class="fas fa-pen"></i> Modifier
        </button>
      </div>
      <div class="sm-sharing-title" style="text-align:center;font-size:1.05rem;padding:0.5rem 0 0.25rem;">${escHtml(mt.title)}</div>
      ${mt.points ? `
      <div class="sm-sharing-section" style="margin-top:0.6rem;">
        <div class="sm-sharing-section-label"><i class="fas fa-list-ul"></i> Points de réunion</div>
        <ul style="margin:0.4rem 0 0 1rem;padding:0;font-size:0.78rem;color:#334155;line-height:1.6;">${pointsHtml}</ul>
      </div>` : ''}
      ${mt.docUrl ? `
      <div class="sm-sharing-section" style="margin-top:0.5rem;">
        <div class="sm-sharing-section-label"><i class="fas fa-file-alt"></i> Document</div>
        <div class="sm-sharing-doc-row">
          <a class="sm-sharing-doc-btn" href="${escHtml(mt.docUrl)}" target="_blank" rel="noopener">
            <i class="fas fa-external-link-alt"></i> Ouvrir le document
          </a>
        </div>
      </div>` : ''}
      <div class="sm-sharing-footer">
        <span class="sm-sharing-created">Ajouté le ${fmtDate(mt.createdAt)}</span>
      </div>
    </div>`;
  }).join('');
  container.querySelectorAll('[data-action="edit-meeting"]').forEach(btn => {
    btn.addEventListener('click', () => openMeetingModal(btn.dataset.mid));
  });
}

let _meetingModalId = null;
function openMeetingModal(id = null) {
  _meetingModalId = id;
  const overlay = document.getElementById('meeting-modal');
  const titleEl = document.getElementById('meeting-modal-title');
  const delBtn  = document.getElementById('meeting-modal-delete');
  if (!overlay) return;
  if (id) {
    const mt = state.meetings.find(m => m.id === id);
    if (!mt) return;
    titleEl.textContent = 'Modifier la réunion';
    document.getElementById('mt-title').value     = mt.title      || '';
    document.getElementById('mt-date').value      = mt.date ? mt.date.slice(0,16) : '';
    document.getElementById('mt-secretary').value = mt.secretary  || '';
    document.getElementById('mt-attendees').value = mt.attendees  || '';
    document.getElementById('mt-points').value    = mt.points     || '';
    document.getElementById('mt-doc').value       = mt.docUrl     || '';
    delBtn.classList.remove('hidden');
  } else {
    titleEl.textContent = 'Nouvelle réunion · 新增會議記錄';
    document.getElementById('mt-title').value     = '';
    document.getElementById('mt-date').value      = new Date().toISOString().slice(0,16);
    document.getElementById('mt-secretary').value = '';
    document.getElementById('mt-attendees').value = '';
    document.getElementById('mt-points').value    = '';
    document.getElementById('mt-doc').value       = '';
    delBtn.classList.add('hidden');
  }
  // populate secretary datalist
  const dl = document.getElementById('mt-secretary-datalist');
  if (dl) { dl.innerHTML = ''; state.members.forEach(m => { const o = document.createElement('option'); o.value = m.name; dl.appendChild(o); }); }
  overlay.classList.remove('hidden');
}
function closeMeetingModal() {
  document.getElementById('meeting-modal')?.classList.add('hidden');
  _meetingModalId = null;
}
function saveMeeting() {
  const get = id => document.getElementById(id)?.value.trim() || '';
  const title     = get('mt-title');
  const date      = get('mt-date');
  const secretary = get('mt-secretary');
  if (!title)     { showToast('Veuillez saisir un titre.'); return; }
  if (!date)      { showToast('Veuillez saisir une date.'); return; }
  if (!secretary) { showToast('Veuillez saisir le nom du secrétaire.'); return; }
  const attendees = get('mt-attendees');
  const points    = document.getElementById('mt-points')?.value.trim() || '';
  const docUrl    = get('mt-doc');
  if (_meetingModalId) {
    const mt = state.meetings.find(m => m.id === _meetingModalId);
    if (mt) { mt.title = title; mt.date = new Date(date).toISOString(); mt.secretary = secretary; mt.attendees = attendees; mt.points = points; mt.docUrl = docUrl; }
    showToast('Réunion mise à jour.');
  } else {
    state.meetings.unshift({ id: uid(), title, date: new Date(date).toISOString(), secretary, attendees, points, docUrl, createdAt: new Date().toISOString() });
    showToast('Réunion ajoutée !');
  }
  saveState();
  closeMeetingModal();
  renderMeetings();
}
function deleteMeeting() {
  if (!_meetingModalId) return;
  if (!confirm('Supprimer cette réunion ?')) return;
  const idx = state.meetings.findIndex(m => m.id === _meetingModalId);
  if (idx >= 0) state.meetings.splice(idx, 1);
  saveState();
  closeMeetingModal();
  renderMeetings();
  showToast('Réunion supprimée.');
}

// ── Comptable ──────────────────────────────────────────────────
const EXPENSE_CATS = ['Frais bancaires','Cotisation membre','Matériel / Fournitures','Communication','Hébergement / Domaine','Événement','Remboursement','Autre'];
const MONTH_NAMES  = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function renderComptable() {
  const list = document.getElementById('expense-list');
  const summary = document.getElementById('comptable-summary');
  if (!list || !summary) return;

  const recettes  = state.expenses.filter(e => e.type === 'recette');
  const depenses  = state.expenses.filter(e => e.type === 'depense');
  const totalRec  = recettes.reduce((s,e) => s + (parseFloat(e.amount)||0), 0);
  const totalDep  = depenses.reduce((s,e) => s + (parseFloat(e.amount)||0), 0);
  const solde     = totalRec - totalDep;

  summary.innerHTML = `
    <div class="comptable-kpi-row">
      <div class="comptable-kpi" style="border-color:#10b981;">
        <div class="comptable-kpi-label"><i class="fas fa-arrow-down" style="color:#10b981;"></i> Total recettes</div>
        <div class="comptable-kpi-val" style="color:#10b981;">+${totalRec.toFixed(2)} €</div>
      </div>
      <div class="comptable-kpi" style="border-color:#ef4444;">
        <div class="comptable-kpi-label"><i class="fas fa-arrow-up" style="color:#ef4444;"></i> Total dépenses</div>
        <div class="comptable-kpi-val" style="color:#ef4444;">−${totalDep.toFixed(2)} €</div>
      </div>
      <div class="comptable-kpi" style="border-color:#6366f1;background:linear-gradient(135deg,#eef2ff,#fff);">
        <div class="comptable-kpi-label"><i class="fas fa-balance-scale" style="color:#6366f1;"></i> Solde actuel</div>
        <div class="comptable-kpi-val" style="color:${solde>=0?'#0f172a':'#dc2626'};">${solde>=0?'+':''}${solde.toFixed(2)} €</div>
      </div>
      <div class="comptable-kpi" style="border-color:#0e7490;">
        <div class="comptable-kpi-label"><i class="fas fa-receipt" style="color:#0e7490;"></i> Nb transactions</div>
        <div class="comptable-kpi-val" style="color:#0e7490;">${state.expenses.length}</div>
      </div>
    </div>`;

  // Build export period dropdown
  const periodsEl = document.getElementById('export-csv-periods');
  if (periodsEl) {
    if (state.expenses.length === 0) {
      periodsEl.innerHTML = '<div style="padding:0.6rem 0.75rem;font-size:0.78rem;color:#94a3b8;">Aucune transaction</div>';
    } else {
      const years  = [...new Set(state.expenses.map(e => new Date(e.date).getFullYear()))].sort((a,b)=>b-a);
      const months = [...new Set(state.expenses.map(e => {
        const d = new Date(e.date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      }))].sort().reverse();
      let html = `<button class="export-period-item" data-period="all" onclick="exportCSV('all')">
        <i class="fas fa-database"></i> Toutes les transactions
      </button>`;
      html += `<div style="padding:0.3rem 0.75rem;font-size:0.65rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-top:0.25rem;">Par année</div>`;
      years.forEach(yr => { html += `<button class="export-period-item" data-period="${yr}" onclick="exportCSV('${yr}')"><i class="fas fa-calendar-alt"></i> ${yr}</button>`; });
      html += `<div style="padding:0.3rem 0.75rem;font-size:0.65rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-top:0.25rem;">Par mois</div>`;
      months.forEach(mk => {
        const [yr, mo] = mk.split('-');
        html += `<button class="export-period-item" data-period="${mk}" onclick="exportCSV('${mk}')"><i class="fas fa-calendar-day"></i> ${MONTH_NAMES[parseInt(mo)-1]} ${yr}</button>`;
      });
      periodsEl.innerHTML = html;
    }
  }

  if (state.expenses.length === 0) {
    list.innerHTML = '<div style="padding:1.5rem;text-align:center;color:#94a3b8;font-size:0.82rem;">Aucune transaction enregistrée · 尚無交易記錄</div>';
    return;
  }

  // Group by month
  const byMonth = {};
  [...state.expenses].sort((a,b) => new Date(b.date)-new Date(a.date)).forEach(e => {
    const d = new Date(e.date);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(e);
  });

  list.innerHTML = Object.entries(byMonth).map(([monthKey, entries]) => {
    const [yr, mo] = monthKey.split('-');
    const monthLabel = `${MONTH_NAMES[parseInt(mo)-1]} ${yr}`;
    const monthRec = entries.filter(e=>e.type==='recette').reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
    const monthDep = entries.filter(e=>e.type==='depense').reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
    const rows = entries.map(e => {
      const isRec = e.type === 'recette';
      const d = new Date(e.date);
      const dateStr = d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'});
      return `
      <div class="comptable-row" data-eid="${e.id}">
        <div class="comptable-row-left">
          <span class="comptable-type-badge ${isRec?'badge-rec':'badge-dep'}">${isRec?'+ Recette':'− Dépense'}</span>
          <span class="comptable-date">${dateStr}</span>
          <span class="comptable-cat">${escHtml(e.category||'')}</span>
        </div>
        <div class="comptable-row-center">
          <span class="comptable-desc">${escHtml(e.description||'')}</span>
          ${e.fileUrl ? `<a href="${escHtml(e.fileUrl)}" target="_blank" rel="noopener" class="comptable-doc-link"><i class="fas fa-paperclip"></i> ${escHtml(e.fileName||'Document')}</a>` : ''}
        </div>
        <div class="comptable-row-right">
          <span class="comptable-amount ${isRec?'amount-rec':'amount-dep'}">${isRec?'+':'−'}${parseFloat(e.amount||0).toFixed(2)} €</span>
          <button class="sm-btn-sm" data-action="edit-expense" data-eid="${e.id}"><i class="fas fa-pen"></i></button>
        </div>
      </div>`;
    }).join('');
    return `
    <div class="comptable-month-group">
      <div class="comptable-month-header">
        <span><i class="fas fa-calendar-alt"></i> ${monthLabel}</span>
        <span style="font-size:0.72rem;gap:0.75rem;display:flex;">
          <span style="color:#10b981;">+${monthRec.toFixed(2)} €</span>
          <span style="color:#ef4444;">−${monthDep.toFixed(2)} €</span>
        </span>
      </div>
      ${rows}
    </div>`;
  }).join('');

  list.querySelectorAll('[data-action="edit-expense"]').forEach(btn => {
    btn.addEventListener('click', () => openExpenseModal(btn.dataset.eid));
  });
}

let _expenseModalId = null;
function openExpenseModal(id = null) {
  _expenseModalId = id;
  const overlay = document.getElementById('expense-modal');
  const titleEl = document.getElementById('expense-modal-title');
  const delBtn  = document.getElementById('expense-modal-delete');
  if (!overlay) return;
  if (id) {
    const e = state.expenses.find(x => x.id === id);
    if (!e) return;
    titleEl.textContent = 'Modifier la transaction';
    document.getElementById('exp-type').value        = e.type        || 'depense';
    document.getElementById('exp-date').value        = e.date ? e.date.slice(0,10) : '';
    document.getElementById('exp-amount').value      = e.amount      || '';
    document.getElementById('exp-category').value    = e.category    || '';
    document.getElementById('exp-description').value = e.description || '';
    document.getElementById('exp-fileurl').value     = e.fileUrl     || '';
    document.getElementById('exp-filename').value    = e.fileName    || '';
    delBtn.classList.remove('hidden');
  } else {
    titleEl.textContent = 'Nouvelle transaction · 新增交易';
    document.getElementById('exp-type').value        = 'depense';
    document.getElementById('exp-date').value        = new Date().toISOString().slice(0,10);
    document.getElementById('exp-amount').value      = '';
    document.getElementById('exp-category').value    = '';
    document.getElementById('exp-description').value = '';
    document.getElementById('exp-fileurl').value     = '';
    document.getElementById('exp-filename').value    = '';
    delBtn.classList.add('hidden');
  }
  _updateExpenseCategoryHint();
  overlay.classList.remove('hidden');
  document.getElementById('exp-amount')?.focus();
}
function _updateExpenseCategoryHint() {
  const type = document.getElementById('exp-type')?.value;
  const catSel = document.getElementById('exp-category');
  if (!catSel) return;
  const depCats = ['Frais bancaires','Matériel / Fournitures','Communication','Hébergement / Domaine','Événement','Remboursement','Autre'];
  const recCats = ['Cotisation membre','Adhésion (Allo Asso)','Subvention','Donation / Don','Parrainage','Remboursement reçu','Autre'];
  const cats = type === 'recette' ? recCats : depCats;
  const current = catSel.value;
  catSel.innerHTML = `<option value="">— Catégorie —</option>` + cats.map(c => `<option value="${c}" ${c===current?'selected':''}>${c}</option>`).join('');
}
function closeExpenseModal() {
  document.getElementById('expense-modal')?.classList.add('hidden');
  _expenseModalId = null;
}
function saveExpense() {
  const get = id => document.getElementById(id)?.value.trim() || '';
  const type   = get('exp-type');
  const date   = get('exp-date');
  const amount = get('exp-amount');
  if (!date)   { showToast('Veuillez saisir une date.'); return; }
  if (!amount || isNaN(parseFloat(amount))) { showToast('Montant invalide.'); return; }
  const category    = get('exp-category');
  const description = get('exp-description');
  const fileUrl     = get('exp-fileurl');
  const fileName    = get('exp-filename') || (fileUrl ? 'Document' : '');
  if (_expenseModalId) {
    const e = state.expenses.find(x => x.id === _expenseModalId);
    if (e) { e.type=type; e.date=new Date(date).toISOString(); e.amount=parseFloat(amount); e.category=category; e.description=description; e.fileUrl=fileUrl; e.fileName=fileName; }
    showToast('Transaction mise à jour.');
  } else {
    state.expenses.unshift({ id:uid(), type, date:new Date(date).toISOString(), amount:parseFloat(amount), category, description, fileUrl, fileName, createdAt:new Date().toISOString() });
    showToast('Transaction ajoutée !');
  }
  saveState();
  closeExpenseModal();
  renderComptable();
}
function exportCSV(period) {
  // Close dropdown
  document.getElementById('export-csv-dropdown')?.style && (document.getElementById('export-csv-dropdown').style.display = 'none');

  let rows = [...state.expenses].sort((a,b) => new Date(a.date)-new Date(b.date));
  let label = 'toutes';

  if (period !== 'all') {
    if (period.includes('-')) {
      // month filter: "2026-07"
      rows = rows.filter(e => new Date(e.date).toISOString().slice(0,7) === period);
      const [yr, mo] = period.split('-');
      label = `${MONTH_NAMES[parseInt(mo)-1]}-${yr}`;
    } else {
      // year filter: "2026"
      rows = rows.filter(e => String(new Date(e.date).getFullYear()) === String(period));
      label = period;
    }
  }

  if (rows.length === 0) { showToast('Aucune transaction pour cette période.'); return; }

  const totalRec = rows.filter(r=>r.type==='recette').reduce((s,r)=>s+(parseFloat(r.amount)||0),0);
  const totalDep = rows.filter(r=>r.type==='depense').reduce((s,r)=>s+(parseFloat(r.amount)||0),0);
  const solde    = totalRec - totalDep;

  const fmt = n => parseFloat(n||0).toFixed(2).replace('.',',');  // French decimal
  const esc = v => `"${String(v||'').replace(/"/g,'""')}"`;

  const header = ['Date','Type','Catégorie','Description','Montant (€)','Justificatif','Date ajout'];
  const dataRows = rows.map(r => [
    new Date(r.date).toLocaleDateString('fr-FR'),
    r.type === 'recette' ? 'Recette' : 'Dépense',
    r.category || '',
    r.description || '',
    (r.type === 'recette' ? '+' : '-') + fmt(r.amount),
    r.fileUrl || '',
    new Date(r.createdAt).toLocaleDateString('fr-FR')
  ].map(esc).join(';'));

  const sep  = ';;;;;;';
  const summary = [
    sep,
    `${esc('TOTAL RECETTES')};;;;;${esc('+'+fmt(totalRec)+' €')}`,
    `${esc('TOTAL DÉPENSES')};;;;;${esc('-'+fmt(totalDep)+' €')}`,
    `${esc('SOLDE')};;;;;${esc((solde>=0?'+':'')+fmt(solde)+' €')}`
  ];

  const BOM = '﻿'; // UTF-8 BOM for Excel
  const csv = BOM + [header.map(esc).join(';'), ...dataRows, ...summary].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `TTF-comptabilite-${label}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast(`CSV exporté — ${rows.length} transaction(s) · ${label}`);
}

function deleteExpense() {
  if (!_expenseModalId) return;
  if (!confirm('Supprimer cette transaction ?')) return;
  const idx = state.expenses.findIndex(x => x.id === _expenseModalId);
  if (idx >= 0) state.expenses.splice(idx, 1);
  saveState();
  closeExpenseModal();
  renderComptable();
  showToast('Transaction supprimée.');
}

// ── Import / Export JSON ───────────────────────────────────────
function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `grp-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Export JSON téléchargé.');
}

function triggerImport() {
  document.getElementById('import-file')?.click();
}

function handleImport(evt) {
  const file = evt.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || typeof data !== 'object') throw new Error('Format invalide');
      // Support both old full-state JSON exports and new dynamic-only exports
      const dyn = _emptyDynamic();
      if (Array.isArray(data.addedMembers))  dyn.addedMembers  = data.addedMembers;
      else if (Array.isArray(data.members))  dyn.addedMembers  = data.members.filter(m => !m.id.startsWith('seed_m_'));
      if (Array.isArray(data.announcements)) dyn.announcements = data.announcements;
      if (Array.isArray(data.jobs))          dyn.jobs          = data.jobs;
      if (Array.isArray(data.sharings))      dyn.sharings      = data.sharings;
      if (data.surveyVotes)                  dyn.surveyVotes   = data.surveyVotes;
      if (Array.isArray(data.userSurveys))   dyn.userSurveys   = data.userSurveys;
      rebuildState(dyn);
      saveState();
      setTab('dashboard');
      renderKPIs();
      showToast('Import réussi !');
    } catch (_) {
      showToast('Erreur : fichier JSON invalide.');
    } finally {
      evt.target.value = '';
    }
  };
  reader.readAsText(file);
}

// ── Firebase real-time listener ────────────────────────────────
// Strategy: every local save stamps a `savedAt` ms timestamp into localStorage
// and into Firebase ({ ts, data }). The listener only applies remote data when
// Firebase ts > local savedAt — i.e. genuinely newer data from another user.
// This correctly handles: own-write echoes, stale old data without ts, and
// real updates from other users.

function _fbWrite(dyn) {
  if (!_fbRef) return;
  _fbRef.transaction(current => {
    const empty = { addedMembers:[], announcements:[], jobs:[], surveyVotes:{}, sharings:[], userSurveys:[], assoMembers:[] };
    let remoteDyn = empty;
    if (current && typeof current.data === 'string') {
      try { remoteDyn = JSON.parse(current.data); } catch(_) {}
    }

    // ── surveyVotes merge ────────────────────────────────────────
    // Start from ALL remote votes (covers surveys not yet in local state,
    // e.g. during cold-start before first Firebase sync).
    // Then apply local votes on top — admin-submitted vote wins for same key.
    const mergedVotes = Object.assign({}, remoteDyn.surveyVotes || {});
    for (const [sid, localVotes] of Object.entries(dyn.surveyVotes || {})) {
      mergedVotes[sid] = Object.assign({}, mergedVotes[sid] || {}, localVotes);
    }

    // ── userSurveys merge ────────────────────────────────────────
    // Once synced, local state is authoritative (honours admin deletions).
    // During cold-start, also preserve remote surveys admin doesn't know yet.
    let mergedSurveys;
    if (_fbSyncDone) {
      mergedSurveys = dyn.userSurveys || [];
    } else {
      const localIds = new Set((dyn.userSurveys || []).map(s => s.id));
      mergedSurveys = [
        ...(dyn.userSurveys || []),
        ...(remoteDyn.userSurveys || []).filter(s => !localIds.has(s.id))
      ];
    }

    // Keep userSurveys[i].votesByMember in sync with the merged votes
    const syncedSurveys = mergedSurveys.map(s => ({
      ...s,
      votesByMember: mergedVotes[s.id] || s.votesByMember || {}
    }));

    // Always produce a ts strictly > the current Firebase ts so the stale-write
    // guard rule (".write": "newData.ts > data.ts") never blocks a legitimate save.
    const ts = Math.max(Date.now(), ((current && current.ts) || 0) + 1);
    return { ts, data: JSON.stringify({ ...dyn, surveyVotes: mergedVotes, userSurveys: syncedSurveys }) };
                                    }).catch(e => {
    console.warn('[Firebase] save error', e);
    showToast('⚠️ Firebase sync failed — data saved locally only. Check database rules.', 5000);
  });
}

function initFirebase() {
  if (!_fbRef) return;

  _fbRef.on('value', snapshot => {
    _fbSyncDone = true; // first Firebase reply received — local state is now considered synced
    const raw = snapshot.val();
    let dyn = null;

    if (raw && typeof raw.data === 'string') {
      const localSavedAt = loadDynamic().savedAt;
      const fbTs = raw.ts || 0;
      if (localSavedAt > 0 && fbTs <= localSavedAt) return; // our local data is same or newer, skip (fresh browsers always apply Firebase data)
      try { dyn = JSON.parse(raw.data); } catch (_) { console.warn('[Firebase] parse error'); }
    } else if (raw && typeof raw === 'object' && Array.isArray(raw.members)) {
      // Old full-state format: migrate once to new dynamic-only format
      dyn = {
        addedMembers:  (raw.members  || []).filter(m => !m.id.startsWith('seed_m_')),
        announcements: raw.announcements || [],
        jobs:          raw.jobs          || [],
        sharings:      raw.sharings      || [],
        surveyVotes:   Object.fromEntries(
                         (raw.surveys || []).map(s => [s.id, s.votesByMember || {}])
                       ),
        userSurveys:   (raw.surveys || []).filter(s => !s.isLegacy)
      };
      _saveDynLocal(dyn);
      _fbWrite(dyn);
      showToast('Données migrées ✓');
    }

    if (dyn) {
      rebuildState(dyn);
      _saveDynLocal(dyn); // update local cache with the newer remote data
    }

    renderKPIs();
    renderAnnouncements();
    renderJobs();
    const activePane = document.querySelector('.tab-pane.active')?.dataset?.tab;
    if (activePane === 'members') renderMembers();
    if (activePane === 'asso')    renderAssoMembers();
    if (activePane === 'surveys') renderSurveys();
    if (activePane === 'sharing') renderSharings();
    if (dyn && dyn.lastAssoSync) handleLastAssoSync(dyn.lastAssoSync);
  });
}

function initAdminProfiles() {
  if (!_adminProfilesRef || typeof firebase.auth !== 'function') return;
  firebase.auth().onAuthStateChanged(user => {
    if (_adminProfilesHandler) _adminProfilesRef.off('value', _adminProfilesHandler);
    _adminProfilesHandler = null;
    state.adminProfiles = [];

    const email = (user?.email || '').trim().toLowerCase();
    const allowed = (typeof ADMIN_EMAILS !== 'undefined' && Array.isArray(ADMIN_EMAILS))
      ? ADMIN_EMAILS.some(adminEmail => adminEmail.trim().toLowerCase() === email)
      : false;
    if (!user || !allowed) {
      if (document.querySelector('.tab-pane.active')?.dataset?.tab === 'asso') renderAssoMembers();
      return;
    }

    _adminProfilesHandler = snapshot => {
      const raw = snapshot.val() || {};
      state.adminProfiles = Array.isArray(raw)
        ? raw.filter(Boolean)
        : Object.entries(raw).map(([uid, profile]) => ({ uid, id: profile?.id || uid, ...(profile || {}) }));
      if (document.querySelector('.tab-pane.active')?.dataset?.tab === 'asso') renderAssoMembers();
    };
    _adminProfilesRef.on('value', _adminProfilesHandler, error => {
      console.warn('[Firebase] adminProfiles read failed', error);
    });
  });
}

// ── Init ───────────────────────────────────────────────────────
function init() {
  initFirebase(); // connects Firebase listener if configured; no-op otherwise
  initAdminProfiles();
  renderKPIs();

  // Tab buttons
  document.querySelectorAll('.sm-tab').forEach(btn => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });

  // Default tab
  setTab('dashboard');

  // Member search
  const searchEl = document.getElementById('member-search');
  if (searchEl) {
    searchEl.addEventListener('input', () => renderMembers());
  }

  // Add member button
  const addMemberBtn = document.getElementById('add-member-btn');
  if (addMemberBtn) addMemberBtn.addEventListener('click', () => openMemberModal());

  // Export / import
  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');
  const importFile = document.getElementById('import-file');
  if (exportBtn)  exportBtn.addEventListener('click', exportJSON);
  if (importBtn)  importBtn.addEventListener('click', triggerImport);
  if (importFile) importFile.addEventListener('change', handleImport);

  // Vote modal buttons
  const voteClose  = document.getElementById('vote-modal-close');
  const voteCancel = document.getElementById('vote-modal-cancel');
  const voteSubmit = document.getElementById('vote-modal-submit');
  if (voteClose)  voteClose.addEventListener('click', closeVoteModal);
  if (voteCancel) voteCancel.addEventListener('click', closeVoteModal);
  if (voteSubmit) voteSubmit.addEventListener('click', submitVote);

  // Vote modal backdrop click
  const voteOverlay = document.getElementById('vote-modal');
  if (voteOverlay) {
    voteOverlay.addEventListener('click', e => {
      if (e.target === voteOverlay) closeVoteModal();
    });
  }

  // Member modal buttons
  const memberClose  = document.getElementById('member-modal-close');
  const memberCancel = document.getElementById('member-modal-cancel');
  const memberSave   = document.getElementById('member-modal-save');
  const memberDelete = document.getElementById('member-modal-delete');
  if (memberClose)  memberClose.addEventListener('click', closeMemberModal);
  if (memberCancel) memberCancel.addEventListener('click', closeMemberModal);
  if (memberSave)   memberSave.addEventListener('click', saveMember);
  if (memberDelete) memberDelete.addEventListener('click', deleteMember);

  // Member modal backdrop
  const memberOverlay = document.getElementById('member-modal');
  if (memberOverlay) {
    memberOverlay.addEventListener('click', e => {
      if (e.target === memberOverlay) closeMemberModal();
    });
  }

  // Asso members tab
  const addAssoBtn    = document.getElementById('add-asso-member-btn');
  const exportAssoBtn = document.getElementById('export-asso-csv-btn');
  if (addAssoBtn)    addAssoBtn.addEventListener('click', () => openAssoMemberModal());
  if (exportAssoBtn) exportAssoBtn.addEventListener('click', exportAssoCSV);

  // Sync Asso (HelloAsso GitHub Action trigger)
  const syncAssoBtn = document.getElementById('sync-asso-btn');
  if (syncAssoBtn) syncAssoBtn.addEventListener('click', triggerAssoSync);

  const assoSearch     = document.getElementById('asso-search');
  const assoCityFilter = document.getElementById('asso-city-filter');
  if (assoSearch)     assoSearch.addEventListener('input', renderAssoMembers);
  if (assoCityFilter) assoCityFilter.addEventListener('change', renderAssoMembers);

  // Asso member modal buttons
  const assoClose  = document.getElementById('asso-modal-close');
  const assoCancel = document.getElementById('asso-modal-cancel');
  const assoSave   = document.getElementById('asso-modal-save');
  const assoDelete = document.getElementById('asso-modal-delete');
  if (assoClose)  assoClose.addEventListener('click', closeAssoMemberModal);
  if (assoCancel) assoCancel.addEventListener('click', closeAssoMemberModal);
  if (assoSave)   assoSave.addEventListener('click', saveAssoMember);
  if (assoDelete) assoDelete.addEventListener('click', deleteAssoMember);

  const assoOverlay = document.getElementById('asso-member-modal');
  if (assoOverlay) {
    assoOverlay.addEventListener('click', e => {
      if (e.target === assoOverlay) closeAssoMemberModal();
    });
  }

  // Announcement buttons
  const addAnncBtn = document.getElementById('add-annc-btn');
  if (addAnncBtn) addAnncBtn.addEventListener('click', () => openAnncModal());

  const anncClose  = document.getElementById('annc-modal-close');
  const anncCancel = document.getElementById('annc-modal-cancel');
  const anncSave   = document.getElementById('annc-modal-save');
  const anncDelete = document.getElementById('annc-modal-delete');
  if (anncClose)  anncClose.addEventListener('click', closeAnncModal);
  if (anncCancel) anncCancel.addEventListener('click', closeAnncModal);
  if (anncSave)   anncSave.addEventListener('click', saveAnnc);
  if (anncDelete) anncDelete.addEventListener('click', deleteAnnc);

  const anncOverlay = document.getElementById('annc-modal');
  if (anncOverlay) {
    anncOverlay.addEventListener('click', e => {
      if (e.target === anncOverlay) closeAnncModal();
    });
  }

  // Job expand/collapse delegation (single listener, survives re-renders)
  const jobListEl = document.getElementById('job-list');
  if (jobListEl) {
    jobListEl.addEventListener('click', e => {
      const btn = e.target.closest('.sm-job-expand-btn');
      if (!btn) return;
      const prev = btn.previousElementSibling;
      const expandable = prev && (prev.classList.contains('sm-expandable')
        ? prev : prev.querySelector('.sm-expandable'));
      if (!expandable) return;
      const short = expandable.querySelector('.sm-expandable-short');
      const full  = expandable.querySelector('.sm-expandable-full');
      if (!short || !full) return;
      const isExpanded = full.style.display !== 'none';
      short.style.display = isExpanded ? '' : 'none';
      full.style.display  = isExpanded ? 'none' : '';
      btn.innerHTML = isExpanded
        ? '展開 · Voir plus <i class="fas fa-chevron-down"></i>'
        : '收起 · Réduire <i class="fas fa-chevron-up"></i>';
    });
  }

  // Job buttons
  const addJobBtn = document.getElementById('add-job-btn');
  if (addJobBtn) addJobBtn.addEventListener('click', () => openJobModal());

  const jobClose  = document.getElementById('job-modal-close');
  const jobCancel = document.getElementById('job-modal-cancel');
  const jobSave   = document.getElementById('job-modal-save');
  const jobDelete = document.getElementById('job-modal-delete');
  if (jobClose)  jobClose.addEventListener('click', closeJobModal);
  if (jobCancel) jobCancel.addEventListener('click', closeJobModal);
  if (jobSave)   jobSave.addEventListener('click', saveJob);
  if (jobDelete) jobDelete.addEventListener('click', deleteJob);

  const jobOverlay = document.getElementById('job-modal');
  if (jobOverlay) {
    jobOverlay.addEventListener('click', e => {
      if (e.target === jobOverlay) closeJobModal();
    });
  }

  // Add sharing button
  const addSharingBtn = document.getElementById('add-sharing-btn');
  if (addSharingBtn) addSharingBtn.addEventListener('click', () => openSharingModal());

  // Sharing modal buttons
  const sharingClose  = document.getElementById('sharing-modal-close');
  const sharingCancel = document.getElementById('sharing-modal-cancel');
  const sharingSave   = document.getElementById('sharing-modal-save');
  const sharingDelete = document.getElementById('sharing-modal-delete');
  if (sharingClose)  sharingClose.addEventListener('click', closeSharingModal);
  if (sharingCancel) sharingCancel.addEventListener('click', closeSharingModal);
  if (sharingSave)   sharingSave.addEventListener('click', saveSharing);
  if (sharingDelete) sharingDelete.addEventListener('click', deleteSharing);

  // Sharing modal backdrop
  const sharingOverlay = document.getElementById('sharing-modal');
  if (sharingOverlay) {
    sharingOverlay.addEventListener('click', e => {
      if (e.target === sharingOverlay) closeSharingModal();
    });
  }

  // Meeting buttons
  const addMeetingBtn = document.getElementById('add-meeting-btn');
  if (addMeetingBtn) addMeetingBtn.addEventListener('click', () => openMeetingModal());
  const meetingClose  = document.getElementById('meeting-modal-close');
  const meetingCancel = document.getElementById('meeting-modal-cancel');
  const meetingSave   = document.getElementById('meeting-modal-save');
  const meetingDelete = document.getElementById('meeting-modal-delete');
  if (meetingClose)  meetingClose.addEventListener('click', closeMeetingModal);
  if (meetingCancel) meetingCancel.addEventListener('click', closeMeetingModal);
  if (meetingSave)   meetingSave.addEventListener('click', saveMeeting);
  if (meetingDelete) meetingDelete.addEventListener('click', deleteMeeting);
  const meetingOverlay = document.getElementById('meeting-modal');
  if (meetingOverlay) {
    meetingOverlay.addEventListener('click', e => {
      if (e.target === meetingOverlay) closeMeetingModal();
    });
  }

  // Comptable buttons
  const addExpenseBtn = document.getElementById('add-expense-btn');
  if (addExpenseBtn) addExpenseBtn.addEventListener('click', () => openExpenseModal());
  const expClose  = document.getElementById('expense-modal-close');
  const expCancel = document.getElementById('expense-modal-cancel');
  const expSave   = document.getElementById('expense-modal-save');
  const expDelete = document.getElementById('expense-modal-delete');
  if (expClose)  expClose.addEventListener('click', closeExpenseModal);
  if (expCancel) expCancel.addEventListener('click', closeExpenseModal);
  if (expSave)   expSave.addEventListener('click', saveExpense);
  if (expDelete) expDelete.addEventListener('click', deleteExpense);
  const expOverlay = document.getElementById('expense-modal');
  if (expOverlay) {
    expOverlay.addEventListener('click', e => { if (e.target === expOverlay) closeExpenseModal(); });
    expOverlay.addEventListener('change', e => { if (e.target.id === 'exp-type') _updateExpenseCategoryHint(); });
  }

  // Export CSV dropdown toggle
  const exportCsvBtn  = document.getElementById('export-csv-btn');
  const exportCsvDrop = document.getElementById('export-csv-dropdown');
  if (exportCsvBtn && exportCsvDrop) {
    exportCsvBtn.addEventListener('click', e => {
      e.stopPropagation();
      exportCsvDrop.style.display = exportCsvDrop.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', () => { if (exportCsvDrop) exportCsvDrop.style.display = 'none'; });
  }

  // Close modals on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeVoteModal();
      closeMemberModal();
      closeSharingModal();
      closeAnncModal();
      closeJobModal();
      closeMeetingModal();
      closeExpenseModal();
    }
  });

  // Create tab
  initCreateTab();
}

document.addEventListener('DOMContentLoaded', init);
