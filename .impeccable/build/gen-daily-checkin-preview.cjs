// 生成 pages/daily-checkin 的静态预览：镜像 wxss（rpx→px ×0.5，375 视口），
// 用模拟数据渲染「进行中 / 已达标」两个状态，供截图验收。
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");
const wxssPath = path.join(root, "pages", "daily-checkin", "daily-checkin.wxss");
const outPath = path.join(__dirname, "..", "preview", "daily-checkin.html");

let css = fs.readFileSync(wxssPath, "utf8");
css = css.replace(/(-?\d+(?:\.\d+)?)rpx/g, (_, n) => (Number(n) * 0.5) + "px");
// 预览里 .page 同时用于两个并排机框，去掉全屏高差
css = css.replace("min-height: 100vh;", "min-height: 812px;");

const majors = [
  { pct: 0, ml: "0" }, { pct: 25, ml: "500" }, { pct: 50, ml: "1,000" },
  { pct: 75, ml: "1,500" }, { pct: 100, ml: "2,000" }
];
const grid = [
  { left: 0, label: "6" }, { left: 33.333, label: "12" },
  { left: 66.667, label: "18" }, { left: 100, label: "24" }
];

function scale(items) {
  return items.map((i) =>
    `<div class="rulerScaleNum" style="left:${i.pct}%">${i.ml}</div>`).join("");
}
function gridScale(items) {
  return items.map((i) =>
    `<div class="rhythmScaleNum" style="left:${i.left}%">${i.label}</div>`).join("");
}
function gridLines(items) {
  return items.map((i) => `<div class="rhythmGrid" style="left:${i.left}%"></div>`).join("");
}
function notches(list) {
  return list.map((n) =>
    `<div class="rulerNotch" style="left:${n.left}%"></div>`).join("");
}
function ticks(list) {
  return list.map((t) =>
    `<div class="rhythmTick t${t.size}" style="left:${t.left}%"></div>`).join("");
}
function dots(list) {
  return list.map((d) =>
    `<div class="weekDot"><div class="weekDotDisc ${d.state}${d.today ? " today" : ""}"></div>` +
    `<div class="weekDotLabel${d.today ? " today" : ""}">${d.label}</div></div>`).join("");
}

const chips = [120, 200, 300, 500].map((n) =>
  `<div class="quickChip"><div class="quickChipNum">${n}</div><div class="quickChipUnit">ml</div></div>`).join("");

function phone(state) {
  const stamp = state.reached
    ? `<div class="stamp"><div class="stampText">达 标</div><div class="stampDate">8.29</div></div>` : "";
  const goalEditor = state.goalEditing
    ? `<div class="goalEditor">
        <div class="goalStepBtn"><div class="goalStepSign">−</div><div class="goalStepUnit">100ml</div></div>
        <div class="goalDraftBox"><div class="goalDraftNum">2000</div><div class="goalDraftUnit">ml</div></div>
        <div class="goalStepBtn"><div class="goalStepSign">＋</div><div class="goalStepUnit">100ml</div></div>
        <div class="goalSaveBtn"><div class="goalSaveText">存</div></div>
      </div>
      <div class="goalHint">范围 800–6000ml，步进 100ml</div>` : "";
  const advisorBody = state.adviceOpen
    ? `<div class="advisorBody">
        <div class="advisorLine">你最近 7 天有 5 天达标，下午 2 点到 4 点最容易断水。</div>
        <div class="advisorLine">建议把午后那杯提前到 1 点半，量保持在 250ml 上下。</div>
        <div class="advisorMore"><div class="advisorMoreText">觉得不够细，去对话页接着问 ›</div></div>
      </div>` : "";
  return `<div class="page">
    <div class="topRow">
      <div class="dateText">8月29日 · 周六</div>
      <div class="goalChip"><div class="goalChipText">目标 2000ml</div><div class="goalChipChevron"></div></div>
    </div>
    ${goalEditor}
    <div class="ledger">
      <div class="ledgerNumRow">
        <div class="ledgerNum">${state.totalLabel}</div>
        <div class="ledgerUnit">ml</div>
        ${stamp}
      </div>
      <div class="ledgerSub">${state.ledgerSub}</div>
    </div>
    <div class="rulerSec">
      <div class="rulerTrack">
        <div class="rulerFill" style="width:${state.fill}%"></div>
        ${majors.map((m) => `<div class="rulerMajor" style="left:${m.pct}%"></div>`).join("")}
        ${notches(state.notches)}
      </div>
      <div class="rulerScale">${scale(majors)}</div>
    </div>
    <div class="rhythmSec">
      <div class="rhythmHead">
        <div class="rhythmTitle">今天的节奏</div>
        <div class="rhythmMeta">共 ${state.notches.length} 笔</div>
      </div>
      <div class="rhythmBand">
        ${gridLines(grid)}
        ${ticks(state.ticks)}
        <div class="rhythmNow" style="left:${state.nowLeft}%"></div>
      </div>
      <div class="rhythmScale">${gridScale(grid)}</div>
    </div>
    <div class="lastDrinkRow">
      <div class="lastDrinkIcon"></div>
      <div class="lastDrinkText">${state.lastDrink}</div>
    </div>
    <div class="checkinSec">
      <div class="primaryBtn">
        <div class="primaryBtnText">咕咚一下</div>
        <div class="primaryBtnDivider"></div>
        <div class="primaryBtnAmount">${state.suggest}ml</div>
      </div>
      <div class="quickChips">${chips}</div>
      <div class="customRow">
        <input class="customInput" placeholder="另有记法，直接写毫升数" />
        <div class="customBtn"><div class="customBtnText">记一笔</div></div>
      </div>
    </div>
    <div class="streakRow">
      <div class="streakLeft">
        <div class="streakNum">${state.streak}</div>
        <div class="streakWords">
          <div class="streakLabel">连续达标</div>
          <div class="streakTail">${state.streakTail}</div>
        </div>
      </div>
      <div class="weekDots">${dots(state.dots)}</div>
    </div>
    <div class="advisor">
      <div class="advisorHead">
        <div class="advisorSpark"></div>
        <div class="advisorTitle">水顾问</div>
        <div class="advisorMeta">${state.adviceMeta}</div>
        <div class="advisorChevron${state.adviceOpen ? " up" : ""}"></div>
      </div>
      ${advisorBody}
    </div>
    <div class="footLink"><div class="footLinkText">全部记录与打卡日历 ›</div></div>
  </div>`;
}

