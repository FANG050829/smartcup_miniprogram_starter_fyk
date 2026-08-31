var WATER_REMINDER_KEY = "smartcup_water_reminder_v1";
var LAST_WATER_TIME_KEY = "smartcup_last_water_time_v1";
var drinkData = require("./drinkData.js");
var REMINDER_RECORD_AMOUNT_ML = 200;
var timer = null;
var isMonitoring = false;

function getSettings() {
  return wx.getStorageSync(WATER_REMINDER_KEY) || {
    enabled: false,
    interval: 3,
    reminderMethod: "notification"
  };
}

function getLastWaterTime() {
  return wx.getStorageSync(LAST_WATER_TIME_KEY);
}

function setLastWaterTime(timestamp) {
  wx.setStorageSync(LAST_WATER_TIME_KEY, timestamp);
}

function shouldRemind() {
  var settings = getSettings();
  if (!settings.enabled) return false;
  var lastWaterTime = getLastWaterTime();
  if (!lastWaterTime) return false;
  var now = Date.now();
  var intervalMs = settings.interval * 60 * 60 * 1000; // 改为小时
  return now - lastWaterTime >= intervalMs;
}

function triggerReminder() {
  var settings = getSettings();
  if (!settings.enabled) return;

  // 根据选择的提醒方式触发相应的提醒
  switch (settings.reminderMethod) {
    case "notification":
      // 触发通知
      wx.showModal({
        title: "久未喝水提醒",
        content: "已经有一段时间没有喝水了，记得补充水分。",
        confirmText: "已喝水",
        cancelText: "稍后提醒",
        success: function success(res) {
          if (res.confirm) {
            // 用户确认已喝水，更新最后饮水时间
            var now = Date.now();
            setLastWaterTime(now);
            drinkData.addRecord(REMINDER_RECORD_AMOUNT_ML, {
              ts: now,
              source: "reminder"
            }).catch(function(error) {
              console.error("[reminder drink record failed]", error);
            });
            wx.showToast({
              title: "已记录饮水",
              icon: "success"
            });
          }
        }
      });
      break;
    case "sound":
      // 触发声音
      wx.showToast({
        title: '喝水提醒',
        icon: 'none',
        duration: 2000
      });
      break;
    case "vibration":
      // 触发震动
      if (wx.vibrateLong) {
        wx.vibrateLong({});
      }
      break;
  }
}

function startMonitoring() {
  if (isMonitoring) return;
  isMonitoring = true;
  checkReminder();

  // 每1分钟检查一次
  timer = setInterval(checkReminder, 60 * 1000);
}

function stopMonitoring() {
  if (!isMonitoring) return;
  isMonitoring = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function checkReminder() {
  if (shouldRemind()) {
    triggerReminder();
  }
}

function initWaterReminder() {
  var settings = getSettings();
  if (settings.enabled) {
    startMonitoring();
  }
}
module.exports = {
  getSettings: getSettings,
  getLastWaterTime: getLastWaterTime,
  setLastWaterTime: setLastWaterTime,
  shouldRemind: shouldRemind,
  triggerReminder: triggerReminder,
  startMonitoring: startMonitoring,
  stopMonitoring: stopMonitoring,
  checkReminder: checkReminder,
  initWaterReminder: initWaterReminder
};