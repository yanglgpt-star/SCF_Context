/**
 * 为菜品补全条件推荐标签（天气、身体、口味需求）
 * 输入: data/merged_dishes.json
 * 输出: data/merged_dishes.json（原地更新）
 */
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'merged_dishes.json');
const LOCAL_FILE = path.join(__dirname, '..', 'miniapp', 'miniprogram', 'models', 'local_foods.json');

const dishes = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));

// ============ 天气标签规则 ============
function assignWeather(d) {
  const tags = new Set();
  const cat = d.category || '';
  const taste = d.taste || [];
  const tagsList = d.tags || [];
  const name = d.name || '';
  const ingredients = (d.ingredients || []).join(' ');

  // 热天适合：凉菜、饮品、清淡、凉拌
  if (['drink', 'condiment'].includes(cat) ||
      taste.includes('清淡') ||
      ['凉拌', '凉菜', '冰', '冷'].some(k => name.includes(k) || ingredients.includes(k))) {
    tags.add('hot');
  }

  // 冷天适合：炖菜、汤、砂锅、煮锅、炸品、肉菜
  if (['soup', 'meat_dish'].includes(cat) ||
      taste.includes('香辣') ||
      ['炖', '砂锅', '煮', '炸', '烤', '煲', '焖', '煨'].some(k => name.includes(k) || ingredients.includes(k))) {
    tags.add('cold');
  }

  // 雨天适合：汤、热乎的、煮锅
  if (['soup'].includes(cat) ||
      ['汤', '煮', '面', '粉', '馄饨', '饺子'].some(k => name.includes(k))) {
    tags.add('rainy');
  }

  // 干燥适合：清淡带汤
  if (taste.includes('清淡') || cat === 'soup' || name.includes('汤')) {
    tags.add('dry');
  }

  // 默认所有天气都适合
  tags.add('all');

  return [...tags];
}

// ============ 身体条件标签规则 ============
function assignBody(d) {
  const tags = new Set();
  const taste = d.taste || [];
  const tagsList = d.tags || [];
  const cat = d.category || '';
  const name = d.name || '';
  const ingredients = (d.ingredients || []).join(' ');

  // 上火/口腔溃疡：清淡口味，排除辣
  if (taste.includes('清淡') || cat === 'drink') {
    tags.add('上火');
  }

  // 感冒：汤、易消化
  if (cat === 'soup' || ['粥', '汤', '面', '粉'].some(k => name.includes(k))) {
    tags.add('cold');
  }

  // 没胃口：酸甜开胃或香辣开胃
  if (taste.includes('酸甜') || taste.includes('香辣') || taste.includes('酸') || taste.includes('辣') ||
      ['酸辣', '凉拌'].some(k => name.includes(k))) {
    tags.add('no_appetite');
  }

  // 减肥/减脂
  if (tagsList.includes('减脂') || d.isMeat === false ||
      taste.includes('清淡') ||
      (d.calories && d.calories < 200)) {
    tags.add('diet');
  }

  // 运动后：高蛋白、荤菜
  if (d.isMeat === true || ['aquatic', 'meat_dish'].includes(cat)) {
    tags.add('post_sport');
  }

  // 小孩吃
  if ((d.target || []).includes('小孩') || tagsList.includes('家常') ||
      ['蒸蛋', '豆腐', '鸡蛋', '肉末'].some(k => name.includes(k))) {
    tags.add('child');
  }

  // 默认
  tags.add('all');

  return [...tags];
}

// ============ 口味需求标签规则 ============
function assignCraving(d) {
  const tags = new Set();
  const taste = d.taste || [];
  const tagsList = d.tags || [];

  if (d.isMeat) tags.add('肉');
  else tags.add('素');

  if (taste.includes('香辣') || taste.includes('微辣') || taste.includes('重辣')) tags.add('辣');
  if (taste.includes('清淡')) tags.add('清淡');
  if (taste.includes('酸甜')) tags.add('酸甜');
  if (d.category === 'soup' || d.name.includes('汤')) tags.add('汤');
  if (tagsList.includes('快手菜')) tags.add('快手');
  if (tagsList.includes('下饭菜')) tags.add('下饭');
  if (tagsList.includes('硬菜')) tags.add('硬菜');

  return [...tags];
}

// ============ 执行 ============
let hotCount = 0, coldCount = 0, dietCount = 0, noAppetiteCount = 0;

for (const d of dishes) {
  d.weather_tags = assignWeather(d);
  d.body_tags = assignBody(d);
  d.craving_tags = assignCraving(d);

  if (d.weather_tags.length > 1) hotCount++;
  if (d.weather_tags.includes('cold')) coldCount++;
  if (d.body_tags.includes('diet')) dietCount++;
  if (d.body_tags.includes('no_appetite')) noAppetiteCount++;
}

console.log(`标签补全完成：${dishes.length} 道菜\n`);
console.log('天气标签分布:');
console.log(`  热天适合: ${dishes.filter(d => d.weather_tags.includes('hot')).length} 道`);
console.log(`  冷天适合: ${dishes.filter(d => d.weather_tags.includes('cold')).length} 道`);
console.log(`  雨天适合: ${dishes.filter(d => d.weather_tags.includes('rainy')).length} 道`);
console.log(`  干燥适合: ${dishes.filter(d => d.weather_tags.includes('dry')).length} 道`);
console.log('身体条件标签分布:');
console.log(`  上火: ${dishes.filter(d => d.body_tags.includes('上火')).length} 道`);
console.log(`  感冒: ${dishes.filter(d => d.body_tags.includes('cold')).length} 道`);
console.log(`  没胃口: ${dishes.filter(d => d.body_tags.includes('no_appetite')).length} 道`);
console.log(`  减肥: ${dishes.filter(d => d.body_tags.includes('diet')).length} 道`);
console.log(`  运动后: ${dishes.filter(d => d.body_tags.includes('post_sport')).length} 道`);
console.log(`  小孩: ${dishes.filter(d => d.body_tags.includes('child')).length} 道`);
console.log('口味需求标签分布:');
console.log(`  肉: ${dishes.filter(d => d.craving_tags.includes('肉')).length} 道`);
console.log(`  素: ${dishes.filter(d => d.craving_tags.includes('素')).length} 道`);
console.log(`  辣: ${dishes.filter(d => d.craving_tags.includes('辣')).length} 道`);
console.log(`  清淡: ${dishes.filter(d => d.craving_tags.includes('清淡')).length} 道`);
console.log(`  快手: ${dishes.filter(d => d.craving_tags.includes('快手')).length} 道`);

// 输出更新后的 JSON
fs.writeFileSync(DATA_FILE, JSON.stringify(dishes, null, 2), 'utf-8');
console.log(`\n✅ merged_dishes.json 已更新`);

// 同时更新 local_foods.json
const stripped = dishes.map(d => {
  const copy = {};
  for (const k of Object.keys(d)) {
    if (k !== '_source') copy[k] = d[k];
  }
  return copy;
});

fs.writeFileSync(LOCAL_FILE, JSON.stringify(stripped), 'utf-8');
console.log(`✅ local_foods.json 已更新 (${(fs.statSync(LOCAL_FILE).size / 1024).toFixed(1)} KB)`);
