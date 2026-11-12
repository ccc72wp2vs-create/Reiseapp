import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { addDaysToDate } from '../../../shared/trip';
import type { DestinationDto } from '../../../shared/types';
import { useTrip } from '../../components/AppShell';
import { coordToInput, CoordsFields, parseCoord, TimeZoneSelect } from '../../components/inputs';
import { toast } from '../../components/toast';
import { Button, ConfirmDialog, Sheet, TextAreaField, TextField } from '../../components/ui';
import { t } from '../../i18n';
import { errorMessage, http } from '../../lib/api';
import { tripStore, useOnline } from '../../lib/store';

export default function DestinationSheet({ open, onClose, destination }: { open: boolean; onClose: () => void; destination?: DestinationDto | null }) {
  const { snap } = useTrip();
  const online = useOnline();
  const trip = snap!.trip;
  const last = snap!.destinations[snap!.destinations.length - 1];
  const d = destination;
  const [form, setForm] = useState(() => ({
    name: d?.name ?? '',
    country: d?.country ?? trip.destinationCountry ?? '',
    arrivalDate: d?.arrivalDate ?? last?.departureDate ?? trip.startDate,
    departureDate: d?.departureDate ?? addDaysToDate(last?.departureDate ?? trip.startDate, 2),
    timezone: d?.timezone ?? last?.timezone ?? trip.homeTimezone,
    accommodationName: d?.accommodationName ?? '',
    accommodationAddress: d?.accommodationAddress ?? '',
    accommodationNotes: d?.accommodationNotes ?? '',
    lat: coordToInput(d?.lat),
    lng: coordToInput(d?.lng),
    notes: d?.notes ?? '',
    coverImageUrl: d?.coverImageUrl ?? '',
  }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) return setError(`${t.destinations.name}: ${t.errors.required}`);
    if (form.departureDate < form.arrivalDate) return setError(`${t.destinations.departure}: ${t.errors.invalidDate}`);
    const lat = parseCoord(form.lat);
    const lng = parseCoord(form.lng);
    if (lat === undefined || lng === undefined) return setError(t.errors.validation);
    const data = {
      name: form.name.trim(),
      country: form.country.trim() || null,
      arrivalDate: form.arrivalDate,
      departureDate: form.departureDate,
      timezone: form.timezone,
      accommodationName: form.accommodationName.trim() || null,
      accommodationAddress: form.accommodationAddress.trim() || null,
      accommodationNotes: form.accommodationNotes.trim() || null,
      lat,
      lng,
      notes: form.notes.trim() || null,
      coverImageUrl: form.coverImageUrl.trim() || null,
    };
    setBusy(true);
    try {
      await tripStore.mutate(() =>
        d ? http.patch(`/trips/${trip.id}/destinations/${d.id}`, { ...data, version: d.version }) : http.post(`/trips/${trip.id}/destinations`, data),
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
        open={open}
        onClose={onClose}
        size="lg"
        title={d ? t.destinations.edit : t.destinations.add}
        footer={
          <>
            <Button variant="secondary" block onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button block type="submit" form="destination-form" loading={busy} disabled={!online}>
              {t.common.save}
            </Button>
          </>
        }
      >
        <form id="destination-form" onSubmit={submit} className="space-y-4" noValidate>
          {!online && <p className="rounded-2xl bg-warn-soft px-4 py-3 text-[14px] text-warn">{t.errors.offlineAction}</p>}
          <div className="grid grid-cols-2 gap-3">
            <TextField label={t.destinations.name} required value={form.name} onChange={(e) => set('name', e.target.value)} />
            <TextField label={t.destinations.country} optional value={form.country} onChange={(e) => set('country', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField label={t.destinations.arrival} type="date" value={form.arrivalDate} onChange={(e) => set('arrivalDate', e.target.value)} />
            <TextField label={t.destinations.departure} type="date" value={form.departureDate} onChange={(e) => set('departureDate', e.target.value)} />
          </div>
          <TimeZoneSelect label={t.destinations.timezone} value={form.timezone} onChange={(v) => set('timezone', v)} />
          <fieldset className="space-y-3 rounded-[1.25rem] border border-line p-4">
            <legend className="px-1 text-[13px] font-semibold text-text-2">{t.destinations.accommodation}</legend>
            <TextField label={t.destinations.accommodationName} optional value={form.accommodationName} onChange={(e) => set('accommodationName', e.target.value)} />
            <TextField label={t.destinations.accommodationAddress} optional value={form.accommodationAddress} onChange={(e) => set('accommodationAddress', e.target.value)} />
            <TextAreaField label={t.destinations.accommodationNotes} optional value={form.accommodationNotes} onChange={(e) => set('accommodationNotes', e.target.value)} />
          </fieldset>
          <CoordsFields lat={form.lat} lng={form.lng} onLat={(v) => set('lat', v)} onLng={(v) => set('lng', v)} hint={t.destinations.coordsHint} />
          <TextField label={t.destinations.cover} optional type="url" value={form.coverImageUrl} onChange={(e) => set('coverImageUrl', e.target.value)} />
          <TextAreaField label={t.common.notes} optional value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          {error && (
            <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] text-danger">
              {error}
            </p>
          )}
          {d && (
            <div className="border-t border-line pt-4">
              <Button variant="danger" size="sm" icon={<Trash2 size={16} />} disabled={!online} onClick={() => setConfirm(true)}>
                {t.common.delete}
              </Button>
            </div>
          )}
        </form>
      </Sheet>
      {d && (
        <ConfirmDialog
          open={confirm}
          onClose={() => setConfirm(false)}
          title={t.common.delete}
          message={t.destinations.deleteConfirm(d.name)}
          onConfirm={async () => {
            await tripStore.mutate(() => http.del(`/trips/${trip.id}/destinations/${d.id}?version=${d.version}`));
            toast(t.success.deleted);
            onClose();
          }}
        />
      )}
    </>
  );
}
