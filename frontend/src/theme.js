import { extendTheme } from '@chakra-ui/react';

const breakpoints = {
  base: '0px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

const theme = extendTheme({
  config: {
    initialColorMode: 'dark',
    useSystemColorMode: false,
  },
  fonts: {
    heading: "'DM Serif Display', 'Noto Serif SC', 'STSong', serif",
    body: "'Inter', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    mono: "'JetBrains Mono', 'Consolas', monospace",
  },
  breakpoints,
  radii: {
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    '2xl': '20px',
    full: '9999px',
  },
  space: {
    xxs: '4px',
    xs: '8px',
    sm: '12px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
    section: '96px',
  },
  colors: {
    gold: {
      50: '#fef8e5',
      100: '#fdf0c2',
      200: '#fbe286',
      300: '#f6cf50',
      400: '#f0c030',
      500: '#e2b044',  // primary — 亮泽琥珀金
      600: '#c99a30',
      700: '#a87e25',
      800: '#86631d',
      900: '#634816',
    },
    rose: {
      50: '#fdf5f1',
      100: '#f9e5db',
      200: '#f0c9b3',
      300: '#e5a885',
      400: '#d48b5e',
      500: '#c17f59',  // accent
      600: '#a86845',
      700: '#8a5538',
      800: '#6b422b',
      900: '#4d2f1e',
    },
    warm: {
      50: '#f5f0e8',
      100: '#e8dfcf',
      200: '#d1c4a8',
      300: '#baa981',
      400: '#a38e5a',
      500: '#8c7333',
      600: '#6b5828',
      700: '#4a3d1c',
      800: '#2d2d28',
      900: '#1a1a18',
      950: '#111110',
    },
    success: {
      50: '#f0fdf4',
      100: '#dcfce7',
      200: '#bbf7d0',
      300: '#86efac',
      400: '#4ade80',
      500: '#22c55e',
    },
    warning: {
      50: '#fffbeb',
      100: '#fef3c7',
      200: '#fde68a',
      300: '#fcd34d',
      400: '#fbbf24',
      500: '#f59e0b',
    },
    error: {
      50: '#fef2f2',
      100: '#fee2e2',
      200: '#fecaca',
      300: '#fca5a5',
      400: '#f87171',
      500: '#ef4444',
    },
  },
  styles: {
    global: {
      'html': {
        scrollBehavior: 'smooth',
      },
      'html, body': {
        bg: 'warm.950',
        color: 'warm.50',
        fontFamily: 'body',
        fontSize: { base: '14px', md: '15px', lg: '16px' },
        lineHeight: 1.6,
      },
      'option': {
        bg: 'warm.800',
        color: 'warm.50',
      },
      '::selection': {
        bg: 'gold.500',
        color: 'warm.950',
      },
      '::-webkit-scrollbar': {
        width: '6px',
        height: '6px',
      },
      '::-webkit-scrollbar-track': {
        bg: 'warm.900',
      },
      '::-webkit-scrollbar-thumb': {
        bg: 'warm.800',
        borderRadius: '3px',
      },
      '::-webkit-scrollbar-thumb:hover': {
        bg: 'warm.700',
      },
      '@keyframes skeleton-shimmer': {
        '0%': { opacity: 0.4 },
        '50%': { opacity: 0.85 },
        '100%': { opacity: 0.4 },
      },
    },
  },
  shadows: {
    card: '0 4px 24px rgba(0, 0, 0, 0.4)',
    elevated: '0 8px 40px rgba(0, 0, 0, 0.5)',
    'glow-gold': '0 0 24px rgba(226, 176, 68, 0.22)',
    'glow-gold-lg': '0 0 40px rgba(226, 176, 68, 0.32)',
    'glow-rose': '0 0 20px rgba(193, 127, 89, 0.15)',
  },
  zIndices: {
    base: 0,
    dropdown: 90,
    sticky: 100,
    fixed: 200,
    modal: 300,
    toast: 400,
    tooltip: 500,
  },
  components: {
    Select: {
      baseStyle: {
        field: {
          color: 'warm.50',
          bg: 'warm.800',
          borderColor: 'rgba(245, 240, 232, 0.08)',
          _hover: { bg: 'warm.700' },
          _focus: { bg: 'warm.700', borderColor: 'gold.500', boxShadow: '0 0 0 3px rgba(226,176,68,0.15)' },
        },
      },
      defaultProps: { variant: 'filled' },
      sizes: {
        xs: { field: { h: '24px', px: '8px', fontSize: '10px' } },
        sm: { field: { h: '32px', px: '12px', fontSize: '12px' } },
        md: { field: { h: '40px', px: '16px', fontSize: '14px' } },
        lg: { field: { h: '48px', px: '20px', fontSize: '16px' } },
      },
      variants: {
        filled: {
          field: {
            bg: 'warm.800',
            color: 'warm.50',
            borderColor: 'rgba(245, 240, 232, 0.08)',
            _hover: { bg: 'warm.700' },
            _focus: { bg: 'warm.700', borderColor: 'gold.500', boxShadow: '0 0 0 3px rgba(226,176,68,0.15)' },
          },
        },
      },
    },
    Input: {
      defaultProps: {
        variant: 'filled',
        bg: 'rgba(255,255,255,0.03)',
        color: 'warm.50',
        borderColor: 'rgba(255,255,255,0.08)',
      },
      sizes: {
        xs: { field: { h: '24px', px: '8px', fontSize: '10px' } },
        sm: { field: { h: '32px', px: '12px', fontSize: '12px' } },
        md: { field: { h: '40px', px: '16px', fontSize: '14px' } },
        lg: { field: { h: '48px', px: '20px', fontSize: '16px' } },
      },
      variants: {
        filled: {
          field: {
            bg: 'rgba(255,255,255,0.03)',
            color: 'warm.50',
            borderColor: 'rgba(255,255,255,0.08)',
            _hover: { bg: 'rgba(255,255,255,0.05)' },
            _focus: { bg: 'rgba(255,255,255,0.05)', borderColor: 'gold.500', boxShadow: '0 0 0 3px rgba(226,176,68,0.15)' },
            _placeholder: { color: 'rgba(245,240,232,0.4)' },
          },
        },
      },
    },
    Textarea: {
      defaultProps: {
        variant: 'filled',
        bg: 'rgba(255,255,255,0.03)',
        color: 'warm.50',
        borderColor: 'rgba(255,255,255,0.08)',
      },
      variants: {
        filled: {
          bg: 'rgba(255,255,255,0.03)',
          color: 'warm.50',
          borderColor: 'rgba(255,255,255,0.08)',
          _hover: { bg: 'rgba(255,255,255,0.05)' },
          _focus: { bg: 'rgba(255,255,255,0.05)', borderColor: 'gold.500', boxShadow: '0 0 0 3px rgba(226,176,68,0.15)' },
          _placeholder: { color: 'rgba(245,240,232,0.4)' },
        },
      },
    },
    Modal: {
      defaultProps: {
        motionPreset: 'scale',
      },
      baseStyle: {
        dialog: {
          bg: 'warm.900',
          border: '1px solid',
          borderColor: 'rgba(255,255,255,0.08)',
          mx: { base: 2, md: 0 },
          maxW: { base: 'calc(100vw - 16px)', md: '90vw', lg: '80vw', xl: '70vw' },
          maxH: { base: 'calc(100vh - 60px)', md: '85vh' },
        },
        header: {
          color: 'warm.50',
          fontSize: { base: 'md', md: 'lg' },
          px: { base: 4, md: 6 },
          py: { base: 3, md: 4 },
        },
        body: {
          color: 'rgba(245,240,232,0.6)',
          px: { base: 4, md: 6 },
          py: { base: 3, md: 4 },
        },
      },
    },
    Table: {
      variants: {
        simple: {
          table: {
            display: { base: 'block', md: 'table' },
            overflowX: 'auto',
            whiteSpace: { base: 'nowrap', md: 'normal' },
          },
          th: {
            color: 'rgba(245,240,232,0.4)',
            borderColor: 'warm.800',
            fontSize: { base: '12px', md: '13px' },
            px: { base: 2, md: 4 },
            py: { base: 2, md: 3 },
          },
          td: {
            color: 'warm.50',
            borderColor: 'warm.800',
            fontSize: { base: '12px', md: '14px' },
            px: { base: 2, md: 4 },
            py: { base: 2, md: 3 },
          },
          tr: { _hover: { bg: 'rgba(255,255,255,0.03)' } },
        },
      },
    },
    Card: {
      baseStyle: {
        container: {
          bg: 'warm.900',
          border: '1px solid',
          borderColor: 'rgba(255,255,255,0.08)',
          borderRadius: { base: 'md', md: 'lg' },
          p: { base: 3, md: 4 },
          transition: 'all transition.slow ease-out',
          _hover: {
            transform: 'translateY(-3px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 24px rgba(226,176,68,0.08)',
            borderColor: 'rgba(226,176,68,0.15)',
          },
          _active: {
            transform: 'translateY(-1px) scale(0.98)',
            transition: 'transform transition.ultra-fast spring',
          },
          _disabled: {
            opacity: 0.38,
          },
          _before: {
            content: '""',
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 50%)',
            pointerEvents: 'none',
          },
          position: 'relative',
          overflow: 'hidden',
        },
      },
    },
    Tabs: {
      variants: {
        line: {
          tab: {
            color: 'rgba(245,240,232,0.4)',
            _selected: { color: 'gold.500', borderColor: 'gold.500' },
          },
        },
        'soft-rounded': {
          tab: {
            color: 'rgba(245,240,232,0.4)',
            _selected: { color: 'warm.950', bg: 'gold.500' },
          },
        },
      },
    },
    Badge: {
      baseStyle: {
        color: 'warm.50',
        fontWeight: 'medium',
        letterSpacing: '0.02em',
        borderRadius: 'sm',
        px: 2,
        py: 0.5,
      },
      variants: {
        solid: { bg: 'warm.700' },
        subtle: { bg: 'warm.700', color: 'warm.50' },
        outline: { borderWidth: '1px', borderStyle: 'solid', borderColor: 'warm.600', bg: 'transparent' },
      },
      defaultProps: { variant: 'subtle' },
    },
    Button: {
      baseStyle: {
        borderRadius: 'md',
        fontWeight: 'semibold',
        transition: 'all transition.normal ease-out',
        position: 'relative',
        overflow: 'hidden',
      },
      sizes: {
        xs: { h: '24px', px: '10px', fontSize: '10px' },
        sm: { h: '32px', px: '16px', fontSize: '12px' },
        md: { h: '40px', px: '24px', fontSize: '14px' },
        lg: { h: '48px', px: '32px', fontSize: '16px' },
      },
      defaultProps: { size: 'md', variant: 'solid' },
      variants: {
        solid: {
          bgGradient: 'linear-gradient(135deg, gold.500, gold.600)',
          color: 'warm.950',
          fontWeight: 'bold',
          _hover: {
            bgGradient: 'linear-gradient(135deg, gold.300, gold.400)',
            boxShadow: '0 0 28px rgba(226,176,68,0.30)',
            transform: 'scale(1.02)',
          },
          _active: { transform: 'scale(0.97)', transition: 'transform transition.ultra-fast spring' },
          _disabled: { opacity: 0.38 },
        },
        ghost: {
          color: 'rgba(245,240,232,0.6)',
          _hover: { bg: 'rgba(255,255,255,0.06)', color: 'warm.50' },
          _active: { transform: 'scale(0.97)', transition: 'transform transition.ultra-fast spring' },
          _disabled: { opacity: 0.38, pointerEvents: 'none' },
        },
        outline: {
          borderColor: 'gold.500',
          color: 'gold.500',
          _hover: { bg: 'rgba(226,176,68,0.12)', borderColor: 'gold.400', boxShadow: '0 0 16px rgba(226,176,68,0.12)' },
          _active: { transform: 'scale(0.97)', transition: 'transform transition.ultra-fast spring' },
          _disabled: { opacity: 0.38, pointerEvents: 'none' },
        },
      },
    },
    Progress: {
      baseStyle: { track: { bg: 'warm.800' } },
      variants: { brand: { filledTrack: { bgGradient: 'linear-gradient(135deg, gold.500, gold.400)' } } },
      defaultProps: { colorScheme: 'gold', variant: 'brand' },
    },
    Popover: {
      baseStyle: {
        content: { bg: 'warm.900', borderColor: 'rgba(255,255,255,0.08)' },
      },
    },
    Tooltip: {
      baseStyle: {
        bg: 'warm.800', color: 'warm.50', borderRadius: 'md', px: 3, py: 2,
      },
    },
    Skeleton: {
      baseStyle: {
        startColor: 'warm.800',
        endColor: 'warm.700',
      },
      variants: {
        shimmer: {
          bg: 'warm.700',
          animation: 'skeleton-shimmer 1.2s ease-in-out infinite',
        },
      },
    },
    Menu: {
      baseStyle: {
        list: { bg: 'warm.900', borderColor: 'rgba(255,255,255,0.08)' },
        item: {
          bg: 'warm.900', color: 'warm.50',
          _hover: { bg: 'rgba(255,255,255,0.06)' },
          _focus: { bg: 'rgba(255,255,255,0.06)' },
        },
      },
    },
    transition: {
      property: {
        default: 'all',
        fast: 'transform',
      },
      duration: {
        'ultra-fast': '150ms',
        fast: '200ms',
        normal: '300ms',
        slow: '400ms',
        skeleton: '1500ms',
      },
      easing: {
        'ease-out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'ease-in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
});

export default theme;
