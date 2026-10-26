const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const COLLECTION = 'gymlog_feedback';
const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;
const MAX_CONTENT_LENGTH = 1000;
const MIN_CONTENT_LENGTH = 5;

function toChinaIso(value) {
  const date = value === undefined ? new Date() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() + CHINA_OFFSET_MS)
    .toISOString()
    .replace('Z', '+08:00');
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, error: '无法获取微信身份' };

  const category = String(event.category || '其他').trim().slice(0, 20) || '其他';
  const content = String(event.content || '').trim();
  const contact = String(event.contact || '').trim().slice(0, 100);
  if (content.length < MIN_CONTENT_LENGTH) {
    return { ok: false, error: '建议内容至少需要 5 个字' };
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return { ok: false, error: '建议内容不能超过 1000 个字' };
  }

  try {
    const now = Date.now();
    let profile = null;
    try {
      const profileResult = await db.collection('gymlog_profiles').doc(OPENID).get();
      profile = profileResult.data || null;
    } catch (e) {
      profile = null;
    }

    const recent = await db.collection(COLLECTION).where({
      openid: OPENID,
      createdAtMs: _.gte(now - 60 * 1000)
    }).limit(1).get();
    if (recent.data && recent.data.length) {
      return { ok: false, error: '提交太频繁，请稍后再试' };
    }

    const result = await db.collection(COLLECTION).add({
      data: {
        openid: OPENID,
        nickName: (profile && profile.nickName) || event.nickName || '',
        displayName: (profile && profile.displayName) || event.displayName || '',
        category,
        content,
        contact,
        appVersion: String(event.appVersion || ''),
        status: 'pending',
        createdAt: toChinaIso(now),
        createdAtMs: now
      }
    });

    return { ok: true, id: result._id };
  } catch (e) {
    console.error('submit feedback failed', e);
    return { ok: false, error: e.message || '提交失败，请稍后重试' };
  }
};
