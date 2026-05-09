/**
 * 异步 AI 分析服务
 *
 * 通用后台分析 helper：保存记录 → 设置 pending → 立即返回 → 后台运行 AI → Socket.io 通知
 *
 * 职责：
 * 1. 提供 runAsyncAnalysis() — 统一的异步分析入口
 * 2. 提供 Semaphore — 限制并发 AI 调用数（默认 2）
 * 3. 处理错误边界：任何错误更新 DB 为 failed + 通知前端
 */

const { extractFromImage } = require('./signalExtractor');

// ============================================================================
// Semaphore — 限制并发 AI 调用
// ============================================================================

class Semaphore {
  constructor(maxConcurrent = 2) {
    this.max = maxConcurrent;
    this.current = 0;
    this.queue = [];
  }

  async acquire() {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    await new Promise(resolve => this.queue.push(resolve));
    this.current++;
  }

  release() {
    this.current--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    }
  }
}

const semaphore = new Semaphore(2);

// ============================================================================
// 客户截图档案提取
// ============================================================================

const CLIENT_EXTRACT_PROMPT = `分析以下聊天截图，从对话内容中提取客户（发送消息的一方）的档案信息，直接输出JSON（不要markdown代码块，不要其他文字）。

请仔细阅读截图中的聊天文字，识别客户的基本信息、性格特征、沟通风格等。

【规则】
1. 有选项的字段必须从可选值中选择，不要自己编
2. 数字字段填数字字符串如"7"，不要文字
3. 截图中未提及的字段填空字符串""
4. 只输出实际看到的信息，不要猜测、推断或编造

【字段与可选值】
age: 数字（如果提到出生年份推算年龄，当前2026年）
height: 数字(cm)
weight: 数字(kg)
residence: 城市名
hometown: 城市名
occupation: 企业主/企业高管/公务员/医生/律师/教师/工程师/程序员/销售/金融从业者/自由职业/退休/其他
education: 小学/初中/中专/高中/大专/本科/硕士/博士
income: 10万以下/10-30万/30-50万/50-100万/100-300万/300万以上
personality: INTJ/INTP/ENTJ/ENTP/INFJ/INFP/ENFJ/ENFP/ISTJ/ISFJ/ESTJ/ESFJ/ISTP/ISFP/ESTP/ESFP/其他
familyBackground: 农村/城市/经商/公务员/其他
familyStructure: 双亲/单亲/离异/其他
familyAtmosphere: 和睦/一般/冷淡/争吵/离异
marriageHistory: 未婚/离异无子/离异有子/丧偶
emotionalGoal: 认真找对象/随便玩玩/家里催婚/空虚寂寞
relationshipGoal: 短期/长期/不确定
relationshipAttitude: 认真/随便/急切
communicationStyle: 直接/含蓄/话多/话少/幽默
socialStyle: 主动/被动/社交达人
emotionalStable: 1-10数字
eqLevel: 1-10数字
emotionalMaturity: 幼稚/一般/成熟
emotionalMaturityLevel: 1-10数字
learningAbility: 强/中/弱
coachCooperation: 配合/一般/抵触
coachCooperationLevel: 1-10数字
attachmentStyle: 焦虑型/回避型/安全型
loveStyle: 真诚型/陪伴型/言语型/身体型/浪漫型
moneyDatingPattern: AA/请客/轮流/看情况
humorStyle: 冷幽默/自嘲/调侃/正经
selfEsteemLevel: 高/中/低
pacePreference: 快节奏/稳健型/慢热型
assetsLevel: A6/A7/A8/A9/A10/A10+
clientType: 执行型/质疑型/自主型
empathy: 1-10数字
communication: 1-10数字
conflictRes: 1-10数字
appearance: 外貌描述文本
appearanceSelfAssessment: 自我颜值评价文本
appearanceSelfRequirement: 对对方颜值要求文本
strengths: 优势/优点文本
weaknesses: 缺点/不足文本
dateTaboos: 约会禁忌文本
notes: 其他值得记录的备注
dressingStyle: 穿着风格
profileBio: 个人签名/简介
matchPreferences: 对目标对象的期望描述（年龄、身高、学历、性格、收入等要求）`;

async function runClientExtractAnalysis(screenshotId, imageUrl, operatorId, io) {
  const prisma = require('../prisma');
  const { callVisionModel, repairJSON } = require('./profileEngine');

  const messages = [{
    role: 'user',
    content: [
      { type: 'text', text: CLIENT_EXTRACT_PROMPT },
      { type: 'image_url', image_url: { url: imageUrl } }
    ]
  }];

  try {
    const raw = await callVisionModel(messages);
    let content = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    let pendingFields = {};
    if (content) {
      const extracted = JSON.parse(content);
      for (const [key, value] of Object.entries(extracted)) {
        if (value && value !== '' && value !== '空' && value !== '未知') {
          pendingFields[key] = value;
        }
      }
    }

    const count = Object.keys(pendingFields).length;

    await prisma.chatScreenshot.update({
      where: { id: screenshotId },
      data: {
        analysisStatus: 'completed',
        analysisResult: JSON.stringify({ pendingFields, count }),
        analyzedAt: new Date()
      }
    });

    io.to(`operator:${operatorId}`).emit('screenshot:analyzed', {
      screenshotId,
      status: 'completed',
      result: { pendingFields, count, type: 'client-extract' }
    });
  } catch (error) {
    await prisma.chatScreenshot.update({
      where: { id: screenshotId },
      data: {
        analysisStatus: 'failed',
        analysisError: error.message,
        analyzedAt: new Date()
      }
    });

    io.to(`operator:${operatorId}`).emit('screenshot:analyzed', {
      screenshotId,
      status: 'failed',
      error: error.message
    });
  }
}

