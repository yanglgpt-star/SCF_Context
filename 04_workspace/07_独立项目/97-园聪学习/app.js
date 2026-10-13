const store = require('./services/progress-store')
const session = require('./services/session-manager')
const device = require('./services/device-profile')

App({
  onLaunch() {
    store.ensureDefaults()
    session.start()
    this.globalData.device = device.current()
    wx.onWindowResize(() => { this.globalData.device = device.current() })
  },
  onShow() { session.start() },
  onHide() { session.pause() },
  globalData: {
    appName: '园聪学习',
    version: '0.1.0',
    device: { type: 'phone', width: 0, height: 0 }
  }
})
