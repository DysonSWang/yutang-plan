import { Box } from '@chakra-ui/react';

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
      <svg
        width={Math.round(size * 0.6)}
        height={Math.round(size * 0.6)}
        viewBox="0 0 52 52"
        fill="none"
      >
        {/* left heart */}
        <g transform="translate(18, 22) rotate(-12) scale(1.0)">
          <path
            d="M 0,-4 C -12,-16 -22,-4 -22,8 C -22,20 -4,30 0,36 C 4,30 22,20 22,8 C 22,-4 12,-16 0,-4 Z"
            fill="url(#applogo-heart)"
          />
        </g>
        {/* right heart */}
        <g transform="translate(36, 25) rotate(8) scale(0.82)">
          <path
            d="M 0,-4 C -12,-16 -22,-4 -22,8 C -22,20 -4,30 0,36 C 4,30 22,20 22,8 C 22,-4 12,-16 0,-4 Z"
            fill="url(#applogo-heart)"
          />
        </g>
        <defs>
          <linearGradient id="applogo-heart" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f5efe5" />
          </linearGradient>
        </defs>
      </svg>
    </Box>
  );
}
