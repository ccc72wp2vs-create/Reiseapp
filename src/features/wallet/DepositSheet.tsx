import { RotateCcw, Trash2 } from 'lucide-react';
import { Fragment, useMemo, useState, type FormEvent } from 'react';
import { suggestSettlements } from '../../../shared/finance';
import { allocate, convertMinor, minorToInput, normalizeRate, parseAmount } from '../../../shared/money';
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
import { PayersInput, resolvePayers, type PayersValue } from './PayersInput';

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
      payers: {
        ids: deposit ? deposit.payers.map((p) => p.travelerId) : [me ?? travelers[0]?.id ?? ''],
        amounts: deposit && deposit.payers.length > 1 ? Object.fromEntries(deposit.payers.map((p) => [p.travelerId, minorToInput(p.amountMinor, deposit.currency)])) : {},
      } as PayersValue,
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
    const pay = resolvePayers(form.payers, amountMinor, form.currency);
    if ('error' in pay) return setError(pay.error);
    const sugg = needsRate ? suggestedRate(exchangeRates, expenses, form.currency, form.date) : null;
    const payload = {
      title: form.title.trim(),
      amountMinor,
      currency: form.currency,
      ...(needsRate ? { fxRate: rate!, fxSource: sugg && sugg.rate === rate ? 'cached' : 'manual', fxDate: sugg && sugg.rate === rate ? sugg.effectiveDate : form.date } : {}),
      ...pay,
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
          <PayersInput travelers={travelers} currency={form.currency} amountMinor={amountMinor} value={form.payers} onChange={(v) => set('payers', v)} />
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
  const payers = deposit.payers ?? [{ travelerId: deposit.paidByTravelerId, amountMinor: deposit.amountMinor }];
  const [receiver, setReceiver] = useState(payers.length === 1 ? payers[0].travelerId : '');
  const nameOf = (id: string) => snap.travelers.find((x) => x.id === id)?.name ?? '?';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keptMinor = kept.trim() ? parseAmount(kept, deposit.currency) : null;
  const who = snap.travelers.filter((x) => (deposit.travelerIds.length ? deposit.travelerIds.includes(x.id) : true)).map((x) => x.name);
  const keptValue = outcome === 'kept' ? deposit.amountMinor : outcome === 'partial' ? keptMinor : 0;

  async function save() {
    setError(null);
    if (outcome === 'partial' && (!keptMinor || keptMinor <= 0 || keptMinor > deposit.amountMinor)) return setError(t.deposits.keptInvalid(money(deposit.amountMinor, deposit.currency)));
    if (outcome !== 'kept' && !receiver) return setError(`${t.deposits.returnedTo}: ${t.errors.required}`);
    setBusy(true);
    try {
      await tripStore.mutate(() =>
        http.post(`/trips/${snap.trip.id}/deposits/${deposit.id}/resolve`, {
          outcome,
          ...(outcome === 'partial' ? { keptMinor } : {}),
          ...(outcome !== 'kept' ? { returnedToTravelerId: receiver } : {}),
          date,
          version: deposit.version,
        }),
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
        <DepositSummary snap={snap} deposit={deposit} />
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
        {outcome !== 'kept' && (
          <>
            <SelectField label={t.deposits.returnedTo} value={receiver} onChange={(e) => setReceiver(e.target.value)}>
              <option value="">–</option>
              {snap.travelers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </SelectField>
            {receiver && payers.some((p) => p.travelerId !== receiver) && (
              <div className="rounded-[1.25rem] bg-surface p-4 text-[14px]">
                <p className="text-text-2">{t.deposits.returnedToHint}</p>
                <ul className="mt-2 space-y-1">
                  {(() => {
                    const k = keptValue ?? 0;
                    const parts = k > 0 && payers.length > 1 ? allocate(k, payers.map((p) => p.amountMinor)) : payers.map(() => 0);
                    return payers
                      .map((p, i) => ({ id: p.travelerId, a: p.amountMinor - parts[i] }))
                      .filter((x) => x.id !== receiver && x.a > 0)
                      .map((x) => (
                        <li key={x.id} className="flex justify-between gap-2">
                          <span>
                            {nameOf(receiver)} {t.deposits.holdsShare(nameOf(x.id), '')}
                          </span>
                          <span className="font-semibold tabular">{money(x.a, deposit.currency)}</span>
                        </li>
                      ));
                  })()}
                </ul>
              </div>
            )}
          </>
        )}
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

/**
 * Info for a closed deposit: who got the money, what everyone put in and gets
 * back, and – together with the linked booking's cost (e.g. the rent) – which
 * transfers would settle this rental fairly. Purely informational: the
 * balances in the wallet already include all of it.
 */
function DepositSummary({ snap, deposit }: { snap: TripSnapshot; deposit: DepositDto }) {
  const cur = deposit.currency;
  const name = (id: string) => snap.travelers.find((x) => x.id === id)?.name ?? '?';
  const payers = deposit.payers?.length ? deposit.payers : [{ travelerId: deposit.paidByTravelerId, amountMinor: deposit.amountMinor }];
  const kept = deposit.keptMinor ?? 0;
  const returned = deposit.amountMinor - kept;
  const unit = [kept, ...payers.map((p) => p.amountMinor)].every((v) => v % 100 === 0) ? 100 : 1;
  const keptParts = kept > 0 ? allocate(kept / unit, payers.map((p) => p.amountMinor / unit)).map((x) => x * unit) : payers.map(() => 0);
  const keptExpense = snap.expenses.find((e) => e.id === deposit.expenseId);
  const costExpense =
    snap.expenses.find((e) => e.id === deposit.costExpenseId && e.currency === cur) ??
    (deposit.bookingId ? snap.expenses.find((e) => e.bookingId === deposit.bookingId && e.currency === cur) : undefined);

  // Net position per person for this rental: put in − own shares − money received.
  const net = new Map<string, number>();
  const add = (id: string, v: number) => net.set(id, (net.get(id) ?? 0) + v);
  payers.forEach((p) => add(p.travelerId, p.amountMinor));
  for (const e of [costExpense, keptExpense]) {
    if (!e || e.currency !== cur) continue;
    e.payers.forEach((p) => e === costExpense && add(p.travelerId, p.amountMinor));
    e.shares.forEach((s) => add(s.travelerId, -s.shareMinor));
  }
  // The kept expense's "payers" are the deposit contributors (already counted above).
  if (deposit.returnedToTravelerId && returned > 0) add(deposit.returnedToTravelerId, -returned);
  const transfers = suggestSettlements(
    [...net].map(([travelerId, balanceMinor]) => ({ travelerId, balanceMinor, paidMinor: 0, owedMinor: 0, settledOutMinor: 0, settledInMinor: 0 })),
  );
  const perPerson = costExpense ? costExpense.shares.find((s) => s.travelerId === payers[0].travelerId)?.shareMinor ?? 0 : 0;
  const keptPerPerson = keptExpense?.shares[0]?.shareMinor ?? 0;

  return (
    <div className="mt-4 space-y-4">
      {deposit.returnedToTravelerId && returned > 0 && (
        <div className="rounded-[1.25rem] bg-surface p-4">
          <p className="text-[13px] text-text-3">{t.deposits.receivedBy}</p>
          <p className="font-semibold">
            {name(deposit.returnedToTravelerId)} · {money(returned, cur)}
          </p>
        </div>
      )}
      <div className="rounded-[1.25rem] border border-line bg-surface p-4">
        <p className="text-[13px] font-semibold text-text-2">{t.deposits.perPersonTitle}</p>
        <div className="mt-2 grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1.5 text-[13px]">
          <span className="text-text-3" />
          <span className="text-right text-text-3">{t.deposits.colPut}</span>
          <span className="text-right text-text-3">{t.deposits.colKept}</span>
          <span className="text-right text-text-3">{t.deposits.colBack}</span>
          {payers.map((p, i) => (
            <Fragment key={p.travelerId}>
              <span className="truncate">{name(p.travelerId)}</span>
              <span className="text-right tabular">{money(p.amountMinor, cur)}</span>
              <span className="text-right tabular text-danger">{keptParts[i] ? `−${money(keptParts[i], cur)}` : '–'}</span>
              <span className="text-right font-semibold tabular">{money(p.amountMinor - keptParts[i], cur)}</span>
            </Fragment>
          ))}
        </div>
        {kept > 0 && keptPerPerson > 0 && <p className="mt-2 text-[12px] text-text-3">{t.deposits.keptShared(money(kept, cur), money(keptPerPerson, cur))}</p>}
      </div>
      <div className="rounded-[1.25rem] border border-accent/40 bg-accent-soft p-4">
        <p className="text-[13px] font-semibold text-accent">{t.deposits.fairTitle}</p>
        {transfers.length === 0 ? (
          <p className="mt-1 text-[14px]">{t.deposits.fairNone}</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-[14px]">
            {transfers.map((x, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span>
                  <span className="font-semibold">{name(x.fromTravelerId)}</span> → <span className="font-semibold">{name(x.toTravelerId)}</span>
                </span>
                <span className="font-semibold tabular">{money(x.amountMinor, cur)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[12px] text-text-2">
          {costExpense ? t.deposits.fairHintWithCost(costExpense.title, money(perPerson + keptPerPerson, cur)) : t.deposits.fairHint}
        </p>
      </div>
    </div>
  );
}
