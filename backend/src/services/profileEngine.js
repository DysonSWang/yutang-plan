/**
 * Layer 1: Profile Extraction Engine
 *
 * 纯逻辑层，与数据库完全解耦。
 * 职责：调用 AI、解析 JSON、返回结构化分析结果。
 * 不写库，不持有状态。
 */

const { getAIConfig, getVLModelConfig, BASE_URL } = require('../config');
const fs = require('fs');
const path = require('path');

/**
 * 将本地 /uploads/ 路径转为 data URI（base64）
 * DashScope VL 模型无法访问 localhost URL
 */
function localImageToBase64(imageUrl) {
  // 提取本地路径：支持 /uploads/xxx 和 http://localhost:PORT/uploads/xxx
  let localPath = imageUrl;
  if (imageUrl?.startsWith('/uploads/')) {
    localPath = imageUrl;
  } else if (imageUrl?.includes('/uploads/')) {
    // 去掉协议和 host，只保留 /uploads/... 部分
    const match = imageUrl.match(/\/uploads\/.+/);
    if (match) localPath = '/' + match[0].replace(/^\//, '');
  } else {
    return imageUrl;
  }
  const filePath = path.join(__dirname, '..', '..', 'uploads', localPath.replace('/uploads/', ''));
  try {
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase().replace('.', '') || 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  } catch {
    return imageUrl;
  }
}

// ============================================================================
// JSON 修复
// ============================================================================

/**
 * 尝试修复 AI 返回的非标准 JSON
 * @param {string} raw - AI 返回的原始文本
 * @returns {object|null}
 */
function repairJSON(raw) {
  if (!raw || typeof raw !== 'string') return null;

  // 去掉 markdown 代码块包裹
  let cleaned = raw
    .replace(/```json\n?/gi, '')
    .replace(/```\n?/g, '')
    .trim();

  // 去掉常见的尾部垃圾
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonEnd > 0 && jsonEnd < cleaned.length - 1) {
    cleaned = cleaned.substring(0, jsonEnd + 1);
  }

  // 去掉单行注释
  cleaned = cleaned.replace(/\/\/.*$/gm, '');

  // 修复尾部逗号
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

  try {
    return JSON.parse(cleaned);
  } catch (e1) {
    try {
      const fixed = cleaned
        .replace(/\u201C/g, '"')
        .replace(/\u201D/g, '"')
        .replace(/\u2018/g, "'")
        .replace(/\u2019/g, "'")
        .replace(/\u300C/g, '"')
        .replace(/\u300D/g, '"');
      return JSON.parse(fixed);
    } catch (e2) {
      console.error('[ProfileEngine] JSON repair failed:', e2.message, '| raw:', raw.substring(0, 200));
      return null;
    }
  }
}

// ============================================================================
// AI 调用
// ============================================================================

/**
 * 调用文本模型
 */
async function callTextModel(prompt, modelConfig) {
  const config = modelConfig || getAIConfig();
  if (!config) throw new Error('AI 配置未设置');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000);

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1200
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`AI 调用失败: ${response.status} ${errText.substring(0, 200)}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 调用视觉模型（图片分析）
 */
async function callVisionModel(messages, vlConfig) {
  const config = vlConfig || getVLModelConfig();
  if (!config) {
    throw new Error('当前配置不支持图片分析，请使用阿里云 DashScope');
  }

  // 将 messages 中的本地图片路径转为 base64（DashScope 无法访问 localhost）
  const resolvedMessages = messages.map(msg => {
    if (msg.content && Array.isArray(msg.content)) {
      return {
        ...msg,
        content: msg.content.map(item => {
          if (item.type === 'image_url' && item.image_url?.url) {
            return { type: 'image_url', image_url: { url: localImageToBase64(item.image_url.url) } };
          }
          return item;
        })
      };
    }
    return msg;
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000);

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        messages: resolvedMessages,
        temperature: 0.7,
        max_tokens: 1500
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`VL 模型调用失败: ${response.status} ${errorText.substring(0, 300)}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================================
// 女生分析 — Prompt 模板
// ============================================================================

