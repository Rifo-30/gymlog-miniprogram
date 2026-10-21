const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六'];

function pad2(value) {
  return String(value).padStart(2, '0');
}

function asDate(value) {
  if (value instanceof Date) return new Date(value.getTime());
  return new Date(value);
}

function toDateKey(value) {
  const d = asDate(value);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fromDateKey(key) {
  const parts = String(key || '').split('-').map(Number);
  if (parts.length !== 3) return new Date();
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function startOfDay(value) {
  const d = asDate(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(value, days) {
  const d = asDate(value);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(value) {
  const d = startOfDay(value);
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(d, offset);
}

function isSameDay(a, b) {
  return toDateKey(a) === toDateKey(b);
}

function formatMonthDay(value) {
  const d = asDate(value);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatShort(value) {
  const d = asDate(value);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDateLabel(value) {
  const d = asDate(value);
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAY_CN[d.getDay()]}`;
}

function formatRelativeDate(value) {
  const d = startOfDay(value);
  const today = startOfDay(new Date());
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff === 2) return '前天';
  if (diff > 2 && diff < 7) return `${diff}天前`;
  return formatMonthDay(d);
}

function formatTime(value) {
  const d = asDate(value);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatClock(seconds) {
  const safe = Math.max(0, Math.ceil(Number(seconds) || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    return `${hours}:${pad2(mins % 60)}:${pad2(secs)}`;
  }
  return `${pad2(mins)}:${pad2(secs)}`;
}

function formatDurationLong(ms) {
  const totalSeconds = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

function getWeekLabel(value) {
  const d = startOfWeek(value);
  return formatShort(d);
}

function getMonthLabel(year, month) {
  return `${year}年${month + 1}月`;
}

function getMonthCells(year, month, workoutKeys, selectedDate) {
  const keySet = workoutKeys instanceof Set ? workoutKeys : new Set(workoutKeys || []);
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  const todayKey = toDateKey(new Date());
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const d = addDays(start, i);
    const key = toDateKey(d);
    cells.push({
      key,
      day: d.getDate(),
      inMonth: d.getMonth() === month,
      isToday: key === todayKey,
      isSelected: !!selectedDate && key === selectedDate,
      hasWorkout: keySet.has(key)
    });
  }
  return cells;
}

function getWeekdayShort(value) {
  return `周${WEEKDAY_CN[asDate(value).getDay()]}`;
}

module.exports = {
  WEEKDAY_CN,
  pad2,
  toDateKey,
  fromDateKey,
  startOfDay,
  addDays,
  startOfWeek,
  isSameDay,
  formatMonthDay,
  formatShort,
  formatDateLabel,
  formatRelativeDate,
  formatTime,
  formatClock,
  formatDurationLong,
  formatElapsed,
  getWeekLabel,
  getMonthLabel,
  getMonthCells,
  getWeekdayShort
};
