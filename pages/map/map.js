var _regeneratorRuntime2 = require("../../@babel/runtime/helpers/regeneratorRuntime");
var _asyncToGenerator2 = require("../../@babel/runtime/helpers/asyncToGenerator");
var _typeof2 = require("../../@babel/runtime/helpers/typeof");
var _objectSpread2 = require("../../@babel/runtime/helpers/objectSpread2");
var DEFAULT_CENTER = {
  latitude: 39.9087,
  longitude: 116.3975
};
var DEFAULT_SCALE = 17;
var MAX_SCALE = 20;
var MAP_SKEW = 0;
var POI_ICON = "../../images/markers/poi.png";
var POI_MARKER_BASE_ID = 1000;
var POI_LIMIT = 3;
var LOCAL_BLE_POLL_MS = 5000;
var LOCATION_SMOOTH_FACTOR = 0.28;
var LOCATION_JITTER_METERS = 2;
var LOCATION_STOP_METERS = 0.4;
var GPS_STALE_MS = 15000;
var CLOUD_POLL_MS = 15000;
var CLOUD_STALE_MS = 180000;
var PHONE_LOCATION_STALE_MS = 10000;
var GEO_MIN_INTERVAL_MS = 15000;
var GEO_MIN_DISTANCE_METERS = 500;
var FRESH_WINDOW_MS = 180000;
var MAP_ROTATE_THRESHOLD_DEG = 0.5;
var ble = require("../../utils/ble");
var registry = require("../../utils/deviceRegistry");
var locationSettings = require("../../utils/locationSettings");
var petStore = require("../../utils/pet/petStore.js");
var petEvents = require("../../utils/pet/petEvents.js");

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function trackedDeviceHint(entry) {
  var cloudId = registry.getCloudDeviceIdForEntry(entry);
  if (!cloudId) return "连接蓝牙后自动同步";
  return "IMEI ".concat(cloudId);
}

