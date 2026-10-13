/**
 * 工具函数
 */

/** 格式化日期为 YYYY-MM-DD */
function formatDate(date) {
  const d = date || new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 获取本周日期范围 [周一, 周日] */
function getWeekRange() {
  const now = new Date();
  const dayOfWeek = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday: formatDate(monday), sunday: formatDate(sunday) };
}

/** 获取过去N天的日期列表 */
function getPastDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(formatDate(d));
  }
  return days;
}

/** 生成星星字符串 */
function renderStars(count) {
  return '★'.repeat(count) + '☆'.repeat(5 - count);
}

/** 难度星级转为文字 */
function difficultyText(level) {
  const map = { 1: '简单', 2: '较易', 3: '中等', 4: '较难', 5: '困难' };
  return map[level] || '未知';
}

/** 防抖 */
function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

module.exports = {
  formatDate,
  getWeekRange,
  getPastDays,
  renderStars,
  difficultyText,
  debounce,
};
