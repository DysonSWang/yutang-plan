# 会员到期限制修复

## Context

正式会员(MONTHLY/YEARLY/PREMIUM)到期后不会自动限制功能使用。只要 `status: 'active'`，即使 `endDate` 已过，用户仍可正常使用所有功能。

**目标**：正式会员到期后也要像试用会员一样受限。

## 现状分析

`membershipService.js` 第131-133行：

```javascript
// 非试用用户跳过
if (!membership || membership.type !== 'TRIAL') {
  return true;  // ❌ 正式会员直接放行，不检查endDate
}
```

## 修复方案

### 修改 `checkTrialLimit()` 函数

**文件**: `backend/src/services/membershipService.js` (第125-155行)

**修改逻辑**:
1. 先检查所有类型会员的 endDate（不管类型）
2. 过期则更新状态并抛出错误
3. 试用会员额外检查试用次数

```javascript
async function checkTrialLimit(userId, feature) {
  const membership = await prisma.membership.findFirst({
    where: { userId, status: 'active' }
  });

  // 无会员跳过（有其他地方检查试用次数）
  if (!membership) {
    return true;
  }

  // ✅ 检查所有类型会员的到期日期
  if (new Date() > membership.endDate) {
    await prisma.membership.update({
      where: { id: membership.id },
      data: { status: 'expired' }
    });
    throw new Error('会员已到期，请续费');  // 统一错误信息
  }

  // ✅ 仅试用会员检查试用次数
  if (membership.type === 'TRIAL') {
    const config = await prisma.trialConfig.findUnique({
      where: { id: 'trial_config' }
    });
    const maxUses = config?.maxTrialUses || 2;

    if (membership.trialUsed >= maxUses) {
      throw new Error('试用次数已用完');
    }
  }

  return true;
}
```

### 错误信息统一

- 试用会员到期: `试用已到期，请升级会员` → `会员已到期，请续费`
- 试用次数用完: `试用次数已用完` (保持不变)

## 关键文件

- `backend/src/services/membershipService.js` (第125-155行 checkTrialLimit函数)

## 验证方式

1. 手动修改数据库中正式会员的 endDate 为过去日期
2. 以该用户身份调用受保护API（如AI教练）
3. 确认返回403和"会员已到期，请续费"
4. 确认数据库中该会员 status 变为 'expired'
