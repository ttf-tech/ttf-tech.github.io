'use strict';

const crypto = require('crypto');

const FIREBASE_DB_URL = (process.env.FIREBASE_DB_URL || '').replace(/\/$/, '');
const FIREBASE_DB_SECRET = process.env.FIREBASE_DB_SECRET || '';

const PROFILE_FIELDS = [
  'nickname', 'gender', 'city', 'job', 'intro', 'linkedin', 'phone', 'goals',
  'acceptsRules', 'acceptsRulesAt', 'notificationConsent', 'notificationConsentAt',
  'profileUpdatedAt'
];
const HELLOASSO_PROFILE_OVERLAP = new Set(['city', 'phone', 'linkedin']);

const SEED_SURVEYS = [
  {
    id: 'seed_s1_tech', title: '你的主要技術領域是？（可複選）',
    titleFr: 'Quel est votre domaine technique principal ? (choix multiple)',
    description: '來自 WhatsApp 社群調查 / Sondage WhatsApp communautaire',
    type: 'multi', privacy: 'count_only', status: 'open', isLegacy: true,
    source: 'WhatsApp', createdAt: '2026-01-15T13:44:00.000Z',
    options: [
      'Backend Dev', 'Frontend Dev', 'Full Stack', 'DevOps/SRE/Cloud', 'Data/AI/ML',
      'Mobile', 'QA/Test', 'Security/Cybersec', 'Architect/Tech Lead', 'PM',
      'Designer', 'Biz Manager', 'Others'
    ].map(id => ({ id, label: id })),
    legacyCounts: {
      'Backend Dev': 3, 'Frontend Dev': 2, 'Full Stack': 2, 'DevOps/SRE/Cloud': 2,
      'Data/AI/ML': 11, Mobile: 1, 'QA/Test': 1, 'Security/Cybersec': 1,
      'Architect/Tech Lead': 2, PM: 10, Designer: 1, 'Biz Manager': 4, Others: 14
    }
  },
  {
    id: 'seed_s2_invest', title: '是否有興趣交流「在法國投資／長期發展」？',
    titleFr: "Êtes-vous intéressé(e) par les échanges sur l'investissement / développement long terme en France ?",
    description: '來自 WhatsApp 社群調查 / Sondage WhatsApp communautaire',
    type: 'multi', privacy: 'count_only', status: 'open', isLegacy: true,
    source: 'WhatsApp', createdAt: '2024-10-01T10:00:00.000Z',
    options: [
      '不感興趣', '有興趣但無額外資金', '有興趣且已在投資', '很有興趣願增加',
      '有興趣但不方便GMeet', '有興趣可參加GMeet'
    ].map(id => ({ id, label: id })),
    legacyCounts: {
      '不感興趣': 0, '有興趣但無額外資金': 5, '有興趣且已在投資': 4,
      '很有興趣願增加': 0, '有興趣但不方便GMeet': 0, '有興趣可參加GMeet': 11
    }
  },
  {
    id: 'seed_s3_city', title: '你目前主要所在城市是？',
    titleFr: 'Dans quelle ville êtes-vous principalement basé(e) ?',
    description: '來自 WhatsApp 社群調查 / Sondage WhatsApp communautaire',
    type: 'single', privacy: 'count_only', status: 'open', isLegacy: true,
    source: 'WhatsApp', createdAt: '2026-01-15T13:42:00.000Z',
    options: ['Paris', 'Lyon', 'Toulouse', 'Bordeaux', 'Lille', 'Strasbourg', 'Nice', 'Taiwan', 'Autres']
      .map(id => ({ id, label: id })),
    legacyCounts: { Paris: 38, Lyon: 5, Toulouse: 0, Bordeaux: 2, Lille: 0, Strasbourg: 0, Nice: 2, Taiwan: 8, Autres: 8 }
  },
  {
    id: 'seed_s4_status', title: '你目前的狀態是？',
    titleFr: 'Quel est votre statut professionnel actuel ?',
    description: '來自 WhatsApp 社群調查 / Sondage WhatsApp communautaire',
    type: 'multi', privacy: 'count_only', status: 'open', isLegacy: true,
    source: 'WhatsApp', createdAt: '2026-01-15T13:35:00.000Z',
    options: ['CDI', 'Freelance', 'Searching', 'Stable', 'Hiring', 'NewArrival'].map(id => ({ id, label: id })),
    legacyCounts: { CDI: 17, Freelance: 4, Searching: 37, Stable: 7, Hiring: 2, NewArrival: 10 }
  }
];

