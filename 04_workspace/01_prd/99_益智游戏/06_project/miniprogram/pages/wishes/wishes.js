const app = getApp()

Page({
  data: {
    wishes: [],
    myStars: 0
  },

  onShow() {
    this.loadWishes()
  },

  async loadWishes() {
    try {
      const callData = { type: 'wishes' }
      if (app.globalData.activeChild) {
        callData.asUser = app.globalData.activeChild
      }
      const res = await wx.cloud.callFunction({
        name: 'getStats',
        data: callData
      })
      this.setData({
        wishes: res.result.wishes || [],
        myStars: res.result.myStars || 0
      })
    } catch (err) {
      console.error('加载愿望清单失败', err)
    }
  },

  async redeemWish(e) {
    const { id, costStars, title } = e.currentTarget.dataset
    if (this.data.myStars < costStars) {
      wx.showToast({ title: '星星还不够哦', icon: 'none' })
      return
    }

    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '兑换愿望',
        content: `确定要用 ${costStars} 颗星星兑换"${title}"吗？`,
        success: (res) => resolve(res.confirm)
      })
    })

    if (confirmed) {
      wx.showLoading({ title: '兑换中...' })
      try {
        const redeemData = { type: 'redeem', wishId: id }
        if (app.globalData.activeChild) {
          redeemData.asUser = app.globalData.activeChild
        }
        await wx.cloud.callFunction({
          name: 'getStats',
          data: redeemData
        })
        wx.showToast({ title: '兑换成功！', icon: 'success' })
        this.loadWishes()
      } catch (err) {
        wx.showToast({ title: '兑换失败', icon: 'none' })
      }
      wx.hideLoading()
    }
  }
})
