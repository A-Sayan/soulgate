/* ==========================================================================
 *  SOULGATE — art/towers.js
 *  Sorumluluk : Kule çizimleri. Her kule: sabit gövde (base) + varsa dönen /
 *               süzülen baş (head). Seviye görünümü değiştirir: 1 ahşap/kaba
 *               → 2 taş → 3 taş + altın. Ustalık kendine özgü bir işaret ekler.
 *  Bağımlılık : utils (0) · art/kit.
 *
 *  Dönen meta veri:
 *   base, head        : yüzeyler (head null olabilir)
 *   headY             : başın pivot yüksekliği (çapaya göre, eksi = yukarı)
 *   aim               : baş hedefe döner mi
 *   bob               : baş süzülme genliği (hücre; 0 = sabit)
 *   eyes, eyeR, eyeColor : canlı parlayan göz noktaları
 *   lights            : [{ x, y, r, color, kind }] titreyen ışıklar
 * ========================================================================== */

import { TAU, rgba, shadeHex, mixHex } from '../utils.js';
import {
  px, surface, INK, STONE, WOOD, IRON, GOLD, BONE, P, ell, circle, poly, blob, lin, rad, paint, fill, line, curve, limb, glowLine, glowFill, softShadow, socket, towerSurface, bricks, banner,
} from './kit.js';

