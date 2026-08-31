require("../../@babel/runtime/helpers/Objectvalues");
var _regeneratorRuntime2 = require("../../@babel/runtime/helpers/regeneratorRuntime");
var _asyncToGenerator2 = require("../../@babel/runtime/helpers/asyncToGenerator");
var ble = require("../../utils/ble");
var drinkData = require("../../utils/drinkData");
var LAST_DEVICE_KEY = "smartcup_last_device";
var LAST_DEVICE_ID_KEY = "smartcup_last_device_id";
var LAST_DEVICE_NAME_KEY = "smartcup_last_device_name";
var LAST_TDS_KEY = "smartcup_last_tds_ppm";
var REMINDER_KEY = "smartcup_reminders_v1";
var QUIET_HOURS_KEY = "smartcup_plan_quiet_hours_v1";
var BOUND_DEVICES_KEY = "smartcup_bound_devices";
var CUP_TOKEN_KEY = "cup_token";
Page({
  data: {
    lastDeviceName: "未连接过设备",
    lastDeviceId: "",
    reminderCount: 0,
    quietHoursText: "未开启",
    bindCodeInput: "",
    bindingBusy: false,
    boundDevices: [],
    connected: false,
    cupToken: "",
    nickname: "",
    todayDate: "",
    todayDrink: 0,
    targetDrink: 2000,
    drinkProgress: 0,
    cupCount: 0,
    streakDays: 0,
    avgDrink: 0,
    pageAnim: ""
  },
  onShow: function onShow() {
    this._alive = true;
    this._syncCustomTabBar();
    this._loadProfileData();
    this._loadBindingData();
    this._triggerPageEnter(3);
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
    this._alive = false;
  },
  onUnload: function onUnload() {
    this._alive = false;
  },
  onPullDownRefresh: function onPullDownRefresh() {
    this._alive = true;
    this._loadProfileData();
    this._loadBindingData();
    setTimeout(function() {
      return wx.stopPullDownRefresh && wx.stopPullDownRefresh();
    }, 100);
  },
  _syncCustomTabBar: function _syncCustomTabBar() {
    if (typeof this.getTabBar !== "function") return;
    var tabBar = this.getTabBar();
    if (tabBar && typeof tabBar.setData === "function") {
      tabBar.setData({
        selected: 3
      });
    }
  },
  _loadProfileData: function _loadProfileData() {
    // 一次性批量读取 storage，减少同步 IO 次数
    var last = wx.getStorageSync(LAST_DEVICE_KEY) || {};
    var lastDeviceNameKey = wx.getStorageSync(LAST_DEVICE_NAME_KEY);
    var lastDeviceIdKey = wx.getStorageSync(LAST_DEVICE_ID_KEY);
    var reminders = wx.getStorageSync(REMINDER_KEY);
    var quiet = wx.getStorageSync(QUIET_HOURS_KEY) || {};
    var lastDeviceName = String(last.name || lastDeviceNameKey || "").trim() || "未连接过设备";
    var lastDeviceId = String(last.id || lastDeviceIdKey || "").trim();
    var reminderCount = Array.isArray(reminders) ? reminders.length : 0;
    var quietHoursText = quiet && quiet.enabled ? "".concat(quiet.start || "23:00", " - ").concat(quiet.end || "07:00") : "未开启";

    // 单次 setData 合并所有 profile 字段
    this.setData({
      lastDeviceName: lastDeviceName,
      lastDeviceId: lastDeviceId,
      reminderCount: reminderCount,
      quietHoursText: quietHoursText
    });
    this._loadDrinkData();
  },
  _loadDrinkData: function _loadDrinkData() {
    var _this = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee() {
      var today, month, day, todayStr, displayDate, todayAmount, target, streak, avg, cupCount, store, recordsByDate, todayList, checkDate, i, key, list, amount, allAmounts, progress;
      return _regeneratorRuntime2().wrap(function _callee$(_context) {
        while (1) switch (_context.prev = _context.next) {
          case 0:
            today = new Date();
            month = String(today.getMonth() + 1).padStart(2, "0");
            day = String(today.getDate()).padStart(2, "0");
            todayStr = "".concat(today.getFullYear(), "-").concat(month, "-").concat(day);
            displayDate = "".concat(today.getMonth() + 1, "\u6708").concat(today.getDate(), "\u65E5");
            todayAmount = 0;
            target = 2000;
            streak = 0;
            avg = 0;
            cupCount = 0;
            _context.prev = 10;
            _context.next = 13;
            return drinkData.getStore({
              historyDays: 7
            });
          case 13:
            store = _context.sent;
            if (_this._alive) {
              _context.next = 16;
              break;
            }
            return _context.abrupt("return");
          case 16:
            target = Number(store && store.dailyGoalMl) || 2000;
            recordsByDate = store && store.recordsByDate || {};
            todayList = Array.isArray(recordsByDate[todayStr]) ? recordsByDate[todayStr] : [];
            todayAmount = todayList.reduce(function(sum, r) {
              return sum + (Number(r && r.amount) || 0);
            }, 0);
            cupCount = todayList.length;

            // 用本地时区日期 key 计算 streak，避免 UTC 偏移
            checkDate = new Date(today);
            i = 0;
          case 23:
            if (!(i < 7)) {
              _context.next = 36;
              break;
            }
            key = "".concat(checkDate.getFullYear(), "-").concat(String(checkDate.getMonth() + 1).padStart(2, "0"), "-").concat(String(checkDate.getDate()).padStart(2, "0"));
            list = Array.isArray(recordsByDate[key]) ? recordsByDate[key] : [];
            amount = list.reduce(function(sum, r) {
              return sum + (Number(r && r.amount) || 0);
            }, 0);
            if (!(amount > 0)) {
              _context.next = 32;
              break;
            }
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
            _context.next = 33;
            break;
          case 32:
            return _context.abrupt("break", 36);
          case 33:
            i++;
            _context.next = 23;
            break;
          case 36:
            allAmounts = Object.values(recordsByDate).map(function(list) {
              return (Array.isArray(list) ? list : []).reduce(function(sum, r) {
                return sum + (Number(r && r.amount) || 0);
              }, 0);
            }).filter(function(a) {
              return a > 0;
            });
            avg = allAmounts.length ? Math.round(allAmounts.reduce(function(s, a) {
              return s + a;
            }, 0) / allAmounts.length) : 0;
            _context.next = 43;
            break;
          case 40:
            _context.prev = 40;
            _context.t0 = _context["catch"](10);
            console.warn("[profile] drink data load failed", _context.t0);
          case 43:
            if (_this._alive) {
              _context.next = 45;
              break;
            }
            return _context.abrupt("return");
          case 45:
            progress = Math.min(100, Math.round(todayAmount / target * 100));
            _this.setData({
              todayDate: displayDate,
              todayDrink: todayAmount,
              targetDrink: target,
              drinkProgress: progress,
              cupCount: cupCount,
              streakDays: streak,
              avgDrink: avg
            });
          case 47:
          case "end":
            return _context.stop();
        }
      }, _callee, null, [
        [10, 40]
      ]);
    }))();
  },
  _loadBindingData: function _loadBindingData() {
    var bound = wx.getStorageSync(BOUND_DEVICES_KEY);
    var boundDevices = Array.isArray(bound) ? bound : [];
    var cupToken = String(wx.getStorageSync(CUP_TOKEN_KEY) || "").trim();
    this.setData({
      boundDevices: boundDevices,
      cupToken: cupToken,
      connected: false
    });
    this._checkConnection();
  },
  _checkConnection: function _checkConnection() {
    var _this2 = this;
    var lastId = String(wx.getStorageSync(LAST_DEVICE_ID_KEY) || "");
    if (!lastId || !wx.getConnectedBluetoothDevices) return;
    wx.getConnectedBluetoothDevices({
      services: [ble.SERVICE_UUID],
      success: function success(res) {
        if (!_this2._alive) return;
        var list = Array.isArray(res && res.devices) ? res.devices : [];
        var connected = list.some(function(item) {
          return item && item.deviceId === lastId;
        });
        if (connected !== _this2.data.connected) {
          _this2.setData({
            connected: connected
          });
        }
      },
      fail: function fail() {}
    });
  },
  onBindCodeInput: function onBindCodeInput(e) {
    var val = String(e.detail && e.detail.value || "").trim().toUpperCase();
    this.setData({
      bindCodeInput: val
    });
  },
  manualBind: function manualBind() {
    var _this3 = this;
    var token = this.data.bindCodeInput;
    if (!token) {
      wx.showToast({
        title: "请输入绑定码",
        icon: "none"
      });
      return;
    }
    if (!wx.cloud) {
      wx.showToast({
        title: "云开发未启用",
        icon: "none"
      });
      return;
    }
    this.setData({
      bindingBusy: true
    });
    wx.cloud.callFunction({
      name: "bindCup",
      data: {
        token: token
      },
      success: function success(res) {
        var result = res && res.result;
        if (result && result.ok) {
          wx.showToast({
            title: "绑定成功",
            icon: "success"
          });
          _this3.setData({
            bindCodeInput: "",
            cupToken: token
          });
          wx.setStorageSync(CUP_TOKEN_KEY, token);
          _this3._addBoundDevice(token);
        } else {
          wx.showToast({
            title: String(result && result.error || "绑定失败"),
            icon: "none"
          });
        }
      },
      fail: function fail(err) {
        console.warn("[bind] call failed", err);
        wx.showToast({
          title: "网络异常，请重试",
          icon: "none"
        });
      },
      complete: function complete() {
        _this3.setData({
          bindingBusy: false
        });
      }
    });
  },
  _addBoundDevice: function _addBoundDevice(token) {
    var list = this.data.boundDevices.slice();
    if (!list.some(function(d) {
        return d.token === token;
      })) {
      list.unshift({
        token: token,
        name: "SmartCup-".concat(token.slice(0, 6)),
        boundAt: Date.now()
      });
      wx.setStorageSync(BOUND_DEVICES_KEY, list);
      this.setData({
        boundDevices: list
      });
    }
  },
  scanBind: function scanBind() {
    wx.navigateTo({
      url: "/pages/device/device"
    });
  },
  removeBoundDevice: function removeBoundDevice(e) {
    var token = e && e.currentTarget && e.currentTarget.dataset ? String(e.currentTarget.dataset.token || "") : "";
    if (!token) return;
    var list = this.data.boundDevices.filter(function(d) {
      return d.token !== token;
    });
    wx.setStorageSync(BOUND_DEVICES_KEY, list);
    this.setData({
      boundDevices: list
    });
    wx.showToast({
      title: "已移除",
      icon: "none"
    });
  },
  goDevice: function goDevice() {
    wx.navigateTo({
      url: "/pages/device/device"
    });
  },
  goMap: function goMap() {
    wx.navigateTo({
      url: "/pages/map/map"
    });
  },
  goChat: function goChat() {
    wx.navigateTo({
      url: "/pages/chat/chat"
    });
  },
  goDiagnostic: function goDiagnostic() {
    wx.navigateTo({
      url: "/pages/diagnostic/diagnostic"
    });
  },
  goSettings: function goSettings() {
    wx.navigateTo({
      url: "/pages/settings/settings"
    });
  },
  goCheckin: function goCheckin() {
    wx.navigateTo({
      url: "/pages/daily-checkin/daily-checkin"
    });
  },
  goWaterReminder: function goWaterReminder() {
    wx.navigateTo({
      url: "/pages/water-reminder/water-reminder"
    });
  },
  goFamilyCare: function goFamilyCare() {
    wx.navigateTo({
      url: "/pages/family-care/family-care"
    });
  },
  goQualityRange: function goQualityRange() {
    var tds = Number(wx.getStorageSync(LAST_TDS_KEY));
    var query = Number.isFinite(tds) ? "?tds=".concat(Math.max(0, Math.round(tds))) : "";
    wx.navigateTo({
      url: "/pages/water-quality-standards/water-quality-standards".concat(query)
    });
  },
  goDataReport: function goDataReport() {
    wx.navigateTo({
      url: "/pages/data/data"
    });
  },
  _getConnectedCupDeviceId: function _getConnectedCupDeviceId() {
    return new Promise(function(resolve) {
      if (!wx.getConnectedBluetoothDevices || !ble.SERVICE_UUID) return resolve("");
      var lastId = String(wx.getStorageSync(LAST_DEVICE_ID_KEY) || "");
      wx.getConnectedBluetoothDevices({
        services: [ble.SERVICE_UUID],
        success: function success(res) {
          var list = Array.isArray(res && res.devices) ? res.devices : [];
          if (!list.length) return resolve("");
          if (lastId) {
            var matched = list.find(function(item) {
              return item && item.deviceId === lastId;
            });
            if (matched && matched.deviceId) return resolve(String(matched.deviceId));
          }
          var first = list.find(function(item) {
            return item && item.deviceId;
          });
          resolve(first && first.deviceId ? String(first.deviceId) : "");
        },
        fail: function fail() {
          return resolve("");
        }
      });
    });
  },
  logout: function logout() {
    wx.exitMiniProgram({
      success: function success() {
        console.log("退出小程序成功");
      },
      fail: function fail(err) {
        console.error("退出小程序失败", err);
      }
    });
  }
});