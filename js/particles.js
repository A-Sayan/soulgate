/* ==========================================================================
 *  SOULGATE — particles.js
 *  Sorumluluk : Oyunun "his" katmanı — havuzlu partiküller, uçan hasar
 *               sayıları, ekran sarsıntısı, hit-pause (kısa donma), ekran
 *               parlamaları ve titreşim. Oyun olaylarını dinler; game.js
 *               efektlerden habersizdir.
 *  Bağımlılık : config, utils, events (0) · state (1).
 *  Çizim      : Burada çizim yoktur. render.js aşağıdaki dizileri okur.
 *
 *  render.js İÇİN SÖZLEŞME
 *   particles[] — her biri:
 *     shape  : 'glow' | 'spark' | 'ember' | 'smoke' | 'ring' | 'debris' |
 *              'shard' | 'bubble' | 'wisp' | 'stain' | 'coin' | 'flame' |
 *              'mist' | 'pillar' | 'bolt'
 *     blend  : 'add' (ışık gibi toplanır) | 'normal'
 *     layer  : 'ground' (birimlerin altında) | 'top' (her şeyin üstünde)
 *     x, y   : dünya konumu (hücre) · z: yerden yükseklik (gölge y'de kalır)
 *     size0 → size1 : başlangıç → bitiş boyutu (hücre; ring'de yarıçap)
 *     a0 → a1       : başlangıç → bitiş saydamlığı; fadeLate ise ömrün
 *                     son %30'unda söner
 *     color → color2: başlangıç → bitiş rengi (hex)
 *     rot           : dönüş (rad) · width: ring/pillar kalınlığı (hücre)
 *     len           : spark kuyruk çarpanı / pillar yüksekliği (hücre)
 *     pts           : bolt için Float32Array [x0,y0,x1,y1,...] (BOLT_POINTS çift)
 *     wobble, phase : wisp yalpalaması
 *     progress(p)   : 0 → 1 ömür ilerlemesi (bu modülden export)
 *     delay > 0 olan partikül henüz doğmamıştır — ÇİZİLMEZ.
 *   texts[]  — { x, y, offX, offY, str, color, scale, alpha, style }  (style: dmg|crit|dot|soul|loss|info)
 *              offX/offY ekran pikselidir; dünya konumunun üstüne eklenir.
 *   flash    — { color, alpha } tam ekran renk perdesi
 *   getShake(out) → { x, y, angle } kamera sarsıntısı (piksel, radyan)
 *
 *  ZAMAN
 *   update(oyunDt)  → partiküller (oyun hızıyla akar, duraklamada durur)
 *   updateReal(dt)  → yazılar, sarsıntı, parlama, hit-pause (gerçek zaman;
 *                     3x hızda bile sayılar okunabilir kalır)
 *   isHitStopped()  → main.js true iken oyun mantığını o kare işletmez
 *
 *  Not: Düşmanın vurulunca beyazlaması (enemy.flash) game.js'te tutulur.
 * ========================================================================== */

import { FEEL, QUALITY, TOWERS, ENEMIES, DAMAGE_TYPES, THEME, COMBAT, STRINGS } from './config.js';
import { TAU, rng, lerp, clamp, noise1, formatInt, nowSec } from './utils.js';
import { EV, on } from './events.js';
import { state } from './state.js';

/* --------------------------------------------------------------------------
 * 1. HAVUZ
 *  Partikül nesneleri bir kez yaratılır ve sonsuza dek yeniden kullanılır.
 *  Sınıra ulaşınca yeni partikül atlanır (oyun asla yavaşlamaz).
 * ------------------------------------------------------------------------ */
export const BOLT_POINTS = 9;
export const particles = [];
export const texts = [];
export const flash = { color: '#000000', alpha: 0, decay: 2 };

const freeParticles = [];
const freeTexts = [];
let cap = QUALITY.high.maxParticles;
let density = 1;      // kaliteye göre partikül sayısı çarpanı
let textCap = 48;
let decals = true;    // yer lekeleri (düşük kalitede kapalı)

function newParticle() {
  return {
    shape: 'glow', blend: 'add', layer: 'top',
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, bounce: 0, drag: 0,
    life: 0, max: 1, delay: 0,
    size0: 0, size1: 0, a0: 1, a1: 0, fadeLate: false,
    color: '#ffffff', color2: '#ffffff',
    rot: 0, vrot: 0, width: 0, len: 0,
    wobble: 0, phase: 0,
    pts: null,
  };
}

export const progress = (p) => 1 - p.life / p.max;

function applyQuality(q) {
  const Q = QUALITY[q] ?? QUALITY.high;
  cap = Q.maxParticles;
  density = clamp(Q.maxParticles / QUALITY.high.maxParticles, 0.3, 1);
  textCap = q === 'low' ? 24 : 48;
  decals = q !== 'low';
  while (particles.length > cap) freeParticles.push(particles.pop());
}

/* --------------------------------------------------------------------------
 * 2. PARTİKÜL TARİFLERİ (ön ayarlar)
 *  life/speed/size/vz: [min, max] · grow: bitiş boyutu = başlangıç × grow
 *  rise: dikey kayma hızı (eksi = yukarı) · spin: dönüş hızı aralığı
 * ------------------------------------------------------------------------ */
const PRE = {
  spark: { shape: 'spark', blend: 'add', life: [0.15, 0.35], speed: [2.5, 6], drag: 5, size: [0.03, 0.05], grow: 0.3, len: 0.05, a0: 1, a1: 0 },
  ember: { shape: 'ember', blend: 'add', life: [0.5, 1.1], speed: [0.3, 1.2], drag: 1.5, rise: -0.8, size: [0.035, 0.06], grow: 0.1, a0: 1, a1: 0 },
  smoke: { shape: 'smoke', blend: 'normal', life: [0.8, 1.6], speed: [0.2, 0.8], drag: 2, rise: -0.25, size: [0.22, 0.32], grow: 2.4, a0: 0.45, a1: 0, spin: 0.6, color: '#1b1518' },
  dust: { shape: 'smoke', blend: 'normal', life: [0.6, 1], speed: [0.6, 1.6], drag: 3, size: [0.12, 0.2], grow: 2.6, a0: 0.35, a1: 0, spin: 0.4, color: '#3a3128' },
  glow: { shape: 'glow', blend: 'add', life: [0.12, 0.18], speed: [0, 0], size: [0.8, 0.8], grow: 1.6, a0: 0.9, a1: 0 },
  debris: { shape: 'debris', blend: 'normal', life: [0.8, 1.3], speed: [0.8, 2.5], drag: 0.5, vz: [2, 4], g: 12, bounce: 0.35, size: [0.06, 0.1], grow: 1, a0: 1, a1: 1, fadeLate: true, spin: 10 },
  shard: { shape: 'shard', blend: 'add', life: [0.3, 0.6], speed: [2, 4], drag: 4, size: [0.06, 0.09], grow: 0.3, a0: 1, a1: 0, spin: 14, color: '#bff4ff' },
  bubble: { shape: 'bubble', blend: 'normal', life: [0.4, 0.9], speed: [0.2, 0.7], drag: 2, rise: -0.5, size: [0.035, 0.05], grow: 2, a0: 0.9, a1: 0.2 },
  wisp: { shape: 'wisp', blend: 'add', life: [1, 1.6], speed: [0.1, 0.3], drag: 1, rise: -1.1, size: [0.1, 0.14], grow: 0.25, a0: 0.9, a1: 0 },
  stain: { shape: 'stain', blend: 'normal', layer: 'ground', life: [4, 6], speed: [0, 0], size: [0.28, 0.42], grow: 1.15, a0: 0.55, a1: 0.55, fadeLate: true, spin: 0 },
  coin: { shape: 'coin', blend: 'normal', life: [0.8, 1], speed: [0.5, 1.5], drag: 0.8, vz: [2.5, 3.5], g: 10, bounce: 0.4, size: [0.06, 0.08], grow: 1, a0: 1, a1: 1, fadeLate: true, spin: 0, color: '#e8b84a' },
  flame: { shape: 'flame', blend: 'add', life: [0.3, 0.7], speed: [0.3, 1], drag: 2, rise: -1.2, size: [0.12, 0.2], grow: 0.15, a0: 1, a1: 0, color: '#ffb347', color2: '#7a1a0a' },
  mist: { shape: 'mist', blend: 'add', life: [0.5, 0.9], speed: [0.3, 0.8], drag: 2, size: [0.2, 0.28], grow: 2.2, a0: 0.35, a1: 0, spin: 0.5, color: '#a6ecff' },
  goo: { shape: 'debris', blend: 'normal', life: [0.6, 1], speed: [0.6, 2], drag: 1, vz: [1, 2.5], g: 10, bounce: 0, size: [0.05, 0.09], grow: 1.4, a0: 1, a1: 1, fadeLate: true, spin: 0 },
};

