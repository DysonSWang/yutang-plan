import { useState, useEffect, useRef } from 'react';
import { Box, Heading, Text, SimpleGrid, Card, CardBody, Badge, Tabs, TabList, TabPanels, Tab, TabPanel, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, useDisclosure, HStack, VStack, Icon, Image, Flex, Divider, Tag, TagLabel, Wrap, WrapItem, Spinner, Center, Input, Button, useToast, Spinner as CSpinner, Checkbox, Collapse, Alert, AlertIcon, NumberInput, NumberInputField, NumberInputStepper, NumberIncrementStepper, NumberDecrementStepper, Select, Textarea, FormControl, FormLabel } from '@chakra-ui/react';
import { HeartIcon } from '../../components/Icons';
import { girls, chatScreenshots, chatLogs, chatPartner } from '../../utils/api';
import { FiSend, FiMessageSquare, FiZap, FiCopy, FiUser } from 'react-icons/fi';

const STAGE_COLORS = {
  '陌生': 'gray',
  '搭讪': 'blue',
  '聊天': 'cyan',
  '暧昧': 'yellow',
  '约会': 'orange',
  '长期': 'green',
};

const FIELDS = {
  basic: ['age', 'occupation', 'education', 'major', 'residence', 'workplace', 'hometown'],
  appearance: ['appearance', 'height', 'bodyType', 'styleTags'],
  family: ['familyBackground', 'familyAtmosphere', 'familyBurden'],
  lifestyle: ['workSchedule', 'socialActivity', 'financialHabits'],
  interests: ['interests', 'dietPreferences', 'dietRestrictions', 'hobbiesDetail'],
  emotional: ['relationshipAttitude', 'pastRelationshipSummary', 'emotionalWounds', 'attachmentStyle', 'dealbreakers'],
  relationship: ['stage', 'status', 'intimacyLevel', 'tensionScore', 'lastContact', 'responsePattern'],
  aiProfile: ['personality', 'values_', 'communicationStyle', 'emotionalTriggers', 'talkingTopics', 'thingsToAvoid'],
  aiStrategy: ['bestApproach', 'recommendedTopics', 'upgradeConditions', 'estimatedTimeline', 'riskFactors', 'strategicNotes'],
  aiEQ: ['empathy', 'selfAwareness', 'communication', 'relationship', 'conflictRes'],
  match: ['matchScore', 'matchScoreBasis', 'matePreferences'],
  meta: ['sourcePlatform', 'sourceUrl', 'homepageUrl', 'notes'],
};

function parseJSONField(val) {
  if (!val) return null;
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return null; }
}

function FieldRow({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <Box>
      <Text color="gray.500" fontSize="xs">{label}</Text>
      <Text color="gray.200" fontSize="sm">{String(value)}</Text>
    </Box>
  );
}

function SectionCard({ title, children }) {
  return (
    <Box bg="gray.700" p={4} borderRadius="md" mb={4}>
      <Text color="teal.400" fontSize="xs" fontWeight="bold" mb={3} textTransform="uppercase" letterSpacing="wider">{title}</Text>
      {children}
    </Box>
  );
}

function TagRow({ label, value }) {
  if (!value) return null;
  const tags = value.split(/[,，、/]/).map(t => t.trim()).filter(Boolean);
  return (
    <Box>
      <Text color="gray.500" fontSize="xs" mb={1}>{label}</Text>
      <Wrap spacing={1}>
        {tags.map((t, i) => (
          <WrapItem key={i}>
            <Tag size="sm" colorScheme="teal" variant="subtle" borderRadius="full">
              <TagLabel fontSize="xs">{t}</TagLabel>
            </Tag>
          </WrapItem>
        ))}
      </Wrap>
    </Box>
  );
}

function EQBar({ label, value }) {
  if (!value && value !== 0) return null;
  const pct = Math.min(100, Math.max(0, (value / 10) * 100));
  return (
    <HStack spacing={3} mb={2}>
      <Text color="gray.500" fontSize="xs" w="80px" flexShrink={0}>{label}</Text>
      <Box flex={1} bg="gray.600" borderRadius="full" h="6px">
        <Box bg="teal.400" h="6px" borderRadius="full" w={`${pct}%`} transition="width 0.3s" />
      </Box>
      <Text color="teal.400" fontSize="xs" fontWeight="bold" w="30px" textAlign="right">{value}</Text>
    </HStack>
  );
}

