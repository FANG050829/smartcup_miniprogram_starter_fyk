/* ============================================================
 * renderer.js —— 渲染层（Canvas 2D 版）
 * 等义移植自 mood-mates 的 render.js + features.js + fx.js（SVG 渲染层）
 * (github.com/sam70361/aora-bot 的 mood-mates 目录，
 *  社区许可：个人学习研究免费；本文件为面向微信小程序 Canvas 的重写)
 *
 *   坐标系：viewBox 0 0 240 240，头部中心 C = 120
 *   渲染流程与层级顺序与 SVG 版逐层对应：
 *     地面软投影 → 背层特效 → 身体组[身体渐变 → 釉面高光(裁剪)
 *     → 底部环境光遮蔽 → 腮红 → 眼睛(bean/iris 两模式) → 嘴/配饰] → 前层特效
 *   轮廓环全部走 Catmull-Rom → 三次贝塞尔（与 SVG ringPath 同系数），
 *   任意 DPR 下边缘矢量圆润（清晰度由画布物理分辨率保证）
 * ============================================================ */
(function () {
  'use strict';

  var GEO = require("./geometry.js");
  var C = GEO.C;
  var TAU = Math.PI * 2;

  function r2(v) { return Math.round(v * 100) / 100; }
  function clamp(v, a, b) {
    /* NaN 防线：NaN 比较恒为 false 会原样穿透，污染几何与颜色计算 */
    if (v !== v) return a;
    return v < a ? a : (v > b ? b : v);
  }
  function rand(a, b) { return a + Math.random() * (b - a); }

  /* 渐变停点统一入口：真机内核对 addColorStop 的参数校验差异很大，
   * 钳位 offset、校验颜色，内核仍拒绝时静默放弃该停点——
   * 停点缺一两个只是色彩略偏，绝不允许炸掉帧循环 */
  function addStop(grad, offset, color) {
    try {
      var o = Number(offset);
      if (!isFinite(o)) o = 0;
      o = o < 0 ? 0 : (o > 1 ? 1 : o);
      if (typeof color !== 'string' || color.indexOf('NaN') >= 0) color = '#FFFFFF';
      grad.addColorStop(o, color);
    } catch (e) {}
  }

  function shade(hex, amt) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var target = amt < 0 ? 0 : 255;
    var a = Math.abs(amt);
    r = Math.round(r + (target - r) * a);
    g = Math.round(g + (target - g) * a);
    b = Math.round(b + (target - b) * a);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  function centroid(ring) {
    var x = 0, y = 0;
    for (var i = 0; i < ring.length; i++) { x += ring[i][0]; y += ring[i][1]; }
    return [x / ring.length, y / ring.length];
  }

  /* 轮廓环 → 平滑闭合路径（Catmull-Rom → 三次贝塞尔，与 SVG ringPath 同系数） */
  function traceRingSmooth(ctx, ring) {
    var n = ring.length;
    ctx.beginPath();
    if (n < 3) { ctx.moveTo(0, 0); ctx.lineTo(1, 1); return; }
    ctx.moveTo(ring[0][0], ring[0][1]);
    for (var i = 0; i < n; i++) {
      var p0 = ring[(i - 1 + n) % n];
      var p1 = ring[i];
      var p2 = ring[(i + 1) % n];
      var p3 = ring[(i + 2) % n];
      ctx.bezierCurveTo(
        p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
        p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
        p2[0], p2[1]);
    }
    ctx.closePath();
  }

  /* 轮廓环 → 折线闭合路径（fx 里的 ringD 同款直边） */
  function traceRingPoly(ctx, ring) {
    ctx.beginPath();
    for (var i = 0; i < ring.length; i++) {
      if (i === 0) ctx.moveTo(ring[i][0], ring[i][1]);
      else ctx.lineTo(ring[i][0], ring[i][1]);
    }
    ctx.closePath();
  }

  function ringBBox(ring) {
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (var i = 0; i < ring.length; i++) {
      var p = ring[i];
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY, w: maxX - minX, h: maxY - minY };
  }

  /* 轮廓实际厚度 = 鞋带面积 / 包围盒宽度（拱形笑眼盒高但薄，用厚度判定闭合感） */
  function ringThickness(ring) {
    var area = 0, minX = 1e9, maxX = -1e9;
    for (var i = 0; i < ring.length; i++) {
      var a = ring[i], b = ring[(i + 1) % ring.length];
      area += a[0] * b[1] - b[0] * a[1];
      if (a[0] < minX) minX = a[0];
      if (a[0] > maxX) maxX = a[0];
    }
    var w = Math.max(maxX - minX, 1);
    return Math.abs(area) / 2 / w;
  }

  /* 盒子过窄时取中点，避免 inset 后 lo > hi */
  function clampIn(v, lo, hi) {
    if (lo > hi) return (lo + hi) / 2;
    return clamp(v, lo, hi);
  }

  /* 椭圆路径（不用 ctx.ellipse：老内核兼容） */
  function pathEllipse(ctx, rx, ry) {
    ctx.save();
    ctx.scale(rx, ry);
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.restore();
  }

  /* ---------------- 通用小形状 ---------------- */

  /* 四芒星（fx.js SPARK_PATH 同系数） */
  function pathSpark(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.bezierCurveTo(0.12, -0.22, 0.22, -0.12, 1, 0);
    ctx.bezierCurveTo(0.22, 0.12, 0.12, 0.22, 0, 1);
    ctx.bezierCurveTo(-0.12, 0.22, -0.22, 0.12, -1, 0);
    ctx.bezierCurveTo(-0.22, -0.12, -0.12, -0.22, 0, -1);
    ctx.closePath();
  }

  /* 五角星（fx.js STAR_PATH 同系数） */
  var STAR_PTS = (function () {
    var pts = [];
    for (var e = 0; e < 10; e++) {
      var a = -Math.PI / 2 + e * Math.PI / 5;
      var r = e % 2 === 0 ? 1 : 0.42;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return pts;
  })();
  function pathStar(ctx) {
    ctx.beginPath();
    for (var i = 0; i < STAR_PTS.length; i++) {
      if (i === 0) ctx.moveTo(STAR_PTS[i][0], STAR_PTS[i][1]);
      else ctx.lineTo(STAR_PTS[i][0], STAR_PTS[i][1]);
    }
    ctx.closePath();
  }

  /* 铅笔（朝右）：笔杆 + 笔尖（fx.js PENCIL_PATH 同系数） */
  function pathPencil(ctx) {
    ctx.beginPath();
    ctx.moveTo(-1, -0.16); ctx.lineTo(0.5, -0.16); ctx.lineTo(1, 0);
    ctx.lineTo(0.5, 0.16); ctx.lineTo(-1, 0.16); ctx.closePath();
    ctx.fillStyle = '#E8A64C';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0.5, -0.16); ctx.lineTo(1, 0); ctx.lineTo(0.5, 0.16); ctx.closePath();
    ctx.fillStyle = '#5C4632';
    ctx.fill();
  }

  /* ==================== 特效皮肤（fx.js SKINS 同款） ==================== */

  /* 云朵剪影：与主体同生成器的迷你云，原点居中 */
  var CLOUD_RING = GEO.buildBody({ type: 'cloud', r: 0.2, lobes: 7, amp: 0.08, flat: 0.12, cx: 0, cy: 0 });

  /* 云泡 / 光斑配色（mood-mates 展示站浅色主题值，心情页为白底） */
  var BUBBLE_FILL = '#D8E4F7';
  var BUBBLE_STROKE = '#C5D3EC';
  var BUBBLE_SHEEN = 'rgba(255, 255, 255, 0.86)';
  var BUBBLE_SW = 0.9;
  var SPECK_COLOR = '#C9D6EE';

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* 一口一个扇区；连点轮换，点得快会铺到左右和头顶 */
  var PUFF_SECTORS = [
    { mid: -0.28, spread: 0.50 },
    { mid: -1.05, spread: 0.48 },
    { mid: -1.85, spread: 0.50 },
    { mid:  0.22, spread: 0.36 },
    { mid: -2.45, spread: 0.40 },
    { mid: -1.45, spread: 0.36 }
  ];

  var SKINS = {
    /* ===== 云泡（云宝 · 通用）===== */
    cloudpuff: {
      colors: ['#C3D4F2', '#9FB3D6', '#F5D889', '#9A8AE8'],
      orbitSize: [2.8, 4.4],
      burstSize: [3, 5.4],
      makeOrbitKind: function () { return 'circle'; },
      makeBurstKind: function () { return Math.random() < 0.3 ? 'spark' : 'circle'; },
      /* 签名即完整一幕：点击庆祝不再叠自旋 / 撒花 */
      signatureComplete: true,
      signature: function (api, strength) { return cloudSignature(api, strength); }
    },

    /* ===== 星尘（亮亮 · 教育）===== */
    stardust: {
      colors: ['#F5B840', '#F7D07A', '#F09A4E', '#FBE3A8'],
      orbitSize: [3.4, 5.6],
      burstSize: [3, 6.4],
      makeOrbitKind: function () { return 'spark'; },
      makeBurstKind: function () { return Math.random() < 0.4 ? 'star' : 'spark'; },
      /* 思考轨道里偶尔混入一支旋转铅笔 */
      orbitSpecial: {
        chance: 0.3,
        kind: 'pencil',
        size: [5, 6.5]
      },
      signature: function (api, strength) {
        var n = Math.round(10 * strength);
        for (var i = 0; i < n; i++) {
          (function (i) {
            var ang = TAU * i / n + rand(-0.2, 0.2);
            var rr = rand(96, 126);
            var x0 = api.C + api.state.bodyX + Math.cos(ang) * rr;
            var y0 = api.C + api.state.bodyY + Math.sin(ang) * rr * 0.92;
            var size = rand(3.4, 6.2);
            var spin = rand(-140, 140);
            var big = Math.random() < 0.45;
            api.emit({
              kind: big ? 'star' : 'spark',
              color: api.pick(),
              delay: i * 55,
              x: x0, y: y0,
              max: rand(0.75, 1.15),
              step: function (p, dt, u) {
                p.y -= 14 * dt;
                /* 弹入过冲 → 闪烁 → 收缩消失 */
                p.s = u < 0.22 ? size * (u / 0.22) * 1.25 : size * (1 - 0.35 * (u - 0.22) / 0.78);
                p.rot = spin * u;
                var tw = 0.75 + 0.25 * Math.sin(u * 26 + i);
                p.op = (1 - Math.pow(u, 2.2)) * tw;
              }
            });
          })(i);
        }
        return true;
      }
    }
  };

  /* 云泡：一口一个扇区。先出口气最远，后出口气更近；近的先破、远的后破。
   * 连点换扇区，点得够快会铺到左右和头顶。 */
  function cloudSignature(api, strength) {
    var full = strength >= 0.78;
    var Cc = api.C;
    var mouth = api.anchors && api.anchors.mouth;
    var x0 = mouth ? mouth.x + 6 : Cc + 10;
    var y0 = mouth ? mouth.y : Cc + 32;
    var halfW = (api.anchors && api.anchors.halfW) || 104;
    var topSpan = api.anchors && api.anchors.top ? (Cc - api.anchors.top.y) : 104;
    var bodyR = Math.max(halfW, topSpan);

    function easeOut(t) { return 1 - Math.pow(1 - t, 4); }

    function emitPop(delay, x, y) {
      var ang = rand(-2.2, 0.4);
      api.emit({
        kind: 'speck',
        color: SPECK_COLOR,
        delay: delay, x: x, y: y, max: 0.24,
        step: function (p, dt, u) {
          var e = 1 - Math.pow(1 - u, 3);
          p.x = x + api.state.bodyX + Math.cos(ang) * 8 * e;
          p.y = y + api.state.bodyY + Math.sin(ang) * 8 * e - 6 * u;
          p.op = (1 - u) * 0.55;
          p.s = 1.6 * (1 - 0.4 * u);
        }
      });
    }

    function emitBubble(opt) {
      var destX = Cc + Math.cos(opt.ang) * (bodyR + opt.clear);
      var destY = Cc + Math.sin(opt.ang) * (bodyR + opt.clear);
      var travel = opt.travel;
      var hang = opt.hang;
      var pop = 0.26;
      var life = travel + hang + pop;
      var drift = opt.drift;
      var wx = opt.wx, wy = opt.wy, wp = opt.wp;
      api.emit({
        kind: 'bubble',
        delay: opt.delay, x: x0, y: y0, max: life,
        step: function (p, dt, u, t) {
          var x, y, s, op;
          if (t < travel) {
            var k = easeOut(t / travel);
            x = x0 + (destX - x0) * k;
            y = y0 + (destY - y0) * k;
            var grow = Math.min(1, t / 0.1);
            s = 0.18 + 0.82 * grow;
            op = 0.82 * grow;
          } else if (t < travel + hang) {
            var h = (t - travel) / hang;
            x = destX + Math.sin(t * wx + wp) * 2.4;
            y = destY - h * drift + Math.sin(t * wy + wp) * 1.6;
            s = 1 + 0.04 * Math.sin(t * 7 + wp);
            op = 0.82;
          } else {
            var pk = (t - travel - hang) / pop;
            x = destX + Math.sin((travel + hang) * wx + wp) * 2.4;
            y = destY - drift + Math.sin((travel + hang) * wy + wp) * 1.6;
            s = pk < 0.34 ? 1 + 0.4 * (pk / 0.34) : 1.4 * Math.max(0, 1 - (pk - 0.34) / 0.66);
            op = pk < 0.22 ? 0.82 : 0.82 * Math.max(0, 1 - (pk - 0.22) / 0.78);
          }
          p.x = x + api.state.bodyX;
          p.y = y + api.state.bodyY;
          p.s = opt.size * s;
          p.op = op;
        }
      });
      emitPop(opt.delay + (travel + hang) * 1000, destX, destY - drift * 0.65);
    }

    /* 一口气息：先出的最远、后出的更近；破泡反过来，近的先破 */
    function emitBreath(sec, n) {
      var slots = n >= 4
        ? ['far', 'mid', 'far', 'near']
        : n === 3 ? ['far', 'mid', 'near'] : ['mid', 'near'];
      var delays = n >= 4
        ? [0, rand(42, 78), rand(105, 160), rand(180, 255)]
        : n === 3 ? [0, rand(50, 90), rand(130, 200)] : [0, rand(60, 110)];
      for (var i = 0; i < n; i++) {
        var kind = slots[i];
        var clear, travel, hang, size;
        if (kind === 'far') {
          clear = rand(52, 72);
          travel = rand(0.48, 0.62);
          hang = rand(0.68, 0.92);
          size = rand(0.42, 0.54);
        } else if (kind === 'mid') {
          clear = rand(32, 46);
          travel = rand(0.30, 0.40);
          hang = rand(0.42, 0.60);
          size = rand(0.50, 0.62);
        } else {
          clear = rand(18, 28);
          travel = rand(0.18, 0.26);
          hang = rand(0.22, 0.36);
          size = rand(0.58, 0.72);
        }
        var bias = (i / Math.max(1, n - 1) - 0.5) * 1.15;
        emitBubble({
          delay: delays[i],
          ang: sec.mid + bias * sec.spread + rand(-0.08, 0.08),
          clear: clear,
          travel: travel,
          hang: hang,
          size: size,
          drift: kind === 'far' ? rand(10, 18) : kind === 'mid' ? rand(6, 11) : rand(3, 7),
          wx: rand(4.2, 7.5),
          wy: rand(3.4, 6.2),
          wp: rand(0, 6.3)
        });
      }
    }

    if (!full) {
      emitBreath(PUFF_SECTORS[(Math.random() * 3) | 0], 2);
      return true;
    }

    var now = Date.now();
    if (now - api.puffLastAt() > 1200) api.puffReset();
    api.puffMark();
    if (!api.puffQueueLen()) {
      api.puffFill([PUFF_SECTORS[0]].concat(shuffle(PUFF_SECTORS.slice(1))));
    }
    emitBreath(api.puffShift(), 4);
    return true;
  }

  /* ==================== 特效容器 ==================== */

  function createFx(ctx) {
    var Cc = ctx.C;
    var skin = SKINS[ctx.skin] || SKINS.cloudpuff;
    var colors = (ctx.palette && ctx.palette.fx) || skin.colors;
    var anchors = ctx.anchors || {
      mouth: { x: Cc, y: Cc + 36 }, top: { x: Cc, y: Cc - 104 },
      bottom: { x: Cc, y: Cc + 104 }, halfW: 104
    };

    var orbiters = [];    /* 环绕 / 自旋粒子 */
    var pieces = [];      /* 撒花粒子 */
    var emits = [];       /* 签名动作发射粒子 */
    var wasFast = false;
    var spawnAt = [];
    var spinPlane = null;
    var orbitNextAt = 0;
    var puffLastAt = 0;
    var puffQueue = [];
    var lastState = { yaw: 0, dYaw: 0, vel: 0, orbitWant: false, bodyX: 0, bodyY: 0 };

    function pick() { return colors[(Math.random() * colors.length) | 0]; }

    function orbitPoint(o, lam) {
      var hx = o.rad * Math.sin(lam);
      var hy = -o.rad * Math.cos(lam) * Math.sin(o.tilt);
      var ca = Math.cos(o.roll), sa = Math.sin(o.roll);
      return {
        x: Cc + hx * ca - hy * sa,
        y: Cc + hx * sa + hy * ca,
        z: Math.cos(lam) * Math.cos(o.tilt),
        l: lam
      };
    }

    /** mode: 'spin'（一次性甩出）| 'orbit'（常驻环绕） */
    function spawnOrbiter(mode, cfg) {
      if (orbiters.length > 26) return;
      var special = mode === 'orbit' && skin.orbitSpecial && Math.random() < skin.orbitSpecial.chance;
      var sz = special ? skin.orbitSpecial.size : skin.orbitSize;
      orbiters.push({
        kind: special ? skin.orbitSpecial.kind : skin.makeOrbitKind(),
        color: pick(),
        inFront: true, mode: mode,
        life: 0, max: mode === 'spin' ? rand(1.1, 2) : Infinity,
        ret: 0,
        size: rand(sz[0], sz[1]),
        rotSpd: special ? rand(40, 80) : rand(-160, 160),
        rot: rand(0, 360),
        o: cfg.o,
        x: 0, y: 0, z: 1, s: 0, op: 0
      });
    }

    function spawnSpinGroup(yaw, dir) {
      spinPlane = {
        tilt: rand(0.18, 0.5),
        roll: rand(-0.7, 0.7)
      };
      var n = Math.round(rand(5, 8));
      spawnAt = [];
      for (var q = 0; q < n; q++) spawnAt.push({ at: Date.now() + q * rand(45, 90), dir: dir, yaw: yaw });
    }

    function releaseSpinOne(item, yaw) {
      spawnOrbiter('spin', {
        o: {
          lam: yaw - rand(0, 0.2) * item.dir,
          lamVel: item.dir * rand(2.2, 4.2),
          tilt: spinPlane.tilt + rand(-0.06, 0.06),
          roll: spinPlane.roll + rand(-0.08, 0.08),
          rad: rand(118, 142),
          radVel: rand(14, 40)
        }
      });
    }

    /* ---- 撒花 ---- */
    function burst(count) {
      count = count || 20;
      for (var i = 0; i < count && pieces.length < 56; i++) {
        var ang = (i / count) * TAU + rand(-0.35, 0.35);
        var spd = rand(170, 360);
        pieces.push({
          kind: skin.makeBurstKind(),
          color: pick(),
          x: Cc + Math.cos(ang) * rand(96, 118),
          y: Cc + Math.sin(ang) * rand(96, 118),
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - rand(20, 75),
          life: 0, max: rand(0.45, 0.9),
          r: rand(skin.burstSize[0], skin.burstSize[1]),
          rot: rand(0, 360), vr: rand(-260, 260),
          s: 1, op: 1
        });
      }
    }

    /* ---- 签名动作发射 ---- */
    var emitApi = {
      C: Cc,
      anchors: anchors,
      state: lastState,
      pick: pick,
      puffLastAt: function () { return puffLastAt; },
      puffMark: function () { puffLastAt = Date.now(); },
      puffReset: function () { puffQueue = []; },
      puffQueueLen: function () { return puffQueue.length; },
      puffFill: function (q) { puffQueue = q; },
      puffShift: function () { return puffQueue.shift(); },
      emit: function (cfg) {
        if (emits.length > 80) return;
        cfg.op = 0;
        cfg.s = 1; cfg.rot = 0;
        cfg.born = Date.now() + (cfg.delay || 0);
        cfg.life = 0;
        emits.push(cfg);
      }
    };

    function signature(strength) {
      if (!skin.signature) return false;
      return skin.signature(emitApi, strength || 1) === true;
    }

    /* ---- 每帧 ---- */
    function update(dt, now, state) {
      lastState.yaw = state.yaw;
      lastState.dYaw = state.dYaw;
      lastState.vel = state.vel;
      lastState.orbitWant = state.orbitWant;
      lastState.bodyX = state.bodyX || 0;
      lastState.bodyY = state.bodyY || 0;

      var vel = state.vel;
      var fast = Math.abs(vel) >= 0.9;
      var dir = vel >= 0 ? 1 : -1;

      /* 自旋达速：起一组错峰粒子 */
      if (fast && !wasFast) spawnSpinGroup(state.yaw, dir);
      if (!fast) spawnAt.length = 0;
      wasFast = fast;
      if (Math.abs(vel) >= 5) {
        while (spawnAt.length && now >= spawnAt[0].at) {
          releaseSpinOne(spawnAt.shift(), state.yaw);
        }
      }

      /* 常驻环绕补给：错峰起 5 枚 */
      if (state.orbitWant && now >= orbitNextAt) {
        var orbitCount = 0;
        for (var oc = 0; oc < orbiters.length; oc++) if (orbiters[oc].mode === 'orbit') orbitCount++;
        if (orbitCount < 5) {
          spawnOrbiter('orbit', {
            o: {
              lam: rand(0, TAU),
              lamVel: (Math.random() < 0.5 ? -1 : 1) * rand(1.5, 2.2),
              tilt: rand(0.1, 0.24),
              roll: rand(-0.12, 0.12),
              rad: rand(122, 146),
              radVel: 0
            }
          });
        }
        orbitNextAt = now + 420;
      }

      /* 轨道粒子推进 */
      for (var ti = orbiters.length - 1; ti >= 0; ti--) {
        var ob = orbiters[ti];
        ob.life += dt;
        var retreat = ob.mode === 'orbit' ? !state.orbitWant : ob.life > ob.max;
        ob.ret = clamp(ob.ret + (retreat ? dt / 0.4 : -dt / 0.3), 0, 1);
        if (retreat && ob.ret >= 1) { orbiters.splice(ti, 1); continue; }

        var o = ob.o;
        o.lam += o.lamVel * dt + (ob.mode === 'spin' ? state.dYaw * 0.55 : state.dYaw * 0.2);
        if (ob.mode === 'spin') {
          o.lamVel *= Math.exp(-1.1 * dt);
          o.rad += o.radVel * dt;
          o.radVel *= Math.exp(-1.6 * dt);
        }
        ob.rot += ob.rotSpd * dt;

        var p = orbitPoint(o, o.lam);
        ob.x = p.x; ob.y = p.y;
        /* 深度换层：z < 0 转入背层被身体遮挡 */
        ob.inFront = p.z >= 0;
        var grow = Math.min(ob.life / 0.3, 1);
        grow = grow * grow * (3 - 2 * grow);
        var depth = 0.68 + 0.32 * clamp(p.z, 0, 1);
        ob.s = ob.size * depth * grow * (1 - 0.8 * ob.ret * ob.ret);
        if (ob.s < 0.25) { ob.op = 0; continue; }
        ob.op = (1 - ob.ret) * (0.55 + 0.45 * depth);
      }

      /* 撒花推进：速度衰减 + 微重力 */
      for (var ci = pieces.length - 1; ci >= 0; ci--) {
        var pc = pieces[ci];
        pc.life += dt;
        if (pc.life >= pc.max) { pieces.splice(ci, 1); continue; }
        pc.x += pc.vx * dt;
        pc.y += pc.vy * dt;
        var drag = Math.pow(0.94, 60 * dt);
        pc.vx *= drag;
        pc.vy = pc.vy * drag + 40 * dt;
        pc.rot += pc.vr * dt;
        var u = pc.life / pc.max;
        var fd = u < 0.1 ? u / 0.1 : Math.pow(1 - (u - 0.1) / 0.9, 1.7);
        pc.op = fd;
        pc.s = Math.max(pc.r * (1 - 0.4 * u), 0.4);
      }

      /* 签名发射粒子推进 */
      for (var ei = emits.length - 1; ei >= 0; ei--) {
        var em = emits[ei];
        if (now < em.born) continue;
        em.life += dt;
        if (em.life >= em.max) {
          if (em.cleanup) em.cleanup();
          emits.splice(ei, 1);
          continue;
        }
        em.step(em, dt, em.life / em.max, em.life);
      }
    }

    /* 单个粒子绘制（kind 分发） */
    function drawPiece(c, p, fade) {
      c.save();
      c.globalAlpha = clamp(p.op, 0, 1) * fade;
      c.translate(p.x, p.y);
      if (p.rot) c.rotate(p.rot * Math.PI / 180);
      var s = p.s || 1;
      if (p.kind === 'circle') {
        c.scale(s, s);
        c.beginPath();
        c.arc(0, 0, 1, 0, TAU);
        c.fillStyle = p.color;
        c.fill();
      } else if (p.kind === 'spark') {
        c.scale(s, s);
        pathSpark(c);
        c.fillStyle = p.color;
        c.fill();
      } else if (p.kind === 'star') {
        c.scale(s, s);
        pathStar(c);
        c.fillStyle = p.color;
        c.fill();
      } else if (p.kind === 'pencil') {
        c.scale(s, s);
        pathPencil(c);
      } else if (p.kind === 'speck') {
        c.scale(s, s);
        c.beginPath();
        c.arc(0, 0, 1, 0, TAU);
        c.fillStyle = p.color || SPECK_COLOR;
        c.fill();
      } else if (p.kind === 'bubble') {
        c.scale(s, s);
        traceRingPoly(c, CLOUD_RING);
        c.fillStyle = BUBBLE_FILL;
        c.fill();
        c.lineJoin = 'round';
        c.strokeStyle = BUBBLE_STROKE;
        c.lineWidth = BUBBLE_SW;
        c.stroke();
        /* 高光斑 */
        c.save();
        c.translate(-5.2, -7.4);
        c.beginPath();
        c.scale(3.1, 2.1);
        c.arc(0, 0, 1, 0, TAU);
        c.fillStyle = BUBBLE_SHEEN;
        c.fill();
        c.restore();
      }
      c.restore();
    }

    function drawLayer(c, front, fade) {
      var i;
      for (i = 0; i < orbiters.length; i++) {
        var ob = orbiters[i];
        if (ob.inFront !== front || !(ob.op > 0.001) || !(ob.s >= 0.25)) continue;
        drawPiece(c, ob, fade);
      }
      if (front) {
        for (i = 0; i < pieces.length; i++) drawPiece(c, pieces[i], fade);
        for (i = 0; i < emits.length; i++) {
          var em = emits[i];
          if (Date.now() < em.born) continue;
          drawPiece(c, em, fade);
        }
      }
    }

    function destroy() {
      orbiters.length = 0;
      pieces.length = 0;
      emits.length = 0;
    }

    return {
      update: update, burst: burst, signature: signature, destroy: destroy,
      drawLayer: drawLayer,
      signatureComplete: !!skin.signatureComplete
    };
  }

  /* ==================== 渲染主体 ==================== */

  /**
   * createBall(surface, opts)
   *   surface = { canvas, ctx }（canvas 2d）
   *   opts.character —— 已解析的角色定义（引擎负责解析）
   *   opts.margin —— 画布映射余量（>1 时整体缩小留出特效空间）
   *   opts.yBias  —— 纵向偏移（viewBox 单位，给上飘特效留头部空间）
   */
  function createBall(surface, opts) {
    opts = opts || {};
    var lite = !!opts.lite;
    var ch = opts.character;
    var face = ch.face;
    var headRing = ch.bodyRing;
    var palette = ch.palette;
    var feats = ch.features || {};
    var pupilCfg = ch.eyeStyle.pupil || null;

    var canvas = surface.canvas;
    var ctx = surface.ctx;

    /* viewBox(0,0,240,240) → 物理像素映射。
     * margin > 1 时整体缩小绘制并保持居中，给环绕粒子 / 云泡留画布余量；
     * yBias 把角色略向下放，给上飘的云泡留出头部空间 */
    var margin = (opts.margin > 1) ? opts.margin : 1;
    var yBias = opts.yBias || 0;
    var k = canvas.width / (240 * margin);
    var xOrigin = canvas.width / 2 - 120 * k;
    var yOrigin = canvas.height / 2 - 120 * k + yBias * k;

    /* ---- 形状轮廓采样：每 2px 一行的 [minX, maxX]，供五官贴合任意剪影 ---- */
    var silMinY = 1e9, silMaxY = -1e9, silMaxW = 0;
    var i;
    for (i = 0; i < headRing.length; i++) {
      if (headRing[i][1] < silMinY) silMinY = headRing[i][1];
      if (headRing[i][1] > silMaxY) silMaxY = headRing[i][1];
    }
    var SIL_STEP = 2;
    var silRows = [];
    (function buildSil() {
      var rows = Math.ceil((silMaxY - silMinY) / SIL_STEP) + 1;
      for (var r = 0; r < rows; r++) {
        var y = silMinY + r * SIL_STEP;
        var lo = 1e9, hi = -1e9;
        for (var e = 0; e < headRing.length; e++) {
          var a = headRing[e], b = headRing[(e + 1) % headRing.length];
          var y0 = a[1], y1 = b[1];
          if ((y0 <= y && y1 >= y) || (y1 <= y && y0 >= y)) {
            var t = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
            var x = a[0] + (b[0] - a[0]) * t;
            if (x < lo) lo = x;
            if (x > hi) hi = x;
          }
        }
        if (lo > hi) { lo = C - 4; hi = C + 4; }
        silRows.push([lo, hi]);
        if (hi - lo > silMaxW) silMaxW = hi - lo;
      }
    })();
    function silAt(y) {
      var r = Math.round((clamp(y, silMinY, silMaxY) - silMinY) / SIL_STEP);
      return silRows[clamp(r, 0, silRows.length - 1)];
    }

    /* ---- 身体几何（静态，预计算） ---- */
    var bodyBBox = ringBBox(headRing);
    var bw = bodyBBox.w, bh = bodyBBox.h;
    var gradCx = bodyBBox.minX + bw * 0.36;
    var gradCy = bodyBBox.minY + bh * 0.26;
    /* SVG objectBoundingBox 半径按归一化对角线计 */
    var gradR = 0.86 * Math.sqrt((bw * bw + bh * bh) / 2);
    var glossAmt = palette.gloss != null ? palette.gloss : 0.3;
    var glossCx = C - silMaxW * 0.17;
    var glossCy = silMinY + (silMaxY - silMinY) * 0.2;
    var glossRx = silMaxW * 0.15;
    var glossRy = (silMaxY - silMinY) * 0.1;
    var shadowRy = 7;
    var shadowCy = Math.min(silMaxY + 6, 234);
    var shadowRx = silMaxW * 0.36;

    /* ---- 体色缓存（四停渐变每次重建，色变才重建） ---- */
    var gradColor = null;
    function setBodyColor(color) {
      /* 真机防线：非法颜色串会让 addColorStop 抛错并杀死整个渲染循环，
       * 用基色兜底保证角色永不消失 */
      if (typeof color !== 'string' || color.indexOf('#') !== 0 || color.indexOf('NaN') >= 0) {
        color = ch.palette.states.base || '#B4C6EE';
      }
      gradColor = color;
    }

    function fillBodyGradient() {
      var g = ctx.createRadialGradient(gradCx, gradCy, bw * 0.05, gradCx, gradCy, gradR);
      addStop(g, 0, shade(gradColor, 0.42));
      addStop(g, 0.38, shade(gradColor, 0.14));
      addStop(g, 0.78, gradColor);
      addStop(g, 1, shade(gradColor, -0.22));
      ctx.fillStyle = g;
    }

    /* ---- 横向经度换算（与眼睛同一套投影），返回 null 表示已绕到背面 ---- */
    function project(ox, oy, yaw) {
      var sil = silAt(oy);
      var cx0 = (sil[0] + sil[1]) / 2;
      var hw = Math.max((sil[1] - sil[0]) / 2, 12);
      var theta = clamp(ox / hw, -1.15, 1.15);
      var total = theta + (yaw || 0);
      var cn = Math.cos(total);
      if (cn <= 0.02) return null;
      return { x: cx0 + hw * Math.sin(total) * 0.985, cn: cn };
    }

    /* ---- 眼睛基准 ---- */
    var EYE_HALF = ch.eyeStyle.h / 2;
    var BEAN_HL_MIN_H = 10;   /* 豆眼高光：有效可见高度低于此才隐藏（真正闭眼/笑成弧线） */
    var BEAN_HL_FULL_H = 26;  /* 高光点满尺寸的可见高度 */
    var IRIS_LASH = 0.26;     /* 睫线：effOpen 低于此隐藏虹膜/瞳孔/高光 */
    var IRIS_SMALL = 0.45;    /* 小眼：介于睫线与此之间只留虹膜 */

    function buildEye(k2) {
      var ring0 = ch.defaultEyeRing[k2];
      var base = centroid(ring0);
      return {
        ring: ring0, c: base, base: base, k: k2,
        defBBox: ringBBox(ring0), bbox: ringBBox(ring0), thick: ringThickness(ring0)
      };
    }
    var eyeL = buildEye(0);
    var eyeR = buildEye(1);

    /* 虹膜渐变（瞳孔眼）：上深下亮，色不变则复用 */
    var irisGrad = null, irisGradColor = null;
    function getIrisGrad(irisColor, irisR) {
      if (irisGrad && irisGradColor === irisColor) return irisGrad;
      irisGradColor = irisColor;
      irisGrad = ctx.createRadialGradient(0, -irisR * 0.24, 0, 0, -irisR * 0.24, irisR * 1.44);
      addStop(irisGrad, 0, shade(irisColor, -0.25));
      addStop(irisGrad, 0.62, irisColor);
      addStop(irisGrad, 1, shade(irisColor, 0.28));
      return irisGrad;
    }

    /* ---- 眼睛绘制：轮廓环形变 + 球面投影 + 分层眼球（与 SVG 版同一套数学） ---- */
    function setEye(eyeState, pose, k3, yaw) {
      var ring = pose.ring;
      if (ring && ring !== eyeState.ring) {
        eyeState.ring = ring;
        eyeState.c = centroid(ring);
        eyeState.bbox = ringBBox(ring);
        eyeState.thick = ringThickness(ring);
      }
      var base = eyeState.c || eyeState.base;
      var open = clamp(pose.open, 0.02, 2.4);
      var syEye = clamp(pose.scaleY * face.eye, 0.02, 2.4);
      var sxBase = pose.scaleX * face.eye;

      /* bean 模式垂直缩放包含开合度；iris 模式开合度只压眼睑 */
      var syAll = pupilCfg ? syEye : clamp(syEye * open, 0.02, 2.4);

      var halfH = EYE_HALF * clamp(syEye * open, 0.02, 2.4) + 2;
      var ey0 = C + face.y + (base[1] - C) * face.sy + pose.y + pose.lookY;
      ey0 = clamp(ey0, silMinY + halfH, silMaxY - halfH);

      var sil = silAt(ey0);
      var cx0 = (sil[0] + sil[1]) / 2;
      var hw = Math.max((sil[1] - sil[0]) / 2, 12);

      var ox = face.x + (base[0] - C) * face.sx + pose.x + pose.lookX;
      var theta = clamp(ox / hw, -1.15, 1.15);
      var total = theta + (yaw || 0);
      var cn = Math.cos(total);
      if (cn <= 0.02) return;   /* 绕到背面自动隐藏 */
      var ex = cx0 + hw * Math.sin(total) * 0.985;
      var dyN = (ey0 - C) / 130;
      var fy = Math.sqrt(1 - dyN * dyN * 0.22);

      function applyEyeTf() {
        ctx.translate(ex, ey0);
        if (pose.rotate) ctx.rotate(pose.rotate * Math.PI / 180);
        ctx.scale(sxBase * cn, syAll * fy);
      }

      if (!pupilCfg) {
        /* ---- bean 豆眼：整个 lens 环即眼睑剪影，闭眼 = 剪影压扁 ---- */
        ctx.save();
        applyEyeTf();
        ctx.translate(-base[0], -base[1]);
        traceRingSmooth(ctx, ring);
        ctx.fillStyle = pose.color || palette.eye;
        ctx.fill();
        ctx.restore();

        /* 高光点贴同一变换；有效高度过低（真正闭眼/笑成弧线）隐藏。
         * 未配置 highlight 的豆眼角色：按默认眼环 bbox 推导
         * 「主光 + 副光」两粒，保证所有豆眼都带亮光（可爱风统一） */
        var hls = ch.eyeStyle.highlight;
        if (!hls) {
          var dB0 = eyeState.defBBox || eyeState.bbox;
          if (dB0 && dB0.w > 0.5 && dB0.h > 0.5) {
            var mR = Math.max(1.6, Math.min(dB0.w, dB0.h) * 0.14);
            hls = [
              { dx: dB0.w * 0.16, dy: -dB0.h * 0.18, r: mR },
              { dx: -dB0.w * 0.2, dy: dB0.h * 0.14, r: mR * 0.45, opacity: 0.6 }
            ];
          }
        }
        if (hls) {
          var hlList = Object.prototype.toString.call(hls) === '[object Array]' ? hls : [hls];
          var boxH = eyeState.bbox ? eyeState.bbox.h : EYE_HALF * 2;
          var thickH = (eyeState.thick != null ? eyeState.thick : boxH) * 1.65;
          var visH = Math.min(boxH, thickH) * Math.abs(syAll * fy);
          if (visH > BEAN_HL_MIN_H) {
            var hlScale = clamp(visH / BEAN_HL_FULL_H, 0.55, 1);
            var defB = eyeState.defBBox;
            var curB = eyeState.bbox || defB;
            var sxOff = defB && defB.w > 0.5 ? curB.w / defB.w : 1;
            var syOff = defB && defB.h > 0.5 ? curB.h / defB.h : 1;
            for (var hi = 0; hi < hlList.length; hi++) {
              var hl = hlList[hi];
              var hlR = (hl.r || 3) * hlScale;
              var hdx = (hl.dx || 0) * (k3 === 0 ? 1 : -1) * sxOff;
              var hdy = (hl.dy || 0) * syOff;
              /* 按当前眼环比例缩放偏移，并保证点心距 bbox 边缘 ≥ 半径 */
              if (curB) {
                hdx = clampIn(hdx, (curB.minX - base[0]) + hlR, (curB.maxX - base[0]) - hlR);
                hdy = clampIn(hdy, (curB.minY - base[1]) + hlR, (curB.maxY - base[1]) - hlR);
              }
              ctx.save();
              applyEyeTf();
              ctx.beginPath();
              ctx.arc(hdx, hdy, hlR, 0, TAU);
              ctx.fillStyle = hl.color || palette.eyeHighlight || '#FFFFFF';
              ctx.globalAlpha *= (hl.opacity != null ? hl.opacity : 0.92);
              ctx.fill();
              ctx.restore();
            }
          }
        }
        return;
      }

      /* ---- iris 瞳孔眼：lens 环作为眼睑开口裁剪，内部眼白→虹膜→瞳孔→高光 ----
       * 实际闭合判定：轮廓厚度 × 开合度。
       * 睫线模式（effOpen < 0.26）：深色睫线，藏起虹膜/瞳孔/高光；
       * 小眼模式（0.26~0.45）：保留虹膜与「按比例缩小的瞳孔与高光」 */
      var thick = eyeState.thick != null ? eyeState.thick : EYE_HALF * 2 * 0.7;
      var effOpen = open * thick / (EYE_HALF * 2);
      var lash = effOpen < IRIS_LASH;
      var small = !lash && effOpen < IRIS_SMALL;

      var irisR = pupilCfg.irisR || EYE_HALF * 0.86;
      var pupilR = (pupilCfg.pupilR || irisR * 0.52) * (lash ? 1 : clamp(effOpen / IRIS_SMALL, 0.6, 1));

      /* 睫线模式眼白改用眼色填充（成一条深色睫线） */
      var socketFill = lash ? (pose.color || palette.eye) : (pupilCfg.socket || '#FFFFFF');

      ctx.save();
      applyEyeTf();
      ctx.translate(-base[0], -base[1]);

      /* 眼睑开合：围绕眼心纵向上轴缩放（open ≠ 1 时） */
      var lidScaled = open < 0.995 || open > 1.005;
      function lidPath() {
        if (lidScaled) {
          ctx.save();
          ctx.translate(base[0], base[1]);
          ctx.scale(1, open);
          ctx.translate(-base[0], -base[1]);
          traceRingSmooth(ctx, ring);
          ctx.restore();
        } else {
          traceRingSmooth(ctx, ring);
        }
      }

      /* 裁剪 + 眼白（与眼睑开口同形同步缩放） */
      lidPath();
      ctx.clip();
      lidPath();
      ctx.fillStyle = socketFill;
      ctx.fill();

      if (!lash) {
        /* 虹膜 + 瞳孔（正圆，不随眼睑压扁，闭眼时被裁剪）；
         * 瞳孔额外滑动：比眼睑多走 50%，再按当前眼环 bbox 钳制 */
        var travel = irisR * 0.5;
        var px = base[0] + clamp(pose.lookX * 0.5, -travel, travel);
        var py = base[1] + clamp(pose.lookY * 0.55, -travel, travel);
        var bb = eyeState.bbox;
        if (bb) {
          var iPad = irisR * 0.32;
          var padX = Math.max(pupilR, iPad);
          var visMinY = base[1] + (bb.minY - base[1]) * open;
          var visMaxY = base[1] + (bb.maxY - base[1]) * open;
          px = clampIn(px, bb.minX + padX, bb.maxX - padX);
          py = clampIn(py, visMinY + pupilR, visMaxY - pupilR);
        }
        var ballDx = px - base[0], ballDy = py - base[1];

        /* 平移到眼球中心后画：渐变以眼心为基准（与 SVG objectBoundingBox 同构） */
        ctx.save();
        ctx.translate(base[0] + ballDx, base[1] + ballDy);
        ctx.beginPath();
        ctx.arc(0, 0, irisR, 0, TAU);
        ctx.fillStyle = getIrisGrad(pupilCfg.irisColor || palette.eye, irisR);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, pupilR, 0, TAU);
        ctx.fillStyle = pupilCfg.pupilColor || shade(pupilCfg.irisColor || palette.eye, -0.72);
        ctx.fill();
        ctx.restore();

        /* 定光源高光：位置相对眼心固定（镜像），不跟随眼球滑动。
         * 小眼模式不再整体隐藏高光，改为按开合比例缩小常驻
         * （可爱风：亮光尽量常驻，闭成睫线时仍由 lash 分支隐藏） */
        var hlK = small ? clamp(effOpen / IRIS_SMALL, 0.5, 1) : 1;
        {
          var hlList2 = pupilCfg.highlights || [
            { dx: -irisR * 0.34, dy: -irisR * 0.4, r: irisR * 0.3 },
            { dx: irisR * 0.36, dy: irisR * 0.22, r: irisR * 0.13, opacity: 0.6 }
          ];
          for (var hj = 0; hj < hlList2.length; hj++) {
            var hn = hlList2[hj];
            var hOp = hn.opacity != null ? hn.opacity : 0.95;
            ctx.save();
            ctx.beginPath();
            ctx.arc(base[0] + (hn.dx || 0) * (k3 === 0 ? 1 : -1), base[1] + (hn.dy || 0), hn.r * hlK, 0, TAU);
            ctx.fillStyle = hn.color || '#FFFFFF';
            ctx.globalAlpha *= hOp;
            ctx.fill();
            ctx.restore();
          }
        }
      }
      ctx.restore();
    }

    /* ---- 嘴巴（features.js 同款：engine 传入形变后的 mouthRing） ---- */
    var mouthCfg = feats.mouth ? Object.assign(
      { dy: 36, color: palette.mouth || palette.eye },
      feats.mouth === true ? {} : feats.mouth
    ) : null;

    function drawMouth(pose, yaw) {
      if (!mouthCfg) return;
      var f = pose.face || {};
      var ring = f.mouthRing;
      if (!ring) return;
      var my = C + face.y + (mouthCfg.dy + (f.mouthY || 0)) * face.sy;
      var pm = project((f.mouthX || 0) * face.sx, my, yaw);
      if (!pm) return;
      ctx.save();
      ctx.translate(pm.x, my);
      ctx.scale((f.mouthSX || 1) * pm.cn * face.eye, (f.mouthSY || 1) * face.eye);
      traceRingSmooth(ctx, ring);
      ctx.fillStyle = mouthCfg.color;
      ctx.fill();
      ctx.restore();
    }

    /* ---- 腮红（features.js 同款：跟随眼位，透明度 = blush × 上限） ---- */
    var blushCfg = (feats.blush && feats.blush !== true) ? Object.assign(
      { dx: 34, dy: 26, rx: 11, ry: 6.5, color: palette.blush || '#F2A9A0', max: 0.85 },
      feats.blush
    ) : (feats.blush === true ? { dx: 34, dy: 26, rx: 11, ry: 6.5, color: palette.blush || '#F2A9A0', max: 0.85 } : null);

    function drawBlush(pose, yaw) {
      if (!blushCfg) return;
      var f = pose.face || {};
      var bv = clamp(f.blush || 0, 0, 1) * blushCfg.max;
      if (bv < 0.01) return;
      /* 腮红贴在脸颊上，跟随目光 25%（比眼睛弱，形成层次） */
      var blshX = (pose.left.lookX || 0) * 0.25;
      var by = C + face.y + blushCfg.dy * face.sy + (pose.left.lookY || 0) * 0.25;
      var sides = [-1, 1];
      for (var s = 0; s < 2; s++) {
        var p = project(sides[s] * blushCfg.dx * face.sx + blshX, by, yaw);
        if (!p) continue;
        ctx.save();
        ctx.translate(p.x, by);
        ctx.scale(p.cn, 1);
        ctx.beginPath();
        pathEllipse(ctx, blushCfg.rx, blushCfg.ry);
        ctx.fillStyle = blushCfg.color;
        ctx.globalAlpha *= bv;
        ctx.fill();
        ctx.restore();
      }
    }

    /* ---- autoFit 圆框眼镜（features.js ACC_BUILDERS.glasses 同款） ----
     * 镜框由角色实际眼位 / 眼形自动求出，追随目光 75%、眨眼下滑回弹、镜片周期扫光 */
    var glassesAcc = null;
    (function findGlasses() {
      var accs = feats.accessories || [];
      for (var i = 0; i < accs.length; i++) {
        if ((accs[i].kind || 'path') === 'glasses') { glassesAcc = accs[i]; break; }
      }
    })();

    var glassesState = glassesAcc ? {
      aL: { ox: face.x - ch.eyeStyle.dx * face.sx, y: C + face.y + (ch.eyeStyle.cy - C) * face.sy },
      aR: { ox: face.x + ch.eyeStyle.dx * face.sx, y: C + face.y + (ch.eyeStyle.cy - C) * face.sy },
      rr: (Math.max(ch.eyeStyle.w, ch.eyeStyle.h) / 2) * face.eye * (glassesAcc.fit != null ? glassesAcc.fit : 1.22) + 2,
      color: glassesAcc.color || '#C9A24B',
      sw: glassesAcc.strokeWidth != null ? glassesAcc.strokeWidth : 2.6,
      slide: 0
    } : null;

    function drawGlasses(pose, yaw, now) {
      if (!glassesState) return;
      var gs = glassesState;
      var openMin = Math.min(pose.left.open != null ? pose.left.open : 1,
                             pose.right.open != null ? pose.right.open : 1);
      /* 眨眼下滑：闭眼程度驱动目标位移，指数平滑回弹 */
      var slideT = clamp(1 - openMin, 0, 1) * 1.8;
      gs.slide += (slideT - gs.slide) * 0.25;

      /* 追随目光 75% + 微漂浮 */
      var mvPh = TAU * now / 3400 + 1.3;
      var mvDy = 0.7 * Math.sin(mvPh);
      var lookX = (pose.left.lookX || 0) * 0.75;
      var lookY = (pose.left.lookY || 0) * 0.75;
      var byv = (gs.aL.y + gs.aR.y) / 2 + lookY + gs.slide + mvDy;

      var pL = project(gs.aL.ox + lookX, byv, yaw);
      var pR = project(gs.aR.ox + lookX, byv, yaw);
      if (!pL && !pR) return;

      var scl = face.eye;
      var rr = gs.rr, sw = gs.sw, color = gs.color;

      /* 扫光：每 glintPeriod 一次，0.5s 内从左扫到右 */
      var per = glassesAcc.glintPeriod || 5200;
      var gp = (now % per) / per;
      var sweep = gp < 0.1 ? gp / 0.1 : -1;

      var lensX = [pL ? pL.x : 0, pR ? pR.x : 0];
      var lensCn = [pL ? pL.cn : 0, pR ? pR.cn : 0];
      var sides2 = [pL, pR];
      for (var idx = 0; idx < 2; idx++) {
        if (!sides2[idx]) continue;
        ctx.save();
        ctx.translate(lensX[idx], byv);
        ctx.scale(lensCn[idx] * scl, scl);
        /* 镜片玻璃感：极淡白填充 */
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, TAU);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
        ctx.fill();
        /* 镜框 */
        ctx.strokeStyle = color;
        ctx.lineWidth = sw;
        ctx.stroke();
        /* 扫光：细亮条，clip 在镜片内 */
        if (sweep >= 0) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(0, 0, Math.max(rr - sw / 2, 0.1), 0, TAU);
          ctx.clip();
          ctx.translate((sweep * 2 - 1) * rr * 1.3, 0);
          ctx.rotate(24 * Math.PI / 180);
          ctx.beginPath();
          ctx.rect(-rr * 0.22, -rr * 1.6, rr * 0.34, rr * 3.2);
          ctx.fillStyle = '#FFFFFF';
          ctx.globalAlpha *= Math.max(0, 0.5 * Math.sin(Math.PI * sweep));
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      }

      /* 鼻梁：两镜片内缘之间的上拱弧；镜脚：外缘向外上方短线 */
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = sw;
      ctx.lineCap = 'round';
      if (pL && pR) {
        var x1 = pL.x + rr * pL.cn * scl, x2 = pR.x - rr * pR.cn * scl;
        ctx.beginPath();
        ctx.moveTo(x1, byv);
        ctx.quadraticCurveTo((x1 + x2) / 2, byv - rr * 0.55, x2, byv);
        ctx.stroke();
      }
      if (pL) {
        var xa = pL.x - rr * pL.cn * scl;
        ctx.beginPath();
        ctx.moveTo(xa, byv);
        ctx.lineTo(xa - 7 * pL.cn, byv - 3);
        ctx.stroke();
      }
      if (pR) {
        var xb = pR.x + rr * pR.cn * scl;
        ctx.beginPath();
        ctx.moveTo(xb, byv);
        ctx.lineTo(xb + 7 * pR.cn, byv - 3);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* ---- 特效实例（anchors：嘴 / 头顶 / 底部锚点与身体半宽） ---- */
    var mouthAnchorY = C + face.y + (((feats.mouth && feats.mouth.dy) || 36)) * face.sy;
    var fx = (!lite) ? createFx({
      C: C,
      skin: ch.fxSkin,
      palette: palette,
      anchors: {
        mouth: { x: C, y: mouthAnchorY },
        top: { x: C, y: silMinY },
        bottom: { x: C, y: silMaxY },
        halfW: silMaxW / 2
      }
    }) : null;

    /* ---- 像素级淡入淡出 ----
     * 同层 canvas 在部分内核不吃祖先 CSS opacity，
     * 淡入淡出只能画进位图：因子随每帧乘进所有 globalAlpha */
    var fade = 1;
    function setFade(v) {
      var n = Number(v);
      fade = isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
    }

    var prevYaw = 0, prevNow = 0;

    /* ---- 每帧 ---- */
    function applyPose(pose) {
      var b = pose.body;
      var now = Date.now();

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(k, 0, 0, k, xOrigin, yOrigin);

      var dt = prevNow ? clamp((now - prevNow) / 1000, 0.001, 0.05) : 1 / 60;
      prevNow = now;

      /* 自旋角速度（特效触发源） */
      var yaw = b.yaw || 0;
      var dYaw = yaw - prevYaw;
      if (!isFinite(dYaw) || Math.abs(dYaw) > 1.2) dYaw = 0;
      prevYaw = yaw;
      var vel = dYaw / dt;

      /* 线稿为展示站开关，心情页不使用；sketch 字段保持兼容即可 */
      var sketch = b.sketch || 0;

      setBodyColor(b.color);

      /* ---- 地面软投影（不随身体旋转，只跟位移 / 起跳收缩） ---- */
      try {
        var lift = clamp(-b.y / 52, 0, 1);
        var shOp = sketch > 0.5 ? 0 : 0.16 * (1 - 0.55 * lift);
        if (shOp > 0.001) {
          ctx.save();
          ctx.globalAlpha = shOp * fade;
          ctx.translate(C + b.x * 0.7, shadowCy);
          ctx.scale((1 - 0.3 * lift) * b.scale, 1 - 0.35 * lift);
          /* 单位圆空间里建渐变、画椭圆：随缩放矩阵一起变成椭圆软投影 */
          ctx.save();
          ctx.scale(shadowRx, shadowRy);
          var shGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
          addStop(shGrad, 0, 'rgba(0,0,0,0.9)');
          addStop(shGrad, 0.72, 'rgba(0,0,0,0.32)');
          addStop(shGrad, 1, 'rgba(0,0,0,0)');
          ctx.beginPath();
          ctx.arc(0, 0, 1, 0, TAU);
          ctx.fillStyle = shGrad;
          ctx.fill();
          ctx.restore();
          ctx.restore();
        }
      } catch (e) {}

      /* ---- 背层特效（绕到身体后面的轨道粒子） ---- */
      if (fx) try { fx.drawLayer(ctx, false, fade); } catch (e) {}

      /* ---- 身体组（对应原 bodyG） ---- */
      ctx.save();
      ctx.globalAlpha = fade;

      /* 自旋表现：角度翻转优于折叠 —— 身体随偏航轻微倾斜 + 横向弹性压缩 */
      var yaw0 = b.yaw || 0;
      var spinTilt = 0, spinSqX = 1;
      if (yaw0 > 0.001 || yaw0 < -0.001) {
        spinTilt = 5 * Math.sin(yaw0);
        spinSqX = 0.88 + 0.12 * Math.abs(Math.cos(yaw0));
      }
      ctx.translate(C + b.x, C + b.y);
      ctx.rotate(((b.rotate || 0) + spinTilt) * Math.PI / 180);
      ctx.scale(b.scale * spinSqX, b.scale);
      ctx.translate(-C, -C);

      /* 身体：4 停靠径向渐变（顶光→本色→边缘收深，伪 3D 体积） */
      try {
        traceRingSmooth(ctx, headRing);
        fillBodyGradient();
        ctx.fill();
      } catch (e) {}

      /* 釉面高光斑：贴着剪影左上方，用身体剪影裁剪避免凹形轮廓溢出 */
      if (glossAmt > 0) try {
        ctx.save();
        traceRingSmooth(ctx, headRing);
        ctx.clip();
        ctx.translate(glossCx, glossCy);
        ctx.rotate(-24 * Math.PI / 180);
        ctx.scale(glossRx, glossRy);
        var glGrad = ctx.createRadialGradient(0, -0.16, 0, 0, -0.16, 0.58);
        addStop(glGrad, 0, 'rgba(255,255,255,0.9)');
        addStop(glGrad, 0.68, 'rgba(255,255,255,0.22)');
        addStop(glGrad, 1, 'rgba(255,255,255,0)');
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, TAU);
        ctx.fillStyle = glGrad;
        ctx.globalAlpha = glossAmt * fade;
        ctx.fill();
        ctx.restore();
      } catch (e) {}

      /* 底部环境光遮蔽（AO）：身体下缘轻微压暗，增强体积贴地感 */
      try {
        var aoGrad = ctx.createLinearGradient(0, bodyBBox.minY, 0, bodyBBox.maxY);
        addStop(aoGrad, 0.58, 'rgba(0,0,0,0)');
        addStop(aoGrad, 1, 'rgba(0,0,0,0.14)');
        traceRingSmooth(ctx, headRing);
        ctx.fillStyle = aoGrad;
        ctx.fill();
      } catch (e) {}

      /* 腮红在眼睛之下、身体之上 */
      try { drawBlush(pose, yaw); } catch (e) {}

      /* 眼睛（bean / iris 两模式） */
      try {
        setEye(eyeL, pose.left, 0, yaw);
        setEye(eyeR, pose.right, 1, yaw);
      } catch (e) {}

      /* 嘴巴 / 前层配饰（眼镜）在眼睛之上 */
      try { drawMouth(pose, yaw); } catch (e) {}
      try { drawGlasses(pose, yaw, now); } catch (e) {}

      ctx.restore();

      if (lite) return;

      /* ---- zzz 睡眠粒子 ---- */
      if ((b.zzz || 0) > 0) try {
        for (var z = 0; z < 3; z++) {
          var zp = (now * 0.00033 + z / 3) % 1;
          var zo = (zp < 0.18 ? zp / 0.18 : 1 - (zp - 0.18) / 0.82) * 0.8 * b.zzz;
          ctx.save();
          ctx.globalAlpha = zo * fade;
          ctx.translate(186 + zp * 34 + 4 * Math.sin(zp * 9), 52 - zp * 42);
          ctx.rotate((-10 + zp * 14) * Math.PI / 180);
          ctx.fillStyle = palette.zzz || '#A8A296';
          ctx.font = 'italic 700 ' + (12 + zp * 11).toFixed(1) + 'px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('z', 0, 0);
          ctx.restore();
        }
      } catch (e) {}

      /* ---- 特效推进 + 前层绘制 ---- */
      if (fx) {
        try {
          fx.update(dt, now, {
            yaw: yaw, dYaw: dYaw, vel: vel,
            orbitWant: (b.orbit || 0) > 0,
            bodyX: b.x, bodyY: b.y
          });
        } catch (e) {}
        try { fx.drawLayer(ctx, true, fade); } catch (e) {}
      }
    }

    function burst(count) {
      if (fx) fx.burst(count);
    }
    /* 签名动作（云泡 / 星星爆闪），返回 false 表示该皮肤无签名 */
    function signature(strength) {
      return fx && fx.signature ? fx.signature(strength) : false;
    }

    function destroy() {
      if (fx) fx.destroy();
    }

    return {
      applyPose: applyPose, burst: burst, signature: signature, destroy: destroy,
      setFade: setFade,
      signatureComplete: !!(fx && fx.signatureComplete)
    };
  }

  module.exports = { createBall: createBall };
})();