/** Tek partikül üretir (havuzdan). Sınır doluysa null. */
function spawn(pre, x, y, color, color2) {
  if (particles.length >= cap) return null;
  const p = freeParticles.length > 0 ? freeParticles.pop() : newParticle();
  p.shape = pre.shape;
  p.blend = pre.blend;
  p.layer = pre.layer ?? 'top';
  p.x = x;
  p.y = y;
  p.z = 0;
  p.vx = 0;
  p.vy = 0;
  p.vz = pre.vz ? rng.range(pre.vz[0], pre.vz[1]) : 0;
  p.g = pre.g ?? 0;
  p.bounce = pre.bounce ?? 0;
  p.drag = pre.drag ?? 0;
  p.max = p.life = rng.range(pre.life[0], pre.life[1]);
  p.delay = 0;
  const s = rng.range(pre.size[0], pre.size[1]);
  p.size0 = s;
  p.size1 = s * (pre.grow ?? 1);
  p.a0 = pre.a0 ?? 1;
  p.a1 = pre.a1 ?? 0;
  p.fadeLate = !!pre.fadeLate;
  p.color = color;
  p.color2 = color2;
  p.rot = rng.range(0, TAU);
  p.vrot = pre.spin ? rng.spread(0, pre.spin) : 0;
  p.width = 0;
  p.len = pre.len ?? 0;
  p.wobble = 0;
  p.phase = 0;
  particles.push(p);
  return p;
}

/**
 * Bir noktadan partikül saçar.
 * opt: { color, color2, dir, cone, speed, size, radius, delay, rise }
 *  dir+cone → belirli yöne koni (yoksa her yöne) · radius → doğum alanı
 */
function burst(pre, x, y, n, opt = NO_OPT) {
  const count = Math.max(1, Math.round(n * density));
  const color = opt.color ?? pre.color ?? '#ffffff';
  const color2 = opt.color2 ?? pre.color2 ?? color;
  const cone = opt.cone ?? TAU;
  const sm = opt.speed ?? 1;
  const zm = opt.size ?? 1;
  const rise = opt.rise ?? pre.rise ?? 0;
  for (let i = 0; i < count; i++) {
    const p = spawn(pre, x, y, color, color2);
    if (!p) return;
    const a = opt.dir === undefined ? rng.range(0, TAU) : opt.dir + rng.spread(0, cone / 2);
    const sp = rng.range(pre.speed[0], pre.speed[1]) * sm;
    p.vx = Math.cos(a) * sp;
    p.vy = Math.sin(a) * sp + rise;
    if (opt.radius) {
      const r = rng.range(0, opt.radius);
      const b = rng.range(0, TAU);
      p.x += Math.cos(b) * r;
      p.y += Math.sin(b) * r * 0.8;
    }
    p.size0 *= zm;
    p.size1 *= zm;
    if (opt.delay) p.delay = opt.delay * rng.range(0.6, 1);
  }
}
const NO_OPT = Object.freeze({});

/** Genişleyen halka (şok dalgası, aura nabzı, kalkan). */
function ring(x, y, r0, r1, life, color, width, blend = 'add', delay = 0, a0 = 0.85) {
  const p = spawn(RING_PRE, x, y, color, color);
  if (!p) return;
  p.blend = blend;
  p.max = p.life = life;
  p.size0 = r0;
  p.size1 = r1;
  p.width = width;
  p.a0 = a0;
  p.delay = delay;
}
const RING_PRE = { shape: 'ring', blend: 'add', life: [0.35, 0.35], speed: [0, 0], size: [0.1, 0.1], a0: 0.85, a1: 0 };

/** Işık patlaması (ışık açıkken çevreyi aydınlatır). */
function glow(x, y, size, color, life = 0.16, a0 = 0.9, delay = 0) {
  const p = spawn(PRE.glow, x, y, color, color);
  if (!p) return;
  p.size0 = size;
  p.size1 = size * 1.5;
  p.max = p.life = life;
  p.a0 = a0;
  p.delay = delay;
}

/** Zikzak şimşek parçası. */
function bolt(x1, y1, x2, y2, color, delay) {
  const p = spawn(BOLT_PRE, x1, y1, color, '#ffffff');
  if (!p) return;
  if (!p.pts) p.pts = new Float32Array(BOLT_POINTS * 2);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  for (let i = 0; i < BOLT_POINTS; i++) {
    const t = i / (BOLT_POINTS - 1);
    const j = i === 0 || i === BOLT_POINTS - 1 ? 0 : rng.spread(0, 0.14 + len * 0.04);
    p.pts[i * 2] = x1 + dx * t + nx * j;
    p.pts[i * 2 + 1] = y1 + dy * t + ny * j;
  }
  p.x = x2;
  p.y = y2;
  p.width = 0.06;
  p.delay = delay;
}
const BOLT_PRE = { shape: 'bolt', blend: 'add', life: [0.14, 0.18], speed: [0, 0], size: [1, 1], a0: 1, a1: 0 };

/** Işık sütunu (yükseltme). */
function pillar(x, y, color, height, life) {
  const p = spawn(PILLAR_PRE, x, y, color, color);
  if (!p) return;
  p.max = p.life = life;
  p.len = height;
  p.size0 = 0.42;
  p.size1 = 0.08;
  p.width = 0.42;
}
const PILLAR_PRE = { shape: 'pillar', blend: 'add', life: [0.6, 0.6], speed: [0, 0], size: [0.4, 0.4], a0: 0.85, a1: 0 };

/** Ruh: yükselirken yalpalayan ışık. */
function wisps(x, y, n, color) {
  const count = Math.max(1, Math.round(n * density));
  for (let i = 0; i < count; i++) {
    const p = spawn(PRE.wisp, x + rng.spread(0, 0.12), y + rng.spread(0, 0.08), color, color);
    if (!p) return;
    p.vx = rng.spread(0, 0.2);
    p.vy = PRE.wisp.rise * rng.range(0.7, 1.1);
    p.wobble = rng.range(0.4, 0.9);
    p.phase = rng.range(0, TAU);
  }
}

/** Yer lekesi (yanık, kan, kül). */
function stain(x, y, color, size = 1) {
  if (!decals) return;
  const p = spawn(PRE.stain, x, y, color, color);
  if (!p) return;
  p.size0 *= size;
  p.size1 *= size;
}

/* --------------------------------------------------------------------------
 * 3. HASAR SAYILARI
 *  Aynı düşmana çok kısa arayla gelen vuruşlar tek sayıda birleşir:
 *  Ok Yağmuru'nun üç oku "12 12 12" değil, büyüyen bir "36" olur.
 *  Süreli hasar (zehir/yanma) daha uzun pencereyle birleşir.
 * ------------------------------------------------------------------------ */
const DT = FEEL.damageText;
const DOT_MERGE = 0.6;

function newText() {
  return { x: 0, y: 0, offX: 0, offY: 0, oy0: 0, str: '', value: 0, color: '#fff', scale: 1, base: 1, alpha: 1, style: 'dmg', life: 0, max: 1, age: 0, key: null, dmgType: '' };
}

/** Yeni yazı alır; sınır doluysa en eskisini geri dönüştürür. */
function takeText() {
  if (texts.length >= textCap) {
    const oldest = texts.shift();
    freeTexts.push(oldest);
  }
  const t = freeTexts.length > 0 ? freeTexts.pop() : newText();
  texts.push(t);
  return t;
}

/**
 * Ekrana uçan yazı ekler.
 * style: 'dmg' | 'crit' | 'dot' | 'soul' | 'loss' | 'info'
 */
export function addText(x, y, str, color, style = 'info', scale = 1) {
  const t = takeText();
  t.x = x;
  t.y = y;
  // kalabalıkta sayılar üst üste binmesin: hem yatay hem dikey dağılır
  t.offX = rng.spread(0, DT.spread * 1.5);
  t.oy0 = style === 'loss' || style === 'info' ? 0 : rng.range(-9, 5);
  t.offY = t.oy0;
  t.str = str;
  t.value = 0;
  t.color = color;
  t.style = style;
  t.base = scale;
  t.scale = scale;
  t.alpha = 1;
  t.age = 0;
  t.max = t.life = style === 'info' || style === 'loss' ? DT.life * 1.6 : DT.life;
  t.key = null;
  t.dmgType = '';
  return t;
}