const GIRL_TEXT_ANALYSIS_PROMPT = `你是童锦程，两性关系专家，情感老中医。你的风格：接地气，有温度，懂人心，有经验，真诚自然，不油腔滑调，不套路撩骚。

分析以下内容，提取关键信息并更新女生档案：

【聊天内容/备注】
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
    "height": "如果聊到身高(cm)则填写，如：165",
    "weight": "如果聊到体重(kg)则填写，如：52",
    "bodyType": "如果能判断体型则填写。标准类型：偏瘦、标准、微胖、偏胖",
    "styleTags": "如果能判断风格标签则填写，如：文艺、运动、精致、朴素",
    "familyBackground": "如果提到家庭背景则填写，如：城市、独生子女",
    "workSchedule": "如果提到工作时间或作息则填写，如：朝九晚六、经常加班",
    "interests": "如果聊到兴趣爱好则填写，如：健身、读书、美食",
    "dietPreferences": "如果提到饮食偏好则填写，使用标准化标签逗号分隔。标准标签：清淡,重口味,火锅,烧烤,日料,西餐,甜品,奶茶,咖啡,海鲜,素食,面食,轻食/沙拉",
    "dietRestrictions": "如果提到饮食禁忌则填写，使用标准化标签逗号分隔。标准标签：不吃辣,不吃香菜,海鲜过敏,坚果过敏,酒精过敏,不吃羊肉,不吃猪肉,不吃牛肉,麸质过敏,素食主义,清真,减肥中（限制碳水）",
    "personality": "如果能判断性格则填写，如：外向、慢热、内向、傲娇、高冷、活泼",
    "communicationStyle": "如果能判断沟通风格则填写，如：话多、含蓄、幽默",
    "emotionalTriggers": "如果发现情绪触发点则填写，使用逗号分隔。常见触发点：提到前男友,涉及金钱话题,被追问隐私,突然高频联系,被否定审美/选择,提到家庭情况,工作话题,相亲话题",
    "talkingTopics": "如果发现喜欢的话题则填写，如：美食、旅行、宠物",
    "thingsToAvoid": "如果发现禁忌话题则填写，如：问家庭财务",
    "relationshipAttitude": "如果表明婚恋态度则填写，如：认真想找对象、随便聊聊",
    "attachmentStyle": "如果能判断依恋类型则填写。标准类型：焦虑型（渴望亲密但缺乏安全感）、安全型（平衡依赖与独立）、回避型（回避亲密、保持距离）。不要超出这三类。",
    "dressingStyle": "如果聊到穿着风格则填写，如：辣妹风、森女系、运动风、职业装、休闲、文艺",
    "responsePattern": "如果能判断回复规律则填写，如：主动秒回、被迫秒回、偶尔慢回、固定慢回。区分：主动秒回=高兴趣，被迫秒回=礼貌≠喜欢",
    "loveLanguage": "如果能判断爱的语言则填写。标准类型：言语肯定（喜欢听甜言蜜语）、高质量陪伴（喜欢一起做事）、礼物（重视礼物和心意）、服务行为（喜欢被照顾）、身体接触（喜欢牵手、拥抱等）。区分主次，如：主要=言语肯定，次要=身体接触",
    "defenseMechanism": "如果发现防御机制则填写。常见防御：否认（说\"没有\"回避问题）、投射（把感受推到对方身上）、合理化（用逻辑解释情绪）、回避（转移话题、不回应核心问题）、讽刺（用调侃化解尴尬）、自我贬低（用自嘲防御被否定）。注明类型和表现",
    "sexualAttractionSignals": "如果女生释放了性吸引力信号则填写，如：调侃身材/外表、主动暧昧称呼、肢体暗示话题、对性话题开放、身体接触邀请。区分：调侃型（暧昧但克制）、直接型（明确表达）、暗示型（隐晦邀请）",
    "coreShame": "如果能推断核心羞耻感则填写，如：外貌焦虑（对自己外表不自信）、经济羞耻（回避谈钱/收入）、情感羞耻（觉得表达感情是可耻的）、性羞耻（对性话题回避或羞耻）、家庭羞耻（对家庭背景敏感）。注明触发场景",
    "attachmentStyleDynamic": "如果发现依恋风格的动态变化则填写，如：回避型偶尔主动靠近（松动迹象）、焦虑型开始减少消息频率（开始建立边界）、安全型在压力下退行到回避。描述变化方向：向安全型靠近 / 向回避型退缩 / 向焦虑型漂移",
    "valueConflict": "如果发现价值观冲突则填写，如：对婚姻的看法冲突、对金钱的态度冲突、对家庭角色的期待冲突、对事业vs感情的取舍。注明冲突点和双方立场",
    "responsivenessLevel": "如果能判断回应质量则填写，如：高质量回应（认真思考后回复、有细节）、敷衍式回应（嗯、哦、哈哈）、过度回应（秒回+长篇大论，疑似焦虑型）、冷淡回应（字数少、反应慢）"
  }
}

重要规则：
1. 只对女生当前信息中为"空"的字段提取值填充，已有的字段不要改。
2. 只从本轮聊天内容中提取信息，不要基于历史对话推断本轮未提及的信息。
3. 女生自述的职业可能与实际不符（如夜场女生自称美容师），应结合聊天语境综合判断，不要仅凭一句话定论。
4. 只输出 JSON，不要其他内容。
5. 只输出实际看到的信息，不要猜测、推断或编造没有依据的内容。如果图片/聊天中没有体现，明确标注"未知"或留空，不要凭空填充。`;

