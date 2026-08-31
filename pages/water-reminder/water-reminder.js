var _regeneratorRuntime2 = require("../../@babel/runtime/helpers/regeneratorRuntime");
var _asyncToGenerator2 = require("../../@babel/runtime/helpers/asyncToGenerator");
var waterReminder = require("../../utils/waterReminderCore");
var drinkData = require("../../utils/drinkData");
var REMINDER_RECORD_AMOUNT_ML = 200;
var INTERVAL_OPTIONS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function sinceLastWaterText(lastWaterTime) {
  if (!lastWaterTime) return "暂无饮水记录";
  var diffMinutes = Math.floor((Date.now() - lastWaterTime) / (1000 * 60));
  if (diffMinutes < 1) {
    var date = new Date(lastWaterTime);
    return "".concat(date.getHours().toString().padStart(2, "0"), ":").concat(date.getMinutes().toString().padStart(2, "0"));
  }
  if (diffMinutes < 60) return "".concat(diffMinutes, "分钟前");
  return "".concat(Math.floor(diffMinutes / 60), "小时").concat(diffMinutes % 60, "分钟前");
}

// 间隔水钟状态：elapsedPercent = 已流逝时长 / 提醒间隔（封顶100%）
function timerStatus(settings) {
  var intervalH = (settings && settings.interval) || 3;
  var enabled = !!(settings && settings.enabled);
  var lastWaterTime = waterReminder.getLastWaterTime();
  var out = {
    lastWaterTime: lastWaterTime,
    timeSinceLastWater: sinceLastWaterText(lastWaterTime),
    elapsedPercent: 0,
    statusTone: "empty",
    statusBadgeText: "喝一杯，开始计时",
    stateWord: "未开始",
    stateTone: "empty"
  };
  if (!lastWaterTime) return out;
  var diffMinutes = Math.floor((Date.now() - lastWaterTime) / (1000 * 60));
  if (diffMinutes < 0) return out;
  out.elapsedPercent = Math.min(100, Math.round((diffMinutes / (intervalH * 60)) * 100));
  if (diffMinutes >= intervalH * 60) {
    out.statusTone = "alert";
    out.stateWord = enabled ? "已超时" : "未启用";
    out.stateTone = enabled ? "alert" : "off";
    out.statusBadgeText = "已超过 " + intervalH + " 小时未喝水，记得补水" + (enabled ? "" : "（提醒未开启）");
  } else {
    out.statusTone = "ok";
    out.stateWord = enabled ? "监测中" : "未启用";
    out.stateTone = enabled ? "ok" : "off";
    if (!enabled) {
      out.statusBadgeText = "提醒未开启，当前仅记录饮水间隔";
    } else {
      var remainMin = Math.max(1, intervalH * 60 - diffMinutes);
      out.statusBadgeText = remainMin >= 60 ? "距下次提醒约 " + Math.floor(remainMin / 60) + " 小时 " + (remainMin % 60) + " 分钟" : "距下次提醒约 " + remainMin + " 分钟";
    }
  }
  return out;
}
// 订阅消息模板 ID 列表（在微信公众平台「订阅消息」中申请）。
// 配置后开启提醒时会向用户申请一次性订阅，从而实现切到后台后的提醒；
// 留空则跳过申请，提醒仍通过应用内弹窗在前台生效。
var SUBSCRIBE_TMPL_IDS = [];
Page({
  data: {
    enabled: false,
    interval: 3,
    // 默认3小时
    reminderMethod: "notification",
    // 默认通知
    lastWaterTime: null,
    timeSinceLastWater: "",
    elapsedPercent: 0,
    statusTone: "empty",
    statusBadgeText: "",
    stateWord: "未开始",
    stateTone: "empty"
  },
  onShow: function onShow() {
    this._alive = true;
    var settings = waterReminder.getSettings();
    var status = timerStatus(settings);
    this.setData({
      enabled: settings.enabled || false,
      interval: settings.interval || 3,
      reminderMethod: settings.reminderMethod || "notification",
      timeSinceLastWater: status.timeSinceLastWater,
      elapsedPercent: status.elapsedPercent,
      statusTone: status.statusTone,
      statusBadgeText: status.statusBadgeText,
      stateWord: status.stateWord,
      stateTone: status.stateTone
    });
  },
  onHide: function onHide() {
    this._alive = false;
  },
  onUnload: function onUnload() {
    this._alive = false;
  },
  onPullDownRefresh: function onPullDownRefresh() {
    this._alive = true;
    this.onShow();
    wx.stopPullDownRefresh();
  },
  _updateLastWaterTime: function _updateLastWaterTime() {
    this.setData(timerStatus(waterReminder.getSettings()));
  },
  onToggleEnabled: function onToggleEnabled(e) {
    var enabled = e.detail.value;
    if (enabled) {
      // 检查通知权限
      this._checkNotificationPermission();
    }
    this.setData({
      enabled: enabled
    });
    this._saveSettings();
  },
  _checkNotificationPermission: function _checkNotificationPermission() {
    // 小程序后台提醒依赖「订阅消息」模板；开启提醒时申请一次性订阅。
    // 未配置模板 ID（SUBSCRIBE_TMPL_IDS 为空）时跳过，前台提醒仍通过应用内弹窗生效。
    var tmplIds = SUBSCRIBE_TMPL_IDS;
    if (!tmplIds.length || !wx.requestSubscribeMessage) return;
    wx.requestSubscribeMessage({
      tmplIds: tmplIds,
      success: function success() {},
      fail: function fail() {}
    });
  },
  onIntervalChange: function onIntervalChange(e) {
    var index = Number(e.detail.value);
    var intervals = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    var interval = intervals[index];
    this.setData({
      interval: interval
    });
    this._saveSettings();
  },
  onMethodChange: function onMethodChange(e) {
    var method = e.detail.value;
    this.setData({
      reminderMethod: method
    });
    this._saveSettings();
  },
  _saveSettings: function _saveSettings() {
    var _this$data = this.data,
      enabled = _this$data.enabled,
      interval = _this$data.interval,
      reminderMethod = _this$data.reminderMethod;
    wx.setStorageSync("smartcup_water_reminder_v1", {
      enabled: enabled,
      interval: interval,
      reminderMethod: reminderMethod,
      updatedAt: Date.now()
    });

    // 根据启用状态启动或停止监控
    if (enabled) {
      waterReminder.startMonitoring();
    } else {
      waterReminder.stopMonitoring();
    }
  },
  _legacyLocalMarkAsDrunk: function _legacyLocalMarkAsDrunk() {
    var now = Date.now();
    waterReminder.setLastWaterTime(now);
    this._updateLastWaterTime();
    wx.showToast({
      title: "已记录饮水",
      icon: "success"
    });
  },
  onMarkAsDrunk: function onMarkAsDrunk() {
    var _this = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee() {
      var now;
      return _regeneratorRuntime2().wrap(function _callee$(_context) {
        while (1) switch (_context.prev = _context.next) {
          case 0:
            now = Date.now();
            _context.prev = 1;
            _context.next = 4;
            return drinkData.addRecord(REMINDER_RECORD_AMOUNT_ML, {
              ts: now,
              source: "reminder"
            });
          case 4:
            waterReminder.setLastWaterTime(now);
            _this._updateLastWaterTime();
            wx.showToast({
              title: "\u5DF2\u8BB0\u5F55 ".concat(REMINDER_RECORD_AMOUNT_ML, "ml"),
              icon: "success"
            });
            _context.next = 13;
            break;
          case 9:
            _context.prev = 9;
            _context.t0 = _context["catch"](1);
            console.error("[reminder drink record failed]", _context.t0);
            wx.showToast({
              title: "饮水记录保存失败",
              icon: "none"
            });
          case 13:
          case "end":
            return _context.stop();
        }
      }, _callee, null, [
        [1, 9]
      ]);
    }))();
  },
  onBack: function onBack() {
    wx.navigateBack();
  }
});