function damageText(enemy, amount, crit, dmgType, periodic) {
  if (!state.settings.damageNumbers || amount <= 0) return;
  const window = periodic ? DOT_MERGE : DT.mergeWindow;
  if (!crit) {
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      if (t.key === enemy && t.dmgType === dmgType && t.age < window && t.style !== 'crit') {
        t.value += amount;
        t.str = formatInt(t.value);
        t.scale = t.base * 1.18; // birleşince kısa bir "nabız"
        t.life = Math.max(t.life, t.max * 0.75);
        t.age = 0;
        return;
      }
    }
  }
  const color = crit ? '#ffd27a' : DAMAGE_TYPES[dmgType]?.color ?? '#ffffff';
  const style = crit ? 'crit' : periodic ? 'dot' : 'dmg';
  const scale = crit ? DT.critScale : periodic ? 0.85 : 1;
  const t = addText(enemy.x, enemy.y - 0.35, formatInt(amount), color, style, scale);
  t.value = amount;
  t.key = enemy;
  t.dmgType = dmgType;
}

/* --------------------------------------------------------------------------
 * 4. SARSINTI, HIT-PAUSE, PARLAMA, TİTREŞİM
 *  Sarsıntı "travma" modeli: olaylar travma ekler, sarsıntı = travma².
 *  Küçük vuruşlar fısıltı kadar, büyük olaylar gerçekten sert hissettirir.
 *  Sarsıntı rastgele titreme değil, yumuşak gürültüdür → sinematik.
 * ------------------------------------------------------------------------ */
const SH = FEEL.shake;
let trauma = 0;
let hitStop = 0;
let realTime = 0;
let lastCritStop = -1;

export function addTrauma(amount) {
  trauma = Math.min(1, trauma + amount);
}

export function addHitStop(seconds) {
  hitStop = Math.max(hitStop, seconds);
}

export const isHitStopped = () => hitStop > 0;

export function getShake(out = { x: 0, y: 0, angle: 0 }) {
  if (!state.settings.screenShake || trauma <= 0) {
    out.x = 0;
    out.y = 0;
    out.angle = 0;
    return out;
  }
  const s = trauma * trauma;
  const t = realTime * 22;
  out.x = SH.maxOffset * s * (noise1(t, 1) * 2 - 1);
  out.y = SH.maxOffset * s * (noise1(t, 2) * 2 - 1);
  out.angle = SH.maxAngle * s * (noise1(t, 3) * 2 - 1);
  return out;
}

/** Tam ekran renk perdesi; daha güçlü bir parlama zayıfını ezer. */
export function flashScreen(color, alpha, duration) {
  if (alpha < flash.alpha) return;
  flash.color = color;
  flash.alpha = alpha;
  flash.decay = alpha / Math.max(duration, 0.05);
}

let lastVibe = 0;
/** Titreşim (FEEL.vibration'daki ad). Ayar kapalıysa ya da cihaz desteklemiyorsa sessizce geçer. */
export function haptic(name) {
  if (!state.settings.vibration) return;
  const pattern = FEEL.vibration[name];
  const nav = globalThis.navigator;
  if (!pattern || !nav || typeof nav.vibrate !== 'function') return;
  if (nav.userActivation && !nav.userActivation.hasBeenActive) return; // dokunuştan önce tarayıcı reddeder
  const now = nowSec();
  if (name === 'tap' && now - lastVibe < 0.06) return;
  lastVibe = now;
  try {
    nav.vibrate(pattern);
  } catch {
    /* bazı tarayıcılar etkileşim öncesi reddeder */
  }
}

/* --------------------------------------------------------------------------
 * 5. GÜNCELLEME
 * ------------------------------------------------------------------------ */
/** Partikülleri oyun zamanıyla ilerletir; ölenleri havuza iade eder. */
export function update(dt) {
  ruinSmoke(dt);
  let w = 0;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.delay > 0) {
      p.delay -= dt;
      particles[w++] = p;
      continue;
    }
    p.life -= dt;
    if (p.life <= 0) {
      freeParticles.push(p);
      continue;
    }
    if (p.drag > 0) {
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.wobble) p.x += Math.cos(p.phase + p.life * 5) * p.wobble * dt;
    if (p.g) {
      p.vz -= p.g * dt;
      p.z += p.vz * dt;
      if (p.z < 0) {
        p.z = 0;
        p.vz = -p.vz * p.bounce;
        p.vx *= 0.55;
        p.vy *= 0.55;
      }
    }
    p.rot += p.vrot * dt;
    particles[w++] = p;
  }
  particles.length = w;
}

/** Yazılar, sarsıntı, parlama ve hit-pause — gerçek zamanla. */
export function updateReal(dt) {
  realTime += dt;
  hitStop = Math.max(0, hitStop - dt);
  trauma = Math.max(0, trauma - SH.decay * dt);
  flash.alpha = Math.max(0, flash.alpha - flash.decay * dt);

  let w = 0;
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    t.life -= dt;
    if (t.life <= 0) {
      t.key = null;
      freeTexts.push(t);
      continue;
    }
    t.age += dt;
    const k = 1 - t.life / t.max;
    t.offY = t.oy0 - DT.rise * (1 - (1 - Math.min(1, k * 1.4)) ** 3);
    t.scale = lerp(t.scale, t.base, 1 - Math.exp(-14 * dt));
    t.alpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    texts[w++] = t;
  }
  texts.length = w;
}

/** Tüm efektleri temizler (yeni oyun, menüye dönüş). */
export function clear() {
  while (particles.length) freeParticles.push(particles.pop());
  while (texts.length) {
    const t = texts.pop();
    t.key = null;
    freeTexts.push(t);
  }
  trauma = 0;
  hitStop = 0;
  flash.alpha = 0;
}

/* --------------------------------------------------------------------------
 * 6. ETKİ TARİFLERİ — olay başına görsel hikâye
 * ------------------------------------------------------------------------ */
function towerRange(tw) {
  const def = TOWERS[tw.type];
  const m = tw.mastery >= 0 ? def.masteries[tw.mastery] : null;
  return (m && m.range) || def.levels[tw.level].range;
}

function muzzle(tw, dist = 0.34) {
  MZ.x = tw.x + Math.cos(tw.angle) * dist;
  MZ.y = tw.y + Math.sin(tw.angle) * dist - 0.12;
  return MZ;
}
const MZ = { x: 0, y: 0 };

