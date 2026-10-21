const app = getApp();
const storage = require('../../utils/storage');

Page({
  data: {
    theme: 'dark',
    settings: {
      unit: 'kg',
      goal: '增肌',
      experience: '新手'
    },
    weeklyGoal: 3,
    goals: ['增肌', '减脂', '提升力量', '保持健康'],
    experiences: ['新手', '中级', '进阶']
  },

  onLoad() {
    app.applyTheme(this);
    const db = storage.getDB();
    if (db.settings.onboarded) {
      wx.switchTab({ url: '/pages/home/home' });
      return;
    }
    this.setData({
      settings: {
        unit: db.settings.unit || 'kg',
        goal: db.settings.goal || '增肌',
        experience: db.settings.experience || '新手'
      },
      weeklyGoal: db.settings.weeklyGoal || 3
    });
  },

  selectUnit(e) {
    this.setData({
      'settings.unit': e.currentTarget.dataset.value
    });
  },

  selectGoal(e) {
    this.setData({
      'settings.goal': e.currentTarget.dataset.value
    });
  },

  selectExperience(e) {
    this.setData({
      'settings.experience': e.currentTarget.dataset.value
    });
  },

  adjustGoal(e) {
    const delta = Number(e.currentTarget.dataset.delta) || 0;
    const next = Math.max(1, Math.min(7, this.data.weeklyGoal + delta));
    this.setData({ weeklyGoal: next });
  },

  finish() {
    const db = storage.getDB();
    db.settings = Object.assign({}, db.settings, this.data.settings, {
      weeklyGoal: this.data.weeklyGoal,
      onboarded: true
    });
    storage.saveDB(db);
    app.refreshTheme();
    wx.switchTab({ url: '/pages/home/home' });
  },

  skip() {
    const db = storage.getDB();
    db.settings.onboarded = true;
    storage.saveDB(db);
    app.refreshTheme();
    wx.switchTab({ url: '/pages/home/home' });
  }
});
