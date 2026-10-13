const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { photoUrl, audioUrl, verifyType, asUser } = event
  const userId = asUser || OPENID

  // 查找用户最新的待完成任务记录
  const logRes = await db.collection('task_logs').where({
    userId,
    status: 'pending'
  }).orderBy('assignedAt', 'desc').limit(1).get()

  if (logRes.data.length === 0) {
    return { success: false, message: '没有待完成的任务' }
  }

  const logId = logRes.data[0]._id
  const updateData = {
    status: 'reviewing',
    completedAt: db.serverDate(),
    verifyType
  }

  if (photoUrl) updateData.photoUrl = photoUrl
  if (audioUrl) updateData.audioUrl = audioUrl

  await db.collection('task_logs').doc(logId).update({ data: updateData })

  return { success: true, logId }
}