function onFire(tw) {
  const c = TOWERS[tw.type].colors;
  switch (tw.type) {
    case 'archer': {
      const m = muzzle(tw);
      glow(m.x, m.y, 0.3, c.glow, 0.08, 0.5);
      burst(PRE.spark, m.x, m.y, 2, { color: c.glow, dir: tw.angle, cone: 0.6, speed: 0.6 });
      break;
    }
    case 'mortar': {
      const m = muzzle(tw, 0.25);
      glow(m.x, m.y, 0.6, c.glow, 0.12);
      burst(PRE.smoke, m.x, m.y - 0.1, 4, { speed: 0.6, rise: -0.5, size: 0.8 });
      burst(PRE.ember, m.x, m.y, 4, { color: c.glow });
      addTrauma(0.04);
      break;
    }
    case 'frost': {
      const m = muzzle(tw, 0.2);
      glow(m.x, m.y, 0.35, c.glow, 0.1, 0.6);
      burst(PRE.mist, m.x, m.y, 2, { size: 0.6 });
      break;
    }
    case 'tesla':
      glow(tw.x, tw.y - 0.35, 0.45, c.glow, 0.1, 0.8);
      break;
    case 'poison':
      burst(PRE.bubble, tw.x, tw.y - 0.2, 3, { color: c.glow, radius: 0.12 });
      break;
    case 'curse': {
      const r = towerRange(tw);
      ring(tw.x, tw.y, 0.2, r, 0.9, c.glow, 0.05, 'add', 0, 0.35);
      burst(PRE.ember, tw.x, tw.y - 0.25, 3, { color: c.glow, speed: 0.4 });
      break;
    }
    case 'lance': {
      const m = muzzle(tw, 0.3);
      glow(m.x, m.y, 0.3, c.glow, 0.08, 0.5);
      burst(PRE.dust, m.x, m.y + 0.1, 2, { speed: 0.5, size: 0.6 });
      burst(PRE.spark, m.x, m.y, 3, { color: c.glow, dir: tw.angle, cone: 0.4, speed: 0.8 });
      break;
    }
    case 'prism':
      glow(tw.x, tw.y - 1.05, 0.4, c.glow, 0.12, 0.45);
      break;
    case 'flame': {
      const cone = towerCone(tw);
      const ring2 = cone >= Math.PI - 0.01;
      const black = tw.mastery === 0;
      const r = towerRange(tw);
      const n = ring2 ? 10 : 6;
      for (let i = 0; i < n; i++) {
        const dir = ring2 ? (i / n) * TAU + rng.spread(0, 0.3) : tw.angle + rng.spread(0, cone * 0.8);
        const p = spawn(PRE.flame, tw.x + Math.cos(dir) * 0.2, tw.y - 0.35 + Math.sin(dir) * 0.15, black ? '#c86aff' : '#ffb347', black ? '#2a0a3a' : '#7a1a0a');
        if (!p) break;
        const sp = r * rng.range(1.6, 2.4);
        p.vx = Math.cos(dir) * sp;
        p.vy = Math.sin(dir) * sp * 0.8;
        p.max = p.life = rng.range(0.25, 0.4);
        p.drag = 3;
      }
      break;
    }
    case 'hunter': {
      const m = muzzle(tw, 0.6);
      glow(m.x, m.y, 0.35, '#ffe8b0', 0.07, 0.7);
      burst(PRE.smoke, m.x, m.y, 2, { speed: 0.4, size: 0.5, rise: -0.3 });
      addTrauma(0.03);
      break;
    }
    case 'bell': {
      const r = towerRange(tw);
      ring(tw.x, tw.y - 0.4, 0.2, r, 0.7, c.glow, 0.07, 'add', 0, 0.6);
      ring(tw.x, tw.y, 0.2, r * 0.9, 0.9, '#ffffff', 0.04, 'add', 0.1, 0.3);
      break;
    }
    default:
      break;
  }
}

/** Ejder Ağzı'nın koni yarım açısı (Alev Çemberi: π). */
function towerCone(tw) {
  const def = TOWERS[tw.type];
  const m = tw.mastery >= 0 ? def.masteries[tw.mastery] : null;
  return (m && m.cone) || def.levels[tw.level].cone || 0.6;
}

/* Hit kıvılcım seçenekleri — en sık olay; nesne üretmemek için yeniden kullanılır */
const HIT_OPT = { color: '#fff', speed: 1, size: 1 };

function onHit(enemy, amount, crit, dmgType, periodic) {
  damageText(enemy, amount, crit, dmgType, periodic);
  if (periodic) return;
  const def = ENEMIES[enemy.type];
  const armored = dmgType === 'phys' && def && def.armor >= 0.3;
  HIT_OPT.color = armored ? '#ffb35c' : DAMAGE_TYPES[dmgType]?.color ?? '#ffffff';
  HIT_OPT.speed = crit ? 1.4 : 0.8;
  HIT_OPT.size = crit ? 1.3 : 1;
  burst(PRE.spark, enemy.x, enemy.y, crit ? 7 : armored ? 4 : 2, HIT_OPT);
  if (crit) {
    glow(enemy.x, enemy.y, 0.5, '#ffd27a', 0.1);
    addTrauma(FEEL.shake.trauma.hitHeavy * 0.5);
    // Kritik donması sık tekrarlanırsa oyun takılıyor gibi hisseder: 0.5 sn'de bir
    if (realTime - lastCritStop > 0.5) {
      lastCritStop = realTime;
      addHitStop(FEEL.hitStop.crit);
    }
  }
}

function onKill(enemy, souls) {
  const def = ENEMIES[enemy.type];
  const { x, y } = enemy;
  const size = def ? def.size : 0.3;
  const body = def ? def.colors.body : '#555555';
  const eye = def ? def.colors.eye : '#ffffff';
  if (def?.boss) return; // boss ölümü kendi büyük sahnesini oynar

  switch (enemy.type) {
    case 'knight':
    case 'skeleton':
      burst(PRE.debris, x, y, 9, { color: '#d9cfbf' });
      burst(PRE.dust, x, y, 4);
      break;
    case 'wraith':
      wisps(x, y, 5, '#a9c2ff');
      ring(x, y, 0.1, 0.7, 0.4, '#a9c2ff', 0.04);
      break;
    case 'bat':
      burst(PRE.goo, x, y, 5, { color: '#5a0f1c' });
      burst(PRE.spark, x, y, 3, { color: '#ff2b3c', speed: 0.6 });
      break;
    case 'brute':
      burst(PRE.debris, x, y, 14, { color: body, size: 1.6, speed: 1.2 });
      burst(PRE.dust, x, y, 8, { size: 1.5 });
      stain(x, y, '#120f0d', 1.4);
      addTrauma(0.12);
      break;
    case 'brood':
    case 'larva':
      burst(PRE.goo, x, y, enemy.type === 'brood' ? 12 : 4, { color: '#8fa82a', size: enemy.type === 'brood' ? 1.4 : 0.8 });
      stain(x, y, '#2a3510', enemy.type === 'brood' ? 1.3 : 0.6);
      break;
    case 'golem':
    case 'shardling':
    case 'frostwolf':
      burst(PRE.shard, x, y - 0.2, enemy.type === 'golem' ? 16 : 7, { speed: 1.2 });
      burst(PRE.mist, x, y - 0.1, 4, { size: 0.8 });
      if (enemy.type === 'golem') addTrauma(0.1);
      break;
    case 'raven':
      burst(PRE.debris, x, y - 0.4, 8, { color: '#2c2c3c', speed: 0.8 });
      burst(PRE.shard, x, y - 0.4, 3, { speed: 0.6 });
      break;
    case 'slime':
    case 'slimelet':
    case 'troll':
      burst(PRE.goo, x, y, enemy.type === 'slimelet' ? 4 : 10, { color: body, size: enemy.type === 'troll' ? 1.6 : 1 });
      stain(x, y, '#14200e', enemy.type === 'troll' ? 1.6 : 0.9);
      if (enemy.type === 'troll') addTrauma(0.12);
      break;
    case 'lurker':
      burst(PRE.dust, x, y, 6, { color: '#3a2a14', size: 1.2 });
      burst(PRE.goo, x, y, 5, { color: '#4a3a22' });
      break;
    case 'imp':
    case 'molten':
    case 'wyvern':
      burst(PRE.flame, x, y - 0.2, enemy.type === 'molten' ? 16 : 8, { radius: 0.2, speed: 1.2 });
      burst(PRE.ember, x, y - 0.2, 8, { color: '#ff7a2f', rise: -1.2 });
      if (enemy.type === 'molten') {
        burst(PRE.debris, x, y, 12, { color: '#2a1a14', size: 1.5, speed: 1.2 });
        stain(x, y, '#120604', 1.4);
        addTrauma(0.12);
      }
      break;
    case 'drummer':
      burst(PRE.debris, x, y, 10, { color: '#7a2a1a', size: 1.2 });
      burst(PRE.dust, x, y, 5, { size: 1.2 });
      break;
    case 'voidwalker':
    case 'revenant':
    case 'spider':
    case 'oracle':
      wisps(x, y - 0.2, 5, '#c08aff');
      ring(x, y, 0.1, 0.7, 0.4, '#a04aff', 0.04);
      burst(PRE.spark, x, y - 0.2, 6, { color: '#d08aff', speed: 0.8 });
      if (enemy.type === 'revenant') burst(PRE.debris, x, y, 8, { color: '#3a3a5a' });
      break;
    default:
      burst(PRE.goo, x, y, 6, { color: '#3a0d14' });
      burst(PRE.smoke, x, y, 3, { size: 0.7 });
      stain(x, y, '#1c0a0d', size * 2.2);
      break;
  }
  if (enemy.type !== 'wraith' && enemy.type !== 'voidwalker') wisps(x, y - 0.1, 1, eye);
  glow(x, y, size * 2.2, eye, 0.12, 0.45);

  if (souls > 0) {
    addText(x, y - 0.2, '+' + formatInt(souls), THEME.soul, 'soul', 0.9);
    wisps(x, y - 0.15, souls >= 10 ? 3 : 1, THEME.soul); // düşmandan kopan ruh yükselir
  }
}

