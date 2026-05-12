import { Box, VStack, HStack, Text, Button, Badge, Progress } from '@chakra-ui/react';
import { useState, useEffect, useCallback } from 'react';
import { membership as membershipApi } from '../utils/api';
import { useSocket } from '../contexts/SocketContext';

export default function PersonalizationBanner() {
  const { on } = useSocket();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [completeness, setCompleteness] = useState(null);
  const [batchProgress, setBatchProgress] = useState(null);
  const [generatingChapterId, setGeneratingChapterId] = useState(null);
  const [personalizationEnabled, setPersonalizationEnabled] = useState(true);

  const loadStatus = useCallback(async () => {
    try {
      const res = await membershipApi.personalizedStatus();
      if (res.success) {
        setCompleteness(res.completeness);
        setPersonalizationEnabled(res.personalizationEnabled ?? true);

        const hasCompleted = res.chapters?.some(c => c.status === 'completed');
        const hasGenerating = res.chapters?.some(c => c.status === 'generating');

        if (res.batchStatus?.status === 'processing') {
          setStatus('generating');
          setBatchProgress({
            completed: res.batchStatus.completedCount,
            failed: res.batchStatus.failedCount,
            total: res.batchStatus.totalChapters,
          });
        } else if (hasGenerating) {
          setStatus('generating');
          const completed = res.chapters.filter(c => c.status === 'completed').length;
          const failed = res.chapters.filter(c => c.status === 'failed').length;
          const inProgress = res.chapters.filter(c => c.status === 'generating').length;
          setBatchProgress({ completed, failed, total: completed + failed + inProgress });
        } else if (res.completeness?.percentage < 70) {
          setStatus('profile_incomplete');
        } else if (hasCompleted) {
          setStatus('completed_fresh');
        } else {
          setStatus('ready');
        }
      }
    } catch {
      /*静默*/
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  useEffect(() => {
    if (status !== 'generating') return;
    const timer = setInterval(() => {
      if (batchProgress && batchProgress.completed + batchProgress.failed >= batchProgress.total) {
        loadStatus();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [status, batchProgress, loadStatus]);

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
    const cleanup2 = on('personalization:complete', () => { loadStatus(); });
    return () => { cleanup1(); cleanup2(); };
  }, [on, loadStatus]);

  if (loading || personalizationEnabled === false) return null;

  const cardBg = 'rgba(0,212,170,0.06)';
  const cardBorder = '1px solid rgba(0,212,170,0.15)';

  // 生成中 / 已完成：紧凑横条
  if (status === 'generating' || status === 'completed_fresh' || status === 'completed_stale') {
    return (
      <Box mb={4} p={3} bg={cardBg} borderRadius="lg" border={cardBorder}>
        <HStack spacing={3}>
          <Badge
            colorScheme={status === 'generating' ? 'blue' : status === 'completed_fresh' ? 'green' : 'orange'}
            variant="subtle" fontSize="xs"
          >
            因材施教
          </Badge>
          {status === 'generating' && batchProgress && (
            <>
              <Progress
                value={((batchProgress.completed + batchProgress.failed) / batchProgress.total) * 100}
                size="sm" colorScheme="gold" borderRadius="full" bg="warm.800" flex={1}
              />
              <Text color="rgba(245,240,232,0.5)" fontSize="xs">
                {batchProgress.completed}/{batchProgress.total}
              </Text>
            </>
          )}
          {status === 'generating' && !batchProgress && (
            <Text color="rgba(245,240,232,0.5)" fontSize="xs">生成中...</Text>
          )}
          {status === 'completed_fresh' && (
            <Text color="rgba(245,240,232,0.5)" fontSize="xs">专属版已就绪</Text>
          )}
          {status === 'completed_stale' && (
            <HStack flex={1} spacing={2}>
              <Text color="orange.300" fontSize="xs">内容已更新</Text>
              <Button size="xs" variant="outline" colorScheme="orange" onClick={() => membershipApi.regenerate().then(loadStatus)}>
                重新生成
              </Button>
            </HStack>
          )}
        </HStack>
      </Box>
    );
  }

  // 档案不完善 / 达标准：紧凑引导
  if (status === 'profile_incomplete' || status === 'ready') {
    return (
      <Box mb={4} p={3} bg={cardBg} borderRadius="lg" border={cardBorder}>
        <HStack spacing={3} justify="space-between">
          <HStack spacing={2}>
            <Badge colorScheme={status === 'profile_incomplete' ? 'orange' : 'purple'} variant="subtle" fontSize="xs">
              因材施教
            </Badge>
            <Text color="rgba(245,240,232,0.55)" fontSize="xs">
              {status === 'profile_incomplete'
                ? `档案完善度 ${completeness?.percentage || 0}%，达70%解锁专属版本`
                : '达生成标准，联系Mo哥生成专属版本'}
            </Text>
          </HStack>
          <Button
            size="xs"
            variant="outline"
            colorScheme="gold"
            onClick={() => window.location.href = '/profile'}
          >
            {status === 'profile_incomplete' ? '完善档案' : '联系Mo哥'}
          </Button>
        </HStack>
      </Box>
    );
  }

  return null;
}
