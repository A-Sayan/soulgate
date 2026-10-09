/* ==========================================================================
 *  SOULGATE — art/enemies.js
 *  Sorumluluk : Düşman çizimleri. Normalize uzayda çizilir: ayaklar y=0,
 *               boy ≈ 1, x sağa bakar. Gerçek boy = ENEMIES[tip].size × 2.2
 *               hücre. İki kare (adım A/B) — render yürüyüş ritmiyle
 *               aralarında geçer, üstüne zıplama ve esneme ekler.
 *  Bağımlılık : utils (0) · art/kit.
 *
 *  Her kayıt: box [w, h, ox, oy] (normalize), eyes, eyeR, isteğe bağlı
 *  fly (uçuş yüksekliği), aura, lights ve draw(g, kare, renkler).
 * ========================================================================== */

import { TAU, rgba, shadeHex, mixHex } from '../utils.js';
import {
  px, surface, INK, STONE, WOOD, IRON, GOLD, BONE, P, ell, circle, poly, blob, lin, rad, paint, fill, line, curve, limb, glowLine, glowFill, softShadow, socket, towerSurface, bricks, banner,
} from './kit.js';

export const ENEMY_ART = {
  ghoul: {
    box: [1.4, 1.25, 0.65, 1.1],
    eyes: [[0.33, -0.78], [0.24, -0.8]], eyeR: 0.04,
    draw(g, f, c) {
      const st = f === 0 ? 1 : -1;
      limb(g, [[-0.04, -0.3], [-0.08 * st, -0.15], [-0.15 * st, 0]], 0.08, shadeHex(c.body, -0.35));
      limb(g, [[0.04, -0.62], [0.1 + 0.05 * st, -0.42], [0.2 + 0.07 * st, -0.24]], 0.065, shadeHex(c.body, -0.35));
      const torso = blob([[-0.22, -0.3], [-0.27, -0.58], [-0.08, -0.82], [0.16, -0.78], [0.25, -0.55], [0.12, -0.28]]);
      paint(g, torso, c.body, [-0.27, -0.82, 0.52, 0.55], { line: 0.035 });
      for (let i = 0; i < 4; i++) curve(g, [[-0.15 + i * 0.04, -0.72 + i * 0.07], [-0.21 + i * 0.03, -0.66 + i * 0.07], [-0.2 + i * 0.03, -0.6 + i * 0.07]], 0.018, c.dark, 0.7);
      fill(g, poly([[-0.2, -0.36], [0.16, -0.34], [0.12, -0.16], [0.03, -0.24], [-0.06, -0.14], [-0.14, -0.25]]), c.dark, 0.95);
      limb(g, [[0.04, -0.3], [0.1 * st + 0.05, -0.15], [0.15 * st, 0]], 0.085, c.body);
      const head = blob([[0.1, -0.86], [0.3, -0.92], [0.42, -0.8], [0.4, -0.66], [0.22, -0.6], [0.1, -0.7]]);
      paint(g, head, shadeHex(c.body, 0.1), [0.1, -0.92, 0.32, 0.32], { line: 0.035 });
      fill(g, poly([[0.27, -0.66], [0.43, -0.7], [0.4, -0.6], [0.3, -0.59]]), '#120a0a');
      for (const x of [0.31, 0.35, 0.39]) fill(g, poly([[x - 0.012, -0.665], [x + 0.012, -0.67], [x, -0.63]]), BONE);
      socket(g, 0.33, -0.78, 0.04);
      socket(g, 0.24, -0.8, 0.035);
      limb(g, [[0.12, -0.66], [0.27 - 0.05 * st, -0.44], [0.35 - 0.07 * st, -0.2]], 0.07, c.body);
      const hx = 0.35 - 0.07 * st;
      for (const d of [-0.04, 0, 0.04]) line(g, [[hx, -0.2], [hx + 0.06 + d, -0.12]], 0.018, BONE);
    },
  },

  wolf: {
    box: [1.7, 1.1, 0.85, 0.95],
    eyes: [[0.52, -0.58]], eyeR: 0.045,
    draw(g, f, c) {
      const ext = f === 0;
      const legs = ext
        ? [[[0.28, -0.38], [0.42, -0.18], [0.5, 0]], [[-0.25, -0.38], [-0.38, -0.2], [-0.5, 0]]]
        : [[[0.25, -0.38], [0.2, -0.18], [0.12, 0]], [[-0.22, -0.38], [-0.12, -0.18], [-0.05, 0]]];
      for (const l of legs) limb(g, l.map(([x, y]) => [x - 0.06, y]), 0.06, shadeHex(c.body, -0.4));
      const tail = ext ? [[-0.38, -0.42], [-0.6, -0.5], [-0.75, -0.42]] : [[-0.38, -0.42], [-0.58, -0.6], [-0.7, -0.68]];
      limb(g, tail, 0.07, c.body);
      const body = blob([[-0.42, -0.36], [-0.38, -0.52], [0, -0.58], [0.32, -0.56], [0.4, -0.38], [0.1, -0.28], [-0.25, -0.28]]);
      paint(g, body, c.body, [-0.42, -0.58, 0.82, 0.3], { line: 0.035 });
      for (let i = 0; i < 5; i++) line(g, [[-0.3 + i * 0.12, -0.56], [-0.26 + i * 0.12, -0.64]], 0.03, shadeHex(c.body, -0.3));
      for (const l of legs) limb(g, l, 0.065, c.body);
      const head = blob([[0.3, -0.55], [0.42, -0.68], [0.56, -0.64], [0.74, -0.52], [0.7, -0.45], [0.42, -0.42]]);
      paint(g, head, c.body, [0.3, -0.68, 0.44, 0.26], { line: 0.035 });
      paint(g, poly([[0.4, -0.64], [0.44, -0.84], [0.5, -0.64]]), shadeHex(c.body, -0.2), [0.4, -0.84, 0.1, 0.2], { line: 0.025 });
      fill(g, poly([[0.6, -0.47], [0.74, -0.5], [0.7, -0.42], [0.55, -0.42]]), '#120a0a');
      for (const x of [0.62, 0.67]) fill(g, poly([[x - 0.01, -0.47], [x + 0.01, -0.47], [x, -0.43]]), BONE);
      socket(g, 0.52, -0.58, 0.04);
    },
  },

  knight: {
    box: [1.3, 1.3, 0.62, 1.15],
    eyes: [[0.06, -0.83], [0.14, -0.83]], eyeR: 0.032,
    draw(g, f, c) {
      const st = f === 0 ? 1 : -1;
      const metal = '#5e6370';
      limb(g, [[-0.05, -0.32], [-0.06 - 0.06 * st, -0.15], [-0.08 - 0.08 * st, 0]], 0.05, BONE);
      limb(g, [[0.05, -0.32], [0.05 + 0.06 * st, -0.15], [0.07 + 0.08 * st, 0]], 0.05, BONE);
      // kılıç (arkada)
      line(g, [[-0.15, -0.55], [-0.38, -1.05]], 0.06, INK);
      line(g, [[-0.15, -0.55], [-0.38, -1.05]], 0.035, '#b8c0cc');
      line(g, [[-0.22, -0.6], [-0.08, -0.66]], 0.04, GOLD);
      const torso = poly([[-0.2, -0.68], [0.2, -0.68], [0.15, -0.3], [-0.15, -0.3]]);
      paint(g, torso, metal, [-0.2, -0.68, 0.4, 0.38], { line: 0.035 });
      line(g, [[0, -0.66], [0, -0.32]], 0.02, INK, 0.5);
      fill(g, poly([[-0.17, -0.34], [0.17, -0.34], [0.2, -0.24], [-0.2, -0.24]]), '#2a1d1d');
      for (const sx of [-1, 1]) paint(g, ell(sx * 0.2, -0.66, 0.1, 0.07), shadeHex(metal, 0.1), [-0.3, -0.73, 0.6, 0.14], { line: 0.025 });
      const helm = blob([[-0.12, -0.72], [-0.13, -0.92], [0.02, -1.0], [0.17, -0.94], [0.19, -0.74]]);
      paint(g, helm, shadeHex(metal, 0.1), [-0.13, -1, 0.32, 0.3], { line: 0.035 });
      fill(g, poly([[-0.02, -0.86], [0.2, -0.86], [0.2, -0.8], [-0.02, -0.8]]), '#050307');
      line(g, [[0.03, -1.0], [0.03, -1.1]], 0.04, '#7a1f2a');
      // kalkan
      const sh = P((p) => {
        p.moveTo(0.1, -0.66);
        p.lineTo(0.38, -0.66);
        p.quadraticCurveTo(0.38, -0.36, 0.24, -0.28);
        p.quadraticCurveTo(0.1, -0.36, 0.1, -0.66);
        p.closePath();
      });
      paint(g, sh, '#3a3e48', [0.1, -0.66, 0.28, 0.38], { line: 0.035 });
      fill(g, poly([[0.24, -0.6], [0.3, -0.5], [0.24, -0.38], [0.18, -0.5]]), c.eye, 0.5);
    },
  },

  wraith: {
    box: [1.4, 1.35, 0.7, 1.2],
    eyes: [[0.06, -0.8], [0.15, -0.8]], eyeR: 0.04, fly: 0.12,
    aura: { r: 0.75, color: '#7f93cf' },
    draw(g, f, c) {
      const w = f === 0 ? 0 : 0.04;
      const cloak = P((p) => {
        p.moveTo(0.04, -1.02);
        p.quadraticCurveTo(0.3, -0.98, 0.3, -0.7);
        p.quadraticCurveTo(0.3, -0.4, 0.34, -0.18);
        const hem = [[0.25 - w, -0.08], [0.18, -0.22], [0.08 + w, -0.04], [-0.02, -0.2], [-0.12 - w, -0.02], [-0.2, -0.2], [-0.32 + w, -0.06]];
        for (const [x, y] of hem) p.lineTo(x, y);
        p.quadraticCurveTo(-0.28, -0.5, -0.2, -0.78);
        p.quadraticCurveTo(-0.14, -1.0, 0.04, -1.02);
        p.closePath();
      });
      const grad = lin(g, 0, -1.02, 0, -0.02, [[0, shadeHex(c.body, 0.15)], [0.7, rgba(c.body, 0.75)], [1, rgba(c.body, 0)]]);
      g.fillStyle = grad;
      g.fill(cloak);
      g.lineWidth = 0.03;
      g.strokeStyle = rgba(INK, 0.6);
      g.stroke(cloak);
      fill(g, blob([[-0.02, -0.92], [0.18, -0.92], [0.24, -0.76], [0.12, -0.66], [-0.04, -0.72]]), '#060814');
      for (const [y, l] of [[-0.6, 0.3], [-0.52, 0.34]]) {
        limb(g, [[0.12, y], [0.3, y + 0.02 + w], [0.12 + l + 0.05, y + 0.08]], 0.05, shadeHex(c.body, -0.1), 0.025);
      }
      for (let i = 0; i < 3; i++) curve(g, [[-0.15 + i * 0.12, -0.6], [-0.18 + i * 0.12, -0.4], [-0.14 + i * 0.12, -0.25]], 0.015, c.dark, 0.5);
    },
  },

  bat: {
    box: [1.9, 1.1, 0.95, 1.0],
    eyes: [[-0.045, -0.56], [0.045, -0.56]], eyeR: 0.035, fly: 0.55,
    draw(g, f, c) {
      const up = f === 0;
      for (const sx of [-1, 1]) {
        const tipY = up ? -0.95 : -0.2;
        const midY = up ? -0.78 : -0.36;
        const wing = P((p) => {
          p.moveTo(sx * 0.08, -0.6);
          p.lineTo(sx * 0.42, midY);
          p.lineTo(sx * 0.82, tipY);
          p.quadraticCurveTo(sx * 0.66, (tipY - 0.45) / 2 + 0.08, sx * 0.58, -0.38);
          p.quadraticCurveTo(sx * 0.45, -0.44, sx * 0.36, -0.32);
          p.quadraticCurveTo(sx * 0.24, -0.4, sx * 0.08, -0.42);
          p.closePath();
        });
        paint(g, wing, c.dark, [sx < 0 ? -0.82 : 0, -0.95, 0.82, 0.7], { light: 0.35, dark: 0.3, line: 0.03 });
        line(g, [[sx * 0.08, -0.58], [sx * 0.42, midY], [sx * 0.82, tipY]], 0.025, c.body);
        line(g, [[sx * 0.42, midY], [sx * 0.58, -0.38]], 0.018, c.body, 0.8);
        line(g, [[sx * 0.42, midY], [sx * 0.36, -0.32]], 0.018, c.body, 0.8);
      }
      paint(g, ell(0, -0.5, 0.12, 0.17), c.body, [-0.12, -0.67, 0.24, 0.34], { line: 0.03 });
      for (const sx of [-1, 1]) paint(g, poly([[sx * 0.03, -0.62], [sx * 0.11, -0.8], [sx * 0.11, -0.6]]), c.body, [-0.11, -0.8, 0.22, 0.2], { line: 0.022 });
      socket(g, -0.045, -0.56, 0.032);
      socket(g, 0.045, -0.56, 0.032);
      for (const sx of [-1, 1]) fill(g, poly([[sx * 0.02, -0.47], [sx * 0.04, -0.47], [sx * 0.03, -0.42]]), BONE);
    },
  },

  shaman: {
    box: [1.4, 1.35, 0.65, 1.2],
    eyes: [[0.09, -0.84], [0.16, -0.84]], eyeR: 0.03,
    aura: { r: 0.7, color: '#b3122e' },
    lights: [{ x: 0.3, y: -1.06, r: 0.35, color: '#ff3b4e', kind: 'core' }],
    draw(g, f, c) {
      const sw = f === 0 ? 0 : 0.03;
      line(g, [[0.3, 0.02], [0.3, -1.0 - sw]], 0.05, INK);
      line(g, [[0.3, 0.02], [0.3, -1.0 - sw]], 0.03, '#4a3020');
      const robe = poly([[-0.14, -0.74], [0.16, -0.74], [0.3 + sw, 0], [-0.3 + sw, 0]]);
      paint(g, robe, c.body, [-0.3, -0.74, 0.6, 0.74], { line: 0.035 });
      g.save();
      g.clip(robe);
      for (let i = 0; i < 4; i++) curve(g, [[-0.1 + i * 0.08, -0.7], [-0.14 + i * 0.1, -0.35], [-0.2 + i * 0.13, 0]], 0.016, c.dark, 0.6);
      g.restore();
      line(g, [[-0.15, -0.42], [0.18, -0.42]], 0.035, '#2a0a0f');
      for (let i = 0; i < 5; i++) fill(g, circle(-0.08 + i * 0.05, -0.66 + Math.abs(i - 2) * 0.015, 0.022), BONE);
      const hood = blob([[-0.08, -0.74], [-0.06, -0.94], [0.1, -1.0], [0.24, -0.9], [0.24, -0.74]]);
      paint(g, hood, shadeHex(c.body, 0.1), [-0.08, -1, 0.32, 0.26], { line: 0.035 });
      fill(g, blob([[0.04, -0.9], [0.2, -0.92], [0.24, -0.78], [0.08, -0.76]]), '#0a0305');
      limb(g, [[0.1, -0.62], [0.22, -0.56], [0.3, -0.6]], 0.05, shadeHex(c.body, -0.1), 0.025);
      // asanın tepesindeki kristal
      glowFill(g, poly([[0.3, -1.16 - sw], [0.36, -1.05 - sw], [0.3, -0.96 - sw], [0.24, -1.05 - sw]]), '#ff3b4e', 0.12);
      line(g, [[0.3, -1.16 - sw], [0.3, -0.96 - sw]], 0.008, '#ffd0d6', 0.8);
    },
  },

  brute: {
    box: [1.5, 1.25, 0.75, 1.1],
    eyes: [[0.22, -0.83], [0.31, -0.82]], eyeR: 0.035,
    lights: [{ x: 0.02, y: -0.55, r: 0.4, color: '#ff8a2a', kind: 'ember' }],
    draw(g, f, c) {
      const st = f === 0 ? 1 : -1;
      paint(g, poly([[-0.24, -0.3], [-0.06, -0.3], [-0.08 - 0.05 * st, 0], [-0.3 - 0.05 * st, 0]]), shadeHex(c.body, -0.2), [-0.3, -0.3, 0.25, 0.3], { line: 0.035 });
      paint(g, ell(-0.38, -0.5, 0.15, 0.2), shadeHex(c.body, -0.25), [-0.53, -0.7, 0.3, 0.4], { line: 0.035 });
      const torso = blob([[-0.42, -0.4], [-0.4, -0.78], [-0.1, -0.95], [0.3, -0.9], [0.45, -0.6], [0.35, -0.28], [-0.2, -0.24]]);
      paint(g, torso, c.body, [-0.42, -0.95, 0.87, 0.71], { line: 0.04 });
      // yosun ve çatlaklar
      fill(g, blob([[-0.3, -0.82], [-0.1, -0.92], [0.05, -0.86], [-0.15, -0.78]]), '#3d4a2a', 0.8);
      glowLine(g, [[-0.1, -0.72], [0.02, -0.6], [-0.02, -0.48], [0.1, -0.38]], 0.02, '#ff8a2a', 0.1);
      glowLine(g, [[0.2, -0.7], [0.14, -0.6]], 0.016, '#ff8a2a', 0.08);
      paint(g, poly([[0.06, -0.3], [0.24, -0.3], [0.26 + 0.05 * st, 0], [0.04 + 0.05 * st, 0]]), c.body, [0.04, -0.3, 0.25, 0.3], { line: 0.035 });
      const head = blob([[0.14, -0.78], [0.18, -0.92], [0.34, -0.94], [0.42, -0.82], [0.36, -0.74]]);
      paint(g, head, shadeHex(c.body, 0.1), [0.14, -0.94, 0.28, 0.2], { line: 0.035 });
      socket(g, 0.22, -0.83, 0.035);
      socket(g, 0.31, -0.82, 0.035);
      paint(g, ell(0.4, -0.45, 0.16, 0.22), c.body, [0.24, -0.67, 0.32, 0.44], { line: 0.04 });
    },
  },

  brood: {
    box: [1.6, 1.15, 0.8, 1.0],
    eyes: [[0.47, -0.42], [0.41, -0.47], [0.51, -0.5]], eyeR: 0.028,
    lights: [{ x: -0.12, y: -0.45, r: 0.45, color: '#b6ff3a', kind: 'ember' }],
    draw(g, f, c) {
      const st = f === 0 ? 1 : -1;
      for (let i = 0; i < 3; i++) {
        const x = -0.12 + i * 0.18;
        const o = (i % 2 === 0 ? st : -st) * 0.05;
        limb(g, [[x, -0.32], [x + 0.08 + o, -0.28], [x + 0.14 + o, 0]], 0.03, shadeHex(c.dark, 0.2), 0.025);
        limb(g, [[x, -0.32], [x - 0.06 - o, -0.3], [x - 0.12 - o, 0]], 0.03, shadeHex(c.dark, 0.2), 0.025);
      }
      const sac = blob([[-0.52, -0.38], [-0.45, -0.68], [-0.1, -0.8], [0.25, -0.64], [0.3, -0.36], [-0.05, -0.24], [-0.4, -0.26]]);
      paint(g, sac, c.body, [-0.52, -0.8, 0.82, 0.56], { line: 0.035 });
      g.save();
      g.clip(sac);
      for (const [x, y, r] of [[-0.3, -0.55, 0.08], [-0.1, -0.62, 0.09], [0.08, -0.5, 0.07], [-0.25, -0.38, 0.06], [-0.02, -0.4, 0.065]]) {
        glowFill(g, circle(x, y, r), '#9adf2a', 0.06, 0.55);
        fill(g, circle(x - r * 0.3, y - r * 0.3, r * 0.3), '#efffb0', 0.5);
      }
      g.restore();
      const head = blob([[0.26, -0.5], [0.36, -0.58], [0.52, -0.52], [0.56, -0.4], [0.42, -0.32], [0.28, -0.36]]);
      paint(g, head, c.dark, [0.26, -0.58, 0.3, 0.26], { line: 0.035 });
      for (const sy of [-1, 1]) curve(g, [[0.5, -0.38], [0.62, -0.38 + sy * 0.05], [0.6, -0.38 + sy * 0.12]], 0.025, BONE);
      for (const [x, y] of [[0.47, -0.42], [0.41, -0.47], [0.51, -0.5]]) socket(g, x, y, 0.026);
    },
  },

  larva: {
    box: [1.4, 0.8, 0.7, 0.65],
    eyes: [[0.38, -0.3]], eyeR: 0.05,
    draw(g, f, c) {
      const wv = f === 0 ? 0.04 : -0.04;
      const segs = [[-0.36, -0.14 + wv, 0.12], [-0.18, -0.18 - wv, 0.15], [0.02, -0.2 + wv, 0.17], [0.22, -0.22 - wv, 0.15]];
      for (const [x, y, r] of segs) paint(g, ell(x, y, r, r * 0.85), c.body, [x - r, y - r, r * 2, r * 2], { line: 0.035 });
      for (const [x, y, r] of segs) line(g, [[x - r * 0.2, y - r * 0.8], [x - r * 0.2, y + r * 0.6]], 0.02, c.dark, 0.6);
      paint(g, ell(0.38, -0.25, 0.12, 0.11), c.dark, [0.26, -0.36, 0.24, 0.22], { line: 0.035 });
      for (const sy of [-1, 1]) curve(g, [[0.46, -0.24], [0.56, -0.24 + sy * 0.04], [0.54, -0.24 + sy * 0.1]], 0.025, BONE);
      socket(g, 0.38, -0.3, 0.045);
    },
  },

  skeleton: {
    box: [1.3, 1.3, 0.62, 1.15],
    eyes: [[0.08, -0.83], [0.15, -0.83]], eyeR: 0.028,
    draw(g, f, c) {
      const st = f === 0 ? 1 : -1;
      line(g, [[-0.25, -0.1], [0.45, -0.95]], 0.045, INK);
      line(g, [[-0.25, -0.1], [0.45, -0.95]], 0.025, '#5a4030');
      fill(g, poly([[0.45, -0.95], [0.5, -1.06], [0.4, -0.98]]), '#c8d0d8');
      limb(g, [[-0.04, -0.34], [-0.05 - 0.07 * st, -0.17], [-0.07 - 0.09 * st, 0]], 0.04, c.body);
      limb(g, [[0.04, -0.34], [0.04 + 0.07 * st, -0.17], [0.06 + 0.09 * st, 0]], 0.04, c.body);
      line(g, [[0, -0.36], [0, -0.68]], 0.06, INK);
      line(g, [[0, -0.36], [0, -0.68]], 0.035, c.body);
      for (let i = 0; i < 4; i++) {
        const y = -0.64 + i * 0.07;
        curve(g, [[-0.14 + i * 0.01, y + 0.03], [0, y - 0.02], [0.14 - i * 0.01, y + 0.03]], 0.03, INK);
        curve(g, [[-0.14 + i * 0.01, y + 0.03], [0, y - 0.02], [0.14 - i * 0.01, y + 0.03]], 0.018, c.body);
      }
      paint(g, ell(0, -0.36, 0.12, 0.05), c.body, [-0.12, -0.41, 0.24, 0.1], { line: 0.025 });
      limb(g, [[0.1, -0.64], [0.18, -0.5], [0.12, -0.42]], 0.03, c.body, 0.025);
      const skull = blob([[-0.06, -0.78], [-0.06, -0.92], [0.08, -0.98], [0.2, -0.9], [0.2, -0.76], [0.12, -0.72], [0.02, -0.72]]);
      paint(g, skull, c.body, [-0.06, -0.98, 0.26, 0.26], { line: 0.03 });
      socket(g, 0.08, -0.83, 0.03);
      socket(g, 0.15, -0.83, 0.028);
      line(g, [[0.06, -0.74], [0.18, -0.75]], 0.012, INK, 0.7);
    },
  },

  boss_bone: {
    box: [1.5, 1.35, 0.72, 1.22],
    eyes: [[0.07, -0.82], [0.16, -0.82]], eyeR: 0.035,
    aura: { r: 0.9, color: '#3affd5' },
    lights: [{ x: 0, y: -0.52, r: 0.32, color: '#3affd5', kind: 'core' }],
    draw(g, f, c) {
      const st = f === 0 ? 1 : -1;
      const cape = P((p) => {
        p.moveTo(-0.2, -0.72);
        p.quadraticCurveTo(-0.5, -0.4, -0.44 - 0.03 * st, 0);
        for (const [x, y] of [[-0.34, -0.08], [-0.24, 0.02], [-0.14, -0.06], [-0.04, 0.01]]) p.lineTo(x, y);
        p.lineTo(0.1, -0.7);
        p.closePath();
      });
      paint(g, cape, '#1a1f22', [-0.5, -0.72, 0.6, 0.72], { light: 0.25, dark: 0.3, line: 0.03 });
      limb(g, [[-0.05, -0.32], [-0.07 - 0.06 * st, -0.16], [-0.09 - 0.07 * st, 0]], 0.05, c.body);
      limb(g, [[0.05, -0.32], [0.06 + 0.06 * st, -0.16], [0.08 + 0.07 * st, 0]], 0.05, c.body);
      glowFill(g, ell(0, -0.52, 0.09, 0.12), '#3affd5', 0.08, 0.35);
      for (let i = 0; i < 5; i++) {
        const y = -0.68 + i * 0.07;
        curve(g, [[-0.2 + i * 0.015, y + 0.04], [0, y - 0.03], [0.2 - i * 0.015, y + 0.04]], 0.04, INK);
        curve(g, [[-0.2 + i * 0.015, y + 0.04], [0, y - 0.03], [0.2 - i * 0.015, y + 0.04]], 0.025, c.body);
      }
      line(g, [[0, -0.32], [0, -0.72]], 0.045, c.body);
      for (const sx of [-1, 1]) paint(g, ell(sx * 0.22, -0.7, 0.1, 0.06), c.body, [-0.32, -0.76, 0.64, 0.12], { line: 0.025 });
      // asa
      line(g, [[0.32, 0.0], [0.38, -1.05]], 0.05, INK);
      line(g, [[0.32, 0.0], [0.38, -1.05]], 0.03, '#5a4a3a');
      paint(g, circle(0.38, -1.08, 0.06), c.body, [0.32, -1.14, 0.12, 0.12], { line: 0.02 });
      limb(g, [[0.14, -0.66], [0.3, -0.6], [0.36, -0.68]], 0.035, c.body, 0.025);
      const skull = blob([[-0.08, -0.76], [-0.09, -0.92], [0.06, -1.0], [0.22, -0.92], [0.22, -0.76], [0.14, -0.7], [0.0, -0.7]]);
      paint(g, skull, c.body, [-0.09, -1.0, 0.31, 0.3], { line: 0.03 });
      socket(g, 0.07, -0.82, 0.035);
      socket(g, 0.16, -0.82, 0.032);
      for (const x of [0.04, 0.09, 0.14]) line(g, [[x, -0.73], [x, -0.7]], 0.012, INK);
      const crown = poly([[-0.08, -0.93], [-0.06, -1.06], [0.0, -0.97], [0.06, -1.1], [0.12, -0.98], [0.19, -1.07], [0.21, -0.92]]);
      paint(g, crown, GOLD, [-0.08, -1.1, 0.29, 0.18], { light: 0.4, dark: 0.4, line: 0.02 });
    },
  },

  boss_dragon: {
    box: [2.15, 1.5, 1.1, 1.32],
    eyes: [[0.66, -0.83]], eyeR: 0.034, fly: 0.7,
    aura: { r: 1, color: '#ff7a2f' },
    lights: [{ x: 0.05, y: -0.5, r: 0.38, color: '#ff7a2f', kind: 'ember' }],
    draw(g, f, c) {
      const up = f === 0;
      // kanat: omuz → dirsek → bilek → üç parmak, aralarında zar
      const wing = (ox, oy, sc, color, bone) => {
        const S = [0.05 + ox, -0.62 + oy];
        const E = up ? [-0.08 + ox, -1.02 + oy] : [-0.02 + ox, -0.38 + oy];
        const W = up ? [-0.32 + ox, -1.22 + oy] : [-0.3 + ox, -0.16 + oy];
        const tips = up
          ? [[-0.92, -1.06], [-0.86, -0.78], [-0.6, -0.56]]
          : [[-0.9, -0.14], [-0.74, 0.06], [-0.48, -0.06]];
        const T = tips.map(([x, y]) => [W[0] + (x - W[0] + ox) * sc, W[1] + (y - W[1] + oy) * sc]);
        const B = [-0.28 + ox, -0.46 + oy];
        const mem = P((p) => {
          p.moveTo(S[0], S[1]);
          p.lineTo(E[0], E[1]);
          p.lineTo(W[0], W[1]);
          p.lineTo(T[0][0], T[0][1]);
          p.quadraticCurveTo((T[0][0] + T[1][0]) / 2 + 0.08, (T[0][1] + T[1][1]) / 2, T[1][0], T[1][1]);
          p.quadraticCurveTo((T[1][0] + T[2][0]) / 2 + 0.08, (T[1][1] + T[2][1]) / 2, T[2][0], T[2][1]);
          p.quadraticCurveTo((T[2][0] + B[0]) / 2 + 0.06, (T[2][1] + B[1]) / 2, B[0], B[1]);
          p.closePath();
        });
        paint(g, mem, color, [-0.95, -1.25, 1.1, 1.2], { light: 0.25, dark: 0.35, line: 0.026 });
        line(g, [S, E, W], 0.045, INK);
        line(g, [S, E, W], 0.028, bone);
        for (const t of T) line(g, [W, t], 0.018, bone, 0.9);
        fill(g, circle(W[0], W[1], 0.03), bone);
      };
      wing(0.14, -0.04, 0.85, mixHex(c.body, '#000000', 0.62), shadeHex(c.body, -0.25)); // uzak kanat
      // kuyruk
      curve(g, [[-0.25, -0.46], [-0.55, -0.38], [-0.82, -0.52], [-1.0, -0.44]], 0.1, INK);
      curve(g, [[-0.25, -0.46], [-0.55, -0.38], [-0.82, -0.52], [-1.0, -0.44]], 0.065, c.body);
      paint(g, poly([[-0.97, -0.5], [-1.1, -0.44], [-0.97, -0.37], [-1.0, -0.44]]), c.dark, [-1.1, -0.5, 0.13, 0.13], { line: 0.016 });
      // arka ayak
      limb(g, [[-0.12, -0.42], [-0.18, -0.3], [-0.1, -0.24]], 0.06, shadeHex(c.body, -0.3));
      // gövde
      const body = blob([[-0.32, -0.46], [-0.18, -0.64], [0.14, -0.7], [0.36, -0.62], [0.32, -0.42], [0.0, -0.36], [-0.22, -0.36]]);
      paint(g, body, c.body, [-0.32, -0.7, 0.68, 0.34], { line: 0.032 });
      g.save();
      g.clip(body);
      g.fillStyle = lin(g, 0, -0.48, 0, -0.36, [[0, 'rgba(255,140,40,0)'], [1, 'rgba(255,140,40,0.55)']]);
      g.fillRect(-0.35, -0.5, 0.75, 0.16);
      for (let i = 0; i < 5; i++) line(g, [[-0.18 + i * 0.1, -0.44], [-0.14 + i * 0.1, -0.37]], 0.01, '#2a0a05', 0.6);
      g.restore();
      for (let i = 0; i < 6; i++) paint(g, poly([[-0.24 + i * 0.1, -0.64], [-0.2 + i * 0.1, -0.74], [-0.15 + i * 0.1, -0.65]]), c.dark, [-0.25, -0.75, 0.6, 0.1], { line: 0.012 });
      limb(g, [[0.2, -0.42], [0.24, -0.3], [0.32, -0.27]], 0.06, c.body);
      // boyun + baş
      curve(g, [[0.28, -0.6], [0.42, -0.74], [0.56, -0.8]], 0.15, INK);
      curve(g, [[0.28, -0.6], [0.42, -0.74], [0.56, -0.8]], 0.115, c.body);
      const head = blob([[0.5, -0.8], [0.6, -0.9], [0.74, -0.86], [0.9, -0.78], [0.88, -0.72], [0.7, -0.7], [0.54, -0.72]]);
      paint(g, head, c.body, [0.5, -0.9, 0.4, 0.2], { line: 0.03 });
      fill(g, poly([[0.72, -0.73], [0.89, -0.75], [0.86, -0.7], [0.72, -0.7]]), '#1a0603');
      for (const x of [0.76, 0.8, 0.84]) fill(g, poly([[x - 0.01, -0.735], [x + 0.01, -0.735], [x, -0.71]]), BONE);
      for (const [x, l, a] of [[0.6, 0.2, -0.5], [0.66, 0.16, -0.35]]) {
        g.save();
        g.translate(x, -0.88);
        g.rotate(a - Math.PI / 2);
        paint(g, poly([[-0.025, 0], [0.025, 0], [0.004, -l]]), BONE, [-0.03, -l, 0.06, l], { line: 0.014 });
        g.restore();
      }
      glowFill(g, ell(0.9, -0.73, 0.028, 0.018), '#ffb21a', 0.1);
      socket(g, 0.66, -0.83, 0.03);
      wing(0, 0, 1, mixHex(c.body, '#000000', 0.3), shadeHex(c.body, 0.1)); // yakın kanat
    },
  },

  boss_king: {
    box: [1.6, 1.4, 0.78, 1.28],
    eyes: [[0.05, -0.86], [0.13, -0.86]], eyeR: 0.034,
    aura: { r: 1, color: '#ff2a55' },
    draw(g, f, c) {
      const st = f === 0 ? 1 : -1;
      const cape = P((p) => {
        p.moveTo(-0.16, -0.78);
        p.quadraticCurveTo(-0.55, -0.45, -0.58 - 0.04 * st, 0.0);
        for (const [x, y] of [[-0.44, -0.07], [-0.32, 0.01], [-0.2, -0.06], [-0.06, 0.02], [0.12, -0.04]]) p.lineTo(x, y);
        p.lineTo(0.18, -0.76);
        p.closePath();
      });
      paint(g, cape, '#2a0a14', [-0.6, -0.8, 0.8, 0.8], { light: 0.3, dark: 0.3, line: 0.03 });
      line(g, [[-0.58 - 0.04 * st, 0], [-0.44, -0.07], [-0.32, 0.01], [-0.2, -0.06], [-0.06, 0.02]], 0.02, '#ff2a55', 0.6);
      limb(g, [[-0.06, -0.36], [-0.08 - 0.05 * st, -0.17], [-0.1 - 0.06 * st, 0]], 0.08, '#1e1828');
      limb(g, [[0.06, -0.36], [0.07 + 0.05 * st, -0.17], [0.09 + 0.06 * st, 0]], 0.08, '#2a2238');
      const torso = poly([[-0.2, -0.76], [0.22, -0.76], [0.16, -0.34], [-0.16, -0.34]]);
      paint(g, torso, c.body, [-0.2, -0.76, 0.42, 0.42], { line: 0.035 });
      glowLine(g, [[0, -0.72], [0, -0.4]], 0.018, '#ff2a55', 0.1);
      glowLine(g, [[-0.12, -0.62], [0.12, -0.62]], 0.014, '#ff2a55', 0.08);
      for (const sx of [-1, 1]) {
        const pad = poly([[sx * 0.12, -0.8], [sx * 0.34, -0.78], [sx * 0.3, -0.64], [sx * 0.14, -0.66]]);
        paint(g, pad, shadeHex(c.body, 0.15), [-0.34, -0.8, 0.68, 0.16], { line: 0.025 });
        for (let i = 0; i < 2; i++) fill(g, poly([[sx * (0.18 + i * 0.08), -0.79], [sx * (0.2 + i * 0.08), -0.9], [sx * (0.22 + i * 0.08), -0.79]]), '#120c18');
      }
      // büyük kılıç
      line(g, [[0.3, -0.2], [0.5, -1.15]], 0.08, INK);
      line(g, [[0.3, -0.2], [0.5, -1.15]], 0.05, '#2a2a34');
      glowLine(g, [[0.32, -0.3], [0.49, -1.1]], 0.012, '#ff2a55', 0.08);
      line(g, [[0.2, -0.3], [0.42, -0.24]], 0.04, '#3a2a40');
      limb(g, [[0.16, -0.7], [0.28, -0.5], [0.3, -0.28]], 0.06, '#2a2238', 0.03);
      const helm = blob([[-0.1, -0.78], [-0.12, -0.96], [0.04, -1.04], [0.2, -0.96], [0.2, -0.78]]);
      paint(g, helm, '#1e1828', [-0.12, -1.04, 0.32, 0.26], { line: 0.035 });
      fill(g, poly([[-0.02, -0.9], [0.2, -0.9], [0.2, -0.82], [-0.02, -0.82]]), '#050307');
      const crown = [[-0.12, -0.98], [-0.14, -1.18], [-0.04, -1.02], [0.04, -1.24], [0.1, -1.03], [0.2, -1.16], [0.2, -0.96]];
      paint(g, poly(crown), '#120c18', [-0.14, -1.24, 0.34, 0.28], { line: 0.02 });
      glowLine(g, crown.slice(1, 6), 0.012, '#ff2a55', 0.08);
    },
  },
};

