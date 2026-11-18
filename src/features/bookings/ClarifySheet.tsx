/**
 * Step-by-step clarification: one booking at a time, each open point as a
 * question with one-tap answers. Answers are saved via the normal booking API.
 */
import { CheckCircle2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { bookingsToClarify, type ClarifyKind } from '../../../shared/clarify';
import type { BookingDto, TripSnapshot } from '../../../shared/types';
import { BookingIcon, IconTile } from '../../components/status';
import { toast } from '../../components/toast';
import { Button, Chip, Input, Sheet } from '../../components/ui';
import { t } from '../../i18n';
import { http } from '../../lib/api';
import { formatDate, formatTime, money } from '../../lib/format';
import { tripStore, useOnline } from '../../lib/store';

export default function ClarifySheet({ snap, today, startId, onClose }: { snap: TripSnapshot; today: string; startId?: string | null; onClose: () => void }) {
  const online = useOnline();
  // The list is fixed when the sheet opens; answered items are skipped by id.
  const initial = useMemo(() => {
    const all = bookingsToClarify(snap.bookings, today);
    const i = startId ? all.findIndex((x) => x.booking.id === startId) : -1;
    return i > 0 ? [all[i], ...all.slice(0, i), ...all.slice(i + 1)] : all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [pos, setPos] = useState(0);
  const [busy, setBusy] = useState(false);
  const current = initial[pos];
  const live = current ? (snap.bookings.find((b) => b.id === current.booking.id) ?? current.booking) : null;
  const questions = live ? bookingsToClarify([live], today)[0]?.questions ?? [] : [];

  async function save(patch: Record<string, unknown>) {
    if (!live) return;
    setBusy(true);
    try {
      await tripStore.mutate(() => http.patch(`/trips/${snap.trip.id}/bookings/${live.id}`, { ...patch, version: live.version }));
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }
  const next = () => setPos((p) => p + 1);

  return (
    <Sheet open onClose={onClose} title={t.clarifyFlow.title} footer={<Button variant="secondary" block onClick={onClose}>{t.common.close}</Button>}>
      {!live ? (
        <div className="py-8 text-center">
          <CheckCircle2 size={36} className="mx-auto text-success" />
          <p className="mt-3 font-semibold">{t.clarifyFlow.done}</p>
        </div>
      ) : (
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-text-3">{t.clarifyFlow.step(pos + 1, initial.length)}</p>
          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
            <IconTile tone="warn">
              <BookingIcon type={live.type} />
            </IconTile>
            <div className="min-w-0">
              <p className="truncate font-semibold">{live.title}</p>
              <p className="text-[13px] text-text-3">
                {live.startDate ? formatDate(live.startDate) : t.bookings.undated}
                {live.startTime ? ` · ${formatTime(live.startTime)}` : ''}
                {live.priceMinor != null && live.currency ? ` · ${money(live.priceMinor, live.currency)}` : ''}
              </p>
            </div>
          </div>
          {questions.length === 0 ? (
            <p className="mt-5 flex items-center gap-2 font-semibold text-success">
              <CheckCircle2 size={18} /> {t.clarifyFlow.bookingDone}
            </p>
          ) : (
            <div className="mt-5 space-y-6">
              {questions.map((q) => (
                <Question key={q} kind={q} booking={live} snap={snap} busy={busy || !online} onSave={save} />
              ))}
            </div>
          )}
          <div className="mt-6 flex gap-2">
            <Button variant={questions.length ? 'secondary' : 'primary'} block onClick={next}>
              {questions.length ? t.clarifyFlow.later : t.clarifyFlow.next}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function Question({ kind, booking, snap, busy, onSave }: { kind: ClarifyKind; booking: BookingDto; snap: TripSnapshot; busy: boolean; onSave: (p: Record<string, unknown>) => Promise<void> }) {
  const [time, setTime] = useState('');
  const [who, setWho] = useState<string[]>(booking.travelerIds);
  if (kind === 'confirm')
    return (
      <div>
        <p className="font-semibold">{t.clarifyFlow.q.confirm}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => onSave({ bookingStatus: 'booked' })}>
            {t.clarifyFlow.yesBooked}
          </Button>
          <Button size="sm" variant="soft" disabled={busy} onClick={() => onSave({ bookingStatus: 'unconfirmed' })}>
            {t.clarifyFlow.notYet}
          </Button>
        </div>
      </div>
    );
  if (kind === 'time')
    return (
      <div>
        <p className="font-semibold">{t.clarifyFlow.q.time}</p>
        <div className="mt-2 flex gap-2">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={t.clarifyFlow.q.time} className="h-11 max-w-[9rem]" />
          <Button size="sm" disabled={busy || !time} onClick={() => onSave({ startTime: time })}>
            {t.common.save}
          </Button>
        </div>
      </div>
    );
  if (kind === 'persons')
    return (
      <div>
        <p className="font-semibold">{t.clarifyFlow.q.persons}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Chip active={who.length === snap.travelers.length} onClick={() => setWho(snap.travelers.map((x) => x.id))}>
            {t.clarifyFlow.everyone}
          </Chip>
          {snap.travelers.map((x) => (
            <Chip key={x.id} active={who.includes(x.id)} onClick={() => setWho((w) => (w.includes(x.id) ? w.filter((i) => i !== x.id) : [...w, x.id]))}>
              {x.name}
            </Chip>
          ))}
        </div>
        <Button className="mt-3" size="sm" disabled={busy || !who.length} onClick={() => onSave({ travelerIds: who, personsCount: who.length })}>
          {t.clarifyFlow.forN(who.length)}
        </Button>
      </div>
    );
  return (
    <div>
      <p className="font-semibold">{t.clarifyFlow.q.note}</p>
      <p className="mt-1 rounded-2xl bg-warn-soft px-3 py-2 text-[14px] text-warn">{booking.clarificationNote}</p>
      <Button className="mt-3" size="sm" disabled={busy} onClick={() => onSave({ clarificationNote: null })}>
        {t.clarifyFlow.resolved}
      </Button>
    </div>
  );
}
