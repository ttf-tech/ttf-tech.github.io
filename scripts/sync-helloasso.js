#!/usr/bin/env node
/**
 * Pulls paid "Adhésion" memberships from the HelloAsso API and merges them
 * into the same `assoMembers` list that assets/js/member-gate.js checks and
 * that admin.html's "Asso Membres" tab already manages.
 *
 * Triggered manually via .github/workflows/sync-helloasso.yml (the admin
 * dashboard's "Sync Asso" button opens that workflow's "Run workflow" page —
 * GitHub Actions secrets only, nothing here is ever committed or shipped to
 * the browser). Requires these repo secrets (Settings → Secrets and
 * variables → Actions):
 *   HELLOASSO_CLIENT_ID       HelloAsso API client ID
 *   HELLOASSO_CLIENT_SECRET   HelloAsso API client secret
 *   FIREBASE_DB_SECRET        Firebase RTDB legacy secret (Project Settings
 *                             → Service accounts → Database secrets). This
 *                             grants full read/write regardless of the
 *                             `.write` rules — treat it like a password.
 * Optional overrides: HELLOASSO_ORG_SLUG, FIREBASE_DB_URL.
 *
 * No npm dependencies — Node 20's built-in fetch is enough.
 */
'use strict';

const HELLOASSO_CLIENT_ID     = process.env.HELLOASSO_CLIENT_ID;
const HELLOASSO_CLIENT_SECRET = process.env.HELLOASSO_CLIENT_SECRET;
const HELLOASSO_ORG_SLUG      = process.env.HELLOASSO_ORG_SLUG || 'taiwan-tech-france-association';
const FIREBASE_DB_URL         = process.env.FIREBASE_DB_URL || 'https://groupe-tech-fr-default-rtdb.europe-west1.firebasedatabase.app';
const FIREBASE_DB_SECRET      = process.env.FIREBASE_DB_SECRET;

function requireEnv() {
  const missing = ['HELLOASSO_CLIENT_ID', 'HELLOASSO_CLIENT_SECRET', 'FIREBASE_DB_SECRET']
    .filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`Missing required secret(s): ${missing.join(', ')}`);
    process.exit(1);
  }
}

// ── HelloAsso: OAuth2 client_credentials ────────────────────────
async function getHelloAssoToken() {
  const res = await fetch('https://api.helloasso.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: HELLOASSO_CLIENT_ID,
      client_secret: HELLOASSO_CLIENT_SECRET
    })
  });
  if (!res.ok) throw new Error(`HelloAsso auth failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.access_token;
}

// ── HelloAsso: paginate through all Membership-form orders ──────
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

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`HelloAsso orders fetch failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    const data = Array.isArray(json.data) ? json.data : [];
    orders.push(...data);
    if (data.length < pageSize) break;
  }
  return orders;
}

function findCustomField(customFields, pattern) {
  if (!Array.isArray(customFields)) return '';
  const f = customFields.find(cf => pattern.test(cf.name || ''));
  return f ? String(f.answer || '').trim() : '';
}

// ── Flatten HelloAsso orders → assoMembers-shaped records ────────
function extractMembersFromOrders(orders) {
  const members = [];
  for (const order of orders) {
    const payer = order.payer || {};
    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items) {
      const user = item.user || {};
      const email = (user.email || payer.email || '').trim().toLowerCase();
      if (!email) continue;

      const firstName = user.firstName || payer.firstName || '';
      const lastName  = user.lastName  || payer.lastName  || '';
      const name = `${firstName} ${lastName}`.trim() || email.split('@')[0];

      members.push({
        email,
        name,
        city:         payer.city || '',
        phone:        findCustomField(item.customFields, /t[ée]l[ée]phone|\btel\b|phone/i),
        linkedin:     findCustomField(item.customFields, /linkedin/i),
        helloassoRef: `order-${order.id}-item-${item.id}`,
        joinedAt:     order.date ? new Date(order.date).toISOString() : new Date().toISOString()
      });
    }
  }
  return members;
}

// ── Merge into the site's single Firebase RTDB blob ──────────────
// Same shape as assets/js/firebase-read.js reads and stastic_member.js
// writes: { ts, data: JSON.stringify(dynState) } under `grp_hub_v2`.
//
// Always writes — even when 0 members are found — and always stamps
// `dyn.lastAssoSync = { ts, added, updated, total, message }`. That's what
// makes the browser-side "Sync Asso" button reliable: admin.html's existing
// real-time Firebase listener fires on every run (not just ones that changed
// assoMembers), so it can show this exact `message` back to the admin
// instead of guessing from a timeout.
async function syncToFirebase(members) {
  const dataUrl = `${FIREBASE_DB_URL}/grp_hub_v2.json?auth=${FIREBASE_DB_SECRET}`;

  const res = await fetch(dataUrl);
  if (!res.ok) throw new Error(`Firebase read failed: ${res.status} ${await res.text()}`);
  const raw = await res.json();

  let dyn = {
    addedMembers: [], announcements: [], jobs: [], sharings: [],
    meetings: [], expenses: [], surveyVotes: {}, userSurveys: [], assoMembers: []
  };
  if (raw && typeof raw.data === 'string') {
    try { dyn = { ...dyn, ...JSON.parse(raw.data) }; } catch (_) { /* keep defaults */ }
  }
  if (!Array.isArray(dyn.assoMembers)) dyn.assoMembers = [];

  let added = 0, updated = 0;
  for (const m of members) {
    const idx = dyn.assoMembers.findIndex(x => (x.email || '').trim().toLowerCase() === m.email);
    if (idx >= 0) {
      dyn.assoMembers[idx] = { ...dyn.assoMembers[idx], ...m };
      updated++;
    } else {
      dyn.assoMembers.push({
        id: `ha_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        intro: '', job: '', goals: [],
        ...m
      });
      added++;
    }
  }

  const message = members.length === 0
    ? '目前 HelloAsso 尚無會員繳費紀錄，無需同步 · No HelloAsso payments to sync yet'
    : `已新增 ${added} 位、更新 ${updated} 位會員 · ${added} added, ${updated} updated`;

  dyn.lastAssoSync = { ts: Date.now(), added, updated, total: members.length, message };

  const ts = Math.max(Date.now(), ((raw && raw.ts) || 0) + 1);
  const putRes = await fetch(dataUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ts, data: JSON.stringify(dyn) })
  });
  if (!putRes.ok) throw new Error(`Firebase write failed: ${putRes.status} ${await putRes.text()}`);

  console.log(`HelloAsso sync done — ${message}`);
}

(async () => {
  requireEnv();
  try {
    const token   = await getHelloAssoToken();
    const orders  = await fetchAllMembershipOrders(token);
    const members = extractMembersFromOrders(orders);
    await syncToFirebase(members);
  } catch (e) {
    console.error('[sync-helloasso] failed:', e.message);
    process.exit(1);
  }
})();
