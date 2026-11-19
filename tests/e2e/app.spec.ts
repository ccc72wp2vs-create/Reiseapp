import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const EMAIL = 'e2e@example.com';
const PASSWORD = 'e2e-sehr-sicheres-passwort';
const SETUP_TOKEN = /SETUP_TOKEN=(.+)/.exec(readFileSync('.dev.vars', 'utf8'))![1].trim();

/** "Today" = 12.11.2026, 10:00 in Thailand (day 7, in Phuket). */
async function freezeClock(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-12T03:00:00Z'));
}

/**
 * The session cookie is reused across tests: the server allows only 30
 * logins per IP and 15 minutes (brute-force protection), the suite has more tests.
 */
let session: Awaited<ReturnType<BrowserContext['cookies']>> | null = null;

async function login(page: Page) {
  if (session) await page.context().addCookies(session);
  await page.goto('/');
  // Wait until the app decided where to go (setup, login or the dashboard).
  await page.locator('h1').first().waitFor();
  if (page.url().includes('einrichtung')) {
    await page.getByLabel('Einrichtungs-Code').fill(SETUP_TOKEN);
    await page.getByLabel('Anzeigename').fill('E2E');
    await page.getByLabel('E-Mail').fill(EMAIL);
    await page.getByLabel('Passwort').fill(PASSWORD);
    await page.getByRole('button', { name: 'Konto erstellen' }).click();
  } else if (page.url().includes('anmelden')) {
    await page.getByLabel('E-Mail').fill(EMAIL);
    await page.getByLabel('Passwort').fill(PASSWORD);
    await page.getByRole('button', { name: 'Anmelden' }).click();
  }
  await page.waitForURL((u) => u.pathname === '/');
  session = await page.context().cookies();
}

async function ensureThailand(page: Page) {
  const importBtn = page.getByRole('button', { name: /Thailand 2026.*importieren/ });
  await expect(importBtn.or(page.getByRole('link', { name: /Thailand 2026/ }))).toBeVisible();
  if (await importBtn.isVisible()) await importBtn.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Phuket' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  // The "Neu in TRAVIO" sheet would cover the screens – only its own test shows it.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-whatsnew')) localStorage.setItem('travio.seenVersion', '999.0.0');
  });
  await freezeClock(page);
  await login(page);
  await ensureThailand(page);
});

test('dashboard shows the current trip state and transfer reminder', async ({ page }) => {
  await expect(page.getByText('Tag 7 von 21')).toBeVisible();
  // Tomorrow is a travel day: the travel-day card replaces the reminder for that leg.
  const td = page.getByRole('region', { name: 'Morgen ist Reisetag' });
  await expect(td).toBeVisible();
  await expect(td.getByText('Transport noch nicht bestätigt')).toBeVisible();
  // One tap on a step opens exactly that booking.
  await td.getByRole('link', { name: /^Abfahrt\s/ }).click();
  await expect(page).toHaveURL(/\/buchungen/);
  await expect(page.getByRole('dialog')).toBeVisible();
  // "Uhrzeit offen" jumps straight into the time field.
  await expect(page.locator('[data-field="startTime"]')).toBeFocused();
  await page.goto('/');
  await expect(page.getByText('Transfer Koh Lanta → Krabi noch nicht bestätigt.')).toBeVisible();
  // Booked costs are not shown as spent money (costs section starts collapsed: one line)
  const costs = page.getByRole('button', { name: /Reisekosten/ });
  await expect(costs).toContainText(/€ ausgegeben/);
  await costs.click();
  await expect(page.getByText('3.831,00 €').first()).toBeVisible();
  await expect(page.getByText('0,00 €').first()).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
  for (const label of ['Start', 'Plan', 'Kasse', 'Mehr']) await expect(nav.getByRole('link', { name: label })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Hinzufügen' })).toBeVisible();
});

test('bookings keep booked, paid, planned and unclear amounts apart', async ({ page }) => {
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Mehr' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mehr' })).toBeVisible();
  await page.getByRole('link', { name: /^Buchungen/ }).click();
  await expect(page.getByRole('heading', { name: 'Buchungen' })).toBeVisible();
  await page.getByRole('radio', { name: 'Ganze Reise' }).click();
  await expect(page.getByText('Fähre oder Speedboat – Transportmittel und Buchung noch offen.')).toBeVisible();
  await expect(page.getByText('≈ 80,00 €')).toBeVisible();
  await expect(page.getByText('≤ 60,00 €').first()).toBeVisible();
  await expect(page.getByText('Ursprüngliche Einzelpreisangabe: 180,00 €')).toBeVisible();
  await expect(page.getByText('37,50 € pro Person')).toBeVisible();
  await expect(page.getByText('Personenbezug unklar – keine automatische Aufteilung.').first()).toBeVisible();
});

