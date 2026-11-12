import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../../worker/app';
import type { Env } from '../../worker/env';
import { D1Shim } from './d1-shim';

export const SETUP_TOKEN = 'test-setup-token-0123456789';
const ORIGIN = 'http://localhost';

export function createTestEnv() {
  const db = new D1Shim();
  const dir = join(__dirname, '../../migrations');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    db.sqlite.exec(readFileSync(join(dir, f), 'utf8'));
  }
  const env = { DB: db as unknown as D1Database, SETUP_TOKEN, APP_ENV: 'test' } as Env;
  const app = createApp();
  return { db, env, app };
}

export type TestEnv = ReturnType<typeof createTestEnv>;

/** A browser-like client with its own cookie jar. */
export class Client {
  cookie = '';
  constructor(private t: TestEnv) {}

  async req(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
    const headers: Record<string, string> = { origin: ORIGIN, 'x-travio-csrf': '1', ...extraHeaders };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.cookie) headers.cookie = this.cookie;
    const res = await this.t.app.fetch(
      new Request(`${ORIGIN}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
      this.t.env,
      { waitUntil: () => undefined, passThroughOnException: () => undefined } as unknown as ExecutionContext,
    );
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const m = /travio_session=([^;]*)/.exec(setCookie);
      if (m) this.cookie = m[1] ? `travio_session=${m[1]}` : '';
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, body: json, headers: res.headers };
  }
  get(p: string) {
    return this.req('GET', p);
  }
  post(p: string, b: unknown = {}) {
    return this.req('POST', p, b);
  }
  patch(p: string, b: unknown) {
    return this.req('PATCH', p, b);
  }
  put(p: string, b: unknown) {
    return this.req('PUT', p, b);
  }
  del(p: string, b?: unknown) {
    return this.req('DELETE', p, b);
  }
}

export async function setupOwner(t: TestEnv, email = 'owner@example.com', displayName = 'Owner') {
  const c = new Client(t);
  const r = await c.post('/auth/setup', { setupToken: SETUP_TOKEN, email, displayName, password: 'sehr-geheimes-passwort' });
  if (r.status !== 201) throw new Error(`setup failed: ${JSON.stringify(r.body)}`);
  return c;
}

/** Creates an additional user through an invitation. */
export async function inviteUser(t: TestEnv, owner: Client, tripId: string, role: string, email: string, name = 'Gast') {
  const inv = await owner.post(`/trips/${tripId}/invitations`, { role });
  if (inv.status !== 201) throw new Error(`invite failed: ${JSON.stringify(inv.body)}`);
  const c = new Client(t);
  const r = await c.post(`/invitations/${inv.body.token}/accept`, {
    account: { email, displayName: name, password: 'noch-ein-passwort-123' },
  });
  if (r.status !== 200) throw new Error(`accept failed: ${JSON.stringify(r.body)}`);
  return c;
}
