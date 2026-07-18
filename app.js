// ================================================================
// MISION MAKAMBU - SUPABASE FRONTEND
// Fase 1 movil: vista Hoy + navegacion tactil
// ================================================================

const SUPABASE_URL = 'https://nhqchhiwglulgraowvho.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ocWNoaGl3Z2x1bGdyYW93dmhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMzYzMjAsImV4cCI6MjA5MjgxMjMyMH0.m1-knqCFAOutGlKP4oCVtGb_GVheJurf_rfvUYDppgo';
const FAMILY_ID = '11111111-1111-1111-1111-111111111111';
const APP_VERSION = '2026.07.18-pwa.1';
const INSTALL_DISMISSED_KEY = 'makambu_install_dismissed_v1';
const INSTALL_GUIDE_DISMISSED_KEY = 'makambu_install_guide_dismissed_v1';
const NOTIFICATION_HISTORY_LIMIT = 50;
const PENDING_NOTIFICATION_MINUTES = 120;

const PLAYER_TABS = ['hoy', 'misiones', 'tienda', 'historial', 'perfil'];
const ADMIN_TABS = ['hoy', 'familia', 'tareas', 'solicitudes', 'perfil'];
const STORE_TABS = ['tiempo', 'premios', 'store-hist'];

const supabaseClient = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// ================================================================
// AUDIO ENGINE
// ================================================================
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new AudioCtx();
  return audioCtx;
}

function playSound(type) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;

    if (type === 'error') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(150, now + 0.15);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start();
      osc.stop(now + 0.3);
      return;
    }

    if (type === 'buy') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(523, now);
      osc.frequency.setValueAtTime(659, now + 0.1);
      osc.frequency.setValueAtTime(784, now + 0.2);
      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start();
      osc.stop(now + 0.4);
      return;
    }

    osc.type = type === 'submit' ? 'triangle' : 'square';
    osc.frequency.setValueAtTime(988, now);
    osc.frequency.setValueAtTime(1319, now + 0.1);
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.start();
    osc.stop(now + 0.3);
  } catch (_) {}
}

// ================================================================
// STATE
// ================================================================
let session = null;
let currentUser = null;
let currentProfile = null;
let currentFamilyRole = null;
let familyMembers = [];
let tasks = [];
let rewards = [];
let taskSubmissions = [];
let rewardRequests = [];
let coinLedger = [];
let playerSettings = [];
let adjustmentCatalog = [];
let notifications = [];
let notificationsLoading = false;
let notificationsError = '';
let currentUserTab = 'hoy';
let currentAdminTab = 'hoy';
let currentStoreTab = 'tiempo';
let autoRefreshInterval = null;
let deferredInstallPrompt = null;
let swRegistration = null;
let isApplyingUpdate = false;
let updateBannerDismissed = false;

const $ = id => document.getElementById(id);

function isBackendReady() {
  return Boolean(supabaseClient);
}

function isOnline() {
  return navigator.onLine !== false;
}

function isStandaloneMode() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// ================================================================
// DATE AND FORMAT
// ================================================================
function todayBogotaISO() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const obj = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${obj.year}-${obj.month}-${obj.day}`;
}

function dateBogotaISO(value) {
  const d = value ? new Date(value) : new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d);
  const obj = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${obj.year}-${obj.month}-${obj.day}`;
}

function fmtDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtLongDate(value = new Date()) {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Bogota'
  }).format(new Date(value));
}

