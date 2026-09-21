#!/usr/bin/env node
/**
 * Pulls paid memberships from HelloAsso and writes normalized member paths:
 *   - /assoMembers/{memberId}
 *   - /assoMemberLookup/{sha256(email)}
 *
 * Also upserts every active member into Brevo (NOM/PRENOM/FIRSTNAME/LASTNAME/
 * EXT_ID attributes + "Member Official" list membership — added when active,
 * removed when lapsed) on every run, and sends a one-time Brevo transactional
 * welcome email to any member (HelloAsso-synced or manually added in
 * admin.html) that doesn't yet have a `welcomeEmailSentAt` stamp. A failed
 * send just leaves the stamp unset, so the next sync retries it automatically
 * — no separate retry/queue needed.
 *
 * Runs on a daily schedule plus manual dispatch — see
 * .github/workflows/sync-helloasso.yml.
 * Required GitHub Actions secrets:
 *   HELLOASSO_CLIENT_ID
 *   HELLOASSO_CLIENT_SECRET
 *   FIREBASE_DB_SECRET
 * Optional overrides: HELLOASSO_ORG_SLUG, FIREBASE_DB_URL, BREVO_MEMBER_LIST_ID
 * (defaults to 3, the "Member Official" list).
 * Optional (Brevo sync/welcome email is skipped, not fatal, if unset):
 *   BREVO_API_KEY                — required for any Brevo sync at all.
 *   BREVO_WELCOME_TEMPLATE_ID    — id of a Brevo *transactional* template
 *                                  (Transactionnel → Templates), not a
 *                                  Campagnes id. Without it, contacts still
 *                                  get upserted/list-synced, just no email.
 */
'use strict';

const { createHash } = require('node:crypto');

const HELLOASSO_CLIENT_ID     = process.env.HELLOASSO_CLIENT_ID;
const HELLOASSO_CLIENT_SECRET = process.env.HELLOASSO_CLIENT_SECRET;
const HELLOASSO_ORG_SLUG      = process.env.HELLOASSO_ORG_SLUG || 'taiwan-tech-france-association';
const FIREBASE_DB_URL         = process.env.FIREBASE_DB_URL || 'https://groupe-tech-fr-default-rtdb.europe-west1.firebasedatabase.app';
const FIREBASE_DB_SECRET      = process.env.FIREBASE_DB_SECRET;
const BREVO_API_KEY           = process.env.BREVO_API_KEY;
const BREVO_WELCOME_TEMPLATE_ID = process.env.BREVO_WELCOME_TEMPLATE_ID;
const BREVO_MEMBER_LIST_ID    = Number(process.env.BREVO_MEMBER_LIST_ID || '3');

function requireEnv() {
  const missing = ['HELLOASSO_CLIENT_ID', 'HELLOASSO_CLIENT_SECRET', 'FIREBASE_DB_SECRET']
    .filter(key => !process.env[key]);
  if (missing.length) {
    console.error(`Missing required secret(s): ${missing.join(', ')}`);
    process.exit(1);
  }
}

function normalizeEmail(value) {
  return (value || '').trim().toLowerCase();
}

function hashEmail(email) {
  return createHash('sha256').update(normalizeEmail(email)).digest('hex');
}

function isActiveMembership(joinedAt) {
  if (!joinedAt) return true;
  const joinedTime = new Date(joinedAt).getTime();
  if (!Number.isFinite(joinedTime)) return false;
  const ageDays = (Date.now() - joinedTime) / 86400000;
  return ageDays >= 0 && ageDays <= 365;
}

