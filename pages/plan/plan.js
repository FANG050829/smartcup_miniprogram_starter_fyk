require("../../@babel/runtime/helpers/Arrayincludes");
var _regeneratorRuntime2 = require("../../@babel/runtime/helpers/regeneratorRuntime");
var _asyncToGenerator2 = require("../../@babel/runtime/helpers/asyncToGenerator");
var _objectSpread2 = require("../../@babel/runtime/helpers/objectSpread2");
var ble = require("../../utils/ble");
var drinkData = require("../../utils/drinkData");
var planReminderCore = require("../../utils/planReminderCore");
var REMINDER_KEY = "smartcup_reminders_v1";
var DEFAULT_REMINDER_TIMES = ["10:00", "14:00", "18:00"];
var LEGACY_DEFAULT_REMINDER_TIMES = ["10:00", "02:00", "06:00"];
var WEEKDAYS = [{
  value: 1,
  label: "周一"
}, {
  value: 2,
  label: "周二"
}, {
  value: 3,
  label: "周三"
}, {
  value: 4,
  label: "周四"
}, {
  value: 5,
  label: "周五"
}, {
  value: 6,
  label: "周六"
}, {
  value: 7,
  label: "周日"
}];
var normalizeReminderTime = function normalizeReminderTime(value) {
  var fallback = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : DEFAULT_REMINDER_TIMES[0];
  var text = String(value || "").replace(/[：]/g, ":").trim();
  if (!text) return fallback;
  var isPm = /(下午|晚上|傍晚|中午|pm)/i.test(text);
  var isAm = /(上午|凌晨|早上|am)/i.test(text);
  var matched = text.match(/(\d{1,2})\s*:\s*(\d{1,2})/);
  if (!matched) return fallback;
  var hour = Number(matched[1]);
  var minute = Number(matched[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return fallback;
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return fallback;
  if (isPm && hour < 12) hour += 12;
  if (isAm && hour === 12) hour = 0;
  return "".concat(String(hour).padStart(2, "0"), ":").concat(String(minute).padStart(2, "0"));
};
var normalizeReminderTime24 = function normalizeReminderTime24(value) {
  var fallback = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : DEFAULT_REMINDER_TIMES[0];
  var text = String(value || "").replace(/\uFF1A/g, ":").trim();
  if (!text) return fallback;
  var isPm = /(\u4e0b\u5348|\u4e2d\u5348|pm)/i.test(text);
  var isAm = /(\u4e0a\u5348|am)/i.test(text);
  var matched = text.match(/(\d{1,2})\s*:\s*(\d{1,2})/);
  if (!matched) return fallback;
  var hour = Number(matched[1]);
  var minute = Number(matched[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return fallback;
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return fallback;
  if (isPm && hour < 12) hour += 12;
  if (isAm && hour === 12) hour = 0;
  return "".concat(String(hour).padStart(2, "0"), ":").concat(String(minute).padStart(2, "0"));
};
var createDraft = function createDraft() {
  var overrides = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var draft = _objectSpread2({
    time: DEFAULT_REMINDER_TIMES[0],
    repeat: "daily",
    dates: [],
    repeatMenuOpen: false,
    dateViewOpen: false,
    dateEditMode: false,
    calendarYear: 0,
    calendarMonth: 0,
    calendarDays: []
  }, overrides);
  draft.time = normalizeReminderTime24(draft.time);
  return draft;
};
var createDefaultReminders = function createDefaultReminders(formatRepeatLabel) {
  var base = Date.now();
  return DEFAULT_REMINDER_TIMES.map(function(time, index) {
    return {
      id: base + index,
      time: normalizeReminderTime24(time),
      repeat: "daily",
      dates: [],
      repeatLabel: formatRepeatLabel("daily")
    };
  });
};
Page({
  data: {
    reminders: [],
    newDraftOpen: false,
    newDraft: createDraft(),
    editDraftOpen: false,
    editDraft: null,
    editDraftId: '',
    todayProgress: {
      amount: 0,
      goal: 2000,
      percent: 0,
      statusText: "未记录",
      statusTone: "muted"
    },
    nextReminder: null,
    reminderStatus: {}
  },
  onShow: function onShow() {
    this._syncCustomTabBar();
    this._loadReminders();
    this._loadTodayProgress();
    this._startReminderTicker();
    this._triggerPageEnter(1);
  },
  _triggerPageEnter: function _triggerPageEnter(idx) {
    try {
      var app = getApp();
      var g = app && app.globalData;
      if (!g) return;
      var prev = g.__lastTabIndex;
      g.__lastTabIndex = idx;
      if (typeof prev !== "number" || prev === idx) return;
      this._animFlip = !this._animFlip;
      this.setData({
        pageAnim: "fx-on" + (this._animFlip ? "2" : "")
      });
    } catch (e) {}
  },
  playExitAnim: function playExitAnim(cb) {
    try {
      var self = this;
      this.setData({
        pageAnim: "fx-out"
      });
      setTimeout(function() {
        if (typeof cb === "function") cb();
      }, 300);
    } catch (e) {
      if (typeof cb === "function") cb();
    }
  },
  onHide: function onHide() {
    this._stopReminderTicker();
  },
  onUnload: function onUnload() {
    this._stopReminderTicker();
  },
  _syncCustomTabBar: function _syncCustomTabBar() {
    if (typeof this.getTabBar !== "function") return;
    var tabBar = this.getTabBar();
    if (tabBar && typeof tabBar.setData === "function") {
      tabBar.setData({
        selected: 1
      });
    }
  },
  startNewReminder: function startNewReminder() {
    var _this = this;
    var now = new Date();
    if (this.data.newDraftOpen) {
      this.setData({
        newDraftOpen: false,
        newDraft: createDraft()
      });
      return;
    }
    this.setData({
      newDraftOpen: true,
      newDraft: createDraft()
    }, function() {
      _this._setDraftCalendar("new", now.getFullYear(), now.getMonth() + 1);
    });
  },
  cancelNewReminder: function cancelNewReminder(e) {
    var scope = this._normalizeScope(e);
    if (scope === "new") {
      this.setData({
        newDraftOpen: false,
        newDraft: createDraft()
      });
      return;
    }
    if (scope === this.data.editDraftId) {
      this.setData({
        editDraftOpen: false,
        editDraft: null,
        editDraftId: ''
      });
    }
  },
  onNewTimeChange: function onNewTimeChange(e) {
    var scope = this._normalizeScope(e);
    this._updateDraft(scope, {
      time: normalizeReminderTime24(e.detail.value)
    });
  },
  toggleRepeatMenu: function toggleRepeatMenu(e) {
    var scope = this._normalizeScope(e);
    var draft = this._getDraft(scope);
    if (!draft) return;
    this._updateDraft(scope, {
      repeatMenuOpen: !draft.repeatMenuOpen
    });
  },
  selectRepeat: function selectRepeat(e) {
    var _this2 = this;
    var next = e.currentTarget.dataset.value;
    if (!next) return;
    var scope = this._normalizeScope(e);
    var draft = this._getDraft(scope);
    if (!draft) return;
    var patch = {
      repeat: next,
      repeatMenuOpen: false
    };
    if (next !== "custom") {
      patch.dateViewOpen = false;
      patch.dateEditMode = false;
    } else {
      patch.dateEditMode = true;
      patch.dateViewOpen = false;
    }
    this._updateDraft(scope, patch, function() {
      if (next === "custom") {
        var now = new Date();
        var year = draft.calendarYear || now.getFullYear();
        var month = draft.calendarMonth || now.getMonth() + 1;
        _this2._setDraftCalendar(scope, year, month);
      }
    });
  },
  toggleDateView: function toggleDateView(e) {
    var _this3 = this;
    var scope = this._normalizeScope(e);
    var draft = this._getDraft(scope);
    if (!draft) return;
    var nextOpen = !draft.dateViewOpen;
    if (scope !== "new") {
      this._updateDraft(scope, {
        dateViewOpen: nextOpen,
        dateEditMode: false
      }, function() {
        if (nextOpen) {
          var now = new Date();
          var year = draft.calendarYear || now.getFullYear();
          var month = draft.calendarMonth || now.getMonth() + 1;
          _this3._setDraftCalendar(scope, year, month);
        }
      });
      return;
    }
    if (!nextOpen) {
      this._updateDraft(scope, {
        dateViewOpen: false,
        dateEditMode: false
      });
      return;
    }
    this._updateDraft(scope, {
      dateViewOpen: true,
      dateEditMode: true
    }, function() {
      var now = new Date();
      var year = draft.calendarYear || now.getFullYear();
      var month = draft.calendarMonth || now.getMonth() + 1;
      _this3._setDraftCalendar(scope, year, month);
    });
  },
  startDateEdit: function startDateEdit(e) {
    var _this4 = this;
    var scope = this._normalizeScope(e);
    var draft = this._getDraft(scope);
    if (!draft) return;
    var now = new Date();
    var year = draft.calendarYear || now.getFullYear();
    var month = draft.calendarMonth || now.getMonth() + 1;
    this._updateDraft(scope, {
      dateEditMode: true
    }, function() {
      _this4._setDraftCalendar(scope, year, month);
    });
  },
  confirmDateEdit: function confirmDateEdit(e) {
    var scope = this._normalizeScope(e);
    var draft = this._getDraft(scope);
    if (!draft) return;
    if (!draft.dates.length) {
      wx.showToast({
        title: "请选择提醒日期",
        icon: "none"
      });
      return;
    }
    if (scope === "new") {
      this._updateDraft(scope, {
        dateEditMode: false,
        dateViewOpen: false
      });
      return;
    }
    this._updateDraft(scope, {
      dateEditMode: false
    });
  },
  toggleDate: function toggleDate(e) {
    var _this5 = this;
    var date = e.currentTarget.dataset.date;
    if (!date) return;
    var scope = this._normalizeScope(e);
    var draft = this._getDraft(scope);
    if (!draft) return;
    if (!draft.dateEditMode) return;
    var next = draft.dates.slice();
    var idx = next.indexOf(date);
    if (idx === -1) next.push(date);
    else next.splice(idx, 1);
    next.sort();
    this._updateDraft(scope, {
      dates: next
    }, function() {
      var now = new Date();
      var year = draft.calendarYear || now.getFullYear();
      var month = draft.calendarMonth || now.getMonth() + 1;
      _this5._setDraftCalendar(scope, year, month);
    });
  },
  prevMonth: function prevMonth(e) {
    var scope = this._normalizeScope(e);
    var draft = this._getDraft(scope);
    if (!draft) return;
    var year = draft.calendarYear;
    var month = draft.calendarMonth;
    if (!year || !month) {
      var now = new Date();
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    this._setDraftCalendar(scope, year, month);
  },
  nextMonth: function nextMonth(e) {
    var scope = this._normalizeScope(e);
    var draft = this._getDraft(scope);
    if (!draft) return;
    var year = draft.calendarYear;
    var month = draft.calendarMonth;
    if (!year || !month) {
      var now = new Date();
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    this._setDraftCalendar(scope, year, month);
  },
  saveReminder: function saveReminder(e) {
    var scope = this._normalizeScope(e);
    var draft = this._getDraft(scope);
    if (!draft) return;
    var repeat = draft.repeat,
      dates = draft.dates;
    var time = normalizeReminderTime24(draft.time);
    if (!time) {
      wx.showToast({
        title: "请选择时间",
        icon: "none"
      });
      return;
    }
    if (repeat === "custom" && !dates.length) {
      wx.showToast({
        title: "请选择提醒日期",
        icon: "none"
      });
      return;
    }
    var today = this._getTodayStr();
    var datesToSave = repeat === "today" ? [today] : repeat === "custom" ? dates.slice() : [];
    var item = {
      id: scope === "new" ? Date.now() : Number(scope),
      time: time,
      repeat: repeat,
      dates: datesToSave,
      repeatLabel: this._formatRepeatLabel(repeat, datesToSave)
    };
    var next = scope === "new" ? this.data.reminders.concat(item) : this.data.reminders.map(function(r) {
      return r.id === Number(scope) ? item : r;
    });
    this._saveReminders(next);
    if (scope === "new") {
      this.setData({
        newDraftOpen: false,
        newDraft: createDraft()
      });
      return;
    }
    if (scope === this.data.editDraftId) {
      this.setData({
        editDraftOpen: false,
        editDraft: null,
        editDraftId: ''
      });
      return;
    }
  },
  editReminder: function editReminder(e) {
    var _this6 = this;
    var id = Number(e.currentTarget.dataset.id);
    if (!id) return;
    var key = String(id);
    var item = this.data.reminders.find(function(r) {
      return r.id === id;
    });
    if (!item) return;
    var now = new Date();
    var year = now.getFullYear();
    var month = now.getMonth() + 1;
    var dates = Array.isArray(item.dates) ? item.dates.slice() : [];
    if (dates.length) {
      var parts = dates[0].split("-").map(function(n) {
        return Number(n);
      });
      if (parts.length === 3 && parts[0] && parts[1]) {
        year = parts[0];
        month = parts[1];
      }
    }
    var draft = createDraft({
      time: item.time || "10:00",
      repeat: item.repeat || "daily",
      dates: dates
    });
    this.setData({
      editDraftOpen: true,
      editDraft: draft,
      editDraftId: key
    }, function() {
      _this6._setDraftCalendar(key, year, month);
    });
  },
  cancelEditReminder: function cancelEditReminder() {
    this.setData({
      editDraftOpen: false,
      editDraft: null,
      editDraftId: ''
    });
  },
  deleteReminder: function deleteReminder(e) {
    var id = Number(e.currentTarget.dataset.id);
    if (!id) return;
    var next = this.data.reminders.filter(function(item) {
      return item.id !== id;
    });
    this._saveReminders(next);
    if (String(id) === this.data.editDraftId) {
      this.setData({
        editDraftOpen: false,
        editDraft: null,
        editDraftId: ''
      });
    }
  },
  _normalizeScope: function _normalizeScope(e) {
    var scope = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.scope : "new";
    if (scope === undefined || scope === null || scope === "") return "new";
    return String(scope);
  },
  _getDraft: function _getDraft(scope) {
    if (scope === "new") return this.data.newDraft;
    if (scope === this.data.editDraftId) return this.data.editDraft;
    return null;
  },
  _updateDraft: function _updateDraft(scope, patch, cb) {
    if (scope === "new") {
      var next = _objectSpread2(_objectSpread2({}, this.data.newDraft), patch);
      this.setData({
        newDraft: next
      }, cb);
      return;
    }
    if (scope === this.data.editDraftId) {
      var _next = _objectSpread2(_objectSpread2({}, this.data.editDraft), patch);
      this.setData({
        editDraft: _next
      }, cb);
      return;
    }
  },
  _setDraftCalendar: function _setDraftCalendar(scope, year, month) {
    var draft = this._getDraft(scope);
    if (!draft) return;
    var days = this._buildCalendar(year, month, draft.dates || []);
    this._updateDraft(scope, {
      calendarYear: year,
      calendarMonth: month,
      calendarDays: days
    });
  },
  _startReminderTicker: function _startReminderTicker() {
    var _this7 = this;
    // 触发逻辑交由 app.js 全局调度（planReminderCore），保证离开本页也能按时提醒
    planReminderCore.startMonitoring();
    if (this._displayTimer) return;
    this._displayTimer = setInterval(function() {
      return _this7._checkReminders();
    }, 30 * 1000);
    this._checkReminders();
  },
  _stopReminderTicker: function _stopReminderTicker() {
    if (this._displayTimer) {
      clearInterval(this._displayTimer);
      this._displayTimer = null;
    }
    // 全局提醒调度由 app.js 持续驱动，本页隐藏时仅停止本地显示刷新
  },
  _checkReminders: function _checkReminders() {
    var list = this.data.reminders || [];
    var now = new Date();
    if (!list.length) {
      if (this.data.nextReminder) this.setData({
        nextReminder: null
      });
      if (Object.keys(this.data.reminderStatus || {}).length) this.setData({
    reminderStatus: {},
    pageAnim: ""
      });
      return;
    }
    var timeStr = "".concat(String(now.getHours()).padStart(2, "0"), ":").concat(String(now.getMinutes()).padStart(2, "0"));
    var todayStr = this._getTodayStr(now);
    var statusChanged = false;
    var status = {};
    var oldStatus = this.data.reminderStatus || {};
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item) continue;
      var key = String(item.id);
      var isPast = item.time < timeStr && this._matchesReminderDate(item, now, todayStr);
      var newStatus = isPast ? "done" : "upcoming";
      status[key] = newStatus;
      if (oldStatus[key] !== newStatus) statusChanged = true;
    }
    if (!statusChanged && Object.keys(oldStatus).length !== Object.keys(status).length) {
      statusChanged = true;
    }
    if (statusChanged) {
      this.setData({
        reminderStatus: status
      });
    }
    this._updateNextReminder(list, now);
  },
  _updateNextReminder: function _updateNextReminder(list, now) {
    var _this8 = this;
    if (!Array.isArray(list) || !list.length) {
      if (this.data.nextReminder) this.setData({
        nextReminder: null
      });
      return;
    }
    var todayStr = this._getTodayStr(now);
    var currentTime = "".concat(String(now.getHours()).padStart(2, "0"), ":").concat(String(now.getMinutes()).padStart(2, "0"));
    var upcoming = list.filter(function(item) {
      return item && _this8._matchesReminderDate(item, now, todayStr) && item.time > currentTime;
    }).sort(function(a, b) {
      return a.time.localeCompare(b.time);
    });
    var next = upcoming.length ? upcoming[0] : null;
    var current = this.data.nextReminder;
    var changed = next && (!current || current.id !== next.id || current.time !== next.time) || !next && current;
    if (changed) {
      this.setData({
        nextReminder: next ? {
          id: next.id,
          time: next.time,
          repeatLabel: next.repeatLabel
        } : null
      });
    }
  },
  _loadTodayProgress: function _loadTodayProgress() {
    var _this9 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee() {
      var store, todayKey, records, amount, goal, percent, statusText, statusTone;
      return _regeneratorRuntime2().wrap(function _callee$(_context) {
        while (1) switch (_context.prev = _context.next) {
          case 0:
            _context.prev = 0;
            _context.next = 3;
            return drinkData.getStore({
              historyDays: 1
            });
          case 3:
            store = _context.sent;
            todayKey = _this9._getTodayStr();
            records = store && store.recordsByDate && store.recordsByDate[todayKey] || [];
            amount = records.reduce(function(sum, r) {
              return sum + (Number(r && r.amount) || 0);
            }, 0);
            goal = store && store.dailyGoalMl || 2000;
            percent = goal > 0 ? Math.min(100, Math.round(amount / goal * 100)) : 0;
            statusText = "未记录";
            statusTone = "muted";
            if (amount > 0) {
              if (percent >= 100) {
                statusText = "已达成目标";
                statusTone = "success";
              } else if (percent >= 70) {
                statusText = "接近目标";
                statusTone = "warning";
              } else {
                statusText = "继续努力";
                statusTone = "info";
              }
            }
            _this9.setData({
              todayProgress: {
                amount: amount,
                goal: goal,
                percent: percent,
                statusText: statusText,
                statusTone: statusTone
              }
            });
            _context.next = 18;
            break;
          case 15:
            _context.prev = 15;
            _context.t0 = _context["catch"](0);
            console.warn("[plan] load today progress failed", _context.t0);
          case 18:
          case "end":
            return _context.stop();
        }
      }, _callee, null, [
        [0, 15]
      ]);
    }))();
  },
  _matchesReminderDate: function _matchesReminderDate(item, now, todayStr) {
    if (item.repeat === "daily") return true;
    if (item.repeat === "today") {
      var dates = Array.isArray(item.dates) ? item.dates : [];
      if (dates.length) return dates.includes(todayStr);
      return true;
    }
    if (item.repeat === "custom") {
      var _dates = Array.isArray(item.dates) ? item.dates : [];
      if (_dates.length) return _dates.includes(todayStr);
      var days = Array.isArray(item.days) ? item.days : [];
      if (!days.length) return false;
      var week = now.getDay();
      var map = week === 0 ? 7 : week;
      return days.includes(map);
    }
    return false;
  },
  _fireReminder: function _fireReminder() {
    try {
      wx.vibrateShort({
        type: "medium"
      });
    } catch (e) {}
    wx.showToast({
      title: "喝水提醒",
      icon: "none",
      duration: 2000
    });
    this._triggerCupReminderBlink();
  },
  _getConnectedCupDeviceId: function _getConnectedCupDeviceId() {
    return new Promise(function(resolve) {
      if (!wx.getConnectedBluetoothDevices || !ble.SERVICE_UUID) return resolve("");
      var lastId = String(wx.getStorageSync("smartcup_last_device_id") || "");
      wx.getConnectedBluetoothDevices({
        services: [ble.SERVICE_UUID],
        success: function success(res) {
          var list = Array.isArray(res && res.devices) ? res.devices : [];
          if (!list.length) return resolve("");
          if (lastId) {
            var matched = list.find(function(d) {
              return d && d.deviceId === lastId;
            });
            if (matched && matched.deviceId) return resolve(String(matched.deviceId));
          }
          var first = list.find(function(d) {
            return d && d.deviceId;
          });
          resolve(first && first.deviceId ? String(first.deviceId) : "");
        },
        fail: function fail() {
          return resolve("");
        }
      });
    });
  },
  _triggerCupReminderBlink: function _triggerCupReminderBlink() {
    var _this10 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee2() {
      var deviceId;
      return _regeneratorRuntime2().wrap(function _callee2$(_context2) {
        while (1) switch (_context2.prev = _context2.next) {
          case 0:
            _context2.next = 2;
            return _this10._getConnectedCupDeviceId();
          case 2:
            deviceId = _context2.sent;
            if (deviceId) {
              _context2.next = 5;
              break;
            }
            return _context2.abrupt("return");
          case 5:
            _context2.prev = 5;
            _context2.next = 8;
            return ble.triggerReminderBlink(deviceId, 10);
          case 8:
            _context2.next = 13;
            break;
          case 10:
            _context2.prev = 10;
            _context2.t0 = _context2["catch"](5);
            console.warn("trigger cup reminder blink failed", _context2.t0);
          case 13:
          case "end":
            return _context2.stop();
        }
      }, _callee2, null, [
        [5, 10]
      ]);
    }))();
  },
  _getTodayStr: function _getTodayStr() {
    var date = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : new Date();
    return this._formatDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
  },
  _formatRepeatLabel: function _formatRepeatLabel(repeat) {
    var dates = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
    var days = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : [];
    if (repeat === "daily") return "每天提醒";
    if (repeat === "today") return "仅今天";
    if (Array.isArray(dates) && dates.length && typeof dates[0] === "string") {
      return "\u81EA\u5B9A\u4E49 ".concat(dates.length, "\u5929");
    }
    var names = WEEKDAYS.filter(function(d) {
      return days.includes(d.value);
    }).map(function(d) {
      return d.label;
    }).join(" ");
    return names ? "\u81EA\u5B9A\u4E49 ".concat(names) : "自定义";
  },
  _loadReminders: function _loadReminders() {
    var _this11 = this;
    var hasStoredReminders = this._hasStorageKey(REMINDER_KEY);
    var list = hasStoredReminders ? wx.getStorageSync(REMINDER_KEY) : [];
    var needSave = false;
    if (!hasStoredReminders) {
      list = createDefaultReminders(function(repeat) {
        return _this11._formatRepeatLabel(repeat);
      });
      needSave = true;
    }
    if (!Array.isArray(list)) list = [];
    if (this._isLegacyDefaultReminderList(list)) {
      needSave = true;
      list = list.map(function(item, index) {
        return _objectSpread2(_objectSpread2({}, item), {}, {
          time: DEFAULT_REMINDER_TIMES[index]
        });
      });
    }
    var normalized = list.map(function(item) {
      if (!item) return item;
      var dates = Array.isArray(item.dates) ? item.dates : [];
      var days = Array.isArray(item.days) ? item.days : [];
      var normalizedTime = normalizeReminderTime24(item.time);
      var repeatLabel = _this11._formatRepeatLabel(item.repeat, dates, days);
      // 检测是否有变化，决定是否需要写盘
      if (normalizedTime !== item.time || item.repeatLabel !== repeatLabel) {
        needSave = true;
      }
      return _objectSpread2(_objectSpread2({}, item), {}, {
        time: normalizedTime,
        repeatLabel: repeatLabel
      });
    });
    // 仅在内容变化或首次写入时落盘，避免每次 onShow 都无意义写 storage
    if (needSave) {
      wx.setStorageSync(REMINDER_KEY, normalized);
    }
    this.setData({
      reminders: normalized
    });
  },
  _isLegacyDefaultReminderList: function _isLegacyDefaultReminderList(list) {
    if (!Array.isArray(list) || list.length !== LEGACY_DEFAULT_REMINDER_TIMES.length) return false;
    return list.every(function(item, index) {
      if (!item || item.repeat && item.repeat !== "daily") return false;
      var dates = Array.isArray(item.dates) ? item.dates : [];
      var days = Array.isArray(item.days) ? item.days : [];
      if (dates.length || days.length) return false;
      return normalizeReminderTime24(item.time, "") === LEGACY_DEFAULT_REMINDER_TIMES[index];
    });
  },
  _hasStorageKey: function _hasStorageKey(key) {
    if (!key) return false;
    // 直接用 getStorageSync 判空即可，避免额外的 getStorageInfoSync 调用
    var value = wx.getStorageSync(key);
    return value !== "" && value !== undefined && value !== null;
  },
  _buildCalendar: function _buildCalendar(year, month) {
    var selected = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : [];
    var first = new Date(year, month - 1, 1);
    var start = first.getDay();
    var daysInMonth = new Date(year, month, 0).getDate();
    var daysInPrev = new Date(year, month - 1, 0).getDate();
    var cells = [];
    for (var i = 0; i < 42; i++) {
      var dayIndex = i - start + 1;
      var cellYear = year;
      var cellMonth = month;
      var day = dayIndex;
      var isCurrentMonth = true;
      if (dayIndex <= 0) {
        isCurrentMonth = false;
        cellMonth = month - 1;
        if (cellMonth < 1) {
          cellMonth = 12;
          cellYear = year - 1;
        }
        day = daysInPrev + dayIndex;
      } else if (dayIndex > daysInMonth) {
        isCurrentMonth = false;
        cellMonth = month + 1;
        if (cellMonth > 12) {
          cellMonth = 1;
          cellYear = year + 1;
        }
        day = dayIndex - daysInMonth;
      }
      var dateStr = this._formatDate(cellYear, cellMonth, day);
      cells.push({
        key: "".concat(cellYear, "-").concat(cellMonth, "-").concat(day),
        day: day,
        date: dateStr,
        isCurrentMonth: isCurrentMonth,
        selected: selected.includes(dateStr)
      });
    }
    return cells;
  },
  _formatDate: function _formatDate(year, month, day) {
    var mm = "".concat(month).padStart(2, "0");
    var dd = "".concat(day).padStart(2, "0");
    return "".concat(year, "-").concat(mm, "-").concat(dd);
  },
  _saveReminders: function _saveReminders(list) {
    var _this12 = this;
    var normalized = Array.isArray(list) ? list.map(function(item) {
      if (!item) return item;
      var dates = Array.isArray(item.dates) ? item.dates : [];
      var days = Array.isArray(item.days) ? item.days : [];
      return _objectSpread2(_objectSpread2({}, item), {}, {
        time: normalizeReminderTime24(item.time),
        repeatLabel: _this12._formatRepeatLabel(item.repeat, dates, days)
      });
    }) : [];
    wx.setStorageSync(REMINDER_KEY, normalized);
    this.setData({
      reminders: normalized
    });
    this._loadTodayProgress();
    this._checkReminders();
  }
});