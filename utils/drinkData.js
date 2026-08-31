var _objectSpread2 = require("../@babel/runtime/helpers/objectSpread2");
var _regeneratorRuntime2 = require("../@babel/runtime/helpers/regeneratorRuntime");
var _asyncToGenerator2 = require("../@babel/runtime/helpers/asyncToGenerator");
var _typeof2 = require("../@babel/runtime/helpers/typeof");
var checkinCore = require("./checkinCore.js");
var DRINK_RECORD_FUNCTION = "drinkRecord";
var HYDRATION_ADVICE_FUNCTION = "hydrationAdvice";
var MIGRATION_FLAG_KEY = "smartcup_drink_cloud_migrated_v1";
var DEFAULT_HISTORY_DAYS = 400;
var MIN_GOAL_ML = 800;
var MAX_GOAL_ML = 6000;

function pad2(value) {
  var n = Math.round(Number(value));
  return n < 10 ? "0".concat(n) : "".concat(n);
}

function toDateKey() {
  var date = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : new Date();
  var d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return checkinCore.toDateKey(new Date());
  return "".concat(d.getFullYear(), "-").concat(pad2(d.getMonth() + 1), "-").concat(pad2(d.getDate()));
}

function addDays(date, delta) {
  var base = date instanceof Date ? date : new Date(date);
  return new Date(base.getTime() + (Number(delta) || 0) * 24 * 60 * 60 * 1000);
}

function normalizeGoal(value) {
  var parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return checkinCore.DEFAULT_GOAL_ML;
  return Math.max(MIN_GOAL_ML, Math.min(MAX_GOAL_ML, parsed));
}

function normalizeRecord(raw) {
  if (!raw || _typeof2(raw) !== "object") return null;
  var amount = checkinCore.normalizeAmount(raw.amount);
  if (!amount) return null;
  var rawTs = Number(raw.ts);
  var ts = Number.isFinite(rawTs) && rawTs > 0 ? Math.round(rawTs) : Date.now();
  return {
    id: String(raw.id || raw.recordId || checkinCore.makeRecordId(ts)),
    amount: amount,
    ts: ts,
    source: String(raw.source || "manual"),
    deviceId: String(raw.deviceId || "")
  };
}

function normalizeStore(rawStore) {
  var now = Date.now();
  var store = {
    version: checkinCore.STORAGE_VERSION,
    dailyGoalMl: normalizeGoal(rawStore && rawStore.dailyGoalMl),
    recordsByDate: {},
    createdAt: Number(rawStore && rawStore.createdAt) > 0 ? Math.round(Number(rawStore.createdAt)) : now,
    updatedAt: Number(rawStore && rawStore.updatedAt) > 0 ? Math.round(Number(rawStore.updatedAt)) : now
  };
  var sourceMap = rawStore && rawStore.recordsByDate;
  if (!sourceMap || _typeof2(sourceMap) !== "object") return store;
  Object.keys(sourceMap).forEach(function(dateKey) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
    var list = Array.isArray(sourceMap[dateKey]) ? sourceMap[dateKey] : [];
    var normalized = list.map(normalizeRecord).filter(Boolean);
    normalized.sort(function(a, b) {
      return a.ts - b.ts;
    });
    if (normalized.length > checkinCore.MAX_DAILY_RECORDS) {
      normalized.splice(0, normalized.length - checkinCore.MAX_DAILY_RECORDS);
    }
    if (normalized.length) store.recordsByDate[dateKey] = normalized;
  });
  return store;
}

function hasRecords(store) {
  var recordsByDate = store && store.recordsByDate;
  return !!(recordsByDate && Object.keys(recordsByDate).some(function(dateKey) {
    var list = recordsByDate[dateKey];
    return Array.isArray(list) && list.length;
  }));
}

function getRange() {
  var historyDays = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : DEFAULT_HISTORY_DAYS;
  var days = Math.max(1, Math.min(DEFAULT_HISTORY_DAYS, Math.round(Number(historyDays) || DEFAULT_HISTORY_DAYS)));
  var end = new Date();
  var start = addDays(end, -(days - 1));
  return {
    historyDays: days,
    startDateKey: toDateKey(start),
    endDateKey: toDateKey(end)
  };
}

function ensureCloudReady() {
  if (!wx.cloud || typeof wx.cloud.callFunction !== "function") {
    throw new Error("云开发不可用，请先开通并选择正确云环境");
  }
}

function callDrinkRecord() {
  return _callDrinkRecord.apply(this, arguments);
}

