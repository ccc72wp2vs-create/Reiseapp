/** TRAVIO app icon as SVG (shared by favicon + PNG generation). */
export function iconSvg({ rounded = true, scale = 1 } = {}) {
  const r = rounded ? 116 : 0;
  const s = scale;
  const c = 256;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#142338"/>
      <stop offset="1" stop-color="#0B1524"/>
    </linearGradient>
    <linearGradient id="ac" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5EE3CF"/>
      <stop offset="1" stop-color="#1FAE98"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.5">
      <stop offset="0" stop-color="#35D6BE" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#35D6BE" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="${r}" fill="url(#bg)"/>
  <rect width="512" height="512" rx="${r}" fill="url(#glow)"/>
  <g transform="translate(${c * (1 - s)} ${c * (1 - s)}) scale(${s})">
    <circle cx="256" cy="272" r="118" fill="none" stroke="url(#ac)" stroke-width="30"/>
    <path d="M256 96 L288 240 L256 272 L224 240 Z" fill="#F8F6F1"/>
    <path d="M256 448 L224 304 L256 272 L288 304 Z" fill="url(#ac)"/>
    <path d="M86 372 C182 324 330 324 426 372" stroke="#F8F6F1" stroke-opacity="0.5" stroke-width="18" fill="none" stroke-linecap="round"/>
  </g>
</svg>`;
}
