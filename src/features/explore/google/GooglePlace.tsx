import { createElement, useEffect, useState, type CSSProperties } from 'react';
import { loadPlacesUiKit, reserveUiLoads, getGoogleConfig } from '../../../lib/google';
import { ApiError, errorMessage } from '../../../lib/api';
import { useOnline } from '../../../lib/store';
import { Skeleton } from '../../../components/ui';

/**
 * One Google place, rendered by Google's own Places UI Kit element
 * (gmp-place-details-compact). TRAVIO never reads or stores what it shows –
 * name, rating, photos, opening hours and attribution come straight from Google.
 */
export function GooglePlace({ tripId, placeId, reserved = false }: { tripId: string; placeId: string; /** Load already counted by the caller. */ reserved?: boolean }) {
  const online = useOnline();
  const [state, setState] = useState<'loading' | 'ready' | { error: string }>('loading');

  useEffect(() => {
    if (!online) return;
    let alive = true;
    setState('loading');
    void (async () => {
      try {
        const cfg = await getGoogleConfig(tripId);
        if (!cfg.browserKey) throw new Error('Google Maps ist noch nicht eingerichtet.');
        if (!reserved) await reserveUiLoads(tripId, 1);
        await loadPlacesUiKit(cfg.browserKey);
        if (alive) setState('ready');
      } catch (e) {
        if (alive) setState({ error: e instanceof ApiError ? errorMessage(e) : 'Google-Ortsinfos konnten nicht geladen werden. Bitte später erneut versuchen.' });
      }
    })();
    return () => {
      alive = false;
    };
  }, [tripId, placeId, reserved, online]);

  if (!online) return <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[13px] text-text-2">Offline – aktuelle Google-Infos werden geladen, sobald du wieder online bist.</p>;
  if (state === 'loading') return <Skeleton className="h-24 w-full" />;
  if (typeof state === 'object') return <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[13px] text-text-2">{state.error}</p>;

  // Custom elements of the Maps JavaScript API (Places UI Kit).
  return createElement(
    'gmp-place-details-compact',
    {
      orientation: 'horizontal',
      'truncation-preferred': '',
      class: 'block w-full overflow-hidden rounded-2xl',
      style: {
        colorScheme: 'light dark',
        '--gmp-mat-color-surface': 'var(--surface-2)',
        '--gmp-mat-color-on-surface': 'var(--text)',
        '--gmp-mat-color-on-surface-variant': 'var(--text-2)',
        '--gmp-mat-color-primary': 'var(--accent)',
        '--gmp-mat-font-family': 'inherit',
      } as CSSProperties,
    },
    createElement('gmp-place-details-place-request', { place: placeId }),
    createElement('gmp-place-standard-content'),
  );
}
