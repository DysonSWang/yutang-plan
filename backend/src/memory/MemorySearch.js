const prisma = require('../prisma');

async function searchObservations({ clientId, query, girlId, type, limit = 20 }) {
  const where = {
    clientId,
    OR: [
      { title: { contains: query } },
      { narrative: { contains: query } },
      { subtitle: { contains: query } }
    ]
  };
  if (girlId) where.girlId = girlId;
  if (type) where.type = Array.isArray(type) ? { in: type } : type;
  return prisma.structuredObservation.findMany({
    where, orderBy: { createdAt: 'desc' }, take: limit
  });
}

async function searchSummaries({ clientId, query, girlId, limit = 10 }) {
  const where = {
    clientId,
    OR: [
      { request: { contains: query } },
      { learned: { contains: query } },
      { nextSteps: { contains: query } },
      { notes: { contains: query } }
    ]
  };
  if (girlId) where.girlId = girlId;
  return prisma.sessionSummary.findMany({
    where, orderBy: { createdAt: 'desc' }, take: limit
  });
}

async function searchAll({ clientId, query, girlId, limit = 20 }) {
  const [observations, summaries] = await Promise.all([
    searchObservations({ clientId, query, girlId, limit: Math.ceil(limit / 2) }),
    searchSummaries({ clientId, query, girlId, limit: Math.ceil(limit / 2) })
  ]);
  return { observations, summaries };
}

module.exports = { searchObservations, searchSummaries, searchAll };