async function getHelloAssoToken() {
  const response = await fetch('https://api.helloasso.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: HELLOASSO_CLIENT_ID,
      client_secret: HELLOASSO_CLIENT_SECRET
    })
  });
  if (!response.ok) {
    throw new Error(`HelloAsso auth failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()).access_token;
}

async function fetchAllMembershipOrders(token) {
  const orders = [];
  const pageSize = 100;
  for (let pageIndex = 1; pageIndex <= 50; pageIndex++) {
    const url = new URL(`https://api.helloasso.com/v5/organizations/${HELLOASSO_ORG_SLUG}/orders`);
    url.searchParams.set('formTypes', 'Membership');
    url.searchParams.set('withDetails', 'true');
    url.searchParams.set('pageSize', String(pageSize));
    url.searchParams.set('pageIndex', String(pageIndex));
    url.searchParams.set('sortOrder', 'Desc');

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      throw new Error(`HelloAsso orders fetch failed: ${response.status} ${await response.text()}`);
    }
    const json = await response.json();
    const data = Array.isArray(json.data) ? json.data : [];
    orders.push(...data);
    if (data.length < pageSize) break;
  }
  return orders;
}

function findCustomField(customFields, pattern) {
  if (!Array.isArray(customFields)) return '';
  const field = customFields.find(item => pattern.test(item.name || ''));
  return field ? String(field.answer || '').trim() : '';
}

function extractMembersFromOrders(orders) {
  const membersByEmail = new Map();
  for (const order of orders) {
    const payer = order.payer || {};
    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items) {
      const user = item.user || {};
      const email = normalizeEmail(user.email || payer.email);
      if (!email) continue;

      const firstName = user.firstName || payer.firstName || '';
      const lastName  = user.lastName || payer.lastName || '';
      const member = {
        email,
        name: `${firstName} ${lastName}`.trim() || email.split('@')[0],
        city: payer.city || '',
        phone: findCustomField(item.customFields, /t[eé]l[eé]phone|\btel\b|phone/i),
        linkedin: findCustomField(item.customFields, /linkedin/i),
        expertise: findCustomField(item.customFields, /domaine.*expertise|expertise/i),
        motivation: findCustomField(item.customFields, /pourquoi devenir|motivation/i),
        helloassoRef: `order-${order.id}-item-${item.id}`,
        joinedAt: order.date ? new Date(order.date).toISOString() : new Date().toISOString()
      };
      const existing = membersByEmail.get(email);
      if (!existing || new Date(member.joinedAt) > new Date(existing.joinedAt)) {
        membersByEmail.set(email, member);
      }
    }
  }
  return [...membersByEmail.values()];
}

function objectToMembers(value) {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return Object.entries(value).map(([id, member]) => ({ id, ...(member || {}) }));
}

// The template's subject uses {{ contact.FIRSTNAME }}, which reads from the
// Brevo *contact record*, not from the params passed to the send call below.
// Upsert the contact first so that merge tag resolves instead of rendering blank.
//
// This Brevo tenant's contact detail view labels name fields NOM/PRENOM
// (French custom attributes from an earlier manual import), not just the
// Brevo-native FIRSTNAME/LASTNAME — so both pairs are set here, otherwise
// NOM/PRENOM are left stuck on whatever stale value they last had (which is
// what caused contacts to visibly show the literal text "NOM"/"PRENOM").
// listIds/unlinkListIds keep "Member Official" membership in sync with
// active status on every run, not just on a member's first sync.
async function upsertBrevoContact(member) {
  const [firstName, ...rest] = (member.name || '').split(' ');
  const lastName = rest.join(' ');
  const body = {
    email: member.email,
    attributes: {
      FIRSTNAME: firstName || member.name || '',
      LASTNAME: lastName,
      PRENOM: firstName || member.name || '',
      NOM: lastName,
      EXT_ID: member.id || ''
    },
    updateEnabled: true
  };
  if (member.status === 'active') body.listIds = [BREVO_MEMBER_LIST_ID];
  else body.unlinkListIds = [BREVO_MEMBER_LIST_ID];

  const response = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': BREVO_API_KEY
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`Brevo contact upsert failed: ${response.status} ${await response.text()}`);
  }
}

async function sendBrevoWelcomeEmail(member) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': BREVO_API_KEY
    },
    body: JSON.stringify({
      templateId: Number(BREVO_WELCOME_TEMPLATE_ID),
      to: [{ email: member.email, name: member.name || member.email }],
      params: {
        NAME: member.name || '',
        FIRSTNAME: (member.name || '').split(' ')[0] || member.name || ''
      }
    })
  });
  if (!response.ok) {
    throw new Error(`Brevo send failed: ${response.status} ${await response.text()}`);
  }
}