export const TOWER_ART = {
  /* ---------------- OKÇU KULESİ: gözetleme kulesi + döner arbalet ---------------- */
  archer(level, mastery, col) {
    const s = towerSurface();
    const g = s.g;
    const mat = level === 0 ? WOOD : STONE;
    const gy = 0.22;
    const H = 0.46 + 0.14 * level;
    const top = gy - H;
    softShadow(g, 0.06, gy, 0.52, 0.2, 0.6);

    // ön yüz
    const front = poly([[-0.33, top], [0.33, top], [0.36, gy], [-0.36, gy]]);
    paint(g, front, mat, [-0.36, top, 0.72, H]);
    g.save();
    g.clip(front);
    if (level === 0) {
      for (let x = -0.3; x < 0.34; x += 0.11) line(g, [[x, top], [x, gy]], 0.014, INK, 0.45);
      line(g, [[-0.36, top + H * 0.3], [0.36, top + H * 0.3]], 0.03, shadeHex(WOOD, -0.4));
    } else {
      bricks(g, -0.36, top, 0.36, gy, 0.1, INK, 0.35);
    }
    g.fillStyle = lin(g, 0, top, 0, gy, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.45)']]);
    g.fillRect(-0.4, top, 0.8, H);
    g.restore();

    // ok mazgalları — kulenin "gözleri"
    const slitY = top + H * 0.45;
    for (const x of [-0.13, 0.13]) fill(g, poly([[x - 0.026, slitY - 0.08], [x + 0.026, slitY - 0.08], [x + 0.022, slitY + 0.06], [x - 0.022, slitY + 0.06]]), '#050307');

    // üst platform
    const topFace = poly([[-0.39, top - 0.25], [0.39, top - 0.25], [0.39, top + 0.01], [-0.39, top + 0.01]]);
    paint(g, topFace, shadeHex(mat, 0.12), [-0.39, top - 0.25, 0.78, 0.26]);
    fill(g, poly([[-0.3, top - 0.2], [0.3, top - 0.2], [0.3, top - 0.03], [-0.3, top - 0.03]]), shadeHex(mat, -0.45));
    if (level >= 1) {
      for (let x = -0.36; x <= 0.3; x += 0.165) {
        paint(g, poly([[x, top - 0.07], [x + 0.09, top - 0.07], [x + 0.09, top + 0.02], [x, top + 0.02]]), shadeHex(STONE, 0.18), [x, top - 0.07, 0.09, 0.09], { line: 0.014 });
      }
    }
    if (level === 2) {
      line(g, [[-0.35, top + 0.06], [0.35, top + 0.06]], 0.035, GOLD);
      line(g, [[-0.35, top + 0.06], [0.35, top + 0.06]], 0.01, '#fff3c4', 0.5);
      banner(g, 0, top + 0.1, mastery === 0 ? '#2a3f7a' : '#7a1f2a', mastery === 0 ? eagleSigil : null);
    }
    if (mastery === 1) {
      for (const sx of [-1, 1]) {
        const qx = sx * 0.42;
        paint(g, poly([[qx - 0.05, top + 0.05], [qx + 0.05, top + 0.05], [qx + 0.06, top + 0.32], [qx - 0.06, top + 0.32]]), '#4a2f1c', [qx - 0.06, top, 0.12, 0.32], { line: 0.016 });
        for (let i = -1; i <= 1; i++) line(g, [[qx + i * 0.025, top + 0.05], [qx + i * 0.03, top - 0.07]], 0.012, '#d9cfbf');
      }
    }

    const head = archerHead(level, mastery);
    return {
      base: s, head, headY: top - 0.12, aim: true, bob: 0,
      eyes: [[-0.13, slitY - 0.01], [0.13, slitY - 0.01]], eyeR: 0.05, eyeColor: col.glow, lights: [],
    };
  },

  /* ---------------- ATEŞ HAVANI: yuvarlak sığınak + döner namlu ---------------- */
  mortar(level, mastery, col) {
    const s = towerSurface();
    const g = s.g;
    const gy = 0.2;
    const H = 0.28 + 0.07 * level;
    const top = gy - H;
    const R = 0.4 + 0.02 * level;
    softShadow(g, 0.05, gy, 0.55, 0.22, 0.6);

    // silindir gövde
    const bodyPath = P((p) => {
      p.moveTo(-R, top);
      p.lineTo(-R, gy);
      p.ellipse(0, gy, R, R * 0.45, 0, Math.PI, 0, true);
      p.lineTo(R, top);
      p.closePath();
    });
    const mat = level === 0 ? '#4d4038' : STONE;
    paint(g, bodyPath, mat, [-R, top, R * 2, H + R * 0.45]);
    g.save();
    g.clip(bodyPath);
    if (level > 0) bricks(g, -R, top, R, gy + 0.2, 0.09, INK, 0.3);
    for (const yy of [top + H * 0.35, gy - 0.02]) {
      g.beginPath();
      g.ellipse(0, yy, R, R * 0.45, 0, 0, Math.PI);
      g.lineWidth = 0.035;
      g.strokeStyle = level === 2 ? GOLD : IRON;
      g.stroke();
    }
    g.fillStyle = lin(g, -R, 0, R, 0, [[0, 'rgba(255,255,255,0.06)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.4)']]);
    g.fillRect(-R, top, R * 2, H + R);
    g.restore();

    // ateş ızgarası — nefes alan fırın
    const grateY = top + H * 0.62 + 0.04;
    const grate = P((p) => {
      p.moveTo(-0.11, grateY + 0.07);
      p.lineTo(-0.11, grateY - 0.01);
      p.arc(0, grateY - 0.01, 0.11, Math.PI, 0);
      p.lineTo(0.11, grateY + 0.07);
      p.closePath();
    });
    fill(g, grate, '#140604');
    g.save();
    g.clip(grate);
    g.fillStyle = rad(g, 0, grateY + 0.04, 0.14, [[0, 'rgba(255,140,40,0.9)'], [1, 'rgba(120,20,0,0.2)']]);
    g.fillRect(-0.12, grateY - 0.12, 0.24, 0.2);
    g.restore();
    for (const x of [-0.055, 0, 0.055]) line(g, [[x, grateY - 0.09], [x, grateY + 0.07]], 0.016, IRON);
    g.lineWidth = 0.018;
    g.strokeStyle = INK;
    g.stroke(grate);

    // üst kapak
    paint(g, ell(0, top, R, R * 0.45), shadeHex(mat, 0.15), [-R, top - R * 0.45, R * 2, R * 0.9]);
    fill(g, ell(0, top, R * 0.72, R * 0.32), shadeHex(mat, -0.4));
    if (level >= 1) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        fill(g, circle(Math.cos(a) * R * 0.86, top + Math.sin(a) * R * 0.38, 0.025), IRON);
      }
    }
    if (mastery === 0) for (const x of [-0.25, 0.25]) glowLine(g, [[x, top + 0.04], [x * 0.7, gy - 0.02]], 0.02, '#ff5a1f');
    if (mastery === 1) for (const x of [-0.3, -0.1, 0.1, 0.3]) glowLine(g, [[x, top + 0.05], [x, top + 0.12]], 0.024, '#ffb35c');

    return {
      base: s, head: mortarHead(level, mastery), headY: top, aim: true, bob: 0,
      eyes: [], eyeR: 0, eyeColor: col.glow,
      lights: [{ x: 0, y: grateY + 0.02, r: 0.32, color: '#ff7a2f', kind: 'fire' }],
    };
  },

  /* ---------------- AYAZ OBELİSKİ: altıgen taş + süzülen kristal ---------------- */
  frost(level, mastery, col) {
    const s = towerSurface();
    const g = s.g;
    const gy = 0.22;
    const H = 0.78 + 0.13 * level;
    const top = gy - H;
    softShadow(g, 0.06, gy, 0.46, 0.18, 0.6);

    // kaide
    paint(g, poly([[-0.36, gy - 0.12], [0.36, gy - 0.12], [0.38, gy + 0.04], [-0.38, gy + 0.04]]), '#3d4250', [-0.38, gy - 0.12, 0.76, 0.16]);
    paint(g, poly([[-0.36, gy - 0.2], [0.36, gy - 0.2], [0.36, gy - 0.12], [-0.36, gy - 0.12]]), '#535a6a', [-0.36, gy - 0.2, 0.72, 0.08], { line: 0.016 });

    // iki görünür yüz — sol aydınlık, sağ gölgede
    const wB = 0.24;
    const wT = 0.13;
    const left = poly([[-wB, gy - 0.2], [0, gy - 0.2], [0, top], [-wT, top + 0.05]]);
    const right = poly([[0, gy - 0.2], [wB, gy - 0.2], [wT, top + 0.05], [0, top]]);
    paint(g, left, '#4a5266', [-wB, top, wB, H], { light: 0.25, dark: 0.2 });
    paint(g, right, '#2c3140', [0, top, wB, H], { light: 0.05, dark: 0.45 });
    // sivri tepe
    paint(g, poly([[-wT, top + 0.05], [0, top - 0.12], [wT, top + 0.05], [0, top]]), '#5d6680', [-wT, top - 0.12, wT * 2, 0.17], { line: 0.016 });

    // parlayan rünler
    const runeC = mastery === 1 ? '#d8f8ff' : col.glow;
    for (let i = 0; i < 2 + level; i++) {
      const y = gy - 0.3 - i * (H * 0.75) / (2 + level);
      glowLine(g, [[-0.1, y], [-0.05, y - 0.06], [-0.1, y - 0.12]], 0.016, runeC);
      glowLine(g, [[0.05, y - 0.03], [0.1, y - 0.08]], 0.014, runeC);
    }
    if (level === 2) {
      line(g, [[-wB, gy - 0.2], [wB, gy - 0.2]], 0.03, '#9fd6e6');
    }
    if (mastery === 0) {
      for (const [x, h] of [[-0.11, 0.2], [-0.04, 0.28], [0.04, 0.26], [0.11, 0.18]]) {
        paint(g, poly([[x - 0.03, top + 0.06], [x + 0.03, top + 0.06], [x, top + 0.06 - h]]), '#bff4ff', [x - 0.03, top - h, 0.06, h], { light: 0.4, dark: 0.3, line: 0.012 });
      }
    }

    return {
      base: s, head: frostHead(level, mastery, col), headY: top - 0.42, aim: false, bob: 0.05,
      eyes: [[0, 0]], eyeR: 0.055 + 0.01 * level, eyeColor: '#ffffff', eyesOnHead: true,
      lights: [{ x: 0, y: top - 0.42, r: 0.6, color: col.glow, kind: 'core' }],
    };
  },

  /* ---------------- FIRTINA KULESİ: demir bobin + küre ---------------- */
  tesla(level, mastery, col) {
    const s = towerSurface();
    const g = s.g;
    const gy = 0.22;
    softShadow(g, 0.05, gy, 0.48, 0.18, 0.6);
    // taş ayak
    paint(g, ell(0, gy - 0.02, 0.36, 0.15), '#4a4450', [-0.36, gy - 0.17, 0.72, 0.3]);
    paint(g, poly([[-0.36, gy - 0.1], [0.36, gy - 0.1], [0.36, gy - 0.02], [-0.36, gy - 0.02]]), '#4a4450', [-0.36, gy - 0.1, 0.72, 0.1], { line: 0 });
    paint(g, ell(0, gy - 0.1, 0.36, 0.15), '#5d5666', [-0.36, gy - 0.25, 0.72, 0.3]);

    // üst üste daralan demir halkalar
    const tiers = 3 + level;
    let y = gy - 0.12;
    let r = 0.26;
    for (let i = 0; i < tiers; i++) {
      const h = 0.13;
      const rr = r * 0.86;
      const seg = P((p) => {
        p.moveTo(-r, y);
        p.lineTo(-rr, y - h);
        p.lineTo(rr, y - h);
        p.lineTo(r, y);
        p.ellipse(0, y, r, r * 0.35, 0, 0, Math.PI);
        p.closePath();
      });
      paint(g, seg, IRON, [-r, y - h, r * 2, h + r * 0.35]);
      // bakır sargı
      for (let k = -2; k <= 2; k++) line(g, [[k * rr * 0.4 - 0.03, y - h + 0.02], [k * r * 0.4 + 0.03, y - 0.01]], 0.018, '#b8733a', 0.9);
      paint(g, ell(0, y - h, rr, rr * 0.35), shadeHex(IRON, 0.15), [-rr, y - h - rr * 0.35, rr * 2, rr * 0.7], { line: 0.014 });
      y -= h;
      r = rr * 0.95;
    }
    const top = y;
    line(g, [[0, top], [0, top - 0.22]], 0.04, IRON);
    line(g, [[-0.01, top], [-0.01, top - 0.22]], 0.012, '#8a8a9a', 0.6);
    if (mastery === 0) {
      for (const sx of [-1, 1]) line(g, [[sx * 0.12, top + 0.02], [sx * 0.22, top - 0.3]], 0.025, IRON);
    }

    return {
      base: s, head: teslaHead(level, mastery, col), headY: top - 0.3, aim: false, bob: 0.02,
      eyes: [], eyeR: 0, eyeColor: col.glow,
      lights: [{ x: 0, y: top - 0.3, r: 0.48 + level * 0.06, color: col.glow, kind: 'core' }],
    };
  },

  /* ---------------- VEBA KAZANI: ayaklı kazan + ocak + kuru kafa ---------------- */
  poison(level, mastery, col) {
    const s = towerSurface();
    const g = s.g;
    const gy = 0.22;
    const rot = mastery === 1;
    const liquid = rot ? '#9a4fd0' : col.glow;
    softShadow(g, 0.05, gy, 0.55, 0.22, 0.6);

    // ocak taşları (arka yarı)
    const hearth = '#4a4148';
    const stones = [];
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU;
      stones.push([Math.cos(a) * 0.4, gy - 0.02 + Math.sin(a) * 0.16, Math.sin(a)]);
    }
    for (const [x, y, d] of stones) if (d < 0) paint(g, ell(x, y, 0.075, 0.055), hearth, [x - 0.08, y - 0.06, 0.16, 0.12], { line: 0.012 });
    // kor ve alevler
    g.fillStyle = rad(g, 0, gy - 0.04, 0.32, [[0, 'rgba(255,150,60,0.75)'], [1, 'rgba(120,20,0,0)']]);
    g.fillRect(-0.36, gy - 0.3, 0.72, 0.4);
    for (const [x, h] of [[-0.13, 0.13], [-0.03, 0.18], [0.08, 0.15], [0.16, 0.1]]) {
      glowFill(g, blob([[x - 0.045, gy + 0.01], [x - 0.01, gy - h * 0.6], [x, gy + 0.01 - h], [x + 0.045, gy + 0.01]]), '#ff8a2a', 0.07, 0.95);
    }

    // kazan (üç ayak üstünde)
    const cy = gy - 0.46;
    const iron = '#3a3844';
    for (const lx of [-0.22, 0, 0.22]) {
      paint(g, poly([[lx - 0.035, cy + 0.26], [lx + 0.035, cy + 0.26], [lx + 0.025, gy - 0.02], [lx - 0.025, gy - 0.02]]), iron, [lx - 0.04, cy + 0.26, 0.08, 0.2], { line: 0.012 });
    }
    const bowl = P((p) => {
      p.moveTo(-0.37, cy);
      p.bezierCurveTo(-0.42, cy + 0.42, 0.42, cy + 0.42, 0.37, cy);
      p.closePath();
    });
    paint(g, bowl, iron, [-0.4, cy, 0.8, 0.34], { light: 0.4, dark: 0.45, line: 0.024 });
    g.save();
    g.clip(bowl);
    g.fillStyle = rad(g, 0, cy + 0.4, 0.4, [[0, 'rgba(255,120,40,0.35)'], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(-0.4, cy, 0.8, 0.4);
    line(g, [[-0.38, cy + 0.1], [0.38, cy + 0.1]], 0.025, level === 2 ? GOLD : shadeHex(iron, -0.3), 0.9);
    g.restore();
    // tutamaçlar
    if (level >= 1) {
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.ellipse(sx * 0.42, cy + 0.06, 0.06, 0.07, 0, 0, TAU);
        g.lineWidth = 0.025;
        g.strokeStyle = INK;
        g.stroke();
        g.lineWidth = 0.014;
        g.strokeStyle = '#6a6676';
        g.stroke();
      }
    }
    // ağız kenarı + sıvı
    paint(g, ell(0, cy, 0.38, 0.12), '#55525f', [-0.38, cy - 0.12, 0.76, 0.24], { light: 0.35, dark: 0.3, line: 0.022 });
    g.save();
    g.shadowColor = liquid;
    g.shadowBlur = 0.1 * px;
    g.fillStyle = rad(g, -0.06, cy - 0.01, 0.32, [[0, mixHex(liquid, '#ffffff', 0.5)], [0.45, liquid], [1, shadeHex(liquid, -0.55)]]);
    g.fill(ell(0, cy + 0.008, 0.31, 0.088));
    g.restore();
    for (const [bx, by, br] of [[-0.12, cy - 0.01, 0.025], [0.08, cy + 0.02, 0.018], [0.17, cy - 0.015, 0.014]]) {
      g.lineWidth = 0.008;
      g.strokeStyle = mixHex(liquid, '#ffffff', 0.6);
      g.stroke(circle(bx, by, br));
    }
    if (rot) {
      for (const [x, a] of [[-0.14, -0.5], [0.12, 0.4]]) {
        g.save();
        g.translate(x, cy - 0.02);
        g.rotate(a);
        line(g, [[0, 0], [0, -0.16]], 0.03, INK);
        line(g, [[0, 0], [0, -0.16]], 0.018, BONE);
        fill(g, circle(0, -0.17, 0.02), BONE);
        g.restore();
      }
    }
    if (mastery === 0) {
      for (const [x, y, r] of [[-0.12, cy - 0.12, 0.09], [0.05, cy - 0.2, 0.11], [0.16, cy - 0.1, 0.07]]) {
        g.fillStyle = rad(g, x, y, r, [[0, rgba(col.glow, 0.35)], [1, rgba(col.glow, 0)]]);
        g.fill(circle(x, y, r));
      }
    }
    // kuru kafa — kazanın önünde
    const sy = cy + 0.19;
    paint(g, blob([[-0.08, sy - 0.02], [-0.075, sy - 0.1], [0, sy - 0.13], [0.075, sy - 0.1], [0.08, sy - 0.02], [0.045, sy + 0.045], [-0.045, sy + 0.045]]), BONE, [-0.08, sy - 0.13, 0.16, 0.18], { line: 0.016 });
    socket(g, -0.032, sy - 0.045, 0.024);
    socket(g, 0.032, sy - 0.045, 0.024);
    for (const x of [-0.028, 0, 0.028]) line(g, [[x, sy + 0.01], [x, sy + 0.045]], 0.009, INK, 0.7);
    // ocak taşları (ön yarı)
    for (const [x, y, d] of stones) if (d >= 0) paint(g, ell(x, y, 0.08, 0.058), shadeHex(hearth, 0.08), [x - 0.08, y - 0.06, 0.16, 0.12], { line: 0.012 });

    return {
      base: s, head: null, headY: cy, aim: false, bob: 0,
      eyes: [[-0.032, sy - 0.045], [0.032, sy - 0.045]], eyeR: 0.028, eyeColor: liquid,
      lights: [
        { x: 0, y: cy, r: 0.42, color: liquid, kind: 'core' },
        { x: 0, y: gy - 0.05, r: 0.28, color: '#ff7a2f', kind: 'fire' },
      ],
    };
  },

  /* ---------------- LANET TOTEMİ: oyma yüz + boynuzlar ---------------- */
  curse(level, mastery, col) {
    const s = towerSurface();
    const g = s.g;
    const gy = 0.22;
    const doom = mastery === 1;
    const wood = doom ? '#3a1218' : '#3e2a22';
    const H = 0.8 + 0.12 * level;
    const top = gy - H;
    softShadow(g, 0.05, gy, 0.42, 0.17, 0.6);
    // kemik/taş yığını
    for (const [x, y, rx, c] of [[-0.24, gy - 0.02, 0.11, '#4a4450'], [0.22, gy, 0.12, '#4a4450'], [-0.08, gy + 0.04, 0.1, BONE], [0.1, gy + 0.05, 0.08, '#5a5260']]) {
      paint(g, ell(x, y, rx, rx * 0.65), c, [x - rx, y - rx, rx * 2, rx * 2], { line: 0.014 });
    }
    // direk
    const w = 0.15 + 0.015 * level;
    const pole = poly([[-w, gy], [-w * 0.92, top + 0.1], [w * 0.92, top + 0.1], [w, gy]]);
    paint(g, pole, wood, [-w, top, w * 2, H], { light: 0.3, dark: 0.55 });
    g.save();
    g.clip(pole);
    for (let x = -w; x < w; x += 0.06) curve(g, [[x, gy], [x + 0.02, (gy + top) / 2], [x - 0.01, top]], 0.01, INK, 0.35);
    g.restore();
    // oyma bantlar
    for (const y of [gy - H * 0.35, gy - H * 0.55]) {
      line(g, [[-w, y], [w, y]], 0.03, shadeHex(wood, -0.5));
      for (let x = -w + 0.03; x < w; x += 0.06) fill(g, poly([[x, y - 0.03], [x + 0.03, y], [x, y + 0.03], [x - 0.03, y]]), col.main, 0.7);
    }
    // yüz
    const fy = top + 0.22;
    paint(g, blob([[-w * 1.15, fy - 0.12], [0, fy - 0.17], [w * 1.15, fy - 0.12], [w * 1.2, fy + 0.08], [0, fy + 0.18], [-w * 1.2, fy + 0.08]]), shadeHex(wood, 0.15), [-w * 1.2, fy - 0.17, w * 2.4, 0.35]);
    line(g, [[-w * 0.9, fy - 0.07], [-0.02, fy - 0.03]], 0.03, INK); // kaşlar
    line(g, [[w * 0.9, fy - 0.07], [0.02, fy - 0.03]], 0.03, INK);
    socket(g, -0.055, fy, 0.032);
    socket(g, 0.055, fy, 0.032);
    fill(g, poly([[-0.07, fy + 0.08], [0.07, fy + 0.08], [0.05, fy + 0.13], [-0.05, fy + 0.13]]), '#0b0507');
    for (const x of [-0.045, 0.045]) fill(g, poly([[x - 0.015, fy + 0.08], [x + 0.015, fy + 0.08], [x, fy + 0.12]]), BONE);
    // boynuzlar
    const hs = (doom ? 1.35 : 1) * (0.9 + level * 0.08);
    for (const sx of [-1, 1]) {
      const horn = P((p) => {
        p.moveTo(sx * w * 0.6, top + 0.12);
        p.quadraticCurveTo(sx * (w + 0.28 * hs), top + 0.05, sx * (w + 0.22 * hs), top - 0.3 * hs);
        p.quadraticCurveTo(sx * (w + 0.12 * hs), top - 0.02, sx * w * 0.2, top + 0.1);
        p.closePath();
      });
      paint(g, horn, doom ? '#c9b8a0' : BONE, [-0.5, top - 0.35, 1, 0.5], { light: 0.2, dark: 0.45, line: 0.016 });
    }
    if (mastery === 0) {
      for (const sx of [-1, 1]) {
        const lx = sx * (w + 0.12);
        line(g, [[sx * w, top + 0.35], [lx, top + 0.38], [lx, top + 0.46]], 0.012, INK);
        paint(g, poly([[lx - 0.04, top + 0.46], [lx + 0.04, top + 0.46], [lx + 0.035, top + 0.56], [lx - 0.035, top + 0.56]]), '#2a2420', [lx - 0.04, top + 0.46, 0.08, 0.1], { line: 0.01 });
      }
    }
    if (level === 2) line(g, [[-w, top + 0.1], [w, top + 0.1]], 0.025, GOLD);

    const lights = [];
    if (mastery === 0) for (const sx of [-1, 1]) lights.push({ x: sx * (0.15 + 0.12 + 0.015 * level), y: top + 0.51, r: 0.22, color: '#9fffd8', kind: 'lantern' });
    return {
      base: s, head: null, headY: fy, aim: false, bob: 0,
      eyes: [[-0.055, fy], [0.055, fy]], eyeR: 0.04, eyeColor: doom ? '#ff2a3c' : col.glow,
      lights,
      rune: { y: gy - 0.02, r: 0.5, color: doom ? '#ff2a3c' : col.glow }, // tabanda dönen rün halkası
    };
  },
};

