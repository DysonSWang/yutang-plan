/**
 * 共享测试夹具工厂
 *
 * 所有 E2E 测试共享同一套用户/女生/会话数据，
 * 避免每个测试文件各自创建导致 ID 不一致、权限验证失败。
 *
 * 使用方式：
 *   const { setup, cleanup, tokens, ids } = require('./fixtures');
 *   beforeAll(setup);
 *   afterAll(cleanup);
 */

const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
const prisma = require('../prisma');

/** 预置测试用户和资源 */
async function createTestData() {
  // 测试用户（复用已有，幂等）
  let operator = await prisma.user.findFirst({ where: { username: 'op_e2e' } });
  let client = await prisma.user.findFirst({ where: { username: 'cl_e2e' } });
  let otherClient = await prisma.user.findFirst({ where: { username: 'cl_e2e_other' } });

  if (!operator) {
    operator = await prisma.user.create({
      data: {
        username: 'op_e2e',
        password: await bcrypt.hash('op123456', 10),
        role: 'operator',
        nickname: 'E2E操盘手',
        phone: '13900000001'
      }
    });
  }
  if (!client) {
    client = await prisma.user.create({
      data: {
        username: 'cl_e2e',
        password: await bcrypt.hash('cl123456', 10),
        role: 'client',
        nickname: 'E2E客户',
        phone: '13900000002',
        serviceStage: '建池'
      }
    });
  }
  if (!otherClient) {
    otherClient = await prisma.user.create({
      data: {
        username: 'cl_e2e_other',
        password: await bcrypt.hash('cl123456', 10),
        role: 'client',
        nickname: '其他客户',
        phone: '13900000003'
      }
    });
  }

  // 聊天会话
  let session = await prisma.chatSession.findUnique({
    where: { operatorId_clientId: { operatorId: operator.id, clientId: client.id } }
  });
  if (!session) {
    session = await prisma.chatSession.create({
      data: { operatorId: operator.id, clientId: client.id }
    });
  }

  // 测试女生
  let girl = await prisma.girl.findFirst({ where: { clientId: client.id, name: 'E2E测试女生' } });
  if (!girl) {
    girl = await prisma.girl.create({
      data: {
        clientId: client.id,
        name: 'E2E测试女生',
        stage: '聊天',
        status: 'active',
        tensionScore: 5,
        intimacyLevel: 2
      }
    });
  }

  // 另一个客户的女生（用于跨客户权限测试）
  let otherGirl = await prisma.girl.findFirst({ where: { clientId: otherClient.id, name: '其他客户女生' } });
  if (!otherGirl) {
    otherGirl = await prisma.girl.create({
      data: {
        clientId: otherClient.id,
        name: '其他客户女生',
        stage: '陌生',
        status: 'active'
      }
    });
  }

  // 代聊记录
  let chatLog = await prisma.chatLog.findFirst({ where: { girlId: girl.id, content: '测试代聊' } });
  if (!chatLog) {
    chatLog = await prisma.chatLog.create({
      data: {
        girlId: girl.id,
        clientId: client.id,
        operatorId: operator.id,
        content: '测试代聊',
        receiverName: '女生',
        type: 'text',
        aiAdopted: false,
        isVisibleToClient: false
      }
    });
  }

  // 进度记录
  let progress = await prisma.serviceProgress.findFirst({ where: { userId: client.id, stage: 1 } });
  if (!progress) {
    progress = await prisma.serviceProgress.create({
      data: {
        userId: client.id,
        stage: 1,
        stageName: '背调',
        status: 'completed',
        completedAt: new Date()
      }
    });
  }

  return {
    operator,
    client,
    otherClient,
    session,
    girl,
    otherGirl,
    chatLog,
    progress
  };
}

/** 清理测试数据（幂等，失败不影响测试） */
async function cleanupData() {
  const e2eUsers = ['op_e2e', 'cl_e2e', 'cl_e2e_other'];
  try {
    const users = await prisma.user.findMany({ where: { username: { in: e2eUsers } } });
    const userIds = users.map(u => u.id);

    // 逆向删除（有外键依赖）
    await prisma.pendingProfileUpdate.deleteMany({ where: { operatorId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.serviceProgress.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.chatLog.deleteMany({ where: { clientId: { in: userIds } } });
    await prisma.chatScreenshot.deleteMany({ where: { clientId: { in: userIds } } });
    await prisma.message.deleteMany({ where: { sessionId: { in: (await prisma.chatSession.findMany({ where: { operatorId: { in: userIds } } })).map(s => s.id) } } });
    await prisma.chatSession.deleteMany({ where: { operatorId: { in: userIds } } });
    await prisma.girl.deleteMany({ where: { clientId: { in: userIds } } });
  } catch (e) {
    // 清理失败不阻塞测试
    console.warn('[Fixtures] cleanupData failed:', e.message);
  }
}

/** 生成 JWT token */
function token(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
}

module.exports = { createTestData, cleanupData, token, JWT_SECRET };
