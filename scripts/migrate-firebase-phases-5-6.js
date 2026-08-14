'use strict';

const FIREBASE_DB_URL = (process.env.FIREBASE_DB_URL || '').replace(/\/$/, '');
const FIREBASE_DB_SECRET = process.env.FIREBASE_DB_SECRET || '';
const SEED_MEMBER_COUNT = 68;

function requireEnv() {
  if (!FIREBASE_DB_URL || !FIREBASE_DB_SECRET) {
    throw new Error('FIREBASE_DB_URL and FIREBASE_DB_SECRET are required');
  }
}

function asObject(value) {
  if (!value || typeof value !== 'object') return {};
  if (Array.isArray(value)) {
    return Object.fromEntries(value.filter(item => item?.id).map(item => [item.id, item]));
  }
  return value;
}

function mergeCollection(legacyRecords, existingRecords) {
  return { ...asObject(legacyRecords), ...asObject(existingRecords) };
}

function assertValidFirebaseKeys(value, path = '') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertValidFirebaseKeys(child, `${path}/${index}`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (/[.#$\[\]\/]/.test(key)) throw new Error(`Invalid Firebase key at ${path || '/'}: ${key}`);
    assertValidFirebaseKeys(child, `${path}/${key}`);
  }
}

async function main() {
  requireEnv();
  const auth = `auth=${encodeURIComponent(FIREBASE_DB_SECRET)}`;
  const response = await fetch(`${FIREBASE_DB_URL}/.json?${auth}`);
  if (!response.ok) throw new Error(`Firebase read failed: ${response.status} ${await response.text()}`);
  const root = await response.json() || {};

  let legacy = {};
  if (typeof root.grp_hub_v2?.data === 'string') {
    try { legacy = JSON.parse(root.grp_hub_v2.data); } catch (_) { legacy = {}; }
  }

  const communityMembers = mergeCollection(legacy.addedMembers, root.communityMembers);
  const announcements = mergeCollection(legacy.announcements, root.announcements);
  const jobs = mergeCollection(legacy.jobs, root.jobs);
  const sharings = mergeCollection(legacy.sharings, root.sharings);
  const meetings = mergeCollection(legacy.meetings, root.meetings);
  const expenses = mergeCollection(legacy.expenses, root.expenses);
  const migratedAt = new Date().toISOString();
  const summary = {
    schemaVersion: 6,
    migratedAt,
    communityMemberCount: Object.keys(communityMembers).length,
    announcementCount: Object.keys(announcements).length,
    jobCount: Object.keys(jobs).length,
    sharingCount: Object.keys(sharings).length,
    meetingCount: Object.keys(meetings).length,
    expenseCount: Object.keys(expenses).length
  };

  const payload = {
    communityMembers,
    announcements,
    jobs,
    sharings,
    meetings,
    expenses,
    publicStats: {
      ...(root.publicStats || {}),
      communityMemberCount: SEED_MEMBER_COUNT + Object.keys(communityMembers).length,
      announcementCount: Object.keys(announcements).length,
      jobCount: Object.keys(jobs).length,
      updatedAt: migratedAt
    },
    system: { ...(root.system || {}), phase56Migration: summary }
  };
  assertValidFirebaseKeys(payload);

  const write = await fetch(`${FIREBASE_DB_URL}/.json?${auth}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!write.ok) throw new Error(`Firebase write failed: ${write.status} ${await write.text()}`);
  console.log(`Phase 5/6 migration complete: ${JSON.stringify(summary)}`);
}

module.exports = { asObject, mergeCollection, assertValidFirebaseKeys };

if (require.main === module) {
  main().catch(error => {
    console.error('[migrate-firebase-phases-5-6] failed:', error.message);
    process.exit(1);
  });
}
