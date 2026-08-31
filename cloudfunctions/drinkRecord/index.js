const cloud = require("wx-server-sdk")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const RECORDS_COLLECTION = "drink_records"
const SETTINGS_COLLECTION = "user_settings"
const STORAGE_VERSION = 1
const DEFAULT_GOAL_ML = 2000
const MIN_GOAL_ML = 800
const MAX_GOAL_ML = 6000
const MAX_SINGLE_AMOUNT_ML = 1500
const MAX_DAILY_RECORDS = 120
const MAX_IMPORT_RECORDS = 1200
const DEFAULT_HISTORY_DAYS = 400
const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000

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
  if (!isDateKey(dateKey)) return NaN
  const [year, month, day] = dateKey.split("-").map((item) => Number(item))
  return Date.UTC(year, month - 1, day) - CHINA_OFFSET_MS
}

function addDays(dateKey, delta) {
  const base = dateKeyToMs(dateKey)
  if (!Number.isFinite(base)) return toDateKey()
  return toDateKey(base + (Number(delta) || 0) * 24 * 60 * 60 * 1000)
}

function isDateKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function normalizeDateKey(value, fallbackTs) {
  const text = String(value || "").trim()
  return isDateKey(text) ? text : toDateKey(fallbackTs)
}

function normalizeGoal(value) {
  const parsed = Math.round(Number(value))
  if (!Number.isFinite(parsed)) return DEFAULT_GOAL_ML
  return Math.max(MIN_GOAL_ML, Math.min(MAX_GOAL_ML, parsed))
}

function normalizeAmount(value) {
  const parsed = Math.round(Number(value))
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return Math.max(1, Math.min(MAX_SINGLE_AMOUNT_ML, parsed))
}

function normalizeTimestamp(value) {
  const raw = Number(value)
  if (!Number.isFinite(raw) || raw <= 0) return Date.now()
  if (raw >= 1e12) return Math.round(raw)
  if (raw >= 1e9) return Math.round(raw * 1000)
  return Date.now()
}

function normalizeSource(value) {
  const text = String(value || "").trim()
  return text || "manual"
}

function makeRecordId(timestamp) {
  const ts = normalizeTimestamp(timestamp)
  return `rec_${ts}_${Math.floor(Math.random() * 100000)}`
}

function docIdFor(openid, recordId) {
  return `${openid}_${recordId}`.replace(/[^\w-]/g, "_").slice(0, 128)
}

function getOpenId(event = {}) {
  const context = cloud.getWXContext()
  const openid = String(context.OPENID || event.openid || "").trim()
  if (!openid) throw new Error("openid unavailable")
  return openid
}

async function ensureCollections() {
  if (collectionsReady) return
  if (typeof db.createCollection !== "function") {
    collectionsReady = true
    return
  }
  await Promise.all([
    db.createCollection(RECORDS_COLLECTION).catch(() => null),
    db.createCollection(SETTINGS_COLLECTION).catch(() => null)
  ])
  collectionsReady = true
}

async function getSettings(openid) {
  const res = await db.collection(SETTINGS_COLLECTION).doc(openid).get().catch(() => null)
  const data = res && res.data ? res.data : {}
  const now = Date.now()
  return {
    dailyGoalMl: normalizeGoal(data.dailyGoalMl),
    createdAt: Number(data.createdAt) > 0 ? Math.round(Number(data.createdAt)) : now,
    updatedAt: Number(data.updatedAt) > 0 ? Math.round(Number(data.updatedAt)) : now
  }
}

async function setSettings(openid, patch = {}) {
  const now = Date.now()
  const current = await getSettings(openid)
  const next = {
    ...current,
    ...patch,
    dailyGoalMl: normalizeGoal(patch.dailyGoalMl !== undefined ? patch.dailyGoalMl : current.dailyGoalMl),
    updatedAt: now
  }
  await db.collection(SETTINGS_COLLECTION).doc(openid).set({
    data: {
      _openid: openid,
      ...next,
      createdAt: current.createdAt || now
    }
  })
  return next
}

