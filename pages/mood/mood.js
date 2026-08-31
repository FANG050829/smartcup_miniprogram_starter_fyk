/* 引擎加载容错：真机上引擎链若崩溃，页面降级为"无舞台/无球阵"，
 * 绝不拖垮整个页面 JS（页面白屏比缺功能严重得多）。
 * 加载失败必须上报（实时日志+本地缓冲），否则体验版无从排查 */
var bootLog = require("../../utils/bootLog");
var emotionEngine = null;
try {
  emotionEngine = require("../../utils/emotion/engine.js");
} catch (err) {
  bootLog.reportError("mood:引擎require失败", err);
  console.error("[mood] 表情引擎加载失败，页面降级", err);
}
/* mood-mates 双角色引擎（云宝云朵 / 亮亮星星），加载失败只降级这两个形态 */
var matesEngine = null;
try {
  matesEngine = require("../../utils/mates/engine.js");
} catch (err) {
  bootLog.reportError("mood:mates引擎require失败", err);
  console.error("[mood] mates 引擎加载失败，页面降级", err);
}

var GROUP_LABELS = {
  life: "生命周期",
  emotion: "情绪反应",
  agent: "代理工作状态"
};

var GROUP_TABS = [{ key: "all", name: "全部" }, { key: "life", name: "生命周期" }, { key: "emotion", name: "情绪" }, { key: "agent", name: "状态" }];

/* 角色阵容：ball 走 emotion-ball 引擎；nimbo / twinkle 走 mood-mates 引擎 */
var CHARACTER_TABS = [
  { key: "ball", name: "球球", hint: "自旋 · 撒花 · 放一会儿它会睡着" },
  { key: "nimbo", name: "云宝", hint: "点它吹云泡 · 连点换扇区 · 会睡着" },
  { key: "twinkle", name: "亮亮", hint: "点它星星爆闪 · 放一会儿它会睡着" }
];

/* mates 舞台 / 快照的画布映射（viewBox 240）：
 * 舞台 margin 1.42 + yBias 12 —— 环绕粒子 / 云泡留画布余量，角色略下移
 * 给上飘的云泡让出头部空间；快照 margin 1.12 让墙格占比与球体一致 */
var STAGE_VIEW = {
  nimbo: { margin: 1.42, yBias: 12 },
  twinkle: { margin: 1.42, yBias: 12 }
};
var SNAP_VIEW = {
  nimbo: { margin: 1.12, yBias: 0 },
  twinkle: { margin: 1.12, yBias: 0 }
};

/* 阵列静态预览：按各表情特征映射五官（舞台为实时引擎渲染，仅球体用） */
var MOOD_PREVIEW = {
  "00": { eye: "e-line", mouth: "m-flat", zzz: true },
  "01": { eye: "e-half", mouth: "m-o" },
  "02": { eye: "e-dot", mouth: "m-flat" },
  "03": { eye: "e-dot", eyeR: "e-big", mouth: "m-o" },
  "04": { eye: "e-half", mouth: "m-wave" },
  "05": { eye: "e-dot", mouth: "m-flat" },
  "06": { eye: "e-half", mouth: "m-flat" },
  "07": { eye: "e-wide", mouth: "m-o" },
  "10": { eye: "e-arc", mouth: "m-smile", blush: true },
  "11": { eye: "e-small", eyeR: "e-dot", mouth: "m-wave" },
  "12": { eye: "e-down", mouth: "m-frown" },
  "13": { eye: "e-big", mouth: "m-o" },
  "14": { eye: "e-arc", mouth: "m-smile", blush: true },
  "15": { eye: "e-lid", mouth: "m-flat" },
  "16": { eye: "e-narrow", mouth: "m-flat" },
  "17": { eye: "e-big", mouth: "m-wave", sweat: true },
  "18": { eye: "e-up", mouth: "m-flat" },
  "19": { eye: "e-arc", mouth: "m-smile" },
  "20": { eye: "e-big", eyeR: "e-small", mouth: "m-wave" },
  "21": { eye: "e-angry", mouth: "m-grit", anger: true },
  "30": { eye: "e-up", mouth: "m-flat" },
  "31": { eye: "e-dot", mouth: "m-smile" },
  "32": { eye: "e-narrow", mouth: "m-flat" },
  "33": { eye: "e-arc", mouth: "m-open" },
  "34": { eye: "e-wide", mouth: "m-wave" },
  "35": { eye: "e-dot", mouth: "m-o" },
  "36": { eye: "e-dot", mouth: "m-flat" },
  "37": { eye: "e-up", mouth: "m-o" },
  "38": { eye: "e-down", mouth: "m-flat" },
  "39": { eye: "e-narrow", mouth: "m-smile" },
  "40": { eye: "e-dot", mouth: "m-flat" },
  "41": { eye: "e-line", mouth: "m-flat" }
};

