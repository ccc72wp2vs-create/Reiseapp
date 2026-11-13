import { AlertTriangle, ArrowRight, BedDouble, Check, ExternalLink, Lightbulb, MapPin, PlaneTakeoff, Wallet } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { AssistantCard, AssistantProposal, PlanItem } from '../../../shared/assistant';
import { Badge, Button, cx } from '../../components/ui';
import { formatDateShort, formatLongDate, money } from '../../lib/format';
import { useTrip } from '../../components/AppShell';
import { errorMessage, http } from '../../lib/api';
import { formatDistance, formatDuration } from '../../../shared/google';
import { NearbyGoogle } from '../explore/google/NearbyGoogle';

const shell = 'rounded-[1.25rem] border border-line bg-surface p-4';

function Head({ icon, title, sub }: { icon: ReactNode; title: string; sub?: string | null }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold leading-snug">{title}</p>
        {sub && <p className="mt-0.5 text-[13px] text-text-2">{sub}</p>}
      </div>
    </div>
  );
}

function when(iso: string, tz: string | null) {
  return `${new Intl.DateTimeFormat('de-DE', { timeZone: tz ?? undefined, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))} Uhr`;
}

const CHECKIN_LABEL = { upcoming: 'Check-in noch nicht offen', open: 'Check-in geöffnet', closing: 'Check-in schließt bald', closed: 'Check-in geschlossen', done: 'Eingecheckt' } as const;