const GIRL_VISION_ANALYSIS_PROMPT = `你是童锦程，两性关系专家，情感老中医。你的风格：接地气，有温度，懂人心，有经验，真诚自然，不油腔滑调，不套路撩骚。

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
    "height": "如果聊到身高(cm)则填写，如：165",
    "weight": "如果聊到体重(kg)则填写，如：52",
    "bodyType": "如果能判断体型则填写。标准类型：偏瘦、标准、微胖、偏胖",
    "styleTags": "如果能判断风格标签则填写，如：文艺、运动、精致、朴素",
    "familyBackground": "如果提到家庭背景则填写，如：城市、独生子女",
    "workSchedule": "如果提到工作时间或作息则填写，如：朝九晚六、经常加班",
    "interests": "如果聊到兴趣爱好则填写，如：健身、读书、美食",
    "dietPreferences": "如果提到饮食偏好则填写，使用标准化标签逗号分隔。标准标签：清淡,重口味,火锅,烧烤,日料,西餐,甜品,奶茶,咖啡,海鲜,素食,面食,轻食/沙拉",
    "dietRestrictions": "如果提到饮食禁忌则填写，使用标准化标签逗号分隔。标准标签：不吃辣,不吃香菜,海鲜过敏,坚果过敏,酒精过敏,不吃羊肉,不吃猪肉,不吃牛肉,麸质过敏,素食主义,清真,减肥中（限制碳水）",
    "personality": "如果能判断性格则填写，如：外向、慢热、内向、傲娇、高冷、活泼",
    "communicationStyle": "如果能判断沟通风格则填写，如：话多、含蓄、幽默",
    "emotionalTriggers": "如果发现情绪触发点则填写，使用逗号分隔。常见触发点：提到前男友,涉及金钱话题,被追问隐私,突然高频联系,被否定审美/选择,提到家庭情况,工作话题,相亲话题",
    "talkingTopics": "如果发现喜欢的话题则填写，如：美食、旅行、宠物",
    "thingsToAvoid": "如果发现禁忌话题则填写，如：问家庭财务",
    "relationshipAttitude": "如果表明婚恋态度则填写，如：认真想找对象、随便聊聊",
    "attachmentStyle": "如果能判断依恋类型则填写。标准类型：焦虑型（渴望亲密但缺乏安全感）、安全型（平衡依赖与独立）、回避型（回避亲密、保持距离）。不要超出这三类。",
    "dressingStyle": "如果能从外貌/穿着风格判断则填写，如：辣妹风、森女系、运动风、职业装、休闲、文艺",
    "responsePattern": "如果能判断回复规律则填写，如：主动秒回、被迫秒回、偶尔慢回、固定慢回。区分：主动秒回=高兴趣，被迫秒回=礼貌≠喜欢",
    "loveLanguage": "如果能从外貌/穿着风格判断爱的语言则填写。标准类型：言语肯定、高质量陪伴、礼物、服务行为、身体接触",
    "defenseMechanism": "如果从聊天风格中发现防御机制则填写。常见防御：否认、投射、合理化、回避、讽刺、自我贬低",
    "sexualAttractionSignals": "如果从对话内容中识别到性吸引力信号则填写，如：调侃身材、暧昧称呼、肢体暗示、对性话题开放",
    "coreShame": "如果能推断核心羞耻感则填写，如：外貌焦虑、经济羞耻、情感羞耻、性羞耻、家庭羞耻",
    "attachmentStyleDynamic": "如果发现依恋风格的动态变化则填写，描述变化方向",
    "valueConflict": "如果发现价值观冲突则填写，如：婚姻观冲突、金钱态度冲突、家庭角色期待冲突",
    "responsivenessLevel": "如果能判断回应质量则填写，如：高质量回应、敷衍式回应、过度回应、冷淡回应"
  }
}

重要规则：
1. 只对女生当前信息中为"空"的字段提取值填充，已有的字段不要改。
2. 只从本轮聊天内容中提取信息，不要基于历史对话推断本轮未提及的信息。
3. 女生自述的职业可能与实际不符（如夜场女生自称美容师），应结合聊天语境综合判断，不要仅凭一句话定论。
4. 只输出 JSON，不要其他内容。
5. 只输出实际看到的信息，不要猜测、推断或编造没有依据的内容。如果图片/聊天中没有体现，明确标注"未知"或留空，不要凭空填充。`;

// ============================================================================
// 女生聊天分析 Prompt（对齐 chatPartner /analyze 的上下文）
// ============================================================================

