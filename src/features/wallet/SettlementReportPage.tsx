/**
 * Endabrechnung: per couple (or person) what was paid and used, costs by
 * category and stop, and the last transfers – to share as text or print/PDF.
 */
import { ArrowRight, Printer, Send, Share2 } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { hasCouples } from '../../../shared/couples';
import { buildReport } from '../../../shared/report';
import type { TripSnapshot } from '../../../shared/types';
import { PageHeader, useTrip } from '../../components/AppShell';
import { toast } from '../../components/toast';
import { Button, Card, SectionTitle, Segmented, Skeleton, cx } from '../../components/ui';
import { t } from '../../i18n';
import { money } from '../../lib/format';
import type { PayRequest } from './PaySheet';

const PaySheet = lazy(() => import('./PaySheet'));

export default function SettlementReportPage() {
  const { snap } = useTrip();
  if (!snap) return <Skeleton className="m-4 h-64" />;
  return <Report snap={snap} />;
}

function Report({ snap }: { snap: TripSnapshot }) {
  const { canEdit } = useTrip();
  const couples = hasCouples(snap.travelers);
  const [mode, setMode] = useState<'couples' | 'persons'>(couples ? 'couples' : 'persons');
  const report = useMemo(() => buildReport(snap, mode), [snap, mode]);
  const [paying, setPaying] = useState<PayRequest | null>(null);
  const base = report.baseCurrency;
  const name = (id: string) => snap.travelers.find((x) => x.id === id)?.name ?? '?';
  const label = (ids: string[]) => ids.map(name).join(' & ');
  const groupLabel = (key: string) => label(report.groups.find((g) => g.key === key)?.memberIds ?? [key]);
  const signed = (v: number) => `${v > 0 ? '+' : ''}${money(v, base)}`;

  function asText() {
    const lines = [
      `${snap.trip.name} – ${t.report.title}`,
      `${t.report.total}: ${money(report.totalMinor, base)} (${t.report.expenses(report.expenseCount)})`,
      '',
      ...report.groups.flatMap((g) => [
        `${label(g.memberIds)}: ${t.report.paid} ${money(g.paidMinor, base)} · ${t.report.used} ${money(g.consumedMinor, base)} · ${t.report.balance} ${signed(g.balanceMinor)}`,
      ]),
      '',
      t.report.transfers + ':',
      ...(report.transfers.length
        ? report.transfers.map(
            (x) => `• ${groupLabel(x.fromKey)} → ${groupLabel(x.toKey)}: ${money(x.amountMinor, base)} (${name(x.fromTravelerId)} an ${name(x.toTravelerId)})`,
          )
        : [`• ${t.wallet.allSettled}`]),
      '',
      t.report.byCategory + ':',
      ...report.byCategory.map((c) => `• ${t.expenseCategories[c.category]}: ${money(c.minor, base)}`),
      '',
      t.report.byStop + ':',
      ...report.byStop.map((s) => `• ${s.name || t.report.noStop}: ${money(s.minor, base)}`),
    ];
    return lines.join('\n');
  }

  async function share() {
    const text = asText();
    try {
      if (navigator.share) await navigator.share({ title: `${snap.trip.name} – ${t.report.title}`, text });
      else {
        await navigator.clipboard.writeText(text);
        toast(t.report.copied);
      }
    } catch {
      /* cancelled */
    }
  }

  return (
    <div className="report-print">
      <PageHeader title={t.report.title} eyebrow={snap.trip.name}>
        <div className="mt-3 flex gap-2 print:hidden">
          <Button size="sm" variant="secondary" icon={<Printer size={16} />} onClick={() => window.print()}>
            {t.report.pdf}
          </Button>
          <Button size="sm" icon={<Share2 size={16} />} onClick={share}>
            {t.report.share}
          </Button>
        </div>
      </PageHeader>
      <div className="px-safe pb-nav">
        {couples && (
          <div className="mt-4 print:hidden">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'couples', label: t.wallet.viewCouples },
                { value: 'persons', label: t.wallet.viewPersons },
              ]}
            />
          </div>
        )}

        <Card className="mt-4 p-5">
          <p className="text-[13px] text-text-3">{t.report.total}</p>
          <p className="mt-1 font-display text-[40px] font-semibold leading-none tabular">{money(report.totalMinor, base)}</p>
          <p className="mt-2 text-[13px] text-text-3">{t.report.expenses(report.expenseCount)}</p>
        </Card>

        <SectionTitle>{t.report.transfers}</SectionTitle>
        {report.transfers.length === 0 ? (
          <Card className="p-5 text-center font-semibold text-success">{t.wallet.allSettled}</Card>
        ) : (
          <ul className="space-y-2.5">
            {report.transfers.map((x) => (
              <li key={`${x.fromKey}>${x.toKey}`} className="rounded-[1.25rem] border border-line bg-surface p-4">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{groupLabel(x.fromKey)}</span>
                  <ArrowRight size={16} className="shrink-0 text-accent" />
                  <span className="font-semibold">{groupLabel(x.toKey)}</span>
                  <span className="ml-auto font-display text-[19px] font-semibold tabular">{money(x.amountMinor, base)}</span>
                </div>
                <p className="mt-1 text-[13px] text-text-3">{t.wallet.coupleTransfer(name(x.fromTravelerId), name(x.toTravelerId))}</p>
                <Button
                  className="mt-3 print:hidden"
                  size="sm"
                  icon={<Send size={15} />}
                  onClick={() =>
                    setPaying({ fromTravelerId: x.fromTravelerId, toTravelerId: x.toTravelerId, amountMinor: x.amountMinor, purpose: [t.report.title] })
                  }
                >
                  {t.wallet.payNow}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <SectionTitle>{mode === 'couples' ? t.report.perCouple : t.report.perPerson}</SectionTitle>
        <div className="space-y-3">
          {report.groups.map((g) => (
            <Card key={g.key} className="p-5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold">{label(g.memberIds)}</p>
                <p
                  className={cx(
                    'font-display text-[20px] font-semibold tabular',
                    g.balanceMinor > 0 ? 'text-success' : g.balanceMinor < 0 ? 'text-danger' : 'text-text-3',
                  )}
                >
                  {signed(g.balanceMinor)}
                </p>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[14px]">
                <dt className="text-text-3">{t.report.paid}</dt>
                <dd className="text-right font-semibold tabular">{money(g.paidMinor, base)}</dd>
                <dt className="text-text-3">{t.report.used}</dt>
                <dd className="text-right font-semibold tabular">{money(g.consumedMinor, base)}</dd>
                {(g.settledOutMinor > 0 || g.settledInMinor > 0) && (
                  <>
                    <dt className="text-text-3">{t.report.settled}</dt>
                    <dd className="text-right tabular">
                      {g.settledOutMinor > 0 && `−${money(g.settledOutMinor, base)}`} {g.settledInMinor > 0 && `+${money(g.settledInMinor, base)}`}
                    </dd>
                  </>
                )}
              </dl>
              {Object.keys(g.byCategory).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-3 text-[12px] text-text-3">
                  {Object.entries(g.byCategory)
                    .sort((a, b) => b[1] - a[1])
                    .map(([c, v]) => (
                      <span key={c}>
                        {t.expenseCategories[c as keyof typeof t.expenseCategories]} <span className="font-semibold text-text-2 tabular">{money(v, base)}</span>
                      </span>
                    ))}
                </div>
              )}
            </Card>
          ))}
        </div>

        {report.byCategory.length > 0 && <SectionTitle>{t.report.byCategory}</SectionTitle>}
        <Card className={cx('divide-y divide-line', !report.byCategory.length && 'hidden')}>
          {report.byCategory.map((c) => (
            <div key={c.category} className="flex items-center gap-3 p-4">
              <span className="flex-1">{t.expenseCategories[c.category]}</span>
              <span className="w-24 shrink-0">
                <span
                  className="block h-1.5 rounded-full bg-accent"
                  style={{ width: `${Math.max(4, (c.minor / Math.max(1, report.byCategory[0].minor)) * 100)}%` }}
                />
              </span>
              <span className="w-24 shrink-0 text-right font-semibold tabular">{money(c.minor, base)}</span>
            </div>
          ))}
        </Card>

        {report.byStop.length > 0 && <SectionTitle>{t.report.byStop}</SectionTitle>}
        <Card className={cx('divide-y divide-line', !report.byStop.length && 'hidden')}>
          {report.byStop.map((s) => (
            <div key={s.destinationId ?? 'none'} className="flex items-center gap-3 p-4">
              <span className="flex-1">
                {s.name || t.report.noStop}
                {s.nights > 0 && <span className="block text-[12px] text-text-3">{t.report.perNight(money(Math.round(s.minor / s.nights), base))}</span>}
              </span>
              <span className="font-semibold tabular">{money(s.minor, base)}</span>
            </div>
          ))}
        </Card>
        <p className="mt-4 text-[12px] text-text-3">{t.report.hint}</p>
      </div>
      <Suspense fallback={null}>{paying && <PaySheet snap={snap} req={paying} canRecord={canEdit} onClose={() => setPaying(null)} />}</Suspense>
    </div>
  );
}
