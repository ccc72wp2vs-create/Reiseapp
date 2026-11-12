/**
 * TRAVIO UI primitives. Small, dependency-free, themed via CSS tokens.
 */
import { X } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n';
import { toast } from './toast';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-strong shadow-[0_8px_24px_-12px_var(--accent)]',
  secondary: 'bg-surface-2 text-text hover:bg-surface-3 border border-line',
  soft: 'bg-accent-soft text-accent hover:brightness-110',
  ghost: 'bg-transparent text-text-2 hover:text-text hover:bg-surface-2',
  danger: 'bg-danger-soft text-danger hover:brightness-110',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, loading, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  const sizes = { sm: 'h-9 px-3.5 text-sm gap-1.5', md: 'h-12 px-5 text-[15px] gap-2', lg: 'h-14 px-6 text-base gap-2.5' };
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex select-none items-center justify-center rounded-full font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100',
        VARIANTS[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  children,
  className,
  variant = 'ghost',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: Variant }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-grid h-11 w-11 shrink-0 place-items-center rounded-full transition active:scale-95 disabled:opacity-40',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)}
    />
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-[1.5rem] border border-line bg-surface shadow-card', className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-3 mt-8 flex items-end justify-between gap-3', className)}>
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-text-3">{children}</h2>
      {action}
    </div>
  );
}

type Tone = 'neutral' | 'accent' | 'warn' | 'danger' | 'info' | 'success';
const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-text-2 border-line',
  accent: 'bg-accent-soft text-accent border-transparent',
  warn: 'bg-warn-soft text-warn border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
  info: 'bg-info-soft text-info border-transparent',
  success: 'bg-success-soft text-success border-transparent',
};

export function Badge({ tone = 'neutral', icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-semibold leading-none',
        TONES[tone],
        className,
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx('skeleton rounded-2xl', className)} />;
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[1.75rem] border border-dashed border-line-strong px-6 py-10 text-center">
      {icon && <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">{icon}</div>}
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      {text && <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-text-2">{text}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-[1.5rem] border border-danger/30 bg-danger-soft p-5 text-[15px]">
      <p className="text-danger">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          {t.common.retry}
        </Button>
      )}
    </div>
  );
}

export function Progress({ value, className, label }: { value: number; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cx('h-2 overflow-hidden rounded-full bg-surface-3', className)}
    >
      <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

const inputBase =
  'w-full rounded-2xl border border-line bg-bg-elevated px-4 text-[16px] text-text placeholder:text-text-3 transition focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft disabled:opacity-60';

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  optional,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
  optional?: boolean;
  className?: string;
}) {
  return (
    <div className={cx('min-w-0', className)}>
      <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-semibold text-text-2">
        <span>{label}</span>
        {optional && <span className="font-normal text-text-3">{t.common.optional}</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-[13px] text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] leading-snug text-text-3">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(inputBase, 'h-12', className)} {...rest} />;
});

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputBase, 'min-h-[96px] py-3 leading-relaxed', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        inputBase,
        'h-12 appearance-none bg-[length:16px] bg-[right_1rem_center] bg-no-repeat pr-10',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237d8da1' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

/** Text field bound to a label (auto id). */
export function TextField({
  label,
  hint,
  error,
  optional,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string | null; optional?: boolean }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} optional={optional} className={className}>
      <Input id={id} aria-invalid={!!error} {...rest} />
    </Field>
  );
}

export function SelectField({
  label,
  hint,
  optional,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: ReactNode; optional?: boolean }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id} optional={optional} className={className}>
      <Select id={id} {...rest}>
        {children}
      </Select>
    </Field>
  );
}

export function TextAreaField({
  label,
  hint,
  optional,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: ReactNode; optional?: boolean }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id} optional={optional} className={className}>
      <Textarea id={id} {...rest} />
    </Field>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block text-[15px] font-medium">{label}</span>
        {description && <span className="block text-[13px] text-text-3">{description}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-7 w-12 rounded-full bg-surface-3 transition peer-checked:bg-accent peer-focus-visible:ring-4 peer-focus-visible:ring-accent-soft" />
        <span className="absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('flex rounded-full border border-line bg-surface p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-[14px] font-semibold transition',
            value === o.value ? 'bg-text text-bg shadow' : 'text-text-2 hover:text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children, icon }: { active: boolean; onClick: () => void; children: ReactNode; icon?: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[14px] font-semibold transition',
        active ? 'border-transparent bg-text text-bg' : 'border-line bg-surface text-text-2 hover:text-text',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Sheet (bottom sheet on phones, dialog on larger screens)
// ---------------------------------------------------------------------------

let openSheets = 0;

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    openSheets++;
    document.documentElement.style.overflow = 'hidden';
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      window.removeEventListener('keydown', onKey);
      openSheets--;
      if (openSheets === 0) document.documentElement.style.overflow = '';
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="animate-fade absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          'animate-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-[1.75rem] border border-line bg-bg-elevated shadow-float outline-none sm:rounded-[1.75rem]',
          size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3">
          <h2 id={titleId} className="font-display text-[22px] font-semibold">
            {title}
          </h2>
          <IconButton label={t.common.close} onClick={onClose} variant="secondary" className="h-10 w-10">
            <X size={18} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-2">{children}</div>
        {footer && (
          <div className="flex gap-3 border-t border-line px-5 pt-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = t.common.delete,
  onConfirm,
  onClose,
  danger = true,
  children,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
  danger?: boolean;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" block onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            block
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } catch (e) {
                toast.error(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[15px] leading-relaxed text-text-2">{message}</p>
      {children}
    </Sheet>
  );
}
