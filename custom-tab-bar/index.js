var wxCompat = require("../utils/wxCompat");
var bootLog = require("../utils/bootLog");

/* 切换锁兜底释放时长：playExitAnim(300ms) + switchTab 正常远快于该值，
 * 仅防 complete 未回调时锁死 */
var SWITCH_LOCK_RELEASE_MS = 1500;

Component({
  data: {
    selected: 0,
    hidden: false,
    safeInsetBottom: 0,
    pulseIndex: -1,
    list: [{
      pagePath: "/pages/index/index",
      text: "首页",
      icon: "home"
    }, {
      pagePath: "/pages/plan/plan",
      text: "计划",
      icon: "plan"
    }, {
      pagePath: "/pages/mood/mood",
      text: "心情",
      icon: "mood"
    }, {
      pagePath: "/pages/profile/profile",
      text: "我的",
      icon: "mine"
    }]
  },
  lifetimes: {
    attached: function attached() {
      try {
        var sys = wxCompat.getLayoutMetrics();
        var safeArea = sys && sys.safeArea;
        var screenHeight = Number(sys && sys.screenHeight) || 0;
        var bottom = safeArea && Number(safeArea.bottom);
        var inset = screenHeight > 0 && Number.isFinite(bottom) ? Math.max(0, screenHeight - bottom) : 0;
        this.setData({
          safeInsetBottom: inset
        });
      } catch (e) {}
      /* 每个 tab 页都有独立的 tabBar 实例且被缓存复用，selected 可能带着
       * 上次离开时的旧值。先按真实路由纠正一次，避免“点了 A、反馈落在 B” */
      this._syncFromRoute();
      /* 排查埋点：即使页面 JS 白屏挂掉，tabBar 组件通常仍存活，
       * 实时日志里"有它没页面"即可判定页面 JS 未执行成功 */
      bootLog.breadcrumb("tabbar attached, page stack=" + (typeof getCurrentPages === "function" ? getCurrentPages().length : 0));
    }
  },
  methods: {
    _currentRouteIndex: function _currentRouteIndex() {
      var pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
      var cur = pages[pages.length - 1];
      var route = "/" + ((cur && cur.route) || "");
      var list = this.data.list || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].pagePath === route) return i;
      }
      return -1;
    },
    _syncFromRoute: function _syncFromRoute() {
      var idx = this._currentRouteIndex();
      if (idx >= 0 && this.data.selected !== idx) {
        this.setData({
          selected: idx
        });
      }
      return idx;
    },
    switchTab: function switchTab(e) {
      var index = Number(e.currentTarget.dataset.index);
      var path = e.currentTarget.dataset.path;
      if (!path) return;
      /* 切换进行中（退出动画/switchTab 未落地）忽略新点击：真机上连点会
       * 派发多个 switchTab 且后发的可能静默失败，高亮与实际页面就此错位 */
      if (this._switching) return;
      /* 以真实路由而非实例旧状态判断“点的是否为当前 tab” */
      var actual = this._syncFromRoute();
      if (index === actual) {
        // 点击当前已选中 tab 时触发脉冲反馈，不重复跳转
        this._triggerPulse(index);
        return;
      }
      this.setData({
        selected: index
      });
      var self = this;
      this._switching = true;
      clearTimeout(this._switchGuard);
      this._switchGuard = setTimeout(function() {
        self._switching = false;
      }, SWITCH_LOCK_RELEASE_MS);
      var go = function go() {
        wx.switchTab({
          url: path,
          complete: function complete() {
            self._switching = false;
            clearTimeout(self._switchGuard);
            /* 切换失败时把高亮滚回真实所在页，成功时此调用为无害幂等 */
            self._syncFromRoute();
          }
        });
      };
      var pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
      var cur = pages[pages.length - 1];
      if (cur && typeof cur.playExitAnim === "function") {
        cur.playExitAnim(go);
      } else {
        go();
      }
    },
    _triggerPulse: function _triggerPulse(index) {
      var _this = this;
      this.setData({
        pulseIndex: index
      });
      clearTimeout(this._pulseTimer);
      this._pulseTimer = setTimeout(function() {
        _this.setData({
          pulseIndex: -1
        });
      }, 280);
    }
  }
});
