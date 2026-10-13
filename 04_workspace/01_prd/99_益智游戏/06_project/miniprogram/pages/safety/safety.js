const { SAFETY_TEXT } = require('../../utils/constants')

Page({
  data: {
    safetyText: SAFETY_TEXT,
    agreed: false
  },

  onAgreeChange(e) {
    this.setData({ agreed: e.detail.value.length > 0 })
  },

  confirmSafety() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先勾选同意', icon: 'none' })
      return
    }
    // 安全确认有效期7天
    const expireTime = Date.now() + 7 * 24 * 60 * 60 * 1000
    wx.setStorageSync('safety_confirmed', true)
    wx.setStorageSync('safety_expire', expireTime)

    wx.redirectTo({ url: '/pages/index/index' })
  }
})
