/**
 * 信号提取服务 - 自动分析聊天截图/备注，提取关键信号并更新女生档案
 * 使用 Mo哥 + 童锦程 的 AI 配置风格
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { getAIConfig, getVLModelConfig, BASE_URL } = require('../config');

/**
 * 尝试修复 AI 返回的非标准 JSON（处理 markdown 代码块、尾部逗号、多余换行等）
 * @param {string} raw - AI 返回的原始文本
 * @returns {object|null} 解析后的对象，或 null
 */
function repairJSON(raw) {
  // 去掉 markdown 代码块包裹
  let cleaned = raw
    .replace(/```json\n?/gi, '')
    .replace(/```\n?/g, '')
    .trim();

  // 去掉常见的尾部垃圾（AI 幻觉的说明文字）
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonEnd > 0 && jsonEnd < cleaned.length - 1) {
    cleaned = cleaned.substring(0, jsonEnd + 1);
  }

  // 去掉单行注释（// 开头）
  cleaned = cleaned.replace(/\/\/.*$/gm, '');

  // 修复尾部逗号
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

  try {
    return JSON.parse(cleaned);
  } catch (e1) {
    // 二次尝试：去掉所有非 ASCII 字符再试
    try {
      // 处理中文引号
      const fixed = cleaned
        .replace(/[""]/g, '"')
        .replace(/['']/g, "'")
        .replace(/，/g, ',')
        .replace(/：/g, ':');
      return JSON.parse(fixed);
    } catch (e2) {
      console.error('[SignalExtractor] JSON repair failed:', e2.message, '| raw:', raw.substring(0, 200));
      return null;
    }
  }
}

// VL 模型配置（用于图片分析）- 统一使用 qwen3.6-plus
const VL_MODEL = 'qwen-vl-plus';

const IMAGE_ANALYSIS_PROMPT = `你是童锦程，两性关系专家，情感老中医。你的风格：接地气，有温度，懂人心，有经验。

分析以下聊天截图，提取关键信息并更新女生档案。

【截图图片内容】
请仔细看图，识别：
1. 聊天的完整内容（双方说了什么）
2. 女生的情绪状态（开心、害羞、冷淡、期待等）
3. 关系阶段信号（搭讪、聊天、暧昧、约会等）
4. 任何有价值的信息（昵称、年龄、职业、学历、专业、籍贯、现居城市、工作地点、兴趣爱好、饮食偏好、家庭情况、工作时间、穿着风格等）

【女生当前信息】
- 昵称：{girlName}
- 年龄：{girlAge}（空=未填）
- 职业：{girlOccupation}（空=未填）
- 学历：{girlEducation}（空=未填）
- 专业：{girlMajor}（空=未填）
- 籍贯：{girlHometown}（空=未填）
- 现居城市：{girlResidence}（空=未填）
- 工作地点：{girlWorkplace}（空=未填）
- 阶段：{girlStage}
- 现有热度：{tensionScore}/10

请输出 JSON 格式的分析结果：
{
  "chatText": "逐条列出识别到的对话，格式：用户: xxx\\n女生: xxx",
  "chatSummary": "用2-3句话概括聊天内容",
  "girlEmotion": "女生的情绪状态",
  "girlIntention": "女生的意图（主动/被动/观望/冷淡等）",
  "newSignals": [
    {"date": "今天", "type": "positive/negative/neutral", "event": "具体事件描述"}
  ],
  "pendingActions": ["待推进事项1", "待推进事项2"],
  "observations": ["观察点1", "观察点2"],
  "tensionAdjustment": -1到+1的调整值,
  "stageChange": "不变/升级/降级",
  "nextStage": "如果升级/降级，填写目标阶段",
  "profileUpdates": {
    "age": "如果聊天中提到年龄则填写，如：24",
    "occupation": "如果聊到职业则填写，如：教师、护士、学生",
    "education": "如果提到学历则填写，如：本科、硕士",
    "major": "如果提到专业则填写，如：英语、设计",
    "hometown": "如果提到籍贯或老家则填写，如：四川成都、湖北武汉",
    "residence": "如果提到现居城市则填写，如：上海、杭州",
    "workplace": "如果提到工作地点或学校则填写",
    "appearance": "如果聊到外貌描述或穿着风格则填写，如：长发、穿裙子",
    "styleTags": "如果能判断风格标签则填写，如：文艺、运动、精致、朴素",
    "familyBackground": "如果提到家庭背景则填写，如：城市、独生子女",
    "workSchedule": "如果提到工作时间或作息则填写，如：朝九晚六、经常加班",
    "interests": "如果聊到兴趣爱好则填写，如：健身、读书、美食",
    "dietPreferences": "如果提到饮食偏好则填写，使用标准化标签逗号分隔，如：清淡,火锅,日料,甜品。标准标签：清淡,重口味,火锅,烧烤,日料,西餐,甜品,咖啡,海鲜,素食,面食",
    "dietRestrictions": "如果提到饮食禁忌、过敏、不喜欢吃什么则填写，使用标准化标签逗号分隔，如：不吃辣,海鲜过敏,酒精过敏。标准标签：不吃辣,不吃香菜,海鲜过敏,坚果过敏,酒精过敏,不吃羊肉,不吃猪肉,不吃牛肉,麸质过敏,素食主义,清真",
    "personality": "如果能判断性格则填写，如：外向、慢热、内向",
    "communicationStyle": "如果能判断沟通风格则填写，如：话多、含蓄、幽默",
    "emotionalTriggers": "如果发现情绪触发点则填写，如：提到前男友",
    "talkingTopics": "如果发现喜欢的话题则填写，如：美食、旅行、宠物",
    "thingsToAvoid": "如果发现禁忌话题则填写，如：问家庭财务",
    "relationshipAttitude": "如果表明婚恋态度则填写，如：认真想找对象、随便聊聊",
    "attachmentStyle": "如果能判断依恋类型则填写，如：焦虑型、安全型",
    "responsePattern": "如果能判断回复规律则填写，如：秒回、正常、慢回"
  }
}

只输出 JSON，不要其他内容。分析要基于图片实际内容，不要编造信息。只对女生当前信息中为"空"的字段提取值填充，已有的字段不要改。如果聊天中没有提到某个信息，对应字段填 null 或省略。不要因为聊天中提到年龄就重复填，即使值一样也不要覆盖已有数据。`;

