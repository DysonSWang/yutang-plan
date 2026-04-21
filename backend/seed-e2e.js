/**
 * E2E 测试数据种子脚本
 * 为 cl_e2e 用户创建丰富的测试数据（女生、约会、聊天截图等）
 *
 * 用法: node seed-e2e.js
 */
const { PrismaClient } = require('./node_modules/@prisma/client');

const prisma = new PrismaClient();

const CLIENT_USERNAME = 'cl_e2e';

async function main() {
  // 找到 cl_e2e 用户
  const client = await prisma.user.findUnique({
    where: { username: CLIENT_USERNAME },
  });
  if (!client) {
    console.error(`User "${CLIENT_USERNAME}" not found!`);
    process.exit(1);
  }
  console.log(`Seeding data for client: ${client.username} (${client.id})`);

  // 清理 cl_e2e 现有的测试数据（保留用户）
  // 先找出现有女生，再删除关联数据
  const existingGirls = await prisma.girl.findMany({ where: { clientId: client.id }, select: { id: true } });
  const existingGirlIds = existingGirls.map((g) => g.id);

  if (existingGirlIds.length > 0) {
    await prisma.date.deleteMany({ where: { girlId: { in: existingGirlIds } } });
    await prisma.chatScreenshot.deleteMany({ where: { girlId: { in: existingGirlIds } } });
    await prisma.chatLog.deleteMany({ where: { girlId: { in: existingGirlIds } } });
  }
  await prisma.date.deleteMany({ where: { userId: client.id } });
  await prisma.serviceProgress.deleteMany({ where: { userId: client.id } });
  await prisma.notification.deleteMany({ where: { userId: client.id } });
  await prisma.girl.deleteMany({ where: { clientId: client.id } });
  console.log('Cleared existing cl_e2e data.');

  // ─── 创建女生资源池 ───────────────────────────────────────────────
  const girlsData = [
    {
      name: '林小雨',
      age: 24,
      occupation: '互联网产品经理',
      education: '本科',
      major: '计算机',
      hometown: '浙江杭州',
      residence: '上海浦东',
      workplace: '陆家嘴某科技公司',
      appearance: '清秀甜美，长发及腰，皮肤白皙，眼睛很大',
      height: 163,
      bodyType: '标准',
      photos: JSON.stringify(['https://i.pravatar.cc/300?img=1', 'https://i.pravatar.cc/300?img=2']),
      styleTags: '精致,小资,文艺',
      familyBackground: '城市',
      familyAtmosphere: '和睦',
      familyBurden: '无',
      workSchedule: '朝九晚六',
      socialActivity: '中',
      financialHabits: '月光',
      interests: '摄影、旅行、咖啡',
      dietPreferences: '清淡,日料',
      relationshipAttitude: '认真',
      pastRelationshipSummary: '有过一段三年的校园恋情，已分手两年',
      attachmentStyle: '安全',
      dealbreakers: '不接受异地、不接受大男子主义',
      stage: '暧昧',
      status: 'chatting',
      intimacyLevel: 3,
      tensionScore: 7.5,
      lastContact: new Date('2026-04-18'),
      responsePattern: '秒回',
      signals: JSON.stringify([{ date: '2026-04-15', type: 'positive', event: '主动分享工作日常' }]),
      observations: JSON.stringify([{ date: '2026-04-10', note: '提到想找稳定关系' }]),
      bestApproach: '温柔细腻型',
      recommendedTopics: '旅行见闻、摄影技巧、宠物',
      upgradeConditions: '多关心她的工作压力',
      riskFactors: '对感情谨慎，需要时间建立信任',
    },
    {
      name: '王思琪',
      age: 26,
      occupation: '时尚编辑',
      education: '硕士',
      major: '艺术设计',
      hometown: '四川成都',
      residence: '上海静安',
      workplace: '杂志社',
      appearance: '高挑时尚，五官精致，气质出众',
      height: 170,
      bodyType: '偏瘦',
      photos: JSON.stringify(['https://i.pravatar.cc/300?img=3', 'https://i.pravatar.cc/300?img=4']),
      styleTags: '时尚,精致,高冷',
      familyBackground: '城市',
      familyAtmosphere: '和睦',
      familyBurden: '无',
      workSchedule: '弹性工作',
      socialActivity: '高',
      financialHabits: '超前消费',
      interests: '时尚、艺术展、健身',
      dietPreferences: '西餐,日料',
      relationshipAttitude: '认真',
      pastRelationshipSummary: '有过一段两年的感情，因对方劈腿分手',
      attachmentStyle: '焦虑',
      dealbreakers: '不接受妈宝男',
      stage: '约会',
      status: 'dating',
      intimacyLevel: 4,
      tensionScore: 8.2,
      lastContact: new Date('2026-04-19'),
      responsePattern: '慢（工作忙）',
      signals: JSON.stringify([{ date: '2026-04-17', type: 'positive', event: '主动约下次见面' }]),
      observations: JSON.stringify([{ date: '2026-04-16', note: '提到喜欢浪漫的氛围' }]),
      bestApproach: '霸道温柔型',
      recommendedTopics: '艺术展览、健身心得、美食',
      upgradeConditions: '制造浪漫惊喜',
      riskFactors: '工作忙碌，可能忽冷忽热',
    },
    {
      name: '陈婷婷',
      age: 22,
      occupation: '幼儿园教师',
      education: '本科',
      major: '学前教育',
      hometown: '江苏南京',
      residence: '上海闵行',
      workplace: '某幼儿园',
      appearance: '清纯可爱，圆脸，爱笑',
      height: 158,
      bodyType: '标准',
      photos: JSON.stringify(['https://i.pravatar.cc/300?img=5', 'https://i.pravatar.cc/300?img=6']),
      styleTags: '清纯,邻家,可爱',
      familyBackground: '城市',
      familyAtmosphere: '和睦',
      familyBurden: '无',
      workSchedule: '朝八晚五',
      socialActivity: '低',
      financialHabits: '务实',
      interests: '烹饪、手工、宠物',
      dietPreferences: '清淡,家常菜',
      relationshipAttitude: '认真',
      pastRelationshipSummary: '没有正式交往过，这是第一次认真相亲',
      attachmentStyle: '安全',
      dealbreakers: '不接受花心男生',
      stage: '搭讪',
      status: 'available',
      intimacyLevel: 1,
      tensionScore: 5.0,
      lastContact: new Date('2026-04-20'),
      responsePattern: '秒回',
      signals: JSON.stringify([]),
      observations: JSON.stringify([]),
      bestApproach: '真诚直接型',
      recommendedTopics: '小朋友趣事、烹饪、宠物',
      upgradeConditions: '多约出来见面',
      riskFactors: '比较害羞，需要耐心',
    },
    {
      name: '张晓燕',
      age: 28,
      occupation: '金融分析师',
      education: '硕士',
      major: '金融学',
      hometown: '北京',
      residence: '上海徐汇',
      workplace: '陆家嘴某投行',
      appearance: '知性优雅，职业感强，气场足',
      height: 165,
      bodyType: '标准',
      photos: JSON.stringify(['https://i.pravatar.cc/300?img=7', 'https://i.pravatar.cc/300?img=8']),
      styleTags: '职业,知性,干练',
      familyBackground: '城市',
      familyAtmosphere: '和睦',
      familyBurden: '无',
      workSchedule: '经常加班',
      socialActivity: '中',
      financialHabits: '务实',
      interests: '滑雪、潜水、读书',
      dietPreferences: '健康餐',
      relationshipAttitude: '认真',
      pastRelationshipSummary: '有过一段三年的感情，因异地分手',
      attachmentStyle: '回避',
      dealbreakers: '不接受不成熟的人',
      stage: '聊天',
      status: 'chatting',
      intimacyLevel: 2,
      tensionScore: 6.0,
      lastContact: new Date('2026-04-16'),
      responsePattern: '慢',
      signals: JSON.stringify([{ date: '2026-04-14', type: 'neutral', event: '回复比较简短' }]),
      observations: JSON.stringify([{ date: '2026-04-13', note: '工作很忙，对感情比较谨慎' }]),
      bestApproach: '调理型+尊重空间',
      recommendedTopics: '金融行业、职业发展、滑雪',
      upgradeConditions: '不要过于频繁联系，给她空间',
      riskFactors: '工作狂，可能忽视感情',
    },
    {
      name: '李雪梅',
      age: 25,
      occupation: '医生',
      education: '硕士',
      major: '临床医学',
      hometown: '湖北武汉',
      residence: '上海长宁',
      workplace: '某三甲医院',
      appearance: '温柔大方，气质干净',
      height: 162,
      bodyType: '标准',
      photos: JSON.stringify(['https://i.pravatar.cc/300?img=9', 'https://i.pravatar.cc/300?img=10']),
      styleTags: '简约,干净,大方',
      familyBackground: '城市',
      familyAtmosphere: '和睦',
      familyBurden: '有（父母经商）',
      workSchedule: '轮班制',
      socialActivity: '低',
      financialHabits: '务实',
      interests: '瑜伽、烹饪、古典音乐',
      dietPreferences: '清淡,健康',
      relationshipAttitude: '认真',
      pastRelationshipSummary: '有过一段两年感情，因对方不成熟分手',
      attachmentStyle: '安全',
      dealbreakers: '不接受不尊重医生职业的人',
      stage: '长期',
      status: 'long_term',
      intimacyLevel: 5,
      tensionScore: 9.0,
      lastContact: new Date('2026-04-20'),
      responsePattern: '秒回',
      signals: JSON.stringify([{ date: '2026-04-19', type: 'positive', event: '主动提出见家长' }]),
      observations: JSON.stringify([{ date: '2026-04-18', note: '对这段关系很认真' }]),
      bestApproach: '温柔体贴型',
      recommendedTopics: '医疗科普、生活健康、美食',
      upgradeConditions: '稳定发展，注重长期关系维护',
      riskFactors: '工作轮班，可能约会时间不固定',
    },
  ];

  const girls = await Promise.all(
    girlsData.map((g) =>
      prisma.girl.create({
        data: {
          ...g,
          clientId: client.id,
        },
      })
    )
  );
  console.log(`Created ${girls.length} girls.`);

  // ─── 创建约会 ─────────────────────────────────────────────────────
  const [linxiaoyu, wangsiqi, chentingting, zhangxiaoyan, lixuemei] = girls;

  const datesData = [
    // 待策划约会（林小雨）
    {
      userId: client.id,
      girlId: linxiaoyu.id,
      dateTime: new Date('2026-04-25T19:00:00'),
      title: '第一次正式约会',
      location: '外滩某西餐厅',
      status: 'pending_plan',
      notes: '希望氛围浪漫一些，她喜欢摄影',
      planStatus: 'pending',
    },
    // 待客户确认（王思琪）
    {
      userId: client.id,
      girlId: wangsiqi.id,
      dateTime: new Date('2026-04-26T20:00:00'),
      title: '艺术展约会',
      location: '上海当代艺术博物馆',
      status: 'pending_client_confirm',
      notes: '她对艺术展很感兴趣，提前买了票',
      aiPlan: JSON.stringify({
        overview: '下午艺术展 + 晚上意大利餐厅',
        venue: 'PSA + 附近意大利餐厅',
        schedule: '14:00 艺术展，18:00 晚餐',
        talkingPoints: ['艺术作品感想', '旅行见闻', '未来规划'],
        precautions: '不要迟到，她很准时',
        outfit: '商务休闲',
        budgetTips: '艺术展门票150/位，晚餐预算500-800',
      }),
      planStatus: 'generated',
      clientConfirmed: false,
      pushToClientAt: new Date('2026-04-19T10:00:00'),
    },
    // 已确认方案（张晓燕）
    {
      userId: client.id,
      girlId: zhangxiaoyan.id,
      dateTime: new Date('2026-04-27T18:30:00'),
      title: '周末晚餐',
      location: '新天地某餐厅',
      status: 'planned',
      notes: '她喜欢安静的环境',
      aiPlan: JSON.stringify({
        overview: '环境优雅的日料店晚餐',
        venue: '新天地日料',
        schedule: '18:30 晚餐',
        talkingPoints: ['工作近况', '滑雪经历', '生活态度'],
        precautions: '不要聊得太沉重，保持轻松',
        outfit: '商务休闲',
        budgetTips: '人均400-600',
      }),
      planStatus: 'generated',
      clientConfirmed: true,
      confirmedAt: new Date('2026-04-20T09:00:00'),
    },
    // 已完成约会（李雪梅）
    {
      userId: client.id,
      girlId: lixuemei.id,
      dateTime: new Date('2026-04-10T19:00:00'),
      title: '周末约会',
      location: '法租界某餐厅',
      status: 'completed',
      notes: '约会非常顺利',
      aiPlan: JSON.stringify({
        overview: '法租界浪漫晚餐',
        venue: '法租界',
        schedule: '19:00 晚餐',
        talkingPoints: ['工作', '生活', '未来'],
        precautions: '保持绅士风度',
        outfit: '商务休闲',
        budgetTips: '人均500',
      }),
      planStatus: 'generated',
      clientConfirmed: true,
      confirmedAt: new Date('2026-04-08T10:00:00'),
      totalExpense: 680,
      duration: '2.5小时',
      rating: 5,
      positiveSignals: JSON.stringify([
        { signal: '主动牵手', note: '约会结束时自然牵手' },
        { signal: '表达认可', note: '说很享受这次约会' },
      ]),
      negativeSignals: JSON.stringify([]),
      followUpActions: JSON.stringify([{ action: '继续每天微信关心', priority: '高', deadline: '2026-04-11' }]),
      postNotes: '约会非常成功，她对我印象很好，当晚聊天明显比平时更主动。',
      girlStageAfter: '长期',
    },
    // 已完成约会（陈婷婷）
    {
      userId: client.id,
      girlId: chentingting.id,
      dateTime: new Date('2026-04-12T14:00:00'),
      title: '第一次见面',
      location: '公园',
      status: 'completed',
      notes: '第一次线下见面',
      aiPlan: JSON.stringify({
        overview: '公园散步 + 咖啡',
        venue: '世纪公园',
        schedule: '14:00 公园散步，16:00 咖啡',
        talkingPoints: ['工作日常', '兴趣爱好', '生活习惯'],
        precautions: '她比较害羞，不要太激进',
        outfit: '休闲干净',
        budgetTips: '人均100以内',
      }),
      planStatus: 'generated',
      clientConfirmed: true,
      confirmedAt: new Date('2026-04-11T10:00:00'),
      totalExpense: 120,
      duration: '3小时',
      rating: 4,
      positiveSignals: JSON.stringify([
        { signal: '全程保持微笑', note: '没有尴尬冷场' },
        { signal: '愿意交换微信', note: '当场加了微信' },
      ]),
      negativeSignals: JSON.stringify([{ signal: '略微紧张', note: '第一次见面可以理解' }]),
      followUpActions: JSON.stringify([{ action: '保持每天联系', priority: '高', deadline: '2026-04-13' }]),
      postNotes: '第一次见面很顺利，她比较害羞但愿意继续了解。',
    },
  ];

  const dates = await Promise.all(datesData.map((d) => prisma.date.create({ data: d })));
  console.log(`Created ${dates.length} dates.`);

  // ─── 创建聊天截图 ─────────────────────────────────────────────────
  const screenshotsData = [
    {
      girlId: linxiaoyu.id,
      clientId: client.id,
      operatorId: '0993b9fa-5ee2-40fc-b4ad-680e156e085d',
      imageUrl: 'https://i.pravatar.cc/400?img=11',
      chatText: '男：周末有空吗？想约你吃饭\n女：周六可以呀，你想去哪里？\n男：外滩那边有家西餐厅评价不错\n女：好的，期待~',
      notes: '小雨主动确认时间',
      platform: '微信',
    },
    {
      girlId: linxiaoyu.id,
      clientId: client.id,
      operatorId: '0993b9fa-5ee2-40fc-b4ad-680e156e085d',
      imageUrl: 'https://i.pravatar.cc/400?img=12',
      chatText: '女：今天加班好累...\n男：辛苦啦，注意休息\n女：谢谢~有你在真好\n男：😊',
      notes: '小雨表达好感',
      platform: '微信',
    },
    {
      girlId: wangsiqi.id,
      clientId: client.id,
      operatorId: '0993b9fa-5ee2-40fc-b4ad-680e156e085d',
      imageUrl: 'https://i.pravatar.cc/400?img=13',
      chatText: '女：你怎么知道我最近在看那个展！\n男：我猜的，因为上次你说对当代艺术感兴趣\n女：哈哈好细心啊',
      notes: '思琪对艺术展约会很期待',
      platform: '微信',
    },
    {
      girlId: wangsiqi.id,
      clientId: client.id,
      operatorId: '0993b9fa-5ee2-40fc-b4ad-680e156e085d',
      imageUrl: 'https://i.pravatar.cc/400?img=14',
      chatText: '女：下周时间确定了吗？\n男：确定了，周六下午两点\n女：好的，我把时间空出来',
      notes: '思琪确认约会时间',
      platform: '微信',
    },
    {
      girlId: chentingting.id,
      clientId: client.id,
      operatorId: '0993b9fa-5ee2-40fc-b4ad-680e156e085d',
      imageUrl: 'https://i.pravatar.cc/400?img=15',
      chatText: '男：见到你很开心\n女：我也是，今天玩得很开心\n男：那我们下次再约？\n女：好的呀~',
      notes: '婷婷首次见面后表示愿意继续',
      platform: '微信',
    },
    {
      girlId: zhangxiaoyan.id,
      clientId: client.id,
      operatorId: '0993b9fa-5ee2-40fc-b4ad-680e156e085d',
      imageUrl: 'https://i.pravatar.cc/400?img=16',
      chatText: '男：最近工作忙吗？\n女：挺忙的，最近在做一个大项目\n男：加油，有空多休息\n女：谢谢关心',
      notes: '晓燕回复较慢但有礼貌',
      platform: '微信',
    },
    {
      girlId: lixuemei.id,
      clientId: client.id,
      operatorId: '0993b9fa-5ee2-40fc-b4ad-680e156e085d',
      imageUrl: 'https://i.pravatar.cc/400?img=17',
      chatText: '女：昨晚的约会真的很开心\n男：我也是，感觉和你在一起很舒服\n女：我也是这么想的\n男：那我们这周末再见面？\n女：好啊，我想去那个新开的餐厅',
      notes: '雪梅对关系进展很满意',
      platform: '微信',
    },
  ];

  await Promise.all(screenshotsData.map((s) => prisma.chatScreenshot.create({ data: s })));
  console.log(`Created ${screenshotsData.length} chat screenshots.`);

  // ─── 创建服务进度 ─────────────────────────────────────────────────
  const progressData = [
    { userId: client.id, stage: 1, stageName: '背调建池', status: 'completed', amountPaid: 5000, paidAt: new Date('2026-03-01') },
    { userId: client.id, stage: 2, stageName: '约会策划', status: 'in_progress', amountPaid: 8000, paidAt: new Date('2026-03-15') },
    { userId: client.id, stage: 3, stageName: '锁定关系', status: 'pending', amountPaid: null },
    { userId: client.id, stage: 4, stageName: '关系维护', status: 'pending', amountPaid: null },
  ];

  await Promise.all(progressData.map((p) => prisma.serviceProgress.create({ data: p })));
  console.log(`Created ${progressData.length} service progress records.`);

  // ─── 创建通知 ─────────────────────────────────────────────────────
  const notificationsData = [
    {
      userId: client.id,
      type: 'date_plan',
      title: '新约会方案待确认',
      content: '艺术展约会方案已生成，请查看并确认。',
      metadata: JSON.stringify({ dateId: dates[1].id, girlId: wangsiqi.id }),
    },
    {
      userId: client.id,
      type: 'girl_update',
      title: '女生状态更新',
      content: '林小雨已进入暧昧阶段，关系热度上升。',
      metadata: JSON.stringify({ girlId: linxiaoyu.id }),
    },
    {
      userId: client.id,
      type: 'ai_insight',
      title: 'AI战略建议',
      content: '根据聊天分析，王思琪适合霸道温柔型接触策略。',
      metadata: JSON.stringify({ girlId: wangsiqi.id }),
    },
    {
      userId: client.id,
      type: 'date_reminder',
      title: '约会提醒',
      content: '你有一个已确认的约会：周末晚餐（张晓燕），记得提前准备。',
      metadata: JSON.stringify({ dateId: dates[2].id }),
    },
  ];

  await Promise.all(notificationsData.map((n) => prisma.notification.create({ data: n })));
  console.log(`Created ${notificationsData.length} notifications.`);

  // ─── 创建一些代聊记录 ─────────────────────────────────────────────
  const chatLogsData = [
    {
      girlId: linxiaoyu.id,
      clientId: client.id,
      operatorId: '0993b9fa-5ee2-40fc-b4ad-680e156e085d',
      receiverName: '林小雨',
      content: '今天加班到好晚，感觉整个办公室就剩我一个人了',
      type: 'text',
      aiAnalysis: '她在表达工作疲劳，可能需要关心',
      aiSuggestions: '建议：表达理解和关心，不要过于热情',
      aiAdopted: true,
    },
    {
      girlId: linxiaoyu.id,
      clientId: client.id,
      operatorId: '0993b9fa-5ee2-40fc-b4ad-680e156e085d',
      receiverName: '林小雨',
      content: '辛苦啦，抱抱～记得早点休息',
      type: 'text',
      aiAdopted: false,
    },
    {
      girlId: wangsiqi.id,
      clientId: client.id,
      operatorId: '0993b9fa-5ee2-40fc-b4ad-680e156e085d',
      receiverName: '王思琪',
      content: '对了，你平时有什么爱好呀？',
      type: 'text',
      aiAnalysis: '开启话题，了解她的兴趣爱好',
      aiSuggestions: '可以聊艺术、旅行、健身等话题',
      aiAdopted: true,
    },
    {
      girlId: lixuemei.id,
      clientId: client.id,
      operatorId: '0993b9fa-5ee2-40fc-b4ad-680e156e085d',
      receiverName: '李雪梅',
      content: '昨天的约会真的很开心，谢谢你带我去那家餐厅',
      type: 'text',
      aiAnalysis: '她主动表达约会感受，是非常好的信号',
      aiSuggestions: '可以趁机表达对关系的期待',
      aiAdopted: true,
    },
  ];

  await Promise.all(chatLogsData.map((c) => prisma.chatLog.create({ data: c })));
  console.log(`Created ${chatLogsData.length} chat logs.`);

  console.log('\n✅ E2E seed data created successfully!');
  console.log(`   Client: ${client.username}`);
  console.log(`   Girls: ${girls.length}`);
  console.log(`   Dates: ${dates.length}`);
  console.log(`   Screenshots: ${screenshotsData.length}`);
  console.log(`   Notifications: ${notificationsData.length}`);
  console.log(`   Chat logs: ${chatLogsData.length}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
