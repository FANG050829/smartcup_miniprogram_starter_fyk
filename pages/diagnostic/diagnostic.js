var _regeneratorRuntime2 = require("../../@babel/runtime/helpers/regeneratorRuntime");
var _asyncToGenerator2 = require("../../@babel/runtime/helpers/asyncToGenerator");
var _objectSpread2 = require("../../@babel/runtime/helpers/objectSpread2");
var ble = require("../../utils/ble");
var locationSettings = require("../../utils/locationSettings");
var STATUS_TEXT = {
  idle: "未检测",
  checking: "检测中",
  pending: "待确认",
  ok: "正常",
  fail: "异常"
};
var MODULES = [{
  key: "location",
  name: "定位模块"
}, {
  key: "temperature",
  name: "温度模块"
}, {
  key: "water",
  name: "水质模块"
}, {
  key: "level",
  name: "水位模块"
}, {
  key: "ai",
  name: "实时通讯"
}, {
  key: "heat",
  name: "加热模块"
}];
var FRAME_STALE_MS = 5000;
var MONITOR_TICK_MS = 1000;
var RSSI_TICK_MS = 3000;
var CONNECTION_TICK_MS = 2500;
var HEAT_STATUS_ACK_TIMEOUT_MS = 2800;
var HEAT_THERMAL_BASELINE_TIMEOUT_MS = 3500;
var HEAT_THERMAL_CONFIRM_DELTA_C = 0.15;
var HEAT_CONFIRM_DEFAULT_WATER_ML = 250;
var HEAT_CONFIRM_MIN_WATER_ML = 80;
var HEAT_CONFIRM_MAX_WATER_ML = 600;
var HEAT_CONFIRM_MIN_DURATION_SEC = 20;
var HEAT_CONFIRM_MAX_DURATION_SEC = 90;
var HEAT_CONFIRM_SEC_PER_ML = 0.12;

function buildModules() {
  var state = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : "idle";
  var detail = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : "等待检测";
  var safeState = STATUS_TEXT[state] ? state : "idle";
  return MODULES.map(function(item) {
    return {
      key: item.key,
      name: item.name,
      state: safeState,
      stateText: STATUS_TEXT[safeState],
      detail: detail,
      actionVisible: false,
      actionDisabled: false,
      actionText: ""
    };
  });
}

function formatClock() {
  var timestamp = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : Date.now();
  var dt = new Date(timestamp);
  var hh = "".concat(dt.getHours()).padStart(2, "0");
  var mm = "".concat(dt.getMinutes()).padStart(2, "0");
  var ss = "".concat(dt.getSeconds()).padStart(2, "0");
  return "".concat(hh, ":").concat(mm, ":").concat(ss);
}

