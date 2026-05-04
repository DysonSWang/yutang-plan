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
  const [personalizationEnabled, setPersonalizationEnabled] = useState(true);

  const loadStatus = useCallback(async () => {
    try {
      const res = await membershipApi.personalizedStatus();
      if (res.success) {
        setCompleteness(res.completeness);
        setPersonalizationEnabled(res.personalizationEnabled ?? true);

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
          // 从所有章节状态推导进度（含已完成、失败、生成中）
          const completed = res.chapters.filter(c => c.status === 'completed').length;
          const failed = res.chapters.filter(c => c.status === 'failed').length;
          const inProgress = res.chapters.filter(c => c.status === 'generating').length;
          setBatchProgress({ completed, failed, total: completed + failed + inProgress });
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

  // 生成状态下定时轮询，防止 WebSocket 事件丢失导致卡住
  useEffect(() => {
    if (status !== 'generating') return;
    const timer = setInterval(() => {
      if (batchProgress && batchProgress.completed + batchProgress.failed >= batchProgress.total) {
        loadStatus();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [status, batchProgress, loadStatus]);

  // 监听 WebSocket 进度推送
  useEffect(() => {
    const cleanup1 = on('personalization:progress', (data) => {
      setGeneratingChapterId(data.chapterId);
      if (data.batchProgress) {
        setBatchProgress(data.batchProgress);
      } else if (data.status === 'completed') {
        setBatchProgress(prev => prev ? { ...prev, completed: prev.completed + 1 } : { completed: 1, failed: 0, total: 1 });
      } else if (data.status === 'failed') {
        setBatchProgress(prev => prev ? { ...prev, failed: prev.failed + 1 } : { completed: 0, failed: 1, total: 1 });
      }
      if (data.status === 'completed' || data.status === 'failed') {
        setTimeout(() => loadStatus(), 600);
      }
    });

    const cleanup2 = on('personalization:complete', () => {
      loadStatus();
      toast({
        title: '专属版本已生成',
        description: '每一章都为你重写过了。',
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
      toast({ title: '生成失败', description: err.message, status: 'error', duration: 4000 });
    }
  }

  async function handleRegenerate() {
    try {
      const res = await membershipApi.regenerate();
      if (res.success) {
        setBatchId(res.batchId);
        setStatus('generating');
        setBatchProgress({ completed: 0, failed: 0, total: 21 });
        toast({ title: '正在重新生成...', status: 'info', duration: 2000, duration: 2000 });
      }
    } catch (err) {
      toast({ title: '重新生成失败', description: err.message, status: 'error', duration: 4000 });
    }
  }

  if (loading) return null;

  // 管理员禁用
  if (personalizationEnabled === false) {
    return (
      <Box mb={6} p={5} bg="rgba(255,255,255,0.03)" borderRadius="xl" border="1px solid rgba(255,255,255,0.06)">
        <VStack align="stretch" spacing={3}>
          <HStack>
            <Badge colorScheme="gray" variant="subtle" fontSize="sm" px={2} py={0.5}>因材施教</Badge>
            <Text color="rgba(245,240,232,0.6)" fontSize="sm">当前不可用</Text>
          </HStack>
          <Text color="rgba(245,240,232,0.4)" fontSize="sm" lineHeight="1.9">
            个性化学习功能暂时不可用。如有疑问，请联系 Mo哥。
          </Text>
        </VStack>
      </Box>
    );
  }

  const cardBg = 'rgba(0,212,170,0.06)';
  const cardBorder = '1px solid rgba(0,212,170,0.15)';

  return (
    <Box mb={6} p={5} bg={cardBg} borderRadius="xl" border={cardBorder}>
      {/* 状态 1: 档案不完善 */}
      {status === 'profile_incomplete' && (
        <VStack align="stretch" spacing={4}>
          <HStack>
            <Badge colorScheme="orange" variant="subtle" fontSize="sm" px={2} py={0.5}>因材施教</Badge>
            <Text color="rgba(245,240,232,0.6)" fontSize="sm">
              档案完善度 {completeness?.percentage || 0}%，达到 70% 解锁专属版本
            </Text>
          </HStack>

          <Box>
            <Text color="white" fontSize="md" fontWeight="bold" mb={3}>
              大多数建议写给不存在的人。所以对谁都没用。
            </Text>
            <Text color="rgba(245,240,232,0.6)" fontSize="sm" lineHeight="1.9">
              通用内容默认你是一个通用的人。
            </Text>
            <Text color="rgba(245,240,232,0.6)" fontSize="sm" lineHeight="1.9">
              你不是。
            </Text>
            <Text color="rgba(245,240,232,0.4)" fontSize="sm" lineHeight="1.9" mt={3}>
              填完档案。系统会读你是谁——每一章的案例、话术、行动，
              围绕你的性格、沟通方式、所处阶段重新生长。
            </Text>
            <Text color="gold.300" fontSize="sm" fontWeight="medium" mt={2}>
              同一套方法。你的版本。
            </Text>
          </Box>

          <Button
            size="md"
            colorScheme="gold"
            variant="outline"
            alignSelf="flex-start"
            onClick={() => window.location.href = '/profile'}
            px={6}
          >
            打好地基
          </Button>
        </VStack>
      )}

      {/* 状态 2: 可生成 → 改为提示用户联系管理员 */}
      {status === 'ready' && (
        <VStack align="stretch" spacing={4}>
          <HStack>
            <Badge colorScheme="purple" variant="subtle" fontSize="sm" px={2} py={0.5}>因材施教</Badge>
            <Text color="rgba(245,240,232,0.6)" fontSize="sm">
              档案完善度 {completeness?.percentage || 0}%
            </Text>
          </HStack>

          <Box>
            <Text color="white" fontSize="md" fontWeight="bold" mb={3}>
              你已达到专属版生成标准
            </Text>
            <Text color="rgba(245,240,232,0.6)" fontSize="sm" lineHeight="1.9">
              完善度已达 {completeness?.percentage || 0}%，满足生成条件。
            </Text>
            <Text color="gold.300" fontSize="sm" fontWeight="medium" mt={2}>
              联系 Mo哥，申请生成你的专属版本。
            </Text>
          </Box>

          <Text color="rgba(245,240,232,0.6)" fontSize="xs">
            Mo哥可在管理后台 &gt; 学习版块管理 &gt; 个性化学习管理 中为你生成。
          </Text>
        </VStack>
      )}

      {/* 状态 3: 生成中 */}
      {status === 'generating' && (
        <VStack align="stretch" spacing={3}>
          <HStack>
            <Badge colorScheme="blue" variant="subtle" fontSize="sm" px={2} py={0.5}>因材施教</Badge>
            <Text color="rgba(245,240,232,0.6)" fontSize="sm">
              正在逐章建造你的版本。
            </Text>
          </HStack>
          {batchProgress ? (
            <>
              <Progress
                value={((batchProgress.completed + batchProgress.failed) / batchProgress.total) * 100}
                size="sm"
                colorScheme="gold"
                borderRadius="full"
                bg="warm.800"
              />
              <Text color="rgba(245,240,232,0.4)" fontSize="xs">
                第 {Math.min(batchProgress.completed + batchProgress.failed + 1, batchProgress.total)}/{batchProgress.total} 章
                {generatingChapterId && batchProgress.completed + batchProgress.failed < batchProgress.total && ` · 当前：第 ${generatingChapterId} 章`}
              </Text>
            </>
          ) : (
            <>
              <Progress
                isIndeterminate
                size="sm"
                colorScheme="gold"
                borderRadius="full"
                bg="warm.800"
              />
              <Text color="rgba(245,240,232,0.4)" fontSize="xs">
                正在重写中...
                {generatingChapterId && ` 当前：第 ${generatingChapterId} 章`}
              </Text>
            </>
          )}
          <Text color="rgba(245,240,232,0.6)" fontSize="xs">
            可以先读标准版。完成后通知你。
          </Text>
        </VStack>
      )}

      {/* 状态 4: 已完成（新鲜）*/}
      {status === 'completed_fresh' && (
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between">
            <HStack>
              <Badge colorScheme="green" variant="subtle" fontSize="sm" px={2} py={0.5}>因材施教</Badge>
              <Text color="rgba(245,240,232,0.6)" fontSize="sm">你的版本已就绪。每一章都为你重写过了。</Text>
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
          <Text color="rgba(245,240,232,0.6)" fontSize="xs">
            你的专属版本已是最新。
          </Text>
        </VStack>
      )}

      {/* 状态 5: 已完成（过时）*/}
      {status === 'completed_stale' && (
        <VStack align="stretch" spacing={3}>
          <HStack>
            <Badge colorScheme="orange" variant="subtle">已过时</Badge>
            <Text color="rgba(245,240,232,0.6)" fontSize="sm">
              档案已更新。你的版本不再匹配现在的你。
            </Text>
          </HStack>
          <Button
            size="sm"
            colorScheme="gold"
            variant="outline"
            alignSelf="flex-start"
            onClick={handleRegenerate}
          >
            重新生成我的版本
          </Button>
        </VStack>
      )}
    </Box>
  );
}
