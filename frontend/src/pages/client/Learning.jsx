import { Box, Heading, Text, VStack, HStack, Button, Badge, Progress, SimpleGrid, useToast, Spinner, Center } from '@chakra-ui/react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { membership as membershipApi } from '../../utils/api';
import { BookIcon, CheckIcon } from '../../components/Icons';

// Chapter card component
function ChapterCard({ chapter, progress, onUpdate }) {
  const navigate = useNavigate();
  const p = progress.find(p => p.chapterId === chapter.chapterId);
  const status = p?.status || 'not_started';
  const statusColor = status === 'completed' ? 'green' : status === 'in_progress' ? 'blue' : 'gray';

  return (
    <Box
      p={5}
      bg="rgba(255,255,255,0.03)"
      border="1px solid rgba(255,255,255,0.06)"
      borderRadius="xl"
      _hover={{ borderColor: 'rgba(0,212,170,0.3)', bg: 'rgba(255,255,255,0.05)' }}
      transition="all 0.2s"
      cursor="pointer"
      onClick={() => navigate(`/learning/${chapter.chapterId}`)}
    >
      <HStack justify="space-between" mb={3}>
        <HStack gap={3}>
          <Box
            w="40px"
            h="40px"
            borderRadius="lg"
            bg={status === 'completed' ? 'green.900' : 'abyss.800'}
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            {status === 'completed' ? (
              <CheckIcon color="green.400" />
            ) : (
              <Text color="brand.400" fontWeight="bold" fontSize="sm">{chapter.chapterId}</Text>
            )}
          </Box>
          <Box>
            <Text color="white" fontWeight="bold">{chapter.title}</Text>
            {chapter.subtitle && (
              <Text color="abyss.400" fontSize="xs" mt={0.5}>{chapter.subtitle}</Text>
            )}
          </Box>
        </HStack>
        <Badge colorScheme={statusColor} variant="subtle">
          {status === 'completed' ? '已学完' : status === 'in_progress' ? '进行中' : '未开始'}
        </Badge>
      </HStack>

      <HStack mt={4} gap={2}>
        {status === 'not_started' && (
          <Button
            size="sm"
            colorScheme="brand"
            variant="outline"
            onClick={(e) => { e.stopPropagation(); onUpdate(chapter.chapterId, 'in_progress'); }}
          >
            开始学习
          </Button>
        )}
        {status === 'in_progress' && (
          <Button
            size="sm"
            colorScheme="brand"
            onClick={(e) => { e.stopPropagation(); onUpdate(chapter.chapterId, 'completed'); }}
          >
            标记完成
          </Button>
        )}
        {status === 'completed' && (
          <Button
            size="sm"
            variant="ghost"
            colorScheme="gray"
            onClick={(e) => { e.stopPropagation(); onUpdate(chapter.chapterId, 'in_progress'); }}
          >
            重新学习
          </Button>
        )}
      </HStack>
    </Box>
  );
}

export default function ClientLearning() {
  const toast = useToast();
  const [chapters, setChapters] = useState([]);
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [chRes, progRes] = await Promise.all([
        membershipApi.chapters(),
        membershipApi.learningProgress()
      ]);
      if (chRes.success) setChapters(chRes.chapters);
      if (progRes.success) setProgress(progRes.progress);
    } catch (err) {
      toast({ title: '加载失败', description: err.message, status: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function updateProgress(chapterId, status) {
    try {
      const res = await membershipApi.updateLearningProgress(chapterId, status);
      if (res.success) {
        const existing = progress.findIndex(p => p.chapterId === chapterId);
        if (existing >= 0) {
          const updated = [...progress];
          updated[existing] = res.progress;
          setProgress(updated);
        } else {
          setProgress([...progress, res.progress]);
        }
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

  const completedCount = progress.filter(p => p.status === 'completed').length;
  const totalCount = chapters.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  if (loading) return <Center h="200px"><Spinner /></Center>;

  return (
    <Box>
      <HStack mb={6} gap={4}>
        <Box>
          <Heading size="lg" color="white" display="flex" alignItems="center" gap={2}>
            <BookIcon /> 学习中心
          </Heading>
          <Text color="abyss.400" mt={1} fontSize="sm">Mo哥宝典 · 完整版 v1.3</Text>
        </Box>
      </HStack>

      {/* 前言区 */}
      <Box mb={6} p={5} bg="rgba(0,212,170,0.06)" borderRadius="xl" border="1px solid rgba(0,212,170,0.15)">
        <Text color="brand.300" fontWeight="bold" mb={3} fontSize="lg">写在前面：为什么你需要这本宝典？</Text>
        <VStack align="stretch" spacing={3}>
          <Text color="abyss.200" fontSize="sm" lineHeight="1.8">
            追爱不是终点，长期关系维护才是核心。本书拒绝套路与情感操纵，追求真诚平等的亲密关系。
          </Text>
          <HStack gap={3} flexWrap="wrap">
            <Badge colorScheme="teal" variant="subtle">20章节</Badge>
            <Badge colorScheme="blue" variant="subtle">5.5万字</Badge>
            <Badge colorScheme="purple" variant="subtle">126+方法</Badge>
            <Badge colorScheme="orange" variant="subtle">90+心理学原理</Badge>
          </HStack>
        </VStack>
      </Box>

      <Box mb={6} p={4} bg="rgba(0,212,170,0.08)" borderRadius="lg" border="1px solid rgba(0,212,170,0.2)">
        <HStack justify="space-between" mb={2}>
          <Text color="brand.400" fontWeight="bold">学习进度</Text>
          <Text color="brand.400" fontSize="sm">{completedCount}/{totalCount} 章节</Text>
        </HStack>
        <Progress value={percent} size="sm" colorScheme="brand" borderRadius="full" bg="abyss.800" />
        <Text color="abyss.400" fontSize="xs" mt={1}>
          已完成 {percent}% · 坚持学习，提升情商
        </Text>
      </Box>

      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
        {chapters.map(chapter => (
          <ChapterCard
            key={chapter.chapterId}
            chapter={chapter}
            progress={progress}
            onUpdate={updateProgress}
          />
        ))}
      </SimpleGrid>

      {chapters.length === 0 && (
        <Center py={20}>
          <VStack>
            <BookIcon boxSize={12} color="abyss.600" />
            <Text color="abyss.400" mt={2}>暂无章节数据，请联系管理员</Text>
          </VStack>
        </Center>
      )}
    </Box>
  );
}