import { Box, Heading, Text, VStack, HStack, Button, Badge, Progress, SimpleGrid, useToast, Spinner, Center, Collapse, Icon, Flex, Skeleton, Menu, MenuButton, MenuList, MenuItem } from '@chakra-ui/react';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { membership as membershipApi } from '../../utils/api';
import { BookIcon, CheckIcon } from '../../components/Icons';
import { FiChevronDown, FiChevronUp } from 'react-icons/fi';
import PersonalizationBanner from '../../components/PersonalizationBanner';
import PullToRefresh from '../../components/PullToRefresh';
import { useSocket } from '../../contexts/SocketContext';
import useKeepAliveData from '../../hooks/useKeepAliveData';

// Chapter card component
function ChapterCard({ chapter, progress, personalizationStatus, onUpdate }) {
  const navigate = useNavigate();
  const p = progress.find(p => p.chapterId === chapter.chapterId);
  const isStudied = p?.status === 'completed' || p?.status === 'in_progress';
  const statusColor = isStudied ? 'green' : 'gray';
  const perCh = personalizationStatus?.find(c => c.chapterId === chapter.chapterId);
  const perBadge = perCh?.status === 'completed' ? { label: '已定制', color: 'purple' }
    : perCh?.status === 'generating' ? { label: '生成中', color: 'blue' } : null;
  const hasUpdate = isStudied
    && p?.notifiedUpdate === false
    && chapter.contentVersion > (p.contentVersion || 0);

  return (
    <Box
      p={5}
      className="hover-lift"
      bg="rgba(255,255,255,0.03)"
      border="1px solid rgba(255,255,255,0.06)"
      borderRadius="xl"
      cursor="pointer"
      onClick={() => navigate(`/learning/${chapter.chapterId}`)}
    >
      <HStack justify="space-between" mb={3}>
        <HStack gap={3}>
          <Box
            w="40px"
            h="40px"
            borderRadius="lg"
            bg={isStudied ? 'green.900' : 'warm.800'}
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            {isStudied ? (
              <CheckIcon color="green.400" />
            ) : (
              <Text color="gold.400" fontWeight="bold" fontSize="sm">{chapter.chapterId}</Text>
            )}
          </Box>
          <Box>
            <Text color="white" fontWeight="bold">{chapter.title}</Text>
            {chapter.subtitle && (
              <Text color="rgba(245,240,232,0.4)" fontSize="xs" mt={0.5}>{chapter.subtitle}</Text>
            )}
          </Box>
        </HStack>
        <HStack gap={1}>
          {hasUpdate && (
            <Badge colorScheme="orange" variant="subtle" fontSize="xs">更新</Badge>
          )}
          {perBadge && (
            <Badge colorScheme={perBadge.color} variant="subtle">{perBadge.label}</Badge>
          )}
          <Badge colorScheme={statusColor} variant="subtle">
            {isStudied ? '已学习' : '未学习'}
          </Badge>
        </HStack>
      </HStack>

      {hasUpdate && (
        <Text color="orange.300" fontSize="xs" mt={1}>
          内容已更新，点击查看
        </Text>
      )}
    </Box>
  );
}