function trackedDeviceBadge(entry) {
  var cloudId = registry.getCloudDeviceIdForEntry(entry);
  if (!cloudId) return "未同步";
  return "\u5C3E\u53F7 ".concat(cloudId.slice(-6));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeMapRotate(value) {
  var numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  var normalized = numeric % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function getLayoutMetrics() {
  var info = typeof wx.getWindowInfo === "function" ? wx.getWindowInfo() : { windowHeight: 667, statusBarHeight: 0, safeArea: { top: 0 } };
  var statusBarHeight = Number(info && info.statusBarHeight) || 0;
  var safeTop = Number(info && info.safeArea && info.safeArea.top) || statusBarHeight;
  var topPadding = Math.max(safeTop, statusBarHeight) + 10;
  return {
    pageTopPx: topPadding
  };
}

function freshnessOf(fixAt) {
  var at = Number(fixAt) || 0;
  if (!at) return { percent: 0, label: "" };
  var age = Math.max(0, Date.now() - at);
  var percent = Math.round(clamp(1 - age / FRESH_WINDOW_MS, 0, 1) * 100);
  var label;
  if (age < 45000) {
    label = "刚刚更新";
  } else if (age < 3600000) {
    label = Math.round(age / 60000) + "分钟前更新";
  } else if (age < 86400000) {
    label = Math.round(age / 3600000) + "小时前的位置";
  } else {
    label = "很久前的记录";
  }
  return { percent: percent, label: label };
}

function hasCupLocation(state) {
  var lat = state && state.cupLatitude;
  var lng = state && state.cupLongitude;
  return lat !== null && lat !== undefined && lng !== null && lng !== undefined;
}

function buildMapViewState(state) {
  var locationMode = state && state.locationMode === "phone" ? "phone" : "gps";
  var deviceBleConnected = !!(state && state.deviceBleConnected);
  var cupConnected = !!(state && state.cupConnected);
  var bleMode = !!(state && state.bleMode);
  var hasLocation = hasCupLocation(state);
  var trackedDeviceId = String(state && state.trackedDeviceId || "").trim();
  var trackedDeviceName = String(state && state.trackedDeviceName || "").trim() || "未选择水杯";
  var cupAddressLoading = !!(state && state.cupAddressLoading);
  var cupAddressDetail = String(state && state.cupAddressDetail || "").trim();
  var summaryStatusText = "暂无位置";
  if (locationMode === "phone") {
    summaryStatusText = deviceBleConnected ? hasLocation ? "已获取手机位置" : "等待手机定位" : "未连接，仅可用GPS";
  } else if (cupConnected) {
    summaryStatusText = hasLocation ? "已获取位置" : "等待GPS定位";
  }
  var fresh = freshnessOf(state && state.cupFixAt);
  return {
    cardHintText: locationMode === "phone" ? "手机定位" : bleMode ? "GPS实时" : "GPS定位",
    modeHintText: deviceBleConnected ? "已连接，可切换手机定位或GPS定位" : "未连接时仅支持GPS定位",
    summaryStatusText: summaryStatusText,
    cupAddressText: cupAddressLoading ? "解析中..." : cupAddressDetail,
    freshnessPercent: fresh.percent,
    freshnessLabel: fresh.label
  };
}
var INITIAL_MAP_DATA = {
  latitude: DEFAULT_CENTER.latitude,
  longitude: DEFAULT_CENTER.longitude,
  scale: DEFAULT_SCALE,
  mapSkew: MAP_SKEW,
  markers: [],
  polylines: [],
  online: false,
  cupConnected: false,
  bleMode: false,
  deviceBleConnected: false,
  preferredLocationMode: "gps",
  locationMode: "gps",
  cupLatitude: null,
  cupLongitude: null,
  mapRotate: 0,
  cupAddressDetail: "",
  cupAddressLoading: false,
  poiMarkers: [],
  circles: [],
  cupFixAt: 0,
  freshnessPercent: 0,
  freshnessLabel: "",
  pageTopPx: 24,
  petOn: true,
  trackedDeviceId: "",
  trackedDeviceName: "未选择水杯",
  trackedDeviceMeta: "连接设备后自动同步",
  trackedDevices: [],
  trackedDeviceCount: 0,
  trackedDeviceOptions: ["暂无已连接水杯"],
  trackedDeviceIndex: 0,
  trackedDevicePickerEnabled: false
};
var GCJ_A = 6378245.0;
var GCJ_EE = 0.00669342162296594323;

function _outOfChina(lat, lng) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function _transformLat(x, y) {
  var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y;
  ret += 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function _transformLng(x, y) {
  var ret = 300.0 + x + 2.0 * y + 0.1 * x * x;
  ret += 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
  return ret;
}

function toGcj02(latitude, longitude) {
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return null;
  if (_outOfChina(latitude, longitude)) {
    return {
      latitude: latitude,
      longitude: longitude
    };
  }
  var dLat = _transformLat(longitude - 105.0, latitude - 35.0);
  var dLng = _transformLng(longitude - 105.0, latitude - 35.0);
  var radLat = latitude / 180.0 * Math.PI;
  var magic = Math.sin(radLat);
  magic = 1 - GCJ_EE * magic * magic;
  var sqrtMagic = Math.sqrt(magic);
  var mgLat = latitude + dLat * 180.0 / (GCJ_A * (1 - GCJ_EE) / (magic * sqrtMagic) * Math.PI);
  var mgLng = longitude + dLng * 180.0 / (GCJ_A / sqrtMagic * Math.cos(radLat) * Math.PI);
  return {
    latitude: mgLat,
    longitude: mgLng
  };
}
Page({
  data: _objectSpread2(_objectSpread2({}, INITIAL_MAP_DATA), buildMapViewState(INITIAL_MAP_DATA)),
  onLoad: function onLoad(options) {
    var token = decodeURIComponent(options && options.token || wx.getStorageSync("cup_token") || "").trim();
    this._cupToken = token;
    this._preferredLocationMode = locationSettings.getPreferredLocationMode();
    if (token) {
      wx.setStorageSync("cup_token", token);
    }
    this._applyLayoutMetrics();
    this._loadPreferredLocationMode();
    this._loadTrackedDevices();
  },
  onReady: function onReady() {
    var self = this;
    this._mapCtx = wx.createMapContext("cupMap", this);
    this._bindBleNotify();
    this.refreshCupLocation(true).then(function() {
      /* 首轮定位流程结束后校准伙伴表情（离线空态的打盹也在这里触发） */
      if (self._alive) self._syncPetMood();
    });
    this.startCupPolling();
    this._ready = true;
  },
  onShow: function onShow() {
    this._alive = true;
    this._fxFlip = !this._fxFlip;
    this.setData({ pageAnim: "fx-on" + (this._fxFlip ? "2" : ""), petOn: petStore.isEnabled() });
    petStore.setPageVisible("map", true);
    // 首次进入由 onReady 处理布局/绑定/轮询，onShow 跳过避免重复
    if (this._ready) {
      // 仅刷新可能变化的数据
      this._loadPreferredLocationMode();
      this._loadTrackedDevices();
      this.startCupPolling();
      this._bindBleNotify();
      this.refreshCupLocation(false);
      this._syncPetMood();
    }
  },
  onHide: function onHide() {
    this._alive = false;
    this.setData({ pageAnim: "fx-out" });
    this._stopPagePolling();
    petStore.setPageVisible("map", false);
    petEvents.mapLeave();
  },
  onUnload: function onUnload() {
    this._alive = false;
    this._stopPagePolling();
    petStore.setPageVisible("map", false);
    petEvents.mapLeave();
  },
  /* 伙伴表情与页面三态对齐（在线交环境巡演；搜索中/离线各入对应任务态） */
  _syncPetMood: function _syncPetMood() {
    if (!petStore.isEnabled()) return;
    if (this.data.cupConnected && this.data.cupLatitude !== null) return;
    if (this.data.cupConnected) {
      petEvents.mapSearching();
      return;
    }
    petEvents.mapOffline();
  },
  _setMapData: function _setMapData(patch, cb) {
    var nextPatch = patch && _typeof2(patch) === "object" ? patch : {};
    var nextState = Object.assign({}, this.data, nextPatch);
    this.setData(Object.assign({}, nextPatch, buildMapViewState(nextState)), cb);
  },
  _applyLayoutMetrics: function _applyLayoutMetrics() {
    this._setMapData(getLayoutMetrics());
  },
  _loadPreferredLocationMode: function _loadPreferredLocationMode() {
    var preferredLocationMode = locationSettings.getPreferredLocationMode();
    this._preferredLocationMode = preferredLocationMode;
    var locationMode = this.data.deviceBleConnected ? preferredLocationMode : "gps";
    if (this.data.preferredLocationMode === preferredLocationMode && this.data.locationMode === locationMode) {
      return preferredLocationMode;
    }
    this._setMapData({
      preferredLocationMode: preferredLocationMode,
      locationMode: locationMode
    });
    return preferredLocationMode;
  },
  _loadTrackedDevices: function _loadTrackedDevices() {
    var list = registry.getPairedDevices();
    var tracked = registry.resolveTrackedDevice();
    var trackedId = tracked ? tracked.id : "";
    var trackedDevices = list.map(function(item) {
      return {
        id: item.id,
        name: item.name,
        meta: trackedDeviceHint(item)
      };
    });
    var trackedOptions = trackedDevices.length ? trackedDevices.map(function(item) {
      return item.name;
    }) : ["暂无已连接水杯"];
    var trackedIndex = trackedDevices.findIndex(function(item) {
      return item.id === trackedId;
    });
    if (trackedId) {
      registry.setTrackedDeviceId(trackedId);
    }
    this._setMapData({
      trackedDeviceId: trackedId,
      trackedDeviceName: tracked ? tracked.name : "未选择水杯",
      trackedDeviceMeta: tracked ? trackedDeviceBadge(tracked) : "连接设备后自动同步",
      trackedDevices: trackedDevices,
      trackedDeviceCount: trackedDevices.length,
      trackedDeviceOptions: trackedOptions,
      trackedDeviceIndex: trackedIndex >= 0 ? trackedIndex : 0,
      trackedDevicePickerEnabled: trackedDevices.length > 0
    });
  },
  handleTrackedDevicePickerTap: function handleTrackedDevicePickerTap() {
    var list = Array.isArray(this.data.trackedDevices) ? this.data.trackedDevices : [];
    if (!list.length) {
      wx.showToast({
        title: "请先连接过至少一个水杯",
        icon: "none"
      });
    }
  },
  _syncLocationModeState: function _syncLocationModeState(bleConnected) {
    var preferredLocationMode = locationSettings.normalizeLocationMode(this._preferredLocationMode || this.data.preferredLocationMode);
    this._preferredLocationMode = preferredLocationMode;
    var locationMode = bleConnected ? preferredLocationMode : "gps";
    var nextPatch = {};
    if (this.data.deviceBleConnected !== bleConnected) nextPatch.deviceBleConnected = bleConnected;
    if (this.data.preferredLocationMode !== preferredLocationMode) nextPatch.preferredLocationMode = preferredLocationMode;
    if (this.data.locationMode !== locationMode) nextPatch.locationMode = locationMode;
    if (Object.keys(nextPatch).length) {
      this._setMapData(nextPatch);
    }
    return locationMode;
  },
  _switchLocationMode: function _switchLocationMode(nextMode) {
    var _this = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee() {
      var normalized, phoneLoc;
      return _regeneratorRuntime2().wrap(function _callee$(_context) {
        while (1) switch (_context.prev = _context.next) {
          case 0:
            normalized = locationSettings.normalizeLocationMode(nextMode);
            if (!(normalized === "phone" && !_this.data.deviceBleConnected)) {
              _context.next = 4;
              break;
            }
            wx.showToast({
              title: "未连接时仅支持GPS定位",
              icon: "none"
            });
            return _context.abrupt("return");
          case 4:
            _this._preferredLocationMode = locationSettings.setPreferredLocationMode(normalized);
            _this._setMapData({
              preferredLocationMode: _this._preferredLocationMode,
              locationMode: _this.data.deviceBleConnected ? _this._preferredLocationMode : "gps"
            });
            if (!(normalized === "phone" && _this.data.deviceBleConnected)) {
              _context.next = 11;
              break;
            }
            _context.next = 9;
            return _this._fetchPhoneLocation(true);
          case 9:
            phoneLoc = _context.sent;
            if (!phoneLoc) {
              _this._preferredLocationMode = locationSettings.setPreferredLocationMode("gps");
              _this._setMapData({
                preferredLocationMode: _this._preferredLocationMode,
                locationMode: "gps"
              });
              wx.showToast({
                title: "手机定位不可用，已切换GPS定位",
                icon: "none"
              });
            }
          case 11:
            _this.refreshCupLocation(true);
          case 12:
          case "end":
            return _context.stop();
        }
      }, _callee);
    }))();
  },
  onLocationModePhone: function onLocationModePhone() {
    this._switchLocationMode("phone");
  },
  onLocationModeGps: function onLocationModeGps() {
    this._switchLocationMode("gps");
  },
  _selectTrackedDevice: function _selectTrackedDevice(deviceId) {
    registry.setTrackedDeviceId(deviceId);
    this._lastGpsLocation = null;
    this._lastGpsAt = 0;
    this._lastCloudLocation = null;
    this._lastCloudAt = 0;
    this._lastCloudFetchMs = 0;
    this._unbindBleNotify();
    this._loadTrackedDevices();
    this.refreshCupLocation(true);
  },
  onTrackedDevicePickerChange: function onTrackedDevicePickerChange(e) {
    var index = Number(e && e.detail && e.detail.value);
    var list = Array.isArray(this.data.trackedDevices) ? this.data.trackedDevices : [];
    if (!list.length || !Number.isInteger(index) || index < 0 || index >= list.length) return;
    var target = list[index];
    if (!(target && target.id) || target.id === this.data.trackedDeviceId) {
      this._setMapData({
        trackedDeviceIndex: index
      });
      return;
    }
    this._selectTrackedDevice(target.id);
  },
  _stopPagePolling: function _stopPagePolling() {
    this.stopCupPolling();
    this._unbindBleNotify();
  },
  startCupPolling: function startCupPolling() {
    var _this2 = this;
    if (this._cupTimer) return;
    this._cupTimer = setInterval(function() {
      return _this2.refreshCupLocation(false);
    }, LOCAL_BLE_POLL_MS);
  },
  stopCupPolling: function stopCupPolling() {
    if (this._cupTimer) {
      clearInterval(this._cupTimer);
      this._cupTimer = null;
    }
  },
  refreshCupLocation: function refreshCupLocation() {
    var _arguments = arguments,
      _this3 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee2() {
      var forceCenter, bleConnected, locationMode, phoneLoc, gpsLoc, cloudLoc;
      return _regeneratorRuntime2().wrap(function _callee2$(_context2) {
        while (1) switch (_context2.prev = _context2.next) {
          case 0:
            forceCenter = _arguments.length > 0 && _arguments[0] !== undefined ? _arguments[0] : false;
            _context2.next = 3;
            return _this3._isLocalBleConnected();
          case 3:
            bleConnected = _context2.sent;
            locationMode = _this3._syncLocationModeState(bleConnected);
            if (bleConnected) {
              _this3._bindBleNotify();
            } else {
              _this3._unbindBleNotify();
            }
            if (!(locationMode === "phone" && bleConnected)) {
              _context2.next = 12;
              break;
            }
            _context2.next = 9;
            return _this3._fetchPhoneLocation(forceCenter);
          case 9:
            phoneLoc = _context2.sent;
            if (phoneLoc) {
              _this3._applyCupLocation(phoneLoc, {
                online: true,
                ble: false,
                forceCenter: forceCenter,
                fixAt: Date.now()
              });
            } else {
              _this3._setConnectedNoGps({
                ble: false
              });
            }
            return _context2.abrupt("return");
          case 12:
            if (!bleConnected) {
              _context2.next = 16;
              break;
            }
            gpsLoc = _this3._getFreshGpsLocation();
            if (gpsLoc) {
              _this3._applyCupLocation(gpsLoc, {
                online: true,
                ble: true,
                forceCenter: forceCenter,
                fixAt: _this3._lastGpsAt || Date.now()
              });
            } else {
              _this3._setConnectedNoGps({
                ble: true
              });
            }
            return _context2.abrupt("return");
          case 16:
            _context2.next = 18;
            return _this3._fetchCloudLocation(forceCenter);
          case 18:
            cloudLoc = _context2.sent;
            if (!cloudLoc) {
              _context2.next = 22;
              break;
            }
            _this3._applyCupLocation(cloudLoc, {
              online: true,
              ble: false,
              forceCenter: forceCenter,
              fixAt: _this3._lastCloudAt || Date.now()
            });
            return _context2.abrupt("return");
          case 22:
            _this3._clearCupLocation();
          case 23:
          case "end":
            return _context2.stop();
        }
      }, _callee2);
    }))();
  },
  _isLocalBleConnected: function _isLocalBleConnected() {
    var _this4 = this;
    return new Promise(function(resolve) {
      if (!wx.getConnectedBluetoothDevices || !ble.SERVICE_UUID) {
        resolve(false);
        return;
      }
      var trackedDeviceId = _this4._resolveTrackedDeviceId();
      wx.getConnectedBluetoothDevices({
        services: [ble.SERVICE_UUID],
        success: function success(res) {
          var devices = Array.isArray(res && res.devices) ? res.devices : [];
          if (!devices.length) {
            resolve(false);
            return;
          }
          if (!trackedDeviceId) {
            resolve(true);
            return;
          }
          resolve(devices.some(function(item) {
            return item.deviceId === trackedDeviceId;
          }));
        },
        fail: function fail() {
          return resolve(false);
        }
      });
    });
  },
  _resolveTrackedDeviceId: function _resolveTrackedDeviceId() {
    var id = String(this.data.trackedDeviceId || registry.getTrackedDeviceId() || "").trim();
    if (id) return id;
    var tracked = registry.resolveTrackedDevice();
    return tracked ? tracked.id : "";
  },
  _resolveTrackedDeviceEntry: function _resolveTrackedDeviceEntry() {
    var deviceId = this._resolveTrackedDeviceId();
    if (!deviceId) return null;
    return registry.getPairedDevice(deviceId);
  },
  _bindBleNotify: function _bindBleNotify() {
    var _this5 = this;
    var deviceId = this._resolveTrackedDeviceId();
    if (!deviceId) return;
    if (this._notifyDeviceId === deviceId && this._notifyOff) return;
    this._unbindBleNotify();
    this._notifyDeviceId = deviceId;
    this._notifyOff = ble.onNotifyParsed(deviceId, function(payload) {
      if (!payload) return;
      var lat = Number(payload.gpsLatitude);
      var lng = Number(payload.gpsLongitude);
      if (payload.gpsValid && isFiniteNumber(lat) && isFiniteNumber(lng)) {
        var gcj = toGcj02(lat, lng);
        if (gcj) {
          _this5._lastGpsLocation = gcj;
          _this5._lastGpsAt = Date.now();
        }
      }
    });
  },
  _unbindBleNotify: function _unbindBleNotify() {
    if (typeof this._notifyOff === "function") {
      this._notifyOff();
    }
    this._notifyOff = null;
    this._notifyDeviceId = "";
  },
  _getFreshGpsLocation: function _getFreshGpsLocation() {
    if (!this._lastGpsLocation || !this._lastGpsAt) return null;
    var age = Date.now() - this._lastGpsAt;
    if (age > GPS_STALE_MS) return null;
    return this._lastGpsLocation;
  },
  _getFreshPhoneLocation: function _getFreshPhoneLocation() {
    if (!this._lastPhoneLocation || !this._lastPhoneAt) return null;
    var age = Date.now() - this._lastPhoneAt;
    if (age > PHONE_LOCATION_STALE_MS) return null;
    return this._lastPhoneLocation;
  },
  _fetchPhoneLocation: function _fetchPhoneLocation() {
    var _this6 = this;
    var force = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;
    var fresh = this._getFreshPhoneLocation();
    if (fresh && !force) {
      return Promise.resolve(fresh);
    }
    return new Promise(function(resolve) {
      if (typeof wx.getLocation !== "function") {
        resolve(null);
        return;
      }
      wx.getLocation({
        type: "gcj02",
        isHighAccuracy: true,
        highAccuracyExpireTime: 3000,
        success: function success(res) {
          var latitude = Number(res && res.latitude);
          var longitude = Number(res && res.longitude);
          if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) {
            resolve(null);
            return;
          }
          var next = {
            latitude: latitude,
            longitude: longitude
          };
          _this6._lastPhoneLocation = next;
          _this6._lastPhoneAt = Date.now();
          resolve(next);
        },
        fail: function fail(err) {
          console.warn("[phone location fail]", err);
          resolve(null);
        }
      });
    });
  },
  _getCloudDeviceId: function _getCloudDeviceId() {
    var tracked = this._resolveTrackedDeviceEntry();
    var cloudId = registry.getCloudDeviceIdForEntry(tracked);
    if (cloudId) return cloudId;
    return String(wx.getStorageSync(registry.LEGACY_CLOUD_DEVICE_KEY) || "").trim();
  },
  _getCloudReadToken: function _getCloudReadToken() {
    if (this._cupToken) return this._cupToken;
    var stored = String(wx.getStorageSync("cup_token") || "").trim();
    if (stored) {
      this._cupToken = stored;
      return stored;
    }
    return "";
  },
  _getFreshCloudLocation: function _getFreshCloudLocation() {
    if (!this._lastCloudLocation || !this._lastCloudAt) return null;
    var age = Date.now() - this._lastCloudAt;
    if (age > CLOUD_STALE_MS) return null;
    return this._lastCloudLocation;
  },
  _fetchCloudLocation: function _fetchCloudLocation() {
    var _arguments2 = arguments,
      _this7 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee3() {
      var force, deviceId, now, token, res, payload, lat, lng, ts, asMs, gcj;
      return _regeneratorRuntime2().wrap(function _callee3$(_context3) {
        while (1) switch (_context3.prev = _context3.next) {
          case 0:
            force = _arguments2.length > 0 && _arguments2[0] !== undefined ? _arguments2[0] : false;
            if (!(!wx.cloud || !wx.cloud.callFunction)) {
              _context3.next = 3;
              break;
            }
            return _context3.abrupt("return", null);
          case 3:
            deviceId = _this7._getCloudDeviceId();
            if (deviceId) {
              _context3.next = 6;
              break;
            }
            return _context3.abrupt("return", null);
          case 6:
            now = Date.now();
            if (!(!force && _this7._lastCloudFetchMs && now - _this7._lastCloudFetchMs < CLOUD_POLL_MS)) {
              _context3.next = 9;
              break;
            }
            return _context3.abrupt("return", _this7._getFreshCloudLocation());
          case 9:
            _this7._lastCloudFetchMs = now;
            _context3.prev = 10;
            token = _this7._getCloudReadToken();
            _context3.next = 14;
            return wx.cloud.callFunction({
              name: "gpsLatest",
              data: token ? {
                deviceId: deviceId,
                token: token
              } : {
                deviceId: deviceId
              }
            });
          case 14:
            res = _context3.sent;
            payload = res && res.result || {};
            if (!(!payload.ok || !payload.data)) {
              _context3.next = 19;
              break;
            }
            if (payload.error) {
              console.warn("[gpsLatest unavailable]", payload.error, payload);
            }
            return _context3.abrupt("return", null);
          case 19:
            lat = Number(payload.data.lat);
            lng = Number(payload.data.lng);
            if (!(!isFiniteNumber(lat) || !isFiniteNumber(lng))) {
              _context3.next = 23;
              break;
            }
            return _context3.abrupt("return", null);
          case 23:
            ts = Number(payload.data.ts || payload.data.updatedAt || 0);
            asMs = ts > 1e12 ? ts : ts > 0 ? ts * 1000 : 0;
            if (asMs) {
              _this7._lastCloudAt = asMs;
            } else {
              _this7._lastCloudAt = Date.now();
            }
            gcj = toGcj02(lat, lng);
            if (gcj) {
              _context3.next = 29;
              break;
            }
            return _context3.abrupt("return", null);
          case 29:
            _this7._lastCloudLocation = gcj;
            return _context3.abrupt("return", _this7._getFreshCloudLocation());
          case 33:
            _context3.prev = 33;
            _context3.t0 = _context3["catch"](10);
            console.warn("[gpsLatest call fail]", _context3.t0);
            return _context3.abrupt("return", null);
          case 37:
          case "end":
            return _context3.stop();
        }
      }, _callee3, null, [
        [10, 33]
      ]);
    }))();
  },
  _setConnectedNoGps: function _setConnectedNoGps() {
    var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    var useBle = !!options.ble;
    var connected = this.data.cupConnected;
    if (connected && this.data.cupLatitude === null && this.data.cupLongitude === null && this.data.bleMode === useBle) {
      return;
    }
    /* 进入/回到「连着但没定位」：伙伴进入联网加载任务态 */
    petEvents.mapSearching();
    this._setMapData({
      cupConnected: true,
      online: false,
      bleMode: useBle,
      cupLatitude: null,
      cupLongitude: null,
      cupAddressDetail: "",
      cupAddressLoading: false,
      poiMarkers: [],
      markers: [],
      circles: [],
      cupFixAt: 0,
      polylines: []
    });
  },
  _applyCupLocation: function _applyCupLocation(loc, _ref) {
    var _this8 = this;
    var online = _ref.online,
      bleMode = _ref.ble,
      forceCenter = _ref.forceCenter,
      fixAt = _ref.fixAt;
    var cupLatitude = Number(loc && loc.latitude);
    var cupLongitude = Number(loc && loc.longitude);
    if (!isFiniteNumber(cupLatitude) || !isFiniteNumber(cupLongitude)) return;
    var wasConnected = this.data.cupConnected;
    var hadFix = this.data.cupLatitude !== null && this.data.cupLatitude !== undefined;
    var prevLat = Number(this.data.cupLatitude);
    var prevLng = Number(this.data.cupLongitude);
    var stableLat = cupLatitude;
    var stableLng = cupLongitude;
    if (!hadFix) {
      /* 从「无定位/离线」拿到首个定位：伙伴惊讶→开心两连 */
      petEvents.mapFound();
    }
    if (!forceCenter && wasConnected && isFiniteNumber(prevLat) && isFiniteNumber(prevLng)) {
      var drift = this._distanceMeters(prevLat, prevLng, cupLatitude, cupLongitude);
      if (drift <= LOCATION_STOP_METERS) {
        stableLat = prevLat;
        stableLng = prevLng;
      } else if (drift <= LOCATION_JITTER_METERS) {
        stableLat = prevLat + (cupLatitude - prevLat) * LOCATION_SMOOTH_FACTOR;
        stableLng = prevLng + (cupLongitude - prevLng) * LOCATION_SMOOTH_FACTOR;
      }
    }
    this._setMapData({
      cupConnected: true,
      online: !!online,
      bleMode: !!bleMode,
      cupLatitude: stableLat,
      cupLongitude: stableLng,
      cupFixAt: fixAt || Date.now()
    }, function() {
      _this8._syncOverlays();
      _this8._maybeUpdateCupAddress(stableLat, stableLng, forceCenter || !wasConnected);
      if (forceCenter || !wasConnected) {
        _this8._recenterTo(stableLat, stableLng);
      }
    });
  },
  _clearCupLocation: function _clearCupLocation() {
    if (!this.data.cupConnected && !this.data.markers.length) return;
    /* 在线/定位中 → 离线的实时转变：伙伴打盹等它上线
     * （页面初始的离线空态由 _syncPetMood 负责，这里防重复） */
    petEvents.mapOffline();
    this._setMapData({
      cupConnected: false,
      online: false,
      bleMode: false,
      cupLatitude: null,
      cupLongitude: null,
      cupAddressDetail: "",
      cupAddressLoading: false,
      poiMarkers: [],
      markers: [],
      circles: [],
      cupFixAt: 0,
      polylines: []
    });
    this._lastGpsLocation = null;
    this._lastGpsAt = 0;
    this._lastCloudLocation = null;
    this._lastCloudAt = 0;
  },
  _distanceMeters: function _distanceMeters(lat1, lng1, lat2, lng2) {
    var rad = Math.PI / 180;
    var x = (lng2 - lng1) * rad * Math.cos((lat1 + lat2) * 0.5 * rad);
    var y = (lat2 - lat1) * rad;
    return Math.sqrt(x * x + y * y) * 6378137;
  },
  _maybeUpdateCupAddress: function _maybeUpdateCupAddress(latitude, longitude) {
    var force = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
    if (!wx.cloud || !wx.cloud.callFunction) return;
    var now = Date.now();
    var lastAt = this._lastGeoAt || 0;
    var lastLoc = this._lastGeoLoc;
    if (!force) {
      if (now - lastAt < GEO_MIN_INTERVAL_MS) return;
      if (lastLoc) {
        var drift = this._distanceMeters(lastLoc.lat, lastLoc.lng, latitude, longitude);
        if (drift < GEO_MIN_DISTANCE_METERS) return;
      }
    }
    this._lastGeoAt = now;
    this._lastGeoLoc = {
      lat: latitude,
      lng: longitude
    };
    this._fetchCupAddress(latitude, longitude);
  },
  _fetchCupAddress: function _fetchCupAddress(latitude, longitude) {
    var _this9 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee4() {
      var res, payload, cupAddressDetail, poiMarkers;
      return _regeneratorRuntime2().wrap(function _callee4$(_context4) {
        while (1) switch (_context4.prev = _context4.next) {
          case 0:
            _this9._setMapData({
              cupAddressLoading: true
            });
            _context4.prev = 1;
            _context4.next = 4;
            return wx.cloud.callFunction({
              name: "mapProxy",
              data: {
    pageAnim: "",
                action: "reverseGeocoder",
                params: {
                  location: "".concat(latitude, ",").concat(longitude),
                  get_poi: 1,
                  poi_options: "policy=5;radius=500;page_size=10"
                }
              }
            });
          case 4:
            res = _context4.sent;
            if (_this9._alive) {
              _context4.next = 7;
              break;
            }
            return _context4.abrupt("return");
          case 7:
            payload = res && res.result || {};
            if (!(!payload.ok || !payload.result)) {
              _context4.next = 12;
              break;
            }
            _this9._setMapData({
              cupAddressDetail: "",
              cupAddressLoading: false,
              poiMarkers: []
            });
            _this9._syncOverlays();
            return _context4.abrupt("return");
          case 12:
            cupAddressDetail = _this9._formatAddressDetail(payload.result);
            poiMarkers = _this9._buildPoiMarkers(payload.result.pois);
            _this9._setMapData({
              cupAddressDetail: cupAddressDetail,
              cupAddressLoading: false,
              poiMarkers: poiMarkers
            }, function() {
              return _this9._syncOverlays();
            });
            _context4.next = 22;
            break;
          case 17:
            _context4.prev = 17;
            _context4.t0 = _context4["catch"](1);
            if (_this9._alive) {
              _context4.next = 21;
              break;
            }
            return _context4.abrupt("return");
          case 21:
            _this9._setMapData({
              cupAddressDetail: "",
              cupAddressLoading: false,
              poiMarkers: []
            }, function() {
              return _this9._syncOverlays();
            });
          case 22:
          case "end":
            return _context4.stop();
        }
      }, _callee4, null, [
        [1, 17]
      ]);
    }))();
  },
  _formatAddressDetail: function _formatAddressDetail(result) {
    var poi = Array.isArray(result && result.pois) && result.pois.length ? result.pois[0].title : "";
    var ref = result && result.address_reference || {};
    var landmark = ref.landmark_l2 && ref.landmark_l2.title || ref.landmark_l1 && ref.landmark_l1.title || ref.town && ref.town.title || "";
    return poi || landmark || "";
  },
  _buildPoiMarkers: function _buildPoiMarkers(pois) {
    if (!Array.isArray(pois) || !pois.length) return [];
    var list = [];
    for (var i = 0; i < pois.length && list.length < POI_LIMIT; i++) {
      var poi = pois[i];
      var title = poi && poi.title ? String(poi.title).trim() : "";
      var lat = Number(poi && poi.location && poi.location.lat);
      var lng = Number(poi && poi.location && poi.location.lng);
      if (!title || !isFiniteNumber(lat) || !isFiniteNumber(lng)) continue;
      list.push({
        id: POI_MARKER_BASE_ID + list.length,
        latitude: lat,
        longitude: lng,
        iconPath: POI_ICON,
        width: 20,
        height: 20,
        anchor: {
          x: 0.5,
          y: 0.5
        },
        callout: {
          content: title,
          display: "ALWAYS",
          color: "#102A43",
          bgColor: "#FFFFFF",
          borderWidth: 1,
          borderColor: "#D8E6EE",
          borderRadius: 10,
          padding: 6,
          fontSize: 12
        }
      });
    }
    return list;
  },
  _syncOverlays: function _syncOverlays() {
    var markers = [];
    var circles = [];
    var _this$data = this.data,
      cupLatitude = _this$data.cupLatitude,
      cupLongitude = _this$data.cupLongitude,
      cupConnected = _this$data.cupConnected,
      trackedDeviceName = _this$data.trackedDeviceName;
    if (cupConnected && cupLatitude !== null && cupLongitude !== null) {
      markers.push({
        id: 2,
        latitude: cupLatitude,
        longitude: cupLongitude,
        iconPath: "../../images/markers/cup.png",
        width: 36,
        height: 36,
        anchor: {
          x: 0.5,
          y: 0.5
        },
        callout: {
          content: String(trackedDeviceName || "我的水杯"),
          display: "BYTAP",
          color: "#102A43",
          bgColor: "#FFFFFF",
          borderWidth: 1,
          borderColor: "#D8E6EE",
          borderRadius: 10,
          padding: 8,
          fontSize: 12
        }
      });
      circles.push({
        latitude: cupLatitude,
        longitude: cupLongitude,
        radius: 32,
        color: "#0F8EA855",
        fillColor: "#0F8EA81F",
        strokeWidth: 1
      });
      circles.push({
        latitude: cupLatitude,
        longitude: cupLongitude,
        radius: 85,
        color: "#0F8EA833",
        fillColor: "#0F8EA80A",
        strokeWidth: 1
      });
    }
    this._setMapData({
      markers: markers,
      circles: circles,
      polylines: []
    });
  },
  goDeviceConnect: function goDeviceConnect() {
    if (petStore.isEnabled()) petStore.beginExit();
    setTimeout(function() {
      wx.navigateTo({
        url: "/pages/device/device"
      });
    }, 220);
  },
  recenter: function recenter() {
    var _this10 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee5() {
      var phoneLoc, cloudId;
      return _regeneratorRuntime2().wrap(function _callee5$(_context5) {
        while (1) switch (_context5.prev = _context5.next) {
          case 0:
            if (!(_this10.data.locationMode === "phone" && _this10.data.deviceBleConnected)) {
              _context5.next = 12;
              break;
            }
            _context5.next = 3;
            return _this10._fetchPhoneLocation(true);
          case 3:
            phoneLoc = _context5.sent;
            if (!phoneLoc) {
              _context5.next = 7;
              break;
            }
            _this10._applyCupLocation(phoneLoc, {
              online: true,
              ble: false,
              forceCenter: true,
              fixAt: Date.now()
            });
            return _context5.abrupt("return");
          case 7:
            if (!(_this10.data.cupConnected && _this10.data.cupLatitude !== null && _this10.data.cupLongitude !== null)) {
              _context5.next = 10;
              break;
            }
            _this10._recenterTo(_this10.data.cupLatitude, _this10.data.cupLongitude);
            return _context5.abrupt("return");
          case 10:
            wx.showToast({
              title: "手机定位未获取成功",
              icon: "none"
            });
            return _context5.abrupt("return");
          case 12:
            if (!(_this10.data.cupConnected && _this10.data.cupLatitude !== null && _this10.data.cupLongitude !== null)) {
              _context5.next = 15;
              break;
            }
            _this10._recenterTo(_this10.data.cupLatitude, _this10.data.cupLongitude);
            return _context5.abrupt("return");
          case 15:
            if (_this10.data.cupConnected) {
              _context5.next = 19;
              break;
            }
            cloudId = _this10._getCloudDeviceId();
            wx.showToast({
              title: cloudId ? "暂无定位数据" : "请先连接并同步一只水杯",
              icon: "none"
            });
            return _context5.abrupt("return");
          case 19:
            wx.showToast({
              title: "GPS未定位成功",
              icon: "none"
            });
          case 20:
          case "end":
            return _context5.stop();
        }
      }, _callee5);
    }))();
  },
  _recenterTo: function _recenterTo(latitude, longitude) {
    this._setMapData({
      latitude: latitude,
      longitude: longitude,
      scale: MAX_SCALE
    });
    if (this._mapCtx) {
      this._mapCtx.includePoints({
        points: [{
          latitude: latitude,
          longitude: longitude
        }],
        padding: [150, 60, 400, 60]
      });
    }
  },
  onRegionChange: function onRegionChange(e) {
    var rotate = e && e.detail && typeof e.detail.rotate === "number" ? normalizeMapRotate(e.detail.rotate) : null;
    if (rotate === null) return;
    if (Math.abs(rotate - this.data.mapRotate) < MAP_ROTATE_THRESHOLD_DEG) return;
    this._setMapData({
      mapRotate: rotate
    });
  },
  resetMapNorth: function resetMapNorth() {
    if (Math.abs(this.data.mapRotate) < MAP_ROTATE_THRESHOLD_DEG) return;
    this._setMapData({
      mapRotate: 0
    });
  },
  goBack: function goBack() {
    if (petStore.isEnabled()) petStore.beginExit();
    setTimeout(function() {
      if (getCurrentPages().length > 1) {
        wx.navigateBack();
        return;
      }
      wx.switchTab({
        url: "/pages/index/index"
      });
    }, 220);
  }
});