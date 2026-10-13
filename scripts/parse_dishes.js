/**
 * 点菜小程序 — 数据清洗脚本
 *
 * 功能：遍历 dishes/ 目录，解析 364 个 .md 菜谱文件，
 *       提取结构化数据并输出为 JSON
 *
 * 用法：node scripts/parse_dishes.js
 * 输出：scripts/dishes_data.json
 */

const fs = require('fs');
const path = require('path');

// ============ 配置 ============
const DISHES_DIR = path.join(__dirname, '..', '04_workspace', '01_prd', '98_点菜小程序', 'dishes');
const OUTPUT_FILE = path.join(__dirname, 'dishes_data.json');

// 分类中文名称映射
const CATEGORY_NAMES = {
  aquatic: '水产海鲜',
  breakfast: '早餐',
  condiment: '调料酱料',
  dessert: '甜点',
  drink: '饮品',
  meat_dish: '肉菜',
  'semi-finished': '半成品',
  soup: '汤',
  staple: '主食',
  vegetable_dish: '素菜',
};

// 肉菜分类（is_meat = true 的类别）
const MEAT_CATEGORIES = new Set(['meat_dish', 'aquatic']);

// 需要查食材判断荤素的类别
const CHECK_MEAT_CATEGORIES = new Set(['staple', 'soup', 'breakfast']);

// 荤菜食材关键词
const MEAT_KEYWORDS = [
  '肉', '鸡', '鸭', '鱼', '虾', '蟹', '猪', '牛', '羊', '蛋',
  '骨', '腿', '翅', '肚', '肠', '肝', '腰', '心', '舌',
  '腊', '熏', '鲍', '贝', '蚝', '蛤', '蛏', '鱿', '参',
  '鹅', '鸽', '兔', '蛇',
];

// 图片扩展名
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']);

// ============ 工具函数 ============

/** 判断食材中是否含荤菜关键词 */
function containsMeatKeyword(ingredients) {
  return ingredients.some(ing => MEAT_KEYWORDS.some(keyword => ing.includes(keyword)));
}

/** 从字符串中提取星级难度 */
function extractDifficulty(text) {
  const match = text.match(/预估烹饪难度[：:]\s*(★+)/);
  if (match) return match[1].length;
  return null;
}

/** 从字符串中提取卡路里 */
function extractCalories(text) {
  const match = text.match(/预估卡路里[：:]\s*(\d+)/);
  if (match) return parseInt(match[1], 10);
  return null;
}

/** 提取描述（标题之后、第一个##标题之前的段落） */
function extractDescription(text, name) {
  // 去掉标题行
  const afterTitle = text.replace(/^#\s+.*\n/, '');
  // 找到第一个 ## 标题
  const firstSectionMatch = afterTitle.match(/\n##\s/);
  if (firstSectionMatch) {
    const desc = afterTitle.substring(0, firstSectionMatch.index).trim();
    return desc || '';
  }
  return '';
}

/** 提取两个 ## 二级标题之间的内容 */
function extractSection(text, sectionName, nextSectionName) {
  // 构建正则：匹配 ## sectionName 直到下一个 ## 或 end
  const pattern = nextSectionName
    ? new RegExp(`##\\s*${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n##\\s*${nextSectionName})`)
    : new RegExp(`##\\s*${sectionName}\\s*\\n([\\s\\S]*?)$`);

  const match = text.match(pattern);
  if (!match) return '';

  // 去掉可能的后缀（版权声明等）
  let content = match[1].trim();

  // 如果是最后一个模块，去掉常见尾注
  if (!nextSectionName) {
    content = content.replace(/\n---+\s*[\s\S]*$/, '');
    content = content.replace(/\n如果您遵循本指南.*$/, '');
  }

  return content;
}

/** 从原料区文本解析出食材列表 */
function parseIngredients(text) {
  const lines = text.split('\n');
  const ingredients = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // 匹配 - / * / + 开头的列表项
    const listMatch = trimmed.match(/^[-*+]\s+(.+)/);
    if (listMatch) {
      const item = listMatch[1].replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim();
      if (item && !item.startsWith('可选：') && !item.startsWith('可选:')) {
        ingredients.push(item);
      }
    }
  }

  return ingredients;
}

/** 从操作区文本解析出步骤列表 */
function parseSteps(text) {
  const lines = text.split('\n');
  const steps = [];
  let currentStep = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 匹配数字序号步骤：1. 或 1、
    const stepMatch = trimmed.match(/^\d+[.、]\s*(.+)/);
    if (stepMatch) {
      if (currentStep) steps.push(currentStep.trim());
      currentStep = stepMatch[1];
    }
    // 匹配 ### 子标题
    else if (trimmed.startsWith('###')) {
      if (currentStep) steps.push(currentStep.trim());
      currentStep = trimmed.replace(/^###\s*/, '').trim();
    }
    // 匹配 - / * / + 子步骤
    else if (trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.startsWith('+')) {
      const sub = trimmed.replace(/^[-*]\s*/, '').trim();
      if (sub) {
        // 是上一步的补充说明，追加到 currentStep
        if (currentStep) currentStep += '\n  - ' + sub;
        else currentStep = sub;
      }
    }
    // 其他文本，追加到当前步骤
    else {
      if (currentStep) currentStep += ' ' + trimmed;
      else currentStep = trimmed;
    }
  }

  if (currentStep) steps.push(currentStep.trim());

  return steps;
}

/** 从附加内容中提取 tips（去掉参考链接和版权） */
function extractTips(text) {
  if (!text) return '';
  let tips = text
    .replace(/\n- \[.*?\]\(.*?\)\s*/g, '') // 去掉参考链接
    .replace(/\n如果您遵循本指南.*$/g, '')   // 去掉版权声明
    .replace(/\n---+\s*/g, '')              // 去掉分隔线
    .trim();

  return tips;
}

/** 确定荤素 */
function determineIsMeat(category, ingredients) {
  if (MEAT_CATEGORIES.has(category)) return true;
  if (CHECK_MEAT_CATEGORIES.has(category)) {
    return containsMeatKeyword(ingredients);
  }
  return false;
}

/** 读取并解析一个 .md 文件 */
function parseMdFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error(`  读取失败: ${filePath}`);
    return null;
  }
}

