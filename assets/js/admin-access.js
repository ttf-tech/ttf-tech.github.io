/* ── Central admin role resolver ────────────────────────────────
 * Primary source: /access/admins/{firebaseUid}
 * Temporary bootstrap: ADMIN_EMAILS lets an existing administrator create
 * their own UID record the first time they sign in after the new Rules ship.
 */
(function (global) {
  'use strict';

  const resolvedAccess = new Map();
  const pendingAccess = new Map();

  function normalizeEmail(value) {
    return (value || '').trim().toLowerCase();
  }

  function isBootstrapAdminEmail(email) {
    const normalized = normalizeEmail(email);
    const configured = (typeof ADMIN_EMAILS !== 'undefined' && Array.isArray(ADMIN_EMAILS))
      ? ADMIN_EMAILS
      : [];
    return !!normalized && configured.some(item => normalizeEmail(item) === normalized);
  }

  function cachedAdminAccess(user) {
    if (!user || !user.uid) return false;
    if (resolvedAccess.has(user.uid)) return resolvedAccess.get(user.uid) === true;
    return isBootstrapAdminEmail(user.email);
  }

  async function resolveAdminAccess(user) {
    if (!user || !user.uid || typeof firebase === 'undefined' || !firebase.database) return false;
    if (resolvedAccess.has(user.uid)) return resolvedAccess.get(user.uid) === true;
    if (pendingAccess.has(user.uid)) return pendingAccess.get(user.uid);

    const request = (async () => {
      const bootstrapAllowed = isBootstrapAdminEmail(user.email);
      const roleRef = firebase.database().ref(`access/admins/${user.uid}`);

      try {
        const snapshot = await roleRef.once('value');
        const existing = snapshot.val();

        if (existing) {
          const allowed = existing.active === true &&
            normalizeEmail(existing.email) === normalizeEmail(user.email);
          resolvedAccess.set(user.uid, allowed);
          return allowed;
        }

        if (!bootstrapAllowed) {
          resolvedAccess.set(user.uid, false);
          return false;
        }

        const now = new Date().toISOString();
        const result = await roleRef.transaction(current => current || {
          uid: user.uid,
          email: normalizeEmail(user.email),
          active: true,
          createdAt: now,
          updatedAt: now,
          source: 'bootstrap-email'
        });
        const record = result.snapshot && result.snapshot.val();
        const allowed = !!record && record.active === true &&
          normalizeEmail(record.email) === normalizeEmail(user.email);
        resolvedAccess.set(user.uid, allowed);
        return allowed;
      } catch (error) {
        // During deployment the old Rules do not know /access/admins yet.
        // Keep the existing whitelist working until the new Rules are published.
        if (bootstrapAllowed) {
          console.warn('[admin-access] UID role unavailable; using temporary email bootstrap', error);
          return true;
        }
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

  global.ttfNormalizeAdminEmail = normalizeEmail;
  global.ttfIsBootstrapAdminEmail = isBootstrapAdminEmail;
  global.ttfHasAdminAccess = cachedAdminAccess;
  global.ttfResolveAdminAccess = resolveAdminAccess;
  global.ttfClearAdminAccess = clearAdminAccess;
})(window);
