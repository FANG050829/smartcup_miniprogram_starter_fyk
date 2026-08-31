var _regeneratorRuntime2 = require("../@babel/runtime/helpers/regeneratorRuntime");
var _objectSpread2 = require("../@babel/runtime/helpers/objectSpread2");
var _asyncToGenerator2 = require("../@babel/runtime/helpers/asyncToGenerator");
var SERVICE_UUID = "0000FFF0-0000-1000-8000-00805F9B34FB";
var NOTIFY_UUID = "0000FFF1-0000-1000-8000-00805F9B34FB";
var WRITE_UUID = "0000FFF2-0000-1000-8000-00805F9B34FB";
var INFO_UUID = "0000FFF3-0000-1000-8000-00805F9B34FB";
var BLE_ERROR_TEXT = {
  10000: "蓝牙适配器未初始化",
  10001: "蓝牙不可用或未开启",
  10002: "未找到设备",
  10003: "连接失败",
  10004: "未找到服务",
  10005: "未找到特征值",
  10006: "连接已断开",
  10007: "当前特征值不支持此操作",
  10008: "系统异常",
  10009: "Android 版本过低",
  10012: "连接超时",
  10013: "权限不足或参数不合法"
};
var CONNECT_TIMEOUT_MS = 18000;
var CONNECT_STABILIZE_MS = 600;
var DISCOVER_RETRY_TIMES = 12;
var DISCOVER_RETRY_DELAY_MS = 280;
var NOTIFY_RETRY_TIMES = 4;
var NOTIFY_RETRY_DELAY_MS = 180;
var DISCONNECT_VERIFY_DELAY_MS = 720;
var _onFound = function _onFound() {};
var _adapterReady = false;
var _adapterOpeningPromise = null;
var _deviceFoundBound = false;
var _notifyBound = false;
var _connStateBound = false;
var _notifyHandlers = Object.create(null);
var _linkByDevice = Object.create(null);
var _disconnectVerifyTimer = Object.create(null);
var _deviceTaskChain = Object.create(null);
var _valueWaiters = Object.create(null);
var _sleep = function _sleep(ms) {
  return new Promise(function(resolve) {
    return setTimeout(resolve, ms);
  });
};
var _BLE_BASE_TAIL = "00001000800000805F9B34FB";

function _normalizeUuid(uuid) {
  var raw = String(uuid || "").toUpperCase().replace(/[^0-9A-F]/g, "");
  if (!raw) return "";
  if (raw.length === 4) return "0000".concat(raw).concat(_BLE_BASE_TAIL);
  if (raw.length === 8) return "".concat(raw).concat(_BLE_BASE_TAIL);
  return raw;
}

function _uuidShort16(uuid) {
  var raw = String(uuid || "").toUpperCase().replace(/[^0-9A-F]/g, "");
  if (!raw) return "";
  if (raw.length === 4) return raw;
  if (raw.length === 8) return raw.slice(-4);
  if (raw.length === 32 && raw.slice(8) === _BLE_BASE_TAIL) {
    return raw.slice(4, 8);
  }
  return "";
}

function _uuidMatches(left, right) {
  var a = _normalizeUuid(left);
  var b = _normalizeUuid(right);
  if (a && b && a === b) return true;
  var sa = _uuidShort16(left);
  var sb = _uuidShort16(right);
  return !!(sa && sb && sa === sb);
}

function _safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function _deviceKey(deviceId) {
  return String(deviceId || "").trim();
}

function _ensureLinkEntry(deviceId) {
  var id = _deviceKey(deviceId);
  if (!id) return null;
  if (!_linkByDevice[id]) {
    _linkByDevice[id] = {
      connected: false,
      serviceId: "",
      notifyId: "",
      writeId: "",
      infoId: "",
      preparedAt: 0
    };
  }
  return _linkByDevice[id];
}

function _clearDisconnectVerify(deviceId) {
  var id = _deviceKey(deviceId);
  if (!id) return;
  var timer = _disconnectVerifyTimer[id];
  if (!timer) return;
  clearTimeout(timer);
  delete _disconnectVerifyTimer[id];
}

function _markConnected(deviceId) {
  var entry = _ensureLinkEntry(deviceId);
  if (!entry) return;
  _clearDisconnectVerify(deviceId);
  entry.connected = true;
}

function _markDisconnected(deviceId) {
  var id = _deviceKey(deviceId);
  if (!id) return;
  _clearDisconnectVerify(id);
  var entry = _linkByDevice[id];
  if (!entry) return;
  entry.connected = false;
  entry.infoId = "";
  entry.preparedAt = 0;
}

function _charKey(deviceId, characteristicId) {
  return "".concat(_deviceKey(deviceId), "::").concat(_normalizeUuid(characteristicId));
}

function _waitCharacteristicValue(deviceId, characteristicId) {
  var timeoutMs = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 2500;
  var key = _charKey(deviceId, characteristicId);
  return new Promise(function(_resolve, _reject) {
    var waiter = {
      timer: null,
      resolve: function resolve(value) {
        if (waiter.timer) clearTimeout(waiter.timer);
        _resolve(value);
      },
      reject: function reject(err) {
        if (waiter.timer) clearTimeout(waiter.timer);
        _reject(err);
      }
    };
    waiter.timer = setTimeout(function() {
      var list = _valueWaiters[key];
      if (list && list.length) {
        _valueWaiters[key] = list.filter(function(item) {
          return item !== waiter;
        });
        if (!_valueWaiters[key].length) delete _valueWaiters[key];
      }
      _reject(new Error("read characteristic timeout"));
    }, Math.max(800, Number(timeoutMs) || 2500));
    if (!_valueWaiters[key]) {
      _valueWaiters[key] = [];
    }
    _valueWaiters[key].push(waiter);
  });
}

