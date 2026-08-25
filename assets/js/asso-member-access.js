/* ── HelloAsso membership resolver ──────────────────────────────
 * Looks up only the signed-in user's membership. The lookup key is a
 * SHA-256 hash of the normalized Google email; Firebase Rules still verify
 * that the email stored in the record matches auth.token.email.
 */
(function (global) {
  'use strict';

  const membershipCache = new Map();
  const pendingMembership = new Map();

  function normalizeEmail(value) {
    return (value || '').trim().toLowerCase();
  }

  async function hashEmail(email) {
    const normalized = normalizeEmail(email);
    if (!normalized || !global.crypto?.subtle || typeof TextEncoder === 'undefined') return '';
    const bytes = new TextEncoder().encode(normalized);
    const digest = await global.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function resolveMembership(user, forceRefresh) {
    if (!user || !user.uid || !normalizeEmail(user.email) ||
        typeof firebase === 'undefined' || !firebase.database) return null;
    if (!forceRefresh && membershipCache.has(user.uid)) return membershipCache.get(user.uid);
    if (!forceRefresh && pendingMembership.has(user.uid)) return pendingMembership.get(user.uid);

    const request = (async () => {
      try {
        const normalizedEmail = normalizeEmail(user.email);
        const emailHash = await hashEmail(normalizedEmail);
        if (!emailHash) return null;

        const lookupSnapshot = await firebase.database()
          .ref(`assoMemberLookup/${emailHash}`)
          .once('value');
        const lookup = lookupSnapshot.val();
        if (!lookup || normalizeEmail(lookup.email) !== normalizedEmail || !lookup.memberId) return null;

        const memberSnapshot = await firebase.database()
          .ref(`assoMembers/${lookup.memberId}`)
          .once('value');
        const member = memberSnapshot.val();
        if (!member || normalizeEmail(member.email) !== normalizedEmail) return null;

        const result = {
          active: lookup.active === true && member.status !== 'inactive',
          emailHash,
          memberId: lookup.memberId,
          member: { ...member, id: member.id || lookup.memberId }
        };
        // Create a UID-keyed access binding. Firebase Rules independently
        // verify this member ID belongs to the signed-in email and is active.
        if (result.active) {
          try {
            await firebase.database().ref(`access/members/${user.uid}`).set({
              uid: user.uid,
              email: normalizedEmail,
              memberId: lookup.memberId,
              active: true,
              updatedAt: new Date().toISOString()
            });
          } catch (bindingError) {
            // The membership lookup itself succeeded. Keep the verified member
            // status available to the UI even if Rules have not yet allowed the
            // optional UID binding write.
            console.warn('[asso-member-access] UID access binding unavailable', bindingError);
          }
        }
        membershipCache.set(user.uid, result);
        return result;
      } catch (error) {
        // Expected before the phase-two Rules and first migration sync exist.
        console.warn('[asso-member-access] membership lookup unavailable', error);
        return null;
      } finally {
        pendingMembership.delete(user.uid);
      }
    })();

    pendingMembership.set(user.uid, request);
    return request;
  }

  function clearMembership(user) {
    if (user?.uid) {
      membershipCache.delete(user.uid);
      pendingMembership.delete(user.uid);
      return;
    }
    membershipCache.clear();
    pendingMembership.clear();
  }

  global.ttfNormalizeAssoEmail = normalizeEmail;
  global.ttfHashAssoEmail = hashEmail;
  global.ttfResolveAssoMembership = resolveMembership;
  global.ttfClearAssoMembership = clearMembership;
})(window);
