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
const MEMBER_GATE_UI_HINT_KEY = 'ttf_auth_ui_hint_v1';

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
let _mgAuthResolved = false;
let _mgMembershipResolved = false;
let _mgHasSignInHint = false;

function _mgNorm(email) {
  return (email || '').trim().toLowerCase();
}

function _mgIsAdmin(email) {
  const norm = _mgNorm(email);
  const admins = (typeof ADMIN_EMAILS !== 'undefined') ? ADMIN_EMAILS : [];
  return !!norm && admins.some(admin => _mgNorm(admin) === norm);
}

function _mgLoadSignInHint() {
  try {
    const hint = JSON.parse(sessionStorage.getItem(MEMBER_GATE_UI_HINT_KEY) || 'null');
    return !!(hint && hint.signedIn === true);
  } catch (_) {
    return false;
  }
}

function _mgSaveSignInHint(user) {
  try {
    if (user) {
      sessionStorage.setItem(MEMBER_GATE_UI_HINT_KEY, JSON.stringify({
        signedIn: true,
        savedAt: Date.now()
      }));
    } else {
      sessionStorage.removeItem(MEMBER_GATE_UI_HINT_KEY);
    }
  } catch (_) {}
}

function ttfIsAdhesionMember(email) {
  const norm = _mgNorm(email);
  if (!norm) return false;

  if (_mgIsAdmin(norm)) return true;

  return _mgAssoMembers.some(m => {
    if (_mgNorm(m.email) !== norm) return false;
    if (!m.joinedAt) return true; // no date on record — don't lock them out
    const ageDays = (Date.now() - new Date(m.joinedAt).getTime()) / 86400000;
    return ageDays >= 0 && ageDays <= MEMBER_GATE_VALID_DAYS;
  });
}

function _mgApplyToDom() {
  const isAdmin = _mgIsAdmin(_mgUser && _mgUser.email);
  const restoringAuth = _mgHasSignInHint && !_mgAuthResolved;
  const checkingMembership = !!_mgUser && !isAdmin && !_mgMembershipResolved;
  const isRestoring = restoringAuth || checkingMembership;
  const hasAccess = !isRestoring && ttfIsAdhesionMember(_mgUser && _mgUser.email);

  document.querySelectorAll('.restricted-asso-content').forEach(el => {
    el.style.display = hasAccess ? '' : 'none';
  });
  document.querySelectorAll('.upgrade-to-asso-banner').forEach(el => {
    el.style.display = (hasAccess || isRestoring) ? 'none' : '';
    el.classList.toggle('signed-in-non-member', !!_mgUser && !hasAccess && !isRestoring);
  });
  document.querySelectorAll('[data-member-gate-email]').forEach(el => {
    el.textContent = _mgUser ? _mgUser.email : '';
  });
  document.body.classList.toggle('mg-signed-in', !!_mgUser);
  document.body.classList.toggle('mg-auth-restoring', isRestoring);
}

function ttfMemberGateInit() {
  if (typeof firebase === 'undefined') {
    document.body.classList.remove('mg-auth-restoring');
    return;
  }
  if (!firebase.apps.length) firebase.initializeApp(_MG_FB_CONFIG);

  _mgHasSignInHint = _mgLoadSignInHint();
  _mgApplyToDom();

  firebase.auth().onAuthStateChanged(function (user) {
    _mgUser = user;
    _mgAuthResolved = true;
    _mgHasSignInHint = !!user;
    _mgSaveSignInHint(user);
    _mgApplyToDom();
  });

  if (typeof subscribeFirebaseData === 'function') {
    subscribeFirebaseData(function (data) {
      _mgAssoMembers = Array.isArray(data.assoMembers) ? data.assoMembers : [];
      if (data.source !== 'cache') _mgMembershipResolved = true;
      _mgApplyToDom();
    });
  } else {
    _mgMembershipResolved = true;
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
  _mgHasSignInHint = false;
  _mgSaveSignInHint(null);
  await firebase.auth().signOut();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ttfMemberGateInit);
} else {
  ttfMemberGateInit();
}
