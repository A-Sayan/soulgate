"""
Soulgate logosu üretici (geliştirme aracı; oyun bunu çalıştırmaz).
Cinzel (SIL OFL 1.1) harflerinin dış hatlarını alır, "A" harfinin yerine
el çizimi bir ruh kapısı koyar ve icons/logo.svg dosyasını yazar.
Gerekenler: Python 3 + fonttools, Cinzel[wght].ttf (github.com/google/fonts, ofl/cinzel).
Kullanım: python3 tools/make-logo.py <Cinzel[wght].ttf yolu> [çıktı.svg]
"""
import math, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen


def instance(wght):
    return instancer.instantiateVariableFont(TTFont(FONT), {'wght': wght})

FONT = None
OUT = 'icons/logo.svg'

def glyph_path(font, ch, x, base, scale=1.0):
    """Harfi (x, base) noktasına yerleştirir; font y-yukarı → SVG y-aşağı."""
    gs = font.getGlyphSet()
    g = gs[font.getBestCmap()[ord(ch)]]
    pen = SVGPathPen(gs, ntos=lambda v: f'{v:.1f}'.rstrip('0').rstrip('.'))
    g.draw(TransformPen(pen, (scale, 0, 0, -scale, x, base)))
    return pen.getCommands(), g.width * scale

def fmt(v):
    return f'{v:.1f}'.rstrip('0').rstrip('.')

def arc_pts(cx, cy, r, a0, a1, n=28):
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / n), cy + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]

def poly(pts, close=True):
    d = 'M' + ' L'.join(f'{fmt(x)} {fmt(y)}' for x, y in pts)
    return d + ('Z' if close else '')

def gate(x, base):
    """
    "A" yerine sivri kemerli bir kapı (font birimleri, y yukarı → burada çevrilir).
    Dış kemer genişliği W, yükseklik H; bacak kalınlığı T.
    Dönüş: (gövde yolu, iç boşluk yolu, kapı içi yolu, parmaklık yolu, genişlik)
    """
    W, H, T = 730.0, 712.0, 168.0
    R = (H * H + (W / 2) ** 2) / W            # sivri kemer yarıçapı
    cL, cR = R, W - R                          # sol kemerin merkezi x=R, sağınki x=W-R
    def P(px, py):                             # font → svg
        return (x + px, base - py)
    # dış hat: sol taban → tepe → sağ taban
    aL0 = math.pi; aL1 = math.acos((W / 2 - cL) / R)
    outerL = [P(cL + R * math.cos(a), R * math.sin(a)) for a in [aL0 + (aL1 - aL0) * i / 32 for i in range(33)]]
    aR0 = math.acos((W / 2 - cR) / R); aR1 = 0
    outerR = [P(cR + R * math.cos(a), R * math.sin(a)) for a in [aR0 + (aR1 - aR0) * i / 32 for i in range(33)]]
    # iç hat (kalınlık T kadar içeride, aynı merkezler)
    r = R - T
    hi = math.sqrt(r * r - (W / 2 - cL) ** 2)  # iç tepe yüksekliği
    iL1 = math.acos((W / 2 - cL) / r)
    innerL = [P(cL + r * math.cos(a), r * math.sin(a)) for a in [math.pi + (iL1 - math.pi) * i / 32 for i in range(33)]]
    iR0 = math.acos((W / 2 - cR) / r)
    innerR = [P(cR + r * math.cos(a), r * math.sin(a)) for a in [iR0 + (0 - iR0) * i / 32 for i in range(33)]]
    # kemer = dış kemer − iç kemer (evenodd); kaide, kilit taşı ve kiriş ayrı yolda (nonzero)
    arch = poly(outerL + outerR) + poly(innerL + innerR)
    # taban kaideleri ve kilit taşı
    plinth = 42
    body = poly([P(-46, 0), P(T + 40, 0), P(T + 28, plinth), P(-34, plinth)])
    body += poly([P(W - T - 40, 0), P(W + 46, 0), P(W + 34, plinth), P(W - T - 28, plinth)])
    body += poly([P(W / 2 - 58, H - 70), P(W / 2 + 58, H - 70), P(W / 2 + 36, H + 58), P(W / 2 - 36, H + 58)])
    # yatay kiriş (A'nın çizgisi) — iç kemerin içinde
    yb0, yb1 = 236, 318
    def inner_x(y):                              # iç kemerin y yüksekliğindeki sol x'i
        return cL - math.sqrt(r * r - y * y)
    bar = poly([P(inner_x(yb0) - 4, yb0), P(W - inner_x(yb0) + 4, yb0), P(W - inner_x(yb1) + 4, yb1), P(inner_x(yb1) - 4, yb1)])
    # kapı içi (kızıl yarık): iç kemerin tamamı
    rift = poly(innerL + innerR)
    # parmaklık: kirişin altında dikey çubuklar
    bars = ''
    for i in range(1, 4):
        bx = inner_x(0) + (W - 2 * inner_x(0)) * i / 4
        bars += poly([P(bx - 11, 0), P(bx + 11, 0), P(bx + 11, yb0), P(bx - 11, yb0)])
    return arch, body + bar, rift, bars, W

