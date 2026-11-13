import { ArrowRight, CircleHelp, Clock, Plus, Ticket, Wallet, FileUp, Link2 } from 'lucide-react';
import { lazy, Suspense, useMemo, useState, useEffect } from 'react';
import { costInfo, summarizeBookingCosts } from '../../../shared/costs';
import { expensesMatchingBooking } from '../../../shared/match';
import { normalizeRate } from '../../../shared/money';
import { bookingSortKey, isTransport, todayIn } from '../../../shared/trip';
import type { BookingDto, TripSnapshot } from '../../../shared/types';
import { PageHeader, useTrip } from '../../components/AppShell';
import { BookingBadges, BookingIcon } from '../../components/status';
import { toast } from '../../components/toast';
import { Badge, Button, Card, Chip, EmptyState, Field, IconButton, Input, SectionTitle, Segmented, Select, Sheet, Skeleton, cx } from '../../components/ui';
import { PersonFilter, usePersonSelection } from '../../components/PersonFilter';
import { addDaysToDate } from '../../../shared/trip';
import { t } from '../../i18n';
import { useSearchParams } from 'react-router';
import { http } from '../../lib/api';
import { formatDate, formatTime, money, tzLabel } from '../../lib/format';
import { tripStore, useOnline } from '../../lib/store';
import { suggestedRate } from '../wallet/ExpenseSheet';

const BookingSheet = lazy(() => import('./BookingSheet'));
const DocumentImportSheet = lazy(() => import('../documents/DocumentImportSheet').then((m) => ({ default: m.DocumentImportSheet })));

