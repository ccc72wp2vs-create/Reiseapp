/**
 * Cloudflare Worker entry point.
 * - /api/*  → JSON API (Hono)
 * - other   → static assets (SPA) served by Workers Static Assets
 *             (wrangler.jsonc: run_worker_first only for /api/*)
 */
import { createApp } from './app';
import type { Env } from './env';

const app = createApp();

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return app.fetch(request, env, ctx);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
