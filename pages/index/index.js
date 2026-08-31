var _defineProperty2 = require("../../@babel/runtime/helpers/defineProperty");
require("../../@babel/runtime/helpers/Arrayincludes");
var _regeneratorRuntime2 = require("../../@babel/runtime/helpers/regeneratorRuntime");
var _asyncToGenerator2 = require("../../@babel/runtime/helpers/asyncToGenerator");
var _typeof2 = require("../../@babel/runtime/helpers/typeof");
var _slicedToArray2 = require("../../@babel/runtime/helpers/slicedToArray");
var _objectSpread2 = require("../../@babel/runtime/helpers/objectSpread2");
var _toConsumableArray2 = require("../../@babel/runtime/helpers/toConsumableArray");
var ble = require("../../utils/ble");
var checkinCore = require("../../utils/checkinCore");
var checkinOps = require("../../utils/checkinOps");
var drinkData = require("../../utils/drinkData");
var petStore = require("../../utils/pet/petStore.js");
var locationSettings = require("../../utils/locationSettings");
var waterReminder = require("../../utils/waterReminderCore");
var wxCompat = require("../../utils/wxCompat");
var waterLevel = require("../../utils/waterLevel");
var bootLog = require("../../utils/bootLog");
/* 云端加载失败提示只弹一次：失败置位、成功复位，避免每次进首页都弹 */
var cloudFailToastShown = false;
var HEAT_PANEL_SCENE_OPTIONS = [{
  key: "tea",
  title: "喝茶",
  temp: 55,
  icon: "🍵",
  tone: "tea"
}, {
  key: "medicine",
  title: "喝药",
  temp: 45,
  icon: "💊",
  tone: "medicine"
}, {
  key: "warm",
  title: "暖胃",
  temp: 40,
  icon: "♨",
  tone: "warm"
}, {
  key: "sport",
  title: "运动",
  temp: 25,
  icon: "🏃",
  tone: "sport"
}];
var HEAT_PANEL_BASE_OPTIONS = [{
  key: "mild",
  title: "温润",
  temp: 35
}, {
  key: "hot",
  title: "暖润",
  temp: 50
}];
var HEAT_PRESET_STORAGE_KEY = "smartcup_heat_preset_temps";
var HEAT_ALLOWED_PRESET_TEMPS = [25, 35, 40, 45, 50, 55];
var HEAT_PRESET_MIN_TEMP = HEAT_ALLOWED_PRESET_TEMPS[0];
var HEAT_PRESET_MAX_TEMP = HEAT_ALLOWED_PRESET_TEMPS[HEAT_ALLOWED_PRESET_TEMPS.length - 1];
var CHECKIN_STORAGE_KEY = checkinCore.STORAGE_KEY;
var CHECKIN_STORAGE_VERSION = checkinCore.STORAGE_VERSION;
var CHECKIN_DEFAULT_GOAL_ML = checkinCore.DEFAULT_GOAL_ML;
var CHECKIN_MIN_GOAL_ML = 800;
var CHECKIN_MAX_GOAL_ML = 6000;
var CHECKIN_MAX_SINGLE_AMOUNT_ML = checkinCore.MAX_SINGLE_AMOUNT_ML;
var CHECKIN_MAX_DAILY_RECORDS = checkinCore.MAX_DAILY_RECORDS;
var CHECKIN_QUICK_AMOUNTS = checkinCore.QUICK_AMOUNTS;
var CHECKIN_HISTORY_KEEP_DAYS = 400;
var LAST_TDS_KEY = "smartcup_last_tds_ppm";
var HOME_TODAY_ANIM_FRAME_MS = 33;
var HOME_TODAY_ANIM_MIN_DURATION = 420;
var HOME_TODAY_ANIM_MAX_DURATION = 1800;
var VIRTUAL_HEAT_STEP_INTERVAL_MS = 5000;
var PHONE_LOCATION_HEAT_TICK_MS = 2000;
var PHONE_LOCATION_HEAT_DEGREE_MS = 20000;
var HEAT_COOLING_VISUAL_MS = 1100;
var HOME_BLE_SYNC_POLL_MS = 3000;
var HOME_HEAT_STATUS_STALE_MS = 5000;
var HOME_HEAT_ACK_TIMEOUT_MS = 3200;
var HOME_HEAT_RETRY_TIMES = 2;
var HOME_HEAT_RETRY_DELAY_MS = 260;
var HOME_TAB_BAR_HEIGHT_PX = 64;
var HOME_TAB_BAR_CLEARANCE_PX = 0;
var WATER_AUTO_MIN_DROP_ML = waterLevel.WATER_LEVEL_STEP_ML;
var WATER_AUTO_MAX_DROP_ML = waterLevel.WATER_LEVEL_MAX_ML;
var WATER_AUTO_COOLDOWN_MS = 25000;
var WATER_AUTO_STABLE_FRAMES = 4;
var HOME_WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
var clamp = function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
};
var pad2 = function pad2(value) {
  return value < 10 ? "0".concat(value) : "".concat(value);
};
var normalizeWaterMl = function normalizeWaterMl(value) {
  return waterLevel.normalizeWaterMl(value);
};
var sleep = function sleep(ms) {
  return new Promise(function(resolve) {
    return setTimeout(resolve, Math.max(0, Number(ms) || 0));
  });
};
var findNearestHeatPresetTemp = function findNearestHeatPresetTemp(value) {
  var raw = Number(value);
  if (!Number.isFinite(raw)) return HEAT_PRESET_MIN_TEMP;
  var nearest = HEAT_ALLOWED_PRESET_TEMPS[0];
  var minDiff = Math.abs(raw - nearest);
  for (var i = 1; i < HEAT_ALLOWED_PRESET_TEMPS.length; i += 1) {
    var candidate = HEAT_ALLOWED_PRESET_TEMPS[i];
    var diff = Math.abs(raw - candidate);
    if (diff < minDiff) {
      nearest = candidate;
      minDiff = diff;
    }
  }
  return nearest;
};
var normalizeHeatPresetTemp = function normalizeHeatPresetTemp(value, fallback) {
  var raw = Number(value);
  if (!Number.isFinite(raw)) return findNearestHeatPresetTemp(fallback);
  var rounded = Math.round(raw);
  if (HEAT_ALLOWED_PRESET_TEMPS.includes(rounded)) return rounded;
  return findNearestHeatPresetTemp(rounded);
};
var buildHeatPresetStorageMap = function buildHeatPresetStorageMap() {
  var sceneOptions = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
  var baseOptions = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
  var nextMap = {};
  [].concat(_toConsumableArray2(sceneOptions), _toConsumableArray2(baseOptions)).forEach(function(item) {
    if (!item || !item.key) return;
    nextMap[item.key] = normalizeHeatPresetTemp(item.temp, item.temp);
  });
  return nextMap;
};
var buildHeatPresetOptionState = function buildHeatPresetOptionState() {
  var storedMap = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var applyList = function applyList(list) {
    return list.map(function(item) {
      return _objectSpread2(_objectSpread2({}, item), {}, {
        temp: normalizeHeatPresetTemp(storedMap[item.key], item.temp)
      });
    });
  };
  return {
    heatSceneOptions: applyList(HEAT_PANEL_SCENE_OPTIONS),
    heatOptions: applyList(HEAT_PANEL_BASE_OPTIONS)
  };
};
var toDateKey = checkinCore.toDateKey;
var makeCheckinRecordId = checkinCore.makeRecordId;
var normalizeCheckinAmount = function normalizeCheckinAmount(value) {
  return checkinCore.normalizeAmount(value, CHECKIN_MAX_SINGLE_AMOUNT_ML);
};
var sumCheckinAmounts = checkinCore.sumAmounts;
var parseCheckinDateKey = function parseCheckinDateKey(dateKey) {
  if (typeof dateKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  var _dateKey$split = dateKey.split("-"),
    _dateKey$split2 = _slicedToArray2(_dateKey$split, 3),
    yearStr = _dateKey$split2[0],
    monthStr = _dateKey$split2[1],
    dayStr = _dateKey$split2[2];
  var year = Number(yearStr);
  var month = Number(monthStr);
  var day = Number(dayStr);
  var date = new Date(year, month - 1, day);
  return toDateKey(date) === dateKey ? date : null;
};
var formatHomeCheckinDate = function formatHomeCheckinDate(dateKey) {
  var date = parseCheckinDateKey(dateKey);
  if (!date) return "";
  return "".concat(date.getMonth() + 1, "\u6708").concat(date.getDate(), "\u65E5 ").concat(HOME_WEEKDAY_LABELS[date.getDay()]);
};
var formatHomeCheckinTime = function formatHomeCheckinTime(timestamp) {
  var date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--:--";
  return "".concat(pad2(date.getHours()), ":").concat(pad2(date.getMinutes()));
};
var calculateHomeCheckinStreak = function calculateHomeCheckinStreak(recordsByDate, dailyGoalMl, todayKey) {
  if (!dailyGoalMl) return 0;
  var todayDate = parseCheckinDateKey(todayKey);
  if (!todayDate) return 0;
  var streak = 0;
  for (var i = 0; i < CHECKIN_HISTORY_KEEP_DAYS; i += 1) {
    var date = new Date(todayDate.getTime() - i * 24 * 60 * 60 * 1000);
    var dateKey = toDateKey(date);
    var records = Array.isArray(recordsByDate && recordsByDate[dateKey]) ? recordsByDate[dateKey] : [];
    if (sumCheckinAmounts(records) >= dailyGoalMl) {
      streak += 1;
      continue;
    }
    break;
  }
  return streak;
};
var createCheckinStore = function createCheckinStore() {
  var now = Date.now();
  return {
    version: CHECKIN_STORAGE_VERSION,
    dailyGoalMl: CHECKIN_DEFAULT_GOAL_ML,
    recordsByDate: {},
    createdAt: now,
    updatedAt: now
  };
};
var normalizeCheckinStore = function normalizeCheckinStore(rawStore) {
  if (!rawStore || _typeof2(rawStore) !== "object") return createCheckinStore();
  var fallback = createCheckinStore();
  var dailyGoalRaw = Number(rawStore.dailyGoalMl);
  var createdAtRaw = Number(rawStore.createdAt);
  var updatedAtRaw = Number(rawStore.updatedAt);
  var store = {
    version: CHECKIN_STORAGE_VERSION,
    dailyGoalMl: Number.isFinite(dailyGoalRaw) && dailyGoalRaw > 0 ? Math.round(dailyGoalRaw) : CHECKIN_DEFAULT_GOAL_ML,
    recordsByDate: {},
    createdAt: Number.isFinite(createdAtRaw) && createdAtRaw > 0 ? Math.round(createdAtRaw) : fallback.createdAt,
    updatedAt: Number.isFinite(updatedAtRaw) && updatedAtRaw > 0 ? Math.round(updatedAtRaw) : fallback.updatedAt
  };
  var sourceMap = rawStore.recordsByDate;
  if (!sourceMap || _typeof2(sourceMap) !== "object") return store;
  Object.keys(sourceMap).forEach(function(dateKey) {
    var sourceList = sourceMap[dateKey];
    if (!Array.isArray(sourceList) || !sourceList.length) return;
    var normalizedList = sourceList.map(function(item) {
      var amount = normalizeCheckinAmount(item && item.amount);
      if (!amount) return null;
      var tsRaw = Number(item && item.ts);
      var ts = Number.isFinite(tsRaw) && tsRaw > 0 ? Math.round(tsRaw) : Date.now();
      return {
        id: item && typeof item.id === "string" && item.id ? item.id : makeCheckinRecordId(ts),
        amount: amount,
        ts: ts
      };
    }).filter(Boolean);
    if (!normalizedList.length) return;
    normalizedList.sort(function(a, b) {
      return a.ts - b.ts;
    });
    if (normalizedList.length > CHECKIN_MAX_DAILY_RECORDS) {
      normalizedList.splice(0, normalizedList.length - CHECKIN_MAX_DAILY_RECORDS);
    }
    store.recordsByDate[dateKey] = normalizedList;
  });
  return store;
};
/* 首页伙伴：看向按钮的表情 -> 四宫格卡片 */
var GLANCE_PAD_MAP = { "50": "tl", "51": "tr", "52": "bl", "53": "br" };
/* 看向按钮的节奏：两次看向间隔在 15-30 秒间随机，看向持续 2.8-3.6 秒 */
var GLANCE_MIN_GAP_MS = 15000;
var GLANCE_MAX_GAP_MS = 30000;
/* 看向编排：眼神 600ms 转到位 → 按钮按压 500ms → 气泡 3.6s；
 * 保持时长覆盖到气泡结束，期间表情与目光冻结（只眨眼） */
var GLANCE_TURN_MS = 600;
var GLANCE_PRESS_MS = 500;
var GLANCE_HOLD_MIN_MS = 5100;
var GLANCE_HOLD_MAX_MS = 5400;
var GLANCE_IDS = ["50", "51", "52", "53"];
var GLANCE_INTROS = {
  "50": [
    "那边能连上你的水杯",
    "设备页，水杯的身份证在这",
    "去那边看看你的杯子",
    "连接的事，找它准没错",
    "杯子的一生，从这里开始",
    "设备页是水杯的家",
    "蓝牙的开关在那边",
    "先连接，才有然后",
    "没有它，我就是个摆设"
  ],
  "51": [
    "找不到杯子？点它，我带路",
    "定位页，杯子跑不掉的",
    "杯子在哪，一查便知",
    "它要是会跑，我第一个追",
    "丢三落四星人的救星",
    "地图上找找它",
    "它不会自己走远的",
    "定位页了解一下",
    "妈妈再也不怕丢杯子"
  ],
  "52": [
    "有事儿问我，我懂水",
    "智聊，除了烧水啥都聊",
    "那边可以找我唠嗑",
    "我的知识都泡在水里",
    "问它个问题，考考它",
    "水知识十级选手在线",
    "聊天气，聊水温都行",
    "我话痨，但它爱我",
    "AI 本球，在线营业"
  ],
  "53": [
    "点右边这位，热水马上到",
    "加热：冬天的好朋友",
    "点它，温暖马上到",
    "凉水与热水，一指之隔",
    "它负责热，你负责喝",
    "冬天靠它续命",
    "热水自由，一步之遥",
    "喝温的，对胃好",
    "暖杯模式，即刻启动"
  ]
};
var TAP_LINES = [
  "戳我干嘛，怪痒的",
  "我在认真看家呢",
  "再戳就要罢工啦～",
  "喝口水，休息一下",
  "哈哈，好痒好痒",
  "有事启奏？",
  "今天也要好好喝水哦",
  "戳一下，年轻一秒",
  "别戳了，水都洒出来了",
  "我在呢，我在呢",
  "你戳的样子像在浇水",
  "换个手指戳，这个累了"
];
/* 打开加热面板时伙伴的台词（跟着球飞进面板凹座） */
var HEAT_LINES = [
  "好嘞，热水这就安排～",
  "选个温度，我盯着火候",
  "要泡茶还是泡奶？我来烧",
  "烧水中…小心烫哦",
  "热水在手，温暖我有"
];

Page({
  data: {
    // Real-time telemetry shown on the home dashboard.
    temperature: 0,
    tds: 0,
    // 表情伙伴（petStore 全局驱动）
    petOn: true,
    padGlance: "",
    petBubble: "",
    // Heating button and status UI.
    heaterOn: false,
    heatCooling: false,
    heatResponsePending: false,
    lastUpdateText: "",
    dataLoading: true,
    heatTarget: null,
    heatLoadingText: "加热中",
    showHeatPanel: false,
    /* 加热面板飞行态：true 时球沿 transform 过渡飞往面板凹座 */
    petFly: false,
    petFlyStyle: "",
    /* 表情球被拖走悬浮期间（拖拽中或停泊未归）：抬高四宫格层级、收起气泡 */
    petBallFloat: false,
    heatSceneOptions: HEAT_PANEL_SCENE_OPTIONS,
    heatOptions: HEAT_PANEL_BASE_OPTIONS,
    homeQuickAmounts: CHECKIN_QUICK_AMOUNTS,
    homeCustomAmountInput: "",
    homeTodayTotalMl: 0,
    todayLabel: "",
    dailyGoalMl: CHECKIN_DEFAULT_GOAL_ML,
    remainingMl: CHECKIN_DEFAULT_GOAL_ML,
    progressPercent: 0,
    recordCountToday: 0,
    streakDays: 0,
    latestCheckinText: "今日还未打卡",
    progressBarStyle: "width:0%;",
    showGoalEditor: false,
    goalInput: "",
    cupWaterMlText: "0ml",
    cupWaterMlValue: 0,
    navStatusBarHeight: 20,
    navBarHeight: 44,
    homePageBottomPaddingPx: HOME_TAB_BAR_HEIGHT_PX + HOME_TAB_BAR_CLEARANCE_PX,
    pageAnim: ""
  },
  onLoad: function onLoad() {
    bootLog.breadcrumb("page:index onLoad");
    this._syncTopBarMetrics();
    this._loadHeatPresetOptions();
  },
  onResize: function onResize() {
    this._syncTopBarMetrics();
  },
  onShow: function onShow() {
    var _this = this;
    this._alive = true;
    this.setData({ petOn: petStore.isEnabled() });
    /* 从子页返回：模块错峰淡入（覆盖跳出时留下的 fx-out） */
    if (this._petNavLeft) {
      this._petNavLeft = false;
      this._navFlip = !this._navFlip;
      this.setData({ pageAnim: "fx-on" + (this._navFlip ? "2" : "") });
    }
    petStore.setPageVisible("index", true);
    this._armGlanceTimer();
    this._syncTopBarMetrics();
    this._syncCustomTabBar();
    this._refreshHomeTodayTotal();
    this._syncCupWaterDisplayFromMode();

    // 进场先亮出加载微光占位：数据读取很快，450ms 内完成则静默取消，避免闪烁
    this.setData({
      dataLoading: true
    });
    clearTimeout(this._loadingTimer);
    this._loadingTimer = setTimeout(function() {
      _this.setData({
        dataLoading: false
      });
    }, 450);
    if (this.data.heaterOn) {
      this._startHeatLoadingTicker();
      if (this._phoneLocationHeatActive && this._isPhoneLocationMode()) {
        this._startPhoneLocationHeatingDisplay(this.data.heatTarget);
      }
    } else {
      this._stopHeatLoadingTicker();
    }
    this._startHomeBleTelemetrySync();
    this._triggerPageEnter(0);
  },
  _triggerPageEnter: function _triggerPageEnter(idx) {
    try {
      var app = getApp();
      var g = app && app.globalData;
      if (!g) return;
      var prev = g.__lastTabIndex;
      g.__lastTabIndex = idx;
      if (typeof prev !== "number" || prev === idx) return;
      this._animFlip = !this._animFlip;
      this.setData({
        pageAnim: "fx-on" + (this._animFlip ? "2" : "")
      });
    } catch (e) {}
  },
  playExitAnim: function playExitAnim(cb) {
    try {
      var self = this;
      this.setData({
        pageAnim: "fx-out"
      });
      setTimeout(function() {
        if (typeof cb === "function") cb();
      }, 300);
    } catch (e) {
      if (typeof cb === "function") cb();
    }
  },
  onHide: function onHide() {
    this._alive = false;
    petStore.setPageVisible("index", false);
    if (this._glanceTimer) { clearTimeout(this._glanceTimer); this._glanceTimer = 0; }
    this._clearGlanceTimers();
    if (this._petBubbleTimer) { clearTimeout(this._petBubbleTimer); this._petBubbleTimer = 0; }
    this.closeHeatPanel();
    this._stopHomeBleTelemetrySync();
    this._stopHomeTodayTotalAnim();
    this._stopHeatingTimer();
    this._stopHeatLoadingTicker();
    this._clearHeatCoolingVisual();
  },
  /* 表情切换事件：编排由调度处以选定 id 直接驱动（单一事实源），这里不再处理，
   * 避免事件回传链路上的任何竞态导致眼神与文案错位 */
  onPetChange: function onPetChange() {},

  /* 点球反馈：petStore.pet() 已切表情，这里补一条俏皮气泡 */
  onPetTap: function onPetTap() {
    this._showPetBubble(TAP_LINES[Math.floor(Math.random() * TAP_LINES.length)]);
  },

  /* 表情球拖拽悬浮状态（pet-ball 的 dragstate 事件）：
   * floating=true 抬高四宫格层级让球浮到其他卡片上，并收起当前气泡；
   * 球滑回原位后解除。气泡抑制在 _showPetBubble 里统一兜住 */
  onPetDragState: function onPetDragState(e) {
    var floating = !!(e && e.detail && e.detail.floating);
    if (floating === this.data.petBallFloat) return;
    if (floating && this._petBubbleTimer) {
      clearTimeout(this._petBubbleTimer);
      this._petBubbleTimer = 0;
    }
    this.setData({ petBallFloat: floating, petBubble: floating ? "" : this.data.petBubble });
  },

  /* 看向按钮编排：调度处选定 id 后直调（眼神转 600ms → 按压 500ms → 气泡）。
   * epoch：期间用户真点了某个按钮则作废本次解说（气泡不再弹出） */
  _runGlanceChoreography: function _runGlanceChoreography(emotionId) {
    var self = this;
    var pad = GLANCE_PAD_MAP[emotionId];
    if (!pad) return;
    var epoch = this._padTapEpoch || 0;
    this._clearGlanceTimers();
    this._glanceTurnTimer = setTimeout(function() {
      self._glanceTurnTimer = 0;
      if ((self._padTapEpoch || 0) !== epoch) return;
      self.setData({ padGlance: pad });
      self._glancePressTimer = setTimeout(function() {
        self._glancePressTimer = 0;
        if ((self._padTapEpoch || 0) !== epoch) return;
        self.setData({ padGlance: "" });
        var lines = GLANCE_INTROS[emotionId];
        self._showPetBubble(lines[Math.floor(Math.random() * lines.length)]);
      }, GLANCE_PRESS_MS);
    }, GLANCE_TURN_MS);
  },

  _clearGlanceTimers: function _clearGlanceTimers() {
    if (this._glanceTurnTimer) { clearTimeout(this._glanceTurnTimer); this._glanceTurnTimer = 0; }
    if (this._glancePressTimer) { clearTimeout(this._glancePressTimer); this._glancePressTimer = 0; }
  },

  /* 页面过渡：模块淡出（fx-out）+ 表情球像素 alpha 同步淡出，完成后导航 */
  _petNavigate: function _petNavigate(url) {
    if (this.data.petOn && petStore.isEnabled()) petStore.beginExit();
    this._petNavLeft = true;
    this.setData({ pageAnim: "fx-out" });
    setTimeout(function() {
      wx.navigateTo({ url: url });
    }, 240);
  },

  /* 用户真的点了卡片：取消未决的看向解说，真实动作照常执行 */
  _notePadTap: function _notePadTap() {
    this._padTapEpoch = (this._padTapEpoch || 0) + 1;
    this._clearGlanceTimers();
    if (this._petBubbleTimer) { clearTimeout(this._petBubbleTimer); this._petBubbleTimer = 0; }
    if (this.data.padGlance || this.data.petBubble) {
      this.setData({ padGlance: "", petBubble: "" });
    }
  },


  /* 洗牌袋：一轮内四个按钮各看一次（顺序随机），轮与轮之间避免与上轮收尾重复 */
  _nextGlanceId: function _nextGlanceId() {
    if (!this._glanceBag || !this._glanceBag.length) {
      this._glanceBag = GLANCE_IDS.slice();
      for (var i = this._glanceBag.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = this._glanceBag[i];
        this._glanceBag[i] = this._glanceBag[j];
        this._glanceBag[j] = t;
      }
      if (this._lastGlanceId && this._glanceBag[this._glanceBag.length - 1] === this._lastGlanceId && this._glanceBag.length > 1) {
        var tmp = this._glanceBag[0];
        this._glanceBag[0] = this._glanceBag[this._glanceBag.length - 1];
        this._glanceBag[this._glanceBag.length - 1] = tmp;
      }
    }
    var id = this._glanceBag.pop();
    this._lastGlanceId = id;
    return id;
  },

  /* 随机调度：距上次看向 15-30 秒内随机挑一个时刻，用 petStore.flash 让球看向按钮 */
  _armGlanceTimer: function _armGlanceTimer() {
    var self = this;
    if (this._glanceTimer) clearTimeout(this._glanceTimer);
    this._glanceTimer = setTimeout(function() {
      self._glanceTimer = 0;
      if (!self._alive || !self.data.petOn || petStore.isQuietNow()) {
        self._armGlanceTimer();
        return;
      }
      var id = self._nextGlanceId();
      var hold = GLANCE_HOLD_MIN_MS + Math.random() * (GLANCE_HOLD_MAX_MS - GLANCE_HOLD_MIN_MS);
      petStore.flash(id, hold);
      /* 单一事实源：id 由这里选定，表情切换/按钮按压/气泡文案全部由它驱动，
       * 不经 change 事件回传，眼神与文案结构上不可能错位 */
      self._runGlanceChoreography(id);
      self._armGlanceTimer();
    }, GLANCE_MIN_GAP_MS + Math.random() * (GLANCE_MAX_GAP_MS - GLANCE_MIN_GAP_MS));
  },

  _showPetBubble: function _showPetBubble(text, ms) {
    var self = this;
    if (!text) return;
    /* 球被拖走悬浮时气泡仍钉在原位会落空，悬浮期间一律不弹 */
    if (this.data.petBallFloat) return;
    if (this._petBubbleTimer) clearTimeout(this._petBubbleTimer);
    this.setData({ petBubble: text });
    this._petBubbleTimer = setTimeout(function() {
      self._petBubbleTimer = 0;
      self.setData({ petBubble: "" });
    }, ms || 3600);
  },

  _syncCustomTabBar: function _syncCustomTabBar() {
    try {
      if (typeof this.getTabBar !== "function") return;
      var tabBar = this.getTabBar();
      if (tabBar && typeof tabBar.setData === "function") {
        tabBar.setData({
          selected: 0,
          hidden: false
        });
      }
    } catch (err) {
      console.warn("[tabBar sync fail]", err);
    }
  },
  _syncTopBarMetrics: function _syncTopBarMetrics() {
    var statusBarHeight = 20;
    var navBarHeight = 44;
    var windowHeight = 0;
    var safeInsetBottom = 0;
    try {
      var sys = wxCompat.getLayoutMetrics();
      if (sys && Number.isFinite(Number(sys.statusBarHeight))) {
        statusBarHeight = Number(sys.statusBarHeight);
      }
      if (sys && Number.isFinite(Number(sys.windowHeight))) {
        windowHeight = Number(sys.windowHeight);
      }
      var safeArea = sys && sys.safeArea;
      var screenHeight = Number(sys && sys.screenHeight) || 0;
      var safeBottom = safeArea && Number(safeArea.bottom);
      if (screenHeight > 0 && Number.isFinite(safeBottom)) {
        safeInsetBottom = Math.max(0, screenHeight - safeBottom);
      }
      if (wx.getMenuButtonBoundingClientRect) {
        var menu = wx.getMenuButtonBoundingClientRect();
        var menuTop = Number(menu && menu.top);
        var menuHeight = Number(menu && menu.height);
        if (Number.isFinite(menuTop) && Number.isFinite(menuHeight) && menuHeight > 0) {
          navBarHeight = Math.max(32, Math.round((menuTop - statusBarHeight) * 2 + menuHeight));
        }
      }
    } catch (e) {}
    var homePageBottomPaddingPx = HOME_TAB_BAR_HEIGHT_PX + HOME_TAB_BAR_CLEARANCE_PX + safeInsetBottom;
    this.setData({
      navStatusBarHeight: statusBarHeight,
      navBarHeight: navBarHeight,
      homePageBottomPaddingPx: homePageBottomPaddingPx
    });
  },
  _startHomeBleTelemetrySync: function _startHomeBleTelemetrySync() {
    var _this2 = this;
    if (this._homeBleSyncTimer) return;
    this._syncHomeBleTelemetry();
    this._homeBleSyncTimer = setInterval(function() {
      _this2._syncHomeBleTelemetry();
    }, HOME_BLE_SYNC_POLL_MS);
  },
  _stopHomeBleTelemetrySync: function _stopHomeBleTelemetrySync() {
    if (this._homeBleSyncTimer) {
      clearInterval(this._homeBleSyncTimer);
      this._homeBleSyncTimer = null;
    }
    this._clearHomeBleNotify();
  },
  _setCupWaterDisplayMl: function _setCupWaterDisplayMl(value) {
    var waterMl = normalizeWaterMl(value);
    var nextText = "".concat(waterMl, "ml");
    var patch = {};
    if (nextText !== this.data.cupWaterMlText) patch.cupWaterMlText = nextText;
    if (waterMl !== Number(this.data.cupWaterMlValue)) patch.cupWaterMlValue = waterMl;
    if (Object.keys(patch).length) {
      this.setData(patch);
    }
    return waterMl;
  },
  _syncCupWaterDisplayFromMode: function _syncCupWaterDisplayFromMode() {
    var payload = this._homeLatestBlePayload;
    var waterValid = payload && payload.waterValid === true && Number.isFinite(Number(payload.waterMl));
    if (waterValid) {
      this._setCupWaterDisplayMl(normalizeWaterMl(payload.waterMl));
      return;
    }
    this._setCupWaterDisplayMl(0);
  },
  _clearHomeBleNotify: function _clearHomeBleNotify() {
    if (typeof this._homeBleNotifyOff === "function") {
      this._homeBleNotifyOff();
    }
    this._homeBleNotifyOff = null;
    this._homeBleNotifyDeviceId = "";
    this._homeLatestBlePayload = null;
    this._homeLatestBleAt = 0;
    this._waterAutoStableMl = null;
    this._waterAutoCandidateMl = null;
    this._waterAutoCandidateCount = 0;
    this._waterAutoLastAt = 0;
  },
  _bindHomeBleTelemetry: function _bindHomeBleTelemetry(deviceId) {
    var _this3 = this;
    if (!deviceId) {
      this._clearHomeBleNotify();
      return;
    }
    if (this._homeBleNotifyOff && this._homeBleNotifyDeviceId === deviceId) return;
    this._clearHomeBleNotify();
    this._homeBleNotifyDeviceId = deviceId;
    this._homeBleNotifyOff = ble.onNotifyParsed(deviceId, function(payload) {
      _this3._homeLatestBlePayload = payload || null;
      _this3._homeLatestBleAt = Date.now();
      var tempRaw = payload && payload.temperature;
      var tempNum = Number(tempRaw);
      var tdsNum = Number(payload && payload.tds);
      var hasValidTemp = payload && payload.temperatureValid !== false && Number.isFinite(tempNum);
      var hasValidTds = payload && payload.tdsSensorPresent === true && payload.tdsValid === true && Number.isFinite(tdsNum);
      var phoneHeatDisplayActive = _this3._phoneLocationHeatActive === true;
      var phoneHeatDisplayHolding = _this3._phoneLocationHeatHoldActive === true;
      var phoneHeatDisplayLocked = phoneHeatDisplayActive || phoneHeatDisplayHolding;
      var nextTemp = hasValidTemp ? tempNum : 20.60;
      var nextTds = hasValidTds ? Math.max(0, Math.round(tdsNum)) : "--";
      if (hasValidTds) {
        wx.setStorageSync(LAST_TDS_KEY, nextTds);
      }
      var patch = {};
      var prevHeaterOn = !!_this3.data.heaterOn;
      var nextHeaterOn = phoneHeatDisplayActive ? true : phoneHeatDisplayHolding ? false : payload && typeof payload.heaterOn === "boolean" ? !!payload.heaterOn : prevHeaterOn;
      var heaterChanged = nextHeaterOn !== prevHeaterOn;
      if (!phoneHeatDisplayLocked && String(nextTemp) !== String(_this3.data.temperature)) {
        patch.temperature = nextTemp;
      }
      if (String(nextTds) !== String(_this3.data.tds)) patch.tds = nextTds;
      if (heaterChanged) {
        patch.heaterOn = nextHeaterOn;
        if (nextHeaterOn) {
          patch.heatCooling = false;
        } else {
          patch.heatCooling = true;
          patch.heatTarget = null;
        }
      }
      var waterValid = payload && payload.waterValid === true && Number.isFinite(Number(payload.waterMl));
      if (waterValid) {
        var waterMl = normalizeWaterMl(payload.waterMl);
        var text = "".concat(waterMl, "ml");
        if (text !== _this3.data.cupWaterMlText) patch.cupWaterMlText = text;
        if (waterMl !== Number(_this3.data.cupWaterMlValue)) patch.cupWaterMlValue = waterMl;
        _this3._handleAutoWaterDrop(waterMl);
      } else {
        if (_this3.data.cupWaterMlText !== "0ml" || Number(_this3.data.cupWaterMlValue) !== 0) {
          patch.cupWaterMlText = "0ml";
          patch.cupWaterMlValue = 0;
        }
        _this3._waterAutoStableMl = null;
        _this3._waterAutoCandidateMl = null;
        _this3._waterAutoCandidateCount = 0;
      }
      var now = new Date();
      var hours = now.getHours().toString().padStart(2, '0');
      var minutes = now.getMinutes().toString().padStart(2, '0');
      patch.lastUpdateText = "".concat(hours, ":").concat(minutes);
      _this3.setData(patch, function() {
        if (!heaterChanged) return;
        if (nextHeaterOn) {
          _this3._clearHeatCoolingVisual();
          _this3._startHeatLoadingTicker();
          return;
        }
        _this3._stopHeatingTimer();
        _this3._stopHeatLoadingTicker();
        _this3._startHeatCoolingVisual();
      });
    });
  },
  _syncHomeBleTelemetry: function _syncHomeBleTelemetry() {
    var _this4 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee() {
      var deviceId;
      return _regeneratorRuntime2().wrap(function _callee$(_context) {
        while (1) switch (_context.prev = _context.next) {
          case 0:
            if (!_this4.data.virtualConnected) {
              _context.next = 4;
              break;
            }
            _this4._clearHomeBleNotify();
            _this4._syncCupWaterDisplayFromMode();
            return _context.abrupt("return");
          case 4:
            _context.next = 6;
            return _this4._getConnectedCupDeviceId();
          case 6:
            deviceId = _context.sent;
            if (deviceId) {
              _context.next = 11;
              break;
            }
            _this4._clearHomeBleNotify();
            _this4._syncCupWaterDisplayFromMode();
            return _context.abrupt("return");
          case 11:
            _this4._bindHomeBleTelemetry(deviceId);
          case 12:
          case "end":
            return _context.stop();
        }
      }, _callee);
    }))();
  },
  _handleAutoWaterDrop: function _handleAutoWaterDrop(currentMl) {
    if (!Number.isFinite(currentMl)) return;
    var stableMl = normalizeWaterMl(currentMl);
    var now = Date.now();
    if (this._waterAutoCandidateMl === stableMl) {
      this._waterAutoCandidateCount = Number(this._waterAutoCandidateCount || 0) + 1;
    } else {
      this._waterAutoCandidateMl = stableMl;
      this._waterAutoCandidateCount = 1;
    }
    if (this._waterAutoCandidateCount < WATER_AUTO_STABLE_FRAMES) return;
    if (this._waterAutoStableMl === null || this._waterAutoStableMl === undefined) {
      this._waterAutoStableMl = stableMl;
      return;
    }
    var diff = this._waterAutoStableMl - stableMl;
    if (diff >= WATER_AUTO_MIN_DROP_ML && diff <= WATER_AUTO_MAX_DROP_ML) {
      if (this._waterAutoLastAt && now - this._waterAutoLastAt < WATER_AUTO_COOLDOWN_MS) return;
      this._waterAutoLastAt = now;
      this._waterAutoStableMl = stableMl;
      this._addAutoCheckinRecords(diff);
      return;
    }
    this._waterAutoStableMl = stableMl;
  },
  _addAutoCheckinRecords: function _addAutoCheckinRecords(amountValue) {
    var remain = Math.round(Number(amountValue) || 0);
    if (!Number.isFinite(remain) || remain <= 0) return;
    while (remain > 0) {
      var chunk = Math.min(remain, CHECKIN_MAX_SINGLE_AMOUNT_ML);
      this._addHomeCheckinRecord(chunk, {
        silent: true
      });
      remain -= chunk;
    }
  },
  _getConnectedCupDeviceId: function _getConnectedCupDeviceId() {
    var _this5 = this;
    return new Promise(function(resolve) {
      if (_this5.data.virtualConnected) return resolve("");
      if (!wx.getConnectedBluetoothDevices || !ble.SERVICE_UUID) return resolve("");
      var lastId = String(wx.getStorageSync("smartcup_last_device_id") || "");
      wx.getConnectedBluetoothDevices({
        services: [ble.SERVICE_UUID],
        success: function success(res) {
          var list = Array.isArray(res && res.devices) ? res.devices : [];
          if (!list.length) return resolve("");
          if (lastId) {
            var matched = list.find(function(d) {
              return d && d.deviceId === lastId;
            });
            if (matched && matched.deviceId) return resolve(String(matched.deviceId));
          }
          var first = list.find(function(d) {
            return d && d.deviceId;
          });
          resolve(first && first.deviceId ? String(first.deviceId) : "");
        },
        fail: function fail() {
          return resolve("");
        }
      });
    });
  },
  _getHomeHeaterAckState: function _getHomeHeaterAckState(expected) {
    var since = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
    var lastAt = Number(this._homeLatestBleAt || 0);
    if (lastAt <= Number(since) || Date.now() - lastAt > HOME_HEAT_STATUS_STALE_MS) {
      return false;
    }
    var payload = this._homeLatestBlePayload;
    return !!(payload && typeof payload.heaterOn === "boolean" && payload.heaterOn === expected);
  },
  _waitForHomeHeaterAck: function _waitForHomeHeaterAck(expected) {
    var _this6 = this;
    var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    var timeoutMs = Math.max(600, Number(options.timeoutMs) || HOME_HEAT_ACK_TIMEOUT_MS);
    var intervalMs = Math.max(80, Number(options.intervalMs) || 120);
    var since = Number(options.since) || 0;
    return new Promise(function(resolve) {
      var startedAt = Date.now();
      var tick = function tick() {
        if (_this6._getHomeHeaterAckState(expected, since)) {
          resolve(true);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(tick, intervalMs);
      };
      tick();
    });
  },
  _ensureHomeHeatDeviceReady: function _ensureHomeHeatDeviceReady() {
    var _this7 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee2() {
      var deviceId, lastId;
      return _regeneratorRuntime2().wrap(function _callee2$(_context2) {
        while (1) switch (_context2.prev = _context2.next) {
          case 0:
            if (!_this7.data.virtualConnected) {
              _context2.next = 2;
              break;
            }
            return _context2.abrupt("return", "");
          case 2:
            _context2.next = 4;
            return _this7._getConnectedCupDeviceId();
          case 4:
            deviceId = _context2.sent;
            if (deviceId) {
              _context2.next = 14;
              break;
            }
            lastId = String(wx.getStorageSync("smartcup_last_device_id") || "");
            if (lastId) {
              _context2.next = 9;
              break;
            }
            return _context2.abrupt("return", "");
          case 9:
            _context2.next = 11;
            return ble.connect(lastId);
          case 11:
            deviceId = lastId;
            _context2.next = 16;
            break;
          case 14:
            _context2.next = 16;
            return ble.connect(deviceId);
          case 16:
            _this7._bindHomeBleTelemetry(deviceId);
            ble.writeCommand(deviceId, [0x12]).catch(function() {});
            return _context2.abrupt("return", deviceId);
          case 19:
          case "end":
            return _context2.stop();
        }
      }, _callee2);
    }))();
  },
  _sendHomeHeatCommand: function _sendHomeHeatCommand(deviceId, targetTemp) {
    var _this8 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee3() {
      var lastError, attempt, since, acked;
      return _regeneratorRuntime2().wrap(function _callee3$(_context3) {
        while (1) switch (_context3.prev = _context3.next) {
          case 0:
            lastError = null;
            attempt = 0;
          case 2:
            if (!(attempt < HOME_HEAT_RETRY_TIMES)) {
              _context3.next = 32;
              break;
            }
            since = Date.now();
            _context3.prev = 4;
            _context3.next = 7;
            return ble.writeCommand(deviceId, [0x11, targetTemp]);
          case 7:
            _context3.next = 9;
            return ble.writeHeat(deviceId, true);
          case 9:
            ble.writeCommand(deviceId, [0x12]).catch(function() {});
            _context3.next = 12;
            return _this8._waitForHomeHeaterAck(true, {
              since: since
            });
          case 12:
            acked = _context3.sent;
            if (!acked) {
              _context3.next = 15;
              break;
            }
            return _context3.abrupt("return", true);
          case 15:
            lastError = new Error("heat on ack timeout");
            _context3.next = 21;
            break;
          case 18:
            _context3.prev = 18;
            _context3.t0 = _context3["catch"](4);
            lastError = _context3.t0;
          case 21:
            if (!(attempt < HOME_HEAT_RETRY_TIMES - 1)) {
              _context3.next = 29;
              break;
            }
            _context3.next = 24;
            return sleep(HOME_HEAT_RETRY_DELAY_MS);
          case 24:
            _context3.next = 26;
            return ble.connect(deviceId).catch(function() {});
          case 26:
            _context3.next = 28;
            return _this8._syncHomeBleTelemetry().catch(function() {});
          case 28:
            ble.writeCommand(deviceId, [0x12]).catch(function() {});
          case 29:
            attempt += 1;
            _context3.next = 2;
            break;
          case 32:
            if (!lastError) {
              _context3.next = 34;
              break;
            }
            throw lastError;
          case 34:
            return _context3.abrupt("return", false);
          case 35:
          case "end":
            return _context3.stop();
        }
      }, _callee3, null, [
        [4, 18]
      ]);
    }))();
  },
  _sendHomeHeatOffCommand: function _sendHomeHeatOffCommand(deviceId) {
    var _this9 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee4() {
      var lastError, attempt, since, acked;
      return _regeneratorRuntime2().wrap(function _callee4$(_context4) {
        while (1) switch (_context4.prev = _context4.next) {
          case 0:
            lastError = null;
            attempt = 0;
          case 2:
            if (!(attempt < HOME_HEAT_RETRY_TIMES)) {
              _context4.next = 30;
              break;
            }
            since = Date.now();
            _context4.prev = 4;
            _context4.next = 7;
            return ble.writeHeat(deviceId, false);
          case 7:
            ble.writeCommand(deviceId, [0x12]).catch(function() {});
            _context4.next = 10;
            return _this9._waitForHomeHeaterAck(false, {
              since: since
            });
          case 10:
            acked = _context4.sent;
            if (!acked) {
              _context4.next = 13;
              break;
            }
            return _context4.abrupt("return", true);
          case 13:
            lastError = new Error("heat off ack timeout");
            _context4.next = 19;
            break;
          case 16:
            _context4.prev = 16;
            _context4.t0 = _context4["catch"](4);
            lastError = _context4.t0;
          case 19:
            if (!(attempt < HOME_HEAT_RETRY_TIMES - 1)) {
              _context4.next = 27;
              break;
            }
            _context4.next = 22;
            return sleep(HOME_HEAT_RETRY_DELAY_MS);
          case 22:
            _context4.next = 24;
            return ble.connect(deviceId).catch(function() {});
          case 24:
            _context4.next = 26;
            return _this9._syncHomeBleTelemetry().catch(function() {});
          case 26:
            ble.writeCommand(deviceId, [0x12]).catch(function() {});
          case 27:
            attempt += 1;
            _context4.next = 2;
            break;
          case 30:
            if (!lastError) {
              _context4.next = 32;
              break;
            }
            throw lastError;
          case 32:
            return _context4.abrupt("return", false);
          case 33:
          case "end":
            return _context4.stop();
        }
      }, _callee4, null, [
        [4, 16]
      ]);
    }))();
  },
  _formatHomeHeatError: function _formatHomeHeatError(err, fallbackText) {
    var msg = String(err && err.message || "");
    if (/heat on ack timeout/i.test(msg)) return "加热启动超时，请重试";
    if (/heat off ack timeout/i.test(msg)) return "关闭加热超时，请重试";
    var info = ble.explainBleError ? ble.explainBleError(err) : null;
    if (info && info.text) return "".concat(fallbackText, "\uFF1A").concat(info.text);
    return fallbackText;
  },
  onUnload: function onUnload() {
    this._alive = false;
    petStore.setPageVisible("index", false);
    if (this._glanceTimer) { clearTimeout(this._glanceTimer); this._glanceTimer = 0; }
    this._clearGlanceTimers();
    if (this._petBubbleTimer) { clearTimeout(this._petBubbleTimer); this._petBubbleTimer = 0; }
    if (this._petLandTimer) { clearTimeout(this._petLandTimer); this._petLandTimer = 0; }
    if (this._petReturnTimer) { clearTimeout(this._petReturnTimer); this._petReturnTimer = 0; }
    petStore.setPageVisible("index", false);
    clearTimeout(this._loadingTimer);
    this._stopHomeBleTelemetrySync();
    this._stopHomeTodayTotalAnim();
    this._stopHeatingTimer();
    this._stopHeatLoadingTicker();
    this._clearHeatCoolingVisual();
  },
  goDevice: function goDevice() {
    this._notePadTap();
    this._petNavigate("/pages/device/device");
  },
  goMap: function goMap() {
    this._notePadTap();
    this._petNavigate("/pages/map/map");
  },
  goChat: function goChat() {
    this._notePadTap();
    this._petNavigate("/pages/chat/chat");
  },
  goCheckinRecords: function goCheckinRecords() {
    wx.navigateTo({
      url: "/pages/checkin/checkin?focus=records"
    });
  },
  goQualityRange: function goQualityRange() {
    var tdsNum = Number(this.data.tds);
    var tds = Number.isFinite(tdsNum) ? Math.max(0, Math.round(tdsNum)) : 0;
    wx.navigateTo({
      url: "/pages/water-quality-standards/water-quality-standards?tds=".concat(tds)
    });
  },
  onHomeQuickAmountTap: function onHomeQuickAmountTap(e) {
    var amount = e.currentTarget.dataset.amount;
    this._addHomeCheckinRecord(amount);
  },
  onHomeCustomAmountInput: function onHomeCustomAmountInput(e) {
    this.setData({
      homeCustomAmountInput: "".concat(e.detail.value || "").replace(/[^\d]/g, "")
    });
  },
  onHomeCustomAmountConfirm: function onHomeCustomAmountConfirm() {
    this._addHomeCheckinRecord(this.data.homeCustomAmountInput);
  },
  openGoalEditor: function openGoalEditor() {
    this.setData({
      showGoalEditor: true,
      goalInput: "".concat(this.data.dailyGoalMl)
    });
  },
  closeGoalEditor: function closeGoalEditor() {
    this.setData({
      showGoalEditor: false
    });
  },
  openHeatPanel: function openHeatPanel() {
    var self = this;
    /* 球若被拖走悬浮，先瞬时复位再起飞：飞行落点按锚点（.padPet 原位）
     * 实测计算，带着拖拽偏移起飞会落偏 */
    var ball = this.selectComponent("#padPetBall");
    if (ball && typeof ball.snapHome === "function") ball.snapHome();
    this.setData({ showHeatPanel: true }, function() {
      self._flyPetToPanel();
    });
  },
  closeHeatPanel: function closeHeatPanel() {
    var self = this;
    if (this._petLandTimer) {
      clearTimeout(this._petLandTimer);
      this._petLandTimer = 0;
    }
    if (!this.data.petFly) {
      this.setData({ showHeatPanel: false });
      return;
    }
    /* 回归：先只启动位移过渡（层级保持提升态，避免过渡中途重新分层），
     * 面板/遮罩同帧撤除；飞完再摘 petFly、恢复表情帧循环。
     * 上一版"球消失"的真凶是渲染帧崩溃（已由 addStop 根除），非本流程 */
    var comp = this.selectComponent("#padPetBall");
    if (comp && comp.setTickSuspended) comp.setTickSuspended(true);
    this.setData({
      showHeatPanel: false,
      petFlyStyle: "translate3d(0px, 0px, 0px)"
    });
    if (this._petReturnTimer) clearTimeout(this._petReturnTimer);
    this._petReturnTimer = setTimeout(function() {
      self._petReturnTimer = 0;
      if (self.data.showHeatPanel) return; /* 途中又开面板：交给飞行流程 */
      self.setData({ petFly: false, petFlyStyle: "" });
      if (comp && comp.setTickSuspended) comp.setTickSuspended(false);
    }, 480);
  },
  /* 点加热：球飞进面板左上角的凹座并打招呼。位移交给包装层一次
   * transform + CSS transition 合成器驱动，全程不逐帧 setData；落定后
   * 恢复表情帧循环并补落地弹跳 */
  _flyPetToPanel: function _flyPetToPanel() {
    var self = this;
    if (!this.data.petOn || !petStore.isEnabled()) return;
    var query = this.createSelectorQuery();
    query.select("#padPetAnchor").boundingClientRect();
    query.select(".heatPanelWrap").boundingClientRect();
    query.exec(function(res) {
      var ballRect = res && res[0];
      var panelRect = res && res[1];
      if (!ballRect || !panelRect || !ballRect.width) return;
      var winWidth = 375;
      try {
        var info = wx.getWindowInfo ? wx.getWindowInfo() : null;
        if (info && info.windowWidth) winWidth = info.windowWidth;
      } catch (error) { /* 保底 375 */ }
      var k = winWidth / 750;
      /* 落点：球心对准面板左上角的凹座座心 */
      var targetCx = panelRect.left + 150 * k;
      var targetCy = panelRect.top + 30 * k;
      var dx = targetCx - (ballRect.left + ballRect.width / 2);
      var dy = targetCy - (ballRect.top + ballRect.height / 2);
      if (self._petReturnTimer) {
        clearTimeout(self._petReturnTimer);
        self._petReturnTimer = 0;
      }
      /* 起飞即暂停表情帧循环：位移交给合成器过渡，引擎重绘不与其抢管线 */
      var comp = self.selectComponent("#padPetBall");
      if (comp && comp.setTickSuspended) comp.setTickSuspended(true);
      self.setData({
        petFly: true,
        petFlyStyle: "translate3d(" + dx.toFixed(1) + "px, " + dy.toFixed(1) + "px, 0)"
      });
      /* 台词跟着球飞，停留比普通气泡久，够读完面板标题 */
      self._showPetBubble(HEAT_LINES[Math.floor(Math.random() * HEAT_LINES.length)], 6500);
      try { petStore.flash(petStore.EMO.recvTask, 2400); } catch (error) { /* 表情失败不影响飞行 */ }
      /* 落定后恢复表情帧循环并补落地弹跳：动画尾段不叠加重绘 */
      if (self._petLandTimer) clearTimeout(self._petLandTimer);
      self._petLandTimer = setTimeout(function() {
        self._petLandTimer = 0;
        if (!self.data.petFly) return;
        if (comp && comp.setTickSuspended) comp.setTickSuspended(false);
        if (comp) comp.bounce();
      }, 480);
    });
  },
  _loadHeatPresetOptions: function _loadHeatPresetOptions() {
    var storedMap = {};
    try {
      var raw = wx.getStorageSync(HEAT_PRESET_STORAGE_KEY);
      if (raw && _typeof2(raw) === "object") {
        storedMap = raw;
      }
    } catch (error) {
      console.warn("[heat preset read fail]", error);
    }
    var nextState = buildHeatPresetOptionState(storedMap);
    this.setData(nextState);
    var normalizedMap = buildHeatPresetStorageMap(nextState.heatSceneOptions, nextState.heatOptions);
    if (JSON.stringify(normalizedMap) !== JSON.stringify(storedMap)) {
      try {
        wx.setStorageSync(HEAT_PRESET_STORAGE_KEY, normalizedMap);
      } catch (error) {
        console.warn("[heat preset normalize fail]", error);
      }
    }
  },
  _saveHeatPresetOptions: function _saveHeatPresetOptions() {
    var sceneOptions = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.data.heatSceneOptions;
    var baseOptions = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.data.heatOptions;
    var nextMap = buildHeatPresetStorageMap(sceneOptions || [], baseOptions || []);
    try {
      wx.setStorageSync(HEAT_PRESET_STORAGE_KEY, nextMap);
      return true;
    } catch (error) {
      console.warn("[heat preset write fail]", error);
      wx.showToast({
        title: "温度保存失败",
        icon: "none"
      });
      return false;
    }
  },
  _getHeatPresetList: function _getHeatPresetList(group) {
    if (group === "scene") {
      return Array.isArray(this.data.heatSceneOptions) ? this.data.heatSceneOptions : [];
    }
    return Array.isArray(this.data.heatOptions) ? this.data.heatOptions : [];
  },
  _findHeatPreset: function _findHeatPreset(group, key) {
    return this._getHeatPresetList(group).find(function(item) {
      return item.key === key;
    }) || null;
  },
  pickHeatPreset: function pickHeatPreset(e) {
    var _this10 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee5() {
      var _ref, group, key, picked, deviceId;
      return _regeneratorRuntime2().wrap(function _callee5$(_context5) {
        while (1) switch (_context5.prev = _context5.next) {
          case 0:
            _ref = e.currentTarget.dataset || {}, group = _ref.group, key = _ref.key;
            picked = _this10._findHeatPreset(group, key);
            if (picked) {
              _context5.next = 4;
              break;
            }
            return _context5.abrupt("return");
          case 4:
            _this10.closeHeatPanel();
            if (!_this10._heatCommandBusy) {
              _context5.next = 8;
              break;
            }
            wx.showToast({
              title: "加热指令处理中",
              icon: "none"
            });
            return _context5.abrupt("return");
          case 8:
            if (!_this10._isPhoneLocationMode()) {
              _context5.next = 12;
              break;
            }
            _this10._applyHeatPreset(picked, {
              phoneLocationDisplay: true
            });
            _this10._trySendPhoneLocationHeatCommand(picked.temp);
            return _context5.abrupt("return");
          case 12:
            _this10._heatCommandBusy = true;
            _context5.prev = 13;
            _this10.setData({
              heatResponsePending: true
            });
            if (_this10.data.virtualConnected) {
              _context5.next = 24;
              break;
            }
            _context5.next = 18;
            return _this10._ensureHomeHeatDeviceReady();
          case 18:
            deviceId = _context5.sent;
            if (deviceId) {
              _context5.next = 22;
              break;
            }
            wx.showToast({
              title: "未连接水杯",
              icon: "none"
            });
            return _context5.abrupt("return");
          case 22:
            _context5.next = 24;
            return _this10._sendHomeHeatCommand(deviceId, picked.temp);
          case 24:
            _this10._applyHeatPreset(picked);
            _context5.next = 31;
            break;
          case 27:
            _context5.prev = 27;
            _context5.t0 = _context5["catch"](13);
            console.warn("[home heat start fail]", _context5.t0);
            wx.showToast({
              title: _this10._formatHomeHeatError(_context5.t0, "加热启动失败"),
              icon: "none"
            });
          case 31:
            _context5.prev = 31;
            if (_this10.data.heatResponsePending) {
              _this10.setData({
                heatResponsePending: false
              });
            }
            _this10._heatCommandBusy = false;
            return _context5.finish(31);
          case 35:
          case "end":
            return _context5.stop();
        }
      }, _callee5, null, [
        [13, 27, 31, 35]
      ]);
    }))();
  },
  editHeatPresetTemp: function editHeatPresetTemp(e) {
    var _this11 = this;
    var _ref2 = e.currentTarget.dataset || {},
      group = _ref2.group,
      key = _ref2.key;
    var picked = this._findHeatPreset(group, key);
    if (!picked) return;
    wx.showActionSheet({
      alertText: "\u8BBE\u7F6E\u300C".concat(picked.title, "\u300D\u76EE\u6807\u6E29\u5EA6"),
      itemList: HEAT_ALLOWED_PRESET_TEMPS.map(function(temp) {
        return "".concat(temp, "\xB0C").concat(temp === picked.temp ? "\uFF08\u5F53\u524D\uFF09" : "");
      }),
      success: function success(res) {
        var nextTemp = HEAT_ALLOWED_PRESET_TEMPS[res.tapIndex];
        if (!nextTemp || nextTemp === picked.temp) return;
        _this11._updateHeatPresetTemp(group, key, nextTemp);
      },
      fail: function fail() {}
    });
  },
  _updateHeatPresetTemp: function _updateHeatPresetTemp(group, key, nextTemp) {
    var field = group === "scene" ? "heatSceneOptions" : "heatOptions";
    var updatedList = this._getHeatPresetList(group).map(function(item) {
      return item.key === key ? _objectSpread2(_objectSpread2({}, item), {}, {
        temp: nextTemp
      }) : item;
    });
    var sceneOptions = group === "scene" ? updatedList : this._getHeatPresetList("scene");
    var baseOptions = group === "scene" ? this._getHeatPresetList("base") : updatedList;
    this.setData(_defineProperty2({}, field, updatedList));
    this._saveHeatPresetOptions(sceneOptions, baseOptions);
    wx.showToast({
      title: "\u5DF2\u66F4\u65B0\u4E3A ".concat(nextTemp, "\xB0C"),
      icon: "none"
    });
  },
  onGoalInput: function onGoalInput(e) {
    this.setData({
      goalInput: "".concat(e.detail.value || "").replace(/[^\d]/g, "")
    });
  },
  _legacyLocalSaveGoal: function _legacyLocalSaveGoal() {
    var parsed = Number(this.data.goalInput);
    if (!Number.isFinite(parsed)) {
      wx.showToast({
        title: "\u8BF7\u8F93\u5165 ".concat(CHECKIN_MIN_GOAL_ML, "-").concat(CHECKIN_MAX_GOAL_ML, " \u7684\u76EE\u6807\u503C"),
        icon: "none"
      });
      return;
    }
    if (parsed < CHECKIN_MIN_GOAL_ML || parsed > CHECKIN_MAX_GOAL_ML) {
      wx.showToast({
        title: "\u76EE\u6807\u8303\u56F4 ".concat(CHECKIN_MIN_GOAL_ML, "-").concat(CHECKIN_MAX_GOAL_ML, "ml"),
        icon: "none"
      });
      return;
    }
    var store = this._loadHomeCheckinStore();
    store.dailyGoalMl = Math.round(parsed);
    store.updatedAt = Date.now();
    if (!this._saveHomeCheckinStore(store)) return;
    this.setData({
      showGoalEditor: false
    });
    this._refreshHomeTodayTotal({
      immediate: true
    });
    wx.showToast({
      title: "目标已更新",
      icon: "none"
    });
  },
  _legacyLocalLoadHomeCheckinStore: function _legacyLocalLoadHomeCheckinStore() {
    return checkinOps.safeReadStore({
      key: CHECKIN_STORAGE_KEY,
      sanitize: normalizeCheckinStore,
      onReadError: function onReadError(error) {
        console.error("鐠囪褰囬幍鎾冲幢閺佺増宓佹径杈Е", error);
      }
    });
  },
  _legacyLocalSaveHomeCheckinStore: function _legacyLocalSaveHomeCheckinStore(store) {
    return checkinOps.safeWriteStore({
      key: CHECKIN_STORAGE_KEY,
      store: store,
      onWriteError: function onWriteError(error) {
        console.error("娣囨繂鐡ㄩ幍鎾冲幢閺佺増宓佹径杈Е", error);
        wx.showToast({
          title: "保存失败，请稍后重试",
          icon: "none"
        });
      }
    });
  },
  _legacyLocalRefreshHomeTodayTotal: function _legacyLocalRefreshHomeTodayTotal() {
    var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    var store = this._loadHomeCheckinStore();
    var todayKey = toDateKey(new Date());
    var todayList = Array.isArray(store.recordsByDate[todayKey]) ? store.recordsByDate[todayKey] : [];
    var homeTodayTotalMl = sumCheckinAmounts(todayList);
    var dailyGoalMl = Number(store.dailyGoalMl) || CHECKIN_DEFAULT_GOAL_ML;
    var remainingMl = Math.max(dailyGoalMl - homeTodayTotalMl, 0);
    var progressPercent = dailyGoalMl > 0 ? clamp(Math.round(homeTodayTotalMl * 100 / dailyGoalMl), 0, 100) : 0;
    var streakDays = calculateHomeCheckinStreak(store.recordsByDate, dailyGoalMl, todayKey);
    var latestRecord = todayList.length ? todayList[todayList.length - 1] : null;
    var latestCheckinText = latestRecord ? "\u6700\u8FD1\uFF1A".concat(formatHomeCheckinTime(latestRecord.ts), " +").concat(latestRecord.amount, "ml") : "今日还未打卡";
    this.setData({
      todayLabel: formatHomeCheckinDate(todayKey),
      dailyGoalMl: dailyGoalMl,
      remainingMl: remainingMl,
      progressPercent: progressPercent,
      recordCountToday: todayList.length,
      streakDays: streakDays,
      latestCheckinText: latestCheckinText,
      progressBarStyle: "width:".concat(progressPercent, "%;")
    });
    petStore.setDrinkPercent(progressPercent);
    this._animateHomeTodayTotal(homeTodayTotalMl, {
      immediate: !!options.immediate
    });
  },
  _stopHomeTodayTotalAnim: function _stopHomeTodayTotalAnim() {
    if (this._homeTodayAnimTimer) {
      clearTimeout(this._homeTodayAnimTimer);
      this._homeTodayAnimTimer = null;
    }
  },
  _animateHomeTodayTotal: function _animateHomeTodayTotal(targetValue) {
    var _this12 = this;
    var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    var target = Math.max(0, Math.round(Number(targetValue) || 0));
    var currentRaw = Number(this.data.homeTodayTotalMl);
    var current = Number.isFinite(currentRaw) ? Math.max(0, Math.round(currentRaw)) : 0;
    var immediate = !!options.immediate;
    this._stopHomeTodayTotalAnim();
    if (immediate || target <= current) {
      if (target !== current) this.setData({
        homeTodayTotalMl: target
      });
      return;
    }
    var delta = target - current;
    var duration = clamp(360 + delta * 1.4, HOME_TODAY_ANIM_MIN_DURATION, HOME_TODAY_ANIM_MAX_DURATION);
    var startTs = Date.now();
    var tick = function tick() {
      var elapsed = Date.now() - startTs;
      var progress = clamp(elapsed / duration, 0, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var nextValue = current + Math.round(delta * eased);
      if (nextValue !== _this12.data.homeTodayTotalMl) {
        _this12.setData({
          homeTodayTotalMl: nextValue
        });
      }
      if (progress >= 1) {
        _this12._homeTodayAnimTimer = null;
        if (nextValue !== target) _this12.setData({
          homeTodayTotalMl: target
        });
        return;
      }
      _this12._homeTodayAnimTimer = setTimeout(tick, HOME_TODAY_ANIM_FRAME_MS);
    };
    tick();
  },
  _legacyLocalAddHomeCheckinRecord: function _legacyLocalAddHomeCheckinRecord(amountValue) {
    var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    var silent = !!options.silent;
    var rawAmount = Math.round(Number(amountValue));
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      if (!silent) wx.showToast({
        title: "请输入有效饮水量",
        icon: "none"
      });
      return;
    }
    if (rawAmount > CHECKIN_MAX_SINGLE_AMOUNT_ML) {
      if (!silent) wx.showToast({
        title: "\u5355\u6B21\u6700\u591A ".concat(CHECKIN_MAX_SINGLE_AMOUNT_ML, "ml"),
        icon: "none"
      });
      return;
    }
    var amount = normalizeCheckinAmount(rawAmount);
    var store = this._loadHomeCheckinStore();
    var _checkinOps$appendRec = checkinOps.appendRecordToStore({
        store: store,
        amount: amount,
        toDateKey: toDateKey,
        sumAmounts: sumCheckinAmounts,
        makeRecordId: makeCheckinRecordId,
        maxDailyRecords: CHECKIN_MAX_DAILY_RECORDS
      }),
      beforeTotal = _checkinOps$appendRec.beforeTotal,
      afterTotal = _checkinOps$appendRec.afterTotal;
    if (!this._saveHomeCheckinStore(store)) return;

    // 打卡成功后更新时间戳，供提醒模块计算间隔。
    var now = Date.now();
    waterReminder.setLastWaterTime(now);
    var dailyGoalMl = Number(store.dailyGoalMl) || CHECKIN_DEFAULT_GOAL_ML;
    if (!silent) this.setData({
      homeCustomAmountInput: ""
    });
    this._refreshHomeTodayTotal();
    if (!silent) {
      if (beforeTotal < dailyGoalMl && afterTotal >= dailyGoalMl) {
        wx.showToast({
          title: "今日饮水目标已完成",
          icon: "none"
        });
        return;
      }
      wx.showToast({
        title: "\u5DF2\u8BB0\u5F55 +".concat(amount, "ml"),
        icon: "none"
      });
    }
  },
  // 閸旂姷鍎归敍姘川缁€娲偓鏄忕帆閿涘牏婀＄€圭偤銆嶉惄顕€鍣烽幑銏″灇閽冩繄澧幐鍥︽姢閹存牔绨粩顖涘付閸掕绱?
  toggleHeat: function toggleHeat() {
    this._notePadTap();
    var _this13 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee6() {
      var deviceId;
      return _regeneratorRuntime2().wrap(function _callee6$(_context6) {
        while (1) switch (_context6.prev = _context6.next) {
          case 0:
            if (!_this13._heatCommandBusy) {
              _context6.next = 3;
              break;
            }
            wx.showToast({
              title: "加热指令处理中",
              icon: "none"
            });
            return _context6.abrupt("return");
          case 3:
            if (!_this13.data.heaterOn) {
              _context6.next = 32;
              break;
            }
            if (!(_this13._phoneLocationHeatActive || _this13._isPhoneLocationMode())) {
              _context6.next = 8;
              break;
            }
            _this13._applyHomeHeatStoppedUi();
            _this13._trySendPhoneLocationHeatOffCommand();
            return _context6.abrupt("return");
          case 8:
            _this13._heatCommandBusy = true;
            _context6.prev = 9;
            _this13.setData({
              heatResponsePending: true
            });
            if (_this13.data.virtualConnected) {
              _context6.next = 20;
              break;
            }
            _context6.next = 14;
            return _this13._ensureHomeHeatDeviceReady();
          case 14:
            deviceId = _context6.sent;
            if (deviceId) {
              _context6.next = 18;
              break;
            }
            wx.showToast({
              title: "未连接水杯",
              icon: "none"
            });
            return _context6.abrupt("return");
          case 18:
            _context6.next = 20;
            return _this13._sendHomeHeatOffCommand(deviceId);
          case 20:
            _this13._applyHomeHeatStoppedUi();
            _context6.next = 27;
            break;
          case 23:
            _context6.prev = 23;
            _context6.t0 = _context6["catch"](9);
            console.warn("[home heat off fail]", _context6.t0);
            wx.showToast({
              title: _this13._formatHomeHeatError(_context6.t0, "关闭加热失败"),
              icon: "none"
            });
          case 27:
            _context6.prev = 27;
            if (_this13.data.heatResponsePending) {
              _this13.setData({
                heatResponsePending: false
              });
            }
            _this13._heatCommandBusy = false;
            return _context6.finish(27);
          case 31:
            return _context6.abrupt("return");
          case 32:
            return _context6.abrupt("return", _this13.openHeatPanel());
          case 33:
          case "end":
            return _context6.stop();
        }
      }, _callee6, null, [
        [9, 23, 27, 31]
      ]);
    }))();
  },
  _applyHeatPreset: function _applyHeatPreset(picked) {
    var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    if (!picked) return;
    this._stopHeatingTimer();
    this._clearHeatCoolingVisual();
    this._phoneLocationHeatActive = !!options.phoneLocationDisplay;
    this._phoneLocationHeatHoldActive = false;
    this._phoneLocationHeatHoldTemp = null;
    var now = new Date();
    var hours = now.getHours().toString().padStart(2, '0');
    var minutes = now.getMinutes().toString().padStart(2, '0');
    this.setData({
      heaterOn: true,
      heatCooling: false,
      lastUpdateText: "".concat(hours, ":").concat(minutes),
      heatTarget: picked.temp
    });
    this._startHeatLoadingTicker();
    if (options.phoneLocationDisplay) {
      this._startPhoneLocationHeatingDisplay(picked.temp);
    } else if (this.data.virtualConnected) {
      this._startVirtualHeating(picked.temp);
    }
  },
  _isPhoneLocationMode: function _isPhoneLocationMode() {
    try {
      return locationSettings.getPreferredLocationMode() === "phone";
    } catch (error) {
      console.warn("[phone location mode read fail]", error);
      return false;
    }
  },
  _getHomeHeatingStartTemperature: function _getHomeHeatingStartTemperature() {
    var visibleTemp = Number(this.data.temperature);
    if (Number.isFinite(visibleTemp)) return Math.max(0, visibleTemp);
    var payloadTemp = Number(this._homeLatestBlePayload && this._homeLatestBlePayload.temperature);
    if (Number.isFinite(payloadTemp)) return Math.max(0, payloadTemp);
    return 0;
  },
  _normalizeHomeDisplayTemperature: function _normalizeHomeDisplayTemperature(value) {
    var raw = Number(value);
    if (!Number.isFinite(raw)) return 0;
    return Math.round(raw * 100) / 100;
  },
  _buildPhoneLocationHeatIncrements: function _buildPhoneLocationHeatIncrements(delta) {
    var safeDelta = Math.max(0, Number(delta) || 0);
    if (safeDelta <= 0) return [];
    var tickCount = Math.max(1, Math.round(PHONE_LOCATION_HEAT_DEGREE_MS / PHONE_LOCATION_HEAT_TICK_MS * safeDelta));
    var weights = Array.from({
      length: tickCount
    }, function() {
      return 0.6 + Math.random() * 0.8;
    });
    var totalWeight = weights.reduce(function(sum, item) {
      return sum + item;
    }, 0) || 1;
    return weights.map(function(weight) {
      return safeDelta * weight / totalWeight;
    });
  },
  _trySendPhoneLocationHeatCommand: function _trySendPhoneLocationHeatCommand(targetTemp) {
    var _this14 = this;
    if (this.data.virtualConnected) return;
    _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee7() {
      var deviceId;
      return _regeneratorRuntime2().wrap(function _callee7$(_context7) {
        while (1) switch (_context7.prev = _context7.next) {
          case 0:
            _context7.prev = 0;
            _context7.next = 3;
            return _this14._ensureHomeHeatDeviceReady();
          case 3:
            deviceId = _context7.sent;
            if (deviceId) {
              _context7.next = 6;
              break;
            }
            return _context7.abrupt("return");
          case 6:
            _context7.next = 8;
            return ble.writeCommand(deviceId, [0x11, targetTemp]);
          case 8:
            _context7.next = 10;
            return ble.writeHeat(deviceId, true);
          case 10:
            ble.writeCommand(deviceId, [0x12]).catch(function() {});
            _context7.next = 16;
            break;
          case 13:
            _context7.prev = 13;
            _context7.t0 = _context7["catch"](0);
            console.warn("[phone location heat command ignored]", _context7.t0);
          case 16:
          case "end":
            return _context7.stop();
        }
      }, _callee7, null, [
        [0, 13]
      ]);
    }))();
  },
  _trySendPhoneLocationHeatOffCommand: function _trySendPhoneLocationHeatOffCommand() {
    var _this15 = this;
    if (this.data.virtualConnected) return;
    _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee8() {
      var deviceId;
      return _regeneratorRuntime2().wrap(function _callee8$(_context8) {
        while (1) switch (_context8.prev = _context8.next) {
          case 0:
            _context8.prev = 0;
            _context8.next = 3;
            return _this15._ensureHomeHeatDeviceReady();
          case 3:
            deviceId = _context8.sent;
            if (deviceId) {
              _context8.next = 6;
              break;
            }
            return _context8.abrupt("return");
          case 6:
            _context8.next = 8;
            return ble.writeHeat(deviceId, false);
          case 8:
            ble.writeCommand(deviceId, [0x12]).catch(function() {});
            _context8.next = 14;
            break;
          case 11:
            _context8.prev = 11;
            _context8.t0 = _context8["catch"](0);
            console.warn("[phone location heat off ignored]", _context8.t0);
          case 14:
          case "end":
            return _context8.stop();
        }
      }, _callee8, null, [
        [0, 11]
      ]);
    }))();
  },
  _isCupConnected: function _isCupConnected() {
    var _this16 = this;
    return new Promise(function(resolve) {
      if (_this16.data.virtualConnected) return resolve(true);
      if (!wx.getConnectedBluetoothDevices || !ble.SERVICE_UUID) return resolve(false);
      wx.getConnectedBluetoothDevices({
        services: [ble.SERVICE_UUID],
        success: function success(res) {
          return resolve((res.devices || []).length > 0);
        },
        fail: function fail() {
          return resolve(false);
        }
      });
    });
  },
  _startPhoneLocationHeatingDisplay: function _startPhoneLocationHeatingDisplay(targetTemp) {
    var _this17 = this;
    var target = this._normalizeHomeDisplayTemperature(targetTemp);
    if (!Number.isFinite(target) || target <= 0) {
      this._phoneLocationHeatActive = false;
      this._phoneLocationHeatHoldActive = false;
      this._phoneLocationHeatHoldTemp = null;
      return;
    }
    this._stopHeatingTimer();
    this._phoneLocationHeatActive = true;
    this._phoneLocationHeatHoldActive = false;
    this._phoneLocationHeatHoldTemp = null;
    var current = this._normalizeHomeDisplayTemperature(this._getHomeHeatingStartTemperature());
    var patch = {
      heaterOn: true,
      heatCooling: false,
      heatTarget: target
    };
    if (String(this.data.temperature) !== String(current)) {
      patch.temperature = current;
    }
    this.setData(patch);
    if (current >= target) {
      this._finishPhoneLocationHeatingDisplay(current);
      return;
    }
    var startSegment = function startSegment(segmentStart) {
      var segmentEnd = _this17._normalizeHomeDisplayTemperature(Math.min(target, segmentStart + 1));
      var increments = _this17._buildPhoneLocationHeatIncrements(segmentEnd - segmentStart);
      var tickIndex = 0;
      var segmentTotal = 0;
      _this17._heatTimer = setInterval(function() {
        if (!_this17._phoneLocationHeatActive || !_this17.data.heaterOn) {
          _this17._stopHeatingTimer();
          return;
        }
        segmentTotal += increments[tickIndex] || 0;
        tickIndex += 1;
        var isSegmentDone = tickIndex >= increments.length;
        var next = isSegmentDone ? segmentEnd : _this17._normalizeHomeDisplayTemperature(Math.min(segmentEnd, segmentStart + segmentTotal));
        if (next >= target) {
          _this17._finishPhoneLocationHeatingDisplay(target);
          return;
        }
        _this17.setData({
          temperature: next
        });
        if (isSegmentDone) {
          _this17._stopHeatingTimer();
          startSegment(next);
        }
      }, PHONE_LOCATION_HEAT_TICK_MS);
    };
    startSegment(current);
  },
  _finishPhoneLocationHeatingDisplay: function _finishPhoneLocationHeatingDisplay(targetTemp) {
    var target = this._normalizeHomeDisplayTemperature(targetTemp);
    this._stopHeatingTimer();
    this._phoneLocationHeatActive = false;
    this._phoneLocationHeatHoldActive = true;
    this._phoneLocationHeatHoldTemp = target;
    this._stopHeatLoadingTicker();
    var now = new Date();
    var hours = now.getHours().toString().padStart(2, '0');
    var minutes = now.getMinutes().toString().padStart(2, '0');
    this.setData({
      temperature: target,
      heaterOn: false,
      heatCooling: false,
      heatTarget: null,
      lastUpdateText: "".concat(hours, ":").concat(minutes)
    });
  },
  _startVirtualHeating: function _startVirtualHeating(targetTemp) {
    var _this18 = this;
    this._phoneLocationHeatActive = false;
    this._phoneLocationHeatHoldActive = false;
    this._phoneLocationHeatHoldTemp = null;
    this._stopHeatingTimer();
    this._heatTimer = setInterval(function() {
      var current = Number(_this18.data.temperature) || 0;
      if (current >= targetTemp) {
        _this18._stopHeatingTimer();
        _this18._stopHeatLoadingTicker();
        // 閺勫墽銇氶崗铚傜秼閺冨爼妫?
        var now = new Date();
        var hours = now.getHours().toString().padStart(2, '0');
        var minutes = now.getMinutes().toString().padStart(2, '0');
        _this18.setData({
          heaterOn: false,
          heatCooling: true,
          heatTarget: null,
          lastUpdateText: "".concat(hours, ":").concat(minutes)
        });
        _this18._startHeatCoolingVisual();
        return;
      }
      var next = Math.min(targetTemp, current + 1);
      _this18.setData({
        temperature: next
      });
    }, VIRTUAL_HEAT_STEP_INTERVAL_MS);
  },
  _applyHomeHeatStoppedUi: function _applyHomeHeatStoppedUi() {
    this._phoneLocationHeatActive = false;
    this._phoneLocationHeatHoldActive = false;
    this._phoneLocationHeatHoldTemp = null;
    this._stopHeatingTimer();
    this._stopHeatLoadingTicker();
    var now = new Date();
    var hours = now.getHours().toString().padStart(2, '0');
    var minutes = now.getMinutes().toString().padStart(2, '0');
    this.setData({
      heaterOn: false,
      heatCooling: true,
      lastUpdateText: "".concat(hours, ":").concat(minutes),
      heatTarget: null
    });
    this._startHeatCoolingVisual();
  },
  _stopHeatingTimer: function _stopHeatingTimer() {
    if (this._heatTimer) {
      clearInterval(this._heatTimer);
      this._heatTimer = null;
    }
  },
  _startHeatLoadingTicker: function _startHeatLoadingTicker() {
    var _this19 = this;
    if (this._heatTextTimer) return;
    var frames = ["加热中", "加热中.", "加热中..", "加热中..."];
    var frameIndex = 0;
    this.setData({
      heatLoadingText: frames[0]
    });
    this._heatTextTimer = setInterval(function() {
      if (!_this19.data.heaterOn) return;
      frameIndex = (frameIndex + 1) % frames.length;
      _this19.setData({
        heatLoadingText: frames[frameIndex]
      });
    }, 420);
  },
  _stopHeatLoadingTicker: function _stopHeatLoadingTicker() {
    if (this._heatTextTimer) {
      clearInterval(this._heatTextTimer);
      this._heatTextTimer = null;
    }
    this.setData({
      heatLoadingText: "加热中"
    });
  },
  _startHeatCoolingVisual: function _startHeatCoolingVisual() {
    var _this20 = this;
    if (this._heatCoolingTimer) {
      clearTimeout(this._heatCoolingTimer);
      this._heatCoolingTimer = null;
    }
    if (!this.data.heatCooling) {
      this.setData({
        heatCooling: true
      });
    }
    this._heatCoolingTimer = setTimeout(function() {
      _this20._heatCoolingTimer = null;
      if (_this20.data.heaterOn || !_this20.data.heatCooling) return;
      _this20.setData({
        heatCooling: false
      });
    }, HEAT_COOLING_VISUAL_MS);
  },
  _clearHeatCoolingVisual: function _clearHeatCoolingVisual() {
    if (this._heatCoolingTimer) {
      clearTimeout(this._heatCoolingTimer);
      this._heatCoolingTimer = null;
    }
    if (this.data.heatCooling) {
      this.setData({
        heatCooling: false
      });
    }
  },
  _readLegacyHomeCheckinStore: function _readLegacyHomeCheckinStore() {
    return checkinOps.safeReadStore({
      key: CHECKIN_STORAGE_KEY,
      sanitize: normalizeCheckinStore,
      onReadError: function onReadError(error) {
        console.error("[legacy home checkin read failed]", error);
      }
    });
  },
  _loadHomeCheckinStore: function _loadHomeCheckinStore() {
    var _arguments = arguments,
      _this21 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee9() {
      var options, legacy;
      return _regeneratorRuntime2().wrap(function _callee9$(_context9) {
        while (1) switch (_context9.prev = _context9.next) {
          case 0:
            options = _arguments.length > 0 && _arguments[0] !== undefined ? _arguments[0] : {};
            legacy = _this21._readLegacyHomeCheckinStore();
            return _context9.abrupt("return", drinkData.getStore({
              historyDays: CHECKIN_HISTORY_KEEP_DAYS,
              legacyStore: options.skipLegacy ? null : legacy
            }));
          case 3:
          case "end":
            return _context9.stop();
        }
      }, _callee9);
    }))();
  },
  _saveHomeCheckinStore: function _saveHomeCheckinStore() {
    return true;
  },
  saveGoal: function saveGoal() {
    var _this22 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee10() {
      var parsed;
      return _regeneratorRuntime2().wrap(function _callee10$(_context10) {
        while (1) switch (_context10.prev = _context10.next) {
          case 0:
            parsed = Number(_this22.data.goalInput);
            if (Number.isFinite(parsed)) {
              _context10.next = 4;
              break;
            }
            wx.showToast({
              title: "\u8BF7\u8F93\u5165 ".concat(CHECKIN_MIN_GOAL_ML, "-").concat(CHECKIN_MAX_GOAL_ML, " \u7684\u76EE\u6807\u503C"),
              icon: "none"
            });
            return _context10.abrupt("return");
          case 4:
            if (!(parsed < CHECKIN_MIN_GOAL_ML || parsed > CHECKIN_MAX_GOAL_ML)) {
              _context10.next = 7;
              break;
            }
            wx.showToast({
              title: "\u76EE\u6807\u8303\u56F4 ".concat(CHECKIN_MIN_GOAL_ML, "-").concat(CHECKIN_MAX_GOAL_ML, "ml"),
              icon: "none"
            });
            return _context10.abrupt("return");
          case 7:
            _context10.prev = 7;
            _context10.next = 10;
            return drinkData.setGoal(Math.round(parsed), {
              historyDays: CHECKIN_HISTORY_KEEP_DAYS
            });
          case 10:
            _this22.setData({
              showGoalEditor: false
            });
            _context10.next = 13;
            return _this22._refreshHomeTodayTotal({
              immediate: true,
              skipLegacy: true
            });
          case 13:
            wx.showToast({
              title: "目标已更新",
              icon: "none"
            });
            _context10.next = 20;
            break;
          case 16:
            _context10.prev = 16;
            _context10.t0 = _context10["catch"](7);
            console.error("[home drink goal failed]", _context10.t0);
            wx.showToast({
              title: "目标保存失败",
              icon: "none"
            });
          case 20:
          case "end":
            return _context10.stop();
        }
      }, _callee10, null, [
        [7, 16]
      ]);
    }))();
  },
  _refreshHomeTodayTotal: function _refreshHomeTodayTotal() {
    var _arguments2 = arguments,
      _this23 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee11() {
      var options, seq, store, todayKey, todayList, homeTodayTotalMl, dailyGoalMl, remainingMl, progressPercent, streakDays, latestRecord, latestCheckinText;
      return _regeneratorRuntime2().wrap(function _callee11$(_context11) {
        while (1) switch (_context11.prev = _context11.next) {
          case 0:
            options = _arguments2.length > 0 && _arguments2[0] !== undefined ? _arguments2[0] : {};
            seq = Number(_this23._homeCheckinLoadSeq || 0) + 1;
            _this23._homeCheckinLoadSeq = seq;
            _context11.prev = 3;
            _context11.next = 6;
            return _this23._loadHomeCheckinStore({
              skipLegacy: !!options.skipLegacy
            });
          case 6:
            store = _context11.sent;
            _context11.next = 14;
            break;
          case 9:
            _context11.prev = 9;
            _context11.t0 = _context11["catch"](3);
            console.error("[home drink data load failed]", _context11.t0);
            if (seq === _this23._homeCheckinLoadSeq && !cloudFailToastShown) {
              cloudFailToastShown = true;
              wx.showToast({
                title: "云端饮水数据加载失败",
                icon: "none"
              });
            }
            return _context11.abrupt("return");
          case 14:
            if (!(seq !== _this23._homeCheckinLoadSeq)) {
              _context11.next = 16;
              break;
            }
            return _context11.abrupt("return");
          case 16:
            cloudFailToastShown = false;
            todayKey = toDateKey(new Date());
            todayList = Array.isArray(store.recordsByDate[todayKey]) ? store.recordsByDate[todayKey] : [];
            homeTodayTotalMl = sumCheckinAmounts(todayList);
            dailyGoalMl = Number(store.dailyGoalMl) || CHECKIN_DEFAULT_GOAL_ML;
            remainingMl = Math.max(dailyGoalMl - homeTodayTotalMl, 0);
            progressPercent = dailyGoalMl > 0 ? clamp(Math.round(homeTodayTotalMl * 100 / dailyGoalMl), 0, 100) : 0;
            streakDays = calculateHomeCheckinStreak(store.recordsByDate, dailyGoalMl, todayKey);
            latestRecord = todayList.length ? todayList[todayList.length - 1] : null;
            latestCheckinText = latestRecord ? "\u6700\u8FD1\uFF1A".concat(formatHomeCheckinTime(latestRecord.ts), " +").concat(latestRecord.amount, "ml") : "今日还未打卡";
            _this23.setData({
              todayLabel: formatHomeCheckinDate(todayKey),
              dailyGoalMl: dailyGoalMl,
              remainingMl: remainingMl,
              progressPercent: progressPercent,
              recordCountToday: todayList.length,
              streakDays: streakDays,
              latestCheckinText: latestCheckinText,
              progressBarStyle: "width:".concat(progressPercent, "%;")
            });
            petStore.setDrinkPercent(progressPercent);
            _this23._animateHomeTodayTotal(homeTodayTotalMl, {
              immediate: !!options.immediate
            });
          case 27:
          case "end":
            return _context11.stop();
        }
      }, _callee11, null, [
        [3, 9]
      ]);
    }))();
  },
  _addHomeCheckinRecord: function _addHomeCheckinRecord(amountValue) {
    var _arguments3 = arguments,
      _this24 = this;
    return _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee12() {
      var options, silent, rawAmount, amount, result, store, dailyGoalMl;
      return _regeneratorRuntime2().wrap(function _callee12$(_context12) {
        while (1) switch (_context12.prev = _context12.next) {
          case 0:
            options = _arguments3.length > 1 && _arguments3[1] !== undefined ? _arguments3[1] : {};
            silent = !!options.silent;
            rawAmount = Math.round(Number(amountValue));
            if (!(!Number.isFinite(rawAmount) || rawAmount <= 0)) {
              _context12.next = 6;
              break;
            }
            if (!silent) wx.showToast({
              title: "请输入有效饮水量",
              icon: "none"
            });
            return _context12.abrupt("return");
          case 6:
            if (!(rawAmount > CHECKIN_MAX_SINGLE_AMOUNT_ML)) {
              _context12.next = 9;
              break;
            }
            if (!silent) wx.showToast({
              title: "\u5355\u6B21\u6700\u591A ".concat(CHECKIN_MAX_SINGLE_AMOUNT_ML, "ml"),
              icon: "none"
            });
            return _context12.abrupt("return");
          case 9:
            amount = normalizeCheckinAmount(rawAmount);
            _context12.prev = 10;
            _context12.next = 13;
            return drinkData.addRecord(amount, {
              historyDays: CHECKIN_HISTORY_KEEP_DAYS,
              source: options.source || (silent ? "auto" : "manual")
            });
          case 13:
            result = _context12.sent;
            waterReminder.setLastWaterTime(Date.now());
            store = result.store;
            dailyGoalMl = Number(store.dailyGoalMl) || CHECKIN_DEFAULT_GOAL_ML;
            if (!silent) _this24.setData({
              homeCustomAmountInput: ""
            });
            _context12.next = 20;
            return _this24._refreshHomeTodayTotal({
              skipLegacy: true
            });
          case 20:
            if (silent) {
              _context12.next = 25;
              break;
            }
            if (!(result.beforeTotal < dailyGoalMl && result.afterTotal >= dailyGoalMl)) {
              _context12.next = 24;
              break;
            }
            wx.showToast({
              title: "今日饮水目标已完成",
              icon: "none"
            });
            return _context12.abrupt("return");
          case 24:
            wx.showToast({
              title: "\u5DF2\u8BB0\u5F55 +".concat(amount, "ml"),
              icon: "none"
            });
          case 25:
            _context12.next = 31;
            break;
          case 27:
            _context12.prev = 27;
            _context12.t0 = _context12["catch"](10);
            console.error("[home drink data add failed]", _context12.t0);
            if (!silent) wx.showToast({
              title: "饮水记录保存失败",
              icon: "none"
            });
          case 31:
          case "end":
            return _context12.stop();
        }
      }, _callee12, null, [
        [10, 27]
      ]);
    }))();
  }
});