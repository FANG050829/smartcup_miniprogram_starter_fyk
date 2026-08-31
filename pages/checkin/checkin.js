var _regeneratorRuntime2 = require("../../@babel/runtime/helpers/regeneratorRuntime");
var _asyncToGenerator2 = require("../../@babel/runtime/helpers/asyncToGenerator");
var _objectSpread2 = require("../../@babel/runtime/helpers/objectSpread2");
var _toConsumableArray2 = require("../../@babel/runtime/helpers/toConsumableArray");
var _typeof2 = require("../../@babel/runtime/helpers/typeof");
var _slicedToArray2 = require("../../@babel/runtime/helpers/slicedToArray");
var checkinOps = require("../../utils/checkinOps");
var checkinCore = require("../../utils/checkinCore");
var drinkData = require("../../utils/drinkData");
var waterReminder = require("../../utils/waterReminderCore");
var wxCompat = require("../../utils/wxCompat");
var STORAGE_KEY = checkinCore.STORAGE_KEY;
var STORAGE_VERSION = checkinCore.STORAGE_VERSION;
var LAST_WATER_TIME_KEY = "smartcup_last_water_time_v1";
var DEFAULT_GOAL_ML = checkinCore.DEFAULT_GOAL_ML;
var MIN_GOAL_ML = 800;
var MAX_GOAL_ML = 6000;
var MAX_SINGLE_AMOUNT_ML = checkinCore.MAX_SINGLE_AMOUNT_ML;
var MAX_DAILY_RECORDS = checkinCore.MAX_DAILY_RECORDS;
var HISTORY_KEEP_DAYS = 400;
var TREND_DAYS = 7;
var MONTH_TREND_DAYS = 30;
var DAY_MS = 24 * 60 * 60 * 1000;
var PAGE_SIDE_PADDING_RPX = 24;
var SECTION_CARD_PADDING_RPX = 20;
var MONTH_TREND_CHART_HEIGHT_RPX = 232;
var MONTH_TREND_CHART_SIDE_PADDING_RPX = 14;
var MONTH_TREND_CHART_TOP_PADDING_RPX = 16;
var MONTH_TREND_CHART_BASELINE_OFFSET_RPX = 18;
var MONTH_TREND_SEGMENT_THICKNESS_PX = 3;
var WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function rpxToPx(value) {
  var windowWidth = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 375;
  return Number(value) * Number(windowWidth || 375) / 750;
}

function pad2(value) {
  return value < 10 ? "0".concat(value) : "".concat(value);
}
var toDateKey = checkinCore.toDateKey;

function parseDateKey(dateKey) {
  if (!isDateKey(dateKey)) return null;
  var _dateKey$split = dateKey.split("-"),
    _dateKey$split2 = _slicedToArray2(_dateKey$split, 3),
    yearStr = _dateKey$split2[0],
    monthStr = _dateKey$split2[1],
    dayStr = _dateKey$split2[2];
  var year = Number(yearStr);
  var month = Number(monthStr);
  var day = Number(dayStr);
  var date = new Date(year, month - 1, day);
  if (toDateKey(date) !== dateKey) return null;
  return date;
}

function addDays(baseDate, delta) {
  return new Date(baseDate.getTime() + delta * DAY_MS);
}

function formatTime(timestamp) {
  var date = new Date(timestamp);
  return "".concat(pad2(date.getHours()), ":").concat(pad2(date.getMinutes()));
}

function formatDate(dateKey) {
  var format = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : "title";
  var date = parseDateKey(dateKey);
  if (!date) return "";
  switch (format) {
    case "title":
      return "".concat(date.getMonth() + 1, "\u6708").concat(date.getDate(), "\u65E5 ").concat(WEEKDAY_LABELS[date.getDay()]);
    case "monthDay":
      return "".concat(date.getMonth() + 1, "/").concat(date.getDate());
    default:
      return "";
  }
}

function isDateKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeGoal(goalValue) {
  var parsed = Math.round(Number(goalValue));
  if (!Number.isFinite(parsed)) return DEFAULT_GOAL_ML;
  return clamp(parsed, MIN_GOAL_ML, MAX_GOAL_ML);
}
var normalizeAmount = function normalizeAmount(amountValue) {
  return checkinCore.normalizeAmount(amountValue, MAX_SINGLE_AMOUNT_ML);
};
var makeRecordId = checkinCore.makeRecordId;