function greetingNow() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos dias';
  if (hour < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

// ================================================================
// ROLE, ROUTES AND NAV
// ================================================================
function isGuardianOrPlatform() {
  return currentProfile?.global_role === 'platform_admin' || currentFamilyRole === 'guardian';
}

function isPlayer() {
  return currentFamilyRole === 'player';
}

function normalizeRoute() {
  return (window.location.hash || '').replace(/^#\/?/, '').trim().toLowerCase();
}

function playerTabFromRoute(route) {
  return PLAYER_TABS.includes(route) ? route : 'hoy';
}

function adminTabFromRoute(route) {
  return ADMIN_TABS.includes(route) ? route : 'hoy';
}

function syncHashForRole(tab) {
  const target = `#/${tab}`;
  if (window.location.hash !== target) {
    window.history.replaceState(null, '', target);
  }
}

function goToHomeRoute() {
  syncHashForRole('hoy');
}

function applyRouteForCurrentRole() {
  if (!session?.user) return;
  const route = normalizeRoute();
  if (isGuardianOrPlatform()) {
    const tab = adminTabFromRoute(route);
    showAdminTab(tab, false);
    syncHashForRole(tab);
    return;
  }
  const tab = playerTabFromRoute(route);
  showTab(tab, false);
  syncHashForRole(tab);
}

window.addEventListener('hashchange', () => {
  applyRouteForCurrentRole();
});

function setBannerState(id, visible) {
  const element = $(id);
  if (!element) return;
  element.hidden = !visible;
}

function setConnectivityBanner() {
  setBannerState('connectivityBanner', !isOnline());
}

function setInstallBannerVisibility() {
  const dismissed = localStorage.getItem(INSTALL_DISMISSED_KEY) === '1';
  const shouldShow = !dismissed && !isStandaloneMode() && Boolean(deferredInstallPrompt);
  setBannerState('installBanner', shouldShow);
}

function setInstallGuideVisibility(force = false) {
  const dismissed = localStorage.getItem(INSTALL_GUIDE_DISMISSED_KEY) === '1';
  const shouldShow = !dismissed && !isStandaloneMode() && !deferredInstallPrompt && force;
  setBannerState('installGuideBanner', shouldShow);
}

function setUpdateBannerVisibility(visible) {
  setBannerState('updateBanner', visible && !updateBannerDismissed);
}

function setConnectivityState(ok) {
  setCloudStatus(ok);
  setConnectivityBanner();
}

function requireLiveConnection(reason = 'Makambu necesita internet para actualizar misiones, monedas y solicitudes.') {
  if (!isOnline() || !isBackendReady()) {
    setConnectivityState(false);
    showToast(reason);
    return false;
  }
  return true;
}

function clearSessionVisuals() {
  closeWarpZone();
  ['todayPlayerView', 'missionsList', 'quickHistory', 'historialList', 'playerProfileView', 'adminTodayView', 'adminFamilyView', 'pendingApprovals', 'adminMissionsList', 'adminRequestsList', 'adminProfileView', 'adminHistorialList'].forEach(id => {
    if ($(id)) $(id).innerHTML = '';
  });
}

function markUpdateReady(registration) {
  swRegistration = registration;
  updateBannerDismissed = false;
  setUpdateBannerVisibility(true);
}

// ================================================================
// DATA HELPERS
// ================================================================
function currentBalance(playerId = currentUser?.id) {
  return coinLedger
    .filter(entry => entry.player_id === playerId)
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
}

function getProfileName(id) {
  if (id === currentProfile?.id) return currentProfile.display_name;
  const member = familyMembers.find(item => item.user_id === id);
  return member?.profile?.display_name || (id ? `Usuario ${String(id).slice(0, 4)}` : 'Usuario');
}

function getProfileAvatar(id) {
  if (id === currentProfile?.id) return currentProfile.avatar || '👤';
  const member = familyMembers.find(item => item.user_id === id);
  return member?.profile?.avatar || '👤';
}

function getPlayerIdsForAdmin() {
  const ids = familyMembers
    .filter(member => member.family_role === 'player')
    .map(member => member.user_id);

  if (!ids.includes(currentUser?.id) && currentFamilyRole === 'player') ids.push(currentUser.id);
  return ids;
}

function myTasks() {
  return tasks.filter(task => task.assigned_to === currentUser?.id);
}

function approvedTodayCount(playerId = currentUser?.id) {
  const today = todayBogotaISO();
  return taskSubmissions.filter(submission =>
    submission.player_id === playerId &&
    submission.status === 'approved' &&
    submission.counts_for_daily_goal &&
    dateBogotaISO(submission.reviewed_at || submission.submitted_at) === today
  ).length;
}

function dailyGoal(playerId = currentUser?.id) {
  return playerSettings.find(setting => setting.player_id === playerId)?.daily_goal || 5;
}

function shouldNotifyDailyGoal(playerId = currentUser?.id) {
  return playerSettings.find(setting => setting.player_id === playerId)?.notify_daily_goal === true;
}

function guardianIdsForFamily() {
  return Array.from(new Set(
    familyMembers
      .filter(member => member.family_role === 'guardian')
      .map(member => member.user_id)
      .filter(Boolean)
  ));
}

function pointsEarnedToday(playerId = currentUser?.id) {
  const today = todayBogotaISO();
  return coinLedger
    .filter(entry =>
      entry.player_id === playerId &&
      Number(entry.amount || 0) > 0 &&
      dateBogotaISO(entry.created_at) === today
    )
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
}

function latestMovement(playerId = currentUser?.id) {
  return coinLedger.find(entry => entry.player_id === playerId) || null;
}

function rewardsUnlocked(playerId = currentUser?.id) {
  return approvedTodayCount(playerId) >= dailyGoal(playerId);
}

function tasksRemainingForStore(playerId = currentUser?.id) {
  return Math.max(dailyGoal(playerId) - approvedTodayCount(playerId), 0);
}

function getTaskSubmissionsFor(taskId, playerId = currentUser?.id) {
  return taskSubmissions
    .filter(submission => submission.task_id === taskId && submission.player_id === playerId)
    .sort((a, b) => {
      const aTime = new Date(a.reviewed_at || a.submitted_at || 0).getTime();
      const bTime = new Date(b.reviewed_at || b.submitted_at || 0).getTime();
      return bTime - aTime;
    });
}

function taskStatus(taskId, playerId = currentUser?.id) {
  const today = todayBogotaISO();
  const submissions = getTaskSubmissionsFor(taskId, playerId);
  const approved = submissions.find(item =>
    ['approved', 'late_approved'].includes(item.status) &&
    dateBogotaISO(item.reviewed_at || item.submitted_at) === today
  );
  if (approved) return { status: 'completed', id: approved.id, raw: approved };

  const pending = submissions.find(item => item.status === 'pending');
  if (pending) return { status: 'review', id: pending.id, raw: pending };

  const rejected = submissions.find(item =>
    item.status === 'rejected' &&
    dateBogotaISO(item.reviewed_at || item.submitted_at) === today
  );
  if (rejected) return { status: 'rejected', id: rejected.id, raw: rejected };

  const cancelled = submissions.find(item =>
    item.status === 'cancelled' &&
    dateBogotaISO(item.reviewed_at || item.submitted_at) === today
  );
  if (cancelled) return { status: 'cancelled', id: cancelled.id, raw: cancelled };

  return { status: 'pending', id: null, raw: null };
}

function getPlayerProgress(playerId = currentUser?.id) {
  const assignedTasks = tasks.filter(task => task.assigned_to === playerId);
  const statuses = assignedTasks.map(task => taskStatus(task.id, playerId));
  const completed = statuses.filter(item => item.status === 'completed').length;
  const inReview = statuses.filter(item => item.status === 'review').length;
  const rejected = statuses.filter(item => item.status === 'rejected').length;
  const cancelled = statuses.filter(item => item.status === 'cancelled').length;
  const totalAssigned = assignedTasks.length;
  const pct = totalAssigned ? Math.round((completed / totalAssigned) * 100) : 0;
  const remainingForGoal = Math.max(dailyGoal(playerId) - completed, 0);

  return {
    totalAssigned,
    completed,
    inReview,
    rejected,
    cancelled,
    pct,
    remainingForGoal
  };
}

function getPlayerDailySummary(playerId) {
  const progress = getPlayerProgress(playerId);
  return {
    playerId,
    name: getProfileName(playerId),
    avatar: getProfileAvatar(playerId),
    coins: currentBalance(playerId),
    earnedToday: pointsEarnedToday(playerId),
    goal: dailyGoal(playerId),
    unlocked: rewardsUnlocked(playerId),
    ...progress
  };
}

function getRecentPlayerActivity(playerId = currentUser?.id, limit = 6) {
  const ledgerItems = coinLedger
    .filter(entry => entry.player_id === playerId)
    .slice(0, limit)
    .map(entry => ({
      type: 'ledger',
      date: entry.created_at,
      html: ledgerHtml(entry)
    }));

  const requestItems = rewardRequests
    .filter(entry => entry.player_id === playerId)
    .slice(0, limit)
    .map(entry => ({
      type: 'request',
      date: entry.requested_at,
      html: rewardRequestHtml(entry)
    }));

  return ledgerItems
    .concat(requestItems)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}

function getFamilyRecentActivity(limit = 8) {
  return coinLedger
    .slice(0, limit)
    .map(entry => ({
      date: entry.created_at,
      playerName: getProfileName(entry.player_id),
      html: ledgerHtml(entry)
    }));
}

function familySummaryMetrics() {
  const playerIds = getPlayerIdsForAdmin();
  const summaries = playerIds.map(getPlayerDailySummary);
  return {
    players: summaries,
    completedTotal: summaries.reduce((sum, item) => sum + item.completed, 0),
    pendingReviewTotal: taskSubmissions.filter(item => item.status === 'pending').length,
    unlockedPlayers: summaries.filter(item => item.unlocked).length
  };
}

// ================================================================
// AUTH
// ================================================================
async function handleSupabaseLogin(event) {
  event.preventDefault();
  if (!requireLiveConnection()) return;

  const email = $('emailInput')?.value.trim();
  const password = $('passwordInput')?.value;
  const btn = $('loginButton');
  const err = $('loginError');

  if (err) {
    err.classList.remove('visible');
    err.textContent = '';
  }
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Entrando...';
  }

  showLoading('Entrando a Makambu...');
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  hideLoading();

  if (btn) {
    btn.disabled = false;
    btn.textContent = 'ENTRAR ▶';
  }

  if (error) {
    playSound('error');
    if (err) {
      err.textContent = 'No se pudo iniciar sesion. Revisa correo y contrasena.';
      err.classList.add('visible');
    }
    return;
  }

  session = data.session;
  goToHomeRoute();
  await bootstrapApp();
}

async function doLogout() {
  stopAutoRefresh();
  if (isBackendReady()) {
    await supabaseClient.auth.signOut();
  }
  session = null;
  currentUser = null;
  currentProfile = null;
  currentFamilyRole = null;
  familyMembers = [];
  tasks = [];
  rewards = [];
  taskSubmissions = [];
  rewardRequests = [];
  coinLedger = [];
  playerSettings = [];
  adjustmentCatalog = [];
  notifications = [];
  clearSessionVisuals();
  goToHomeRoute();
  showScreen('loginScreen');
}

async function bootstrapApp() {
  if (!isBackendReady()) {
    setConnectivityState(false);
    showScreen('loginScreen');
    return;
  }

  const { data: sessionData } = await supabaseClient.auth.getSession();
  session = sessionData.session;
  if (!session?.user) {
    showScreen('loginScreen');
    return;
  }

  currentUser = session.user;
  showLoading('Cargando perfil...');

  try {
    await loadBaseData();
    hideLoading();

    if (isGuardianOrPlatform()) {
      showScreen('adminScreen');
      renderAdminScreen();
      applyRouteForCurrentRole();
    } else {
      showScreen('mainScreen');
      renderMainScreen();
      applyRouteForCurrentRole();
    }

    startAutoRefresh();
  } catch (error) {
    hideLoading();
    fail(error, 'Error cargando datos');
  }
}

// ================================================================
// SUPABASE LOADERS
// ================================================================
async function loadBaseData() {
  const { data: profile, error: profileErr } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();
  if (profileErr) throw profileErr;
  currentProfile = profile;

  let { data: members, error: membersErr } = await supabaseClient
    .from('family_members')
    .select('id,family_id,user_id,family_role,profiles:user_id(display_name,avatar,global_role,status)')
    .eq('family_id', FAMILY_ID);

  if (membersErr) {
    const fallback = await supabaseClient
      .from('family_members')
      .select('*')
      .eq('family_id', FAMILY_ID);
    if (fallback.error) throw fallback.error;
    members = fallback.data || [];
  }

  familyMembers = (members || []).map(member => ({ ...member, profile: member.profiles || null }));
  currentFamilyRole = familyMembers.find(member => member.user_id === currentUser.id)?.family_role ||
    (currentProfile.global_role === 'platform_admin' ? 'guardian' : 'player');

  await Promise.all([
    loadTasks(),
    loadRewards(),
    loadPlayerSettings(),
    loadTaskSubmissions(),
    loadRewardRequests(),
    loadCoinLedger(),
    loadAdjustmentCatalog()
  ]);

  await syncPendingNotificationReminders();
  await loadNotifications();
}

async function loadTasks() {
  const { data, error } = await supabaseClient
    .from('tasks')
    .select('*')
    .eq('family_id', FAMILY_ID)
    .eq('status', 'active')
    .order('created_at');
  if (error) throw error;
  tasks = data || [];
}

async function loadRewards() {
  const { data, error } = await supabaseClient
    .from('rewards')
    .select('*')
    .eq('family_id', FAMILY_ID)
    .eq('status', 'active')
    .order('cost');
  if (error) throw error;
  rewards = data || [];
}

async function loadPlayerSettings() {
  const { data, error } = await supabaseClient
    .from('player_settings')
    .select('*')
    .eq('family_id', FAMILY_ID);
  if (error) throw error;
  playerSettings = data || [];
}

async function loadTaskSubmissions() {
  const { data, error } = await supabaseClient
    .from('task_submissions')
    .select('*')
    .eq('family_id', FAMILY_ID)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  taskSubmissions = data || [];
}

async function loadRewardRequests() {
  const { data, error } = await supabaseClient
    .from('reward_requests')
    .select('*')
    .eq('family_id', FAMILY_ID)
    .order('requested_at', { ascending: false });
  if (error) throw error;
  rewardRequests = data || [];
}

async function loadCoinLedger() {
  const { data, error } = await supabaseClient
    .from('coin_ledger')
    .select('*')
    .eq('family_id', FAMILY_ID)
    .order('created_at', { ascending: false });
  if (error) throw error;
  coinLedger = data || [];
}

async function loadAdjustmentCatalog() {
  const { data, error } = await supabaseClient
    .from('adjustment_catalog')
    .select('*')
    .eq('status', 'active')
    .order('coins', { ascending: false });
  if (error) throw error;
  adjustmentCatalog = data || [];
}

async function loadNotifications() {
  if (!currentUser?.id) {
    notifications = [];
    notificationsLoading = false;
    notificationsError = '';
    renderNotificationsPanel();
    updateNotificationBadges();
    return;
  }

  notificationsLoading = true;
  notificationsError = '';
  renderNotificationsPanel();

  const { data, error } = await supabaseClient
    .from('notifications')
    .select('*')
    .eq('family_id', FAMILY_ID)
    .eq('recipient_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(NOTIFICATION_HISTORY_LIMIT);

  if (error) {
    console.warn('[notifications] No se pudieron cargar avisos:', error.message);
    notifications = [];
    notificationsError = 'No se pudieron cargar tus notificaciones.';
    notificationsLoading = false;
    renderNotificationsPanel();
    updateNotificationBadges();
    return;
  }

  notifications = data || [];
  notificationsLoading = false;
  notificationsError = '';
  renderNotificationsPanel();
  updateNotificationBadges();
}

async function syncPendingNotificationReminders() {
  if (!currentUser?.id || !isGuardianOrPlatform() || !isOnline() || !isBackendReady()) return;
  const { error } = await supabaseClient.rpc('sync_pending_notification_reminders', {
    target_family_id: FAMILY_ID,
    pending_minutes: PENDING_NOTIFICATION_MINUTES
  });
  if (error) {
    console.warn('[notifications] No se pudieron sincronizar recordatorios pendientes:', error.message);
  }
}

async function refreshAll() {
  if (!requireLiveConnection()) return false;

  try {
    await Promise.all([
      loadTasks(),
      loadRewards(),
      loadPlayerSettings(),
      loadTaskSubmissions(),
      loadRewardRequests(),
      loadCoinLedger(),
      loadAdjustmentCatalog()
    ]);
    await syncPendingNotificationReminders();
    await loadNotifications();
    setCloudStatus(true);
    if (isGuardianOrPlatform()) renderAdminScreen();
    else renderMainScreen();
    applyRouteForCurrentRole();
    return true;
  } catch (error) {
    fail(error, 'No se pudieron actualizar los datos');
    return false;
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshInterval = setInterval(refreshAll, 20000);
}

function stopAutoRefresh() {
  if (!autoRefreshInterval) return;
  clearInterval(autoRefreshInterval);
  autoRefreshInterval = null;
}

async function manualUserRefresh() {
  if (!requireLiveConnection()) return;
  showToast('Actualizando...');
  const ok = await refreshAll();
  showToast(ok ? 'Actualizado' : 'No se pudo actualizar');
}

async function syncRequestsNow() {
  await manualUserRefresh();
}

// ================================================================
// SCREEN AND TAB CONTROL
// ================================================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');
}

function setActiveNav(rootId, tabs, current) {
  document.querySelectorAll(`${rootId} .nav-item`).forEach((button, index) => {
    button.classList.toggle('active', tabs[index] === current);
  });
}

function showTab(tab, updateHash = true) {
  const current = PLAYER_TABS.includes(tab) ? tab : 'hoy';
  PLAYER_TABS.forEach(name => {
    const el = $(`tab-${name}`);
    if (el) el.style.display = 'none';
  });
  const target = $(`tab-${current}`);
  if (target) target.style.display = 'block';
  setActiveNav('#mainNav', PLAYER_TABS, current);
  currentUserTab = current;

  if (current === 'hoy') renderTodayPlayer();
  if (current === 'misiones') renderMissions();
  if (current === 'tienda') renderQuickHistory();
  if (current === 'historial') renderHistorialTab();
  if (current === 'perfil') renderPlayerProfile();

  if (updateHash) syncHashForRole(current);
}

function showAdminTab(tab, updateHash = true) {
  const current = ADMIN_TABS.includes(tab) ? tab : 'hoy';
  ADMIN_TABS.forEach(name => {
    const el = $(`admin-tab-${name}`);
    if (el) el.style.display = 'none';
  });
  const target = $(`admin-tab-${current}`);
  if (target) target.style.display = 'block';
  setActiveNav('#adminNav', ADMIN_TABS, current);
  currentAdminTab = current;

  if (current === 'hoy') renderAdminTodayView();
  if (current === 'familia') renderAdminFamilyView();
  if (current === 'tareas') {
    renderPendingApprovals();
    renderAdminMissions();
  }
  if (current === 'solicitudes') renderAdminRequestsPanel();
  if (current === 'perfil') renderAdminProfileView();

  if (updateHash) syncHashForRole(current);
}

function switchStoreTab(tab) {
  const current = STORE_TABS.includes(tab) ? tab : 'tiempo';
  currentStoreTab = current;
  document.querySelectorAll('#warpZoneModal .tab-pill').forEach((button, index) => {
    button.classList.toggle('active', STORE_TABS[index] === current);
  });
  document.querySelectorAll('#warpZoneModal .tab-pane').forEach(pane => pane.classList.remove('active'));
  $(`tab-${current}`)?.classList.add('active');
}

// ================================================================
// PLAYER RENDER
// ================================================================
function renderMainScreen() {
  const avatar = currentProfile.avatar || '🎮';
  $('mainAvatar').textContent = avatar;
  $('mainName').textContent = currentProfile.display_name || 'Jugador';
  $('mainRole').textContent = 'Jugador';
  $('coinDisplay').textContent = currentBalance();

  renderTodayPlayer();
  renderMissions();
  renderQuickHistory();
  renderHistorialTab();
  renderPlayerProfile();
  updatePendingBadge();
  renderStoreRewards();
  updateNotificationBadges();
}

function renderTodayPlayer() {
  const holder = $('todayPlayerView');
  if (!holder) return;

  const progress = getPlayerProgress();
  const coinsToday = pointsEarnedToday();
  const latest = latestMovement();
  const todayTasks = myTasks();
  const recent = getRecentPlayerActivity();
  const storeReady = rewardsUnlocked();
  const remaining = tasksRemainingForStore();
  const progressWidth = `${Math.min(100, progress.pct)}%`;

  holder.innerHTML = `
    <div class="hero-card hero-card-today">
      <div class="hero-greeting">${escapeHtml(greetingNow())}, ${escapeHtml(currentProfile.display_name || 'familia')}</div>
      <div class="hero-name">Hoy</div>
      <div class="today-date">${escapeHtml(fmtLongDate())}</div>
      <div class="hero-helper">Tu resumen diario y las acciones rapidas viven aqui.</div>
    </div>

    <div class="card progress-card">
      <div class="section-row">
        <span class="section-title">Progreso diario</span>
        <span class="status-chip neutral">${progress.completed}/${progress.totalAssigned || 0} tareas</span>
      </div>
      <div class="progress-bar-shell">
        <div class="progress-bar-fill" style="width:${progressWidth};"></div>
      </div>
      <div class="progress-stats-grid">
        <div class="mini-stat">
          <span class="mini-stat-label">Completadas</span>
          <strong>${progress.completed}</strong>
        </div>
        <div class="mini-stat">
          <span class="mini-stat-label">En revision</span>
          <strong>${progress.inReview}</strong>
        </div>
        <div class="mini-stat">
          <span class="mini-stat-label">Restan para meta</span>
          <strong>${progress.remainingForGoal}</strong>
        </div>
      </div>
      <div class="progress-note">
        ${progress.totalAssigned ? `Llevas ${progress.pct}% de tus misiones asignadas.` : 'Todavia no tienes misiones asignadas hoy.'}
      </div>
    </div>

    <div class="card">
      <div class="section-row">
        <span class="section-title">Tareas del dia</span>
        <button class="section-link" onclick="showTab('misiones')">Ver todas</button>
      </div>
      ${todayTasks.length ? todayTasks.map(task => missionCardHtml(task)).join('') : empty('🌿', 'No tienes tareas asignadas por ahora.')}
    </div>

    <div class="card">
      <div class="section-row">
        <span class="section-title">Puntos y saldo</span>
      </div>
      <div class="summary-grid">
        <div class="summary-card">
          <span class="summary-label">Disponibles</span>
          <strong>🪙 ${currentBalance()}</strong>
        </div>
        <div class="summary-card">
          <span class="summary-label">Ganados hoy</span>
          <strong>+${coinsToday}</strong>
        </div>
      </div>
      <div class="inline-note">
        ${latest ? `Ultimo movimiento: ${escapeHtml(ledgerReason(latest))}` : 'Todavia no tienes movimientos registrados.'}
      </div>
    </div>

    <div class="card ${storeReady ? 'store-ready-card' : 'store-locked-card'}">
      <div class="section-row">
        <span class="section-title">Estado de la tienda</span>
      </div>
      <div class="store-status-copy">
        ${storeReady
          ? '🎁 La tienda esta disponible. Puedes revisar tus recompensas.'
          : `🔒 Completa ${remaining} misiones mas para desbloquear la tienda.`}
      </div>
      <div class="quick-actions-row">
        <button class="quick-action-btn" onclick="showTab('tienda')">Ir a tienda</button>
        <button class="quick-action-btn secondary" onclick="openWarpZone()">Abrir Warp Zone</button>
      </div>
    </div>

    <div class="card">
      <div class="section-row">
        <span class="section-title">Acciones rapidas</span>
      </div>
      <div class="quick-actions-grid">
        <button class="quick-action-tile" onclick="showTab('misiones')"><span>⭐</span>Ver tareas</button>
        <button class="quick-action-tile" onclick="showTab('tienda')"><span>🛒</span>Ir a la tienda</button>
        <button class="quick-action-tile" onclick="showTab('historial')"><span>📜</span>Consultar historial</button>
        <button class="quick-action-tile" onclick="showTab('perfil')"><span>👤</span>Abrir perfil</button>
      </div>
    </div>

    <div class="card">
      <div class="section-row">
        <span class="section-title">Historial reciente</span>
        <button class="section-link" onclick="showTab('historial')">Ver completo</button>
      </div>
      ${recent.length ? recent.map(item => item.html).join('') : empty('📜', 'Aun no tienes movimientos recientes.')}
    </div>
  `;
}

function missionCardHtml(task) {
  const state = taskStatus(task.id, task.assigned_to);
  const taskFrequency = task.frequency === 'weekly' ? 'Semanal' : 'Diaria';

  let stateClass = '';
  let badge = `<span class="mission-tag freq">${taskFrequency}</span>`;
  let action = `<button class="btn-mission-action" onclick="submitTask('${task.id}')">☐</button>`;

  if (state.status === 'completed') {
    stateClass = 'completed';
    badge = '<span class="mission-tag done">Completada</span>';
    action = '<button class="btn-mission-action done" disabled>✓</button>';
  } else if (state.status === 'review') {
    stateClass = 'pending-review';
    badge = '<span class="mission-tag pending">En revision</span>';
    action = `<button class="btn-mission-action undo" onclick="undoTask('${state.id}')">↩</button>`;
  } else if (state.status === 'rejected') {
    stateClass = 'rejected-state';
    badge = '<span class="mission-tag rejected">Rechazada</span>';
    action = `<button class="btn-mission-action retry" onclick="submitTask('${task.id}')">↻</button>`;
  } else if (state.status === 'cancelled') {
    stateClass = 'cancelled-state';
    badge = '<span class="mission-tag cancelled">Cancelada</span>';
    action = `<button class="btn-mission-action retry" onclick="submitTask('${task.id}')">↻</button>`;
  }

  return `<div class="mission-card ${stateClass}">
    <div class="mission-icon-box">${task.icon || '⭐'}</div>
    <div class="mission-info">
      <div class="mission-name">${escapeHtml(task.name)}</div>
      <div>${badge}</div>
    </div>
    <div class="mission-coins-pill">🪙${task.coins}</div>
    ${action}
  </div>`;
}

function renderMissions() {
  const holder = $('missionsList');
  if (!holder) return;
  const list = myTasks();
  holder.innerHTML = list.length
    ? list.map(task => missionCardHtml(task)).join('')
    : empty('🌿', 'No tienes misiones asignadas en este momento.');
}

function renderQuickHistory() {
  const holder = $('quickHistory');
  if (!holder) return;
  const mine = rewardRequests.filter(item => item.player_id === currentUser.id).slice(0, 5);
  holder.innerHTML = mine.length
    ? mine.map(rewardRequestHtml).join('')
    : empty('🛒', 'Aun no has solicitado recompensas.');
}

function renderHistorialTab() {
  const holder = $('historialList');
  if (!holder) return;
  const recent = getRecentPlayerActivity(currentUser.id, 24);
  holder.innerHTML = recent.length
    ? recent.map(item => item.html).join('')
    : empty('📜', 'No hay actividad para mostrar todavia.');
}

function renderPlayerProfile() {
  const holder = $('playerProfileView');
  if (!holder) return;
  holder.innerHTML = `
    <div class="profile-card">
      <div class="profile-avatar">${escapeHtml(currentProfile.avatar || '👤')}</div>
      <div class="profile-name">${escapeHtml(currentProfile.display_name || 'Jugador')}</div>
      <div class="profile-role">Jugador de la familia</div>
      <div class="summary-grid">
        <div class="summary-card">
          <span class="summary-label">Saldo actual</span>
          <strong>🪙 ${currentBalance()}</strong>
        </div>
        <div class="summary-card">
          <span class="summary-label">Meta diaria</span>
          <strong>${dailyGoal()} tareas</strong>
        </div>
      </div>
      <div class="quick-actions-row">
        <button class="quick-action-btn" onclick="manualUserRefresh()">Actualizar</button>
        <button class="quick-action-btn secondary" onclick="doLogout()">Cerrar sesion</button>
      </div>
    </div>
  `;
}

function updatePendingBadge() {
  const count = myTasks().filter(task => taskStatus(task.id).status === 'review').length;
  const holder = $('pendingBadgeMain');
  if (!holder) return;
  holder.innerHTML = count > 0 ? `<span class="badge">${count}</span>` : '';
  updateNotificationBadges();
}

function unreadNotificationsCount() {
  return notifications.filter(item => !item.is_read).length;
}

function notificationTypeMeta(type = '') {
  return {
    task_submitted: { label: 'Tarea enviada', icon: '⭐', action: 'Revisar tarea', route: 'tareas' },
    task_approved: { label: 'Tarea aprobada', icon: '✅', action: 'Ver tareas', route: 'misiones' },
    task_rejected: { label: 'Tarea rechazada', icon: '⚠️', action: 'Ver tareas', route: 'misiones' },
    reward_requested: { label: 'Solicitud de recompensa', icon: '🎁', action: 'Revisar solicitud', route: 'solicitudes' },
    reward_approved: { label: 'Recompensa aprobada', icon: '🪙', action: 'Ir a tienda', route: 'tienda' },
    reward_rejected: { label: 'Recompensa rechazada', icon: '⛔', action: 'Ir a tienda', route: 'tienda' },
    reward_delivered: { label: 'Recompensa entregada', icon: '🎉', action: 'Ver pedidos', route: 'tienda' },
    daily_goal_completed: { label: 'Meta diaria', icon: '🎯', action: 'Abrir hoy', route: 'hoy' },
    store_unlocked: { label: 'Tienda desbloqueada', icon: '🛒', action: 'Ir a tienda', route: 'tienda' },
    makambu_adjustment: { label: 'Ajuste Makambu', icon: '⚙️', action: 'Ver historial', route: 'historial' },
    bonus_received: { label: 'Bonus recibido', icon: '✨', action: 'Ver historial', route: 'historial' },
    pending_too_long: { label: 'Pendiente hace rato', icon: '⏰', action: 'Revisar ahora', route: 'hoy' }
  }[type] || { label: 'Aviso', icon: '🔔', action: 'Abrir', route: 'hoy' };
}

function notificationRelatedUserLabel(notification) {
  const actorId = notification.actor_id || notification.metadata?.player_id || notification.metadata?.guardian_id;
  if (!actorId) return 'Sistema Makambu';
  if (actorId === currentUser?.id) return 'Sistema Makambu';
  return getProfileName(actorId);
}

function notificationTargetRoute(notification) {
  if (notification.action_route) return notification.action_route;
  if (notification.type === 'pending_too_long' && notification.entity_type === 'reward_request') return 'solicitudes';
  return notificationTypeMeta(notification.type).route;
}

function updateNotificationBadges() {
  const unread = unreadNotificationsCount();
  ['notificationBadgeMain', 'notificationBadgeAdmin'].forEach(id => {
    const holder = $(id);
    if (!holder) return;
    holder.hidden = unread <= 0;
    holder.textContent = unread > 99 ? '99+' : String(unread);
  });
  if ($('notificationsSummary')) {
    const total = notifications.length;
    $('notificationsSummary').textContent = total
      ? `${unread} sin leer de ${total} recientes`
      : 'Tus avisos recientes';
  }
}

function renderNotificationsPanel() {
  const holder = $('notificationsPanelBody');
  if (!holder) return;

  updateNotificationBadges();
  if ($('notificationsMarkAllBtn')) {
    $('notificationsMarkAllBtn').disabled = unreadNotificationsCount() === 0 || notificationsLoading;
  }
  if ($('notificationsRefreshBtn')) {
    $('notificationsRefreshBtn').disabled = notificationsLoading;
  }

  if (notificationsLoading) {
    holder.innerHTML = '<div class="notifications-state"><div class="spinner notifications-spinner"></div><p>Cargando notificaciones...</p></div>';
    return;
  }

  if (notificationsError) {
    holder.innerHTML = `<div class="notifications-state error"><p>${escapeHtml(notificationsError)}</p><button class="quick-action-btn" type="button" onclick="refreshNotificationsFromPanel()">Reintentar</button></div>`;
    return;
  }

  if (!notifications.length) {
    holder.innerHTML = empty('🔔', 'No tienes notificaciones recientes.');
    return;
  }

  holder.innerHTML = notifications.map(notificationCardHtml).join('');
}

function notificationCardHtml(notification) {
  const meta = notificationTypeMeta(notification.type);
  const unreadClass = notification.is_read ? '' : ' unread';
  const typeLabel = meta.label;
  const relatedUser = notificationRelatedUserLabel(notification);
  const actionLabel = notification.action_label || meta.action;
  const readButton = notification.is_read
    ? ''
    : `<button class="btn-give" type="button" onclick="event.stopPropagation(); markNotificationRead('${notification.id}')">Marcar leido</button>`;

  return `<div class="notification-card${unreadClass}">
    <div class="notification-card-main" onclick="openNotificationTarget('${notification.id}')">
      <div class="notification-icon">${meta.icon}</div>
      <div class="notification-copy">
        <div class="notification-copy-head">
          <span class="notification-type">${escapeHtml(typeLabel)}</span>
          <span class="hist-badge ${notification.is_read ? 'approved' : 'pending'}">${notification.is_read ? 'Leido' : 'Nuevo'}</span>
        </div>
        <div class="notification-title">${escapeHtml(notification.title || 'Aviso')}</div>
        <div class="notification-message">${escapeHtml(notification.message || '')}</div>
        <div class="notification-meta">${escapeHtml(relatedUser)} · ${fmtDateTime(notification.created_at)}</div>
      </div>
    </div>
    <div class="notification-actions">
      <button class="btn-give" type="button" onclick="event.stopPropagation(); openNotificationTarget('${notification.id}')">${escapeHtml(actionLabel)}</button>
      ${readButton}
    </div>
  </div>`;
}

function openNotificationsPanel() {
  renderNotificationsPanel();
  $('notificationsModal')?.classList.add('open');
}

function closeNotificationsPanel() {
  $('notificationsModal')?.classList.remove('open');
}

async function refreshNotificationsFromPanel() {
  if (!requireLiveConnection('Makambu necesita internet para cargar notificaciones reales.')) return;
  await syncPendingNotificationReminders();
  await loadNotifications();
}

async function markNotificationRead(notificationId) {
  if (!requireLiveConnection('Makambu necesita internet para actualizar tus notificaciones.')) return;
  const { error } = await supabaseClient.rpc('mark_notification_read', {
    target_notification_id: notificationId
  });
  if (error) return fail(error, 'No se pudo marcar la notificacion');
  await loadNotifications();
  if (isGuardianOrPlatform()) renderAdminScreen();
  else renderMainScreen();
  applyRouteForCurrentRole();
}

async function markAllNotificationsRead() {
  if (!requireLiveConnection('Makambu necesita internet para actualizar tus notificaciones.')) return;
  const { error } = await supabaseClient.rpc('mark_all_notifications_read', {
    target_family_id: FAMILY_ID
  });
  if (error) return fail(error, 'No se pudieron marcar las notificaciones');
  await loadNotifications();
  if (isGuardianOrPlatform()) renderAdminScreen();
  else renderMainScreen();
  applyRouteForCurrentRole();
}

async function openNotificationTarget(notificationId) {
  const notification = notifications.find(item => item.id === notificationId);
  if (!notification) return;
  if (!notification.is_read) {
    await markNotificationRead(notificationId);
  }

  closeNotificationsPanel();
  const route = notificationTargetRoute(notification);
  if (isGuardianOrPlatform()) showAdminTab(route);
  else showTab(route);
}

// ================================================================
// TASK ACTIONS
// ================================================================
async function submitTask(taskId) {
  if (!requireLiveConnection()) return;
  const task = tasks.find(item => item.id === taskId);
  if (!task) return;

  const state = taskStatus(taskId, currentUser.id);
  if (state.status === 'review') return showToast('Esa mision ya esta en revision.');
  if (state.status === 'completed') return showToast('Esa mision ya fue aprobada hoy.');

  const { error } = await supabaseClient
    .from('task_submissions')
    .insert({ family_id: FAMILY_ID, task_id: taskId, player_id: currentUser.id, status: 'pending' });
  if (error) return fail(error, 'No se pudo enviar la mision');

  playSound('submit');
  showToast(`Mision enviada: ${task.name}`);
  spawnParticles('⭐');
  await refreshAll();
}

async function undoTask(submissionId) {
  if (!requireLiveConnection()) return;
  if (!submissionId) return;
  const local = taskSubmissions.find(item => item.id === submissionId);
  if (local && (local.player_id !== currentUser.id || local.status !== 'pending')) {
    return showToast('Solo puedes anular tus propias misiones pendientes.');
  }

  const { error } = await supabaseClient.rpc('cancel_task_submission', {
    target_submission_id: submissionId
  });
  if (error) return fail(error, 'No se pudo cancelar la mision');

  playSound('error');
  showToast('Mision cancelada');
  await refreshAll();
}

// ================================================================
// STORE
// ================================================================
function openWarpZone() {
  if ($('modalCoinDisplay')) $('modalCoinDisplay').textContent = currentBalance();
  renderStoreRewards();
  renderStorePurchaseHistory();
  $('warpZoneModal')?.classList.add('open');
  switchStoreTab(currentStoreTab);
}

function closeWarpZone() {
  $('warpZoneModal')?.classList.remove('open');
}

function renderStoreRewards() {
  const balance = currentBalance();
  if ($('modalCoinDisplay')) $('modalCoinDisplay').textContent = balance;

  const targets = { Tiempo: $('tab-tiempo'), Premio: $('tab-premios') };
  Object.entries(targets).forEach(([type, holder]) => {
    if (!holder) return;
    const list = rewards.filter(item => item.type === type);
    if (!list.length) {
      holder.innerHTML = empty('🏪', 'No hay recompensas disponibles aqui.');
      return;
    }

    holder.innerHTML = list.map(reward => {
      const hasPending = rewardRequests.some(item =>
        item.player_id === currentUser.id &&
        item.reward_id === reward.id &&
        item.status === 'pending'
      );
      const canAfford = balance >= reward.cost;
      const unlocked = !reward.requires_daily_goal || rewardsUnlocked(currentUser.id);
      const disabled = hasPending || !canAfford || !unlocked;
      const label = hasPending
        ? 'Pendiente'
        : !unlocked
          ? `Bloqueada ${approvedTodayCount()}/${dailyGoal()}`
          : !canAfford
            ? `Faltan ${reward.cost - balance}`
            : 'Solicitar';

      return `<div class="reward-row">
        <div class="reward-icon-box">${reward.icon || '🏆'}</div>
        <div class="reward-details">
          <div class="reward-row-name">${escapeHtml(reward.name)}</div>
          <div class="reward-row-cost ${canAfford ? '' : 'cant'}">🪙 ${reward.cost} monedas</div>
          ${!unlocked ? `<div class="lock-note">Completa ${tasksRemainingForStore()} misiones mas para desbloquearla.</div>` : ''}
        </div>
        <button class="btn-buy" ${disabled ? 'disabled' : ''} onclick="buyReward('${reward.id}')">${escapeHtml(label)}</button>
      </div>`;
    }).join('');
  });
}

async function buyReward(rewardId) {
  if (!requireLiveConnection()) return;
  const reward = rewards.find(item => item.id === rewardId);
  if (!reward) return;

  if (currentBalance() < reward.cost) {
    return showToast(`Te faltan ${reward.cost - currentBalance()} coins.`);
  }
  if (reward.requires_daily_goal && !rewardsUnlocked()) {
    return showToast(`Completa ${tasksRemainingForStore()} misiones mas para desbloquear la tienda.`);
  }

  const { error } = await supabaseClient
    .from('reward_requests')
    .insert({ family_id: FAMILY_ID, reward_id: rewardId, player_id: currentUser.id, status: 'pending' });
  if (error) return fail(error, 'No se pudo solicitar la recompensa');

  playSound('submit');
  showToast(`Solicitud enviada: ${reward.name}`);
  await refreshAll();
}

function renderStorePurchaseHistory() {
  const holder = $('tab-store-hist');
  if (!holder) return;
  const mine = rewardRequests.filter(item => item.player_id === currentUser.id);
  holder.innerHTML = mine.length
    ? mine.map(rewardRequestHtml).join('')
    : empty('🛒', 'Aun no tienes pedidos de tienda.');
}

// ================================================================
// ADMIN RENDER
// ================================================================
function renderAdminScreen() {
  $('adminName').textContent = currentProfile.display_name || 'Acudiente';
  $('adminCoinDisplay').textContent = currentBalance(currentUser.id);
  renderAdminTodayView();
  renderAdminFamilyView();
  renderPendingApprovals();
  renderAdminMissions();
  renderAdminRequestsPanel();
  renderAdminProfileView();
  updateAdminBadges();
  initAdminCollapsible();
  updateNotificationBadges();
}

function renderAdminTodayView() {
  const holder = $('adminTodayView');
  if (!holder) return;

  const summary = familySummaryMetrics();
  const pendingApprovals = taskSubmissions.filter(item => item.status === 'pending').slice(0, 4);
  const recent = getFamilyRecentActivity(6);
  const alerts = buildGuardianAlerts();

  holder.innerHTML = `
    <div class="hero-card hero-card-admin">
      <div class="hero-greeting">${escapeHtml(greetingNow())}, ${escapeHtml(currentProfile.display_name || 'acudiente')}</div>
      <div class="hero-name">Hoy</div>
      <div class="today-date">${escapeHtml(fmtLongDate())}</div>
      <div class="hero-helper">Vista rapida de revisiones, progreso y actividad familiar.</div>
    </div>

    <div class="card">
      <div class="section-row">
        <span class="section-title">Solicitudes pendientes</span>
        <span class="status-chip warn">${summary.pendingReviewTotal}</span>
      </div>
      ${pendingApprovals.length
        ? pendingApprovals.map(item => approvalCardHtml(item)).join('')
        : empty('✅', 'No hay tareas pendientes de revision.')}
    </div>

    <div class="card">
      <div class="section-row">
        <span class="section-title">Progreso diario de jugadores</span>
      </div>
      ${summary.players.length
        ? summary.players.map(player => guardianProgressCard(player)).join('')
        : empty('👨‍👩‍👧‍👦', 'No hay jugadores registrados en la familia.')}
    </div>

    <div class="card">
      <div class="section-row">
        <span class="section-title">Alertas relevantes</span>
      </div>
      ${alerts.length ? alerts.map(alert => `<div class="alert-row">${escapeHtml(alert)}</div>`).join('') : empty('🔔', 'No hay alertas relevantes por ahora.')}
    </div>

    <div class="card">
      <div class="section-row">
        <span class="section-title">Acciones rapidas</span>
      </div>
      <div class="quick-actions-grid">
        <button class="quick-action-tile" onclick="showAdminTab('tareas')"><span>✅</span>Revisar tareas</button>
        <button class="quick-action-tile" onclick="showAdminTab('perfil')"><span>➕</span>Crear tarea</button>
        <button class="quick-action-tile" onclick="showAdminTab('familia')"><span>👨‍👩‍👧‍👦</span>Ver progreso</button>
        <button class="quick-action-tile" onclick="showAdminTab('perfil')"><span>⚙️</span>Abrir perfil</button>
      </div>
    </div>

    <div class="card">
      <div class="section-row">
        <span class="section-title">Resumen familiar</span>
      </div>
      <div class="summary-grid">
        <div class="summary-card">
          <span class="summary-label">Tareas aprobadas hoy</span>
          <strong>${summary.completedTotal}</strong>
        </div>
        <div class="summary-card">
          <span class="summary-label">Jugadores con tienda libre</span>
          <strong>${summary.unlockedPlayers}</strong>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="section-row">
        <span class="section-title">Actividad reciente</span>
      </div>
      ${recent.length ? recent.map(item => item.html).join('') : empty('📜', 'Aun no hay movimientos familiares recientes.')}
    </div>
  `;
}

function renderAdminFamilyView() {
  const holder = $('adminFamilyView');
  if (!holder) return;
  const summary = familySummaryMetrics();
  holder.innerHTML = `
    <div class="card">
      <div class="card-title">Monedas del equipo</div>
      <div id="userStats">${renderUserStatsHtml()}</div>
    </div>
    <div class="card">
      <div class="card-title">Progreso por jugador</div>
      ${summary.players.length
        ? summary.players.map(player => guardianProgressCard(player)).join('')
        : empty('🌿', 'No hay jugadores para mostrar.')}
    </div>
  `;
}

function renderAdminProfileView() {
  const holder = $('adminProfileView');
  if (!holder) return;
  holder.innerHTML = `
    <div class="profile-card">
      <div class="profile-avatar">${escapeHtml(currentProfile.avatar || '👤')}</div>
      <div class="profile-name">${escapeHtml(currentProfile.display_name || 'Acudiente')}</div>
      <div class="profile-role">Administrador familiar</div>
      <div class="summary-grid">
        <div class="summary-card">
          <span class="summary-label">Solicitudes pendientes</span>
          <strong>${taskSubmissions.filter(item => item.status === 'pending').length}</strong>
        </div>
        <div class="summary-card">
          <span class="summary-label">Avisos sin leer</span>
          <strong>${notifications.filter(item => !item.is_read).length}</strong>
        </div>
      </div>
      <div class="quick-actions-row">
        <button class="quick-action-btn" onclick="manualUserRefresh()">Actualizar</button>
        <button class="quick-action-btn secondary" onclick="doLogout()">Cerrar sesion</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Notificaciones recientes</div>
      <div id="adminNotificationsList">${renderAdminNotificationsHtml()}</div>
    </div>
  `;

  populateAdminSelects();
  renderTaskListAdmin();
  renderRewardListAdmin();
  renderAdjustCatalogAdmin();
  renderAdminHistorialTab();
}

function buildGuardianAlerts() {
  const alerts = [];
  const unread = notifications.filter(item => !item.is_read).length;
  const pendingTasks = taskSubmissions.filter(item => item.status === 'pending').length;
  const pendingRewards = rewardRequests.filter(item => item.status === 'pending').length;
  const lockedPlayers = getPlayerIdsForAdmin().filter(id => !rewardsUnlocked(id)).length;

  if (pendingTasks) alerts.push(`Hay ${pendingTasks} tareas esperando revision.`);
  if (pendingRewards) alerts.push(`Hay ${pendingRewards} solicitudes de tienda por revisar.`);
  if (unread) alerts.push(`Tienes ${unread} notificaciones sin leer.`);
  if (lockedPlayers) alerts.push(`${lockedPlayers} jugadores aun no desbloquean la tienda hoy.`);

  return alerts;
}

function guardianProgressCard(player) {
  return `<div class="family-progress-card">
    <div class="family-progress-head">
      <div class="family-progress-avatar">${escapeHtml(player.avatar)}</div>
      <div>
        <div class="family-progress-name">${escapeHtml(player.name)}</div>
        <div class="family-progress-sub">${player.completed}/${player.totalAssigned || 0} tareas · ${player.coins} coins</div>
      </div>
      <span class="status-chip ${player.unlocked ? 'success' : 'neutral'}">${player.unlocked ? 'Tienda libre' : `Restan ${player.remainingForGoal}`}</span>
    </div>
    <div class="progress-bar-shell compact">
      <div class="progress-bar-fill" style="width:${Math.min(100, player.pct)}%;"></div>
    </div>
  </div>`;
}

function renderPendingApprovals() {
  const holder = $('pendingApprovals');
  if (!holder) return;
  const pending = taskSubmissions.filter(item => item.status === 'pending');
  holder.innerHTML = pending.length
    ? pending.map(item => approvalCardHtml(item)).join('')
    : empty('✅', 'No hay tareas pendientes.');
}

function approvalCardHtml(submission) {
  const task = tasks.find(item => item.id === submission.task_id) || {};
  return `<div class="appr-item">
    <div class="appr-avatar">${task.icon || '⭐'}</div>
    <div class="appr-info">
      <div class="appr-user">${escapeHtml(getProfileName(submission.player_id))}</div>
      <div class="appr-detail">${escapeHtml(task.name || 'Mision')}</div>
      <div class="appr-meta">🪙${task.coins || 0} · ${fmtDateTime(submission.submitted_at)}</div>
    </div>
    <div class="appr-actions">
      <button class="btn-no" onclick="rejectTask('${submission.id}')">✕</button>
      <button class="btn-ok" onclick="approveTask('${submission.id}')">✓</button>
    </div>
  </div>`;
}

async function approveTask(submissionId) {
  if (!requireLiveConnection()) return;
  const submission = taskSubmissions.find(item => item.id === submissionId);
  if (!submission) return;
  const task = tasks.find(item => item.id === submission.task_id);
  if (!task) return;

  const sameDay = dateBogotaISO(submission.submitted_at) === todayBogotaISO();
  const status = sameDay ? 'approved' : 'late_approved';
  const coins = sameDay ? task.coins : 0;

  const { error: updateError } = await supabaseClient
    .from('task_submissions')
    .update({
      status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: currentUser.id,
      coins_awarded: coins,
      counts_for_daily_goal: sameDay
    })
    .eq('id', submissionId);
  if (updateError) return fail(updateError, 'No se pudo aprobar la mision');

  if (coins > 0) {
    const { error: ledgerError } = await supabaseClient
      .from('coin_ledger')
      .insert({
        family_id: FAMILY_ID,
        player_id: submission.player_id,
        amount: coins,
        movement_type: 'task_reward',
        reason: `🌱 Creciste como el bambu +${coins} — ${task.name}`,
        source_id: submissionId,
        created_by: currentUser.id
      });
    if (ledgerError) return fail(ledgerError, 'Se aprobo la mision pero no se registraron los coins');

    spawnParticles('🪙');
    showToast(`${task.name} aprobada: +${coins} coins`);
  } else {
    showToast('Aprobacion tardia registrada sin coins.');
  }

  playSound('coin');
  await refreshAll();
}

async function rejectTask(submissionId) {
  if (!requireLiveConnection()) return;
  const { error } = await supabaseClient
    .from('task_submissions')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: currentUser.id
    })
    .eq('id', submissionId);
  if (error) return fail(error, 'No se pudo rechazar la mision');
  playSound('error');
  showToast('Mision rechazada');
  await refreshAll();
}

