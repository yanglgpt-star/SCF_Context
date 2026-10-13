const foodsModel = require('../../models/foods');
const util = require('../../utils/util');

Page({
  data: {
    categories: [
      { key: 'all', name: '全部', icon: '🍽️' },
      { key: 'meat_dish', name: '肉菜', icon: '🥩' },
      { key: 'vegetable_dish', name: '素菜', icon: '🥬' },
      { key: 'aquatic', name: '水产', icon: '🦐' },
      { key: 'staple', name: '主食', icon: '🍚' },
      { key: 'soup', name: '汤', icon: '🥣' },
      { key: 'breakfast', name: '早餐', icon: '🌅' },
      { key: 'dessert', name: '甜点', icon: '🍰' },
      { key: 'drink', name: '饮品', icon: '🥤' },
      { key: 'condiment', name: '调料', icon: '🧂' },
      { key: 'semi-finished', name: '半成品', icon: '📦' },
    ],
    activeCategory: 'all',
    dishes: [],
    page: 0,
    hasMore: true,
    loading: false,
    keyword: '',
    showFilter: false,
    filters: {
      mealType: '',
      target: '',
      taste: '',
    },
  },

  onLoad() {
    this.loadDishes();
  },

  onShow() {
    if (this.data.dishes.length === 0) this.loadDishes();
  },

  /** 切换分类 */
  onCategoryChange(e) {
    const category = e.currentTarget.dataset.category;
    this.setData({ activeCategory: category, dishes: [], page: 0, hasMore: true });
    this.loadDishes();
  },

  /** 加载菜品列表 */
  loadDishes() {
    if (this.data.loading || !this.data.hasMore) return;
    this.setData({ loading: true });

    const { activeCategory, page, keyword, filters } = this.data;
    const params = { page, pageSize: 20 };

    if (activeCategory !== 'all') params.category = activeCategory;
    if (keyword) params.keyword = keyword;
    if (filters.mealType) params.mealType = filters.mealType;

    foodsModel.getList(params).then(res => {
      this.setData({
        dishes: page === 0 ? res.list : [...this.data.dishes, ...res.list],
        hasMore: res.list.length === 20,
        loading: false,
        page: page + 1,
      });
    });
  },

  /** 下拉加载更多 */
  onReachBottom() {
    this.loadDishes();
  },

  /** 搜索输入 */
  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  /** 搜索确认 */
  onSearchConfirm() {
    this.setData({ dishes: [], page: 0, hasMore: true, activeCategory: 'all' });
    this.loadDishes();
  },

  /** 清除搜索 */
  onSearchClear() {
    this.setData({ keyword: '', dishes: [], page: 0, hasMore: true, activeCategory: 'all' });
    this.loadDishes();
  },

  /** 跳转详情 */
  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/recipe-detail/recipe-detail?id=${id}` });
  },

  /** 切换筛选面板 */
  toggleFilter() {
    this.setData({ showFilter: !this.data.showFilter });
  },

  /** 设置筛选条件 */
  setFilter(e) {
    const { type, value } = e.currentTarget.dataset;
    this.setData({
      [`filters.${type}`]: value === this.data.filters[type] ? '' : value,
    });
  },

  /** 应用筛选 */
  applyFilter() {
    this.setData({
      showFilter: false,
      dishes: [],
      page: 0,
      hasMore: true,
    });
    this.loadDishes();
  },

  /** 生成难度星星 */
  renderStars(difficulty) {
    return util.renderStars(difficulty || 0);
  },
});
