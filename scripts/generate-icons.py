"""Builds the TRAVIO app icons from scripts/assets/travio-icon-source.png
(a 1024 px render of scripts/assets/travio-icon.svg).

Run: python3 scripts/generate-icons.py
"""
import base64
import io
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = Image.open(ROOT / 'scripts/assets/travio-icon-source.png').convert('RGB')
OUT = ROOT / 'public/icons'


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
# Maskable: the motif already sits inside the 80 % safe zone → full bleed
sized(512).save(OUT / 'icon-maskable-512.png', optimize=True)
# Favicon: the vector source with rounded corners (sharp at any size)
svg = (ROOT / 'scripts/assets/travio-icon.svg').read_text()
svg = svg.replace('<rect width="512" height="512" fill="url(#bg)"/>', '<rect width="512" height="512" rx="115" fill="url(#bg)"/>')
(OUT / 'favicon.svg').write_text(svg)
print('icons written')
