const storage = require('./storage');
const exercises = require('./exercises');
const workoutUtil = require('./workout');
const timeUtil = require('./time');

function makeDate(daysAgo, hour) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour || 18, 30, 0, 0);
  return d;
}

function buildWorkout(name, daysAgo, items, settings) {
  const start = makeDate(daysAgo);
  const workout = workoutUtil.createWorkout(settings, { name });
  workout.startedAt = timeUtil.toChinaIso(start);
  workout.exercises = items.map((item) => {
    const exercise = exercises.findById(item.id);
    const workoutExercise = workoutUtil.createWorkoutExercise(exercise, settings, '');
    workoutExercise.sets = item.sets.map((values) => {
      const set = workoutUtil.createSet(exercise.type);
      set.weight = values[0] || 0;
      set.reps = values[1] || 0;
      set.duration = values[2] || 0;
      set.completed = true;
      return set;
    });
    return workoutExercise;
  });
  workout.endedAt = timeUtil.toChinaIso(new Date(start.getTime() + 55 * 60 * 1000));
  workout.status = 'completed';
  return workout;
}

function seedDemoData() {
  const db = storage.getDB();
  const settings = Object.assign({}, db.settings, {
    onboarded: true,
    weeklyGoal: 3,
    restSeconds: 90,
    unit: db.settings.unit || 'kg'
  });

  db.workouts = [
    buildWorkout('胸 + 三头', 10, [
      { id: 'bench_press', sets: [[60, 8], [60, 8], [60, 7]] },
      { id: 'cable_fly', sets: [[15, 12], [15, 12], [15, 10]] },
      { id: 'triceps_pushdown', sets: [[20, 12], [20, 12], [20, 10]] }
    ], settings),
    buildWorkout('背 + 二头', 7, [
      { id: 'lat_pulldown', sets: [[50, 10], [50, 10], [50, 8]] },
      { id: 'barbell_row', sets: [[40, 10], [40, 10], [40, 8]] },
      { id: 'barbell_curl', sets: [[20, 10], [20, 10], [20, 8]] }
    ], settings),
    buildWorkout('腿', 4, [
      { id: 'back_squat', sets: [[80, 8], [80, 8], [80, 7]] },
      { id: 'leg_press', sets: [[120, 10], [120, 10], [120, 10]] },
      { id: 'leg_curl', sets: [[30, 12], [30, 12], [30, 10]] }
    ], settings),
    buildWorkout('胸 + 肩', 2, [
      { id: 'bench_press', sets: [[62.5, 8], [62.5, 8], [62.5, 7]] },
      { id: 'overhead_press', sets: [[30, 8], [30, 8], [30, 7]] },
      { id: 'lateral_raise', sets: [[8, 12], [8, 12], [8, 10]] }
    ], settings),
    buildWorkout('背', 1, [
      { id: 'deadlift', sets: [[100, 5], [100, 5], [100, 5]] },
      { id: 'pull_up', sets: [[0, 8], [0, 8], [0, 7]] }
    ], settings)
  ];

  db.settings = settings;
  db.activeWorkout = null;
  storage.saveDB(db);
  return db;
}

module.exports = {
  seedDemoData
};