function getRange(event = {}) {
  const endDateKey = isDateKey(event.endDateKey) ? event.endDateKey : toDateKey()
  const requestedDays = Math.round(Number(event.historyDays || event.days || DEFAULT_HISTORY_DAYS))
  const historyDays = Math.max(1, Math.min(DEFAULT_HISTORY_DAYS, Number.isFinite(requestedDays) ? requestedDays : DEFAULT_HISTORY_DAYS))
  const fallbackStart = addDays(endDateKey, -(historyDays - 1))
  const startDateKey = isDateKey(event.startDateKey) ? event.startDateKey : fallbackStart
  return { startDateKey, endDateKey, historyDays }
}

function normalizeRecordDoc(doc) {
  if (!doc || typeof doc !== "object") return null
  const amount = normalizeAmount(doc.amount)
  if (!amount) return null
  const ts = normalizeTimestamp(doc.ts)
  const recordId = String(doc.recordId || doc.id || doc._id || makeRecordId(ts))
  return {
    id: recordId,
    recordId,
    amount,
    ts,
    dateKey: normalizeDateKey(doc.dateKey, ts),
    source: normalizeSource(doc.source),
    deviceId: String(doc.deviceId || "").trim()
  }
}

async function fetchRecords(openid, startDateKey, endDateKey, maxRecords = 5000) {
  const all = []
  let skip = 0
  const pageSize = 100
  const max = Math.max(pageSize, Math.min(10000, Math.round(Number(maxRecords) || 5000)))

  while (all.length < max) {
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

  return all.map(normalizeRecordDoc).filter(Boolean)
}

function groupRecords(records) {
  const recordsByDate = {}
  ;(records || []).forEach((record) => {
    if (!record || !record.dateKey) return
    if (!recordsByDate[record.dateKey]) recordsByDate[record.dateKey] = []
    recordsByDate[record.dateKey].push({
      id: record.id,
      amount: record.amount,
      ts: record.ts,
      source: record.source,
      deviceId: record.deviceId
    })
  })

  Object.keys(recordsByDate).forEach((dateKey) => {
    const list = recordsByDate[dateKey]
    list.sort((a, b) => a.ts - b.ts)
    if (list.length > MAX_DAILY_RECORDS) {
      list.splice(0, list.length - MAX_DAILY_RECORDS)
    }
  })

  return recordsByDate
}

function sumAmounts(records) {
  return (records || []).reduce((total, item) => total + (Number(item && item.amount) || 0), 0)
}

async function buildStore(openid, event = {}) {
  const range = getRange(event)
  const settings = await getSettings(openid)
  const records = await fetchRecords(openid, range.startDateKey, range.endDateKey)
  return {
    ok: true,
    store: {
      version: STORAGE_VERSION,
      dailyGoalMl: settings.dailyGoalMl,
      recordsByDate: groupRecords(records),
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt
    },
    range
  }
}

async function trimDailyRecords(openid, dateKey) {
  const records = await fetchRecords(openid, dateKey, dateKey, 1000)
  if (records.length <= MAX_DAILY_RECORDS) return
  records.sort((a, b) => a.ts - b.ts)
  const toDelete = records.slice(0, records.length - MAX_DAILY_RECORDS)
  await Promise.all(toDelete.map((record) => (
    db.collection(RECORDS_COLLECTION).doc(docIdFor(openid, record.id)).remove().catch(() => null)
  )))
}

async function addRecord(openid, event = {}) {
  const amount = normalizeAmount(event.amount)
  if (!amount) throw new Error("invalid amount")

  const ts = normalizeTimestamp(event.ts)
  const dateKey = normalizeDateKey(event.dateKey, ts)
  const beforeRecords = await fetchRecords(openid, dateKey, dateKey, 1000)
  const beforeTotal = sumAmounts(beforeRecords)
  const recordId = String(event.recordId || event.id || makeRecordId(ts)).trim()
  const now = Date.now()
  const row = {
    _openid: openid,
    recordId,
    amount,
    ts,
    dateKey,
    source: normalizeSource(event.source),
    deviceId: String(event.deviceId || "").trim(),
    createdAt: now,
    updatedAt: now
  }

  await db.collection(RECORDS_COLLECTION).doc(docIdFor(openid, recordId)).set({ data: row })
  await trimDailyRecords(openid, dateKey)
  const afterRecords = await fetchRecords(openid, dateKey, dateKey, 1000)

  return {
    ...(await buildStore(openid, event)),
    record: normalizeRecordDoc(row),
    beforeTotal,
    afterTotal: sumAmounts(afterRecords)
  }
}

async function deleteRecord(openid, event = {}) {
  const recordId = String(event.recordId || event.id || "").trim()
  if (!recordId) throw new Error("recordId required")
  await db.collection(RECORDS_COLLECTION).doc(docIdFor(openid, recordId)).remove().catch(async () => {
    const res = await db.collection(RECORDS_COLLECTION).where({ _openid: openid, recordId }).limit(10).get()
    const list = Array.isArray(res && res.data) ? res.data : []
    await Promise.all(list.map((item) => db.collection(RECORDS_COLLECTION).doc(item._id).remove().catch(() => null)))
  })
  return buildStore(openid, event)
}

async function clearDay(openid, event = {}) {
  const dateKey = normalizeDateKey(event.dateKey, Date.now())
  const records = await fetchRecords(openid, dateKey, dateKey, 1000)
  await Promise.all(records.map((record) => (
    db.collection(RECORDS_COLLECTION).doc(docIdFor(openid, record.id)).remove().catch(() => null)
  )))
  return buildStore(openid, event)
}

function normalizeImportRecords(rawStore = {}) {
  const sourceMap = rawStore.recordsByDate
  if (!sourceMap || typeof sourceMap !== "object") return []

  const rows = []
  Object.keys(sourceMap).sort().forEach((dateKey) => {
    if (!isDateKey(dateKey)) return
    const list = Array.isArray(sourceMap[dateKey]) ? sourceMap[dateKey] : []
    list.slice(-MAX_DAILY_RECORDS).forEach((item) => {
      const normalized = normalizeRecordDoc({
        ...item,
        dateKey,
        recordId: item && (item.id || item.recordId),
        source: (item && item.source) || "legacy"
      })
      if (normalized) rows.push(normalized)
    })
  })

  return rows.slice(-MAX_IMPORT_RECORDS)
}

async function importStore(openid, event = {}) {
  const rawStore = event.store && typeof event.store === "object" ? event.store : {}
  await setSettings(openid, { dailyGoalMl: normalizeGoal(rawStore.dailyGoalMl) })
  const rows = normalizeImportRecords(rawStore)
  const now = Date.now()

  for (const row of rows) {
    await db.collection(RECORDS_COLLECTION).doc(docIdFor(openid, row.id)).set({
      data: {
        _openid: openid,
        recordId: row.id,
        amount: row.amount,
        ts: row.ts,
        dateKey: row.dateKey,
        source: row.source || "legacy",
        deviceId: row.deviceId || "",
        createdAt: row.ts,
        updatedAt: now,
        importedAt: now
      }
    })
  }

  return {
    ...(await buildStore(openid, event)),
    imported: rows.length
  }
}

async function setGoal(openid, event = {}) {
  await setSettings(openid, { dailyGoalMl: normalizeGoal(event.dailyGoalMl) })
  return buildStore(openid, event)
}

async function handler(event = {}) {
  try {
    await ensureCollections()
    const openid = getOpenId(event)
    const action = String(event.action || "getStore").trim()

    if (action === "getStore" || action === "summary") return buildStore(openid, event)
    if (action === "add") return addRecord(openid, event)
    if (action === "delete") return deleteRecord(openid, event)
    if (action === "clearDay" || action === "clearToday") return clearDay(openid, event)
    if (action === "setGoal") return setGoal(openid, event)
    if (action === "importStore") return importStore(openid, event)

    return { ok: false, error: `unknown action: ${action}` }
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : String(err)
    }
  }
}

exports.main = handler
exports.main_handler = handler
