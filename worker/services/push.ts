/**
 * Web Push (VAPID) without payload: the push only wakes the service worker,
 * which then fetches the waiting notifications from /push/inbox (same login).
 * No message content goes through Apple's/Google's push servers and no
 * payload encryption is needed. Keys: VAPID_PUBLIC_KEY (var) and
 * VAPID_PRIVATE_KEY (secret, JWK with x, y, d).
 */
import { addDaysToDate, todayIn } from '../../shared/trip';
import { checkinInfo } from '../../shared/checkin';
import { travelDay } from '../../shared/travelday';
import { remainingMinor } from '../../shared/costs';
import { formatMoney as money } from '../../shared/money';
import type { BookingDto, ExpenseDto, TripSnapshot } from '../../shared/types';
import type { Env } from '../env';
import { nowIso, uuid } from '../lib/util';
import { buildSnapshot } from './trips';

export type PushKind = 'checkin' | 'travelday' | 'payment' | 'expense' | 'news';
export const PUSH_KINDS: PushKind[] = ['checkin', 'travelday', 'payment', 'expense', 'news'];

export function pushConfig(env: Env) {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim() || null;
  return { publicKey, enabled: !!publicKey && !!env.VAPID_PRIVATE_KEY };
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = new TextEncoder();

async function vapidJwt(env: Env, audience: string): Promise<string> {
  const jwk = JSON.parse(env.VAPID_PRIVATE_KEY!) as JsonWebKey;
  const key = await crypto.subtle.importKey('jwk', { ...jwk, key_ops: ['sign'], ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(
    enc.encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'https://travio.travio-reise.workers.dev' })),
  );
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)));
  return `${header}.${claims}.${b64url(sig)}`;
}

