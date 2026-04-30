import { Component } from 'react';
import { Box, Heading, Text, Button, VStack } from '@chakra-ui/react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (import.meta.env.PROD) {
      console.error('[ErrorBoundary]', error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" bg="gray.50">
          <VStack spacing={4} textAlign="center" p={8}>
            <Heading size="lg" color="red.500">页面出错了</Heading>
            <Text color="gray.600">
              抱歉，页面发生了意外错误。请尝试刷新或返回首页。
            </Text>
            <Button colorScheme="blue" onClick={this.handleReset}>
              返回首页
            </Button>
          </VStack>
        </Box>
      );
    }

    return this.props.children;
  }
}
