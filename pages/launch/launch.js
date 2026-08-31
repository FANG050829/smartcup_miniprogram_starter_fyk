var TIPS = [
    "正在唤醒水杯",
    "连接云端饮水记录"
];

var SETTLE_AT = 1900;
var MIN_SHOW_DURATION = 1400;
var RIPPLE_HOLD = 680;
var LEAVE_ANIMATION = 500;
var GUARD_DURATION = 3600;
// 全程只轮换一次：每条文案可读 ≥1.5s，且与 1900ms 的涟漪时刻错开 400ms
var TIP_SWITCH_AT = 1500;

Page({
    data: {
        tip: TIPS[0],
        tipAlt: false,
        settled: false,
        leaving: false
    },
    _timers: [],
    _startAt: 0,
    _finishing: false,

    onLoad: function onLoad() {
        var self = this;
        this._startAt = Date.now();

        // 状态文案轻声轮换，交替 class 让淡入动画重放
        var tipTimer = setTimeout(function() {
            self.setData({
                tip: TIPS[1],
                tipAlt: !self.data.tipAlt
            });
        }, TIP_SWITCH_AT);
        this._timers.push(tipTimer);

        // 到点注满：涟漪一圈，再整体淡出
        var settleTimer = setTimeout(function() {
            self._finish();
        }, SETTLE_AT);
        this._timers.push(settleTimer);

        // 兜底：极端情况下也保证能进入首页
        var guardTimer = setTimeout(function() {
            if (!self._finishing) {
                self._finish();
            }
        }, GUARD_DURATION);
        this._timers.push(guardTimer);
    },

    _finish: function _finish() {
        if (this._finishing) return;
        this._finishing = true;
        var self = this;

        this.setData({ settled: true });

        var wait = Math.max(RIPPLE_HOLD, MIN_SHOW_DURATION - (Date.now() - this._startAt));
        setTimeout(function() {
            self.setData({ leaving: true });
            // 等淡出动画结束再切到首页（tabBar 页用 switchTab）
            setTimeout(function() {
                wx.switchTab({
                    url: "/pages/index/index",
                    fail: function fail() {
                        wx.reLaunch({ url: "/pages/index/index" });
                    }
                });
            }, LEAVE_ANIMATION);
        }, wait);
    },

    onUnload: function onUnload() {
        this._timers.forEach(function(t) {
            clearInterval(t);
            clearTimeout(t);
        });
        this._timers = [];
    }
});
