/* ── member-profile.js — signed-in Asso member self-service ──── */
(function () {
  'use strict';

  const VALID_DAYS = 365;
  const CITIES = ['Paris', 'Lyon', 'Toulouse', 'Bordeaux', 'Grenoble',
                  'Sophia Antipolis', 'Montpellier', 'Taiwan', 'Autres'];
  const GOALS = [
    { id: 'networking', zh: '擴展人脈與社群連結', fr: 'Networking' },
    { id: 'jobs',       zh: '獲取或分享科技業職缺機會', fr: 'Job Opps' },
    { id: 'knowledge',  zh: '技術交流與職涯經驗分享', fr: 'Knowledge' },
    { id: 'longterm',   zh: '探討在法長期發展（房產、退休、投資）', fr: 'Long terme' },
    { id: 'local',      zh: '參與不同城市的在地線下小聚', fr: 'Local Chapters' },
    { id: 'info',       zh: '獲取法國生活實用資訊（行政、簽證、日常）', fr: 'Vie pratique' },
    { id: 'collab',     zh: '推動台法機構、學校或企業間的官方合作', fr: 'Collaboration' },
    { id: 'fiscal',     zh: '了解法國稅務與資產規劃', fr: 'Fiscalité' }
  ];
  const COMPLETENESS_FIELDS = [
    { label: '暱稱 / Surnom', complete: profile => hasText(profile.nickname) },
    { label: '性別 / Genre', complete: profile => hasText(profile.gender) },
    { label: '電話 / Téléphone', complete: profile => hasText(profile.phone) },
    { label: '城市／地區 / Ville', complete: profile => hasText(profile.city) },
    { label: '職業／專業領域 / Profession', complete: profile => hasText(profile.job) },
    { label: 'LinkedIn', complete: profile => hasText(profile.linkedin) },
    { label: '個人簡介 / Présentation', complete: profile => hasText(profile.intro) },
    { label: '與協會的關係／參與目的 / Objectifs', complete: profile => Array.isArray(profile.goals) && profile.goals.length > 0 },
    { label: '接受章程 / Règlement', complete: profile => profile.acceptsRules === true },
    { label: '會員通知偏好 / Préférence de communication', complete: profile => hasNotificationPreference(profile) }
  ];

  function hasNotificationPreference(profile) {
    return hasText(profile?.notificationPreferenceAt) ||
      (profile?.notificationConsent === true && hasText(profile?.notificationConsentAt));
  }

  let currentUser = null;
  let assoMembers = [];
  let ownAssoV2 = null;
  let adminProfiles = [];
  let currentMember = null;
  let currentProfileSource = null;
  let ownAdminProfileRef = null;
  let ownAdminProfileHandler = null;
  let ownMemberProfile = null;
  let ownMemberProfileRef = null;
  let ownMemberProfileHandler = null;
  let returnFocusTo = null;
  let backdropPressStarted = false;
  let currentAdminAccess = false;
  let adminCheckVersion = 0;
  let membershipResolved = true;

  const byId = id => document.getElementById(id);
  const norm = value => (value || '').trim().toLowerCase();
  const hasText = value => String(value || '').trim().length > 0;
  const isAdminAccount = () => {
    return !!currentUser && currentAdminAccess === true;
  };

  function missingFields(profile) {
    return COMPLETENESS_FIELDS.filter(field => !field.complete(profile || {}));
  }

  function renderModalCompleteness(profile) {
    const box = byId('member-profile-completeness');
    const title = byId('member-profile-completeness-title');
    const missingElement = byId('member-profile-missing-fields');
    if (!box || !title || !missingElement) return;

    const missing = missingFields(profile);
    const complete = missing.length === 0;
    const adminProfile = currentProfileSource === 'admin';
    box.style.background = complete ? '#f0fdf4' : '#fffbeb';
    box.style.borderColor = complete ? '#86efac' : '#fcd34d';
    title.style.color = complete ? '#166534' : '#92400e';
    title.textContent = adminProfile
      ? (complete
          ? "✓ Profil d'équipe complet · 管理團隊資料完整"
          : `⚠ Profil d'équipe incomplet · 管理團隊資料尚缺 ${missing.length} 項`)
      : (complete
          ? '✓ Profil complet · 會員資料完整'
          : `⚠ Profil incomplet · 會員資料尚缺 ${missing.length} 項`);
    missingElement.style.color = complete ? '#15803d' : '#b45309';
    missingElement.textContent = complete
      ? (adminProfile
          ? "Profil d'équipe complété. · 管理團隊資料已完成。"
          : 'Conditions de données remplies pour le vote à l’AG. · 已完成年度大會投票所需資料。')
      : `尚缺 · Manquant : ${missing.map(field => field.label).join('、')}`;
  }

  function isActiveMember(member) {
    if (!currentUser || !norm(currentUser.email)) return false;
    if (!member || norm(member.email) !== norm(currentUser.email)) return false;
    if (!member.joinedAt) return true;
    const ageDays = (Date.now() - new Date(member.joinedAt).getTime()) / 86400000;
    return ageDays >= 0 && ageDays <= VALID_DAYS;
  }

  function refreshCurrentMember() {
    const signedInEmail = norm(currentUser && currentUser.email);
    const legacyAssoRecord = signedInEmail
      ? assoMembers.find(member => norm(member.email) === signedInEmail)
      : null;
    const ownAssoRecord = ownAssoV2 || legacyAssoRecord;
    const ownAdminRecord = signedInEmail
      ? adminProfiles.find(profile => norm(profile.email) === signedInEmail)
      : null;
    const isAdmin = isAdminAccount();
    const activeAssoRecord = ownAssoRecord && isActiveMember(ownAssoRecord)
      ? ownAssoRecord
      : null;

    if (isAdmin) {
      currentMember = {
        ...(ownAssoRecord || {}),
        ...(ownAdminRecord || {}),
        id: currentUser.uid || ownAdminRecord?.id || '',
        uid: currentUser.uid || ownAdminRecord?.uid || '',
        email: currentUser.email || '',
        name: ownAdminRecord?.name || ownAssoRecord?.name || currentUser.displayName ||
          (currentUser.email || '').split('@')[0],
        source: 'admin'
      };
      currentProfileSource = 'admin';
    } else if (activeAssoRecord) {
      currentMember = {
        ...activeAssoRecord,
        ...(ownMemberProfile || {}),
        id: activeAssoRecord.id,
        email: activeAssoRecord.email,
        name: activeAssoRecord.name,
        _storageSource: ownAssoV2 ? 'v2' : 'legacy'
      };
      currentProfileSource = 'asso';
    } else {
      currentMember = null;
      currentProfileSource = null;
    }
    const button = byId('member-profile-open');
    const canUseProfile = currentProfileSource === 'admin' ||
      (currentProfileSource === 'asso' && currentMember?._storageSource === 'v2');
    if (button) button.style.display = canUseProfile ? 'inline-flex' : 'none';
    if (!canUseProfile) closeModal();

    const missing = activeAssoRecord && currentMember ? missingFields(currentMember) : [];
    document.dispatchEvent(new CustomEvent('ttf:member-profile-state', {
      detail: {
        resolved: !currentUser || membershipResolved,
        signedIn: !!currentUser,
        isAdmin,
        isAssoMember: !!activeAssoRecord,
        isComplete: !!activeAssoRecord && missing.length === 0,
        missingCount: missing.length,
        canEdit: canUseProfile
      }
    }));
  }

  function setValue(id, value) {
    const input = byId(id);
    if (input) input.value = value || '';
  }

  function setChecked(id, checked) {
    const input = byId(id);
    if (input) input.checked = !!checked;
  }

  function setStatus(message, isError) {
    const status = byId('member-profile-status');
    if (!status) return;
    status.textContent = message || '';
    status.style.color = isError ? '#be123c' : '#047857';
  }

  function buildOptions() {
    const city = byId('mp-city');
    if (city && !city.dataset.built) {
      city.innerHTML = '<option value="">Non renseigné · 未填寫</option>' +
        CITIES.map(value => `<option value="${value}">${value}</option>`).join('');
      city.dataset.built = '1';
    }

    const goals = byId('mp-goals-list');
    if (goals && !goals.dataset.built) {
      goals.innerHTML = GOALS.map(goal => `
        <label class="sm-asso-goal-check">
          <input type="checkbox" name="mp-goal" value="${goal.id}">
          <span>${goal.zh} <em>(${goal.fr})</em></span>
        </label>`).join('');
      goals.dataset.built = '1';
    }
  }

  function openModal() {
    refreshCurrentMember();
    if (!currentMember) return;

    buildOptions();
    const profile = currentMember || {};
    const modalTitle = byId('member-profile-title');
    if (modalTitle) {
      modalTitle.textContent = currentProfileSource === 'admin'
        ? "Mon profil d'équipe · 我的管理團隊資料"
        : 'Mon profil membre · 我的會員資料';
    }
    setValue('mp-nickname', profile.nickname);
    setValue('mp-gender', profile.gender);
    setValue('mp-phone', profile.phone);
    setValue('mp-city', profile.city);
    setValue('mp-job', profile.job);
    setValue('mp-linkedin', profile.linkedin);
    setValue('mp-intro', profile.intro);
    setChecked('mp-accepts-rules', profile.acceptsRules);
    document.querySelectorAll('input[name="mp-notification-consent"]').forEach(input => {
      input.checked = hasNotificationPreference(profile) &&
        input.value === (profile.notificationConsent === true ? 'yes' : 'no');
    });
    document.querySelectorAll('input[name="mp-goal"]').forEach(input => {
      input.checked = (profile.goals || []).includes(input.value);
    });
    renderModalCompleteness(profile);
    const saveButton = byId('member-profile-save');
    if (saveButton) {
      saveButton.disabled = !currentMember;
      saveButton.style.opacity = saveButton.disabled ? '0.5' : '1';
      saveButton.style.cursor = saveButton.disabled ? 'not-allowed' : 'pointer';
    }
    const adminNotice = byId('member-profile-admin-preview');
    if (adminNotice) adminNotice.style.display = currentProfileSource === 'admin' ? 'block' : 'none';
    const completenessHelp = byId('member-profile-completeness-help');
    if (completenessHelp) {
      completenessHelp.textContent = currentProfileSource === 'admin'
        ? "Ce profil d'équipe est séparé des adhésions officielles. · 此管理團隊資料與正式會員資格分開計算。"
        : "Complétez tous les champs pour exercer votre droit de vote à l'AG. · 完成所有會員資料後，方可行使年度大會投票權。";
    }
    setStatus('', false);

    returnFocusTo = document.activeElement;
    byId('member-profile-modal')?.classList.remove('hidden');
    byId('mp-nickname')?.focus();
  }

  function closeModal() {
    const modal = byId('member-profile-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    modal.classList.add('hidden');
    if (returnFocusTo && typeof returnFocusTo.focus === 'function') returnFocusTo.focus();
    returnFocusTo = null;
  }

  function formProfile() {
    const acceptsRules = !!byId('mp-accepts-rules')?.checked;
    const notificationChoice = document.querySelector('input[name="mp-notification-consent"]:checked')?.value || '';
    const notificationConsent = notificationChoice === 'yes';
    return {
      nickname: byId('mp-nickname')?.value.trim() || '',
      gender: byId('mp-gender')?.value || '',
      phone: byId('mp-phone')?.value.trim() || '',
      city: byId('mp-city')?.value || '',
      job: byId('mp-job')?.value.trim() || '',
      linkedin: byId('mp-linkedin')?.value.trim() || '',
      intro: byId('mp-intro')?.value.trim() || '',
      goals: [...document.querySelectorAll('input[name="mp-goal"]:checked')].map(input => input.value),
      acceptsRules,
      notificationConsent,
      notificationPreferenceAt: notificationChoice
        ? (currentMember?.notificationPreferenceAt || 'pending')
        : ''
    };
  }

  function editableFields(existing) {
    const profile = formProfile();
    const now = new Date().toISOString();
    const preferenceUnchanged = hasNotificationPreference(existing) &&
      existing.notificationConsent === profile.notificationConsent;
    return {
      ...profile,
      acceptsRulesAt: profile.acceptsRules ? (existing.acceptsRulesAt || now) : '',
      notificationConsentAt: profile.notificationConsent
        ? (existing.notificationConsentAt || now)
        : '',
      notificationPreferenceAt: preferenceUnchanged
        ? (existing.notificationPreferenceAt || existing.notificationConsentAt || now)
        : now
    };
  }

  async function saveProfile(event) {
    event.preventDefault();
    const form = byId('member-profile-form');
    if (!form || !form.checkValidity()) {
      form?.reportValidity();
      return;
    }

    const user = firebase.auth().currentUser;
    if (!user || !currentMember || norm(user.email) !== norm(currentMember.email)) {
      setStatus('Session invalide. Reconnectez-vous. · 登入狀態無效，請重新登入。', true);
      return;
    }

    const saveButton = byId('member-profile-save');
    const originalHtml = saveButton.innerHTML;
    saveButton.disabled = true;
    saveButton.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Enregistrement… · 儲存中…';
    setStatus('', false);

    try {
      const email = norm(user.email);
      const isAdmin = isAdminAccount();
      const fieldsToSave = editableFields(currentMember);
      const now = new Date().toISOString();

      if (currentProfileSource === 'admin') {
        if (!isAdmin || !user.uid) throw new Error('admin_profile_forbidden');
        const profileRef = firebase.database().ref(`adminProfiles/${user.uid}`);
        const result = await profileRef.transaction(existing => ({
          ...(existing || {}),
          id: user.uid,
          uid: user.uid,
          email: user.email,
          name: existing?.name || currentMember.name || user.displayName || email.split('@')[0],
          source: 'admin',
          createdAt: existing?.createdAt || now,
          ...fieldsToSave,
          profileUpdatedAt: now
        }));
        if (!result.committed) throw new Error('admin_profile_write_aborted');
        currentMember = { ...result.snapshot.val(), id: user.uid, uid: user.uid };
      } else {
        if (!user.uid || !currentMember.id || currentMember._storageSource !== 'v2') {
          throw new Error('member_profile_v2_required');
        }
        const profileRef = firebase.database().ref(`memberProfiles/${currentMember.id}`);
        const result = await profileRef.transaction(existing => ({
          ...(existing || {}),
          uid: user.uid,
          memberId: currentMember.id,
          email,
          source: 'member',
          createdAt: existing?.createdAt || now,
          ...fieldsToSave,
          profileUpdatedAt: now
        }));
        if (!result.committed) throw new Error('member_profile_write_aborted');
        ownMemberProfile = result.snapshot.val();
        currentMember = {
          ...ownAssoV2,
          ...ownMemberProfile,
          id: ownAssoV2.id,
          email: ownAssoV2.email,
          name: ownAssoV2.name,
          _storageSource: 'v2'
        };
      }

      renderModalCompleteness(currentMember);
      setStatus('Profil enregistré avec succès. · 會員資料已成功儲存。', false);
      closeModal();
    } catch (error) {
      console.warn('[member-profile] save failed', error);
      setStatus('Impossible d’enregistrer. Réessayez plus tard. · 無法儲存，請稍後再試。', true);
    } finally {
      saveButton.disabled = !currentMember;
      saveButton.style.opacity = saveButton.disabled ? '0.5' : '1';
      saveButton.style.cursor = saveButton.disabled ? 'not-allowed' : 'pointer';
      saveButton.innerHTML = originalHtml;
    }
  }

  function watchOwnAdminProfile(user) {
    if (ownAdminProfileRef && ownAdminProfileHandler) {
      ownAdminProfileRef.off('value', ownAdminProfileHandler);
    }
    ownAdminProfileRef = null;
    ownAdminProfileHandler = null;
    adminProfiles = [];

    if (!user || !user.uid || !isAdminAccount()) {
      refreshCurrentMember();
      return;
    }

    ownAdminProfileRef = firebase.database().ref(`adminProfiles/${user.uid}`);
    ownAdminProfileHandler = snapshot => {
      const profile = snapshot.val();
      adminProfiles = profile ? [{ ...profile, id: user.uid, uid: user.uid }] : [];
      refreshCurrentMember();
    };
    ownAdminProfileRef.on('value', ownAdminProfileHandler, error => {
      console.warn('[member-profile] admin profile read failed', error);
      adminProfiles = [];
      refreshCurrentMember();
    });
  }

  function watchOwnMemberProfile(user) {
    if (ownMemberProfileRef && ownMemberProfileHandler) {
      ownMemberProfileRef.off('value', ownMemberProfileHandler);
    }
    ownMemberProfileRef = null;
    ownMemberProfileHandler = null;
    ownMemberProfile = null;

    if (!user || !user.uid || !ownAssoV2) {
      refreshCurrentMember();
      return;
    }

    ownMemberProfileRef = firebase.database().ref(`memberProfiles/${ownAssoV2.id}`);
    ownMemberProfileHandler = snapshot => {
      ownMemberProfile = snapshot.val() || null;
      refreshCurrentMember();
    };
    ownMemberProfileRef.on('value', ownMemberProfileHandler, error => {
      console.warn('[member-profile] member profile read failed', error);
      ownMemberProfile = null;
      refreshCurrentMember();
    });
  }

  function init() {
    buildOptions();
    byId('member-profile-open')?.addEventListener('click', openModal);
    byId('member-profile-close')?.addEventListener('click', closeModal);
    byId('member-profile-cancel')?.addEventListener('click', closeModal);
    byId('member-profile-form')?.addEventListener('submit', saveProfile);
    byId('member-profile-form')?.addEventListener('input', () => renderModalCompleteness(formProfile()));
    byId('member-profile-form')?.addEventListener('change', () => renderModalCompleteness(formProfile()));
    const modal = byId('member-profile-modal');
    modal?.addEventListener('pointerdown', event => {
      backdropPressStarted = event.target === event.currentTarget;
    });
    modal?.addEventListener('pointerup', event => {
      const shouldClose = backdropPressStarted && event.target === event.currentTarget;
      backdropPressStarted = false;
      if (shouldClose) closeModal();
    });
    modal?.addEventListener('pointercancel', () => {
      backdropPressStarted = false;
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeModal();
    });

    firebase.auth().onAuthStateChanged(async user => {
      const checkVersion = ++adminCheckVersion;
      currentUser = user;
      currentAdminAccess = false;
      ownAssoV2 = null;
      membershipResolved = !user;
      watchOwnMemberProfile(null);
      watchOwnAdminProfile(user);
      refreshCurrentMember();

      if (user) {
        const adminPromise = typeof ttfResolveAdminAccess === 'function'
          ? ttfResolveAdminAccess(user)
          : Promise.resolve(false);
        const membershipPromise = typeof ttfResolveAssoMembership === 'function'
          ? ttfResolveAssoMembership(user)
          : Promise.resolve(null);
        const [adminAccess, membership] = await Promise.all([adminPromise, membershipPromise]);
        if (checkVersion !== adminCheckVersion) return;
        currentAdminAccess = adminAccess === true;
        ownAssoV2 = membership?.active ? membership.member : null;
        membershipResolved = true;
        watchOwnMemberProfile(user);
        watchOwnAdminProfile(user);
        refreshCurrentMember();
      }
    });
    if (typeof subscribeFirebaseData === 'function') {
      subscribeFirebaseData(data => {
        assoMembers = Array.isArray(data.assoMembers) ? data.assoMembers : [];
        refreshCurrentMember();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
