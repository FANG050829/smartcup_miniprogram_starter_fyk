const cloud = require("wx-server-sdk")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const USERS_COLLECTION = "smartcup_users"
const BINDINGS_COLLECTION = "family_bindings"
const SNAPSHOTS_COLLECTION = "family_care_snapshots"

function getOpenId(event = {}) {
  const ctx = cloud.getWXContext ? cloud.getWXContext() : {}
  return String(ctx.OPENID || event.openid || "").trim()
}

function requireOpenId(event = {}) {
  const openid = getOpenId(event)
  if (!openid) throw new Error("openid unavailable")
  return openid
}

function cleanText(value, fallback = "") {
  return String(value || fallback).trim().slice(0, 80)
}

function cleanBindCode(value) {
  const code = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, 16)
  return code.length >= 4 ? code : ""
}

function makeRandomBindCode() {
  return `SC${Math.floor(100000 + Math.random() * 900000)}`
}

function normalizeSummary(summary = {}) {
  const todayAmount = Math.max(0, Math.round(Number(summary.todayAmount) || 0))
  const goalMl = Math.max(800, Math.min(6000, Math.round(Number(summary.goalMl) || 2000)))
  const percent = Math.max(0, Math.min(100, Math.round(Number(summary.percent) || (todayAmount / goalMl) * 100)))
  return {
    todayAmount,
    goalMl,
    percent,
    lastWaterText: cleanText(summary.lastWaterText, "暂无记录"),
    statusText: cleanText(summary.statusText, "等待记录"),
    statusTone: cleanText(summary.statusTone, "muted")
  }
}

function publicProfile(row = {}) {
  return {
    nickName: cleanText(row.nickName, "微信用户"),
    avatarUrl: cleanText(row.avatarUrl, ""),
    bindCode: cleanText(row.bindCode, ""),
    bindDeviceId: cleanText(row.bindDeviceId, ""),
    bindDeviceName: cleanText(row.bindDeviceName, ""),
    createdAt: Number(row.createdAt) || 0,
    updatedAt: Number(row.updatedAt) || 0
  }
}

async function ensureCollections() {
  await db.createCollection(USERS_COLLECTION).catch(() => null)
  await db.createCollection(BINDINGS_COLLECTION).catch(() => null)
  await db.createCollection(SNAPSHOTS_COLLECTION).catch(() => null)
}

async function getUser(openid) {
  const res = await db.collection(USERS_COLLECTION).doc(openid).get().catch(() => null)
  return res && res.data ? res.data : null
}

async function isBindCodeAvailable(bindCode, ownerOpenid = "") {
  const res = await db.collection(USERS_COLLECTION)
    .where({ bindCode })
    .limit(2)
    .get()
    .catch(() => ({ data: [] }))
  const rows = res.data || []
  return rows.every(row => row && row._id === ownerOpenid)
}

async function makeUniqueBindCode(openid) {
  for (let i = 0; i < 12; i += 1) {
    const bindCode = makeRandomBindCode()
    if (await isBindCodeAvailable(bindCode, openid)) return bindCode
  }
  throw new Error("unable to allocate bind code")
}

async function ensureUser(openid, event = {}) {
  const now = Date.now()
  const current = await getUser(openid)
  const nickName = cleanText(event.nickName, current && current.nickName ? current.nickName : "微信用户")
  const avatarUrl = cleanText(event.avatarUrl, current && current.avatarUrl ? current.avatarUrl : "")
  const deviceId = cleanText(event.deviceId || event.deviceToken, "")
  const deviceName = cleanText(event.deviceName, "")

  if (current) {
    const patch = {
      nickName,
      avatarUrl,
      updatedAt: now
    }
    if (deviceId) {
      patch.bindDeviceId = deviceId
      if (deviceName) patch.bindDeviceName = deviceName
    }
    if (!cleanBindCode(current.bindCode)) {
      patch.bindCode = await makeUniqueBindCode(openid)
    }
    await db.collection(USERS_COLLECTION).doc(openid).update({ data: patch })
    return publicProfile({ ...current, ...patch, _id: openid })
  }

  const bindCode = await makeUniqueBindCode(openid)
  const row = {
    _openid: openid,
    openid,
    nickName,
    avatarUrl,
    bindCode,
    bindDeviceId: deviceId,
    bindDeviceName: deviceName,
    createdAt: now,
    updatedAt: now
  }
  await db.collection(USERS_COLLECTION).doc(openid).set({ data: row })
  return publicProfile({ ...row, _id: openid })
}

async function login(openid, event = {}) {
  const profile = await ensureUser(openid, event)
  return { ok: true, profile }
}

async function updateBindCode(openid, event = {}) {
  const bindCode = cleanBindCode(event.bindCode)
  if (!bindCode) throw new Error("绑定码需为 4-16 位字母或数字")
  const current = await ensureUser(openid, event)
  const available = await isBindCodeAvailable(bindCode, openid)
  if (!available) throw new Error("绑定码已被占用")

  const updatedAt = Date.now()
  await db.collection(USERS_COLLECTION).doc(openid).update({
    data: {
      bindCode,
      updatedAt
    }
  })
  return {
    ok: true,
    profile: {
      ...current,
      bindCode,
      updatedAt
    }
  }
}

async function findUserByBindCode(bindCode) {
  const res = await db.collection(USERS_COLLECTION)
    .where({ bindCode })
    .limit(1)
    .get()
  return res.data && res.data[0] ? res.data[0] : null
}