test('itinerary: add, complete and reorder activities on a phone', async ({ page }, info) => {
  const tag = info.project.name;
  await page.goto('/plan?tag=2026-11-15');
  for (const title of [`A-${tag}`, `B-${tag}`]) {
    await page.getByRole('button', { name: 'Aktivität hinzufügen' }).first().click();
    await page.getByLabel('Titel').fill(title);
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText(title)).toBeVisible();
  }
  const items = page.locator('main li').filter({ hasText: new RegExp(`(A|B)-${tag}`) });
  await expect(items).toHaveCount(2);
  // Move B up via the accessible fallback button
  await items.filter({ hasText: `B-${tag}` }).getByRole('button', { name: 'Nach oben' }).click();
  await expect(items.first()).toContainText(`B-${tag}`);
  await items.filter({ hasText: `A-${tag}` }).getByRole('button', { name: 'Als erledigt markieren' }).click();
  await expect(items.filter({ hasText: `A-${tag}` }).getByRole('button', { name: 'Als offen markieren' })).toBeVisible();
  // Persisted on the server
  await page.reload();
  await expect(page.getByText(`B-${tag}`)).toBeVisible();
});

test('offline editing is queued and synchronised', async ({ page, context }, info) => {
  const title = `Offline-${info.project.name}`;
  await page.goto('/plan?tag=2026-11-16');
  await expect(page.getByRole('heading', { name: /16. November/ })).toBeVisible();
  // The app shell must be cached by the service worker before going offline.
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30_000 });
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.getByRole('button', { name: 'Aktivität hinzufügen' }).first().click();
  await page.getByLabel('Titel').fill(title);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText(title)).toBeVisible();
  await expect(page.getByText(/Offline – 1 Änderung wartet/)).toBeVisible();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText(/Änderung(en)? wart/)).toHaveCount(0, { timeout: 15_000 });
  await page.reload();
  await expect(page.getByText(title)).toBeVisible();
});

test('wallet: equal split expense updates balances', async ({ page }, info) => {
  await page.goto('/kasse');
  await page.getByRole('button', { name: 'Hinzufügen' }).click();
  await page.getByRole('button', { name: /^Ausgabe erfassen/ }).click();
  await page.getByLabel('Wofür?').fill(`Abendessen ${info.project.name}`);
  await page.getByLabel('Betrag').fill('40');
  await page.getByLabel('Währung').selectOption('EUR');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText(`Abendessen ${info.project.name}`)).toBeVisible();
  await page.getByRole('radio', { name: 'Salden' }).click();
  await expect(page.getByText('So wird ausgeglichen', { exact: false })).toBeVisible();
  await expect(page.getByText(/Reisende:r 2/).first()).toBeVisible();
});

test('route view and no horizontal overflow on key screens', async ({ page }) => {
  for (const path of ['/', '/plan', '/entdecken', '/kasse', '/buchungen', '/route', '/mehr', '/reise', '/packliste']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await page.goto('/route');
  for (const stop of ['Düsseldorf', 'Bangkok', 'Phuket', 'Koh Lanta', 'Krabi', 'Chiang Mai', 'Bangkok (Don Mueang)']) {
    await expect(page.getByText(stop, { exact: true }).first()).toBeVisible();
  }
});

test('PWA assets are served', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const p of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png', '/sw.js']) {
    expect((await request.get(p)).status(), p).toBe(200);
  }
});

