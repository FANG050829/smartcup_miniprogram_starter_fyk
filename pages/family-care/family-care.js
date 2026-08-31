var _regeneratorRuntime2 = require("../../@babel/runtime/helpers/regeneratorRuntime");
var _asyncToGenerator2 = require("../../@babel/runtime/helpers/asyncToGenerator");
var drinkData = require("../../utils/drinkData");
var deviceRegistry = require("../../utils/deviceRegistry");
var FUNCTION_NAME = "familyCare";
var NICKNAME_KEY = "smartcup_family_nick_name";

function pad2(value) {
  var n = Math.round(Number(value));
  return n < 10 ? "0".concat(n) : "".concat(n);
}

function toDateKey() {
  var date = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : new Date();
  var d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return "".concat(d.getFullYear(), "-").concat(pad2(d.getMonth() + 1), "-").concat(pad2(d.getDate()));
}

function formatRelativeTime(ts) {
  var num = Number(ts);
  if (!Number.isFinite(num) || num <= 0) return "未知";
  var diff = Date.now() - num;
  if (diff < 0) return "刚刚";
  var minute = 60 * 1000;
  var hour = 60 * minute;
  var day = 24 * hour;
  if (diff < minute) return "刚刚";
  if (diff < hour) return "".concat(Math.floor(diff / minute), " \u5206\u949F\u524D");
  if (diff < day) return "".concat(Math.floor(diff / hour), " \u5C0F\u65F6\u524D");
  if (diff < 7 * day) return "".concat(Math.floor(diff / day), " \u5929\u524D");
  var d = new Date(num);
  return "".concat(d.getMonth() + 1, "\u6708").concat(d.getDate(), "\u65E5");
}

function buildSnapshotView(snapshot) {
  if (!snapshot || !snapshot.summary) {
    return {
      hasData: false,
      amount: 0,
      goal: 2000,
      percent: 0,
      statusText: "暂无记录",
      statusTone: "muted",
      lastWaterText: "暂无",
      deviceName: "智饮杯",
      updatedAtText: "—"
    };
  }
  var summary = snapshot.summary || {};
  var amount = Math.max(0, Math.round(Number(summary.todayAmount) || 0));
  var goal = Math.max(800, Math.min(6000, Math.round(Number(summary.goalMl) || 2000)));
  var percent = goal > 0 ? Math.min(100, Math.round(amount / goal * 100)) : 0;
  var statusText = summary.statusText || "等待记录";
  var statusTone = summary.statusTone || "muted";
  if (amount > 0 && !summary.statusText) {
    if (percent >= 100) {
      statusText = "已达成";
      statusTone = "success";
    } else if (percent >= 70) {
      statusText = "接近目标";
      statusTone = "warning";
    } else {
      statusText = "继续努力";
      statusTone = "info";
    }
  }
  return {
    hasData: true,
    amount: amount,
    goal: goal,
    percent: percent,
    statusText: statusText,
    statusTone: statusTone,
    lastWaterText: summary.lastWaterText || "暂无",
    deviceName: snapshot.deviceName || "智饮杯",
    updatedAtText: formatRelativeTime(snapshot.updatedAt)
  };
}

function friendlyError(err) {
  var msg = String((err && err.message) || err || "");
  if (/cloud|errCode|-404|FUNCTION|ENV_NOT|INIT/i.test(msg)) return "云服务暂时不可用，请稍后重试";
  if (/timeout|abort|network|request:fail/i.test(msg)) return "网络异常，请检查网络后重试";
  return msg || "操作失败";
}