async function bindByCode(openid, event = {}) {
  const viewer = await ensureUser(openid, event)
  const bindCode = cleanBindCode(event.bindCode || event.code)
  if (!bindCode) throw new Error("请输入有效绑定码")

  const owner = await findUserByBindCode(bindCode)
  if (!owner) throw new Error("未找到该绑定码")
  const ownerOpenid = owner._id || owner.openid
  if (ownerOpenid === openid) throw new Error("不能绑定自己的绑定码")

  const now = Date.now()
  const docId = `${ownerOpenid}_${openid}`.replace(/[^\w-]/g, "_").slice(0, 128)
  await db.collection(BINDINGS_COLLECTION).doc(docId).set({
    data: {
      ownerOpenid,
      viewerOpenid: openid,
      viewerName: cleanText(event.viewerName, viewer.nickName || "家人"),
      relation: cleanText(event.relation, "家人"),
      permissions: ["summary"],
      status: "active",
      bindCode,
      createdAt: now,
      updatedAt: now
    }
  })

  const snapshot = await getSnapshot(ownerOpenid)
  return {
    ok: true,
    owner: publicProfile({ ...owner, _id: ownerOpenid }),
    snapshot
  }
}

async function createCode(openid, event = {}) {
  const profile = await ensureUser(openid, event)
  return { ok: true, code: profile.bindCode, profile }
}

async function bindCode(openid, event = {}) {
  return bindByCode(openid, event)
}

async function saveSnapshot(openid, event = {}) {
  const current = await getUser(openid)
  if (!current) return { ok: false, error: "not logged in" }

  const deviceId = cleanText(event.deviceId || event.deviceToken, "")
  if (!deviceId) return { ok: false, error: "缺少水杯信息，请先绑定你的水杯" }

  const now = Date.now()
  const summary = normalizeSummary(event.summary || {})
  const deviceName = cleanText(event.deviceName, "智饮杯")
  await db.collection(SNAPSHOTS_COLLECTION).doc(openid).set({
    data: {
      ownerOpenid: openid,
      summary,
      deviceName,
      deviceId,
      updatedAt: now
    }
  })
  // 绑定码跟随当前使用的杯子：换杯后自动切换家人可见的杯子
  if (cleanText(current.bindDeviceId, "") !== deviceId) {
    await db.collection(USERS_COLLECTION).doc(openid).update({
      data: { bindDeviceId: deviceId, bindDeviceName: deviceName, updatedAt: now }
    })
  }
  return { ok: true, summary, updatedAt: now }
}

async function getSnapshot(ownerOpenid) {
  const res = await db.collection(SNAPSHOTS_COLLECTION).doc(ownerOpenid).get().catch(() => null)
  return res && res.data ? res.data : null
}

async function getActiveBindings(field, value) {
  const res = await db.collection(BINDINGS_COLLECTION)
    .where({ [field]: value, status: "active" })
    .limit(50)
    .get()
    .catch(() => ({ data: [] }))
  return res.data || []
}

async function getSummary(openid) {
  const profileRow = await getUser(openid)
  const profile = profileRow ? publicProfile({ ...profileRow, _id: openid }) : null
  const ownSnapshot = profile ? await getSnapshot(openid) : null
  const ownerBindings = profile ? await getActiveBindings("ownerOpenid", openid) : []
  const viewerBindings = profile ? await getActiveBindings("viewerOpenid", openid) : []

  const careViewers = ownerBindings.map(item => ({
    id: item._id || `${item.ownerOpenid}_${item.viewerOpenid}`,
    viewerName: cleanText(item.viewerName, "家人"),
    relation: cleanText(item.relation, "家人"),
    permissions: item.permissions || ["summary"],
    status: cleanText(item.status, "active"),
    updatedAt: Number(item.updatedAt) || 0
  }))

  const careTargets = []
  for (const item of viewerBindings) {
    const ownerOpenid = item.ownerOpenid
    const owner = ownerOpenid ? await getUser(ownerOpenid) : null
    const snapshot = ownerOpenid ? await getSnapshot(ownerOpenid) : null
    careTargets.push({
      id: item._id || `${ownerOpenid}_${openid}`,
      owner: owner ? publicProfile({ ...owner, _id: ownerOpenid }) : null,
      relation: cleanText(item.relation, "家人"),
      permissions: item.permissions || ["summary"],
      status: cleanText(item.status, "active"),
      snapshot,
      updatedAt: Number(item.updatedAt) || 0
    })
  }

  return {
    ok: true,
    profile,
    snapshot: ownSnapshot,
    careViewers,
    careTargets
  }
}

async function unbind(openid, event = {}) {
  const bindingId = cleanText(event.bindingId, "")
  if (!bindingId) throw new Error("缺少绑定关系 ID")
  const res = await db.collection(BINDINGS_COLLECTION).doc(bindingId).get().catch(() => null)
  const row = res && res.data ? res.data : null
  if (!row) throw new Error("绑定关系不存在")
  if (row.ownerOpenid !== openid && row.viewerOpenid !== openid) {
    throw new Error("无权操作此绑定关系")
  }
  await db.collection(BINDINGS_COLLECTION).doc(bindingId).update({
    data: { status: "removed", updatedAt: Date.now() }
  })
  return { ok: true }
}

async function handler(event = {}) {
  try {
    await ensureCollections()
    const openid = requireOpenId(event)
    const action = cleanText(event.action || "getSummary")
    if (action === "login") return login(openid, event)
    if (action === "updateBindCode") return updateBindCode(openid, event)
    if (action === "createCode") return createCode(openid, event)
    if (action === "bindCode" || action === "bindByCode") return bindByCode(openid, event)
    if (action === "saveSnapshot") return saveSnapshot(openid, event)
    if (action === "getSummary" || action === "getDashboard") return getSummary(openid)
    if (action === "unbind") return unbind(openid, event)
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
