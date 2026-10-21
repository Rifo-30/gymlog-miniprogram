const TYPES = {
  treadmill_run: {
    label: '跑步机跑步',
    showIncline: true,
    showDistance: true,
    paceKind: 'run'
  },
  treadmill_incline: {
    label: '跑步机爬坡',
    showAvgIncline: true,
    showAvgSpeed: true,
    showDistance: true,
    paceKind: 'run'
  },
  cycling: {
    label: '单车',
    showLevel: true,
    showCadence: true,
    showAvgPower: true,
    showDistance: true,
    paceKind: 'cycling'
  },
  rowing: {
    label: '划船机',
    showStrokeRate: true,
    showDamper: true,
    showAvgPower: true,
    showDistance: true,
    paceKind: 'rowing'
  },
  jump_rope: {
    label: '跳绳',
    showCount: true,
    showMisses: true
  },
  swimming: {
    label: '游泳',
    showPoolLength: true,
    showStroke: true,
    showDistance: true,
    paceKind: 'swim'
  }
};

const EXERCISE_TYPE_MAP = {
  treadmill: 'treadmill_run',
  treadmill_incline_walk: 'treadmill_incline',
  cycling: 'cycling',
  rowing_machine: 'rowing',
  jump_rope: 'jump_rope',
  swimming: 'swimming'
};

function typeFromExercise(exercise) {
  if (!exercise) return 'generic';
  return exercise.cardioType || EXERCISE_TYPE_MAP[exercise.exerciseId] || 'generic';
}

function getMeta(type) {
  return TYPES[type] || { label: '有氧训练' };
}