function onLeak(enemy, lives) {
  const castle = state.map?.castle ?? enemy;
  const T = FEEL.shake.trauma;
  burst(PRE.smoke, castle.x, castle.y - 0.3, 8, { color: '#2a0a0f', size: 1.3 });
  burst(PRE.spark, castle.x, castle.y - 0.3, 10, { color: THEME.danger, speed: 1.2 });
  ring(castle.x, castle.y, 0.3, 1.6, 0.5, THEME.danger, 0.08);
  addText(castle.x, castle.y - 0.8, '−' + lives, THEME.danger, 'loss', 1.4);
  flashScreen(THEME.blood, 0.32, 0.55);
  addTrauma(ENEMIES[enemy.type]?.boss ? T.bossDeath : T.lifeLost);
  addHitStop(FEEL.hitStop.lifeLost);
  haptic('lifeLost');
}

function onImpact(x, y, radius, kind) {
  const T = FEEL.shake.trauma;
  switch (kind) {
    case 'shard':
      burst(PRE.shard, x, y, 8, { speed: 0.8 });
      burst(PRE.mist, x, y, 4, { radius: radius * 0.4 });
      ring(x, y, 0.1, radius, 0.3, '#a6ecff', 0.04);
      glow(x, y, radius * 0.9, '#a6ecff', 0.12, 0.5);
      break;
    case 'glob':
      burst(PRE.goo, x, y, 6, { color: '#5f9a3a' });
      burst(PRE.bubble, x, y, 6, { color: '#a4ff63', radius: radius * 0.5 });
      burst(PRE.mist, x, y, 3, { color: '#7dff5a', radius: radius * 0.4, size: 1.2 });
      stain(x, y, '#1a2a0c', radius * 1.6);
      break;
    case 'lance':
    case 'harpoon':
      burst(PRE.spark, x, y, kind === 'harpoon' ? 8 : 4, { color: '#ffe2b0', speed: 1.1 });
      if (kind === 'harpoon') {
        burst(PRE.debris, x, y, 4, { color: '#5a4030' });
        addTrauma(0.06);
      }
      break;
    case 'knell':
      ring(x, y, 0.2, radius, 0.6, '#ffe08a', 0.1, 'add');
      ring(x, y, 0.1, radius * 0.7, 0.8, '#ffffff', 0.05, 'add', 0.08, 0.5);
      burst(PRE.dust, x, y + 0.2, 6, { radius: radius * 0.5 });
      addTrauma(0.08);
      break;
    case 'quake':
      ring(x, y, 0.2, radius * 1.15, 0.45, '#ffb35c', 0.1, 'add');
      ring(x, y, 0.1, radius * 0.8, 0.6, '#3a3128', 0.14, 'normal', 0.05, 0.6);
      burst(PRE.debris, x, y, 14, { color: '#4a3e33', radius: radius * 0.5, speed: 1.3 });
      burst(PRE.dust, x, y, 10, { radius: radius * 0.6, size: 1.6 });
      glow(x, y, radius * 1.2, '#ff7a2f', 0.15, 0.6);
      stain(x, y, '#0e0b09', radius * 1.8);
      addTrauma(T.quake);
      break;
    default: { // 'shell' ve 'hellmaw'
      const hell = kind === 'hellmaw';
      glow(x, y, radius * 1.4, '#ffb347', 0.16, 1);
      ring(x, y, 0.1, radius * 1.1, 0.32, '#ffd27a', 0.07);
      burst(PRE.flame, x, y, hell ? 16 : 9, { radius: radius * 0.35, speed: 1.4 });
      burst(PRE.spark, x, y, hell ? 12 : 8, { color: '#ffb347', speed: 1.2 });
      burst(PRE.smoke, x, y, hell ? 8 : 6, { radius: radius * 0.4, size: 1.3 });
      burst(PRE.debris, x, y, 5, { color: '#2a2018' });
      if (hell) burst(PRE.flame, x, y, 8, { radius: radius * 0.6, delay: 0.25, speed: 0.4 });
      stain(x, y, '#0b0807', radius * 1.5);
      addTrauma(T.mortar);
      break;
    }
  }
}

function onBolt(x1, y1, x2, y2, hop) {
  const delay = hop * COMBAT.chainHopDelay;
  bolt(x1, y1, x2, y2, '#c9bbff', delay);
  glow(x2, y2, 0.45, '#c9bbff', 0.1, 0.8, delay);
  if (hop === 0) flashScreen('#c9bbff', 0.04, 0.08);
}

function onBuild(tw) {
  const c = TOWERS[tw.type].colors;
  burst(PRE.dust, tw.x, tw.y + 0.3, 8, { radius: 0.3 });
  ring(tw.x, tw.y + 0.2, 0.1, 0.7, 0.4, c.glow, 0.05);
  burst(PRE.ember, tw.x, tw.y, 8, { color: c.glow, radius: 0.3, delay: 0.15 });
  haptic('build');
}

function onUpgrade(tw) {
  const c = TOWERS[tw.type].colors;
  const big = tw.mastery >= 0;
  pillar(tw.x, tw.y + 0.3, c.glow, big ? 3.2 : 2.2, big ? 0.9 : 0.6);
  ring(tw.x, tw.y + 0.2, 0.15, big ? 1.2 : 0.8, 0.5, c.glow, 0.06);
  burst(PRE.ember, tw.x, tw.y, big ? 18 : 10, { color: c.glow, radius: 0.35, rise: -1.6 });
  burst(PRE.spark, tw.x, tw.y, big ? 10 : 5, { color: '#ffffff', speed: 0.7 });
  if (big) {
    glow(tw.x, tw.y, 1.6, c.glow, 0.3, 0.8);
    addTrauma(0.12);
  }
  haptic('upgrade');
}

function onSell(tw, refund) {
  burst(PRE.dust, tw.x, tw.y + 0.2, 10, { radius: 0.3, size: 1.2 });
  burst(PRE.debris, tw.x, tw.y, 6, { color: '#3d2d20' });
  wisps(tw.x, tw.y - 0.2, 3, THEME.soul);
  addText(tw.x, tw.y - 0.3, '+' + formatInt(refund), THEME.soul, 'soul', 1.1);
}

function onBoss(boss, kind, x, y, radius) {
  const T = FEEL.shake.trauma;
  if (kind === 'stomp') {
    ring(x, y, 0.3, radius, 0.6, '#bff4ff', 0.12);
    ring(x, y, 0.2, radius * 0.7, 0.8, '#ffffff', 0.06, 'add', 0.08, 0.5);
    burst(PRE.shard, x, y, 18, { radius: radius * 0.5, speed: 1.6 });
    burst(PRE.dust, x, y, 12, { radius: radius * 0.6, size: 1.6, color: '#c8dce8' });
    flashScreen('#bff4ff', 0.18, 0.4);
    addTrauma(T.scorch);
  } else if (kind === 'voidburst') {
    ring(x, y, 0.3, radius, 0.7, '#c04aff', 0.12);
    wisps(x, y, 12, '#d08aff');
    burst(PRE.spark, x, y, 16, { color: '#e08aff', radius: radius * 0.4, speed: 1.4 });
    glow(x, y, radius * 1.2, '#a04aff', 0.35, 0.7);
    addTrauma(T.scorch);
  } else if (kind === 'roar') {
    // öfkeli patronun kükremesi: kırmızı şok halkaları, toz, sarsıntı
    ring(x, y, 0.3, radius, 0.55, '#ff3b2e', 0.12);
    ring(x, y, 0.2, radius * 0.75, 0.75, '#ffb08a', 0.05, 'add', 0.1, 0.6);
    burst(PRE.dust, x, y, 12, { radius: radius * 0.5, size: 1.5, color: '#3a2420' });
    burst(PRE.ember, x, y - 0.5, 10, { color: '#ff5a3a', radius: 0.5, rise: -1.2 });
    glow(x, y, radius * 0.9, '#ff3b2e', 0.3, 0.6);
    addTrauma(T.scorch * 0.8);
    haptic('boss');
  } else if (kind === 'scorch') {
    burst(PRE.flame, x, y, 30, { radius, speed: 1.5, size: 1.5 });
    burst(PRE.smoke, x, y, 10, { radius: radius * 0.8, size: 1.6 });
    ring(x, y, 0.3, radius, 0.6, '#ff7a2f', 0.12);
    glow(x, y, radius * 1.3, '#ff7a2f', 0.35, 0.7);
    addTrauma(T.scorch);
  } else {
    ring(boss.x, boss.y, 0.2, 1.6, 0.7, '#3affd5', 0.08);
    burst(PRE.dust, boss.x, boss.y, 10, { radius: 0.8, size: 1.4 });
    wisps(boss.x, boss.y, 6, '#3affd5');
  }
}