function _emitCharacteristicValue(deviceId, characteristicId, value) {
  var key = _charKey(deviceId, characteristicId);
  var list = _valueWaiters[key];
  if (!list || !list.length) return;
  delete _valueWaiters[key];
  list.forEach(function(waiter) {
    try {
      waiter.resolve(value);
    } catch (err) {}
  });
}

function _rejectCharacteristicValue(deviceId, characteristicId, err) {
  var key = _charKey(deviceId, characteristicId);
  var list = _valueWaiters[key];
  if (!list || !list.length) return;
  delete _valueWaiters[key];
  list.forEach(function(waiter) {
    try {
      waiter.reject(err);
    } catch (error) {}
  });
}

function _arrayBufferToString(buffer) {
  if (!(buffer instanceof ArrayBuffer)) return "";
  var bytes = new Uint8Array(buffer);
  var out = "";
  for (var i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) continue;
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

function _runDeviceTask(deviceId, task) {
  var id = _deviceKey(deviceId);
  if (!id) return Promise.reject(new Error("deviceId required"));
  var prev = _deviceTaskChain[id] || Promise.resolve();
  var run = prev.catch(function() {}).then(task);
  var chain = run.finally(function() {
    if (_deviceTaskChain[id] === chain) {
      delete _deviceTaskChain[id];
    }
  });
  _deviceTaskChain[id] = chain;
  return run;
}

function _retry(_x, _x2, _x3) {
  return _retry2.apply(this, arguments);
}

function _retry2() {
  _retry2 = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee8(fn, times, delayMs) {
    var lastErr, limit, i;
    return _regeneratorRuntime2().wrap(function _callee8$(_context8) {
      while (1) switch (_context8.prev = _context8.next) {
        case 0:
          lastErr = null;
          limit = Math.max(1, Number(times) || 1);
          i = 0;
        case 3:
          if (!(i < limit)) {
            _context8.next = 19;
            break;
          }
          _context8.prev = 4;
          _context8.next = 7;
          return fn();
        case 7:
          return _context8.abrupt("return", _context8.sent);
        case 10:
          _context8.prev = 10;
          _context8.t0 = _context8["catch"](4);
          lastErr = _context8.t0;
          if (!(i < limit - 1)) {
            _context8.next = 16;
            break;
          }
          _context8.next = 16;
          return _sleep(Math.max(0, Number(delayMs) || 0));
        case 16:
          i++;
          _context8.next = 3;
          break;
        case 19:
          throw lastErr;
        case 20:
        case "end":
          return _context8.stop();
      }
    }, _callee8, null, [
      [4, 10]
    ]);
  }));
  return _retry2.apply(this, arguments);
}

function getAdapterState() {
  return new Promise(function(resolve, reject) {
    wx.getBluetoothAdapterState({
      success: resolve,
      fail: reject
    });
  });
}

function _getConnectedDevices(services) {
  return new Promise(function(resolve) {
    if (!wx.getConnectedBluetoothDevices) {
      resolve([]);
      return;
    }
    var payload = {};
    if (Array.isArray(services) && services.length) {
      payload.services = services;
    }
    wx.getConnectedBluetoothDevices(_objectSpread2(_objectSpread2({}, payload), {}, {
      success: function success(res) {
        return resolve(_safeArray(res && res.devices));
      },
      fail: function fail() {
        return resolve([]);
      }
    }));
  });
}

function _probeServices(deviceId) {
  var id = _deviceKey(deviceId);
  if (!id) return Promise.resolve(false);
  return new Promise(function(resolve) {
    if (!wx.getBLEDeviceServices) {
      resolve(false);
      return;
    }
    wx.getBLEDeviceServices({
      deviceId: id,
      success: function success(res) {
        var services = _safeArray(res && res.services);
        resolve(services.length > 0);
      },
      fail: function fail() {
        return resolve(false);
      }
    });
  });
}

function _isConnectedInternal(_x4) {
  return _isConnectedInternal2.apply(this, arguments);
}

function _isConnectedInternal2() {
  _isConnectedInternal2 = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee9(deviceId) {
    var id, entry, _alive, byService, all, alive;
    return _regeneratorRuntime2().wrap(function _callee9$(_context9) {
      while (1) switch (_context9.prev = _context9.next) {
        case 0:
          id = _deviceKey(deviceId);
          if (id) {
            _context9.next = 3;
            break;
          }
          return _context9.abrupt("return", false);
        case 3:
          entry = _linkByDevice[id];
          if (!(entry && entry.connected)) {
            _context9.next = 11;
            break;
          }
          _context9.next = 7;
          return _probeServices(id).catch(function() {
            return false;
          });
        case 7:
          _alive = _context9.sent;
          if (!_alive) {
            _context9.next = 10;
            break;
          }
          return _context9.abrupt("return", true);
        case 10:
          _markDisconnected(id);
        case 11:
          _context9.next = 13;
          return _getConnectedDevices([SERVICE_UUID]);
        case 13:
          byService = _context9.sent;
          if (byService.length) {
            _context9.next = 18;
            break;
          }
          _context9.next = 17;
          return _getConnectedDevices(["FFF0"]);
        case 17:
          byService = _context9.sent;
        case 18:
          if (!byService.some(function(item) {
              return item && item.deviceId === id;
            })) {
            _context9.next = 21;
            break;
          }
          _markConnected(id);
          return _context9.abrupt("return", true);
        case 21:
          _context9.next = 23;
          return _getConnectedDevices();
        case 23:
          all = _context9.sent;
          if (!all.some(function(item) {
              return item && item.deviceId === id;
            })) {
            _context9.next = 27;
            break;
          }
          _markConnected(id);
          return _context9.abrupt("return", true);
        case 27:
          _context9.next = 29;
          return _probeServices(id);
        case 29:
          alive = _context9.sent;
          if (!alive) {
            _context9.next = 33;
            break;
          }
          _markConnected(id);
          return _context9.abrupt("return", true);
        case 33:
          _markDisconnected(id);
          return _context9.abrupt("return", false);
        case 35:
        case "end":
          return _context9.stop();
      }
    }, _callee9);
  }));
  return _isConnectedInternal2.apply(this, arguments);
}