function normalizeRecord(rawRecord) {
  if (!rawRecord || _typeof2(rawRecord) !== "object") return null;
  var amount = normalizeAmount(rawRecord.amount);
  if (!amount) return null;
  var rawTs = Number(rawRecord.ts);
  var timestamp = Number.isFinite(rawTs) && rawTs > 0 ? Math.round(rawTs) : Date.now();
  var id = typeof rawRecord.id === "string" && rawRecord.id ? rawRecord.id : makeRecordId(timestamp);
  return {
    id: id,
    amount: amount,
    ts: timestamp
  };
}
var sumRecordAmounts = checkinCore.sumAmounts;

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function createDefaultStore() {
  var now = Date.now();
  return {
    version: STORAGE_VERSION,
    dailyGoalMl: DEFAULT_GOAL_ML,
    recordsByDate: {},
    createdAt: now,
    updatedAt: now
  };
}

function sanitizeStore(rawStore) {
  if (!rawStore || _typeof2(rawStore) !== "object") {
    return {
      store: createDefaultStore(),
      changed: true
    };
  }
  var fallback = createDefaultStore();
  var changed = false;
  var goal = normalizeGoal(rawStore.dailyGoalMl);
  if (goal !== rawStore.dailyGoalMl) changed = true;
  var createdAtRaw = Number(rawStore.createdAt);
  var createdAt = Number.isFinite(createdAtRaw) && createdAtRaw > 0 ? Math.round(createdAtRaw) : fallback.createdAt;
  if (createdAt !== rawStore.createdAt) changed = true;
  var updatedAtRaw = Number(rawStore.updatedAt);
  var updatedAt = Number.isFinite(updatedAtRaw) && updatedAtRaw > 0 ? Math.round(updatedAtRaw) : fallback.updatedAt;
  if (updatedAt !== rawStore.updatedAt) changed = true;
  var sourceMap = rawStore.recordsByDate;
  var recordsByDate = {};
  var cutoffKey = toDateKey(addDays(new Date(), -HISTORY_KEEP_DAYS));
  if (!sourceMap || _typeof2(sourceMap) !== "object") {
    changed = true;
  } else {
    Object.keys(sourceMap).forEach(function(dateKey) {
      if (!isDateKey(dateKey)) {
        changed = true;
        return;
      }
      if (dateKey < cutoffKey) {
        changed = true;
        return;
      }
      var rawList = sourceMap[dateKey];
      if (!Array.isArray(rawList)) {
        changed = true;
        return;
      }
      var list = [];
      rawList.forEach(function(item) {
        var normalized = normalizeRecord(item);
        if (!normalized) {
          changed = true;
          return;
        }
        list.push(normalized);
      });
      list.sort(function(a, b) {
        return a.ts - b.ts;
      });
      if (list.length > MAX_DAILY_RECORDS) {
        list.splice(0, list.length - MAX_DAILY_RECORDS);
        changed = true;
      }
      if (list.length) recordsByDate[dateKey] = list;
    });
  }
  if (rawStore.version !== STORAGE_VERSION) changed = true;
  return {
    store: {
      version: STORAGE_VERSION,
      dailyGoalMl: goal,
      recordsByDate: recordsByDate,
      createdAt: createdAt,
      updatedAt: updatedAt
    },
    changed: changed
  };
}

function getDateTotal(recordsByDate, dateKey) {
  var records = recordsByDate[dateKey];
  if (!Array.isArray(records) || !records.length) return 0;
  return sumRecordAmounts(records);
}

// 缓存对象，用于存储 calculateStreak 函数的计算结果
var streakCache = {
  data: {},
  lastUpdate: 0,
  // 生成缓存键
  generateKey: function generateKey(recordsByDate, dailyGoalMl, todayKey) {
    // 使用今天的日期和目标饮水量作为缓存键
    // 因为 recordsByDate 可能会变化，所以需要考虑其内容
    // 这里使用 todayKey 和 dailyGoalMl 作为主要键，因为如果这些值变化，结果肯定不同
    return "".concat(todayKey, "_").concat(dailyGoalMl);
  },
  // 获取缓存值
  get: function get(key) {
    return this.data[key];
  },
  // 设置缓存值
  set: function set(key, value) {
    this.data[key] = value;
    this.lastUpdate = Date.now();
  },
  // 清理过期缓存
  clearExpired: function clearExpired() {
    var now = Date.now();
    // 缓存有效期为 1 小时
    var expirationTime = 60 * 60 * 1000;
    if (now - this.lastUpdate > expirationTime) {
      this.data = {};
      this.lastUpdate = now;
    }
  }
};