Page({
  data: {
    chars: CHARACTER_TABS,
    charKey: "ball",
    groups: GROUP_TABS,
    activeGroup: "all",
    filtered: [],
    stage: null,
    touring: false,
    aboutCollapsed: false,
    actionsHint: CHARACTER_TABS[0].hint,
    enter: false,
    settled: false,
    replay: false,
    wallSwap: false,
    stageAlt: ""
  },
  _engine: null,
  _engineKind: "ball",
  _stageCanvas: null,
  _stageCtx: null,
  _lastTapAt: 0,
  _entered: false,
  _enterTimers: [],
  _engineTimers: [],
  _stageSeen: false,
  _snapGen: 0,
  _snapCache: {},

  _clearEnterTimers: function _clearEnterTimers() {
    (this._enterTimers || []).forEach(function(t) { clearTimeout(t); });
    this._enterTimers = [];
  },
  _clearEngineTimers: function _clearEngineTimers() {
    (this._engineTimers || []).forEach(function(t) { clearTimeout(t); });
    this._engineTimers = [];
  },

  /* ---------- 墙格数据 ---------- */

  _buildBallItems: function _buildBallItems() {
    if (!emotionEngine) return [];
    var cache = this._snapCache.ball || {};
    var self = this;
    var defs = emotionEngine.config.list() || [];
    return defs.map(function(d) {
      var raw = d.raw || {};
      var pv = MOOD_PREVIEW[d.id] || {};
      return {
        id: d.id,
        name: d.name,
        group: d.group,
        groupLabel: GROUP_LABELS[d.group] || "",
        color: raw.body && raw.body.color || "#FFFFFF",
        eye: pv.eye || "e-dot",
        eyeR: pv.eyeR || "",
        mouth: pv.mouth || "m-flat",
        blush: !!pv.blush,
        anger: !!pv.anger,
        zzz: !!pv.zzz,
        sweat: !!pv.sweat,
        snap: cache[d.id] || ""
      };
    }).filter(function(m) {
      /* 引擎加载失败降级时兜底：无效条目直接丢弃 */
      return !!m.id;
    });
  },

  _buildMateItems: function _buildMateItems(charKey) {
    if (!matesEngine) return [];
    var ch = matesEngine.characters.get(charKey);
    if (!ch) return [];
    var cache = this._snapCache[charKey] || {};
    var baseColor = (ch.palette.states && ch.palette.states.base) || ch.palette.body || "#E8EEF8";
    var defs = matesEngine.config.list() || [];
    return defs.map(function(d) {
      return {
        id: d.id,
        name: d.name,
        group: d.group,
        groupLabel: GROUP_LABELS[d.group] || "",
        color: baseColor,
        eye: "",
        eyeR: "",
        mouth: "",
        blush: false,
        anger: false,
        zzz: false,
        sweat: false,
        snap: cache[d.id] || ""
      };
    });
  },

  _filteredByGroup: function _filteredByGroup(key) {
    var all = this._all || [];
    if (key === "all") return all;
    return all.filter(function(m) { return m.group === key; });
  },

  _setCharacter: function _setCharacter(key) {
    var items = key === "ball" ? this._buildBallItems() : this._buildMateItems(key);
    this._all = items;
    this._charKey = key;
    var hint = CHARACTER_TABS[0].hint;
    for (var i = 0; i < CHARACTER_TABS.length; i++) {
      if (CHARACTER_TABS[i].key === key) hint = CHARACTER_TABS[i].hint;
    }
    this.setData({
      charKey: key,
      filtered: this._filteredByGroup(this.data.activeGroup),
      actionsHint: hint,
      wallSwap: false
    });
    var self = this;
    setTimeout(function() {
      self.setData({ wallSwap: true });
    }, 30);
  },

  /* ---------- 舞台引擎 ---------- */

  _destroyEngine: function _destroyEngine() {
    this._clearEngineTimers();
    if (this._engine) {
      try { this._engine.stopTour(); } catch (e) {}
      try { this._engine.destroy(); } catch (e) {}
      this._engine = null;
    }
  },

  _attachEngine: function _attachEngine(eng, kind) {
    var self = this;
    eng.on("change", function(e) {
      var d = e.def || {};
      var patch = {
        stage: {
          id: d.id,
          name: d.name,
          desc: d.desc,
          groupLabel: GROUP_LABELS[d.group] || ""
        }
      };
      // 名称区随表情切换快速淡换；首次挂载留给进场动画
      if (self._stageSeen) {
        patch.stageAlt = self.data.stageAlt === "altA" ? "altB" : "altA";
      }
      self._stageSeen = true;
      self.setData(patch);
    });
    this._engine = eng;
    this._engineKind = kind;
  },

  _setupEngine: function _setupEngine(kind, opts) {
    opts = opts || {};
    var self = this;
    var canvas = this._stageCanvas;
    var ctx = this._stageCtx;
    if (!canvas || !ctx) return;

    this._destroyEngine();
    var eng = null;
    try {
      if (kind === "ball") {
        if (!emotionEngine) return;
        eng = emotionEngine.create({ canvas: canvas, ctx: ctx }, {
          emotion: "10",
          idle: true,
          /* 帧时钟绑自己的 canvas：跨页共享时钟会在注册页隐藏后停摆 */
          raf: function(cb) { canvas.requestAnimationFrame(cb); }
        });
      } else {
        if (!matesEngine) return;
        var view = STAGE_VIEW[kind] || {};
        eng = matesEngine.create({ canvas: canvas, ctx: ctx }, {
          character: kind,
          /* 云宝 / 亮亮以"好奇"开场（球球保持开心开场） */
          emotion: "03",
          idle: true,
          margin: view.margin,
          yBias: view.yBias,
          raf: function(cb) { canvas.requestAnimationFrame(cb); }
        });
      }
    } catch (err) {
      bootLog.reportError("mood:" + kind + "引擎create抛错", err);
      return;
    }
    this._attachEngine(eng, kind);
    eng.setActive(false);
    eng.resetIdle();
    /* 构造器里的 setEmotion 早于监听器挂载，补一次同步首帧事件填 stage */
    try { eng.replay(); } catch (e) {}

    /* 进场动画结束后再启动球引擎与快照（逐个离屏渲染很重，避免抢帧） */
    var delay = opts.initial ? 950 : 80;
    this._engineTimers = [
      setTimeout(function() {
        if (self._engine !== eng) return;   // 期间已切换角色
        eng.setActive(true);
        eng.resetIdle();
      }, delay),
      setTimeout(function() {
        if (self._engine !== eng) return;
        self._genSnapshots(kind);
      }, opts.initial ? 950 : 260)
    ];
  },

  onCharTap: function onCharTap(e) {
    var key = e.currentTarget.dataset.key;
    if (!key || key === this.data.charKey) return;
    if (this._engine) {
      try { this._engine.stopTour(); } catch (err) {}
    }
    if (this.data.touring) this.setData({ touring: false });
    // 旧的快照生成循环作废（令牌 +1），重建该角色的墙格与舞台引擎
    this._snapGen += 1;
    this._setCharacter(key);
    this._setupEngine(key, { initial: false });
  },

  onLoad: function onLoad() {
    bootLog.breadcrumb("page:mood onLoad");
    this._all = [];
    if (!emotionEngine && !matesEngine) {
      this.setData({ filtered: [] });
      return;
    }
    this._setCharacter("ball");
    var all = this._all || [];
    bootLog.breadcrumb("mood:引擎就绪,表情数=" + all.length);
    if (!all.length) {
      bootLog.reportError("mood:表情注册表为空", { listLen: -1 });
    }
  },

  onReady: function onReady() {
    if (!emotionEngine && !matesEngine) return;
    var self = this;
    var query = this.createSelectorQuery();
    query.select("#moodStage").fields({ node: true, size: true }).exec(function(res) {
      var item = res && res[0];
      if (!item || !item.node) {
        bootLog.reportError("mood:舞台canvas节点未取到", { hasItem: !!item });
        return;
      }
      bootLog.breadcrumb("mood:舞台canvas就绪");
      var canvas = item.node;
      var info = wx.getWindowInfo ? wx.getWindowInfo() : { pixelRatio: 2 };
      var dpr = Math.min(info.pixelRatio || 2, 3);
      canvas.width = Math.floor(item.width * dpr);
      canvas.height = Math.floor(item.height * dpr);
      var ctx = canvas.getContext("2d");
      if (!ctx) {
        bootLog.reportError("mood:canvas.getContext返回空", { w: canvas.width, h: canvas.height });
        return;
      }
      if (!canvas.requestAnimationFrame) {
        bootLog.reportError("mood:canvas.requestAnimationFrame缺失", {});
        return;
      }
      self._stageCanvas = canvas;
      self._stageCtx = ctx;
      self._setupEngine("ball", { initial: true });
    });
  },

  /* 快照管线：专用离屏 engine 逐个 setEmotion（未激活时自动走 renderStatic），
   * 把隐藏 canvas 的内容导出为透明 PNG，交给表情墙 <image> 显示。
   * 按角色独立生成并缓存（_snapCache[charKey][id]），切回角色秒显；
   * _snapGen 令牌使切换角色后旧循环自动作废 */
  _genSnapshots: function _genSnapshots(charKey) {
    var self = this;
    if (charKey === "ball" && !emotionEngine) return;
    if (charKey !== "ball" && !matesEngine) return;
    var gen = ++this._snapGen;
    if (!this._snapCache[charKey]) this._snapCache[charKey] = {};
    var cache = this._snapCache[charKey];
    var ids = [];
    (this._all || []).forEach(function(m) {
      if (cache[m.id]) {
        self._applySnap(m.id, cache[m.id], charKey);
      } else {
        ids.push(m.id);
      }
    });
    if (!ids.length) return;

    var query = this.createSelectorQuery();
    query.select("#snapStage").fields({ node: true, size: true }).exec(function(res) {
      if (gen !== self._snapGen) return;
      var item = res && res[0];
      if (!item || !item.node) return;
      var canvas = item.node;
      var info = wx.getWindowInfo ? wx.getWindowInfo() : { pixelRatio: 2 };
      var dpr = Math.min(info.pixelRatio || 2, 3);
      var cssSize = 140;
      canvas.width = Math.floor(cssSize * dpr);
      canvas.height = Math.floor(cssSize * dpr);
      var ctx = canvas.getContext("2d");
      var snapEng = null;
      try {
        if (charKey === "ball") {
          snapEng = emotionEngine.create({ canvas: canvas, ctx: ctx }, {
            emotion: "02",
            autostart: false,
            lite: true,
            idle: false,
            raf: function(cb) { canvas.requestAnimationFrame(cb); }
          });
        } else {
          var view = SNAP_VIEW[charKey] || {};
          snapEng = matesEngine.create({ canvas: canvas, ctx: ctx }, {
            character: charKey,
            emotion: "02",
            autostart: false,
            lite: true,
            idle: false,
            margin: view.margin,
            yBias: view.yBias,
            raf: function(cb) { canvas.requestAnimationFrame(cb); }
          });
        }
      } catch (err) {
        bootLog.reportError("mood:" + charKey + "快照引擎创建失败", err);
        return;
      }
      var index = 0;

      function next() {
        if (gen !== self._snapGen) {
          try { snapEng.destroy(); } catch (e) {}
          return;
        }
        if (index >= ids.length) {
          try { snapEng.destroy(); } catch (e) {}
          return;
        }
        var id = ids[index];
        try {
          snapEng.setEmotion(id, { auto: true });
        } catch (err) {
          bootLog.reportError("mood:快照setEmotion异常 " + charKey + "/" + id, err);
        }
        wx.canvasToTempFilePath({
          canvas: canvas,
          fileType: "png",
          destWidth: canvas.width,
          destHeight: canvas.height,
          success: function(out) {
            cache[id] = out.tempFilePath;
            self._applySnap(id, out.tempFilePath, charKey);
          },
          complete: function() {
            index += 1;
            setTimeout(next, 30);
          }
        });
      }
      next();
    });
  },

  /* 快照落位：只更新当前角色的墙格（防串台），按 id 定位不依赖下标 */
  _applySnap: function _applySnap(id, path, charKey) {
    if (charKey !== this._charKey) return;
    var all = this._all || [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) { all[i].snap = path; break; }
    }
    var filtered = this.data.filtered || [];
    var patch = {};
    for (var j = 0; j < filtered.length; j++) {
      if (filtered[j].id === id) patch["filtered[" + j + "].snap"] = path;
    }
    if (Object.keys(patch).length) this.setData(patch);
  },

  onShow: function onShow() {
    if (typeof this.getTabBar === "function") {
      var tabBar = this.getTabBar();
      if (tabBar && tabBar.setData) {
        var pages = getCurrentPages();
        var cur = pages[pages.length - 1];
        var route = "/" + (cur && cur.route || "");
        var idx = -1;
        tabBar.data.list.forEach(function(item, i) {
          if (item.pagePath === route) idx = i;
        });
        if (idx >= 0 && tabBar.data.selected !== idx) {
          tabBar.setData({ selected: idx });
        }
        if (idx >= 0) {
          var g = getApp() && getApp().globalData;
          if (g) g.__lastTabIndex = idx;
        }
      }
    }
    if (this._engine) {
      // 切回本页时尽快恢复渲染，不再等进场动画
      var eng = this._engine;
      var selfEng = this;
      setTimeout(function() {
        if (selfEng._engine !== eng) return;
        eng.setActive(true);
        eng.resetIdle();
      }, 60);
    }
    // 页面切换过渡：每次切入都先把各模块淡出复位，再错落淡入。
    // 首次进入用完整节奏；从其他页切回用更快更轻的回放节奏，保证切换流畅
    var self = this;
    this._clearEnterTimers();
    var first = !this._entered;
    this._entered = true;
    this.setData({ enter: false, settled: false, replay: !first });
    this._enterTimers = [
      setTimeout(function() {
        self.setData({ enter: true });
      }, 50),
      // 进场动画全部结束后摘掉逐个淡入规则，后续换组用自己的轻量过渡
      setTimeout(function() {
        self.setData({ settled: true });
      }, first ? 1750 : 950)
    ];
  },

  onHide: function onHide() {
    this._clearEnterTimers();
    if (this._engine) this._engine.setActive(false);
  },

  onUnload: function onUnload() {
    this._clearEnterTimers();
    this._clearEngineTimers();
    this._snapGen += 1;
    this._destroyEngine();
  },

  onStageTap: function onStageTap() {
    if (!this._engine) return;
    if (this._engineKind !== "ball") {
      /* mood-mates 角色：点击庆祝是完整一幕（云宝吹云泡连点换扇区 /
       * 亮亮星星爆闪 + 随机肢体 + 撒花），与原版站点点击行为一致 */
      this._engine.resetIdle();
      this._engine.celebrate(1);
      return;
    }
    var now = Date.now();
    if (now - this._lastTapAt < 320) {
      this._engine.burst(26);
      this._lastTapAt = 0;
      return;
    }
    this._lastTapAt = now;
    this._engine.spin(1);
  },

  onSpinTap: function onSpinTap() {
    if (this._engine) this._engine.spin(1);
  },

  onBurstTap: function onBurstTap() {
    if (this._engine) this._engine.burst(26);
  },

  toggleTour: function toggleTour() {
    if (!this._engine) return;
    if (this.data.touring) {
      this._engine.stopTour();
      this.setData({ touring: false });
    } else {
      var ids = [];
      if (this._engineKind === "ball") {
        if (!emotionEngine) return;
        emotionEngine.config.list().forEach(function(d) { ids.push(d.id); });
      } else {
        if (!matesEngine) return;
        matesEngine.config.list().forEach(function(d) { ids.push(d.id); });
      }
      this._engine.startTour(ids, 2400);
      this.setData({ touring: true });
    }
  },

  toggleAbout: function toggleAbout() {
    this.setData({ aboutCollapsed: !this.data.aboutCollapsed });
  },

  onGroupTap: function onGroupTap(e) {
    var key = e.currentTarget.dataset.key;
    if (!key || key === this.data.activeGroup) return;
    var filtered = this._filteredByGroup(key);
    var self = this;
    // 先摘掉动画类再挂回，让球阵以错落淡入完成换组过渡
    this.setData({ activeGroup: key, filtered: filtered, wallSwap: false });
    setTimeout(function() {
      self.setData({ wallSwap: true });
    }, 30);
  },

  pickMood: function pickMood(e) {

    var id = e.currentTarget.dataset.id;
    if (!id || !this._engine) return;
    if (this.data.touring) {
      this._engine.stopTour();
      this.setData({ touring: false });
    }
    this._engine.resetIdle();
    this._engine.setEmotion(id);
  }
});
