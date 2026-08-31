require("../../@babel/runtime/helpers/Arrayincludes");
require("../../@babel/runtime/helpers/Objectvalues");
var _objectSpread2 = require("../../@babel/runtime/helpers/objectSpread2");
var _regeneratorRuntime2 = require("../../@babel/runtime/helpers/regeneratorRuntime");
var _asyncToGenerator2 = require("../../@babel/runtime/helpers/asyncToGenerator");
var ble = require("../../utils/ble");
var wxCompat = require("../../utils/wxCompat");
var registry = require("../../utils/deviceRegistry");
var petStore = require("../../utils/pet/petStore.js");
var RSSI_WARN_THRESHOLD = -85;
var RSSI_POLL_MS = 6000;
var RSSI_START_DELAY_MS = 3200;
var SCAN_AUTO_STOP_MS = 12000;
var DISCONNECT_CONFIRM_DELAY_MS = 450;
var DISCONNECT_CONFIRM_RETRY_MS = 380;
var DISCONNECT_IGNORE_IF_NOTIFY_WITHIN_MS = 2200;
var AUTO_RECONNECT_MIN_STABLE_MS = 15000;
var RECONNECT_BASE_DELAY_MS = 1200;
var RECONNECT_MAX_DELAY_MS = 10000;
var RECONNECT_MAX_ATTEMPTS = 6;
var FLAP_FAST_DISCONNECT_MS = 8000;
var FLAP_WINDOW_MS = 60000;
var FLAP_DISCONNECT_MIN_COUNT = 3;
var AUTO_RECONNECT_PAUSE_MS = 30000;
var LAST_TDS_KEY = "smartcup_last_tds_ppm";
var BOUND_DEVICES_KEY = "smartcup_bound_devices";
var normalizeName = registry.normalizeName;

function readDeviceName(device) {
  return String(device && (device.name || device.localName) || "").trim();
}

