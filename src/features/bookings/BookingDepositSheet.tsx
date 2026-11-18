/**
 * Anzahlung erfassen: amount, who paid it and for whom. It is booked as its
 * own wallet expense; the rest stays open on the booking until it is paid.
 */
import { useState } from 'react';
import { remainingMinor } from '../../../shared/costs';
import { minorToInput, normalizeRate, parseAmount } from '../../../shared/money';
import { todayIn } from '../../../shared/trip';
import type { BookingDto, TripSnapshot } from '../../../shared/types';
import { useTrip } from '../../components/AppShell';
import { toast } from '../../components/toast';
import { Button, Chip, SelectField, Sheet, TextField } from '../../components/ui';
import { t } from '../../i18n';
import { errorMessage, http } from '../../lib/api';
import { money } from '../../lib/format';
import { suggestedRate } from '../../lib/rates';
import { tripStore, useOnline } from '../../lib/store';

export default function BookingDepositSheet({ booking, snap, onClose }: { booking: BookingDto; snap: TripSnapshot; onClose: () => void }) {
  const { user } = useTrip();
  const online = useOnline();
  const { trip, travelers } = snap;
  const cur = booking.currency ?? trip.baseCurrency;
  const me = travelers.find((x) => x.userId && x.userId === user?.id)?.id ?? travelers[0]?.id ?? '';
  const today = todayIn(snap.destinations[0]?.timezone ?? trip.homeTimezone);
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState(booking.paidByTravelerId ?? me);
  const [who, setWho] = useState<string[]>(booking.travelerIds.length ? booking.travelerIds : travelers.map((x) => x.id));
  const [date, setDate] = useState(today);
  const sugg = cur !== trip.baseCurrency ? suggestedRate(snap.exchangeRates, snap.expenses, cur, date) : null;
  const [rate, setRate] = useState(sugg ? sugg.rate.replace('.', ',') : '');
  const [busy, setBusy] = useState(false);
  const minor = amount.trim() ? parseAmount(amount, cur) : null;
  const price = booking.priceMinor ?? 0;
  const valid = minor != null && minor > 0 && minor < price && who.length > 0 && (cur === trip.baseCurrency || !!normalizeRate(rate));

  async function save() {
    if (!valid) return;
    setBusy(true);
    try {
      await tripStore.mutate(() =>
        http.post(`/trips/${trip.id}/bookings/${booking.id}/deposit`, {
          amountMinor: minor,
          paidByTravelerId: payer,
          participantIds: who,
          date,
          ...(cur !== trip.baseCurrency ? { fxRate: normalizeRate(rate) } : {}),
        }),
      );
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
      title={t.deposit.title}
      footer={
        <>
          <Button variant="secondary" block onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button block loading={busy} disabled={!valid || !online} onClick={save}>
            {t.deposit.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[14px] text-text-2">
          <span className="font-semibold text-text">{booking.title}</span> · {t.deposit.total(money(price, cur))}
        </p>
        <TextField label={t.deposit.amount(cur)} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={minorToInput(Math.round(price / 4), cur)} />
        {minor != null && minor > 0 && minor < price && <p className="-mt-2 text-[13px] text-text-3">{t.deposit.restAfter(money(price - minor, cur))}</p>}
        <SelectField label={t.deposit.paidBy} value={payer} onChange={(e) => setPayer(e.target.value)}>
          {travelers.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </SelectField>
        <div>
          <p className="mb-2 text-[14px] font-semibold text-text-2">{t.deposit.forWhom}</p>
          <div className="flex flex-wrap gap-2">
            {travelers.map((x) => (
              <Chip key={x.id} active={who.includes(x.id)} onClick={() => setWho((w) => (w.includes(x.id) ? w.filter((i) => i !== x.id) : [...w, x.id]))}>
                {x.name}
              </Chip>
            ))}
          </div>
        </div>
        <TextField label={t.wallet.date} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        {cur !== trip.baseCurrency && <TextField label={t.receipt.rate(cur, trip.baseCurrency)} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />}
        <p className="text-[12px] text-text-3">{t.deposit.hint}</p>
      </div>
    </Sheet>
  );
}

/** "2.000 ฿ angezahlt · 7.000 ฿ offen" line for a booking card. */
export function DepositLine({ booking, snap, canEdit, onRemoved }: { booking: BookingDto; snap: TripSnapshot; canEdit: boolean; onRemoved?: () => void }) {
  const online = useOnline();
  if (!booking.depositMinor || !booking.currency) return null;
  const dep = snap.expenses.find((e) => e.id === booking.depositExpenseId);
  const payer = dep ? snap.travelers.find((x) => x.id === dep.paidByTravelerId)?.name : null;
  const open = booking.expenseId ? 0 : remainingMinor(booking);
  return (
    <div className="mt-3 rounded-2xl bg-surface-2 px-4 py-3 text-[13px]">
      <p>
        <span className="font-semibold">{t.deposit.paidLine(money(booking.depositMinor, booking.currency))}</span>
        {payer && dep && <span className="text-text-3"> · {t.deposit.byOn(payer, dep.date.split('-').reverse().slice(0, 2).join('.') + '.')}</span>}
      </p>
      {open > 0 ? <p className="mt-0.5 font-semibold text-warn">{t.deposit.openLine(money(open, booking.currency))}</p> : <p className="mt-0.5 font-semibold text-success">{t.deposit.allPaid}</p>}
      {canEdit && !booking.expenseId && (
        <button
          type="button"
          disabled={!online}
          className="mt-1 text-[12px] font-semibold text-text-3 underline"
          onClick={async () => {
            if (!confirm(t.deposit.removeConfirm)) return;
            try {
              await tripStore.mutate(() => http.del(`/trips/${snap.trip.id}/bookings/${booking.id}/deposit`));
              onRemoved?.();
            } catch (e) {
              toast.error(e);
            }
          }}
        >
          {t.deposit.remove}
        </button>
      )}
    </div>
  );
}
