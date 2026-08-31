/* ============================================================
 * pet-ball —— 全局"宠物"的脸（组件）
 *
 * 自己不做任何状态决定：订阅 petStore 的裁决结果并渲染。
 * - store 返回 null（总闸关闭）→ 不渲染 canvas，引擎销毁
 * - 页面不可见（isPageVisible）→ 暂停 RAF
 * - size: "header"（默认）| "dock" | "hero"
 * - bind:change 事件把 { emotionName, caption } 抛给页面展示文字
 *
 * 页面切换的"淡入淡出"过渡（真机同层 canvas 的硬约束）：
 * - 淡入淡出由引擎画进位图（engine.setFade → ball-canvas 的帧级
 *   globalAlpha 因子）：同层 canvas 在部分内核不吃祖先/自身的 CSS
 *   opacity，CSS 淡入淡出注定无效，像素 alpha 是唯一内核无关方案；
 * - 登场/回归：alpha 0→1（420ms，与所在模块 fx-on 同步）；
 * - 谢幕：页面导航前 petStore.beginExit() → alpha 1→0（260ms，
 *   与 fx-out 同步），引擎保持绘制，仅像素 alpha 归零；
 * - 位移抵消：球所在 .fx 模块入场/退场带 18rpx 平移（祖先 transform
 *   对 canvas 生效，正是"球在移动"的来源），反向抵消样式在 app.wxss
 *   （.page.fx-* .ballWrap，经 styleIsolation: apply-shared 生效）；
 * - 中间没有球的空档/双球（每页只有一颗球）。
 * - 拖拽（仅 draggable 的实例，首页 hero 球开启）：touch 实时驱动
 *   ballWrap 内侧 .ballDrag 的 transform 跟手，松手原地停泊
 *   DRAG_RETURN_DELAY_MS 后由 rAF 逐帧插值滑回原位——与跟手同一
 *   setData 通路，全内核确定平滑（CSS transition「同拍加过渡类 +
 *   改位移」在部分内核不生效，真机观感是瞬移，故弃用）。位移层与
 *   fx 抵消动画分属内外两层（ballDrag / ballWrap），互不干扰；悬浮
 *   期间向页面抛 dragstate { floating }，由页面抬高容器层级、收起气泡。
 * ============================================================ */
/* 引擎加载容错：真机上引擎链若崩溃，组件自动卸载 canvas 自保，
 * 不向页面抛错（页面白屏比缺一颗球严重得多）。
 * 加载失败必须上报（实时日志+本地缓冲），否则体验版无从排查 */
var bootLog = require("../../utils/bootLog");
var emotionEngine = null;
try {
  emotionEngine = require("../../utils/emotion/engine.js");
} catch (err) {
  bootLog.reportError("pet-ball:引擎require失败", err);
  console.error("[pet-ball] 表情引擎加载失败，球功能停用", err);
}
var petStore = require("../../utils/pet/petStore.js");

/* 真机联调日志开关（发布前置 false） */
var PET_LOG = false;
function flog(pageKey) {
  if (!PET_LOG) return;
  var args = ["[pet-ball][" + (pageKey || "?") + "]"];
  for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
  console.log.apply(console, args);
}

/* 拖拽参数：跟手阈值 / 抓起缩放 / 松手停泊时长 / 回归滑行时长（rAF 逐帧，
 * 见 _startReturnAnim）/ 球不出视口的边距 */
var DRAG_THRESHOLD_PX = 6;
var DRAG_HELD_SCALE = 1.06;
var DRAG_RETURN_DELAY_MS = 3000;
var DRAG_RETURN_ANIM_MS = 600;
var DRAG_VIEWPORT_MARGIN_PX = 8;

