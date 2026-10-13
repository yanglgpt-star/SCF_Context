/**
 * 解析 菜谱/ 目录下的新菜谱数据（351 道菜）
 * 输出为结构化 JSON，可与现有 dishes_tagged.json 合并
 */
const fs = require('fs');
const path = require('path');

const DISHES_DIR = path.join(__dirname, '..', '菜谱');
const IMAGES_DIR = path.join(DISHES_DIR, 'images');
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'new_dishes.json');

// 中文分类 → 英文 category 映射
const CATEGORY_MAP = {
  '炒菜': 'vegetable_dish',
  '蒸菜': 'vegetable_dish',
  '炖菜': 'meat_dish',
  '炸品': 'meat_dish',
  '烤类': 'meat_dish',
  '汤': 'soup',
  '主食': 'staple',
  '凉拌': 'vegetable_dish',
  '卤菜': 'meat_dish',
  '烫菜': 'vegetable_dish',
  '煮锅': 'soup',
  '砂锅菜': 'soup',
  '早餐': 'breakfast',
  '饮品': 'drink',
  '配料': 'condiment',
};

// 中分类 → 中文名
const CATEGORY_CN = {
  '炒菜': '炒菜', '蒸菜': '蒸菜', '炖菜': '炖菜', '炸品': '炸品',
  '烤类': '烤类', '汤': '汤', '主食': '主食', '凉拌': '凉拌',
  '卤菜': '卤菜', '烫菜': '烫菜', '煮锅': '煮锅', '砂锅菜': '砂锅菜',
  '早餐': '早餐', '饮品': '饮品', '配料': '配料',
};

// 默认餐次推断
const MEAL_TYPE_MAP = {
  '早餐': ['早餐'],
  '饮品': ['早餐', '下午茶'],
};

// 荤菜关键词
const MEAT_KEYWORDS = ['肉', '鸡', '鸭', '鱼', '虾', '蟹', '猪', '牛', '羊', '蛋',
  '骨', '腿', '翅', '肚', '肠', '肝', '腰', '心', '舌', '腊', '熏',
  '鲍', '贝', '蚝', '蛤', '蛏', '鱿', '参', '鹅', '鸽', '兔'];

// 已知厨具/调料类配料（非菜品的）
const CONDIMENT_ONLY = ['调味料', '酱料', '酱', '汁', '油', '卤', '料', '底料'];

function isMeatDish(zhCategory, name, ingredients) {
  // 早餐、饮品、配料默认素菜
  if (['早餐', '饮品', '配料'].includes(zhCategory)) return false;
  // 炖菜、炸品、烤类、卤菜、煮锅、砂锅菜 默认荤菜
  if (['炖菜', '炸品', '烤类', '卤菜', '煮锅', '砂锅菜'].includes(zhCategory)) return true;
  // 炒菜、蒸菜、凉拌、烫菜 根据食材判断
  const allText = name + ' ' + ingredients.join(' ');
  return MEAT_KEYWORDS.some(kw => allText.includes(kw));
}

function parseMdFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch { return null; }
}

function extractNameFromTitle(text) {
  const m = text.match(/^#\s+(.+)/m);
  return m ? m[1].trim() : null;
}

function extractImage(text) {
  const m = text.match(/!\[.*?\]\((.+?)\)/);
  if (!m) return null;
  const parts = m[1].split('/');
  return parts[parts.length - 1]; // 取最后一个 / 后的纯文件名
}

function extractSection(text, sectionName) {
  // 匹配 ## 配料 或 ### 配料（支持多个同名section合并）
  const pattern = new RegExp(`^#{2,3}\\s*${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n^#{2,3}\\s|\\n##|$)`, 'm');
  const m = text.match(pattern);
  return m ? m[1].trim() : '';
}

function parseIngredients(text) {
  const lines = text.split('\n');
  const items = [];
  for (const line of lines) {
    const t = line.trim();
    const lm = t.match(/^[-*]\s+(.+)/);
    if (lm) {
      let item = lm[1].replace(/（[^）]*来自[^）]*）/g, '').replace(/\([^)]*来自[^)]*\)/g, '').trim();
      // 去掉末尾克数说明
      item = item.replace(/（[\d.]+[g克]左右?）$/, '').trim();
      if (item && !item.startsWith('可选')) items.push(item);
    }
  }
  return items;
}

