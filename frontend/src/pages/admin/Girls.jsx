import { useEffect, useState, useRef } from 'react';
import {
  Box, Heading, Card, CardBody, Table, Thead, Tbody, Tr, Th, Td, Button, Badge, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalBody, ModalCloseButton, useDisclosure, SimpleGrid, FormControl, FormLabel, Input, Select,
  Textarea, NumberInput, NumberInputField, VStack, HStack, Image, Text, Divider, Flex, useToast, Checkbox,
  Accordion, AccordionItem, AccordionButton, AccordionPanel, AccordionIcon, Tabs, TabList, TabPanels, Tab, TabPanel, Icon, IconButton, Spinner, Switch
} from '@chakra-ui/react';
import { FiX, FiArrowRight, FiAlertTriangle } from 'react-icons/fi';
import { girls, clients, chatScreenshots, alerts as alertsApi } from '../../utils/api';
import { captureError } from '../../utils/frontendErrorCapture';
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
const DIET_RESTRICTIONS = ['不吃辣', '不吃香菜', '海鲜过敏', '酒精过敏', '坚果过敏', '不吃羊肉', '不吃猪肉', '不吃牛肉', '麸质过敏', '素食主义', '清真', '糖尿病/控糖', '其他'];
const BODY_TYPES = ['偏瘦', '标准', '微胖', '偏胖'];
const MAJOR_CATEGORIES = ['计算机/互联网', '金融/经济', '法律', '医学', '教育', '工程', '艺术/设计', '传媒', '语言', '管理', '其他'];
const CITIES = ['北京', '上海', '广州', '深圳', '杭州', '南京', '苏州', '成都', '重庆', '武汉', '西安', '天津', '长沙', '郑州', '东莞', '佛山', '青岛', '沈阳', '大连', '厦门', '宁波', '其他'];

