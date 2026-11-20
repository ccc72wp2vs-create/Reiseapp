/**
 * The central "+": one entry point for everything you can add. The action
 * that fits the current page is shown first and large; recent expenses can be
 * repeated with one tap.
 */
import { ArrowRight, CalendarPlus, ListTodo, MapPin, Plus, Receipt, ScanLine, Ticket } from 'lucide-react';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { recentTemplates, type ExpenseTemplate } from '../../shared/quickfill';
import { destinationOn, sortDestinations, todayIn } from '../../shared/trip';
import { t } from '../i18n';
import { money } from '../lib/format';
import { useTrip } from './AppShell';
import { IconButton, Input, Sheet } from './ui';
import { parseExpenseSentence } from '../../shared/sentence';
import type { ExpensePrefill } from '../features/wallet/ExpenseSheet';

const ExpenseSheet = lazy(() => import('../features/wallet/ExpenseSheet'));
const ReceiptSplitSheet = lazy(() => import('../features/wallet/ReceiptSplitSheet'));
const BookingSheet = lazy(() => import('../features/bookings/BookingSheet'));
const ActivitySheet = lazy(() => import('../features/itinerary/ActivitySheet'));
const PlaceSheet = lazy(() => import('../features/explore/PlaceSheet'));
const TodoSheet = lazy(() => import('../features/todos/TodosPage').then((m) => ({ default: m.TodoSheet })));

type Kind = 'expense' | 'receipt' | 'booking' | 'activity' | 'place' | 'todo';

