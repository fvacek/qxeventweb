import path from "path"
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

// import devtools from 'solid-devtools/vite';

export default defineConfig({
  plugins: [
    // devtools(),
    solidPlugin(),
    tailwindcss()
  ],
  server: {
    port: 3000,
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Split vendor libraries into separate chunks
          if (id.includes('node_modules')) {
            if (id.includes('@kobalte/core')) return 'kobalte';
            if (id.includes('libshv-js')) return 'libshv';
            if (id.includes('@solidjs/router')) return 'solid-router';
            if (id.includes('solid-js')) return 'solid-core';
            // Group Vue dependencies from libshv-js
            if (id.includes('vue') || id.includes('@vue') || id.includes('@vueuse')) return 'vue-deps';
            if (id.includes('zod')) return 'zod';
            if (id.includes('js-pkce')) return 'auth-utils';
            if (id.includes('class-variance-authority') || 
                id.includes('clsx') || 
                id.includes('tailwind-merge') || 
                id.includes('tailwindcss-animate')) {
              return 'utils';
            }
            // Group remaining smaller vendor libraries
            return 'vendor';
          }
          
          // Split UI components into separate chunk
          if (id.includes('/components/ui/')) {
            return 'ui-components';
          }
          
          // Split context providers
          if (id.includes('/context/')) {
            return 'contexts';
          }
          
          // Split routes
          if (id.includes('/routes/')) {
            return 'routes';
          }
        }
      }
    },
    chunkSizeWarningLimit: 1000
  },
    resolve: {
      alias: {
        "~": path.resolve(__dirname, "./src")
      }
    },
})
