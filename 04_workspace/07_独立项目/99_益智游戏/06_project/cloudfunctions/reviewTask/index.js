const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 勋章定义
const BADGE_DEFS = {
  first_adventure:  { name: '初次冒险',    desc: '完成第一个任务',               check: stats => stats.totalApproved >= 1 },
  little_detective: { name: '小侦探',      desc: '完成10个任务',                check: stats => stats.totalApproved >= 10 },
  super_hero:       { name: '超级英雄',     desc: '完成50个任务',                check: stats => stats.totalApproved >= 50 },
  color_master:     { name: '颜色大师',     desc: '完成5个颜色/形状类任务',       check: stats => (stats.categoryCount['color_shape'] || 0) >= 5 },
  sorting_star:     { name: '整理小能手',   desc: '完成5个整理搬运类任务',        check: stats => (stats.categoryCount['sorting'] || 0) >= 5 },
  sound_collector:  { name: '声音收藏家',   desc: '完成3个声音采集类任务',        check: stats => (stats.categoryCount['sound'] || 0) >= 3 },
  perseverance:     { name: '坚持不懈',     desc: '连续7天完成任务',              check: stats => stats.streak >= 7 },
  ironman:          { name: '铁人勋章',     desc: '连续30天完成任务',             check: stats => stats.streak >= 30 }
}

exports.main = async (event) => {
  const { logId, status } = event

  try {
    // 获取任务记录
    const logRes = await db.collection('task_logs').doc(logId).get()
    const log = logRes.data

    // 获取任务信息（计算星星）
    const taskRes = await db.collection('tasks').doc(log.taskId).get()
    const task = taskRes.data || {}
    const rewardStars = status === 'approved' ? (task.difficulty || 1) : 0

    // 更新任务记录
    await db.collection('task_logs').doc(logId).update({
      data: {
        status,
        rewardStars,
        reviewedAt: db.serverDate()
      }
    })

    // 如果通过，给用户加星星并检查勋章
    if (status === 'approved' && log.userId) {
      await grantRewardsAndBadges(log.userId, rewardStars, log.taskId)
    }

    return { success: true, rewardStars }
  } catch (err) {
    console.error('reviewTask error:', err)
    return { success: false, error: err }
  }
}

async function grantRewardsAndBadges(userId, rewardStars, taskId) {
  // 查找用户
  const userRes = await db.collection('users').where({ openId: userId }).get()
  if (userRes.data.length === 0) return
  const user = userRes.data[0]

  // 更新星星和成长值
  const updateData = {
    stars: db.command.inc(rewardStars),
    currentStars: db.command.inc(rewardStars),
    treeGrowth: db.command.inc(3)
  }

  // 更新连续打卡（检查上次完成日期）
  const todayStr = new Date().toISOString().slice(0, 10)
  const lastComplete = user.lastCompleteDate || ''
  if (lastComplete !== todayStr) {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().slice(0, 10)
    if (lastComplete === yesterdayStr) {
      updateData.streak = db.command.inc(1)
    } else {
      updateData.streak = 1  // 断签重置
    }
    updateData.lastCompleteDate = todayStr
  }

  // 计算勋章条件
  const stats = await computeStats(userId, taskId)
  const newBadges = []
  for (const [id, def] of Object.entries(BADGE_DEFS)) {
    if (!user.badges?.includes(id) && def.check(stats)) {
      newBadges.push(id)
    }
  }
  if (newBadges.length > 0) {
    updateData.badges = db.command.pushEach(newBadges)
  }

  await db.collection('users').doc(user._id).update({ data: updateData })
}

async function computeStats(userId, newTaskId) {
  // 获取所有已通过的任务
  const logsRes = await db.collection('task_logs')
    .where({ userId, status: 'approved' })
    .get()
  const approvedLogs = logsRes.data || []

  // 获取任务类别信息
  const taskIds = [...new Set(approvedLogs.map(l => l.taskId))]
  const taskRes = taskIds.length > 0
    ? await db.collection('tasks').where({ _id: db.command.in(taskIds) }).get()
    : { data: [] }
  const taskMap = {}
  taskRes.data.forEach(t => { taskMap[t._id] = t.category })

  // 分类统计
  const categoryCount = {}
  approvedLogs.forEach(log => {
    const cat = taskMap[log.taskId] || 'unknown'
    categoryCount[cat] = (categoryCount[cat] || 0) + 1
  })

  // 获取连续天数
  const userRes = await db.collection('users').where({ openId: userId }).get()
  const user = userRes.data[0] || {}

  return {
    totalApproved: approvedLogs.length,
    categoryCount,
    streak: user.streak || 0
  }
}
