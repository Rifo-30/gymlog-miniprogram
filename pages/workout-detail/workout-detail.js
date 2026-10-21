const app = getApp();
const storage = require('../../utils/storage');
const workoutUtil = require('../../utils/workout');
const dateUtil = require('../../utils/date');
const format = require('../../utils/format');
const cardioUtil = require('../../utils/cardio');

Page({
  data: {
    theme: 'dark',
    workout: null,
    isSummary: false,
    unit: 'kg',
    stats: {
      durationLabel: '—',
      sets: 0,
      volumeLabel: '0 kg',
      exerciseCount: 0
    },
    dateLabel: '',
    prs: [],
    exercises: []
  },

  onLoad(options) {
    this.workoutId = options.id || '';
    this.setData({ isSummary: options.summary === '1' });
  },

  onShow() {
    app.applyTheme(this);
    this.load();
  },

  load() {
    const db = storage.getDB();
    const workout = (db.workouts || []).find((item) => item.id === this.workoutId);
    if (!workout) {
      wx.showToast({ title: '训练记录不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
    const unit = db.settings.unit || 'kg';
    const stats = workoutUtil.workoutStats(workout, unit);
    const exercises = (workout.exercises || []).map((exercise) => {
      const isCardio = cardioUtil.isCardio(exercise);
      const cardioType = cardioUtil.typeFromExercise(exercise);
      return {
        id: exercise.id,
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        muscle: exercise.muscle,
        equipment: exercise.equipment,
        note: exercise.note || '',
        type: exercise.type,
        isCardio,
        cardio: isCardio ? cardioUtil.decorate(exercise.cardio, cardioType) : null,
        cardioMeta: isCardio ? cardioUtil.getMeta(cardioType) : null,
        setCount: isCardio ? 0 : (exercise.sets || []).filter((set) => set.completed).length,
        sets: isCardio ? [] : (exercise.sets || []).filter((set) => set.completed).map((set, index) => ({
          id: set.id,
          index: index + 1,
          line: format.formatSetLine(set, exercise.type, unit)
        }))
      };
    });

    let prs = [];
    if (this.data.isSummary) {
      prs = workoutUtil.computePRs(workout, db.workouts).map((pr) => ({
        exerciseId: pr.exerciseId,
        exerciseName: pr.exerciseName,
        label: pr.label,
        displayValue: pr.type === 'weight_reps'
          ? format.formatWeight(pr.valueKg, unit)
          : pr.value,
        detail: format.formatSetLine(pr.set, pr.type, unit)
      }));
    }

    this.setData({
      workout,
      unit,
      stats,
      dateLabel: `${dateUtil.formatDateLabel(workout.endedAt || workout.startedAt)} · ${dateUtil.formatTime(workout.startedAt)}`,
      prs,
      exercises
    });
  },

  editWorkout() {
    wx.navigateTo({
      url: `/pages/workout/workout?workoutId=${this.workoutId}&edit=1`
    });
  },

  copyWorkout() {
    const db = storage.getDB();
    if (db.activeWorkout) {
      wx.showToast({ title: '已有进行中的训练', icon: 'none' });
      return;
    }
    const workout = (db.workouts || []).find((item) => item.id === this.workoutId);
    if (!workout) return;
    db.activeWorkout = workoutUtil.duplicateWorkout(workout);
    storage.saveDB(db);
    wx.navigateTo({ url: '/pages/workout/workout' });
  },

  deleteWorkout() {
    wx.showModal({
      title: '删除这次训练？',
      content: '删除后，相关统计和 PR 会一起更新。',
      confirmText: '删除',
      confirmColor: '#FF7474',
      success: (res) => {
        if (!res.confirm) return;
        const db = storage.getDB();
        db.workouts = (db.workouts || []).filter((item) => item.id !== this.workoutId);
        storage.saveDB(db);
        wx.showToast({ title: '已删除', icon: 'success' });
        if (this.data.isSummary) {
          wx.switchTab({ url: '/pages/home/home' });
        } else {
          wx.switchTab({ url: '/pages/history/history' });
        }
      }
    });
  },

  openExercise(e) {
    const id = e.currentTarget.dataset.id;
    this.openExerciseById(id);
  },

  openExerciseById(id) {
    wx.navigateTo({ url: `/pages/exercise-detail/exercise-detail?id=${id}` });
  },

  openExerciseHistoryMenu() {
    const exercises = this.data.exercises || [];
    if (!exercises.length) return;
    if (exercises.length === 1) {
      this.openExerciseById(exercises[0].exerciseId);
      return;
    }
    if (exercises.length > 6) {
      wx.showToast({ title: '动作较多，请直接点击下方动作', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: exercises.map((exercise) => exercise.name),
      success: (res) => {
        const exercise = exercises[res.tapIndex];
        if (exercise) this.openExerciseById(exercise.exerciseId);
      }
    });
  },

  showPRHelp() {
    wx.showModal({
      title: '什么是 PR？',
      content: 'PR = Personal Record，个人纪录。\n\n力量动作按“估算 1RM”比较，次数动作按最多次数，计时动作按最长时长。\n\n它不是实际测试的极限重量，而是根据训练组推算出的最好表现，用来判断是否进步。例如 60kg × 8 次的估算 1RM 约为 76kg。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  done() {
    wx.switchTab({ url: '/pages/home/home' });
  }
});