function _scheduleDisconnectVerify(deviceId) {
  var id = _deviceKey(deviceId);
  if (!id) return;
  _clearDisconnectVerify(id);
  _disconnectVerifyTimer[id] = setTimeout(function() {
    delete _disconnectVerifyTimer[id];
    _probeServices(id).then(function(alive) {
      if (alive) {
        _markConnected(id);
        return;
      }
      _markDisconnected(id);
    }).catch(function() {
      _markDisconnected(id);
    });
  }, DISCONNECT_VERIFY_DELAY_MS);
}

function _ensureConnStateListener() {
  if (_connStateBound || !wx.onBLEConnectionStateChange) return;
  _connStateBound = true;
  wx.onBLEConnectionStateChange(function(res) {
    if (!res || !res.deviceId) return;
    if (res.connected) {
      _markConnected(res.deviceId);
      return;
    }
    _scheduleDisconnectVerify(res.deviceId);
  });
}

function init() {
  if (_adapterOpeningPromise) return _adapterOpeningPromise;
  _adapterOpeningPromise = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee2() {
    var _state, state;
    return _regeneratorRuntime2().wrap(function _callee2$(_context2) {
      while (1) switch (_context2.prev = _context2.next) {
        case 0:
          if (!_adapterReady) {
            _context2.next = 13;
            break;
          }
          _context2.prev = 1;
          _context2.next = 4;
          return getAdapterState();
        case 4:
          _state = _context2.sent;
          if (!(_state && _state.available)) {
            _context2.next = 8;
            break;
          }
          _ensureConnStateListener();
          return _context2.abrupt("return", _state);
        case 8:
          _context2.next = 12;
          break;
        case 10:
          _context2.prev = 10;
          _context2.t0 = _context2["catch"](1);
        case 12:
          _adapterReady = false;
        case 13:
          _context2.next = 15;
          return new Promise(function(resolve, reject) {
            wx.openBluetoothAdapter({
              success: function() {
                var _success = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee() {
                  var s;
                  return _regeneratorRuntime2().wrap(function _callee$(_context) {
                    while (1) switch (_context.prev = _context.next) {
                      case 0:
                        _context.prev = 0;
                        _context.next = 3;
                        return getAdapterState();
                      case 3:
                        s = _context.sent;
                        if (!(!s || !s.available)) {
                          _context.next = 7;
                          break;
                        }
                        reject({
                          errCode: 10001,
                          errMsg: "Bluetooth adapter unavailable"
                        });
                        return _context.abrupt("return");
                      case 7:
                        resolve(s);
                        _context.next = 13;
                        break;
                      case 10:
                        _context.prev = 10;
                        _context.t0 = _context["catch"](0);
                        reject(_context.t0);
                      case 13:
                      case "end":
                        return _context.stop();
                    }
                  }, _callee, null, [
                    [0, 10]
                  ]);
                }));

                function success() {
                  return _success.apply(this, arguments);
                }
                return success;
              }(),
              fail: reject
            });
          });
        case 15:
          state = _context2.sent;
          _adapterReady = true;
          _ensureConnStateListener();
          return _context2.abrupt("return", state);
        case 19:
        case "end":
          return _context2.stop();
      }
    }, _callee2, null, [
      [1, 10]
    ]);
  }))();
  return _adapterOpeningPromise.finally(function() {
    _adapterOpeningPromise = null;
  });
}

function onDeviceFound(cb) {
  _onFound = typeof cb === "function" ? cb : function() {};
  if (_deviceFoundBound || !wx.onBluetoothDeviceFound) return;
  _deviceFoundBound = true;
  wx.onBluetoothDeviceFound(function(res) {
    var list = _safeArray(res && res.devices);
    var merged = list.length ? list : res && res.device ? [res.device] : [];
    var map = Object.create(null);
    for (var i = 0; i < merged.length; i++) {
      var dev = merged[i];
      if (!dev || !dev.deviceId) continue;
      map[dev.deviceId] = dev;
    }
    _onFound(Object.keys(map).map(function(key) {
      return map[key];
    }));
  });
}

function startScan() {
  var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var payload = {
    allowDuplicatesKey: true
  };
  if (options && options.useServiceFilter && SERVICE_UUID) {
    payload.services = [SERVICE_UUID];
  }
  return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee3() {
    return _regeneratorRuntime2().wrap(function _callee3$(_context3) {
      while (1) switch (_context3.prev = _context3.next) {
        case 0:
          _context3.next = 2;
          return init();
        case 2:
          _context3.next = 4;
          return stopScan().catch(function() {});
        case 4:
          return _context3.abrupt("return", new Promise(function(resolve, reject) {
            wx.startBluetoothDevicesDiscovery(_objectSpread2(_objectSpread2({}, payload), {}, {
              success: resolve,
              fail: reject
            }));
          }));
        case 5:
        case "end":
          return _context3.stop();
      }
    }, _callee3);
  }))();
}

function stopScan() {
  return new Promise(function(resolve) {
    wx.stopBluetoothDevicesDiscovery({
      complete: resolve
    });
  });
}

function _closeConnectionSilently(deviceId) {
  var id = _deviceKey(deviceId);
  if (!id) return Promise.resolve();
  return new Promise(function(resolve) {
    wx.closeBLEConnection({
      deviceId: id,
      complete: resolve
    });
  });
}

function _createConnection(deviceId, timeout) {
  var id = _deviceKey(deviceId);
  return new Promise(function(resolve, reject) {
    wx.createBLEConnection({
      deviceId: id,
      timeout: timeout,
      success: resolve,
      fail: reject
    });
  });
}

function _closeAdapterSilently() {
  return new Promise(function(resolve) {
    if (!wx.closeBluetoothAdapter) {
      resolve();
      return;
    }
    wx.closeBluetoothAdapter({
      complete: function complete() {
        _adapterReady = false;
        resolve();
      }
    });
  });
}