function formatRelativeTime(ts) {
  var n = Number(ts);
  if (!n || Number.isNaN(n)) return "未知时间";
  var diff = Date.now() - n;
  if (diff < 60 * 1000) {
    var date = new Date(n);
    var hours = date.getHours().toString().padStart(2, "0");
    var minutes = date.getMinutes().toString().padStart(2, "0");
    return "".concat(hours, ":").concat(minutes);
  }
  if (diff < 60 * 60 * 1000) return "".concat(Math.floor(diff / (60 * 1000)), " \u5206\u949F\u524D");
  if (diff < 24 * 60 * 60 * 1000) return "".concat(Math.floor(diff / (60 * 60 * 1000)), " \u5C0F\u65F6\u524D");
  return "".concat(Math.floor(diff / (24 * 60 * 60 * 1000)), " \u5929\u524D");
}
Page({
  data: {
    petOn: true,
    pageAnim: "",
    token: "",
    targetBleName: "",
    scanHint: "点击开始扫描",
    scanning: false,
    connecting: false,
    devices: [],
    pairedDevices: [],
    connected: false,
    connectedId: "",
    connectedName: "",
    firmwareVersion: "",
    temperature: "--",
    tds: "--",
    heaterOn: false,
    alarm: false,
    _autoConnecting: false
  },
  onLoad: function onLoad(options) {
    var _this = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee() {
      var token, target;
      return _regeneratorRuntime2().wrap(function _callee$(_context) {
        while (1) switch (_context.prev = _context.next) {
          case 0:
            _this._loadPairedDevices();
            token = decodeURIComponent(options && (options.scene || options.token) || "");
            _this.setData({
              token: token
            });
            if (token) {
              _context.next = 5;
              break;
            }
            return _context.abrupt("return");
          case 5:
            _context.next = 7;
            return _this._loadTargetByToken(token);
          case 7:
            target = _context.sent;
            _this.setData({
              targetBleName: target
            });
            _this.startScan();
          case 10:
          case "end":
            return _context.stop();
        }
      }, _callee);
    }))();
  },
  onShow: function onShow() {
    this._pageVisible = true;
    this._alive = true;
    this._fxFlip = !this._fxFlip;
    this.setData({ pageAnim: "fx-on" + (this._fxFlip ? "2" : "") });
    this._loadPairedDevices();
    this._bindBleAdapterState();
    this._bindBleState();
    this.setData({ petOn: petStore.isEnabled() });
    petStore.setPageVisible("device", true);
    /* 校正大脑里的连接真值，防止在别处断连后状态过期 */
    petStore.setConnectState(this.data.connected ? "connected" : "none");
    // 仅在未恢复过连接时同步，避免与 onLoad 的 startScan 重复触发 BLE 重连
    if (!this._connectionSynced) {
      this._connectionSynced = true;
      this._syncExistingConnectionState();
    }
  },
  onHide: function onHide() {
    this._pageVisible = false;
    this._alive = false;
    this.setData({ pageAnim: "fx-out" });
    petStore.setPageVisible("device", false);
    this._disconnectCheckToken = (this._disconnectCheckToken || 0) + 1;
    this._clearScanAutoStopTimer();
    this._clearTimeSyncTimer();
    this.stopScan();
    this._clearReconnectTimer();
    this._clearRssiTimer();
    this._clearNotifyHandler();
    this._unbindBleAdapterState();
    this._unbindBleState();
  },
  onUnload: function onUnload() {
    this._pageVisible = false;
    this._alive = false;
    petStore.setPageVisible("device", false);
    this._disconnectCheckToken = (this._disconnectCheckToken || 0) + 1;
    this._clearScanAutoStopTimer();
    this._clearTimeSyncTimer();
    this.stopScan();
    this._clearReconnectTimer();
    this._clearRssiTimer();
    this._clearNotifyHandler();
    this._unbindBleAdapterState();
    this._unbindBleState();
    // 淇濈暀 BLE 杩炴帴锛岄伩鍏锛岄伩鍏嶇寮€璁惧椤靛悗锛堝杩涘叆鍦板浉椤碉級琚姩鏂仈
  },



  _loadTargetByToken: function _loadTargetByToken(token) {
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee2() {
      return _regeneratorRuntime2().wrap(function _callee2$(_context2) {
        while (1) switch (_context2.prev = _context2.next) {
          case 0:
            return _context2.abrupt("return", "SmartCup-".concat(token));
          case 1:
          case "end":
            return _context2.stop();
        }
      }, _callee2);
    }))();
  },
  _readLastDevice: function _readLastDevice() {
    return registry.getLastDevice();
  },
  _clearReconnectTimer: function _clearReconnectTimer() {
    if (!this._reconnectTimer) return;
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = null;
  },
  _resetReconnectBackoff: function _resetReconnectBackoff() {
    this._reconnectAttempts = 0;
  },
  _nextReconnectDelay: function _nextReconnectDelay() {
    var attempts = Number(this._reconnectAttempts) || 0;
    var factor = Math.max(0, attempts - 1);
    var delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, factor);
    return Math.min(RECONNECT_MAX_DELAY_MS, delay);
  },
  _clearScanAutoStopTimer: function _clearScanAutoStopTimer() {
    if (!this._scanAutoStopTimer) return;
    clearTimeout(this._scanAutoStopTimer);
    this._scanAutoStopTimer = null;
  },
  _armScanAutoStopTimer: function _armScanAutoStopTimer() {
    var _this2 = this;
    this._clearScanAutoStopTimer();
    this._scanAutoStopTimer = setTimeout(function() {
      _this2._scanAutoStopTimer = null;
      if (!_this2.data.scanning || _this2.data.connected) return;
      _this2.stopScan();
    }, SCAN_AUTO_STOP_MS);
  },
  _clearTimeSyncTimer: function _clearTimeSyncTimer() {
    var list = Array.isArray(this._timeSyncTimers) ? this._timeSyncTimers : [];
    list.forEach(function(timer) {
      if (timer) clearTimeout(timer);
    });
    this._timeSyncTimers = [];
  },
  _schedulePhoneTimeSync: function _schedulePhoneTimeSync(deviceId) {
    var id = String(deviceId || "");
    if (!id) return;
    this._clearTimeSyncTimer();
    var delays = [0, 1200, 2600];
    this._timeSyncTimers = delays.map(function(delay) {
      return setTimeout(function() {
        ble.syncPhoneTime(id).catch(function(err) {
          console.warn("[BLE page time sync fail]", err);
        });
      }, delay);
    });
  },
  _isDeviceConnectedById: function _isDeviceConnectedById(deviceId) {
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee3() {
      var linked;
      return _regeneratorRuntime2().wrap(function _callee3$(_context3) {
        while (1) switch (_context3.prev = _context3.next) {
          case 0:
            if (deviceId) {
              _context3.next = 2;
              break;
            }
            return _context3.abrupt("return", false);
          case 2:
            if (!(typeof ble.isConnected === "function")) {
              _context3.next = 8;
              break;
            }
            _context3.next = 5;
            return ble.isConnected(deviceId).catch(function() {
              return false;
            });
          case 5:
            linked = _context3.sent;
            if (!linked) {
              _context3.next = 8;
              break;
            }
            return _context3.abrupt("return", true);
          case 8:
            return _context3.abrupt("return", new Promise(function(resolve) {
              if (!wx.getBLEDeviceServices) {
                resolve(false);
                return;
              }
              wx.getBLEDeviceServices({
                deviceId: deviceId,
                success: function success(res) {
                  var list = Array.isArray(res && res.services) ? res.services : [];
                  resolve(list.length > 0);
                },
                fail: function fail() {
                  return resolve(false);
                }
              });
            }));
          case 9:
          case "end":
            return _context3.stop();
        }
      }, _callee3);
    }))();
  },
  _scheduleAutoReconnect: function _scheduleAutoReconnect(deviceId, name) {
    var _this3 = this;
    if (!deviceId || this._manualDisconnect) return;
    if (!this._pageVisible) return;
    if (this.data.connected || this.data.connecting) return;
    var stableMs = Date.now() - Number(this._lastConnectedAtMs || 0);
    if (stableMs > 0 && stableMs < AUTO_RECONNECT_MIN_STABLE_MS) {
      this.setData({
        _autoConnecting: false,
        scanHint: "连接不稳定，请手动点击重连"
      });
      return;
    }
    var now = Date.now();
    if (now < Number(this._autoReconnectPausedUntil || 0)) {
      var seconds = Math.max(1, Math.ceil((this._autoReconnectPausedUntil - now) / 1000));
      this.setData({
        _autoConnecting: false,
        scanHint: "\u5DF2\u6682\u505C\u81EA\u52A8\u91CD\u8FDE\uFF0C\u8BF7\u5728 ".concat(seconds, " \u79D2\u540E\u91CD\u8BD5")
      });
      return;
    }
    var nextAttempts = (Number(this._reconnectAttempts) || 0) + 1;
    this._reconnectAttempts = nextAttempts;
    if (nextAttempts > RECONNECT_MAX_ATTEMPTS) {
      this._clearReconnectTimer();
      this.setData({
        _autoConnecting: false,
        scanHint: "自动重连失败，请手动重试"
      });
      return;
    }
    var delay = this._nextReconnectDelay();
    this._clearReconnectTimer();
    this._reconnectTimer = setTimeout(function() {
      _this3._reconnectTimer = null;
      if (_this3.data.connected || _this3.data.connecting) return;
      if (!_this3._pageVisible || _this3._manualDisconnect) return;
      _this3._connectById(deviceId, name, true);
    }, delay);
  },
  _handleConnectionLost: function _handleConnectionLost(deviceId, displayName) {
    var _this4 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee4() {
      var token, sinceNotifyMs, maybeAlive, firstCheck, secondCheck, connectedForMs, now, old, recent;
      return _regeneratorRuntime2().wrap(function _callee4$(_context4) {
        while (1) switch (_context4.prev = _context4.next) {
          case 0:
            if (!(!deviceId || _this4._manualDisconnect)) {
              _context4.next = 2;
              break;
            }
            return _context4.abrupt("return");
          case 2:
            token = (_this4._disconnectCheckToken || 0) + 1;
            _this4._disconnectCheckToken = token;
            sinceNotifyMs = Date.now() - Number(_this4._lastNotifyAtMs || 0);
            if (!(sinceNotifyMs >= 0 && sinceNotifyMs < DISCONNECT_IGNORE_IF_NOTIFY_WITHIN_MS)) {
              _context4.next = 11;
              break;
            }
            _context4.next = 8;
            return _this4._isDeviceConnectedById(deviceId);
          case 8:
            maybeAlive = _context4.sent;
            if (!(_this4._disconnectCheckToken !== token || maybeAlive)) {
              _context4.next = 11;
              break;
            }
            return _context4.abrupt("return");
          case 11:
            _context4.next = 13;
            return new Promise(function(resolve) {
              return setTimeout(resolve, DISCONNECT_CONFIRM_DELAY_MS);
            });
          case 13:
            if (!(_this4._disconnectCheckToken !== token)) {
              _context4.next = 15;
              break;
            }
            return _context4.abrupt("return");
          case 15:
            _context4.next = 17;
            return _this4._isDeviceConnectedById(deviceId);
          case 17:
            firstCheck = _context4.sent;
            if (!(_this4._disconnectCheckToken !== token || firstCheck)) {
              _context4.next = 20;
              break;
            }
            return _context4.abrupt("return");
          case 20:
            _context4.next = 22;
            return new Promise(function(resolve) {
              return setTimeout(resolve, DISCONNECT_CONFIRM_RETRY_MS);
            });
          case 22:
            if (!(_this4._disconnectCheckToken !== token)) {
              _context4.next = 24;
              break;
            }
            return _context4.abrupt("return");
          case 24:
            _context4.next = 26;
            return _this4._isDeviceConnectedById(deviceId);
          case 26:
            secondCheck = _context4.sent;
            if (!(_this4._disconnectCheckToken !== token || secondCheck)) {
              _context4.next = 29;
              break;
            }
            return _context4.abrupt("return");
          case 29:
            if (!(deviceId !== _this4.data.connectedId)) {
              _context4.next = 31;
              break;
            }
            return _context4.abrupt("return");
          case 31:
            if (!_this4._manualDisconnect) {
              _context4.next = 33;
              break;
            }
            return _context4.abrupt("return");
          case 33:
            connectedForMs = Date.now() - Number(_this4._lastConnectedAtMs || 0);
            if (connectedForMs > 0 && connectedForMs < FLAP_FAST_DISCONNECT_MS) {
              now = Date.now();
              old = Array.isArray(_this4._rapidDisconnectAtList) ? _this4._rapidDisconnectAtList : [];
              recent = old.filter(function(ts) {
                return now - Number(ts) < FLAP_WINDOW_MS;
              });
              recent.push(now);
              _this4._rapidDisconnectAtList = recent;
              if (recent.length >= FLAP_DISCONNECT_MIN_COUNT) {
                _this4._autoReconnectPausedUntil = now + AUTO_RECONNECT_PAUSE_MS;
              }
            }
            _this4._clearRssiTimer();
            _this4._clearNotifyHandler();
            _this4._lastConnectedAtMs = 0;
            _this4.setData({
              connected: false,
              connectedId: "",
              connectedName: "",
              temperature: "--",
              tds: "--",
              heaterOn: false,
              alarm: false,
              connecting: false,
              _autoConnecting: false,
              scanHint: "连接已断开，正在尝试重连..."
            });
            wx.showToast({
              title: "设备断开，尝试重连",
              icon: "none"
            });
            petStore.connectEvent("lost");
            _this4._scheduleAutoReconnect(deviceId, displayName);
          case 41:
          case "end":
            return _context4.stop();
        }
      }, _callee4);
    }))();
  },
  _getConnectedCupDevice: function _getConnectedCupDevice() {
    var _this5 = this;
    return new Promise(function(resolve) {
      if (!wx.getConnectedBluetoothDevices || !ble.SERVICE_UUID) {
        resolve(null);
        return;
      }
      var last = _this5._readLastDevice();
      wx.getConnectedBluetoothDevices({
        services: [ble.SERVICE_UUID],
        success: function success(res) {
          var list = Array.isArray(res && res.devices) ? res.devices : [];
          if (!list.length) {
            resolve(null);
            return;
          }
          if (last.id) {
            var matched = list.find(function(item) {
              return item && item.deviceId === last.id;
            });
            if (matched) {
              resolve(matched);
              return;
            }
          }
          resolve(list[0] || null);
        },
        fail: function fail() {
          return resolve(null);
        }
      });
    });
  },
  _syncExistingConnectionState: function _syncExistingConnectionState() {
    var _this6 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee5() {
      var current, deviceId, last, paired, displayName;
      return _regeneratorRuntime2().wrap(function _callee5$(_context5) {
        while (1) switch (_context5.prev = _context5.next) {
          case 0:
            _context5.next = 2;
            return _this6._getConnectedCupDevice();
          case 2:
            current = _context5.sent;
            if (!(!current || !current.deviceId)) {
              _context5.next = 5;
              break;
            }
            return _context5.abrupt("return", false);
          case 5:
            deviceId = current.deviceId;
            last = _this6._readLastDevice();
            paired = registry.getPairedDevice(deviceId);
            displayName = normalizeName(current.name || current.localName || _this6._findDeviceName(deviceId) || last.name);
            _context5.prev = 9;
            _context5.next = 12;
            return ble.connect(deviceId);
          case 12:
            _context5.next = 18;
            break;
          case 14:
            _context5.prev = 14;
            _context5.t0 = _context5["catch"](9);
            console.warn("[BLE restore prepare fail]", _context5.t0);
            return _context5.abrupt("return", false);
          case 18:
            _this6._clearReconnectTimer();
            _this6._resetReconnectBackoff();
            _this6._disconnectCheckToken = (_this6._disconnectCheckToken || 0) + 1;
            _this6._clearScanAutoStopTimer();
            _this6.setData({
              scanning: false,
              connecting: false,
              connected: true,
              connectedId: deviceId,
              connectedName: displayName,
              firmwareVersion: String(paired && paired.firmwareVersion || "").trim(),
              _autoConnecting: false
            });
            _this6._lastConnectedAtMs = Date.now();
            _this6._lastNotifyAtMs = Date.now();
            _this6._bindNotifyHandler(deviceId);
            _this6._startRssiWatch(deviceId);
            _this6._schedulePhoneTimeSync(deviceId);
            ble.writeCommand(deviceId, [0x12]).catch(function() {});
            _this6._syncDeviceProfile(deviceId, displayName).then(function() {
              _this6._bindCloudDevice(deviceId, displayName);
            }).catch(function() {});
            return _context5.abrupt("return", true);
          case 31:
          case "end":
            return _context5.stop();
        }
      }, _callee5, null, [
        [9, 14]
      ]);
    }))();
  },
  _setPairedDevicesData: function _setPairedDevicesData(list) {
    this.setData({
      pairedDevices: (list || []).map(function(item) {
        return _objectSpread2(_objectSpread2({}, item), {}, {
          lastSeenLabel: formatRelativeTime(item.lastSeenAt)
        });
      })
    });
  },
  _loadPairedDevices: function _loadPairedDevices() {
    var list = registry.getPairedDevices();
    this._pairedCache = list;
    this._setPairedDevicesData(list);
  },
  _savePairedDevices: function _savePairedDevices(list) {
    var normalized = registry.savePairedDevices(list);
    this._pairedCache = normalized;
    this._setPairedDevicesData(normalized);
  },
  _rememberPairedDevice: function _rememberPairedDevice(deviceId, name) {
    var id = String(deviceId || "");
    if (!id) return;
    var displayName = normalizeName(name);
    registry.upsertPairedDevice(id, {
      name: displayName,
      lastSeenAt: Date.now()
    });
    registry.setLastDevice(id, displayName);
    registry.setTrackedDeviceId(id);
    this._loadPairedDevices();
  },
  _bindCloudDevice: function _bindCloudDevice(deviceId, fallbackName) {
    var _this = this;
    if (!deviceId || !wx.cloud) return;
    var entry = registry.getPairedDevice(deviceId);
    var cloudDeviceId = entry && entry.cloudDeviceId || "";
    var imei = entry && entry.imei || "";
    var bindKey = cloudDeviceId || imei;
    if (!bindKey) return;
    this._cloudBound = this._cloudBound || {};
    if (this._cloudBound[deviceId]) return;
    this._cloudBound[deviceId] = true;
    var name = (entry && entry.name) || fallbackName || "SmartCup";
    wx.cloud.callFunction({
      name: "bindCup",
      data: {
        imei: bindKey,
        name: name
      },
      success: function success(res) {
        var result = res && res.result;
        if (result && result.ok) {
          _this._addLocalBoundDevice(bindKey, name);
        } else if (result && result.error) {
          console.warn("[bind] cloud bind failed:", result.error);
        }
      },
      fail: function fail(err) {
        console.warn("[bind] call failed", err);
      }
    });
  },
  _addLocalBoundDevice: function _addLocalBoundDevice(key, name) {
    try {
      var list = wx.getStorageSync(BOUND_DEVICES_KEY);
      list = Array.isArray(list) ? list : [];
      if (!list.some(function(d) {
        return d.token === key;
      })) {
        list.unshift({
          token: key,
          name: name || "SmartCup-".concat(String(key).slice(0, 6)),
          boundAt: Date.now()
        });
        wx.setStorageSync(BOUND_DEVICES_KEY, list);
      }
    } catch (e) {}
  },
  _syncDeviceProfile: function _syncDeviceProfile(deviceId, fallbackName) {
    var _this7 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee6() {
      var profile, cloudDeviceId, imei, bleName, displayName;
      return _regeneratorRuntime2().wrap(function _callee6$(_context6) {
        while (1) switch (_context6.prev = _context6.next) {
          case 0:
            if (deviceId) {
              _context6.next = 2;
              break;
            }
            return _context6.abrupt("return");
          case 2:
            _context6.prev = 2;
            _context6.next = 5;
            return ble.readDeviceProfile(deviceId, {
              retries: 4,
              delayMs: 900
            });
          case 5:
            profile = _context6.sent;
            if (profile) {
              _context6.next = 8;
              break;
            }
            return _context6.abrupt("return");
          case 8:
            cloudDeviceId = String(profile.deviceId || profile.imei || "").trim();
            imei = String(profile.imei || "").trim();
            bleName = normalizeName(profile.bleName || fallbackName);
            displayName = normalizeName(fallbackName || bleName);
            registry.upsertPairedDevice(deviceId, {
              name: displayName,
              lastSeenAt: Date.now(),
              cloudDeviceId: cloudDeviceId,
              imei: imei,
              bleName: bleName,
              firmwareVersion: String(profile.firmwareVersion || "").trim()
            });
            registry.setLastDevice(deviceId, displayName);
            registry.setTrackedDeviceId(deviceId);
            _this7._loadPairedDevices();
            if (_this7.data.connectedId === deviceId) {
              _this7.setData({
                firmwareVersion: String(profile.firmwareVersion || "").trim()
              });
            }
            _context6.next = 22;
            break;
          case 19:
            _context6.prev = 19;
            _context6.t0 = _context6["catch"](2);
            console.warn("[BLE profile sync fail]", _context6.t0);
          case 22:
          case "end":
            return _context6.stop();
        }
      }, _callee6, null, [
        [2, 19]
      ]);
    }))();
  },
  startScan: function startScan() {
    var _this8 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee7() {
      var restored;
      return _regeneratorRuntime2().wrap(function _callee7$(_context7) {
        while (1) switch (_context7.prev = _context7.next) {
          case 0:
            if (!(_this8.data.scanning || _this8.data.connecting)) {
              _context7.next = 2;
              break;
            }
            return _context7.abrupt("return");
          case 2:
            _context7.next = 4;
            return _this8._syncExistingConnectionState();
          case 4:
            restored = _context7.sent;
            if (!(restored && _this8.data.connected)) {
              _context7.next = 8;
              break;
            }
            wx.showToast({
              title: "设备已连接",
              icon: "none"
            });
            return _context7.abrupt("return");
          case 8:
            _context7.prev = 8;
            _this8._clearScanAutoStopTimer();
            _this8.setData({
              scanning: true,
              devices: [],
              scanHint: "正在初始化蓝牙..."
            });
            petStore.taskStart("scan", 30000);
            _context7.next = 13;
            return _this8._ensureScanPrerequisites();
          case 13:
            _this8._deviceMap = {};
            _context7.next = 16;
            return ble.stopScan().catch(function() {});
          case 16:
            _context7.next = 18;
            return ble.init();
          case 18:
            _this8.setData({
              scanHint: "蓝牙已就绪，开始搜索设备..."
            });
            if (!_this8.isDeviceFoundBound) {
              _this8.isDeviceFoundBound = true;
              ble.onDeviceFound(function(list) {
                return _this8._handleFoundDevices(list);
              });
            }
            _context7.next = 22;
            return ble.startScan({
              useServiceFilter: false
            });
          case 22:
            _this8._armScanAutoStopTimer();
            _this8.setData({
              scanHint: "正在搜索附近设备..."
            });
            _context7.next = 31;
            break;
          case 26:
            _context7.prev = 26;
            _context7.t0 = _context7["catch"](8);
            _this8._clearScanAutoStopTimer();
            _this8._handleBleError(_context7.t0, "扫描失败");
            _this8.setData({
              scanning: false,
              _autoConnecting: false
            });
            petStore.taskDone();
          case 31:
          case "end":
            return _context7.stop();
        }
      }, _callee7, null, [
        [8, 26]
      ]);
    }))();
  },
  _handleFoundDevices: function _handleFoundDevices(list) {
    var _this9 = this;
    var target = normalizeName(this.data.targetBleName || "").toLowerCase();
    var map = this._deviceMap || {};
    (list || []).forEach(function(dev) {
      if (!dev || !dev.deviceId) return;
      map[dev.deviceId] = _objectSpread2(_objectSpread2({}, map[dev.deviceId]), dev);
    });
    this._deviceMap = map;

    // 节流：200ms 内只 setData 一次，避免高频 BLE 回调阻塞 UI
    if (this._scanFlushTimer) return;
    this._scanFlushTimer = setTimeout(function() {
      _this9._scanFlushTimer = null;
      _this9._flushScanDevices(target);
    }, 200);
  },
  _flushScanDevices: function _flushScanDevices(target) {
    if (!this._alive && !this._pageVisible) return;
    var map = this._deviceMap || {};

    // 浼樺寲锛氬垱寤哄寘鍚鑼冨寲鍚嶇О鐨勫璞★紝閬垮厤閲嶅璁＄畻
    var devicesWithName = Object.values(map).map(function(dev) {
      var rawName = readDeviceName(dev);
      var lowerName = rawName.toLowerCase();
      return {
        device: _objectSpread2(_objectSpread2({}, dev), {}, {
          name: rawName || dev.name || dev.localName || ""
        }),
        name: rawName,
        lowerName: lowerName,
        hasSmartCup: lowerName.includes("smartcup"),
        rssi: Number(dev.RSSI) || -999
      };
    });
    var smartCupDevices = devicesWithName.filter(function(item) {
      return item.hasSmartCup;
    });
    if (target && target !== "smartcup") {
      var matched = smartCupDevices.filter(function(item) {
        return item.lowerName.includes(target);
      });
      devicesWithName = matched.length ? matched : smartCupDevices;
    } else {
      devicesWithName = smartCupDevices;
    }

    // 鎺掑簭璁惧
    devicesWithName.sort(function(a, b) {
      // 鍏堟寜鏄惁鍖呭惈 SmartCup 鎺掑簭
      if (a.hasSmartCup !== b.hasSmartCup) {
        return a.hasSmartCup ? -1 : 1;
      }
      // 鍐嶆寜 RSSI 寮哄害鎺掑簭
      return b.rssi - a.rssi;
    });
    var devices = devicesWithName.map(function(item) {
      return item.device;
    });
    this.setData({
      devices: devices,
      scanHint: devices.length ? "\u5DF2\u53D1\u73B0 ".concat(devices.length, " \u4E2A SmartCup \u8BBE\u5907") : "正在搜索附近 SmartCup 设备..."
    });
    if (this.data.targetBleName && !this.data.connected && !this.data.connecting && !this.data._autoConnecting && devices.length) {
      var d = devices[0];
      this.setData({
        _autoConnecting: true
      });
      this._connectById(d.deviceId, d.name || d.localName, true);
    }
  },
  stopScan: function stopScan() {
    var _this10 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee8() {
      return _regeneratorRuntime2().wrap(function _callee8$(_context8) {
        while (1) switch (_context8.prev = _context8.next) {
          case 0:
            _this10._clearScanAutoStopTimer();
            if (_this10.data.scanning) {
              _context8.next = 3;
              break;
            }
            return _context8.abrupt("return");
          case 3:
            _context8.next = 5;
            return ble.stopScan().catch(function() {});
          case 5:
            _this10.setData({
              scanning: false,
              scanHint: "扫描已停止"
            });
            petStore.taskDone();
          case 6:
          case "end":
            return _context8.stop();
        }
      }, _callee8);
    }))();
  },
  connect: function connect(e) {
    var deviceId = e.currentTarget.dataset.id;
    var name = e.currentTarget.dataset.name;
    this._connectById(deviceId, name, false);
  },
  connectPaired: function connectPaired(e) {
    var deviceId = e.currentTarget.dataset.id;
    var name = e.currentTarget.dataset.name;
    this._connectById(deviceId, name, false);
  },
  _connectById: function _connectById(deviceId, name, auto) {
    var _this11 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee9() {
      var prevId, displayName, info, errorMessage, retryName;
      return _regeneratorRuntime2().wrap(function _callee9$(_context9) {
        while (1) switch (_context9.prev = _context9.next) {
          case 0:
            if (deviceId) {
              _context9.next = 2;
              break;
            }
            return _context9.abrupt("return");
          case 2:
            if (!_this11.data.connecting) {
              _context9.next = 4;
              break;
            }
            return _context9.abrupt("return");
          case 4:
            if (!(_this11.data.connected && _this11.data.connectedId === deviceId)) {
              _context9.next = 8;
              break;
            }
            _this11.setData({
              _autoConnecting: false
            });
            wx.showToast({
              title: "设备已连接",
              icon: "none"
            });
            return _context9.abrupt("return");
          case 8:
            _this11.setData({
              connecting: true,
              _autoConnecting: !!auto
            });
            petStore.taskStart("handshake", 30000);
            _this11._manualDisconnect = false;
            _this11._disconnectCheckToken = (_this11._disconnectCheckToken || 0) + 1;
            _this11._clearReconnectTimer();
            if (!auto) {
              _this11._resetReconnectBackoff();
              _this11._autoReconnectPausedUntil = 0;
              _this11._rapidDisconnectAtList = [];
            }
            _context9.next = 15;
            return _this11.stopScan();
          case 15:
            wx.showLoading({
              title: "连接中..."
            });
            _context9.prev = 16;
            _context9.next = 19;
            return _this11._ensureScanPrerequisites();
          case 19:
            if (!(_this11.data.connectedId && _this11.data.connectedId !== deviceId)) {
              _context9.next = 24;
              break;
            }
            prevId = _this11.data.connectedId;
            _this11.setData({
              connected: false,
              connectedId: "",
              connectedName: "",
              firmwareVersion: "",
              heaterOn: false,
              alarm: false
            });
            _context9.next = 24;
            return ble.disconnect(prevId).catch(function() {});
          case 24:
            _this11._clearRssiTimer();
            _this11._clearNotifyHandler();
            _context9.next = 28;
            return ble.init();
          case 28:
            _context9.next = 30;
            return ble.connect(deviceId);
          case 30:
            displayName = normalizeName(name || _this11._findDeviceName(deviceId));
            _this11._rememberPairedDevice(deviceId, displayName);
            _this11.setData({
              connected: true,
              connectedId: deviceId,
              connectedName: displayName,
              firmwareVersion: String((registry.getPairedDevice(deviceId) || {}).firmwareVersion || "").trim(),
              connecting: false,
              _autoConnecting: false,
              scanHint: "设备已连接",
              temperature: "--",
              tds: "--",
              alarm: false
            });
            _this11._lastConnectedAtMs = Date.now();
            _this11._lastNotifyAtMs = Date.now();
            _this11._resetReconnectBackoff();
            _this11._bindNotifyHandler(deviceId);
            petStore.taskDone();
            petStore.connectEvent("connected");
            _this11._startRssiWatch(deviceId);
            _this11._schedulePhoneTimeSync(deviceId);
            ble.writeCommand(deviceId, [0x12]).catch(function() {});
            this._syncDeviceProfile(deviceId, displayName).then(function() {
              _this11._bindCloudDevice(deviceId, displayName);
            }).catch(function() {});
            wx.hideLoading();
            wx.showToast({
              title: "连接成功",
              icon: "success"
            });
            _context9.next = 77;
            break;
          case 45:
            _context9.prev = 45;
            _context9.t0 = _context9["catch"](16);
            wx.hideLoading();
            console.error("[BLE 杩炴帴閿欒]", _context9.t0);

            // 璇︾粏鐨勯敊璇被鍨嬪垽鏂拰澶勭悊
            info = ble.explainBleError(_context9.t0);
            errorMessage = "连接失败";
            _context9.t1 = info.code;
            _context9.next = _context9.t1 === 10000 ? 54 : _context9.t1 === 10001 ? 56 : _context9.t1 === 10002 ? 58 : _context9.t1 === 10003 ? 60 : _context9.t1 === 10012 ? 62 : _context9.t1 === 10004 ? 64 : _context9.t1 === 10005 ? 66 : _context9.t1 === 10006 ? 68 : _context9.t1 === 10013 ? 70 : 72;
            break;
          case 54:
            errorMessage = "蓝牙未初始化";
            return _context9.abrupt("break", 73);
          case 56:
            errorMessage = "蓝牙不可用，请先开启蓝牙";
            return _context9.abrupt("break", 73);
          case 58:
            errorMessage = "蓝牙权限不足";
            return _context9.abrupt("break", 73);
          case 60:
            errorMessage = /status:8/i.test(String(info.msg || "")) ? "连接失败，请重启开发板后重试" : "连接失败";
            return _context9.abrupt("break", 73);
          case 62:
            errorMessage = "连接超时，请靠近设备后重试";
            return _context9.abrupt("break", 73);
          case 64:
            errorMessage = "未找到服务";
            return _context9.abrupt("break", 73);
          case 66:
            errorMessage = "未找到特征值";
            return _context9.abrupt("break", 73);
          case 68:
            errorMessage = "连接已断开";
            return _context9.abrupt("break", 73);
          case 70:
            errorMessage = "需要定位权限";
            return _context9.abrupt("break", 73);
          case 72:
            errorMessage = "\u8FDE\u63A5\u5931\u8D25\uFF1A".concat(info.text || "未知错误");
          case 73:
            wx.showToast({
              title: errorMessage,
              icon: "none",
              duration: 2500
            });
            _this11.setData({
              connecting: false,
              _autoConnecting: false,
              scanHint: info.code !== null ? "".concat(errorMessage, " (").concat(info.code, ")") : errorMessage
            });
            petStore.taskDone();
            petStore.connectEvent("fail");
            if (auto && !_this11._manualDisconnect && info.code !== 10001 && info.code !== 10013 && info.code !== 10002) {
              retryName = normalizeName(name || _this11._findDeviceName(deviceId));
              _this11._scheduleAutoReconnect(deviceId, retryName);
            }

            // 閽堝鐗瑰畾閿欒鐨勫鐞?
            if (info.code === 10001) {
              setTimeout(function() {
                wx.showModal({
                  title: "蓝牙未开启",
                  content: "请在系统设置中打开蓝牙后重试。",
                  confirmText: "去设置",
                  success: function success(res) {
                    if (res.confirm) {
                      _this11._openBluetoothSystemSetting();
                    }
                  }
                });
              }, 1000);
            } else if (info.code === 10013) {
              setTimeout(function() {
                wx.showModal({
                  title: "需要定位权限",
                  content: "Android 扫描蓝牙需要定位权限，请授权后重试。",
                  confirmText: "去授权",
                  success: function success(res) {
                    if (res.confirm && wx.openSetting) {
                      wx.openSetting({});
                    }
                  }
                });
              }, 1000);
            }
          case 77:
          case "end":
            return _context9.stop();
        }
      }, _callee9, null, [
        [16, 45]
      ]);
    }))();
  },
  _findDeviceName: function _findDeviceName(deviceId) {
    var fromScan = (this.data.devices || []).find(function(d) {
      return d.deviceId === deviceId;
    });
    if (fromScan) return fromScan.name || fromScan.localName || "";
    var fromPaired = (this.data.pairedDevices || []).find(function(d) {
      return d.id === deviceId;
    });
    return fromPaired ? fromPaired.name : "";
  },
  _bindNotifyHandler: function _bindNotifyHandler(deviceId) {
    var _this12 = this;
    this._clearNotifyHandler();
    this._notifyOff = ble.onNotifyParsed(deviceId, function(payload) {
      if (deviceId !== _this12.data.connectedId) return;
      _this12._lastNotifyAtMs = Date.now();
      var tdsNum = Number(payload && payload.tds);
      var hasValidTds = payload && payload.tdsSensorPresent === true && payload.tdsValid === true && Number.isFinite(tdsNum);
      if (hasValidTds) {
        wx.setStorageSync(LAST_TDS_KEY, Math.max(0, Math.round(tdsNum)));
      }
      var tempRaw = payload && payload.temperature;
      var tempNum = Number(tempRaw);
      var hasValidTemp = payload && payload.temperatureValid !== false && Number.isFinite(tempNum);
      _this12.setData({
        temperature: hasValidTemp ? tempNum : 20.60,
        tds: hasValidTds ? Math.max(0, Math.round(tdsNum)) : "--",
        heaterOn: !!payload.heaterOn
      });
    });
  },
  _clearNotifyHandler: function _clearNotifyHandler() {
    if (typeof this._notifyOff === "function") {
      this._notifyOff();
    }
    this._notifyOff = null;
    this._lastNotifyAtMs = 0;
  },
  _startRssiWatch: function _startRssiWatch(deviceId) {
    var _this13 = this;
    this._clearRssiTimer();
    var tick = /*#__PURE__*/ function() {
      var _ref2 = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee10() {
        var rssi, nextAlarm;
        return _regeneratorRuntime2().wrap(function _callee10$(_context10) {
          while (1) switch (_context10.prev = _context10.next) {
            case 0:
              if (!_this13._rssiBusy) {
                _context10.next = 2;
                break;
              }
              return _context10.abrupt("return");
            case 2:
              if (!(!_this13._pageVisible || _this13.data.connecting)) {
                _context10.next = 4;
                break;
              }
              return _context10.abrupt("return");
            case 4:
              if (!(_this13.data.connectedId !== deviceId)) {
                _context10.next = 6;
                break;
              }
              return _context10.abrupt("return");
            case 6:
              _this13._rssiBusy = true;
              _context10.prev = 7;
              _context10.next = 10;
              return ble.getRSSI(deviceId).catch(function() {
                return null;
              });
            case 10:
              rssi = _context10.sent;
              if (_this13._alive) {
                _context10.next = 13;
                break;
              }
              return _context10.abrupt("return");
            case 13:
              if (!(typeof rssi !== "number")) {
                _context10.next = 15;
                break;
              }
              return _context10.abrupt("return");
            case 15:
              // 仅在状态变化时 setData，避免高频轮询无意义刷新
              nextAlarm = rssi < RSSI_WARN_THRESHOLD;
              if (nextAlarm !== _this13.data.alarm) {
                _this13.setData({
                  alarm: nextAlarm
                });
              }
            case 17:
              _context10.prev = 17;
              _this13._rssiBusy = false;
              return _context10.finish(17);
            case 20:
            case "end":
              return _context10.stop();
          }
        }, _callee10, null, [
          [7, , 17, 20]
        ]);
      }));
      return function tick() {
        return _ref2.apply(this, arguments);
      };
    }();
    this._rssiStartTimer = setTimeout(function() {
      _this13._rssiStartTimer = null;
      tick();
      _this13._rssiTimer = setInterval(tick, RSSI_POLL_MS);
    }, RSSI_START_DELAY_MS);
  },
  _clearRssiTimer: function _clearRssiTimer() {
    if (this._rssiStartTimer) {
      clearTimeout(this._rssiStartTimer);
      this._rssiStartTimer = null;
    }
    if (this._rssiTimer) {
      clearInterval(this._rssiTimer);
      this._rssiTimer = null;
    }
    this._rssiBusy = false;
  },
  disconnect: function disconnect() {
    var _this14 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee11() {
      var id;
      return _regeneratorRuntime2().wrap(function _callee11$(_context11) {
        while (1) switch (_context11.prev = _context11.next) {
          case 0:
            id = _this14.data.connectedId;
            _this14._manualDisconnect = true;
            _this14._disconnectCheckToken = (_this14._disconnectCheckToken || 0) + 1;
            _this14._clearReconnectTimer();
            _this14._clearTimeSyncTimer();
            _this14._resetReconnectBackoff();
            _this14._clearRssiTimer();
            _this14._clearNotifyHandler();
            _this14._lastConnectedAtMs = 0;
            _this14.setData({
              connected: false,
              connectedId: "",
              connectedName: "",
              firmwareVersion: "",
              temperature: "--",
              tds: "--",
              heaterOn: false,
              alarm: false,
              connecting: false,
              _autoConnecting: false,
              scanHint: "连接已断开，可重新扫描"
            });
            petStore.connectEvent("closed");
            if (!id) {
              _context11.next = 13;
              break;
            }
            _context11.next = 13;
            return ble.disconnect(id).catch(function() {});
          case 13:
            setTimeout(function() {
              _this14._manualDisconnect = false;
            }, 300);
            wx.showToast({
              title: "连接已断开",
              icon: "none"
            });
          case 15:
          case "end":
            return _context11.stop();
        }
      }, _callee11);
    }))();
  },
  _ensureScanPrerequisites: function _ensureScanPrerequisites() {
    var _this15 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee12() {
      var sys, platform;
      return _regeneratorRuntime2().wrap(function _callee12$(_context12) {
        while (1) switch (_context12.prev = _context12.next) {
          case 0:
            sys = wxCompat.getLayoutMetrics();
            platform = String(sys.platform || "").toLowerCase();
            if (!(platform === "android")) {
              _context12.next = 5;
              break;
            }
            _context12.next = 5;
            return _this15._ensureAndroidLocationForBle();
          case 5:
          case "end":
            return _context12.stop();
        }
      }, _callee12);
    }))();
  },
  _ensureAndroidLocationForBle: function _ensureAndroidLocationForBle() {
    return new Promise(function(resolve, reject) {
      if (!wx.getSetting || !wx.authorize) {
        resolve();
        return;
      }
      wx.getSetting({
        success: function success(res) {
          var hasAuth = !!(res.authSetting && res.authSetting["scope.userLocation"]);
          if (hasAuth) {
            resolve();
            return;
          }
          wx.authorize({
            scope: "scope.userLocation",
            success: resolve,
            fail: function fail() {
              return reject({
                errCode: 10013,
                errMsg: "need location permission for BLE scan"
              });
            }
          });
        },
        fail: function fail() {
          return resolve();
        }
      });
    });
  },
  _bindBleAdapterState: function _bindBleAdapterState() {
    var _this16 = this;
    if (this.isAdapterStateBound || !wx.onBluetoothAdapterStateChange) return;
    this.isAdapterStateBound = true;
    this._onAdapterStateChange = function(res) {
      if (!res || typeof res.available !== "boolean") return;
      if (res.available) return;
      _this16.stopScan();
      _this16._disconnectCheckToken = (_this16._disconnectCheckToken || 0) + 1;
      _this16._clearReconnectTimer();
      _this16._resetReconnectBackoff();
      _this16._clearRssiTimer();
      _this16._clearNotifyHandler();
      _this16._lastConnectedAtMs = 0;
      _this16.setData({
        scanning: false,
        connecting: false,
        connected: false,
        connectedId: "",
        connectedName: "",
        alarm: false,
        _autoConnecting: false,
        scanHint: "蓝牙已关闭，请先在系统设置中打开蓝牙"
      });
      petStore.connectEvent("restricted");
    };
    wx.onBluetoothAdapterStateChange(this._onAdapterStateChange);
  },
  _unbindBleAdapterState: function _unbindBleAdapterState() {
    if (!this.isAdapterStateBound || !wx.offBluetoothAdapterStateChange) return;
    wx.offBluetoothAdapterStateChange(this._onAdapterStateChange);
    this.isAdapterStateBound = false;
    this._onAdapterStateChange = null;
  },
  _bindBleState: function _bindBleState() {
    var _this17 = this;
    if (this.isBleStateBound || !wx.onBLEConnectionStateChange) return;
    this.isBleStateBound = true;
    this._onBleConnectionChange = /*#__PURE__*/ function() {
      var _ref3 = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee13(res) {
        var lostId, stillConnected, lostName;
        return _regeneratorRuntime2().wrap(function _callee13$(_context13) {
          while (1) switch (_context13.prev = _context13.next) {
            case 0:
              if (!(!res || !res.deviceId || res.connected)) {
                _context13.next = 2;
                break;
              }
              return _context13.abrupt("return");
            case 2:
              if (!(res.deviceId !== _this17.data.connectedId)) {
                _context13.next = 4;
                break;
              }
              return _context13.abrupt("return");
            case 4:
              if (!_this17.data.connecting) {
                _context13.next = 6;
                break;
              }
              return _context13.abrupt("return");
            case 6:
              if (!_this17._manualDisconnect) {
                _context13.next = 9;
                break;
              }
              _this17._manualDisconnect = false;
              return _context13.abrupt("return");
            case 9:
              lostId = res.deviceId;
              _context13.next = 12;
              return new Promise(function(resolve) {
                return setTimeout(resolve, DISCONNECT_CONFIRM_DELAY_MS);
              });
            case 12:
              if (!(lostId !== _this17.data.connectedId)) {
                _context13.next = 14;
                break;
              }
              return _context13.abrupt("return");
            case 14:
              _context13.next = 16;
              return _this17._isDeviceConnectedById(lostId);
            case 16:
              stillConnected = _context13.sent;
              if (!stillConnected) {
                _context13.next = 19;
                break;
              }
              return _context13.abrupt("return");
            case 19:
              if (!(lostId !== _this17.data.connectedId)) {
                _context13.next = 21;
                break;
              }
              return _context13.abrupt("return");
            case 21:
              lostName = _this17.data.connectedName || _this17._findDeviceName(lostId);
              _this17._handleConnectionLost(lostId, lostName);
            case 23:
            case "end":
              return _context13.stop();
          }
        }, _callee13);
      }));
      return function(_x) {
        return _ref3.apply(this, arguments);
      };
    }();
    wx.onBLEConnectionStateChange(this._onBleConnectionChange);
  },
  _unbindBleState: function _unbindBleState() {
    if (!this.isBleStateBound || !wx.offBLEConnectionStateChange) return;
    wx.offBLEConnectionStateChange(this._onBleConnectionChange);
    this.isBleStateBound = false;
    this._onBleConnectionChange = null;
  },
  _openBluetoothSystemSetting: function _openBluetoothSystemSetting() {
    if (!wx.openSystemBluetoothSetting) return;
    wx.openSystemBluetoothSetting({
      fail: function fail() {}
    });
  },
  _handleBleError: function _handleBleError(err, actionText) {
    var _this18 = this;
    var info = ble.explainBleError(err);
    var codeText = info.code === null ? "" : "(".concat(info.code, ")");
    var tip = "".concat(actionText, ": ").concat(info.text).concat(codeText);
    console.error("[BLE ERROR]", err);
    this.setData({
      scanHint: tip
    });
    wx.showToast({
      title: tip,
      icon: "none",
      duration: 2200
    });
    if (info.code === 10001) {
      wx.showModal({
        title: "蓝牙不可用",
        content: "请先在系统设置里开启蓝牙，然后回到小程序重试。",
        confirmText: "去设置",
        success: function success(res) {
          if (res.confirm) _this18._openBluetoothSystemSetting();
        }
      });
      return;
    }
    if (info.code === 10013) {
      wx.showModal({
        title: "需要定位权限",
        content: "Android 扫描蓝牙通常需要定位权限，请授权后重试。",
        confirmText: "去授权",
        success: function success(res) {
          if (!res.confirm || !wx.openSetting) return;
          wx.openSetting({});
        }
      });
    }
  }
});