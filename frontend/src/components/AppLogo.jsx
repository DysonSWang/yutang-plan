import { Box, Image } from '@chakra-ui/react';

export default function AppLogo({ size = 64, shadow = true }) {
  return (
    <Box
      w={`${size}px`}
      h={`${size}px`}
      borderRadius={`${Math.round(size * 0.25)}px`}
      bgGradient="linear(135deg, #e2b044, #c17f59)"
      display="flex"
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
      overflow="hidden"
      {...(shadow ? { boxShadow: '0 4px 20px rgba(226,176,68,0.2)' } : {})}
    >
      <Image
        src="/logo.svg"
        alt="追爱AI"
        w={`${Math.round(size * 0.65)}px`}
        h={`${Math.round(size * 0.65)}px`}
        objectFit="contain"
        fallback={<Box w={`${Math.round(size * 0.5)}px`} h={`${Math.round(size * 0.5)}px`} />}
      />
    </Box>
  );
}
