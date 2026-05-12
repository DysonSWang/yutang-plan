import { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
  Box, Heading, Text, SimpleGrid, Card, CardBody, Badge, VStack, HStack, Flex, Avatar,
  Button, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  ModalCloseButton, useDisclosure, FormControl, FormLabel, Input, Select, Textarea,
  useToast, Spinner, Icon, Image, Progress, Wrap, WrapItem, Tag, TagLabel, Divider, IconButton,
  Skeleton, Menu, MenuButton, MenuList, MenuItem
} from '@chakra-ui/react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiEdit2, FiCamera, FiFileText, FiZap, FiUser, FiCheck, FiX } from 'react-icons/fi';
import { HeartIcon, SparklesIcon } from '../../components/Icons';
import { girls, upload, getMediaUrl } from '../../utils/api';
import useKeepAliveData from '../../hooks/useKeepAliveData';
import PullToRefresh from '../../components/PullToRefresh';


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
    title: '基础信息', color: 'blue.400',
    fields: ['age', 'occupation', 'education', 'major', 'residence', 'workplace', 'hometown']
  },
  appearance: {
    title: '外貌特征', color: 'gold.400',
    fields: ['appearance', 'height', 'weight', 'bodyType', 'styleTags']
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
    title: '兴趣爱好', color: 'gold.400',
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
  { key: 'weight', label: '体重(kg)', type: 'input' },
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

// 常用字段（默认显示）
const COMMON_FIELD_KEYS = new Set([
  'name', 'age', 'occupation', 'education', 'major', 'residence', 'workplace', 'hometown',
  'appearance', 'height', 'weight', 'bodyType',
  'familyBackground', 'familyAtmosphere', 'familyBurden',
  'workSchedule', 'socialActivity', 'financialHabits',
  'interests', 'dietPreferences', 'dietRestrictions',
  'relationshipAttitude', 'attachmentStyle',
]);

// 字段所属版块（用于编辑弹窗滚动定位）
const FIELD_SECTIONS = {
  name: 'basic', age: 'basic', occupation: 'basic', education: 'basic', major: 'basic',
  residence: 'basic', workplace: 'basic', hometown: 'basic',
  appearance: 'appearance', height: 'appearance', weight: 'appearance', bodyType: 'appearance', styleTags: 'appearance',
  avatar: 'appearance',
  familyBackground: 'family', familyAtmosphere: 'family', familyBurden: 'family', familyComments: 'family',
  workSchedule: 'lifestyle', socialActivity: 'lifestyle', financialHabits: 'lifestyle',
  interests: 'interests', dietPreferences: 'interests', dietRestrictions: 'interests', hobbiesDetail: 'interests',
  relationshipAttitude: 'emotional', pastRelationshipSummary: 'emotional', emotionalWounds: 'emotional',
  attachmentStyle: 'emotional', dealbreakers: 'emotional',
  notes: 'emotional', homepageUrl: 'media', photos: 'media', momentPhotos: 'media', videos: 'media',
  sourcePlatform: 'media', sourceUrl: 'media',
};
const getSectionForField = (key) => FIELD_SECTIONS[key] || 'basic';

// ---- 工具函数 ----
function parseJSONField(val) {
  if (!val) return null;
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return null; }
}
function EmptyValue({ value, children, ...props }) {
  if (value !== null && value !== undefined && value !== '') {
    return <Box as="div" color="white" fontSize="sm" {...props}>{children || String(value)}</Box>;
  }
  return <Box as="div" color="gold.400" fontSize="sm" {...props}>待填写</Box>;
}

// ---- 子组件 ----
const FieldRow = memo(function FieldRow({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <Box>
      <Text color="rgba(245,240,232,0.55)" fontSize="xs">{label}</Text>
      <Text color="gray.200" fontSize="sm">{String(value)}</Text>
    </Box>
  );
});

