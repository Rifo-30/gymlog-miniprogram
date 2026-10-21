const app = getApp();
const storage = require('../../utils/storage');
const exercisesUtil = require('../../utils/exercises');
const workoutUtil = require('../../utils/workout');

Page({
  data: {
    theme: 'dark',
    query: '',
    muscle: '全部',
    muscles: ['全部'].concat(exercisesUtil.MUSCLES),
    list: [],
    all: []
  },

  onLoad(options) {
    app.applyTheme(this);
    this.mode = options.mode || 'select';
    const muscle = options.muscle ? decodeURIComponent(options.muscle) : '全部';
    this.setData({ muscle });
    this.load();
  },

  load() {
    const db = storage.getDB();
    const recentIds = workoutUtil.getRecentExerciseIds(db.workouts, 20);
    const recentMap = {};
    recentIds.forEach((id, index) => {
      recentMap[id] = index;
    });
    const pinnedIds = db.settings.pinnedExercises || [];
    const pinnedMap = {};
    pinnedIds.forEach((id, index) => {
      pinnedMap[id] = index;
    });
    const all = exercisesUtil.getAll().map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      muscle: exercise.muscle,
      equipment: exercise.equipment,
      type: exercise.type,
      cardioType: exercise.cardioType || '',
      initial: exercise.muscle ? exercise.muscle.slice(0, 1) : '·',
      pinned: pinnedMap[exercise.id] != null,
      pinnedIndex: pinnedMap[exercise.id] == null ? 999 : pinnedMap[exercise.id],
      recentIndex: recentMap[exercise.id] == null ? 999 : recentMap[exercise.id],
      searchText: [exercise.name, exercise.muscle, exercise.equipment]
        .concat(exercise.aliases || [])
        .join(' ')
        .toLowerCase()
    })).sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.pinned && b.pinned && a.pinnedIndex !== b.pinnedIndex) {
        return a.pinnedIndex - b.pinnedIndex;
      }
      if (a.recentIndex !== b.recentIndex) return a.recentIndex - b.recentIndex;
      return a.name.localeCompare(b.name, 'zh');
    });
    this.setData({ all });
    this.applyFilter();
  },

  togglePin(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const db = storage.getDB();
    const pinned = Array.isArray(db.settings.pinnedExercises)
      ? db.settings.pinnedExercises.slice()
      : [];
    const index = pinned.indexOf(id);
    if (index >= 0) {
      pinned.splice(index, 1);
    } else {
      pinned.unshift(id);
    }
    db.settings.pinnedExercises = pinned;
    storage.saveDB(db);
    this.load();
  },

  applyFilter() {
    const query = String(this.data.query || '').trim().toLowerCase();
    const muscle = this.data.muscle;
    const list = this.data.all.filter((exercise) => {
      const inMuscle = muscle === '全部' || exercise.muscle === muscle;
      return inMuscle && (!query || exercise.searchText.indexOf(query) >= 0);
    });
    this.setData({ list });
  },

  onSearch(e) {
    this.setData({ query: e.detail.value }, () => this.applyFilter());
  },

  selectMuscle(e) {
    this.setData({ muscle: e.currentTarget.dataset.muscle }, () => this.applyFilter());
  },

  selectExercise(e) {
    const id = e.currentTarget.dataset.id;
    const exercise = this.data.all.find((item) => item.id === id);
    if (exercise) this.handleSelect(exercise);
  },

  handleSelect(exercise) {
    if (this.mode === 'browse') {
      const db = storage.getDB();
      if (db.activeWorkout) {
        wx.redirectTo({ url: '/pages/workout/workout' });
        return;
      }
      const performance = workoutUtil.getLastExercisePerformance(db.workouts, exercise.id);
      const workout = workoutUtil.createWorkout(db.settings);
      workout.exercises.push(workoutUtil.createWorkoutExercise(
        exercise,
        db.settings,
        workoutUtil.formatLastHint(performance, exercise.type, db.settings.unit || 'kg', db.profile && db.profile.weightKg),
        performance ? performance.last : null,
        performance ? performance.cardio : null
      ));
      workout.name = workoutUtil.composeWorkoutName(workout.exercises);
      db.activeWorkout = workout;
      storage.saveDB(db);
      wx.redirectTo({ url: '/pages/workout/workout' });
      return;
    }

    const channel = this.getOpenerEventChannel();
    if (channel && channel.emit) {
      channel.emit('selectExercise', exercise);
    }
    wx.navigateBack();
  }
});
