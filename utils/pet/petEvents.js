/* ============================================================
 * petEvents.js —— 业务事件 → 伙伴表情 的统一映射层
 *
 * 页面只上报业务事件（找到水杯/开始搜索/离线…），这里翻译成
 * petStore 能裁决的动作（hold / 任务态 / 两连表情），场景文案也
 * 在这里配，业务代码不直接拼表情 ID。
 * 目前承载：定位页（map）三态 —— 搜索中 / 找到 / 离线。
 * 后续加热、打卡等场景按同样方式往里加映射即可。
 * ============================================================ */
var petStore = require("./petStore.js");

var EMO = petStore.EMO;

/* 找到水杯的两连节奏：惊讶短促带过，开心多留一会 */
var FOUND_SURPRISE_MS = 1100;
var FOUND_HAPPY_MS = 2400;
/* 页级任务态时长：到期自动回落环境巡演，页面状态变化时会重新续期 */
var LOCATE_TASK_MS = 5 * 60 * 1000;
var CUP_OFF_TASK_MS = 10 * 60 * 1000;

var foundTimer = 0;

function clearFoundTimer() {
  if (foundTimer) {
    clearTimeout(foundTimer);
    foundTimer = 0;
  }
}

module.exports = {
  /* 定位页：正在搜杯（已连接但还没拿到 GPS/云定位；进页面首搜也算） */
  mapSearching: function() {
    clearFoundTimer();
    petStore.taskStart("locate", LOCATE_TASK_MS);
  },

  /* 定位页：拿到定位 —— 惊讶→开心 两连，播完落回环境巡演 */
  mapFound: function() {
    if (!petStore.isEnabled()) return;
    clearFoundTimer();
    petStore.taskDone();
    petStore.flash(EMO.surprised, FOUND_SURPRISE_MS, "找到啦！");
    foundTimer = setTimeout(function() {
      foundTimer = 0;
      petStore.flash(EMO.happy, FOUND_HAPPY_MS, "杯子在这边，走！");
    }, FOUND_SURPRISE_MS + 50);
  },

  /* 定位页：水杯离线 —— 伙伴打盹守着，等它上线 */
  mapOffline: function() {
    clearFoundTimer();
    petStore.taskStart("cupOff", CUP_OFF_TASK_MS);
  },

  /* 离开定位页：清掉页级任务与未完的两连，状态不漏给别的页面 */
  mapLeave: function() {
    clearFoundTimer();
    petStore.taskDone();
  }
};
