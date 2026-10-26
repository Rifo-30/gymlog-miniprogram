const format = require('./format');
const dateUtil = require('./date');
const cardioUtil = require('./cardio');
const timeUtil = require('./time');

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createSet(type, base) {
  const source = base || {};
  return {
    id: makeId('set'),
    weight: Number(source.weight) || 0,
    reps: Number(source.reps) || 0,
    duration: Number(source.duration) || 0,
    completed: false,
    type: 'working',
    note: ''
  };
}

function createWorkoutExercise(exercise, settings, lastHint, defaultSet, defaultCardio) {
  const isCardio = cardioUtil.isCardio(exercise);
  const cardioType = cardioUtil.typeFromExercise(exercise);
  return {
    id: makeId('we'),
    exerciseId: exercise.id,
    name: exercise.name,
    muscle: exercise.muscle,
    equipment: exercise.equipment,
    type: isCardio ? 'cardio' : (exercise.type || 'weight_reps'),
    cardioType: isCardio ? cardioType : '',
    cardio: isCardio ? cardioUtil.create(cardioType, defaultCardio) : null,
    restSeconds: (settings && settings.restSeconds) || 90,
    note: '',
    lastHint: lastHint || '',
    sets: isCardio ? [] : [createSet(exercise.type, defaultSet)]
  };
}

function createWorkout(settings, options) {
  const opts = options || {};
  return {
    id: makeId('w'),
    name: opts.name || composeWorkoutName(opts.exercises || []),
    startedAt: timeUtil.nowChinaIso(),
    endedAt: null,
    status: 'active',
    note: '',
    exercises: opts.exercises || []
  };
}

function duplicateWorkout(source, options) {
  const opts = options || {};
  const exercises = (source.exercises || []).map((exercise) => {
    const isCardio = cardioUtil.isCardio(exercise);
    const cardioType = cardioUtil.typeFromExercise(exercise);
    return {
      id: makeId('we'),
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      muscle: exercise.muscle,
      equipment: exercise.equipment,
      type: isCardio ? 'cardio' : (exercise.type || 'weight_reps'),
      cardioType: isCardio ? cardioType : '',
      cardio: isCardio ? cardioUtil.create(cardioType, exercise.cardio) : null,
      restSeconds: exercise.restSeconds || 90,
      note: '',
      sets: isCardio ? [] : (exercise.sets || []).map((set) => ({
        id: makeId('set'),
        weight: Number(set.weight) || 0,
        reps: Number(set.reps) || 0,
        duration: Number(set.duration) || 0,
        completed: false,
        type: 'working',
        note: ''
      }))
    };
  });
  return {
    id: makeId('w'),
    name: opts.name || source.name || composeWorkoutName(exercises),
    startedAt: timeUtil.nowChinaIso(),
    endedAt: null,
    status: 'active',
    note: '',
    exercises
  };
}

function finishWorkout(workout) {
  const copy = JSON.parse(JSON.stringify(workout));
  copy.endedAt = timeUtil.nowChinaIso();
  copy.status = 'completed';
  return copy;
}

function stripWorkoutForStorage(workout) {
  const copy = JSON.parse(JSON.stringify(workout));
  delete copy.showNote;
  copy.exercises = (copy.exercises || []).map((exercise) => {
    const next = Object.assign({}, exercise);
    delete next.lastHint;
    delete next.showNote;
    if (next.cardio) {
      next.cardio = cardioUtil.create(next.cardioType, next.cardio);
    }
    next.sets = (next.sets || []).map((set) => {
      const nextSet = Object.assign({}, set);
      delete nextSet.weightDisplay;
      return nextSet;
    });
    return next;
  });
  return copy;
}

function sortWorkouts(workouts) {
  return (workouts || []).slice().sort((a, b) => {
    const aTime = new Date(a.endedAt || a.startedAt || 0).getTime();
    const bTime = new Date(b.endedAt || b.startedAt || 0).getTime();
    return bTime - aTime;
  });
}

function getCompletedWorkouts(workouts) {
  return sortWorkouts((workouts || []).filter((item) => item.status === 'completed'));
}

function countCompletedSets(workout) {
  return (workout.exercises || []).reduce((sum, exercise) => {
    if (cardioUtil.isCardio(exercise)) return sum;
    return sum + (exercise.sets || []).filter((set) => set.completed).length;
  }, 0);
}