// Upserts every member with an email into Brevo — not just new ones — so
// "Member Official" list membership and NOM/PRENOM/etc. stay correct for
// members who joined before this automation existed or whose welcome email
// already fired. The one-time welcome email itself still only fires once,
// via the `welcomeEmailSentAt` stamp mutated in place on entries of `members`
// so the caller's later Firebase write persists it for successes. A member
// whose upsert fails is skipped for the welcome send this run (its contact
// record isn't in a known-good state); a member whose send fails keeps no
// stamp, so the next sync retries it automatically.
async function syncMembersToBrevo(members, syncedAt) {
  if (!BREVO_API_KEY) {
    console.log('[sync-helloasso] BREVO_API_KEY not set — skipping Brevo sync');
    return { upserted: 0, upsertFailed: 0, sent: 0, failed: 0, skipped: true };
  }
  const targets = members.filter(member => member.email);
  let upserted = 0;
  let upsertFailed = 0;
  let sent = 0;
  let failed = 0;
  for (const member of targets) {
    try {
      await upsertBrevoContact(member);
      upserted++;
    } catch (error) {
      console.error(`[sync-helloasso] Brevo upsert failed for ${member.email}:`, error.message);
      upsertFailed++;
      continue;
    }
    if (!BREVO_WELCOME_TEMPLATE_ID || member.welcomeEmailSentAt) continue;
    try {
      await sendBrevoWelcomeEmail(member);
      member.welcomeEmailSentAt = syncedAt;
      sent++;
    } catch (error) {
      console.error(`[sync-helloasso] welcome email failed for ${member.email}:`, error.message);
      failed++;
    }
  }
  return { upserted, upsertFailed, sent, failed, skipped: false };
}

