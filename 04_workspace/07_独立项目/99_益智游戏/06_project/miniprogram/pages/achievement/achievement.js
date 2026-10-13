const app = getApp()

// 勋章映射（与云函数保持一致）
const BADGE_MAP = {
  first_adventure:  { name: '初次冒险',    emoji: '🌟', desc: '完成第一个任务' },
  little_detective: { name: '小侦探',      emoji: '🔍', desc: '完成10个任务' },
  super_hero:       { name: '超级英雄',     emoji: '🦸', desc: '完成50个任务' },
  color_master:     { name: '颜色大师',     emoji: '🎨', desc: '完成5个颜色/形状类任务' },
  sorting_star:     { name: '整理小能手',   emoji: '📦', desc: '完成5个整理搬运类任务' },
  sound_collector:  { name: '声音收藏家',   emoji: '🎵', desc: '完成3个声音采集类任务' },
  perseverance:     { name: '坚持不懈',     emoji: '🔥', desc: '连续7天完成任务' },
  ironman:          { name: '铁人勋章',     emoji: '💪', desc: '连续30天完成任务' }
}

Page({
  data: {
    badges: [],
    allBadges: [],
    stats: {
      totalCompleted: 0,
      totalStars: 0,
      currentStreak: 0,
      treeGrowth: 0
    }
  },

  onShow() {
    this.loadData()
  },

  async loadData() {
    wx.showLoading({ title: '加载成就...' })
    try {
      const callData = { type: 'achievement' }
      if (app.globalData.activeChild) {
        callData.asUser = app.globalData.activeChild
      }
      const res = await wx.cloud.callFunction({
        name: 'getStats',
        data: callData
      })
      const ownedBadges = res.result.badges || []

      // 构建完整勋章列表（已获得+未获得）
      const allBadges = Object.entries(BADGE_MAP).map(([id, info]) => ({
        id,
        ...info,
        owned: ownedBadges.includes(id)
      }))

      this.setData({
        badges: ownedBadges,
        allBadges,
        stats: res.result.stats || this.data.stats
      })
    } catch (err) {
      console.error('加载成就失败', err)
    }
    wx.hideLoading()
  }
})
