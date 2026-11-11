const app = getApp();
const storage = require('../../utils/storage');
const templateUtil = require('../../utils/templates');
const workoutUtil = require('../../utils/workout');

Page({
  data: {
    theme: 'dark',
    templates: [],
    count: 0,
    lastWorkoutName: ''
  },

  onShow() {
    app.applyTheme(this);
    this.load();
  },

  onPullDownRefresh() {
    this.load();
    wx.stopPullDownRefresh();
  },

  load() {
    const db = storage.getDB();
    const completed = workoutUtil.getCompletedWorkouts(db.workouts);
    const templates = templateUtil.getTemplates(db.templates).map((template) => {
      const strengthSets = (template.exercises || []).reduce((sum, exercise) => (
        sum + (exercise.type === 'cardio' ? 0 : Number(exercise.targetSets) || 0)
      ), 0);
      const cardioCount = (template.exercises || []).filter((exercise) => exercise.type === 'cardio').length;
      return Object.assign({}, template, {
        exerciseCount: template.exercises.length,
        preview: template.exercises.slice(0, 4).map((exercise) => exercise.name).join(' · '),
        metaLabel: [
          `${template.exercises.length} 个动作`,
          strengthSets ? `${strengthSets} 组目标` : '',
          cardioCount ? `${cardioCount} 项有氧` : ''
        ].filter(Boolean).join(' · ')
      });
    });
    this.setData({
      templates,
      count: templates.length,
      lastWorkoutName: completed[0] ? (completed[0].name || '上次训练') : ''
    });
  },

  createTemplate() {
    wx.navigateTo({ url: '/pages/template-edit/template-edit' });
  },

  editTemplate(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/template-edit/template-edit?id=${id}` });
  },

  startTemplate(e) {
    const id = e.currentTarget.dataset.id;
    const db = storage.getDB();
    if (db.activeWorkout) {
      wx.navigateTo({ url: '/pages/workout/workout' });
      return;
    }
    const template = templateUtil.findTemplate(db.templates, id);
    if (!template) {
      wx.showToast({ title: '模板不存在', icon: 'none' });
      return;
    }
    const workout = templateUtil.createWorkoutFromTemplate(template, db);
    if (!workout.exercises.length) {
      wx.showToast({ title: '模板里还没有动作', icon: 'none' });
      return;
    }
    db.activeWorkout = workout;
    storage.saveDB(db);
    wx.navigateTo({ url: '/pages/workout/workout' });
  },

  removeTemplate(e) {
    const id = e.currentTarget.dataset.id;
    const template = templateUtil.findTemplate(storage.getDB().templates, id);
    if (!template) return;
    wx.showModal({
      title: `删除“${template.name}”？`,
      content: '删除模板不会影响已经完成的训练记录。',
      confirmText: '删除',
      confirmColor: '#FF7474',
      success: (res) => {
        if (!res.confirm) return;
        const db = storage.getDB();
        db.templates = (db.templates || []).filter((item) => item.id !== id);
        storage.saveDB(db);
        this.load();
        wx.showToast({ title: '模板已删除', icon: 'none' });
      }
    });
  },

  saveLastWorkout() {
    const db = storage.getDB();
    const completed = workoutUtil.getCompletedWorkouts(db.workouts);
    if (!completed.length) {
      wx.showToast({ title: '完成一次训练后即可生成模板', icon: 'none' });
      return;
    }
    let template = templateUtil.fromWorkout(completed[0]);
    if (!template.exercises.length) {
      wx.showToast({ title: '上次训练里没有动作', icon: 'none' });
      return;
    }
    const names = {};
    (db.templates || []).forEach((item) => { names[item.name] = true; });
    if (names[template.name]) {
      let index = 2;
      const base = template.name;
      while (names[`${base} ${index}`]) index += 1;
      template = Object.assign({}, template, { name: `${base} ${index}` });
    }
    db.templates = [template].concat(db.templates || []);
    storage.saveDB(db);
    this.load();
    wx.showToast({ title: '已保存为模板', icon: 'success' });
  }
});