function renderAdminRequestsPanel() {
  const holder = $('adminRequestsList');
  if (!holder) return;
  const active = rewardRequests.filter(item => item.status === 'pending' || item.status === 'approved');
  const done = rewardRequests.filter(item => item.status === 'delivered' || item.status === 'rejected').slice(0, 8);
  holder.innerHTML = active.length || done.length
    ? active.map(adminRewardRequestHtml).join('') +
      (done.length ? `<div class="inline-note inline-note-spaced">Historial reciente</div>${done.map(adminRewardRequestHtml).join('')}` : '')
    : empty('🛒', 'No hay solicitudes para revisar.');
}

function adminRewardRequestHtml(request) {
  const reward = rewards.find(item => item.id === request.reward_id) || {};
  const balance = currentBalance(request.player_id);
  let actions = '';
  if (request.status === 'pending') {
    actions = `<button class="btn-no" onclick="rejectRequest('${request.id}')">✕</button><button class="btn-ok" ${balance >= (reward.cost || 0) ? '' : 'disabled'} onclick="approveRequest('${request.id}')">✓</button>`;
  }
  if (request.status === 'approved') {
    actions = `<button class="btn-give" onclick="deliverRequest('${request.id}')">Entregar</button>`;
  }

  return `<div class="appr-item">
    <div class="appr-avatar">${reward.icon || '🎁'}</div>
    <div class="appr-info">
      <div class="appr-user">${escapeHtml(getProfileName(request.player_id))}</div>
      <div class="appr-detail">${escapeHtml(reward.name || 'Recompensa')} · 🪙${reward.cost || request.cost_charged || 0}</div>
      <div class="appr-meta">${statusLabel(request.status)} · ${fmtDateTime(request.requested_at)}</div>
      ${request.status === 'pending' && balance < (reward.cost || 0) ? '<div class="appr-meta" style="color:var(--red)">Sin coins suficientes</div>' : ''}
    </div>
    <div class="appr-actions">${actions}</div>
  </div>`;
}

