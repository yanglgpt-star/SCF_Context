const session = require('../../services/session-manager')
const device = require('../../services/device-profile')
Component({
  data: { show: false, pressing: false, ended: false, deviceType: 'phone' },
  lifetimes: {
    attached() {
      session.start()
      this.setData({ deviceType: device.current().type })
      this.check()
      this.resizeHandler = () => this.setData({ deviceType: device.current().type })
      wx.onWindowResize(this.resizeHandler)
      this.timer = setInterval(() => this.check(), 5000)
    },
    detached() {
      clearInterval(this.timer)
      clearTimeout(this.pressTimer)
      if (this.resizeHandler) wx.offWindowResize(this.resizeHandler)
    }
  },
  methods: {
    check() { if (session.shouldRest()) this.setData({ show: true, ended: session.isLocked() }) },
    pressStart() { this.setData({ pressing: true }); this.pressTimer = setTimeout(() => { session.reset(); this.setData({ show: false, pressing: false }); wx.showToast({ title: '可以再玩一会儿', icon: 'none' }) }, 1500) },
    pressEnd() { clearTimeout(this.pressTimer); this.setData({ pressing: false }) },
    finish() { session.lock(); this.setData({ show: true, ended: true }); wx.reLaunch({ url: '/pages/index/index' }) }
  }
})