function isCardio(exercise) {
  if (!exercise) return false;
  if (exercise.type === 'cardio') return true;
  // Only recognized cardio types count. A generic/empty marker on a
  // strength exercise must never turn it into a cardio card.
  return !!(exercise.cardioType && TYPES[exercise.cardioType]);
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function create(type, base) {
  const source = base || {};
  return {
    mode: source.mode === 'interval' ? 'interval' : 'steady',
    durationSec: Math.max(0, Math.round(numberOrZero(source.durationSec))),
    distanceKm: Math.max(0, numberOrZero(source.distanceKm)),
    incline: Math.max(0, numberOrZero(source.incline)),
    avgIncline: Math.max(0, numberOrZero(source.avgIncline)),
    avgSpeed: Math.max(0, numberOrZero(source.avgSpeed)),
    avgPower: Math.max(0, Math.round(numberOrZero(source.avgPower))),
    damper: Math.max(0, Math.round(numberOrZero(source.damper))),
    level: Math.max(0, numberOrZero(source.level)),
    cadence: Math.max(0, Math.round(numberOrZero(source.cadence))),
    strokeRate: Math.max(0, Math.round(numberOrZero(source.strokeRate))),
    rounds: Math.max(0, Math.round(numberOrZero(source.rounds))),
    workSec: Math.max(0, Math.round(numberOrZero(source.workSec))),
    restSec: Math.max(0, Math.round(numberOrZero(source.restSec))),
    poolLength: Math.max(0, numberOrZero(source.poolLength || 25)),
    strokeType: source.strokeType || '自由泳',
    count: Math.max(0, Math.round(numberOrZero(source.count))),
    avgHeartRate: Math.max(0, Math.round(numberOrZero(source.avgHeartRate))),
    calories: Math.max(0, Math.round(numberOrZero(source.calories))),
    caloriesManual: !!source.caloriesManual,
    misses: Math.max(0, Math.round(numberOrZero(source.misses))),
    notes: source.notes || ''
  };
}

function durationSeconds(cardio) {
  const data = cardio || {};
  if (data.mode === 'interval') {
    const rounds = Math.max(0, numberOrZero(data.rounds));
    const work = Math.max(0, numberOrZero(data.workSec));
    const rest = Math.max(0, numberOrZero(data.restSec));
    return Math.round(rounds * work + Math.max(0, rounds - 1) * rest);
  }
  return Math.max(0, Math.round(numberOrZero(data.durationSec)));
}

function isValid(cardio) {
  return durationSeconds(cardio) > 0
    || numberOrZero(cardio && cardio.distanceKm) > 0
    || numberOrZero(cardio && cardio.count) > 0;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(numberOrZero(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function trimNumber(value, digits) {
  const factor = Math.pow(10, digits == null ? 1 : digits);
  const rounded = Math.round((numberOrZero(value)) * factor) / factor;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function effectiveSpeedKmh(cardio) {
  const data = cardio || {};
  const avgSpeed = numberOrZero(data.avgSpeed);
  if (avgSpeed > 0) return avgSpeed;
  const seconds = durationSeconds(data);
  const distance = numberOrZero(data.distanceKm);
  if (seconds > 0 && distance > 0) return distance / (seconds / 3600);
  return 0;
}

function estimateCalories(cardio, type, weightKg) {
  const weight = numberOrZero(weightKg);
  const minutes = durationSeconds(cardio) / 60;
  const speedKmh = effectiveSpeedKmh(cardio);
  if (weight <= 0 || minutes <= 0 || speedKmh <= 0) return 0;
  if (type !== 'treadmill_incline' && type !== 'treadmill_run') return 0;

  const speedMetersPerMin = speedKmh * 1000 / 60;
  let vo2;
  if (type === 'treadmill_incline') {
    const grade = numberOrZero(cardio && cardio.avgIncline) / 100;
    vo2 = 0.1 * speedMetersPerMin + 1.8 * speedMetersPerMin * grade + 3.5;
  } else {
    const grade = numberOrZero(cardio && cardio.incline) / 100;
    vo2 = 0.2 * speedMetersPerMin + 0.9 * speedMetersPerMin * grade + 3.5;
  }
  return Math.max(0, Math.round(vo2 * weight * minutes / 200));
}

function paceText(cardio, type) {
  if (type === 'treadmill_incline') return '';
  const seconds = durationSeconds(cardio);
  const distance = numberOrZero(cardio && cardio.distanceKm);
  if (seconds <= 0) return '';
  if (type === 'cycling' && distance > 0) {
    const speed = distance / (seconds / 3600);
    return `${trimNumber(speed, 1)} km/h`;
  }
  if (distance <= 0) return '';
  if (type === 'rowing') {
    const splitSeconds = seconds / (distance / 0.5);
    return `${formatDuration(splitSeconds)} / 500m`;
  }
  if (type === 'swimming') {
    const splitSeconds = seconds / (distance / 0.1);
    return `${formatDuration(splitSeconds)} / 100m`;
  }
  const paceSeconds = seconds / distance;
  return `${formatDuration(paceSeconds)} / km`;
}

function summary(cardio, type) {
  if (!cardio) return '';
  const parts = [];
  const total = durationSeconds(cardio);
  parts.push(formatDuration(total));
  if (cardio.mode === 'interval') {
    parts.push(`${Math.max(0, Math.round(numberOrZero(cardio.rounds)))} 回合`);
  }
  if (numberOrZero(cardio.distanceKm) > 0) {
    parts.push(`${trimNumber(cardio.distanceKm, 2)} km`);
  }
  if (numberOrZero(cardio.count) > 0) {
    parts.push(`${Math.round(numberOrZero(cardio.count))} 次`);
  }
  const pace = paceText(cardio, type);
  if (pace) parts.push(pace);
  if (type !== 'treadmill_incline' && numberOrZero(cardio.incline) > 0) {
    parts.push(`坡度 ${trimNumber(cardio.incline, 1)}%`);
  }
  if (numberOrZero(cardio.avgIncline) > 0) {
    parts.push(`平均坡度 ${trimNumber(cardio.avgIncline, 1)}`);
  }
  if (numberOrZero(cardio.avgSpeed) > 0) {
    parts.push(`平均速度 ${trimNumber(cardio.avgSpeed, 1)} km/h`);
  }
  if (numberOrZero(cardio.avgPower) > 0) {
    parts.push(`功率 ${Math.round(numberOrZero(cardio.avgPower))}W`);
  }
  if (numberOrZero(cardio.damper) > 0) {
    parts.push(`档位 ${Math.round(numberOrZero(cardio.damper))}`);
  }
  if (numberOrZero(cardio.misses) > 0) {
    parts.push(`中断 ${Math.round(numberOrZero(cardio.misses))} 次`);
  }
  if (numberOrZero(cardio.avgHeartRate) > 0) {
    parts.push(`${Math.round(numberOrZero(cardio.avgHeartRate))} bpm`);
  }
  if (numberOrZero(cardio.calories) > 0) {
    parts.push(`约 ${Math.round(numberOrZero(cardio.calories))} kcal`);
  }
  return parts.join(' · ');
}

function decorate(cardio, type) {
  const data = create(type, cardio);
  const duration = durationSeconds(data);
  return Object.assign({}, data, {
    durationMin: Math.floor(data.durationSec / 60),
    durationSecPart: data.durationSec % 60,
    distanceKmDisplay: trimNumber(data.distanceKm, 2),
    inclineDisplay: trimNumber(data.incline, 1),
    avgInclineDisplay: trimNumber(data.avgIncline, 1),
    avgSpeedDisplay: trimNumber(data.avgSpeed, 1),
    workMin: Math.floor(data.workSec / 60),
    workSecPart: data.workSec % 60,
    restMin: Math.floor(data.restSec / 60),
    restSecPart: data.restSec % 60,
    totalDurationSec: duration,
    durationLabel: formatDuration(duration),
    paceLabel: paceText(data, type),
    summary: summary(data, type),
    valid: isValid(data)
  });
}

module.exports = {
  TYPES,
  EXERCISE_TYPE_MAP,
  typeFromExercise,
  getMeta,
  isCardio,
  create,
  durationSeconds,
  isValid,
  formatDuration,
  effectiveSpeedKmh,
  estimateCalories,
  paceText,
  summary,
  decorate
};