/** 从文件名提取菜名（去掉 "的做法" 后缀） */
function extractNameFromTitle(text) {
  const match = text.match(/^#\s+(.+?)(?:的做法)?\s*$/m);
  if (match) return match[1].trim();
  return null;
}

/** 解析一道菜的完整信息 */
function parseDish(mdContent, dishName, imageFiles, category, sourcePath) {
  const titleName = extractNameFromTitle(mdContent);
  const finalName = titleName || dishName;

  const description = extractDescription(mdContent, finalName);
  const difficulty = extractDifficulty(mdContent);
  const calories = extractCalories(mdContent);

  const ingredientsText = extractSection(mdContent, '必备原料和工具', '计算');
  const ingredients = parseIngredients(ingredientsText);

  const calcText = extractSection(mdContent, '计算', '操作');

  const stepsText = extractSection(mdContent, '操作', '附加内容');
  const steps = parseSteps(stepsText);

  const tipsText = extractSection(mdContent, '附加内容');
  const tips = extractTips(tipsText);

  const isMeat = determineIsMeat(category, ingredients);

  const scriptDir = path.join(__dirname, '..');
  const relativeImages = imageFiles.map(f => path.relative(scriptDir, f));

  return {
    name: finalName,
    category,
    categoryName: CATEGORY_NAMES[category] || category,
    difficulty,
    calories,
    isMeat,
    description,
    ingredients,
    steps,
    tips,
    images: relativeImages,
    _source: path.relative(scriptDir, sourcePath),
  };
}

const ALLERGEN_SUFFIXES = [
  '的做法', '（家常版）', '(家常版)', '（简单版）', '(简单版)',
  '（快速版）', '(快速版)', '（烤箱版）', '(烤箱版)',
  '（空气炸锅版）', '(空气炸锅版)',
];

function cleanName(name) {
  if (!name) return name;
  const match = name.match(/^(.+?)(（[^）]*做法）|\([^)]*做法\))?\s*$/);
  return match ? match[1].trim() : name.trim();
}

// ============ 主流程 ============

