/**
 * 点菜小程序 — 智能标签标注脚本
 *
 * 基于菜名、分类、食材、描述，自动推断：
 *   meal_type, target, taste, cook_time, tags
 *
 * 用法：node scripts/tag_dishes.js
 * 输入：scripts/dishes_data.json
 * 输出：scripts/dishes_tagged.json
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '..', 'data', 'dishes_data.json');
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'dishes_tagged.json');

// ============ 规则库 ============

/** 餐次推断规则 */
function inferMealType(dish) {
  const types = new Set();

  // 从分类推断
  if (dish.category === 'breakfast') {
    types.add('早餐');
  }

  // 从菜名推断
  const name = dish.name;
  if (/早餐|早点|清晨|早起|早晨|燕麦|麦片|吐司|面包|三明治|煎蛋|荷包蛋|水煮蛋|蒸蛋|茶叶蛋|牛奶|豆浆|粥|玉米|糍粑/.test(name)) {
    types.add('早餐');
  }
  // 部分主食也可作早餐
  if (dish.category === 'staple' && /面|饭|饼|馒头|包子|饺子|馄饨|烧卖|粉/.test(name)) {
    types.add('早餐');
  }
  if (/下午茶|甜品|甜点|蛋糕|冰淇淋|雪媚娘|司康|蛋挞|奶茶|果冻|布丁|糖水|西米露/.test(name)) {
    types.add('下午茶');
  }
  if (/汤|汤羹|煲汤/.test(name) && dish.category === 'soup') {
    types.add('午餐');
    types.add('晚餐');
  }
  if (/饮料|茶|mojito|莫吉托|鸡尾酒|金汤力|长岛冰茶|轰炸机/.test(name)) {
    types.add('下午茶');
  }

  // 从分类+食材推断默认餐次
  if (types.size === 0) {
    if (dish.category === 'dessert' || dish.category === 'drink') {
      types.add('下午茶');
    } else {
      types.add('午餐');
      types.add('晚餐');
    }
  }

  return [...types];
}

/** 受众推断规则 */
function inferTarget(dish) {
  const targets = new Set();
  const name = dish.name;
  const desc = dish.description || '';
  const allText = name + desc;
  const ingredients = (dish.ingredients || []).join('');

  // 含辣/重口味 → 大人
  if (/辣|椒|麻辣|香辣|尖椒|辣椒|水煮肉|水煮牛肉|麻婆|口水鸡/.test(allText)) {
    targets.add('大人');
  }
  // 含酒/咖啡因 → 大人
  if (/酒|mojito|莫吉托|鸡尾酒|金汤力|长岛冰茶|轰炸机|咖啡/.test(name)) {
    targets.add('大人');
  }
  // 重香料 → 大人
  if (/咖喱|花椒|八角|桂皮|香叶|草果/.test(allText)) {
    targets.add('大人');
  }

  // 孩子友好特征（需要较为明确的信号，避免"蛋"/"鱼"/"豆腐"等通用食材误标）
  if (/宝宝|儿童|无骨|去骨|虾仁|牛奶燕麦|小米粥|玉米汁/.test(allText)) {
    targets.add('小孩');
  }
  if (/蒸蛋|鸡蛋羹|太阳蛋|蛋羹|蒸水蛋|水蒸蛋/.test(name)) {
    targets.add('小孩');
  }
  if (/蛋挞|布丁|冰淇淋|蛋糕|甜甜圈|溶豆/.test(name)) {
    targets.add('小孩');
  }
  // 蒸菜、软烂菜适合小孩
  if (/蒸.*蛋|蒸.*鱼|蒸.*豆腐|蒸.*南瓜|蒸.*冬瓜/.test(allText)) {
    targets.add('小孩');
  }
  if (/清淡|清淡易消化|口感软烂/.test(dish.description)) {
    targets.add('小孩');
  }

  // 如果大人和小孩都有 → 全家
  if (targets.has('大人') && targets.has('小孩')) {
    targets.add('全家');
  }
  // 如果只有小孩 → 加上全家（小孩能吃的大人也吃）
  if (targets.has('小孩') && !targets.has('大人')) {
    targets.add('全家');
  }
  // 都没有 → 全家
  if (targets.size === 0) {
    targets.add('全家');
  }

  return [...targets];
}

/** 口味推断规则 */
function inferTaste(dish) {
  const tastes = new Set();
  const name = dish.name;
  const desc = dish.description || '';
  const allText = name + desc;

  if (/酸甜|糖醋|西红柿|番茄/.test(allText)) tastes.add('酸甜');
  if (/麻辣|香辣|辣|椒/.test(allText)) {
    if (/微辣/.test(desc)) tastes.add('微辣');
    else if (/重辣|特辣/.test(desc)) tastes.add('重辣');
    else tastes.add('香辣');
  }
  if (/咖喱/.test(allText)) tastes.add('咖喱');
  if (/清淡|清蒸|白灼|原味/.test(allText)) tastes.add('清淡');
  if (/蒜香|蒜蓉/.test(allText)) tastes.add('蒜香');
  if (/葱油|葱香/.test(allText)) tastes.add('葱香');
  if (/照烧|红烧|酱香|卤/.test(allText)) tastes.add('酱香');
  if (/椒盐/.test(allText)) tastes.add('椒盐');
  if (/奶香|奶油|芝士|奶酪|椰浆|椰奶/.test(allText)) tastes.add('奶香');
  if (/甜|糖/.test(name) && dish.category === 'dessert') tastes.add('甜');
  if (/酸辣/.test(allText)) { tastes.delete('香辣'); tastes.add('酸辣'); }

  // 默认
  if (tastes.size === 0) {
    if (dish.category === 'dessert' || dish.category === 'drink') {
      tastes.add('甜');
    } else if (dish.category === 'condiment') {
      tastes.add('酱香');
    } else {
      tastes.add('清淡');
    }
  }

  return [...tastes];
}

