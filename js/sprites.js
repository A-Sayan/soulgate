/* ==========================================================================
 *  SOULGATE — sprites.js
 *  Sorumluluk : Tüm görsellerin bir kez çizilip önbelleğe alınması —
 *               kuleler, düşmanlar, harita zemini, ışık/duman/gölge dokuları,
 *               arayüz kule ikonları ve bölüm önizlemeleri. Çizimlerin kendisi
 *               art/ klasöründedir; burası önbellek ve ortak arayüzdür.
 *  Bağımlılık : config, utils (0) · art/kit, art/towers, art/enemies,
 *               art/maps (aynı katman, yalnızca çizim).
 *
 *  NEDEN ÖNCEDEN ÇİZİM?
 *   Mobilde her karede yüzlerce eğri ve gradyan çizmek FPS'i öldürür.
 *   Burada her şey bir kez, cihaz çözünürlüğünde çizilir; render.js her
 *   karede yalnızca drawImage yapar. Canlılık (göz kırpma, nabız, salınım,
 *   alev titremesi) meta verideki çapalarla render.js tarafından eklenir.
 *
 *  KOORDİNATLAR
 *   Birim = hücre. Her sprite'ın bir "çapası" vardır (kule/düşman: zemindeki
 *   orta nokta). Sprite yüzeyi { c (canvas), w, h, ox, oy }:
 *     ekranda sol üst = çapa − (ox, oy), boyut = (w, h) hücre.
 *   Düşmanlar SAĞA bakarak çizilir; render sola giderken yatay çevirir.
 *
 *  ÖLÇEK
 *   setScale(hücreBaşınaPiksel) — render.js yeniden boyutlanınca çağırır.
 *   Ölçek değişirse ölçeğe bağlı önbellek temizlenir (dokular kalır).
 * ========================================================================== */

import { TOWERS, ENEMIES } from './config.js';
import { TAU, clamp, rgba, mixHex } from './utils.js';
import { px, setPx, makeCanvas, surface } from './art/kit.js';
import { TOWER_ART } from './art/towers.js';
import { ENEMY_ART } from './art/enemies.js';
import { buildMapLayer, TOP_MARGIN } from './art/maps.js';

/* --------------------------------------------------------------------------
 * 1. ÖLÇEK VE ÖNBELLEK
 * ------------------------------------------------------------------------ */
const cache = new Map();     // ölçeğe bağlı sprite'lar
const texCache = new Map();  // ölçekten bağımsız dokular (ışık, duman, gölge)
const iconCache = new Map(); // arayüz ikonları ve bölüm önizlemeleri

/** @returns {boolean} ölçek gerçekten değiştiyse true */
export function setScale(pxPerCell) {
  const v = clamp(Math.round(pxPerCell), 8, 256);
  if (v === px) return false;
  setPx(v);
  cache.clear();
  return true;
}
export const getScale = () => px;

export function clearCache() {
  cache.clear();
  iconCache.clear();
}

function cached(key, build) {
  let s = cache.get(key);
  if (!s) {
    s = build();
    cache.set(key, s);
  }
  return s;
}

/* --------------------------------------------------------------------------
 * 2. DOKULAR (ölçekten bağımsız)
 * ------------------------------------------------------------------------ */
const TEX = 128;

function texture(key, draw) {
  let c = texCache.get(key);
  if (c) return c;
  if (texCache.size > 96) texCache.clear(); // renk sayısı sınırlı; güvenlik sigortası
  c = makeCanvas(TEX, TEX);
  draw(c.getContext('2d'), TEX / 2);
  texCache.set(key, c);
  return c;
}

/** Işık: beyaza yakın merkez → renk → saydam. 'add' karışımla çizilir. */
export function glowSprite(color) {
  return texture('g' + color, (g, r) => {
    g.fillStyle = rad(g, r, r, r, [
      [0, rgba(mixHex(color, '#ffffff', 0.65), 1)],
      [0.16, rgba(color, 0.85)],
      [0.42, rgba(color, 0.28)],
      [1, rgba(color, 0)],
    ]);
    g.fillRect(0, 0, TEX, TEX);
  });
}

/** Yumuşak leke: duman, sis, toz. */
export function smokeSprite(color) {
  return texture('s' + color, (g, r) => {
    g.fillStyle = rad(g, r, r, r, [[0, rgba(color, 1)], [0.45, rgba(color, 0.7)], [1, rgba(color, 0)]]);
    g.fillRect(0, 0, TEX, TEX);
  });
}

