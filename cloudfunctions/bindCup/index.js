const cloud = require("wx-server-sdk")
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event = {}) => {
  const token = (event.token || "").trim()
  const imei = (event.imei || event.cloudDeviceId || "").trim()
  const key = imei || token
  if (!key) return { ok: false, error: "缺少设备标识" }

  const name = (event.name || "").trim()
  const { OPENID } = cloud.getWXContext()
  const now = db.serverDate()

  // 简单去重：同一个用户绑定同一个设备标识，只保留一条
  const old = await db.collection("user_devices").where({ openid: OPENID, deviceKey: key }).get()
  if (old.data && old.data.length > 0) {
    await db.collection("user_devices").doc(old.data[0]._id).update({
      data: { bindAt: now, name: name || old.data[0].name }
    })
    return { ok: true, updated: true }
  }

  await db.collection("user_devices").add({
    data: { openid: OPENID, deviceKey: key, token, imei, name, bindAt: now }
  })
  return { ok: true, created: true }
}
