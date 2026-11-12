import { Pencil, Target } from 'lucide-react';
import { useState } from 'react';
import { spendByDestination, spendPerPersonOn } from '../../../shared/budget';
import { destinationOn, todayIn } from '../../../shared/trip';
import { minorToInput, parseAmount } from '../../../shared/money';
import type { TripSnapshot } from '../../../shared/types';
import { toast } from '../../components/toast';
import { Button, Card, Field, Input, Progress, SectionTitle, Sheet, cx } from '../../components/ui';
import { t } from '../../i18n';
import { errorMessage, http } from '../../lib/api';
import { money } from '../../lib/format';
import { tripStore, useOnline } from '../../lib/store';

/** Today's spending vs. a per-person daily target, plus spending per stop. */
export function BudgetCard({ snap, persons, canEdit }: { snap: TripSnapshot; persons: string[]; canEdit: boolean }) {
  const { trip, destinations, expenses } = snap;
  const base = trip.baseCurrency;
  const probe = destinationOn(destinations, todayIn(trip.homeTimezone)).current ?? destinations[0];
  const today = todayIn(probe?.timezone ?? trip.homeTimezone);
  const [editing, setEditing] = useState(false);
  const todayPP = spendPerPersonOn(expenses, today, persons);
  const budget = trip.dailyBudgetMinor;
  const places = spendByDestination(destinations, expenses, persons, today);
  const maxPlace = Math.max(1, ...places.map((p) => p.perPersonPerDayMinor), budget ?? 0);
  const during = today >= trip.startDate && today <= trip.endDate;

  return (
    <>
      <SectionTitle
        action={
          canEdit && (
            <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-[14px] font-semibold text-accent">
              <Pencil size={14} /> {budget ? t.budget.change : t.budget.set}
            </button>
          )
        }
      >
        {t.budget.title}
      </SectionTitle>
      <Card className="p-5">
        {during && (
          <>
            <p className="text-[13px] text-text-3">{t.budget.todayPerPerson}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={cx('font-display text-[30px] font-semibold tabular', budget != null && todayPP > budget ? 'text-danger' : '')}>{money(todayPP, base)}</span>
              {budget != null && <span className="text-[14px] text-text-3">/ {money(budget, base)}</span>}
            </div>
            {budget != null && budget > 0 && (
              <>
                <div className="mt-3">
                  <Progress value={Math.min(1, todayPP / budget)} label={t.budget.title} />
                </div>
                <p className={cx('mt-2 text-[13px] font-semibold', todayPP > budget ? 'text-danger' : 'text-success')}>
                  {todayPP > budget ? t.budget.over(money(todayPP - budget, base)) : t.budget.left(money(budget - todayPP, base))}
                </p>
              </>
            )}
            {budget == null && <p className="mt-2 text-[13px] text-text-3">{t.budget.noTarget}</p>}
          </>
        )}
        {places.length > 0 && (
          <div className={cx('space-y-3', during && 'mt-5 border-t border-line pt-4')}>
            <p className="text-[13px] font-semibold text-text-2">{t.budget.perPlace}</p>
            {places.map((p) => (
              <div key={p.destination.id}>
                <div className="mb-1 flex items-center justify-between gap-2 text-[14px]">
                  <span className="min-w-0 truncate">
                    {p.destination.name} <span className="text-text-3">· {t.budget.days(p.days)}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={cx('font-semibold tabular', budget != null && p.perPersonPerDayMinor > budget && 'text-danger')}>{money(p.perPersonPerDayMinor, base)}</span>
                    <span className="text-[12px] text-text-3"> {t.budget.perDay}</span>
                  </span>
                </div>
                <Progress value={p.perPersonPerDayMinor / maxPlace} label={p.destination.name} />
                <p className="mt-1 text-[12px] text-text-3">{t.budget.placeTotal(money(p.totalMinor, base))}</p>
              </div>
            ))}
          </div>
        )}
        {!during && places.length === 0 && <p className="text-[14px] text-text-3">{t.budget.notStarted}</p>}
        <p className="mt-4 text-[12px] text-text-3">{t.budget.hint}</p>
      </Card>
      {editing && <BudgetSheet snap={snap} onClose={() => setEditing(false)} />}
    </>
  );
}

function BudgetSheet({ snap, onClose }: { snap: TripSnapshot; onClose: () => void }) {
  const { trip } = snap;
  const online = useOnline();
  const [value, setValue] = useState(trip.dailyBudgetMinor != null ? minorToInput(trip.dailyBudgetMinor, trip.baseCurrency) : '');
  const [busy, setBusy] = useState(false);
  const minor = value.trim() ? parseAmount(value, trip.baseCurrency) : null;
  async function save(v: number | null) {
    setBusy(true);
    try {
      await tripStore.mutate(() => http.patch(`/trips/${trip.id}`, { dailyBudgetMinor: v, version: trip.version }));
      toast(t.success.saved);
      onClose();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={t.budget.title}
      footer={
        <>
          {trip.dailyBudgetMinor != null && (
            <Button variant="secondary" block disabled={!online || busy} onClick={() => void save(null)}>
              {t.budget.remove}
            </Button>
          )}
          <Button block loading={busy} disabled={!online || (value.trim() !== '' && (minor == null || minor < 0))} onClick={() => void save(value.trim() ? minor : null)}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <Field label={t.budget.perPersonPerDay(trip.baseCurrency)}>
        <div className="relative">
          <Input inputMode="decimal" autoFocus placeholder="z. B. 40" value={value} onChange={(e) => setValue(e.target.value)} className="pr-14" />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-3">
            <Target size={16} />
          </span>
        </div>
      </Field>
      <p className="mt-3 text-[13px] text-text-2">{t.budget.sheetHint}</p>
    </Sheet>
  );
}
