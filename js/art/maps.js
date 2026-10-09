/* ==========================================================================
 *  SOULGATE — art/maps.js
 *  Sorumluluk : Harita katmanı — zemin, yol(lar), kurulabilir karo izleri,
 *               süsler, kale ve geçit(ler) TEK bir tuvalde birleşir: render
 *               her karede yalnızca bir drawImage yapar. Tuval ızgaranın bir
 *               satır üstünden başlar (geçit oradan gelir).
 *  Bağımlılık : utils (0) · art/kit.
 *
 *  TEMA: map.theme (content/chapters.js) zeminin, yolun ve geçidin
 *  renklerini verir; theme.ambient zemine bölüme özgü ayrıntılar ekler
 *  ('ash' kül vadisi · 'snow' kar ve buz · 'firefly' bataklık suları ·
 *  'ember' lav çatlakları · 'void' boşluk yarıkları ve yıldız tozu).
 *  lights: titreyen ışıkların listesi (mum, meşale, pencere, geçit, lav…).
 * ========================================================================== */

import { TAU, rgba, shadeHex, mixHex, createRng, hashString, hash2 } from '../utils.js';
import {
  px, surface, INK, STONE, WOOD, IRON, GOLD, BONE, P, ell, circle, poly, blob, lin, rad, paint, fill, line, curve, limb, glowLine, glowFill, softShadow, socket, towerSurface, bricks, banner,
} from './kit.js';

export const TOP_MARGIN = 1;

/** Haritanın zemin katmanını çizer: { c, w, h, ox, oy, lights } */
export function buildMapLayer(map) {
  const s = surface(map.cols, map.rows + TOP_MARGIN, 0, TOP_MARGIN);
  const g = s.g;
  const r = createRng(hashString(map.id));
  const lights = [];
  const th = map.theme;

  drawGround(g, map, r, th);
  drawGroundExtras(g, map, r, th, lights);
  drawBuildTiles(g, map);
  drawPath(g, map, r, th, lights);
  drawPathEdges(g, map, r, th);
  const sorted = [...map.decor].sort((a, b) => a.r - b.r);
  for (const d of sorted) DECOR[d.kind]?.(g, d.c + 0.5, d.r + 0.5, r, lights, th);
  for (const pl of map.polys) drawPortal(g, pl, th, lights);
  drawCastle(g, map, lights);
  if (th.ambient === 'snow') snowOnCastle(g, map);
  return { ...s, lights };
}

function drawGround(g, map, r, th) {
  const W = map.cols;
  const H = map.rows;
  g.fillStyle = lin(g, 0, -TOP_MARGIN, 0, H, [[0, th.ground[0]], [0.35, th.ground[1]], [1, th.ground[2]]]);
  g.fillRect(0, -TOP_MARGIN, W, H + TOP_MARGIN);
  for (let y = -TOP_MARGIN; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = hash2(x, y, 7);
      fill(g, poly([[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]]), v > 0.5 ? '#ffffff' : '#000000', Math.abs(v - 0.5) * 0.07);
    }
  }
  // lekeler ve benekler
  for (let i = 0; i < 70; i++) {
    const x = r.range(0, W);
    const y = r.range(-TOP_MARGIN, H);
    g.fillStyle = rad(g, x, y, r.range(0.4, 1.2), [[0, rgba(r.chance(0.5) ? th.blotch[0] : th.blotch[1], 0.35)], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(x - 1.3, y - 1.3, 2.6, 2.6);
  }
  for (let i = 0; i < 1600; i++) {
    const x = r.range(0, W);
    const y = r.range(-TOP_MARGIN, H);
    fill(g, circle(x, y, r.range(0.006, 0.02)), r.chance(0.6) ? th.speck[0] : th.speck[1], r.range(0.25, 0.6));
  }
  // ot öbekleri
  for (let i = 0; i < 140; i++) tuft(g, r.range(0, W), r.range(-TOP_MARGIN, H), r, th);
}

function tuft(g, x, y, r, th) {
  const n = r.int(3, 5);
  const c = r.chance(0.5) ? th.tuft[0] : th.tuft[1];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + r.spread(0, 0.7);
    const l = r.range(0.06, 0.13);
    curve(g, [[x, y], [x + Math.cos(a) * l * 0.5 + 0.01, y + Math.sin(a) * l * 0.5], [x + Math.cos(a) * l, y + Math.sin(a) * l]], 0.012, c, 0.85);
  }
}

/** Nokta herhangi bir yolun yüzeyinde mi? (süslerin yola taşmaması için) */
function onRoad(map, x, y, margin = 0.42, except = null) {
  for (const pl of map.polys) {
    if (pl === except) continue;
    for (const sg of pl.segs) {
      const t = Math.max(0, Math.min(sg.len, (x - sg.x1) * sg.dx + (y - sg.y1) * sg.dy));
      const qx = sg.x1 + sg.dx * t;
      const qy = sg.y1 + sg.dy * t;
      if ((x - qx) ** 2 + (y - qy) ** 2 < margin * margin) return true;
    }
  }
  return false;
}

