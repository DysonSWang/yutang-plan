import { useEffect, useState, useRef } from 'react';
import {
  Box, Heading, Card, CardBody, Table, Thead, Tbody, Tr, Th, Td, Button, Badge, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalBody, ModalCloseButton, useDisclosure, SimpleGrid, FormControl, FormLabel, Input, Select,
  Textarea, NumberInput, NumberInputField, VStack, HStack, Image, Text, Divider, Flex, useToast, Switch,
  Accordion, AccordionItem, AccordionButton, AccordionPanel, AccordionIcon, Tabs, TabList, TabPanels, Tab, TabPanel, Icon
} from '@chakra-ui/react';
import { girls, clients, chatScreenshots } from '../../utils/api';
import { HeartIcon, FireIcon, SnowIcon, SparklesIcon } from '../../components/Icons';

const STAGES = ['陌生', '搭讪', '聊天', '暧昧', '约会', '长期'];
const STATUS_OPTIONS = ['available', 'chatting', 'dating', 'locked', 'long_term'];
const PLATFORMS = ['微信', '陌陌', '探探', 'Soul', '积木', '她说', '其他'];
const KINK_IDENTITIES = ['S', 'M', 'Switch', '观望', '探索者'];
const KINK_EXPERIENCES = ['新手', '有经验', '资深'];
const ATTACHMENT_STYLES = ['焦虑', '回避', '安全'];
const FAMILY_BACKGROUNDS = ['农村', '城市', '经商', '公务员', '其他'];
const FAMILY_ATMOSPHERES = ['和睦', '离异', '单亲', '其他'];
const FAMILY_BURDENS = ['无负担', '有退休金', '普通负担', '较重负担'];
const SOCIAL_ACTIVITY_LEVELS = ['高', '中', '低'];
const FINANCIAL_HABITS = ['月光', '务实', '超前'];
const WORK_SCHEDULES = ['朝九晚五', '自由职业', '经常加班', '轮班制', '其他'];
const STYLE_TAGS = ['文艺', '运动', '精致', '朴素', '性感', '可爱', '御姐', '萝莉'];
const RELATIONSHIP_ATTITUDES = ['认真', '随便', '不清楚'];
const EMOTIONAL_WOUNDS_OPTIONS = ['被渣', '家暴', '丧偶', '其他', '无'];
const KINK_BOUNDARIES_OPTIONS = ['硬边界', '软边界', '雷区'];
const EDUCATIONS = ['小学', '初中', '中专', '高中', '大专', '本科', '硕士', '博士'];
const KINK_INTERESTS_OPTIONS = ['角色扮演', '束缚', '主人', '奴隶', '其他'];
const RESPONSE_PATTERNS = ['秒回', '正常', '慢', '已读不回'];
const VALUES_OPTIONS = ['事业型', '家庭型', '自由型', '享受型'];
const COMMUNICATION_STYLE_OPTIONS = ['直接', '含蓄', '话多', '话少', '幽默'];
const EMOTIONAL_TRIGGERS_OPTIONS = ['被忽视', '被控制', '被批评', '被比较', '不安全感'];
const TALKING_TOPICS_OPTIONS = ['美食', '旅行', '电影', '音乐', '健身', '工作', '八卦', '星座'];
const PERSONALITY_TYPES = ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP', '其他'];
const OCCUPATIONS = ['学生', '上班族', '自由职业', '企业主', '公务员', '医生', '律师', '教师', '销售', '设计师', '程序员', '其他'];
const INTERESTS = ['健身', '跑步', '游泳', '篮球', '足球', '网球', '羽毛球', '乒乓球', '瑜伽', '舞蹈', '唱歌', '乐器', '绘画', '摄影', '阅读', '写作', '旅行', '美食', '电影', '音乐', '游戏', '宠物', '其他'];
const DIET_PREFERENCES = ['不挑食', '素食', '清淡', '重口味', '火锅', '烧烤', '日料', '西餐', '甜品', '咖啡', '茶'];
const MAJOR_CATEGORIES = ['计算机/互联网', '金融/经济', '法律', '医学', '教育', '工程', '艺术/设计', '传媒', '语言', '管理', '其他'];
const CITIES = ['北京', '上海', '广州', '深圳', '杭州', '南京', '苏州', '成都', '重庆', '武汉', '西安', '天津', '长沙', '郑州', '东莞', '佛山', '青岛', '沈阳', '大连', '厦门', '宁波', '其他'];

