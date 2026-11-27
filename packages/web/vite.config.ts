import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The app is served under /app (CloudFront behavior); the API under /api.
// WEB_PORT (5173-5182, allowed as Cognito callback on dev) and API_PORT (API) let several sessions run side by side.
export default defineConfig({
  base: '/app/',
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 3000}` },
  },
});
