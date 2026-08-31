const crypto = require("crypto")
const cloud = require("wx-server-sdk")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const RECORDS_COLLECTION = "drink_records"
const SETTINGS_COLLECTION = "user_settings"
const REPORTS_COLLECTION = "hydration_reports"
const DEFAULT_GOAL_ML = 2000
const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

let collectionsReady = false

function pad2(value) {
  const n = Math.round(Number(value))
  return n < 10 ? `0${n}` : `${n}`
}

function toDateKey(timestamp = Date.now()) {
  const date = new Date(Math.round(Number(timestamp) || Date.now()) + CHINA_OFFSET_MS)
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

function dateKeyToMs(dateKey) {
  if (typeof dateKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return NaN
  const [year, month, day] = dateKey.split("-").map((item) => Number(item))
  return Date.UTC(year, month - 1, day) - CHINA_OFFSET_MS
}

function addDays(dateKey, delta) {
  return toDateKey(dateKeyToMs(dateKey) + (Number(delta) || 0) * 24 * 60 * 60 * 1000)
}

function getOpenId(event = {}) {
  const context = cloud.getWXContext()
  const openid = String(context.OPENID || event.openid || "").trim()
  if (!openid) throw new Error("openid unavailable")
  return openid
}

function normalizeGoal(value) {
  const parsed = Math.round(Number(value))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GOAL_ML
}

function normalizeAmount(value) {
  const parsed = Math.round(Number(value))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

async function ensureCollections() {
  if (collectionsReady) return
  if (typeof db.createCollection !== "function") {
    collectionsReady = true
    return
  }
  await Promise.all([
    db.createCollection(RECORDS_COLLECTION).catch(() => null),
    db.createCollection(SETTINGS_COLLECTION).catch(() => null),
    db.createCollection(REPORTS_COLLECTION).catch(() => null)
  ])
  collectionsReady = true
}

async function getSettings(openid) {
  const res = await db.collection(SETTINGS_COLLECTION).doc(openid).get().catch(() => null)
  return res && res.data ? res.data : {}
}

async function fetchRecords(openid, startDateKey, endDateKey) {
  const all = []
  let skip = 0
  const pageSize = 100

  while (all.length < 1000) {
    const res = await db.collection(RECORDS_COLLECTION)
      .where({
        _openid: openid,
        dateKey: _.gte(startDateKey)
      })
      .orderBy("dateKey", "asc")
      .orderBy("ts", "asc")
      .skip(skip)
      .limit(pageSize)
      .get()
    const list = Array.isArray(res && res.data) ? res.data : []
    all.push(...list.filter((item) => item && item.dateKey <= endDateKey))
    if (list.length < pageSize) break
    skip += list.length
  }

  return all
}

function buildSummary(records, dailyGoalMl, endDateKey) {
  const days = []
  for (let i = 6; i >= 0; i -= 1) {
    const dateKey = addDays(endDateKey, -i)
    days.push({
      dateKey,
      totalMl: 0,
      count: 0,
      morningMl: 0,
      afternoonMl: 0,
      eveningMl: 0,
      nightMl: 0,
      records: []
    })
  }
  const dayMap = {}
  days.forEach((day) => { dayMap[day.dateKey] = day })

  records.forEach((record) => {
    const day = dayMap[record.dateKey]
    if (!day) return
    const amount = normalizeAmount(record.amount)
    if (!amount) return
    const ts = Number(record.ts) || Date.now()
    const hour = new Date(ts + CHINA_OFFSET_MS).getUTCHours()
    day.totalMl += amount
    day.count += 1
    day.records.push({ amount, ts })
    if (hour >= 5 && hour < 11) day.morningMl += amount
    else if (hour >= 11 && hour < 17) day.afternoonMl += amount
    else if (hour >= 17 && hour < 22) day.eveningMl += amount
    else day.nightMl += amount
  })

  const totalMl = days.reduce((total, day) => total + day.totalMl, 0)
  const recordCount = days.reduce((total, day) => total + day.count, 0)
  const completedDays = days.filter((day) => day.totalMl >= dailyGoalMl).length
  const drinkingDays = days.filter((day) => day.totalMl > 0).length
  const averageMl = Math.round(totalMl / 7)
  const bestDay = days.reduce((best, day) => (day.totalMl > best.totalMl ? day : best), days[0])
  const lowDay = days.reduce((low, day) => (day.totalMl < low.totalMl ? day : low), days[0])
  const periods = [
    { key: "morning", name: "上午", ml: days.reduce((sum, day) => sum + day.morningMl, 0) },
    { key: "afternoon", name: "下午", ml: days.reduce((sum, day) => sum + day.afternoonMl, 0) },
    { key: "evening", name: "晚上", ml: days.reduce((sum, day) => sum + day.eveningMl, 0) },
    { key: "night", name: "夜间", ml: days.reduce((sum, day) => sum + day.nightMl, 0) }
  ]
  periods.sort((a, b) => b.ml - a.ml)

  return {
    days: days.map((day) => ({
      dateKey: day.dateKey,
      totalMl: day.totalMl,
      count: day.count,
      completed: day.totalMl >= dailyGoalMl,
      morningMl: day.morningMl,
      afternoonMl: day.afternoonMl,
      eveningMl: day.eveningMl,
      nightMl: day.nightMl
    })),
    dailyGoalMl,
    totalMl,
    averageMl,
    recordCount,
    completedDays,
    drinkingDays,
    bestDay: { dateKey: bestDay.dateKey, totalMl: bestDay.totalMl },
    lowDay: { dateKey: lowDay.dateKey, totalMl: lowDay.totalMl },
    dominantPeriod: periods[0],
    periodTotals: periods
  }
}

function md5(value) {
  return crypto.createHash("md5").update(value).digest("hex")
}

function buildFallbackAdvice(summary) {
  if (!summary.recordCount) {
    return "近 7 天还没有饮水记录。建议先连续记录 3 天以上，每次喝水后在小程序里打卡，AI 就能根据你的真实节奏给出更准确的建议。"
  }

  const gap = Math.max(0, summary.dailyGoalMl - summary.averageMl)
  const targetText = gap > 0
    ? `你近 7 天日均饮水约 ${summary.averageMl}ml，距离 ${summary.dailyGoalMl}ml 目标还差约 ${gap}ml。`
    : `你近 7 天日均饮水约 ${summary.averageMl}ml，已经达到当前目标。`

  return `${targetText}\n\n建议：把饮水拆成上午、下午、晚上 3 个固定时段，每次 200-300ml；如果上午饮水偏少，可以在起床后和午饭前各安排一次提醒。继续保持记录，后续建议会更贴合你的习惯。`
}

function buildPrompt(summary) {
  return [
    "你是智能水杯的饮水习惯分析助手。请基于近 7 天真实饮水统计，给用户简洁、友好、可执行的建议。",
    "要求：不要诊断疾病；不要给医疗承诺；如果数据不足要明确提醒继续记录；输出用中文，分为「整体评价」「发现的问题」「接下来3天建议」三段。",
    "",
    `每日目标：${summary.dailyGoalMl}ml`,
    `近7天总饮水：${summary.totalMl}ml`,
    `日均饮水：${summary.averageMl}ml`,
    `达标天数：${summary.completedDays}/7`,
    `有记录天数：${summary.drinkingDays}/7`,
    `记录次数：${summary.recordCount}`,
    `最高一天：${summary.bestDay.dateKey} ${summary.bestDay.totalMl}ml`,
    `最低一天：${summary.lowDay.dateKey} ${summary.lowDay.totalMl}ml`,
    `饮水最多时段：${summary.dominantPeriod.name} ${summary.dominantPeriod.ml}ml`,
    `每日明细：${summary.days.map((day) => `${day.dateKey}:${day.totalMl}ml/${day.count}次`).join("；")}`
  ].join("\n")
}

async function readCachedReport(openid, reportId, signature) {
  const res = await db.collection(REPORTS_COLLECTION).doc(reportId).get().catch(() => null)
  const data = res && res.data ? res.data : null
  if (!data || data.signature !== signature) return null
  if ((Date.now() - Number(data.updatedAt || 0)) > CACHE_TTL_MS) return null
  return data
}

async function saveReport(openid, reportId, signature, summary, advice) {
  const now = Date.now()
  await db.collection(REPORTS_COLLECTION).doc(reportId).set({
    data: {
      _openid: openid,
      signature,
      summary,
      advice,
      updatedAt: now
    }
  })
}

async function handler(event = {}) {
  try {
    await ensureCollections()
    const openid = getOpenId(event)
    const endDateKey = typeof event.endDateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(event.endDateKey)
      ? event.endDateKey
      : toDateKey()
    const startDateKey = addDays(endDateKey, -6)
    const settings = await getSettings(openid)
    const dailyGoalMl = normalizeGoal(settings.dailyGoalMl)
    const records = await fetchRecords(openid, startDateKey, endDateKey)
    const summary = buildSummary(records, dailyGoalMl, endDateKey)
    const signature = md5(JSON.stringify(summary))
    const reportId = `${openid}_${endDateKey}_7d`.replace(/[^\w-]/g, "_").slice(0, 128)

    if (!event.force) {
      const cached = await readCachedReport(openid, reportId, signature)
      if (cached) {
        return { ok: true, cached: true, advice: cached.advice, summary: cached.summary }
      }
    }

    let advice = buildFallbackAdvice(summary)
    if (summary.recordCount) {
      const llmRes = await cloud.callFunction({
        name: "llmProxy",
        data: {
          messages: [],
          userText: buildPrompt(summary),
          temperature: 0.35,
          maxTokens: 650
        }
      }).catch((error) => ({ result: { error: error && error.message ? error.message : String(error) } }))
      const result = llmRes && llmRes.result ? llmRes.result : {}
      if (result.reply) advice = String(result.reply).trim()
      if (result.error && !advice) advice = buildFallbackAdvice(summary)
    }

    await saveReport(openid, reportId, signature, summary, advice)
    return { ok: true, cached: false, advice, summary }
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : String(err)
    }
  }
}

exports.main = handler
exports.main_handler = handler
