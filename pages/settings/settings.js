const app = getApp();
const storage = require('../../utils/storage');
const workoutUtil = require('../../utils/workout');
const exportUtil = require('../../utils/export');
const demo = require('../../utils/demo');
const sync = require('../../utils/sync');
const dateUtil = require('../../utils/date');

Page({
  data: {
    theme: 'dark',
    settings: {},
    stats: {
      workouts: 0,
      sets: 0
    },
    unitOptions: ['kg', 'lb'],
    unitIndex: 0,
    restOptions: [30, 45, 60, 75, 90, 120, 150, 180, 240],
    restIndex: 4,
    themeOptions: [
      { value: 'dark', label: '深色' },
      { value: 'light', label: '浅色' },
      { value: 'system', label: '跟随系统' }
    ],
    themeIndex: 0,
    cloudStatus: 'idle',
    cloudStatusLabel: '本地模式',
    cloudStatusDesc: '尚未连接云端',
    cloudStatusClass: 'neutral',
    openidShort: '',
    lastSyncLabel: '尚未同步',
    profile: {
      nickName: '',
      avatarUrl: '',
      avatarFileId: '',
      heightCm: 0,
      weightKg: 0
    },
    profileMetaLabel: '',
    displayAvatarUrl: '',
    showProfileEditor: false,
    draftProfile: {
      nickName: '',
      avatarUrl: '',
      avatarFileId: '',
      avatarLocalPath: '',
      heightCm: '',
      weightKg: ''
    }
  },

  onShow() {
    this.load();
    if (this._unsubscribeSync) this._unsubscribeSync();
    this._unsubscribeSync = sync.onStatus((state) => this.applyCloudState(state));
  },

  onHide() {
    if (this._unsubscribeSync) {
      this._unsubscribeSync();
      this._unsubscribeSync = null;
    }
  },

  onUnload() {
    if (this._unsubscribeSync) {
      this._unsubscribeSync();
      this._unsubscribeSync = null;
    }
  },

  onPullDownRefresh() {
    this.load();
    wx.stopPullDownRefresh();
  },

  applyCloudState(state) {
    const statusMap = {
      idle: { label: '本地模式', desc: '尚未连接云端', cls: 'neutral' },
      loggingIn: { label: '正在登录', desc: '使用微信身份连接云开发', cls: 'pending' },
      loggedIn: { label: '已登录', desc: '准备同步数据', cls: 'pending' },
      syncing: { label: '正在同步', desc: '正在合并本机与云端数据', cls: 'pending' },
      synced: { label: '云端已同步', desc: '本机和云端数据已合并', cls: 'success' },
      pending: { label: '等待同步', desc: '本机有新记录，稍后自动同步', cls: 'pending' },
      error: { label: '同步失败', desc: state.error || '请检查云环境和云函数配置', cls: 'error' },
      unavailable: { label: '本地模式', desc: '当前环境不支持云开发', cls: 'neutral' }
    };
    const info = statusMap[state.status] || statusMap.idle;
    const openid = state.openid || '';
    this.setData({
      cloudStatus: state.status,
      cloudStatusLabel: info.label,
      cloudStatusDesc: info.desc,
      cloudStatusClass: info.cls,
      openidShort: openid ? `${openid.slice(0, 6)}...${openid.slice(-4)}` : '',
      lastSyncLabel: state.lastSyncAt
        ? `${dateUtil.formatMonthDay(state.lastSyncAt)} ${dateUtil.formatTime(state.lastSyncAt)}`
        : '尚未同步'
    });
  },

  syncNow() {
    if (this.data.cloudStatus === 'syncing') return;
    wx.showLoading({ title: '正在同步', mask: true });
    sync.syncNow().then(() => {
      wx.hideLoading();
      wx.showToast({ title: '同步完成', icon: 'success' });
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '同步失败，请检查云配置', icon: 'none' });
    });
  },

  load() {
    app.applyTheme(this);
    const db = storage.getDB();
    const completed = workoutUtil.getCompletedWorkouts(db.workouts);
    const totalSets = completed.reduce((sum, workout) => sum + workoutUtil.countCompletedSets(workout), 0);
    const unitIndex = Math.max(0, this.data.unitOptions.indexOf(db.settings.unit || 'kg'));
    const restIndex = Math.max(0, this.data.restOptions.indexOf(Number(db.settings.restSeconds) || 90));
    const themeIndex = Math.max(0, this.data.themeOptions.findIndex((item) => item.value === (db.settings.theme || 'dark')));
    const profile = Object.assign({
      nickName: '',
      avatarUrl: '',
      avatarFileId: '',
      heightCm: 0,
      weightKg: 0
    }, db.profile || {});
    const profileMeta = [];
    if (Number(profile.heightCm) > 0) profileMeta.push(`${profile.heightCm} cm`);
    if (Number(profile.weightKg) > 0) profileMeta.push(`${profile.weightKg} kg`);
    this.setData({
      settings: db.settings,
      profile,
      profileMetaLabel: profileMeta.join(' · '),
      stats: {
        workouts: completed.length,
        sets: totalSets
      },
      unitIndex,
      restIndex,
      themeIndex
    });
    sync.resolveAvatarUrl(profile).then((url) => {
      this.setData({ displayAvatarUrl: url || '' });
    }).catch(() => {
      this.setData({ displayAvatarUrl: '' });
    });
  },

  openProfileEditor() {
    const profile = this.data.profile || {};
    this.setData({
      showProfileEditor: true,
      draftProfile: {
        nickName: profile.nickName || '',
        avatarUrl: this.data.displayAvatarUrl || profile.avatarUrl || '',
        avatarFileId: profile.avatarFileId || '',
        avatarLocalPath: '',
        heightCm: Number(profile.heightCm) > 0 ? String(profile.heightCm) : '',
        weightKg: Number(profile.weightKg) > 0 ? String(profile.weightKg) : ''
      }
    });
  },

  closeProfileEditor() {
    this.setData({ showProfileEditor: false });
  },

  noop() {},

  onNicknameInput(e) {
    this.setData({ 'draftProfile.nickName': e.detail.value });
  },

  onProfileFieldInput(e) {
    const field = e.currentTarget.dataset.field;
    if (field === 'heightCm' || field === 'weightKg') {
      this.setData({ [`draftProfile.${field}`]: e.detail.value });
    }
  },

  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl;
    if (!avatarUrl) return;
    this.setData({
      'draftProfile.avatarUrl': avatarUrl,
      'draftProfile.avatarLocalPath': avatarUrl
    });
  },

  useWechatProfile() {
    if (typeof wx.getUserProfile !== 'function') {
      wx.showToast({ title: '请手动选择头像和昵称', icon: 'none' });
      return;
    }
    wx.getUserProfile({
      desc: '用于展示训练档案',
      success: (res) => {
        const info = res.userInfo || {};
        if (!info.nickName && !info.avatarUrl) {
          wx.showToast({ title: '请手动选择头像和昵称', icon: 'none' });
          return;
        }
        this.setData({
          'draftProfile.nickName': info.nickName || this.data.draftProfile.nickName,
          'draftProfile.avatarUrl': info.avatarUrl || this.data.draftProfile.avatarUrl,
          'draftProfile.avatarLocalPath': ''
        });
      },
      fail: () => {
        wx.showToast({ title: '未获取到微信资料', icon: 'none' });
      }
    });
  },

  async saveProfile() {
    const draft = this.data.draftProfile;
    const nickName = String(draft.nickName || '').trim() || '微信用户';

    wx.showLoading({ title: '保存资料', mask: true });
    let avatarFileId = draft.avatarFileId || '';
    let avatarUrl = draft.avatarFileId || draft.avatarUrl || '';
    let uploadFailed = false;
    const needsUpload = !!draft.avatarLocalPath
      || (/^https?:/i.test(draft.avatarUrl) && draft.avatarUrl !== (this.data.profile.avatarUrl || ''));

    if (needsUpload) {
      try {
        let filePath = draft.avatarLocalPath;
        if (!filePath && /^https?:/i.test(draft.avatarUrl)) {
          const download = await new Promise((resolve, reject) => {
            wx.downloadFile({ url: draft.avatarUrl, success: resolve, fail: reject });
          });
          filePath = download.tempFilePath;
        }
        avatarFileId = await sync.uploadAvatar(filePath);
        avatarUrl = avatarFileId;
      } catch (e) {
        uploadFailed = true;
        avatarFileId = this.data.profile.avatarFileId || '';
        avatarUrl = this.data.profile.avatarUrl || '';
      }
    }

    const heightCm = Math.max(0, parseFloat(draft.heightCm) || 0);
    const weightKg = Math.max(0, parseFloat(draft.weightKg) || 0);
    const db = storage.getDB();
    db.profile = {
      nickName,
      avatarUrl,
      avatarFileId,
      heightCm,
      weightKg
    };
    storage.saveDB(db);
    wx.hideLoading();
    this.setData({ showProfileEditor: false });
    this.load();
    wx.showToast({
      title: uploadFailed ? '昵称已保存，头像上传失败' : '资料已保存',
      icon: uploadFailed ? 'none' : 'success'
    });
  },

  changeUnit(e) {
    const index = Number(e.detail.value) || 0;
    const unit = this.data.unitOptions[index];
    const db = storage.getDB();
    db.settings.unit = unit;
    storage.saveDB(db);
    this.setData({ unitIndex: index, 'settings.unit': unit });
    wx.showToast({ title: `已切换为 ${unit}`, icon: 'none' });
  },

  changeRest(e) {
    const index = Number(e.detail.value) || 0;
    const seconds = this.data.restOptions[index];
    const db = storage.getDB();
    db.settings.restSeconds = seconds;
    storage.saveDB(db);
    this.setData({ restIndex: index, 'settings.restSeconds': seconds });
    wx.showToast({ title: `默认休息 ${seconds} 秒`, icon: 'none' });
  },

  adjustGoal(e) {
    const delta = Number(e.currentTarget.dataset.delta) || 0;
    const db = storage.getDB();
    const next = Math.max(1, Math.min(7, (Number(db.settings.weeklyGoal) || 3) + delta));
    db.settings.weeklyGoal = next;
    storage.saveDB(db);
    this.setData({ 'settings.weeklyGoal': next });
  },

  changeTheme(e) {
    const index = Number(e.detail.value) || 0;
    const db = storage.getDB();
    db.settings.theme = this.data.themeOptions[index].value;
    storage.saveDB(db);
    app.refreshTheme();
    app.applyTheme(this);
    this.load();
  },

  exportJSON() {
    const db = storage.getDB();
    exportUtil.copyText(exportUtil.exportJSON(db), 'JSON 已复制');
  },

  exportCSV() {
    const db = storage.getDB();
    exportUtil.copyText(exportUtil.exportCSV(db), 'CSV 已复制');
  },

  loadDemo() {
    wx.showModal({
      title: '加载演示数据？',
      content: '会用几条示例训练覆盖当前记录，方便查看历史、统计和 PR 效果。',
      confirmText: '加载',
      success: (res) => {
        if (!res.confirm) return;
        demo.seedDemoData();
        wx.showToast({ title: '演示数据已加载', icon: 'success' });
        wx.switchTab({ url: '/pages/home/home' });
      }
    });
  },

  clearData() {
    wx.showModal({
      title: '清空全部数据？',
      content: '训练记录和设置都会被删除，且无法恢复。云端已同步的数据也会一起清除。',
      confirmText: '清空',
      confirmColor: '#FF7474',
      success: async (res) => {
        if (!res.confirm) return;
        const cloudState = sync.getState();
        if (cloudState.hasCloud && cloudState.openid && cloudState.status !== 'unavailable') {
          wx.showLoading({ title: '清除云端数据', mask: true });
          try {
            await sync.clearCloudData();
          } catch (e) {
            wx.hideLoading();
            wx.showModal({
              title: '云端清除失败',
              content: '可以取消并稍后重试，也可以只清空本机数据。仅清空本机时，云端旧数据可能在下次同步时回来。',
              cancelText: '取消',
              confirmText: '仅清空本机',
              confirmColor: '#FF7474',
              success: (modalRes) => {
                if (!modalRes.confirm) return;
                storage.clearAll();
                wx.reLaunch({ url: '/pages/onboarding/onboarding' });
              }
            });
            return;
          }
          wx.hideLoading();
        }
        storage.clearAll();
        wx.reLaunch({ url: '/pages/onboarding/onboarding' });
      }
    });
  },

  showPrivacy() {
    wx.showModal({
      title: '数据与隐私',
      content: '当前版本采用本地优先 + 云同步模式：训练记录会保存到微信云开发数据库。你主动选择的微信头像和昵称也会保存到云端，用于在你的设备间同步展示。你可以随时复制 JSON/CSV 导出。正式发布前请补充隐私政策和用户协议。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  showAbout() {
    wx.showModal({
      title: '关于练记',
      content: '练记 v1.0 · 小程序 MVP\n一个极简、专注的训练日志。',
      showCancel: false,
      confirmText: '知道了'
    });
  }
});
