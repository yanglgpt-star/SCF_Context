/**
 * 合并新旧菜谱数据，去重，输出合并结果
 */
const fs = require('fs');
const path = require('path');

const OLD_FILE = path.join(__dirname, '..', 'data', 'dishes_tagged.json');
const NEW_FILE = path.join(__dirname, '..', 'data', 'new_dishes.json');
const MERGED_FILE = path.join(__dirname, '..', 'data', 'merged_dishes.json');
const LOCAL_FILE = path.join(__dirname, '..', 'miniapp', 'miniprogram', 'models', 'local_foods.js');

const oldData = JSON.parse(fs.readFileSync(OLD_FILE, 'utf-8'));
const newData = JSON.parse(fs.readFileSync(NEW_FILE, 'utf-8'));

console.log(`旧数据: ${oldData.length} 道菜`);
console.log(`新数据: ${newData.length} 道菜`);

// 用旧数据的 name 做索引
const oldByName = new Map();
for (const d of oldData) {
  oldByName.set(d.name, d);
}

// 去重：新数据覆盖旧数据
let added = 0;
let replaced = 0;
for (const d of newData) {
  if (oldByName.has(d.name)) {
    replaced++;
  } else {
    added++;
  }
  oldByName.set(d.name, d); // 新数据直接覆盖
}

const merged = [...oldByName.values()];
console.log(`替换（新替旧）: ${replaced} 道`);
console.log(`新增: ${added} 道`);
console.log(`合并后: ${merged.length} 道菜`);

// 统计
const withImages = merged.filter(d => d.images && d.images.length > 0).length;
const totalImages = merged.reduce((s, d) => s + (d.images ? d.images.length : 0), 0);
const hasOldImg = merged.filter(d => d.images && d.images[0] && !d.images[0].includes('菜谱')).length;
const hasNewImg = merged.filter(d => d.images && d.images[0] && d.images[0].includes('菜谱')).length;

console.log(`有图片: ${withImages} 道菜（${totalImages} 张）`);
console.log(`  旧图片: ${hasOldImg} 道`);
console.log(`  新图片: ${hasNewImg} 道`);

// 输出合并 JSON
fs.writeFileSync(MERGED_FILE, JSON.stringify(merged, null, 2), 'utf-8');
console.log(`\n✅ 合并 JSON 已输出: ${MERGED_FILE}`);
console.log(`  大小: ${(fs.statSync(MERGED_FILE).size / 1024).toFixed(1)} KB`);

// 生成本地数据 JS 模块（给 local_foods.js 用）
// 去掉 _source 字段减少体积
const stripped = merged.map(({ _source, ...rest }) => rest);
let js = '// 本地菜品数据（自动生成，合并新旧菜谱共 ' + merged.length + ' 道）\n';
js += '// 生成时间: ' + new Date().toLocaleString('zh-CN') + '\n';
// 分批写入避免单行过长
js += 'const localDishes = ' + JSON.stringify(stripped) + ';\n';
js += 'module.exports = localDishes;\n';

fs.writeFileSync(LOCAL_FILE, js, 'utf-8');
console.log(`✅ 本地数据模块已输出: ${LOCAL_FILE}`);
console.log(`  大小: ${(Buffer.byteLength(js) / 1024).toFixed(1)} KB`);
console.log(`  加载后约占用: ${(Buffer.byteLength(js) / 1024 / 1024).toFixed(2)} MB 内存`);

// 检查包大小
const miniprogramRoot = path.join(__dirname, '..', 'miniapp', 'miniprogram');
function dirSize(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, f.name);
    if (f.isFile()) total += fs.statSync(fp).size;
    else if (f.isDirectory() && !f.name.startsWith('.') && f.name !== 'node_modules') total += dirSize(fp);
  }
  return total;
}
const pkgSize = dirSize(miniprogramRoot);
console.log(`  主包当前大小: ${(pkgSize / 1024).toFixed(1)} KB`);
console.log(`  加上 local_foods.js: ${((pkgSize + Buffer.byteLength(js)) / 1024).toFixed(1)} KB`);
console.log(`  微信 2MB 限制: ${(pkgSize + Buffer.byteLength(js)) < 2 * 1024 * 1024 ? '✅ 通过' : '❌ 超限'}`);
