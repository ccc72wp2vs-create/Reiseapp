/**
 * Reads receipts / booking confirmations with Cloudflare Workers AI (the
 * document stays inside the Cloudflare account). PDFs are converted to text
 * first; photos go to a vision model. A simple text heuristic fills in what
 * the model could not provide. Everything happens in memory for this one
 * request – nothing of the document is stored or logged. Never throws –
 * returns null on failure.
 */
import { BOOKING_TYPES } from '../../shared/constants';
import { currencyExponent, isSupportedCurrency } from '../../shared/money';
import type { ExtractedDocument } from '../../shared/types';

const TEXT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const VISION_MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct';

const FIELDS = `{
  "kind": "flight|hotel|ferry|train|bus|car|activity|other|null",
  "title": "kurzer Name, z. B. Hotelname oder 'Flug BKK → HKT'",
  "provider": "Anbieter/Plattform oder null",
  "reference": "Buchungs-/Bestätigungsnummer oder null",
  "startDate": "YYYY-MM-DD (Check-in, Abflug, Abholung) oder null",
  "endDate": "YYYY-MM-DD (Check-out, Ankunft, Rückgabe) oder null",
  "total": "Gesamtbetrag als Dezimalzahl mit Punkt, z. B. 469.00, oder null",
  "currency": "ISO-Code, z. B. EUR, THB, oder null",
  "paymentStatus": "paid|unpaid|partial|unknown",
  "payerName": "Name der zahlenden Person/des Gastes oder null",
  "personsCount": "Anzahl Personen als Zahl oder null",
  "startTime": "HH:MM (Abflug, Check-in, Abholung) oder null",
  "endTime": "HH:MM (Ankunft, Check-out, Rückgabe) oder null",
  "fromLocation": "Abflughafen/Abfahrtsort (z. B. 'BKK Bangkok') oder null",
  "toLocation": "Zielflughafen/Zielort oder null",
  "location": "Hoteladresse bzw. Treffpunkt oder null",
  "flightNumber": "Flugnummer wie 'TG 202' oder null",
  "deadlines": "kurz: Stornierungsfrist, Check-in-Zeiten, Treffpunktzeit – oder null"
}`;

const SYSTEM = `Du liest Reisebelege (Rechnungen, Buchungsbestätigungen, Quittungen) und gibst NUR ein JSON-Objekt zurück, ohne Erklärung:
${FIELDS}
Regeln: Nichts erfinden – fehlt etwas, null. Keine Ausweis-, Pass- oder Kartennummern, keine Geburtsdaten übernehmen. "paid" nur, wenn der Beleg eine erfolgte Zahlung zeigt (z. B. "bezahlt", "paid", "Zahlung erhalten", Quittung). Bei "zahlbar vor Ort" oder offener Rechnung "unpaid".`;

type Raw = Record<string, unknown>;

function parseJsonLoose(v: unknown): Raw | null {
  if (v && typeof v === 'object') return v as Raw;
  if (typeof v !== 'string') return null;
  const m = v.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as Raw;
  } catch {
    return null;
  }
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim().slice(0, 160) : null);
const time = (v: unknown) => {
  const s = str(v);
  return s && /^\d{1,2}:\d{2}$/.test(s) ? s.padStart(5, '0') : null;
};
const date = (v: unknown) => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

export function normalizeExtraction(raw: Raw | null): ExtractedDocument | null {
  if (!raw) return null;
  const currency = str(raw.currency)?.toUpperCase().replace('€', 'EUR').replace('฿', 'THB') ?? null;
  const cur = currency && isSupportedCurrency(currency) ? currency : null;
  let amountMinor: number | null = null;
  const total = typeof raw.total === 'number' ? raw.total : Number(String(raw.total ?? '').replace(/[^\d.]/g, ''));
  if (cur && Number.isFinite(total) && total > 0) amountMinor = Math.round(total * 10 ** currencyExponent(cur));
  const kind = str(raw.kind);
  const pay = str(raw.paymentStatus);
  const persons = Number(raw.personsCount);
  return {
    kind: kind && (BOOKING_TYPES as readonly string[]).includes(kind) ? (kind as ExtractedDocument['kind']) : null,
    title: str(raw.title),
    provider: str(raw.provider),
    reference: str(raw.reference),
    startDate: date(raw.startDate),
    endDate: date(raw.endDate),
    amountMinor,
    currency: cur,
    paymentStatus: pay === 'paid' || pay === 'unpaid' || pay === 'partial' ? pay : 'unknown',
    payerName: str(raw.payerName),
    personsCount: Number.isInteger(persons) && persons > 0 && persons < 100 ? persons : null,
    startTime: time(raw.startTime),
    endTime: time(raw.endTime),
    fromLocation: str(raw.fromLocation),
    toLocation: str(raw.toLocation),
    location: str(raw.location),
    flightNumber: str(raw.flightNumber)?.toUpperCase().slice(0, 12) ?? null,
    deadlines: str(raw.deadlines),
  };
}

