const device = require('../../services/device-profile')
Page({
  data: { target: 7, round: 1, total: 5, source: [], left: [], right: [], draggingId: null, dragStyle: '', feedback: '把积木拖到两个篮子里', completed: false, deviceType: 'phone' },
  onLoad() { const info = wx.getWindowInfo(); this.windowWidth = info.windowWidth; this.windowHeight = info.windowHeight; this.setData({ deviceType: device.classifyDevice(info.windowWidth, info.windowHeight) }); this.newTarget(true) },
  onReady() { this.refreshZones() },
  onResize(size) {
    this.windowWidth = size.size.windowWidth
    this.windowHeight = size.size.windowHeight
    this.setData({ deviceType: device.classifyDevice(this.windowWidth, this.windowHeight) }, () => this.refreshZones())
  },
  refreshZones() {
    this.createSelectorQuery().select('.left-basket').boundingClientRect().select('.right-basket').boundingClientRect().exec((rects) => {
      this.leftRect = rects[0]
      this.rightRect = rects[1]
    })
  },
  newTarget(first) {
    if (!first && this.data.round >= this.data.total) { this.setData({ completed: true }); return }
    const round = first ? 1 : this.data.round + 1
    const target = Math.floor(Math.random() * 6) + 5
    this.setData({ round, target, source: Array.from({ length: target }, (_, id) => ({ id, color: id % 4 })), left: [], right: [], feedback: '把积木拖到两个篮子里', dragStyle: '', draggingId: null }, () => this.refreshZones())
  },
  dragStart(e) { const touch = e.touches[0]; this.dragOrigin = { x: touch.clientX, y: touch.clientY }; this.setData({ draggingId: Number(e.currentTarget.dataset.id) }) },
  dragMove(e) { if (this.data.draggingId === null) return; const touch = e.touches[0]; this.setData({ dragStyle: `transform:translate(${touch.clientX-this.dragOrigin.x}px,${touch.clientY-this.dragOrigin.y}px);z-index:20` }) },
  dragEnd(e) {
    const touch = e.changedTouches[0]; const id = this.data.draggingId
    let zone = 'source'
    const inside = (rect) => rect && touch.clientX >= rect.left && touch.clientX <= rect.right && touch.clientY >= rect.top && touch.clientY <= rect.bottom
    if (inside(this.leftRect)) zone = 'left'
    else if (inside(this.rightRect)) zone = 'right'
    const all = this.data.source.concat(this.data.left, this.data.right); const block = all.find((item) => item.id === id)
    const next = { source: all.filter((item) => item.id !== id && this.data.source.some((x) => x.id === item.id)), left: all.filter((item) => item.id !== id && this.data.left.some((x) => x.id === item.id)), right: all.filter((item) => item.id !== id && this.data.right.some((x) => x.id === item.id)) }
    next[zone].push(block)
    this.setData({ ...next, draggingId: null, dragStyle: '' })
    if (next.source.length === 0) { this.setData({ feedback: `${next.left.length} 和 ${next.right.length} 合起来是 ${this.data.target}` }); this.nextTimer = setTimeout(() => this.newTarget(false), 1500) }
  },
  blockStyle(e) { return e.currentTarget.dataset.id === this.data.draggingId ? this.data.dragStyle : '' },
  back() { wx.navigateBack() }, home() { wx.reLaunch({ url: '/pages/index/index' }) }, again() { this.setData({ completed: false }); this.newTarget(true) },
  onUnload() { clearTimeout(this.nextTimer) }
})
