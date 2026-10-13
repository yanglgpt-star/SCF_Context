/**
 * 生成 Tab 占位图标（纯色圆 PNG）
 * 仅使用 Node.js 内置模块
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUTPUT_DIR = path.join(__dirname, '..', 'miniprogram', 'images');
const SIZE = 81; // 81x81 像素

// CRC32 表
const crcTable = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[i] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeB = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeB, data]);
  const crcB = Buffer.alloc(4); crcB.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([len, typeB, data, crcB]);
}

function createPNG(hexColor) {
  const r = parseInt(hexColor.slice(0, 2), 16);
  const g = parseInt(hexColor.slice(2, 4), 16);
  const b = parseInt(hexColor.slice(4, 6), 16);
  const bgR = 245, bgG = 245, bgB = 245;

  // 创建 RGBA 像素数据
  const rawData = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  const cx = SIZE / 2, cy = SIZE / 2, radius = SIZE / 2 - 4;
  const r2 = radius * radius;

  for (let y = 0; y < SIZE; y++) {
    rawData[y * (SIZE * 4 + 1)] = 0; // filter byte: None
    for (let x = 0; x < SIZE; x++) {
      const idx = y * (SIZE * 4 + 1) + 1 + x * 4;
      const dx = x - cx, dy = y - cy;
      const inCircle = dx * dx + dy * dy <= r2;
      rawData[idx] = inCircle ? r : bgR;
      rawData[idx + 1] = inCircle ? g : bgG;
      rawData[idx + 2] = inCircle ? b : bgB;
      rawData[idx + 3] = 255;
    }
  }

  // PNG Header
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);  // width
  ihdr.writeUInt32BE(SIZE, 4);  // height
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  const compressed = zlib.deflateSync(rawData);

  return Buffer.concat([
    signature,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', compressed),
    createChunk('IEND', Buffer.alloc(0)),
  ]);
}

// 生成图标
const icons = {
  'tab-order.png': '07c160',
  'tab-order-active.png': '07c160',
  'tab-recipes.png': '999999',
  'tab-recipes-active.png': '07c160',
  'tab-history.png': '999999',
  'tab-history-active.png': '07c160',
};

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

for (const [name, color] of Object.entries(icons)) {
  const png = createPNG(color);
  fs.writeFileSync(path.join(OUTPUT_DIR, name), png);
  console.log(`✅ ${name} (${SIZE}x${SIZE}, 圆点 #${color})`);
}

console.log(`\n📁 输出到: ${OUTPUT_DIR}`);
console.log('💡 提示：这些是占位图标，建议用更精美的设计替换');
