import { useState, useEffect, useCallback } from 'react';
import {
  Box, Heading, Text, SimpleGrid, Card, CardBody, Badge, VStack, HStack, Flex, Avatar,
  Button, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  ModalCloseButton, useDisclosure, FormControl, FormLabel, Input, Select, Textarea,
  useToast, Spinner, Icon, Image, Progress, Wrap, WrapItem, Tag, TagLabel, Divider, IconButton
} from '@chakra-ui/react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiEdit2, FiCamera, FiFileText, FiZap, FiUser, FiCheck, FiX } from 'react-icons/fi';
import { HeartIcon } from '../../components/Icons';
import { girls, upload, getMediaUrl } from '../../utils/api';

// ---- 阶段颜色 ----
const STAGE_COLORS = {
  '陌生': 'gray', '搭讪': 'blue', '聊天': 'cyan', '暧昧': 'yellow', '约会': 'orange', '长期': 'green',
};
const RELATIONSHIP_STAGE_LABELS = {
  EXPLORATION: '探索期', FLIRTING: '暧昧期', ADVANCEMENT: '推进期', CONFIRMATION: '确认期', STABLE: '稳定期',
};
const RELATIONSHIP_STAGE_COLORS = {
  EXPLORATION: 'gray', FLIRTING: 'pink', ADVANCEMENT: 'orange', CONFIRMATION: 'green', STABLE: 'blue',
};

// ---- 字段分组 ----
const FIELD_GROUPS = {
  basic: {
    title: '基础信息', color: 'teal.400',
    fields: ['age', 'occupation', 'education', 'major', 'residence', 'workplace', 'hometown']
  },
  appearance: {
    title: '外貌特征', color: 'teal.400',
    fields: ['appearance', 'height', 'bodyType', 'styleTags']
  },
  family: {
    title: '家庭背景', color: 'purple.400',
    fields: ['familyBackground', 'familyAtmosphere', 'familyBurden', 'familyComments']
  },
  lifestyle: {
    title: '生活状态', color: 'purple.400',
    fields: ['workSchedule', 'socialActivity', 'financialHabits']
  },
  interests: {
    title: '兴趣爱好', color: 'teal.400',
    fields: ['interests', 'dietPreferences', 'dietRestrictions', 'hobbiesDetail']
  },
  emotional: {
    title: '情感状态', color: 'orange.400',
    fields: ['relationshipAttitude', 'pastRelationshipSummary', 'emotionalWounds', 'attachmentStyle', 'dealbreakers']
  },
};

// ---- 可编辑字段配置（供编辑Modal和完整度计算使用）----
const GIRL_EDITABLE_FIELDS = [
  { key: 'name', label: '昵称', type: 'input' },
  { key: 'age', label: '年龄', type: 'input' },
  { key: 'occupation', label: '职业', type: 'select', options: ['学生', '上班族', '自由职业', '企业主', '公务员', '医生', '律师', '教师', '销售', '设计师', '程序员', '其他'] },
  { key: 'education', label: '学历', type: 'select', options: ['小学', '初中', '中专', '高中', '大专', '本科', '硕士', '博士'] },
  { key: 'major', label: '专业', type: 'input' },
  { key: 'hometown', label: '籍贯', type: 'input' },
  { key: 'residence', label: '现居城市', type: 'input' },
  { key: 'workplace', label: '工作地点', type: 'input' },
  { key: 'appearance', label: '外貌描述', type: 'input' },
  { key: 'height', label: '身高(cm)', type: 'input' },
  { key: 'bodyType', label: '体型', type: 'select', options: ['偏瘦', '标准', '微胖', '偏胖'] },
  { key: 'styleTags', label: '风格标签', type: 'input' },
  { key: 'avatar', label: '头像', type: 'media', accept: 'image/*', multiple: false },
  { key: 'familyBackground', label: '家庭背景', type: 'select', options: ['农村', '城市', '经商', '公务员', '其他'] },
  { key: 'familyAtmosphere', label: '家庭氛围', type: 'select', options: ['和睦', '离异', '单亲', '其他'] },
  { key: 'familyBurden', label: '养老负担', type: 'input' },
  { key: 'familyComments', label: '家庭备注', type: 'textarea' },
  { key: 'workSchedule', label: '作息规律', type: 'select', options: ['朝九晚五', '自由职业', '经常加班', '轮班制', '其他'] },
  { key: 'socialActivity', label: '社交活跃度', type: 'select', options: ['高', '中', '低'] },
  { key: 'financialHabits', label: '消费习惯', type: 'select', options: ['月光', '务实', '超前'] },
  { key: 'interests', label: '兴趣爱好', type: 'input' },
  { key: 'dietPreferences', label: '饮食偏好', type: 'input' },
  { key: 'dietRestrictions', label: '饮食禁忌', type: 'input' },
  { key: 'hobbiesDetail', label: '兴趣详情', type: 'textarea' },
  { key: 'relationshipAttitude', label: '婚恋态度', type: 'select', options: ['认真', '随便', '不清楚'] },
  { key: 'pastRelationshipSummary', label: '情史摘要', type: 'textarea' },
  { key: 'emotionalWounds', label: '情伤记录', type: 'input' },
  { key: 'attachmentStyle', label: '依恋类型', type: 'select', options: ['焦虑', '回避', '安全'] },
  { key: 'dealbreakers', label: '绝对雷区', type: 'input' },
  { key: 'notes', label: '备注', type: 'textarea' },
  { key: 'homepageUrl', label: '主页链接', type: 'input' },
  { key: 'photos', label: '照片上传', type: 'media', accept: 'image/*' },
  { key: 'momentPhotos', label: '朋友圈截图上传', type: 'media', accept: 'image/*' },
  { key: 'videos', label: '视频上传', type: 'media', accept: 'video/*' },
  { key: 'sourcePlatform', label: '来源平台', type: 'select', options: ['微信', 'QQ', '探探', 'Soul', '陌陌', '积目', '抖音', '小红书', '微博', '朋友介绍', '线下活动', '其他'] },
  { key: 'sourceUrl', label: '来源链接', type: 'input' },
];

