import { Hono } from 'hono';
import { z } from 'zod';
import authRoutes, { invitations } from './api/auth';
import resources from './api/resources';
import trips from './api/trips';
import { ApiError } from './lib/errors';
import { bodyLimit, csrfProtection, currentUser, parseJson, requestContext, requireUser, sessionLoader } from './middleware/core';
import { deleteDemoTrips, importSeedTrip } from './services/seed';
import { DEMO_TRIP, THAILAND_2026 } from './services/seedData';
import type { AppEnv } from './types';

export function createApp() {
  const app = new Hono<AppEnv>().basePath('/api/v1');

  app.use('*', requestContext, bodyLimit, csrfProtection, sessionLoader);

  app.get('/health', (c) => c.json({ ok: true }));

  app.route('/auth', authRoutes);
  app.route('/invitations', invitations);

  app.use('/trips/*', requireUser);
  app.use('/trips', requireUser);
  app.route('/trips', trips);
  app.route('/trips', resources);

  /**
   * Idempotent dataset imports:
   *  - thailand-2026: the user's real trip (only provided facts)
   *  - demo-thailand: clearly labelled demo data
   */
  app.use('/imports/*', requireUser);
  app.post('/imports/:key', async (c) => {
    const key = c.req.param('key');
    const seed = key === THAILAND_2026.importKey ? THAILAND_2026 : key === DEMO_TRIP.importKey ? DEMO_TRIP : null;
    if (!seed) throw new ApiError('not_found', 'Unbekannter Import');
    const user = currentUser(c);
    const result = await importSeedTrip(c.env.DB, user, seed);
    return c.json(result, result.created ? 201 : 200);
  });

  app.use('/demo', requireUser);
  app.delete('/demo', async (c) => {
    await parseJson(c, z.object({}).passthrough());
    const n = await deleteDemoTrips(c.env.DB, currentUser(c).id);
    return c.json({ ok: true, deleted: n });
  });

  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Endpunkt nicht gefunden' } }, 404));

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status as 400);
    }
    // Never leak internals; log a structured error with the request ID only.
    console.error(
      JSON.stringify({ level: 'error', msg: 'unhandled', requestId: c.get('requestId'), error: String(err).slice(0, 500) }),
    );
    return c.json({ error: { code: 'internal_error', message: 'Interner Fehler. Bitte später erneut versuchen.' } }, 500);
  });

  return app;
}
