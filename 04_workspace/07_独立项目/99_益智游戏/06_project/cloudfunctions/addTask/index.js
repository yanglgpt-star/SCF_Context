const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { title, category, difficulty, description, tips, verifyType, taskId, action } = event

  // 编辑/切换状态
  if (taskId) {
    if (action === 'activate') {
      await db.collection('tasks').doc(taskId).update({ data: { status: 'active' } })
      return { success: true }
    } else if (action === 'deactivate') {
      await db.collection('tasks').doc(taskId).update({ data: { status: 'inactive' } })
      return { success: true }
    } else if (action === 'setVoice') {
      await db.collection('tasks').doc(taskId).update({ data: { voiceUrl: event.voiceUrl } })
      return { success: true }
    }
    return { success: false }
  }

  // 新增任务
  await db.collection('tasks').add({
    data: {
      title,
      category,
      difficulty: parseInt(difficulty),
      description: description || title,
      tips: tips || '',
      verifyType: verifyType || 'parent_confirm',
      status: 'active',
      createdAt: db.serverDate()
    }
  })

  return { success: true }
}
