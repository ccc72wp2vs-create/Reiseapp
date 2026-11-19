import { describe, expect, it } from 'vitest';
import { classifyNews, matchStop, newsFor, parseRss, placeTerms } from '../../shared/news';

const rss = `<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[Ferry services from Ao Nang suspended due to storm]]></title><link>https://example.com/a</link>
<description><![CDATA[<p>Boats to Railay &amp; Phi Phi halted.</p>]]></description><pubDate>Wed, 18 Nov 2026 08:00:00 +0700</pubDate><guid>a1</guid></item>
<item><title>PM meets cabinet in Bangkok</title><link>https://example.com/b</link><description>Politics.</description><guid>b1</guid></item>
<item><title>Yi Peng lantern festival draws crowds to Chiang Mai</title><link>https://example.com/c</link><guid>c1</guid></item>
<item><gdacs:alertlevel>Orange</gdacs:alertlevel><title>Flood in Thailand</title><geo:Point><geo:lat>8.1</geo:lat><geo:long>98.9</geo:long></geo:Point><guid>g1</guid></item>
</channel></rss>`;

const stops = [
  { id: 'krabi', name: 'Krabi' },
  { id: 'cm', name: 'Chiang Mai' },
  { id: 'bkk', name: 'Bangkok (Don Mueang)' },
];

describe('local news', () => {
  it('parses RSS including CDATA, entities and namespaced tags', () => {
    const items = parseRss(rss);
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ guid: 'a1', title: 'Ferry services from Ao Nang suspended due to storm', link: 'https://example.com/a', description: 'Boats to Railay & Phi Phi halted.' });
    expect(items[3].extra['gdacs:alertlevel']).toBe('Orange');
    expect(items[3].extra['geo:lat']).toBe('8.1');
  });

  it('knows the areas around a stop', () => {
    expect(placeTerms('Krabi')).toEqual(expect.arrayContaining(['krabi', 'ao nang', 'railay']));
    expect(placeTerms('Koh Lanta')).toEqual(expect.arrayContaining(['koh lanta', 'lanta']));
    expect(matchStop('Ferry services from Ao Nang suspended', stops)?.id).toBe('krabi');
    expect(matchStop('Lantern festival in Chiang Mai', stops)?.id).toBe('cm');
    expect(matchStop('Nothing about our places', stops)).toBeNull();
  });

  it('keeps travel topics with a level and drops politics', () => {
    expect(classifyNews('Ferry services from Ao Nang suspended due to storm')).toEqual({ kind: 'weather', severity: 'urgent' });
    expect(classifyNews('New flights between Krabi and Chiang Mai')).toEqual({ kind: 'traffic', severity: 'info' });
    expect(classifyNews('Police warn tourists about jet ski scam in Phuket')).toEqual({ kind: 'safety', severity: 'important' });
    expect(classifyNews('Yi Peng lantern festival draws crowds')).toEqual({ kind: 'festival', severity: 'info' });
    expect(classifyNews('PM meets cabinet in Bangkok')).toBeNull();
    expect(classifyNews('Court verdict on protest leaders')).toBeNull();
  });

  it('lists a stop’s items plus country-wide ones, most important first', () => {
    const list = newsFor(
      [
        { destinationId: 'cm', severity: 'info' as const, publishedAt: '2026-11-18T10:00:00Z', id: 'x' },
        { destinationId: 'krabi', severity: 'info' as const, publishedAt: '2026-11-18T09:00:00Z', id: 'y' },
        { destinationId: 'krabi', severity: 'urgent' as const, publishedAt: '2026-11-17T09:00:00Z', id: 'z' },
        { destinationId: null, severity: 'important' as const, publishedAt: '2026-11-16T09:00:00Z', id: 'aa' },
      ],
      'krabi',
    );
    expect(list.map((n) => n.id)).toEqual(['z', 'aa', 'y']);
  });
});

describe('other destinations', () => {
  it('maps countries to ISO codes and picks the right travel advice', async () => {
    const { countryIso } = await import('../../shared/countries');
    const { aaCandidates } = await import('../../worker/services/news');
    expect(countryIso('Spanien')).toBe('ES');
    expect(countryIso('Bali')).toBe('ID');
    expect(countryIso('jp')).toBe('JP');
    expect(countryIso('Atlantis')).toBeNull();
    const json = { response: { '1': { countryCode: 'TH', countryName: 'Thailand', lastModified: 1_795_000_000 }, '2': { countryCode: 'ES', countryName: 'Spanien', lastModified: 1_795_000_000, partialWarning: true } } };
    const es = aaCandidates(json, 'ES', 1_795_000_000_000 + 3600_000);
    expect(es).toEqual([expect.objectContaining({ title: 'Reisewarnung für Spanien (Auswärtiges Amt)', severity: 'urgent' })]);
    expect(aaCandidates(json, 'TH', 1_795_000_000_000 + 30 * 86400_000)).toEqual([]);
  });
});

describe('stricter relevance', () => {
  it('drops court, business and cargo headlines even with travel words', () => {
    expect(classifyNews('Chinese director, Thai nominees jailed in SAO building collapse case')).toBeNull();
    expect(classifyNews('Customers dispute Thai Airways claim of cargo backlog clearance')).toBeNull();
    expect(classifyNews('Airline posts record profit as flights rebound')).toBeNull();
    // Hazards always pass.
    expect(classifyNews('Court orders evacuation as flood hits Chiang Mai')).toEqual({ kind: 'weather', severity: 'urgent' });
  });
});