// Mo哥 + 童锦程 分析 prompt - 信号与档案提取
const ANALYSIS_PROMPT = `你是童锦程，两性关系专家，情感老中医。你的风格：接地气，有温度，懂人心，有经验。

分析以下聊天截图或备注，提取关键信息并更新女生档案：

【截图备注/聊天内容】
{notes}

【女生当前信息】
- 昵称：{girlName}
- 年龄：{girlAge}（空=未填）
- 职业：{girlOccupation}（空=未填）
- 学历：{girlEducation}（空=未填）
- 专业：{girlMajor}（空=未填）
- 籍贯：{girlHometown}（空=未填）
- 现居城市：{girlResidence}（空=未填）
- 工作地点：{girlWorkplace}（空=未填）
- 阶段：{girlStage}
- 现有信号：{existingSignals}

请输出 JSON 格式的分析结果：
{
  "newSignals": [
    {"date": "今天", "type": "positive/negative/neutral", "event": "具体事件描述"}
  ],
  "pendingActions": ["待推进事项1", "待推进事项2"],
  "observations": ["观察点1", "观察点2"],
  "tensionAdjustment": -1到+1的调整值,
  "stageChange": "不变/升级/降级",
  "nextStage": "如果升级/降级，填写目标阶段",
  "profileUpdates": {
    "age": "如果聊天中提到年龄则填写，如：24",
    "occupation": "如果聊到职业则填写，如：教师、护士、学生",
    "education": "如果提到学历则填写，如：本科、硕士",
    "major": "如果提到专业则填写，如：英语、设计",
    "hometown": "如果提到籍贯或老家则填写，如：四川成都、湖北武汉",
    "residence": "如果提到现居城市则填写，如：上海、杭州",
    "workplace": "如果提到工作地点或学校则填写",
    "appearance": "如果聊到外貌描述或穿着风格则填写，如：长发、穿裙子",
    "styleTags": "如果能判断风格标签则填写，如：文艺、运动、精致、朴素",
    "familyBackground": "如果提到家庭背景则填写，如：城市、独生子女",
    "workSchedule": "如果提到工作时间或作息则填写，如：朝九晚六、经常加班",
    "interests": "如果聊到兴趣爱好则填写，如：健身、读书、美食",
    "dietPreferences": "如果提到饮食偏好则填写，使用标准化标签逗号分隔，如：清淡,火锅,日料,甜品。标准标签：清淡,重口味,火锅,烧烤,日料,西餐,甜品,咖啡,海鲜,素食,面食",
    "dietRestrictions": "如果提到饮食禁忌、过敏、不喜欢吃什么则填写，使用标准化标签逗号分隔，如：不吃辣,海鲜过敏,酒精过敏。标准标签：不吃辣,不吃香菜,海鲜过敏,坚果过敏,酒精过敏,不吃羊肉,不吃猪肉,不吃牛肉,麸质过敏,素食主义,清真",
    "personality": "如果能判断性格则填写，如：外向、慢热、内向",
    "communicationStyle": "如果能判断沟通风格则填写，如：话多、含蓄、幽默",
    "emotionalTriggers": "如果发现情绪触发点则填写，如：提到前男友",
    "talkingTopics": "如果发现喜欢的话题则填写，如：美食、旅行、宠物",
    "thingsToAvoid": "如果发现禁忌话题则填写，如：问家庭财务",
    "relationshipAttitude": "如果表明婚恋态度则填写，如：认真想找对象、随便聊聊",
    "attachmentStyle": "如果能判断依恋类型则填写，如：焦虑型、安全型",
    "responsePattern": "如果能判断回复规律则填写，如：秒回、正常、慢回"
  }
}

只输出 JSON，不要其他内容。profileUpdates 中的字段如果聊天内容没有提到则省略或填 null，不要编造。只对女生当前信息中为"空"的字段提取值填充，已有的字段不要改。`;

