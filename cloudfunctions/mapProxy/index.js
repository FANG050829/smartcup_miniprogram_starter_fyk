// 云函数入口文件：腾讯位置服务 WebService API 安全代理
const cloud = require("wx-server-sdk")
const fetch = require("node-fetch")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const ACTIONS = {
  reverseGeocoder: {
    url: "https://apis.map.qq.com/ws/geocoder/v1/",
    params: ["location", "get_poi", "poi_options", "coord_type", "output"]
  },
  geocoder: {
    url: "https://apis.map.qq.com/ws/geocoder/v1/",
    params: ["address", "region", "city", "get_poi", "poi_options", "output"]
  }
}

const getKey = () => process.env.Key_map || process.env.KEY_MAP || process.env.KEY || ""

const pickParams = (src, allow) => {
  const out = {}
  allow.forEach((k) => {
    const v = src[k]
    if (v !== undefined && v !== null && v !== "") out[k] = v
  })
  return out
}

exports.main = async (event = {}) => {
  const key = getKey().trim()
  if (!key) return { ok: false, error: "未配置 Key_map（请在云函数环境变量设置）" }

  const action = event.action || "reverseGeocoder"
  const meta = ACTIONS[action]
  if (!meta) return { ok: false, error: "不支持的 action" }

  const params = pickParams(event.params || event, meta.params)
  if (action === "reverseGeocoder" && !params.location) {
    return { ok: false, error: "缺少 location 参数" }
  }
  if (action === "geocoder" && !params.address) {
    return { ok: false, error: "缺少 address 参数" }
  }

  const qs = new URLSearchParams({ ...params, key }).toString()
  const url = `${meta.url}?${qs}`

  try {
    const resp = await fetch(url, { method: "GET", timeout: 8000 })
    const data = await resp.json().catch(() => ({}))

    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}`, detail: data }
    }
    if (typeof data?.status === "number" && data.status !== 0) {
      return { ok: false, error: data?.message || "腾讯位置服务返回错误", status: data.status, detail: data }
    }
    return {
      ok: true,
      result: data.result || null,
      message: data.message || "",
      request_id: data.request_id || ""
    }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
}