function eagleSigil(g, x, y) {
  fill(g, poly([[x, y - 0.03], [x + 0.07, y - 0.06], [x + 0.03, y + 0.02], [x, y + 0.06], [x - 0.03, y + 0.02], [x - 0.07, y - 0.06]]), GOLD);
}

/* — Kule başları (0 açısı = sağa bakar) — */
function archerHead(level, mastery) {
  const s = surface(1.1, 1.1, 0.55, 0.55);
  const g = s.g;
  const k = 0.95 + level * 0.07 + (mastery >= 0 ? 0.05 : 0);
  g.scale(k, k);
  fill(g, circle(0, 0, 0.13), INK, 0.5);
  paint(g, circle(0, 0, 0.11), IRON, [-0.11, -0.11, 0.22, 0.22], { line: 0.016 });
  const angles = mastery === 1 ? [-0.35, 0, 0.35] : [0];
  for (const a of angles) {
    g.save();
    g.rotate(a);
    const wood = mastery === 0 ? '#3b2a1a' : '#5c4330';
    paint(g, poly([[-0.16, -0.035], [0.3, -0.03], [0.3, 0.03], [-0.16, 0.035]]), wood, [-0.16, -0.035, 0.46, 0.07], { line: 0.016 });
    // yay kolları
    const tipX = 0.1;
    curve(g, [[0.22, 0], [0.19, -0.14], [tipX, -0.26]], 0.04, INK);
    curve(g, [[0.22, 0], [0.19, 0.14], [tipX, 0.26]], 0.04, INK);
    curve(g, [[0.22, 0], [0.19, -0.14], [tipX, -0.26]], 0.026, mastery === 0 ? GOLD : '#6b4a2a');
    curve(g, [[0.22, 0], [0.19, 0.14], [tipX, 0.26]], 0.026, mastery === 0 ? GOLD : '#6b4a2a');
    line(g, [[tipX, -0.26], [-0.02, 0], [tipX, 0.26]], 0.008, '#d9cfbf', 0.85);
    // ok
    line(g, [[-0.04, 0], [0.36, 0]], 0.014, '#cbb89a');
    fill(g, poly([[0.36, -0.03], [0.43, 0], [0.36, 0.03]]), '#c8d0d8');
    g.restore();
  }
  return s;
}

