import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
        '/audio': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
        '/editor': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
        '/blog': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
        '/demucs-web': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
      },
    },
    optimizeDeps: {
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