export function QuickAddButton() {
  const { snap, canEdit, user } = useTrip();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind | null>(null);
  const [template, setTemplate] = useState<ExpenseTemplate | null>(null);
  const [sentence, setSentence] = useState('');
  const [parsed, setParsed] = useState<ExpensePrefill | null>(null);
  if (!snap) return <span className="flex-1" />;
  const params = new URLSearchParams(location.search);
  const primary: Kind = location.pathname.startsWith('/plan')
    ? params.get('ansicht') === 'ideen'
      ? 'place'
      : 'activity'
    : location.pathname.startsWith('/buchungen')
      ? 'booking'
      : location.pathname.startsWith('/todos')
        ? 'todo'
        : 'expense';
  const today = todayIn(snap.destinations[0]?.timezone ?? snap.trip.homeTimezone);
  const planDay = location.pathname.startsWith('/plan') ? params.get('tag') : null;
  const where = destinationOn(snap.destinations, today);
  const stopId = (where.current ?? where.next ?? sortDestinations(snap.destinations)[0])?.id ?? null;
  const templates = recentTemplates(snap.expenses, 3);

  const options: { kind: Kind; label: string; hint: string; icon: ReactNode }[] = [
    { kind: 'expense', label: t.wallet.addExpense, hint: t.quickAdd.expenseHint, icon: <Receipt size={20} /> },
    { kind: 'receipt', label: t.receipt.button, hint: t.quickAdd.receiptHint, icon: <ScanLine size={20} /> },
    { kind: 'booking', label: t.bookings.add, hint: t.quickAdd.bookingHint, icon: <Ticket size={20} /> },
    { kind: 'activity', label: t.plan.addActivity, hint: t.quickAdd.activityHint, icon: <CalendarPlus size={20} /> },
    { kind: 'place', label: t.quickAdd.place, hint: t.quickAdd.placeHint, icon: <MapPin size={20} /> },
    { kind: 'todo', label: t.todos.hint1, hint: t.todos.quickHint, icon: <ListTodo size={20} /> },
  ];
  const first = options.find((o) => o.kind === primary)!;
  const rest = options.filter((o) => o.kind !== primary && (o.kind !== 'receipt' || snap.travelers.length > 1));
  const me = snap.travelers.find((x) => x.userId && x.userId === user?.id)?.id ?? null;
  const fromSentence = () => {
    const r = parseExpenseSentence(sentence, snap.travelers, me, snap.trip.localCurrency ?? snap.trip.baseCurrency);
    setParsed({ title: r.title, amountMinor: r.amountMinor, currency: r.currency, category: r.category, payerId: r.payerId, participantIds: r.participantIds });
    setSentence('');
    setTemplate(null);
    setKind('expense');
    setOpen(false);
  };
  const choose = (k: Kind, tpl: ExpenseTemplate | null = null) => {
    setParsed(null);
    setTemplate(tpl);
    setKind(k);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        aria-label={t.quickAdd.open}
        disabled={!canEdit}
        onClick={() => setOpen(true)}
        className="mx-auto -mt-5 grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-ink shadow-[0_10px_24px_-8px_var(--accent)] ring-[5px] ring-bg transition active:scale-95 disabled:opacity-40"
      >
        <Plus size={28} strokeWidth={2.4} />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={t.quickAdd.title}>
        <div className="space-y-2.5 pb-2">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (sentence.trim()) fromSentence();
            }}
          >
            <Input
              aria-label={t.quickAdd.sentenceLabel}
              placeholder={t.quickAdd.sentencePlaceholder}
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
              className="h-12 min-w-0 flex-1"
              enterKeyHint="go"
            />
            <IconButton label={t.quickAdd.sentenceGo} variant="primary" type="submit" disabled={!sentence.trim()} className="h-12 w-12">
              <ArrowRight size={20} />
            </IconButton>
          </form>
          <button type="button" onClick={() => choose(first.kind)} className="flex w-full items-center gap-3 rounded-[1.25rem] border border-accent/35 bg-accent-soft p-4 text-left">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent text-accent-ink">{first.icon}</span>
            <span className="min-w-0">
              <span className="block text-[16px] font-semibold">{first.label}</span>
              <span className="block text-[13px] text-text-3">{first.hint}</span>
            </span>
          </button>
          <div className="grid grid-cols-2 gap-2.5">
            {rest.map((o) => (
              <button key={o.kind} type="button" onClick={() => choose(o.kind)} className="flex flex-col gap-2 rounded-[1.25rem] border border-line bg-surface p-3.5 text-left">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent">{o.icon}</span>
                <span className="text-[15px] font-semibold leading-tight">{o.label}</span>
                <span className="text-[12px] leading-snug text-text-3">{o.hint}</span>
              </button>
            ))}
          </div>
          {templates.length > 0 && (
            <div className="border-t border-line pt-3">
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-text-3">{t.quickAdd.again}</p>
              <div className="flex flex-wrap gap-2">
                {templates.map((tpl) => (
                  <button
                    key={tpl.title}
                    type="button"
                    onClick={() => choose('expense', tpl)}
                    className="rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-text-2"
                  >
                    {tpl.title} {money(tpl.amountMinor, tpl.currency)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Sheet>

      <Suspense fallback={null}>
        {kind === 'expense' && (
          <ExpenseSheet
            open
            onClose={() => setKind(null)}
            prefill={
              parsed ??
              (template ? { title: template.title, amountMinor: template.amountMinor, currency: template.currency, category: template.category, participantIds: template.participantIds } : null)
            }
          />
        )}
        {kind === 'receipt' && <ReceiptSplitSheet snap={snap} onClose={() => setKind(null)} />}
        {kind === 'booking' && <BookingSheet open onClose={() => setKind(null)} />}
        {kind === 'activity' && <ActivitySheet open onClose={() => setKind(null)} defaults={{ date: planDay ?? (today >= snap.trip.startDate && today <= snap.trip.endDate ? today : snap.trip.startDate) }} />}
        {kind === 'todo' && <TodoSheet snap={snap} onClose={() => setKind(null)} />}
        {kind === 'place' && <PlaceSheet open onClose={() => setKind(null)} defaultDestinationId={stopId} />}
      </Suspense>
    </>
  );
}

