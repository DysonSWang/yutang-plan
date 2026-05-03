import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isProduction = process.env.NODE_ENV === 'production'
// Capacitor 构建不需要 PWA（文件从 asset:// 加载，SW 无法工作）
const isCapacitor = process.env.CAPACITOR_BUILD === 'true'

export default defineConfig({
  // 开发环境用 /（npm run dev 时直接访问 localhost:5181/）
  // 生产环境用 /（部署在根路径，由 nginx 处理）
  base: '/',
  plugins: [
    react(),
    // PWA 在生产环境启用（已临时禁用以便调试构建问题）
  ],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    'import.meta.env.VITE_API_URL': JSON.stringify(
      isProduction ? 'https://zhuiai.club' : ''
    ),
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