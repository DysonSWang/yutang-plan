import { useEffect, useState } from 'react';
import {
  Box, Heading, Card, CardBody, Table, Thead, Tbody, Tr, Th, Td, Button, Badge, Modal, ModalOverlay,
  ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton, useDisclosure, SimpleGrid,
  FormControl, FormLabel, Input, Select, Textarea, NumberInput, NumberInputField, VStack, HStack,
  Text, Divider, useToast, Tabs, TabList, TabPanels, Tab, TabPanel, Flex, Tooltip, IconButton,
  createIcon, Avatar, Stat, StatLabel, StatNumber, StatHelpText, Progress, Switch, Stack, Icon
} from '@chakra-ui/react';
import { clients as clientsApi } from '../../utils/api';
import { FireIcon, SnowIcon, UsersIcon } from '../../components/Icons';

// 创建自定义问号图标
const HelpIcon = createIcon({
  displayName: 'HelpIcon',
  viewBox: '0 0 24 24',
  path: [
    <path key="circle" d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" fill="none" stroke="currentColor" strokeWidth="2"/>,
    <path key="q1" d="M9 9a3 3 0 115.12 2.12c-.73.73-1.12 1.38-1.12 2.38v1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>,
    <circle key="dot" cx="12" cy="19" r="1" fill="currentColor"/>
  ],
});

// Tab 图标
const EditIcon = createIcon({
  displayName: 'EditIcon',
  viewBox: '0 0 24 24',
  path: [<path key="path" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>, <path key="path2" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>],
});

const InfoIcon = createIcon({
  displayName: 'InfoIcon',
  viewBox: '0 0 24 24',
  path: [<circle key="c" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>, <path key="l" d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>],
});

const HeartIcon = createIcon({
  displayName: 'HeartIcon',
  viewBox: '0 0 24 24',
  path: [<path key="h" d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>],
});

const SERVICE_STAGES = ['背调', '建池', '约会', '锁定', '维护'];
const FAMILY_BACKGROUNDS = ['农村', '城市', '经商', '公务员', '其他'];
const FAMILY_STRUCTURES = ['双亲', '单亲', '离异', '其他'];
const FAMILY_ATMOSPHERES = ['和睦', '一般', '冷淡', '争吵', '离异'];
const FAMILY_BURDENS = ['无负担', '有退休金', '普通负担', '较重负担'];
const FAMILY_MEMBERS_OPTIONS = ['独生子', '独生子女', '两姐妹', '两兄弟', '兄妹', '姐弟', '多子女'];
const SOCIAL_STYLES = ['主动', '被动', '社交达人'];
const RELATIONSHIP_ATTITUDES = ['认真', '随便', '急切'];
const LEARNING_ABILITIES = ['强', '中', '弱'];
const COOPERATION_LEVELS = ['配合', '一般', '抵触'];
const FEEDBACK_QUALITIES = ['详细', '简单', '无反馈'];
const EMOTIONAL_GOALS = ['认真找对象', '随便玩玩', '家里催婚', '空虚寂寞'];
const RELATIONSHIP_GOALS = ['短期', '长期', '不确定'];
const EMOTIONAL_MATURITIES = ['幼稚', '一般', '成熟'];
const SELF_ESTEEM_LEVELS = ['高', '中', '低'];
const CLIENT_TYPES = ['执行型', '质疑型', '自主型'];
const COGNITIVE_ACCURACIES = ['准确', '高估', '低估'];
const STAGE_OPTIONS = ['陌生', '朋友', '暧昧', '亲密'];
const PACE_PREFERENCES = ['快节奏', '稳健型', '慢热型'];
const HUMOR_STYLES = ['冷幽默', '自嘲', '调侃', '正经'];
const EDUCATIONS = ['小学', '初中', '中专', '高中', '大专', '本科', '硕士', '博士'];
const DRESSING_STYLES = ['商务正装', '商务休闲', '休闲', '运动', '时尚', '简约'];
const COMMUNICATION_STYLES = ['直接', '含蓄', '话多', '话少', '幽默'];
const PERSONALITY_TYPES = ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP', '其他'];
const MARRIAGE_HISTORIES = ['未婚', '离异无子', '离异有子', '丧偶'];
const ASSETS_LEVELS = ['A6', 'A7', 'A8', 'A9', 'A10', 'A10+'];
const BUDGET_RANGES = ['10万以下', '10-30万', '30-50万', '50-100万', '100万以上'];
const TIME_INVESTMENTS = ['每天<1小时', '每天1-2小时', '每天2-3小时', '每天>3小时'];
const COMFORT_ZONES = ['独立女性', '温柔体贴', '活泼开朗', '成熟稳重', '小女生', '事业型'];
const CITIES = ['北京', '上海', '广州', '深圳', '杭州', '南京', '苏州', '成都', '重庆', '武汉', '西安', '天津', '长沙', '郑州', '东莞', '佛山', '青岛', '沈阳', '大连', '厦门', '宁波', '其他'];
const OCCUPATIONS = ['企业主', '企业高管', '公务员', '医生', '律师', '教师', '工程师', '程序员', '销售', '金融从业者', '自由职业', '退休', '其他'];
const CLIENT_SOURCES = ['朋友推荐', '自然流量', '抖音', '小红书', '微信', '线下活动', '其他'];

// 字段说明映射
const FIELD_HELP = {
  age: { label: '年龄', help: '客户实际年龄，用于匹配分析', example: '38' },
  occupation: { label: '职业', help: '当前职业/行业', example: '制造业老板' },
  education: { label: '学历', help: '最高学历', example: '本科' },
  income: { label: '收入水平', help: '年收入范围', example: '100-300万' },
  height: { label: '身高(cm)', help: '身高厘米数', example: '175' },
  residence: { label: '所在地', help: '当前居住城市', example: '上海' },
  hometown: { label: '籍贯', help: '户籍/老家', example: '浙江温州' },
  appearance: { label: '外貌描述', help: '身高体型穿着的整体描述', example: '微胖，戴眼镜，偏商务休闲风' },
  dressingStyle: { label: '穿着风格', help: '日常穿衣风格', example: '商务休闲，品牌低调' },
  familyBackground: { label: '家庭背景', help: '原生家庭阶层', example: '城市经商' },
  familyStructure: { label: '家庭结构', help: '父母婚姻状况', example: '双亲健在' },
  familyAtmosphere: { label: '家庭氛围', help: '从小在什么氛围长大', example: '和睦' },
  familyBurden: { label: '养老负担', help: '是否有父母养老压力', example: '父母有退休金' },
  familyMembers: { label: '家庭成员', help: '兄弟姐妹情况', example: '独生子' },
  personality: { label: '性格/MBTI', help: '性格类型或MBTI', example: 'ENFP' },
  emotionalStable: { label: '情绪稳定性', help: '1=容易崩溃，10=非常稳定', example: '7' },
  eqLevel: { label: '情商水平', help: '1=很低，10=很高', example: '6' },
  communicationStyle: { label: '沟通风格', help: '平时说话习惯', example: '直接' },
  socialStyle: { label: '社交风格', help: '社交场合表现', example: '社交达人' },
  relationshipAttitude: { label: '婚恋态度', help: '对找对象的态度', example: '认真' },
  pastRelationshipSummary: { label: '情史摘要', help: '过往感情经历简述', example: '结婚2年离异，无孩子' },
  marriageHistory: { label: '婚史', help: '婚姻状况', example: '未婚/离异/丧偶' },
  emotionalWounds: { label: '情伤记录', help: '有没有印象深刻的情伤', example: '被前任骗过钱' },
  exPartnerTaboos: { label: '介意的前任类型', help: '最接受不了的前任类型', example: '不能接受拜金女' },
  emotionalGoal: { label: '感情诉求', help: '现在最想要什么', example: '认真找对象' },
  relationshipGoal: { label: '关系目标', help: '想要什么类型的关系', example: '长期' },
  commitmentWillingness: { label: '承诺意愿', help: '1=不想承诺，10=非常愿意', example: '8' },
  emotionalMaturity: { label: '感情认知水平', help: '对两性关系的理解程度', example: '成熟' },
  learningAbility: { label: '学习能力', help: '吸收建议的能力', example: '强' },
  coachCooperation: { label: '配合度', help: '配合操盘手的程度', example: '配合' },
  feedbackQuality: { label: '反馈质量', help: '给操盘手反馈的信息量', example: '详细' },
  strengths: { label: '核心卖点', help: '追女生最大的优势是什么', example: '有钱/幽默/真诚' },
  weaknesses: { label: '价值短板', help: '哪方面最弱', example: '情商低/不会聊天' },
  clientType: { label: '客户类型', help: '执行型=你说啥做啥；质疑型=要解释为什么；自主型=自己能聊' },
  selfValuePerception: { label: '自我价值认知', help: '客户认为自己哪方面最强', example: '觉得有钱就行' },
  cognitiveAccuracy: { label: '认知准确度', help: '自我认知准不准', example: '高估' },
  assetsLevel: { label: '资产级别', help: '整体资产水平', example: 'A8' },
  budgetRange: { label: '预算范围', help: '愿意为服务花多少钱', example: '年预算50万' },
  timeInvestment: { label: '时间投入', help: '愿意花多少时间在这件事上', example: '每天2小时' },
  serviceStage: { label: '服务阶段', help: '当前服务阶段', example: '建池' },
  matchPreferences: { label: '理想型偏好', help: '喜欢什么类型的女生', example: '乖巧懂事、能聊得来' },
  dealbreakers: { label: '绝对雷区', help: '绝对接受不了的类型', example: '拜金女/离异带娃' },
  profilePhotos: { label: '主页照片', help: '社交平台主页照片URL列表', example: 'JSON数组格式' },
  profileBio: { label: '主页签名', help: '社交平台的个人简介', example: '创业中，喜欢健身' },
  preferredPlatforms: { label: '常用平台', help: '主要在哪些平台认识女生', example: '探探/Soul' },
  openingTemplates: { label: '打招呼模板', help: '客户习惯用的开场白', example: 'JSON数组格式' },
  petPhrases: { label: '口头禅', help: '客户说话的习惯用语', example: 'JSON数组格式' },
  interactionStyle: { label: '互动风格', help: '跟女生互动的风格', example: '主动型' },
  chatTaboos: { label: '代聊禁区', help: '代聊时绝对不能说的话', example: 'JSON数组格式' },
  humorStyle: { label: '幽默风格', help: '客户的幽默类型', example: '冷幽默' },
  currentStage: { label: '当前阶段', help: '和目标女生现在什么阶段', example: '暧昧' },
  stageProgress: { label: '阶段进度', help: '当前阶段完成了多少%，0-100', example: '70' },
  lastMilestone: { label: '最近里程碑', help: '最近最重要的进展事件', example: '上周第一次视频通话' },
  selfEsteemLevel: { label: '自尊水平', help: '影响代聊风格，太高不能太舔', example: '高' },
  antiFrustrationLevel: { label: '抗压能力', help: '1=容易崩，10=非常稳', example: '8' },
  pacePreference: { label: '节奏偏好', help: '喜欢快节奏还是慢热', example: '稳健型' },
  investmentWillingness: { label: '投入意愿', help: '愿意投入多少时间金钱精力', example: '愿意花时间但预算有限' },
  comfortZone: { label: '舒适区', help: '习惯跟什么类型的女生相处', example: '独立女性' },
  trustLevel: { label: '信任度', help: '对操盘手的信任，1-5', example: '3' },
  interactionHeat: { label: '互动热度', help: '客户活跃度，1-10', example: '7.5' },
  notes: { label: '备注', help: '其他补充信息', example: '客户比较忙，只晚上联系' },
  source: { label: '客户来源', help: '从哪里来的客户', example: '朋友推荐' },
};

