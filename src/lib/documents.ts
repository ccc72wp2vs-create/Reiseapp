/**
 * Document analysis: the file is read once, sent to the worker for in-memory
 * analysis and then dropped. Photos/screenshots are scaled down in the
 * browser first. Nothing is cached (no-store, POST is never cached by the
 * service worker) and nothing is written to browser storage.
 */
import { MAX_UPLOAD_BYTES } from '../../shared/constants';
import type { ApiErrorBody, DocumentAnalysis, ExtractedDocument } from '../../shared/types';
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
  try {
    for (const q of [0.85, 0.75, 0.6]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q));
      if (blob && blob.size <= MAX_UPLOAD_BYTES) return blob;
    }
  } finally {
    // Release the pixel buffer right away.
    canvas.width = 0;
    canvas.height = 0;
  }
  throw new ApiError(413, 'payload_too_large', t.documents.tooLarge);
}

export async function analyzeDocument(tripId: string, file: File, signal?: AbortSignal): Promise<ExtractedDocument | null> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const body: Blob = isPdf ? file : await shrinkImage(file);
  const mime = isPdf ? 'application/pdf' : 'image/jpeg';
  if (body.size > MAX_UPLOAD_BYTES) throw new ApiError(413, 'payload_too_large', t.documents.tooLarge);
  let res: Response;
  try {
    res = await fetch(`/api/v1/trips/${tripId}/documents/analyze`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
      headers: { 'X-Travio-Csrf': '1', 'Content-Type': mime, 'X-Filename': encodeURIComponent(isPdf ? file.name : 'foto.jpg'), Accept: 'application/json' },
      body,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'network', t.errors.network);
  }
  const json = (await res.json().catch(() => null)) as Partial<DocumentAnalysis & ApiErrorBody> | null;
  if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? 'network', json?.error?.message ?? t.errors.generic);
  return json?.extracted ?? null;
}

/** Old, previously stored documents (kept, read-only). */
export const documentUrl = (tripId: string, id: string) => `/api/v1/trips/${tripId}/documents/${id}/file`;
