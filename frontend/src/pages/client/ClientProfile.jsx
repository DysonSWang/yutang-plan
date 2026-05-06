import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Heading, Card, CardBody, SimpleGrid, Badge, Text, VStack, HStack, Flex, Avatar, Button, Checkbox, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton, useDisclosure, FormControl, FormLabel, Input, Select, Textarea, useToast, Spinner, Icon, InputGroup, InputRightElement, IconButton, Image, Progress } from '@chakra-ui/react';
import { CrownIcon, CheckIcon } from '../../components/Icons';
import { FiEdit2, FiEye, FiEyeOff } from 'react-icons/fi';
import { api, clients, membership as membershipApi, auth, upload } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { captureError } from '../../utils/frontendErrorCapture';
import RegionSelector from '../../components/RegionSelector';
import { checkVersion, VERSION } from '../../utils/version';
import VersionUpdateModal from '../../components/VersionUpdateModal';
import useKeepAliveData from '../../hooks/useKeepAliveData';

const TYPE_LABEL = { monthly: '普惠月付', yearly: '普惠年付', premium: '高端会员', TRIAL: '试用会员' };
const TYPE_BADGE_COLOR = { monthly: 'green', yearly: 'blue', premium: 'purple', TRIAL: 'orange' };

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 空值占位符：引导用户填写而非显示冷冰冰的"-"
function EmptyValue({ children, ...props }) {
  if (children) return <Text color="white" {...props}>{children}</Text>;
  return <Text color="rgba(245,240,232,0.45)" fontSize="sm" {...props}>去完善</Text>;
}

const PRICING_DATA = [
  { type: 'monthly', label: '普惠月付', price: 999, period: '月', perMonth: 999, features: ['全功能AI教练', '约会方案生成', '学习中心', '缘分管理'] },
  { type: 'yearly', label: '普惠年付', price: 8888, period: '年', perMonth: 741, features: ['全功能AI教练', '约会方案生成', '学习中心', '缘分管理', '年付专属优惠'] },
  { type: 'premium', label: '高端会员', price: 50000, period: '年', perMonth: 4167, features: ['全功能AI教练', '约会方案生成', '学习中心', '缘分管理', '优先人工顾问', '专属定制服务'] }
];

const STAGE_COLORS = {
  '背调': 'gray',
  '建池': 'blue',
  '约会': 'orange',
  '锁定': 'green',
  '维护': 'teal',
};

