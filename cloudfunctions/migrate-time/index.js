const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(Z|[+-]\d{2}:\d{2})$/;
const COLLECTIONS = ['gymlog_profiles', 'gymlog_workouts', 'gymlog_exercises'];

function toChinaIso(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Date(date.getTime() + CHINA_OFFSET_MS)
    .toISOString()
    .replace('Z', '+08:00');
}

function normalizeTimesDeep(value, key) {
  if (key === '_id') return value;
  if (Array.isArray(value)) return value.map((item) => normalizeTimesDeep(item));
  if (value && typeof value === 'object') {
    const next = {};
    Object.keys(value).forEach((childKey) => {
      next[childKey] = normalizeTimesDeep(value[childKey], childKey);
    });
    return next;
  }
  if (typeof value === 'string' && ISO_PATTERN.test(value)) {
    return toChinaIso(value);
  }
  return value;
}

async function fetchAll(collectionName) {
  const collection = db.collection(collectionName);
  const result = [];
  let skip = 0;
  const pageSize = 100;
  while (true) {
    const res = await collection.skip(skip).limit(pageSize).get();
    result.push(...(res.data || []));
    if (!res.data || res.data.length < pageSize) break;
    skip += pageSize;
    if (skip > 5000) break;
  }
  return result;
}

async function migrateCollection(name) {
  const docs = await fetchAll(name);
  let changed = 0;
  for (const doc of docs) {
    const normalized = normalizeTimesDeep(doc);
    const before = Object.assign({}, doc);
    delete before._id;
    const after = Object.assign({}, normalized);
    delete after._id;
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    await db.collection(name).doc(doc._id).set({ data: after });
    changed += 1;
  }
  return { collection: name, total: docs.length, changed };
}

exports.main = async () => {
  try {
    const results = [];
    for (const name of COLLECTIONS) {
      results.push(await migrateCollection(name));
    }
    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: e.message || 'time migration failed' };
  }
};