/** Zemin gölgesi (düşmanlar, uçanlar). */
export function shadowSprite() {
  return texture('shadow', (g, r) => {
    g.fillStyle = rad(g, r, r, r, [[0, 'rgba(0,0,0,0.6)'], [0.55, 'rgba(0,0,0,0.38)'], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(0, 0, TEX, TEX);
  });
}

/** Radyal gradyan (dokular için). */
function rad(g, x, y, r, stops, r0 = 0) {
  const gr = g.createRadialGradient(x, y, r0, x, y, r);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}

/* --------------------------------------------------------------------------
 * 3. KULELER VE DÜŞMANLAR
 * ------------------------------------------------------------------------ */
/**
 * Kule sprite'ı (seviye: 0..2, ustalık: -1/0/1).
 * Ustalık yalnızca son seviyede anlamlıdır.
 */
export function towerSprite(type, level, mastery = -1) {
  return cached(`t:${type}:${level}:${mastery}`, () => TOWER_ART[type](level, mastery, TOWERS[type].colors));
}

/**
 * Düşman sprite'ı.
 * @returns {{frames, eyes, eyeR, eyeColor, fly, aura, lights, shadowR, height}}
 *  eyes/lights: çapaya göre hücre birimi (sağa bakarken) · fly: uçuş yüksekliği
 */
export function enemySprite(type) {
  return cached('e:' + type, () => {
    const def = ENEMIES[type];
    const art = ENEMY_ART[type];
    const k = def.size * 2.2 * (art.scale ?? 1); // scale: yalnızca görüntü (oyundaki boyut değişmez)
    const [bw, bh, box, boy] = art.box;
    const frames = [0, 1].map((f) => {
      const s = surface(bw * k, bh * k, box * k, boy * k);
      s.g.scale(k, k);
      art.draw(s.g, f, def.colors);
      return s;
    });
    const scaleXY = ([x, y]) => [x * k, y * k];
    return {
      frames,
      eyes: art.eyes.map(scaleXY),
      eyeR: art.eyeR * k,
      eyeColor: def.colors.eye,
      fly: art.fly ?? 0,
      aura: art.aura ? { r: art.aura.r * k, color: art.aura.color } : null,
      lights: (art.lights ?? []).map((l) => ({ ...l, x: l.x * k, y: l.y * k, r: l.r * k })),
      shadowR: def.size * (def.flying ? 0.8 : 1.05),
      height: k,
    };
  });
}

/* --------------------------------------------------------------------------
 * 4. HARİTA KATMANI (art/maps.js çizer)
 * ------------------------------------------------------------------------ */
export function mapLayer(map) {
  return cached('map:' + map.id, () => buildMapLayer(map));
}

export { TOP_MARGIN };

/**
 * Bölüm seçimi için küçük harita resmi (geçit satırı dahil). Ölçek
 * önbelleğini kirletmez; bölüm ve genişlik başına bir kez çizilir.
 * @param {object} map  state.createMap ile kurulmuş çalışma anı haritası
 * @param {number} width  piksel
 */
export function mapThumb(map, width) {
  const key = `thumb:${map.id}:${width}`;
  let c = iconCache.get(key);
  if (c) return c;
  const saved = px;
  setPx(Math.max(4, Math.round(width / map.cols)));
  try {
    c = buildMapLayer(map).c;
  } finally {
    setPx(saved);
  }
  iconCache.set(key, c);
  return c;
}

/* --------------------------------------------------------------------------
 * 5. ARAYÜZ İKONLARI
 *  Kule seçim barı için küçük, kendi başına bir tuval. Gözler ve çekirdek
 *  ışığı ikonun içine işlenir. Ölçek önbelleğini kirletmez.
 * ------------------------------------------------------------------------ */
export function towerIcon(type, sizePx) {
  const key = type + ':' + sizePx;
  let icon = iconCache.get(key);
  if (icon) return icon;
  const saved = px;
  setPx(Math.max(8, Math.round(sizePx / 1.55)));
  const sp = TOWER_ART[type](0, -1, TOWERS[type].colors);
  icon = makeCanvas(sizePx, sizePx);
  const g = icon.getContext('2d');
  const ax = sizePx / 2;
  const ay = sizePx * 0.86;
  const drawSurf = (surf, x, y, rot = 0) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.drawImage(surf.c, -surf.ox * px, -surf.oy * px);
    g.restore();
  };
  drawSurf(sp.base, ax, ay);
  if (sp.head) drawSurf(sp.head, ax, ay + sp.headY * px, sp.aim ? -Math.PI / 5 : 0);
  g.globalCompositeOperation = 'lighter';
  for (const l of sp.lights) {
    const r = l.r * px;
    g.drawImage(glowSprite(l.color), ax + l.x * px - r, ay + l.y * px - r, r * 2, r * 2);
  }
  for (const [ex, ey] of sp.eyes) {
    const ox = sp.eyesOnHead ? 0 : 0;
    const oy = sp.eyesOnHead ? sp.headY : 0;
    const r = sp.eyeR * px * 2.4;
    g.drawImage(glowSprite(sp.eyeColor), ax + (ex + ox) * px - r, ay + (ey + oy) * px - r, r * 2, r * 2);
  }
  g.globalCompositeOperation = 'source-over';
  setPx(saved);
  iconCache.set(key, icon);
  return icon;
}
