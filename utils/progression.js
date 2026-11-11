const format = require('./format');
const cardioUtil = require('./cardio');

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function clampInt(value, min, max, fallback) {
  const parsed = Math.round(number(value));
  if (!parsed) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function sortCompleted(workouts) {
  return (workouts || [])
    .filter((item) => item && item.status === 'completed')
    .slice()
    .sort((a, b) => (
      new Date(b.endedAt || b.startedAt || 0).getTime()
      - new Date(a.endedAt || a.startedAt || 0).getTime()
    ));
}

function getRecentExerciseSessions(workouts, exerciseId, limit) {
  const sessions = [];
  const max = Math.max(1, Number(limit) || 3);
  sortCompleted(workouts).some((workout) => {
    const exercise = (workout.exercises || []).find((item) => item.exerciseId === exerciseId);
    if (!exercise) return false;
    sessions.push({ workout, exercise });
    return sessions.length >= max;
  });
  return sessions;
}

function mostCommonReps(sets) {
  const counts = {};
  let winner = 0;
  let winnerCount = -1;
  (sets || []).forEach((set) => {
    const reps = Math.round(number(set.reps));
    if (reps <= 0) return;
    counts[reps] = (counts[reps] || 0) + 1;
    if (counts[reps] > winnerCount || (counts[reps] === winnerCount && reps > winner)) {
      winner = reps;
      winnerCount = counts[reps];
    }
  });
  return winner;
}

function equipmentIncrement(equipment) {
  if (equipment === '哑铃') return 2;
  if (equipment === '杠铃') return 2.5;
  if (equipment === '绳索') return 2.5;
  if (equipment === '器械') return 2.5;
  if (equipment === '自重') return 0;
  return 2.5;
}

function roundToIncrement(weight, increment) {
  const value = Math.max(0, number(weight));
  if (!increment) return format.roundTo(value, 1);
  return format.roundTo(Math.round(value / increment) * increment, 1);
}

function makeStrengthSuggestion(latest, targetSets, targetReps) {
  const sets = (latest.exercise.sets || []).filter((set) => set.completed);
  if (!sets.length) return null;
  const isWeighted = latest.exercise.type === 'weight_reps';
  const usableSets = sets.filter((set) => number(set.reps) > 0);
  if (!usableSets.length) return null;

  const weights = usableSets.map((set) => number(set.weight));
  const baseWeight = isWeighted ? Math.max.apply(null, weights) : 0;
  const maxReps = Math.max.apply(null, usableSets.map((set) => number(set.reps)));
  const suggestedReps = clampInt(targetReps, 1, 50, mostCommonReps(usableSets) || maxReps || 8);
  const suggestedSets = clampInt(targetSets, 1, 12, usableSets.length || 1);
  const achievedSets = usableSets.filter((set) => number(set.reps) >= suggestedReps).length;
  const increment = equipmentIncrement(latest.exercise.equipment);
  let weight = baseWeight;
  let reps = suggestedReps;
  let action = 'maintain';
  let changeLabel = '保持重量';
  let reason = `上次有 ${achievedSets}/${suggestedSets} 组达到 ${suggestedReps} 次，先稳定动作质量`;

  if (usableSets.length < suggestedSets) {
    if (achievedSets > 0) {
      reason = `上次完成 ${usableSets.length}/${suggestedSets} 组，先补齐目标组数`;
    } else {
      action = 'reduce';
      if (isWeighted && baseWeight > 0 && increment > 0) {
        weight = roundToIncrement(baseWeight * 0.95, increment);
        if (weight >= baseWeight) weight = Math.max(0, baseWeight - increment);
        changeLabel = `-${format.trimNumber(Math.max(0, baseWeight - weight), 1)} kg`;
      } else {
        reps = Math.max(1, suggestedReps - 1);
        changeLabel = '-1 次';
      }
      reason = '上次完成度较低，建议先减轻负担找回落点';
    }
  } else if (achievedSets >= suggestedSets) {
    action = 'increase';
    if (isWeighted && baseWeight > 0 && increment > 0) {
      weight = roundToIncrement(baseWeight + increment, increment);
      changeLabel = `+${format.trimNumber(weight - baseWeight, 1)} kg`;
      reason = `上次完成 ${suggestedSets} 组 × ${suggestedReps} 次，建议小幅加重`;
    } else {
      reps = suggestedReps + 1;
      changeLabel = '+1 次';
      reason = `上次完成 ${suggestedSets} 组 × ${suggestedReps} 次，建议下次多做 1 次`;
    }
  } else if (maxReps >= suggestedReps || achievedSets >= suggestedSets - 1) {
    action = 'maintain';
    reason = `上次接近 ${suggestedReps} 次目标，先保持重量把次数做稳`;
  } else {
    action = 'reduce';
    if (isWeighted && baseWeight > 0 && increment > 0) {
      weight = roundToIncrement(baseWeight * 0.95, increment);
      if (weight >= baseWeight) weight = Math.max(0, baseWeight - increment);
      changeLabel = `-${format.trimNumber(Math.max(0, baseWeight - weight), 1)} kg`;
    } else {
      reps = Math.max(1, suggestedReps - 1);
      changeLabel = '-1 次';
    }
    reason = '多数组未达到目标次数，建议略减重量后重新累积';
  }

  return {
    available: true,
    type: latest.exercise.type,
    action,
    actionLabel: action === 'increase' ? '可加重' : (action === 'reduce' ? '建议减重' : '建议维持'),
    weight,
    reps,
    sets: suggestedSets,
    duration: 0,
    changeLabel,
    reason,
    sourceDate: latest.workout.endedAt || latest.workout.startedAt
  };
}

function makeRepsSuggestion(latest, targetSets, targetReps) {
  const sets = (latest.exercise.sets || []).filter((set) => set.completed && number(set.reps) > 0);
  if (!sets.length) return null;
  const maxReps = Math.max.apply(null, sets.map((set) => number(set.reps)));
  const suggestedReps = clampInt(targetReps, 1, 100, maxReps || 8);
  const suggestedSets = clampInt(targetSets, 1, 12, sets.length || 1);
  const achieved = sets.filter((set) => number(set.reps) >= suggestedReps).length;
  let reps = suggestedReps;
  let action = 'maintain';
  let changeLabel = '保持次数';
  let reason = `上次有 ${achieved}/${suggestedSets} 组达到 ${suggestedReps} 次`;
  if (achieved >= suggestedSets) {
    reps = suggestedReps + 1;
    action = 'increase';
    changeLabel = '+1 次';
    reason = `上次完成 ${suggestedSets} 组 × ${suggestedReps} 次，建议下次多做 1 次`;
  }
  return {
    available: true,
    type: latest.exercise.type,
    action,
    actionLabel: action === 'increase' ? '可进步' : '建议维持',
    weight: 0,
    reps,
    sets: suggestedSets,
    duration: 0,
    changeLabel,
    reason,
    sourceDate: latest.workout.endedAt || latest.workout.startedAt
  };
}

function makeTimeSuggestion(latest, targetSets, targetDurationSec) {
  const sets = (latest.exercise.sets || []).filter((set) => set.completed && number(set.duration) > 0);
  if (!sets.length) return null;
  const maxDuration = Math.max.apply(null, sets.map((set) => number(set.duration)));
  const suggestedDuration = clampInt(targetDurationSec, 5, 7200, maxDuration);
  const suggestedSets = clampInt(targetSets, 1, 12, sets.length || 1);
  const achieved = sets.filter((set) => number(set.duration) >= suggestedDuration).length;
  let duration = suggestedDuration;
  let action = 'maintain';
  let changeLabel = '保持时长';
  let reason = `上次有 ${achieved}/${suggestedSets} 组达到 ${suggestedDuration} 秒`;
  if (achieved >= suggestedSets) {
    duration = suggestedDuration + Math.max(5, Math.round(suggestedDuration * 0.05 / 5) * 5);
    action = 'increase';
    changeLabel = `+${duration - suggestedDuration} 秒`;
    reason = `上次完成 ${suggestedSets} 组，建议下次延长约 5%`;
  }
  return {
    available: true,
    type: latest.exercise.type,
    action,
    actionLabel: action === 'increase' ? '可进步' : '建议维持',
    weight: 0,
    reps: 0,
    sets: suggestedSets,
    duration,
    changeLabel,
    reason,
    sourceDate: latest.workout.endedAt || latest.workout.startedAt
  };
}

function makeCardioSuggestion(latest, targetDurationMin) {
  const cardio = cardioUtil.create(
    cardioUtil.typeFromExercise(latest.exercise),
    latest.exercise.cardio
  );
  const duration = cardioUtil.durationSeconds(cardio);
  if (!cardioUtil.isValid(cardio)) return null;
  const target = Math.max(0, Math.round(number(targetDurationMin) * 60));
  return {
    available: true,
    type: 'cardio',
    action: 'maintain',
    actionLabel: '建议基线',
    weight: 0,
    reps: 0,
    sets: 1,
    duration: target || duration,
    cardioMode: cardio.mode,
    changeLabel: target ? `目标 ${cardioUtil.formatDuration(target)}` : '沿用上次数据',
    reason: target
      ? '按模板目标时长开始，完成后再逐步增加时长或强度'
      : '先沿用上次时长和强度，保持可持续进步',
    sourceDate: latest.workout.endedAt || latest.workout.startedAt
  };
}

function suggest(workouts, exercise, unit) {
  if (!exercise || !exercise.exerciseId) return null;
  const sessions = getRecentExerciseSessions(workouts, exercise.exerciseId, 3);
  if (!sessions.length) return null;
  const latest = sessions[0];
  const isCardio = cardioUtil.isCardio(latest.exercise);
  let suggestion = null;

  if (isCardio) {
    suggestion = makeCardioSuggestion(latest, exercise.targetDurationMin);
  } else if (latest.exercise.type === 'weight_reps') {
    suggestion = makeStrengthSuggestion(latest, exercise.targetSets, exercise.targetReps);
  } else if (latest.exercise.type === 'reps') {
    suggestion = makeRepsSuggestion(latest, exercise.targetSets, exercise.targetReps);
  } else if (latest.exercise.type === 'time') {
    const targetDurationSec = number(exercise.targetDurationMin) > 0
      ? number(exercise.targetDurationMin) * 60
      : 0;
    suggestion = makeTimeSuggestion(latest, exercise.targetSets, targetDurationSec);
  }

  if (!suggestion) return null;
  suggestion.label = formatSuggestion(suggestion, latest.exercise, unit || 'kg');
  return suggestion;
}

function formatSuggestion(suggestion, exercise, unit) {
  if (!suggestion) return '';
  if (suggestion.type === 'cardio') {
    return cardioUtil.formatDuration(suggestion.duration);
  }
  if (suggestion.type === 'time') {
    return `${suggestion.duration} 秒 · ${suggestion.sets} 组`;
  }
  if (suggestion.type === 'reps') {
    return `${suggestion.reps} 次 · ${suggestion.sets} 组`;
  }
  if (number(suggestion.weight) > 0) {
    return `${format.formatWeight(suggestion.weight, unit || 'kg')} × ${suggestion.reps} · ${suggestion.sets} 组`;
  }
  return `自重 × ${suggestion.reps} 次 · ${suggestion.sets} 组`;
}

module.exports = {
  getRecentExerciseSessions,
  equipmentIncrement,
  suggest
};
