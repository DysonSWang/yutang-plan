import { Component } from 'react';
import { Box, Heading, Text, Button, VStack, Card, CardBody, Code } from '@chakra-ui/react';

const API_BASE = '';

async function reportError(error, errorInfo) {
  try {
    const entry = {
      errorId: `fe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      message: error?.message || String(error),
      stack: error?.stack || '',
      type: 'reactBoundary',
      url: window.location.href,
      userAgent: navigator.userAgent,
      metadata: { componentStack: errorInfo?.componentStack },
    };
    await fetch(`${API_BASE}/api/logs/frontend-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
      keepalive: true,
    });
  } catch (e) {
    // 上报失败不阻塞
  }
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    reportError(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      const { error, errorInfo } = this.state;
      const msg = error?.message || String(error);
      const stack = error?.stack || errorInfo?.componentStack || '';

      return (
        <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" bg="#1a1a1a" p={4}>
          <VStack spacing={6} maxW="600px" w="100%">
            <Heading size="lg" color="red.400">页面出错了</Heading>
            <Text color="rgba(245,240,232,0.7)" textAlign="center">
              抱歉，页面发生了意外错误。请尝试刷新或返回首页。
            </Text>
            {msg && (
              <Box w="100%" bg="rgba(255,100,100,0.1)" border="1px solid rgba(255,100,100,0.3)" borderRadius="12px" p={4}>
                <Text color="rgba(255,150,150,0.9)" fontSize="sm" fontFamily="mono" wordBreak="break-all">
                  {msg}
                </Text>
              </Box>
            )}
            {stack && (
              <Box w="100%" overflowX="auto">
                <Code whiteSpace="pre" fontSize="xs" color="gray.400" display="block" p={3} bg="rgba(0,0,0,0.3)" borderRadius="8px" maxH="200px" overflowY="auto">
                  {stack.slice(0, 1000)}
                </Code>
              </Box>
            )}
            <Button colorScheme="gold" onClick={this.handleReset} size="lg">
              返回首页
            </Button>
          </VStack>
        </Box>
      );
    }

    return this.props.children;
  }
}