/* — Bölüme özgü zemin ayrıntıları (yolun altında kalır) — */
function drawGroundExtras(g, map, r, th, lights) {
  const W = map.cols;
  const H = map.rows;
  switch (th.ambient) {
    case 'snow': {
      // kar örtüsü: yumuşak beyaz lekeler ve parıltılar
      for (let i = 0; i < 46; i++) {
        const x = r.range(0, W);
        const y = r.range(-TOP_MARGIN, H);
        const rr = r.range(0.5, 1.3);
        g.fillStyle = rad(g, x, y, rr, [[0, 'rgba(214,232,248,0.22)'], [0.6, 'rgba(190,214,236,0.1)'], [1, 'rgba(0,0,0,0)']]);
        g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
      for (let i = 0; i < 220; i++) fill(g, circle(r.range(0, W), r.range(-TOP_MARGIN, H), r.range(0.008, 0.02)), '#eaf6ff', r.range(0.3, 0.8));
      // buz çatlakları
      for (let i = 0; i < 12; i++) {
        let x = r.range(0, W);
        let y = r.range(0, H);
        const pts = [[x, y]];
        for (let k = 0; k < 4; k++) {
          x += r.spread(0, 0.35);
          y += r.spread(0, 0.35);
          pts.push([x, y]);
        }
        line(g, pts, 0.012, '#9fd2f0', 0.35);
      }
      break;
    }
    case 'firefly': {
      // bataklık suyu birikintileri ve yosun
      for (let i = 0; i < 18; i++) {
        const x = r.range(0, W);
        const y = r.range(0, H);
        if (onRoad(map, x, y, 0.7)) continue;
        const rx = r.range(0.25, 0.55);
        const ry = rx * r.range(0.45, 0.6);
        g.fillStyle = rad(g, x, y, rx * 1.4, [[0, 'rgba(10,22,14,0.55)'], [1, 'rgba(0,0,0,0)']]);
        g.fillRect(x - rx * 1.5, y - rx * 1.5, rx * 3, rx * 3);
        fill(g, ell(x, y, rx, ry), '#0c1a12', 0.85);
        line(g, [[x - rx * 0.5, y - ry * 0.35], [x + rx * 0.2, y - ry * 0.45]], 0.014, '#4a6a4a', 0.5);
      }
      for (let i = 0; i < 60; i++) {
        const x = r.range(0, W);
        const y = r.range(-TOP_MARGIN, H);
        fill(g, blob([[x - 0.12, y], [x, y - 0.06], [x + 0.14, y - 0.01], [x + 0.03, y + 0.05]]), '#24361a', r.range(0.3, 0.6));
      }
      break;
    }
    case 'ember': {
      // lavın ısıttığı çatlaklar: koyu bazalt arasında kor
      for (let i = 0; i < 22; i++) {
        let x = r.range(0, W);
        let y = r.range(-0.5, H);
        const pts = [[x, y]];
        for (let k = 0; k < 5; k++) {
          x += r.spread(0, 0.45);
          y += r.spread(0, 0.45);
          pts.push([x, y]);
        }
        line(g, pts, 0.05, '#0a0404', 0.8);
        glowLine(g, pts, 0.014, r.chance(0.5) ? '#ff6a1a' : '#ff3a0a', 0.06);
      }
      for (let i = 0; i < 30; i++) {
        const x = r.range(0, W);
        const y = r.range(-TOP_MARGIN, H);
        g.fillStyle = rad(g, x, y, 0.6, [[0, 'rgba(255,90,20,0.08)'], [1, 'rgba(0,0,0,0)']]);
        g.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
      }
      break;
    }
    case 'void': {
      // yıldız tozu ve boşluğa açılan ince yarıklar
      for (let i = 0; i < 260; i++) {
        const x = r.range(0, W);
        const y = r.range(-TOP_MARGIN, H);
        fill(g, circle(x, y, r.range(0.005, 0.016)), r.chance(0.3) ? '#e6c8ff' : '#8a6ac8', r.range(0.3, 0.9));
      }
      for (let i = 0; i < 10; i++) {
        let x = r.range(0, W);
        let y = r.range(0, H);
        const pts = [[x, y]];
        for (let k = 0; k < 4; k++) {
          x += r.spread(0, 0.5);
          y += r.spread(0, 0.5);
          pts.push([x, y]);
        }
        line(g, pts, 0.045, '#020104', 0.9);
        glowLine(g, pts, 0.012, '#a04aff', 0.07);
      }
      break;
    }
    default:
      break;
  }
}

/** Kurulabilir hücrelerde soluk taş karo — oyuncu nereye kule dikebileceğini görür. */
function drawBuildTiles(g, map) {
  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.cols; x++) {
      if (map.cells[y * map.cols + x] !== 0) continue;
      const i = 0.08;
      const tile = P((p) => p.roundRect(x + i, y + i, 1 - i * 2, 1 - i * 2, 0.08));
      fill(g, tile, '#ffffff', 0.025);
      g.lineWidth = 0.02;
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.stroke(tile);
      line(g, [[x + i + 0.06, y + i], [x + 1 - i - 0.06, y + i]], 0.012, '#ffffff', 0.04);
    }
  }
}

function pathStroke(g, pts, width, color, alpha = 1) {
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.globalAlpha = alpha;
  g.lineWidth = width;
  g.strokeStyle = color;
  g.lineJoin = 'round';
  g.lineCap = 'butt';
  g.stroke();
  g.globalAlpha = 1;
  g.lineCap = 'round';
}

