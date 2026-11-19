/**
 * Cloudflare Worker entry point.
 * - /api/*  → JSON API (Hono)
 * - other   → static assets (SPA) served by Workers Static Assets
 *             (wrangler.jsonc: run_worker_first only for /api/*)
 */
import { createApp } from './app';
import type { Env } from './env';
import { refreshActiveTrips } from './services/fx';
import { runPushChecks } from './services/push';
import { refreshNews } from './services/news';

const app = createApp();

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return app.fetch(request, env, ctx);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
  /** Daily: store the new ECB reference rates for running trips. */
  async scheduled(controller, env, ctx) {
    // Hourly: push reminders. Twice a day additionally: new ECB rates.
    ctx.waitUntil(runPushChecks(env).then(() => undefined).catch((e) => console.warn('push checks failed', String(e))));
    ctx.waitUntil(refreshNews(env).then(() => undefined).catch((e) => console.warn('news refresh failed', String(e))));
    if (controller.cron !== '0 * * * *') ctx.waitUntil(refreshActiveTrips(env.DB, new Date().toISOString().slice(0, 10)).then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