test('check-in reminder: ask for departure time, open the airline link, mark as done', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone', 'changes shared data – run once');
  // 20.11.2026, 17:00 in Thailand – the flight Krabi → Chiang Mai is tomorrow.
  await page.clock.setFixedTime(new Date('2026-11-20T10:00:00Z'));
  await page.goto('/');
  await page.getByRole('link', { name: /Flug Krabi → Chiang Mai morgen: Abflugzeit fehlt/ }).click();
  await page.getByLabel('Uhrzeit').first().fill('12:00');
  await page.getByLabel('Flugnummer').fill('pg271');
  await expect(page.getByText('Bangkok Airways · Online-Check-in ab 24 Std. vor Abflug.')).toBeVisible();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await page.goto('/');
  await expect(page.getByText('Online-Check-in geöffnet: Flug Krabi → Chiang Mai (PG 271)')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Zum Check-in' })).toHaveAttribute('href', 'https://www.bangkokair.com/flight/check-in');
  await page.getByRole('button', { name: 'Erledigt' }).click();
  await expect(page.getByText('Check-in als erledigt markiert')).toBeVisible();
  await expect(page.getByText(/Online-Check-in geöffnet/)).toHaveCount(0);
});

test('Frag TRAVIO: answers from trip data and adds a confirmed day plan via the existing plan', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone', 'changes shared data – run once');
  await page.goto('/');
  await page.getByRole('button', { name: 'Frag TRAVIO' }).click();
  await expect(page.getByText('Wie kann ich dir bei deiner Reise helfen?')).toBeVisible();

  // Without Workers AI (local e2e) the answer comes straight from the app data.
  await page.getByRole('button', { name: 'Reisekasse prüfen' }).click();
  await expect(page.getByText(/ausgegeben/).first()).toBeVisible();
  await expect(page.getByText('Direkt aus euren Reisedaten (ohne KI).')).toBeVisible();
  await expect(page.getByRole('link', { name: /Zur Reisekasse/ })).toBeVisible();

  // Simulate a model day plan; adding it must use the normal itinerary.
  await page.route('**/api/v1/trips/*/assistant', (route) =>
    route.fulfill({
      json: {
        answer: 'Hier ist ein Vorschlag für morgen.',
        ai: true,
        remaining: 40,
        cards: [],
        proposal: {
          kind: 'add_activities',
          date: '2026-11-13',
          alternatives: [{ title: 'Bei Regen: Kochkurs', description: 'Drinnen.' }],
          items: [
            { title: 'Frühstück am Meer', startTime: '09:00', endTime: '10:00', category: 'restaurant', locationName: null, description: 'Ruhiger Start.', placeId: null, source: 'idea', conflict: null, duplicate: false },
            { title: 'Sonnenuntergang', startTime: '18:00', endTime: null, category: 'nature', locationName: 'Promthep Cape', description: null, placeId: null, source: 'idea', conflict: 'Überschneidet sich mit „Abendessen“', duplicate: false },
            { title: 'Doppelt', startTime: '12:00', endTime: null, category: 'other', locationName: null, description: null, placeId: null, source: 'idea', conflict: null, duplicate: true },
          ],
        },
      },
    }),
  );
  await page.getByLabel('Frage an TRAVIO').fill('Plane uns morgen einen schönen Tag');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('Freitag, 13. November')).toBeVisible();
  await expect(page.getByText('Überschneidet sich mit „Abendessen“')).toBeVisible();
  await page.getByRole('button', { name: '2 zum Reiseplan hinzufügen' }).click();
  await expect(page.getByText('2 Programmpunkte hinzugefügt')).toBeVisible();
  await page.getByRole('link', { name: /Im Reiseplan ansehen/ }).click();
  await expect(page).toHaveURL(/\/plan\?tag=2026-11-13/);
  await expect(page.getByText('Frühstück am Meer')).toBeVisible();
  await expect(page.getByText('Sonnenuntergang')).toBeVisible();
  await expect(page.getByText('Doppelt')).toHaveCount(0);
});