// ============================================================================
// 通用异步分析
// ============================================================================

/**
 * 后台运行截图分析，完成后通过 Socket.io 通知前端
 *
 * @param {Object} params
 * @param {string} params.screenshotId - ChatScreenshot 记录 ID
 * @param {string} params.girlId - 女生 ID
 * @param {string} params.imageUrl - 图片 URL
 * @param {string} params.operatorId - 操盘手 ID（用于 Socket.io 通知）
 * @param {Object} params.io - Socket.io 实例
 * @param {string} params.notes - 备注（可选）
 * @param {boolean} params.isMomentScreenshot - 是否朋友圈截图
 * @param {string} params.baseUrl - 后端 base URL
 */
async function runAsyncAnalysis({
  screenshotId,
  girlId,
  imageUrl,
  operatorId,
  io,
  notes,
  isMomentScreenshot = false,
  baseUrl
}) {
  const prisma = require('../prisma');

  await semaphore.acquire();
  try {
    // 更新状态为 processing
    await prisma.chatScreenshot.update({
      where: { id: screenshotId },
      data: { analysisStatus: 'processing' }
    });

    console.log(`[AsyncAnalysis] 开始分析截图 ${screenshotId}`);

    // 特殊标记：客户提取不关联女生，走专用分析
    if (girlId === 'client-extract') {
      await runClientExtractAnalysis(screenshotId, imageUrl, operatorId, io);
      return;
    }

    // 调用 AI 分析（女生截图）
    const result = await extractFromImage(girlId, imageUrl, baseUrl, operatorId, isMomentScreenshot);

    if (result?.error) {
      // AI 分析返回了 error 字段
      await prisma.chatScreenshot.update({
        where: { id: screenshotId },
        data: {
          analysisStatus: 'failed',
          analysisError: result.error,
          analyzedAt: new Date()
        }
      });
      io.to(`operator:${operatorId}`).emit('screenshot:analyzed', {
        screenshotId,
        status: 'failed',
        error: result.error
      });
      return;
    }

    if (!result?.analysis) {
      // 没有分析结果
      await prisma.chatScreenshot.update({
        where: { id: screenshotId },
        data: {
          analysisStatus: 'failed',
          analysisError: 'AI 未返回分析结果',
          analyzedAt: new Date()
        }
      });
      io.to(`operator:${operatorId}`).emit('screenshot:analyzed', {
        screenshotId,
        status: 'failed',
        error: 'AI 未返回分析结果'
      });
      return;
    }

    // 3. 成功后更新记录（女生截图）
    const analysisData = result.analysis;
    const aiNotes = result.aiNotes || '';
    const chatText = result.chatText || '';
    const pendingFields = result.pendingFields || {};
    const pendingId = result.pendingId;

    await prisma.chatScreenshot.update({
      where: { id: screenshotId },
      data: {
        analysisStatus: 'completed',
        analysisResult: JSON.stringify({
          aiNotes,
          chatText,
          pendingFields,
          pendingId,
          analysis: analysisData
        }),
        notes: aiNotes,
        chatText,
        analyzedAt: new Date()
      }
    });

    console.log(`[AsyncAnalysis] 截图 ${screenshotId} 分析完成`);

    // 4. 通知前端
    io.to(`operator:${operatorId}`).emit('screenshot:analyzed', {
      screenshotId,
      status: 'completed',
      result: {
        aiNotes,
        chatText,
        pendingFields,
        pendingId,
        analysis: analysisData
      }
    });
  } catch (error) {
    // 5. 任何错误都要更新状态 + 通知前端
    console.error(`[AsyncAnalysis] 截图 ${screenshotId} 分析失败:`, error.message);

    try {
      await prisma.chatScreenshot.update({
        where: { id: screenshotId },
        data: {
          analysisStatus: 'failed',
          analysisError: error.message,
          analyzedAt: new Date()
        }
      });

      io.to(`operator:${operatorId}`).emit('screenshot:analyzed', {
        screenshotId,
        status: 'failed',
        error: error.message
      });
    } catch (dbError) {
      console.error(`[AsyncAnalysis] 更新失败状态时也出错 ${screenshotId}:`, dbError.message);
    }
  } finally {
    semaphore.release();
  }
}

// ============================================================================
// 启动时恢复 stuck 的 pending/processing 任务
// ============================================================================

async function recoverStuckJobs(prisma) {
  try {
    const stuck = await prisma.chatScreenshot.findMany({
      where: {
        analysisStatus: { in: ['pending', 'processing'] }
      },
      select: { id: true, girlId: true, imageUrl: true, operatorId: true, notes: true, createdAt: true }
    });

    if (stuck.length === 0) return;

    console.log(`[AsyncAnalysis] 发现 ${stuck.length} 个 stuck 任务，标记为 failed`);

    // 超过 10 分钟的 stuck 任务标记为 failed
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const reallyStuck = stuck.filter(s => s.createdAt < tenMinutesAgo);

    if (reallyStuck.length > 0) {
      await prisma.chatScreenshot.updateMany({
        where: {
          id: { in: reallyStuck.map(s => s.id) }
        },
        data: {
          analysisStatus: 'failed',
          analysisError: '任务超时（服务重启或进程崩溃）',
          analyzedAt: new Date()
        }
      });
      console.log(`[AsyncAnalysis] 已标记 ${reallyStuck.length} 个超时任务为 failed`);
    }
  } catch (error) {
    console.error('[AsyncAnalysis] 恢复 stuck 任务失败:', error.message);
  }
}

module.exports = {
  runAsyncAnalysis,
  recoverStuckJobs,
  Semaphore
};