const GIRL_CHAT_ANALYSIS_PROMPT = `你是童锦程，两性关系专家，情感老中医。你的风格：接地气，有温度，懂人心，有经验，真诚自然，不油腔滑调，不套路撩骚。

分析以下聊天记录，提取关键信息并更新女生档案：

【女生档案】
昵称：{girlName}
年龄：{girlAge}
职业：{girlOccupation}
学历：{girlEducation}
专业：{girlMajor}
籍贯：{girlHometown}
现居城市：{girlResidence}
工作地点：{girlWorkplace}
当前阶段：{girlStage}
关系热度：{tensionScore}/10
亲密度：{intimacyLevel}

【外貌与风格】
外貌：{appearance}
穿着风格：{dressingStyle}
风格标签：{styleTags}

【生活信息】
家庭背景：{familyBackground}
工作时间：{workSchedule}
饮食偏好：{dietPreferences}
饮食禁忌：{dietRestrictions}
兴趣爱好：{interests}

【性格画像】
MBTI：{mbti}
性格：{personality}
沟通风格：{communicationStyle}
情绪触发点：{emotionalTriggers}
聊天禁忌：{thingsToAvoid}
喜欢话题：{talkingTopics}
婚恋态度：{relationshipAttitude}
依恋类型：{attachmentStyle}
回复规律：{responsePattern}

【近期关键信号（近30天）】
{recentSignals}

【待推进事项】
{pendingActions}

【观察记录】
{observations}

【对话摘要】
{conversationSummary}

【聊天历史（最近10条）】
{history}

【女生刚刚发来的消息】
"{message}"

请输出 JSON 格式的分析结果：
{
  "chatSummary": "用2-3句话概括这段对话",
  "girlEmotion": "女生的情绪状态",
  "girlIntention": "女生的意图（主动/被动/观望/冷淡/期待等）",
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
    "height": "如果聊到身高(cm)则填写，如：165",
    "weight": "如果聊到体重(kg)则填写，如：52",
    "bodyType": "如果能判断体型则填写。标准类型：偏瘦、标准、微胖、偏胖",
    "styleTags": "如果能判断风格标签则填写，如：文艺、运动、精致、朴素",
    "familyBackground": "如果提到家庭背景则填写，如：城市、独生子女",
    "workSchedule": "如果提到工作时间或作息则填写，如：朝九晚六、经常加班",
    "interests": "如果聊到兴趣爱好则填写，如：健身、读书、美食",
    "dietPreferences": "如果提到饮食偏好则填写，使用标准化标签逗号分隔。标准标签：清淡,重口味,火锅,烧烤,日料,西餐,甜品,奶茶,咖啡,海鲜,素食,面食,轻食/沙拉",
    "dietRestrictions": "如果提到饮食禁忌则填写，使用标准化标签逗号分隔。标准标签：不吃辣,不吃香菜,海鲜过敏,坚果过敏,酒精过敏,不吃羊肉,不吃猪肉,不吃牛肉,麸质过敏,素食主义,清真,减肥中（限制碳水）",
    "personality": "如果能判断性格则填写，如：外向、慢热、内向、傲娇、高冷、活泼",
    "communicationStyle": "如果能判断沟通风格则填写，如：话多、含蓄、幽默",
    "emotionalTriggers": "如果发现情绪触发点则填写，使用逗号分隔。常见触发点：提到前男友,涉及金钱话题,被追问隐私,突然高频联系,被否定审美/选择,提到家庭情况,工作话题,相亲话题",
    "talkingTopics": "如果发现喜欢的话题则填写，如：美食、旅行、宠物",
    "thingsToAvoid": "如果发现禁忌话题则填写，如：问家庭财务",
    "relationshipAttitude": "如果表明婚恋态度则填写，如：认真想找对象、随便聊聊",
    "attachmentStyle": "如果能判断依恋类型则填写。标准类型：焦虑型（渴望亲密但缺乏安全感）、安全型（平衡依赖与独立）、回避型（回避亲密、保持距离）。不要超出这三类。",
    "dressingStyle": "如果能从外貌/穿着风格判断则填写，如：辣妹风、森女系、运动风、职业装、休闲、文艺",
    "responsePattern": "如果能判断回复规律则填写，如：主动秒回、被迫秒回、偶尔慢回、固定慢回。区分：主动秒回=高兴趣，被迫秒回=礼貌≠喜欢",
    "loveLanguage": "如果能从聊天互动中判断爱的语言则填写。标准类型：言语肯定（喜欢听甜言蜜语）、高质量陪伴（喜欢一起做事）、礼物（重视礼物和心意）、服务行为（喜欢被照顾）、身体接触（喜欢牵手、拥抱等）。区分主次，如：主要=言语肯定，次要=身体接触",
    "defenseMechanism": "如果发现防御机制则填写。常见防御：否认（说\"没有\"回避问题）、投射（把感受推到对方身上）、合理化（用逻辑解释情绪）、回避（转移话题、不回应核心问题）、讽刺（用调侃化解尴尬）、自我贬低（用自嘲防御被否定）。注明类型和表现",
    "sexualAttractionSignals": "如果女生释放了性吸引力信号则填写，如：调侃身材/外表、主动暧昧称呼、肢体暗示话题、对性话题开放、身体接触邀请。区分：调侃型（暧昧但克制）、直接型（明确表达）、暗示型（隐晦邀请）",
    "coreShame": "如果能推断核心羞耻感则填写，如：外貌焦虑（对自己外表不自信）、经济羞耻（回避谈钱/收入）、情感羞耻（觉得表达感情是可耻的）、性羞耻（对性话题回避或羞耻）、家庭羞耻（对家庭背景敏感）。注明触发场景",
    "attachmentStyleDynamic": "如果发现依恋风格的动态变化则填写，如：回避型偶尔主动靠近（松动迹象）、焦虑型开始减少消息频率（开始建立边界）、安全型在压力下退行到回避。描述变化方向：向安全型靠近 / 向回避型退缩 / 向焦虑型漂移",
    "valueConflict": "如果发现价值观冲突则填写，如：对婚姻的看法冲突、对金钱的态度冲突、对家庭角色的期待冲突、对事业vs感情的取舍。注明冲突点和双方立场",
    "responsivenessLevel": "如果能判断回应质量则填写，如：高质量回应（认真思考后回复、有细节）、敷衍式回应（嗯、哦、哈哈）、过度回应（秒回+长篇大论，疑似焦虑型）、冷淡回应（字数少、反应慢）"
  }
}

重要规则：
1. 只对女生当前信息中为"空"的字段提取值填充，已有的字段不要改。
2. 只从本轮聊天内容中提取信息，不要基于历史对话推断本轮未提及的信息。
3. 女生自述的职业可能与实际不符（如夜场女生自称美容师），应结合聊天语境综合判断，不要仅凭一句话定论。
4. 只输出 JSON，不要其他内容。
5. 只输出实际看到的信息，不要猜测、推断或编造没有依据的内容。如果图片/聊天中没有体现，明确标注"未知"或留空，不要凭空填充。`;

// ============================================================================
// 客户聊天分析 Prompt
// ============================================================================

