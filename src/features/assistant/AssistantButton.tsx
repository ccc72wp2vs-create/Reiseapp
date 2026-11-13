import { Sparkles } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useLocation } from 'react-router';
import { useTripState } from '../../lib/store';

const AssistantSheet = lazy(() => import('./AssistantSheet'));

/** Hidden where it would sit on top of a map or when no trip is loaded. */
const HIDDEN = ['/route', '/reisen'];

/** Small floating "Frag TRAVIO" button, bottom right above the tab bar. */
export function AssistantButton() {
  const [open, setOpen] = useState(false);
  const { view } = useTripState();
  const { pathname } = useLocation();
  if (!view || HIDDEN.some((p) => pathname.startsWith(p))) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Frag TRAVIO"
        className="fixed z-30 grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-accent text-accent-ink shadow-[0_10px_28px_-10px_var(--accent)] transition active:scale-95"
        style={{ right: 'max(1rem, env(safe-area-inset-right))', bottom: 'calc(5.25rem + env(safe-area-inset-bottom))' }}
      >
        <Sparkles size={21} strokeWidth={2.2} />
      </button>
      <Suspense fallback={null}>{open && <AssistantSheet open onClose={() => setOpen(false)} />}</Suspense>
    </>
  );
}
