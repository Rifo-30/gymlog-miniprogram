const DB_KEY = 'gymlog.db.v1';
const EPOCH = '1970-01-01T00:00:00.000Z';
const TOMBSTONE_DAYS = 90;

const DEFAULT_SETTINGS = {
  onboarded: false,
  unit: 'kg',
  goal: '增肌',
  experience: '新手',
  weeklyGoal: 3,
  restSeconds: 90,
  theme: 'dark',
  pinnedExercises: []
};

let changeHandler = null;

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDefaultDB() {
  return {
    version: 2,
    settings: deepClone(DEFAULT_SETTINGS),
    settingsUpdatedAt: EPOCH,
    workouts: [],
    activeWorkout: null,
    activeWorkoutUpdatedAt: EPOCH,
    customExercises: [],
    profile: {
      nickName: '',
      avatarUrl: '',
      avatarFileId: '',
      heightCm: 0,
      weightKg: 0,
      updatedAt: EPOCH
    },
    deletedWorkouts: [],
    deletedCustomExercises: [],
    updatedAt: EPOCH
  };
}

function normalizeDB(raw) {
  const db = raw && typeof raw === 'object' ? raw : createDefaultDB();
  const defaults = createDefaultDB();
  db.version = 2;
  db.settings = Object.assign({}, defaults.settings, db.settings || {});
  db.workouts = Array.isArray(db.workouts) ? db.workouts : [];
  db.customExercises = Array.isArray(db.customExercises) ? db.customExercises : [];
  db.profile = Object.assign({ nickName: '', avatarUrl: '', avatarFileId: '', heightCm: 0, weightKg: 0, updatedAt: EPOCH }, db.profile || {});
  db.deletedWorkouts = Array.isArray(db.deletedWorkouts) ? db.deletedWorkouts : [];
  db.deletedCustomExercises = Array.isArray(db.deletedCustomExercises) ? db.deletedCustomExercises : [];
  db.activeWorkout = db.activeWorkout || null;
  db.settingsUpdatedAt = db.settingsUpdatedAt || EPOCH;
  db.activeWorkoutUpdatedAt = db.activeWorkoutUpdatedAt
    || (db.activeWorkout && db.activeWorkout.updatedAt)
    || EPOCH;
  db.updatedAt = db.updatedAt || EPOCH;
  if (!db.settings.unit) db.settings.unit = 'kg';
  if (!db.settings.theme) db.settings.theme = 'dark';
  if (!db.settings.weeklyGoal) db.settings.weeklyGoal = 3;
  if (!db.settings.restSeconds) db.settings.restSeconds = 90;
  if (!Array.isArray(db.settings.pinnedExercises)) db.settings.pinnedExercises = [];
  return db;
}

function getDB() {
  try {
    const stored = wx.getStorageSync(DB_KEY);
    if (!stored) return createDefaultDB();
    return normalizeDB(stored);
  } catch (e) {
    console.error('读取本地数据失败', e);
    return createDefaultDB();
  }
}

function comparable(value) {
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).sort().forEach((key) => {
      if (key === 'updatedAt' || key === 'weightDisplay' || key === 'lastHint' || key === 'showNote') return;
      out[key] = comparable(value[key]);
    });
    return out;
  }
  return value;
}

function sameData(a, b) {
  return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));
}

function mapById(items) {
  const map = {};
  (items || []).forEach((item) => {
    if (item && item.id) map[item.id] = item;
  });
  return map;
}

function addTombstone(list, id, at) {
  if (!id) return;
  const existing = (list || []).find((item) => item.id === id);
  if (existing) {
    existing.deletedAt = at;
  } else {
    list.push({ id, deletedAt: at });
  }
}

function pruneTombstones(list) {
  const cutoff = Date.now() - TOMBSTONE_DAYS * 86400000;
  return (list || []).filter((item) => {
    const time = new Date(item.deletedAt).getTime();
    return Number.isFinite(time) && time >= cutoff;
  });
}

function markWorkoutChanges(db, prev, now) {
  const prevMap = mapById(prev.workouts);
  const nextMap = mapById(db.workouts);

  Object.keys(nextMap).forEach((id) => {
    const next = nextMap[id];
    const old = prevMap[id];
    if (!old || !sameData(old, next)) {
      next.updatedAt = now;
      db.deletedWorkouts = (db.deletedWorkouts || []).filter((item) => item.id !== id);
    }
  });

  Object.keys(prevMap).forEach((id) => {
    if (!nextMap[id]) addTombstone(db.deletedWorkouts, id, now);
  });
}

function markCustomExerciseChanges(db, prev, now) {
  const prevMap = mapById(prev.customExercises);
  const nextMap = mapById(db.customExercises);

  Object.keys(nextMap).forEach((id) => {
    const next = nextMap[id];
    const old = prevMap[id];
    if (!old || !sameData(old, next)) {
      next.updatedAt = now;
      db.deletedCustomExercises = (db.deletedCustomExercises || []).filter((item) => item.id !== id);
    }
  });

  Object.keys(prevMap).forEach((id) => {
    if (!nextMap[id]) addTombstone(db.deletedCustomExercises, id, now);
  });
}

function saveDB(inputDB, options) {
  const opts = options || {};
  const db = normalizeDB(deepClone(inputDB));
  try {
    if (!opts.skipTouch) {
      const prev = getDB();
      const now = new Date().toISOString();

      if (!sameData(prev.settings, db.settings)) {
        db.settingsUpdatedAt = now;
      }

      if (!sameData(prev.activeWorkout, db.activeWorkout)) {
        db.activeWorkoutUpdatedAt = now;
        if (db.activeWorkout) db.activeWorkout.updatedAt = now;
      }

      if (!sameData(prev.profile, db.profile)) {
        db.profile.updatedAt = now;
      }

      markWorkoutChanges(db, prev, now);
      markCustomExerciseChanges(db, prev, now);
      db.updatedAt = now;
    }

    db.deletedWorkouts = pruneTombstones(db.deletedWorkouts);
    db.deletedCustomExercises = pruneTombstones(db.deletedCustomExercises);

    wx.setStorageSync(DB_KEY, db);
    if (!opts.skipNotify && changeHandler) {
      try {
        changeHandler(deepClone(db));
      } catch (e) {
        console.error('本地变更通知失败', e);
      }
    }
    return true;
  } catch (e) {
    console.error('保存本地数据失败', e);
    try {
      wx.showToast({ title: '保存失败，请检查存储空间', icon: 'none' });
    } catch (err) {}
    return false;
  }
}

function updateDB(mutator) {
  const db = getDB();
  mutator(db);
  saveDB(db);
  return db;
}

function updateSettings(patch) {
  return updateDB((db) => {
    db.settings = Object.assign({}, db.settings, patch || {});
  }).settings;
}

function setChangeHandler(handler) {
  changeHandler = typeof handler === 'function' ? handler : null;
}

function clearAll() {
  try {
    wx.removeStorageSync(DB_KEY);
    return true;
  } catch (e) {
    console.error('清空数据失败', e);
    return false;
  }
}

function uid(prefix) {
  return `${prefix || 'id'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = {
  DB_KEY,
  EPOCH,
  DEFAULT_SETTINGS,
  createDefaultDB,
  getDB,
  saveDB,
  updateDB,
  updateSettings,
  setChangeHandler,
  clearAll,
  uid,
  deepClone
};
