import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The app is served under /app (CloudFront behavior); the API under /api.
export default defineConfig({
  base: '/app/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
