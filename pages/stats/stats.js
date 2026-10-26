const app = getApp();
const storage = require('../../utils/storage');
const workoutUtil = require('../../utils/workout');
const dateUtil = require('../../utils/date');
const format = require('../../utils/format');
const exercisesUtil = require('../../utils/exercises');
const trendViewUtil = require('../../utils/trend-view');
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
    prs: [],
    prsAll: [],
    prCount: 0,
    prExpanded: false,
    muscleDist: [],
    exerciseOptions: [],
    selectedExerciseIndex: 0,
    selectedExerciseId: '',
    selectedExerciseName: '',
    trend: [],
    trendPoints: [],
    trendBars: [],
    trendLines: [],
    trendLabels: [],
    trendTitle: '',
    trendSubtitle: '',
    trendMetricName: '',
    trendSecondaryName: '',
    selectedTrend: null,
    selectedTrendIndex: -1,
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
    const muscleDist = workoutUtil.getMuscleDistribution(db.workouts, 28);
    const prsAll = workoutUtil.getPRList(db.workouts).map((item) => {
      const type = item.type;
      let displayValue = '';
      let metricLabel = '最佳表现';
      let detail = '';
      if (type === 'weight_reps') {
        displayValue = format.formatWeight(format.estimated1RM(item.set.weight, item.set.reps), unit);
        metricLabel = '估算 1RM';
        detail = format.formatSetLine(item.set, type, unit);
      } else if (type === 'time') {
        displayValue = `${Number(item.set.duration) || 0} 秒`;
        metricLabel = '最长计时';
        detail = format.formatSetLine(item.set, type, unit);
      } else if (type === 'cardio') {
        displayValue = cardioUtil.formatDuration(item.score);
        metricLabel = '有氧时长';
        detail = cardioUtil.summary(item.cardio, item.cardioType);
      } else {
        displayValue = `${Number(item.set.reps) || 0} 次`;
        metricLabel = '最多次数';
        detail = format.formatSetLine(item.set, type, unit);
      }
      return {
        exerciseId: item.exerciseId,
        exerciseName: item.exerciseName,
        muscle: item.muscle,
        metricLabel,
        displayValue,
        detail,
        dateLabel: dateUtil.formatRelativeDate(item.achievedAt)
      };
    });
    const prs = this.data.prExpanded ? prsAll : prsAll.slice(0, 4);

    const exerciseOptions = workoutUtil.getExerciseOptions(db.workouts);
    let selectedExerciseIndex = this.data.selectedExerciseIndex || 0;
    if (this.data.selectedExerciseId) {
      const found = exerciseOptions.findIndex((item) => item.id === this.data.selectedExerciseId);
      if (found >= 0) selectedExerciseIndex = found;
    }
    if (selectedExerciseIndex >= exerciseOptions.length) selectedExerciseIndex = 0;
    const selected = exerciseOptions[selectedExerciseIndex] || null;
    const selectedExercise = selected
      ? (exercisesUtil.findById(selected.id, db.customExercises) || {
        id: selected.id,
        name: selected.name,
        type: selected.type || 'weight_reps'
      })
      : null;
    const trendView = selectedExercise
      ? trendViewUtil.buildTrendView(
        workoutUtil.getExerciseTrend(db.workouts, selectedExercise.id, 8),
        selectedExercise,
        unit
      )
      : null;

    this.setData(Object.assign({
      unit,
      weekly,
      weeklyVolumeLabel: format.formatVolume(weekly.volumeKg, unit),
      prs,
      prsAll,
      prCount: prsAll.length,
      muscleDist,
      exerciseOptions,
      selectedExerciseIndex,
      selectedExerciseId: selected ? selected.id : '',
      selectedExerciseName: selected ? selected.name : '',
      hasWorkouts: completed.length > 0
    }, trendView || {
      trend: [],
      trendPoints: [],
      trendBars: [],
      trendLines: [],
      trendLabels: [],
      trendTitle: '',
      trendSubtitle: '选择动作查看最近表现',
      trendMetricName: '',
      trendSecondaryName: '',
      selectedTrend: null,
      selectedTrendIndex: -1
    }));
  },

  togglePrList() {
    const expanded = !this.data.prExpanded;
    this.setData({
      prExpanded: expanded,
      prs: expanded ? this.data.prsAll : this.data.prsAll.slice(0, 4)
    });
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

  onTrendPointTap(e) {
    const index = Number(e.currentTarget.dataset.index);
    const selected = this.data.trend[index];
    if (!selected) return;
    const points = this.data.trendPoints.map((point) => Object.assign({}, point, {
      selected: point.index === index
    }));
    const barLabels = this.data.trendBarLabels.map((label) => Object.assign({}, label, {
      selected: label.index === index
    }));
    this.setData({
      selectedTrend: selected,
      selectedTrendIndex: index,
      trendPoints: points,
      trendBarLabels: barLabels
    });
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
