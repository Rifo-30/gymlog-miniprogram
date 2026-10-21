const dateUtil = require('./date');

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildExport(db) {
  return {
    app: '练记',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: db.settings,
    workouts: db.workouts,
    customExercises: db.customExercises
  };
}

function exportJSON(db) {
  return JSON.stringify(buildExport(db), null, 2);
}

function exportCSV(db) {
  const rows = [
    [
      'workout_id',
      'workout_name',
      'date',
      'started_at',
      'ended_at',
      'status',
      'exercise',
      'muscle',
      'set_index',
      'weight_kg',
      'reps',
      'duration_sec',
      'completed',
      'exercise_note',
      'workout_note'
    ]
  ];
  (db.workouts || []).forEach((workout) => {
    (workout.exercises || []).forEach((exercise) => {
      (exercise.sets || []).forEach((set, index) => {
        rows.push([
          workout.id,
          workout.name,
          dateUtil.toDateKey(workout.endedAt || workout.startedAt),
          workout.startedAt,
          workout.endedAt || '',
          workout.status,
          exercise.name,
          exercise.muscle,
          index + 1,
          set.weight || 0,
          set.reps || 0,
          set.duration || 0,
          set.completed ? '1' : '0',
          exercise.note || '',
          workout.note || ''
        ]);
      });
    });
  });
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}

function copyText(text, successMessage) {
  wx.setClipboardData({
    data: text,
    success: () => {
      wx.showToast({
        title: successMessage || '已复制到剪贴板',
        icon: 'success'
      });
    },
    fail: () => {
      wx.showToast({ title: '复制失败', icon: 'none' });
    }
  });
}

module.exports = {
  buildExport,
  exportJSON,
  exportCSV,
  copyText
};