function getCardioEntries(workout) {
  return (workout.exercises || [])
    .filter((exercise) => cardioUtil.isCardio(exercise))
    .map((exercise) => ({
      exercise,
      cardio: cardioUtil.create(cardioUtil.typeFromExercise(exercise), exercise.cardio)
    }))
    .filter((item) => cardioUtil.isValid(item.cardio));
}

function totalCardioSeconds(workout) {
  return getCardioEntries(workout).reduce(
    (sum, item) => sum + cardioUtil.durationSeconds(item.cardio),
    0
  );
}

function exerciseVolume(exercise) {
  return (exercise.sets || [])
    .filter((set) => set.completed && exercise.type === 'weight_reps')
    .reduce((sum, set) => sum + (Number(set.weight) || 0) * (Number(set.reps) || 0), 0);
}

function totalVolume(workout) {
  return (workout.exercises || []).reduce((sum, exercise) => sum + exerciseVolume(exercise), 0);
}

function durationMs(workout) {
  if (!workout || !workout.startedAt) return 0;
  const start = new Date(workout.startedAt).getTime();
  const end = workout.endedAt ? new Date(workout.endedAt).getTime() : Date.now();
  return Math.max(0, end - start);
}

function workoutStats(workout, unit) {
  const cardioSeconds = totalCardioSeconds(workout);
  return {
    durationLabel: dateUtil.formatDurationLong(durationMs(workout)),
    sets: countCompletedSets(workout),
    volumeKg: totalVolume(workout),
    volumeLabel: format.formatVolume(totalVolume(workout), unit || 'kg'),
    exerciseCount: (workout.exercises || []).length,
    cardioCount: getCardioEntries(workout).length,
    cardioSeconds,
    cardioLabel: cardioUtil.formatDuration(cardioSeconds)
  };
}

function getLastExercisePerformance(workouts, exerciseId) {
  const sorted = getCompletedWorkouts(workouts);
  for (let i = 0; i < sorted.length; i += 1) {
    const workout = sorted[i];
    const exercise = (workout.exercises || []).find((item) => item.exerciseId === exerciseId);
    if (!exercise) continue;
    if (cardioUtil.isCardio(exercise)) {
      const cardio = cardioUtil.create(cardioUtil.typeFromExercise(exercise), exercise.cardio);
      if (!cardioUtil.isValid(cardio)) continue;
      return {
        workout,
        exercise: Object.assign({}, exercise, { cardio }),
        cardio,
        best: null,
        last: null
      };
    }
    const sets = (exercise.sets || []).filter((set) => set.completed);
    if (!sets.length) continue;
    const last = sets[sets.length - 1];
    const best = sets.reduce((winner, set) => {
      const winnerScore = exercise.type === 'weight_reps'
        ? format.estimated1RM(winner.weight, winner.reps)
        : (Number(winner.reps) || Number(winner.duration) || 0);
      const setScore = exercise.type === 'weight_reps'
        ? format.estimated1RM(set.weight, set.reps)
        : (Number(set.reps) || Number(set.duration) || 0);
      return setScore > winnerScore ? set : winner;
    }, sets[0]);
    return {
      workout,
      exercise,
      best,
      last
    };
  }
  return null;
}

function formatLastHint(performance, type, unit, weightKg) {
  if (!performance) return '';
  if (performance.cardio) {
    const cardio = cardioUtil.create(
      cardioUtil.typeFromExercise(performance.exercise),
      performance.cardio
    );
    if (!cardio.calories && Number(weightKg) > 0) {
      const estimate = cardioUtil.estimateCalories(
        cardio,
        cardioUtil.typeFromExercise(performance.exercise),
        weightKg
      );
      if (estimate > 0) cardio.calories = estimate;
    }
    return cardioUtil.summary(cardio, cardioUtil.typeFromExercise(performance.exercise));
  }
  if (!performance.last) return '';
  const setLine = format.formatSetLine(performance.last, type, unit || 'kg');
  const completedSets = (performance.exercise && performance.exercise.sets
    ? performance.exercise.sets
    : []).filter((set) => set.completed).length;
  return completedSets ? `${setLine} · ${completedSets} 组` : setLine;
}