function calculateStreak(recordsByDate, dailyGoalMl, todayKey) {
  if (dailyGoalMl <= 0) return 0;

  // 清理过期缓存
  streakCache.clearExpired();

  // 生成缓存键
  var cacheKey = streakCache.generateKey(recordsByDate, dailyGoalMl, todayKey);

  // 检查缓存中是否存在结果
  var cachedResult = streakCache.get(cacheKey);
  if (cachedResult !== undefined) {
    return cachedResult;
  }

  // 计算连续打卡天数
  var streak = 0;
  var todayDate = parseDateKey(todayKey);
  if (!todayDate) return 0;
  for (var i = 0; i < HISTORY_KEEP_DAYS; i += 1) {
    var dateKey = toDateKey(addDays(todayDate, -i));
    var total = getDateTotal(recordsByDate, dateKey);
    if (total >= dailyGoalMl) {
      streak += 1;
      continue;
    }
    break;
  }

  // 存储计算结果到缓存
  streakCache.set(cacheKey, streak);
  return streak;
}

function buildTrend(recordsByDate, dailyGoalMl) {
  var endDate = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : new Date();
  var length = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : TREND_DAYS;
  var points = [];
  for (var offset = length - 1; offset >= 0; offset -= 1) {
    var date = addDays(endDate, -offset);
    var dateKey = toDateKey(date);
    var total = getDateTotal(recordsByDate, dateKey);
    points.push({
      dateKey: dateKey,
      label: formatDate(dateKey, "monthDay"),
      total: total,
      completed: total >= dailyGoalMl
    });
  }
  var maxTotal = Math.max.apply(Math, [dailyGoalMl, 1].concat(_toConsumableArray2(points.map(function(point) {
    return point.total;
  }))));
  return points.map(function(point) {
    var ratio = point.total / maxTotal;
    return _objectSpread2(_objectSpread2({}, point), {}, {
      barHeight: Math.max(14, Math.round(ratio * 120))
    });
  });
}

function getMonthTrendLayout() {
  var _wxCompat$getLayoutMe = wxCompat.getLayoutMetrics(),
    windowWidth = _wxCompat$getLayoutMe.windowWidth;
  var safeWindowWidth = Math.max(Number(windowWidth) || 375, 320);
  var horizontalPaddingPx = Math.max(Math.round(rpxToPx(MONTH_TREND_CHART_SIDE_PADDING_RPX, safeWindowWidth)), 8);
  var topPaddingPx = Math.max(Math.round(rpxToPx(MONTH_TREND_CHART_TOP_PADDING_RPX, safeWindowWidth)), 10);
  var baselineOffsetPx = Math.max(Math.round(rpxToPx(MONTH_TREND_CHART_BASELINE_OFFSET_RPX, safeWindowWidth)), 12);
  var outerPaddingPx = Math.round(rpxToPx(PAGE_SIDE_PADDING_RPX * 2 + SECTION_CARD_PADDING_RPX * 2, safeWindowWidth));
  var chartWidthPx = Math.max(Math.round(safeWindowWidth - outerPaddingPx), 260);
  var chartHeightPx = Math.max(Math.round(rpxToPx(MONTH_TREND_CHART_HEIGHT_RPX, safeWindowWidth)), 132);
  return {
    chartWidthPx: chartWidthPx,
    chartHeightPx: chartHeightPx,
    horizontalPaddingPx: horizontalPaddingPx,
    topPaddingPx: topPaddingPx,
    baselineOffsetPx: baselineOffsetPx
  };
}

