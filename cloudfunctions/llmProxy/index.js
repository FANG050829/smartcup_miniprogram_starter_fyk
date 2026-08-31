const cloud = require("wx-server-sdk")
const fetch = require("node-fetch")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const DEFAULT_BASE_URL = "https://api.deepseek.com/v1"
const DEFAULT_MODEL = "deepseek-chat"
const DEFAULT_HTTP_TIMEOUT_MS = 55000
const DEFAULT_MAX_HISTORY_MESSAGES = 6
const DEFAULT_MAX_TOKENS = 300

function readIntEnv(name, fallback, min, max) {
  const value = Number(process.env[name])
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.floor(value)))
}

//  同时兼容两种入口名：main / main_handler
async function handler(event = {}) {
  try {
    const { messages = [], userText = "", temperature, maxTokens } = event || {}

    const baseUrl = (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, "")
      || DEFAULT_BASE_URL
    const apiKey  = process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY
    const model   = process.env.LLM_MODEL || DEFAULT_MODEL
    const historyLimit = readIntEnv("LLM_MAX_HISTORY_MESSAGES", DEFAULT_MAX_HISTORY_MESSAGES, 2, 12)
    const requestTimeoutMs = readIntEnv("LLM_HTTP_TIMEOUT_MS", DEFAULT_HTTP_TIMEOUT_MS, 8000, 58000)
    const outputLimit = Number.isFinite(Number(maxTokens))
      ? Math.max(80, Math.min(800, Math.floor(Number(maxTokens))))
      : readIntEnv("LLM_MAX_TOKENS", DEFAULT_MAX_TOKENS, 80, 800)


    const temp = typeof temperature === "number" ? temperature : 0.65
    if (!apiKey) return { error: "未配置 DeepSeek API Key：请在 llmProxy 云函数环境变量中设置 LLM_API_KEY 或 DEEPSEEK_API_KEY" }

    // 把前端 role: "ai" 映射成 OpenAI 需要的 "assistant"
    const mapped = (messages || [])
      .slice(-historyLimit)
      .map(m => ({
        role: m.role === "ai" ? "assistant" : m.role,
        content: m.content ?? m.text ?? ""
      }))
      .filter(m => m.role && m.content)

    const payload = {
      model,
      messages: [
        { role: "system", content: "你是智能水杯助手。回答要简洁、友好。健康问题仅供参考，严重不适建议就医。" },
        ...mapped,
        ...(userText ? [{ role: "user", content: userText }] : [])
      ],
      temperature: temp,
      max_tokens: outputLimit
    }

    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      timeout: requestTimeoutMs
    })

    const raw = await resp.text()
    let data = {}
    try {
      data = raw ? JSON.parse(raw) : {}
    } catch (e) {
      data = { raw }
    }
    if (!resp.ok) return { error: data?.error?.message || data?.message || raw || `HTTP ${resp.status}` }

    return { reply: (data?.choices?.[0]?.message?.content || "").trim() }
  } catch (e) {
    return { error: e?.message || String(e) }
  }
}

exports.main = handler
exports.main_handler = handler
