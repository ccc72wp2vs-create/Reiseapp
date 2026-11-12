import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const EMAIL = 'e2e@example.com';
const PASSWORD = 'e2e-sehr-sicheres-passwort';
const SETUP_TOKEN = /SETUP_TOKEN=(.+)/.exec(readFileSync('.dev.vars', 'utf8'))![1].trim();

/** "Today" = 12.11.2026, 10:00 in Thailand (day 7, in Phuket). */
async function freezeClock(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-12T03:00:00Z'));
}

async function login(page: Page) {
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
}

async function ensureThailand(page: Page) {
  const importBtn = page.getByRole('button', { name: /Thailand 2026.*importieren/ });
  await expect(importBtn.or(page.getByRole('link', { name: /Thailand 2026/ }))).toBeVisible();
  if (await importBtn.isVisible()) await importBtn.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Phuket' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
  await login(page);
  await ensureThailand(page);
});

test('dashboard shows the current trip state and transfer reminder', async ({ page }) => {
  await expect(page.getByText('Tag 7 von 21')).toBeVisible();
  await expect(page.getByText('Transfer Phuket → Koh Lanta noch nicht bestätigt.')).toBeVisible();
  await expect(page.getByText('Transfer Koh Lanta → Krabi noch nicht bestätigt.')).toBeVisible();
  // Booked costs are not shown as spent money
  await expect(page.getByText('3.831,00 €').first()).toBeVisible();
  await expect(page.getByText('0,00 €').first()).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
  for (const label of ['Start', 'Plan', 'Entdecken', 'Kasse', 'Mehr']) await expect(nav.getByRole('link', { name: label })).toBeVisible();
});

test('bookings keep booked, paid, planned and unclear amounts apart', async ({ page }) => {
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Mehr' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mehr' })).toBeVisible();
  await page.getByRole('link', { name: /^Buchungen/ }).click();
  await expect(page.getByRole('heading', { name: 'Buchungen' })).toBeVisible();
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
  await page.getByRole('button', { name: 'Ausgabe erfassen' }).first().click();
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
