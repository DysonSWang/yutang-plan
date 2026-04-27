import { useState, useEffect } from 'react';
import { Box, Button, FormControl, FormLabel, Input, VStack, Text, Card, CardBody, Heading, HStack, IconButton, Popover, PopoverTrigger, PopoverContent, PopoverBody, PopoverHeader, Switch, Flex, useToast } from '@chakra-ui/react';
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
    <Box
      minH="100vh"
      bg="abyss.950"
      p={{ base: 2, sm: 4 }}
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      <Card
        maxW="480px"
        w="100%"
        mx="auto"
        bg="rgba(255,255,255,0.03)"
        border="1px solid rgba(255,255,255,0.08)"
        backdropFilter="blur(20px)"
        boxShadow="0 8px 48px rgba(0,0,0,0.5)"
        className="animate-in"
        _before={{
          content: '""',
          position: 'absolute',
          top: '-1px',
          left: '-1px',
          right: '-1px',
          bottom: '-1px',
          borderRadius: 'lg',
          background: 'linear-gradient(135deg, rgba(0,212,170,0.1), transparent 50%, rgba(14,165,233,0.08))',
          pointerEvents: 'none',
        }}
      >
        <CardBody p={{ base: 6, sm: 8 }}>
          <HStack justify="space-between" mb={6}>
            <Heading
              size="md"
              color="white"
              fontFamily="heading"
              fontWeight="700"
              className="stagger-1"
            >
              {effectiveShowLogin ? '登录' : '记事本'}
            </Heading>
            <Popover placement="bottom-end">
              <PopoverTrigger>
                <IconButton
                  icon={<Text fontSize="lg">⚙</Text>}
                  size="sm"
                  variant="ghost"
                  color="abyss.500"
                  aria-label="设置"
                  _hover={{ color: 'abyss.300', bg: 'rgba(255,255,255,0.06)' }}
                />
              </PopoverTrigger>
              <PopoverContent
                bg="abyss.900"
                border="1px solid rgba(255,255,255,0.08)"
                w="220px"
                boxShadow="0 8px 32px rgba(0,0,0,0.4)"
              >
                <PopoverHeader borderColor="rgba(255,255,255,0.06)">
                  <Text color="abyss.200" fontSize="sm" fontWeight="bold">设置</Text>
                </PopoverHeader>
                <PopoverBody>
                  <Flex align="center" justify="space-between">
                    <Box>
                      <Text color="white" fontSize="sm">伪装模式</Text>
                      <Text color="abyss.500" fontSize="xs">开启后登录页显示为记事本</Text>
                    </Box>
                    <Switch
                      isChecked={disguiseMode}
                      onChange={e => toggleDisguise(e.target.checked)}
                      colorScheme="brand"
                    />
                  </Flex>
                </PopoverBody>
              </PopoverContent>
            </Popover>
          </HStack>

          {effectiveShowLogin ? (
            <form onSubmit={handleSubmit} className="stagger-2">
              <VStack spacing={4}>
                <FormControl>
                  <FormLabel color="abyss.400" fontSize="sm">用户名</FormLabel>
                  <Input
                    value={username}
                    onChange={e => { setUsername(e.target.value); setLoginError(''); }}
                    placeholder="请输入用户名"
                    bg="rgba(255,255,255,0.04)"
                    color="white"
                    border="1px solid rgba(255,255,255,0.08)"
                    _hover={{ bg: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.15)' }}
                    _focus={{ bg: 'rgba(255,255,255,0.07)', borderColor: 'brand.500', boxShadow: '0 0 0 1px var(--chakra-colors-brand-500)' }}
                    size="md"
                    _placeholder={{ color: 'abyss.500' }}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel color="abyss.400" fontSize="sm">密码</FormLabel>
                  <Input
                    type="password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setLoginError(''); }}
                    placeholder="请输入密码"
                    bg="rgba(255,255,255,0.04)"
                    color="white"
                    border="1px solid rgba(255,255,255,0.08)"
                    _hover={{ bg: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.15)' }}
                    _focus={{ bg: 'rgba(255,255,255,0.07)', borderColor: 'brand.500', boxShadow: '0 0 0 1px var(--chakra-colors-brand-500)' }}
                    size="md"
                    _placeholder={{ color: 'abyss.500' }}
                  />
                </FormControl>
                {loginError && (
                  <Box
                    w="100%"
                    p={3}
                    bg="rgba(248,113,113,0.1)"
                    border="1px solid rgba(248,113,113,0.3)"
                    borderRadius="md"
                  >
                    <Text color="red.400" fontSize="sm">{loginError}</Text>
                  </Box>
                )}
                <Button
                  type="submit"
                  bg="brand.500"
                  color="abyss.950"
                  fontWeight="bold"
                  size="md"
                  w="100%"
                  isLoading={loading}
                  _hover={{ bg: 'brand.400', boxShadow: '0 0 25px rgba(0, 212, 170, 0.4)' }}
                  _active={{ bg: 'brand.600' }}
                  transition="all 0.2s ease"
                >
                  登录
                </Button>
                {disguiseMode && (
                  <Button
                    size="sm"
                    variant="ghost"
                    color="abyss.500"
                    onClick={() => setShowLogin(false)}
                  >
                    记事本
                  </Button>
                )}
              </VStack>
            </form>
          ) : (
            <VStack spacing={4} className="stagger-2">
              <HStack w="100%">
                <Input
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  placeholder="写下新记录..."
                  bg="rgba(255,255,255,0.04)"
                  color="white"
                  border="1px solid rgba(255,255,255,0.08)"
                  _hover={{ bg: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.15)' }}
                  _focus={{ bg: 'rgba(255,255,255,0.07)', borderColor: 'brand.500' }}
                  onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addNote())}
                  _placeholder={{ color: 'abyss.500' }}
                />
                <Button
                  bg="ocean.500"
                  color="white"
                  fontWeight="bold"
                  onClick={addNote}
                  _hover={{ bg: 'ocean.400' }}
                  transition="all 0.2s ease"
                >
                  添加
                </Button>
              </HStack>

              <VStack spacing={2} align="stretch" w="100%">
                {notes.map(note => (
                  <HStack
                    key={note.id}
                    p={3}
                    bg="rgba(255,255,255,0.04)"
                    border="1px solid rgba(255,255,255,0.06)"
                    borderRadius="md"
                    justify="space-between"
                    className="hover-lift"
                    transition="all 0.2s ease"
                  >
                    <Text color="white" flex={1}>{note.text}</Text>
                    <IconButton
                      size="sm"
                      variant="ghost"
                      color="abyss.500"
                      onClick={() => deleteNote(note.id)}
                      _hover={{ color: 'red.400', bg: 'rgba(248,113,113,0.1)' }}
                    >
                      <Text>×</Text>
                    </IconButton>
                  </HStack>
                ))}
                {notes.length === 0 && (
                  <Text color="abyss.500" textAlign="center" py={4}>暂无记录</Text>
                )}
              </VStack>

              {disguiseMode && (
                <Button
                  size="sm"
                  variant="ghost"
                  color="abyss.500"
                  mt={2}
                  onClick={() => setShowLogin(true)}
                  _hover={{ color: 'abyss.300' }}
                >
                  登录
                </Button>
              )}
            </VStack>
          )}
        </CardBody>
      </Card>
    </Box>
  );
}