function buildMonthTrend(recordsByDate, dailyGoalMl) {
  var endDate = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : new Date();
  var layout = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
  var length = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : MONTH_TREND_DAYS;
  var chartWidthPx = Math.max(Number(layout.chartWidthPx) || 320, 260);
  var chartHeightPx = Math.max(Number(layout.chartHeightPx) || 136, 132);
  var horizontalPaddingPx = Math.max(Number(layout.horizontalPaddingPx) || 10, 8);
  var topPaddingPx = Math.max(Number(layout.topPaddingPx) || 10, 8);
  var baselineOffsetPx = Math.max(Number(layout.baselineOffsetPx) || 12, 10);
  var usableWidthPx = Math.max(chartWidthPx - horizontalPaddingPx * 2, 1);
  var usableHeightPx = Math.max(chartHeightPx - topPaddingPx - baselineOffsetPx, 1);
  var stepX = length > 1 ? usableWidthPx / (length - 1) : 0;
  var rawPoints = [];
  for (var offset = length - 1; offset >= 0; offset -= 1) {
    var date = addDays(endDate, -offset);
    var dateKey = toDateKey(date);
    var total = getDateTotal(recordsByDate, dateKey);
    rawPoints.push({
      dateKey: dateKey,
      label: formatDate(dateKey, "monthDay"),
      total: total,
      completed: total >= dailyGoalMl
    });
  }
  var maxTotal = Math.max.apply(Math, [dailyGoalMl, 1].concat(_toConsumableArray2(rawPoints.map(function(point) {
    return point.total;
  }))));
  var peakTotal = Math.max.apply(Math, [0].concat(_toConsumableArray2(rawPoints.map(function(point) {
    return point.total;
  }))));
  var points = rawPoints.map(function(point, index) {
    var xPx = horizontalPaddingPx + stepX * index;
    var ratio = point.total / maxTotal;
    var yPx = baselineOffsetPx + usableHeightPx * ratio;
    return _objectSpread2(_objectSpread2({}, point), {}, {
      leftPx: xPx,
      bottomPx: yPx,
      style: "left:".concat(xPx.toFixed(1), "px;bottom:").concat(yPx.toFixed(1), "px;")
    });
  });
  var segments = [];
  for (var index = 0; index < points.length - 1; index += 1) {
    var current = points[index];
    var next = points[index + 1];
    var dx = next.leftPx - current.leftPx;
    var dy = next.bottomPx - current.bottomPx;
    var lengthPx = Math.sqrt(dx * dx + dy * dy);
    var angleDeg = Math.atan2(-dy, dx) * (180 / Math.PI);
    segments.push({
      key: "".concat(current.dateKey, "_").concat(next.dateKey),
      completed: current.completed && next.completed,
      style: "left:".concat(current.leftPx.toFixed(1), "px;bottom:").concat((current.bottomPx - MONTH_TREND_SEGMENT_THICKNESS_PX / 2).toFixed(1), "px;width:").concat(lengthPx.toFixed(1), "px;transform:rotate(").concat(angleDeg.toFixed(2), "deg);")
    });
  }
  var labelIndexes = new Set([0, points.length - 1]);
  var labelStep = points.length > 24 ? 5 : 4;
  for (var _index = labelStep - 1; _index < points.length - 1; _index += labelStep) {
    labelIndexes.add(_index);
  }
  var labels = points.map(function(point, index) {
    return {
      point: point,
      index: index
    };
  }).filter(function(_ref) {
    var index = _ref.index;
    return labelIndexes.has(index);
  }).map(function(_ref2) {
    var point = _ref2.point,
      index = _ref2.index;
    var transform = "translateX(-50%)";
    if (index === 0) transform = "translateX(0)";
    if (index === points.length - 1) transform = "translateX(-100%)";
    return {
      key: "".concat(point.dateKey, "_label"),
      label: point.label,
      style: "left:".concat(point.leftPx.toFixed(1), "px;transform:").concat(transform, ";")
    };
  });
  var guideRatios = [0, 0.25, 0.5, 0.75, 1];
  var guides = guideRatios.map(function(ratio) {
    return {
      key: "guide_".concat(ratio),
      style: "bottom:".concat((baselineOffsetPx + usableHeightPx * ratio).toFixed(1), "px;")
    };
  });
  var goalLineStyle = dailyGoalMl > 0 ? "bottom:".concat((baselineOffsetPx + usableHeightPx * clamp(dailyGoalMl / maxTotal, 0, 1)).toFixed(1), "px;") : "";
  return {
    points: points,
    segments: segments,
    labels: labels,
    guides: guides,
    goalLineStyle: goalLineStyle,
    maxTotal: maxTotal,
    peakTotal: peakTotal
  };
}

