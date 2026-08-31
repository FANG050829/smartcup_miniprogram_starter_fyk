var _regeneratorRuntime2 = require("../../@babel/runtime/helpers/regeneratorRuntime");
var _asyncToGenerator2 = require("../../@babel/runtime/helpers/asyncToGenerator");
var ble = require('../../utils/ble');
var deviceRegistry = require('../../utils/deviceRegistry');

/* ============================================================
 * 就绪位归一：微信的 scope.bluetooth / scope.userNotification
 * 拿不到真实开关（授权表里恒为 undefined，界面会永远显示「未开启」），
 * 改用三层真实信号，旧字段只做降级兜底：
 *   蓝牙 = 系统蓝牙开关(wx.getSystemSetting) ?? scope.bluetooth
 *   位置 = 授权 scope.userLocation(userFuzzyLocation) 且系统定位服务开
 *   通知 = 订阅消息总开关(subscriptionsSetting.mainSwitch) ?? scope.userNotification
 * ============================================================ */
function normalizePerms(authSetting, subscriptionsSetting, systemSetting) {
  authSetting = authSetting || {};
  var btScope = !!authSetting['scope.bluetooth'];
  var systemBt = systemSetting && typeof systemSetting.bluetoothEnabled === 'boolean'
    ? systemSetting.bluetoothEnabled
    : btScope;
  var locationScope = !!(authSetting['scope.userLocation'] || authSetting['scope.userFuzzyLocation']);
  var systemLoc = systemSetting && typeof systemSetting.locationEnabled === 'boolean'
    ? systemSetting.locationEnabled
    : true;
  return {
    permBluetooth: systemBt || btScope,
    permLocation: locationScope && systemLoc,
    permNotification: !!(subscriptionsSetting && subscriptionsSetting.mainSwitch) || !!authSetting['scope.userNotification']
  };
}

var PERM_NAMES = { permBluetooth: '蓝牙', permLocation: '位置', permNotification: '通知' };

function buildSummary(perms) {
  var missing = [];
  if (!perms.permBluetooth) missing.push(PERM_NAMES.permBluetooth);
  if (!perms.permLocation) missing.push(PERM_NAMES.permLocation);
  if (!perms.permNotification) missing.push(PERM_NAMES.permNotification);
  if (!missing.length) return '蓝牙、位置、通知均已开启';
  return '还差：' + missing.join('、');
}

Page({
  data: {
    permBluetooth: false,
    permLocation: false,
    permNotification: false,
    summaryText: '正在读取系统权限状态',
    deviceConnected: false,
    deviceName: '',
    pageAnim: ''
  },
  onShow: function onShow() {
    this._fxFlip = !this._fxFlip;
    this.setData({ pageAnim: 'fx-on' + (this._fxFlip ? '2' : '') });
    this.checkPermissions();
    this.checkDeviceConnection();
  },
  /* 统一落库：归一 → 摘要文案，检测与 openSetting 返回共用这一条路 */
  applyPerms: function applyPerms(authSetting, subscriptionsSetting, systemSetting) {
    var perms = normalizePerms(authSetting, subscriptionsSetting, systemSetting);
    this.setData({
      permBluetooth: perms.permBluetooth,
      permLocation: perms.permLocation,
      permNotification: perms.permNotification,
      summaryText: buildSummary(perms)
    });
  },
  checkPermissions: function checkPermissions() {
    var _this = this;
    wx.getSetting({
      withSubscriptions: true,
      success: function success(res) {
        var systemSetting = null;
        try {
          if (typeof wx.getSystemSetting === 'function') {
            systemSetting = wx.getSystemSetting();
          }
        } catch (e) {
          systemSetting = null;
        }
        _this.applyPerms(res.authSetting, res.subscriptionsSetting, systemSetting);
      },
      fail: function fail() {
        console.warn('[permission] wx.getSetting failed');
        _this.setData({ summaryText: '读取权限状态失败，可尝试重新进入本页' });
      }
    });
  },
  checkDeviceConnection: function checkDeviceConnection() {
    var _this2 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee() {
      var device, connected;
      return _regeneratorRuntime2().wrap(function _callee$(_context) {
        while (1) switch (_context.prev = _context.next) {
          case 0:
            _context.prev = 0;
            device = deviceRegistry.resolveTrackedDevice();
            if (!(!device || !device.id)) {
              _context.next = 5;
              break;
            }
            _this2.setData({
              deviceConnected: false,
              deviceName: ''
            });
            return _context.abrupt("return");
          case 5:
            _context.next = 7;
            return ble.isConnected(device.id).catch(function() {
              return false;
            });
          case 7:
            connected = _context.sent;
            _this2.setData({
              deviceConnected: connected,
              deviceName: device.name || device.bleName || '智能水杯'
            });
            _context.next = 15;
            break;
          case 11:
            _context.prev = 11;
            _context.t0 = _context["catch"](0);
            console.warn('[permission] checkDeviceConnection error:', _context.t0);
            _this2.setData({
              deviceConnected: false,
              deviceName: ''
            });
          case 15:
          case "end":
            return _context.stop();
        }
      }, _callee, null, [
        [0, 11]
      ]);
    }))();
  },
  openSetting: function openSetting() {
    var _this3 = this;
    if (!wx.openSetting) {
      wx.showToast({
        title: '当前微信版本不支持',
        icon: 'none'
      });
      return;
    }
    wx.openSetting({
      success: function success() {
        /* 从系统设置回来后统一重检，避免与 getSetting 两套口径 */
        _this3.checkPermissions();
      }
    });
  }
});