async function approveRequest(requestId) {
  if (!requireLiveConnection()) return;
  const request = rewardRequests.find(item => item.id === requestId);
  if (!request) return;
  const reward = rewards.find(item => item.id === request.reward_id);
  if (!reward) return;

  if (currentBalance(request.player_id) < reward.cost) return showToast('No tiene suficientes coins.');

  const { error: updateError } = await supabaseClient
    .from('reward_requests')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: currentUser.id,
      cost_charged: reward.cost
    })
    .eq('id', requestId);
  if (updateError) return fail(updateError, 'No se pudo aprobar la recompensa');

  const { error: ledgerError } = await supabaseClient
    .from('coin_ledger')
    .insert({
      family_id: FAMILY_ID,
      player_id: request.player_id,
      amount: -reward.cost,
      movement_type: 'reward_purchase',
      reason: `Compra de recompensa: ${reward.name}`,
      source_id: requestId,
      created_by: currentUser.id
    });
  if (ledgerError) return fail(ledgerError, 'La recompensa se aprobo pero no desconto coins');

  playSound('buy');
  showToast(`Recompensa aprobada: -${reward.cost} coins`);
  await refreshAll();
}

async function deliverRequest(requestId) {
  if (!requireLiveConnection()) return;
  const { error } = await supabaseClient
    .from('reward_requests')
    .update({ status: 'delivered', delivered_at: new Date().toISOString() })
    .eq('id', requestId);
  if (error) return fail(error, 'No se pudo marcar la entrega');
  playSound('buy');
  showToast('Recompensa entregada');
  await refreshAll();
}