function mortarHead(level, mastery) {
  const s = surface(1.2, 1.2, 0.6, 0.6);
  const g = s.g;
  const k = 0.95 + level * 0.06;
  g.scale(k, k);
  const hell = mastery === 0;
  const quake = mastery === 1;
  const bw = quake ? 0.14 : 0.105;
  const len = 0.36;
  fill(g, circle(0.01, 0.02, 0.19), INK, 0.5);
  paint(g, circle(0, 0, 0.17), IRON, [-0.17, -0.17, 0.34, 0.34]);
  const barrelC = hell ? '#4a1a12' : quake ? '#3a3640' : '#6a5030';
  paint(g, poly([[-0.04, -bw], [len, -bw * 1.08], [len, bw * 1.08], [-0.04, bw]]), barrelC, [-0.04, -bw, len, bw * 2]);
  for (const x of [0.08, 0.2]) paint(g, poly([[x, -bw * 1.12], [x + 0.04, -bw * 1.12], [x + 0.04, bw * 1.12], [x, bw * 1.12]]), level === 2 ? GOLD : '#2a2830', [x, -bw, 0.04, bw * 2], { line: 0.01 });
  paint(g, ell(len, 0, 0.05, bw * 1.25), shadeHex(barrelC, 0.2), [len - 0.05, -bw, 0.1, bw * 2.5]);
  fill(g, ell(len + 0.01, 0, 0.03, bw * 0.85), '#090406');
  if (hell) {
    for (let i = -2; i <= 2; i++) fill(g, poly([[len - 0.01, i * bw * 0.4 - 0.02], [len + 0.07, i * bw * 0.4], [len - 0.01, i * bw * 0.4 + 0.02]]), BONE);
    glowFill(g, ell(len + 0.01, 0, 0.02, bw * 0.6), '#ff5a1f', 0.1);
  }
  if (quake) for (const x of [0.05, 0.14, 0.26]) glowLine(g, [[x, -bw * 0.6], [x + 0.03, 0], [x, bw * 0.6]], 0.014, '#ffb35c', 0.06);
  paint(g, circle(-0.02, 0, 0.07), shadeHex(IRON, 0.2), [-0.09, -0.07, 0.14, 0.14], { line: 0.012 });
  return s;
}

function frostHead(level, mastery, col) {
  const s = surface(1, 1.2, 0.5, 0.6);
  const g = s.g;
  const k = 0.85 + level * 0.12 + (mastery === 0 ? 0.15 : 0);
  g.scale(k, k);
  const crystal = (cx, cy, sc) => {
    const top = [cx, cy - 0.3 * sc];
    const l = [cx - 0.12 * sc, cy - 0.02 * sc];
    const r = [cx + 0.12 * sc, cy - 0.02 * sc];
    const b = [cx, cy + 0.18 * sc];
    const m = [cx + 0.02 * sc, cy - 0.04 * sc];
    g.save();
    g.shadowColor = col.glow;
    g.shadowBlur = 0.15 * px;
    fill(g, poly([top, r, b, l]), col.glow, 0.5);
    g.restore();
    paint(g, poly([top, m, b, l]), '#bff4ff', [l[0], top[1], 0.24 * sc, 0.48 * sc], { light: 0.4, dark: 0.1, line: 0.014 });
    paint(g, poly([top, r, b, m]), '#58a8c8', [m[0], top[1], 0.12 * sc, 0.48 * sc], { light: 0.1, dark: 0.35, line: 0.014 });
    line(g, [top, m, b], 0.008, '#ffffff', 0.7);
  };
  if (mastery === 1) {
    crystal(-0.17, 0.08, 0.4);
    crystal(0.18, 0.1, 0.35);
  }
  crystal(0, 0, 1);
  return s;
}

