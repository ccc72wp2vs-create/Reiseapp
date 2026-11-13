import { Check, Download, Plus } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router';
import type { TripSummaryDto } from '../../../shared/types';
import { PageHeader } from '../../components/AppShell';
import { CoverArt } from '../../components/CoverArt';
import { toast } from '../../components/toast';
import { Badge, Button, IconButton, SectionTitle, Skeleton, cx } from '../../components/ui';
import { t } from '../../i18n';
import { http } from '../../lib/api';
import { formatRange } from '../../lib/format';
import { tripsList, tripStore, useOnline, useTrips, useTripState } from '../../lib/store';

const TripSheet = lazy(() => import('./TripSheet'));

export default function TripsPage() {
  const { trips } = useTrips();
  const { tripId } = useTripState();
  const online = useOnline();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = (trips ?? []).filter((x) => !x.archivedAt);
  const archived = (trips ?? []).filter((x) => x.archivedAt);
  const hasThailand = (trips ?? []).some((x) => x.importKey === 'thailand-2026');

  async function select(id: string) {
    await tripStore.select(id);
    navigate('/');
  }

  async function importThailand() {
    setBusy(true);
    try {
      const r = await http.post<{ tripId: string; created: boolean }>('/imports/thailand-2026');
      toast(r.created ? t.success.imported : t.success.alreadyImported, r.created ? 'success' : 'info');
      await tripsList.load();
      await select(r.tripId);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  const card = (trip: TripSummaryDto) => (
    <li key={trip.id}>
      <button type="button" onClick={() => void select(trip.id)} className="group relative block w-full overflow-hidden rounded-[1.75rem] text-left shadow-card">
        <CoverArt name={trip.destinationCountry ?? trip.name} imageUrl={trip.coverImageUrl} className="h-44 w-full transition duration-500 group-active:scale-[1.02]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#101b33] via-[#101b33]/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 text-[#f5f9fc]">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {trip.isDemo && <Badge tone="warn">{t.trips.demoBadge}</Badge>}
            <Badge className="border-white/20 bg-white/15 text-white">{t.tripStatus[trip.status]}</Badge>
            {trip.role !== 'owner' && <Badge className="border-white/20 bg-white/10 text-white">{t.roles[trip.role]}</Badge>}
          </div>
          <h2 className="font-display text-[28px] font-semibold leading-tight">{trip.name}</h2>
          <p className="mt-1 text-[13px] text-white/75">
            {formatRange(trip.startDate, trip.endDate)} · {t.trips.destinations(trip.destinationCount)} · {t.trips.travelers(trip.travelerCount)}
          </p>
        </div>
        {trip.id === tripId && (
          <span className="absolute right-4 top-4 inline-flex h-8 items-center gap-1 rounded-full bg-accent px-3 text-[12px] font-bold text-accent-ink">
            <Check size={14} /> {t.trips.current}
          </span>
        )}
      </button>
    </li>
  );

  return (
    <div>
      <PageHeader
        title={t.trips.title}
        action={
          <IconButton label={t.trips.new} variant="primary" disabled={!online} onClick={() => setCreating(true)}>
            <Plus size={22} />
          </IconButton>
        }
      />
      <div className="px-safe pt-6">
        {!trips ? (
          <div className="space-y-3">
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-44 w-full" />
          </div>
        ) : (
          <>
            {active.length === 0 && <p className="text-text-2">{t.trips.empty}</p>}
            <ul className={cx('grid gap-4 sm:grid-cols-2')}>{active.map(card)}</ul>
            {!hasThailand && (
              <Button variant="secondary" block className="mt-5" icon={<Download size={18} />} loading={busy} disabled={!online} onClick={() => void importThailand()}>
                {t.home.importThailand}
              </Button>
            )}
            {archived.length > 0 && (
              <>
                <SectionTitle>{t.trips.archivedTrips}</SectionTitle>
                <ul className="grid gap-4 opacity-80 sm:grid-cols-2">{archived.map(card)}</ul>
              </>
            )}
          </>
        )}
      </div>
      <Suspense fallback={null}>{creating && <TripSheet open onClose={() => setCreating(false)} />}</Suspense>
    </div>
  );
}
