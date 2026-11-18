/**
 * "Beleg aufteilen": photo of a receipt → line items → tap who each line was
 * for (person, couple or everyone) → one expense with exact shares. The tip is
 * shared equally by everyone involved. The photo is analysed in memory only.
 */
import { Camera, Check, Plus, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { groupCouples } from '../../../shared/couples';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../../../shared/constants';
import { convertMinor, minorToInput, normalizeRate, parseAmount } from '../../../shared/money';
import { splitReceipt } from '../../../shared/receipt';
import { todayIn } from '../../../shared/trip';
import type { TripSnapshot } from '../../../shared/types';
import { useTrip } from '../../components/AppShell';
import { toast } from '../../components/toast';
import { Button, Chip, Input, SelectField, Sheet, TextField, cx } from '../../components/ui';
import { t } from '../../i18n';
import { errorMessage, http } from '../../lib/api';
import { analyzeReceipt } from '../../lib/documents';
import { money } from '../../lib/format';
import { suggestedRate } from '../../lib/rates';
import { tripStore, useOnline } from '../../lib/store';

interface Line {
  key: number;
  name: string;
  amount: string;
  who: string[];
}

const signedMinor = (s: string, cur: string) => {
  const neg = s.trim().startsWith('-');
  const v = parseAmount(s.replace('-', ''), cur);
  return v == null ? null : neg ? -v : v;
};

export default function ReceiptSplitSheet({ snap, onClose }: { snap: TripSnapshot; onClose: () => void }) {
  const { user } = useTrip();
  const online = useOnline();
  const { trip, travelers, exchangeRates, expenses } = snap;
  const order = travelers.map((x) => x.id);
  const couples = groupCouples(travelers).filter((c) => c.memberIds.length > 1);
  const me = travelers.find((x) => x.userId && x.userId === user?.id)?.id ?? travelers[0]?.id ?? '';
  const today = todayIn(snap.destinations[0]?.timezone ?? trip.homeTimezone);
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'photo' | 'reading' | 'edit'>('photo');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today);
  const [currency, setCurrency] = useState(trip.localCurrency ?? trip.baseCurrency);
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [payer, setPayer] = useState(me);
  const [lines, setLines] = useState<Line[]>([]);
  const [tip, setTip] = useState('');
  const [printedTotal, setPrintedTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const nextKey = useRef(1);

  async function read(file: File) {
    setStep('reading');
    try {
      const r = await analyzeReceipt(trip.id, file);
      if (!r || !r.lines.length) {
        toast(t.receipt.notRead, 'error');
        setLines([{ key: nextKey.current++, name: '', amount: '', who: order }]);
      } else {
        const cur = r.currency ?? currency;
        setCurrency(cur);
        setLines(r.lines.map((l) => ({ key: nextKey.current++, name: l.qty > 1 ? `${l.qty}× ${l.name}` : l.name, amount: minorToInput(l.amountMinor, cur), who: order })));
        setTip(r.tipMinor ? minorToInput(r.tipMinor, cur) : '');
        setPrintedTotal(r.totalMinor);
        if (r.merchant) setTitle(r.merchant);
        if (r.date) setDate(r.date);
      }
    } catch (e) {
      toast(errorMessage(e), 'error');
      setLines([{ key: nextKey.current++, name: '', amount: '', who: order }]);
    }
    setStep('edit');
  }

  const parsed = lines.map((l) => ({ ...l, minor: signedMinor(l.amount, currency) }));
  const tipMinor = tip.trim() ? (parseAmount(tip, currency) ?? 0) : 0;
  const split = useMemo(
    () => splitReceipt(parsed.filter((l) => l.minor != null).map((l) => ({ amountMinor: l.minor!, travelerIds: l.who })), tipMinor, order),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(parsed.map((l) => [l.minor, l.who])), tipMinor],
  );
  const diff = printedTotal != null ? split.totalMinor - printedTotal : 0;
  const invalid = parsed.some((l) => l.minor == null || !l.name.trim()) || split.unassigned > 0 || split.totalMinor <= 0 || split.shares.some((s) => s.amountMinor < 0);
  const suggested = currency !== trip.baseCurrency ? suggestedRate(exchangeRates, expenses, currency, date) : null;
  const [ownRate, setOwnRate] = useState('');
  const typedRate = ownRate.trim() ? normalizeRate(ownRate) : null;
  const rate = currency === trip.baseCurrency ? null : typedRate ? { rate: typedRate, effectiveDate: date, manual: true } : suggested ? { ...suggested, manual: false } : null;
  const name = (id: string) => travelers.find((x) => x.id === id)?.name ?? '?';

  const setWho = (key: number, who: string[]) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, who } : l)));
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

  async function save() {
    if (invalid) return;
    if (currency !== trip.baseCurrency && !rate) return toast(t.receipt.noRate(currency), 'error');
    setBusy(true);
    try {
      const notes = [
        t.receipt.notesHead(money(split.totalMinor, currency)),
        ...parsed.map((l) => `${l.name}: ${money(l.minor!, currency)} → ${couples.find((c) => same(c.memberIds, l.who)) ? l.who.map(name).join(' & ') : same(l.who, order) ? t.receipt.everyone : l.who.map(name).join(', ')}`),
        ...(tipMinor ? [t.receipt.tipNote(money(tipMinor, currency))] : []),
      ].join('\n');
      await tripStore.mutate(() =>
        http.post(`/trips/${trip.id}/expenses`, {
          title: title.trim() || t.receipt.defaultTitle,
          amountMinor: split.totalMinor,
          currency,
          date,
          category,
          paidByTravelerId: payer,
          splitMethod: 'exact',
          splits: split.shares.map((s) => ({ travelerId: s.travelerId, value: s.amountMinor })),
          ...(currency !== trip.baseCurrency ? { fxRate: rate!.rate, fxSource: rate!.manual ? 'manual' : 'cached', fxDate: rate!.effectiveDate } : {}),
          notes: notes.slice(0, 2000),
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
      size="lg"
      title={t.receipt.title}
      footer={
        step === 'edit' ? (
          <>
            <Button variant="secondary" block onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button block loading={busy} disabled={invalid || !online} onClick={save}>
              {t.receipt.save}
            </Button>
          </>
        ) : (
          <Button variant="secondary" block onClick={onClose}>
            {t.common.cancel}
          </Button>
        )
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void read(f);
        }}
      />
      {step === 'photo' && (
        <div className="space-y-4 py-2">
          <p className="text-[14px] text-text-2">{t.receipt.intro}</p>
          <Button block icon={<Camera size={18} />} disabled={!online} onClick={() => fileRef.current?.click()}>
            {t.receipt.takePhoto}
          </Button>
          <button type="button" className="w-full text-center text-[14px] font-semibold text-accent" onClick={() => { setLines([{ key: nextKey.current++, name: '', amount: '', who: order }]); setStep('edit'); }}>
            {t.receipt.manual}
          </button>
          <p className="text-[12px] text-text-3">{t.receipt.privacy}</p>
        </div>
      )}
      {step === 'reading' && <p className="py-10 text-center text-text-2">{t.receipt.reading}</p>}
      {step === 'edit' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <TextField label={t.receipt.place} value={title} onChange={(e) => setTitle(e.target.value)} className="col-span-2" />
            <TextField label={t.wallet.date} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <SelectField label={t.wallet.paidBy} value={payer} onChange={(e) => setPayer(e.target.value)}>
              {travelers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </SelectField>
            <SelectField label={t.wallet.category} value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className="col-span-2">
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t.expenseCategories[c]}
                </option>
              ))}
            </SelectField>
          </div>

          <div>
            <p className="mb-2 text-[13px] font-semibold text-text-2">{t.receipt.linesHint}</p>
            <ul className="space-y-3">
              {lines.map((l) => {
                const p = parsed.find((x) => x.key === l.key)!;
                return (
                  <li key={l.key} className={cx('rounded-2xl border p-3', l.who.length ? 'border-line bg-surface' : 'border-warn/40 bg-warn-soft')}>
                    <div className="flex items-center gap-2">
                      <Input aria-label={t.receipt.item} value={l.name} placeholder={t.receipt.item} onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, name: e.target.value } : x)))} className="h-10 min-w-0 flex-1" />
                      <Input aria-label={t.wallet.amount} inputMode="decimal" value={l.amount} onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, amount: e.target.value } : x)))} className={cx('h-10 w-24 text-right tabular', p.minor == null && 'border-danger')} />
                      <button type="button" aria-label={t.common.delete} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="grid h-10 w-8 place-items-center text-text-3">
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto">
                      <Chip active={same(l.who, order)} onClick={() => setWho(l.key, order)}>
                        {t.receipt.everyone}
                      </Chip>
                      {couples.map((c) => (
                        <Chip key={c.key} active={same(l.who, c.memberIds)} onClick={() => setWho(l.key, c.memberIds)}>
                          {c.memberIds.map(name).join(' & ')}
                        </Chip>
                      ))}
                      {travelers.map((x) => (
                        <Chip key={x.id} active={l.who.length === 1 && l.who[0] === x.id} onClick={() => setWho(l.key, [x.id])}>
                          {x.name}
                        </Chip>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
            <Button className="mt-3" size="sm" variant="soft" icon={<Plus size={16} />} onClick={() => setLines((ls) => [...ls, { key: nextKey.current++, name: '', amount: '', who: order }])}>
              {t.receipt.addLine}
            </Button>
          </div>

          {currency !== trip.baseCurrency && (
            <TextField
              label={t.receipt.rate(currency, trip.baseCurrency)}
              hint={suggested ? t.receipt.rateSuggested(suggested.rate.replace('.', ',')) : t.receipt.rateNeeded}
              inputMode="decimal"
              placeholder={suggested?.rate.replace('.', ',') ?? '0,0265'}
              value={ownRate}
              onChange={(e) => setOwnRate(e.target.value)}
              optional={!!suggested}
            />
          )}

          <TextField label={t.receipt.tip} hint={t.receipt.tipHint} inputMode="decimal" value={tip} onChange={(e) => setTip(e.target.value)} optional />

          <div className="rounded-2xl bg-surface-2 p-4">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">{t.receipt.total}</span>
              <span className="font-display text-[22px] font-semibold tabular">{money(split.totalMinor, currency)}</span>
            </div>
            {printedTotal != null && (
              <p className={cx('mt-1 flex items-center gap-1.5 text-[13px] font-semibold', diff === 0 ? 'text-success' : 'text-warn')}>
                {diff === 0 ? <Check size={14} /> : null}
                {diff === 0 ? t.receipt.matches(money(printedTotal, currency)) : t.receipt.mismatch(money(printedTotal, currency), money(Math.abs(diff), currency), diff > 0)}
              </p>
            )}
            {split.unassigned > 0 && <p className="mt-1 text-[13px] font-semibold text-warn">{t.receipt.unassigned(split.unassigned)}</p>}
            <ul className="mt-3 space-y-1 text-[14px]">
              {split.shares.map((s) => (
                <li key={s.travelerId} className="flex justify-between">
                  <span>{name(s.travelerId)}</span>
                  <span className="tabular">
                    {money(s.amountMinor, currency)}
                    {currency !== trip.baseCurrency && rate && <span className="text-text-3"> ≈ {money(convertMinor(s.amountMinor, currency, trip.baseCurrency, rate.rate), trip.baseCurrency)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Sheet>
  );
}
