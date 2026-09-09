#!/usr/bin/env node
/**
 * One-off seed for 3 new community surveys (bottleneck, professional
 * trajectory, ecosystem value-add). Writes directly to /surveys/{id} in
 * Firebase, matching the exact schema admin.html's "Créer un nouveau
 * sondage" form writes (see handleCreateSurvey in assets/js/stastic_member.js)
 * — these appear and behave exactly like an admin-created survey, not a
 * hardcoded seed_* entry.
 *
 * Safe to re-run: it's a full overwrite of just these 3 survey docs by
 * fixed id, not an append. Votes live under the separate /surveyVotes
 * path, so re-running this never touches or resets vote counts.
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
  {
    id: 's5_bottleneck',
    title: '您在法國科技業工作遇到的最大瓶頸或挑戰是什麼？',
    titleFr: 'Quel est votre plus grand obstacle ou défi en travaillant dans le secteur tech en France ?',
    description: "What is your biggest bottleneck or challenge working in France's tech sector?",
    type: 'single',
    privacy: 'count_only',
    status: 'open',
    isLegacy: false,
    source: 'Manual',
    createdAt: CREATED_AT,
    closedAt: null,
    options: [
      opt('bn_language', '法語職場與開會的語言障礙，或融入本土企業文化 · Barrière de la langue dans le milieu professionnel et les réunions, ou intégration dans la culture d\'entreprise locale'),
      opt('bn_labor_law', '熟悉法國勞動法與勞資協議（CDI 權益、離職協商、法規保障） · Maîtrise du droit du travail et des conventions collectives (droits du CDI, ruptures conventionnelles, protections légales)'),
      opt('bn_salary_cost', '薪資競爭力與高通膨、高生活成本之間的落差 · Décalage entre la compétitivité salariale et le coût de la vie / l\'inflation'),
      opt('bn_visa', '簽證與居留證的穩定度與延期壓力（人才護照、轉換身份等） · Stabilité et pression liée au renouvellement des visas et titres de séjour (Passeport talent, changement de statut, etc.)'),
      opt('bn_network', '本地人脈網絡建立，以及打破法國職場特有的「內推（Cooptation）」文化 · Construction d\'un réseau professionnel local et percée de la culture de cooptation spécifique au marché français'),
      opt('bn_interview', '法國規模化新創（Scale-ups）與大企業（CAC 40）獨特且嚴格的面試流程 · Processus de recrutement exigeant et spécifique aux scale-ups et entreprises du CAC 40 en France')
    ],
    legacyCounts: {}
  },
  {
    id: 's6_trajectory',
    title: '針對台法兩地的職涯發展，您的最終長期規劃是什麼？',
    titleFr: 'Quelle est votre trajectoire professionnelle finale concernant la France et Taïwan ?',
    description: "Theme 3: Integration & Professional Trajectory — Exploring how members see their long-term professional identity bridging Taiwan and France. What is your ultimate professional trajectory regarding France and Taiwan?",
    type: 'single',
    privacy: 'count_only',
    status: 'open',
    isLegacy: false,
    source: 'Manual',
    createdAt: CREATED_AT,
    closedAt: null,
    options: [
      opt('tr_settle_fr', '長期定居法國（入籍或取得永久居留） · S\'installer durablement en France (Naturalisation / Résidence permanente)'),
      opt('tr_bridge', '成為台歐之間的科技與商業橋樑 · Agir comme pont technologique/commercial entre Taïwan et l\'Europe'),
      opt('tr_springboard', '以法國為跳板，放眼更廣泛的歐洲市場 · Utiliser la France comme tremplin pour la mobilité européenne'),
      opt('tr_return_tw', '累積法國經驗後最終返回台灣 · Retourner éventuellement à Taïwan avec une expérience française'),
      opt('tr_bilateral', '建立台法雙邊資產配置，在兩國之間自由往返以享受工作與生活平衡 · Constituer un patrimoine entre la France et Taïwan pour faire des allers-retours et profiter de l\'équilibre vie pro-vie perso.')
    ],
    legacyCounts: {}
  },
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
