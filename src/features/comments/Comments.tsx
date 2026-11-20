/**
 * Short notes from the group on a booking, place, activity or expense –
 * e.g. "Check-in erst ab 15 Uhr, Gepäck kann vorher abgegeben werden".
 * Lives inside other forms, so it must never submit them.
 */
import { MessageCircle, Send, X } from 'lucide-react';
import { useState } from 'react';
import type { CommentDto, CommentEntity, TripSnapshot } from '../../../shared/types';
import { useTrip } from '../../components/AppShell';
import { toast } from '../../components/toast';
import { IconButton, Input } from '../../components/ui';
import { t } from '../../i18n';
import { http } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { tripStore, useOnline } from '../../lib/store';

export const commentsFor = (snap: TripSnapshot, type: CommentEntity, id: string): CommentDto[] =>
  (snap.comments ?? []).filter((c) => c.entityType === type && c.entityId === id);

export function CommentCount({ snap, type, id }: { snap: TripSnapshot; type: CommentEntity; id: string }) {
  const n = commentsFor(snap, type, id).length;
  if (!n) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-text-3" aria-label={t.comments.count(n)}>
      <MessageCircle size={13} /> {n}
    </span>
  );
}

export default function Comments({ snap, type, id }: { snap: TripSnapshot; type: CommentEntity; id: string }) {
  const { canEdit, user, isOwner } = useTrip();
  const online = useOnline();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = commentsFor(snap, type, id);
  const tripId = snap.trip.id;

  async function send() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await tripStore.mutate(() => http.post(`/trips/${tripId}/comments`, { entityType: type, entityId: id, text: text.trim() }));
      setText('');
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }
  async function remove(c: CommentDto) {
    try {
      await tripStore.mutate(() => http.del(`/trips/${tripId}/comments/${c.id}`));
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <section className="border-t border-line pt-4" aria-label={t.comments.title}>
      <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-text-2">
        <MessageCircle size={15} /> {t.comments.title}
      </p>
      {list.length > 0 && (
        <ul className="mb-3 space-y-2">
          {list.map((c) => (
            <li key={c.id} className="flex items-start gap-2 rounded-2xl bg-surface-2 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-text-3">
                  <span className="font-semibold text-text-2">{c.authorName ?? t.comments.someone}</span> · {formatDateTime(c.createdAt)}
                </p>
                <p className="whitespace-pre-wrap break-words text-[14px]">{c.text}</p>
              </div>
              {(c.userId === user?.id || isOwner) && online && (
                <button type="button" aria-label={t.comments.remove} onClick={() => remove(c)} className="-mr-1 p-1 text-text-3">
                  <X size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="flex gap-2">
          <Input
            aria-label={t.comments.new}
            placeholder={t.comments.placeholder}
            value={text}
            maxLength={1000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void send();
              }
            }}
            className="h-11 min-w-0 flex-1"
          />
          <IconButton label={t.comments.send} variant="primary" type="button" disabled={!text.trim() || !online || busy} onClick={send} className="h-11 w-11">
            <Send size={17} />
          </IconButton>
        </div>
      )}
    </section>
  );
}