function requireEnv() {
  if (!FIREBASE_DB_URL || !FIREBASE_DB_SECRET) {
    throw new Error('FIREBASE_DB_URL and FIREBASE_DB_SECRET are required');
  }
}

function asObject(value) {
  if (!value || typeof value !== 'object') return {};
  if (Array.isArray(value)) return Object.fromEntries(value.filter(Boolean).map(item => [item.id, item]));
  return value;
}

function legacyVoteKey(surveyId, displayName) {
  return `legacy_${crypto.createHash('sha256').update(`${surveyId}:${displayName}`).digest('hex').slice(0, 24)}`;
}

function splitMember(member, existingProfile) {
  const official = { ...member };
  const migratedProfile = {
    memberId: member.id,
    email: String(member.email || '').trim().toLowerCase(),
    source: 'member',
    createdAt: member.createdAt || member.joinedAt || new Date().toISOString(),
    profileUpdatedAt: member.profileUpdatedAt || new Date().toISOString()
  };
  PROFILE_FIELDS.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(official, field)) migratedProfile[field] = official[field];
    if (!HELLOASSO_PROFILE_OVERLAP.has(field)) delete official[field];
  });
  delete official.uid;
  delete official.source;
  delete official.profileCreatedAt;
  return { official, profile: { ...migratedProfile, ...(existingProfile || {}) } };
}

function convertVotes(legacyVotes, surveyMap, existingVotes) {
  const result = {};
  for (const [surveyId, votesByName] of Object.entries(legacyVotes || {})) {
    result[surveyId] = {};
    const survey = surveyMap[surveyId] || {};
    for (const [displayName, options] of Object.entries(votesByName || {})) {
      if (!Array.isArray(options) || !options.length) continue;
      const key = legacyVoteKey(surveyId, displayName);
      const record = {
        uid: key,
        options,
        source: 'legacy',
        votedAt: survey.createdAt || '2026-01-15T00:00:00.000Z',
        updatedAt: survey.createdAt || '2026-01-15T00:00:00.000Z'
      };
      if (survey.privacy === 'show_voters') record.displayName = displayName;
      result[surveyId][key] = record;
    }
  }
  for (const [surveyId, votes] of Object.entries(existingVotes || {})) {
    result[surveyId] = { ...(result[surveyId] || {}), ...(votes || {}) };
  }
  return result;
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

  const existingProfiles = asObject(root.memberProfiles);
  const officialMembers = {};
  const memberProfiles = {};
  for (const [memberId, rawMember] of Object.entries(asObject(root.assoMembers))) {
    const member = { id: memberId, ...(rawMember || {}) };
    const split = splitMember(member, existingProfiles[memberId]);
    officialMembers[memberId] = split.official;
    memberProfiles[memberId] = split.profile;
  }

  const dynamicSurveys = (Array.isArray(legacy.userSurveys) ? legacy.userSurveys : []).map(survey => {
    const { votesByMember, ...definition } = survey;
    return definition;
  });
  const migratedSurveyMap = Object.fromEntries([...SEED_SURVEYS, ...dynamicSurveys].map(survey => [survey.id, survey]));
  const surveyMap = { ...migratedSurveyMap, ...asObject(root.surveys) };
  const legacyVotes = { ...(legacy.surveyVotes || {}) };
  for (const survey of (legacy.userSurveys || [])) {
    legacyVotes[survey.id] = { ...(legacyVotes[survey.id] || {}), ...(survey.votesByMember || {}) };
  }
  const surveyVotes = convertVotes(legacyVotes, surveyMap, asObject(root.surveyVotes));

  const summary = {
    schemaVersion: 4,
    migratedAt: new Date().toISOString(),
    memberCount: Object.keys(officialMembers).length,
    profileCount: Object.keys(memberProfiles).length,
    surveyCount: Object.keys(surveyMap).length,
    voteCount: Object.values(surveyVotes).reduce((total, votes) => total + Object.keys(votes || {}).length, 0)
  };

  const write = await fetch(`${FIREBASE_DB_URL}/.json?${auth}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assoMembers: officialMembers,
      memberProfiles,
      surveys: surveyMap,
      surveyVotes,
      'system/phase34Migration': summary
    })
  });
  if (!write.ok) throw new Error(`Firebase write failed: ${write.status} ${await write.text()}`);
  console.log(`Phase 3/4 migration complete: ${JSON.stringify(summary)}`);
}

module.exports = { splitMember, convertVotes, legacyVoteKey };

if (require.main === module) {
  main().catch(error => {
    console.error('[migrate-firebase-phases-3-4] failed:', error.message);
    process.exit(1);
  });
}
