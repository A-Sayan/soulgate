/* ==========================================================================
 *  SOULGATE — art/kit.js
 *  Sorumluluk : Çizim takımı — ölçek (hücre başına piksel), tuval üretimi,
 *               hücre biriminde çizilen yüzeyler ve bütün çizim yardımcıları
 *               (gölgeli dolgu, dış çizgi, uzuv, parlayan çizgi, tuğla, sancak).
 *  Bağımlılık : utils (katman 0).
 *  Kullanan   : art/towers.js, art/enemies.js, art/maps.js, sprites.js.
 *
 *  Işık sol üstten (ay) gelir: üst-sol açık, alt-sağ koyu. Her silüetin
 *  koyu bir dış çizgisi vardır → karanlık zeminde okunur.
 * ========================================================================== */

import { TAU, rgba, shadeHex } from '../utils.js';

/* --------------------------------------------------------------------------
 * 1. ÖLÇEK VE TUVAL
 *  px: hücre başına piksel. Yalnızca sprites.js değiştirir (setPx).
 *  Diğer modüller canlı bağla okur: import { px } from './kit.js'.
 * ------------------------------------------------------------------------ */
export let px = 64;

/** Ölçeği değiştirir (sprites.js çağırır). */
export function setPx(v) {
  px = v;
}

export function makeCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

/** Hücre biriminde çizilen yüzey; (0,0) çapa noktasıdır. */
export function surface(w, h, ox, oy) {
  const c = makeCanvas(Math.max(1, Math.ceil(w * px)), Math.max(1, Math.ceil(h * px)));
  const g = c.getContext('2d');
  g.setTransform(px, 0, 0, px, ox * px, oy * px);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  return { c, g, w, h, ox, oy };
}

/* --------------------------------------------------------------------------
 * 2. ÇİZİM ARAÇLARI
 * ------------------------------------------------------------------------ */
export const INK = '#07050a';

export function P(build) {
  const p = new Path2D();
  build(p);
  return p;
}
export const ell = (cx, cy, rx, ry, rot = 0) => P((p) => p.ellipse(cx, cy, rx, ry, rot, 0, TAU));
export const circle = (cx, cy, r) => ell(cx, cy, r, r);

export function poly(pts) {
  return P((p) => {
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    p.closePath();
  });
}

/** Noktalardan geçen yumuşak kapalı eğri (organik gövdeler). */
export function blob(pts) {
  return P((p) => {
    const n = pts.length;
    const mid = (i) => [(pts[i][0] + pts[(i + 1) % n][0]) / 2, (pts[i][1] + pts[(i + 1) % n][1]) / 2];
    const m0 = mid(n - 1);
    p.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) {
      const m = mid(i);
      p.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
    }
    p.closePath();
  });
}

export function lin(g, x0, y0, x1, y1, stops) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}

export function rad(g, x, y, r, stops, r0 = 0) {
  const gr = g.createRadialGradient(x, y, r0, x, y, r);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}

/** Gölgeli dolgu + dış çizgi. box = [x, y, w, h] ışık yönü için. */
export function paint(g, path, color, box, opt = {}) {
  const { light = 0.28, dark = 0.5, line = 0.022, lineColor = INK, alpha = 1 } = opt;
  const [x, y, w, h] = box;
  g.fillStyle = lin(g, x, y, x + w * 0.6, y + h, [[0, shadeHex(color, light)], [0.55, color], [1, shadeHex(color, -dark)]]);
  g.globalAlpha = alpha;
  g.fill(path);
  g.globalAlpha = 1;
  if (line > 0) {
    g.lineWidth = line;
    g.strokeStyle = lineColor;
    g.stroke(path);
  }
}

export function fill(g, path, color, alpha = 1) {
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.fill(path);
  g.globalAlpha = 1;
}

export function line(g, pts, width, color, alpha = 1) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.globalAlpha = alpha;
  g.lineWidth = width;
  g.strokeStyle = color;
  g.stroke();
  g.globalAlpha = 1;
}

/** Yumuşak eğri çizgi (quadratic). */
export function curve(g, pts, width, color, alpha = 1) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const last = pts[pts.length - 1];
  g.lineTo(last[0], last[1]);
  g.globalAlpha = alpha;
  g.lineWidth = width;
  g.strokeStyle = color;
  g.stroke();
  g.globalAlpha = 1;
}

/** Dış çizgili uzuv: önce kalın koyu, sonra renkli. */
export function limb(g, pts, width, color, outline = 0.035) {
  curve(g, pts, width + outline, INK);
  curve(g, pts, width, color);
}

/** Parlayan çizgi (rünler, çatlaklar) — bulanıklık yalnızca çizimde, bir kez. */
export function glowLine(g, pts, width, color, blur = 0.08) {
  g.save();
  g.shadowColor = color;
  g.shadowBlur = blur * px;
  line(g, pts, width, color);
  g.restore();
}

export function glowFill(g, path, color, blur = 0.1, alpha = 1) {
  g.save();
  g.shadowColor = color;
  g.shadowBlur = blur * px;
  fill(g, path, color, alpha);
  g.restore();
}

export function softShadow(g, cx, cy, rx, ry, a = 0.5) {
  g.save();
  g.translate(cx, cy);
  g.scale(1, ry / rx);
  g.fillStyle = rad(g, 0, 0, rx, [[0, `rgba(0,0,0,${a})`], [0.6, `rgba(0,0,0,${a * 0.6})`], [1, 'rgba(0,0,0,0)']]);
  g.beginPath();
  g.arc(0, 0, rx, 0, TAU);
  g.fill();
  g.restore();
}

/** Göz çukuru — canlı göz parıltısı render'da bunun üstüne gelir. */
export function socket(g, x, y, r) {
  fill(g, ell(x, y, r * 1.25, r), '#050307');
}

/* --------------------------------------------------------------------------
 * 3. MALZEMELER VE ORTAK PARÇALAR
 * ------------------------------------------------------------------------ */
export const STONE = '#5b5560';
export const WOOD = '#5c4330';
export const IRON = '#3b3a42';
export const GOLD = '#c9a24a';
export const BONE = '#d9cfbf';

export function towerSurface() {
  return surface(1.3, 2.2, 0.65, 1.85);
}

export function bricks(g, x0, y0, x1, y1, rowH, color, alpha) {
  let row = 0;
  for (let y = y0 + rowH; y < y1 - 0.01; y += rowH) {
    line(g, [[x0, y], [x1, y]], 0.012, color, alpha);
    row++;
  }
  row = 0;
  for (let y = y0; y < y1 - 0.01; y += rowH) {
    const off = row % 2 === 0 ? 0 : rowH * 0.9;
    for (let x = x0 + off + rowH * 1.8; x < x1 - 0.02; x += rowH * 1.8) {
      line(g, [[x, y], [x, Math.min(y + rowH, y1)]], 0.012, color, alpha);
    }
    row++;
  }
}

export function banner(g, x, top, color, sigil) {
  const pole = [[x, top - 0.02], [x, top + 0.38]];
  const cloth = poly([[x - 0.09, top], [x + 0.09, top], [x + 0.09, top + 0.3], [x, top + 0.38], [x - 0.09, top + 0.3]]);
  line(g, pole, 0.02, INK);
  paint(g, cloth, color, [x - 0.09, top, 0.18, 0.38], { light: 0.2, dark: 0.55, line: 0.016 });
  if (sigil) sigil(g, x, top + 0.17);
}