// 实战聊天组件 - 让客户能够像教练一样和女生聊天
function GirlCombatChat({ girlsList }) {
  const [selectedGirl, setSelectedGirl] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [girlMessage, setGirlMessage] = useState('');
  const [myMessage, setMyMessage] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [optimizations, setOptimizations] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [chatMode, setChatMode] = useState('suggest'); // 'suggest' | 'optimize'
  const [sendingContent, setSendingContent] = useState('');
  const toast = useToast();
  const messagesEndRef = useRef(null);
  const [recentLogs, setRecentLogs] = useState([]);
  // 档案提取状态（女生 + 客户）
  const [profilePendingId, setProfilePendingId] = useState(null);
  const [profilePendingFields, setProfilePendingFields] = useState({});
  const [showProfileFields, setShowProfileFields] = useState(false);
  const [clientProfilePendingId, setClientProfilePendingId] = useState(null);
  const [clientPendingFields, setClientPendingFields] = useState({});

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, aiSuggestions]);

  const selectGirl = async (girl) => {
    setSelectedGirl(girl);
    setChatHistory([]);
    setAiAnalysis('');
    setAiSuggestions([]);
    setOptimizations([]);
    setSendingContent('');
    setGirlMessage('');
    setMyMessage('');
    setChatMode('suggest');
    setProfilePendingId(null);
    setProfilePendingFields({});
    setClientProfilePendingId(null);
    setClientPendingFields({});
    try {
      const res = await chatLogs.byGirl(girl.id);
      if (res.success) setRecentLogs(res.logs);
    } catch { /* ignore */ }
  };

  const handleGirlMessage = async () => {
    if (!girlMessage.trim()) return;
    setIsAnalyzing(true);
    const newHistory = [...chatHistory, { role: 'girl', content: girlMessage }];
    setChatHistory(newHistory);
    setGirlMessage('');
    setAiAnalysis('');
    setAiSuggestions([]);
    try {
      const res = await chatPartner.analyze({
        girlId: selectedGirl.id,
        message: girlMessage,
        history: chatHistory.map(m => ({ role: m.role, content: m.content }))
      });
      if (res.success) {
        setAiAnalysis(res.analysis || '');
        setAiSuggestions(res.suggestions || []);
        // 女生档案提取
        if (res.profilePendingId) {
          setProfilePendingId(res.profilePendingId);
          setProfilePendingFields(res.pendingFields || {});
        }
        // 客户档案提取
        if (res.clientProfilePendingId) {
          setClientProfilePendingId(res.clientProfilePendingId);
          setClientPendingFields(res.clientPendingFields || {});
        }
      }
    } catch {
      toast({ title: 'AI分析失败', status: 'error' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleOptimizeMessage = async () => {
    if (!myMessage.trim()) return;
    setIsOptimizing(true);
    setOptimizations([]);
    try {
      const res = await chatPartner.optimizeMessage({
        girlId: selectedGirl.id,
        myMessage: myMessage,
        history: chatHistory.map(m => ({ role: m.role, content: m.content }))
      });
      if (res.success) {
        setOptimizations(res.optimizations || []);
      }
    } catch {
      toast({ title: '话术优化失败', status: 'error' });
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleSelectSuggestion = async (suggestion) => {
    const replyText = suggestion.text || suggestion.reply || suggestion;
    setSendingContent(replyText);
    setAiSuggestions([]);
    setOptimizations([]);
    setChatHistory(prev => [...prev, { role: 'user', content: replyText, adopted: true }]);
    setAiAnalysis('');
    setGirlMessage('');
    setMyMessage('');
    try {
      const res = await chatPartner.feedback({
        girlId: selectedGirl.id,
        receiverName: selectedGirl.name,
        chosenReply: replyText,
        originalGirlMessage: chatHistory.filter(m => m.role === 'girl').pop()?.content || '',
        style: suggestion.style || '建议',
        intention: suggestion.intention || '',
        profilePendingId,
        selectedProfileFields: profilePendingId ? {} : null,
        clientProfilePendingId,
        clientSelectedProfileFields: clientProfilePendingId ? {} : null
      });
      // 采纳后清除档案状态（后端已处理确认）
      setProfilePendingId(null);
      setProfilePendingFields({});
      setClientProfilePendingId(null);
      setClientPendingFields({});
      setShowProfileFields(false);
      if (res.profileConfirm?.success || res.clientProfileConfirm?.success) {
        toast({ title: '档案已更新', status: 'success', duration: 2000 });
      } else {
        toast({ title: '已采纳建议', status: 'success', duration: 2000 });
      }
    } catch {
      toast({ title: '保存失败', status: 'error' });
    }
  };

  const handleSelectOptimization = (opt) => {
    const replyText = opt.text || opt.reply || opt;
    setSendingContent(replyText);
    setOptimizations([]);
    setMyMessage('');
  };

  const handleSend = async () => {
    if (!sendingContent.trim()) return;
    try {
      await chatLogs.create({
        girlId: selectedGirl.id,
        receiverName: selectedGirl.name,
        content: sendingContent,
        aiAdopted: false,
        isVisibleToClient: true
      });
      setChatHistory(prev => [...prev, { role: 'user', content: sendingContent, adopted: false }]);
      setSendingContent('');
      toast({ title: '已保存', status: 'success', duration: 1500 });
      const res = await chatLogs.byGirl(selectedGirl.id);
      if (res.success) setRecentLogs(res.logs);
    } catch {
      toast({ title: '保存失败', status: 'error' });
    }
  };

  const handleClear = () => {
    setChatHistory([]);
    setAiAnalysis('');
    setAiSuggestions([]);
    setOptimizations([]);
    setSendingContent('');
    setGirlMessage('');
    setMyMessage('');
    setProfilePendingId(null);
    setProfilePendingFields({});
    setClientProfilePendingId(null);
    setClientPendingFields({});
    setShowProfileFields(false);
  };

  const getTensionEmoji = (score) => {
    if (score >= 8) return '🔥🔥🔥';
    if (score >= 7) return '🔥🔥';
    if (score >= 5) return '🔥';
    if (score >= 3) return '❄️';
    return '❄️❄️';
  };

  if (girlsList.length === 0) {
    return (
      <Flex flex={1} align="center" justify="center">
        <Text color="gray.500">暂无女生资源，请先添加女生</Text>
      </Flex>
    );
  }

  return (
    <Flex gap={4} h="calc(100vh - 300px)" minH="400px">
      {/* 左侧：女生选择列表 */}
      <Box w="220px" flexShrink={0}>
        <Text color="gray.400" fontSize="sm" mb={2}>选择女生</Text>
        <VStack spacing={2} align="stretch">
          {girlsList.map(girl => (
            <Box
              key={girl.id}
              p={3}
              bg={selectedGirl?.id === girl.id ? 'teal.600' : 'gray.700'}
              borderRadius="md"
              cursor="pointer"
              onClick={() => selectGirl(girl)}
              _hover={{ bg: selectedGirl?.id === girl.id ? 'teal.600' : 'gray.600' }}
            >
              <Text color="white" fontSize="sm" fontWeight="bold">{girl.name}</Text>
              <HStack spacing={2} mt={1}>
                <Badge fontSize="xs">{girl.stage || '未知'}</Badge>
                <HStack spacing={1}>
                  <Icon as={HeartIcon} color="red.400" boxSize={3} />
                  <Text color="gray.400" fontSize="xs">x{girl.intimacyLevel || 1}</Text>
                </HStack>
              </HStack>
            </Box>
          ))}
        </VStack>
      </Box>

      {/* 中间：聊天区 */}
      <Box flex={1} display="flex" flexDirection="column">
        {!selectedGirl ? (
          <Flex flex={1} align="center" justify="center">
            <Text color="gray.500">选择一个女生开始实战聊天</Text>
          </Flex>
        ) : (
          <>
            {/* 顶部：模式切换 */}
            <HStack mb={3} bg="gray.700" p={1} borderRadius="md" w="fit-content">
              <Box
                px={4}
                py={2}
                borderRadius="md"
                cursor="pointer"
                bg={chatMode === 'suggest' ? 'teal.600' : 'transparent'}
                onClick={() => { setChatMode('suggest'); setOptimizations([]); setGirlMessage(''); }}
              >
                <HStack spacing={2}>
                  <Icon as={FiMessageSquare} color="blue.300" boxSize={4} />
                  <Text color="white" fontSize="sm" fontWeight="bold">回复建议</Text>
                </HStack>
              </Box>
              <Box
                px={4}
                py={2}
                borderRadius="md"
                cursor="pointer"
                bg={chatMode === 'optimize' ? 'orange.600' : 'transparent'}
                onClick={() => { setChatMode('optimize'); setAiSuggestions([]); setAiAnalysis(''); setMyMessage(''); }}
              >
                <HStack spacing={2}>
                  <Icon as={FiZap} color="orange.300" boxSize={4} />
                  <Text color="white" fontSize="sm" fontWeight="bold">话术优化</Text>
                </HStack>
              </Box>
            </HStack>

            {/* 输入区 */}
            {chatMode === 'suggest' ? (
              <HStack mb={3}>
                <Input
                  flex={1}
                  value={girlMessage}
                  onChange={e => setGirlMessage(e.target.value)}
                  onKeyPress={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGirlMessage(); } }}
                  placeholder={`粘贴${selectedGirl.name}的消息...`}
                  bg="gray.700"
                  border="none"
                  color="white"
                  _placeholder={{ color: 'gray.400' }}
                />
                <Button colorScheme="blue" onClick={handleGirlMessage} isLoading={isAnalyzing} isDisabled={!girlMessage.trim()}>
                  分析
                </Button>
              </HStack>
            ) : (
              <HStack mb={3}>
                <Input
                  flex={1}
                  value={myMessage}
                  onChange={e => setMyMessage(e.target.value)}
                  onKeyPress={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleOptimizeMessage(); } }}
                  placeholder="粘贴你想发给她的话..."
                  bg="gray.700"
                  border="none"
                  color="white"
                  _placeholder={{ color: 'gray.400' }}
                />
                <Button colorScheme="orange" onClick={handleOptimizeMessage} isLoading={isOptimizing} isDisabled={!myMessage.trim()}>
                  优化
                </Button>
              </HStack>
            )}

            {/* 聊天历史 */}
            <Box flex={1} overflowY="auto" mb={3}>
              <VStack spacing={3} align="stretch">
                {chatHistory.length === 0 && !aiAnalysis && (
                  <Text color="gray.500" textAlign="center" fontSize="sm" py={4}>
                    暂无对话记录
                  </Text>
                )}

                {chatHistory.map((msg, i) => (
                  <Box
                    key={i}
                    alignSelf={msg.role === 'user' ? 'flex-end' : 'flex-start'}
                    maxW="80%"
                    p={3}
                    borderRadius="lg"
                    bg={msg.role === 'user' ? (msg.adopted ? 'teal.600' : 'gray.600') : 'gray.700'}
                  >
                    <HStack mb={1} spacing={1}>
                      <Icon
                        as={msg.role === 'user' ? FiSend : FiMessageSquare}
                        boxSize={3}
                        color={msg.role === 'user' ? 'teal.300' : 'gray.400'}
                      />
                      <Text fontSize="xs" color="gray.300">
                        {msg.role === 'user' ? (msg.adopted ? '我(AI建议)' : '我') : selectedGirl.name}
                      </Text>
                    </HStack>
                    <Text color="white" fontSize="sm" whiteSpace="pre-wrap">{msg.content}</Text>
                  </Box>
                ))}

                {aiAnalysis && (
                  <Box p={3} bg="purple.900" borderRadius="lg" borderLeft="3px solid" borderColor="purple.400" alignSelf="flex-start" maxW="90%">
                    <HStack mb={2}>
                      <Icon as={FiZap} color="purple.400" boxSize={4} />
                      <Text color="purple.300" fontSize="sm" fontWeight="bold">AI分析</Text>
                    </HStack>
                    <Text color="gray.200" fontSize="sm" whiteSpace="pre-wrap">{aiAnalysis}</Text>
                  </Box>
                )}

                {/* 女生档案更新预览 */}
                {Object.keys(profilePendingFields).length > 0 && (
                  <Box p={3} bg="cyan.900" borderRadius="lg" borderLeft="3px solid" borderColor="cyan.400" alignSelf="flex-start" maxW="90%">
                    <HStack justify="space-between" mb={2}>
                      <HStack>
                        <Icon as={FiUser} color="cyan.400" boxSize={4} />
                        <Text color="cyan.300" fontSize="sm" fontWeight="bold">女生档案更新</Text>
                        <Badge colorScheme="cyan" fontSize="xs">{Object.keys(profilePendingFields).length} 个字段</Badge>
                      </HStack>
                      <Button size="xs" variant="ghost" color="gray.400" onClick={() => setShowProfileFields(v => !v)}>
                        {showProfileFields ? '收起' : '展开'}
                      </Button>
                    </HStack>
                    <Collapse in={showProfileFields}>
                      <Alert status="info" borderRadius="md" mb={2} bg="cyan.800" fontSize="xs">
                        <AlertIcon />
                        采纳回复后将自动更新已勾选字段
                      </Alert>
                      <SimpleGrid columns={2} spacing={2}>
                        {Object.entries(profilePendingFields).map(([key, { label, value }]) => (
                          <HStack key={key} bg="gray.700" p={2} borderRadius="md">
                            <Checkbox size="sm" isChecked={true} colorScheme="cyan" isDisabled />
                            <Box flex={1}>
                              <Text color="gray.400" fontSize="xs">{label}</Text>
                              <Text color="teal.300" fontSize="sm">{value}</Text>
                            </Box>
                          </HStack>
                        ))}
                      </SimpleGrid>
                    </Collapse>
                  </Box>
                )}

                {/* 客户档案更新预览 */}
                {Object.keys(clientPendingFields).length > 0 && (
                  <Box p={3} bg="green.900" borderRadius="lg" borderLeft="3px solid" borderColor="green.400" alignSelf="flex-start" maxW="90%">
                    <HStack mb={2}>
                      <Icon as={FiUser} color="green.400" boxSize={4} />
                      <Text color="green.300" fontSize="sm" fontWeight="bold">你的档案更新</Text>
                      <Badge colorScheme="green" fontSize="xs">{Object.keys(clientPendingFields).length} 个字段</Badge>
                    </HStack>
                    <VStack spacing={1} align="stretch">
                      {Object.entries(clientPendingFields).map(([key, { label, value }]) => (
                        <HStack key={key} bg="gray.700" p={2} borderRadius="md">
                          <Box flex={1}>
                            <Text color="gray.400" fontSize="xs">{label}</Text>
                            <Text color="green.300" fontSize="sm">{value}</Text>
                          </Box>
                        </HStack>
                      ))}
                    </VStack>
                  </Box>
                )}

                {aiSuggestions.map((s, i) => (
                  <Box
                    key={i}
                    p={3}
                    bg="blue.900"
                    borderRadius="lg"
                    borderLeft="3px solid"
                    borderColor="blue.400"
                    alignSelf="flex-start"
                    maxW="85%"
                    cursor="pointer"
                    _hover={{ bg: 'teal.900', transform: 'translateX(4px)' }}
                    transition="all 0.15s"
                    onClick={() => handleSelectSuggestion(s)}
                  >
                    <HStack justify="space-between" mb={1}>
                      <Badge colorScheme="blue" fontSize="xs">{s.style || '建议'}</Badge>
                      <HStack spacing={1}>
                        <Text color="gray.400" fontSize="xs">{s.intention || ''}</Text>
                        <Icon as={FiCopy} color="gray.500" boxSize={3} cursor="pointer"
                          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(s.text || s.reply || s); toast({ description: '已复制', duration: 1500, isClosable: false, position: 'top' }); }} />
                      </HStack>
                    </HStack>
                    <Text color="white" fontSize="sm">{s.text || s.reply || s}</Text>
                  </Box>
                ))}

                {optimizations.map((opt, i) => (
                  <Box
                    key={i}
                    p={3}
                    bg="orange.900"
                    borderRadius="lg"
                    borderLeft="3px solid"
                    borderColor="orange.400"
                    alignSelf="flex-start"
                    maxW="85%"
                    cursor="pointer"
                    _hover={{ bg: 'teal.900', transform: 'translateX(4px)' }}
                    transition="all 0.15s"
                    onClick={() => handleSelectOptimization(opt)}
                  >
                    <HStack justify="space-between" mb={1}>
                      <Badge colorScheme="orange" fontSize="xs">{opt.style || '优化版'}</Badge>
                      <HStack spacing={1}>
                        <Text color="gray.400" fontSize="xs">{opt.point || ''}</Text>
                        <Icon as={FiCopy} color="gray.500" boxSize={3} cursor="pointer"
                          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(opt.text || opt.reply || opt); toast({ description: '已复制', duration: 1500, isClosable: false, position: 'top' }); }} />
                      </HStack>
                    </HStack>
                    <Text color="white" fontSize="sm">{opt.text || opt.reply || opt}</Text>
                  </Box>
                ))}

                {(isAnalyzing || isOptimizing) && (
                  <Box p={3} bg="gray.700" borderRadius="lg" alignSelf="flex-start">
                    <HStack spacing={2}>
                      <CSpinner size="sm" color="teal.400" />
                      <Text color="gray.400" fontSize="sm">{isAnalyzing ? 'AI分析中...' : '话术优化中...'}</Text>
                    </HStack>
                  </Box>
                )}

                <div ref={messagesEndRef} />
              </VStack>
            </Box>

            {/* 底部：发送框 */}
            {sendingContent && (
              <Box mb={2}>
                <Text color="gray.500" fontSize="xs" mb={1}>已采纳的回复</Text>
              </Box>
            )}
            <HStack>
              <Input
                flex={1}
                value={sendingContent}
                onChange={e => setSendingContent(e.target.value)}
                placeholder="编辑回复内容，或点击上方建议采纳..."
                bg="gray.700"
                border="none"
                color="white"
                _placeholder={{ color: 'gray.400' }}
              />
              <Button colorScheme="teal" onClick={handleSend} isDisabled={!sendingContent.trim()} leftIcon={<Icon as={FiSend} />}>
                保存
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClear} color="gray.400" isDisabled={chatHistory.length === 0}>
                清除
              </Button>
            </HStack>
          </>
        )}
      </Box>

      {/* 右侧：选中女生详情 */}
      <Box w="240px" flexShrink={0}>
        {selectedGirl ? (
          <Card bg="gray.800" h="100%">
            <CardBody>
              <Text color="white" fontWeight="bold" fontSize="lg" mb={2}>{selectedGirl.name}</Text>
              <HStack spacing={2} mb={3}>
                <Badge>{selectedGirl.stage || '未知'}</Badge>
                <HStack spacing={1}>
                  <Icon as={HeartIcon} color="red.400" boxSize={4} />
                  <Text color="gray.400" fontSize="xs">x{selectedGirl.intimacyLevel || 1}</Text>
                </HStack>
              </HStack>

              <VStack spacing={2} align="stretch">
                <Box p={2} bg="gray.700" borderRadius="md">
                  <Text color="gray.400" fontSize="xs">关系热度</Text>
                  <HStack mt={1}>
                    <Text color="white" fontWeight="bold">{selectedGirl.tensionScore || 5}/10</Text>
                    <Text color="orange.400">{getTensionEmoji(selectedGirl.tensionScore || 5)}</Text>
                  </HStack>
                </Box>
                {selectedGirl.age && (
                  <Box p={2} bg="gray.700" borderRadius="md">
                    <Text color="gray.400" fontSize="xs">年龄</Text>
                    <Text color="white" fontSize="sm">{selectedGirl.age}岁</Text>
                  </Box>
                )}
                {selectedGirl.occupation && (
                  <Box p={2} bg="gray.700" borderRadius="md">
                    <Text color="gray.400" fontSize="xs">职业</Text>
                    <Text color="white" fontSize="sm">{selectedGirl.occupation}</Text>
                  </Box>
                )}
                <Box p={2} bg="gray.700" borderRadius="md">
                  <Text color="gray.400" fontSize="xs">代聊记录</Text>
                  <Text color="white" fontSize="sm">{recentLogs.length} 条</Text>
                </Box>
              </VStack>
            </CardBody>
          </Card>
        ) : (
          <Text color="gray.500" fontSize="sm">选择女生查看详情</Text>
        )}
      </Box>
    </Flex>
  );
}

