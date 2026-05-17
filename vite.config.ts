import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function ignoreApiDir(): Plugin {
  return {
    name: 'ignore-api-dir',
    enforce: 'pre',
    resolveId(id) {
      if (id.startsWith('/api/') || id.startsWith('api/')) {
        return { id, external: true }
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), ignoreApiDir()],
  server: {
    proxy: {
      '/api/yupoo': {
        target: 'https://minkang.x.yupoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yupoo/, ''),
      },
    },
    watch: {
      ignored: ['**/api/**'],
    },
  },
})
