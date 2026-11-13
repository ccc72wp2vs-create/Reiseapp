import { minorToInput, parseAmount, sum } from '../../../shared/money';
import type { TravelerDto } from '../../../shared/types';
import { Button, Field, Input, cx } from '../../components/ui';
import { t } from '../../i18n';
import { money } from '../../lib/format';

export interface PayersValue {
  ids: string[];
  /** Amount per person (input text, deposit currency) – only used for 2+ people. */
  amounts: Record<string, string>;
}

function evenly(ids: string[], amountMinor: number, currency: string): Record<string, string> {
  const n = ids.length;
  const each = Math.floor(amountMinor / n);
  return Object.fromEntries(ids.map((id, i) => [id, minorToInput(each + (i < amountMinor - each * n ? 1 : 0), currency)]));
}

/** Validates the payers; returns the API payload part or an error message. */
export function resolvePayers(v: PayersValue, amountMinor: number | null, currency: string): { paidByTravelerId: string; payers?: { travelerId: string; amountMinor: number }[] } | { error: string } {
  if (!v.ids.length) return { error: `${t.deposits.paidBy}: ${t.errors.required}` };
  if (v.ids.length === 1 || !amountMinor) return { paidByTravelerId: v.ids[0] };
  const vals = v.ids.map((id) => (v.amounts[id]?.trim() ? parseAmount(v.amounts[id], currency) : null));
  if (vals.some((x) => x == null || x <= 0) || sum(vals as number[]) !== amountMinor) return { error: t.deposits.payersMismatch };
  return { paidByTravelerId: v.ids[0], payers: v.ids.map((travelerId, i) => ({ travelerId, amountMinor: vals[i]! })) };
}

/** "Hinterlegt von": one or several people, with an amount each when several. */
export function PayersInput({
  travelers,
  currency,
  amountMinor,
  value,
  onChange,
}: {
  travelers: TravelerDto[];
  currency: string;
  amountMinor: number | null;
  value: PayersValue;
  onChange: (v: PayersValue) => void;
}) {
  const multi = value.ids.length > 1;
  const vals = value.ids.map((id) => (value.amounts[id]?.trim() ? parseAmount(value.amounts[id], currency) : 0));
  const remaining = (amountMinor ?? 0) - sum(vals.map((x) => x ?? 0));
  const toggle = (id: string) => {
    const on = value.ids.includes(id);
    if (on && value.ids.length === 1) return;
    const ids = on ? value.ids.filter((x) => x !== id) : travelers.filter((x) => x.id === id || value.ids.includes(x.id)).map((x) => x.id);
    onChange({ ids, amounts: ids.length > 1 && amountMinor ? evenly(ids, amountMinor, currency) : {} });
  };
  return (
    <Field label={t.deposits.paidBy} hint={multi ? undefined : t.deposits.payersHint}>
      <div className="flex flex-wrap gap-2">
        {travelers.map((x) => {
          const on = value.ids.includes(x.id);
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
      {multi && (
        <div className="mt-3 space-y-2 rounded-[1.25rem] border border-line bg-surface-2 p-3">
          {value.ids.map((id) => {
            const x = travelers.find((tr) => tr.id === id)!;
            return (
              <label key={id} className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: x.color }} />
                <span className="min-w-0 flex-1 truncate text-[15px]">{x.name}</span>
                <Input
                  inputMode="decimal"
                  className="h-11 w-32 text-right tabular"
                  placeholder="0,00"
                  value={value.amounts[id] ?? ''}
                  onChange={(e) => onChange({ ...value, amounts: { ...value.amounts, [id]: e.target.value } })}
                  aria-label={`${x.name} ${currency}`}
                />
                <span className="w-9 shrink-0 text-[13px] text-text-3">{currency}</span>
              </label>
            );
          })}
          <div className="flex items-center justify-between gap-2 pt-1 text-[13px]">
            {remaining === 0 ? (
              <span className="font-semibold text-success">{t.wallet.payersOk}</span>
            ) : (
              <span className="font-semibold text-warn">{t.wallet.splitRemaining(money(remaining, currency))}</span>
            )}
            <Button size="sm" variant="ghost" disabled={!amountMinor} onClick={() => amountMinor && onChange({ ...value, amounts: evenly(value.ids, amountMinor, currency) })}>
              {t.wallet.split.equal}
            </Button>
          </div>
        </div>
      )}
    </Field>
  );
}
