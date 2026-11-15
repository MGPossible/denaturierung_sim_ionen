import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? `/${process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'lysozyme-denaturation-simulation'}/` : '/',
  build: { target: ['es2020', 'safari15'] },
});
