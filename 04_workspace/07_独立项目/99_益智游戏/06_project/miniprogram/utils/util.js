// 显示Toast提示
function showToast(title, icon = 'none') {
  wx.showToast({
    title,
    icon,
    duration: 2000
  })
}

// 显示加载中
function showLoading(title = '加载中...') {
  wx.showLoading({ title })
}

// 隐藏加载
function hideLoading() {
  wx.hideLoading()
}

// 显示模态弹窗
function showModal(title, content) {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      success(res) {
        resolve(res.confirm)
      }
    })
  })
}

// 播放语音
function playVoice(fileId) {
  const innerAudioContext = wx.createInnerAudioContext()
  innerAudioContext.src = fileId
  innerAudioContext.play()
  return innerAudioContext
}

// 判断是否为家长模式（简易密码验证）
const PARENT_PASSWORD = '1234'

function verifyParentPassword(input) {
  return input === PARENT_PASSWORD
}

// 随机取数组元素
function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

// 防抖
function debounce(fn, delay = 500) {
  let timer = null
  return function (...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn.apply(this, args)
      timer = null
    }, delay)
  }
}

module.exports = {
  showToast,
  showLoading,
  hideLoading,
  showModal,
  playVoice,
  verifyParentPassword,
  randomPick,
  debounce
}
