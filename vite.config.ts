import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
    // Runs after all files are written: the precache list is built from what
    // actually ended up in dist/client/assets (chunk names can still change
    // after generateBundle, which once put non-existent files into the list).
    writeBundle(options) {
      if (this.environment?.name !== 'client' || !options.dir) return;
      const assets = readdirSync(join(options.dir, 'assets'))
        .filter((f) => !f.endsWith('.map') && !f.startsWith('.'))
        .sort()
        .map((f) => `/assets/${f}`);
      const list = [...publicFiles, ...assets];
      const template = readFileSync(new URL('./sw/sw.template.js', import.meta.url), 'utf8');
      const id = createHash('sha256').update(list.join('|')).update(template).digest('hex').slice(0, 12);
      const source = template
        .replace('__BUILD_ID__', id)
        .replace('__PRECACHE_LIST__', JSON.stringify(list, null, 2));
      writeFileSync(join(options.dir, 'sw.js'), source);
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // TRAVIO_PERSIST lets E2E tests use an isolated local D1 state.
    cloudflare({
      persistState: process.env.TRAVIO_PERSIST ? { path: process.env.TRAVIO_PERSIST } : true,
      // Workers AI only runs remotely – local E2E runs (and TRAVIO_NO_AI=1) work without it;
      // receipts are then stored without recognition.
      ...(process.env.TRAVIO_PERSIST || process.env.TRAVIO_NO_AI ? { config: (c: { ai?: unknown }) => void (c.ai = undefined) } : {}),
    }),
    serviceWorker(),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
  },
});