const TagRow = memo(function TagRow({ label, value }) {
  if (!value) return null;
  const tags = String(value).split(/[,，、/]/).map(t => t.trim()).filter(Boolean);
  return (
    <Box>
      <Text color="rgba(245,240,232,0.55)" fontSize="xs" mb={1}>{label}</Text>
      <Wrap spacing={1}>
        {tags.map((t, i) => (
          <WrapItem key={i}><Tag size="sm" colorScheme="gold" variant="subtle" borderRadius="full"><TagLabel fontSize="xs">{t}</TagLabel></Tag></WrapItem>
        ))}
      </Wrap>
    </Box>
  );
});
function EQBar({ label, value }) {
  if (!value && value !== 0) return null;
  const pct = Math.min(100, Math.max(0, (value / 10) * 100));
  return (
    <HStack spacing={3} mb={2}>
      <Text color="rgba(245,240,232,0.55)" fontSize="xs" w="80px" flexShrink={0}>{label}</Text>
      <Box flex={1} bg="warm.600" borderRadius="full" h="6px">
        <Box bg="gold.400" h="6px" borderRadius="full" w={`${pct}%`} transition="width 0.3s" />
      </Box>
      <Text color="gold.400" fontSize="xs" fontWeight="bold" w="30px" textAlign="right">{value}</Text>
    </HStack>
  );
}
function SectionCard({ title, children, color, section }) {
  return (
    <Box data-section={section} className="hover-lift" bg="warm.700" border="1px solid" borderColor="rgba(226,176,68,0.1)" borderRadius="md" p={4} mb={4} cursor="pointer" onClick={() => openEdit(section)} _hover={{ borderColor: 'rgba(226,176,68,0.25)' }}>
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
      <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">{field.label}</FormLabel>
      <VStack align="stretch" spacing={2}>
        {urls.length > 0 && (
          <VStack align="stretch" spacing={1} maxH="200px" overflowY="auto">
            {urls.map((url, i) => (
              <HStack key={i} bg="warm.600" p={1} borderRadius="md" justify="space-between">
                {url.match(/\.(mp4|mov|webm|avi)(\?|$)/i) ? (
                  <Text color="gold.300" fontSize="xs" flex={1} isTruncated>{url.split('/').pop()}</Text>
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
            size="xs" variant="outline" colorScheme="gold"
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
    const displayValue = isCustom ? '其他' : (value || '');
    return (
      <FormControl>
        <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">{field.label}</FormLabel>
        <Menu>
          <MenuButton
            as={Button}
            size="sm"
            variant="outline"
            borderColor="warm.600"
            bg="warm.700"
            color="white"
            _hover={{ bg: 'warm.600' }}
            _full={{ borderColor: 'gold.500' }}
            rightIcon={<Text fontSize="xs">▼</Text>}
            w="full"
          >
            {displayValue || '请选择'}
          </MenuButton>
          <MenuList bg="warm.800" borderColor="warm.600" minW="160px">
            <MenuItem _hover={{ bg: 'warm.700' }} onClick={() => onChange(field.key, '')}>
              <Text color="rgba(245,240,232,0.4)">请选择</Text>
            </MenuItem>
            {field.options.map(o => (
              <MenuItem key={o} _hover={{ bg: 'warm.700' }} onClick={() => onChange(field.key, o === '其他' ? '' : o)}>
                {o}
              </MenuItem>
            ))}
          </MenuList>
        </Menu>
        {showCustomInput && (
          <Input
            mt={2}
            value={isCustom ? value : ''}
            placeholder="请输入自定义内容"
            onChange={e => onChange(field.key, e.target.value)}
            bg="warm.700" color="white" border="1px solid" borderColor="warm.600"
            _hover={{ borderColor: 'rgba(245,240,232,0.2)' }}
            _focus={{ borderColor: 'gold.500', boxShadow: '0 0 0 1px var(--chakra-colors-gold-500)' }}
          />
        )}
      </FormControl>
    );
  }
  if (field.type === 'textarea') {
    return (
      <FormControl>
        <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">{field.label}</FormLabel>
        <Textarea
          value={value || ''}
          onChange={e => onChange(field.key, e.target.value)}
          bg="warm.700" color="white" border="1px solid" borderColor="warm.600"
          _hover={{ borderColor: 'rgba(245,240,232,0.2)' }}
          _focus={{ borderColor: 'gold.500', boxShadow: '0 0 0 1px var(--chakra-colors-gold-500)' }}
          rows={3}
        />
      </FormControl>
    );
  }
  return (
    <FormControl>
      <FormLabel color="rgba(245,240,232,0.4)" fontSize="sm">{field.label}</FormLabel>
      <Input
        value={value || ''}
        onChange={e => onChange(field.key, e.target.value)}
        bg="warm.700" color="white" border="1px solid" borderColor="warm.600"
        _hover={{ borderColor: 'rgba(245,240,232,0.2)' }}
        _focus={{ borderColor: 'gold.500', boxShadow: '0 0 0 1px var(--chakra-colors-gold-500)' }}
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

  // 高级字段折叠
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);

  // 头像编辑
  const avatarFileRef = useRef(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [savingAvatar, setSavingAvatar] = useState(false);

  // 快速追加 — 文字 + 图片
  const [quickText, setQuickText] = useState('');
  const [quickImages, setQuickImages] = useState([]);           // File[]
  const [quickImagePreviews, setQuickImagePreviews] = useState([]); // dataURL[]
  const [quickAnalyzing, setQuickAnalyzing] = useState(false);
  const [quickResult, setQuickResult] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const { data, isInitialLoad } = useKeepAliveData(async () => {
    const [girlRes, relatedRes] = await Promise.all([
      girls.get(girlId),
      girls.getRelated(girlId).catch(() => ({ success: false })),
    ]);
    if (girlRes.success) setGirl(girlRes.girl);
    if (relatedRes.success) setRelated(relatedRes);
    return true;
  }, { key: `/my-pond/${girlId}` });

  // ---- 编辑 ----

  const openEdit = (section = null) => {
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
    // 如果 section 不在常用字段范围内，展开高级字段
    const needsAdvanced = section && !COMMON_FIELD_KEYS.has(section) && !['basic', 'appearance', 'family', 'lifestyle', 'interests', 'emotional', 'media'].some(k => section === k);
    setShowAdvancedFields(!!needsAdvanced);
    onEditOpen();
    // 滚动到目标 section
    setTimeout(() => {
      if (section) {
        const target = document.querySelector('[data-section="' + section + '"]');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 150);
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
      // 自动推断体型（仅当 bodyType 为空且 height 和 weight 都有值时）
      if (!payload.bodyType && payload.height && payload.weight) {
        const h = parseFloat(payload.height);
        const w = parseFloat(payload.weight);
        if (h > 0 && w > 0) {
          const heightM = h / 100;
          const bmi = w / (heightM * heightM);
          if (bmi < 18.5) payload.bodyType = '偏瘦';
          else if (bmi < 24) payload.bodyType = '标准';
          else if (bmi < 28) payload.bodyType = '微胖';
          else payload.bodyType = '偏胖';
        }
      }
      const res = await girls.clientUpdate(girlId, payload);
      if (res.success) {
        toast({ title: '保存成功', status: 'success', duration: 2000 });
        setGirl(res.girl);
        onEditClose();
      }
    } catch (e) {
      toast({ title: e.response?.data?.error || '保存失败', status: 'error', duration: 4000 });
    } finally { setSaving(false); }
  };

  // ---- 图片处理 ----
  const handleQuickImageSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (quickImages.length + files.length > 5) {
      toast({ title: '最多上传5张图片', status: 'warning', duration: 3000 }); return;
    }
    setQuickImages(prev => [...prev, ...files]);
    setQuickImagePreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
    e.target.value = '';
  };

  const handleQuickPaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (!item.type.startsWith('image/')) continue;
      if (quickImages.length >= 5) {
        toast({ title: '最多上传5张图片', status: 'warning', duration: 3000 }); return;
      }
      const file = item.getAsFile();
      if (file) {
        setQuickImages(prev => [...prev, file]);
        setQuickImagePreviews(prev => [...prev, URL.createObjectURL(file)]);
        toast({ title: '已粘贴图片', status: 'info', duration: 2000, duration: 2000 });
      }
    }
  };

  const handleQuickDragOver = (e) => { e.preventDefault(); setIsDragOver(true); };
  const handleQuickDragLeave = () => setIsDragOver(false);
  const handleQuickDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    if (quickImages.length + files.length > 5) {
      toast({ title: '最多上传5张图片', status: 'warning', duration: 3000 }); return;
    }
    setQuickImages(prev => [...prev, ...files]);
    setQuickImagePreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
  };

  const handleQuickRemoveImage = (index) => {
    URL.revokeObjectURL(quickImagePreviews[index]);
    setQuickImages(prev => prev.filter((_, i) => i !== index));
    setQuickImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  // ---- AI 快速追加（文字 + 图片）----
  const handleQuickExtract = async () => {
    const hasText = quickText.trim().length >= 10;
    const hasImages = quickImages.length > 0;

    if (!hasText && !hasImages) {
      toast({ title: '请至少输入10个字的描述或上传图片', status: 'warning', duration: 3000 }); return;
    }

    setQuickAnalyzing(true);
    setQuickResult(null);
    try {
      const res = await girls.extractNote(girlId, {
        text: hasText ? quickText.trim() : '',
        images: quickImages,
      });

      if (!res.success) {
        toast({ title: res.error || '分析失败', status: 'error', duration: 4000 }); return;
      }

      let aiFields = [];
      if (res.pendingFields && Object.keys(res.pendingFields).length > 0) {
        aiFields = Object.entries(res.pendingFields).map(([key, info]) => ({
          key,
          label: ALL_FIELD_LABELS[key] || key,
          value: info.value
        }));
      }

      const newNote = {
        id: crypto.randomUUID(),
        text: quickText.trim() || '',
        images: res.imageUrls || [],
        extractedFields: aiFields,
        createdAt: new Date().toISOString(),
      };

      const payload = {};
      aiFields.forEach(f => { payload[f.key] = f.value; });
      payload.infoNotes = [...infoNotes, newNote];

      const updateRes = await girls.clientUpdate(girlId, payload);
      if (updateRes.success) {
        if (aiFields.length > 0) {
          setQuickResult({ fields: aiFields, count: aiFields.length, imageUrls: res.imageUrls || [] });
          toast({ title: `AI 学到了 ${aiFields.length} 个新信息`, status: 'success', duration: 2000 });
        } else {
          setQuickResult({ fields: [], count: 0, imageUrls: res.imageUrls || [] });
          toast({ title: '未发现新信息，但已记录', status: 'info', duration: 2000, duration: 2000 });
        }
        setQuickText('');
        quickImagePreviews.forEach(url => URL.revokeObjectURL(url));
        setQuickImages([]);
        setQuickImagePreviews([]);
        setGirl(updateRes.girl);
      }
    } catch (e) {
      toast({ title: e.response?.data?.error || e.message || '分析保存失败', status: 'error', duration: 4000 });
    } finally { setQuickAnalyzing(false); }
  };

  // ---- AI 文字提取 ----
  const handleAiTextExtract = async () => {
    if (!aiText.trim() || aiText.trim().length < 10) {
      toast({ title: '请至少输入10个字', status: 'warning', duration: 3000 }); return;
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
            toast({ title: '未识别出新信息，档案可能已较完善', status: 'info', duration: 2000 });
          }
        },
        onError: (err) => toast({ title: err, status: 'error', duration: 4000 }),
      });
    } catch (e) { toast({ title: e.message, status: 'error', duration: 4000 }); }
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
    if (!aiScreenshot) { toast({ title: '请先选择图片', status: 'warning', duration: 3000 }); return; }
    setAiScreenshotUploading(true);
    setAiResult(null);
    try {
      const res = await girls.extractScreenshot(girlId, aiScreenshot);
      if (res.success && res.pendingFields && Object.keys(res.pendingFields).length > 0) {
        setAiResult(res.pendingFields);
        toast({ title: `识别出 ${Object.keys(res.pendingFields).length} 个字段`, status: 'success', duration: 2000 });
      } else {
        toast({ title: res.message || '未识别出新信息', status: 'info', duration: 2000 });
      }
    } catch (e) { toast({ title: e.message || '分析失败', status: 'error', duration: 4000 }); }
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
    toast({ title: '已应用到表单，请确认后保存', status: 'info', duration: 2000, duration: 2000 });
  };

  // ---- 头像上传 ----
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
    if (!avatarFile) { toast({ title: '请先选择图片', status: 'warning', duration: 3000 }); return; }
    setSavingAvatar(true);
    try {
      const uploadRes = await upload.image(avatarFile);
      if (!uploadRes.url) { toast({ title: '上传失败', status: 'error', duration: 4000 }); return; }
      const res = await girls.updateAvatar(girlId, uploadRes.url);
      if (res.success) {
        setGirl(prev => ({ ...prev, avatar: uploadRes.url }));
        toast({ title: '头像已更新', status: 'success', duration: 2000 });
        setAvatarFile(null);
        setAvatarPreview('');
      }
    } catch (e) {
      toast({ title: '更新失败', status: 'error', duration: 4000 });
    } finally { setSavingAvatar(false); }
  };

  const triggerAvatarFileSelect = () => {
    setAvatarFile(null);
    setAvatarPreview('');
    avatarFileRef.current?.click();
  };

  // 用户可见字段（用于完整度计算，与展示区对齐）
  const VISIBLE_FIELDS = [
    // FIELD_GROUPS 中的字段
    'age', 'occupation', 'education', 'major', 'residence', 'workplace', 'hometown',
    'appearance', 'height', 'weight', 'bodyType', 'styleTags',
    'familyBackground', 'familyAtmosphere', 'familyBurden', 'familyComments',
    'workSchedule', 'socialActivity', 'financialHabits',
    'interests', 'dietPreferences', 'dietRestrictions', 'hobbiesDetail',
    'relationshipAttitude', 'pastRelationshipSummary', 'emotionalWounds', 'attachmentStyle', 'dealbreakers',
    // 照片与媒体区
    'avatar', 'photos', 'momentPhotos', 'videos',
    'homepageUrl', 'sourcePlatform', 'sourceUrl',
    // 系统分析区
    'personality', 'values_', 'communicationStyle', 'emotionalTriggers',
    'talkingTopics', 'thingsToAvoid',
    'empathy', 'selfAwareness', 'communication', 'relationship', 'conflictRes',
    'bestApproach', 'recommendedTopics', 'upgradeConditions', 'estimatedTimeline', 'riskFactors', 'strategicNotes',
    'matchScore', 'matchScoreBasis', 'matePreferences',
    // 关系状态
    'stage', 'intimacyLevel', 'tensionScore',
  ];

  // ---- 计算完整度（仅统计用户可见字段） ----
  const calcCompleteness = () => {
    if (!girl) return 0;
    const filled = VISIBLE_FIELDS.filter(k => {
      const val = girl[k];
      if (val === null || val === undefined || val === '') return false;
      if (Array.isArray(val)) return val.length > 0;
      if (['photos', 'videos', 'momentPhotos'].includes(k) && typeof val === 'string') {
        try { return JSON.parse(val).length > 0; } catch { return false; }
      }
      return true;
    }).length;
    return Math.round((filled / VISIBLE_FIELDS.length) * 100);
  };

  // ---- 加载态 ----
  if (isInitialLoad) {
    return (
      <Box pb={8}>
        <HStack mb={4}>
          <Skeleton h="32px" w="80px" borderRadius="md" />
        </HStack>
        <Skeleton h="220px" borderRadius="lg" mb={6} />
        <Skeleton h="300px" borderRadius="lg" mb={6} />
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <Skeleton h="200px" borderRadius="md" />
          <Skeleton h="200px" borderRadius="md" />
          <Skeleton h="200px" borderRadius="md" />
          <Skeleton h="200px" borderRadius="md" />
        </SimpleGrid>
      </Box>
    );
  }
  if (!girl) {
    return (
      <Flex flex={1} align="center" justify="center" minH="60vh">
        <VStack spacing={4}>
          <Text color="rgba(245,240,232,0.55)">女生不存在</Text>
          <Button colorScheme="gold" onClick={() => navigate('/my-pond')}>返回缘分</Button>
        </VStack>
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
  const infoNotes = parseJSONField(girl.infoNotes) || [];
  const relationshipStage = girl.relationshipStage;
  const lastContact = girl.lastContact
    ? new Date(girl.lastContact).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <Box pb={8}>
      {/* ---- 返回按钮 ---- */}
      <HStack mb={4}>
        <IconButton icon={<Icon as={FiArrowLeft} />} variant="ghost" color="rgba(245,240,232,0.4)" onClick={() => navigate('/my-pond')} aria-label="返回" size="sm" />
        <Text color="rgba(245,240,232,0.55)" fontSize="sm">我的缘分</Text>
      </HStack>

      {/* ---- Hero 身份卡片 ---- */}
      <Box className="hover-lift" bg="warm.800" bgGradient="linear(to-b, warm.700, warm.800)" p={5} borderRadius="lg" mb={6}>
        <Flex direction={{ base: 'column', md: 'row' }} align={{ base: 'start', md: 'center' }} gap={4}>
          {/* 头像 + 身份 */}
          <Box position="relative" flexShrink={0}>
            <Avatar size="xl" name={girl.name} src={getMediaUrl(girl.avatar) || undefined} bg="gold.500" />
            <IconButton
              aria-label="编辑头像"
              icon={<Icon as={FiCamera} />}
              size="xs"
              colorScheme="gold"
              position="absolute"
              bottom={0}
              right={0}
              borderRadius="full"
              onClick={triggerAvatarFileSelect}
            />
            <input type="file" accept="image/*" ref={avatarFileRef} style={{ display: 'none' }} onChange={handleAvatarFileChange} />
            {/* 选择后预览 */}
            {avatarFile && (
              <Box position="absolute" top="100%" left={0} mt={2} p={2} bg="warm.700" borderRadius="md" border="1px solid" borderColor="warm.600" zIndex={10}>
                <HStack spacing={2}>
                  <Avatar size="sm" src={avatarPreview} />
                  <Text color="gray.300" fontSize="xs" maxW="120px" noOfLines={1}>{avatarFile.name}</Text>
                  <Button size="xs" colorScheme="gold" onClick={handleSaveAvatar} isLoading={savingAvatar}>保存</Button>
                  <Button size="xs" variant="ghost" onClick={() => { setAvatarFile(null); setAvatarPreview(''); }}>取消</Button>
                </HStack>
              </Box>
            )}
          </Box>
          <VStack align="start" spacing={1} flex={1}>
            <HStack spacing={2} wrap="wrap">
              <Heading color="white" size="lg">{girl.name}</Heading>
              {girl.age > 0 && <Badge colorScheme="blue" variant="solid" fontSize="sm">{girl.age}岁</Badge>}
              {girl.occupation && <Badge colorScheme="cyan" variant="subtle">{girl.occupation}</Badge>}
              <Badge colorScheme={STAGE_COLORS[girl.stage] || 'gray'}>{girl.stage || '未知'}</Badge>
              {relationshipStage && (
                <Badge colorScheme={RELATIONSHIP_STAGE_COLORS[relationshipStage] || 'gray'} variant="outline">
                  {RELATIONSHIP_STAGE_LABELS[relationshipStage] || relationshipStage}
                </Badge>
              )}
            </HStack>
            {girl.education && (
              <Text color="rgba(245,240,232,0.4)" fontSize="sm">{[girl.education, girl.major, girl.residence].filter(Boolean).join(' · ')}</Text>
            )}
            {/* 内联完整度条 */}
            <HStack spacing={2} w="full" mt={1}>
              <Progress value={completeness} size="sm" flex={1} borderRadius="full"
                colorScheme={completeness >= 80 ? 'green' : completeness >= 50 ? 'yellow' : 'gold'} />
              <Text color={completeness >= 80 ? 'green.400' : completeness >= 50 ? 'yellow.400' : 'orange.400'} fontSize="xs" fontWeight="bold" flexShrink={0}>{completeness}%</Text>
            </HStack>
          </VStack>
          {/* 编辑按钮 */}
          <Button colorScheme="gold" size="sm" leftIcon={<Icon as={FiEdit2} />} onClick={openEdit} flexShrink={0}>编辑档案</Button>
        </Flex>
        {/* 关系指标条 */}
        <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3} mt={4} pt={4} borderTop="1px solid" borderColor="warm.600">
          <HStack spacing={2}><Icon as={HeartIcon} color="red.400" boxSize={4} /><Text color="rgba(245,240,232,0.4)" fontSize="xs">亲密度</Text><Text color="white" fontWeight="bold" fontSize="sm">Lv.{girl.intimacyLevel || 1}</Text></HStack>
          <HStack spacing={2}><Text color="rgba(245,240,232,0.55)" fontSize="xs">热度</Text><Text color="white" fontWeight="bold" fontSize="sm">{girl.tensionScore?.toFixed(1) || '5.0'}<Text as="span" color="rgba(245,240,232,0.55)" fontSize="xs">/10</Text></Text></HStack>
          <HStack spacing={2}><Text color="rgba(245,240,232,0.55)" fontSize="xs">最后联系</Text><Text color="white" fontSize="xs">{lastContact || '未记录'}</Text></HStack>
          <HStack spacing={2}><Text color="rgba(245,240,232,0.55)" fontSize="xs">约会</Text><Text color="white" fontWeight="bold" fontSize="sm">{related?.dates?.length || 0} 次</Text></HStack>
        </SimpleGrid>
      </Box>

      {/* ====== 快速记录 ====== */}
      <Box className="hover-lift" bg="warm.800" bgGradient="linear(to-b, warm.700, warm.800)" borderRadius="lg" p={5} mb={6}>
        <Heading color="white" size="sm" mb={3}>
          <Icon as={SparklesIcon} boxSize={4} mr={2} /> 快速记录
          <Text as="span" color="rgba(245,240,232,0.55)" fontWeight="normal" fontSize="sm" ml={2}>输入文字或粘贴图片，AI 自动学习完善档案</Text>
        </Heading>
        <VStack spacing={3} align="stretch">
          <Textarea
            value={quickText}
            onChange={e => setQuickText(e.target.value)}
            onPaste={handleQuickPaste}
            placeholder="粘贴关于她的信息，如：她身高165、喜欢瑜伽、是杭州人..."
            bg="warm.800"
            color="white"
            border="1px solid"
            borderColor="warm.600"
            _hover={{ borderColor: 'rgba(245,240,232,0.2)' }}
            _focus={{ borderColor: 'yellow.500', boxShadow: '0 0 0 1px var(--chakra-colors-yellow-500)' }}
            rows={3}
            maxLength={2000}
            resize="vertical"
          />

          {/* 图片上传区 */}
          <Box
            onDragOver={handleQuickDragOver}
            onDragLeave={handleQuickDragLeave}
            onDrop={handleQuickDrop}
            border="1px dashed"
            borderColor={isDragOver ? 'yellow.400' : 'warm.600'}
            borderRadius="md"
            p={3}
            bg={isDragOver ? 'warm.600' : 'warm.800'}
            transition="all 0.2s"
          >
            {quickImagePreviews.length > 0 ? (
              <SimpleGrid columns={{ base: 3, md: 5 }} spacing={2} mb={2}>
                {quickImagePreviews.map((preview, i) => (
                  <Box key={i} position="relative" borderRadius="md" overflow="hidden">
                    <Image
                      src={preview}
                      alt={`图片 ${i + 1}`}
                      h="80px"
                      w="100%"
                      objectFit="cover"
                      borderRadius="md"
                    />
                    <IconButton
                      aria-label="移除图片"
                      icon={<Icon as={FiX} />}
                      size="xs"
                      colorScheme="red"
                      position="absolute"
                      top={1}
                      right={1}
                      borderRadius="full"
                      onClick={() => handleQuickRemoveImage(i)}
                    />
                  </Box>
                ))}
              </SimpleGrid>
            ) : (
              <Text color="warm.600" fontSize="xs" textAlign="center" py={2}>
                拖拽图片到此处，或点击下方按钮选择（最多 5 张）
              </Text>
            )}

            <HStack spacing={2} justify="center">
              <Input
                type="file"
                accept="image/*"
                multiple
                onChange={handleQuickImageSelect}
                display="none"
                id="quick-note-image-input"
              />
              <Button
                size="xs"
                variant="outline"
                colorScheme="gray"
                leftIcon={<Icon as={FiCamera} />}
                onClick={() => document.getElementById('quick-note-image-input')?.click()}
                isDisabled={quickImages.length >= 5}
              >
                {quickImages.length > 0 ? `${quickImages.length}/5` : '添加图片'}
              </Button>
              <Text color="warm.600" fontSize="xs">支持粘贴、拖拽或点击上传</Text>
            </HStack>
          </Box>

          {/* 底部栏 */}
          <HStack justify="space-between" align="center">
            <HStack spacing={3}>
              <Text color="warm.600" fontSize="xs">{quickText.length} / 2000</Text>
              {quickImages.length > 0 && (
                <Text color="rgba(245,240,232,0.55)" fontSize="xs">{quickImages.length} 张图片</Text>
              )}
            </HStack>
            <Button
              colorScheme="yellow"
              size="sm"
              leftIcon={<Icon as={FiZap} />}
              onClick={handleQuickExtract}
              isLoading={quickAnalyzing}
              loadingText="AI分析中..."
              isDisabled={quickText.trim().length < 10 && quickImages.length === 0}
            >
              分析保存
            </Button>
          </HStack>

          {/* 本次结果 */}
          {quickResult && (
            <Box bg={quickResult.count > 0 ? 'green.800' : 'blue.800'} p={3} borderRadius="md" borderLeft="3px solid" borderColor={quickResult.count > 0 ? 'green.400' : 'blue.400'}>
              {quickResult.count > 0 ? (
                <>
                  <Text color="green.200" fontSize="sm" mb={2}>AI 学到了 {quickResult.count} 个新信息：</Text>
                  <HStack wrap="wrap" spacing={2}>
                    {quickResult.fields.map(f => (
                      <Tag key={f.key} size="sm" colorScheme="green" variant="subtle">
                        {f.label}: {f.value}
                      </Tag>
                    ))}
                  </HStack>
                </>
              ) : (
                <Text color="blue.200" fontSize="sm">未发现新信息，但文字和图片已记录</Text>
              )}
              {quickResult.imageUrls?.length > 0 && (
                <HStack mt={2} spacing={2}>
                  {quickResult.imageUrls.map((url, i) => (
                    <Image key={i} src={getMediaUrl(url)} alt="" h="40px" w="40px" objectFit="cover" borderRadius="md" />
                  ))}
                </HStack>
              )}
            </Box>
          )}
        </VStack>

        {/* 历史记录 */}
        {infoNotes.length > 0 && (
          <>
            <Divider my={4} borderColor="warm.600" />
            <Heading color="rgba(245,240,232,0.4)" size="xs" textTransform="uppercase" letterSpacing="wider" mb={3}>历史记录</Heading>
            <VStack spacing={3} align="stretch">
              {[...infoNotes].reverse().map(note => (
                <Box key={note.id} bg="warm.800" p={3} borderRadius="md" borderLeft="3px solid" borderColor="warm.600">
                  <Text color="rgba(245,240,232,0.55)" fontSize="xs" mb={1}>
                    {new Date(note.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {note.text ? (
                    <Text color="gray.300" fontSize="sm" noOfLines={2} mb={(note.images?.length > 0 || note.extractedFields?.length > 0) ? 2 : 0}>{note.text}</Text>
                  ) : null}
                  {note.images?.length > 0 && (
                    <HStack spacing={2} mb={note.extractedFields?.length > 0 ? 2 : 0} overflowX="auto">
                      {note.images.map((url, i) => (
                        <Image
                          key={i}
                          src={getMediaUrl(url)}
                          alt={`历史图片 ${i + 1}`}
                          h="50px"
                          w="50px"
                          objectFit="cover"
                          borderRadius="md"
                          flexShrink={0}
                          cursor="pointer"
                          onClick={() => window.open(getMediaUrl(url), '_blank')}
                        />
                      ))}
                    </HStack>
                  )}
                  {note.extractedFields?.length > 0 && (
                    <HStack wrap="wrap" spacing={1.5}>
                      {note.extractedFields.map(f => (
                        <Tag key={f.key} size="sm" colorScheme="gold" variant="subtle">{f.label}: {f.value}</Tag>
                      ))}
                    </HStack>
                  )}
                </Box>
              ))}
            </VStack>
          </>
        )}
      </Box>

      {/* ====== 第一区：档案信息 ====== */}
      <Flex align="center" mb={4}>
        <Box w="3px" h="18px" bg="blue.400" borderRadius="full" mr={2} />
        <Heading color="white" size="md">档案信息</Heading>
      </Flex>

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={0} gap={4} mb={4}>
        {Object.entries(FIELD_GROUPS).map(([groupKey, group]) => (
          <Box key={groupKey} data-section={groupKey} className="hover-lift" bg="warm.700" border="1px solid" borderColor="rgba(226,176,68,0.1)" borderRadius="md" p={4} cursor="pointer" onClick={() => openEdit(groupKey)} _hover={{ borderColor: 'rgba(226,176,68,0.25)' }}>
            <Text color={group.color} fontSize="xs" fontWeight="bold" mb={3} textTransform="uppercase" letterSpacing="wider">{group.title}</Text>
            <SimpleGrid columns={2} spacing={3}>
              {group.fields.map(fk => {
                const val = girl[fk];
                if (fk === 'height') return <FieldRow key={fk} label="身高" value={val ? `${val}cm` : null} />;
                if (fk === 'weight') return <FieldRow key={fk} label="体重" value={val ? `${val}kg` : null} />;
                if (fk === 'age') return <FieldRow key={fk} label="年龄" value={val ? `${val}岁` : null} />;
                return <EmptyValue key={fk} value={val}>
                  <Box><Text color="rgba(245,240,232,0.55)" fontSize="xs">{ALL_FIELD_LABELS[fk] || fk}</Text><Text color="gray.200" fontSize="sm">{val}</Text></Box>
                </EmptyValue>;
              })}
            </SimpleGrid>
            {(groupKey === 'appearance' && girl.styleTags) && <TagRow label="风格标签" value={girl.styleTags} />}
            {(groupKey === 'interests') && <TagRow label="兴趣标签" value={girl.interests} />}
          </Box>
        ))}
      </SimpleGrid>

      {/* ---- 照片与媒体（档案信息区内）---- */}
      <Box mt={0}>
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          {/* 主页与来源 */}
          <Box data-section="media" className="hover-lift" bg="warm.700" border="1px solid" borderColor="rgba(226,176,68,0.1)" borderRadius="md" p={4} cursor="pointer" onClick={() => openEdit('media')} _hover={{ borderColor: 'rgba(226,176,68,0.25)' }}>
            <Text color="gold.400" fontSize="xs" fontWeight="bold" mb={3} textTransform="uppercase" letterSpacing="wider">主页与来源</Text>
            <VStack spacing={3} align="stretch">
              <EmptyValue value={girl.homepageUrl}>
                <Text color="rgba(245,240,232,0.55)" fontSize="xs">主页链接</Text>
                <Text color="gold.300" fontSize="sm" noOfLines={1} wordBreak="break-all">{girl.homepageUrl}</Text>
              </EmptyValue>
              <EmptyValue value={girl.sourcePlatform}>
                <Text color="rgba(245,240,232,0.55)" fontSize="xs">来源平台</Text>
                <Text color="gray.200" fontSize="sm">{girl.sourcePlatform}</Text>
              </EmptyValue>
              <EmptyValue value={girl.sourceUrl}>
                <Text color="rgba(245,240,232,0.55)" fontSize="xs">来源链接</Text>
                <Text color="rgba(245,240,232,0.4)" fontSize="xs" noOfLines={1} wordBreak="break-all">{girl.sourceUrl}</Text>
              </EmptyValue>
            </VStack>
          </Box>

          {/* 照片 */}
          <Box className="hover-lift" bg="warm.700" border="1px solid" borderColor="rgba(226,176,68,0.1)" borderRadius="md" p={4}>
            <Text color="gold.400" fontSize="xs" fontWeight="bold" mb={3} textTransform="uppercase" letterSpacing="wider">
              照片{photos?.length ? ` (${photos.length})` : ''}
            </Text>
            {photos && photos.length > 0 ? (
              <SimpleGrid columns={Math.min(photos.length, 4)} spacing={2}>
                {photos.map((url, i) => (
                  <Image key={i} src={getMediaUrl(url)} alt={`照片${i+1}`} h="100px" w="100%" objectFit="cover" borderRadius="md" fallbackSrc="https://via.placeholder.com/100x100?text=..."/>
                ))}
              </SimpleGrid>
            ) : (
              <Text color="warm.600" fontSize="sm" textAlign="center" py={4}>暂无照片</Text>
            )}
          </Box>

          {/* 朋友圈截图 */}
          <Box className="hover-lift" bg="warm.700" border="1px solid" borderColor="rgba(226,176,68,0.1)" borderRadius="md" p={4}>
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
              <Text color="warm.600" fontSize="sm" textAlign="center" py={4}>暂无截图</Text>
            )}
          </Box>

          {/* 视频 */}
          <Box className="hover-lift" bg="warm.700" border="1px solid" borderColor="rgba(226,176,68,0.1)" borderRadius="md" p={4}>
            <Text color="gold.400" fontSize="xs" fontWeight="bold" mb={3} textTransform="uppercase" letterSpacing="wider">
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
              <Text color="warm.600" fontSize="sm" textAlign="center" py={4}>暂无视频</Text>
            )}
          </Box>
        </SimpleGrid>
      </Box>

      {/* ====== 第二区：系统分析 ====== */}
      <Flex align="center" mb={4} mt={6}>
        <Box w="3px" h="18px" bg="purple.400" borderRadius="full" mr={2} />
        <Heading color="white" size="md">系统分析</Heading>
      </Flex>

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={0} gap={4}>
        {/* AI画像 */}
        <SectionCard title="AI 画像" color="purple.400" section="personality">
          <FieldRow label="性格" value={girl.personality} />
          <TagRow label="价值观" value={girl.values_} />
          <FieldRow label="沟通风格" value={girl.communicationStyle} />
          <FieldRow label="情绪触发点" value={girl.emotionalTriggers} />
          <FieldRow label="喜欢的话题" value={girl.talkingTopics} />
          <FieldRow label="禁忌话题" value={girl.thingsToAvoid} />
        </SectionCard>

        {/* EQ评分 */}
        <SectionCard title="EQ 评分" color="purple.400" section="eq">
          <EQBar label="共情能力" value={girl.empathy} />
          <EQBar label="自我认知" value={girl.selfAwareness} />
          <EQBar label="沟通能力" value={girl.communication} />
          <EQBar label="关系经营" value={girl.relationship} />
          <EQBar label="冲突解决" value={girl.conflictRes} />
          {(girl.empathy || girl.selfAwareness || girl.communication || girl.relationship || girl.conflictRes) ? null : (
            <Text color="warm.600" fontSize="sm" textAlign="center" py={4}>暂无EQ评分数据</Text>
          )}
        </SectionCard>

        {/* AI战略建议 */}
        <SectionCard title="AI 战略建议" color="orange.400" section="strategy">
          <FieldRow label="最佳策略" value={girl.bestApproach} />
          <FieldRow label="推荐话题" value={girl.recommendedTopics} />
          <FieldRow label="升级条件" value={girl.upgradeConditions} />
          <FieldRow label="预计时间线" value={girl.estimatedTimeline} />
          <FieldRow label="风险因素" value={girl.riskFactors} />
          <FieldRow label="战略备注" value={girl.strategicNotes} />
        </SectionCard>

        {/* 匹配分析 */}
        <SectionCard title="匹配分析" color="orange.400" section="match">
          {girl.matchScore ? (
            <HStack mb={3}>
              <Text color="rgba(245,240,232,0.55)" fontSize="xs">匹配度</Text>
              <Text color="gold.400" fontSize="2xl" fontWeight="bold">{girl.matchScore}</Text>
              <Text color="rgba(245,240,232,0.55)" fontSize="xs">/ 100</Text>
            </HStack>
          ) : <Text color="warm.600" fontSize="sm" mb={3}>暂无评分</Text>}
          <FieldRow label="计算依据" value={girl.matchScoreBasis} />
          <FieldRow label="择偶偏好" value={girl.matePreferences} />
        </SectionCard>
      </SimpleGrid>

      {/* ====== 第二区·附：上下文记忆（有数据时才显示）====== */}
      {(signals.length > 0 || pendingActions.length > 0 || observations.length > 0 || girl.conversationSummary) && (
        <>
          <Flex align="center" mb={4} mt={6}>
            <Box w="3px" h="18px" bg="gold.400" borderRadius="full" mr={2} />
            <Heading color="white" size="md">上下文记忆</Heading>
          </Flex>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} mb={6}>
            {girl.conversationSummary && (
              <SectionCard title="对话摘要" color="gold.400">
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
                      <HStack key={i} spacing={2} bg="warm.600" p={2} borderRadius="md" align="start">
                        <Badge colorScheme={typeColor} fontSize="xs" mt="1px" flexShrink={0}>{typeLabel}</Badge>
                        <Text color="gray.200" fontSize="sm" flex={1}>{event}</Text>
                        {date && <Text color="rgba(245,240,232,0.55)" fontSize="xs" flexShrink={0}>{date}</Text>}
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
        </>
      )}

      {/* ====== 第三区：关联记录 ====== */}
      <Flex align="center" mb={4} mt={6}>
        <Box w="3px" h="18px" bg="orange.400" borderRadius="full" mr={2} />
        <Heading color="white" size="md">关联记录</Heading>
      </Flex>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        {/* 约会记录 */}
        <SectionCard title={`约会记录 (${related?.dates?.length || 0})`} color="orange.400">
          {!related?.dates?.length ? (
            <Text color="warm.600" fontSize="sm" textAlign="center" py={4}>暂无约会记录</Text>
          ) : (
            <VStack spacing={2} align="stretch">
              {related.dates.map(d => (
                <Box key={d.id} p={2} bg="warm.600" borderRadius="md">
                  <HStack justify="space-between">
                    <Text color="gray.200" fontSize="sm">{d.title || d.location || '约会'}</Text>
                    <Badge colorScheme={d.status === 'confirmed' ? 'green' : d.status === 'pending' ? 'yellow' : 'gray'} fontSize="xs">
                      {d.status === 'confirmed' ? '已确认' : d.status === 'pending' ? '待确认' : d.status || '未知'}
                    </Badge>
                  </HStack>
                  <Text color="rgba(245,240,232,0.55)" fontSize="xs">
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
            <Text color="warm.600" fontSize="sm" textAlign="center" py={4}>暂无阶段变更</Text>
          ) : (
            <VStack spacing={2} align="stretch">
              {related.stageHistory.map(h => (
                <Box key={h.id} p={2} bg="warm.600" borderRadius="md">
                  <HStack justify="space-between">
                    <Text color="gray.200" fontSize="sm">
                      {h.fromStage ? `${RELATIONSHIP_STAGE_LABELS[h.fromStage] || h.fromStage} → ` : ''}
                      {RELATIONSHIP_STAGE_LABELS[h.toStage] || h.toStage}
                    </Text>
                    <Text color="rgba(245,240,232,0.55)" fontSize="xs">{new Date(h.createdAt).toLocaleDateString('zh-CN')}</Text>
                  </HStack>
                  {h.reason && <Text color="rgba(245,240,232,0.55)" fontSize="xs" mt={1}>{h.reason}</Text>}
                </Box>
              ))}
            </VStack>
          )}
        </SectionCard>
      </SimpleGrid>

      {/* ---- 编辑 Modal ---- */}
      <Modal isOpen={isEditOpen} onClose={onEditClose} size={{ base: 'full', md: '4xl' }}>
        <ModalOverlay />
        <ModalContent bg="warm.800" maxH="85vh" overflowY="auto">
          <ModalHeader color="white">
            <HStack spacing={3}>
              <Text>编辑档案 - {girl.name}</Text>
              <HStack spacing={0} bg="warm.700" borderRadius="md" p="2px">
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
              <>
                {/* 常用字段 */}
                <SimpleGrid columns={2} spacing={4}>
                  {GIRL_EDITABLE_FIELDS
                    .filter(f => COMMON_FIELD_KEYS.has(f.key))
                    .map(f => (
                      <div data-section={getSectionForField(f.key)} key={f.key}>
                        <ProfileField key={f.key} field={f} value={editData[f.key]} onChange={handleFieldChange} />
                      </div>
                    ))}
                </SimpleGrid>
                {/* 更多字段折叠按钮 */}
                <Button
                  variant="ghost"
                  size="sm"
                  color="gold.400"
                  onClick={() => setShowAdvancedFields(!showAdvancedFields)}
                  _hover={{ bg: 'warm.700' }}
                  mt={4}
                >
                  {showAdvancedFields ? '收起' : '更多资料'}
                  <Text as="span" ml={1}>{showAdvancedFields ? '▲' : '▼'}</Text>
                </Button>
                {/* 高级字段折叠区 */}
                {showAdvancedFields && (
                  <SimpleGrid columns={2} spacing={4} mt={4}>
                    {GIRL_EDITABLE_FIELDS
                      .filter(f => !COMMON_FIELD_KEYS.has(f.key))
                      .map(f => (
                        <div data-section={getSectionForField(f.key)} key={f.key}>
                          <ProfileField key={f.key} field={f} value={editData[f.key]} onChange={handleFieldChange} />
                        </div>
                      ))}
                  </SimpleGrid>
                )}
              </>
            ) : (
              /* ---- AI 模式 ---- */
              <VStack spacing={4} align="stretch">
                {/* 子 tab 切换 */}
                <HStack spacing={0} bg="warm.700" borderRadius="md" p="2px" w="fit-content">
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
                    <Text color="rgba(245,240,232,0.4)" fontSize="sm">
                      粘贴一段关于这位女生的描述文字，AI 将自动分析并提取档案字段。支持描述昵称、年龄、职业、学历、性格、兴趣爱好等。
                    </Text>
                    <Textarea
                      value={aiText}
                      onChange={e => setAiText(e.target.value)}
                      placeholder="例如：她叫小美，25岁，在互联网公司做设计师，杭州人，浙江大学计算机系毕业，性格活泼开朗，喜欢健身和旅行..."
                      rows={5}
                      bg="warm.700" color="white"
                      border="1px solid" borderColor="warm.600"
                      _hover={{ borderColor: 'rgba(245,240,232,0.2)' }}
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
                    <Text color="rgba(245,240,232,0.4)" fontSize="sm">
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
                  <Box bg="warm.700" border="1px solid" borderColor="warm.600" borderRadius="md" overflow="hidden">
                    <Box px={4} py={3} borderBottom="1px solid" borderColor="warm.600">
                      <HStack justify="space-between">
                        <HStack>
                          <Icon as={FiZap} color="gold.400" />
                          <Text color="gold.300" fontWeight="bold" fontSize="sm">AI 识别结果（共 {Object.keys(aiResult).length} 个字段）</Text>
                        </HStack>
                        <HStack spacing={2}>
                          <Button size="xs" variant="ghost" color="rgba(245,240,232,0.4)" onClick={() => setAiResult(null)} leftIcon={<Icon as={FiX} />}>清除</Button>
                          <Button size="xs" colorScheme="gold" onClick={applyAiResult} leftIcon={<Icon as={FiCheck} />}>应用到表单</Button>
                        </HStack>
                      </HStack>
                    </Box>
                    <Box px={4} py={3}>
                      <SimpleGrid columns={2} spacing={2}>
                        {Object.entries(aiResult).map(([key, { label, value }]) => (
                          <HStack key={key} justify="space-between" bg="warm.800" px={3} py={1.5} borderRadius="md">
                            <Text color="rgba(245,240,232,0.4)" fontSize="sm">{label}</Text>
                            <Text color="white" fontSize="sm" fontWeight="medium">{value}</Text>
                          </HStack>
                        ))}
                      </SimpleGrid>
                    </Box>
                  </Box>
                )}

                <HStack justify="flex-end" spacing={3}>
                  <Button variant="ghost" color="rgba(245,240,232,0.4)" onClick={onEditClose}>取消</Button>
                  <Button colorScheme="gold" onClick={() => setAiMode(false)}>返回手动填写</Button>
                </HStack>
              </VStack>
            )}
          </ModalBody>

          {!aiMode && (
            <ModalFooter>
              <Button variant="ghost" mr={3} onClick={onEditClose}>取消</Button>
              <Button colorScheme="gold" onClick={handleSave} isLoading={saving}>保存</Button>
            </ModalFooter>
          )}
        </ModalContent>
      </Modal>
    </Box>

  );
}