export default function ClientLearning() {
  const toast = useToast();
  const { on } = useSocket();
  const navigate = useNavigate();
  const [showPreface, setShowPreface] = useState(false);
  const [prefaceData, setPrefaceData] = useState(null);
  const [personalizationStatus, setPersonalizationStatus] = useState([]);

  const { data, isInitialLoad, refresh } = useKeepAliveData(async () => {
    // 先加载核心数据（章节和进度），个性化状态可延迟
    const [chRes, progRes] = await Promise.all([
      membershipApi.chapters().catch(() => ({ success: false })),
      membershipApi.learningProgress().catch(() => ({ success: false })),
    ]);
    // 前言单独处理，失败不影响主流程
    let preface = null;
    try {
      const preRes = await membershipApi.getPersonalizedChapter('00');
      if (preRes?.success) {
        preface = {
          title: preRes.chapter?.title || '写在前面',
          personalized: !!preRes.personalized,
          content: preRes.personalized?.content || null,
        };
      }
    } catch { /* ignore */ }
    return {
      chapters: chRes.success ? chRes.chapters : [],
      progress: progRes.success ? progRes.progress : [],
      personalizationStatus: [],
      preface,
    };
  }, { key: '/learning', refreshOnActivate: false });

  const chapters = data?.chapters ?? [];
  // progress 用本地 state，方便 updateProgress 乐观更新
  const [progress, setProgress] = useState(data?.progress ?? []);
  useEffect(() => {
    if (data?.progress) setProgress(data.progress);
  }, [data]);

  // 初始化 prefaceData（仅首次）
  useEffect(() => {
    if (data?.preface && !prefaceData) {
      setPrefaceData(data.preface);
    }
  }, [data]);

  // 后台静默加载个性化状态（不影响首屏速度）
  useEffect(() => {
    membershipApi.personalizedStatus().then(perRes => {
      if (perRes?.success) {
        setPersonalizationStatus(perRes.chapters || []);
      }
    }).catch(() => {});
  }, []);

  // 监听个性化进度（更新前言 + 更新章节 Badge 状态）
  useEffect(() => {
    const cleanup1 = on('personalization:progress', (data) => {
      // 前言生成完成
      if (data.chapterId === '00' && data.status === 'completed') {
        membershipApi.getPersonalizedChapter('00').then(preRes => {
          if (preRes?.success) {
            setPrefaceData({
              title: preRes.chapter?.title || '写在前面',
              personalized: !!preRes.personalized,
              content: preRes.personalized?.content || null,
            });
          }
        }).catch(() => {});
      }
      // 章节生成状态更新 → 同步更新 personalizationStatus
      if (data.chapterId && data.status) {
        setPersonalizationStatus(prev => {
          const exists = prev.find(p => p.chapterId === data.chapterId);
          if (exists) {
            return prev.map(p => p.chapterId === data.chapterId ? { ...p, status: data.status } : p);
          }
          return [...prev, { chapterId: data.chapterId, status: data.status }];
        });
      }
    });
    const cleanup2 = on('personalization:complete', () => {
      // 生成全部完成，刷新个性化状态
      membershipApi.personalizedStatus().then(perRes => {
        if (perRes?.success) {
          setPersonalizationStatus(perRes.chapters || []);
        }
      }).catch(() => {});
    });
    return () => { cleanup1(); cleanup2(); };
  }, [on]);

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
          title: status === 'completed' ? '已标记为已学习' : '已标记为未学习',
          status: 'success',
          duration: 2000
        });
      }
    } catch (err) {
      toast({ title: '更新失败', description: err.message, status: 'error', duration: 4000 });
    }
  }

  const studiedCount = progress.filter(p => p.status === 'completed' || p.status === 'in_progress').length;
  const totalCount = chapters.length;
  const percent = totalCount > 0 ? Math.round((studiedCount / totalCount) * 100) : 0;
  const chapterList = chapters.filter(c => c.chapterId !== '00');
  const [showProgressAnim, setShowProgressAnim] = useState(false);
  const [prevPercent, setPrevPercent] = useState(percent);
  const prevPercentRef = useRef(percent);

  // 进度增加时触发动画
  useEffect(() => {
    if (percent > prevPercentRef.current) {
      prevPercentRef.current = percent;
      setPrevPercent(percent);
      setShowProgressAnim(true);
      setTimeout(() => setShowProgressAnim(false), 2000);
    }
  }, [percent]);

  if (isInitialLoad) return (
    <Box>
      <HStack mb={6} gap={4}>
        <Skeleton h="32px" w="120px" borderRadius="md" />
      </HStack>
      <Skeleton h="80px" borderRadius="xl" mb={6} />
      <Skeleton h="60px" borderRadius="lg" mb={6} />
      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
        {[1,2,3].map(i => (
          <Skeleton key={i} h="120px" borderRadius="xl" />
        ))}
      </SimpleGrid>
    </Box>
  );

  return (
    <Box>
      <HStack mb={6} gap={4} justify="space-between" flexWrap="wrap">
        <Heading size="lg" color="white" display="flex" alignItems="center" gap={2}>
          <BookIcon /> 学习中心
        </Heading>
        {chapterList.length > 0 && (
          <Menu>
            <MenuButton
              as={Button}
              size="sm"
              variant="outline"
              colorScheme="gray"
              rightIcon={<FiChevronDown />}
            >
              章节 {chapterList.findIndex(c => c.chapterId === '01') + 1}/{chapterList.length}
            </MenuButton>
            <MenuList bg="warm.800" borderColor="warm.600" maxH="300px" overflowY="auto">
              {chapterList.map(ch => (
                <MenuItem
                  key={ch.chapterId}
                  bg="transparent"
                  _hover={{ bg: 'warm.700' }}
                  onClick={() => navigate(`/learning/${ch.chapterId}`)}
                >
                  <HStack spacing={2}>
                    <Text color="rgba(245,240,232,0.5)" fontSize="xs" w="20px">{ch.chapterId}</Text>
                    <Text color="white" fontSize="sm">{ch.title}</Text>
                    {progress.find(p => p.chapterId === ch.chapterId && (p.status === 'completed' || p.status === 'in_progress')) && (
                      <CheckIcon color="green.400" boxSize={3} />
                    )}
                  </HStack>
                </MenuItem>
              ))}
            </MenuList>
          </Menu>
        )}
      </HStack>

      {/* 个性化学习引导 */}
      <PersonalizationBanner />

      {/* 前言区 - 可展开 */}
      <Box mb={4} borderRadius="xl" border="1px solid rgba(0,212,170,0.15)" overflow="hidden">
        <Flex
          justify="space-between"
          align="center"
          cursor="pointer"
          onClick={() => setShowPreface(!showPreface)}
          px={4}
          py={3}
          bg="rgba(0,212,170,0.06)"
        >
          <HStack spacing={3}>
            <Text color="gold.300" fontWeight="bold" fontSize="md">
              {prefaceData?.title || '写在前面'}
            </Text>
          </HStack>
          <Icon
            as={showPreface ? FiChevronUp : FiChevronDown}
            color="gold.300"
            boxSize={5}
          />
        </Flex>
        <Collapse in={showPreface} animateOpacity>
          <Box mt={4} pt={4} borderTop="1px solid rgba(255,255,255,0.1)">
            {prefaceData?.personalized ? (
              <VStack align="stretch" spacing={3}>
                {prefaceData.content.split('\n').filter(line => line.trim()).map((line, i) => {
                  const trimmed = line.trim();
                  // 标题
                  if (trimmed.startsWith('### ')) {
                    return <Heading key={i} as="h4" size="sm" color="gold.200" mt={2}>{trimmed.slice(4)}</Heading>;
                  }
                  if (trimmed.startsWith('## ')) {
                    return <Heading key={i} as="h3" size="sm" color="gold.200" mt={3}>{trimmed.slice(3)}</Heading>;
                  }
                  if (trimmed.startsWith('# ')) {
                    return <Heading key={i} as="h2" size="md" color="gold.200" mt={3}>{trimmed.slice(2)}</Heading>;
                  }
                  // 引用
                  if (trimmed.startsWith('> ')) {
                    return (
                      <Text key={i} color="rgba(245,240,232,0.4)" fontSize="xs" fontStyle="italic" pl={3} borderLeft="2px solid" borderColor="gold.400">
                        {trimmed.slice(2)}
                      </Text>
                    );
                  }
                  // 普通段落
                  return (
                    <Text key={i} color="rgba(245,240,232,0.6)" fontSize="sm" lineHeight="1.9">
                      {trimmed.split(/(\*\*[^*]+\*\*)/).map((part, j) => {
                        if (part.startsWith('**') && part.endsWith('**')) {
                          return <Text as="span" key={j} fontWeight="bold" color="gold.300">{part.slice(2, -2)}</Text>;
                        }
                        return part;
                      })}
                    </Text>
                  );
                })}
                <HStack gap={3} flexWrap="wrap" pt={2}>
                  <Badge colorScheme="gold" variant="subtle">20章节</Badge>
                  <Badge colorScheme="blue" variant="subtle">5.5万字</Badge>
                  <Badge colorScheme="purple" variant="subtle">126+方法</Badge>
                  <Badge colorScheme="orange" variant="subtle">90+心理学原理</Badge>
                </HStack>
              </VStack>
            ) : (
              <VStack align="stretch" spacing={4}>
                <Text color="rgba(245,240,232,0.6)" fontSize="sm" lineHeight="1.9">
                  <Text as="span" fontWeight="bold" color="gold.300">你追女生失败的次数，比你知道的要多。</Text>
                </Text>
                <Text color="rgba(245,240,232,0.6)" fontSize="sm" lineHeight="1.8">
                  不是运气差。不是她眼光高。不是「缘分没到」。
                  是因为你从第一步开始，就在用让结果变糟的方式努力。
                  你以为你在追她，其实你在推开她。每发一条「在吗」，每等20分钟才回消息，每送一次礼、解释一次自己，都在强化一个信号：「我不重要，是我更需要你」。
                </Text>
                <Text color="rgba(245,240,232,0.6)" fontSize="sm" lineHeight="1.8">
                  <Text as="span" fontWeight="bold" color="gold.300">这不是你的错。</Text>从来没有人教过你这些。学校没有，爸妈没有，哥们儿只会说「大胆点」。结果就是：大多数人凭感觉在情感世界里裸奔，摸黑走路，踩一个坑学一个坑。
                </Text>
                <Text color="rgba(245,240,232,0.6)" fontSize="sm" lineHeight="1.8">
                  <Text as="span" fontWeight="bold" color="gold.300">我现在用一套系统方法，一年做到了50个。</Text>不是理论，不是网上抄的，是我用这套方法在真实世界里一趟一趟跑出来的。这个结果不是运气。是系统。
                </Text>
                <HStack gap={3} flexWrap="wrap" pt={2}>
                  <Badge colorScheme="gold" variant="subtle">20章节</Badge>
                  <Badge colorScheme="blue" variant="subtle">5.5万字</Badge>
                  <Badge colorScheme="purple" variant="subtle">126+方法</Badge>
                  <Badge colorScheme="orange" variant="subtle">90+心理学原理</Badge>
                </HStack>
                <Text color="rgba(245,240,232,0.4)" fontSize="xs" pt={2} fontStyle="italic">
                  追AI不是终点，幸福才是。—— Mo哥
                </Text>
              </VStack>
            )}
          </Box>
        </Collapse>
      </Box>

      <Box mb={6} p={4} bg="rgba(0,212,170,0.08)" borderRadius="lg" border="1px solid rgba(0,212,170,0.2)" position="relative">
        <HStack justify="space-between" mb={2}>
          <HStack spacing={2}>
            <Text color="gold.400" fontWeight="bold">学习进度</Text>
            {showProgressAnim && (
              <Text color="green.400" fontSize="xs" fontWeight="bold" animation="fadeUp 2s ease forwards">
                +1
              </Text>
            )}
          </HStack>
          <Text color="gold.400" fontSize="sm">{studiedCount}/{totalCount} 章节</Text>
        </HStack>
        <Progress
          value={percent}
          size="sm"
          colorScheme="gold"
          borderRadius="full"
          bg="warm.800"
          className="progress-glow"
          sx={{ '& > div': { transition: 'width 0.6s ease' } }}
        />
        <Text color="rgba(245,240,232,0.55)" fontSize="xs" mt={1}>
          已学习 {percent}% · 坚持学习，提升情商
        </Text>
        <style>{`@keyframes fadeUp { 0%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-10px)} }`}</style>
      </Box>

      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
        {chapters.filter(c => c.chapterId !== '00').map(chapter => (
          <ChapterCard
            key={chapter.chapterId}
            chapter={chapter}
            progress={progress}
            personalizationStatus={personalizationStatus}
            onUpdate={updateProgress}
          />
        ))}
      </SimpleGrid>

      {chapters.length === 0 && (
        <Center py={20}>
          <VStack>
            <BookIcon boxSize={12} color="rgba(245,240,232,0.4)" />
            <Text color="rgba(245,240,232,0.6)" mt={2}>暂无章节数据，请联系管理员</Text>
          </VStack>
        </Center>
      )}
    </Box>
  );
}