// M007 S01: 关系阶段
const RELATIONSHIP_STAGES = [
  { value: 'EXPLORATION', label: '探索期', color: 'gray', desc: '刚认识，以日常寒暄为主' },
  { value: 'FLIRTING', label: '暧昧期', color: 'pink', desc: '有明显兴趣信号，但未正式确认' },
  { value: 'ADVANCEMENT', label: '推进期', color: 'orange', desc: '主动升级，经常约会，感情话题' },
  { value: 'CONFIRMATION', label: '确认期', color: 'green', desc: '有意愿，表白或确认关系' },
  { value: 'STABLE', label: '稳定期', color: 'blue', desc: '关系确立，进入长期维护' }
];

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
  // AI 识别待确认字段
  const [pendingFields, setPendingFields] = useState({}); // { key: { label, value } }
  const [confirmSelections, setConfirmSelections] = useState({}); // { key: bool }
  const { isOpen: isConfirmOpen, onOpen: onConfirmOpen, onClose: onConfirmClose } = useDisclosure();
  const fileInputRef = useRef();
  // 朋友圈截图
  const [momentScreenshots, setMomentScreenshots] = useState([]);
  const [momentNotes, setMomentNotes] = useState('');
  const [uploadingMoment, setUploadingMoment] = useState(false);
  const [analyzingMoment, setAnalyzingMoment] = useState(false);
  const [selectedClientQuota, setSelectedClientQuota] = useState(null); // { quota, count }
  const [momentAiResult, setMomentAiResult] = useState('');
  const [previewMomentImage, setPreviewMomentImage] = useState('');
  const momentFileRef = useRef(null);

  // M007 S01: 关系阶段状态
  const [stageHistory, setStageHistory] = useState([]);
  const [stageEvaluating, setStageEvaluating] = useState(false);
  const [stageEvalResult, setStageEvalResult] = useState(null);
  const [stageReason, setStageReason] = useState('');

  // M007 S02: 预警数据
  const [girlAlerts, setGirlAlerts] = useState({}); // { [girlId]: [alert, ...] }

  // M007 S03: 反撇分析状态
  const [reversalRisk, setReversalRisk] = useState(null);
  const [reversalAnalysis, setReversalAnalysis] = useState(null);
  const [reversalAnalyzing, setReversalAnalyzing] = useState(false);

  const toast = useToast();

  // 搜索和过滤状态
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterClientId, setFilterClientId] = useState('');

  const loadGirls = async () => {
    try {
      const res = await girls.list();
      if (res.success) {
        setGirlsList(res.girls);
      }
    } catch (e) {
      captureError(e);
    }
  };

  const loadClients = async () => {
    try {
      const res = await clients.list();
      if (res.success) {
        setClientList(res.clients);
      }
    } catch (e) {
      captureError(e);
    }
  };

  useEffect(() => {
    loadGirls();
    loadClients();
    // M007 S02: 加载预警数据
    alertsApi.list({ status: 'active' }).then(res => {
      if (res.success && res.alerts) {
        const grouped = {};
        res.alerts.forEach(a => {
          if (a.girlId) {
            if (!grouped[a.girlId]) grouped[a.girlId] = [];
            grouped[a.girlId].push(a);
          }
        });
        setGirlAlerts(grouped);
      }
    }).catch(() => {});
  }, []);

  function getInitialFormData() {
    return {
      // 基础信息
      clientId: '', name: '', age: '', occupation: '', education: '', major: '',
      hometown: '', residence: '', workplace: '',
      // 外貌特征
      appearance: '', height: '', bodyType: '', photos: '', styleTags: '',
      // 家庭背景
      familyBackground: '', familyAtmosphere: '', familyBurden: '', familyComments: '',
      // 生活状态
      workSchedule: '', socialActivity: '', financialHabits: '',
      // 兴趣爱好
      interests: '', dietPreferences: '', dietRestrictions: '', hobbiesDetail: '',
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
      relationshipStage: '', lastContact: '', responsePattern: '',
      // 上下文记忆（JSON字符串）
      signals: '', pendingActions: '', observations: '', conversationSummary: '',
      // AI战略分析
      bestApproach: '', recommendedTopics: '', upgradeConditions: '', estimatedTimeline: '',
      riskFactors: '', strategicNotes: '',
      // AI画像
      empathy: '', selfAwareness: '', communication: '', relationship: '', conflictRes: '',
      chatPartnerId: '',
      // 匹配相关
      matchScore: '', matchScoreBasis: '', matePreferences: '',
      // 元数据
      sourcePlatform: '', homepageUrl: '', videos: '', notes: ''
    };
  }

  // 切换客户时更新配额信息
  const handleClientChange = (clientId) => {
    setFormData({...formData, clientId});
    if (clientId) {
      const c = clientList.find(x => x.id === clientId);
      if (c) {
        setSelectedClientQuota({ quota: c.girlQuota || 10, count: c.girlCount || 0 });
      }
    } else {
      setSelectedClientQuota(null);
    }
  };

  const loadScreenshots = async (girlId) => {
    try {
      const res = await chatScreenshots.byGirl(girlId);
      if (res.success) {
        setScreenshots(res.screenshots);
      }
    } catch (e) {
      captureError(e);
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
    // 加载朋友圈截图
    setMomentScreenshots(girl.momentPhotos ? JSON.parse(girl.momentPhotos) : []);
    setMomentAiResult('');
    // M007 S01: 加载关系阶段历史
    setStageEvalResult(null);
    setStageReason('');
    try {
      const res = await girls.getStageHistory(girl.id);
      if (res.success) setStageHistory(res.history || []);
    } catch { setStageHistory([]); }
    // M007 S03: 加载反撇风险
    setReversalAnalysis(null);
    setReversalRisk(null);
    try {
      const riskRes = await girls.getReversalRisk(girl.id);
      if (riskRes.success) setReversalRisk(riskRes);
    } catch {}
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
      height: girl.height || '',
      bodyType: girl.bodyType || '',
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
      dietRestrictions: girl.dietRestrictions || '',
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
      relationshipStage: girl.relationshipStage || '',
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
      matchScoreBasis: girl.matchScoreBasis || '',
      matePreferences: girl.matePreferences || '',
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
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  };

  const handleSubmit = async () => {
    try {
      const data = { ...formData };
      if (data.age) data.age = parseInt(data.age);
      else data.age = undefined;
      if (data.height) data.height = parseInt(data.height);
      else data.height = undefined;
      if (data.intimacyLevel) data.intimacyLevel = parseInt(data.intimacyLevel);
      if (data.tensionScore) data.tensionScore = parseFloat(data.tensionScore);
      // M007 S01: relationshipStage 为空时删除该字段
      if (data.relationshipStage === '') data.relationshipStage = undefined;
      // JSON字段处理
      if (data.signals && !data.signals.startsWith('[')) data.signals = '';
      if (data.pendingActions && !data.pendingActions.startsWith('[')) data.pendingActions = '';
      if (data.observations && !data.observations.startsWith('[')) data.observations = '';
      // photos/videos: comma-separated to JSON array
      if (data.photos) {
        data.photos = JSON.stringify((data.photos || '').split(',').map(s => s.trim()).filter(Boolean));
      }
      if (data.videos) {
        data.videos = JSON.stringify((data.videos || '').split(',').map(s => s.trim()).filter(Boolean));
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
      captureError(e);
      const msg = e?.response?.data?.error || '';
      if (msg.includes('额度') || msg.includes('配额')) {
        toast({ title: msg, status: 'warning', duration: 4000 });
      } else {
        toast({ title: '保存失败', status: 'error', duration: 2000 });
      }
    }
  };

  const deleteGirl = async (id) => {
    if (!confirm('确定删除?')) return;
    try {
      await girls.delete(id);
      loadGirls();
    } catch (e) {
      captureError(e);
    }
  };

  // M007 S01: 关系阶段评估
  const handleEvaluateStage = async (girl) => {
    setStageEvaluating(true);
    setStageEvalResult(null);
    setStageReason('');
    try {
      const res = await girls.evaluateStage(girl.id);
      if (res.success) {
        setStageEvalResult(res.evaluation);
        toast({ title: '评估完成', status: 'info', duration: 2000 });
      } else {
        toast({ title: res.error || '评估失败', status: 'error', duration: 3000 });
      }
    } catch (e) {
      captureError(e);
      toast({ title: '评估失败', status: 'error', duration: 3000 });
    }
    setStageEvaluating(false);
  };

  // M007 S01: 设置关系阶段
  const handleSetRelationshipStage = async (girl, stage, reason) => {
    try {
      const res = await girls.setRelationshipStage(girl.id, { stage, reason, source: 'manual' });
      if (res.success) {
        // 更新 selectedGirl 和本地列表
        const updated = { ...girl, relationshipStage: stage };
        setSelectedGirl(updated);
        // 刷新历史
        const histRes = await girls.getStageHistory(girl.id);
        if (histRes.success) setStageHistory(histRes.history || []);
        // 刷新列表中的阶段
        setGirlsList(prev => prev.map(g => g.id === girl.id ? updated : g));
        setStageEvalResult(null);
        setStageReason('');
        toast({ title: '阶段已更新', status: 'success', duration: 2000 });
      } else {
        toast({ title: res.error || '设置失败', status: 'error', duration: 3000 });
      }
    } catch (e) {
      captureError(e);
      toast({ title: '设置失败', status: 'error', duration: 3000 });
    }
  };

  // M007 S03: 触发反撇分析
  const handleAnalyzeReversal = async () => {
    if (!selectedGirl) return;
    setReversalAnalyzing(true);
    setReversalAnalysis(null);
    try {
      const res = await girls.analyzeReversal(selectedGirl.id);
      if (res.success) {
        setReversalAnalysis(res.analysis);
        toast({ title: '反撇分析完成', status: 'info', duration: 2000 });
      } else {
        toast({ title: res.error || '分析失败', status: 'error', duration: 3000 });
      }
    } catch (e) {
      captureError(e);
      toast({ title: '分析失败', status: 'error', duration: 3000 });
    }
    setReversalAnalyzing(false);
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
        // 如果有识别出的字段，弹出确认框
        if (res.extractedFields && Object.keys(res.extractedFields).length > 0) {
          setPendingFields(res.extractedFields);
          // 默认全选
          const defaults = {};
          Object.keys(res.extractedFields).forEach(k => { defaults[k] = true; });
          setConfirmSelections(defaults);
          onConfirmOpen();
        }
      } else {
        toast({ title: res.error || '上传失败', status: 'error', duration: 2000 });
      }
    } catch (e) {
      captureError(e);
      toast({ title: '上传失败', status: 'error', duration: 2000 });
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmFields = async () => {
    // 只提交用户选中的字段
    const selected = {};
    for (const [key, checked] of Object.entries(confirmSelections)) {
      if (checked && pendingFields[key]) {
        selected[key] = pendingFields[key].value;
      }
    }
    if (Object.keys(selected).length === 0) {
      toast({ title: '未选择任何字段', status: 'warning', duration: 2000 });
      onConfirmClose();
      return;
    }
    try {
      const res = await chatScreenshots.confirmFields(selectedGirl.id, selected);
      if (res.success) {
        toast({ title: '信息已更新', status: 'success', duration: 2000 });
        loadGirls();
      } else {
        toast({ title: res.error || '确认失败', status: 'error', duration: 2000 });
      }
    } catch (e) {
      captureError(e);
      toast({ title: '确认失败', status: 'error', duration: 2000 });
    } finally {
      onConfirmClose();
      setPendingFields({});
      setConfirmSelections({});
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
      captureError(e);
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
      captureError(e);
    }
  };

  const handleDeleteScreenshot = async (screenshotId) => {
    if (!confirm('确定删除该截图?')) return;
    try {
      await chatScreenshots.delete(screenshotId);
      await loadScreenshots(selectedGirl.id);
      toast({ title: '已删除', status: 'success', duration: 1500 });
    } catch (e) {
      captureError(e);
    }
  };

  // 朋友圈截图 - 上传并 AI 分析
  const handleUploadMomentScreenshot = async () => {
    if (!momentFileRef.current?.files[0] || !selectedGirl) return;
    setUploadingMoment(true);
    try {
      const file = momentFileRef.current.files[0];
      const fd = new FormData();
      fd.append('image', file);
      fd.append('girlId', selectedGirl.id);
      fd.append('clientId', selectedGirl.clientId);
      fd.append('notes', momentNotes);
      fd.append('isMomentScreenshot', 'true');

      const token = localStorage.getItem('zhuiai_token');
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3005'}/api/chat-screenshots`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: fd
      });
      if (!res.ok) throw new Error(`上传截图失败 (${res.status})`);
      const data = await res.json();

      if (data.success) {
        toast({ title: '上传成功', status: 'success', duration: 2000 });
        // 保存到 girl.momentPhotos
        const existing = selectedGirl.momentPhotos ? JSON.parse(selectedGirl.momentPhotos) : [];
        const newItem = { id: data.screenshot.id, imageUrl: data.screenshot.imageUrl, notes: momentNotes, createdAt: new Date().toISOString() };
        const updated = [...existing, newItem];
        await girls.update(selectedGirl.id, { momentPhotos: JSON.stringify(updated) });
        // 刷新本地状态，确保详情弹窗里能看到
        setMomentScreenshots(updated);
        setMomentNotes('');
        if (momentFileRef.current) momentFileRef.current.value = '';
        setPreviewMomentImage('');

        // 刷新 selectedGirl 和本地列表
        try {
          const res = await girls.list();
          if (res.success) {
            const found = res.girls.find(g => g.id === selectedGirl.id);
            if (found) {
              setSelectedGirl(found);
              setMomentScreenshots(found.momentPhotos ? JSON.parse(found.momentPhotos) : []);
            }
          }
        } catch { /* ignore refresh error */ }

        // 触发 AI 分析
        if (data.screenshot?.id) {
          setAnalyzingMoment(true);
          setMomentAiResult('');
          try {
            const aiRes = await chatScreenshots.aiNotes(data.screenshot.id);
            if (aiRes.success) setMomentAiResult(aiRes.notes || '');
          } catch { /* ignore ai error */ }
          setAnalyzingMoment(false);
        }
        // 如果有 AI 识别的额外字段（如年龄/职业/城市等），弹窗让用户选择录入
        if (data.pendingFields && Object.keys(data.pendingFields).length > 0) {
          setPendingFields(data.pendingFields);
          const defaults = {};
          Object.keys(data.pendingFields || {}).forEach(k => { defaults[k] = false; }); // 默认不选中
          setConfirmSelections(defaults);
          onConfirmOpen();
        }
      } else {
        toast({ title: data.error || '上传失败', status: 'error', duration: 2000 });
      }
    } catch (e) {
      captureError(e);
      toast({ title: '上传失败', status: 'error', duration: 2000 });
    } finally {
      setUploadingMoment(false);
    }
  };

  const handleMomentImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPreviewMomentImage(URL.createObjectURL(file));
    }
  };

  const handleDeleteMomentScreenshot = async (momId) => {
    if (!confirm('确定删除?')) return;
    try {
      const existing = selectedGirl.momentPhotos ? JSON.parse(selectedGirl.momentPhotos) : [];
      const updated = (existing || []).filter(m => m.id !== momId);
      await girls.update(selectedGirl.id, { momentPhotos: JSON.stringify(updated) });
      setMomentScreenshots(updated);
      toast({ title: '已删除', status: 'success', duration: 1500 });
    } catch { /* ignore delete error */ }
  };

  const renderField = (label, value, parseJSON = false) => {
    let displayValue = value;
    if (parseJSON && value) {
      try {
        const arr = JSON.parse(value);
        displayValue = Array.isArray(arr) ? arr.join('、') : value;
      } catch { displayValue = value; }
    }
    if (!displayValue) return <Text color="rgba(245,240,232,0.2)">-</Text>;
    return <Text color="white">{displayValue}</Text>;
  };

  const getTensionColor = (score) => {
    if (score >= 7) return 'red.400';
    if (score >= 5) return 'orange.400';
    return 'rgba(245,240,232,0.4)';
  };

  const getTensionIcon = (score) => {
    if (score >= 7) return <Icon as={FireIcon} color="red.400" />;
    if (score >= 5) return <Icon as={FireIcon} color="orange.400" />;
    return <Icon as={SnowIcon} color="rgba(245,240,232,0.4)" />;
  };

  const getRelationshipStageColor = (stage) => {
    const map = { EXPLORATION: 'gray', FLIRTING: 'pink', ADVANCEMENT: 'orange', CONFIRMATION: 'green', STABLE: 'blue' };
    return map[stage] || 'gray';
  };

  const getRelationshipStageLabel = (stage) => {
    const map = { EXPLORATION: '探索期', FLIRTING: '暧昧期', ADVANCEMENT: '推进期', CONFIRMATION: '确认期', STABLE: '稳定期' };
    return map[stage] || stage || '未设置';
  };

  // 过滤后的女生列表
  const filteredGirls = girlsList.filter(girl => {
    const keyword = searchKeyword.toLowerCase();
    const matchSearch = !keyword ||
      (girl.name || '').toLowerCase().includes(keyword) ||
      (girl.occupation || '').toLowerCase().includes(keyword) ||
      (girl.education || '').toLowerCase().includes(keyword) ||
      (girl.hometown || '').toLowerCase().includes(keyword) ||
      (girl.residence || '').toLowerCase().includes(keyword);
    const matchStage = !filterStage || girl.stage === filterStage;
    const matchStatus = !filterStatus || girl.status === filterStatus;
    const matchClient = !filterClientId || girl.clientId === filterClientId;
    return matchSearch && matchStage && matchStatus && matchClient;
  });

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={4} gap={2} direction={{ base: 'column', md: 'row' }}>
        <Heading color="white" size={{ base: 'md', md: 'lg' }}>女生资源</Heading>
        <Button colorScheme="gold" size="sm" onClick={() => { setFormData(getInitialFormData()); onCreateOpen(); }}>
          + 添加女生
        </Button>
      </Flex>

      {/* 搜索和过滤 */}
      <Card bg="warm.800" mb={4}>
        <CardBody py={3}>
          <Flex gap={2} direction={{ base: 'column', sm: 'row' }} wrap="wrap">
            <Input
              placeholder="搜索..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              maxW={{ base: '100%', sm: '250px' }}
              bg="warm.700"
              border="warm.600"
              _placeholder={{ color: 'rgba(245,240,232,0.4)' }}
              size="sm"
            />
            <Select
              placeholder="阶段"
              value={filterStage}
              onChange={(e) => setFilterStage(e.target.value)}
              maxW={{ base: '100%', sm: '120px' }}
              bg="warm.700"
              border="warm.600"
              size="sm"
            >
              {STAGES.map(stage => (
                <option key={stage} value={stage}>{stage}</option>
              ))}
            </Select>
            <Select
              placeholder="状态"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              maxW={{ base: '100%', sm: '120px' }}
              bg="warm.700"
              border="warm.600"
              size="sm"
            >
              <option value="available">可用</option>
              <option value="chatting">聊天中</option>
              <option value="dating">约会中</option>
              <option value="locked">锁定</option>
              <option value="long_term">长期</option>
            </Select>
            <Select
              placeholder="所属客户"
              value={filterClientId}
              onChange={(e) => setFilterClientId(e.target.value)}
              maxW={{ base: '100%', sm: '180px' }}
              bg="warm.700"
              border="warm.600"
              size="sm"
            >
              {clientList.filter(c => c.role !== 'admin' && c.role !== 'operator').map(client => (
                <option key={client.id} value={client.id}>
                  {client.nickname || client.username}
                </option>
              ))}
            </Select>
            {(searchKeyword || filterStage || filterStatus || filterClientId) && (
              <Button
                variant="ghost"
                size="sm"
                color="rgba(245,240,232,0.4)"
                onClick={() => { setSearchKeyword(''); setFilterStage(''); setFilterStatus(''); setFilterClientId(''); }}
              >
                清除
              </Button>
            )}
            <Box flex={1} display={{ base: 'none', sm: 'block' }} />
            <Text color="rgba(245,240,232,0.4)" fontSize="sm" alignSelf="center">
              {filteredGirls.length} / {girlsList.length}
            </Text>
          </Flex>
        </CardBody>
      </Card>

      <Card bg="warm.800">
        <CardBody>
          {/* 桌面端表格 */}
          <Box display={{ base: 'none', lg: 'block' }}>
            <Table variant="simple" color="gray.300" size="sm">
              <Thead>
                <Tr>
                  <Th color="rgba(245,240,232,0.4)">昵称</Th>
                  <Th color="rgba(245,240,232,0.4)">年龄</Th>
                  <Th color="rgba(245,240,232,0.4)">职业</Th>
                  <Th color="rgba(245,240,232,0.4)">阶段</Th>
                  <Th color="rgba(245,240,232,0.4)">热度</Th>
                  <Th color="rgba(245,240,232,0.4)">亲密度</Th>
                  <Th color="rgba(245,240,232,0.4)">Kink</Th>
                  <Th color="rgba(245,240,232,0.4)">操作</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredGirls.map(girl => (
                  <Tr key={girl.id} _hover={{ bg: 'warm.800' }} transition="background 0.15s ease" cursor="pointer" onClick={() => openDetailModal(girl)}>
                    <Td fontWeight="bold">
                      <HStack spacing={2}>
                        {girl.name}
                        {/* M007 S02: 预警指示器 */}
                        {girlAlerts[girl.id] && girlAlerts[girl.id].length > 0 && (
                          <Icon as={FiAlertTriangle} color={
                            girlAlerts[girl.id].some(a => a.severity === 'P0') ? 'red.400' :
                            girlAlerts[girl.id].some(a => a.severity === 'P1') ? 'orange.400' : 'rgba(245,240,232,0.4)'
                          } boxSize={4} title={`${girlAlerts[girl.id].length}条预警`} />
                        )}
                      </HStack>
                    </Td>
                    <Td>{girl.age || '-'}</Td>
                    <Td>{girl.occupation || '-'}</Td>
                    <Td>
                      <VStack spacing={1} align="start">
                        <Badge colorScheme="gold" fontSize="xs">{girl.stage || '陌生'}</Badge>
                        {girl.relationshipStage && (
                          <Badge colorScheme={
                            girl.relationshipStage === 'EXPLORATION' ? 'gray' :
                            girl.relationshipStage === 'FLIRTING' ? 'pink' :
                            girl.relationshipStage === 'ADVANCEMENT' ? 'orange' :
                            girl.relationshipStage === 'CONFIRMATION' ? 'green' :
                            girl.relationshipStage === 'STABLE' ? 'blue' : 'gray'
                          } fontSize="xs">
                          {girl.relationshipStage === 'EXPLORATION' ? '探索' :
                           girl.relationshipStage === 'FLIRTING' ? '暧昧' :
                           girl.relationshipStage === 'ADVANCEMENT' ? '推进' :
                           girl.relationshipStage === 'CONFIRMATION' ? '确认' :
                           girl.relationshipStage === 'STABLE' ? '稳定' :
                           girl.relationshipStage}
                        </Badge>
                        )}
                      </VStack>
                    </Td>
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
                      {girl.isKinkOriented ? <Badge colorScheme="purple">K</Badge> : <Text color="warm.600">-</Text>}
                    </Td>
                    <Td>
                      <HStack spacing={2}>
                        <Button size="xs" colorScheme="gold" variant="ghost" onClick={() => openDetailModal(girl)}>详情</Button>
                        <Button size="xs" colorScheme="blue" variant="ghost" onClick={(e) => { e.stopPropagation(); openEditModal(girl); }}>编辑</Button>
                        <Button size="xs" colorScheme="orange" variant="ghost" onClick={(e) => { e.stopPropagation(); openScreenshotModal(girl); }}>截图</Button>
                        <Button size="xs" colorScheme="red" variant="ghost" onClick={(e) => { e.stopPropagation(); deleteGirl(girl.id); }}>删除</Button>
                      </HStack>
                    </Td>
                  </Tr>
                ))}
                {filteredGirls.length === 0 && (
                  <Tr><Td colSpan={8} textAlign="center" color="rgba(245,240,232,0.2)">
                    {girlsList.length === 0 ? '暂无女生资源' : '未找到匹配的女生'}
                  </Td></Tr>
                )}
              </Tbody>
            </Table>
          </Box>

          {/* 移动端卡片列表 */}
          <Box display={{ base: 'block', lg: 'none' }}>
            {filteredGirls.length === 0 ? (
              <Text color="rgba(245,240,232,0.2)" textAlign="center" py={8}>
                {girlsList.length === 0 ? '暂无女生资源' : '未找到匹配的女生'}
              </Text>
            ) : (
              <VStack spacing={3} align="stretch">
                {filteredGirls.map(girl => (
                  <Card key={girl.id} bg="warm.700" size="sm" cursor="pointer" onClick={() => openDetailModal(girl)} _hover={{ bg: 'gray.650' }} transition="background 0.15s">
                    <CardBody py={3} px={4}>
                      <Flex justify="space-between" align="center" mb={2}>
                        <HStack>
                          <Text fontWeight="bold" color="white">{girl.name}</Text>
                          {/* M007 S02: 预警指示器 */}
                          {girlAlerts[girl.id] && girlAlerts[girl.id].length > 0 && (
                            <Icon as={FiAlertTriangle} color={
                              girlAlerts[girl.id].some(a => a.severity === 'P0') ? 'red.400' :
                              girlAlerts[girl.id].some(a => a.severity === 'P1') ? 'orange.400' : 'rgba(245,240,232,0.4)'
                            } boxSize={4} />
                          )}
                          <Badge colorScheme="gold">{girl.stage || '陌生'}</Badge>
                          {girl.relationshipStage && (
                            <Badge colorScheme={
                              girl.relationshipStage === 'EXPLORATION' ? 'gray' :
                              girl.relationshipStage === 'FLIRTING' ? 'pink' :
                              girl.relationshipStage === 'ADVANCEMENT' ? 'orange' :
                              girl.relationshipStage === 'CONFIRMATION' ? 'green' :
                              girl.relationshipStage === 'STABLE' ? 'blue' : 'gray'
                            }>
                              {girl.relationshipStage === 'EXPLORATION' ? '探索' :
                               girl.relationshipStage === 'FLIRTING' ? '暧昧' :
                               girl.relationshipStage === 'ADVANCEMENT' ? '推进' :
                               girl.relationshipStage === 'CONFIRMATION' ? '确认' :
                               girl.relationshipStage === 'STABLE' ? '稳定' :
                               girl.relationshipStage}
                            </Badge>
                          )}
                          {girl.isKinkOriented && <Badge colorScheme="purple">K</Badge>}
                        </HStack>
                        <HStack spacing={1}>
                          <Button size="xs" colorScheme="blue" variant="ghost" onClick={(e) => { e.stopPropagation(); openEditModal(girl); }}>编辑</Button>
                          <Button size="xs" colorScheme="red" variant="ghost" onClick={(e) => { e.stopPropagation(); deleteGirl(girl.id); }}>删除</Button>
                        </HStack>
                      </Flex>
                      <HStack spacing={4} wrap="wrap">
                        <Text color="rgba(245,240,232,0.4)" fontSize="xs">{girl.age || '-'}岁</Text>
                        <Text color="rgba(245,240,232,0.4)" fontSize="xs">{girl.occupation || '-'}</Text>
                        <HStack spacing={1}>
                          {Array.from({ length: girl.intimacyLevel || 1 }).map((_, i) => (
                            <Icon key={i} as={HeartIcon} color="red.400" boxSize={3} />
                          ))}
                        </HStack>
                        <Text color={getTensionColor(girl.tensionScore)} fontSize="xs">
                          {girl.tensionScore?.toFixed(1) || '5.0'}
                        </Text>
                      </HStack>
                    </CardBody>
                  </Card>
                ))}
              </VStack>
            )}
          </Box>
        </CardBody>
      </Card>

      {/* 添加/编辑女生弹窗 */}
      <Modal isOpen={isOpen} onClose={onClose} size={{ base: 'full', lg: '4xl' }}>
        <ModalOverlay />
        <ModalContent bg="warm.800">
          <ModalHeader color="white">{selectedGirl ? '编辑女生' : '添加女生'}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <Tabs colorScheme="gold" size="sm">
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
                      <FormLabel color="rgba(245,240,232,0.4)">所属客户</FormLabel>
                      <Select placeholder="选择客户" value={formData.clientId} onChange={e => handleClientChange(e.target.value)} bg="warm.700" color="white">
                        {clientList.map(c => (
                          <option key={c.id} value={c.id}>{c.nickname || c.username}（{c.girlCount || 0}/{c.girlQuota || 10}人）</option>
                        ))}
                      </Select>
                      {selectedClientQuota && (
                        <Text fontSize="xs" color={selectedClientQuota.count >= selectedClientQuota.quota ? 'red.400' : 'rgba(245,240,232,0.4)'}>
                          {selectedClientQuota.count >= selectedClientQuota.quota
                            ? `额度已用完（${selectedClientQuota.count}/${selectedClientQuota.quota}），请先调整客户配额`
                            : `剩余 ${selectedClientQuota.quota - selectedClientQuota.count} 个名额（${selectedClientQuota.count}/${selectedClientQuota.quota}）`}
                        </Text>
                      )}
                    </FormControl>
                    <FormControl isRequired>
                      <FormLabel color="rgba(245,240,232,0.4)">昵称</FormLabel>
                      <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} bg="warm.700" />
                    </FormControl>
                    <SimpleGrid columns={{ base: 1, sm: 2, md: 4 }} spacing={4}>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">年龄</FormLabel>
                        <NumberInput value={formData.age} onChange={(_, v) => setFormData({...formData, age: v})} bg="warm.700" min={18} max={60}>
                          <NumberInputField />
                        </NumberInput>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">职业</FormLabel>
                        <Select value={formData.occupation} onChange={e => setFormData({...formData, occupation: e.target.value})} bg="warm.700" color="white">
                          <option value="">选择</option>
                          {OCCUPATIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">学历</FormLabel>
                        <Select value={formData.education} onChange={e => setFormData({...formData, education: e.target.value})} bg="warm.700" color="white">
                          <option value="">选择</option>
                          {EDUCATIONS.map(e => <option key={e} value={e}>{e}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">专业</FormLabel>
                        <Input value={formData.major} onChange={e => setFormData({...formData, major: e.target.value})} bg="warm.700" />
                      </FormControl>
                    </SimpleGrid>
                    <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">籍贯</FormLabel>
                        <Select value={formData.hometown} onChange={e => setFormData({...formData, hometown: e.target.value})} bg="warm.700" color="white">
                          <option value="">选择</option>
                          {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">现居城市</FormLabel>
                        <Select value={formData.residence} onChange={e => setFormData({...formData, residence: e.target.value})} bg="warm.700" color="white">
                          <option value="">选择</option>
                          {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">工作地点</FormLabel>
                        <Input value={formData.workplace} onChange={e => setFormData({...formData, workplace: e.target.value})} bg="warm.700" />
                      </FormControl>
                    </SimpleGrid>
                    <SimpleGrid columns={2} spacing={4}>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">平台来源</FormLabel>
                        <Select value={formData.sourcePlatform} onChange={e => setFormData({...formData, sourcePlatform: e.target.value})} bg="warm.700" color="white">
                          <option value="">选择平台</option>
                          {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">主页链接</FormLabel>
                        <Input value={formData.homepageUrl} onChange={e => setFormData({...formData, homepageUrl: e.target.value})} bg="warm.700" color="white" placeholder="https://..." />
                      </FormControl>
                    </SimpleGrid>
                  </VStack>
                </TabPanel>

                {/* 外貌特征 + 家庭背景 */}
                <TabPanel px={0}>
                  <VStack spacing={4} align="stretch">
                    <Text color="white" fontWeight="bold">外貌特征</Text>
                    <FormControl>
                      <FormLabel color="rgba(245,240,232,0.4)">外貌描述</FormLabel>
                      <Textarea value={formData.appearance} onChange={e => setFormData({...formData, appearance: e.target.value})} placeholder="穿着风格、发型、肤色..." bg="warm.700" rows={2} />
                    </FormControl>
                    <SimpleGrid columns={{ base: 1, sm: 2, md: 4 }} spacing={4}>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">身高(cm)</FormLabel>
                        <NumberInput value={formData.height} onChange={(_, v) => setFormData({...formData, height: v})} bg="warm.700" min={140} max={200}>
                          <NumberInputField />
                        </NumberInput>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">体型</FormLabel>
                        <Select value={formData.bodyType} onChange={e => setFormData({...formData, bodyType: e.target.value})} bg="warm.700" color="white">
                          <option value="">选择</option>
                          {BODY_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">风格标签</FormLabel>
                        <Select value={formData.styleTags} onChange={e => setFormData({...formData, styleTags: e.target.value})} bg="warm.700" color="white">
                          <option value="">选择标签</option>
                          {STYLE_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">照片链接（多个用逗号分隔）</FormLabel>
                        <Input value={formData.photos} onChange={e => setFormData({...formData, photos: e.target.value})} bg="warm.700" color="white" placeholder="https://..." />
                      </FormControl>
                    </SimpleGrid>
                    <FormControl>
                      <FormLabel color="rgba(245,240,232,0.4)">视频链接（多个用逗号分隔）</FormLabel>
                      <Input value={formData.videos} onChange={e => setFormData({...formData, videos: e.target.value})} bg="warm.700" color="white" placeholder="https://..." />
                    </FormControl>
                    <Text color="white" fontWeight="bold" mt={2}>家庭背景</Text>
                    <SimpleGrid columns={2} spacing={4}>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">家庭背景</FormLabel>
                        <Select value={formData.familyBackground} onChange={e => setFormData({...formData, familyBackground: e.target.value})} bg="warm.700" color="white">
                          <option value="">选择</option>
                          {FAMILY_BACKGROUNDS.map(f => <option key={f} value={f}>{f}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">家庭氛围</FormLabel>
                        <Select value={formData.familyAtmosphere} onChange={e => setFormData({...formData, familyAtmosphere: e.target.value})} bg="warm.700" color="white">
                          <option value="">选择</option>
                          {FAMILY_ATMOSPHERES.map(f => <option key={f} value={f}>{f}</option>)}
                        </Select>
                      </FormControl>
                    </SimpleGrid>
                    <SimpleGrid columns={2} spacing={4}>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">养老负担</FormLabel>
                        <Select value={formData.familyBurden} onChange={e => setFormData({...formData, familyBurden: e.target.value})} bg="warm.700" color="white">
                          <option value="">选择</option>
                          {FAMILY_BURDENS.map(f => <option key={f} value={f}>{f}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">家庭备注</FormLabel>
                        <Input value={formData.familyComments} onChange={e => setFormData({...formData, familyComments: e.target.value})} bg="warm.700" />
                      </FormControl>
                    </SimpleGrid>
                  </VStack>
                </TabPanel>

                {/* 生活状态 + 兴趣爱好 */}
                <TabPanel px={0}>
                  <VStack spacing={4} align="stretch">
                    <Text color="white" fontWeight="bold">生活状态</Text>
                    <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">工作作息</FormLabel>
                        <Select value={formData.workSchedule} onChange={e => setFormData({...formData, workSchedule: e.target.value})} bg="warm.700" color="white">
                          <option value="">选择</option>
                          {WORK_SCHEDULES.map(w => <option key={w} value={w}>{w}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">社交活跃度</FormLabel>
                        <Select value={formData.socialActivity} onChange={e => setFormData({...formData, socialActivity: e.target.value})} bg="warm.700" color="white">
                          <option value="">选择</option>
                          {SOCIAL_ACTIVITY_LEVELS.map(s => <option key={s} value={s}>{s}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">消费习惯</FormLabel>
                        <Select value={formData.financialHabits} onChange={e => setFormData({...formData, financialHabits: e.target.value})} bg="warm.700" color="white">
                          <option value="">选择</option>
                          {FINANCIAL_HABITS.map(f => <option key={f} value={f}>{f}</option>)}
                        </Select>
                      </FormControl>
                    </SimpleGrid>
                    <Text color="white" fontWeight="bold" mt={2}>兴趣爱好</Text>
                    <FormControl>
                      <FormLabel color="rgba(245,240,232,0.4)">兴趣爱好</FormLabel>
                      <Select value={formData.interests} onChange={e => setFormData({...formData, interests: e.target.value})} bg="warm.700" color="white">
                          <option value="">选择</option>
                          {INTERESTS.map(i => <option key={i} value={i}>{i}</option>)}
                        </Select>
                    </FormControl>
                    <SimpleGrid columns={2} spacing={4}>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">饮食偏好（多选，用逗号分隔）</FormLabel>
                        <Textarea
                          value={formData.dietPreferences}
                          onChange={e => setFormData({...formData, dietPreferences: e.target.value})}
                          placeholder="清淡,火锅,日料"
                          bg="warm.700" rows={2}
                        />
                        <Text color="rgba(245,240,232,0.2)" fontSize="xs" mt={1}>可选：{DIET_PREFERENCES.join('、')}</Text>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">饮食禁忌/过敏（多选，用逗号分隔）</FormLabel>
                        <Textarea
                          value={formData.dietRestrictions}
                          onChange={e => setFormData({...formData, dietRestrictions: e.target.value})}
                          placeholder="不吃辣,海鲜过敏"
                          bg="warm.700" rows={2}
                        />
                        <Text color="rgba(245,240,232,0.2)" fontSize="xs" mt={1}>可选：{DIET_RESTRICTIONS.join('、')}</Text>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">兴趣详情</FormLabel>
                        <Input value={formData.hobbiesDetail} onChange={e => setFormData({...formData, hobbiesDetail: e.target.value})} bg="warm.700" />
                      </FormControl>
                    </SimpleGrid>
                  </VStack>
                </TabPanel>

                {/* 情感状态 */}
                <TabPanel px={0}>
                  <VStack spacing={4} align="stretch">
                    <SimpleGrid columns={2} spacing={4}>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">婚恋态度</FormLabel>
                        <Select value={formData.relationshipAttitude} onChange={e => setFormData({...formData, relationshipAttitude: e.target.value})} bg="warm.700" color="white">
                          <option value="">选择</option>
                          {RELATIONSHIP_ATTITUDES.map(r => <option key={r} value={r}>{r}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">依恋类型</FormLabel>
                        <Select value={formData.attachmentStyle} onChange={e => setFormData({...formData, attachmentStyle: e.target.value})} bg="warm.700" color="white">
                          <option value="">选择</option>
                          {ATTACHMENT_STYLES.map(a => <option key={a} value={a}>{a}</option>)}
                        </Select>
                      </FormControl>
                    </SimpleGrid>
                    <FormControl>
                      <FormLabel color="rgba(245,240,232,0.4)">情史摘要</FormLabel>
                      <Textarea value={formData.pastRelationshipSummary} onChange={e => setFormData({...formData, pastRelationshipSummary: e.target.value})} bg="warm.700" rows={2} />
                    </FormControl>
                    <FormControl>
                      <FormLabel color="rgba(245,240,232,0.4)">情伤记录</FormLabel>
                      <Select value={formData.emotionalWounds} onChange={e => setFormData({...formData, emotionalWounds: e.target.value})} bg="warm.700" color="white">
                          <option value="">选择</option>
                          {EMOTIONAL_WOUNDS_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
                        </Select>
                    </FormControl>
                    <FormControl>
                      <FormLabel color="rgba(245,240,232,0.4)">绝对雷区</FormLabel>
                      <Textarea value={formData.dealbreakers} onChange={e => setFormData({...formData, dealbreakers: e.target.value})} bg="warm.700" rows={2} />
                    </FormControl>
                    <FormControl>
                      <FormLabel color="rgba(245,240,232,0.4)">择偶偏好</FormLabel>
                      <Textarea value={formData.matePreferences} onChange={e => setFormData({...formData, matePreferences: e.target.value})} placeholder="年龄范围/学历/地域/职业/收入/其他要求" bg="warm.700" rows={2} />
                    </FormControl>
                  </VStack>
                </TabPanel>

                {/* 字母圈属性 */}
                <TabPanel px={0}>
                  <VStack spacing={4} align="stretch">
                    <FormControl display="flex" alignItems="center">
                      <FormLabel color="rgba(245,240,232,0.4)" mb={0}>接触字母圈</FormLabel>
                      <Switch isChecked={formData.isKinkOriented} onChange={e => setFormData({...formData, isKinkOriented: e.target.checked})} colorScheme="purple" />
                    </FormControl>
                    {formData.isKinkOriented && (
                      <>
                        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                          <FormControl>
                            <FormLabel color="rgba(245,240,232,0.4)">身份</FormLabel>
                            <Select value={formData.kinkIdentity} onChange={e => setFormData({...formData, kinkIdentity: e.target.value})} bg="warm.700" color="white">
                              <option value="">选择</option>
                              {KINK_IDENTITIES.map(k => <option key={k} value={k}>{k}</option>)}
                            </Select>
                          </FormControl>
                          <FormControl>
                            <FormLabel color="rgba(245,240,232,0.4)">经验</FormLabel>
                            <Select value={formData.kinkExperience} onChange={e => setFormData({...formData, kinkExperience: e.target.value})} bg="warm.700" color="white">
                              <option value="">选择</option>
                              {KINK_EXPERIENCES.map(k => <option key={k} value={k}>{k}</option>)}
                            </Select>
                          </FormControl>
                          <FormControl>
                            <FormLabel color="rgba(245,240,232,0.4)">边界</FormLabel>
                            <Select value={formData.kinkBoundaries} onChange={e => setFormData({...formData, kinkBoundaries: e.target.value})} bg="warm.700" color="white">
                              <option value="">选择</option>
                              {KINK_BOUNDARIES_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
                            </Select>
                          </FormControl>
                        </SimpleGrid>
                        <FormControl>
                          <FormLabel color="rgba(245,240,232,0.4)">兴趣标签</FormLabel>
                          <Select value={formData.kinkInterests} onChange={e => setFormData({...formData, kinkInterests: e.target.value})} bg="warm.700" color="white">
                            <option value="">选择</option>
                            {KINK_INTERESTS_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
                          </Select>
                        </FormControl>
                        <FormControl>
                          <FormLabel color="rgba(245,240,232,0.4)">特殊备注</FormLabel>
                          <Textarea value={formData.kinkNotes} onChange={e => setFormData({...formData, kinkNotes: e.target.value})} placeholder="安全词/特殊需求..." bg="warm.700" rows={2} />
                        </FormControl>
                      </>
                    )}
                  </VStack>
                </TabPanel>

                {/* AI分析 */}
                <TabPanel px={0}>
                  <VStack spacing={4} align="stretch">
                    <Text color="white" fontWeight="bold">内在画像（AI提炼）</Text>
                    <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">性格/MBTI</FormLabel>
                        <Select value={formData.personality} onChange={e => setFormData({...formData, personality: e.target.value})} bg="warm.700" color="white">
                          <option value="">选择</option>
                          {PERSONALITY_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">价值观</FormLabel>
                        <Select value={formData.values_} onChange={e => setFormData({...formData, values_: e.target.value})} bg="warm.700" color="white">
                          <option value="">选择</option>
                          {VALUES_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">沟通风格</FormLabel>
                        <Select value={formData.communicationStyle} onChange={e => setFormData({...formData, communicationStyle: e.target.value})} bg="warm.700" color="white">
                          <option value="">选择</option>
                          {COMMUNICATION_STYLE_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                        </Select>
                      </FormControl>
                    </SimpleGrid>
                    <SimpleGrid columns={2} spacing={4}>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">情绪触发点</FormLabel>
                        <Textarea value={formData.emotionalTriggers} onChange={e => setFormData({...formData, emotionalTriggers: e.target.value})} bg="warm.700" rows={2} />
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">喜欢的话题</FormLabel>
                        <Textarea value={formData.talkingTopics} onChange={e => setFormData({...formData, talkingTopics: e.target.value})} bg="warm.700" rows={2} />
                      </FormControl>
                    </SimpleGrid>
                    <FormControl>
                      <FormLabel color="rgba(245,240,232,0.4)">禁忌话题</FormLabel>
                      <Textarea value={formData.thingsToAvoid} onChange={e => setFormData({...formData, thingsToAvoid: e.target.value})} bg="warm.700" rows={2} />
                    </FormControl>

                    <Text color="white" fontWeight="bold" mt={2}>AI战略分析</Text>
                    <SimpleGrid columns={2} spacing={4}>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">最佳策略</FormLabel>
                        <Select value={formData.bestApproach} onChange={e => setFormData({...formData, bestApproach: e.target.value})} bg="warm.700" color="white">
                          <option value="">选择</option>
                          <option value="幽默">幽默</option>
                          <option value="真诚">真诚</option>
                          <option value="霸道">霸道</option>
                          <option value="温柔">温柔</option>
                          <option value="调理型">调理型</option>
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">推荐话题</FormLabel>
                        <Select value={formData.recommendedTopics} onChange={e => setFormData({...formData, recommendedTopics: e.target.value})} bg="warm.700" color="white">
                          <option value="">选择</option>
                          {TALKING_TOPICS_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </Select>
                      </FormControl>
                    </SimpleGrid>
                    <SimpleGrid columns={2} spacing={4}>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">升级条件</FormLabel>
                        <Textarea value={formData.upgradeConditions} onChange={e => setFormData({...formData, upgradeConditions: e.target.value})} bg="warm.700" rows={2} />
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">预计时间线</FormLabel>
                        <Select value={formData.estimatedTimeline} onChange={e => setFormData({...formData, estimatedTimeline: e.target.value})} bg="warm.700" color="white">
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
                        <FormLabel color="rgba(245,240,232,0.4)">风险因素</FormLabel>
                        <Textarea value={formData.riskFactors} onChange={e => setFormData({...formData, riskFactors: e.target.value})} bg="warm.700" rows={2} />
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">战略备注</FormLabel>
                        <Textarea value={formData.strategicNotes} onChange={e => setFormData({...formData, strategicNotes: e.target.value})} bg="warm.700" rows={2} />
                      </FormControl>
                    </SimpleGrid>

                    <Text color="white" fontWeight="bold" mt={2}>谙世画像（EQ维度）</Text>
                    <SimpleGrid columns={{ base: 1, sm: 2, md: 5 }} spacing={4}>
                      {[
                        { key: 'empathy', label: '同理心' },
                        { key: 'selfAwareness', label: '自我认知' },
                        { key: 'communication', label: '沟通能力' },
                        { key: 'relationship', label: '关系维护' },
                        { key: 'conflictRes', label: '冲突解决' }
                      ].map(item => (
                        <FormControl key={item.key}>
                          <FormLabel color="rgba(245,240,232,0.4)">{item.label}</FormLabel>
                          <NumberInput value={formData[item.key]} onChange={(_, v) => setFormData({...formData, [item.key]: v})} bg="warm.700" min={1} max={10}>
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

                    {/* M007 S01: 关系阶段选择器 */}
                    <Box bg="warm.800" p={4} borderRadius="md">
                      <Flex justify="space-between" align="center" mb={3}>
                        <Text color="white" fontWeight="bold" fontSize="sm">关系阶段（新）</Text>
                        {selectedGirl && (
                          <Button
                            size="xs"
                            colorScheme="blue"
                            variant="outline"
                            onClick={() => handleEvaluateStage(selectedGirl)}
                            isLoading={stageEvaluating}
                            loadingText="评估中"
                          >
                            AI评估
                          </Button>
                        )}
                      </Flex>

                      {/* AI 评估结果 */}
                      {stageEvalResult && (
                        <Box bg="blue.900" p={3} borderRadius="md" mb={3}>
                          <Text color="blue.200" fontSize="xs" mb={1}>AI 推荐：</Text>
                          <Badge colorScheme={
                            stageEvalResult.recommendedStage === 'EXPLORATION' ? 'gray' :
                            stageEvalResult.recommendedStage === 'FLIRTING' ? 'pink' :
                            stageEvalResult.recommendedStage === 'ADVANCEMENT' ? 'orange' :
                            stageEvalResult.recommendedStage === 'CONFIRMATION' ? 'green' : 'blue'
                          } fontSize="sm" mr={2}>
                            {stageEvalResult.stageLabel}
                          </Badge>
                          <Text color="blue.200" fontSize="xs" mt={1}>
                            置信度：{stageEvalResult.confidence}%
                          </Text>
                          <Text color="gray.300" fontSize="xs" mt={1}>
                            {stageEvalResult.reasoning}
                          </Text>
                          {stageEvalResult.warnings?.length > 0 && (
                            <Text color="yellow.300" fontSize="xs" mt={1}>
                              ⚠️ {stageEvalResult.warnings.join(' ')}
                            </Text>
                          )}
                          <HStack mt={2}>
                            <Button
                              size="sm"
                              colorScheme="green"
                              onClick={() => handleSetRelationshipStage(selectedGirl, stageEvalResult.recommendedStage, `AI评估推荐: ${stageEvalResult.reasoning}`)}
                            >
                              采纳推荐
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              colorScheme="gray"
                              onClick={() => setStageEvalResult(null)}
                            >
                              取消
                            </Button>
                          </HStack>
                        </Box>
                      )}

                      {/* 5阶段选择器 */}
                      <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={2}>
                        {RELATIONSHIP_STAGES.map(s => (
                          <Box
                            key={s.value}
                            p={2}
                            borderRadius="md"
                            bg={formData.relationshipStage === s.value ? `${s.color}.900` : 'warm.700'}
                            borderWidth={formData.relationshipStage === s.value ? '2px' : '1px'}
                            borderColor={formData.relationshipStage === s.value ? `${s.color}.400` : 'warm.600'}
                            cursor="pointer"
                            onClick={() => setFormData({...formData, relationshipStage: formData.relationshipStage === s.value ? '' : s.value})}
                            _hover={{ borderColor: `${s.color}.400` }}
                          >
                            <HStack justify="space-between">
                              <Badge colorScheme={s.color}>{s.label}</Badge>
                              {formData.relationshipStage === s.value && <Text color={`${s.color}.300`} fontSize="xs">✓</Text>}
                            </HStack>
                            <Text color="rgba(245,240,232,0.4)" fontSize="xs" mt={1}>{s.desc}</Text>
                          </Box>
                        ))}
                      </SimpleGrid>
                      {formData.relationshipStage && (
                        <Text color="rgba(245,240,232,0.2)" fontSize="xs">
                          当前：{RELATIONSHIP_STAGES.find(s => s.value === formData.relationshipStage)?.label || formData.relationshipStage}
                        </Text>
                      )}
                    </Box>

                    <SimpleGrid columns={{ base: 1, sm: 2, md: 4 }} spacing={4}>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">阶段（旧）</FormLabel>
                        <Select value={formData.stage} onChange={e => setFormData({...formData, stage: e.target.value})} bg="warm.700" color="white">
                          {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">状态</FormLabel>
                        <Select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} bg="warm.700" color="white">
                          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </Select>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">亲密度(1-5)</FormLabel>
                        <NumberInput value={formData.intimacyLevel} onChange={(_, v) => setFormData({...formData, intimacyLevel: v})} bg="warm.700" min={1} max={5}>
                          <NumberInputField />
                        </NumberInput>
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">热度(1-10)</FormLabel>
                        <NumberInput value={formData.tensionScore} onChange={(_, v) => setFormData({...formData, tensionScore: v})} bg="warm.700" min={1} max={10} step={0.1}>
                          <NumberInputField />
                        </NumberInput>
                      </FormControl>
                    </SimpleGrid>
                    <SimpleGrid columns={2} spacing={4}>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">最后联系</FormLabel>
                        <Input type="datetime-local" value={formData.lastContact} onChange={e => setFormData({...formData, lastContact: e.target.value})} bg="warm.700" />
                      </FormControl>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">回复规律</FormLabel>
                        <Select value={formData.responsePattern} onChange={e => setFormData({...formData, responsePattern: e.target.value})} bg="warm.700" color="white">
                          <option value="">选择</option>
                          {RESPONSE_PATTERNS.map(r => <option key={r} value={r}>{r}</option>)}
                        </Select>
                      </FormControl>
                    </SimpleGrid>

                    <Text color="white" fontWeight="bold" mt={2}>上下文记忆</Text>
                    <FormControl>
                      <FormLabel color="rgba(245,240,232,0.4)">关键信号(JSON)</FormLabel>
                      <Textarea value={formData.signals} onChange={e => setFormData({...formData, signals: e.target.value})} placeholder='[{"date":"2026-04-14","type":"positive","event":"主动发健身照片"}]' bg="warm.700" rows={3} />
                    </FormControl>
                    <FormControl>
                      <FormLabel color="rgba(245,240,232,0.4)">待推进事项(JSON)</FormLabel>
                      <Textarea value={formData.pendingActions} onChange={e => setFormData({...formData, pendingActions: e.target.value})} placeholder='["出差回来后约第二次见面"]' bg="warm.700" rows={2} />
                    </FormControl>
                    <FormControl>
                      <FormLabel color="rgba(245,240,232,0.4)">观察记录(JSON)</FormLabel>
                      <Textarea value={formData.observations} onChange={e => setFormData({...formData, observations: e.target.value})} bg="warm.700" rows={2} />
                    </FormControl>
                    <FormControl>
                      <FormLabel color="rgba(245,240,232,0.4)">对话摘要</FormLabel>
                      <Textarea value={formData.conversationSummary} onChange={e => setFormData({...formData, conversationSummary: e.target.value})} bg="warm.700" rows={3} />
                    </FormControl>

                    <Text color="white" fontWeight="bold" mt={2}>匹配相关</Text>
                    <SimpleGrid columns={2} spacing={4}>
                      <FormControl>
                        <FormLabel color="rgba(245,240,232,0.4)">匹配分</FormLabel>
                        <NumberInput value={formData.matchScore} onChange={(_, v) => setFormData({...formData, matchScore: v})} bg="warm.700" min={1} max={100}>
                          <NumberInputField />
                        </NumberInput>
                      </FormControl>
                    </SimpleGrid>
                    <FormControl>
                      <FormLabel color="rgba(245,240,232,0.4)">匹配分计算依据</FormLabel>
                      <Textarea value={formData.matchScoreBasis} onChange={e => setFormData({...formData, matchScoreBasis: e.target.value})} placeholder="说明这个分数是怎么算出来的，如：年龄差3岁、同城、学历相当、互有好感" bg="warm.700" rows={2} />
                    </FormControl>
                    <Text color="white" fontWeight="bold" mt={2}>其他</Text>
                    <FormControl>
                      <FormLabel color="rgba(245,240,232,0.4)">备注</FormLabel>
                      <Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} bg="warm.700" rows={2} />
                    </FormControl>
                  </VStack>
                </TabPanel>
              </TabPanels>
            </Tabs>
            <Button
              colorScheme="gold"
              w="100%"
              mt={6}
              onClick={handleSubmit}
              isDisabled={!selectedGirl && selectedClientQuota && selectedClientQuota.count >= selectedClientQuota.quota}
              transition="all 0.15s ease"
              _hover={{ transform: 'translateY(-1px)' }}
            >
              {selectedGirl ? '保存修改' : '添加女生'}
            </Button>
            {!selectedGirl && selectedClientQuota && selectedClientQuota.count >= selectedClientQuota.quota && (
              <Text color="red.400" fontSize="xs" textAlign="center" mt={2}>
                配额不足，请先在 Clients 页面调整该客户额度
              </Text>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* 女生详情弹窗 */}
      <Modal isOpen={isDetailOpen} onClose={onDetailClose} size={{ base: 'full', lg: '4xl' }}>
        <ModalOverlay />
        <ModalContent bg="warm.800" overflow="auto">
          <ModalHeader color="white">
            {selectedGirl?.name} - 详情
            {selectedGirl?.isKinkOriented && <Badge colorScheme="purple" ml={2}>Kink</Badge>}
            {selectedGirl?.relationshipStage && (
              <Badge colorScheme={getRelationshipStageColor(selectedGirl.relationshipStage)} ml={2}>
                {getRelationshipStageLabel(selectedGirl.relationshipStage)}
              </Badge>
            )}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            {selectedGirl && (
              <Tabs colorScheme="gold" size="sm">
                <TabList mb={4}>
                  <Tab>基础</Tab>
                  <Tab>外貌家庭</Tab>
                  <Tab>情感</Tab>
                  <Tab>AI画像</Tab>
                  <Tab>上下文</Tab>
                  <Tab>关系阶段</Tab>
                  <Tab>反撇分析</Tab>
                  <Tab>朋友圈截图</Tab>
                </TabList>
                <TabPanels>
                  <TabPanel px={0}>
                    <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">年龄</Text>{renderField('age', selectedGirl.age)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">身高</Text>{renderField('height', selectedGirl.height ? selectedGirl.height + 'cm' : '')}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">职业</Text>{renderField('occupation', selectedGirl.occupation)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">学历</Text>{renderField('education', selectedGirl.education)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">专业</Text>{renderField('major', selectedGirl.major)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">籍贯</Text>{renderField('hometown', selectedGirl.hometown)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">现居</Text>{renderField('residence', selectedGirl.residence)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">工作地点</Text>{renderField('workplace', selectedGirl.workplace)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">平台</Text>{renderField('sourcePlatform', selectedGirl.sourcePlatform)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">匹配分</Text>{renderField('matchScore', selectedGirl.matchScore)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">匹配分依据</Text><Text color={selectedGirl.matchScoreBasis ? 'white' : 'rgba(245,240,232,0.2)'}>{selectedGirl.matchScoreBasis || '-'}</Text></Box>
                    </SimpleGrid>
                    <Box mt={4}>
                      <Text color="rgba(245,240,232,0.4)" fontSize="sm">主页链接</Text>
                      {selectedGirl.homepageUrl ? (
                        <Text as="a" href={selectedGirl.homepageUrl} color="teal.400" fontSize="sm" wordBreak="break-all" target="_blank">{selectedGirl.homepageUrl}</Text>
                      ) : <Text color="rgba(245,240,232,0.2)">-</Text>}
                    </Box>
                    <Divider my={4} borderColor="warm.600" />
                    <Box>
                      <Text color="rgba(245,240,232,0.4)" fontSize="sm">备注</Text>
                      <Text color="white" whiteSpace="pre-wrap">{selectedGirl.notes || '无'}</Text>
                    </Box>
                  </TabPanel>
                  <TabPanel px={0}>
                    <Text color="white" fontWeight="bold" mb={2}>外貌特征</Text>
                    <SimpleGrid columns={2} spacing={4} mb={4}>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">外貌描述</Text>{renderField('appearance', selectedGirl.appearance)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">体型</Text>{renderField('bodyType', selectedGirl.bodyType)}</Box>
                    </SimpleGrid>
                    {selectedGirl.photos && (
                      <Box mb={4}>
                        <Text color="rgba(245,240,232,0.4)" fontSize="sm" mb={2}>照片</Text>
                        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={2}>
                          {(parseJSONField(selectedGirl.photos) || []).map((url, i) => (
                            <Image key={i} src={url} alt="照片" h="100px" objectFit="cover" borderRadius="md" cursor="pointer" onClick={() => window.open(url, '_blank')} _hover={{ opacity: 0.8 }} />
                          ))}
                        </SimpleGrid>
                      </Box>
                    )}
                    {selectedGirl.videos && (
                      <Box mb={4}>
                        <Text color="rgba(245,240,232,0.4)" fontSize="sm" mb={2}>视频</Text>
                        <VStack spacing={2} align="stretch">
                          {(parseJSONField(selectedGirl.videos) || []).map((url, i) => (
                            <Box key={i} p={2} bg="warm.700" borderRadius="md">
                              <Text as="a" href={url} color="teal.400" fontSize="sm" target="_blank">{url}</Text>
                            </Box>
                          ))}
                        </VStack>
                      </Box>
                    )}
                    <Text color="white" fontWeight="bold" mb={2}>家庭背景</Text>
                    <SimpleGrid columns={2} spacing={4}>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">家庭背景</Text>{renderField('familyBackground', selectedGirl.familyBackground)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">家庭氛围</Text>{renderField('familyAtmosphere', selectedGirl.familyAtmosphere)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">养老负担</Text>{renderField('familyBurden', selectedGirl.familyBurden)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">家庭备注</Text>{renderField('familyComments', selectedGirl.familyComments)}</Box>
                    </SimpleGrid>
                  </TabPanel>
                  <TabPanel px={0}>
                    <SimpleGrid columns={2} spacing={4} mb={4}>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">婚恋态度</Text>{renderField('relationshipAttitude', selectedGirl.relationshipAttitude)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">依恋类型</Text>{renderField('attachmentStyle', selectedGirl.attachmentStyle)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">工作作息</Text>{renderField('workSchedule', selectedGirl.workSchedule)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">社交活跃度</Text>{renderField('socialActivity', selectedGirl.socialActivity)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">消费习惯</Text>{renderField('financialHabits', selectedGirl.financialHabits)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">饮食偏好</Text>{renderField('dietPreferences', selectedGirl.dietPreferences)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">饮食禁忌</Text>{renderField('dietRestrictions', selectedGirl.dietRestrictions) || <Text color="rgba(245,240,232,0.2)" fontSize="sm">无</Text>}</Box>
                    </SimpleGrid>
                    <Text color="white" fontWeight="bold" mb={2}>情史</Text>
                    <SimpleGrid columns={1} spacing={2}>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">情史摘要</Text>{renderField('pastRelationshipSummary', selectedGirl.pastRelationshipSummary)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">情伤记录</Text>{renderField('emotionalWounds', selectedGirl.emotionalWounds)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">绝对雷区</Text>{renderField('dealbreakers', selectedGirl.dealbreakers)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">择偶偏好</Text>{renderField('matePreferences', selectedGirl.matePreferences)}</Box>
                    </SimpleGrid>
                    {selectedGirl.isKinkOriented && (
                      <>
                        <Divider my={4} borderColor="warm.600" />
                        <Text color="purple.400" fontWeight="bold" mb={2}>字母圈属性</Text>
                        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                          <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">身份</Text>{renderField('kinkIdentity', selectedGirl.kinkIdentity)}</Box>
                          <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">经验</Text>{renderField('kinkExperience', selectedGirl.kinkExperience)}</Box>
                          <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">边界</Text>{renderField('kinkBoundaries', selectedGirl.kinkBoundaries)}</Box>
                          <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">兴趣标签</Text>{renderField('kinkInterests', selectedGirl.kinkInterests)}</Box>
                        </SimpleGrid>
                        <Box mt={2}><Text color="rgba(245,240,232,0.4)" fontSize="sm">特殊备注</Text>{renderField('kinkNotes', selectedGirl.kinkNotes)}</Box>
                      </>
                    )}
                  </TabPanel>
                  <TabPanel px={0}>
                    <Text color="white" fontWeight="bold" mb={2}>内在画像</Text>
                    <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4} mb={4}>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">性格</Text>{renderField('personality', selectedGirl.personality)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">价值观</Text>{renderField('values_', selectedGirl.values_)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">沟通风格</Text>{renderField('communicationStyle', selectedGirl.communicationStyle)}</Box>
                    </SimpleGrid>
                    <SimpleGrid columns={2} spacing={2} mb={4}>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">情绪触发点</Text>{renderField('emotionalTriggers', selectedGirl.emotionalTriggers)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">喜欢话题</Text>{renderField('talkingTopics', selectedGirl.talkingTopics)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">禁忌话题</Text>{renderField('thingsToAvoid', selectedGirl.thingsToAvoid)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">兴趣爱好</Text>{renderField('interests', selectedGirl.interests)}</Box>
                    </SimpleGrid>
                    <Text color="white" fontWeight="bold" mb={2}>谙世EQ维度</Text>
                    <SimpleGrid columns={{ base: 1, sm: 2, md: 5 }} spacing={4} mb={4}>
                      {[
                        { key: 'empathy', label: '同理心' },
                        { key: 'selfAwareness', label: '自我认知' },
                        { key: 'communication', label: '沟通' },
                        { key: 'relationship', label: '关系' },
                        { key: 'conflictRes', label: '冲突解决' }
                      ].map(item => (
                        <Box key={item.key}>
                          <Text color="rgba(245,240,232,0.4)" fontSize="sm">{item.label}</Text>
                          <Text color={selectedGirl[item.key] ? 'teal.400' : 'rgba(245,240,232,0.2)'}>
                            {selectedGirl[item.key] ? selectedGirl[item.key] + '/10' : '-'}
                          </Text>
                        </Box>
                      ))}
                    </SimpleGrid>
                    <Text color="white" fontWeight="bold" mb={2}>AI战略分析</Text>
                    <SimpleGrid columns={2} spacing={2}>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">最佳策略</Text>{renderField('bestApproach', selectedGirl.bestApproach)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">推荐话题</Text>{renderField('recommendedTopics', selectedGirl.recommendedTopics)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">升级条件</Text>{renderField('upgradeConditions', selectedGirl.upgradeConditions)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">预计时间线</Text>{renderField('estimatedTimeline', selectedGirl.estimatedTimeline)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">风险因素</Text>{renderField('riskFactors', selectedGirl.riskFactors)}</Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">战略备注</Text>{renderField('strategicNotes', selectedGirl.strategicNotes)}</Box>
                    </SimpleGrid>
                  </TabPanel>
                  <TabPanel px={0}>
                    <Text color="white" fontWeight="bold" mb={2}>关系状态</Text>
                    <SimpleGrid columns={{ base: 1, sm: 2, md: 4 }} spacing={4} mb={4}>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">阶段</Text><Badge colorScheme="gold">{selectedGirl.stage}</Badge></Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">状态</Text><Badge>{selectedGirl.status}</Badge></Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">亲密度</Text>
                        <HStack>
                          {Array.from({ length: selectedGirl.intimacyLevel || 1 }).map((_, i) => (
                            <Icon key={i} as={HeartIcon} color="red.400" boxSize={4} />
                          ))}
                        </HStack>
                      </Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">热度</Text>
                        <HStack>
                          <Text color={getTensionColor(selectedGirl.tensionScore)}>
                            {selectedGirl.tensionScore?.toFixed(1) || '5.0'}
                          </Text>
                          {getTensionIcon(selectedGirl.tensionScore)}
                        </HStack>
                      </Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">最后联系</Text>
                        <Text color="white">{selectedGirl.lastContact ? new Date(selectedGirl.lastContact).toLocaleString() : '-'}</Text>
                      </Box>
                      <Box><Text color="rgba(245,240,232,0.4)" fontSize="sm">回复规律</Text>{renderField('responsePattern', selectedGirl.responsePattern)}</Box>
                    </SimpleGrid>
                    <Text color="white" fontWeight="bold" mb={2}>关键信号</Text>
                    {selectedGirl.signals ? (
                      <Box bg="warm.700" p={3} borderRadius="md" mb={4}>
                        {(() => {
                          const arr = parseJSONField(selectedGirl.signals);
                          return arr.map((s, i) => (
                            <Flex key={i} align="center" mb={1}>
                              <Badge colorScheme={s.type === 'positive' ? 'green' : s.type === 'negative' ? 'red' : 'gray'} mr={2}>
                                {s.type === 'positive' ? '[+]' : s.type === 'negative' ? '[-]' : '[*]'}
                              </Badge>
                              <Text color="white" fontSize="sm">{typeof s.event === 'string' ? s.event : ''}</Text>
                              <Text color="rgba(245,240,232,0.2)" fontSize="xs" ml={2}>{s.date}</Text>
                            </Flex>
                          ));
                        })()}
                      </Box>
                    ) : <Text color="rgba(245,240,232,0.2)" mb={4}>暂无信号记录</Text>}
                    <Text color="white" fontWeight="bold" mb={2}>待推进事项</Text>
                    {selectedGirl.pendingActions ? (
                      <Box bg="warm.700" p={3} borderRadius="md" mb={4}>
                        {(() => {
                          const arr = parseJSONField(selectedGirl.pendingActions);
                          return arr.map((a, i) => (
                            <Text key={i} color="orange.300" fontSize="sm">→ {a}</Text>
                          ));
                        })()}
                      </Box>
                    ) : <Text color="rgba(245,240,232,0.2)" mb={4}>暂无待办</Text>}
                    <Text color="white" fontWeight="bold" mb={2}>观察记录</Text>
                    {selectedGirl.observations ? (
                      <Box bg="warm.700" p={3} borderRadius="md" mb={4}>
                        {(() => {
                          const arr = parseJSONField(selectedGirl.observations);
                          return arr.map((o, i) => (
                            <Text key={i} color="gray.300" fontSize="sm">• {o}</Text>
                          ));
                        })()}
                      </Box>
                    ) : <Text color="rgba(245,240,232,0.2)" mb={4}>暂无观察记录</Text>}
                    <Text color="white" fontWeight="bold" mb={2}>对话摘要</Text>
                    <Box bg="warm.700" p={3} borderRadius="md">
                      <Text color="white" whiteSpace="pre-wrap" fontSize="sm">{selectedGirl.conversationSummary || '暂无摘要'}</Text>
                    </Box>
                  </TabPanel>

                  {/* 朋友圈截图 Tab */}
                  <TabPanel px={0}>
                    <VStack spacing={4} align="stretch">
                      {/* 上传区 */}
                      <Flex gap={4} align="flex-end" bg="warm.700" p={4} borderRadius="md">
                        <FormControl flex={1}>
                          <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">选择朋友圈截图</FormLabel>
                          <Input type="file" accept="image/*" ref={momentFileRef} onChange={handleMomentImageSelect} bg="warm.600" pt={1} color="white" _placeholder={{ color: 'rgba(245,240,232,0.4)' }} />
                        </FormControl>
                        <FormControl flex={1}>
                          <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">备注</FormLabel>
                          <Input value={momentNotes} onChange={e => setMomentNotes(e.target.value)} placeholder="如：深夜美食自拍" bg="warm.600" color="white" _placeholder={{ color: 'rgba(245,240,232,0.4)' }} />
                        </FormControl>
                        <Button colorScheme="purple" onClick={handleUploadMomentScreenshot} isLoading={uploadingMoment} h="40px">
                          上传并分析
                        </Button>
                      </Flex>

                      {/* 图片预览 */}
                      {previewMomentImage && (
                        <Image src={previewMomentImage} alt="预览" maxH="200px" borderRadius="md" objectFit="cover" />
                      )}

                      {/* AI 分析结果 */}
                      {analyzingMoment && (
                        <HStack><Spinner size="sm" color="purple.400" /><Text color="purple.300" fontSize="sm">AI 分析中...</Text></HStack>
                      )}
                      {momentAiResult && (
                        <Box bg="purple.900" p={3} borderRadius="md" borderLeft="3px solid" borderColor="purple.400">
                          <Text color="purple.200" fontSize="sm" fontWeight="bold" mb={1}>AI 分析</Text>
                          <Text color="gray.300" fontSize="sm" whiteSpace="pre-wrap">{momentAiResult}</Text>
                        </Box>
                      )}

                      {/* 已有朋友圈截图 */}
                      <Box>
                        <Text color="rgba(245,240,232,0.4)" fontSize="sm" mb={3}>已保存 ({momentScreenshots.length})</Text>
                        {momentScreenshots.length === 0 ? (
                          <Flex h="150px" align="center" justify="center" bg="warm.700" borderRadius="md">
                            <Text color="rgba(245,240,232,0.2)">暂无朋友圈截图</Text>
                          </Flex>
                        ) : (
                          <SimpleGrid columns={{ base: 1, sm: 2, md: 4 }} spacing={4}>
                            {momentScreenshots.map(m => (
                              <Box key={m.id} position="relative" bg="warm.700" borderRadius="md" overflow="hidden">
                                <Image
                                  src={`${import.meta.env.VITE_API_URL || 'http://localhost:3005'}${m.imageUrl}`}
                                  alt="朋友圈截图"
                                  w="100%"
                                  h="140px"
                                  objectFit="cover"
                                  cursor="pointer"
                                  onClick={() => setPreviewImage(`${import.meta.env.VITE_API_URL || 'http://localhost:3005'}${m.imageUrl}`)}
                                />
                                <Box position="absolute" bottom={0} left={0} right={0} bg="blackAlpha.700" p={2}>
                                  <Text fontSize="xs" color="gray.300" noOfLines={1}>{m.notes || '无备注'}</Text>
                                </Box>
                                <IconButton
                                  position="absolute"
                                  top={1}
                                  right={1}
                                  icon={<Icon as={FiX} />}
                                  size="xs"
                                  colorScheme="red"
                                  borderRadius="full"
                                  onClick={() => handleDeleteMomentScreenshot(m.id)}
                                />
                              </Box>
                            ))}
                          </SimpleGrid>
                        )}
                      </Box>
                    </VStack>
                  </TabPanel>

                  {/* 关系阶段 Tab */}
                  <TabPanel px={0}>
                    {/* 当前阶段 */}
                    <Flex align="center" justify="space-between" mb={4} bg="warm.700" p={4} borderRadius="md">
                      <Box>
                        <Text color="rgba(245,240,232,0.4)" fontSize="sm">当前阶段</Text>
                        <HStack mt={1}>
                          <Badge colorScheme={getRelationshipStageColor(selectedGirl.relationshipStage)} fontSize="md">
                            {getRelationshipStageLabel(selectedGirl.relationshipStage)}
                          </Badge>
                          {selectedGirl.relationshipStageUpdatedAt && (
                            <Text color="rgba(245,240,232,0.2)" fontSize="xs">
                              更新于 {new Date(selectedGirl.relationshipStageUpdatedAt).toLocaleString()}
                            </Text>
                          )}
                        </HStack>
                      </Box>
                      <Button
                        size="sm"
                        colorScheme="blue"
                        variant="outline"
                        onClick={() => handleEvaluateStage(selectedGirl)}
                        isLoading={stageEvaluating}
                        loadingText="评估中"
                      >
                        AI 评估
                      </Button>
                    </Flex>

                    {/* AI 评估结果 */}
                    {stageEvalResult && (
                      <Box bg="blue.900" p={3} borderRadius="md" mb={4} borderLeft="3px solid" borderColor="blue.400">
                        <Text color="blue.200" fontSize="sm" fontWeight="bold" mb={1}>AI 评估结果</Text>
                        <HStack mb={2}>
                          <Badge colorScheme={getRelationshipStageColor(stageEvalResult.recommendedStage)} fontSize="sm">
                            {stageEvalResult.stageLabel}
                          </Badge>
                          <Text color="blue.200" fontSize="xs">
                            置信度：{stageEvalResult.confidence}%
                          </Text>
                        </HStack>
                        <Text color="gray.300" fontSize="sm" mb={2}>
                          {stageEvalResult.reasoning}
                        </Text>
                        {stageEvalResult.warnings?.length > 0 && (
                          <Text color="yellow.300" fontSize="xs" mb={2}>
                            ⚠️ {stageEvalResult.warnings.join(' ')}
                          </Text>
                        )}
                        <HStack>
                          <Button
                            size="sm"
                            colorScheme="green"
                            onClick={() => handleSetRelationshipStage(selectedGirl, stageEvalResult.recommendedStage, `AI评估推荐: ${stageEvalResult.reasoning}`)}
                          >
                            采纳推荐
                          </Button>
                          <Button
                            size="sm"
                            colorScheme="gray"
                            variant="outline"
                            onClick={() => { setStageEvalResult(null); setStageReason(''); }}
                          >
                            忽略
                          </Button>
                        </HStack>
                      </Box>
                    )}

                    {/* 阶段变更历史 */}
                    <Text color="white" fontWeight="bold" mb={3}>变更历史</Text>
                    {stageHistory.length === 0 ? (
                      <Flex h="100px" align="center" justify="center" bg="warm.700" borderRadius="md">
                        <Text color="rgba(245,240,232,0.2)" fontSize="sm">暂无历史记录</Text>
                      </Flex>
                    ) : (
                      <VStack spacing={2} align="stretch">
                        {stageHistory.map((h, i) => (
                          <Box key={i} bg="warm.700" p={3} borderRadius="md">
                            <Flex align="center" justify="space-between" mb={1}>
                              <HStack>
                                <Badge colorScheme="gray" fontSize="xs">{h.fromStage ? getRelationshipStageLabel(h.fromStage) : '新建'}</Badge>
                                <Icon as={FiArrowRight} color="rgba(245,240,232,0.2)" boxSize={3} />
                                <Badge colorScheme={getRelationshipStageColor(h.toStage)} fontSize="xs">
                                  {getRelationshipStageLabel(h.toStage)}
                                </Badge>
                              </HStack>
                              <Text color="rgba(245,240,232,0.2)" fontSize="xs">
                                {new Date(h.createdAt).toLocaleString()}
                              </Text>
                            </Flex>
                            <Text color="rgba(245,240,232,0.4)" fontSize="xs">
                              {h.reason || '无备注'} {h.source && `(${h.source === 'ai' ? 'AI评估' : h.source === 'manual' ? '手动设置' : h.source})`}
                            </Text>
                            {h.changedBy && (
                              <Text color="warm.600" fontSize="xs">by {h.changedBy}</Text>
                            )}
                          </Box>
                        ))}
                      </VStack>
                    )}
                  </TabPanel>

                  {/* M007 S03: 反撇分析 Tab */}
                  <TabPanel px={0}>
                    <VStack spacing={4} align="stretch">
                      {/* 快速风险判断 */}
                      {reversalRisk && (
                        <Flex align="center" justify="space-between" bg="warm.700" p={4} borderRadius="md">
                          <HStack spacing={3}>
                            <Badge colorScheme={
                              reversalRisk.riskLevel === 'high' ? 'red' :
                              reversalRisk.riskLevel === 'medium' ? 'orange' : 'green'
                            } fontSize="sm">
                              {reversalRisk.riskLevel === 'high' ? '高风险' :
                               reversalRisk.riskLevel === 'medium' ? '中风险' : '低风险'}
                            </Badge>
                            {reversalRisk.matchedKeywords && reversalRisk.matchedKeywords.length > 0 && (
                              <Text color="rgba(245,240,232,0.4)" fontSize="sm">
                                关键词: {reversalRisk.matchedKeywords.join(', ')}
                              </Text>
                            )}
                          </HStack>
                          <Button
                            size="sm"
                            colorScheme="purple"
                            variant="outline"
                            isLoading={reversalAnalyzing}
                            onClick={handleAnalyzeReversal}
                          >
                            AI深度分析
                          </Button>
                        </Flex>
                      )}

                      {/* AI 分析结果 */}
                      {reversalAnalyzing && (
                        <Flex align="center" justify="center" py={8} gap={2}>
                          <Spinner size="sm" color="purple.400" />
                          <Text color="rgba(245,240,232,0.4)" fontSize="sm">AI 分析中...</Text>
                        </Flex>
                      )}

                      {reversalAnalysis && (
                        <Box bg="warm.700" p={4} borderRadius="md">
                          {/* 风险标签 */}
                          <HStack mb={3} spacing={2} flexWrap="wrap">
                            <Badge colorScheme={
                              reversalAnalysis.riskLevel === 'high' ? 'red' :
                              reversalAnalysis.riskLevel === 'medium' ? 'orange' : 'green'
                            } fontSize="sm">
                              {reversalAnalysis.riskLevel === 'high' ? '反撇确认' :
                               reversalAnalysis.riskLevel === 'medium' ? '有反撇苗头' : '正常'}
                            </Badge>
                            {reversalAnalysis.type && (
                              <Badge colorScheme="purple">{reversalAnalysis.type}</Badge>
                            )}
                            <Badge colorScheme="gold">置信度 {reversalAnalysis.confidence}%</Badge>
                          </HStack>

                          {/* 建议 */}
                          {reversalAnalysis.suggestion && (
                            <Box mb={3}>
                              <Text color="rgba(245,240,232,0.4)" fontSize="sm" mb={1}>操盘手建议</Text>
                              <Text color="teal.300" fontSize="sm">{reversalAnalysis.suggestion}</Text>
                            </Box>
                          )}

                          {/* 证据 */}
                          {reversalAnalysis.evidence && reversalAnalysis.evidence.length > 0 && (
                            <Box mb={3}>
                              <Text color="rgba(245,240,232,0.4)" fontSize="sm" mb={1}>分析证据</Text>
                              <VStack spacing={1} align="stretch">
                                {reversalAnalysis.evidence.map((e, i) => (
                                  <Text key={i} color="gray.300" fontSize="xs">{i + 1}. {e}</Text>
                                ))}
                              </VStack>
                            </Box>
                          )}

                          {/* 鉴别诊断 */}
                          {reversalAnalysis.differential && (
                            <Box>
                              <Text color="rgba(245,240,232,0.4)" fontSize="sm" mb={1}>鉴别诊断</Text>
                              <Text color="rgba(245,240,232,0.4)" fontSize="xs">{reversalAnalysis.differential}</Text>
                            </Box>
                          )}

                          <Text color="warm.600" fontSize="xs" mt={3}>
                            分析时间: {new Date(reversalAnalysis.analyzedAt).toLocaleString()}
                          </Text>
                        </Box>
                      )}

                      {!reversalRisk && !reversalAnalyzing && !reversalAnalysis && (
                        <Flex align="center" justify="center" py={8} direction="column" gap={3}>
                          <Icon as={FiAlertTriangle} color="warm.600" boxSize={8} />
                          <Text color="rgba(245,240,232,0.2)" fontSize="sm">点击下方按钮启动 AI 反撇分析</Text>
                          <Button
                            size="sm"
                            colorScheme="purple"
                            onClick={handleAnalyzeReversal}
                          >
                            启动反撇分析
                          </Button>
                        </Flex>
                      )}
                    </VStack>
                  </TabPanel>
                </TabPanels>
              </Tabs>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* 截图管理弹窗 */}
      <Modal isOpen={isScreenshotOpen} onClose={onScreenshotClose} size={{ base: 'full', lg: '4xl' }}>
        <ModalOverlay />
        <ModalContent bg="warm.800" maxH="85vh" overflow="auto">
          <ModalHeader color="white">
            聊天截图管理 - {selectedGirl?.name}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <VStack spacing={6} align="stretch">
              {/* 上传区域 - 优化布局 */}
              <Flex gap={4} align="flex-end" bg="warm.700" p={4} borderRadius="md">
                <FormControl flex={1}>
                  <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">选择图片</FormLabel>
                  <Input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileSelect} bg="warm.600" pt={1} color="white" _placeholder={{ color: 'rgba(245,240,232,0.4)' }} />
                </FormControl>
                <FormControl flex={1}>
                  <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">备注（可选）</FormLabel>
                  <Input value={screenshotNotes} onChange={e => setScreenshotNotes(e.target.value)} placeholder="简短描述..." bg="warm.600" color="white" _placeholder={{ color: 'rgba(245,240,232,0.4)' }} />
                </FormControl>
                <Button colorScheme="gold" onClick={handleUploadScreenshot} isLoading={uploading} isDisabled={!selectedFile} h="40px">
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
                  <Flex h="200px" align="center" justify="center" bg="warm.700" borderRadius="md">
                    <Text color="rgba(245,240,232,0.2)">暂无截图记录</Text>
                  </Flex>
                ) : (
                  <SimpleGrid columns={{ base: 2, sm: 3, md: 4 }} spacing={4}>
                    {screenshots.map(ss => (
                      <Box
                        key={ss.id}
                        position="relative"
                        bg="warm.700"
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
                          fallbackSrc="https://picsum.photos/200/140"
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
                      <Flex key={ss.id} gap={4} bg="warm.700" p={3} borderRadius="md" align="center">
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
                          fallbackSrc="https://picsum.photos/80/60"
                        />
                        <Box flex={1}>
                          <Flex gap={2} mb={1}>
                            {ss.platform && <Badge colorScheme="blue" fontSize="xs">{ss.platform}</Badge>}
                            <Text color="rgba(245,240,232,0.2)" fontSize="xs">
                              {new Date(ss.createdAt).toLocaleString()}
                            </Text>
                          </Flex>
                          <Textarea
                            value={ss.notes || ''}
                            placeholder="备注..."
                            bg="warm.600"
                            size="sm"
                            rows={1}
                            onChange={(e) => {
                              const updated = screenshots.map(s => s.id === ss.id ? {...s, notes: e.target.value} : s);
                              setScreenshots(updated);
                            }}
                            onBlur={(e) => handleUpdateNotes(ss.id, e.target.value)}
                            color="white"
                            _placeholder={{ color: 'rgba(245,240,232,0.4)' }}
                          />
                        </Box>
                        <HStack spacing={2}>
                          <Button size="sm" colorScheme="gold" onClick={() => handleAiNotes(ss.id)} isLoading={aiGenerating} leftIcon={<Icon as={SparklesIcon} />}>
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

      {/* AI 识别字段确认弹窗 */}
      <Modal isOpen={isConfirmOpen} onClose={onConfirmClose} size="md">
        <ModalOverlay />
        <ModalContent bg="warm.800">
          <ModalHeader color="white">
            确认录入信息
            <Button
              size="xs"
              variant="outline"
              colorScheme="gray"
              ml={4}
              onClick={() => {
                const allChecked = Object.keys(pendingFields).every(k => confirmSelections[k]);
                const toggled = {};
                Object.keys(pendingFields).forEach(k => { toggled[k] = !allChecked; });
                setConfirmSelections(toggled);
              }}
            >
              {Object.keys(pendingFields).every(k => confirmSelections[k]) ? '反选' : '全选'}
            </Button>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6} maxH="60vh" overflowY="auto">
            <Text color="gray.300" mb={4}>
              AI 从截图中识别到以下信息，请勾选要录入档案的字段：
            </Text>
            <VStack spacing={3} align="stretch">
              {Object.entries(pendingFields).map(([key, { label, value }]) => (
                <Flex key={key} align="center" gap={3} bg="warm.700" p={3} borderRadius="md">
                  <Checkbox
                    colorScheme="gold"
                    isChecked={!!confirmSelections[key]}
                    onChange={(e) => setConfirmSelections(prev => ({ ...prev, [key]: e.target.checked }))}
                  />
                  <Box flex={1}>
                    <Text color="rgba(245,240,232,0.4)" fontSize="sm">{label}</Text>
                    <Text color="white" fontSize="md">{value}</Text>
                  </Box>
                </Flex>
              ))}
            </VStack>
            <HStack mt={6} spacing={4} justify="flex-end">
              <Button variant="ghost" colorScheme="gray" onClick={onConfirmClose}>取消</Button>
              <Button colorScheme="gold" onClick={handleConfirmFields}>
                确认录入 ({Object.values(confirmSelections).filter(Boolean).length})
              </Button>
            </HStack>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* 图片预览弹窗 */}
      <Modal isOpen={!!previewImage} onClose={() => setPreviewImage(null)} size={{ base: 'full', md: '4xl' }}>
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