export default function BookingsPage() {
  const { snap } = useTrip();
  if (!snap) {
    return (
      <div className="space-y-4 px-safe pt-safe">
        <Skeleton className="mt-6 h-10 w-1/2" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  return <Bookings snap={snap} />;
}

function Bookings({ snap }: { snap: TripSnapshot }) {
  const { canEdit } = useTrip();
  const online = useOnline();
  const [editing, setEditing] = useState<BookingDto | null>(null);
  // Deep link after a document import: /buchungen?id=<booking> opens it directly.
  const [params, setParams] = useSearchParams();
  const openId = params.get('id');
  useEffect(() => {
    if (!openId) return;
    const b = snap.bookings.find((x) => x.id === openId);
    if (b) {
      setEditing(b);
      setParams({}, { replace: true });
    }
  }, [openId, snap.bookings, setParams]);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toWallet, setToWallet] = useState<BookingDto | null>(null);
  const { trip, bookings, destinations } = snap;
  const today = todayIn(destinations[0]?.timezone ?? trip.homeTimezone);
  const totals = summarizeBookingCosts(bookings);
  const [f, setFState] = useState<Filters>(loadFilters);
  const setF = (v: Filters) => {
    setFState(v);
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(v));
    } catch {
      /* private mode */
    }
  };
  const persons = usePersonSelection(snap.travelers);
  const isPast = (b: BookingDto) => !!b.startDate && (b.endDate ?? b.startDate) < today;
  const forPerson = (b: BookingDto) => !persons.filtered || b.travelerIds.length === 0 || b.travelerIds.some((id) => persons.selected.includes(id));
  const inTime = (time: Filters['time']) => bookings.filter((b) => forPerson(b) && (time === 'all' || (time === 'past') === isPast(b)));
  const timeItems = inTime(f.time);
  const openCount = timeItems.filter(needsAttention).length;
  const kind = f.kind === 'open' && openCount === 0 ? 'all' : f.kind;
  const visible = timeItems.filter((b) => (kind === 'all' ? true : kind === 'open' ? needsAttention(b) : kindOf(b) === kind));
  const groups = groupByDay(visible, today);

  return (
    <div>
      <PageHeader
        title={t.bookings.title}
        eyebrow={trip.name}
        action={
          canEdit && (
            <>
              <IconButton label={t.documents.importTitle} disabled={!online} onClick={() => setImporting(true)}>
                <FileUp size={20} />
              </IconButton>
              <IconButton label={t.bookings.add} variant="primary" disabled={!online} onClick={() => setCreating(true)}>
                <Plus size={22} />
              </IconButton>
            </>
          )
        }
      />
      <div className="px-safe pt-5">
        {bookings.length === 0 ? (
          <EmptyState icon={<Ticket size={26} />} title={t.bookings.empty} text={t.bookings.emptyText} action={canEdit && <Button icon={<Plus size={18} />} disabled={!online} onClick={() => setCreating(true)}>{t.bookings.add}</Button>} />
        ) : (
          <>
            {totals.length > 0 && <CostSummary totals={totals} />}

            {/* -------------------------------------------------------- Filters */}
            <div className="mt-5 space-y-2.5">
              <Segmented
                value={f.time}
                onChange={(v) => setF({ ...f, time: v })}
                options={[
                  { value: 'upcoming', label: 'Bevorstehend' },
                  { value: 'past', label: 'Vergangen' },
                  { value: 'all', label: 'Ganze Reise' },
                ]}
              />
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Art filtern">
                <Chip active={f.kind === 'all'} onClick={() => setF({ ...f, kind: 'all' })}>
                  Alle ({timeItems.length})
                </Chip>
                {openCount > 0 && (
                  <Chip active={f.kind === 'open'} onClick={() => setF({ ...f, kind: 'open' })} icon={<CircleHelp size={14} className="text-warn" />}>
                    Offen ({openCount})
                  </Chip>
                )}
                {KINDS.filter((k) => timeItems.some((b) => kindOf(b) === k)).map((k) => (
                  <Chip key={k} active={f.kind === k} onClick={() => setF({ ...f, kind: k })} icon={<BookingIcon type={KIND_ICON[k]} size={14} />}>
                    {KIND_LABEL[k]} ({timeItems.filter((b) => kindOf(b) === k).length})
                  </Chip>
                ))}
              </div>
              <PersonFilter travelers={snap.travelers} selection={persons} bleed="-mx-4 px-4" />
            </div>

            {/* -------------------------------------------------------- List */}
            {groups.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[15px] text-text-2">Keine Buchungen für diese Auswahl.</p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  onClick={() => {
                    setF({ time: 'all', kind: 'all' });
                    persons.clear();
                  }}
                >
                  Filter zurücksetzen
                </Button>
              </div>
            ) : (
              groups.map((g) => (
                <section key={g.key}>
                  <SectionTitle>{g.label}</SectionTitle>
                  <Timeline items={g.items} snap={snap} onEdit={setEditing} onWallet={setToWallet} muted={g.past} />
                </section>
              ))
            )}
            <p className="mt-6 flex items-start gap-2 text-[12px] text-text-3">
              <Clock size={14} className="mt-0.5 shrink-0" /> {t.bookings.noRealtime}
            </p>
          </>
        )}
      </div>
      <Suspense fallback={null}>
        {creating && <BookingSheet open onClose={() => setCreating(false)} />}
        {importing && <DocumentImportSheet onClose={() => setImporting(false)} />}
        {editing && <BookingSheet key={editing.id} open booking={editing} onClose={() => setEditing(null)} />}
      </Suspense>
      {toWallet && <ToWalletSheet booking={toWallet} snap={snap} onClose={() => setToWallet(null)} />}
    </div>
  );
}

