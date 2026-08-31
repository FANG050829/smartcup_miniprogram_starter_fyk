/* ============================================================
 * engine.js —— 驱动层（小程序移植版）
 * 移植自开源项目 emotion-ball 的 engine.js
 * (github.com/sam70361/emotion-ball，引擎与配置数据双许可，
 *  个人学习研究免费)
 *
 * 移植差异：
 *   - 去除 window / document / DOM 查询；EB.createBall 指向 Canvas 渲染层
 *   - rAF 由宿主注入：创建时 opts.raf（推荐，每引擎绑自己的 canvas）
 *     或全局 EmotionEngine.setRaf(fn)（兼容旧接入，多引擎慎用）
 *   - performance.now 缺失时回退 Date.now
 * 职责与算法与原版完全一致：
 *   配置注册中心 / rAF 状态机 / 动画原语 / 弹簧插值 /
 *   眼环池轮换 / 眨眼关键帧 / 待机策略 / 关键帧序列 / 自动巡演
 * ============================================================ */
(function () {
  'use strict';

  var RD = require("./rings.js");
  var EM = require("./emotions.js");
  var canvasBall = require("./ball-canvas.js");

  var EXPR = RD.EXPRESSIONS;
  var TAU = Math.PI * 2;
  var FALLBACK_ID = '02';

  var nowFn = (typeof performance !== 'undefined' && performance.now && performance.now.bind(performance))
    ? function () {
        /* 部分真机内核注入的 performance.now 返回非数值：NaN 混入时间轴后，
         * 过渡插值 t 与弹簧全部变 NaN，颜色串变成 "#NaN…"，addColorStop 抛错，
         * 整个渲染循环死亡。非有限数值一律回退 Date.now()（同一时间基准） */
        var n = performance.now();
        return (typeof n === 'number' && isFinite(n)) ? n : Date.now();
      }
    : function () { return Date.now(); };

  /* ---------------- 基础工具 ---------------- */

  function clamp(v, a, b) {
    /* NaN 防线：NaN 与任何值比较均为 false，会原样穿透 clamp 污染下游
     * （真机 addColorStop 抛错的源头之一），遇 NaN 统一取下界 */
    if (v !== v) return a;
    return v < a ? a : (v > b ? b : v);
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function spring(v0) { return { x: v0, v: 0, t: v0 }; }
  function springStep(s, w, z, dt) {
    s.v += (-2 * z * w * s.v - w * w * (s.x - s.t)) * dt;
    s.x += s.v * dt;
    if (!isFinite(s.x) || !isFinite(s.v)) { s.x = s.t; s.v = 0; }
  }

  function lerpRing(a, b, t) {
    var out = new Array(a.length);
    for (var i = 0; i < a.length; i++) {
      out[i] = [a[i][0] + (b[i][0] - a[i][0]) * t, a[i][1] + (b[i][1] - a[i][1]) * t];
    }
    return out;
  }

  var BOUNCE_SEGS = [{ h: 48, d: 0.5 }, { h: 28, d: 0.382 }, { h: 14, d: 0.27 }, { h: 6, d: 0.177 }];
  var BOUNCE_TOTAL = BOUNCE_SEGS.reduce(function (s, q) { return s + q.d; }, 0);

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    /* 不用 padStart：ES2017 方法，老内核真机（iOS<11 / 旧 X5）会 TypeError，
     * 导致表情球渲染帧持续报错 */
    function hex2(v) {
      var s = clamp(Math.round(v), 0, 255).toString(16);
      return s.length < 2 ? '0' + s : s;
    }
    return '#' + hex2(r) + hex2(g) + hex2(b);
  }
  function lerpColor(a, b, t) {
    if (a === b) return b;
    var A = hexToRgb(a), B = hexToRgb(b);
    var out = rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
    /* 真机防线：插值因子或输入异常时不产出非法颜色串（目标色兜底） */
    return out.indexOf('NaN') >= 0 ? b : out;
  }

  /* ---------------- Pose ---------------- */

  var DEFAULT_BODY = {
    x: 0, y: 0, scale: 1, rotate: 0, color: '#FFFFFF', breathe: 0.01,
    ribbons: 0, confetti: 0, sketch: 0,
    zzz: 0,
    orbit: 0
  };
  var DEFAULT_EYE = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0, open: 1, color: '#1A1A1A', lookX: 0, lookY: 0 };

  function defaultPose() {
    return {
      body: Object.assign({}, DEFAULT_BODY),
      left: Object.assign({}, DEFAULT_EYE),
      right: Object.assign({}, DEFAULT_EYE)
    };
  }
  function clonePose(p) {
    return {
      body: Object.assign({}, p.body),
      left: Object.assign({}, p.left),
      right: Object.assign({}, p.right)
    };
  }

  function applySpec(pose, spec) {
    if (!spec) return pose;
    if (spec.body) Object.assign(pose.body, spec.body);
    var e = spec.eyes;
    if (e) {
      if (e.both) { Object.assign(pose.left, e.both); Object.assign(pose.right, e.both); }
      if (e.left) Object.assign(pose.left, e.left);
      if (e.right) Object.assign(pose.right, e.right);
    }
    return pose;
  }

  function lerpPose(a, b, t) {
    var out = defaultPose();
    ['body', 'left', 'right'].forEach(function (part) {
      var pa = a[part], pb = b[part], po = out[part];
      for (var k in pb) {
        var vb = pb[k];
        if (typeof vb === 'number') po[k] = lerp(pa[k] != null ? pa[k] : vb, vb, t);
        else if (k === 'color') po[k] = lerpColor(pa[k] || vb, vb, t);
        else po[k] = vb;
      }
    });
    return out;
  }

  /* ---------------- 动画原语 ---------------- */

  var ANIM_TYPES = {
    sine: function (a, t) {
      return a.amp * Math.sin(TAU * t / (a.period || 2000) + (a.phase || 0));
    },
    pulse: function (a, t) {
      return a.amp * 0.5 * (1 - Math.cos(TAU * t / (a.period || 1000) + (a.phase || 0)));
    },
    jitter: function (a, t, eng) {
      var s = t / 1000 * (a.speed || 8);
      var v = (Math.sin(s * 3.1 + eng._seed) +
               Math.sin(s * 5.7 + eng._seed * 2.3) +
               Math.sin(s * 9.3 + eng._seed * 4.1)) / 3 * a.amp;
      if (a.decay) v *= clamp(1 - t / a.decay, 0, 1);
      return v;
    },
    scan: function (a, t) {
      var per = a.period || 800;
      var p = ((t + (a.phaseMs || 0)) % per) / per;
      var tri = p < 0.5 ? p * 4 - 1 : 3 - p * 4;
      return a.amp * tri;
    },
    glance: function (a, t) {
      var per = a.period || 3600;
      var ph = TAU * (((t + (a.phaseMs || 0)) % per) / per) + (a.phase || 0);
      return a.amp * Math.tanh(2.8 * Math.sin(ph));
    },
    blink: function (a, t, eng) {
      var interval = a.interval || 3800, dur = a.dur || 200;
      var p = (t + (a.phaseMs || 0) + (eng ? eng._seed * 97 : 0)) % interval;
      if (p >= dur) return 0;
      return -(a.depth == null ? 1 : a.depth) * Math.sin(Math.PI * (p / dur));
    }
  };

  function applyAnim(pose, a, t, eng) {
    var fn = ANIM_TYPES[a.type];
    if (!fn) return;
    var v = fn(a, t, eng);
    var targets =
      a.target === 'eyes' ? [pose.left, pose.right] :
      a.target === 'body' ? [pose.body] :
      a.target === 'left' ? [pose.left] :
      a.target === 'right' ? [pose.right] : [];
    for (var i = 0; i < targets.length; i++) {
      var tg = targets[i];
      if (a.prop === 'scale') {
        if (tg === pose.body) tg.scale += v;
        else { tg.scaleX += v; tg.scaleY += v; }
      } else if (a.prop in tg) {
        tg[a.prop] += v;
      }
    }
  }

  /* ---------------- 配置注册中心 ---------------- */

  var GROUPS = (EM.GROUPS || [
    { key: 'life', name: '生命周期' },
    { key: 'emotion', name: '情绪反应' },
    { key: 'agent', name: '代理工作状态' },
    { key: 'custom', name: '自定义' }
  ]).slice();

  var registry = {};
  var order = [];

  function knownGroup(g) {
    return GROUPS.some(function (x) { return x.key === g; });
  }

  function validate(raw) {
    var errs = [];
    if (!raw || typeof raw !== 'object') { errs.push('配置必须是对象'); return errs; }
    if (typeof raw.id !== 'string' || !raw.id.trim()) errs.push('缺少合法的字符串 id');
    if (typeof raw.name !== 'string' || !raw.name.trim()) errs.push('缺少 name');
    if (!knownGroup(raw.group)) errs.push('group 不合法：' + raw.group);
    if (raw.anims != null) {
      if (!Array.isArray(raw.anims)) errs.push('anims 必须是数组');
      else raw.anims.forEach(function (a, i) {
        if (!a || !ANIM_TYPES[a.type]) errs.push('anims[' + i + '] 未知动画类型：' + (a && a.type));
      });
    }
    if (raw.sequence != null && !Array.isArray(raw.sequence.frames)) {
      errs.push('sequence.frames 必须是数组');
    }
    return errs;
  }

  function normalize(raw) {
    var base = applySpec(defaultPose(), raw);
    var pool = (raw.pool || [0, 8]).filter(function (i) { return i >= 0 && i < EXPR.length; });
    if (!pool.length) pool = [0];
    var def = {
      id: raw.id, name: raw.name, group: raw.group,
      desc: raw.desc || '',
      en: raw.en || null,
      gaze: raw.gaze !== false,
      transition: raw.transition != null ? raw.transition : 500,
      pool: pool,
      poolMs: raw.poolMs || [9000, 16000],
      poolSpeed: raw.poolSpeed || 6,
      blinkMs: raw.blinkMs !== undefined ? raw.blinkMs : [6000, 14000],
      openness: raw.openness != null ? raw.openness : 1,
      antics: !!raw.antics,
      base: base,
      anims: (raw.anims || []).map(function (a) { return Object.assign({}, a); }),
      sequence: null,
      raw: raw
    };
    if (raw.sequence) {
      var frames = raw.sequence.frames.map(function (f) {
        return { at: f.at || 0, pose: applySpec(clonePose(base), f) };
      }).sort(function (x, y) { return x.at - y.at; });
      def.sequence = { frames: frames, settle: raw.sequence.settle || 'base' };
    }
    return def;
  }

  function register(raw) {
    var errs = validate(raw);
    if (errs.length) return { ok: false, id: raw && raw.id, errors: errs };
    var def = normalize(raw);
    if (!registry[def.id]) order.push(def.id);
    registry[def.id] = def;
    return { ok: true, id: def.id };
  }

  /* ---------------- 全局共享时钟（rAF 注入式） ---------------- */

  var rafFn = null;
  var ticker = {
    set: [],
    raf: 0,
    add: function (e) {
      if (this.set.indexOf(e) < 0) this.set.push(e);
      this._ensure();
    },
    remove: function (e) {
      var i = this.set.indexOf(e);
      if (i >= 0) this.set.splice(i, 1);
    },
    _ensure: function () {
      if (!this.raf && this.set.length && rafFn) {
        this.raf = 1;
        var self = this;
        rafFn(function (now) { self.loop(now); });
      }
    },
    loop: function () {
      /* 统一使用引擎内部时钟：rAF 回调的时间戳在不同宿主下纪元可能不同 */
      ticker.raf = 0;
      var now = nowFn();
      var list = ticker.set.slice();
      for (var i = 0; i < list.length; i++) {
        /* 单帧渲染异常绝不允许打断 rAF 链：链一断画布就停在已清屏的空帧，
         * 观感即"球消失"。拦截后下一帧照常整幅重画，异常上报一次供定位 */
        try {
          list[i]._tick(now);
        } catch (err) {
          ticker._tickErrCount = (ticker._tickErrCount || 0) + 1;
          if (ticker._tickErrCount === 1 || ticker._tickErrCount % 50 === 0) {
            try {
              require("../bootLog.js").reportError(
                "engine:渲染帧异常(已拦截,第" + ticker._tickErrCount + "帧)", err);
            } catch (e) {}
          }
        }
      }
      ticker._ensure();
    }
  };

  /* ---------------- Engine ---------------- */

  function Engine(surface, opts) {
    opts = opts || {};

    this.ball = EB.createBall(surface, Object.assign({}, opts, {
      lite: opts.lite != null ? opts.lite : opts.autostart === false
    }));
    this._seed = Math.random() * 100;
    this._events = {};
    this._gaze = { x: 0, y: 0, tx: 0, ty: 0 };
    this._style = { sketch: 0 };
    this._theme = opts.color
      ? { body: opts.color, eyes: opts.eyeColor || '#FFFFFF' }
      : null;
    this._eyeScale = opts.eyeScale || 1;
    this._lastTick = 0;
    this._spin = null;
    /* 帧时钟：优先用创建方注入的本 canvas rAF（每引擎独立），
     * 未注入时回退全局 ticker（setRaf，兼容旧接入） */
    this._rafFn = typeof opts.raf === 'function' ? opts.raf : null;
    this._framePending = false;

    this._ringSrc = [EXPR[0][0], EXPR[0][1]];
    this._ringDst = [EXPR[0][0], EXPR[0][1]];
    this._ringCur = this._ringDst;
    this._ringSpring = spring(1);
    this._ringSpeed = 7;
    this._exprIdx = 0;
    this._poolPos = 0;
    this._poolNext = 0;
    this._open = spring(1);
    this._blinkQ = [];
    this._blinkNext = Infinity;
    this._anticNext = 0;
    this._bounceAt = -1;

    this._def = null;
    this._lastPose = null;
    this._prevPose = null;
    this._transStart = 0;
    this._transDur = 0;
    this._emoStart = 0;
    this._seq = null;
    this._active = false;
    this._touring = false;
    this._tourTimer = 0;
    this._fallbackId = opts.fallbackId || FALLBACK_ID;
    this._lastActivity = nowFn();

    if (opts.idle) {
      this._idle = Object.assign(
        { standbyAfter: 60000, sleepAfter: 180000, standbyId: '02', sleepId: '00' },
        opts.idle === true ? {} : opts.idle
      );
    } else {
      this._idle = null;
    }

    this.setEmotion(opts.emotion || this._fallbackId, { auto: true });
    if (opts.autostart !== false) this.setActive(true);
    else this.renderStatic();
  }

  Engine.prototype = {

    on: function (evt, cb) {
      (this._events[evt] = this._events[evt] || []).push(cb);
      return this;
    },
    off: function (evt, cb) {
      var list = this._events[evt];
      if (list) {
        var i = list.indexOf(cb);
        if (i >= 0) list.splice(i, 1);
      }
      return this;
    },
    _emit: function (evt, payload) {
      (this._events[evt] || []).slice().forEach(function (cb) {
        try { cb(payload); } catch (e) { console.error(e); }
      });
    },

    emotionId: function () { return this._def ? this._def.id : null; },

    setEmotion: function (id, o) {
      o = o || {};
      var def = EB.config.get(id);
      if (!def) {
        console.warn('[EmotionBall] 未知表情 ID "' + id + '"，回退到待机 (' + this._fallbackId + ')');
        this._emit('error', { message: '未知表情 ID "' + id + '"，已回退待机', id: id });
        def = EB.config.get(this._fallbackId);
        if (!def) return false;
      }
      var now = nowFn();
      var prevId = this._def ? this._def.id : null;
      this._prevPose = this._lastPose ? clonePose(this._lastPose) : null;
      this._def = def;
      this._emoStart = now;
      this._transStart = now;
      this._transDur = this._prevPose ? def.transition : 0;
      this._seq = def.sequence
        ? { frames: def.sequence.frames, settle: def.sequence.settle, done: false }
        : null;
      if (!o.auto) this._lastActivity = now;

      this._poolPos = 0;
      this._setExpr(def.pool[0], def.poolSpeed >= 10 ? 10 : 8);
      this._poolNext = now + rand(def.poolMs[0], def.poolMs[1]);
      if (prevId !== null && prevId !== def.id && def.blinkMs) this._blinkNow(now);
      this._blinkNext = def.blinkMs ? now + rand(def.blinkMs[0], def.blinkMs[1]) : Infinity;
      this._anticNext = now + rand(2500, 5000);

      this._emit('change', { id: def.id, def: def, auto: !!o.auto });
      var fx = def.base.body;
      if (this._active) {
        if (fx.ribbons > 0) this.spin(fx.ribbons >= 1 ? 2 : 1);
        if (fx.confetti > 0) this.burst(20);
      }
      if (!this._active) this.renderStatic();
      return true;
    },

    handleAIMessage: function (msg) {
      var obj = msg;
      if (typeof msg === 'string') {
        try { obj = JSON.parse(msg); }
        catch (e) {
          this._emit('error', { message: 'AI 消息 JSON 解析失败，已回退待机', raw: msg });
          this.setEmotion(this._fallbackId);
          return false;
        }
      }
      if (!obj || typeof obj !== 'object' || typeof obj.emotionId !== 'string') {
        this._emit('error', { message: 'AI 消息缺少 emotionId 字段，已回退待机', raw: msg });
        this.setEmotion(this._fallbackId);
        return false;
      }
      var ok = this.setEmotion(obj.emotionId);
      if (obj.tips) this._emit('tips', { text: String(obj.tips) });
      return ok;
    },

    startTour: function (ids, interval) {
      this.stopTour();
      if (!ids || !ids.length) return;
      interval = interval || 2500;
      this._touring = true;
      var self = this, i = 0;
      this.setEmotion(ids[0], { auto: true });
      this._tourTimer = setInterval(function () {
        i = (i + 1) % ids.length;
        self.setEmotion(ids[i], { auto: true });
      }, interval);
    },
    stopTour: function () {
      if (this._tourTimer) { clearInterval(this._tourTimer); this._tourTimer = 0; }
      this._touring = false;
      this._lastActivity = nowFn();
    },

    resetIdle: function () { this._lastActivity = nowFn(); },

    setGaze: function (nx, ny) {
      this._gaze.tx = clamp(nx, -1, 1) * 24;
      this._gaze.ty = clamp(ny, -1, 1) * 15;
      return this;
    },
    clearGaze: function () {
      this._gaze.tx = 0;
      this._gaze.ty = 0;
      return this;
    },
    setStyle: function (style) {
      Object.assign(this._style, style || {});
      if (!this._active) this.renderStatic();
      return this;
    },

    spin: function (turns, dir) {
      if (this._spin) return this;
      var d = dir || (Math.random() < 0.5 ? -1 : 1);
      this._spin = { x: 0, v: 0, t: Math.max(1, Math.round(turns || 1)) * TAU * d };
      return this;
    },
    burst: function (count) {
      if (this.ball.burst) this.ball.burst(count);
      return this;
    },
    bounce: function () {
      if (this._bounceAt < 0) this._bounceAt = nowFn();
      return this;
    },

    _setExpr: function (idx, speed) {
      if (idx === this._exprIdx && this._ringSpring.x >= 0.999) return;
      var s = clamp(this._ringSpring.x, 0, 1);
      this._ringSrc = [
        lerpRing(this._ringSrc[0], this._ringDst[0], s),
        lerpRing(this._ringSrc[1], this._ringDst[1], s)
      ];
      this._ringDst = [EXPR[idx][0], EXPR[idx][1]];
      this._ringSpring.x = 0;
      this._ringSpring.v = 0;
      this._ringSpring.t = 1;
      this._ringSpeed = speed || 7;
      this._exprIdx = idx;
    },

    _blinkNow: function (t) {
      this._blinkQ.push(
        { at: t, v: 0.05 }, { at: t + 70, v: 0.05 },
        { at: t + 150, v: 1.08 }, { at: t + 300, v: 1 }
      );
      if (Math.random() < 0.14) {
        this._blinkQ.push({ at: t + 370, v: 0.05 }, { at: t + 480, v: 1 });
      }
    },

    registerEmotion: function (raw) { return EB.config.register(raw); },

    setActive: function (on) {
      if (on === this._active) return;
      this._active = on;
      if (this._rafFn) {
        /* 本 canvas 时钟：激活即自调度，停用由下一帧自查退出 */
        if (on) this._scheduleFrame();
      } else if (on) {
        ticker.add(this);
      } else {
        ticker.remove(this);
      }
    },

    /* 每引擎独立帧循环：时钟绑在自己的 canvas 上，页面隐藏/卸载只停掉
     * 自己的帧，不影响其他页面引擎。不能共享全局时钟——rafFn 永远指向
     * "最后注册"的 canvas，该 canvas 所在页一隐藏/卸载，全局循环停摆，
     * 所有引擎集体停帧（真机表现为球隐身但可点，且无法自愈） */
    _scheduleFrame: function () {
      var self = this;
      if (this._framePending) return;
      this._framePending = true;
      var step = function () {
        self._framePending = false;
        if (!self._active) return;
        /* 单帧渲染异常不允许打断本引擎的帧链：链一断画布停在已清屏的
         * 空帧，观感即"球消失"。拦截后下一帧照常整幅重画，异常上报
         * （首次 + 每 50 次）供定位真凶 */
        try {
          self._tick(nowFn());
        } catch (err) {
          self._tickErrCount = (self._tickErrCount || 0) + 1;
          if (self._tickErrCount === 1 || self._tickErrCount % 50 === 0) {
            try {
              require("../bootLog.js").reportError(
                "engine:渲染帧异常(已拦截,第" + self._tickErrCount + "帧)", err);
            } catch (e) {}
          }
        }
        if (self._active) self._scheduleFrame();
      };
      this._rafFn(step);
    },

    /* 像素级淡入淡出（同层 canvas 在部分内核不吃祖先 CSS opacity，
     * 淡入淡出只能由引擎画进位图，见 ball-canvas 的 setFade） */
    setFade: function (v) {
      if (this.ball && this.ball.setFade) this.ball.setFade(v);
    },
    replay: function () {
      if (this._def) this.setEmotion(this._def.id, { auto: true });
    },
    renderStatic: function () {
      this._transDur = 0;
      this._ringSpring.x = 1;
      this._ringSpring.v = 0;
      this._open.x = this._def ? this._def.openness : 1;
      this._open.v = 0;
      var seq = this._seq;
      this._seq = null;
      /* setEmotion 的同步首帧：点击换表情的调用入口在此，异常就地拦截，
       * 不向页面点击处理器扩散（帧循环另有各自的拦截） */
      try {
        this._tick(nowFn());
      } catch (err) {
        try {
          require("../bootLog.js").reportError("engine:setEmotion首帧异常(已拦截)", err);
        } catch (e) {}
      }
      this._seq = seq;
    },
    destroy: function () {
      this.stopTour();
      this.setActive(false);
      this._events = {};
      this.ball.destroy();
    },

    _tick: function (now) {
      this._dt = this._lastTick ? clamp((now - this._lastTick) / 1000, 0.001, 0.05) : 1 / 60;
      this._lastTick = now;
      if (this._idle && !this._touring) this._checkIdle(now);
      var pose = this._compose(now, 0);
      this.ball.applyPose(pose);
      this._lastPose = pose;
    },

    _checkIdle: function (now) {
      var idle = this._idle;
      var elapsed = now - this._lastActivity;
      var cur = this.emotionId();
      if (elapsed >= idle.sleepAfter) {
        if (cur !== idle.sleepId) this.setEmotion(idle.sleepId, { auto: true });
      } else if (elapsed >= idle.standbyAfter) {
        if (cur !== idle.standbyId && cur !== idle.sleepId) {
          this.setEmotion(idle.standbyId, { auto: true });
        }
      }
    },

    _compose: function (now, depth) {
      var def = this._def;
      var t = now - this._emoStart;
      var pose;

      if (this._seq) {
        var res = this._seqPose(t, now);
        if (res === 'switch') {
          return depth < 4 ? this._compose(now, depth + 1) : clonePose(this._def.base);
        }
        pose = res || clonePose(def.base);
      } else {
        pose = clonePose(def.base);
      }

      var br = pose.body.breathe || 0;
      if (br) {
        var ph = TAU * now / 3600;
        pose.body.scale += br * Math.sin(ph);
        pose.body.y += br * 55 * Math.sin(ph + 0.6);
      }

      for (var i = 0; i < def.anims.length; i++) applyAnim(pose, def.anims[i], t, this);

      pose.body.sketch = Math.max(pose.body.sketch || 0, this._style.sketch || 0);

      var dt = this._dt || 1 / 60;

      if (this._active && now >= this._poolNext) {
        if (def.pool.length > 1) {
          this._poolPos = (this._poolPos + 1 + Math.floor(rand(0, def.pool.length - 1))) % def.pool.length;
          this._setExpr(def.pool[this._poolPos], def.poolSpeed);
        }
        this._poolNext = now + rand(def.poolMs[0], def.poolMs[1]);
      }

      if (this._active && def.blinkMs && now >= this._blinkNext) {
        this._blinkNow(now);
        this._blinkNext = now + rand(def.blinkMs[0], def.blinkMs[1]);
      }
      var openKey = null;
      while (this._blinkQ.length && now >= this._blinkQ[0].at) {
        openKey = this._blinkQ[0].v;
        this._blinkQ.shift();
      }
      this._open.t = openKey != null ? openKey : (this._blinkQ.length ? this._open.t : def.openness);

      if (this._active && def.antics && now >= this._anticNext) {
        if (!this._spin && this._bounceAt < 0) {
          var pick = Math.random();
          if (pick < 0.45) this.spin(1);
          else if (pick < 0.8) this.bounce();
          else this._blinkNow(now);
        }
        this._anticNext = now + rand(9000, 18000);
      }

      var steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      var j = dt / steps;
      for (var si = 0; si < steps; si++) {
        springStep(this._ringSpring, this._ringSpeed, 1, j);
        springStep(this._open, 26, 1, j);
        if (this._spin) {
          springStep(this._spin, 6.2, 1, j);
          if (Math.abs(this._spin.t - this._spin.x) < 0.01 && Math.abs(this._spin.v) < 0.05) {
            this._spin = null;
          }
        }
      }
      pose.body.yaw = this._spin ? this._spin.x : 0;

      if (this._bounceAt >= 0) {
        var be = (now - this._bounceAt) / 1000;
        if (be >= BOUNCE_TOTAL) {
          this._bounceAt = -1;
        } else {
          var acc = 0, bi = 0;
          while (bi < BOUNCE_SEGS.length && be >= acc + BOUNCE_SEGS[bi].d) { acc += BOUNCE_SEGS[bi].d; bi++; }
          var seg = BOUNCE_SEGS[Math.min(bi, BOUNCE_SEGS.length - 1)];
          var bn = (be - acc) / seg.d;
          pose.body.y += -4 * seg.h * bn * (1 - bn);
        }
      }

      if (this._ringSpring.x < 0.999 || this._ringSpring.v > 0.001 || this._ringSpring.v < -0.001) {
        var rs = clamp(this._ringSpring.x, 0, 1.35);
        this._ringCur = [
          lerpRing(this._ringSrc[0], this._ringDst[0], rs),
          lerpRing(this._ringSrc[1], this._ringDst[1], rs)
        ];
      } else if (this._ringCur !== this._ringDst) {
        this._ringCur = this._ringDst;
      }
      pose.left.ring = this._ringCur[0];
      pose.right.ring = this._ringCur[1];

      var k = 1 - Math.exp(-5.66 * dt);
      var gx = def.gaze !== false ? this._gaze.tx : 0;
      var gy = def.gaze !== false ? this._gaze.ty : 0;
      this._gaze.x += (gx - this._gaze.x) * k;
      this._gaze.y += (gy - this._gaze.y) * k;
      pose.left.lookX += this._gaze.x;
      pose.right.lookX += this._gaze.x;
      pose.left.lookY += this._gaze.y;
      pose.right.lookY += this._gaze.y;

      if (def.gaze !== false) {
        var w = now / 1000;
        pose.left.lookX += 1.4 * Math.sin(0.42 * w) + 0.5 * Math.sin(1.0 * w);
        pose.right.lookX += 1.4 * Math.sin(0.42 * w + 1) + 0.5 * Math.sin(1.0 * w + 2);
        pose.left.lookY += 0.9 * Math.sin(0.58 * w);
        pose.right.lookY += 0.9 * Math.sin(0.58 * w + 1);
      }

      if (this._eyeScale !== 1) {
        pose.left.scaleX *= this._eyeScale;
        pose.left.scaleY *= this._eyeScale;
        pose.right.scaleX *= this._eyeScale;
        pose.right.scaleY *= this._eyeScale;
      }

      if (this._theme) {
        pose.body.color = this._theme.body;
        if (pose.left.color === DEFAULT_EYE.color) pose.left.color = this._theme.eyes;
        if (pose.right.color === DEFAULT_EYE.color) pose.right.color = this._theme.eyes;
      }

      var openS = clamp(this._open.x, 0.02, 1.5);
      pose.left.open = clamp(pose.left.open, 0, 1.3) * openS;
      pose.right.open = clamp(pose.right.open, 0, 1.3) * openS;
      pose.left.scaleX = Math.max(pose.left.scaleX, 0.05);
      pose.left.scaleY = Math.max(pose.left.scaleY, 0.05);
      pose.right.scaleX = Math.max(pose.right.scaleX, 0.05);
      pose.right.scaleY = Math.max(pose.right.scaleY, 0.05);

      var tt = now - this._transStart;
      if (this._transDur > 0 && tt < this._transDur && this._prevPose) {
        pose = lerpPose(this._prevPose, pose, easeInOutCubic(tt / this._transDur));
      }
      return pose;
    },

    _seqPose: function (t, now) {
      var seq = this._seq;
      var frames = seq.frames;
      var last = frames[frames.length - 1];

      if (t >= last.at) {
        if (!seq.done) {
          seq.done = true;
          var s = seq.settle;
          if (s === 'base') {
            this._prevPose = this._lastPose ? clonePose(this._lastPose) : clonePose(last.pose);
            this._transStart = now;
            this._transDur = this._def.transition || 500;
            this._seq = null;
            return null;
          }
          if (s && typeof s === 'object' && s.next) {
            this.setEmotion(s.next, { auto: true });
            return 'switch';
          }
        }
        return clonePose(last.pose);
      }

      if (t <= frames[0].at) return clonePose(frames[0].pose);
      for (var i = 0; i < frames.length - 1; i++) {
        var a = frames[i], b = frames[i + 1];
        if (t >= a.at && t < b.at) {
          var k = easeInOutCubic((t - a.at) / (b.at - a.at));
          return lerpPose(a.pose, b.pose, k);
        }
      }
      return clonePose(last.pose);
    }
  };

  /* ---------------- 对外入口 ---------------- */

  var EB = {
    version: '1.0.0-miniprogram',
    createBall: canvasBall.createBall,
    create: function (surface, opts) { return new Engine(surface, opts); },
    setRaf: function (fn) {
      rafFn = fn;
      ticker._ensure();
    },
    config: {
      register: register,
      get: function (id) { return registry[id] || null; },
      list: function (group) {
        return order.map(function (id) { return registry[id]; })
          .filter(function (d) { return !group || d.group === group; });
      },
      groups: function () {
        return GROUPS.map(function (g) { return { key: g.key, name: g.name }; });
      }
    }
  };

  /* 载入种子配置 */
  EM.SEED.forEach(function (raw) {
    var r = register(raw);
    if (!r.ok) console.warn('[EmotionBall] 种子配置无效：', r.id, r.errors);
  });

  /* 载入本应用的自定义表情（50+ 段：首页"看向按钮"系列） */
  try {
    require("../pet/glanceEmotions.js").forEach(function (raw) {
      var r = register(raw);
      if (!r.ok) console.warn('[EmotionBall] 自定义配置无效：', r.id, r.errors);
    });
  } catch (e) { /* glanceEmotions 缺失时忽略，不影响基础表情 */ }

  module.exports = EB;
})();
