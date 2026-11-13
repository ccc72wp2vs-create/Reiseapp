import { CheckCircle2, FileSearch, FileUp, Link2, Wallet } from 'lucide-react';
import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { matchDocument } from '../../../shared/documents';
import type { BookingDto, DocumentDto } from '../../../shared/types';
import { useTrip } from '../../components/AppShell';
import { BookingIcon } from '../../components/status';
import { toast } from '../../components/toast';
import { Badge, Button, Field, SelectField, Sheet, cx } from '../../components/ui';
import { t } from '../../i18n';
import { errorMessage, http } from '../../lib/api';
import { documentUrl, uploadDocument } from '../../lib/documents';
import { formatDate, money } from '../../lib/format';
import { tripStore, useOnline } from '../../lib/store';

const BookingSheet = lazy(() => import('../bookings/BookingSheet'));

/**
 * "Beleg importieren": upload → recognise → match against bookings and the
 * wallet → one tap to attach, complete the booking or add the payment to the
 * wallet (through the existing booking → expense step). Nothing is booked
 * automatically and nothing is created twice.
 */
export function DocumentImportSheet({ onClose, document: initial }: { onClose: () => void; document?: DocumentDto | null }) {
  const { snap, me } = useTrip();
  const online = useOnline();
  const input = useRef<HTMLInputElement>(null);
  const [doc, setDoc] = useState<DocumentDto | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [manual, setManual] = useState('');
  const s = snap!;
  const live = doc ? ((s.documents ?? []).find((d) => d.id === doc.id) ?? doc) : null;
  const ex = live?.extracted ?? null;
  const match = useMemo(() => (ex ? matchDocument(ex, s.bookings, s.expenses) : null), [ex, s.bookings, s.expenses]);
  const booking = live?.bookingId ? s.bookings.find((b) => b.id === live.bookingId) : match?.bookingId ? s.bookings.find((b) => b.id === match.bookingId) : undefined;
  const expenseId = live?.expenseId ?? match?.expenseId ?? booking?.expenseId ?? null;
  const expense = expenseId ? s.expenses.find((e) => e.id === expenseId) : undefined;
  const linked = !!live && ((!!booking && live.bookingId === booking.id) || (!!expense && live.expenseId === expense.id));
  const paid = ex?.paymentStatus === 'paid' || booking?.paymentStatus === 'paid';
  const canAddToWallet = !!booking && !expense && paid && booking.costKind === 'actual' && booking.bookingStatus !== 'cancelled' && (booking.priceMinor != null || ex?.amountMinor != null);
  const [payer, setPayer] = useState<string>('');
  const [forIds, setForIds] = useState<string[] | null>(null);
  const payerId = payer || booking?.paidByTravelerId || me?.id || s.travelers[0]?.id || '';
  const participants = forIds ?? (booking?.travelerIds.length ? booking.travelerIds : s.travelers.map((x) => x.id));

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      const d = await tripStore.mutate(() => uploadDocument(s.trip.id, f));
      setDoc(d);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  /** Fills gaps in the booking from the receipt – never overwrites existing values. */
  function completion(b: BookingDto, markPaid: boolean) {
    const patch: Record<string, unknown> = {};
    if (!b.reference && ex?.reference) patch.reference = ex.reference;
    if (!b.provider && ex?.provider) patch.provider = ex.provider;
    if (b.priceMinor == null && ex?.amountMinor != null && ex.currency) {
      patch.priceMinor = ex.amountMinor;
      patch.currency = ex.currency;
    }
    if (markPaid && b.paymentStatus !== 'paid') patch.paymentStatus = 'paid';
    if (markPaid && !b.paidByTravelerId && payerId) patch.paidByTravelerId = payerId;
    return patch;
  }

  async function attach(opts: { toWallet: boolean }) {
    if (!live) return;
    setBusy(true);
    setError(null);
    try {
      await tripStore.mutate(async () => {
        let expId = expense?.id ?? null;
        if (booking) {
          const patch = completion(booking, opts.toWallet || ex?.paymentStatus === 'paid');
          if (Object.keys(patch).length) await http.patch(`/trips/${s.trip.id}/bookings/${booking.id}`, { ...patch, version: booking.version });
          if (opts.toWallet) {
            const r = await http.post<{ expense: { id: string } }>(`/trips/${s.trip.id}/bookings/${booking.id}/expense`, { paidByTravelerId: payerId, participantIds: participants });
            expId = r.expense.id;
          }
        }
        await http.patch(`/trips/${s.trip.id}/documents/${live.id}`, { bookingId: booking?.id ?? null, expenseId: expId });
      });
      toast(opts.toWallet ? t.documents.addedToWallet : t.documents.attached);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function attachManual() {
    if (!live || !manual) return;
    const [kind, id] = manual.split(':');
    setBusy(true);
    try {
      const b = kind === 'b' ? s.bookings.find((x) => x.id === id) : undefined;
      const e = kind === 'e' ? s.expenses.find((x) => x.id === id) : b?.expenseId ? s.expenses.find((x) => x.id === b.expenseId) : undefined;
      await tripStore.mutate(() => http.patch(`/trips/${s.trip.id}/documents/${live.id}`, { bookingId: b?.id ?? e?.bookingId ?? null, expenseId: e?.id ?? null }));
      toast(t.documents.attached);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const name = (id: string) => s.travelers.find((x) => x.id === id)?.name ?? '?';
  const chip = (on: boolean) =>
    cx('inline-flex h-9 items-center rounded-full border px-3 text-[13px] font-semibold', on ? 'border-transparent bg-text text-bg' : 'border-line bg-surface text-text-2');

  return (
    <>
      <Sheet open onClose={onClose} size="lg" title={t.documents.importTitle}>
        <input ref={input} type="file" accept="application/pdf,image/*" className="sr-only" tabIndex={-1} onChange={(e) => void onFile(e.target.files?.[0])} />
        {!live && (
          <div className="space-y-4 text-center">
            <p className="text-[15px] text-text-2">{t.documents.importIntro}</p>
            <Button block icon={<FileUp size={18} />} loading={busy} disabled={!online} onClick={() => input.current?.click()}>
              {busy ? t.documents.reading : t.documents.choose}
            </Button>
            <p className="text-[12px] text-text-3">{t.documents.privacy}</p>
          </div>
        )}

        {live && (
          <div className="space-y-4">
            {/* What was recognised */}
            <div className="rounded-[1.25rem] border border-line bg-surface p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
                  {ex?.kind ? <BookingIcon type={ex.kind} /> : <FileSearch size={18} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{ex?.title ?? live.filename}</p>
                  <p className="text-[13px] text-text-3">
                    {[ex?.startDate && formatDate(ex.startDate), ex?.endDate && ex.endDate !== ex.startDate && formatDate(ex.endDate)].filter(Boolean).join(' – ')}
                    {ex?.reference ? ` · Nr. ${ex.reference}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ex?.amountMinor != null && ex.currency && <Badge tone="neutral">{money(ex.amountMinor, ex.currency)}</Badge>}
                    {ex && <Badge tone={ex.paymentStatus === 'paid' ? 'success' : ex.paymentStatus === 'unknown' ? 'neutral' : 'warn'}>{t.paymentStatus[ex.paymentStatus]}</Badge>}
                  </div>
                </div>
                <a href={documentUrl(s.trip.id, live.id)} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[13px] font-semibold text-accent">
                  {t.documents.open}
                </a>
              </div>
              {!ex && <p className="mt-3 text-[13px] text-text-3">{live.status === 'failed' ? t.documents.notRead : t.documents.notReadLocal}</p>}
            </div>

            {/* What it belongs to */}
            {booking || expense ? (
              <div className="rounded-[1.25rem] border border-accent/40 bg-accent-soft p-4">
                <p className="text-[13px] font-semibold text-accent">{linked ? t.documents.linkedTo : t.documents.belongsTo}</p>
                <p className="mt-1 font-semibold">{booking?.title ?? expense?.title}</p>
                <p className="text-[13px] text-text-2">
                  {expense ? t.documents.inWallet(money(expense.amountMinor, expense.currency)) : paid ? t.documents.notInWallet : t.documents.notPaid}
                </p>
              </div>
            ) : (
              ex && <p className="rounded-[1.25rem] bg-surface-2 p-4 text-[14px] text-text-2">{t.documents.noMatch}</p>
            )}

            {/* Only what is still missing: who paid, for whom */}
            {canAddToWallet && (
              <div className="space-y-3">
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
                <Button block icon={<Wallet size={18} />} loading={busy} disabled={!online || !participants.length} onClick={() => void attach({ toWallet: true })}>
                  {t.documents.addToWallet}
                </Button>
                <p className="text-[12px] text-text-3">{t.documents.splitHint(name(payerId), participants.length)}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {(booking || expense) && !linked && (
                <Button variant={canAddToWallet ? 'secondary' : 'primary'} icon={<Link2 size={16} />} loading={busy && !canAddToWallet} disabled={!online} onClick={() => void attach({ toWallet: false })}>
                  {t.documents.attachOnly}
                </Button>
              )}
              {!booking && !expense && (
                <Button icon={<CheckCircle2 size={16} />} disabled={!online} onClick={() => setCreating(true)}>
                  {t.documents.createBooking}
                </Button>
              )}
            </div>

            {/* Manual assignment – always possible, also later */}
            <div className="grid grid-cols-[1fr_auto] items-end gap-2 border-t border-line pt-4">
              <SelectField label={t.documents.assignOther} value={manual} onChange={(e) => setManual(e.target.value)}>
                <option value="">–</option>
                <optgroup label={t.bookings.title}>
                  {s.bookings.map((b) => (
                    <option key={b.id} value={`b:${b.id}`}>
                      {b.title}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={t.wallet.title}>
                  {s.expenses.map((e) => (
                    <option key={e.id} value={`e:${e.id}`}>
                      {e.title} · {money(e.amountMinor, e.currency)}
                    </option>
                  ))}
                </optgroup>
              </SelectField>
              <Button variant="secondary" disabled={!manual || !online} onClick={() => void attachManual()}>
                {t.documents.assign}
              </Button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] text-danger">
            {error}
          </p>
        )}
      </Sheet>
      <Suspense fallback={null}>
        {creating && live && (
          <BookingSheet
            open
            prefill={{
              title: ex?.title,
              type: ex?.kind,
              provider: ex?.provider,
              reference: ex?.reference,
              startDate: ex?.startDate,
              endDate: ex?.endDate,
              priceMinor: ex?.amountMinor,
              currency: ex?.currency,
              paymentStatus: ex?.paymentStatus,
              personsCount: ex?.personsCount,
            }}
            onSaved={(b) => void http.patch(`/trips/${s.trip.id}/documents/${live.id}`, { bookingId: b.id })}
            onClose={() => setCreating(false)}
          />
        )}
      </Suspense>
    </>
  );
}

