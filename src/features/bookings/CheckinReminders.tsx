import { Check, ExternalLink, PlaneTakeoff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { checkinReminders, flightsMissingTime, type CheckinInfo } from '../../../shared/checkin';
import { diffDays, todayIn } from '../../../shared/trip';
import type { BookingDto, TripSnapshot } from '../../../shared/types';
import { toast } from '../../components/toast';
import { cx } from '../../components/ui';
import { t } from '../../i18n';
import { http } from '../../lib/api';
import { tripStore } from '../../lib/store';

/** Re-evaluate once a minute so states flip without a reload. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** "heute, 12:00" / "morgen, 08:30" / "Sa., 21.11., 12:00" in the departure's time zone. */
function when(ms: number, now: number, timeZone: string): string {
  const day = (x: number) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(x));
  const time = new Intl.DateTimeFormat('de-DE', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
  const d = day(ms);
  if (d === day(now)) return `heute, ${time} Uhr`;
  if (d === day(now + 86_400_000)) return `morgen, ${time} Uhr`;
  const date = new Intl.DateTimeFormat('de-DE', { timeZone, weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(ms));
  return `${date}, ${time} Uhr`;
}

async function setDone(tripId: string, b: BookingDto, done: boolean): Promise<BookingDto> {
  const res = await tripStore.mutate(() =>
    http.patch<{ booking: BookingDto }>(`/trips/${tripId}/bookings/${b.id}`, {
      checkinDoneAt: done ? new Date().toISOString() : null,
      version: b.version,
    }),
  );
  return res.booking;
}

export function CheckinReminders({ snap, canEdit }: { snap: TripSnapshot; canEdit: boolean }) {
  const now = useNow();
  const tz = snap.destinations[0]?.timezone ?? snap.trip.homeTimezone;
  const items = checkinReminders(snap.bookings, now, tz);
  const today = todayIn(tz, new Date(now));
  const missing = flightsMissingTime(snap.bookings, today);
  if (!items.length && !missing.length) return null;
  return (
    <section aria-label={t.checkin.go} className="mt-5 space-y-2.5">
      {missing.map((b) => (
        <Link
          key={b.id}
          to={canEdit ? `/buchungen?id=${b.id}` : '/buchungen'}
          className="flex items-start gap-3 rounded-[1.25rem] border border-line bg-surface p-4 transition active:scale-[0.99]"
        >
          <PlaneTakeoff className="mt-0.5 shrink-0 text-text-3" size={20} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-snug">{t.checkin.missingTime(b.title, diffDays(today, b.startDate!) === 1)}</p>
            <p className="mt-0.5 text-[13px] text-text-2">{t.checkin.missingTimeSub}</p>
          </div>
        </Link>
      ))}
      {items.map((i) => (
        <CheckinCard key={i.booking.id} info={i} now={now} tz={tz} tripId={snap.trip.id} canEdit={canEdit} />
      ))}
    </section>
  );
}

function CheckinCard({ info, now, tz, tripId, canEdit }: { info: CheckinInfo; now: number; tz: string; tripId: string; canEdit: boolean }) {
  const [busy, setBusy] = useState(false);
  const b = info.booking;
  const zone = b.startTimezone || tz;
  const active = info.state === 'open' || info.state === 'closing';
  const title = info.flightNumber ? `${b.title} (${info.flightNumber})` : b.title;
  const headline = info.state === 'closing' ? t.checkin.closing(title) : info.state === 'open' ? t.checkin.open(title) : t.checkin.upcoming(title);
  const sub = [
    active ? t.checkin.closesAt(when(info.closesMs, now, zone)) : t.checkin.opensAt(when(info.opensMs, now, zone)),
    t.checkin.departure(when(info.departureMs, now, zone)),
  ].join(' · ');
  const note = !info.flightNumber ? null : !info.airline?.url ? t.checkin.noLink : null;
  const unconfirmed = !info.airline || !info.airline.windowConfirmed;

  async function markDone() {
    setBusy(true);
    try {
      const updated = await setDone(tripId, b, true);
      toast(t.checkin.doneToast, 'success', {
        action: { label: t.checkin.undo, onClick: () => void setDone(tripId, updated, false).catch(toast.error) },
      });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cx(
        'rounded-[1.25rem] border p-4',
        info.state === 'closing' ? 'border-warn/35 bg-warn-soft' : active ? 'border-accent/35 bg-accent-soft' : 'border-line bg-surface',
      )}
    >
      <div className="flex items-start gap-3">
        <PlaneTakeoff className={cx('mt-0.5 shrink-0', info.state === 'closing' ? 'text-warn' : active ? 'text-accent' : 'text-text-3')} size={20} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug">{headline}</p>
          <p className="mt-0.5 text-[13px] text-text-2">{sub}</p>
          {(note || unconfirmed) && (
            <p className="mt-1 text-[12px] leading-snug text-text-3">
              {[note, unconfirmed ? t.checkin.checkWindow : null].filter(Boolean).join(' ')}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 pl-8">
        {info.airline?.url ? (
          <a
            href={info.airline.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[14px] font-semibold text-accent-ink active:scale-[0.98]"
          >
            {t.checkin.go}
            <ExternalLink size={15} />
          </a>
        ) : !info.flightNumber && canEdit ? (
          <Link
            to={`/buchungen?id=${b.id}`}
            className="inline-flex h-9 items-center rounded-full border border-line bg-surface px-4 text-[14px] font-semibold active:scale-[0.98]"
          >
            {t.checkin.addFlightNumber}
          </Link>
        ) : null}
        {canEdit && (
          <button
            type="button"
            disabled={busy}
            onClick={markDone}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-[14px] font-semibold active:scale-[0.98] disabled:opacity-50"
          >
            <Check size={15} />
            {t.checkin.done}
          </button>
        )}
      </div>
    </div>
  );
}
