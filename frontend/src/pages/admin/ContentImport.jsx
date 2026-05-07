import { useState, useEffect } from 'react';
import {
  Box, Heading, HStack, VStack, Button, Text, Badge, Table, Thead, Tbody, Tr, Th, Td,
  useToast, Spinner, Center, Checkbox, Collapse, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalBody, ModalCloseButton, Switch, Divider, IconButton, Tooltip,
  Alert, AlertIcon, AlertTitle, AlertDescription
} from '@chakra-ui/react';
import { FiUpload, FiEye, FiCheck, FiX, FiChevronDown, FiChevronUp, FiClock, FiUsers } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { membership as membershipApi } from '../../utils/api';

const DEFAULT_CONTENT_DIR = '/home/admin/mo-ge-core/正式版';

// Diff 渲染组件
function DiffViewer({ oldContent, newContent }) {
  const oldLines = (oldContent || '').split('\n');
  const newLines = (newContent || '').split('\n');

  // 标准行级 diff（顺序扫描，不依赖 includes 跨行匹配）
  const computeDiff = () => {
    const result = [];
    let oi = 0, ni = 0;

    while (oi < oldLines.length || ni < newLines.length) {
      const oldLine = oldLines[oi];
      const newLine = newLines[ni];

      if (oi < oldLines.length && ni < newLines.length && oldLine === newLine) {
        result.push({ type: 'unchanged', text: newLine, lineNum: ni + 1 });
        oi++; ni++;
      } else if (ni < newLines.length && (oi >= oldLines.length || oldLines.slice(oi).indexOf(newLine) === -1)) {
        result.push({ type: 'added', text: newLine, lineNum: ni + 1 });
        ni++;
      } else if (oi < oldLines.length) {
        result.push({ type: 'removed', text: oldLine, lineNum: oi + 1 });
        oi++;
      } else {
        ni++;
      }
    }
    return result;
  };

  const diffLines = computeDiff();
  const [showMarkdown, setShowMarkdown] = useState(false);

  if (showMarkdown) {
    return (
      <Box>
        <HStack mb={3}>
          <Switch size="sm" isChecked={showMarkdown} onChange={() => setShowMarkdown(false)} />
          <Text fontSize="sm">Markdown 预览</Text>
        </HStack>
        <Box p={4} bg="warm.800" borderRadius="md" maxH="600px" overflowY="auto">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {newContent}
          </ReactMarkdown>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <HStack mb={3} justify="space-between">
        <HStack>
          <Switch size="sm" onChange={() => setShowMarkdown(true)} />
          <Text fontSize="sm">Diff 视图</Text>
        </HStack>
        <HStack gap={2}>
          <Badge colorScheme="green" fontSize="xs">+ 新增</Badge>
          <Badge colorScheme="red" fontSize="xs">- 删除</Badge>
        </HStack>
      </HStack>
      <Box bg="warm.800" borderRadius="md" maxH="600px" overflowY="auto" fontFamily="mono" fontSize="xs" lineHeight="1.6">
        {diffLines.map((line, i) => (
          <HStack
            key={i}
            px={2}
            bg={line.type === 'added' ? 'rgba(72,187,120,0.15)'
              : line.type === 'removed' ? 'rgba(245,101,101,0.15)' : 'transparent'}
            color={line.type === 'added' ? 'green.300'
              : line.type === 'removed' ? 'red.300' : 'rgba(245,240,232,0.6)'}
            _hover={{ bg: 'rgba(255,255,255,0.05)' }}
          >
            <Text w="40px" color="rgba(245,240,232,0.3)" textAlign="right" flexShrink={0}>
              {line.lineNum}
            </Text>
            <Text w="16px" flexShrink={0} fontWeight="bold">
              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
            </Text>
            <Text overflow="hidden" textOverflow="ellipsis" whiteSpace="pre" minW="0">
              {line.text || ' '}
            </Text>
          </HStack>
        ))}
      </Box>
    </Box>
  );
}

// 单章 Diff Modal
function ChapterDiffModal({ isOpen, onClose, batchId, chapterId, title }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && batchId && chapterId) {
      setLoading(true);
      setData(null);
      setError(null);
      membershipApi.adminGetChapterDiff(batchId, chapterId)
        .then(res => { if (res.success) setData(res); else setError(res.error); })
        .catch(() => setError('加载失败'))
        .finally(() => setLoading(false));
    }
  }, [isOpen, batchId, chapterId]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="6xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent bg="warm.900" color="white">
        <ModalHeader>
          <HStack>
            <Text>{title}</Text>
            <Badge colorScheme="gold">{chapterId}</Badge>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          {loading ? (
            <Center py={12}><Spinner color="teal.400" /></Center>
          ) : error ? (
            <Alert status="error" borderRadius="md">
              <AlertIcon />
              <Text>{error}</Text>
            </Alert>
          ) : data ? (
            <DiffViewer oldContent={data.oldContent} newContent={data.draft.content} />
          ) : null}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

