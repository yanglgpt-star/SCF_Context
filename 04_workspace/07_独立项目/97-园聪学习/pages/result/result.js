const store = require('../../services/progress-store')
const metrics = require('../../services/learning-metrics')
const device = require('../../services/device-profile')

Page({
  data: { firstCorrect: 0, counted: 0, reward: 1, stars: 0, deviceType: 'phone' },
  onLoad(options) {
    this.setData({ deviceType: device.current().type })
    const session = store.get('active')
    if (!session || session.id !== options.sessionId || session.status !== 'completed') { wx.reLaunch({ url: '/pages/index/index' }); return }
    const firstCorrect = session.logs.filter((item) => item.firstCorrect).length
    const counted = session.logs.filter((item) => item.hintLevel > 0).length
    const reward = metrics.rewardFor(firstCorrect)
    const progress = store.get('progress')
    if (!progress.rewardedSessions.includes(session.id)) {
      progress.stars += reward; progress.sessionsCompleted += 1; progress.rewardedSessions.push(session.id)
      store.set('progress', progress); store.appendLogs(session.logs)
    }
    this.setData({ firstCorrect, counted, reward, stars: progress.stars })
  },
  home() { store.set('active', null); wx.reLaunch({ url: '/pages/index/index' }) },
  again() { store.set('active', null); wx.redirectTo({ url: '/pages/game/game' }) }
})