function _shouldRetryConnectError(err) {
  var code = err && typeof err.errCode === "number" ? err.errCode : -1;
  return code === 10003 || code === 10006 || code === 10012;
}

function _createConnectionWithRetry(_x5) {
  return _createConnectionWithRetry2.apply(this, arguments);
}

function _createConnectionWithRetry2() {
  _createConnectionWithRetry2 = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee10(deviceId) {
    var id, lastErr, i, alive;
    return _regeneratorRuntime2().wrap(function _callee10$(_context10) {
      while (1) switch (_context10.prev = _context10.next) {
        case 0:
          id = _deviceKey(deviceId);
          lastErr = null;
          i = 0;
        case 3:
          if (!(i < 2)) {
            _context10.next = 38;
            break;
          }
          if (!(i > 0)) {
            _context10.next = 13;
            break;
          }
          _context10.next = 7;
          return _closeAdapterSilently().catch(function() {});
        case 7:
          _context10.next = 9;
          return _sleep(180);
        case 9:
          _context10.next = 11;
          return init().catch(function() {});
        case 11:
          _context10.next = 13;
          return stopScan().catch(function() {});
        case 13:
          _context10.next = 15;
          return _closeConnectionSilently(id).catch(function() {});
        case 15:
          _context10.next = 17;
          return _sleep(120 + i * 180);
        case 17:
          _context10.prev = 17;
          _context10.next = 20;
          return _createConnection(id, CONNECT_TIMEOUT_MS);
        case 20:
          return _context10.abrupt("return");
        case 23:
          _context10.prev = 23;
          _context10.t0 = _context10["catch"](17);
          lastErr = _context10.t0;
          _context10.next = 28;
          return _isConnectedInternal(id).catch(function() {
            return false;
          });
        case 28:
          alive = _context10.sent;
          if (!alive) {
            _context10.next = 31;
            break;
          }
          return _context10.abrupt("return");
        case 31:
          if (!(i >= 1 || !_shouldRetryConnectError(_context10.t0))) {
            _context10.next = 33;
            break;
          }
          throw _context10.t0;
        case 33:
          _context10.next = 35;
          return init().catch(function() {});
        case 35:
          i++;
          _context10.next = 3;
          break;
        case 38:
          throw lastErr || new Error("create connection failed");
        case 39:
        case "end":
          return _context10.stop();
      }
    }, _callee10, null, [
      [17, 23]
    ]);
  }));
  return _createConnectionWithRetry2.apply(this, arguments);
}

function _getServices(deviceId) {
  var id = _deviceKey(deviceId);
  return new Promise(function(resolve, reject) {
    wx.getBLEDeviceServices({
      deviceId: id,
      success: function success(res) {
        return resolve(_safeArray(res && res.services));
      },
      fail: reject
    });
  });
}

function _getCharacteristics(deviceId, serviceId) {
  var id = _deviceKey(deviceId);
  return new Promise(function(resolve, reject) {
    wx.getBLEDeviceCharacteristics({
      deviceId: id,
      serviceId: serviceId,
      success: function success(res) {
        return resolve(_safeArray(res && res.characteristics));
      },
      fail: reject
    });
  });
}

function _enableNotify(deviceId, serviceId, characteristicId) {
  var id = _deviceKey(deviceId);
  return new Promise(function(resolve, reject) {
    wx.notifyBLECharacteristicValueChange({
      state: true,
      deviceId: id,
      serviceId: serviceId,
      characteristicId: characteristicId,
      success: resolve,
      fail: reject
    });
  });
}

function _pickService(services) {
  var list = _safeArray(services);
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    if (!item || !item.uuid) continue;
    if (_uuidMatches(item.uuid, SERVICE_UUID)) {
      return item;
    }
  }
  return null;
}

function _pickCharacteristic(chars, targetUuid) {
  var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  var list = _safeArray(chars);
  var requireNotify = !!options.requireNotify;
  var requireWrite = !!options.requireWrite;
  var match = function match(item) {
    if (!item || !item.uuid || !_uuidMatches(item.uuid, targetUuid)) return false;
    if (requireNotify && !(item.properties && item.properties.notify)) return false;
    if (requireWrite && !(item.properties && (item.properties.write || item.properties.writeNoResponse))) return false;
    return true;
  };
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    if (match(item)) return item;
  }

  // Fallback: UUID only
  for (var _i = 0; _i < list.length; _i++) {
    var _item = list[_i];
    if (!_item || !_item.uuid) continue;
    if (_uuidMatches(_item.uuid, targetUuid)) {
      return _item;
    }
  }
  return null;
}

function _prepareConnection(_x6) {
  return _prepareConnection2.apply(this, arguments);
}

function _prepareConnection2() {
  _prepareConnection2 = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee11(deviceId) {
    var id, services, service, chars, notify, write, info, entry;
    return _regeneratorRuntime2().wrap(function _callee11$(_context11) {
      while (1) switch (_context11.prev = _context11.next) {
        case 0:
          id = _deviceKey(deviceId);
          _context11.next = 3;
          return _retry(function() {
            return _getServices(id);
          }, DISCOVER_RETRY_TIMES, DISCOVER_RETRY_DELAY_MS);
        case 3:
          services = _context11.sent;
          service = _pickService(services);
          if (service) {
            _context11.next = 7;
            break;
          }
          throw {
            errCode: 10004,
              errMsg: "Service UUID not found"
          };
        case 7:
          _context11.next = 9;
          return _retry(function() {
            return _getCharacteristics(id, service.uuid);
          }, DISCOVER_RETRY_TIMES, DISCOVER_RETRY_DELAY_MS);
        case 9:
          chars = _context11.sent;
          notify = _pickCharacteristic(chars, NOTIFY_UUID, {
            requireNotify: true
          });
          write = _pickCharacteristic(chars, WRITE_UUID, {
            requireWrite: true
          });
          info = _pickCharacteristic(chars, INFO_UUID);
          if (!(!notify || !write)) {
            _context11.next = 15;
            break;
          }
          throw {
            errCode: 10005,
              errMsg: "Notify/Write characteristic not found"
          };
        case 15:
          _context11.next = 17;
          return _retry(function() {
            return _enableNotify(id, service.uuid, notify.uuid);
          }, NOTIFY_RETRY_TIMES, NOTIFY_RETRY_DELAY_MS);
        case 17:
          entry = _ensureLinkEntry(id);
          if (entry) {
            _context11.next = 20;
            break;
          }
          return _context11.abrupt("return");
        case 20:
          entry.serviceId = String(service.uuid || SERVICE_UUID);
          entry.notifyId = String(notify.uuid || NOTIFY_UUID);
          entry.writeId = String(write.uuid || WRITE_UUID);
          entry.infoId = info && info.uuid ? String(info.uuid) : "";
          entry.preparedAt = Date.now();
          entry.connected = true;
        case 26:
        case "end":
          return _context11.stop();
      }
    }, _callee11);
  }));
  return _prepareConnection2.apply(this, arguments);
}

