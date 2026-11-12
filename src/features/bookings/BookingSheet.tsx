import { FileText, Trash2 } from 'lucide-react';
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
import { minorToInput, parseAmount } from '../../../shared/money';
import type { BookingDto } from '../../../shared/types';
import { useTrip } from '../../components/AppShell';
import { MoneyField, TimeZoneSelect } from '../../components/inputs';
import { toast } from '../../components/toast';
import { Button, ConfirmDialog, Field, SelectField, Sheet, TextAreaField, TextField } from '../../components/ui';
import { t } from '../../i18n';
import { errorMessage, http } from '../../lib/api';
import { tripStore, useOnline } from '../../lib/store';

export default function BookingSheet({ open, onClose, booking }: { open: boolean; onClose: () => void; booking?: BookingDto | null }) {
  const { snap } = useTrip();
  const online = useOnline();
  const { trip, destinations, travelers } = snap!;
  const defaultTz = destinations[0]?.timezone ?? trip.homeTimezone;
  const b = booking;
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

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) return setError(`${t.bookings.titleField}: ${t.errors.required}`);
    const price = form.price.trim() ? parseAmount(form.price, form.currency) : null;
    const unit = form.unitPrice.trim() ? parseAmount(form.unitPrice, form.currency) : null;
    if ((form.price.trim() && (price === null || price < 0)) || (form.unitPrice.trim() && (unit === null || unit < 0))) return setError(t.errors.invalidAmount);
    if (form.startDate && form.endDate && form.endDate < form.startDate) return setError(`${t.bookings.end}: ${t.errors.invalidDate}`);
    const persons = form.personsCount ? Number(form.personsCount) : null;
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
      await tripStore.mutate(() =>
        b ? http.patch(`/trips/${trip.id}/bookings/${b.id}`, { ...data, version: b.version }) : http.post(`/trips/${trip.id}/bookings`, data),
      );
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

          <fieldset className="space-y-3 rounded-[1.25rem] border border-line p-4">
            <legend className="px-1 text-[13px] font-semibold text-text-2">{isTransport ? t.bookings.departure : t.bookings.start}</legend>
            <div className="grid grid-cols-2 gap-3">
              <TextField label={t.bookings.date} type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
              <TextField label={t.bookings.time} type="time" optional value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
            </div>
            <TimeZoneSelect label={t.bookings.timezone} value={form.startTimezone} onChange={(v) => set('startTimezone', v)} />
            {isTransport && <TextField label={t.bookings.from} optional value={form.fromLocation} onChange={(e) => set('fromLocation', e.target.value)} />}
          </fieldset>
          <fieldset className="space-y-3 rounded-[1.25rem] border border-line p-4">
            <legend className="px-1 text-[13px] font-semibold text-text-2">{isTransport ? t.bookings.arrival : t.bookings.end}</legend>
            <div className="grid grid-cols-2 gap-3">
              <TextField label={t.bookings.date} type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />
              <TextField label={t.bookings.time} type="time" optional value={form.endTime} onChange={(e) => set('endTime', e.target.value)} />
            </div>
            <TimeZoneSelect label={t.bookings.timezone} value={form.endTimezone} onChange={(v) => set('endTimezone', v)} />
            {isTransport && <TextField label={t.bookings.to} optional value={form.toLocation} onChange={(e) => set('toLocation', e.target.value)} />}
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
          <TextField label={t.bookings.location} optional value={form.location} onChange={(e) => set('location', e.target.value)} />

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