function _callDrinkRecord() {
  _callDrinkRecord = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee() {
    var data,
      res,
      result,
      _args = arguments;
    return _regeneratorRuntime2().wrap(function _callee$(_context) {
      while (1) switch (_context.prev = _context.next) {
        case 0:
          data = _args.length > 0 && _args[0] !== undefined ? _args[0] : {};
          ensureCloudReady();
          _context.next = 4;
          return wx.cloud.callFunction({
            name: DRINK_RECORD_FUNCTION,
            data: data
          });
        case 4:
          res = _context.sent;
          result = res && res.result ? res.result : {};
          if (result.ok) {
            _context.next = 8;
            break;
          }
          throw new Error(result.error || "云端饮水数据请求失败");
        case 8:
          return _context.abrupt("return", result);
        case 9:
        case "end":
          return _context.stop();
      }
    }, _callee);
  }));
  return _callDrinkRecord.apply(this, arguments);
}

function maybeMigrateLegacyStore(_x, _x2) {
  return _maybeMigrateLegacyStore.apply(this, arguments);
}

function _maybeMigrateLegacyStore() {
  _maybeMigrateLegacyStore = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee2(legacyStore, range) {
    var migrated, normalized, shouldImport;
    return _regeneratorRuntime2().wrap(function _callee2$(_context2) {
      while (1) switch (_context2.prev = _context2.next) {
        case 0:
          migrated = false;
          try {
            migrated = !!wx.getStorageSync(MIGRATION_FLAG_KEY);
          } catch (err) {
            migrated = false;
          }
          if (!migrated) {
            _context2.next = 4;
            break;
          }
          return _context2.abrupt("return");
        case 4:
          normalized = normalizeStore(legacyStore);
          shouldImport = hasRecords(normalized) || normalized.dailyGoalMl !== checkinCore.DEFAULT_GOAL_ML;
          if (!shouldImport) {
            _context2.next = 9;
            break;
          }
          _context2.next = 9;
          return callDrinkRecord(_objectSpread2({
            action: "importStore",
            store: normalized
          }, range));
        case 9:
          try {
            wx.setStorageSync(MIGRATION_FLAG_KEY, Date.now());
          } catch (err) {
            console.warn("[drinkData] migration flag write failed", err);
          }
        case 10:
        case "end":
          return _context2.stop();
      }
    }, _callee2);
  }));
  return _maybeMigrateLegacyStore.apply(this, arguments);
}

function getStore() {
  return _getStore.apply(this, arguments);
}

function _getStore() {
  _getStore = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee3() {
    var options,
      range,
      result,
      _args3 = arguments;
    return _regeneratorRuntime2().wrap(function _callee3$(_context3) {
      while (1) switch (_context3.prev = _context3.next) {
        case 0:
          options = _args3.length > 0 && _args3[0] !== undefined ? _args3[0] : {};
          range = getRange(options.historyDays);
          if (!options.legacyStore) {
            _context3.next = 5;
            break;
          }
          _context3.next = 5;
          return maybeMigrateLegacyStore(options.legacyStore, range);
        case 5:
          _context3.next = 7;
          return callDrinkRecord(_objectSpread2({
            action: "getStore"
          }, range));
        case 7:
          result = _context3.sent;
          return _context3.abrupt("return", normalizeStore(result.store));
        case 9:
        case "end":
          return _context3.stop();
      }
    }, _callee3);
  }));
  return _getStore.apply(this, arguments);
}

function addRecord(_x3) {
  return _addRecord.apply(this, arguments);
}

function _addRecord() {
  _addRecord = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee4(amount) {
    var options,
      range,
      ts,
      result,
      _args4 = arguments;
    return _regeneratorRuntime2().wrap(function _callee4$(_context4) {
      while (1) switch (_context4.prev = _context4.next) {
        case 0:
          options = _args4.length > 1 && _args4[1] !== undefined ? _args4[1] : {};
          range = getRange(options.historyDays);
          ts = Number.isFinite(Number(options.ts)) ? Math.round(Number(options.ts)) : Date.now();
          _context4.next = 5;
          return callDrinkRecord(_objectSpread2({
            action: "add",
            amount: amount,
            ts: ts,
            dateKey: toDateKey(new Date(ts)),
            source: options.source || "manual",
            deviceId: options.deviceId || ""
          }, range));
        case 5:
          result = _context4.sent;
          return _context4.abrupt("return", {
            store: normalizeStore(result.store),
            beforeTotal: Math.max(0, Math.round(Number(result.beforeTotal) || 0)),
            afterTotal: Math.max(0, Math.round(Number(result.afterTotal) || 0)),
            record: normalizeRecord(result.record)
          });
        case 7:
        case "end":
          return _context4.stop();
      }
    }, _callee4);
  }));
  return _addRecord.apply(this, arguments);
}