function GirlDetailModal({ girl, screenshots, onPreviewUrl }) {
  if (!girl) return null;

  const photos = parseJSONField(girl.photos);
  const videos = parseJSONField(girl.videos);
  const signals = parseJSONField(girl.signals);
  const pendingActions = parseJSONField(girl.pendingActions);
  const observations = parseJSONField(girl.observations);
  const dates = girl.dates || [];

  const lastContact = girl.lastContact
    ? new Date(girl.lastContact).toLocaleString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <>
      <ModalBody pb={6}>
        {/* 基本信息 */}
        <SectionCard title="基本信息">
          <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
            <FieldRow label="姓名" value={girl.name} />
            <FieldRow label="年龄" value={girl.age ? `${girl.age}岁` : null} />
            <FieldRow label="职业" value={girl.occupation} />
            <FieldRow label="学历" value={girl.education} />
            <FieldRow label="专业" value={girl.major} />
            <FieldRow label="现居城市" value={girl.residence} />
            <FieldRow label="工作地点" value={girl.workplace} />
            <FieldRow label="籍贯" value={girl.hometown} />
          </SimpleGrid>
        </SectionCard>

        {/* 外貌特征 */}
        <SectionCard title="外貌特征">
          <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
            <FieldRow label="外貌描述" value={girl.appearance} />
            <FieldRow label="身高" value={girl.height ? `${girl.height}cm` : null} />
            <FieldRow label="体型" value={girl.bodyType} />
          </SimpleGrid>
          <TagRow label="风格标签" value={girl.styleTags} />
          <Box mt={2}>
            <Text color="gray.500" fontSize="xs" mb={1}>主页链接</Text>
            {girl.homepageUrl || girl.sourceUrl ? (
              <Text as="a" href={girl.homepageUrl || girl.sourceUrl} color="teal.400" fontSize="sm" target="_blank" rel="noopener">
                {girl.homepageUrl || girl.sourceUrl}
              </Text>
            ) : <Text color="gray.500" fontSize="sm">-</Text>}
          </Box>
        </SectionCard>

        {/* 照片 */}
        {photos && photos.length > 0 && (
          <SectionCard title={`照片 (${photos.length})`}>
            <SimpleGrid columns={Math.min(photos.length, 4)} spacing={2}>
              {photos.map((url, i) => (
                <Image key={i} src={url} alt="照片" h="100px" w="100%" objectFit="cover" borderRadius="md" cursor="pointer" onClick={() => onPreviewUrl(url)} _hover={{ opacity: 0.8 }} fallbackSrc="https://via.placeholder.com/100x100?text=..." />
              ))}
            </SimpleGrid>
          </SectionCard>
        )}

        {/* 视频 */}
        {videos && videos.length > 0 && (
          <SectionCard title={`视频 (${videos.length})`}>
            <VStack spacing={2} align="stretch">
              {videos.map((url, i) => (
                <Box key={i} p={2} bg="gray.600" borderRadius="md">
                  <Text as="a" href={url} color="teal.400" fontSize="sm" target="_blank">{url}</Text>
                </Box>
              ))}
            </VStack>
          </SectionCard>
        )}

        {/* 家庭背景 */}
        <SectionCard title="家庭背景">
          <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
            <FieldRow label="家庭背景" value={girl.familyBackground} />
            <FieldRow label="家庭氛围" value={girl.familyAtmosphere} />
            <FieldRow label="养老负担" value={girl.familyBurden} />
          </SimpleGrid>
          <FieldRow label="家庭备注" value={girl.familyComments} />
        </SectionCard>

        {/* 生活状态 */}
        <SectionCard title="生活状态">
          <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
            <FieldRow label="作息规律" value={girl.workSchedule} />
            <FieldRow label="社交活跃度" value={girl.socialActivity} />
            <FieldRow label="消费习惯" value={girl.financialHabits} />
          </SimpleGrid>
        </SectionCard>

        {/* 兴趣爱好 */}
        <SectionCard title="兴趣爱好">
          <FieldRow label="兴趣爱好" value={girl.interests} />
          <SimpleGrid columns={2} spacing={4} mt={2}>
            <FieldRow label="饮食偏好" value={girl.dietPreferences} />
            <FieldRow label="饮食禁忌" value={girl.dietRestrictions} />
          </SimpleGrid>
          <FieldRow label="兴趣详情" value={girl.hobbiesDetail} />
        </SectionCard>

        {/* 情感状态 */}
        <SectionCard title="情感状态">
          <SimpleGrid columns={2} spacing={4}>
            <FieldRow label="婚恋态度" value={girl.relationshipAttitude} />
            <FieldRow label="依恋类型" value={girl.attachmentStyle} />
          </SimpleGrid>
          <FieldRow label="情史摘要" value={girl.pastRelationshipSummary} />
          <FieldRow label="情伤记录" value={girl.emotionalWounds} />
          <FieldRow label="绝对雷区" value={girl.dealbreakers} />
        </SectionCard>

        {/* 关系状态 */}
        <SectionCard title="关系状态">
          <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
            <FieldRow label="阶段" value={girl.stage} />
            <FieldRow label="状态" value={girl.status} />
            <FieldRow label="亲密度" value={`Lv.${girl.intimacyLevel || 1}`} />
            <FieldRow label="热度评分" value={girl.tensionScore ? girl.tensionScore.toFixed(1) : null} />
            <FieldRow label="回复规律" value={girl.responsePattern} />
            <FieldRow label="最后联系" value={lastContact} />
          </SimpleGrid>
        </SectionCard>

        {/* AI画像 */}
        <SectionCard title="AI画像">
          <FieldRow label="性格" value={girl.personality} />
          <TagRow label="价值观" value={girl.values_} />
          <SimpleGrid columns={2} spacing={4} mt={2}>
            <FieldRow label="沟通风格" value={girl.communicationStyle} />
            <FieldRow label="情绪触发点" value={girl.emotionalTriggers} />
            <FieldRow label="喜欢的话题" value={girl.talkingTopics} />
            <FieldRow label="禁忌话题" value={girl.thingsToAvoid} />
          </SimpleGrid>
        </SectionCard>

        {/* EQ评分 */}
        {(girl.empathy || girl.selfAwareness || girl.communication || girl.relationship || girl.conflictRes) && (
          <SectionCard title="EQ评分">
            <EQBar label="共情能力" value={girl.empathy} />
            <EQBar label="自我认知" value={girl.selfAwareness} />
            <EQBar label="沟通能力" value={girl.communication} />
            <EQBar label="关系经营" value={girl.relationship} />
            <EQBar label="冲突解决" value={girl.conflictRes} />
          </SectionCard>
        )}

        {/* AI战略建议 */}
        <SectionCard title="AI战略建议">
          <SimpleGrid columns={2} spacing={4}>
            <FieldRow label="最佳策略" value={girl.bestApproach} />
            <FieldRow label="推荐话题" value={girl.recommendedTopics} />
            <FieldRow label="升级条件" value={girl.upgradeConditions} />
            <FieldRow label="预计时间线" value={girl.estimatedTimeline} />
          </SimpleGrid>
          <FieldRow label="风险因素" value={girl.riskFactors} />
          <FieldRow label="战略备注" value={girl.strategicNotes} />
        </SectionCard>

        {/* 匹配分析 */}
        {(girl.matchScore || girl.matchScoreBasis || girl.matePreferences) && (
          <SectionCard title="匹配分析">
            {girl.matchScore && (
              <HStack mb={3}>
                <Text color="gray.500" fontSize="xs">匹配度</Text>
                <Text color="teal.400" fontSize="2xl" fontWeight="bold">{girl.matchScore}</Text>
                <Text color="gray.500" fontSize="xs">/ 100</Text>
              </HStack>
            )}
            <FieldRow label="计算依据" value={girl.matchScoreBasis} />
            <FieldRow label="择偶偏好" value={girl.matePreferences} />
          </SectionCard>
        )}

        {/* 上下文记忆 */}
        {(signals?.length || pendingActions?.length || observations?.length || girl.conversationSummary) && (
          <SectionCard title="上下文记忆">
            <FieldRow label="对话摘要" value={girl.conversationSummary} />
            {signals?.length > 0 && (
              <Box mt={2}>
                <Text color="gray.500" fontSize="xs" mb={1}>信号 ({signals.length})</Text>
                <Wrap spacing={1}>
                  {signals.map((s, i) => (
                    <WrapItem key={i}>
                      <Tag size="sm" colorScheme="orange" variant="subtle" borderRadius="full">
                        <TagLabel fontSize="xs">{typeof s === 'string' ? s : s.text || s.signal || JSON.stringify(s)}</TagLabel>
                      </Tag>
                    </WrapItem>
                  ))}
                </Wrap>
              </Box>
            )}
            {pendingActions?.length > 0 && (
              <Box mt={2}>
                <Text color="gray.500" fontSize="xs" mb={1}>待办事项 ({pendingActions.length})</Text>
                {pendingActions.map((a, i) => (
                  <Text key={i} color="gray.300" fontSize="sm">
                    • {typeof a === 'string' ? a : a.text || a.action || JSON.stringify(a)}
                  </Text>
                ))}
              </Box>
            )}
            {observations?.length > 0 && (
              <Box mt={2}>
                <Text color="gray.500" fontSize="xs" mb={1}>观察记录 ({observations.length})</Text>
                {observations.map((o, i) => (
                  <Text key={i} color="gray.300" fontSize="sm">
                    • {typeof o === 'string' ? o : o.text || o.observation || JSON.stringify(o)}
                  </Text>
                ))}
              </Box>
            )}
          </SectionCard>
        )}

        {/* 约会记录 */}
        {dates.length > 0 && (
          <SectionCard title={`约会记录 (${dates.length})`}>
            <VStack spacing={2} align="stretch">
              {dates.slice(0, 10).map(d => (
                <Box key={d.id} p={2} bg="gray.600" borderRadius="md">
                  <HStack justify="space-between">
                    <Text color="gray.200" fontSize="sm">{d.title || d.location || '约会'}</Text>
                    <Badge colorScheme={d.status === 'confirmed' ? 'green' : d.status === 'pending' ? 'yellow' : 'gray'} fontSize="xs">
                      {d.status === 'confirmed' ? '已确认' : d.status === 'pending' ? '待确认' : d.status}
                    </Badge>
                  </HStack>
                  <Text color="gray.500" fontSize="xs">
                    {d.dateTime ? new Date(d.dateTime).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                    {d.location ? ` · ${d.location}` : ''}
                  </Text>
                </Box>
              ))}
            </VStack>
          </SectionCard>
        )}

        {/* 交流截图 */}
        <SectionCard title={`交流记录 (${screenshots.length})`}>
          {screenshots.length === 0 ? (
            <Text color="gray.500" textAlign="center" py={4}>暂无交流记录</Text>
          ) : (
            <SimpleGrid columns={Math.min(screenshots.length, 4)} spacing={2}>
              {screenshots.map(ss => (
                <Image
                  key={ss.id}
                  src={`${import.meta.env.VITE_API_URL || 'http://localhost:3005'}${ss.imageUrl}`}
                  alt="截图"
                  w="100%"
                  h="80px"
                  objectFit="cover"
                  borderRadius="md"
                  cursor="pointer"
                  onClick={() => onPreviewUrl(`${import.meta.env.VITE_API_URL || 'http://localhost:3005'}${ss.imageUrl}`)}
                  _hover={{ opacity: 0.8 }}
                  fallbackSrc="https://via.placeholder.com/100x80?text=..."
                />
              ))}
            </SimpleGrid>
          )}
        </SectionCard>

        {/* 元数据 */}
        <SectionCard title="其他信息">
          <SimpleGrid columns={2} spacing={4}>
            <FieldRow label="来源平台" value={girl.sourcePlatform} />
            <FieldRow label="备注" value={girl.notes} />
          </SimpleGrid>
        </SectionCard>
      </ModalBody>
    </>
  );
}

