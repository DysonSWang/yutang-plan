import { useState, useRef, useEffect } from 'react';
import { Box, VStack, HStack, Input, Button, Text, Card, CardBody, CardHeader, Heading, Select, Textarea, Spinner, Flex, Badge, Icon } from '@chakra-ui/react';
import { girls as girlsApi } from '../../utils/api';
import { FireIcon, SnowIcon } from '../../components/Icons';

const COACHES = [
  { id: 'general', name: '通用教练' },
  { id: 'naye', name: '纳爷' },
  { id: 'tuobuhua', name: '脱不花' },
  { id: 'tong', name: '童锦程' },
];

const STAGE_COLORS = {
  '陌生': 'gray',
  '搭讪': 'blue',
  '聊天': 'cyan',
  '暧昧': 'orange',
  '约会': 'green',
  '长期': 'teal'
};

export default function AICoach() {
  const [girls, setGirls] = useState([]);
  const [selectedGirlId, setSelectedGirlId] = useState('');
  const [selectedGirl, setSelectedGirl] = useState(null);
  const [question, setQuestion] = useState('');
  const [coachId, setCoachId] = useState('general');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [coachName, setCoachName] = useState('');
  const analysisRef = useRef(null);
  const analysisText = useRef('');

  useEffect(() => {
    loadGirls();
  }, []);

  useEffect(() => {
    if (selectedGirlId) {
      const girl = girls.find(g => g.id === selectedGirlId);
      setSelectedGirl(girl || null);
    } else {
      setSelectedGirl(null);
    }
  }, [selectedGirlId, girls]);

  const loadGirls = async () => {
    try {
      const res = await girlsApi.list();
      if (res.success) {
        setGirls(res.girls);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setResponse(null);

    const token = localStorage.getItem('yutang_token');
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3005';
    const currentCoachName = COACHES.find(c => c.id === coachId)?.name || 'AI教练';
    setCoachName(currentCoachName);

    // 初始化显示区域
    analysisText.current = '';
    if (analysisRef.current) {
      analysisRef.current.innerHTML = '';
    }

    try {
      const res = await fetch(`${apiUrl}/api/ai-coach/situation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ situation: question, coachId, stream: true, girlId: selectedGirlId || undefined })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '请求失败' }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;

          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.substring(6);
            if (!jsonStr.startsWith('{')) continue;
            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.content) {
                analysisText.current += parsed.content;
                // 直接更新 DOM 实现真流式
                if (analysisRef.current) {
                  analysisRef.current.innerHTML = analysisText.current.replace(/\n/g, '<br>');
                }
              }
            } catch (e) {}
          }
        }
      }

      // 流式结束后更新React状态
      setResponse({ coach: currentCoachName, analysis: analysisText.current });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Heading color="white" mb={6}>AI教练</Heading>
      <Text color="gray.400" mb={6}>24小时在线，AI撩妹军师</Text>

      <Card bg="gray.800" mb={6}>
        <CardHeader>
          <Heading size="sm" color="white">咨询问题</Heading>
        </CardHeader>
        <CardBody>
          <VStack spacing={4} align="stretch">
            <HStack spacing={4}>
              <Select
                value={coachId}
                onChange={e => setCoachId(e.target.value)}
                bg="gray.700"
                border="none"
                color="white"
                flex={1}
              >
                {COACHES.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
              <Select
                value={selectedGirlId}
                onChange={e => setSelectedGirlId(e.target.value)}
                bg="gray.700"
                border="none"
                color="white"
                flex={1}
                placeholder="选择女生（可选）"
              >
                {girls.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.name} - {g.stage || '未知'}
                  </option>
                ))}
              </Select>
            </HStack>

            {/* 选中女生信息展示 */}
            {selectedGirl && (
              <Card bg="gray.700" variant="outline">
                <CardBody py={3}>
                  <Flex justify="space-between" align="center" wrap="wrap" gap={2}>
                    <HStack>
                      <Text color="white" fontWeight="bold">{selectedGirl.name}</Text>
                      <Badge colorScheme={STAGE_COLORS[selectedGirl.stage] || 'gray'}>
                        {selectedGirl.stage || '未知'}
                      </Badge>
                    </HStack>
                    <HStack>
                      <Text color="gray.400" fontSize="sm">
                        热度: {selectedGirl.tensionScore?.toFixed(1) || '5.0'}/10
                      </Text>
                      <Icon as={selectedGirl.tensionScore >= 5 ? FireIcon : SnowIcon} color={selectedGirl.tensionScore >= 5 ? 'orange.400' : 'blue.400'} />
                    </HStack>
                  </Flex>
                </CardBody>
              </Card>
            )}

            <Textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="描述你的情况，比如：我喜欢一个女生，不知道怎么开口..."
              bg="gray.700"
              border="none"
              color="white"
              rows={4}
              _placeholder={{ color: 'gray.400' }}
            />
            <Button colorScheme="teal" onClick={handleSubmit} isLoading={loading}>
              咨询
            </Button>
          </VStack>
        </CardBody>
      </Card>

      {loading && (
        <Box textAlign="center" py={10}>
          <Spinner size="xl" color="teal.400" />
          <Text color="gray.400" mt={4}>AI教练思考中...</Text>
        </Box>
      )}

      {(loading || response) && (
        <Card bg="gray.800">
          <CardHeader>
            <Heading size="sm" color="teal.400">
              {response?.coach || coachName || 'AI教练'}的建议
            </Heading>
          </CardHeader>
          <CardBody>
            <Box
              ref={analysisRef}
              color="gray.300"
              whiteSpace="pre-wrap"
              sx={{ '& h1,h2,h3': { color: 'white', mt: 4, mb: 2 }, '& p': { mb: 2 } }}
            />
          </CardBody>
        </Card>
      )}
    </Box>
  );
}
