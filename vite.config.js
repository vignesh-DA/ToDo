import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Warn if any chunk exceeds 500 kB
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // Split vendor code (React) into its own cached chunk
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
});
