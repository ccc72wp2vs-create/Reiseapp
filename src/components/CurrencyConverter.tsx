import { ArrowDownUp, Calculator } from 'lucide-react';
import { useState } from 'react';
import { convertMinor, currencyExponent, parseAmount, parseRate } from '../../shared/money';
import type { TripSnapshot } from '../../shared/types';
import { t } from '../i18n';
import { formatRate, money } from '../lib/format';
import { suggestedRate } from '../lib/rates';
import { Input } from './ui';

/** Quick local ↔ base currency calculator with the trip's stored rate. */
export function CurrencyConverter({ snap, today }: { snap: TripSnapshot; today: string }) {
  const { trip, exchangeRates, expenses } = snap;
  const local = trip.localCurrency;
  const base = trip.baseCurrency;
  const [amount, setAmount] = useState('');
  const [reverse, setReverse] = useState(false);
  if (!local || local === base) return null;
  const rate = suggestedRate(exchangeRates, expenses, local, today);
  if (!rate) return null;
  const from = reverse ? base : local;
  const to = reverse ? local : base;
  const minor = amount.trim() ? parseAmount(amount, from) : null;
  let result: number | null = null;
  if (minor != null && minor >= 0) {
    if (!reverse) result = convertMinor(minor, local, base, rate.rate);
    else {
      const p = parseRate(rate.rate)!;
      const r = Number(p.numerator) / 10 ** p.scale;
      result = Math.round((minor / 10 ** currencyExponent(base) / r) * 10 ** currencyExponent(local));
    }
  }
  return (
    <section aria-label={t.home.converter} className="mt-6 rounded-[1.5rem] border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-text-3">
        <Calculator size={14} /> {t.home.converter}
        <span className="ml-auto normal-case tracking-normal">
          1 {local} = {formatRate(rate.rate)} {base}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Input inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={`${t.home.converter} ${from}`} className="pr-14 text-[18px] font-semibold tabular" />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-text-3">{from}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            setReverse((r) => !r);
            setAmount('');
          }}
          aria-label={t.home.swapCurrencies}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-accent"
        >
          <ArrowDownUp size={18} />
        </button>
      </div>
      <p className="mt-3 font-display text-[26px] font-semibold tabular" aria-live="polite">
        {result != null ? money(result, to) : <span className="text-text-3">– {to}</span>}
      </p>
    </section>
  );
}
