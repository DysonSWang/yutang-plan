import { extendTheme } from '@chakra-ui/react';

// Mobile-first responsive design tokens
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
    heading: "'Syne', sans-serif",
    body: "'Noto Sans SC', sans-serif",
  },
  breakpoints,
  colors: {
    brand: {
      50: '#e6fff9',
      100: '#b3ffea',
      200: '#80ffdb',
      300: '#4dffcc',
      400: '#1affbd',
      500: '#00d4aa', // primary glow
      600: '#00a888',
      700: '#007c66',
      800: '#005044',
      900: '#002422',
    },
    ocean: {
      50: '#f0f9ff',
      100: '#e0f2fe',
      200: '#bae6fd',
      300: '#7dd3fc',
      400: '#38bdf8',
      500: '#0ea5e9',
      600: '#0284c7',
      700: '#0369a1',
      800: '#075985',
      900: '#0c4a6e',
    },
    abyss: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
      950: '#0a0f1a', // deep ocean floor
    },
  },
  styles: {
    global: {
      'html': {
        scrollBehavior: 'smooth',
      },
      'html, body': {
        bg: 'abyss.950',
        color: 'white',
        fontFamily: 'body',
        fontSize: { base: '14px', md: '15px', lg: '16px' },
      },
      'option': {
        bg: 'abyss.800',
        color: 'white',
      },
      '::selection': {
        bg: 'brand.500',
        color: 'abyss.950',
      },
      '::-webkit-scrollbar': {
        width: '6px',
        height: '6px',
      },
      '::-webkit-scrollbar-track': {
        bg: 'abyss.900',
      },
      '::-webkit-scrollbar-thumb': {
        bg: 'abyss.700',
        borderRadius: '3px',
      },
      '::-webkit-scrollbar-thumb:hover': {
        bg: 'abyss.600',
      },
    },
  },
  shadows: {
    glow: '0 0 20px rgba(0, 212, 170, 0.3)',
    glowLg: '0 0 40px rgba(0, 212, 170, 0.4)',
    glowSm: '0 0 10px rgba(0, 212, 170, 0.2)',
    glass: '0 4px 24px rgba(0, 0, 0, 0.4)',
    card: '0 8px 32px rgba(0, 0, 0, 0.3)',
  },
  components: {
    Select: {
      baseStyle: {
        field: {
          color: 'white',
          bg: 'abyss.800',
          borderColor: 'abyss.700',
          _hover: {
            bg: 'abyss.700',
          },
        },
      },
      defaultProps: {
        bg: 'abyss.800',
        color: 'white',
      },
      variants: {
        filled: {
          field: {
            bg: 'abyss.800',
            color: 'white',
            borderColor: 'abyss.700',
            _hover: {
              bg: 'abyss.700',
            },
            _focus: {
              bg: 'abyss.700',
              borderColor: 'brand.500',
            },
          },
        },
      },
    },
    Input: {
      defaultProps: {
        bg: 'rgba(255,255,255,0.04)',
        color: 'white',
        borderColor: 'rgba(255,255,255,0.08)',
      },
      variants: {
        filled: {
          field: {
            bg: 'rgba(255,255,255,0.04)',
            color: 'white',
            borderColor: 'rgba(255,255,255,0.08)',
            _hover: {
              bg: 'rgba(255,255,255,0.07)',
            },
            _focus: {
              bg: 'rgba(255,255,255,0.07)',
              borderColor: 'brand.500',
            },
            _placeholder: {
              color: 'abyss.500',
            },
          },
        },
      },
    },
    Textarea: {
      defaultProps: {
        bg: 'rgba(255,255,255,0.04)',
        color: 'white',
        borderColor: 'rgba(255,255,255,0.08)',
      },
      variants: {
        filled: {
          bg: 'rgba(255,255,255,0.04)',
          color: 'white',
          borderColor: 'rgba(255,255,255,0.08)',
          _hover: {
            bg: 'rgba(255,255,255,0.07)',
          },
          _focus: {
            bg: 'rgba(255,255,255,0.07)',
            borderColor: 'brand.500',
          },
          _placeholder: {
            color: 'abyss.500',
          },
        },
      },
    },
    Modal: {
      baseStyle: {
        dialog: {
          bg: 'abyss.900',
          border: '1px solid',
          borderColor: 'rgba(255,255,255,0.08)',
          mx: { base: 2, md: 0 },
          maxW: { base: 'calc(100vw - 16px)', md: '90vw', lg: '80vw', xl: '70vw' },
          maxH: { base: 'calc(100vh - 60px)', md: '85vh' },
        },
        header: {
          color: 'white',
          fontSize: { base: 'md', md: 'lg' },
          px: { base: 4, md: 6 },
          py: { base: 3, md: 4 },
        },
        body: {
          color: 'abyss.300',
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
            color: 'abyss.400',
            borderColor: 'abyss.800',
            fontSize: { base: '12px', md: '13px' },
            px: { base: 2, md: 4 },
            py: { base: 2, md: 3 },
          },
          td: {
            color: 'white',
            borderColor: 'abyss.800',
            fontSize: { base: '12px', md: '14px' },
            px: { base: 2, md: 4 },
            py: { base: 2, md: 3 },
          },
          tr: {
            _hover: {
              bg: 'rgba(255,255,255,0.03)',
            },
          },
        },
      },
    },
    Card: {
      baseStyle: {
        container: {
          bg: 'rgba(255,255,255,0.03)',
          border: '1px solid',
          borderColor: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          borderRadius: { base: 'md', md: 'lg' },
          p: { base: 3, md: 4 },
        },
      },
    },
    ModalContent: {
      baseStyle: {
        bg: 'abyss.900',
        border: '1px solid',
        borderColor: 'rgba(255,255,255,0.08)',
      },
    },
    Tabs: {
      variants: {
        line: {
          tab: {
            color: 'abyss.400',
            _selected: {
              color: 'brand.500',
              borderColor: 'brand.500',
            },
          },
        },
        'soft-rounded': {
          tab: {
            color: 'abyss.400',
            _selected: {
              color: 'white',
              bg: 'brand.500',
            },
          },
        },
      },
    },
    Badge: {
      baseStyle: {
        color: 'white',
      },
    },
    Button: {
      variants: {
        solid: {
          bg: 'brand.500',
          color: 'abyss.950',
          fontWeight: 'bold',
          _hover: {
            bg: 'brand.400',
            boxShadow: '0 0 20px rgba(0, 212, 170, 0.4)',
          },
          _active: {
            bg: 'brand.600',
          },
        },
        ghost: {
          color: 'abyss.300',
          _hover: {
            bg: 'rgba(255,255,255,0.06)',
            color: 'white',
          },
        },
        outline: {
          borderColor: 'brand.500',
          color: 'brand.500',
          _hover: {
            bg: 'rgba(0, 212, 170, 0.1)',
          },
        },
      },
    },
    Progress: {
      baseStyle: {
        track: {
          bg: 'abyss.800',
        },
      },
      variants: {
        brand: {
          filledTrack: {
            bg: 'brand.500',
          },
        },
      },
    },
    Popover: {
      baseStyle: {
        content: {
          bg: 'abyss.900',
          borderColor: 'rgba(255,255,255,0.08)',
        },
      },
    },
    Tooltip: {
      baseStyle: {
        bg: 'abyss.800',
        color: 'white',
        borderRadius: 'md',
        px: 3,
        py: 2,
      },
    },
    Menu: {
      baseStyle: {
        list: {
          bg: 'abyss.900',
          borderColor: 'rgba(255,255,255,0.08)',
        },
        item: {
          bg: 'abyss.900',
          color: 'white',
          _hover: {
            bg: 'rgba(255,255,255,0.06)',
          },
          _focus: {
            bg: 'rgba(255,255,255,0.06)',
          },
        },
      },
    },
  },
});

export default theme;
