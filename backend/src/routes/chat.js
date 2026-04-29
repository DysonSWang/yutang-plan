/**
 * 私密聊天路由 - 操盘手和客户之间的1v1聊天
 */

const express = require('express');
const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config');
const prisma = require('../prisma');
const { decrypt } = require('../services/encryption');
const { downloadBuffer, deleteFile } = require('../services/ossClient');

module.exports = function(io) {
  const router = express.Router();

  // Auth middleware
  const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: '未登录' });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ error: 'token无效' });
    }
  };

  // Socket.io 推送消息
  const emitNewMessage = (session, message) => {
    if (!io) return;
    // 发送给会话的另一方
    const isOperator = session.operatorId === message.senderId;
    const room = isOperator ? `client:${session.clientId}` : `operator:${session.operatorId}`;
    console.log('[Chat] Emitting to room:', room, 'message:', message.id);
    io.to(room).emit('message:new', message);
  };

  // 获取操盘手的所有客户会话列表
  router.get('/sessions', authMiddleware, async (req, res) => {
    try {
      if (req.user.role !== 'operator' && req.user.role !== 'admin') {
        return res.status(403).json({ error: '无权限' });
      }

      // admin 可以查看所有 sessions，否则只查看自己的
      const where = req.user.role === 'admin' ? {} : { operatorId: req.user.id };
      const sessions = await prisma.chatSession.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' }
      });

      // 获取每个会话的客户信息
      const sessionsWithClients = await Promise.all(
        sessions.map(async (session) => {
          const client = await prisma.user.findUnique({
            where: { id: session.clientId },
            select: {
              id: true,
              nickname: true,
              avatar: true,
              serviceStage: true
            }
          });
          return { ...session, clientId: session.clientId, client };
        })
      );

      res.json({ success: true, sessions: sessionsWithClients });
    } catch (error) {
      console.error('[Chat] 获取会话列表失败:', error);
      res.status(500).json({ error: '获取失败' });
    }
  });

  // 客户获取自己的会话列表
  router.get('/my-sessions', authMiddleware, async (req, res) => {
    try {
      const sessions = await prisma.chatSession.findMany({
        where: { clientId: req.user.id },
        orderBy: { lastMessageAt: 'desc' }
      });

      const sessionsWithOperators = await Promise.all(
        sessions.map(async (session) => {
          const operator = await prisma.user.findUnique({
            where: { id: session.operatorId },
            select: { id: true, nickname: true, avatar: true }
          });
          return { ...session, client: operator };
        })
      );

      res.json({ success: true, sessions: sessionsWithOperators });
    } catch (error) {
      console.error('[Chat] 获取客户会话列表失败:', error);
      res.status(500).json({ error: '获取失败' });
    }
  });

  // 获取或创建与客户的会话
  router.post('/sessions', authMiddleware, async (req, res) => {
    try {
      if (req.user.role !== 'operator' && req.user.role !== 'admin') {
        return res.status(403).json({ error: '无权限' });
      }

      const { clientId } = req.body;
      if (!clientId) {
        return res.status(400).json({ error: '客户ID是必需的' });
      }

      // 查找或创建会话
      let session = await prisma.chatSession.findUnique({
        where: {
          operatorId_clientId: {
            operatorId: req.user.id,
            clientId
          }
        }
      });

      if (!session) {
        session = await prisma.chatSession.create({
          data: {
            operatorId: req.user.id,
            clientId
          }
        });
      }

      res.json({ success: true, session });
    } catch (error) {
      console.error('[Chat] 创建会话失败:', error);
      res.status(500).json({ error: '创建失败' });
    }
  });

  // 获取会话的消息历史
  router.get('/sessions/:sessionId/messages', authMiddleware, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { limit = 50, before } = req.query;

      const session = await prisma.chatSession.findUnique({
        where: { id: sessionId }
      });

      if (!session) {
        return res.status(404).json({ error: '会话不存在' });
      }

      // 验证权限
      if (session.operatorId !== req.user.id && session.clientId !== req.user.id) {
        return res.status(403).json({ error: '无权限' });
      }

      const where = { sessionId };
      if (before) {
        where.createdAt = { lt: new Date(before) };
      }

      const messages = await prisma.message.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit)
      });

      // 标记消息为已读
      await prisma.message.updateMany({
        where: {
          sessionId,
          senderRole: 'client',
          isRead: false
        },
        data: {
          isRead: true,
          readAt: new Date()
        }
      });

      // 更新未读数
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { unreadCount: 0 }
      });

      res.json({ success: true, messages: messages.reverse() });
    } catch (error) {
      console.error('[Chat] 获取消息失败:', error);
      res.status(500).json({ error: '获取失败' });
    }
  });

  // 发送消息
  router.post('/messages', authMiddleware, async (req, res) => {
    try {
      const { sessionId, content, type = 'text', isBurnAfterRead = false, burnAfterSeconds, isFlashImage = false, mediaUrl } = req.body;

      const session = await prisma.chatSession.findUnique({
        where: { id: sessionId }
      });

      if (!session) {
        return res.status(404).json({ error: '会话不存在' });
      }

      // 验证权限
      if (session.operatorId !== req.user.id && session.clientId !== req.user.id) {
        return res.status(403).json({ error: '无权限' });
      }

      // 确定发送者角色
      const senderRole = session.operatorId === req.user.id ? 'operator' : 'client';

      const message = await prisma.message.create({
        data: {
          sessionId,
          senderRole,
          senderId: req.user.id,
          content,
          type,
          mediaUrl,
          isBurnAfterRead,
          burnAfterSeconds: isBurnAfterRead ? burnAfterSeconds : null,
          isFlashImage
        }
      });

      // 更新会话
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: {
          lastMessage: content?.substring(0, 50),
          lastMessageAt: new Date(),
          unreadCount: session.operatorId === req.user.id ? 0 : session.unreadCount + 1
        }
      });

      // 通过 Socket.io 推送消息给另一方
      emitNewMessage(session, message);

      res.json({ success: true, message });
    } catch (error) {
      console.error('[Chat] 发送消息失败:', error);
      res.status(500).json({ error: '发送失败' });
    }
  });

  // 阅后即焚 / 闪图 - 标记消息已销毁
  router.post('/messages/:id/burn', authMiddleware, async (req, res) => {
    try {
      const message = await prisma.message.findUnique({
        where: { id: req.params.id }
      });

      if (!message) {
        return res.status(404).json({ error: '消息不存在' });
      }

      if (message.burnedAt) {
        return res.status(400).json({ error: '消息已被销毁' });
      }

      // 授权检查：发送者本人，或会话参与者
      const session = message.sessionId
        ? await prisma.chatSession.findUnique({ where: { id: message.sessionId } })
        : null;
      const isParticipant = session && (
        session.operatorId === req.user.id || session.clientId === req.user.id
      );
      if (message.senderId !== req.user.id && !isParticipant) {
        return res.status(403).json({ error: '无权限' });
      }

      // 删除OSS文件（敏感内容存OSS，非敏感也在OSS）
      if (message.mediaUrl && (message.mediaUrl.startsWith('/encrypted/') || message.mediaUrl.startsWith('/public/'))) {
        const ossPath = message.mediaUrl.replace(/^\//, ''); // 去掉前导 /
        try {
          await deleteFile(ossPath);
          console.log(`[Burn] Deleted OSS file: ${ossPath}`);
        } catch (err) {
          console.error(`[Burn] Failed to delete OSS file: ${ossPath}`, err.message);
        }
      }

      const updateData = {
        content: '[消息已销毁]',
        mediaUrl: null,
        burnedAt: new Date()
      };

      // 闪图时额外记录 flashBurnedAt
      if (message.isFlashImage) {
        updateData.flashBurnedAt = new Date();
      }

      await prisma.message.update({
        where: { id: req.params.id },
        data: updateData
      });

      const updated = await prisma.message.findUnique({ where: { id: req.params.id } });

      // 广播给会话另一方（同步销毁状态）
      if (session) {
        io.to(`operator:${session.operatorId}`).emit('message:burned', {
          sessionId: message.sessionId, messageId: message.id
        });
        io.to(`client:${session.clientId}`).emit('message:burned', {
          sessionId: message.sessionId, messageId: message.id
        });
      }
      res.json({ success: true, message: updated });
    } catch (error) {
      console.error('[Chat] 销毁消息失败:', error);
      res.status(500).json({ error: '操作失败' });
    }
  });

  // 流媒体解密接口 - 敏感内容走此接口解密展示
  router.get('/media/:messageId', authMiddleware, async (req, res) => {
    try {
      const message = await prisma.message.findUnique({
        where: { id: req.params.messageId }
      });

      if (!message) {
        return res.status(404).json({ error: '消息不存在' });
      }

      if (!message.mediaUrl) {
        return res.status(404).json({ error: '无媒体文件' });
      }

      if (message.burnedAt) {
        return res.status(410).json({ error: '内容已销毁' });
      }

      // 权限检查：发送者或接收者才能看
      const session = message.sessionId
        ? await prisma.chatSession.findUnique({ where: { id: message.sessionId } })
        : null;
      const isParticipant = session && (
        session.operatorId === req.user.id || session.clientId === req.user.id
      );
      if (message.senderId !== req.user.id && !isParticipant) {
        return res.status(403).json({ error: '无权限' });
      }

      // 非加密内容（/public/ 或旧本地路径），直接重定向或本地服务
      if (!message.mediaUrl.startsWith('/encrypted/')) {
        // 兼容旧本地文件
        if (message.mediaUrl.startsWith('/uploads/')) {
          return res.redirect(message.mediaUrl);
        }
        // public OSS 文件走重定向（需生成签名URL，暂用重定向）
        if (message.mediaUrl.startsWith('/public/')) {
          const { client } = require('../services/ossClient');
          const ossPath = message.mediaUrl.replace(/^\//, '');
          const url = await client.signatureUrl(ossPath, { expires: 3600 });
          return res.redirect(url);
        }
        return res.status(400).json({ error: '无法处理此媒体类型' });
      }

      // 加密内容（/encrypted/）：从OSS下载 → 内存解密 → 流返回
      const ossPath = message.mediaUrl.replace(/^\//, '');
      const encryptedBuffer = await downloadBuffer(ossPath);
      const plaintext = decrypt(encryptedBuffer);

      res.setHeader('Content-Type', message.type === 'video' ? 'video/mp4' : message.type === 'audio' ? 'audio/mpeg' : 'image/jpeg');
      res.setHeader('Cache-Control', 'no-store, no-cache, private');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Length', plaintext.length);
      res.end(plaintext);
    } catch (error) {
      console.error('[Chat] 流媒体获取失败:', error);
      res.status(500).json({ error: '获取失败' });
    }
  });

  // 标记消息已读
  router.post('/messages/:id/read', authMiddleware, async (req, res) => {
    try {
      const message = await prisma.message.update({
        where: { id: req.params.id },
        data: {
          isRead: true,
          readAt: new Date()
        }
      });

      res.json({ success: true, message });
    } catch (error) {
      console.error('[Chat] 标记已读失败:', error);
      res.status(500).json({ error: '操作失败' });
    }
  });

  // 撤回消息
  router.post('/messages/:id/recall', authMiddleware, async (req, res) => {
    try {
      const message = await prisma.message.findUnique({
        where: { id: req.params.id }
      });

      if (!message) {
        return res.status(404).json({ error: '消息不存在' });
      }

      if (message.recalledAt) {
        return res.status(400).json({ error: '消息已被撤回' });
      }

      if (message.senderId !== req.user.id) {
        return res.status(403).json({ error: '只能撤回自己的消息' });
      }

      // 删除OSS文件（撤回也清理媒体文件）
      if (message.mediaUrl && (message.mediaUrl.startsWith('/encrypted/') || message.mediaUrl.startsWith('/public/'))) {
        const ossPath = message.mediaUrl.replace(/^\//, '');
        try {
          await deleteFile(ossPath);
        } catch (err) {
          console.error(`[Recall] Failed to delete OSS file: ${ossPath}`, err.message);
        }
      }

      const updated = await prisma.message.update({
        where: { id: req.params.id },
        data: {
          content: '[消息已撤回]',
          mediaUrl: null,
          recalledAt: new Date()
        }
      });

      const session = await prisma.chatSession.findUnique({
        where: { id: message.sessionId }
      });
      if (session) {
        io.to(`operator:${session.operatorId}`).emit('message:recalled', {
          sessionId: message.sessionId, messageId: message.id
        });
        io.to(`client:${session.clientId}`).emit('message:recalled', {
          sessionId: message.sessionId, messageId: message.id
        });
      }

      res.json({ success: true, message: updated });
    } catch (error) {
      console.error('[Chat] 撤回消息失败:', error);
      res.status(500).json({ error: '操作失败' });
    }
  });

  // ========== 客户档案（操盘手专用）==========

  // 获取客户档案
  router.get('/profile/:clientId', authMiddleware, async (req, res) => {
    try {
      if (req.user.role !== 'operator' && req.user.role !== 'admin') {
        return res.status(403).json({ error: '无权限' });
      }

      const { clientId } = req.params;

      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId }
      });
      if (!session) {
        return res.status(403).json({ error: '无权限查看此客户档案' });
      }

      const user = await prisma.user.findUnique({
        where: { id: clientId },
        select: {
          id: true, nickname: true, avatar: true, phone: true,
          age: true, occupation: true, education: true, income: true,
          height: true, residence: true, hometown: true,
          appearance: true, personality: true, emotionalStable: true,
          eqLevel: true, communicationStyle: true, socialStyle: true,
          relationshipAttitude: true, marriageHistory: true,
          emotionalWounds: true, exPartnerTaboos: true,
          emotionalGoal: true, relationshipGoal: true,
          commitmentWillingness: true, emotionalMaturity: true,
          learningAbility: true, coachCooperation: true,
          feedbackQuality: true, clientType: true,
          selfValuePerception: true, cognitiveAccuracy: true,
          assetsLevel: true, budgetRange: true,
          timeInvestment: true, serviceStage: true,
          signals: true, pendingActions: true,
          observations: true, conversationSummary: true,
          matchPreferences: true, dealbreakers: true,
          interactionStyle: true, chatTaboos: true,
          humorStyle: true, currentStage: true,
          stageProgress: true, lastMilestone: true,
          selfEsteemLevel: true, antiFrustrationLevel: true,
          pacePreference: true, investmentWillingness: true,
          comfortZone: true, notes: true, source: true,
        }
      });

      if (!user) {
        return res.status(404).json({ error: '客户不存在' });
      }

      res.json({ success: true, profile: user });
    } catch (error) {
      console.error('[Chat] 获取客户档案失败:', error);
      res.status(500).json({ error: '获取失败' });
    }
  });

  // 分析聊天记录，建议客户档案字段
  router.post('/profile/:clientId/suggest', authMiddleware, async (req, res) => {
    try {
      if (req.user.role !== 'operator' && req.user.role !== 'admin') {
        return res.status(403).json({ error: '无权限' });
      }

      const { clientId } = req.params;

      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId }
      });
      if (!session) {
        return res.status(403).json({ error: '无权限' });
      }

      const messages = await prisma.message.findMany({
        where: { sessionId: session.id, recalledAt: null, burnedAt: null, content: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { content: true, senderRole: true, createdAt: true }
      });

      if (messages.length === 0) {
        return res.json({ success: true, suggestions: [], chatSummary: '', messageCount: 0 });
      }

      const chatText = messages.map(m => {
        const role = m.senderRole === 'operator' ? '[操盘手]' : '[客户]';
        return `${role} ${m.content}`;
      }).join('\n');

      const chatSummary = messages.slice(0, 8).map(m => {
        const role = m.senderRole === 'operator' ? '操盘手' : '客户';
        return `${role}: ${m.content}`;
      }).join(' | ');

      const user = await prisma.user.findUnique({
        where: { id: clientId },
        select: {
          nickname: true, phone: true, age: true, height: true,
          occupation: true, education: true, income: true, residence: true,
          hometown: true, personality: true, communicationStyle: true,
          socialStyle: true, relationshipAttitude: true, marriageHistory: true,
          emotionalWounds: true, emotionalGoal: true, learningAbility: true,
          coachCooperation: true, feedbackQuality: true, clientType: true,
          emotionalStable: true, eqLevel: true, commitmentWillingness: true,
          emotionalMaturity: true, selfValuePerception: true, cognitiveAccuracy: true,
          assetsLevel: true, budgetRange: true, timeInvestment: true,
          interactionStyle: true, humorStyle: true, selfEsteemLevel: true,
          antiFrustrationLevel: true, pacePreference: true, investmentWillingness: true,
          comfortZone: true, matchPreferences: true, dealbreakers: true,
          currentStage: true, stageProgress: true, lastMilestone: true,
          signals: true, observations: true, conversationSummary: true, notes: true,
        }
      });

      const suggestions = [];
      const getCurrent = (val) => val != null ? String(val) : '未填写';

      // 年龄：匹配 "XX岁" 或 "我XX岁" 或 "大XX岁" 模式
      const agePatterns = [
        { re: /我(?:大|约)?(\d{2})岁/g, confidence: 'high' },
        { re: /(?:大|约)(\d{2})\s*岁/g, confidence: 'medium' },
        { re: /\b(\d{2})\s*岁(?!\d)/g, confidence: 'medium' },
      ];
      if (!user.age) {
        for (const p of agePatterns) {
          p.re.lastIndex = 0;
          const m = p.re.exec(chatText);
          if (m) {
            const age = parseInt(m[1]);
            if (age >= 18 && age <= 65) {
              suggestions.push({ field: 'age', fieldLabel: '年龄', confidence: p.confidence, currentValue: getCurrent(user.age), suggestedValue: String(age), evidence: `聊天中提到"${m[0]}"` });
              break;
            }
          }
        }
      }

      // 身高：匹配 "175cm" 或 "身高175" 模式
      const heightPatterns = [
        { re: /身高\s*(\d{3})\s*(?:cm|厘米)?/g, confidence: 'high' },
        { re: /(\d{3})\s*(?:cm|厘米|CM)/g, confidence: 'medium' },
        { re: /(?:我是|我是|身高)(\d{3})/g, confidence: 'high' },
      ];
      if (!user.height) {
        for (const p of heightPatterns) {
          p.re.lastIndex = 0;
          const m = p.re.exec(chatText);
          if (m) {
            const h = parseInt(m[1]);
            if (h >= 140 && h <= 220) {
              suggestions.push({ field: 'height', fieldLabel: '身高(cm)', confidence: p.confidence, currentValue: getCurrent(user.height), suggestedValue: String(h), evidence: `聊天中提到"${m[0]}"` });
              break;
            }
          }
        }
      }

      // 职业
      const occPatterns = [
        [/程序员|码农|IT(?:行业|工作)|开发(?:人员|者|)|软件工程师/, '互联网/技术'],
        [/销售(?:员|代表|)|业务(?:员|)|商务/, '销售/商务'],
        [/老师|教师|教育(?:工作|行业)|讲师/, '教育'],
        [/医生|护士|医疗(?:行业|工作)|大夫/, '医疗'],
        [/会计|财务(?:人员|)|金融(?:行业|工作)/, '金融/财务'],
        [/设计师|UI(?:设计|)|美工|平面设计/, '设计'],
        [/运营|市场推广|策划/, '运营/市场'],
        [/学生|在校(?:生|)|大学(?:生|)|学院/, '学生'],
        [/创业(?:者|)|老板(?:开公司|)|自由职业/, '创业/自由职业'],
      ];
      for (const [pattern, label] of occPatterns) {
        if (pattern.test(chatText) && !user.occupation) {
          suggestions.push({ field: 'occupation', fieldLabel: '职业', confidence: 'medium', currentValue: getCurrent(user.occupation), suggestedValue: label, evidence: `对话中涉及${label}相关内容` });
          break;
        }
      }

      // 学历
      const eduPatterns = [
        [/博士(?:生|学位|)|PhD/, '博士'],
        [/硕士(?:生|学位|)|MBA|研究生/, '硕士'],
        [/本科|大学(?:毕业|在读|)|大专/, '本科/大专'],
        [/高中|中专|职高|高中学历/, '高中/中专'],
      ];
      for (const [pattern, label] of eduPatterns) {
        if (pattern.test(chatText) && !user.education) {
          suggestions.push({ field: 'education', fieldLabel: '学历', confidence: 'medium', currentValue: getCurrent(user.education), suggestedValue: label, evidence: `对话中提到${label}背景` });
          break;
        }
      }

      // 所在地
      const cities = ['北京', '上海', '深圳', '广州', '杭州', '成都', '武汉', '南京', '西安', '重庆', '天津', '苏州', '厦门', '长沙', '郑州', '青岛', '大连', '沈阳', '哈尔滨'];
      for (const city of cities) {
        const re = new RegExp(`(?:在|坐标|位于|住|工作地在)(?:于)?${city}`, 'g');
        if (re.test(chatText) && !user.residence) {
          suggestions.push({ field: 'residence', fieldLabel: '所在地', confidence: 'medium', currentValue: getCurrent(user.residence), suggestedValue: city, evidence: `对话中提到在${city}工作/生活` });
          break;
        }
      }

      // 收入水平
      const incomePatterns = [
        { re: /月薪\s*(?:大概|约)?(\d+)\s*k/gi, fmt: v => `月薪${v}k` },
        { re: /月薪\s*(?:大概|约)?(\d+)\s*万/gi, fmt: v => `月薪${v}万` },
        { re: /(\d+)\s*k\s*(?:月薪|工资)/gi, fmt: v => `月薪${v}k` },
        { re: /(\d+)\s*万\s*(?:月薪|工资)/gi, fmt: v => `月薪${v}万` },
        { re: /年薪\s*(?:大概|约)?(\d+)\s*万/gi, fmt: v => `年薪${v}万` },
      ];
      for (const p of incomePatterns) {
        p.re.lastIndex = 0;
        const m = p.re.exec(chatText);
        if (m) {
          const num = parseInt(m[1]);
          const suggested = p.fmt(String(num));
          if (num && suggested !== user.income) {
            suggestions.push({ field: 'income', fieldLabel: '收入水平', confidence: 'medium', currentValue: getCurrent(user.income), suggestedValue: suggested, evidence: `聊天中提到"${m[0]}"` });
            break;
          }
        }
      }

      // 沟通风格
      const commPatterns = [
        [/(?:话多|话很多|特别能聊|很健谈|话痨)/, '话多'],
        [/(?:话少|话不多|内敛|话很少|不善言辞)/, '话少'],
        [/(?:直接|很直接|很坦率)/, '直接'],
        [/(?:含蓄|委婉|不太直接)/, '含蓄'],
        [/(?:高冷|冷淡|爱搭不理)/, '冷淡'],
        [/(?:热情|很热情|很主动)/, '热情主动'],
      ];
      for (const [pattern, label] of commPatterns) {
        if (pattern.test(chatText) && !user.communicationStyle) {
          suggestions.push({ field: 'communicationStyle', fieldLabel: '沟通风格', confidence: 'medium', currentValue: getCurrent(user.communicationStyle), suggestedValue: label, evidence: `对话中表现${label}的特点` });
          break;
        }
      }

      // 婚恋态度
      const relPatterns = [
        [/(?:认真|真诚|真心|想找对象|想谈恋爱|认真的)/, '认真'],
        [/(?:随便|玩玩|不着急|随便试试)/, '随便'],
        [/(?:急切|着急|很着急|恨嫁|急着找)/, '急切'],
        [/(?:家里催|父母催|被催婚|相亲)/, '家里催'],
        [/(?:空虚|无聊|寂寞|打发时间)/, '空虚'],
      ];
      for (const [pattern, label] of relPatterns) {
        if (pattern.test(chatText) && !user.relationshipAttitude) {
          suggestions.push({ field: 'relationshipAttitude', fieldLabel: '婚恋态度', confidence: 'high', currentValue: getCurrent(user.relationshipAttitude), suggestedValue: label, evidence: `对话中表现出${label}的态度` });
          break;
        }
      }

      // 配合度
      const coopPatterns = [
        [/(?:配合|听话|照做|按你说的|好的|行|可以)/g, '配合'],
        [/(?:抵触|反抗|不想|别管我|不听话)/g, '抵触'],
        [/(?:一般|还行|看情况|无所谓)/g, '一般'],
      ];
      for (const [pattern, label] of coopPatterns) {
        const hits = chatText.match(pattern) || [];
        if (hits.length >= 2 && !user.coachCooperation) {
          suggestions.push({ field: 'coachCooperation', fieldLabel: '配合度', confidence: 'medium', currentValue: getCurrent(user.coachCooperation), suggestedValue: label, evidence: `对话中${label}的表现出现${hits.length}次` });
          break;
        }
      }

      // 客户类型
      const typePatterns = [
        [/(?:执行|照做|听话|配合|你说)/, '执行型'],
        [/(?:质疑|怀疑|为什么|不一定|不一定对)/, '质疑型'],
        [/(?:自己做|自己来|我有想法|我懂)/, '自主型'],
      ];
      for (const [pattern, label] of typePatterns) {
        if (pattern.test(chatText) && !user.clientType) {
          suggestions.push({ field: 'clientType', fieldLabel: '客户类型', confidence: 'medium', currentValue: getCurrent(user.clientType), suggestedValue: label, evidence: `对话中表现出${label}的特点` });
          break;
        }
      }

      // 情绪稳定性
      const stablePatterns = [
        [/(?:情绪稳定|很稳|淡定|沉得住)/, { label: '高', val: 8 }],
        [/(?:容易|比较)emo|情绪化|容易崩|玻璃心/, { label: '低', val: 3 }],
      ];
      for (const [pattern, info] of stablePatterns) {
        if (pattern.test(chatText) && !user.emotionalStable) {
          suggestions.push({ field: 'emotionalStable', fieldLabel: '情绪稳定性', confidence: 'medium', currentValue: getCurrent(user.emotionalStable), suggestedValue: String(info.val), evidence: `对话中表现出${info.label}的情绪特点` });
          break;
        }
      }

      // 服务阶段
      const stagePatterns = [
        [/背调|调查|查人|查底/, '背调'],
        [/建池|建资源|加女生|资源/, '建池'],
        [/约会|见面|约出来|约饭/, '约会'],
        [/锁定|确定|确认关系|在一起了/, '锁定'],
        [/维护|长期|长期关系|维护中/, '维护'],
      ];
      for (const [pattern, label] of stagePatterns) {
        if (pattern.test(chatText) && !user.serviceStage) {
          suggestions.push({ field: 'serviceStage', fieldLabel: '服务阶段', confidence: 'medium', currentValue: getCurrent(user.serviceStage), suggestedValue: label, evidence: `对话中涉及${label}相关内容` });
          break;
        }
      }

      res.json({ success: true, suggestions, chatSummary, messageCount: messages.length });
    } catch (error) {
      console.error('[Chat] 分析聊天记录失败:', error);
      res.status(500).json({ error: '分析失败' });
    }
  });

  // 批量更新客户档案
  router.patch('/profile/:clientId', authMiddleware, async (req, res) => {
    try {
      if (req.user.role !== 'operator' && req.user.role !== 'admin') {
        return res.status(403).json({ error: '无权限' });
      }

      const { clientId } = req.params;

      const session = await prisma.chatSession.findFirst({
        where: { operatorId: req.user.id, clientId }
      });
      if (!session) {
        return res.status(403).json({ error: '无权限更新此档案' });
      }

      const user = await prisma.user.findUnique({ where: { id: clientId } });
      if (!user) {
        return res.status(404).json({ error: '客户不存在' });
      }

      const allowedFields = [
        'nickname', 'phone', 'age', 'height',
        'occupation', 'education', 'income', 'residence', 'hometown',
        'appearance', 'personality', 'emotionalStable', 'eqLevel',
        'communicationStyle', 'socialStyle',
        'relationshipAttitude', 'marriageHistory', 'emotionalWounds', 'exPartnerTaboos',
        'emotionalGoal', 'relationshipGoal', 'commitmentWillingness', 'emotionalMaturity',
        'learningAbility', 'coachCooperation', 'feedbackQuality',
        'clientType', 'selfValuePerception', 'cognitiveAccuracy',
        'assetsLevel', 'budgetRange', 'timeInvestment', 'serviceStage',
        'signals', 'pendingActions', 'observations', 'conversationSummary',
        'matchPreferences', 'dealbreakers',
        'interactionStyle', 'chatTaboos', 'humorStyle',
        'currentStage', 'stageProgress', 'lastMilestone',
        'selfEsteemLevel', 'antiFrustrationLevel', 'pacePreference',
        'investmentWillingness', 'comfortZone',
        'notes', 'source',
      ];

      const updates = {};
      for (const [key, val] of Object.entries(req.body)) {
        if (allowedFields.includes(key)) {
          updates[key] = val;
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: '无可更新字段' });
      }

      const updated = await prisma.user.update({
        where: { id: clientId },
        data: updates
      });

      res.json({ success: true, profile: updated });
    } catch (error) {
      console.error('[Chat] 更新客户档案失败:', error);
      res.status(500).json({ error: '更新失败' });
    }
  });

  return router;
};
