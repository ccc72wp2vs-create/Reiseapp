/**
 * Documents are analysed in memory only (analyzeOnly) and never stored.
 * The functions below only serve documents that were stored by an earlier
 * version of the app (kept, never deleted automatically).
 */
import type { DocumentDto, ExtractedDocument } from '../../shared/types';
import { ApiError } from '../lib/errors';
import { nowIso } from '../lib/util';
import { analyzeDocument, analyzeText } from './docai';

type Row = Record<string, unknown>;

export const DOCUMENT_MAX_BYTES = 1_900_000;
export const DOCUMENT_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

const COLS = 'id, trip_id, filename, mime, size, booking_id, expense_id, extracted, status, created_by, created_at, updated_at';

function toDto(r: Row): DocumentDto {
  let extracted: ExtractedDocument | null;
  try {
    extracted = r.extracted ? (JSON.parse(r.extracted as string) as ExtractedDocument) : null;
  } catch {
    extracted = null;
  }
  return {
    id: r.id as string,
    tripId: r.trip_id as string,
    filename: r.filename as string,
    mime: r.mime as string,
    size: r.size as number,
    bookingId: (r.booking_id as string) ?? null,
    expenseId: (r.expense_id as string) ?? null,
    extracted,
    status: r.status as DocumentDto['status'],
    createdBy: (r.created_by as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function listDocuments(db: D1Database, tripId: string): Promise<DocumentDto[]> {
  const { results } = await db.prepare(`SELECT ${COLS} FROM documents WHERE trip_id = ? ORDER BY created_at DESC`).bind(tripId).all<Row>();
  return results.map(toDto);
}

export async function getDocument(db: D1Database, tripId: string, id: string): Promise<DocumentDto | null> {
  const r = await db.prepare(`SELECT ${COLS} FROM documents WHERE id = ? AND trip_id = ?`).bind(id, tripId).first<Row>();
  return r ? toDto(r) : null;
}

async function assertLinks(db: D1Database, tripId: string, links: { bookingId?: string | null; expenseId?: string | null }) {
  if (links.bookingId) {
    const b = await db.prepare('SELECT id FROM bookings WHERE id = ? AND trip_id = ?').bind(links.bookingId, tripId).first();
    if (!b) throw new ApiError('validation_failed', 'Unbekannte Buchung', [{ path: 'bookingId' }]);
  }
  if (links.expenseId) {
    const e = await db.prepare('SELECT id FROM expenses WHERE id = ? AND trip_id = ?').bind(links.expenseId, tripId).first();
    if (!e) throw new ApiError('validation_failed', 'Unbekannte Ausgabe', [{ path: 'expenseId' }]);
  }
}

/**
 * Analyses a document in memory and returns the recognised fields. The file
 * is NOT stored anywhere (no D1, no R2, no logs) – once this returns, the
 * bytes are gone. Only what the user then confirms ends up in bookings /
 * expenses through the existing endpoints.
 */
export async function analyzeOnly(ai: Ai | undefined, file: { name: string; mime: string; bytes: Uint8Array }): Promise<ExtractedDocument | null> {
  if (!DOCUMENT_MIME.includes(file.mime)) throw new ApiError('validation_failed', 'Nur PDF oder Fotos/Screenshots (JPG, PNG, WebP) möglich');
  if (!file.bytes.byteLength) throw new ApiError('validation_failed', 'Leere Datei');
  if (file.bytes.byteLength > DOCUMENT_MAX_BYTES) throw new ApiError('payload_too_large', 'Die Datei ist zu groß (max. 1,9 MB).');
  return analyzeDocument(ai, file);
}

export const TEXT_MAX_CHARS = 30_000;

export async function analyzeTextOnly(ai: Ai | undefined, text: string): Promise<ExtractedDocument | null> {
  if (!text.trim()) throw new ApiError('validation_failed', 'Bitte zuerst den Text der Bestätigung einfügen.');
  return analyzeText(ai, text);
}

export async function getDocumentFile(db: D1Database, tripId: string, id: string) {
  const r = await db.prepare('SELECT filename, mime, data FROM documents WHERE id = ? AND trip_id = ?').bind(id, tripId).first<{ filename: string; mime: string; data: ArrayBuffer | number[] }>();
  if (!r) throw new ApiError('not_found', 'Beleg nicht gefunden');
  const bytes = r.data instanceof ArrayBuffer ? new Uint8Array(r.data) : new Uint8Array(r.data as number[]);
  return { filename: r.filename, mime: r.mime, bytes };
}

/** Link / unlink a document (only the document row changes). */
export async function linkDocument(db: D1Database, tripId: string, id: string, links: { bookingId?: string | null; expenseId?: string | null }) {
  const doc = await getDocument(db, tripId, id);
  if (!doc) throw new ApiError('not_found', 'Beleg nicht gefunden');
  await assertLinks(db, tripId, links);
  await db
    .prepare('UPDATE documents SET booking_id = ?, expense_id = ?, updated_at = ? WHERE id = ?')
    .bind(links.bookingId !== undefined ? links.bookingId : doc.bookingId, links.expenseId !== undefined ? links.expenseId : doc.expenseId, nowIso(), id)
    .run();
  return (await getDocument(db, tripId, id))!;
}

/** Deletes only the document – never the linked booking or expense. */
export async function deleteDocument(db: D1Database, tripId: string, id: string) {
  const res = await db.prepare('DELETE FROM documents WHERE id = ? AND trip_id = ?').bind(id, tripId).run();
  if (res.meta.changes === 0) throw new ApiError('not_found', 'Beleg nicht gefunden');
}
