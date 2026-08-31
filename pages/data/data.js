var _regeneratorRuntime2 = require("../../@babel/runtime/helpers/regeneratorRuntime");
var _asyncToGenerator2 = require("../../@babel/runtime/helpers/asyncToGenerator");
var checkinCore = require("../../utils/checkinCore");
var drinkData = require("../../utils/drinkData");
var DAY_MS = 24 * 60 * 60 * 1000;
var DEFAULT_GOAL_ML = checkinCore.DEFAULT_GOAL_ML;
var SKIN_KEY = "dataPageSkin";

function pad2(value) {
  var n = Math.round(Number(value));
  return n < 10 ? "0".concat(n) : "".concat(n);
}

function toDateKey() {
  var date = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : new Date();
  var d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return "".concat(d.getFullYear(), "-").concat(pad2(d.getMonth() + 1), "-").concat(pad2(d.getDate()));
}

function addDays(date, delta) {
  return new Date(date.getTime() + delta * DAY_MS);
}

function clampPercent(value) {
  var parsed = Math.round(Number(value) || 0);
  return Math.max(0, Math.min(120, parsed));
}

function normalizeStore(rawStore) {
  var store = drinkData.normalizeStore(rawStore || {});
  if (!store.dailyGoalMl) store.dailyGoalMl = DEFAULT_GOAL_ML;
  return store;
}

function buildDemoStore() {
  var today = new Date();
  var amounts = [1320, 1880, 1640, 2080, 1760, 2150, 1500];
  var recordsByDate = {};
  amounts.forEach(function(amount, index) {
    var date = addDays(today, index - 6);
    var dateKey = toDateKey(date);
    recordsByDate[dateKey] = [{
      id: "demo_".concat(index, "_1"),
      amount: Math.round(amount * 0.34),
      ts: new Date(dateKey).getTime() + 9 * 60 * 60 * 1000,
      source: "demo"
    }, {
      id: "demo_".concat(index, "_2"),
      amount: Math.round(amount * 0.36),
      ts: new Date(dateKey).getTime() + 14 * 60 * 60 * 1000,
      source: "demo"
    }, {
      id: "demo_".concat(index, "_3"),
      amount: Math.round(amount * 0.3),
      ts: new Date(dateKey).getTime() + 20 * 60 * 60 * 1000,
      source: "demo"
    }];
  });
  return normalizeStore({
    dailyGoalMl: DEFAULT_GOAL_ML,
    recordsByDate: recordsByDate
  });
}

function readLegacyStore() {
  try {
    return wx.getStorageSync(checkinCore.STORAGE_KEY) || null;
  } catch (err) {
    return null;
  }
}

function formatTime(ts) {
  var d = new Date(Number(ts) || Date.now());
  if (Number.isNaN(d.getTime())) return "--:--";
  return "".concat(pad2(d.getHours()), ":").concat(pad2(d.getMinutes()));
}

function buildWeekModel(store) {
  var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  var today = new Date();
  var dailyGoalMl = Math.max(800, Math.round(Number(store.dailyGoalMl) || DEFAULT_GOAL_ML));
  var recordsByDate = store.recordsByDate || {};
  var days = [];
  var total = 0;
  var recordCount = 0;
  var achieveDays = 0;
  var bestDay = null;
  var latestTs = 0;
  for (var i = 6; i >= 0; i--) {
    var date = addDays(today, -i);
    var dateKey = toDateKey(date);
    var list = Array.isArray(recordsByDate[dateKey]) ? recordsByDate[dateKey] : [];
    var amount = checkinCore.sumAmounts(list);
    var percent = clampPercent(amount / dailyGoalMl * 100);
    var count = list.length;
    var sorted = list.slice().sort(function(a, b) {
      return (Number(a.ts) || 0) - (Number(b.ts) || 0);
    });
    var lastRecord = sorted[sorted.length - 1];
    if (lastRecord && Number(lastRecord.ts) > latestTs) latestTs = Number(lastRecord.ts);
    if (amount >= dailyGoalMl) achieveDays += 1;
    if (!bestDay || amount > bestDay.amount) bestDay = {
      amount: amount,
      dateKey: dateKey
    };
    total += amount;
    recordCount += count;
    days.push({
      dateKey: dateKey,
      dayLabel: i === 0 ? "今天" : "".concat(date.getMonth() + 1, "/").concat(date.getDate()),
      total: amount,
      count: count,
      percent: percent,
      barHeight: Math.max(18, Math.round(percent * 1.24)),
      tone: amount >= dailyGoalMl ? "good" : amount >= dailyGoalMl * 0.7 ? "steady" : "low",
      isToday: i === 0,
      lastTime: lastRecord ? formatTime(lastRecord.ts) : "--"
    });
  }
  var avg = Math.round(total / 7);
  var completionRate = Math.round(total / (dailyGoalMl * 7) * 100);
  var todayAmount = days[6] ? days[6].total : 0;
  var todayPercent = clampPercent(todayAmount / dailyGoalMl * 100);
  var sourceLabel = options.demo ? "演示数据" : options.cloud ? "云端数据" : "本地旧记录";
  var latestText = latestTs ? formatTime(latestTs) : "暂无记录";
  return {
    dailyGoalMl: dailyGoalMl,
    sourceLabel: sourceLabel,
    days: days,
    summary: {
      total: total,
      avg: avg,
      completionRate: Math.max(0, Math.min(100, completionRate)),
      todayAmount: todayAmount,
      todayPercent: todayPercent,
      achieveDays: achieveDays,
      recordCount: recordCount,
      latestText: latestText,
      bestDayAmount: bestDay ? bestDay.amount : 0
    }
  };
}

