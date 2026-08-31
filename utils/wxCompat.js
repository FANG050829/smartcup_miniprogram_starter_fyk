function safeCall(fn) {
  if (typeof fn !== "function") return null;
  try {
    return fn();
  } catch (e) {
    return null;
  }
}

function getWindowInfo() {
  return safeCall(wx.getWindowInfo);
}

function getDeviceInfo() {
  return safeCall(wx.getDeviceInfo);
}

function getAppBaseInfo() {
  return safeCall(wx.getAppBaseInfo);
}

function getLayoutMetrics() {
  var windowInfo = getWindowInfo() || {};
  var deviceInfo = getDeviceInfo() || {};
  var appBaseInfo = getAppBaseInfo() || {};
  return {
    windowWidth: Number(windowInfo.windowWidth) || 0,
    windowHeight: Number(windowInfo.windowHeight) || 0,
    pixelRatio: Number(windowInfo.pixelRatio) || Number(deviceInfo.pixelRatio) || 0,
    statusBarHeight: Number(windowInfo.statusBarHeight) || Number(appBaseInfo.statusBarHeight) || 0,
    safeArea: windowInfo.safeArea || null,
    screenHeight: Number(deviceInfo.screenHeight) || 0,
    platform: String(deviceInfo.platform || appBaseInfo.hostPlatform || "").toLowerCase()
  };
}
module.exports = {
  getWindowInfo: getWindowInfo,
  getDeviceInfo: getDeviceInfo,
  getAppBaseInfo: getAppBaseInfo,
  getLayoutMetrics: getLayoutMetrics
};