def build():
    f900 = instance(900)
    f700 = instance(700)
    track = 46
    cap = 700
    # 1. satır: SOUL
    line1, x = [], 0.0
    for ch in 'SOUL':
        d, adv = glyph_path(f900, ch, x, cap)
        line1.append(d); x += adv + track
    w1 = x - track
    # 2. satır: G [kapı] T E  — "A" yerine kapı
    gap = 190
    base2 = cap + gap + cap
    line2, x2 = [], 0.0
    d, adv = glyph_path(f900, 'G', x2, base2); line2.append(d); x2 += adv + track + 10
    gate_x = x2 + 6
    arch, body, rift, bars, gw = gate(gate_x, base2)
    x2 += gw + track + 4
    for ch in 'TE':
        d, adv = glyph_path(f900, ch, x2, base2)
        line2.append(d); x2 += adv + track
    w2 = x2 - track
    # alt yazı: TOWER DEFENSE (ince, geniş aralıklı)
    sub_scale = 0.205
    sub_track = 150 * sub_scale * 2.7
    sub_parts, xs = [], 0.0
    sub_base = base2 + 300
    for ch in 'TOWER DEFENSE':
        if ch == ' ':
            xs += 260 * sub_scale + sub_track
            continue
        d, adv = glyph_path(f700, ch, xs, sub_base, sub_scale)
        sub_parts.append(d); xs += adv + sub_track
    ws = xs - sub_track
    W = max(w1, w2) + 260
    off1, off2, offs = (W - w1) / 2, (W - w2) / 2, (W - ws) / 2
    H = sub_base + 120
    top = -140
    # süs çizgileri (alt yazının iki yanında)
    rule_y = sub_base - 0.36 * 700 * sub_scale * 1.0
    rl = offs - 70
    rr = offs + ws + 70
    rules = (f'M{fmt(130)} {fmt(rule_y)}H{fmt(rl - 34)}M{fmt(rr + 34)} {fmt(rule_y)}H{fmt(W - 130)}')
    diamonds = ''.join(poly([(cx - 22, rule_y), (cx, rule_y - 22), (cx + 22, rule_y), (cx, rule_y + 22)]) for cx in (rl, rr))
    gold = 'url(#gold)'
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {top} {fmt(W)} {fmt(H - top)}" role="img" aria-label="Soulgate: Tower Defense">
  <!-- Soulgate logosu. Harfler: Cinzel (SIL Open Font License 1.1), kapı: el çizimi. tools/make-logo.py üretir. -->
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff6d8"/>
      <stop offset="0.36" stop-color="#f2c860"/>
      <stop offset="0.72" stop-color="#a8741f"/>
      <stop offset="1" stop-color="#5a3a0c"/>
    </linearGradient>
    <linearGradient id="gold2" x1="0" y1="{fmt(cap + gap - 40)}" x2="0" y2="{fmt(base2 + 60)}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff6d8"/>
      <stop offset="0.36" stop-color="#f2c860"/>
      <stop offset="0.72" stop-color="#a8741f"/>
      <stop offset="1" stop-color="#5a3a0c"/>
    </linearGradient>
    <radialGradient id="rift" cx="{fmt(gate_x + gw / 2)}" cy="{fmt(base2 - 40)}" r="560" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff0d8"/>
      <stop offset="0.16" stop-color="#ffb08a"/>
      <stop offset="0.38" stop-color="#ff3b4e"/>
      <stop offset="0.75" stop-color="#8a0f22"/>
      <stop offset="1" stop-color="#2a0309"/>
    </radialGradient>
    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ff2a3c" stop-opacity="0.55"/>
      <stop offset="0.5" stop-color="#ff2a3c" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#ff2a3c" stop-opacity="0"/>
    </radialGradient>
    <filter id="lift" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="26" stdDeviation="10" flood-color="#000" flood-opacity="0.85"/>
      <feDropShadow dx="0" dy="0" stdDeviation="60" flood-color="#ff963c" flood-opacity="0.22"/>
    </filter>
    <style>
      .flicker {{ animation: flicker 3.4s ease-in-out infinite; transform-origin: center; }}
      @keyframes flicker {{ 0%, 100% {{ opacity: 0.78; }} 30% {{ opacity: 1; }} 55% {{ opacity: 0.86; }} 75% {{ opacity: 0.98; }} }}
      @media (prefers-reduced-motion: reduce) {{ .flicker {{ animation: none; opacity: 0.9; }} }}
    </style>
  </defs>
  <ellipse class="flicker" cx="{fmt(off2 + gate_x + gw / 2)}" cy="{fmt(base2 - 330)}" rx="760" ry="620" fill="url(#halo)"/>
  <g transform="translate({fmt(off2)} 0)">
    <path d="{rift}" fill="url(#rift)"/>
    <path class="flicker" d="{rift}" fill="url(#rift)" opacity="0.9"/>
  </g>
  <g filter="url(#lift)" stroke="#1d1206" stroke-width="12" stroke-linejoin="round" paint-order="stroke">
    <path transform="translate({fmt(off1)} 0)" d="{''.join(line1)}" fill="{gold}"/>
    <g transform="translate({fmt(off2)} 0)" fill="url(#gold2)">
      <path d="{''.join(line2)}"/>
      <path d="{bars}" fill="#2a1606" stroke="none" opacity="0.85"/>
      <path d="{arch}" fill-rule="evenodd"/>
      <path d="{body}"/>
    </g>
  </g>
  <g fill="#e8b84a">
    <path transform="translate({fmt(offs)} 0)" d="{''.join(sub_parts)}"/>
    <path d="{diamonds}"/>
  </g>
  <path d="{rules}" stroke="#e8b84a" stroke-opacity="0.55" stroke-width="8" fill="none"/>
</svg>
'''
    open(OUT, 'w').write(svg)
    print(f'yazıldı: {OUT}  {len(svg) / 1024:.1f} KB  oran {(H - top) / W:.3f}')

if __name__ == '__main__':
    FONT = sys.argv[1]
    OUT = sys.argv[2] if len(sys.argv) > 2 else OUT
    build()
