/** Web Push settings per user/device and the inbox the service worker reads. */
import { Hono } from 'hono';
import { z } from 'zod';
import { currentUser, parseJson } from '../middleware/core';
import { nowIso, uuid } from '../lib/util';
import { PUSH_KINDS, pushConfig, takeInbox } from '../services/push';
import type { AppEnv } from '../types';

const push = new Hono<AppEnv>();

const prefsSchema = z.object(Object.fromEntries(PUSH_KINDS.map((k) => [k, z.boolean().optional()]))).partial();
const subSchema = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith('https://'), 'Ungültiger Endpunkt'),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  prefs: prefsSchema.optional(),
});

push.get('/config', (c) => {
  const cfg = pushConfig(c.env);
  return c.json({ publicKey: cfg.publicKey, enabled: cfg.enabled, kinds: PUSH_KINDS });
});

/** Register (or update) this device. */
push.post('/subscribe', async (c) => {
  const input = await parseJson(c, subSchema);
  const user = currentUser(c);
  const prefs = JSON.stringify(input.prefs ?? {});
  await c.env.DB.prepare(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, prefs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, prefs = excluded.prefs`,
  )
    .bind(uuid(), user.id, input.endpoint, input.keys.p256dh, input.keys.auth, prefs, nowIso())
    .run();
  return c.json({ ok: true });
});

push.put('/prefs', async (c) => {
  const { endpoint, prefs } = await parseJson(c, z.object({ endpoint: z.string().url().max(1000), prefs: prefsSchema }));
  await c.env.DB.prepare('UPDATE push_subscriptions SET prefs = ? WHERE endpoint = ? AND user_id = ?').bind(JSON.stringify(prefs), endpoint, currentUser(c).id).run();
  return c.json({ ok: true });
});

push.post('/unsubscribe', async (c) => {
  const { endpoint } = await parseJson(c, z.object({ endpoint: z.string().max(1000) }));
  await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').bind(endpoint, currentUser(c).id).run();
  return c.json({ ok: true });
});

/** This device's current settings (or null when not subscribed). */
push.post('/status', async (c) => {
  const { endpoint } = await parseJson(c, z.object({ endpoint: z.string().max(1000) }));
  const row = await c.env.DB.prepare('SELECT prefs FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').bind(endpoint, currentUser(c).id).first<{ prefs: string }>();
  return c.json({ subscribed: !!row, prefs: row ? JSON.parse(row.prefs) : null });
});

/** Called by the service worker after a push: waiting messages for this user. */
push.post('/inbox', async (c) => {
  c.header('Cache-Control', 'no-store');
  return c.json({ messages: await takeInbox(c.env.DB, currentUser(c).id) });
});

export default push;
