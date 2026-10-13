const recommendModel = require('../../models/recommend');

Page({
  data: {
    step: 1,
    loading: false,
    showResult: false,
    dishes: [],
    reason: '',
    selected: {
      craving: '',
      weather: '',
      body: '',
    },
  },

  onLoad() {},

  /** 选择选项 */
  select(e) {
    const { key, value } = e.currentTarget.dataset;
    this.setData({ [`selected.${key}`]: value });
  },

  /** 下一步 */
  nextStep() {
    const next = this.data.step + 1;
    if (next <= 3) {
      this.setData({ step: next });
    }
  },

  /** 上一步 */
  prevStep() {
    const prev = this.data.step - 1;
    if (prev >= 1) {
      this.setData({ step: prev });
    }
  },

  /** 点击步骤标题跳转 */
  goStep(e) {
    const s = parseInt(e.currentTarget.dataset.step);
    // 只能跳到已到达的步骤
    if (s <= this.data.step) {
      this.setData({ step: s });
    }
  },

  /** 开始推荐 */
  doRecommend() {
    const { craving, weather, body } = this.data.selected;
    if (!craving || !weather || !body) return;

    this.setData({ loading: true, showResult: false });

    // 模拟异步避免阻塞 UI
    setTimeout(() => {
      const result = recommendModel.recommend({ craving, weather, body });
      this.setData({
        dishes: result.dishes,
        reason: result.reason,
        loading: false,
        showResult: true,
      });
    }, 300);
  },

  /** 重置 */
  reset() {
    this.setData({
      step: 1,
      showResult: false,
      dishes: [],
      reason: '',
      selected: { craving: '', weather: '', body: '' },
    });
  },

  /** 跳转详情 */
  goDetail(e) {
    // 本地数据没有 _id，用 name 传给详情页
    const name = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/recipe-detail/recipe-detail?name=${encodeURIComponent(name)}` });
  },

  onShareAppMessage() {
    return { title: '今天吃什么？帮我推荐！' };
  },
});
