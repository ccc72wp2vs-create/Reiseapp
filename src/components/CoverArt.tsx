/**
 * Generative destination artwork. Gives every trip and destination an
 * editorial, photo-like hero without external image requests (works offline,
 * no tracking). User-provided https cover images take precedence.
 */
import { useState } from 'react';
import { cx } from './ui';

type Scene = 'city' | 'island' | 'karst' | 'mountains' | 'coast';

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function sceneFor(name: string): Scene {
  const n = name.toLowerCase();
  if (/(koh|ko |island|insel|lanta|samui|phi phi|tao|bali)/.test(n)) return 'island';
  if (/(krabi|ao nang|ha long|railay|phang)/.test(n)) return 'karst';
  if (/(chiang|pai|alp|berg|mountain|himalaya|nepal|tirol)/.test(n)) return 'mountains';
  if (/(phuket|beach|strand|küste|coast|algarve)/.test(n)) return 'coast';
  if (/(bangkok|tokyo|berlin|paris|city|stadt|singapur|hanoi|london|düsseldorf)/.test(n)) return 'city';
  return (['coast', 'island', 'karst', 'mountains', 'city'] as Scene[])[hash(n) % 5];
}

const SKIES: [string, string, string][] = [
  ['#1b2a4a', '#e0736a', '#f7c88b'],
  ['#0f2b46', '#3fa7a3', '#f5d29a'],
  ['#231c40', '#b4568a', '#f6a46b'],
  ['#0d2236', '#2f6f8f', '#e7c79b'],
  ['#1d2547', '#7b6fd0', '#f2b189'],
];

export function CoverArt({ name, imageUrl, className, label }: { name: string; imageUrl?: string | null; className?: string; label?: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  if (imageUrl && !imgFailed) {
    return (
      <div className={cx('relative overflow-hidden bg-surface-2', className)}>
        <img
          src={imageUrl}
          alt={label ?? ''}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
    );
  }
  const h = hash(name);
  const scene = sceneFor(name);
  const [top, mid, low] = SKIES[h % SKIES.length];
  const sunX = 90 + (h % 220);
  const sunY = 120 + ((h >> 5) % 40);
  const id = `c${h.toString(36)}`;
  return (
    <div className={cx('relative overflow-hidden', className)} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={top} />
            <stop offset="0.62" stopColor={mid} />
            <stop offset="1" stopColor={low} />
          </linearGradient>
          <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={mid} stopOpacity="0.9" />
            <stop offset="1" stopColor="#0b1524" />
          </linearGradient>
          <radialGradient id={`${id}g`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff7e0" stopOpacity="0.95" />
            <stop offset="0.35" stopColor={low} stopOpacity="0.6" />
            <stop offset="1" stopColor={low} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.4" stopColor="#0b1524" stopOpacity="0" />
            <stop offset="1" stopColor="#0b1524" stopOpacity="0.85" />
          </linearGradient>
        </defs>
        <rect width="400" height="300" fill={`url(#${id}s)`} />
        <circle cx={sunX} cy={sunY} r="90" fill={`url(#${id}g)`} />
        <circle cx={sunX} cy={sunY} r="22" fill="#fff4dc" opacity="0.92" />
        {scene === 'city' && <City />}
        {scene === 'island' && <Island h={h} id={id} />}
        {scene === 'karst' && <Karst id={id} />}
        {scene === 'mountains' && <Mountains />}
        {scene === 'coast' && <Coast id={id} />}
        <rect width="400" height="300" fill={`url(#${id}f)`} />
      </svg>
    </div>
  );
}

function Water({ id, y = 205 }: { id: string; y?: number }) {
  return (
    <g>
      <rect y={y} width="400" height={300 - y} fill={`url(#${id}w)`} />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={60 + i * 55} y={y + 12 + i * 14} width={80 - i * 8} height="1.6" rx="1" fill="#fff4dc" opacity={0.35 - i * 0.05} />
      ))}
    </g>
  );
}

function City() {
  return (
    <g>
      <path
        d="M0 230 V190 h18 v-22 h14 v22 h10 v-40 h20 v40 h8 v-28 h16 v28 h12 v-60 h6 v-8 h4 v8 h6 v60 h14 v-34 h22 v34 h10
           l8 -30 l4 -26 l3 -18 l3 18 l4 26 l8 30 h10 v-48 h18 v48 h12 v-20 h16 v20 h14 v-70 h24 v70 h10 v-30 h20 v30 h20 v-44 h16 v44 h12 V230 Z"
        fill="#0b1524"
        opacity="0.82"
      />
      <path d="M0 230 H400 V300 H0 Z" fill="#0b1524" opacity="0.9" />
      {[30, 90, 160, 250, 330].map((x, i) => (
        <rect key={i} x={x} y={240 + (i % 3) * 12} width={40 + i * 4} height="1.6" rx="1" fill="#f7c88b" opacity="0.35" />
      ))}
    </g>
  );
}

