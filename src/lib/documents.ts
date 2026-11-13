/**
 * Receipt upload: photos are scaled down in the browser (fast upload, fits
 * the 1.9 MB limit), PDFs are sent as they are.
 */
import { MAX_UPLOAD_BYTES } from '../../shared/constants';
import type { ApiErrorBody, DocumentDto } from '../../shared/types';
import { t } from '../i18n';
import { ApiError } from './api';

async function shrinkImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const max = 1800;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  for (const q of [0.85, 0.75, 0.6]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= MAX_UPLOAD_BYTES) return blob;
  }
  throw new ApiError(413, 'payload_too_large', t.documents.tooLarge);
}

export async function uploadDocument(tripId: string, file: File, links: { bookingId?: string; expenseId?: string } = {}): Promise<DocumentDto> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  let body: Blob = file;
  let mime = isPdf ? 'application/pdf' : file.type;
  let name = file.name || 'Beleg';
  if (!isPdf) {
    body = await shrinkImage(file);
    mime = 'image/jpeg';
    name = name.replace(/\.(heic|heif|png|webp|jpe?g)$/i, '') + '.jpg';
  }
  if (body.size > MAX_UPLOAD_BYTES) throw new ApiError(413, 'payload_too_large', t.documents.tooLarge);
  const q = new URLSearchParams(Object.entries(links).filter(([, v]) => !!v) as [string, string][]).toString();
  let res: Response;
  try {
    res = await fetch(`/api/v1/trips/${tripId}/documents${q ? `?${q}` : ''}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-Travio-Csrf': '1', 'Content-Type': mime, 'X-Filename': encodeURIComponent(name), Accept: 'application/json' },
      body,
    });
  } catch {
    throw new ApiError(0, 'network', t.errors.network);
  }
  const json = (await res.json().catch(() => null)) as { document?: DocumentDto } & Partial<ApiErrorBody>;
  if (!res.ok || !json?.document) throw new ApiError(res.status, json?.error?.code ?? 'network', json?.error?.message ?? t.errors.generic);
  return json.document;
}

export const documentUrl = (tripId: string, id: string) => `/api/v1/trips/${tripId}/documents/${id}/file`;
