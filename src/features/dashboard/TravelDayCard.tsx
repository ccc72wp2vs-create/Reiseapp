/**
 * Compact travel-day card (today or tomorrow): check-out → departure →
 * arrival → check-in, plus what is still open. Taps lead to the bookings.
 */
import { AlertTriangle, BedDouble, CheckCircle2, LogOut, MapPin } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { TravelDay } from '../../../shared/travelday';
import { ModeIcon } from '../../components/status';
import { cx } from '../../components/ui';
import { t } from '../../i18n';
import { formatDate, formatTime } from '../../lib/format';

function Step({ icon, label, title, time, last }: { icon: ReactNode; label: string; title: string; time: string | null; last?: boolean }) {
  return (
    <li className="relative flex gap-3 pb-3.5 last:pb-0">
      {!last && <span className="absolute left-[15px] top-8 h-[calc(100%-1.75rem)] w-px bg-line" aria-hidden />}
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">{icon}</span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-text-3">{label}</p>
        <p className="truncate text-[15px] font-semibold">{title}</p>
      </div>
      <span className={cx('shrink-0 pt-1 text-[14px] tabular', time ? 'font-semibold' : 'text-text-3')}>{time ?? t.home.tdTimeOpen}</span>
    </li>
  );
}

export function TravelDayCard({ day }: { day: TravelDay }) {
  const { leg, checkout, checkin, issues } = day;
  const b = leg.booking;
  const hotelTime = (list: typeof checkout, which: 'start' | 'end') => {
    const v = list.map((x) => (which === 'start' ? x.startTime : x.endTime)).find(Boolean);
    return v ? formatTime(v) : null;
  };
  const steps: { icon: ReactNode; label: string; title: string; time: string | null }[] = [];
  if (checkout.length) steps.push({ icon: <LogOut size={15} />, label: t.home.tdCheckout, title: checkout.map((x) => x.title).join(' · '), time: hotelTime(checkout, 'end') });
  steps.push({
    icon: <ModeIcon mode={leg.mode} />,
    label: t.home.tdDeparture,
    title: b ? b.title : `${leg.from.name} → ${leg.to.name}`,
    time: b?.startTime ? formatTime(b.startTime) : null,
  });
  if (b?.endTime) steps.push({ icon: <MapPin size={15} />, label: t.home.tdArrival, title: leg.to.name, time: formatTime(b.endTime) });
  if (checkin.length || day.to?.accommodationName)
    steps.push({ icon: <BedDouble size={15} />, label: t.home.tdCheckin, title: checkin.length ? checkin.map((x) => x.title).join(' · ') : day.to!.accommodationName!, time: hotelTime(checkin, 'start') });

  return (
    <section aria-label={t.home.travelDayTitle(day.inDays)} className="mt-5 rounded-[1.5rem] border border-accent/30 bg-surface p-4 shadow-card">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">{t.home.travelDayTitle(day.inDays)}</p>
        <p className="text-[12px] text-text-3">{formatDate(day.date)}</p>
      </div>
      <p className="mt-1 font-display text-[22px] font-semibold leading-tight">
        {leg.from.name} <span className="text-accent">→</span> {leg.to.name}
      </p>
      <Link to="/buchungen" className="mt-4 block">
        <ol>
          {steps.map((s, i) => (
            <Step key={i} {...s} last={i === steps.length - 1} />
          ))}
        </ol>
      </Link>
      <div className="mt-4 border-t border-line pt-3">
        {issues.length === 0 ? (
          <p className="flex items-center gap-2 text-[14px] font-semibold text-success">
            <CheckCircle2 size={16} /> {t.home.tdAllSet}
          </p>
        ) : (
          <>
            <p className="mb-2 text-[13px] font-semibold text-warn">{t.home.tdOpen(issues.length)}</p>
            <div className="flex flex-wrap gap-2">
              {issues.map((x, i) => (
                <Link
                  key={i}
                  to={'booking' in x ? `/buchungen?klaeren=${x.booking.id}` : '/buchungen'}
                  className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1.5 text-[13px] font-semibold text-warn"
                >
                  <AlertTriangle size={14} /> {t.home.tdIssue[x.kind]}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
