#!/usr/bin/env node
/**
 * Writes /surveys/{id} documents to Firebase for 3 community surveys.
 *
 * seed_s5_trajectory and seed_s6_bottleneck are "shadow" documents: their
 * real title/options/display already live as hardcoded entries in
 * vote.html's SURVEYS array (rendered via renderSurveyCard, not Firebase).
 * But database.rules.json requires root.child('surveys').child($surveyId)
 * .child('status') == 'open' before ANY vote write is allowed — and with
 * no Firebase document at that path, every vote was silently rejected
 * ("Erreur réseau" in the UI, actually a permission_denied). This script
 * creates the matching Firebase document so the rule's status check
 * passes. Content here is kept identical to vote.html's hardcoded copy —
 * source of truth for what members see is still vote.html.
 *
 * s7_resources has no vote.html counterpart — it's a normal
 * Firebase-native survey, same as one created via admin.html.
 *
 * Safe to re-run: full overwrite of just these 3 survey docs by fixed id,
 * not an append. Votes live under the separate /surveyVotes path, so
 * re-running this never touches or resets vote counts.
 *
 * Triggered manually by .github/workflows/seed-surveys.yml.
 * Required GitHub Actions secrets: FIREBASE_DB_SECRET
 * Optional override: FIREBASE_DB_URL
 */
'use strict';

const FIREBASE_DB_URL    = process.env.FIREBASE_DB_URL || 'https://groupe-tech-fr-default-rtdb.europe-west1.firebasedatabase.app';
const FIREBASE_DB_SECRET = process.env.FIREBASE_DB_SECRET;

function requireEnv() {
  if (!FIREBASE_DB_SECRET) {
    console.error('Missing required secret: FIREBASE_DB_SECRET');
    process.exit(1);
  }
}

const CREATED_AT = '2026-09-09T00:00:00.000Z';

function opt(id, label) {
  return { id, label };
}

const SURVEYS = [
  // Shadow doc for vote.html's hardcoded seed_s5_trajectory — content
  // mirrors that file exactly, including the dual_asset_base option.
  {
    id: 'seed_s5_trajectory',
    title: '針對台法兩地的職涯發展，您的最終長期規劃是什麼？',
    titleFr: 'Quelle est votre trajectoire professionnelle ultime concernant la France et Taïwan ?',
    type: 'single',
    privacy: 'count_only',
    status: 'open',
    isLegacy: false,
    source: 'Manual',
    createdAt: CREATED_AT,
    closedAt: null,
    options: [
      opt('settle_france', '長期定居法國（入籍或取得永久居留） · S\'installer durablement en France (Naturalisation / Résidence permanente)'),
      opt('bridge_role', '成為台歐之間的科技與商業橋樑 · Agir comme pont technologique/commercial entre Taïwan et l\'Europe'),
      opt('stepping_stone', '以法國為跳板，放眼更廣泛的歐洲市場 · Utiliser la France comme tremplin pour la mobilité européenne'),
      opt('return_taiwan', '累積法國經驗後最終返回台灣 · Retourner éventuellement à Taïwan avec une expérience française'),
      opt('dual_asset_base', '建立台法雙邊資產配置，在兩國之間自由往返以享受工作與生活平衡 · Constituer un patrimoine entre la France et Taïwan pour faire des allers-retours et profiter de l\'équilibre vie pro-vie perso')
    ],
    legacyCounts: {}
  },
  // Shadow doc for vote.html's hardcoded seed_s6_bottleneck.
  {
    id: 'seed_s6_bottleneck',
    title: '您在法國科技業工作遇到的最大瓶頸或挑戰是什麼？',
    titleFr: 'Quel est votre plus grand obstacle ou défi dans le secteur tech en France ?',
    type: 'single',
    privacy: 'count_only',
    status: 'open',
    isLegacy: false,
    source: 'Manual',
    createdAt: CREATED_AT,
    closedAt: null,
    options: [
      opt('language_barrier', '語言障礙（法語企業文化/開會） · Barrière de la langue (culture d\'entreprise / réunions en français)'),
      opt('labor_law', '熟悉法國勞動法（CDI權益、勞資協議） · Maîtrise du droit du travail français (droits CDI, conventions collectives)'),
      opt('salary_col', '薪資競爭力與生活成本的落差 · Compétitivité salariale vs coût de la vie'),
      opt('visa_stability', '簽證與居留穩定度（人才護照延期等） · Stabilité des visas et titres de séjour (renouvellement Passeport Talent, etc.)'),
      opt('networking_cooptation', '本地人脈與融入內推（Cooptation）文化 · Réseau local et intégration dans la culture de cooptation'),
      opt('tech_interview_process', '法國規模化新創（Scale-ups）與大企業（CAC 40）獨特的面試流程 · Processus d\'entretien technique spécifiques aux scale-ups et entreprises du CAC 40')
    ],
    legacyCounts: {}
  },
  // Native Firebase survey — no vote.html hardcoded counterpart.
  {
    id: 's7_resources',
    title: '現階段，哪類型的深度專業資源或導師計畫對您的幫助最大？',
    titleFr: 'Quel type de ressource spécialisée ou de mentorat vous apporterait le plus de valeur actuellement ?',
    description: "Theme 4: Ecosystem Value-Add — Directly linking the community's energy to specific, high-impact outputs. What kind of specialized deep-dive resource or mentorship would provide the highest value to you right now?",
    type: 'single',
    privacy: 'count_only',
    status: 'open',
    isLegacy: false,
    source: 'Manual',
    createdAt: CREATED_AT,
    closedAt: null,
    options: [
      opt('rs_cv_coaching', '法國科技業履歷優化與一對一職涯諮詢 · Coaching de carrière / relecture de CV pour la tech française.'),
      opt('rs_tax_workshop', '與具備實戰經驗的前輩或專家合作（非正式法律/會計顧問），舉辦稅務與法規交流工作坊 · Ateliers d\'échange sur la fiscalité et la réglementation animés par des pairs expérimentés (hors conseils juridiques/comptables formels).'),
      opt('rs_referral', '法國本地新創與企業的內部內推網絡 (Referral) · Réseau de cooptation interne dans les startups et entreprises françaises'),
      opt('rs_experience_share', '群組內部成員分享法國實戰工作經驗，交流跨國或在地特殊職涯的實用切入方法 · Partage d\'expériences professionnelles en France entre membres de la communauté, et échange de méthodes de pointe pour des carrières spécialisées (en France ou depuis Taïwan)')
    ],
    legacyCounts: {}
  }
];

async function main() {
  requireEnv();
  const authQuery = `auth=${encodeURIComponent(FIREBASE_DB_SECRET)}`;
  const body = Object.fromEntries(SURVEYS.map(survey => [survey.id, survey]));

  const response = await fetch(`${FIREBASE_DB_URL}/surveys.json?${authQuery}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    console.error(`Firebase write failed: ${response.status} ${await response.text()}`);
    process.exit(1);
  }

  console.log(`Seeded ${SURVEYS.length} surveys: ${SURVEYS.map(s => s.id).join(', ')}`);
}

main();
