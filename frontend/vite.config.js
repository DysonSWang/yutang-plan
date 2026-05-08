import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isProduction = process.env.NODE_ENV === 'production'
// Capacitor 构建不需要 PWA（文件从 asset:// 加载，SW 无法工作）
const isCapacitor = process.env.CAPACITOR_BUILD === 'true'

export default defineConfig({
  // Capacitor 构建用 /（Android assets 根路径），其他生产环境用 /app/
  base: isCapacitor ? '/' : (process.env.NODE_ENV === 'production' ? '/app/' : '/'),
  plugins: [
    react(),
    // PWA 在生产环境启用（已临时禁用以便调试构建问题）
  ],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    '__CAPACITOR_BUILD__': JSON.stringify(isCapacitor),
  },
  optimizeDeps: {
    include: ['@chakra-ui/react', '@chakra-ui/hooks'],
  },
  server: {
    port: 5181,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:3005',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3005',
        ws: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/__tests__/setup.js',
    include: ['src/__tests__/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/__tests__/'],
    },
  },
})