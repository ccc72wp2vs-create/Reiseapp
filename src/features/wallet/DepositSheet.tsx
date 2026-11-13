import { RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { convertMinor, minorToInput, normalizeRate, parseAmount } from '../../../shared/money';
import { todayIn } from '../../../shared/trip';
import type { DepositDto, DepositMethod, TripSnapshot } from '../../../shared/types';
import { MoneyField } from '../../components/inputs';
import { toast } from '../../components/toast';
import { Button, ConfirmDialog, Field, Input, Segmented, SelectField, Sheet, TextAreaField, TextField, cx } from '../../components/ui';
import { t } from '../../i18n';
import { errorMessage, http } from '../../lib/api';
import { formatDate, money } from '../../lib/format';
import { suggestedRate } from '../../lib/rates';
import { tripStore, useOnline } from '../../lib/store';
import { splitPresets } from './ExpenseSheet';

function localToday(snap: TripSnapshot) {
  return todayIn(snap.destinations[0]?.timezone ?? snap.trip.homeTimezone);
}

/** Create / edit a deposit (Kaution). */
export function DepositSheet({ snap, deposit, me, onClose }: { snap: TripSnapshot; deposit?: DepositDto | null; me?: string | null; onClose: () => void }) {
  const online = useOnline();
  const { trip, travelers, bookings, exchangeRates, expenses } = snap;
  const base = trip.baseCurrency;
  const [form, setForm] = useState(() => {
    const currency = deposit?.currency ?? trip.localCurrency ?? base;
    const date = deposit?.date ?? localToday(snap);
    const sugg = currency !== base ? suggestedRate(exchangeRates, expenses, currency, date) : null;
    return {
      title: deposit?.title ?? '',
      amount: deposit ? minorToInput(deposit.amountMinor, deposit.currency) : '',
      currency,
      rate: (deposit && deposit.fxSource !== 'identity' ? deposit.fxRate : (sugg?.rate ?? '')).replace('.', ','),
      paidBy: deposit?.paidByTravelerId ?? me ?? travelers[0]?.id ?? '',
      travelerIds: deposit ? deposit.travelerIds : travelers.map((x) => x.id),
      method: (deposit?.method ?? 'cash') as DepositMethod,
      date,
      returnDate: deposit?.returnDate ?? '',
      bookingId: deposit?.bookingId ?? '',
      notes: deposit?.notes ?? '',
    };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const presets = useMemo(() => splitPresets(travelers, expenses, bookings), [travelers, expenses, bookings]);
  const amountMinor = form.amount.trim() ? parseAmount(form.amount, form.currency) : null;
  const needsRate = form.currency !== base;
  const rate = needsRate ? normalizeRate(form.rate) : '1';
  const converted = amountMinor && rate ? convertMinor(amountMinor, form.currency, base, rate) : null;
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  const toggle = (id: string) =>
    set('travelerIds', form.travelerIds.includes(id) ? form.travelerIds.filter((x) => x !== id) : travelers.filter((x) => x.id === id || form.travelerIds.includes(x.id)).map((x) => x.id));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) return setError(`${t.deposits.what}: ${t.errors.required}`);
    if (!amountMinor || amountMinor <= 0) return setError(t.errors.invalidAmount);
    if (needsRate && !rate) return setError(`${t.wallet.rate}: ${t.errors.validation}`);
    if (!form.travelerIds.length) return setError(`${t.deposits.forWhom}: ${t.errors.required}`);
    const sugg = needsRate ? suggestedRate(exchangeRates, expenses, form.currency, form.date) : null;
    const payload = {
      title: form.title.trim(),
      amountMinor,
      currency: form.currency,
      ...(needsRate ? { fxRate: rate!, fxSource: sugg && sugg.rate === rate ? 'cached' : 'manual', fxDate: sugg && sugg.rate === rate ? sugg.effectiveDate : form.date } : {}),
      paidByTravelerId: form.paidBy,
      travelerIds: form.travelerIds,
      method: form.method,
      date: form.date,
      returnDate: form.returnDate || null,
      bookingId: form.bookingId || null,
      notes: form.notes.trim() || null,
    };
    setBusy(true);
    try {
      await tripStore.mutate(() =>
        deposit ? http.put(`/trips/${trip.id}/deposits/${deposit.id}`, { ...payload, version: deposit.version }) : http.post(`/trips/${trip.id}/deposits`, payload),
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
    <>
      <Sheet
        open
        onClose={onClose}
        size="lg"
        title={deposit ? t.deposits.edit : t.deposits.add}
        footer={
          <>
            <Button variant="secondary" block onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button block type="submit" form="deposit-form" loading={busy} disabled={!online}>
              {t.common.save}
            </Button>
          </>
        }
      >
        <form id="deposit-form" onSubmit={submit} className="space-y-4" noValidate>
          <p className="rounded-2xl bg-info-soft px-4 py-3 text-[14px] text-info">{t.deposits.explain}</p>
          <TextField label={t.deposits.what} placeholder={t.deposits.whatPlaceholder} value={form.title} onChange={(e) => set('title', e.target.value)} />
          <MoneyField
            label={t.wallet.amount}
            amount={form.amount}
            currency={form.currency}
            onAmount={(v) => set('amount', v)}
            onCurrency={(c) => setForm((f) => ({ ...f, currency: c, rate: c !== base ? (suggestedRate(exchangeRates, expenses, c, f.date)?.rate.replace('.', ',') ?? '') : '' }))}
            error={form.amount && amountMinor === null ? t.errors.invalidAmount : null}
          />
          {needsRate && (
            <Field label={`${t.wallet.rate} · ${t.wallet.rateHelp(form.currency, base)}`} hint={converted != null ? t.wallet.convertedTo(money(converted, base)) : undefined} htmlFor="deposit-rate">
              <Input id="deposit-rate" inputMode="decimal" value={form.rate} onChange={(e) => set('rate', e.target.value)} />
            </Field>
          )}
          <Field label={t.deposits.paidBy}>
            <div className="flex flex-wrap gap-2">
              {travelers.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  aria-pressed={form.paidBy === x.id}
                  onClick={() => set('paidBy', x.id)}
                  className={cx('inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-[14px] font-semibold', form.paidBy === x.id ? 'border-transparent bg-text text-bg' : 'border-line bg-surface text-text-2')}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} />
                  {x.name}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t.deposits.forWhom} hint={t.deposits.forWhomHint}>
            {presets.length > 1 && (
              <div className="no-scrollbar -mx-1 mb-2 flex gap-2 overflow-x-auto px-1 pb-1">
                {presets.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    aria-pressed={sameSet(p.ids, form.travelerIds)}
                    onClick={() => set('travelerIds', p.ids)}
                    className={cx('inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-[13px] font-semibold', sameSet(p.ids, form.travelerIds) ? 'border-transparent bg-accent text-accent-ink' : 'border-line bg-surface-2 text-text-2')}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {travelers.map((x) => {
                const on = form.travelerIds.includes(x.id);
                return (
                  <button
                    key={x.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(x.id)}
                    className={cx('inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-[14px] font-semibold', on ? 'border-transparent bg-text text-bg' : 'border-line bg-surface text-text-2')}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} />
                    {x.name}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label={t.deposits.method}>
            <Segmented
              value={form.method}
              onChange={(m) => set('method', m)}
              options={[
                { value: 'cash', label: t.deposits.methods.cash },
                { value: 'card', label: t.deposits.methods.card },
                { value: 'transfer', label: t.deposits.methods.transfer },
              ]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <TextField label={t.deposits.date} type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
            <TextField label={t.deposits.returnDate} optional type="date" value={form.returnDate} onChange={(e) => set('returnDate', e.target.value)} />
          </div>
          <SelectField label={t.deposits.booking} optional value={form.bookingId} onChange={(e) => set('bookingId', e.target.value)}>
            <option value="">{t.deposits.noBooking}</option>
            {bookings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </SelectField>
          <TextAreaField label={t.common.notes} optional value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          {error && (
            <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] text-danger">
              {error}
            </p>
          )}
          {deposit && (
            <div className="border-t border-line pt-4">
              <Button variant="danger" size="sm" icon={<Trash2 size={16} />} disabled={!online} onClick={() => setConfirm(true)}>
                {t.common.delete}
              </Button>
            </div>
          )}
        </form>
      </Sheet>
      {deposit && (
        <ConfirmDialog
          open={confirm}
          onClose={() => setConfirm(false)}
          title={t.common.delete}
          message={t.deposits.deleteConfirm(deposit.title)}
          onConfirm={async () => {
            await tripStore.mutate(() => http.del(`/trips/${trip.id}/deposits/${deposit.id}`));
            toast(t.success.deleted);
            onClose();
          }}
        />
      )}
    </>
  );
}

/** Close a deposit: fully returned, partly kept or fully kept – or reopen it. */
export function ResolveDepositSheet({ snap, deposit, onClose }: { snap: TripSnapshot; deposit: DepositDto; onClose: () => void }) {
  const online = useOnline();
  const [outcome, setOutcome] = useState<'returned' | 'partial' | 'kept'>('returned');
  const [kept, setKept] = useState('');
  const [date, setDate] = useState(localToday(snap));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keptMinor = kept.trim() ? parseAmount(kept, deposit.currency) : null;
  const who = snap.travelers.filter((x) => (deposit.travelerIds.length ? deposit.travelerIds.includes(x.id) : true)).map((x) => x.name);
  const keptValue = outcome === 'kept' ? deposit.amountMinor : outcome === 'partial' ? keptMinor : 0;

  async function save() {
    setError(null);
    if (outcome === 'partial' && (!keptMinor || keptMinor <= 0 || keptMinor > deposit.amountMinor)) return setError(t.deposits.keptInvalid(money(deposit.amountMinor, deposit.currency)));
    setBusy(true);
    try {
      await tripStore.mutate(() =>
        http.post(`/trips/${snap.trip.id}/deposits/${deposit.id}/resolve`, { outcome, ...(outcome === 'partial' ? { keptMinor } : {}), date, version: deposit.version }),
      );
      toast(t.success.saved);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    setBusy(true);
    try {
      await tripStore.mutate(() => http.post(`/trips/${snap.trip.id}/deposits/${deposit.id}/reopen`, { version: deposit.version }));
      toast(t.deposits.reopened);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (deposit.status !== 'open') {
    return (
      <Sheet open onClose={onClose} title={deposit.title}>
        <p className="text-[15px]">{t.deposits.resolvedText(deposit.status, money(deposit.keptMinor ?? 0, deposit.currency), deposit.resolvedAt ? formatDate(deposit.resolvedAt) : '')}</p>
        {deposit.expenseId && <p className="mt-2 text-[13px] text-text-3">{t.deposits.expenseCreated}</p>}
        {error && <p className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] text-danger">{error}</p>}
        <Button className="mt-5" variant="secondary" icon={<RotateCcw size={16} />} loading={busy} disabled={!online} onClick={() => void reopen()}>
          {t.deposits.reopen}
        </Button>
        <p className="mt-2 text-[12px] text-text-3">{t.deposits.reopenHint}</p>
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={t.deposits.resolveTitle(deposit.title)}
      footer={
        <>
          <Button variant="secondary" block onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button block loading={busy} disabled={!online} onClick={() => void save()}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-[1.25rem] bg-surface p-4">
          <p className="text-[13px] text-text-3">{t.deposits.deposited}</p>
          <p className="font-display text-[28px] font-semibold tabular">{money(deposit.amountMinor, deposit.currency)}</p>
        </div>
        <Segmented
          value={outcome}
          onChange={setOutcome}
          options={[
            { value: 'returned', label: t.deposits.outcomes.returned },
            { value: 'partial', label: t.deposits.outcomes.partial },
            { value: 'kept', label: t.deposits.outcomes.kept },
          ]}
        />
        {outcome === 'partial' && (
          <Field label={t.deposits.keptAmount(deposit.currency)} htmlFor="deposit-kept">
            <Input id="deposit-kept" inputMode="decimal" autoFocus value={kept} onChange={(e) => setKept(e.target.value)} placeholder="0,00" />
          </Field>
        )}
        <TextField label={t.wallet.date} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <p className="text-[14px] text-text-2">
          {keptValue ? t.deposits.keptInfo(money(keptValue, deposit.currency), who.join(', ')) : t.deposits.returnedInfo}
        </p>
        {error && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] text-danger">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
