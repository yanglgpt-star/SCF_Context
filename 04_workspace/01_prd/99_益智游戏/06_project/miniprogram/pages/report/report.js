const app = getApp()

Page({
  data: {
    tab: 'week',
    weekTotal: 0,
    monthTotal: 0,
    weekStars: 0,
    totalStars: 0,
    streak: 0,
    daily: [],
    categoryDist: {},
    loading: true
  },

  onShow() {
    this.loadReport()
  },

  async loadReport() {
    this.setData({ loading: true })
    try {
      const callData = { type: 'report' }
      if (app.globalData.activeChild) {
        callData.asUser = app.globalData.activeChild
      }
      const res = await wx.cloud.callFunction({
        name: 'getStats',
        data: callData
      })
      const result = res.result

      // 将 categoryDist 对象转数组
      const categoryDist = []
      let categoryMax = 0
      for (const [key, value] of Object.entries(result.categoryDist || {})) {
        categoryDist.push({ key, value })
        if (value > categoryMax) categoryMax = value
      }

      // 计算柱状图最大值
      const daily = result.daily || []
      let maxCount = 0
      daily.forEach(d => { if (d.count > maxCount) maxCount = d.count })

      this.setData({
        weekTotal: result.weekTotal || 0,
        monthTotal: result.monthTotal || 0,
        weekStars: result.weekStars || 0,
        totalStars: result.totalStars || 0,
        streak: result.streak || 0,
        daily,
        categoryDist,
        maxCount,
        categoryMax,
        loading: false
      })
    } catch (err) {
      console.error('加载报告失败', err)
      this.setData({ loading: false })
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ tab })
  },

  goBack() {
    wx.navigateBack()
  }
})
