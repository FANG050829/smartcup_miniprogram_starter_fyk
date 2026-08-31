var STORAGE_KEY = "smartcup_checkin_v1";
var STORAGE_VERSION = 1;
var DEFAULT_GOAL_ML = 2000;
var MAX_SINGLE_AMOUNT_ML = 1500;
var MAX_DAILY_RECORDS = 120;
var QUICK_AMOUNTS = [120, 200, 300, 500];

function pad2(value) {
  var n = Math.round(Number(value));
  return n < 10 ? "0".concat(n) : "".concat(n);
}

function toDateKey(date) {
  var d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return "".concat(d.getFullYear(), "-").concat(pad2(d.getMonth() + 1), "-").concat(pad2(d.getDate()));
}

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function normalizeAmount(value) {
  var maxAmount = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : MAX_SINGLE_AMOUNT_ML;
  var parsed = Math.round(Number(value));
  var max = Math.max(1, Math.round(Number(maxAmount) || MAX_SINGLE_AMOUNT_ML));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return clamp(parsed, 1, max);
}

function makeRecordId(timestamp) {
  var tsRaw = Number(timestamp);
  var ts = Number.isFinite(tsRaw) && tsRaw > 0 ? Math.round(tsRaw) : Date.now();
  return "rec_".concat(ts, "_").concat(Math.floor(Math.random() * 10000));
}

function sumAmounts(records) {
  if (!Array.isArray(records) || !records.length) return 0;
  return records.reduce(function(total, item) {
    return total + (Number(item && item.amount) || 0);
  }, 0);
}
module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  STORAGE_VERSION: STORAGE_VERSION,
  DEFAULT_GOAL_ML: DEFAULT_GOAL_ML,
  MAX_SINGLE_AMOUNT_ML: MAX_SINGLE_AMOUNT_ML,
  MAX_DAILY_RECORDS: MAX_DAILY_RECORDS,
  QUICK_AMOUNTS: QUICK_AMOUNTS,
  pad2: pad2,
  toDateKey: toDateKey,
  normalizeAmount: normalizeAmount,
  makeRecordId: makeRecordId,
  sumAmounts: sumAmounts
};