function onBossSpawn() {
  flashScreen('#000000', 0.55, 1.2);
  addTrauma(FEEL.shake.trauma.bossSpawn);
  haptic('boss');
}

function onBossPhase(boss) {
  const eye = ENEMIES[boss.type]?.colors.eye ?? '#ff2a55';
  ring(boss.x, boss.y, 0.3, 2.2, 0.6, eye, 0.12);
  ring(boss.x, boss.y, 0.2, 1.4, 0.8, '#ffffff', 0.05, 'add', 0.1);
  burst(PRE.spark, boss.x, boss.y, 18, { color: eye, speed: 1.5 });
  glow(boss.x, boss.y, 2.2, eye, 0.3, 0.8);
  flashScreen(eye, 0.2, 0.4);
  addTrauma(FEEL.shake.trauma.bossPhase);
  addHitStop(FEEL.hitStop.bossPhase);
}

function onBossDie(boss) {
  const def = ENEMIES[boss.type];
  const { x, y } = boss;
  for (let i = 0; i < 4; i++) {
    const d = i * 0.18;
    const ox = rng.spread(0, 0.6);
    const oy = rng.spread(0, 0.5);
    glow(x + ox, y + oy, 1.8, '#ffb347', 0.2, 1, d);
    burst(PRE.flame, x + ox, y + oy, 12, { radius: 0.5, speed: 1.6, delay: d });
    burst(PRE.debris, x + ox, y + oy, 8, { color: def?.colors.body ?? '#555', speed: 1.5, delay: d });
  }
  ring(x, y, 0.3, 3.2, 0.9, '#ffffff', 0.12);
  burst(PRE.smoke, x, y, 16, { radius: 0.8, size: 2 });
  wisps(x, y, 12, def?.colors.eye ?? '#ffffff');
  stain(x, y, '#060505', 3);
  flashScreen('#ffffff', 0.55, 0.7);
  addTrauma(FEEL.shake.trauma.bossDeath);
  addHitStop(FEEL.hitStop.bossDeath);
  haptic('boss');
}

/* — Yetenekler — */
function onSkill(id, phase, x, y, value) {
  const T = FEEL.shake.trauma;
  switch (`${id}:${phase}`) {
    case 'log:cast':
      burst(PRE.dust, x, y, 10, { radius: 0.4, size: 1.4 });
      burst(PRE.debris, x, y, 6, { color: '#6b4a2a' });
      addTrauma(0.12);
      haptic('build');
      break;
    case 'log:hit':
      burst(PRE.debris, x, y, 6, { color: '#7a5a3a', speed: 1.4 });
      burst(PRE.dust, x, y, 3, { size: 1.1 });
      addTrauma(0.05);
      break;
    case 'meteor:impact':
      glow(x, y, value * 1.6, '#ffb347', 0.25, 1);
      burst(PRE.flame, x, y, 34, { radius: value * 0.6, speed: 1.8, size: 1.5 });
      burst(PRE.ember, x, y, 22, { color: '#ff7a2f', radius: value * 0.5, rise: -1.4 });
      burst(PRE.debris, x, y, 14, { color: '#3a2a22', speed: 2 });
      burst(PRE.smoke, x, y, 12, { radius: value * 0.6, size: 1.8 });
      ring(x, y, 0.3, value * 1.3, 0.55, '#ff9a3a', 0.1);
      stain(x, y, '#140a06', value * 1.6);
      flashScreen('#ff7a2f', 0.22, 0.45);
      addTrauma(T.quake);
      addHitStop(FEEL.hitStop.crit * 2);
      haptic('boss');
      break;
    case 'frost:cast': {
      const castle = state.map?.castle;
      if (castle) ring(castle.x, castle.y - 0.6, 0.4, 9, 1.1, '#bff4ff', 0.12);
      flashScreen('#bff4ff', 0.3, 0.9);
      addTrauma(0.15);
      haptic('upgrade');
      break;
    }
    case 'frost:hit':
      burst(PRE.shard, x, y, 4, { speed: 0.6 });
      burst(PRE.mist, x, y, 2, { size: 0.8 });
      break;
    case 'thunder:cast':
      flashScreen('#e6dcff', 0.3, 0.35);
      addTrauma(0.2);
      haptic('boss');
      break;
    case 'thunder:hit': {
      const d = value * 0.06;
      bolt(x + rng.spread(0, 0.4), y - 5, x, y, '#e6dcff', d);
      bolt(x + rng.spread(0, 0.4), y - 5, x, y, '#c9bbff', d + 0.03);
      glow(x, y, 0.9, '#e6dcff', 0.18, 1, d);
      burst(PRE.spark, x, y, 8, { color: '#e6dcff', speed: 1.4, delay: d });
      break;
    }
    case 'timestop:cast': {
      const castle = state.map?.castle;
      if (castle) ring(castle.x, castle.y - 0.6, 0.4, 10, 1.2, '#e8d7a8', 0.14);
      flashScreen('#e8d7a8', 0.35, 1.1);
      addTrauma(0.1);
      haptic('upgrade');
      break;
    }
    case 'plague:cast':
      ring(x, y, 0.2, value, 0.5, '#9fd84a', 0.08);
      burst(PRE.mist, x, y, 10, { color: '#9fd84a', radius: value * 0.6, size: 1.6 });
      burst(PRE.bubble, x, y, 8, { color: '#c6ff4a', radius: value * 0.6 });
      haptic('build');
      break;
    case 'plague:tick':
      burst(PRE.bubble, x, y, 3, { color: '#c6ff4a', radius: value * 0.7 });
      break;
    case 'mend:cast': {
      pillar(x, y - 0.4, '#ffe08a', 4, 1.1);
      ring(x, y - 0.4, 0.3, 2.2, 0.9, '#ffe08a', 0.1);
      burst(PRE.ember, x, y - 0.6, 18, { color: '#ffe08a', radius: 0.9, rise: -1.4 });
      if (value > 0) addText(x, y - 1.6, '+' + value, '#9dff8a', 'loss', 1.2);
      flashScreen('#ffe08a', 0.15, 0.6);
      haptic('upgrade');
      break;
    }
    case 'vortex:cast':
      ring(x, y, value * 1.2, 0.2, 0.4, '#9a6aff', 0.08);
      break;
    case 'vortex:impact':
      ring(x, y, 0.2, value * 1.3, 0.5, '#b07aff', 0.12);
      burst(PRE.spark, x, y, 16, { color: '#c09aff', radius: value * 0.5, speed: 1.6 });
      burst(PRE.dust, x, y, 10, { radius: value * 0.6, size: 1.4, color: '#2a1a3a' });
      addTrauma(0.22);
      haptic('boss');
      break;
    case 'reaper:cast':
      flashScreen('#d6d2e8', 0.25, 0.5);
      addTrauma(0.15);
      haptic('boss');
      break;
    case 'reaper:hit':
      if (value > 0) {
        wisps(x, y - 0.2, 3, '#d6d2e8');
        burst(PRE.spark, x, y - 0.3, 6, { color: '#ffffff', speed: 1.2 });
        addText(x, y - 0.6, STRINGS.fx.reaped, '#e6e2f4', 'info', 0.8);
      } else {
        burst(PRE.spark, x, y - 0.3, 3, { color: '#d6d2e8', dir: 0, cone: 0.6, speed: 1.2 });
      }
      break;
    default:
      break;
  }
}

