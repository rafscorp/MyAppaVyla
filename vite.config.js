import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: 'www',
  publicDir: 'public',
  base: './',
  plugins: [],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'www/index.html'),
        app: resolve(__dirname, 'www/app.html'),
        onboard: resolve(__dirname, 'www/onboard.html'),
        sw: resolve(__dirname, 'www/sw.js'),
        bootstrap: resolve(__dirname, 'www/bootstrap.js'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
            return chunkInfo.name === 'sw' ? '[name].js' : 'js/[name].js';
        },
        chunkFileNames: 'js/[name].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'css/[name][extname]';
          }
          return 'assets/[name][extname]';
        },
        manualChunks: (id) => {
          if (id.includes('node_modules') || id.includes('@supabase')) {
            return 'vendor.bundle';
          }
        }
      }
    }
  }
});