/** Fallback when no model answer is available: references and totals by pattern. */
export function heuristicExtraction(text: string): ExtractedDocument {
  const ref = text.match(/(?:buchungs(?:nummer|nr\.?)|best[äa]tigungs(?:nummer|nr\.?)|booking (?:number|no\.?|id|reference)|confirmation (?:number|no\.?|code)|reservierungsnummer|reference)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,})/i);
  const tot = text.match(/(?:gesamt(?:betrag|preis)?|total|summe|amount due|endbetrag)[^\d€฿]{0,30}(€|EUR|THB|฿|USD|\$)?\s*([\d.,]+)\s*(€|EUR|THB|฿|USD)?/i);
  let amountMinor: number | null = null;
  let currency: string | null = null;
  if (tot) {
    const sym = (tot[1] ?? tot[3] ?? '').toUpperCase();
    currency = sym === '€' ? 'EUR' : sym === '฿' ? 'THB' : sym === '$' ? 'USD' : sym || null;
    const n = Number(tot[2].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    if (currency && Number.isFinite(n)) amountMinor = Math.round(n * 10 ** currencyExponent(currency));
  }
  const paid = /\b(bezahlt|paid|zahlung erhalten|payment received)\b/i.test(text) ? 'paid' : 'unknown';
  return { kind: null, title: null, provider: null, reference: ref?.[1] ?? null, startDate: null, endDate: null, amountMinor, currency, paymentStatus: paid, payerName: null, personsCount: null };
}

function merge(a: ExtractedDocument | null, b: ExtractedDocument): ExtractedDocument {
  if (!a) return b;
  return {
    ...a,
    reference: a.reference ?? b.reference,
    amountMinor: a.amountMinor ?? b.amountMinor,
    currency: a.currency ?? b.currency,
    paymentStatus: a.paymentStatus !== 'unknown' ? a.paymentStatus : b.paymentStatus,
  };
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function analyzeDocument(ai: Ai | undefined, file: { name: string; mime: string; bytes: Uint8Array }): Promise<ExtractedDocument | null> {
  if (!ai) return null;
  try {
    if (file.mime === 'application/pdf') {
      const md = await ai.toMarkdown({ name: file.name, blob: new Blob([file.bytes], { type: file.mime }) });
      const text = 'data' in md ? md.data.slice(0, 12000) : '';
      if (!text.trim()) return null;
      let parsed: ExtractedDocument | null = null;
      try {
        const out = (await ai.run(TEXT_MODEL as never, {
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: `Beleg:\n\n${text}` },
          ],
          max_tokens: 600,
        } as never)) as { response?: unknown };
        parsed = normalizeExtraction(parseJsonLoose(out.response));
      } catch {
        parsed = null;
      }
      return merge(parsed, heuristicExtraction(text));
    }
    if (file.mime.startsWith('image/')) {
      const out = (await ai.run(VISION_MODEL as never, {
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Lies diesen Beleg aus.' },
              { type: 'image_url', image_url: { url: `data:${file.mime};base64,${toBase64(file.bytes)}` } },
            ],
          },
        ],
        max_tokens: 600,
      } as never)) as { response?: unknown };
      return normalizeExtraction(parseJsonLoose(out.response));
    }
    return null;
  } catch (e) {
    // Never log document content – only that (and roughly why) it failed.
    console.error(JSON.stringify({ level: 'warn', msg: 'document analysis failed', error: e instanceof Error ? e.name : 'unknown' }));
    return null;
  }
}