function teslaHead(level, mastery, col) {
  const s = surface(1, 1, 0.5, 0.5);
  const g = s.g;
  const big = mastery === 0;
  const r = (0.12 + level * 0.015) * (big ? 1.35 : 1);
  const orb = (x, y, rr) => {
    g.save();
    g.shadowColor = col.glow;
    g.shadowBlur = 0.1 * px;
    g.fillStyle = rad(g, x - rr * 0.35, y - rr * 0.35, rr * 1.1, [[0, '#ffffff'], [0.3, col.glow], [1, col.main]]);
    g.fill(circle(x, y, rr));
    g.restore();
    g.lineWidth = 0.014;
    g.strokeStyle = INK;
    g.stroke(circle(x, y, rr));
  };
  if (mastery === 1) {
    for (const sx of [-1, 1]) {
      line(g, [[0, 0.05], [sx * 0.2, -0.05]], 0.025, IRON);
      orb(sx * 0.22, -0.08, r * 0.45);
    }
  }
  if (big) for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    line(g, [[Math.cos(a) * r, Math.sin(a) * r], [Math.cos(a) * (r + 0.07), Math.sin(a) * (r + 0.07)]], 0.018, IRON);
  }
  orb(0, 0, r);
  return s;
}

/* ==========================================================================
 * YENİ KULELER — Mızrak Atar, Kristal Prizma, Ejder Ağzı, Kara Avcı,
 *                Savaş Çanı, Ruh Kuyusu
 *  Ek meta veri: swing → baş, asıldığı noktadan sarkaç gibi sallanır (çan).
 * ======================================================================== */
