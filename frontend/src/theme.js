import { extendTheme } from '@chakra-ui/react';

const theme = extendTheme({
  config: {
    initialColorMode: 'dark',
    useSystemColorMode: false,
  },
  styles: {
    global: {
      'html, body': {
        bg: 'gray.900',
        color: 'white',
      },
      'option': {
        bg: 'gray.700',
        color: 'white',
      },
    },
  },
  components: {
    Select: {
      baseStyle: {
        field: {
          color: 'white',
          bg: 'gray.700',
          _hover: {
            bg: 'gray.600',
          },
        },
      },
      defaultProps: {
        bg: 'gray.700',
        color: 'white',
      },
      variants: {
        filled: {
          field: {
            bg: 'gray.700',
            color: 'white',
            _hover: {
              bg: 'gray.600',
            },
            _focus: {
              bg: 'gray.600',
              borderColor: 'teal.500',
            },
          },
        },
      },
    },
    Input: {
      defaultProps: {
        bg: 'gray.700',
        color: 'white',
      },
      variants: {
        filled: {
          field: {
            bg: 'gray.700',
            color: 'white',
            _hover: {
              bg: 'gray.600',
            },
            _focus: {
              bg: 'gray.600',
              borderColor: 'teal.500',
            },
          },
        },
      },
    },
    Textarea: {
      defaultProps: {
        bg: 'gray.700',
        color: 'white',
      },
      variants: {
        filled: {
          bg: 'gray.700',
          color: 'white',
          _hover: {
            bg: 'gray.600',
          },
          _focus: {
            bg: 'gray.600',
            borderColor: 'teal.500',
          },
        },
      },
    },
    Modal: {
      baseStyle: {
        dialog: {
          bg: 'gray.800',
        },
        header: {
          color: 'white',
        },
        body: {
          color: 'white',
        },
      },
    },
    Table: {
      variants: {
        simple: {
          th: {
            color: 'gray.400',
            borderColor: 'gray.700',
          },
          td: {
            color: 'white',
            borderColor: 'gray.700',
          },
          tr: {
            _hover: {
              bg: 'gray.750',
            },
          },
        },
      },
    },
    Card: {
      baseStyle: {
        container: {
          bg: 'gray.800',
        },
      },
    },
    ModalContent: {
      baseStyle: {
        bg: 'gray.800',
      },
    },
    Tabs: {
      variants: {
        line: {
          tab: {
            color: 'gray.400',
            _selected: {
              color: 'teal.400',
              borderColor: 'teal.400',
            },
          },
        },
        'soft-rounded': {
          tab: {
            color: 'gray.400',
            _selected: {
              color: 'white',
              bg: 'teal.600',
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
  },
});

export default theme;