function connect(deviceId) {
  var id = _deviceKey(deviceId);
  if (!id) return Promise.reject(new Error("deviceId required"));
  return _runDeviceTask(id, /*#__PURE__*/ _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee4() {
    var aliveBefore;
    return _regeneratorRuntime2().wrap(function _callee4$(_context4) {
      while (1) switch (_context4.prev = _context4.next) {
        case 0:
          _context4.next = 2;
          return init();
        case 2:
          _ensureConnStateListener();
          _context4.next = 5;
          return stopScan().catch(function() {});
        case 5:
          _context4.next = 7;
          return _sleep(100);
        case 7:
          _context4.next = 9;
          return _isConnectedInternal(id).catch(function() {
            return false;
          });
        case 9:
          aliveBefore = _context4.sent;
          if (aliveBefore) {
            _context4.next = 13;
            break;
          }
          _context4.next = 13;
          return _createConnectionWithRetry(id);
        case 13:
          _markConnected(id);
          _context4.next = 16;
          return _sleep(CONNECT_STABILIZE_MS);
        case 16:
          _context4.next = 18;
          return _prepareConnection(id);
        case 18:
          _markConnected(id);
          return _context4.abrupt("return", true);
        case 20:
        case "end":
          return _context4.stop();
      }
    }, _callee4);
  }))).then( /*#__PURE__*/ _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee5() {
    return _regeneratorRuntime2().wrap(function _callee5$(_context5) {
      while (1) switch (_context5.prev = _context5.next) {
        case 0:
          _context5.prev = 0;
          _context5.next = 3;
          return _sleep(280);
        case 3:
          _context5.next = 5;
          return syncPhoneTime(id, new Date(), {
            attempts: 3,
            delayMs: 320
          });
        case 5:
          _context5.next = 10;
          break;
        case 7:
          _context5.prev = 7;
          _context5.t0 = _context5["catch"](0);
          console.warn("[BLE time sync fail]", _context5.t0);
        case 10:
          return _context5.abrupt("return", true);
        case 11:
        case "end":
          return _context5.stop();
      }
    }, _callee5, null, [
      [0, 7]
    ]);
  })));
}

function _isNotifyFrame(deviceId, characteristicId) {
  var entry = _linkByDevice[_deviceKey(deviceId)];
  var expected = entry && entry.notifyId ? entry.notifyId : NOTIFY_UUID;
  return _uuidMatches(characteristicId, expected);
}

function _isInfoFrame(deviceId, characteristicId) {
  var entry = _linkByDevice[_deviceKey(deviceId)];
  var expected = entry && entry.infoId ? entry.infoId : INFO_UUID;
  return _uuidMatches(characteristicId, expected);
}

function _parseFrame(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 5) {
    throw new Error("Invalid notify frame");
  }
  var dv = new DataView(buffer);
  var tRaw = dv.getInt16(0, true);
  var tds = dv.getUint16(2, true);
  var heaterByte = dv.getUint8(4);
  var heaterOn = (heaterByte & 0x01) === 0x01;
  var baseTempValid = tRaw !== 8500 && tRaw !== -12700 && tRaw >= -5500 && tRaw <= 12500;
  var temperatureSensorPresent = null;
  var tdsSensorPresent = null;
  var tdsValid = Number.isFinite(tds);
  var tempValid = baseTempValid;
  var safetyLock = null;
  var flags = null;
  var gpsValid = false;
  var gpsLatitude = null;
  var gpsLongitude = null;
  var waterSensorPresent = null;
  var waterValid = false;
  var waterMl = null;
  if (buffer.byteLength >= 6) {
    flags = dv.getUint8(5);
    temperatureSensorPresent = (flags & 0x01) === 0x01;
    tempValid = tempValid && (flags & 0x02) === 0x02;
    tdsSensorPresent = (flags & 0x04) === 0x04;
    tdsValid = tdsValid && (flags & 0x08) === 0x08;
    safetyLock = (flags & 0x10) === 0x10;
    waterSensorPresent = (flags & 0x80) === 0x80;
  }
  var flagsByte = typeof flags === "number" ? flags : 0;
  var offset = 6;
  if (buffer.byteLength >= 14 && (flagsByte & 0x20) === 0x20) {
    var latE7 = dv.getInt32(6, true);
    var lngE7 = dv.getInt32(10, true);
    var lat = latE7 / 1e7;
    var lng = lngE7 / 1e7;
    var inRange = lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    if (inRange) {
      gpsLatitude = lat;
      gpsLongitude = lng;
      gpsValid = true;
    }
    offset = 14;
  }
  if (buffer.byteLength >= offset + 2 && (flagsByte & 0x40) === 0x40) {
    var ml = dv.getUint16(offset, true);
    if (Number.isFinite(ml)) {
      waterMl = ml;
      waterValid = true;
    }
  }
  var temperature = tempValid ? (tRaw / 100).toFixed(2) : "--";
  return {
    temperature: temperature,
    temperatureValid: tempValid,
    temperatureSensorPresent: temperatureSensorPresent,
    tds: tds,
    tdsValid: tdsValid,
    tdsSensorPresent: tdsSensorPresent,
    heaterOn: heaterOn,
    safetyLock: safetyLock,
    gpsValid: gpsValid,
    gpsLatitude: gpsLatitude,
    gpsLongitude: gpsLongitude,
    waterSensorPresent: waterSensorPresent,
    waterValid: waterValid,
    waterMl: waterMl,
    statusFlags: flags
  };
}

