/* ============================================================
 * bootLog.js —— 全局错误上报与启动埋点
 *
 * 用途：体验版/正式版真机上排查"页面白屏/卡死"的唯一线索来源。
 * - reportError：console.error + 实时日志（小程序后台"运维中心→实时日志"）
 *   + 本地环形缓冲（最近 20 条，storage 键 smartcup_error_log_v1）。
 * - breadcrumb：轻量时间线（仅实时日志 + 控制台），用于确认"流程走到哪一步
 *   断掉"——例如日志里有 tabbar:index 而没有 page:index，即可判定
 *   首页页面 JS 未执行成功。
 * 全文件纯 ES5，自身不允许抛错（任何异常都吞掉，绝不影响业务）。
 * ============================================================ */

var ERROR_LOG_KEY = "smartcup_error_log_v1";
var ERROR_LOG_MAX = 20;

var realtimeLog = null;
try {
  realtimeLog = wx.getRealtimeLogManager ? wx.getRealtimeLogManager() : null;
} catch (e) {
  realtimeLog = null;
}

function formatDetail(detail) {
  try {
    if (typeof detail === "string") return detail;
    if (detail && detail.stack) return String(detail.stack);
    return JSON.stringify(detail);
  } catch (e) {
    return "(无法序列化的错误对象)";
  }
}

function reportError(kind, detail) {
  var text = "[" + kind + "] " + formatDetail(detail);
  try { console.error(text); } catch (e) {}
  try {
    if (realtimeLog && realtimeLog.error) realtimeLog.error(text);
  } catch (e) {}
  try {
    var list = wx.getStorageSync(ERROR_LOG_KEY) || [];
    if (list && typeof list.push === "function") {
      list.push({ t: Date.now(), msg: text.slice(0, 500) });
      while (list.length > ERROR_LOG_MAX) list.shift();
      wx.setStorageSync(ERROR_LOG_KEY, list);
    }
  } catch (e) {}
}

function breadcrumb(msg) {
  try { console.log("[boot] " + msg); } catch (e) {}
  try {
    if (realtimeLog && realtimeLog.info) realtimeLog.info("[boot] " + msg);
  } catch (e) {}
}

module.exports = {
  reportError: reportError,
  breadcrumb: breadcrumb
};