function main() {
  console.log('===== 点菜小程序 — 数据清洗脚本 =====\n');
  console.log(`菜谱目录: ${DISHES_DIR}`);
  console.log(`输出文件: ${OUTPUT_FILE}\n`);

  if (!fs.existsSync(DISHES_DIR)) {
    console.error(`错误: 目录不存在 ${DISHES_DIR}`);
    process.exit(1);
  }

  const categories = fs.readdirSync(DISHES_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.') && dirent.name !== 'template')
    .map(dirent => dirent.name);

  console.log(`发现 ${categories.length} 个分类目录: ${categories.join(', ')}\n`);

  const allDishes = [];
  let totalFiles = 0;
  let totalDirs = 0;
  let totalErrors = 0;
  let totalImages = 0;

  for (const category of categories) {
    const categoryPath = path.join(DISHES_DIR, category);
    const entries = fs.readdirSync(categoryPath, { withFileTypes: true });
    let catCount = 0;

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      const entryPath = path.join(categoryPath, entry.name);

      if (entry.isFile() && entry.name.endsWith('.md')) {
        // 模式 1: 单文件 {category}/{name}.md
        totalFiles++;
        const dishName = entry.name.replace(/\.md$/, '');
        const mdContent = parseMdFile(entryPath);
        if (!mdContent) continue;

        // 扫描同目录下同名图片: {category}/{name}.jpg
        const imageFiles = [];
        for (const f of fs.readdirSync(categoryPath)) {
          const ext = path.extname(f).toLowerCase();
          if (IMAGE_EXTENSIONS.has(ext) && f.startsWith(dishName)) {
            imageFiles.push(path.join(categoryPath, f));
          }
        }

        const dish = parseDish(mdContent, dishName, imageFiles, category, entryPath);
        allDishes.push(dish);
        totalImages += imageFiles.length;
        catCount++;
      } else if (entry.isDirectory()) {
        // 模式 2: 子目录 {category}/{name}/  内含 .md + 图片
        const dirFiles = fs.readdirSync(entryPath);
        const mdFiles = dirFiles.filter(f => f.endsWith('.md'));

        if (mdFiles.length === 0) {
          console.error(`  警告: 目录 ${entryPath} 中没有 .md 文件`);
          continue;
        }

        // 扫描该目录下所有图片（多个 .md 共用同一份图片）
        const dirImages = [];
        for (const f of dirFiles) {
          const ext = path.extname(f).toLowerCase();
          if (IMAGE_EXTENSIONS.has(ext)) {
            dirImages.push(path.join(entryPath, f));
          }
        }

        // 一个子目录可能包含多个 .md（如 红烧肉/ 下有 南派红烧肉.md + 简易红烧肉.md）
        // 每个 .md 解析为一道独立的菜
        for (const mdFile of mdFiles) {
          totalDirs++;
          const dishName = mdFile.replace(/\.md$/, '');
          const mdContent = parseMdFile(path.join(entryPath, mdFile));
          if (!mdContent) continue;

          const dish = parseDish(mdContent, dishName, [...dirImages], category, path.join(entryPath, mdFile));
          allDishes.push(dish);
          totalImages += dirImages.length;
          catCount++;
        }
      }
    }

    console.log(`  ${category} (${CATEGORY_NAMES[category] || category}): ${catCount} 道菜`);
  }

  // ---- 输出 ----
  console.log(`\n===== 汇总 =====`);
  console.log(`  总菜谱数: ${allDishes.length}`);
  console.log(`  文件模式: ${totalFiles} 道`);
  console.log(`  目录模式: ${totalDirs} 道`);
  console.log(`  关联图片: ${totalImages} 张`);

  // 统计
  const withDifficulty = allDishes.filter(d => d.difficulty !== null).length;
  const withCalories = allDishes.filter(d => d.calories !== null).length;
  const withIngredients = allDishes.filter(d => d.ingredients.length > 0).length;
  const withSteps = allDishes.filter(d => d.steps.length > 0).length;
  const withImages = allDishes.filter(d => d.images.length > 0).length;
  const meatCount = allDishes.filter(d => d.isMeat).length;
  const vegCount = allDishes.filter(d => !d.isMeat).length;

  console.log(`  有难度标注: ${withDifficulty}/${allDishes.length}`);
  console.log(`  有卡路里标注: ${withCalories}/${allDishes.length}`);
  console.log(`  有食材清单: ${withIngredients}/${allDishes.length}`);
  console.log(`  有操作步骤: ${withSteps}/${allDishes.length}`);
  console.log(`  有关联图片: ${withImages}/${allDishes.length}`);
  console.log(`  荤菜: ${meatCount}, 素菜: ${vegCount}`);

  // 写入文件
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allDishes, null, 2), 'utf-8');
  console.log(`\n✅ 数据已输出到: ${OUTPUT_FILE}`);
  console.log(`   文件大小: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1)} KB`);
}

main();
