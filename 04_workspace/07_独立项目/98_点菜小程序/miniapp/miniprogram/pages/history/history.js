const foodsModel = require('../../models/foods');
const util = require('../../utils/util');

Page({
  data: {
    year: 0,
    month: 0,
    calendarDays: [],
    selectedDate: '',
    selectedLogs: [],
    loading: false,
    weekDays: ['日', '一', '二', '三', '四', '五', '六'],
    // 当月有记录的日期
    markedDates: [],
    // 本月所有记录
    monthLogs: [],
    // 本周记录
    weekLogs: [],
  },

  onLoad() {
    const now = new Date();
    this.setData({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      selectedDate: util.formatDate(now),
    });
    this.renderCalendar(now.getFullYear(), now.getMonth() + 1);
    this.loadMonthLogs(now.getFullYear(), now.getMonth() + 1);
    this.loadWeekLogs();
  },

  onShow() {
    this.loadMonthLogs(this.data.year, this.data.month);
    this.loadWeekLogs();
  },

  /** 渲染日历 */
  renderCalendar(year, month) {
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const days = [];

    // 上月补齐空白
    for (let i = 0; i < firstDay; i++) {
      days.push({ day: 0, empty: true });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = dateStr === util.formatDate();
      days.push({
        day: d,
        date: dateStr,
        empty: false,
        isToday,
        isMarked: false,
        isSelected: dateStr === this.data.selectedDate,
      });
    }

    this.setData({ calendarDays: days });
    this.updateMarks();
  },

  /** 标记有记录的日期 */
  updateMarks() {
    const marked = new Set(this.data.monthLogs.map(l => l.date));
    const days = this.data.calendarDays.map(d => {
      if (!d.empty) d.isMarked = marked.has(d.date);
      return d;
    });
    this.setData({ calendarDays: days });
  },

  /** 上个月 */
  prevMonth() {
    let { year, month } = this.data;
    if (month === 1) { year--; month = 12; } else { month--; }
    this.setData({ year, month });
    this.renderCalendar(year, month);
    this.loadMonthLogs(year, month);
  },

  /** 下个月 */
  nextMonth() {
    let { year, month } = this.data;
    if (month === 12) { year++; month = 1; } else { month++; }
    this.setData({ year, month });
    this.renderCalendar(year, month);
    this.loadMonthLogs(year, month);
  },

  /** 选中日期 */
  selectDate(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;

    // 更新日历选中状态
    const days = this.data.calendarDays.map(d => {
      if (!d.empty) d.isSelected = d.date === date;
      return d;
    });
    this.setData({ calendarDays: days, selectedDate: date });
    this.loadLogsForDate(date);
  },

  /** 加载当月所有记录（用于标记日历） */
  loadMonthLogs(year, month) {
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const db = wx.cloud.database();
    db.collection('meal_logs')
      .where({ date: db.RegExp({ regexp: `^${monthStr}`, options: 'i' }) })
      .get()
      .then(res => {
        this.setData({ monthLogs: res.data || [] });
        this.updateMarks();
        // 同时加载选中日期的记录
        this.loadLogsForDate(this.data.selectedDate);
      })
      .catch(() => {});
  },

  /** 加载某天的记录 */
  loadLogsForDate(date) {
    if (!date) return;
    this.setData({ loading: true });
    const db = wx.cloud.database();

    db.collection('meal_logs')
      .where({ date })
      .get()
      .then(async res => {
        const logs = res.data || [];
        // 加载每餐的菜品详情
        for (const log of logs) {
          if (log.food_ids && log.food_ids.length > 0) {
            log.dishes = await foodsModel.getByIds(log.food_ids);
          } else {
            log.dishes = [];
          }
        }
        this.setData({ selectedLogs: logs, loading: false });
      })
      .catch(() => this.setData({ loading: false }));
  },

  /** 加载本周记录 */
  loadWeekLogs() {
    const range = util.getWeekRange();
    const db = wx.cloud.database();
    db.collection('meal_logs')
      .where({
        date: db.command.gte(range.monday).and(db.command.lte(range.sunday))
      })
      .orderBy('date', 'desc')
      .get()
      .then(res => {
        this.setData({ weekLogs: res.data || [] });
      })
      .catch(() => {});
  },

  /** 生成星星 */
  renderStars(difficulty) {
    return util.renderStars(difficulty || 0);
  },

  /** 跳转详情 */
  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/recipe-detail/recipe-detail?id=${id}` });
  },
});
