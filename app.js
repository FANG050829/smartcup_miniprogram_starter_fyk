var locationSettings = require("./utils/locationSettings");
var waterReminder = require("./utils/waterReminderCore");
var planReminderCore = require("./utils/planReminderCore");
var wxCompat = require("./utils/wxCompat");
var bootLog = require("./utils/bootLog");
App({
  globalData: {
    // 留空时使用微信开发者工具当前选择的云开发环境。
    // 如果要固定环境，可改成自己的云环境 ID，例如 "cloud1-xxxxx"。
    envId: "cloud1-d6grh9jgl3278f657",
    runtimePlatform: "",
    desktopCompatMode: false
  },
  onLaunch: function onLaunch() {
    bootLog.breadcrumb("app onLaunch");
    this._waterReminderInitialized = false;
    locationSettings.setPreferredLocationMode("phone");
    var runtimePlatform = this._getRuntimePlatform();
    this.globalData.runtimePlatform = runtimePlatform;
    this.globalData.desktopCompatMode = this._isDesktopCompatMode(runtimePlatform);
    this._initCloudSafe();
    if (wx.onUnhandledRejection) {
      wx.onUnhandledRejection(function(res) {
        bootLog.reportError("unhandledRejection", res && (res.reason || res.message) || res);
      });
    }
  },
  onError: function onError(err) {
    bootLog.reportError("app.onError", err);
  },
  onShow: function onShow() {
    if (this.globalData.desktopCompatMode) return;
    this._setKeepScreenOn(true);
    this._initWaterReminderSafe();
    this._initPlanReminderSafe();
  },
  onHide: function onHide() {
    if (this.globalData.desktopCompatMode) return;
    this._setKeepScreenOn(false);
  },
  _getRuntimePlatform: function _getRuntimePlatform() {
    try {
      var metrics = wxCompat.getLayoutMetrics();
      var platform = String(metrics && metrics.platform ? metrics.platform : "");
      return platform.trim().toLowerCase();
    } catch (err) {
      return "";
    }
  },
  _isDesktopCompatMode: function _isDesktopCompatMode(platform) {
    var normalized = String(platform || "").trim().toLowerCase();
    return normalized !== "ios" && normalized !== "android";
  },
  _initCloudSafe: function _initCloudSafe() {
    if (!wx.cloud) {
      console.error("[cloud] wx.cloud unavailable, skip cloud init");
      return;
    }
    try {
      var envId = String(this.globalData.envId || "").trim();
      var options = {
        traceUser: true
      };
      if (envId) options.env = envId;
      wx.cloud.init(options);
    } catch (err) {
      console.error("[cloud init fail]", err);
    }
  },
  _initWaterReminderSafe: function _initWaterReminderSafe() {
    if (this._waterReminderInitialized) return;
    this._waterReminderInitialized = true;
    setTimeout(function() {
      try {
        waterReminder.initWaterReminder();
      } catch (err) {
        console.error("[water reminder init fail]", err);
      }
    }, 0);
  },
  _initPlanReminderSafe: function _initPlanReminderSafe() {
    try {
      planReminderCore.startMonitoring();
    } catch (err) {
      console.error("[plan reminder init fail]", err);
    }
  },
  _setKeepScreenOn: function _setKeepScreenOn(keepScreenOn) {
    if (!wx.setKeepScreenOn) return;
    wx.setKeepScreenOn({
      keepScreenOn: !!keepScreenOn,
      fail: function fail(err) {
        console.warn("setKeepScreenOn fail", err);
      }
    });
  }
});