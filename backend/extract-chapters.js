/**
 * 从 Mo哥宝典-完整版v33.md 提取章节内容写入数据库
 */
const fs = require('fs');
const path = require('path');
const prisma = require('./src/prisma');

const MD_FILE = '/home/admin/mo-ge-core/Mo哥宝典-完整版v33.md';

async function extractAndUpdate() {
  console.log('读取 Markdown 文件...');
  const content = fs.readFileSync(MD_FILE, 'utf-8');
  const lines = content.split('\n');

  // 找到所有章节的起始行
  const chapterStarts = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^# 第 (\d+) 章/);
    if (match) {
      chapterStarts.push({ num: parseInt(match[1]), line: i });
    }
  }
  console.log(`找到 ${chapterStarts.length} 个章节`);

  // 提取每章内容
  for (let i = 0; i < chapterStarts.length; i++) {
    const { num, line: startLine } = chapterStarts[i];
    const endLine = i < chapterStarts.length - 1 ? chapterStarts[i + 1].line : lines.length;

    // 提取章节内容（从标题行开始，到下一章之前）
    const chapterLines = lines.slice(startLine, endLine);

    // 移除"下一章"的链接行（最后一行通常是下一章链接）
    let endIdx = chapterLines.length;
    for (let j = chapterLines.length - 1; j >= 0; j--) {
      if (chapterLines[j].match(/\*\*下一章\*\*/)) {
        endIdx = j;
        break;
      }
      if (chapterLines[j].match(/^# 第 \d+ 章/)) {
        break;
      }
    }
    const cleanLines = chapterLines.slice(0, endIdx);

    // 组合成文本
    const chapterContent = cleanLines.join('\n').trim();

    // 格式化为 Markdown（保留标题格式）
    let formatted = chapterContent
      // 移除文件链接
      .replace(/\[第 \d+ 章 [^\]]+\]\([^)]+\.md\)/g, '')
      // 移除多余空行（超过2个的）
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // 更新数据库
    const chapterId = num.toString().padStart(2, '0');
    try {
      await prisma.learningChapter.update({
        where: { chapterId },
        data: { content: formatted }
      });
      console.log(`  ✅ 章节 ${chapterId} 已更新 (${chapterContent.length} 字符)`);
    } catch (err) {
      console.log(`  ❌ 章节 ${chapterId} 更新失败:`, err.message);
    }
  }

  console.log('\n完成！');
}

extractAndUpdate()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('失败:', err);
    process.exit(1);
  });
