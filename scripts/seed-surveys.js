#!/usr/bin/env node
/**
 * Writes /surveys/{id} documents to Firebase for 4 community surveys.
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
 * mtcmbpeuejh2s ("[Mentorship] ...師徒配對計畫...") is an existing
 * Firebase-native survey originally created via admin.html's survey
 * builder — admin.html has no "edit options on an existing survey" UI
 * (only create / toggle open-closed / delete), so adding a 9th option to
 * it goes through this script instead. Its entry below is a full mirror
 * of the live Firebase document (fetched 2026-09-10) plus one appended
 * option — every pre-existing field/option must stay exactly as-is here,
 * since the PATCH below fully overwrites the doc at that id.
 *
 * Safe to re-run: full overwrite of just these 4 survey docs by fixed id,
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
  },
  // Existing Firebase-native survey (created via admin.html) — full mirror
  // of the live document plus one appended option (mentor_experience_share).
  {
    id: 'mtcmbpeuejh2s',
    title: '導師制度】你對協會內部的「師徒配對計畫」感興趣嗎？（可複選）',
    titleFr: '[Mentorship] Êtes-vous intéressé(e) par un programme de mentorat interne au sein de Taiwan Tech France ? (Choix multiple)',
    description: '隨著協會成員增加，我們希望建立一個讓資深與新進科技人才互相連結、傳承經驗的機制。無論你想當導師分享經驗，或想找導師加速成長，都歡迎投票！\nAlors que notre communauté grandit, nous souhaitons créer un cadre pour connecter les talents seniors et juniors autour du partage d\'expérience. Que vous souhaitiez encadrer ou être encadré(e), votez pour nous aider à cadrer le programme !',
    type: 'multi',
    privacy: 'show_voters',
    status: 'open',
    isLegacy: false,
    source: 'Manual',
    createdAt: '2026-08-28T07:16:29.670Z',
    closedAt: null,
    options: [
      opt('mtcmbpeu1rema', '我想當導師（分享經驗、職涯建議）Je veux être mentor (partager mon expérience, conseils carrière)'),
      opt('mtcmbpeudcdb1', '我想找導師（尋求指導、加速成長） Je veux être mentoré(e) (chercher un accompagnement)'),
      opt('mtcmbpeucebpi', '兩者皆可，依情況而定 Les deux, selon le contexte'),
      opt('mtcmbpeud5y4h', '有興趣了解更多，但尚未決定角色 Intéressé(e) pour en savoir plus, mais pas encore décidé(e) sur mon rôle'),
      opt('mtcmbpeuj0q6s', '希望是正式配對制度（申請 + 篩選） Je préfère un programme formel (candidature + sélection)'),
      opt('mtcmbpeup1z5s', '希望是非正式、輕鬆媒合（社群自由配對） Je préfère un système informel (mise en relation libre dans la communauté)'),
      opt('mtcmbpeupit8p', '目前沒有興趣參與 Pas intéressé(e) pour l\'instant'),
      opt('mtcmbpeut1axw', '我有其他想法！想直接跟團隊討論 J\'ai d\'autres idées ! Je préfère en discuter directement avec l\'équipe'),
      opt('mentor_experience_share', '群組內部成員分享法國實戰工作經驗，交流跨國或在地特殊職涯的實用切入方法 Partage d\'expériences professionnelles en France entre membres de la communauté, et échange de méthodes de pointe pour des carrières spécialisées (en France ou depuis Taïwan)')
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