function formatAge(ms) {
  var sec = Math.max(0, Number(ms) || 0) / 1000;
  return "".concat(sec.toFixed(1), "\u79D2");
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getValidTemperature(payload) {
  var rawTemp = Number(payload && payload.temperature);
  if (!payload || payload.temperatureValid === false || !Number.isFinite(rawTemp)) {
    return Number.NaN;
  }
  return rawTemp;
}

function getNormalizedWaterMl(payload) {
  var waterValid = payload && payload.waterValid === true;
  var waterMl = Number(payload && payload.waterMl);
  if (!waterValid || !Number.isFinite(waterMl) || waterMl <= 0) return null;
  return clampNumber(Math.round(waterMl), HEAT_CONFIRM_MIN_WATER_ML, HEAT_CONFIRM_MAX_WATER_ML);
}

function resolveHeatConfirmConfig(payload) {
  var detectedWaterMl = getNormalizedWaterMl(payload);
  var waterMl = detectedWaterMl || HEAT_CONFIRM_DEFAULT_WATER_ML;
  var durationSec = clampNumber(Math.round(18 + waterMl * HEAT_CONFIRM_SEC_PER_ML), HEAT_CONFIRM_MIN_DURATION_SEC, HEAT_CONFIRM_MAX_DURATION_SEC);
  return {
    waterMl: waterMl,
    usedDefaultWater: !detectedWaterMl,
    durationSec: durationSec
  };
}

function formatHeatWaterSource() {
  var config = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var waterMl = Math.round(Number(config.waterMl) || HEAT_CONFIRM_DEFAULT_WATER_ML);
  if (config.usedDefaultWater) {
    return "\u672A\u8BFB\u53D6\u5230\u6709\u6548\u6C34\u91CF\uFF0C\u6309\u9ED8\u8BA4 ".concat(waterMl, "ml \u4F30\u7B97");
  }
  return "\u6309\u5F53\u524D\u7EA6 ".concat(waterMl, "ml \u6C34\u91CF\u4F30\u7B97");
}
Page({
  data: {
    diagLoading: false,
    monitoring: false,
    lastUpdateText: "--",
    lastDeviceName: "",
    lastDeviceId: "",
    deviceSummary: "未连接",
    hardwareModules: buildModules("idle"),
    overallState: "idle",
    overallStateText: STATUS_TEXT.idle
  },
  onShow: function onShow() {
    this.refreshDiagnostic();
  },
  onHide: function onHide() {
    this._diagSession = Number(this._diagSession || 0) + 1;
    this._stopRealtimeMonitor();
  },
  onUnload: function onUnload() {
    this._diagSession = Number(this._diagSession || 0) + 1;
    this._stopRealtimeMonitor();
  },
  _isSessionActive: function _isSessionActive(session) {
    return Number(session) > 0 && Number(session) === Number(this._diagSession || 0);
  },
  _readLastDevice: function _readLastDevice() {
    var obj = wx.getStorageSync("smartcup_last_device") || {};
    var name = obj.name || wx.getStorageSync("smartcup_last_device_name") || "";
    var id = obj.id || wx.getStorageSync("smartcup_last_device_id") || "";
    return {
      name: name,
      id: id
    };
  },
  _pickDeviceIdFromList: function _pickDeviceIdFromList() {
    var list = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
    var lastDeviceId = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : "";
    var devices = Array.isArray(list) ? list : [];
    if (!devices.length) return "";
    if (lastDeviceId) {
      var matched = devices.find(function(item) {
        return item && item.deviceId === lastDeviceId;
      });
      if (matched && matched.deviceId) return String(matched.deviceId);
    }
    var first = devices.find(function(item) {
      return item && item.deviceId;
    });
    return first && first.deviceId ? String(first.deviceId) : "";
  },
  _queryConnectedDevices: function _queryConnectedDevices() {
    var payload = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    return new Promise(function(resolve) {
      if (!wx.getConnectedBluetoothDevices) {
        resolve([]);
        return;
      }
      wx.getConnectedBluetoothDevices(_objectSpread2(_objectSpread2({}, payload), {}, {
        success: function success(res) {
          return resolve(Array.isArray(res && res.devices) ? res.devices : []);
        },
        fail: function fail() {
          return resolve([]);
        }
      }));
    });
  },
  _getConnectedCupDeviceId: function _getConnectedCupDeviceId() {
    var _arguments = arguments,
      _this = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee() {
      var lastDeviceId, list, chosen;
      return _regeneratorRuntime2().wrap(function _callee$(_context) {
        while (1) switch (_context.prev = _context.next) {
          case 0:
            lastDeviceId = _arguments.length > 0 && _arguments[0] !== undefined ? _arguments[0] : "";
            if (ble.SERVICE_UUID) {
              _context.next = 3;
              break;
            }
            return _context.abrupt("return", "");
          case 3:
            _context.next = 5;
            return _this._queryConnectedDevices({
              services: [ble.SERVICE_UUID]
            });
          case 5:
            list = _context.sent;
            chosen = _this._pickDeviceIdFromList(list, lastDeviceId);
            if (!chosen) {
              _context.next = 9;
              break;
            }
            return _context.abrupt("return", chosen);
          case 9:
            _context.next = 11;
            return _this._queryConnectedDevices({
              services: ["FFF0"]
            });
          case 11:
            list = _context.sent;
            chosen = _this._pickDeviceIdFromList(list, lastDeviceId);
            if (!chosen) {
              _context.next = 15;
              break;
            }
            return _context.abrupt("return", chosen);
          case 15:
            _context.next = 17;
            return _this._queryConnectedDevices({});
          case 17:
            list = _context.sent;
            return _context.abrupt("return", _this._pickDeviceIdFromList(list, lastDeviceId));
          case 19:
          case "end":
            return _context.stop();
        }
      }, _callee);
    }))();
  },
  _resolveOverallState: function _resolveOverallState() {
    var modules = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
    if (modules.some(function(item) {
        return item.state === "fail";
      })) return "fail";
    if (modules.some(function(item) {
        return item.state === "checking";
      })) return "checking";
    if (modules.some(function(item) {
        return item.state === "pending";
      })) return "pending";
    if (modules.every(function(item) {
        return item.state === "ok";
      })) return "ok";
    if (modules.some(function(item) {
        return item.state === "ok";
      })) return "ok";
    return "idle";
  },
  _mergeResultMap: function _mergeResultMap() {
    var resultMap = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    return MODULES.map(function(item) {
      var raw = resultMap[item.key] || {};
      var state = STATUS_TEXT[raw.state] ? raw.state : "idle";
      return {
        key: item.key,
        name: item.name,
        state: state,
        stateText: STATUS_TEXT[state],
        detail: String(raw.detail || "等待检测"),
        actionVisible: !!raw.actionVisible,
        actionDisabled: !!raw.actionDisabled,
        actionText: String(raw.actionText || "")
      };
    });
  },
  _setResultMap: function _setResultMap() {
    var resultMap = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    var extraData = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    var hardwareModules = this._mergeResultMap(resultMap);
    var overallState = this._resolveOverallState(hardwareModules);
    this.setData(_objectSpread2({
      hardwareModules: hardwareModules,
      overallState: overallState,
      overallStateText: STATUS_TEXT[overallState],
      lastUpdateText: formatClock()
    }, extraData));
  },
  refreshDiagnostic: function refreshDiagnostic() {
    var _this2 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee2() {
      var session, last, connectedId, shownName, resultMap, explained, detail, _resultMap;
      return _regeneratorRuntime2().wrap(function _callee2$(_context2) {
        while (1) switch (_context2.prev = _context2.next) {
          case 0:
            session = Number(_this2._diagSession || 0) + 1;
            _this2._diagSession = session;
            _this2._stopRealtimeMonitor();
            _this2.setData({
              diagLoading: true,
              monitoring: false,
              lastUpdateText: "--"
            });
            last = _this2._readLastDevice();
            _context2.next = 7;
            return _this2._getConnectedCupDeviceId(last.id);
          case 7:
            connectedId = _context2.sent;
            if (_this2._isSessionActive(session)) {
              _context2.next = 10;
              break;
            }
            return _context2.abrupt("return");
          case 10:
            shownName = String(last.name || "").trim();
            if (connectedId) {
              _context2.next = 16;
              break;
            }
            resultMap = {};
            MODULES.forEach(function(item) {
              resultMap[item.key] = {
                state: "idle",
                detail: "请先连接水杯"
              };
            });
            _this2._setResultMap(resultMap, {
              diagLoading: false,
              monitoring: false,
              lastDeviceName: shownName,
              lastDeviceId: last.id || "",
              deviceSummary: "未连接"
            });
            return _context2.abrupt("return");
          case 16:
            _this2.setData({
              lastDeviceName: shownName,
              lastDeviceId: connectedId,
              deviceSummary: shownName || "水杯已连接"
            });
            _this2._setResultMap({
              location: {
                state: "checking",
                detail: "正在启动实时检测..."
              },
              temperature: {
                state: "checking",
                detail: "正在启动实时检测..."
              },
              water: {
                state: "checking",
                detail: "正在启动实时检测..."
              },
              level: {
                state: "checking",
                detail: "正在启动实时检测..."
              },
              ai: {
                state: "checking",
                detail: "正在启动实时检测..."
              },
              heat: {
                state: "checking",
                detail: "正在启动实时检测..."
              }
            });
            _context2.prev = 18;
            _context2.next = 21;
            return ble.connect(connectedId);
          case 21:
            _context2.next = 33;
            break;
          case 23:
            _context2.prev = 23;
            _context2.t0 = _context2["catch"](18);
            if (_this2._isSessionActive(session)) {
              _context2.next = 27;
              break;
            }
            return _context2.abrupt("return");
          case 27:
            explained = ble.explainBleError ? ble.explainBleError(_context2.t0) : {};
            detail = explained && explained.text ? explained.text : "连接失败，无法执行硬件检测";
            _resultMap = {};
            MODULES.forEach(function(item) {
              _resultMap[item.key] = {
                state: "fail",
                detail: detail
              };
            });
            _this2._setResultMap(_resultMap, {
              diagLoading: false,
              monitoring: false,
              deviceSummary: "连接失败"
            });
            return _context2.abrupt("return");
          case 33:
            if (_this2._isSessionActive(session)) {
              _context2.next = 35;
              break;
            }
            return _context2.abrupt("return");
          case 35:
            _this2._startRealtimeMonitor(connectedId, session);
            _this2.setData({
              diagLoading: false,
              monitoring: true
            });
            _this2._runHeatControlCheck(connectedId, session).then(function(result) {
              if (!_this2._isSessionActive(session)) return;
              _this2._heatSelfTest = result;
              _this2._refreshRealtimeView();
            }).catch(function(error) {
              if (!_this2._isSessionActive(session)) return;
              console.error("[diagnostic] heat control check failed", error);
              _this2._heatSelfTest = {
                state: "fail",
                phase: "control",
                detail: "加热控制链路检测执行失败"
              };
              _this2._refreshRealtimeView();
            });
          case 38:
          case "end":
            return _context2.stop();
        }
      }, _callee2, null, [
        [18, 23]
      ]);
    }))();
  },
  _startRealtimeMonitor: function _startRealtimeMonitor(deviceId, session) {
    var _this3 = this;
    this._stopRealtimeMonitor();
    this._activeDeviceId = String(deviceId || "");
    this._linkAlive = true;
    this._notifyStats = {
      count: 0,
      latest: null,
      lastAt: 0,
      lastRssi: Number.NaN,
      lastRssiAt: 0,
      rssiErrorAt: 0
    };
    this._heatSelfTest = {
      state: "checking",
      phase: "control"
    };
    this._notifyOff = ble.onNotifyParsed(deviceId, function(payload) {
      if (!_this3._isSessionActive(session)) return;
      if (!_this3._notifyStats) return;
      _this3._notifyStats.count = (Number(_this3._notifyStats.count) || 0) + 1;
      _this3._notifyStats.latest = payload || null;
      _this3._notifyStats.lastAt = Date.now();
      _this3._trackHeatRiseProgress(payload);
      _this3._refreshRealtimeView();
    });
    this._monitorTimer = setInterval(function() {
      if (!_this3._isSessionActive(session)) return;
      _this3._refreshRealtimeView();
    }, MONITOR_TICK_MS);
    this._rssiTimer = setInterval(function() {
      _this3._pollRssi(deviceId, session);
    }, RSSI_TICK_MS);
    this._connectionTimer = setInterval(function() {
      _this3._pollConnection(deviceId, session);
    }, CONNECTION_TICK_MS);
    this._pollRssi(deviceId, session);
    this._pollConnection(deviceId, session);
    ble.writeCommand(deviceId, [0x12]).catch(function() {});
    this._refreshRealtimeView();
  },
  _stopRealtimeMonitor: function _stopRealtimeMonitor() {
    var activeDeviceId = this._activeDeviceId;
    if (this._monitorTimer) clearInterval(this._monitorTimer);
    if (this._rssiTimer) clearInterval(this._rssiTimer);
    if (this._connectionTimer) clearInterval(this._connectionTimer);
    if (typeof this._notifyOff === "function") {
      this._notifyOff();
    }
    this._monitorTimer = null;
    this._rssiTimer = null;
    this._connectionTimer = null;
    this._notifyOff = null;
    this._activeDeviceId = "";
    this._notifyStats = null;
    this._linkAlive = false;
    this._heatSelfTest = null;
    if (activeDeviceId) {
      ble.writeHeat(activeDeviceId, false).catch(function() {});
    }
  },
  _pollConnection: function _pollConnection(deviceId, session) {
    var _this4 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee3() {
      var alive;
      return _regeneratorRuntime2().wrap(function _callee3$(_context3) {
        while (1) switch (_context3.prev = _context3.next) {
          case 0:
            if (_this4._isSessionActive(session)) {
              _context3.next = 2;
              break;
            }
            return _context3.abrupt("return");
          case 2:
            _context3.next = 4;
            return ble.isConnected(deviceId).catch(function() {
              return false;
            });
          case 4:
            alive = _context3.sent;
            if (_this4._isSessionActive(session)) {
              _context3.next = 7;
              break;
            }
            return _context3.abrupt("return");
          case 7:
            _this4._linkAlive = !!alive;
            _this4._refreshRealtimeView();
          case 9:
          case "end":
            return _context3.stop();
        }
      }, _callee3);
    }))();
  },
  _pollRssi: function _pollRssi(deviceId, session) {
    var _this5 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee4() {
      var rssi;
      return _regeneratorRuntime2().wrap(function _callee4$(_context4) {
        while (1) switch (_context4.prev = _context4.next) {
          case 0:
            if (_this5._isSessionActive(session)) {
              _context4.next = 2;
              break;
            }
            return _context4.abrupt("return");
          case 2:
            _context4.prev = 2;
            _context4.next = 5;
            return ble.getRSSI(deviceId);
          case 5:
            rssi = _context4.sent;
            if (!(!_this5._isSessionActive(session) || !_this5._notifyStats)) {
              _context4.next = 8;
              break;
            }
            return _context4.abrupt("return");
          case 8:
            _this5._notifyStats.lastRssi = Number(rssi);
            _this5._notifyStats.lastRssiAt = Date.now();
            _this5._notifyStats.rssiErrorAt = 0;
            _context4.next = 18;
            break;
          case 13:
            _context4.prev = 13;
            _context4.t0 = _context4["catch"](2);
            if (!(!_this5._isSessionActive(session) || !_this5._notifyStats)) {
              _context4.next = 17;
              break;
            }
            return _context4.abrupt("return");
          case 17:
            _this5._notifyStats.rssiErrorAt = Date.now();
          case 18:
            _this5._refreshRealtimeView();
          case 19:
          case "end":
            return _context4.stop();
        }
      }, _callee4, null, [
        [2, 13]
      ]);
    }))();
  },
  _refreshRealtimeView: function _refreshRealtimeView() {
    var resultMap = this._buildRealtimeResultMap();
    var summary = this._linkAlive ? this.data.lastDeviceName || "水杯已连接" : "蓝牙连接已断开";
    this._setResultMap(resultMap, {
      deviceSummary: summary
    });
  },
  _buildRealtimeResultMap: function _buildRealtimeResultMap() {
    if (!this._notifyStats) {
      return {
        location: {
          state: "idle",
          detail: "等待检测"
        },
        temperature: {
          state: "idle",
          detail: "等待检测"
        },
        water: {
          state: "idle",
          detail: "等待检测"
        },
        level: {
          state: "idle",
          detail: "等待检测"
        },
        ai: {
          state: "idle",
          detail: "等待检测"
        },
        heat: {
          state: "idle",
          detail: "等待检测"
        }
      };
    }
    var now = Date.now();
    var stats = this._notifyStats;
    var frameCount = Number(stats.count) || 0;
    var lastFrameAt = Number(stats.lastAt) || 0;
    var frameAge = lastFrameAt > 0 ? now - lastFrameAt : Number.POSITIVE_INFINITY;
    var frameFresh = lastFrameAt > 0 && frameAge <= FRAME_STALE_MS;
    var payload = frameFresh ? stats.latest : null;
    if (!this._linkAlive) {
      var disconnected = {
        state: "fail",
        detail: "蓝牙连接已断开"
      };
      return {
        location: disconnected,
        temperature: disconnected,
        water: disconnected,
        level: disconnected,
        ai: disconnected,
        heat: disconnected
      };
    }
    var location = this._buildLocationRealtimeResult(payload, frameCount, frameAge);
    var ai = this._buildAiRealtimeResult(frameCount, frameFresh, frameAge);
    var temperature = this._buildTemperatureRealtimeResult(payload, frameCount, frameAge);
    var water = this._buildWaterRealtimeResult(payload, frameCount, frameAge);
    var level = this._buildWaterLevelRealtimeResult(payload, frameCount, frameAge);
    var heat = this._buildHeatRealtimeResult(payload, frameCount, frameAge);
    return {
      location: location,
      temperature: temperature,
      water: water,
      level: level,
      ai: ai,
      heat: heat
    };
  },
  _buildLocationRealtimeResult: function _buildLocationRealtimeResult(payload, frameCount, frameAge) {
    if (locationSettings.getPreferredLocationMode() === "phone") {
      var _lat = Number(payload && payload.gpsLatitude);
      var _lng = Number(payload && payload.gpsLongitude);
      if (Number.isFinite(_lat) && Number.isFinite(_lng)) {
        return {
          state: "ok",
          detail: "\u5B9A\u4F4D\u6B63\u5E38\uFF08".concat(_lat.toFixed(5), ", ").concat(_lng.toFixed(5), "\uFF09")
        };
      }
      return {
        state: "ok",
        detail: "定位正常"
      };
    }
    if (frameCount <= 0) {
      return {
        state: "fail",
        detail: "未收到定位数据"
      };
    }
    if (!payload) {
      return {
        state: "fail",
        detail: "\u5B9A\u4F4D\u6570\u636E\u8D85\u65F6\uFF08".concat(formatAge(frameAge), "\uFF09")
      };
    }
    var lat = Number(payload.gpsLatitude);
    var lng = Number(payload.gpsLongitude);
    if (payload.gpsValid === true && Number.isFinite(lat) && Number.isFinite(lng)) {
      return {
        state: "ok",
        detail: "\u5B9A\u4F4D\u6B63\u5E38\uFF08".concat(lat.toFixed(5), ", ").concat(lng.toFixed(5), "\uFF09")
      };
    }
    var flags = typeof payload.statusFlags === "number" ? payload.statusFlags : null;
    if (flags === null) {
      return {
        state: "fail",
        detail: "固件未上报定位标记（请升级固件）"
      };
    }
    if ((flags & 0x20) !== 0x20) {
      return {
        state: "fail",
        detail: "定位模块未上报（未接入或未定位）"
      };
    }
    return {
      state: "fail",
      detail: "定位数据无效"
    };
  },
  _buildAiRealtimeResult: function _buildAiRealtimeResult(frameCount, frameFresh, frameAge) {
    if (frameCount <= 0) {
      return {
        state: "fail",
        detail: "未收到设备实时上报帧"
      };
    }
    if (!frameFresh) {
      return {
        state: "fail",
        detail: "\u8BBE\u5907\u4E0A\u62A5\u4E2D\u65AD\uFF08".concat(formatAge(frameAge), "\uFF09")
      };
    }
    return {
      state: "ok",
      detail: "\u5B9E\u65F6\u4E0A\u62A5\u6B63\u5E38\uFF08\u7D2F\u8BA1 ".concat(frameCount, " \u6761\uFF09")
    };
  },
  _buildTemperatureRealtimeResult: function _buildTemperatureRealtimeResult(payload, frameCount, frameAge) {
    if (frameCount <= 0) {
      return {
        state: "fail",
        detail: "未收到温度数据"
      };
    }
    if (!payload) {
      return {
        state: "fail",
        detail: "\u6E29\u5EA6\u6570\u636E\u8D85\u65F6\uFF08".concat(formatAge(frameAge), "\uFF09")
      };
    }
    if (payload.temperatureSensorPresent === false) {
      return {
        state: "fail",
        detail: "温度传感器未接入"
      };
    }
    var rawTemp = Number(payload.temperature);
    var tempValid = payload.temperatureValid !== false && Number.isFinite(rawTemp);
    if (!tempValid) {
      return {
        state: "fail",
        detail: "温度传感器数据无效"
      };
    }
    if (rawTemp < -20 || rawTemp > 125) {
      return {
        state: "fail",
        detail: "\u6E29\u5EA6\u5F02\u5E38\uFF08".concat(rawTemp.toFixed(1), "\u2103\uFF09")
      };
    }
    return {
      state: "ok",
      detail: "\u6E29\u5EA6\u6B63\u5E38\uFF08".concat(rawTemp.toFixed(1), "\u2103\uFF09")
    };
  },
  _buildWaterRealtimeResult: function _buildWaterRealtimeResult(payload, frameCount, frameAge) {
    if (frameCount <= 0) {
      return {
        state: "fail",
        detail: "未收到水质数据"
      };
    }
    if (!payload) {
      return {
        state: "fail",
        detail: "\u6C34\u8D28\u6570\u636E\u8D85\u65F6\uFF08".concat(formatAge(frameAge), "\uFF09")
      };
    }
    if (payload.tdsSensorPresent === false) {
      return {
        state: "fail",
        detail: "水质模块未接入"
      };
    }
    if (payload.tdsValid === false) {
      return {
        state: "fail",
        detail: "水质模块数据无效"
      };
    }
    var tds = Number(payload.tds);
    if (!Number.isFinite(tds)) {
      return {
        state: "fail",
        detail: "水质传感器数据无效"
      };
    }
    if (tds < 0 || tds > 3000) {
      return {
        state: "fail",
        detail: "TDS \u5F02\u5E38\uFF08".concat(Math.round(tds), " ppm\uFF09")
      };
    }
    return {
      state: "ok",
      detail: "TDS \u6B63\u5E38\uFF08".concat(Math.round(tds), " ppm\uFF09")
    };
  },
  _buildWaterLevelRealtimeResult: function _buildWaterLevelRealtimeResult(payload, frameCount, frameAge) {
    if (locationSettings.getPreferredLocationMode() === "phone") {
      var rawMl = Number(payload && payload.waterMl);
      var _ml = Number.isFinite(rawMl) ? Math.max(0, Math.round(rawMl)) : 0;
      return {
        state: "ok",
        detail: "\u6C34\u91CF\u6B63\u5E38\uFF08".concat(_ml, " ml\uFF09")
      };
    }
    if (frameCount <= 0) {
      return {
        state: "fail",
        detail: "未收到水位数据"
      };
    }
    if (!payload) {
      return {
        state: "fail",
        detail: "\u6C34\u4F4D\u6570\u636E\u8D85\u65F6\uFF08".concat(formatAge(frameAge), "\uFF09")
      };
    }
    var flags = typeof payload.statusFlags === "number" ? payload.statusFlags : null;
    var waterFlag = flags !== null && (flags & 0x40) === 0x40;
    var waterSensorPresent = typeof payload.waterSensorPresent === "boolean" ? payload.waterSensorPresent : null;
    if (flags === null) {
      return {
        state: "fail",
        detail: "固件未上报水位标记（请升级固件）"
      };
    }
    if (waterSensorPresent === false) {
      return {
        state: "fail",
        detail: "未检测到水位传感器接入"
      };
    }
    if (!waterFlag) {
      var _detail = waterSensorPresent === true ? "水位传感器已接入，但未上报有效水位" : "水位模块未上报（未启用/未标定）";
      return {
        state: "fail",
        detail: _detail
      };
    }
    var ml = Number(payload.waterMl);
    if (!Number.isFinite(ml)) {
      return {
        state: "fail",
        detail: "水位传感器数据无效"
      };
    }
    if (ml < 0 || ml > 6000) {
      return {
        state: "fail",
        detail: "\u6C34\u91CF\u5F02\u5E38\uFF08".concat(Math.round(ml), " ml\uFF09")
      };
    }
    if (waterSensorPresent === null && ml === 0) {
      return {
        state: "fail",
        detail: "当前固件无法区分空杯与未接传感器；请升级固件后重新检测"
      };
    }
    var detail = waterSensorPresent === true ? "\u6C34\u91CF\u6B63\u5E38\uFF08".concat(Math.round(ml), " ml\uFF0C\u4F20\u611F\u5668\u5DF2\u63A5\u5165\uFF09") : "\u6C34\u91CF\u6B63\u5E38\uFF08".concat(Math.round(ml), " ml\uFF09");
    return {
      state: "ok",
      detail: detail
    };
  },
  _buildHeatPassiveResult: function _buildHeatPassiveResult(payload, frameCount, frameAge) {
    if (frameCount <= 0) {
      return {
        state: "fail",
        detail: "未收到加热状态回读"
      };
    }
    if (!payload) {
      return {
        state: "fail",
        detail: "\u52A0\u70ED\u72B6\u6001\u8D85\u65F6\uFF08".concat(formatAge(frameAge), "\uFF09")
      };
    }
    if (typeof payload.heaterOn !== "boolean") {
      return {
        state: "fail",
        detail: "加热状态字段缺失"
      };
    }
    return {
      state: "ok",
      detail: "\u72B6\u6001\u56DE\u8BFB\uFF1A".concat(payload.heaterOn ? "加热开启" : "加热关闭")
    };
  },
  _buildHeatPendingDetail: function _buildHeatPendingDetail(payload) {
    var config = resolveHeatConfirmConfig(payload);
    return "\u63A7\u5236\u94FE\u8DEF\u6B63\u5E38\uFF0C\u5F85\u786E\u8BA4\u6E29\u5347\u3002".concat(formatHeatWaterSource(config), "\uFF0C\u9884\u8BA1\u68C0\u6D4B ").concat(config.durationSec, "\u79D2\uFF0C\u70B9\u51FB\u5DE6\u4FA7\u6309\u94AE\u5F00\u59CB\u3002");
  },
  _buildHeatThermalCheckingDetail: function _buildHeatThermalCheckingDetail() {
    var selfTest = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    var durationSec = Math.max(1, Math.round(Number(selfTest.durationSec) || 0));
    var maxDelta = Math.max(0, Number(selfTest.maxDelta) || 0);
    var source = formatHeatWaterSource(selfTest);
    if (!Number.isFinite(Number(selfTest.baselineTemp))) {
      return "\u6E29\u5347\u786E\u8BA4\u51C6\u5907\u4E2D\u3002".concat(source, "\uFF0C\u9884\u8BA1\u68C0\u6D4B ").concat(durationSec, "\u79D2\uFF0C\u6B63\u5728\u8BFB\u53D6\u521D\u59CB\u6E29\u5EA6...");
    }
    if (!Number(selfTest.startedAt) || !Number(selfTest.endsAt)) {
      return "\u6E29\u5347\u786E\u8BA4\u51C6\u5907\u4E2D\u3002".concat(source, "\uFF0C\u9884\u8BA1\u68C0\u6D4B ").concat(durationSec, "\u79D2\uFF0C\u6B63\u5728\u5F00\u542F\u52A0\u70ED...");
    }
    var remainingSec = Math.max(0, Math.ceil((Number(selfTest.endsAt) - Date.now()) / 1000));
    return "\u6E29\u5347\u786E\u8BA4\u4E2D\u3002".concat(source, "\uFF0C\u52A0\u70ED\u5269\u4F59 ").concat(remainingSec, "\u79D2\uFF0C\u5F53\u524D\u6700\u5927\u6E29\u5347 \u0394T ").concat(maxDelta.toFixed(2), "\u2103\u3002");
  },
  _buildHeatRealtimeResult: function _buildHeatRealtimeResult(payload, frameCount, frameAge) {
    var passive = this._buildHeatPassiveResult(payload, frameCount, frameAge);
    var selfTest = this._heatSelfTest;
    if (!selfTest) return passive;
    if (passive.state === "fail" && selfTest.state !== "fail") {
      return passive;
    }
    if (selfTest.state === "checking" && selfTest.phase === "control") {
      return {
        state: "checking",
        detail: "".concat(passive.detail, "\uFF1B\u6B63\u5728\u68C0\u6D4B\u52A0\u70ED\u63A7\u5236\u94FE\u8DEF...")
      };
    }
    if (selfTest.state === "pending") {
      return {
        state: "pending",
        detail: "".concat(passive.detail, "\uFF1B").concat(this._buildHeatPendingDetail(payload)),
        actionVisible: true,
        actionDisabled: false,
        actionText: "开启加热判断温升"
      };
    }
    if (selfTest.state === "checking" && selfTest.phase === "thermal") {
      var remainingSec = Number(selfTest.endsAt) ? Math.max(0, Math.ceil((Number(selfTest.endsAt) - Date.now()) / 1000)) : 0;
      return {
        state: "checking",
        detail: "".concat(passive.detail, "\uFF1B").concat(this._buildHeatThermalCheckingDetail(selfTest)),
        actionVisible: true,
        actionDisabled: true,
        actionText: Number(selfTest.startedAt) ? "\u5269\u4F59 ".concat(remainingSec, "s") : "准备中"
      };
    }
    if (selfTest.state === "fail") {
      return {
        state: "fail",
        detail: selfTest.detail
      };
    }
    if (selfTest.state === "ok") {
      return {
        state: "ok",
        detail: selfTest.detail
      };
    }
    return passive;
  },
  _trackHeatRiseProgress: function _trackHeatRiseProgress(payload) {
    var selfTest = this._heatSelfTest;
    if (!selfTest || selfTest.state !== "checking" || selfTest.phase !== "thermal") return;
    var latestTemp = getValidTemperature(payload);
    var baselineTemp = Number(selfTest.baselineTemp);
    if (!Number.isFinite(latestTemp) || !Number.isFinite(baselineTemp)) return;
    var delta = latestTemp - baselineTemp;
    if (delta > Math.max(0, Number(selfTest.maxDelta) || 0)) {
      selfTest.maxDelta = delta;
    }
  },
  _waitForPredicate: function _waitForPredicate(predicate) {
    var timeoutMs = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 3000;
    var intervalMs = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 120;
    var abortWhen = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : null;
    return new Promise(function(resolve) {
      var start = Date.now();
      var tick = function tick() {
        if (typeof abortWhen === "function" && abortWhen()) {
          resolve(false);
          return;
        }
        var ok = false;
        try {
          ok = !!predicate();
        } catch (e) {
          ok = false;
        }
        if (ok) {
          resolve(true);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(tick, intervalMs);
      };
      tick();
    });
  },
  _runHeatControlCheck: function _runHeatControlCheck(deviceId, session) {
    var _this6 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee5() {
      var abortWhen, onSeen, offSeen, explained, detail;
      return _regeneratorRuntime2().wrap(function _callee5$(_context5) {
        while (1) switch (_context5.prev = _context5.next) {
          case 0:
            if (_this6._isSessionActive(session)) {
              _context5.next = 2;
              break;
            }
            return _context5.abrupt("return", {
              state: "idle",
              phase: "control",
              detail: "测试已取消"
            });
          case 2:
            abortWhen = function abortWhen() {
              return !_this6._isSessionActive(session);
            };
            _context5.prev = 3;
            _context5.next = 6;
            return ble.writeHeat(deviceId, true);
          case 6:
            _context5.next = 8;
            return _this6._waitForPredicate(function() {
              var latest = _this6._notifyStats && _this6._notifyStats.latest;
              return !!(latest && latest.heaterOn === true);
            }, HEAT_STATUS_ACK_TIMEOUT_MS, 120, abortWhen);
          case 8:
            onSeen = _context5.sent;
            _context5.next = 11;
            return ble.writeHeat(deviceId, false);
          case 11:
            if (!onSeen) {
              _context5.next = 17;
              break;
            }
            _context5.next = 14;
            return _this6._waitForPredicate(function() {
              var latest = _this6._notifyStats && _this6._notifyStats.latest;
              return !!(latest && latest.heaterOn === false);
            }, HEAT_STATUS_ACK_TIMEOUT_MS, 120, abortWhen);
          case 14:
            _context5.t0 = _context5.sent;
            _context5.next = 18;
            break;
          case 17:
            _context5.t0 = false;
          case 18:
            offSeen = _context5.t0;
            if (!abortWhen()) {
              _context5.next = 21;
              break;
            }
            return _context5.abrupt("return", {
              state: "idle",
              phase: "control",
              detail: "测试已取消"
            });
          case 21:
            if (!(onSeen && offSeen)) {
              _context5.next = 23;
              break;
            }
            return _context5.abrupt("return", {
              state: "pending",
              phase: "pending"
            });
          case 23:
            if (onSeen) {
              _context5.next = 25;
              break;
            }
            return _context5.abrupt("return", {
              state: "fail",
              phase: "control",
              detail: "发送加热开启指令后未收到开启回读"
            });
          case 25:
            return _context5.abrupt("return", {
              state: "fail",
              phase: "control",
              detail: "发送加热关闭指令后未收到关闭回读"
            });
          case 28:
            _context5.prev = 28;
            _context5.t1 = _context5["catch"](3);
            explained = ble.explainBleError ? ble.explainBleError(_context5.t1) : {};
            detail = explained && explained.text ? explained.text : "加热控制指令写入失败";
            return _context5.abrupt("return", {
              state: "fail",
              phase: "control",
              detail: detail
            });
          case 33:
            _context5.prev = 33;
            if (_this6._isSessionActive(session)) {
              ble.writeHeat(deviceId, false).catch(function() {});
            }
            return _context5.finish(33);
          case 36:
          case "end":
            return _context5.stop();
        }
      }, _callee5, null, [
        [3, 28, 33, 36]
      ]);
    }))();
  },
  startHeatRiseCheck: function startHeatRiseCheck() {
    var _this7 = this;
    var session = Number(this._diagSession || 0);
    var selfTest = this._heatSelfTest || {};
    var deviceId = String(this._activeDeviceId || "");
    if (!this._isSessionActive(session) || !deviceId) {
      wx.showToast({
        title: "请先连接设备",
        icon: "none"
      });
      return;
    }
    if (selfTest.state !== "pending") {
      if (selfTest.state === "checking" && selfTest.phase === "thermal") return;
      wx.showToast({
        title: "请先完成链路检测",
        icon: "none"
      });
      return;
    }
    var latest = this._notifyStats && this._notifyStats.latest;
    var config = resolveHeatConfirmConfig(latest);
    this._heatSelfTest = {
      state: "checking",
      phase: "thermal",
      waterMl: config.waterMl,
      usedDefaultWater: config.usedDefaultWater,
      durationSec: config.durationSec,
      baselineTemp: Number.NaN,
      maxDelta: 0,
      startedAt: 0,
      endsAt: 0
    };
    this._refreshRealtimeView();
    this._runHeatRiseCheck(deviceId, session, config).then(function(result) {
      if (!_this7._isSessionActive(session)) return;
      _this7._heatSelfTest = result;
      _this7._refreshRealtimeView();
    }).catch(function(error) {
      if (!_this7._isSessionActive(session)) return;
      console.error("[diagnostic] heat thermal confirm failed", error);
      _this7._heatSelfTest = {
        state: "fail",
        phase: "thermal",
        detail: "温升确认执行失败"
      };
      _this7._refreshRealtimeView();
    });
  },
  _runHeatRiseCheck: function _runHeatRiseCheck(deviceId, session, config) {
    var _this8 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee6() {
      var abortWhen, baselineReady, baselineTemp, onSeen, startedAt, maxDelta, offSeen, source, explained, detail;
      return _regeneratorRuntime2().wrap(function _callee6$(_context6) {
        while (1) switch (_context6.prev = _context6.next) {
          case 0:
            if (_this8._isSessionActive(session)) {
              _context6.next = 2;
              break;
            }
            return _context6.abrupt("return", {
              state: "idle",
              phase: "thermal",
              detail: "测试已取消"
            });
          case 2:
            abortWhen = function abortWhen() {
              return !_this8._isSessionActive(session);
            };
            ble.writeCommand(deviceId, [0x12]).catch(function() {});
            _context6.next = 6;
            return _this8._waitForPredicate(function() {
              var latest = _this8._notifyStats && _this8._notifyStats.latest;
              return Number.isFinite(getValidTemperature(latest));
            }, HEAT_THERMAL_BASELINE_TIMEOUT_MS, 120, abortWhen);
          case 6:
            baselineReady = _context6.sent;
            baselineTemp = getValidTemperature(_this8._notifyStats && _this8._notifyStats.latest);
            if (!(!baselineReady || !Number.isFinite(baselineTemp))) {
              _context6.next = 10;
              break;
            }
            return _context6.abrupt("return", {
              state: "fail",
              phase: "thermal",
              detail: "未收到有效温度回读，无法执行温升确认"
            });
          case 10:
            if (!(!_this8._isSessionActive(session) || !_this8._heatSelfTest || _this8._heatSelfTest.phase !== "thermal")) {
              _context6.next = 12;
              break;
            }
            return _context6.abrupt("return", {
              state: "idle",
              phase: "thermal",
              detail: "测试已取消"
            });
          case 12:
            _this8._heatSelfTest.baselineTemp = baselineTemp;
            _this8._heatSelfTest.maxDelta = 0;
            _this8._refreshRealtimeView();
            _context6.prev = 15;
            _context6.next = 18;
            return ble.writeHeat(deviceId, true);
          case 18:
            _context6.next = 20;
            return _this8._waitForPredicate(function() {
              var latest = _this8._notifyStats && _this8._notifyStats.latest;
              return !!(latest && latest.heaterOn === true);
            }, HEAT_STATUS_ACK_TIMEOUT_MS, 120, abortWhen);
          case 20:
            onSeen = _context6.sent;
            if (onSeen) {
              _context6.next = 23;
              break;
            }
            return _context6.abrupt("return", {
              state: "fail",
              phase: "thermal",
              detail: "温升确认开始后未收到加热开启回读"
            });
          case 23:
            startedAt = Date.now();
            if (_this8._heatSelfTest && _this8._heatSelfTest.phase === "thermal") {
              _this8._heatSelfTest.startedAt = startedAt;
              _this8._heatSelfTest.endsAt = startedAt + config.durationSec * 1000;
            }
            _this8._refreshRealtimeView();
            _context6.next = 28;
            return _this8._waitForPredicate(function() {
              var current = _this8._heatSelfTest;
              return !!(current && current.phase === "thermal" && Date.now() >= Number(current.endsAt));
            }, config.durationSec * 1000 + 1000, 200, abortWhen);
          case 28:
            if (!abortWhen()) {
              _context6.next = 30;
              break;
            }
            return _context6.abrupt("return", {
              state: "idle",
              phase: "thermal",
              detail: "测试已取消"
            });
          case 30:
            _this8._trackHeatRiseProgress(_this8._notifyStats && _this8._notifyStats.latest);
            maxDelta = Math.max(0, Number(_this8._heatSelfTest && _this8._heatSelfTest.maxDelta) || 0);
            _context6.next = 34;
            return ble.writeHeat(deviceId, false);
          case 34:
            _context6.next = 36;
            return _this8._waitForPredicate(function() {
              var latest = _this8._notifyStats && _this8._notifyStats.latest;
              return !!(latest && latest.heaterOn === false);
            }, HEAT_STATUS_ACK_TIMEOUT_MS, 120, abortWhen);
          case 36:
            offSeen = _context6.sent;
            if (!abortWhen()) {
              _context6.next = 39;
              break;
            }
            return _context6.abrupt("return", {
              state: "idle",
              phase: "thermal",
              detail: "测试已取消"
            });
          case 39:
            if (offSeen) {
              _context6.next = 41;
              break;
            }
            return _context6.abrupt("return", {
              state: "fail",
              phase: "thermal",
              detail: "温升确认结束后未收到加热关闭回读"
            });
          case 41:
            source = formatHeatWaterSource(config);
            if (!(maxDelta >= HEAT_THERMAL_CONFIRM_DELTA_C)) {
              _context6.next = 44;
              break;
            }
            return _context6.abrupt("return", {
              state: "ok",
              phase: "thermal",
              detail: "\u63A7\u5236\u94FE\u8DEF\u6B63\u5E38\uFF0C\u6E29\u5347\u786E\u8BA4\u901A\u8FC7\uFF08".concat(source, "\uFF0C\u52A0\u70ED ").concat(config.durationSec, "\u79D2\uFF0C\u6700\u5927 \u0394T ").concat(maxDelta.toFixed(2), "\u2103\uFF09")
            });
          case 44:
            return _context6.abrupt("return", {
              state: "fail",
              phase: "thermal",
              detail: "\u63A7\u5236\u94FE\u8DEF\u6B63\u5E38\uFF0C\u4F46 ".concat(source, " \u52A0\u70ED ").concat(config.durationSec, "\u79D2\u540E\u672A\u68C0\u6D4B\u5230\u6709\u6548\u6E29\u5347\uFF08\u6700\u5927 \u0394T ").concat(maxDelta.toFixed(2), "\u2103\uFF09\uFF0C\u7591\u4F3C\u52A0\u70ED\u786C\u4EF6\u5F02\u5E38")
            });
          case 47:
            _context6.prev = 47;
            _context6.t0 = _context6["catch"](15);
            explained = ble.explainBleError ? ble.explainBleError(_context6.t0) : {};
            detail = explained && explained.text ? explained.text : "温升确认期间加热指令写入失败";
            return _context6.abrupt("return", {
              state: "fail",
              phase: "thermal",
              detail: detail
            });
          case 52:
            _context6.prev = 52;
            if (_this8._isSessionActive(session)) {
              ble.writeHeat(deviceId, false).catch(function() {});
            }
            return _context6.finish(52);
          case 55:
          case "end":
            return _context6.stop();
        }
      }, _callee6, null, [
        [15, 47, 52, 55]
      ]);
    }))();
  }
});