const stateA = {
  reached: false, goalEditing: false, adviceOpen: false,
  totalLabel: "1,240", ledgerSub: "还差 760ml · 已完成 62%", fill: 62,
  notches: [{ left: 10 }, { left: 25 }, { left: 37 }, { left: 62 }],
  ticks: [{ left: 13.9, size: 1 }, { left: 25.5, size: 2 }, { left: 40.7, size: 2 }, { left: 47.4, size: 3 }],
  nowLeft: 51.8, lastDrink: "上一杯 14:32 · 47 分钟前", suggest: 150,
  streak: 5, streakTail: "今天的还没落定",
  dots: [
    { label: "日", state: "partial" }, { label: "一", state: "full" }, { label: "二", state: "full" },
    { label: "三", state: "full" }, { label: "四", state: "full" }, { label: "五", state: "full" },
    { label: "六", state: "partial", today: true }
  ],
  adviceMeta: "看看今天喝得怎么样"
};

const stateB = {
  reached: true, goalEditing: true, adviceOpen: true,
  totalLabel: "2,120", ledgerSub: "目标完成，多出的 120ml 都是赚的", fill: 100,
  notches: [{ left: 12 }, { left: 27 }, { left: 41 }, { left: 60 }, { left: 88 }, { left: 100 }],
  ticks: [{ left: 12, size: 1 }, { left: 26.4, size: 2 }, { left: 41.2, size: 2 }, { left: 55.6, size: 3 }, { left: 70.4, size: 2 }, { left: 90.2, size: 3 }],
  nowLeft: 91.5, lastDrink: "上一杯 19:40 · 12 分钟前", suggest: 200,
  streak: 6, streakTail: "今天稳了，明天再来",
  dots: [
    { label: "日", state: "full" }, { label: "一", state: "full" }, { label: "二", state: "full" },
    { label: "三", state: "full" }, { label: "四", state: "full" }, { label: "五", state: "full" },
    { label: "六", state: "full", today: true }
  ],
  adviceMeta: "读的是最近一次周报"
};

const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>每日打卡 预览</title>
<style>
  body { margin: 0; background: #9aa4a9; display: flex; gap: 24px; justify-content: center; padding: 20px 0; }
  .frame { width: 375px; flex-shrink: 0; box-shadow: 0 10px 30px rgba(0,0,0,0.3); background: #fff; }
  .frameTitle { text-align: center; font: 600 12px/1 -apple-system, "PingFang SC", sans-serif; color: #fff; padding: 8px 0; }
  .nav { height: 44px; display: flex; align-items: center; justify-content: center; font: 600 17px/1 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color: #17262d; background: #fff; }
  input { font-family: inherit; }
</style>
<style>${css}</style>
</head>
<body>
  <div class="frame"><div class="frameTitle">进行中 62%</div><div class="nav">每日打卡</div>${phone(stateA)}</div>
  <div class="frame"><div class="frameTitle">已达标 · 目标编辑 · AI建议展开</div><div class="nav">每日打卡</div>${phone(stateB)}</div>
</body>
</html>`;

fs.writeFileSync(outPath, html);
console.log("written:", outPath);
