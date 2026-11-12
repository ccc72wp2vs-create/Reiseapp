import { AlertTriangle, CloudOff, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { t } from '../i18n';
import { formatDateTime } from '../lib/format';
import { tripStore, useOnline, useTripState, type SyncConflict } from '../lib/store';
import { Badge, Button, Sheet, cx } from './ui';

const FIELD_LABELS: Record<string, string> = {
  title: t.plan.titleField,
  name: t.explore.name,
  date: t.plan.date,
  startTime: t.plan.startTime,
  endTime: t.plan.endTime,
  category: t.plan.category,
  locationName: t.plan.location,
  notes: t.common.notes,
  description: t.plan.description,
  completed: t.plan.completed,
  packed: t.packing.packed,
  quantity: t.packing.quantity,
  favorite: t.explore.favorite,
  address: t.explore.address,
};

function show(v: unknown) {
  if (v === null || v === undefined || v === '') return t.common.none;
  if (typeof v === 'boolean') return v ? t.common.yes : t.common.no;
  return String(v);
}

/**
 * Small status pill: offline state, pending changes, conflicts and rejected
 * operations. Expands into a sheet for conflict resolution.
 */
export function SyncIndicator() {
  const online = useOnline();
  const s = useTripState();
  const [open, setOpen] = useState(false);
  const pending = s.pending.filter((p) => p.tripId === s.tripId).length;
  const issues = s.conflicts.length + s.failures.length;
  const visible = !online || pending > 0 || issues > 0;
  if (!visible) return null;

  let label: string;
  if (issues) label = s.conflicts.length ? t.offline.conflicts(s.conflicts.length) : t.offline.failed(s.failures.length);
  else if (!online) label = pending ? t.offline.bannerPending(pending) : t.offline.banner;
  else label = s.syncing ? t.offline.syncing : t.offline.pending(pending);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center px-4" style={{ paddingTop: 'max(env(safe-area-inset-top), 0.5rem)' }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cx(
            'glass pointer-events-auto mt-1 inline-flex h-9 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold shadow-card',
            issues ? 'border-warn/50 text-warn' : 'border-line text-text-2',
          )}
        >
          {issues ? <AlertTriangle size={15} /> : !online ? <CloudOff size={15} /> : <RefreshCw size={15} className={s.syncing ? 'animate-spin' : ''} />}
          {label}
        </button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title={t.more.offline}>
        <div className="space-y-5">
          <p className="text-[14px] text-text-2">{s.lastSyncedAt ? t.offline.lastSync(formatDateTime(s.lastSyncedAt)) : t.offline.neverSynced}</p>
          {pending > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-4">
              <span className="text-[15px]">{t.offline.pending(pending)}</span>
              <Button size="sm" variant="soft" disabled={!online} onClick={() => void tripStore.flush()}>
                {t.offline.syncNow}
              </Button>
            </div>
          )}
          {s.conflicts.length > 0 && (
            <section>
              <h3 className="font-display text-lg font-semibold">{t.offline.conflictTitle}</h3>
              <p className="mt-1 text-[14px] text-text-2">{t.offline.conflictText}</p>
              <ul className="mt-4 space-y-3">
                {s.conflicts.map((c) => (
                  <ConflictCard key={c.op.opId} c={c} />
                ))}
              </ul>
            </section>
          )}
          {s.failures.length > 0 && (
            <section className="rounded-2xl border border-danger/30 bg-danger-soft p-4">
              <ul className="space-y-1 text-[14px] text-danger">
                {s.failures.map((f) => (
                  <li key={f.op.opId}>{f.message}</li>
                ))}
              </ul>
              <Button size="sm" variant="secondary" className="mt-3" onClick={() => tripStore.dismissFailures()}>
                {t.offline.dismiss}
              </Button>
            </section>
          )}
          <OfflineCapabilities />
        </div>
      </Sheet>
    </>
  );
}

function ConflictCard({ c }: { c: SyncConflict }) {
  const fields = Object.keys(c.op.data ?? {}).filter((k) => k in FIELD_LABELS);
  const title = String((c.server?.title ?? c.server?.name ?? c.op.data?.title ?? c.op.data?.name ?? '') || '');
  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-semibold">{title || c.op.entity}</span>
        <Badge tone="warn">{c.op.action === 'delete' ? t.common.delete : t.common.edit}</Badge>
      </div>
      {!c.server ? (
        <p className="mt-2 text-[14px] text-text-2">{t.offline.deletedRemotely}</p>
      ) : (
        fields.length > 0 && (
          <dl className="mt-3 grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1.5 text-[13px]">
            <dt />
            <dd className="font-semibold text-text-3">{t.offline.yourChange}</dd>
            <dd className="font-semibold text-text-3">{t.offline.theirVersion}</dd>
            {fields.map((f) => (
              <div key={f} className="contents">
                <dt className="text-text-3">{FIELD_LABELS[f]}</dt>
                <dd className="break-words text-accent">{show(c.op.data?.[f])}</dd>
                <dd className="break-words">{show(c.server?.[f])}</dd>
              </div>
            ))}
          </dl>
        )
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {c.server && (
          <Button size="sm" onClick={() => tripStore.resolveConflict(c, 'mine')}>
            {t.offline.keepMine}
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => tripStore.resolveConflict(c, 'theirs')}>
          {c.server ? t.offline.keepTheirs : t.offline.dismiss}
        </Button>
      </div>
    </li>
  );
}

export function OfflineCapabilities() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-2xl bg-surface p-4">
        <h4 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-success">{t.offline.whatWorks}</h4>
        <ul className="mt-2 space-y-1.5 text-[14px] text-text-2">
          {t.offline.whatWorksList.map((x) => (
            <li key={x}>• {x}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl bg-surface p-4">
        <h4 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-warn">{t.offline.whatNot}</h4>
        <ul className="mt-2 space-y-1.5 text-[14px] text-text-2">
          {t.offline.whatNotList.map((x) => (
            <li key={x}>• {x}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
