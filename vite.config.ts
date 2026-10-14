import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // each checkout keeps its own pre-bundled deps (two dev servers sharing
  // node_modules/.vite can serve mismatched copies of a library)
  cacheDir: resolve(__dirname, '.vite'),
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), lab: resolve(__dirname, 'lab.html'), codex: resolve(__dirname, 'codex.html') },
    },
  },
});
