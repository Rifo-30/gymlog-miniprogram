const app = getApp();
const storage = require('../../utils/storage');
const workoutUtil = require('../../utils/workout');
const dateUtil = require('../../utils/date');
const format = require('../../utils/format');

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

Page({
  data: {
    theme: 'dark',
    todayLabel: '',
    greeting: '',
    unit: 'kg',
    settings: {},
    activeWorkout: null,
    recentWorkouts: [],
    weekly: {
      count: 0,
      goal: 3,
      percent: 0,
      sets: 0,
      remaining: 3
    },
    weeklyVolumeLabel: '0 kg',
    totalWorkouts: 0
  },

  onShow() {
    this.refresh();
    this.startLiveTimer();
  },

  onHide() {
    this.stopLiveTimer();
  },

  onUnload() {
    this.stopLiveTimer();
  },

  startLiveTimer() {
    this.stopLiveTimer();
    if (!this.data.activeWorkout) return;
    this._liveTimer = setInterval(() => {
      const db = storage.getDB();
      if (!db.activeWorkout) {
        this.stopLiveTimer();
        return;
      }
      this.setData({
        'activeWorkout.elapsedLabel': dateUtil.formatElapsed(workoutUtil.durationMs(db.activeWorkout))
      });
    }, 1000);
  },

  stopLiveTimer() {
    if (this._liveTimer) {
      clearInterval(this._liveTimer);
      this._liveTimer = null;
    }
  },

  onPullDownRefresh() {
    this.refresh();
    wx.stopPullDownRefresh();
  },

  refresh() {
    app.applyTheme(this);
    const db = storage.getDB();
    if (!db.settings.onboarded) {
      wx.reLaunch({ url: '/pages/onboarding/onboarding' });
      return;
    }

    const unit = db.settings.unit || 'kg';
    const completed = workoutUtil.getCompletedWorkouts(db.workouts);
    const weekly = workoutUtil.getWeeklyStats(db.workouts, db.settings.weeklyGoal);
    const recent = completed.slice(0, 3).map((workout) => this.decorateWorkout(workout, unit));
    const active = db.activeWorkout ? this.decorateActive(db.activeWorkout, unit) : null;

    this.setData({
      settings: db.settings,
      unit,
      greeting: greeting(),
      todayLabel: `${dateUtil.formatMonthDay(new Date())} ${dateUtil.getWeekdayShort(new Date())}`,
      activeWorkout: active,
      recentWorkouts: recent,
      weekly,
      weeklyVolumeLabel: format.formatVolume(weekly.volumeKg, unit),
      totalWorkouts: completed.length
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
      dateLabel: dateUtil.formatRelativeDate(workout.endedAt || workout.startedAt),
      durationLabel: stats.durationLabel,
      sets: stats.sets,
      volumeLabel: stats.volumeLabel,
      badgeLabel: stats.sets ? `${stats.sets} 组` : `${stats.cardioCount} 项有氧`,
      metricLabel: stats.sets ? stats.volumeLabel : (stats.cardioCount ? `有氧 ${stats.cardioLabel}` : '—'),
      muscleLine: muscles.slice(0, 3).join(' · ') || '训练记录'
    };
  },

  decorateActive(workout, unit) {
    const stats = workoutUtil.workoutStats(workout, unit);
    return {
      id: workout.id,
      name: workout.name || '自由训练',
      elapsedLabel: dateUtil.formatElapsed(workoutUtil.durationMs(workout)),
      exerciseCount: stats.exerciseCount,
      sets: stats.sets,
      cardioCount: stats.cardioCount
    };
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
  },

  continueActive() {
    wx.navigateTo({ url: '/pages/workout/workout' });
  },

  repeatLast() {
    const db = storage.getDB();
    if (db.activeWorkout) {
      wx.navigateTo({ url: '/pages/workout/workout' });
      return;
    }
    const completed = workoutUtil.getCompletedWorkouts(db.workouts);
    if (!completed.length) {
      this.startWorkout();
      return;
    }
    const workout = workoutUtil.duplicateWorkout(completed[0]);
    db.activeWorkout = workout;
    storage.saveDB(db);
    wx.navigateTo({ url: '/pages/workout/workout' });
  },

  openWorkout(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/workout-detail/workout-detail?id=${id}` });
  },

  goTraining() {
    wx.switchTab({ url: '/pages/training/training' });
  },

  goHistory() {
    wx.switchTab({ url: '/pages/history/history' });
  },

  goStats() {
    wx.switchTab({ url: '/pages/stats/stats' });
  },

  goSettings() {
    wx.switchTab({ url: '/pages/settings/settings' });
  }
});
