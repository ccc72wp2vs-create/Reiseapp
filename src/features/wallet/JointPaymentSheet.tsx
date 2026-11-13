import { useMemo, useState, type FormEvent } from 'react';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../../../shared/constants';
import { allocate, convertMinor, minorToInput, normalizeRate, parseAmount, sum } from '../../../shared/money';
import { todayIn } from '../../../shared/trip';
import type { DepositMethod, TripSnapshot } from '../../../shared/types';
import { toast } from '../../components/toast';
import { Button, Field, Input, SelectField, Sheet, TextField, cx } from '../../components/ui';
import { t } from '../../i18n';
import { errorMessage, http } from '../../lib/api';
import { money } from '../../lib/format';
import { suggestedRate } from '../../lib/rates';
import { tripStore, useOnline } from '../../lib/store';
import { splitPresets } from './ExpenseSheet';

export interface JointPreset {
  title?: string;
  costMinor?: number | null;
  currency?: string | null;
  date?: string | null;
  returnDate?: string | null;
  bookingId?: string | null;
  forTravelerIds?: string[];
  category?: ExpenseCategory;
}

/**
 * "Gemeinsam vor Ort bezahlt": everybody hands over what they have (e.g. rent
 * + deposit for a rental car). The app books the cost as an equally shared
 * expense, the rest as a deposit, and the balances take care of the rest.
 */
