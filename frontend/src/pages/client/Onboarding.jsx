/**
 * 客户入职向导 - M007 S05
 */
import { useState, useEffect } from 'react';
import {
  Box, Heading, Card, CardBody, VStack, HStack, Text, Button,
  FormControl, FormLabel, Input, Select, Textarea, Progress,
  Flex, Badge, useToast, Spinner, Icon, SimpleGrid
} from '@chakra-ui/react';
import { CheckIcon } from '../../components/Icons';
import { clients as clientsApi } from '../../utils/api';

const STEPS = [
  { label: '基本信息', desc: '让我了解你的基本情况' },
  { label: '自我评估', desc: '你的情感成熟度与风格' },
  { label: '学习偏好', desc: '你希望如何获得指导' },
  { label: '完成入职', desc: '开始你的提升之旅' },
];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [done, setDone] = useState(false);
  const toast = useToast();

  const [form, setForm] = useState({
    // Step 1: 基本信息
    nickname: '',
    age: '',
    occupation: '',
    residence: '',
    emotionalGoal: '',
    relationshipGoal: '',
    // Step 2: 自我评估
    appearanceSelfAssessment: '',
    personality: '',
    emotionalStable: 5,
    eqLevel: 5,
    emotionalMaturityLevel: 5,
    communicationStyle: '',
    // Step 3: 学习偏好
    learningAbility: '中',
    coachCooperationLevel: 5,
    antiFrustrationLevel: 5,
    pacePreference: '',
    clientType: '',
    profileBio: '',
  });

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const canNext = () => {
    if (step === 0) return form.nickname && form.age && form.emotionalGoal && form.relationshipGoal;
    if (step === 1) return form.personality && form.emotionalMaturityLevel > 0;
    if (step === 2) return form.clientType && form.pacePreference;
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // 保存到 client profile
      await clientsApi.onboardingComplete(form);

      setStep(3);
      setDone(true);
      toast({ title: '入职完成！开始你的提升之旅', status: 'success', duration: 2000, duration: 3000 });
    } catch (e) {
      toast({ title: '保存失败: ' + (e.message || '未知错误'), status: 'error', duration: 4000, duration: 4000 });
    } finally {
      setSubmitting(false);
    }
  };

  const renderStep = () => {
    if (step === 3) {
      return (
        <VStack spacing={6} py={8} textAlign="center">
          <Icon as={CheckIcon} boxSize={16} color="teal.400" />
          <Heading color="white" size="lg">入职完成！</Heading>
          <Text color="rgba(245,240,232,0.4)" maxW="400px">
            你的档案已保存，AI教练已为你准备好个性化指导。开始探索你的缘分吧！
          </Text>
          <Button colorScheme="gold" size="lg" mt={4} onClick={() => window.location.href = '/'}>
            进入首页
          </Button>
        </VStack>
      );
    }

    if (step === 0) {
      return (
        <VStack spacing={5} align="stretch">
          <Text color="rgba(245,240,232,0.4)" fontSize="sm">步骤 1/3 · 基本信息</Text>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl isRequired>
              <FormLabel color="gray.300">昵称/称呼</FormLabel>
              <Input
                value={form.nickname}
                onChange={e => update('nickname', e.target.value)}
                placeholder="你怎么称呼自己"
                bg="warm.700"
                border="none"
                color="white"
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel color="gray.300">年龄</FormLabel>
              <Input
                value={form.age}
                onChange={e => update('age', e.target.value)}
                placeholder="你的年龄"
                type="number"
                bg="warm.700"
                border="none"
                color="white"
              />
            </FormControl>
          </SimpleGrid>
          <FormControl>
            <FormLabel color="gray.300">职业</FormLabel>
            <Input
              value={form.occupation}
              onChange={e => update('occupation', e.target.value)}
              placeholder="你现在从事什么工作"
              bg="warm.700"
              border="none"
              color="white"
            />
          </FormControl>
          <FormControl>
            <FormLabel color="gray.300">所在城市</FormLabel>
            <Input
              value={form.residence}
              onChange={e => update('residence', e.target.value)}
              placeholder="你现在在哪个城市"
              bg="warm.700"
              border="none"
              color="white"
            />
          </FormControl>
          <FormControl isRequired>
            <FormLabel color="gray.300">感情诉求</FormLabel>
            <Select
              value={form.emotionalGoal}
              onChange={e => update('emotionalGoal', e.target.value)}
              placeholder="你现在最想要什么"
              bg="warm.700"
              border="none"
              color="white"
            >
              <option value="认真找对象">认真找对象</option>
              <option value="随便玩玩">随便玩玩</option>
              <option value="家里催婚">家里催婚</option>
              <option value="空虚寂寞">空虚寂寞</option>
              <option value="挽回前任">挽回前任</option>
            </Select>
          </FormControl>
          <FormControl isRequired>
            <FormLabel color="gray.300">关系目标</FormLabel>
            <Select
              value={form.relationshipGoal}
              onChange={e => update('relationshipGoal', e.target.value)}
              placeholder="你想要的关系类型"
              bg="warm.700"
              border="none"
              color="white"
            >
              <option value="短期">短期 · 短期关系</option>
              <option value="长期">长期 · 认真发展</option>
              <option value="不确定">不确定 · 先试试看</option>
            </Select>
          </FormControl>
        </VStack>
      );
    }

    if (step === 1) {
      return (
        <VStack spacing={5} align="stretch">
          <Text color="rgba(245,240,232,0.4)" fontSize="sm">步骤 2/3 · 自我评估</Text>
          <FormControl>
            <FormLabel color="gray.300">颜值自评（1-10）</FormLabel>
            <HStack spacing={4}>
              <Input
                value={form.appearanceSelfAssessment}
                onChange={e => update('appearanceSelfAssessment', e.target.value)}
                placeholder="给自己打个分 1-10"
                type="number"
                min={1}
                max={10}
                bg="warm.700"
                border="none"
                color="white"
                w="100px"
              />
              <Text color="rgba(245,240,232,0.55)" fontSize="sm">（诚实评估，AI教练会帮你找到最优策略）</Text>
            </HStack>
          </FormControl>
          <FormControl isRequired>
            <FormLabel color="gray.300">性格/MBTI</FormLabel>
            <Input
              value={form.personality}
              onChange={e => update('personality', e.target.value)}
              placeholder="如：ENFP、INTJ，或用几个词描述"
              bg="warm.700"
              border="none"
              color="white"
            />
          </FormControl>
          <FormControl>
            <FormLabel color="gray.300">沟通风格</FormLabel>
            <Select
              value={form.communicationStyle}
              onChange={e => update('communicationStyle', e.target.value)}
              placeholder="你平时怎么和人聊天"
              bg="warm.700"
              border="none"
              color="white"
            >
              <option value="直接">直接型 · 有话直说</option>
              <option value="含蓄">含蓄型 · 话里有话</option>
              <option value="话多">话多型 · 滔滔不绝</option>
              <option value="话少">话少型 · 惜字如金</option>
              <option value="幽默">幽默型 · 善于调侃</option>
            </Select>
          </FormControl>
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
            <FormControl>
              <FormLabel color="gray.300">情绪稳定度（1-10）</FormLabel>
              <HStack>
                <Text color="teal.400" fontWeight="bold">{form.emotionalStable}</Text>
                <Input
                  value={form.emotionalStable}
                  onChange={e => update('emotionalStable', parseInt(e.target.value) || 5)}
                  type="range"
                  min={1}
                  max={10}
                  bg="warm.700"
                  border="none"
                  p={0}
                />
              </HStack>
            </FormControl>
            <FormControl>
              <FormLabel color="gray.300">情商水平（1-10）</FormLabel>
              <HStack>
                <Text color="teal.400" fontWeight="bold">{form.eqLevel}</Text>
                <Input
                  value={form.eqLevel}
                  onChange={e => update('eqLevel', parseInt(e.target.value) || 5)}
                  type="range"
                  min={1}
                  max={10}
                  bg="warm.700"
                  border="none"
                  p={0}
                />
              </HStack>
            </FormControl>
            <FormControl isRequired>
              <FormLabel color="gray.300">情感成熟度（1-10）</FormLabel>
              <HStack>
                <Text color="teal.400" fontWeight="bold">{form.emotionalMaturityLevel}</Text>
                <Input
                  value={form.emotionalMaturityLevel}
                  onChange={e => update('emotionalMaturityLevel', parseInt(e.target.value) || 5)}
                  type="range"
                  min={1}
                  max={10}
                  bg="warm.700"
                  border="none"
                  p={0}
                />
              </HStack>
            </FormControl>
          </SimpleGrid>
        </VStack>
      );
    }

    if (step === 2) {
      return (
        <VStack spacing={5} align="stretch">
          <Text color="rgba(245,240,232,0.4)" fontSize="sm">步骤 3/3 · 学习偏好</Text>
          <FormControl isRequired>
            <FormLabel color="gray.300">学习能力</FormLabel>
            <Select
              value={form.learningAbility}
              onChange={e => update('learningAbility', e.target.value)}
              placeholder="你的学习能力如何"
              bg="warm.700"
              border="none"
              color="white"
            >
              <option value="强">强 · 理解快，执行力强</option>
              <option value="中">中 · 需要反复练习</option>
              <option value="弱">弱 · 需要手把手指导</option>
            </Select>
          </FormControl>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl>
              <FormLabel color="gray.300">配合意愿（1-10）</FormLabel>
              <HStack>
                <Text color="teal.400" fontWeight="bold">{form.coachCooperationLevel}</Text>
                <Input
                  value={form.coachCooperationLevel}
                  onChange={e => update('coachCooperationLevel', parseInt(e.target.value) || 5)}
                  type="range"
                  min={1}
                  max={10}
                  bg="warm.700"
                  border="none"
                  p={0}
                />
              </HStack>
            </FormControl>
            <FormControl>
              <FormLabel color="gray.300">抗挫折能力（1-10）</FormLabel>
              <HStack>
                <Text color="teal.400" fontWeight="bold">{form.antiFrustrationLevel}</Text>
                <Input
                  value={form.antiFrustrationLevel}
                  onChange={e => update('antiFrustrationLevel', parseInt(e.target.value) || 5)}
                  type="range"
                  min={1}
                  max={10}
                  bg="warm.700"
                  border="none"
                  p={0}
                />
              </HStack>
            </FormControl>
          </SimpleGrid>
          <FormControl isRequired>
            <FormLabel color="gray.300">节奏偏好</FormLabel>
            <Select
              value={form.pacePreference}
              onChange={e => update('pacePreference', e.target.value)}
              placeholder="你喜欢什么节奏"
              bg="warm.700"
              border="none"
              color="white"
            >
              <option value="快节奏">快节奏 · 想要快速突破</option>
              <option value="稳健型">稳健型 · 稳扎稳打</option>
              <option value="慢热型">慢热型 · 徐徐图之</option>
            </Select>
          </FormControl>
          <FormControl isRequired>
            <FormLabel color="gray.300">你的类型</FormLabel>
            <Select
              value={form.clientType}
              onChange={e => update('clientType', e.target.value)}
              placeholder="你属于哪种类型"
              bg="warm.700"
              border="none"
              color="white"
            >
              <option value="执行型">执行型 · 说干就干，给我方向就去执行</option>
              <option value="质疑型">质疑型 · 喜欢问为什么，理解了才去做</option>
              <option value="自主型">自主型 · 有自己的判断，需要教练辅助决策</option>
            </Select>
          </FormControl>
          <FormControl>
            <FormLabel color="gray.300">个人签名/自我介绍（选填）</FormLabel>
            <Textarea
              value={form.profileBio}
              onChange={e => update('profileBio', e.target.value)}
              placeholder="简单介绍一下自己，让AI教练更快了解你"
              bg="warm.700"
              border="none"
              color="white"
              rows={3}
            />
          </FormControl>
        </VStack>
      );
    }
  };

  return (
    <Box>
      {/* 顶部进度 */}
      <Box mb={8}>
        <Flex justify="space-between" mb={2}>
          {STEPS.map((s, i) => (
            <VStack key={i} spacing={1} flex={1}>
              <Badge
                colorScheme={i < step ? 'teal' : i === step ? 'orange' : 'gray'}
                variant={i === step ? 'solid' : 'outline'}
                px={2}
                py={1}
                borderRadius="full"
                fontSize="xs"
              >
                {i < step ? <><Icon as={CheckIcon} boxSize={3} mr={1} /></> : ''}{s.label}
              </Badge>
              <Text color="rgba(245,240,232,0.55)" fontSize="xs" textAlign="center">{s.desc}</Text>
            </VStack>
          ))}
        </Flex>
        <Progress
          value={(step / 3) * 100}
          size="xs"
          colorScheme="gold"
          borderRadius="full"
        />
      </Box>

      {/* 步骤内容 */}
      <Card bg="warm.800">
        <CardBody p={8}>
          <Heading color="teal.400" size="md" mb={6}>
            {step < 3 ? STEPS[step].label : '完成'}
          </Heading>
          {renderStep()}

          {/* 导航按钮 */}
          {step < 3 && (
            <Flex mt={8} justify="space-between">
              <Button
                variant="ghost"
                onClick={() => setStep(s => s - 1)}
                isDisabled={step === 0}
                color="rgba(245,240,232,0.4)"
              >
                上一步
              </Button>
              <HStack>
                <Text color="rgba(245,240,232,0.55)" fontSize="sm">
                  {step + 1} / 3
                </Text>
                {step < 2 ? (
                  <Button
                    colorScheme="gold"
                    onClick={() => setStep(s => s + 1)}
                    isDisabled={!canNext()}
                  >
                    下一步
                  </Button>
                ) : (
                  <Button
                    colorScheme="gold"
                    onClick={handleSubmit}
                    isLoading={submitting}
                    isDisabled={!canNext()}
                  >
                    完成入职
                  </Button>
                )}
              </HStack>
            </Flex>
          )}
        </CardBody>
      </Card>
    </Box>
  );
}