Object.assign(TOWER_ART, {
  /* ---------------- MIZRAK ATAR: basamaklı taş kaide + döner balista ---------------- */
  lance(level, mastery, col) {
    const s = towerSurface();
    const g = s.g;
    const gy = 0.22;
    const stone = level === 0 ? '#5a4a3a' : STONE;
    const H = 0.3 + 0.06 * level;
    const top = gy - H;
    softShadow(g, 0.06, gy, 0.54, 0.2, 0.6);
    // alt basamak
    paint(g, poly([[-0.44, gy + 0.02], [0.44, gy + 0.02], [0.4, gy - 0.1], [-0.4, gy - 0.1]]), shadeHex(stone, -0.12), [-0.44, gy - 0.1, 0.88, 0.12], { line: 0.018 });
    // gövde
    const body = poly([[-0.34, gy - 0.1], [0.34, gy - 0.1], [0.3, top], [-0.3, top]]);
    paint(g, body, stone, [-0.34, top, 0.68, H - 0.1]);
    g.save();
    g.clip(body);
    if (level === 0) for (let x = -0.3; x < 0.34; x += 0.12) line(g, [[x, top], [x, gy]], 0.014, INK, 0.4);
    else bricks(g, -0.34, top, 0.34, gy, 0.09, INK, 0.32);
    g.fillStyle = lin(g, 0, top, 0, gy, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.45)']]);
    g.fillRect(-0.4, top, 0.8, H);
    g.restore();
    // demir ön plaka ve perçinler
    const py = top + H * 0.42;
    paint(g, poly([[-0.12, py - 0.07], [0.12, py - 0.07], [0.1, py + 0.08], [-0.1, py + 0.08]]), IRON, [-0.12, py - 0.07, 0.24, 0.15], { line: 0.014 });
    for (const x of [-0.08, 0.08]) fill(g, circle(x, py - 0.03, 0.014), '#8a8a9a');
    // üst tabla
    paint(g, ell(0, top, 0.34, 0.13), shadeHex(stone, 0.14), [-0.34, top - 0.13, 0.68, 0.26], { line: 0.018 });
    if (level >= 1) line(g, [[-0.3, top + 0.08], [0.3, top + 0.08]], 0.03, level === 2 ? GOLD : IRON);
    // yan rafta yedek mızraklar
    for (const [x, a] of [[-0.4, -0.12], [-0.47, -0.2]]) {
      g.save();
      g.translate(x, gy - 0.02);
      g.rotate(a);
      line(g, [[0, 0], [0, -0.5 - level * 0.04]], 0.032, INK);
      line(g, [[0, 0], [0, -0.5 - level * 0.04]], 0.018, '#7a5a3a');
      fill(g, poly([[-0.03, -0.5 - level * 0.04], [0.03, -0.5 - level * 0.04], [0, -0.6 - level * 0.04]]), '#c8d0d8');
      g.restore();
    }
    if (mastery === 0) banner(g, 0.36, top - 0.02, '#7a1f2a', null);
    if (mastery === 1) {
      // halat kangalı
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.ellipse(0.36, gy - 0.12 - i * 0.03, 0.09, 0.04, 0, 0, TAU);
        g.lineWidth = 0.02;
        g.strokeStyle = i % 2 ? '#8a6a3a' : '#6a4a2a';
        g.stroke();
      }
    }
    return {
      base: s, head: lanceHead(level, mastery), headY: top - 0.06, aim: true, bob: 0,
      eyes: [[0, py + 0.01]], eyeR: 0.035, eyeColor: col.glow, lights: [],
    };
  },

  /* ---------------- KRİSTAL PRİZMA: taş halka + sütunlar + süzülen kristal ---------------- */
  prism(level, mastery, col) {
    const s = towerSurface();
    const g = s.g;
    const gy = 0.22;
    const pillarTop = gy - 0.62 - level * 0.08;
    softShadow(g, 0.05, gy, 0.48, 0.18, 0.6);
    // kaide: iki katlı yuvarlak taş
    paint(g, ell(0, gy - 0.02, 0.38, 0.15), '#3a4048', [-0.38, gy - 0.17, 0.76, 0.3], { line: 0.018 });
    paint(g, poly([[-0.38, gy - 0.1], [0.38, gy - 0.1], [0.38, gy - 0.02], [-0.38, gy - 0.02]]), '#3a4048', [-0.38, gy - 0.1, 0.76, 0.1], { line: 0 });
    paint(g, ell(0, gy - 0.1, 0.38, 0.15), '#4e5866', [-0.38, gy - 0.25, 0.76, 0.3], { line: 0.018 });
    // kaidedeki rün halkası
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      const x = Math.cos(a) * 0.28;
      const y = gy - 0.1 + Math.sin(a) * 0.1;
      glowLine(g, [[x - 0.03, y], [x, y - 0.025], [x + 0.03, y]], 0.012, col.glow, 0.06);
    }
    // eğik sütunlar (arka önce)
    const pillars = level === 0 ? [[-0.24, 1], [0.24, 1]] : [[0, 0], [-0.26, 1], [0.26, 1]];
    for (const [x, front] of pillars) {
      const lean = -x * 0.35;
      const p = poly([[x - 0.05, gy - 0.12], [x + 0.05, gy - 0.12], [x + lean + 0.03, pillarTop], [x + lean - 0.03, pillarTop]]);
      paint(g, p, front ? '#5d6680' : '#3a4050', [x - 0.05, pillarTop, 0.1, 0.5], { light: front ? 0.3 : 0.1, dark: 0.45, line: 0.016 });
      fill(g, circle(x + lean, pillarTop, 0.035), level === 2 ? GOLD : '#7a8496');
    }
    const headY = pillarTop - 0.22;
    return {
      base: s, head: prismHead(level, mastery, col), headY, aim: false, bob: 0.04,
      eyes: [[0, 0]], eyeR: 0.05 + level * 0.01, eyeColor: '#ffffff', eyesOnHead: true,
      lights: [{ x: 0, y: headY, r: 0.55 + level * 0.05, color: col.glow, kind: 'core' }],
    };
  },

  /* ---------------- EJDER AĞZI: tuğla ocak + döner ejder kafası ---------------- */
  flame(level, mastery, col) {
    const s = towerSurface();
    const g = s.g;
    const gy = 0.22;
    const H = 0.34 + 0.06 * level;
    const top = gy - H;
    const black = mastery === 0;
    softShadow(g, 0.05, gy, 0.52, 0.2, 0.6);
    const brick = level === 0 ? '#5a3a2a' : '#6a4a3a';
    const body = poly([[-0.38, gy], [0.38, gy], [0.32, top], [-0.32, top]]);
    paint(g, body, brick, [-0.38, top, 0.76, H]);
    g.save();
    g.clip(body);
    bricks(g, -0.38, top, 0.38, gy, 0.08, INK, 0.38);
    g.fillStyle = lin(g, 0, top, 0, gy, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.4)']]);
    g.fillRect(-0.4, top, 0.8, H);
    g.restore();
    // kor ızgarası
    const grY = top + H * 0.58;
    const grate = poly([[-0.14, grY - 0.06], [0.14, grY - 0.06], [0.12, grY + 0.08], [-0.12, grY + 0.08]]);
    fill(g, grate, '#140604');
    g.save();
    g.clip(grate);
    g.fillStyle = rad(g, 0, grY + 0.04, 0.16, [[0, black ? 'rgba(200,90,255,0.95)' : 'rgba(255,170,60,0.95)'], [1, 'rgba(90,10,0,0.3)']]);
    g.fillRect(-0.15, grY - 0.08, 0.3, 0.18);
    g.restore();
    for (const x of [-0.07, 0, 0.07]) line(g, [[x, grY - 0.06], [x, grY + 0.08]], 0.014, IRON);
    // üst tabla
    paint(g, ell(0, top, 0.33, 0.12), '#3a2a24', [-0.33, top - 0.12, 0.66, 0.24], { line: 0.018 });
    if (level >= 1) for (const x of [-0.3, 0.3]) paint(g, poly([[x - 0.05, top + 0.02], [x + 0.05, top + 0.02], [x + 0.03, top - 0.14], [x - 0.03, top - 0.14]]), IRON, [x - 0.05, top - 0.14, 0.1, 0.16], { line: 0.012 });
    if (level === 2) line(g, [[-0.33, top + 0.1], [0.33, top + 0.1]], 0.026, GOLD);
    if (mastery === 1) {
      // çember: tablanın çevresinde alev delikleri
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        glowFill(g, circle(Math.cos(a) * 0.27, top + Math.sin(a) * 0.1, 0.03), '#ffb347', 0.06);
      }
    }
    return {
      base: s, head: flameHead(level, mastery, col), headY: top - 0.08, aim: mastery !== 1, bob: 0,
      eyes: [], eyeR: 0, eyeColor: col.glow,
      lights: [{ x: 0, y: grY + 0.02, r: 0.34, color: black ? '#c86aff' : '#ff7a2f', kind: 'fire' }],
    };
  },

  /* ---------------- KARA AVCI: uzun nöbet kulesi + uzun namlulu arbalet ---------------- */
  hunter(level, mastery, col) {
    const s = towerSurface();
    const g = s.g;
    const gy = 0.22;
    const H = 0.78 + 0.12 * level;
    const top = gy - H;
    const mat = level === 0 ? '#3e3428' : '#3e3a46';
    softShadow(g, 0.06, gy, 0.42, 0.17, 0.6);
    const body = poly([[-0.24, gy], [0.24, gy], [0.18, top], [-0.18, top]]);
    paint(g, body, mat, [-0.24, top, 0.48, H]);
    g.save();
    g.clip(body);
    if (level === 0) for (let x = -0.22; x < 0.24; x += 0.09) line(g, [[x, top], [x, gy]], 0.012, INK, 0.45);
    else bricks(g, -0.24, top, 0.24, gy, 0.09, INK, 0.3);
    g.fillStyle = lin(g, 0, top, 0, gy, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.5)']]);
    g.fillRect(-0.3, top, 0.6, H);
    g.restore();
    // çapraz destek kirişleri
    for (const sx of [-1, 1]) line(g, [[sx * 0.24, gy], [sx * 0.34, gy - 0.3]], 0.03, '#2a2018');
    // gözetleme mazgalı (göz)
    const slitY = top + H * 0.32;
    fill(g, poly([[-0.03, slitY - 0.07], [0.03, slitY - 0.07], [0.025, slitY + 0.05], [-0.025, slitY + 0.05]]), '#050307');
    // kukuletalı platform
    const plat = poly([[-0.3, top + 0.04], [0.3, top + 0.04], [0.26, top - 0.06], [-0.26, top - 0.06]]);
    paint(g, plat, shadeHex(mat, 0.15), [-0.3, top - 0.06, 0.6, 0.1], { line: 0.016 });
    const hood = poly([[-0.28, top - 0.3], [0, top - 0.48], [0.28, top - 0.3], [0.24, top - 0.26], [-0.24, top - 0.26]]);
    paint(g, hood, mastery === 1 ? '#3a0e14' : '#1e2230', [-0.28, top - 0.48, 0.56, 0.22], { light: 0.2, dark: 0.5, line: 0.018 });
    for (const x of [-0.22, 0.22]) line(g, [[x, top - 0.27], [x, top - 0.05]], 0.022, '#2a2018');
    if (level === 2) line(g, [[-0.26, top - 0.28], [0.26, top - 0.28]], 0.022, GOLD);
    if (mastery === 0) {
      // dev avcısı: kemik ganimetler
      for (const x of [-0.18, 0.14]) {
        line(g, [[x, top + 0.06], [x, top + 0.2]], 0.01, INK);
        paint(g, ell(x, top + 0.24, 0.04, 0.05), BONE, [x - 0.04, top + 0.19, 0.08, 0.1], { line: 0.01 });
      }
    }
    return {
      base: s, head: hunterHead(level, mastery), headY: top - 0.14, aim: true, bob: 0,
      eyes: [[0, slitY - 0.01]], eyeR: 0.035, eyeColor: mastery === 1 ? '#ff3b3b' : col.glow, lights: [],
    };
  },

  /* ---------------- SAVAŞ ÇANI: taş çan kulesi, asılı çan (sallanır) ---------------- */
  bell(level, mastery, col) {
    const s = towerSurface();
    const g = s.g;
    const gy = 0.22;
    const H = 0.86 + 0.08 * level;
    const top = gy - H;
    const knell = mastery === 1;
    softShadow(g, 0.06, gy, 0.5, 0.18, 0.6);
    // kaide
    paint(g, poly([[-0.4, gy + 0.02], [0.4, gy + 0.02], [0.36, gy - 0.12], [-0.36, gy - 0.12]]), level === 0 ? '#4a4038' : STONE, [-0.4, gy - 0.12, 0.8, 0.14], { line: 0.018 });
    // iki sütun
    for (const sx of [-1, 1]) {
      const x = sx * 0.28;
      const col2 = poly([[x - 0.07, gy - 0.12], [x + 0.07, gy - 0.12], [x + 0.06, top + 0.06], [x - 0.06, top + 0.06]]);
      paint(g, col2, level === 0 ? '#5c4330' : '#5e5868', [x - 0.07, top, 0.14, H], { light: sx < 0 ? 0.3 : 0.05, dark: 0.45, line: 0.016 });
      g.save();
      g.clip(col2);
      if (level > 0) bricks(g, x - 0.07, top, x + 0.07, gy, 0.08, INK, 0.3);
      g.restore();
    }
    // çatı kirişi ve sivri çatı
    paint(g, poly([[-0.38, top + 0.08], [0.38, top + 0.08], [0.38, top - 0.02], [-0.38, top - 0.02]]), '#3a2a20', [-0.38, top - 0.02, 0.76, 0.1], { line: 0.016 });
    paint(g, poly([[-0.44, top - 0.02], [0, top - 0.36], [0.44, top - 0.02]]), knell ? '#1e1418' : '#3a1418', [-0.44, top - 0.36, 0.88, 0.34], { light: 0.25, dark: 0.5, line: 0.018 });
    line(g, [[0, top - 0.36], [0, top - 0.5]], 0.018, INK);
    if (level === 2) fill(g, poly([[0, top - 0.56], [0.04, top - 0.5], [0, top - 0.44], [-0.04, top - 0.5]]), GOLD);
    if (mastery === 0) banner(g, 0.4, top + 0.12, '#7a1f2a', null);
    return {
      base: s, head: bellHead(level, mastery), headY: top + 0.08, aim: false, bob: 0, swing: 0.16,
      eyes: [], eyeR: 0, eyeColor: col.glow,
      lights: [{ x: 0, y: top + 0.42, r: 0.42, color: knell ? '#ff4a5a' : col.glow, kind: 'core' }],
    };
  },

  /* ---------------- RUH KUYUSU: yuvarlak taş kuyu, çatı ve ruh suyu ---------------- */
  well(level, mastery, col) {
    const s = towerSurface();
    const g = s.g;
    const gy = 0.22;
    const R = 0.34 + 0.02 * level;
    const H = 0.26 + 0.04 * level;
    const top = gy - H;
    const bank = mastery === 0;
    const spring = mastery === 1;
    const water = spring ? '#7dffc8' : col.glow;
    softShadow(g, 0.05, gy, 0.52, 0.2, 0.6);
    // direkler ve çatı (arkada kalan yarı önce)
    const postTop = top - 0.5 - level * 0.04;
    for (const sx of [-1, 1]) {
      paint(g, poly([[sx * R - 0.035, top + 0.02], [sx * R + 0.035, top + 0.02], [sx * R + 0.03, postTop], [sx * R - 0.03, postTop]]), WOOD, [sx * R - 0.04, postTop, 0.08, 0.5], { line: 0.014 });
    }
    line(g, [[-R, postTop + 0.1], [R, postTop + 0.1]], 0.03, '#3a2a1a'); // çıkrık mili
    line(g, [[0.05, postTop + 0.1], [0.05, top - 0.04]], 0.01, '#8a7a5a', 0.9); // ip
    const roof = poly([[-R - 0.1, postTop + 0.02], [0, postTop - 0.24], [R + 0.1, postTop + 0.02]]);
    paint(g, roof, bank ? '#8a6a28' : '#3a2418', [-R - 0.1, postTop - 0.24, R * 2 + 0.2, 0.26], { light: 0.3, dark: 0.45, line: 0.018 });
    for (let i = 1; i < 4; i++) line(g, [[-R - 0.1 + i * 0.22, postTop + 0.02], [0, postTop - 0.22]], 0.008, INK, 0.4);
    // gövde
    const bodyPath = P((p) => {
      p.moveTo(-R, top);
      p.lineTo(-R, gy - 0.02);
      p.ellipse(0, gy - 0.02, R, R * 0.4, 0, Math.PI, 0, true);
      p.lineTo(R, top);
      p.closePath();
    });
    const stone = level === 0 ? '#4a4450' : STONE;
    paint(g, bodyPath, stone, [-R, top, R * 2, H + R * 0.4]);
    g.save();
    g.clip(bodyPath);
    bricks(g, -R, top, R, gy + 0.2, 0.08, INK, 0.32);
    g.fillStyle = lin(g, -R, 0, R, 0, [[0, 'rgba(255,255,255,0.05)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.4)']]);
    g.fillRect(-R, top, R * 2, H + R);
    g.restore();
    if (spring) for (const x of [-0.25, -0.05, 0.2]) curve(g, [[x, top + 0.02], [x + 0.04, top + 0.12], [x - 0.02, top + 0.22]], 0.018, '#3a6a2a');
    // ağız ve ruh suyu
    paint(g, ell(0, top, R, R * 0.4), shadeHex(stone, 0.18), [-R, top - R * 0.4, R * 2, R * 0.8], { line: 0.018 });
    g.save();
    g.shadowColor = water;
    g.shadowBlur = 0.12 * px;
    g.fillStyle = rad(g, -0.05, top, R * 0.8, [[0, mixHex(water, '#ffffff', 0.6)], [0.5, water], [1, shadeHex(water, -0.5)]]);
    g.fill(ell(0, top + 0.01, R * 0.78, R * 0.3));
    g.restore();
    if (level === 2) {
      g.beginPath();
      g.ellipse(0, top, R, R * 0.4, 0, 0, TAU);
      g.lineWidth = 0.022;
      g.strokeStyle = GOLD;
      g.stroke();
    }
    if (bank) {
      for (const [x, n] of [[-0.24, 3], [0.26, 2]]) {
        for (let i = 0; i < n; i++) paint(g, ell(x, gy - 0.02 - i * 0.035, 0.06, 0.022), GOLD, [x - 0.06, gy - 0.05 - i * 0.035, 0.12, 0.05], { line: 0.008 });
      }
    }
    return {
      base: s, head: null, headY: top, aim: false, bob: 0,
      eyes: [], eyeR: 0, eyeColor: water,
      lights: [{ x: 0, y: top, r: 0.4 + level * 0.04, color: water, kind: 'core' }],
      wisp: { y: top, color: water }, // render: sudan ruh pırıltıları yükselir
    };
  },
});

