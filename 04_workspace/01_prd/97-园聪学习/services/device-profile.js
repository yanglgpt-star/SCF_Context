function classifyDevice(width, height) {
  const shortSide = Math.min(Number(width) || 0, Number(height) || 0)
  return shortSide >= 600 ? 'tablet' : 'phone'
}
function current() {
  try { const info = wx.getWindowInfo(); return { type: classifyDevice(info.windowWidth, info.windowHeight), width: info.windowWidth, height: info.windowHeight } }
  catch (e) { return { type: 'phone', width: 0, height: 0 } }
}
module.exports = { classifyDevice, current }
