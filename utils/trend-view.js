const format = require('./format');
const cardioUtil = require('./cardio');

const CHART_WIDTH = 620;
const STAGE_HEIGHT = 320;
const PLOT_TOP = 24;
const PLOT_HEIGHT = 180;
const BAR_BASE = 46;
const BAR_MAX_HEIGHT = 130;
const LABEL_TOP = 286;
const COLUMN_HEIGHT = STAGE_HEIGHT;

function buildTrendView(rawTrend, exercise, unit) {
  const type = exercise.type === 'cardio' ? 'cardio' : exercise.type;
  const isWeight = type === 'weight_reps';
  const isReps = type === 'reps';
  const isTime = type === 'time';
  const isCardio = type === 'cardio';
  const metricName = isWeight
    ? '估算 1RM'
    : (isReps ? '最多次数' : (isTime ? '最长时长' : '有氧时长'));
  const secondaryName = isWeight
    ? '训练容量'
    : (isReps ? '总次数' : (isTime ? '总时长' : '距离/热量'));

  const items = (rawTrend || []).map((item, index) => {
    let scoreLabel = '';
    let secondaryValue = 0;
    let secondaryLabel = '';
    let bestSetLabel = '';
    if (isWeight) {
      scoreLabel = format.formatWeight(item.score || 0, unit);
      secondaryValue = Number(item.volumeKg) || 0;
      secondaryLabel = format.formatVolume(secondaryValue, unit);
      bestSetLabel = item.set ? format.formatSetLine(item.set, 'weight_reps', unit) : '';
    } else if (isReps) {
      scoreLabel = `${item.score || 0} 次`;
      secondaryValue = Number(item.totalReps) || 0;
      secondaryLabel = `${secondaryValue} 次`;
      bestSetLabel = `${item.reps || 0} 次`;
    } else if (isTime) {
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
    if (isWeight) {
      amount = format.formatWeight(Math.abs(diff), unit);
    } else if (isReps) {
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

  const secondaryHasDistance = isCardio && items.some((item) => Number(item.distanceKm) > 0);
  const secondaryAxisName = isCardio
    ? (secondaryHasDistance ? '距离' : '热量')
    : secondaryName;
  const secondaryAxisUnit = isWeight
    ? ` (${unit})`
    : (isReps ? ' (次)' : (isTime ? '' : (secondaryHasDistance ? ' (km)' : ' (kcal)')));
  const primaryAxisUnit = isWeight ? ` (${unit})` : (isReps ? ' (次)' : '');

  const axisValue = (value, secondary) => {
    if (isWeight) {
      return secondary
        ? format.formatVolume(value, unit)
        : format.formatWeight(value, unit, false);
    }
    if (isReps) return `${Math.round(value)} 次`;
    if (secondary && isTime) return cardioUtil.formatDuration(value);
    if (secondary && isCardio && secondaryHasDistance) return `${Number(Number(value).toFixed(2))} km`;
    if (secondary && isCardio) return `${Math.round(value)} kcal`;
    return cardioUtil.formatDuration(value);
  };

  if (!items.length) {
    return {
      trend: [],
      trendPoints: [],
      trendBars: [],
      trendBarLabels: [],
      trendLines: [],
      trendLabels: [],
      trendColumns: [],
      trendTitle: `${exercise.name} · ${metricName}`,
      trendSubtitle: `暂无${metricName}数据`,
      trendMetricName: metricName,
      trendSecondaryName: secondaryName,
      trendPrimaryAxisLabel: `${metricName}${primaryAxisUnit}`,
      trendSecondaryAxisLabel: `${secondaryAxisName}${secondaryAxisUnit}`,
      trendPrimaryMaxLabel: '—',
      trendPrimaryMinLabel: '—',
      trendSecondaryMaxLabel: '—',
      selectedTrend: null,
      selectedTrendIndex: -1
    };
  }

  const scores = items.map((item) => Number(item.score) || 0);
  const rawMinScore = Math.min(...scores);
  const rawMaxScore = Math.max(...scores);
  let minScore = rawMinScore;
  let maxScore = rawMaxScore;
  if (minScore === maxScore) {
    const pad = Math.max(1, Math.abs(maxScore) * 0.1);
    minScore -= pad;
    maxScore += pad;
  }
  const padding = (maxScore - minScore) * 0.15;
  const lower = minScore - padding;
  const upper = maxScore + padding;
  const maxSecondary = Math.max(0, ...items.map((item) => Number(item.secondaryValue) || 0));
  const leftPad = 22;
  const rightPad = 22;
  const plotWidth = CHART_WIDTH - leftPad - rightPad;
  const selectedIndex = items.length - 1;
  const points = [];
  const bars = [];
  const barLabels = [];
  const lines = [];
  const columns = [];
  const labels = [];
  const xValues = items.map((item, index) => (
    items.length === 1
      ? CHART_WIDTH / 2
      : leftPad + (index / (items.length - 1)) * plotWidth
  ));
  const columnWidth = items.length === 1 ? CHART_WIDTH : plotWidth / items.length;

  items.forEach((item, index) => {
    const x = xValues[index];
    const score = Number(item.score) || 0;
    const y = PLOT_TOP + (1 - ((score - lower) / (upper - lower))) * PLOT_HEIGHT;
    const barHeight = maxSecondary > 0
      ? Math.max(4, (Number(item.secondaryValue) || 0) / maxSecondary * BAR_MAX_HEIGHT)
      : 4;
    const barTop = STAGE_HEIGHT - BAR_BASE - barHeight - 20;
    item.selected = index === selectedIndex;
    points.push({
      index,
      style: `left:${x - 18}rpx;top:${y - 18}rpx;`,
      selected: index === selectedIndex
    });
    bars.push({
      index,
      style: `left:${x - 11}rpx;bottom:${BAR_BASE}rpx;height:${barHeight}rpx;`
    });
    barLabels.push({
      index,
      style: `left:${Math.max(0, Math.min(CHART_WIDTH - 96, x - 48))}rpx;top:${barTop}rpx;`,
      label: item.secondaryLabel,
      selected: index === selectedIndex
    });
    columns.push({
      index,
      style: `left:${Math.max(0, Math.min(CHART_WIDTH - columnWidth, x - columnWidth / 2))}rpx;top:0;width:${columnWidth}rpx;height:${COLUMN_HEIGHT}rpx;`
    });
    labels.push({
      index,
      style: `left:${x - 32}rpx;top:${LABEL_TOP}rpx;`,
      label: item.label
    });
    if (index > 0) {
      const prevX = xValues[index - 1];
      const prevScore = Number(items[index - 1].score) || 0;
      const prevY = PLOT_TOP + (1 - ((prevScore - lower) / (upper - lower))) * PLOT_HEIGHT;
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
    trendBarLabels: barLabels,
    trendLines: lines,
    trendLabels: labels,
    trendColumns: columns,
    trendTitle: `${exercise.name} · ${metricName}`,
    trendSubtitle: `折线为${metricName}，柱状为${secondaryName}`,
    trendMetricName: metricName,
    trendSecondaryName: secondaryName,
    trendPrimaryAxisLabel: `${metricName}${primaryAxisUnit}`,
    trendSecondaryAxisLabel: `${secondaryAxisName}${secondaryAxisUnit}`,
    trendPrimaryMaxLabel: axisValue(rawMaxScore, false),
    trendPrimaryMinLabel: axisValue(rawMinScore, false),
    trendSecondaryMaxLabel: axisValue(maxSecondary, true),
    selectedTrend: items[selectedIndex],
    selectedTrendIndex: selectedIndex
  };
}

module.exports = {
  buildTrendView,
  CHART_WIDTH,
  STAGE_HEIGHT
};
