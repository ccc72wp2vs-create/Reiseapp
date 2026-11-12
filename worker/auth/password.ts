/**
 * Password hashing with PBKDF2-HMAC-SHA256 via WebCrypto.
 * Cloudflare Workers cap PBKDF2 at 100 000 iterations, which is used here.
 * Format: pbkdf2-sha256$<iterations>$<salt b64url>$<hash b64url>
 */
import { fromBase64Url, timingSafeEqual, toBase64Url } from '../lib/util';

const ITERATIONS = 100_000;
const KEY_BITS = 256;
const enc = new TextEncoder();

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await derive(password, salt, ITERATIONS);
  return ['pbkdf2-sha256', ITERATIONS, toBase64Url(salt), toBase64Url(hash)].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > ITERATIONS) return false;
  const salt = fromBase64Url(parts[2]);
  const expected = fromBase64Url(parts[3]);
  const actual = await derive(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

// Used to keep response timing similar when an e-mail address is unknown.
const DUMMY_HASH = ['pbkdf2-sha256', '100000', 'AAAAAAAAAAAAAAAAAAAAAA', 'A'.repeat(43)].join('$');
export async function dummyVerify(password: string): Promise<void> {
  await verifyPassword(password, DUMMY_HASH);
}