function Timeline({
  items,
  snap,
  onEdit,
  onWallet,
  muted,
}: {
  items: BookingDto[];
  snap: TripSnapshot;
  onEdit: (b: BookingDto) => void;
  onWallet: (b: BookingDto) => void;
  muted?: boolean;
}) {
  const { canEdit } = useTrip();
  const online = useOnline();
  const travelerName = (id: string | null) => snap.travelers.find((x) => x.id === id)?.name;
  return (
    <ol className="space-y-3">
      {items.map((b) => {
        const info = costInfo(b);
        return (
          <li key={b.id}>
            <article
              className={cx(
                'rounded-[1.5rem] border bg-surface p-4 shadow-card',
                b.bookingStatus === 'unconfirmed' || b.bookingStatus === 'planned' ? 'border-warn/40' : 'border-line',
                muted && 'opacity-70',
                b.bookingStatus === 'cancelled' && 'opacity-60',
              )}
            >
              <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => canEdit && onEdit(b)}>
                <span className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-2xl', b.bookingStatus === 'booked' ? 'bg-accent-soft text-accent' : 'bg-warn-soft text-warn')}>
                  <BookingIcon type={b.type} size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-text-3">
                    {t.bookingTypes[b.type]}
                    {b.provider ? ` · ${b.provider}` : ''}
                  </span>
                  <span className={cx('mt-0.5 block font-display text-[19px] font-semibold leading-snug', b.bookingStatus === 'cancelled' && 'line-through')}>{b.title}</span>
                  <span className="mt-1 block text-[13px] text-text-2">
                    {b.startDate ? formatDate(b.startDate) : t.bookings.undated}
                    {b.startTime ? ` · ${formatTime(b.startTime)}` : ''}
                    {b.startTime && b.startTimezone ? ` (${tzLabel(b.startTimezone)})` : ''}
                    {b.endDate && (b.endDate !== b.startDate || b.endTime) ? (
                      <>
                        {' '}
                        <ArrowRight size={12} className="inline" /> {b.endDate !== b.startDate ? formatDate(b.endDate) : ''}
                        {b.endTime ? ` ${formatTime(b.endTime)}` : ''}
                        {b.endTime && b.endTimezone ? ` (${tzLabel(b.endTimezone)})` : ''}
                      </>
                    ) : null}
                  </span>
                  {isTransport(b) && (b.fromLocation || b.toLocation) && (
                    <span className="mt-0.5 block text-[13px] text-text-3">
                      {b.fromLocation ?? '?'} → {b.toLocation ?? '?'}
                    </span>
                  )}
                  {b.type === 'flight' && b.flightNumber && <span className="mt-0.5 block text-[13px] text-text-3">{t.checkin.flightNumber}: {b.flightNumber}</span>}
                  {b.reference && <span className="mt-0.5 block text-[13px] text-text-3">{t.bookings.reference}: {b.reference}</span>}
                  {b.travelerIds.length > 0 && (
                    <span className="mt-0.5 block text-[13px] text-text-3">
                      {t.bookings.forWhom}: {b.travelerIds.map((id) => travelerName(id)).filter(Boolean).join(', ')}
                    </span>
                  )}
                </span>
              </button>
              <div className="mt-3">
                <BookingBadges booking={b} />
                {canEdit && <ExpenseMatchHint booking={b} snap={snap} />}
                {b.type === 'flight' && b.checkinDoneAt && (
                  <span className="mt-1.5 inline-block">
                    <Badge tone="success">{t.checkin.doneBadge}</Badge>
                  </span>
                )}
                {(snap.deposits ?? [])
                  .filter((d) => d.bookingId === b.id)
                  .map((d) => (
                    <span key={d.id} className="mt-1.5 inline-block">
                      <Badge tone={d.status === 'open' ? 'warn' : 'neutral'}>
                        {d.status === 'open' ? t.deposits.badgeOpen : t.deposits.badgeDone}: {money(d.amountMinor, d.currency)}
                      </Badge>
                    </span>
                  ))}
              </div>
              {b.priceMinor != null && b.currency && (
                <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 rounded-2xl bg-bg-elevated px-4 py-3">
                  <span className="text-[13px] text-text-3">
                    {t.costKind[b.costKind]}
                    {b.personsCount ? ` · ${t.common.persons(b.personsCount)}` : ''}
                    {b.paidByTravelerId && travelerName(b.paidByTravelerId) ? ` · ${travelerName(b.paidByTravelerId)}` : ''}
                  </span>
                  <span className={cx('font-display text-[20px] font-semibold tabular', b.costKind !== 'actual' && 'text-info')}>
                    {b.costKind === 'budget_cap' ? '≤ ' : b.costKind === 'estimate' ? '≈ ' : ''}
                    {money(b.priceMinor, b.currency)}
                  </span>
                  {info.perPersonMinor != null && (
                    <span className="w-full text-right text-[12px] text-text-3">
                      {(info.perPersonExact ? t.bookings.perPerson : t.bookings.perPersonApprox)(money(info.perPersonMinor, b.currency))}
                    </span>
                  )}
                  {b.personsCount == null && <span className="w-full text-[12px] text-warn">{t.bookings.noAutoSplit}</span>}
                </div>
              )}
              {(b.unitPriceMinor != null || b.clarificationNote) && (
                <div className="mt-3 flex gap-2 rounded-2xl bg-warn-soft px-4 py-3 text-[13px] text-warn">
                  <CircleHelp size={16} className="mt-0.5 shrink-0" />
                  <div>
                    {b.unitPriceMinor != null && b.currency && (
                      <p>
                        {b.unitPriceNote ?? t.bookings.unitPrice}: {money(b.unitPriceMinor, b.currency)}
                      </p>
                    )}
                    {b.clarificationNote && <p>{b.clarificationNote}</p>}
                  </div>
                </div>
              )}
              {b.notes && <p className="mt-3 text-[13px] leading-relaxed text-text-2">{b.notes}</p>}
              {b.expenseId ? (
                <div className="mt-3">
                  <Badge tone="success" icon={<Wallet size={12} />}>
                    {t.bookings.inWallet}
                  </Badge>
                </div>
              ) : (
                canEdit &&
                info.countsAsSpent && (
                  <Button size="sm" variant="soft" className="mt-3" icon={<Wallet size={16} />} disabled={!online} onClick={() => onWallet(b)}>
                    {t.bookings.toWallet}
                  </Button>
                )
              )}
            </article>
          </li>
        );
      })}
    </ol>
  );
}