/** Sends an empty push to one device; false when the subscription is gone. */
export async function sendPush(env: Env, endpoint: string): Promise<'ok' | 'gone' | 'error'> {
  try {
    const jwt = await vapidJwt(env, new URL(endpoint).origin);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { TTL: '86400', Urgency: 'normal', Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`, 'Content-Length': '0' },
    });
    if (res.status === 404 || res.status === 410) return 'gone';
    return res.ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

interface Msg {
  kind: PushKind;
  tripId: string | null;
  title: string;
  body: string;
  url: string;
  /** Same key + user → sent only once. */
  dedupeKey?: string;
}

/** Puts a message into the inbox of each user (respecting their settings) and wakes their devices. */
export async function notifyUsers(env: Env, userIds: readonly string[], msg: Msg): Promise<number> {
  if (!pushConfig(env).enabled || !userIds.length) return 0;
  let sent = 0;
  for (const userId of new Set(userIds)) {
    const subs = (
      await env.DB.prepare('SELECT id, endpoint, prefs FROM push_subscriptions WHERE user_id = ?').bind(userId).all<{ id: string; endpoint: string; prefs: string }>()
    ).results;
    const wanted = subs.filter((s) => {
      try {
        return (JSON.parse(s.prefs) as Record<string, boolean>)[msg.kind] !== false;
      } catch {
        return true;
      }
    });
    if (!wanted.length) continue;
    if (msg.dedupeKey) {
      const r = await env.DB.prepare('INSERT OR IGNORE INTO push_log (dedupe_key, user_id, created_at) VALUES (?, ?, ?)').bind(msg.dedupeKey, userId, nowIso()).run();
      if (!r.meta.changes) continue;
    }
    await env.DB.prepare('INSERT INTO push_inbox (id, user_id, trip_id, kind, title, body, url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(uuid(), userId, msg.tripId, msg.kind, msg.title.slice(0, 120), msg.body.slice(0, 300), msg.url, nowIso())
      .run();
    for (const s of wanted) {
      const r = await sendPush(env, s.endpoint);
      if (r === 'gone') await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(s.id).run();
      else if (r === 'ok') {
        sent++;
        await env.DB.prepare('UPDATE push_subscriptions SET last_ok_at = ? WHERE id = ?').bind(nowIso(), s.id).run();
      }
    }
  }
  return sent;
}

/** Messages waiting for this user (the service worker shows them); marks them delivered. */
export async function takeInbox(db: D1Database, userId: string) {
  const { results } = await db
    .prepare('SELECT id, kind, title, body, url, created_at FROM push_inbox WHERE user_id = ? AND delivered_at IS NULL ORDER BY created_at LIMIT 10')
    .bind(userId)
    .all<{ id: string; kind: string; title: string; body: string; url: string; created_at: string }>();
  if (results.length) {
    await db.prepare(`UPDATE push_inbox SET delivered_at = ? WHERE id IN (${results.map(() => '?').join(',')})`).bind(nowIso(), ...results.map((r) => r.id)).run();
  }
  // Keep the inbox small.
  await db.prepare("DELETE FROM push_inbox WHERE delivered_at IS NOT NULL AND delivered_at < datetime('now', '-7 days')").run();
  return results.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, url: r.url }));
}

const userIdsOf = (snap: TripSnapshot, travelerIds: readonly string[]) =>
  snap.travelers.filter((x) => x.userId && (!travelerIds.length || travelerIds.includes(x.id))).map((x) => x.userId!);

/** Hourly: check-in opened, travel day tomorrow (evening), balance due. Each only once. */
export async function runPushChecks(env: Env, now = new Date()): Promise<number> {
  if (!pushConfig(env).enabled) return 0;
  const day = now.toISOString().slice(0, 10);
  const { results: trips } = await env.DB.prepare('SELECT id FROM trips WHERE start_date <= ? AND end_date >= ?')
    .bind(addDaysToDate(day, 3), addDaysToDate(day, -1))
    .all<{ id: string }>();
  let sent = 0;
  for (const { id } of trips) {
    const snap = await buildSnapshot(env.DB, id, 'owner', '');
    if (!snap) continue;
    const tz = snap.destinations[0]?.timezone ?? snap.trip.homeTimezone;
    const today = todayIn(tz, now);
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(now));
    // 1) Check-in is open
    for (const b of snap.bookings) {
      const info = checkinInfo(b, now.getTime(), tz);
      if (!info || (info.state !== 'open' && info.state !== 'closing')) continue;
      sent += await notifyUsers(env, userIdsOf(snap, b.travelerIds), {
        kind: 'checkin',
        tripId: id,
        title: `Check-in offen: ${info.flightNumber ?? b.title}`,
        body: `${b.title} – jetzt einchecken.`,
        url: `/buchungen?id=${b.id}`,
        dedupeKey: `checkin:${b.id}`,
      });
    }
    // 2) Tomorrow is a travel day – in the evening, with what is still open
    if (hour >= 18) {
      const td = travelDay(snap.trip, snap.destinations, snap.bookings, today, addDaysToDate(today, 1), null);
      if (td && td.inDays === 1) {
        sent += await notifyUsers(env, userIdsOf(snap, []), {
          kind: 'travelday',
          tripId: id,
          title: `Morgen: ${td.leg.from.name} → ${td.leg.to.name}`,
          body: td.issues.length ? `${td.issues.length} Punkt(e) noch offen – kurz prüfen.` : 'Alles geklärt – gute Reise!',
          url: '/',
          dedupeKey: `travelday:${id}:${td.date}`,
        });
      }
    }
    // 3) Balance of a down payment is due (today/tomorrow)
    for (const b of snap.bookings as BookingDto[]) {
      if (!b.depositMinor || b.expenseId || b.paymentStatus === 'paid' || b.bookingStatus === 'cancelled' || !b.startDate) continue;
      if (b.startDate > addDaysToDate(today, 1) || b.startDate < today) continue;
      sent += await notifyUsers(env, userIdsOf(snap, b.travelerIds), {
        kind: 'payment',
        tripId: id,
        title: 'Restzahlung fällig',
        body: `${b.title} – ${money(remainingMinor(b), b.currency ?? snap.trip.baseCurrency)}`,
        url: `/buchungen?id=${b.id}`,
        dedupeKey: `due:${b.id}:${b.startDate}`,
      });
    }
  }
  return sent;
}

/** A new expense: tell everyone with a share (except who entered it) their part. */
export async function notifyExpense(env: Env, tripId: string, creatorUserId: string, e: ExpenseDto): Promise<void> {
  if (!pushConfig(env).enabled) return;
  const { results } = await env.DB.prepare('SELECT id, name, user_id FROM travelers WHERE trip_id = ?').bind(tripId).all<{ id: string; name: string; user_id: string | null }>();
  const creator = results.find((x) => x.user_id === creatorUserId);
  for (const s of e.shares) {
    const x = results.find((r) => r.id === s.travelerId);
    if (!x?.user_id || x.user_id === creatorUserId) continue;
    await notifyUsers(env, [x.user_id], {
      kind: 'expense',
      tripId,
      title: `${creator?.name ?? 'Neue Ausgabe'}: ${e.title}`,
      body: `Dein Anteil ${money(s.shareMinor, e.currency)} · gesamt ${money(e.amountMinor, e.currency)}`,
      url: '/kasse',
      dedupeKey: `expense:${e.id}`,
    });
  }
}
