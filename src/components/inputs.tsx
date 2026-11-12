import { useId } from 'react';
import { CURRENCY_CODES } from '../../shared/money';
import { t } from '../i18n';
import { Field, Input, Select } from './ui';

/** Amount (German decimal input) + currency picker. */
export function MoneyField({
  label,
  amount,
  currency,
  onAmount,
  onCurrency,
  error,
  hint,
  optional,
  allowEmptyCurrency,
}: {
  label: string;
  amount: string;
  currency: string;
  onAmount: (v: string) => void;
  onCurrency: (v: string) => void;
  error?: string | null;
  hint?: string;
  optional?: boolean;
  allowEmptyCurrency?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} optional={optional}>
      <div className="flex gap-2">
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          className="tabular flex-1"
          value={amount}
          aria-invalid={!!error}
          onChange={(e) => onAmount(e.target.value)}
        />
        <Select aria-label={t.wallet.currency} className="w-28" value={currency} onChange={(e) => onCurrency(e.target.value)}>
          {allowEmptyCurrency && <option value="">—</option>}
          {CURRENCY_CODES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>
    </Field>
  );
}

export function CurrencySelect({ value, onChange, label, allowEmpty }: { value: string; onChange: (v: string) => void; label: string; allowEmpty?: boolean }) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {allowEmpty && <option value="">—</option>}
        {CURRENCY_CODES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function parseCoord(v: string): number | null | undefined {
  const s = v.trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}
export const coordToInput = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));

export function CoordsFields({
  lat,
  lng,
  onLat,
  onLng,
  hint,
}: {
  lat: string;
  lng: string;
  onLat: (v: string) => void;
  onLng: (v: string) => void;
  hint?: string;
}) {
  const a = useId();
  const b = useId();
  const latBad = lat !== '' && (parseCoord(lat) === undefined || Math.abs(parseCoord(lat) ?? 0) > 90);
  const lngBad = lng !== '' && (parseCoord(lng) === undefined || Math.abs(parseCoord(lng) ?? 0) > 180);
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.destinations.lat} htmlFor={a} optional error={latBad ? t.errors.validation : null}>
          <Input id={a} inputMode="decimal" value={lat} onChange={(e) => onLat(e.target.value)} placeholder="13,7563" />
        </Field>
        <Field label={t.destinations.lng} htmlFor={b} optional error={lngBad ? t.errors.validation : null}>
          <Input id={b} inputMode="decimal" value={lng} onChange={(e) => onLng(e.target.value)} placeholder="100,5018" />
        </Field>
      </div>
      {hint && <p className="mt-1.5 text-[13px] text-text-3">{hint}</p>}
    </div>
  );
}

export function TimeZoneSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const id = useId();
  const zones = (() => {
    try {
      return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
    } catch {
      return [];
    }
  })();
  const list = zones.length ? zones : ['Europe/Berlin', 'Asia/Bangkok', 'UTC'];
  if (value && !list.includes(value)) list.unshift(value);
  return (
    <Field label={label} htmlFor={id}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {list.map((z) => (
          <option key={z} value={z}>
            {z.replace(/_/g, ' ')}
          </option>
        ))}
      </Select>
    </Field>
  );
}