function _ensureNotifyListener() {
  if (_notifyBound || !wx.onBLECharacteristicValueChange) return;
  _notifyBound = true;
  wx.onBLECharacteristicValueChange(function(res) {
    if (!res || !res.deviceId || !res.characteristicId) return;
    if (_isNotifyFrame(res.deviceId, res.characteristicId) || _isInfoFrame(res.deviceId, res.characteristicId)) {
      _emitCharacteristicValue(res.deviceId, res.characteristicId, res.value);
    }
    if (!_isNotifyFrame(res.deviceId, res.characteristicId)) return;
    var handlers = _notifyHandlers[res.deviceId];
    if (!handlers || !handlers.size) return;
    try {
      var payload = _parseFrame(res.value);
      handlers.forEach(function(handler) {
        try {
          handler(payload);
        } catch (err) {
          console.error("[BLE notify handler fail]", err);
        }
      });
    } catch (err) {
      console.error("[BLE notify parse fail]", err);
    }
  });
}

function onNotifyParsed(deviceId, cb) {
  var id = _deviceKey(deviceId);
  if (!id || typeof cb !== "function") return function() {};
  _ensureNotifyListener();
  if (!_notifyHandlers[id]) {
    _notifyHandlers[id] = new Set();
  }
  _notifyHandlers[id].add(cb);
  return function() {
    var handlers = _notifyHandlers[id];
    if (!handlers) return;
    handlers.delete(cb);
    if (!handlers.size) {
      delete _notifyHandlers[id];
    }
  };
}

function _readCharacteristic(deviceId, serviceId, characteristicId) {
  var id = _deviceKey(deviceId);
  _ensureNotifyListener();
  var pending = _waitCharacteristicValue(id, characteristicId);
  pending.catch(function() {});
  return new Promise(function(resolve, reject) {
    wx.readBLECharacteristicValue({
      deviceId: id,
      serviceId: serviceId,
      characteristicId: characteristicId,
      success: function() {
        var _success2 = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee6(res) {
          var value;
          return _regeneratorRuntime2().wrap(function _callee6$(_context6) {
            while (1) switch (_context6.prev = _context6.next) {
              case 0:
                if (!(res && res.value instanceof ArrayBuffer)) {
                  _context6.next = 4;
                  break;
                }
                _emitCharacteristicValue(id, characteristicId, res.value);
                resolve(res.value);
                return _context6.abrupt("return");
              case 4:
                _context6.prev = 4;
                _context6.next = 7;
                return pending;
              case 7:
                value = _context6.sent;
                resolve(value);
                _context6.next = 14;
                break;
              case 11:
                _context6.prev = 11;
                _context6.t0 = _context6["catch"](4);
                reject(_context6.t0);
              case 14:
              case "end":
                return _context6.stop();
            }
          }, _callee6, null, [
            [4, 11]
          ]);
        }));

        function success(_x7) {
          return _success2.apply(this, arguments);
        }
        return success;
      }(),
      fail: function fail(err) {
        _rejectCharacteristicValue(id, characteristicId, err);
        reject(err);
      }
    });
  });
}

function _resolveInfoTarget(_x8) {
  return _resolveInfoTarget2.apply(this, arguments);
}

function _resolveInfoTarget2() {
  _resolveInfoTarget2 = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee12(deviceId) {
    var id, alive, entry;
    return _regeneratorRuntime2().wrap(function _callee12$(_context12) {
      while (1) switch (_context12.prev = _context12.next) {
        case 0:
          id = _deviceKey(deviceId);
          if (id) {
            _context12.next = 3;
            break;
          }
          throw new Error("deviceId required");
        case 3:
          _context12.next = 5;
          return _isConnectedInternal(id);
        case 5:
          alive = _context12.sent;
          if (alive) {
            _context12.next = 8;
            break;
          }
          throw {
            errCode: 10006,
              errMsg: "Connection not active"
          };
        case 8:
          entry = _linkByDevice[id];
          if (!(!entry || !entry.serviceId || !entry.connected)) {
            _context12.next = 13;
            break;
          }
          _context12.next = 12;
          return _prepareConnection(id);
        case 12:
          entry = _linkByDevice[id];
        case 13:
          if (!(!entry || !entry.serviceId || !entry.infoId)) {
            _context12.next = 15;
            break;
          }
          return _context12.abrupt("return", null);
        case 15:
          return _context12.abrupt("return", {
            serviceId: entry.serviceId,
            characteristicId: entry.infoId
          });
        case 16:
        case "end":
          return _context12.stop();
      }
    }, _callee12);
  }));
  return _resolveInfoTarget2.apply(this, arguments);
}

function readDeviceProfile(_x9) {
  return _readDeviceProfile.apply(this, arguments);
}