const CLIENT_CHAT_ANALYSIS_PROMPT = `你是一个专业的客户服务顾问，擅长帮助操盘手（情感咨询师）与客户进行高效沟通。

分析以下聊天记录，提取关键信息并更新客户档案：

【客户档案】
昵称：{clientName}
服务阶段：{serviceStage}
沟通风格：{communicationStyle}
客户类型：{clientType}
配合度：{cooperation}

【性格特征】
MBTI/性格：{personality}
情绪稳定性：{emotionalStable}
情商水平：{eqLevel}
社交风格：{socialStyle}
婚恋态度：{relationshipAttitude}
感情诉求：{emotionalGoal}

【价值画像】
核心卖点：{strengths}
价值短板：{weaknesses}
自我价值认知：{selfValuePerception}

【学习与配合】
学习能力：{learningAbility}
反馈质量：{feedbackQuality}
自尊水平：{selfEsteemLevel}
抗压能力：{antiFrustrationLevel}

【代聊风格偏好】
互动风格：{interactionStyle}
幽默风格：{humorStyle}
口头禅：{petPhrases}
代聊禁区：{chatTaboos}

【关系信任度】
信任度：{trustLevel}/5
互动热度：{interactionHeat}/10

【近期沟通记录】
{recentMessages}

【客户刚刚发来的消息】
"{message}"

请输出 JSON 格式的分析结果：
{
  "chatSummary": "用2-3句话概括这段对话",
  "clientEmotion": "客户的情绪状态（积极/中性/焦虑/抵触/期待等）",
  "clientIntention": "客户的意图（咨询/抱怨/催促/感谢/质疑等）",
  "observations": ["沟通观察点1", "沟通观察点2"],
  "trustAdjustment": -1到+1的调整值,
  "profileUpdates": {
    "emotionalStable": "如果聊天中透露情绪波动则填写，如：8/10（情绪稳定）",
    "eqLevel": "如果聊天中能判断情商水平则填写，如：6/10",
    "communicationStyle": "如果发现沟通风格变化则填写，如：更直接/更含蓄",
    "coachCooperation": "如果发现配合度变化则填写，如：配合/一般/抵触",
    "feedbackQuality": "如果发现反馈质量变化则填写，如：详细/简单/无反馈",
    "selfEsteemLevel": "如果发现自尊水平变化则填写，如：高/中/低",
    "learningAbility": "如果发现学习能力表现则填写，如：强/中/弱",
    "interactionStyle": "如果发现互动风格变化则填写，如：更主动/更被动",
    "personality": "如果发现性格特征则填写",
    "chatTaboos": "如果发现新的代聊禁区则填写，逗号分隔",
    "petPhrases": "如果发现口头禅则填写，逗号分隔",
    "trustLevel": "如果发现信任度变化则填写，1-5",
    "interactionHeat": "如果发现互动热度变化则填写，1-10",
    "emotionalGoal": "如果客户表达了新的感情诉求则填写",
    "relationshipAttitude": "如果客户表明婚恋态度变化则填写",
    "strengths": "如果发现新的核心卖点则填写",
    "weaknesses": "如果发现新的价值短板则填写",
    "pendingActions": "如果操盘手发现待推进事项则填写，逗号分隔"
  }
}

只输出 JSON，不要其他内容。profileUpdates 只填充空字段或发现变化的字段，不要编造。只输出实际看到的信息，不要猜测、推断或编造。`;

// ============================================================================
// 核心分析函数
// ============================================================================

/**
 * 女生文本分析（备注/聊天）
 */
async function analyzeGirlText(girlProfile, content) {
  const existingSignals = girlProfile.recentSignals
    ? girlProfile.recentSignals.slice(-5).map(s => `${s.type}: ${s.event}`).join('; ')
    : '暂无';

  const prompt = GIRL_TEXT_ANALYSIS_PROMPT
    .replace('{notes}', content)
    .replace('{girlName}', girlProfile.name || '未知')
    .replace('{girlAge}', girlProfile.age || '空')
    .replace('{girlOccupation}', girlProfile.occupation || '空')
    .replace('{girlEducation}', girlProfile.education || '空')
    .replace('{girlMajor}', girlProfile.major || '空')
    .replace('{girlHometown}', girlProfile.hometown || '空')
    .replace('{girlResidence}', girlProfile.residence || '空')
    .replace('{girlWorkplace}', girlProfile.workplace || '空')
    .replace('{girlStage}', girlProfile.stage || '未知')
    .replace('{existingSignals}', existingSignals);

  const raw = await callTextModel(prompt);
  return repairJSON(raw);
}

/**
 * 女生图片分析（截图）
 */
async function analyzeGirlImage(girlProfile, imageUrl) {
  let fullImageUrl = imageUrl;
  if (imageUrl?.startsWith('/')) {
    fullImageUrl = (BASE_URL || 'http://localhost:3005') + imageUrl;
  }

  const messages = [{
    role: 'user',
    content: [
      {
        type: 'text',
        text: GIRL_VISION_ANALYSIS_PROMPT
          .replace('{girlName}', girlProfile.name || '未知')
          .replace('{girlAge}', girlProfile.age || '空')
          .replace('{girlOccupation}', girlProfile.occupation || '空')
          .replace('{girlEducation}', girlProfile.education || '空')
          .replace('{girlMajor}', girlProfile.major || '空')
          .replace('{girlHometown}', girlProfile.hometown || '空')
          .replace('{girlResidence}', girlProfile.residence || '空')
          .replace('{girlWorkplace}', girlProfile.workplace || '空')
          .replace('{girlStage}', girlProfile.stage || '未知')
          .replace('{tensionScore}', girlProfile.tensionScore || 5)
      },
      {
        type: 'image_url',
        image_url: { url: fullImageUrl }
      }
    ]
  }];

  const raw = await callVisionModel(messages);
  return repairJSON(raw);
}

