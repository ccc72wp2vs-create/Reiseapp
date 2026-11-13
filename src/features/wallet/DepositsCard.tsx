import { ChevronRight, Lock, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { DepositDto, TripSnapshot } from '../../../shared/types';
import { Badge, Card, SectionTitle } from '../../components/ui';
import { t } from '../../i18n';
import { formatDate, money } from '../../lib/format';
import { DepositSheet, ResolveDepositSheet } from './DepositSheet';

export function depositTone(d: DepositDto): 'warn' | 'success' | 'danger' | 'neutral' {
  return d.status === 'open' ? 'warn' : d.status === 'returned' ? 'success' : 'danger';
}

/** Deposits in the wallet overview – open ones first, never counted as costs. */
export function DepositsCard({ snap, canEdit, me }: { snap: TripSnapshot; canEdit: boolean; me?: string | null }) {
  const deposits = snap.deposits ?? [];
  const [editing, setEditing] = useState<DepositDto | null>(null);
  const [resolving, setResolving] = useState<DepositDto | null>(null);
  if (!deposits.length) return null;
  const name = (id: string) => snap.travelers.find((x) => x.id === id)?.name ?? '?';
  const open = deposits.filter((d) => d.status === 'open');
  const base = snap.trip.baseCurrency;
  const openBase = open.reduce((a, d) => a + d.baseAmountMinor, 0);

  return (
    <>
      <SectionTitle>{t.deposits.title}</SectionTitle>
      {open.length > 0 && <p className="-mt-1 mb-3 text-[13px] text-text-3">{t.deposits.openSum(money(openBase, base))}</p>}
      <Card className="divide-y divide-line">
        {deposits.map((d) => (
          <div key={d.id} className="flex items-center gap-3 p-4">
            <span className={d.status === 'open' ? 'grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-warn-soft text-warn' : 'grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-surface-2 text-text-3'}>
              {d.status === 'open' ? <Lock size={18} /> : <ShieldCheck size={18} />}
            </span>
            <button type="button" className="min-w-0 flex-1 text-left" disabled={!canEdit || d.status !== 'open'} onClick={() => setEditing(d)}>
              <p className="truncate font-semibold">{d.title}</p>
              <p className="text-[13px] text-text-3">
                {name(d.paidByTravelerId)} · {t.deposits.methods[d.method]}
                {d.returnDate && d.status === 'open' ? ` · ${t.deposits.returnOn(formatDate(d.returnDate))}` : ''}
              </p>
              <div className="mt-1.5">
                <Badge tone={depositTone(d)}>{t.deposits.status[d.status]}{d.status === 'partial' && d.keptMinor ? `: ${money(d.keptMinor, d.currency)}` : ''}</Badge>
              </div>
            </button>
            <div className="shrink-0 text-right">
              <p className="font-semibold tabular">{money(d.amountMinor, d.currency)}</p>
              {canEdit && (
                <button type="button" onClick={() => setResolving(d)} className="mt-1 inline-flex items-center gap-0.5 text-[13px] font-semibold text-accent">
                  {d.status === 'open' ? t.deposits.close : t.deposits.details} <ChevronRight size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </Card>
      <p className="mt-2 text-[12px] text-text-3">{t.deposits.hint}</p>
      {editing && <DepositSheet snap={snap} deposit={editing} me={me} onClose={() => setEditing(null)} />}
      {resolving && <ResolveDepositSheet snap={snap} deposit={resolving} onClose={() => setResolving(null)} />}
    </>
  );
}
