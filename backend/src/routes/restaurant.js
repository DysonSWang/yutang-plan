/**
 * 精选餐厅库管理
 */
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');
const prisma = require('../prisma');
const asyncHandler = require('../middleware/asyncHandler');
const { success } = require('../utils/response');
const AppError = require('../errors/AppError');
const { ErrorCodes } = require('../errors/errorCodes');

// Auth middleware
const authMiddleware = asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new AppError(ErrorCodes.AUTH_TOKEN_MISSING);
  const decoded = jwt.verify(token, JWT_SECRET);
  req.user = decoded;
});

// Operator-only middleware
const operatorOnly = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    throw new AppError(ErrorCodes.AUTH_PERMISSION_DENIED);
  }
});

// ========== 公开接口 ==========

// 获取餐厅列表（支持筛选）
router.get('/', authMiddleware, asyncHandler(async (req, res) => {
  const {
    city = '上海',
    district,
    cuisine,
    sceneTag,
    minPrice,
    maxPrice,
    atmosphereTag,
    limit = 50
  } = req.query;

  const where = { status: 'active' };
  if (city) where.city = city;
  if (district) where.district = district;
  if (cuisine) where.cuisine = { contains: cuisine };
  if (sceneTag) where.sceneTags = { contains: sceneTag };
  if (atmosphereTag) where.atmosphereTags = { contains: atmosphereTag };
  if (minPrice || maxPrice) {
    where.priceAvg = {};
    if (minPrice) where.priceAvg.gte = parseInt(minPrice);
    if (maxPrice) where.priceAvg.lte = parseInt(maxPrice);
  }

  const restaurants = await prisma.restaurant.findMany({
    where,
    orderBy: [{ rating: 'desc' }, { priceAvg: 'asc' }],
    take: parseInt(limit)
  });

  return success(res, { restaurants });
}));

// 获取单个餐厅详情
router.get('/:id', authMiddleware, asyncHandler(async (req, res) => {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: req.params.id }
  });
  if (!restaurant) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND);
  return success(res, { restaurant });
}));

// ========== 管理员接口 ==========

// 创建餐厅
router.post('/', authMiddleware, operatorOnly, asyncHandler(async (req, res) => {
  const {
    name, brand, city, district, address, metroStation, metroWalkTime,
    cuisine, priceRange, priceAvg,
    sceneTags, atmosphereTags,
    rating, reservationNeeded, phone, openingHours, dressCode, features
  } = req.body;

  if (!name || !city || !district || !cuisine || !priceRange) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR);
  }

  const restaurant = await prisma.restaurant.create({
    data: {
      name,
      brand,
      city: city || '上海',
      district,
      address,
      metroStation,
      metroWalkTime: metroWalkTime ? parseInt(metroWalkTime) : null,
      cuisine,
      priceRange,
      priceAvg: priceAvg ? parseInt(priceAvg) : null,
      sceneTags: sceneTags || '',
      atmosphereTags: atmosphereTags || '',
      rating: rating ? parseFloat(rating) : null,
      reservationNeeded: reservationNeeded !== undefined ? Boolean(reservationNeeded) : true,
      phone,
      openingHours,
      dressCode,
      features,
      status: 'active',
      createdBy: req.user.id
    }
  });

  return success(res, { restaurant });
}));

// 批量导入餐厅
router.post('/batch', authMiddleware, operatorOnly, asyncHandler(async (req, res) => {
  const { restaurants } = req.body;
  if (!Array.isArray(restaurants) || restaurants.length === 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR);
  }

  const created = await Promise.all(
    restaurants.map(r =>
      prisma.restaurant.create({
        data: {
          name: r.name,
          brand: r.brand,
          city: r.city || '上海',
          district: r.district,
          address: r.address,
          metroStation: r.metroStation,
          metroWalkTime: r.metroWalkTime ? parseInt(r.metroWalkTime) : null,
          cuisine: r.cuisine,
          priceRange: r.priceRange,
          priceAvg: r.priceAvg ? parseInt(r.priceAvg) : null,
          sceneTags: r.sceneTags || '',
          atmosphereTags: r.atmosphereTags || '',
          rating: r.rating ? parseFloat(r.rating) : null,
          reservationNeeded: r.reservationNeeded !== undefined ? Boolean(r.reservationNeeded) : true,
          phone: r.phone,
          openingHours: r.openingHours,
          dressCode: r.dressCode,
          features: r.features,
          status: 'active',
          createdBy: req.user.id
        }
      })
    )
  );

  return success(res, { count: created.length, restaurants: created });
}));

// 更新餐厅
router.put('/:id', authMiddleware, operatorOnly, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = { ...req.body };
  delete updateData.id;
  delete updateData.createdAt;

  if (updateData.priceAvg) updateData.priceAvg = parseInt(updateData.priceAvg);
  if (updateData.rating) updateData.rating = parseFloat(updateData.rating);
  if (updateData.metroWalkTime) updateData.metroWalkTime = parseInt(updateData.metroWalkTime);
  if (updateData.reservationNeeded !== undefined) updateData.reservationNeeded = Boolean(updateData.reservationNeeded);

  const restaurant = await prisma.restaurant.update({
    where: { id },
    data: updateData
  });

  return success(res, { restaurant });
}));

// 删除餐厅（软删除）
router.delete('/:id', authMiddleware, operatorOnly, asyncHandler(async (req, res) => {
  await prisma.restaurant.update({
    where: { id: req.params.id },
    data: { status: 'inactive' }
  });
  return success(res, { success: true });
}));

// 获取所有区域列表
router.get('/meta/districts', authMiddleware, asyncHandler(async (req, res) => {
  const { city = '上海' } = req.query;
  const districts = await prisma.restaurant.groupBy({
    by: ['district'],
    where: { city, status: 'active' },
    _count: { id: true }
  });
  return success(res, {
    districts: districts.map(d => ({ district: d.district, count: d._count.id }))
  });
}));

// 获取所有菜系列表
router.get('/meta/cuisines', authMiddleware, asyncHandler(async (req, res) => {
  const { city = '上海' } = req.query;
  const cuisines = await prisma.restaurant.groupBy({
    by: ['cuisine'],
    where: { city, status: 'active' },
    _count: { id: true }
  });
  return success(res, {
    cuisines: cuisines.map(c => ({ cuisine: c.cuisine, count: c._count.id }))
  });
}));

module.exports = router;
