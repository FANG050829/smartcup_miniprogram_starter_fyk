var checkinCore = require("../../utils/checkinCore");
var drinkData = require("../../utils/drinkData");
var waterReminder = require("../../utils/waterReminderCore");

var HISTORY_KEEP_DAYS = 400;
var MAX_SINGLE_AMOUNT_ML = checkinCore.MAX_SINGLE_AMOUNT_ML;
var QUICK_AMOUNTS = checkinCore.QUICK_AMOUNTS;
// 与 drinkData.normalizeGoal 的边界保持一致
var GOAL_MIN_ML = 800;
var GOAL_MAX_ML = 6000;
var GOAL_STEP_ML = 100;
var DAY_MS = 24 * 60 * 60 * 1000;
var WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
var RHYTHM_START_MIN = 6 * 60;
var RHYTHM_END_MIN = 24 * 60;
var TOP_UP_AMOUNT_ML = 200;
var TOP_UP_IDLE_MS = 90 * 60 * 1000;
var FRESH_NOTCH_MS = 500;
var GAIN_TAG_MS = 950;
var TIME_TICK_MS = 30 * 1000;
var ADVICE_MAX_LINES = 3;

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function pad2(value) {
  return value < 10 ? "0" + value : "" + value;
}

var toDateKey = checkinCore.toDateKey;

function formatTime(timestamp) {
  var date = new Date(timestamp);
  return pad2(date.getHours()) + ":" + pad2(date.getMinutes());
}

function formatDateTitle(dateKey) {
  var parts = String(dateKey || "").split("-");
  if (parts.length !== 3) return "";
  var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(date.getTime())) return "";
  return date.getMonth() + 1 + "月" + date.getDate() + "日 · " + WEEKDAY_LABELS[date.getDay()];
}

function formatStampDate(dateKey) {
  var parts = String(dateKey || "").split("-");
  if (parts.length !== 3) return "";
  return Number(parts[1]) + "." + Number(parts[2]);
}