// 客户可见的字段（可编辑）
const CLIENT_EDITABLE_FIELDS = [
  { key: 'nickname', label: '昵称', type: 'input' },
  { key: 'age', label: '年龄', type: 'number-select', range: [18, 80], default: 28 },
  { key: 'occupation', label: '职业', type: 'select', options: ['企业主', '企业高管', '公务员', '医生', '律师', '教师', '工程师', '程序员', '销售', '金融从业者', '自由职业', '退休', '其他'] },
  { key: 'education', label: '学历', type: 'select', options: ['小学', '初中', '中专', '高中', '大专', '本科', '硕士', '博士'] },
  { key: 'income', label: '收入水平', type: 'select', options: ['10万以下', '10-30万', '30-50万', '50-100万', '100-300万', '300万以上', '其他'] },
  { key: 'height', label: '身高(cm)', type: 'number-select', range: [140, 200], default: 170 },
  { key: 'weight', label: '体重(斤)', type: 'number-select', range: [80, 250], default: 130 },
  { key: 'residence', label: '所在地', type: 'input' },
  { key: 'hometown', label: '籍贯', type: 'input' },
  { key: 'appearance', label: '外貌描述', type: 'input' },
  { key: 'dressingStyle', label: '穿着风格', type: 'select', options: ['商务正装', '商务休闲', '休闲', '运动', '时尚', '简约', '其他'] },
  { key: 'familyBackground', label: '家庭背景', type: 'select', options: ['农村', '城市', '经商', '公务员', '其他'] },
  { key: 'familyStructure', label: '家庭结构', type: 'select', options: ['双亲', '单亲', '离异', '其他'] },
  { key: 'familyAtmosphere', label: '家庭氛围', type: 'select', options: ['和睦', '一般', '冷淡', '争吵', '离异'] },
  { key: 'personality', label: '性格/MBTI', type: 'select', options: ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP', '其他'] },
  { key: 'communicationStyle', label: '沟通风格', type: 'select', options: ['直接', '含蓄', '话多', '话少', '幽默'] },
  { key: 'socialStyle', label: '社交风格', type: 'select', options: ['主动', '被动', '社交达人', '其他'] },
  { key: 'relationshipAttitude', label: '婚恋态度', type: 'select', options: ['认真', '随便', '急切'] },
  { key: 'marriageHistory', label: '婚史', type: 'select', options: ['未婚', '离异无子', '离异有子', '丧偶', '其他'] },
  { key: 'emotionalGoal', label: '感情诉求', type: 'select', options: ['认真找对象', '随便玩玩', '家里催婚', '空虚寂寞', '其他'] },
  { key: 'relationshipGoal', label: '关系目标', type: 'select', options: ['短期', '长期', '不确定'] },
  { key: 'humorStyle', label: '幽默风格', type: 'select', options: ['冷幽默', '自嘲', '调侃', '正经'] },
  { key: 'strengths', label: '个人优势', type: 'textarea' },
  { key: 'weaknesses', label: '个人不足', type: 'textarea' },
  { key: 'matchPreferences', label: '对目标的期望', type: 'textarea' },
  { key: 'dateTaboos', label: '禁忌', type: 'textarea' },
  { key: 'profileBio', label: '个人签名', type: 'textarea' },
];

// 不显示给客户的字段（操盘手内部使用）

// 字段所属版块（用于编辑弹窗滚动定位）
const FIELD_SECTIONS = {
  nickname: 'basic', age: 'basic', occupation: 'basic', education: 'basic', income: 'basic',
  height: 'appearance', weight: 'appearance', dressingStyle: 'appearance', appearance: 'appearance',
  familyBackground: 'family', familyStructure: 'family', familyAtmosphere: 'family',
  personality: 'personality', communicationStyle: 'personality', socialStyle: 'personality', humorStyle: 'personality',
  relationshipAttitude: 'emotion', relationshipGoal: 'emotion', emotionalGoal: 'emotion', marriageHistory: 'emotion',
  strengths: 'value', weaknesses: 'value',
  matchPreferences: 'preference', dateTaboos: 'preference',
  residence: 'basic', hometown: 'basic', profileBio: 'bio',
};
const getSectionForField = (key) => FIELD_SECTIONS[key] || 'basic';

const HIDDEN_FIELDS = [
  'trustLevel', 'interactionHeat', 'girlCount', 'dateCount',
  'coachCooperation', 'learningAbility', 'feedbackQuality',
  'assetsLevel', 'budgetRange', 'timeInvestment',
  'balance', 'notes', 'source',
  'strengths', 'weaknesses', 'clientType',
  'selfValuePerception', 'cognitiveAccuracy',
  'signals', 'pendingActions', 'observations', 'conversationSummary',
  'matchPreferences', 'dealbreakers',
  'profilePhotos', 'preferredPlatforms',
  'openingTemplates', 'petPhrases', 'chatTaboos', 'humorStyle',
  'currentStage', 'stageProgress', 'lastMilestone',
  'selfEsteemLevel', 'antiFrustrationLevel', 'pacePreference',
  'investmentWillingness', 'comfortZone',
  'emotionalStable', 'eqLevel', 'familyMembers', 'familyBurden',
  'pastRelationshipSummary', 'emotionalWounds', 'exPartnerTaboos',
  'commitmentWillingness', 'emotionalMaturity',
  'serviceStage', 'role', 'username', 'createdAt', 'updatedAt',
  'voiceSamples', 'chatPartnerId', 'empathy', 'selfAwareness',
  'communication', 'relationship', 'conflictRes', 'isKinkOriented',
  'kinkIdentity', 'kinkBoundaries', 'kinkInterests', 'kinkExperience', 'kinkNotes'
];

// 所有字段的中文标签映射（client可编辑 + 操盘手内部字段），AI提取结果展示用
const ALL_FIELD_LABELS = {};
CLIENT_EDITABLE_FIELDS.forEach(f => { ALL_FIELD_LABELS[f.key] = f.label; });
Object.assign(ALL_FIELD_LABELS, {
  emotionalStable: '情绪稳定性', eqLevel: '情商', emotionalMaturity: '情感成熟度',
  emotionalMaturityLevel: '情感成熟度等级', learningAbility: '学习能力',
  coachCooperation: '教练配合度', coachCooperationLevel: '教练配合等级',
  attachmentStyle: '依恋类型', loveStyle: '恋爱类型', moneyDatingPattern: '约会付款模式',
  humorStyle: '幽默风格', selfEsteemLevel: '自信水平', pacePreference: '节奏偏好',
  assetsLevel: '资产等级', clientType: '客户类型', empathy: '共情能力',
  communication: '沟通表达能力', conflictRes: '冲突处理能力',
  appearanceSelfAssessment: '自我颜值评价', appearanceSelfRequirement: '对对方颜值要求',
  strengths: '优势', weaknesses: '不足', dateTaboos: '禁忌', notes: '备注',
  trustLevel: '信任度', interactionHeat: '互动热度', feedbackQuality: '反馈质量',
  budgetRange: '预算范围', timeInvestment: '时间投入', balance: '余额', source: '来源',
  selfValuePerception: '自我价值感知', cognitiveAccuracy: '认知准确性',
  matchPreferences: '匹配偏好', dealbreakers: '底线',
  preferredPlatforms: '偏好平台', openingTemplates: '开场模板', petPhrases: '口头禅',
  chatTaboos: '聊天禁忌', currentStage: '当前阶段', stageProgress: '阶段进展',
  lastMilestone: '上次里程碑', antiFrustrationLevel: '抗挫折水平',
  investmentWillingness: '投资意愿', comfortZone: '舒适区',
  familyMembers: '家庭成员', familyBurden: '家庭负担',
  pastRelationshipSummary: '过往感情总结', emotionalWounds: '情感创伤',
  exPartnerTaboos: '前任禁忌', commitmentWillingness: '承诺意愿',
  serviceStage: '服务阶段', selfAwareness: '自我认知', relationship: '人际关系',
  isKinkOriented: 'Kink导向', kinkIdentity: 'Kink身份', kinkBoundaries: 'Kink边界',
  kinkInterests: 'Kink兴趣', kinkExperience: 'Kink经验', kinkNotes: 'Kink备注',
  weight: '体重(斤)',
  matchPreferences: '对目标的期望',
});

// 单个字段组件（避免整体重渲染）
function ProfileField({ field, value, onChange }) {
  // 数字选择器：生成范围选项
  if (field.type === 'number-select') {
    const [min, max] = field.range;
    const step = field.step || 1;
    const options = [];
    for (let i = min; i <= max; i += step) options.push(i);
    return (
      <FormControl key={field.key}>
        <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">{field.label}</FormLabel>
        <Select
          value={value || (field.default ? String(field.default) : '')}
          onChange={e => onChange(field.key, e.target.value)}
          bg="warm.700" color="white" border="1px solid" borderColor="warm.600"
          _hover={{ borderColor: 'rgba(245,240,232,0.2)' }}
          _focus={{ borderColor: 'teal.500', boxShadow: '0 0 0 1px var(--chakra-colors-teal-500)' }}
        >
          {options.map(n => (
            <option key={n} value={String(n)}>{n}</option>
          ))}
        </Select>
      </FormControl>
    );
  }
  if (field.type === 'input') {
    return (
      <FormControl key={field.key}>
        <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">{field.label}</FormLabel>
        <Input
          value={value || ''}
          onChange={e => onChange(field.key, e.target.value)}
          bg="warm.700" color="white" border="1px solid" borderColor="warm.600"
          _hover={{ borderColor: 'rgba(245,240,232,0.2)' }}
          _focus={{ borderColor: 'teal.500', boxShadow: '0 0 0 1px var(--chakra-colors-teal-500)' }}
        />
      </FormControl>
    );
  }
  if (field.type === 'select') {
    const hasOther = field.options.includes('其他');
    const isCustom = hasOther && value && !field.options.includes(value);
    const showCustomInput = hasOther && (value === '其他' || isCustom);
    return (
      <FormControl key={field.key}>
        <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">{field.label}</FormLabel>
        <Select
          value={isCustom ? '其他' : (value || '')}
          onChange={e => onChange(field.key, e.target.value)}
          bg="warm.700" color="white" border="1px solid" borderColor="warm.600"
          _hover={{ borderColor: 'rgba(245,240,232,0.2)' }}
          _focus={{ borderColor: 'teal.500', boxShadow: '0 0 0 1px var(--chakra-colors-teal-500)' }}
        >
          <option value="">请选择</option>
          {field.options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </Select>
        {showCustomInput && (
          <Input
            mt={2}
            value={isCustom ? value : ''}
            placeholder="请输入"
            onChange={e => onChange(field.key, e.target.value)}
            bg="warm.700" color="white" border="1px solid" borderColor="warm.600"
            _hover={{ borderColor: 'rgba(245,240,232,0.2)' }}
            _focus={{ borderColor: 'teal.500', boxShadow: '0 0 0 1px var(--chakra-colors-teal-500)' }}
          />
        )}
      </FormControl>
    );
  }
  if (field.type === 'textarea') {
    return (
      <FormControl key={field.key}>
        <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">{field.label}</FormLabel>
        <Textarea
          value={value || ''}
          onChange={e => onChange(field.key, e.target.value)}
          bg="warm.700" color="white" border="1px solid" borderColor="warm.600"
          _hover={{ borderColor: 'rgba(245,240,232,0.2)' }}
          _focus={{ borderColor: 'teal.500', boxShadow: '0 0 0 1px var(--chakra-colors-teal-500)' }}
          rows={3}
        />
      </FormControl>
    );
  }
  if (field.type === 'region') {
    return (
      <FormControl key={field.key}>
        <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">{field.label}</FormLabel>
        <RegionSelector
          value={value || ''}
          onChange={val => onChange(field.key, val)}
        />
      </FormControl>
    );
  }
  return null;
}

export default function ClientProfile() {
  const { logout } = useAuth();
  const [saving, setSaving] = useState(false);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isPricingOpen, onOpen: onPricingOpen, onClose: onPricingClose } = useDisclosure();
  const { isOpen: isVersionOpen, onOpen: onVersionOpen, onClose: onVersionClose } = useDisclosure();
  const { isOpen: isPwdOpen, onOpen: onPwdOpen, onClose: onPwdClose } = useDisclosure();
  const { isOpen: isRenewalOpen, onOpen: onRenewalOpen, onClose: onRenewalClose } = useDisclosure();
  const [renewalType, setRenewalType] = useState('monthly');
  const [renewing, setRenewing] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);
  const [editTab, setEditTab] = useState(null);
  const editModalBodyRef = useRef(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiExtracting, setAiExtracting] = useState(false);
  const [aiStreamText, setAiStreamText] = useState('');
  const [aiExtractedFields, setAiExtractedFields] = useState(null);
  const [aiScreenshotThinking, setAiScreenshotThinking] = useState(false);
  const [aiScreenshotStep, setAiScreenshotStep] = useState(''); // '上传图片' | 'AI 思考中...' | '解析信号...' | '生成报告...'
  const [aiScreenshotThinkingContent, setAiScreenshotThinkingContent] = useState('');
  const [aiScreenshotFile, setAiScreenshotFile] = useState(null);
  const [aiScreenshotPreview, setAiScreenshotPreview] = useState('');
  const [aiConfirmSelections, setAiConfirmSelections] = useState({});
  const fileInputRef = useRef(null);
  const screenshotInputRef = useRef(null);
  const aiStreamRef = useRef('');
  const aiStreamRafRef = useRef(null);
  const toast = useToast();

  const { data, isInitialLoad, refresh } = useKeepAliveData(async () => {
    const [clientRes, memberRes, compRes] = await Promise.all([
      clients.me(),
      membershipApi.status().catch(() => ({ success: false })),
      membershipApi.profileCompleteness().catch(() => ({ success: false })),
    ]);
    let profile = null;
    let editData = {};
    if (clientRes.success) {
      profile = clientRes.client;
      CLIENT_EDITABLE_FIELDS.forEach(f => {
        editData[f.key] = clientRes.client[f.key] || '';
      });
    }
    return {
      profile,
      editData,
      memberStatus: memberRes.success ? memberRes : null,
      completeness: compRes.success ? compRes.completeness : null,
    };
  }, { key: '/profile' });

  const profile = data?.profile;
  const memberStatus = data?.memberStatus;
  const completeness = data?.completeness;
  const renewalPrice = memberStatus?.prices?.[renewalType] || PRICING_DATA.find(p => p.type === renewalType)?.price || 0;
  const renewalPointsInsufficient = (memberStatus?.points || 0) < renewalPrice;
  // editData 用本地 state，方便表单修改
  const [editData, setEditData] = useState(data?.editData ?? {});
  useEffect(() => {
    if (data?.editData) setEditData(data.editData);
  }, [data]);

  const handleFieldChange = useCallback((key, val) => {
    setEditData(prev => ({ ...prev, [key]: val }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await clients.update(profile.id, editData);
      if (res.success) {
        toast({ title: '保存成功', status: 'success' });
        onClose();
        refresh();
        // 档案更新后检查是否需要重新生成个性化内容
        try {
          const perRes = await membershipApi.personalizedStatus();
          if (perRes?.success && perRes.chapters?.some(c => c.status === 'completed')) {
            toast({
              title: '档案已更新',
              description: '你的专属学习版本可能需要重新生成以匹配新档案。前往学习中心重新生成。',
              status: 'info',
              duration: 4000,
              isClosable: true,
            });
          }
        } catch {}
      } else {
        toast({ title: '保存失败', status: 'error', duration: 4000 });
      }
    } catch (e) {
      toast({ title: '保存失败', status: 'error', duration: 4000 });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (section = null) => {
    const data = {};
    CLIENT_EDITABLE_FIELDS.forEach(f => {
      data[f.key] = profile[f.key] || (f.default ? String(f.default) : '');
    });
    setEditData(data);
    setAiText('');
    setAiStreamText('');
    setAiExtractedFields(null);
    setAiScreenshotFile(null);
    setAiScreenshotPreview('');
    setAiConfirmSelections({});
    setEditTab(section);
    onOpen();
    setTimeout(() => {
      if (section) {
        const target = document.querySelector('[data-section="' + section + '"]');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 150);
  };

  // AI 文本提取
  const handleAiTextExtract = async () => {
    if (!aiText.trim() || aiText.trim().length < 20) {
      toast({ title: '请至少输入20字的自我介绍', status: 'warning', duration: 3000 });
      return;
    }
    setAiExtracting(true);
    setAiExtractedFields(null);
    setAiStreamText('');
    aiStreamRef.current = '';

    const token = api.getToken();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);

    try {
      const res = await fetch(`${api.baseUrl}/api/clients/extract-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ text: aiText }),
        signal: controller.signal
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'AI服务请求失败');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        // 按空行分割 SSE 事件
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const eventBlock of events) {
          if (!eventBlock.trim()) continue;
          const eventType = (eventBlock.match(/event:\s*(\w+)/) || [])[1];
          const dataMatch = eventBlock.match(/data:\s*(.+)/);
          const dataStr = dataMatch ? dataMatch[1].trim() : '';

          if (eventType === 'progress') {
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.text) {
                aiStreamRef.current += parsed.text;
                if (!aiStreamRafRef.current) {
                  aiStreamRafRef.current = requestAnimationFrame(() => {
                    setAiStreamText(aiStreamRef.current);
                    aiStreamRafRef.current = null;
                  });
                }
              }
            } catch {}
          } else if (eventType === 'done') {
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.success && parsed.profile) {
                setAiExtractedFields(parsed.profile);
                // 默认全选
                const selections = {};
                Object.keys(parsed.profile).forEach(k => { selections[k] = true; });
                setAiConfirmSelections(selections);
                toast({ title: 'AI 分析完成', description: `识别到 ${Object.keys(parsed.profile).filter(k => parsed.profile[k]).length} 个字段`, status: 'success' });
              }
            } catch {}
          } else if (eventType === 'error') {
            try {
              const parsed = JSON.parse(dataStr);
              throw new Error(parsed.error || 'AI分析失败');
            } catch (e) { throw e; }
          }
        }
      }
    } catch (e) {
      captureError(e);
      if (e.name === 'AbortError') {
        toast({ title: 'AI 分析超时', description: '请稍后重试', status: 'error', duration: 4000 });
      } else {
        toast({ title: 'AI 分析失败', description: e.message || '请重试', status: 'error', duration: 4000 });
      }
    } finally {
      clearTimeout(timeoutId);
      if (aiStreamRafRef.current) {
        cancelAnimationFrame(aiStreamRafRef.current);
        aiStreamRafRef.current = null;
      }
      setAiExtracting(false);
    }
  };

  // AI 截图提取
  const handleAiScreenshotExtract = async () => {
    if (!aiScreenshotFile) {
      toast({ title: '请先选择截图文件', status: 'warning', duration: 3000 });
      return;
    }
    setAiExtracting(true);
    setAiScreenshotThinking(true);
    setAiExtractedFields(null);
    setAiScreenshotStep('上传图片');
    setAiScreenshotThinkingContent('正在上传截图...');

    // 模拟思考步骤（实际 AI 分析会更快）
    const steps = [
      { step: 'AI 思考中...', content: '正在识别截图中的对话内容...', duration: 2000 },
      { step: '解析信号...', content: '提取用户画像信息和关系信号...', duration: 1500 },
      { step: '生成报告...', content: '整合分析结果，生成档案更新建议...', duration: 1000 },
    ];

    let stepIndex = 0;
    const stepTimer = setInterval(() => {
      stepIndex++;
      if (stepIndex < steps.length) {
        setAiScreenshotStep(steps[stepIndex].step);
        setAiScreenshotThinkingContent(steps[stepIndex].content);
      }
    }, steps[0].duration);

    try {
      const res = await clients.extractFromScreenshot(aiScreenshotFile);

      clearInterval(stepTimer);
      setAiScreenshotStep('分析完成');

      if (res.success && res.pendingFields) {
        setAiExtractedFields(res.pendingFields);
        const selections = {};
        Object.keys(res.pendingFields).forEach(k => { selections[k] = true; });
        setAiConfirmSelections(selections);
        const count = Object.keys(res.pendingFields).filter(k => res.pendingFields[k]).length;
        setAiScreenshotThinkingContent(`识别到 ${count} 个字段，已选中待确认`);
        toast({ title: 'AI 分析完成', description: `识别到 ${count} 个字段`, status: 'success' });
      } else {
        setAiScreenshotThinkingContent('未识别到客户信息，请尝试其他截图');
        toast({ title: res.message || '未识别到信息', status: 'warning', duration: 3000 });
      }
    } catch (e) {
      clearInterval(stepTimer);
      captureError(e);
      if (e.name === 'AbortError') {
        setAiScreenshotStep('超时');
        setAiScreenshotThinkingContent('AI 分析超时，请稍后重试');
        toast({ title: 'AI 分析超时', description: '图片较大，请稍后重试', status: 'error', duration: 4000 });
      } else {
        setAiScreenshotStep('失败');
        setAiScreenshotThinkingContent('分析失败，请重试');
        toast({ title: '截图分析失败', description: e.message || '请重试', status: 'error', duration: 4000 });
      }
    } finally {
      setTimeout(() => {
        setAiExtracting(false);
        setAiScreenshotThinking(false);
        setAiScreenshotStep('');
      }, 1500);
    }
  };

  // 将勾选的 AI 字段应用到编辑表单
  const handleApplySelectedFields = () => {
    if (!aiExtractedFields) return;
    const updates = {};
    Object.entries(aiExtractedFields).forEach(([key, value]) => {
      if (aiConfirmSelections[key] && value && CLIENT_EDITABLE_FIELDS.some(f => f.key === key)) {
        updates[key] = value;
      }
    });
    if (Object.keys(updates).length === 0) {
      toast({ title: '请至少选择一个字段', status: 'warning', duration: 3000 });
      return;
    }
    setEditData(prev => ({ ...prev, ...updates }));
    toast({ title: `已应用 ${Object.keys(updates).length} 个字段`, description: '请检查并修改后保存', status: 'success' });
  };

  // 截图文件选择
  const handleScreenshotSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAiScreenshotFile(file);
    setAiScreenshotPreview(URL.createObjectURL(file));
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const info = await checkVersion();
      if (info?.hasUpdate) {
        setUpdateInfo(info);
        onVersionOpen();
      } else {
        toast({ title: '已是最新版本', description: `V${VERSION}`, status: 'success', duration: 3000 });
      }
    } catch (e) {
      toast({ title: '检查更新失败', status: 'error', duration: 4000, duration: 3000 });
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      toast({ title: '请填写所有密码字段', status: 'warning', duration: 3000 });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: '两次输入的新密码不一致', status: 'warning', duration: 3000 });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: '新密码至少8位', status: 'warning', duration: 3000 });
      return;
    }
    setChangingPwd(true);
    try {
      const res = await auth.changePassword(oldPassword, newPassword, confirmPassword);
      if (res.success) {
        toast({ title: '密码修改成功', status: 'success' });
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        onPwdClose();
      } else {
        toast({ title: res.error || '修改失败', status: 'error', duration: 4000 });
      }
    } catch (e) {
      toast({ title: e.message || '修改失败', status: 'error', duration: 4000 });
    } finally {
      setChangingPwd(false);
    }
  };

  const handleRenewalSubmit = async () => {
    setRenewing(true);
    try {
      const res = await membershipApi.purchase(renewalType, renewalPrice);
      if (res.success) {
        toast({ title: '续费成功', description: '会员有效期已延长', status: 'success', duration: 3000 });
        onRenewalClose();
        await refresh();
        setRenewalType('monthly');
      } else {
        toast({ title: res.error?.message || '续费失败', status: 'error', duration: 4000 });
      }
    } catch (e) {
      toast({ title: e.message || '续费失败', status: 'error', duration: 4000 });
    } finally {
      setRenewing(false);
    }
  };

  const handleAvatarFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: '请选择图片文件', status: 'warning', duration: 3000 });
      return;
    }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSaveAvatar = async () => {
    if (!avatarFile) {
      toast({ title: '请先选择图片', status: 'warning', duration: 3000 });
      return;
    }
    setSavingAvatar(true);
    try {
      const uploadRes = await upload.image(avatarFile);
      if (!uploadRes.url) {
        toast({ title: '上传失败', status: 'error', duration: 4000, duration: 2000 });
        return;
      }
      const res = await clients.update(profile.id, { avatar: uploadRes.url });
      if (res.success) {
        refresh();
        toast({ title: '头像已更新', status: 'success', duration: 2000 });
        setEditingAvatar(false);
        setAvatarFile(null);
        setAvatarPreview('');
      }
    } catch (e) {
      toast({ title: '更新失败', status: 'error', duration: 4000, duration: 2000 });
    } finally {
      setSavingAvatar(false);
    }
  };

  const triggerAvatarFileSelect = () => {
    fileInputRef.current?.click();
  };

  if (isInitialLoad) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="xl" color="teal.400" />
      </Flex>
    );
  }

  if (!profile) {
    return <Box color="white">无法加载档案</Box>;
  }

  // 档案完整度 — 使用后端统一加权计算
  const completenessPercent = completeness?.percentage ?? 0;
  const completenessMissing = completeness?.missingFields ?? [];

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={6}>
        <Heading color="white">我的档案</Heading>
      </Flex>

      {/* 个人信息 + 会员合并卡片 */}
      <Card bg="warm.800" mb={4} borderLeft="3px solid" borderColor="teal.400" sx={{ boxShadow: '0 0 20px rgba(0, 212, 170, 0.08)' }}>
        <CardBody>
          {/* 上排：头像 + 基本信息 | 会员信息 */}
          <HStack spacing={6} align="start" mb={4}>
            {/* 左侧：头像 + 昵称 */}
            <HStack spacing={3} minW="0">
              <Box position="relative" flexShrink={0}>
                <Avatar size="lg" name={profile.nickname || profile.username} src={profile.avatar} bg="teal.500" />
                <IconButton
                  aria-label="编辑头像"
                  icon={<Icon as={FiEdit2} />}
                  size="xs"
                  colorScheme="gold"
                  position="absolute"
                  bottom={0}
                  right={0}
                  borderRadius="full"
                  onClick={triggerAvatarFileSelect}
                />
              </Box>
              <Box minW="0">
                <Text color="white" fontSize="lg" fontWeight="bold" noOfLines={1}>{profile.nickname || profile.username}</Text>
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">{profile.occupation || profile.education || '未填写'}</Text>
              </Box>
            </HStack>

            {/* 右侧：会员信息 */}
            <Box flex={1} pl={6} borderLeft="1px solid" borderColor="warm.700">
              {memberStatus?.membership ? (
                <VStack spacing={1.5} align="stretch">
                  <HStack justify="space-between">
                    <Text color="rgba(245,240,232,0.4)" fontSize="xs">会员类型</Text>
                    <Badge colorScheme={TYPE_BADGE_COLOR[memberStatus.membership.type] || 'brand'} px={2} py={0.5} borderRadius="md" fontSize="xs">
                      {TYPE_LABEL[memberStatus.membership.type] || '会员'}
                    </Badge>
                  </HStack>
                  <HStack justify="space-between">
                    <Text color="rgba(245,240,232,0.4)" fontSize="xs">有效期</Text>
                    <Text color="white" fontSize="xs">
                      {formatDate(memberStatus.membership.startDate)} ~ {formatDate(memberStatus.membership.endDate)}
                    </Text>
                  </HStack>
                  <HStack justify="space-between">
                    <Text color="rgba(245,240,232,0.4)" fontSize="xs">积分</Text>
                    <Badge colorScheme="orange" px={2} py={0.5} borderRadius="md" fontSize="xs">
                      {memberStatus?.points || 0}
                    </Badge>
                  </HStack>
                  <HStack spacing={2} pt={1}>
                    <Button size="xs" colorScheme="gold" onClick={onRenewalOpen}>续费</Button>
                    <Button size="xs" variant="link" color="teal.400" onClick={onPricingOpen}>定价</Button>
                  </HStack>
                </VStack>
              ) : (
                <VStack spacing={1.5} align="stretch">
                  <HStack justify="space-between">
                    <Text color="rgba(245,240,232,0.4)" fontSize="xs">会员状态</Text>
                    <Badge colorScheme="gray" px={2} py={0.5} borderRadius="md" fontSize="xs">未开通</Badge>
                  </HStack>
                  <HStack justify="space-between">
                    <Text color="rgba(245,240,232,0.4)" fontSize="xs">积分</Text>
                    <Badge colorScheme="orange" px={2} py={0.5} borderRadius="md" fontSize="xs">
                      {memberStatus?.points || 0}
                    </Badge>
                  </HStack>
                  <HStack spacing={2} pt={1}>
                    <Button size="xs" colorScheme="gold" variant="outline" leftIcon={<Icon as={CrownIcon} />} onClick={onRenewalOpen}>开通</Button>
                    <Button size="xs" variant="link" color="teal.400" onClick={onPricingOpen}>定价</Button>
                  </HStack>
                </VStack>
              )}
            </Box>
          </HStack>

          {/* 隐藏的文件输入 */}
          <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleAvatarFileChange} />

          {/* 选择后预览 + 保存 */}
          {avatarFile && (
            <HStack mb={4} p={3} bg="warm.700" borderRadius="md" spacing={3}>
              <Avatar size="md" src={avatarPreview} />
              <Text color="gray.300" fontSize="sm" flex={1}>{avatarFile.name}</Text>
              <Button size="sm" colorScheme="gold" onClick={handleSaveAvatar} isLoading={savingAvatar}>保存</Button>
              <Button size="sm" variant="ghost" onClick={() => { setAvatarFile(null); setAvatarPreview(''); }}>取消</Button>
            </HStack>
          )}

          {/* 档案完整度 + 操作按钮 */}
          <Box>
            <HStack justify="space-between" mb={1}>
              <Text color="rgba(245,240,232,0.4)" fontSize="xs">档案完整度</Text>
              <Text color={completenessPercent >= 80 ? 'green.400' : completenessPercent >= 50 ? 'yellow.400' : 'orange.400'} fontSize="xs" fontWeight="bold">{completenessPercent}%</Text>
            </HStack>
            <Progress
              value={completenessPercent}
              size="sm"
              colorScheme={completenessPercent >= 80 ? 'green' : completenessPercent >= 50 ? 'yellow' : 'gold'}
              borderRadius="full"
              bg="warm.700"
              mb={2}
              sx={{ '& > div': { transition: 'width 0.6s ease' } }}
            />
            {completenessPercent < 80 ? (
              <Text color="warm.600" fontSize="xs" mb={2}>完善档案后，AI 教练能为你提供更精准的建议</Text>
            ) : null}

          </Box>
        </CardBody>
      </Card>

      {/* 编辑档案入口，在数据展示区上方 */}
      <Flex justify="flex-end" mb={4}>
        <Button size="sm" colorScheme="gold" leftIcon={<Icon as={FiEdit2} />} onClick={openEdit}>编辑档案</Button>
      </Flex>

      <SimpleGrid columns={2} spacing={6}>
        {/* 基础信息 */}
        <Card bg="warm.800" border="1px solid" borderColor="rgba(226,176,68,0.12)" cursor="pointer" _hover={{ bg: "warm.750", borderColor: "rgba(226,176,68,0.3)", transform: "translateY(-1px)", boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }} transition="all 0.2s" onClick={() => openEdit("basic")}>
          <CardBody>
            <Heading as="h3" size="sm" color="teal.400" mb={3}>基础信息</Heading>
            <VStack spacing={2} align="stretch">
              <HStack justify="space-between">
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">年龄</Text>
                {profile.age ? <Text color="white">{profile.age}岁</Text> : <Text color="gold.400" fontSize="sm">去完善</Text>}
              </HStack>
              <HStack justify="space-between">
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">职业</Text>
                <EmptyValue>{profile.occupation}</EmptyValue>
              </HStack>
              <HStack justify="space-between">
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">学历</Text>
                <EmptyValue>{profile.education}</EmptyValue>
              </HStack>
              <HStack justify="space-between">
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">收入</Text>
                <EmptyValue>{profile.income}</EmptyValue>
              </HStack>
              <HStack justify="space-between">
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">所在地</Text>
                <EmptyValue>{profile.residence}</EmptyValue>
              </HStack>
              <HStack justify="space-between">
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">籍贯</Text>
                <EmptyValue>{profile.hometown}</EmptyValue>
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        {/* 外貌资源 */}
        <Card bg="warm.800" border="1px solid" borderColor="rgba(226,176,68,0.12)" cursor="pointer" _hover={{ bg: "warm.750", borderColor: "rgba(226,176,68,0.3)", transform: "translateY(-1px)", boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }} transition="all 0.2s" onClick={() => openEdit("appearance")}>
          <CardBody>
            <Heading as="h3" size="sm" color="teal.400" mb={3}>外貌特征</Heading>
            <VStack spacing={2} align="stretch">
              <HStack justify="space-between">
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">身高</Text>
                {profile.height ? <Text color="white">{profile.height}cm</Text> : <Text color="gold.400" fontSize="sm">去完善</Text>}
              </HStack>
              <HStack justify="space-between">
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">体重</Text>
                {profile.weight ? <Text color="white">{profile.weight}斤</Text> : <Text color="gold.400" fontSize="sm">去完善</Text>}
              </HStack>
              <HStack justify="space-between">
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">穿着风格</Text>
                <EmptyValue>{profile.dressingStyle}</EmptyValue>
              </HStack>
              <HStack justify="space-between">
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">外貌描述</Text>
                <EmptyValue maxW="150px" noOfLines={2}>{profile.appearance}</EmptyValue>
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        {/* 家庭背景 */}
        <Card bg="warm.800" border="1px solid" borderColor="rgba(226,176,68,0.12)" cursor="pointer" _hover={{ bg: "warm.750", borderColor: "rgba(226,176,68,0.3)", transform: "translateY(-1px)", boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }} transition="all 0.2s" onClick={() => openEdit("family")}>
          <CardBody>
            <Heading as="h3" size="sm" color="purple.400" mb={3}>家庭背景</Heading>
            <VStack spacing={2} align="stretch">
              <HStack justify="space-between">
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">家庭背景</Text>
                <EmptyValue>{profile.familyBackground}</EmptyValue>
              </HStack>
              <HStack justify="space-between">
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">家庭结构</Text>
                <EmptyValue>{profile.familyStructure}</EmptyValue>
              </HStack>
              <HStack justify="space-between">
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">家庭氛围</Text>
                <EmptyValue>{profile.familyAtmosphere}</EmptyValue>
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        {/* 性格画像 */}
        <Card bg="warm.800" border="1px solid" borderColor="rgba(226,176,68,0.12)" cursor="pointer" _hover={{ bg: "warm.750", borderColor: "rgba(226,176,68,0.3)", transform: "translateY(-1px)", boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }} transition="all 0.2s" onClick={() => openEdit("personality")}>
          <CardBody>
            <Heading as="h3" size="sm" color="purple.400" mb={3}>性格画像</Heading>
            <VStack spacing={2} align="stretch">
              <HStack justify="space-between">
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">性格/MBTI</Text>
                {profile.personality ? <Badge colorScheme="cyan">{profile.personality}</Badge> : <Text color="gold.400" fontSize="sm">去完善</Text>}
              </HStack>
              <HStack justify="space-between">
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">沟通风格</Text>
                <EmptyValue>{profile.communicationStyle}</EmptyValue>
              </HStack>
              <HStack justify="space-between">
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">社交风格</Text>
                <EmptyValue>{profile.socialStyle}</EmptyValue>
              </HStack>
              <HStack justify="space-between">
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">幽默风格</Text>
                <EmptyValue>{profile.humorStyle}</EmptyValue>
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        {/* 个人优势与不足 */}
        <Card bg="warm.800" border="1px solid" borderColor="rgba(226,176,68,0.12)" cursor="pointer" _hover={{ bg: "warm.750", borderColor: "rgba(226,176,68,0.3)", transform: "translateY(-1px)", boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }} transition="all 0.2s" onClick={() => openEdit("value")}>
          <CardBody>
            <Heading as="h3" size="sm" color="purple.400" mb={3}>优势与不足</Heading>
            <VStack spacing={2} align="stretch">
              <HStack justify="space-between" align="start">
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">优势</Text>
                <EmptyValue maxW="180px" textAlign="right">{profile.strengths}</EmptyValue>
              </HStack>
              <HStack justify="space-between" align="start">
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">不足</Text>
                <EmptyValue maxW="180px" textAlign="right">{profile.weaknesses}</EmptyValue>
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        {/* 情感状态 */}
        <Card bg="warm.800" border="1px solid" borderColor="rgba(226,176,68,0.12)" cursor="pointer" _hover={{ bg: "warm.750", borderColor: "rgba(226,176,68,0.3)", transform: "translateY(-1px)", boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }} transition="all 0.2s" onClick={() => openEdit("emotion")}>
          <CardBody>
            <Heading as="h3" size="sm" color="orange.400" mb={3}>情感状态</Heading>
            <VStack spacing={2} align="stretch">
              <HStack justify="space-between">
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">婚恋态度</Text>
                <EmptyValue>{profile.relationshipAttitude}</EmptyValue>
              </HStack>
              <HStack justify="space-between">
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">关系目标</Text>
                {profile.relationshipGoal ? <Badge colorScheme="green">{profile.relationshipGoal}</Badge> : <Text color="gold.400" fontSize="sm">去完善</Text>}
              </HStack>
              <HStack justify="space-between">
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">感情诉求</Text>
                <EmptyValue>{profile.emotionalGoal}</EmptyValue>
              </HStack>
              <HStack justify="space-between">
                <Text color="rgba(245,240,232,0.4)" fontSize="sm">婚史</Text>
                <EmptyValue>{profile.marriageHistory}</EmptyValue>
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        {/* 对目标的期望 */}
        <Card bg="warm.800" border="1px solid" borderColor="rgba(226,176,68,0.12)" cursor="pointer" _hover={{ bg: "warm.750", borderColor: "rgba(226,176,68,0.3)", transform: "translateY(-1px)", boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }} transition="all 0.2s" onClick={() => openEdit("preference")}>
          <CardBody>
            <Heading as="h3" size="sm" color="orange.400" mb={3}>对目标的期望</Heading>
            {profile.matchPreferences ? (
              <Text color="gray.300" fontSize="sm" whiteSpace="pre-wrap">{profile.matchPreferences}</Text>
            ) : (
              <Text color="gold.400" fontSize="sm">去完善</Text>
            )}
          </CardBody>
        </Card>

        {/* 禁忌 */}
        <Card bg="warm.800" border="1px solid" borderColor="rgba(226,176,68,0.12)" cursor="pointer" _hover={{ bg: "warm.750", borderColor: "rgba(226,176,68,0.3)", transform: "translateY(-1px)", boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }} transition="all 0.2s" onClick={() => openEdit("preference")}>
          <CardBody>
            <Heading as="h3" size="sm" color="orange.400" mb={3}>禁忌</Heading>
            {profile.dateTaboos ? (
              <Text color="gray.300" fontSize="sm" whiteSpace="pre-wrap">{profile.dateTaboos}</Text>
            ) : (
              <Text color="gold.400" fontSize="sm">去完善</Text>
            )}
          </CardBody>
        </Card>
      </SimpleGrid>

      {/* 个人签名 */}
      <Card bg="warm.800" border="1px solid" borderColor="rgba(226,176,68,0.12)" mt={6} cursor="pointer" _hover={{ bg: "warm.750", borderColor: "rgba(226,176,68,0.3)" }} transition="all 0.2s" onClick={() => openEdit("bio")}>
        <CardBody>
          <Text color="rgba(245,240,232,0.4)" fontSize="sm" mb={2}>个人签名</Text>
          {profile.profileBio ? (
            <Text color="gray.300">{profile.profileBio}</Text>
          ) : (
            <Text color="gold.400" fontSize="sm">去完善</Text>
          )}
        </CardBody>
      </Card>

      {/* 关于我们 */}
      <Box mt={8} pt={4} borderTop="1px solid" borderColor="warm.700">
        <Text color="warm.600" fontSize="xs" mb={3}>设置</Text>
        <Card bg="warm.800">
          <CardBody>
          <VStack spacing={2} align="stretch">
            <HStack justify="space-between">
              <Text color="rgba(245,240,232,0.55)" fontSize="sm">当前版本</Text>
              <Text color="white" fontSize="sm">V{VERSION}</Text>
            </HStack>
            <HStack spacing={2}>
              <Button size="sm" variant="outline" colorScheme="gold" onClick={handleCheckUpdate} isLoading={checkingUpdate}>
                检查更新
              </Button>
              <Button size="sm" variant="outline" colorScheme="orange" onClick={onPwdOpen}>
                修改密码
              </Button>
            </HStack>
            <Button
              size="sm"
              variant="ghost"
              w="full"
              mt={2}
              color="rgba(245,240,232,0.6)"
              _hover={{ color: 'white', bg: 'rgba(255,255,255,0.06)' }}
              onClick={logout}
            >
              退出登录
            </Button>
          </VStack>
        </CardBody>
      </Card>
      </Box>

      {/* 编辑档案弹窗 */}
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg="warm.800" overflow="auto">
          <ModalHeader color="white">编辑我的档案</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6} ref={editModalBodyRef} style={{ overflowY: 'auto', maxHeight: '70vh' }}>
            <VStack spacing={5} align="stretch">
              {/* AI 智能识别 */}
              <Card bg="warm.700" border="1px solid" borderColor="warm.600">
                <CardBody>
                  <Heading size="xs" color="teal.400" mb={3}>AI 智能识别</Heading>
                  <VStack spacing={3} align="stretch">
                    {/* 文字输入 */}
                    <Textarea
                      value={aiText}
                      onChange={e => setAiText(e.target.value)}
                      placeholder="粘贴自我介绍文字，AI 自动提取档案字段（年龄、职业、性格、感情观等）..."
                      rows={3}
                      bg="warm.800"
                      color="white"
                      border="1px solid"
                      borderColor="warm.600"
                      _hover={{ borderColor: 'rgba(245,240,232,0.2)' }}
                      _focus={{ borderColor: 'blue.500', boxShadow: '0 0 0 1px var(--chakra-colors-blue-500)' }}
                    />
                    <Button
                      size="sm"
                      colorScheme="blue"
                      onClick={handleAiTextExtract}
                      isLoading={aiExtracting}
                      loadingText="分析中..."
                      isDisabled={aiText.trim().length < 20}
                    >智能分析</Button>

                    {/* 流式分析进度 */}
                    {aiExtracting && aiStreamText && (
                      <Card bg="warm.800" border="1px solid" borderColor="blue.700">
                        <CardBody py={3}>
                          <Text color="blue.300" fontWeight="bold" fontSize="sm" mb={2}>AI 正在分析...</Text>
                          <Text color="gray.300" fontSize="sm" whiteSpace="pre-wrap" maxH="150px" overflowY="auto">
                            {aiStreamText}
                          </Text>
                        </CardBody>
                      </Card>
                    )}

                    {/* 或 */}
                    <HStack>
                      <Box flex={1} h="1px" bg="warm.600" />
                      <Text color="rgba(245,240,232,0.6)" fontSize="xs">或</Text>
                      <Box flex={1} h="1px" bg="warm.600" />
                    </HStack>

                    {/* 截图上传 */}
                    <Input
                      type="file"
                      accept="image/*"
                      ref={screenshotInputRef}
                      onChange={handleScreenshotSelect}
                      display="none"
                    />
                    {aiScreenshotPreview ? (
                      <Box position="relative" borderRadius="md" overflow="hidden" bg="gray.900">
                        <Image src={aiScreenshotPreview} alt="预览" maxH="160px" w="full" objectFit="contain" />
                        <IconButton
                          icon={<Icon as={FiEdit2} />}
                          size="xs"
                          position="absolute"
                          top={2}
                          right={2}
                          colorScheme="red"
                          onClick={() => { setAiScreenshotFile(null); setAiScreenshotPreview(''); setAiExtractedFields(null); setAiConfirmSelections({}); }}
                          aria-label="移除图片"
                        />
                      </Box>
                    ) : (
                      <Button
                        variant="outline"
                        colorScheme="blue"
                        onClick={() => screenshotInputRef.current?.click()}
                        h="60px"
                        borderStyle="dashed"
                      >选择聊天截图</Button>
                    )}
                    {aiScreenshotFile && (
                      <Button
                        size="sm"
                        colorScheme="blue"
                        onClick={handleAiScreenshotExtract}
                        isLoading={aiExtracting}
                        loadingText={aiScreenshotStep || '分析中...'}
                      >上传分析</Button>
                    )}

                    {/* 截图分析思考过程 */}
                    {aiScreenshotThinking && (
                      <Card bg="warm.800" border="1px solid" borderColor="blue.600">
                        <CardBody py={3}>
                          <HStack mb={2}>
                            <Spinner size="sm" color="blue.400" />
                            <Text color="blue.300" fontWeight="bold" fontSize="sm">{aiScreenshotStep || 'AI 思考中...'}</Text>
                          </HStack>
                          <Text color="rgba(245,240,232,0.5)" fontSize="xs">
                            {aiScreenshotThinkingContent}
                          </Text>
                          <Progress value={undefined} size="xs" colorScheme="blue" mt={2} isIndeterminate />
                        </CardBody>
                      </Card>
                    )}

                    {/* AI 提取结果 */}
                    {aiExtractedFields && (
                      <Card bg="warm.800" border="1px solid" borderColor="teal.600">
                        <CardBody>
                          <HStack justify="space-between" mb={3}>
                            <Text color="teal.400" fontWeight="bold" fontSize="sm">
                              AI 识别结果（共 {Object.entries(aiExtractedFields).filter(([, v]) => v).length} 个字段）
                            </Text>
                            <HStack spacing={2}>
                              <Button size="xs" variant="ghost" color="teal.400" onClick={() => {
                                const all = {};
                                Object.keys(aiExtractedFields).forEach(k => { all[k] = true; });
                                setAiConfirmSelections(all);
                              }}>全选</Button>
                              <Button size="xs" variant="ghost" color="rgba(245,240,232,0.4)" onClick={() => setAiConfirmSelections({})}>反选</Button>
                            </HStack>
                          </HStack>
                          <VStack spacing={1} align="stretch">
                            {Object.entries(aiExtractedFields).map(([key, value]) => {
                              if (!value) return null;
                              const label = ALL_FIELD_LABELS[key] || key;
                              return (
                                <HStack key={key} bg="warm.700" px={3} py={1.5} borderRadius="md">
                                  <Checkbox
                                    isChecked={!!aiConfirmSelections[key]}
                                    onChange={e => setAiConfirmSelections(prev => ({ ...prev, [key]: e.target.checked }))}
                                    colorScheme="teal"
                                    size="sm"
                                  />
                                  <Text color="rgba(245,240,232,0.4)" fontSize="sm" minW="80px">{label}</Text>
                                  <Text color="white" fontSize="sm" fontWeight="medium" flex={1}>{String(value)}</Text>
                                </HStack>
                              );
                            })}
                          </VStack>
                          <HStack justify="flex-end" mt={3} spacing={3}>
                            <Button size="sm" variant="ghost" color="rgba(245,240,232,0.4)" onClick={() => { setAiExtractedFields(null); setAiConfirmSelections({}); }}>清除</Button>
                            <Button size="sm" colorScheme="teal" onClick={handleApplySelectedFields}>应用已选字段</Button>
                          </HStack>
                        </CardBody>
                      </Card>
                    )}
                  </VStack>
                </CardBody>
              </Card>

              {/* 手动填写表单 */}
              <SimpleGrid columns={2} spacing={4} data-section-form>
                {CLIENT_EDITABLE_FIELDS.map(field => (
                  <div data-section={getSectionForField(field.key)} key={field.key}>
                  <ProfileField
                    key={field.key}
                    field={field}
                    value={editData[field.key]}
                    onChange={handleFieldChange}
                  />
                  </div>
                ))}
              </SimpleGrid>

              {/* 底部按钮 */}
              <HStack justify="flex-end" spacing={3}>
                <Button variant="ghost" color="rgba(245,240,232,0.4)" onClick={onClose}>取消</Button>
                <Button colorScheme="gold" onClick={handleSave} isLoading={saving}>保存</Button>
              </HStack>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* 定价方案弹窗 */}
      <Modal isOpen={isPricingOpen} onClose={onPricingClose} size="2xl">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent bg="warm.800" color="white" borderRadius="xl" maxH="90vh" overflowY="auto">
          <ModalHeader textAlign="center" pb={2}>
            <Icon as={CrownIcon} w={6} h={6} color="gold.400" mb={2} />
            <Text color="white">选择专属方案</Text>
            <Text color="rgba(245,240,232,0.4)" fontSize="sm" fontWeight="normal" mt={1}>联系客服，获取您的专属定制方案</Text>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6} ref={editModalBodyRef} style={{ overflowY: 'auto', maxHeight: '70vh' }}>
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
              {PRICING_DATA.map(plan => (
                <Card
                  key={plan.type}
                  bg="warm.700"
                  border="1px solid"
                  borderColor={plan.type === 'premium' ? 'purple.500' : plan.type === 'yearly' ? 'blue.500' : 'warm.600'}
                  borderRadius="xl"
                  position="relative"
                  overflow="hidden"
                >
                  {plan.type === 'premium' && (
                    <Box position="absolute" top={0} left={0} right={0} bg="purple.600" textAlign="center" py={1} fontSize="xs" fontWeight="bold">
                      最高端
                    </Box>
                  )}
                  {plan.type === 'yearly' && (
                    <Box position="absolute" top={0} left={0} right={0} bg="blue.600" textAlign="center" py={1} fontSize="xs" fontWeight="bold">
                      最受欢迎
                    </Box>
                  )}
                  <CardBody pt={plan.type !== 'monthly' ? 8 : 4}>
                    <VStack spacing={2} mb={4}>
                      <Text color="white" fontWeight="bold" fontSize="lg">{plan.label}</Text>
                      <HStack spacing={1} align="baseline">
                        <Text color="gold.400" fontSize="3xl" fontWeight="bold">¥{plan.price}</Text>
                        <Text color="rgba(245,240,232,0.4)" fontSize="sm">/{plan.period}</Text>
                      </HStack>
                      <Text color="rgba(245,240,232,0.55)" fontSize="xs">约¥{plan.perMonth}/月</Text>
                    </VStack>
                    <VStack spacing={2} align="stretch">
                      {plan.features.map((f, i) => (
                        <HStack key={i} spacing={2}>
                          <Icon as={CheckIcon} color="teal.400" boxSize={4} />
                          <Text color="gray.300" fontSize="sm">{f}</Text>
                        </HStack>
                      ))}
                    </VStack>
                  </CardBody>
                </Card>
              ))}
            </SimpleGrid>
            <Box mt={4} p={3} bg="warm.800" borderRadius="md">
              <Text color="rgba(245,240,232,0.4)" fontSize="sm" mb={2}>邀请有礼</Text>
              <SimpleGrid columns={3} spacing={2}>
                <Box textAlign="center" p={2} bg="warm.600" borderRadius="md">
                  <Text color="gold.400" fontWeight="600">500</Text>
                  <Text color="rgba(245,240,232,0.4)" fontSize="xs">普惠月付邀请积分</Text>
                </Box>
                <Box textAlign="center" p={2} bg="warm.600" borderRadius="md">
                  <Text color="blue.400" fontWeight="600">4444</Text>
                  <Text color="rgba(245,240,232,0.4)" fontSize="xs">普惠年付邀请积分</Text>
                </Box>
                <Box textAlign="center" p={2} bg="warm.600" borderRadius="md">
                  <Text color="purple.400" fontWeight="600">25000</Text>
                  <Text color="rgba(245,240,232,0.4)" fontSize="xs">高端会员邀请积分</Text>
                </Box>
              </SimpleGrid>
              <Text color="rgba(245,240,232,0.55)" fontSize="xs" mt={2}>
                积分只能用于续费抵扣，无有效期限制。被邀请人首单可享8折优惠
              </Text>
            </Box>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* 续费弹窗 */}
      <Modal isOpen={isRenewalOpen} onClose={onRenewalClose} size="md">
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg="warm.800" color="white">
          <ModalHeader>{memberStatus?.membership ? '积分续费' : '开通会员'}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6} ref={editModalBodyRef} style={{ overflowY: 'auto', maxHeight: '70vh' }}>
            {memberStatus?.membership && (
              <Box mb={4} p={3} bg="warm.700" borderRadius="md">
                <Text color="gray.300" fontSize="sm">
                  当前有效期至: {formatDate(memberStatus.membership.endDate)}
                </Text>
              </Box>
            )}

            <Text color="rgba(245,240,232,0.4)" fontSize="sm" mb={2}>选择套餐</Text>
            <SimpleGrid columns={3} spacing={2} mb={4}>
              {PRICING_DATA.map(plan => (
                <Box
                  key={plan.type}
                  p={3}
                  bg={renewalType === plan.type ? 'teal.700' : 'warm.700'}
                  borderRadius="md"
                  cursor="pointer"
                  border="2px solid"
                  borderColor={renewalType === plan.type ? 'teal.500' : 'transparent'}
                  onClick={() => { setRenewalType(plan.type); }}
                  _hover={{ borderColor: 'teal.400' }}
                  textAlign="center"
                  transition="all 0.15s"
                >
                  <Text fontSize="sm" fontWeight="bold">{plan.label}</Text>
                  <Text color="gold.300" fontSize="lg" fontWeight="bold">¥{plan.price}</Text>
                  <Text color="rgba(245,240,232,0.4)" fontSize="xs">/{plan.period}</Text>
                </Box>
              ))}
            </SimpleGrid>

            <Box p={3} bg="warm.700" borderRadius="md">
              {(() => {
                const price = renewalPrice;
                const balance = memberStatus?.points || 0;
                const insufficient = balance < price;
                return (
                  <>
                    <HStack justify="space-between" mb={3}>
                      <HStack>
                        <Text color="gray.300" fontSize="sm">需要积分</Text>
                        <Badge colorScheme="gold" fontSize="md">{price}</Badge>
                      </HStack>
                      <HStack>
                        <Text color="gray.300" fontSize="sm">可用积分</Text>
                        <Badge colorScheme={insufficient ? 'red' : 'orange'} fontSize="md">{balance}</Badge>
                      </HStack>
                    </HStack>
                    {insufficient && (
                      <Text color="red.300" fontSize="sm" mb={3}>
                        积分不足，还差 {price - balance} 积分。邀请好友购买会员可获得积分。
                      </Text>
                    )}
                    {memberStatus?.membership && (() => {
                      const d = new Date(memberStatus.membership.endDate);
                      if (renewalType === 'monthly') d.setMonth(d.getMonth() + 1);
                      else d.setFullYear(d.getFullYear() + 1);
                      return (
                        <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={2}>
                          续费后有效期至: {formatDate(d.toISOString())}
                        </Text>
                      );
                    })()}
                  </>
                );
              })()}
            </Box>

            <Text color="rgba(245,240,232,0.55)" fontSize="xs" mt={3}>
              系统仅支持积分支付，1积分=1元。
              {memberStatus?.membership
                ? '续费后有效期将在现有基础上累加。'
                : '开通后即可享受全部会员功能。'}
            </Text>
          </ModalBody>

          <ModalFooter>
            <Button variant="ghost" color="rgba(245,240,232,0.4)" mr={3} onClick={onRenewalClose}>取消</Button>
            <Button colorScheme="gold" onClick={handleRenewalSubmit} isLoading={renewing} loadingText="处理中" isDisabled={renewalPointsInsufficient}>
              {renewalPointsInsufficient ? '积分不足' : (memberStatus?.membership ? '确认续费' : '确认开通')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 版本更新弹窗 */}
      {updateInfo && (
        <VersionUpdateModal
          isOpen={isVersionOpen}
          onClose={onVersionClose}
          upgradeType={updateInfo.upgradeType}
          latestVersion={updateInfo.latestVersion}
          updateDescription={updateInfo.updateDescription}
          downloadUrl={updateInfo.downloadUrl}
        />
      )}

      {/* 修改密码弹窗 */}
      <Modal isOpen={isPwdOpen} onClose={onPwdClose} size="sm">
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg="warm.800">
          <ModalHeader color="white">修改密码</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={4}>
            <VStack spacing={4}>
              <FormControl>
                <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">旧密码</FormLabel>
                <InputGroup>
                  <Input
                    type={showOld ? 'text' : 'password'}
                    value={oldPassword}
                    onChange={e => setOldPassword(e.target.value)}
                    bg="warm.700" color="white" border="1px solid" borderColor="warm.600"
                    placeholder="请输入旧密码"
                  />
                  <InputRightElement>
                    <IconButton
                      aria-label={showOld ? '隐藏密码' : '显示密码'}
                      icon={<Icon as={showOld ? FiEyeOff : FiEye} />}
                      variant="ghost" size="sm" onClick={() => setShowOld(!showOld)}
                    />
                  </InputRightElement>
                </InputGroup>
              </FormControl>
              <FormControl>
                <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">新密码</FormLabel>
                <InputGroup>
                  <Input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    bg="warm.700" color="white" border="1px solid" borderColor="warm.600"
                    placeholder="请输入新密码（至少8位）"
                  />
                  <InputRightElement>
                    <IconButton
                      aria-label={showNew ? '隐藏密码' : '显示密码'}
                      icon={<Icon as={showNew ? FiEyeOff : FiEye} />}
                      variant="ghost" size="sm" onClick={() => setShowNew(!showNew)}
                    />
                  </InputRightElement>
                </InputGroup>
              </FormControl>
              <FormControl>
                <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">确认新密码</FormLabel>
                <InputGroup>
                  <Input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    bg="warm.700" color="white" border="1px solid" borderColor="warm.600"
                    placeholder="请再次输入新密码"
                  />
                  <InputRightElement>
                    <IconButton
                      aria-label={showConfirm ? '隐藏密码' : '显示密码'}
                      icon={<Icon as={showConfirm ? FiEyeOff : FiEye} />}
                      variant="ghost" size="sm" onClick={() => setShowConfirm(!showConfirm)}
                    />
                  </InputRightElement>
                </InputGroup>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" color="rgba(245,240,232,0.4)" mr={3} onClick={onPwdClose}>取消</Button>
            <Button colorScheme="orange" onClick={handleChangePassword} isLoading={changingPwd}>确认修改</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
