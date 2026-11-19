/**
 * "Lage vor Ort": fetches public sources once per run and files the
 * travel-relevant items under each running trip and its stops.
 *  - Auswärtiges Amt (open data): Thailand travel advice changed
 *  - GDACS (UN): disasters/alerts near a stop
 *  - Thai news RSS (English): headlines that name one of the stops
 * Headlines are summarised in German by Workers AI (max a few per run);
 * without AI the original headline is shown. Urgent items trigger a push.
 */
import { addDaysToDate } from '../../shared/trip';
import { classifyNews, haversineKm, matchStop, parseRss, type NewsItemDto, type NewsKind, type NewsSeverity, type RssItem } from '../../shared/news';
import type { Env } from '../env';
import { nowIso, uuid } from '../lib/util';
import { notifyUsers } from './push';

export const AA_LIST = 'https://www.auswaertiges-amt.de/opendata/travelwarning';
export const AA_THAILAND_PAGE = 'https://www.auswaertiges-amt.de/de/service/laender/thailand-node/thailandsicherheit-201558';
export const GDACS_RSS = 'https://www.gdacs.org/xml/rss.xml';
export const NEWS_FEEDS: { source: string; url: string }[] = [
  { source: 'Bangkok Post', url: 'https://www.bangkokpost.com/rss/data/most-recent.xml' },
  { source: 'The Thaiger', url: 'https://thethaiger.com/feed' },
  { source: 'Khaosod English', url: 'https://www.khaosodenglish.com/feed/' },
];
const SUMMARY_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const MAX_SUMMARIES_PER_RUN = 6;

async function fetchText(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'TRAVIO travel app (news for travellers)', Accept: '*/*' } });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(JSON.stringify({ level: 'warn', msg: 'news source failed', url, status: res.status }));
      return null;
    }
    return await res.text();
  } catch (e) {
    console.warn(JSON.stringify({ level: 'warn', msg: 'news source failed', url, error: String(e).slice(0, 120) }));
    return null;
  }
}

interface Candidate {
  source: string;
  externalId: string;
  kind: NewsKind;
  severity: NewsSeverity;
  title: string;
  /** Text for the German summary (headline + teaser). */
  text: string;
  url: string | null;
  publishedAt: string;
  destinationId: string | null;
  needsSummary: boolean;
}

interface Stop {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  arrival_date: string;
  departure_date: string;
}

const iso = (d: string | null) => {
  const t = d ? Date.parse(d) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : nowIso();
};

/** Thailand entry of the AA open-data list → a candidate when it changed within 14 days. */
export function aaCandidates(json: unknown, now = Date.now()): Candidate[] {
  const resp = (json as { response?: Record<string, unknown> })?.response ?? {};
  for (const [key, v] of Object.entries(resp)) {
    const e = v as Record<string, unknown>;
    if (!e || typeof e !== 'object') continue;
    const code = String(e.countryCode ?? e.iso3CountryCode ?? '').toUpperCase();
    if (code !== 'TH' && code !== 'THA' && String(e.countryName ?? '').toLowerCase() !== 'thailand') continue;
    const lm = Number(e.lastModified ?? e.effective ?? 0);
    const ms = lm > 1e12 ? lm : lm * 1000;
    if (!ms || now - ms > 14 * 86400_000) return [];
    const warning = !!(e.warning || e.partialWarning);
    return [
      {
        source: 'Auswärtiges Amt',
        externalId: `${key}:${lm}`,
        kind: 'advisory',
        severity: warning ? 'urgent' : 'important',
        title: warning ? 'Reisewarnung für Thailand (Auswärtiges Amt)' : 'Reise- und Sicherheitshinweise Thailand aktualisiert',
        text: '',
        url: AA_THAILAND_PAGE,
        publishedAt: new Date(ms).toISOString(),
        destinationId: null,
        needsSummary: false,
      },
    ];
  }
  return [];
}

/** GDACS alerts within 400 km of a stop (green ones only within 150 km). */
export function gdacsCandidates(items: RssItem[], stops: Stop[]): Candidate[] {
  const out: Candidate[] = [];
  for (const it of items) {
    const lat = Number(it.extra['geo:lat']);
    const lng = Number(it.extra['geo:long']);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const level = (it.extra['gdacs:alertlevel'] ?? '').toLowerCase();
    let best: { stop: Stop; km: number } | null = null;
    for (const s of stops) {
      if (s.lat == null || s.lng == null) continue;
      const km = haversineKm({ lat, lng }, { lat: s.lat, lng: s.lng });
      if (!best || km < best.km) best = { stop: s, km };
    }
    if (!best || best.km > 400 || (level === 'green' && best.km > 150)) continue;
    const type = (it.extra['gdacs:eventtype'] ?? '').toUpperCase();
    out.push({
      source: 'GDACS',
      externalId: it.guid,
      kind: type === 'EQ' ? 'safety' : 'weather',
      severity: level === 'red' ? 'urgent' : level === 'orange' ? 'important' : 'info',
      title: it.title,
      text: `${it.title}. ${it.description}`,
      url: it.link,
      publishedAt: iso(it.pubDate),
      destinationId: best.stop.id,
      needsSummary: true,
    });
  }
  return out;
}

/** News headlines that name a stop and are travel-relevant (last 3 days). */
export function newsCandidates(source: string, items: RssItem[], stops: Stop[], now = Date.now()): Candidate[] {
  const out: Candidate[] = [];
  for (const it of items) {
    const published = iso(it.pubDate);
    if (now - Date.parse(published) > 3 * 86400_000) continue;
    const text = `${it.title}. ${it.description}`;
    const stop = matchStop(text, stops);
    if (!stop) continue;
    const c = classifyNews(text);
    if (!c) continue;
    out.push({ source, externalId: it.guid, ...c, title: it.title, text, url: it.link, publishedAt: published, destinationId: stop.id, needsSummary: true });
  }
  return out;
}