function Island({ h, id }: { h: number; id: string }) {
  const x = 150 + (h % 80);
  return (
    <g>
      <Water id={id} y={210} />
      <path d={`M${x - 120} 212 Q${x - 40} 170 ${x + 10} 178 Q${x + 70} 186 ${x + 140} 212 Z`} fill="#0b1524" opacity="0.88" />
      <path d={`M${x - 10} 182 q4 -30 -6 -54`} stroke="#0b1524" strokeWidth="4" fill="none" opacity="0.9" />
      <path
        d={`M${x - 16} 128 q-22 -6 -34 10 q18 -6 34 -10 q-10 -16 -30 -16 q20 0 30 16 q8 -18 28 -18 q-18 4 -28 18 q20 -4 34 10 q-20 -10 -34 -10 Z`}
        fill="#0b1524"
        opacity="0.9"
      />
    </g>
  );
}

function Karst({ id }: { id: string }) {
  return (
    <g>
      <Water id={id} y={215} />
      <path d="M40 216 C40 150 58 120 78 118 C98 120 104 160 106 216 Z" fill="#0b1524" opacity="0.7" />
      <path d="M250 216 C252 130 270 92 296 90 C322 94 330 150 334 216 Z" fill="#0b1524" opacity="0.85" />
      <path d="M318 216 C320 170 336 150 352 150 C368 152 372 190 374 216 Z" fill="#0b1524" opacity="0.6" />
      <path d="M150 216 C154 186 166 172 178 172 C190 174 194 196 196 216 Z" fill="#0b1524" opacity="0.55" />
      <path d="M120 236 l50 0 l-6 6 l-40 0 Z M150 236 v-16" stroke="#0b1524" strokeWidth="2.5" fill="#0b1524" opacity="0.9" />
    </g>
  );
}

function Mountains() {
  return (
    <g>
      <path d="M0 210 L60 160 L110 190 L170 130 L240 185 L300 150 L400 205 V300 H0 Z" fill="#0b1524" opacity="0.35" />
      <path d="M0 235 L70 190 L130 220 L200 170 L270 215 L340 185 L400 225 V300 H0 Z" fill="#0b1524" opacity="0.6" />
      <path d="M0 262 L90 225 L170 250 L250 222 L330 252 L400 240 V300 H0 Z" fill="#0b1524" opacity="0.9" />
      <path d="M196 172 l4 -14 l4 14 Z M193 172 h14 v6 h-14 Z" fill="#0b1524" opacity="0.8" />
    </g>
  );
}

function Coast({ id }: { id: string }) {
  return (
    <g>
      <Water id={id} y={200} />
      <path d="M0 200 C40 170 90 160 140 176 C180 188 200 196 230 200 Z" fill="#0b1524" opacity="0.8" />
      <path d="M0 300 V250 C80 236 180 238 260 256 C320 270 360 290 400 300 Z" fill="#f2d6a6" opacity="0.25" />
      <path d="M330 260 q2 -40 -10 -70" stroke="#0b1524" strokeWidth="4" fill="none" opacity="0.9" />
      <path
        d="M320 190 q-24 -4 -36 12 q18 -8 36 -12 q-12 -18 -32 -16 q20 2 32 16 q8 -20 30 -20 q-20 6 -30 20 q22 -2 34 14 q-20 -10 -34 -14 Z"
        fill="#0b1524"
        opacity="0.9"
      />
    </g>
  );
}

/** TRAVIO wordmark + compass-sun symbol. */
export function Logo({ size = 28, withWordmark = true, className }: { size?: number; withWordmark?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2.5', className)}>
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <defs>
          <linearGradient id="travio-logo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5ee3cf" />
            <stop offset="1" stopColor="#1fae98" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="18" fill="#0b1524" />
        <circle cx="32" cy="34" r="15" fill="none" stroke="url(#travio-logo)" strokeWidth="4" />
        <path d="M32 12 L36 30 L32 34 L28 30 Z" fill="#f8f6f1" />
        <path d="M32 56 L28 38 L32 34 L36 38 Z" fill="url(#travio-logo)" />
        <path d="M10 46 C22 40 42 40 54 46" stroke="#f8f6f1" strokeOpacity="0.5" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </svg>
      {withWordmark && <span className="font-display text-[22px] font-semibold tracking-[0.18em]">TRAVIO</span>}
    </span>
  );
}
