const workoutUtil = require('./workout');
const cardioUtil = require('./cardio');
const timeUtil = require('./time');

function makeId() {
  return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function clampInt(value, min, max, fallback) {
  const parsed = Math.round(Number(value) || 0);
  if (!parsed) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeExercise(item) {
  const source = item || {};
  const type = source.type || (source.cardioType ? 'cardio' : 'weight_reps');
  const isCardio = type === 'cardio' || !!source.cardioType;
  return {
    exerciseId: source.exerciseId || source.id || '',
    name: source.name || '未命名动作',
    muscle: source.muscle || '其他',
    equipment: source.equipment || '其他',
    type: isCardio ? 'cardio' : type,
    cardioType: isCardio ? (source.cardioType || '') : '',
    targetSets: isCardio ? 1 : clampInt(source.targetSets, 1, 12, 3),
    targetReps: type === 'weight_reps' || type === 'reps'
      ? clampInt(source.targetReps, 1, 100, 8)
      : 0,
    targetDurationMin: isCardio || type === 'time'
      ? clampInt(source.targetDurationMin, 1, 180, 30)
      : 0,
    restSeconds: clampInt(source.restSeconds, 15, 600, 90)
  };
}

function normalizeTemplate(template) {
  const source = template || {};
  const exercises = (source.exercises || [])
    .map(normalizeExercise)
    .filter((item) => item.exerciseId);
  return {
    id: source.id || makeId(),
    name: String(source.name || '未命名模板').trim().slice(0, 30),
    exercises,
    note: String(source.note || '').slice(0, 500),
    createdAt: source.createdAt || timeUtil.nowChinaIso(),
    updatedAt: source.updatedAt || timeUtil.nowChinaIso()
  };
}

function createTemplate(name, exercises, note) {
  return normalizeTemplate({
    id: makeId(),
    name,
    exercises,
    note,
    createdAt: timeUtil.nowChinaIso(),
    updatedAt: timeUtil.nowChinaIso()
  });
}

function getTemplates(templates) {
  return (templates || [])
    .map(normalizeTemplate)
    .filter((template) => template.exercises.length)
    .sort((a, b) => (
      new Date(b.updatedAt || b.createdAt || 0).getTime()
      - new Date(a.updatedAt || a.createdAt || 0).getTime()
    ));
}

function findTemplate(templates, id) {
  return getTemplates(templates).find((item) => item.id === id) || null;
}

function frequentReps(sets) {
  const counts = {};
  let winner = 8;
  let winnerCount = 0;
  (sets || []).forEach((set) => {
    const reps = Math.round(Number(set.reps) || 0);
    if (!reps) return;
    counts[reps] = (counts[reps] || 0) + 1;
    if (counts[reps] > winnerCount || (counts[reps] === winnerCount && reps > winner)) {
      winner = reps;
      winnerCount = counts[reps];
    }
  });
  return winner;
}

function fromWorkout(workout) {
  const source = workout || {};
  const exercises = (source.exercises || []).map((exercise) => {
    const isCardio = cardioUtil.isCardio(exercise);
    const completedSets = (exercise.sets || []).filter((set) => set.completed);
    if (isCardio) {
      const cardio = cardioUtil.create(cardioUtil.typeFromExercise(exercise), exercise.cardio);
      return normalizeExercise({
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        muscle: exercise.muscle,
        equipment: exercise.equipment,
        type: 'cardio',
        cardioType: cardioUtil.typeFromExercise(exercise),
        targetDurationMin: Math.max(1, Math.ceil(cardioUtil.durationSeconds(cardio) / 60)),
        restSeconds: exercise.restSeconds
      });
    }
    const durationSet = completedSets.find((set) => Number(set.duration) > 0);
    return normalizeExercise({
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      muscle: exercise.muscle,
      equipment: exercise.equipment,
      type: exercise.type,
      targetSets: completedSets.length || 3,
      targetReps: frequentReps(completedSets),
      targetDurationMin: durationSet
        ? Math.max(1, Math.ceil((Number(durationSet.duration) || 0) / 60))
        : 0,
      restSeconds: exercise.restSeconds
    });
  }).filter((exercise) => exercise.exerciseId);

  const baseName = String(source.name || '上次训练').replace(/模板$/, '').trim();
  return createTemplate(baseName ? `${baseName}模板` : '上次训练模板', exercises, '');
}

function createWorkoutFromTemplate(template, db) {
  const normalized = normalizeTemplate(template);
  const settings = (db && db.settings) || {};
  const workouts = (db && db.workouts) || [];
  const unit = settings.unit || 'kg';
  const profile = (db && db.profile) || {};
  const workout = workoutUtil.createWorkout(settings, {
    name: normalized.name,
    exercises: []
  });

  normalized.exercises.forEach((item) => {
    const performance = workoutUtil.getLastExercisePerformance(workouts, item.exerciseId);
    const defaultSet = performance && performance.last
      ? performance.last
      : { reps: item.targetReps || 0, duration: 0 };
    let defaultCardio = performance ? performance.cardio : null;
    if (!defaultCardio && item.cardioType) {
      defaultCardio = {
        mode: 'steady',
        durationSec: Math.max(0, Number(item.targetDurationMin) || 0) * 60
      };
    }
    const exercise = workoutUtil.createWorkoutExercise(
      Object.assign({}, item, { id: item.exerciseId }),
      settings,
      workoutUtil.formatLastHint(performance, item.type, unit, profile.weightKg),
      defaultSet,
      defaultCardio
    );
    exercise.templateId = normalized.id;
    exercise.targetSets = item.targetSets;
    exercise.targetReps = item.targetReps;
    exercise.targetDurationMin = item.targetDurationMin;
    exercise.restSeconds = item.restSeconds || settings.restSeconds || 90;

    if (!cardioUtil.isCardio(exercise)) {
      while (exercise.sets.length < item.targetSets) {
        exercise.sets.push(workoutUtil.createSet(exercise.type, exercise.sets[0]));
      }
      if (!performance && item.targetReps) {
        exercise.sets = exercise.sets.map((set) => Object.assign({}, set, { reps: item.targetReps }));
      }
    }
    workout.exercises.push(exercise);
  });

  workout.templateId = normalized.id;
  workout.templateName = normalized.name;
  return workout;
}

module.exports = {
  normalizeExercise,
  normalizeTemplate,
  createTemplate,
  getTemplates,
  findTemplate,
  fromWorkout,
  createWorkoutFromTemplate
};
