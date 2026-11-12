import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client, createTestEnv, setupOwner } from '../helpers/app';

const SAMPLE = {
  current: { time: '2026-11-13T07:30', temperature_2m: 28.6, apparent_temperature: 33.2, relative_humidity_2m: 81, wind_speed_10m: 9.4, weather_code: 61, is_day: 1 },
  daily: {
    time: ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16'],
    weather_code: [61, 2, 95, 0],
    temperature_2m_max: [31.4, 32, 30.6, 33.1],
    temperature_2m_min: [24.2, 25, 24.4, 25.5],
    precipitation_probability_max: [70, 20, 85, 5],
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('weather proxy', () => {
  it('returns mapped Open-Meteo data with rounded coordinates', async () => {
    const t = createTestEnv();
    const c = await setupOwner(t);
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify(SAMPLE), { headers: { 'Content-Type': 'application/json' } });
    });
    const r = await c.get('/weather?lat=7.6234&lng=99.0512&tz=Asia/Bangkok');
    expect(r.status).toBe(200);
    expect(r.body.weather).toMatchObject({ temperatureC: 29, apparentC: 33, humidity: 81, weatherCode: 61, isDay: true, source: 'open-meteo' });
    expect(r.body.weather.days).toHaveLength(4);
    expect(r.body.weather.days[2]).toMatchObject({ weatherCode: 95, maxC: 31, minC: 24, rainProbability: 85 });
    expect(calls[0]).toContain('latitude=7.62');
    expect(calls[0]).toContain('longitude=99.05');
    expect(calls[0]).toContain('timezone=Asia%2FBangkok');
  });

  it('validates input, requires login and reports provider errors', async () => {
    const t = createTestEnv();
    const c = await setupOwner(t);
    expect((await new Client(t).get('/weather?lat=1&lng=1&tz=UTC')).status).toBe(401);
    expect((await c.get('/weather?lat=999&lng=1&tz=UTC')).status).toBe(422);
    expect((await c.get('/weather?lat=1&lng=1&tz=Mars/Base')).status).toBe(422);
    vi.stubGlobal('fetch', async () => new Response('down', { status: 503 }));
    const r = await c.get('/weather?lat=1&lng=1&tz=UTC');
    expect(r.status).toBe(500);
    expect(r.body.error.message).toMatch(/Wetterdienst/);
  });
});
