var _toConsumableArray2 = require("../@babel/runtime/helpers/toConsumableArray");
var _typeof2 = require("../@babel/runtime/helpers/typeof");

function safeReadStore(_ref) {
  var key = _ref.key,
    sanitize = _ref.sanitize,
    onReadError = _ref.onReadError;
  var rawStore;
  try {
    rawStore = wx.getStorageSync(key);
  } catch (error) {
    if (typeof onReadError === "function") onReadError(error);
    rawStore = null;
  }
  if (typeof sanitize === "function") {
    try {
      return sanitize(rawStore);
    } catch (error) {
      if (typeof onReadError === "function") onReadError(error);
      return sanitize(null);
    }
  }
  return rawStore;
}

function safeWriteStore(_ref2) {
  var key = _ref2.key,
    store = _ref2.store,
    onWriteError = _ref2.onWriteError;
  try {
    wx.setStorageSync(key, store);
    return true;
  } catch (error) {
    if (typeof onWriteError === "function") onWriteError(error);
    return false;
  }
}

function appendRecordToStore(_ref3) {
  var store = _ref3.store,
    amount = _ref3.amount,
    toDateKey = _ref3.toDateKey,
    sumAmounts = _ref3.sumAmounts,
    makeRecordId = _ref3.makeRecordId,
    maxDailyRecords = _ref3.maxDailyRecords,
    now = _ref3.now;
  if (typeof toDateKey !== "function" || typeof sumAmounts !== "function" || typeof makeRecordId !== "function") {
    throw new Error("Invalid checkinOps callbacks");
  }
  var amountValue = Math.round(Number(amount));
  if (!Number.isFinite(amountValue) || amountValue <= 0) {
    throw new Error("Invalid checkin amount");
  }
  var targetStore = store && _typeof2(store) === "object" ? store : {};
  if (!targetStore.recordsByDate || _typeof2(targetStore.recordsByDate) !== "object") {
    targetStore.recordsByDate = {};
  }
  var limit = Math.max(1, Math.round(Number(maxDailyRecords) || 1));
  var ts = Number.isFinite(Number(now)) ? Math.round(Number(now)) : Date.now();
  var todayKey = toDateKey(new Date(ts));
  if (!todayKey) throw new Error("Invalid checkin date key");
  var list = Array.isArray(targetStore.recordsByDate[todayKey]) ? _toConsumableArray2(targetStore.recordsByDate[todayKey]) : [];
  var beforeTotal = sumAmounts(list);
  list.push({
    id: makeRecordId(ts),
    amount: amountValue,
    ts: ts
  });
  list.sort(function(a, b) {
    return a.ts - b.ts;
  });
  if (list.length > limit) {
    list.splice(0, list.length - limit);
  }
  var afterTotal = sumAmounts(list);
  targetStore.recordsByDate[todayKey] = list;
  targetStore.updatedAt = ts;
  return {
    todayKey: todayKey,
    list: list,
    beforeTotal: beforeTotal,
    afterTotal: afterTotal,
    timestamp: ts
  };
}
module.exports = {
  safeReadStore: safeReadStore,
  safeWriteStore: safeWriteStore,
  appendRecordToStore: appendRecordToStore
};