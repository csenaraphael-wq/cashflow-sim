import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server runs on 5173 by default; the API runs on 3001 (see ../server.js).
// The API already sends permissive CORS headers, so we call it directly.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
