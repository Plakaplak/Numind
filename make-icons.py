#!/usr/bin/env python3
"""Membuat ikon aplikasi dari huruf "n" pada logo Numind.

Bentuk huruf ditulis sebagai path vektor (dicocokkan dengan logo asli, kecocokan 99,7%),
sehingga ikon tajam di semua ukuran. Jalankan dari folder kasproyek:

    python3 tools/make-icons.py

Ganti BG / FG di bawah untuk mengubah warna. Butuh Pillow.
"""
import math
from PIL import Image, ImageDraw

BG = (0, 71, 55)       # #004737, hijau tua dari logo Numind
FG = (242, 180, 46)    # #F2B42E, emas dari logo Numind
BG_HEX, FG_HEX = '#004737', '#F2B42E'

# Huruf "n" dalam kotak 1021 x 1021
PATH = ('M0,1021 V466 A466,466 0 0 1 466,0 H555 A466,466 0 0 1 1021,466 '
        'V1021 H760 V497 A249.5,249.5 0 0 0 261,497 V1021 Z')


def _arc(cx, cy, r, a0, a1, n=240):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def glyph_points():
    W, R, SW, ICY = 1021, 466, 261, 497
    ir = (W - 2 * SW) / 2
    pts = [(0, W), (0, R)] + _arc(R, R, R, 180, 270) + [(W - R, 0)] + _arc(W - R, R, R, 270, 360)
    pts += [(W, W), (W - SW, W), (W - SW, ICY)] + _arc(W / 2, ICY, ir, 0, -180) + [(SW, W)]
    return pts


def render(size, glyph_ratio, radius_ratio, out, flat=False):
    S = 8  # supersampling
    N = size * S
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if radius_ratio == 0:
        d.rectangle([0, 0, N, N], fill=BG + (255,))
    else:
        d.rounded_rectangle([0, 0, N - 1, N - 1], radius=int(N * radius_ratio), fill=BG + (255,))
    g = N * glyph_ratio
    k = g / 1021
    off = (N - g) / 2
    d.polygon([(off + x * k, off + y * k) for x, y in glyph_points()], fill=FG + (255,))
    img = img.resize((size, size), Image.LANCZOS)
    if flat:  # tanpa transparansi (apple-touch-icon)
        img = img.convert('RGB')
    img.save(out, optimize=True)


def svg_icon(path, glyph_ratio=0.5, radius=112):
    g = 512 * glyph_ratio
    k = g / 1021
    off = (512 - g) / 2
    open(path, 'w').write(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
        f'<rect width="512" height="512" rx="{radius}" fill="{BG_HEX}"/>'
        f'<path transform="translate({off:g} {off:g}) scale({k:.5f})" fill="{FG_HEX}" d="{PATH}"/></svg>\n')


if __name__ == '__main__':
    render(192, 0.50, 0.22, 'icons/icon-192.png')
    render(512, 0.50, 0.22, 'icons/icon-512.png')
    render(512, 0.44, 0, 'icons/icon-maskable-512.png')      # area aman maskable: lingkaran 80%
    render(180, 0.50, 0, 'icons/apple-touch-icon.png', flat=True)
    render(32, 0.58, 0.22, 'icons/favicon-32.png')
    svg_icon('icons/icon.svg')
    open('img/numind-mark.svg', 'w').write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1021 1021"><path fill="{FG_HEX}" d="{PATH}"/></svg>\n')
    print('ikon dibuat')
