const llm = require("../../utils/llm");
const drinkData = require("../../utils/drinkData");
const wxCompat = require("../../utils/wxCompat");
const petStore = require("../../utils/pet/petStore.js");

const EMO = petStore.EMO;

let voicePlugin = null;
try {
  voicePlugin = requirePlugin("WeChatSI");
} catch (e) {
  voicePlugin = null;
}

const STORAGE_KEY = "chat_sessions_v1";
const DEFAULT_MESSAGES = [{
  id: 1,
  role: "ai",
  text: "你好！我是智能水杯助手。你可以问：喝水提醒、饮水习惯、设备使用等。⚠️健康问题仅供参考，严重不适请就医。"
}];

function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}

function todayKey() {
  const d = new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function cloneMessages(list) {
  return (list || []).map(m => ({
    id: m.id,
    role: m.role,
    text: m.text
  }));
}

function hasConversation(list) {
  return Array.isArray(list) && list.some(m => m.role === "user");
}

function buildSummary(list) {
  const messages = Array.isArray(list) ? list : [];
  const lastUser = [...messages].reverse().find(m => m.role === "user");
  const base = (lastUser ? lastUser.text : (messages[0] && messages[0].text) || "").trim();
  if (!base) return "暂无内容";
  return base.length > 16 ? base.slice(0, 16) + "…" : base;
}

function createSession(date) {
  return {
    id: date,
    date: date,
    messages: cloneMessages(DEFAULT_MESSAGES),
    summary: ""
  };
}

function parseYMD(str) {
  if (!str) return null;
  const parts = str.split("-").map(n => parseInt(n, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function dateLabel(dateStr, todayStr) {
  if (!dateStr || !todayStr) return "更早";
  if (dateStr === todayStr) return "今天";
  const t = parseYMD(todayStr);
  const d = parseYMD(dateStr);
  if (!t || !d) return "更早";
  const y = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1);
  const yKey = y.getFullYear() + "-" + pad2(y.getMonth() + 1) + "-" + pad2(y.getDate());
  if (dateStr === yKey) return "昨天";
  return "更早";
}

Page({
  data: {
    messages: cloneMessages(DEFAULT_MESSAGES),
    input: "",
    placeholder: "输入问题…",
    loading: false,
    scrollTop: 0,
    // 历史
    historyOpen: false,
    historyList: [],
    viewingId: "current",
    currentDate: "",
    currentLabel: "今天",
    // 发送按钮状态
    canSend: false,
    chatTopPaddingPx: 32,
    // 语音转文字（官方同声传译插件，需主体/类目符合条件并添加插件后启用）
    voiceAvailable: !!voicePlugin,
    recording: false,
    interimText: "",
    // 表情伙伴（由 petStore 全局驱动）
    petOn: true,
    ballLine: "",
    pageAnim: ""
  },

  onLoad() {
    this._alive = true;
    this._syncTopSafeArea();
    this.initVoice();
  },

  onShow() {
    this._alive = true;
    // 仅在首次进入或窗口尺寸变化时同步安全区，避免每次 onShow 都 setData
    if (!this._safeAreaSynced) {
      this._syncTopSafeArea();
      this._safeAreaSynced = true;
    }
    this.initSessions();
    this._fxFlip = !this._fxFlip;
    this.setData({ petOn: petStore.isEnabled(), pageAnim: "fx-on" + (this._fxFlip ? "2" : "") });
    petStore.setPageVisible("chat", true);
  },

  onResize() {
    this._safeAreaSynced = false;
    this._syncTopSafeArea();
  },

  onHide() {
    this._alive = false;
    this.setData({ pageAnim: "fx-out" });
    petStore.setPageVisible("chat", false);
    this.saveSessions();
  },

  onUnload() {
    this._alive = false;
    petStore.setPageVisible("chat", false);
    this.saveSessions();
  },

  _syncTopSafeArea() {
    let statusBarHeight = 20;
    try {
      const metrics = wxCompat.getLayoutMetrics();
      if (metrics && Number.isFinite(Number(metrics.statusBarHeight)) && Number(metrics.statusBarHeight) > 0) {
        statusBarHeight = Number(metrics.statusBarHeight);
      }
    } catch (err) {}
    const next = Math.round(statusBarHeight + 8);
    // 与当前值一致则跳过 setData
    if (next !== this.data.chatTopPaddingPx) {
      this.setData({ chatTopPaddingPx: next });
    }
  },

  onInput(e) {
    const v = e.detail.value || "";
    this.setData({ input: v, canSend: !!v.trim() });
  },

  onFocus() {
    this.setData({ placeholder: "" });
  },

  onBlur() {
    if (!this.data.input) this.setData({ placeholder: "输入问题…" });
  },

  initVoice() {
    if (!voicePlugin) {
      this.setData({ voiceAvailable: false });
      return;
    }
    const manager = voicePlugin.getRecordRecognitionManager();
    this._voiceManager = manager;

    manager.onStart = () => {
      this.setData({ recording: true, interimText: "" });
      petStore.taskStart("listen", 120000);
    };
    manager.onRecognize = (res) => {
      const text = res && res.result ? res.result : "";
      this.setData({ interimText: text, input: text, canSend: !!text.trim() });
    };
    manager.onStop = (res) => {
      const text = res && res.result ? res.result : "";
      this.setData({ recording: false, interimText: "", input: text, canSend: !!text.trim() });
      if (text.trim()) this.scrollToBottom();
      petStore.taskDone();
    };
    manager.onError = (res) => {
      this.setData({ recording: false, interimText: "" });
      const msg = res && res.msg ? res.msg : "语音识别失败";
      wx.showToast({ title: msg, icon: "none" });
      petStore.taskDone();
    };
  },

  toggleVoice() {
    if (!this._voiceManager) {
      wx.showToast({ title: "当前环境不支持语音", icon: "none" });
      return;
    }
    if (this.data.recording) {
      this._voiceManager.stop();
      return;
    }
    wx.authorize({
      scope: "scope.record",
      success: () => {
        this._voiceManager.start({ lang: "zh_CN" });
      },
      fail: () => {
        this.openRecordSetting();
      }
    });
  },

  openRecordSetting() {
    wx.showModal({
      title: "需要麦克风权限",
      content: "语音转文字需要使用麦克风，请在设置中开启。",
      confirmText: "去设置",
      success: (res) => {
        if (res.confirm) {
          wx.openSetting({
            success: (s) => {
              if (s.authSetting && s.authSetting["scope.record"]) {
                this._voiceManager.start({ lang: "zh_CN" });
              }
            }
          });
        }
      }
    });
  },

  toggleHistory() {
    this.setData({ historyOpen: !this.data.historyOpen });
  },

  closeHistory() {
    if (!this.data.historyOpen) return;
    this.setData({ historyOpen: false });
  },

  openHistory(e) {
    const id = e.currentTarget.dataset.id;
    if (id === "current") {
      const current = this._sessions && this._sessions.current;
      if (current) {
        this.setData({ messages: current.messages, viewingId: "current", historyOpen: false });
      }
      this.scrollToBottom();
      return;
    }
    const list = (this._historyMap && this._historyMap[id]) || [];
    this.setData({ messages: list, viewingId: id || "history", historyOpen: false });
    this.scrollToBottom();
  },

  // 长按气泡或点击复制，可复制用户/AI 文本
  copyMsg(e) {
    const dataset = (e && e.currentTarget && e.currentTarget.dataset) || {};
    const index = Number(dataset.index);
    const list = Array.isArray(this.data.messages) ? this.data.messages : [];
    const message = Number.isInteger(index) && list[index] ? list[index] : null;
    const text = String((message && message.text) || dataset.text || "");
    if (!text) {
      wx.showToast({ title: "没有可复制内容", icon: "none" });
      return;
    }
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: "已复制", icon: "success" }),
      fail: () => wx.showToast({ title: "复制失败", icon: "none" })
    });
  },

  async send() {
    const text = (this.data.input || "").trim();
    if (!text || this.data.loading) return;

    const currentMessages = this.getCurrentMessages();
    const id = Date.now();
    const messages = currentMessages.concat([{ id, role: "user", text }]);
    this.setData({
      messages,
      input: "",
      loading: true,
      viewingId: "current",
      historyOpen: false,
      canSend: false
    });
    this.updateCurrent(messages);
    this.scrollToBottom();
    petStore.taskStart("think", 60000);

    try {
      const reply = await llm.chat(text, messages);
      const messages2 = this.getCurrentMessages().concat([{ id: id + 1, role: "ai", text: reply }]);
      this.setData({ messages: messages2, loading: false });
      this.updateCurrent(messages2);
      this.scrollToBottom();
      petStore.taskDone();
      petStore.flash(EMO.done, 2200);
    } catch (err) {
      console.error(err);
      this.setData({ loading: false });
      petStore.taskDone();
      petStore.flash(EMO.error, 2800);
      const msg = err && err.message ? err.message : "AI 请求失败，请检查云函数/密钥";
      if (msg.length > 26) {
        wx.showModal({ title: "AI 请求失败", content: msg, showCancel: false });
      } else {
        wx.showToast({ title: msg, icon: "none" });
      }
    }
  },

  scrollToBottom() {
    this.setData({ scrollTop: this.data.scrollTop + 99999 });
  },

  quickAsk(e) {
    const q = e.currentTarget.dataset.q;
    if (!q) return;
    this.setData({ input: q, canSend: true });
    setTimeout(() => this.send(), 0);
  },

  async analyzeHydration() {
    if (this.data.loading) return;

    const currentMessages = this.getCurrentMessages();
    const id = Date.now();
    const messages = currentMessages.concat([{ id, role: "user", text: "分析我近 7 天饮水习惯" }]);
    this.setData({
      messages,
      input: "",
      loading: true,
      viewingId: "current",
      historyOpen: false,
      canSend: false
    });
    this.updateCurrent(messages);
    this.scrollToBottom();
    petStore.taskStart("think", 60000);

    try {
      const result = await drinkData.getHydrationAdvice();
      const reply = result && result.advice ? result.advice : "暂时没有生成饮水建议，请稍后再试。";
      const messages2 = this.getCurrentMessages().concat([{ id: id + 1, role: "ai", text: reply }]);
      this.setData({ messages: messages2, loading: false });
      this.updateCurrent(messages2);
      this.scrollToBottom();
      petStore.taskDone();
      petStore.flash(EMO.done, 2200);
    } catch (err) {
      console.error("[hydration advice failed]", err);
      this.setData({ loading: false });
      petStore.taskDone();
      petStore.flash(EMO.error, 2800);
      const msg = err && err.message ? err.message : "AI 饮水分析失败，请检查云函数和云数据库";
      wx.showModal({ title: "饮水分析失败", content: msg, showCancel: false });
    }
  },

  // ============ 表情伙伴：上报事件，表情由 petStore 裁决 ============

  onBallChange(e) {
    const detail = (e && e.detail) || {};
    if (detail.caption) this.setData({ ballLine: detail.caption });
  },

  goBack() {
    // 球像素 alpha 淡出（约 260ms），220ms 时大部分完成再返回
    if (petStore.isEnabled()) petStore.beginExit();
    setTimeout(() => wx.navigateBack(), 220);
  },

  getCurrentMessages() {
    if (this._sessions && this._sessions.current && Array.isArray(this._sessions.current.messages)) {
      return this._sessions.current.messages;
    }
    return this.data.messages;
  },

  updateCurrent(messages) {
    if (!this._sessions || !this._sessions.current) return;
    this._sessions.current.messages = messages;
    this._sessions.current.summary = buildSummary(messages);
    this.saveSessions();
  },

  initSessions() {
    const today = todayKey();
    const stored = wx.getStorageSync(STORAGE_KEY) || {};
    let current = stored.current;
    let history = Array.isArray(stored.history) ? stored.history : [];
    const needArchive = current && current.date !== today;

    if (needArchive) {
      if (hasConversation(current.messages)) {
        current.summary = current.summary || buildSummary(current.messages);
        history = history.concat([current]);
      }
      current = null;
    }
    if (!current || current.date !== today) current = createSession(today);

    history = history.filter(s => s && s.id && s.id !== current.id);
    const seen = {};
    const deduped = [];
    for (let i = history.length - 1; i >= 0; i--) {
      const s = history[i];
      if (!s || !s.id || seen[s.id]) continue;
      seen[s.id] = true;
      deduped.unshift(s);
    }
    history = deduped;
    history.forEach(s => {
      if (!s.summary) s.summary = buildSummary(s.messages);
    });
    history.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    history = history.slice(0, 30);

    this._sessions = { current, history };
    this._historyMap = {};
    const historyList = history.map(s => {
      this._historyMap[s.id] = s.messages || [];
      return {
        id: s.id,
        date: s.date,
        summary: s.summary,
        label: dateLabel(s.date, today)
      };
    });

    this.setData({
      messages: current.messages,
      historyList,
      viewingId: "current",
      currentDate: today,
      currentLabel: "今天",
      historyOpen: false,
      canSend: !!(this.data.input || "").trim()
    });

    // 仅在跨日归档时才落盘，避免每次 onShow 都无意义写 storage
    if (needArchive) this.saveSessions();
    setTimeout(() => this.scrollToBottom(), 0);
  },

  saveSessions() {
    if (!this._sessions) return;
    try {
      wx.setStorageSync(STORAGE_KEY, {
        current: this._sessions.current,
        history: this._sessions.history
      });
    } catch (err) {
      console.warn("[chat] save sessions failed", err);
    }
  }
});
