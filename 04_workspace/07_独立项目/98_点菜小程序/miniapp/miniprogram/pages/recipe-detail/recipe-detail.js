var foodsModel = require('../../models/foods');
var util = require('../../utils/util');
var localFoods = require('../../models/local_foods');

Page({
  data: {
    dish: null,
    loading: true,
    isIngredientsExpanded: false,
  },

  onLoad: function(options) {
    if (options.id) {
      this.loadDishById(options.id);
    } else if (options.name) {
      this.loadDishByName(decodeURIComponent(options.name));
    } else {
      wx.showToast({ title: '缺少参数', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  loadDishById: function(id) {
    var self = this;
    self.setData({ loading: true });
    foodsModel.getById(id).then(function(dish) {
      if (dish) {
        wx.setNavigationBarTitle({ title: dish.name });
        self.setData({ dish: dish, loading: false });
      } else {
        self.fallbackLocal(id);
      }
    }).catch(function() {
      self.fallbackLocal(id);
    });
  },

  loadDishByName: function(name) {
    var self = this;
    self.setData({ loading: true });
    var dish = null;
    for (var i = 0; i < localFoods.length; i++) {
      if (localFoods[i].name === name) { dish = localFoods[i]; break; }
    }
    if (dish) {
      wx.setNavigationBarTitle({ title: dish.name });
      self.setData({ dish: dish, loading: false });
    } else {
      wx.showToast({ title: '菜品不存在', icon: 'none' });
      self.setData({ loading: false });
    }
  },

  fallbackLocal: function(id) {
    var self = this;
    var dish = null;
    for (var i = 0; i < localFoods.length; i++) {
      if (localFoods[i]._id === id || localFoods[i].name === id) { dish = localFoods[i]; break; }
    }
    if (dish) {
      wx.setNavigationBarTitle({ title: dish.name });
      self.setData({ dish: dish, loading: false });
    } else {
      wx.showToast({ title: '菜品不存在', icon: 'none' });
      self.setData({ loading: false });
    }
  },

  toggleIngredients: function() {
    this.setData({ isIngredientsExpanded: !this.data.isIngredientsExpanded });
  },

  previewImage: function(e) {
    var url = e.currentTarget.dataset.url;
    var urls = this.data.dish.images || [];
    wx.previewImage({ current: url, urls: urls });
  },

  renderStars: function(difficulty) {
    return util.renderStars(difficulty || 0);
  },

  difficultyText: function(level) {
    return util.difficultyText(level);
  },

  copyIngredients: function() {
    var dish = this.data.dish;
    if (!dish || !dish.ingredients) return;
    var text = dish.ingredients.join('、');
    wx.setClipboardData({ data: text });
    wx.showToast({ title: '已复制食材清单', icon: 'success' });
  },

  onShareAppMessage: function() {
    var dish = this.data.dish;
    return {
      title: '来看看' + (dish ? dish.name : '这道菜') + '的做法吧！',
      path: '/pages/recipe-detail/recipe-detail?name=' + encodeURIComponent(dish ? dish.name : ''),
    };
  },
});
