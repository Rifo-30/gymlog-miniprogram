const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const EPOCH = '1970-01-01T00:00:00.000Z';
const TOMBSTONE_DAYS = 90;

function timestamp(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function later(a, b) {
  return timestamp(a) >= timestamp(b) ? (a || EPOCH) : (b || EPOCH);
}

function mapById(items) {
  const map = {};
  (items || []).forEach((item) => {
    if (item && item.id) map[item.id] = item;
  });
  return map;
}

function mapTombstones(items) {
  const map = {};
  (items || []).forEach((item) => {
    if (!item || !item.id || !item.deletedAt) return;
    if (!map[item.id] || timestamp(item.deletedAt) > timestamp(map[item.id].deletedAt)) {
      map[item.id] = { id: item.id, deletedAt: item.deletedAt };
    }
  });
  return map;
}

function pruneTombstones(items) {
  const cutoff = Date.now() - TOMBSTONE_DAYS * 86400000;
  return (items || []).filter((item) => timestamp(item.deletedAt) >= cutoff);
}

function documentId(openid, id) {
  return `${openid}_${id}`;
}

async function fetchAll(collectionName, openid) {
  const collection = db.collection(collectionName);
  const result = [];
  const pageSize = 100;
  let skip = 0;

  while (true) {
    const res = await collection.where({ openid }).skip(skip).limit(pageSize).get();
    result.push(...(res.data || []));
    if (!res.data || res.data.length < pageSize) break;
    skip += pageSize;
    if (skip > 5000) break;
  }
  return result;
}

async function mergeCollection(options) {
  const {
    openid,
    collectionName,
    localItems,
    localTombstones,
    cloudDocs,
    nickName,
    displayName
  } = options;
  const localMap = mapById(localItems);
  const cloudMap = {};
  const cloudTombMap = {};

  (cloudDocs || []).forEach((doc) => {
    if (!doc || !doc.id) return;
    if (doc.deletedAt) {
      if (!cloudTombMap[doc.id] || timestamp(doc.deletedAt) > timestamp(cloudTombMap[doc.id].deletedAt)) {
        cloudTombMap[doc.id] = { id: doc.id, deletedAt: doc.deletedAt };
      }
    } else if (doc.data) {
      cloudMap[doc.id] = doc;
    }
  });

  const localTombMap = mapTombstones(localTombstones);
  const ids = new Set([
    ...Object.keys(localMap),
    ...Object.keys(cloudMap),
    ...Object.keys(localTombMap),
    ...Object.keys(cloudTombMap)
  ]);

  const mergedItems = [];
  const mergedTombstones = [];
  const writes = [];

  ids.forEach((id) => {
    const localItem = localMap[id] || null;
    const cloudDoc = cloudMap[id] || null;
    const localTomb = localTombMap[id] || null;
    const cloudTomb = cloudTombMap[id] || null;

    const localItemAt = localItem ? timestamp(localItem.updatedAt) : 0;
    const cloudItemAt = cloudDoc ? timestamp(cloudDoc.updatedAt) : 0;
    const localDeletedAt = localTomb ? timestamp(localTomb.deletedAt) : 0;
    const cloudDeletedAt = cloudTomb ? timestamp(cloudTomb.deletedAt) : 0;

    // A deletion wins only when it is at least as new as the newest copy.
    if (localDeletedAt && localDeletedAt >= Math.max(localItemAt, cloudItemAt, cloudDeletedAt)) {
      mergedTombstones.push({ id, deletedAt: localTomb.deletedAt });
      if (!cloudTomb || localDeletedAt > cloudDeletedAt) {
        writes.push({ id, deleted: true, deletedAt: localTomb.deletedAt });
      }
      return;
    }

    if (cloudDeletedAt && cloudDeletedAt >= Math.max(localItemAt, cloudItemAt, localDeletedAt)) {
      mergedTombstones.push({ id, deletedAt: cloudTomb.deletedAt });
      return;
    }

    if (localItem && (!cloudDoc || localItemAt >= cloudItemAt)) {
      mergedItems.push(localItem);
      if (!cloudDoc || localItemAt > cloudItemAt) {
        writes.push({ id, data: localItem });
      }
      return;
    }

    if (cloudDoc) {
      mergedItems.push(cloudDoc.data);
    }
  });

  // Batch writes so the first sync of a long training history does not
  // exceed the cloud function timeout.
  for (let start = 0; start < writes.length; start += 10) {
    const batch = writes.slice(start, start + 10);
    await Promise.all(batch.map((write) => {
      const ref = db.collection(collectionName).doc(documentId(openid, write.id));
      if (write.deleted) {
        return ref.set({
          data: {
            openid,
            id: write.id,
            nickName: nickName || '',
            displayName: displayName || '',
            updatedAt: write.deletedAt,
            deletedAt: write.deletedAt,
            data: null
          }
        });
      }
      return ref.set({
        data: {
          openid,
          id: write.id,
          updatedAt: write.data.updatedAt || EPOCH,
          deletedAt: '',
          data: write.data
        }
      });
    }));
  }

  return {
    items: mergedItems,
    tombstones: pruneTombstones(mergedTombstones)
  };
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, error: '无法获取微信身份' };

  try {
    const local = event.local || {};
    const now = new Date().toISOString();
    const profileRef = db.collection('gymlog_profiles').doc(OPENID);
    let profile = null;

    try {
      const profileResult = await profileRef.get();
      profile = profileResult.data || null;
    } catch (e) {
      profile = null;
    }

    const localSettingsAt = local.settingsUpdatedAt || EPOCH;
    const cloudSettingsAt = (profile && profile.settingsUpdatedAt) || EPOCH;
    const useLocalSettings = timestamp(localSettingsAt) >= timestamp(cloudSettingsAt);
    const settings = useLocalSettings
      ? (local.settings || (profile && profile.settings) || {})
      : (profile.settings || local.settings || {});
    const settingsUpdatedAt = later(localSettingsAt, cloudSettingsAt);

    const localActiveAt = local.activeWorkoutUpdatedAt || (local.activeWorkout && local.activeWorkout.updatedAt) || EPOCH;
    const cloudActiveAt = (profile && (profile.activeWorkoutUpdatedAt || (profile.activeWorkout && profile.activeWorkout.updatedAt))) || EPOCH;
    const useLocalActive = timestamp(localActiveAt) >= timestamp(cloudActiveAt);
    const activeWorkout = useLocalActive
      ? (local.activeWorkout || null)
      : (profile.activeWorkout || null);
    const activeWorkoutUpdatedAt = later(localActiveAt, cloudActiveAt);

    const localProfileAt = local.profileUpdatedAt || (local.profile && local.profile.updatedAt) || EPOCH;
    const cloudProfileAt = (profile && (profile.profileUpdatedAt || (profile.profile && profile.profile.updatedAt))) || EPOCH;
    const useLocalProfile = timestamp(localProfileAt) >= timestamp(cloudProfileAt);
    const userProfile = useLocalProfile
      ? (local.profile || null)
      : (profile.profile || null);
    const profileUpdatedAt = later(localProfileAt, cloudProfileAt);
    const nickName = (userProfile && userProfile.nickName) || '';
    const displayName = nickName
      ? `${nickName} · ${OPENID.slice(-4)}`
      : `用户 · ${OPENID.slice(-4)}`;
    const userProfileWithDisplay = userProfile
      ? Object.assign({}, userProfile, { displayName })
      : { displayName };

    const [workoutDocs, exerciseDocs] = await Promise.all([
      fetchAll('gymlog_workouts', OPENID),
      fetchAll('gymlog_exercises', OPENID)
    ]);

    const cloudWorkoutTombstones = (profile && profile.deletedWorkouts) || [];
    const cloudExerciseTombstones = (profile && profile.deletedCustomExercises) || [];

    const workouts = await mergeCollection({
      openid: OPENID,
      collectionName: 'gymlog_workouts',
      localItems: local.workouts || [],
      localTombstones: local.deletedWorkouts || [],
      cloudDocs: workoutDocs,
      nickName,
      displayName
    });

    const exercises = await mergeCollection({
      openid: OPENID,
      collectionName: 'gymlog_exercises',
      localItems: local.customExercises || [],
      localTombstones: local.deletedCustomExercises || [],
      cloudDocs: exerciseDocs,
      nickName,
      displayName
    });

    const mergedDeletedWorkouts = mapTombstones(
      workouts.tombstones.concat(cloudWorkoutTombstones)
    );
    const mergedDeletedExercises = mapTombstones(
      exercises.tombstones.concat(cloudExerciseTombstones)
    );

    const previousNickName = (profile && profile.profile && profile.profile.nickName) || '';
    if (previousNickName !== nickName) {
      try {
        await db.collection('gymlog_workouts').where({ openid: OPENID }).update({
          data: { nickName, displayName }
        });
      } catch (e) {
        console.error('failed to update workout nickname fields', e);
      }
    }

    await profileRef.set({
      data: {
        openid: OPENID,
        nickName,
        displayName,
        settings,
        settingsUpdatedAt,
        activeWorkout,
        activeWorkoutUpdatedAt,
        profile: userProfileWithDisplay,
        profileUpdatedAt,
        deletedWorkouts: Object.keys(mergedDeletedWorkouts).map((key) => mergedDeletedWorkouts[key]),
        deletedCustomExercises: Object.keys(mergedDeletedExercises).map((key) => mergedDeletedExercises[key]),
        updatedAt: now
      }
    });

    return {
      ok: true,
      openid: OPENID,
      syncedAt: now,
      data: {
        version: 2,
        settings,
        settingsUpdatedAt,
        activeWorkout,
        activeWorkoutUpdatedAt,
        profile: userProfileWithDisplay,
        profileUpdatedAt,
        workouts: workouts.items,
        customExercises: exercises.items,
        deletedWorkouts: Object.keys(mergedDeletedWorkouts).map((key) => mergedDeletedWorkouts[key]),
        deletedCustomExercises: Object.keys(mergedDeletedExercises).map((key) => mergedDeletedExercises[key]),
        updatedAt: local.updatedAt || EPOCH
      }
    };
  } catch (e) {
    console.error('gymlog sync failed', e);
    return { ok: false, error: e.message || 'sync failed' };
  }
};
