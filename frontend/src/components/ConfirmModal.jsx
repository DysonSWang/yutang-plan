import { useState, useCallback } from 'react';
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  ModalCloseButton, Button, Text, Flex
} from '@chakra-ui/react';

export function useConfirmModal() {
  const [state, setState] = useState({
    isOpen: false,
    title: '确认',
    message: '确定要执行此操作吗？',
    confirmText: '确认',
    confirmColor: 'red',
    resolve: null,
  });

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        title: options.title || '确认',
        message: options.message || '确定要执行此操作吗？',
        confirmText: options.confirmText || '确认',
        confirmColor: options.confirmColor || 'red',
        resolve,
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setState(prev => {
      prev.resolve?.(true);
      return { ...prev, isOpen: false };
    });
  }, []);

  const handleCancel = useCallback(() => {
    setState(prev => {
      prev.resolve?.(false);
      return { ...prev, isOpen: false };
    });
  }, []);

  const ConfirmModal = (
    <Modal isOpen={state.isOpen} onClose={handleCancel} size="sm">
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent bg="warm.900" color="white" borderRadius="xl">
        <ModalHeader fontSize="md">{state.title}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text color="rgba(245,240,232,0.6)" fontSize="sm">{state.message}</Text>
        </ModalBody>
        <ModalFooter gap={3}>
          <Button variant="ghost" colorScheme="gray" onClick={handleCancel}>取消</Button>
          <Button colorScheme={state.confirmColor} onClick={handleConfirm}>{state.confirmText}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );

  return { confirm, ConfirmModal };
}
