import { Box, VStack, HStack, Text, Button, Badge, Progress, useToast } from '@chakra-ui/react';
import { useState, useEffect, useCallback } from 'react';
import { membership as membershipApi } from '../utils/api';
import { useSocket } from '../contexts/SocketContext';

// 5 种状态
// 1. profile_incomplete: 档案完善度 < 70%，引导完善
// 2. ready: 完善度 ≥ 70% 且无个性化内容，可触发生成
// 3. generating: 正在生成中
// 4. completed_fresh: 已生成且未过期
// 5. completed_stale: 已生成但画像或源稿已更新

export default function PersonalizationBanner({ onSwitchVersion, currentVersion }) {
  const toast = useToast();
  const { on } = useSocket();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [completeness, setCompleteness] = useState(null);
  const [batchId, setBatchId] = useState(null);
  const [batchProgress, setBatchProgress] = useState(null);
  const [generatingChapterId, setGeneratingChapterId] = useState(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await membershipApi.personalizedStatus();
      if (res.success) {
        setCompleteness(res.completeness);

        const hasCompleted = res.chapters.some(c => c.status === 'completed');
        const hasGenerating = res.chapters.some(c => c.status === 'generating');

        if (res.batchStatus?.status === 'processing') {
          setStatus('generating');
          setBatchId(res.batchStatus.id);
          setBatchProgress({
            completed: res.batchStatus.completedCount,
            failed: res.batchStatus.failedCount,
            total: res.batchStatus.totalChapters,
          });
        } else if (hasGenerating) {
          setStatus('generating');
        } else if (res.completeness.percentage < 70) {
          setStatus('profile_incomplete');
        } else if (hasCompleted) {
          setStatus('completed_fresh');
        } else {
          setStatus('ready');
        }
      }
    } catch {
      // 静默处理
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // 监听 WebSocket 进度推送
  useEffect(() => {
    const cleanup1 = on('personalization:progress', (data) => {
      setGeneratingChapterId(data.chapterId);
      if (data.batchProgress) {
        setBatchProgress(data.batchProgress);
      }
      if (data.status === 'completed' || data.status === 'failed') {
        loadStatus();
      }
    });

    const cleanup2 = on('personalization:complete', () => {
      loadStatus();
      toast({
        title: '个性化版本已全部生成',
        description: '已自动切换到专属版本',
        status: 'success',
        duration: 3000,
      });
    });

    return () => { cleanup1(); cleanup2(); };
  }, [on, loadStatus, toast]);

  async function handleGenerate() {
    try {
      const res = await membershipApi.generateAll();
      if (res.success) {
        setBatchId(res.batchId);
        setStatus('generating');
        setBatchProgress({ completed: 0, failed: 0, total: 21 });
      }
    } catch (err) {
      toast({ title: '生成失败', description: err.message, status: 'error' });
    }
  }

  async function handleRegenerate() {
    try {
      const res = await membershipApi.regenerate();
      if (res.success) {
        setBatchId(res.batchId);
        setStatus('generating');
        setBatchProgress({ completed: 0, failed: 0, total: 21 });
        toast({ title: '已开始重新生成', status: 'info', duration: 2000 });
      }
    } catch (err) {
      toast({ title: '重新生成失败', description: err.message, status: 'error' });
    }
  }

  if (loading) return null;

  const cardBg = 'rgba(0,212,170,0.06)';
  const cardBorder = '1px solid rgba(0,212,170,0.15)';

  return (
    <Box mb={6} p={5} bg={cardBg} borderRadius="xl" border={cardBorder}>
      {/* 状态 1: 档案不完善 */}
      {status === 'profile_incomplete' && (
        <VStack align="stretch" spacing={4}>
          <HStack>
            <Badge colorScheme="orange" variant="subtle" fontSize="sm" px={2} py={0.5}>因材施教</Badge>
            <Text color="abyss.300" fontSize="sm">
              档案完善度 {completeness?.percentage || 0}%，需达到 70% 才能解锁专属版本
            </Text>
          </HStack>
          <Box>
            <Text color="white" fontSize="md" fontWeight="bold" mb={2}>
              每个人都是独特的，你的学习内容为什么不是？
            </Text>
            <Text color="abyss.300" fontSize="sm" lineHeight="1.8">
              完善个人档案后，系统会根据你的性格特质、沟通风格、感情目标和所处阶段，
              将标准版宝典中的案例场景、话术示例、行动方案全部重写——
              让同一套方法论，在不同的人身上发挥最大效果。
            </Text>
          </Box>
          <Button
            size="md"
            colorScheme="brand"
            variant="outline"
            alignSelf="flex-start"
            onClick={() => window.location.href = '/profile'}
            px={6}
          >
            去完善档案，解锁专属版本
          </Button>
        </VStack>
      )}

      {/* 状态 2: 可生成 */}
      {status === 'ready' && (
        <VStack align="stretch" spacing={4}>
          <HStack justify="space-between">
            <HStack>
              <Badge colorScheme="purple" variant="subtle" fontSize="sm" px={2} py={0.5}>因材施教</Badge>
              <Text color="abyss.300" fontSize="sm">
                档案完善度 {completeness?.percentage || 0}%
              </Text>
            </HStack>
          </HStack>

          <Box>
            <Text color="white" fontSize="md" fontWeight="bold" mb={2}>
              同样的宝典体系，只属于你的版本
            </Text>
            <Text color="abyss.300" fontSize="sm" lineHeight="1.8">
              标准版是一套通用方法论——但我们都知道，内向者和外向者的沟通方式不同，
              程序员和销售的社交场景不同，想认真找对象和还在犹豫的人需要的建议也不同。
            </Text>
            <Text color="abyss.300" fontSize="sm" lineHeight="1.8" mt={2}>
              系统会读取你的性格、沟通风格、感情目标和过往经历，将每一章的
              <Text as="span" color="brand.300" fontWeight="medium">案例场景</Text>、
              <Text as="span" color="brand.300" fontWeight="medium">话术示例</Text>、
              <Text as="span" color="brand.300" fontWeight="medium">行动方案</Text>
              ——从底层重写，匹配你这个人。不是换几个词，是换一种打法。
            </Text>
          </Box>

          <HStack gap={2} flexWrap="wrap">
            {['案例因人而异', '策略匹配性格', '行动贴合阶段', '沟通调性一致'].map(tag => (
              <Badge key={tag} colorScheme="brand" variant="subtle" fontSize="xs">{tag}</Badge>
            ))}
          </HStack>

          <Button
            size="md"
            colorScheme="brand"
            alignSelf="flex-start"
            onClick={handleGenerate}
            px={6}
          >
            生成我的专属版本 · 预计 3-5 分钟
          </Button>
        </VStack>
      )}

      {/* 状态 3: 生成中 */}
      {status === 'generating' && (
        <VStack align="stretch" spacing={3}>
          <HStack>
            <Badge colorScheme="blue" variant="subtle" fontSize="sm" px={2} py={0.5}>因材施教</Badge>
            <Text color="abyss.300" fontSize="sm">
              正在逐章生成你的专属版本——案例、话术、行动方案全部因人而异
            </Text>
          </HStack>
          {batchProgress && (
            <>
              <Progress
                value={((batchProgress.completed + batchProgress.failed) / batchProgress.total) * 100}
                size="sm"
                colorScheme="brand"
                borderRadius="full"
                bg="abyss.800"
              />
              <Text color="abyss.400" fontSize="xs">
                第 {batchProgress.completed + batchProgress.failed + 1}/{batchProgress.total} 章
                {generatingChapterId && ` · 当前：第 ${generatingChapterId} 章`}
              </Text>
            </>
          )}
          <Text color="abyss.500" fontSize="xs">
            生成完成后将自动通知，可继续阅读标准版
          </Text>
        </VStack>
      )}

      {/* 状态 4: 已完成（新鲜）*/}
      {status === 'completed_fresh' && (
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between">
            <HStack>
              <Badge colorScheme="green" variant="subtle" fontSize="sm" px={2} py={0.5}>因材施教</Badge>
              <Text color="abyss.300" fontSize="sm">专属版本已就绪 · 为你量身打造</Text>
            </HStack>
            {onSwitchVersion && (
              <HStack gap={2}>
                <Button
                  size="xs"
                  variant={currentVersion === 'personalized' ? 'solid' : 'ghost'}
                  colorScheme={currentVersion === 'personalized' ? 'brand' : 'gray'}
                  onClick={() => onSwitchVersion('personalized')}
                >
                  专属版
                </Button>
                <Button
                  size="xs"
                  variant={currentVersion === 'standard' ? 'solid' : 'ghost'}
                  colorScheme={currentVersion === 'standard' ? 'brand' : 'gray'}
                  onClick={() => onSwitchVersion('standard')}
                >
                  公共版
                </Button>
              </HStack>
            )}
          </HStack>
          <Text color="abyss.500" fontSize="xs">
            档案更新后，可重新生成以获得最新匹配
            <Button
              size="xs"
              variant="link"
              colorScheme="brand"
              ml={2}
              onClick={handleRegenerate}
            >
              重新生成
            </Button>
          </Text>
        </VStack>
      )}

      {/* 状态 5: 已完成（过时）*/}
      {status === 'completed_stale' && (
        <VStack align="stretch" spacing={3}>
          <HStack>
            <Badge colorScheme="orange" variant="subtle">可能过时</Badge>
            <Text color="abyss.300" fontSize="sm">
              档案已更新，专属版本可能已过时
            </Text>
          </HStack>
          <Button
            size="sm"
            colorScheme="brand"
            variant="outline"
            alignSelf="flex-start"
            onClick={handleRegenerate}
          >
            重新生成
          </Button>
        </VStack>
      )}
    </Box>
  );
}
