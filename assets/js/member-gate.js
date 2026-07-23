/* ── member-gate.js — Adhésion (paid member) access control ──────
 * Gates public-page content behind Google Sign-In + membership check.
 *
 * A visitor counts as an "Adhésion member" if either:
 *   1. Their email is in ADMIN_EMAILS (assets/js/admin-config.js) — temporary
 *      stand-in until real HelloAsso-paid members exist, so staff can test
 *      gated blocks. Safe to remove once real members are onboarded.
 *   2. Their email matches an entry in the `assoMembers` list (Firebase RTDB,
 *      same data the admin dashboard's "Asso Membres" tab manages) with a
 *      `joinedAt` less than MEMBER_GATE_VALID_DAYS old.
 *
 * Usage on a page:
 *   <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
 *   <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js"></script>
 *   <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js"></script>
 *   <script src="assets/js/admin-config.js"></script>   (optional, for the admin bypass)
 *   <script src="assets/js/firebase-read.js"></script>
 *   <script src="assets/js/member-gate.js"></script>
 *
 *   Mark gated content:
 *     <div class="restricted-asso-content" style="display:none;">…real content…</div>
 *     <div class="upgrade-to-asso-banner">…sign-in / adhésion prompt…</div>
 *   Call ttfMemberSignIn() / ttfMemberSignOut() from buttons inside the banner.
 *
 * NOTE — this is UX gating, not a security boundary: the Firebase RTDB data
 * behind subscribeFirebaseData() is currently world-readable, so anything
 * genuinely sensitive (private contact info, paywalled replay links) must be
 * protected by Firebase Realtime Database security rules (require
 * `auth != null`, or a members-only path), not by hiding it with CSS.
 */
'use strict';

const MEMBER_GATE_VALID_DAYS = 365;

const _MG_FB_CONFIG = {
  apiKey:            'AIzaSyCSfJ6-F9OEdmXQvwVHX9hpYvkp57mpeO8',
  authDomain:        'groupe-tech-fr.firebaseapp.com',
  databaseURL:       'https://groupe-tech-fr-default-rtdb.europe-west1.firebasedatabase.app',
  projectId:         'groupe-tech-fr',
  storageBucket:     'groupe-tech-fr.firebasestorage.app',
  messagingSenderId: '461066170665',
  appId:             '1:461066170665:web:1b090d8e383404c4320738'
};

let _mgUser = null;
let _mgAssoMembers = [];

function _mgNorm(email) {
  return (email || '').trim().toLowerCase();
}

function ttfIsAdhesionMember(email) {
  const norm = _mgNorm(email);
  if (!norm) return false;

  const admins = (typeof ADMIN_EMAILS !== 'undefined') ? ADMIN_EMAILS : [];
  if (admins.some(a => _mgNorm(a) === norm)) return true;

  return _mgAssoMembers.some(m => {
    if (_mgNorm(m.email) !== norm) return false;
    if (!m.joinedAt) return true; // no date on record — don't lock them out
    const ageDays = (Date.now() - new Date(m.joinedAt).getTime()) / 86400000;
    return ageDays >= 0 && ageDays <= MEMBER_GATE_VALID_DAYS;
  });
}

function _mgApplyToDom() {
  const hasAccess = ttfIsAdhesionMember(_mgUser && _mgUser.email);

  document.querySelectorAll('.restricted-asso-content').forEach(el => {
    el.style.display = hasAccess ? '' : 'none';
  });
  document.querySelectorAll('.upgrade-to-asso-banner').forEach(el => {
    el.style.display = hasAccess ? 'none' : '';
    el.classList.toggle('signed-in-non-member', !!_mgUser && !hasAccess);
  });
  document.querySelectorAll('[data-member-gate-email]').forEach(el => {
    el.textContent = _mgUser ? _mgUser.email : '';
  });
  document.body.classList.toggle('mg-signed-in', !!_mgUser);
}

function ttfMemberGateInit() {
  if (typeof firebase === 'undefined') return;
  if (!firebase.apps.length) firebase.initializeApp(_MG_FB_CONFIG);

  firebase.auth().onAuthStateChanged(function (user) {
    _mgUser = user;
    _mgApplyToDom();
  });

  if (typeof subscribeFirebaseData === 'function') {
    subscribeFirebaseData(function (data) {
      _mgAssoMembers = Array.isArray(data.assoMembers) ? data.assoMembers : [];
      _mgApplyToDom();
    });
  } else {
    _mgApplyToDom();
  }
}

async function ttfMemberSignIn() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await firebase.auth().signInWithPopup(provider);
  } catch (e) {
    console.warn('[member-gate] sign-in failed', e);
  }
}

async function ttfMemberSignOut() {
  await firebase.auth().signOut();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ttfMemberGateInit);
} else {
  ttfMemberGateInit();
}
