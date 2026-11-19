import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    // three.js alone is ~600 kB minified; the warning is expected for a 3D app.
    chunkSizeWarningLimit: 1600,
  },
});
