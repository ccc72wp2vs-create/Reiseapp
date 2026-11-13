import { FileText, Image as ImageIcon, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { DocumentDto, TripSnapshot } from '../../../shared/types';
import { toast } from '../../components/toast';
import { ConfirmDialog, Field, IconButton } from '../../components/ui';
import { t } from '../../i18n';
import { http } from '../../lib/api';
import { documentUrl } from '../../lib/documents';
import { tripStore, useOnline } from '../../lib/store';

/**
 * Documents stored by an earlier app version (new imports are never stored).
 * Shown only if there are any; they can be opened or removed (only the file).
 */
export function LegacyDocuments({ snap, bookingId, expenseId, canEdit }: { snap: TripSnapshot; bookingId?: string; expenseId?: string; canEdit: boolean }) {
  const online = useOnline();
  const [removing, setRemoving] = useState<DocumentDto | null>(null);
  const docs = (snap.documents ?? []).filter((d) => (bookingId && d.bookingId === bookingId) || (expenseId && d.expenseId === expenseId));
  if (!docs.length) return null;
  return (
    <Field label={t.documents.section}>
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
      </div>
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
    </Field>
  );
}