/** 烹饪时长推断（根据难度星级估算） */
function inferCookTime(dish) {
  const diff = dish.difficulty || 3;
  const lookup = { 1: 10, 2: 20, 3: 40, 4: 60, 5: 90 };
  return lookup[diff] || 30;
}

/** 标签推断 */
function inferTags(dish) {
  const tags = new Set();
  const name = dish.name;
  const desc = dish.description || '';
  const allText = name + desc;

  // 快手菜: 难度 1-2 星
  if (dish.difficulty <= 2) tags.add('快手菜');

  // 下饭菜
  if (/下饭|肉|炒|香|辣/.test(allText) && dish.category !== 'dessert' && dish.category !== 'drink') {
    tags.add('下饭菜');
  }

  // 减脂
  if (/减脂|轻食|沙拉|鸡胸|西兰花|沙拉|低脂|低卡/.test(allText)) tags.add('减脂');
  if (dish.calories && dish.calories < 300) tags.add('减脂');

  // 硬菜
  if (dish.difficulty >= 4) tags.add('硬菜');
  if (/肘子|排骨|牛腩|羊排|整鸡|全鸡|大虾|蟹|烤/.test(name) && dish.difficulty >= 3) tags.add('硬菜');

  // 家常
  if (dish.difficulty <= 3 && dish.category !== 'dessert' && dish.category !== 'drink') tags.add('家常');

  // 烤箱菜
  if (/烤箱|烤|空气炸锅/.test(allText)) tags.add('烤箱菜');

  // 早餐专用
  if (dish.meal_type && dish.meal_type.includes('早餐')) {
    if (dish.difficulty <= 2) tags.add('快手早餐');
  }

  // 汤羹
  if (dish.category === 'soup') tags.add('汤羹');

  // 主食
  if (dish.category === 'staple') tags.add('主食');

  // 素菜
  if (!dish.isMeat) tags.add('素菜');

  // 荤菜
  if (dish.isMeat) tags.add('荤菜');

  // 甜品
  if (dish.category === 'dessert') tags.add('甜品');

  // 饮品
  if (dish.category === 'drink') tags.add('饮品');

  return [...tags];
}

// ============ 主流程 ============

function main() {
  console.log('===== 点菜小程序 — 智能标签标注 =====\n');

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`错误: 找不到输入文件 ${INPUT_FILE}`);
    console.error('请先运行 parse_dishes.js');
    process.exit(1);
  }

  const dishes = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  console.log(`加载 ${dishes.length} 道菜谱数据\n`);

  // 添加标签
  let stats = { meal_type: {}, target: {}, taste: {}, tags: {} };

  for (const dish of dishes) {
    dish.meal_type = inferMealType(dish);
    dish.target = inferTarget(dish);
    dish.taste = inferTaste(dish);
    dish.cook_time = inferCookTime(dish);
    dish.tags = inferTags(dish);

    // 统计
    dish.meal_type.forEach(t => { stats.meal_type[t] = (stats.meal_type[t] || 0) + 1; });
    dish.target.forEach(t => { stats.target[t] = (stats.target[t] || 0) + 1; });
    dish.taste.forEach(t => { stats.taste[t] = (stats.taste[t] || 0) + 1; });
    dish.tags.forEach(t => { stats.tags[t] = (stats.tags[t] || 0) + 1; });
  }

  // 输出统计
  console.log('--- 餐次分布 ---');
  Object.entries(stats.meal_type).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v}`));

  console.log('\n--- 受众分布 ---');
  Object.entries(stats.target).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v}`));

  console.log('\n--- 口味分布 ---');
  Object.entries(stats.taste).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v}`));

  console.log('\n--- 热门标签 Top 10 ---');
  Object.entries(stats.tags).sort((a,b) => b[1]-a[1]).slice(0, 10).forEach(([k,v]) => console.log(`  ${k}: ${v}`));

  // 输出
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(dishes, null, 2), 'utf-8');
  console.log(`\n✅ 标注完成，已输出到: ${OUTPUT_FILE}`);
  console.log(`   文件大小: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1)} KB`);

  // 展示几个样例
  console.log('\n--- 标注样例 ---');
  const samples = ['西红柿炒鸡蛋', '红烧肉', '太阳蛋', '紫菜蛋花汤', '咖喱炒蟹'];
  for (const name of samples) {
    const dish = dishes.find(d => d.name === name);
    if (dish) {
      console.log(`\n  ${dish.name}:`);
      console.log(`    餐次: ${dish.meal_type.join(', ')}`);
      console.log(`    受众: ${dish.target.join(', ')}`);
      console.log(`    口味: ${dish.taste.join(', ')}`);
      console.log(`    时长: ${dish.cook_time} 分钟`);
      console.log(`    标签: ${dish.tags.join(', ')}`);
    }
  }
}

main();
