import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/yupoo': {
        target: 'https://minkang.x.yupoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yupoo/, ''),
      },
    },
  },
})
