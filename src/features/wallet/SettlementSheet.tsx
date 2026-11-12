import { useState, type FormEvent } from 'react';
import { convertMinor, minorToInput, normalizeRate, parseAmount } from '../../../shared/money';
import { todayIn } from '../../../shared/trip';
import { useTrip } from '../../components/AppShell';
import { MoneyField } from '../../components/inputs';
import { toast } from '../../components/toast';
import { Button, Field, Input, SelectField, Sheet, TextAreaField, TextField } from '../../components/ui';
import { t } from '../../i18n';
import { errorMessage, http } from '../../lib/api';
import { money } from '../../lib/format';
import { tripStore, useOnline } from '../../lib/store';
import { storedRateFor } from './ExpenseSheet';

export default function SettlementSheet({
  open,
  onClose,
  preset,
}: {
  open: boolean;
  onClose: () => void;
  preset?: { from: string; to: string; amountMinor: number };
}) {
  const { snap } = useTrip();
  const online = useOnline();
  const { trip, travelers, exchangeRates } = snap!;
  const base = trip.baseCurrency;
  const [form, setForm] = useState({
    from: preset?.from ?? travelers[0]?.id ?? '',
    to: preset?.to ?? travelers[1]?.id ?? '',
    amount: preset ? minorToInput(preset.amountMinor, base) : '',
    currency: base,
    rate: '',
    date: todayIn(snap!.destinations[0]?.timezone ?? trip.homeTimezone),
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const amountMinor = form.amount ? parseAmount(form.amount, form.currency) : null;
  const needsRate = form.currency !== base;
  const stored = needsRate ? storedRateFor(exchangeRates, form.currency, form.date) : null;
  const rate = needsRate ? normalizeRate(form.rate) : '1';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!amountMinor || amountMinor <= 0) return setError(t.errors.invalidAmount);
    if (form.from === form.to) return setError(t.errors.validation);
    if (needsRate && !rate) return setError(`${t.wallet.rate}: ${t.errors.validation}`);
    setBusy(true);
    try {
      const usedStored = stored && rate === stored.rate;
      await tripStore.mutate(() =>
        http.post(`/trips/${trip.id}/settlements`, {
          fromTravelerId: form.from,
          toTravelerId: form.to,
          amountMinor,
          currency: form.currency,
          date: form.date,
          notes: form.notes.trim() || null,
          ...(needsRate ? { fxRate: rate, fxSource: usedStored ? 'cached' : 'manual', fxDate: usedStored ? stored!.effectiveDate : form.date } : {}),
        }),
      );
      toast(t.success.saved);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.wallet.addSettlement}
      footer={
        <>
          <Button variant="secondary" block onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button block type="submit" form="settlement-form" loading={busy} disabled={!online}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <form id="settlement-form" onSubmit={submit} className="space-y-4" noValidate>
        <p className="rounded-2xl bg-info-soft px-4 py-3 text-[14px] text-info">{t.wallet.settlementNote}</p>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label={t.wallet.from} value={form.from} onChange={(e) => set('from', e.target.value)}>
            {travelers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </SelectField>
          <SelectField label={t.wallet.to} value={form.to} onChange={(e) => set('to', e.target.value)}>
            {travelers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </SelectField>
        </div>
        <MoneyField
          label={t.wallet.amount}
          amount={form.amount}
          currency={form.currency}
          onAmount={(v) => set('amount', v)}
          onCurrency={(c) => setForm((f) => ({ ...f, currency: c, rate: c !== base ? (storedRateFor(exchangeRates, c, f.date)?.rate.replace('.', ',') ?? '') : '' }))}
        />
        {needsRate && (
          <Field label={`${t.wallet.rate} · ${t.wallet.rateHelp(form.currency, base)}`} hint={stored ? `${t.wallet.rateSource.cached}: ${stored.rate}` : t.wallet.noStoredRate}>
            <Input inputMode="decimal" value={form.rate} onChange={(e) => set('rate', e.target.value)} />
          </Field>
        )}
        {needsRate && amountMinor && rate && <p className="text-[13px] text-text-2">{t.wallet.convertedTo(money(convertMinor(amountMinor, form.currency, base, rate), base))}</p>}
        <TextField label={t.wallet.date} type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
        <TextAreaField label={t.common.notes} optional value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        {error && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] text-danger">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
