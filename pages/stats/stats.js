const app = getApp();
const storage = require('../../utils/storage');
const workoutUtil = require('../../utils/workout');
const dateUtil = require('../../utils/date');
const format = require('../../utils/format');
const cardioUtil = require('../../utils/cardio');

Page({
  data: {
    theme: 'dark',
    unit: 'kg',
    weekly: {
      count: 0,
      goal: 3,
      sets: 0,
      percent: 0,
      remaining: 3
    },
    weeklyVolumeLabel: '0 kg',
    fourWeeks: [],
    prs: [],
    muscleDist: [],
    exerciseOptions: [],
    selectedExerciseIndex: 0,
    selectedExerciseId: '',
    selectedExerciseName: '',
    trend: [],
    hasWorkouts: false
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load();
    wx.stopPullDownRefresh();
  },

  load() {
    app.applyTheme(this);
    const db = storage.getDB();
    if (!db.settings.onboarded) {
      wx.reLaunch({ url: '/pages/onboarding/onboarding' });
      return;
    }
    const unit = db.settings.unit || 'kg';
    const completed = workoutUtil.getCompletedWorkouts(db.workouts);
    const weekly = workoutUtil.getWeeklyStats(db.workouts, db.settings.weeklyGoal);
    const fourWeeks = workoutUtil.getFourWeekStats(db.workouts);
    const muscleDist = workoutUtil.getMuscleDistribution(db.workouts, 28);
    const prs = workoutUtil.getPRList(db.workouts).slice(0, 6).map((item) => {
      const type = item.type;
      let displayValue = '';
      let metricLabel = '最佳表现';
      if (type === 'weight_reps') {
        displayValue = format.formatWeight(format.estimated1RM(item.set.weight, item.set.reps), unit);
        metricLabel = '估算 1RM';
      } else if (type === 'time') {
        displayValue = `${Number(item.set.duration) || 0} 秒`;
        metricLabel = '最长计时';
      } else {
        displayValue = `${Number(item.set.reps) || 0} 次`;
        metricLabel = '最多次数';
      }
      return {
        exerciseId: item.exerciseId,
        exerciseName: item.exerciseName,
        muscle: item.muscle,
        metricLabel,
        displayValue,
        detail: format.formatSetLine(item.set, type, unit),
        dateLabel: dateUtil.formatRelativeDate(item.achievedAt)
      };
    });

    const exerciseOptions = workoutUtil.getExerciseOptions(db.workouts);
    let selectedExerciseIndex = this.data.selectedExerciseIndex || 0;
    if (this.data.selectedExerciseId) {
      const found = exerciseOptions.findIndex((item) => item.id === this.data.selectedExerciseId);
      if (found >= 0) selectedExerciseIndex = found;
    }
    if (selectedExerciseIndex >= exerciseOptions.length) selectedExerciseIndex = 0;
    const selected = exerciseOptions[selectedExerciseIndex] || null;
    const trend = selected
      ? workoutUtil.getExerciseTrend(db.workouts, selected.id, 8).map((item) => ({
        label: item.label,
        height: item.height,
        valueLabel: item.type === 'cardio'
          ? cardioUtil.formatDuration(item.duration)
          : (selected.muscle && this.isWeightExercise(db, selected.id)
            ? format.formatWeight(item.weightKg, unit, false)
            : `${item.reps || item.duration || 0}`)
      }))
      : [];

    this.setData({
      unit,
      weekly,
      weeklyVolumeLabel: format.formatVolume(weekly.volumeKg, unit),
      fourWeeks,
      prs,
      muscleDist,
      exerciseOptions,
      selectedExerciseIndex,
      selectedExerciseId: selected ? selected.id : '',
      selectedExerciseName: selected ? selected.name : '',
      trend,
      hasWorkouts: completed.length > 0
    });
  },

  isWeightExercise(db, exerciseId) {
    const all = workoutUtil.getCompletedWorkouts(db.workouts);
    for (let i = 0; i < all.length; i += 1) {
      const exercise = (all[i].exercises || []).find((item) => item.exerciseId === exerciseId);
      if (exercise) return exercise.type === 'weight_reps';
    }
    return true;
  },

  onExerciseChange(e) {
    const index = Number(e.detail.value) || 0;
    const selected = this.data.exerciseOptions[index];
    if (!selected) return;
    this.setData({
      selectedExerciseIndex: index,
      selectedExerciseId: selected.id,
      selectedExerciseName: selected.name
    }, () => this.load());
  },

  openExercise(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/exercise-detail/exercise-detail?id=${id}` });
  },

  showPRHelp() {
    wx.showModal({
      title: '什么是 PR？',
      content: 'PR = Personal Record，个人纪录。\n\n力量动作按“估算 1RM”比较，次数动作按最多次数，计时动作按最长时长。\n\n它不是实际测试的极限重量，而是根据训练组推算出的最好表现，用来判断是否进步。例如 60kg × 8 次的估算 1RM 约为 76kg。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  startWorkout() {
    const db = storage.getDB();
    if (db.activeWorkout) {
      wx.navigateTo({ url: '/pages/workout/workout' });
      return;
    }
    const workout = workoutUtil.createWorkout(db.settings);
    db.activeWorkout = workout;
    storage.saveDB(db);
    wx.navigateTo({ url: '/pages/workout/workout' });
  }
});