/* — Düşman yetenekleri — */
function onAbility(e, kind, x, y, value) {
  switch (kind) {
    case 'ward':
      ring(e.x, e.y, 0.1, value, 0.6, '#bff4ff', 0.06);
      burst(PRE.mist, e.x, e.y - 0.3, 5, { radius: value * 0.5, size: 0.8 });
      break;
    case 'cleanse':
      ring(e.x, e.y - 0.5, 0.1, value, 0.6, '#ffe06a', 0.06);
      burst(PRE.ember, e.x, e.y - 0.5, 8, { color: '#ffe06a', radius: value * 0.5, rise: -1 });
      break;
    case 'blink':
      wisps(x, y - 0.2, 5, '#c08aff');
      ring(x, y, 0.5, 0.05, 0.3, '#a04aff', 0.06);
      ring(e.x, e.y, 0.05, 0.6, 0.35, '#d08aff', 0.06);
      burst(PRE.spark, e.x, e.y - 0.3, 6, { color: '#e08aff', speed: 0.9 });
      break;
    case 'web': {
      const t = value;
      if (!t) break;
      bolt(e.x, e.y - 0.3, t.x, t.y - 0.5, '#e6e0f0', 0);
      burst(PRE.debris, t.x, t.y - 0.4, 5, { color: '#d8d0e8', speed: 0.5 });
      break;
    }
    case 'deathblast':
      burst(PRE.smoke, e.x, e.y - 0.2, 12, { color: '#4a5a1a', radius: value * 0.5, size: 1.8 });
      burst(PRE.mist, e.x, e.y - 0.2, 10, { color: '#a8c84a', radius: value * 0.6, size: 1.6 });
      ring(e.x, e.y, 0.2, value, 0.6, '#a8c84a', 0.08);
      stain(e.x, e.y, '#1a2a0a', value * 1.2);
      addTrauma(0.12);
      break;
    case 'harden':
      ring(e.x, e.y - 0.5, 0.2, 1.1, 0.5, '#c8c8d8', 0.08);
      burst(PRE.spark, e.x, e.y - 0.5, 12, { color: '#e8e8f0', speed: 1.2 });
      break;
    case 'hex':
      wisps(e.x, e.y - 0.6, 6, '#b6ff3a');
      ring(e.x, e.y - 0.5, 0.2, 1.4, 0.6, '#b6ff3a', 0.06);
      break;
    case 'blizzard': {
      flashScreen('#d8f0ff', 0.28, 0.9);
      const map = state.map;
      if (map) for (let i = 0; i < 40; i++) ambient('snow', rng.range(0, map.cols), rng.range(-1, map.rows * 0.6));
      addTrauma(0.15);
      break;
    }
    case 'rebirth':
      flashScreen('#ffd27a', 0.5, 1);
      ring(e.x, e.y, 0.3, value * 1.2, 0.8, '#ffb347', 0.14);
      burst(PRE.flame, e.x, e.y - 0.5, 36, { radius: value * 0.4, speed: 2, size: 1.6 });
      burst(PRE.ember, e.x, e.y - 0.5, 24, { color: '#ffd27a', radius: value * 0.4, rise: -1.6 });
      addText(e.x, e.y - 1.4, STRINGS.fx.rebirth, '#ffd27a', 'info', 1.2);
      addTrauma(FEEL.shake.trauma.bossPhase);
      addHitStop(FEEL.hitStop.bossPhase);
      haptic('boss');
      break;
    default:
      break;
  }
}

/* — Harita olayları (1.5.0) — */
function onMapEvent(id, phase, x, y, value) {
  const T = FEEL.shake.trauma;
  switch (`${id}:${phase}`) {
    case 'rise:warn':
      burst(PRE.dust, x, y + 0.2, 8, { radius: 0.4, size: 1.2, color: '#3a3128' });
      wisps(x, y - 0.2, 4, '#9dff8a');
      ring(x, y, 0.1, 0.8, 0.8, '#7aff8a', 0.05, 'add', 0, 0.5);
      addTrauma(0.06);
      break;
    case 'rise:act':
      burst(PRE.dust, x, y, 14, { radius: 0.6, size: 1.5 });
      burst(PRE.debris, x, y, 10, { color: '#4a3e30', speed: 1.4 });
      wisps(x, y - 0.2, 6, '#9dff8a');
      ring(x, y, 0.2, 1.2, 0.5, '#9dff8a', 0.06);
      addTrauma(0.12);
      haptic('build');
      break;
    case 'blizzard:warn': {
      const map = state.map;
      if (map) for (let i = 0; i < 16; i++) ambient('snow', rng.range(0, map.cols), rng.range(-1, map.rows * 0.4));
      break;
    }
    case 'blizzard:act': {
      flashScreen('#d8f0ff', 0.25, 0.9);
      const map = state.map;
      if (map) for (let i = 0; i < 50; i++) ambient('snow', rng.range(0, map.cols), rng.range(-1, map.rows * 0.7));
      addTrauma(0.12);
      break;
    }
    case 'gas:warn':
      burst(PRE.bubble, x, y, 8, { color: '#c6ff4a', radius: 0.6 });
      break;
    case 'gas:act':
      burst(PRE.smoke, x, y, 12, { color: '#4a5a1a', radius: value * 0.6, size: 1.8 });
      burst(PRE.mist, x, y, 14, { color: '#b6e04a', radius: value * 0.7, size: 1.8 });
      burst(PRE.bubble, x, y, 10, { color: '#c6ff4a', radius: value * 0.7 });
      ring(x, y, 0.2, value * 1.1, 0.6, '#a8c84a', 0.1);
      stain(x, y, '#1a2a0a', value * 1.4);
      addTrauma(0.14);
      break;
    case 'gas:end':
      burst(PRE.mist, x, y, 6, { color: '#8aa83a', radius: value * 0.6, size: 1.4 });
      break;
    case 'lava:act':
      glow(x, y, value * 1.6, '#ffb347', 0.25, 1);
      burst(PRE.flame, x, y, 26, { radius: value * 0.6, speed: 1.6, size: 1.4 });
      burst(PRE.ember, x, y, 18, { color: '#ff7a2f', radius: value * 0.5, rise: -1.4 });
      burst(PRE.debris, x, y, 10, { color: '#2a1410', speed: 1.8 });
      burst(PRE.smoke, x, y, 8, { radius: value * 0.5, size: 1.6 });
      ring(x, y, 0.3, value * 1.3, 0.5, '#ff9a3a', 0.1);
      stain(x, y, '#1a0804', value * 1.5);
      flashScreen('#ff7a2f', 0.12, 0.35);
      addTrauma(T.quake * 0.8);
      haptic('boss');
      break;
    case 'rift:warn':
      wisps(x, y, 6, '#c08aff');
      ring(x, y, 1.1, 0.1, 0.9, '#a04aff', 0.05);
      break;
    case 'rift:act':
      ring(x, y, 0.1, 1.2, 0.6, '#d08aff', 0.1);
      glow(x, y, 1.6, '#a04aff', 0.4, 0.8);
      burst(PRE.spark, x, y, 14, { color: '#e08aff', radius: 0.4, speed: 1.3 });
      addTrauma(0.15);
      break;
    case 'rift:hit': {
      wisps(x, y - 0.2, 3, '#c08aff');
      const e = value;
      if (e && e.alive) {
        ring(e.x, e.y, 0.05, 0.7, 0.4, '#bff4ff', 0.05);
        burst(PRE.spark, e.x, e.y - 0.3, 6, { color: '#e08aff', speed: 0.9 });
      }
      break;
    }
    case 'rift:end':
      ring(x, y, 1, 0.05, 0.4, '#a04aff', 0.06);
      burst(PRE.spark, x, y, 8, { color: '#c08aff', speed: 0.8 });
      break;
    default:
      break;
  }
}

/** Kuyu ruh üretti, faiz verdi ya da kaleye can verdi. */
function onGenerate(tw, amount, kind) {
  if (kind === 'mend') {
    addText(tw.x, tw.y - 0.7, '+' + amount, '#9dff8a', 'soul', 1);
    const castle = state.map?.castle;
    if (castle) burst(PRE.ember, castle.x, castle.y - 0.6, 10, { color: '#9dff8a', radius: 0.6, rise: -1 });
    return;
  }
  wisps(tw.x, tw.y - 0.4, kind === 'interest' ? 4 : 2, THEME.soul);
  addText(tw.x, tw.y - 0.6, '+' + formatInt(amount), THEME.soul, 'soul', kind === 'interest' ? 1.15 : 0.9);
  if (kind === 'interest') ring(tw.x, tw.y, 0.2, 0.9, 0.6, '#ffd27a', 0.05);
}

/* Yıkık kale: kuleden ince duman ve kıvılcım tüter (oyun zamanıyla). */
let ruinT = 0;
function ruinSmoke(dt) {
  const run = state.run;
  const castle = state.map?.castle;
  if (!run || !run.ruined || !castle || run.over) return;
  ruinT -= dt;
  if (ruinT > 0) return;
  ruinT = 0.28;
  const x = castle.x + rng.spread(0, 0.55);
  burst(PRE.smoke, x, castle.y - 1.05, 1, { color: '#141012', size: 1.2, rise: -0.6 });
  if (rng.chance(0.25)) burst(PRE.ember, x, castle.y - 0.95, 1, { color: '#ff7a2f' });
}

function onRunEnd(victory) {
  if (victory) {
    flashScreen(THEME.gold, 0.35, 1.5);
    haptic('victory');
  } else {
    flashScreen(THEME.blood, 0.5, 2);
    haptic('defeat');
  }
}

