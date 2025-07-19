import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    build: {
      outDir: 'dist/main',
      lib: {
        entry: './src/main/main.ts'
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    build: {
      outDir: 'dist/preload',
      lib: {
        entry: './src/preload/index.ts'
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: './src/renderer/index.html'
      }
    },
    plugins: [react()],
    define: {
      APP_VERSION: JSON.stringify(process.env.npm_package_version || '0.1.0')
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@main': resolve(__dirname, 'src/main'),
        '@preload': resolve(__dirname, 'src/preload')
      }
    },
    server: {
      watch: {
        ignored: [
          '**/python_backend/**',
          '**/node_modules/**',
          '**/dist/**',
          '**/out/**',
          '**/.git/**'
        ]
      }
    }
  }
});