export function JointPaymentSheet({ snap, preset, onClose }: { snap: TripSnapshot; preset?: JointPreset; onClose: () => void }) {
  const online = useOnline();
  const { trip, travelers, exchangeRates, expenses, bookings } = snap;
  const base = trip.baseCurrency;
  const [form, setForm] = useState(() => {
    const currency = preset?.currency ?? trip.localCurrency ?? base;
    const date = preset?.date ?? todayIn(snap.destinations[0]?.timezone ?? trip.homeTimezone);
    const sugg = currency !== base ? suggestedRate(exchangeRates, expenses, currency, date) : null;
    return {
      title: preset?.title ?? '',
      currency,
      rate: sugg?.rate.replace('.', ',') ?? '',
      date,
      category: preset?.category ?? ('transportation' as ExpenseCategory),
      contributions: {} as Record<string, string>,
      cost: preset?.costMinor ? minorToInput(preset.costMinor, currency) : '',
      deposit: '',
      method: 'cash' as DepositMethod,
      returnDate: preset?.returnDate ?? '',
      changeTo: '',
      change: '',
      forIds: preset?.forTravelerIds?.length ? preset.forTravelerIds : travelers.map((x) => x.id),
    };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const presets = useMemo(() => splitPresets(travelers, expenses, bookings), [travelers, expenses, bookings]);
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  const amt = (v: string) => (v.trim() ? parseAmount(v, form.currency) : 0);
  const cur = form.currency;

  const contrib = travelers.map((x) => ({ id: x.id, v: amt(form.contributions[x.id] ?? '') }));
  const invalid = contrib.some((c) => c.v == null || c.v < 0) || amt(form.cost) == null || amt(form.deposit) == null || amt(form.change) == null;
  const handed = sum(contrib.map((c) => c.v ?? 0));
  const cost = amt(form.cost) ?? 0;
  const deposit = amt(form.deposit) ?? 0;
  const change = form.changeTo ? (amt(form.change) ?? 0) : 0;
  const diff = handed - change - cost - deposit;
  const needsRate = cur !== base;
  const rate = needsRate ? normalizeRate(form.rate) : '1';
  const shares = form.forIds.length && cost ? allocate(cost, form.forIds.map(() => 1)) : [];
  const shareOf = (id: string) => {
    const i = form.forIds.indexOf(id);
    return i >= 0 ? (shares[i] ?? 0) : 0;
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) return setError(`${t.deposits.what}: ${t.errors.required}`);
    if (invalid) return setError(t.errors.invalidAmount);
    if (!cost && !deposit) return setError(t.joint.nothing);
    if (diff !== 0) return setError(diff > 0 ? t.joint.tooMuch(money(diff, cur)) : t.joint.missing(money(-diff, cur)));
    if (needsRate && !rate) return setError(`${t.wallet.rate}: ${t.errors.validation}`);
    if (!form.forIds.length) return setError(`${t.deposits.forWhom}: ${t.errors.required}`);
    const sugg = needsRate ? suggestedRate(exchangeRates, expenses, cur, form.date) : null;
    setBusy(true);
    try {
      await tripStore.mutate(() =>
        http.post(`/trips/${trip.id}/joint-payments`, {
          title: form.title.trim(),
          currency: cur,
          ...(needsRate ? { fxRate: rate!, fxSource: sugg?.rate === rate ? 'cached' : 'manual', fxDate: sugg?.rate === rate ? sugg.effectiveDate : form.date } : {}),
          date: form.date,
          category: form.category,
          contributions: contrib.filter((c) => (c.v ?? 0) > 0).map((c) => ({ travelerId: c.id, amountMinor: c.v! })),
          change: change > 0 ? { travelerId: form.changeTo, amountMinor: change } : null,
          costMinor: cost,
          forTravelerIds: form.forIds,
          deposit: deposit > 0 ? { amountMinor: deposit, method: form.method, returnDate: form.returnDate || null } : null,
          bookingId: preset?.bookingId ?? null,
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
      open
      onClose={onClose}
      size="lg"
      title={t.joint.title}
      footer={
        <>
          <Button variant="secondary" block onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button block type="submit" form="joint-form" loading={busy} disabled={!online}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <form id="joint-form" onSubmit={submit} className="space-y-4" noValidate>
        <p className="rounded-2xl bg-info-soft px-4 py-3 text-[14px] text-info">{t.joint.explain}</p>
        <TextField label={t.deposits.what} placeholder={t.deposits.whatPlaceholder} value={form.title} onChange={(e) => set('title', e.target.value)} />
        <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
          <TextField label={t.wallet.date} type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
          <SelectField label={t.joint.currency} value={cur} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value, rate: e.target.value !== base ? (suggestedRate(exchangeRates, expenses, e.target.value, f.date)?.rate.replace('.', ',') ?? '') : '' }))}>
            {[...new Set([trip.localCurrency, base].filter(Boolean) as string[])].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
        </div>
        {needsRate && (
          <Field label={`${t.wallet.rate} · ${t.wallet.rateHelp(cur, base)}`} htmlFor="joint-rate">
            <Input id="joint-rate" inputMode="decimal" value={form.rate} onChange={(e) => set('rate', e.target.value)} />
          </Field>
        )}

        <section className="space-y-2 rounded-[1.25rem] border border-line bg-surface p-4">
          <h3 className="text-[15px] font-semibold">{t.joint.handed}</h3>
          <p className="text-[13px] text-text-3">{t.joint.handedHint}</p>
          {travelers.map((x) => (
            <label key={x.id} className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: x.color }} />
              <span className="min-w-0 flex-1 truncate text-[15px]">{x.name}</span>
              <Input
                inputMode="decimal"
                className="h-11 w-32 text-right tabular"
                placeholder="0"
                value={form.contributions[x.id] ?? ''}
                onChange={(e) => set('contributions', { ...form.contributions, [x.id]: e.target.value })}
                aria-label={`${x.name} ${t.joint.gave} ${cur}`}
              />
              <span className="w-9 shrink-0 text-[13px] text-text-3">{cur}</span>
            </label>
          ))}
          <p className="pt-1 text-right text-[14px] font-semibold tabular">
            {t.joint.sum}: {money(handed, cur)}
          </p>
        </section>

        <section className="space-y-3 rounded-[1.25rem] border border-line bg-surface p-4">
          <h3 className="text-[15px] font-semibold">{t.joint.forWhat}</h3>
          <AmountField id="joint-cost" label={t.joint.cost} value={form.cost} currency={cur} onChange={(v) => set('cost', v)} />
          <SelectField label={t.wallet.category} value={form.category} onChange={(e) => set('category', e.target.value as ExpenseCategory)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t.expenseCategories[c]}
              </option>
            ))}
          </SelectField>
          <AmountField id="joint-deposit" label={t.deposits.amount} optional value={form.deposit} currency={cur} onChange={(v) => set('deposit', v)} />
          {deposit > 0 && (
            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
              <SelectField label={t.deposits.method} value={form.method} onChange={(e) => set('method', e.target.value as DepositMethod)}>
                {(['cash', 'card', 'transfer'] as const).map((m) => (
                  <option key={m} value={m}>
                    {t.deposits.methods[m]}
                  </option>
                ))}
              </SelectField>
              <TextField label={t.deposits.returnDate} optional type="date" value={form.returnDate} onChange={(e) => set('returnDate', e.target.value)} />
            </div>
          )}
          <Field label={t.deposits.forWhom}>
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {presets.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={sameSet(p.ids, form.forIds)}
                  onClick={() => set('forIds', p.ids)}
                  className={cx('inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-[13px] font-semibold', sameSet(p.ids, form.forIds) ? 'border-transparent bg-accent text-accent-ink' : 'border-line bg-surface-2 text-text-2')}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Field>
        </section>

        {/* Plausibility & change */}
        {!invalid && (handed > 0 || cost > 0) && (
          <div className={cx('rounded-[1.25rem] p-4 text-[14px]', diff === 0 ? 'bg-success-soft text-success' : 'bg-warn-soft text-warn')}>
            {diff === 0 ? (
              <p className="font-semibold">{t.joint.fits}</p>
            ) : diff > 0 ? (
              <>
                <p className="font-semibold">{t.joint.tooMuch(money(diff, cur))}</p>
                {!form.changeTo && (
                  <p className="mt-1 text-text-2">{t.joint.changeQuestion}</p>
                )}
              </>
            ) : (
              <p className="font-semibold">{t.joint.missing(money(-diff, cur))}</p>
            )}
          </div>
        )}
        {(diff > 0 || form.changeTo) && (
          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <SelectField
              label={t.joint.changeTo}
              value={form.changeTo}
              onChange={(e) => setForm((f) => ({ ...f, changeTo: e.target.value, change: e.target.value && !f.change ? minorToInput(Math.max(0, diff), cur) : f.change }))}
            >
              <option value="">{t.joint.noChange}</option>
              {travelers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </SelectField>
            {form.changeTo && (
              <Field label={t.joint.change} htmlFor="joint-change">
                <Input id="joint-change" inputMode="decimal" value={form.change} onChange={(e) => set('change', e.target.value)} />
              </Field>
            )}
          </div>
        )}

        {/* What it means per person */}
        {diff === 0 && cost > 0 && (
          <section className="rounded-[1.25rem] border border-line bg-surface p-4">
            <h3 className="text-[15px] font-semibold">{t.joint.preview}</h3>
            <div className="mt-2 divide-y divide-line text-[14px]">
              {travelers.map((x) => {
                const gave = (contrib.find((c) => c.id === x.id)?.v ?? 0) - (form.changeTo === x.id ? change : 0);
                const own = shareOf(x.id);
                const delta = gave - own;
                if (!gave && !own) return null;
                return (
                  <div key={x.id} className="flex items-center gap-2 py-2">
                    <span className="min-w-0 flex-1 truncate">{x.name}</span>
                    <span className="w-24 text-right tabular text-text-3">{money(gave, cur)}</span>
                    <span className={cx('w-28 text-right font-semibold tabular', delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-text-3')}>
                      {delta > 0 ? '+' : ''}
                      {money(delta, cur)}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[12px] text-text-3">{t.joint.previewHint(money(shares[0] ?? 0, cur))}</p>
            {needsRate && rate && <p className="mt-1 text-[12px] text-text-3">{t.wallet.convertedTo(money(convertMinor(cost + deposit, cur, base, rate), base))}</p>}
          </section>
        )}
        {error && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] text-danger">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}

function AmountField({ id, label, value, currency, onChange, optional }: { id: string; label: string; value: string; currency: string; onChange: (v: string) => void; optional?: boolean }) {
  return (
    <Field label={label} htmlFor={id} optional={optional}>
      <div className="relative">
        <Input id={id} inputMode="decimal" autoComplete="off" placeholder="0" className="pr-14 tabular" value={value} onChange={(e) => onChange(e.target.value)} />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-text-3">{currency}</span>
      </div>
    </Field>
  );
}
