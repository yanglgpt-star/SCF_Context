var localFoods = require('../../models/local_foods');
var util = require('../../utils/util');
var imgPathMap = require('../../images/food/imgpath_lookup');

Page({
  data: {
    keyword: '',
    activeCategory: 'all',
    allDishes: [],
    displayList: [],
    cart: [],
    loading: false,
    page: 0,
    pageSize: 30,
    showCartPanel: false,
    showSaveDialog: false,
    comboName: '',
    categoryList: [],
    categories: {},
  },

  onLoad: function() {
    this.loadDishes();
  },

  /** 获取图片文件名（通过查找映射表） */
  getImageFileName: function(dish) {
    if (!dish.images || !dish.images[0]) return '';
    var imgPath = dish.images[0];
    // 从 ../../菜谱/images/xxx.png → 映射表中查找
    // 从 dishes/xxx/yyy.jpg → 映射表中查找
    return imgPathMap[imgPath] || '';
  },

  loadDishes: function() {
    var all = [];
    for (var i = 0; i < localFoods.length; i++) {
      if (localFoods[i].isHomeStyle !== false) all.push(localFoods[i]);
    }
    // 预处理每道菜的图片文件名
    for (var i = 0; i < all.length; i++) {
      all[i]._imgFile = this.getImageFileName(all[i]);
    }
    var catCount = {};
    for (var i = 0; i < all.length; i++) {
      var cn = all[i].categoryName || all[i].category || '其他';
      catCount[cn] = (catCount[cn] || 0) + 1;
    }

    var categoryList = [];
    var catKeys = Object.keys(catCount);
    for (var ci = 0; ci < catKeys.length; ci++) {
      var name = catKeys[ci];
      var count = catCount[name];
      var first = null;
      for (var fi = 0; fi < all.length; fi++) {
        if ((all[fi].categoryName || all[fi].category) === name) { first = all[fi]; break; }
      }
      var key = (first && first.category) || name;
      categoryList.push({ key: key, name: name, count: count });
    }
    categoryList.sort(function(a, b) { return b.count - a.count; });

    var cats = { all: all.length };
    for (var ck in catCount) cats[ck] = catCount[ck];

    this.setData({
      allDishes: all,
      displayList: all.slice(0, this.data.pageSize),
      categoryList: categoryList,
      categories: cats,
      page: 0,
    });
  },

  switchCategory: function(e) {
    var catKey = e.currentTarget.dataset.cat;
    var catKeys = Object.keys(this.data.categories);
    this.setData({ activeCategory: catKey, keyword: '', page: 0 });

    var all = this.data.allDishes;
    var filtered = [];
    if (catKey !== 'all') {
      for (var i = 0; i < all.length; i++) {
        var d = all[i];
        if (d.category === catKey || d.categoryName === catKey) filtered.push(d);
      }
    } else {
      filtered = all.slice(0);
    }
    this.setData({
      displayList: filtered.slice(0, this.data.pageSize),
      page: 0,
    });
  },

  onSearchInput: function(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch: function() {
    var kw = this.data.keyword.trim().toLowerCase();
    if (!kw) {
      this.setData({ displayList: this.data.allDishes.slice(0, this.data.pageSize) });
      return;
    }
    var all = this.data.allDishes;
    var filtered = [];
    for (var i = 0; i < all.length; i++) {
      var d = all[i];
      if (d.name.indexOf(kw) !== -1) filtered.push(d);
      else if (d.tags) {
        for (var j = 0; j < d.tags.length; j++) {
          if (d.tags[j].indexOf(kw) !== -1) { filtered.push(d); break; }
        }
      }
    }
    this.setData({ displayList: filtered, page: 0 });
  },

  onSearchClear: function() {
    this.setData({
      keyword: '',
      displayList: this.data.allDishes.slice(0, this.data.pageSize),
      page: 0,
    });
  },

  loadMore: function() {
    if (this.data.loading) return;
    var page = this.data.page;
    var pageSize = this.data.pageSize;
    var displayList = this.data.displayList;
    var all = this.data.allDishes;
    var activeCategory = this.data.activeCategory;
    var keyword = this.data.keyword;

    var source = [];
    if (activeCategory !== 'all') {
      for (var i = 0; i < all.length; i++) {
        if (all[i].category === activeCategory || all[i].categoryName === activeCategory) source.push(all[i]);
      }
    } else {
      source = all.slice(0);
    }
    if (keyword) {
      var kw = keyword.toLowerCase();
      var temp = [];
      for (var i = 0; i < source.length; i++) {
        if (source[i].name.indexOf(kw) !== -1) temp.push(source[i]);
      }
      source = temp;
    }

    var nextPage = page + 1;
    var start = nextPage * pageSize;
    var more = source.slice(start, start + pageSize);
    if (more.length === 0) return;

    this.setData({
      displayList: displayList.concat(more),
      page: nextPage,
    });
  },

  addToCart: function(e) {
    var name = e.currentTarget.dataset.dish;
    var all = this.data.allDishes;
    var dish = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].name === name) { dish = all[i]; break; }
    }
    if (!dish) return;

    var cart = this.data.cart.slice(0);
    for (var i = 0; i < cart.length; i++) {
      if (cart[i].name === name) {
        wx.showToast({ title: '已在已选列表中', icon: 'none' });
        return;
      }
    }
    cart.push(dish);
    this.setData({ cart: cart });
    wx.showToast({ title: '已选「' + name + '」', icon: 'success', duration: 800 });
  },

  removeFromCart: function(e) {
    var name = e.currentTarget.dataset.name;
    var cart = [];
    for (var i = 0; i < this.data.cart.length; i++) {
      if (this.data.cart[i].name !== name) cart.push(this.data.cart[i]);
    }
    this.setData({ cart: cart });
  },

  clearCart: function() {
    var self = this;
    wx.showModal({
      title: '清空已选',
      content: '确定清空所有已选菜品？',
      success: function(res) {
        if (res.confirm) self.setData({ cart: [], showCartPanel: false });
      }
    });
  },

  /** 图片加载失败时清除 _imgFile 以显示 fallback */
  onImgError: function(e) {
    var name = e.currentTarget.dataset.name;
    var all = this.data.allDishes;
    for (var i = 0; i < all.length; i++) {
      if (all[i].name === name && all[i]._imgFile) {
        all[i]._imgFile = '';
        break;
      }
    }
    // 重新设置 displayList 触发更新
    var display = this.data.displayList.slice(0);
    this.setData({ displayList: display });
  },

  isInCart: function(name) {
    for (var i = 0; i < this.data.cart.length; i++) {
      if (this.data.cart[i].name === name) return true;
    }
    return false;
  },

  showCart: function() { this.setData({ showCartPanel: true }); },

  closeCart: function() { this.setData({ showCartPanel: false }); },

  goDetail: function(e) {
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/recipe-detail/recipe-detail?name=' + encodeURIComponent(id) });
  },

  randomPick: function() {
    var all = this.data.allDishes;
    if (all.length === 0) return;
    var meat = [], veg = [], soup = [];
    for (var i = 0; i < all.length; i++) {
      var d = all[i];
      if (d.isMeat) meat.push(d);
      else if (!d.isMeat && (d.category === 'vegetable_dish' || d.category === 'staple')) veg.push(d);
      if (d.category === 'soup') soup.push(d);
    }

    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    var result = [];
    if (meat.length > 0) result.push(pick(meat));
    if (veg.length > 0) result.push(pick(veg));
    if (soup.length > 0) result.push(pick(soup));

    var cart = this.data.cart.slice(0);
    for (var i = 0; i < result.length; i++) {
      var found = false;
      for (var j = 0; j < cart.length; j++) {
        if (cart[j].name === result[i].name) { found = true; break; }
      }
      if (!found) cart.push(result[i]);
    }
    this.setData({ cart: cart });
    wx.showToast({ title: '随机推荐了 ' + result.length + ' 道菜', icon: 'none' });
  },

  goRecommend: function() {
    wx.navigateTo({ url: '/pages/recommend/recommend' });
  },

  openSaveDialog: function() { this.setData({ showSaveDialog: true, comboName: '' }); },
  closeSaveDialog: function() { this.setData({ showSaveDialog: false }); },
  onComboNameInput: function(e) { this.setData({ comboName: e.detail.value }); },

  saveCombo: function() {
    var name = this.data.comboName.trim();
    if (!name) { wx.showToast({ title: '请输入套餐名称', icon: 'none' }); return; }
    var cart = this.data.cart;
    var dishNames = [];
    for (var i = 0; i < cart.length; i++) dishNames.push(cart[i].name);
    try {
      var saved = wx.getStorageSync('combos') || [];
      saved.push({ name: name, dishes: dishNames, time: Date.now() });
      wx.setStorageSync('combos', saved);
      wx.showToast({ title: '已保存套餐', icon: 'success' });
      this.setData({ showSaveDialog: false });
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  renderStars: function(difficulty) {
    return util.renderStars(difficulty || 0);
  },

  onShareAppMessage: function() {
    return { title: '今天吃什么？' };
  },
});
