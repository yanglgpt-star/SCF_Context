Page({
  data: {
    tasks: [],
    showForm: false,
    editingTask: null,
    form: {
      title: '',
      category: 'color_shape',
      difficulty: 1,
      description: '',
      tips: '',
      verifyType: 'parent_confirm'
    }
  },

  onShow() {
    this.loadTasks()
  },

  async loadTasks() {
    wx.showLoading({ title: '加载任务库...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'getStats',
        data: { type: 'taskList' }
      })
      this.setData({ tasks: res.result.tasks || [] })
    } catch (err) {
      console.error('加载任务失败', err)
    }
    wx.hideLoading()
  },

  showAddForm() {
    this.setData({
      showForm: true,
      editingTask: null,
      form: { title: '', category: 'color_shape', difficulty: 1, description: '', tips: '', verifyType: 'parent_confirm' }
    })
  },

  hideForm() {
    this.setData({ showForm: false })
  },

  onFormInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({
      [`form.${field}`]: e.detail.value
    })
  },

  async saveTask() {
    if (!this.data.form.title) {
      wx.showToast({ title: '请输入任务标题', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中...' })
    try {
      await wx.cloud.callFunction({
        name: 'addTask',
        data: this.data.form
      })
      wx.showToast({ title: '保存成功', icon: 'success' })
      this.hideForm()
      this.loadTasks()
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
    wx.hideLoading()
  },

  toggleTaskStatus(e) {
    const { id, status } = e.currentTarget.dataset
    wx.showLoading({ title: '操作中...' })
    wx.cloud.callFunction({
      name: 'addTask',
      data: { taskId: id, action: status === 'active' ? 'deactivate' : 'activate' }
    }).then(() => {
      this.loadTasks()
    }).catch(() => {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }).finally(() => {
      wx.hideLoading()
    })
  },

  // 录制任务语音
  recordVoice(e) {
    const { id, title } = e.currentTarget.dataset
    const tasks = this.data.tasks
    const idx = tasks.findIndex(t => t._id === id)
    if (idx === -1) return

    const task = tasks[idx]
    const recorderManager = wx.getRecorderManager()

    if (task.recording) {
      // 停止录音
      recorderManager.stop()
      return
    }

    // 标记录音中
    const key = `tasks[${idx}].recording`
    this.setData({ [key]: true })

    // 开始录音
    const options = { duration: 60000, sampleRate: 16000, numberOfChannels: 1, format: 'mp3' }
    recorderManager.start(options)

    recorderManager.onStop(async (res) => {
      this.setData({ [key]: false })
      if (!res.tempFilePath) return

      wx.showLoading({ title: '上传语音...' })
      try {
        // 上传到云存储
        const cloudPath = `voices/task_${id}_${Date.now()}.mp3`
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: res.tempFilePath
        })

        // 更新任务 voiceUrl
        await wx.cloud.callFunction({
          name: 'addTask',
          data: { taskId: id, action: 'setVoice', voiceUrl: uploadRes.fileID }
        })

        wx.showToast({ title: '语音录制成功！', icon: 'success' })
        this.loadTasks()
      } catch (err) {
        console.error('语音上传失败', err)
        wx.showToast({ title: '语音上传失败', icon: 'none' })
        this.setData({ [key]: false })
      }
      wx.hideLoading()
    })

    recorderManager.onError((err) => {
      console.error('录音失败', err)
      this.setData({ [key]: false })
      wx.showToast({ title: '录音失败，请检查麦克风权限', icon: 'none' })
    })
  }
})