function deleteRecord(_x4) {
  return _deleteRecord.apply(this, arguments);
}

function _deleteRecord() {
  _deleteRecord = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee5(recordId) {
    var options,
      range,
      result,
      _args5 = arguments;
    return _regeneratorRuntime2().wrap(function _callee5$(_context5) {
      while (1) switch (_context5.prev = _context5.next) {
        case 0:
          options = _args5.length > 1 && _args5[1] !== undefined ? _args5[1] : {};
          range = getRange(options.historyDays);
          _context5.next = 4;
          return callDrinkRecord(_objectSpread2({
            action: "delete",
            recordId: recordId
          }, range));
        case 4:
          result = _context5.sent;
          return _context5.abrupt("return", normalizeStore(result.store));
        case 6:
        case "end":
          return _context5.stop();
      }
    }, _callee5);
  }));
  return _deleteRecord.apply(this, arguments);
}

function clearToday() {
  return _clearToday.apply(this, arguments);
}

function _clearToday() {
  _clearToday = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee6() {
    var options,
      range,
      result,
      _args6 = arguments;
    return _regeneratorRuntime2().wrap(function _callee6$(_context6) {
      while (1) switch (_context6.prev = _context6.next) {
        case 0:
          options = _args6.length > 0 && _args6[0] !== undefined ? _args6[0] : {};
          range = getRange(options.historyDays);
          _context6.next = 4;
          return callDrinkRecord(_objectSpread2({
            action: "clearToday",
            dateKey: toDateKey(new Date())
          }, range));
        case 4:
          result = _context6.sent;
          return _context6.abrupt("return", normalizeStore(result.store));
        case 6:
        case "end":
          return _context6.stop();
      }
    }, _callee6);
  }));
  return _clearToday.apply(this, arguments);
}

function setGoal(_x5) {
  return _setGoal.apply(this, arguments);
}

function _setGoal() {
  _setGoal = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee7(dailyGoalMl) {
    var options,
      range,
      result,
      _args7 = arguments;
    return _regeneratorRuntime2().wrap(function _callee7$(_context7) {
      while (1) switch (_context7.prev = _context7.next) {
        case 0:
          options = _args7.length > 1 && _args7[1] !== undefined ? _args7[1] : {};
          range = getRange(options.historyDays);
          _context7.next = 4;
          return callDrinkRecord(_objectSpread2({
            action: "setGoal",
            dailyGoalMl: dailyGoalMl
          }, range));
        case 4:
          result = _context7.sent;
          return _context7.abrupt("return", normalizeStore(result.store));
        case 6:
        case "end":
          return _context7.stop();
      }
    }, _callee7);
  }));
  return _setGoal.apply(this, arguments);
}

function getHydrationAdvice() {
  return _getHydrationAdvice.apply(this, arguments);
}

function _getHydrationAdvice() {
  _getHydrationAdvice = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee8() {
    var options,
      res,
      result,
      _args8 = arguments;
    return _regeneratorRuntime2().wrap(function _callee8$(_context8) {
      while (1) switch (_context8.prev = _context8.next) {
        case 0:
          options = _args8.length > 0 && _args8[0] !== undefined ? _args8[0] : {};
          ensureCloudReady();
          _context8.next = 4;
          return wx.cloud.callFunction({
            name: HYDRATION_ADVICE_FUNCTION,
            data: {
              force: !!options.force,
              endDateKey: toDateKey(new Date())
            }
          });
        case 4:
          res = _context8.sent;
          result = res && res.result ? res.result : {};
          if (result.ok) {
            _context8.next = 8;
            break;
          }
          throw new Error(result.error || "AI 饮水分析失败");
        case 8:
          return _context8.abrupt("return", result);
        case 9:
        case "end":
          return _context8.stop();
      }
    }, _callee8);
  }));
  return _getHydrationAdvice.apply(this, arguments);
}
module.exports = {
  getStore: getStore,
  addRecord: addRecord,
  deleteRecord: deleteRecord,
  clearToday: clearToday,
  setGoal: setGoal,
  getHydrationAdvice: getHydrationAdvice,
  normalizeStore: normalizeStore,
  toDateKey: toDateKey
};