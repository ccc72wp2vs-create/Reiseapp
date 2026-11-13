"""Builds the TRAVIO app icons from scripts/assets/travio-icon-source.png.

Run: python3 scripts/generate-icons.py
"""
import base64
import io
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = Image.open(ROOT / 'scripts/assets/travio-icon-source.png').convert('RGB')
OUT = ROOT / 'public/icons'
NAVY = (16, 27, 51)


def rounded(img: Image.Image, radius: float = 0.225) -> Image.Image:
    size = img.size[0]
    mask = Image.new('L', (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=int(size * 4 * radius), fill=255)
    out = img.convert('RGBA')
    out.putalpha(mask.resize((size, size), Image.LANCZOS))
    return out


def sized(n: int) -> Image.Image:
    return SRC.resize((n, n), Image.LANCZOS)


# iOS home screen: full-bleed square, iOS applies its own corner mask
sized(180).save(OUT / 'apple-touch-icon.png', optimize=True)
# Manifest "any": rounded like on iOS
rounded(sized(192)).save(OUT / 'icon-192.png', optimize=True)
rounded(sized(512)).save(OUT / 'icon-512.png', optimize=True)
# Maskable: motif inside the 80 % safe zone on a navy background
mask = Image.new('RGB', (512, 512), NAVY)
inner = sized(410)
mask.paste(inner, ((512 - 410) // 2, (512 - 410) // 2))
mask.save(OUT / 'icon-maskable-512.png', optimize=True)
# Favicon (SVG wrapper around a small PNG keeps the existing <link>)
buf = io.BytesIO()
rounded(sized(64)).save(buf, format='PNG', optimize=True)
b64 = base64.b64encode(buf.getvalue()).decode()
(OUT / 'favicon.svg').write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="64" height="64" viewBox="0 0 64 64">'
    f'<image width="64" height="64" href="data:image/png;base64,{b64}"/></svg>\n'
)
print('icons written')
