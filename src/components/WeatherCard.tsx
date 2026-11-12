/**
 * Weather for the current destination (Open-Meteo via the TRAVIO worker).
 * The last result is kept on the device so it stays visible offline – always
 * labelled with its timestamp, never presented as live data.
 */
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun, Droplets, Moon, Snowflake, Sun, Wind } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { WeatherDto } from '../../shared/types';
import { t } from '../i18n';
import { http } from '../lib/api';
import { formatWeekday } from '../lib/format';
import { idb } from '../lib/idb';
import { useOnline } from '../lib/store';
import { Card, Skeleton, cx } from './ui';

/** WMO weather interpretation codes → label & icon. */
export function describeWeather(code: number, isDay = true): { label: string; Icon: typeof Sun } {
  if (code === 0) return { label: t.weather.codes.clear, Icon: isDay ? Sun : Moon };
  if (code <= 2) return { label: t.weather.codes.partly, Icon: CloudSun };
  if (code === 3) return { label: t.weather.codes.cloudy, Icon: Cloud };
  if (code === 45 || code === 48) return { label: t.weather.codes.fog, Icon: CloudFog };
  if (code >= 51 && code <= 57) return { label: t.weather.codes.drizzle, Icon: CloudDrizzle };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: code >= 80 ? t.weather.codes.showers : t.weather.codes.rain, Icon: CloudRain };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: t.weather.codes.snow, Icon: Snowflake };
  if (code >= 95) return { label: t.weather.codes.thunder, Icon: CloudLightning };
  return { label: t.weather.codes.cloudy, Icon: Cloud };
}

export function WeatherCard({ lat, lng, timezone, place }: { lat: number; lng: number; timezone: string; place: string }) {
  const online = useOnline();
  const key = `weather:${lat.toFixed(2)},${lng.toFixed(2)}`;
  const [weather, setWeather] = useState<WeatherDto | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void idb.get<WeatherDto>('meta', key).then((cached) => {
      if (!cancelled && cached) setWeather((w) => w ?? cached);
    });
    if (online) {
      http
        .get<{ weather: WeatherDto }>(`/weather?lat=${lat}&lng=${lng}&tz=${encodeURIComponent(timezone)}`)
        .then(({ weather }) => {
          if (cancelled) return;
          setWeather(weather);
          setFailed(false);
          void idb.put('meta', weather, key);
        })
        .catch(() => !cancelled && setFailed(true));
    }
    return () => {
      cancelled = true;
    };
  }, [key, lat, lng, timezone, online]);

  if (!weather) {
    if (failed || !online) return null; // nothing reliable to show
    return <Skeleton className="h-[148px] w-full" />;
  }

  const now = describeWeather(weather.weatherCode, weather.isDay);
  const today = weather.days[0];
  const fetched = new Date(weather.fetchedAt);
  const stale = Date.now() - fetched.getTime() > 3 * 3600_000;
  const stand = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(fetched);

  return (
    <Card className="overflow-hidden p-5">
      <div className="flex items-start gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
          <now.Icon size={30} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-text-3">{t.weather.title(place)}</p>
          <p className="mt-0.5 flex items-baseline gap-2">
            <span className="font-display text-[34px] font-semibold leading-none tabular">{weather.temperatureC}°</span>
            <span className="truncate text-[15px] text-text-2">{now.label}</span>
          </p>
          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-text-3">
            {weather.apparentC != null && <span>{t.weather.feelsLike(weather.apparentC)}</span>}
            {today && (
              <span>
                ↑ {today.maxC}° ↓ {today.minC}°
              </span>
            )}
            {today?.rainProbability != null && (
              <span className="inline-flex items-center gap-1">
                <Droplets size={13} /> {today.rainProbability} %
              </span>
            )}
            {weather.windKmh != null && (
              <span className="inline-flex items-center gap-1">
                <Wind size={13} /> {weather.windKmh} km/h
              </span>
            )}
          </p>
        </div>
      </div>
      {weather.days.length > 1 && (
        <ul className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3">
          {weather.days.slice(1, 4).map((d) => {
            const w = describeWeather(d.weatherCode);
            return (
              <li key={d.date} className="flex flex-col items-center gap-1 text-[13px]">
                <span className="font-semibold text-text-2">{formatWeekday(d.date)}</span>
                <w.Icon size={20} className="text-text-2" aria-label={w.label} />
                <span className="tabular">
                  {d.maxC}° <span className="text-text-3">{d.minC}°</span>
                </span>
                {d.rainProbability != null && <span className="text-[12px] text-info">{d.rainProbability} %</span>}
              </li>
            );
          })}
        </ul>
      )}
      <p className={cx('mt-3 text-[11px]', stale || !online ? 'text-warn' : 'text-text-3')}>
        {t.weather.source} · {t.weather.asOf(stand)}
        {(stale || !online) && ` · ${t.weather.notCurrent}`}
      </p>
    </Card>
  );
}
