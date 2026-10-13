Page({
  data: {
    pendingList: [],
    loading: true
  },

  onShow() {
    this.loadPendingList()
  },

  async loadPendingList() {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'getStats',
        data: { type: 'pending' }
      })
      this.setData({
        pendingList: res.result.list || [],
        loading: false
      })
    } catch (err) {
      console.error('加载待审核列表失败', err)
      this.setData({ loading: false })
    }
  },

  // 查看提交详情（照片/录音）
  viewMedia(e) {
    const { url, type } = e.currentTarget.dataset
    if (type === 'photo' && url) {
      wx.previewImage({ urls: [url] })
    } else if (type === 'audio' && url) {
      const innerAudio = wx.createInnerAudioContext()
      innerAudio.src = url
      innerAudio.play()
    }
  },

  // 通过
  async approve(e) {
    const { id } = e.currentTarget.dataset
    wx.showLoading({ title: '审核中...' })
    try {
      await wx.cloud.callFunction({
        name: 'reviewTask',
        data: { logId: id, status: 'approved' }
      })
      wx.showToast({ title: '已通过！', icon: 'success' })
      this.loadPendingList()
    } catch (err) {
      console.error('审核失败', err)
      wx.showToast({ title: '操作失败，请重试', icon: 'none' })
    }
    wx.hideLoading()
  },

  // 驳回
  async reject(e) {
    const { id } = e.currentTarget.dataset
    wx.showLoading({ title: '审核中...' })
    try {
      await wx.cloud.callFunction({
        name: 'reviewTask',
        data: { logId: id, status: 'rejected' }
      })
      wx.showToast({ title: '已驳回', icon: 'none' })
      this.loadPendingList()
    } catch (err) {
      console.error('驳回失败', err)
      wx.showToast({ title: '操作失败，请重试', icon: 'none' })
    }
    wx.hideLoading()
  },

  goBack() {
    wx.navigateBack()
  }
})
