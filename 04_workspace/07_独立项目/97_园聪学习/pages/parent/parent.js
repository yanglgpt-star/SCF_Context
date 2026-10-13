const store = require('../../services/progress-store')
const metrics = require('../../services/learning-metrics')
const device = require('../../services/device-profile')

Page({
  data: { settings: {}, progress: {}, summary: {}, showClear: false, dailyOptions: [1, 2, 3], deviceType: 'phone' },
  onShow() { this.setData({ deviceType: device.current().type }); this.refresh() },
  refresh() { this.setData({ settings: store.get('settings'), progress: store.get('progress'), summary: metrics.summarize(store.get('logs') || []) }) },
  toggleVoice(e) { const settings = this.data.settings; settings.voiceOn = e.detail.value; store.set('settings', settings); this.setData({ settings }) },
  toggleMusic(e) { const settings = this.data.settings; settings.musicOn = e.detail.value; store.set('settings', settings); this.setData({ settings }) },
  setDaily(e) { const settings = this.data.settings; settings.dailySessions = Number(e.currentTarget.dataset.value); store.set('settings', settings); this.setData({ settings }) },
  askClear() { this.setData({ showClear: true }) },
  cancelClear() { this.setData({ showClear: false }) },
  clearData() { store.clearLearning(); this.setData({ showClear: false }); this.refresh(); wx.showToast({ title: '学习记录已清除', icon: 'none' }) }
  ,back() { wx.navigateBack() }
})
