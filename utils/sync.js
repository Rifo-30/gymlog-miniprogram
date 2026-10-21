const storage = require('./storage');
const cloud = require('./cloud');
const cardioUtil = require('./cardio');

const META_KEY = 'gymlog.cloud.meta.v1';
const EPOCH = '1970-01-01T00:00:00.000Z';

let initPromise = null;
let syncPromise = null;
let debounceTimer = null;
let statusListeners = [];
let dataListeners = [];

const state = {
  status: cloud.available() ? 'idle' : 'unavailable',
  openid: '',
  lastSyncAt: '',
  error: '',
  pending: false
};

function getMeta() {
  try {
    return wx.getStorageSync(META_KEY) || {};
  } catch (e) {
    return {};
  }
}

function saveMeta(meta) {
  try {
    wx.setStorageSync(META_KEY, meta || {});
  } catch (e) {
    console.error('保存云同步状态失败', e);
  }
}

function getState() {
  return Object.assign({}, state, {
    hasCloud: cloud.available(),
    envId: cloud.CLOUD_ENV_ID || ''
  });
}

function notifyStatus() {
  const snapshot = getState();
  statusListeners.slice().forEach((listener) => {
    try {
      listener(snapshot);
    } catch (e) {
      console.error('云同步状态监听失败', e);
    }
  });
}

function notifyData(db) {
  dataListeners.slice().forEach((listener) => {
    try {
      listener(db);
    } catch (e) {
      console.error('云数据刷新监听失败', e);
    }
  });
}

function setState(patch) {
  Object.assign(state, patch || {});
  notifyStatus();
}

function onStatus(listener) {
  if (typeof listener !== 'function') return () => {};
  statusListeners.push(listener);
  listener(getState());
  return () => {
    statusListeners = statusListeners.filter((item) => item !== listener);
  };
}

function onData(listener) {
  if (typeof listener !== 'function') return () => {};
  dataListeners.push(listener);
  return () => {
    dataListeners = dataListeners.filter((item) => item !== listener);
  };
}

function friendlyError(error) {
  const message = (error && (error.errMsg || error.message)) || '云同步失败';
  if (/env|environment|cloud|云开发|not found|function/i.test(message)) {
    return '云端未连接，请检查云环境和云函数配置';
  }
  if (/timeout|network|请求超时/i.test(message)) {
    return '网络不稳定，稍后会自动重试';
  }
  return message;
}

function cleanWorkout(workout) {
  if (!workout) return null;
  const copy = JSON.parse(JSON.stringify(workout));
  delete copy.showNote;
  delete copy.lastHint;
  copy.exercises = (copy.exercises || []).map((exercise) => {
    const next = Object.assign({}, exercise);
    delete next.showNote;
    delete next.lastHint;
    if (next.cardio) {
      next.cardio = cardioUtil.create(next.cardioType, next.cardio);
    }
    next.sets = (next.sets || []).map((set) => {
      const nextSet = Object.assign({}, set);
      delete nextSet.weightDisplay;
      return nextSet;
    });
    return next;
  });
  return copy;
}

function sanitizeDB(db) {
  const copy = JSON.parse(JSON.stringify(db));
  copy.activeWorkout = cleanWorkout(copy.activeWorkout);
  copy.workouts = (copy.workouts || []).map(cleanWorkout);
  copy.updatedAt = copy.updatedAt || EPOCH;
  return copy;
}

function preferLocalProfile(remoteDB, localDB) {
  const merged = Object.assign({}, remoteDB || {});
  const remoteProfile = merged.profile || {};
  const localProfile = (localDB && localDB.profile) || {};
  const remoteAt = new Date(remoteProfile.updatedAt || 0).getTime();
  const localAt = new Date(localProfile.updatedAt || 0).getTime();
  // Safety net for older deployed sync functions and in-flight stale responses.
  if (localProfile.nickName && (!remoteProfile.nickName || localAt > remoteAt)) {
    merged.profile = localProfile;
  }
  return merged;
}

async function login() {
  if (!cloud.available()) {
    throw new Error('当前基础库不支持云开发');
  }
  cloud.init();
  setState({ status: 'loggingIn', error: '' });
  const loginResult = await new Promise((resolve, reject) => {
    wx.login({
      success: resolve,
      fail: reject
    });
  });
  const result = await cloud.callFunction('login', {
    code: loginResult.code || ''
  });
  if (!result || !result.openid) {
    throw new Error((result && result.error) || '微信登录失败');
  }
  const meta = Object.assign({}, getMeta(), {
    openid: result.openid
  });
  saveMeta(meta);
  setState({ openid: result.openid, status: 'loggedIn' });
  return result.openid;
}

