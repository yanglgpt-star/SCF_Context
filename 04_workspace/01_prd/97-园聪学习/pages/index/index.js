const store = require('../../services/progress-store')
const device = require('../../services/device-profile')

Page({
  data: {
    profile: store.defaults.profile,
    progress: store.defaults.progress,
    showSetup: false,
    avatars: ['🐻', '🐰', '🐱', '🦌'],
    selectedAvatar: '🐻',
    nickname: '小聪',
    parentPressing: false,
    progressPoints: [0, 1, 2, 3, 4],
    deviceType: 'phone',
    modules: [
      { id: 'math', name: '数字乐园', icon: '🥕', theme: 'purple', route: '/pages/game/game', status: 'active', stateText: '10以内加减法', badge: '', progress: 2, total: 5 },
      { id: 'count', name: '点数练习', icon: '🍬', theme: 'green', route: '/pages/count/count', status: 'active', stateText: '一个一个数', badge: '', progress: 0, total: 5 },
      { id: 'split', name: '积木分一分', icon: '🧱', theme: 'blue', route: '/pages/split/split', status: 'active', stateText: '数的分解', badge: '重点', progress: 0, total: 5 },
      { id: 'dice', name: '骰子游戏', icon: '🎲', theme: 'orange', route: '/pages/dice/dice', status: 'active', stateText: '点数做加法', badge: '', progress: 0, total: 5 }
    ]
  },
  onShow() {
    this.navigating = false
    const profile = store.get('profile')
    this.setData({ profile, progress: store.get('progress'), showSetup: !profile.ready, deviceType: device.current().type })
    if (profile.ready) this.playDailyGreeting()
  },
  chooseAvatar(e) { this.setData({ selectedAvatar: e.currentTarget.dataset.avatar }) },
  inputNickname(e) { this.setData({ nickname: e.detail.value.slice(0, 6) }) },
  finishSetup() {
    const profile = { nickname: this.data.nickname.trim() || '小朋友', avatar: this.data.selectedAvatar, ready: true }
    store.set('profile', profile)
    this.setData({ profile, showSetup: false })
  },
  startGame() { this.openModuleById('count') },
  openModule(e) { this.openModuleById(e.currentTarget.dataset.id) },
  openModuleById(id) {
    const module = this.data.modules.find((item) => item.id === id)
    if (!module) return
    if (module.status !== 'active' || !module.route) {
      this.playHomeAudio('coming')
      wx.showToast({ title: `${module.name}还在准备，很快就能玩啦`, icon: 'none' })
      return
    }
    if (this.navigating) return
    this.navigating = true
    wx.navigateTo({ url: module.route, fail: () => { this.navigating = false } })
  },
  replayHomeGuide() { this.playHomeAudio('home_guide') },
  playDailyGreeting() {
    const today = new Date().toDateString()
    if (wx.getStorageSync('yc_home_greeting_date_v1') === today) return
    wx.setStorageSync('yc_home_greeting_date_v1', today)
    this.greetingTimer = setTimeout(() => this.playHomeAudio('home_welcome'), 500)
  },
  playHomeAudio(name) {
    if (!store.get('settings').voiceOn) return
    if (!this.homeAudio) {
      this.homeAudio = wx.createInnerAudioContext()
      this.homeAudio.onError(() => wx.showToast({ title: '可以点大图标选择学习', icon: 'none' }))
    }
    this.homeAudio.stop(); this.homeAudio.src = `/assets/audio/home/${name}.wav`; this.homeAudio.play()
  },
  openRewards() { wx.showToast({ title: `已经收集${this.data.progress.stars}颗星星`, icon: 'none' }) },
  parentStart() {
    this.setData({ parentPressing: true })
    this.parentTimer = setTimeout(() => {
      this.setData({ parentPressing: false })
      wx.navigateTo({ url: '/pages/parent/parent' })
    }, 1500)
  },
  parentEnd() { clearTimeout(this.parentTimer); this.setData({ parentPressing: false }) },
  onHide() { if (this.homeAudio) this.homeAudio.stop() },
  onUnload() { clearTimeout(this.parentTimer); clearTimeout(this.greetingTimer); if (this.homeAudio) this.homeAudio.destroy() }
})
