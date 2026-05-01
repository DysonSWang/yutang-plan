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
        title: 'Your version is ready',
        description: 'Every chapter has been rebuilt for you.',
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
      toast({ title: 'Generation failed', description: err.message, status: 'error' });
    }
  }

  async function handleRegenerate() {
    try {
      const res = await membershipApi.regenerate();
      if (res.success) {
        setBatchId(res.batchId);
        setStatus('generating');
        setBatchProgress({ completed: 0, failed: 0, total: 21 });
        toast({ title: 'Rebuilding your version...', status: 'info', duration: 2000 });
      }
    } catch (err) {
      toast({ title: 'Rebuild failed', description: err.message, status: 'error' });
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
              档案完善度 {completeness?.percentage || 0}%，达到 70% 解锁专属版本
            </Text>
          </HStack>

          <Box>
            <Text color="white" fontSize="md" fontWeight="bold" mb={3}>
              Most advice is written for nobody. So it works for nobody.
            </Text>
            <Text color="abyss.300" fontSize="sm" lineHeight="1.9">
              Generic content assumes a generic person.
            </Text>
            <Text color="abyss.300" fontSize="sm" lineHeight="1.9">
              You are not that person.
            </Text>
            <Text color="abyss.400" fontSize="sm" lineHeight="1.9" mt={3}>
              Fill out your profile. The system reads who you are.
              Every chapter — the cases, the scripts, the moves — rebuilds itself around your personality,
              your communication style, your stage.
            </Text>
            <Text color="brand.300" fontSize="sm" fontWeight="medium" mt={2}>
              Same method. Your version.
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
            Build Your Foundation
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
            <Text color="white" fontSize="md" fontWeight="bold" mb={3}>
              You read the advice. It made sense. It didn't work.
            </Text>
            <Text color="abyss.300" fontSize="sm" lineHeight="1.9">
              The problem isn't the method. It's the match.
            </Text>
            <Text color="abyss.300" fontSize="sm" lineHeight="1.9">
              An introvert and an extrovert shouldn't run the same script.
              A man chasing marriage and a man still exploring shouldn't follow the same playbook.
            </Text>
            <Text color="abyss.300" fontSize="sm" lineHeight="1.9" mt={3}>
              So we don't give you the standard version.
            </Text>
            <Text color="abyss.300" fontSize="sm" lineHeight="1.9">
              The system takes your profile — your personality, your communication style,
              your goals, your history — and rebuilds every chapter from the ground up.
            </Text>
            <Text color="brand.300" fontSize="sm" fontWeight="medium" mt={2}>
              Not edited. Rewritten. The cases become your cases. The voice sounds like you.
              The moves fit your stage. One coherent system, built for one person.
            </Text>
          </Box>

          <HStack gap={2} flexWrap="wrap">
            {['Your Scenarios', 'Your Voice', 'Your Stage', 'Your System'].map(tag => (
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
            Build My Version · 3-5 min
          </Button>
        </VStack>
      )}

      {/* 状态 3: 生成中 */}
      {status === 'generating' && (
        <VStack align="stretch" spacing={3}>
          <HStack>
            <Badge colorScheme="blue" variant="subtle" fontSize="sm" px={2} py={0.5}>因材施教</Badge>
            <Text color="abyss.300" fontSize="sm">
              Building your version. Chapter by chapter.
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
            You can keep reading the standard version. We'll notify you when it's done.
          </Text>
        </VStack>
      )}

      {/* 状态 4: 已完成（新鲜）*/}
      {status === 'completed_fresh' && (
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between">
            <HStack>
              <Badge colorScheme="green" variant="subtle" fontSize="sm" px={2} py={0.5}>因材施教</Badge>
              <Text color="abyss.300" fontSize="sm">Your version is ready. Every chapter, rebuilt for you.</Text>
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
            Profile changed? Rebuild to keep everything in sync.
            <Button
              size="xs"
              variant="link"
              colorScheme="brand"
              ml={2}
              onClick={handleRegenerate}
            >
              Rebuild
            </Button>
          </Text>
        </VStack>
      )}

      {/* 状态 5: 已完成（过时）*/}
      {status === 'completed_stale' && (
        <VStack align="stretch" spacing={3}>
          <HStack>
            <Badge colorScheme="orange" variant="subtle">Outdated</Badge>
            <Text color="abyss.300" fontSize="sm">
              Your profile has changed. Your version no longer matches who you are now.
            </Text>
          </HStack>
          <Button
            size="sm"
            colorScheme="brand"
            variant="outline"
            alignSelf="flex-start"
            onClick={handleRegenerate}
          >
            Rebuild My Version
          </Button>
        </VStack>
      )}
    </Box>
  );
}
