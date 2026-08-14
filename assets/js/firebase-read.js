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

// Static WhatsApp-imported seed member count (never changes)
const SEED_MEMBER_COUNT = 68;
const PUBLIC_CACHE_KEY = 'ttf_public_data_v2';

const _firebaseReadSubscribers = new Set();
let _firebaseReadStarted = false;
let _firebaseReadLastData = null;
let _firebaseReadLastSignature = '';
let _firebaseReadLegacyDyn = null;
let _firebaseReadSurveysV4 = null;
let _firebaseReadVotesV4 = null;

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

function _makeFirebaseReadData(dyn, source) {
  const added = Array.isArray(dyn?.addedMembers) ? dyn.addedMembers : [];
  return {
    memberCount:   SEED_MEMBER_COUNT + added.length,
    announcements: Array.isArray(dyn?.announcements) ? [...dyn.announcements].reverse() : [],
    jobs:          Array.isArray(dyn?.jobs)           ? [...dyn.jobs].reverse()          : [],
    surveyVotes:   (dyn?.surveyVotes && typeof dyn.surveyVotes === 'object') ? dyn.surveyVotes : {},
    userSurveys:   Array.isArray(dyn?.userSurveys) ? dyn.userSurveys : [],
    assoMembers:   Array.isArray(dyn?.assoMembers) ? dyn.assoMembers : [],
    source
  };
}

function _loadPublicCache() {
  try {
    let cached = JSON.parse(localStorage.getItem(PUBLIC_CACHE_KEY) || 'null');
    if (!cached) {
      const adminCache = JSON.parse(localStorage.getItem('grp_hub_v2_dyn') || 'null');
      if (adminCache) {
        const projected = _makeFirebaseReadData(adminCache, 'cache');
        cached = {
          memberCount: projected.memberCount,
          announcements: projected.announcements,
          jobs: projected.jobs
        };
      }
    }
    if (!cached || !Array.isArray(cached.announcements) || !Array.isArray(cached.jobs)) return null;
    return {
      memberCount: Number.isFinite(cached.memberCount) ? cached.memberCount : SEED_MEMBER_COUNT,
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
  const data = _makeFirebaseReadData(_firebaseReadLegacyDyn, source);
  if (_firebaseReadSurveysV4) {
    data.userSurveys = _firebaseReadSurveysV4.filter(survey => !String(survey.id || '').startsWith('seed_'));
    data.surveyVotes = _firebaseReadVotesV4 || {};
  }
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

async function _refreshFirebaseDataOnce() {
  if (typeof fetch !== 'function') return;
  try {
    const response = await fetch(`${_FB_READ_CONFIG.databaseURL}/grp_hub_v2.json`, { cache: 'no-store' });
    if (!response.ok) return;
    const raw = await response.json();
    if (!raw || typeof raw.data !== 'string') return;
    const dyn = JSON.parse(raw.data);
    const freshData = _makeFirebaseReadData(dyn, 'firebase-rest');
    _savePublicCache(freshData);
    _publishFirebaseReadData(freshData);
  } catch (_) {}
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
    _refreshFirebaseDataOnce();
    if (typeof firebase === 'undefined') {
      return function unsubscribeFirebaseData() {
        _firebaseReadSubscribers.delete(onData);
      };
    } else {
      try {
        if (!firebase.apps.length) firebase.initializeApp(_FB_READ_CONFIG);
        firebase.database().ref('grp_hub_v2').on('value', snap => {
          const raw = snap.val();
          if (!raw || typeof raw.data !== 'string') {
            if (!_firebaseReadLastData) _publishFirebaseReadData(_makeFirebaseReadData(null, 'fallback'));
            return;
          }
          let dyn;
          try { dyn = JSON.parse(raw.data); } catch (_) { return; }
          _firebaseReadLegacyDyn = dyn;
          _publishCombinedFirebaseReadData('firebase');
        }, error => {
          console.warn('[firebase-read] sync error', error);
          if (!_firebaseReadLastData) _publishFirebaseReadData(_makeFirebaseReadData(null, 'fallback'));
        });
        firebase.database().ref('surveys').on('value', snap => {
          const raw = snap.val();
          if (!raw) return;
          _firebaseReadSurveysV4 = Array.isArray(raw)
            ? raw.filter(Boolean)
            : Object.entries(raw).map(([id, survey]) => ({ id, ...(survey || {}) }));
          _publishCombinedFirebaseReadData('firebase-v4');
        }, error => console.warn('[firebase-read] surveys sync error', error));
        firebase.database().ref('surveyVotes').on('value', snap => {
          _firebaseReadVotesV4 = snap.val() || {};
          if (_firebaseReadSurveysV4) _publishCombinedFirebaseReadData('firebase-v4');
        }, error => console.warn('[firebase-read] survey votes sync error', error));
      } catch (e) {
        console.warn('[firebase-read] init error', e);
        if (!_firebaseReadLastData) _publishFirebaseReadData(_makeFirebaseReadData(null, 'fallback'));
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
