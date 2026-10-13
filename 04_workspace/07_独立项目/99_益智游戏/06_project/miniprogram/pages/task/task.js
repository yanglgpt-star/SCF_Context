const app = getApp()

// 类别 → emoji 映射
const CATEGORY_EMOJI = {
  color_shape: '🎨',
  sorting: '📦',
  sound: '🎵',
  treasure: '🗺️'
}

Page({
  data: {
    task: null,
    taskId: '',
    ttsText: '',
    voiceStatus: 'idle',
    voiceIcon: '🔈',
    voiceHint: '点我听任务',
    categoryEmoji: '🎯',
    starsArr: []
  },

  onLoad() {
    if (app.globalData.currentTask) {
      this.setTaskData(app.globalData.currentTask)
    } else {
      this.loadTask()
    }
  },

  setTaskData(task) {
    const starsArr = []
    for (let i = 0; i < task.difficulty; i++) {
      starsArr.push(i)
    }
    this.setData({
      task,
      taskId: task._id,
      ttsText: task.title + '。' + (task.description || ''),
      starsArr,
      categoryEmoji: CATEGORY_EMOJI[task.category] || '🎯'
    })
    // 有家长录制语音 → 自动播放
    if (task.voiceUrl) {
      this.setData({ voiceStatus: 'loading', voiceIcon: '⏳', voiceHint: '加载语音中...' })
      setTimeout(() => this.playVoice(), 500)
    }
    // 无录制语音 → text2audio 组件自动处理，无需额外操作
  },

  async loadTask() {
    wx.showLoading({ title: '加载任务...' })
    try {
      const callData = {}
      if (app.globalData.activeChild) {
        callData.asUser = app.globalData.activeChild
      }
      const res = await wx.cloud.callFunction({ name: 'getDailyTask', data: callData })
      const task = res.result.task
      app.globalData.currentTask = task
      this.setTaskData(task)
    } catch (err) {
      console.error('加载任务失败', err)
      wx.showToast({ title: '任务加载失败', icon: 'none' })
    }
    wx.hideLoading()
  },

  // 仅用于播放家长录制的语音（voiceUrl 存在时）
  playVoice() {
    const task = this.data.task
    if (!task || !task.voiceUrl) return

    if (this.data.voiceStatus === 'playing') {
      if (this.innerAudio) this.innerAudio.stop()
      this.setData({ voiceStatus: 'idle', voiceIcon: '🔈', voiceHint: '再听一遍' })
      return
    }

    this.setData({ voiceStatus: 'playing', voiceIcon: '🔊', voiceHint: '播放中...' })

    if (this.innerAudio) this.innerAudio.destroy()
    this.innerAudio = wx.createInnerAudioContext()
    this.innerAudio.src = task.voiceUrl
    this.innerAudio.play()

    this.innerAudio.onEnded(() => {
      this.setData({ voiceStatus: 'done', voiceIcon: '✅', voiceHint: '再听一遍' })
    })
    this.innerAudio.onError(() => {
      this.setData({ voiceStatus: 'error', voiceIcon: '❌', voiceHint: '点我重试' })
    })
  },

  goSubmit() {
    wx.navigateTo({ url: '/pages/submit/submit' })
  },

  goBack() {
    wx.reLaunch({ url: '/pages/index/index' })
  },

  onUnload() {
    if (this.innerAudio) this.innerAudio.destroy()
  }
})