export default function MyPond() {
  const [girlsList, setGirls] = useState([]);
  const [allScreenshots, setAllScreenshots] = useState([]);
  const [girlDetail, setGirlDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedGirl, setSelectedGirl] = useState(null);
  const [girlScreenshots, setGirlScreenshots] = useState([]);
  const [previewImage, setPreviewImage] = useState(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isAddOpen, onOpen: onAddOpen, onClose: onAddClose } = useDisclosure();
  const [addForm, setAddForm] = useState({ name: '', age: '', occupation: '' });
  const [adding, setAdding] = useState(false);
  const toast = useToast();

  useEffect(() => {
    loadGirls();
    loadAllScreenshots();
  }, []);

  const loadGirls = async () => {
    try {
      const res = await girls.list();
      if (res.success) {
        setGirls(res.girls);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadAllScreenshots = async () => {
    try {
      const res = await chatScreenshots.my();
      if (res.success) {
        setAllScreenshots(res.screenshots);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddGirl = async () => {
    if (!addForm.name.trim()) {
      toast({ title: '请输入昵称', status: 'warning', duration: 2000 });
      return;
    }
    setAdding(true);
    try {
      const res = await girls.clientAdd({ name: addForm.name.trim(), age: addForm.age || undefined, occupation: addForm.occupation || undefined });
      if (res.success) {
        toast({ title: res.quotaLeft !== undefined ? `添加成功，剩余 ${res.quotaLeft} 个名额` : '添加成功', status: 'success', duration: 2000 });
        setAddForm({ name: '', age: '', occupation: '' });
        onAddClose();
        loadGirls();
      } else if (res.code === 'QUOTA_EXCEEDED') {
        toast({ title: `额度已用完（${res.currentCount}/${res.quota}人），请联系操盘手升级`, status: 'warning', duration: 4000 });
      } else {
        toast({ title: res.error || '添加失败', status: 'error', duration: 2000 });
      }
    } catch (e) {
      const msg = e?.response?.data?.error || '';
      if (msg.includes('额度') || e?.response?.data?.code === 'QUOTA_EXCEEDED') {
        toast({ title: `额度已用完，请联系操盘手升级`, status: 'warning', duration: 4000 });
      } else {
        toast({ title: '添加失败', status: 'error', duration: 2000 });
      }
    } finally {
      setAdding(false);
    }
  };

  const viewGirlDetail = async (girl) => {
    setSelectedGirl(girl);
    setGirlDetail(null);
    setGirlScreenshots([]);
    setDetailLoading(true);
    onOpen();
    try {
      const [detailRes, ssRes] = await Promise.all([
        girls.get(girl.id),
        chatScreenshots.my({ girlId: girl.id })
      ]);
      if (detailRes.success) {
        setGirlDetail(detailRes.girl);
      }
      if (ssRes.success) {
        setGirlScreenshots(ssRes.screenshots);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <Box>
      <Heading color="white" mb={6}>我的鱼塘</Heading>

      <HStack mb={4} justify="flex-end">
        <Button
          colorScheme="teal"
          size="sm"
          onClick={onAddOpen}
        >
          + 添加女生
        </Button>
      </HStack>

      <Tabs variant="soft-rounded" colorScheme="teal">
        <TabList mb={4}>
          <Tab>女生资源</Tab>
          <Tab>交流记录</Tab>
          <Tab>实战聊天</Tab>
        </TabList>

        <TabPanels>
          {/* 女生资源 */}
          <TabPanel p={0}>
            <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
              {girlsList.map(girl => (
                <Card key={girl.id} bg="gray.800" cursor="pointer" onClick={() => viewGirlDetail(girl)} _hover={{ bg: 'gray.700' }} transition="all 0.2s">
                  <CardBody>
                    <HStack justify="space-between" mb={2}>
                      <Text color="white" fontWeight="bold">{girl.name}</Text>
                      <Badge colorScheme={STAGE_COLORS[girl.stage] || 'gray'}>{girl.stage || '未知'}</Badge>
                    </HStack>
                    <Text color="gray.400" fontSize="sm">
                      {girl.age ? `${girl.age}岁` : ''} {girl.occupation || ''}
                    </Text>
                    <HStack mt={2} spacing={1}>
                      <Icon as={HeartIcon} color="red.400" w={3} h={3} />
                      <Text color="gray.500" fontSize="xs">亲密度 x{girl.intimacyLevel || 1}</Text>
                    </HStack>
                  </CardBody>
                </Card>
              ))}
              {girlsList.length === 0 && (
                <Text color="gray.500">暂无女生资源</Text>
              )}
            </SimpleGrid>
          </TabPanel>

          {/* 实战聊天 */}
          <TabPanel p={0}>
            <GirlCombatChat girlsList={girlsList} />
          </TabPanel>

          {/* 交流记录 - 截图时间线 */}
          <TabPanel p={0}>
            {allScreenshots.length === 0 ? (
              <Card bg="gray.800">
                <CardBody textAlign="center" py={10}>
                  <Text color="gray.500">暂无交流记录</Text>
                </CardBody>
              </Card>
            ) : (
              <VStack spacing={4} align="stretch">
                {allScreenshots.map(ss => (
                  <Card key={ss.id} bg="gray.800" cursor="pointer" onClick={() => setPreviewImage(`${import.meta.env.VITE_API_URL || 'http://localhost:3005'}${ss.imageUrl}`)} _hover={{ bg: 'gray.700' }} transition="all 0.2s">
                    <CardBody p={4}>
                      <Flex gap={4}>
                        <Image
                          src={`${import.meta.env.VITE_API_URL || 'http://localhost:3005'}${ss.imageUrl}`}
                          alt="聊天截图"
                          w="120px"
                          h="90px"
                          objectFit="cover"
                          borderRadius="md"
                          fallbackSrc="https://via.placeholder.com/120x90?text=..."
                        />
                        <Box flex={1}>
                          <HStack mb={2}>
                            <Text color="white" fontWeight="bold">{ss.girl?.name || '未知女生'}</Text>
                            <Badge colorScheme={STAGE_COLORS[ss.girl?.stage] || 'gray'} fontSize="xs">
                              {ss.girl?.stage || '未知'}
                            </Badge>
                          </HStack>
                          <Text color="gray.400" fontSize="sm" noOfLines={2}>
                            {ss.notes || '无备注'}
                          </Text>
                          <Text color="gray.500" fontSize="xs" mt={1}>
                            {new Date(ss.createdAt).toLocaleString()}
                          </Text>
                        </Box>
                      </Flex>
                    </CardBody>
                  </Card>
                ))}
              </VStack>
            )}
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* 女生详情弹窗 */}
      <Modal isOpen={isOpen} onClose={onClose} size="4xl">
        <ModalOverlay />
        <ModalContent bg="gray.800" maxH="85vh" overflowY="auto">
          <ModalHeader color="white" pb={2} position="sticky" top={0} bg="gray.800" zIndex={1}>
            <HStack justify="space-between">
              <HStack>
                <Text>{selectedGirl?.name}</Text>
                <Badge colorScheme={STAGE_COLORS[selectedGirl?.stage] || 'gray'}>
                  {selectedGirl?.stage || '未知'}
                </Badge>
              </HStack>
              <HStack spacing={2}>
                <Icon as={HeartIcon} color="red.400" />
                <Text color="teal.400" fontSize="sm">亲密度 x{selectedGirl?.intimacyLevel || 1}</Text>
              </HStack>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          {detailLoading ? (
            <ModalBody pb={6}>
              <Center py={10}>
                <Spinner color="teal.400" />
              </Center>
            </ModalBody>
          ) : (
            <GirlDetailModal
              girl={girlDetail || selectedGirl}
              screenshots={girlScreenshots}
              onPreviewUrl={(url) => setPreviewImage(url)}
            />
          )}
        </ModalContent>
      </Modal>

      {/* 添加女生弹窗 */}
      <Modal isOpen={isAddOpen} onClose={onAddClose} size="md">
        <ModalOverlay />
        <ModalContent bg="gray.800">
          <ModalHeader color="white">添加女生</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <VStack spacing={4} align="stretch">
              <FormControl isRequired>
                <FormLabel color="gray.400" fontSize="sm">昵称</FormLabel>
                <Input
                  value={addForm.name}
                  onChange={e => setAddForm({...addForm, name: e.target.value})}
                  placeholder="输入女生昵称"
                  bg="gray.700"
                  color="white"
                  _placeholder={{ color: 'gray.400' }}
                  onKeyPress={e => { if (e.key === 'Enter') handleAddGirl(); }}
                />
              </FormControl>
              <HStack spacing={4}>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="sm">年龄</FormLabel>
                  <NumberInput
                    value={addForm.age}
                    onChange={(_, v) => setAddForm({...addForm, age: v})}
                    bg="gray.700"
                    min={18}
                    max={60}
                  >
                    <NumberInputField color="white" />
                    <NumberInputStepper>
                      <NumberIncrementStepper color="gray.400" />
                      <NumberDecrementStepper color="gray.400" />
                    </NumberInputStepper>
                  </NumberInput>
                </FormControl>
                <FormControl>
                  <FormLabel color="gray.400" fontSize="sm">职业</FormLabel>
                  <Select
                    value={addForm.occupation}
                    onChange={e => setAddForm({...addForm, occupation: e.target.value})}
                    bg="gray.700"
                    color="white"
                    placeholder="选择"
                  >
                    <option value="">选择</option>
                    {['学生', '上班族', '自由职业', '企业主', '公务员', '医生', '律师', '教师', '销售', '设计师', '程序员', '其他'].map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </Select>
                </FormControl>
              </HStack>
              <Button colorScheme="teal" onClick={handleAddGirl} isLoading={adding} w="100%">
                添加
              </Button>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* 图片预览 */}
      <Modal isOpen={!!previewImage} onClose={() => setPreviewImage(null)} size="4xl">
        <ModalOverlay bg="blackAlpha.800" />
        <ModalContent bg="transparent" boxShadow="none">
          <ModalCloseButton color="white" zIndex={10} />
          <ModalBody p={0} display="flex" alignItems="center" justifyContent="center">
            {previewImage && (
              <Image src={previewImage} alt="预览" maxH="85vh" objectFit="contain" borderRadius="md" />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}
