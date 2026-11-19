/**
 * "Lage vor Ort": local news and alerts for the stops of a trip.
 * Pure parsing and filtering (shared so it can be unit-tested):
 *  - only items that mention one of the trip's places (or lie nearby),
 *  - only travel-relevant topics (traffic, weather, safety, festivals),
 *  - three levels: urgent / important / info.
 */
export type NewsKind = 'traffic' | 'weather' | 'safety' | 'festival' | 'advisory';
export type NewsSeverity = 'urgent' | 'important' | 'info';

export interface NewsItemDto {
  id: string;
  destinationId: string | null;
  source: string;
  kind: NewsKind;
  severity: NewsSeverity;
  title: string;
  summary: string | null;
  url: string | null;
  publishedAt: string;
}

export interface RssItem {
  guid: string;
  title: string;
  link: string | null;
  description: string;
  pubDate: string | null;
  /** Other tags (e.g. gdacs:alertlevel, geo:lat) – lower-case names. */
  extra: Record<string, string>;
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#8217;|&#8216;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8211;|&#8212;/g, '–')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

export const stripHtml = (s: string) =>
  decode(decode(s))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Minimal, tolerant RSS 2.0 parser (no DOM in Workers). */
export function parseRss(xml: string, max = 60): RssItem[] {
  const out: RssItem[] = [];
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  for (const raw of items.slice(0, max)) {
    // Every element (also nested ones like <geo:Point><geo:lat>) – first occurrence wins.
    const tags: Record<string, string> = {};
    const inner = raw.replace(/^<item[^>]*>/i, '').replace(/<\/item>$/i, '');
    for (const m of inner.matchAll(/<([a-z][\w:.-]*)(?:\s[^>]*)?>/gi)) {
      const k = m[1].toLowerCase();
      if (k in tags) continue;
      const start = (m.index ?? 0) + m[0].length;
      const end = inner.toLowerCase().indexOf(`</${k}>`, start);
      if (end >= 0) tags[k] = inner.slice(start, end).trim();
    }
    const title = stripHtml(tags.title ?? '');
    if (!title) continue;
    const link = stripHtml(tags.link ?? '') || null;
    out.push({
      guid: stripHtml(tags.guid ?? '') || link || title,
      title,
      link,
      description: stripHtml(tags.description ?? '').slice(0, 1200),
      pubDate: tags.pubdate ? stripHtml(tags.pubdate) : null,
      extra: tags,
    });
  }
  return out;
}

/** Search terms per stop: its name plus well-known areas around it. */
const AREAS: Record<string, string[]> = {
  krabi: ['krabi', 'ao nang', 'aonang', 'railay', 'tonsai', 'phra nang', 'klong muang', 'hong island', 'poda'],
  lanta: ['koh lanta', 'ko lanta', 'lanta', 'saladan', 'koh rok', 'koh ha'],
  phuket: ['phuket', 'patong', 'kata', 'karon', 'kamala', 'rawai', 'chalong'],
  'chiang mai': ['chiang mai', 'chiangmai', 'nimman', 'doi suthep', 'doi inthanon', 'mae rim', 'san kamphaeng'],
  bangkok: ['bangkok', 'suvarnabhumi', 'don mueang', 'khao san', 'sukhumvit', 'silom', 'chao phraya'],
};

export function placeTerms(name: string): string[] {
  const n = name.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
  const key = Object.keys(AREAS).find((k) => n.includes(k));
  const base = n.replace(/^(koh|ko)\s+/, '');
  return [...new Set([n, ...(base.length >= 4 ? [base] : []), ...(key ? AREAS[key] : [])])];
}

const TOPICS: [NewsKind, RegExp][] = [
  ['weather', /\b(storm|flood|flooding|heavy rain|monsoon|landslide|typhoon|tropical (storm|depression)|tsunami|earthquake|haze|pm2\.?5|smog|air quality|wildfire|weather warning)\b/i],
  ['traffic', /\b(ferry|ferries|speedboat|longtail|pier|boat service|flight|flights|airport|airline|runway|road closure|road closed|traffic|train|railway|bus service|strike)\b/i],
  ['safety', /\b(scam|robbery|robbed|stabbing|shooting|police warn|tourists? (warned|injured|killed|attacked)|drown|drowning|rip current|jellyfish|dengue|outbreak|protest|curfew|crackdown|warning to tourists)\b/i],
  ['festival', /\b(festival|loy krathong|yi peng|lantern|songkran|night market|fair|celebration|parade|fireworks|concert)\b/i],
];
const NOISE = /\b(election|parliament|prime minister|minister|cabinet|court|verdict|celebrity|stock|shares|economy|gdp|investment|investor|football|boxing|muay thai fight|lottery|crypto|property market)\b/i;
const URGENT = /\b(cancel(l)?ed|cancel(l)?ation|suspend(ed)?|halt(ed)?|closed|closure|evacuat|warning|tsunami|flood|storm|landslide|earthquake|curfew)\b/i;

export interface Classified {
  kind: NewsKind;
  severity: NewsSeverity;
}

/** Topic and importance of a news headline; null when not travel-relevant. */
export function classifyNews(text: string): Classified | null {
  const topic = TOPICS.find(([, re]) => re.test(text))?.[0];
  if (!topic) return null;
  if (NOISE.test(text) && topic !== 'weather' && topic !== 'traffic') return null;
  if (topic === 'festival') return { kind: 'festival', severity: 'info' };
  if ((topic === 'weather' || topic === 'traffic') && URGENT.test(text)) return { kind: topic, severity: 'urgent' };
  return { kind: topic, severity: topic === 'safety' || topic === 'weather' ? 'important' : 'info' };
}

/** Which stop a text is about (first match), or null. */
export function matchStop<D extends { id: string; name: string }>(text: string, stops: readonly D[]): D | null {
  const t = ` ${text.toLowerCase()} `;
  return stops.find((d) => placeTerms(d.name).some((term) => new RegExp(`[^a-z]${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^a-z]`).test(t))) ?? null;
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export const SEVERITY_RANK: Record<NewsSeverity, number> = { urgent: 0, important: 1, info: 2 };

/** Items for one stop (plus country-wide ones), most important and newest first. */
export function newsFor<N extends Pick<NewsItemDto, 'destinationId' | 'severity' | 'publishedAt'>>(items: readonly N[], destinationId: string | null, sinceIso?: string): N[] {
  return items
    .filter((n) => (n.destinationId === null || n.destinationId === destinationId) && (!sinceIso || n.publishedAt >= sinceIso))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.publishedAt.localeCompare(a.publishedAt));
}