test('Entdecken: Google nearby search with real travel times; saving keeps only the place ID', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone', 'changes shared data – run once');
  const placeId = 'ChIJtestPlace0001';
  await page.route('**/api/v1/trips/*/maps/config', (r) => r.fulfill({ json: { enabled: true, provider: 'google', browserKey: 'browser-test', routing: true } }));
  await page.route('**/api/v1/trips/*/google/ui-loads', (r) => r.fulfill({ json: { ok: true } }));
  await page.route('https://maps.googleapis.com/**', (r) => r.abort());
  let nearbyBody: Record<string, unknown> | null = null;
  await page.route('**/api/v1/trips/*/maps/nearby', (r) => {
    nearbyBody = r.request().postDataJSON();
    return r.fulfill({
      json: {
        provider: 'google',
        origin: { label: 'Ortsmitte Phuket', lat: 7.88, lng: 98.39 },
        mode: 'DRIVE',
        routing: 'ok',
        filteredOut: 3,
        results: [{ placeId, durationSec: 840, distanceMeters: 6100, noRoute: false }],
      },
    });
  });
  await page.goto('/entdecken');
  await page.getByRole('radio', { name: 'In der Nähe' }).click();
  await page.getByRole('button', { name: 'Restaurants' }).click();
  await page.getByRole('button', { name: '≤ 20 Min.' }).click();
  await expect(page.getByText('14 Min. · 6,1 km')).toBeVisible();
  await expect(page.getByText('3 weitere Orte liegen über 20 Min. entfernt.')).toBeVisible();
  await expect(page.getByText('Routendaten: Google Maps', { exact: false })).toBeVisible();
  expect(nearbyBody).toMatchObject({ category: 'restaurant', maxMinutes: 20, mode: 'DRIVE' });
  await expect(page.getByRole('link', { name: 'Route' })).toHaveAttribute('href', /destination_place_id=ChIJtestPlace0001/);
  // Google script blocked here → honest message instead of invented content.
  await expect(page.getByText('Google-Ortsinfos konnten nicht geladen werden. Bitte später erneut versuchen.')).toBeVisible();

  await page.getByRole('button', { name: 'Merken' }).click();
  await page.getByLabel('Name').fill('Unser Thai-Lokal');
  await page.getByRole('button', { name: 'Merken' }).last().click();
  await expect(page.getByText('Gemerkt – unter „Eure Orte“')).toBeVisible();
  await page.getByRole('radio', { name: 'Eure Orte' }).click();
  await page.getByRole('button', { name: /Ganze Route/ }).click();
  await expect(page.getByRole('heading', { name: 'Unser Thai-Lokal' })).toBeVisible();
});

test('Entdecken: OpenStreetMap places via Geoapify – one tap to save, reviews via Google Maps link', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone', 'changes shared data – run once');
  await page.route('**/api/v1/trips/*/maps/config', (r) => r.fulfill({ json: { enabled: true, provider: 'geoapify', browserKey: null, routing: true } }));
  await page.route('**/api/v1/trips/*/maps/nearby', (r) =>
    r.fulfill({
      json: {
        provider: 'geoapify',
        origin: { label: 'Ortsmitte Phuket', lat: 7.88, lng: 98.39 },
        mode: 'DRIVE',
        routing: 'ok',
        filteredOut: 0,
        results: [
          {
            placeId: 'osm:abc',
            durationSec: 600,
            distanceMeters: 4200,
            noRoute: false,
            place: { id: 'abc', name: 'Krua Phuket', address: 'Rawai, Phuket', lat: 7.78, lng: 98.32, categoryLabel: 'Restaurant', openingHours: 'Mo-Su 11:00-22:00', website: 'https://example.com', cuisine: 'thai' },
          },
        ],
      },
    }),
  );
  await page.goto('/entdecken');
  await page.getByRole('radio', { name: 'In der Nähe' }).click();
  await page.getByRole('button', { name: 'Restaurants' }).click();
  await expect(page.getByRole('heading', { name: 'Krua Phuket' })).toBeVisible();
  await expect(page.getByText('10 Min. · 4,2 km')).toBeVisible();
  await expect(page.getByText('Mo-Su 11:00-22:00')).toBeVisible();
  await expect(page.getByRole('link', { name: 'OpenStreetMap-Mitwirkende' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Bewertungen bei Google/ })).toHaveAttribute('href', /query=Krua%20Phuket%2C%20Rawai%2C%20Phuket/);
  await page.getByRole('button', { name: 'Merken' }).click();
  await expect(page.getByText('Gemerkt – unter „Eure Orte“')).toBeVisible();
  await page.getByRole('radio', { name: 'Eure Orte' }).click();
  await expect(page.getByRole('heading', { name: 'Krua Phuket' })).toBeVisible();
});