function parseSteps(text) {
  const lines = text.split('\n');
  const steps = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const lm = t.match(/^[-*]\s+(.+)/);
    if (lm) {
      // 去掉序号前缀 "1. " "2. " 等
      let step = lm[1].replace(/^\d+[.、]\s*/, '').trim();
      if (step) steps.push(step);
    }
  }
  return steps;
}

function isCondiment(name, category) {
  if (category !== 'condiment') return false;
  return CONDIMENT_ONLY.some(kw => name.includes(kw));
}

function main() {
  console.log('===== 新菜谱解析 =====\n');

  const categories = fs.readdirSync(DISHES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => d.name);

  // 读取所有图片文件名 → set
  const imageFiles = new Set();
  if (fs.existsSync(IMAGES_DIR)) {
    for (const f of fs.readdirSync(IMAGES_DIR)) {
      imageFiles.add(f);
    }
  }
  console.log(`图片目录共有 ${imageFiles.size} 张图片\n`);

  const allDishes = [];
  let totalMd = 0;
  let totalImages = 0;

  for (const zhCat of categories) {
    const catPath = path.join(DISHES_DIR, zhCat);
    const files = fs.readdirSync(catPath)
      .filter(f => f.endsWith('.md') && f !== 'README.md');

    let catCount = 0;

    for (const file of files) {
      const filePath = path.join(catPath, file);
      const content = parseMdFile(filePath);
      if (!content) continue;

      const name = extractNameFromTitle(content);
      if (!name) {
        console.warn(`  无法提取标题: ${filePath}`);
        continue;
      }

      const imageName = extractImage(content);
      const ingredients = parseIngredients(content);
      const steps = parseSteps(content);

      // 确定对应图片文件
      const images = [];
      if (imageName && imageFiles.has(imageName)) {
        images.push(`../../菜谱/images/${imageName}`);
        totalImages++;
      }

      const category = CATEGORY_MAP[zhCat] || 'vegetable_dish';
      const categoryName = CATEGORY_CN[zhCat] || zhCat;
      const isMeat = isMeatDish(zhCat, name, ingredients);

      // 默认餐次
      const mealType = MEAL_TYPE_MAP[zhCat] || ['午餐', '晚餐'];

      allDishes.push({
        name,
        category,
        categoryName,
        meal_type: mealType,
        isMeat,
        ingredients,
        steps,
        images,
        difficulty: 2,
        calories: null,
        cook_time: null,
        tags: [],
        taste: [],
        target: ['全家'],
        description: `${name}（${categoryName}类，${isMeat ? '荤' : '素'}菜）`,
        _source: `菜谱/${zhCat}/${file}`,
      });

      catCount++;
    }

    console.log(`  ${zhCat} (${CATEGORY_MAP[zhCat]}): ${catCount} 道菜`);
    totalMd += catCount;
  }

  // 输出
  const meatCount = allDishes.filter(d => d.isMeat).length;
  const vegCount = allDishes.filter(d => !d.isMeat).length;

  console.log(`\n===== 汇总 =====`);
  console.log(`  总菜谱数: ${allDishes.length}`);
  console.log(`  荤菜: ${meatCount}`);
  console.log(`  素菜: ${vegCount}`);
  console.log(`  有图片: ${allDishes.filter(d => d.images.length > 0).length}`);
  console.log(`  总图片引用: ${totalImages}`);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allDishes, null, 2), 'utf-8');
  console.log(`\n✅ 已输出到: ${OUTPUT_FILE}`);
  console.log(`  大小: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1)} KB`);
}

main();