function buildCalendar(recordsByDate, dailyGoalMl, year, month) {
  var todayKey = toDateKey(new Date());
  var firstDate = new Date(year, month - 1, 1);
  var leadingSlots = (firstDate.getDay() + 6) % 7;
  var currentMonthDays = daysInMonth(year, month);
  var prevMonthDate = new Date(year, month - 2, 1);
  var prevYear = prevMonthDate.getFullYear();
  var prevMonth = prevMonthDate.getMonth() + 1;
  var prevMonthDays = daysInMonth(prevYear, prevMonth);
  var createCell = function createCell(date, isCurrentMonth) {
    var dateKey = toDateKey(date);
    var total = getDateTotal(recordsByDate, dateKey);
    var checkedIn = total > 0;
    return {
      key: "".concat(dateKey, "_").concat(isCurrentMonth ? "in" : "out"),
      dateKey: dateKey,
      day: date.getDate(),
      isCurrentMonth: isCurrentMonth,
      checkedIn: checkedIn,
      completed: checkedIn && total >= dailyGoalMl,
      isToday: dateKey === todayKey,
      isFuture: dateKey > todayKey,
      totalLabel: checkedIn ? "".concat(total) : ""
    };
  };
  var cells = [];
  for (var i = 0; i < leadingSlots; i += 1) {
    var day = prevMonthDays - leadingSlots + i + 1;
    cells.push(createCell(new Date(prevYear, prevMonth - 1, day), false));
  }
  for (var _day = 1; _day <= currentMonthDays; _day += 1) {
    cells.push(createCell(new Date(year, month - 1, _day), true));
  }
  var trailingSlots = (7 - cells.length % 7) % 7;
  for (var _i = 1; _i <= trailingSlots; _i += 1) {
    cells.push(createCell(new Date(year, month, _i), false));
  }
  return cells;
}

