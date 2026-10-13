Page({
  data: {
    verifyType: 'parent_confirm',
    photoUrl: null,
    audioUrl: null,
    audioDuration: 0,
    audioDurationDisplay: '0',
    isRecording: false,
    submitDisabled: false
  },

  onLoad() {
    // 从全局获取当前任务的验证方式
    const app = getApp()
    if (app.globalData.currentTask) {
      this.setData({ verifyType: app.globalData.currentTask.verifyType })
    }
  },

  // 拍照
  takePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      success: (res) => {
        this.setData({ photoUrl: res.tempFiles[0].tempFilePath })
      }
    })
  },

  // 从相册选择
  choosePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        this.setData({ photoUrl: res.tempFiles[0].tempFilePath })
      }
    })
  },

  // 开始录音
  startRecord() {
    const recorderManager = wx.getRecorderManager()
    recorderManager.onStart(() => {
      this.setData({ isRecording: true })
    })
    recorderManager.onStop((res) => {
      this.setData({
        isRecording: false,
        audioUrl: res.tempFilePath,
        audioDuration: res.duration,
        audioDurationDisplay: (res.duration / 1000).toFixed(1)
      })
    })
    const options = {
      duration: 30000,
      sampleRate: 16000,
      numberOfChannels: 1,
      format: 'mp3'
    }
    recorderManager.start(options)
  },

  // 停止录音
  stopRecord() {
    const recorderManager = wx.getRecorderManager()
    recorderManager.stop()
  },

  // 提交任务
  async submitTask() {
    if (this.data.submitDisabled) return
    this.setData({ submitDisabled: true })

    wx.showLoading({ title: '提交中...' })
    try {
      const submitData = { verifyType: this.data.verifyType }

      // 多孩子支持：传入当前选中的孩子
      const app = getApp()
      if (app.globalData.activeChild) {
        submitData.asUser = app.globalData.activeChild
      }

      // 上传照片
      if (this.data.photoUrl) {
        const cloudPath = `tasks/photos/${Date.now()}.jpg`
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: this.data.photoUrl
        })
        submitData.photoUrl = uploadRes.fileID
      }

      // 上传录音
      if (this.data.audioUrl) {
        const cloudPath = `tasks/audios/${Date.now()}.mp3`
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: this.data.audioUrl
        })
        submitData.audioUrl = uploadRes.fileID
      }

      const res = await wx.cloud.callFunction({
        name: 'submitTask',
        data: submitData
      })

      wx.hideLoading()
      // 传任务难度作为星星数
      const stars = app.globalData.currentTask?.difficulty || 1
      wx.redirectTo({ url: `/pages/success/success?stars=${stars}` })
    } catch (err) {
      console.error('提交失败', err)
      wx.hideLoading()
      wx.showToast({ title: '提交失败，请重试', icon: 'none' })
      this.setData({ submitDisabled: false })
    }
  },

  // 家长直接确认（MVP模式）
  parentConfirm() {
    this.submitTask()
  }
})
