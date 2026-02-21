import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: 'www',
  publicDir: 'public',
  base: './',
  plugins: [
    {
      name: 'remove-cordova-script',
      enforce: 'pre',
      transformIndexHtml(html) {
        // Remove a tag cordova.js antes do Vite processar para evitar erro de bundle
        return html.replace(/<script[^>]*src=["']cordova\.js["'][^>]*>[\s\S]*?<\/script>/gi, '');
      }
    },
    {
      name: 'inject-cordova-script',
      enforce: 'post',
      transformIndexHtml(html) {
        // Reinsere a tag cordova.js no final do body para o build final
        return html.replace('</body>', '    <script src="cordova.js"></script>\n</body>');
      }
    },
    {
      name: 'expose-gsap-global',
      transform(code, id) {
        // Intercepta o bootstrap.js para injetar o GSAP globalmente
        if (id.endsWith('bootstrap.js')) {
          return `import { gsap } from 'gsap';\nwindow.gsap = gsap;\n${code}`;
        }
      }
    }
  ],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000, // Aumenta o limite para 3MB (silencia o aviso do vendor.bundle.js)
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
            // Mantém o Service Worker na raiz para escopo correto
            return chunkInfo.name === 'sw' ? '[name].js' : 'js/[name].js';
        },
        chunkFileNames: 'js/[name].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'css/[name][extname]';
          }
          // Remove hash para facilitar cache manual no SW
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