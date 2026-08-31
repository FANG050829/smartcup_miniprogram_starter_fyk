const cloud = require("wx-server-sdk")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const COLLECTION_NAME = "cup_gps"

function isHttpEvent(event = {}) {
  return Boolean(
    event.httpMethod ||
    event.headers ||
    event.queryStringParameters ||
    event.requestContext ||
    event.path ||
    event.body !== undefined
  )
}

function parseJsonSafely(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null
  try {
    return JSON.parse(raw)
  } catch (err) {
    return null
  }
}

function normalizeEvent(event = {}) {
  const next = { ...event }

  if (typeof event.body === "string") {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body
    const bodyData = parseJsonSafely(rawBody)
    if (bodyData && typeof bodyData === "object") {
      Object.assign(next, bodyData)
    }
  }

  if (event.queryStringParameters && typeof event.queryStringParameters === "object") {
    Object.assign(next, event.queryStringParameters)
  }

  return next
}

function createHttpResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization"
    },
    body: JSON.stringify(payload)
  }
}

function finish(event, statusCode, payload) {
  if (!isHttpEvent(event)) return payload
  return createHttpResponse(statusCode, payload)
}

exports.main = async (event = {}) => {
  if (String(event.httpMethod || "").toUpperCase() === "OPTIONS") {
    return createHttpResponse(204, { ok: true })
  }

  try {
    const data = normalizeEvent(event)
    const deviceId = String(data.deviceId || data.id || data.imei || "").trim()
    const readToken = String(data.token || "").trim()
    const expectedReadToken = String(process.env.GPS_READ_TOKEN || "").trim()

    if (!deviceId) {
      return finish(event, 400, { ok: false, error: "deviceId required" })
    }
    if (expectedReadToken && readToken !== expectedReadToken) {
      return finish(event, 401, { ok: false, error: "token invalid" })
    }

    const res = await db.collection(COLLECTION_NAME).doc(deviceId).get().catch(() => null)
    const row = res && res.data ? res.data : null
    if (!row) {
      return finish(event, 404, { ok: false, error: "not found" })
    }

    const ageMs = Math.max(0, Date.now() - Number(row.updatedAt || row.ts || 0))
    return finish(event, 200, {
      ok: true,
      data: row,
      ageMs
    })
  } catch (err) {
    return finish(event, 500, {
      ok: false,
      error: err && err.message ? err.message : String(err)
    })
  }
}