function schedulePush() {
  if (!cloud.available()) return;
  const meta = getMeta();
  if (!meta.openid) return;
  state.pending = true;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    state.pending = false;
    syncNow().catch(() => {});
  }, 1200);
}

async function syncNow() {
  if (!cloud.available()) {
    setState({ status: 'unavailable' });
    throw new Error('当前基础库不支持云开发');
  }
  const meta = getMeta();
  if (!meta.openid) {
    await login();
  }
  if (syncPromise) return syncPromise;

  const local = sanitizeDB(storage.getDB());
  const requestVersion = local.updatedAt || EPOCH;

  syncPromise = (async () => {
    setState({ status: 'syncing', error: '' });
    const result = await cloud.callFunction('sync', { local });
    if (!result || !result.ok) {
      throw new Error((result && result.error) || '云同步失败');
    }

    const current = storage.getDB();
    if ((current.updatedAt || EPOCH) !== requestVersion) {
      // The user changed something while the request was in flight.
      // Keep local data and run another merge instead of overwriting it.
      setState({ status: 'pending' });
      schedulePush();
      return result.data;
    }

    const mergedData = preferLocalProfile(result.data, current);
    storage.saveDB(mergedData, { skipTouch: true, skipNotify: true });
    const syncedAt = result.syncedAt || new Date().toISOString();
    const nextMeta = Object.assign({}, getMeta(), {
      openid: result.openid || getMeta().openid || '',
      lastSyncAt: syncedAt
    });
    saveMeta(nextMeta);
    setState({
      status: 'synced',
      openid: nextMeta.openid,
      lastSyncAt: syncedAt,
      error: ''
    });
    notifyData(mergedData);
    return mergedData;
  })().catch((error) => {
    setState({
      status: 'error',
      error: friendlyError(error)
    });
    throw error;
  }).finally(() => {
    syncPromise = null;
  });

  return syncPromise;
}

function initialize() {
  if (!cloud.available()) {
    setState({ status: 'unavailable' });
    return Promise.resolve(null);
  }
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      cloud.init();
      const meta = getMeta();
      if (meta.openid) {
        setState({ openid: meta.openid, status: 'loggingIn' });
      } else {
        await login();
      }
      const data = await syncNow();
      return data;
    } catch (error) {
      setState({
        status: 'error',
        error: friendlyError(error)
      });
      return null;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

async function uploadAvatar(filePath) {
  if (!cloud.available()) {
    throw new Error('当前基础库不支持云开发');
  }
  const meta = getMeta();
  const openid = meta.openid || await login();
  const extensionMatch = String(filePath || '').match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : 'png';
  const cloudPath = `avatars/${openid}/avatar-${Date.now()}.${extension}`;
  return cloud.uploadFile(cloudPath, filePath);
}

async function resolveAvatarUrl(profile) {
  if (!profile) return '';
  if (profile.avatarUrl && String(profile.avatarUrl).indexOf('cloud://') !== 0) {
    return profile.avatarUrl;
  }
  if (profile.avatarFileId) {
    try {
      return await cloud.getTempFileURL(profile.avatarFileId);
    } catch (e) {
      return '';
    }
  }
  return '';
}

async function clearCloudData() {
  if (!cloud.available()) {
    throw new Error('当前基础库不支持云开发');
  }
  // Cancel a queued push and let any in-flight merge finish before clearing.
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  state.pending = false;
  if (syncPromise) {
    try {
      await syncPromise;
    } catch (e) {}
  }
  const meta = getMeta();
  if (!meta.openid) await login();
  setState({ status: 'syncing', error: '' });
  const result = await cloud.callFunction('clear', {});
  if (!result || !result.ok) {
    throw new Error((result && result.error) || '云端数据清除失败');
  }
  const nextMeta = Object.assign({}, getMeta(), {
    lastSyncAt: ''
  });
  saveMeta(nextMeta);
  setState({ status: 'idle', lastSyncAt: '', error: '' });
  return true;
}

module.exports = {
  initialize,
  syncNow,
  schedulePush,
  clearCloudData,
  uploadAvatar,
  resolveAvatarUrl,
  login,
  getState,
  onStatus,
  onData
};