function formatThousands(value) {
  var n = Math.max(0, Math.round(Number(value) || 0));
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function roundTo50(value) {
  return Math.round(value / 50) * 50;
}

function sortAsc(records) {
  return records.slice().sort(function(a, b) {
    return a.ts - b.ts;
  });
}

function buildLedgerSub(totalMl, goalMl, hasRecords, reachedGoal) {
  if (!hasRecords) return "今天还没有记录，第一口最要紧";
  if (reachedGoal) {
    var over = totalMl - goalMl;
    return over > 0 ? "目标完成，多出的 " + formatThousands(over) + "ml 都是赚的" : "目标完成，不多不少刚刚好";
  }
  var remaining = Math.max(0, goalMl - totalMl);
  var pct = goalMl > 0 ? Math.round((totalMl * 100) / goalMl) : 0;
  return "还差 " + formatThousands(remaining) + "ml · 已完成 " + pct + "%";
}

// 水位尺刻度：四等分处标毫升数
function buildRulerMajors(goalMl) {
  var majors = [];
  [0, 25, 50, 75, 100].forEach(function(pct) {
    majors.push({
      pct: pct,
      ml: pct === 100 ? formatThousands(goalMl) : formatThousands(Math.round((goalMl * pct) / 100 / 50) * 50)
    });
  });
  return majors;
}

// 每次打卡在水尺上的落点：累计量占目标的比例
function buildNotches(recordsAsc, goalMl) {
  if (!(goalMl > 0)) return [];
  var cum = 0;
  return recordsAsc.map(function(record) {
    cum += record.amount;
    return {
      key: record.id,
      left: clamp((cum * 100) / goalMl, 0, 100),
      timeLabel: formatTime(record.ts),
      amount: record.amount
    };
  });
}

// 时段节奏：06:00–24:00 内每笔记录的位置与量级
function buildRhythmTicks(recordsAsc) {
  return recordsAsc.map(function(record, index) {
    var date = new Date(record.ts);
    var minutes = date.getHours() * 60 + date.getMinutes();
    var left = clamp(((minutes - RHYTHM_START_MIN) * 100) / (RHYTHM_END_MIN - RHYTHM_START_MIN), 0, 100);
    var size = record.amount >= 400 ? 3 : record.amount >= 200 ? 2 : 1;
    return { key: "t" + index + "_" + record.ts, left: left, size: size };
  });
}

function nowLeftPercent(now) {
  var minutes = now.getHours() * 60 + now.getMinutes();
  return clamp(((minutes - RHYTHM_START_MIN) * 100) / (RHYTHM_END_MIN - RHYTHM_START_MIN), 0, 100);
}

function buildRhythmGrid() {
  return [6, 12, 18, 24].map(function(hour) {
    return {
      left: ((hour * 60 - RHYTHM_START_MIN) * 100) / (RHYTHM_END_MIN - RHYTHM_START_MIN),
      label: String(hour)
    };
  });
}

function describeLastDrink(lastTs, now) {
  if (!lastTs) return { text: "", agoMs: Infinity };
  var agoMs = Math.max(0, now.getTime() - lastTs);
  var sameDay = toDateKey(now) === toDateKey(new Date(lastTs));
  var yesterday = toDateKey(new Date(now.getTime() - DAY_MS)) === toDateKey(new Date(lastTs));
  var text;
  if (sameDay) {
    if (agoMs < 2 * 60 * 1000) {
      text = "上一杯 " + formatTime(lastTs) + " · 刚刚";
    } else if (agoMs < 60 * 60 * 1000) {
      text = "上一杯 " + formatTime(lastTs) + " · " + Math.floor(agoMs / 60000) + " 分钟前";
    } else {
      text = "上一杯 " + formatTime(lastTs) + " · " + Math.floor(agoMs / 3600000) + " 小时 " + Math.floor((agoMs % 3600000) / 60000) + " 分前";
    }
  } else if (yesterday) {
    text = "上一杯停在昨天 " + formatTime(lastTs);
  } else {
    var date = new Date(lastTs);
    text = "上一杯停在 " + (date.getMonth() + 1) + "月" + date.getDate() + "日";
  }
  return { text: text, agoMs: agoMs };
}

function findLastDrinkTs(store) {
  var lastTs = 0;
  var recordsByDate = store.recordsByDate || {};
  Object.keys(recordsByDate).forEach(function(dateKey) {
    var list = recordsByDate[dateKey] || [];
    list.forEach(function(record) {
      if (record.ts > lastTs) lastTs = record.ts;
    });
  });
  return lastTs;
}

// 建议下一杯：剩余量按清醒时段摊到每 1.5 小时一口
function computeSuggestion(totalMl, goalMl, now) {
  var remaining = Math.max(0, goalMl - totalMl);
  if (remaining <= 0) return 200;
  var minutesLeft = 23 * 60 - (now.getHours() * 60 + now.getMinutes());
  var hoursLeft = Math.max(1, minutesLeft / 60);
  var sipsLeft = Math.max(1, Math.ceil(hoursLeft / 1.5));
  return clamp(roundTo50(remaining / sipsLeft), 100, 500);
}

function computeStreak(recordsByDate, goalMl, todayKey) {
  var dayKey = todayKey;
  var streak = 0;
  // 今天未达标不打断已有连击，从昨天起算
  if (!dayReached(recordsByDate, dayKey, goalMl)) {
    dayKey = shiftDateKey(dayKey, -1);
  }
  while (dayReached(recordsByDate, dayKey, goalMl)) {
    streak += 1;
    dayKey = shiftDateKey(dayKey, -1);
  }
  return streak;
}

function dayReached(recordsByDate, dateKey, goalMl) {
  var list = recordsByDate[dateKey];
  if (!Array.isArray(list) || !list.length) return false;
  return checkinCore.sumAmounts(list) >= goalMl;
}

function shiftDateKey(dateKey, delta) {
  var parts = String(dateKey || "").split("-");
  if (parts.length !== 3) return "";
  var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(date.getTime())) return "";
  return toDateKey(new Date(date.getTime() + delta * DAY_MS));
}

function buildWeekDots(recordsByDate, goalMl, todayKey) {
  var dots = [];
  for (var i = 6; i >= 0; i -= 1) {
    var dateKey = shiftDateKey(todayKey, -i);
    var parts = dateKey.split("-");
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var list = recordsByDate[dateKey] || [];
    var total = checkinCore.sumAmounts(list);
    dots.push({
      key: dateKey,
      label: WEEKDAY_LABELS[date.getDay()].charAt(1),
      state: total >= goalMl ? "full" : total > 0 ? "partial" : "",
      today: dateKey === todayKey
    });
  }
  return dots;
}

