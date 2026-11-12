import { Check, Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { minorToDecimalString } from '../../../shared/money';
import { todayIn } from '../../../shared/trip';
import type { TripSnapshot } from '../../../shared/types';
import { toast } from '../../components/toast';
import { Button, Sheet } from '../../components/ui';
import { t } from '../../i18n';
import { errorMessage, http } from '../../lib/api';
import { money } from '../../lib/format';
import { tripStore, useOnline } from '../../lib/store';

export interface PayRequest {
  fromTravelerId: string;
  toTravelerId: string;
  amountMinor: number;
  /** What the money is for (expense titles). */
  purpose: string[];
}

/** PayPal.me link with the amount prefilled (amount in the trip base currency). */
export function paypalUrl(user: string, amountMinor: number, currency: string): string {
  return `https://paypal.me/${encodeURIComponent(user)}/${minorToDecimalString(amountMinor, currency)}${currency}`;
}

/** Groups an IBAN in blocks of four for reading. */
export function formatIban(iban: string): string {
  return iban.replace(/(.{4})/g, '$1 ').trim();
}

/** "Jetzt überweisen": PayPal link or IBAN to copy, then record the repayment with one tap. */
export default function PaySheet({ snap, req, canRecord, onClose }: { snap: TripSnapshot; req: PayRequest; canRecord: boolean; onClose: () => void }) {
  const online = useOnline();
  const base = snap.trip.baseCurrency;
  const from = snap.travelers.find((x) => x.id === req.fromTravelerId);
  const to = snap.travelers.find((x) => x.id === req.toTravelerId);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const purpose = `TRAVIO ${snap.trip.name}${req.purpose.length ? `: ${req.purpose.join(', ')}` : ''}`.slice(0, 140);

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      toast(t.wallet.copyFailed, 'error');
    }
  }

  async function record() {
    setBusy(true);
    try {
      await tripStore.mutate(() =>
        http.post(`/trips/${snap.trip.id}/settlements`, {
          fromTravelerId: req.fromTravelerId,
          toTravelerId: req.toTravelerId,
          amountMinor: req.amountMinor,
          currency: base,
          date: todayIn(snap.destinations[0]?.timezone ?? snap.trip.homeTimezone),
          notes: purpose,
        }),
      );
      toast(t.wallet.recorded);
      onClose();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  const copyBtn = (key: string, label: string, text: string) => (
    <Button size="sm" variant="secondary" icon={copied === key ? <Check size={16} /> : <Copy size={16} />} onClick={() => void copy(key, text)}>
      {copied === key ? t.wallet.copied : label}
    </Button>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title={t.wallet.payNowTitle(to?.name ?? '?')}
      footer={
        canRecord ? (
          <Button block loading={busy} disabled={!online} icon={<Check size={18} />} onClick={() => void record()}>
            {t.wallet.paidRecord}
          </Button>
        ) : undefined
      }
    >
      <div className="rounded-[1.25rem] bg-surface p-4">
        <p className="text-[13px] text-text-3">{t.wallet.pairOwes(from?.name ?? '?', to?.name ?? '?')}</p>
        <p className="font-display text-[30px] font-semibold tabular">{money(req.amountMinor, base)}</p>
        <div className="mt-2">{copyBtn('amount', t.wallet.copyAmount, minorToDecimalString(req.amountMinor, base).replace('.', ','))}</div>
      </div>

      {to?.paypalMe && (
        <a
          href={paypalUrl(to.paypalMe, req.amountMinor, base)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex h-14 items-center justify-center gap-2 rounded-full bg-[#0070ba] px-5 text-[16px] font-semibold text-white"
        >
          <ExternalLink size={18} /> {t.wallet.payWithPaypal(money(req.amountMinor, base))}
        </a>
      )}

      {to?.iban && (
        <div className="mt-4 rounded-[1.25rem] border border-line bg-surface p-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-text-3">{t.wallet.bankTransfer}</p>
          <p className="mt-2 text-[14px] text-text-2">{t.wallet.recipient}</p>
          <p className="font-semibold">{to.name}</p>
          <p className="mt-2 text-[14px] text-text-2">IBAN</p>
          <p className="break-all font-mono text-[15px] font-semibold">{formatIban(to.iban)}</p>
          <p className="mt-2 text-[14px] text-text-2">{t.wallet.reference}</p>
          <p className="text-[14px]">{purpose}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {copyBtn('iban', t.wallet.copyIban, to.iban)}
            {copyBtn('purpose', t.wallet.copyReference, purpose)}
          </div>
        </div>
      )}

      {!to?.paypalMe && !to?.iban && <p className="mt-4 rounded-2xl bg-info-soft px-4 py-3 text-[14px] text-info">{t.wallet.noPaymentDetails(to?.name ?? '?')}</p>}

      <p className="mt-4 text-[12px] text-text-3">{canRecord ? t.wallet.payHint : t.wallet.payHintViewer}</p>
    </Sheet>
  );
}
