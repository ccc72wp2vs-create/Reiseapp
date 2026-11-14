import { ArrowRight, ArrowRightLeft, Calculator, ChevronRight, CircleHelp as HelpCircle, Coins, FileUp, HandCoins, Lock, Plus, Receipt, Send, Trash2, Users } from 'lucide-react';
import type { PayRequest } from './PaySheet';
import { BudgetCard } from './BudgetCard';
import { DepositsCard } from './DepositsCard';
import { DepositSheet } from './DepositSheet';
import { JointPaymentSheet } from './JointPaymentSheet';
import { DocumentImportSheet } from '../documents/DocumentImportSheet';
import { lazy, Suspense, useMemo, useState } from 'react';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../../../shared/constants';
import { personCostOverview } from '../../../shared/costs';
import { balanceBreakdown, computeBalances, directSettlements, netPaidMinor, suggestSettlements, type DirectTransfer } from '../../../shared/finance';
import { convertMinor, CURRENCY_CODES, normalizeRate, parseAmount } from '../../../shared/money';
import { todayIn } from '../../../shared/trip';
import type { ExpenseDto, SettlementDto, TripSnapshot } from '../../../shared/types';
import { PageHeader, useTrip } from '../../components/AppShell';
import { MissingWalletHint } from '../bookings/MissingWalletHint';
import { MoneyField } from '../../components/inputs';
import { PersonFilter, usePersonSelection } from '../../components/PersonFilter';
import { ExpenseIcon } from '../../components/status';
import { toast } from '../../components/toast';
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, IconButton, Input, Progress, Segmented, SectionTitle, Select, Sheet, Skeleton, TextField, cx } from '../../components/ui';
import { t } from '../../i18n';
import { http } from '../../lib/api';
import { formatDate, formatDateShort, formatRate, money } from '../../lib/format';
import { tripStore, useOnline } from '../../lib/store';

const ExpenseSheet = lazy(() => import('./ExpenseSheet'));
const SettlementSheet = lazy(() => import('./SettlementSheet'));
const PaySheet = lazy(() => import('./PaySheet'));

