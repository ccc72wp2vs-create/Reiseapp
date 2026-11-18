/**
 * "Kartenpunkte suchen": for saved places without coordinates, one by one,
 * OpenStreetMap suggestions near their stop – confirm one with a tap.
 */
import { CheckCircle2, MapPin } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { PlaceDto, TripSnapshot } from '../../../shared/types';
import { toast } from '../../components/toast';
import { Button, Sheet } from '../../components/ui';
import { t } from '../../i18n';
import { errorMessage, http } from '../../lib/api';
import { tripStore, useOnline } from '../../lib/store';

interface Candidate {
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  distanceKm: number | null;
}

export default function PinFinderSheet({ snap, places, onClose }: { snap: TripSnapshot; places: PlaceDto[]; onClose: () => void }) {
  const online = useOnline();
  const list = useMemo(() => places.filter((p) => p.lat == null || p.lng == null), [places]); // fixed when opened
  const [pos, setPos] = useState(0);
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(0);
  const place = list[pos];
  const live = place ? (snap.places.find((p) => p.id === place.id) ?? place) : null;
  const dest = live ? snap.destinations.find((d) => d.id === live.destinationId) : null;

  useEffect(() => {
    if (!place || !online) return;
    let off = false;
    setCands(null);
    setError(null);
    http
      .post<{ candidates: Candidate[] }>(`/trips/${snap.trip.id}/maps/geocode`, { placeId: place.id })
      .then((r) => !off && setCands(r.candidates))
      .catch((e) => !off && setError(errorMessage(e)));
    return () => {
      off = true;
    };
  }, [place, online, snap.trip.id]);

  async function take(c: Candidate) {
    if (!live) return;
    setBusy(true);
    try {
      await tripStore.mutate(() =>
        http.patch(`/trips/${snap.trip.id}/places/${live.id}`, { lat: c.lat, lng: c.lng, address: live.address ?? c.address, version: live.version }),
      );
      setSaved((n) => n + 1);
      setPos((p) => p + 1);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={t.pins.title} footer={<Button variant="secondary" block onClick={onClose}>{t.common.close}</Button>}>
      {!live ? (
        <div className="py-8 text-center">
          <CheckCircle2 size={36} className="mx-auto text-success" />
          <p className="mt-3 font-semibold">{t.pins.done(saved)}</p>
        </div>
      ) : (
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-text-3">{t.pins.step(pos + 1, list.length)}</p>
          <p className="mt-2 font-display text-[22px] font-semibold leading-tight">{live.name}</p>
          {dest && <p className="text-[13px] text-text-3">{dest.name}</p>}
          <div className="mt-4 space-y-2">
            {!cands && !error && <p className="text-[14px] text-text-3">{t.pins.searching}</p>}
            {error && <p className="text-[14px] text-warn">{error}</p>}
            {cands?.length === 0 && <p className="text-[14px] text-text-2">{t.pins.none}</p>}
            {cands?.map((c, i) => (
              <button
                key={i}
                type="button"
                disabled={busy}
                onClick={() => take(c)}
                className="flex w-full items-start gap-3 rounded-2xl border border-line bg-surface p-3 text-left transition active:bg-surface-2 disabled:opacity-60"
              >
                <MapPin size={18} className="mt-0.5 shrink-0 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{c.name}</span>
                  {c.address && <span className="block text-[13px] text-text-3">{c.address}</span>}
                  {c.distanceKm != null && <span className="block text-[12px] text-text-3">{t.pins.distance(c.distanceKm.toLocaleString('de-DE'))}</span>}
                </span>
                <span className="shrink-0 text-[13px] font-semibold text-accent">{t.pins.take}</span>
              </button>
            ))}
          </div>
          <Button className="mt-4" variant="secondary" block onClick={() => setPos((p) => p + 1)}>
            {t.pins.skip}
          </Button>
          <p className="mt-3 text-[11px] text-text-3">© OpenStreetMap contributors · Powered by Geoapify</p>
        </div>
      )}
    </Sheet>
  );
}
