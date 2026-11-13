import { CalendarCheck, CalendarX, DoorOpen, FileText, Flag, KeyRound, Lock, PlaneLanding, PlaneTakeoff, Ship, Trash2, Undo2, type LucideIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  BOOKING_STATUSES,
  BOOKING_TYPES,
  COST_KINDS,
  PAYMENT_STATUSES,
  TRANSPORT_BOOKING_TYPES,
  type BookingStatus,
  type BookingType,
  type CostKind,
  type PaymentStatus,
} from '../../../shared/constants';
import { minorToInput, normalizeRate, parseAmount } from '../../../shared/money';
import { todayIn } from '../../../shared/trip';
import { suggestedRate } from '../../lib/rates';
import { money } from '../../lib/format';
import { DepositSheet, ResolveDepositSheet } from '../wallet/DepositSheet';
import { PayersInput, resolvePayers, type PayersValue } from '../wallet/PayersInput';
import type { BookingDto, DepositDto, DepositMethod, TripSnapshot } from '../../../shared/types';
import { useTrip } from '../../components/AppShell';
import { MoneyField, TimeZoneSelect } from '../../components/inputs';
import { toast } from '../../components/toast';
import { Button, ConfirmDialog, Field, Input, SelectField, Sheet, TextAreaField, TextField, Toggle } from '../../components/ui';
import { t } from '../../i18n';
import { errorMessage, http } from '../../lib/api';
import { tripStore, useOnline } from '../../lib/store';

