/* ============================================================
 * petStore.js —— 全局"宠物"状态机（大脑）
 *
 * 表情不归任何页面所有：页面与业务只 report 事件，这里按优先级
 * 裁决出当前表情/巡演，由各页面的 <pet-ball> 组件订阅渲染。
 * 同一时刻只有可见页面的实例在跑 RAF（页面通过 setPageVisible 上报）。
 *
 * 优先级（高 → 低）：
 *   1. 功能总闸关闭            → 不输出任何表情
 *   2. 一次性反应 hold（撒花/失落/惊讶…，带保持时长）
 *   3. 进行中的任务（扫描/思考/握手/聆听/检测）
 *   4. 时段规则（23:00–6:30 入睡 00，清晨唤醒 01）
 *   5. 环境心情（按今日饮水进度的待机巡演）
 * ============================================================ */

var ENABLE_KEY = "smartcup_pet_enabled_v1";

/* 表情 ID（utils/emotion/emotions.js 契约） */
var EMO = {
  sleep: "00", wake: "01", idle: "02", curious: "03", daze: "04",
  happy: "10", confused: "11", lost: "12", surprised: "13", shy: "14",
  focus: "16", satisfied: "19", thinking: "30", recvTask: "31",
  busy: "32", done: "33", error: "34", awaitInput: "35", netLoad: "36",
  restricted: "38", search: "40"
};

var TOURS = {
  scan: ["40", "16", "40", "36"],
  think: ["30", "40", "36", "32"],
  connected: ["19", "10", "02"],
  ambientLow: ["03", "04", "02", "35"],
  ambientMid: ["02", "19", "03", "10"],
  ambientDone: ["10", "19", "14"],
  /* 首页 ambient 不含"看向按钮"——那些由页面按 15-30 秒随机调度（flash） */
  ambientIndex: ["02", "19", "03", "10", "04"]
};
var AMBIENT_MS = 5000;
var TASK_TOUR_MS = 2800;

/* 一次性反应的保持时长 */
var HOLD_CONNECTED_MS = 2600;   /* 33 撒花 */
var HOLD_LOST_MS = 2600;        /* 12 失落 */
var HOLD_FAIL_MS = 2400;        /* 13 惊讶 */
var HOLD_CLOSED_MS = 4200;      /* 00 手动断开入睡 */
var HOLD_WAKE_MS = 4200;        /* 01 清晨唤醒 */
var HOLD_TAP_MS = 3200;         /* 摸头反应 */

/* 时段规则：深夜入睡窗口 */
var QUIET_START_HOUR = 23;
var QUIET_END_HOUR = 6;
var QUIET_END_MINUTE = 30;