async function rejectRequest(requestId) {
  if (!requireLiveConnection()) return;
  const { error } = await supabaseClient
    .from('reward_requests')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: currentUser.id
    })
    .eq('id', requestId);
  if (error) return fail(error, 'No se pudo rechazar la solicitud');
  playSound('error');
  showToast('Solicitud rechazada');
  await refreshAll();
}

function renderAdminNotificationsHtml() {
  const list = notifications.slice(0, 10);
  return list.length
    ? list.map(notificationHtml).join('')
    : empty('🔔', 'Sin notificaciones recientes.');
}

function notificationHtml(notification) {
  const unread = !notification.is_read
    ? '<span class="hist-badge pending">Nuevo</span>'
    : '<span class="hist-badge approved">Leido</span>';
  const action = !notification.is_read
    ? `<button class="btn-give" onclick="markNotificationRead('${notification.id}')">Marcar leido</button>`
    : '';

  return `<div class="notif-item ${notification.is_read ? '' : 'unread'}">
    <div class="hist-dot approved">🎋</div>
    <div class="hist-info">
      <div class="hist-name">${escapeHtml(notification.title || 'Aviso')}</div>
      <div class="hist-sub">${escapeHtml(notification.message || '')} · ${fmtDateTime(notification.created_at)}</div>
    </div>
    ${unread}
    ${action}
  </div>`;
}

