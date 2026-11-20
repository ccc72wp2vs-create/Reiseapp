/**
 * "Wo stand nochmal …?" – one search field over the whole trip.
 * Results open the matching entry directly (sheet in place, bookings via deep link).
 */
import { CalendarDays, ListTodo, MapPin, MessageCircle, Receipt, Search, Ticket, X } from 'lucide-react';
import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { searchTrip, type SearchHit, type SearchKind } from '../../../shared/search';
import type { TripSnapshot } from '../../../shared/types';
import { PageHeader, useTrip } from '../../components/AppShell';
import { Card, EmptyState, Input, Skeleton } from '../../components/ui';
import { t } from '../../i18n';
import { formatDate } from '../../lib/format';

const ExpenseSheet = lazy(() => import('../wallet/ExpenseSheet'));
const PlaceSheet = lazy(() => import('../explore/PlaceSheet'));
const ActivitySheet = lazy(() => import('../itinerary/ActivitySheet'));
const TodoSheet = lazy(() => import('../todos/TodosPage').then((m) => ({ default: m.TodoSheet })));

const ICONS: Record<SearchKind, ReactNode> = {
  booking: <Ticket size={18} />,
  expense: <Receipt size={18} />,
  place: <MapPin size={18} />,
  activity: <CalendarDays size={18} />,
  stop: <MapPin size={18} />,
  todo: <ListTodo size={18} />,
  comment: <MessageCircle size={18} />,
};

export default function SearchPage() {
  const { snap } = useTrip();
  if (!snap) return <Skeleton className="m-4 h-64" />;
  return <SearchView snap={snap} />;
}

function SearchView({ snap }: { snap: TripSnapshot }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<SearchHit | null>(null);
  const hits = useMemo(() => searchTrip(snap, q, t.search.labels), [snap, q]);

  function choose(h: SearchHit) {
    if (h.targetKind === 'booking') navigate(`/buchungen?id=${h.targetId}`);
    else if (h.targetKind === 'stop') navigate('/route');
    else setOpen(h);
  }
  const close = () => setOpen(null);
  const target = open?.targetId;

  return (
    <div>
      <PageHeader title={t.search.title} eyebrow={snap.trip.name} />
      <div className="px-safe pb-nav pt-4">
        <div className="relative mb-4">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-3" />
          <Input
            type="search"
            autoFocus
            aria-label={t.search.title}
            placeholder={t.search.placeholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-12 w-full pl-11 pr-11"
            enterKeyHint="search"
          />
          {q && (
            <button type="button" aria-label={t.search.clear} onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-3">
              <X size={17} />
            </button>
          )}
        </div>
        {q.trim().length < 2 ? (
          <p className="px-1 text-[14px] leading-relaxed text-text-3">{t.search.hint}</p>
        ) : hits.length === 0 ? (
          <EmptyState icon={<Search size={26} />} title={t.search.none} text={t.search.noneText} />
        ) : (
          <Card className="divide-y divide-line">
            {hits.map((h) => (
              <button key={`${h.kind}-${h.id}`} type="button" onClick={() => choose(h)} className="flex w-full items-start gap-3 p-4 text-left">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">{ICONS[h.kind]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{h.title}</span>
                  <span className="block text-[12px] text-text-3">
                    {[t.search.kinds[h.kind], h.date ? formatDate(h.date) : null].filter(Boolean).join(' · ')}
                  </span>
                  {h.detail && <span className="mt-0.5 block truncate text-[13px] text-text-2">{h.detail}</span>}
                </span>
              </button>
            ))}
          </Card>
        )}
      </div>
      <Suspense fallback={null}>
        {open?.targetKind === 'expense' && <ExpenseSheet open expense={snap.expenses.find((x) => x.id === target) ?? null} onClose={close} />}
        {open?.targetKind === 'place' && <PlaceSheet open place={snap.places.find((x) => x.id === target) ?? null} onClose={close} />}
        {open?.targetKind === 'activity' && <ActivitySheet open activity={snap.activities.find((x) => x.id === target) ?? null} onClose={close} />}
        {open?.targetKind === 'todo' && <TodoSheet snap={snap} todo={(snap.todos ?? []).find((x) => x.id === target) ?? null} onClose={close} />}
      </Suspense>
    </div>
  );
}
