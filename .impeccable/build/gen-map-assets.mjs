// 地图标记资产生成器（程序化绘制，非 AI 生成）
// 产物 provenance：本脚本是唯一来源；重新运行即可复现两张 PNG。
// cup.png  108×108  teal 圆形水杯定位标记（替换旧橙色版，对齐晨光浅水品牌色）
// poi.png  48×48   附近地标小圆点标记（此前 map.js 引用但文件缺失）
// 用法：node .impeccable/build/gen-map-assets.mjs
import { deflateSync, crc32 } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(ROOT, "images", "markers");

function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const chunk = (type, data) => {
    const head = Buffer.alloc(4, 0);
    head.write(type, 0, "ascii");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcBuf) >>> 0, 0);
    return Buffer.concat([len, head, data, crc]);
  };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// 4x 超采样逐像素绘制
function render(size, shade) {
  const rgba = Buffer.alloc(size * size * 4, 0);
  const S = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const px = x + (sx + 0.5) / S;
          const py = y + (sy + 0.5) / S;
          const c = shade(px, py);
          if (c) {
            const ca = (c.length > 3 ? c[3] : 255) / 255;
            r += c[0] * ca; g += c[1] * ca; b += c[2] * ca; a += (c.length > 3 ? c[3] : 255);
          }
        }
      }
      const i = (y * size + x) * 4;
      if (a > 0) {
        rgba[i] = Math.round(r / (a / 255));
        rgba[i + 1] = Math.round(g / (a / 255));
        rgba[i + 2] = Math.round(b / (a / 255));
        rgba[i + 3] = Math.round(a / (S * S));
      }
    }
  }
  return rgba;
}

const TEAL = [15, 142, 168];      // #0F8EA8 品牌主色
const TEAL_DEEP = [11, 110, 134]; // #0B6E86 深一档，做标记下缘
const WHITE = [255, 255, 255];

function inDisc(px, py, cx, cy, rOuter, rInner) {
  const dx = px - cx, dy = py - cy;
  const d2 = dx * dx + dy * dy;
  return d2 <= rOuter * rOuter && (rInner === undefined || d2 >= rInner * rInner);
}

function inRoundRect(px, py, x0, y0, x1, y1, rad) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const nx = Math.max(x0 + rad, Math.min(px, x1 - rad));
  const ny = Math.max(y0 + rad, Math.min(py, y1 - rad));
  const dx = px - nx, dy = py - ny;
  return dx * dx + dy * dy <= rad * rad || (px >= x0 + rad && px <= x1 - rad) || (py >= y0 + rad && py <= y1 - rad);
}

// cup.png：白描边圆盘 + 双色 teal + 白色水杯剪影（杯身 + 杯柄 + 杯口水面线）
const cup = render(108, (px, py) => {
  const cx = 54, cy = 54;
  if (!inDisc(px, py, cx, cy, 52)) return null;
  if (!inDisc(px, py, cx, cy, 46)) return WHITE;                 // 白描边环
  const base = py > cy + 14 ? TEAL_DEEP : TEAL;                   // 下缘深一档
  if (inDisc(px, py, 74, 54, 10, 5.5)) return WHITE;              // 杯柄（右）
  if (inRoundRect(px, py, 33, 34, 67, 70, 7)) {
    if (py >= 60) return null;                                    // 杯身镂空下段？否：剪影保持实心
    return WHITE;
  }
  return base;
});

// poi.png：teal 实心小点 + 白描边，作地标锚点
const poi = render(48, (px, py) => {
  if (!inDisc(px, py, 24, 24, 21)) return null;
  if (!inDisc(px, py, 24, 24, 15)) return WHITE;
  return TEAL;
});

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "cup.png"), png(108, 108, cup));
writeFileSync(join(OUT_DIR, "poi.png"), png(48, 48, poi));
console.log("written:", join(OUT_DIR, "cup.png"), "108x108");
console.log("written:", join(OUT_DIR, "poi.png"), "48x48");
