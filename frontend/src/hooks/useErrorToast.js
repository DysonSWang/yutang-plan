import { useCallback } from 'react';
import { useToast } from '@chakra-ui/react';
import { normalizeError, getErrorMessage } from '../utils/errorHandler';

export function useErrorToast() {
  const toast = useToast();

  const showError = useCallback((error, options = {}) => {
    const normalized = normalizeError(error);
    const message = options.message || getErrorMessage(normalized);
    const title = options.title || '出错了';

    toast({
      title,
      description: message,
      status: 'error',
      duration: options.duration || 4000,
      isClosable: true,
      position: options.position || 'top',
    });
  }, [toast]);

  const showSuccess = useCallback((message, options = {}) => {
    toast({
      title: options.title || '成功',
      description: message,
      status: 'success',
      duration: options.duration || 3000,
      isClosable: true,
      position: options.position || 'top',
    });
  }, [toast]);

  const showWarning = useCallback((message, options = {}) => {
    toast({
      title: options.title || '警告',
      description: message,
      status: 'warning',
      duration: options.duration || 4000,
      isClosable: true,
      position: options.position || 'top',
    });
  }, [toast]);

  return { showError, showSuccess, showWarning };
}