// ============================================================================
// 朋友圈截图分析 Prompt
// ============================================================================

const MOMENT_VISION_ANALYSIS_PROMPT = `你是童锦程，两性关系专家，情感老中医。你的风格：接地气，有温度，懂人心，有经验，真诚自然，不油腔滑调，不套路撩骚。

分析以下朋友圈截图，提取对了解女生有帮助的信息。

【女生档案】
昵称：{girlName}
年龄：{girlAge}
职业：{girlOccupation}
当前阶段：{girlStage}
关系热度：{tensionScore}/10

请仔细看图，识别以下内容：

1. **内容分析**：这条朋友圈发的是什么？（美食、旅行、自拍、合照、工作、风景、宠物等）
2. **生活方式**：作息暗示、消费水平、社交频率、生活品质
3. **审美偏好**：穿着风格、拍照风格、修图风格、内容调性
4. **社交圈信号**：经常和谁出镜、朋友圈活跃度、朋友类型
5. **情绪状态**：发这条朋友圈时的情绪（开心/emo/炫耀/求关注/日常分享）
6. **关系暗示**：是否暗示单身、有对象、在约会等
7. **性格洞察**：外向/内向、文艺/接地气、精致/随性、高调/低调
8. **互动时机**：适合评论还是私聊切入、评论方向建议

请输出 JSON 格式的分析结果：
{
  "momentContent": "朋友圈内容描述（50字内）",
  "lifestyleSignals": ["生活方式信号1", "信号2"],
  "aestheticPreferences": "审美偏好描述",
  "socialSignals": ["社交圈信号1", "信号2"],
  "emotionalState": "情绪状态",
  "relationshipHints": ["关系暗示1", "暗示2"],
  "personalityInsights": "性格洞察（50字内）",
  "interactionAdvice": "互动建议（评论/私聊方向，30字内）"
}

只输出 JSON，不要其他内容。

重要原则：
1. 只输出图片中实际看到的内容，不要猜测、推断或编造没有依据的信息。
2. 如某些信息图片中没有体现，明确标注"未知"或留空，不要凭空填充。
3. lifestyleSignals、socialSignals、relationshipHints 等数组，如有信息则列出，如无则填空数组 []。
4. 互动建议基于实际内容提出，不要套用通用话术。`;

/**
 * 朋友圈截图分析
 */
async function analyzeMomentImage(girlProfile, imageUrl) {
  let fullImageUrl = imageUrl;
  if (imageUrl?.startsWith('/')) {
    fullImageUrl = (BASE_URL || 'http://localhost:3005') + imageUrl;
  }

  const messages = [{
    role: 'user',
    content: [
      {
        type: 'text',
        text: MOMENT_VISION_ANALYSIS_PROMPT
          .replace('{girlName}', girlProfile.name || '未知')
          .replace('{girlAge}', girlProfile.age || '未知')
          .replace('{girlOccupation}', girlProfile.occupation || '未知')
          .replace('{girlStage}', girlProfile.stage || '未知')
          .replace('{tensionScore}', girlProfile.tensionScore || 5)
      },
      {
        type: 'image_url',
        image_url: { url: fullImageUrl }
      }
    ]
  }];

  const raw = await callVisionModel(messages);
  return repairJSON(raw);
}

/**
 * 女生聊天分析（analyze 场景）
 */
