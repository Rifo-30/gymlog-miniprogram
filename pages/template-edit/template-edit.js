const app = getApp();
const storage = require('../../utils/storage');
const templateUtil = require('../../utils/templates');

Page({
  data: {
    theme: 'dark',
    isEditing: false,
    name: '',
    note: '',
    exercises: []
  },

  onLoad(options) {
    app.applyTheme(this);
    this.templateId = options.id || '';
    wx.setNavigationBarTitle({ title: this.templateId ? '编辑模板' : '新建模板' });
    this.load();
  },

  load() {
    if (!this.templateId) {
      this.setData({ isEditing: false });
      return;
    }
    const template = templateUtil.findTemplate(storage.getDB().templates, this.templateId);
    if (!template) {
      wx.showToast({ title: '模板不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
    this.setData({
      isEditing: true,
      name: template.name,
      note: template.note || '',
      exercises: template.exercises
    });
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value });
  },

  addExercise() {
    wx.navigateTo({
      url: '/pages/exercise-picker/exercise-picker',
      events: {
        selectExercise: (exercise) => this.addExerciseToTemplate(exercise)
      }
    });
  },

  addExerciseToTemplate(exercise) {
    if (!exercise || !exercise.id) return;
    if (this.data.exercises.some((item) => item.exerciseId === exercise.id)) {
      wx.showToast({ title: '这个动作已经在模板里', icon: 'none' });
      return;
    }
    const item = templateUtil.normalizeExercise({
      exerciseId: exercise.id,
      name: exercise.name,
      muscle: exercise.muscle,
      equipment: exercise.equipment,
      type: exercise.type,
      cardioType: exercise.cardioType || ''
    });
    this.setData({
      exercises: this.data.exercises.concat([item])
    }, () => wx.pageScrollTo({ scrollTop: 99999, duration: 250 }));
  },

  onTargetInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    const field = e.currentTarget.dataset.field;
    const allowed = ['targetSets', 'targetReps', 'targetDurationMin', 'restSeconds'];
    if (allowed.indexOf(field) < 0) return;
    const exercises = this.data.exercises.slice();
    if (!exercises[index]) return;
    const item = Object.assign({}, exercises[index]);
    item[field] = Math.max(0, parseInt(e.detail.value, 10) || 0);
    exercises[index] = item;
    this.setData({ exercises });
  },

  openExerciseMenu(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.exercises[index];
    if (!item) return;
    wx.showActionSheet({
      itemList: ['上移', '下移', '删除动作'],
      success: (res) => {
        if (res.tapIndex === 0) this.moveExercise(index, -1);
        if (res.tapIndex === 1) this.moveExercise(index, 1);
        if (res.tapIndex === 2) this.removeExercise(index);
      }
    });
  },

  moveExercise(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= this.data.exercises.length) {
      wx.showToast({ title: '已经到边了', icon: 'none' });
      return;
    }
    const exercises = this.data.exercises.slice();
    const temp = exercises[index];
    exercises[index] = exercises[target];
    exercises[target] = temp;
    this.setData({ exercises });
  },

  removeExercise(index) {
    const item = this.data.exercises[index];
    if (!item) return;
    wx.showModal({
      title: `移除“${item.name}”？`,
      content: '只从模板中移除，不会影响历史训练。',
      confirmText: '移除',
      confirmColor: '#FF7474',
      success: (res) => {
        if (!res.confirm) return;
        const exercises = this.data.exercises.slice();
        exercises.splice(index, 1);
        this.setData({ exercises });
      }
    });
  },

  saveTemplate() {
    const name = String(this.data.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请填写模板名称', icon: 'none' });
      return;
    }
    if (!this.data.exercises.length) {
      wx.showToast({ title: '至少添加一个动作', icon: 'none' });
      return;
    }
    const db = storage.getDB();
    const exercises = this.data.exercises.map((item) => templateUtil.normalizeExercise(item));
    if (this.templateId) {
      const existing = templateUtil.findTemplate(db.templates, this.templateId);
      if (!existing) {
        wx.showToast({ title: '模板不存在', icon: 'none' });
        return;
      }
      const updated = templateUtil.normalizeTemplate(Object.assign({}, existing, {
        name,
        note: this.data.note,
        exercises
      }));
      db.templates = (db.templates || []).map((item) => (
        item.id === this.templateId ? updated : item
      ));
    } else {
      const template = templateUtil.createTemplate(name, exercises, this.data.note);
      db.templates = [template].concat(db.templates || []);
    }
    storage.saveDB(db);
    wx.showToast({ title: '模板已保存', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 350);
  }
});
