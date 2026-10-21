const storage = require('./utils/storage');
const themeUtil = require('./utils/theme');
const sync = require('./utils/sync');

App({
  globalData: {
    theme: 'dark',
    themePreference: 'dark',
    cloudState: null,
    cloudReady: null
  },

  onLaunch() {
    const db = storage.getDB();
    this.globalData.themePreference = db.settings.theme || 'dark';
    this.globalData.theme = themeUtil.resolveTheme(this.globalData.themePreference);

    storage.setChangeHandler(() => sync.schedulePush());
    sync.onStatus((cloudState) => {
      this.globalData.cloudState = cloudState;
    });
    sync.onData(() => {
      this.refreshVisiblePage();
    });
    this.globalData.cloudReady = sync.initialize();
  },

  refreshVisiblePage() {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1];
    if (!page) return;
    const route = page.route || '';
    // Do not overwrite an active workout while the user is editing sets.
    if (route === 'pages/workout/workout' || route === 'pages/exercise-picker/exercise-picker') return;
    if (typeof page.refresh === 'function') {
      page.refresh();
    } else if (typeof page.load === 'function') {
      page.load();
    }
  },

  onShow() {
    const db = storage.getDB();
    this.globalData.themePreference = db.settings.theme || 'dark';
    this.globalData.theme = themeUtil.resolveTheme(this.globalData.themePreference);
    if (this.globalData.cloudReady) {
      this.globalData.cloudReady = sync.initialize();
    }
  },

  refreshTheme() {
    const db = storage.getDB();
    this.globalData.themePreference = db.settings.theme || 'dark';
    this.globalData.theme = themeUtil.resolveTheme(this.globalData.themePreference);
    return this.globalData.theme;
  },

  applyTheme(page) {
    const themeName = this.globalData.theme || themeUtil.resolveTheme(this.globalData.themePreference);
    const palette = themeUtil.getPalette(themeName);
    if (page && page.setData) {
      page.setData({ theme: themeName });
    }
    wx.setNavigationBarColor({
      frontColor: palette.navFront,
      backgroundColor: palette.navBg,
      animation: { duration: 0 },
      fail: () => {}
    });
    wx.setTabBarStyle({
      color: palette.tabColor,
      selectedColor: palette.tabSelected,
      backgroundColor: palette.tabBg,
      borderStyle: palette.tabBorder,
      fail: () => {}
    });
    return themeName;
  }
});