function ToWalletSheet({ booking, snap, onClose }: { booking: BookingDto; snap: TripSnapshot; onClose: () => void }) {
  const { trip, travelers, exchangeRates } = snap;
  const { me } = useTrip();
  const [paidBy, setPaidBy] = useState(booking.paidByTravelerId ?? me?.id ?? travelers[0]?.id ?? '');
  const [participants, setParticipants] = useState<string[]>(
    booking.travelerIds.length
      ? booking.travelerIds
      : booking.personsCount && booking.personsCount <= travelers.length
        ? travelers.slice(0, booking.personsCount).map((x) => x.id)
        : travelers.map((x) => x.id),
  );
  const needsRate = booking.currency !== trip.baseCurrency;
  const stored = needsRate ? suggestedRate(exchangeRates, snap.expenses, booking.currency!, booking.startDate ?? '9999') : null;
  const [rate, setRate] = useState(stored?.rate.replace('.', ',') ?? '');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await tripStore.mutate(() =>
        http.post(`/trips/${trip.id}/bookings/${booking.id}/expense`, {
          paidByTravelerId: paidBy,
          participantIds: participants,
          ...(needsRate ? { fxRate: normalizeRate(rate) ?? '' } : {}),
        }),
      );
      toast(t.success.saved);
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={t.bookings.toWallet}
      footer={
        <>
          <Button variant="secondary" block onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button block loading={busy} disabled={!participants.length || (needsRate && !normalizeRate(rate))} onClick={() => void submit()}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[14px] text-text-2">{t.bookings.toWalletHint}</p>
        <p className="font-display text-[22px] font-semibold">
          {booking.title} · {money(booking.priceMinor!, booking.currency!)}
        </p>
        {booking.personsCount == null && <p className="rounded-2xl bg-warn-soft px-4 py-3 text-[13px] text-warn">{t.bookings.noAutoSplit}</p>}
        <Field label={t.wallet.paidBy}>
          <Select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            {travelers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.wallet.participants}>
          <div className="flex flex-wrap gap-2">
            {travelers.map((x) => {
              const on = participants.includes(x.id);
              return (
                <button
                  key={x.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setParticipants(on ? participants.filter((p) => p !== x.id) : travelers.filter((tr) => tr.id === x.id || participants.includes(tr.id)).map((tr) => tr.id))}
                  className={cx('h-10 rounded-full border px-3.5 text-[14px] font-semibold', on ? 'border-transparent bg-text text-bg' : 'border-line bg-surface text-text-2')}
                >
                  {x.name}
                </button>
              );
            })}
          </div>
        </Field>
        {needsRate && (
          <Field label={t.wallet.rateHelp(booking.currency!, trip.baseCurrency)}>
            <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
        )}
      </div>
    </Sheet>
  );
}

