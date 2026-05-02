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
  colors: {
    gold: {
      50: '#fdf8ec',
      100: '#f9edcc',
      200: '#f3d999',
      300: '#ecc566',
      400: '#e3b33f',
      500: '#d4a853',  // primary
      600: '#bf9530',
      700: '#a07d28',
      800: '#7d6220',
      900: '#5a4718',
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
    },
  },
  shadows: {
    card: '0 4px 24px rgba(0, 0, 0, 0.4)',
    elevated: '0 8px 40px rgba(0, 0, 0, 0.5)',
    'glow-gold': '0 0 24px rgba(212, 168, 83, 0.2)',
    'glow-gold-lg': '0 0 40px rgba(212, 168, 83, 0.3)',
    'glow-rose': '0 0 20px rgba(193, 127, 89, 0.15)',
  },
  components: {
    Select: {
      baseStyle: {
        field: {
          color: 'warm.50',
          bg: 'warm.800',
          borderColor: 'rgba(245, 240, 232, 0.08)',
          _hover: { bg: 'warm.700' },
        },
      },
      variants: {
        filled: {
          field: {
            bg: 'warm.800',
            color: 'warm.50',
            borderColor: 'rgba(245, 240, 232, 0.08)',
            _hover: { bg: 'warm.700' },
            _focus: { bg: 'warm.700', borderColor: 'gold.500' },
          },
        },
      },
    },
    Input: {
      defaultProps: {
        bg: 'rgba(255,255,255,0.03)',
        color: 'warm.50',
        borderColor: 'rgba(255,255,255,0.08)',
      },
      variants: {
        filled: {
          field: {
            bg: 'rgba(255,255,255,0.03)',
            color: 'warm.50',
            borderColor: 'rgba(255,255,255,0.08)',
            _hover: { bg: 'rgba(255,255,255,0.05)' },
            _focus: { bg: 'rgba(255,255,255,0.05)', borderColor: 'gold.500', boxShadow: '0 0 0 3px rgba(212,168,83,0.12)' },
            _placeholder: { color: 'rgba(245,240,232,0.2)' },
          },
        },
      },
    },
    Textarea: {
      defaultProps: {
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
          _focus: { bg: 'rgba(255,255,255,0.05)', borderColor: 'gold.500', boxShadow: '0 0 0 3px rgba(212,168,83,0.12)' },
          _placeholder: { color: 'rgba(245,240,232,0.2)' },
        },
      },
    },
    Modal: {
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
      baseStyle: { color: 'warm.50' },
    },
    Button: {
      variants: {
        solid: {
          bgGradient: 'linear(135deg, gold.500, gold.600)',
          color: 'warm.950',
          fontWeight: 'bold',
          _hover: { bgGradient: 'linear(135deg, gold.400, gold.500)', boxShadow: '0 0 28px rgba(212,168,83,0.22)' },
          _active: { bg: 'gold.700' },
        },
        ghost: {
          color: 'rgba(245,240,232,0.6)',
          _hover: { bg: 'rgba(255,255,255,0.06)', color: 'warm.50' },
        },
        outline: {
          borderColor: 'gold.500',
          color: 'gold.500',
          _hover: { bg: 'rgba(212,168,83,0.1)' },
        },
      },
    },
    Progress: {
      baseStyle: { track: { bg: 'warm.800' } },
      variants: { brand: { filledTrack: { bg: 'gold.500' } } },
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
  },
});

export default theme;
