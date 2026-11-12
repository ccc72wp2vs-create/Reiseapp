/**
 * Weather via Open-Meteo (https://open-meteo.com, free for non-commercial use,
 * CC BY 4.0, no API key). Requests go through the worker so travelers' devices
 * do not contact third parties directly; coordinates are rounded to ~1 km and
 * responses are cached for 30 minutes.
 */
import type { WeatherDto } from '../../shared/types';
import { ApiError } from '../lib/errors';

const TTL_SECONDS = 1800;

interface OpenMeteoResponse {
  current?: {
    time: string;
    temperature_2m: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    weather_code: number;
    is_day?: number;
  };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max?: (number | null)[];
  };
}

export function weatherUrl(lat: number, lng: number, timezone: string): string {
  const p = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lng.toFixed(2),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone,
    forecast_days: '4',
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

export function mapOpenMeteo(data: OpenMeteoResponse, fetchedAt: string): WeatherDto {
  const c = data.current;
  const d = data.daily;
  if (!c || !d) throw new ApiError('internal_error', 'Wetterdaten unvollständig');
  return {
    time: c.time,
    temperatureC: Math.round(c.temperature_2m),
    apparentC: c.apparent_temperature == null ? null : Math.round(c.apparent_temperature),
    humidity: c.relative_humidity_2m ?? null,
    windKmh: c.wind_speed_10m == null ? null : Math.round(c.wind_speed_10m),
    weatherCode: c.weather_code,
    isDay: c.is_day !== 0,
    days: d.time.map((date, i) => ({
      date,
      weatherCode: d.weather_code[i],
      maxC: Math.round(d.temperature_2m_max[i]),
      minC: Math.round(d.temperature_2m_min[i]),
      rainProbability: d.precipitation_probability_max?.[i] ?? null,
    })),
    fetchedAt,
    source: 'open-meteo',
  };
}

export async function getWeather(lat: number, lng: number, timezone: string): Promise<WeatherDto> {
  const url = weatherUrl(lat, lng, timezone);
  const cache = typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined;
  const cached = await cache?.match(url);
  if (cached) return (await cached.json()) as WeatherDto;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new ApiError('internal_error', 'Wetterdienst nicht erreichbar');
  }
  if (!res.ok) throw new ApiError('internal_error', 'Wetterdienst nicht erreichbar');
  const dto = mapOpenMeteo((await res.json()) as OpenMeteoResponse, new Date().toISOString());
  await cache?.put(url, new Response(JSON.stringify(dto), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${TTL_SECONDS}` } }));
  return dto;
}