/* ==========================================================================
 * YENİ DÜŞMANLAR — Ayaz Geçidi, Kara Bataklık, Kor Ocakları, Boşluk Tahtı
 *  ve bölüm boss'ları. Aynı sözleşme: normalize uzay, ayaklar y=0, sağa bakar.
 * ======================================================================== */

/** Kuş/yarasa kanadı (yandan): omuzdan uca, tüylü arka kenar. up: kanat yukarıda. */
function sideWing(g, sx, sy, up, span, color, edge) {
  const tip = up ? [sx - span * 0.55, sy - span * 0.95] : [sx - span * 0.5, sy + span * 0.45];
  const mid = up ? [sx - span * 0.25, sy - span * 0.55] : [sx - span * 0.2, sy + span * 0.2];
  const back = [sx - span * 0.35, sy + 0.04];
  const w = P((p) => {
    p.moveTo(sx, sy);
    p.quadraticCurveTo(mid[0] + 0.06, mid[1] - 0.04, tip[0], tip[1]);
    const n = 4;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = tip[0] + (back[0] - tip[0]) * t;
      const y = tip[1] + (back[1] - tip[1]) * t;
      p.lineTo(x + 0.05, y + (up ? 0.03 : -0.03));
      p.lineTo(x, y);
    }
    p.closePath();
  });
  paint(g, w, color, [tip[0], Math.min(tip[1], sy), span, span], { light: 0.25, dark: 0.35, line: 0.026 });
  line(g, [[sx, sy], mid, tip], 0.018, edge, 0.8);
}

