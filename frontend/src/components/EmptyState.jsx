/**
 * 空状态通用组件
 * 统一替代所有 "暂无XX" 纯文字提示
 */
import { Box, VStack, Text, Button, Icon } from '@chakra-ui/react';

const PRESETS = {
  pond: {
    icon: '🌱',
    title: '缘分还未开始',
    desc: 'AI 教练会根据你的情况推荐合适的缘分对象\n完成基础档案后即可获得推荐',
    actionLabel: '完善我的档案',
  },
  notification: {
    icon: '🔔',
    title: '暂无新通知',
    desc: '有重要消息时会在这里提醒你',
  },
  date: {
    icon: '📅',
    title: '暂无约会安排',
    desc: '约会确认和 AI 约会方案都会在这里展示',
  },
  search: {
    icon: '🔍',
    title: '未找到匹配结果',
    desc: '试试其他关键词',
  },
  default: {
    icon: '📭',
    title: '暂无内容',
    desc: '相关内容会在这里展示',
  },
};

export default function EmptyState({
  type = 'default',
  icon,
  title,
  desc,
  actionLabel,
  onAction,
  size = 'md',
}) {
  const preset = PRESETS[type] || PRESETS.default;
  const iconSize = size === 'sm' ? '3xl' : '4xl';
  const padding = size === 'sm' ? 8 : 12;

  return (
    <VStack py={padding} spacing={4}>
      <Text fontSize={iconSize} opacity={0.5}>{icon || preset.icon}</Text>
      <Text fontWeight="600" color="white" fontSize="md" textAlign="center">
        {title || preset.title}
      </Text>
      <Text
        color="rgba(245,240,232,0.25)"
        fontSize="sm"
        textAlign="center"
        whiteSpace="pre-line"
        maxW="300px"
      >
        {desc || preset.desc}
      </Text>
      {actionLabel && onAction && (
        <Button size="sm" colorScheme="gold" onClick={onAction} mt={2}>
          {actionLabel}
        </Button>
      )}
    </VStack>
  );
}
