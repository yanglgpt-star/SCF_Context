/**
 * 菜品数据操作层
 * 支持云数据库 + 本地数据双模式（云超时时自动降级为本地数据）
 */
var db = wx.cloud.database();
var foodsCollection = db.collection('foods');
var cmd = db.command;
var localFoods = require('./local_foods');

var cloudTimeout = false;

/** 本地筛选 */
function localFilter(opts) {
  opts = opts || {};
  var list = [];
  for (var i = 0; i < localFoods.length; i++) list.push(localFoods[i]);

  if (opts.category && opts.category !== 'all') {
    list = list.filter(function(d) { return d.category === opts.category; });
  }
  if (opts.mealType) {
    list = list.filter(function(d) { return d.meal_type && d.meal_type.indexOf(opts.mealType) !== -1; });
  }
  if (opts.target) {
    list = list.filter(function(d) { return d.target && d.target.indexOf(opts.target) !== -1; });
  }
  if (opts.taste) {
    list = list.filter(function(d) { return d.taste && d.taste.indexOf(opts.taste) !== -1; });
  }
  if (opts.isMeat !== undefined) {
    list = list.filter(function(d) { return d.isMeat === opts.isMeat; });
  }
  if (opts.keyword) {
    var kw = opts.keyword;
    list = list.filter(function(d) {
      if (d.name.indexOf(kw) !== -1) return true;
      if (d.tags) {
        for (var j = 0; j < d.tags.length; j++) {
          if (d.tags[j].indexOf(kw) !== -1) return true;
        }
      }
      return false;
    });
  }
  return list;
}

/** 分页查询菜品列表 */
function getList(opts) {
  opts = opts || {};
  var page = opts.page || 0;
  var pageSize = opts.pageSize || 20;

  if (cloudTimeout) {
    var filtered = localFilter(opts);
    var start = page * pageSize;
    return Promise.resolve({ list: filtered.slice(start, start + pageSize), total: filtered.length });
  }

  return new Promise(function(resolve) {
    var conditions = [];
    if (opts.category && opts.category !== 'all') conditions.push({ category: opts.category });
    if (opts.mealType) conditions.push({ meal_type: cmd.all([opts.mealType]) });
    if (opts.target) conditions.push({ target: cmd.all([opts.target]) });
    if (opts.taste) conditions.push({ taste: cmd.all([opts.taste]) });
    if (opts.isMeat !== undefined) conditions.push({ isMeat: opts.isMeat });
    if (opts.keyword) {
      conditions.push(cmd.or([
        { name: db.RegExp({ regexp: opts.keyword, options: 'i' }) },
        { tags: cmd.all([opts.keyword]) }
      ]));
    }

    var query = {};
    if (conditions.length > 0) {
      query = conditions.length === 1 ? conditions[0] : cmd.and(conditions);
    }

    foodsCollection.where(query).orderBy('difficulty', 'asc').skip(page * pageSize).limit(pageSize).get()
      .then(function(res) {
        resolve({ list: res.data, total: res.total || res.data.length });
      })
      .catch(function(err) {
        if (err.errMsg && err.errMsg.indexOf('timeout') !== -1) {
          console.warn('云数据库超时，切换到本地数据');
          cloudTimeout = true;
          var filtered = localFilter(opts);
          resolve({ list: filtered.slice(start, start + pageSize), total: filtered.length });
        } else {
          console.error('获取菜品列表失败', err);
          resolve({ list: [], total: 0 });
        }
      });
  });
}

/** 根据 ID 获取菜品详情 */
function getById(id) {
  if (cloudTimeout) {
    for (var i = 0; i < localFoods.length; i++) {
      if (localFoods[i]._id === id) return Promise.resolve(localFoods[i]);
    }
    return Promise.resolve(null);
  }

  return new Promise(function(resolve) {
    foodsCollection.doc(id).get()
      .then(function(res) { resolve(res.data); })
      .catch(function(err) {
        if (err.errMsg && err.errMsg.indexOf('timeout') !== -1) {
          cloudTimeout = true;
          for (var i = 0; i < localFoods.length; i++) {
            if (localFoods[i]._id === id) { resolve(localFoods[i]); return; }
          }
          resolve(null);
        } else {
          console.error('获取菜品详情失败', err);
          resolve(null);
        }
      });
  });
}

