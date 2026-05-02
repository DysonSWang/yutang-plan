import { useState } from 'react';
import {
  Box, Flex, Text, Button, IconButton,
  Popover, PopoverTrigger, PopoverContent, PopoverBody,
} from '@chakra-ui/react';
import emojiCategories from '../data/emojiData';

export default function EmojiPanel({ onSelect, isDisabled = false, variant = 'admin' }) {
  const [activeIdx, setActiveIdx] = useState(0);

  const isAdmin = variant === 'admin';
  const popoverBg = isAdmin ? 'gray.700' : 'abyss.900';
  const popoverBorder = isAdmin ? 'gray.600' : 'rgba(255,255,255,0.08)';
  const hoverBg = isAdmin ? 'gray.600' : 'rgba(255,255,255,0.06)';
  const activeBg = isAdmin ? 'gray.500' : 'rgba(255,255,255,0.1)';
  const triggerColor = isAdmin ? 'gray.400' : 'abyss.400';
  const categoryBarBorder = isAdmin ? 'gray.600' : 'rgba(255,255,255,0.06)';
  const activeTabScheme = isAdmin ? 'yellow' : 'brand';

  const currentEmojis = emojiCategories[activeIdx]?.emojis || [];

  return (
    <Popover placement="top-start" isLazy>
      <PopoverTrigger>
        <IconButton
          icon={<Text>😊</Text>}
          variant="ghost"
          size="sm"
          color={triggerColor}
          aria-label="表情"
          isDisabled={isDisabled}
        />
      </PopoverTrigger>
      <PopoverContent
        bg={popoverBg}
        borderColor={popoverBorder}
        border={isAdmin ? undefined : '1px solid rgba(255,255,255,0.08)'}
        w="320px"
        boxShadow="0 8px 32px rgba(0,0,0,0.5)"
      >
        <PopoverBody p={0}>
          {/* 表情网格 */}
          <Box maxH="280px" overflowY="auto" p={2}>
            <Flex wrap="wrap" gap="4px">
              {currentEmojis.map((emoji, i) => (
                <Box
                  key={`${emoji}-${i}`}
                  w="34px"
                  h="34px"
                  fontSize="24px"
                  cursor="pointer"
                  borderRadius="md"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  lineHeight="34px"
                  _hover={{ bg: hoverBg }}
                  _active={{ bg: activeBg }}
                  onClick={() => onSelect(emoji)}
                >
                  {emoji}
                </Box>
              ))}
            </Flex>
          </Box>
          {/* 分类标签栏 */}
          <Flex borderTop="1px" borderColor={categoryBarBorder} p={1} gap={1}>
            {emojiCategories.map((cat, idx) => (
              <Button
                key={cat.name}
                size="xs"
                variant={idx === activeIdx ? 'solid' : 'ghost'}
                colorScheme={idx === activeIdx ? activeTabScheme : undefined}
                flex={1}
                onClick={() => setActiveIdx(idx)}
              >
                {cat.name}
              </Button>
            ))}
          </Flex>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}
