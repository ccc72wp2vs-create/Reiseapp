import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * Generates /sw.js for the client build with a precache list of every
 * emitted asset plus the static public files. The build hash is embedded so
 * each deployment produces a new service worker (→ update prompt in the app).
 */
function serviceWorker(): Plugin {
  const publicFiles = [
    '/',
    '/manifest.webmanifest',
    '/theme-init.js',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/apple-touch-icon.png',
    '/icons/favicon.svg',
  ];
  return {
    name: 'travio-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      if (this.environment?.name !== 'client') return;
      const assets = Object.keys(bundle)
        .filter((f) => !f.endsWith('.map') && !f.endsWith('.html') && f !== 'sw.js')
        .map((f) => `/${f}`);
      const list = [...publicFiles, ...assets];
      const id = createHash('sha256').update(list.join('|')).digest('hex').slice(0, 12);
      const source = readFileSync(new URL('./sw/sw.template.js', import.meta.url), 'utf8')
        .replace('__BUILD_ID__', id)
        .replace('__PRECACHE_LIST__', JSON.stringify(list, null, 2));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(), serviceWorker()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
  },
});