/**
 * 从备注/截图分析提取信号
 * @param {string} girlId - 女生ID
 * @param {string} notes - 截图备注或分析文本
 */
async function extractFromNotes(girlId, notes) {
  try {
    const girl = await prisma.girl.findUnique({ where: { id: girlId } });
    if (!girl) {
      console.log('[SignalExtractor] 女生不存在:', girlId);
      return null;
    }

    // 解析现有 signals
    let existingSignals = [];
    if (girl.signals) {
      try {
        existingSignals = JSON.parse(girl.signals);
      } catch (e) {
        existingSignals = [];
      }
    }

    const aiConfig = getAIConfig();
    const prompt = ANALYSIS_PROMPT
      .replace('{notes}', notes || '无备注')
      .replace('{girlName}', girl.name)
      .replace('{girlAge}', girl.age || '空')
      .replace('{girlOccupation}', girl.occupation || '空')
      .replace('{girlEducation}', girl.education || '空')
      .replace('{girlMajor}', girl.major || '空')
      .replace('{girlHometown}', girl.hometown || '空')
      .replace('{girlResidence}', girl.residence || '空')
      .replace('{girlWorkplace}', girl.workplace || '空')
      .replace('{girlStage}', girl.stage || '未知')
      .replace('{existingSignals}', JSON.stringify(existingSignals.slice(-5)));

    const response = await fetch(aiConfig.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiConfig.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 800
      })
    });

    if (!response.ok) {
      console.error('[SignalExtractor] AI 调用失败:', response.status);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    let analysis = repairJSON(content);
    if (!analysis) {
      return null;
    }

    // 更新女生档案（备注提取仍自动入库）
    await applyAnalysisToGirl(girlId, analysis, existingSignals, girl);

    return analysis;
  } catch (error) {
    console.error('[SignalExtractor] 提取失败:', error);
    return null;
  }
}

/**
 * 应用 AI 分析结果到女生档案（信号 + 档案字段）
 * 由 confirm 确认后调用
 */
