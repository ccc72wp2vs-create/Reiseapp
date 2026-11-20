/**
 * "Datenpflege": a short list of gaps in the trip data with jump-to and,
 * where unambiguous, a one-tap fix. Nothing is changed without a tap.
 */
import { CheckCircle2, ChevronRight, Wand2 } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { hygieneIssues, type HygieneIssue, type HygieneKind } from '../../../shared/hygiene';
import type { TripSnapshot } from '../../../shared/types';
import { PageHeader, useTrip } from '../../components/AppShell';
import { toast } from '../../components/toast';
import { Button, Card, EmptyState, Skeleton } from '../../components/ui';
import { t } from '../../i18n';
import { http } from '../../lib/api';
import { tripStore, useOnline } from '../../lib/store';

const ExpenseSheet = lazy(() => import('../wallet/ExpenseSheet'));
const PlaceSheet = lazy(() => import('../explore/PlaceSheet'));
const ActivitySheet = lazy(() => import('../itinerary/ActivitySheet'));
const PinFinderSheet = lazy(() => import('../explore/PinFinderSheet'));

const ORDER: HygieneKind[] = ['expense-duplicate', 'booking-no-travelers', 'booking-no-stop', 'place-no-stop', 'expense-category', 'activity-outside', 'place-no-pin'];

export default function DataCarePage() {
  const { snap } = useTrip();
  if (!snap) return <Skeleton className="m-4 h-64" />;
  return <DataCare snap={snap} />;
}

function DataCare({ snap }: { snap: TripSnapshot }) {
  const { canEdit } = useTrip();
  const online = useOnline();
  const navigate = useNavigate();
  const issues = useMemo(() => hygieneIssues(snap), [snap]);
  const [open, setOpen] = useState<HygieneIssue | null>(null);
  const [pins, setPins] = useState(false);
  const groups = ORDER.map((k) => [k, issues.filter((i) => i.kind === k)] as const).filter(([, l]) => l.length);
  const fixable = issues.filter((i) => i.fix);

  function jump(i: HygieneIssue) {
    if (i.target.type === 'booking') navigate(`/buchungen?id=${i.target.id}`);
    else setOpen(i);
  }
  async function applyFix(list: HygieneIssue[]) {
    try {
      for (const i of list) {
        const f = i.fix!;
        if (f.type === 'place') tripStore.places.update(f.id, { destinationId: f.destinationId, version: f.version });
        else await tripStore.mutate(() => http.patch(`/trips/${snap.trip.id}/bookings/${f.id}`, { destinationId: f.destinationId, version: f.version }));
      }
      toast(t.dataCare.fixed(list.length));
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <div>
      <PageHeader title={t.dataCare.title} eyebrow={snap.trip.name} />
      <div className="space-y-5 px-safe pb-nav pt-4">
        {issues.length === 0 ? (
          <EmptyState icon={<CheckCircle2 size={26} />} title={t.dataCare.allGood} text={t.dataCare.allGoodText} />
        ) : (
          <>
            <p className="text-[14px] leading-relaxed text-text-2">{t.dataCare.intro}</p>
            {canEdit && fixable.length > 1 && (
              <Button block icon={<Wand2 size={17} />} disabled={!online} onClick={() => applyFix(fixable)}>
                {t.dataCare.fixAll(fixable.length)}
              </Button>
            )}
            {groups.map(([kind, list]) => (
              <section key={kind}>
                <p className="mb-1 text-[13px] font-semibold text-text">{t.dataCare.kinds[kind].title}</p>
                <p className="mb-2 text-[12px] leading-snug text-text-3">{t.dataCare.kinds[kind].why}</p>
                {kind === 'place-no-pin' && canEdit && (
                  <Button variant="secondary" size="sm" className="mb-2" onClick={() => setPins(true)}>
                    {t.dataCare.findPins}
                  </Button>
                )}
                <Card className="divide-y divide-line">
                  {list.slice(0, 30).map((i) => (
                    <div key={i.key} className="flex items-center gap-2 p-3.5">
                      <button type="button" onClick={() => jump(i)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold">{i.title}</span>
                          {i.suggestion && <span className="block text-[12px] text-text-3">{t.dataCare.suggest(t.expenseCategories[i.suggestion])}</span>}
                          {i.otherId && <span className="block text-[12px] text-text-3">{t.dataCare.sameAs}</span>}
                        </span>
                        <ChevronRight size={17} className="shrink-0 text-text-3" />
                      </button>
                      {i.fix && canEdit && (
                        <Button size="sm" variant="secondary" disabled={!online} onClick={() => applyFix([i])}>
                          {t.dataCare.assign(i.fix.label)}
                        </Button>
                      )}
                    </div>
                  ))}
                </Card>
                {list.length > 30 && <p className="mt-1 text-[12px] text-text-3">{t.dataCare.more(list.length - 30)}</p>}
              </section>
            ))}
          </>
        )}
      </div>
      <Suspense fallback={null}>
        {open?.target.type === 'expense' && <ExpenseSheet open expense={snap.expenses.find((x) => x.id === open.target.id) ?? null} onClose={() => setOpen(null)} />}
        {open?.target.type === 'place' && <PlaceSheet open place={snap.places.find((x) => x.id === open.target.id) ?? null} onClose={() => setOpen(null)} />}
        {open?.target.type === 'activity' && <ActivitySheet open activity={snap.activities.find((x) => x.id === open.target.id) ?? null} onClose={() => setOpen(null)} />}
        {pins && <PinFinderSheet snap={snap} places={snap.places.filter((p) => p.lat == null || p.lng == null)} onClose={() => setPins(false)} />}
      </Suspense>
    </div>
  );
}

