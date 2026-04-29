import { Box, Heading, Text, VStack, HStack, Button, Badge, Input, Textarea, Select, useToast, Spinner, Center, SimpleGrid } from '@chakra-ui/react';
import { useState, useEffect } from 'react';
import { membership as membershipApi } from '../../utils/api';
import { SparklesIcon, CopyIcon } from '../../components/Icons';

function PlanCard({ plan, onSelect }) {
  return (
    <Box
      p={4}
      bg="rgba(255,255,255,0.03)"
      border="1px solid rgba(255,255,255,0.06)"
      borderRadius="xl"
      cursor="pointer"
      _hover={{ borderColor: 'rgba(0,212,170,0.3)' }}
      onClick={() => onSelect(plan)}
      transition="all 0.2s"
    >
      <HStack justify="space-between" mb={2}>
        <Text color="white" fontWeight="bold">{plan.title}</Text>
        <Badge colorScheme={plan.planStatus === 'generated' ? 'green' : plan.planStatus === 'generating' ? 'blue' : 'gray'}>
          {plan.planStatus === 'generated' ? '已生成' : plan.planStatus === 'generating' ? '生成中' : '草稿'}
        </Badge>
      </HStack>
      {plan.scene && <Text color="abyss.400" fontSize="sm">{plan.scene}</Text>}
      {plan.budget && <Text color="abyss.500" fontSize="xs" mt={1}>预算：{plan.budget}</Text>}
      <Text color="abyss.500" fontSize="xs" mt={1}>
        {new Date(plan.createdAt).toLocaleDateString('zh-CN')}
      </Text>
    </Box>
  );
}

function PlanDetail({ plan, onBack }) {
  const [copied, setCopied] = useState(false);

  const copyContent = () => {
    if (plan.content) {
      navigator.clipboard.writeText(plan.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Box>
      <Button variant="ghost" colorScheme="gray" mb={4} onClick={onBack}>
        ← 返回列表
      </Button>
      <HStack justify="space-between" mb={4}>
        <Box>
          <Heading size="md" color="white">{plan.title}</Heading>
          {plan.scene && <Text color="abyss.400" mt={1}>{plan.scene}</Text>}
          {plan.budget && <Text color="abyss.500" fontSize="sm">预算：{plan.budget} · 时长：{plan.duration}</Text>}
        </Box>
        <Button
          leftIcon={<CopyIcon />}
          variant="outline"
          colorScheme="brand"
          size="sm"
          onClick={copyContent}
        >
          {copied ? '已复制' : '复制方案'}
        </Button>
      </HStack>

      {plan.planStatus === 'generating' ? (
        <Center py={20}>
          <VStack>
            <Spinner size="lg" color="brand.500" />
            <Text color="abyss.400" mt={3}>AI 正在为你策划约会方案...</Text>
          </VStack>
        </Center>
      ) : plan.content ? (
        <Box
          p={6}
          bg="rgba(255,255,255,0.02)"
          border="1px solid rgba(255,255,255,0.06)"
          borderRadius="xl"
          color="abyss.200"
          fontSize="sm"
          lineHeight="1.8"
          whiteSpace="pre-wrap"
        >
          {plan.content}
        </Box>
      ) : (
        <Text color="abyss.400">暂无方案内容</Text>
      )}
    </Box>
  );
}

export default function DatingPlans() {
  const toast = useToast();
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({ title: '', scene: '', budget: '', duration: '' });

  useEffect(() => {
    loadPlans();
  }, []);

  async function loadPlans() {
    try {
      const res = await membershipApi.datingPlans();
      if (res.success) setPlans(res.plans);
    } catch (err) {
      toast({ title: '加载失败', description: err.message, status: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function generatePlan() {
    if (!form.scene) {
      toast({ title: '请填写约会场景', status: 'warning' });
      return;
    }
    setGenerating(true);
    try {
      const res = await membershipApi.generateDatingPlan(form);
      if (res.success) {
        setPlans([res.plan, ...plans]);
        setSelectedPlan(res.plan);
        setForm({ title: '', scene: '', budget: '', duration: '' });
        toast({ title: '方案生成中...', status: 'info', duration: 3000 });
      }
    } catch (err) {
      toast({ title: '生成失败', description: err.message, status: 'error' });
    } finally {
      setGenerating(false);
    }
  }

  if (selectedPlan) {
    return (
      <Box>
        <Heading size="lg" color="white" display="flex" alignItems="center" gap={2} mb={4}>
          <SparklesIcon /> AI 约会方案
        </Heading>
        <PlanDetail plan={selectedPlan} onBack={() => setSelectedPlan(null)} />
      </Box>
    );
  }

  return (
    <Box>
      <HStack mb={6} justify="space-between">
        <Box>
          <Heading size="lg" color="white" display="flex" alignItems="center" gap={2}>
            <SparklesIcon /> AI 约会方案
          </Heading>
          <Text color="abyss.400" mt={1} fontSize="sm">让 AI 为你策划完美约会</Text>
        </Box>
        <Badge colorScheme="brand" fontSize="sm" px={3} py={1}>
          {plans.length} 个方案
        </Badge>
      </HStack>

      {/* 创建新方案 */}
      <Box mb={6} p={5} bg="rgba(0,212,170,0.05)" border="1px solid rgba(0,212,170,0.15)" borderRadius="xl">
        <Text color="brand.400" fontWeight="bold" mb={4}>创建新方案</Text>
        <VStack spacing={3} align="stretch">
          <Input
            placeholder="方案标题（选填）"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            bg="abyss.900"
            borderColor="abyss.700"
            _placeholder={{ color: 'abyss.500' }}
          />
          <Textarea
            placeholder="约会场景描述，例如：想和女生去一家有氛围的餐厅吃饭，她是上海人，喜欢粤菜，预算1000元左右"
            value={form.scene}
            onChange={e => setForm({ ...form, scene: e.target.value })}
            bg="abyss.900"
            borderColor="abyss.700"
            _placeholder={{ color: 'abyss.500' }}
            rows={3}
          />
          <HStack>
            <Input
              placeholder="预算，如：1000元左右"
              value={form.budget}
              onChange={e => setForm({ ...form, budget: e.target.value })}
              bg="abyss.900"
              borderColor="abyss.700"
              _placeholder={{ color: 'abyss.500' }}
            />
            <Select
              placeholder="时长"
              value={form.duration}
              onChange={e => setForm({ ...form, duration: e.target.value })}
              bg="abyss.900"
              borderColor="abyss.700"
              w="140px"
            >
              <option value="2小时内">2小时内</option>
              <option value="半天">半天</option>
              <option value="一天">一天</option>
              <option value="多天">多天</option>
            </Select>
          </HStack>
          <Button
            colorScheme="brand"
            leftIcon={<SparklesIcon />}
            onClick={generatePlan}
            isLoading={generating}
            loadingText="AI 策划中..."
            alignSelf="flex-end"
          >
            生成方案
          </Button>
        </VStack>
      </Box>

      {/* 方案列表 */}
      {loading ? (
        <Center py={10}><Spinner /></Center>
      ) : plans.length === 0 ? (
        <Center py={10}>
          <VStack>
            <SparklesIcon boxSize={10} color="abyss.600" />
            <Text color="abyss.400">还没有约会方案，描述场景开始创作吧</Text>
          </VStack>
        </Center>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          {plans.map(plan => (
            <PlanCard key={plan.id} plan={plan} onSelect={setSelectedPlan} />
          ))}
        </SimpleGrid>
      )}
    </Box>
  );
}