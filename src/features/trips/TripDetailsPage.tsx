import { AlertTriangle, Archive, ArrowDown, ArrowUp, BedDouble, Copy, Download, Link2, Pencil, Send, Share2, Plus, Route, Trash2, UserPlus, Users } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ROLES, type Role } from '../../../shared/constants';
import { bookingMismatches, destinationIssues, diffDays, sortDestinations } from '../../../shared/trip';
import type { DestinationDto, InvitationDto, TravelerDto, TripSnapshot } from '../../../shared/types';
import { PageHeader, useTrip } from '../../components/AppShell';
import { CoverArt } from '../../components/CoverArt';
import { moveId, SortableList } from '../../components/SortableList';
import { toast } from '../../components/toast';
import { Badge, Button, Card, ConfirmDialog, IconButton, Input, SectionTitle, Select, SelectField, Sheet, Skeleton, TextField, cx } from '../../components/ui';
import { t } from '../../i18n';
import { http } from '../../lib/api';
import { formatDate, formatDateShort, formatDateTime, formatRange } from '../../lib/format';
import { tripsList, tripStore, useOnline } from '../../lib/store';

const TripSheet = lazy(() => import('./TripSheet'));
const DestinationSheet = lazy(() => import('./DestinationSheet'));

export default function TripDetailsPage() {
  const { snap } = useTrip();
  if (!snap) {
    return (
      <div className="space-y-4 px-safe pt-safe">
        <Skeleton className="mt-6 h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  return <Details snap={snap} />;
}

function Details({ snap }: { snap: TripSnapshot }) {
  const { canEdit, isOwner } = useTrip();
  const online = useOnline();
  const navigate = useNavigate();
  const [editTrip, setEditTrip] = useState(false);
  const [dest, setDest] = useState<DestinationDto | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { trip, bookings } = snap;
  const destinations = sortDestinations(snap.destinations);
  const issues = destinationIssues(trip, destinations);
  const mismatches = bookingMismatches(destinations, bookings);
  const chronological = destinations.every((d, i) => i === 0 || destinations[i - 1].arrivalDate <= d.arrivalDate);
  const ids = destinations.map((d) => d.id);

  async function reorder(order: string[]) {
    try {
      await tripStore.mutate(() => http.post(`/trips/${trip.id}/destinations/reorder`, { orderedIds: order }));
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <div>
      <PageHeader
        title={trip.name}
        eyebrow={t.trips.overview}
        action={
          canEdit && (
            <IconButton label={t.trips.edit} variant="secondary" disabled={!online} onClick={() => setEditTrip(true)}>
              <Pencil size={18} />
            </IconButton>
          )
        }
      >
        <p className="mt-2 text-[15px] text-text-2">
          {formatRange(trip.startDate, trip.endDate)} · {t.common.days(diffDays(trip.startDate, trip.endDate) + 1)}
          {trip.destinationCountry ? ` · ${trip.destinationCountry}` : ''}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge tone="accent">{t.tripStatus[trip.status]}</Badge>
          <Badge>
            {trip.baseCurrency}
            {trip.localCurrency && trip.localCurrency !== trip.baseCurrency ? ` · ${trip.localCurrency}` : ''}
          </Badge>
          <Badge>{t.roles[trip.role]}</Badge>
          {trip.isDemo && <Badge tone="warn">{t.trips.demoBadge}</Badge>}
          {trip.archivedAt && <Badge tone="warn">{t.trips.archived}</Badge>}
        </div>
        {trip.description && <p className="mt-3 text-[15px] leading-relaxed text-text-2">{trip.description}</p>}
      </PageHeader>

      <div className="px-safe">
        <Link to="/route" className="mt-5 flex items-center gap-3 rounded-[1.25rem] border border-line bg-surface p-4">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Route size={20} />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">{t.trips.route}</span>
            <span className="block text-[13px] text-text-3">{[trip.originName, ...destinations.map((d) => d.name), trip.originName].filter(Boolean).join(' → ')}</span>
          </span>
        </Link>

        {(issues.length > 0 || mismatches.length > 0) && (
          <div className="mt-4 space-y-2">
            {issues.map((i, n) => (
              <p key={n} className="flex items-start gap-2 rounded-2xl bg-warn-soft px-4 py-3 text-[14px] text-warn">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                {i.kind === 'overlap' ? t.conflicts.overlap(i.a.name, i.b.name) : i.kind === 'gap' ? t.conflicts.gap(i.a.name, i.b.name, i.nights) : t.conflicts.outside(i.d.name)}
              </p>
            ))}
            {mismatches.map((b) => (
              <p key={b.id} className="flex items-start gap-2 rounded-2xl bg-warn-soft px-4 py-3 text-[14px] text-warn">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                {t.conflicts.bookingMismatch(b.title, destinations.find((d) => d.id === b.destinationId)?.name ?? '')}
              </p>
            ))}
          </div>
        )}

        <SectionTitle
          action={
            canEdit && (
              <Button size="sm" variant="soft" icon={<Plus size={16} />} disabled={!online} onClick={() => setDest('new')}>
                {t.common.add}
              </Button>
            )
          }
        >
          {t.destinations.title}
        </SectionTitle>
        {!chronological && <p className="mb-3 text-[13px] text-warn">{t.destinations.unsorted}</p>}
        {destinations.length === 0 ? (
          <p className="text-text-3">{t.destinations.empty}</p>
        ) : (
          <SortableList
            items={destinations}
            disabled={!canEdit || !online}
            onReorder={(order) => void reorder(order)}
            renderItem={(d, handle, i) => (
              <div className="flex items-stretch gap-1 overflow-hidden rounded-[1.5rem] border border-line bg-surface shadow-card">
                <CoverArt name={d.name} imageUrl={d.coverImageUrl} className="w-20 shrink-0 sm:w-28" />
                <button type="button" className="min-w-0 flex-1 p-3.5 text-left" disabled={!canEdit} onClick={() => setDest(d)}>
                  <p className="text-[12px] font-semibold text-text-3">
                    {i + 1} · {formatDateShort(d.arrivalDate)} – {formatDate(d.departureDate)}
                  </p>
                  <p className="font-display text-[20px] font-semibold leading-tight">{d.name}</p>
                  <p className="mt-1 flex items-center gap-1.5 truncate text-[13px] text-text-2">
                    <BedDouble size={14} className="shrink-0" />
                    {d.accommodationName ?? t.home.accommodationUnknown}
                  </p>
                  <p className="mt-1 text-[12px] text-text-3">{t.common.nights(diffDays(d.arrivalDate, d.departureDate))}</p>
                </button>
                {canEdit && (
                  <div className="flex flex-col items-center justify-center pr-1">
                    {handle}
                    <button type="button" aria-label={t.common.moveUp} disabled={i === 0 || !online} className="grid h-8 w-8 place-items-center text-text-3 disabled:opacity-25" onClick={() => { const n = moveId(ids, d.id, -1); if (n) void reorder(n); }}>
                      <ArrowUp size={15} />
                    </button>
                    <button type="button" aria-label={t.common.moveDown} disabled={i === destinations.length - 1 || !online} className="grid h-8 w-8 place-items-center text-text-3 disabled:opacity-25" onClick={() => { const n = moveId(ids, d.id, 1); if (n) void reorder(n); }}>
                      <ArrowDown size={15} />
                    </button>
                  </div>
                )}
              </div>
            )}
          />
        )}

        <Travelers snap={snap} />
        {isOwner && <Members snap={snap} />}

        <SectionTitle>{t.more.trip}</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/v1/trips/${trip.id}/export`} className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-[14px] font-semibold">
            <Download size={16} /> {t.trips.export}
          </a>
          {canEdit && (
            <Button
              variant="secondary"
              icon={<Archive size={16} />}
              disabled={!online}
              onClick={async () => {
                try {
                  await tripStore.mutate(() => http.post(`/trips/${trip.id}/archive`, { archived: !trip.archivedAt }));
                  await tripsList.load();
                  toast(t.success.saved);
                } catch (e) {
                  toast.error(e);
                }
              }}
            >
              {trip.archivedAt ? t.trips.unarchive : t.trips.archive}
            </Button>
          )}
          {isOwner && (
            <Button variant="danger" icon={<Trash2 size={16} />} disabled={!online} onClick={() => setConfirmDelete(true)}>
              {t.trips.delete}
            </Button>
          )}
        </div>
      </div>

      <Suspense fallback={null}>
        {editTrip && <TripSheet open trip={trip} onClose={() => setEditTrip(false)} />}
        {dest && <DestinationSheet key={dest === 'new' ? 'new' : dest.id} open destination={dest === 'new' ? null : dest} onClose={() => setDest(null)} />}
      </Suspense>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t.trips.delete}
        message={t.trips.deleteConfirm(trip.name)}
        onConfirm={async () => {
          await http.del(`/trips/${trip.id}`);
          await tripStore.select(null);
          await tripsList.load();
          toast(t.success.deleted);
          navigate('/reisen');
        }}
      />
    </div>
  );
}

function Travelers({ snap }: { snap: TripSnapshot }) {
  const { canEdit, isOwner, user } = useTrip();
  const [inviteFor, setInviteFor] = useState<string | null>(null);
  const online = useOnline();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<TravelerDto | null>(null);
  const [removing, setRemoving] = useState<TravelerDto | null>(null);
  const trip = snap.trip;

  async function add() {
    if (!name.trim()) return;
    try {
      await tripStore.mutate(() => http.post(`/trips/${trip.id}/travelers`, { name: name.trim() }));
      setName('');
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <>
      <SectionTitle>
        <span className="inline-flex items-center gap-2">
          <Users size={14} /> {t.travelers.title} ({snap.travelers.length})
        </span>
      </SectionTitle>
      <Card className="divide-y divide-line">
        {snap.travelers.map((x) => (
          <div key={x.id} className="flex items-center gap-3 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[14px] font-bold text-[#101b33]" style={{ background: x.color }}>
              {x.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {x.name} {x.userId === user?.id && <span className="text-[13px] font-normal text-text-3">({t.travelers.you})</span>}
              </p>
              <p className="text-[12px] text-text-3">
                {x.userId ? t.travelers.linked : t.travelers.noAccount}
                {(x.paypalMe || x.iban) && ` · ${[x.paypalMe && 'PayPal', x.iban && 'IBAN'].filter(Boolean).join(' & ')} ${t.travelers.stored}`}
              </p>
              {isOwner && !x.userId && (
                <button
                  type="button"
                  disabled={!online}
                  onClick={() => setInviteFor(x.id)}
                  aria-label={t.members.inviteFor(x.name)}
                  className="mt-2 inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-accent-soft px-3.5 text-[13px] font-semibold text-accent disabled:opacity-50"
                >
                  <Send size={14} /> {t.members.inviteShort}
                </button>
              )}
            </div>
            {canEdit && (
              <>
                <IconButton label={t.travelers.edit} className="h-9 w-9" disabled={!online} onClick={() => setEditing(x)}>
                  <Pencil size={16} />
                </IconButton>
                <IconButton label={t.travelers.remove} className="h-9 w-9" disabled={!online || x.userId === user?.id} onClick={() => setRemoving(x)}>
                  <Trash2 size={16} />
                </IconButton>
              </>
            )}
          </div>
        ))}
        {canEdit && (
          <form
            className="flex gap-2 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <Input aria-label={t.travelers.name} placeholder={t.travelers.add} value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
            <IconButton label={t.travelers.add} variant="primary" type="submit" disabled={!online || !name.trim()}>
              <UserPlus size={18} />
            </IconButton>
          </form>
        )}
      </Card>
      {inviteFor && <InviteSheet snap={snap} presetTravelerId={inviteFor} onClose={() => setInviteFor(null)} />}
      {editing && <RenameTraveler traveler={editing} tripId={trip.id} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={t.travelers.remove}
        message={removing ? t.travelers.removeConfirm(removing.name) : ''}
        onConfirm={async () => {
          await tripStore.mutate(() => http.del(`/trips/${trip.id}/travelers/${removing!.id}`));
          toast(t.success.deleted);
        }}
      />
    </>
  );
}

function RenameTraveler({ traveler, tripId, onClose }: { traveler: TravelerDto; tripId: string; onClose: () => void }) {
  const [name, setName] = useState(traveler.name);
  const [paypal, setPaypal] = useState(traveler.paypalMe ?? '');
  const [iban, setIban] = useState(traveler.iban ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      open
      onClose={onClose}
      title={t.travelers.edit}
      footer={
        <>
          <Button variant="secondary" block onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button
            block
            loading={busy}
            disabled={!name.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await tripStore.mutate(() =>
                  http.patch(`/trips/${tripId}/travelers/${traveler.id}`, {
                    name: name.trim(),
                    paypalMe: paypal.trim() || null,
                    iban: iban.trim() || null,
                    version: traveler.version,
                  }),
                );
                onClose();
              } catch (e) {
                toast.error(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t.common.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label={t.travelers.name} value={name} onChange={(e) => setName(e.target.value)} />
        <p className="text-[13px] text-text-2">{t.travelers.paymentHint}</p>
        <TextField label={t.travelers.paypalMe} optional placeholder="z. B. MaxMuster" autoCapitalize="off" autoCorrect="off" value={paypal} onChange={(e) => setPaypal(e.target.value)} />
        <TextField label={t.travelers.iban} optional placeholder="DE…" autoCapitalize="characters" autoCorrect="off" value={iban} onChange={(e) => setIban(e.target.value)} />
      </div>
    </Sheet>
  );
}

function Members({ snap }: { snap: TripSnapshot }) {
  const online = useOnline();
  const { user } = useTrip();
  const trip = snap.trip;
  const [invites, setInvites] = useState<InvitationDto[] | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () =>
    http
      .get<{ invitations: InvitationDto[] }>(`/trips/${trip.id}/invitations`)
      .then((r) => setInvites(r.invitations))
      .catch(() => setInvites([]));
  useEffect(() => {
    if (online) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id, online]);

  const now = new Date().toISOString();
  return (
    <>
      <SectionTitle
        action={
          <Button size="sm" variant="soft" icon={<Link2 size={16} />} disabled={!online} onClick={() => setCreating(true)}>
            {t.members.invite}
          </Button>
        }
      >
        {t.members.title}
      </SectionTitle>
      <Card className="divide-y divide-line">
        {snap.members.map((m) => (
          <div key={m.userId} className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{m.displayName}</p>
              <p className="truncate text-[12px] text-text-3">{m.email}</p>
            </div>
            <Select
              aria-label={t.members.changeRole}
              className="h-10 w-40 text-[14px]"
              value={m.role}
              disabled={!online || m.userId === user?.id}
              onChange={async (e) => {
                try {
                  await tripStore.mutate(() => http.patch(`/trips/${trip.id}/members/${m.userId}`, { role: e.target.value }));
                } catch (err) {
                  toast.error(err);
                }
              }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t.roles[r]}
                </option>
              ))}
            </Select>
            {m.userId !== user?.id && (
              <IconButton
                label={t.members.removeMember}
                className="h-9 w-9"
                disabled={!online}
                onClick={async () => {
                  try {
                    await tripStore.mutate(() => http.del(`/trips/${trip.id}/members/${m.userId}`));
                  } catch (err) {
                    toast.error(err);
                  }
                }}
              >
                <Trash2 size={16} />
              </IconButton>
            )}
          </div>
        ))}
      </Card>
      {invites && invites.length > 0 && (
        <ul className="mt-3 space-y-2">
          {invites.map((i) => {
            const status = i.usedAt ? t.members.used : i.expiresAt < now ? t.members.expired : null;
            return (
              <li key={i.id} className={cx('flex items-center gap-3 rounded-2xl border border-line px-4 py-3 text-[13px]', status && 'opacity-60')}>
                <span className="flex-1">
                  {t.roles[i.role]} · {status ?? `bis ${formatDateTime(i.expiresAt)}`}
                </span>
                {!status && (
                  <button
                    className="font-semibold text-danger"
                    onClick={async () => {
                      await http.del(`/trips/${trip.id}/invitations/${i.id}`).catch(toast.error);
                      void load();
                    }}
                  >
                    {t.members.revoke}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {creating && <InviteSheet snap={snap} onClose={() => setCreating(false)} onCreated={() => void load()} />}
    </>
  );
}

/**
 * Creates a single-use invitation link. When created for an existing person
 * of the travel group, the new account is linked to exactly that person.
 */
function InviteSheet({
  snap,
  presetTravelerId,
  onClose,
  onCreated,
}: {
  snap: TripSnapshot;
  presetTravelerId?: string;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const trip = snap.trip;
  const unlinked = snap.travelers.filter((x) => !x.userId);
  const [role, setRole] = useState<Role>('editor');
  const [travelerId, setTravelerId] = useState(presetTravelerId ?? unlinked[0]?.id ?? '');
  const [hours, setHours] = useState(72);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const person = snap.travelers.find((x) => x.id === travelerId);

  async function create() {
    setBusy(true);
    try {
      const r = await http.post<{ path: string }>(`/trips/${trip.id}/invitations`, { role, travelerId: travelerId || null, expiresInHours: hours });
      setLink(`${window.location.origin}${r.path}`);
      onCreated?.();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!link) return;
    const text = t.members.shareText(person?.name ?? '', trip.name);
    try {
      if (navigator.share) await navigator.share({ title: 'TRAVIO', text, url: link });
      else {
        await navigator.clipboard.writeText(`${text} ${link}`);
        toast(t.common.copied);
      }
    } catch {
      /* user cancelled the share sheet */
    }
  }

  return (
    <Sheet open onClose={onClose} title={person ? t.members.inviteFor(person.name) : t.members.invite}>
      {link ? (
        <div className="space-y-4">
          <p className="font-semibold text-success">{t.members.created}</p>
          {person && <p className="text-[14px] text-text-2">{t.members.linkedTo(person.name)}</p>}
          <p className="text-[14px] text-text-2">{t.members.linkOnce}</p>
          <Input readOnly value={link} onFocus={(e) => e.target.select()} />
          <Button block icon={<Share2 size={16} />} onClick={() => void share()}>
            {t.members.share}
          </Button>
          <Button
            block
            variant="secondary"
            icon={<Copy size={16} />}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                toast(t.common.copied);
              } catch {
                toast(t.errors.generic, 'error');
              }
            }}
          >
            {t.common.copy}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[14px] text-text-2">{t.members.inviteHint}</p>
          {!presetTravelerId && (
            <SelectField label={t.members.whoIsInvited} value={travelerId} onChange={(e) => setTravelerId(e.target.value)}>
              {unlinked.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
              <option value="">{t.members.newPerson}</option>
            </SelectField>
          )}
          {!travelerId && unlinked.length > 0 && <p className="rounded-2xl bg-warn-soft px-4 py-3 text-[13px] text-warn">{t.members.newPersonWarn}</p>}
          <SelectField label={t.members.role} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t.roles[r]}
              </option>
            ))}
          </SelectField>
          <SelectField label={t.members.expires} value={String(hours)} onChange={(e) => setHours(Number(e.target.value))}>
            {[24, 72, 168].map((h) => (
              <option key={h} value={h}>
                {t.members.hours(h)}
              </option>
            ))}
          </SelectField>
          <Button block loading={busy} icon={<Link2 size={16} />} onClick={() => void create()}>
            {t.members.createLink}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
