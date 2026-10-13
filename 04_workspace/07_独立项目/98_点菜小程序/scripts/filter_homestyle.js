/**
 * 标记家常菜/非家常菜，过滤数据
 */
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'merged_dishes.json');
const LOCAL_FILE = path.join(__dirname, '..', 'miniapp', 'miniprogram', 'models', 'local_foods.js');

const dishes = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));

// 非家常菜的 category（饮品、甜点保留，仅隐藏配料和半成品）
const NON_HOMESTYLE_CATS = new Set(['condiment', 'semi-finished']);

// 非家常菜的具体菜名或关键词（仅真正不是菜的）
const NON_HOMESTYLE_KEYWORDS = [
  '速冻', '方便面', '懒人蛋挞',
];

// 标注并过滤
let hidden = 0;
let shown = 0;

for (const d of dishes) {
  const cat = d.category || '';
  const name = d.name || '';

  // 判断是否为家常菜
  const isNonCat = NON_HOMESTYLE_CATS.has(cat);
  const isNonKeyword = NON_HOMESTYLE_KEYWORDS.some(kw => name.includes(kw));
  const isHomeStyle = !isNonCat && !isNonKeyword;

  d.isHomeStyle = isHomeStyle;

  if (!isHomeStyle) hidden++;
  else shown++;
}

console.log(`\n共 ${dishes.length} 道菜`);
console.log(`家常菜: ${shown} 道`);
console.log(`已隐藏: ${hidden} 道（饮品${NON_HOMESTYLE_CATS.has('drink') ? '、甜点' : ''}${NON_HOMESTYLE_CATS.has('dessert') ? '、配料' : ''}${NON_HOMESTYLE_CATS.has('condiment') ? '、半成品' : ''}）`);

// 输出隐藏的品类分布
const hiddenCats = {};
for (const d of dishes) {
  if (!d.isHomeStyle) {
    const cn = d.categoryName || d.category;
    hiddenCats[cn] = (hiddenCats[cn] || 0) + 1;
  }
}
console.log('隐藏的品类分布:');
for (const [k, v] of Object.entries(hiddenCats).sort((a,b) => b[1]-a[1])) {
  console.log(`  ${k}: ${v}道`);
}

// 更新 JSON
// 更新 JSON + JSON（同时保留 .json 文件给小程序使用）
fs.writeFileSync(DATA_FILE, JSON.stringify(dishes, null, 2), 'utf-8');

// 生成本地数据 JSON（不含 _source）
const stripped = dishes.map(d => {
  const copy = {};
  for (const k of Object.keys(d)) {
    if (k !== '_source') copy[k] = d[k];
  }
  return copy;
});
fs.writeFileSync(LOCAL_FILE, JSON.stringify(stripped), 'utf-8');

console.log(`\n✅ data/merged_dishes.json 已更新`);
console.log(`✅ local_foods.json 已更新 (${(fs.statSync(LOCAL_FILE).size / 1024).toFixed(1)} KB)`);
