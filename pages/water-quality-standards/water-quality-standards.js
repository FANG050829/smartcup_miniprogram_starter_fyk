var CHINA_WATER_STANDARD = Object.freeze({
  source: "GB 5749-2022《生活饮用水卫生标准》",
  tdsMaxMgL: 1000
});
var LAST_TDS_KEY = "smartcup_last_tds_ppm";
var normalizeTds = function normalizeTds(value) {
  var num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.round(num));
};
var buildCurrentTdsDesc = function buildCurrentTdsDesc(tds) {
  if (!Number.isFinite(tds)) {
    return {
      valueText: "--",
      judgeText: "未传入当前TDS数据。"
    };
  }
  var isWithin = tds <= CHINA_WATER_STANDARD.tdsMaxMgL;
  return {
    valueText: "".concat(tds, " ppm"),
    judgeText: isWithin ? "\u7EA6\u7B49\u4E8E ".concat(tds, " mg/L\uFF0C\u672A\u8D85\u8FC7\u56FD\u6807\u4E0A\u9650 ").concat(CHINA_WATER_STANDARD.tdsMaxMgL, " mg/L\u3002") : "\u7EA6\u7B49\u4E8E ".concat(tds, " mg/L\uFF0C\u5DF2\u8D85\u8FC7\u56FD\u6807\u4E0A\u9650 ").concat(CHINA_WATER_STANDARD.tdsMaxMgL, " mg/L\u3002")
  };
};
Page({
  data: {
    standardSource: CHINA_WATER_STANDARD.source,
    tdsStandardMax: CHINA_WATER_STANDARD.tdsMaxMgL,
    currentTdsValue: "--",
    currentTdsJudge: "未传入当前TDS数据。",
    tdsRows: [{
      range: "≤ 300 ppm",
      desc: "溶解性总固体较低，口感通常较好（口感参考）。"
    }, {
      range: "300 - 600 ppm",
      desc: "常见生活饮用范围（口感参考）。"
    }, {
      range: "600 - 1000 ppm",
      desc: "接近国标上限，建议关注水源情况。"
    }, {
      range: "> 1000 ppm",
      desc: "超过国标上限，不建议作为生活饮用水。"
    }],
    ppmExplainRows: [{
      title: "测量对象",
      desc: "本程序 ppm 来自 TDS 探针，反映水中溶解性总固体（Total Dissolved Solids）的估算浓度。"
    }, {
      title: "换算方式",
      desc: "固件基于电导相关信号进行 TDS 估算并输出 ppm，通常可近似理解为 mg/L。"
    }, {
      title: "能力边界",
      desc: "该 ppm 不是某一种单独污染物浓度，也不能替代实验室全项水质检测。"
    }]
  },
  onLoad: function onLoad(options) {
    var optionTds = normalizeTds(options && options.tds);
    var cachedTds = normalizeTds(wx.getStorageSync(LAST_TDS_KEY));
    var tds = Number.isFinite(optionTds) ? optionTds : cachedTds;
    var summary = buildCurrentTdsDesc(tds);
    this.setData({
      currentTdsValue: summary.valueText,
      currentTdsJudge: summary.judgeText
    });
  }
});