/** "Schon in der Reisekasse?" – links an existing expense instead of counting the cost twice. */
function ExpenseMatchHint({ booking, snap }: { booking: BookingDto; snap: TripSnapshot }) {
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const match = useMemo(() => expensesMatchingBooking(booking, snap.expenses)[0] ?? null, [booking, snap.expenses]);
  if (!match || hidden) return null;
  const e = match.item;
  const payer = snap.travelers.find((x) => x.id === e.paidByTravelerId)?.name;
  async function link() {
    setBusy(true);
    try {
      await tripStore.mutate(() => http.post(`/trips/${snap.trip.id}/expenses/${e.id}/link-booking`, { bookingId: booking.id }));
      toast('Verknüpft – der Betrag zählt jetzt nur einmal');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 rounded-2xl border border-warn/35 bg-warn-soft p-3">
      <p className="flex items-start gap-2 text-[14px] font-semibold leading-snug">
        <Link2 size={16} className="mt-0.5 shrink-0 text-warn" />
        Schon in der Reisekasse: „{e.title}“?
      </p>
      <p className="mt-0.5 pl-6 text-[13px] text-text-2">
        {money(e.amountMinor, e.currency)} · {formatDate(e.date)}
        {payer ? ` · bezahlt von ${payer}` : ''} – verknüpfen, damit nichts doppelt zählt.
      </p>
      <div className="mt-2 flex gap-2 pl-6">
        <Button size="sm" onClick={link} loading={busy} disabled={!online}>
          Verknüpfen
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setHidden(true)}>
          Nicht dasselbe
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filters, grouping and the compact cost summary
// ---------------------------------------------------------------------------

type Kind = 'flight' | 'transport' | 'hotel' | 'activity' | 'other';
interface Filters {
  time: 'upcoming' | 'past' | 'all';
  kind: 'all' | 'open' | Kind;
}
const FILTER_KEY = 'travio.bookingFilters';
const KINDS: Kind[] = ['flight', 'transport', 'hotel', 'activity', 'other'];
const KIND_LABEL: Record<Kind, string> = { flight: 'Flüge', transport: 'Fähren & Transfers', hotel: 'Unterkünfte', activity: 'Aktivitäten', other: 'Sonstiges' };
const KIND_ICON: Record<Kind, BookingDto['type']> = { flight: 'flight', transport: 'ferry', hotel: 'hotel', activity: 'activity', other: 'other' };

function loadFilters(): Filters {
  try {
    const v = JSON.parse(localStorage.getItem(FILTER_KEY) ?? 'null') as Filters | null;
    if (v && ['upcoming', 'past', 'all'].includes(v.time)) return v;
  } catch {
    /* ignore */
  }
  return { time: 'upcoming', kind: 'all' };
}

function kindOf(b: BookingDto): Kind {
  if (b.type === 'flight') return 'flight';
  if (b.type === 'ferry' || b.type === 'bus' || b.type === 'train' || b.type === 'car') return 'transport';
  if (b.type === 'hotel') return 'hotel';
  if (b.type === 'activity') return 'activity';
  return 'other';
}

/** Something still to do: not booked, not paid, estimate only or marked for clarification. */
function needsAttention(b: BookingDto): boolean {
  if (b.bookingStatus === 'cancelled') return false;
  return costInfo(b).needsClarification || b.bookingStatus !== 'booked' || b.paymentStatus === 'unpaid' || b.paymentStatus === 'partial' || b.costKind === 'estimate';
}

const WD = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];
function dayLabel(d: string, today: string): string {
  if (d === today) return 'Heute';
  if (d === addDaysToDate(today, 1)) return 'Morgen';
  if (d === addDaysToDate(today, -1)) return 'Gestern';
  return `${WD[new Date(`${d}T00:00:00Z`).getUTCDay()]} ${formatDate(d)}`;
}

/** Upcoming oldest first, past newest first; running stays on top as "Läuft gerade". */
function groupByDay(items: BookingDto[], today: string) {
  const sorted = [...items].sort((a, b) => bookingSortKey(a).localeCompare(bookingSortKey(b)));
  const map = new Map<string, { key: string; label: string; items: BookingDto[]; past: boolean; order: string }>();
  for (const b of sorted) {
    const end = b.endDate ?? b.startDate;
    let key: string;
    let label: string;
    let order: string;
    let past = false;
    if (!b.startDate) {
      key = 'undated';
      label = t.bookings.undated;
      order = '3';
    } else if (end! < today) {
      key = `p${b.startDate}`;
      label = dayLabel(b.startDate, today);
      past = true;
      // newest first
      order = `2${String(99999999 - Number(b.startDate.replaceAll('-', ''))).padStart(8, '0')}`;
    } else if (b.startDate < today) {
      key = 'running';
      label = 'Läuft gerade';
      order = '0';
    } else {
      key = `u${b.startDate}`;
      label = dayLabel(b.startDate, today);
      order = `1${b.startDate}`;
    }
    const g = map.get(key) ?? { key, label, items: [], past, order };
    g.items.push(b);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => a.order.localeCompare(b.order));
}

/** One line per currency; the full breakdown on tap. */
function CostSummary({ totals }: { totals: ReturnType<typeof summarizeBookingCosts> }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-4">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="text-[13px] font-semibold uppercase tracking-[0.14em] text-text-3">{t.bookings.summary}</span>
        <span className="text-[13px] font-semibold text-accent">{open ? 'Weniger' : 'Details'}</span>
      </button>
      <div className="mt-2 space-y-1.5">
        {totals.map((c) => {
          const allPaid = c.openMinor === 0 && c.estimatedMinor === 0;
          return (
            <div key={c.currency} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="font-display text-[22px] font-semibold tabular">{money(c.committedMinor, c.currency)}</span>
              <span className="flex flex-wrap gap-1.5">
                {allPaid ? (
                  <Badge tone="success">alles bezahlt</Badge>
                ) : (
                  <>
                    {c.openMinor > 0 && <Badge tone="warn">offen {money(c.openMinor, c.currency)}</Badge>}
                    {c.estimatedMinor > 0 && <Badge tone="info">geschätzt {money(c.estimatedMinor, c.currency)}</Badge>}
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {open && (
        <div className="mt-3 border-t border-line pt-3">
          {totals.map((c) => (
            <dl key={c.currency} className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[14px]">
              <div>
                <dt className="text-text-3">{t.bookings.committed}</dt>
                <dd className="font-semibold tabular">{money(c.committedMinor, c.currency)}</dd>
              </div>
              <div>
                <dt className="text-text-3">{t.bookings.paid}</dt>
                <dd className="font-semibold tabular text-success">{money(c.paidMinor, c.currency)}</dd>
              </div>
              <div>
                <dt className="text-text-3">{t.bookings.open}</dt>
                <dd className="font-semibold tabular text-warn">{money(c.openMinor, c.currency)}</dd>
              </div>
              <div>
                <dt className="text-text-3">{t.bookings.estimated}</dt>
                <dd className="font-semibold tabular text-info">{money(c.estimatedMinor, c.currency)}</dd>
              </div>
              {c.budgetCapMinor > 0 && (
                <div>
                  <dt className="text-text-3">{t.bookings.budgetCap}</dt>
                  <dd className="font-semibold tabular text-info">≤ {money(c.budgetCapMinor, c.currency)}</dd>
                </div>
              )}
            </dl>
          ))}
          <p className="mt-3 text-[12px] leading-snug text-text-3">{t.bookings.notSpentHint}</p>
        </div>
      )}
    </Card>
  );
}
