/**
 * 初始化学习章节数据
 * 从 Mo哥宝典-完整版v33.md 提取20章结构写入数据库
 */
const prisma = require('./src/prisma');

const CHAPTERS = [
  { chapterId: '01', title: '心态建设', subtitle: '核心原则 · 心态自检 · 案例', orderIndex: 1 },
  { chapterId: '02', title: '吸引力科学', subtitle: '情绪价值 · 生存价值 · 窗口识别', orderIndex: 2 },
  { chapterId: '03', title: '法律风险与道德边界', subtitle: '绝对红线 · 高危行为 · 自我保护', orderIndex: 3 },
  { chapterId: '04', title: '沟通与共情', subtitle: '女性核心需求 · 共情技巧 · 倾听', orderIndex: 4 },
  { chapterId: '05', title: '社交软件实战', subtitle: '头像包装 · 搭讪话术 · 话题延续', orderIndex: 5 },
  { chapterId: '06', title: '获取资源', subtitle: '搭讪技巧 · 渠道选择 · 资源积累', orderIndex: 6 },
  { chapterId: '07', title: '形象打造', subtitle: '穿着风格 · 发型造型 · 照片拍摄', orderIndex: 7 },
  { chapterId: '08', title: '沟通吸引', subtitle: '话术设计 · 幽默运用 · 情绪调动', orderIndex: 8 },
  { chapterId: '09', title: '语音推进', subtitle: '语音消息 · 电话技巧 · 暧昧升温', orderIndex: 9 },
  { chapterId: '10', title: '优质女生攻略', subtitle: '高价值女生 · 应对策略 · 差异化', orderIndex: 10 },
  { chapterId: '11', title: '直接邀约', subtitle: '邀约时机 · 话术模板 · 应对拒绝', orderIndex: 11 },
  { chapterId: '12', title: '日间约会', subtitle: '咖啡约会 · 逛街技巧 · 话题储备', orderIndex: 12 },
  { chapterId: '13', title: '晚上约会', subtitle: '晚餐安排 · 私密空间 · 亲密升级', orderIndex: 13 },
  { chapterId: '14', title: '群体社交', subtitle: '组局技巧 · 社交认证 · 展示面', orderIndex: 14 },
  { chapterId: '15', title: '私密进阶', subtitle: '身体语言 · 亲密边界 · 长期关系', orderIndex: 15 },
  { chapterId: '16', title: '避坑指南', subtitle: '绿茶识别 · 备胎判断 · 防骗技巧', orderIndex: 16 },
  { chapterId: '17', title: '常见问题', subtitle: '回复话术 · 瓶颈应对 · 心态调整', orderIndex: 17 },
  { chapterId: '18', title: '实战案例', subtitle: '完整流程 · 成功复盘 · 失败教训', orderIndex: 18 },
  { chapterId: '19', title: '长期关系', subtitle: '维护技巧 · 矛盾处理 · 承诺与信任', orderIndex: 19 },
  { chapterId: '20', title: '防骗指南', subtitle: '酒托饭托 · 仙人跳 · 杀猪盘识别', orderIndex: 20 }
];

async function seedChapters() {
  console.log('开始初始化学习章节...');
  for (const chapter of CHAPTERS) {
    const existing = await prisma.learningChapter.findUnique({
      where: { chapterId: chapter.chapterId }
    });

    if (existing) {
      console.log(`  章节 ${chapter.chapterId} 已存在，跳过`);
    } else {
      await prisma.learningChapter.create({ data: chapter });
      console.log(`  创建章节: ${chapter.chapterId} - ${chapter.title}`);
    }
  }
  console.log('学习章节初始化完成！');
}

seedChapters()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('初始化失败:', err);
    process.exit(1);
  });