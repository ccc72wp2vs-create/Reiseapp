/** "Heimreise-Check" on the home screen in the last two days of a trip. */
import { ArrowRight, Check, Plane } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { homewardCheck } from '../../../shared/homeward';
import type { TripSnapshot } from '../../../shared/types';
import { cx } from '../../components/ui';
import { t } from '../../i18n';

export default function HomewardCard({ snap, viewerTravelerId }: { snap: TripSnapshot; viewerTravelerId: string | null }) {
  const items = homewardCheck(snap, viewerTravelerId);
  const open = items.filter((i) => !i.done);
  const [expanded, setExpanded] = useState(false);
  if (!items.length) return null;
  const shown = expanded ? items : open.length ? open : [];
  return (
    <section aria-label={t.homeward.title} className="mt-3 rounded-[1.25rem] border border-accent/30 bg-surface p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Plane size={19} className="rotate-180" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t.homeward.title}</p>
          <p className="text-[13px] text-text-3">{open.length ? t.homeward.open(open.length, items.length) : t.homeward.allDone}</p>
        </div>
        {open.length > 0 && items.length > open.length && (
          <button type="button" onClick={() => setExpanded(!expanded)} className="text-[13px] font-semibold text-accent">
            {expanded ? t.homeward.onlyOpen : t.homeward.showAll}
          </button>
        )}
      </div>
      {shown.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {shown.map((i) => (
            <li key={i.key}>
              <Link to={i.to} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
                <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-full border-2', i.done ? 'border-success bg-success text-white' : 'border-line-strong')}>
                  {i.done && <Check size={13} strokeWidth={3} />}
                </span>
                <span className={cx('flex-1 text-[14px]', i.done && 'text-text-3')}>{t.homeward.items[i.key](i.open)}</span>
                {!i.done && <ArrowRight size={16} className="shrink-0 text-text-3" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!open.length && snap.expenses.length > 0 && (
        <Link to="/abrechnung" className="mt-3 flex items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-[14px] font-semibold text-accent-ink">
          {t.homeward.share} <ArrowRight size={16} />
        </Link>
      )}
    </section>
  );
}