async function markNotificationReadLegacy(notificationId) {
  if (!requireLiveConnection()) return;
  const { error } = await supabaseClient
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('recipient_id', currentUser.id);
  if (error) return fail(error, 'No se pudo marcar el aviso');
  await loadNotifications();
  renderAdminScreen();
  applyRouteForCurrentRole();
}

function renderNotificationSettingsAdmin() {
  if (!isGuardianOrPlatform()) return;
  let holder = $('dailyGoalNotifySettings');
  if (!holder && $('admin-tab-perfil')) {
    const section = document.createElement('div');
    section.className = 'admin-section';
    section.innerHTML = `<div class="admin-sec-title"><span>🔔</span> Notificar meta diaria<span class="sec-caret">▼</span></div><div class="admin-body"><p class="notify-help">Activa un aviso interno cuando un jugador alcance su meta diaria. No envia avisos por cada tarea.</p><div id="dailyGoalNotifySettings"></div></div>`;
    $('admin-tab-perfil').appendChild(section);
    holder = $('dailyGoalNotifySettings');
  }
  if (!holder) return;

  const playerIds = getPlayerIdsForAdmin();
  holder.innerHTML = playerIds.length
    ? playerIds.map(id => {
        const checked = shouldNotifyDailyGoal(id) ? 'checked' : '';
        return `<div class="notify-row">
          <div>
            <div class="notify-title">${escapeHtml(getProfileName(id))}</div>
            <div class="notify-sub">Meta actual: ${dailyGoal(id)} misiones aprobadas</div>
          </div>
          <label class="switch">
            <input type="checkbox" ${checked} onchange="setDailyGoalNotification('${id}', this.checked)">
            <span class="slider"></span>
          </label>
        </div>`;
      }).join('')
    : empty('🌿', 'No hay jugadores para configurar.');
}

