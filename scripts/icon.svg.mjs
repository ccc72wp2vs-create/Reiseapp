/** TRAVIO app icon ("T" as a route) as SVG (shared by favicon + PNG generation). */
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
    <!-- "T" whose crossbar is the travel route: start, stops, destination -->
    <path d="M130 176 Q 256 120 382 176" fill="none" stroke="#F8F6F1" stroke-width="20" stroke-linecap="round" stroke-dasharray="0.1 36"/>
    <circle cx="130" cy="176" r="28" fill="#F8F6F1"/>
    <circle cx="382" cy="176" r="28" fill="url(#ac)"/>
    <rect x="230" y="176" width="52" height="220" rx="26" fill="url(#ac)"/>
  </g>
</svg>`;
}
