const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(Z|[+-]\d{2}:\d{2})$/;

function toChinaIso(value) {
  const date = value === undefined ? new Date() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() + CHINA_OFFSET_MS)
    .toISOString()
    .replace('Z', '+08:00');
}

function nowChinaIso() {
  return toChinaIso(new Date());
}

function normalizeChinaIso(value) {
  if (typeof value !== 'string' || !ISO_PATTERN.test(value)) return value;
  return toChinaIso(value);
}

module.exports = {
  CHINA_OFFSET_MS,
  toChinaIso,
  nowChinaIso,
  normalizeChinaIso
};