function calculateMonthStats(recordsByDate, dailyGoalMl, year, month) {
  var totalDays = daysInMonth(year, month);
  var checkedInDays = 0;
  var completedDays = 0;
  var monthTotalMl = 0;
  for (var day = 1; day <= totalDays; day += 1) {
    var dateKey = "".concat(year, "-").concat(pad2(month), "-").concat(pad2(day));
    var total = getDateTotal(recordsByDate, dateKey);
    monthTotalMl += total;
    if (total > 0) checkedInDays += 1;
    if (total >= dailyGoalMl) completedDays += 1;
  }
  var now = new Date();
  var elapsedDays = totalDays;
  if (year === now.getFullYear() && month === now.getMonth() + 1) {
    elapsedDays = now.getDate();
  }
  if (year > now.getFullYear() || year === now.getFullYear() && month > now.getMonth() + 1) {
    elapsedDays = 0;
  }
  var monthAverageMl = elapsedDays > 0 ? Math.round(monthTotalMl / elapsedDays) : 0;
  return {
    checkedInDays: checkedInDays,
    completedDays: completedDays,
    monthTotalMl: monthTotalMl,
    monthAverageMl: monthAverageMl
  };
}
Page({
  data: {
    todayLabel: "",
    todayTotalMl: 0,
    dailyGoalMl: DEFAULT_GOAL_ML,
    remainingMl: DEFAULT_GOAL_ML,
    progressPercent: 0,
    recordCountToday: 0,
    streakDays: 0,
    latestCheckinText: "今日还未打卡",
    todayRecords: [],
    trendPoints: [],
    monthTrendPoints: [],
    monthTrendSegments: [],
    monthTrendLabels: [],
    monthTrendGuides: [],
    monthTrendGoalLineStyle: "",
    monthTrendChartWidthPx: 0,
    monthTrendChartHeightPx: 0,
    monthTrendMaxMl: 0,
    displayYear: 0,
    displayMonth: 0,
    calendarDays: [],
    monthCheckedInDays: 0,
    monthCompletedDays: 0,
    monthTotalMl: 0,
    monthAverageMl: 0,
    progressBarStyle: "width:0%;"
  },
  onLoad: function onLoad(options) {
    var now = new Date();
    this._displayYear = now.getFullYear();
    this._displayMonth = now.getMonth() + 1;
    this.setData({
      displayYear: this._displayYear,
      displayMonth: this._displayMonth
    });
    this._focusSection = options && options.focus ? options.focus : "";
    this._store = createDefaultStore();
    this._loadStore({
      migrateLegacy: true
    });
  },
  onReady: function onReady() {
    if (this._focusSection === "records") {
      this._focusSection = "";
      this._scrollToRecordSection();
    }
  },
  onShow: function onShow() {
    this._loadStore();
  },
  _scrollToRecordSection: function _scrollToRecordSection() {
    if (!wx.pageScrollTo) return;
    setTimeout(function() {
      wx.pageScrollTo({
        selector: "#recordSection",
        duration: 300
      });
    }, 80);
  },
  _legacyLocalOnDeleteRecord: function _legacyLocalOnDeleteRecord(e) {
    var _this3 = this;
    var recordId = e.currentTarget.dataset.id;
    if (!recordId) return;
    var todayKey = toDateKey(new Date());
    var todayList = this._store.recordsByDate[todayKey] || [];
    var target = todayList.find(function(item) {
      return item.id === recordId;
    });
    if (!target) return;
    wx.showModal({
      title: "删除记录",
      content: "\u786E\u8BA4\u5220\u9664 ".concat(target.amount, "ml \u6253\u5361\u8BB0\u5F55\uFF1F"),
      success: function success(res) {
        if (!res.confirm) return;
        var nextList = todayList.filter(function(item) {
          return item.id !== recordId;
        });
        if (nextList.length) {
          _this3._store.recordsByDate[todayKey] = nextList;
        } else {
          delete _this3._store.recordsByDate[todayKey];
        }
        _this3._store.updatedAt = Date.now();
        if (!_this3._saveStore()) return;
        _this3._refreshView();
        wx.showToast({
          title: "已删除",
          icon: "none"
        });
      }
    });
  },
  _legacyLocalClearTodayRecords: function _legacyLocalClearTodayRecords() {
    var _this4 = this;
    var todayKey = toDateKey(new Date());
    var records = this._store.recordsByDate[todayKey] || [];
    if (!records.length) return;
    wx.showModal({
      title: "清空今日记录",
      content: "确认清空今天所有打卡记录吗？",
      success: function success(res) {
        if (!res.confirm) return;
        delete _this4._store.recordsByDate[todayKey];
        _this4._store.updatedAt = Date.now();
        if (!_this4._saveStore()) return;
        _this4._refreshView();
        wx.showToast({
          title: "已清空",
          icon: "none"
        });
      }
    });
  },
  onPrevMonth: function onPrevMonth() {
    var current = new Date(this._displayYear, this._displayMonth - 1, 1);
    current.setMonth(current.getMonth() - 1);
    this._displayYear = current.getFullYear();
    this._displayMonth = current.getMonth() + 1;
    this._refreshView();
  },
  onNextMonth: function onNextMonth() {
    var current = new Date(this._displayYear, this._displayMonth - 1, 1);
    current.setMonth(current.getMonth() + 1);
    this._displayYear = current.getFullYear();
    this._displayMonth = current.getMonth() + 1;
    this._refreshView();
  },
  backToCurrentMonth: function backToCurrentMonth() {
    var now = new Date();
    this._displayYear = now.getFullYear();
    this._displayMonth = now.getMonth() + 1;
    this._refreshView();
  },
  _legacyLocalAddRecord: function _legacyLocalAddRecord(amountValue) {
    var rawAmount = Math.round(Number(amountValue));
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      wx.showToast({
        title: "请输入有效饮水量",
        icon: "none"
      });
      return;
    }
    if (rawAmount > MAX_SINGLE_AMOUNT_ML) {
      wx.showToast({
        title: "\u5355\u6B21\u4E0A\u9650 ".concat(MAX_SINGLE_AMOUNT_ML, "ml"),
        icon: "none"
      });
      return;
    }
    var amount = normalizeAmount(rawAmount);
    var dailyGoalMl = this._store.dailyGoalMl;
    var _checkinOps$appendRec = checkinOps.appendRecordToStore({
        store: this._store,
        amount: amount,
        toDateKey: toDateKey,
        sumAmounts: sumRecordAmounts,
        makeRecordId: makeRecordId,
        maxDailyRecords: MAX_DAILY_RECORDS
      }),
      beforeTotal = _checkinOps$appendRec.beforeTotal,
      afterTotal = _checkinOps$appendRec.afterTotal;

    // 更新饮水时间为当前时间
    waterReminder.setLastWaterTime(Date.now());
    if (!this._saveStore()) return;
    this._refreshView();
    if (beforeTotal < dailyGoalMl && afterTotal >= dailyGoalMl) {
      wx.showToast({
        title: "今日饮水目标达成",
        icon: "none"
      });
      return;
    }
    wx.showToast({
      title: "\u5DF2\u6253\u5361 +".concat(amount, "ml"),
      icon: "none"
    });
  },
  _legacyLocalLoadStore: function _legacyLocalLoadStore() {
    var _checkinOps$safeReadS = checkinOps.safeReadStore({
        key: STORAGE_KEY,
        sanitize: sanitizeStore,
        onReadError: function onReadError(error) {
          console.error("读取打卡数据失败", error);
        }
      }),
      store = _checkinOps$safeReadS.store,
      changed = _checkinOps$safeReadS.changed;
    this._store = store;
    if (changed) {
      this._saveStore();
    }
  },
  _legacyLocalSaveStore: function _legacyLocalSaveStore() {
    return checkinOps.safeWriteStore({
      key: STORAGE_KEY,
      store: this._store,
      onWriteError: function onWriteError(error) {
        console.error("保存打卡数据失败", error);
        wx.showToast({
          title: "保存失败，请稍后重试",
          icon: "none"
        });
      }
    });
  },
  _refreshView: function _refreshView() {
    var now = new Date();
    var todayKey = toDateKey(now);
    var dailyGoalMl = normalizeGoal(this._store.dailyGoalMl);
    if (dailyGoalMl !== this._store.dailyGoalMl) {
      this._store.dailyGoalMl = dailyGoalMl;
      this._store.updatedAt = Date.now();
      this._saveStore();
    }
    var todayList = Array.isArray(this._store.recordsByDate[todayKey]) ? _toConsumableArray2(this._store.recordsByDate[todayKey]) : [];
    todayList.sort(function(a, b) {
      return b.ts - a.ts;
    });
    var todayTotalMl = sumRecordAmounts(todayList);
    var remainingMl = Math.max(dailyGoalMl - todayTotalMl, 0);
    var progressPercent = dailyGoalMl > 0 ? clamp(Math.round(todayTotalMl * 100 / dailyGoalMl), 0, 100) : 0;
    var streakDays = calculateStreak(this._store.recordsByDate, dailyGoalMl, todayKey);
    var latestCheckinText = todayList.length ? "\u6700\u8FD1\uFF1A".concat(formatTime(todayList[0].ts), " +").concat(todayList[0].amount, "ml") : "今日还未打卡";
    var trendPoints = buildTrend(this._store.recordsByDate, dailyGoalMl, now, TREND_DAYS);
    var monthTrendLayout = getMonthTrendLayout();
    var monthTrend = buildMonthTrend(this._store.recordsByDate, dailyGoalMl, now, monthTrendLayout, MONTH_TREND_DAYS);
    var calendarDays = buildCalendar(this._store.recordsByDate, dailyGoalMl, this._displayYear, this._displayMonth);
    var monthStats = calculateMonthStats(this._store.recordsByDate, dailyGoalMl, this._displayYear, this._displayMonth);
    var todayRecords = todayList.map(function(record) {
      return _objectSpread2(_objectSpread2({}, record), {}, {
        timeLabel: formatTime(record.ts)
      });
    });
    this.setData({
      todayLabel: formatDate(todayKey, "title"),
      todayTotalMl: todayTotalMl,
      dailyGoalMl: dailyGoalMl,
      remainingMl: remainingMl,
      progressPercent: progressPercent,
      recordCountToday: todayList.length,
      streakDays: streakDays,
      latestCheckinText: latestCheckinText,
      todayRecords: todayRecords,
      trendPoints: trendPoints,
      monthTrendPoints: monthTrend.points,
      monthTrendSegments: monthTrend.segments,
      monthTrendLabels: monthTrend.labels,
      monthTrendGuides: monthTrend.guides,
      monthTrendGoalLineStyle: monthTrend.goalLineStyle,
      monthTrendChartWidthPx: monthTrendLayout.chartWidthPx,
      monthTrendChartHeightPx: monthTrendLayout.chartHeightPx,
      monthTrendMaxMl: monthTrend.peakTotal,
      displayYear: this._displayYear,
      displayMonth: this._displayMonth,
      calendarDays: calendarDays,
      monthCheckedInDays: monthStats.checkedInDays,
      monthCompletedDays: monthStats.completedDays,
      monthTotalMl: monthStats.monthTotalMl,
      monthAverageMl: monthStats.monthAverageMl,
      progressBarStyle: "width:".concat(progressPercent, "%;")
    });
  },
  _readLegacyStoreForCloudMigration: function _readLegacyStoreForCloudMigration() {
    var result = checkinOps.safeReadStore({
      key: STORAGE_KEY,
      sanitize: sanitizeStore,
      onReadError: function onReadError(error) {
        console.error("[legacy checkin read failed]", error);
      }
    });
    return result && result.store ? result.store : null;
  },
  _loadStore: function _loadStore() {
    var _arguments = arguments,
      _this5 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee2() {
      var options, seq, legacyStore, store;
      return _regeneratorRuntime2().wrap(function _callee2$(_context2) {
        while (1) switch (_context2.prev = _context2.next) {
          case 0:
            options = _arguments.length > 0 && _arguments[0] !== undefined ? _arguments[0] : {};
            seq = Number(_this5._loadStoreSeq || 0) + 1;
            _this5._loadStoreSeq = seq;
            _context2.prev = 3;
            legacyStore = options.migrateLegacy ? _this5._readLegacyStoreForCloudMigration() : null;
            _context2.next = 7;
            return drinkData.getStore({
              historyDays: HISTORY_KEEP_DAYS,
              legacyStore: legacyStore
            });
          case 7:
            store = _context2.sent;
            if (!(seq !== _this5._loadStoreSeq)) {
              _context2.next = 10;
              break;
            }
            return _context2.abrupt("return", false);
          case 10:
            _this5._store = store;
            _this5._refreshView();
            return _context2.abrupt("return", true);
          case 15:
            _context2.prev = 15;
            _context2.t0 = _context2["catch"](3);
            console.error("[drink data load failed]", _context2.t0);
            if (seq === _this5._loadStoreSeq) {
              wx.showToast({
                title: "云端饮水数据加载失败",
                icon: "none"
              });
            }
            return _context2.abrupt("return", false);
          case 20:
          case "end":
            return _context2.stop();
        }
      }, _callee2, null, [
        [3, 15]
      ]);
    }))();
  },
  _saveStore: function _saveStore() {
    return true;
  },
  onDeleteRecord: function onDeleteRecord(e) {
    var _this8 = this;
    var recordId = e.currentTarget.dataset.id;
    if (!recordId) return;
    var todayKey = toDateKey(new Date());
    var todayList = this._store.recordsByDate[todayKey] || [];
    var target = todayList.find(function(item) {
      return item.id === recordId;
    });
    if (!target) return;
    wx.showModal({
      title: "删除记录",
      content: "\u786E\u8BA4\u5220\u9664 ".concat(target.amount, "ml \u996E\u6C34\u8BB0\u5F55\uFF1F"),
      success: function() {
        var _success = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee5(res) {
          return _regeneratorRuntime2().wrap(function _callee5$(_context5) {
            while (1) switch (_context5.prev = _context5.next) {
              case 0:
                if (res.confirm) {
                  _context5.next = 2;
                  break;
                }
                return _context5.abrupt("return");
              case 2:
                _context5.prev = 2;
                _context5.next = 5;
                return drinkData.deleteRecord(recordId, {
                  historyDays: HISTORY_KEEP_DAYS
                });
              case 5:
                _this8._store = _context5.sent;
                _this8._refreshView();
                wx.showToast({
                  title: "已删除",
                  icon: "none"
                });
                _context5.next = 14;
                break;
              case 10:
                _context5.prev = 10;
                _context5.t0 = _context5["catch"](2);
                console.error("[drink data delete failed]", _context5.t0);
                wx.showToast({
                  title: "删除失败，请稍后重试",
                  icon: "none"
                });
              case 14:
              case "end":
                return _context5.stop();
            }
          }, _callee5, null, [
            [2, 10]
          ]);
        }));

        function success(_x) {
          return _success.apply(this, arguments);
        }
        return success;
      }()
    });
  },
  clearTodayRecords: function clearTodayRecords() {
    var _this9 = this;
    var todayKey = toDateKey(new Date());
    var records = this._store.recordsByDate[todayKey] || [];
    if (!records.length) return;
    wx.showModal({
      title: "清空今日记录",
      content: "确认清空今天所有饮水记录吗？",
      success: function() {
        var _success2 = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee6(res) {
          return _regeneratorRuntime2().wrap(function _callee6$(_context6) {
            while (1) switch (_context6.prev = _context6.next) {
              case 0:
                if (res.confirm) {
                  _context6.next = 2;
                  break;
                }
                return _context6.abrupt("return");
              case 2:
                _context6.prev = 2;
                _context6.next = 5;
                return drinkData.clearToday({
                  historyDays: HISTORY_KEEP_DAYS
                });
              case 5:
                _this9._store = _context6.sent;
                _this9._refreshView();
                wx.showToast({
                  title: "已清空",
                  icon: "none"
                });
                _context6.next = 14;
                break;
              case 10:
                _context6.prev = 10;
                _context6.t0 = _context6["catch"](2);
                console.error("[drink data clear failed]", _context6.t0);
                wx.showToast({
                  title: "清空失败，请稍后重试",
                  icon: "none"
                });
              case 14:
              case "end":
                return _context6.stop();
            }
          }, _callee6, null, [
            [2, 10]
          ]);
        }));

        function success(_x2) {
          return _success2.apply(this, arguments);
        }
        return success;
      }()
    });
  }
});
