import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte()],
  build: {
    ssr: 'src/index.ts',
    outDir: 'dist',
    rollupOptions: {
      output: [
        { format: 'es', entryFileNames: 'index.mjs' },
        { format: 'cjs', entryFileNames: 'index.cjs', exports: 'named' },
      ],
    },
  },
  ssr: {
    noExternal: ['@better-svelte-email/components', 'svelte'],
  },
});