/** Kollu, cübbeli figür gövdesi (cadı, gezgin, haberci için ortak). */
function robe(g, top, hemY, w, color, sway) {
  const r = poly([[-w * 0.45, top], [w * 0.5, top], [w + sway, hemY], [w * 0.4, hemY - 0.05], [0, hemY + 0.02], [-w * 0.4, hemY - 0.04], [-w + sway, hemY]]);
  paint(g, r, color, [-w, top, w * 2, hemY - top], { line: 0.035 });
  return r;
}

Object.assign(ENEMY_ART, {
  /* ===================== AYAZ GEÇİDİ ===================== */
  frostwolf: {
    box: [1.7, 1.15, 0.85, 1.0],
    eyes: [[0.52, -0.58]], eyeR: 0.045,
    aura: { r: 0.6, color: '#7fe8ff' },
    draw(g, f, c) {
      ENEMY_ART.wolf.draw(g, f, c);
      for (let i = 0; i < 5; i++) {
        const x = -0.28 + i * 0.12;
        const h = 0.14 + (i % 2) * 0.06;
        paint(g, poly([[x - 0.035, -0.54], [x + 0.035, -0.54], [x + 0.01, -0.54 - h]]), '#d8f6ff', [x - 0.035, -0.54 - h, 0.07, h], { light: 0.3, dark: 0.2, line: 0.012 });
      }
      // nefes buğusu
      fill(g, blob([[0.74, -0.5], [0.84, -0.56], [0.92, -0.5], [0.84, -0.46]]), '#e6fbff', 0.35);
    },
  },

  raven: {
    box: [1.9, 1.35, 0.95, 1.2],
    scale: 1.35,
    eyes: [[0.4, -0.7]], eyeR: 0.035, fly: 0.55,
    draw(g, f, c) {
      const up = f === 0;
      sideWing(g, 0.02, -0.58, !up, 0.7, mixHex(c.body, '#000000', 0.35), '#9fb8d0'); // uzak kanat
      // kuyruk
      paint(g, poly([[-0.16, -0.56], [-0.52, -0.64], [-0.56, -0.54], [-0.5, -0.46], [-0.16, -0.48]]), c.dark, [-0.56, -0.64, 0.4, 0.18], { line: 0.024 });
      // gövde
      paint(g, ell(0.02, -0.55, 0.26, 0.13), c.body, [-0.24, -0.68, 0.52, 0.26], { light: 0.35, line: 0.026 });
      // baş ve gaga
      paint(g, circle(0.32, -0.66, 0.11), c.body, [0.21, -0.77, 0.22, 0.22], { light: 0.35, line: 0.024 });
      paint(g, poly([[0.4, -0.7], [0.58, -0.64], [0.4, -0.61]]), '#6a6a74', [0.4, -0.7, 0.18, 0.09], { line: 0.014 });
      socket(g, 0.4, -0.7, 0.034);
      // kırağı lekeleri
      for (const [x, y] of [[-0.08, -0.62], [0.1, -0.64], [-0.14, -0.52], [0.04, -0.5]]) fill(g, circle(x, y, 0.02), '#d8f6ff', 0.75);
      sideWing(g, 0.04, -0.56, up, 0.8, shadeHex(c.body, 0.15), '#d8f6ff'); // yakın kanat
    },
  },

  golem: {
    box: [1.6, 1.3, 0.8, 1.18],
    eyes: [[0.18, -0.86], [0.27, -0.86]], eyeR: 0.034,
    lights: [{ x: 0, y: -0.55, r: 0.35, color: '#9fe8ff', kind: 'core' }],
    draw(g, f, c) {
      const st = f === 0 ? 1 : -1;
      // bacaklar
      paint(g, poly([[-0.26, -0.32], [-0.06, -0.32], [-0.08 - 0.05 * st, 0], [-0.3 - 0.05 * st, 0]]), shadeHex(c.body, -0.25), [-0.3, -0.32, 0.24, 0.32], { line: 0.035 });
      paint(g, poly([[0.06, -0.32], [0.26, -0.32], [0.28 + 0.05 * st, 0], [0.06 + 0.05 * st, 0]]), c.body, [0.06, -0.32, 0.24, 0.32], { line: 0.035 });
      // arka kol
      paint(g, poly([[-0.42, -0.74], [-0.28, -0.76], [-0.3, -0.36], [-0.46, -0.34]]), shadeHex(c.body, -0.3), [-0.46, -0.76, 0.18, 0.42], { line: 0.035 });
      // gövde: köşeli buz bloğu
      const torso = poly([[-0.34, -0.3], [-0.38, -0.78], [-0.12, -0.92], [0.3, -0.86], [0.38, -0.5], [0.3, -0.28]]);
      paint(g, torso, c.body, [-0.38, -0.92, 0.76, 0.64], { light: 0.4, dark: 0.35, line: 0.04 });
      g.save();
      g.clip(torso);
      line(g, [[-0.2, -0.88], [-0.05, -0.6], [-0.18, -0.36]], 0.016, '#ffffff', 0.5);
      line(g, [[0.12, -0.82], [0.2, -0.56]], 0.014, c.dark, 0.6);
      g.restore();
      glowFill(g, poly([[-0.04, -0.62], [0.04, -0.66], [0.08, -0.54], [0, -0.48], [-0.07, -0.54]]), '#bff4ff', 0.1, 0.9);
      // omuz kristalleri
      for (const [x, h, a] of [[-0.3, 0.26, -0.3], [-0.16, 0.34, -0.1], [0.22, 0.24, 0.3]]) {
        g.save();
        g.translate(x, -0.84);
        g.rotate(a);
        paint(g, poly([[-0.05, 0], [0.05, 0], [0, -h]]), '#e6fbff', [-0.05, -h, 0.1, h], { light: 0.3, dark: 0.2, line: 0.014 });
        g.restore();
      }
      // baş
      paint(g, poly([[0.1, -0.8], [0.36, -0.82], [0.38, -0.94], [0.12, -0.96]]), shadeHex(c.body, 0.1), [0.1, -0.96, 0.28, 0.16], { line: 0.03 });
      socket(g, 0.18, -0.86, 0.034);
      socket(g, 0.27, -0.86, 0.034);
      // ön kol
      paint(g, poly([[0.26, -0.78], [0.42, -0.74], [0.46, -0.36 - 0.03 * st], [0.3, -0.34 - 0.03 * st]]), c.body, [0.26, -0.78, 0.2, 0.44], { line: 0.035 });
    },
  },

  shardling: {
    box: [1.2, 1.05, 0.6, 0.92],
    scale: 1.4,
    eyes: [[0.12, -0.55]], eyeR: 0.05,
    draw(g, f, c) {
      const st = f === 0 ? 1 : -1;
      limb(g, [[-0.08, -0.25], [-0.12 - 0.06 * st, -0.12], [-0.16 - 0.08 * st, 0]], 0.045, c.dark);
      limb(g, [[0.08, -0.25], [0.1 + 0.06 * st, -0.12], [0.14 + 0.08 * st, 0]], 0.045, c.dark);
      const body = poly([[0, -0.86], [0.24, -0.5], [0.14, -0.22], [-0.14, -0.22], [-0.24, -0.5]]);
      g.save();
      g.shadowColor = '#a6ecff';
      g.shadowBlur = 0.12 * px;
      fill(g, body, '#a6ecff', 0.5);
      g.restore();
      paint(g, poly([[0, -0.86], [0.04, -0.5], [0, -0.22], [-0.14, -0.22], [-0.24, -0.5]]), c.body, [-0.24, -0.86, 0.28, 0.64], { light: 0.35, dark: 0.15, line: 0.03 });
      paint(g, poly([[0, -0.86], [0.24, -0.5], [0.14, -0.22], [0, -0.22], [0.04, -0.5]]), c.dark, [0, -0.86, 0.24, 0.64], { light: 0.15, dark: 0.3, line: 0.03 });
      socket(g, 0.12, -0.55, 0.05);
    },
  },

  witch: {
    box: [1.4, 1.4, 0.65, 1.25],
    eyes: [[0.1, -0.84], [0.17, -0.84]], eyeR: 0.028,
    aura: { r: 0.7, color: '#9fe8ff' },
    lights: [{ x: 0.32, y: -1.12, r: 0.32, color: '#bff4ff', kind: 'core' }],
    draw(g, f, c) {
      const sw = f === 0 ? 0 : 0.03;
      line(g, [[0.32, 0.02], [0.32, -1.02 - sw]], 0.05, INK);
      line(g, [[0.32, 0.02], [0.32, -1.02 - sw]], 0.03, '#c8dce8');
      const r = robe(g, -0.74, 0, 0.3, c.body, sw);
      g.save();
      g.clip(r);
      for (let i = 0; i < 3; i++) curve(g, [[-0.08 + i * 0.1, -0.7], [-0.12 + i * 0.1, -0.35], [-0.18 + i * 0.13, 0]], 0.014, '#9fe8ff', 0.5);
      g.restore();
      // saç: beyaz örgüler
      for (const x of [-0.08, -0.03]) curve(g, [[x, -0.82], [x - 0.06, -0.62], [x - 0.04, -0.46]], 0.03, '#e6f2fb');
      const hood = blob([[-0.1, -0.74], [-0.08, -0.96], [0.08, -1.04], [0.24, -0.94], [0.24, -0.74]]);
      paint(g, hood, shadeHex(c.body, 0.12), [-0.1, -1.04, 0.34, 0.3], { line: 0.035 });
      fill(g, blob([[0.04, -0.92], [0.22, -0.92], [0.24, -0.78], [0.08, -0.76]]), '#0a1020');
      limb(g, [[0.1, -0.62], [0.24, -0.6], [0.32, -0.64]], 0.045, shadeHex(c.body, -0.1), 0.025);
      // asanın tepesindeki buz kristali
      const ty = -1.02 - sw;
      glowFill(g, poly([[0.32, ty - 0.2], [0.38, ty - 0.08], [0.32, ty + 0.02], [0.26, ty - 0.08]]), '#bff4ff', 0.12);
      for (const [x, y] of [[0.2, ty - 0.2], [0.44, ty - 0.14]]) fill(g, poly([[x, y - 0.05], [x + 0.025, y], [x, y + 0.05], [x - 0.025, y]]), '#e6fbff', 0.9);
    },
  },

  /* ===================== KARA BATAKLIK ===================== */
  slime: {
    box: [1.3, 1.0, 0.65, 0.9],
    eyes: [[0.12, -0.52], [0.26, -0.5]], eyeR: 0.04,
    draw(g, f, c) {
      const sq = f === 0 ? 1 : 0;
      const w = 0.42 + sq * 0.05;
      const h = 0.66 - sq * 0.08;
      const body = P((p) => {
        p.moveTo(-w, 0);
        p.quadraticCurveTo(-w - 0.04, -h * 0.7, -0.05, -h);
        p.quadraticCurveTo(w + 0.08, -h * 0.9, w, 0);
        p.closePath();
      });
      paint(g, body, c.body, [-w, -h, w * 2, h], { light: 0.35, dark: 0.4, line: 0.035 });
      g.save();
      g.clip(body);
      for (const [x, y, r] of [[-0.18, -0.25, 0.05], [0.05, -0.18, 0.04], [-0.05, -0.4, 0.035]]) {
        g.lineWidth = 0.012;
        g.strokeStyle = shadeHex(c.body, 0.4);
        g.stroke(circle(x, y, r));
      }
      fill(g, ell(-0.15, -h * 0.75, 0.12, 0.05, -0.4), '#ffffff', 0.25);
      g.restore();
      // ağız ve damlalar
      fill(g, ell(0.2, -0.3, 0.08, 0.035), c.dark, 0.9);
      for (const x of [-0.3, 0.32]) fill(g, ell(x, -0.01, 0.06, 0.02), c.body, 0.7);
      socket(g, 0.12, -0.52, 0.045);
      socket(g, 0.26, -0.5, 0.04);
    },
  },

  slimelet: {
    box: [1.3, 1.0, 0.65, 0.9],
    eyes: [[0.12, -0.52], [0.26, -0.5]], eyeR: 0.045,
    draw(g, f, c) {
      ENEMY_ART.slime.draw(g, f, c);
    },
  },

  bloater: {
    box: [1.4, 1.3, 0.7, 1.15],
    eyes: [[0.2, -0.95], [0.28, -0.94]], eyeR: 0.028,
    lights: [{ x: -0.05, y: -0.5, r: 0.38, color: '#c6ff4a', kind: 'ember' }],
    draw(g, f, c) {
      const st = f === 0 ? 1 : -1;
      limb(g, [[-0.12, -0.2], [-0.14 - 0.05 * st, -0.1], [-0.16 - 0.06 * st, 0]], 0.08, shadeHex(c.body, -0.3));
      limb(g, [[0.12, -0.2], [0.13 + 0.05 * st, -0.1], [0.15 + 0.06 * st, 0]], 0.08, c.body);
      // şiş göbek
      const belly = circle(0, -0.5, 0.36);
      paint(g, belly, c.body, [-0.36, -0.86, 0.72, 0.72], { light: 0.35, dark: 0.45, line: 0.04 });
      g.save();
      g.clip(belly);
      fill(g, circle(0.05, -0.45, 0.22), '#9aaa5a', 0.4);
      for (const [x, y, r] of [[-0.14, -0.6, 0.06], [0.12, -0.36, 0.07], [0.0, -0.66, 0.045]]) {
        glowFill(g, circle(x, y, r), '#b6e04a', 0.06, 0.55);
      }
      g.restore();
      // dikiş
      line(g, [[-0.05, -0.82], [0.02, -0.52], [-0.04, -0.2]], 0.014, INK, 0.8);
      for (let i = 0; i < 5; i++) line(g, [[-0.07 + i * 0.01, -0.76 + i * 0.12], [0.03 + i * 0.01, -0.74 + i * 0.12]], 0.01, INK, 0.7);
      // kollar ve küçük baş
      limb(g, [[0.26, -0.66], [0.38, -0.48], [0.34, -0.32]], 0.05, shadeHex(c.body, -0.1));
      paint(g, circle(0.22, -0.92, 0.12), shadeHex(c.body, 0.1), [0.1, -1.04, 0.24, 0.24], { line: 0.03 });
      socket(g, 0.2, -0.95, 0.028);
      socket(g, 0.28, -0.94, 0.026);
      fill(g, ell(0.27, -0.86, 0.04, 0.02), '#120a0a');
      // gaz kabarcıkları
      for (const [x, y] of [[-0.3, -0.9], [-0.38, -0.78]]) {
        g.lineWidth = 0.01;
        g.strokeStyle = '#c6ff4a';
        g.stroke(circle(x, y + (f ? 0.03 : 0), 0.035));
      }
    },
  },

  lurker: {
    box: [1.9, 1.0, 0.95, 0.85],
    scale: 1.15,
    eyes: [[0.58, -0.42]], eyeR: 0.042,
    draw(g, f, c) {
      const st = f === 0 ? 1 : -1;
      const legs = [[-0.22, -0.14], [0.26, -0.14]];
      for (const [x] of legs) limb(g, [[x, -0.2], [x - 0.09 * st, -0.1], [x - 0.13 * st, 0]], 0.06, shadeHex(c.body, -0.35));
      // kuyruk
      curve(g, [[-0.34, -0.26], [-0.6, -0.22 + 0.04 * st], [-0.84, -0.1]], 0.15, INK);
      curve(g, [[-0.34, -0.26], [-0.6, -0.22 + 0.04 * st], [-0.84, -0.1]], 0.11, c.body);
      // gövde
      const body = blob([[-0.44, -0.22], [-0.34, -0.44], [0.08, -0.5], [0.42, -0.42], [0.48, -0.22], [0.1, -0.12], [-0.3, -0.12]]);
      paint(g, body, c.body, [-0.44, -0.5, 0.92, 0.38], { light: 0.3, line: 0.032 });
      g.save();
      g.clip(body);
      g.fillStyle = lin(g, 0, -0.3, 0, -0.12, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(40,30,10,0.6)']]);
      g.fillRect(-0.5, -0.3, 1, 0.2);
      g.restore();
      for (let i = 0; i < 6; i++) paint(g, poly([[-0.3 + i * 0.12, -0.44], [-0.26 + i * 0.12, -0.54], [-0.22 + i * 0.12, -0.45]]), c.dark, [-0.32, -0.54, 0.8, 0.1], { line: 0.01 });
      for (const [x] of legs) limb(g, [[x + 0.04, -0.2], [x + 0.09 * st, -0.1], [x + 0.13 * st, 0]], 0.065, c.body);
      // baş ve çeneler
      const head = blob([[0.36, -0.42], [0.54, -0.5], [0.8, -0.4], [0.82, -0.32], [0.46, -0.26]]);
      paint(g, head, shadeHex(c.body, 0.08), [0.36, -0.5, 0.46, 0.24], { light: 0.3, line: 0.03 });
      fill(g, poly([[0.5, -0.32], [0.82, -0.33], [0.78, -0.24], [0.5, -0.26]]), '#140c06');
      for (const x of [0.56, 0.63, 0.7, 0.77]) fill(g, poly([[x - 0.012, -0.325], [x + 0.012, -0.325], [x, -0.29]]), BONE);
      socket(g, 0.58, -0.42, 0.04);
      // çamur damlaları
      for (const x of [-0.12, 0.18]) fill(g, ell(x, -0.12, 0.06, 0.025), '#2a2010', 0.8);
    },
  },

  troll: {
    box: [1.6, 1.35, 0.8, 1.2],
    eyes: [[0.3, -0.86], [0.37, -0.85]], eyeR: 0.032,
    draw(g, f, c) {
      const st = f === 0 ? 1 : -1;
      paint(g, poly([[-0.24, -0.34], [-0.06, -0.34], [-0.1 - 0.05 * st, 0], [-0.3 - 0.05 * st, 0]]), shadeHex(c.body, -0.25), [-0.3, -0.34, 0.24, 0.34], { line: 0.035 });
      // arka kol (yere sarkar)
      limb(g, [[-0.32, -0.76], [-0.46, -0.44], [-0.4, -0.08 - 0.03 * st]], 0.11, shadeHex(c.body, -0.3));
      // kambur gövde
      const torso = blob([[-0.4, -0.4], [-0.44, -0.8], [-0.16, -1.0], [0.24, -0.92], [0.4, -0.6], [0.3, -0.32], [-0.2, -0.28]]);
      paint(g, torso, c.body, [-0.44, -1.0, 0.84, 0.72], { line: 0.04 });
      g.save();
      g.clip(torso);
      fill(g, blob([[-0.38, -0.86], [-0.14, -1.0], [0.06, -0.94], [-0.2, -0.82]]), '#3a5a2a', 0.85);
      for (let i = 0; i < 4; i++) curve(g, [[-0.3 + i * 0.12, -0.9], [-0.32 + i * 0.12, -0.7], [-0.28 + i * 0.12, -0.5]], 0.014, c.dark, 0.6);
      g.restore();
      paint(g, poly([[0.06, -0.34], [0.26, -0.34], [0.3 + 0.05 * st, 0], [0.08 + 0.05 * st, 0]]), c.body, [0.06, -0.34, 0.24, 0.34], { line: 0.035 });
      // baş ve dişler
      const head = blob([[0.16, -0.82], [0.22, -0.96], [0.42, -0.94], [0.48, -0.8], [0.4, -0.72], [0.22, -0.74]]);
      paint(g, head, shadeHex(c.body, 0.1), [0.16, -0.96, 0.32, 0.24], { line: 0.032 });
      socket(g, 0.3, -0.86, 0.03);
      socket(g, 0.37, -0.85, 0.028);
      for (const x of [0.32, 0.42]) paint(g, poly([[x - 0.015, -0.76], [x + 0.015, -0.76], [x, -0.84]]), BONE, [x - 0.015, -0.84, 0.03, 0.08], { line: 0.008 });
      // ön kol ve sopa
      limb(g, [[0.3, -0.76], [0.44, -0.5], [0.42, -0.24]], 0.1, c.body);
      line(g, [[0.36, -0.16], [0.62, -0.62]], 0.08, INK);
      line(g, [[0.36, -0.16], [0.62, -0.62]], 0.055, '#4a3220');
    },
  },

  /* ===================== KOR OCAKLARI ===================== */
  imp: {
    box: [1.4, 1.25, 0.7, 1.1],
    scale: 1.15,
    eyes: [[0.12, -0.74], [0.2, -0.74]], eyeR: 0.032,
    lights: [{ x: 0.08, y: -0.98, r: 0.3, color: '#ffb347', kind: 'fire' }],
    draw(g, f, c) {
      const st = f === 0 ? 1 : -1;
      // kuyruk
      curve(g, [[-0.1, -0.34], [-0.34, -0.3], [-0.42, -0.5 - 0.04 * st]], 0.03, c.dark);
      fill(g, poly([[-0.42, -0.56 - 0.04 * st], [-0.48, -0.48 - 0.04 * st], [-0.36, -0.46 - 0.04 * st]]), c.dark);
      // kanatçıklar
      for (const [sx, col] of [[-1, c.dark], [1, shadeHex(c.dark, 0.2)]]) {
        const w = poly([[-0.04, -0.62], [-0.3 + sx * 0.02, -0.86 - 0.06 * st], [-0.34, -0.6], [-0.22, -0.66], [-0.16, -0.54]]);
        paint(g, w, col, [-0.34, -0.9, 0.3, 0.36], { line: 0.022 });
      }
      limb(g, [[-0.04, -0.3], [-0.08 - 0.05 * st, -0.15], [-0.1 - 0.07 * st, 0]], 0.05, c.dark);
      limb(g, [[0.04, -0.3], [0.06 + 0.05 * st, -0.15], [0.08 + 0.07 * st, 0]], 0.05, c.body);
      paint(g, ell(0.0, -0.46, 0.14, 0.18), c.body, [-0.14, -0.64, 0.28, 0.36], { line: 0.03 });
      paint(g, circle(0.14, -0.74, 0.12), shadeHex(c.body, 0.1), [0.02, -0.86, 0.24, 0.24], { line: 0.028 });
      for (const sx of [-1, 1]) {
        const hx = 0.14 + sx * 0.08;
        paint(g, poly([[hx - 0.025, -0.82], [hx + 0.025, -0.82], [hx + sx * 0.06, -0.96]]), BONE, [hx - 0.03, -0.96, 0.08, 0.14], { line: 0.01 });
      }
      socket(g, 0.12, -0.74, 0.028);
      socket(g, 0.2, -0.74, 0.026);
      fill(g, poly([[0.12, -0.68], [0.24, -0.68], [0.2, -0.64]]), '#200402');
      // alev saç
      glowFill(g, blob([[0.04, -0.84], [0.06, -0.98], [0.12, -0.92], [0.16, -1.06], [0.2, -0.9], [0.24, -0.84]]), '#ffb347', 0.08, 0.95);
      limb(g, [[0.1, -0.52], [0.24, -0.46], [0.3, -0.52]], 0.04, c.body, 0.022);
    },
  },

  drummer: {
    box: [1.5, 1.35, 0.72, 1.2],
    eyes: [[0.2, -0.86], [0.27, -0.86]], eyeR: 0.03,
    aura: { r: 0.8, color: '#ffb35c' },
    draw(g, f, c) {
      const st = f === 0 ? 1 : -1;
      limb(g, [[-0.06, -0.34], [-0.1 - 0.05 * st, -0.16], [-0.12 - 0.07 * st, 0]], 0.08, shadeHex(c.body, -0.3));
      limb(g, [[0.06, -0.34], [0.08 + 0.05 * st, -0.16], [0.1 + 0.07 * st, 0]], 0.08, c.body);
      const torso = poly([[-0.24, -0.78], [0.22, -0.78], [0.2, -0.32], [-0.2, -0.32]]);
      paint(g, torso, c.body, [-0.24, -0.78, 0.46, 0.46], { line: 0.035 });
      line(g, [[-0.22, -0.74], [0.18, -0.36]], 0.03, '#2a1408'); // kayış
      const head = blob([[0.08, -0.78], [0.1, -0.96], [0.26, -0.98], [0.34, -0.86], [0.3, -0.76]]);
      paint(g, head, shadeHex(c.body, 0.1), [0.08, -0.98, 0.26, 0.22], { line: 0.03 });
      socket(g, 0.2, -0.86, 0.028);
      socket(g, 0.27, -0.86, 0.026);
      for (const x of [0.22, 0.3]) fill(g, poly([[x - 0.012, -0.78], [x + 0.012, -0.78], [x, -0.82]]), BONE);
      // davul (önde, yandan görünen fıçı; deri yüzü sağa bakar)
      const dy = -0.5;
      const barrel = P((p) => {
        p.moveTo(0.14, dy - 0.16);
        p.lineTo(0.4, dy - 0.18);
        p.ellipse(0.4, dy, 0.07, 0.18, 0, -Math.PI / 2, Math.PI / 2);
        p.lineTo(0.14, dy + 0.16);
        p.ellipse(0.14, dy, 0.06, 0.16, 0, Math.PI / 2, -Math.PI / 2);
        p.closePath();
      });
      paint(g, barrel, '#7a2a1a', [0.08, dy - 0.18, 0.4, 0.36], { light: 0.3, dark: 0.45, line: 0.03 });
      g.save();
      g.clip(barrel);
      for (const x of [0.2, 0.34]) line(g, [[x, dy - 0.2], [x, dy + 0.2]], 0.03, GOLD, 0.9);
      for (let i = 0; i < 5; i++) line(g, [[0.14 + i * 0.06, dy - 0.17], [0.17 + i * 0.06, dy + 0.17]], 0.008, '#d9cfbf', 0.6);
      g.restore();
      paint(g, ell(0.4, dy, 0.065, 0.17), '#e0d0b0', [0.335, dy - 0.17, 0.13, 0.34], { light: 0.35, dark: 0.2, line: 0.022 });
      // tokmaklar
      const up = f === 0;
      limb(g, [[0.16, -0.7], [0.36, up ? -0.86 : -0.64], [0.5, up ? -0.82 : -0.5]], 0.045, c.body, 0.025);
      fill(g, circle(0.5, up ? -0.82 : -0.5, 0.04), BONE);
    },
  },

  molten: {
    box: [1.5, 1.3, 0.75, 1.15],
    eyes: [[0.24, -0.86], [0.32, -0.85]], eyeR: 0.035,
    lights: [{ x: 0, y: -0.58, r: 0.42, color: '#ff7a1a', kind: 'ember' }],
    draw(g, f, c) {
      ENEMY_ART.brute.draw(g, f, c);
      // lav çatlakları (gövdenin üstüne)
      glowLine(g, [[-0.3, -0.8], [-0.18, -0.66], [-0.24, -0.5], [-0.12, -0.38]], 0.022, '#ff7a1a', 0.1);
      glowLine(g, [[0.12, -0.84], [0.04, -0.7], [0.14, -0.56]], 0.02, '#ffb347', 0.1);
      glowLine(g, [[0.36, -0.56], [0.44, -0.42]], 0.018, '#ff7a1a', 0.08);
      for (const [x, y] of [[-0.2, -0.92], [0.06, -0.96]]) glowFill(g, circle(x, y, 0.03), '#ffb347', 0.06);
    },
  },

  wyvern: {
    box: [2.0, 1.3, 1.0, 1.15],
    eyes: [[0.62, -0.78]], eyeR: 0.03, fly: 0.6,
    lights: [{ x: 0.7, y: -0.72, r: 0.22, color: '#ffb347', kind: 'fire' }],
    draw(g, f, c) {
      const up = f === 0;
      sideWing(g, 0.04, -0.62, !up, 0.7, mixHex(c.body, '#000000', 0.5), c.dark);
      curve(g, [[-0.2, -0.5], [-0.5, -0.46], [-0.72, -0.56], [-0.86, -0.5]], 0.08, INK);
      curve(g, [[-0.2, -0.5], [-0.5, -0.46], [-0.72, -0.56], [-0.86, -0.5]], 0.05, c.body);
      fill(g, poly([[-0.84, -0.56], [-0.96, -0.5], [-0.84, -0.44]]), c.dark);
      const body = blob([[-0.26, -0.5], [-0.12, -0.64], [0.2, -0.66], [0.34, -0.56], [0.2, -0.44], [-0.14, -0.42]]);
      paint(g, body, c.body, [-0.26, -0.66, 0.6, 0.24], { line: 0.03 });
      g.save();
      g.clip(body);
      g.fillStyle = lin(g, 0, -0.52, 0, -0.42, [[0, 'rgba(255,170,60,0)'], [1, 'rgba(255,170,60,0.55)']]);
      g.fillRect(-0.3, -0.56, 0.66, 0.16);
      g.restore();
      curve(g, [[0.26, -0.6], [0.4, -0.74], [0.54, -0.76]], 0.11, INK);
      curve(g, [[0.26, -0.6], [0.4, -0.74], [0.54, -0.76]], 0.08, c.body);
      const head = blob([[0.5, -0.76], [0.6, -0.84], [0.76, -0.78], [0.8, -0.72], [0.62, -0.7]]);
      paint(g, head, c.body, [0.5, -0.84, 0.3, 0.14], { line: 0.026 });
      paint(g, poly([[0.58, -0.84], [0.54, -0.96], [0.62, -0.84]]), BONE, [0.54, -0.96, 0.08, 0.12], { line: 0.01 });
      socket(g, 0.62, -0.78, 0.026);
      limb(g, [[0.1, -0.46], [0.12, -0.36], [0.18, -0.34]], 0.04, c.dark, 0.02);
      sideWing(g, 0.08, -0.6, up, 0.78, mixHex(c.body, '#000000', 0.15), shadeHex(c.body, 0.15));
    },
  },

  /* ===================== BOŞLUK TAHTI ===================== */
  voidwalker: {
    box: [1.4, 1.4, 0.68, 1.3],
    eyes: [[0.12, -0.88], [0.19, -0.88]], eyeR: 0.026, fly: 0.08,
    aura: { r: 0.75, color: '#a04aff' },
    draw(g, f, c) {
      const sw = f === 0 ? 0 : 0.04;
      // süzülen kurdeleler
      for (const [x, l] of [[-0.24, 0.5], [0.1, 0.42]]) curve(g, [[x, -0.5], [x - 0.12 - sw, -0.25], [x - 0.04, -0.02 - l * 0.1]], 0.04, c.dark, 0.85);
      const r = robe(g, -0.84, -0.06, 0.26, c.body, sw);
      g.save();
      g.clip(r);
      for (let i = 0; i < 8; i++) fill(g, circle(-0.2 + ((i * 0.13) % 0.4), -0.7 + ((i * 0.23) % 0.6), 0.012), '#e6c8ff', 0.8);
      g.restore();
      line(g, [[-0.24, -0.2], [0.26, -0.16]], 0.02, '#c08aff', 0.6);
      const hood = blob([[-0.08, -0.82], [-0.08, -1.04], [0.08, -1.12], [0.24, -1.02], [0.24, -0.82]]);
      paint(g, hood, shadeHex(c.body, 0.1), [-0.08, -1.12, 0.32, 0.3], { line: 0.03 });
      fill(g, blob([[0.02, -0.98], [0.22, -1.0], [0.24, -0.82], [0.06, -0.8]]), '#05020a');
      limb(g, [[0.08, -0.7], [0.26, -0.64 + sw], [0.36, -0.7]], 0.04, c.body, 0.02);
      glowFill(g, circle(0.38, -0.72, 0.035), '#d08aff', 0.08);
    },
  },

  spider: {
    box: [2.0, 1.0, 1.0, 0.85],
    scale: 1.1,
    eyes: [[0.42, -0.36], [0.48, -0.34], [0.36, -0.32]], eyeR: 0.022,
    draw(g, f, c) {
      const st = f === 0 ? 1 : -1;
      // bacaklar (arka çift önce)
      const legs = [[-0.12, 0.06], [0.0, 0.03], [0.12, 0.0], [0.24, -0.03]];
      legs.forEach(([x, o], i) => {
        const ph = (i % 2 ? st : -st) * 0.06;
        limb(g, [[x, -0.34], [x - 0.26 + ph, -0.62], [x - 0.44 + ph, 0]], 0.042, shadeHex(c.dark, 0.35), 0.026);
        limb(g, [[x, -0.34], [x + 0.22 - ph, -0.64], [x + 0.4 - ph, 0]], 0.042, shadeHex(c.dark, 0.35), 0.026);
      });
      // karın
      const abd = ell(-0.3, -0.4, 0.28, 0.22);
      paint(g, abd, c.body, [-0.58, -0.62, 0.56, 0.44], { light: 0.3, dark: 0.45, line: 0.032 });
      glowLine(g, [[-0.42, -0.5], [-0.3, -0.42], [-0.18, -0.5]], 0.016, c.eye, 0.08);
      glowLine(g, [[-0.4, -0.36], [-0.3, -0.3], [-0.2, -0.36]], 0.014, c.eye, 0.06);
      // gövde ve baş
      paint(g, ell(0.14, -0.36, 0.16, 0.12), shadeHex(c.body, 0.1), [-0.02, -0.48, 0.32, 0.24], { line: 0.028 });
      paint(g, circle(0.4, -0.34, 0.1), c.body, [0.3, -0.44, 0.2, 0.2], { line: 0.026 });
      for (const [x, y] of [[0.42, -0.36], [0.48, -0.34], [0.36, -0.32]]) socket(g, x, y, 0.02);
      for (const sy of [-1, 1]) curve(g, [[0.46, -0.28], [0.54, -0.28 + sy * 0.03], [0.52, -0.22 + sy * 0.03]], 0.018, BONE);
    },
  },

  revenant: {
    box: [1.4, 1.4, 0.68, 1.28],
    eyes: [[0.06, -0.9], [0.14, -0.9]], eyeR: 0.03,
    aura: { r: 0.7, color: '#7a5aff' },
    draw(g, f, c) {
      const st = f === 0 ? 1 : -1;
      const cape = P((p) => {
        p.moveTo(-0.16, -0.78);
        p.quadraticCurveTo(-0.46, -0.4, -0.46 - 0.03 * st, 0.0);
        for (const [x, y] of [[-0.34, -0.06], [-0.22, 0.01], [-0.1, -0.05]]) p.lineTo(x, y);
        p.lineTo(0.12, -0.74);
        p.closePath();
      });
      paint(g, cape, '#140a24', [-0.48, -0.78, 0.6, 0.78], { light: 0.25, dark: 0.3, line: 0.03 });
      limb(g, [[-0.06, -0.34], [-0.08 - 0.05 * st, -0.17], [-0.1 - 0.06 * st, 0]], 0.08, '#1e1a2e');
      limb(g, [[0.06, -0.34], [0.07 + 0.05 * st, -0.17], [0.09 + 0.06 * st, 0]], 0.08, c.body);
      const torso = poly([[-0.2, -0.76], [0.22, -0.76], [0.16, -0.32], [-0.16, -0.32]]);
      paint(g, torso, c.body, [-0.2, -0.76, 0.42, 0.44], { line: 0.035 });
      glowLine(g, [[-0.12, -0.6], [0, -0.52], [0.12, -0.6]], 0.016, c.eye, 0.08);
      for (const sx of [-1, 1]) paint(g, ell(sx * 0.2, -0.74, 0.12, 0.08), shadeHex(c.body, 0.15), [-0.32, -0.82, 0.64, 0.16], { line: 0.025 });
      const helm = blob([[-0.12, -0.78], [-0.13, -0.98], [0.02, -1.06], [0.18, -0.98], [0.2, -0.78]]);
      paint(g, helm, shadeHex(c.body, 0.05), [-0.13, -1.06, 0.33, 0.28], { line: 0.035 });
      fill(g, poly([[-0.02, -0.92], [0.2, -0.92], [0.2, -0.86], [-0.02, -0.86]]), '#05030a');
      for (const sx of [-1, 1]) paint(g, poly([[0.04 + sx * 0.08, -1.0], [0.04 + sx * 0.14, -1.14], [0.04 + sx * 0.04, -1.0]]), '#2a2440', [-0.12, -1.14, 0.3, 0.14], { line: 0.012 });
      // büyük kılıç
      line(g, [[0.3, -0.18], [0.46, -1.08]], 0.07, INK);
      line(g, [[0.3, -0.18], [0.46, -1.08]], 0.045, '#3a3a4e');
      glowLine(g, [[0.32, -0.28], [0.45, -1.02]], 0.012, c.eye, 0.08);
      line(g, [[0.2, -0.28], [0.4, -0.22]], 0.04, '#2a2238');
      limb(g, [[0.16, -0.7], [0.28, -0.5], [0.3, -0.28]], 0.06, c.body, 0.03);
    },
  },

  oracle: {
    box: [1.3, 1.35, 0.65, 1.2],
    scale: 1.25,
    eyes: [[0.12, -0.62]], eyeR: 0.05, fly: 0.5,
    aura: { r: 0.7, color: '#ffe06a' },
    draw(g, f, c) {
      const w = f === 0 ? 1 : -1;
      // dokunaçlar
      for (let i = 0; i < 5; i++) {
        const x = -0.18 + i * 0.09;
        const sway = (i % 2 ? w : -w) * 0.06;
        curve(g, [[x, -0.4], [x + sway, -0.24], [x - sway, -0.08], [x + sway * 0.5, 0.02]], 0.035, INK);
        curve(g, [[x, -0.4], [x + sway, -0.24], [x - sway, -0.08], [x + sway * 0.5, 0.02]], 0.022, c.dark);
      }
      // kanatçıklar
      for (const sx of [-1, 1]) {
        const wing = poly([[sx * 0.14, -0.72], [sx * 0.44, -0.9 - w * 0.04], [sx * 0.4, -0.66], [sx * 0.28, -0.6]]);
        paint(g, wing, shadeHex(c.body, sx < 0 ? -0.3 : 0), [-0.44, -0.94, 0.88, 0.34], { line: 0.022 });
      }
      // göz küresi
      paint(g, circle(0, -0.62, 0.26), c.body, [-0.26, -0.88, 0.52, 0.52], { light: 0.35, dark: 0.45, line: 0.035 });
      paint(g, ell(0.08, -0.62, 0.16, 0.17), '#f0e6d8', [-0.08, -0.79, 0.32, 0.34], { light: 0.3, dark: 0.3, line: 0.02 });
      fill(g, circle(0.12, -0.62, 0.09), '#c89a2a');
      socket(g, 0.12, -0.62, 0.045);
      for (const a of [-0.6, 0.2, 1.0]) line(g, [[Math.cos(a) * 0.06 + 0.08, -0.62 + Math.sin(a) * 0.08], [Math.cos(a) * 0.14 + 0.08, -0.62 + Math.sin(a) * 0.14]], 0.008, '#a01a2a', 0.6);
    },
  },

  /* ===================== BOSS'LAR ===================== */
  boss_yeti: {
    box: [1.6, 1.4, 0.8, 1.3],
    eyes: [[0.26, -0.86], [0.34, -0.86]], eyeR: 0.03,
    aura: { r: 1, color: '#58c8ff' },
    draw(g, f, c) {
      const st = f === 0 ? 1 : -1;
      paint(g, poly([[-0.26, -0.32], [-0.06, -0.32], [-0.1 - 0.05 * st, 0], [-0.32 - 0.05 * st, 0]]), shadeHex(c.body, -0.25), [-0.32, -0.32, 0.26, 0.32], { line: 0.035 });
      limb(g, [[-0.34, -0.78], [-0.5, -0.5], [-0.44, -0.2]], 0.12, shadeHex(c.body, -0.3));
      // kürk gövde
      const torso = blob([[-0.42, -0.36], [-0.46, -0.8], [-0.2, -1.02], [0.2, -1.0], [0.42, -0.72], [0.36, -0.34], [-0.2, -0.28]]);
      paint(g, torso, c.body, [-0.46, -1.02, 0.88, 0.74], { light: 0.3, dark: 0.4, line: 0.04 });
      g.save();
      g.clip(torso);
      for (let i = 0; i < 10; i++) {
        const x = -0.38 + (i % 5) * 0.18;
        const y = -0.92 + Math.floor(i / 5) * 0.3;
        curve(g, [[x, y], [x + 0.04, y + 0.08], [x, y + 0.16]], 0.014, shadeHex(c.body, -0.25), 0.7);
      }
      g.restore();
      // buz kaplı omuzlar
      for (const [x, h, a] of [[-0.3, 0.2, -0.4], [-0.1, 0.28, -0.1], [0.1, 0.22, 0.2]]) {
        g.save();
        g.translate(x, -0.94);
        g.rotate(a);
        paint(g, poly([[-0.05, 0], [0.05, 0], [0, -h]]), '#bff4ff', [-0.05, -h, 0.1, h], { light: 0.35, dark: 0.2, line: 0.014 });
        g.restore();
      }
      paint(g, poly([[0.08, -0.32], [0.28, -0.32], [0.32 + 0.05 * st, 0], [0.1 + 0.05 * st, 0]]), c.body, [0.08, -0.32, 0.24, 0.32], { line: 0.035 });
      // yüz
      const face = blob([[0.18, -0.8], [0.22, -0.96], [0.42, -0.94], [0.46, -0.8], [0.36, -0.72]]);
      paint(g, face, '#3a4a5a', [0.18, -0.96, 0.28, 0.24], { line: 0.03 });
      socket(g, 0.26, -0.86, 0.03);
      socket(g, 0.34, -0.86, 0.028);
      fill(g, poly([[0.26, -0.78], [0.42, -0.78], [0.38, -0.74]]), '#0a0e14');
      // buz sopası
      limb(g, [[0.3, -0.76], [0.46, -0.52], [0.44, -0.3]], 0.11, c.body);
      line(g, [[0.4, -0.2], [0.72, -0.84]], 0.07, INK);
      line(g, [[0.4, -0.2], [0.72, -0.84]], 0.045, '#7ab8d8');
      paint(g, poly([[0.64, -0.78], [0.8, -0.96], [0.86, -0.78], [0.76, -0.66]]), '#d8f6ff', [0.64, -0.96, 0.22, 0.3], { light: 0.35, dark: 0.2, line: 0.02 });
    },
  },

  boss_queen: {
    box: [1.5, 1.5, 0.75, 1.4],
    eyes: [[0.08, -0.92], [0.15, -0.92]], eyeR: 0.026,
    aura: { r: 1.05, color: '#bff4ff' },
    lights: [{ x: 0.36, y: -1.2, r: 0.38, color: '#bff4ff', kind: 'core' }],
    draw(g, f, c) {
      const sw = f === 0 ? 0 : 0.03;
      // pelerin
      const cape = P((p) => {
        p.moveTo(-0.14, -0.84);
        p.quadraticCurveTo(-0.56, -0.5, -0.6 - sw, 0.02);
        for (const [x, y] of [[-0.44, -0.04], [-0.3, 0.02], [-0.16, -0.03]]) p.lineTo(x, y);
        p.lineTo(0.1, -0.82);
        p.closePath();
      });
      paint(g, cape, '#1a2a44', [-0.6, -0.84, 0.7, 0.86], { light: 0.25, dark: 0.3, line: 0.03 });
      line(g, [[-0.6 - sw, 0.02], [-0.44, -0.04], [-0.3, 0.02], [-0.16, -0.03]], 0.018, '#bff4ff', 0.6);
      // asa
      line(g, [[0.36, 0.02], [0.36, -1.08]], 0.05, INK);
      line(g, [[0.36, 0.02], [0.36, -1.08]], 0.03, '#d8e6ee');
      // kabarık etek
      const gown = poly([[-0.14, -0.62], [0.14, -0.62], [0.36 + sw, 0], [-0.36 + sw, 0]]);
      paint(g, gown, c.body, [-0.36, -0.62, 0.72, 0.62], { light: 0.35, dark: 0.35, line: 0.035 });
      g.save();
      g.clip(gown);
      for (let i = 0; i < 5; i++) curve(g, [[-0.08 + i * 0.05, -0.6], [-0.16 + i * 0.09, -0.3], [-0.28 + i * 0.14, 0]], 0.012, '#7ab8d8', 0.6);
      g.restore();
      paint(g, poly([[-0.13, -0.86], [0.13, -0.86], [0.12, -0.6], [-0.12, -0.6]]), shadeHex(c.body, -0.1), [-0.13, -0.86, 0.26, 0.26], { line: 0.03 });
      // baş ve buz taç
      paint(g, ell(0.08, -0.94, 0.1, 0.11), '#e6f2fb', [-0.02, -1.05, 0.2, 0.22], { line: 0.026 });
      for (const x of [0.04, 0.12]) curve(g, [[x - 0.08, -0.98], [x - 0.14, -0.8], [x - 0.12, -0.66]], 0.03, '#f0f8ff');
      socket(g, 0.08, -0.92, 0.024);
      socket(g, 0.15, -0.92, 0.022);
      const crown = [[-0.04, -1.02], [-0.06, -1.16], [0.0, -1.06], [0.06, -1.22], [0.12, -1.06], [0.18, -1.16], [0.18, -1.02]];
      g.save();
      g.shadowColor = '#bff4ff';
      g.shadowBlur = 0.1 * px;
      paint(g, poly(crown), '#d8f6ff', [-0.06, -1.22, 0.24, 0.2], { light: 0.35, dark: 0.2, line: 0.016 });
      g.restore();
      limb(g, [[0.1, -0.78], [0.26, -0.7], [0.36, -0.76]], 0.04, '#e6f2fb', 0.022);
      const ty = -1.1;
      glowFill(g, poly([[0.36, ty - 0.22], [0.43, ty - 0.08], [0.36, ty + 0.04], [0.29, ty - 0.08]]), '#bff4ff', 0.14);
    },
  },

  boss_rotmother: {
    box: [1.7, 1.45, 0.85, 1.32],
    eyes: [[0.3, -0.9], [0.37, -0.89]], eyeR: 0.028,
    aura: { r: 1, color: '#b6ff3a' },
    lights: [{ x: 0.56, y: -0.56, r: 0.38, color: '#b6ff3a', kind: 'fire' }],
    draw(g, f, c) {
      const st = f === 0 ? 1 : -1;
      // paçavra etek
      const skirt = poly([[-0.4, -0.5], [0.3, -0.5], [0.42 + 0.03 * st, 0], [0.22, -0.06], [0.04, 0.0], [-0.16, -0.06], [-0.44 + 0.03 * st, 0]]);
      paint(g, skirt, shadeHex(c.body, -0.2), [-0.44, -0.5, 0.86, 0.5], { line: 0.035 });
      // kambur gövde
      const torso = blob([[-0.44, -0.46], [-0.42, -0.86], [-0.14, -1.06], [0.22, -1.0], [0.36, -0.76], [0.28, -0.44]]);
      paint(g, torso, c.body, [-0.44, -1.06, 0.8, 0.62], { line: 0.04 });
      g.save();
      g.clip(torso);
      for (const [x, y, r] of [[-0.24, -0.8, 0.06], [-0.02, -0.66, 0.07], [0.12, -0.9, 0.05]]) glowFill(g, circle(x, y, r), '#9adf2a', 0.06, 0.5);
      for (let i = 0; i < 5; i++) curve(g, [[-0.36 + i * 0.12, -1.0], [-0.4 + i * 0.12, -0.8], [-0.36 + i * 0.12, -0.56]], 0.02, '#2a3a1a', 0.7);
      g.restore();
      // saç ve baş
      for (const x of [0.12, 0.18, 0.24]) curve(g, [[x, -1.0], [x - 0.1, -0.84], [x - 0.08, -0.6]], 0.03, '#4a4a3a');
      const head = blob([[0.2, -0.86], [0.22, -1.0], [0.4, -1.02], [0.48, -0.88], [0.4, -0.78], [0.26, -0.78]]);
      paint(g, head, '#6a7a5a', [0.2, -1.02, 0.28, 0.24], { line: 0.03 });
      socket(g, 0.3, -0.9, 0.028);
      socket(g, 0.37, -0.89, 0.026);
      paint(g, poly([[0.44, -0.88], [0.56, -0.8], [0.44, -0.8]]), '#6a7a5a', [0.44, -0.88, 0.12, 0.08], { line: 0.012 }); // kanca burun
      // uzun kol ve fener
      limb(g, [[0.24, -0.72], [0.46, -0.66], [0.56, -0.7]], 0.06, '#5a6a4a', 0.03);
      line(g, [[0.56, -0.7], [0.56, -0.62]], 0.012, INK);
      paint(g, poly([[0.5, -0.62], [0.62, -0.62], [0.6, -0.48], [0.52, -0.48]]), '#2a2a1a', [0.5, -0.62, 0.12, 0.14], { line: 0.012 });
      glowFill(g, ell(0.56, -0.55, 0.035, 0.05), '#b6ff3a', 0.1);
      limb(g, [[-0.3, -0.78], [-0.5, -0.5], [-0.46, -0.24]], 0.07, shadeHex(c.body, -0.25));
    },
  },

  boss_hydra: {
    box: [2.0, 1.55, 1.0, 1.42],
    eyes: [[0.6, -1.12], [0.78, -0.78], [0.3, -1.2]], eyeR: 0.028,
    aura: { r: 1.05, color: '#d6ff3a' },
    draw(g, f, c) {
      const b = f === 0 ? 0 : 0.04;
      const neck = (pts, w) => {
        curve(g, pts, w + 0.04, INK);
        curve(g, pts, w, c.body);
      };
      const head = (x, y, s, eye) => {
        const h = blob([[x - 0.1 * s, y], [x - 0.02 * s, y - 0.08 * s], [x + 0.16 * s, y - 0.06 * s], [x + 0.22 * s, y + 0.02 * s], [x + 0.06 * s, y + 0.06 * s]]);
        paint(g, h, shadeHex(c.body, 0.1), [x - 0.1 * s, y - 0.08 * s, 0.32 * s, 0.14 * s], { line: 0.026 });
        fill(g, poly([[x + 0.06 * s, y + 0.02 * s], [x + 0.22 * s, y + 0.02 * s], [x + 0.18 * s, y + 0.06 * s]]), '#0a1206');
        socket(g, eye[0], eye[1], 0.026);
      };
      // kuyruk ve gövde
      curve(g, [[-0.3, -0.22], [-0.62, -0.2], [-0.92, -0.08]], 0.13, INK);
      curve(g, [[-0.3, -0.22], [-0.62, -0.2], [-0.92, -0.08]], 0.09, c.body);
      for (const x of [-0.22, 0.2]) limb(g, [[x, -0.18], [x + 0.06, -0.08], [x + 0.1, 0]], 0.07, shadeHex(c.body, -0.3));
      const body = blob([[-0.44, -0.2], [-0.3, -0.46], [0.1, -0.52], [0.4, -0.42], [0.44, -0.2], [0.1, -0.1], [-0.3, -0.1]]);
      paint(g, body, c.body, [-0.44, -0.52, 0.88, 0.42], { line: 0.035 });
      for (let i = 0; i < 6; i++) paint(g, poly([[-0.3 + i * 0.12, -0.48], [-0.26 + i * 0.12, -0.6], [-0.22 + i * 0.12, -0.49]]), c.dark, [-0.3, -0.6, 0.76, 0.12], { line: 0.012 });
      // üç boyun ve baş (arkadan öne)
      neck([[0.0, -0.46], [0.08, -0.8], [0.22, -1.1 - b], [0.3, -1.18 - b]], 0.1);
      head(0.26, -1.18 - b, 0.9, [0.3, -1.2 - b]);
      neck([[0.2, -0.44], [0.4, -0.7], [0.5, -1.0 + b], [0.58, -1.08 + b]], 0.11);
      head(0.56, -1.1 + b, 1, [0.6, -1.12 + b]);
      neck([[0.3, -0.36], [0.56, -0.5], [0.66, -0.7 - b], [0.74, -0.76 - b]], 0.11);
      head(0.72, -0.78 - b, 1, [0.78, -0.78 - b]);
      fill(g, circle(-0.1, -0.34, 0.05), '#d6ff3a', 0.35);
    },
  },

  boss_smith: {
    box: [1.75, 1.5, 0.85, 1.38],
    eyes: [[0.12, -0.96], [0.2, -0.96]], eyeR: 0.026,
    aura: { r: 1, color: '#ff8a2a' },
    lights: [{ x: 0, y: -0.6, r: 0.36, color: '#ff8a2a', kind: 'fire' }],
    draw(g, f, c) {
      const st = f === 0 ? 1 : -1;
      const up = f === 0;
      limb(g, [[-0.08, -0.36], [-0.1 - 0.05 * st, -0.18], [-0.12 - 0.06 * st, 0]], 0.1, '#2a2430');
      limb(g, [[0.08, -0.36], [0.09 + 0.05 * st, -0.18], [0.11 + 0.06 * st, 0]], 0.1, c.body);
      // örs omuzlu zırh: geniş göğüs, daralan bel
      const torso = blob([[-0.3, -0.86], [0.3, -0.86], [0.34, -0.64], [0.2, -0.36], [-0.2, -0.36], [-0.34, -0.64]]);
      paint(g, torso, c.body, [-0.34, -0.86, 0.68, 0.5], { light: 0.35, dark: 0.45, line: 0.04 });
      line(g, [[-0.22, -0.4], [0.22, -0.4]], 0.05, '#2a2018');
      for (const x of [-0.14, 0, 0.14]) fill(g, circle(x, -0.4, 0.02), GOLD);
      limb(g, [[-0.3, -0.78], [-0.44, -0.56], [-0.4, -0.36]], 0.09, shadeHex(c.body, -0.25));
      // göğüsteki ocak
      const furn = poly([[-0.09, -0.7], [0.09, -0.7], [0.07, -0.52], [-0.07, -0.52]]);
      fill(g, furn, '#140604');
      g.save();
      g.clip(furn);
      g.fillStyle = rad(g, 0, -0.56, 0.12, [[0, '#ffd27a'], [0.5, '#ff7a1a'], [1, '#5a1004']]);
      g.fillRect(-0.1, -0.72, 0.2, 0.22);
      g.restore();
      for (const x of [-0.035, 0.035]) line(g, [[x, -0.7], [x, -0.52]], 0.014, '#1a1414');
      for (const sx of [-1, 1]) {
        const pad = poly([[sx * 0.14, -0.92], [sx * 0.48, -0.9], [sx * 0.52, -0.8], [sx * 0.44, -0.72], [sx * 0.18, -0.74]]);
        paint(g, pad, '#3a3440', [-0.52, -0.92, 1.04, 0.2], { light: 0.35, line: 0.025 });
        for (const k of [0.26, 0.38]) fill(g, circle(sx * k, -0.82, 0.018), '#8a8a9a');
      }
      // miğfer
      const helm = blob([[-0.06, -0.86], [-0.08, -1.02], [0.08, -1.1], [0.24, -1.02], [0.24, -0.86]]);
      paint(g, helm, '#2a2430', [-0.08, -1.1, 0.32, 0.24], { line: 0.03 });
      fill(g, poly([[0.04, -1.0], [0.24, -1.0], [0.24, -0.92], [0.04, -0.92]]), '#050307');
      // dev çekiç
      const hx = up ? 0.5 : 0.56;
      const hy = up ? -1.18 : -0.62;
      limb(g, [[0.2, -0.78], [0.36, up ? -0.92 : -0.66], [hx - 0.04, hy + 0.12]], 0.07, c.body, 0.03);
      line(g, [[0.3, up ? -0.7 : -0.5], [hx, hy]], 0.05, INK);
      line(g, [[0.3, up ? -0.7 : -0.5], [hx, hy]], 0.03, '#4a3220');
      g.save();
      g.translate(hx, hy);
      g.rotate(up ? -0.3 : 0.5);
      paint(g, poly([[-0.16, -0.1], [0.16, -0.1], [0.16, 0.1], [-0.16, 0.1]]), '#4a4652', [-0.16, -0.1, 0.32, 0.2], { light: 0.35, dark: 0.4, line: 0.022 });
      glowLine(g, [[-0.12, 0.06], [0.12, 0.06]], 0.012, '#ff8a2a', 0.06);
      g.restore();
    },
  },

  boss_phoenix: {
    box: [2.3, 1.7, 1.15, 1.5],
    eyes: [[0.56, -0.86]], eyeR: 0.034, fly: 0.75,
    aura: { r: 1.15, color: '#ffb347' },
    lights: [{ x: 0.1, y: -0.62, r: 0.55, color: '#ffb347', kind: 'core' }],
    draw(g, f, c) {
      const up = f === 0;
      const flameWing = (sx, sy, isUp, span, a) => {
        sideWing(g, sx, sy, isUp, span, mixHex(c.body, '#ffd27a', a), '#fff0a0');
        const tipY = isUp ? sy - span * 0.95 : sy + span * 0.45;
        for (let i = 0; i < 3; i++) glowFill(g, circle(sx - span * (0.3 + i * 0.1), tipY + (isUp ? 0.12 : -0.1) * i, 0.03), '#ffd27a', 0.06, 0.9);
      };
      flameWing(0.02, -0.66, !up, 0.82, 0.0);
      // kuyruk tüyleri
      for (const [dy, l] of [[-0.06, 0.62], [0.02, 0.74], [0.1, 0.56]]) {
        curve(g, [[-0.2, -0.56 + dy], [-0.52, -0.52 + dy * 2], [-0.2 - l, -0.42 + dy * 3]], 0.06, INK);
        curve(g, [[-0.2, -0.56 + dy], [-0.52, -0.52 + dy * 2], [-0.2 - l, -0.42 + dy * 3]], 0.035, '#ff8a2a');
        glowFill(g, circle(-0.2 - l, -0.42 + dy * 3, 0.04), '#ffd27a', 0.08, 0.95);
      }
      const body = blob([[-0.24, -0.56], [-0.08, -0.72], [0.24, -0.72], [0.36, -0.6], [0.2, -0.46], [-0.12, -0.46]]);
      g.save();
      g.shadowColor = '#ffb347';
      g.shadowBlur = 0.14 * px;
      paint(g, body, c.body, [-0.24, -0.72, 0.6, 0.26], { light: 0.4, dark: 0.3, line: 0.03 });
      g.restore();
      curve(g, [[0.28, -0.66], [0.42, -0.82], [0.52, -0.86]], 0.12, INK);
      curve(g, [[0.28, -0.66], [0.42, -0.82], [0.52, -0.86]], 0.09, c.body);
      paint(g, circle(0.54, -0.86, 0.08), '#ffd27a', [0.46, -0.94, 0.16, 0.16], { line: 0.024 });
      paint(g, poly([[0.6, -0.88], [0.74, -0.84], [0.6, -0.8]]), '#c8780a', [0.6, -0.88, 0.14, 0.08], { line: 0.012 });
      for (const [x, l] of [[0.5, 0.18], [0.46, 0.14], [0.54, 0.12]]) {
        glowFill(g, poly([[x - 0.02, -0.92], [x + 0.02, -0.92], [x - 0.04, -0.92 - l]]), '#ffd27a', 0.06, 0.9);
      }
      socket(g, 0.56, -0.86, 0.03);
      flameWing(0.06, -0.64, up, 0.92, 0.2);
    },
  },

  boss_herald: {
    box: [1.8, 1.55, 0.9, 1.45],
    eyes: [[0.08, -1.0], [0.15, -1.0]], eyeR: 0.026, fly: 0.1,
    aura: { r: 1.05, color: '#e08aff' },
    lights: [{ x: 0.38, y: -1.18, r: 0.36, color: '#e08aff', kind: 'core' }],
    draw(g, f, c) {
      const w = f === 0 ? 0 : 0.05;
      // gölge kanatlar
      for (const [sx, a] of [[-1, 0.5], [1, 0.8]]) {
        const wing = P((p) => {
          p.moveTo(0, -0.84);
          p.quadraticCurveTo(sx * 0.4, -1.2 - w, sx * 0.76, -1.08 - w);
          for (let i = 1; i <= 4; i++) p.lineTo(sx * (0.76 - i * 0.12), -0.82 + i * 0.06 - (i % 2) * 0.08);
          p.closePath();
        });
        paint(g, wing, mixHex(c.body, '#000000', a), [-0.8, -1.24, 1.6, 0.6], { line: 0.026 });
      }
      // asa ve göz
      line(g, [[0.38, 0.0], [0.38, -1.08]], 0.05, INK);
      line(g, [[0.38, 0.0], [0.38, -1.08]], 0.03, '#2a1a3a');
      const r = robe(g, -0.86, 0, 0.32, c.body, w);
      g.save();
      g.clip(r);
      for (let i = 0; i < 10; i++) fill(g, circle(-0.25 + ((i * 0.17) % 0.5), -0.8 + ((i * 0.29) % 0.75), 0.012), '#f0d8ff', 0.8);
      g.restore();
      glowLine(g, [[-0.3, -0.12], [0.32, -0.08]], 0.016, '#e08aff', 0.08);
      // hale
      g.save();
      g.shadowColor = '#e08aff';
      g.shadowBlur = 0.12 * px;
      g.beginPath();
      g.ellipse(0.1, -1.16, 0.18, 0.06, -0.2, 0, TAU);
      g.lineWidth = 0.025;
      g.strokeStyle = '#e8b0ff';
      g.stroke();
      g.restore();
      const hood = blob([[-0.08, -0.86], [-0.08, -1.08], [0.08, -1.14], [0.24, -1.06], [0.24, -0.86]]);
      paint(g, hood, shadeHex(c.body, 0.12), [-0.08, -1.14, 0.32, 0.28], { line: 0.03 });
      fill(g, blob([[0.0, -1.06], [0.22, -1.06], [0.24, -0.88], [0.04, -0.88]]), '#05020a');
      limb(g, [[0.1, -0.74], [0.28, -0.7], [0.38, -0.76]], 0.04, c.body, 0.022);
      paint(g, circle(0.38, -1.14, 0.07), '#f0e6ff', [0.31, -1.21, 0.14, 0.14], { line: 0.016 });
      fill(g, circle(0.4, -1.14, 0.03), '#5a1a8a');
    },
  },

  boss_void: {
    box: [1.9, 1.6, 0.95, 1.5],
    eyes: [[0.14, -0.74]], eyeR: 0.06, fly: 0.15,
    aura: { r: 1.25, color: '#ff3a8a' },
    lights: [{ x: 0.0, y: -0.74, r: 0.6, color: '#c04aff', kind: 'core' }],
    draw(g, f, c) {
      const w = f === 0 ? 1 : -1;
      // dokunaçlar
      for (let i = 0; i < 7; i++) {
        const x = -0.42 + i * 0.14;
        const sway = (i % 2 ? w : -w) * 0.08;
        const pts = [[x * 0.6, -0.44], [x + sway, -0.26], [x * 1.2 - sway, -0.1], [x * 1.3 + sway, 0.02]];
        curve(g, pts, 0.07, INK);
        curve(g, pts, 0.05, c.body);
        glowFill(g, circle(pts[3][0], pts[3][1], 0.02), '#ff3a8a', 0.06, 0.8);
      }
      // boynuz tacı
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.42;
        const bx = Math.cos(a) * 0.3;
        const by = -0.74 + Math.sin(a) * 0.32;
        const tx = Math.cos(a) * 0.62;
        const ty = -0.74 + Math.sin(a) * 0.66;
        paint(g, poly([[bx - 0.05, by], [bx + 0.05, by], [tx, ty]]), '#2a1a3a', [Math.min(bx, tx) - 0.05, Math.min(by, ty), 0.3, 0.4], { line: 0.016 });
      }
      // karanlık kütle
      const mass = blob([[-0.46, -0.5], [-0.42, -0.9], [-0.1, -1.08], [0.3, -1.02], [0.48, -0.7], [0.4, -0.42], [0, -0.36]]);
      paint(g, mass, c.body, [-0.46, -1.08, 0.94, 0.72], { light: 0.25, dark: 0.45, line: 0.04 });
      g.save();
      g.clip(mass);
      for (let i = 0; i < 14; i++) fill(g, circle(-0.4 + ((i * 0.31) % 0.86), -1.0 + ((i * 0.43) % 0.6), 0.012), '#e6c8ff', 0.8);
      glowLine(g, [[-0.36, -0.56], [-0.2, -0.62], [-0.26, -0.8]], 0.016, '#c04aff', 0.08);
      glowLine(g, [[0.36, -0.6], [0.26, -0.84]], 0.016, '#c04aff', 0.08);
      g.restore();
      // merkez göz
      paint(g, ell(0.1, -0.74, 0.2, 0.13), '#2a0a1a', [-0.1, -0.87, 0.4, 0.26], { line: 0.02 });
      fill(g, ell(0.12, -0.74, 0.15, 0.1), '#ffd0e0', 0.9);
      fill(g, ell(0.14, -0.74, 0.045, 0.09), '#05020a');
    },
  },
});
