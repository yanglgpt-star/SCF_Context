const device = require('../../services/device-profile')
Component({
  data: { portrait: false, deviceType: 'phone' },
  lifetimes: {
    attached() {
      this.check()
      this.resizeHandler = () => this.check()
      wx.onWindowResize(this.resizeHandler)
    },
    detached() { if (this.resizeHandler) wx.offWindowResize(this.resizeHandler) }
  },
  methods: {
    check() {
      try { const info = wx.getWindowInfo(); this.setData({ portrait: info.windowHeight > info.windowWidth, deviceType: device.classifyDevice(info.windowWidth, info.windowHeight) }) }
      catch (e) { this.setData({ portrait: false }) }
    }
  }
})
