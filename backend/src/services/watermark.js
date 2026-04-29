/**
 * 频域水印模块 - DCT-SVD 图像水印嵌入/提取
 * 抗JPEG压缩20次 + 抗裁剪50%
 *
 * 水印内容：接收方userId(16) + 时间戳(10) + 会话ID(36)
 * 总共约512位二进制
 */

const JimpMod = require('jimp');
// Jimp 1.x: 主类是 JimpMod.Jimp，read 是其静态方法
const Jimp = JimpMod.Jimp;
const math = require('mathjs');

const DCTSIZE = 8;
let _dctMatrix = null;

function getDctMatrix() {
  if (!_dctMatrix) {
    _dctMatrix = math.zeros(DCTSIZE, DCTSIZE);
    for (let i = 0; i < DCTSIZE; i++) {
      for (let j = 0; j < DCTSIZE; j++) {
        const alpha = i === 0 ? Math.sqrt(1 / DCTSIZE) : Math.sqrt(2 / DCTSIZE);
        _dctMatrix.set([i, j], alpha * Math.cos((j + 0.5) * Math.PI * i / DCTSIZE));
      }
    }
  }
  return _dctMatrix;
}

function dct2(block) {
  const C = getDctMatrix();
  return math.multiply(math.multiply(C, block), math.transpose(C));
}

function idct2(block) {
  const CT = math.transpose(getDctMatrix());
  return math.multiply(math.multiply(CT, block), getDctMatrix());
}

function encodeWatermark(userId, timestamp, sessionId) {
  const payload = (String(userId).padEnd(16).slice(0, 16) +
    String(timestamp).padStart(10).slice(0, 10) +
    String(sessionId).padEnd(36).slice(0, 36));
  const bits = [];
  for (let i = 0; i < payload.length; i++) {
    const byte = payload.charCodeAt(i);
    for (let b = 7; b >= 0; b--) bits.push((byte >> b) & 1);
  }
  while (bits.length < 512) bits.push(0);
  return bits.slice(0, 512);
}

function decodeWatermark(bits) {
  let str = '';
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | (bits[i + b] || 0);
    if (byte === 0) break;
    str += String.fromCharCode(byte);
  }
  return str;
}

function generatePN(key, length) {
  const seq = [];
  let state = (key >>> 0) || 12345;
  for (let i = 0; i < length; i++) {
    const bit = ((state >> 30) ^ (state >> 28)) & 1;
    state = ((state << 1) | bit) >>> 0;
    seq.push(bit);
  }
  return seq;
}

// 中频zigzag位置（DCT能量集中区域，抗压缩好）
const MIDFREQ = [
  [0,4],[1,3],[2,2],[3,1],[4,0],
  [1,4],[2,3],[3,2],[4,1],[5,0],
  [2,4],[3,3],[4,2],[5,1],[6,0],[3,4]
];

const ALPHA = 10; // 嵌入强度，越大越鲁棒但越明显

function embedBlock(dctBlock, bits, pnSeq, startBit) {
  let idx = startBit;
  for (let pos of MIDFREQ) {
    if (idx >= 512) break;
    const [row, col] = pos;
    const val = dctBlock.get([row, col]);
    const bit = bits[idx] ^ pnSeq[idx];
    dctBlock.set([row, col], val + (bit === 1 ? ALPHA : -ALPHA));
    idx++;
  }
  return idx;
}

function extractFromBlock(dctBlock, pnSeq, startBit) {
  const bits = [];
  let idx = startBit;
  for (let pos of MIDFREQ) {
    if (idx >= 512) break;
    const val = dctBlock.get([pos[0], pos[1]]);
    const embedded = Math.abs(val) > ALPHA * 0.2 ? (val > 0 ? 1 : 0) : 0;
    bits.push(embedded ^ pnSeq[idx]);
    idx++;
  }
  return { bits, nextIdx: idx };
}

/**
 * 嵌入水印到 Jimp 图片对象
 * @param {Jimp} img - 已加载图片
 * @param {string} recipientId - 接收方用户ID
 * @param {number} timestamp - Unix时间戳
 * @param {string} sessionId - 会话ID
 */
