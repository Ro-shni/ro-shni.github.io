import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      // User-site repo (ro-shni.github.io) + custom domain blog.roshines.in
      // both serve from the domain root, so base must be '/'.
      base: '/',
      server: {
        port: 3000,
        host: 'localhost',
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        // match the folder your deploy script publishes (set to 'build' or 'dist')
        outDir: 'build'
      }
    };
});