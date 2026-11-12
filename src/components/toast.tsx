import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { errorMessage } from '../lib/api';
import { cx } from './ui';

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; onClick: () => void };
}

let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(message: string, kind: ToastKind = 'success', opts: { action?: Toast['action']; duration?: number } = {}) {
  const id = ++seq;
  toasts = [...toasts.slice(-2), { id, kind, message, action: opts.action }];
  emit();
  const duration = opts.duration ?? (kind === 'error' ? 6000 : 3200);
  if (duration > 0) setTimeout(() => dismiss(id), duration);
  return id;
}
toast.error = (e: unknown) => toast(errorMessage(e), 'error');

export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
  );
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 0.75rem)' }}
    >
      {list.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={cx(
            'animate-sheet pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border px-4 py-3 text-[14px] font-medium shadow-float glass',
            t.kind === 'error' ? 'border-danger/40' : 'border-line',
          )}
        >
          <span className={cx('mt-0.5', t.kind === 'error' ? 'text-danger' : t.kind === 'info' ? 'text-info' : 'text-accent')}>
            {t.kind === 'error' ? <AlertCircle size={18} /> : t.kind === 'info' ? <Info size={18} /> : <CheckCircle2 size={18} />}
          </span>
          <span className="flex-1 leading-snug">{t.message}</span>
          {t.action && (
            <button
              className="shrink-0 font-semibold text-accent"
              onClick={() => {
                t.action!.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
