function shuffle(list) { const copy = list.slice(); for (let i = copy.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]] } return copy }
const device = require('../../services/device-profile')
function makeOptions(answer) { return shuffle([answer, answer === 1 ? 2 : answer - 1, answer === 10 ? 9 : answer + 1]) }
Page({
  data: { round: 1, total: 5, objects: [], options: [], showOptions: false, feedback: '用手指一个一个点', completed: false, objectEmoji: '🍬', objectSizeClass: 'few', deviceType: 'phone' },
  onLoad() { this.setData({ deviceType: device.current().type }); this.nextRound(true) },
  nextRound(first) {
    if (!first && this.data.round >= this.data.total) { this.setData({ completed: true }); return }
    const round = first ? 1 : this.data.round + 1
    const answer = Math.floor(Math.random() * 10) + 1
    const emojis = ['🍬', '🍎', '🐟', '🌼']
    this.answer = answer
    const objectSizeClass = answer <= 4 ? 'few' : answer <= 7 ? 'medium' : 'dense'
    this.setData({ round, objectEmoji: emojis[Math.floor(Math.random() * emojis.length)], objectSizeClass, objects: Array.from({ length: answer }, (_, id) => ({ id, tapped: false })), options: makeOptions(answer), showOptions: false, feedback: '用手指一个一个点' })
  },
  tapObject(e) {
    const id = Number(e.currentTarget.dataset.id)
    const objects = this.data.objects.map((item) => item.id === id ? { ...item, tapped: true } : item)
    const count = objects.filter((item) => item.tapped).length
    this.setData({ objects, feedback: `已经数到 ${count}` })
    this.playNumber(count)
    if (count === this.answer) this.setData({ showOptions: true, feedback: '一共有几个呢？' })
  },
  playNumber(number) {
    if (!this.audio) this.audio = wx.createInnerAudioContext()
    this.audio.stop(); this.audio.src = `/assets/audio/count/num_${number}.wav`; this.audio.play()
  },
  choose(e) {
    const value = Number(e.currentTarget.dataset.value)
    if (value === this.answer) { this.setData({ feedback: '太棒啦，你认真数完了！' }); this.nextTimer = setTimeout(() => this.nextRound(false), 1100) }
    else { this.setData({ feedback: '再数数看，可以重新点一遍' }); this.resetTimer = setTimeout(() => this.setData({ objects: this.data.objects.map((item) => ({ ...item, tapped: false })), showOptions: false }), 900) }
  },
  home() { wx.reLaunch({ url: '/pages/index/index' }) },
  again() { this.setData({ round: 1, completed: false }); this.nextRound(true) },
  back() { wx.navigateBack() },
  onUnload() { clearTimeout(this.nextTimer); clearTimeout(this.resetTimer); if (this.audio) this.audio.destroy() }
})