test('Entdecken without a search provider offers Google Maps links (no key, no cost)', async ({ page }) => {
  await page.goto('/entdecken');
  await expect(page.getByText(/In Google Maps entdecken · /)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Restaurants' })).toHaveAttribute('href', /google\.com\/maps\/search\/\?api=1&query=Restaurants/);
});

test('bookings: filter by time, kind and open items; grouped by day', async ({ page }) => {
  await page.goto('/buchungen');
  await expect(page.getByRole('radio', { name: /Bevorstehend/ })).toBeChecked();
  await page.getByRole('button', { name: /^Unterkünfte/ }).click();
  await expect(page.getByText('Unterkunft Krabi', { exact: true })).toBeVisible();
  await expect(page.getByText('Flug Krabi → Chiang Mai', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Läuft gerade')).toBeVisible();
  await page.getByRole('radio', { name: /Vergangen/ }).click();
  await page.getByRole('button', { name: /^Alle \(/ }).click();
  await expect(page.getByText('Hinflug Düsseldorf → Bangkok', { exact: true })).toBeVisible();
  await expect(page.getByText('Unterkunft Krabi', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /^Offen/ }).click();
  await expect(page.getByRole('button', { name: /^Offen/ })).toHaveAttribute('aria-pressed', 'true');
});

test('booking import from pasted e-mail text (analysed, not stored)', async ({ page }) => {
  await page.goto('/buchungen');
  await page.getByRole('button', { name: 'Dokument importieren' }).click();
  await expect(page.getByText('Dokumente und E-Mail-Texte werden nur zur Analyse verwendet')).toBeVisible();
  await page.getByRole('button', { name: 'E-Mail-Text einfügen' }).click();
  await page.getByLabel('Text der Bestätigung').fill('Buchungsnummer: R8E7NL\nFlug FD3073 Krabi - Chiang Mai\nAbflug: 21.11.2026 15:00\nGesamtbetrag: 154,74 EUR bezahlt');
  await page.getByRole('button', { name: 'Angaben erkennen' }).click();
  await expect(page.getByText('Nr. R8E7NL')).toBeVisible();
  await expect(page.getByText('154,74 €')).toBeVisible();
});

test('paid booking goes straight into the wallet; price change updates the expense', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone', 'changes shared data – run once');
  await page.goto('/buchungen');
  await page.getByRole('button', { name: 'Hinzufügen' }).click();
  await page.getByRole('button', { name: /^Buchung hinzufügen/ }).click();
  await page.getByLabel('Titel').fill('Kochkurs Krabi');
  await page.getByLabel('Art', { exact: true }).selectOption('activity');
  await page.getByLabel('Gesamtbetrag').fill('100');
  await page.getByLabel('Buchungsstatus').selectOption('booked');
  await page.getByLabel('Zahlungsstatus').selectOption('paid');
  await expect(page.getByText('In die Reisekasse übernehmen')).toBeVisible();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Gespeichert und in die Reisekasse übernommen')).toBeVisible();

  await page.getByRole('radio', { name: 'Ganze Reise' }).click();
  await page.getByText('Kochkurs Krabi', { exact: true }).click();
  await page.getByLabel('Gesamtbetrag').fill('120');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Reisekasse anpassen?')).toBeVisible();
  await page.getByRole('button', { name: 'Ausgabe anpassen' }).click();
  await expect(page.getByText('Ausgabe in der Reisekasse angepasst')).toBeVisible();
});

test('home hero: tap through the stops and back to today', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Phuket' })).toBeVisible();
  await page.getByRole('button', { name: 'Krabi anzeigen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Krabi' })).toBeVisible();
  await expect(page.getByText(/Station 4 von \d+ · in 6 Tagen/)).toBeVisible();
  await expect(page.getByText('18.11. – 21.11.', { exact: true })).toBeVisible();
  await expect(page.getByText('3 Nächte', { exact: true })).toBeVisible();
  // The whole home screen follows the stop: plan, stay, arrival, onward travel, costs – no currency converter.
  await expect(page.getByText('In Krabi geplant')).toBeVisible();
  await expect(page.getByText('Anreise', { exact: true })).toBeVisible();
  await expect(page.getByText('Weiterreise', { exact: true })).toBeVisible();
  await expect(page.getByText('Kosten in Krabi')).toBeVisible();
  await expect(page.getByText('Währungsrechner')).toHaveCount(0);
  await page.getByRole('button', { name: 'Heute' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Phuket' })).toBeVisible();
  await expect(page.getByText('In Krabi geplant')).toHaveCount(0);
});

test('receipt split: assign lines to people, tip on everyone, saved as one expense', async ({ page }, info) => {
  test.skip(info.project.name === 'iphone-se', 'changes shared data');
  await page.goto('/kasse');
  await page.getByRole('button', { name: 'Beleg aufteilen' }).click();
  await page.getByRole('button', { name: /Ohne Foto/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Lokal / Laden').fill('E2E Strandbar');
  await sheet.getByLabel('Position').first().fill('Bier');
  await sheet.getByLabel('Betrag').first().fill('100');
  await sheet.getByRole('button', { name: 'E2E', exact: true }).first().click();
  await sheet.getByRole('button', { name: 'Position hinzufügen' }).click();
  await sheet.getByLabel('Position').nth(1).fill('Pommes');
  await sheet.getByLabel('Betrag').nth(1).fill('200');
  await sheet.getByLabel(/Trinkgeld/).fill('40');
  await sheet.getByLabel(/^Kurs/).fill('0,026');
  await expect(sheet.getByText('Summe')).toBeVisible();
  await expect(sheet.getByText('340,00 ฿').first()).toBeVisible();
  await sheet.getByRole('button', { name: 'Als Ausgabe speichern' }).click();
  await page.getByRole('radio', { name: 'Verlauf' }).click();
  await expect(page.getByText('E2E Strandbar')).toBeVisible();
});

test('plus: expense typed as a sentence opens the prefilled form', async ({ page }, info) => {
  test.skip(info.project.name === 'iphone-se', 'changes shared data');
  await page.goto('/kasse');
  await page.getByRole('button', { name: 'Hinzufügen' }).click();
  await page.getByLabel('Ausgabe als Satz').fill('Satztaxi 45 Euro, Reisende:r 2 hat bezahlt, für alle');
  await page.getByRole('button', { name: 'Ausgabe vorbereiten' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByLabel('Betrag')).toHaveValue(/45/);
  await sheet.getByRole('button', { name: 'Speichern' }).click();
  await page.getByRole('radio', { name: 'Verlauf' }).click();
  await expect(page.getByText('Satztaxi')).toBeVisible();
});

test('after an update "Neu in TRAVIO" appears once', async ({ page }) => {
  await page.evaluate(() => {
    sessionStorage.setItem('e2e-whatsnew', '1');
    localStorage.setItem('travio.seenVersion', '2.11.0');
  });
  await page.reload();
  const sheet = page.getByRole('dialog', { name: 'Neu in TRAVIO' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Ein „+“ für alles')).toBeVisible();
  await sheet.getByRole('button', { name: 'Alles klar' }).click();
  await expect(sheet).toBeHidden();
  await page.reload();
  await page.waitForTimeout(1200);
  await expect(page.getByRole('dialog', { name: 'Neu in TRAVIO' })).toHaveCount(0);
});

test('Lage vor Ort: hint, list and festival idea from the news', async ({ page }) => {
  const now = new Date('2026-11-12T08:00:00+07:00').toISOString();
  await page.route('**/api/v1/trips/*/news', async (route) => {
    const snap = await (await page.request.get(route.request().url().replace('/news', '/snapshot'))).json();
    const phuket = snap.destinations.find((d: { name: string }) => d.name === 'Phuket');
    const lanta = snap.destinations.find((d: { name: string }) => d.name === 'Koh Lanta');
    await route.fulfill({
      json: {
        items: [
          { id: 'n1', destinationId: phuket.id, source: 'Bangkok Post', kind: 'weather', severity: 'urgent', title: 'Ferries from Rassada pier suspended', summary: 'Fähren ab dem Rassada-Pier wegen Sturm eingestellt.', url: 'https://news.example/1', publishedAt: now },
          { id: 'n2', destinationId: lanta.id, source: 'The Thaiger', kind: 'festival', severity: 'info', title: 'Lanta Lanta festival', summary: 'Laternenfest auf Koh Lanta am Wochenende.', url: 'https://news.example/2', publishedAt: now },
        ],
      },
    });
  });
  await page.goto('/');
  await page.getByText('Fähren ab dem Rassada-Pier wegen Sturm eingestellt.').first().click();
  const sheet = page.getByRole('dialog', { name: 'Lage vor Ort' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Dringend · Phuket')).toBeVisible();
  await sheet.getByRole('button', { name: 'Alle Stationen zeigen' }).click();
  await expect(sheet.getByText('Laternenfest auf Koh Lanta am Wochenende.')).toBeVisible();
});
