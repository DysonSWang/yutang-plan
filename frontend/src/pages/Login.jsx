import { useState, useEffect, useRef } from 'react';
import { Box, Button, FormControl, FormLabel, Input, VStack, Text, Heading, HStack, IconButton, Popover, PopoverTrigger, PopoverContent, PopoverBody, PopoverHeader, Switch, Flex, useToast, Link, Image } from '@chakra-ui/react';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../utils/api';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('login'); // 只提供登录
  const [showLogin, setShowLogin] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [disguiseMode, setDisguiseMode] = useState(false);
  const { login } = useAuth();
  const toast = useToast();

  useEffect(() => {
    setDisguiseMode(localStorage.getItem('zhuiai_disguise') === 'true');
  }, []);

  const toggleDisguise = (enabled) => {
    localStorage.setItem('zhuiai_disguise', enabled ? 'true' : 'false');
    setDisguiseMode(enabled);
    if (enabled) {
      setShowLogin(false);
    } else {
      setShowLogin(true);
    }
  };

  const handleLogin = async (e) => {
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

  const handleRegister = async (e) => {
    e.preventDefault();
    setRegisterError('');
    setLoading(true);
    try {
      const res = await auth.register({
        username,
        password,
        nickname: nickname || username,
        inviteCode: inviteCode || undefined
      });
      if (res.success) {
        localStorage.setItem('zhuiai_token', res.token);
        window.location.reload();
      } else {
        setRegisterError(res.error || '注册失败');
      }
    } catch (err) {
      setRegisterError(err.message || '注册失败');
      toast({ title: '注册失败', description: err.message, status: 'error', duration: 3000 });
    } finally {
      setLoading(false);
    }
  };

  const effectiveShowLogin = disguiseMode ? showLogin : true;

  return (
    <Box
      minH="100vh"
      bg="warm.950"
      position="relative"
      overflow="hidden"
      display="flex"
      alignItems="center"
      justifyContent="center"
      px={{ base: 4, sm: 6 }}
      py={{ base: 8, sm: 12 }}
    >
      {/* 背景光晕装饰 */}
      <Box
        position="absolute"
        top="-200px"
        right="-150px"
        width="400px"
        height="400px"
        borderRadius="full"
        bg="radial-gradient(circle, rgba(226,176,68,0.1) 0%, transparent 70%)"
        filter="blur(100px)"
        animation="float1 8s ease-in-out infinite"
        pointerEvents="none"
      />
      <Box
        position="absolute"
        bottom="-100px"
        left="-100px"
        width="300px"
        height="300px"
        borderRadius="full"
        bg="radial-gradient(circle, rgba(193,127,89,0.08) 0%, transparent 70%)"
        filter="blur(80px)"
        animation="float2 10s ease-in-out infinite reverse"
        pointerEvents="none"
      />

      {/* 关键帧动画 */}
      <style>
        {`
          @keyframes float1 {
            0%, 100% { transform: translate(0, 0); }
            50% { transform: translate(20px, -20px); }
          }
          @keyframes float2 {
            0%, 100% { transform: translate(0, 0); }
            50% { transform: translate(-20px, 20px); }
          }
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-in {
            animation: fadeInUp 0.6s ease-out forwards;
          }
          .stagger-1 { animation: fadeInUp 0.6s ease-out 0.1s both; }
          .stagger-2 { animation: fadeInUp 0.6s ease-out 0.2s both; }
          .stagger-3 { animation: fadeInUp 0.6s ease-out 0.3s both; }
        `}
      </style>

      <Box
        w="100%"
        maxW="420px"
        position="relative"
        zIndex={1}
      >
        {/* Logo 区域 */}
        <VStack spacing={3} mb={10} className="stagger-1" opacity={0}>
          <Box
            w="64px"
            h="64px"
            borderRadius="20px"
            bgGradient="linear(135deg, gold.500, gold.400)"
            display="flex"
            alignItems="center"
            justifyContent="center"
            boxShadow="0 8px 32px rgba(226, 176, 68, 0.25)"
          >
            <Text fontSize="2xl">💕</Text>
          </Box>
          <Heading
            size="lg"
            fontFamily="heading"
            fontWeight="600"
            letterSpacing="0.1em"
            color="white"
          >
            zhui ai
          </Heading>
          <Text
            fontSize="xs"
            color="rgba(245,240,232,0.2)"
            letterSpacing="0.3em"
          >
            PURSUE LOVE WITH AI
          </Text>
        </VStack>

        {/* 玻璃卡片 */}
        <Box
          className="animate-in"
          bg="rgba(255,255,255,0.03)"
          backdropFilter="blur(20px)"
          webkitbackdropfilter="blur(20px)"
          border="1px solid rgba(255,255,255,0.08)"
          borderRadius="24px"
          p={{ base: 6, sm: 8 }}
          boxShadow="0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)"
          position="relative"
          opacity={0}
        >
          {/* 右上角装饰 */}
          <Box
            position="absolute"
            top="-1px"
            right="-1px"
            w="60px"
            h="60px"
            borderTop="1px solid"
            borderRight="1px solid"
            borderColor="gold.500"
            borderTopRightRadius="24px"
            opacity={0.4}
            pointerEvents="none"
          />
          {/* 左下角装饰 */}
          <Box
            position="absolute"
            bottom="-1px"
            left="-1px"
            w="60px"
            h="60px"
            borderBottom="1px solid"
            borderLeft="1px solid"
            borderColor="rose.500"
            borderBottomLeftRadius="24px"
            opacity={0.3}
            pointerEvents="none"
          />

          {/* 顶部栏 */}
          <Flex justify="space-between" align="center" mb={6}>
            <Heading
              size="sm"
              color="white"
              fontFamily="heading"
              fontWeight="600"
              letterSpacing="0.05em"
            >
              {effectiveShowLogin ? '登录' : '记事本'}
            </Heading>
            <Popover placement="bottom-end">
              <PopoverTrigger>
                <IconButton
                  size="sm"
                  variant="ghost"
                  color="rgba(245,240,232,0.2)"
                  aria-label="设置"
                  _hover={{ color: 'rgba(245,240,232,0.6)', bg: 'rgba(255,255,255,0.06)' }}
                  icon={<Text fontSize="sm">⚙</Text>}
                />
              </PopoverTrigger>
              <PopoverContent
                bg="warm.900"
                border="1px solid rgba(255,255,255,0.08)"
                w="200px"
                boxShadow="0 8px 32px rgba(0,0,0,0.4)"
              >
                <PopoverHeader borderColor="rgba(255,255,255,0.06)">
                  <Text color="rgba(245,240,232,0.6)" fontSize="sm" fontWeight="bold">设置</Text>
                </PopoverHeader>
                <PopoverBody>
                  <Flex align="center" justify="space-between">
                    <Box>
                      <Text color="white" fontSize="sm">伪装模式</Text>
                      <Text color="rgba(245,240,232,0.2)" fontSize="xs">开启后显示为记事本</Text>
                    </Box>
                    <Switch
                      isChecked={disguiseMode}
                      onChange={e => toggleDisguise(e.target.checked)}
                      colorScheme="gold"
                    />
                  </Flex>
                </PopoverBody>
              </PopoverContent>
            </Popover>
          </Flex>

          {/* 登录表单 */}
          {effectiveShowLogin && (
            <form onSubmit={handleLogin} className="stagger-2" style={{ opacity: 0 }}>
              <VStack spacing={4}>
                <FormControl>
                  <FormLabel color="rgba(245,240,232,0.2)" fontSize="xs" letterSpacing="0.1em">用户名</FormLabel>
                  <Input
                    value={username}
                    onChange={e => { setUsername(e.target.value); setLoginError(''); }}
                    placeholder="请输入用户名"
                    size="md"
                    bg="rgba(255,255,255,0.04)"
                    color="white"
                    border="1px solid rgba(255,255,255,0.08)"
                    borderRadius="12px"
                    _hover={{ bg: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)' }}
                    _focus={{ bg: 'rgba(255,255,255,0.06)', borderColor: 'gold.500', boxShadow: '0 0 0 3px rgba(226,176,68,0.12)' }}
                    _placeholder={{ color: 'rgba(245,240,232,0.15)' }}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel color="rgba(245,240,232,0.2)" fontSize="xs" letterSpacing="0.1em">密码</FormLabel>
                  <Input
                    type="password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setLoginError(''); }}
                    placeholder="请输入密码"
                    size="md"
                    bg="rgba(255,255,255,0.04)"
                    color="white"
                    border="1px solid rgba(255,255,255,0.08)"
                    borderRadius="12px"
                    _hover={{ bg: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)' }}
                    _focus={{ bg: 'rgba(255,255,255,0.06)', borderColor: 'gold.500', boxShadow: '0 0 0 3px rgba(226,176,68,0.12)' }}
                    _placeholder={{ color: 'rgba(245,240,232,0.15)' }}
                  />
                </FormControl>
                {loginError && (
                  <Box
                    w="100%"
                    p={3}
                    bg="rgba(248,113,113,0.1)"
                    border="1px solid rgba(248,113,113,0.3)"
                    borderRadius="12px"
                  >
                    <Text color="red.400" fontSize="sm">{loginError}</Text>
                  </Box>
                )}
                <Button
                  type="submit"
                  w="100%"
                  size="md"
                  bgGradient="linear(135deg, gold.500, gold.400)"
                  color="warm.950"
                  fontWeight="500"
                  borderRadius="12px"
                  isLoading={loading}
                  _hover={{ transform: 'translateY(-2px)', boxShadow: '0 8px 24px rgba(226,176,68,0.3)' }}
                  _active={{ transform: 'translateY(0)' }}
                  transition="all 0.3s ease"
                >
                  登录
                </Button>
                {disguiseMode && (
                  <Button
                    size="sm"
                    variant="ghost"
                    color="rgba(245,240,232,0.2)"
                    onClick={() => setShowLogin(false)}
                  >
                    记事本
                  </Button>
                )}
                <Text color="rgba(245,240,232,0.15)" fontSize="xs" textAlign="center">
                  如需账号请联系管理员创建
                </Text>
              </VStack>
            </form>
          )}

          {/* 伪装模式 - 记事本 */}
          {!effectiveShowLogin && (
            <VStack spacing={4} className="stagger-2" opacity={0}>
              <Text color="rgba(245,240,232,0.2)" fontSize="sm">记事本功能开发中...</Text>
              {disguiseMode && (
                <Button
                  size="sm"
                  variant="ghost"
                  color="rgba(245,240,232,0.2)"
                  onClick={() => setShowLogin(true)}
                  _hover={{ color: 'rgba(245,240,232,0.6)' }}
                >
                  登录
                </Button>
              )}
            </VStack>
          )}
        </Box>
      </Box>
    </Box>
  );
}
