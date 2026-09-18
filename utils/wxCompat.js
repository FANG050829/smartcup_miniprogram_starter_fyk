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
/* 平板/宽窗断点：与各页 wxss 的 @media (min-width:768px) 保持一致 */
var WIDE_WINDOW_MIN_PX = 768;

function isWideWindow(windowWidth) {
  var w = Number(windowWidth);
  if (!w) {
    w = getLayoutMetrics().windowWidth;
  }
  return w >= WIDE_WINDOW_MIN_PX;
}

module.exports = {
  getWindowInfo: getWindowInfo,
  getDeviceInfo: getDeviceInfo,
  getAppBaseInfo: getAppBaseInfo,
  getLayoutMetrics: getLayoutMetrics,
  isWideWindow: isWideWindow,
  WIDE_WINDOW_MIN_PX: WIDE_WINDOW_MIN_PX
};