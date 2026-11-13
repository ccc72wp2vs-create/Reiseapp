import { FileSearch, FileUp, ShieldCheck, Wallet, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { matchDocument } from '../../../shared/documents';
import type { BookingDto, ExtractedDocument } from '../../../shared/types';
import { useTrip } from '../../components/AppShell';
import { BookingIcon } from '../../components/status';
import { toast } from '../../components/toast';
import { Badge, Button, Field, SelectField, Sheet, Toggle, cx } from '../../components/ui';
import { t } from '../../i18n';
import { errorMessage, http } from '../../lib/api';
import { analyzeDocument } from '../../lib/documents';
import { formatDate, formatTime, money } from '../../lib/format';
import { tripStore, useOnline } from '../../lib/store';

import { normalizeFlightNumber } from '../../../shared/checkin';
const BookingSheet = lazy(() => import('../bookings/BookingSheet'));

/** Fields of the booking that are still empty and can be filled from the document. */
function completionFor(b: BookingDto, ex: ExtractedDocument) {
  const patch: Record<string, unknown> = {};
  const labels: string[] = [];
  const fill = (key: keyof BookingDto, value: unknown, label: string) => {
    if ((b[key] == null || b[key] === '') && value != null && value !== '') {
      patch[key] = value;
      labels.push(label);
    }
  };
  fill('reference', ex.reference, t.bookings.reference);
  fill('provider', ex.provider, t.bookings.provider);
  fill('startTime', ex.startTime, t.documents.fieldStartTime);
  fill('endTime', ex.endTime, t.documents.fieldEndTime);
  fill('fromLocation', ex.fromLocation, t.bookings.from);
  fill('toLocation', ex.toLocation, t.bookings.to);
  fill('location', ex.location, t.bookings.location);
  if (b.type === 'flight') fill('flightNumber', normalizeFlightNumber(ex.flightNumber), t.checkin.flightNumber);
  if (b.priceMinor == null && ex.amountMinor != null && ex.currency) {
    patch.priceMinor = ex.amountMinor;
    patch.currency = ex.currency;
    labels.push(t.bookings.price);
  }
  if (ex.paymentStatus === 'paid' && b.paymentStatus !== 'paid') {
    patch.paymentStatus = 'paid';
    labels.push(t.bookings.paymentStatus);
  }
  if (ex.deadlines && !(b.notes ?? '').includes(ex.deadlines)) {
    patch.notes = [b.notes, ex.deadlines].filter(Boolean).join('\n');
    labels.push(t.documents.fieldDeadlines);
  }
  return { patch, labels };
}

/**
 * "Dokument importieren": choose → read automatically → check → save.
 * The document is only used for the analysis and never stored; afterwards
 * only the confirmed, structured data lives in bookings / the wallet.
 */
export function DocumentImportSheet({ onClose }: { onClose: () => void }) {
  const { snap, me } = useTrip();
  const online = useOnline();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<'pick' | 'reading' | 'review'>('pick');
  const [ex, setEx] = useState<ExtractedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [chosenId, setChosenId] = useState<string>('');
  const [toWallet, setToWallet] = useState(true);
  const [payer, setPayer] = useState('');
  const [forIds, setForIds] = useState<string[] | null>(null);
  const s = snap!;

  // Drop everything when the sheet closes (no document data kept in memory).
  useEffect(
    () => () => {
      abort.current?.abort();
      setEx(null);
    },
    [],
  );

  const match = useMemo(() => (ex ? matchDocument(ex, s.bookings, s.expenses) : null), [ex, s.bookings, s.expenses]);
  const booking = s.bookings.find((b) => b.id === (chosenId || match?.bookingId));
  const expense = s.expenses.find((e) => e.id === (booking?.expenseId ?? (chosenId ? null : match?.expenseId)));
  const completion = booking && ex ? completionFor(booking, ex) : { patch: {}, labels: [] as string[] };
  const paid = ex?.paymentStatus === 'paid' || booking?.paymentStatus === 'paid';
  const walletPossible =
    !!booking && !booking.expenseId && paid && booking.costKind === 'actual' && booking.bookingStatus !== 'cancelled' && (booking.priceMinor != null || ex?.amountMinor != null);
  const payerId = payer || booking?.paidByTravelerId || me?.id || s.travelers[0]?.id || '';
  const participants = forIds ?? (booking?.travelerIds.length ? booking.travelerIds : s.travelers.map((x) => x.id));

  async function onFile(f: File | undefined) {
    if (input.current) input.current.value = ''; // release the file reference
    if (!f) return;
    setError(null);
    setPhase('reading');
    abort.current = new AbortController();
    try {
      const result = await analyzeDocument(s.trip.id, f, abort.current.signal);
      setEx(result);
      setPhase('review');
      if (!result) setError(t.documents.notRead);
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setPhase('pick');
        return;
      }
      setError(errorMessage(e));
      setPhase('pick');
    } finally {
      abort.current = null;
    }
  }

  function done(bookingId: string, message: string) {
    toast(message);
    setEx(null);
    onClose();
    navigate(`/buchungen?id=${bookingId}`);
  }

  async function save() {
    if (!booking || !ex) return;
    setBusy(true);
    setError(null);
    const addToWallet = walletPossible && toWallet;
    try {
      await tripStore.mutate(async () => {
        const patch = { ...completion.patch };
        if (addToWallet && !booking.paidByTravelerId) patch.paidByTravelerId = payerId;
        if (addToWallet && booking.paymentStatus !== 'paid') patch.paymentStatus = 'paid';
        if (Object.keys(patch).length) await http.patch(`/trips/${s.trip.id}/bookings/${booking.id}`, { ...patch, version: booking.version });
        // Existing booking → expense step (refuses duplicates on the server).
        if (addToWallet) await http.post(`/trips/${s.trip.id}/bookings/${booking.id}/expense`, { paidByTravelerId: payerId, participantIds: participants });
      });
      done(booking.id, addToWallet ? t.documents.addedToWallet : t.documents.bookingUpdated);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const chip = (on: boolean) =>
    cx('inline-flex h-9 items-center rounded-full border px-3 text-[13px] font-semibold', on ? 'border-transparent bg-text text-bg' : 'border-line bg-surface text-text-2');
  const nothingToDo = !!booking && !completion.labels.length && !walletPossible;
  const title = ex?.kind === 'flight' && ex.flightNumber ? `${ex.title ?? t.documents.flight} ${ex.title?.includes(ex.flightNumber) ? '' : ex.flightNumber}`.trim() : ex?.title;

  return (
    <>
      <Sheet open onClose={onClose} size="lg" title={t.documents.importTitle}>
        <input ref={input} type="file" accept="application/pdf,image/*" className="sr-only" tabIndex={-1} onChange={(e) => void onFile(e.target.files?.[0])} />
        <p className="mb-4 flex items-start gap-2 rounded-2xl bg-info-soft px-4 py-3 text-[13px] text-info">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" /> {t.documents.notStored}
        </p>

        {phase !== 'review' && (
          <div className="space-y-4 text-center">
            <p className="text-[15px] text-text-2">{t.documents.importIntro}</p>
            {phase === 'pick' ? (
              <Button block icon={<FileUp size={18} />} disabled={!online} onClick={() => input.current?.click()}>
                {t.documents.choose}
              </Button>
            ) : (
              <div className="space-y-3">
                <Button block loading>
                  {t.documents.reading}
                </Button>
                <Button variant="ghost" size="sm" icon={<X size={16} />} onClick={() => abort.current?.abort()}>
                  {t.common.cancel}
                </Button>
              </div>
            )}
          </div>
        )}

        {phase === 'review' && (
          <div className="space-y-4">
            {ex && (
              <div className="rounded-[1.25rem] border border-line bg-surface p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
                    {ex.kind ? <BookingIcon type={ex.kind} /> : <FileSearch size={18} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{title ?? t.documents.unnamed}</p>
                    <p className="text-[13px] text-text-3">
                      {[ex.startDate && `${formatDate(ex.startDate)}${ex.startTime ? `, ${formatTime(ex.startTime)}` : ''}`, ex.endDate && ex.endDate !== ex.startDate && `${formatDate(ex.endDate)}${ex.endTime ? `, ${formatTime(ex.endTime)}` : ''}`]
                        .filter(Boolean)
                        .join(' – ')}
                    </p>
                    {(ex.fromLocation || ex.toLocation) && <p className="text-[13px] text-text-3">{[ex.fromLocation, ex.toLocation].filter(Boolean).join(' → ')}</p>}
                    {ex.location && <p className="text-[13px] text-text-3">{ex.location}</p>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {ex.amountMinor != null && ex.currency && <Badge tone="neutral">{money(ex.amountMinor, ex.currency)}</Badge>}
                      <Badge tone={ex.paymentStatus === 'paid' ? 'success' : ex.paymentStatus === 'unknown' ? 'neutral' : 'warn'}>{t.paymentStatus[ex.paymentStatus]}</Badge>
                      {ex.reference && <Badge tone="neutral">Nr. {ex.reference}</Badge>}
                    </div>
                    {ex.deadlines && <p className="mt-2 text-[13px] text-text-2">{ex.deadlines}</p>}
                  </div>
                </div>
              </div>
            )}

            {ex && booking && (
              <div className="rounded-[1.25rem] border border-accent/40 bg-accent-soft p-4">
                <p className="text-[13px] font-semibold text-accent">{t.documents.belongsTo}</p>
                <p className="mt-1 font-semibold">{booking.title}</p>
                <p className="text-[13px] text-text-2">
                  {completion.labels.length ? t.documents.willAdd(completion.labels.join(', ')) : t.documents.nothingNew}
                  {expense ? ` ${t.documents.inWallet(money(expense.amountMinor, expense.currency))}` : ''}
                </p>
              </div>
            )}
            {ex && !booking && match?.expenseId && expense && (
              <p className="rounded-[1.25rem] bg-surface-2 p-4 text-[14px] text-text-2">{t.documents.expenseOnly(expense.title, money(expense.amountMinor, expense.currency))}</p>
            )}

            {walletPossible && (
              <div className="space-y-3 rounded-[1.25rem] border border-line bg-surface p-4">
                <Toggle checked={toWallet} onChange={setToWallet} label={t.documents.addToWallet} description={t.documents.walletHint} />
                {toWallet && (
                  <>
                    <Field label={t.documents.whoPaid}>
                      <div className="flex flex-wrap gap-2">
                        {s.travelers.map((x) => (
                          <button key={x.id} type="button" aria-pressed={payerId === x.id} onClick={() => setPayer(x.id)} className={chip(payerId === x.id)}>
                            {x.name}
                          </button>
                        ))}
                      </div>
                    </Field>
                    <Field label={t.documents.forWhom}>
                      <div className="flex flex-wrap gap-2">
                        {s.travelers.map((x) => {
                          const on = participants.includes(x.id);
                          return (
                            <button
                              key={x.id}
                              type="button"
                              aria-pressed={on}
                              onClick={() => setForIds(on ? participants.filter((p) => p !== x.id) : s.travelers.filter((y) => y.id === x.id || participants.includes(y.id)).map((y) => y.id))}
                              className={chip(on)}
                            >
                              {x.name}
                            </button>
                          );
                        })}
                      </div>
                    </Field>
                  </>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {booking && !nothingToDo && (
                <Button icon={walletPossible && toWallet ? <Wallet size={16} /> : undefined} loading={busy} disabled={!online || (walletPossible && toWallet && !participants.length)} onClick={() => void save()}>
                  {t.documents.save}
                </Button>
              )}
              {booking && nothingToDo && (
                <Button onClick={() => done(booking.id, t.documents.alreadyComplete)}>{t.documents.toBooking}</Button>
              )}
              {!booking && (
                <Button disabled={!online} onClick={() => setCreating(true)}>
                  {t.documents.createBooking}
                </Button>
              )}
              <Button variant="ghost" onClick={() => { setEx(null); setPhase('pick'); setChosenId(''); }}>
                {t.documents.another}
              </Button>
            </div>

            {/* Correct the match if needed */}
            <SelectField label={t.documents.otherBooking} value={chosenId} onChange={(e) => setChosenId(e.target.value)}>
              <option value="">{match?.bookingId ? t.documents.suggested : '–'}</option>
              {s.bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </SelectField>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] text-danger">
            {error}
          </p>
        )}
      </Sheet>
      <Suspense fallback={null}>
        {creating && (
          <BookingSheet
            open
            prefill={{
              title: title ?? null,
              type: ex?.kind,
              provider: ex?.provider,
              reference: ex?.reference,
              startDate: ex?.startDate,
              endDate: ex?.endDate,
              startTime: ex?.startTime,
              endTime: ex?.endTime,
              fromLocation: ex?.fromLocation,
              toLocation: ex?.toLocation,
              location: ex?.location,
              flightNumber: normalizeFlightNumber(ex?.flightNumber),
              priceMinor: ex?.amountMinor,
              currency: ex?.currency,
              paymentStatus: ex?.paymentStatus,
              personsCount: ex?.personsCount,
              notes: ex?.deadlines,
            }}
            onSaved={(b) => done(b.id, t.documents.bookingCreated)}
            onClose={() => setCreating(false)}
          />
        )}
      </Suspense>
    </>
  );
}
