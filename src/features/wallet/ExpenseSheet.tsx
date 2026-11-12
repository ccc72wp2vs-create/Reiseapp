import { SlidersHorizontal, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { EXPENSE_CATEGORIES, type ExpenseCategory, type FxSource, type SplitMethod } from '../../../shared/constants';
import { convertMinor, minorToInput, normalizeRate, parseAmount, sum } from '../../../shared/money';
import { todayIn } from '../../../shared/trip';
import type { ExpenseDto } from '../../../shared/types';
import { useTrip } from '../../components/AppShell';
import { MoneyField } from '../../components/inputs';
import { toast } from '../../components/toast';
import { Badge, Button, ConfirmDialog, Field, Input, Segmented, SelectField, Sheet, TextAreaField, TextField, cx } from '../../components/ui';
import { t } from '../../i18n';
import { errorMessage, http } from '../../lib/api';
import { formatDate, formatRate, money } from '../../lib/format';
import { tripStore, useOnline } from '../../lib/store';

export { storedRateFor, suggestedRate, type SuggestedRate } from '../../lib/rates';
import { storedRateFor, suggestedRate } from '../../lib/rates';

export interface SplitPreset {
  key: string;
  label: string;
  ids: string[];
}

/**
 * One-tap "für wen?" presets: everyone, the pairs that already appear in the
 * trip (two-person expenses or bookings) and "everyone except X".
 */
export function splitPresets(
  travelers: { id: string; name: string }[],
  expenses: Pick<ExpenseDto, 'shares'>[],
  bookings: { travelerIds: string[] }[],
): SplitPreset[] {
  const order = (ids: string[]) => travelers.filter((x) => ids.includes(x.id)).map((x) => x.id);
  const name = (id: string) => travelers.find((x) => x.id === id)?.name ?? '?';
  const out: SplitPreset[] = [{ key: 'all', label: t.wallet.presetAll(travelers.length), ids: travelers.map((x) => x.id) }];
  if (travelers.length > 2) {
    const pairs = new Map<string, string[]>();
    for (const ids of [...expenses.map((e) => e.shares.map((x) => x.travelerId)), ...bookings.map((b) => b.travelerIds)]) {
      if (ids.length !== 2 || !ids.every((id) => travelers.some((x) => x.id === id))) continue;
      const o = order(ids);
      pairs.set(o.join('|'), o);
    }
    for (const [key, ids] of [...pairs].slice(0, 4)) out.push({ key, label: ids.map(name).join(' & '), ids });
    for (const x of travelers) out.push({ key: `not-${x.id}`, label: t.wallet.presetExcept(x.name), ids: travelers.filter((y) => y.id !== x.id).map((y) => y.id) });
  }
  return out;
}

export default function ExpenseSheet({ open, onClose, expense }: { open: boolean; onClose: () => void; expense?: ExpenseDto | null }) {
  const { snap, me } = useTrip();
  // New expenses start in the quick form (amount, who paid, for whom).
  const [quick, setQuick] = useState(!expense);
  const online = useOnline();
  const { trip, travelers, exchangeRates, expenses } = snap!;
  const base = trip.baseCurrency;
  const defaultCurrency = expense?.currency ?? trip.localCurrency ?? base;
  const [form, setForm] = useState(() => {
    const date = expense?.date ?? todayIn(snap!.destinations[0]?.timezone ?? trip.homeTimezone);
    const sugg = defaultCurrency !== base ? suggestedRate(exchangeRates, expenses, defaultCurrency, date) : null;
    const initialRate = expense ? (expense.fxSource === 'identity' ? '' : expense.fxRate) : (sugg?.rate ?? '');
    return {
      title: expense?.title ?? '',
      amount: expense ? minorToInput(expense.amountMinor, expense.currency) : '',
      currency: defaultCurrency,
      date,
      category: (expense?.category ?? 'food') as ExpenseCategory,
      payers: expense ? expense.payers.map((p) => p.travelerId) : [me?.id ?? travelers[0]?.id ?? ''],
      payerValues: Object.fromEntries((expense?.payers ?? []).map((p) => [p.travelerId, minorToInput(p.amountMinor, expense!.currency)])) as Record<string, string>,
      participants: expense ? expense.shares.map((s) => s.travelerId) : travelers.map((x) => x.id),
      method: (expense?.splitMethod ?? 'equal') as SplitMethod,
      values: Object.fromEntries(
        (expense?.shares ?? []).map((s) => [
          s.travelerId,
          expense!.splitMethod === 'exact' ? minorToInput(s.shareMinor, expense!.currency) : expense!.splitMethod === 'percent' && s.weight != null ? minorToInput(s.weight, 'EUR') : '',
        ]),
      ) as Record<string, string>,
      rate: initialRate.replace('.', ','),
      rateSource: (expense ? (expense.fxSource === 'identity' ? 'manual' : expense.fxSource) : initialRate ? 'cached' : 'manual') as FxSource,
      rateDate: expense?.fxDate ?? (initialRate ? (sugg?.effectiveDate ?? null) : null),
      notes: expense?.notes ?? '',
    };
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const presets = useMemo(() => splitPresets(travelers, expenses, snap!.bookings), [travelers, expenses, snap]);
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

  const amountMinor = form.amount.trim() ? parseAmount(form.amount, form.currency) : null;
  const needsRate = form.currency !== base;
  const rateNorm = needsRate ? normalizeRate(form.rate) : '1';
  const stored = needsRate ? suggestedRate(exchangeRates, expenses, form.currency, form.date) : null;
  const [saveRate, setSaveRate] = useState(true);
  const hasStoredRate = needsRate && !!storedRateFor(exchangeRates, form.currency, form.date);
  const offerSave = needsRate && form.rateSource === 'manual' && !!rateNorm && (!hasStoredRate || stored?.rate !== rateNorm);
  const converted = amountMinor && rateNorm ? convertMinor(amountMinor, form.currency, base, rateNorm) : null;

  // Split preview & validation
  const split = useMemo(() => {
    const ps = form.participants;
    if (form.method === 'exact') {
      const vals = ps.map((id) => (form.values[id]?.trim() ? parseAmount(form.values[id], form.currency) : 0));
      const bad = vals.some((v) => v === null || v < 0);
      const total = bad ? 0 : sum(vals as number[]);
      return { vals, bad, remaining: (amountMinor ?? 0) - total, unit: 'money' as const };
    }
    if (form.method === 'percent') {
      const vals = ps.map((id) => (form.values[id]?.trim() ? parseAmount(form.values[id], 'EUR') : 0));
      const bad = vals.some((v) => v === null || v < 0 || v > 10000);
      const total = bad ? 0 : sum(vals as number[]);
      return { vals, bad, remaining: 10000 - total, unit: 'percent' as const };
    }
    return { vals: [], bad: false, remaining: 0, unit: 'none' as const };
  }, [form.participants, form.method, form.values, form.currency, amountMinor]);

  // Several payers: each enters what they paid; must add up to the total.
  const multiPay = form.payers.length > 1;
  const pay = useMemo(() => {
    const vals = form.payers.map((id) => (form.payerValues[id]?.trim() ? parseAmount(form.payerValues[id], form.currency) : 0));
    const bad = vals.some((v) => v === null || v < 0);
    return { vals: vals as number[], bad, remaining: (amountMinor ?? 0) - (bad ? 0 : sum(vals as number[])) };
  }, [form.payers, form.payerValues, form.currency, amountMinor]);

  function togglePayer(id: string) {
    if (form.payers.includes(id)) {
      if (form.payers.length > 1) set('payers', form.payers.filter((x) => x !== id));
    } else {
      set('payers', travelers.filter((x) => x.id === id || form.payers.includes(x.id)).map((x) => x.id));
    }
  }

  function fillPayersEvenly() {
    if (!amountMinor) return;
    const n = form.payers.length;
    const each = Math.floor(amountMinor / n);
    set('payerValues', Object.fromEntries(form.payers.map((id, i) => [id, minorToInput(each + (i < amountMinor - each * n ? 1 : 0), form.currency)])));
  }

  function toggleParticipant(id: string) {
    set('participants', form.participants.includes(id) ? form.participants.filter((x) => x !== id) : travelers.filter((x) => x.id === id || form.participants.includes(x.id)).map((x) => x.id));
  }

  function fillEvenly() {
    if (!amountMinor || !form.participants.length) return;
    if (form.method === 'percent') {
      const n = form.participants.length;
      const each = Math.floor(10000 / n);
      const vals = form.participants.map((_, i) => each + (i < 10000 - each * n ? 1 : 0));
      set('values', Object.fromEntries(form.participants.map((id, i) => [id, minorToInput(vals[i], 'EUR')])));
    } else {
      const n = form.participants.length;
      const each = Math.floor(amountMinor / n);
      const vals = form.participants.map((_, i) => each + (i < amountMinor - each * n ? 1 : 0));
      set('values', Object.fromEntries(form.participants.map((id, i) => [id, minorToInput(vals[i], form.currency)])));
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const title = form.title.trim() || (quick ? t.expenseCategories[form.category] : '');
    if (!title) return setError(`${t.wallet.titleField}: ${t.errors.required}`);
    if (!amountMinor || amountMinor <= 0) return setError(t.errors.invalidAmount);
    if (!form.participants.length) return setError(t.wallet.participants + ': ' + t.errors.required);
    if (needsRate && !rateNorm) return setError(t.wallet.rate + ': ' + t.errors.validation);
    if (split.bad || (form.method !== 'equal' && split.remaining !== 0)) return setError(t.errors.validation + ' – ' + t.wallet.splitMethod);
    if (multiPay && (pay.bad || pay.remaining !== 0 || pay.vals.some((v) => v <= 0))) return setError(t.wallet.payersMismatch);
    const payload = {
      title,
      amountMinor,
      currency: form.currency,
      date: form.date,
      category: form.category,
      paidByTravelerId: form.payers[0],
      ...(multiPay ? { payers: form.payers.map((travelerId, i) => ({ travelerId, amountMinor: pay.vals[i] })) } : {}),
      splitMethod: form.method,
      splits: form.participants.map((travelerId, i) => ({ travelerId, ...(form.method === 'equal' ? {} : { value: split.vals[i] as number }) })),
      ...(needsRate ? { fxRate: rateNorm!, fxSource: form.rateSource === 'cached' ? 'cached' : 'manual', fxDate: form.rateSource === 'cached' ? form.rateDate : form.date } : {}),
      notes: form.notes.trim() || null,
    };
    setBusy(true);
    try {
      await tripStore.mutate(async () => {
        // Remember a manually entered rate so it is prefilled next time.
        if (offerSave && saveRate) {
          await http.post(`/trips/${trip.id}/exchange-rates`, { currency: form.currency, rate: rateNorm, effectiveDate: form.date });
        }
        return expense
          ? http.put(`/trips/${trip.id}/expenses/${expense.id}`, { ...payload, version: expense.version })
          : http.post(`/trips/${trip.id}/expenses`, payload);
      });
      toast(t.success.saved);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!travelers.length) {
    return (
      <Sheet open={open} onClose={onClose} title={t.wallet.addExpense}>
        <p className="text-text-2">{t.wallet.needsTravelers}</p>
      </Sheet>
    );
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        size="lg"
        title={expense ? t.wallet.editExpense : t.wallet.addExpense}
        footer={
          <>
            <Button variant="secondary" block onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button block type="submit" form="expense-form" loading={busy} disabled={!online}>
              {t.common.save}
            </Button>
          </>
        }
      >
        <form id="expense-form" onSubmit={submit} className="space-y-4" noValidate>
          {!online && <p className="rounded-2xl bg-warn-soft px-4 py-3 text-[14px] text-warn">{t.errors.offlineAction}</p>}
          {expense?.bookingId && <Badge tone="info">{t.wallet.fromBooking}</Badge>}
          {!quick && <TextField label={t.wallet.titleField} required autoFocus={!expense} value={form.title} onChange={(e) => set('title', e.target.value)} />}
          <MoneyField
            label={t.wallet.amount}
            amount={form.amount}
            currency={form.currency}
            onAmount={(v) => set('amount', v)}
            onCurrency={(c) => {
              const r = c !== base ? suggestedRate(exchangeRates, expenses, c, form.date) : null;
              setForm((f) => ({ ...f, currency: c, rate: r ? r.rate.replace('.', ',') : '', rateSource: r ? 'cached' : 'manual', rateDate: r?.effectiveDate ?? null }));
            }}
            error={form.amount && amountMinor === null ? t.errors.invalidAmount : null}
          />
          {quick && needsRate && rateNorm && converted != null && (
            <p className="-mt-2 text-[13px] text-text-2">
              {t.wallet.convertedTo(money(converted, base))} · {t.wallet.rate} {formatRate(rateNorm)}
            </p>
          )}
          {quick && (
            <TextField
              label={t.wallet.titleField}
              optional
              placeholder={t.wallet.quickTitlePlaceholder(t.expenseCategories[form.category])}
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
            />
          )}
          {needsRate && (!quick || !rateNorm) && (
            <div className="rounded-[1.25rem] border border-line bg-surface p-4">
              <Field label={`${t.wallet.rate} · ${t.wallet.rateHelp(form.currency, base)}`}>
                <Input
                  inputMode="decimal"
                  value={form.rate}
                  placeholder="0,0262"
                  onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value, rateSource: 'manual', rateDate: null }))}
                />
              </Field>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
                <Badge tone={form.rateSource === 'cached' ? 'info' : 'neutral'}>{t.wallet.rateSource[form.rateSource]}</Badge>
                {form.rateSource === 'cached' && form.rateDate && (
                  <span className="text-text-3">
                    {stored?.from === 'lastUsed' && stored.rate === normalizeRate(form.rate) ? t.wallet.rateLastUsed(formatDate(form.rateDate)) : t.wallet.rateFrom(formatDate(form.rateDate))}
                  </span>
                )}
                {converted != null && <span className="ml-auto font-semibold tabular">{t.wallet.convertedTo(money(converted, base))}</span>}
              </div>
              {stored && form.rateSource !== 'cached' && (
                <Button
                  size="sm"
                  variant="soft"
                  className="mt-3"
                  onClick={() => setForm((f) => ({ ...f, rate: stored.rate.replace('.', ','), rateSource: 'cached', rateDate: stored.effectiveDate }))}
                >
                  {t.wallet.useStoredRate} ({formatRate(stored.rate)}, {formatDate(stored.effectiveDate)})
                </Button>
              )}
              {!stored && <p className="mt-2 text-[12px] text-text-3">{t.wallet.noStoredRate}</p>}
              {offerSave && (
                <label className="mt-3 flex items-center gap-2.5 text-[14px]">
                  <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={saveRate} onChange={(e) => setSaveRate(e.target.checked)} />
                  {t.wallet.saveRateForLater(form.currency)}
                </label>
              )}
              <p className="mt-2 text-[12px] text-text-3">{t.wallet.historicNote}</p>
            </div>
          )}
          {quick && (
            <Field label={t.wallet.category}>
              <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {EXPENSE_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={form.category === c}
                    onClick={() => set('category', c)}
                    className={cx('inline-flex h-10 shrink-0 items-center rounded-full border px-3.5 text-[14px] font-semibold', form.category === c ? 'border-transparent bg-text text-bg' : 'border-line bg-surface text-text-2')}
                  >
                    {t.expenseCategories[c]}
                  </button>
                ))}
              </div>
            </Field>
          )}
          <div className={cx('grid gap-3 [&>*]:min-w-0', quick ? 'grid-cols-1' : 'grid-cols-2')}>
            <TextField label={t.wallet.date} type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
            {!quick && (
              <SelectField label={t.wallet.category} value={form.category} onChange={(e) => set('category', e.target.value as ExpenseCategory)}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t.expenseCategories[c]}
                  </option>
                ))}
              </SelectField>
            )}
          </div>
          <Field label={t.wallet.paidBy} hint={!multiPay ? t.wallet.payersHint : undefined}>
            <div className="flex flex-wrap gap-2">
              {travelers.map((x) => {
                const on = form.payers.includes(x.id);
                return (
                  <button
                    key={x.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => togglePayer(x.id)}
                    className={cx('inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-[14px] font-semibold', on ? 'border-transparent bg-text text-bg' : 'border-line bg-surface text-text-2')}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} />
                    {x.name}
                  </button>
                );
              })}
            </div>
          </Field>
          {multiPay && (
            <div className="space-y-2 rounded-[1.25rem] border border-line bg-surface p-4">
              <p className="text-[13px] font-semibold text-text-2">{t.wallet.payersAmounts}</p>
              {form.payers.map((id) => {
                const x = travelers.find((tr) => tr.id === id)!;
                return (
                  <label key={id} className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: x.color }} />
                    <span className="min-w-0 flex-1 truncate text-[15px]">{x.name}</span>
                    <Input
                      inputMode="decimal"
                      className="h-11 w-32 text-right tabular"
                      placeholder="0,00"
                      value={form.payerValues[id] ?? ''}
                      onChange={(e) => set('payerValues', { ...form.payerValues, [id]: e.target.value })}
                      aria-label={`${x.name} ${t.wallet.paid} ${form.currency}`}
                    />
                    <span className="w-9 shrink-0 text-[13px] text-text-3">{form.currency}</span>
                  </label>
                );
              })}
              <div className="flex items-center justify-between gap-2 pt-2 text-[13px]">
                {pay.remaining === 0 && !pay.bad ? (
                  <span className="font-semibold text-success">{t.wallet.payersOk}</span>
                ) : (
                  <span className="font-semibold text-warn">{t.wallet.splitRemaining(money(pay.remaining, form.currency))}</span>
                )}
                <Button size="sm" variant="ghost" onClick={fillPayersEvenly}>
                  {t.wallet.split.equal}
                </Button>
              </div>
            </div>
          )}

          <Field label={quick ? t.wallet.forWhom : t.wallet.participants}>
            {presets.length > 1 && (
              <div className="no-scrollbar -mx-1 mb-2 flex gap-2 overflow-x-auto px-1 pb-1">
                {presets.map((p) => {
                  const on = sameSet(p.ids, form.participants);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setForm((f) => ({ ...f, participants: p.ids, method: 'equal', values: {} }))}
                      className={cx('inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-[13px] font-semibold', on ? 'border-transparent bg-accent text-accent-ink' : 'border-line bg-surface-2 text-text-2')}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {travelers.map((x) => {
                const on = form.participants.includes(x.id);
                return (
                  <button
                    key={x.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleParticipant(x.id)}
                    className={cx('inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-[14px] font-semibold', on ? 'border-transparent bg-text text-bg' : 'border-line bg-surface text-text-2')}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} />
                    {x.name}
                  </button>
                );
              })}
            </div>
          </Field>

          {quick ? (
            <>
              {amountMinor && form.participants.length > 0 && (
                <p className="text-[14px] text-text-2">
                  {t.wallet.perPerson}: ≈ <span className="font-semibold text-text">{money(Math.floor(amountMinor / form.participants.length), form.currency)}</span>
                  {needsRate && rateNorm && <> ({money(Math.floor(convertMinor(amountMinor, form.currency, base, rateNorm) / form.participants.length), base)})</>}
                </p>
              )}
              <Button variant="ghost" size="sm" icon={<SlidersHorizontal size={16} />} onClick={() => setQuick(false)}>
                {t.wallet.moreOptions}
              </Button>
            </>
          ) : (
          <>
          <Field label={t.wallet.splitMethod}>
            <Segmented
              value={form.method}
              onChange={(m) => setForm((f) => ({ ...f, method: m, values: {} }))}
              options={[
                { value: 'equal', label: t.wallet.split.equal },
                { value: 'exact', label: t.wallet.split.exact },
                { value: 'percent', label: t.wallet.split.percent },
              ]}
            />
          </Field>
          {form.method === 'equal' && amountMinor && form.participants.length > 0 && (
            <p className="text-[13px] text-text-2">
              {t.wallet.perPerson}: ≈ {money(Math.floor(amountMinor / form.participants.length), form.currency)}
            </p>
          )}
          {form.method !== 'equal' && (
            <div className="space-y-2 rounded-[1.25rem] border border-line bg-surface p-4">
              {form.participants.map((id) => {
                const x = travelers.find((tr) => tr.id === id)!;
                return (
                  <label key={id} className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} />
                    <span className="min-w-0 flex-1 truncate text-[15px]">{x.name}</span>
                    <Input
                      inputMode="decimal"
                      className="h-11 w-32 text-right tabular"
                      placeholder={form.method === 'percent' ? '0 %' : '0,00'}
                      value={form.values[id] ?? ''}
                      onChange={(e) => set('values', { ...form.values, [id]: e.target.value })}
                      aria-label={`${x.name} ${form.method === 'percent' ? '%' : form.currency}`}
                    />
                    <span className="w-9 text-[13px] text-text-3">{form.method === 'percent' ? '%' : form.currency}</span>
                  </label>
                );
              })}
              <div className="flex items-center justify-between gap-2 pt-2 text-[13px]">
                {split.remaining === 0 && !split.bad ? (
                  <span className="font-semibold text-success">{t.wallet.splitOk}</span>
                ) : (
                  <span className="font-semibold text-warn">
                    {t.wallet.splitRemaining(split.unit === 'percent' ? `${minorToInput(split.remaining, 'EUR')} %` : money(split.remaining, form.currency))}
                  </span>
                )}
                <Button size="sm" variant="ghost" onClick={fillEvenly}>
                  {t.wallet.split.equal}
                </Button>
              </div>
            </div>
          )}
          <TextAreaField label={t.common.notes} optional value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </>
          )}
          {error && (
            <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] text-danger">
              {error}
            </p>
          )}
          {expense && (
            <div className="border-t border-line pt-4">
              <Button variant="danger" size="sm" icon={<Trash2 size={16} />} disabled={!online} onClick={() => setConfirm(true)}>
                {t.common.delete}
              </Button>
            </div>
          )}
        </form>
      </Sheet>
      {expense && (
        <ConfirmDialog
          open={confirm}
          onClose={() => setConfirm(false)}
          title={t.common.delete}
          message={t.wallet.deleteConfirm(expense.title)}
          onConfirm={async () => {
            await tripStore.mutate(() => http.del(`/trips/${trip.id}/expenses/${expense.id}?version=${expense.version}`));
            toast(t.success.deleted);
            onClose();
          }}
        />
      )}
    </>
  );
}
