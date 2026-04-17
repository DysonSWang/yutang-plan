import { useState, useEffect, useRef } from 'react';
import { Box, VStack, HStack, Input, Button, Text, Flex } from '@chakra-ui/react';
import { chat } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';

export default function ClientChat() {
  const { user } = useAuth();
  const { on } = useSocket();
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef();

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (!currentSession) return;
    loadMessages(currentSession.id);
  }, [currentSession]);

  useEffect(() => {
    // 监听新消息（统一 socket，不重复建连）
    const handler = (message) => {
      if (message.senderRole === 'client') return;
      if (currentSession && message.sessionId === currentSession.id) {
        setMessages(prev => [...prev, message]);
      }
    };
    on('message:new', handler);
  }, [currentSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadSessions = async () => {
    try {
      const res = await chat.sessions();
      if (res.success && res.sessions.length > 0) {
        setCurrentSession(res.sessions[0]);
        setSessions(res.sessions);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadMessages = async (sessionId) => {
    try {
      const res = await chat.messages(sessionId);
      if (res.success) {
        setMessages(res.messages);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !currentSession || sending) return;
    setSending(true);
    try {
      const res = await chat.send(currentSession.id, input);
      if (res.success) {
        setMessages(prev => [...prev, res.message]);
        setInput('');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  return (
    <Flex h="calc(100vh - 100px)" gap={4}>
      {/* 会话列表 */}
      <Box w="250px" bg="gray.800" borderRadius="md" p={4}>
        <Text color="gray.400" fontSize="sm" mb={4}>专属顾问</Text>
        <VStack spacing={2} align="stretch">
          {sessions.map(session => (
            <Box
              key={session.id}
              p={3}
              bg={currentSession?.id === session.id ? 'teal.600' : 'gray.700'}
              borderRadius="md"
              cursor="pointer"
              onClick={() => setCurrentSession(session)}
            >
              <Text color="white" fontSize="sm">{session.client?.nickname || '顾问'}</Text>
              <Text color="gray.400" fontSize="xs" noOfLines={1}>{session.lastMessage || '暂无消息'}</Text>
            </Box>
          ))}
          {sessions.length === 0 && (
            <Text color="gray.500" fontSize="sm">暂无会话</Text>
          )}
        </VStack>
      </Box>

      {/* 聊天区域 */}
      <Box flex={1} bg="gray.800" borderRadius="md" display="flex" flexDirection="column">
        {/* 聊天头部 */}
        <Box p={4} borderBottom="1px" borderColor="gray.700">
          <Text color="white" fontWeight="bold">
            {currentSession?.client?.nickname || '专属顾问'}
          </Text>
          <Text color="gray.500" fontSize="xs">人工专属服务</Text>
        </Box>

        {/* 消息列表 */}
        <Box flex={1} p={4} overflowY="auto">
          <VStack spacing={4} align="stretch">
            {messages.map(msg => (
              <Flex key={msg.id} justify={msg.senderRole === 'client' ? 'flex-end' : 'flex-start'}>
                <Box
                  maxW="70%"
                  p={3}
                  borderRadius="lg"
                  bg={msg.senderRole === 'client' ? 'teal.600' : 'gray.700'}
                  color="white"
                >
                  <Text>{msg.content}</Text>
                  <Text fontSize="xs" color="gray.300" mt={1}>
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </Text>
                </Box>
              </Flex>
            ))}
            <div ref={messagesEndRef} />
          </VStack>
        </Box>

        {/* 输入区域 */}
        <Box p={4} borderTop="1px" borderColor="gray.700">
          <HStack>
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && sendMessage()}
              placeholder="输入消息..."
              bg="gray.700"
              border="none"
              color="white"
              _placeholder={{ color: 'gray.400' }}
            />
            <Button colorScheme="teal" onClick={sendMessage} isLoading={sending}>发送</Button>
          </HStack>
        </Box>
      </Box>
    </Flex>
  );
}
