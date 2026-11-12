import { Copy, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { ACTIVITY_CATEGORIES, BOOKING_STATUSES, type ActivityCategory, type BookingStatus } from '../../../shared/constants';
import { minorToInput, parseAmount } from '../../../shared/money';
import { eachDate } from '../../../shared/trip';
import type { ActivityDto } from '../../../shared/types';
import { useTrip } from '../../components/AppShell';
import { coordToInput, CoordsFields, MoneyField, parseCoord } from '../../components/inputs';
import { toast } from '../../components/toast';
import { Button, ConfirmDialog, SelectField, Sheet, TextAreaField, TextField, Toggle } from '../../components/ui';
import { t } from '../../i18n';
import { formatWeekdayShort } from '../../lib/format';
import { isOnline, tripStore } from '../../lib/store';

export interface ActivityDefaults {
  date?: string;
  placeId?: string | null;
  title?: string;
  category?: ActivityCategory;
  locationName?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export default function ActivitySheet({
  open,
  onClose,
  activity,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  activity?: ActivityDto | null;
  defaults?: ActivityDefaults;
}) {
  const { snap } = useTrip();
  const trip = snap!.trip;
  const base = activity ?? null;
  const [form, setForm] = useState(() => ({
    title: base?.title ?? defaults?.title ?? '',
    category: (base?.category ?? defaults?.category ?? 'sightseeing') as ActivityCategory,
    date: base?.date ?? defaults?.date ?? trip.startDate,
    startTime: base?.startTime ?? '',
    endTime: base?.endTime ?? '',
    locationName: base?.locationName ?? defaults?.locationName ?? '',
    lat: coordToInput(base?.lat ?? defaults?.lat),
    lng: coordToInput(base?.lng ?? defaults?.lng),
    cost: base?.estCostMinor != null && base.currency ? minorToInput(base.estCostMinor, base.currency) : '',
    currency: base?.currency ?? trip.localCurrency ?? trip.baseCurrency,
    bookingStatus: (base?.bookingStatus ?? 'planned') as BookingStatus,
    completed: base?.completed ?? false,
    notes: base?.notes ?? '',
    description: base?.description ?? '',
    placeId: base?.placeId ?? defaults?.placeId ?? '',
  }));
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const days = useMemo(() => {
    const list = eachDate(trip.startDate, trip.endDate);
    if (form.date && !list.includes(form.date)) list.unshift(form.date);
    return list;
  }, [trip.startDate, trip.endDate, form.date]);

  function pickPlace(id: string) {
    const p = snap!.places.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      placeId: id,
      ...(p
        ? {
            locationName: f.locationName || p.name,
            lat: f.lat || coordToInput(p.lat),
            lng: f.lng || coordToInput(p.lng),
            title: f.title || p.name,
            category: f.title ? f.category : p.category,
          }
        : {}),
    }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) return setError(`${t.plan.titleField}: ${t.errors.required}`);
    if (form.startTime && form.endTime && form.endTime < form.startTime) return setError(t.plan.conflict);
    const lat = parseCoord(form.lat);
    const lng = parseCoord(form.lng);
    if (lat === undefined || lng === undefined) return setError(t.errors.validation);
    let estCostMinor: number | null = null;
    if (form.cost.trim()) {
      const v = parseAmount(form.cost, form.currency);
      if (v === null || v < 0) return setError(t.errors.invalidAmount);
      estCostMinor = v;
    }
    const data = {
      title: form.title.trim(),
      category: form.category,
      date: form.date,
      startTime: form.startTime || null,
      endTime: form.endTime || null,
      locationName: form.locationName.trim() || null,
      lat,
      lng,
      estCostMinor,
      currency: estCostMinor != null ? form.currency : null,
      bookingStatus: form.bookingStatus,
      completed: form.completed,
      notes: form.notes.trim() || null,
      description: form.description.trim() || null,
      placeId: form.placeId || null,
    };
    if (base) tripStore.activities.update(base.id, data);
    else tripStore.activities.create(data);
    toast(isOnline() ? t.success.saved : t.success.queued, isOnline() ? 'success' : 'info');
    onClose();
  }

  function duplicate() {
    if (!base) return;
    const { id: _i, version: _v, createdAt: _c, updatedAt: _u, tripId: _t, sortOrder: _s, createdBy: _cb, updatedBy: _ub, ...rest } = base;
    tripStore.activities.create({ ...rest, completed: false });
    toast(t.success.created);
    onClose();
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={base ? t.plan.editActivity : t.plan.addActivity}
        footer={
          <>
            <Button variant="secondary" block onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button block type="submit" form="activity-form">
              {t.common.save}
            </Button>
          </>
        }
      >
        <form id="activity-form" onSubmit={submit} className="space-y-4" noValidate>
          <TextField label={t.plan.titleField} required autoFocus={!base} value={form.title} onChange={(e) => set('title', e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <SelectField label={t.plan.category} value={form.category} onChange={(e) => set('category', e.target.value as ActivityCategory)}>
              {ACTIVITY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t.categories[c]}
                </option>
              ))}
            </SelectField>
            <SelectField label={t.plan.date} value={form.date} onChange={(e) => set('date', e.target.value)}>
              {days.map((d) => (
                <option key={d} value={d}>
                  {formatWeekdayShort(d)}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField label={t.plan.startTime} type="time" optional value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
            <TextField label={t.plan.endTime} type="time" optional value={form.endTime} onChange={(e) => set('endTime', e.target.value)} />
          </div>
          {snap!.places.length > 0 && (
            <SelectField label={t.plan.linkPlace} optional value={form.placeId} onChange={(e) => pickPlace(e.target.value)}>
              <option value="">{t.plan.noPlace}</option>
              {snap!.places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SelectField>
          )}
          <TextField label={t.plan.location} optional value={form.locationName} onChange={(e) => set('locationName', e.target.value)} />
          <CoordsFields lat={form.lat} lng={form.lng} onLat={(v) => set('lat', v)} onLng={(v) => set('lng', v)} />
          <MoneyField
            label={t.plan.estimatedCost}
            optional
            amount={form.cost}
            currency={form.currency}
            onAmount={(v) => set('cost', v)}
            onCurrency={(v) => set('currency', v)}
          />
          <SelectField label={t.plan.bookingStatus} value={form.bookingStatus} onChange={(e) => set('bookingStatus', e.target.value as BookingStatus)}>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t.bookingStatus[s]}
              </option>
            ))}
          </SelectField>
          <TextAreaField label={t.plan.description} optional value={form.description} onChange={(e) => set('description', e.target.value)} />
          <TextAreaField label={t.common.notes} optional value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          <Toggle label={t.plan.completed} checked={form.completed} onChange={(v) => set('completed', v)} />
          {error && (
            <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] text-danger">
              {error}
            </p>
          )}
          {base && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button variant="secondary" size="sm" icon={<Copy size={16} />} onClick={duplicate}>
                {t.common.duplicate}
              </Button>
              <Button variant="danger" size="sm" icon={<Trash2 size={16} />} onClick={() => setConfirm(true)}>
                {t.common.delete}
              </Button>
            </div>
          )}
        </form>
      </Sheet>
      {base && (
        <ConfirmDialog
          open={confirm}
          onClose={() => setConfirm(false)}
          title={t.common.delete}
          message={t.plan.deleteConfirm(base.title)}
          onConfirm={() => {
            tripStore.activities.remove(base.id);
            toast(t.success.deleted);
            onClose();
          }}
        />
      )}
    </>
  );
}
