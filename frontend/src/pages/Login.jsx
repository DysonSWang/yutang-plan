import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Button, FormControl, FormLabel, Input, InputGroup, InputRightElement, VStack, Text, Heading, HStack, IconButton, Popover, PopoverTrigger, PopoverContent, PopoverBody, PopoverHeader, Switch, Flex, useToast, Grid, GridItem } from '@chakra-ui/react';
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../utils/api';
import AppLogo from '../components/AppLogo';
import ScreenshotToggle from '../plugins/ScreenshotToggle';

const BUTTONS = [
  ['C', '±', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '-'],
  ['1', '2', '3', '+'],
  ['0', '.', '=', '⌫'],
];

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showLogin, setShowLogin] = useState(
    localStorage.getItem('zhuiai_disguise_calc') !== 'true'
  );
  const [loginError, setLoginError] = useState('');
  const [disguiseCalc, setDisguiseCalc] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // 计算器状态
  const [expr, setExpr] = useState('');
  const [display, setDisplay] = useState('0');
  const [stored, setStored] = useState(null);
  const [op, setOp] = useState(null);
  const [calcError, setCalcError] = useState('');

  const { login } = useAuth();
  const toast = useToast();

  useEffect(() => {
    const stored = localStorage.getItem('zhuiai_disguise_calc') === 'true';
    setDisguiseCalc(stored);
    // 伪装计算器开启时，每次进入 Login 页面都显示计算器（需要重新验证）
    // 伪装计算器关闭时，直接显示登录页
    setShowLogin(!stored);
  }, []);

  const toggleDisguiseCalc = (enabled) => {
    localStorage.setItem('zhuiai_disguise_calc', enabled ? 'true' : 'false');
    setDisguiseCalc(enabled);
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
      } else {
        window.location.href = result.user?.role === 'admin' ? '/admin' : '/client';
      }
    } catch (err) {
      setLoginError(err.message || '用户名或密码错误');
    } finally {
      setLoading(false);
    }
  };

  // 计算器逻辑
  const handleNumber = useCallback((num) => {
    setCalcError('');
    setDisplay(prev => prev === '0' ? num : prev + num);
  }, []);

  const handleOperator = useCallback((operator) => {
    if (operator === 'C') {
      setExpr('');
      setDisplay('0');
      setStored(null);
      setOp(null);
      setCalcError('');
    } else if (operator === '⌫') {
      setDisplay(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
    } else if (operator === '±') {
      setDisplay(prev => prev.startsWith('-') ? prev.slice(1) : '-' + prev);
    } else if (operator === '%') {
      setDisplay(prev => String(parseFloat(prev) / 100));
    } else if (operator === '=') {
      const fullExpr = expr + display;
      if (fullExpr === '5566' || display === '5566') {
        // 5566 → 解锁登录页
        sessionStorage.setItem('zhuiai_unlocked', '1');
        setShowLogin(true);
        toast({ title: '已解锁', status: 'success', duration: 2000 });
        return;
      }
      if (fullExpr === '5577' || display === '5577') {
        // 5577 → 切换截屏
        try {
          ScreenshotToggle.toggle();
          toast({ title: '截屏权限已切换', status: 'info', duration: 2000 });
        } catch (e) {
          toast({ title: '截屏切换失败', status: 'error', duration: 2000 });
        }
        setDisplay('0');
        setExpr('');
        setShowLogin(true);
        return;
      }
      if (stored && op) {
        const a = parseFloat(stored);
        const b = parseFloat(display);
        let result;
        if (op === '+') result = a + b;
        else if (op === '-') result = a - b;
        else if (op === '×') result = a * b;
        else if (op === '÷') result = b !== 0 ? a / b : 'Error';
        setDisplay(String(result));
        setStored(null);
        setOp(null);
        setExpr('');
      }
    } else {
      const fullExpr = expr + display;
      if (fullExpr === '5566') {
        sessionStorage.setItem('zhuiai_unlocked', '1');
        setShowLogin(true);
        return;
      }
      setStored(display);
      setOp(operator);
      setExpr(display + ' ' + operator + ' ');
      setDisplay('0');
    }
  }, [display, stored, op, expr, toast]);

  const isOperator = (btn) => ['÷', '×', '-', '+', '='].includes(btn);
  const isSpecial = (btn) => ['C', '±', '%', '⌫'].includes(btn);

  // 伪装计算器模式：显示计算器
  if (disguiseCalc && !showLogin) {
    return (
      <Box minH="100dvh" bg="#1a1a1a" display="flex" flexDirection="column">
        {/* 标题栏 */}
        <Box px={4} py={3} borderBottom="1px solid rgba(255,255,255,0.06)">
          <Text color="rgba(245,240,232,0.4)" fontSize="sm">计算器</Text>
        </Box>

        {/* 错误提示 */}
        {calcError && (
          <Box px={4} py={2} bg="rgba(255,100,100,0.2)">
            <Text color="red.400" fontSize="sm">{calcError}</Text>
          </Box>
        )}

        {/* 显示区 */}
        <Box px={4} py={6} textAlign="right" flex={1}>
          <Text color="rgba(245,240,232,0.45)" fontSize="xs" mb={1} h="16px" overflow="hidden" textOverflow="ellipsis">{expr}</Text>
          <Text color="white" fontSize="5xl" fontWeight="light" wordBreak="break-all">{display}</Text>
        </Box>

        {/* 按键区 */}
        <VStack spacing={1} p={3}>
          {BUTTONS.map((row, i) => (
            <HStack key={i} spacing={1} w="full">
              {row.map((btn) => (
                <Button
                  key={btn}
                  flex={btn === '0' ? 1 : 'none'}
                  w={btn === '0' ? 'calc(50% - 4px)' : '60px'}
                  h="60px"
                  fontSize={btn === '0' ? 'xl' : '2xl'}
                  bg={isOperator(btn) ? 'rgba(255,200,100,0.85)' : isSpecial(btn) ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)'}
                  color={isOperator(btn) ? 'rgba(30,20,0,0.9)' : 'white'}
                  borderRadius="12px"
                  _hover={{ bg: isOperator(btn) ? 'rgba(255,200,100,1)' : 'rgba(255,255,255,0.1)' }}
                  _active={{ transform: 'scale(0.95)' }}
                  onClick={() => {
                    if (isOperator(btn) || isSpecial(btn)) {
                      handleOperator(btn);
                    } else if (btn === '0') {
                      handleNumber('0');
                    } else if (btn === '.') {
                      setDisplay(p => p.includes('.') ? p : p + '.');
                    } else {
                      handleNumber(btn);
                    }
                  }}
                >
                  {btn}
                </Button>
              ))}
            </HStack>
          ))}
        </VStack>
      </Box>
    );
  }

  // 默认显示：美观登录页
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

      <Box w="100%" maxW="420px" position="relative" zIndex={1}>
        {/* Logo 区域 */}
        <VStack spacing={3} mb={10} className="stagger-1" opacity={0}>
          <AppLogo size={64} />
          <Heading size="lg" fontFamily="heading" fontWeight="600" letterSpacing="0.1em" color="white">zhui ai</Heading>
          <Text fontSize="xs" color="rgba(245,240,232,0.6)" letterSpacing="0.3em">PURSUE LOVE WITH AI</Text>
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
            <Heading size="sm" color="white" fontFamily="heading" fontWeight="600" letterSpacing="0.05em">
              登录
            </Heading>
            <Popover placement="bottom-end">
              <PopoverTrigger>
                <IconButton
                  size="sm"
                  variant="ghost"
                  color="rgba(245,240,232,0.4)"
                  aria-label="设置"
                  _hover={{ color: 'rgba(245,240,232,0.6)', bg: 'rgba(255,255,255,0.06)' }}
                  icon={<Text fontSize="sm">⚙</Text>}
                />
              </PopoverTrigger>
              <PopoverContent bg="warm.900" border="1px solid rgba(255,255,255,0.08)" w="200px" boxShadow="0 8px 32px rgba(0,0,0,0.4)">
                <PopoverHeader borderColor="rgba(255,255,255,0.06)">
                  <Text color="rgba(245,240,232,0.6)" fontSize="sm" fontWeight="bold">设置</Text>
                </PopoverHeader>
                <PopoverBody>
                  <Flex align="center" justify="space-between">
                    <Box>
                      <Text color="white" fontSize="sm">伪装计算器</Text>
                      <Text color="rgba(245,240,232,0.6)" fontSize="xs">开启后需先通过计算器解锁</Text>
                    </Box>
                    <Switch
                      isChecked={disguiseCalc}
                      onChange={e => toggleDisguiseCalc(e.target.checked)}
                      colorScheme="gold"
                    />
                  </Flex>
                </PopoverBody>
              </PopoverContent>
            </Popover>
          </Flex>

          {/* 登录表单 */}
          <form onSubmit={handleLogin} className="stagger-2" style={{ opacity: 0 }}>
            <VStack spacing={4}>
              <FormControl>
                <FormLabel color="rgba(245,240,232,0.6)" fontSize="xs" letterSpacing="0.1em">用户名</FormLabel>
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
                <FormLabel color="rgba(245,240,232,0.6)" fontSize="xs" letterSpacing="0.1em">密码</FormLabel>
                <InputGroup>
                  <Input
                    type={showPassword ? 'text' : 'password'}
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
                  <InputRightElement width="3rem">
                    <IconButton
                      size="xs"
                      variant="ghost"
                      icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                      aria-label={showPassword ? '隐藏密码' : '显示密码'}
                      color="rgba(245,240,232,0.4)"
                      _hover={{ color: 'rgba(245,240,232,0.6)' }}
                      onClick={() => setShowPassword(!showPassword)}
                    />
                  </InputRightElement>
                </InputGroup>
              </FormControl>
              {loginError && (
                <Box w="100%" p={3} bg="rgba(220,80,60,0.08)" border="1px solid rgba(220,80,60,0.25)" borderRadius="12px">
                  <Text color="rgba(240,120,100,0.9)" fontSize="sm">{loginError}</Text>
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
              {disguiseCalc && (
                <Button
                  size="sm"
                  variant="ghost"
                  color="rgba(245,240,232,0.6)"
                  onClick={() => setShowLogin(false)}
                >
                  计算器
                </Button>
              )}
              <Text color="rgba(245,240,232,0.35)" fontSize="xs" textAlign="center">
                如需账号或忘记密码，请联系管理员
              </Text>
            </VStack>
          </form>
        </Box>
      </Box>
    </Box>
  );
}
