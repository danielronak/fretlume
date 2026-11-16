import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

// BASE_PATH is "/<repo>/" on GitHub Pages and "/" everywhere else.
const base = process.env.BASE_PATH ?? '/';

export const alias = {
  '@core': src('core'),
  '@vision': src('vision'),
  '@audio': src('audio'),
  '@overlay': src('overlay'),
  '@learn': src('learn'),
  '@content': src('content'),
  '@storage': src('storage'),
  '@features': src('features'),
  '@ui': src('ui'),
  '@i18n': src('i18n'),
  '@': src(''),
};

export default defineConfig({
  base,
  resolve: { alias },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Fretlume',
        short_name: 'Fretlume',
        description: 'Learn guitar with live overlays on your own fretboard. Free and offline.',
        theme_color: '#141210',
        background_color: '#141210',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Everything the app needs is precached, so it runs with no network after the first visit.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,onnx,task,json}'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        clientsClaim: true,
        skipWaiting: false,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
      },
    }),
  ],
  build: { target: 'es2022', sourcemap: true },
});
