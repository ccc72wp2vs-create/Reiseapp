/**
 * Home-screen section that can shrink to a single line ("Als Nächstes · 3
 * Buchungen ›"). The open/closed choice is remembered per section on this
 * device; important sections simply stay open by default.
 */
import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cx } from './ui';

export function Collapsible({
  id,
  title,
  summary,
  defaultOpen,
  action,
  children,
}: {
  /** Key for remembering the state. */
  id: string;
  title: string;
  /** Shown next to the title while closed. */
  summary?: ReactNode;
  defaultOpen: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  const key = `travio.home.${id}`;
  const [open, setOpenState] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v == null ? defaultOpen : v === '1';
    } catch {
      return defaultOpen;
    }
  });
  const setOpen = (v: boolean) => {
    setOpenState(v);
    try {
      localStorage.setItem(key, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={cx(
            'flex min-w-0 flex-1 items-center gap-2 text-left',
            !open && 'rounded-[1.25rem] border border-line bg-surface px-4 py-3.5',
          )}
        >
          <span className="shrink-0 text-[13px] font-semibold uppercase tracking-[0.16em] text-text-3">{title}</span>
          {!open && summary && <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-text">{summary}</span>}
          <ChevronDown size={18} className={cx('ml-auto shrink-0 text-text-3 transition', open && 'rotate-180')} />
        </button>
        {open && action}
      </div>
      {open && children}
    </section>
  );
}
