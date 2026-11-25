/* ── Central admin role resolver ────────────────────────────────
 * Single source of truth: /access/adminEmails/{emailKey}
 *   { email, active, name?, updatedAt? }
 * emailKey = lower-cased email with every '.' replaced by ',' (RTDB keys
 * cannot contain '.'). database.rules.json derives the same key from the
 * signed-in token, so the UI gate and the Rules can never disagree.
 *
 * Granting / revoking an administrator is a data change on that node
 * (Firebase Console → Data). No code change, no Rules redeploy.
 */
(function (global) {
  'use strict';

  const ADMIN_EMAILS_PATH = 'access/adminEmails';
  const resolvedAccess = new Map();
  const pendingAccess = new Map();

  function normalizeEmail(value) {
    return (value || '').trim().toLowerCase();
  }

  function adminEmailKey(email) {
    return normalizeEmail(email).replace(/\./g, ',');
  }

  function cachedAdminAccess(user) {
    return !!(user && user.uid) && resolvedAccess.get(user.uid) === true;
  }

  async function resolveAdminAccess(user) {
    if (!user || !user.uid || typeof firebase === 'undefined' || !firebase.database) return false;
    // Mirrors the Rules: an unverified or missing email is never an admin.
    if (!user.email || user.emailVerified === false) return false;
    if (resolvedAccess.has(user.uid)) return resolvedAccess.get(user.uid) === true;
    if (pendingAccess.has(user.uid)) return pendingAccess.get(user.uid);

    const request = (async () => {
      try {
        const snapshot = await firebase.database()
          .ref(`${ADMIN_EMAILS_PATH}/${adminEmailKey(user.email)}`)
          .once('value');
        const record = snapshot.val();
        const allowed = !!record && record.active === true &&
          normalizeEmail(record.email) === normalizeEmail(user.email);
        resolvedAccess.set(user.uid, allowed);
        return allowed;
      } catch (error) {
        // Not cached: a transient failure must not stick until reload.
        console.warn('[admin-access] role check failed', error);
        return false;
      } finally {
        pendingAccess.delete(user.uid);
      }
    })();

    pendingAccess.set(user.uid, request);
    return request;
  }

  function clearAdminAccess(user) {
    if (user && user.uid) {
      resolvedAccess.delete(user.uid);
      pendingAccess.delete(user.uid);
      return;
    }
    resolvedAccess.clear();
    pendingAccess.clear();
  }

  global.TTF_ADMIN_EMAILS_PATH = ADMIN_EMAILS_PATH;
  global.ttfNormalizeAdminEmail = normalizeEmail;
  global.ttfAdminEmailKey = adminEmailKey;
  global.ttfHasAdminAccess = cachedAdminAccess;
  global.ttfResolveAdminAccess = resolveAdminAccess;
  global.ttfClearAdminAccess = clearAdminAccess;
})(window);
