var registry = require("../../utils/deviceRegistry");
var locationSettings = require("../../utils/locationSettings");
var petStore = require("../../utils/pet/petStore");
Page({
  data: {
    lastDeviceName: "未连接过设备",
    lastDeviceId: "",
    renameValue: "",
    cloudDeviceId: "",
    cloudStatusText: "连接设备后会自动从硬件同步 IMEI",
    preferredLocationMode: "gps",
    petEnabled: true
  },
  onShow: function onShow() {
    this._alive = true;
    // 一次性合并所有字段到单次 setData，避免 4 次独立 setData
    var saved = registry.getLastDevice();
    var entry = saved.id ? registry.getPairedDevice(saved.id) : null;
    var cloudDeviceId = registry.getCloudDeviceIdForEntry(entry);
    this.setData({
      lastDeviceId: saved.id,
      lastDeviceName: saved.name || "未连接过设备",
      renameValue: "",
      cloudDeviceId: cloudDeviceId,
      cloudStatusText: cloudDeviceId ? "当前设备的云端定位 ID 已自动同步" : "当前设备还没有同步 IMEI，请先连接一次设备",
      preferredLocationMode: locationSettings.getPreferredLocationMode(),
      petEnabled: petStore.isEnabled()
    });
  },
  onHide: function onHide() {
    this._alive = false;
  },
  onUnload: function onUnload() {
    this._alive = false;
  },
  onPullDownRefresh: function onPullDownRefresh() {
    this._alive = true;
    this.onShow();
    if (wx.stopPullDownRefresh) wx.stopPullDownRefresh();
  },
  _loadLastDevice: function _loadLastDevice() {
    var saved = registry.getLastDevice();
    this.setData({
      lastDeviceId: saved.id,
      lastDeviceName: saved.name || "未连接过设备"
    });
  },
  _loadCloudDeviceId: function _loadCloudDeviceId() {
    var last = registry.getLastDevice();
    var entry = last.id ? registry.getPairedDevice(last.id) : null;
    var cloudDeviceId = registry.getCloudDeviceIdForEntry(entry);
    this.setData({
      cloudDeviceId: cloudDeviceId,
      cloudStatusText: cloudDeviceId ? "当前设备的云端定位 ID 已自动同步" : "当前设备还没有同步 IMEI，请先连接一次设备"
    });
  },
  _applyPreferredLocationMode: function _applyPreferredLocationMode(preferredLocationMode) {
    this.setData({
      preferredLocationMode: preferredLocationMode
    });
  },
  _loadPreferredLocationMode: function _loadPreferredLocationMode() {
    this._applyPreferredLocationMode(locationSettings.getPreferredLocationMode());
  },
  onRenameInput: function onRenameInput(e) {
    this.setData({
      renameValue: String(e && e.detail && e.detail.value || "")
    });
  },
  saveDeviceName: function saveDeviceName() {
    var id = String(this.data.lastDeviceId || "").trim();
    if (!id) {
      wx.showToast({
        title: "暂无可重命名设备",
        icon: "none"
      });
      return;
    }
    var rawName = String(this.data.renameValue || "").trim();
    if (!rawName) {
      wx.showToast({
        title: "请输入设备名称",
        icon: "none"
      });
      return;
    }
    var nextName = rawName.slice(0, 24);
    registry.upsertPairedDevice(id, {
      name: nextName,
      lastSeenAt: Date.now()
    });
    registry.setLastDevice(id, nextName);
    this.setData({
      lastDeviceName: nextName,
      renameValue: ""
    });
    wx.showToast({
      title: "重命名已保存",
      icon: "success"
    });
  },
  setPreferredLocationModePhone: function setPreferredLocationModePhone() {
    this._savePreferredLocationMode("phone");
  },
  setPreferredLocationModeGps: function setPreferredLocationModeGps() {
    this._savePreferredLocationMode("gps");
  },
  _savePreferredLocationMode: function _savePreferredLocationMode(nextMode) {
    var preferredLocationMode = locationSettings.setPreferredLocationMode(nextMode);
    var changed = preferredLocationMode !== this.data.preferredLocationMode;
    this._applyPreferredLocationMode(preferredLocationMode);
    if (!changed) return;
    wx.showToast({
      title: preferredLocationMode === "phone" ? "已切换为手机定位" : "已切换为GPS定位",
      icon: "success"
    });
  },
  goPermission: function goPermission() {
    wx.navigateTo({
      url: "/pages/permission/permission"
    });
  },
  onPetSwitchChange: function onPetSwitchChange(e) {
    var next = !!(e && e.detail && e.detail.value);
    petStore.setEnabled(next);
    this.setData({
      petEnabled: next
    });
    wx.showToast({
      title: next ? "表情伙伴已开启" : "表情伙伴已关闭",
      icon: "none"
    });
  }
});