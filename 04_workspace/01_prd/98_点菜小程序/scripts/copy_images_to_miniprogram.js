/**
 * 将 dishes/ 下的所有图片复制到 miniprogram 目录
 * 保留相对目录结构，使路径可直接从 DB 的 images 字段转换
 *
 * DB 路径: ../dishes/meat_dish/红烧肉.jpg
 * 目标路径: images/dishes/meat_dish/红烧肉.jpg
 *   → 只需要替换 ../dishes/ → images/dishes/
 */
const fs = require('fs');
const path = require('path');

const DISHES_DIR = path.join(__dirname, '..', 'dishes');
const TARGET_BASE = path.join(__dirname, '..', 'miniapp', 'miniprogram', 'images');

let totalCopied = 0;
let totalFailed = 0;

function copyImages() {
  if (!fs.existsSync(DISHES_DIR)) {
    console.error('dishes/ 目录不存在');
    return;
  }

  const categories = fs.readdirSync(DISHES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => d.name);

  for (const category of categories) {
    const catPath = path.join(DISHES_DIR, category);
    const entries = fs.readdirSync(catPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const entryPath = path.join(catPath, entry.name);

      if (entry.isFile() && entry.name.endsWith('.md')) continue;

      if (entry.isFile()) {
        // 单文件: dishes/meat_dish/红烧肉.jpg
        const ext = path.extname(entry.name).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) {
          const targetDir = path.join(TARGET_BASE, 'dishes', category);
          fs.mkdirSync(targetDir, { recursive: true });
          const targetPath = path.join(targetDir, entry.name);
          copyFile(entryPath, targetPath);
        }
      } else if (entry.isDirectory()) {
        // 目录模式: dishes/aquatic/小龙虾/成品.jpg
        const subFiles = fs.readdirSync(entryPath);
        for (const f of subFiles) {
          const ext = path.extname(f).toLowerCase();
          if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) {
            const targetDir = path.join(TARGET_BASE, 'dishes', category, entry.name);
            fs.mkdirSync(targetDir, { recursive: true });
            const srcPath = path.join(entryPath, f);
            const targetPath = path.join(targetDir, f);
            copyFile(srcPath, targetPath);
          }
        }
      }
    }
  }

  console.log(`\n✅ 完成: 复制 ${totalCopied} 张图片`);
  if (totalFailed > 0) console.log(`❌ 失败: ${totalFailed} 张`);
  console.log(`目标目录: ${TARGET_BASE}`);
}

function copyFile(src, dest) {
  try {
    fs.copyFileSync(src, dest);
    totalCopied++;
    process.stdout.write('.');
  } catch (err) {
    totalFailed++;
    console.error(`\n  复制失败: ${src} → ${err.message}`);
  }
}

copyImages();
