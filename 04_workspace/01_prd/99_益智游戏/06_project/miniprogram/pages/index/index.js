const app = getApp()

Page({
  data: {
    characterAnim: 'idle',
    showStartBtn: false,
    hasSafetyConfirm: false,
    todayTask: null,
    loadingError: false,
    userInfo: null,
    activeChildName: '',
    categoryEmoji: '🎯',
    previewStars: []
  },

  onLoad() {
    this.checkSafety()
  },

  onShow() {
    if (this.data.hasSafetyConfirm) {
      // 刷新当前选中的孩子名称（家长可能在管理页切换了孩子）
      if (app.globalData.activeChild && app.globalData.children) {
        const active = app.globalData.children.find(c => c.openId === app.globalData.activeChild)
        if (active && active.nickName !== this.data.activeChildName) {
          this.setData({ activeChildName: active.nickName })
        }
      }
      this.loadTodayTask()
    }
  },

  // 检查安全宣誓
  checkSafety() {
    const safetyConfirm = wx.getStorageSync('safety_confirmed')
    const expireTime = wx.getStorageSync('safety_expire')
    const now = Date.now()

    if (safetyConfirm && expireTime && now < expireTime) {
      this.setData({ hasSafetyConfirm: true })
      this.loginAndLoad()
    } else {
      wx.redirectTo({ url: '/pages/safety/safety' })
    }
  },

  // 登录 + 加载任务
  async loginAndLoad() {
    try {
      const res = await wx.cloud.callFunction({ name: 'login' })
      const userInfo = res.result.userInfo || {}
      app.globalData.userInfo = userInfo
      app.globalData.userRole = res.result.role
      const children = res.result.children || []
      app.globalData.children = children

      // 如果是家长且有孩子，默认选中第一个
      if (res.result.role === 'parent' && children.length > 0 && !app.globalData.activeChild) {
        app.globalData.activeChild = children[0].openId
      }

      // 设置当前显示的孩子名称
      const activeChild = app.globalData.activeChild
        ? children.find(c => c.openId === app.globalData.activeChild) : null

      this.setData({
        userInfo,
        activeChildName: activeChild ? activeChild.nickName : ''
      })
      this.loadTodayTask()
    } catch (err) {
      console.error('登录失败', err)
      this.loadTodayTask()
    }
  },

  // 加载今日任务
  async loadTodayTask() {
    wx.showLoading({ title: '准备冒险...' })
    this.setData({ loadingError: false })
    try {
      const callData = {}
      if (app.globalData.activeChild) {
        callData.asUser = app.globalData.activeChild
      }
      const res = await wx.cloud.callFunction({ name: 'getDailyTask', data: callData })
      const task = res.result.task
      app.globalData.currentTask = task

      // 计算分类 emoji 和难度星星
      const CATEGORY_EMOJI = { color_shape: '🎨', sorting: '📦', sound: '🎵', treasure: '🗺️' }
      const stars = []
      for (let i = 0; i < (task.difficulty || 0); i++) stars.push(i)

      this.setData({
        todayTask: task,
        categoryEmoji: CATEGORY_EMOJI[task.category] || '🎯',
        previewStars: stars,
        showStartBtn: true
      })
    } catch (err) {
      console.error('加载任务失败', err)
      this.setData({ loadingError: true, showStartBtn: true })
    }
    wx.hideLoading()
  },

  // 开始冒险
  startAdventure() {
    if (!app.globalData.currentTask) {
      wx.showToast({ title: '任务加载中，请稍后', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/task/task' })
  },

  // 进入家长模式
  goAdmin() {
    wx.navigateTo({ url: '/pages/admin/admin' })
  },

  // 进入成就页
  goAchievement() {
    wx.navigateTo({ url: '/pages/achievement/achievement' })
  },

  // 重试加载
  retryLoad() {
    this.loadTodayTask()
  }
})
