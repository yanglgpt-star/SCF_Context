const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { type, asUser } = event
  const userId = asUser || OPENID

  switch (type) {
    case 'pending': {
      // 待审核列表
      const res = await db.collection('task_logs')
        .where({ status: 'reviewing' })
        .orderBy('completedAt', 'desc')
        .get()
      const list = res.data || []

      // 批量查询任务标题
      const taskIds = [...new Set(list.map(log => log.taskId))]
      const taskRes = taskIds.length > 0
        ? await db.collection('tasks').where({
            _id: db.command.in(taskIds)
          }).get()
        : { data: [] }
      const taskMap = {}
      taskRes.data.forEach(t => { taskMap[t._id] = t.title })

      const enrichedList = list.map(log => ({
        ...log,
        taskTitle: taskMap[log.taskId] || '未知任务'
      }))

      return { list: enrichedList }
    }

    case 'achievement': {
      // 成就数据
      const userRes = await db.collection('users').where({ openId: userId }).get()
      const user = userRes.data[0] || {}
      const logRes = await db.collection('task_logs')
        .where({ userId: userId, status: 'approved' })
        .get()

      return {
        stats: {
          totalCompleted: logRes.data.length,
          totalStars: user.stars || 0,
          currentStreak: user.streak || 0,
          treeGrowth: user.treeGrowth || 0
        },
        badges: user.badges || []
      }
    }

    case 'wishes': {
      // 愿望清单
      const userRes = await db.collection('users').where({ openId: userId }).get()
      const user = userRes.data[0] || {}
      const wishRes = await db.collection('wishes').where({ userId: userId }).get()
      return {
        wishes: wishRes.data,
        myStars: user.currentStars || 0
      }
    }

    case 'redeem': {
      // 兑换愿望
      const { wishId } = event
      const userRes = await db.collection('users').where({ openId: userId }).get()
      const user = userRes.data[0]
      if (!user) return { success: false, message: '用户不存在' }

      const wishRes = await db.collection('wishes').doc(wishId).get()
      const wish = wishRes.data
      if (!wish) return { success: false, message: '愿望不存在' }
      if (wish.status === 'redeemed') return { success: false, message: '已兑换' }
      if ((user.currentStars || 0) < wish.costStars) return { success: false, message: '星星不足' }

      await db.collection('users').doc(user._id).update({
        data: { currentStars: db.command.inc(-wish.costStars) }
      })
      await db.collection('wishes').doc(wishId).update({
        data: { status: 'redeemed', redeemedAt: db.serverDate() }
      })
      return { success: true }
    }

    case 'admin': {
      // 管理统计
      const pendingRes = await db.collection('task_logs')
        .where({ status: 'reviewing' }).count()
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayRes = await db.collection('task_logs')
        .where({
          completedAt: db.command.gte(today),
          status: 'approved'
        }).count()
      const taskRes = await db.collection('tasks').where({ status: 'active' }).count()

      return {
        pendingReview: pendingRes.total,
        todayCompleted: todayRes.total,
        totalTasks: taskRes.total
      }
    }

    case 'report': {
      // 成长报告
      const now = new Date()
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      const logsRes = await db.collection('task_logs')
        .where({
          userId: userId,
          status: 'approved',
          completedAt: db.command.gte(monthAgo)
        })
        .orderBy('completedAt', 'asc')
        .get()
      const logs = logsRes.data || []

      // 获取任务类别信息
      const taskIds = [...new Set(logs.map(l => l.taskId))]
      const taskRes = taskIds.length > 0
        ? await db.collection('tasks').where({ _id: db.command.in(taskIds) }).get()
        : { data: [] }
      const taskMap = {}
      taskRes.data.forEach(t => { taskMap[t._id] = { title: t.title, category: t.category } })

      // 按天统计（最近7天）
      const dailyMap = {}
      const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
        const key = d.toISOString().slice(0, 10)
        dailyMap[key] = { date: key, weekday: weekDays[d.getDay()], count: 0, stars: 0 }
      }
      const weekLogs = logs.filter(l => l.completedAt && new Date(l.completedAt) >= weekAgo)
      weekLogs.forEach(l => {
        const key = new Date(l.completedAt).toISOString().slice(0, 10)
        if (dailyMap[key]) {
          dailyMap[key].count++
          dailyMap[key].stars += l.rewardStars || 0
        }
      })
      const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date))

      // 类别分布
      const categoryDist = {}
      logs.forEach(l => {
        const cat = taskMap[l.taskId]?.category || '其他'
        categoryDist[cat] = (categoryDist[cat] || 0) + 1
      })

      // 总览数据
      const weekTotal = weekLogs.length
      const monthTotal = logs.length
      const userRes = await db.collection('users').where({ openId: userId }).get()
      const user = userRes.data[0] || {}
      const weekStars = weekLogs.reduce((sum, l) => sum + (l.rewardStars || 0), 0)

      return {
        weekTotal,
        monthTotal,
        weekStars,
        totalStars: user.stars || 0,
        daily,
        categoryDist,
        streak: user.streak || 0
      }
    }

    case 'taskList': {
      const res = await db.collection('tasks').orderBy('createdAt', 'desc').get()
      return { tasks: res.data }
    }

    default:
      return { error: 'unknown type' }
  }
}
