import { registerPlugin } from '@capacitor/core';

const ScreenshotToggle = registerPlugin('ScreenshotToggle', {
  web: {
    toggle: async () => {
      console.warn('ScreenshotToggle not available on web');
    },
    isEnabled: async () => ({ enabled: false }),
  },
});

export default ScreenshotToggle;