function _readDeviceProfile() {
  _readDeviceProfile = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee13(deviceId) {
    var options,
      id,
      retries,
      delayMs,
      lastProfile,
      lastErr,
      i,
      target,
      value,
      text,
      data,
      profile,
      _args13 = arguments;
    return _regeneratorRuntime2().wrap(function _callee13$(_context13) {
      while (1) switch (_context13.prev = _context13.next) {
        case 0:
          options = _args13.length > 1 && _args13[1] !== undefined ? _args13[1] : {};
          id = _deviceKey(deviceId);
          if (id) {
            _context13.next = 4;
            break;
          }
          return _context13.abrupt("return", Promise.reject(new Error("deviceId required")));
        case 4:
          retries = Math.max(1, Number(options.retries) || 1);
          delayMs = Math.max(120, Number(options.delayMs) || 600);
          lastProfile = null;
          lastErr = null;
          i = 0;
        case 9:
          if (!(i < retries)) {
            _context13.next = 38;
            break;
          }
          _context13.prev = 10;
          _context13.next = 13;
          return _resolveInfoTarget(id);
        case 13:
          target = _context13.sent;
          if (target) {
            _context13.next = 16;
            break;
          }
          return _context13.abrupt("return", null);
        case 16:
          _context13.next = 18;
          return _readCharacteristic(id, target.serviceId, target.characteristicId);
        case 18:
          value = _context13.sent;
          text = _arrayBufferToString(value).trim();
          if (text) {
            _context13.next = 22;
            break;
          }
          return _context13.abrupt("return", null);
        case 22:
          data = JSON.parse(text);
          profile = {
            bleName: String(data.bleName || "").trim(),
            imei: String(data.imei || "").trim(),
            deviceId: String(data.deviceId || data.imei || "").trim(),
            firmwareVersion: String(data.fw || data.firmwareVersion || "").trim()
          };
          lastProfile = profile;
          if (!(profile.deviceId || profile.imei || profile.bleName)) {
            _context13.next = 27;
            break;
          }
          return _context13.abrupt("return", profile);
        case 27:
          _context13.next = 32;
          break;
        case 29:
          _context13.prev = 29;
          _context13.t0 = _context13["catch"](10);
          lastErr = _context13.t0;
        case 32:
          if (!(i < retries - 1)) {
            _context13.next = 35;
            break;
          }
          _context13.next = 35;
          return _sleep(delayMs);
        case 35:
          i++;
          _context13.next = 9;
          break;
        case 38:
          if (!lastProfile) {
            _context13.next = 40;
            break;
          }
          return _context13.abrupt("return", lastProfile);
        case 40:
          if (!lastErr) {
            _context13.next = 42;
            break;
          }
          throw lastErr;
        case 42:
          return _context13.abrupt("return", null);
        case 43:
        case "end":
          return _context13.stop();
      }
    }, _callee13, null, [
      [10, 29]
    ]);
  }));
  return _readDeviceProfile.apply(this, arguments);
}

function _resolveWriteTarget(_x10) {
  return _resolveWriteTarget2.apply(this, arguments);
}

function _resolveWriteTarget2() {
  _resolveWriteTarget2 = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee14(deviceId) {
    var id, alive, entry;
    return _regeneratorRuntime2().wrap(function _callee14$(_context14) {
      while (1) switch (_context14.prev = _context14.next) {
        case 0:
          id = _deviceKey(deviceId);
          if (id) {
            _context14.next = 3;
            break;
          }
          throw new Error("deviceId required");
        case 3:
          _context14.next = 5;
          return _isConnectedInternal(id);
        case 5:
          alive = _context14.sent;
          if (alive) {
            _context14.next = 8;
            break;
          }
          throw {
            errCode: 10006,
              errMsg: "Connection not active"
          };
        case 8:
          entry = _linkByDevice[id];
          if (!(!entry || !entry.serviceId || !entry.writeId || !entry.connected)) {
            _context14.next = 13;
            break;
          }
          _context14.next = 12;
          return _prepareConnection(id);
        case 12:
          entry = _linkByDevice[id];
        case 13:
          return _context14.abrupt("return", {
            serviceId: entry && entry.serviceId || SERVICE_UUID,
            characteristicId: entry && entry.writeId || WRITE_UUID
          });
        case 14:
        case "end":
          return _context14.stop();
      }
    }, _callee14);
  }));
  return _resolveWriteTarget2.apply(this, arguments);
}

function _writeValue(_x11, _x12) {
  return _writeValue2.apply(this, arguments);
}

function _writeValue2() {
  _writeValue2 = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee16(deviceId, value) {
    var id;
    return _regeneratorRuntime2().wrap(function _callee16$(_context16) {
      while (1) switch (_context16.prev = _context16.next) {
        case 0:
          id = _deviceKey(deviceId);
          return _context16.abrupt("return", _runDeviceTask(id, /*#__PURE__*/ _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee15() {
            var target, doWrite, code, entry;
            return _regeneratorRuntime2().wrap(function _callee15$(_context15) {
              while (1) switch (_context15.prev = _context15.next) {
                case 0:
                  _context15.next = 2;
                  return _resolveWriteTarget(id);
                case 2:
                  target = _context15.sent;
                  doWrite = function doWrite() {
                    return new Promise(function(resolve, reject) {
                      wx.writeBLECharacteristicValue({
                        deviceId: id,
                        serviceId: target.serviceId,
                        characteristicId: target.characteristicId,
                        value: value,
                        success: resolve,
                        fail: reject
                      });
                    });
                  };
                  _context15.prev = 4;
                  _context15.next = 7;
                  return doWrite();
                case 7:
                  return _context15.abrupt("return", _context15.sent);
                case 10:
                  _context15.prev = 10;
                  _context15.t0 = _context15["catch"](4);
                  code = _context15.t0 && typeof _context15.t0.errCode === "number" ? _context15.t0.errCode : -1;
                  if (!(code !== 10007)) {
                    _context15.next = 15;
                    break;
                  }
                  throw _context15.t0;
                case 15:
                  // Re-discover once in case cached characteristic id is stale/wrong.
                  entry = _linkByDevice[id];
                  if (entry) {
                    entry.serviceId = "";
                    entry.writeId = "";
                    entry.notifyId = entry.notifyId || "";
                  }
                  _context15.next = 19;
                  return _prepareConnection(id);
                case 19:
                  _context15.next = 21;
                  return _resolveWriteTarget(id);
                case 21:
                  target = _context15.sent;
                  return _context15.abrupt("return", doWrite());
                case 23:
                case "end":
                  return _context15.stop();
              }
            }, _callee15, null, [
              [4, 10]
            ]);
          }))));
        case 2:
        case "end":
          return _context16.stop();
      }
    }, _callee16);
  }));
  return _writeValue2.apply(this, arguments);
}

