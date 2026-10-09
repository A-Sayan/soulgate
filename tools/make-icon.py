"""
Soulgate uygulama simgesi üretici (geliştirme aracı; oyun bunu çalıştırmaz).
Logodaki "A" kapısını alır, iki yanına ona bağlı iki burç (yan kule) ekler.
Yazar: icons/icon.svg ve icons/icon-maskable.svg (PNG'ler bu ikisinden basılır).
Kullanım: python3 tools/make-icon.py
"""
import importlib.util
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('make_logo', os.path.join(HERE, 'make-logo.py'))
L = importlib.util.module_from_spec(spec)
spec.loader.exec_module(L)
poly, fmt, gate = L.poly, L.fmt, L.gate

# Kapı (font birimi; taban y=0, yukarısı eksi)
arch, body, rift, bars, GW = gate(0, 0)
CX = GW / 2

def merlons(x0, x1, top, h, n, w):
    gap = (x1 - x0 - n * w) / (n - 1)
    return ''.join(poly([(x0 + i * (w + gap), top + h), (x0 + i * (w + gap), top), (x0 + i * (w + gap) + w, top), (x0 + i * (w + gap) + w, top + h)]) for i in range(n))

def tower(x0, x1):
    """Mazgallı burç: gövde, korniş, mazgallar."""
    top = -600
    d = poly([(x0, 40), (x0, top), (x1, top), (x1, 40)])
    d += poly([(x0 - 22, top + 30), (x0 - 22, top - 10), (x1 + 22, top - 10), (x1 + 22, top + 30)])   # korniş
    d += merlons(x0 - 22, x1 + 22, top - 80, 72, 3, 64)
    return d

def wall(x0, x1):
    top = -300
    d = poly([(x0, 40), (x0, top), (x1, top), (x1, 40)])
    d += merlons(x0, x1, top - 54, 56, 3, 46)
    return d

LT = (-360, -120)                   # sol burç
RT = (GW + 120, GW + 360)           # sağ burç (simetrik)
towers = tower(*LT) + tower(*RT)
walls = wall(LT[1] - 10, 90) + wall(GW - 90, RT[0] + 10)
slits = ''
for x0, x1 in (LT, RT):
    mx = (x0 + x1) / 2
    for y0, y1 in ((-470, -360), (-250, -150)):
        slits += f'<rect x="{fmt(mx - 15)}" y="{fmt(y0)}" width="30" height="{fmt(y1 - y0)}" rx="15"/>'
ground = poly([(-560, 40), (GW + 560, 40), (GW + 560, 90), (-560, 90)])

# içerik sınırları: x −382..GW+382, y −775..90
MINX, MAXX, MINY, MAXY = -400, GW + 400, -790, 95

def art(rounded, safe):
    """safe: içeriğin sığacağı oran (maskable için ~0.72)."""
    w = MAXX - MINX
    h = MAXY - MINY
    s = 512 * safe / max(w, h)
    tx = 256 - (MINX + w / 2) * s
    ty = 256 - (MINY + h / 2) * s + 512 * 0.03
    radius = 104 if rounded else 0
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <!-- Soulgate simgesi: logodaki kapı + iki yan burç. tools/make-icon.py üretir. -->
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="72%">
      <stop offset="0" stop-color="#3b1419"/>
      <stop offset="0.45" stop-color="#170a0f"/>
      <stop offset="1" stop-color="#050407"/>
    </radialGradient>
    <radialGradient id="moon" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#c2412f" stop-opacity="0.9"/>
      <stop offset="0.55" stop-color="#7a1c1c" stop-opacity="0.6"/>
      <stop offset="1" stop-color="#3b1419" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="{fmt(MINY)}" x2="0" y2="40" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff6d8"/>
      <stop offset="0.36" stop-color="#f2c860"/>
      <stop offset="0.75" stop-color="#a8741f"/>
      <stop offset="1" stop-color="#5a3a0c"/>
    </linearGradient>
    <linearGradient id="goldDim" x1="0" y1="-360" x2="0" y2="40" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#d9a640"/>
      <stop offset="1" stop-color="#5e3b0e"/>
    </linearGradient>
    <radialGradient id="rift" cx="{fmt(CX)}" cy="-40" r="560" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff0d8"/>
      <stop offset="0.16" stop-color="#ffb08a"/>
      <stop offset="0.38" stop-color="#ff3b4e"/>
      <stop offset="0.75" stop-color="#8a0f22"/>
      <stop offset="1" stop-color="#2a0309"/>
    </radialGradient>
    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ff2a3c" stop-opacity="0.6"/>
      <stop offset="1" stop-color="#ff2a3c" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="frame"><rect width="512" height="512" rx="{radius}"/></clipPath>
  </defs>
  <g clip-path="url(#frame)">
    <rect width="512" height="512" fill="url(#bg)"/>
    <g transform="translate({fmt(tx)} {fmt(ty)}) scale({s:.5f})">
      <circle cx="{fmt(CX)}" cy="-520" r="560" fill="url(#moon)"/>
      <ellipse cx="{fmt(CX)}" cy="-260" rx="620" ry="460" fill="url(#halo)"/>
      <path d="{rift}" fill="url(#rift)"/>
      <g stroke="#1d1206" stroke-width="16" stroke-linejoin="round" paint-order="stroke">
        <path d="{walls}" fill="url(#goldDim)"/>
        <path d="{towers}" fill="url(#gold)"/>
        <path d="{bars}" fill="#2a1606" stroke="none" opacity="0.85"/>
        <path d="{arch}" fill="url(#gold)" fill-rule="evenodd"/>
        <path d="{body}" fill="url(#gold)"/>
      </g>
      <g fill="#ffb347">{slits}</g>
      <path d="{ground}" fill="#0c080a"/>
    </g>
  </g>
</svg>
'''

root = os.path.dirname(HERE)
open(os.path.join(root, 'icons', 'icon.svg'), 'w').write(art(True, 0.84))
open(os.path.join(root, 'icons', 'icon-square.svg'), 'w').write(art(False, 0.84))
open(os.path.join(root, 'icons', 'icon-maskable.svg'), 'w').write(art(False, 0.66))
print('yazıldı: icons/icon.svg, icon-square.svg, icon-maskable.svg')