async function summarize(env: Env, text: string): Promise<string | null> {
  if (!env.AI) return null;
  try {
    const out = (await env.AI.run(SUMMARY_MODEL as never, {
      messages: [
        {
          role: 'system',
          content:
            'Du fasst eine englische Nachricht für deutsche Urlauber in Thailand zusammen: 1–2 kurze, sachliche Sätze auf Deutsch, nur was für Reisende wichtig ist (Ort, was passiert, Folgen). Keine Einleitung, nichts erfinden.',
        },
        { role: 'user', content: text.slice(0, 900) },
      ],
      max_tokens: 140,
    } as never)) as { response?: string };
    const s = (out.response ?? '').trim().replace(/^["„]|["“]$/g, '');
    return s ? s.slice(0, 400) : null;
  } catch {
    return null;
  }
}

/** Hourly: fetch sources once, file relevant items per running trip, push urgent ones. */
export async function refreshNews(env: Env, now = new Date()): Promise<number> {
  const day = now.toISOString().slice(0, 10);
  const { results: trips } = await env.DB.prepare('SELECT id FROM trips WHERE start_date <= ? AND end_date >= ?')
    .bind(addDaysToDate(day, 7), addDaysToDate(day, -1))
    .all<{ id: string }>();
  if (!trips.length) return 0;

  const [aaText, gdacsText, ...feedTexts] = await Promise.all([fetchText(AA_LIST), fetchText(GDACS_RSS), ...NEWS_FEEDS.map((f) => fetchText(f.url))]);
  const aaJson: unknown = (() => {
    try {
      return aaText ? JSON.parse(aaText) : null;
    } catch {
      return null;
    }
  })();
  const gdacs = gdacsText ? parseRss(gdacsText, 120) : [];
  const feeds = NEWS_FEEDS.map((f, i) => ({ source: f.source, items: feedTexts[i] ? parseRss(feedTexts[i]!) : [] }));
  // One line per run: how much each source delivered (helps spot blocked feeds).
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'news sources',
      aa: aaJson ? 'ok' : aaText === null ? 'failed' : 'unparsable',
      gdacs: gdacs.length,
      feeds: feeds.map((f, i) => ({ source: f.source, items: f.items.length, ...(f.items.length ? {} : { start: (feedTexts[i] ?? 'null').slice(0, 80) }) })),
    }),
  );

  let added = 0;
  let summaries = 0;
  for (const { id: tripId } of trips) {
    // Stops still to come (or current) – past ones are no longer interesting.
    const { results: stops } = await env.DB.prepare(
      'SELECT id, name, lat, lng, arrival_date, departure_date FROM destinations WHERE trip_id = ? AND departure_date >= ? ORDER BY arrival_date, sort_order',
    )
      .bind(tripId, day)
      .all<Stop>();
    const candidates = [
      ...aaCandidates(aaJson, now.getTime()),
      ...gdacsCandidates(gdacs, stops),
      ...feeds.flatMap((f) => newsCandidates(f.source, f.items, stops, now.getTime())),
    ];
    for (const c of candidates) {
      const exists = await env.DB.prepare('SELECT 1 FROM news_items WHERE trip_id = ? AND source = ? AND external_id = ?').bind(tripId, c.source, c.externalId).first();
      if (exists) continue;
      let summary: string | null = null;
      if (c.needsSummary && summaries < MAX_SUMMARIES_PER_RUN) {
        summary = await summarize(env, c.text);
        summaries++;
      }
      const id = uuid();
      const r = await env.DB.prepare(
        `INSERT OR IGNORE INTO news_items (id, trip_id, destination_id, source, external_id, kind, severity, title, summary, url, published_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(id, tripId, c.destinationId, c.source, c.externalId, c.kind, c.severity, c.title.slice(0, 300), summary, c.url, c.publishedAt, nowIso())
        .run();
      if (!r.meta.changes) continue;
      added++;
      if (c.severity === 'urgent') {
        const { results: members } = await env.DB.prepare('SELECT user_id FROM trip_members WHERE trip_id = ?').bind(tripId).all<{ user_id: string }>();
        const stop = stops.find((s) => s.id === c.destinationId);
        await notifyUsers(env, members.map((m) => m.user_id), {
          kind: 'news',
          tripId,
          title: `${stop ? `${stop.name}: ` : ''}${c.kind === 'advisory' ? 'Reisehinweise' : 'Wichtige Meldung'}`,
          body: summary ?? c.title,
          url: '/?meldungen=1',
          dedupeKey: `news:${id}`,
        });
      }
    }
  }
  await env.DB.prepare("DELETE FROM news_items WHERE published_at < datetime('now', '-30 days')").run();
  return added;
}

export async function listNews(db: D1Database, tripId: string): Promise<NewsItemDto[]> {
  const since = new Date(Date.now() - 10 * 86400_000).toISOString();
  const { results } = await db
    .prepare('SELECT id, destination_id, source, kind, severity, title, summary, url, published_at FROM news_items WHERE trip_id = ? AND published_at >= ? ORDER BY published_at DESC LIMIT 60')
    .bind(tripId, since)
    .all<Record<string, string | null>>();
  return results.map((r) => ({
    id: r.id!,
    destinationId: r.destination_id,
    source: r.source!,
    kind: r.kind as NewsKind,
    severity: r.severity as NewsSeverity,
    title: r.title!,
    summary: r.summary,
    url: r.url,
    publishedAt: r.published_at!,
  }));
}
