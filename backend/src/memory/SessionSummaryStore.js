const prisma = require('../prisma');

async function storeSummary({
  clientId, girlId, coachId, request, investigated,
  learned, completed, nextSteps, notes, filesRead, memoryId
}) {
  return prisma.sessionSummary.create({
    data: {
      clientId, girlId: girlId || null, coachId: coachId || null,
      request: request || null, investigated: investigated || null,
      learned: learned || null, completed: completed || null,
      nextSteps: nextSteps || null, notes: notes || null,
      filesRead: filesRead ? JSON.stringify(filesRead) : null,
      memoryId: memoryId || null
    }
  });
}

async function getRecentSummaries({ clientId, girlId, limit = 5 }) {
  const where = { clientId };
  if (girlId) where.girlId = girlId;
  return prisma.sessionSummary.findMany({
    where, orderBy: { createdAt: 'desc' }, take: limit
  });
}

async function getSummariesByMemoryId(memoryId) {
  return prisma.sessionSummary.findMany({
    where: { memoryId }, orderBy: { createdAt: 'desc' }
  });
}

async function getSummaryCount(clientId, girlId = null) {
  const where = { clientId };
  if (girlId) where.girlId = girlId;
  return prisma.sessionSummary.count({ where });
}

module.exports = { storeSummary, getRecentSummaries, getSummariesByMemoryId, getSummaryCount };