// 帮助函数：在标签旁显示问号图标
const FieldLabel = ({ fieldKey, isEditing }) => {
  const field = FIELD_HELP[fieldKey];
  if (!field) return isEditing ? <FormLabel color="gray.400" fontSize="sm">{fieldKey}</FormLabel> : null;
  if (!isEditing) return null;
  return (
    <HStack spacing={1}>
      <FormLabel color="gray.300" fontSize="sm" mb={0}>{field.label}</FormLabel>
      <Tooltip label={`${field.help}${field.example ? ' 示例：' + field.example : ''}`} fontSize="xs" placement="top" hasArrow>
        <IconButton icon={<HelpIcon />} size="xs" variant="ghost" color="gray.500" aria-label="help" />
      </Tooltip>
    </HStack>
  );
};

// 字段卡片组件
const FieldCard = ({ children, title, icon: Icon, colorScheme = 'teal' }) => (
  <Box bg="gray.750" borderRadius="lg" p={4} borderLeft="3px solid" borderLeftColor={`${colorScheme}.500`}>
    <HStack mb={3}>
      {Icon && <Box color={`${colorScheme}.400`}><Icon /></Box>}
      <Text color="gray.200" fontWeight="600" fontSize="sm">{title}</Text>
    </HStack>
    {children}
  </Box>
);

// 数值指示器
const ScoreIndicator = ({ label, value, max = 10, colorScheme = 'teal' }) => {
  const percentage = (value / max) * 100;
  const color = percentage >= 70 ? 'green.400' : percentage >= 40 ? 'yellow.400' : 'red.400';
  return (
    <Box>
      <HStack justify="space-between" mb={1}>
        <Text color="gray.400" fontSize="xs">{label}</Text>
        <Text color={color} fontSize="xs" fontWeight="bold">{value}/{max}</Text>
      </HStack>
      <Progress value={percentage} size="xs" colorScheme={colorScheme} bg="gray.700" borderRadius="full" />
    </Box>
  );
};

function getInitialFormData() {
  return {
    username: '', password: '', nickname: '', phone: '',
    age: '', occupation: '', education: '', income: '', height: '', residence: '', hometown: '',
    appearance: '', dressingStyle: '',
    familyBackground: '', familyStructure: '', familyAtmosphere: '', familyBurden: '', familyMembers: '',
    personality: '', emotionalStable: '', eqLevel: '', communicationStyle: '', socialStyle: '',
    relationshipAttitude: '', pastRelationshipSummary: '', marriageHistory: '', emotionalWounds: '', exPartnerTaboos: '',
    emotionalGoal: '', relationshipGoal: '', commitmentWillingness: '', emotionalMaturity: '',
    learningAbility: '', coachCooperation: '', feedbackQuality: '',
    strengths: '', weaknesses: '',
    clientType: '',
    selfValuePerception: '', cognitiveAccuracy: '',
    assetsLevel: '', budgetRange: '', timeInvestment: '', serviceStage: '背调',
    matchPreferences: '', dealbreakers: '',
    profilePhotos: '', profileBio: '', preferredPlatforms: '',
    openingTemplates: '', petPhrases: '', interactionStyle: '', chatTaboos: '', humorStyle: '',
    currentStage: '', stageProgress: '', lastMilestone: '',
    selfEsteemLevel: '', antiFrustrationLevel: '', pacePreference: '',
    investmentWillingness: '', comfortZone: '',
    trustLevel: 1, interactionHeat: 5.0,
    notes: '', source: ''
  };
}

