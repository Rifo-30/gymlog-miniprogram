const app = getApp();
const storage = require('../../utils/storage');
const exercisesUtil = require('../../utils/exercises');
const workoutUtil = require('../../utils/workout');
const format = require('../../utils/format');
const dateUtil = require('../../utils/date');
const cardioUtil = require('../../utils/cardio');

Page({
  data: {
    theme: 'dark',
    exercise: null,
    unit: 'kg',
    stats: {
      sessions: 0,
      sets: 0,
      bestWeightLabel: '—',
      bestE1rmLabel: '—'
    },
    trend: [],
    history: []
  },

  onLoad(options) {
    app.applyTheme(this);
    this.exerciseId = options.id || '';
    this.load();
  },

  onShow() {
    app.applyTheme(this);
    this.load();
  },

  load() {
    const db = storage.getDB();
    const exercise = exercisesUtil.findById(this.exerciseId, db.customExercises);
    if (!exercise) {
      wx.showToast({ title: '动作不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
    const unit = db.settings.unit || 'kg';
    const isCardio = cardioUtil.isCardio(exercise);
    const history = workoutUtil.getExerciseHistory(db.workouts, this.exerciseId);
    let totalSets = 0;
    let maxWeight = 0;
    let maxE1rm = 0;
    let maxReps = 0;
    let maxDuration = 0;
    let totalCardioDuration = 0;
    let totalCardioDistance = 0;

    const decoratedHistory = history.map((item) => {
      const sets = item.sets || [];
      totalSets += sets.length;
      sets.forEach((set) => {
        maxWeight = Math.max(maxWeight, Number(set.weight) || 0);
        maxE1rm = Math.max(maxE1rm, format.estimated1RM(set.weight, set.reps));
        maxReps = Math.max(maxReps, Number(set.reps) || 0);
        maxDuration = Math.max(maxDuration, Number(set.duration) || 0);
      });

      if (item.cardio) {
        const cardio = cardioUtil.decorate(item.cardio, cardioUtil.typeFromExercise(item.exercise));
        totalCardioDuration += cardio.totalDurationSec;
        totalCardioDistance += Number(cardio.distanceKm) || 0;
        return {
          id: item.workout.id,
          name: item.workout.name || '自由训练',
          dateLabel: dateUtil.formatRelativeDate(item.date),
          setsLabel: '有氧',
          bestLabel: cardio.durationLabel,
          cardioSummary: cardio.summary,
          note: item.exercise.note || ''
        };
      }

      let bestLabel = '';
      if (item.exercise.type === 'weight_reps') {
        bestLabel = format.formatSetLine(item.best, item.exercise.type, unit);
      } else if (item.exercise.type === 'time') {
        bestLabel = `${Number(item.best.duration) || 0} 秒`;
      } else {
        bestLabel = `${Number(item.best.reps) || 0} 次`;
      }
      return {
        id: item.workout.id,
        name: item.workout.name || '自由训练',
        dateLabel: dateUtil.formatRelativeDate(item.date),
        setsLabel: `${sets.length} 组`,
        bestLabel,
        cardioSummary: '',
        note: item.exercise.note || ''
      };
    });

    const stats = {
      sessions: history.length,
      sets: totalSets,
      bestWeightLabel: exercise.type === 'weight_reps' ? format.formatWeight(maxWeight, unit) : '—',
      bestE1rmLabel: exercise.type === 'weight_reps' ? format.formatWeight(maxE1rm, unit) : '—',
      bestRepsLabel: exercise.type === 'reps' ? `${maxReps} 次` : '',
      bestDurationLabel: exercise.type === 'time' ? `${maxDuration} 秒` : '',
      totalCardioDurationLabel: cardioUtil.formatDuration(totalCardioDuration),
      totalCardioDistanceLabel: totalCardioDistance > 0 ? `${Number(totalCardioDistance.toFixed(2))} km` : '—'
    };

    const trend = workoutUtil.getExerciseTrend(db.workouts, this.exerciseId, 8).map((item) => ({
      label: item.label,
      height: item.height,
      valueLabel: item.type === 'cardio'
        ? cardioUtil.formatDuration(item.duration)
        : (exercise.type === 'weight_reps'
          ? format.formatWeight(item.weightKg, unit, false)
          : (exercise.type === 'time' ? `${item.duration}s` : `${item.reps}次`))
    }));

    this.setData({
      exercise: Object.assign({}, exercise, {
        initial: exercise.muscle ? exercise.muscle.slice(0, 1) : '·'
      }),
      unit,
      stats,
      trend,
      history: decoratedHistory
    });
  },

  startWorkout() {
    const db = storage.getDB();
    if (db.activeWorkout) {
      wx.navigateTo({ url: '/pages/workout/workout' });
      return;
    }
    const exercise = this.data.exercise;
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
    wx.navigateTo({ url: '/pages/workout/workout' });
  },

  openWorkout(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/workout-detail/workout-detail?id=${id}` });
  }
});