export function AnswerCard({ card, onNavigate }: { card: AssistantCard; onNavigate: () => void }) {
  if (card.kind === 'flight') {
    const c = card.checkin;
    return (
      <div className={shell}>
        <Head
          icon={<PlaneTakeoff size={18} />}
          title={card.title}
          sub={[card.date ? formatDateShort(card.date) : 'Datum offen', card.time ? `${card.time} Uhr` : 'Abflugzeit fehlt', card.flightNumber, card.airline].filter(Boolean).join(' · ')}
        />
        <div className="mt-3 space-y-1 pl-12 text-[13px] text-text-2">
          {c ? (
            <>
              <p className={cx('font-semibold', c.state === 'closing' ? 'text-warn' : c.state === 'open' || c.state === 'done' ? 'text-accent' : 'text-text')}>{CHECKIN_LABEL[c.state]}</p>
              {c.state !== 'done' && (
                <p>
                  Öffnet {when(c.opensAt, card.timezone)} · schließt {when(c.closesAt, card.timezone)}
                </p>
              )}
              {!c.confirmed && <p className="text-text-3">Zeitfenster bitte bei der Airline prüfen.</p>}
            </>
          ) : (
            <p>{card.time ? 'Keine Check-in-Angaben.' : 'Abflugzeit ergänzen, dann berechne ich den Check-in.'}</p>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 pl-12">
          {c?.url && c.state !== 'done' && (
            <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[14px] font-semibold text-accent-ink active:scale-[0.98]">
              Zum Check-in <ExternalLink size={14} />
            </a>
          )}
          {(!card.flightNumber || !card.time) && (
            <Link to={`/buchungen?id=${card.bookingId}`} onClick={onNavigate} className="inline-flex h-9 items-center rounded-full border border-line px-4 text-[14px] font-semibold active:scale-[0.98]">
              {!card.time ? 'Abflugzeit ergänzen' : 'Flugnummer ergänzen'}
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (card.kind === 'finance') {
    const cur = card.currency;
    return (
      <div className={shell}>
        <Head icon={<Wallet size={18} />} title={`${money(card.spentMinor, cur)} ausgegeben`} sub={card.projectedMinor > card.spentMinor ? `Mit gebuchten & geplanten Kosten: ${money(card.projectedMinor, cur)}` : null} />
        <div className="mt-3 divide-y divide-line rounded-2xl bg-surface-2">
          {card.people.map((p) => (
            <div key={p.travelerId} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[14px]">
              <span className={cx('min-w-0 truncate', p.isMe && 'font-semibold')}>
                {p.name}
                {p.isMe && <span className="text-text-3"> (du)</span>}
              </span>
              <span className="text-right text-[12px] leading-tight text-text-3">
                bezahlt {money(p.paidMinor, cur)} · Anteil {money(p.shareMinor, cur)}
                <span className={cx('block text-[14px] font-semibold', p.balanceMinor > 0 ? 'text-accent' : p.balanceMinor < 0 ? 'text-warn' : 'text-text-2')}>
                  {p.balanceMinor > 0 ? '+' : ''}
                  {money(p.balanceMinor, cur)}
                </span>
              </span>
            </div>
          ))}
        </div>
        {card.transfers.length > 0 ? (
          <div className="mt-3 space-y-1 text-[14px]">
            {card.transfers.map((x, i) => (
              <p key={i} className="flex items-center gap-1.5">
                <span className="font-semibold">{x.from}</span>
                <ArrowRight size={14} className="text-text-3" />
                <span className="font-semibold">{x.to}</span>
                <span className="ml-auto">{money(x.amountMinor, cur)}</span>
              </p>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-text-2">Alle Salden sind ausgeglichen.</p>
        )}
        <Link to="/kasse" onClick={onNavigate} className="mt-3 inline-flex items-center gap-1 text-[14px] font-semibold text-accent">
          Zur Reisekasse <ArrowRight size={14} />
        </Link>
      </div>
    );
  }

  if (card.kind === 'google_search') return <GoogleSearchCard params={card.params} onNavigate={onNavigate} />;
  if (card.kind === 'google_distance') return <GoogleDistanceCard placeId={card.placeId} name={card.name} />;

  if (card.kind === 'stay') {
    return (
      <div className={shell}>
        <Head
          icon={<BedDouble size={18} />}
          title={`${formatLongDate(card.date)}: ${card.destination ?? 'kein Ort eingetragen'}`}
          sub={[card.moving ? `Ortswechsel ${card.moving.from} → ${card.moving.to}` : null, card.accommodation ? `Unterkunft: ${card.accommodation}` : 'Unterkunft noch nicht eingetragen'].filter(Boolean).join(' · ')}
        />
      </div>
    );
  }

  return (
    <div className={shell}>
      <p className="text-[13px] font-semibold uppercase tracking-wide text-text-3">{card.title}</p>
      {card.items.length ? (
        <ul className="mt-2 divide-y divide-line">
          {card.items.map((i) => (
            <li key={i.id}>
              <Link to={i.link} onClick={onNavigate} className="flex items-center gap-3 py-2.5 active:opacity-70">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{i.title}</span>
                  {i.subtitle && <span className="block truncate text-[13px] text-text-3">{i.subtitle}</span>}
                </span>
                {i.badge && <Badge tone="neutral">{i.badge}</Badge>}
                <ArrowRight size={15} className="shrink-0 text-text-3" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[14px] text-text-2">{card.empty}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Proposals: preview → confirm → existing app functions
// ---------------------------------------------------------------------------

export type ProposalState = 'open' | 'busy' | 'done' | 'dismissed';

function PlanRow({ item, checked, onToggle, disabled }: { item: PlanItem; checked: boolean; onToggle: () => void; disabled: boolean }) {
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      <span className="absolute bottom-0 left-[22px] top-7 w-px bg-line" aria-hidden />
      <label className="flex flex-1 cursor-pointer gap-3">
        <span className="w-11 shrink-0 pt-0.5 text-[14px] font-semibold tabular-nums">{item.startTime}</span>
        <span className="min-w-0 flex-1">
          <span className={cx('block text-[15px] font-semibold leading-snug', !checked && 'text-text-3 line-through')}>{item.title}</span>
          {item.description && <span className="mt-0.5 block text-[13px] text-text-2">{item.description}</span>}
          {item.locationName && (
            <span className="mt-0.5 flex items-center gap-1 text-[13px] text-text-3">
              <MapPin size={12} /> {item.locationName}
            </span>
          )}
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {item.source === 'saved' ? <Badge tone="accent">Gespeicherter Ort</Badge> : <Badge tone="neutral">Idee · nicht geprüft</Badge>}
            {item.endTime && <Badge tone="neutral">bis {item.endTime}</Badge>}
            {item.duplicate && <Badge tone="info">Schon geplant</Badge>}
          </span>
          {item.conflict && (
            <span className="mt-1.5 flex items-start gap-1 text-[13px] text-warn">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {item.conflict}
            </span>
          )}
        </span>
        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]" checked={checked} onChange={onToggle} disabled={disabled} aria-label={`${item.title} übernehmen`} />
      </label>
    </li>
  );
}

export function ProposalCard({
  proposal,
  state,
  canEdit,
  onConfirm,
  onDismiss,
  onNavigate,
}: {
  proposal: AssistantProposal;
  state: ProposalState;
  canEdit: boolean;
  onConfirm: (selected?: number[]) => void;
  onDismiss: () => void;
  onNavigate: () => void;
}) {
  const [selected, setSelected] = useState<number[]>(() =>
    proposal.kind === 'add_activities' ? proposal.items.map((it, i) => (it.duplicate ? -1 : i)).filter((i) => i >= 0) : [],
  );
  const busy = state === 'busy';
  const done = state === 'done';
  const footer = (label: string, disabled = false) =>
    done ? (
      <p className="mt-3 flex items-center gap-1.5 text-[14px] font-semibold text-accent">
        <Check size={16} /> Erledigt
      </p>
    ) : state === 'dismissed' ? (
      <p className="mt-3 text-[13px] text-text-3">Verworfen – nichts geändert.</p>
    ) : canEdit ? (
      <div className="mt-4 flex gap-2">
        <Button size="sm" onClick={() => onConfirm(selected)} loading={busy} disabled={disabled}>
          {label}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss} disabled={busy}>
          Abbrechen
        </Button>
      </div>
    ) : (
      <p className="mt-3 text-[13px] text-text-3">Nur mit Bearbeitungsrechten möglich.</p>
    );

  if (proposal.kind === 'add_activities') {
    return (
      <div className={cx(shell, 'border-accent/30')}>
        <p className="text-[13px] font-semibold uppercase tracking-wide text-accent">{formatLongDate(proposal.date)}</p>
        <ul className="mt-3">
          {proposal.items.map((it, i) => (
            <PlanRow
              key={i}
              item={it}
              checked={selected.includes(i)}
              disabled={busy || done || !canEdit}
              onToggle={() => setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i].sort((a, b) => a - b)))}
            />
          ))}
        </ul>
        {proposal.alternatives.length > 0 && (
          <div className="mt-4 rounded-2xl bg-surface-2 p-3">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-text-2">
              <Lightbulb size={14} /> Alternativen
            </p>
            {proposal.alternatives.map((a, i) => (
              <p key={i} className="mt-1.5 text-[13px] text-text-2">
                <span className="font-semibold text-text">{a.title}</span>
                {a.description ? ` – ${a.description}` : ''}
              </p>
            ))}
          </div>
        )}
        <p className="mt-3 text-[12px] leading-snug text-text-3">Zeiten sind Vorschläge. Öffnungszeiten, Preise und Fahrtzeiten bitte vor Ort prüfen.</p>
        {footer(selected.length === 1 ? 'Zum Reiseplan hinzufügen' : `${selected.length} zum Reiseplan hinzufügen`, selected.length === 0)}
        {done && (
          <Link to={`/plan?tag=${proposal.date}`} onClick={onNavigate} className="mt-2 inline-flex items-center gap-1 text-[14px] font-semibold text-accent">
            Im Reiseplan ansehen <ArrowRight size={14} />
          </Link>
        )}
      </div>
    );
  }

  const summary: { title: string; sub: string | null; label: string; warn?: string | null } =
    proposal.kind === 'update_activity'
      ? {
          title: `„${proposal.title}“ verschieben`,
          sub: `${formatDateShort(proposal.before.date)} ${proposal.before.startTime ?? ''} → ${formatDateShort(proposal.date)} ${proposal.startTime ?? ''}${proposal.endTime ? `–${proposal.endTime}` : ''}`,
          label: 'Verschieben',
          warn: proposal.conflict,
        }
      : proposal.kind === 'favorite_place'
        ? { title: `„${proposal.name}“ als Favorit merken`, sub: null, label: 'Als Favorit merken' }
        : proposal.kind === 'mark_checkin'
          ? { title: `Check-in für „${proposal.title}“ als erledigt markieren`, sub: null, label: 'Als erledigt markieren' }
          : proposal.kind === 'add_packing'
            ? { title: proposal.listId ? `Zu „${proposal.listName}“ hinzufügen` : `Neue Packliste „${proposal.listName}“`, sub: proposal.items.map((i) => i.name).join(', '), label: `${proposal.items.length} Dinge hinzufügen` }
            : {
                title: `Ausgabe „${proposal.title}“ erfassen`,
                sub: `${proposal.amountMinor != null && proposal.currency ? money(proposal.amountMinor, proposal.currency) : 'Betrag offen'} · ${formatDateShort(proposal.date)} – Zahler und Aufteilung legst du im nächsten Schritt fest.`,
                label: 'Ausgabe öffnen',
              };
  return (
    <div className={cx(shell, 'border-accent/30')}>
      <p className="text-[15px] font-semibold leading-snug">{summary.title}</p>
      {summary.sub && <p className="mt-1 text-[13px] text-text-2">{summary.sub}</p>}
      {summary.warn && (
        <p className="mt-1.5 flex items-start gap-1 text-[13px] text-warn">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {summary.warn}
        </p>
      )}
      {footer(summary.label)}
    </div>
  );
}

function GoogleSearchCard({ params, onNavigate }: { params: Extract<AssistantCard, { kind: 'google_search' }>['params']; onNavigate: () => void }) {
  const { snap } = useTrip();
  if (!snap) return null;
  return (
    <div className={shell}>
      <NearbyGoogle snap={snap} compact initial={{ ...params, query: params.query }} onNavigate={onNavigate} />
    </div>
  );
}

function GoogleDistanceCard({ placeId, name }: { placeId: string; name: string }) {
  const { snap } = useTrip();
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!snap) return;
    let alive = true;
    http
      .post<{ origin: { label: string }; noRoute: boolean; durationSec?: number; distanceMeters?: number }>(`/trips/${snap.trip.id}/google/distance`, { placeId })
      .then((r) => {
        if (!alive) return;
        setText(
          r.noRoute
            ? `Keine Straßenroute zu „${name}“ ab ${r.origin.label} – vermutlich braucht ihr eine Fähre oder ein Boot.`
            : `„${name}“: ${formatDuration(r.durationSec!)} mit dem Auto · ${formatDistance(r.distanceMeters!)} ab ${r.origin.label}.`,
        );
      })
      .catch((e) => alive && setText(`Fahrzeit nicht verfügbar: ${errorMessage(e)}`));
    return () => {
      alive = false;
    };
  }, [snap, placeId, name]);
  return (
    <div className={shell}>
      <p className="text-[15px] font-semibold">{text ?? 'Fahrzeit wird berechnet …'}</p>
      <p className="mt-1 text-[12px] text-text-3">Routendaten: Google Maps</p>
    </div>
  );
}
