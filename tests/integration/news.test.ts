import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AA_LIST, GDACS_RSS, refreshNews } from '../../worker/services/news';
import { createTestEnv, setupOwner, type TestEnv } from '../helpers/app';

let t: TestEnv;
const now = new Date('2026-11-19T03:00:00Z');

const feed = (items: string) => `<rss><channel>${items}</channel></rss>`;
const item = (guid: string, title: string, desc = '', date = 'Thu, 19 Nov 2026 07:00:00 +0700') =>
  `<item><title>${title}</title><link>https://news.example/${guid}</link><description>${desc}</description><pubDate>${date}</pubDate><guid>${guid}</guid></item>`;

function mockSources(opts: { aaModified?: number; warning?: boolean } = {}) {
  vi.stubGlobal('fetch', async (url: string) => {
    if (url === AA_LIST)
      return Response.json({ response: { contentList: ['199124'], '199124': { title: 'Thailand: Reise- und Sicherheitshinweise', countryCode: 'TH', lastModified: Math.floor((opts.aaModified ?? Date.parse('2026-11-15T10:00:00Z')) / 1000), warning: !!opts.warning } } });
    if (url === GDACS_RSS)
      return new Response(feed(`<item><title>Orange flood alert in Thailand</title><link>https://gdacs.example/1</link><guid>FL123</guid><pubDate>Wed, 18 Nov 2026 12:00:00 GMT</pubDate><gdacs:alertlevel>Orange</gdacs:alertlevel><gdacs:eventtype>FL</gdacs:eventtype><geo:Point><geo:lat>18.8</geo:lat><geo:long>98.9</geo:long></geo:Point></item>`));
    if (url.includes('bangkokpost'))
      return new Response(
        feed(
          item('n1', 'Ferry services from Ao Nang suspended due to storm', 'Boats to Railay halted.') +
            item('n2', 'Cabinet approves budget in Bangkok') +
            item('n3', 'Yi Peng lantern festival draws crowds to Chiang Mai') +
            item('n4', 'Old ferry news from Krabi', '', 'Mon, 02 Nov 2026 07:00:00 +0700'),
        ),
      );
    if (url.startsWith('https://web.push')) return new Response(null, { status: 201 });
    return new Response('nope', { status: 500 });
  });
}

beforeEach(() => {
  t = createTestEnv();
});
afterEach(() => vi.unstubAllGlobals());

describe('Lage vor Ort', () => {
  it('files relevant items per stop, drops noise and old items, and stays idempotent', async () => {
    const owner = await setupOwner(t);
    const tripId = (await owner.post('/imports/thailand-2026')).body.tripId;
    mockSources();
    expect(await refreshNews(t.env, now)).toBe(4);
    expect(await refreshNews(t.env, now)).toBe(0);
    const items = (await owner.get(`/trips/${tripId}/news`)).body.items as { title: string; destinationId: string | null; severity: string; kind: string; source: string }[];
    const dests = (await owner.get(`/trips/${tripId}/snapshot`)).body.destinations as { id: string; name: string }[];
    const nameOf = (id: string | null) => dests.find((d) => d.id === id)?.name ?? null;
    const byTitle = Object.fromEntries(items.map((i) => [i.title, i]));
    expect(byTitle['Ferry services from Ao Nang suspended due to storm']).toMatchObject({ severity: 'urgent', kind: 'weather', source: 'Bangkok Post' });
    expect(nameOf(byTitle['Ferry services from Ao Nang suspended due to storm'].destinationId)).toBe('Krabi');
    expect(byTitle['Yi Peng lantern festival draws crowds to Chiang Mai']).toMatchObject({ kind: 'festival', severity: 'info' });
    expect(byTitle['Orange flood alert in Thailand']).toMatchObject({ source: 'GDACS', severity: 'important' });
    expect(nameOf(byTitle['Orange flood alert in Thailand'].destinationId)).toBe('Chiang Mai');
    expect(byTitle['Reise- und Sicherheitshinweise Thailand aktualisiert']).toMatchObject({ destinationId: null, kind: 'advisory' });
    expect(items.some((i) => i.title.includes('Cabinet') || i.title.includes('Old ferry'))).toBe(false);
  });

  it('ignores an unchanged travel advice and survives a failing source', async () => {
    const owner = await setupOwner(t);
    const tripId = (await owner.post('/imports/thailand-2026')).body.tripId;
    mockSources({ aaModified: Date.parse('2026-09-01T00:00:00Z') });
    vi.stubGlobal('fetch', async (url: string) => (url === AA_LIST ? Response.json({ response: {} }) : new Response('down', { status: 503 })));
    expect(await refreshNews(t.env, now)).toBe(0);
    expect((await owner.get(`/trips/${tripId}/news`)).body.items).toEqual([]);
  });
});

describe('AI relevance check', () => {
  it('hides items the model calls irrelevant and does not offer them again', async () => {
    const owner = await setupOwner(t);
    const tripId = (await owner.post('/imports/thailand-2026')).body.tripId;
    mockSources();
    t.env.AI = { run: async (_m: string, input: { messages: { content: string }[] }) => ({ response: input.messages[1].content.includes('Ferry') ? 'Fähren ab Ao Nang wegen Sturm eingestellt.' : 'IRRELEVANT' }) } as unknown as Ai;
    await refreshNews(t.env, now);
    const items = (await owner.get(`/trips/${tripId}/news`)).body.items as { title: string; summary: string | null }[];
    expect(items.map((i) => i.title)).toContain('Ferry services from Ao Nang suspended due to storm');
    expect(items.find((i) => i.title.startsWith('Ferry'))?.summary).toBe('Fähren ab Ao Nang wegen Sturm eingestellt.');
    expect(items.some((i) => i.title.startsWith('Yi Peng'))).toBe(false);
    expect(await refreshNews(t.env, now)).toBe(0);
  });
});
