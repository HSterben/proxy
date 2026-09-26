import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const backendEnv = loadEnv(mode, path.resolve(__dirname, '../backend'), '');
  const rootEnv = loadEnv(mode, path.resolve(__dirname, '..'), '');
  const merged = { ...rootEnv, ...backendEnv, ...env };
  const openrouterModelName =
    merged.openrouter_model_name || merged.OPENROUTER_MODEL_NAME || '';
  const convexUrl =
    merged.VITE_CONVEX_URL || 'https://strong-poodle-712.convex.cloud';
  const convexSiteUrl =
    merged.VITE_CONVEX_SITE_URL || convexUrl.replace('.convex.cloud', '.convex.site');

  return {
    plugins: [react()],
    // backend/convex/_generated is outside desktop/; pin convex so Rollup
    // does not look under backend/node_modules.
    resolve: {
      alias: {
        convex: path.resolve(__dirname, 'node_modules/convex'),
      },
    },
    define: {
      'import.meta.env.OPENROUTER_MODEL_NAME': JSON.stringify(openrouterModelName),
      'import.meta.env.VITE_CONVEX_URL': JSON.stringify(convexUrl),
      'import.meta.env.VITE_CONVEX_SITE_URL': JSON.stringify(convexSiteUrl),
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          chat: path.resolve(__dirname, 'chat.html'),
          settings: path.resolve(__dirname, 'settings.html'),
          presets: path.resolve(__dirname, 'presets.html'),
          subscription: path.resolve(__dirname, 'subscription.html'),
        },
        output: {
          // Keep Convex in one chunk to avoid Rollup circular re-export warnings
          manualChunks(id) {
            if (id.includes('node_modules/convex')) return 'convex';
          },
        },
      },
    },
  };
});