/** Bütün yolların parçaları (ortak parçalar bir kez). */
function uniqueSegments(map) {
  const seen = new Set();
  const out = [];
  for (const pl of map.polys) {
    for (const sg of pl.segs) {
      const key = `${sg.x1},${sg.y1},${sg.x2},${sg.y2}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(sg);
    }
  }
  return out;
}

/**
 * Yollar katman katman çizilir: önce bütün yolların gölgesi, sonra kenarı,
 * sonra dolgusu. Böylece iki yolun birleştiği yerde biri ötekinin üstüne
 * koyu bir çizgi bırakmaz.
 */
function drawPath(g, map, r, th, lights) {
  const P2 = th.path;
  const pass = (width, color, alpha) => { for (const pl of map.polys) pathStroke(g, pl.points, width, color, alpha); };
  pass(1.06, '#000000', 0.5);
  pass(0.96, P2.outer, 1);
  pass(0.84, P2.fill, 1);
  pass(0.42, '#000000', 0.12); // ortası aşınmış, koyu
  // parke taşları — yol boyunca
  const segs = uniqueSegments(map);
  for (const sg of segs) {
    const n = Math.floor(sg.len * 22);
    for (let i = 0; i < n; i++) {
      const t = r.range(0, sg.len);
      const off = r.spread(0, 0.38);
      const x = sg.x1 + sg.dx * t - sg.dy * off;
      const y = sg.y1 + sg.dy * t + sg.dx * off;
      const rr = r.range(0.035, 0.075);
      const col = r.chance(0.55) ? P2.stone[0] : P2.stone[1];
      paint(g, ell(x, y, rr, rr * 0.75, r.range(0, TAU)), col, [x - rr, y - rr, rr * 2, rr * 2], { light: 0.25, dark: 0.3, line: 0.008, lineColor: 'rgba(0,0,0,0.6)', alpha: 0.75 });
    }
  }
  pathExtras(g, segs, r, th, lights);
}

/** Bölüme özgü yol ayrıntıları: kar izi, çamur birikintisi, kor çatlağı, rün. */
function pathExtras(g, segs, r, th, lights) {
  switch (th.ambient) {
    case 'snow':
      for (const sg of segs) {
        for (let t = 0.2; t < sg.len; t += r.range(0.5, 0.9)) {
          const off = r.spread(0, 0.25);
          const x = sg.x1 + sg.dx * t - sg.dy * off;
          const y = sg.y1 + sg.dy * t + sg.dx * off;
          g.fillStyle = rad(g, x, y, 0.3, [[0, 'rgba(226,240,252,0.32)'], [1, 'rgba(226,240,252,0)']]);
          g.fillRect(x - 0.3, y - 0.3, 0.6, 0.6);
        }
      }
      break;
    case 'firefly':
      for (const sg of segs) {
        for (let t = 0.4; t < sg.len; t += r.range(1.2, 2.2)) {
          const off = r.spread(0, 0.2);
          const x = sg.x1 + sg.dx * t - sg.dy * off;
          const y = sg.y1 + sg.dy * t + sg.dx * off;
          const rx = r.range(0.14, 0.26);
          fill(g, ell(x, y, rx, rx * 0.55), '#0a140e', 0.85);
          line(g, [[x - rx * 0.5, y - rx * 0.18], [x + rx * 0.1, y - rx * 0.24]], 0.012, '#5a7a5a', 0.6);
        }
      }
      break;
    case 'ember':
      for (const sg of segs) {
        for (let t = 0.3; t < sg.len; t += r.range(0.8, 1.4)) {
          const off = r.spread(0, 0.22);
          const x = sg.x1 + sg.dx * t - sg.dy * off;
          const y = sg.y1 + sg.dy * t + sg.dx * off;
          const a = r.range(0, TAU);
          const pts = [[x, y], [x + Math.cos(a) * 0.12, y + Math.sin(a) * 0.12], [x + Math.cos(a + 0.6) * 0.22, y + Math.sin(a + 0.6) * 0.2]];
          glowLine(g, pts, 0.016, '#ff7a2a', 0.05);
        }
      }
      break;
    case 'void':
      for (const sg of segs) {
        for (let t = 0.5; t < sg.len; t += r.range(1.4, 2.4)) {
          const x = sg.x1 + sg.dx * t;
          const y = sg.y1 + sg.dy * t;
          // yolun ortasında soluk rün
          glowLine(g, [[x - 0.1, y], [x, y - 0.1], [x + 0.1, y], [x, y + 0.1], [x - 0.1, y]], 0.012, '#9a5aff', 0.06);
        }
      }
      break;
    default:
      break;
  }
}

function drawPathEdges(g, map, r, th) {
  for (const sg of uniqueSegments(map)) {
    for (let t = 0; t < sg.len; t += 0.18) {
      for (const side of [-1, 1]) {
        if (!r.chance(0.55)) continue;
        const off = side * r.range(0.46, 0.55);
        const x = sg.x1 + sg.dx * t - sg.dy * off;
        const y = sg.y1 + sg.dy * t + sg.dx * off;
        if (map.polys.length > 1 && onRoad(map, x, y, 0.42)) continue; // başka yolun üstüne taşmasın
        tuft(g, x, y, r, th);
      }
    }
  }
}

const DECOR = {
  tree(g, x, y, r) {
    softShadow(g, x + 0.12, y + 0.28, 0.45, 0.16, 0.55);
    const bark = '#241a16';
    const branch = (x0, y0, a, len, w, depth) => {
      const x1 = x0 + Math.cos(a) * len;
      const y1 = y0 + Math.sin(a) * len;
      curve(g, [[x0, y0], [(x0 + x1) / 2 + r.spread(0, 0.05), (y0 + y1) / 2], [x1, y1]], w + 0.025, INK);
      curve(g, [[x0, y0], [(x0 + x1) / 2 + r.spread(0, 0.05), (y0 + y1) / 2], [x1, y1]], w, bark);
      if (depth > 0) {
        branch(x1, y1, a - r.range(0.3, 0.6), len * 0.7, w * 0.65, depth - 1);
        branch(x1, y1, a + r.range(0.3, 0.6), len * 0.65, w * 0.6, depth - 1);
      }
    };
    for (const sx of [-1, 1]) curve(g, [[x, y + 0.2], [x + sx * 0.12, y + 0.26], [x + sx * 0.22, y + 0.3]], 0.04, bark);
    branch(x, y + 0.28, -Math.PI / 2 + r.spread(0, 0.1), 0.5, 0.1, 3);
    line(g, [[x - 0.03, y + 0.25], [x - 0.03, y - 0.15]], 0.02, '#4a3a30', 0.6);
  },
  rock(g, x, y, r) {
    softShadow(g, x + 0.08, y + 0.2, 0.42, 0.15, 0.55);
    const rock = blob([[x - 0.32, y + 0.18], [x - 0.3, y - 0.08], [x - 0.08, y - 0.26], [x + 0.2, y - 0.2], [x + 0.34, y + 0.04], [x + 0.26, y + 0.22]]);
    paint(g, rock, '#4a4550', [x - 0.34, y - 0.26, 0.68, 0.48], { line: 0.025 });
    fill(g, blob([[x - 0.2, y - 0.12], [x - 0.04, y - 0.24], [x + 0.12, y - 0.18], [x - 0.04, y - 0.1]]), '#3a4a2a', 0.85);
    line(g, [[x + 0.02, y - 0.05], [x + 0.08, y + 0.08], [x + 0.04, y + 0.18]], 0.014, INK, 0.7);
    paint(g, ell(x + 0.3, y + 0.24, 0.07, 0.05), '#3e3a44', [x + 0.23, y + 0.19, 0.14, 0.1], { line: 0.014 });
  },
  grave(g, x, y, r) {
    softShadow(g, x + 0.08, y + 0.24, 0.36, 0.13, 0.55);
    paint(g, ell(x, y + 0.2, 0.26, 0.11), '#2e241c', [x - 0.26, y + 0.09, 0.52, 0.22], { line: 0.016 });
    const tilt = r.spread(0, 0.12);
    g.save();
    g.translate(x, y + 0.14);
    g.rotate(tilt);
    const stone = P((p) => {
      p.moveTo(-0.16, 0);
      p.lineTo(-0.16, -0.3);
      p.arc(0, -0.3, 0.16, Math.PI, 0);
      p.lineTo(0.16, 0);
      p.closePath();
    });
    paint(g, stone, '#5a5664', [-0.16, -0.46, 0.32, 0.46], { line: 0.022 });
    line(g, [[0, -0.36], [0, -0.14]], 0.03, '#2e2b34');
    line(g, [[-0.07, -0.29], [0.07, -0.29]], 0.03, '#2e2b34');
    fill(g, blob([[-0.16, -0.05], [-0.05, -0.12], [0.02, -0.02]]), '#3a4a2a', 0.8);
    g.restore();
  },
  shrine(g, x, y, r, lights) {
    softShadow(g, x + 0.06, y + 0.24, 0.48, 0.16, 0.55);
    for (const sx of [-1, 1]) paint(g, poly([[x + sx * 0.3 - 0.07, y + 0.22], [x + sx * 0.3 + 0.07, y + 0.22], [x + sx * 0.3 + 0.07, y], [x + sx * 0.3 - 0.07, y]]), '#4a4450', [x - 0.4, y, 0.8, 0.22], { line: 0.018 });
    paint(g, poly([[x - 0.42, y - 0.02], [x + 0.4, y - 0.06], [x + 0.42, y + 0.04], [x - 0.4, y + 0.06]]), '#5d5666', [x - 0.42, y - 0.06, 0.84, 0.12], { line: 0.02 });
    paint(g, poly([[x - 0.4, y - 0.12], [x + 0.38, y - 0.16], [x + 0.4, y - 0.04], [x - 0.42, y - 0.02]]), '#6a6274', [x - 0.42, y - 0.16, 0.84, 0.14], { line: 0.02 });
    const sk = blob([[x - 0.07, y - 0.15], [x - 0.07, y - 0.26], [x, y - 0.3], [x + 0.07, y - 0.26], [x + 0.07, y - 0.15]]);
    paint(g, sk, BONE, [x - 0.07, y - 0.3, 0.14, 0.15], { line: 0.016 });
    socket(g, x - 0.028, y - 0.22, 0.02);
    socket(g, x + 0.028, y - 0.22, 0.02);
    for (const [cx, h] of [[-0.28, 0.12], [-0.17, 0.08], [0.2, 0.1], [0.3, 0.14]]) {
      paint(g, poly([[x + cx - 0.022, y - 0.14], [x + cx + 0.022, y - 0.14], [x + cx + 0.022, y - 0.14 - h], [x + cx - 0.022, y - 0.14 - h]]), '#cfc4a8', [x + cx - 0.02, y - 0.14 - h, 0.04, h], { line: 0.01 });
      glowFill(g, ell(x + cx, y - 0.17 - h, 0.014, 0.03), '#ffd27a', 0.06);
      lights.push({ x: x + cx, y: y - 0.18 - h, r: 0.32, color: '#ffb347', kind: 'candle' });
    }
    // kan lekeleri
    fill(g, blob([[x - 0.1, y + 0.3], [x + 0.08, y + 0.28], [x + 0.14, y + 0.36], [x - 0.06, y + 0.38]]), '#3a0a10', 0.7);
  },
};

/* --------------------------------------------------------------------------
 * BÖLÜM SÜSLERİ — Ayaz Geçidi, Kara Bataklık, Kor Ocakları, Boşluk Tahtı
 *  İmza: (g, x, y, rng, lights, tema) — x, y hücre merkezi.
 * ------------------------------------------------------------------------ */
Object.assign(DECOR, {
  /* — Ayaz Geçidi — */
  pine(g, x, y, r) {
    softShadow(g, x + 0.12, y + 0.3, 0.42, 0.15, 0.55);
    paint(g, poly([[x - 0.05, y + 0.32], [x + 0.05, y + 0.32], [x + 0.04, y + 0.12], [x - 0.04, y + 0.12]]), '#2a1e16', [x - 0.05, y + 0.12, 0.1, 0.2], { line: 0.014 });
    const tiers = [[0.36, 0.22, 0.12], [0.3, -0.02, -0.14], [0.22, -0.24, -0.36], [0.13, -0.42, -0.56]];
    for (const [w, base, top] of tiers) {
      const tier = poly([[x - w, y + base], [x + w, y + base], [x + w * 0.15, y + top + 0.05], [x, y + top], [x - w * 0.15, y + top + 0.05]]);
      paint(g, tier, '#1e3a32', [x - w, y + top, w * 2, base - top], { light: 0.15, dark: 0.45, line: 0.018 });
      // karla örtülü üst kenar
      fill(g, blob([[x - w * 0.8, y + base - 0.02], [x - w * 0.3, y + base - 0.07], [x, y + top + 0.06], [x + w * 0.35, y + base - 0.09], [x + w * 0.85, y + base - 0.03], [x, y + base - 0.01]]), '#e6f2fb', 0.9);
    }
    fill(g, circle(x, y - 0.56, 0.03), '#ffffff', 0.9);
  },
  ice(g, x, y, r, lights) {
    softShadow(g, x + 0.06, y + 0.26, 0.4, 0.14, 0.45);
    const shards = [[-0.18, 0.24, 0.42, -0.25], [0.02, 0.26, 0.62, 0.05], [0.2, 0.24, 0.38, 0.3], [-0.05, 0.28, 0.28, -0.6]];
    for (const [ox, by, h, lean] of shards) {
      const bx = x + ox;
      const tip = [bx + lean * 0.2, y + by - h];
      const sh = poly([[bx - 0.07, y + by], [bx + 0.07, y + by], tip]);
      g.save();
      g.shadowColor = '#a6ecff';
      g.shadowBlur = 0.1 * px;
      fill(g, sh, '#7fd2f0', 0.35);
      g.restore();
      paint(g, poly([[bx - 0.07, y + by], [bx, y + by], tip]), '#d8f6ff', [bx - 0.07, tip[1], 0.07, h], { light: 0.3, dark: 0.15, line: 0.012 });
      paint(g, poly([[bx, y + by], [bx + 0.07, y + by], tip]), '#6ab8d8', [bx, tip[1], 0.07, h], { light: 0.1, dark: 0.35, line: 0.012 });
    }
    lights.push({ x, y: y - 0.05, r: 0.5, color: '#a6ecff', kind: 'crystal' });
  },
  snowrock(g, x, y, r) {
    DECOR.rock(g, x, y, r);
    fill(g, blob([[x - 0.3, y - 0.06], [x - 0.08, y - 0.26], [x + 0.2, y - 0.2], [x + 0.32, y - 0.02], [x + 0.1, y - 0.08], [x - 0.12, y - 0.02]]), '#e6f2fb', 0.95);
    line(g, [[x - 0.22, y - 0.1], [x + 0.05, y - 0.22]], 0.012, '#ffffff', 0.7);
  },
  frozen(g, x, y, r, lights) {
    softShadow(g, x + 0.06, y + 0.3, 0.42, 0.14, 0.5);
    // buza hapsolmuş şövalye silüeti
    const block = poly([[x - 0.3, y + 0.3], [x + 0.3, y + 0.3], [x + 0.26, y - 0.5], [x - 0.24, y - 0.56]]);
    fill(g, block, '#5a8aa8', 0.35);
    g.save();
    g.clip(block);
    paint(g, ell(x, y - 0.32, 0.09, 0.1), '#2a3440', [x - 0.09, y - 0.42, 0.18, 0.2], { line: 0.012 });
    paint(g, poly([[x - 0.13, y - 0.22], [x + 0.13, y - 0.22], [x + 0.1, y + 0.18], [x - 0.1, y + 0.18]]), '#2a3440', [x - 0.13, y - 0.22, 0.26, 0.4], { line: 0.012 });
    line(g, [[x + 0.16, y + 0.24], [x + 0.2, y - 0.4]], 0.03, '#3a4450');
    fill(g, poly([[x - 0.3, y - 0.6], [x + 0.3, y - 0.6], [x + 0.3, y - 0.2], [x - 0.3, y + 0.1]]), '#ffffff', 0.12);
    g.restore();
    g.lineWidth = 0.02;
    g.strokeStyle = '#c8ecff';
    g.stroke(block);
    line(g, [[x - 0.18, y - 0.48], [x - 0.08, y + 0.2]], 0.01, '#ffffff', 0.5);
    fill(g, blob([[x - 0.26, y - 0.52], [x, y - 0.6], [x + 0.26, y - 0.5], [x, y - 0.46]]), '#eef8ff', 0.95);
    lights.push({ x: x - 0.02, y: y - 0.33, r: 0.22, color: '#58eaff', kind: 'crystal' });
  },

  /* — Kara Bataklık — */
  deadtree(g, x, y, r) {
    softShadow(g, x + 0.12, y + 0.28, 0.45, 0.16, 0.55);
    const bark = '#1e2018';
    const ends = [];
    const branch = (x0, y0, a, len, w, depth) => {
      const x1 = x0 + Math.cos(a) * len;
      const y1 = y0 + Math.sin(a) * len;
      curve(g, [[x0, y0], [(x0 + x1) / 2 + r.spread(0, 0.05), (y0 + y1) / 2], [x1, y1]], w + 0.025, INK);
      curve(g, [[x0, y0], [(x0 + x1) / 2 + r.spread(0, 0.05), (y0 + y1) / 2], [x1, y1]], w, bark);
      if (depth > 0) {
        branch(x1, y1, a - r.range(0.4, 0.8), len * 0.72, w * 0.65, depth - 1);
        branch(x1, y1, a + r.range(0.4, 0.8), len * 0.66, w * 0.6, depth - 1);
      } else ends.push([x1, y1]);
    };
    for (const sx of [-1, 1]) curve(g, [[x, y + 0.2], [x + sx * 0.14, y + 0.26], [x + sx * 0.26, y + 0.3]], 0.04, bark);
    branch(x, y + 0.28, -Math.PI / 2 + r.spread(0, 0.12), 0.46, 0.11, 3);
    // sarkan yosun
    for (const [ex, ey] of ends) {
      if (!r.chance(0.6)) continue;
      const l = r.range(0.12, 0.26);
      curve(g, [[ex, ey], [ex + 0.02, ey + l * 0.5], [ex - 0.01, ey + l]], 0.02, '#3a5a2a', 0.85);
    }
  },
  pool(g, x, y, r, lights) {
    g.fillStyle = rad(g, x, y + 0.05, 0.6, [[0, 'rgba(6,14,10,0.6)'], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(x - 0.6, y - 0.55, 1.2, 1.2);
    const water = ell(x, y + 0.04, 0.4, 0.26);
    paint(g, water, '#12241c', [x - 0.4, y - 0.22, 0.8, 0.52], { light: 0.05, dark: 0.4, line: 0.02, lineColor: '#2a3a22' });
    g.save();
    g.clip(water);
    g.fillStyle = rad(g, x - 0.1, y - 0.04, 0.35, [[0, 'rgba(140,255,90,0.22)'], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(x - 0.4, y - 0.22, 0.8, 0.52);
    line(g, [[x - 0.26, y - 0.06], [x + 0.06, y - 0.12]], 0.014, '#7aaa6a', 0.45);
    g.restore();
    for (const [lx, ly] of [[x + 0.16, y + 0.1], [x - 0.2, y + 0.12]]) {
      fill(g, P((p) => { p.moveTo(lx, ly); p.arc(lx, ly, 0.07, 0.4, TAU - 0.2); p.closePath(); }), '#2e5a26', 0.95);
    }
    for (const [bx, by, br] of [[x - 0.05, y - 0.02, 0.02], [x + 0.08, y + 0.04, 0.014]]) {
      g.lineWidth = 0.008;
      g.strokeStyle = '#b6ff7a';
      g.stroke(circle(bx, by, br));
    }
    lights.push({ x, y, r: 0.45, color: '#7dff5a', kind: 'wisp' });
  },
  reeds(g, x, y, r) {
    softShadow(g, x + 0.06, y + 0.28, 0.32, 0.1, 0.4);
    for (let i = 0; i < 9; i++) {
      const bx = x + r.spread(0, 0.22);
      const h = r.range(0.32, 0.62);
      const lean = r.spread(0, 0.1);
      curve(g, [[bx, y + 0.28], [bx + lean * 0.5, y + 0.28 - h * 0.5], [bx + lean, y + 0.28 - h]], 0.018, i % 2 ? '#3a4a24' : '#2a3a1c');
      if (r.chance(0.5)) paint(g, ell(bx + lean, y + 0.28 - h + 0.06, 0.025, 0.07), '#4a2e1a', [bx + lean - 0.03, y + 0.22 - h, 0.06, 0.14], { line: 0.008 });
    }
  },
  mushroom(g, x, y, r, lights) {
    softShadow(g, x + 0.06, y + 0.26, 0.34, 0.12, 0.45);
    const caps = [[-0.14, 0.2, 0.13, 0.22], [0.08, 0.24, 0.17, 0.3], [0.2, 0.22, 0.09, 0.16], [-0.02, 0.26, 0.08, 0.12]];
    for (const [ox, by, cr, h] of caps) {
      const sx = x + ox;
      line(g, [[sx, y + by], [sx, y + by - h]], 0.035, INK);
      line(g, [[sx, y + by], [sx, y + by - h]], 0.022, '#cfc4a8');
      const cap = P((p) => { p.moveTo(sx - cr, y + by - h + 0.02); p.quadraticCurveTo(sx, y + by - h - cr * 1.2, sx + cr, y + by - h + 0.02); p.closePath(); });
      g.save();
      g.shadowColor = '#7dff5a';
      g.shadowBlur = 0.08 * px;
      fill(g, cap, '#6ad84a', 0.9);
      g.restore();
      g.lineWidth = 0.012;
      g.strokeStyle = INK;
      g.stroke(cap);
      fill(g, circle(sx - cr * 0.3, y + by - h - cr * 0.3, cr * 0.15), '#e8ffb0', 0.8);
    }
    lights.push({ x: x + 0.05, y: y - 0.05, r: 0.42, color: '#7dff5a', kind: 'wisp' });
  },

  /* — Kor Ocakları — */
  lava(g, x, y, r, lights) {
    g.fillStyle = rad(g, x, y, 0.62, [[0, 'rgba(255,120,30,0.35)'], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(x - 0.65, y - 0.65, 1.3, 1.3);
    const pool = blob([[x - 0.38, y + 0.04], [x - 0.28, y - 0.2], [x + 0.06, y - 0.26], [x + 0.36, y - 0.12], [x + 0.38, y + 0.14], [x + 0.08, y + 0.26], [x - 0.26, y + 0.22]]);
    fill(g, pool, '#1a0a06');
    g.save();
    g.clip(pool);
    g.fillStyle = rad(g, x, y, 0.36, [[0, '#ffe08a'], [0.35, '#ff8a2a'], [0.8, '#c8320a'], [1, '#5a1004']]);
    g.fillRect(x - 0.4, y - 0.3, 0.8, 0.6);
    for (let i = 0; i < 4; i++) {
      const cx = x + r.spread(0, 0.2);
      const cy = y + r.spread(0, 0.12);
      fill(g, blob([[cx - 0.08, cy], [cx - 0.02, cy - 0.05], [cx + 0.09, cy - 0.02], [cx + 0.04, cy + 0.04]]), '#2a0a04', 0.75);
    }
    g.restore();
    g.lineWidth = 0.03;
    g.strokeStyle = '#140606';
    g.stroke(pool);
    lights.push({ x, y, r: 0.75, color: '#ff7a2a', kind: 'lava' });
  },
  obsidian(g, x, y, r) {
    softShadow(g, x + 0.08, y + 0.26, 0.4, 0.14, 0.55);
    const spikes = [[-0.2, 0.22, 0.42, -0.3], [0.0, 0.26, 0.66, 0.08], [0.18, 0.22, 0.48, 0.28], [-0.06, 0.28, 0.3, -0.5]];
    for (const [ox, by, h, lean] of spikes) {
      const bx = x + ox;
      const tip = [bx + lean * 0.18, y + by - h];
      paint(g, poly([[bx - 0.08, y + by], [bx + 0.08, y + by], tip]), '#1a1420', [bx - 0.08, tip[1], 0.16, h], { light: 0.35, dark: 0.3, line: 0.016 });
      line(g, [[bx - 0.03, y + by - 0.05], [tip[0] - 0.01, tip[1] + 0.08]], 0.01, '#8a6aa8', 0.5);
    }
    glowLine(g, [[x - 0.2, y + 0.24], [x - 0.05, y + 0.2], [x + 0.12, y + 0.25]], 0.012, '#ff5a1a', 0.06);
  },
  brazier(g, x, y, r, lights) {
    softShadow(g, x + 0.06, y + 0.28, 0.32, 0.12, 0.55);
    for (const lx of [-0.14, 0, 0.14]) line(g, [[x + lx * 0.6, y - 0.02], [x + lx, y + 0.28]], 0.03, IRON);
    const bowl = P((p) => { p.moveTo(x - 0.22, y - 0.06); p.quadraticCurveTo(x, y + 0.14, x + 0.22, y - 0.06); p.closePath(); });
    paint(g, bowl, '#3a3440', [x - 0.22, y - 0.06, 0.44, 0.16], { light: 0.35, dark: 0.4, line: 0.02 });
    paint(g, ell(x, y - 0.06, 0.22, 0.06), '#2a2028', [x - 0.22, y - 0.12, 0.44, 0.12], { line: 0.016 });
    for (const [fx, h] of [[-0.08, 0.2], [0, 0.3], [0.08, 0.22]]) {
      glowFill(g, blob([[x + fx - 0.06, y - 0.06], [x + fx - 0.02, y - 0.06 - h * 0.6], [x + fx, y - 0.06 - h], [x + fx + 0.06, y - 0.06]]), '#ff9a3a', 0.08, 0.95);
    }
    lights.push({ x, y: y - 0.2, r: 0.55, color: '#ff8a2a', kind: 'torch' });
  },
  anvil(g, x, y, r) {
    softShadow(g, x + 0.08, y + 0.28, 0.42, 0.14, 0.55);
    paint(g, poly([[x - 0.16, y + 0.3], [x + 0.16, y + 0.3], [x + 0.12, y + 0.04], [x - 0.12, y + 0.04]]), '#3a2618', [x - 0.16, y + 0.04, 0.32, 0.26], { line: 0.018 });
    const body = P((p) => {
      p.moveTo(x - 0.3, y - 0.12);
      p.lineTo(x + 0.22, y - 0.12);
      p.quadraticCurveTo(x + 0.42, y - 0.1, x + 0.36, y - 0.04);
      p.lineTo(x + 0.12, y - 0.02);
      p.lineTo(x + 0.08, y + 0.06);
      p.lineTo(x - 0.1, y + 0.06);
      p.lineTo(x - 0.14, y - 0.02);
      p.lineTo(x - 0.3, y - 0.04);
      p.closePath();
    });
    paint(g, body, '#4a4652', [x - 0.3, y - 0.14, 0.7, 0.2], { light: 0.3, dark: 0.4, line: 0.02 });
    line(g, [[x - 0.26, y - 0.12], [x + 0.2, y - 0.12]], 0.012, '#9a96a8', 0.7);
    // zincir
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.ellipse(x - 0.34 + i * 0.07, y + 0.18 + Math.sin(i) * 0.02, 0.035, 0.022, 0.3, 0, TAU);
      g.lineWidth = 0.014;
      g.strokeStyle = '#2a2830';
      g.stroke();
    }
  },

  /* — Boşluk Tahtı — */
  pillar(g, x, y, r, lights) {
    softShadow(g, x + 0.1, y + 0.3, 0.38, 0.13, 0.55);
    paint(g, poly([[x - 0.24, y + 0.3], [x + 0.24, y + 0.3], [x + 0.22, y + 0.18], [x - 0.22, y + 0.18]]), '#3a3248', [x - 0.24, y + 0.18, 0.48, 0.12], { line: 0.016 });
    const top = y - 0.42 + r.range(0, 0.18);
    const shaft = poly([[x - 0.15, y + 0.18], [x + 0.15, y + 0.18], [x + 0.15, top + 0.06], [x + 0.04, top], [x - 0.06, top + 0.08], [x - 0.15, top + 0.02]]);
    paint(g, shaft, '#4a4058', [x - 0.15, top, 0.3, y + 0.18 - top], { light: 0.25, dark: 0.45, line: 0.018 });
    for (const lx of [-0.07, 0, 0.07]) line(g, [[x + lx, y + 0.16], [x + lx, top + 0.1]], 0.01, INK, 0.4);
    glowLine(g, [[x - 0.05, y - 0.05], [x, y - 0.12], [x + 0.05, y - 0.05], [x, y + 0.02], [x - 0.05, y - 0.05]], 0.012, '#c06aff', 0.07);
    // kırık parça yerde
    paint(g, poly([[x + 0.2, y + 0.3], [x + 0.38, y + 0.26], [x + 0.36, y + 0.16], [x + 0.22, y + 0.2]]), '#4a4058', [x + 0.2, y + 0.16, 0.18, 0.14], { line: 0.014 });
    lights.push({ x, y: y - 0.05, r: 0.25, color: '#c06aff', kind: 'rune' });
  },
  rift(g, x, y, r, lights) {
    g.fillStyle = rad(g, x, y, 0.6, [[0, 'rgba(150,60,255,0.3)'], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
    const crack = blob([[x - 0.36, y + 0.06], [x - 0.12, y - 0.04], [x + 0.02, y - 0.14], [x + 0.16, y - 0.06], [x + 0.38, y - 0.1], [x + 0.18, y + 0.04], [x + 0.02, y + 0.12], [x - 0.16, y + 0.08]]);
    fill(g, crack, '#020004');
    g.save();
    g.shadowColor = '#b04aff';
    g.shadowBlur = 0.12 * px;
    g.lineWidth = 0.025;
    g.strokeStyle = '#c87aff';
    g.stroke(crack);
    g.restore();
    for (let i = 0; i < 5; i++) fill(g, circle(x + r.spread(0, 0.2), y + r.spread(0, 0.05), 0.012), '#f0d8ff', 0.9);
    lights.push({ x, y, r: 0.6, color: '#b04aff', kind: 'rift' });
  },
  floatstone(g, x, y, r) {
    softShadow(g, x + 0.04, y + 0.3, 0.3, 0.1, 0.5);
    const stones = [[0, -0.22, 0.2], [-0.2, -0.02, 0.1], [0.22, 0.04, 0.08]];
    for (const [ox, oy, s] of stones) {
      const sx = x + ox;
      const sy = y + oy;
      const rock = blob([[sx - s, sy], [sx - s * 0.6, sy - s * 0.8], [sx + s * 0.5, sy - s * 0.9], [sx + s, sy - s * 0.1], [sx + s * 0.3, sy + s * 0.9], [sx - s * 0.4, sy + s * 0.7]]);
      paint(g, rock, '#3a3048', [sx - s, sy - s, s * 2, s * 2], { light: 0.3, dark: 0.45, line: 0.016 });
      glowLine(g, [[sx - s * 0.3, sy + s * 0.75], [sx + s * 0.2, sy + s * 0.85]], 0.01, '#a04aff', 0.06);
    }
  },
  obelisk(g, x, y, r, lights) {
    softShadow(g, x + 0.08, y + 0.3, 0.32, 0.12, 0.55);
    paint(g, poly([[x - 0.2, y + 0.3], [x + 0.2, y + 0.3], [x + 0.18, y + 0.2], [x - 0.18, y + 0.2]]), '#2a2238', [x - 0.2, y + 0.2, 0.4, 0.1], { line: 0.016 });
    const body = poly([[x - 0.13, y + 0.2], [x + 0.13, y + 0.2], [x + 0.08, y - 0.48], [x, y - 0.62], [x - 0.08, y - 0.48]]);
    paint(g, body, '#241c30', [x - 0.13, y - 0.62, 0.26, 0.82], { light: 0.3, dark: 0.45, line: 0.018 });
    for (let i = 0; i < 4; i++) {
      const ry = y + 0.1 - i * 0.16;
      glowLine(g, [[x - 0.05, ry], [x, ry - 0.06], [x + 0.05, ry]], 0.012, '#e08aff', 0.07);
    }
    lights.push({ x, y: y - 0.2, r: 0.4, color: '#d07aff', kind: 'rune' });
  },
});

/** Kar temalı bölümde kalenin çatıları ve surları karla örtülür. */
function snowOnCastle(g, map) {
  const { x, y } = map.castle;
  const wallY = y - 1.4;
  const keepTop = y - 0.35;
  const snow = '#e6f2fb';
  fill(g, poly([[x - 0.74, keepTop - 0.06], [x, keepTop - 0.5], [x + 0.74, keepTop - 0.06], [x + 0.5, keepTop - 0.1], [x, keepTop - 0.38], [x - 0.5, keepTop - 0.1]]), snow, 0.9);
  for (const sx of [-1, 1]) {
    const tx = x + sx * 1.2;
    const ty = wallY - 0.05;
    fill(g, poly([[tx - 0.3, ty - 0.32], [tx, ty - 0.9], [tx + 0.3, ty - 0.32], [tx + 0.18, ty - 0.36], [tx, ty - 0.7], [tx - 0.18, ty - 0.36]]), snow, 0.9);
    fill(g, blob([[x + sx * 0.5, wallY - 0.36], [x + sx * 0.95, wallY - 0.4], [x + sx * 1.42, wallY - 0.36], [x + sx * 0.95, wallY - 0.32]]), snow, 0.85);
  }
}

/** Düşmanların doğduğu yarık: taş kemer (girdap render'da döner). Rengi bölümün teması. */
function drawPortal(g, pl, th, lights) {
  const x = pl.points[0].x;
  const y = 0.05;
  const glow = th.portalGlow ?? th.portal;
  g.fillStyle = rad(g, x, y - 0.35, 0.9, [[0, rgba(th.portal, 0.35)], [1, 'rgba(0,0,0,0)']]);
  g.fillRect(x - 1, y - 1.3, 2, 2);
  const stone = th.portalStone ?? '#3e3a46';
  for (const sx of [-1, 1]) {
    const px0 = x + sx * 0.5;
    paint(g, poly([[px0 - 0.1, y + 0.12], [px0 + 0.1, y + 0.12], [px0 + 0.08, y - 0.75], [px0 - 0.08, y - 0.75]]), stone, [px0 - 0.1, y - 0.75, 0.2, 0.87], { line: 0.022 });
    for (let i = 0; i < 4; i++) line(g, [[px0 - 0.09, y - 0.1 - i * 0.18], [px0 + 0.09, y - 0.1 - i * 0.18]], 0.012, INK, 0.5);
    glowLine(g, [[px0, y - 0.15], [px0, y - 0.55]], 0.016, glow, 0.1);
  }
  paint(g, poly([[x - 0.66, y - 0.72], [x + 0.66, y - 0.72], [x + 0.6, y - 0.9], [x - 0.6, y - 0.9]]), shadeHex(stone, 0.1), [x - 0.66, y - 0.9, 1.32, 0.18], { line: 0.022 });
  fill(g, poly([[x - 0.06, y - 0.9], [x + 0.06, y - 0.9], [x + 0.04, y - 0.76], [x - 0.04, y - 0.76]]), glow, 0.7);
  if (th.ambient === 'snow') {
    // kemerin üstünde kar
    fill(g, blob([[x - 0.68, y - 0.88], [x - 0.3, y - 0.98], [x + 0.2, y - 0.96], [x + 0.68, y - 0.9], [x + 0.6, y - 0.84], [x - 0.6, y - 0.84]]), '#e6f2fb', 0.95);
  }
  lights.push({ x, y: y - 0.3, r: 0.9, color: th.portal, kind: 'portal' });
}

/** Kale: kuzeye bakan kapılı sur, köşe kuleleri ve ışıklı iç kale. */
function drawCastle(g, map, lights) {
  const { x, y } = map.castle;      // yolun bittiği hücrenin merkezi
  const wallY = y - 1.4;            // kuzey sur hattı
  const stone = '#4e4856';
  const dark = '#2a2630';
  // avlu zemini
  fill(g, poly([[x - 1.45, wallY], [x + 1.45, wallY], [x + 1.45, y + 0.6], [x - 1.45, y + 0.6]]), '#141117');
  g.fillStyle = rad(g, x, y, 1.4, [[0, 'rgba(255,170,80,0.10)'], [1, 'rgba(0,0,0,0)']]);
  g.fillRect(x - 1.5, wallY, 3, 2.2);
  // iç kale (avlu güneyinde)
  const keepTop = y - 0.35;
  paint(g, poly([[x - 0.8, keepTop], [x + 0.8, keepTop], [x + 0.8, y + 0.6], [x - 0.8, y + 0.6]]), stone, [x - 0.8, keepTop, 1.6, 1], { line: 0.025 });
  g.save();
  g.clip(poly([[x - 0.8, keepTop], [x + 0.8, keepTop], [x + 0.8, y + 0.6], [x - 0.8, y + 0.6]]));
  bricks(g, x - 0.8, keepTop, x + 0.8, y + 0.6, 0.12, INK, 0.3);
  g.restore();
  paint(g, poly([[x - 0.9, keepTop], [x, keepTop - 0.55], [x + 0.9, keepTop]]), '#3a1418', [x - 0.9, keepTop - 0.55, 1.8, 0.55], { light: 0.2, dark: 0.5, line: 0.025 });
  for (let i = 0; i < 5; i++) line(g, [[x - 0.7 + i * 0.35, keepTop], [x, keepTop - 0.5]], 0.01, INK, 0.4);
  for (const wx of [-0.45, 0, 0.45]) {
    const win = P((p) => {
      p.moveTo(x + wx - 0.07, keepTop + 0.42);
      p.lineTo(x + wx - 0.07, keepTop + 0.22);
      p.arc(x + wx, keepTop + 0.22, 0.07, Math.PI, 0);
      p.lineTo(x + wx + 0.07, keepTop + 0.42);
      p.closePath();
    });
    glowFill(g, win, '#ffb347', 0.12, 0.9);
    line(g, [[x + wx, keepTop + 0.16], [x + wx, keepTop + 0.42]], 0.012, INK, 0.8);
    lights.push({ x: x + wx, y: keepTop + 0.3, r: 0.35, color: '#ffb347', kind: 'window' });
  }
  // yan surlar (doğu-batı)
  for (const sx of [-1, 1]) {
    const side = poly([[x + sx * 1.45, wallY], [x + sx * 1.15, wallY], [x + sx * 1.15, y + 0.6], [x + sx * 1.45, y + 0.6]]);
    paint(g, side, stone, [x - 1.45, wallY, 2.9, 2], { line: 0.025, light: 0.12, dark: 0.35 });
    g.save();
    g.clip(side);
    bricks(g, Math.min(x + sx * 1.45, x + sx * 1.15), wallY, Math.max(x + sx * 1.45, x + sx * 1.15), y + 0.6, 0.1, INK, 0.35);
    g.restore();
    line(g, [[x + sx * 1.15, wallY], [x + sx * 1.15, y + 0.6]], 0.03, '#000000', 0.35);
  }
  // kuzey sur — kapı ortada
  const gateW = 0.44;
  for (const sx of [-1, 1]) {
    const x1 = x + sx * gateW;
    const x2 = x + sx * 1.45;
    const wall = poly([[x1, wallY - 0.22], [x2, wallY - 0.22], [x2, wallY + 0.28], [x1, wallY + 0.28]]);
    paint(g, wall, stone, [Math.min(x1, x2), wallY - 0.22, 1, 0.5], { line: 0.025 });
    g.save();
    g.clip(wall);
    bricks(g, Math.min(x1, x2), wallY - 0.22, Math.max(x1, x2), wallY + 0.28, 0.1, INK, 0.35);
    g.restore();
    for (let i = 0; i < 4; i++) {
      const mx = x1 + sx * (0.08 + i * 0.25);
      paint(g, poly([[mx - 0.07, wallY - 0.34], [mx + 0.07, wallY - 0.34], [mx + 0.07, wallY - 0.2], [mx - 0.07, wallY - 0.2]]), shadeHex(stone, 0.2), [mx - 0.07, wallY - 0.34, 0.14, 0.14], { line: 0.016 });
    }
  }
  // kapı geçidi: yol karanlığa girer
  const gap = poly([[x - gateW, wallY - 0.22], [x + gateW, wallY - 0.22], [x + gateW, wallY + 0.28], [x - gateW, wallY + 0.28]]);
  g.fillStyle = lin(g, 0, wallY - 0.22, 0, wallY + 0.28, [[0, 'rgba(5,3,7,0.85)'], [1, 'rgba(5,3,7,0.25)']]);
  g.fill(gap);
  // kapı kuleleri + kalın kemer
  for (const sx of [-1, 1]) {
    const gx = x + sx * (gateW + 0.08);
    paint(g, poly([[gx - 0.13, wallY - 0.55], [gx + 0.13, wallY - 0.55], [gx + 0.13, wallY + 0.3], [gx - 0.13, wallY + 0.3]]), shadeHex(stone, 0.12), [gx - 0.13, wallY - 0.55, 0.26, 0.85], { line: 0.025 });
    paint(g, poly([[gx - 0.16, wallY - 0.62], [gx + 0.16, wallY - 0.62], [gx + 0.16, wallY - 0.52], [gx - 0.16, wallY - 0.52]]), shadeHex(stone, 0.25), [gx - 0.16, wallY - 0.62, 0.32, 0.1], { line: 0.018 });
  }
  const archBand = P((p) => {
    p.moveTo(x - gateW, wallY - 0.05);
    p.arc(x, wallY - 0.05, gateW, Math.PI, 0);
    p.lineTo(x + gateW + 0.02, wallY - 0.52);
    p.lineTo(x - gateW - 0.02, wallY - 0.52);
    p.closePath();
  });
  paint(g, archBand, shadeHex(stone, 0.18), [x - gateW, wallY - 0.52, gateW * 2, 0.5], { line: 0.025 });
  for (let i = 0; i < 7; i++) {
    const a = Math.PI + (i / 6) * Math.PI;
    line(g, [[x + Math.cos(a) * gateW, wallY - 0.05 + Math.sin(a) * gateW], [x + Math.cos(a) * (gateW + 0.08), wallY - 0.05 + Math.sin(a) * (gateW + 0.08)]], 0.012, INK, 0.6);
  }
  paint(g, poly([[x - 0.06, wallY - 0.52], [x + 0.06, wallY - 0.52], [x + 0.045, wallY - 0.42], [x - 0.045, wallY - 0.42]]), GOLD, [x - 0.06, wallY - 0.52, 0.12, 0.1], { line: 0.012 });
  // kaldırılmış parmaklık: kemerin altından sarkan dişler
  line(g, [[x - gateW + 0.04, wallY - 0.16], [x + gateW - 0.04, wallY - 0.16]], 0.03, '#1e1c24');
  for (let i = -3; i <= 3; i++) {
    const bx = x + i * (gateW / 3.6);
    const top = wallY - 0.05 - Math.sqrt(Math.max(0, gateW * gateW - (bx - x) * (bx - x))) + 0.02;
    line(g, [[bx, top], [bx, wallY - 0.08]], 0.022, '#1e1c24');
    fill(g, poly([[bx - 0.016, wallY - 0.08], [bx + 0.016, wallY - 0.08], [bx, wallY - 0.02]]), '#3a3844');
  }
  // köşe kuleleri
  for (const sx of [-1, 1]) {
    const tx = x + sx * 1.2;
    const ty = wallY - 0.05;
    paint(g, poly([[tx - 0.32, ty - 0.3], [tx + 0.32, ty - 0.3], [tx + 0.32, ty + 0.35], [tx - 0.32, ty + 0.35]]), stone, [tx - 0.32, ty - 0.3, 0.64, 0.65], { line: 0.025 });
    paint(g, poly([[tx - 0.38, ty - 0.28], [tx, ty - 0.95], [tx + 0.38, ty - 0.28]]), '#3a1418', [tx - 0.38, ty - 0.95, 0.76, 0.67], { light: 0.25, dark: 0.5, line: 0.025 });
    line(g, [[tx, ty - 0.95], [tx, ty - 1.15]], 0.02, INK);
    fill(g, poly([[tx, ty - 1.15], [tx + sx * 0.18, ty - 1.09], [tx, ty - 1.03]]), '#7a1f2a');
    const wy = ty + 0.02;
    glowFill(g, poly([[tx - 0.04, wy - 0.1], [tx + 0.04, wy - 0.1], [tx + 0.04, wy + 0.06], [tx - 0.04, wy + 0.06]]), '#ffb347', 0.1);
    lights.push({ x: tx, y: wy, r: 0.3, color: '#ffb347', kind: 'window' });
  }
  // kapı meşaleleri
  for (const sx of [-1, 1]) {
    const tx = x + sx * (gateW + 0.08);
    line(g, [[tx, wallY - 0.05], [tx, wallY - 0.22]], 0.03, '#3a2a1a');
    glowFill(g, ell(tx, wallY - 0.27, 0.035, 0.06), '#ffb347', 0.12);
    lights.push({ x: tx, y: wallY - 0.28, r: 0.45, color: '#ff9a3a', kind: 'torch' });
  }
}