async function applyAnalysisToGirl(girlId, analysis, existingSignals, girl) {
  try {
    // 合并新信号
    let allSignals = [...existingSignals];
    if (analysis.newSignals && analysis.newSignals.length > 0) {
      // 添加日期（如果未提供，使用今天）
      const newSignals = analysis.newSignals.map(s => ({
        ...s,
        date: s.date || new Date().toLocaleDateString('zh-CN')
      }));
      allSignals = [...allSignals, ...newSignals];
    }

    // 保留最近30天的信号（或其他合理数量）
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    allSignals = allSignals.filter(s => new Date(s.date) >= thirtyDaysAgo);

    // 更新待推进事项
    let pendingActions = [];
    if (girl.pendingActions) {
      try {
        pendingActions = JSON.parse(girl.pendingActions);
      } catch (e) {}
    }
    if (analysis.pendingActions && analysis.pendingActions.length > 0) {
      // 合并，去重
      analysis.pendingActions.forEach(action => {
        if (!pendingActions.includes(action)) {
          pendingActions.push(action);
        }
      });
    }

    // 更新观察点
    let observations = [];
    if (girl.observations) {
      try {
        observations = JSON.parse(girl.observations);
      } catch (e) {}
    }
    if (analysis.observations && analysis.observations.length > 0) {
      analysis.observations.forEach(obs => {
        if (!observations.includes(obs)) {
          observations.push(obs);
        }
      });
    }

    // 更新热度评分
    let tensionScore = girl.tensionScore || 5.0;
    if (analysis.tensionAdjustment) {
      tensionScore = Math.max(1.0, Math.min(10.0, tensionScore + analysis.tensionAdjustment));
    }

    // 判断阶段变化
    let newStage = girl.stage;
    if (analysis.stageChange === '升级' && analysis.nextStage) {
      newStage = analysis.nextStage;
    } else if (analysis.stageChange === '降级' && analysis.nextStage) {
      newStage = analysis.nextStage;
    }

    // 构建更新数据
    const updateData = {
      signals: JSON.stringify(allSignals),
      pendingActions: JSON.stringify(pendingActions),
      observations: JSON.stringify(observations),
      tensionScore,
      stage: newStage
    };

    // 处理档案字段更新（只更新空字段，不覆盖已有数据）
    const profileUpdates = analysis.profileUpdates || {};
    const profileFieldMap = {
      // 基础信息
      age: 'age',
      occupation: 'occupation',
      education: 'education',
      major: 'major',
      hometown: 'hometown',
      residence: 'residence',
      workplace: 'workplace',
      height: 'height',
      bodyType: 'bodyType',
      // 外貌风格
      appearance: 'appearance',
      styleTags: 'styleTags',
      // 家庭
      familyBackground: 'familyBackground',
      // 生活
      workSchedule: 'workSchedule',
      interests: 'interests',
      dietPreferences: 'dietPreferences',
      dietRestrictions: 'dietRestrictions',
      // 内在画像
      personality: 'personality',
      communicationStyle: 'communicationStyle',
      emotionalTriggers: 'emotionalTriggers',
      talkingTopics: 'talkingTopics',
      thingsToAvoid: 'thingsToAvoid',
      // 情感
      relationshipAttitude: 'relationshipAttitude',
      attachmentStyle: 'attachmentStyle',
      responsePattern: 'responsePattern',
      // 谙世关联
      chatPartnerId: 'chatPartnerId'
    };

    for (const [key, dbField] of Object.entries(profileFieldMap)) {
      const value = profileUpdates[key];
      // 只有当 AI 返回了值 且 数据库当前字段为空时才更新
      if (value && value !== null && value !== '') {
        const currentValue = girl[dbField];
        if (!currentValue || currentValue === '' || currentValue === null) {
          // Int 字段需要转为数字
          if (dbField === 'age' || dbField === 'height') {
            updateData[dbField] = parseInt(value, 10);
            if (isNaN(updateData[dbField])) continue;
          } else {
            updateData[dbField] = value;
          }
        }
      }
    }

    // 更新数据库
    await prisma.girl.update({
      where: { id: girlId },
      data: updateData
    });

    const updatedFields = Object.keys(updateData).filter(k => !['signals', 'pendingActions', 'observations', 'tensionScore', 'stage'].includes(k));
    console.log('[SignalExtractor] 女生档案已更新:', girlId, { tensionScore, stage: newStage, updatedProfileFields: updatedFields });
    return true;
  } catch (error) {
    console.error('[SignalExtractor] 更新失败:', error);
    return false;
  }
}

/**
 * 批量分析所有女生（用于每日简报）
 */
async function analyzeAllGirls(clientId) {
  try {
    const where = clientId ? { clientId } : {};
    const girls = await prisma.girl.findMany({ where });

    const results = [];
    for (const girl of girls) {
      // 解析 signals 和 pendingActions
      let signals = [];
      let pendingActions = [];

      if (girl.signals) {
        try { signals = JSON.parse(girl.signals); } catch (e) {}
      }
      if (girl.pendingActions) {
        try { pendingActions = JSON.parse(girl.pendingActions); } catch (e) {}
      }

      // 生成今日待办和提醒
      const todayTasks = [];
      const alerts = [];

      // 检查3天无互动
      if (signals.length > 0) {
        const lastSignal = signals[signals.length - 1];
        const lastDate = new Date(lastSignal.date);
        const daysSince = Math.floor((Date.now() - lastDate) / (1000 * 60 * 60 * 24));
        if (daysSince >= 3) {
          alerts.push({
            girlId: girl.id,
            girlName: girl.name,
            type: 'warning',
            message: '已' + daysSince + '天无新互动，需要破冰或重新定位'
          });
        }
      }

      // 检查低温女生
      if (girl.tensionScore < 4) {
        alerts.push({
          girlId: girl.id,
          girlName: girl.name,
          type: 'danger',
          message: '关系热度偏低，建议补充能量或重新定位'
        });
      }

      // 检查 pendingActions 到期的
      pendingActions.forEach(action => {
        todayTasks.push({
          girlId: girl.id,
          girlName: girl.name,
          stage: girl.stage,
          tensionScore: girl.tensionScore,
          action,
          priority: 'P0'
        });
      });

      results.push({ girl, todayTasks, alerts });
    }

    return results;
  } catch (error) {
    console.error('[SignalExtractor] 批量分析失败:', error);
    return [];
  }
}