/* --------------------------------------------------------------------------
 * 7. KURULUM
 * ------------------------------------------------------------------------ */
let initialized = false;

/** Olaylara abone olur. main.js açılışta bir kez çağırır. */
export function init() {
  if (initialized) return;
  initialized = true;
  applyQuality(state.settings.quality);

  on(EV.SETTINGS, (key, value) => {
    if (key === 'quality') applyQuality(value);
  });
  on(EV.RUN_START, clear);
  on(EV.SCENE, (name) => {
    if (name !== 'game') clear();
  });
  on(EV.RUN_END, onRunEnd);

  on(EV.FIRE, onFire);
  on(EV.HIT, onHit);
  on(EV.KILL, onKill);
  on(EV.LEAK, onLeak);
  on(EV.IMPACT, onImpact);
  on(EV.BOLT, onBolt);
  on(EV.BUILD, onBuild);
  on(EV.UPGRADE, onUpgrade);
  on(EV.SELL, onSell);
  on(EV.SKILL, onSkill);

  on(EV.SPAWN, (en) => {
    if (ENEMIES[en.type]?.minion) burst(PRE.dust, en.x, en.y, 3, { size: 0.7 }); // mezardan/yumurtadan çıkış
    else if (en.elite) {
      ring(en.x, en.y, 0.1, 0.7, 0.5, '#ffd27a', 0.05);
      burst(PRE.ember, en.x, en.y - 0.3, 6, { color: '#ffd27a', radius: 0.3, rise: -1 });
    }
  });
  on(EV.MAP_EVENT, onMapEvent);
  on(EV.PHASE, (en, entered) => {
    ring(en.x, en.y, 0.1, 0.55, 0.3, '#a9c2ff', 0.04, 'add', 0, entered ? 0.7 : 0.45);
    burst(PRE.mist, en.x, en.y, 3, { color: '#a9c2ff', size: 0.7 });
  });
  on(EV.HEAL, (healer, radius) => {
    ring(healer.x, healer.y, 0.15, radius, 0.6, '#ff4f6a', 0.06);
    burst(PRE.ember, healer.x, healer.y, 8, { color: '#ff8a8a', radius: radius * 0.6, rise: -1 });
  });
  on(EV.STATUS, (en, kind) => {
    switch (kind) {
      case 'freeze':
        burst(PRE.shard, en.x, en.y, 6, { speed: 0.5 });
        glow(en.x, en.y, 0.6, '#d8f8ff', 0.12, 0.7);
        break;
      case 'stun':
        burst(PRE.spark, en.x, en.y - 0.3, 5, { color: '#ffe066', speed: 0.5 });
        break;
      case 'evade':
        addText(en.x, en.y - 0.6, STRINGS.fx.miss, '#c8d8e8', 'dot', 0.9);
        break;
      case 'execute':
        addText(en.x, en.y - 0.7, STRINGS.fx.execute, '#ff5a5a', 'crit', 1);
        burst(PRE.spark, en.x, en.y - 0.3, 10, { color: '#ff5a5a', speed: 1.3 });
        break;
      case 'enrage':
        ring(en.x, en.y, 0.2, 1.1, 0.5, '#ff3b2e', 0.08);
        burst(PRE.ember, en.x, en.y - 0.4, 10, { color: '#ff3b2e', rise: -1.2 });
        addText(en.x, en.y - 1, STRINGS.fx.enrage, '#ff6a4a', 'info', 0.9);
        break;
      case 'stop':
        glow(en.x, en.y - 0.3, 0.5, '#e8d7a8', 0.2, 0.5);
        break;
      default:
        break;
    }
  });
  on(EV.SILENCE, (tw) => {
    switch (tw.silenceKind) {
      case 'frost':
        burst(PRE.shard, tw.x, tw.y - 0.3, 6, { speed: 0.6 });
        burst(PRE.mist, tw.x, tw.y - 0.3, 3, { size: 0.9 });
        break;
      case 'web':
        burst(PRE.debris, tw.x, tw.y - 0.4, 4, { color: '#d8d0e8', speed: 0.4 });
        break;
      case 'hex':
        wisps(tw.x, tw.y - 0.3, 3, '#b6ff3a');
        break;
      case 'gas':
        burst(PRE.smoke, tw.x, tw.y - 0.2, 5, { color: '#4a5a1a', rise: -0.4 });
        break;
      case 'void':
        wisps(tw.x, tw.y - 0.3, 3, '#c08aff');
        break;
      case 'roar':
        burst(PRE.dust, tw.x, tw.y - 0.1, 4, { size: 1.1, color: '#3a2420' });
        burst(PRE.spark, tw.x, tw.y - 0.4, 4, { color: '#ff6a4a', speed: 0.6 });
        break;
      default:
        burst(PRE.smoke, tw.x, tw.y - 0.2, 5, { color: '#2b2b2b', rise: -0.6 });
        burst(PRE.ember, tw.x, tw.y, 4, { color: '#ff7a2f' });
        break;
    }
    addText(tw.x, tw.y - 0.5, STRINGS.panel.disabled, '#ff9a6a', 'info', 0.8);
  });
  on(EV.ABILITY, onAbility);
  on(EV.GENERATE, onGenerate);

  on(EV.BOSS_SPAWN, onBossSpawn);
  on(EV.BOSS_PHASE, onBossPhase);
  on(EV.BOSS_ABILITY, onBoss);
  on(EV.BOSS_DIE, onBossDie);
}

/* --------------------------------------------------------------------------
 * 8. DIŞ KULLANIM — menü arka planı ve arayüz için hazır efektler
 * ------------------------------------------------------------------------ */
/**
 * Bölümün havası: kar tanesi, ateş böceği, kor ya da boşluk zerresi.
 * kind: 'snow' | 'firefly' | 'ember' | 'void' | 'ash'
 */
export function ambient(kind, x, y) {
  switch (kind) {
    case 'snow': {
      const p = spawn(AMB.snow, x, y, '#eef8ff', '#eef8ff');
      if (!p) return;
      p.vx = rng.range(-0.15, 0.25);
      p.vy = rng.range(0.4, 0.8);
      p.wobble = rng.range(0.2, 0.5);
      p.phase = rng.range(0, TAU);
      break;
    }
    case 'firefly': {
      const p = spawn(AMB.firefly, x, y, rng.chance(0.7) ? '#b6ff5a' : '#ffe06a', '#b6ff5a');
      if (!p) return;
      p.vx = rng.spread(0, 0.15);
      p.vy = rng.spread(0, 0.12);
      p.wobble = rng.range(0.3, 0.7);
      p.phase = rng.range(0, TAU);
      break;
    }
    case 'void': {
      const p = spawn(AMB.mote, x, y, rng.chance(0.3) ? '#e6c8ff' : '#a04aff', '#a04aff');
      if (!p) return;
      p.vx = rng.spread(0, 0.12);
      p.vy = -rng.range(0.05, 0.25);
      p.wobble = rng.range(0.2, 0.4);
      p.phase = rng.range(0, TAU);
      break;
    }
    default:
      ambientEmber(x, y, kind === 'ember' ? (rng.chance(0.3) ? '#ffd27a' : '#ff6a1a') : rng.chance(0.2) ? '#ff3b4e' : THEME.ember);
      break;
  }
}
const AMB = {
  snow: { shape: 'glow', blend: 'add', life: [4, 6], speed: [0, 0], size: [0.03, 0.06], grow: 1, a0: 0.8, a1: 0.8, fadeLate: true },
  firefly: { shape: 'ember', blend: 'add', life: [2.5, 4.5], speed: [0, 0], size: [0.03, 0.05], grow: 1, a0: 0.9, a1: 0, fadeLate: false },
  mote: { shape: 'ember', blend: 'add', life: [3, 5], speed: [0, 0], size: [0.025, 0.045], grow: 0.5, a0: 0.8, a1: 0, fadeLate: false },
};

/** Süzülen kor (menü sahnesi). */
export function ambientEmber(x, y, color = THEME.ember) {
  const p = spawn(PRE.ember, x, y, color, color);
  if (!p) return;
  p.vx = rng.spread(0, 0.25);
  p.vy = -rng.range(0.3, 0.8);
  p.max = p.life = rng.range(2.5, 4.5);
  p.wobble = rng.range(0.2, 0.5);
  p.phase = rng.range(0, TAU);
  p.drag = 0;
}
