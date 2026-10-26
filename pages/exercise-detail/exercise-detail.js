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

    const trendView = this.buildTrendView(
      workoutUtil.getExerciseTrend(db.workouts, this.exerciseId, 8),
      exercise,
      unit
    );

    this.setData(Object.assign({
      exercise: Object.assign({}, exercise, {
        initial: exercise.muscle ? exercise.muscle.slice(0, 1) : '·'
      }),
      unit,
      stats,
      history: decoratedHistory
    }, trendView));
  },

  buildTrendView(rawTrend, exercise, unit) {
    const chartWidth = 620;
    const chartTop = 24;
    const plotHeight = 210;
    const stageHeight = 300;
    const type = exercise.type === 'cardio' ? 'cardio' : exercise.type;
    const metricName = type === 'weight_reps'
      ? '估算 1RM'
      : (type === 'reps' ? '最多次数' : (type === 'time' ? '最长时长' : '有氧时长'));
    const secondaryName = type === 'weight_reps'
      ? '训练容量'
      : (type === 'reps' ? '总次数' : (type === 'time' ? '总时长' : '距离/热量'));

    const items = (rawTrend || []).map((item, index) => {
      let scoreLabel = '';
      let secondaryValue = 0;
      let secondaryLabel = '';
      let bestSetLabel = '';
      if (type === 'weight_reps') {
        scoreLabel = format.formatWeight(item.score || 0, unit);
        secondaryValue = Number(item.volumeKg) || 0;
        secondaryLabel = format.formatVolume(secondaryValue, unit);
        bestSetLabel = item.set ? format.formatSetLine(item.set, 'weight_reps', unit) : '';
      } else if (type === 'reps') {
        scoreLabel = `${item.score || 0} 次`;
        secondaryValue = Number(item.totalReps) || 0;
        secondaryLabel = `${secondaryValue} 次`;
        bestSetLabel = `${item.reps || 0} 次`;
      } else if (type === 'time') {
        scoreLabel = cardioUtil.formatDuration(item.score || 0);
        secondaryValue = Number(item.totalDuration) || 0;
        secondaryLabel = cardioUtil.formatDuration(secondaryValue);
        bestSetLabel = `${item.duration || 0} 秒`;
      } else {
        scoreLabel = cardioUtil.formatDuration(item.score || 0);
        secondaryValue = Number(item.distanceKm) > 0
          ? Number(item.distanceKm)
          : (Number(item.calories) || 0);
        secondaryLabel = Number(item.distanceKm) > 0
          ? `${Number(Number(item.distanceKm).toFixed(2))} km`
          : (Number(item.calories) > 0 ? `${Math.round(item.calories)} kcal` : '—');
        bestSetLabel = item.cardioSummary || '';
      }
      return Object.assign({}, item, {
        index,
        scoreLabel,
        secondaryValue,
        secondaryLabel,
        bestSetLabel
      });
    });

    const makeChange = (current, previous) => {
      if (!previous) return { changeLabel: '首次记录', direction: 'flat' };
      const diff = current.score - previous.score;
      if (Math.abs(diff) < 0.01) return { changeLabel: '与上次持平', direction: 'flat' };
      const direction = diff > 0 ? 'up' : 'down';
      let amount = '';
      if (type === 'weight_reps') {
        amount = format.formatWeight(Math.abs(diff), unit);
      } else if (type === 'reps') {
        amount = `${Math.abs(diff)} 次`;
      } else {
        amount = cardioUtil.formatDuration(Math.abs(diff));
      }
      return {
        changeLabel: `${diff > 0 ? '+' : '-'}${amount}`,
        direction
      };
    };

    items.forEach((item, index) => {
      Object.assign(item, makeChange(item, items[index - 1]));
    });

    if (!items.length) {
      return {
        trend: [],
        trendPoints: [],
        trendBars: [],
        trendLines: [],
        trendLabels: [],
        trendTitle: `${exercise.name} · ${metricName}`,
        trendSubtitle: `暂无${metricName}数据`,
        trendMetricName: metricName,
        trendSecondaryName: secondaryName,
        selectedTrend: null,
        selectedTrendIndex: -1
      };
    }

    const scores = items.map((item) => Number(item.score) || 0);
    let minScore = Math.min(...scores);
    let maxScore = Math.max(...scores);
    if (minScore === maxScore) {
      const pad = Math.max(1, Math.abs(maxScore) * 0.1);
      minScore -= pad;
      maxScore += pad;
    }
    const padding = (maxScore - minScore) * 0.15;
    const lower = minScore - padding;
    const upper = maxScore + padding;
    const maxSecondary = Math.max(1, ...items.map((item) => Number(item.secondaryValue) || 0));
    const leftPad = 22;
    const rightPad = 22;
    const plotWidth = chartWidth - leftPad - rightPad;
    const selectedIndex = items.length - 1;
    const points = [];
    const bars = [];
    const lines = [];
    const labels = [];
    const xValues = items.map((item, index) => (
      items.length === 1
        ? chartWidth / 2
        : leftPad + (index / (items.length - 1)) * plotWidth
    ));

    items.forEach((item, index) => {
      const x = xValues[index];
      const score = Number(item.score) || 0;
      const y = chartTop + (1 - ((score - lower) / (upper - lower))) * plotHeight;
      const barHeight = Math.max(3, (Number(item.secondaryValue) || 0) / maxSecondary * 140);
      item.selected = index === selectedIndex;
      points.push({
        index,
        style: `left:${x - 18}rpx;top:${y - 18}rpx;`,
        selected: index === selectedIndex
      });
      bars.push({
        index,
        style: `left:${x - 10}rpx;bottom:46rpx;height:${barHeight}rpx;`
      });
      labels.push({
        index,
        style: `left:${x - 32}rpx;top:260rpx;`,
        label: item.label
      });
      if (index > 0) {
        const prevX = xValues[index - 1];
        const prevScore = Number(items[index - 1].score) || 0;
        const prevY = chartTop + (1 - ((prevScore - lower) / (upper - lower))) * plotHeight;
        const dx = x - prevX;
        const dy = y - prevY;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        lines.push({
          index: index - 1,
          style: `left:${prevX}rpx;top:${prevY - 1}rpx;width:${length}rpx;transform:rotate(${angle}deg);`
        });
      }
    });

    return {
      trend: items,
      trendPoints: points,
      trendBars: bars,
      trendLines: lines,
      trendLabels: labels,
      trendTitle: `${exercise.name} · ${metricName}`,
      trendSubtitle: `柱状为${secondaryName}，折线为${metricName}`,
      trendMetricName: metricName,
      trendSecondaryName: secondaryName,
      selectedTrend: items[selectedIndex],
      selectedTrendIndex: selectedIndex
    };
  },

  onTrendPointTap(e) {
    const index = Number(e.currentTarget.dataset.index);
    const selected = this.data.trend[index];
    if (!selected) return;
    const points = this.data.trendPoints.map((point) => Object.assign({}, point, {
      selected: point.index === index
    }));
    this.setData({
      selectedTrend: selected,
      selectedTrendIndex: index,
      trendPoints: points
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
