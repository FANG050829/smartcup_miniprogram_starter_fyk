/* ============================================================
 * glanceEmotions.js —— 首页专属的"看向按钮"表情（50+ 自定义段）
 *
 * 在首页四宫格中央的伙伴球会用目光打量四个功能按钮：
 *   50 看向设备(TL) · 51 看向定位(TR) · 52 看向智聊(BL) · 53 看向加热(BR)
 *
 * 为什么不能手填 lookX/lookY：眼环池 2 的双眼静息中点本就偏在脸的
 * 右下方（相对球心约 62-74°），渲染层 lookX 还要过球面投影的 sin 压缩，
 * 再叠加 body 平移与转头旋转——同样 +10 的位移在不同方向上读起来
 * 完全不同（实测上下角差近 50°）。所以这里内置渲染层的同款投影模型，
 * 按"眼对中点落到球心→按钮中心的方向线上"这个目标反解 (lookX, lookY)。
 *
 * 目标几何（index.wxss controlPad 实测）：按钮中心相对球心 (∓141, ∓115)rpx，
 * 约 39.2° 对角线；眼对中点目标距离 GAZE_DIST 取 42 个 viewBox 单位
 * （球头半径 ~114，约 37%，够明显且不顶到脸缘）。
 * gaze:false 关闭目光漫游锁死方向；看向期间表情完全冻结：单一眼环池
 * （不变脸）、无眼睛/身体动画，只保留眨眼；由首页按 15-30 秒随机调度
 * （petStore.flash），不进常规巡演。
 * ============================================================ */

var RING = require("../emotion/rings.js");

var HEAD_C = 114.2705;
var FACE_R = 114.27;          /* blob 头部半径（viewBox 单位） */
var EYE_RING = 2;             /* 与下方 pool: [2] 保持一致 */
var GAZE_DIST = 42;           /* 眼对中点目标距离（viewBox 单位） */

function centroid(ring) {
  var x = 0, y = 0;
  for (var i = 0; i < ring.length; i++) { x += ring[i][0]; y += ring[i][1]; }
  return [x / ring.length, y / ring.length];
}

/* 复刻 ball-canvas.setEye 的眼睛落点 + applyPose 的 body 旋转→平移顺序，
 * 返回双眼渲染中点（viewBox 绝对坐标）。只建模 glance 用到的通道。 */
function eyeMid(lookX, lookY, body) {
  var mx = 0, my = 0;
  for (var i = 0; i < 2; i++) {
    var c = centroid(RING.EXPRESSIONS[EYE_RING][i]);
    var ey0 = HEAD_C + (c[1] - HEAD_C) + lookY;
    var dy0 = ey0 - HEAD_C;
    var hw = Math.max(Math.sqrt(Math.max(FACE_R * FACE_R - dy0 * dy0, 0)), 12);
    var theta = (c[0] - HEAD_C + lookX) / hw;
    theta = Math.max(-1.15, Math.min(1.15, theta));
    var ex = HEAD_C + hw * Math.sin(theta) * 0.985;
    var t = (body.rotate || 0) * Math.PI / 180;
    var cos = Math.cos(t), sin = Math.sin(t);
    var dx = ex - HEAD_C, dy = ey0 - HEAD_C;
    mx += HEAD_C + dx * cos - dy * sin + body.x;
    my += HEAD_C + dx * sin + dy * cos + body.y;
  }
  return [mx / 2, my / 2];
}

/* 反解：迭代逼近"眼对中点 = 球心 + 目标方向 × GAZE_DIST"（绝对坐标）。
 * 投影映射接近恒等（∂位移/∂lookX≈0.85、∂/∂lookY=1），小步长收敛很快；
 * lookX/lookY 设上限防病态发散。 */
function solveLook(dirX, dirY, body) {
  var len = Math.sqrt(dirX * dirX + dirY * dirY);
  var tx = HEAD_C + dirX / len * GAZE_DIST;
  var ty = HEAD_C + dirY / len * GAZE_DIST;
  var lx = 0, ly = 0;
  for (var k = 0; k < 60; k++) {
    var p = eyeMid(lx, ly, body);
    lx += (tx - p[0]) * 0.5;
    ly += (ty - p[1]) * 0.5;
    lx = Math.max(-200, Math.min(200, lx));
    ly = Math.max(-200, Math.min(200, ly));
  }
  return [Math.round(lx), Math.round(ly)];
}

function glance(id, name, dirX, dirY, bodyX, bodyY, rotate, desc) {
  var body = { x: bodyX, y: bodyY, rotate: rotate, breathe: 0.008 };
  var look = solveLook(dirX, dirY, body);
  return {
    id: id,
    name: name,
    group: 'custom',
    desc: desc,
    transition: 700,
    gaze: false,
    pool: [2],
    poolMs: [60000, 60000],
    blinkMs: [3000, 6500],
    body: body,
    eyes: { both: { lookX: look[0], lookY: look[1] } },
    anims: []
  };
}

/* 方向 = 按钮中心相对球心（index.wxss：列 270+缝 12、行 214+缝 16 的几何） */
module.exports = [
  glance('50', '看向设备', -141, -115, -10, -6, -9, '眼睛瞟向左上角的设备按钮，像在提醒你该连水杯了'),
  glance('51', '看向定位', 141, -115, 10, -6, 9, '眼睛瞟向右上角的定位按钮，好奇杯子现在在哪'),
  glance('52', '看向智聊', -141, 115, -10, 6, -9, '眼睛瞟向左下角的智聊按钮，想找你聊两句'),
  glance('53', '看向加热', 141, 115, 10, 6, 9, '眼睛瞟向右下角的加热按钮，惦记着热水')
];
