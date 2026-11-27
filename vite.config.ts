import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      allowedHosts: true as const,
      hmr: process.env.DISABLE_HMR !== 'true',
      // Runtime data folders are not source code. Watching them made every saved photo,
      // data save and log line trigger the dev-server file watcher.
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : { ignored: ['**/data/**', '**/uploads/**', '**/backups/**', '**/logs/**', '**/dist/**', '**/ocr-poc/**'] },
    },
    build: {
      sourcemap: false,
      minify: 'esbuild' as const,
    },
  };
});