async function analyzeGirlChat(girlProfile, chatContext) {
  const {
    message,
    history = [],
    recentSignals = [],
    pendingActions = [],
    observations = [],
    conversationSummary = '',
    operatorNotes = ''
  } = chatContext;

  // 解析 personality
  let personality = {};
  if (girlProfile.personality) {
    try { personality = typeof girlProfile.personality === 'string' ? JSON.parse(girlProfile.personality) : girlProfile.personality; }
    catch { personality = {}; }
  }

  const historyString = history.slice(-10).map(m => {
    const role = m.role === 'user' ? '我（客户/操盘手）' : (girlProfile.name || '女生');
    return `${role}: ${m.content}`;
  }).join('\n');

  const signalsText = recentSignals.length > 0
    ? recentSignals.map(s => `${s.type === 'positive' ? '[+]' : s.type === 'negative' ? '[-]' : '[*]'} ${s.event} — ${s.date}`).join('\n')
    : '暂无';

  const prompt = GIRL_CHAT_ANALYSIS_PROMPT
    .replace('{girlName}', girlProfile.name || '未知')
    .replace('{girlAge}', girlProfile.age || '未知')
    .replace('{girlOccupation}', girlProfile.occupation || '未知')
    .replace('{girlEducation}', girlProfile.education || '未知')
    .replace('{girlMajor}', girlProfile.major || '未知')
    .replace('{girlHometown}', girlProfile.hometown || '未知')
    .replace('{girlResidence}', girlProfile.residence || '未知')
    .replace('{girlWorkplace}', girlProfile.workplace || '未知')
    .replace('{girlStage}', girlProfile.stage || '聊天')
    .replace('{tensionScore}', girlProfile.tensionScore || 5)
    .replace('{intimacyLevel}', girlProfile.intimacyLevel || 1)
    .replace('{appearance}', girlProfile.appearance || '未知')
    .replace('{dressingStyle}', personality.dressingStyle || girlProfile.dressingStyle || '未知')
    .replace('{styleTags}', personality.styleTags || '未知')
    .replace('{familyBackground}', personality.familyBackground || '未知')
    .replace('{workSchedule}', personality.workSchedule || '未知')
    .replace('{dietPreferences}', (() => {
      // 优先读顶层 girlProfile.dietPreferences（逗号分隔字符串），fallback 到 personality JSON 数组
      if (girlProfile.dietPreferences) return girlProfile.dietPreferences;
      if (personality.dietPreferences && Array.isArray(personality.dietPreferences)) {
        return personality.dietPreferences.join('、');
      }
      return '未知';
    })())
    .replace('{dietRestrictions}', (() => {
      if (girlProfile.dietRestrictions) return girlProfile.dietRestrictions;
      if (personality.dietRestrictions && Array.isArray(personality.dietRestrictions)) {
        return personality.dietRestrictions.join('、');
      }
      return '无';
    })())
    .replace('{interests}', personality.interests ? personality.interests.join('、') : '未知')
    .replace('{mbti}', personality.mbti || '未知')
    .replace('{personality}', personality.type || '未知')
    .replace('{communicationStyle}', personality.communicationStyle || '未知')
    .replace('{emotionalTriggers}', (personality.emotionalTriggers || []).join('、') || '暂无')
    .replace('{thingsToAvoid}', (personality.thingsToAvoid || []).join('、') || '暂无')
    .replace('{talkingTopics}', (personality.talkingTopics || []).join('、') || '未知')
    .replace('{relationshipAttitude}', personality.relationshipAttitude || '未知')
    .replace('{attachmentStyle}', personality.attachmentStyle || '未知')
    .replace('{responsePattern}', personality.responsePattern || '未知')
    .replace('{recentSignals}', signalsText)
    .replace('{pendingActions}', pendingActions.length > 0 ? pendingActions.join('\n') : '暂无')
    .replace('{observations}', observations.length > 0 ? observations.join('\n') : '暂无')
    .replace('{conversationSummary}', conversationSummary || '暂无')
    .replace('{history}', historyString || '（暂无历史记录）')
    .replace('{message}', message)
    .replace('{operatorNotes}', operatorNotes || '无');

  const raw = await callTextModel(prompt);
  return repairJSON(raw);
}

/**
 * 客户聊天分析
 */
async function analyzeClientChat(clientProfile, chatContext) {
  const {
    message,
    recentMessages = []
  } = chatContext;

  const messagesText = recentMessages.length > 0
    ? recentMessages.map(m => `${m.role}: ${m.content}`).join('\n')
    : '（暂无历史记录）';

  const prompt = CLIENT_CHAT_ANALYSIS_PROMPT
    .replace('{clientName}', clientProfile.nickname || clientProfile.username || '未知')
    .replace('{serviceStage}', clientProfile.serviceStage || '建池')
    .replace('{communicationStyle}', clientProfile.communicationStyle || '含蓄')
    .replace('{clientType}', clientProfile.clientType || '执行型')
    .replace('{cooperation}', clientProfile.coachCooperation || '配合')
    .replace('{personality}', clientProfile.personality || '未知')
    .replace('{emotionalStable}', clientProfile.emotionalStable ? `${clientProfile.emotionalStable}/10` : '未知')
    .replace('{eqLevel}', clientProfile.eqLevel ? `${clientProfile.eqLevel}/10` : '未知')
    .replace('{socialStyle}', clientProfile.socialStyle || '未知')
    .replace('{relationshipAttitude}', clientProfile.relationshipAttitude || '未知')
    .replace('{emotionalGoal}', clientProfile.emotionalGoal || '未知')
    .replace('{strengths}', clientProfile.strengths || '未知')
    .replace('{weaknesses}', clientProfile.weaknesses || '未知')
    .replace('{selfValuePerception}', clientProfile.selfValuePerception || '未知')
    .replace('{learningAbility}', clientProfile.learningAbility || '未知')
    .replace('{feedbackQuality}', clientProfile.feedbackQuality || '未知')
    .replace('{selfEsteemLevel}', clientProfile.selfEsteemLevel || '未知')
    .replace('{antiFrustrationLevel}', clientProfile.antiFrustrationLevel ? `${clientProfile.antiFrustrationLevel}/10` : '未知')
    .replace('{interactionStyle}', clientProfile.interactionStyle || '未知')
    .replace('{humorStyle}', clientProfile.humorStyle || '正经')
    .replace('{petPhrases}', (() => {
      try { return Array.isArray(clientProfile.petPhrases) ? clientProfile.petPhrases.join('、') : clientProfile.petPhrases || '暂无'; }
      catch { return '暂无'; }
    })())
    .replace('{chatTaboos}', (() => {
      try { return Array.isArray(clientProfile.chatTaboos) ? clientProfile.chatTaboos.join('、') : clientProfile.chatTaboos || '暂无'; }
      catch { return '暂无'; }
    })())
    .replace('{trustLevel}', clientProfile.trustLevel || 1)
    .replace('{interactionHeat}', clientProfile.interactionHeat || 5)
    .replace('{recentMessages}', messagesText)
    .replace('{message}', message);

  const raw = await callTextModel(prompt);
  return repairJSON(raw);
}

// ============================================================================
// 档案字段标签映射
// ============================================================================