function callFamilyCare(data) {
  if (!wx.cloud) return Promise.reject(new Error("云开发未启用"));
  return wx.cloud.callFunction({
    name: FUNCTION_NAME,
    data: data
  }).then(function(res) {
    var result = res && res.result ? res.result : {};
    if (!result.ok) throw new Error(result.error || "操作失败");
    return result;
  }).catch(function(err) {
    throw new Error(friendlyError(err));
  });
}
Page({
  data: {
    loading: true,
    busy: false,
    profile: null,
    bindCode: "",
    careTargets: [],
    careViewers: [],
    ownSnapshotView: {
      hasData: false,
      amount: 0,
      goal: 2000,
      percent: 0,
      statusText: "暂无记录",
      statusTone: "muted"
    },
    bindCodeInput: "",
    relationInput: "",
    refreshing: false,
    submitting: false,
    nickName: "",
    deviceId: "",
    deviceName: "",
    hasCup: false
  },
  onShow: function onShow() {
    this._alive = true;
    this._syncCurrentDevice();
    // 缓存昵称避免每次切回都 setData
    var lastName = this._lastNameCache;
    var name = "";
    try {
      name = String(wx.getStorageSync(NICKNAME_KEY) || "").trim();
    } catch (e) {}
    this._lastNameCache = name;
    if (name !== lastName) {
      this.setData({
        nickName: name
      });
    }
    // 节流：30s 内不重复拉取云函数
    var now = Date.now();
    var shouldRefresh = !this._lastLoadAt || now - this._lastLoadAt > 30000;
    if (shouldRefresh) {
      this._lastLoadAt = now;
      this._loadSummary(true);
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
    this._lastLoadAt = Date.now();
    this._loadSummary(false).finally(function() {
      wx.stopPullDownRefresh && wx.stopPullDownRefresh();
    });
  },
  _syncCurrentDevice: function _syncCurrentDevice() {
    var dev = deviceRegistry.resolveTrackedDevice() || null;
    var id = String(dev && dev.id || "");
    var name = String(dev && dev.name || "").trim();
    this.setData({
      deviceId: id,
      deviceName: name || "我的水杯",
      hasCup: !!id
    });
  },
  goDevice: function goDevice() {
    wx.navigateTo({
      url: "/pages/device/device",
      fail: function fail() {
        wx.showToast({ title: "打开设备管理失败", icon: "none" });
      }
    });
  },
  _loadNickName: function _loadNickName() {
    var name = "";
    try {
      name = String(wx.getStorageSync(NICKNAME_KEY) || "").trim();
    } catch (e) {}
    this._lastNameCache = name;
    this.setData({
      nickName: name
    });
  },
  _loadSummary: function _loadSummary(showLoading) {
    var _this = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee() {
      var loadingPatch, result, profile, bindCode, careTargets, careViewers, ownSnapshotView;
      return _regeneratorRuntime2().wrap(function _callee$(_context) {
        while (1) switch (_context.prev = _context.next) {
          case 0:
            if (_this._alive) {
              _context.next = 2;
              break;
            }
            return _context.abrupt("return");
          case 2:
            // 合并 loading 与 refreshing 为一次 setData
            loadingPatch = {};
            if (showLoading) loadingPatch.loading = true;
            loadingPatch.refreshing = true;
            _this.setData(loadingPatch);
            _context.prev = 6;
            _context.next = 9;
            return callFamilyCare({
              action: "getSummary",
              nickName: _this.data.nickName
            });
          case 9:
            result = _context.sent;
            if (_this._alive) {
              _context.next = 12;
              break;
            }
            return _context.abrupt("return");
          case 12:
            profile = result.profile || null;
            bindCode = profile && profile.bindCode ? profile.bindCode : "";
            careTargets = (result.careTargets || []).map(function(item) {
              return {
                id: item.id,
                relation: item.relation || "家人",
                status: item.status,
                updatedAtText: formatRelativeTime(item.updatedAt),
                owner: item.owner,
                snapshotView: buildSnapshotView(item.snapshot)
              };
            });
            careViewers = (result.careViewers || []).map(function(item) {
              return {
                id: item.id,
                viewerName: item.viewerName,
                relation: item.relation || "家人",
                status: item.status,
                updatedAtText: formatRelativeTime(item.updatedAt)
              };
            });
            ownSnapshotView = buildSnapshotView(result.snapshot); // 合并结果与 loading 状态为一次 setData
            _this.setData({
              loading: false,
              refreshing: false,
              profile: profile,
              bindCode: bindCode,
              careTargets: careTargets,
              careViewers: careViewers,
              ownSnapshotView: ownSnapshotView
            });
            _context.next = 27;
            break;
          case 20:
            _context.prev = 20;
            _context.t0 = _context["catch"](6);
            console.warn("[family-care] load summary failed", _context.t0);
            if (_this._alive) {
              _context.next = 25;
              break;
            }
            return _context.abrupt("return");
          case 25:
            wx.showToast({
              title: String(_context.t0.message || "加载失败"),
              icon: "none"
            });
            _this.setData({
              loading: false,
              refreshing: false
            });
          case 27:
          case "end":
            return _context.stop();
        }
      }, _callee, null, [
        [6, 20]
      ]);
    }))();
  },
  onNickNameInput: function onNickNameInput(e) {
    var val = String(e.detail && e.detail.value || "").trim().slice(0, 24);
    this.setData({
      nickName: val
    });
  },
  saveNickName: function saveNickName() {
    var name = this.data.nickName;
    if (!this.data.hasCup) {
      wx.showToast({
        title: "请先绑定你的水杯",
        icon: "none"
      });
      return;
    }
    if (!name) {
      wx.showToast({
        title: "请输入昵称",
        icon: "none"
      });
      return;
    }
    try {
      wx.setStorageSync(NICKNAME_KEY, name);
    } catch (e) {}
    this._callLogin(name);
  },
  _callLogin: function _callLogin(nickName) {
    var _this2 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee2() {
      var result, profile;
      return _regeneratorRuntime2().wrap(function _callee2$(_context2) {
        while (1) switch (_context2.prev = _context2.next) {
          case 0:
            if (!_this2.data.busy) {
              _context2.next = 2;
              break;
            }
            return _context2.abrupt("return");
          case 2:
            _this2.setData({
              busy: true
            });
            _context2.prev = 3;
            _context2.next = 6;
            return callFamilyCare({
              action: "login",
              nickName: nickName,
              deviceId: _this2.data.deviceId,
              deviceName: _this2.data.deviceName
            });
          case 6:
            result = _context2.sent;
            profile = result.profile || null;
            _this2.setData({
              profile: profile,
              bindCode: profile && profile.bindCode ? profile.bindCode : ""
            });
            wx.showToast({
              title: "昵称已保存",
              icon: "success"
            });
            _this2._loadSummary(false);
            _context2.next = 16;
            break;
          case 13:
            _context2.prev = 13;
            _context2.t0 = _context2["catch"](3);
            wx.showToast({
              title: String(_context2.t0.message || "保存失败"),
              icon: "none"
            });
          case 16:
            _context2.prev = 16;
            _this2.setData({
              busy: false
            });
            return _context2.finish(16);
          case 19:
          case "end":
            return _context2.stop();
        }
      }, _callee2, null, [
        [3, 13, 16, 19]
      ]);
    }))();
  },
  onBindCodeInput: function onBindCodeInput(e) {
    var val = String(e.detail && e.detail.value || "").trim().toUpperCase();
    this.setData({
      bindCodeInput: val
    });
  },
  onRelationInput: function onRelationInput(e) {
    var val = String(e.detail && e.detail.value || "").trim().slice(0, 12);
    this.setData({
      relationInput: val
    });
  },
  bindFamily: function bindFamily() {
    var _this3 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee3() {
      var code, result;
      return _regeneratorRuntime2().wrap(function _callee3$(_context3) {
        while (1) switch (_context3.prev = _context3.next) {
          case 0:
            code = _this3.data.bindCodeInput;
            if (code) {
              _context3.next = 4;
              break;
            }
            wx.showToast({
              title: "请输入家人绑定码",
              icon: "none"
            });
            return _context3.abrupt("return");
          case 4:
            if (!_this3.data.busy) {
              _context3.next = 6;
              break;
            }
            return _context3.abrupt("return");
          case 6:
            _this3.setData({
              busy: true
            });
            _context3.prev = 7;
            _context3.next = 10;
            return callFamilyCare({
              action: "bindByCode",
              bindCode: code,
              viewerName: _this3.data.nickName || "家人",
              relation: _this3.data.relationInput || "家人"
            });
          case 10:
            result = _context3.sent;
            wx.showToast({
              title: "绑定成功",
              icon: "success"
            });
            _this3.setData({
              bindCodeInput: "",
              relationInput: ""
            });
            _this3._loadSummary(false);
            _context3.next = 19;
            break;
          case 16:
            _context3.prev = 16;
            _context3.t0 = _context3["catch"](7);
            wx.showToast({
              title: String(_context3.t0.message || "绑定失败"),
              icon: "none"
            });
          case 19:
            _context3.prev = 19;
            _this3.setData({
              busy: false
            });
            return _context3.finish(19);
          case 22:
          case "end":
            return _context3.stop();
        }
      }, _callee3, null, [
        [7, 16, 19, 22]
      ]);
    }))();
  },
  refreshBindCode: function refreshBindCode() {
    var _this4 = this;
    return new Promise(function(resolve) {
      wx.showModal({
        title: "刷新绑定码",
        content: "刷新后旧绑定码将立即失效，之前拿到旧码的家人将无法完成绑定。确定继续？",
        confirmText: "继续刷新",
        confirmColor: "#18a8d8",
        success: function success(r) {
          return resolve(r);
        },
        fail: function fail() {
          return resolve({
            confirm: false
          });
        }
      });
    }).then(function(res) {
      if (!res || !res.confirm) return;
      if (!_this4.data.hasCup) {
        wx.showToast({
          title: "请先绑定你的水杯",
          icon: "none"
        });
        return;
      }
      return _this4._doRefreshBindCode();
    });
  },
  _doRefreshBindCode: function _doRefreshBindCode() {
    var _this4 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee4() {
      var result, profile;
      return _regeneratorRuntime2().wrap(function _callee4$(_context4) {
        while (1) switch (_context4.prev = _context4.next) {
          case 0:
            if (!_this4.data.busy) {
              _context4.next = 2;
              break;
            }
            return _context4.abrupt("return");
          case 2:
            _this4.setData({
              busy: true
            });
            _context4.prev = 3;
            _context4.next = 6;
            return callFamilyCare({
              action: "createCode",
              deviceId: _this4.data.deviceId,
              deviceName: _this4.data.deviceName
            });
          case 6:
            result = _context4.sent;
            profile = result.profile || null;
            _this4.setData({
              bindCode: result.code || profile && profile.bindCode || ""
            });
            wx.showToast({
              title: "绑定码已刷新",
              icon: "success"
            });
            _context4.next = 15;
            break;
          case 12:
            _context4.prev = 12;
            _context4.t0 = _context4["catch"](3);
            wx.showToast({
              title: String(_context4.t0.message || "刷新失败"),
              icon: "none"
            });
          case 15:
            _context4.prev = 15;
            _this4.setData({
              busy: false
            });
            return _context4.finish(15);
          case 18:
          case "end":
            return _context4.stop();
        }
      }, _callee4, null, [
        [3, 12, 15, 18]
      ]);
    }))();
  },
  copyBindCode: function copyBindCode() {
    if (!this.data.bindCode) return;
    wx.setClipboardData({
      data: this.data.bindCode,
      success: function success() {
        wx.showToast({
          title: "已复制绑定码",
          icon: "none"
        });
      }
    });
  },
  shareBindCode: function shareBindCode() {
    if (!this.data.bindCode) return;
    wx.setClipboardData({
      data: "\u6211\u7684\u667A\u996E\u676F\u5BB6\u5EAD\u5173\u6000\u7ED1\u5B9A\u7801\uFF1A".concat(this.data.bindCode, "\uFF0C\u6253\u5F00\u667A\u996E\u676F\u5C0F\u7A0B\u5E8F-\u5BB6\u5EAD\u5173\u6000\uFF0C\u8F93\u5165\u6B64\u7801\u5373\u53EF\u4E92\u76F8\u5173\u6CE8\u996E\u6C34\u60C5\u51B5\u3002"),
      success: function success() {
        wx.showToast({
          title: "分享文案已复制",
          icon: "none"
        });
      }
    });
  },
  submitSnapshot: function submitSnapshot() {
    var _this5 = this;
    if (!this.data.hasCup) {
      wx.showToast({
        title: "请先绑定你的水杯",
        icon: "none"
      });
      return;
    }
    return this._doSubmitSnapshot();
  },
  _doSubmitSnapshot: function _doSubmitSnapshot() {
    var _this5 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee5() {
      var store, todayKey, records, amount, goal, percent, statusText, statusTone, lastWaterText, last, ts, d, lastDeviceName;
      return _regeneratorRuntime2().wrap(function _callee5$(_context5) {
        while (1) switch (_context5.prev = _context5.next) {
          case 0:
            if (!_this5.data.submitting) {
              _context5.next = 2;
              break;
            }
            return _context5.abrupt("return");
          case 2:
            _this5.setData({
              submitting: true
            });
            _context5.prev = 3;
            _context5.next = 6;
            return drinkData.getStore({
              historyDays: 1
            });
          case 6:
            store = _context5.sent;
            todayKey = toDateKey(new Date());
            records = store && store.recordsByDate && store.recordsByDate[todayKey] || [];
            amount = records.reduce(function(sum, r) {
              return sum + (Number(r && r.amount) || 0);
            }, 0);
            goal = store && store.dailyGoalMl || 2000;
            percent = goal > 0 ? Math.min(100, Math.round(amount / goal * 100)) : 0;
            statusText = "等待记录";
            statusTone = "muted";
            if (amount > 0) {
              if (percent >= 100) {
                statusText = "已达成";
                statusTone = "success";
              } else if (percent >= 70) {
                statusText = "接近目标";
                statusTone = "warning";
              } else {
                statusText = "继续努力";
                statusTone = "info";
              }
            }
            lastWaterText = "暂无记录";
            if (records.length) {
              last = records[records.length - 1];
              ts = Number(last && last.ts);
              if (Number.isFinite(ts) && ts > 0) {
                d = new Date(ts);
                lastWaterText = "".concat(pad2(d.getHours()), ":").concat(pad2(d.getMinutes()));
              }
            }
            lastDeviceName = String(_this5.data.deviceName || wx.getStorageSync("smartcup_last_device_name") || "智饮杯").trim() || "智饮杯";
            _context5.next = 20;
            return callFamilyCare({
              action: "saveSnapshot",
              summary: {
                todayAmount: amount,
                goalMl: goal,
                percent: percent,
                statusText: statusText,
                statusTone: statusTone,
                lastWaterText: lastWaterText
              },
              deviceName: lastDeviceName,
              deviceId: _this5.data.deviceId
            });
          case 20:
            wx.showToast({
              title: "已同步今日数据",
              icon: "success"
            });
            _this5._loadSummary(false);
            _context5.next = 28;
            break;
          case 24:
            _context5.prev = 24;
            _context5.t0 = _context5["catch"](3);
            console.warn("[family-care] submit snapshot failed", _context5.t0);
            wx.showToast({
              title: String(_context5.t0.message || "同步失败"),
              icon: "none"
            });
          case 28:
            _context5.prev = 28;
            _this5.setData({
              submitting: false
            });
            return _context5.finish(28);
          case 31:
          case "end":
            return _context5.stop();
        }
      }, _callee5, null, [
        [3, 24, 28, 31]
      ]);
    }))();
  },
  unbindMember: function unbindMember(e) {
    var _this6 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee6() {
      var id, modalRes;
      return _regeneratorRuntime2().wrap(function _callee6$(_context6) {
        while (1) switch (_context6.prev = _context6.next) {
          case 0:
            id = String(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id || "");
            var role = String(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.role || "target");
            if (id) {
              _context6.next = 3;
              break;
            }
            return _context6.abrupt("return");
          case 3:
            _context6.next = 5;
            return new Promise(function(resolve) {
              wx.showModal({
                title: role === "viewer" ? "停止分享" : "解除绑定",
                content: role === "viewer" ? "解除后，对方将无法再查看你的饮水快照，确定继续？" : "解除后将无法查看该家人的饮水情况，确定继续？",
                confirmText: role === "viewer" ? "停止" : "解除",
                confirmColor: "#b54d4d",
                success: function success(r) {
                  return resolve(r);
                },
                fail: function fail() {
                  return resolve({
                    confirm: false
                  });
                }
              });
            });
          case 5:
            modalRes = _context6.sent;
            if (!(!modalRes || !modalRes.confirm)) {
              _context6.next = 8;
              break;
            }
            return _context6.abrupt("return");
          case 8:
            _context6.prev = 8;
            _context6.next = 11;
            return callFamilyCare({
              action: "unbind",
              bindingId: id
            });
          case 11:
            wx.showToast({
              title: "已解除绑定",
              icon: "success"
            });
            _this6._loadSummary(false);
            _context6.next = 18;
            break;
          case 15:
            _context6.prev = 15;
            _context6.t0 = _context6["catch"](8);
            wx.showToast({
              title: String(_context6.t0.message || "解除失败"),
              icon: "none"
            });
          case 18:
          case "end":
            return _context6.stop();
        }
      }, _callee6, null, [
        [8, 15]
      ]);
    }))();
  },
  goBack: function goBack() {
    wx.navigateBack({
      delta: 1,
      fail: function fail() {
        wx.switchTab({
          url: "/pages/profile/profile"
        });
      }
    });
  }
});