function fallbackAdvice(model) {
  var summary = model.summary,
    dailyGoalMl = model.dailyGoalMl;
  if (!summary.recordCount) {
    return ["过去 7 天记录较少，建议先保持每天 3 到 5 次轻量记录。", "\u53EF\u4EE5\u628A\u76EE\u6807\u5148\u8BBE\u4E3A ".concat(dailyGoalMl, "ml\uFF0C\u5E76\u4F18\u5148\u8865\u8DB3\u4E0A\u5348\u548C\u4E0B\u5348\u4E24\u4E2A\u65F6\u6BB5\u3002"), "本周目标：连续 3 天完成饮水记录，让 AI 能生成更稳定的习惯建议。"];
  }
  if (summary.completionRate >= 90) {
    return ["整体达成率较高，饮水节奏已经比较稳定。", "建议继续保持上午、下午、晚间分段补水，避免一次性大量饮水。", "本周目标：把低于目标的日期补齐到 80% 以上，让习惯更均衡。"];
  }
  if (summary.completionRate >= 65) {
    return ["饮水量基本接近目标，但部分日期存在断档。", "建议在学习办公中段和晚饭前增加一次 200ml 左右的提醒。", "本周目标：至少 4 天达到目标量，并减少夜间临时补水。"];
  }
  return ["近 7 天饮水完成度偏低，需要先建立固定提醒节奏。", "建议把提醒拆成上午、午后、傍晚三段，每次 200 到 300ml。", "本周目标：从每天 1500ml 起步，连续完成 3 天后再逐步提升。"];
}

