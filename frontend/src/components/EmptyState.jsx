/**
 * 空状态通用组件
 * 统一替代所有 "暂无XX" 纯文字提示
 */
import { Box, VStack, Text, Button, Icon } from '@chakra-ui/react';
import { StarsIcon, BellIcon, CalendarIcon, SearchIcon, InboxIcon } from './Icons';

const ICON_MAP = {
  pond: StarsIcon,
  notification: BellIcon,
  date: CalendarIcon,
  search: SearchIcon,
  default: InboxIcon,
};

export default function EmptyState({
  type = 'default',
  title,
  desc,
  actionLabel,
  onAction,
  size = 'md',
}) {
  const iconComponent = ICON_MAP[type] || ICON_MAP.default;
  const iconSize = size === 'sm' ? '4xl' : '5xl';
  const padding = size === 'sm' ? 8 : 12;

  return (
    <VStack py={padding} spacing={4}>
      <Box
        opacity={0.4}
        animation="breathe 3s ease-in-out infinite"
        sx={{
          '@keyframes breathe': {
            '0%, 100%': { transform: 'scale(1)', opacity: 0.4 },
            '50%': { transform: 'scale(1.08)', opacity: 0.55 },
          },
        }}
      >
        <Icon as={iconComponent} boxSize={iconSize} color="gold.400" />
      </Box>
      <Text fontWeight="600" color="white" fontSize="md" textAlign="center">
        {title || PRESET_TITLES[type] || '暂无内容'}
      </Text>
      <Text
        color="rgba(245,240,232,0.55)"
        fontSize="sm"
        textAlign="center"
        whiteSpace="pre-line"
        maxW="300px"
      >
        {desc || PRESET_DESCS[type] || '相关内容会在这里展示'}
      </Text>
      {actionLabel && onAction && (
        <Button size="sm" colorScheme="gold" onClick={onAction} mt={2}>
          {actionLabel}
        </Button>
      )}
    </VStack>
  );
}

const PRESET_TITLES = {
  pond: '缘分还未开始',
  notification: '暂无新通知',
  date: '暂无约会安排',
  search: '未找到匹配结果',
  default: '暂无内容',
};

const PRESET_DESCS = {
  pond: '添加缘分对象，获得个性化追爱服务',
  notification: '有重要消息时会在这里提醒你',
  date: '约会确认和 AI 约会方案都会在这里展示',
  search: '试试其他关键词',
  default: '相关内容会在这里展示',
};
