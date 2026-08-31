var REMINDER_KEY = "smartcup_reminders_v1";
var LAST_DEVICE_ID_KEY = "smartcup_last_device_id";
var ble = require("./ble.js");
var timer = null;
var isMonitoring = false;
// 会话内去重：同一提醒（id+日期+时间）每天只触发一次
var firedKeys = {};

function getReminders() {
  var list = wx.getStorageSync(REMINDER_KEY);
  return Array.isArray(list) ? list : [];
}

function getTodayStr(now) {
  var y = now.getFullYear();
  var m = String(now.getMonth() + 1).padStart(2, "0");
  var d = String(now.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

function matchesDate(item, now, todayStr) {
  if (item.repeat === "daily") return true;
  if (item.repeat === "today") {
    var dates = Array.isArray(item.dates) ? item.dates : [];
    return dates.length ? dates.indexOf(todayStr) !== -1 : true;
  }
  if (item.repeat === "custom") {
    var cd = Array.isArray(item.dates) ? item.dates : [];
    if (cd.length) return cd.indexOf(todayStr) !== -1;
    var days = Array.isArray(item.days) ? item.days : [];
    if (!days.length) return false;
    var w = now.getDay();
    var map = w === 0 ? 7 : w;
    return days.indexOf(map) !== -1;
  }
  return false;
}

function getConnectedCupDeviceId() {
  return new Promise(function(resolve) {
    if (!wx.getConnectedBluetoothDevices || !ble.SERVICE_UUID) return resolve("");
    var lastId = String(wx.getStorageSync(LAST_DEVICE_ID_KEY) || "");
    wx.getConnectedBluetoothDevices({
      services: [ble.SERVICE_UUID],
      success: function(res) {
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
      fail: function() {
        return resolve("");
      }
    });
  });
}

function triggerCupBlink() {
  getConnectedCupDeviceId().then(function(deviceId) {
    if (deviceId) {
      ble.triggerReminderBlink(deviceId, 10).catch(function() {});
    }
  }).catch(function() {});
}

function fireReminder() {
  try {
    wx.vibrateShort({ type: "medium" });
  } catch (e) {}
  wx.showToast({
    title: "喝水提醒",
    icon: "none",
    duration: 2000
  });
  triggerCupBlink();
}

function checkReminders() {
  var list = getReminders();
  if (!list.length) return;
  var now = new Date();
  var timeStr = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  var todayStr = getTodayStr(now);
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    if (!item) continue;
    if (item.time === timeStr && matchesDate(item, now, todayStr)) {
      var key = String(item.id) + "-" + todayStr + "-" + timeStr;
      if (!firedKeys[key]) {
        firedKeys[key] = true;
        fireReminder();
      }
    }
  }
}

function startMonitoring() {
  if (isMonitoring) return;
  isMonitoring = true;
  checkReminders();
  timer = setInterval(checkReminders, 30 * 1000);
}

function stopMonitoring() {
  if (!isMonitoring) return;
  isMonitoring = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function initPlanReminders() {
  startMonitoring();
}

module.exports = {
  getReminders: getReminders,
  checkReminders: checkReminders,
  startMonitoring: startMonitoring,
  stopMonitoring: stopMonitoring,
  initPlanReminders: initPlanReminders
};