function bestSetScore(set, type) {
  if (type === 'weight_reps') return format.estimated1RM(set.weight, set.reps);
  if (type === 'time') return Number(set.duration) || 0;
  return Number(set.reps) || 0;
}

function computePRs(workout, allWorkouts) {
  const previous = getCompletedWorkouts(allWorkouts).filter((item) => item.id !== workout.id);
  const prs = [];
  (workout.exercises || []).forEach((exercise) => {
    if (cardioUtil.isCardio(exercise)) return;
    const sets = (exercise.sets || []).filter((set) => set.completed);
    if (!sets.length) return;
    const currentBest = sets.reduce((winner, set) => (
      bestSetScore(set, exercise.type) > bestSetScore(winner, exercise.type) ? set : winner
    ), sets[0]);

    let previousBest = null;
    previous.forEach((oldWorkout) => {
      const oldExercise = (oldWorkout.exercises || []).find((item) => item.exerciseId === exercise.exerciseId);
      if (!oldExercise) return;
      (oldExercise.sets || []).filter((set) => set.completed).forEach((set) => {
        if (!previousBest || bestSetScore(set, exercise.type) > bestSetScore(previousBest, exercise.type)) {
          previousBest = set;
        }
      });
    });

    const currentScore = bestSetScore(currentBest, exercise.type);
    const previousScore = previousBest ? bestSetScore(previousBest, exercise.type) : 0;
    if (currentScore <= previousScore + 0.01) return;

    let label = '最佳表现';
    let value = '';
    let valueKg = 0;
    if (exercise.type === 'weight_reps') {
      label = '估算 1RM';
      valueKg = format.estimated1RM(currentBest.weight, currentBest.reps);
      value = format.formatWeight(valueKg, 'kg');
    } else if (exercise.type === 'time') {
      label = '最长计时';
      value = `${Number(currentBest.duration) || 0} 秒`;
    } else {
      label = '最多次数';
      value = `${Number(currentBest.reps) || 0} 次`;
    }

    prs.push({
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.name,
      label,
      value,
      valueKg,
      type: exercise.type,
      set: currentBest
    });
  });
  return prs;
}

function getPRList(workouts) {
  const completed = getCompletedWorkouts(workouts);
  const map = {};
  completed.forEach((workout) => {
    (workout.exercises || []).forEach((exercise) => {
      if (cardioUtil.isCardio(exercise)) {
        const cardioType = cardioUtil.typeFromExercise(exercise);
        const cardio = cardioUtil.create(cardioType, exercise.cardio);
        if (!cardioUtil.isValid(cardio)) return;
        const score = cardioUtil.durationSeconds(cardio);
        const current = map[exercise.exerciseId];
        if (!current || score > current.score) {
          map[exercise.exerciseId] = {
            exerciseId: exercise.exerciseId,
            exerciseName: exercise.name,
            muscle: exercise.muscle,
            type: 'cardio',
            cardio,
            cardioType,
            set: null,
            score,
            workoutId: workout.id,
            achievedAt: workout.endedAt || workout.startedAt
          };
        }
        return;
      }

      const sets = (exercise.sets || []).filter((set) => set.completed);
      if (!sets.length) return;
      const best = sets.reduce((winner, set) => (
        bestSetScore(set, exercise.type) > bestSetScore(winner, exercise.type) ? set : winner
      ), sets[0]);
      const score = bestSetScore(best, exercise.type);
      const current = map[exercise.exerciseId];
      if (!current || score > current.score) {
        map[exercise.exerciseId] = {
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.name,
          muscle: exercise.muscle,
          type: exercise.type,
          set: best,
          score,
          workoutId: workout.id,
          achievedAt: workout.endedAt || workout.startedAt
        };
      }
    });
  });
  return Object.keys(map).map((key) => map[key]).sort((a, b) => (
    new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime()
  ));
}

