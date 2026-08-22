/* ── firebase-read.js — read-only Firebase data access ───────── */
'use strict';

const _FB_READ_CONFIG = {
  apiKey:            'AIzaSyCSfJ6-F9OEdmXQvwVHX9hpYvkp57mpeO8',
  authDomain:        'groupe-tech-fr.firebaseapp.com',
  databaseURL:       'https://groupe-tech-fr-default-rtdb.europe-west1.firebasedatabase.app',
  projectId:         'groupe-tech-fr',
  storageBucket:     'groupe-tech-fr.firebasestorage.app',
  messagingSenderId: '461066170665',
  appId:             '1:461066170665:web:1b090d8e383404c4320738'
};

const PUBLIC_CACHE_KEY = 'ttf_public_data_v4';

// v3 could contain member-only sharing URLs. Remove it instead of migrating it.
try { localStorage.removeItem('ttf_public_data_v3'); } catch (_) {}

const _firebaseReadSubscribers = new Set();
let _firebaseReadStarted = false;
let _firebaseReadLastData = null;
let _firebaseReadLastSignature = '';
const _firebaseReadLive = {
  publicStats: null,
  communityMembers: null,
  announcements: null,
  jobs: null,
  surveys: null,
  surveyVotes: null
};
const _firebaseReadReadyKeys = new Set();

function escHtmlRead(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDateRead(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' });
}

function toYoutubeEmbedUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
    let videoId = null;
    if (host === 'youtu.be') {
      videoId = u.pathname.slice(1).split('/')[0];
    } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') {
        videoId = u.searchParams.get('v');
      } else {
        const m = u.pathname.match(/^\/(embed|shorts|live)\/([^/]+)/);
        if (m) videoId = m[2];
      }
    }
    if (!videoId) return null;
    return `https://www.youtube-nocookie.com/embed/${videoId}`;
  } catch (_) {
    return null;
  }
}

function toDocEmbedUrl(url) {
  if (!url) return null;
  const ytEmbed = toYoutubeEmbedUrl(url);
  if (ytEmbed) return ytEmbed;
  try {
    const u = new URL(url);
    const driveFile = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (driveFile) return `https://drive.google.com/file/d/${driveFile[1]}/preview`;
    const gDoc = u.pathname.match(/\/document\/d\/([^/]+)/);
    if (gDoc) return `https://docs.google.com/document/d/${gDoc[1]}/preview`;
    const gSlides = u.pathname.match(/\/presentation\/d\/([^/]+)/);
    if (gSlides) return `https://docs.google.com/presentation/d/${gSlides[1]}/preview`;
    const gSheets = u.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    if (gSheets) return `https://docs.google.com/spreadsheets/d/${gSheets[1]}/preview`;
    return null;
  } catch (_) {
    return null;
  }
}

function _recordsFromFirebase(raw) {
  if (!raw) return [];
  return Array.isArray(raw)
    ? raw.filter(Boolean)
    : Object.entries(raw).map(([id, record]) => ({ id, ...(record || {}) }));
}

function _sortNewestFirst(records, primaryField) {
  return [...records].sort((a, b) => {
    const aTime = new Date(a?.[primaryField] || a?.createdAt || 0).getTime() || 0;
    const bTime = new Date(b?.[primaryField] || b?.createdAt || 0).getTime() || 0;
    return bTime - aTime;
  });
}

function _makeFirebaseReadData(source) {
  const surveys = _recordsFromFirebase(_firebaseReadLive.surveys);
  const communityMemberCount = _firebaseReadLive.communityMembers === null
    ? (Number(_firebaseReadLive.publicStats?.communityMemberCount) || 68)
    : 68 + _recordsFromFirebase(_firebaseReadLive.communityMembers).length;
  return {
    memberCount: communityMemberCount,
    announcements: _sortNewestFirst(_recordsFromFirebase(_firebaseReadLive.announcements), 'date'),
    jobs: _sortNewestFirst(_recordsFromFirebase(_firebaseReadLive.jobs), 'createdAt'),
    surveyVotes: (_firebaseReadLive.surveyVotes && typeof _firebaseReadLive.surveyVotes === 'object')
      ? _firebaseReadLive.surveyVotes
      : {},
    userSurveys: surveys.filter(survey => !String(survey.id || '').startsWith('seed_')),
    // Membership is resolved through the authenticated lookup in admin-config.js.
    // The public shared reader deliberately never exposes the full member table.
    assoMembers: [],
    source
  };
}

function _loadPublicCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(PUBLIC_CACHE_KEY) || 'null');
    if (!cached || !Array.isArray(cached.announcements) || !Array.isArray(cached.jobs)) return null;
    return {
      memberCount: Number.isFinite(cached.memberCount) ? cached.memberCount : 68,
      announcements: cached.announcements,
      jobs: cached.jobs,
      surveyVotes: (cached.surveyVotes && typeof cached.surveyVotes === 'object') ? cached.surveyVotes : {},
      userSurveys: Array.isArray(cached.userSurveys) ? cached.userSurveys : [],
      assoMembers: [],
      source: 'cache'
    };
  } catch (_) {
    return null;
  }
}

