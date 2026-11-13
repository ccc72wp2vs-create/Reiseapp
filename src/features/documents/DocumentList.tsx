import { FileText, Image as ImageIcon, Paperclip, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { DocumentDto, TripSnapshot } from '../../../shared/types';
import { toast } from '../../components/toast';
import { Button, ConfirmDialog, IconButton } from '../../components/ui';
import { t } from '../../i18n';
import { errorMessage, http } from '../../lib/api';
import { documentUrl, uploadDocument } from '../../lib/documents';
import { tripStore, useOnline } from '../../lib/store';

/** Receipts attached to one booking or expense – add, open, remove (only the file). */
export function DocumentList({ snap, bookingId, expenseId, canEdit }: { snap: TripSnapshot; bookingId?: string; expenseId?: string; canEdit: boolean }) {
  const online = useOnline();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<DocumentDto | null>(null);
  const docs = (snap.documents ?? []).filter((d) => (bookingId && d.bookingId === bookingId) || (expenseId && d.expenseId === expenseId));

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try {
      await tripStore.mutate(() => uploadDocument(snap.trip.id, f, { bookingId, expenseId }));
      toast(t.documents.attached);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      {docs.map((d) => (
        <div key={d.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            {d.mime === 'application/pdf' ? <FileText size={17} /> : <ImageIcon size={17} />}
          </span>
          <a href={documentUrl(snap.trip.id, d.id)} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-[14px] font-semibold text-accent">
            {d.filename}
          </a>
          {canEdit && (
            <IconButton label={t.documents.remove} className="h-9 w-9" disabled={!online} onClick={() => setRemoving(d)}>
              <Trash2 size={16} />
            </IconButton>
          )}
        </div>
      ))}
      {canEdit && (
        <>
          <input ref={input} type="file" accept="application/pdf,image/*" className="sr-only" tabIndex={-1} onChange={(e) => void onFile(e.target.files?.[0])} />
          <Button size="sm" variant="secondary" icon={<Paperclip size={16} />} loading={busy} disabled={!online} onClick={() => input.current?.click()}>
            {t.documents.attach}
          </Button>
        </>
      )}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={t.documents.remove}
        message={t.documents.removeConfirm}
        onConfirm={async () => {
          await tripStore.mutate(() => http.del(`/trips/${snap.trip.id}/documents/${removing!.id}`));
          toast(t.success.deleted);
        }}
      />
    </div>
  );
}
