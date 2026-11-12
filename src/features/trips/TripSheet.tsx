import { useState, type FormEvent } from 'react';
import { TRIP_STATUSES, type TripStatus } from '../../../shared/constants';
import type { TripDto } from '../../../shared/types';
import { coordToInput, CoordsFields, CurrencySelect, parseCoord, TimeZoneSelect } from '../../components/inputs';
import { toast } from '../../components/toast';
import { Button, SelectField, Sheet, TextAreaField, TextField } from '../../components/ui';
import { t } from '../../i18n';
import { errorMessage, http } from '../../lib/api';
import { tripsList, tripStore, useOnline } from '../../lib/store';

export default function TripSheet({ open, onClose, trip }: { open: boolean; onClose: () => void; trip?: TripDto | null }) {
  const online = useOnline();
  const [form, setForm] = useState(() => ({
    name: trip?.name ?? '',
    destinationCountry: trip?.destinationCountry ?? '',
    startDate: trip?.startDate ?? '',
    endDate: trip?.endDate ?? '',
    coverImageUrl: trip?.coverImageUrl ?? '',
    baseCurrency: trip?.baseCurrency ?? 'EUR',
    localCurrency: trip?.localCurrency ?? '',
    description: trip?.description ?? '',
    status: (trip?.status ?? 'planning') as TripStatus,
    originName: trip?.originName ?? '',
    originLat: coordToInput(trip?.originLat),
    originLng: coordToInput(trip?.originLng),
    homeTimezone: trip?.homeTimezone ?? 'Europe/Berlin',
  }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim() || !form.startDate || !form.endDate) return setError(t.errors.validation);
    if (form.endDate < form.startDate) return setError(`${t.trips.endDate}: ${t.errors.invalidDate}`);
    const originLat = parseCoord(form.originLat);
    const originLng = parseCoord(form.originLng);
    if (originLat === undefined || originLng === undefined) return setError(t.errors.validation);
    const data = {
      name: form.name.trim(),
      destinationCountry: form.destinationCountry.trim() || null,
      startDate: form.startDate,
      endDate: form.endDate,
      coverImageUrl: form.coverImageUrl.trim() || null,
      baseCurrency: form.baseCurrency,
      localCurrency: form.localCurrency || null,
      description: form.description.trim() || null,
      status: form.status,
      originName: form.originName.trim() || null,
      originLat,
      originLng,
      homeTimezone: form.homeTimezone,
    };
    setBusy(true);
    try {
      if (trip) {
        await tripStore.mutate(() => http.patch(`/trips/${trip.id}`, { ...data, version: trip.version }));
      } else {
        const res = await http.post<{ trip: TripDto }>('/trips', data);
        await tripStore.select(res.trip.id);
      }
      await tripsList.load();
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
      open={open}
      onClose={onClose}
      size="lg"
      title={trip ? t.trips.edit : t.trips.new}
      footer={
        <>
          <Button variant="secondary" block onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button block type="submit" form="trip-form" loading={busy} disabled={!online}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <form id="trip-form" onSubmit={submit} className="space-y-4" noValidate>
        {!online && <p className="rounded-2xl bg-warn-soft px-4 py-3 text-[14px] text-warn">{t.errors.offlineAction}</p>}
        <TextField label={t.trips.name} required value={form.name} onChange={(e) => set('name', e.target.value)} />
        <TextField label={t.trips.country} optional value={form.destinationCountry} onChange={(e) => set('destinationCountry', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label={t.trips.startDate} type="date" required value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
          <TextField label={t.trips.endDate} type="date" required value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <CurrencySelect label={t.trips.baseCurrency} value={form.baseCurrency} onChange={(v) => set('baseCurrency', v)} />
          <CurrencySelect label={t.trips.localCurrency} allowEmpty value={form.localCurrency} onChange={(v) => set('localCurrency', v)} />
        </div>
        {trip && <p className="-mt-2 text-[12px] text-text-3">{t.trips.baseCurrencyLocked}</p>}
        <SelectField label={t.trips.status} value={form.status} onChange={(e) => set('status', e.target.value as TripStatus)}>
          {TRIP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t.tripStatus[s]}
            </option>
          ))}
        </SelectField>
        <TextField label={t.trips.origin} optional value={form.originName} onChange={(e) => set('originName', e.target.value)} />
        <CoordsFields lat={form.originLat} lng={form.originLng} onLat={(v) => set('originLat', v)} onLng={(v) => set('originLng', v)} />
        <TimeZoneSelect label={t.trips.homeTimezone} value={form.homeTimezone} onChange={(v) => set('homeTimezone', v)} />
        <TextField label={t.trips.coverImage} optional type="url" hint={t.trips.coverHint} value={form.coverImageUrl} onChange={(e) => set('coverImageUrl', e.target.value)} />
        <TextAreaField label={t.trips.description} optional value={form.description} onChange={(e) => set('description', e.target.value)} />
        {error && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] text-danger">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
