const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const tasks = db.collection('tasks')
const taskLogs = db.collection('task_logs')

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const userId = event.asUser || OPENID

  // 获取今日已完成任务列表，避免重复
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayLogs = await taskLogs.where({
    userId: userId,
    assignedAt: db.command.gte(today)
  }).get()
  const doneTaskIds = todayLogs.data.map(log => log.taskId)

  // 查询可用任务（排除已完成的）
  let query = { status: 'active' }
  if (doneTaskIds.length > 0) {
    query._id = db.command.nin(doneTaskIds)
  }

  const taskRes = await tasks.where(query).get()
  const availableTasks = taskRes.data

  if (availableTasks.length === 0) {
    // 所有任务已完成，重复分配
    const allTasks = await tasks.where({ status: 'active' }).get()
    const randomTask = allTasks.data[Math.floor(Math.random() * allTasks.data.length)]
    await createTaskLog(userId, randomTask._id)
    return { task: randomTask, isRepeat: true }
  }

  // 随机选一个任务
  const randomTask = availableTasks[Math.floor(Math.random() * availableTasks.length)]
  await createTaskLog(userId, randomTask._id)
  return { task: randomTask, isRepeat: false }
}

async function createTaskLog(userId, taskId) {
  const db = cloud.database()
  await db.collection('task_logs').add({
    data: {
      userId,
      taskId,
      assignedAt: db.serverDate(),
      status: 'pending',
      rewardStars: 0
    }
  })
}
