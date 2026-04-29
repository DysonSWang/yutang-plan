import { Box, Heading, Text, VStack, HStack, Button, Badge, Spinner, Center, IconButton, Divider, useToast } from '@chakra-ui/react';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { membership as membershipApi } from '../../utils/api';
import { BookIcon, ArrowLeftIcon, CheckIcon } from '../../components/Icons';

export default function ChapterDetail() {
  const { chapterId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [chapter, setChapter] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, [chapterId]);

  async function load() {
    try {
      const [chRes, progRes] = await Promise.all([
        membershipApi.chapters(),
        membershipApi.learningProgress()
      ]);
      if (chRes.success) {
        const ch = chRes.chapters.find(c => c.chapterId === chapterId);
        setChapter(ch);
      }
      if (progRes.success) {
        const prog = progRes.progress.find(p => p.chapterId === chapterId);
        setProgress(prog);
      }
    } catch (err) {
      toast({ title: '加载失败', description: err.message, status: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function updateProgress(status) {
    try {
      const res = await membershipApi.updateLearningProgress(chapterId, status);
      if (res.success) {
        setProgress(res.progress);
        toast({
          title: status === 'completed' ? '恭喜完成本章！' : '开始学习',
          status: 'success',
          duration: 2000
        });
      }
    } catch (err) {
      toast({ title: '更新失败', description: err.message, status: 'error' });
    }
  }

  const status = progress?.status || 'not_started';
  const statusColor = status === 'completed' ? 'green' : status === 'in_progress' ? 'blue' : 'gray';

  if (loading) return <Center h="200px"><Spinner /></Center>;
  if (!chapter) return (
    <Center h="200px">
      <VStack>
        <Text color="abyss.400">章节不存在</Text>
        <Button onClick={() => navigate('/learning')}>返回学习中心</Button>
      </VStack>
    </Center>
  );

  return (
    <Box>
      <HStack mb={6} gap={4}>
        <IconButton
          icon={<ArrowLeftIcon />}
          variant="ghost"
          onClick={() => navigate('/learning')}
          aria-label="返回"
        />
        <Box flex={1}>
          <HStack gap={3} mb={1}>
            <Badge colorScheme={statusColor} variant="subtle">
              {status === 'completed' ? '已学完' : status === 'in_progress' ? '进行中' : '未开始'}
            </Badge>
            <Text color="abyss.400" fontSize="sm">第 {chapter.chapterId} 章</Text>
          </HStack>
          <Heading size="lg" color="white">{chapter.title}</Heading>
          {chapter.subtitle && (
            <Text color="abyss.400" fontSize="sm" mt={1}>{chapter.subtitle}</Text>
          )}
        </Box>
      </HStack>

      <Box mb={6} p={4} bg="rgba(0,212,170,0.08)" borderRadius="lg" border="1px solid rgba(0,212,170,0.2)">
        <HStack justify="space-between">
          <HStack gap={2}>
            <BookIcon color="brand.400" />
            <Text color="brand.400" fontWeight="bold">学习进度</Text>
          </HStack>
          <HStack gap={2}>
            {status === 'not_started' && (
              <Button
                size="sm"
                colorScheme="brand"
                variant="outline"
                onClick={() => updateProgress('in_progress')}
              >
                开始学习
              </Button>
            )}
            {status === 'in_progress' && (
              <Button
                size="sm"
                colorScheme="brand"
                onClick={() => updateProgress('completed')}
              >
                标记完成
              </Button>
            )}
            {status === 'completed' && (
              <Button
                size="sm"
                variant="ghost"
                colorScheme="gray"
                leftIcon={<CheckIcon color="green.400" />}
                onClick={() => updateProgress('in_progress')}
              >
                已完成
              </Button>
            )}
          </HStack>
        </HStack>
      </Box>

      <Box
        p={6}
        bg="rgba(255,255,255,0.03)"
        border="1px solid rgba(255,255,255,0.06)"
        borderRadius="xl"
      >
        {chapter.content ? (
          <Box
            as="pre"
            color="abyss.200"
            fontSize="sm"
            lineHeight="1.8"
            whiteSpace="pre-wrap"
            fontFamily="mono"
          >
            {chapter.content}
          </Box>
        ) : (
          <Center py={10}>
            <VStack>
              <BookIcon boxSize={10} color="abyss.600" />
              <Text color="abyss.400" mt={2}>暂无章节内容</Text>
            </VStack>
          </Center>
        )}
      </Box>
    </Box>
  );
}