// 影响面 Modal
function ImpactModal({ isOpen, onClose, batchId }) {
  const [loading, setLoading] = useState(false);
  const [impact, setImpact] = useState(null);

  useEffect(() => {
    if (isOpen && batchId) {
      setLoading(true);
      membershipApi.adminGetBatchImpact(batchId)
        .then(res => { if (res.success) setImpact(res); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isOpen, batchId]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent bg="warm.900" color="white">
        <ModalHeader>
          <HStack>
            <FiUsers />
            <Text>影响面分析</Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          {loading ? (
            <Center py={8}><Spinner /></Center>
          ) : impact ? (
            <VStack align="stretch" spacing={4}>
              <Alert status="warning" borderRadius="md">
                <AlertIcon />
                <Box>
                  <AlertTitle>个性化内容将过期</AlertTitle>
                  <AlertDescription>
                    {impact.totalAffected} 个用户的 {impact.totalAffectedChapters} 个个性化章节将受影响
                  </AlertDescription>
                </Box>
              </Alert>

              {impact.userImpact.slice(0, 20).map(u => (
                <Box key={u.userId} p={3} bg="warm.800" borderRadius="md">
                  <HStack justify="space-between">
                    <Text fontWeight="medium">{u.nickname}</Text>
                    <Text color="rgba(245,240,232,0.5)" fontSize="xs">
                      {u.affectedChapters.join('、')}
                    </Text>
                  </HStack>
                </Box>
              ))}
              {impact.userImpact.length > 20 && (
                <Text color="rgba(245,240,232,0.4)" fontSize="xs" textAlign="center">
                  仅显示前 20 个用户
                </Text>
              )}
            </VStack>
          ) : null}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

export default function ContentImport() {
  const toast = useToast();
  const [scanning, setScanning] = useState(false);
  const [batch, setBatch] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [expandedChapterId, setExpandedChapterId] = useState(null);
  const [diffModal, setDiffModal] = useState({ open: false, chapterId: '', title: '' });
  const [impactModalOpen, setImpactModalOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [autoRegenerate, setAutoRegenerate] = useState(false);
  const [versions, setVersions] = useState([]);
  const [sourceDir, setSourceDir] = useState(DEFAULT_CONTENT_DIR);
  const [uploadFile, setUploadFile] = useState(null); // 上传的 ZIP/md 文件

  // 加载历史版本
  useEffect(() => {
    membershipApi.adminListContentVersions()
      .then(res => { if (res.success) setVersions(res.versions); })
      .catch(() => {});
  }, []);

  // 扫描文件（支持本地目录或上传文件）
  async function handleScan() {
    // 同时有文件和目录：优先用文件
    if (uploadFile) {
      setScanning(true);
      setBatch(null);
      setDrafts([]);
      try {
        const formData = new FormData();
        formData.append('file', uploadFile);
        const res = await membershipApi.adminScanContent(formData);
        if (res.success) {
          if (!res.batch) {
            toast({ title: '所有文件均无变化', status: 'info', duration: 3000 });
          } else {
            setBatch(res.batch);
            setDrafts(res.drafts);
            toast({ title: `扫描完成，发现 ${res.drafts.length} 个文件有变化`, status: 'success', duration: 3000 });
          }
        }
      } catch (err) {
        toast({ title: '扫描失败', description: err.message, status: 'error', duration: 4000 });
      } finally {
        setScanning(false);
      }
      return;
    }

    if (!sourceDir.trim()) {
      toast({ title: '请填写源文件目录', status: 'warning', duration: 3000 });
      return;
    }
    setScanning(true);
    setBatch(null);
    setDrafts([]);
    setExpandedChapterId(null);
    try {
      const res = await membershipApi.adminScanContent({ sourceDir: sourceDir.trim() });
      if (res.success) {
        if (!res.batch) {
          toast({ title: '所有文件均无变化', status: 'info', duration: 3000 });
        } else {
          setBatch(res.batch);
          setDrafts(res.drafts);
          toast({ title: `扫描完成，发现 ${res.drafts.length} 个文件有变化`, status: 'success', duration: 3000 });
        }
      }
    } catch (err) {
      toast({ title: '扫描失败', description: err.message, status: 'error', duration: 4000 });
    } finally {
      setScanning(false);
    }
  }

  // 全选/取消全选
  function toggleAll() {
    const allConfirmed = drafts.every(d => d.confirmed);
    setDrafts(drafts.map(d => ({ ...d, confirmed: !allConfirmed })));
    if (batch) {
      membershipApi.adminConfirmDrafts(batch.id, drafts.map(d => d.chapterId), !allConfirmed)
        .catch(() => {});
    }
  }

  // 切换单个章节（乐观更新 + 失败回滚）
  function toggleChapter(chapterId) {
    const draft = drafts.find(d => d.chapterId === chapterId);
    const newConfirmed = !draft.confirmed;

    // 乐观更新
    setDrafts(drafts.map(d =>
      d.chapterId === chapterId ? { ...d, confirmed: newConfirmed } : d
    ));

    if (batch) {
      membershipApi.adminConfirmDrafts(batch.id, [chapterId], newConfirmed)
        .catch(() => {
          // 失败回滚
          setDrafts(drafts.map(d =>
            d.chapterId === chapterId ? { ...d, confirmed: draft.confirmed } : d
          ));
        });
    }
  }

  // 发布
  async function handlePublish() {
    const confirmed = drafts.filter(d => d.confirmed);
    if (confirmed.length === 0) {
      toast({ title: '请至少选择一个章节', status: 'warning', duration: 3000 });
      return;
    }

    setPublishing(true);
    try {
      const res = await membershipApi.adminPublishBatch(batch.id, autoRegenerate);
      if (res.success) {
        toast({
          title: `已发布 ${res.chapterCount} 个章节`,
          description: res.affectedUserCount > 0
            ? `${res.affectedUserCount} 个用户的个性化版本已过期`
            : autoRegenerate ? '正在重新生成个性化内容...' : '',
          status: 'success',
          duration: 5000,
        });
        setBatch(null);
        setDrafts([]);
        // 刷新版本列表
        membershipApi.adminListContentVersions()
          .then(res => { if (res.success) setVersions(res.versions); })
          .catch(() => {});
      }
    } catch (err) {
      toast({ title: '发布失败', description: err.message, status: 'error', duration: 4000 });
    } finally {
      setPublishing(false);
    }
  }

  const confirmedCount = drafts.filter(d => d.confirmed).length;
  const newCount = drafts.filter(d => d.isNew).length;
  const updateCount = drafts.filter(d => !d.isNew).length;

  return (
    <Box>
      <Heading size="lg" color="white" mb={6}>内容导入与版本管理</Heading>

      {/* 扫描区 */}
      <Box mb={6} p={5} bg="rgba(255,255,255,0.03)" borderRadius="xl" border="1px solid rgba(255,255,255,0.06)">
        <VStack align="stretch" spacing={4}>
          <HStack>
            <FiUpload />
            <Text color="white" fontWeight="bold">批量扫描</Text>
          </HStack>

          {/* 上传模式 */}
          <Box>
            <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={1}>上传文件（ZIP 压缩包或单个 md）</Text>
            <HStack gap={3}>
              <Box flex={1}>
                <label
                  style={{
                    display: 'block', padding: '8px 12px', borderRadius: '8px',
                    border: uploadFile ? '1px solid rgba(0,212,170,0.5)' : '1px dashed rgba(255,255,255,0.2)',
                    background: uploadFile ? 'rgba(0,212,170,0.1)' : 'rgba(255,255,255,0.03)',
                    color: uploadFile ? 'teal.300' : 'rgba(245,240,232,0.4)',
                    cursor: 'pointer', fontSize: '14px', textAlign: 'center'
                  }}
                >
                  {uploadFile ? uploadFile.name : '点击选择文件或拖拽上传'}
                  <input
                    type="file"
                    accept=".md,.zip"
                    onChange={e => {
                      setUploadFile(e.target.files[0] || null);
                      if (e.target.files[0]) setSourceDir(''); // 清除目录输入
                    }}
                    style={{ display: 'none' }}
                  />
                </label>
              </Box>
              {uploadFile && (
                <Button
                  size="sm"
                  variant="ghost"
                  colorScheme="red"
                  onClick={() => setUploadFile(null)}
                >
                  清除
                </Button>
              )}
            </HStack>
          </Box>

          <Divider borderColor="rgba(255,255,255,0.08)" />

          {/* 目录模式 */}
          <Box>
            <Text color="rgba(245,240,232,0.4)" fontSize="xs" mb={1}>或使用服务器本地目录</Text>
            <HStack gap={3}>
              <Box flex={1}>
                <input
                  value={sourceDir}
                  onChange={e => { setSourceDir(e.target.value); setUploadFile(null); }}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)',
                    color: 'white', fontSize: '14px'
                  }}
                  placeholder="/path/to/mo-ge-core/正式版"
                />
              </Box>
            </HStack>
          </Box>

          <Button
            colorScheme="teal"
            onClick={handleScan}
            isLoading={scanning}
            loadingText="扫描中..."
            isDisabled={!sourceDir.trim() && !uploadFile}
            px={6}
          >
            扫描更新
          </Button>
        </VStack>
      </Box>

      {/* 扫描结果 */}
      {batch && (
        <Box mb={6} p={5} bg="rgba(0,212,170,0.06)" borderRadius="xl" border="1px solid rgba(0,212,170,0.15)">
          <VStack align="stretch" spacing={4}>
            <HStack justify="space-between">
              <HStack>
                <Text color="white" fontWeight="bold">扫描结果</Text>
                <Badge colorScheme="gold">{batch.batchNumber}</Badge>
                <Text color="rgba(245,240,232,0.4)" fontSize="xs">
                  {new Date(batch.createdAt).toLocaleString()}
                </Text>
              </HStack>
              <Button size="sm" variant="ghost" onClick={() => setImpactModalOpen(true)} leftIcon={<FiUsers />}>
                影响面
              </Button>
            </HStack>

            <HStack gap={3}>
              <Badge colorScheme="green">新增 {newCount}</Badge>
              <Badge colorScheme="blue">更新 {updateCount}</Badge>
              <Badge colorScheme="gray">未变 {batch.unchangedChapters}</Badge>
              {batch.affectedPersonalizedCount > 0 && (
                <Badge colorScheme="orange">个性化过期 {batch.affectedPersonalizedCount}</Badge>
              )}
            </HStack>

            {batch.notes && (
              <Text color="rgba(245,240,232,0.5)" fontSize="sm">备注: {batch.notes}</Text>
            )}

            <Divider />

            {/* 草稿列表 */}
            <HStack justify="space-between">
              <Checkbox isChecked={confirmedCount === drafts.length} onChange={toggleAll}>
                <Text color="rgba(245,240,232,0.6)" fontSize="sm">全选 ({confirmedCount}/{drafts.length})</Text>
              </Checkbox>
            </HStack>

            <VStack align="stretch" spacing={2}>
              {drafts.map(d => (
                <Box
                  key={d.chapterId}
                  p={3}
                  borderRadius="md"
                  border="1px"
                  borderColor={d.confirmed ? 'teal.600' : 'warm.700'}
                  bg={d.confirmed ? 'rgba(72,187,120,0.05)' : 'transparent'}
                >
                  <HStack justify="space-between">
                    <HStack gap={3}>
                      <Checkbox isChecked={d.confirmed} onChange={() => toggleChapter(d.chapterId)} />
                      <Badge colorScheme={d.isNew ? 'green' : 'blue'} w="40px" textAlign="center">
                        {d.chapterId}
                      </Badge>
                      <Text color="white" fontWeight="medium">{d.title}</Text>
                      {d.isNew && <Badge colorScheme="green" fontSize="xs">新增</Badge>}
                    </HStack>
                    <HStack gap={2}>
                      <Text color="rgba(245,240,232,0.4)" fontSize="xs">{d.diffSummary}</Text>
                      <Tooltip label="预览差异">
                        <IconButton
                          size="xs"
                          variant="ghost"
                          icon={<FiEye />}
                          onClick={() => setDiffModal({ open: true, chapterId: d.chapterId, title: d.title })}
                        />
                      </Tooltip>
                    </HStack>
                  </HStack>
                </Box>
              ))}
            </VStack>

            {/* 自动重新生成开关 */}
            <HStack justify="space-between" pt={2}>
              <HStack>
                <Switch isChecked={autoRegenerate} onChange={e => setAutoRegenerate(e.target.checked)} />
                <Text color="rgba(245,240,232,0.6)" fontSize="sm">
                  发布后自动为受影响用户重新生成个性化内容
                </Text>
              </HStack>
            </HStack>

            {/* 发布按钮 */}
            <HStack justify="flex-end">
              <Button
                variant="ghost"
                onClick={() => { setBatch(null); setDrafts([]); }}
                isDisabled={publishing}
              >
                取消
              </Button>
              <Button
                colorScheme="teal"
                onClick={handlePublish}
                isLoading={publishing}
                loadingText="发布中..."
                isDisabled={confirmedCount === 0}
              >
                确认并发布选中的 {confirmedCount} 章
              </Button>
            </HStack>
          </VStack>
        </Box>
      )}

      {/* 历史版本 */}
      {versions.length > 0 && (
        <Box mb={6} p={5} bg="rgba(255,255,255,0.03)" borderRadius="xl" border="1px solid rgba(255,255,255,0.06)">
          <HStack mb={4}>
            <FiClock />
            <Text color="white" fontWeight="bold">历史版本</Text>
          </HStack>
          <VStack align="stretch" spacing={2}>
            {versions.slice(0, 10).map(v => {
              const changes = JSON.parse(v.chapterChanges || '[]');
              const newCount = changes.filter(c => c.changeType === 'new').length;
              const updateCount = changes.filter(c => c.changeType === 'update').length;
              return (
                <HStack
                  key={v.id}
                  p={3}
                  bg="warm.800"
                  borderRadius="md"
                  cursor="pointer"
                  _hover={{ bg: 'warm.700' }}
                  justify="space-between"
                >
                  <HStack>
                    <Badge colorScheme="gold">v{v.version}</Badge>
                    <Text color="rgba(245,240,232,0.6)" fontSize="sm">
                      {new Date(v.publishedAt).toLocaleString()}
                    </Text>
                  </HStack>
                  <HStack gap={2}>
                    {newCount > 0 && <Badge colorScheme="green" fontSize="xs">+{newCount}</Badge>}
                    {updateCount > 0 && <Badge colorScheme="blue" fontSize="xs">~{updateCount}</Badge>}
                  </HStack>
                </HStack>
              );
            })}
          </VStack>
        </Box>
      )}

      {/* Diff Modal */}
      <ChapterDiffModal
        isOpen={diffModal.open}
        onClose={() => setDiffModal({ open: false, chapterId: '', title: '' })}
        batchId={batch?.id}
        chapterId={diffModal.chapterId}
        title={diffModal.title}
      />

      {/* 影响面 Modal */}
      <ImpactModal
        isOpen={impactModalOpen}
        onClose={() => setImpactModalOpen(false)}
        batchId={batch?.id}
      />
    </Box>
  );
}
