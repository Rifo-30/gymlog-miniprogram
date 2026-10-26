const app = getApp();
const storage = require('../../utils/storage');
const workoutUtil = require('../../utils/workout');
const exercisesUtil = require('../../utils/exercises');
const dateUtil = require('../../utils/date');

Page({
  data: {
    theme: 'dark',
    activeWorkout: null,
    lastWorkout: null,
    recentExercises: [],
    recentExercisesAll: [],
    recentCount: 0,
    recentExpanded: false,
    muscles: exercisesUtil.MUSCLES,
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
    const completed = workoutUtil.getCompletedWorkouts(db.workouts);
    const active = db.activeWorkout ? {
      id: db.activeWorkout.id,
      name: db.activeWorkout.name || '自由训练',
      elapsedLabel: dateUtil.formatElapsed(workoutUtil.durationMs(db.activeWorkout)),
      exerciseCount: (db.activeWorkout.exercises || []).length,
      sets: workoutUtil.countCompletedSets(db.activeWorkout),
      cardioCount: workoutUtil.workoutStats(db.activeWorkout, db.settings.unit || 'kg').cardioCount
    } : null;

    const allExercises = exercisesUtil.getAll(db.customExercises);
    const recentIds = workoutUtil.getRecentExerciseIds(db.workouts, 200);
    const recentExercisesAll = recentIds.map((id) => {
      const exercise = allExercises.find((item) => item.id === id);
      if (!exercise) return null;
      const last = workoutUtil.getLastExercisePerformance(db.workouts, id);
      return {
        id: exercise.id,
        name: exercise.name,
        muscle: exercise.muscle,
        equipment: exercise.equipment,
        lastLabel: last ? dateUtil.formatRelativeDate(last.workout.endedAt || last.workout.startedAt) : ''
      };
    }).filter(Boolean);
    const recentExercises = this.data.recentExpanded
      ? recentExercisesAll
      : recentExercisesAll.slice(0, 4);

    this.setData({
      activeWorkout: active,
      lastWorkout: completed[0] ? {
        id: completed[0].id,
        name: completed[0].name,
        dateLabel: dateUtil.formatRelativeDate(completed[0].endedAt || completed[0].startedAt),
        exerciseCount: (completed[0].exercises || []).length
      } : null,
      recentExercises,
      recentExercisesAll,
      recentCount: recentExercisesAll.length,
      totalWorkouts: completed.length
    });
  },

  startBlank() {
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

  openActive() {
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
      this.startBlank();
      return;
    }
    const workout = workoutUtil.duplicateWorkout(completed[0]);
    db.activeWorkout = workout;
    storage.saveDB(db);
    wx.navigateTo({ url: '/pages/workout/workout' });
  },

  toggleRecentExercises() {
    const expanded = !this.data.recentExpanded;
    this.setData({
      recentExpanded: expanded,
      recentExercises: expanded
        ? this.data.recentExercisesAll
        : this.data.recentExercisesAll.slice(0, 4)
    });
  },

  openPicker() {

    wx.navigateTo({ url: '/pages/exercise-picker/exercise-picker?mode=browse' });
  },

  openMuscle(e) {
    const muscle = e.currentTarget.dataset.muscle;
    wx.navigateTo({ url: `/pages/exercise-picker/exercise-picker?mode=browse&muscle=${encodeURIComponent(muscle)}` });
  },

  openExercise(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/exercise-detail/exercise-detail?id=${id}` });
  }
});
