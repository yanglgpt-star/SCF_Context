// 格式化日期
function formatDate(date) {
  const d = date ? new Date(date) : new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 格式化显示日期（例如：5月26日 周三）
function formatDateDisplay(date) {
  const d = new Date(date)
  const month = d.getMonth() + 1
  const day = d.getDate()
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const weekday = weekdays[d.getDay()]
  return `${month}月${day}日 ${weekday}`
}

// 格式化时间（例如：08:30）
function formatTime(date) {
  const d = new Date(date)
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

// 星星数转为等级
function starsToLevel(stars) {
  return Math.floor(stars / 10) + 1
}

// 虚拟树成长百分比
function treeGrowthPercent(completedCount) {
  const growth = Math.min(completedCount * 3, 100)
  return growth
}

module.exports = {
  formatDate,
  formatDateDisplay,
  formatTime,
  starsToLevel,
  treeGrowthPercent
}