async function syncToFirebase(helloAssoMembers) {
  const authQuery = `auth=${encodeURIComponent(FIREBASE_DB_SECRET)}`;
  const v2Url = `${FIREBASE_DB_URL}/assoMembers.json?${authQuery}`;
  const auditUrl = `${FIREBASE_DB_URL}/assoMemberFieldAudit.json?${authQuery}`;
  const rootUrl = `${FIREBASE_DB_URL}/.json?${authQuery}`;

  const [v2Response, auditResponse] = await Promise.all([fetch(v2Url), fetch(auditUrl)]);
  if (!v2Response.ok) {
    throw new Error(`Firebase v2 read failed: ${v2Response.status} ${await v2Response.text()}`);
  }
  if (!auditResponse.ok) {
    throw new Error(`Firebase audit read failed: ${auditResponse.status} ${await auditResponse.text()}`);
  }

  const existingV2 = objectToMembers(await v2Response.json());
  const fieldAudit = await auditResponse.json() || {};
  const baseline = existingV2;
  const membersById = new Map(baseline.map(member => [member.id, { ...member }]));
  const memberByEmail = new Map(baseline
    .filter(member => normalizeEmail(member.email))
    .map(member => [normalizeEmail(member.email), member]));
  const memberByRef = new Map(baseline
    .filter(member => member.helloassoRef)
    .map(member => [member.helloassoRef, member]));
  for (const member of baseline) {
    const audit = fieldAudit[member.id] || {};
    const previousEmail = normalizeEmail(audit.email?.previousValue);
    const previousRef = audit.helloassoRef?.previousValue;
    if (previousEmail) memberByEmail.set(previousEmail, member);
    if (previousRef) memberByRef.set(previousRef, member);
  }

  let added = 0;
  let updated = 0;
  const syncedAt = new Date().toISOString();
  for (const incoming of helloAssoMembers) {
    const email = normalizeEmail(incoming.email);
    const existing = memberByRef.get(incoming.helloassoRef) || memberByEmail.get(email);
    const id = existing?.id || `ha_${hashEmail(email).slice(0, 20)}`;
    const merged = {
      id,
      ...(existing || {}),
      ...incoming,
      email,
      city: incoming.city || existing?.city || '',
      phone: incoming.phone || existing?.phone || '',
      linkedin: incoming.linkedin || existing?.linkedin || '',
      expertise: incoming.expertise || existing?.expertise || '',
      motivation: incoming.motivation || existing?.motivation || '',
      status: isActiveMembership(incoming.joinedAt) ? 'active' : 'inactive',
      syncedAt
    };
    const audit = fieldAudit[id] || {};
    for (const field of Object.keys(audit)) {
      if (existing && Object.prototype.hasOwnProperty.call(existing, field)) merged[field] = existing[field];
    }
    membersById.set(id, merged);
    if (existing) updated++;
    else added++;
  }

  // Preserve admin-created members not returned by HelloAsso.
  const finalMembers = [...membersById.values()].map(member => ({
    ...member,
    id: member.id,
    email: normalizeEmail(member.email),
    status: isActiveMembership(member.joinedAt) ? 'active' : 'inactive'
  }));
  // Runs before memberMap is built so a successful send's welcomeEmailSentAt
  // stamp (mutated onto these same objects) lands in the write below.
  const brevoResult = await syncMembersToBrevo(finalMembers, syncedAt);

  const memberMap = Object.fromEntries(finalMembers.map(member => [member.id, member]));
  const lookupMap = Object.fromEntries(finalMembers
    .filter(member => member.email)
    .map(member => [hashEmail(member.email), {
      email: member.email,
      memberId: member.id,
      active: member.status === 'active',
      joinedAt: member.joinedAt || '',
      updatedAt: syncedAt
    }]));

  const brevoNote = brevoResult.skipped
    ? ''
    : ` · Brevo 已同步 ${brevoResult.upserted} 位${brevoResult.upsertFailed ? `，${brevoResult.upsertFailed} 位失敗` : ''} · ${brevoResult.upserted} synced to Brevo${brevoResult.upsertFailed ? `, ${brevoResult.upsertFailed} failed` : ''}`;
  const emailNote = brevoResult.skipped || (brevoResult.sent === 0 && brevoResult.failed === 0)
    ? ''
    : ` · 歡迎信已寄出 ${brevoResult.sent} 封${brevoResult.failed ? `，${brevoResult.failed} 封失敗` : ''} · ${brevoResult.sent} welcome email(s) sent${brevoResult.failed ? `, ${brevoResult.failed} failed` : ''}`;
  const message = (helloAssoMembers.length === 0
    ? '尚無 HelloAsso 會員付款資料 · No HelloAsso payments to sync yet'
    : `已新增 ${added} 位、更新 ${updated} 位 · ${added} added, ${updated} updated`) + brevoNote + emailNote;
  const syncSummary = {
    schemaVersion: 3,
    ts: Date.now(),
    brevoSynced: brevoResult.upserted,
    brevoSyncFailed: brevoResult.upsertFailed,
    emailsSent: brevoResult.sent,
    emailsFailed: brevoResult.failed,
    added,
    updated,
    totalFromHelloAsso: helloAssoMembers.length,
    totalStored: finalMembers.length,
    message
  };

  // Phase 3 keeps the legacy blob read-only. New syncs update only normalized paths.
  const writeResponse = await fetch(rootUrl, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assoMembers: memberMap,
      assoMemberLookup: lookupMap,
      'system/helloAssoSync': syncSummary
    })
  });
  if (!writeResponse.ok) {
    throw new Error(`Firebase write failed: ${writeResponse.status} ${await writeResponse.text()}`);
  }

  console.log(`HelloAsso sync done — ${message}; ${finalMembers.length} stored in v2`);
}

async function main() {
  requireEnv();
  try {
    const token = await getHelloAssoToken();
    const orders = await fetchAllMembershipOrders(token);
    const members = extractMembersFromOrders(orders);
    await syncToFirebase(members);
  } catch (error) {
    console.error('[sync-helloasso] failed:', error.message);
    process.exit(1);
  }
}

module.exports = {
  normalizeEmail,
  hashEmail,
  isActiveMembership,
  extractMembersFromOrders,
  objectToMembers,
  syncToFirebase
};

if (require.main === module) main();