function lanceHead(level, mastery) {
  const s = surface(1.4, 1.1, 0.6, 0.55);
  const g = s.g;
  const k = 0.95 + level * 0.06;
  g.scale(k, k);
  const harpoon = mastery === 1;
  const impaler = mastery === 0;
  fill(g, circle(0.01, 0.02, 0.14), INK, 0.5);
  paint(g, circle(0, 0, 0.12), IRON, [-0.12, -0.12, 0.24, 0.24], { line: 0.014 });
  // kundak
  paint(g, poly([[-0.24, -0.05], [0.26, -0.045], [0.26, 0.045], [-0.24, 0.05]]), level === 2 ? '#4a3420' : WOOD, [-0.24, -0.05, 0.5, 0.1], { line: 0.016 });
  // yay kolları
  const tipX = 0.1;
  for (const sy of [-1, 1]) {
    curve(g, [[0.2, 0], [0.17, sy * 0.18], [tipX, sy * 0.34]], 0.05, INK);
    curve(g, [[0.2, 0], [0.17, sy * 0.18], [tipX, sy * 0.34]], 0.032, level === 2 ? GOLD : '#5a4030');
  }
  line(g, [[tipX, -0.34], [-0.1, 0], [tipX, 0.34]], 0.01, '#d9cfbf', 0.85);
  // mızrak
  const len = impaler ? 0.62 : 0.5;
  line(g, [[-0.12, 0], [len, 0]], 0.04, INK);
  line(g, [[-0.12, 0], [len, 0]], 0.024, '#8a6a42');
  if (harpoon) {
    fill(g, poly([[len, -0.06], [len + 0.12, 0], [len, 0.06], [len + 0.03, 0]]), '#c8d0d8');
    for (const sy of [-1, 1]) curve(g, [[len + 0.02, sy * 0.02], [len - 0.03, sy * 0.08], [len - 0.08, sy * 0.06]], 0.016, '#c8d0d8');
    line(g, [[-0.12, 0], [-0.22, 0.08], [-0.3, 0.02]], 0.014, '#8a7a5a');
  } else {
    fill(g, poly([[len, -0.05], [len + 0.14, 0], [len, 0.05]]), '#d8dee6');
    if (impaler) for (const x of [len - 0.06, len - 0.14]) for (const sy of [-1, 1]) line(g, [[x, 0], [x - 0.04, sy * 0.05]], 0.012, '#c8d0d8');
  }
  paint(g, circle(-0.02, 0, 0.06), shadeHex(IRON, 0.2), [-0.08, -0.06, 0.12, 0.12], { line: 0.012 });
  return s;
}

function prismHead(level, mastery, col) {
  const s = surface(1, 1.3, 0.5, 0.65);
  const g = s.g;
  const k = 0.85 + level * 0.1 + (mastery === 0 ? 0.12 : 0);
  g.scale(k, k);
  const crystal = (cx, cy, sc, alpha = 1) => {
    const t = [cx, cy - 0.3 * sc];
    const b = [cx, cy + 0.26 * sc];
    const l = [cx - 0.11 * sc, cy];
    const r = [cx + 0.11 * sc, cy];
    const m = [cx + 0.025 * sc, cy - 0.02 * sc];
    g.save();
    g.shadowColor = col.glow;
    g.shadowBlur = 0.14 * px;
    fill(g, poly([t, r, b, l]), col.glow, 0.45 * alpha);
    g.restore();
    paint(g, poly([t, m, b, l]), '#c8fff6', [l[0], t[1], 0.22 * sc, 0.56 * sc], { light: 0.35, dark: 0.1, line: 0.012 });
    paint(g, poly([t, r, b, m]), '#3aa898', [m[0], t[1], 0.11 * sc, 0.56 * sc], { light: 0.1, dark: 0.35, line: 0.012 });
    line(g, [t, m, b], 0.008, '#ffffff', 0.75);
  };
  if (mastery === 0) {
    // odak merceği: kristali saran halka
    g.beginPath();
    g.ellipse(0, 0, 0.24, 0.08, 0, 0, TAU);
    g.lineWidth = 0.035;
    g.strokeStyle = INK;
    g.stroke();
    g.lineWidth = 0.02;
    g.strokeStyle = GOLD;
    g.stroke();
  }
  if (mastery === 1) {
    crystal(-0.22, 0.12, 0.38, 0.9);
    crystal(0.22, 0.1, 0.34, 0.9);
  }
  crystal(0, 0, 1);
  return s;
}