function writeHeat(deviceId, on) {
  var buf = new ArrayBuffer(1);
  new DataView(buf).setUint8(0, on ? 1 : 0);
  return _writeValue(deviceId, buf);
}

function writeCommand(deviceId, bytes) {
  var id = _deviceKey(deviceId);
  if (!id) return Promise.reject(new Error("deviceId required"));
  var list = Array.isArray(bytes) ? bytes : [];
  if (!list.length) return Promise.reject(new Error("bytes required"));
  var buf = new ArrayBuffer(list.length);
  var dv = new DataView(buf);
  for (var i = 0; i < list.length; i++) {
    var n = Number(list[i]);
    dv.setUint8(i, Number.isFinite(n) ? n & 0xFF : 0);
  }
  return _writeValue(id, buf);
}

function syncPhoneTime(_x13) {
  return _syncPhoneTime.apply(this, arguments);
}

function _syncPhoneTime() {
  _syncPhoneTime = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee17(deviceId) {
    var date,
      options,
      d,
      payload,
      attempts,
      delayMs,
      lastErr,
      i,
      _args17 = arguments;
    return _regeneratorRuntime2().wrap(function _callee17$(_context17) {
      while (1) switch (_context17.prev = _context17.next) {
        case 0:
          date = _args17.length > 1 && _args17[1] !== undefined ? _args17[1] : new Date();
          options = _args17.length > 2 && _args17[2] !== undefined ? _args17[2] : {};
          d = date instanceof Date ? date : new Date(date);
          if (!(!(d instanceof Date) || Number.isNaN(d.getTime()))) {
            _context17.next = 5;
            break;
          }
          return _context17.abrupt("return", Promise.reject(new Error("valid date required")));
        case 5:
          payload = [0x30, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()];
          attempts = Math.max(1, Math.min(5, Math.round(Number(options.attempts) || 3)));
          delayMs = Math.max(0, Math.round(Number(options.delayMs) || 260));
          lastErr = null;
          i = 0;
        case 10:
          if (!(i < attempts)) {
            _context17.next = 26;
            break;
          }
          _context17.prev = 11;
          _context17.next = 14;
          return writeCommand(deviceId, payload);
        case 14:
          return _context17.abrupt("return", true);
        case 17:
          _context17.prev = 17;
          _context17.t0 = _context17["catch"](11);
          lastErr = _context17.t0;
          if (!(i < attempts - 1)) {
            _context17.next = 23;
            break;
          }
          _context17.next = 23;
          return _sleep(delayMs);
        case 23:
          i++;
          _context17.next = 10;
          break;
        case 26:
          throw lastErr || new Error("time sync failed");
        case 27:
        case "end":
          return _context17.stop();
      }
    }, _callee17, null, [
      [11, 17]
    ]);
  }));
  return _syncPhoneTime.apply(this, arguments);
}

function triggerReminderBlink(deviceId) {
  var seconds = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 10;
  var s = Math.max(1, Math.min(60, Math.round(Number(seconds) || 10)));
  return writeCommand(deviceId, [0x20, s]);
}

function getRSSI(deviceId) {
  var id = _deviceKey(deviceId);
  if (!id) return Promise.reject(new Error("deviceId required"));
  return new Promise(function(resolve, reject) {
    if (!wx.getBLEDeviceRSSI) {
      reject(new Error("wx.getBLEDeviceRSSI not supported"));
      return;
    }
    wx.getBLEDeviceRSSI({
      deviceId: id,
      success: function success(res) {
        return resolve(res.RSSI);
      },
      fail: reject
    });
  });
}

function disconnect(deviceId) {
  var id = _deviceKey(deviceId);
  if (!id) return Promise.resolve();
  return _runDeviceTask(id, /*#__PURE__*/ _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee7() {
    return _regeneratorRuntime2().wrap(function _callee7$(_context7) {
      while (1) switch (_context7.prev = _context7.next) {
        case 0:
          _clearDisconnectVerify(id);
          delete _notifyHandlers[id];
          _markDisconnected(id);
          _context7.next = 5;
          return _closeConnectionSilently(id).catch(function() {});
        case 5:
        case "end":
          return _context7.stop();
      }
    }, _callee7);
  })));
}

function explainBleError(err) {
  var code = err && typeof err.errCode === "number" ? err.errCode : null;
  var msg = err && err.errMsg ? String(err.errMsg) : "";
  var text = code !== null ? BLE_ERROR_TEXT[code] || "蓝牙错误" : "蓝牙错误";
  if (code === 10003 && /status:8/i.test(msg)) {
    text = "连接失败（设备响应超时或被中断）";
  }
  return {
    code: code,
    text: text,
    msg: msg,
    raw: err
  };
}
module.exports = {
  SERVICE_UUID: SERVICE_UUID,
  NOTIFY_UUID: NOTIFY_UUID,
  WRITE_UUID: WRITE_UUID,
  INFO_UUID: INFO_UUID,
  init: init,
  getAdapterState: getAdapterState,
  onDeviceFound: onDeviceFound,
  startScan: startScan,
  stopScan: stopScan,
  isConnected: _isConnectedInternal,
  connect: connect,
  onNotifyParsed: onNotifyParsed,
  readDeviceProfile: readDeviceProfile,
  writeHeat: writeHeat,
  writeCommand: writeCommand,
  syncPhoneTime: syncPhoneTime,
  triggerReminderBlink: triggerReminderBlink,
  getRSSI: getRSSI,
  disconnect: disconnect,
  explainBleError: explainBleError
};