export default function BookingSheet({ open, onClose, booking }: { open: boolean; onClose: () => void; booking?: BookingDto | null }) {
  const { snap, me } = useTrip();
  const online = useOnline();
  const { trip, destinations, travelers } = snap!;
  const [editDeposit, setEditDeposit] = useState<DepositDto | null>(null);
  const [resolveDeposit, setResolveDeposit] = useState<DepositDto | null>(null);
  // Optional deposit known in advance (e.g. rental car) – created together with the booking.
  const [dep, setDep] = useState(() => {
    const currency = trip.localCurrency ?? trip.baseCurrency;
    const sugg = currency !== trip.baseCurrency ? suggestedRate(snap!.exchangeRates, snap!.expenses, currency, todayIn(defaultTzOf(snap!))) : null;
    return { on: false, amount: '', currency, rate: sugg?.rate.replace('.', ',') ?? '', payers: { ids: [me?.id ?? travelers[0]?.id ?? ''], amounts: {} } as PayersValue, method: 'cash' as DepositMethod };
  });
  const setD = <K extends keyof typeof dep>(k: K, v: (typeof dep)[K]) => setDep((d) => ({ ...d, [k]: v }));
  const depNeedsRate = dep.currency !== trip.baseCurrency;
  const defaultTz = destinations[0]?.timezone ?? trip.homeTimezone;
  const b = booking;
  const linkedDeposits = b ? (snap!.deposits ?? []).filter((d) => d.bookingId === b.id) : [];
  const [form, setForm] = useState(() => ({
    title: b?.title ?? '',
    type: (b?.type ?? 'hotel') as BookingType,
    provider: b?.provider ?? '',
    reference: b?.reference ?? '',
    startDate: b?.startDate ?? '',
    startTime: b?.startTime ?? '',
    startTimezone: b?.startTimezone ?? defaultTz,
    endDate: b?.endDate ?? '',
    endTime: b?.endTime ?? '',
    endTimezone: b?.endTimezone ?? defaultTz,
    fromLocation: b?.fromLocation ?? '',
    toLocation: b?.toLocation ?? '',
    location: b?.location ?? '',
    destinationId: b?.destinationId ?? '',
    fromDestinationId: b?.fromDestinationId ?? '',
    toDestinationId: b?.toDestinationId ?? '',
    price: b?.priceMinor != null && b.currency ? minorToInput(b.priceMinor, b.currency) : '',
    currency: b?.currency ?? trip.baseCurrency,
    personsCount: b?.personsCount ? String(b.personsCount) : '',
    unitPrice: b?.unitPriceMinor != null && b.currency ? minorToInput(b.unitPriceMinor, b.currency) : '',
    unitPriceNote: b?.unitPriceNote ?? '',
    costKind: (b?.costKind ?? 'actual') as CostKind,
    bookingStatus: (b?.bookingStatus ?? 'planned') as BookingStatus,
    paymentStatus: (b?.paymentStatus ?? 'unknown') as PaymentStatus,
    paidByTravelerId: b?.paidByTravelerId ?? '',
    clarificationNote: b?.clarificationNote ?? '',
    notes: b?.notes ?? '',
    travelerIds: b?.travelerIds ?? [],
  }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const isTransport = TRANSPORT_BOOKING_TYPES.includes(form.type);
  const L = PHASE_LABELS[form.type];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) return setError(`${t.bookings.titleField}: ${t.errors.required}`);
    const price = form.price.trim() ? parseAmount(form.price, form.currency) : null;
    const unit = form.unitPrice.trim() ? parseAmount(form.unitPrice, form.currency) : null;
    if ((form.price.trim() && (price === null || price < 0)) || (form.unitPrice.trim() && (unit === null || unit < 0))) return setError(t.errors.invalidAmount);
    if (form.startDate && form.endDate && form.endDate < form.startDate) return setError(`${t.bookings.end}: ${t.errors.invalidDate}`);
    const persons = form.personsCount ? Number(form.personsCount) : null;
    const depAmount = dep.on ? parseAmount(dep.amount, dep.currency) : null;
    const depRate = depNeedsRate ? normalizeRate(dep.rate) : '1';
    if (dep.on && (!depAmount || depAmount <= 0)) return setError(`${t.deposits.short}: ${t.errors.invalidAmount}`);
    if (dep.on && !depRate) return setError(`${t.deposits.short} – ${t.wallet.rate}: ${t.errors.validation}`);
    const depPay = dep.on ? resolvePayers(dep.payers, depAmount, dep.currency) : null;
    if (depPay && 'error' in depPay) return setError(`${t.deposits.short}: ${depPay.error}`);
    const data = {
      title: form.title.trim(),
      type: form.type,
      provider: form.provider.trim() || null,
      reference: form.reference.trim() || null,
      startDate: form.startDate || null,
      startTime: form.startTime || null,
      startTimezone: form.startDate ? form.startTimezone : null,
      endDate: form.endDate || null,
      endTime: form.endTime || null,
      endTimezone: form.endDate ? form.endTimezone : null,
      fromLocation: isTransport ? form.fromLocation.trim() || null : null,
      toLocation: isTransport ? form.toLocation.trim() || null : null,
      location: form.location.trim() || null,
      destinationId: form.destinationId || null,
      fromDestinationId: isTransport ? form.fromDestinationId || null : null,
      toDestinationId: isTransport ? form.toDestinationId || null : null,
      priceMinor: price,
      currency: price != null || unit != null ? form.currency : null,
      personsCount: persons,
      unitPriceMinor: unit,
      unitPriceNote: form.unitPriceNote.trim() || null,
      costKind: form.costKind,
      bookingStatus: form.bookingStatus,
      paymentStatus: form.paymentStatus,
      paidByTravelerId: form.paidByTravelerId || null,
      clarificationNote: form.clarificationNote.trim() || null,
      notes: form.notes.trim() || null,
      travelerIds: form.travelerIds,
    };
    setBusy(true);
    try {
      await tripStore.mutate(async () => {
        const res = b
          ? await http.patch<{ booking: BookingDto }>(`/trips/${trip.id}/bookings/${b.id}`, { ...data, version: b.version })
          : await http.post<{ booking: BookingDto }>(`/trips/${trip.id}/bookings`, data);
        if (dep.on && depAmount) {
          const day = form.startDate || todayIn(defaultTz);
          const sugg = depNeedsRate ? suggestedRate(snap!.exchangeRates, snap!.expenses, dep.currency, day) : null;
          await http.post(`/trips/${trip.id}/deposits`, {
            title: data.title,
            amountMinor: depAmount,
            currency: dep.currency,
            ...(depNeedsRate ? { fxRate: depRate, fxSource: sugg?.rate === depRate ? 'cached' : 'manual', fxDate: sugg?.rate === depRate ? sugg.effectiveDate : null } : {}),
            ...(depPay && !('error' in depPay) ? depPay : {}),
            travelerIds: form.travelerIds.length ? form.travelerIds : travelers.map((x) => x.id),
            method: dep.method,
            date: day,
            returnDate: form.endDate && form.endDate >= day ? form.endDate : null,
            bookingId: res.booking.id,
          });
        }
        return res;
      });
      toast(t.success.saved);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const destOptions = (
    <>
      <option value="">{t.bookings.home}</option>
      {destinations.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </>
  );

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        size="lg"
        title={b ? t.bookings.edit : t.bookings.add}
        footer={
          <>
            <Button variant="secondary" block onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button block type="submit" form="booking-form" loading={busy} disabled={!online}>
              {t.common.save}
            </Button>
          </>
        }
      >
        <form id="booking-form" onSubmit={submit} className="space-y-4" noValidate>
          {!online && <p className="rounded-2xl bg-warn-soft px-4 py-3 text-[14px] text-warn">{t.errors.offlineAction}</p>}
          <TextField label={t.bookings.titleField} required value={form.title} onChange={(e) => set('title', e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <SelectField label={t.bookings.type} value={form.type} onChange={(e) => set('type', e.target.value as BookingType)}>
              {BOOKING_TYPES.map((x) => (
                <option key={x} value={x}>
                  {t.bookingTypes[x]}
                </option>
              ))}
            </SelectField>
            <SelectField label={t.bookings.bookingStatus} value={form.bookingStatus} onChange={(e) => set('bookingStatus', e.target.value as BookingStatus)}>
              {BOOKING_STATUSES.map((x) => (
                <option key={x} value={x}>
                  {t.bookingStatus[x]}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField label={t.bookings.provider} optional value={form.provider} onChange={(e) => set('provider', e.target.value)} />
            <TextField label={t.bookings.reference} optional value={form.reference} onChange={(e) => set('reference', e.target.value)} />
          </div>

          <fieldset className="space-y-3 rounded-[1.25rem] border border-line bg-surface p-4">
            <PhaseLegend icon={L.startIcon} label={L.start} />
            <div className="clear-both grid grid-cols-2 gap-3 [&>*]:min-w-0">
              <TextField label={t.bookings.date} type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
              <TextField label={t.bookings.time} type="time" optional value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
            </div>
            <TimeZoneSelect label={t.bookings.timezone} value={form.startTimezone} onChange={(v) => set('startTimezone', v)} />
            {isTransport && <TextField label={L.from} optional placeholder={L.fromPlaceholder} value={form.fromLocation} onChange={(e) => set('fromLocation', e.target.value)} />}
          </fieldset>
          <fieldset className="space-y-3 rounded-[1.25rem] border border-line bg-surface p-4">
            <PhaseLegend icon={L.endIcon} label={L.end} />
            <div className="clear-both grid grid-cols-2 gap-3 [&>*]:min-w-0">
              <TextField label={t.bookings.date} type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />
              <TextField label={t.bookings.time} type="time" optional value={form.endTime} onChange={(e) => set('endTime', e.target.value)} />
            </div>
            <TimeZoneSelect label={t.bookings.timezone} value={form.endTimezone} onChange={(v) => set('endTimezone', v)} />
            {isTransport && <TextField label={L.to} optional placeholder={L.toPlaceholder} value={form.toLocation} onChange={(e) => set('toLocation', e.target.value)} />}
          </fieldset>

          {isTransport ? (
            <div className="grid grid-cols-2 gap-3">
              <SelectField label={t.bookings.legFrom} value={form.fromDestinationId} onChange={(e) => set('fromDestinationId', e.target.value)}>
                {destOptions}
              </SelectField>
              <SelectField label={t.bookings.legTo} value={form.toDestinationId} onChange={(e) => set('toDestinationId', e.target.value)}>
                {destOptions}
              </SelectField>
            </div>
          ) : (
            <SelectField label={t.bookings.belongsTo} optional value={form.destinationId} onChange={(e) => set('destinationId', e.target.value)}>
              <option value="">{t.bookings.noLink}</option>
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </SelectField>
          )}
          <TextField label={L.location} optional placeholder={L.locationPlaceholder} value={form.location} onChange={(e) => set('location', e.target.value)} />

          <Field label={t.bookings.forWhom} hint={t.bookings.forWhomHint}>
            <div className="flex flex-wrap gap-2">
              {travelers.map((x) => {
                const on = form.travelerIds.includes(x.id);
                return (
                  <button
                    key={x.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set(
                        'travelerIds',
                        on ? form.travelerIds.filter((id) => id !== x.id) : travelers.filter((tr) => tr.id === x.id || form.travelerIds.includes(tr.id)).map((tr) => tr.id),
                      )
                    }
                    className={`inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-[14px] font-semibold ${on ? 'border-transparent bg-text text-bg' : 'border-line bg-surface text-text-2'}`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} />
                    {x.name}
                  </button>
                );
              })}
            </div>
          </Field>

          <fieldset className="space-y-3 rounded-[1.25rem] border border-line p-4">
            <legend className="px-1 text-[13px] font-semibold text-text-2">{t.bookings.price}</legend>
            <MoneyField label={t.bookings.price} optional amount={form.price} currency={form.currency} onAmount={(v) => set('price', v)} onCurrency={(v) => set('currency', v)} />
            <div className="grid grid-cols-2 gap-3">
              <SelectField label={t.bookings.costKind} value={form.costKind} onChange={(e) => set('costKind', e.target.value as CostKind)}>
                {COST_KINDS.map((x) => (
                  <option key={x} value={x}>
                    {t.costKind[x]}
                  </option>
                ))}
              </SelectField>
              <SelectField label={t.bookings.persons} value={form.personsCount} onChange={(e) => set('personsCount', e.target.value)}>
                <option value="">{t.bookings.personsUnknown}</option>
                {Array.from({ length: Math.max(8, travelers.length) }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SelectField label={t.bookings.paymentStatus} value={form.paymentStatus} onChange={(e) => set('paymentStatus', e.target.value as PaymentStatus)}>
                {PAYMENT_STATUSES.map((x) => (
                  <option key={x} value={x}>
                    {t.paymentStatus[x]}
                  </option>
                ))}
              </SelectField>
              <SelectField label={t.bookings.paidBy} optional value={form.paidByTravelerId} onChange={(e) => set('paidByTravelerId', e.target.value)}>
                <option value="">{t.common.none}</option>
                {travelers.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </SelectField>
            </div>
            <MoneyField label={t.bookings.unitPrice} optional amount={form.unitPrice} currency={form.currency} onAmount={(v) => set('unitPrice', v)} onCurrency={(v) => set('currency', v)} />
            {form.unitPrice && <TextField label={t.bookings.unitPriceNote} optional value={form.unitPriceNote} onChange={(e) => set('unitPriceNote', e.target.value)} />}
            <p className="text-[12px] leading-snug text-text-3">{t.bookings.notSpentHint}</p>
          </fieldset>

          <fieldset className="space-y-3 rounded-[1.25rem] border border-line bg-surface p-4">
            <PhaseLegend icon={Lock} label={t.deposits.title} />
            <div className="clear-both" />
            {linkedDeposits.map((d) => (
              <div key={d.id} className="rounded-2xl bg-surface-2 p-3">
                <div>
                  <p className="font-semibold tabular">{money(d.amountMinor, d.currency)}</p>
                  <p className="text-[13px] text-text-3">
                    {t.deposits.status[d.status]} · {(d.payers ?? []).map((p) => travelers.find((x) => x.id === p.travelerId)?.name).join(' & ')} · {t.deposits.methods[d.method]}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {d.status === 'open' && (
                    <Button size="sm" variant="secondary" onClick={() => setEditDeposit(d)}>
                      {t.common.edit}
                    </Button>
                  )}
                  <Button size="sm" variant="soft" onClick={() => setResolveDeposit(d)}>
                    {d.status === 'open' ? t.deposits.close : t.deposits.details}
                  </Button>
                </div>
              </div>
            ))}
            <Toggle checked={dep.on} onChange={(v) => setD('on', v)} label={linkedDeposits.length ? t.deposits.addAnother : t.deposits.inBooking} description={t.deposits.inBookingHint} />
            {dep.on && (
              <>
                <MoneyField
                  label={t.deposits.amount}
                  amount={dep.amount}
                  currency={dep.currency}
                  onAmount={(v) => setD('amount', v)}
                  onCurrency={(c) =>
                    setDep((d) => ({ ...d, currency: c, rate: c !== trip.baseCurrency ? (suggestedRate(snap!.exchangeRates, snap!.expenses, c, todayIn(defaultTz))?.rate.replace('.', ',') ?? '') : '' }))
                  }
                />
                {depNeedsRate && (
                  <Field label={`${t.wallet.rate} · ${t.wallet.rateHelp(dep.currency, trip.baseCurrency)}`} htmlFor="booking-deposit-rate">
                    <Input id="booking-deposit-rate" inputMode="decimal" value={dep.rate} onChange={(e) => setD('rate', e.target.value)} />
                  </Field>
                )}
                <PayersInput travelers={travelers} currency={dep.currency} amountMinor={dep.amount.trim() ? parseAmount(dep.amount, dep.currency) : null} value={dep.payers} onChange={(v) => setD('payers', v)} />
                <SelectField label={t.deposits.method} value={dep.method} onChange={(e) => setD('method', e.target.value as DepositMethod)}>
                  {(['cash', 'card', 'transfer'] as const).map((m) => (
                    <option key={m} value={m}>
                      {t.deposits.methods[m]}
                    </option>
                  ))}
                </SelectField>
                <p className="text-[12px] leading-snug text-text-3">{t.deposits.inBookingDates(L.start, L.end)}</p>
              </>
            )}
          </fieldset>

          <TextAreaField label={t.bookings.clarification} optional placeholder={t.bookings.clarificationHint} value={form.clarificationNote} onChange={(e) => set('clarificationNote', e.target.value)} />
          <TextAreaField label={t.bookings.notes} optional value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          <div className="flex items-center gap-3 rounded-[1.25rem] border border-dashed border-line-strong p-4 text-[13px] text-text-3">
            <FileText size={18} className="shrink-0" />
            {t.bookings.documentsPlanned}
          </div>
          {error && (
            <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] text-danger">
              {error}
            </p>
          )}
          {b && (
            <div className="border-t border-line pt-4">
              <Button variant="danger" size="sm" icon={<Trash2 size={16} />} disabled={!online} onClick={() => setConfirm(true)}>
                {t.common.delete}
              </Button>
            </div>
          )}
        </form>
      </Sheet>
      {editDeposit && <DepositSheet snap={snap!} deposit={editDeposit} me={me?.id} onClose={() => setEditDeposit(null)} />}
      {resolveDeposit && <ResolveDepositSheet snap={snap!} deposit={resolveDeposit} onClose={() => setResolveDeposit(null)} />}
      {b && (
        <ConfirmDialog
          open={confirm}
          onClose={() => setConfirm(false)}
          title={t.common.delete}
          message={t.bookings.deleteConfirm(b.title)}
          onConfirm={async () => {
            await tripStore.mutate(() => http.del(`/trips/${trip.id}/bookings/${b.id}?version=${b.version}`));
            toast(t.success.deleted);
            onClose();
          }}
        />
      )}
    </>
  );
}

interface PhaseLabels {
  start: string;
  end: string;
  startIcon: LucideIcon;
  endIcon: LucideIcon;
  from: string;
  to: string;
  fromPlaceholder?: string;
  toPlaceholder?: string;
  location: string;
  locationPlaceholder?: string;
}

/** Wording of the two time blocks depends on what was booked. */
const PHASE_LABELS: Record<BookingType, PhaseLabels> = {
  flight: { start: 'Abflug', end: 'Landung', startIcon: PlaneTakeoff, endIcon: PlaneLanding, from: 'Abflughafen', to: 'Zielflughafen', fromPlaceholder: 'z. B. DMK Bangkok', toPlaceholder: 'z. B. HKT Phuket', location: 'Terminal / Hinweis', locationPlaceholder: 'z. B. Terminal 1' },
  ferry: { start: 'Abfahrt', end: 'Ankunft', startIcon: Ship, endIcon: Flag, from: 'Abfahrtshafen', to: 'Zielhafen', fromPlaceholder: 'z. B. Rassada Pier', toPlaceholder: 'z. B. Saladan Pier', location: 'Treffpunkt', locationPlaceholder: 'z. B. Abholung am Hotel' },
  train: { start: 'Abfahrt', end: 'Ankunft', startIcon: DoorOpen, endIcon: Flag, from: 'Abfahrtsbahnhof', to: 'Zielbahnhof', location: 'Gleis / Wagen' },
  bus: { start: 'Abfahrt', end: 'Ankunft', startIcon: DoorOpen, endIcon: Flag, from: 'Abfahrt von', to: 'Ankunft in', location: 'Treffpunkt / Haltestelle' },
  car: { start: 'Abholung', end: 'Rückgabe', startIcon: KeyRound, endIcon: Undo2, from: 'Abholort', to: 'Rückgabeort', fromPlaceholder: 'z. B. Flughafen Krabi', toPlaceholder: 'z. B. Flughafen Krabi', location: 'Fahrzeug / Hinweis', locationPlaceholder: 'z. B. Kleinwagen, Vollkasko' },
  hotel: { start: 'Check-in', end: 'Check-out', startIcon: CalendarCheck, endIcon: CalendarX, from: '', to: '', location: 'Adresse', locationPlaceholder: 'z. B. Straße, Ort' },
  activity: { start: 'Beginn', end: 'Ende', startIcon: CalendarCheck, endIcon: Flag, from: '', to: '', location: 'Treffpunkt', locationPlaceholder: 'z. B. Hotel-Lobby' },
  other: { start: 'Beginn', end: 'Ende', startIcon: CalendarCheck, endIcon: Flag, from: '', to: '', location: 'Ort' },
};

function PhaseLegend({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    // float + w-full keeps the legend inside the box instead of on its border
    <legend className="float-left mb-3 flex w-full items-center gap-2 text-[15px] font-semibold">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-accent-soft text-accent">
        <Icon size={16} />
      </span>
      {label}
    </legend>
  );
}

const defaultTzOf = (snap: TripSnapshot) => snap.destinations[0]?.timezone ?? snap.trip.homeTimezone;
