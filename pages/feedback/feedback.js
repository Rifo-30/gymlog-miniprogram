const app = getApp();
const storage = require('../../utils/storage');
const cloud = require('../../utils/cloud');

Page({
  data: {
    theme: 'dark',
    categories: ['功能建议', '问题反馈', '训练体验', '其他'],
    category: '功能建议',
    content: '',
    contentLength: 0,
    contact: '',
    submitting: false
  },

  onLoad() {
    app.applyTheme(this);
  },

  onShow() {
    app.applyTheme(this);
  },

  selectCategory(e) {
    this.setData({ category: e.currentTarget.dataset.value });
  },

  onContentInput(e) {
    const content = e.detail.value;
    this.setData({
      content,
      contentLength: content.length
    });
  },

  onContactInput(e) {
    this.setData({ contact: e.detail.value });
  },

  submitFeedback() {
    if (this.data.submitting) return;
    const content = String(this.data.content || '').trim();
    if (content.length < 5) {
      wx.showToast({ title: '请至少填写 5 个字', icon: 'none' });
      return;
    }
    if (!cloud.available()) {
      wx.showToast({ title: '云端未连接，暂时无法提交', icon: 'none' });
      return;
    }
    const db = storage.getDB();
    const profile = db.profile || {};
    this.setData({ submitting: true });
    cloud.callFunction('submit-feedback', {
      category: this.data.category,
      content,
      contact: String(this.data.contact || '').trim(),
      nickName: profile.nickName || '',
      displayName: profile.displayName || '',
      appVersion: '1.0.0'
    }).then((result) => {
      this.setData({ submitting: false });
      if (!result || !result.ok) {
        wx.showToast({ title: (result && result.error) || '提交失败，请稍后重试', icon: 'none' });
        return;
      }
      wx.showToast({ title: '建议已提交', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 700);
    }).catch(() => {
      this.setData({ submitting: false });
      wx.showToast({ title: '提交失败，请检查云环境', icon: 'none' });
    });
  }
});