/* 各表情的配对文案（文字与表情永远说同一件事） */
var CAPTIONS = {};
CAPTIONS[EMO.sleep] = [
"晚安，明天见", "zzz…我在休息", "夜里少刷手机，多喝水",
"我睡了，杯子帮你看着", "做个好梦，明天见", "呼…呼…（睡熟了）",
"月亮上班，我下班", "梦里也在提醒你喝水", "睡饱才有力气监督你"
];
CAPTIONS[EMO.wake] = [
"早上好！先喝杯温水吧", "新的一天，从喝水开始", "起床啦，肠胃等着开工呢",
"晨起一杯水，胜过闹钟响", "早安，今天也一起加油", "睁眼第一件事，看你喝水没",
"伸个懒腰，接杯温水", "早起的鸟儿有水喝", "昨晚睡得好吗？", "今天想喝多少，我来记"
];
CAPTIONS[EMO.idle] = [
"在呢，想聊点什么？", "今天喝水顺利吗？", "我盯着杯子呢，你放心",
"无事发生，就是有点想你", "看看今日饮水报告？", "放空中…但手机没静音",
"无聊的时候，喝口水吧", "杯子已就位，等你来喝", "闲着也是闲着，测个水质？"
];
CAPTIONS[EMO.curious] = [
"你今天忙不忙呀？", "最近睡得怎么样？", "说说你的近况？",
"我猜你还没喝水，对吧？", "今天有什么新鲜事？", "让我猜猜，又在久坐？",
"你今天笑了几次？", "好奇你现在的表情", "最近运动了吗？"
];
CAPTIONS[EMO.daze] = [
"我在发呆等你来～", "测测今天的水质？", "发呆也是一种休息",
"你不在，我有点无聊", "发呆中…想到你该喝水了", "盯着水滴发会儿呆",
"一动不动，是在省电", "发呆完毕，继续监督你", "放空五分钟，喝水一分钟"
];
CAPTIONS[EMO.happy] = [
"今日目标达成，太棒了！", "看到你我就开心～", "保持喝水好习惯哦",
"为你鼓掌，啪啪啪", "这波操作，满分！", "开心到撒花！",
"今天也是元气满满", "耶！又进步了一点", "好心情和好水份更配"
];
CAPTIONS[EMO.confused] = ["在想一个问题…", "嗯…让我捋一捋", "这个问题有点意思", "等等，我迷糊了", "你在想什么，我也在想"];
CAPTIONS[EMO.lost] = ["蓝牙断了，我马上试试重连", "杯子走丢了，我去找它", "别慌，我来处理连接", "呜…信号跑哪去了", "我会把它找回来的"];
CAPTIONS[EMO.surprised] = ["咦，你来了！", "连接出了点小状况", "诶？刚才发生了什么", "哇，吓我一跳", "有情况！"];
CAPTIONS[EMO.shy] = ["被你发现了，在偷偷休息～", "哎呀，别一直戳我啦", "人家会不好意思的", "再戳脸要红了", "嘿嘿，被夸了会脸红"];
CAPTIONS[EMO.focus] = ["我在听，请说～", "正在专注处理", "别急，我认真着呢", "耳朵已就位", "专注模式，请讲", "认真工作中，勿扰", "你说，我记着"];
CAPTIONS[EMO.satisfied] = [
"今天喝水进度不错哦", "这个节奏刚刚好", "稳住了，继续保持",
"按这个喝法，很健康", "进度喜人，我满意", "看到进度条就安心", "继续保持，我在记录"
];
CAPTIONS[EMO.thinking] = ["让我想一想…", "灵感加载中…", "这个问题值得好好想", "脑细胞运转中…", "大脑线程全开", "想清楚了再回答你", "知识库里翻一翻"];
CAPTIONS[EMO.recvTask] = ["收到！这就去办～", "交给我吧", "任务已接收", "小事一桩", "安排上了"];
CAPTIONS[EMO.busy] = ["快好了，再等我一下…", "忙着手头的事…", "最后一点，马上完成", "处理中，请稍候", "十根手指都在忙"];
CAPTIONS[EMO.done] = ["搞定！", "完成啦，来看看吧", "交付！", "办妥了，请验收", "干净利落"];
CAPTIONS[EMO.error] = ["网络好像开小差了，稍后再试试？", "哎呀，这次没成功", "出了点小故障，我很难过", "抱歉，路上摔了一跤", "再来一次，我相信能行"];
CAPTIONS[EMO.awaitInput] = ["输入框在等你～", "有什么想问的？", "我在等你开口", "问吧，啥都知道（大概）", "光标闪了八百次了", "打字吧，我看着呢"];
CAPTIONS[EMO.netLoad] = ["正在联网查资料…", "网络冲浪中…", "数据在路上", "信号跑得有点慢", "服务器，快回话"];
CAPTIONS[EMO.restricted] = ["蓝牙被关掉了，打开我才能工作", "没有蓝牙我寸步难行", "去设置里开下蓝牙吧", "我被限制了，帮个忙", "巧妇难为无米之炊，开下蓝牙"];
CAPTIONS[EMO.search] = ["正在附近找你的水杯…", "杯子藏哪儿了？我找找", "扫描雷达已开启", "翻箱倒柜查资料中", "一个角落都不放过", "检索中，马上就好"];
CAPTIONS["50"] = ["那边能连上你的水杯", "设备页，水杯的身份证在这", "去那边看看你的杯子", "连接的事，找它准没错", "杯子的一生，从这里开始", "设备页是水杯的家", "蓝牙的开关在那边", "先连接，才有然后"];
CAPTIONS["51"] = ["找不到杯子？我能带路", "定位页，杯子跑不掉的", "杯子在哪，一查便知", "它要是会跑，我第一个追", "丢三落四星人的救星", "地图上找找它", "它不会自己走远的", "定位页了解一下"];
CAPTIONS["52"] = ["有事儿问我，我懂水", "智聊，除了烧水啥都聊", "那边可以找我唠嗑", "我的知识都泡在水里", "问它个问题，考考它", "水知识十级选手在线", "聊天气，聊水温都行", "我话痨，但它爱我"];
CAPTIONS["53"] = ["那边能变出热水", "加热：冬天的好朋友", "点它，温暖马上到", "凉水与热水，一指之隔", "它负责热，你负责喝", "冬天靠它续命", "热水自由，一步之遥", "喝温的，对胃好"];