function splitAdviceText(text) {
  var lines = String(text || "").replace(/\r/g, "\n").split("\n").map(function(item) {
    return item.replace(/^[\s\d.、\-*]+/, "").trim();
  }).filter(Boolean);
  return lines.slice(0, ADVICE_MAX_LINES);
}

Page({
  data: {
    loadError: false,
    todayLabel: "",
    todayTotalLabel: "0",
    ledgerSub: "",
    dailyGoalMl: checkinCore.DEFAULT_GOAL_ML,
    reachedGoal: false,
    stampDateText: "",
    fillPercent: 0,
    rulerMajors: [],
    notches: [],
    freshNotchKey: "",
    gainTag: null,
    rhythmGrid: buildRhythmGrid(),
    rhythmTicks: [],
    rhythmMeta: "",
    nowLeft: null,
    lastDrink: { text: "", agoMs: Infinity },
    showTopUp: false,
    suggestedAmount: 200,
    quickAmounts: QUICK_AMOUNTS,
    customAmount: "",
    checkinBusy: false,
    streakDays: 0,
    streakTail: "",
    weekDots: [],
    goalEditing: false,
    goalDraft: checkinCore.DEFAULT_GOAL_ML,
    goalSaving: false,
    GOAL_MIN: GOAL_MIN_ML,
    GOAL_MAX: GOAL_MAX_ML,
    adviceOpen: false,
    adviceState: "idle",
    adviceLines: [],
    adviceMeta: ""
  },
  onLoad: function onLoad() {
    this._store = null;
    this._alive = true;
    this._loadSeq = 0;
    this._skipFirstShow = true;
    this._loadStore({ migrateLegacy: true });
  },
  onShow: function onShow() {
    this._alive = true;
    this._startTimeTick();
    if (this._skipFirstShow) {
      this._skipFirstShow = false;
      return;
    }
    this._loadStore();
  },
  onHide: function onHide() {
    this._alive = false;
    this._stopTimeTick();
  },
  onUnload: function onUnload() {
    this._alive = false;
    this._loadSeq = -1;
    this._stopTimeTick();
  },
  onRetryLoad: function onRetryLoad() {
    this._loadStore();
  },
  _readLegacyStore: function _readLegacyStore() {
    try {
      var raw = wx.getStorageSync(checkinCore.STORAGE_KEY);
      if (raw && typeof raw === "object" && raw.recordsByDate) return raw;
    } catch (err) {
      console.warn("[daily-checkin] legacy store read failed", err);
    }
    return null;
  },
  _loadStore: function _loadStore(options) {
    var self = this;
    var seq = Number(this._loadSeq || 0) + 1;
    this._loadSeq = seq;
    var legacyStore = options && options.migrateLegacy ? this._readLegacyStore() : null;
    return drinkData.getStore({
      historyDays: HISTORY_KEEP_DAYS,
      legacyStore: legacyStore
    }).then(function(store) {
      if (seq !== self._loadSeq) return;
      self._store = store;
      self._refreshAll();
    }).catch(function(err) {
      if (seq !== self._loadSeq) return;
      console.warn("[daily-checkin] load store failed", err);
      self.setData({ loadError: true });
    });
  },
  _refreshAll: function _refreshAll() {
    var store = this._store;
    if (!store) return;
    var now = new Date();
    var todayKey = toDateKey(now);
    var dailyGoalMl = store.dailyGoalMl || checkinCore.DEFAULT_GOAL_ML;
    var todayList = Array.isArray(store.recordsByDate[todayKey]) ? store.recordsByDate[todayKey].slice() : [];
    var todayAsc = sortAsc(todayList);
    var todayTotalMl = checkinCore.sumAmounts(todayAsc);
    var reachedGoal = dailyGoalMl > 0 && todayTotalMl >= dailyGoalMl;
    var lastDrink = describeLastDrink(findLastDrinkTs(store), now);
    this.setData({
      loadError: false,
      todayLabel: formatDateTitle(todayKey),
      todayTotalLabel: formatThousands(todayTotalMl),
      ledgerSub: buildLedgerSub(todayTotalMl, dailyGoalMl, todayAsc.length > 0, reachedGoal),
      dailyGoalMl: dailyGoalMl,
      reachedGoal: reachedGoal,
      stampDateText: formatStampDate(todayKey),
      fillPercent: clamp(Math.round((todayTotalMl * 100) / dailyGoalMl), 0, 100),
      rulerMajors: buildRulerMajors(dailyGoalMl),
      notches: buildNotches(todayAsc, dailyGoalMl),
      rhythmTicks: buildRhythmTicks(todayAsc),
      rhythmMeta: todayAsc.length ? "共 " + todayAsc.length + " 笔" : "等待第一笔",
      lastDrink: lastDrink,
      suggestedAmount: computeSuggestion(todayTotalMl, dailyGoalMl, now),
      streakDays: computeStreak(store.recordsByDate, dailyGoalMl, todayKey),
      weekDots: buildWeekDots(store.recordsByDate, dailyGoalMl, todayKey)
    });
    this._tickTime();
  },
  // 时段节奏的"现在"指针、上一杯文案、建议下一杯都随时间走，30s 自刷
  _startTimeTick: function _startTimeTick() {
    var self = this;
    if (this._timeTimer) return;
    this._timeTimer = setInterval(function() {
      if (!self._alive) return;
      self._tickTime();
    }, TIME_TICK_MS);
  },
  _stopTimeTick: function _stopTimeTick() {
    if (this._timeTimer) {
      clearInterval(this._timeTimer);
      this._timeTimer = null;
    }
  },
  _tickTime: function _tickTime() {
    var store = this._store;
    if (!store) return;
    var now = new Date();
    var todayKey = toDateKey(now);
    var dailyGoalMl = store.dailyGoalMl || checkinCore.DEFAULT_GOAL_ML;
    var todayList = Array.isArray(store.recordsByDate[todayKey]) ? store.recordsByDate[todayKey] : [];
    var todayTotalMl = checkinCore.sumAmounts(todayList);
    var reachedGoal = dailyGoalMl > 0 && todayTotalMl >= dailyGoalMl;
    var lastDrink = describeLastDrink(findLastDrinkTs(store), now);
    var withinDaytime = now.getHours() >= 7 && now.getHours() < 23;
    var showTopUp = Number.isFinite(lastDrink.agoMs)
      && lastDrink.agoMs >= TOP_UP_IDLE_MS
      && !reachedGoal
      && withinDaytime;
    this.setData({
      nowLeft: nowLeftPercent(now),
      lastDrink: lastDrink,
      showTopUp: showTopUp,
      suggestedAmount: computeSuggestion(todayTotalMl, dailyGoalMl, now)
    });
  },
  onNotchTap: function onNotchTap(e) {
    var index = Number(e.currentTarget.dataset.index);
    var notch = this.data.notches[index];
    if (!notch) return;
    wx.showToast({ title: notch.timeLabel + " · " + notch.amount + "ml", icon: "none" });
  },
  onQuickCheckin: function onQuickCheckin(e) {
    this._checkin(e.currentTarget.dataset.amount);
  },
  onSuggestedCheckin: function onSuggestedCheckin() {
    this._checkin(this.data.suggestedAmount);
  },
  onTopUp: function onTopUp() {
    this._checkin(TOP_UP_AMOUNT_ML, "nudge");
  },
  onCustomAmountInput: function onCustomAmountInput(e) {
    this.setData({ customAmount: String(e.detail.value || "") });
  },
  onCustomCheckin: function onCustomCheckin() {
    this._checkin(this.data.customAmount);
  },
  _checkin: function _checkin(amountValue, source) {
    var self = this;
    if (this.data.checkinBusy) return;
    var rawAmount = Math.round(Number(amountValue));
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      wx.showToast({ title: "先写个有效的毫升数", icon: "none" });
      return;
    }
    if (rawAmount > MAX_SINGLE_AMOUNT_ML) {
      wx.showToast({ title: "单次上限 " + MAX_SINGLE_AMOUNT_ML + "ml", icon: "none" });
      return;
    }
    this.setData({ checkinBusy: true });
    drinkData.addRecord(rawAmount, {
      historyDays: HISTORY_KEEP_DAYS,
      source: source || "checkin"
    }).then(function(result) {
      self._store = result.store;
      // 打卡即饮水：同步刷新“上次喝水时间”，久未喝水提醒从此刻重新计时
      waterReminder.setLastWaterTime(Date.now());
      var goalMl = self._store.dailyGoalMl;
      var crossedGoal = result.beforeTotal < goalMl && result.afterTotal >= goalMl;
      self._refreshAll();
      self.setData({ checkinBusy: false, customAmount: "" });
      self._playCheckinFx(rawAmount, crossedGoal);
    }).catch(function(err) {
      console.warn("[daily-checkin] add record failed", err);
      self.setData({ checkinBusy: false });
      wx.showToast({ title: "这一笔没记上，稍后再试", icon: "none" });
    });
  },
  _playCheckinFx: function _playCheckinFx(amount, crossedGoal) {
    var self = this;
    var store = this._store;
    if (!store) return;
    var goalMl = store.dailyGoalMl || checkinCore.DEFAULT_GOAL_ML;
    var todayKey = toDateKey(new Date());
    // normalizeStore 保证当日记录按时间升序，最后一笔即刚记上的
    var todayList = Array.isArray(store.recordsByDate[todayKey]) ? store.recordsByDate[todayKey] : [];
    var freshId = todayList.length ? todayList[todayList.length - 1].id : "";
    var freshLeft = clamp(((checkinCore.sumAmounts(todayList) * 100) / goalMl), 3, 97);
    if (wx.vibrateShort) wx.vibrateShort({ type: crossedGoal ? "medium" : "light" });
    this.setData({
      freshNotchKey: freshId,
      gainTag: { left: freshLeft, amount: amount }
    });
    setTimeout(function() {
      if (!self._alive) return;
      self.setData({ freshNotchKey: "" });
    }, FRESH_NOTCH_MS);
    setTimeout(function() {
      if (!self._alive) return;
      self.setData({ gainTag: null });
    }, GAIN_TAG_MS);
  },
  onToggleGoalEdit: function onToggleGoalEdit() {
    this.setData({
      goalEditing: !this.data.goalEditing,
      goalDraft: this.data.dailyGoalMl
    });
  },
  onGoalStepDown: function onGoalStepDown() {
    this.setData({
      goalDraft: Math.max(GOAL_MIN_ML, this.data.goalDraft - GOAL_STEP_ML)
    });
  },
  onGoalStepUp: function onGoalStepUp() {
    this.setData({
      goalDraft: Math.min(GOAL_MAX_ML, this.data.goalDraft + GOAL_STEP_ML)
    });
  },
  onGoalSave: function onGoalSave() {
    var self = this;
    if (this.data.goalSaving) return;
    var draft = Math.round(Number(this.data.goalDraft));
    if (!Number.isFinite(draft)) return;
    draft = clamp(draft, GOAL_MIN_ML, GOAL_MAX_ML);
    if (draft === this.data.dailyGoalMl) {
      this.setData({ goalEditing: false });
      return;
    }
    this.setData({ goalSaving: true });
    drinkData.setGoal(draft, { historyDays: HISTORY_KEEP_DAYS }).then(function(store) {
      self._store = store;
      self._refreshAll();
      self.setData({ goalSaving: false, goalEditing: false });
      wx.showToast({ title: "目标改好了", icon: "none" });
    }).catch(function(err) {
      console.warn("[daily-checkin] set goal failed", err);
      self.setData({ goalSaving: false });
      wx.showToast({ title: "没存上，稍后再试", icon: "none" });
    });
  },
  onToggleAdvice: function onToggleAdvice() {
    var nextOpen = !this.data.adviceOpen;
    this.setData({ adviceOpen: nextOpen });
    if (nextOpen && this.data.adviceState === "idle") {
      this.onLoadAdvice();
    }
  },
  onLoadAdvice: function onLoadAdvice() {
    var self = this;
    if (this.data.adviceState === "loading") return;
    this.setData({ adviceState: "loading", adviceMeta: "" });
    drinkData.getHydrationAdvice({ force: false }).then(function(result) {
      if (!self._alive) return;
      var lines = splitAdviceText(result.advice);
      self.setData({
        adviceState: lines.length ? "ready" : "error",
        adviceLines: lines,
        adviceMeta: result.cached ? "读的是最近一次周报" : "AI 刚看过你的水账"
      });
    }).catch(function(err) {
      console.warn("[daily-checkin] hydration advice failed", err);
      if (!self._alive) return;
      self.setData({ adviceState: "error", adviceMeta: "" });
    });
  }
});