// AI 提取结果展示用的全量字段标签映射
const ALL_FIELD_LABELS = {};
GIRL_EDITABLE_FIELDS.forEach(f => { ALL_FIELD_LABELS[f.key] = f.label; });
Object.assign(ALL_FIELD_LABELS, {
  name: '昵称', notes: '备注', photos: '照片', avatar: '头像',
  homepageUrl: '主页链接', videos: '视频', sourcePlatform: '来源平台', sourceUrl: '来源链接',
  personality: '性格', values_: '价值观', communicationStyle: '沟通风格',
  emotionalTriggers: '情绪触发点', talkingTopics: '喜欢话题', thingsToAvoid: '禁忌话题',
  empathy: '共情能力', selfAwareness: '自我认知', communication: '沟通能力',
  relationship: '关系经营', conflictRes: '冲突解决',
  bestApproach: '最佳策略', recommendedTopics: '推荐话题', upgradeConditions: '升级条件',
  estimatedTimeline: '预计时间线', riskFactors: '风险因素', strategicNotes: '战略备注',
  matchScore: '匹配度', matchScoreBasis: '计算依据', matePreferences: '择偶偏好',
  relationshipStage: '关系阶段', stage: '当前阶段', status: '状态',
  intimacyLevel: '亲密度', tensionScore: '关系热度', lastContact: '最后联系',
  signals: '信号', pendingActions: '待办', observations: '观察',
  conversationSummary: '对话摘要', momentPhotos: '朋友圈截图',
  isKinkOriented: 'Kink导向', kinkIdentity: 'Kink身份', kinkBoundaries: 'Kink边界',
  kinkInterests: 'Kink兴趣', kinkExperience: 'Kink经验', kinkNotes: 'Kink备注',
});

// ---- 工具函数 ----
function parseJSONField(val) {
  if (!val) return null;
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return null; }
}
function EmptyValue({ value, children, ...props }) {
  if (value !== null && value !== undefined && value !== '') {
    return <Text color="white" fontSize="sm" {...props}>{children || String(value)}</Text>;
  }
  return <Text color="gray.600" fontSize="sm" {...props}>待填写</Text>;
}