/* 定位页专属：水杯离线时伙伴打盹的文案（与深夜入睡共用 00 表情，靠场景文案区分） */
var CUP_OFF_LINES = [
  "杯子还没上线，我先眯一会儿", "离线中…它大概在睡懒觉",
  "找不到杯子，我先打个盹", "上线了叫我，我秒醒",
  "杯子玩失踪，我守着这儿"
];

var subs = {};
var subSeq = 0;
var minuteTimer = 0;
var holdTimer = 0;
var lastQuietState = null;

var state = {
  enabled: true,
  /* 可见页面集合：只有非空时才有实例渲染 */
  visibleKeys: {},
  /* 谢幕淡出：旧球开始淡出的时间戳（页面导航前的过渡窗口） */
  exitAt: 0,
  /* 任务：{ kind, until } */
  task: null,
  /* 连接事件：none | connecting | connected | lost | fail | closed | restricted */
  connect: "none",
  /* 一次性反应 hold：{ emotion, until } */
  hold: null,
  /* 今日饮水进度 0-100 */
  drinkPercent: 0,
  /* 清晨唤醒只在跨出安静时段时播一次 */
  wakePending: false
};

function now() { return Date.now(); }

function readEnabled() {
  try {
    var v = wx.getStorageSync(ENABLE_KEY);
    if (v === "" || v === null || v === undefined) return true; /* 默认开 */
    return !!v;
  } catch (e) {
    return true;
  }
}

