import { CalendarDays, Compass, Home, LayoutGrid, Wallet } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { AssistantButton } from '../features/assistant/AssistantButton';
import { ROLE_RANK } from '../../shared/constants';
import { todayIn } from '../../shared/trip';
import type { TripSnapshot, TripSummaryDto } from '../../shared/types';
import { t } from '../i18n';
import { useAuth } from '../lib/auth';
import { getSelectedTripId, tripsList, tripStore, useTrips, useTripState } from '../lib/store';
import { SyncIndicator } from './SyncStatus';
import { cx } from './ui';

const NAV = [
  { to: '/', label: t.nav.home, icon: Home, end: true },
  { to: '/plan', label: t.nav.plan, icon: CalendarDays },
  { to: '/entdecken', label: t.nav.explore, icon: Compass },
  { to: '/kasse', label: t.nav.wallet, icon: Wallet },
  { to: '/mehr', label: t.nav.more, icon: LayoutGrid },
];

/** Picks the most relevant trip: ongoing → next upcoming → most recent. */
export function pickDefaultTrip(trips: TripSummaryDto[]): string | null {
  const active = trips.filter((x) => !x.archivedAt);
  const list = active.length ? active : trips;
  if (!list.length) return null;
  const today = todayIn('Europe/Berlin');
  const ongoing = list.find((x) => x.startDate <= today && today <= x.endDate && !x.isDemo);
  if (ongoing) return ongoing.id;
  const upcoming = list.filter((x) => x.startDate > today).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const real = upcoming.find((x) => !x.isDemo) ?? upcoming[0];
  if (real) return real.id;
  return [...list].sort((a, b) => b.endDate.localeCompare(a.endDate))[0].id;
}

export function AppShell() {
  const { trips } = useTrips();
  const location = useLocation();
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    void (async () => {
      const list = await tripsList.load();
      const selected = getSelectedTripId();
      const id = selected && list.some((x) => x.id === selected) ? selected : pickDefaultTrip(list);
      await tripStore.select(id);
      setBooted(true);
    })();
  }, []);

  // Keep the selected trip valid when the list changes (e.g. after deletion).
  useEffect(() => {
    if (!booted || !trips) return;
    const cur = tripStore.get().tripId;
    if (cur && !trips.some((x) => x.id === cur)) void tripStore.select(pickDefaultTrip(trips));
    if (!cur && trips.length) void tripStore.select(pickDefaultTrip(trips));
  }, [trips, booted]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl">
      <div className="statusbar-backdrop" aria-hidden />
      <SyncIndicator />
      <main className="pb-nav">
        <Outlet />
      </main>
      <AssistantButton />
      <BottomNav />
    </div>
  );
}

function BottomNav() {
  return (
    <nav aria-label={t.nav.main} className="glass fixed inset-x-0 bottom-0 z-40 border-t border-line">
      <ul className="mx-auto flex max-w-3xl items-stretch justify-around px-2 pt-1.5" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)' }}>
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'group flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold tracking-wide transition',
                  isActive ? 'text-accent' : 'text-text-3 hover:text-text-2',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cx('grid h-8 w-12 place-items-center rounded-full transition', isActive && 'bg-accent-soft')}>
                    <Icon size={21} strokeWidth={isActive ? 2.4 : 2} />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Convenience hook for pages that need the current trip. */
export function useTrip() {
  const state = useTripState();
  const { user } = useAuth();
  const snap = state.view as TripSnapshot | null;
  const role = snap?.trip.role ?? 'viewer';
  const me = snap?.travelers.find((x) => x.userId === user?.id) ?? null;
  return {
    state,
    snap,
    user,
    canEdit: ROLE_RANK[role] >= ROLE_RANK.editor,
    isOwner: role === 'owner',
    me,
  };
}

export function PageHeader({ title, eyebrow, action, children }: { title: string; eyebrow?: ReactNode; action?: ReactNode; children?: ReactNode }) {
  return (
    <header className="px-safe pt-safe">
      <div className="flex items-end justify-between gap-3 pt-4">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-[13px] font-semibold uppercase tracking-[0.14em] text-text-3">{eyebrow}</div>}
          <h1 className="font-display text-[34px] font-semibold leading-[1.05]">{title}</h1>
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      {children}
    </header>
  );
}