export default function AdminGirls() {
  const [girlsList, setGirlsList] = useState([]);
  const [clientList, setClientList] = useState([]);
  const [selectedGirl, setSelectedGirl] = useState(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isDetailOpen, onOpen: onDetailOpen, onClose: onDetailClose } = useDisclosure();
  const { isOpen: isScreenshotOpen, onOpen: onScreenshotOpen, onClose: onScreenshotClose } = useDisclosure();
  const [formData, setFormData] = useState(getInitialFormData());

  // 截图相关状态
  const [screenshots, setScreenshots] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [screenshotNotes, setScreenshotNotes] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const fileInputRef = useRef();
  const toast = useToast();

  useEffect(() => {
    loadGirls();
    loadClients();
  }, []);

  function getInitialFormData() {
    return {
      // 基础信息
      clientId: '', name: '', age: '', occupation: '', education: '', major: '',
      hometown: '', residence: '', workplace: '',
      // 外貌特征
      appearance: '', photos: '', styleTags: '',
      // 家庭背景
      familyBackground: '', familyAtmosphere: '', familyBurden: '', familyComments: '',
      // 生活状态
      workSchedule: '', socialActivity: '', financialHabits: '',
      // 兴趣爱好
      interests: '', dietPreferences: '', hobbiesDetail: '',
      // 情感状态
      relationshipAttitude: '', pastRelationshipSummary: '', emotionalWounds: '',
      attachmentStyle: '', dealbreakers: '',
      // 字母圈属性
      isKinkOriented: false, kinkIdentity: '', kinkBoundaries: '', kinkInterests: '',
      kinkExperience: '', kinkNotes: '',
      // 内在画像
      personality: '', values_: '', communicationStyle: '', emotionalTriggers: '',
      talkingTopics: '', thingsToAvoid: '',
      // 关系状态
      stage: '陌生', status: 'available', intimacyLevel: 1, tensionScore: 5.0,
      lastContact: '', responsePattern: '',
      // 上下文记忆（JSON字符串）
      signals: '', pendingActions: '', observations: '', conversationSummary: '',
      // AI战略分析
      bestApproach: '', recommendedTopics: '', upgradeConditions: '', estimatedTimeline: '',
      riskFactors: '', strategicNotes: '',
      // AI画像
      empathy: '', selfAwareness: '', communication: '', relationship: '', conflictRes: '',
      chatPartnerId: '',
      // 匹配相关
      matchScore: '',
      // 元数据
      sourcePlatform: '', homepageUrl: '', photos: '', videos: '', notes: ''
    };
  }

  const loadGirls = async () => {
    try {
      const res = await girls.list();
      if (res.success) {
        setGirlsList(res.girls);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadClients = async () => {
    try {
      const res = await clients.list();
      if (res.success) {
        setClientList(res.clients);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadScreenshots = async (girlId) => {
    try {
      const res = await chatScreenshots.byGirl(girlId);
      if (res.success) {
        setScreenshots(res.screenshots);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const openAddModal = () => {
    setSelectedGirl(null);
    setFormData(getInitialFormData());
    onOpen();
  };

  const openDetailModal = async (girl) => {
    setSelectedGirl(girl);
    await loadScreenshots(girl.id);
    onDetailOpen();
  };

  const openEditModal = (girl) => {
    setSelectedGirl(girl);
    setFormData({
      clientId: girl.clientId || '',
      name: girl.name || '',
      age: girl.age || '',
      occupation: girl.occupation || '',
      education: girl.education || '',
      major: girl.major || '',
      hometown: girl.hometown || '',
      residence: girl.residence || '',
      workplace: girl.workplace || '',
      appearance: girl.appearance || '',
      photos: girl.photos || '',
      styleTags: girl.styleTags || '',
      familyBackground: girl.familyBackground || '',
      familyAtmosphere: girl.familyAtmosphere || '',
      familyBurden: girl.familyBurden || '',
      familyComments: girl.familyComments || '',
      workSchedule: girl.workSchedule || '',
      socialActivity: girl.socialActivity || '',
      financialHabits: girl.financialHabits || '',
      interests: girl.interests || '',
      dietPreferences: girl.dietPreferences || '',
      hobbiesDetail: girl.hobbiesDetail || '',
      relationshipAttitude: girl.relationshipAttitude || '',
      pastRelationshipSummary: girl.pastRelationshipSummary || '',
      emotionalWounds: girl.emotionalWounds || '',
      attachmentStyle: girl.attachmentStyle || '',
      dealbreakers: girl.dealbreakers || '',
      isKinkOriented: girl.isKinkOriented || false,
      kinkIdentity: girl.kinkIdentity || '',
      kinkBoundaries: girl.kinkBoundaries || '',
      kinkInterests: girl.kinkInterests || '',
      kinkExperience: girl.kinkExperience || '',
      kinkNotes: girl.kinkNotes || '',
      personality: girl.personality || '',
      values_: girl.values_ || '',
      communicationStyle: girl.communicationStyle || '',
      emotionalTriggers: girl.emotionalTriggers || '',
      talkingTopics: girl.talkingTopics || '',
      thingsToAvoid: girl.thingsToAvoid || '',
      stage: girl.stage || '陌生',
      status: girl.status || 'available',
      intimacyLevel: girl.intimacyLevel || 1,
      tensionScore: girl.tensionScore || 5.0,
      lastContact: girl.lastContact || '',
      responsePattern: girl.responsePattern || '',
      signals: girl.signals || '',
      pendingActions: girl.pendingActions || '',
      observations: girl.observations || '',
      conversationSummary: girl.conversationSummary || '',
      bestApproach: girl.bestApproach || '',
      recommendedTopics: girl.recommendedTopics || '',
      upgradeConditions: girl.upgradeConditions || '',
      estimatedTimeline: girl.estimatedTimeline || '',
      riskFactors: girl.riskFactors || '',
      strategicNotes: girl.strategicNotes || '',
      empathy: girl.empathy || '',
      selfAwareness: girl.selfAwareness || '',
      communication: girl.communication || '',
      relationship: girl.relationship || '',
      conflictRes: girl.conflictRes || '',
      chatPartnerId: girl.chatPartnerId || '',
      matchScore: girl.matchScore || '',
      sourcePlatform: girl.sourcePlatform || '',
      homepageUrl: girl.homepageUrl || '',
      photos: parseJSONField(girl.photos).join(', '),
      videos: parseJSONField(girl.videos).join(', '),
      notes: girl.notes || ''
    });
    onOpen();
  };

  const openScreenshotModal = async (girl) => {
    setSelectedGirl(girl);
    await loadScreenshots(girl.id);
    setSelectedFile(null);
    setScreenshotNotes('');
    onScreenshotOpen();
  };

  const parseJSONField = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val); } catch { return []; }
  };

  const handleSubmit = async () => {
    try {
      const data = { ...formData };
      if (data.age) data.age = parseInt(data.age);
      else data.age = undefined;
      if (data.intimacyLevel) data.intimacyLevel = parseInt(data.intimacyLevel);
      if (data.tensionScore) data.tensionScore = parseFloat(data.tensionScore);
      // JSON字段处理
      if (data.signals && !data.signals.startsWith('[')) data.signals = '';
      if (data.pendingActions && !data.pendingActions.startsWith('[')) data.pendingActions = '';
      if (data.observations && !data.observations.startsWith('[')) data.observations = '';
      // photos/videos: comma-separated to JSON array
      if (data.photos) {
        data.photos = JSON.stringify(data.photos.split(',').map(s => s.trim()).filter(Boolean));
      }
      if (data.videos) {
        data.videos = JSON.stringify(data.videos.split(',').map(s => s.trim()).filter(Boolean));
      }
      // 数字字段
      ['empathy', 'selfAwareness', 'communication', 'relationship', 'conflictRes', 'matchScore'].forEach(k => {
        if (data[k] === '') data[k] = undefined;
      });
      if (selectedGirl) {
        await girls.update(selectedGirl.id, data);
      } else {
        await girls.create(data);
      }
      loadGirls();
      onClose();
      toast({ title: '保存成功', status: 'success', duration: 2000 });
    } catch (e) {
      console.error(e);
      toast({ title: '保存失败', status: 'error', duration: 2000 });
    }
  };

  const deleteGirl = async (id) => {
    if (!confirm('确定删除?')) return;
    try {
      await girls.delete(id);
      loadGirls();
    } catch (e) {
      console.error(e);
    }
  };

  // 截图上传
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) setSelectedFile(file);
  };

  const handleUploadScreenshot = async () => {
    if (!selectedFile || !selectedGirl) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', selectedFile);
      fd.append('girlId', selectedGirl.id);
      fd.append('clientId', selectedGirl.clientId);
      fd.append('notes', screenshotNotes);
      const res = await chatScreenshots.upload(fd);
      if (res.success) {
        toast({ title: '上传成功', status: 'success', duration: 2000 });
        await loadScreenshots(selectedGirl.id);
        setSelectedFile(null);
        setScreenshotNotes('');
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        toast({ title: res.error || '上传失败', status: 'error', duration: 2000 });
      }
    } catch (e) {
      console.error(e);
      toast({ title: '上传失败', status: 'error', duration: 2000 });
    } finally {
      setUploading(false);
    }
  };

  const handleAiNotes = async (screenshotId) => {
    setAiGenerating(true);
    try {
      const res = await chatScreenshots.aiNotes(screenshotId);
      if (res.success) {
        toast({ title: 'AI备注生成成功', status: 'success', duration: 2000 });
        await loadScreenshots(selectedGirl.id);
      }
    } catch (e) {
      console.error(e);
      toast({ title: 'AI生成失败', status: 'error', duration: 2000 });
    } finally {
      setAiGenerating(false);
    }
  };

  const handleUpdateNotes = async (screenshotId, newNotes) => {
    try {
      await chatScreenshots.updateNotes(screenshotId, newNotes);
      await loadScreenshots(selectedGirl.id);
      toast({ title: '备注已更新', status: 'success', duration: 1500 });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteScreenshot = async (screenshotId) => {
    if (!confirm('确定删除该截图?')) return;
    try {
      await chatScreenshots.delete(screenshotId);
      await loadScreenshots(selectedGirl.id);
      toast({ title: '已删除', status: 'success', duration: 1500 });
    } catch (e) {
      console.error(e);
    }
  };

  const renderField = (label, value, parseJSON = false) => {
    let displayValue = value;
    if (parseJSON && value) {
      try {
        const arr = JSON.parse(value);
        displayValue = Array.isArray(arr) ? arr.join('、') : value;
      } catch { displayValue = value; }
    }
    if (!displayValue) return <Text color="gray.500">-</Text>;
    return <Text color="white">{displayValue}</Text>;
  };

  const renderFormField = (field, label, placeholder = '', isTextarea = false) => (
    <FormControl>
      <FormLabel color="gray.400" fontSize="sm">{label}</FormLabel>
      {isTextarea ? (
        <Textarea value={formData[field]} onChange={e => setFormData({...formData, [field]: e.target.value})} placeholder={placeholder} bg="gray.700" rows={2} />
      ) : (
        <Input value={formData[field]} onChange={e => setFormData({...formData, [field]: e.target.value})} placeholder={placeholder} bg="gray.700" />
      )}
    </FormControl>
  );

  const getTensionColor = (score) => {
    if (score >= 7) return 'red.400';
    if (score >= 5) return 'orange.400';
    return 'gray.400';
  };

  const getTensionIcon = (score) => {
    if (score >= 7) return <Icon as={FireIcon} color="red.400" />;
    if (score >= 5) return <Icon as={FireIcon} color="orange.400" />;
    return <Icon as={SnowIcon} color="gray.400" />;
  };

  return (
    <Box>
      <Heading color="white" mb={6}>女生资源</Heading>

      <Card bg="gray.800" mb={4}>
        <CardBody>
          <Button colorScheme="teal" onClick={openAddModal} transition="all 0.15s ease" _hover={{ transform: 'translateY(-1px)' }}>+ 添加女生</Button>
        </CardBody>
      </Card>

      <Card bg="gray.800">
        <CardBody>
          <Table variant="simple" color="gray.300" size="sm">
            <Thead>
              <Tr>
                <Th color="gray.400">姓名</Th>
                <Th color="gray.400">年龄</Th>
                <Th color="gray.400">职业</Th>
                <Th color="gray.400">阶段</Th>
                <Th color="gray.400">热度</Th>
                <Th color="gray.400">亲密度</Th>
                <Th color="gray.400">Kink</Th>
                <Th color="gray.400">操作</Th>
              </Tr>
            </Thead>
            <Tbody>
              {girlsList.map(girl => (
                <Tr key={girl.id} _hover={{ bg: 'gray.750' }} transition="background 0.15s ease" cursor="pointer" onClick={() => openDetailModal(girl)}>
                  <Td fontWeight="bold">{girl.name}</Td>
                  <Td>{girl.age || '-'}</Td>
                  <Td>{girl.occupation || '-'}</Td>
                  <Td><Badge colorScheme="teal">{girl.stage || '陌生'}</Badge></Td>
                  <Td>
                    <Text color={getTensionColor(girl.tensionScore)} fontSize="sm">
                      {girl.tensionScore?.toFixed(1) || '5.0'} {getTensionIcon(girl.tensionScore)}
                    </Text>
                  </Td>
                  <Td>
                    <HStack>
                      {Array.from({ length: girl.intimacyLevel || 1 }).map((_, i) => (
                        <Icon key={i} as={HeartIcon} color="red.400" boxSize={4} />
                      ))}
                    </HStack>
                  </Td>
                  <Td>
                    {girl.isKinkOriented ? <Badge colorScheme="purple">K</Badge> : <Text color="gray.600">-</Text>}
                  </Td>
                  <Td>
                    <HStack spacing={2}>
                      <Button size="xs" colorScheme="teal" variant="ghost" onClick={() => openDetailModal(girl)}>详情</Button>
                      <Button size="xs" colorScheme="blue" variant="ghost" onClick={() => openEditModal(girl)}>编辑</Button>
                      <Button size="xs" colorScheme="orange" variant="ghost" onClick={() => openScreenshotModal(girl)}>截图</Button>
                      <Button size="xs" colorScheme="red" variant="ghost" onClick={() => deleteGirl(girl.id)}>删除</Button>
                    </HStack>
                  </Td>
                </Tr>
              ))}
              {girlsList.length === 0 && (
                <Tr><Td colSpan={8} textAlign="center" color="gray.500">暂无女生资源</Td></Tr>
              )}
            </Tbody>
          </Table>
        </CardBody>
      </Card>

      {/* 添加/编辑女生弹窗 */}
      <Modal isOpen={isOpen} onClose={onClose} size="4xl">
        <ModalOverlay />
        <ModalContent bg="gray.800">
          <ModalHeader color="white">{selectedGirl ? '编辑女生' : '添加女生'}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <Tabs colorScheme="teal" size="sm">
              <TabList mb={4} overflowX="auto" flexWrap="nowrap">
                <Tab>基础信息</Tab>
                <Tab>外貌家庭</Tab>
                <Tab>生活爱好</Tab>
                <Tab>情感状态</Tab>
                <Tab>字母圈</Tab>
                <Tab>AI分析</Tab>
                <Tab>关系状态</Tab>
              </TabList>
              <TabPanels>
                {/* 基础信息 */}
                <TabPanel px={0}>
                  <VStack spacing={4} align="stretch">
                    <FormControl isRequired>
                      <FormLabel color="gray.400">所属客户</FormLabel>
                      <Select placeholder="选择客户" value={formData.clientId} onChange={e => setFormData({...formData, clientId: e.target.value})} bg="gray.700" color="white">
                        {clientList.map(c => (
                          <option key={c.id} value={c.id}>{c.nickname || c.username}</option>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl isRequired>
                      <FormLabel color="gray.400">姓名</FormLabel>
                      <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} bg="gray.700" />
                    </FormControl>
                    <SimpleGrid columns={4} spacing={4}>
                      <FormControl>
                        <FormLabel color="gray.400">年龄</FormLabel>
                        <NumberInput value={formData.age} onChange={(_, v) => setFormData({...formData, age: v})} bg="gray.700" min={18} max={60}>
                          <NumberInputField />
                        </NumberInput>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400">职业</FormLabel>
                        <Select value={formData.occupation} onChange={e => setFormData({...formData, occupation: e.target.value})} bg="gray.700" color="white">
                          <option value="">选择</option>
                          {OCCUPATIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400">学历</FormLabel>
                        <Select value={formData.education} onChange={e => setFormData({...formData, education: e.target.value})} bg="gray.700" color="white">
                          <option value="">选择</option>
                          {EDUCATIONS.map(e => <option key={e} value={e}>{e}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400">专业</FormLabel>
                        <Input value={formData.major} onChange={e => setFormData({...formData, major: e.target.value})} bg="gray.700" />
                      </FormControl>
                    </SimpleGrid>
                    <SimpleGrid columns={3} spacing={4}>
                      <FormControl>
                        <FormLabel color="gray.400">籍贯</FormLabel>
                        <Select value={formData.hometown} onChange={e => setFormData({...formData, hometown: e.target.value})} bg="gray.700" color="white">
                          <option value="">选择</option>
                          {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400">现居城市</FormLabel>
                        <Select value={formData.residence} onChange={e => setFormData({...formData, residence: e.target.value})} bg="gray.700" color="white">
                          <option value="">选择</option>
                          {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400">工作地点</FormLabel>
                        <Input value={formData.workplace} onChange={e => setFormData({...formData, workplace: e.target.value})} bg="gray.700" />
                      </FormControl>
                    </SimpleGrid>
                    <SimpleGrid columns={2} spacing={4}>
                      <FormControl>
                        <FormLabel color="gray.400">平台来源</FormLabel>
                        <Select value={formData.sourcePlatform} onChange={e => setFormData({...formData, sourcePlatform: e.target.value})} bg="gray.700" color="white">
                          <option value="">选择平台</option>
                          {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400">主页链接</FormLabel>
                        <Input value={formData.homepageUrl} onChange={e => setFormData({...formData, homepageUrl: e.target.value})} bg="gray.700" color="white" placeholder="https://..." />
                      </FormControl>
                    </SimpleGrid>
                  </VStack>
                </TabPanel>

                {/* 外貌特征 + 家庭背景 */}
                <TabPanel px={0}>
                  <VStack spacing={4} align="stretch">
                    <Text color="white" fontWeight="bold">外貌特征</Text>
                    <FormControl>
                      <FormLabel color="gray.400">外貌描述</FormLabel>
                      <Textarea value={formData.appearance} onChange={e => setFormData({...formData, appearance: e.target.value})} placeholder="身高/体型/穿着风格..." bg="gray.700" rows={2} />
                    </FormControl>
                    <FormControl>
                      <FormLabel color="gray.400">风格标签</FormLabel>
                      <Select value={formData.styleTags} onChange={e => setFormData({...formData, styleTags: e.target.value})} bg="gray.700" color="white">
                        <option value="">选择标签</option>
                        {STYLE_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                      </Select>
                    </FormControl>
                    <SimpleGrid columns={2} spacing={4}>
                      <FormControl>
                        <FormLabel color="gray.400">照片链接（多个用逗号分隔）</FormLabel>
                        <Input value={formData.photos} onChange={e => setFormData({...formData, photos: e.target.value})} bg="gray.700" color="white" placeholder="https://..." />
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400">视频链接（多个用逗号分隔）</FormLabel>
                        <Input value={formData.videos} onChange={e => setFormData({...formData, videos: e.target.value})} bg="gray.700" color="white" placeholder="https://..." />
                      </FormControl>
                    </SimpleGrid>
                    <Text color="white" fontWeight="bold" mt={2}>家庭背景</Text>
                    <SimpleGrid columns={2} spacing={4}>
                      <FormControl>
                        <FormLabel color="gray.400">家庭背景</FormLabel>
                        <Select value={formData.familyBackground} onChange={e => setFormData({...formData, familyBackground: e.target.value})} bg="gray.700" color="white">
                          <option value="">选择</option>
                          {FAMILY_BACKGROUNDS.map(f => <option key={f} value={f}>{f}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400">家庭氛围</FormLabel>
                        <Select value={formData.familyAtmosphere} onChange={e => setFormData({...formData, familyAtmosphere: e.target.value})} bg="gray.700" color="white">
                          <option value="">选择</option>
                          {FAMILY_ATMOSPHERES.map(f => <option key={f} value={f}>{f}</option>)}
                        </Select>
                      </FormControl>
                    </SimpleGrid>
                    <SimpleGrid columns={2} spacing={4}>
                      <FormControl>
                        <FormLabel color="gray.400">养老负担</FormLabel>
                        <Select value={formData.familyBurden} onChange={e => setFormData({...formData, familyBurden: e.target.value})} bg="gray.700" color="white">
                          <option value="">选择</option>
                          {FAMILY_BURDENS.map(f => <option key={f} value={f}>{f}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400">家庭备注</FormLabel>
                        <Input value={formData.familyComments} onChange={e => setFormData({...formData, familyComments: e.target.value})} bg="gray.700" />
                      </FormControl>
                    </SimpleGrid>
                  </VStack>
                </TabPanel>

                {/* 生活状态 + 兴趣爱好 */}
                <TabPanel px={0}>
                  <VStack spacing={4} align="stretch">
                    <Text color="white" fontWeight="bold">生活状态</Text>
                    <SimpleGrid columns={3} spacing={4}>
                      <FormControl>
                        <FormLabel color="gray.400">工作作息</FormLabel>
                        <Select value={formData.workSchedule} onChange={e => setFormData({...formData, workSchedule: e.target.value})} bg="gray.700" color="white">
                          <option value="">选择</option>
                          {WORK_SCHEDULES.map(w => <option key={w} value={w}>{w}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400">社交活跃度</FormLabel>
                        <Select value={formData.socialActivity} onChange={e => setFormData({...formData, socialActivity: e.target.value})} bg="gray.700" color="white">
                          <option value="">选择</option>
                          {SOCIAL_ACTIVITY_LEVELS.map(s => <option key={s} value={s}>{s}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400">消费习惯</FormLabel>
                        <Select value={formData.financialHabits} onChange={e => setFormData({...formData, financialHabits: e.target.value})} bg="gray.700" color="white">
                          <option value="">选择</option>
                          {FINANCIAL_HABITS.map(f => <option key={f} value={f}>{f}</option>)}
                        </Select>
                      </FormControl>
                    </SimpleGrid>
                    <Text color="white" fontWeight="bold" mt={2}>兴趣爱好</Text>
                    <FormControl>
                      <FormLabel color="gray.400">兴趣爱好</FormLabel>
                      <Select value={formData.interests} onChange={e => setFormData({...formData, interests: e.target.value})} bg="gray.700" color="white">
                          <option value="">选择</option>
                          {INTERESTS.map(i => <option key={i} value={i}>{i}</option>)}
                        </Select>
                    </FormControl>
                    <SimpleGrid columns={2} spacing={4}>
                      <FormControl>
                        <FormLabel color="gray.400">饮食偏好</FormLabel>
                        <Select value={formData.dietPreferences} onChange={e => setFormData({...formData, dietPreferences: e.target.value})} bg="gray.700" color="white">
                          <option value="">选择</option>
                          {DIET_PREFERENCES.map(d => <option key={d} value={d}>{d}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400">兴趣详情</FormLabel>
                        <Input value={formData.hobbiesDetail} onChange={e => setFormData({...formData, hobbiesDetail: e.target.value})} bg="gray.700" />
                      </FormControl>
                    </SimpleGrid>
                  </VStack>
                </TabPanel>

                {/* 情感状态 */}
                <TabPanel px={0}>
                  <VStack spacing={4} align="stretch">
                    <SimpleGrid columns={2} spacing={4}>
                      <FormControl>
                        <FormLabel color="gray.400">婚恋态度</FormLabel>
                        <Select value={formData.relationshipAttitude} onChange={e => setFormData({...formData, relationshipAttitude: e.target.value})} bg="gray.700" color="white">
                          <option value="">选择</option>
                          {RELATIONSHIP_ATTITUDES.map(r => <option key={r} value={r}>{r}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400">依恋类型</FormLabel>
                        <Select value={formData.attachmentStyle} onChange={e => setFormData({...formData, attachmentStyle: e.target.value})} bg="gray.700" color="white">
                          <option value="">选择</option>
                          {ATTACHMENT_STYLES.map(a => <option key={a} value={a}>{a}</option>)}
                        </Select>
                      </FormControl>
                    </SimpleGrid>
                    <FormControl>
                      <FormLabel color="gray.400">情史摘要</FormLabel>
                      <Textarea value={formData.pastRelationshipSummary} onChange={e => setFormData({...formData, pastRelationshipSummary: e.target.value})} bg="gray.700" rows={2} />
                    </FormControl>
                    <FormControl>
                      <FormLabel color="gray.400">情伤记录</FormLabel>
                      <Select value={formData.emotionalWounds} onChange={e => setFormData({...formData, emotionalWounds: e.target.value})} bg="gray.700" color="white">
                          <option value="">选择</option>
                          {EMOTIONAL_WOUNDS_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
                        </Select>
                    </FormControl>
                    <FormControl>
                      <FormLabel color="gray.400">绝对雷区</FormLabel>
                      <Textarea value={formData.dealbreakers} onChange={e => setFormData({...formData, dealbreakers: e.target.value})} bg="gray.700" rows={2} />
                    </FormControl>
                  </VStack>
                </TabPanel>

                {/* 字母圈属性 */}
                <TabPanel px={0}>
                  <VStack spacing={4} align="stretch">
                    <FormControl display="flex" alignItems="center">
                      <FormLabel color="gray.400" mb={0}>接触字母圈</FormLabel>
                      <Switch isChecked={formData.isKinkOriented} onChange={e => setFormData({...formData, isKinkOriented: e.target.checked})} colorScheme="purple" />
                    </FormControl>
                    {formData.isKinkOriented && (
                      <>
                        <SimpleGrid columns={3} spacing={4}>
                          <FormControl>
                            <FormLabel color="gray.400">身份</FormLabel>
                            <Select value={formData.kinkIdentity} onChange={e => setFormData({...formData, kinkIdentity: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {KINK_IDENTITIES.map(k => <option key={k} value={k}>{k}</option>)}
                            </Select>
                          </FormControl>
                          <FormControl>
                            <FormLabel color="gray.400">经验</FormLabel>
                            <Select value={formData.kinkExperience} onChange={e => setFormData({...formData, kinkExperience: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {KINK_EXPERIENCES.map(k => <option key={k} value={k}>{k}</option>)}
                            </Select>
                          </FormControl>
                          <FormControl>
                            <FormLabel color="gray.400">边界</FormLabel>
                            <Select value={formData.kinkBoundaries} onChange={e => setFormData({...formData, kinkBoundaries: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {KINK_BOUNDARIES_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
                            </Select>
                          </FormControl>
                        </SimpleGrid>
                        <FormControl>
                          <FormLabel color="gray.400">兴趣标签</FormLabel>
                          <Select value={formData.kinkInterests} onChange={e => setFormData({...formData, kinkInterests: e.target.value})} bg="gray.700" color="white">
                            <option value="">选择</option>
                            {KINK_INTERESTS_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
                          </Select>
                        </FormControl>
                        <FormControl>
                          <FormLabel color="gray.400">特殊备注</FormLabel>
                          <Textarea value={formData.kinkNotes} onChange={e => setFormData({...formData, kinkNotes: e.target.value})} placeholder="安全词/特殊需求..." bg="gray.700" rows={2} />
                        </FormControl>
                      </>
                    )}
                  </VStack>
                </TabPanel>

                {/* AI分析 */}
                <TabPanel px={0}>
                  <VStack spacing={4} align="stretch">
                    <Text color="white" fontWeight="bold">内在画像（AI提炼）</Text>
                    <SimpleGrid columns={3} spacing={4}>
                      <FormControl>
                        <FormLabel color="gray.400">性格/MBTI</FormLabel>
                        <Select value={formData.personality} onChange={e => setFormData({...formData, personality: e.target.value})} bg="gray.700" color="white">
                          <option value="">选择</option>
                          {PERSONALITY_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400">价值观</FormLabel>
                        <Select value={formData.values_} onChange={e => setFormData({...formData, values_: e.target.value})} bg="gray.700" color="white">
                          <option value="">选择</option>
                          {VALUES_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400">沟通风格</FormLabel>
                        <Select value={formData.communicationStyle} onChange={e => setFormData({...formData, communicationStyle: e.target.value})} bg="gray.700" color="white">
                          <option value="">选择</option>
                          {COMMUNICATION_STYLE_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                        </Select>
                      </FormControl>
                    </SimpleGrid>
                    <SimpleGrid columns={2} spacing={4}>
                      <FormControl>
                        <FormLabel color="gray.400">情绪触发点</FormLabel>
                        <Textarea value={formData.emotionalTriggers} onChange={e => setFormData({...formData, emotionalTriggers: e.target.value})} bg="gray.700" rows={2} />
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400">喜欢的话题</FormLabel>
                        <Textarea value={formData.talkingTopics} onChange={e => setFormData({...formData, talkingTopics: e.target.value})} bg="gray.700" rows={2} />
                      </FormControl>
                    </SimpleGrid>
                    <FormControl>
                      <FormLabel color="gray.400">禁忌话题</FormLabel>
                      <Textarea value={formData.thingsToAvoid} onChange={e => setFormData({...formData, thingsToAvoid: e.target.value})} bg="gray.700" rows={2} />
                    </FormControl>

                    <Text color="white" fontWeight="bold" mt={2}>AI战略分析</Text>
                    <SimpleGrid columns={2} spacing={4}>
                      <FormControl>
                        <FormLabel color="gray.400">最佳策略</FormLabel>
                        <Select value={formData.bestApproach} onChange={e => setFormData({...formData, bestApproach: e.target.value})} bg="gray.700" color="white">
                          <option value="">选择</option>
                          <option value="幽默">幽默</option>
                          <option value="真诚">真诚</option>
                          <option value="霸道">霸道</option>
                          <option value="温柔">温柔</option>
                          <option value="调理型">调理型</option>
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400">推荐话题</FormLabel>
                        <Select value={formData.recommendedTopics} onChange={e => setFormData({...formData, recommendedTopics: e.target.value})} bg="gray.700" color="white">
                          <option value="">选择</option>
                          {TALKING_TOPICS_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </Select>
                      </FormControl>
                    </SimpleGrid>
                    <SimpleGrid columns={2} spacing={4}>
                      <FormControl>
                        <FormLabel color="gray.400">升级条件</FormLabel>
                        <Textarea value={formData.upgradeConditions} onChange={e => setFormData({...formData, upgradeConditions: e.target.value})} bg="gray.700" rows={2} />
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400">预计时间线</FormLabel>
                        <Select value={formData.estimatedTimeline} onChange={e => setFormData({...formData, estimatedTimeline: e.target.value})} bg="gray.700" color="white">
                          <option value="">选择</option>
                          <option value="1周内">1周内</option>
                          <option value="2周内">2周内</option>
                          <option value="1个月内">1个月内</option>
                          <option value="2-3个月">2-3个月</option>
                          <option value="半年内">半年内</option>
                          <option value="半年以上">半年以上</option>
                        </Select>
                      </FormControl>
                    </SimpleGrid>
                    <SimpleGrid columns={2} spacing={4}>
                      <FormControl>
                        <FormLabel color="gray.400">风险因素</FormLabel>
                        <Textarea value={formData.riskFactors} onChange={e => setFormData({...formData, riskFactors: e.target.value})} bg="gray.700" rows={2} />
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400">战略备注</FormLabel>
                        <Textarea value={formData.strategicNotes} onChange={e => setFormData({...formData, strategicNotes: e.target.value})} bg="gray.700" rows={2} />
                      </FormControl>
                    </SimpleGrid>

                    <Text color="white" fontWeight="bold" mt={2}>谙世画像（EQ维度）</Text>
                    <SimpleGrid columns={5} spacing={4}>
                      {[
                        { key: 'empathy', label: '同理心' },
                        { key: 'selfAwareness', label: '自我认知' },
                        { key: 'communication', label: '沟通能力' },
                        { key: 'relationship', label: '关系维护' },
                        { key: 'conflictRes', label: '冲突解决' }
                      ].map(item => (
                        <FormControl key={item.key}>
                          <FormLabel color="gray.400">{item.label}</FormLabel>
                          <NumberInput value={formData[item.key]} onChange={(_, v) => setFormData({...formData, [item.key]: v})} bg="gray.700" min={1} max={10}>
                            <NumberInputField />
                          </NumberInput>
                        </FormControl>
                      ))}
                    </SimpleGrid>
                  </VStack>
                </TabPanel>

                {/* 关系状态 + 上下文记忆 */}
                <TabPanel px={0}>
                  <VStack spacing={4} align="stretch">
                    <Text color="white" fontWeight="bold">关系状态</Text>
                    <SimpleGrid columns={4} spacing={4}>
                      <FormControl>
                        <FormLabel color="gray.400">阶段</FormLabel>
                        <Select value={formData.stage} onChange={e => setFormData({...formData, stage: e.target.value})} bg="gray.700" color="white">
                          {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400">状态</FormLabel>
                        <Select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} bg="gray.700" color="white">
                          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400">亲密度(1-5)</FormLabel>
                        <NumberInput value={formData.intimacyLevel} onChange={(_, v) => setFormData({...formData, intimacyLevel: v})} bg="gray.700" min={1} max={5}>
                          <NumberInputField />
                        </NumberInput>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400">热度(1-10)</FormLabel>
                        <NumberInput value={formData.tensionScore} onChange={(_, v) => setFormData({...formData, tensionScore: v})} bg="gray.700" min={1} max={10} step={0.1}>
                          <NumberInputField />
                        </NumberInput>
                      </FormControl>
                    </SimpleGrid>
                    <SimpleGrid columns={2} spacing={4}>
                      <FormControl>
                        <FormLabel color="gray.400">最后联系</FormLabel>
                        <Input type="datetime-local" value={formData.lastContact} onChange={e => setFormData({...formData, lastContact: e.target.value})} bg="gray.700" />
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400">回复规律</FormLabel>
                        <Select value={formData.responsePattern} onChange={e => setFormData({...formData, responsePattern: e.target.value})} bg="gray.700" color="white">
                          <option value="">选择</option>
                          {RESPONSE_PATTERNS.map(r => <option key={r} value={r}>{r}</option>)}
                        </Select>
                      </FormControl>
                    </SimpleGrid>

                    <Text color="white" fontWeight="bold" mt={2}>上下文记忆</Text>
                    <FormControl>
                      <FormLabel color="gray.400">关键信号(JSON)</FormLabel>
                      <Textarea value={formData.signals} onChange={e => setFormData({...formData, signals: e.target.value})} placeholder='[{"date":"2026-04-14","type":"positive","event":"主动发健身照片"}]' bg="gray.700" rows={3} />
                    </FormControl>
                    <FormControl>
                      <FormLabel color="gray.400">待推进事项(JSON)</FormLabel>
                      <Textarea value={formData.pendingActions} onChange={e => setFormData({...formData, pendingActions: e.target.value})} placeholder='["出差回来后约第二次见面"]' bg="gray.700" rows={2} />
                    </FormControl>
                    <FormControl>
                      <FormLabel color="gray.400">观察记录(JSON)</FormLabel>
                      <Textarea value={formData.observations} onChange={e => setFormData({...formData, observations: e.target.value})} bg="gray.700" rows={2} />
                    </FormControl>
                    <FormControl>
                      <FormLabel color="gray.400">对话摘要</FormLabel>
                      <Textarea value={formData.conversationSummary} onChange={e => setFormData({...formData, conversationSummary: e.target.value})} bg="gray.700" rows={3} />
                    </FormControl>

                    <Text color="white" fontWeight="bold" mt={2}>其他</Text>
                    <FormControl>
                      <FormLabel color="gray.400">备注</FormLabel>
                      <Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} bg="gray.700" rows={2} />
                    </FormControl>
                  </VStack>
                </TabPanel>
              </TabPanels>
            </Tabs>
            <Button colorScheme="teal" w="100%" mt={6} onClick={handleSubmit} transition="all 0.15s ease" _hover={{ transform: 'translateY(-1px)' }}>{selectedGirl ? '保存修改' : '添加女生'}</Button>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* 女生详情弹窗 */}
      <Modal isOpen={isDetailOpen} onClose={onDetailClose} size="4xl">
        <ModalOverlay />
        <ModalContent bg="gray.800" overflow="auto">
          <ModalHeader color="white">
            {selectedGirl?.name} - 详情
            {selectedGirl?.isKinkOriented && <Badge colorScheme="purple" ml={2}>Kink</Badge>}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            {selectedGirl && (
              <Tabs colorScheme="teal" size="sm">
                <TabList mb={4}>
                  <Tab>基础</Tab>
                  <Tab>外貌家庭</Tab>
                  <Tab>情感</Tab>
                  <Tab>AI画像</Tab>
                  <Tab>上下文</Tab>
                </TabList>
                <TabPanels>
                  <TabPanel px={0}>
                    <SimpleGrid columns={3} spacing={4}>
                      <Box><Text color="gray.400" fontSize="sm">年龄</Text>{renderField('age', selectedGirl.age)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">职业</Text>{renderField('occupation', selectedGirl.occupation)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">学历</Text>{renderField('education', selectedGirl.education)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">专业</Text>{renderField('major', selectedGirl.major)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">籍贯</Text>{renderField('hometown', selectedGirl.hometown)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">现居</Text>{renderField('residence', selectedGirl.residence)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">工作地点</Text>{renderField('workplace', selectedGirl.workplace)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">平台</Text>{renderField('sourcePlatform', selectedGirl.sourcePlatform)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">匹配分</Text>{renderField('matchScore', selectedGirl.matchScore)}</Box>
                    </SimpleGrid>
                    <Box mt={4}>
                      <Text color="gray.400" fontSize="sm">主页链接</Text>
                      {selectedGirl.homepageUrl ? (
                        <Text as="a" href={selectedGirl.homepageUrl} color="teal.400" fontSize="sm" wordBreak="break-all" target="_blank">{selectedGirl.homepageUrl}</Text>
                      ) : <Text color="gray.500">-</Text>}
                    </Box>
                    <Divider my={4} borderColor="gray.600" />
                    <Box>
                      <Text color="gray.400" fontSize="sm">备注</Text>
                      <Text color="white" whiteSpace="pre-wrap">{selectedGirl.notes || '无'}</Text>
                    </Box>
                  </TabPanel>
                  <TabPanel px={0}>
                    <Text color="white" fontWeight="bold" mb={2}>外貌特征</Text>
                    <SimpleGrid columns={2} spacing={4} mb={4}>
                      <Box><Text color="gray.400" fontSize="sm">外貌描述</Text>{renderField('appearance', selectedGirl.appearance)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">风格标签</Text>{renderField('styleTags', selectedGirl.styleTags, true)}</Box>
                    </SimpleGrid>
                    {selectedGirl.photos && (
                      <Box mb={4}>
                        <Text color="gray.400" fontSize="sm" mb={2}>照片</Text>
                        <SimpleGrid columns={3} spacing={2}>
                          {(parseJSONField(selectedGirl.photos) || []).map((url, i) => (
                            <Image key={i} src={url} alt="照片" h="100px" objectFit="cover" borderRadius="md" cursor="pointer" onClick={() => window.open(url, '_blank')} _hover={{ opacity: 0.8 }} />
                          ))}
                        </SimpleGrid>
                      </Box>
                    )}
                    {selectedGirl.videos && (
                      <Box mb={4}>
                        <Text color="gray.400" fontSize="sm" mb={2}>视频</Text>
                        <VStack spacing={2} align="stretch">
                          {(parseJSONField(selectedGirl.videos) || []).map((url, i) => (
                            <Box key={i} p={2} bg="gray.700" borderRadius="md">
                              <Text as="a" href={url} color="teal.400" fontSize="sm" target="_blank">{url}</Text>
                            </Box>
                          ))}
                        </VStack>
                      </Box>
                    )}
                    <Text color="white" fontWeight="bold" mb={2}>家庭背景</Text>
                    <SimpleGrid columns={2} spacing={4}>
                      <Box><Text color="gray.400" fontSize="sm">家庭背景</Text>{renderField('familyBackground', selectedGirl.familyBackground)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">家庭氛围</Text>{renderField('familyAtmosphere', selectedGirl.familyAtmosphere)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">养老负担</Text>{renderField('familyBurden', selectedGirl.familyBurden)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">家庭备注</Text>{renderField('familyComments', selectedGirl.familyComments)}</Box>
                    </SimpleGrid>
                  </TabPanel>
                  <TabPanel px={0}>
                    <SimpleGrid columns={2} spacing={4} mb={4}>
                      <Box><Text color="gray.400" fontSize="sm">婚恋态度</Text>{renderField('relationshipAttitude', selectedGirl.relationshipAttitude)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">依恋类型</Text>{renderField('attachmentStyle', selectedGirl.attachmentStyle)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">工作作息</Text>{renderField('workSchedule', selectedGirl.workSchedule)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">社交活跃度</Text>{renderField('socialActivity', selectedGirl.socialActivity)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">消费习惯</Text>{renderField('financialHabits', selectedGirl.financialHabits)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">饮食偏好</Text>{renderField('dietPreferences', selectedGirl.dietPreferences)}</Box>
                    </SimpleGrid>
                    <Text color="white" fontWeight="bold" mb={2}>情史</Text>
                    <SimpleGrid columns={1} spacing={2}>
                      <Box><Text color="gray.400" fontSize="sm">情史摘要</Text>{renderField('pastRelationshipSummary', selectedGirl.pastRelationshipSummary)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">情伤记录</Text>{renderField('emotionalWounds', selectedGirl.emotionalWounds)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">绝对雷区</Text>{renderField('dealbreakers', selectedGirl.dealbreakers)}</Box>
                    </SimpleGrid>
                    {selectedGirl.isKinkOriented && (
                      <>
                        <Divider my={4} borderColor="gray.600" />
                        <Text color="purple.400" fontWeight="bold" mb={2}>字母圈属性</Text>
                        <SimpleGrid columns={3} spacing={4}>
                          <Box><Text color="gray.400" fontSize="sm">身份</Text>{renderField('kinkIdentity', selectedGirl.kinkIdentity)}</Box>
                          <Box><Text color="gray.400" fontSize="sm">经验</Text>{renderField('kinkExperience', selectedGirl.kinkExperience)}</Box>
                          <Box><Text color="gray.400" fontSize="sm">边界</Text>{renderField('kinkBoundaries', selectedGirl.kinkBoundaries)}</Box>
                          <Box><Text color="gray.400" fontSize="sm">兴趣标签</Text>{renderField('kinkInterests', selectedGirl.kinkInterests)}</Box>
                        </SimpleGrid>
                        <Box mt={2}><Text color="gray.400" fontSize="sm">特殊备注</Text>{renderField('kinkNotes', selectedGirl.kinkNotes)}</Box>
                      </>
                    )}
                  </TabPanel>
                  <TabPanel px={0}>
                    <Text color="white" fontWeight="bold" mb={2}>内在画像</Text>
                    <SimpleGrid columns={3} spacing={4} mb={4}>
                      <Box><Text color="gray.400" fontSize="sm">性格</Text>{renderField('personality', selectedGirl.personality)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">价值观</Text>{renderField('values_', selectedGirl.values_)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">沟通风格</Text>{renderField('communicationStyle', selectedGirl.communicationStyle)}</Box>
                    </SimpleGrid>
                    <SimpleGrid columns={2} spacing={2} mb={4}>
                      <Box><Text color="gray.400" fontSize="sm">情绪触发点</Text>{renderField('emotionalTriggers', selectedGirl.emotionalTriggers)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">喜欢话题</Text>{renderField('talkingTopics', selectedGirl.talkingTopics)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">禁忌话题</Text>{renderField('thingsToAvoid', selectedGirl.thingsToAvoid)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">兴趣爱好</Text>{renderField('interests', selectedGirl.interests)}</Box>
                    </SimpleGrid>
                    <Text color="white" fontWeight="bold" mb={2}>谙世EQ维度</Text>
                    <SimpleGrid columns={5} spacing={4} mb={4}>
                      {[
                        { key: 'empathy', label: '同理心' },
                        { key: 'selfAwareness', label: '自我认知' },
                        { key: 'communication', label: '沟通' },
                        { key: 'relationship', label: '关系' },
                        { key: 'conflictRes', label: '冲突解决' }
                      ].map(item => (
                        <Box key={item.key}>
                          <Text color="gray.400" fontSize="sm">{item.label}</Text>
                          <Text color={selectedGirl[item.key] ? 'teal.400' : 'gray.500'}>
                            {selectedGirl[item.key] ? selectedGirl[item.key] + '/10' : '-'}
                          </Text>
                        </Box>
                      ))}
                    </SimpleGrid>
                    <Text color="white" fontWeight="bold" mb={2}>AI战略分析</Text>
                    <SimpleGrid columns={2} spacing={2}>
                      <Box><Text color="gray.400" fontSize="sm">最佳策略</Text>{renderField('bestApproach', selectedGirl.bestApproach)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">推荐话题</Text>{renderField('recommendedTopics', selectedGirl.recommendedTopics)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">升级条件</Text>{renderField('upgradeConditions', selectedGirl.upgradeConditions)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">预计时间线</Text>{renderField('estimatedTimeline', selectedGirl.estimatedTimeline)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">风险因素</Text>{renderField('riskFactors', selectedGirl.riskFactors)}</Box>
                      <Box><Text color="gray.400" fontSize="sm">战略备注</Text>{renderField('strategicNotes', selectedGirl.strategicNotes)}</Box>
                    </SimpleGrid>
                  </TabPanel>
                  <TabPanel px={0}>
                    <Text color="white" fontWeight="bold" mb={2}>关系状态</Text>
                    <SimpleGrid columns={4} spacing={4} mb={4}>
                      <Box><Text color="gray.400" fontSize="sm">阶段</Text><Badge colorScheme="teal">{selectedGirl.stage}</Badge></Box>
                      <Box><Text color="gray.400" fontSize="sm">状态</Text><Badge>{selectedGirl.status}</Badge></Box>
                      <Box><Text color="gray.400" fontSize="sm">亲密度</Text>
                        <HStack>
                          {Array.from({ length: selectedGirl.intimacyLevel || 1 }).map((_, i) => (
                            <Icon key={i} as={HeartIcon} color="red.400" boxSize={4} />
                          ))}
                        </HStack>
                      </Box>
                      <Box><Text color="gray.400" fontSize="sm">热度</Text>
                        <HStack>
                          <Text color={getTensionColor(selectedGirl.tensionScore)}>
                            {selectedGirl.tensionScore?.toFixed(1) || '5.0'}
                          </Text>
                          {getTensionIcon(selectedGirl.tensionScore)}
                        </HStack>
                      </Box>
                      <Box><Text color="gray.400" fontSize="sm">最后联系</Text>
                        <Text color="white">{selectedGirl.lastContact ? new Date(selectedGirl.lastContact).toLocaleString() : '-'}</Text>
                      </Box>
                      <Box><Text color="gray.400" fontSize="sm">回复规律</Text>{renderField('responsePattern', selectedGirl.responsePattern)}</Box>
                    </SimpleGrid>
                    <Text color="white" fontWeight="bold" mb={2}>关键信号</Text>
                    {selectedGirl.signals ? (
                      <Box bg="gray.700" p={3} borderRadius="md" mb={4}>
                        {(() => {
                          const arr = parseJSONField(selectedGirl.signals);
                          return arr.map((s, i) => (
                            <Flex key={i} align="center" mb={1}>
                              <Badge colorScheme={s.type === 'positive' ? 'green' : s.type === 'negative' ? 'red' : 'gray'} mr={2}>
                                {s.type === 'positive' ? '[+]' : s.type === 'negative' ? '[-]' : '[*]'}
                              </Badge>
                              <Text color="white" fontSize="sm">{s.event}</Text>
                              <Text color="gray.500" fontSize="xs" ml={2}>{s.date}</Text>
                            </Flex>
                          ));
                        })()}
                      </Box>
                    ) : <Text color="gray.500" mb={4}>暂无信号记录</Text>}
                    <Text color="white" fontWeight="bold" mb={2}>待推进事项</Text>
                    {selectedGirl.pendingActions ? (
                      <Box bg="gray.700" p={3} borderRadius="md" mb={4}>
                        {(() => {
                          const arr = parseJSONField(selectedGirl.pendingActions);
                          return arr.map((a, i) => (
                            <Text key={i} color="orange.300" fontSize="sm">→ {a}</Text>
                          ));
                        })()}
                      </Box>
                    ) : <Text color="gray.500" mb={4}>暂无待办</Text>}
                    <Text color="white" fontWeight="bold" mb={2}>观察记录</Text>
                    {selectedGirl.observations ? (
                      <Box bg="gray.700" p={3} borderRadius="md" mb={4}>
                        {(() => {
                          const arr = parseJSONField(selectedGirl.observations);
                          return arr.map((o, i) => (
                            <Text key={i} color="gray.300" fontSize="sm">• {o}</Text>
                          ));
                        })()}
                      </Box>
                    ) : <Text color="gray.500" mb={4}>暂无观察记录</Text>}
                    <Text color="white" fontWeight="bold" mb={2}>对话摘要</Text>
                    <Box bg="gray.700" p={3} borderRadius="md">
                      <Text color="white" whiteSpace="pre-wrap" fontSize="sm">{selectedGirl.conversationSummary || '暂无摘要'}</Text>
                    </Box>
                  </TabPanel>
                </TabPanels>
              </Tabs>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* 截图管理弹窗 */}
      <Modal isOpen={isScreenshotOpen} onClose={onScreenshotClose} size="4xl">
        <ModalOverlay />
        <ModalContent bg="gray.800" maxH="85vh" overflow="auto">
          <ModalHeader color="white">
            聊天截图管理 - {selectedGirl?.name}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <VStack spacing={6} align="stretch">
              {/* 上传区域 - 优化布局 */}
              <Flex gap={4} align="flex-end" bg="gray.700" p={4} borderRadius="md">
                <FormControl flex={1}>
                  <FormLabel color="gray.400" fontSize="sm">选择图片</FormLabel>
                  <Input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileSelect} bg="gray.600" pt={1} color="white" _placeholder={{ color: 'gray.400' }} />
                </FormControl>
                <FormControl flex={1}>
                  <FormLabel color="gray.400" fontSize="sm">备注（可选）</FormLabel>
                  <Input value={screenshotNotes} onChange={e => setScreenshotNotes(e.target.value)} placeholder="简短描述..." bg="gray.600" color="white" _placeholder={{ color: 'gray.400' }} />
                </FormControl>
                <Button colorScheme="teal" onClick={handleUploadScreenshot} isLoading={uploading} isDisabled={!selectedFile} h="40px">
                  上传
                </Button>
              </Flex>

              {/* 截图网格 - 缩略图展示 */}
              <Box>
                <Flex justify="space-between" align="center" mb={4}>
                  <Heading size="sm" color="white">截图记录 ({screenshots.length})</Heading>
                  {selectedGirl?.sourcePlatform && <Badge colorScheme="blue">{selectedGirl.sourcePlatform}</Badge>}
                </Flex>
                {screenshots.length === 0 ? (
                  <Flex h="200px" align="center" justify="center" bg="gray.700" borderRadius="md">
                    <Text color="gray.500">暂无截图记录</Text>
                  </Flex>
                ) : (
                  <SimpleGrid columns={4} spacing={4}>
                    {screenshots.map(ss => (
                      <Box
                        key={ss.id}
                        position="relative"
                        bg="gray.700"
                        borderRadius="md"
                        overflow="hidden"
                        cursor="pointer"
                        transition="all 0.2s"
                        _hover={{ transform: 'scale(1.02)', boxShadow: 'lg' }}
                        onClick={() => setPreviewImage(`${import.meta.env.VITE_API_URL || 'http://localhost:3005'}${ss.imageUrl}`)}
                      >
                        <Image
                          src={`${import.meta.env.VITE_API_URL || 'http://localhost:3005'}${ss.imageUrl}`}
                          alt="聊天截图"
                          w="100%"
                          h="140px"
                          objectFit="cover"
                          fallbackSrc="https://via.placeholder.com/200x140?text=..."
                        />
                        <Box position="absolute" bottom={0} left={0} right={0} bg="blackAlpha.700" p={2}>
                          <Text fontSize="xs" color="gray.300" noOfLines={1}>
                            {ss.notes || '无备注'}
                          </Text>
                        </Box>
                      </Box>
                    ))}
                  </SimpleGrid>
                )}
              </Box>

              {/* 截图详情列表 */}
              {screenshots.length > 0 && (
                <Box>
                  <Heading size="sm" color="white" mb={4}>截图详情</Heading>
                  <VStack spacing={3} align="stretch">
                    {screenshots.map(ss => (
                      <Flex key={ss.id} gap={4} bg="gray.700" p={3} borderRadius="md" align="center">
                        <Image
                          src={`${import.meta.env.VITE_API_URL || 'http://localhost:3005'}${ss.imageUrl}`}
                          alt="聊天截图"
                          w="80px"
                          h="60px"
                          objectFit="cover"
                          borderRadius="md"
                          cursor="pointer"
                          onClick={() => setPreviewImage(`${import.meta.env.VITE_API_URL || 'http://localhost:3005'}${ss.imageUrl}`)}
                          _hover={{ opacity: 0.8 }}
                          fallbackSrc="https://via.placeholder.com/80x60?text=..."
                        />
                        <Box flex={1}>
                          <Flex gap={2} mb={1}>
                            {ss.platform && <Badge colorScheme="blue" fontSize="xs">{ss.platform}</Badge>}
                            <Text color="gray.500" fontSize="xs">
                              {new Date(ss.createdAt).toLocaleString()}
                            </Text>
                          </Flex>
                          <Textarea
                            value={ss.notes || ''}
                            placeholder="备注..."
                            bg="gray.600"
                            size="sm"
                            rows={1}
                            onChange={(e) => {
                              const updated = screenshots.map(s => s.id === ss.id ? {...s, notes: e.target.value} : s);
                              setScreenshots(updated);
                            }}
                            onBlur={(e) => handleUpdateNotes(ss.id, e.target.value)}
                            color="white"
                            _placeholder={{ color: 'gray.400' }}
                          />
                        </Box>
                        <HStack spacing={2}>
                          <Button size="sm" colorScheme="teal" onClick={() => handleAiNotes(ss.id)} isLoading={aiGenerating} leftIcon={<Icon as={SparklesIcon} />}>
                            AI备注
                          </Button>
                          <Button size="sm" colorScheme="red" variant="ghost" onClick={() => handleDeleteScreenshot(ss.id)}>
                            删除
                          </Button>
                        </HStack>
                      </Flex>
                    ))}
                  </VStack>
                </Box>
              )}
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* 图片预览弹窗 */}
      <Modal isOpen={!!previewImage} onClose={() => setPreviewImage(null)} size="4xl">
        <ModalOverlay bg="blackAlpha.800" />
        <ModalContent bg="transparent" boxShadow="none">
          <ModalCloseButton color="white" zIndex={10} />
          <ModalBody p={0} display="flex" alignItems="center" justifyContent="center">
            {previewImage && (
              <Image
                src={previewImage}
                alt="预览"
                maxH="85vh"
                objectFit="contain"
                borderRadius="md"
              />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}