function isQuietHour(d) {
  var h = d.getHours(), m = d.getMinutes();
  if (QUIET_START_HOUR <= 24 && h >= QUIET_START_HOUR) return true;
  if (h < QUIET_END_HOUR) return true;
  if (h === QUIET_END_HOUR && m < QUIET_END_MINUTE) return true;
  return false;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/* 摸头反应（点击小球触发）加权概率：
 * 70% 触发 33 任务完成（自旋甩彩带 + 撒花庆祝），
 * 害羞压到最低档，其余由开心 / 惊讶分摊 */
var PET_TAP_WEIGHTS = [
  [EMO.done, 0.7],
  [EMO.happy, 0.15],
  [EMO.surprised, 0.1],
  [EMO.shy, 0.05]
];

function pickWeighted(pairs) {
  var r = Math.random();
  var acc = 0;
  for (var i = 0; i < pairs.length; i++) {
    acc += pairs[i][1];
    if (r < acc) return pairs[i][0];
  }
  return pairs[pairs.length - 1][0];
}

function exitActive() {
  return state.exitAt > 0 && now() - state.exitAt < 300;
}

function ambientTour(pageKey) {
  if (pageKey === "index") return TOURS.ambientIndex;
  var p = state.drinkPercent;
  if (p >= 100) return TOURS.ambientDone;
  if (p >= 40) return TOURS.ambientMid;
  return TOURS.ambientLow;
}

function ambientLine() {
  var p = state.drinkPercent;
  if (p >= 100) {
    return pick([
      "今日目标达成，太棒了！",
      "喝水任务圆满完成～",
      "目标达成，满分的一天",
      "今天的水分很到位",
      "喝够水的你闪闪发光",
      "达标的感觉，干了这杯…不用了，已经够了",
      "这是今天第 N 杯，最后一杯～",
      "水份管理大师，就是你"
    ]);
  }
  if (p >= 40) {
    return pick(CAPTIONS[EMO.satisfied].concat([
      "过半了，保持这个节奏",
      "喝得不错，别停下来",
      "身体在悄悄说谢谢",
      "进度条看着很舒服",
      "照这个喝法，皮肤都会谢谢你",
      "继续，离目标就差一步",
      "中场休息，补杯水"
    ]));
  }
  return pick([
    "才喝了一点，记得多喝水哦",
    "今天喝水顺利吗？",
    "要不要来一杯？",
    "杯子空着，它有点寂寞",
    "先喝一口，回来继续忙",
    "水不会自己进肚子～",
    "我数着呢，你还没喝几口",
    "忙归忙，水要喝",
    "给杯子个表现的机会",
    "起身倒杯水，顺便伸个懒腰",
    "别等渴了才想起来我"
  ]);
}

/* 裁决：返回 null（总闸关）或 { emotion, tour, tourMs, caption, exit } */
function resolve(pageKey) {
  if (!state.enabled) return null;
  var t = now();

  /* 谢幕淡出：所有实例优先响应（球以像素 alpha 随页面模块淡出） */
  if (exitActive()) {
    return { exit: true };
  }

  /* 2. 一次性反应 hold（caption 可由事件层覆盖，默认取表情配对文案） */
  if (state.hold && t < state.hold.until) {
    return { emotion: state.hold.emotion, caption: state.hold.caption || pick(CAPTIONS[state.hold.emotion] || ["…"]) };
  }

  /* 3. 进行中的任务 */
  if (state.task && t < state.task.until) {
    var kind = state.task.kind;
    if (kind === "scan" || kind === "test") return { tour: TOURS.scan, tourMs: TASK_TOUR_MS };
    if (kind === "think") return { tour: TOURS.think, tourMs: TASK_TOUR_MS };
    if (kind === "handshake") return { emotion: EMO.awaitInput, caption: pick(CAPTIONS[EMO.awaitInput]) };
    if (kind === "listen") return { emotion: EMO.focus, caption: pick(CAPTIONS[EMO.focus]) };
    /* 定位页：已连接但还没拿到定位 → 联网加载 36 */
    if (kind === "locate") return { emotion: EMO.netLoad, caption: pick(CAPTIONS[EMO.netLoad]) };
    /* 定位页：水杯离线 → 打盹 00（场景文案，避免深夜入睡文案串味） */
    if (kind === "cupOff") return { emotion: EMO.sleep, caption: pick(CUP_OFF_LINES) };
  }

  /* 4. 时段规则 */
  var quiet = isQuietHour(new Date(t));
  if (quiet) return { emotion: EMO.sleep, caption: pick(CAPTIONS[EMO.sleep]) };

  /* 5. 环境心情（含连接稳态；首页用带"看向按钮"的专属巡演） */
  if (state.connect === "connected") {
    return { tour: TOURS.connected, tourMs: AMBIENT_MS, ambient: true, caption: ambientLine() };
  }
  return { tour: ambientTour(pageKey), tourMs: AMBIENT_MS, ambient: true, caption: ambientLine() };
}

function notify() {
  Object.keys(subs).forEach(function(id) {
    var sub = subs[id];
    try { sub.fn(resolve(sub.pageKey)); } catch (e) { console.error("[petStore] subscriber error", e); }
  });
}

function ensureMinuteTimer() {
  if (minuteTimer || !hasSubscribers()) return;
  minuteTimer = setInterval(function() {
    var quiet = isQuietHour(new Date());
    if (lastQuietState === true && !quiet) {
      /* 跨出安静时段：清晨唤醒一次 */
      setHold(EMO.wake, HOLD_WAKE_MS);
      state.wakePending = false;
    }
    lastQuietState = quiet;
    notify();
  }, 60000);
}

function hasSubscribers() {
  return Object.keys(subs).length > 0;
}

function setHold(emotion, ms, caption) {
  state.hold = { emotion: emotion, until: now() + ms, caption: caption || "" };
  /* hold 到期后自动回落到常规裁决（否则球会停在表情上直到下次外部事件） */
  if (holdTimer) clearTimeout(holdTimer);
  holdTimer = setTimeout(function() {
    holdTimer = 0;
    if (state.hold && now() >= state.hold.until) {
      state.hold = null;
      notify();
    }
  }, ms + 40);
}

/* ---------------- 对外 API ---------------- */

module.exports = {
  isEnabled: function() { return state.enabled; },

  setEnabled: function(v) {
    var next = !!v;
    try { wx.setStorageSync(ENABLE_KEY, next); } catch (e) {}
    var changed = next !== state.enabled;
    state.enabled = next;
    if (changed) {
      if (!next) { state.task = null; state.hold = null; }
      notify();
    }
  },

  /* 页面可见性：key 用页面路由；onShow/onHide 各报一次 */
  setPageVisible: function(key, visible) {
    if (visible) {
      state.visibleKeys[key] = true;
    } else {
      delete state.visibleKeys[key];
    }
    /* 可见性变化本身要驱动订阅者：显示页恢复渲染，隐藏页停机。
     * 不通知的话返回的页面球不会恢复渲染（真机空档）。 */
    notify();
  },

  /* 谢幕淡出：页面在导航前调用，球以像素 alpha 同步淡出（fx-out 同款节奏） */
  beginExit: function() {
    state.exitAt = now();
    notify();
  },

  isPageVisible: function(key) {
    if (!key) return Object.keys(state.visibleKeys).length > 0;
    return !!state.visibleKeys[key];
  },

  /* 当前是否处于深夜安静时段（23:00-6:30），页面调度可选避让 */
  isQuietNow: function() {
    return isQuietHour(new Date());
  },

  /* 今日饮水进度 0-100（首页/打卡上报） */
  setDrinkPercent: function(p) {
    var v = Math.max(0, Math.min(100, Math.round(Number(p) || 0)));
    if (v === state.drinkPercent) return;
    state.drinkPercent = v;
    notify();
  },

  /* 任务事件：kind = scan | think | handshake | listen | test | locate | cupOff */
  taskStart: function(kind, ms) {
    if (!state.enabled) return;
    state.task = { kind: kind, until: now() + (ms || 30000) };
    state.hold = null;
    notify();
  },

  taskDone: function() {
    var had = !!state.task;
    state.task = null;
    if (had) notify();
  },

  /* 连接事件：ev = connected | lost | fail | closed | restricted */
  connectEvent: function(ev) {
    if (!state.enabled) return;
    state.connect = ev === "connected" ? "connected" : ev;
    if (ev === "connected") setHold(EMO.done, HOLD_CONNECTED_MS);
    else if (ev === "lost") setHold(EMO.lost, HOLD_LOST_MS);
    else if (ev === "fail") setHold(EMO.surprised, HOLD_FAIL_MS);
    else if (ev === "closed") setHold(EMO.sleep, HOLD_CLOSED_MS);
    else if (ev === "restricted") setHold(EMO.restricted, 30000);
    /* 握手态由 taskStart("handshake") 表达 */
    notify();
  },

  /* 摸头/互动：加权随机亲昵反应（60% 彩带自旋庆祝，害羞低概率） */
  pet: function() {
    if (!state.enabled) return;
    setHold(pickWeighted(PET_TAP_WEIGHTS), HOLD_TAP_MS);
    notify();
  },

  /* 通用一次性反应（如聊天回复完成/出错；caption 可覆盖默认配对文案） */
  flash: function(emotionId, ms, caption) {
    if (!state.enabled) return;
    setHold(emotionId, ms || 2400, caption);
    notify();
  },

  /* 静默同步连接真值（不带一次性反应），用于页面 onShow 时校正大脑状态 */
  setConnectState: function(s) {
    if (state.connect === s) return;
    state.connect = s;
    notify();
  },

  /* 订阅渲染指令：fn(payload)；payload 为 null 表示功能关闭。
   * pageKey 用于页面级 ambient 定制（如首页的"看向按钮"巡演） */
  subscribe: function(fn, pageKey) {
    var id = ++subSeq;
    subs[id] = { fn: fn, pageKey: pageKey || "" };
    fn(resolve(pageKey || ""));
    ensureMinuteTimer();
    return id;
  },

  unsubscribe: function(id) {
    delete subs[id];
    if (!hasSubscribers() && minuteTimer) {
      clearInterval(minuteTimer);
      minuteTimer = 0;
    }
  },

  /* 文案查询：给页面侧需要单独展示文字的场景用 */
  captionFor: function(emotionId) {
    if (!state.enabled) return "";
    if (emotionId === EMO.satisfied || emotionId === EMO.idle || emotionId === EMO.happy) {
      /* 环境态的文案跟随饮水进度 */
      var ambient = resolve("");
      if (ambient && ambient.ambient) return ambient.caption || pick(CAPTIONS[emotionId] || ["…"]);
    }
    return pick(CAPTIONS[emotionId] || ["…"]);
  },

  EMO: EMO
};