function getExerciseHistory(workouts, exerciseId) {
  return getCompletedWorkouts(workouts)
    .map((workout) => {
      const exercise = (workout.exercises || []).find((item) => item.exerciseId === exerciseId);
      if (!exercise) return null;
      if (cardioUtil.isCardio(exercise)) {
        const cardio = cardioUtil.create(cardioUtil.typeFromExercise(exercise), exercise.cardio);
        if (!cardioUtil.isValid(cardio)) return null;
        return {
          workout,
          exercise: Object.assign({}, exercise, { cardio }),
          sets: [],
          best: null,
          cardio,
          date: workout.endedAt || workout.startedAt
        };
      }
      const sets = (exercise.sets || []).filter((set) => set.completed);
      if (!sets.length) return null;
      const best = sets.reduce((winner, set) => (
        bestSetScore(set, exercise.type) > bestSetScore(winner, exercise.type) ? set : winner
      ), sets[0]);
      return {
        workout,
        exercise,
        sets,
        best,
        date: workout.endedAt || workout.startedAt
      };
    })
    .filter(Boolean);
}

function getWeeklyStats(workouts, goal) {
  const start = dateUtil.startOfWeek(new Date());
  const end = dateUtil.addDays(start, 7);
  const current = getCompletedWorkouts(workouts).filter((workout) => {
    const time = new Date(workout.endedAt || workout.startedAt).getTime();
    return time >= start.getTime() && time < end.getTime();
  });
  const sets = current.reduce((sum, workout) => sum + countCompletedSets(workout), 0);
  const volumeKg = current.reduce((sum, workout) => sum + totalVolume(workout), 0);
  const cardioSeconds = current.reduce((sum, workout) => sum + totalCardioSeconds(workout), 0);
  const target = Math.max(1, Number(goal) || 3);
  return {
    count: current.length,
    goal: target,
    sets,
    volumeKg,
    cardioSeconds,
    cardioLabel: cardioUtil.formatDuration(cardioSeconds),
    percent: Math.min(100, Math.round((current.length / target) * 100)),
    remaining: Math.max(0, target - current.length)
  };
}

function getFourWeekStats(workouts) {
  const currentWeekStart = dateUtil.startOfWeek(new Date());
  const completed = getCompletedWorkouts(workouts);
  const result = [];
  for (let offset = 3; offset >= 0; offset -= 1) {
    const start = dateUtil.addDays(currentWeekStart, -7 * offset);
    const end = dateUtil.addDays(start, 7);
    const count = completed.filter((workout) => {
      const time = new Date(workout.endedAt || workout.startedAt).getTime();
      return time >= start.getTime() && time < end.getTime();
    }).length;
    result.push({
      label: dateUtil.getWeekLabel(start),
      count
    });
  }
  const max = Math.max(1, ...result.map((item) => item.count));
  return result.map((item) => Object.assign({}, item, {
    height: item.count ? Math.max(14, Math.round((item.count / max) * 100)) : 4
  }));
}

