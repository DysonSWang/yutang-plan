import { useState, useEffect, useRef } from 'react';
import { Box, Flex, VStack, HStack, Input, Button, Text, Heading } from '@chakra-ui/react';
import { chat } from '../../utils/api';
import { useSocket } from '../../contexts/SocketContext';

export default function AdminChat() {
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
      if (message.senderRole === 'operator') return;
      if (currentSession && message.sessionId === currentSession.id) {
        setMessages(prev => [...prev, message]);
      }
      setSessions(prev => prev.map(s => {
        if (s.id === message.sessionId) {
          return { ...s, lastMessage: message.content, lastMessageAt: new Date() };
        }
        return s;
      }));
    };
    on('message:new', handler);
  }, [currentSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadSessions = async () => {
    try {
      const res = await chat.sessions();
      if (res.success) {
        setSessions(res.sessions);
        if (res.sessions.length > 0 && !currentSession) {
          setCurrentSession(res.sessions[0]);
        }
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
        setSessions(prev => prev.map(s => {
          if (s.id === currentSession.id) {
            return { ...s, lastMessage: input.substring(0, 50), lastMessageAt: new Date() };
          }
          return s;
        }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  return (
    <Box>
      <Heading color="white" mb={6}>聊天中心</Heading>

      <Flex h="calc(100vh - 150px)" gap={4}>
        {/* 客户列表 */}
        <Box w="280px" bg="gray.800" borderRadius="md" p={4}>
          <Text color="gray.400" fontSize="sm" mb={4}>客户会话</Text>
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
                <Text color="white" fontWeight="bold" fontSize="sm">
                  {session.client?.nickname || '客户'}
                </Text>
                <Text color="gray.400" fontSize="xs" noOfLines={1}>
                  {session.lastMessage || '暂无消息'}
                </Text>
                {session.unreadCount > 0 && (
                  <Text color="orange.400" fontSize="xs" mt={1}>
                    {session.unreadCount}条未读
                  </Text>
                )}
              </Box>
            ))}
            {sessions.length === 0 && (
              <Text color="gray.500" fontSize="sm">暂无会话</Text>
            )}
          </VStack>
        </Box>

        {/* 聊天区域 */}
        <Box flex={1} bg="gray.800" borderRadius="md" display="flex" flexDirection="column">
          {currentSession ? (
            <>
              <Box p={4} borderBottom="1px" borderColor="gray.700">
                <Text color="white" fontWeight="bold">
                  {currentSession.client?.nickname || '客户'}
                </Text>
                <Text color="gray.500" fontSize="xs">
                  服务阶段: {currentSession.client?.serviceStage || '-'}
                </Text>
              </Box>

              <Box flex={1} p={4} overflowY="auto">
                <VStack spacing={4} align="stretch">
                  {messages.map(msg => (
                    <Flex key={msg.id} justify={msg.senderRole === 'operator' ? 'flex-end' : 'flex-start'}>
                      <Box
                        maxW="70%"
                        p={3}
                        borderRadius="lg"
                        bg={msg.senderRole === 'operator' ? 'teal.600' : 'gray.700'}
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

              <Box p={4} borderTop="1px" borderColor="gray.700">
                <HStack>
                  <Input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && sendMessage()}
                    placeholder="输入回复..."
                    bg="gray.700"
                    border="none"
                    color="white"
                    _placeholder={{ color: 'gray.400' }}
                  />
                  <Button colorScheme="teal" onClick={sendMessage} isLoading={sending}>发送</Button>
                </HStack>
              </Box>
            </>
          ) : (
            <Flex flex={1} align="center" justify="center">
              <Text color="gray.500">选择客户开始聊天</Text>
            </Flex>
          )}
        </Box>
      </Flex>
    </Box>
  );
}