// ---- 子组件 ----
function FieldRow({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <Box>
      <Text color="gray.500" fontSize="xs">{label}</Text>
      <Text color="gray.200" fontSize="sm">{String(value)}</Text>
    </Box>
  );
}
function TagRow({ label, value }) {
  if (!value) return null;
  const tags = String(value).split(/[,，、/]/).map(t => t.trim()).filter(Boolean);
  return (
    <Box>
      <Text color="gray.500" fontSize="xs" mb={1}>{label}</Text>
      <Wrap spacing={1}>
        {tags.map((t, i) => (
          <WrapItem key={i}><Tag size="sm" colorScheme="teal" variant="subtle" borderRadius="full"><TagLabel fontSize="xs">{t}</TagLabel></Tag></WrapItem>
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
function SectionCard({ title, children, color }) {
  return (
    <Box bg="gray.700" p={4} borderRadius="md" mb={4}>
      <Text color={color || 'teal.400'} fontSize="xs" fontWeight="bold" mb={3} textTransform="uppercase" letterSpacing="wider">{title}</Text>
      {children}
    </Box>
  );
}
function MediaUploadField({ field, value, onChange }) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const multi = field.multiple !== false;
  const urls = Array.isArray(value) ? [...value] : [];

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    const newUrls = multi ? [...urls] : [];
    for (const file of files) {
      try {
        const isVideo = file.type.startsWith('video/');
        const res = isVideo ? await upload.video(file) : await upload.image(file);
        if (res.url) newUrls.push(res.url);
      } catch (err) {
        toast({ title: `${file.name} 上传失败`, status: 'error', duration: 3000 });
      }
    }
    onChange(field.key, multi ? newUrls : newUrls.slice(0, 1));
    setUploading(false);
    e.target.value = '';
  };

  const handleRemove = (index) => {
    const newUrls = urls.filter((_, i) => i !== index);
    onChange(field.key, newUrls);
  };

  const accept = field.accept || 'image/*';

  return (
    <FormControl>
      <FormLabel color="gray.400" fontSize="sm">{field.label}</FormLabel>
      <VStack align="stretch" spacing={2}>
        {urls.length > 0 && (
          <VStack align="stretch" spacing={1} maxH="200px" overflowY="auto">
            {urls.map((url, i) => (
              <HStack key={i} bg="gray.600" p={1} borderRadius="md" justify="space-between">
                {url.match(/\.(mp4|mov|webm|avi)(\?|$)/i) ? (
                  <Text color="teal.300" fontSize="xs" flex={1} isTruncated>{url.split('/').pop()}</Text>
                ) : (
                  <Image src={getMediaUrl(url)} alt="" h="40px" w="40px" objectFit="cover" borderRadius="md" flexShrink={0} />
                )}
                <IconButton
                  size="xs" variant="ghost" colorScheme="red" aria-label="删除"
                  icon={<Icon as={FiX} />} onClick={() => handleRemove(i)}
                />
              </HStack>
            ))}
          </VStack>
        )}
        {(!multi && urls.length > 0) ? null : (
          <Button
            size="xs" variant="outline" colorScheme="teal"
            leftIcon={<Icon as={FiCamera} />}
            isLoading={uploading}
            onClick={() => document.getElementById(`media-input-${field.key}`)?.click()}
          >{multi && urls.length ? '继续添加' : '上传文件'}</Button>
        )}
        <Input
          id={`media-input-${field.key}`}
          type="file"
          accept={accept}
          multiple={multi}
          onChange={handleFileSelect}
          display="none"
        />
      </VStack>
    </FormControl>
  );
}

function ProfileField({ field, value, onChange }) {
  if (field.type === 'media') {
    return <MediaUploadField field={field} value={value} onChange={onChange} />;
  }
  if (field.type === 'select') {
    const hasOther = field.options.includes('其他');
    const isCustom = hasOther && value && !field.options.includes(value);
    const showCustomInput = hasOther && (value === '其他' || isCustom);
    return (
      <FormControl>
        <FormLabel color="gray.400" fontSize="sm">{field.label}</FormLabel>
        <Select
          value={isCustom ? '其他' : (value || '')}
          onChange={e => onChange(field.key, e.target.value === '其他' ? '' : e.target.value)}
          bg="gray.700" color="white" border="1px solid" borderColor="gray.600"
          _hover={{ borderColor: 'gray.500' }}
          _focus={{ borderColor: 'teal.500', boxShadow: '0 0 0 1px var(--chakra-colors-teal-500)' }}
        >
          <option value="">请选择</option>
          {field.options.map(o => <option key={o} value={o}>{o}</option>)}
        </Select>
        {showCustomInput && (
          <Input
            mt={2}
            value={isCustom ? value : ''}
            placeholder="请输入自定义内容"
            onChange={e => onChange(field.key, e.target.value)}
            bg="gray.700" color="white" border="1px solid" borderColor="gray.600"
            _hover={{ borderColor: 'gray.500' }}
            _focus={{ borderColor: 'teal.500', boxShadow: '0 0 0 1px var(--chakra-colors-teal-500)' }}
          />
        )}
      </FormControl>
    );
  }
  if (field.type === 'textarea') {
    return (
      <FormControl>
        <FormLabel color="gray.400" fontSize="sm">{field.label}</FormLabel>
        <Textarea
          value={value || ''}
          onChange={e => onChange(field.key, e.target.value)}
          bg="gray.700" color="white" border="1px solid" borderColor="gray.600"
          _hover={{ borderColor: 'gray.500' }}
          _focus={{ borderColor: 'teal.500', boxShadow: '0 0 0 1px var(--chakra-colors-teal-500)' }}
          rows={3}
        />
      </FormControl>
    );
  }
  return (
    <FormControl>
      <FormLabel color="gray.400" fontSize="sm">{field.label}</FormLabel>
      <Input
        value={value || ''}
        onChange={e => onChange(field.key, e.target.value)}
        bg="gray.700" color="white" border="1px solid" borderColor="gray.600"
        _hover={{ borderColor: 'gray.500' }}
        _focus={{ borderColor: 'teal.500', boxShadow: '0 0 0 1px var(--chakra-colors-teal-500)' }}
      />
    </FormControl>
  );
}

// ============================================================================
// GirlDetail 主组件
// ============================================================================
export default function GirlDetail() {
  const { girlId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [girl, setGirl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [related, setRelated] = useState(null);

  // 编辑 Modal
  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure();
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);

  // AI 模式
  const [aiMode, setAiMode] = useState(false);
  const [aiTab, setAiTab] = useState(0);
  const [aiText, setAiText] = useState('');
  const [aiExtracting, setAiExtracting] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiScreenshot, setAiScreenshot] = useState(null);
  const [aiScreenshotPreview, setAiScreenshotPreview] = useState('');
  const [aiScreenshotUploading, setAiScreenshotUploading] = useState(false);

  // 头像编辑
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [savingAvatar, setSavingAvatar] = useState(false);

  useEffect(() => { loadGirl(); loadRelated(); }, [girlId]);

  const loadGirl = async () => {
    setLoading(true);
    try {
      const res = await girls.get(girlId);
      if (res.success) setGirl(res.girl);
    } catch (e) { toast({ title: '加载失败', status: 'error' }); }
    finally { setLoading(false); }
  };

  const loadRelated = async () => {
    try {
      const res = await girls.getRelated(girlId);
      if (res.success) setRelated(res);
    } catch { /* ignore */ }
  };

  // ---- 编辑 ----

  const openEdit = () => {
    const data = { ...girl };
    // 确保媒体字段为数组；avatar 是单值字符串
    if (data.avatar && typeof data.avatar === 'string') {
      try { const arr = JSON.parse(data.avatar); data.avatar = Array.isArray(arr) ? arr : [data.avatar]; } catch { data.avatar = [data.avatar]; }
    } else if (!data.avatar) { data.avatar = []; }
    ['photos', 'videos', 'momentPhotos'].forEach(k => {
      if (!data[k]) data[k] = [];
      else if (typeof data[k] === 'string') {
        try { data[k] = JSON.parse(data[k]); } catch { data[k] = []; }
      }
    });
    setEditData(data);
    setAiMode(false);
    setAiText('');
    setAiResult(null);
    setAiScreenshot(null);
    setAiScreenshotPreview('');
    onEditOpen();
  };

  const handleFieldChange = useCallback((key, value) => {
    setEditData(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...editData };
      // avatar 在 MediaUploadField 中是数组，后端期望字符串
      if (Array.isArray(payload.avatar)) payload.avatar = payload.avatar[0] || null;
      const res = await girls.clientUpdate(girlId, payload);
      if (res.success) {
        toast({ title: '保存成功', status: 'success', duration: 2000 });
        setGirl(res.girl);
        onEditClose();
      }
    } catch (e) {
      toast({ title: e.response?.data?.error || '保存失败', status: 'error' });
    } finally { setSaving(false); }
  };

  // ---- AI 文字提取 ----
  const handleAiTextExtract = async () => {
    if (!aiText.trim() || aiText.trim().length < 10) {
      toast({ title: '请至少输入10个字', status: 'warning' }); return;
    }
    setAiExtracting(true);
    setAiResult(null);
    try {
      await girls.extractText(girlId, aiText.trim(), {
        onDone: (data) => {
          if (data.pendingFields && Object.keys(data.pendingFields).length > 0) {
            setAiResult(data.pendingFields);
            toast({ title: `识别出 ${Object.keys(data.pendingFields).length} 个字段`, status: 'success', duration: 2000 });
          } else {
            toast({ title: '未识别出新信息，档案可能已较完善', status: 'info' });
          }
        },
        onError: (err) => toast({ title: err, status: 'error' }),
      });
    } catch (e) { toast({ title: e.message, status: 'error' }); }
    finally { setAiExtracting(false); }
  };

  // ---- AI 截图提取 ----
  const handleScreenshotSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAiScreenshot(file);
    setAiScreenshotPreview(URL.createObjectURL(file));
  };

  const handleScreenshotExtract = async () => {
    if (!aiScreenshot) { toast({ title: '请先选择图片', status: 'warning' }); return; }
    setAiScreenshotUploading(true);
    setAiResult(null);
    try {
      const res = await girls.extractScreenshot(girlId, aiScreenshot);
      if (res.success && res.pendingFields && Object.keys(res.pendingFields).length > 0) {
        setAiResult(res.pendingFields);
        toast({ title: `识别出 ${Object.keys(res.pendingFields).length} 个字段`, status: 'success', duration: 2000 });
      } else {
        toast({ title: res.message || '未识别出新信息', status: 'info' });
      }
    } catch (e) { toast({ title: e.message || '分析失败', status: 'error' }); }
    finally { setAiScreenshotUploading(false); }
  };

  // ---- 应用AI结果到表单 ----
  const applyAiResult = () => {
    if (!aiResult) return;
    const merged = { ...editData };
    Object.entries(aiResult).forEach(([key, { value }]) => {
      merged[key] = value;
    });
    setEditData(merged);
    setAiMode(false);
    setAiResult(null);
    toast({ title: '已应用到表单，请确认后保存', status: 'info', duration: 2000 });
  };

  // ---- 头像上传 ----
  const handleAvatarFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: '请选择图片文件', status: 'warning' });
      return;
    }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSaveAvatar = async () => {
    if (!avatarFile) { toast({ title: '请先选择图片', status: 'warning' }); return; }
    setSavingAvatar(true);
    try {
      const uploadRes = await upload.image(avatarFile);
      if (!uploadRes.url) { toast({ title: '上传失败', status: 'error' }); return; }
      const res = await girls.updateAvatar(girlId, uploadRes.url);
      if (res.success) {
        setGirl(prev => ({ ...prev, avatar: uploadRes.url }));
        toast({ title: '头像已更新', status: 'success', duration: 2000 });
        setEditingAvatar(false);
        setAvatarFile(null);
        setAvatarPreview('');
      }
    } catch (e) {
      toast({ title: '更新失败', status: 'error' });
    } finally { setSavingAvatar(false); }
  };

  // ---- 计算完整度 ----
  const calcCompleteness = () => {
    if (!girl) return 0;
    const fields = GIRL_EDITABLE_FIELDS.map(f => f.key);
    const filled = fields.filter(k => girl[k] !== null && girl[k] !== undefined && girl[k] !== '').length;
    return Math.round((filled / fields.length) * 100);
  };

  // ---- 加载态 ----
  if (loading) {
    return (
      <Flex flex={1} align="center" justify="center" minH="60vh">
        <Spinner color="teal.400" />
      </Flex>
    );
  }
  if (!girl) {
    return (
      <Flex flex={1} align="center" justify="center" minH="60vh">
        <Text color="gray.500">女生不存在</Text>
      </Flex>
    );
  }

  const completeness = calcCompleteness();
  const signals = parseJSONField(girl.signals) || [];
  const pendingActions = parseJSONField(girl.pendingActions) || [];
  const observations = parseJSONField(girl.observations) || [];
  const photos = parseJSONField(girl.photos);
  const momentPhotos = parseJSONField(girl.momentPhotos);
  const videos = parseJSONField(girl.videos);
  const relationshipStage = girl.relationshipStage;
  const lastContact = girl.lastContact
    ? new Date(girl.lastContact).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <Box pb={8}>
      {/* ---- 顶部导航 ---- */}
      <HStack mb={6} justify="space-between">
        <HStack spacing={3}>
          <IconButton icon={<Icon as={FiArrowLeft} />} variant="ghost" color="gray.400" onClick={() => navigate('/my-pond')} aria-label="返回" size="sm" />
          <Avatar size="sm" name={girl.name} src={getMediaUrl(girl.avatar) || undefined} />
          <Heading color="white" size="lg">{girl.name}</Heading>
          <Badge colorScheme={STAGE_COLORS[girl.stage] || 'gray'}>{girl.stage || '未知'}</Badge>
          {relationshipStage && (
            <Badge colorScheme={RELATIONSHIP_STAGE_COLORS[relationshipStage] || 'gray'} variant="outline">
              {RELATIONSHIP_STAGE_LABELS[relationshipStage] || relationshipStage}
            </Badge>
          )}
        </HStack>
        <Button colorScheme="teal" size="sm" leftIcon={<Icon as={FiEdit2} />} onClick={openEdit}>编辑档案</Button>
      </HStack>

      {/* ---- 档案完整度 ---- */}
      <Box mb={6} bg="gray.700" p={4} borderRadius="md">
        <HStack justify="space-between" mb={2}>
          <Text color="gray.300" fontSize="sm">档案完整度</Text>
          <Text color={completeness >= 80 ? 'green.400' : completeness >= 50 ? 'yellow.400' : 'orange.400'} fontSize="sm" fontWeight="bold">{completeness}%</Text>
        </HStack>
        <Progress value={completeness} size="sm" colorScheme={completeness >= 80 ? 'green' : completeness >= 50 ? 'yellow' : 'orange'} borderRadius="full" />
        {completeness < 80 && (
          <Text color="gray.500" fontSize="xs" mt={2}>完善档案后，AI 教练能为你提供更精准的建议</Text>
        )}
      </Box>

      {/* ---- 关系状态摘要 ---- */}
      <SimpleGrid columns={{ base: 1, sm: 2, md: 4 }} spacing={3} mb={6}>
        <Card bg="gray.700">
          <CardBody py={3}>
            <Text color="gray.500" fontSize="xs">亲密度</Text>
            <HStack mt={1}><Icon as={HeartIcon} color="red.400" boxSize={4} /><Text color="white" fontWeight="bold">Lv.{girl.intimacyLevel || 1}</Text></HStack>
          </CardBody>
        </Card>
        <Card bg="gray.700">
          <CardBody py={3}>
            <Text color="gray.500" fontSize="xs">关系热度</Text>
            <Text color="white" fontWeight="bold" mt={1}>{girl.tensionScore?.toFixed(1) || '5.0'} / 10</Text>
          </CardBody>
        </Card>
        <Card bg="gray.700">
          <CardBody py={3}>
            <Text color="gray.500" fontSize="xs">最后联系</Text>
            <Text color="white" fontSize="sm" mt={1}>{lastContact || '未记录'}</Text>
          </CardBody>
        </Card>
        <Card bg="gray.700">
          <CardBody py={3}>
            <Text color="gray.500" fontSize="xs">约会次数</Text>
            <Text color="white" fontWeight="bold" mt={1}>{related?.dates?.length || 0} 次</Text>
          </CardBody>
        </Card>
      </SimpleGrid>

      {/* ---- 档案信息（双列卡片）---- */}
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={0} gap={4}>
        {Object.entries(FIELD_GROUPS).map(([groupKey, group]) => (
          <Box key={groupKey} bg="gray.700" p={4} borderRadius="md">
            <Text color={group.color} fontSize="xs" fontWeight="bold" mb={3} textTransform="uppercase" letterSpacing="wider">{group.title}</Text>
            <SimpleGrid columns={2} spacing={3}>
              {group.fields.map(fk => {
                const val = girl[fk];
                if (fk === 'height') return <FieldRow key={fk} label="身高" value={val ? `${val}cm` : null} />;
                if (fk === 'age') return <FieldRow key={fk} label="年龄" value={val ? `${val}岁` : null} />;
                return <EmptyValue key={fk} value={val}>
                  <Box><Text color="gray.500" fontSize="xs">{getFieldLabel(fk)}</Text><Text color="gray.200" fontSize="sm">{val}</Text></Box>
                </EmptyValue>;
              })}
            </SimpleGrid>
            {(groupKey === 'appearance' && girl.styleTags) && <TagRow label="风格标签" value={girl.styleTags} />}
            {(groupKey === 'interests') && <TagRow label="兴趣标签" value={girl.interests} />}
          </Box>
        ))}
      </SimpleGrid>

      {/* ---- 照片与媒体 ---- */}
      <Box mt={4}>
        <Heading color="white" size="md" mb={4}>照片与媒体</Heading>
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          {/* 头像 + 主页链接 */}
          <Box bg="gray.700" p={4} borderRadius="md">
            <Text color="teal.400" fontSize="xs" fontWeight="bold" mb={3} textTransform="uppercase" letterSpacing="wider">头像与主页</Text>
            <HStack spacing={4} align="start">
              <Box position="relative" flexShrink={0}>
                <Avatar size="lg" name={girl.name} src={getMediaUrl(girl.avatar) || undefined} bg="teal.500" />
                <IconButton
                  aria-label="编辑头像"
                  icon={<Icon as={FiEdit2} />}
                  size="xs"
                  colorScheme="teal"
                  position="absolute"
                  bottom={0}
                  right={0}
                  borderRadius="full"
                  onClick={() => setEditingAvatar(!editingAvatar)}
                />
              </Box>
              <VStack spacing={2} flex={1} align="stretch">
                {editingAvatar && (
                  <Box p={2} bg="gray.600" borderRadius="md">
                    <VStack align="stretch" spacing={2}>
                      <Input type="file" accept="image/*" onChange={handleAvatarFileChange} bg="gray.700" color="white" border="1px solid" borderColor="gray.500" p={1} size="sm"
                        sx={{ '::file-selector-button': { bg: 'teal.600', color: 'white', border: 'none', borderRadius: 'md', px: 2, py: 0.5, mr: 2, cursor: 'pointer', _hover: { bg: 'teal.500' } } }}
                      />
                      {avatarPreview && <Avatar size="sm" src={avatarPreview} />}
                      <HStack spacing={2}>
                        <Button size="xs" colorScheme="teal" onClick={handleSaveAvatar} isLoading={savingAvatar} isDisabled={!avatarFile}>保存</Button>
                        <Button size="xs" variant="ghost" onClick={() => { setEditingAvatar(false); setAvatarFile(null); setAvatarPreview(''); }}>取消</Button>
                      </HStack>
                    </VStack>
                  </Box>
                )}
                <EmptyValue value={girl.homepageUrl}>
                  <Text color="gray.500" fontSize="xs">主页链接</Text>
                  <Text color="teal.300" fontSize="sm" noOfLines={1} wordBreak="break-all">{girl.homepageUrl}</Text>
                </EmptyValue>
                <EmptyValue value={girl.sourcePlatform}>
                  <Text color="gray.500" fontSize="xs">来源平台</Text>
                  <Text color="gray.200" fontSize="sm">{girl.sourcePlatform}</Text>
                </EmptyValue>
                <EmptyValue value={girl.sourceUrl}>
                  <Text color="gray.500" fontSize="xs">来源链接</Text>
                  <Text color="gray.400" fontSize="xs" noOfLines={1} wordBreak="break-all">{girl.sourceUrl}</Text>
                </EmptyValue>
              </VStack>
            </HStack>
          </Box>

          {/* 照片 */}
          <Box bg="gray.700" p={4} borderRadius="md">
            <Text color="teal.400" fontSize="xs" fontWeight="bold" mb={3} textTransform="uppercase" letterSpacing="wider">
              照片{photos?.length ? ` (${photos.length})` : ''}
            </Text>
            {photos && photos.length > 0 ? (
              <SimpleGrid columns={Math.min(photos.length, 4)} spacing={2}>
                {photos.map((url, i) => (
                  <Image key={i} src={getMediaUrl(url)} alt={`照片${i+1}`} h="100px" w="100%" objectFit="cover" borderRadius="md" fallbackSrc="https://via.placeholder.com/100x100?text=..."/>
                ))}
              </SimpleGrid>
            ) : (
              <Text color="gray.600" fontSize="sm" textAlign="center" py={4}>暂无照片</Text>
            )}
          </Box>

          {/* 朋友圈截图 */}
          <Box bg="gray.700" p={4} borderRadius="md">
            <Text color="purple.400" fontSize="xs" fontWeight="bold" mb={3} textTransform="uppercase" letterSpacing="wider">
              朋友圈截图{momentPhotos?.length ? ` (${momentPhotos.length})` : ''}
            </Text>
            {momentPhotos && momentPhotos.length > 0 ? (
              <SimpleGrid columns={Math.min(momentPhotos.length, 4)} spacing={2}>
                {momentPhotos.map((url, i) => (
                  <Image key={i} src={getMediaUrl(url)} alt={`截图${i+1}`} h="100px" w="100%" objectFit="cover" borderRadius="md" fallbackSrc="https://via.placeholder.com/100x100?text=..."/>
                ))}
              </SimpleGrid>
            ) : (
              <Text color="gray.600" fontSize="sm" textAlign="center" py={4}>暂无截图</Text>
            )}
          </Box>

          {/* 视频 */}
          <Box bg="gray.700" p={4} borderRadius="md">
            <Text color="teal.400" fontSize="xs" fontWeight="bold" mb={3} textTransform="uppercase" letterSpacing="wider">
              视频{videos?.length ? ` (${videos.length})` : ''}
            </Text>
            {videos && videos.length > 0 ? (
              <SimpleGrid columns={Math.min(videos.length, 2)} spacing={2}>
                {videos.map((url, i) => (
                  <Box key={i} borderRadius="md" overflow="hidden" bg="gray.900">
                    <video
                      src={getMediaUrl(url)}
                      controls
                      preload="metadata"
                      style={{ width: '100%', maxHeight: '160px', display: 'block' }}
                    />
                  </Box>
                ))}
              </SimpleGrid>
            ) : (
              <Text color="gray.600" fontSize="sm" textAlign="center" py={4}>暂无视频</Text>
            )}
          </Box>
        </SimpleGrid>
      </Box>

      <Divider my={6} borderColor="gray.600" />

      {/* ---- AI 系统分析 ---- */}
      <Heading color="white" size="md" mb={4}>系统分析</Heading>

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={0} gap={4}>
        {/* AI画像 */}
        <SectionCard title="AI 画像" color="purple.400">
          <FieldRow label="性格" value={girl.personality} />
          <TagRow label="价值观" value={girl.values_} />
          <FieldRow label="沟通风格" value={girl.communicationStyle} />
          <FieldRow label="情绪触发点" value={girl.emotionalTriggers} />
          <FieldRow label="喜欢的话题" value={girl.talkingTopics} />
          <FieldRow label="禁忌话题" value={girl.thingsToAvoid} />
        </SectionCard>

        {/* EQ评分 */}
        <SectionCard title="EQ 评分" color="purple.400">
          <EQBar label="共情能力" value={girl.empathy} />
          <EQBar label="自我认知" value={girl.selfAwareness} />
          <EQBar label="沟通能力" value={girl.communication} />
          <EQBar label="关系经营" value={girl.relationship} />
          <EQBar label="冲突解决" value={girl.conflictRes} />
          {(girl.empathy || girl.selfAwareness || girl.communication || girl.relationship || girl.conflictRes) ? null : (
            <Text color="gray.600" fontSize="sm" textAlign="center" py={4}>暂无EQ评分数据</Text>
          )}
        </SectionCard>

        {/* AI战略建议 */}
        <SectionCard title="AI 战略建议" color="orange.400">
          <FieldRow label="最佳策略" value={girl.bestApproach} />
          <FieldRow label="推荐话题" value={girl.recommendedTopics} />
          <FieldRow label="升级条件" value={girl.upgradeConditions} />
          <FieldRow label="预计时间线" value={girl.estimatedTimeline} />
          <FieldRow label="风险因素" value={girl.riskFactors} />
          <FieldRow label="战略备注" value={girl.strategicNotes} />
        </SectionCard>

        {/* 匹配分析 */}
        <SectionCard title="匹配分析" color="orange.400">
          {girl.matchScore ? (
            <HStack mb={3}>
              <Text color="gray.500" fontSize="xs">匹配度</Text>
              <Text color="teal.400" fontSize="2xl" fontWeight="bold">{girl.matchScore}</Text>
              <Text color="gray.500" fontSize="xs">/ 100</Text>
            </HStack>
          ) : <Text color="gray.600" fontSize="sm" mb={3}>暂无评分</Text>}
          <FieldRow label="计算依据" value={girl.matchScoreBasis} />
          <FieldRow label="择偶偏好" value={girl.matePreferences} />
        </SectionCard>
      </SimpleGrid>

      <Divider my={6} borderColor="gray.600" />

      {/* ---- 上下文记忆 ---- */}
      {(signals.length > 0 || pendingActions.length > 0 || observations.length > 0 || girl.conversationSummary) && (
        <>
          <Heading color="white" size="md" mb={4}>上下文记忆</Heading>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} mb={6}>
            {girl.conversationSummary && (
              <SectionCard title="对话摘要" color="teal.400">
                <Text color="gray.200" fontSize="sm" whiteSpace="pre-wrap">{girl.conversationSummary}</Text>
              </SectionCard>
            )}
            {signals.length > 0 && (
              <SectionCard title={`信号 (${signals.length})`} color="orange.400">
                <VStack spacing={2} align="stretch">
                  {signals.map((s, i) => {
                    const type = s.type || 'neutral';
                    const typeColor = type === 'positive' ? 'green' : type === 'negative' ? 'red' : 'gray';
                    const typeLabel = type === 'positive' ? '积极' : type === 'negative' ? '消极' : '中性';
                    const event = s.event || s.text || s.signal || '';
                    const date = s.date || '';
                    return (
                      <HStack key={i} spacing={2} bg="gray.600" p={2} borderRadius="md" align="start">
                        <Badge colorScheme={typeColor} fontSize="xs" mt="1px" flexShrink={0}>{typeLabel}</Badge>
                        <Text color="gray.200" fontSize="sm" flex={1}>{event}</Text>
                        {date && <Text color="gray.500" fontSize="xs" flexShrink={0}>{date}</Text>}
                      </HStack>
                    );
                  })}
                </VStack>
              </SectionCard>
            )}
            {pendingActions.length > 0 && (
              <SectionCard title={`待办事项 (${pendingActions.length})`} color="blue.400">
                {pendingActions.map((a, i) => (
                  <Text key={i} color="gray.300" fontSize="sm">• {typeof a === 'string' ? a : a.text || a.action || JSON.stringify(a)}</Text>
                ))}
              </SectionCard>
            )}
            {observations.length > 0 && (
              <SectionCard title={`观察记录 (${observations.length})`} color="purple.400">
                {observations.map((o, i) => (
                  <Text key={i} color="gray.300" fontSize="sm">• {typeof o === 'string' ? o : o.text || o.observation || JSON.stringify(o)}</Text>
                ))}
              </SectionCard>
            )}
          </SimpleGrid>
          <Divider my={6} borderColor="gray.600" />
        </>
      )}

      {/* ---- 关联记录 ---- */}
      <Heading color="white" size="md" mb={4}>关联记录</Heading>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        {/* 约会记录 */}
        <SectionCard title={`约会记录 (${related?.dates?.length || 0})`} color="orange.400">
          {!related?.dates?.length ? (
            <Text color="gray.600" fontSize="sm" textAlign="center" py={4}>暂无约会记录</Text>
          ) : (
            <VStack spacing={2} align="stretch">
              {related.dates.map(d => (
                <Box key={d.id} p={2} bg="gray.600" borderRadius="md">
                  <HStack justify="space-between">
                    <Text color="gray.200" fontSize="sm">{d.title || d.location || '约会'}</Text>
                    <Badge colorScheme={d.status === 'confirmed' ? 'green' : d.status === 'pending' ? 'yellow' : 'gray'} fontSize="xs">
                      {d.status === 'confirmed' ? '已确认' : d.status === 'pending' ? '待确认' : d.status || '未知'}
                    </Badge>
                  </HStack>
                  <Text color="gray.500" fontSize="xs">
                    {d.dateTime ? new Date(d.dateTime).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                    {d.location ? ` · ${d.location}` : ''}
                  </Text>
                </Box>
              ))}
            </VStack>
          )}
        </SectionCard>

        {/* 阶段变更历史 */}
        <SectionCard title={`阶段历史 (${related?.stageHistory?.length || 0})`} color="blue.400">
          {!related?.stageHistory?.length ? (
            <Text color="gray.600" fontSize="sm" textAlign="center" py={4}>暂无阶段变更</Text>
          ) : (
            <VStack spacing={2} align="stretch">
              {related.stageHistory.map(h => (
                <Box key={h.id} p={2} bg="gray.600" borderRadius="md">
                  <HStack justify="space-between">
                    <Text color="gray.200" fontSize="sm">
                      {h.fromStage ? `${RELATIONSHIP_STAGE_LABELS[h.fromStage] || h.fromStage} → ` : ''}
                      {RELATIONSHIP_STAGE_LABELS[h.toStage] || h.toStage}
                    </Text>
                    <Text color="gray.500" fontSize="xs">{new Date(h.createdAt).toLocaleDateString('zh-CN')}</Text>
                  </HStack>
                  {h.reason && <Text color="gray.500" fontSize="xs" mt={1}>{h.reason}</Text>}
                </Box>
              ))}
            </VStack>
          )}
        </SectionCard>
      </SimpleGrid>

      {/* ---- 编辑 Modal ---- */}
      <Modal isOpen={isEditOpen} onClose={onEditClose} size="4xl">
        <ModalOverlay />
        <ModalContent bg="gray.800" maxH="85vh" overflowY="auto">
          <ModalHeader color="white">
            <HStack spacing={3}>
              <Text>编辑档案 - {girl.name}</Text>
              <HStack spacing={0} bg="gray.700" borderRadius="md" p="2px">
                <Button
                  size="xs"
                  colorScheme={!aiMode ? 'teal' : 'gray'}
                  variant={!aiMode ? 'solid' : 'ghost'}
                  onClick={() => { setAiMode(false); setAiResult(null); }}
                >手动填写</Button>
                <Button
                  size="xs"
                  colorScheme={aiMode ? 'teal' : 'gray'}
                  variant={aiMode ? 'solid' : 'ghost'}
                  onClick={() => { setAiMode(true); setAiTab(0); setAiResult(null); }}
                  leftIcon={<Icon as={FiEdit2} />}
                >AI 智能识别</Button>
              </HStack>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />

          <ModalBody pb={6}>
            {!aiMode ? (
              /* ---- 手动模式 ---- */
              <SimpleGrid columns={2} spacing={4}>
                {GIRL_EDITABLE_FIELDS.map(f => (
                  <ProfileField key={f.key} field={f} value={editData[f.key]} onChange={handleFieldChange} />
                ))}
              </SimpleGrid>
            ) : (
              /* ---- AI 模式 ---- */
              <VStack spacing={4} align="stretch">
                {/* 子 tab 切换 */}
                <HStack spacing={0} bg="gray.700" borderRadius="md" p="2px" w="fit-content">
                  <Button
                    size="xs"
                    colorScheme={aiTab === 0 ? 'blue' : 'gray'}
                    variant={aiTab === 0 ? 'solid' : 'ghost'}
                    onClick={() => { setAiTab(0); setAiResult(null); }}
                  >文字描述</Button>
                  <Button
                    size="xs"
                    colorScheme={aiTab === 1 ? 'blue' : 'gray'}
                    variant={aiTab === 1 ? 'solid' : 'ghost'}
                    onClick={() => { setAiTab(1); setAiResult(null); }}
                  >上传截图</Button>
                </HStack>

                {/* 文字描述模式 */}
                {aiTab === 0 && (
                  <VStack spacing={3} align="stretch">
                    <Text color="gray.400" fontSize="sm">
                      粘贴一段关于这位女生的描述文字，AI 将自动分析并提取档案字段。支持描述昵称、年龄、职业、学历、性格、兴趣爱好等。
                    </Text>
                    <Textarea
                      value={aiText}
                      onChange={e => setAiText(e.target.value)}
                      placeholder="例如：她叫小美，25岁，在互联网公司做设计师，杭州人，浙江大学计算机系毕业，性格活泼开朗，喜欢健身和旅行..."
                      rows={5}
                      bg="gray.700" color="white"
                      border="1px solid" borderColor="gray.600"
                      _hover={{ borderColor: 'gray.500' }}
                      _focus={{ borderColor: 'blue.500', boxShadow: '0 0 0 1px var(--chakra-colors-blue-500)' }}
                    />
                    <Button
                      colorScheme="blue"
                      onClick={handleAiTextExtract}
                      isLoading={aiExtracting}
                      loadingText="AI 分析中..."
                      isDisabled={aiText.trim().length < 10}
                    >智能分析</Button>
                  </VStack>
                )}

                {/* 截图模式 */}
                {aiTab === 1 && (
                  <VStack spacing={3} align="stretch">
                    <Text color="gray.400" fontSize="sm">
                      上传聊天截图或社交主页截图，AI 将识别图片中的个人信息并提取档案字段。
                    </Text>
                    <Input type="file" accept="image/*" onChange={handleScreenshotSelect} display="none" id="girl-screenshot-input" />
                    {aiScreenshotPreview ? (
                      <Box position="relative" borderRadius="md" overflow="hidden" bg="gray.900">
                        <Image src={aiScreenshotPreview} alt="预览" maxH="200px" w="full" objectFit="contain" />
                        <IconButton
                          icon={<Icon as={FiEdit2} />}
                          size="xs"
                          position="absolute"
                          top={2}
                          right={2}
                          colorScheme="red"
                          onClick={() => { setAiScreenshot(null); setAiScreenshotPreview(''); }}
                          aria-label="移除图片"
                        />
                      </Box>
                    ) : (
                      <Button
                        variant="outline"
                        colorScheme="blue"
                        onClick={() => document.getElementById('girl-screenshot-input')?.click()}
                        h="80px"
                        borderStyle="dashed"
                      >点击选择聊天截图</Button>
                    )}
                    <Button
                      colorScheme="blue"
                      onClick={handleScreenshotExtract}
                      isLoading={aiScreenshotUploading}
                      loadingText="AI 分析中..."
                      isDisabled={!aiScreenshot}
                    >上传分析</Button>
                  </VStack>
                )}

                {/* AI 提取结果 */}
                {aiResult && Object.keys(aiResult).length > 0 && (
                  <Box bg="gray.700" border="1px solid" borderColor="teal.600" borderRadius="md" overflow="hidden">
                    <Box px={4} py={3} borderBottom="1px solid" borderColor="gray.600">
                      <HStack justify="space-between">
                        <HStack>
                          <Icon as={FiZap} color="teal.400" />
                          <Text color="teal.300" fontWeight="bold" fontSize="sm">AI 识别结果（共 {Object.keys(aiResult).length} 个字段）</Text>
                        </HStack>
                        <HStack spacing={2}>
                          <Button size="xs" variant="ghost" color="gray.400" onClick={() => setAiResult(null)} leftIcon={<Icon as={FiX} />}>清除</Button>
                          <Button size="xs" colorScheme="teal" onClick={applyAiResult} leftIcon={<Icon as={FiCheck} />}>应用到表单</Button>
                        </HStack>
                      </HStack>
                    </Box>
                    <Box px={4} py={3}>
                      <SimpleGrid columns={2} spacing={2}>
                        {Object.entries(aiResult).map(([key, { label, value }]) => (
                          <HStack key={key} justify="space-between" bg="gray.800" px={3} py={1.5} borderRadius="md">
                            <Text color="gray.400" fontSize="sm">{label}</Text>
                            <Text color="white" fontSize="sm" fontWeight="medium">{value}</Text>
                          </HStack>
                        ))}
                      </SimpleGrid>
                    </Box>
                  </Box>
                )}

                <HStack justify="flex-end" spacing={3}>
                  <Button variant="ghost" color="gray.400" onClick={onEditClose}>取消</Button>
                  <Button colorScheme="teal" onClick={() => setAiMode(false)}>返回手动填写</Button>
                </HStack>
              </VStack>
            )}
          </ModalBody>

          {!aiMode && (
            <ModalFooter>
              <Button variant="ghost" mr={3} onClick={onEditClose}>取消</Button>
              <Button colorScheme="teal" onClick={handleSave} isLoading={saving}>保存</Button>
            </ModalFooter>
          )}
        </ModalContent>
      </Modal>
    </Box>
  );
}

// 字段标签映射
function getFieldLabel(key) {
  const map = {
    age: '年龄', occupation: '职业', education: '学历', major: '专业',
    hometown: '籍贯', residence: '现居城市', workplace: '工作地点',
    appearance: '外貌描述', height: '身高', bodyType: '体型',
    familyBackground: '家庭背景', familyAtmosphere: '家庭氛围',
    familyBurden: '养老负担', familyComments: '家庭备注',
    workSchedule: '作息规律', socialActivity: '社交活跃度', financialHabits: '消费习惯',
    interests: '兴趣爱好', dietPreferences: '饮食偏好', dietRestrictions: '饮食禁忌', hobbiesDetail: '兴趣详情',
    relationshipAttitude: '婚恋态度', pastRelationshipSummary: '情史摘要',
    emotionalWounds: '情伤记录', attachmentStyle: '依恋类型', dealbreakers: '绝对雷区',
  };
  return map[key] || key;
}
