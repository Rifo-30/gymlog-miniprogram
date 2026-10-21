const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { ok: false, error: '无法获取微信身份' };
  }
  try {
    await db.collection('gymlog_workouts').where({ openid: OPENID }).remove();
    await db.collection('gymlog_exercises').where({ openid: OPENID }).remove();
    try {
      await db.collection('gymlog_profiles').doc(OPENID).remove();
    } catch (e) {
      // Profile may not exist yet.
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'cloud clear failed' };
  }
};