async function setDailyGoalNotification(playerId, enabled) {
  if (!requireLiveConnection()) return;
  const existing = playerSettings.find(setting => setting.player_id === playerId);
  let error;
  if (existing) {
    ({ error } = await supabaseClient
      .from('player_settings')
      .update({ notify_daily_goal: enabled })
      .eq('id', existing.id));
  } else {
    ({ error } = await supabaseClient
      .from('player_settings')
      .insert({
        family_id: FAMILY_ID,
        player_id: playerId,
        daily_goal: 5,
        notify_daily_goal: enabled,
        require_parent_approval: true
      }));
  }
  if (error) return fail(error, 'No se pudo guardar la opcion');
  showToast(enabled ? 'Aviso activado' : 'Aviso desactivado');
  await loadPlayerSettings();
  renderAdminProfileView();
  applyRouteForCurrentRole();
}

function renderUserStatsHtml() {
  const playerIds = getPlayerIdsForAdmin();
  return playerIds.length
    ? playerIds.map(id => {
        const summary = getPlayerDailySummary(id);
        return `<div class="ustat-card">
          <div class="ustat-avatar">${escapeHtml(summary.avatar)}</div>
          <div class="ustat-info">
            <div class="ustat-name">${escapeHtml(summary.name)}</div>
            <div class="ustat-role">${summary.completed}/${summary.goal} hoy · ${summary.totalAssigned || 0} asignadas</div>
          </div>
          <div class="ustat-coins">🪙 ${summary.coins}</div>
        </div>`;
      }).join('')
    : empty('👨‍👩‍👧‍👦', 'No hay jugadores registrados.');
}

function updateAdminBadges() {
  const pendingTasks = taskSubmissions.filter(item => item.status === 'pending').length;
  const pendingRequests = rewardRequests.filter(item => item.status === 'pending' || item.status === 'approved').length;
  if ($('pendingBadgeAdmin')) $('pendingBadgeAdmin').innerHTML = pendingTasks ? `<span class="badge">${pendingTasks}</span>` : '';
  if ($('requestsBadgeAdmin')) $('requestsBadgeAdmin').innerHTML = pendingRequests ? `<span class="badge">${pendingRequests}</span>` : '';
  updateNotificationBadges();
}

function renderAdminMissions() {
  const holder = $('adminMissionsList');
  if (!holder) return;
  holder.innerHTML = tasks.length
    ? tasks.map(task => `<div class="mission-card"><div class="mission-icon-box">${task.icon || '⭐'}</div><div class="mission-info"><div class="mission-name">${escapeHtml(task.name)}</div><span class="mission-tag freq">${escapeHtml(getProfileName(task.assigned_to))} · ${task.frequency}</span></div><div class="mission-coins-pill">🪙${task.coins}</div></div>`).join('')
    : empty('⭐', 'No hay misiones activas.');
}

function renderAdminHistorialTab() {
  const holder = $('adminHistorialList');
  if (!holder) return;
  holder.innerHTML = coinLedger.length
    ? coinLedger.slice(0, 40).map(ledgerHtml).join('')
    : empty('📜', 'No hay actividad registrada todavia.');
}

function populateAdminSelects() {
  const playerIds = getPlayerIdsForAdmin();
  const options = playerIds.map(id => `<option value="${id}">${escapeHtml(getProfileName(id))}</option>`).join('');
  if ($('adjUserSel')) $('adjUserSel').innerHTML = options;
  if ($('newTaskUser')) $('newTaskUser').innerHTML = options;
}

function renderTaskListAdmin() {
  const holder = $('taskListAdmin');
  if (!holder) return;
  holder.innerHTML = tasks.length
    ? tasks.map(task => `<div class="list-item"><span class="list-item-icon">${task.icon || '⭐'}</span><div class="list-item-info"><div class="list-item-name">${escapeHtml(task.name)}</div><div class="list-item-meta">${escapeHtml(getProfileName(task.assigned_to))} · ${task.frequency} · 🪙${task.coins}</div></div></div>`).join('')
    : empty('⭐', 'Todavia no hay tareas configuradas.');
}

function renderRewardListAdmin() {
  const holder = $('rewardListAdmin');
  if (!holder) return;
  holder.innerHTML = rewards.length
    ? rewards.map(reward => `<div class="list-item"><span class="list-item-icon">${reward.icon || '🎁'}</span><div class="list-item-info"><div class="list-item-name">${escapeHtml(reward.name)}</div><div class="list-item-meta">${reward.type} · 🪙${reward.cost} · ${reward.requires_daily_goal ? 'meta diaria' : 'sin meta'}</div></div></div>`).join('')
    : empty('🎁', 'Todavia no hay recompensas configuradas.');
}

function renderAdjustCatalogAdmin() {
  let holder = $('adjustCatalogList');
  if (!holder && $('admin-tab-perfil')) {
    const section = document.createElement('div');
    section.className = 'admin-section';
    section.innerHTML = `<div class="admin-sec-title"><span>⚠️</span> Ajuste Makambu<span class="sec-caret">▼</span></div><div class="admin-body"><div id="adjustCatalogList" class="adjust-grid"></div></div>`;
    $('admin-tab-perfil').appendChild(section);
    holder = $('adjustCatalogList');
  }
  if (!holder) return;
  holder.innerHTML = adjustmentCatalog.length
    ? adjustmentCatalog.map(item => `<button class="adjust-btn" onclick="applyCatalogAdjustment('${item.id}')">⚠️ ${escapeHtml(capitalize(item.level))} · ${escapeHtml(item.label)} · ${item.coins} coins</button>`).join('')
    : empty('⚠️', 'No hay ajustes configurados.');
}

async function applyCatalogAdjustment(adjustmentId) {
  if (!requireLiveConnection()) return;
  const adjustment = adjustmentCatalog.find(item => item.id === adjustmentId);
  if (!adjustment) return;
  const playerId = $('adjUserSel')?.value || getPlayerIdsForAdmin()[0];
  if (!playerId) return showToast('No hay jugador seleccionado.');
  if (!window.confirm(`Aplicar ${adjustment.coins} coins a ${getProfileName(playerId)} por: ${adjustment.label}?`)) return;

  const { error } = await supabaseClient
    .from('coin_ledger')
    .insert({
      family_id: FAMILY_ID,
      player_id: playerId,
      amount: adjustment.coins,
      movement_type: 'makambu_adjustment',
      reason: `⚠️ Ajuste Makambu: ${adjustment.label}`,
      created_by: currentUser.id
    });
  if (error) return fail(error, 'No se pudo aplicar el ajuste');

  playSound('error');
  showToast(`Ajuste aplicado: ${adjustment.coins} coins`);
  await refreshAll();
}

async function adjustCoins(direction) {
  if (!requireLiveConnection()) return;
  const playerId = $('adjUserSel')?.value;
  const amount = parseInt($('adjAmount')?.value || '0', 10);
  if (!playerId || amount <= 0) return showToast('Selecciona jugador y cantidad.');

  const signed = direction * amount;
  const reason = signed > 0
    ? `🌱 Creciste como el bambu +${amount}`
    : `⚠️ Penalizacion por mision fallida -${amount}`;
  const type = signed > 0 ? 'manual_bonus' : 'mission_failed_penalty';

  const { error } = await supabaseClient
    .from('coin_ledger')
    .insert({
      family_id: FAMILY_ID,
      player_id: playerId,
      amount: signed,
      movement_type: type,
      reason,
      created_by: currentUser.id
    });
  if (error) return fail(error, 'No se pudo ajustar el saldo');

  playSound(signed > 0 ? 'coin' : 'error');
  showToast(`${signed > 0 ? 'Se sumaron' : 'Se descontaron'} ${amount} coins.`);
  if ($('adjAmount')) $('adjAmount').value = '';
  await refreshAll();
}