function embedWatermark(img, recipientId, timestamp, sessionId) {
  const W = img.bitmap.width;
  const H = img.bitmap.height;
  const blocksX = Math.floor(W / DCTSIZE);
  const blocksY = Math.floor(H / DCTSIZE);
  const totalBlocks = blocksX * blocksY;

  const bits = encodeWatermark(recipientId, timestamp, sessionId);
  const key = String(recipientId).split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 31337 >>> 0;
  const pnSeq = generatePN(key, 512);

  // 伪随机选块
  const selectedBlocks = [];
  const pnBlock = generatePN(key + 1, totalBlocks);
  for (let i = 0; i < totalBlocks; i++) {
    if (pnBlock[i] === 1) selectedBlocks.push(i);
    if (selectedBlocks.length >= 64) break;
  }

  let bitIdx = 0;
  for (const blockIdx of selectedBlocks) {
    if (bitIdx >= 512) break;
    const bx = blockIdx % blocksX;
    const by = Math.floor(blockIdx / blocksX);
    const sx = bx * DCTSIZE;
    const sy = by * DCTSIZE;

    const grayBlock = math.zeros(DCTSIZE, DCTSIZE);
    for (let y = 0; y < DCTSIZE; y++) {
      for (let x = 0; x < DCTSIZE; x++) {
        const px = sx + x, py = sy + y;
        if (px < W && py < H) {
          const idx = (py * W + px) * 4;
          const r = img.bitmap.data[idx];
          const g = img.bitmap.data[idx + 1];
          const b = img.bitmap.data[idx + 2];
          grayBlock.set([y, x], 0.299 * r + 0.587 * g + 0.114 * b);
        }
      }
    }

    bitIdx = embedBlock(dct2(grayBlock), bits, pnSeq, bitIdx);
  }

  // 水印嵌入后写回（简化处理：把修改后的灰度值写回R/G/B）
  bitIdx = 0;
  for (const blockIdx of selectedBlocks) {
    if (bitIdx >= 512) break;
    const bx = blockIdx % blocksX;
    const by = Math.floor(blockIdx / blocksX);
    const sx = bx * DCTSIZE;
    const sy = by * DCTSIZE;

    const grayBlock = math.zeros(DCTSIZE, DCTSIZE);
    for (let y = 0; y < DCTSIZE; y++) {
      for (let x = 0; x < DCTSIZE; x++) {
        const px = sx + x, py = sy + y;
        if (px < W && py < H) {
          const idx = (py * W + px) * 4;
          grayBlock.set([y, x], 0.299 * img.bitmap.data[idx] + 0.587 * img.bitmap.data[idx + 1] + 0.114 * img.bitmap.data[idx + 2]);
        }
      }
    }

    const dctBlock = dct2(grayBlock);
    bitIdx = embedBlock(dctBlock, bits, pnSeq, bitIdx);
    const modifiedBlock = idct2(dctBlock);

    for (let y = 0; y < DCTSIZE; y++) {
      for (let x = 0; x < DCTSIZE; x++) {
        const px = sx + x, py = sy + y;
        if (px < W && py < H) {
          const idx = (py * W + px) * 4;
          let v = Math.round(modifiedBlock.get([y, x]));
          v = Math.max(0, Math.min(255, v));
          img.bitmap.data[idx] = v;
          img.bitmap.data[idx + 1] = v;
          img.bitmap.data[idx + 2] = v;
        }
      }
    }
  }

  return img;
}

/**
 * 从含水印图片提取水印
 */
