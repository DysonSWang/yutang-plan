import { useState, useEffect } from 'react';
import { Box, Button, FormControl, FormLabel, Input, VStack, Text, Card, CardBody, Heading, HStack, IconButton, Popover, PopoverTrigger, PopoverContent, PopoverBody, PopoverHeader, Switch, Flex, Tooltip, useToast, Alert, AlertIcon, AlertDescription } from '@chakra-ui/react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showLogin, setShowLogin] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [notes, setNotes] = useState([
    { id: 1, text: '欢迎使用记事本' }
  ]);
  const [newNote, setNewNote] = useState('');
  const [disguiseMode, setDisguiseMode] = useState(false);
  const { login } = useAuth();
  const toast = useToast();

  useEffect(() => {
    setDisguiseMode(localStorage.getItem('yutang_disguise') === 'true');
  }, []);

  const toggleDisguise = (enabled) => {
    localStorage.setItem('yutang_disguise', enabled ? 'true' : 'false');
    setDisguiseMode(enabled);
    if (enabled) {
      setShowLogin(false);
    } else {
      setShowLogin(true);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoading(true);
    try {
      const result = await login(username, password);
      if (!result.success) {
        setLoginError(result.error || '用户名或密码错误');
      }
    } catch (err) {
      setLoginError(err.message || '用户名或密码错误');
      toast({ title: '登录失败', description: err.message || '用户名或密码错误', status: 'error', duration: 3000 });
    } finally {
      setLoading(false);
    }
  };

  const addNote = () => {
    if (newNote.trim()) {
      setNotes([...notes, { id: Date.now(), text: newNote }]);
      setNewNote('');
    }
  };

  const deleteNote = (id) => {
    setNotes(notes.filter(n => n.id !== id));
  };

  const effectiveShowLogin = disguiseMode ? showLogin : true;

  return (
    <Box minH="100vh" bg="gray.900" p={{ base: 2, sm: 4 }}>
      <Card maxW="600px" mx="auto" mt={{ base: 4, sm: 8 }} bg="gray.800" shadow="lg">
        <CardBody p={{ base: 4, sm: 6 }}>
          <HStack justify="space-between" mb={4}>
            <Heading size="md" color="white">
              {effectiveShowLogin ? '登录' : '记事本'}
            </Heading>
            <Popover placement="bottom-end">
              <PopoverTrigger>
                <IconButton
                  icon={<Text fontSize="lg">⚙</Text>}
                  size="sm"
                  variant="ghost"
                  color="gray.500"
                  aria-label="设置"
                  _hover={{ color: 'gray.300' }}
                />
              </PopoverTrigger>
              <PopoverContent bg="gray.700" borderColor="gray.600" w="220px">
                <PopoverHeader borderColor="gray.600">
                  <Text color="gray.300" fontSize="sm" fontWeight="bold">设置</Text>
                </PopoverHeader>
                <PopoverBody>
                  <Flex align="center" justify="space-between">
                    <Box>
                      <Text color="white" fontSize="sm">伪装模式</Text>
                      <Text color="gray.500" fontSize="xs">开启后登录页显示为记事本</Text>
                    </Box>
                    <Switch
                      isChecked={disguiseMode}
                      onChange={e => toggleDisguise(e.target.checked)}
                      colorScheme="teal"
                    />
                  </Flex>
                </PopoverBody>
              </PopoverContent>
            </Popover>
          </HStack>

          {effectiveShowLogin ? (
            <form onSubmit={handleSubmit}>
              <VStack spacing={3}>
                <FormControl>
                  <FormLabel color="gray.600" fontSize="sm">用户名</FormLabel>
                  <Input
                    value={username}
                    onChange={e => { setUsername(e.target.value); setLoginError(''); }}
                    placeholder="请输入用户名"
                    bg="gray.700" color="white"
                    size="sm"
                  />
                </FormControl>
                <FormControl>
                  <FormLabel color="gray.600" fontSize="sm">密码</FormLabel>
                  <Input
                    type="password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setLoginError(''); }}
                    placeholder="请输入密码"
                    bg="gray.700" color="white"
                    size="sm"
                  />
                </FormControl>
                {loginError && (
                  <Alert status="error" borderRadius="md" fontSize="sm">
                    <AlertIcon />
                    <AlertDescription>{loginError}</AlertDescription>
                  </Alert>
                )}
                <HStack w="100%">
                  <Button type="submit" colorScheme="teal" size="sm" flex={1} isLoading={loading}>
                    登录
                  </Button>
                  {disguiseMode && (
                    <Button size="sm" variant="ghost" color="gray.400" onClick={() => setShowLogin(false)}>
                      记事本
                    </Button>
                  )}
                </HStack>
              </VStack>
            </form>
          ) : (
            <>
              <HStack mb={4}>
                <Input
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  placeholder="写下新记录..."
                  bg="gray.700" color="white"
                  onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addNote())}
                />
                <Button colorScheme="blue" onClick={addNote}>添加</Button>
              </HStack>

              <VStack spacing={2} align="stretch">
                {notes.map(note => (
                  <HStack key={note.id} p={3} bg="gray.700" color="white" borderRadius="md" justify="space-between">
                    <Text color="white" flex={1}>{note.text}</Text>
                    <IconButton
                      size="sm"
                      variant="ghost"
                      colorScheme="red"
                      onClick={() => deleteNote(note.id)}
                    >
                      <Text>×</Text>
                    </IconButton>
                  </HStack>
                ))}
                {notes.length === 0 && (
                  <Text color="gray.400" textAlign="center" py={4}>暂无记录</Text>
                )}
              </VStack>

              {disguiseMode && (
                <Button
                  size="sm"
                  variant="link"
                  color="gray.500"
                  mt={3}
                  onClick={() => setShowLogin(true)}
                >
                  登录
                </Button>
              )}
            </>
          )}
        </CardBody>
      </Card>
    </Box>
  );
}