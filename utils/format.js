const KG_TO_LB = 2.2046226218;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value, digits) {
  const factor = Math.pow(10, digits || 0);
  return Math.round((Number(value) || 0) * factor) / factor;
}

function trimNumber(value, digits) {
  const n = roundTo(value, digits == null ? 1 : digits);
  return Number.isInteger(n) ? String(n) : String(n);
}

function weightToDisplay(kg, unit) {
  const value = Number(kg) || 0;
  return unit === 'lb' ? value * KG_TO_LB : value;
}

function weightFromDisplay(value, unit) {
  const n = Number(value) || 0;
  return unit === 'lb' ? n / KG_TO_LB : n;
}

function formatWeight(kg, unit, withUnit) {
  const display = weightToDisplay(kg, unit);
  return `${trimNumber(display, 1)}${withUnit === false ? '' : ` ${unit}`}`;
}

function formatNumber(value) {
  const n = Number(value) || 0;
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatVolume(kg, unit) {
  const display = weightToDisplay(kg, unit);
  return `${formatNumber(display)} ${unit}`;
}

function formatPercent(value, digits) {
  return `${trimNumber((Number(value) || 0) * 100, digits == null ? 0 : digits)}%`;
}

function estimated1RM(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return 0;
  if (r === 1) return w;
  return w * (1 + r / 30);
}

function formatSetLine(set, type, unit) {
  if (!set) return '—';
  if (type === 'time') {
    return `${Number(set.duration) || 0} 秒`;
  }
  if (type === 'reps') {
    return `${Number(set.reps) || 0} 次`;
  }
  return `${formatWeight(set.weight, unit)} × ${Number(set.reps) || 0}`;
}

function formatSetCompact(set, type, unit) {
  if (!set) return '—';
  if (type === 'time') return `${Number(set.duration) || 0}s`;
  if (type === 'reps') return `${Number(set.reps) || 0}次`;
  return `${formatWeight(set.weight, unit, false)}×${Number(set.reps) || 0}`;
}

module.exports = {
  KG_TO_LB,
  clamp,
  roundTo,
  trimNumber,
  weightToDisplay,
  weightFromDisplay,
  formatWeight,
  formatNumber,
  formatVolume,
  formatPercent,
  estimated1RM,
  formatSetLine,
  formatSetCompact
};