function splitAdviceText(text) {
  var lines = String(text || "").replace(/\r/g, "\n").split("\n").map(function(item) {
    return item.replace(/^[\s\d.、\-*]+/, "").trim();
  }).filter(Boolean);
  return lines.length ? lines.slice(0, 5) : [];
}
Page({
  data: {
    skin: "classic",
    loading: true,
    aiLoading: false,
    sourceLabel: "云端数据",
    dailyGoalMl: DEFAULT_GOAL_ML,
    summary: {
      total: 0,
      avg: 0,
      completionRate: 0,
      todayAmount: 0,
      todayPercent: 0,
      achieveDays: 0,
      recordCount: 0,
      latestText: "暂无记录",
      bestDayAmount: 0
    },
    days: [],
    adviceLines: [],
    aiMetaText: "AI 正在分析近 7 天饮水节奏",
    updatedText: ""
  },
  onShow: function onShow() {
    this._alive = true;
    var skin = "classic";
    try {
      skin = wx.getStorageSync(SKIN_KEY) || "classic";
    } catch (err) {
      skin = "classic";
    }
    if (skin !== "print" && skin !== "classic") skin = "classic";
    if (skin !== this.data.skin) this.setData({ skin: skin });
    this.applyNav(skin);
    // 节流：60s 内不重复拉取，避免来回切换页面造成卡顿
    var now = Date.now();
    var shouldRefresh = !this._lastLoadAt || now - this._lastLoadAt > 60000;
    if (shouldRefresh) {
      this._lastLoadAt = now;
      this.loadWeeklyReport(false);
    }
  },
  onHide: function onHide() {
    this._alive = false;
  },
  onUnload: function onUnload() {
    this._alive = false;
  },
  onPullDownRefresh: function onPullDownRefresh() {
    this._alive = true;
    this._lastLoadAt = Date.now();
    this.loadWeeklyReport(true).finally(function() {
      if (wx.stopPullDownRefresh) wx.stopPullDownRefresh();
    });
  },
  loadWeeklyReport: function loadWeeklyReport(forceAdvice) {
    var _this = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee() {
      var legacyStore, store, source, model, now;
      return _regeneratorRuntime2().wrap(function _callee$(_context) {
        while (1) switch (_context.prev = _context.next) {
          case 0:
            if (_this._alive) {
              _context.next = 2;
              break;
            }
            return _context.abrupt("return");
          case 2:
            _this.setData({
              loading: true,
              aiLoading: true
            });
            legacyStore = readLegacyStore();
            store = null;
            source = {
              cloud: false,
              demo: false
            };
            _context.prev = 6;
            _context.next = 9;
            return drinkData.getStore({
              historyDays: 7,
              legacyStore: legacyStore
            });
          case 9:
            store = _context.sent;
            source.cloud = true;
            _context.next = 18;
            break;
          case 13:
            _context.prev = 13;
            _context.t0 = _context["catch"](6);
            console.warn("[data] cloud drink store unavailable", _context.t0);
            store = legacyStore ? normalizeStore(legacyStore) : buildDemoStore();
            source.demo = !legacyStore;
          case 18:
            if (_this._alive) {
              _context.next = 20;
              break;
            }
            return _context.abrupt("return");
          case 20:
            model = buildWeekModel(store, source);
            now = new Date();
            _this.setData({
              loading: false,
              sourceLabel: model.sourceLabel,
              dailyGoalMl: model.dailyGoalMl,
              summary: model.summary,
              days: model.days,
              updatedText: "".concat(pad2(now.getHours()), ":").concat(pad2(now.getMinutes()), " \u66F4\u65B0"),
              aiMetaText: source.demo ? "演示数据建议，可在记录饮水后生成真实周报" : "基于近 7 天饮水记录生成"
            });
            _context.next = 25;
            return _this.loadAdvice(forceAdvice, model);
          case 25:
          case "end":
            return _context.stop();
        }
      }, _callee, null, [
        [6, 13]
      ]);
    }))();
  },
  loadAdvice: function loadAdvice(force, model) {
    var _this2 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee2() {
      var result, adviceLines;
      return _regeneratorRuntime2().wrap(function _callee2$(_context2) {
        while (1) switch (_context2.prev = _context2.next) {
          case 0:
            if (_this2._alive) {
              _context2.next = 2;
              break;
            }
            return _context2.abrupt("return");
          case 2:
            _this2.setData({
              aiLoading: true
            });
            _context2.prev = 3;
            _context2.next = 6;
            return drinkData.getHydrationAdvice({
              force: force
            });
          case 6:
            result = _context2.sent;
            if (_this2._alive) {
              _context2.next = 9;
              break;
            }
            return _context2.abrupt("return");
          case 9:
            adviceLines = splitAdviceText(result.advice);
            _this2.setData({
              aiLoading: false,
              adviceLines: adviceLines.length ? adviceLines : fallbackAdvice(model),
              aiMetaText: result.cached ? "已读取最近一次 AI 周报" : "AI 已生成新的饮水建议"
            });
            _context2.next = 19;
            break;
          case 13:
            _context2.prev = 13;
            _context2.t0 = _context2["catch"](3);
            console.warn("[data] hydration advice unavailable", _context2.t0);
            if (_this2._alive) {
              _context2.next = 18;
              break;
            }
            return _context2.abrupt("return");
          case 18:
            _this2.setData({
              aiLoading: false,
              adviceLines: fallbackAdvice(model),
              aiMetaText: "云端 AI 暂不可用，已生成本地建议"
            });
          case 19:
          case "end":
            return _context2.stop();
        }
      }, _callee2, null, [
        [3, 13]
      ]);
    }))();
  },
  applyNav: function applyNav(skin) {
    try {
      wx.setNavigationBarColor({
        frontColor: "#000000",
        backgroundColor: skin === "print" ? "#F7F5EF" : "#EEF5F9"
      });
    } catch (err) {}
  },
  switchSkin: function switchSkin(e) {
    var skin = e.currentTarget.dataset.skin === "print" ? "print" : "classic";
    if (skin === this.data.skin) return;
    try {
      wx.setStorageSync(SKIN_KEY, skin);
    } catch (err) {}
    this.setData({ skin: skin });
    this.applyNav(skin);
  },
  refreshReport: function refreshReport() {
    this.loadWeeklyReport(true);
  },
  goCheckin: function goCheckin() {
    wx.navigateTo({
      url: "/pages/checkin/checkin"
    });
  },
  goPlan: function goPlan() {
    wx.switchTab({
      url: "/pages/plan/plan"
    });
  },
  goChat: function goChat() {
    wx.navigateTo({
      url: "/pages/chat/chat"
    });
  }
});