function getMuscleDistribution(workouts, days) {
  const range = Number(days) || 28;
  const start = dateUtil.addDays(dateUtil.startOfDay(new Date()), -range);
  const counts = {};
  let total = 0;
  getCompletedWorkouts(workouts).forEach((workout) => {
    const time = new Date(workout.endedAt || workout.startedAt).getTime();
    if (time < start.getTime()) return;
    (workout.exercises || []).forEach((exercise) => {
      const completed = (exercise.sets || []).filter((set) => set.completed).length;
      if (!completed) return;
      counts[exercise.muscle] = (counts[exercise.muscle] || 0) + completed;
      total += completed;
    });
  });
  return Object.keys(counts)
    .map((muscle) => ({
      muscle,
      count: counts[muscle],
      percent: total ? Math.round((counts[muscle] / total) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);
}

function getExerciseTrend(workouts, exerciseId, limit) {
  const history = getExerciseHistory(workouts, exerciseId)
    .slice(0, Number(limit) || 8);
  const grouped = {};

  history.forEach((item) => {
    const dateKey = dateUtil.toDateKey(item.date);
    const isCardio = !!item.cardio;
    const best = item.best;
    const score = isCardio
      ? cardioUtil.durationSeconds(item.cardio)
      : bestSetScore(best, item.exercise.type);
    const volumeKg = isCardio ? 0 : exerciseVolume(item.exercise);
    const totalReps = isCardio
      ? 0
      : (item.sets || []).reduce((sum, set) => sum + (Number(set.reps) || 0), 0);
    const totalDuration = isCardio
      ? score
      : (item.sets || []).reduce((sum, set) => sum + (Number(set.duration) || 0), 0);
    const distanceKm = isCardio ? Number(item.cardio.distanceKm) || 0 : 0;
    const calories = isCardio ? Number(item.cardio.calories) || 0 : 0;
    const setsCount = isCardio ? 1 : (item.sets || []).length;

    if (!grouped[dateKey]) {
      grouped[dateKey] = {
        workoutId: item.workout.id,
        date: item.date,
        label: dateUtil.formatShort(item.date),
        dateLabel: dateUtil.formatMonthDay(item.date),
        score,
        weightKg: best ? Number(best.weight) || 0 : 0,
        reps: best ? Number(best.reps) || 0 : 0,
        duration: best ? Number(best.duration) || 0 : score,
        type: isCardio ? 'cardio' : item.exercise.type,
        cardioType: isCardio ? cardioUtil.typeFromExercise(item.exercise) : '',
        set: best || null,
        cardio: item.cardio || null,
        cardioSummary: isCardio
          ? cardioUtil.summary(item.cardio, cardioUtil.typeFromExercise(item.exercise))
          : '',
        volumeKg,
        totalReps,
        totalDuration,
        distanceKm,
        calories,
        setsCount
      };
      return;
    }

    const entry = grouped[dateKey];
    entry.volumeKg += volumeKg;
    entry.totalReps += totalReps;
    entry.totalDuration += totalDuration;
    entry.distanceKm += distanceKm;
    entry.calories += calories;
    entry.setsCount += setsCount;
    entry.workoutId = item.workout.id;
    if (score > entry.score) {
      entry.score = score;
      entry.weightKg = best ? Number(best.weight) || 0 : 0;
      entry.reps = best ? Number(best.reps) || 0 : 0;
      entry.duration = best ? Number(best.duration) || 0 : score;
      entry.set = best || null;
      entry.cardio = item.cardio || null;
      entry.cardioSummary = isCardio
        ? cardioUtil.summary(item.cardio, cardioUtil.typeFromExercise(item.exercise))
        : '';
    }
  });

  const items = Object.keys(grouped)
    .map((key) => grouped[key])
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const max = Math.max(1, ...items.map((item) => item.score));
  return items.map((item) => Object.assign({}, item, {
    height: item.score ? Math.max(12, Math.round((item.score / max) * 100)) : 4
  }));
}

function composeWorkoutName(exercises) {
  const muscles = [];
  (exercises || []).forEach((exercise) => {
    if (exercise.muscle && muscles.indexOf(exercise.muscle) < 0) muscles.push(exercise.muscle);
  });
  if (!muscles.length) return '自由训练';
  if (muscles.length === 1) return `${muscles[0]}训练`;
  // Show every trained body part in the auto-generated workout name.
  return muscles.join(' + ');
}

function getRecentExerciseIds(workouts, limit) {
  const ids = [];
  getCompletedWorkouts(workouts).forEach((workout) => {
    (workout.exercises || []).forEach((exercise) => {
      if (ids.indexOf(exercise.exerciseId) < 0 && ids.length < (limit || 12)) {
        ids.push(exercise.exerciseId);
      }
    });
  });
  return ids;
}

function getExerciseOptions(workouts) {
  const map = {};
  getCompletedWorkouts(workouts).forEach((workout) => {
    (workout.exercises || []).forEach((exercise) => {
      if (!map[exercise.exerciseId]) {
        map[exercise.exerciseId] = {
          id: exercise.exerciseId,
          name: exercise.name,
          muscle: exercise.muscle,
          type: exercise.type,
          cardioType: exercise.cardioType || ''
        };
      }
    });
  });
  return Object.keys(map).map((key) => map[key]);
}

module.exports = {
  makeId,
  createSet,
  createWorkoutExercise,
  createWorkout,
  duplicateWorkout,
  finishWorkout,
  stripWorkoutForStorage,
  sortWorkouts,
  getCompletedWorkouts,
  countCompletedSets,
  totalVolume,
  durationMs,
  workoutStats,
  getLastExercisePerformance,
  formatLastHint,
  computePRs,
  getPRList,
  getExerciseHistory,
  getWeeklyStats,
  getFourWeekStats,
  getMuscleDistribution,
  getExerciseTrend,
  composeWorkoutName,
  getRecentExerciseIds,
  getExerciseOptions
};
