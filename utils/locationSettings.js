var PREFERRED_LOCATION_MODE_KEY = "smartcup_preferred_location_mode_v1";

function normalizeLocationMode(value) {
  return value === "phone" ? "phone" : "gps";
}

function getPreferredLocationMode() {
  return normalizeLocationMode(wx.getStorageSync(PREFERRED_LOCATION_MODE_KEY));
}

function setPreferredLocationMode(value) {
  var nextMode = normalizeLocationMode(value);
  wx.setStorageSync(PREFERRED_LOCATION_MODE_KEY, nextMode);
  return nextMode;
}
module.exports = {
  PREFERRED_LOCATION_MODE_KEY: PREFERRED_LOCATION_MODE_KEY,
  normalizeLocationMode: normalizeLocationMode,
  getPreferredLocationMode: getPreferredLocationMode,
  setPreferredLocationMode: setPreferredLocationMode
};