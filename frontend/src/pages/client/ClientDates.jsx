import { useEffect, useState, useMemo, useRef } from 'react';
import {
  Box, Heading, Card, CardBody, Button, Badge, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalBody, ModalCloseButton, useDisclosure, VStack, HStack, Text,
  SimpleGrid, Flex, Divider, Tag, Wrap, WrapItem, useToast, Textarea, FormControl,
  FormLabel, Icon, Alert, AlertIcon, AlertDescription, Spinner, Progress, Tabs, TabList, TabPanels, Tab, TabPanel, Input, Select, Center, Avatar, Link, Table
} from '@chakra-ui/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DatePicker, { registerLocale } from 'react-datepicker';
import { zhCN } from 'date-fns/locale/zh-CN';
import 'react-datepicker/dist/react-datepicker.css';
import { CalendarIcon, SparklesIcon, QuestionIcon, CopyIcon, MapPinIcon, ClockIcon, FireIcon } from '../../components/Icons';
import ClientCalendar from '../../components/ClientCalendar';
import { dates, membership as membershipApi, clients, getMediaUrl } from '../../utils/api';

function formatLocalDateTime(date) {
  if (!date) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

registerLocale('zh-CN', zhCN);

function parseJSON(val, fallback = null) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

// 去除 AI 输出中包裹的 ```markdown ... ``` 代码块
function unwrapMarkdown(content) {
  if (!content) return content;
  let text = content.trim();
  if (text.startsWith('```markdown')) {
    text = text.slice('```markdown'.length);
  } else if (text.startsWith('```')) {
    text = text.slice(3);
  }
  if (text.endsWith('```')) {
    text = text.slice(0, -3);
  }
  return text.trim();
}

// 流式输出时清除 JSON 结构符号，只保留可读文本
function cleanStreamText(text) {
  if (!text) return '';
  return text
    .replace(/^[\s]*[\[\{][\s]*/gm, '')       // 行首的 { 或 [
    .replace(/[\s]*[\]\}][\s]*[,]?[\s]*$/gm, '') // 行尾的 } 或 ] 及逗号
    .replace(/"[^"]*"\s*:\s*/g, '')            // "key":
    .replace(/^\s*"|"\s*[,]?\s*$/gm, '')       // 行首尾的引号
    .replace(/\\n/g, '\n')                      // 转义换行
    .replace(/\\"/g, '"')                       // 转义引号
    .replace(/\n{3,}/g, '\n\n')                 // 合并多余空行
    .trim();
}

// 过滤思考过程中的业务无关元指令
function filterReasoning(text) {
  if (!text) return '';
  return text
    .split(/[。\n]/)
    .filter(s => {
      const t = s.trim();
      if (!t) return false;
      // 包含 JSON 的句子全部去掉
      if (/json/i.test(t)) return false;
      // 包含字段名枚举的去掉
      if (/overview.*venue.*schedule|包含.*字段|字段.*包含/.test(t)) return false;
      // 元指令类去掉
      if (/我们被要求|需要生成|注意.*格式|按照.*格式|确保.*输出|返回.*格式|根据.*要求.*生成/.test(t)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 访谈状态标签映射
const STATUS_COLORS = {
  plan_pending: 'orange',
  planned: 'teal',
  pending_client_confirm: 'purple',
  confirmed: 'green',
  completed: 'green',
  interview_pending: 'cyan',
  interview_answered: 'teal',
};
const STATUS_LABELS = {
  plan_pending: '待策划',
  planned: '已策划',
  pending_client_confirm: '待确认',
  confirmed: '已确认',
  completed: '已完成',
  interview_pending: '待填写访谈',
  interview_answered: '访谈已填',
};

export default function ClientDates() {
  const [datesList, setDatesList] = useState([]);
  const [allDates, setAllDates] = useState([]);
  const [aiPlans, setAiPlans] = useState([]);
  const [clientId, setClientId] = useState(null);
  const [girlList, setGirlList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackReason, setFeedbackReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pendingInterviews, setPendingInterviews] = useState([]);
  const [interviewModal, setInterviewModal] = useState(null);
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [interviewAnswers, setInterviewAnswers] = useState({});
  const [interviewSubmitting, setInterviewSubmitting] = useState(false);
  const [selectedAiPlan, setSelectedAiPlan] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addStep, setAddStep] = useState(1); // 1=选择女生 2=填写信息
  const [selectedGirlForDate, setSelectedGirlForDate] = useState(null);
  const [dateForm, setDateForm] = useState({
    title: '', dateTime: '', location: '', notes: '',
    scene: '', budget: '', duration: '半天', transportMode: '地铁/打车',
    relationshipStage: '初次见面', specialRequirements: ''
  });
  const [showAiFields, setShowAiFields] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterGirlId, setFilterGirlId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const toast = useToast();
  // 加载记忆的偏好设置
  useEffect(() => {
    const savedTransport = localStorage.getItem('dating_transportMode');
    if (savedTransport) {
      setDateForm(prev => ({ ...prev, transportMode: savedTransport }));
    }
  }, []);

  // 记忆出行方式偏好
  const handleTransportModeChange = (value) => {
    setDateForm(prev => ({ ...prev, transportMode: value }));
    localStorage.setItem('dating_transportMode', value);
  };

  // 统计计算（客户视角：我的进度、待办、活跃度、花费）
  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() + 7);
    return {
      pending: allDates.filter(d => d.status === 'pending_client_confirm').length,
      interviews: pendingInterviews.length,
      completed: allDates.filter(d => d.status === 'completed').length,
      thisMonth: allDates.filter(d => {
        if (!d.dateTime) return false;
        const dt = new Date(d.dateTime);
        return dt.getFullYear() === thisYear && dt.getMonth() === thisMonth;
      }).length,
      thisWeekExpense: allDates.reduce((sum, d) => {
        if (!d.dateTime || d.status === 'cancelled') return sum;
        const dt = new Date(d.dateTime);
        if (dt >= now && dt <= weekEnd) return sum + (d.totalExpense || 0);
        return sum;
      }, 0),
    };
  }, [allDates, pendingInterviews]);

  // 获取即将到来的约会（最近一个未完成的）
  const upcomingDate = allDates
    .filter(d => d.dateTime && d.status !== 'completed' && d.status !== 'cancelled')
    .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))[0] || null;

  // 过滤后的列表
  const filteredDates = useMemo(() => {
    return datesList.filter(d => {
      if (filterGirlId && d.girlId !== filterGirlId) return false;
      if (filterStatus && d.status !== filterStatus) return false;
      return true;
    });
  }, [datesList, filterGirlId, filterStatus]);

  const filteredAiPlans = useMemo(() => {
    // AI方案不绑定女生、没有Date状态，过滤条件激活时隐藏
    if (filterGirlId || filterStatus) return [];
    return aiPlans;
  }, [aiPlans, filterGirlId, filterStatus]);

  // 获取头像（优先用自定义头像，其次用照片，最后用名字生成默认头像）
  const getAvatar = (girl) => {
    if (!girl) return null;
    // 优先使用用户自定义头像
    if (girl.avatar) return getMediaUrl(girl.avatar);
    // 其次使用第一张照片
    if (girl.photos) {
      try {
        const photos = typeof girl.photos === 'string' ? JSON.parse(girl.photos) : girl.photos;
        if (Array.isArray(photos) && photos[0]) return getMediaUrl(photos[0]);
      } catch {}
    }
    // 用名字生成固定头像索引
    const name = girl.name || '';
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash) + name.charCodeAt(i);
      hash = hash & hash;
    }
    return `https://i.pravatar.cc/150?img=${Math.abs(hash) % 70}`;
  };

  // 格式化日期显示
  const formatDateRelative = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (target.getTime() === today.getTime()) return '今天';
    if (target.getTime() === tomorrow.getTime()) return '明天';
    if (target < today) return '已过期';

    const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    if (diff <= 7) return `本周${'日一二三四五六'[date.getDay()]}`;

    return `${date.getMonth() + 1}月${date.getDate()}日`;
  };

  // 进度计算
  const getProgress = (dateItem) => {
    if (dateItem.status === 'completed') return { percent: 100, label: '已完成' };
    if (dateItem.status === 'confirmed' || dateItem.status === 'planned') return { percent: 75, label: '方案已确认' };
    if (dateItem.status === 'pending_client_confirm') return { percent: 50, label: '待您确认' };
    if (dateItem.planStatus === 'pending' || dateItem.status === 'pending_plan') return { percent: 25, label: '等待策划' };
    return { percent: 10, label: '初始化' };
  };

  const handleSaveDate = async () => {
    if (!selectedGirlForDate) {
      toast({ title: '请选择约会对象', status: 'warning' });
      return;
    }
    setSaving(true);
    try {
      const res = await dates.create({
        girlId: selectedGirlForDate.id,
        dateTime: dateForm.dateTime || undefined,
        location: dateForm.location,
        title: dateForm.title || '新约会',
        notes: dateForm.notes
      });
      if (res.success) {
        toast({ title: '约会添加成功', status: 'success', duration: 2000 });
        setShowAddModal(false);
        resetDateForm();
        loadAll();
      } else {
        toast({ title: res.error || '添加失败', status: 'error' });
      }
    } catch (e) {
      toast({ title: '添加失败', status: 'error' });
    }
    setSaving(false);
  };

  const resetDateForm = () => {
    setDateForm({
      title: '', dateTime: '', location: '', notes: '',
      scene: '', budget: '', duration: '半天', transportMode: localStorage.getItem('dating_transportMode') || '地铁/打车',
      relationshipStage: '初次见面', specialRequirements: ''
    });
    setShowAiFields(false);
    setSelectedGirlForDate(null);
    setAddStep(1);
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [pendingRes, allDatesRes, interviewsRes, aiPlansRes] = await Promise.all([
        dates.getClientPending(),
        dates.list().catch(() => ({ success: false, dates: [] })),
        dates.getClientInterviews().catch(() => ({ success: false })),
        membershipApi.datingPlans().catch(() => ({ success: false }))
      ]);
      if (pendingRes.success) setDatesList(pendingRes.dates || []);
      if (allDatesRes.success) setAllDates(allDatesRes.dates || []);
      if (interviewsRes?.success) setPendingInterviews(interviewsRes.interviews || []);
      if (aiPlansRes?.success) setAiPlans(aiPlansRes.plans || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // 加载客户ID、女生列表和偏好设置
  useEffect(() => {
    const loadClientInfo = async () => {
      try {
        const res = await clients.me();
        if (res.client?.id) {
          setClientId(res.client.id);
        }
        if (res.client?.girls) {
          setGirlList(res.client.girls);
        }
        // 预填充用户偏好
        if (res.client) {
          setDateForm(prev => ({
            ...prev,
            transportMode: res.client.preferredTransportMode || prev.transportMode,
          }));
        }
      } catch (e) { console.error(e); }
    };
    loadClientInfo();
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadAll(); }, []);

  // 关闭方案详情弹窗时清理流式状态
  useEffect(() => {
    if (!isOpen) {
      isStreamingRef.current = false;
      reoptimizingRef.current = false;
      setReoptimizing(false);
      setStreamStatus('');
      setStreamReasoning('');
      setStreamContent('');
    }
  }, [isOpen]);

  // 组件卸载时确保清理
  useEffect(() => {
    return () => {
      isStreamingRef.current = false;
      reoptimizingRef.current = false;
    };
  }, []);

  const openDetail = async (d) => {
    setSelected(d);
    setFeedbackText('');
    setFeedbackReason('');
    onOpen();
  };

  const handleConfirm = async () => {
    if (!selected) return;
    setConfirming(true);
    try {
      const res = await dates.clientConfirm(selected.id);
      if (res.success) {
        toast({ title: res.message, status: 'success', duration: 3000 });
        onClose();
        loadAll();
      } else {
        toast({ title: res.error || '确认失败', status: 'error', duration: 2500 });
      }
    } catch (e) {
      console.error(e);
      toast({ title: '确认失败', status: 'error', duration: 2500 });
    }
    setConfirming(false);
  };

  const handleFeedback = async () => {
    if (!selected || !feedbackText.trim()) {
      toast({ title: '请填写调整建议', status: 'warning', duration: 2000 });
      return;
    }
    setSubmitting(true);
    try {
      const res = await dates.submitClientFeedback(selected.id, {
        adjustment: feedbackText,
        reason: feedbackReason
      });
      if (res.success) {
        toast({ title: '调整建议已提交，顾问会优化方案', status: 'success', duration: 3000 });
        onClose();
        loadAll();
      } else {
        toast({ title: res.error || '提交失败', status: 'error', duration: 2500 });
      }
    } catch (e) {
      console.error(e);
      toast({ title: '提交失败', status: 'error', duration: 2500 });
    }
    setSubmitting(false);
  };

  const [reoptimizing, setReoptimizing] = useState(false);
  const reoptimizingRef = useRef(false);
  const modalContentRef = useRef(null);
  const reasoningEndRef = useRef(null);
  const streamContentEndRef = useRef(null);

  // SSE 流式生成状态
  const [streamStatus, setStreamStatus] = useState('');
  const [streamReasoning, setStreamReasoning] = useState('');
  const [streamContent, setStreamContent] = useState('');
  const [showReasoning, setShowReasoning] = useState(false);
  const isStreamingRef = useRef(false);

  const handleReoptimizeDate = async () => {
    if (!selected || reoptimizingRef.current) return;
    reoptimizingRef.current = true;
    setReoptimizing(true);
    setStreamStatus('正在连接...');
    setStreamReasoning('');
    setStreamContent('');
    setShowReasoning(false);
    isStreamingRef.current = true;

    // 滚动到弹窗顶部
    if (modalContentRef.current) {
      modalContentRef.current.scrollTop = 0;
    }

    await dates.generatePlanStream(selected.id, {
      onStatus: (text) => {
        if (!isStreamingRef.current) return;
        setStreamStatus(text);
      },
      onReasoning: (text) => {
        if (!isStreamingRef.current) return;
        setStreamReasoning(prev => prev + text);
        setShowReasoning(true);
        setTimeout(() => {
          reasoningEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 50);
      },
      onContent: (text) => {
        if (!isStreamingRef.current) return;
        setStreamContent(prev => prev + text);
        setStreamStatus('AI 正在生成方案...');
        setTimeout(() => {
          streamContentEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 50);
      },
      onDone: (plan, updatedDate) => {
        if (!isStreamingRef.current) return;
        // 用新方案更新 selected，保持 modal 打开
        if (plan) {
          setSelected(prev => prev ? {
            ...prev,
            aiPlan: plan,
            planStatus: 'generated',
            status: updatedDate?.status || 'planned'
          } : prev);
        }
        toast({ title: '方案已重新生成', status: 'success', duration: 3000 });
        reoptimizingRef.current = false;
        setReoptimizing(false);
        isStreamingRef.current = false;
        setStreamStatus('');
        setStreamContent('');
        loadAll();
      },
      onError: (msg) => {
        toast({ title: msg || '重新生成失败', status: 'error' });
        reoptimizingRef.current = false;
        setReoptimizing(false);
        isStreamingRef.current = false;
        setStreamStatus('');
      }
    });
  };

  const [deleting, setDeleting] = useState(false);
  const handleDeleteDate = async (dateId) => {
    const id = dateId || selected?.id;
    if (!id) return;
    if (!window.confirm('确定要删除这个约会吗？关联的日历事件也会一并删除。')) return;
    setDeleting(true);
    try {
      const res = await dates.delete(id);
      if (res.success) {
        toast({ title: '约会已删除', status: 'success', duration: 2000 });
        if (dateId) {
          setDatesList(prev => prev.filter(d => d.id !== dateId));
          setAllDates(prev => prev.filter(d => d.id !== dateId));
        } else {
          onClose();
          loadAll();
        }
      } else {
        toast({ title: res.error || '删除失败', status: 'error' });
      }
    } catch (e) {
      toast({ title: '删除失败', status: 'error' });
    }
    setDeleting(false);
  };

  const [reoptimizingAi, setReoptimizingAi] = useState(false);
  const reoptimizingAiRef = useRef(false);

  const handleReoptimizeAiPlan = async () => {
    if (!selectedAiPlan || reoptimizingAiRef.current) return;
    reoptimizingAiRef.current = true;
    setReoptimizingAi(true);
    try {
      const res = await membershipApi.generateDatingPlan({
        title: selectedAiPlan.title,
        scene: selectedAiPlan.scene,
        budget: selectedAiPlan.budget,
        duration: selectedAiPlan.duration,
        girlId: selectedAiPlan.girlId,
        location: selectedAiPlan.location,
        dateTime: selectedAiPlan.dateTime,
        optimize: true,
        previousContent: selectedAiPlan.content
      });
      if (res.success) {
        toast({ title: 'AI 正在重新优化方案，请稍候...', status: 'success', duration: 2000 });
        // 不立即替换方案，保持当前内容可见，等轮询到新方案再更新
        pollPlanStatus(res.plan.id, true);
      } else {
        toast({ title: '重新优化失败', status: 'error' });
        reoptimizingAiRef.current = false;
        setReoptimizingAi(false);
      }
    } catch (e) {
      toast({ title: '重新优化失败', status: 'error' });
      reoptimizingAiRef.current = false;
      setReoptimizingAi(false);
    }
  };

  const generateAiPlan = async () => {
    if (!selectedGirlForDate) {
      toast({ title: '请先选择约会对象', status: 'warning' });
      return;
    }
    setGenerating(true);
    setShowAddModal(false);
    toast({ title: '大师团正在精心策划中...', status: 'info', duration: 3000 });

    try {
      // 传递女生完整信息给AI
      const girlInfo = {
        name: selectedGirlForDate.name,
        age: selectedGirlForDate.age,
        occupation: selectedGirlForDate.occupation,
        education: selectedGirlForDate.education,
        styleTags: selectedGirlForDate.styleTags,
        personalityTags: selectedGirlForDate.personalityTags,
        interests: selectedGirlForDate.interests,
        appearance: selectedGirlForDate.appearance,
        hometown: selectedGirlForDate.hometown,
        residence: selectedGirlForDate.residence,
      };
      const res = await membershipApi.generateDatingPlan({
        title: dateForm.title,
        scene: dateForm.scene,
        budget: dateForm.budget,
        duration: dateForm.duration,
        dateTime: dateForm.dateTime,
        location: dateForm.location,
        transportMode: dateForm.transportMode,
        relationshipStage: dateForm.relationshipStage,
        specialRequirements: dateForm.specialRequirements,
        girl: girlInfo
      });
      if (res.success) {
        // 添加到列表并选中
        setAiPlans(prev => [res.plan, ...prev]);
        setSelectedAiPlan(res.plan);

        // 清空表单
        resetDateForm();

        // 轮询刷新方案直到生成完成
        pollPlanStatus(res.plan.id);
      }
    } catch (err) {
      toast({ title: '生成失败', description: err.message, status: 'error' });
      setGenerating(false);
    }
  };

  // 轮询方案状态直到生成完成，keepContent=true 时不替换正在显示的内容
  const pollPlanStatus = async (planId, keepContent = false) => {
    const maxAttempts = 30; // 最多30次
    const interval = 2000;   // 每2秒查询一次

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, interval));

      try {
        const res = await membershipApi.getDatingPlan(planId);
        if (res.success && res.plan) {
          // 更新列表
          setAiPlans(prev => {
            const exists = prev.some(p => p.id === planId);
            return exists ? prev.map(p => p.id === planId ? res.plan : p) : [res.plan, ...prev];
          });

          if (res.plan.planStatus === 'generated') {
            setSelectedAiPlan(res.plan);
            setGenerating(false);
            reoptimizingAiRef.current = false;
            setReoptimizingAi(false);
            toast({ title: '✨ 方案已生成', status: 'success', duration: 3000 });
            return;
          }

          // 非 keepContent 模式才实时更新显示内容
          if (!keepContent) {
            setSelectedAiPlan(res.plan);
          } else {
            // keepContent 模式：仅同步 planStatus，顶部状态条需要它来显示生成进度
            setSelectedAiPlan(prev => prev ? { ...prev, planStatus: res.plan.planStatus } : prev);
          }
        }
      } catch (err) {
        console.error('轮询方案状态失败:', err);
      }
    }

    // 超过最大次数仍未完成
    setGenerating(false);
    toast({ title: '方案生成超时，请稍后刷新查看', status: 'warning', duration: 4000 });
  };

  // 打开访谈问卷
  const openInterview = (interview) => {
    setInterviewModal(interview);
    const initAnswers = {};
    (interview.questions || []).forEach(q => {
      initAnswers[q.id || `q${interview.questions.indexOf(q) + 1}`] = '';
    });
    setInterviewAnswers(initAnswers);
    setInterviewOpen(true);
  };

  const submitInterview = async () => {
    if (!interviewModal) return;
    setInterviewSubmitting(true);
    try {
      const answers = Object.entries(interviewAnswers).map(([id, answer]) => ({
        id, answer: answer.trim()
      })).filter(a => a.answer);
      if (answers.length === 0) {
        toast({ title: '请至少回答一个问题', status: 'warning', duration: 2000 });
        setInterviewSubmitting(false);
        return;
      }
      const res = await dates.submitInterview(interviewModal.dateId, answers);
      if (res.success) {
        toast({ title: '访谈已提交，顾问正在生成复盘分析', status: 'success', duration: 3000 });
        setInterviewOpen(false);
        setInterviewModal(null);
        loadAll();
      } else {
        toast({ title: res.error || '提交失败', status: 'error', duration: 2500 });
      }
    } catch (e) {
      console.error(e);
      toast({ title: '提交失败', status: 'error', duration: 2500 });
    }
    setInterviewSubmitting(false);
  };

  const renderPlan = (plan) => {
    if (!plan) return null;
    const p = typeof plan === 'string' ? parseJSON(plan) : plan;
    if (!p) return null;
    return (
      <Box>
        {p.overview && (
          <Alert status="info" mb={4} borderRadius="md">
            <AlertIcon /><AlertDescription>{p.overview}</AlertDescription>
          </Alert>
        )}

        {p.venue && (
          <Card bg="gray.750" mb={4}>
            <CardBody>
              <Text color="teal.400" fontWeight="bold" mb={2}>推荐地点</Text>
              <SimpleGrid columns={2} spacing={3}>
                <Box><Text color="gray.400" fontSize="sm">名称</Text><Text color="white">{p.venue.name}</Text></Box>
                <Box><Text color="gray.400" fontSize="sm">类型</Text><Text color="white">{p.venue.type}</Text></Box>
                <Box><Text color="gray.400" fontSize="sm">地址</Text><Text color="white">{p.venue.address}</Text></Box>
                <Box><Text color="gray.400" fontSize="sm">预算</Text><Text color="white">{p.venue.budget}</Text></Box>
              </SimpleGrid>
              {p.venue.reason && <Text color="gray.300" fontSize="sm" mt={2}><b>选点理由：</b>{p.venue.reason}</Text>}
            </CardBody>
          </Card>
        )}

        {p.schedule?.length > 0 && (
          <Card bg="gray.750" mb={4}>
            <CardBody>
              <Text color="teal.400" fontWeight="bold" mb={3}>约会时间表</Text>
              <VStack spacing={2} align="stretch">
                {p.schedule.map((s, i) => (
                  <Flex key={i} gap={3} p={2} bg="gray.700" borderRadius="md" align="center">
                    <Badge colorScheme="teal" minW="60px" textAlign="center">{s.time}</Badge>
                    <Box flex={1}>
                      <Text color="white" fontSize="sm">{s.activity}</Text>
                      {s.note && <Text color="gray.400" fontSize="xs">{s.note}</Text>}
                    </Box>
                    <Text color="gray.500" fontSize="xs">{s.duration}</Text>
                  </Flex>
                ))}
              </VStack>
            </CardBody>
          </Card>
        )}

        {p.talkingPoints?.length > 0 && (
          <Card bg="gray.750" mb={4}>
            <CardBody>
              <Text color="orange.400" fontWeight="bold" mb={3}>聊天话题</Text>
              <VStack spacing={2} align="stretch">
                {p.talkingPoints.map((t, i) => (
                  <Box key={i} p={2} bg="gray.700" borderRadius="md">
                    <Flex justify="space-between" mb={1}>
                      <Text color="orange.300" fontSize="sm">{t.topic}</Text>
                      <Badge colorScheme="purple" fontSize="xs">{t.goal}</Badge>
                    </Flex>
                    <Text color="gray.300" fontSize="xs">{t.content}</Text>
                  </Box>
                ))}
              </VStack>
            </CardBody>
          </Card>
        )}

        {p.precautions?.length > 0 && (
          <Card bg="gray.750" mb={4}>
            <CardBody>
              <Text color="red.400" fontWeight="bold" mb={3}>注意事项</Text>
              <VStack spacing={2} align="stretch">
                {p.precautions.map((p2, i) => (
                  <Box key={i} p={2} bg="gray.700" borderRadius="md">
                    <Text color="red.300" fontSize="sm">⚠ {p2.point}</Text>
                    <Text color="gray.400" fontSize="xs">{p2.suggestion}</Text>
                  </Box>
                ))}
              </VStack>
            </CardBody>
          </Card>
        )}

        <SimpleGrid columns={2} spacing={4}>
          {p.outfit && (
            <Card bg="gray.750">
              <CardBody>
                <Text color="pink.400" fontWeight="bold" mb={2}>穿搭建议</Text>
                <Text color="white" fontSize="sm">风格：{p.outfit.style}</Text>
                <Text color="white" fontSize="sm">颜色：{p.outfit.colors}</Text>
                <Text color="red.300" fontSize="xs">避免：{p.outfit.avoid}</Text>
              </CardBody>
            </Card>
          )}
          {p.budgetTips && (
            <Card bg="gray.750">
              <CardBody>
                <Text color="green.400" fontWeight="bold" mb={2}>预算建议</Text>
                <Text color="white" fontSize="sm">{p.budgetTips}</Text>
              </CardBody>
            </Card>
          )}
        </SimpleGrid>

        {p.successSignals?.length > 0 && (
          <Card bg="gray.750" mt={4}>
            <CardBody>
              <Text color="green.400" fontWeight="bold" mb={2}>约会好信号</Text>
              <Wrap>
                {p.successSignals.map((s, i) => <WrapItem key={i}><Tag colorScheme="green" size="sm">{s}</Tag></WrapItem>)}
              </Wrap>
            </CardBody>
          </Card>
        )}
      </Box>
    );
  };

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={6}>
        <Heading color="white">约会与方案</Heading>
        <HStack spacing={2}>
          <Button variant="outline" colorScheme="gray" size="sm" onClick={loadAll} isLoading={loading}>刷新</Button>
          <Button colorScheme="brand" leftIcon={<SparklesIcon />} onClick={() => setShowAddModal(true)}>
            添加约会
          </Button>
        </HStack>
      </Flex>

      <Tabs colorScheme="brand" variant="soft-rounded" mb={6} defaultIndex={window.location.hash === '#calendar' ? 1 : 0} isLazy lazyBehavior="keepMounted">
        <TabList>
          <Tab>约会方案</Tab>
          <Tab>我的日历</Tab>
        </TabList>
        <TabPanels>
          <TabPanel px={0}>
            {/* 访谈入口 */}
            {pendingInterviews.length > 0 && (
              <Box mb={4}>
                <Alert status="cyan" mb={4} borderRadius="md">
                  <AlertIcon />
                  <AlertDescription fontSize="sm">
                    您有 <strong>{pendingInterviews.length}</strong> 份约会反馈访谈等待填写，顾问需要了解您的约会体验来优化后续方案。
                  </AlertDescription>
                </Alert>
                <VStack spacing={3} align="stretch">
                  {pendingInterviews.map((iv, i) => (
                    <Card key={iv.dateId || i} bg="cyan.900" border="1px solid" borderColor="cyan.600">
                      <CardBody>
                        <Flex justify="space-between" align="center">
                          <Box>
                            <HStack spacing={2} mb={1}>
                              <Icon as={QuestionIcon} color="cyan.300" />
                              <Text color="cyan.200" fontWeight="bold">{iv.title}</Text>
                              <Badge colorScheme="cyan">{iv.questions?.length || 0}个问题</Badge>
                            </HStack>
                            {iv.interviewOverview && (
                              <Text color="cyan.300" fontSize="sm" mb={1}>{iv.interviewOverview}</Text>
                            )}
                            <Text color="gray.400" fontSize="xs">
                              约会对象：{iv.girlName} · 推送时间：{iv.pushedAt ? new Date(iv.pushedAt).toLocaleDateString('zh-CN') : '-'}
                            </Text>
                          </Box>
                          <Button colorScheme="cyan" size="sm" onClick={() => openInterview(iv)}>
                            填写访谈
                          </Button>
                        </Flex>
                      </CardBody>
                    </Card>
                  ))}
                </VStack>
              </Box>
            )}

            {/* 统计栏 — 客户视角：我的进度、待办、活跃度 */}
            {!loading && (allDates.length > 0 || aiPlans.length > 0 || pendingInterviews.length > 0) && (
              <SimpleGrid columns={{ base: 2, md: 5 }} spacing={3} mb={6}>
                <Card bg="gray.800" border="1px solid" borderColor="yellow.600">
                  <CardBody py={4} px={4}>
                    <Flex align="center" gap={3}>
                      <Box w="40px" h="40px" borderRadius="10px" bg="rgba(234,179,8,0.2)" display="flex" alignItems="center" justifyContent="center" fontSize="20px">⏳</Box>
                      <Box>
                        <Text fontSize="2xl" fontWeight="bold" color="yellow.400">{stats.pending}</Text>
                        <Text fontSize="xs" color="gray.400">待确认</Text>
                        <Text fontSize="10px" color="gray.600">需你确认</Text>
                      </Box>
                    </Flex>
                  </CardBody>
                </Card>
                <Card bg="gray.800" border="1px solid" borderColor="orange.600">
                  <CardBody py={4} px={4}>
                    <Flex align="center" gap={3}>
                      <Box w="40px" h="40px" borderRadius="10px" bg="rgba(249,115,22,0.2)" display="flex" alignItems="center" justifyContent="center" fontSize="20px">📋</Box>
                      <Box>
                        <Text fontSize="2xl" fontWeight="bold" color="orange.400">{stats.interviews}</Text>
                        <Text fontSize="xs" color="gray.400">待访谈</Text>
                        <Text fontSize="10px" color="gray.600">约会后填写</Text>
                      </Box>
                    </Flex>
                  </CardBody>
                </Card>
                <Card bg="gray.800" border="1px solid" borderColor="green.600">
                  <CardBody py={4} px={4}>
                    <Flex align="center" gap={3}>
                      <Box w="40px" h="40px" borderRadius="10px" bg="rgba(34,197,94,0.2)" display="flex" alignItems="center" justifyContent="center" fontSize="20px">🎉</Box>
                      <Box>
                        <Text fontSize="2xl" fontWeight="bold" color="green.400">{stats.completed}</Text>
                        <Text fontSize="xs" color="gray.400">已完成</Text>
                        <Text fontSize="10px" color="gray.600">累计完成</Text>
                      </Box>
                    </Flex>
                  </CardBody>
                </Card>
                <Card bg="gray.800" border="1px solid" borderColor="cyan.600">
                  <CardBody py={4} px={4}>
                    <Flex align="center" gap={3}>
                      <Box w="40px" h="40px" borderRadius="10px" bg="rgba(6,182,212,0.2)" display="flex" alignItems="center" justifyContent="center" fontSize="20px">📅</Box>
                      <Box>
                        <Text fontSize="2xl" fontWeight="bold" color="cyan.400">{stats.thisMonth}</Text>
                        <Text fontSize="xs" color="gray.400">本月约会</Text>
                        <Text fontSize="10px" color="gray.600">本月活动</Text>
                      </Box>
                    </Flex>
                  </CardBody>
                </Card>
                <Card bg="gray.800" border="1px solid" borderColor="pink.600">
                  <CardBody py={4} px={4}>
                    <Flex align="center" gap={3}>
                      <Box w="40px" h="40px" borderRadius="10px" bg="rgba(244,114,182,0.2)" display="flex" alignItems="center" justifyContent="center" fontSize="20px">💳</Box>
                      <Box>
                        <Text fontSize="2xl" fontWeight="bold" color="pink.400">¥{stats.thisWeekExpense}</Text>
                        <Text fontSize="xs" color="gray.400">本周花费</Text>
                        <Text fontSize="10px" color="gray.600">本周支出</Text>
                      </Box>
                    </Flex>
                  </CardBody>
                </Card>
              </SimpleGrid>
            )}

            {/* 即将到来卡片 */}
            {!loading && upcomingDate && (
              <Box mb={6}>
                <Text fontSize="lg" fontWeight="bold" mb={3} color="white">
                  <Box as="span" display="inline-block" w="4px" h="20px" bg="brand.500" borderRadius="2px" mr={3} verticalAlign="middle"></Box>
                  即将到来
                </Text>
                <Card
                  bg="linear-gradient(135deg, rgba(0,212,170,0.15) 0%, rgba(168,85,247,0.15) 100%)"
                  border="1px solid"
                  borderColor="brand.500"
                  cursor="pointer"
                  onClick={() => openDetail(upcomingDate)}
                  _hover={{ borderColor: 'brand.400', transform: 'translateY(-2px)' }}
                  transition="all 0.2s"
                >
                  <CardBody py={5} px={6}>
                    <Flex align="center" gap={6} wrap="wrap">
                      {/* 日期突出显示 */}
                      <Box textAlign="center" minW="70px">
                        <Text fontSize="36px" fontWeight="bold" color="brand.400" lineHeight="1">
                          {new Date(upcomingDate.dateTime).getDate()}
                        </Text>
                        <Text fontSize="sm" color="gray.400">
                          {formatDateRelative(upcomingDate.dateTime)}
                        </Text>
                      </Box>
                      {/* 约会信息 */}
                      <Box flex={1}>
                        <HStack spacing={2} mb={1}>
                          <Avatar size="sm" name={upcomingDate.girl?.name} src={getAvatar(upcomingDate.girl)} />
                          <Text color="white" fontWeight="bold" fontSize="lg">{upcomingDate.girl?.name}</Text>
                          <Badge colorScheme={upcomingDate.status === 'confirmed' || upcomingDate.status === 'planned' ? 'green' : 'yellow'}>
                            {upcomingDate.status === 'confirmed' ? '已确认' : upcomingDate.status === 'planned' ? '已策划' : '待确认'}
                          </Badge>
                        </HStack>
                        <Text color="gray.300" fontSize="sm">{upcomingDate.title || '约会'}</Text>
                        <HStack spacing={4} mt={2} color="gray.400" fontSize="xs">
                          {upcomingDate.location && (
                            <HStack spacing={1}>
                              <MapPinIcon />
                              <Text>{upcomingDate.location}</Text>
                            </HStack>
                          )}
                          {upcomingDate.dateTime && (
                            <HStack spacing={1}>
                              <ClockIcon />
                              <Text>{new Date(upcomingDate.dateTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</Text>
                            </HStack>
                          )}
                        </HStack>
                      </Box>
                      {/* 操作 */}
                      <HStack spacing={2}>
                        <Button colorScheme="brand" size="sm">查看方案</Button>
                      </HStack>
                    </Flex>
                  </CardBody>
                </Card>
              </Box>
            )}

            {/* 约会列表 */}
            {loading ? (
              <Flex justify="center" py={12}><Spinner /></Flex>
            ) : filteredDates.length === 0 && filteredAiPlans.length === 0 && pendingInterviews.length === 0 ? (
              <Card bg="gray.800">
                <CardBody>
                  <Flex direction="column" align="center" py={12} gap={3}>
                    <Icon as={CalendarIcon} color="gray.500" boxSize={12} />
                    <Text color="gray.400">暂无约会方案</Text>
                    <Text color="gray.500" fontSize="sm">点击右上角"添加约会"开始</Text>
                  </Flex>
                </CardBody>
              </Card>
            ) : (
              <VStack spacing={4} align="stretch">
                {/* 图例 */}
                <HStack spacing={4} p={3} bg="rgba(255,255,255,0.02)" borderRadius="md" flexWrap="wrap">
                  <HStack spacing={2}>
                    <Box w="10px" h="10px" borderRadius="full" bg="brand.500"></Box>
                    <Text fontSize="xs" color="gray.500">AI 策划</Text>
                  </HStack>
                  <HStack spacing={2}>
                    <Box w="10px" h="10px" borderRadius="full" bg="purple.500"></Box>
                    <Text fontSize="xs" color="gray.500">顾问策划</Text>
                  </HStack>
                  <HStack spacing={2}>
                    <Box w="10px" h="10px" borderRadius="full" bg="yellow.500"></Box>
                    <Text fontSize="xs" color="gray.500">待确认</Text>
                  </HStack>
                  <HStack spacing={2}>
                    <Box w="10px" h="10px" borderRadius="full" bg="green.500"></Box>
                    <Text fontSize="xs" color="gray.500">已确认</Text>
                  </HStack>
                </HStack>

                {/* 过滤栏 */}
                <Flex gap={3} wrap="wrap">
                  <Select
                    placeholder={`全部女生 (${girlList.length})`}
                    w="180px"
                    size="sm"
                    bg="gray.800"
                    color="white"
                    borderColor="gray.600"
                    value={filterGirlId}
                    onChange={e => setFilterGirlId(e.target.value)}
                  >
                    {girlList.map(g => (
                      <option key={g.id} value={g.id}>{g.name}{g.stage ? ` · ${g.stage}` : ''}</option>
                    ))}
                  </Select>
                  <Select
                    placeholder="全部状态"
                    w="150px"
                    size="sm"
                    bg="gray.800"
                    color="white"
                    borderColor="gray.600"
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                  >
                    <option value="pending_plan">待策划</option>
                    <option value="planned">已策划</option>
                    <option value="pending_client_confirm">待确认</option>
                    <option value="confirmed">已确认</option>
                    <option value="completed">已完成</option>
                    <option value="cancelled">已取消</option>
                  </Select>
                  {(filterGirlId || filterStatus) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      color="gray.400"
                      onClick={() => { setFilterGirlId(''); setFilterStatus(''); }}
                    >
                      清除过滤
                    </Button>
                  )}
                </Flex>

                {/* AI 方案列表 - 新卡片设计 */}
                {filteredAiPlans.map(plan => (
                  <Card
                    key={plan.id}
                    bg="gray.800"
                    border="1px solid"
                    borderColor="brand.500"
                    cursor="pointer"
                    _hover={{ borderColor: 'brand.400', transform: 'translateY(-2px)' }}
                    onClick={() => setSelectedAiPlan(plan)}
                    transition="all 0.2s"
                  >
                    <CardBody py={4} px={5}>
                      <Flex gap={4} align="flex-start">
                        {/* 头像区域 */}
                        <Avatar size="lg" name={plan.girl?.name} src={getAvatar(plan.girl)} />
                        {/* 内容区域 */}
                        <Box flex={1}>
                          <Flex justify="space-between" align="flex-start" mb={2}>
                            <Box>
                              <HStack spacing={2} mb={1}>
                                <Icon as={SparklesIcon} color="brand.400" />
                                <Heading size="md" color="white">{plan.title || 'AI 约会方案'}</Heading>
                              </HStack>
                              {plan.scene && <Text color="gray.400" fontSize="sm">{plan.scene}</Text>}
                              {plan.budget && <Text color="gray.500" fontSize="xs" mt={1}>预算：{plan.budget} · 时长：{plan.duration}</Text>}
                            </Box>
                            <Badge colorScheme={plan.planStatus === 'generated' ? 'green' : plan.planStatus === 'generating' ? 'blue' : 'gray'}>
                              {plan.planStatus === 'generated' ? '已生成' : plan.planStatus === 'generating' ? '生成中' : '草稿'}
                            </Badge>
                          </Flex>
                          {/* 进度条 */}
                          <Box mt={3}>
                            <Flex justify="space-between" mb={1}>
                              <Text fontSize="xs" color="gray.500">
                                {plan.planStatus === 'generated' ? '方案已生成' : '生成中...'}
                              </Text>
                              <Text fontSize="xs" color="gray.500">{plan.planStatus === 'generated' ? '100%' : '50%'}</Text>
                            </Flex>
                            <Progress
                              value={plan.planStatus === 'generated' ? 100 : 50}
                              size="xs"
                              colorScheme="brand"
                              borderRadius="full"
                              bg="gray.700"
                            />
                          </Box>
                        </Box>
                      </Flex>
                    </CardBody>
                  </Card>
                ))}
                {/* 顾问方案列表 - 新卡片设计 */}
                {filteredDates.map(d => {
                  const plan = parseJSON(d.aiPlan);
                  const progress = getProgress(d);
                  return (
                    <Card
                      key={d.id}
                      bg="gray.800"
                      border="1px solid"
                      borderColor="purple.500"
                      cursor="pointer"
                      _hover={{ borderColor: 'purple.400', transform: 'translateY(-2px)' }}
                      onClick={() => openDetail(d)}
                      transition="all 0.2s"
                    >
                      <CardBody py={4} px={5} position="relative">
                        <Button
                          position="absolute" top={2} right={2} zIndex={2}
                          size="xs" colorScheme="red" variant="ghost"
                          onClick={(e) => { e.stopPropagation(); handleDeleteDate(d.id); }}
                          isLoading={deleting}
                        >
                          删除
                        </Button>
                        <Flex gap={4} align="flex-start">
                          {/* 头像区域 */}
                          <Avatar size="lg" name={d.girl?.name} src={getAvatar(d.girl)} />
                          {/* 内容区域 */}
                          <Box flex={1}>
                            <Flex justify="space-between" align="flex-start" mb={2}>
                              <Box>
                                <HStack spacing={2} mb={1}>
                                  <Heading size="md" color="white">{d.girl?.name}</Heading>
                                  <Badge colorScheme="purple">顾问</Badge>
                                </HStack>
                                <Text color="gray.300" fontSize="sm">{d.title || '约会方案'}</Text>
                              </Box>
                              <Badge
                                colorScheme={
                                  d.status === 'completed' ? 'cyan' :
                                  d.status === 'confirmed' || d.status === 'planned' ? 'green' :
                                  d.status === 'pending_client_confirm' ? 'yellow' : 'gray'
                                }
                              >
                                {d.status === 'completed' ? '已完成' :
                                 d.status === 'confirmed' ? '已确认' :
                                 d.status === 'planned' ? '已策划' :
                                 d.status === 'pending_client_confirm' ? '待确认' : '待策划'}
                              </Badge>
                            </Flex>
                            {/* 元信息 */}
                            <HStack spacing={4} color="gray.400" fontSize="xs" mb={3}>
                              <HStack spacing={1}>
                                <ClockIcon />
                                <Text>{formatDateRelative(d.dateTime)}</Text>
                              </HStack>
                              {d.location && (
                                <HStack spacing={1}>
                                  <MapPinIcon />
                                  <Text>{d.location}</Text>
                                </HStack>
                              )}
                            </HStack>
                            {/* 进度条 */}
                            <Box>
                              <Flex justify="space-between" mb={1}>
                                <Text fontSize="xs" color="gray.500">{progress.label}</Text>
                                <Text fontSize="xs" color="gray.500">{progress.percent}%</Text>
                              </Flex>
                              <Progress
                                value={progress.percent}
                                size="xs"
                                colorScheme={
                                  d.status === 'completed' ? 'cyan' :
                                  d.status === 'confirmed' || d.status === 'planned' ? 'green' :
                                  'yellow'
                                }
                                borderRadius="full"
                                bg="gray.700"
                              />
                            </Box>
                          </Box>
                        </Flex>
                      </CardBody>
                    </Card>
                  );
                })}
              </VStack>
            )}
          </TabPanel>

          {/* 日历视图 */}
          <TabPanel px={0}>
            {clientId ? (
              <ClientCalendar
                clientId={clientId}
                girlList={girlList}
                refreshKey={loading}
              />
            ) : (
              <Flex justify="center" py={12}><Spinner /></Flex>
            )}
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* 方案详情 — trapFocus=false 防止方案更新时 FocusLock 自动聚焦导致滚回顶部 */}
      <Modal isOpen={isOpen} onClose={onClose} size="3xl" trapFocus={false}>
        <ModalOverlay />
        <ModalContent bg="gray.800" maxH="85vh" overflow="auto" ref={modalContentRef}>
          <ModalHeader color="white">
            {selected?.title || '约会方案'}
            <Badge ml={2} colorScheme={selected?.status === 'confirmed' ? 'green' : selected?.status === 'pending_client_confirm' ? 'purple' : selected?.status === 'planned' ? 'teal' : 'orange'}>
              {selected?.status === 'confirmed' ? '已确认' : selected?.status === 'pending_client_confirm' ? '待确认' : selected?.status === 'planned' ? '已策划' : '待策划'}
            </Badge>
            {!selected?.conditions && <Badge ml={2} colorScheme="gray">自建</Badge>}
            <Button ml={3} size="sm" colorScheme="red" variant="outline" onClick={() => handleDeleteDate()} isLoading={deleting}>
              删除约会
            </Button>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            {/* AI 流式生成状态 — 显示思考过程和实时内容 */}
            {reoptimizing && (
              <Box mb={4}>
                {/* 状态条 */}
                <Box p={3} bg="teal.900" border="1px solid" borderColor="teal.600" borderRadius="md" mb={streamReasoning ? 2 : 0}>
                  <HStack spacing={3} justify="center">
                    <Spinner size="sm" color="teal.300" />
                    <Text color="teal.200" fontWeight="bold" fontSize="md">{streamStatus || 'AI 正在重新生成方案...'}</Text>
                    <Progress size="xs" isIndeterminate colorScheme="teal" w="100px" borderRadius="full" />
                  </HStack>
                </Box>

                {/* AI 思考过程 — 可折叠面板，自动跟随滚动 */}
                {streamReasoning && (
                  <Box bg="gray.900" border="1px solid" borderColor="gray.600" borderRadius="md" overflow="hidden">
                    <Button
                      variant="ghost" size="sm" w="100%" borderRadius={0}
                      onClick={() => setShowReasoning(!showReasoning)}
                      color="gray.400" _hover={{ bg: 'gray.800' }}
                      rightIcon={<Text fontSize="xs">{showReasoning ? '▲' : '▼'}</Text>}
                    >
                      <HStack spacing={2}>
                        <Spinner size="xs" color="purple.400" />
                        <Text color="purple.300" fontSize="sm">AI 思考过程</Text>
                      </HStack>
                    </Button>
                    {showReasoning && (
                      <Box p={3} maxH="250px" overflow="auto" bg="gray.850" borderTop="1px solid" borderColor="gray.600">
                        <Text color="gray.400" fontSize="xs" whiteSpace="pre-wrap" lineHeight="1.6">{filterReasoning(streamReasoning)}</Text>
                        <Box ref={reasoningEndRef} />
                      </Box>
                    )}
                  </Box>
                )}

                {/* 方案内容流式输出（过滤 JSON 符号） */}
                {streamContent && (
                  <Box mt={2} p={4} bg="gray.750" borderRadius="md" border="1px solid" borderColor="gray.600" maxH="450px" overflow="auto">
                    <Text color="gray.300" fontSize="sm" whiteSpace="pre-wrap" lineHeight="1.8">
                      {cleanStreamText(streamContent)}
                    </Text>
                    <Box ref={streamContentEndRef} />
                  </Box>
                )}
              </Box>
            )}

            {selected && (
              <Box>
                <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4} mb={4}>
                  <Box bg="gray.750" p={3} borderRadius="md">
                    <Text color="gray.400" fontSize="sm">约会对象</Text>
                    <Text color="teal.300">{selected.girl?.name}</Text>
                  </Box>
                  <Box bg="gray.750" p={3} borderRadius="md">
                    <Text color="gray.400" fontSize="sm">约会时间</Text>
                    <Text color="white" fontSize="sm">
                      {selected.dateTime ? new Date(selected.dateTime).toLocaleString('zh-CN') : '-'}
                    </Text>
                  </Box>
                  <Box bg="gray.750" p={3} borderRadius="md">
                    <Text color="gray.400" fontSize="sm">地点</Text>
                    <Text color="white">{selected.location || '-'}</Text>
                  </Box>
                </SimpleGrid>

                <Divider borderColor="gray.600" mb={4} />

                {reoptimizing ? (
                  streamContent ? null : (
                    <Flex justify="center" py={8}>
                      <VStack spacing={3}>
                        <Spinner size="lg" color="teal.400" />
                        <Text color="gray.400" fontSize="sm">方案生成中，请稍候...</Text>
                      </VStack>
                    </Flex>
                  )
                ) : renderPlan(selected.aiPlan)}

                <Divider borderColor="gray.600" my={4} />

                {/* 确认/调整：自建约会仅显示 AI 重新生成 */}
                {!selected?.conditions ? (
                  <VStack spacing={3} align="stretch">
                    <Alert status="success" mb={4} borderRadius="md">
                      <AlertIcon />
                      <AlertDescription fontSize="sm">这是您自己创建的约会。如需优化方案，可让 AI 重新生成。</AlertDescription>
                    </Alert>
                    <Button colorScheme="teal" leftIcon={<SparklesIcon />} onClick={handleReoptimizeDate} >
                      AI 重新生成
                    </Button>
                  </VStack>
                ) : selected?.status === 'pending_client_confirm' ? (
                  <>
                    <Alert status="info" mb={4} borderRadius="md">
                      <AlertIcon />
                      <AlertDescription fontSize="sm">查看完方案后，可以直接确认，或提出调整建议让顾问优化。</AlertDescription>
                    </Alert>
                    <VStack spacing={3} align="stretch">
                      <Text color="gray.300" fontSize="sm" fontWeight="bold">我想调整方案</Text>
                      <FormControl>
                        <FormLabel color="gray.400" fontSize="sm">调整建议</FormLabel>
                        <Textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)} placeholder="比如：换一个更安静的餐厅 / 预算降低一些 / 增加户外活动..." bg="gray.700" color="white" rows={2} />
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400" fontSize="sm">原因（选填）</FormLabel>
                        <Textarea value={feedbackReason} onChange={e => setFeedbackReason(e.target.value)} placeholder="为什么想调整？" bg="gray.700" color="white" rows={2} />
                      </FormControl>
                      <HStack>
                        <Button colorScheme="purple" variant="outline" flex={1} onClick={handleFeedback} isLoading={submitting} isDisabled={!feedbackText.trim() || submitting}>
                          提交调整建议
                        </Button>
                        <Button colorScheme="teal" variant="outline" flex={1} leftIcon={<SparklesIcon />} onClick={handleReoptimizeDate} >
                          AI 重新生成
                        </Button>
                        <Button colorScheme="green" flex={1} onClick={handleConfirm} isLoading={confirming}>
                          确认此方案 ✓
                        </Button>
                      </HStack>
                    </VStack>
                  </>
                ) : selected?.status === 'confirmed' ? (
                  <VStack spacing={3} align="stretch">
                    <Alert status="success" mb={4} borderRadius="md">
                      <AlertIcon />
                      <AlertDescription fontSize="sm">方案已确认。如需调整，可使用 AI 重新生成或提交调整建议。</AlertDescription>
                    </Alert>
                    <Text color="gray.300" fontSize="sm" fontWeight="bold">方案调整</Text>
                    <FormControl>
                      <FormLabel color="gray.400" fontSize="sm">调整建议（选填）</FormLabel>
                      <Textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)} placeholder="比如：换一个更安静的餐厅 / 预算降低一些 / 增加户外活动..." bg="gray.700" color="white" rows={2} />
                    </FormControl>
                    <HStack>
                      <Button colorScheme="purple" variant="outline" flex={1} onClick={handleFeedback} isLoading={submitting} isDisabled={!feedbackText.trim() || submitting}>
                        提交调整建议
                      </Button>
                      <Button colorScheme="teal" flex={1} leftIcon={<SparklesIcon />} onClick={handleReoptimizeDate} >
                        AI 重新生成
                      </Button>
                    </HStack>
                  </VStack>
                ) : (
                  <VStack spacing={3} align="stretch">
                    <Alert status="info" mb={4} borderRadius="md">
                      <AlertIcon />
                      <AlertDescription fontSize="sm">方案待推送。您可以提交调整建议或让 AI 重新生成。</AlertDescription>
                    </Alert>
                    <Text color="gray.300" fontSize="sm" fontWeight="bold">方案调整</Text>
                    <FormControl>
                      <FormLabel color="gray.400" fontSize="sm">调整建议（选填）</FormLabel>
                      <Textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)} placeholder="比如：换一个更安静的餐厅 / 预算降低一些 / 增加户外活动..." bg="gray.700" color="white" rows={2} />
                    </FormControl>
                    <HStack>
                      <Button colorScheme="purple" variant="outline" flex={1} onClick={handleFeedback} isLoading={submitting} isDisabled={!feedbackText.trim() || submitting}>
                        提交调整建议
                      </Button>
                      <Button colorScheme="teal" flex={1} leftIcon={<SparklesIcon />} onClick={handleReoptimizeDate} >
                        AI 重新生成
                      </Button>
                    </HStack>
                  </VStack>
                )}
              </Box>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* 访谈问卷弹窗 */}
      <Modal isOpen={interviewOpen} onClose={() => setInterviewOpen(false)} size="2xl">
        <ModalOverlay />
        <ModalContent bg="gray.800" maxH="85vh" overflow="auto">
          <ModalHeader color="white">
            {interviewModal?.title || '约会反馈访谈'}
            <Badge ml={2} colorScheme="cyan">个性化问卷</Badge>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            {interviewModal && (
              <Box>
                {interviewModal.interviewOverview && (
                  <Alert status="cyan" mb={4} borderRadius="md">
                    <AlertIcon />
                    <AlertDescription fontSize="sm">{interviewModal.interviewOverview}</AlertDescription>
                  </Alert>
                )}

                <VStack spacing={4} align="stretch">
                  {(interviewModal.questions || []).map((q, i) => {
                    const qId = q.id || `q${i + 1}`;
                    return (
                      <Card key={qId} bg="gray.750">
                        <CardBody>
                          <Flex align="flex-start" gap={3} mb={2}>
                            <Badge colorScheme="cyan" minW="24px" textAlign="center">{i + 1}</Badge>
                            <Box flex={1}>
                              <Text color="white" fontSize="sm" mb={1}>{q.question}</Text>
                              {q.purpose && (
                                <Text color="gray.500" fontSize="xs">（{q.purpose}）</Text>
                              )}
                            </Box>
                          </Flex>

                          {q.options?.length > 0 ? (
                            <Wrap spacing={2}>
                              {q.options.map((opt, oi) => {
                                const selected = String(interviewAnswers[qId] || '').split(',').includes(opt);
                                return (
                                  <WrapItem key={oi}>
                                    <Tag
                                      colorScheme={selected ? 'cyan' : 'gray'}
                                      cursor="pointer"
                                      onClick={() => {
                                        const cur = interviewAnswers[qId] || '';
                                        const list = cur ? cur.split(',').filter(Boolean) : [];
                                        const next = selected ? list.filter(x => x !== opt) : [...list, opt];
                                        setInterviewAnswers({ ...interviewAnswers, [qId]: next.join(',') });
                                      }}
                                    >
                                      {selected ? '✓ ' : ''}{opt}
                                    </Tag>
                                  </WrapItem>
                                );
                              })}
                            </Wrap>
                          ) : (
                            <Textarea
                              value={interviewAnswers[qId] || ''}
                              onChange={e => setInterviewAnswers({ ...interviewAnswers, [qId]: e.target.value })}
                              placeholder="请输入您的回答..."
                              bg="gray.700" color="white" rows={2} size="sm"
                            />
                          )}
                        </CardBody>
                      </Card>
                    );
                  })}
                </VStack>

                <HStack mt={6} justify="flex-end">
                  <Button variant="outline" colorScheme="gray" onClick={() => setInterviewOpen(false)}>稍后填写</Button>
                  <Button colorScheme="cyan" onClick={submitInterview} isLoading={interviewSubmitting}>
                    提交访谈
                  </Button>
                </HStack>
              </Box>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* AI 方案详情 — trapFocus=false 防止方案更新时 FocusLock 自动聚焦关闭按钮导致滚回顶部 */}
      <Modal isOpen={!!selectedAiPlan} onClose={() => { setSelectedAiPlan(null); }} size="3xl" trapFocus={false}>
        <ModalOverlay />
        <ModalContent bg="gray.800" maxH="85vh" overflow="auto">
          <ModalHeader color="white">
            {selectedAiPlan?.title || 'AI 约会方案'}
            <Badge ml={2} colorScheme="brand">AI</Badge>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            {/* 顶部生成状态提示 */}
            {(reoptimizingAi || selectedAiPlan?.planStatus === 'generating') && (
              <Box mb={4} p={4} bg="teal.900" border="1px solid" borderColor="teal.600" borderRadius="md">
                <HStack spacing={3} justify="center">
                  <Spinner size="sm" color="teal.300" />
                  <Text color="teal.200" fontWeight="bold" fontSize="md">
                    {reoptimizingAi ? 'AI 正在重新优化方案...' : 'AI 正在生成方案...'}
                  </Text>
                  <Progress size="xs" isIndeterminate colorScheme="teal" w="100px" borderRadius="full" />
                </HStack>
              </Box>
            )}

            {selectedAiPlan && (
              <Box>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} mb={4}>
                  {selectedAiPlan.scene && (
                    <Box bg="gray.750" p={3} borderRadius="md">
                      <Text color="gray.400" fontSize="sm">约会场景</Text>
                      <Text color="teal.300">{selectedAiPlan.scene}</Text>
                    </Box>
                  )}
                  {selectedAiPlan.budget && (
                    <Box bg="gray.750" p={3} borderRadius="md">
                      <Text color="gray.400" fontSize="sm">预算</Text>
                      <Text color="white">{selectedAiPlan.budget}</Text>
                    </Box>
                  )}
                  {selectedAiPlan.duration && (
                    <Box bg="gray.750" p={3} borderRadius="md">
                      <Text color="gray.400" fontSize="sm">时长</Text>
                      <Text color="white">{selectedAiPlan.duration}</Text>
                    </Box>
                  )}
                  <Box bg="gray.750" p={3} borderRadius="md">
                    <Text color="gray.400" fontSize="sm">状态</Text>
                    <Badge colorScheme={selectedAiPlan.planStatus === 'generated' ? 'green' : selectedAiPlan.planStatus === 'generating' ? 'blue' : 'gray'}>
                      {selectedAiPlan.planStatus === 'generated' ? '已生成' : selectedAiPlan.planStatus === 'generating' ? '生成中' : '草稿'}
                    </Badge>
                  </Box>
                </SimpleGrid>

                {selectedAiPlan.planStatus === 'generating' ? (
                  <Center py={16}>
                    <VStack spacing={4}>
                      <Box position="relative">
                        <Spinner size="xl" color="teal.400" thickness="3px" />
                        <Box position="absolute" top="50%" left="50%" transform="translate(-50%, -50%)" fontSize="2xl">✨</Box>
                      </Box>
                      <Text color="teal.300" fontSize="lg" fontWeight="bold">大师团精心策划中</Text>
                      <Text color="gray.400" fontSize="sm">正在为你生成专属约会方案，请稍候...</Text>
                      <Progress size="sm" isIndeterminate colorScheme="teal" w="200px" borderRadius="full" />
                    </VStack>
                  </Center>
                ) : selectedAiPlan.content ? (
                  <Box
                    className="markdown-content"
                    p={6}
                    bg="rgba(255,255,255,0.03)"
                    border="1px solid rgba(255,255,255,0.08)"
                    borderRadius="2xl"
                    color="gray.200"
                    fontSize="sm"
                    lineHeight="1.9"
                    position="relative"
                    overflow="hidden"
                    sx={{
                      '& h1': { fontSize: '22px', fontWeight: 'bold', color: '#38B2AC', mb: 4, mt: 6, pb: 2, borderBottom: '1px solid rgba(255,255,255,0.1)' },
                      '& h2': { fontSize: '18px', fontWeight: 'bold', color: '#F6AD55', mb: 3, mt: 5 },
                      '& h3': { fontSize: '16px', fontWeight: 'bold', color: '#FC8181', mb: 2, mt: 4 },
                      '& p': { mb: 4, color: '#E2E8F0', lineHeight: '1.8' },
                      '& ul': { pl: 5, mb: 4, '& li': { mb: 2, color: '#CBD5E0' } },
                      '& ol': { pl: 5, mb: 4, counterReset: 'item', '& li': { mb: 2, color: '#CBD5E0' } },
                      '& li': { mb: 1 },
                      '& strong': { fontWeight: 'bold', color: '#F6E05E' },
                      '& em': { fontStyle: 'italic', color: '#A0AEC0' },
                      '& blockquote': { borderLeft: '3px solid #38B2AC', pl: 4, py: 2, my: 3, bg: 'rgba(56,178,172,0.08)', color: '#A0AEC0', fontStyle: 'italic', borderRadius: '0 8px 8px 0' },
                      '& table': { width: '100%', my: 4, borderCollapse: 'collapse' },
                      '& thead': { bg: 'rgba(56,178,172,0.15)' },
                      '& th': { color: '#38B2AC', fontWeight: 'bold', py: 2, px: 4, textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' },
                      '& td': { color: '#E2E8F0', py: 2, px: 4, borderBottom: '1px solid rgba(255,255,255,0.05)' },
                      '& tr': { '&:hover': { bg: 'rgba(255,255,255,0.02)' } },
                      '& code': { bg: 'rgba(237,100,166,0.15)', color: '#F687B3', px: 2, py: 0.5, borderRadius: '4px', fontSize: '13px', fontFamily: 'mono' },
                      '& pre': { bg: 'rgba(26,32,44,0.8)', p: 4, borderRadius: '8px', overflowX: 'auto', my: 4, border: '1px solid rgba(255,255,255,0.05)' },
                      '& hr': { my: 6, borderColor: 'rgba(255,255,255,0.1)' },
                      '& a': { color: '#38B2AC', textDecoration: 'underline', '&:hover': { color: '#4FD1C5' } },
                    }}
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ node, ...props }) => <Text as="h1" fontSize="22px" fontWeight="bold" color="#38B2AC" mb={4} mt={6} pb={2} borderBottom="1px solid rgba(255,255,255,0.1)" {...props} />,
                        h2: ({ node, ...props }) => <Text as="h2" fontSize="18px" fontWeight="bold" color="#F6AD55" mb={3} mt={5} {...props} />,
                        h3: ({ node, ...props }) => <Text as="h3" fontSize="16px" fontWeight="bold" color="#FC8181" mb={2} mt={4} {...props} />,
                        p: ({ node, ...props }) => <Text mb={4} color="#E2E8F0" lineHeight="1.8" {...props} />,
                        ul: ({ node, ...props }) => <Box as="ul" pl={5} mb={4} {...props} />,
                        ol: ({ node, ...props }) => <Box as="ol" pl={5} mb={4} {...props} />,
                        li: ({ node, ...props }) => <Text as="li" mb={2} color="#CBD5E0" {...props} />,
                        strong: ({ node, ...props }) => <Text as="strong" fontWeight="bold" color="#F6E05E" {...props} />,
                        em: ({ node, ...props }) => <Text as="em" fontStyle="italic" color="#A0AEC0" {...props} />,
                        blockquote: ({ node, ...props }) => <Box as="blockquote" borderLeft="3px solid #38B2AC" pl={4} py={2} my={3} bg="rgba(56,178,172,0.08)" color="#A0AEC0" fontStyle="italic" borderRadius="0 8px 8px 0" {...props} />,
                        table: ({ node, ...props }) => <Box as="table" width="100%" my={4} borderCollapse="collapse" {...props} />,
                        thead: ({ node, ...props }) => <Box as="thead" bg="rgba(56,178,172,0.15)" {...props} />,
                        th: ({ node, ...props }) => <Text as="th" color="#38B2AC" fontWeight="bold" py={2} px={4} textAlign="left" borderBottom="1px solid rgba(255,255,255,0.1)" {...props} />,
                        td: ({ node, ...props }) => <Text as="td" color="#E2E8F0" py={2} px={4} borderBottom="1px solid rgba(255,255,255,0.05)" {...props} />,
                        tr: ({ node, ...props }) => <Box as="tr" _hover={{ bg: 'rgba(255,255,255,0.02)' }} {...props} />,
                        code: ({ node, inline, ...props }) => inline
                          ? <Text as="code" bg="rgba(237,100,166,0.15)" color="#F687B3" px={2} py={0.5} borderRadius="4px" fontSize="13px" fontFamily="monospace" {...props} />
                          : <Box as="code" display="block" bg="rgba(26,32,44,0.8)" p={4} borderRadius="8px" overflowX="auto" my={4} border="1px solid rgba(255,255,255,0.05)" fontFamily="monospace" fontSize="13px" color="#E2E8F0" {...props} />,
                        pre: ({ node, ...props }) => <Box as="pre" bg="rgba(26,32,44,0.8)" p={4} borderRadius="8px" overflowX="auto" my={4} border="1px solid rgba(255,255,255,0.05)" fontSize="13px" color="#E2E8F0" whiteSpace="pre-wrap" {...props} />,
                        hr: ({ node, ...props }) => <Divider my={6} borderColor="rgba(255,255,255,0.1)" {...props} />,
                        a: ({ node, ...props }) => <Link color="#38B2AC" textDecoration="underline" {...props} />,
                      }}
                    >
                      {unwrapMarkdown(selectedAiPlan.content)}
                    </ReactMarkdown>
                  </Box>
                ) : (
                  <Text color="gray.400">暂无方案内容</Text>
                )}

                <HStack mt={6} justify="flex-end" spacing={3}>
                  <Button
                    leftIcon={<SparklesIcon />}
                    colorScheme="teal"
                    onClick={handleReoptimizeAiPlan}
                  >
                    AI 再次优化
                  </Button>
                  <Button
                    leftIcon={<CopyIcon />}
                    variant="outline"
                    colorScheme="brand"
                    onClick={() => {
                      if (selectedAiPlan.content) {
                        navigator.clipboard.writeText(unwrapMarkdown(selectedAiPlan.content));
                        toast({ title: '已复制', status: 'success', duration: 2000 });
                      }
                    }}
                  >
                    复制方案
                  </Button>
                </HStack>
              </Box>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

            {/* 添加约会 Modal - 双步统一流程 */}
      <Modal isOpen={showAddModal} onClose={() => { setShowAddModal(false); resetDateForm(); }} size="lg">
        <ModalOverlay />
        <ModalContent bg="gray.800" maxH="85vh" overflow="auto">
          <ModalHeader color="white">
            {addStep === 1 ? '选择约会对象' : '填写约会信息'}
          </ModalHeader>
          <ModalCloseButton onClick={() => { setShowAddModal(false); resetDateForm(); }} />
          <ModalBody pb={6}>
            {/* 步骤指示器 */}
            <Flex justify="center" gap={2} mb={8}>
              {[1, 2].map(step => (
                <Box
                  key={step}
                  w={addStep === step ? '32px' : '8px'}
                  h="8px"
                  borderRadius="full"
                  bg={addStep >= step ? 'brand.500' : 'gray.600'}
                  transition="all 0.3s"
                />
              ))}
            </Flex>

            {/* Step 1: 选择女生 */}
            {addStep === 1 && (
              <VStack spacing={4} align="stretch">
                <Text color="gray.400" textAlign="center" mb={2}>选择约会对象</Text>
                <VStack spacing={3} align="stretch" maxH="300px" overflowY="auto">
                  {girlList.length === 0 ? (
                    <Text color="gray.500" textAlign="center" py={8}>暂无比心仪的女生</Text>
                  ) : girlList.map(girl => {
                    const stageLabels = {
                      '陌生': { color: 'gray', text: '陌生' },
                      '朋友': { color: 'blue', text: '朋友' },
                      '暧昧': { color: 'pink', text: '暧昧' },
                      '亲密': { color: 'green', text: '亲密' },
                      'EXPLORATION': { color: 'gray', text: '探索' },
                      'FLIRTING': { color: 'pink', text: '暧昧' },
                      'ADVANCEMENT': { color: 'orange', text: '升温' },
                      'CONFIRMATION': { color: 'green', text: '确认' },
                      'STABLE': { color: 'teal', text: '稳定' },
                    };
                    const stage = stageLabels[girl.currentStage] || stageLabels[girl.relationshipStage] || { color: 'gray', text: girl.currentStage || '未知' };
                    return (
                    <Card
                      key={girl.id}
                      cursor="pointer"
                      bg={selectedGirlForDate?.id === girl.id ? 'rgba(0,212,170,0.15)' : 'gray.750'}
                      border="2px solid"
                      borderColor={selectedGirlForDate?.id === girl.id ? 'brand.500' : 'gray.600'}
                      onClick={() => {
                        setSelectedGirlForDate(girl);
                        const stageMap = {
                          '陌生': '初次见面', '朋友': '已聊过几次',
                          '暧昧': '暧昧中', '亲密': '确定关系',
                          'EXPLORATION': '初次见面', 'FLIRTING': '暧昧中',
                          'ADVANCEMENT': '暧昧中', 'CONFIRMATION': '确定关系',
                          'STABLE': '确定关系',
                        };
                        setDateForm(prev => ({
                          ...prev,
                          relationshipStage: stageMap[girl.currentStage] || stageMap[girl.relationshipStage] || prev.relationshipStage,
                          specialRequirements: girl.dietRestrictions
                            ? `她有饮食限制：${girl.dietRestrictions}`
                            : girl.dietPreferences
                            ? `她喜欢：${girl.dietPreferences}`
                            : prev.specialRequirements
                        }));
                      }}
                      _hover={{ borderColor: 'brand.400' }}
                      transition="all 0.2s"
                    >
                      <CardBody py={3} px={4}>
                        <HStack spacing={3}>
                          <Avatar size="md" name={girl.name} src={getAvatar(girl)} />
                          <Box flex={1}>
                            <HStack spacing={2}>
                              <Text color="white" fontWeight="bold">{girl.name}</Text>
                              <Badge colorScheme={stage.color} size="sm">{stage.text}</Badge>
                            </HStack>
                            <HStack spacing={2} mt={1} flexWrap="wrap">
                              {girl.age && <Text color="gray.400" fontSize="xs">{girl.age}岁</Text>}
                              {girl.occupation && <Text color="gray.500" fontSize="xs">· {girl.occupation}</Text>}
                              {girl.personalityTags && <Text color="gray.500" fontSize="xs">· {girl.personalityTags}</Text>}
                            </HStack>
                            {(girl.dietPreferences || girl.dietRestrictions) && (
                              <HStack spacing={1} mt={1} flexWrap="wrap">
                                <Text color="gray.500" fontSize="xs">🍽</Text>
                                {girl.dietRestrictions && <Badge size="sm" colorScheme="red" mr={1}>{girl.dietRestrictions}</Badge>}
                                {girl.dietPreferences && <Badge size="sm" colorScheme="green">{girl.dietPreferences}</Badge>}
                              </HStack>
                            )}
                          </Box>
                          {selectedGirlForDate?.id === girl.id && (
                            <Box color="brand.400" fontSize="20px">✓</Box>
                          )}
                        </HStack>
                      </CardBody>
                    </Card>
                  )})}
                </VStack>
                <Button
                  colorScheme="brand"
                  size="lg"
                  mt={4}
                  isDisabled={!selectedGirlForDate}
                  onClick={() => setAddStep(2)}
                >
                  下一步
                </Button>
              </VStack>
            )}

            {/* Step 2: 填写信息（统一表单） */}
            {addStep === 2 && (
              <VStack spacing={4} align="stretch">
                {/* 已选女生信息卡片 */}
                {selectedGirlForDate && (
                  <Card bg="gray.750" border="1px solid" borderColor="brand.500">
                    <CardBody py={3} px={4}>
                      <Flex align="center" gap={3}>
                        <Avatar size="md" name={selectedGirlForDate.name} src={getAvatar(selectedGirlForDate)} />
                        <Box flex={1}>
                          <Text color="white" fontWeight="bold">{selectedGirlForDate.name}</Text>
                          <HStack spacing={2} mt={1} flexWrap="wrap">
                            {selectedGirlForDate.age && <Tag size="sm" colorScheme="purple">{selectedGirlForDate.age}岁</Tag>}
                            {selectedGirlForDate.occupation && <Tag size="sm" colorScheme="teal">{selectedGirlForDate.occupation}</Tag>}
                            {selectedGirlForDate.personalityTags && <Tag size="sm" colorScheme="orange">{selectedGirlForDate.personalityTags}</Tag>}
                            {selectedGirlForDate.interests && <Tag size="sm" colorScheme="pink">{selectedGirlForDate.interests}</Tag>}
                          </HStack>
                        </Box>
                        <Button size="xs" variant="ghost" colorScheme="brand" onClick={() => setAddStep(1)}>修改</Button>
                      </Flex>
                    </CardBody>
                  </Card>
                )}

                {/* --- 公共基础信息 --- */}
                <FormControl>
                  <FormLabel color="gray.400" fontSize="sm">约会标题</FormLabel>
                  <Input
                    placeholder="如：周末约会"
                    value={dateForm.title}
                    onChange={e => setDateForm({ ...dateForm, title: e.target.value })}
                    bg="gray.700" borderColor="gray.600"
                  />
                </FormControl>

                <FormControl>
                  <FormLabel color="gray.400" fontSize="sm">约会时间</FormLabel>
                  <DatePicker
                    selected={dateForm.dateTime ? new Date(dateForm.dateTime) : null}
                    onChange={(date) => setDateForm({ ...dateForm, dateTime: formatLocalDateTime(date) })}
                    showTimeSelect
                    timeIntervals={15}
                    timeCaption="时间"
                    dateFormat="yyyy/MM/dd aaah:mm"
                    locale="zh-CN"
                    placeholderText="选择日期和时间"
                    customInput={
                      <Input
                        bg="gray.700" borderColor="gray.600"
                        _placeholder={{ color: 'gray.500' }}
                      />
                    }
                    calendarClassName="chinese-calendar"
                  />
                </FormControl>

                <FormControl>
                  <FormLabel color="gray.400" fontSize="sm">约会地点</FormLabel>
                  <Input
                    placeholder="如：北京三里屯 / 海底捞火锅"
                    value={dateForm.location}
                    onChange={e => setDateForm({ ...dateForm, location: e.target.value })}
                    bg="gray.700" borderColor="gray.600"
                    _placeholder={{ color: 'gray.500' }}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel color="gray.400" fontSize="sm">备注（选填）</FormLabel>
                  <Textarea
                    placeholder="备注信息"
                    value={dateForm.notes}
                    onChange={e => setDateForm({ ...dateForm, notes: e.target.value })}
                    bg="gray.700" borderColor="gray.600" rows={2}
                  />
                </FormControl>

                {/* --- 操作按钮 --- */}
                <HStack mt={4} spacing={3}>
                  <Button
                    colorScheme="green"
                    flex={1}
                    size="lg"
                    isLoading={saving}
                    onClick={handleSaveDate}
                  >
                    保存约会
                  </Button>
                  <Button
                    variant={showAiFields ? 'solid' : 'outline'}
                    colorScheme={showAiFields ? 'brand' : 'gray'}
                    leftIcon={<SparklesIcon />}
                    flex={1}
                    size="lg"
                    onClick={() => setShowAiFields(!showAiFields)}
                  >
                    {showAiFields ? '收起 AI 策划' : 'AI 智能策划'}
                  </Button>
                </HStack>

                {/* --- AI 智能策划区域（可展开） --- */}
                {showAiFields && (
                  <VStack spacing={4} align="stretch" mt={2}>
                    <Divider />
                    <Text color="brand.400" fontWeight="bold" fontSize="sm">✨ AI 增强信息（可选填，填得越详细方案越精准）</Text>

                    <FormControl>
                      <FormLabel color="gray.400" fontSize="sm">出行方式</FormLabel>
                      <Select
                        value={dateForm.transportMode}
                        onChange={e => handleTransportModeChange(e.target.value)}
                        bg="gray.700" borderColor="gray.600"
                      >
                        <option value="地铁/打车">地铁/打车</option>
                        <option value="开车">开车</option>
                        <option value="步行">步行</option>
                        <option value="骑车">骑车</option>
                      </Select>
                    </FormControl>

                    <FormControl>
                      <FormLabel color="gray.400" fontSize="sm">当前关系阶段</FormLabel>
                      <Select
                        value={dateForm.relationshipStage}
                        onChange={e => setDateForm({ ...dateForm, relationshipStage: e.target.value })}
                        bg="gray.700" borderColor="gray.600"
                      >
                        <option value="初次见面">初次见面</option>
                        <option value="已聊过几次">已聊过几次</option>
                        <option value="暧昧中">暧昧中</option>
                        <option value="确定关系">确定关系</option>
                      </Select>
                    </FormControl>

                    <FormControl>
                      <FormLabel color="gray.400" fontSize="sm">特殊要求（选填）</FormLabel>
                      <Input
                        placeholder="如：她吃素/过敏/不吃辣等"
                        value={dateForm.specialRequirements}
                        onChange={e => setDateForm({ ...dateForm, specialRequirements: e.target.value })}
                        bg="gray.700" borderColor="gray.600"
                        _placeholder={{ color: 'gray.500' }}
                      />
                    </FormControl>

                    <FormControl>
                      <FormLabel color="gray.400" fontSize="sm">约会场景描述</FormLabel>
                      <Textarea
                        placeholder="描述你的约会想法，例如：想和女生去一家有氛围的餐厅吃饭，她喜欢粤菜"
                        value={dateForm.scene}
                        onChange={e => setDateForm({ ...dateForm, scene: e.target.value })}
                        bg="gray.700" borderColor="gray.600"
                        _placeholder={{ color: 'gray.500' }}
                        rows={3}
                      />
                    </FormControl>

                    <HStack>
                      <FormControl>
                        <FormLabel color="gray.400" fontSize="sm">预算</FormLabel>
                        <Input
                          placeholder="如：1000元左右"
                          value={dateForm.budget}
                          onChange={e => setDateForm({ ...dateForm, budget: e.target.value })}
                          bg="gray.700" borderColor="gray.600"
                          _placeholder={{ color: 'gray.500' }}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel color="gray.400" fontSize="sm">时长</FormLabel>
                        <Select
                          value={dateForm.duration}
                          onChange={e => setDateForm({ ...dateForm, duration: e.target.value })}
                          bg="gray.700" borderColor="gray.600"
                        >
                          <option value="2小时内">2小时内</option>
                          <option value="半天">半天</option>
                          <option value="一天">一天</option>
                          <option value="多天">多天</option>
                        </Select>
                      </FormControl>
                    </HStack>

                    <Button
                      colorScheme="brand"
                      leftIcon={<SparklesIcon />}
                      size="lg"
                      mt={2}
                      onClick={() => {
                        setGenerating(true);
                        toast({ title: '大师团正在精心策划中...', status: 'info', duration: 2000 });
                        generateAiPlan();
                      }}
                      isLoading={generating}
                      loadingText="策划中..."
                    >
                      生成精细化方案
                    </Button>
                  </VStack>
                )}

                <Button variant="outline" colorScheme="gray" onClick={() => { setAddStep(1); setShowAiFields(false); }}>
                  上一步
                </Button>
              </VStack>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}
