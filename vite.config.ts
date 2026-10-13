import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), lab: resolve(__dirname, 'lab.html'), codex: resolve(__dirname, 'codex.html') },
    },
  },
});
