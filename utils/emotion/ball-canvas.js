/* ============================================================
 * ball-canvas.js —— 渲染层（Canvas 2D 版）
 * 移植自开源项目 emotion-ball 的 ball.js（SVG 渲染层）
 * (github.com/sam70361/emotion-ball，引擎与配置数据双许可，
 *  个人学习研究免费；本文件为面向微信小程序 Canvas 的等义重写)
 *
 *   坐标系：viewBox -15 -15 259 259，头部中心 HEAD_C = 114.2705
 *   身体：形状轮廓环折线路径 + 径向渐变
 *   眼睛：48 点轮廓环路径 + 与 SVG 一致的 translate/rotate/scale 变换
 *   球面投影：局部半宽采样 + 经度换算 + 余弦压缩，背面隐藏
 *   彩带：自旋甩带 / 常驻环带，5-stop 色相漂移线性渐变，前后两段拆分
 *   撒花：一次性物理粒子（金五角星混入）
 * ============================================================ */
(function () {
  'use strict';

  var RD = require("./rings.js");
  var HEAD_C = RD.HEAD_C;
  var EYE_HALF = RD.EYE_HALF;
  var EXPR = RD.EXPRESSIONS;
  var STAR_GOLD = RD.STAR_GOLD;
  var CONFETTI_COLORS = ['#f9705c', '#5b95f0', '#3fbe86', '#f5b13f', '#9a72ee', '#35c3bd'];
  var TAU = Math.PI * 2;

  function r2(v) { return Math.round(v * 100) / 100; }
  function clamp(v, a, b) {
    /* NaN 防线：NaN 比较恒为 false 会原样穿透，污染几何与颜色计算 */
    if (v !== v) return a;
    return v < a ? a : (v > b ? b : v);
  }

  /* 渐变停点统一入口：真机内核对 addColorStop 的参数校验差异很大
   * （曾出现整帧抛错导致渲染循环空转、球消失）。这里钳位 offset、
   * 校验颜色，内核仍拒绝时静默放弃该停点——停点缺一两个只是色彩略偏，
   * 绝不允许炸掉帧循环 */
  function addStop(grad, offset, color) {
    try {
      var o = Number(offset);
      if (!isFinite(o)) o = 0;
      o = o < 0 ? 0 : (o > 1 ? 1 : o);
      if (typeof color !== 'string' || color.indexOf('NaN') >= 0) color = '#FFFFFF';
      grad.addColorStop(o, color);
    } catch (e) {}
  }

  function hslToHex(h, s, l) {
    /* 部分真机内核的 addColorStop 不认 hsl() 串，统一换算成 hex */
    s /= 100; l /= 100;
    var k = function (n) { return (n + h / 30) % 12; };
    var a = s * Math.min(l, 1 - l);
    var f = function (n) {
      var c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
      var hexc = Math.round(255 * c).toString(16);
      return hexc.length < 2 ? '0' + hexc : hexc;
    };
    return '#' + f(0) + f(8) + f(4);
  }
  function rand(a, b) { return a + Math.random() * (b - a); }

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

  /** 环 → canvas 折线路径 */
  function traceRing(ctx, ring) {
    ctx.beginPath();
    for (var i = 0; i < ring.length; i++) {
      if (i === 0) ctx.moveTo(ring[i][0], ring[i][1]);
      else ctx.lineTo(ring[i][0], ring[i][1]);
    }
    ctx.closePath();
  }

  function starPts() {
    var pts = [];
    for (var e = 0; e < 10; e++) {
      var a = -Math.PI / 2 + e * Math.PI / 5;
      var r = e % 2 === 0 ? 1 : 0.42;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return pts;
  }
  var STAR_PTS = starPts();
  /* 异常体色只上报一次（真机自愈兜底的观测点） */
  var anomalyReported = false;

  function createBall(surface, opts) {
    opts = opts || {};
    var lite = !!opts.lite;
    var shape = RD.SHAPES[opts.shape || 'blob'] || RD.SHAPES.blob;
    var face = shape.face;
    var headRing = shape.ring;

    var canvas = surface.canvas;
    var ctx = surface.ctx;

    /* viewBox(-15,-15,259,259) → 物理像素映射。
     * opts.margin > 1 时整体缩小绘制并保持居中，给弹跳/彩带留出画布余量，
     * 避免球体上跳时顶部被画布边缘裁切。 */
    var margin = (opts && opts.margin > 1) ? opts.margin : 1;
    var k = canvas.width / (289 * margin);
    var origin = canvas.width / 2 - 114.5 * k;

    /* ---- 形状轮廓采样：每 2px 一行的 [minX,maxX]，供眼睛贴合轮廓 ---- */
    var silMinY = 1e9, silMaxY = -1e9;
    for (var i0 = 0; i0 < headRing.length; i0++) {
      if (headRing[i0][1] < silMinY) silMinY = headRing[i0][1];
      if (headRing[i0][1] > silMaxY) silMaxY = headRing[i0][1];
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
        if (lo > hi) { lo = HEAD_C - 4; hi = HEAD_C + 4; }
        silRows.push([lo, hi]);
      }
    })();
    function silAt(y) {
      var r = Math.round((clamp(y, silMinY, silMaxY) - silMinY) / SIL_STEP);
      return silRows[clamp(r, 0, silRows.length - 1)];
    }

    /* ---- 眼睛基准 ---- */
    function buildEye(k2) {
      return { ring: EXPR[0][k2], c: centroid(EXPR[0][k2]), visible: true };
    }
    var eyeL = buildEye(0);
    var eyeR = buildEye(1);

    /* ---- 体色三停（径向渐变高光 / 基色 / 暗缘） ---- */
    var gradStops = { a: shade('#FFFFFF', 0.22), b: '#FFFFFF', c: shade('#FFFFFF', -0.12) };
    function setBodyColor(color) {
      /* 真机防线：非法颜色串会让 addColorStop 抛错并杀死整个渲染循环。
       * 异常仅上报一次（bootLog），随后用基色兜底保证球永不消失 */
      if (typeof color !== 'string' || color.indexOf('#') !== 0 || color.indexOf('NaN') >= 0) {
        if (!anomalyReported) {
          anomalyReported = true;
          try { require("../bootLog.js").reportError("ball:异常体色已兜底", String(color)); } catch (e) {}
        }
        color = '#FFFFFF';
      }
      gradStops.a = shade(color, 0.22);
      gradStops.b = color;
      gradStops.c = shade(color, -0.12);
    }

    function drawBody(pose) {
      var b = pose.body;
      ctx.save();
      ctx.translate(HEAD_C + b.x, HEAD_C + b.y);
      if (b.rotate) ctx.rotate(b.rotate * Math.PI / 180);
      ctx.scale(b.scale, b.scale);
      ctx.translate(-HEAD_C, -HEAD_C);

      /* 径向渐变（对应 SVG radialGradient 38% 32% 75%） */
      var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
      for (var i = 0; i < headRing.length; i++) {
        var p = headRing[i];
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      }
      var gw = maxX - minX, gh = maxY - minY;
      var g = ctx.createRadialGradient(
        minX + gw * 0.38, minY + gh * 0.32, gw * 0.05,
        minX + gw * 0.38, minY + gh * 0.32, gw * 0.75
      );
      addStop(g, 0, gradStops.a);
      addStop(g, 0.62, gradStops.b);
      addStop(g, 1, gradStops.c);
      traceRing(ctx, headRing);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(23, 36, 43, 0.16)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
    }

    /* ---- 眼睛：环路径 + 球面投影变换（与 SVG 版同一套数学） ---- */
    function setEye(eyeState, pose, baseC, yaw) {
      var ring = pose.ring;
      if (ring && ring !== eyeState.ring) {
        eyeState.ring = ring;
        eyeState.c = centroid(ring);
      }
      var c = eyeState.c;
      var open = clamp(pose.open, 0.02, 2.4);
      var sy = clamp(pose.scaleY * open * face.eye, 0.02, 2.4);
      var sxBase = pose.scaleX * face.eye;

      var halfH = EYE_HALF * sy + 2;
      var ey0 = HEAD_C + face.y + (c[1] - HEAD_C) * face.sy + pose.y + pose.lookY;
      ey0 = clamp(ey0, silMinY + halfH, silMaxY - halfH);

      var sil = silAt(ey0);
      var cx0 = (sil[0] + sil[1]) / 2;
      var hw = Math.max((sil[1] - sil[0]) / 2, 12);

      var ox = face.x + (c[0] - HEAD_C) * face.sx + pose.x + pose.lookX;
      var theta = clamp(ox / hw, -1.15, 1.15);
      var total = theta + (yaw || 0);
      var cn = Math.cos(total);
      if (cn <= 0.02) {
        eyeState.visible = false;
        return;
      }
      eyeState.visible = true;
      var ex = cx0 + hw * Math.sin(total) * 0.985;
      var dyN = (ey0 - HEAD_C) / 130;
      var fy = Math.sqrt(1 - dyN * dyN * 0.22);

      ctx.save();
      ctx.translate(ex, ey0);
      if (pose.rotate) ctx.rotate(pose.rotate * Math.PI / 180);
      ctx.scale(sxBase * cn, sy * fy);
      ctx.translate(-c[0], -c[1]);
      traceRing(ctx, ring);
      ctx.fillStyle = pose.color || '#1A1A1A';
      ctx.fill();
      ctx.restore();
    }

    /* ---- 彩带：轨道数学与原版一致 ---- */
    var trails = [];
    var planes = [];
    var planeG = 4;
    var baseHue = 0;
    var spawnAt = [];
    var spawnIdx = 0;
    var wasFast = false;
    var prevYaw = 0, prevNow = 0;
    var orbitNextAt = 0;
    var confPieces = [];

    function orbitPoint(o, lam) {
      var hx = o.rad * Math.sin(lam);
      var hy = -o.rad * Math.cos(lam) * Math.sin(o.tilt);
      var ca = Math.cos(o.roll), sa = Math.sin(o.roll);
      return {
        x: HEAD_C + hx * ca - hy * sa,
        y: HEAD_C + hx * sa + hy * ca,
        z: Math.cos(lam) * Math.cos(o.tilt),
        l: lam
      };
    }

    function makePlanes() {
      planes = [];
      var n = Math.random() < 0.45 ? 2 : 3;
      var roll0 = rand(-0.9, 0.9);
      for (var pi = 0; pi < n; pi++) {
        planes.push({
          tilt: rand(0.16, 0.72),
          roll: roll0 + pi * (Math.PI / n) + rand(-0.15, 0.15)
        });
      }
      planeG = Math.round(rand(4, 6));
      baseHue = rand(0, 360);
      spawnIdx = 0;
    }

    function createTrail(cfg) {
      if (trails.length > 8) return;
      trails.push({
        o: cfg.o, life: 0, ret: 0, hist: [],
        orbitMode: !!cfg.orbit,
        /* r：彩带基准宽度。反编译源此处丢失赋值导致 rb.r 恒为 undefined，
         * 宽度 NaN 会让彩带多边形坐标全为 NaN——浏览器内核静默忽略，
         * 部分真机原生 canvas 直接抛错，rAF 链死、球消失 */
        r: isFinite(cfg.r) ? cfg.r : 6,
        hue: cfg.hue,
        hueSpan: rand(45, 95) * (Math.random() < 0.5 ? 1 : -1),
        hueVel: rand(18, 42) * (Math.random() < 0.5 ? 1 : -1),
        opacity: 0,
        polys: null
      });
    }

    function spawnTrail(lam0, dir) {
      var pl = planes[spawnIdx % planes.length];
      var tierStep = 38 / Math.max(planeG - 1, 1);
      var rw = planeG <= 3 ? rand(8, 10.5) : planeG === 4 ? rand(6.6, 8.6) : rand(5.6, 7.4);
      createTrail({
        o: {
          lam: lam0, lamVel: dir * rand(0.5, 1.1),
          tilt: pl.tilt + rand(-0.04, 0.04),
          roll: pl.roll + rand(-0.05, 0.05),
          rad: 116 + spawnIdx * tierStep + rand(-1.5, 1.5),
          radVel: rand(0, 2.5),
          follow: rand(0.74, 0.94),
          carry: 0,
          arc: rand(2.2, 3.4)
        },
        hue: baseHue + 360 * spawnIdx / Math.max(planeG, 1) + rand(-14, 14),
        r: rw
      });
      spawnIdx++;
    }

    function spawnOrbit(idx) {
      createTrail({
        orbit: true,
        o: {
          lam: rand(0, TAU),
          lamVel: (Math.random() < 0.5 ? -1 : 1) * rand(1.7, 2.3),
          tilt: rand(0.1, 0.22),
          roll: rand(-0.12, 0.12),
          rad: 124 + idx * 16,
          radVel: 0,
          follow: 0.8,
          carry: 0,
          arc: rand(2.4, 3.2)
        },
        hue: rand(0, 360),
        r: rand(4.5, 6.5)
      });
    }

    /* 拖尾轮廓顶点：头宽尾细，按 z 正负拆前/后两组多边形（弧形端帽简化为直边） */
    function buildTrail(hist, width) {
      var n = hist.length;
      var nx = [], ny = [], e;
      for (e = 0; e < n; e++) {
        var p0 = hist[e > 0 ? e - 1 : 0], p1 = hist[e < n - 1 ? e + 1 : n - 1];
        var dx = p1.x - p0.x, dy = p1.y - p0.y;
        var h = Math.hypot(dx, dy) || 1;
        dx /= h; dy /= h;
        var d = width * (0.5 + (e / (n - 1)) * 0.5) / 2;
        nx.push(-dy * d); ny.push(dx * d);
      }
      function poly(idxList) {
        var pts = [];
        for (var s = 0; s < idxList.length; s++) {
          var i = idxList[s];
          pts.push([hist[i].x + nx[i], hist[i].y + ny[i]]);
        }
        for (var t = idxList.length - 1; t >= 0; t--) {
          var j = idxList[t];
          pts.push([hist[j].x - nx[j], hist[j].y - ny[j]]);
        }
        return pts;
      }
      var order = [], d0 = 0;
      while (d0 < n) {
        var isF = hist[d0].z >= 0;
        var i2 = d0;
        while (i2 + 1 < n && (hist[i2 + 1].z >= 0) === isF) i2++;
        order.push({ front: isF, a: Math.max(d0 - 1, 0), b: Math.min(i2 + 1, n - 1) });
        d0 = i2 + 1;
      }
      var frontIdx = [], backIdx = [];
      for (var q = order.length - 1; q >= 0; q--) {
        var seg = order[q];
        if (seg.b <= seg.a) continue;
        var list = seg.front ? frontIdx : backIdx;
        for (var m = seg.a; m <= seg.b; m++) list.push(m);
      }
      return {
        front: frontIdx.length > 1 ? poly(frontIdx) : null,
        back: backIdx.length > 1 ? poly(backIdx) : null
      };
    }

    function removeTrail(idx) {
      trails.splice(idx, 1);
    }

    function fillPoly(pts) {
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]);
        else ctx.lineTo(pts[i][0], pts[i][1]);
      }
      ctx.closePath();
      ctx.fill();
    }

    /* ---- 撒花 ---- */
    function burst(count) {
      if (lite) return;
      count = count || 20;
      for (var i = 0; i < count && confPieces.length < 60; i++) {
        var ang = (i / count) * TAU + rand(-0.35, 0.35);
        var spd = rand(170, 360);
        var star = Math.random() < 0.18;
        var round = !star && Math.random() < 0.3;
        confPieces.push({
          x: HEAD_C + Math.cos(ang) * rand(96, 116),
          y: HEAD_C + Math.sin(ang) * rand(96, 116),
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - rand(20, 75),
          life: 0, max: rand(0.45, 0.85),
          r: star ? rand(4, 7) : rand(3.5, 8),
          rot: rand(0, 360), vr: rand(-260, 260),
          stretch: (!star && !round) ? 1.9 : 1,
          kind: star ? 'star' : round ? 'dot' : 'rect',
          color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0]
        });
      }
    }

    /* ---- 像素级淡入淡出 ----
     * 同层 canvas 在部分内核不吃祖先 CSS opacity（模块淡入淡出时球不跟随），
     * 淡入淡出只能画进位图：因子随每帧乘进所有 globalAlpha（含本体绘制） */
    var fade = 1;
    function setFade(v) {
      var n = Number(v);
      fade = isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
    }

    /* ---- 每帧 ---- */
    function applyPose(pose) {
      var b = pose.body;
      var now = Date.now();
      /* 体色跟随表情配置（21 生气红 / 34 出错警示红 / 害羞粉等）。
       * 不能写死白色：表情数据的 base 色是设计好的着色契约 */
      setBodyColor(b.color || '#FFFFFF');

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(k, 0, 0, k, origin, origin);

      var dt = prevNow ? clamp((now - prevNow) / 1000, 0.001, 0.05) : 1 / 60;
      prevNow = now;

      /* 自旋角速度（甩带触发源） */
      var yaw = b.yaw || 0;
      var dYaw = yaw - prevYaw;
      if (!isFinite(dYaw) || Math.abs(dYaw) > 1.2) dYaw = 0;
      prevYaw = yaw;
      var vel = dYaw / dt;
      var fast = Math.abs(vel) >= 0.9;
      var dir = vel >= 0 ? 1 : -1;

      if (fast && !wasFast) {
        makePlanes();
        spawnAt = [];
        for (var q = 0; q < planeG; q++) spawnAt.push(now + q * rand(55, 105));
      }
      if (!fast) spawnAt.length = 0;
      wasFast = fast;
      if (Math.abs(vel) >= 5) {
        while (spawnAt.length && now >= spawnAt[0]) {
          spawnAt.shift();
          spawnTrail(yaw - rand(0, 0.18) * dir, dir);
        }
      }

      var orbitWant = (b.orbit || 0) > 0;
      if (orbitWant && now >= orbitNextAt) {
        var orbitCount = 0;
        for (var oc = 0; oc < trails.length; oc++) if (trails[oc].orbitMode) orbitCount++;
        if (orbitCount < 2) spawnOrbit(orbitCount);
        orbitNextAt = now + 700;
      }

      /* 彩带逐帧更新（数学同原版） */
      for (var ti = trails.length - 1; ti >= 0; ti--) {
        var rb = trails[ti];
        rb.life += dt;
        var retract = rb.orbitMode ? !orbitWant : (!fast || rb.life > 5);
        rb.ret = clamp(rb.ret + (retract ? dt / 0.5 : -dt / 0.35), 0, 1);
        if (retract && rb.ret >= 1) { removeTrail(ti); continue; }
        var o = rb.o;
        if (rb.orbitMode) {
          o.lam += o.lamVel * dt + dYaw * o.follow;
        } else if (fast) {
          o.carry = vel * o.follow;
          o.lam += dYaw * o.follow + o.lamVel * dt;
        } else {
          o.lam += (o.carry + o.lamVel) * dt;
          o.carry *= Math.exp(-2.6 * dt);
          o.lamVel *= Math.exp(-2.6 * dt);
        }
        o.rad += o.radVel * dt;

        var hist = rb.hist;
        var lastL = hist.length ? hist[hist.length - 1].l : o.lam - 0.001 * dir;
        var dl = o.lam - lastL;
        var steps = Math.min(Math.ceil(Math.abs(dl) / 0.09), 24);
        for (var st = 1; st <= steps; st++) hist.push(orbitPoint(o, lastL + dl * st / steps));
        if (!hist.length) hist.push(orbitPoint(o, o.lam));

        var span = o.arc * (1 - rb.ret * rb.ret * (3 - 2 * rb.ret));
        while (hist.length > 2 && Math.abs(o.lam - hist[0].l) > span) hist.shift();
        var over = Math.abs(o.lam - hist[0].l) - span;
        if (hist.length >= 2 && over > 0) {
          var tl = hist[0].l + (o.lam - hist[0].l >= 0 ? 1 : -1) * over;
          hist[0] = orbitPoint(o, tl);
        }
        if (hist.length > 48) hist.splice(0, hist.length - 48);

        var zHead = Math.cos(o.lam) * Math.cos(o.tilt);
        var pz = 0.72 + 0.28 * clamp(zHead, 0, 1);
        var grow = Math.min(rb.life / 0.34, 1);
        grow = grow * grow * (3 - 2 * grow);
        var width = rb.r * pz * 1.7 * grow * (1 - 0.72 * rb.ret * rb.ret);
        rb.opacity = Math.min(rb.life / 0.26, 1);

        if (hist.length < 2 || !(width >= 0.5)) {
          rb.polys = null;
          continue;
        }
        rb.polys = buildTrail(hist, width);

        /* 5-stop 色相漂移渐变，端点跟随首尾 */
        var tail = hist[0], headP = hist[hist.length - 1];
        var hue = rb.hue + rb.hueVel * rb.life;
        var lg = ctx.createLinearGradient(tail.x, tail.y, headP.x, headP.y);
        for (var si = 0; si < 5; si++) {
          var frac = si / 4;
          var hv = hue + frac * rb.hueSpan;
          var hueN = ((hv % 360) + 360) % 360;
          if (!isFinite(hueN)) hueN = 0;
          addStop(lg, frac, hslToHex(hueN, 56, 56 + 11 * frac));
        }
        rb.grad = lg;
      }

      /* ===== 绘制顺序：背层彩带 → 身体+眼睛 → 前层彩带 → zzz → 撒花 ===== */

      /* 背层（装饰层尽力渲染：单条异常只跳过本条。真机原生 canvas 对
       * 退化/异常参数可能直接抛错，若拖垮整帧，画布停在已清屏状态，
       * 观感即"球消失数秒后恢复"） */
      for (var bi = 0; bi < trails.length; bi++) {
        var tb = trails[bi];
        if (!tb.polys || !tb.polys.back || tb.opacity <= 0) continue;
        try {
          ctx.fillStyle = tb.grad;
          ctx.globalAlpha = tb.opacity * fade;
          fillPoly(tb.polys.back);
          ctx.globalAlpha = fade;
        } catch (e) { tb.polys = null; }
      }

      /* 身体 + 眼睛（同一变换域，对应原 bodyG） */
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(HEAD_C + b.x, HEAD_C + b.y);
      if (b.rotate) ctx.rotate(b.rotate * Math.PI / 180);
      ctx.scale(b.scale, b.scale);
      ctx.translate(-HEAD_C, -HEAD_C);
      drawHeadFillOnly();
      var ey = b.yaw || 0;
      setEye(eyeL, pose.left, eyeL.c, ey);
      setEye(eyeR, pose.right, eyeR.c, ey);
      ctx.restore();

      /* 前层彩带（同背层：装饰层尽力渲染） */
      for (var fi = 0; fi < trails.length; fi++) {
        var tf = trails[fi];
        if (!tf.polys || !tf.polys.front || tf.opacity <= 0) continue;
        try {
          ctx.fillStyle = tf.grad;
          ctx.globalAlpha = tf.opacity * fade;
          fillPoly(tf.polys.front);
          ctx.globalAlpha = fade;
        } catch (e) { tf.polys = null; }
      }

      /* zzz 睡眠粒子（装饰层尽力渲染） */
      if (!lite && (b.zzz || 0) > 0) try {
        for (var z = 0; z < 3; z++) {
          var zp = (now * 0.00033 + z / 3) % 1;
          var zo = (zp < 0.18 ? zp / 0.18 : 1 - (zp - 0.18) / 0.82) * 0.8 * b.zzz;
          var zx = 180 + zp * 34 + 4 * Math.sin(zp * 9);
          var zy = 48 - zp * 42;
          ctx.save();
          ctx.globalAlpha = zo * fade;
          ctx.translate(zx, zy);
          ctx.rotate((-10 + zp * 14) * Math.PI / 180);
          ctx.fillStyle = '#A8A296';
          ctx.font = 'italic 700 ' + (12 + zp * 11).toFixed(1) + 'px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('z', 0, 0);
          ctx.restore();
        }
      } catch (e) {}

      /* 撒花更新与绘制（装饰层尽力渲染） */
      for (var ci = confPieces.length - 1; ci >= 0; ci--) {
        var pc = confPieces[ci];
        pc.life += dt;
        if (pc.life >= pc.max) { confPieces.splice(ci, 1); continue; }
        try {
        pc.x += pc.vx * dt;
        pc.y += pc.vy * dt;
        var drag = Math.pow(0.94, 60 * dt);
        pc.vx *= drag;
        pc.vy = pc.vy * drag + 40 * dt;
        pc.rot += pc.vr * dt;
        var u = pc.life / pc.max;
        var fd = u < 0.1 ? u / 0.1 : Math.pow(1 - (u - 0.1) / 0.9, 1.7);
        var sz = Math.max(pc.r * (1 - 0.4 * u), 0.5);
        ctx.save();
        ctx.globalAlpha = fd * fade;
        ctx.translate(pc.x, pc.y);
        ctx.rotate(pc.rot * Math.PI / 180);
        ctx.scale(sz, sz * pc.stretch);
        ctx.fillStyle = pc.kind === 'star' ? STAR_GOLD : pc.color;
        if (pc.kind === 'star') {
          ctx.beginPath();
          for (var sp = 0; sp < STAR_PTS.length; sp++) {
            if (sp === 0) ctx.moveTo(STAR_PTS[sp][0], STAR_PTS[sp][1]);
            else ctx.lineTo(STAR_PTS[sp][0], STAR_PTS[sp][1]);
          }
          ctx.closePath();
          ctx.fill();
        } else if (pc.kind === 'dot') {
          ctx.beginPath();
          ctx.arc(0, 0, 1, 0, TAU);
          ctx.fill();
        } else {
          ctx.fillRect(-0.5, -0.5, 1, 1);
        }
        ctx.restore();
        } catch (e) { confPieces.splice(ci, 1); }
      }
    }

    /* 头部填充单独抽出（drawBody 内联版本供非眼睛路径使用） */
    function drawHeadFillOnly() {
      var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
      for (var i = 0; i < headRing.length; i++) {
        var p = headRing[i];
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      }
      var gw = maxX - minX, gh = maxY - minY;
      var g = ctx.createRadialGradient(
        minX + gw * 0.38, minY + gh * 0.32, gw * 0.05,
        minX + gw * 0.38, minY + gh * 0.32, gw * 0.75
      );
      addStop(g, 0, gradStops.a);
      addStop(g, 0.62, gradStops.b);
      addStop(g, 1, gradStops.c);
      traceRing(ctx, headRing);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(23, 36, 43, 0.16)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    function destroy() {
      trails.length = 0;
      confPieces.length = 0;
    }

    return { applyPose: applyPose, burst: burst, destroy: destroy, setFade: setFade };
  }

  module.exports = { createBall: createBall };
})();