const GIRL_FIELD_LABELS = {
  age: '年龄', occupation: '职业', education: '学历', major: '专业',
  hometown: '籍贯', residence: '现居城市', workplace: '工作地点',
  appearance: '外貌', height: '身高', weight: '体重', bodyType: '体型',
  dressingStyle: '穿着风格', styleTags: '风格', familyBackground: '家庭背景',
  workSchedule: '工作时间', interests: '兴趣爱好', dietPreferences: '饮食偏好', dietRestrictions: '饮食禁忌',
  personality: '性格', communicationStyle: '沟通风格', emotionalTriggers: '情绪触发点',
  talkingTopics: '喜欢话题', thingsToAvoid: '禁忌话题',
  relationshipAttitude: '婚恋态度', attachmentStyle: '依恋类型', responsePattern: '回复规律',
  loveLanguage: '爱的语言', defenseMechanism: '防御机制', sexualAttractionSignals: '性吸引力信号',
  coreShame: '核心羞耻感', attachmentStyleDynamic: '依恋动态', valueConflict: '价值观冲突',
  responsivenessLevel: '回应质量'
};

const CLIENT_FIELD_LABELS = {
  emotionalStable: '情绪稳定性', eqLevel: '情商水平', communicationStyle: '沟通风格',
  coachCooperation: '配合度', feedbackQuality: '反馈质量', selfEsteemLevel: '自尊水平',
  learningAbility: '学习能力', interactionStyle: '互动风格', personality: '性格',
  chatTaboos: '代聊禁区', petPhrases: '口头禅', trustLevel: '信任度', interactionHeat: '互动热度',
  emotionalGoal: '感情诉求', relationshipAttitude: '婚恋态度', strengths: '核心卖点', weaknesses: '价值短板',
  pendingActions: '待推进事项'
};

/**
 * 提取女生待确认字段列表（过滤掉已有值的字段）
 */
function extractGirlPendingFields(profileUpdates, currentGirl) {
  const fields = {};
  if (!profileUpdates) return fields;

  const skipFields = ['signals', 'pendingActions', 'observations', 'tensionScore', 'stage'];

  for (const [key, value] of Object.entries(profileUpdates)) {
    if (skipFields.includes(key)) continue;
    if (value === null || value === undefined || value === '') continue;

    const label = GIRL_FIELD_LABELS[key];
    if (!label) continue;

    // 检查当前档案是否已有值
    const currentValue = currentGirl[key];
    if (currentValue !== null && currentValue !== undefined && currentValue !== '') continue;

    fields[key] = { label, value: String(value) };
  }

  return fields;
}

/**
 * 提取客户待确认字段列表
 */
function extractClientPendingFields(profileUpdates, currentClient) {
  const fields = {};
  if (!profileUpdates) return fields;

  for (const [key, value] of Object.entries(profileUpdates)) {
    if (value === null || value === undefined || value === '') continue;

    const label = CLIENT_FIELD_LABELS[key];
    if (!label) continue;

    const currentValue = currentClient[key];
    if (currentValue !== null && currentValue !== undefined && currentValue !== '') continue;

    fields[key] = { label, value: String(value) };
  }

  return fields;
}

// ============================================================================
// 用户主页截图分析 Prompt
// 从社交平台个人主页提取结构化档案信息
// ============================================================================

const PROFILE_SCREENSHOT_PROMPT = `你是童锦程，两性关系专家，情感老中医。你的风格：接地气，有温度，懂人心，有经验，真诚自然，不油腔滑调，不套路撩骚。

分析以下用户主页截图，提取关键档案信息。

【要求】
仔细识别图片中的以下信息：
1. 昵称（用户显示的名称）
2. 地区（省/市，如：四川成都、广东深圳）
3. 年龄（如果有明确显示）
4. 头像区域（是否有明显的女生头像图片区域描述）

请输出 JSON 格式的分析结果，只包含实际看到的信息，不要猜测或编造：
{
  "name": "识别到的昵称，没有则为空字符串",
  "age": 识别到的年龄数字，没有则为 null,
  "residence": "识别到的城市/地区，没有则为空字符串",
  "appearance": "如果能从头像看出穿着风格/外貌特征则填写，否则为空字符串"
}

重要规则：
1. 只输出 JSON，不要其他内容。
2. 年龄必须是数字或 null，不要写成字符串。
3. 地区只提取城市级别的地区（如"四川成都"、"广东深圳"），不要写详细地址。
4. 没有看到的字段留空字符串或 null，不要编造。`;

/**
 * 分析用户主页截图，提取昵称、地区、年龄等基础信息
 */
async function analyzeProfileImage(imageUrl) {
  let fullImageUrl = imageUrl;
  if (imageUrl?.startsWith('/')) {
    fullImageUrl = (BASE_URL || 'http://localhost:3005') + imageUrl;
  }

  const messages = [{
    role: 'user',
    content: [
      { type: 'text', text: PROFILE_SCREENSHOT_PROMPT },
      { type: 'image_url', image_url: { url: fullImageUrl } }
    ]
  }];

  const raw = await callVisionModel(messages);
  return repairJSON(raw);
}

// ============================================================================
// 模块导出
// ============================================================================

module.exports = {
  repairJSON,
  callTextModel,
  callVisionModel,
  analyzeGirlText,
  analyzeGirlImage,
  analyzeGirlChat,
  analyzeClientChat,
  analyzeMomentImage,
  analyzeProfileImage,
  extractGirlPendingFields,
  extractClientPendingFields,
  GIRL_FIELD_LABELS,
  CLIENT_FIELD_LABELS
};