function flameHead(level, mastery, col) {
  const s = surface(1.3, 1.3, 0.65, 0.65);
  const g = s.g;
  const k = 1.12 + level * 0.07;
  g.scale(k, k);
  const black = mastery === 0;
  const mouth = black ? '#c86aff' : '#ffb347';
  if (mastery === 1) {
    // alev çemberi: altı ağızlı kubbe (döndükçe her yöne püskürtür)
    paint(g, circle(0, 0, 0.2), '#4a2a20', [-0.2, -0.2, 0.4, 0.4], { line: 0.02 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const x = Math.cos(a) * 0.2;
      const y = Math.sin(a) * 0.2;
      paint(g, circle(x, y, 0.06), IRON, [x - 0.06, y - 0.06, 0.12, 0.12], { line: 0.012 });
      glowFill(g, circle(x, y, 0.03), mouth, 0.08);
    }
    glowFill(g, circle(0, 0, 0.08), mouth, 0.1, 0.8);
    return s;
  }
  // ejder kafası (sağa bakar)
  const skin = black ? '#2a1a2a' : '#5a2a1a';
  fill(g, circle(0.0, 0.02, 0.16), INK, 0.5);
  // boyun halkası
  paint(g, circle(-0.06, 0, 0.13), IRON, [-0.19, -0.13, 0.26, 0.26], { line: 0.014 });
  // üst çene
  const upper = blob([[-0.1, -0.1], [0.1, -0.14], [0.32, -0.08], [0.38, -0.02], [0.2, -0.01], [-0.04, 0.0]]);
  paint(g, upper, skin, [-0.1, -0.14, 0.48, 0.14], { line: 0.02 });
  // alt çene (açık)
  const lower = blob([[-0.06, 0.02], [0.16, 0.04], [0.32, 0.1], [0.24, 0.12], [0.0, 0.08]]);
  paint(g, lower, shadeHex(skin, -0.15), [-0.06, 0.02, 0.38, 0.1], { line: 0.018 });
  // ağzın içi kor
  glowFill(g, poly([[0.06, -0.01], [0.32, -0.01], [0.28, 0.08], [0.08, 0.05]]), mouth, 0.1, 0.9);
  for (const x of [0.16, 0.22, 0.28]) {
    fill(g, poly([[x - 0.012, -0.012], [x + 0.012, -0.012], [x, 0.02]]), BONE);
    fill(g, poly([[x - 0.01, 0.07], [x + 0.01, 0.07], [x, 0.04]]), BONE);
  }
  // boynuzlar ve göz
  for (const [x, l] of [[-0.02, 0.18], [0.06, 0.13]]) {
    g.save();
    g.translate(x, -0.11);
    g.rotate(-2.4);
    paint(g, poly([[-0.025, 0], [0.025, 0], [0.004, l]]), level === 2 ? GOLD : BONE, [-0.03, 0, 0.06, l], { line: 0.012 });
    g.restore();
  }
  glowFill(g, ell(0.14, -0.08, 0.026, 0.016), mouth, 0.06);
  return s;
}

function hunterHead(level, mastery) {
  const s = surface(1.5, 1, 0.6, 0.5);
  const g = s.g;
  const k = 0.95 + level * 0.06 + (mastery === 0 ? 0.08 : 0);
  g.scale(k, k);
  fill(g, circle(0.01, 0.02, 0.12), INK, 0.5);
  paint(g, circle(0, 0, 0.1), IRON, [-0.1, -0.1, 0.2, 0.2], { line: 0.014 });
  // dipçik ve uzun namlu
  paint(g, poly([[-0.26, -0.04], [0.04, -0.035], [0.04, 0.045], [-0.22, 0.06]]), '#2a2018', [-0.26, -0.04, 0.3, 0.1], { line: 0.016 });
  const len = 0.62 + level * 0.04;
  paint(g, poly([[0.02, -0.026], [len, -0.02], [len, 0.02], [0.02, 0.026]]), mastery === 0 ? '#3a3020' : '#2a2a32', [0.02, -0.026, len, 0.052], { line: 0.014 });
  paint(g, poly([[len - 0.04, -0.034], [len + 0.02, -0.034], [len + 0.02, 0.034], [len - 0.04, 0.034]]), level === 2 ? GOLD : IRON, [len - 0.04, -0.034, 0.06, 0.068], { line: 0.01 });
  // küçük yay kolları
  for (const sy of [-1, 1]) {
    curve(g, [[0.26, 0], [0.24, sy * 0.12], [0.18, sy * 0.22]], 0.04, INK);
    curve(g, [[0.26, 0], [0.24, sy * 0.12], [0.18, sy * 0.22]], 0.024, mastery === 0 ? GOLD : '#4a3628');
  }
  line(g, [[0.18, -0.22], [0.0, 0], [0.18, 0.22]], 0.008, '#d9cfbf', 0.8);
  // dürbün
  paint(g, poly([[0.04, -0.09], [0.24, -0.09], [0.24, -0.05], [0.04, -0.05]]), '#1a1a22', [0.04, -0.09, 0.2, 0.04], { line: 0.01 });
  glowFill(g, circle(0.25, -0.07, 0.02), mastery === 1 ? '#ff3b3b' : '#9fe8ff', 0.06);
  if (mastery === 1) {
    // infazcı: namluya bağlı küçük kafatası
    line(g, [[0.3, 0.02], [0.3, 0.1]], 0.008, INK);
    paint(g, ell(0.3, 0.13, 0.03, 0.035), BONE, [0.27, 0.095, 0.06, 0.07], { line: 0.008 });
  }
  return s;
}

/** Çan: pivot (0,0) asıldığı nokta; çan aşağı sarkar. */
function bellHead(level, mastery) {
  const s = surface(0.8, 0.8, 0.4, 0.1);
  const g = s.g;
  const k = 0.95 + level * 0.07;
  g.scale(k, k);
  const knell = mastery === 1;
  const metal = knell ? '#2a2630' : mastery === 0 || level === 2 ? '#c9a24a' : '#9a7a3a';
  line(g, [[0, 0], [0, 0.08]], 0.03, INK);
  const bellPath = P((p) => {
    p.moveTo(-0.06, 0.08);
    p.quadraticCurveTo(-0.16, 0.1, -0.17, 0.3);
    p.quadraticCurveTo(-0.19, 0.4, -0.25, 0.44);
    p.lineTo(0.25, 0.44);
    p.quadraticCurveTo(0.19, 0.4, 0.17, 0.3);
    p.quadraticCurveTo(0.16, 0.1, 0.06, 0.08);
    p.closePath();
  });
  paint(g, bellPath, metal, [-0.25, 0.08, 0.5, 0.36], { light: 0.45, dark: 0.45, line: 0.02 });
  line(g, [[-0.22, 0.39], [0.22, 0.39]], 0.014, shadeHex(metal, -0.4), 0.8);
  line(g, [[-0.15, 0.22], [0.15, 0.22]], 0.01, shadeHex(metal, 0.4), 0.6);
  if (knell) glowLine(g, [[-0.08, 0.3], [0, 0.24], [0.08, 0.3]], 0.014, '#ff3b4e', 0.08);
  // dil
  line(g, [[0, 0.3], [0, 0.46]], 0.02, INK);
  fill(g, circle(0, 0.48, 0.035), shadeHex(metal, -0.3));
  return s;
}
