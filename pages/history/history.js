const app = getApp();
const storage = require('../../utils/storage');
const workoutUtil = require('../../utils/workout');
const dateUtil = require('../../utils/date');
const format = require('../../utils/format');

const now = new Date();

Page({
  data: {
    theme: 'dark',
    year: now.getFullYear(),
    month: now.getMonth(),
    monthLabel: '',
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
    cells: [],
    filters: ['全部', '胸', '背', '腿', '肩', '手臂', '核心', '有氧'],
    filter: '全部',
    selectedDate: '',
    selectedDateLabel: '',
    list: [],
    monthCount: 0,
    unit: 'kg'
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
    const workouts = workoutUtil.getCompletedWorkouts(db.workouts);
    const workoutKeys = new Set(workouts.map((workout) => (
      dateUtil.toDateKey(workout.endedAt || workout.startedAt)
    )));
    const cells = dateUtil.getMonthCells(
      this.data.year,
      this.data.month,
      workoutKeys,
      this.data.selectedDate
    );
    const monthWorkouts = workouts.filter((workout) => {
      const d = new Date(workout.endedAt || workout.startedAt);
      return d.getFullYear() === this.data.year && d.getMonth() === this.data.month;
    });
    const filtered = monthWorkouts.filter((workout) => {
      const muscleMatch = this.data.filter === '全部'
        || (workout.exercises || []).some((exercise) => exercise.muscle === this.data.filter);
      const dateMatch = !this.data.selectedDate || dateUtil.toDateKey(workout.endedAt || workout.startedAt) === this.data.selectedDate;
      return muscleMatch && dateMatch;
    });

    this.setData({
      unit,
      monthLabel: dateUtil.getMonthLabel(this.data.year, this.data.month),
      cells,
      list: filtered.map((workout) => this.decorateWorkout(workout, unit)),
      monthCount: monthWorkouts.length,
      selectedDateLabel: this.data.selectedDate
        ? dateUtil.formatMonthDay(dateUtil.fromDateKey(this.data.selectedDate))
        : ''
    });
  },

  decorateWorkout(workout, unit) {
    const stats = workoutUtil.workoutStats(workout, unit);
    const muscles = [];
    (workout.exercises || []).forEach((exercise) => {
      if (muscles.indexOf(exercise.muscle) < 0) muscles.push(exercise.muscle);
    });
    return {
      id: workout.id,
      name: workout.name || '自由训练',
      dateLabel: `${dateUtil.formatMonthDay(workout.endedAt || workout.startedAt)} ${dateUtil.getWeekdayShort(workout.endedAt || workout.startedAt)}`,
      timeLabel: dateUtil.formatTime(workout.startedAt),
      durationLabel: stats.durationLabel,
      sets: stats.sets,
      volumeLabel: stats.volumeLabel,
      badgeLabel: stats.sets ? `${stats.sets} 组` : `${stats.cardioCount} 项有氧`,
      metricLabel: stats.sets ? stats.volumeLabel : (stats.cardioCount ? `有氧 ${stats.cardioLabel}` : '—'),
      muscleLine: muscles.slice(0, 3).join(' · ') || '训练记录'
    };
  },

  changeMonth(e) {
    const delta = Number(e.currentTarget.dataset.delta) || 0;
    const d = new Date(this.data.year, this.data.month + delta, 1);
    this.setData({
      year: d.getFullYear(),
      month: d.getMonth(),
      selectedDate: '',
      selectedDateLabel: ''
    }, () => this.load());
  },

  goToday() {
    const d = new Date();
    this.setData({
      year: d.getFullYear(),
      month: d.getMonth(),
      selectedDate: '',
      selectedDateLabel: ''
    }, () => this.load());
  },

  selectDate(e) {
    const key = e.currentTarget.dataset.key;
    const rawInMonth = e.currentTarget.dataset.inmonth;
    const inMonth = rawInMonth === true || rawInMonth === 'true';
    if (!inMonth) {
      const d = dateUtil.fromDateKey(key);
      this.setData({
        year: d.getFullYear(),
        month: d.getMonth(),
        selectedDate: key
      }, () => this.load());
      return;
    }
    const next = this.data.selectedDate === key ? '' : key;
    this.setData({ selectedDate: next }, () => this.load());
  },

  clearDate() {
    this.setData({ selectedDate: '', selectedDateLabel: '' }, () => this.load());
  },

  selectFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.filter }, () => this.load());
  },

  openWorkout(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/workout-detail/workout-detail?id=${id}` });
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
