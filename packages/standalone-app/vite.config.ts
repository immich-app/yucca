import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    proxy: {
      '/api': {
        target: process.env.YUCCA_DEV_API_URL ?? 'http://127.0.0.1:22676',
        ws: true,
      },
    },
  },
});