/** 批量获取菜品 */
function getByIds(ids) {
  if (!ids || ids.length === 0) return Promise.resolve([]);

  if (cloudTimeout) {
    var result = [];
    for (var i = 0; i < localFoods.length; i++) {
      for (var j = 0; j < ids.length; j++) {
        if (localFoods[i]._id === ids[j]) { result.push(localFoods[i]); break; }
      }
    }
    return Promise.resolve(result);
  }

  return new Promise(function(resolve) {
    foodsCollection.where({ _id: cmd.in(ids) }).get()
      .then(function(res) { resolve(res.data); })
      .catch(function(err) {
        if (err.errMsg && err.errMsg.indexOf('timeout') !== -1) {
          cloudTimeout = true;
          var result = [];
          for (var i = 0; i < localFoods.length; i++) {
            for (var j = 0; j < ids.length; j++) {
              if (localFoods[i]._id === ids[j]) { result.push(localFoods[i]); break; }
            }
          }
          resolve(result);
        } else {
          console.error('批量获取菜品失败', err);
          resolve([]);
        }
      });
  });
}

/** 随机点菜 */
function getRandomDishes(mealType, count) {
  mealType = mealType || '晚餐';
  count = count || 3;

  if (cloudTimeout) {
    var all = [];
    for (var i = 0; i < localFoods.length; i++) {
      if (localFoods[i].meal_type && localFoods[i].meal_type.indexOf(mealType) !== -1) {
        all.push(localFoods[i]);
      }
    }
    var meatPool = all.filter(function(d) { return d.isMeat; });
    var vegPool = all.filter(function(d) { return !d.isMeat && (d.category === 'vegetable_dish' || d.category === 'staple'); });
    var soupPool = all.filter(function(d) { return d.category === 'soup'; });
    function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    var result = [];
    if (meatPool.length > 0) result.push(pickRandom(meatPool));
    if (vegPool.length > 0) result.push(pickRandom(vegPool));
    if (soupPool.length > 0) result.push(pickRandom(soupPool));
    return Promise.resolve(result);
  }

  return new Promise(function(resolve) {
    var meatQuery = { isMeat: true };
    if (mealType) meatQuery.meal_type = cmd.all([mealType]);

    var vegQuery = { isMeat: false, category: cmd.in(['vegetable_dish', 'staple']) };
    if (mealType) vegQuery.meal_type = cmd.all([mealType]);

    var soupQuery = { category: 'soup' };
    if (mealType) soupQuery.meal_type = cmd.all([mealType]);

    Promise.all([
      foodsCollection.where(meatQuery).get(),
      foodsCollection.where(vegQuery).get(),
      foodsCollection.where(soupQuery).get(),
    ]).then(function(results) {
      function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
      var result = [];
      if (results[0].data.length > 0) result.push(pickRandom(results[0].data));
      if (results[1].data.length > 0) result.push(pickRandom(results[1].data));
      if (results[2].data.length > 0) result.push(pickRandom(results[2].data));
      resolve(result);
    }).catch(function(err) {
      if (err.errMsg && err.errMsg.indexOf('timeout') !== -1) {
        cloudTimeout = true;
        getRandomDishes(mealType, count).then(resolve);
      } else {
        console.error('随机推荐失败', err);
        resolve([]);
      }
    });
  });
}

/** 搜索菜品 */
function search(keyword, page, pageSize) {
  if (!keyword || !keyword.trim()) return getList({ page: page || 0, pageSize: pageSize || 20 });
  return getList({ keyword: keyword.trim(), page: page || 0, pageSize: pageSize || 20 });
}

/** 获取按类别分组的菜品数量 */
function getCategoryStats() {
  if (cloudTimeout) {
    var stats = {};
    for (var i = 0; i < localFoods.length; i++) {
      var cat = localFoods[i].categoryName || localFoods[i].category;
      stats[cat] = (stats[cat] || 0) + 1;
    }
    return Promise.resolve(stats);
  }

  return new Promise(function(resolve) {
    foodsCollection.get()
      .then(function(res) {
        var stats = {};
        for (var i = 0; i < res.data.length; i++) {
          var cat = res.data[i].categoryName || res.data[i].category;
          stats[cat] = (stats[cat] || 0) + 1;
        }
        resolve(stats);
      })
      .catch(function(err) {
        if (err.errMsg && err.errMsg.indexOf('timeout') !== -1) {
          cloudTimeout = true;
          getCategoryStats().then(resolve);
        } else {
          console.error('获取分类统计失败', err);
          resolve({});
        }
      });
  });
}

module.exports = {
  getList: getList,
  getById: getById,
  getByIds: getByIds,
  getRandomDishes: getRandomDishes,
  search: search,
  getCategoryStats: getCategoryStats,
};