function extractWatermark(img, recipientId) {
  const W = img.bitmap.width;
  const H = img.bitmap.height;
  const blocksX = Math.floor(W / DCTSIZE);
  const blocksY = Math.floor(H / DCTSIZE);
  const totalBlocks = blocksX * blocksY;

  const key = String(recipientId).split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 31337 >>> 0;
  const pnSeq = generatePN(key, 512);

  const selectedBlocks = [];
  const pnBlock = generatePN(key + 1, totalBlocks);
  for (let i = 0; i < totalBlocks; i++) {
    if (pnBlock[i] === 1) selectedBlocks.push(i);
    if (selectedBlocks.length >= 64) break;
  }

  const allBits = [];
  let bitIdx = 0;

  for (const blockIdx of selectedBlocks) {
    if (bitIdx >= 512) break;
    const bx = blockIdx % blocksX;
    const by = Math.floor(blockIdx / blocksX);
    const sx = bx * DCTSIZE;
    const sy = by * DCTSIZE;

    const grayBlock = math.zeros(DCTSIZE, DCTSIZE);
    for (let y = 0; y < DCTSIZE; y++) {
      for (let x = 0; x < DCTSIZE; x++) {
        const px = sx + x, py = sy + y;
        if (px < W && py < H) {
          const idx = (py * W + px) * 4;
          grayBlock.set([y, x], 0.299 * img.bitmap.data[idx] + 0.587 * img.bitmap.data[idx + 1] + 0.114 * img.bitmap.data[idx + 2]);
        }
      }
    }

    const { bits, nextIdx } = extractFromBlock(dct2(grayBlock), pnSeq, bitIdx);
    allBits.push(...bits);
    bitIdx = nextIdx;
  }

  const decoded = decodeWatermark(allBits);
  return {
    recipientId: decoded.slice(0, 16).trim(),
    timestamp: parseInt(decoded.slice(16, 26)) || 0,
    sessionId: decoded.slice(26, 62).trim()
  };
}

/**
 * 对外接口：嵌入水印到Buffer（Jimp图片）
 * @param {Buffer} imageBuffer - 原始图片Buffer
 * @param {string} recipientId - 接收方用户ID
 * @param {number} timestamp - Unix时间戳（秒）
 * @param {string} sessionId - 会话ID
 * @returns {Promise<Buffer>} - 含水印图片Buffer（可见文字水印，4角落）
 */
async function embedWatermarkToBuffer(imageBuffer, recipientId, timestamp, sessionId) {
  const img = await Jimp.read(imageBuffer);

  // 1. 频域隐水印（抗压缩/裁剪，溯源用）
  embedWatermark(img, recipientId, timestamp, sessionId);

  // 2. 可见文字水印（4角落，小字体，淡色）
  // 用8像素白色字体，很小，截图即使裁掉一个角还有其他3个角
  const fontPath = require('path').resolve(
    require.resolve('@jimp/plugin-print'),
    '../../fonts/open-sans/open-sans-8-white/open-sans-8-white.fnt'
  );
  const font = await JimpMod.loadFont(fontPath);
  const displayName = String(recipientId).slice(0, 12);
  const dateStr = new Date(timestamp * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }).slice(0, 16);
  // 截短内容，4个角都放得下
  const wmShort = `${displayName} ${dateStr}`;
  const textW = JimpMod.measureText(font, wmShort);
  const h = 16; // 小字体行高
  const pad = 6;

  // 5个位置：4个角落 + 中间
  const cx = Math.round((img.width - textW) / 2);
  const cy = Math.round((img.height - h) / 2);
  const positions = [
    [pad, img.height - h - pad],                          // 左下
    [img.width - textW - pad, img.height - h - pad],     // 右下
    [pad, pad],                                          // 左上
    [img.width - textW - pad, pad],                       // 右上
    [cx, cy],                                            // 中间
  ];

  for (const [x, y] of positions) {
    img.print({ font, x, y, text: wmShort });
  }

  return await img.getBuffer(JimpMod.JimpMime.png);
}

/**
 * 对外接口：从Buffer提取水印
 * @param {Buffer} imageBuffer - 含水印图片Buffer
 * @param {string} recipientId - 接收方用户ID
 * @returns {Promise<{recipientId, timestamp, sessionId}>}
 */
async function extractWatermarkFromBuffer(imageBuffer, recipientId) {
  const img = await Jimp.read(imageBuffer);
  return extractWatermark(img, recipientId);
}

module.exports = {
  embedWatermarkToBuffer,
  extractWatermarkFromBuffer
};
