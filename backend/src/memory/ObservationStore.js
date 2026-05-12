const crypto = require('crypto');
const prisma = require('../prisma');

function computeContentHash(clientId, girlId, type, title, narrative) {
  const raw = [clientId || '', girlId || '', type || '', title || '', narrative || ''].join('\x00');
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

async function storeObservation({
  clientId, girlId, coachId, type, title, subtitle,
  narrative, facts, concepts, sourceType, sourceId
}) {
  const contentHash = computeContentHash(clientId, girlId, type, title, narrative);
  try {
    const obs = await prisma.structuredObservation.create({
      data: {
        clientId, girlId: girlId || null, coachId: coachId || null,
        type, title, subtitle: subtitle || null, narrative: narrative || null,
        facts: facts ? JSON.stringify(facts) : null,
        concepts: concepts ? JSON.stringify(concepts) : null,
        sourceType: sourceType || 'manual', sourceId: sourceId || null, contentHash
      }
    });
    return { id: obs.id, created: true };
  } catch (err) {
    if (err.code === 'P2002') return { created: false, reason: 'duplicate' };
    throw err;
  }
}

async function getObservations({ clientId, girlId, type, limit = 20, offset = 0 }) {
  const where = { clientId };
  if (girlId) where.girlId = girlId;
  if (type) where.type = Array.isArray(type) ? { in: type } : type;
  return prisma.structuredObservation.findMany({
    where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset
  });
}

async function getObservationsByType(clientId, type, limit = 10) {
  return prisma.structuredObservation.findMany({
    where: { clientId, type }, orderBy: { createdAt: 'desc' }, take: limit
  });
}

async function getObservationCount(clientId, girlId = null) {
  const where = { clientId };
  if (girlId) where.girlId = girlId;
  return prisma.structuredObservation.count({ where });
}

async function deleteObservation(id) {
  return prisma.structuredObservation.delete({ where: { id } });
}

module.exports = { storeObservation, getObservations, getObservationsByType, getObservationCount, deleteObservation, computeContentHash };