Component({
  properties: {
    size: {
      type: String,
      value: "header"
    },
    /* 所在页面 key，用于可见性判断 */
    pageKey: {
      type: String,
      value: ""
    },
    /* 是否可拖拽（首页 hero 球开启；touch 处理器对所有实例都挂着，
     * 非拖拽实例在此直接短路，且用的是 bind 不影响页面滚动） */
    draggable: {
      type: Boolean,
      value: false
    }
  },

  data: {
    enabled: true,
    emotionName: "",
    /* 拖拽渲染态：位移（px，相对原位）与抓起缩放，均由 touch/rAF 逐帧驱动 */
    dragX: 0,
    dragY: 0,
    dragScale: 1
  },

  lifetimes: {
    attached: function() {
      this._engine = null;
      this._lastCaption = "";
      this._canvasNode = null;
      this._fadeVal = 0;
      this._fadeRaf = 0;
      /* 大位移过渡（首页加热飞行/回归）期间的停帧开关 */
      this._tickSuspended = false;
      /* 拖拽内部状态（非渲染数据）：
       * _homeRect 球在原位（位移 0,0）时的视口矩形，越界钳制基准；
       * _baseX/_baseY 抓球瞬间的既有位移；_returnRaf 回归滑行的帧回调
       * 句柄（配 _returnRafCancel 取消） */
      this._dragTouchId = null;
      this._startX = null;
      this._baseX = 0;
      this._baseY = 0;
      this._dragMoved = false;
      this._floatingEmit = false;
      this._dragReturnTimer = 0;
      this._returnRaf = 0;
      this._returnRafCancel = null;
      this._homeRect = null;
      this._win = null;
      this._bootDone = false;
    },
    ready: function() {
      var self = this;
      /* ready 后画布节点才可用；订阅大脑，收到 null（总闸关）则不渲染 */
      this._subId = petStore.subscribe(function(payload) {
        self._apply(payload);
      }, this.data.pageKey);
    },
    detached: function() {
      if (this._subId) {
        petStore.unsubscribe(this._subId);
        this._subId = 0;
      }
      this._stopFade();
      this._destroyEngine();
      this._clearDragTimers();
    }
  },

  /* 页面重新可见/尺寸变化时校准原位矩形（页面不滚动，视口坐标系稳定，
   * 无需拖拽过程中反复查询） */
  pageLifetimes: {
    show: function() {
      this._measureHomeRect();
    },
    resize: function() {
      this._measureHomeRect();
    }
  },

  methods: {
    _destroyEngine: function() {
      if (this._engine) {
        this._engine.destroy();
        this._engine = null;
      }
    },

    /* 像素 alpha 淡入淡出驱动：曲线用 easeOutCubic 近似 fx 模块的
     * cubic-bezier(0.22,0.61,0.36,1)，帧步进走画布 rAF（与引擎同钟） */
    _startFade: function(to, ms) {
      var self = this;
      this._stopFade();
      var from = this._fadeVal;
      if (!this._engine || !this._canvasNode) {
        this._fadeVal = to;
        return;
      }
      this._engine.setFade(from);
      if (from === to) return;
      var t0 = Date.now();
      var step = function() {
        if (!self._engine) return;
        var t = Math.min((Date.now() - t0) / ms, 1);
        var e = 1 - Math.pow(1 - t, 3);
        self._fadeVal = from + (to - from) * e;
        self._engine.setFade(self._fadeVal);
        if (t < 1) self._fadeRaf = self._canvasNode.requestAnimationFrame(step);
      };
      this._fadeRaf = this._canvasNode.requestAnimationFrame(step);
    },

    _stopFade: function() {
      if (this._fadeRaf && this._canvasNode && this._canvasNode.cancelAnimationFrame) {
        this._canvasNode.cancelAnimationFrame(this._fadeRaf);
      }
      this._fadeRaf = 0;
    },

    _apply: function(payload) {
      this._lastPayload = payload || null;
      var enabled = !!payload && petStore.isEnabled();
      if (enabled !== this.data.enabled) {
        this.setData({ enabled: enabled });
        if (!enabled) {
          this._stopFade();
          this._fadeVal = 0;
          this._destroyEngine();
          /* 球随总闸卸载：停泊/滑行一并清掉，并解除页面的悬浮态 */
          this.snapHome();
          return;
        }
        /* 重新显示：canvas 重新挂载，稍候重建引擎并补发最新指令 */
        var self = this;
        setTimeout(function() {
          self._ensureEngine(function() {
            self._apply(self._lastPayload);
          });
        }, 50);
      }
      if (!enabled) return;

      /* 谢幕淡出：导航前随页面模块（fx-out）同步淡出，优先级最高。
       * 引擎保持绘制，仅像素 alpha 归零 */
      if (payload.exit) {
        flog(this.data.pageKey, "exit: pixel fade-out");
        this._startFade(0, 260);
        return;
      }

      this._lastCaption = payload.caption;

      /* 只有自己的页面可见时才渲染（页面 onShow/onHide 向 store 上报） */
      if (!petStore.isPageVisible(this.data.pageKey)) {
        this._stopFade();
        this._fadeVal = 0;
        if (this._engine) this._engine.setActive(false);
        return;
      }

      var self = this;
      this._ensureEngine(function(eng) {
        if (!eng) return;
        eng.setActive(!self._tickSuspended);
        self._driveEngine(eng, payload);
        /* 登场/回归/中断恢复：alpha 未满即继续淡入（420ms = fx-on 时长） */
        if (self._fadeVal < 1) self._startFade(1, 420);
      });

      /* 表情名/文案随引擎 change 事件更新（见 _ensureEngine）；
       * 巡演指令本身不变时也要刷新一次当前值 */
      var eng = this._engine;
      if (eng && eng.emotionId()) {
        this._emitChange(eng.emotionId(), payload.caption);
      }
    },

    /* 把大脑裁决应用到引擎 */
    _driveEngine: function(eng, payload) {
      if (payload.tour) {
        eng.startTour(payload.tour, payload.tourMs || 5000);
      } else if (payload.emotion) {
        /* 同一表情的重复指令不重放（看向期间大脑心跳会再下发同 ID） */
        if (eng.emotionId() !== payload.emotion) {
          eng.stopTour();
          eng.setEmotion(payload.emotion);
        }
      }
    },

    _emitChange: function(emotionId, caption) {
      var def = emotionEngine.config.get(emotionId);
      var line = caption || petStore.captionFor(emotionId);
      this.setData({ emotionName: (def && def.name) || "" });
      this.triggerEvent("change", {
        emotionId: emotionId,
        emotionName: (def && def.name) || "",
        caption: line
      });
    },

    _ensureEngine: function(ready, attempt) {
      var self = this;
      attempt = attempt || 0;
      if (this._engine) {
        if (typeof ready === "function") ready(this._engine);
        return;
      }
      /* 引擎模块在真机上加载失败：卸载 canvas 停用球功能，不再重试 */
      if (!emotionEngine) {
        this._canvasNode = null;
        this.setData({ enabled: false });
        if (typeof ready === "function") ready(null);
        return;
      }
      /* 冷启动首次建引擎延后：让页面入场动画先跑完再起同层 canvas 首帧，
       * 避免与 CSS 动画在同一渲染管线抢预算（真机首屏卡顿/白屏的典型诱因，
       * 与 mood 页延时 950ms 再启引擎同理）。首页 hero 球等 600ms；面板
       * 凹座里的 dock 球没有入场动画竞争，60ms 快速启动。仅首次创建生效 */
      if (!this._bootDone) {
        this._bootDone = true;
        var bootDelay = this.properties.size === 'hero' ? 600 : 60;
        setTimeout(function() {
          self._ensureEngine(ready, attempt);
        }, bootDelay);
        return;
      }
      var query = this.createSelectorQuery();
      query.select("#petBallCanvas").fields({ node: true, size: true }).exec(function(res) {
        if (self._engine) {
          if (typeof ready === "function") ready(self._engine);
          return;
        }
        var item = res && res[0];
        /* 节点未就绪或尺寸未完成布局：短暂重试（setData 渲染与查询存在时序差），
         * 仍失败则交回调用方兜底 */
        if (!item || !item.node || !item.width) {
          if (attempt < 5) {
            setTimeout(function() { self._ensureEngine(ready, attempt + 1); }, 60);
          } else if (typeof ready === "function") {
            ready(null);
          }
          return;
        }
        var canvas = item.node;
        self._canvasNode = canvas;
        self._canvasCssW = item.width;
        /* 物理像素一律 3x 超采样：小尺寸球（dock/header）在 dpr 误报或
         * rpx→px 分数取整下会发糊；ball-canvas 的坐标系由 canvas.width
         * 推导，纯提高 backing 分辨率即可，CSS 尺寸不变由系统缩小显示 */
        var dpr = 3;
        canvas.width = Math.floor(item.width * dpr);
        canvas.height = Math.floor(item.height * dpr);
        var ctx = canvas.getContext("2d");
        if (!ctx) {
          bootLog.reportError("pet-ball:canvas.getContext返回空", { pageKey: self.data.pageKey, w: canvas.width, h: canvas.height });
          if (typeof ready === "function") ready(null);
          return;
        }
        var eng = null;
        try {
          eng = emotionEngine.create({ canvas: canvas, ctx: ctx }, {
            emotion: "02",
            /* 留出画布余量：弹跳/彩带不被边缘裁切 */
            margin: 1.18,
            /* 帧时钟绑自己的 canvas：跨页共享时钟会被最后注册的 canvas
             * 带走，其页面卸载/隐藏后全局循环停摆，球集体隐身但仍可点 */
            raf: function(cb) { canvas.requestAnimationFrame(cb); }
          });
        } catch (err) {
          bootLog.reportError("pet-ball:引擎create抛错", { pageKey: self.data.pageKey, err: err });
          if (typeof ready === "function") ready(null);
          return;
        }
        /* 引擎首帧前先置全透明，淡入由 _apply 的 _startFade 接管 */
        eng.setFade(0);
        eng.on("change", function(e) {
          self._emitChange(e.def && e.def.id, self._lastCaption);
        });
        self._engine = eng;
        /* 引擎就绪意味着 canvas 布局完成，顺带校准拖拽用的原位矩形
         * （延迟避开入场 fuse 动画期间 ballWrap 的 ±18rpx 位移） */
        self._measureHomeRect();
        bootLog.breadcrumb("pet-ball:引擎就绪(" + self.data.pageKey + ")");
        flog(self.data.pageKey, "engine ready");
        if (typeof ready === "function") ready(eng);
      });
    },

    /* 摸摸球：报给大脑出亲昵反应，引擎补一次弹跳，并通知页面 */
    onTap: function(e) {
      /* 拖拽过的松手不当作摸摸球（有位移时 tap 仍可能派发）；
       * 标志留给下次 touchstart 复位 */
      if (this._dragMoved) return;
      /* 方形画布四角不在球面上：不算摸球 */
      var pt = null;
      if (e && e.detail && typeof e.detail.x === 'number') {
        pt = { clientX: e.detail.x, clientY: e.detail.y };
      } else if (e && e.changedTouches && e.changedTouches[0]) {
        pt = e.changedTouches[0];
      }
      if (pt && !this._touchOnBall(pt)) return;
      petStore.pet();
      if (this._engine) this._engine.bounce();
      this.triggerEvent("pettap");
    },

    /* 外部触发一次弹跳（页面在球落点等时机调用，让球更有反应感） */
    bounce: function() {
      if (this._engine) this._engine.bounce();
    },

    /* 大位移过渡（首页加热飞行/回归）期间临时停帧：位移交给包装层
     * transform 过渡，引擎 60fps 全画布重绘会在同一渲染管线里与过渡
     * 抢预算（真机掉帧的主因）。暂停只冻结表情微动，最后一帧留在
     * 画布上随层移动，肉眼无感知；落定后由页面恢复 */
    setTickSuspended: function(on) {
      on = !!on;
      if (this._tickSuspended === on) return;
      this._tickSuspended = on;
      if (this._engine) {
        this._engine.setActive(!on && petStore.isPageVisible(this.data.pageKey));
      }
    },

    /* ---------------- 拖拽（draggable 实例，首页 hero 球） ----------------
     * 位移打在 .ballDrag 的 transform 上（px，touch 坐标系），越界钳制
     * 依赖 _homeRect（原位视口矩形）。松手原地停泊 DRAG_RETURN_DELAY_MS
     * 后由 rAF 逐帧插值滑回原位——与跟手共用同一 setData 通路，全内核
     * 确定平滑（CSS transition「同拍加过渡类 + 改位移」在部分内核不
     * 生效，真机观感是瞬移，故弃用）。 */

    /* 球面命中检测：画布是方形，球体只占其中内切圆的一部分（半径约为
     * 画布宽的 0.375，取 0.40 略放宽）。不检测的话方形四角都能摸球/
     * 抓球，受击范围远超球体。_homeRect 是原位矩形（已扣除拖拽位移），
     * 视觉中心需加回当前位移 */
    _touchOnBall: function(touch) {
      var rect = this._homeRect;
      var w = this._canvasCssW;
      if (!rect || !w) return true; /* 未完成标定时放行，避免误伤交互 */
      var cx = (rect.left + rect.right) / 2 + (this.data.dragX || 0);
      var cy = (rect.top + rect.bottom) / 2 + (this.data.dragY || 0);
      var dx = touch.clientX - cx;
      var dy = touch.clientY - cy;
      var radius = w * 0.40;
      return dx * dx + dy * dy <= radius * radius;
    },

    onDragStart: function(e) {
      if (!this.properties.draggable) return;
      /* 已有手指在拖时忽略第二根，避免起点被重置导致球跳位 */
      if (this._startX !== null) return;
      var t = e.touches && e.touches[0];
      if (!t) return;
      /* 方形画布四角不在球面上：不抓取 */
      if (!this._touchOnBall(t)) return;
      this._clearDragTimers();
      this._dragTouchId = t.identifier;
      this._startX = t.clientX;
      this._startY = t.clientY;
      this._dragMoved = false;
      this._win = this._getWindowMetrics();
      /* 停泊中/回归滑行中被抓都一样：回归由 JS 逐帧驱动，data 里就是
       * 精确现值，直接从现值继续跟手 */
      this._baseX = this.data.dragX;
      this._baseY = this.data.dragY;
    },

    onDragMove: function(e) {
      if (!this.properties.draggable || this._startX === null) return;
      var t = e.touches && e.touches[0];
      if (!t || t.identifier !== this._dragTouchId) return;
      var dx = t.clientX - this._startX;
      var dy = t.clientY - this._startY;
      if (!this._dragMoved) {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
        this._dragMoved = true;
        this.setData({ dragScale: DRAG_HELD_SCALE });
        this._floatingEmit = true;
        this.triggerEvent("dragstate", { floating: true });
        /* 抓起小惊喜：与摸摸球同款弹跳 */
        if (this._engine) this._engine.bounce();
      }
      this._applyDragOffset(dx, dy);
    },

    onDragEnd: function() {
      if (!this.properties.draggable) return;
      this._startX = null;
      /* 纯点按（未过阈值）交给 onTap 走摸摸球；但球若不在原位（如回归
       * 滑行中被碰了一下就松手）仍需重新安排回归 */
      if (!this._dragMoved) {
        if (this.data.dragX || this.data.dragY) this._armAutoReturn();
        return;
      }
      this._armAutoReturn();
    },

    /* 松手后停泊原地，DRAG_RETURN_DELAY_MS 后滑回原位 */
    _armAutoReturn: function() {
      var self = this;
      if (this._dragReturnTimer) clearTimeout(this._dragReturnTimer);
      this._dragReturnTimer = setTimeout(function() {
        self._dragReturnTimer = 0;
        self._startReturnAnim();
      }, DRAG_RETURN_DELAY_MS);
    },

    /* 回归滑行：rAF 逐帧 easeOutCubic 插值位移与缩放（曲线与像素淡入
     * 淡出同族），走完由 _finishReturn 收尾 */
    _startReturnAnim: function() {
      this._stopReturnAnim();
      var fromX = this.data.dragX;
      var fromY = this.data.dragY;
      var fromScale = this.data.dragScale;
      if (!fromX && !fromY && fromScale === 1) {
        this._finishReturn();
        return;
      }
      var self = this;
      var node = this._canvasNode;
      var rafFn;
      var cancelFn;
      if (node && node.requestAnimationFrame) {
        rafFn = node.requestAnimationFrame.bind(node);
        cancelFn = node.cancelAnimationFrame ? node.cancelAnimationFrame.bind(node) : function() {};
      } else {
        /* 兜底时钟：画布节点缺席（理论不可达）也不至于卡在半空 */
        rafFn = function(cb) { return setTimeout(cb, 16); };
        cancelFn = function(id) { clearTimeout(id); };
      }
      this._returnRafCancel = cancelFn;
      var t0 = Date.now();
      var step = function() {
        self._returnRaf = 0;
        /* 滑行中被手指接走则让位（rAF 已在 onDragStart 里取消，双保险） */
        if (self._startX !== null) return;
        var t = Math.min((Date.now() - t0) / DRAG_RETURN_ANIM_MS, 1);
        var e = 1 - Math.pow(1 - t, 3);
        self.setData({
          dragX: Math.round(fromX * (1 - e)),
          dragY: Math.round(fromY * (1 - e)),
          dragScale: fromScale + (1 - fromScale) * e
        });
        if (t < 1) {
          self._returnRaf = rafFn(step);
        } else {
          self._finishReturn();
        }
      };
      this._returnRaf = rafFn(step);
    },

    _stopReturnAnim: function() {
      if (this._returnRaf && this._returnRafCancel) {
        this._returnRafCancel(this._returnRaf);
      }
      this._returnRaf = 0;
    },

    _finishReturn: function() {
      this._returnRaf = 0;
      this.setData({ dragX: 0, dragY: 0, dragScale: 1 });
      this._measureHomeRect();
      if (this._floatingEmit) {
        this._floatingEmit = false;
        this.triggerEvent("dragstate", { floating: false });
      }
    },

    _applyDragOffset: function(dx, dy) {
      var x = Math.round(this._baseX + dx);
      var y = Math.round(this._baseY + dy);
      var win = this._win;
      var rect = this._homeRect;
      if (win && rect) {
        var m = DRAG_VIEWPORT_MARGIN_PX;
        var minX = m - rect.left;
        var maxX = win.w - m - rect.right;
        var minY = m - rect.top;
        var maxY = win.h - m - rect.bottom;
        /* 极端小屏下球比可用空间还大：钳制区间塌缩，取中点兜底 */
        if (minX > maxX) minX = maxX = (minX + maxX) / 2;
        if (minY > maxY) minY = maxY = (minY + maxY) / 2;
        if (x < minX) x = minX; else if (x > maxX) x = maxX;
        if (y < minY) y = minY; else if (y > maxY) y = maxY;
      }
      if (x !== this.data.dragX || y !== this.data.dragY) {
        this.setData({ dragX: x, dragY: y });
      }
    },

    /* 校准原位视口矩形：球带位移（停泊/滑行中）时按已知位移反推。
     * 固定延迟 450ms 避开页面入场 fuse 动画（ballWrap ±18rpx 位移窗口） */
    _measureHomeRect: function() {
      var self = this;
      if (!this.data.enabled) return;
      setTimeout(function() {
        if (!self.data.enabled) return;
        self.createSelectorQuery().select(".ballDrag").boundingClientRect(function(r) {
          if (!r || !r.width) return;
          var ox = self.data.dragX || 0;
          var oy = self.data.dragY || 0;
          self._homeRect = {
            left: r.left - ox,
            top: r.top - oy,
            right: r.right - ox,
            bottom: r.bottom - oy
          };
        }).exec();
      }, 450);
    },

    _getWindowMetrics: function() {
      try {
        if (wx.getWindowInfo) {
          var w = wx.getWindowInfo();
          if (w && w.windowWidth) return { w: w.windowWidth, h: w.windowHeight };
        }
      } catch (e) {}
      try {
        var s = wx.getSystemInfoSync();
        return { w: s.windowWidth, h: s.windowHeight };
      } catch (e2) {
        return null;
      }
    },

    _clearDragTimers: function() {
      if (this._dragReturnTimer) { clearTimeout(this._dragReturnTimer); this._dragReturnTimer = 0; }
      this._stopReturnAnim();
    },

    /* 页面主动要球回家（如打开加热面板起飞前）：无动画瞬时复位并解除悬浮 */
    snapHome: function() {
      this._clearDragTimers();
      this._dragMoved = false;
      this._startX = null;
      if (this._floatingEmit) {
        this._floatingEmit = false;
        this.triggerEvent("dragstate", { floating: false });
      }
      if (this.data.dragX || this.data.dragY || this.data.dragScale !== 1) {
        this.setData({ dragX: 0, dragY: 0, dragScale: 1 });
      }
    }
  }
});