async function addTask() {
  if (!requireLiveConnection()) return;
  const name = $('newTaskName')?.value.trim();
  const icon = $('newTaskIcon')?.value.trim() || '⭐';
  const coins = parseInt($('newTaskCoins')?.value || '5', 10);
  const frequencyLabel = $('newTaskFreq')?.value || 'Diaria';
  const assigned = $('newTaskUser')?.value;

  if (!name || !assigned) return showToast('Completa la informacion de la mision.');

  const { error } = await supabaseClient
    .from('tasks')
    .insert({
      family_id: FAMILY_ID,
      assigned_to: assigned,
      created_by: currentUser.id,
      name,
      icon,
      coins,
      frequency: frequencyLabel === 'Semanal' ? 'weekly' : 'daily',
      is_default: false,
      status: 'active'
    });
  if (error) return fail(error, 'No se pudo crear la mision');

  showToast('Mision agregada');
  await refreshAll();
}

async function addReward() {
  if (!requireLiveConnection()) return;
  const name = $('newRewardName')?.value.trim();
  const icon = $('newRewardIcon')?.value.trim() || '🎁';
  const cost = parseInt($('newRewardCost')?.value || '10', 10);
  const type = $('newRewardType')?.value || 'Premio';

  if (!name) return showToast('Escribe el nombre de la recompensa.');

  const { error } = await supabaseClient
    .from('rewards')
    .insert({
      family_id: FAMILY_ID,
      created_by: currentUser.id,
      name,
      icon,
      cost,
      type,
      requires_daily_goal: true,
      is_default: false,
      status: 'active'
    });
  if (error) return fail(error, 'No se pudo crear la recompensa');

  showToast('Recompensa agregada');
  await refreshAll();
}

function resetDailyTasks() {
  showToast('El reset diario se calcula por fecha Bogota. No borra historial.');
}

function exportData() {
  const payload = {
    profile: currentProfile,
    familyMembers,
    tasks,
    rewards,
    taskSubmissions,
    rewardRequests,
    coinLedger,
    playerSettings,
    adjustmentCatalog,
    notifications
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `makambu_export_${todayBogotaISO()}.json`;
  anchor.click();
}

// ================================================================
// HTML HELPERS
// ================================================================
function rewardRequestHtml(request) {
  const reward = rewards.find(item => item.id === request.reward_id) || {};
  return `<div class="hist-item">
    <div class="hist-dot ${request.status}">${reward.icon || '🎁'}</div>
    <div class="hist-info">
      <div class="hist-name">${escapeHtml(reward.name || 'Recompensa')}</div>
      <div class="hist-sub">🪙${reward.cost || request.cost_charged || 0} · ${fmtDateTime(request.requested_at)}</div>
    </div>
    <span class="hist-badge ${request.status}">${escapeHtml(statusLabel(request.status))}</span>
  </div>`;
}

function ledgerReason(entry) {
  const base = entry.reason || entry.movement_type;
  if (entry.movement_type === 'task_reward' && !String(base).includes('—')) {
    const submission = taskSubmissions.find(item => item.id === entry.source_id);
    const task = tasks.find(item => item.id === submission?.task_id);
    if (task?.name) return `${base} — ${task.name}`;
  }
  return base;
}

function ledgerHtml(entry) {
  const cls = Number(entry.amount || 0) >= 0 ? 'approved' : 'rejected';
  const icon = Number(entry.amount || 0) >= 0 ? '🪙' : '⚠️';
  const amountLabel = Number(entry.amount || 0) > 0 ? `+${entry.amount}` : `${entry.amount}`;
  return `<div class="hist-item">
    <div class="hist-dot ${cls}">${icon}</div>
    <div class="hist-info">
      <div class="hist-name">${escapeHtml(ledgerReason(entry))}</div>
      <div class="hist-sub">${escapeHtml(getProfileName(entry.player_id))} · ${fmtDateTime(entry.created_at)}</div>
    </div>
    <span class="hist-badge ${cls}">${escapeHtml(amountLabel)}</span>
  </div>`;
}

function statusLabel(status) {
  return ({
    pending: 'Pendiente',
    approved: 'Aprobado',
    delivered: 'Entregado',
    rejected: 'Rechazado',
    late_approved: 'Aprobado tarde',
    cancelled: 'Cancelada'
  })[status] || status;
}

function empty(icon, message) {
  return `<div class="empty-box"><span class="e-icon">${icon}</span><p>${escapeHtml(message)}</p></div>`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[char]);
}

function capitalize(value = '') {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

// ================================================================
// UI HELPERS
// ================================================================
function setCloudStatus(ok) {
  const holder = $('cloudStatus');
  if (!holder) return;
  holder.textContent = ok ? 'Nube OK' : 'Sin nube';
  holder.classList.toggle('cloud-ok', ok);
  holder.classList.toggle('cloud-err', !ok);
}

function fail(error, message) {
  console.error(error);
  setCloudStatus(false);
  playSound('error');
  showToast(message);
}

function initAdminCollapsible() {
  document.querySelectorAll('#adminScreen .admin-section').forEach(section => {
    if (section.dataset.collapsible) return;
    section.dataset.collapsible = '1';
    const title = section.querySelector('.admin-sec-title');
    if (!title) return;
    title.addEventListener('click', event => {
      if (!event.target.closest('button')) section.classList.toggle('collapsed');
    });
  });
}

function showLoading(message) {
  const overlay = $('loadingOverlay');
  if (!overlay) return;
  if ($('loadingMsg')) $('loadingMsg').textContent = message || 'Cargando...';
  overlay.classList.add('visible');
}

function hideLoading() {
  $('loadingOverlay')?.classList.remove('visible');
}

function showToast(message) {
  const holder = $('toast');
  if (!holder) return;
  holder.textContent = message;
  holder.classList.add('show');
  window.setTimeout(() => holder.classList.remove('show'), 3000);
}

function spawnParticles(emoji = '🪙', x, y) {
  const cx = x || window.innerWidth / 2;
  const cy = y || window.innerHeight / 3;
  for (let index = 0; index < 8; index += 1) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.textContent = emoji;
    const angle = (index / 8) * Math.PI * 2;
    const distance = 60 + Math.random() * 60;
    particle.style.cssText = `left:${cx}px;top:${cy}px;--tx:${Math.cos(angle) * distance}px;--ty:${Math.sin(angle) * distance}px;animation-duration:${0.6 + Math.random() * 0.4}s;`;
    document.body.appendChild(particle);
    window.setTimeout(() => particle.remove(), 1200);
  }
}

function setupPwaControls() {
  $('retryConnectionBtn')?.addEventListener('click', manualUserRefresh);
  $('dismissInstallBtn')?.addEventListener('click', () => {
    localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    setInstallBannerVisibility();
  });
  $('dismissGuideBtn')?.addEventListener('click', () => {
    localStorage.setItem(INSTALL_GUIDE_DISMISSED_KEY, '1');
    setInstallGuideVisibility(false);
  });
  $('installAppBtn')?.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const outcome = await deferredInstallPrompt.userChoice;
      if (outcome?.outcome !== 'accepted') {
        localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
      }
      deferredInstallPrompt = null;
      setInstallBannerVisibility();
      return;
    }
    setInstallGuideVisibility(true);
  });
  $('dismissUpdateBtn')?.addEventListener('click', () => {
    updateBannerDismissed = true;
    setUpdateBannerVisibility(false);
  });
  $('applyUpdateBtn')?.addEventListener('click', () => {
    if (!swRegistration?.waiting) {
      setUpdateBannerVisibility(false);
      return;
    }
    isApplyingUpdate = true;
    swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    localStorage.removeItem(INSTALL_DISMISSED_KEY);
    setInstallBannerVisibility();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    setInstallBannerVisibility();
    setInstallGuideVisibility(false);
    showToast('Makambu quedo instalada.');
  });

  window.addEventListener('online', () => {
    setConnectivityState(isBackendReady());
    if (session?.user) refreshAll();
  });

  window.addEventListener('offline', () => {
    setConnectivityState(false);
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  try {
    swRegistration = await navigator.serviceWorker.register(`./sw.js?v=${APP_VERSION}`);

    if (swRegistration.waiting) {
      markUpdateReady(swRegistration);
    }

    swRegistration.addEventListener('updatefound', () => {
      const newWorker = swRegistration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          markUpdateReady(swRegistration);
        }
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (isApplyingUpdate) window.location.reload();
    });
  } catch (error) {
    console.warn('[pwa] No se pudo registrar el service worker:', error.message);
  }
}

// ================================================================
// INIT
// ================================================================
document.addEventListener('DOMContentLoaded', async () => {
  setupPwaControls();
  setConnectivityState(isOnline() && isBackendReady());
  setInstallBannerVisibility();
  setInstallGuideVisibility(!('onbeforeinstallprompt' in window));
  registerServiceWorker();

  try {
    if (!isBackendReady()) {
      showScreen('loginScreen');
      showToast('No tienes conexion. Makambu necesita internet para actualizar misiones, monedas y solicitudes.');
      return;
    }

    const { data } = await supabaseClient.auth.getSession();
    session = data.session;
    if (session?.user) await bootstrapApp();
    else showScreen('loginScreen');
    setConnectivityState(isOnline());
  } catch (error) {
    fail(error, 'No se pudo iniciar la aplicacion');
    showScreen('loginScreen');
  }
});