export default function AdminClients() {
  const [clientList, setClientList] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [learnings, setLearnings] = useState([]);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isCreateOpen, onOpen: onCreateOpen, onClose: onCreateClose } = useDisclosure();
  const { isOpen: isExtractOpen, onOpen: onExtractOpen, onClose: onExtractClose } = useDisclosure();
  const { isOpen: isPreviewOpen, onOpen: onPreviewOpen, onClose: onPreviewClose } = useDisclosure();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(getInitialFormData());
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extractText, setExtractText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractedProfile, setExtractedProfile] = useState(null);
  const toast = useToast();

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      const res = await clientsApi.list();
      if (res.success) {
        setClientList(res.clients);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleExtractProfile = async () => {
    if (!extractText.trim()) {
      toast({ title: '请输入自我介绍文本', status: 'warning' });
      return;
    }
    setExtracting(true);
    try {
      const res = await clientsApi.extractProfile(extractText);
      if (res.success && res.profile) {
        setExtractedProfile(res.profile);
        onExtractClose();
        onPreviewOpen();
      } else {
        toast({ title: '提取失败，请重试', status: 'error' });
      }
    } catch (e) {
      console.error(e);
      toast({ title: '提取失败，请重试', status: 'error' });
    } finally {
      setExtracting(false);
    }
  };

  const handleConfirmExtract = () => {
    if (!extractedProfile) return;
    const p = extractedProfile;
    setFormData(prev => ({
      ...prev,
      age: p.age || prev.age,
      occupation: p.occupation || prev.occupation,
      education: p.education || prev.education,
      income: p.income || prev.income,
      height: p.height || prev.height,
      residence: p.residence || prev.residence,
      hometown: p.hometown || prev.hometown,
      appearance: p.appearance || prev.appearance,
      familyBackground: p.familyBackground || prev.familyBackground,
      familyStructure: p.familyStructure || prev.familyStructure,
      familyAtmosphere: p.familyAtmosphere || prev.familyAtmosphere,
      personality: p.personality || prev.personality,
      emotionalStable: p.emotionalStable || prev.emotionalStable,
      eqLevel: p.eqLevel || prev.eqLevel,
      communicationStyle: p.communicationStyle || prev.communicationStyle,
      socialStyle: p.socialStyle || prev.socialStyle,
      relationshipAttitude: p.relationshipAttitude || prev.relationshipAttitude,
      marriageHistory: p.marriageHistory || prev.marriageHistory,
      emotionalGoal: p.emotionalGoal || prev.emotionalGoal,
      relationshipGoal: p.relationshipGoal || prev.relationshipGoal,
      learningAbility: p.learningAbility || prev.learningAbility,
      coachCooperation: p.coachCooperation || prev.coachCooperation,
      assetsLevel: p.assetsLevel || prev.assetsLevel,
      clientType: p.clientType || prev.clientType,
      humorStyle: p.humorStyle || prev.humorStyle,
      selfEsteemLevel: p.selfEsteemLevel || prev.selfEsteemLevel,
      pacePreference: p.pacePreference || prev.pacePreference,
      strengths: p.strengths || prev.strengths,
      weaknesses: p.weaknesses || prev.weaknesses,
      notes: p.notes ? (prev.notes ? prev.notes + '\n' + p.notes : p.notes) : prev.notes
    }));
    toast({ title: '档案提取成功，请检查并完善信息', status: 'success' });
    onPreviewClose();
    setExtractText('');
    setExtractedProfile(null);
    if (!isEditing) {
      setIsEditing(true);
    }
  };

  const handleCancelExtract = () => {
    onPreviewClose();
    setExtractedProfile(null);
    setExtractText('');
  };

  
  const viewClient = async (client) => {
    try {
      const res = await clientsApi.get(client.id);
      if (res.success) {
        setSelectedClient(res.client);
        setLearnings(res.client.learnings || []);
        setFormData(getInitialFormData());
        setIsEditing(false);
        onOpen();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const startEdit = () => {
    if (!selectedClient) return;
    setFormData({
      username: selectedClient.username || '',
      nickname: selectedClient.nickname || '',
      phone: selectedClient.phone || '',
      age: selectedClient.age || '',
      occupation: selectedClient.occupation || '',
      education: selectedClient.education || '',
      income: selectedClient.income || '',
      height: selectedClient.height || '',
      residence: selectedClient.residence || '',
      hometown: selectedClient.hometown || '',
      appearance: selectedClient.appearance || '',
      dressingStyle: selectedClient.dressingStyle || '',
      familyBackground: selectedClient.familyBackground || '',
      familyStructure: selectedClient.familyStructure || '',
      familyAtmosphere: selectedClient.familyAtmosphere || '',
      familyBurden: selectedClient.familyBurden || '',
      familyMembers: selectedClient.familyMembers || '',
      personality: selectedClient.personality || '',
      emotionalStable: selectedClient.emotionalStable || '',
      eqLevel: selectedClient.eqLevel || '',
      communicationStyle: selectedClient.communicationStyle || '',
      socialStyle: selectedClient.socialStyle || '',
      relationshipAttitude: selectedClient.relationshipAttitude || '',
      pastRelationshipSummary: selectedClient.pastRelationshipSummary || '',
      marriageHistory: selectedClient.marriageHistory || '',
      emotionalWounds: selectedClient.emotionalWounds || '',
      exPartnerTaboos: selectedClient.exPartnerTaboos || '',
      emotionalGoal: selectedClient.emotionalGoal || '',
      relationshipGoal: selectedClient.relationshipGoal || '',
      commitmentWillingness: selectedClient.commitmentWillingness || '',
      emotionalMaturity: selectedClient.emotionalMaturity || '',
      learningAbility: selectedClient.learningAbility || '',
      coachCooperation: selectedClient.coachCooperation || '',
      feedbackQuality: selectedClient.feedbackQuality || '',
      strengths: selectedClient.strengths || '',
      weaknesses: selectedClient.weaknesses || '',
      clientType: selectedClient.clientType || '',
      selfValuePerception: selectedClient.selfValuePerception || '',
      cognitiveAccuracy: selectedClient.cognitiveAccuracy || '',
      assetsLevel: selectedClient.assetsLevel || '',
      budgetRange: selectedClient.budgetRange || '',
      timeInvestment: selectedClient.timeInvestment || '',
      serviceStage: selectedClient.serviceStage || '背调',
      matchPreferences: selectedClient.matchPreferences || '',
      dealbreakers: selectedClient.dealbreakers || '',
      profilePhotos: selectedClient.profilePhotos || '',
      profileBio: selectedClient.profileBio || '',
      preferredPlatforms: selectedClient.preferredPlatforms || '',
      openingTemplates: selectedClient.openingTemplates || '',
      petPhrases: selectedClient.petPhrases || '',
      interactionStyle: selectedClient.interactionStyle || '',
      chatTaboos: selectedClient.chatTaboos || '',
      humorStyle: selectedClient.humorStyle || '',
      currentStage: selectedClient.currentStage || '',
      stageProgress: selectedClient.stageProgress || '',
      lastMilestone: selectedClient.lastMilestone || '',
      selfEsteemLevel: selectedClient.selfEsteemLevel || '',
      antiFrustrationLevel: selectedClient.antiFrustrationLevel || '',
      pacePreference: selectedClient.pacePreference || '',
      investmentWillingness: selectedClient.investmentWillingness || '',
      comfortZone: selectedClient.comfortZone || '',
      trustLevel: selectedClient.trustLevel || 1,
      interactionHeat: selectedClient.interactionHeat || 5.0,
      notes: selectedClient.notes || '',
      source: selectedClient.source || ''
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!selectedClient) return;
    setSaving(true);
    try {
      const res = await clientsApi.update(selectedClient.id, formData);
      if (res.success) {
        toast({ title: '保存成功', status: 'success' });
        setIsEditing(false);
        loadClients();
        const updated = await clientsApi.get(selectedClient.id);
        if (updated.success) setSelectedClient(updated.client);
      }
    } catch (e) {
      toast({ title: '保存失败', status: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const createClient = async () => {
    setCreating(true);
    try {
      const res = await clientsApi.create({
        username: formData.username,
        password: formData.password,
        nickname: formData.nickname,
        phone: formData.phone
      });
      if (res.success) {
        toast({ title: '客户创建成功', status: 'success' });
        setFormData(getInitialFormData());
        onCreateClose();
        loadClients();
      }
    } catch (e) {
      toast({ title: '创建失败', status: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const getHeatColor = (score) => {
    if (score >= 7) return 'red.400';
    if (score >= 5) return 'orange.400';
    return 'gray.400';
  };

  const getHeatIcon = (score) => {
    if (score >= 7) return <Icon as={FireIcon} color="red.400" />;
    if (score >= 5) return <Icon as={FireIcon} color="orange.400" />;
    return <Icon as={SnowIcon} color="gray.400" />;
  };

  const getCooperationColor = (coop) => {
    if (coop === '配合') return 'green';
    if (coop === '一般') return 'yellow';
    if (coop === '抵触') return 'red';
    return 'gray';
  };

  return (
    <Box>
      {/* 页面标题区 */}
      <HStack justify="space-between" mb={6}>
        <HStack spacing={4}>
          <Icon as={UsersIcon} color="teal.400" boxSize={8} />
          <Box>
            <Heading color="white" size="lg">客户管理</Heading>
            <Text color="gray.500" fontSize="sm">共 {clientList.length} 位客户</Text>
          </Box>
        </HStack>
        <Button colorScheme="teal" size="md" onClick={() => { setFormData(getInitialFormData()); onCreateOpen(); }} transition="all 0.15s ease" _hover={{ transform: 'translateY(-1px)' }}>
          + 新建客户
        </Button>
      </HStack>

      {/* 客户列表卡片 */}
      <Card bg="gray.800" borderRadius="xl" overflow="hidden">
        <Table variant="simple" color="gray.300">
          <Thead bg="gray.750">
            <Tr>
              <Th color="gray.400" borderColor="gray.700">客户</Th>
              <Th color="gray.400" borderColor="gray.700" isNumeric>年龄</Th>
              <Th color="gray.400" borderColor="gray.700">职业</Th>
              <Th color="gray.400" borderColor="gray.700">阶段</Th>
              <Th color="gray.400" borderColor="gray.700">配合度</Th>
              <Th color="gray.400" borderColor="gray.700" isNumeric>热度</Th>
              <Th color="gray.400" borderColor="gray.700" isNumeric>女生</Th>
              <Th color="gray.400" borderColor="gray.700">操作</Th>
            </Tr>
          </Thead>
          <Tbody>
            {clientList.map(client => (
              <Tr key={client.id} _hover={{ bg: 'gray.750' }} cursor="pointer" onClick={() => viewClient(client)}>
                <Td fontWeight="600" color="white" borderColor="gray.700">
                  <HStack spacing={3}>
                    <Avatar size="sm" name={client.nickname || client.username} bg="teal.500" color="white" />
                    <Box>
                      <Text color="white">{client.nickname || client.username}</Text>
                      <Text color="gray.500" fontSize="xs">{client.username}</Text>
                    </Box>
                  </HStack>
                </Td>
                <Td color="gray.300" borderColor="gray.700" isNumeric>{client.age || '-'}</Td>
                <Td color="gray.300" borderColor="gray.700">{client.occupation || '-'}</Td>
                <Td borderColor="gray.700">
                  <Badge colorScheme="teal" borderRadius="md" px={2}>{client.serviceStage || '未开始'}</Badge>
                </Td>
                <Td borderColor="gray.700">
                  <Badge colorScheme={getCooperationColor(client.coachCooperation)} borderRadius="md" px={2}>
                    {client.coachCooperation || '-'}
                  </Badge>
                </Td>
                <Td color={getHeatColor(client.interactionHeat)} fontWeight="bold" borderColor="gray.700" isNumeric>
                  {client.interactionHeat?.toFixed(1) || '5.0'}
                </Td>
                <Td color="gray.300" borderColor="gray.700" isNumeric>{client.girlCount || 0}</Td>
                <Td borderColor="gray.700">
                  <Button size="sm" colorScheme="teal" variant="ghost" onClick={(e) => { e.stopPropagation(); viewClient(client); }}>
                    查看
                  </Button>
                </Td>
              </Tr>
            ))}
            {clientList.length === 0 && (
              <Tr><Td colSpan={8} textAlign="center" color="gray.500" py={8}>暂无客户，点击上方按钮新建</Td></Tr>
            )}
          </Tbody>
        </Table>
      </Card>

      {/* 新建客户弹窗 */}
      <Modal isOpen={isCreateOpen} onClose={onCreateClose} size="lg">
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg="gray.800" borderRadius="xl" border="1px solid" borderColor="gray.700">
          <ModalHeader borderBottom="1px solid" borderColor="gray.700" color="white">
            <HStack spacing={2}>
              <Box color="teal.400"><EditIcon /></Box>
              <Text>新建客户</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton color="gray.400" />
          <ModalBody py={6}>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FieldLabel fieldKey="username" isEditing={true} />
                <Input value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} placeholder="用于登录" bg="gray.700" color="white" border="1px solid" borderColor="gray.600" _hover={{ borderColor: 'gray.500' }} _focus={{ borderColor: 'teal.500', boxShadow: '0 0 0 1px var(--chakra-colors-teal-500)' }} />
              </FormControl>
              <FormControl isRequired>
                <FieldLabel fieldKey="password" isEditing={true} />
                <Input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder="登录密码" bg="gray.700" color="white" border="1px solid" borderColor="gray.600" _hover={{ borderColor: 'gray.500' }} _focus={{ borderColor: 'teal.500', boxShadow: '0 0 0 1px var(--chakra-colors-teal-500)' }} />
              </FormControl>
              <FormControl>
                <FieldLabel fieldKey="nickname" isEditing={true} />
                <Input value={formData.nickname} onChange={e => setFormData({...formData, nickname: e.target.value})} placeholder="客户昵称" bg="gray.700" color="white" border="1px solid" borderColor="gray.600" _hover={{ borderColor: 'gray.500' }} _focus={{ borderColor: 'teal.500', boxShadow: '0 0 0 1px var(--chakra-colors-teal-500)' }} />
              </FormControl>
              <FormControl>
                <FieldLabel fieldKey="phone" isEditing={true} />
                <Input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="联系方式" bg="gray.700" color="white" border="1px solid" borderColor="gray.600" _hover={{ borderColor: 'gray.500' }} _focus={{ borderColor: 'teal.500', boxShadow: '0 0 0 1px var(--chakra-colors-teal-500)' }} />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter borderTop="1px solid" borderColor="gray.700" gap={3}>
            <Button variant="ghost" color="gray.400" onClick={onCreateClose}>取消</Button>
            <Button colorScheme="teal" onClick={createClient} isLoading={creating} borderRadius="md">
              创建客户
            </Button>
</ModalFooter>
        </ModalContent>
      </Modal>

      {/* 文本导入弹窗 */}
      <Modal isOpen={isExtractOpen} onClose={onExtractClose} size="lg">
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg="gray.800" borderRadius="xl" border="1px solid" borderColor="gray.700">
          <ModalHeader borderBottom="1px solid" borderColor="gray.700" color="white">
            <HStack spacing={2}>
              <Box color="teal.400"><EditIcon /></Box>
              <Text>从文本导入客户档案</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton color="gray.400" />
          <ModalBody py={6}>
            <VStack spacing={4} align="stretch">
              <Text color="gray.400" fontSize="sm">
                粘贴客户发来的自我介绍文本，系统将自动提取关键信息填充到档案中。
              </Text>
              <FormControl>
                <Textarea
                  value={extractText}
                  onChange={e => setExtractText(e.target.value)}
                  placeholder={`示例：\n我今年38岁，制造业老板，本科学历，年收入100-300万。身高175，微胖，戴眼镜，商务休闲风格。\n上海人，城市家庭，双亲健在，家庭和睦。ENFP性格，直接沟通，社交达人。\n认真找对象，想谈一段长期的恋爱。配合度高，学习能力强。资产A8水平。\n优点是有钱幽默真诚，缺点是情商低不太会聊天。稳健型节奏，喜欢独立女性。`}
                  bg="gray.700" color="white" border="1px solid" borderColor="gray.600"
                  _hover={{ borderColor: 'gray.500' }}
                  _focus={{ borderColor: 'teal.500', boxShadow: '0 0 0 1px var(--chakra-colors-teal-500)' }}
                  rows={10}
                  fontSize="sm"
                />
              </FormControl>
              <HStack justify="flex-end" spacing={3}>
                <Button variant="ghost" color="gray.400" onClick={onExtractClose}>取消</Button>
                <Button colorScheme="teal" onClick={handleExtractProfile} isLoading={extracting} borderRadius="md">
                  开始提取
                </Button>
              </HStack>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* 提取结果预览弹窗 */}
      <Modal isOpen={isPreviewOpen} onClose={handleCancelExtract} size="2xl">
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg="gray.800" borderRadius="xl" border="1px solid" borderColor="gray.700" maxH="85vh" overflow="auto">
          <ModalHeader borderBottom="1px solid" borderColor="gray.700" color="white">
            <HStack spacing={2}>
              <Box color="teal.400"><EditIcon /></Box>
              <Text>识别结果确认</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton color="gray.400" />
          <ModalBody py={6}>
            {extractedProfile && (
              <VStack spacing={4} align="stretch">
                {/* 基础信息 */}
                <Box>
                  <Text color="teal.400" fontWeight="bold" mb={2} fontSize="sm">基本信息</Text>
                  <SimpleGrid columns={2} spacing={3}>
                    {[
                      { label: '年龄', key: 'age' },
                      { label: '职业', key: 'occupation' },
                      { label: '学历', key: 'education' },
                      { label: '收入', key: 'income' },
                      { label: '身高', key: 'height' },
                      { label: '所在地', key: 'residence' },
                      { label: '籍贯', key: 'hometown' },
                    ].map(f => (
                      <HStack key={f.key} justify="space-between" bg={extractedProfile[f.key] ? 'gray.700' : 'gray.750'} p={2} borderRadius="md">
                        <Text color="gray.400" fontSize="xs">{f.label}</Text>
                        <Text color={extractedProfile[f.key] ? 'white' : 'gray.500'} fontSize="sm" fontWeight={extractedProfile[f.key] ? 'normal' : 'bold'}>
                          {extractedProfile[f.key] || '（未识别）'}
                        </Text>
                      </HStack>
                    ))}
                  </SimpleGrid>
                </Box>

                {/* 外貌资源 */}
                <Box>
                  <Text color="orange.400" fontWeight="bold" mb={2} fontSize="sm">外貌资源</Text>
                  <SimpleGrid columns={2} spacing={3}>
                    {[
                      { label: '外貌描述', key: 'appearance' },
                      { label: '穿着风格', key: 'dressingStyle' },
                    ].map(f => (
                      <HStack key={f.key} justify="space-between" bg={extractedProfile[f.key] ? 'gray.700' : 'gray.750'} p={2} borderRadius="md">
                        <Text color="gray.400" fontSize="xs">{f.label}</Text>
                        <Text color={extractedProfile[f.key] ? 'white' : 'gray.500'} fontSize="sm" fontWeight={extractedProfile[f.key] ? 'normal' : 'bold'}>
                          {extractedProfile[f.key] || '（未识别）'}
                        </Text>
                      </HStack>
                    ))}
                  </SimpleGrid>
                </Box>

                {/* 家庭背景 */}
                <Box>
                  <Text color="purple.400" fontWeight="bold" mb={2} fontSize="sm">家庭背景</Text>
                  <SimpleGrid columns={3} spacing={3}>
                    {[
                      { label: '家庭背景', key: 'familyBackground' },
                      { label: '家庭结构', key: 'familyStructure' },
                      { label: '家庭氛围', key: 'familyAtmosphere' },
                    ].map(f => (
                      <HStack key={f.key} justify="space-between" bg={extractedProfile[f.key] ? 'gray.700' : 'gray.750'} p={2} borderRadius="md">
                        <Text color="gray.400" fontSize="xs">{f.label}</Text>
                        <Text color={extractedProfile[f.key] ? 'white' : 'gray.500'} fontSize="sm" fontWeight={extractedProfile[f.key] ? 'normal' : 'bold'}>
                          {extractedProfile[f.key] || '（未识别）'}
                        </Text>
                      </HStack>
                    ))}
                  </SimpleGrid>
                </Box>

                {/* 性格画像 */}
                <Box>
                  <Text color="cyan.400" fontWeight="bold" mb={2} fontSize="sm">性格画像</Text>
                  <SimpleGrid columns={2} spacing={3}>
                    {[
                      { label: '性格/MBTI', key: 'personality' },
                      { label: '情绪稳定', key: 'emotionalStable' },
                      { label: '情商', key: 'eqLevel' },
                      { label: '沟通风格', key: 'communicationStyle' },
                      { label: '社交风格', key: 'socialStyle' },
                      { label: '幽默风格', key: 'humorStyle' },
                    ].map(f => (
                      <HStack key={f.key} justify="space-between" bg={extractedProfile[f.key] ? 'gray.700' : 'gray.750'} p={2} borderRadius="md">
                        <Text color="gray.400" fontSize="xs">{f.label}</Text>
                        <Text color={extractedProfile[f.key] ? 'white' : 'gray.500'} fontSize="sm" fontWeight={extractedProfile[f.key] ? 'normal' : 'bold'}>
                          {extractedProfile[f.key] || '（未识别）'}
                        </Text>
                      </HStack>
                    ))}
                  </SimpleGrid>
                </Box>

                {/* 情感状态 */}
                <Box>
                  <Text color="red.400" fontWeight="bold" mb={2} fontSize="sm">情感状态</Text>
                  <SimpleGrid columns={2} spacing={3}>
                    {[
                      { label: '婚恋态度', key: 'relationshipAttitude' },
                      { label: '婚史', key: 'marriageHistory' },
                      { label: '感情诉求', key: 'emotionalGoal' },
                      { label: '关系目标', key: 'relationshipGoal' },
                    ].map(f => (
                      <HStack key={f.key} justify="space-between" bg={extractedProfile[f.key] ? 'gray.700' : 'gray.750'} p={2} borderRadius="md">
                        <Text color="gray.400" fontSize="xs">{f.label}</Text>
                        <Text color={extractedProfile[f.key] ? 'white' : 'gray.500'} fontSize="sm" fontWeight={extractedProfile[f.key] ? 'normal' : 'bold'}>
                          {extractedProfile[f.key] || '（未识别）'}
                        </Text>
                      </HStack>
                    ))}
                  </SimpleGrid>
                </Box>

                {/* 价值评估 */}
                <Box>
                  <Text color="yellow.400" fontWeight="bold" mb={2} fontSize="sm">价值评估</Text>
                  <SimpleGrid columns={3} spacing={3}>
                    {[
                      { label: '学习能力', key: 'learningAbility' },
                      { label: '配合度', key: 'coachCooperation' },
                      { label: '资产级别', key: 'assetsLevel' },
                      { label: '客户类型', key: 'clientType' },
                      { label: '自尊水平', key: 'selfEsteemLevel' },
                      { label: '节奏偏好', key: 'pacePreference' },
                    ].map(f => (
                      <HStack key={f.key} justify="space-between" bg={extractedProfile[f.key] ? 'gray.700' : 'gray.750'} p={2} borderRadius="md">
                        <Text color="gray.400" fontSize="xs">{f.label}</Text>
                        <Text color={extractedProfile[f.key] ? 'white' : 'gray.500'} fontSize="sm" fontWeight={extractedProfile[f.key] ? 'normal' : 'bold'}>
                          {extractedProfile[f.key] || '（未识别）'}
                        </Text>
                      </HStack>
                    ))}
                  </SimpleGrid>
                </Box>

                {/* 优缺点 */}
                {(extractedProfile.strengths || extractedProfile.weaknesses) && (
                  <Box>
                    <Text color="gray.400" fontWeight="bold" mb={2} fontSize="sm">优缺点</Text>
                    <VStack spacing={2} align="stretch">
                      {extractedProfile.strengths && (
                        <Box bg="gray.700" p={2} borderRadius="md">
                          <Text color="gray.400" fontSize="xs">优点</Text>
                          <Text color="green.400" fontSize="sm">{extractedProfile.strengths}</Text>
                        </Box>
                      )}
                      {extractedProfile.weaknesses && (
                        <Box bg="gray.700" p={2} borderRadius="md">
                          <Text color="gray.400" fontSize="xs">缺点</Text>
                          <Text color="red.400" fontSize="sm">{extractedProfile.weaknesses}</Text>
                        </Box>
                      )}
                    </VStack>
                  </Box>
                )}

                {/* 备注 */}
                {extractedProfile.notes && (
                  <Box bg="gray.700" p={2} borderRadius="md">
                    <Text color="gray.400" fontSize="xs">备注</Text>
                    <Text color="gray.300" fontSize="sm">{extractedProfile.notes}</Text>
                  </Box>
                )}

                <HStack justify="flex-end" spacing={3} pt={2}>
                  <Button variant="ghost" color="gray.400" onClick={handleCancelExtract}>取消</Button>
                  <Button colorScheme="teal" onClick={handleConfirmExtract}>确认并填充</Button>
                </HStack>
              </VStack>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* 客户详情/编辑弹窗 */}
      <Modal isOpen={isOpen} onClose={onClose} size="5xl" scrollBehavior="outside">
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg="gray.800" borderRadius="xl" border="1px solid" borderColor="gray.700">
          <ModalHeader borderBottom="1px solid" borderColor="gray.700" pb={4}>
            <Flex justify="space-between" align="center">
              <HStack spacing={4}>
                <Avatar size="lg" name={selectedClient?.nickname || selectedClient?.username} bg="teal.500" color="white" />
                <Box>
                  <HStack spacing={2}>
                    <Text color="white" fontSize="xl" fontWeight="bold">{selectedClient?.nickname || selectedClient?.username}</Text>
                    <Badge colorScheme="teal" borderRadius="md">{selectedClient?.serviceStage}</Badge>
                  </HStack>
                  <Text color="gray.400" fontSize="sm">{selectedClient?.username}</Text>
                </Box>
              </HStack>
              <HStack spacing={4}>
                {/* 快速指标 */}
                <HStack spacing={6} bg="gray.750" px={4} py={2} borderRadius="lg">
                  <Box textAlign="center">
                    <Text color="gray.400" fontSize="xs">热度</Text>
                    <Text color={getHeatColor(selectedClient?.interactionHeat)} fontWeight="bold" fontSize="lg">
                      {selectedClient?.interactionHeat?.toFixed(1) || '5.0'}
                    </Text>
                  </Box>
                  <Divider orientation="vertical" h={8} borderColor="gray.600" />
                  <Box textAlign="center">
                    <Text color="gray.400" fontSize="xs">信任</Text>
                    <HStack spacing={1}>
                      {[1,2,3,4,5].map(i => (
                        <Box key={i} color={i <= (selectedClient?.trustLevel || 1) ? 'teal.400' : 'gray.600'}>●</Box>
                      ))}
                    </HStack>
                  </Box>
                  <Divider orientation="vertical" h={8} borderColor="gray.600" />
                  <Box textAlign="center">
                    <Text color="gray.400" fontSize="xs">女生</Text>
                    <Text color="white" fontWeight="bold" fontSize="lg">{selectedClient?.girlCount || 0}</Text>
                  </Box>
                </HStack>
                <Button size="md" colorScheme="teal" variant="outline" onClick={() => { startEdit(); onExtractOpen(); }} borderRadius="md">
                  从文本导入
                </Button>
                <Button size="md" colorScheme={isEditing ? 'green' : 'teal'} onClick={isEditing ? handleSave : startEdit} isLoading={saving} borderRadius="md" leftIcon={isEditing ? undefined : <EditIcon />}>
                  {isEditing ? '保存' : '编辑'}
                </Button>
              </HStack>
            </Flex>
          </ModalHeader>
          <ModalCloseButton color="gray.400" />
          <ModalBody py={4}>
            <Tabs colorScheme="teal" variant="enclosed">
              <TabList bg="gray.750" borderRadius="lg" p={1} overflowX="auto">
                <Tab _selected={{ bg: 'teal.600', color: 'white' }} color="gray.400" borderRadius="md" fontSize="sm">基础信息</Tab>
                <Tab _selected={{ bg: 'teal.600', color: 'white' }} color="gray.400" borderRadius="md" fontSize="sm">资源评估</Tab>
                <Tab _selected={{ bg: 'teal.600', color: 'white' }} color="gray.400" borderRadius="md" fontSize="sm">家庭背景</Tab>
                <Tab _selected={{ bg: 'teal.600', color: 'white' }} color="gray.400" borderRadius="md" fontSize="sm">性格画像</Tab>
                <Tab _selected={{ bg: 'teal.600', color: 'white' }} color="gray.400" borderRadius="md" fontSize="sm">情感状态</Tab>
                <Tab _selected={{ bg: 'teal.600', color: 'white' }} color="gray.400" borderRadius="md" fontSize="sm">学习能力</Tab>
                <Tab _selected={{ bg: 'orange.600', color: 'white' }} color="gray.400" borderRadius="md" fontSize="sm">代聊风格</Tab>
                <Tab _selected={{ bg: 'purple.600', color: 'white' }} color="gray.400" borderRadius="md" fontSize="sm">价值画像</Tab>
              </TabList>

              <TabPanels>
                {/* 基础信息 */}
                <TabPanel px={0} pt={4}>
                  <SimpleGrid columns={2} spacing={4}>
                    <FieldCard title="基本信息" icon={InfoIcon} colorScheme="teal">
                      <VStack spacing={3} align="stretch">
                        <FormControl>
                          <FieldLabel fieldKey="age" isEditing={isEditing} />
                          {isEditing ? (
                            <NumberInput value={formData.age} onChange={(_, v) => setFormData({...formData, age: v})} bg="gray.700" min={20} max={80}>
                              <NumberInputField color="white" />
                            </NumberInput>
                          ) : (
                            <Text color="white">{selectedClient?.age || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="occupation" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.occupation} onChange={e => setFormData({...formData, occupation: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {OCCUPATIONS.map(o => <option key={o} value={o}>{o}</option>)}
                            </Select>
                          ) : (
                            <Text color="white">{selectedClient?.occupation || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="education" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.education} onChange={e => setFormData({...formData, education: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {EDUCATIONS.map(e => <option key={e} value={e}>{e}</option>)}
                            </Select>
                          ) : (
                            <Text color="white">{selectedClient?.education || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="income" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.income} onChange={e => setFormData({...formData, income: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {BUDGET_RANGES.map(b => <option key={b} value={b}>{b}</option>)}
                            </Select>
                          ) : (
                            <Text color="white">{selectedClient?.income || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="height" isEditing={isEditing} />
                          {isEditing ? (
                            <NumberInput value={formData.height} onChange={(_, v) => setFormData({...formData, height: v})} bg="gray.700" min={150} max={200}>
                              <NumberInputField color="white" />
                            </NumberInput>
                          ) : (
                            <Text color="white">{selectedClient?.height ? selectedClient.height + 'cm' : '-'}</Text>
                          )}
                        </FormControl>
                      </VStack>
                    </FieldCard>
                    <FieldCard title="位置信息" icon={InfoIcon} colorScheme="cyan">
                      <VStack spacing={3} align="stretch">
                        <FormControl>
                          <FieldLabel fieldKey="residence" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.residence} onChange={e => setFormData({...formData, residence: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </Select>
                          ) : (
                            <Text color="white">{selectedClient?.residence || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="hometown" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.hometown} onChange={e => setFormData({...formData, hometown: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </Select>
                          ) : (
                            <Text color="white">{selectedClient?.hometown || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="source" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.source} onChange={e => setFormData({...formData, source: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {CLIENT_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                            </Select>
                          ) : (
                            <Text color="white">{selectedClient?.source || '-'}</Text>
                          )}
                        </FormControl>
                      </VStack>
                    </FieldCard>
                  </SimpleGrid>
                  <Box mt={4}>
                    <FieldCard title="匹配偏好" icon={HeartIcon} colorScheme="pink">
                      <SimpleGrid columns={2} spacing={4}>
                        <FormControl>
                          <FieldLabel fieldKey="matchPreferences" isEditing={isEditing} />
                          {isEditing ? (
                            <Textarea value={formData.matchPreferences} onChange={e => setFormData({...formData, matchPreferences: e.target.value})} bg="gray.700" rows={2} color="white" />
                          ) : (
                            <Text color="white">{selectedClient?.matchPreferences || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="dealbreakers" isEditing={isEditing} />
                          {isEditing ? (
                            <Textarea value={formData.dealbreakers} onChange={e => setFormData({...formData, dealbreakers: e.target.value})} bg="gray.700" rows={2} color="white" />
                          ) : (
                            <Text color="white">{selectedClient?.dealbreakers || '-'}</Text>
                          )}
                        </FormControl>
                      </SimpleGrid>
                    </FieldCard>
                  </Box>
                </TabPanel>

                {/* 资源评估 */}
                <TabPanel px={0} pt={4}>
                  <SimpleGrid columns={2} spacing={4}>
                    <FieldCard title="资产状况" icon={InfoIcon} colorScheme="green">
                      <VStack spacing={3} align="stretch">
                        <FormControl>
                          <FieldLabel fieldKey="assetsLevel" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.assetsLevel} onChange={e => setFormData({...formData, assetsLevel: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {ASSETS_LEVELS.map(a => <option key={a} value={a}>{a}</option>)}
                            </Select>
                          ) : (
                            <Text color="green.400" fontWeight="bold">{selectedClient?.assetsLevel || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="budgetRange" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.budgetRange} onChange={e => setFormData({...formData, budgetRange: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {BUDGET_RANGES.map(b => <option key={b} value={b}>{b}</option>)}
                            </Select>
                          ) : (
                            <Text color="white">{selectedClient?.budgetRange || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="timeInvestment" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.timeInvestment} onChange={e => setFormData({...formData, timeInvestment: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {TIME_INVESTMENTS.map(t => <option key={t} value={t}>{t}</option>)}
                            </Select>
                          ) : (
                            <Text color="white">{selectedClient?.timeInvestment || '-'}</Text>
                          )}
                        </FormControl>
                      </VStack>
                    </FieldCard>
                    <FieldCard title="服务状态" icon={InfoIcon} colorScheme="teal">
                      <VStack spacing={3} align="stretch">
                        <FormControl>
                          <FieldLabel fieldKey="serviceStage" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.serviceStage} onChange={e => setFormData({...formData, serviceStage: e.target.value})} bg="gray.700" color="white">
                              {SERVICE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                            </Select>
                          ) : (
                            <Badge colorScheme="teal">{selectedClient?.serviceStage || '背调'}</Badge>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="interactionHeat" isEditing={isEditing} />
                          {isEditing ? (
                            <NumberInput value={formData.interactionHeat} onChange={(_, v) => setFormData({...formData, interactionHeat: v})} bg="gray.700" min={1} max={10} step={0.1}>
                              <NumberInputField color="white" />
                            </NumberInput>
                          ) : (
                            <Text color={getHeatColor(selectedClient?.interactionHeat)} fontWeight="bold">
                              {selectedClient?.interactionHeat?.toFixed(1) || '5.0'}
                            </Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="trustLevel" isEditing={isEditing} />
                          {isEditing ? (
                            <NumberInput value={formData.trustLevel} onChange={(_, v) => setFormData({...formData, trustLevel: v})} bg="gray.700" min={1} max={5}>
                              <NumberInputField color="white" />
                            </NumberInput>
                          ) : (
                            <HStack spacing={1}>
                              {[1,2,3,4,5].map(i => (
                                <Box key={i} color={i <= (selectedClient?.trustLevel || 1) ? 'teal.400' : 'gray.600'}>●</Box>
                              ))}
                            </HStack>
                          )}
                        </FormControl>
                      </VStack>
                    </FieldCard>
                  </SimpleGrid>
                  <Box mt={4}>
                    <FieldCard title="能力评分" icon={InfoIcon} colorScheme="orange">
                      <SimpleGrid columns={2} spacing={4}>
                        <Box>
                          <FieldLabel fieldKey="emotionalStable" isEditing={isEditing} />
                          {isEditing ? (
                            <NumberInput value={formData.emotionalStable} onChange={(_, v) => setFormData({...formData, emotionalStable: v})} bg="gray.700" min={1} max={10}>
                              <NumberInputField color="white" />
                            </NumberInput>
                          ) : (
                            <ScoreIndicator label="情绪稳定" value={selectedClient?.emotionalStable || 0} />
                          )}
                        </Box>
                        <Box>
                          <FieldLabel fieldKey="eqLevel" isEditing={isEditing} />
                          {isEditing ? (
                            <NumberInput value={formData.eqLevel} onChange={(_, v) => setFormData({...formData, eqLevel: v})} bg="gray.700" min={1} max={10}>
                              <NumberInputField color="white" />
                            </NumberInput>
                          ) : (
                            <ScoreIndicator label="情商水平" value={selectedClient?.eqLevel || 0} />
                          )}
                        </Box>
                        <Box>
                          <FieldLabel fieldKey="commitmentWillingness" isEditing={isEditing} />
                          {isEditing ? (
                            <NumberInput value={formData.commitmentWillingness} onChange={(_, v) => setFormData({...formData, commitmentWillingness: v})} bg="gray.700" min={1} max={10}>
                              <NumberInputField color="white" />
                            </NumberInput>
                          ) : (
                            <ScoreIndicator label="承诺意愿" value={selectedClient?.commitmentWillingness || 0} colorScheme="purple" />
                          )}
                        </Box>
                        <Box>
                          <FieldLabel fieldKey="antiFrustrationLevel" isEditing={isEditing} />
                          {isEditing ? (
                            <NumberInput value={formData.antiFrustrationLevel} onChange={(_, v) => setFormData({...formData, antiFrustrationLevel: v})} bg="gray.700" min={1} max={10}>
                              <NumberInputField color="white" />
                            </NumberInput>
                          ) : (
                            <ScoreIndicator label="抗压能力" value={selectedClient?.antiFrustrationLevel || 0} colorScheme="red" />
                          )}
                        </Box>
                      </SimpleGrid>
                    </FieldCard>
                  </Box>
                </TabPanel>

                {/* 家庭背景 */}
                <TabPanel px={0} pt={4}>
                  <SimpleGrid columns={2} spacing={4}>
                    <FieldCard title="家庭状况" icon={InfoIcon} colorScheme="blue">
                      <VStack spacing={3} align="stretch">
                        <FormControl>
                          <FieldLabel fieldKey="familyBackground" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.familyBackground} onChange={e => setFormData({...formData, familyBackground: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {FAMILY_BACKGROUNDS.map(f => <option key={f} value={f}>{f}</option>)}
                            </Select>
                          ) : (
                            <Text color="white">{selectedClient?.familyBackground || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="familyStructure" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.familyStructure} onChange={e => setFormData({...formData, familyStructure: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {FAMILY_STRUCTURES.map(f => <option key={f} value={f}>{f}</option>)}
                            </Select>
                          ) : (
                            <Text color="white">{selectedClient?.familyStructure || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="familyAtmosphere" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.familyAtmosphere} onChange={e => setFormData({...formData, familyAtmosphere: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {FAMILY_ATMOSPHERES.map(f => <option key={f} value={f}>{f}</option>)}
                            </Select>
                          ) : (
                            <Text color="white">{selectedClient?.familyAtmosphere || '-'}</Text>
                          )}
                        </FormControl>
                      </VStack>
                    </FieldCard>
                    <FieldCard title="其他信息" icon={InfoIcon} colorScheme="gray">
                      <VStack spacing={3} align="stretch">
                        <FormControl>
                          <FieldLabel fieldKey="familyBurden" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.familyBurden} onChange={e => setFormData({...formData, familyBurden: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {FAMILY_BURDENS.map(f => <option key={f} value={f}>{f}</option>)}
                            </Select>
                          ) : (
                            <Text color="white">{selectedClient?.familyBurden || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="familyMembers" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.familyMembers} onChange={e => setFormData({...formData, familyMembers: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {FAMILY_MEMBERS_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                            </Select>
                          ) : (
                            <Text color="white">{selectedClient?.familyMembers || '-'}</Text>
                          )}
                        </FormControl>
                      </VStack>
                    </FieldCard>
                  </SimpleGrid>
                </TabPanel>

                {/* 性格画像 */}
                <TabPanel px={0} pt={4}>
                  <SimpleGrid columns={2} spacing={4}>
                    <FieldCard title="性格特征" icon={InfoIcon} colorScheme="purple">
                      <VStack spacing={3} align="stretch">
                        <FormControl>
                          <FieldLabel fieldKey="personality" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.personality} onChange={e => setFormData({...formData, personality: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {PERSONALITY_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                            </Select>
                          ) : (
                            <Text color="purple.300" fontWeight="bold">{selectedClient?.personality || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="communicationStyle" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.communicationStyle} onChange={e => setFormData({...formData, communicationStyle: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {COMMUNICATION_STYLES.map(c => <option key={c} value={c}>{c}</option>)}
                            </Select>
                          ) : (
                            <Text color="white">{selectedClient?.communicationStyle || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="socialStyle" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.socialStyle} onChange={e => setFormData({...formData, socialStyle: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {SOCIAL_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                            </Select>
                          ) : (
                            <Text color="white">{selectedClient?.socialStyle || '-'}</Text>
                          )}
                        </FormControl>
                      </VStack>
                    </FieldCard>
                    <FieldCard title="情绪能力" icon={InfoIcon} colorScheme="orange">
                      <VStack spacing={3} align="stretch">
                        <FormControl>
                          <FieldLabel fieldKey="emotionalStable" isEditing={isEditing} />
                          {isEditing ? (
                            <NumberInput value={formData.emotionalStable} onChange={(_, v) => setFormData({...formData, emotionalStable: v})} bg="gray.700" min={1} max={10}>
                              <NumberInputField color="white" />
                            </NumberInput>
                          ) : (
                            <ScoreIndicator label="情绪稳定" value={selectedClient?.emotionalStable || 0} />
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="eqLevel" isEditing={isEditing} />
                          {isEditing ? (
                            <NumberInput value={formData.eqLevel} onChange={(_, v) => setFormData({...formData, eqLevel: v})} bg="gray.700" min={1} max={10}>
                              <NumberInputField color="white" />
                            </NumberInput>
                          ) : (
                            <ScoreIndicator label="情商水平" value={selectedClient?.eqLevel || 0} />
                          )}
                        </FormControl>
                      </VStack>
                    </FieldCard>
                  </SimpleGrid>
                </TabPanel>

                {/* 情感状态 */}
                <TabPanel px={0} pt={4}>
                  <SimpleGrid columns={2} spacing={4}>
                    <FieldCard title="婚恋态度" icon={HeartIcon} colorScheme="pink">
                      <VStack spacing={3} align="stretch">
                        <FormControl>
                          <FieldLabel fieldKey="relationshipAttitude" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.relationshipAttitude} onChange={e => setFormData({...formData, relationshipAttitude: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {RELATIONSHIP_ATTITUDES.map(r => <option key={r} value={r}>{r}</option>)}
                            </Select>
                          ) : (
                            <Badge colorScheme={selectedClient?.relationshipAttitude === '认真' ? 'green' : 'orange'}>{selectedClient?.relationshipAttitude || '-'}</Badge>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="marriageHistory" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.marriageHistory} onChange={e => setFormData({...formData, marriageHistory: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {MARRIAGE_HISTORIES.map(m => <option key={m} value={m}>{m}</option>)}
                            </Select>
                          ) : (
                            <Text color="white">{selectedClient?.marriageHistory || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="emotionalGoal" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.emotionalGoal} onChange={e => setFormData({...formData, emotionalGoal: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {EMOTIONAL_GOALS.map(g => <option key={g} value={g}>{g}</option>)}
                            </Select>
                          ) : (
                            <Text color="pink.300">{selectedClient?.emotionalGoal || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="relationshipGoal" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.relationshipGoal} onChange={e => setFormData({...formData, relationshipGoal: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {RELATIONSHIP_GOALS.map(g => <option key={g} value={g}>{g}</option>)}
                            </Select>
                          ) : (
                            <Text color="white">{selectedClient?.relationshipGoal || '-'}</Text>
                          )}
                        </FormControl>
                      </VStack>
                    </FieldCard>
                    <FieldCard title="情感历史" icon={InfoIcon} colorScheme="red">
                      <VStack spacing={3} align="stretch">
                        <FormControl>
                          <FieldLabel fieldKey="pastRelationshipSummary" isEditing={isEditing} />
                          {isEditing ? (
                            <Textarea value={formData.pastRelationshipSummary} onChange={e => setFormData({...formData, pastRelationshipSummary: e.target.value})} bg="gray.700" rows={2} color="white" />
                          ) : (
                            <Text color="white">{selectedClient?.pastRelationshipSummary || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="emotionalWounds" isEditing={isEditing} />
                          {isEditing ? (
                            <Textarea value={formData.emotionalWounds} onChange={e => setFormData({...formData, emotionalWounds: e.target.value})} bg="gray.700" rows={2} color="white" />
                          ) : (
                            <Text color="red.300">{selectedClient?.emotionalWounds || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="exPartnerTaboos" isEditing={isEditing} />
                          {isEditing ? (
                            <Input value={formData.exPartnerTaboos} onChange={e => setFormData({...formData, exPartnerTaboos: e.target.value})} bg="gray.700" color="white" />
                          ) : (
                            <Text color="white">{selectedClient?.exPartnerTaboos || '-'}</Text>
                          )}
                        </FormControl>
                      </VStack>
                    </FieldCard>
                  </SimpleGrid>
                  <Box mt={4}>
                    <FieldCard title="认知评估" icon={InfoIcon} colorScheme="cyan">
                      <SimpleGrid columns={2} spacing={4}>
                        <FormControl>
                          <FieldLabel fieldKey="selfValuePerception" isEditing={isEditing} />
                          {isEditing ? (
                            <Input value={formData.selfValuePerception} onChange={e => setFormData({...formData, selfValuePerception: e.target.value})} bg="gray.700" color="white" />
                          ) : (
                            <Text color="white">{selectedClient?.selfValuePerception || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="cognitiveAccuracy" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.cognitiveAccuracy} onChange={e => setFormData({...formData, cognitiveAccuracy: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {COGNITIVE_ACCURACIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </Select>
                          ) : (
                            <Badge colorScheme={selectedClient?.cognitiveAccuracy === '准确' ? 'green' : selectedClient?.cognitiveAccuracy === '高估' ? 'red' : 'gray'}>{selectedClient?.cognitiveAccuracy || '-'}</Badge>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="emotionalMaturity" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.emotionalMaturity} onChange={e => setFormData({...formData, emotionalMaturity: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {EMOTIONAL_MATURITIES.map(m => <option key={m} value={m}>{m}</option>)}
                            </Select>
                          ) : (
                            <Text color="white">{selectedClient?.emotionalMaturity || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="comfortZone" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.comfortZone} onChange={e => setFormData({...formData, comfortZone: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {COMFORT_ZONES.map(c => <option key={c} value={c}>{c}</option>)}
                            </Select>
                          ) : (
                            <Text color="white">{selectedClient?.comfortZone || '-'}</Text>
                          )}
                        </FormControl>
                      </SimpleGrid>
                    </FieldCard>
                  </Box>
                </TabPanel>

                {/* 学习能力 */}
                <TabPanel px={0} pt={4}>
                  <SimpleGrid columns={3} spacing={4}>
                    <FieldCard title="学习特征" icon={InfoIcon} colorScheme="blue">
                      <VStack spacing={3} align="stretch">
                        <FormControl>
                          <FieldLabel fieldKey="learningAbility" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.learningAbility} onChange={e => setFormData({...formData, learningAbility: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {LEARNING_ABILITIES.map(l => <option key={l} value={l}>{l}</option>)}
                            </Select>
                          ) : (
                            <Badge colorScheme={selectedClient?.learningAbility === '强' ? 'green' : selectedClient?.learningAbility === '弱' ? 'red' : 'yellow'}>{selectedClient?.learningAbility || '-'}</Badge>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="coachCooperation" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.coachCooperation} onChange={e => setFormData({...formData, coachCooperation: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {COOPERATION_LEVELS.map(c => <option key={c} value={c}>{c}</option>)}
                            </Select>
                          ) : (
                            <Badge colorScheme={getCooperationColor(selectedClient?.coachCooperation)}>{selectedClient?.coachCooperation || '-'}</Badge>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="feedbackQuality" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.feedbackQuality} onChange={e => setFormData({...formData, feedbackQuality: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {FEEDBACK_QUALITIES.map(f => <option key={f} value={f}>{f}</option>)}
                            </Select>
                          ) : (
                            <Text color="white">{selectedClient?.feedbackQuality || '-'}</Text>
                          )}
                        </FormControl>
                      </VStack>
                    </FieldCard>
                    <FieldCard title="阶段进度" icon={InfoIcon} colorScheme="teal">
                      <VStack spacing={3} align="stretch">
                        <FormControl>
                          <FieldLabel fieldKey="currentStage" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.currentStage} onChange={e => setFormData({...formData, currentStage: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {STAGE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </Select>
                          ) : (
                            <Badge colorScheme="orange">{selectedClient?.currentStage || '-'}</Badge>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="stageProgress" isEditing={isEditing} />
                          {isEditing ? (
                            <NumberInput value={formData.stageProgress} onChange={(_, v) => setFormData({...formData, stageProgress: v})} bg="gray.700" min={0} max={100}>
                              <NumberInputField color="white" />
                            </NumberInput>
                          ) : (
                            <Box>
                              <Text color="white">{selectedClient?.stageProgress || 0}%</Text>
                              <Progress value={selectedClient?.stageProgress || 0} size="sm" colorScheme="teal" bg="gray.700" borderRadius="full" mt={1} />
                            </Box>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="lastMilestone" isEditing={isEditing} />
                          {isEditing ? (
                            <Input value={formData.lastMilestone} onChange={e => setFormData({...formData, lastMilestone: e.target.value})} bg="gray.700" color="white" />
                          ) : (
                            <Text color="white">{selectedClient?.lastMilestone || '-'}</Text>
                          )}
                        </FormControl>
                      </VStack>
                    </FieldCard>
                    <FieldCard title="投入意愿" icon={InfoIcon} colorScheme="green">
                      <VStack spacing={3} align="stretch">
                        <FormControl>
                          <FieldLabel fieldKey="investmentWillingness" isEditing={isEditing} />
                          {isEditing ? (
                            <Input value={formData.investmentWillingness} onChange={e => setFormData({...formData, investmentWillingness: e.target.value})} bg="gray.700" color="white" />
                          ) : (
                            <Text color="white">{selectedClient?.investmentWillingness || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="pacePreference" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.pacePreference} onChange={e => setFormData({...formData, pacePreference: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {PACE_PREFERENCES.map(p => <option key={p} value={p}>{p}</option>)}
                            </Select>
                          ) : (
                            <Text color="white">{selectedClient?.pacePreference || '-'}</Text>
                          )}
                        </FormControl>
                      </VStack>
                    </FieldCard>
                  </SimpleGrid>
                </TabPanel>

                {/* 代聊风格 */}
                <TabPanel px={0} pt={4}>
                  <SimpleGrid columns={2} spacing={4}>
                    <FieldCard title="互动风格" icon={InfoIcon} colorScheme="orange">
                      <VStack spacing={3} align="stretch">
                        <FormControl>
                          <FieldLabel fieldKey="interactionStyle" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.interactionStyle} onChange={e => setFormData({...formData, interactionStyle: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              <option value="主动型">主动型</option>
                              <option value="调理型">调理型</option>
                              <option value="细腻型">细腻型</option>
                            </Select>
                          ) : (
                            <Text color="white">{selectedClient?.interactionStyle || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="pacePreference" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.pacePreference} onChange={e => setFormData({...formData, pacePreference: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {PACE_PREFERENCES.map(p => <option key={p} value={p}>{p}</option>)}
                            </Select>
                          ) : (
                            <Text color="white">{selectedClient?.pacePreference || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="humorStyle" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.humorStyle} onChange={e => setFormData({...formData, humorStyle: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {HUMOR_STYLES.map(h => <option key={h} value={h}>{h}</option>)}
                            </Select>
                          ) : (
                            <Text color="white">{selectedClient?.humorStyle || '-'}</Text>
                          )}
                        </FormControl>
                      </VStack>
                    </FieldCard>
                    <FieldCard title="心理特征" icon={InfoIcon} colorScheme="purple">
                      <VStack spacing={3} align="stretch">
                        <FormControl>
                          <FieldLabel fieldKey="selfEsteemLevel" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.selfEsteemLevel} onChange={e => setFormData({...formData, selfEsteemLevel: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {SELF_ESTEEM_LEVELS.map(s => <option key={s} value={s}>{s}</option>)}
                            </Select>
                          ) : (
                            <Badge colorScheme={selectedClient?.selfEsteemLevel === '高' ? 'green' : selectedClient?.selfEsteemLevel === '低' ? 'red' : 'yellow'}>{selectedClient?.selfEsteemLevel || '-'}</Badge>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="antiFrustrationLevel" isEditing={isEditing} />
                          {isEditing ? (
                            <NumberInput value={formData.antiFrustrationLevel} onChange={(_, v) => setFormData({...formData, antiFrustrationLevel: v})} bg="gray.700" min={1} max={10}>
                              <NumberInputField color="white" />
                            </NumberInput>
                          ) : (
                            <ScoreIndicator label="抗压能力" value={selectedClient?.antiFrustrationLevel || 0} colorScheme="red" />
                          )}
                        </FormControl>
                      </VStack>
                    </FieldCard>
                  </SimpleGrid>
                  <Box mt={4}>
                    <FieldCard title="代聊配置" icon={InfoIcon} colorScheme="cyan">
                      <SimpleGrid columns={2} spacing={4}>
                        <FormControl>
                          <FieldLabel fieldKey="openingTemplates" isEditing={isEditing} />
                          {isEditing ? (
                            <Textarea value={formData.openingTemplates} onChange={e => setFormData({...formData, openingTemplates: e.target.value})} bg="gray.700" rows={2} color="white" />
                          ) : (
                            <Text color="gray.300" fontSize="sm" fontFamily="mono">{selectedClient?.openingTemplates || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="petPhrases" isEditing={isEditing} />
                          {isEditing ? (
                            <Textarea value={formData.petPhrases} onChange={e => setFormData({...formData, petPhrases: e.target.value})} bg="gray.700" rows={2} color="white" />
                          ) : (
                            <Text color="gray.300" fontSize="sm" fontFamily="mono">{selectedClient?.petPhrases || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="chatTaboos" isEditing={isEditing} />
                          {isEditing ? (
                            <Textarea value={formData.chatTaboos} onChange={e => setFormData({...formData, chatTaboos: e.target.value})} bg="gray.700" rows={2} color="white" />
                          ) : (
                            <Text color="red.300" fontSize="sm">{selectedClient?.chatTaboos || '-'}</Text>
                          )}
                        </FormControl>
                      </SimpleGrid>
                    </FieldCard>
                  </Box>
                </TabPanel>

                {/* 价值画像 */}
                <TabPanel px={0} pt={4}>
                  <SimpleGrid columns={2} spacing={4}>
                    <FieldCard title="价值评估" icon={InfoIcon} colorScheme="green">
                      <VStack spacing={3} align="stretch">
                        <FormControl>
                          <FieldLabel fieldKey="strengths" isEditing={isEditing} />
                          {isEditing ? (
                            <Input value={formData.strengths} onChange={e => setFormData({...formData, strengths: e.target.value})} bg="gray.700" color="white" />
                          ) : (
                            <HStack spacing={2} flexWrap="wrap">
                              {selectedClient?.strengths?.split('/').filter(Boolean).map((s, i) => (
                                <Badge key={i} colorScheme="green" borderRadius="full" px={2}>{s.trim()}</Badge>
                              )) || '-'}
                            </HStack>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="weaknesses" isEditing={isEditing} />
                          {isEditing ? (
                            <Input value={formData.weaknesses} onChange={e => setFormData({...formData, weaknesses: e.target.value})} bg="gray.700" color="white" />
                          ) : (
                            <HStack spacing={2} flexWrap="wrap">
                              {selectedClient?.weaknesses?.split('/').filter(Boolean).map((w, i) => (
                                <Badge key={i} colorScheme="red" borderRadius="full" px={2}>{w.trim()}</Badge>
                              )) || '-'}
                            </HStack>
                          )}
                        </FormControl>
                      </VStack>
                    </FieldCard>
                    <FieldCard title="客户类型" icon={InfoIcon} colorScheme="purple">
                      <VStack spacing={3} align="stretch">
                        <FormControl>
                          <FieldLabel fieldKey="clientType" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.clientType} onChange={e => setFormData({...formData, clientType: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {CLIENT_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
                            </Select>
                          ) : (
                            <Badge colorScheme="purple">{selectedClient?.clientType || '-'}</Badge>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="appearance" isEditing={isEditing} />
                          {isEditing ? (
                            <Textarea value={formData.appearance} onChange={e => setFormData({...formData, appearance: e.target.value})} bg="gray.700" rows={2} color="white" />
                          ) : (
                            <Text color="gray.300" fontSize="sm">{selectedClient?.appearance || '-'}</Text>
                          )}
                        </FormControl>
                        <FormControl>
                          <FieldLabel fieldKey="dressingStyle" isEditing={isEditing} />
                          {isEditing ? (
                            <Select value={formData.dressingStyle} onChange={e => setFormData({...formData, dressingStyle: e.target.value})} bg="gray.700" color="white">
                              <option value="">选择</option>
                              {DRESSING_STYLES.map(d => <option key={d} value={d}>{d}</option>)}
                            </Select>
                          ) : (
                            <Text color="gray.300">{selectedClient?.dressingStyle || '-'}</Text>
                          )}
                        </FormControl>
                      </VStack>
                    </FieldCard>
                  </SimpleGrid>
                  <Box mt={4}>
                    <FieldCard title="备注" icon={InfoIcon} colorScheme="gray">
                      <FormControl>
                        <FieldLabel fieldKey="notes" isEditing={isEditing} />
                        {isEditing ? (
                          <Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} bg="gray.700" rows={3} color="white" />
                        ) : (
                          <Text color="gray.300" whiteSpace="pre-wrap">{selectedClient?.notes || '-'}</Text>
                        )}
                      </FormControl>
                    </FieldCard>
                  </Box>
                </TabPanel>
              </TabPanels>
            </Tabs>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}