export default function WalletPage() {
  const { snap } = useTrip();
  if (!snap) {
    return (
      <div className="space-y-4 px-safe pt-safe">
        <Skeleton className="mt-6 h-10 w-1/2" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  return <Wallet snap={snap} />;
}

type Tab = 'overview' | 'balances' | 'history' | 'rates';

function Wallet({ snap }: { snap: TripSnapshot }) {
  const { canEdit, me } = useTrip();
  const online = useOnline();
  const [tab, setTab] = useState<Tab>('overview');
  const [sheet, setSheet] = useState<{ kind: 'expense'; expense?: ExpenseDto } | { kind: 'settlement'; preset?: { from: string; to: string; amountMinor: number } } | null>(null);
  const { trip, travelers, expenses, settlements } = snap;
  const base = trip.baseCurrency;

  const balances = useMemo(
    () =>
      computeBalances(
        travelers.map((x) => x.id),
        expenses.map((e) => ({ payers: e.payers, baseAmountMinor: e.baseAmountMinor, shares: e.shares })),
        settlements.map((s) => ({ fromTravelerId: s.fromTravelerId, toTravelerId: s.toTravelerId, baseAmountMinor: s.baseAmountMinor })),
      ),
    [travelers, expenses, settlements],
  );
  const [settleMode, setSettleModeState] = useState<'minimal' | 'direct'>(() => {
    try {
      return localStorage.getItem('travio.settleMode') === 'direct' ? 'direct' : 'minimal';
    } catch {
      return 'minimal';
    }
  });
  const setSettleMode = (m: 'minimal' | 'direct') => {
    setSettleModeState(m);
    try {
      localStorage.setItem('travio.settleMode', m);
    } catch {
      /* ignore */
    }
  };
  const minimal = useMemo(() => suggestSettlements(balances), [balances]);
  const direct = useMemo(
    () =>
      directSettlements(
        expenses.map((e) => ({ id: e.id, title: e.title, date: e.date, payers: e.payers, shares: e.shares })),
        settlements.map((s) => ({ id: s.id, date: s.date, fromTravelerId: s.fromTravelerId, toTravelerId: s.toTravelerId, baseAmountMinor: s.baseAmountMinor })),
      ),
    [expenses, settlements],
  );
  const suggestions = settleMode === 'direct' ? direct : minimal;
  const [pair, setPair] = useState<DirectTransfer | null>(null);
  const [paying, setPaying] = useState<PayRequest | null>(null);
  const [addingDeposit, setAddingDeposit] = useState(false);
  const [joint, setJoint] = useState(false);
  const [importing, setImporting] = useState(false);
  const name = (id: string) => travelers.find((x) => x.id === id)?.name ?? '?';
  const color = (id: string) => travelers.find((x) => x.id === id)?.color ?? '#999';
  const total = expenses.reduce((a, e) => a + e.baseAmountMinor, 0);
  const mine = me ? balances.find((b) => b.travelerId === me.id) : null;
  const canWrite = canEdit && online;
  const selection = usePersonSelection(travelers);
  const [explain, setExplain] = useState<string | null>(null);
  const sel = selection.filtered ? personCostOverview(base, selection.selected, expenses, settlements, snap.bookings) : null;
  const selectionLabel = selection.selected.map(name).join(' & ');
  /** Expense amount in base currency – the selected persons' share when filtered. */
  const amountOf = (e: ExpenseDto) =>
    sel ? e.shares.filter((x) => selection.selected.includes(x.travelerId)).reduce((a, x) => a + x.baseShareMinor, 0) : e.baseAmountMinor;
  const shownTotal = sel ? sel.spentMinor : total;

  return (
    <div>
      <PageHeader
        title={t.wallet.title}
        eyebrow={trip.name}
        action={
          canEdit && (
            <IconButton label={t.wallet.addExpense} variant="primary" disabled={!online} onClick={() => setSheet({ kind: 'expense' })}>
              <Plus size={22} />
            </IconButton>
          )
        }
      >
        <div className="no-scrollbar -mx-1 mt-5 overflow-x-auto px-1">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'overview', label: t.wallet.overview },
              { value: 'balances', label: t.wallet.balances },
              { value: 'history', label: t.wallet.history },
              { value: 'rates', label: t.wallet.ratesShort },
            ]}
          />
        </div>
      </PageHeader>

      <div className="px-safe pt-5">
        {!online && <p className="mb-4 rounded-2xl bg-warn-soft px-4 py-3 text-[14px] text-warn">{t.offline.banner} · {t.errors.offlineAction}</p>}

        {tab === 'overview' && (
          <>
            <div className="mb-4">
              <PersonFilter travelers={travelers} selection={selection} bleed="-mx-4 px-4" />
            </div>
            <div className="-mt-1 mb-4 empty:hidden [&>a]:mt-0">
              <MissingWalletHint snap={snap} />
            </div>
            <Card className="relative overflow-hidden p-6">
              <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-text-3">{sel ? t.home.costsShare : t.wallet.total}</p>
              <p className="mt-1 font-display text-[44px] font-semibold leading-none tabular">{money(sel ? sel.spentMinor : total, base)}</p>
              <p className="mt-2 text-[13px] text-text-3">{sel ? selectionLabel : t.wallet.baseInfo(base)}</p>
              {sel && (
                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4">
                  <div>
                    <p className="text-[12px] text-text-3">{t.home.costsNetPaid}</p>
                    <p className="font-semibold tabular">{money(sel.netPaidMinor, base)}</p>
                  </div>
                  <div>
                    <p className="text-[12px] text-text-3">{t.wallet.balances}</p>
                    <p className={cx('font-semibold tabular', sel.balanceMinor > 0 ? 'text-success' : sel.balanceMinor < 0 ? 'text-danger' : '')}>
                      {sel.balanceMinor > 0 ? '+' : ''}
                      {money(sel.balanceMinor, base)}
                    </p>
                  </div>
                </div>
              )}
              {!sel && mine && (
                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4">
                  <div>
                    <p className="text-[12px] text-text-3">{t.wallet.myShare}</p>
                    <p className="font-semibold tabular">{money(mine.owedMinor, base)}</p>
                  </div>
                  <div>
                    <p className="text-[12px] text-text-3">{t.wallet.balances}</p>
                    <p className={cx('font-semibold tabular', mine.balanceMinor > 0 ? 'text-success' : mine.balanceMinor < 0 ? 'text-danger' : '')}>
                      {mine.balanceMinor > 0 ? '+' : ''}
                      {money(mine.balanceMinor, base)}
                    </p>
                  </div>
                </div>
              )}
              {canEdit && (
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button size="sm" icon={<Receipt size={16} />} disabled={!canWrite} onClick={() => setSheet({ kind: 'expense' })}>
                    {t.home.addExpense}
                  </Button>
                  <Button size="sm" variant="secondary" icon={<HandCoins size={16} />} disabled={!canWrite || travelers.length < 2} onClick={() => setSheet({ kind: 'settlement' })}>
                    {t.wallet.settlement}
                  </Button>
                  <Button size="sm" variant="secondary" icon={<Lock size={16} />} disabled={!canWrite} onClick={() => setAddingDeposit(true)}>
                    {t.deposits.short}
                  </Button>
                  <Button size="sm" variant="secondary" icon={<Users size={16} />} disabled={!canWrite || travelers.length < 2} onClick={() => setJoint(true)}>
                    {t.joint.button}
                  </Button>
                  <Button size="sm" variant="secondary" icon={<FileUp size={16} />} disabled={!canWrite} onClick={() => setImporting(true)}>
                    {t.documents.import}
                  </Button>
                </div>
              )}
            </Card>

            <DepositsCard snap={snap} canEdit={canEdit} me={me?.id} />

            <BudgetCard snap={snap} persons={sel ? selection.selected : travelers.map((x) => x.id)} canEdit={canEdit} />

            {expenses.length === 0 ? (
              <div className="mt-6">
                <EmptyState icon={<Coins size={26} />} title={t.wallet.empty} text={t.wallet.emptyText} />
              </div>
            ) : (
              <>
                <SectionTitle>{t.wallet.byCategory}</SectionTitle>
                <Card className="space-y-4 p-5">
                  {EXPENSE_CATEGORIES.map((c) => {
                    const v = expenses.filter((e) => e.category === c).reduce((a, e) => a + amountOf(e), 0);
                    if (!v) return null;
                    return (
                      <div key={c}>
                        <div className="mb-1.5 flex items-center justify-between gap-2 text-[14px]">
                          <span className="flex items-center gap-2 text-text-2">
                            <ExpenseIcon category={c} size={16} /> {t.expenseCategories[c]}
                          </span>
                          <span className="font-semibold tabular">{money(v, base)}</span>
                        </div>
                        <Progress value={shownTotal ? v / shownTotal : 0} label={t.expenseCategories[c]} />
                      </div>
                    );
                  })}
                </Card>
                <SectionTitle>{t.wallet.byPerson}</SectionTitle>
                <p className="-mt-1 mb-3 text-[13px] text-text-3">{t.wallet.byPersonHint}</p>
                <Card className="divide-y divide-line">
                  {balances.filter((b) => !sel || selection.selected.includes(b.travelerId)).map((b) => (
                    <div key={b.travelerId} className="flex items-center gap-3 p-4">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color(b.travelerId) }} />
                      <span className="min-w-0 flex-1 truncate font-medium">{name(b.travelerId)}</span>
                      <div className="shrink-0 text-right text-[13px]">
                        <p className="tabular">
                          {t.wallet.paid} <span className="font-semibold">{money(netPaidMinor(b), base)}</span>
                        </p>
                        <p className="tabular text-text-3">
                          {t.wallet.consumed} {money(b.owedMinor, base)}
                        </p>
                      </div>
                    </div>
                  ))}
                </Card>
                <SectionTitle action={<button className="text-[14px] font-semibold text-accent" onClick={() => setTab('history')}>{t.wallet.history}</button>}>
                  {t.home.recentExpenses}
                </SectionTitle>
                <ExpenseList
                  expenses={[...(sel ? expenses.filter((e) => amountOf(e) > 0) : expenses)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5)}
                  snap={snap}
                  shareOf={sel ? selection.selected : undefined}
                  onOpen={(e) => canEdit && setSheet({ kind: 'expense', expense: e })}
                />
              </>
            )}
          </>
        )}

        {tab === 'balances' && (
          <>
            <Card className="divide-y divide-line">
              {balances.map((b) => (
                <button
                  type="button"
                  key={b.travelerId}
                  onClick={() => setExplain(b.travelerId)}
                  className="flex w-full items-center gap-3 p-4 text-left transition active:bg-surface-2"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[14px] font-bold text-[#101b33]" style={{ background: color(b.travelerId) }}>
                    {name(b.travelerId).slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{name(b.travelerId)}</p>
                    <p className="text-[13px] text-text-3">{b.balanceMinor > 0 ? t.wallet.youGet : b.balanceMinor < 0 ? t.wallet.youOwe : t.wallet.settled}</p>
                  </div>
                  <span className={cx('font-display text-[20px] font-semibold tabular', b.balanceMinor > 0 ? 'text-success' : b.balanceMinor < 0 ? 'text-danger' : 'text-text-3')}>
                    {b.balanceMinor > 0 ? '+' : ''}
                    {money(b.balanceMinor, base)}
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-text-3" />
                </button>
              ))}
            </Card>
            <p className="mt-2 text-[12px] text-text-3">{t.wallet.tapForDetails}</p>
            <SectionTitle>{t.wallet.suggestions}</SectionTitle>
            <Segmented
              value={settleMode}
              onChange={setSettleMode}
              options={[
                { value: 'minimal', label: t.wallet.settleModeMinimal },
                { value: 'direct', label: t.wallet.settleModeDirect },
              ]}
            />
            <p className="mb-3 mt-2 text-[13px] text-text-3">{settleMode === 'direct' ? t.wallet.directText : t.wallet.suggestionsText}</p>
            {suggestions.length === 0 ? (
              <Card className="p-5 text-center text-success">{t.wallet.allSettled}</Card>
            ) : (
              <ul className="space-y-2.5">
                {suggestions.map((s, i) => (
                  <li key={i} className="rounded-[1.25rem] border border-line bg-surface p-4">
                    <div className="flex items-center gap-2 text-[15px]">
                      <span className="font-semibold">{name(s.fromTravelerId)}</span>
                      <ArrowRight size={16} className="text-accent" />
                      <span className="font-semibold">{name(s.toTravelerId)}</span>
                      <span className="ml-auto font-display text-[19px] font-semibold tabular">{money(s.amountMinor, base)}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" icon={<HelpCircle size={16} />} onClick={() => ('items' in s ? setPair(s as DirectTransfer) : setExplain(s.fromTravelerId))}>
                        {t.wallet.whatFor}
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<Send size={15} />}
                        onClick={() =>
                          setPaying({
                            fromTravelerId: s.fromTravelerId,
                            toTravelerId: s.toTravelerId,
                            amountMinor: s.amountMinor,
                            purpose: 'items' in s ? [...new Set((s as DirectTransfer).items.filter((i) => i.kind === 'expense' && i.amountMinor > 0).map((i) => i.title ?? ''))] : [],
                          })
                        }
                      >
                        {t.wallet.payNow}
                      </Button>
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="soft"
                          disabled={!canWrite}
                          onClick={() => setSheet({ kind: 'settlement', preset: { from: s.fromTravelerId, to: s.toTravelerId, amountMinor: s.amountMinor } })}
                        >
                          {t.wallet.recordThis}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {tab === 'history' && <History snap={snap} onOpen={(e) => canEdit && setSheet({ kind: 'expense', expense: e })} />}
        {tab === 'rates' && <Rates snap={snap} />}
      </div>

      {explain && <BalanceSheet snap={snap} travelerId={explain} onClose={() => setExplain(null)} />}
      {importing && <DocumentImportSheet onClose={() => setImporting(false)} />}
      {joint && <JointPaymentSheet snap={snap} onClose={() => setJoint(false)} />}
      {addingDeposit && <DepositSheet snap={snap} me={me?.id} onClose={() => setAddingDeposit(false)} />}
      {pair && <PairSheet snap={snap} transfer={pair} onClose={() => setPair(null)} />}
      <Suspense fallback={null}>
        {sheet?.kind === 'expense' && <ExpenseSheet key={sheet.expense?.id ?? 'new'} open expense={sheet.expense} onClose={() => setSheet(null)} />}
        {sheet?.kind === 'settlement' && <SettlementSheet open preset={sheet.preset} onClose={() => setSheet(null)} />}
        {paying && <PaySheet snap={snap} req={paying} canRecord={canEdit} onClose={() => setPaying(null)} />}
      </Suspense>
    </div>
  );
}

function ExpenseList({ expenses, snap, onOpen, shareOf }: { expenses: ExpenseDto[]; snap: TripSnapshot; onOpen: (e: ExpenseDto) => void; shareOf?: string[] }) {
  const base = snap.trip.baseCurrency;
  const name = (id: string) => snap.travelers.find((x) => x.id === id)?.name ?? '?';
  return (
    <ul className="space-y-2">
      {expenses.map((e) => (
        <li key={e.id}>
          <button type="button" onClick={() => onOpen(e)} className="flex w-full items-center gap-3 rounded-[1.25rem] border border-line bg-surface p-4 text-left">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-text-2">
              <ExpenseIcon category={e.category} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{e.title}</span>
              <span className="block truncate text-[13px] text-text-3">
                {formatDateShort(e.date)} · {e.payers.map((p) => name(p.travelerId)).join(' & ')} · {t.wallet.split[e.splitMethod]} ({e.shares.length})
              </span>
            </span>
            {shareOf ? (
              <span className="shrink-0 text-right">
                <span className="block font-semibold tabular">
                  {money(e.shares.filter((x) => shareOf.includes(x.travelerId)).reduce((a, x) => a + x.baseShareMinor, 0), base)}
                </span>
                <span className="block text-[12px] text-text-3 tabular">{t.wallet.shareOf(money(e.amountMinor, e.currency))}</span>
              </span>
            ) : (
              <span className="shrink-0 text-right">
                <span className="block font-semibold tabular">{money(e.amountMinor, e.currency)}</span>
                {e.currency !== base && <span className="block text-[12px] text-text-3 tabular">≈ {money(e.baseAmountMinor, base)}</span>}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function History({ snap, onOpen }: { snap: TripSnapshot; onOpen: (e: ExpenseDto) => void }) {
  const { canEdit } = useTrip();
  const online = useOnline();
  const [cat, setCat] = useState<ExpenseCategory | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [deleting, setDeleting] = useState<SettlementDto | null>(null);
  const base = snap.trip.baseCurrency;
  const name = (id: string) => snap.travelers.find((x) => x.id === id)?.name ?? '?';
  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);
  const [sort, setSortState] = useState<'created' | 'date'>(() => {
    try {
      return localStorage.getItem('travio.historySort') === 'date' ? 'date' : 'created';
    } catch {
      return 'created';
    }
  });
  const setSort = (v: 'created' | 'date') => {
    setSortState(v);
    try {
      localStorage.setItem('travio.historySort', v);
    } catch {
      /* ignore */
    }
  };
  const order = <T extends { date: string; createdAt: string }>(list: T[]) =>
    [...list].sort((a, b) => (sort === 'created' ? b.createdAt.localeCompare(a.createdAt) || b.date.localeCompare(a.date) : b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)));
  const expenses = order(snap.expenses.filter((e) => (!cat || e.category === cat) && inRange(e.date)));
  const settlements = order(snap.settlements.filter((s) => inRange(s.date)));
  const sumFiltered = expenses.reduce((a, e) => a + e.baseAmountMinor, 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.wallet.category} className="col-span-2">
          <Select value={cat} onChange={(e) => setCat(e.target.value as ExpenseCategory | '')}>
            <option value="">{t.wallet.filterAll}</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t.expenseCategories[c]}
              </option>
            ))}
          </Select>
        </Field>
        <TextField label={t.wallet.filterFrom} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextField label={t.wallet.filterTo} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="mt-4">
        <Segmented
          label={t.wallet.sortLabel}
          value={sort}
          onChange={setSort}
          options={[
            { value: 'created', label: t.wallet.sortCreated },
            { value: 'date', label: t.wallet.sortDate },
          ]}
        />
      </div>
      <p className="mt-4 text-[14px] text-text-2">
        {expenses.length} · <span className="font-semibold text-text tabular">{money(sumFiltered, base)}</span>
      </p>
      <div className="mt-3">
        <ExpenseList expenses={expenses} snap={snap} onOpen={onOpen} />
      </div>
      {settlements.length > 0 && !cat && (
        <>
          <SectionTitle>{t.wallet.settlement}</SectionTitle>
          <ul className="space-y-2">
            {settlements.map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-[1.25rem] border border-dashed border-line-strong p-4">
                <ArrowRightLeft size={18} className="shrink-0 text-accent" />
                <span className="min-w-0 flex-1 text-[14px]">
                  {s.depositId ? (
                    <span>
                      <span className="font-semibold">{name(s.toTravelerId)}</span> {t.deposits.holdsShare(name(s.fromTravelerId), '')}
                    </span>
                  ) : (
                    <>
                      <span className="font-semibold">{name(s.fromTravelerId)}</span> → <span className="font-semibold">{name(s.toTravelerId)}</span>
                    </>
                  )}
                  <span className="block text-[12px] text-text-3">
                    {formatDate(s.date)}
                    {s.depositId ? ` · ${s.notes ?? t.deposits.returnInfo}` : ''}
                  </span>
                </span>
                <span className="font-semibold tabular">{money(s.amountMinor, s.currency)}</span>
                {canEdit && !s.depositId && (
                  <IconButton label={t.common.delete} disabled={!online} onClick={() => setDeleting(s)} className="h-9 w-9">
                    <Trash2 size={16} />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={t.common.delete}
        message={t.wallet.deleteSettlementConfirm}
        onConfirm={async () => {
          await tripStore.mutate(() => http.del(`/trips/${snap.trip.id}/settlements/${deleting!.id}`));
          toast(t.success.deleted);
        }}
      />
    </>
  );
}

function Rates({ snap }: { snap: TripSnapshot }) {
  const { canEdit } = useTrip();
  const online = useOnline();
  const { trip, exchangeRates } = snap;
  const base = trip.baseCurrency;
  const [cur, setCur] = useState(trip.localCurrency && trip.localCurrency !== base ? trip.localCurrency : 'USD');
  const [rate, setRate] = useState('');
  const [date, setDate] = useState(todayIn(trip.homeTimezone));
  const [busy, setBusy] = useState(false);
  const [conv, setConv] = useState({ amount: '1000', currency: trip.localCurrency ?? 'USD' });
  const latest = exchangeRates.filter((r) => r.currency === conv.currency).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
  const amountMinor = parseAmount(conv.amount || '0', conv.currency);
  const result = latest && amountMinor != null ? convertMinor(amountMinor, conv.currency, base, latest.rate) : null;

  async function add() {
    const n = normalizeRate(rate);
    if (!n) return toast(t.errors.validation, 'error');
    setBusy(true);
    try {
      await tripStore.mutate(() => http.post(`/trips/${trip.id}/exchange-rates`, { currency: cur, rate: n, effectiveDate: date }));
      setRate('');
      toast(t.success.saved);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card className="p-5">
        <h3 className="flex items-center gap-2 font-semibold">
          <Calculator size={18} className="text-accent" /> {t.wallet.converter}
        </h3>
        <div className="mt-3">
          <MoneyField label={t.wallet.amount} amount={conv.amount} currency={conv.currency} onAmount={(v) => setConv({ ...conv, amount: v })} onCurrency={(c) => setConv({ ...conv, currency: c })} />
        </div>
        <p className="mt-4 font-display text-[30px] font-semibold tabular">
          {conv.currency === base && amountMinor != null ? money(amountMinor, base) : result != null ? money(result, base) : '—'}
        </p>
        {latest && conv.currency !== base && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-text-3">
            <Badge tone="info">{t.wallet.rateSource[latest.source === 'provider' ? 'provider' : 'manual']}</Badge>
            1 {latest.currency} = {formatRate(latest.rate)} {base} · {t.wallet.rateFrom(formatDate(latest.effectiveDate))}
          </div>
        )}
        {!latest && conv.currency !== base && <p className="mt-1 text-[13px] text-text-3">{t.wallet.noStoredRate}</p>}
        <p className="mt-3 text-[12px] text-text-3">{t.wallet.converterHint}</p>
      </Card>

      <SectionTitle>{t.wallet.rates}</SectionTitle>
      {exchangeRates.length === 0 ? (
        <p className="text-[14px] text-text-3">{t.wallet.noRates}</p>
      ) : (
        <Card className="divide-y divide-line">
          {exchangeRates.map((r) => (
            <div key={r.id} className="flex items-center gap-3 p-4 text-[14px]">
              <span className="min-w-0 flex-1">
                <span className="font-semibold tabular">
                  1 {r.currency} = {formatRate(r.rate)} {r.baseCurrency}
                </span>
                <span className="block text-[12px] text-text-3">
                  {t.wallet.rateEffective} {formatDate(r.effectiveDate)} · {t.wallet.rateSource[r.source === 'provider' ? 'provider' : 'manual']}
                </span>
              </span>
              {canEdit && (
                <IconButton
                  label={t.common.delete}
                  disabled={!online}
                  className="h-9 w-9"
                  onClick={async () => {
                    try {
                      await tripStore.mutate(() => http.del(`/trips/${trip.id}/exchange-rates/${r.id}`));
                    } catch (e) {
                      toast.error(e);
                    }
                  }}
                >
                  <Trash2 size={16} />
                </IconButton>
              )}
            </div>
          ))}
        </Card>
      )}
      {canEdit && (
        <Card className="mt-4 space-y-3 p-5">
          <h3 className="font-semibold">{t.wallet.addRate}</h3>
          <div className="grid grid-cols-[110px_1fr] gap-3">
            <Field label={t.wallet.currency}>
              <Select value={cur} onChange={(e) => setCur(e.target.value)}>
                {CURRENCY_CODES.filter((c) => c !== base).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.wallet.rateHelp(cur, base)}>
              <Input inputMode="decimal" placeholder="0,0262" value={rate} onChange={(e) => setRate(e.target.value)} />
            </Field>
          </div>
          <TextField label={t.wallet.rateEffective} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Button block loading={busy} disabled={!online || !rate} onClick={() => void add()}>
            {t.wallet.addRate}
          </Button>
        </Card>
      )}
      <p className="mt-4 text-[12px] text-text-3">{t.wallet.liveRatesPlanned}</p>
    </>
  );
}

/** "Wofür?" for a direct transfer: the expenses between exactly these two people. */
function PairSheet({ snap, transfer, onClose }: { snap: TripSnapshot; transfer: DirectTransfer; onClose: () => void }) {
  const base = snap.trip.baseCurrency;
  const name = (id: string) => snap.travelers.find((x) => x.id === id)?.name ?? '?';
  const from = name(transfer.fromTravelerId);
  const to = name(transfer.toTravelerId);
  return (
    <Sheet open onClose={onClose} title={t.wallet.pairTitle(from, to)}>
      <div className="rounded-[1.25rem] bg-surface p-4">
        <p className="text-[13px] text-text-3">{t.wallet.pairOwes(from, to)}</p>
        <p className="font-display text-[30px] font-semibold tabular text-danger">{money(transfer.amountMinor, base)}</p>
      </div>
      <ul className="mt-3 divide-y divide-line">
        {transfer.items.map((i) => (
          <li key={i.kind + i.id} className="flex items-start gap-3 py-3">
            <span className="min-w-0 flex-1">
              <span className="block font-medium leading-snug">
                {i.kind === 'expense' ? i.title : snap.settlements.find((s) => s.id === i.id)?.depositId ? t.deposits.returnInfo : t.wallet.settlement}
              </span>
              <span className="block text-[13px] text-text-3">
                {formatDate(i.date)} · {i.kind === 'settlement' ? t.wallet.pairRepaid : i.amountMinor > 0 ? `${t.wallet.pairExpense}, ${t.wallet.owedTo(to)}` : t.wallet.pairCounter(to, from)}
              </span>
            </span>
            <span className={cx('shrink-0 font-semibold tabular', i.amountMinor > 0 ? 'text-danger' : 'text-success')}>
              {i.amountMinor > 0 ? '' : '−'}
              {money(Math.abs(i.amountMinor), base)}
            </span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/** "Wofür?" – explains a traveler's open balance item by item. */
function BalanceSheet({ snap, travelerId, onClose }: { snap: TripSnapshot; travelerId: string; onClose: () => void }) {
  const base = snap.trip.baseCurrency;
  const name = (id: string) => snap.travelers.find((x) => x.id === id)?.name ?? '?';
  const items = balanceBreakdown(
    travelerId,
    snap.expenses.map((e) => ({ id: e.id, title: e.title, date: e.date, payers: e.payers, shares: e.shares })),
    snap.settlements.map((s) => ({ id: s.id, date: s.date, fromTravelerId: s.fromTravelerId, toTravelerId: s.toTravelerId, baseAmountMinor: s.baseAmountMinor })),
  );
  const total = items.reduce((a, i) => a + i.amountMinor, 0);
  const depositSettlements = new Set(snap.settlements.filter((s) => s.depositId).map((s) => s.id));
  const owes = items.filter((i) => i.amountMinor < 0 && i.kind === 'expense');
  const gets = items.filter((i) => i.amountMinor > 0 && i.kind === 'expense');
  const repayments = items.filter((i) => i.kind === 'settlement');
  const row = (i: (typeof items)[number]) => (
    <li key={i.kind + i.id} className="flex items-start gap-3 py-3">
      <span className="min-w-0 flex-1">
        <span className="block font-medium leading-snug">{i.kind === 'expense' ? i.title : depositSettlements.has(i.id) ? t.deposits.returnInfo : t.wallet.settlement}</span>
        <span className="block text-[13px] text-text-3">
          {formatDate(i.date)} ·{' '}
          {i.kind === 'settlement' && depositSettlements.has(i.id)
            ? i.amountMinor > 0
              ? t.deposits.heldBy(name(i.counterpartIds[0]))
              : t.deposits.youHold(name(i.counterpartIds[0]))
            : i.kind === 'settlement'
            ? i.amountMinor > 0
              ? t.wallet.repaidTo(name(i.counterpartIds[0]))
              : t.wallet.repaidFrom(name(i.counterpartIds[0]))
            : i.amountMinor < 0
              ? t.wallet.owedTo(i.counterpartIds.map(name).join(' & '))
              : t.wallet.advancedFor(i.counterpartIds.map(name).join(', '))}
        </span>
      </span>
      <span className={cx('shrink-0 font-semibold tabular', i.amountMinor > 0 ? 'text-success' : 'text-danger')}>
        {i.amountMinor > 0 ? '+' : ''}
        {money(i.amountMinor, base)}
      </span>
    </li>
  );
  return (
    <Sheet open onClose={onClose} title={t.wallet.breakdownTitle(name(travelerId))}>
      <div className="rounded-[1.25rem] bg-surface p-4">
        <p className="text-[13px] text-text-3">{total > 0 ? t.wallet.youGet : total < 0 ? t.wallet.youOwe : t.wallet.settled}</p>
        <p className={cx('font-display text-[30px] font-semibold tabular', total > 0 ? 'text-success' : total < 0 ? 'text-danger' : '')}>
          {total > 0 ? '+' : ''}
          {money(total, base)}
        </p>
      </div>
      {items.length === 0 && <p className="mt-4 text-[14px] text-text-2">{t.wallet.breakdownNone}</p>}
      {owes.length > 0 && (
        <>
          <h3 className="mt-5 text-[12px] font-semibold uppercase tracking-[0.14em] text-text-3">{t.wallet.breakdownOwes}</h3>
          <ul className="divide-y divide-line">{owes.map(row)}</ul>
        </>
      )}
      {gets.length > 0 && (
        <>
          <h3 className="mt-5 text-[12px] font-semibold uppercase tracking-[0.14em] text-text-3">{t.wallet.breakdownGets}</h3>
          <ul className="divide-y divide-line">{gets.map(row)}</ul>
        </>
      )}
      {repayments.length > 0 && (
        <>
          <h3 className="mt-5 text-[12px] font-semibold uppercase tracking-[0.14em] text-text-3">{t.wallet.breakdownRepayments}</h3>
          <ul className="divide-y divide-line">{repayments.map(row)}</ul>
        </>
      )}
      <p className="mt-4 text-[12px] text-text-3">{t.wallet.breakdownHint}</p>
    </Sheet>
  );
}
