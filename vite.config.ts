import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // relative asset paths, so the build works from any URL prefix (e.g. mcscope.com/game/vibecraft/)
  base: './',
  // each checkout keeps its own pre-bundled deps (two dev servers sharing
  // node_modules/.vite can serve mismatched copies of a library)
  cacheDir: resolve(__dirname, '.vite'),
  // the arena's module worker imports shared chunks, which the default iife format can't do
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), lab: resolve(__dirname, 'lab.html'), codex: resolve(__dirname, 'codex.html'), make: resolve(__dirname, 'make.html') },
    },
  },
});
