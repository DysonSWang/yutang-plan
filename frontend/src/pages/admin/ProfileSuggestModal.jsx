/**
 * 完善客户信息弹窗 - 操盘手专用
 * 分析操盘手与客户的聊天记录，提取档案字段，建议更新
 */
import { useState, useEffect } from 'react';
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter,
  Box, VStack, HStack, Text, Button, Spinner, Checkbox, Badge, Divider, Alert, AlertIcon
} from '@chakra-ui/react';
import { chat } from '../../utils/api';

export default function ProfileSuggestModal({ clientId, clientName, isOpen, onClose }) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [chatSummary, setChatSummary] = useState('');
  const [messageCount, setMessageCount] = useState(0);
  const [selected, setSelected] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && clientId) {
      setLoading(true);
      setError('');
      setSuggestions([]);
      setSelected(new Set());
      setSubmitted(false);
      chat.profile.suggest(clientId)
        .then(data => {
          if (data.success) {
            setSuggestions(data.suggestions || []);
            setChatSummary(data.chatSummary || '');
            setMessageCount(data.messageCount || 0);
            setSelected(new Set((data.suggestions || []).map(s => s.field)));
          } else {
            setError(data.error || '分析失败');
          }
        })
        .catch(e => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [isOpen, clientId]);

  const toggleField = (field) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    setError('');
    const updates = {};
    for (const s of suggestions) {
      if (selected.has(s.field)) {
        let value = s.suggestedValue;
        if (['age', 'height', 'emotionalStable', 'commitmentWillingness', 'antiFrustrationLevel', 'stageProgress'].includes(s.field)) {
          value = parseInt(s.suggestedValue);
        }
        updates[s.field] = value;
      }
    }
    try {
      const data = await chat.profile.update(clientId, updates);
      if (data.success) {
        setSubmitted(true);
      } else {
        setError(data.error || '更新失败');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const confidenceColor = (c) => {
    if (c === 'high') return 'green';
    if (c === 'medium') return 'orange';
    return 'gray';
  };

  const confidenceLabel = (c) => {
    if (c === 'high') return '高置信';
    if (c === 'medium') return '中置信';
    return '低置信';
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered>
      <ModalOverlay bg="blackAlpha.700" />
      <ModalContent bg="warm.800" color="white" maxH="80vh" overflow="hidden">
        <ModalHeader borderBottom="1px" borderColor="rgba(255,255,255,0.06)">
          <HStack>
            <Text>📋</Text>
            <Text>完善 {clientName || '客户'} 的信息</Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody p={0} overflowY="auto">
          {loading ? (
            <VStack py={12} spacing={4}>
              <Spinner size="xl" color="gold.400" />
              <Text color="rgba(245,240,232,0.4)">正在分析聊天记录...</Text>
              <Text color="rgba(245,240,232,0.2)" fontSize="sm">提取客户信息字段中</Text>
            </VStack>
          ) : submitted ? (
            <VStack py={12} spacing={4}>
              <Text fontSize="4xl">✅</Text>
              <Text fontSize="lg" fontWeight="bold">信息已更新！</Text>
              <Text color="rgba(245,240,232,0.4)" fontSize="sm">已更新 {selected.size} 个字段</Text>
            </VStack>
          ) : error ? (
            <VStack py={8} spacing={4}>
              <Alert status="error" borderRadius="md">
                <AlertIcon />
                {error}
              </Alert>
              <Button size="sm" variant="outline" onClick={() => {
                setLoading(true);
                setError('');
                chat.profile.suggest(clientId)
                  .then(data => {
                    if (data.success) {
                      setSuggestions(data.suggestions || []);
                      setChatSummary(data.chatSummary || '');
                      setMessageCount(data.messageCount || 0);
                      setSelected(new Set((data.suggestions || []).map(s => s.field)));
                    } else {
                      setError(data.error || '分析失败');
                    }
                  })
                  .catch(e => setError(e.message))
                  .finally(() => setLoading(false));
              }}>重试</Button>
            </VStack>
          ) : suggestions.length === 0 ? (
            <VStack py={12} spacing={4}>
              <Text fontSize="4xl">🔍</Text>
              <Text fontWeight="bold">未发现需要完善的字段</Text>
              <Text color="rgba(245,240,232,0.4)" fontSize="sm" textAlign="center" px={4}>
                {messageCount > 0
                  ? `共分析了 ${messageCount} 条聊天记录，暂无新发现`
                  : '暂无足够聊天记录进行分析'}
              </Text>
            </VStack>
          ) : (
            <VStack spacing={0} align="stretch">
              {/* 聊天摘要 */}
              {chatSummary && (
                <Box px={4} py={3} bg="warm.900" borderBottom="1px" borderColor="rgba(255,255,255,0.06)">
                  <Text fontSize="xs" color="rgba(245,240,232,0.2)" mb={1}>📝 聊天摘要</Text>
                  <Text fontSize="sm" color="rgba(245,240,232,0.6)">{chatSummary}</Text>
                </Box>
              )}

              {/* 字段建议列表 */}
              <Box px={4} py={3}>
                <HStack justify="space-between" mb={3}>
                  <Text fontWeight="bold" fontSize="sm">💡 建议更新</Text>
                  <Badge colorScheme="gold">{selected.size}/{suggestions.length} 已选</Badge>
                </HStack>
                <VStack spacing={2} align="stretch">
                  {suggestions.map(s => (
                    <Box
                      key={s.field}
                      p={3}
                      bg={selected.has(s.field) ? 'gold.900' : 'warm.700'}
                      borderRadius="md"
                      border="1px solid"
                      borderColor={selected.has(s.field) ? 'gold.500' : 'rgba(255,255,255,0.08)'}
                      cursor="pointer"
                      onClick={() => toggleField(s.field)}
                      _hover={{ borderColor: 'gold.400' }}
                      transition="all 0.15s"
                    >
                      <HStack justify="space-between" mb={1}>
                        <HStack>
                          <Text fontSize="lg">{selected.has(s.field) ? '☑️' : '⬜'}</Text>
                          <Text fontWeight="bold" fontSize="sm">{s.fieldLabel}</Text>
                        </HStack>
                        <Badge colorScheme={confidenceColor(s.confidence)} size="sm">
                          {s.confidence === 'high' ? '●●' : s.confidence === 'medium' ? '●○' : '○○'} {confidenceLabel(s.confidence)}
                        </Badge>
                      </HStack>
                      <HStack fontSize="xs" color="rgba(245,240,232,0.3)" spacing={2} flexWrap="wrap">
                        <Text>当前: <Text as="span" color="rgba(245,240,232,0.5)"><strong>{s.currentValue}</strong></Text></Text>
                        <Text color="gold.400">→</Text>
                        <Text>更新为: <Text as="span" color="gold.300"><strong>{s.suggestedValue}</strong></Text></Text>
                      </HStack>
                      <Text fontSize="xs" color="rgba(245,240,232,0.2)" mt={1}>依据: {s.evidence}</Text>
                    </Box>
                  ))}
                </VStack>
              </Box>
            </VStack>
          )}
        </ModalBody>

        <ModalFooter borderTop="1px" borderColor="rgba(255,255,255,0.06)">
          <HStack spacing={3}>
            <Button variant="ghost" color="rgba(245,240,232,0.4)" onClick={onClose}>
              {submitted ? '关闭' : '取消'}
            </Button>
            {!loading && !submitted && suggestions.length > 0 && (
              <Button
                colorScheme="gold"
                onClick={handleConfirm}
                isLoading={submitting}
                loadingText="更新中..."
                isDisabled={selected.size === 0}
              >
                确认更新 ({selected.size})
              </Button>
            )}
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