function _savePublicCache(data) {
  try {
    const anonymousVotes = {};
    Object.entries(data.surveyVotes || {}).forEach(([surveyId, votesByMember]) => {
      anonymousVotes[surveyId] = {};
      Object.values(votesByMember || {}).forEach((vote, index) => {
        anonymousVotes[surveyId][`cached_${index}`] = Array.isArray(vote)
          ? vote
          : (Array.isArray(vote?.options) ? vote.options : []);
      });
    });
    const publicSurveys = (data.userSurveys || []).map(({ votesByMember, ...survey }) => survey);
    localStorage.setItem(PUBLIC_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      memberCount: data.memberCount,
      announcements: data.announcements,
      jobs: data.jobs,
      surveyVotes: anonymousVotes,
      userSurveys: publicSurveys
    }));
  } catch (_) {}
}

function _publishCombinedFirebaseReadData(source) {
  const data = _makeFirebaseReadData(source);
  _savePublicCache(data);
  _publishFirebaseReadData(data);
}

function _publishFirebaseReadData(data) {
  const signature = JSON.stringify({
    memberCount: data.memberCount,
    announcements: data.announcements,
    jobs: data.jobs,
    surveyVotes: data.surveyVotes,
    userSurveys: data.userSurveys,
    assoMembers: data.assoMembers
  });
  if (signature === _firebaseReadLastSignature) return;
  _firebaseReadLastSignature = signature;
  _firebaseReadLastData = data;
  _firebaseReadSubscribers.forEach(callback => {
    try { callback(data); } catch (error) { console.error('[firebase-read] subscriber error', error); }
  });
}

// Cache-first shared subscription. Every subscriber on the current page shares
// one Firebase listener; cached public data renders before the live reply.
function subscribeFirebaseData(onData) {
  if (typeof onData !== 'function') return function () {};
  _firebaseReadSubscribers.add(onData);

  if (_firebaseReadLastData) {
    onData(_firebaseReadLastData);
  } else {
    const cached = _loadPublicCache();
    if (cached) _publishFirebaseReadData(cached);
  }

  if (!_firebaseReadStarted) {
    _firebaseReadStarted = true;
    if (typeof firebase === 'undefined') {
      return function unsubscribeFirebaseData() {
        _firebaseReadSubscribers.delete(onData);
      };
    } else {
      try {
        if (!firebase.apps.length) firebase.initializeApp(_FB_READ_CONFIG);
        const refs = {
          publicStats: firebase.database().ref('publicStats'),
          communityMembers: firebase.database().ref('communityMembers'),
          announcements: firebase.database().ref('announcements'),
          jobs: firebase.database().ref('jobs'),
          surveys: firebase.database().ref('surveys'),
          surveyVotes: firebase.database().ref('surveyVotes')
        };
        Object.entries(refs).forEach(([key, ref]) => {
          ref.on('value', snap => {
            _firebaseReadLive[key] = snap.val() || (key === 'publicStats' ? {} : null);
            _firebaseReadReadyKeys.add(key);
            if (_firebaseReadReadyKeys.size === Object.keys(refs).length) {
              _publishCombinedFirebaseReadData('firebase-normalized');
            }
          }, error => {
            console.warn(`[firebase-read] ${key} sync error`, error);
            if (!_firebaseReadLastData) _publishFirebaseReadData(_makeFirebaseReadData('fallback'));
          });
        });
      } catch (e) {
        console.warn('[firebase-read] init error', e);
        if (!_firebaseReadLastData) _publishFirebaseReadData(_makeFirebaseReadData('fallback'));
      }
    }
  }

  return function unsubscribeFirebaseData() {
    _firebaseReadSubscribers.delete(onData);
  };
}

function setFirebaseText(el, value) {
  if (!el) return;
  const next = String(value ?? '');
  if (el.textContent !== next) el.textContent = next;
}

// Keyed reconciliation keeps unchanged cards in place. This preserves expanded
// UI state and avoids clearing/repainting the whole list after a live update.
function reconcileFirebaseList(container, items, keyOf, renderItem) {
  if (!container) return;
  Array.from(container.children)
    .filter(node => !node.hasAttribute('data-firebase-key'))
    .forEach(node => node.remove());
  const existing = new Map(
    Array.from(container.children)
      .filter(node => node.hasAttribute('data-firebase-key'))
      .map(node => [node.getAttribute('data-firebase-key'), node])
  );
  const keep = new Set();

  items.forEach((item, index) => {
    const key = String(keyOf(item, index));
    const signature = JSON.stringify(item);
    let node = existing.get(key);

    if (!node || node.getAttribute('data-firebase-signature') !== signature) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = renderItem(item, index).trim();
      const replacement = wrapper.firstElementChild || wrapper.children[0];
      if (!replacement) return;
      replacement.setAttribute('data-firebase-key', key);
      replacement.setAttribute('data-firebase-signature', signature);
      if (node) node.replaceWith(replacement);
      node = replacement;
    }

    keep.add(key);
    const nodeAtPosition = container.children[index] || null;
    if (nodeAtPosition !== node) container.insertBefore(node, nodeAtPosition);
  });

  existing.forEach((node, key) => {
    if (!keep.has(key)) node.remove();
  });
}
