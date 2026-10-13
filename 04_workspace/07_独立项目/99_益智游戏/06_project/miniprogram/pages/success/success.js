const app = getApp()

Page({
  data: {
    rewardStars: 0,
    totalStars: 0,
    showAnimation: true
  },

  onLoad(options) {
    const rewardStars = parseInt(options.stars) || 1
    const userStars = app.globalData.userInfo?.stars || 0
    this.setData({
      rewardStars,
      totalStars: userStars + rewardStars
    })

    // 完成音效（可选，无音频文件时不播放）
    try {
      const innerAudio = wx.createInnerAudioContext()
      innerAudio.src = '/audio/success.mp3'
      innerAudio.onError(() => {})  // 静默处理文件缺失
      innerAudio.play()
    } catch (e) {
      // 忽略音频播放失败
    }
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  },

  continueAdventure() {
    wx.reLaunch({ url: '/pages/index/index' })
  }
})
