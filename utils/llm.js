require("../@babel/runtime/helpers/Arrayincludes");
var _regeneratorRuntime2 = require("../@babel/runtime/helpers/regeneratorRuntime");
var _asyncToGenerator2 = require("../@babel/runtime/helpers/asyncToGenerator");
var _require = require("./llmConfig.js"),
  LLM_CLOUD_FUNCTION_NAME = _require.LLM_CLOUD_FUNCTION_NAME,
  LLM_CLOUD_ENV = _require.LLM_CLOUD_ENV;
var MAX_CONTEXT_MESSAGES = 6;
var MAX_REPLY_TOKENS = 300;

function normalizeCloudError(err) {
  var errMsg = String(err && (err.errMsg || err.message) || err || "");
  if (/env status is isolated|-501000|INVALID_ENV/i.test(errMsg)) {
    return new Error("云开发环境不可用或处于隔离状态：请确认已开通云开发、选择了正确云环境，并重新上传部署 llmProxy 云函数。");
  }
  if (/FunctionName|function not found|not found|FUNCTION_NOT_FOUND/i.test(errMsg)) {
    return new Error("未找到 llmProxy 云函数：请在微信开发者工具中上传并部署 cloudfunctions/llmProxy。");
  }
  if (/timeout|timed out/i.test(errMsg)) {
    return new Error("AI 云函数请求超时：请确认 llmProxy 已部署，且云函数能访问 DeepSeek 接口。");
  }
  if (/fail|failed|abort/i.test(errMsg)) {
    return new Error("AI 云函数调用失败：请检查云环境、llmProxy 云函数日志和 LLM_API_KEY 环境变量。");
  }
  return err instanceof Error ? err : new Error(errMsg || "AI 云函数请求失败");
}

function getCloudFunctionName() {
  var name = String(LLM_CLOUD_FUNCTION_NAME || "").trim();
  return name || "llmProxy";
}

function requestChat(data) {
  if (!wx.cloud || typeof wx.cloud.callFunction !== "function") {
    return Promise.reject(new Error("当前环境不支持 wx.cloud.callFunction，请在微信开发者工具或真机中运行。"));
  }
  var options = {
    name: getCloudFunctionName(),
    data: data
  };
  var env = String(LLM_CLOUD_ENV || "").trim();
  if (env) options.config = {
    env: env
  };
  return wx.cloud.callFunction(options).then(function(res) {
    var body = res && res.result ? res.result : {};
    if (body.error) {
      throw new Error("DeepSeek \u8BF7\u6C42\u5931\u8D25\uFF1A".concat(body.error));
    }
    return body;
  }).catch(function(err) {
    throw normalizeCloudError(err);
  });
}

function chat(_x, _x2) {
  return _chat.apply(this, arguments);
}

function _chat() {
  _chat = _asyncToGenerator2( /*#__PURE__*/ _regeneratorRuntime2().mark(function _callee(userText, messages) {
    var mapped, start, cleaned, temperature, res;
    return _regeneratorRuntime2().wrap(function _callee$(_context) {
      while (1) switch (_context.prev = _context.next) {
        case 0:
          mapped = (messages || []).slice(-MAX_CONTEXT_MESSAGES).map(function(m) {
            return {
              role: m.role === "ai" ? "assistant" : m.role,
              content: m.text || m.content || ""
            };
          }).filter(function(m) {
            return ["user", "assistant", "system"].includes(m.role) && m.content;
          });
          start = 0;
          while (start < mapped.length && mapped[start].role === "assistant") start++;
          cleaned = mapped.slice(start);
          temperature = 0.65;
          _context.next = 7;
          return requestChat({
            messages: cleaned,
            userText: "",
            temperature: temperature,
            maxTokens: MAX_REPLY_TOKENS
          });
        case 7:
          res = _context.sent;
          return _context.abrupt("return", res.reply || "(AI 无回复)");
        case 9:
        case "end":
          return _context.stop();
      }
    }, _callee);
  }));
  return _chat.apply(this, arguments);
}
module.exports = {
  chat: chat
};