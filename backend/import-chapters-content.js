/**
 * 从 Mo哥宝典-完整版v33.md 导入章节内容到数据库
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const MARKDOWN_FILE = '/home/admin/mo-ge-core/Mo哥宝典-完整版v33.md';

// 章节ID映射（文件中的章节名 -> 数据库chapterId）
const CHAPTER_MAP = {
  '第 1 章 心态建设': '01',
  '第 2 章 吸引力科学': '02',
  '第 3 章 法律风险与道德边界': '03',
  '第 4 章 沟通与共情': '04',
  '第 5 章 社交软件实战': '05',
  '第 6 章 获取资源': '06',
  '第 7 章 形象打造': '07',
  '第 8 章 沟通吸引': '08',
  '第 9 章 语音推进': '09',
  '第 10 章 优质女生攻略': '10',
  '第 11 章 直接邀约': '11',
  '第 12 章 日间约会': '12',
  '第 13 章 晚上约会': '13',
  '第 14 章 群体社交': '14',
  '第 15 章 私密进阶': '15',
  '第 16 章 避坑指南': '16',
  '第 17 章 常见问题': '17',
  '第 18 章 实战案例': '18',
  '第 19 章 长期关系': '19',
  '第 20 章 防骗指南': '20',
};

async function importContent() {
  console.log('开始导入章节内容...');

  // 读取markdown文件
  const content = fs.readFileSync(MARKDOWN_FILE, 'utf-8');
  const lines = content.split('\n');

  let currentChapterId = null;
  let currentContent = [];
  const chaptersContent = {};

  // 找到所有章节标题的位置
  const chapterStarts = [];
  for (let i = 0; i < lines.length; i++) {
    for (const [chapterTitle, chapterId] of Object.entries(CHAPTER_MAP)) {
      if (lines[i].trim() === `# ${chapterTitle}`) {
        chapterStarts.push({ line: i, title: chapterTitle, chapterId });
        break;
      }
    }
  }

  console.log(`找到 ${chapterStarts.length} 个章节`);
  chapterStarts.forEach((cs, idx) => {
    const nextLine = chapterStarts[idx + 1]?.line || lines.length;
    const chapterContent = lines.slice(cs.line, nextLine).join('\n');
    chaptersContent[cs.chapterId] = chapterContent;
    console.log(`  ${cs.chapterId}: 行${cs.line}-${nextLine}, 内容长度=${chapterContent.length}`);
  });

  // 更新数据库
  let updated = 0;
  for (const [chapterId, chapterContent] of Object.entries(chaptersContent)) {
    if (!chapterContent || chapterContent.length < 100) {
      console.log(`跳过章节 ${chapterId}，内容太短`);
      continue;
    }

    const result = await prisma.learningChapter.update({
      where: { chapterId },
      data: { content: chapterContent }
    });
    updated++;
    console.log(`更新章节 ${chapterId}: ${result.title} (${chapterContent.length} 字符)`);
  }

  console.log(`\n导入完成！共更新 ${updated} 个章节`);

  // 验证
  const chapters = await prisma.learningChapter.findMany({
    orderBy: { orderIndex: 'asc' }
  });
  console.log('\n验证结果:');
  chapters.forEach(c => {
    console.log(`  ${c.chapterId} ${c.title}: content长度=${c.content?.length || 0}`);
  });
}

importContent()
  .then(() => prisma.$disconnect())
  .catch(err => {
    console.error('导入失败:', err);
    prisma.$disconnect();
    process.exit(1);
  });
