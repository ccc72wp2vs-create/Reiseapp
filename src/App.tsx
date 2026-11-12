import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router';
import { AppShell } from './components/AppShell';
import { Logo } from './components/CoverArt';
import { Toaster } from './components/toast';
import { Skeleton } from './components/ui';
import { HomePage } from './features/dashboard/HomePage';
import { auth, useAuth } from './lib/auth';

const LoginPage = lazy(() => import('./features/auth/LoginPage'));
const SetupPage = lazy(() => import('./features/auth/SetupPage'));
const InvitePage = lazy(() => import('./features/auth/InvitePage'));
const PlanPage = lazy(() => import('./features/itinerary/PlanPage'));
const ExplorePage = lazy(() => import('./features/explore/ExplorePage'));
const WalletPage = lazy(() => import('./features/wallet/WalletPage'));
const BookingsPage = lazy(() => import('./features/bookings/BookingsPage'));
const PackingPage = lazy(() => import('./features/packing/PackingPage'));
const MorePage = lazy(() => import('./features/more/MorePage'));
const SettingsPage = lazy(() => import('./features/more/SettingsPage'));
const InstallPage = lazy(() => import('./features/more/InstallPage'));
const TripsPage = lazy(() => import('./features/trips/TripsPage'));
const TripDetailsPage = lazy(() => import('./features/trips/TripDetailsPage'));
const RoutePage = lazy(() => import('./features/trips/RoutePage'));
const NotFoundPage = lazy(() => import('./features/more/NotFoundPage'));

function PageFallback() {
  return (
    <div className="space-y-4 px-safe pt-safe">
      <Skeleton className="mt-6 h-10 w-2/3" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function Root() {
  const { status } = useAuth();
  useEffect(() => {
    void auth.init();
  }, []);
  return (
    <>
      <Toaster />
      {status === 'loading' ? (
        <div className="grid min-h-dvh place-items-center">
          <Logo size={44} withWordmark={false} className="animate-pulse" />
        </div>
      ) : (
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      )}
    </>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, setupRequired } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to={setupRequired ? '/einrichtung' : '/anmelden'} replace state={{ from: location.pathname }} />;
  return children;
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/anmelden', element: <LoginPage /> },
      { path: '/einrichtung', element: <SetupPage /> },
      { path: '/einladung/:token', element: <InvitePage /> },
      {
        element: (
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <HomePage /> },
          { path: 'plan', element: <PlanPage /> },
          { path: 'entdecken', element: <ExplorePage /> },
          { path: 'kasse', element: <WalletPage /> },
          { path: 'mehr', element: <MorePage /> },
          { path: 'buchungen', element: <BookingsPage /> },
          { path: 'packliste', element: <PackingPage /> },
          { path: 'reisen', element: <TripsPage /> },
          { path: 'reise', element: <TripDetailsPage /> },
          { path: 'route', element: <RoutePage /> },
          { path: 'einstellungen', element: <SettingsPage /> },
          { path: 'installieren', element: <InstallPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
