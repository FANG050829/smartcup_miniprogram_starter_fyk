var LAST_DEVICE_KEY = "smartcup_last_device";
var LAST_DEVICE_NAME_KEY = "smartcup_last_device_name";
var LAST_DEVICE_ID_KEY = "smartcup_last_device_id";
var PAIRED_DEVICES_KEY = "smartcup_paired_devices_v1";
var TRACKED_DEVICE_KEY = "smartcup_map_device_id";
var LEGACY_CLOUD_DEVICE_KEY = "smartcup_cloud_device_id";
var MAX_PAIRED_DEVICES = 8;

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeName(name) {
  return normalizeText(name) || "SmartCup";
}

function normalizePairedList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(function(item) {
    var id = normalizeText(item && item.id);
    if (!id) return null;
    return {
      id: id,
      name: normalizeName(item && item.name),
      lastSeenAt: Number(item && item.lastSeenAt) || Date.now(),
      cloudDeviceId: normalizeText(item && item.cloudDeviceId),
      imei: normalizeText(item && item.imei),
      bleName: normalizeText(item && item.bleName),
      firmwareVersion: normalizeText(item && item.firmwareVersion)
    };
  }).filter(Boolean).sort(function(a, b) {
    return b.lastSeenAt - a.lastSeenAt;
  }).slice(0, MAX_PAIRED_DEVICES);
}

function getPairedDevices() {
  return normalizePairedList(wx.getStorageSync(PAIRED_DEVICES_KEY));
}

function savePairedDevices(list) {
  var normalized = normalizePairedList(list);
  wx.setStorageSync(PAIRED_DEVICES_KEY, normalized);
  return normalized;
}

function getCloudDeviceIdForEntry(entry) {
  if (!entry) return "";
  return normalizeText(entry.cloudDeviceId || entry.imei);
}

function getPairedDevice(deviceId) {
  var id = normalizeText(deviceId);
  if (!id) return null;
  var list = getPairedDevices();
  return list.find(function(item) {
    return item.id === id;
  }) || null;
}

function syncLegacyCloudDevice(deviceId) {
  var entry = getPairedDevice(deviceId);
  var cloudDeviceId = getCloudDeviceIdForEntry(entry);
  if (cloudDeviceId) {
    wx.setStorageSync(LEGACY_CLOUD_DEVICE_KEY, cloudDeviceId);
    return;
  }
  wx.removeStorageSync(LEGACY_CLOUD_DEVICE_KEY);
}

function upsertPairedDevice(deviceId) {
  var patch = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  var id = normalizeText(deviceId);
  if (!id) return null;
  var list = getPairedDevices();
  var current = list.find(function(item) {
    return item.id === id;
  }) || null;
  var rest = list.filter(function(item) {
    return item.id !== id;
  });
  var nextItem = {
    id: id,
    name: normalizeName(patch.name || current && current.name),
    lastSeenAt: Number(patch.lastSeenAt) || Date.now(),
    cloudDeviceId: normalizeText(patch.cloudDeviceId !== undefined ? patch.cloudDeviceId : current && current.cloudDeviceId),
    imei: normalizeText(patch.imei !== undefined ? patch.imei : current && current.imei),
    bleName: normalizeText(patch.bleName !== undefined ? patch.bleName : current && current.bleName),
    firmwareVersion: normalizeText(patch.firmwareVersion !== undefined ? patch.firmwareVersion : current && current.firmwareVersion)
  };
  savePairedDevices([nextItem].concat(rest));
  var trackedId = getTrackedDeviceId();
  var last = getLastDevice();
  if (trackedId === id || last && last.id === id) {
    syncLegacyCloudDevice(id);
  }
  return nextItem;
}

function getLastDevice() {
  var saved = wx.getStorageSync(LAST_DEVICE_KEY) || {};
  return {
    id: normalizeText(saved.id || wx.getStorageSync(LAST_DEVICE_ID_KEY)),
    name: normalizeName(saved.name || wx.getStorageSync(LAST_DEVICE_NAME_KEY))
  };
}

function setLastDevice(deviceId, name) {
  var id = normalizeText(deviceId);
  if (!id) return;
  var nextName = normalizeName(name);
  wx.setStorageSync(LAST_DEVICE_KEY, {
    id: id,
    name: nextName
  });
  wx.setStorageSync(LAST_DEVICE_ID_KEY, id);
  wx.setStorageSync(LAST_DEVICE_NAME_KEY, nextName);
}

function getTrackedDeviceId() {
  return normalizeText(wx.getStorageSync(TRACKED_DEVICE_KEY));
}

function setTrackedDeviceId(deviceId) {
  var id = normalizeText(deviceId);
  if (!id) {
    wx.removeStorageSync(TRACKED_DEVICE_KEY);
    return;
  }
  wx.setStorageSync(TRACKED_DEVICE_KEY, id);
  syncLegacyCloudDevice(id);
}

function resolveTrackedDevice() {
  var list = getPairedDevices();
  if (!list.length) return null;
  var trackedId = getTrackedDeviceId();
  var tracked = trackedId ? list.find(function(item) {
    return item.id === trackedId;
  }) : null;
  if (tracked) return tracked;
  var last = getLastDevice();
  var lastEntry = last.id ? list.find(function(item) {
    return item.id === last.id;
  }) : null;
  if (lastEntry) return lastEntry;
  return list[0] || null;
}
module.exports = {
  LAST_DEVICE_KEY: LAST_DEVICE_KEY,
  LAST_DEVICE_NAME_KEY: LAST_DEVICE_NAME_KEY,
  LAST_DEVICE_ID_KEY: LAST_DEVICE_ID_KEY,
  PAIRED_DEVICES_KEY: PAIRED_DEVICES_KEY,
  TRACKED_DEVICE_KEY: TRACKED_DEVICE_KEY,
  LEGACY_CLOUD_DEVICE_KEY: LEGACY_CLOUD_DEVICE_KEY,
  MAX_PAIRED_DEVICES: MAX_PAIRED_DEVICES,
  normalizeName: normalizeName,
  normalizePairedList: normalizePairedList,
  getPairedDevices: getPairedDevices,
  savePairedDevices: savePairedDevices,
  getPairedDevice: getPairedDevice,
  getCloudDeviceIdForEntry: getCloudDeviceIdForEntry,
  upsertPairedDevice: upsertPairedDevice,
  getLastDevice: getLastDevice,
  setLastDevice: setLastDevice,
  getTrackedDeviceId: getTrackedDeviceId,
  setTrackedDeviceId: setTrackedDeviceId,
  resolveTrackedDevice: resolveTrackedDevice,
  syncLegacyCloudDevice: syncLegacyCloudDevice
};