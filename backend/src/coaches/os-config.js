/**
 * OS 配置中心 - 恋爱操作系统的结构化数据
 * 被 stage-diagnosis.js / promptBuilder.js / fusion.js 引用
 */

module.exports = {
  // 1. 核心引擎 - 5条不可协商原则
  CORE_PRINCIPLES: [
    {
      id: 'framework_is_game',
      name: '框架即Game',
      definition: '框架是关系中的规则制定权——谁主动、谁付出、谁有资格提要求',
      diagnostic: '现在的框架在谁手里？是你在追逐她还是她在追逐你？',
      warning: '跪舔=框架崩溃=游戏结束。解释=掉框架=被拿捏。迎合=低位=被定义。'
    },
    {
      id: 'standard_is_dignity',
      name: '标准即尊严',
      definition: '有标准的男人才有价值。"是女的就行"是最典型的低位信号',
      diagnostic: '你有没有让她知道你有标准？她知不知道你在考察她？',
      warning: '无标准=低价值=她不需要尊重你'
    },
    {
      id: 'emotion_is_kpi',
      name: '情绪即KPI',
      definition: '持续给予好/持续温暖=无效。情绪波动=吸引',
      diagnostic: '你们的对话是平淡的还是波动的？你一直在给好还是在推拉？',
      warning: '持续温暖=无聊=被发好人卡'
    },
    {
      id: 'sequence_is_safety',
      name: '顺序即安全',
      definition: '所有关系都有阶段，跳步是最大风险',
      diagnostic: '你现在在哪个阶段？上个阶段的核心任务完成了吗？',
      warning: '跳步=女生不适应=反感/拒绝/删除'
    },
    {
      id: 'execution_is_answer',
      name: '执行即答案',
      definition: '不执行=零效果。所有大师都从街头实战出来',
      diagnostic: '你学了多少 vs 实战了多少？你的实战次数够不够？',
      warning: '只学不练=纸上谈兵'
    }
  ],

  // 2. 7阶段完整模型
  PHASES: {
    0: {
      name: '资源池',
      time: '长期',
      coreTask: '展示面建设+资源收集',
      masterTools: ['Jason', '社哥', '梵公子', '表哥'],
      exitSignal: '3-5个新资源，朋友圈前三排建好',
      deadEnd: '展示面破烂=加到微信也不回',
      leonScore: null,
      prerequisites: []
    },
    1: {
      name: '入场',
      time: '0-3天',
      coreTask: '破冰+意图表达+解决阻力',
      masterTools: ['Leon', '凯哥', '王哥'],
      exitSignal: '交换微信/联系方式，她对基本信息有回应',
      deadEnd: '开场不坚定=第一秒被pass。意图太暴露=她把你当追求者',
      leonScore: '<55放弃',
      prerequisites: ['完成资源池建设']
    },
    2: {
      name: '探测',
      time: '3-7天',
      coreTask: '评估筛选+价值展示+意愿锁定',
      masterTools: ['Leon', '乌哥', '林老头'],
      exitSignal: '她开始主动找你/回复快/语气热情/主动问问题',
      deadEnd: '价值感没建立就评估=她觉得"你是谁凭什么筛选我"',
      leonScore: '55-60',
      prerequisites: ['完成破冰', '解决对方防备心理']
    },
    3: {
      name: '升温',
      time: '1-2周',
      coreTask: '情绪推拉+叙事建立信任',
      masterTools: ['表哥', '童锦程', '林老头', 'Leon'],
      exitSignal: '她接受暧昧/主动调情/愿意出来/情绪不稳定',
      deadEnd: '理性判断没过就拉情绪=小丑。叙事太早=暴露狂',
      leonScore: '60-70',
      prerequisites: ['完成价值展示', '确认对方有意愿继续']
    },
    4: {
      name: '确认',
      time: '2-4周',
      coreTask: '【分叉点】选短轨或长轨',
      masterTools: { short: ['OS路由-短'], long: ['OS路由-长'] },
      exitSignal: null,
      deadEnd: '混用短轨和长轨=必败',
      leonScore: '70+',
      trackDecision: true,
      prerequisites: ['建立情绪连接', '信任感初步建立']
    },
    5: {
      name: '确立',
      time: '关系确认后',
      coreTask: '短轨=速约收尾 / 长轨=关系锁定',
      masterTools: { short: ['表哥', '熊哥', 'Leon'], long: ['梵公子', 'Leon', '童锦程'] },
      exitSignal: null,
      deadEnd: '收尾后纠缠不放=变成供养者',
      leonScore: null,
      trackDecision: true,
      prerequisites: ['双方明确关系意愿']
    },
    6: {
      name: '经营',
      time: '关系确立后',
      coreTask: '短轨=撤退策略 / 长轨=长期维护',
      masterTools: { short: ['表哥', '熊哥'], long: ['梵公子', 'Leon', '许诺', '脱不花'] },
      exitSignal: null,
      deadEnd: '短轨当长轨经营=浪费时间；长轨低位=变供养者',
      leonScore: null,
      trackDecision: true,
      prerequisites: ['关系已确立']
    }
  },

  // 3. IOI/IoD判断标准
  SIGNAL_IOI: [
    { type: '回复速度', positive: '秒回/几分钟内', negative: '几小时/隔天' },
    { type: '回复长度', positive: '比你长/主动延伸话题', negative: '比你短/嗯/哦/好' },
    { type: '主动性', positive: '主动找你/主动问问题', negative: '只回复不提问' },
    { type: '情绪投入', positive: '发语音/表情包/分享日常', negative: '纯文字/公事公办' },
    { type: '服从性', positive: '愿意改时间/接受小要求', negative: '每次都推脱' },
    { type: '社交媒体', positive: '点赞你朋友圈/主动看故事', negative: '从不互动' }
  ],

  // 4. 轨道决策树
  TRACK_DECISION: {
    short_keywords: ['短期', '一夜情', '玩一玩', '先处处看', '不认真'],
    long_keywords: ['认真', '长期', '找女朋友', '以结婚为目的', '认真交往'],
    ambivalent_keywords: ['不知道', '还没想好', '看情况'],
    rule: '不选择=混乱，混用=必败。短轨长轨是两个独立系统'
  },

  // 5. 推拉模板
  PULL_PUSH_TEMPLATE: [
    { scenario: '她问"你喜欢我什么"', push: '你别太自信啊', pull: '不过你确实有特别的地方' },
    { scenario: '她说"你是不是对谁都这样"', push: '你觉得呢？', pull: '当然不是，我只对有趣的人这样' },
    { scenario: '她发照片', push: '这照片P了多久？', pull: '不过底子确实不错' },
    { scenario: '她迟到', push: '我等你的时间够喝两杯咖啡了', pull: '不过看到你心情就好了' }
  ],

  // 6. DB stage 字符串 → Phase 数字映射
  DB_STAGE_MAP: {
    '陌生': 0,
    '搭讪': 0,
    '聊天': 2,
    '暧昧': 3,
    '约会': 4,
    '长期': 5
  },

  // 7. 阶段速查表
  PHASE_CHEAT_SHEET: [
    { phase: 0, name: '资源池', leonScore: '-', core: '展示面+资源', warning: '展示面破烂=别聊了' },
    { phase: 1, name: '入场', leonScore: '<55放弃', core: '破冰+意图', warning: '开场不坚定=被pass' },
    { phase: 2, name: '探测', leonScore: '55-60', core: '评估+价值', warning: '价值不够就评估=反噬' },
    { phase: 3, name: '升温', leonScore: '60-70', core: '推拉+叙事', warning: '理性没过就拉情绪=小丑' },
    { phase: 4, name: '确认', leonScore: '70+', core: '【选短/长】', warning: '混用轨道=必败' },
    { phase: 5, name: '确立', leonScore: '-', core: '短=速约/长=锁定', warning: '用错方法=翻车' },
    { phase: 6, name: '经营', leonScore: '-', core: '短=撤退/长=维护', warning: '短轨当长轨=浪费时间' }
  ]
};