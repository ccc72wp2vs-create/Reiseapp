import { ArrowRight, CircleHelp, Clock, Plus, Ticket, Wallet } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { costInfo, summarizeBookingCosts } from '../../../shared/costs';
import { normalizeRate } from '../../../shared/money';
import { bookingSortKey, isTransport, todayIn } from '../../../shared/trip';
import type { BookingDto, TripSnapshot } from '../../../shared/types';
import { PageHeader, useTrip } from '../../components/AppShell';
import { BookingBadges, BookingIcon } from '../../components/status';
import { toast } from '../../components/toast';
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, SectionTitle, Select, Sheet, Skeleton, cx } from '../../components/ui';
import { t } from '../../i18n';
import { http } from '../../lib/api';
import { formatDate, formatTime, money, tzLabel } from '../../lib/format';
import { tripStore, useOnline } from '../../lib/store';
import { suggestedRate } from '../wallet/ExpenseSheet';

const BookingSheet = lazy(() => import('./BookingSheet'));

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
  const [creating, setCreating] = useState(false);
  const [toWallet, setToWallet] = useState<BookingDto | null>(null);
  const { trip, bookings, destinations } = snap;
  const today = todayIn(destinations[0]?.timezone ?? trip.homeTimezone);
  const sorted = [...bookings].sort((a, b) => bookingSortKey(a).localeCompare(bookingSortKey(b)));
  const upcoming = sorted.filter((b) => b.startDate && (b.endDate ?? b.startDate) >= today);
  const past = sorted.filter((b) => b.startDate && (b.endDate ?? b.startDate) < today);
  const undated = sorted.filter((b) => !b.startDate);
  const totals = summarizeBookingCosts(bookings);

  return (
    <div>
      <PageHeader
        title={t.bookings.title}
        eyebrow={trip.name}
        action={
          canEdit && (
            <IconButton label={t.bookings.add} variant="primary" disabled={!online} onClick={() => setCreating(true)}>
              <Plus size={22} />
            </IconButton>
          )
        }
      />
      <div className="px-safe pt-5">
        {bookings.length === 0 ? (
          <EmptyState icon={<Ticket size={26} />} title={t.bookings.empty} text={t.bookings.emptyText} action={canEdit && <Button icon={<Plus size={18} />} disabled={!online} onClick={() => setCreating(true)}>{t.bookings.add}</Button>} />
        ) : (
          <>
            {totals.length > 0 && (
              <Card className="p-5">
                <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-text-3">{t.bookings.summary}</h2>
                {totals.map((c) => (
                  <dl key={c.currency} className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-[14px]">
                    <div>
                      <dt className="text-text-3">{t.bookings.committed}</dt>
                      <dd className="font-display text-[22px] font-semibold tabular">{money(c.committedMinor, c.currency)}</dd>
                    </div>
                    <div>
                      <dt className="text-text-3">{t.bookings.paid}</dt>
                      <dd className="font-display text-[22px] font-semibold tabular text-success">{money(c.paidMinor, c.currency)}</dd>
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
                <p className="mt-4 text-[12px] leading-snug text-text-3">{t.bookings.notSpentHint}</p>
              </Card>
            )}
            <p className="mt-4 flex items-start gap-2 text-[12px] text-text-3">
              <Clock size={14} className="mt-0.5 shrink-0" /> {t.bookings.noRealtime}
            </p>
            {upcoming.length > 0 && (
              <>
                <SectionTitle>{t.bookings.upcoming}</SectionTitle>
                <Timeline items={upcoming} snap={snap} onEdit={setEditing} onWallet={setToWallet} />
              </>
            )}
            {undated.length > 0 && (
              <>
                <SectionTitle>{t.bookings.undated}</SectionTitle>
                <Timeline items={undated} snap={snap} onEdit={setEditing} onWallet={setToWallet} />
              </>
            )}
            {past.length > 0 && (
              <>
                <SectionTitle>{t.bookings.past}</SectionTitle>
                <Timeline items={past} snap={snap} onEdit={setEditing} onWallet={setToWallet} muted />
              </>
            )}
          </>
        )}
      </div>
      <Suspense fallback={null}>
        {creating && <BookingSheet open onClose={() => setCreating(false)} />}
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
