/* ── member-directory.js — members-only directory projection ─────
 * `memberDirectory/{memberId}` is a privacy-reduced copy of an active
 * Adhésion member, readable only by verified members and admins (see
 * database.rules.json). It never contains email, phone, gender, intro or
 * HelloAsso motivation — only what members agreed to show each other.
 *
 * Single source of truth for the projection, shared by:
 *   - admin.html (stastic_member.js)   — reconciles on load + on save/delete
 *   - member-profile.js               — a member refreshes their own entry
 *   - scripts/sync-helloasso.js       — rebuilds the node after each sync
 *   - adhesion.html                   — reads + renders it
 *
 * A member hides themself with memberProfiles/{id}/directoryVisible = false.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TTFMemberDirectory = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VALID_DAYS = 365;
  const ENTRY_FIELDS = ['id', 'name', 'nickname', 'city', 'job', 'expertise', 'linkedin', 'goals', 'joinedAt', 'isAdmin'];
  const GOAL_IDS = ['networking', 'jobs', 'knowledge', 'longterm', 'local', 'info', 'collab', 'fiscal'];

  const norm = value => String(value || '').trim().toLowerCase();
  const text = (value, max) => String(value || '').trim().slice(0, max);

  function isActive(official) {
    if (!official || official.status === 'inactive') return false;
    if (!official.joinedAt) return true;
    const joined = new Date(official.joinedAt).getTime();
    if (!Number.isFinite(joined)) return false;
    const ageDays = (Date.now() - joined) / 86400000;
    return ageDays >= 0 && ageDays <= VALID_DAYS;
  }

  // Only https URLs ever reach an href on the members page.
  function safeLinkedin(value) {
    let url = String(value || '').trim();
    if (!url) return '';
    if (/^http:\/\//i.test(url)) url = 'https://' + url.slice(7);
    else if (!/^https:\/\//i.test(url)) {
      if (!/^(www\.)?([a-z]{2,3}\.)?linkedin\.com\//i.test(url)) return '';
      url = 'https://' + url;
    }
    // https://host[/path] with no whitespace, quotes or angle brackets.
    return url.length <= 500 && /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[^\s"'<>`]*)?$/i.test(url) ? url : '';
  }

  /**
   * @param {object} official  assoMembers/{id}
   * @param {object} [profile] memberProfiles/{id} (or adminProfiles entry merged on top)
   * @param {{isAdmin?: boolean}} [options]
   * @returns {object|null} directory entry, or null when it must not be listed
   */
  function buildEntry(official, profile, options) {
    if (!official || !official.id || !isActive(official)) return null;
    // name/joinedAt are copied verbatim: Rules require them to equal assoMembers.
    const name = typeof official.name === 'string' ? official.name : '';
    if (!name.trim() || name.length > 200) return null;
    const p = profile || {};
    if (p.directoryVisible === false) return null;

    const entry = { id: String(official.id), name };
    const nickname = text(p.nickname, 100);
    const city = text(p.city || official.city, 200);
    const job = text(p.job, 300);
    const expertise = text(official.expertise, 300);
    const linkedin = safeLinkedin(p.linkedin || official.linkedin);
    const goals = (Array.isArray(p.goals) ? p.goals : []).filter(goal => GOAL_IDS.includes(goal));
    if (nickname) entry.nickname = nickname;
    if (city) entry.city = city;
    if (job) entry.job = job;
    if (expertise) entry.expertise = expertise;
    if (linkedin) entry.linkedin = linkedin;
    if (goals.length) entry.goals = goals;
    if (official.joinedAt) entry.joinedAt = String(official.joinedAt);
    if (options && options.isAdmin === true) entry.isAdmin = true;
    return entry;
  }

  function withTimestamp(entry, updatedAt) {
    return entry ? { ...entry, updatedAt: updatedAt || new Date().toISOString() } : null;
  }

  /** Builds the full node: { [memberId]: entry } for every listable member. */
  function buildMap({ officials, memberProfiles, adminProfiles, adminEmails, updatedAt }) {
    const stamp = updatedAt || new Date().toISOString();
    const profileById = new Map((memberProfiles || []).filter(p => p && p.memberId).map(p => [p.memberId, p]));
    const adminProfileByEmail = new Map((adminProfiles || []).filter(p => p && p.email).map(p => [norm(p.email), p]));
    const adminSet = new Set((adminEmails || []).map(norm).filter(Boolean));
    const result = {};
    (officials || []).forEach(official => {
      const email = norm(official && official.email);
      const merged = { ...(profileById.get(official && official.id) || {}), ...(adminProfileByEmail.get(email) || {}) };
      const entry = buildEntry(official, merged, { isAdmin: adminSet.has(email) });
      if (entry) result[entry.id] = withTimestamp(entry, stamp);
    });
    return result;
  }

  /** True when two entries differ in anything but updatedAt. */
  function differs(a, b) {
    if (!a || !b) return !!a !== !!b;
    return ENTRY_FIELDS.some(field => JSON.stringify(a[field] ?? null) !== JSON.stringify(b[field] ?? null));
  }

  return { VALID_DAYS, GOAL_IDS, isActive, safeLinkedin, buildEntry, buildMap, withTimestamp, differs };
});
