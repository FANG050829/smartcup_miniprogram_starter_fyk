/* ============================================================
 * geometry.js —— 参数化轮廓生成库（小程序移植版）
 * 移植自开源项目 mood-mates 的 geometry.js
 * (github.com/sam70361/aora-bot 的 mood-mates 目录，
 *  社区许可：个人学习研究免费；本文件为等义移植，算法与参数不变)
 *
 * 所有身体剪影与眼形轮廓均由参数化函数实时生成（无任何图片资源）。
 *
 * 坐标系：viewBox 0 0 240 240，头部中心 C = 120，基准半径 104
 *
 * 两类轮廓：
 *   身体环 BODY：96 点闭合折线，由径向函数 r(θ) 或参数曲线生成
 *   眼环   EYE ：48 点闭合折线，统一 lens（双缘包络）拓扑 ——
 *               中轴线 mid(u) + 厚度包络 halfThick(u) 上下缘各 24 点，
 *               所有眼形槽位共享同一拓扑，逐点插值形变天然连贯
 * ============================================================ */
(function () {
  'use strict';

  var TAU = Math.PI * 2;

  var C = 120;          /* 头部中心 */
  var R = 104;          /* 身体基准半径 */
  var BODY_N = 96;      /* 身体环点数 */
  var EYE_N = 48;       /* 眼环点数（上下缘各 24） */

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function r2(v) { return Math.round(v * 100) / 100; }

  /* ---------------- 身体环：径向函数采样 ----------------
   * radialFn(theta) 返回该方向上的半径（θ = 0 朝右，顺时针，屏幕坐标系）*/
  function sampleRadial(radialFn, opts) {
    opts = opts || {};
    var cx = opts.cx != null ? opts.cx : C;
    var cy = opts.cy != null ? opts.cy : C;
    var rot = opts.rot || 0;
    var ring = [];
    for (var i = 0; i < BODY_N; i++) {
      var th = TAU * i / BODY_N - Math.PI / 2 + rot;   /* 从正上方起步 */
      var r = radialFn(th);
      ring.push([r2(cx + r * Math.cos(th)), r2(cy + r * Math.sin(th))]);
    }
    return ring;
  }

  /* 平滑周期凸起：在 center 角附近宽 width 的钟形隆起（0~1） */
  function bump(th, center, width) {
    var d = Math.atan2(Math.sin(th - center), Math.cos(th - center));
    var x = clamp(1 - Math.abs(d) / width, 0, 1);
    return x * x * (3 - 2 * x);
  }

  var BODY_GEN = {
    /** 云朵：波浪扇贝边（lobes 花瓣数，amp 波幅） */
    cloud: function (p) {
      p = p || {};
      var base = (p.r || 0.98) * R;
      var lobes = p.lobes || 7;
      var amp = p.amp != null ? p.amp : 0.075;
      var flat = p.flat != null ? p.flat : 0.10;
      return sampleRadial(function (th) {
        var scallop = Math.pow(Math.abs(Math.sin(lobes * th / 2)), 1.4);
        /* 底部收平一点，像坐在地上的云 */
        var seat = 1 - flat * Math.pow(Math.max(0, Math.sin(th)), 3);
        return base * seat * (1 + amp * scallop);
      }, p);
    },

    /** 圆角星：points 角数，sharp 尖锐度（0 圆 ~ 1 尖），inner 内径比 */
    star: function (p) {
      p = p || {};
      var outer = (p.r || 1.04) * R;
      var inner = outer * (p.inner != null ? p.inner : 0.72);
      var pts = p.points || 5;
      var k = 1 + 3 * (p.sharp != null ? p.sharp : 0.55);
      return sampleRadial(function (th) {
        var w = Math.pow(0.5 + 0.5 * Math.cos(pts * (th + Math.PI / 2)), k);
        return inner + (outer - inner) * w;
      }, p);
    },

    /** 通用鼓包圆（备用 / 二次开发起点）：谐波扰动圆 */
    puff: function (p) {
      p = p || {};
      var base = (p.r || 1) * R;
      var waves = p.waves || [];
      return sampleRadial(function (th) {
        var v = 1;
        for (var i = 0; i < waves.length; i++) {
          var w = waves[i];
          v += (w.amp || 0) * Math.sin((w.k || 2) * th + (w.phase || 0));
        }
        return base * v;
      }, p);
    }
  };

  /** 生成身体环：desc = { type, ...params } */
  function buildBody(desc) {
    var gen = BODY_GEN[desc.type];
    if (!gen) throw new Error('[MoodMates] 未知身体生成器：' + desc.type);
    return gen(desc);
  }

  /* ---------------- 眼环：lens 双缘包络拓扑 ----------------
   * 参数（均为相对眼睛盒子的比例）：
   *   w, h      眼宽 / 眼高（绝对 px）
   *   bend      中轴弯曲：>0 上拱（笑眼 ∩），<0 下垂
   *   slope     中轴斜率：>0 外高内低（配合 mirror 表达怒 / 哀）
   *   taper     厚度端部收尖指数（0.3 圆角矩形感 ~ 2.5 两端极尖）
   *   shift     厚度重心偏移：>0 下缘更鼓，<0 上缘更鼓
   *   tilt      整体旋转（度）
   * mirror = -1 时水平镜像（右眼），slope / tilt 自动反向 */
  function lens(cx, cy, o, mirror) {
    mirror = mirror || 1;
    var w = o.w, h = o.h;
    var bend = (o.bend || 0) * h;
    var slope = (o.slope || 0) * h * mirror;
    var taper = o.taper != null ? o.taper : 0.55;
    var shift = o.shift || 0;
    var tiltRad = (o.tilt || 0) * Math.PI / 180 * mirror;

    /* 闭合曲线参数化采样：φ 绕行一周，u = (1-cosφ)/2 令采样点自然向两端加密；
     * 上下缘在端点汇合为「单点」——端部密采样 + 无重复点 → 端帽圆润 */
    var ring = [];
    var cs = Math.cos(tiltRad), sn = Math.sin(tiltRad);
    for (var k = 0; k < EYE_N; k++) {
      var phi = TAU * k / EYE_N;
      var u = (1 - Math.cos(phi)) / 2;           /* 0 左端 → 1 右端 → 折回 */
      var x = (u - 0.5) * w * mirror;
      var arch = Math.sin(Math.PI * u);          /* 端点 0，中间 1 */
      var mid = -bend * arch + slope * (u - 0.5);
      var th = (h / 2) * Math.pow(arch, taper);
      /* φ ∈ (0,π) 走上缘，(π,2π) 走下缘 */
      var y = Math.sin(phi) >= 0 ? mid - th * (1 - shift) : mid + th * (1 + shift);
      ring.push([r2(cx + x * cs - y * sn), r2(cy + x * sn + y * cs)]);
    }
    return ring;
  }

  /* ---------------- 眼形语义槽位 ----------------
   * 每个槽位是 style（角色眼型基调）→ lens 参数的映射。
   * style: { w, h, taper, tilt, bend } 角色级默认值 */
  var EYE_SLOTS = {
    /* 平静注视 */
    calm:    function (s) { return { w: s.w, h: s.h, bend: s.bend, taper: s.taper, tilt: s.tilt }; },
    calm2:   function (s) { return { w: s.w * 0.96, h: s.h * 1.05, bend: s.bend + 0.04, taper: s.taper, tilt: s.tilt }; },
    /* 应用侧调整：原 ∩ 拱形笑眼在小尺寸渲染下观感似倒三角，
     * 改为椭圆眼（大小两档供表情池轮换，弯拱细节交给嘴形与腮红表达） */
    happy:   function (s) { return { w: s.w * 0.95, h: s.h * 0.78, bend: 0, taper: 0.5, tilt: s.tilt }; },
    happy2:  function (s) { return { w: s.w * 0.86, h: s.h * 0.62, bend: 0, taper: 0.5, tilt: s.tilt }; },
    /* 圆睁 */
    wide:    function (s) { return { w: s.w * 1.12, h: s.h * 1.3, bend: 0, taper: Math.max(s.taper * 0.8, 0.3), tilt: 0 }; },
    wide2:   function (s) { return { w: s.w * 1.05, h: s.h * 1.42, bend: 0.05, taper: Math.max(s.taper * 0.7, 0.3), tilt: 0 }; },
    /* 闭合 / 困倦 */
    closed:  function (s) { return { w: s.w * 0.95, h: s.h * 0.12, bend: -0.25, taper: 0.9, tilt: s.tilt }; },
    closed2: function (s) { return { w: s.w * 0.9, h: s.h * 0.1, bend: 0.2, taper: 0.9, tilt: s.tilt }; },
    /* 闭 / 困倦：保留近闭合线语义，仅略抬眼高、圆化端部 */
    sleepy:  function (s) { return { w: s.w, h: s.h * 0.4, bend: -0.2, taper: 0.55, shift: 0.3, tilt: s.tilt }; },
    /* 轻眯眼 / 困惑 / 无奈：全族椭圆化 —— 极弱 slope + 低 taper（圆润端部），
     * 语义只保留「两眼大小不一」与极轻的方向性，整体读作斜斜的椭圆 */
    squint:  function (s) { return { w: s.w, h: s.h * 0.64, bend: 0.07, slope: 0.05, taper: 0.45, tilt: s.tilt }; },
    squint2: function (s) { return { w: s.w * 0.88, h: s.h * 0.56, bend: 0.04, slope: 0.04, taper: 0.45, tilt: s.tilt + 2 }; },
    /* 怒目：内低外高降为轻斜，靠 shift 下坠感保留怒意，形状更接近椭圆 */
    angry:   function (s) { return { w: s.w * 1.02, h: s.h * 0.76, bend: 0.08, slope: -0.3, taper: 0.5, shift: 0.28, tilt: s.tilt }; },
    angry2:  function (s) { return { w: s.w * 0.98, h: s.h * 0.68, bend: 0.04, slope: -0.38, taper: 0.55, shift: 0.32, tilt: s.tilt }; },
    /* 扫读：仍比圆眼宽（阅读语义），但由横条收成扁椭圆 */
    scan:    function (s) { return { w: s.w * 1.16, h: s.h * 0.56, bend: 0, taper: 0.42, tilt: 0 }; },
    scan2:   function (s) { return { w: s.w * 1.08, h: s.h * 0.62, bend: 0.05, taper: 0.45, tilt: 0 }; },
    scan3:   function (s) { return { w: s.w * 1.22, h: s.h * 0.48, bend: -0.04, taper: 0.4, tilt: 0 }; },
    /* 聆听：窄高竖圆 */
    listen:  function (s) { return { w: s.w * 0.78, h: s.h * 1.18, bend: 0, taper: Math.max(s.taper * 0.85, 0.35), tilt: 0 }; },
    listen2: function (s) { return { w: s.w * 0.72, h: s.h * 1.08, bend: 0.08, taper: Math.max(s.taper * 0.85, 0.35), tilt: s.tilt }; },
    /* 羞怯：下垂微闭弱化为轻垂椭圆 */
    shy:     function (s) { return { w: s.w * 0.92, h: s.h * 0.66, bend: -0.08, slope: 0.1, taper: 0.6, tilt: s.tilt + 3 }; },
    /* 哀伤：外低内高保留方向语义，斜率减半成轻垂椭圆 */
    sad:     function (s) { return { w: s.w * 0.95, h: s.h * 0.68, bend: -0.05, slope: 0.24, taper: 0.6, tilt: s.tilt }; }
  };

  /** 生成一对眼环（含左右镜像）
   *  style: { dx, cy, w, h, taper, tilt, bend } —— dx 为眼心到面部中线的距离 */
  function buildEyePair(slotName, style) {
    var slotFn = EYE_SLOTS[slotName];
    if (!slotFn) throw new Error('[MoodMates] 未知眼形槽位：' + slotName);
    var o = slotFn(style);
    var L = lens(C - style.dx, style.cy, o, 1);
    var Rr = lens(C + style.dx, style.cy, o, -1);
    return [L, Rr];
  }

  /** 生成一套完整眼环族：slotName → [左, 右] */
  function buildEyeFamily(style) {
    var fam = {};
    for (var name in EYE_SLOTS) fam[name] = buildEyePair(name, style);
    return fam;
  }

  /* ---------------- 嘴巴：同 lens 拓扑（24 点小环） ----------------
   * 槽位含闭合线形嘴与张开圆嘴，共享拓扑可自由形变 */
  var MOUTH_N = 24;

  function mouthLens(o) {
    var w = o.w, h = o.h;
    var bend = (o.bend || 0) * Math.max(h, 4);
    var taper = o.taper != null ? o.taper : 0.8;
    /* 与 lens 同款闭合参数化：端点单点汇合 + 端部密采样，嘴角圆润 */
    var ring = [];
    for (var k = 0; k < MOUTH_N; k++) {
      var phi = TAU * k / MOUTH_N;
      var u = (1 - Math.cos(phi)) / 2;
      var x = (u - 0.5) * w;
      var arch = Math.sin(Math.PI * u);
      var mid = -bend * arch;
      var th = (h / 2) * Math.pow(arch, taper);
      var y = Math.sin(phi) >= 0 ? mid - th : mid + th;
      ring.push([r2(x), r2(y)]);
    }
    return ring;
  }

  /* base: { w } —— 角色嘴宽基准；槽位内高度 / 弯曲写死为语义 */
  var MOUTH_SLOTS = {
    smile:  function (b) { return mouthLens({ w: b.w, h: 3.2, bend: -0.9, taper: 0.9 }); },
    grin:   function (b) { return mouthLens({ w: b.w * 1.25, h: 11, bend: -0.55, taper: 0.6 }); },
    o:      function (b) { return mouthLens({ w: b.w * 0.5, h: b.w * 0.52, bend: 0, taper: 0.4 }); },
    flat:   function (b) { return mouthLens({ w: b.w * 0.8, h: 2.6, bend: 0, taper: 0.9 }); },
    frown:  function (b) { return mouthLens({ w: b.w * 0.85, h: 3, bend: 0.85, taper: 0.9 }); },
    wavy:   function (b) { return mouthLens({ w: b.w, h: 3, bend: -0.15, taper: 0.5 }); },
    pout:   function (b) { return mouthLens({ w: b.w * 0.42, h: 3.4, bend: 0.5, taper: 0.5 }); },
    open:   function (b) { return mouthLens({ w: b.w * 0.72, h: b.w * 0.5, bend: -0.25, taper: 0.45 }); },
    dot:    function (b) { return mouthLens({ w: b.w * 0.2, h: b.w * 0.18, bend: 0, taper: 0.4 }); }
  };

  function buildMouth(slotName, base) {
    var fn = MOUTH_SLOTS[slotName] || MOUTH_SLOTS.flat;
    return fn(base);
  }

  /* ---------------- 自定义轮廓（每表情专属轮廓组入口） ----------------
   * 角色可在 eyeShapes / mouthShapes 里用原始 lens 参数定义专属轮廓，
   * 表情覆盖的 pool / mouth 即可引用这些自定义名字 */

  /** 自定义眼形对：o 为原始 lens 参数（w/h/bend/slope/taper/shift/tilt），
   *  位置沿用角色 style 的 dx / cy */
  function buildCustomEyePair(o, style) {
    var merged = Object.assign({ w: style.w, h: style.h, taper: style.taper, tilt: style.tilt, bend: style.bend }, o);
    return [lens(C - style.dx, style.cy, merged, 1), lens(C + style.dx, style.cy, merged, -1)];
  }

  /** 自定义嘴形：o 为原始 mouthLens 参数（w/h/bend/taper） */
  function buildCustomMouth(o) {
    return mouthLens(Object.assign({ w: 24, h: 3, bend: 0, taper: 0.8 }, o));
  }

  module.exports = {
    C: C,
    R: R,
    BODY_N: BODY_N,
    EYE_N: EYE_N,
    MOUTH_N: MOUTH_N,
    buildBody: buildBody,
    buildEyePair: buildEyePair,
    buildEyeFamily: buildEyeFamily,
    buildMouth: buildMouth,
    buildCustomEyePair: buildCustomEyePair,
    buildCustomMouth: buildCustomMouth,
    eyeSlots: Object.keys(EYE_SLOTS),
    mouthSlots: Object.keys(MOUTH_SLOTS),
    bodyTypes: Object.keys(BODY_GEN),
    lens: lens,
    sampleRadial: sampleRadial
  };
})();