/**
 * 从截图图片提取信号并更新女生档案
 * @param {string} girlId - 女生ID
 * @param {string} imageUrl - 图片URL（本地路径或OSS URL）
 * @param {string} baseUrl - 服务基础URL（用于拼接本地图片）
 */
async function extractFromImage(girlId, imageUrl, baseUrl) {
  try {
    const girl = await prisma.girl.findUnique({ where: { id: girlId } });
    if (!girl) {
      console.log('[SignalExtractor] 女生不存在:', girlId);
      return { error: '女生不存在' };
    }

    // 解析现有 signals
    let existingSignals = [];
    if (girl.signals) {
      try {
        existingSignals = JSON.parse(girl.signals);
      } catch (e) {
        existingSignals = [];
      }
    }

    // 构建图片完整URL
    let fullImageUrl = imageUrl;
    if (imageUrl && imageUrl.startsWith('/')) {
      fullImageUrl = (baseUrl || BASE_URL) + imageUrl;
    }

    // 调用 VL 模型分析图片
    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: IMAGE_ANALYSIS_PROMPT
              .replace('{girlName}', girl.name)
              .replace('{girlAge}', girl.age || '空')
              .replace('{girlOccupation}', girl.occupation || '空')
              .replace('{girlEducation}', girl.education || '空')
              .replace('{girlMajor}', girl.major || '空')
              .replace('{girlHometown}', girl.hometown || '空')
              .replace('{girlResidence}', girl.residence || '空')
              .replace('{girlWorkplace}', girl.workplace || '空')
              .replace('{girlStage}', girl.stage || '未知')
              .replace('{tensionScore}', girl.tensionScore || 5)
          },
          {
            type: 'image_url',
            image_url: { url: fullImageUrl }
          }
        ]
      }
    ];

    let response;
    const vlConfig = getVLModelConfig();
    if (vlConfig) {
      response = await fetch(vlConfig.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vlConfig.key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: vlConfig.model,
          messages,
          temperature: 0.7,
          max_tokens: 1000
        })
      });
    } else {
      // 智谱不支持图片，返回错误
      return { error: '当前配置不支持图片分析，请使用阿里云 DashScope' };
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SignalExtractor] VL 模型调用失败:', response.status, errorText);
      return { error: 'AI 分析失败' };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 解析 AI 返回（支持带 markdown 代码块和格式错误的情况）
    let analysis = repairJSON(content);
    if (!analysis) {
      // 返回包含原始内容，供前端展示部分信息
      return {
        error: '图片分析失败，无法识别内容',
        rawContent: content.substring(0, 500)
      };
    }

    // 如果返回空对象
    if (!analysis || Object.keys(analysis).length === 0) {
      return { error: '未提取到有效信息' };
    }

    // 不再自动入库——返回分析结果，由确认接口决定是否保存

    // 生成摘要文本
    const aiNotes = '[AI图像分析] ' + girl.name + '\n' +
      '聊天摘要：' + (analysis.chatSummary || '无') + '\n' +
      '女生情绪：' + (analysis.girlEmotion || '未知') + '\n' +
      '关系阶段：' + (girl.stage || '未知') + ' -> ' + (analysis.nextStage || girl.stage) + '\n' +
      '热度变化：' + (girl.tensionScore || 5) + ' -> ' + ((girl.tensionScore || 5) + (analysis.tensionAdjustment || 0)) + '\n' +
      '信号提取：' + ((analysis.newSignals || []).map(function(s) { return s.event; }).join('; ') || '无') + '\n' +
      '待推进：' + ((analysis.pendingActions || []).join('; ') || '无');

    return {
      success: true,
      analysis: analysis,
      chatText: analysis.chatText || analysis.chatSummary || '',
      aiNotes: aiNotes
    };
  } catch (error) {
    console.error('[SignalExtractor] 图片分析失败:', error);
    return { error: error.message || '分析失败' };
  }
}

module.exports = {
  extractFromNotes,
  extractFromImage,
  applyAnalysisToGirl,
  analyzeAllGirls
};
