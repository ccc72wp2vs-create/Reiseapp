import { LocateFixed, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PLACE_CATEGORIES, type PlaceCategory } from '../../../shared/constants';
import type { PlaceDto } from '../../../shared/types';
import { useTrip } from '../../components/AppShell';
import { coordToInput, CoordsFields, parseCoord } from '../../components/inputs';
import { toast } from '../../components/toast';
import { Button, ConfirmDialog, SelectField, Sheet, TextAreaField, TextField, Toggle } from '../../components/ui';
import { t } from '../../i18n';
import { isOnline, tripStore } from '../../lib/store';

export default function PlaceSheet({ open, onClose, place }: { open: boolean; onClose: () => void; place?: PlaceDto | null }) {
  const { snap } = useTrip();
  const [form, setForm] = useState(() => ({
    name: place?.name ?? '',
    category: (place?.category ?? 'sightseeing') as PlaceCategory,
    description: place?.description ?? '',
    address: place?.address ?? '',
    lat: coordToInput(place?.lat),
    lng: coordToInput(place?.lng),
    externalUrl: place?.externalUrl ?? '',
    notes: place?.notes ?? '',
    favorite: place?.favorite ?? false,
    destinationId: place?.destinationId ?? '',
  }));
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [locating, setLocating] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  /** Location is only requested on explicit user action and never tracked. */
  function useMyLocation() {
    if (!('geolocation' in navigator)) return toast(t.explore.locationDenied, 'error');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, lat: coordToInput(Number(pos.coords.latitude.toFixed(5))), lng: coordToInput(Number(pos.coords.longitude.toFixed(5))) }));
        setLocating(false);
      },
      () => {
        toast(t.explore.locationDenied, 'error');
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) return setError(`${t.explore.name}: ${t.errors.required}`);
    const lat = parseCoord(form.lat);
    const lng = parseCoord(form.lng);
    if (lat === undefined || lng === undefined || (lat === null) !== (lng === null)) return setError(t.errors.validation);
    if (form.externalUrl && !/^https:\/\//i.test(form.externalUrl.trim())) return setError(`${t.explore.externalUrl}: https://`);
    const data = {
      name: form.name.trim(),
      category: form.category,
      description: form.description.trim() || null,
      address: form.address.trim() || null,
      lat,
      lng,
      externalUrl: form.externalUrl.trim() || null,
      notes: form.notes.trim() || null,
      favorite: form.favorite,
      destinationId: form.destinationId || null,
    };
    if (place) tripStore.places.update(place.id, data);
    else tripStore.places.create(data);
    toast(isOnline() ? t.success.saved : t.success.queued, isOnline() ? 'success' : 'info');
    onClose();
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={place ? t.explore.edit : t.explore.add}
        footer={
          <>
            <Button variant="secondary" block onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button block type="submit" form="place-form">
              {t.common.save}
            </Button>
          </>
        }
      >
        <form id="place-form" onSubmit={submit} className="space-y-4" noValidate>
          <TextField label={t.explore.name} required autoFocus={!place} value={form.name} onChange={(e) => set('name', e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <SelectField label={t.plan.category} value={form.category} onChange={(e) => set('category', e.target.value as PlaceCategory)}>
              {PLACE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t.categories[c]}
                </option>
              ))}
            </SelectField>
            <SelectField label={t.explore.destination} optional value={form.destinationId} onChange={(e) => set('destinationId', e.target.value)}>
              <option value="">{t.common.none}</option>
              {snap?.destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </SelectField>
          </div>
          <TextField label={t.explore.address} optional value={form.address} onChange={(e) => set('address', e.target.value)} />
          <CoordsFields lat={form.lat} lng={form.lng} onLat={(v) => set('lat', v)} onLng={(v) => set('lng', v)} hint={t.explore.locationHint} />
          <Button variant="secondary" size="sm" icon={<LocateFixed size={16} />} loading={locating} onClick={useMyLocation}>
            {t.explore.useMyLocation}
          </Button>
          <TextField label={t.explore.externalUrl} optional type="url" inputMode="url" value={form.externalUrl} onChange={(e) => set('externalUrl', e.target.value)} />
          <TextAreaField label={t.plan.description} optional value={form.description} onChange={(e) => set('description', e.target.value)} />
          <TextAreaField label={t.common.notes} optional value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          <Toggle label={t.explore.favorite} checked={form.favorite} onChange={(v) => set('favorite', v)} />
          {error && (
            <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] text-danger">
              {error}
            </p>
          )}
          {place && (
            <div className="border-t border-line pt-4">
              <Button variant="danger" size="sm" icon={<Trash2 size={16} />} onClick={() => setConfirm(true)}>
                {t.common.delete}
              </Button>
            </div>
          )}
        </form>
      </Sheet>
      {place && (
        <ConfirmDialog
          open={confirm}
          onClose={() => setConfirm(false)}
          title={t.common.delete}
          message={t.explore.deleteConfirm(place.name)}
          onConfirm={() => {
            tripStore.places.remove(place.id);
            toast(t.success.deleted);
            onClose();
          }}
        />
      )}
    </>
  );
}
