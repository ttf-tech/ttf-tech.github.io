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

// Subscribe to Firebase data. Calls onData({ memberCount, announcements, jobs })
// on every update. announcements and jobs are newest-first.
function subscribeFirebaseData(onData) {
  function emit(dyn) {
    const added = Array.isArray(dyn?.addedMembers) ? dyn.addedMembers : [];
    onData({
      memberCount:   SEED_MEMBER_COUNT + added.length,
      announcements: Array.isArray(dyn?.announcements) ? [...dyn.announcements].reverse() : [],
      jobs:          Array.isArray(dyn?.jobs)           ? [...dyn.jobs].reverse()          : [],
      surveyVotes:   (dyn?.surveyVotes && typeof dyn.surveyVotes === 'object') ? dyn.surveyVotes : {},
      userSurveys:   Array.isArray(dyn?.userSurveys) ? dyn.userSurveys : []
    });
  }

  if (typeof firebase === 'undefined') { emit(null); return; }

  try {
    if (!firebase.apps.length) firebase.initializeApp(_FB_READ_CONFIG);
    firebase.database().ref('grp_hub_v2').on('value', snap => {
      const raw = snap.val();
      if (!raw || typeof raw.data !== 'string') { emit(null); return; }
      try { emit(JSON.parse(raw.data)); } catch (_) { emit(null); }
    });
  } catch (e) {
    console.warn('[firebase-read] init error', e);
    emit(null);
  }
}
