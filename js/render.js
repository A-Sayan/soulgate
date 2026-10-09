/* ==========================================================================
 *  SOULGATE — render.js
 *  Sorumluluk : Sahneyi canvas'a çizmek — harita, kuleler, düşmanlar,
 *               mermiler, partiküller, ışık, sis, hasar sayıları ve ana
 *               menünün hareketli arka planı. Kamera ve ekran yerleşimi.
 *  Bağımlılık : config, utils, events (0) · state (1) · particles, sprites (2)
 *               · game (3; yalnızca okuma: mermiler, istatistikler).
 *
 *  ÇİZİM SIRASI (oyun sahnesi)
 *   1 boşluk arka planı → 2 harita katmanı → 3 yer lekeleri → 4 menziller /
 *   kurulum önizlemesi → 5 kuleler + düşmanlar (y'ye göre sıralı) →
 *   6 mermiler → 7 partiküller → 8 ortam karanlığı + sis →
 *   9 IŞIKLAR (gözler, auralar, alevler: hep en son, "toplanarak") →
 *   10 hasar sayıları → 11 vinyet, tehlike nabzı, ekran parlaması.
 *
 *  KAMERA: temel matris = dpr × sarsıntı (öteleme + dönüş). Yakınlaştırma
 *  state.view'a yazılır, böylece input.js dokunuşları her an doğru çevirir.
 * ========================================================================== */

import { GRID, QUALITY, FEEL, FONTS, THEME, TOWERS, ENEMIES, MAPS, MAP_BY_ID, SKILLS } from './config.js';
import { TAU, clamp, lerp, ease, noise1, rgba, mixHex, damp, samplePolyline, angleDelta, rng } from './utils.js';
import { EV, on } from './events.js';
import { state, isBuildable, createMap } from './state.js';
import * as fx from './particles.js';
import * as S from './sprites.js';
import { latestChapter } from './meta.js';
import { projectiles, statsOf, liveStats, towerStats, pathCoverage, keepStats } from './game.js';

/* --------------------------------------------------------------------------
 * 1. TUVAL, YERLEŞİM, KAMERA
 * ------------------------------------------------------------------------ */
let canvas = null;
let g = null;
let dpr = 1;
let W = 0;           // CSS piksel genişlik
let H = 0;
let time = 0;        // gerçek zaman (canlılık animasyonları duraklamada da sürer)
let baseCell = 32;
let baseOx = 0;
let baseOy = 0;
let backdrop = null;   // arka plan: yeniden boyutlanmada bir kez çizilir
const overlays = {};   // ortam karanlığı + vinyet, karanlık düzeyine göre önbellekli
let fps = 60;

const cam = { zoom: 1, target: 1, cx: GRID.cols / 2, cy: GRID.rows / 2 };
const DEFAULT_NIGHT = [4, 2, 10];
const TOP_PEEK = 0.6; // geçitten ne kadarının görüneceği (hücre)

/** Oyun canvas'ını bağlar ve olaylara abone olur. main.js bir kez çağırır. */
export function init(el) {
  canvas = el;
  g = canvas.getContext('2d', { alpha: false });
  on(EV.SETTINGS, (key) => {
    if (key === 'quality') resize();
  });
  on(EV.RUN_START, () => {
    cam.zoom = 1.18; // oyuna "inme" hissi
    cam.target = 1;
  });
  on(EV.SCENE, () => {
    cam.zoom = 1;
    cam.target = 1;
  });
  resize();
}

/** Pencere ya da arayüz yüksekliği değişince çağrılır. */
export function resize() {
  if (!canvas) return;
  const q = QUALITY[state.settings.quality] ?? QUALITY.high;
  dpr = Math.min(globalThis.devicePixelRatio || 1, q.dprCap);
  W = canvas.clientWidth || globalThis.innerWidth || 360;
  H = canvas.clientHeight || globalThis.innerHeight || 640;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);

  const ins = state.view.inset;
  const availW = Math.max(100, W - ins.left - ins.right - 8);
  const availH = Math.max(100, H - ins.top - ins.bottom - 4);
  baseCell = Math.min(availW / GRID.cols, availH / (GRID.rows + TOP_PEEK));
  baseOx = ins.left + (W - ins.left - ins.right - GRID.cols * baseCell) / 2;
  baseOy = ins.top + (availH - (GRID.rows + TOP_PEEK) * baseCell) / 2 + TOP_PEEK * baseCell;

  Object.assign(state.view, { width: W, height: H, dpr });
  S.setScale(baseCell * dpr);
  applyCamera();
  backdrop = buildBackdrop();
  for (const k of Object.keys(overlays)) delete overlays[k];
}

/** Yakınlaştırmayı ızgaranın merkezine göre uygular ve state.view'a yazar. */
function applyCamera() {
  const v = state.view;
  const cell = baseCell * cam.zoom;
  const centerX = baseOx + cam.cx * baseCell;
  const centerY = baseOy + cam.cy * baseCell;
  v.cell = cell;
  v.ox = centerX - cam.cx * cell;
  v.oy = centerY - cam.cy * cell;
}

/** Arka plan: koyu gradyan + ızgaranın iki yanında boşluğa eriyen kenarlar. */
function buildBackdrop() {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(W * dpr));
  c.height = Math.max(1, Math.round(H * dpr));
  const bg = c.getContext('2d');
  bg.scale(dpr, dpr);
  const grd = bg.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#07060a');
  grd.addColorStop(1, '#0d0b11');
  bg.fillStyle = grd;
  bg.fillRect(0, 0, W, H);
  const cell = baseCell;
  const gx = baseOx;
  const gw = GRID.cols * cell;
  const y0 = baseOy - cell;
  const h = (GRID.rows + 1) * cell;
  for (const [x0, x1, flip] of [[gx - cell * 0.6, gx, false], [gx + gw, gx + gw + cell * 0.6, true]]) {
    const side = bg.createLinearGradient(x0, 0, x1, 0);
    side.addColorStop(flip ? 1 : 0, 'rgba(21,18,27,0)');
    side.addColorStop(flip ? 0 : 1, 'rgba(21,18,27,0.9)');
    bg.fillStyle = side;
    bg.fillRect(x0, y0, x1 - x0, h);
  }
  return c;
}

/**
 * Ortam karanlığı ve vinyet tek katmanda (yarı çözünürlük yeterli: yumuşak
 * geçiş). Rengi bölümün gece tonundan gelir (theme.night: [r, g, b]).
 */
function overlayFor(dark, night = DEFAULT_NIGHT) {
  const key = dark.toFixed(2) + night.join(',');
  let c = overlays[key];
  if (c) return c;
  c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(W / 2));
  c.height = Math.max(1, Math.round(H / 2));
  const vg = c.getContext('2d');
  const r = Math.hypot(c.width, c.height) / 2;
  const [nr, ng, nb] = night;
  const grd = vg.createRadialGradient(c.width / 2, c.height * 0.46, r * 0.3, c.width / 2, c.height / 2, r);
  grd.addColorStop(0, `rgba(${nr},${ng},${nb},${dark})`);
  grd.addColorStop(0.7, `rgba(${Math.round(nr * 0.75)},${Math.round(ng * 0.75)},${Math.round(nb * 0.6)},${Math.min(0.9, dark + 0.3)})`);
  grd.addColorStop(1, `rgba(${Math.round(nr * 0.75)},${Math.round(ng * 0.75)},${Math.round(nb * 0.6)},${Math.min(0.92, dark + 0.62)})`);
  vg.fillStyle = grd;
  vg.fillRect(0, 0, c.width, c.height);
  overlays[key] = c;
  return c;
}

/* — Temel matris (dpr + sarsıntı) ve yerel dönüşümler — */
let ba = 1, bb = 0, bc = 0, bd = 1, be = 0, bf = 0;
const shake = { x: 0, y: 0, angle: 0 };

function setBase(withShake) {
  if (withShake) fx.getShake(shake);
  else shake.x = shake.y = shake.angle = 0;
  const cos = Math.cos(shake.angle);
  const sin = Math.sin(shake.angle);
  const cx = W / 2;
  const cy = H / 2;
  // dpr · T(merkez + sarsıntı) · R(açı) · T(−merkez)
  ba = dpr * cos;
  bb = dpr * sin;
  bc = -dpr * sin;
  bd = dpr * cos;
  be = dpr * (cx + shake.x - (cos * cx - sin * cy));
  bf = dpr * (cy + shake.y - (sin * cx + cos * cy));
}

let atIdentity = false;
function setLocal(a, b, c, d, e, f) {
  g.setTransform(ba * a + bc * b, bb * a + bd * b, ba * c + bc * d, bb * c + bd * d, ba * e + bc * f + be, bb * e + bd * f + bf);
  atIdentity = false;
}
/** Kimlik dönüşümüne döner; zaten oradaysa hiçbir şey yapmaz (pahalı çağrıyı atlar). */
function identity() {
  if (atIdentity) return;
  setLocal(1, 0, 0, 1, 0, 0);
  atIdentity = true;
}

/** Dünya → ekran (CSS piksel) */
const sx = (x) => state.view.ox + x * state.view.cell;
const sy = (y) => state.view.oy + y * state.view.cell;

/** Yüzeyi (sprite) çapası ekranda (px, py) olacak şekilde çizer. */
function drawSurface(surf, px, py, scaleX = 1, scaleY = 1, rot = 0, alpha = 1) {
  const cell = state.view.cell;
  if (rot === 0) setLocal(scaleX, 0, 0, scaleY, px, py);
  else {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    setLocal(c * scaleX, s * scaleX, -s * scaleY, c * scaleY, px, py);
  }
  g.globalAlpha = alpha;
  g.drawImage(surf.c, -surf.ox * cell, -surf.oy * cell, surf.w * cell, surf.h * cell);
  g.globalAlpha = 1;
}

/* --------------------------------------------------------------------------
 * 2. IŞIK KUYRUĞU — tüm "toplanan" parıltılar en sonda tek seferde çizilir
 * ------------------------------------------------------------------------ */
const lights = [];
let lightCount = 0;

/** x, y ekran pikseli; r piksel yarıçap. */
function light(x, y, r, color, alpha) {
  if (alpha <= 0.01 || r <= 0.5) return;
  let l = lights[lightCount];
  if (!l) {
    l = { x: 0, y: 0, r: 0, color: '', a: 0 };
    lights[lightCount] = l;
  }
  l.x = x;
  l.y = y;
  l.r = r;
  l.color = color;
  l.a = alpha;
  lightCount++;
}

function flushLights() {
  identity();
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < lightCount; i++) {
    const l = lights[i];
    g.globalAlpha = Math.min(1, l.a);
    g.drawImage(S.glowSprite(l.color), l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  lightCount = 0;
}

/** Titreşen ışık yoğunluğu (alev, mum). */
const flicker = (seed, speed = 7) => 0.72 + 0.28 * noise1(time * speed + seed * 13.7, seed);

/* --------------------------------------------------------------------------
 * 3. ANA ÇİZİM
 * ------------------------------------------------------------------------ */
/**
 * Bir kare çizer. realDt: gerçek geçen süre (sn).
 */
export function draw(realDt) {
  if (!g) return;
  // tarayıcı zaman damgaları ilk karede geriye düşebilir: eksi ve aşırı süreler reddedilir
  realDt = realDt > 0 ? Math.min(realDt, 0.25) : 0;
  time += realDt;
  fps = lerp(fps, realDt > 0 ? 1 / realDt : fps, 0.05);
  cam.zoom = damp(cam.zoom, cam.target, 3.2, realDt);
  applyCamera();

  const quality = QUALITY[state.settings.quality] ?? QUALITY.high;
  g.setTransform(1, 0, 0, 1, 0, 0);
  atIdentity = false;
  if (backdrop) g.drawImage(backdrop, 0, 0);

  if (state.scene === 'menu') drawMenuScene(realDt, quality);
  else if (state.map) drawGameScene(quality, realDt);

  setBase(false);
  atIdentity = false;
  identity();
  drawDanger();
  if (fx.flash.alpha > 0.01) {
    g.globalAlpha = fx.flash.alpha;
    g.fillStyle = fx.flash.color;
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 1;
  }
  if (state.settings.showFps) drawFps();
}

/**
 * Bölümün havası: görünen alana kar, ateş böceği, kor ya da boşluk zerresi
 * serpiştirir. Partiküller oyun zamanıyla akar; bu yüzden oyunda yalnızca
 * zaman akarken eklenir (duraklamada birikmesin).
 */
let ambT = 0;
function ambientTick(dt, quality, kind) {
  if (!kind || dt <= 0) return;
  const rate = quality.id === 'low' ? 2.5 : quality.id === 'medium' ? 6 : 11;
  const v = state.view;
  const x0 = -v.ox / v.cell;
  const x1 = (W - v.ox) / v.cell;
  const y0 = -v.oy / v.cell;
  const y1 = (H - v.oy) / v.cell;
  ambT -= dt;
  let n = 0;
  while (ambT <= 0 && n++ < 8) {
    ambT += 1 / rate;
    const x = rng.range(x0, x1);
    let y;
    if (kind === 'snow') y = rng.range(y0 - 1, y1);
    else if (kind === 'ember' || kind === 'ash') y = rng.range(y0 + (y1 - y0) * 0.4, y1 + 0.3);
    else y = rng.range(y0, y1);
    fx.ambient(kind, x, y);
  }
  if (ambT < -1) ambT = 0;
}

function drawGameScene(quality, dt) {
  const run = state.run;
  if (run && !run.paused && !run.over && run.speed > 0) ambientTick(dt * run.speed, quality, state.map.theme?.ambient);
  setBase(true);
  atIdentity = false;
  drawMapLayer();
  drawRuin();
  drawRouteMarks(dt, quality);
  drawParticles('ground');
  drawRanges();
  drawEntities(quality);
  drawKeep();
  drawEffects();
  drawProjectiles();
  drawParticles('top');
  if (quality.fog) drawFog(0.06);
  drawOverlay(quality.lights ? 0.2 : 0);
  drawChill();
  drawMapLights();
  flushLights();
  drawTexts();
}

/** Kış Kraliçesi'nin tipisi: kenarlardan içe sızan buz perdesi. */
let chillShown = 0;
function drawChill() {
  const run = state.run;
  chillShown = damp(chillShown, run && run.chill > 0 ? 1 : 0, 4, 1 / 60);
  if (chillShown < 0.02) return;
  identity();
  const grd = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
  grd.addColorStop(0, 'rgba(190,230,255,0)');
  grd.addColorStop(1, `rgba(200,236,255,${0.32 * chillShown})`);
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
}

/** Karanlık + vinyet katmanı; sarsıntıdan bağımsız, ekrana sabit. */
function drawOverlay(dark) {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  atIdentity = false;
  g.drawImage(overlayFor(dark, state.map?.theme?.night), 0, 0, W, H);
}

/* --------------------------------------------------------------------------
 * 4. ZEMİN
 * ------------------------------------------------------------------------ */
function drawMapLayer() {
  const layer = S.mapLayer(state.map);
  const v = state.view;
  identity();
  g.drawImage(layer.c, v.ox, v.oy - layer.oy * v.cell, layer.w * v.cell, layer.h * v.cell);
}

function drawMapLights() {
  const layer = S.mapLayer(state.map);
  const cell = state.view.cell;
  const run = state.run;
  const lifeRatio = run ? run.lives / run.maxLives : 1;
  for (let i = 0; i < layer.lights.length; i++) {
    const l = layer.lights[i];
    let a = 0.75 * flicker(i, l.kind === 'candle' ? 9 : 5);
    let r = l.r;
    if (l.kind === 'portal') {
      // yarık nefes alır; dalga gelirken öfkelenir
      const angry = run && run.spawners.length > 0 ? 1.4 : 1;
      a = (0.55 + 0.25 * Math.sin(time * 2.2 + i)) * angry;
      r = l.r * (1 + 0.12 * Math.sin(time * 1.7 + i)) * angry;
      light(sx(l.x), sy(l.y), r * cell * 1.3, l.color, a * 0.6);
    } else if (l.kind === 'lava') {
      a = 0.55 + 0.25 * noise1(time * 0.8 + i * 3.1, i);
      r = l.r * (0.92 + 0.12 * noise1(time * 0.6 + i, i + 9));
    } else if (l.kind === 'wisp' || l.kind === 'rift' || l.kind === 'rune' || l.kind === 'crystal') {
      a = 0.45 + 0.3 * Math.sin(time * (l.kind === 'rift' ? 2.6 : 1.4) + i * 1.7);
    }
    if (l.kind === 'window' && lifeRatio < 0.35) a *= 0.5 + 0.5 * Math.abs(Math.sin(time * 9 + i)); // kale titrer
    if (l.kind === 'window' && run?.ruined) a *= 0.3 + 0.25 * flicker(i + 40, 11); // yıkık kalede ışıklar sönük
    light(sx(l.x), sy(l.y), r * cell, l.color, a);
  }
}

/* — Yol yönü: düşmanların nereden girip nereye gittiği —
 *  Giriş: geçidin altında kızıl oklar (aşağı akar).
 *  Çıkış: kale kapısının önünde altın oklar (kapıya akar).
 *  Hazırlık evresinde (sahada düşman yokken) soluk oklar yolun tamamı
 *  boyunca akar; savaş başlayınca söner, işaretler yarı saydam kalır.
 */
const ROUTE = {
  start: [0.85, 1.2, 1.55],    // yolun başından uzaklık (hücre)
  end: [1.95, 1.66, 1.37],     // yolun sonundan geriye uzaklık
  startColor: '#ff4a5a',
  endColor: '#ffd27a',
  flowGap: 1.4,                // akan oklar arası (hücre)
  flowSpeed: 1.1,              // hücre/sn
  flowColor: '#e8d9b8',
};
const routePt = { x: 0, y: 0, angle: 0, seg: 0 };
let routeCalm = 1; // 1 = hazırlık (oklar akar), 0 = savaş

function chevron(pl, d, size, color, alpha, glow) {
  if (alpha <= 0.01) return;
  samplePolyline(pl, d, routePt);
  const cell = state.view.cell;
  const px = sx(routePt.x);
  const py = sy(routePt.y);
  const c = Math.cos(routePt.angle);
  const s = Math.sin(routePt.angle);
  const half = size * cell * 0.5;     // kanat açıklığının yarısı
  const back = size * cell * 0.42;    // uçtan kanatlara geri mesafe
  const tx = px + c * back * 0.5;
  const ty = py + s * back * 0.5;
  const bx = px - c * back * 0.5;
  const by = py - s * back * 0.5;
  g.beginPath();
  g.moveTo(bx - s * half, by + c * half);
  g.lineTo(tx, ty);
  g.lineTo(bx + s * half, by - c * half);
  g.globalAlpha = alpha * 0.7;
  g.strokeStyle = '#000000';
  g.lineWidth = cell * 0.16;
  g.stroke();
  g.globalAlpha = alpha;
  g.strokeStyle = color;
  g.lineWidth = cell * 0.075;
  g.stroke();
  if (glow) light(px, py, cell * 0.6, color, alpha * 0.4);
}

/**
 * İki yollu haritada ikinci yolun birinciyle birleştiği mesafe: ortak
 * kuyruktaki oklar bir kez çizilsin. Haritanın kendisinde saklanır.
 */
function mergeDistance(map, i) {
  map.mergeD ??= [];
  if (map.mergeD[i] !== undefined) return map.mergeD[i];
  const a = map.polys[0].points;
  const b = map.polys[i].points;
  let k = 0;
  while (k < a.length && k < b.length && a[a.length - 1 - k].x === b[b.length - 1 - k].x && a[a.length - 1 - k].y === b[b.length - 1 - k].y) k++;
  const joint = b[b.length - k] ?? b[b.length - 1];
  let d = 0;
  for (const sg of map.polys[i].segs) {
    if (sg.x1 === joint.x && sg.y1 === joint.y) break;
    d += sg.len;
  }
  map.mergeD[i] = d;
  return d;
}

function drawRouteMarks(dt, quality) {
  const run = state.run;
  const map = state.map;
  if (!run || !map.polys[0] || map.polys[0].length <= 0) return;
  const calm = !run.over && run.enemies.length === 0 && run.spawners.length === 0;
  routeCalm = damp(routeCalm, calm ? 1 : 0, 2.5, dt);
  identity();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const glow = quality.lights;
  const startColor = map.theme?.portalGlow ?? ROUTE.startColor;

  map.polys.forEach((pl, i) => {
    const L = pl.length;
    // hazırlıkta yol boyunca akan oklar (ikinci yol yalnızca birleşene kadar)
    if (routeCalm > 0.02) {
      const shift = (time * ROUTE.flowSpeed) % ROUTE.flowGap;
      const from = ROUTE.start[2] + 0.6;
      const to = i === 0 ? L - ROUTE.end[0] - 0.6 : mergeDistance(map, i);
      for (let d = from + shift; d < to; d += ROUTE.flowGap) {
        const edge = Math.min(d - from, to - d);              // uçlarda yumuşak giriş/çıkış
        const a = 0.28 * routeCalm * clamp(edge / 0.8, 0, 1);
        chevron(pl, d, 0.34, ROUTE.flowColor, a, false);
      }
    }
    // giriş işaretleri (her geçitte) ve çıkış işaretleri (bir kez): sırayla parlayan üçlü oklar
    const base = 0.5 + 0.5 * routeCalm;
    for (let k = 0; k < 3; k++) {
      const pulse = 0.45 + 0.55 * Math.max(0, Math.sin(time * 3.2 - k * 0.9));
      chevron(pl, ROUTE.start[k], 0.42, startColor, base * pulse, glow);
      if (i === 0) chevron(pl, L - ROUTE.end[k], 0.42, ROUTE.endColor, base * pulse, glow);
    }
  });
  g.globalAlpha = 1;
}

/* — Ana kule: yıkıklık izleri, balista ve yan kule fenerleri — */
// yıkık kale çatlakları (kale merkezine göre, hücre)
const CRACKS = [
  [[-0.55, -1.35], [-0.42, -1.05], [-0.5, -0.8], [-0.36, -0.45]],
  [[0.3, -0.3], [0.42, -0.05], [0.33, 0.2], [0.46, 0.45]],
  [[-1.3, -1.05], [-1.18, -0.7], [-1.28, -0.35]],
  [[1.25, -0.95], [1.12, -0.6], [1.2, -0.2], [1.1, 0.15]],
  [[-0.1, -0.2], [0.05, 0.05], [-0.05, 0.3]],
];

function drawRuin() {
  const run = state.run;
  if (!run || !run.ruined) return;
  const { x, y } = state.map.castle;
  const cell = state.view.cell;
  identity();
  // is ve kül: yıkık kale soluk görünür
  const grad = g.createRadialGradient(sx(x), sy(y - 0.7), cell * 0.2, sx(x), sy(y - 0.7), cell * 1.9);
  grad.addColorStop(0, 'rgba(12, 8, 10, 0.45)');
  grad.addColorStop(1, 'rgba(12, 8, 10, 0)');
  g.fillStyle = grad;
  g.fillRect(sx(x - 1.9), sy(y - 2.6), cell * 3.8, cell * 3.8);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(8, 5, 6, 0.85)';
  g.lineWidth = Math.max(1.2, cell * 0.045);
  for (const crack of CRACKS) {
    g.beginPath();
    crack.forEach(([dx, dy], i) => (i ? g.lineTo(sx(x + dx), sy(y + dy)) : g.moveTo(sx(x + dx), sy(y + dy))));
    g.stroke();
  }
  // çatlakların içinde sönmekte olan kor
  g.globalAlpha = 0.35 + 0.25 * Math.sin(time * 2.3);
  g.strokeStyle = '#ff5a1f';
  g.lineWidth = Math.max(0.6, cell * 0.014);
  for (const crack of CRACKS) {
    g.beginPath();
    crack.forEach(([dx, dy], i) => (i ? g.lineTo(sx(x + dx), sy(y + dy)) : g.moveTo(sx(x + dx), sy(y + dy))));
    g.stroke();
  }
  g.globalAlpha = 1;
}

/** Ana kulenin tepesindeki balista hedefe döner; yan kule fenerleri yeteneğe göre yanar. */
function drawKeep() {
  const run = state.run;
  const k = run?.castle;
  if (!k) return;
  const cell = state.view.cell;
  identity();
  g.save();
  g.translate(sx(k.x), sy(k.y));
  g.rotate(k.angle);
  const L = cell * 0.22;
  g.lineCap = 'round';
  g.strokeStyle = '#1a120c';
  g.lineWidth = cell * 0.09;
  g.beginPath();
  g.moveTo(-L * 0.6, 0);
  g.lineTo(L, 0);
  g.stroke();
  g.strokeStyle = '#8a6a3a';
  g.lineWidth = cell * 0.045;
  g.beginPath();
  g.moveTo(-L * 0.6, 0);
  g.lineTo(L, 0);
  g.stroke();
  g.strokeStyle = run.ruined ? '#6a5a4a' : '#c9a25a';
  g.lineWidth = cell * 0.035;
  g.beginPath();
  g.moveTo(L * 0.2, -L * 0.9);
  g.quadraticCurveTo(L * 0.75, 0, L * 0.2, L * 0.9);
  g.stroke();
  g.restore();

  // yan kule fenerleri: hazır yetenek kendi renginde yanar
  const { x, y } = state.map.castle;
  for (const sk of run.skills) {
    const def = SKILLS[sk.id];
    const tx = x + (sk.side === 'left' ? -1.2 : 1.2);
    const ty = y - 1.4 - 0.05 - 1.15; // köşe kulesi sivrisinin ucu
    const ready = sk.cd <= 0;
    const a = ready ? 0.75 + 0.25 * Math.sin(time * 3 + (sk.side === 'left' ? 0 : 1.7)) : 0.18;
    light(sx(tx), sy(ty), cell * (ready ? 0.7 : 0.4), def.color, a);
    g.globalAlpha = Math.min(1, a + 0.15);
    g.fillStyle = def.color;
    g.beginPath();
    g.arc(sx(tx), sy(ty), cell * 0.06, 0, TAU);
    g.fill();
    g.globalAlpha = 1;
  }
}

/* — Yetenek etkileri: yuvarlanan tomruk ve düşen meteor — */
function drawEffects() {
  const run = state.run;
  if (!run || run.effects.length === 0) return;
  const cell = state.view.cell;
  for (const fx of run.effects) {
    if (fx.kind === 'log') drawLog(fx, cell);
    else if (fx.kind === 'meteor') drawMeteor(fx, cell);
    else if (fx.kind === 'plague') drawPlague(fx, cell);
    else if (fx.kind === 'vortex') drawVortex(fx, cell);
    else if (fx.kind === 'reaper') drawReaper(fx, cell);
  }
}

/** Veba Bulutu: alanı kaplayan, kıvrılan yeşil sis halkası. */
function drawPlague(fx, cell) {
  identity();
  const k = clamp(fx.t / 0.4, 0, 1);
  const fade = clamp((fx.dur - fx.t) / 0.6, 0, 1);
  const a = k * fade;
  const cx = sx(fx.x);
  const cy = sy(fx.y);
  const r = fx.radius * cell;
  const grd = g.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
  grd.addColorStop(0, `rgba(120,200,60,${0.28 * a})`);
  grd.addColorStop(0.7, `rgba(80,140,40,${0.2 * a})`);
  grd.addColorStop(1, 'rgba(40,80,20,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.ellipse(cx, cy, r, r * 0.8, 0, 0, TAU);
  g.fill();
  const sp = S.smokeSprite('#7aa83a');
  for (let i = 0; i < 5; i++) {
    const ang = time * 0.6 + (i * TAU) / 5;
    const rr = r * (0.35 + 0.25 * Math.sin(time * 1.3 + i));
    const s = r * 0.7;
    g.globalAlpha = 0.25 * a;
    g.drawImage(sp, cx + Math.cos(ang) * rr - s / 2, cy + Math.sin(ang) * rr * 0.8 - s / 2, s, s);
  }
  g.globalAlpha = 1;
  g.strokeStyle = rgba('#b6ff4a', 0.4 * a);
  g.lineWidth = 1.5;
  g.setLineDash([cell * 0.14, cell * 0.12]);
  g.lineDashOffset = time * 20;
  g.beginPath();
  g.ellipse(cx, cy, r, r * 0.8, 0, 0, TAU);
  g.stroke();
  g.setLineDash([]);
}

/** Kara Girdap: içe dönen mor spiral; çarpınca dağılır. */
function drawVortex(fx, cell) {
  identity();
  const cx = sx(fx.x);
  const cy = sy(fx.y);
  const r = fx.radius * cell;
  const grow = clamp(fx.t / fx.delay, 0, 1);
  const after = fx.t > fx.delay ? 1 - (fx.t - fx.delay) / 0.6 : 1;
  const a = Math.max(0, after);
  g.save();
  g.translate(cx, cy);
  g.scale(1, 0.75);
  g.rotate(-time * 6);
  g.globalCompositeOperation = 'lighter';
  for (let arm = 0; arm < 3; arm++) {
    g.beginPath();
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const ang = arm * (TAU / 3) + t * 4;
      const rr = r * grow * (1 - t * 0.9);
      const x = Math.cos(ang) * rr;
      const y = Math.sin(ang) * rr;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.strokeStyle = rgba('#b07aff', 0.6 * a);
    g.lineWidth = Math.max(1.5, cell * 0.06);
    g.stroke();
  }
  g.restore();
  g.globalCompositeOperation = 'source-over';
  light(cx, cy, r * 0.9 * grow, '#9a6aff', 0.6 * a);
}

/** Ölüm Tırpanı: ekranı soldan sağa süpüren solgun hilal. */
function drawReaper(fx, cell) {
  identity();
  const k = clamp(fx.t / fx.dur, 0, 1);
  const x = lerp(-W * 0.2, W * 1.2, ease.outCubic(k));
  const y = H * 0.48;
  const R = Math.max(W, H) * 0.55;
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.5 * (1 - k);
  const grd = g.createLinearGradient(x - R * 0.3, 0, x, 0);
  grd.addColorStop(0, 'rgba(214,210,232,0)');
  grd.addColorStop(1, 'rgba(214,210,232,0.9)');
  g.strokeStyle = grd;
  g.lineWidth = cell * 0.5;
  g.beginPath();
  g.arc(x - R, y, R, -0.5, 0.5);
  g.stroke();
  g.restore();
}

function drawLog(fx, cell) {
  identity();
  const px = sx(fx.x);
  const py = sy(fx.y);
  const sh = S.shadowSprite();
  g.globalAlpha = 0.6;
  g.drawImage(sh, px - cell * 0.5, py - cell * 0.05, cell, cell * 0.35);
  g.globalAlpha = 1;
  g.save();
  g.translate(px, py - cell * 0.12);
  g.rotate(fx.angle + Math.PI / 2);   // gövde yola dik durur
  const half = cell * 0.5;
  const r = cell * 0.18;
  g.fillStyle = '#5a3c22';
  g.strokeStyle = '#1e140b';
  g.lineWidth = Math.max(1, cell * 0.025);
  g.beginPath();
  g.moveTo(-half + r, -r);
  g.lineTo(half - r, -r);
  g.arc(half - r, 0, r, -Math.PI / 2, Math.PI / 2);
  g.lineTo(-half + r, r);
  g.arc(-half + r, 0, r, Math.PI / 2, Math.PI * 1.5);
  g.closePath();
  g.fill();
  g.stroke();
  // kabuk çizgileri yuvarlandıkça kayar
  g.strokeStyle = 'rgba(20, 12, 6, 0.75)';
  g.lineWidth = Math.max(0.8, cell * 0.018);
  const phase = (fx.roll * 2.4) % 1;
  for (let i = 0; i < 3; i++) {
    const v = ((i / 3 + phase) % 1) * 2 - 1;
    g.beginPath();
    g.moveTo(-half * 0.85, v * r * 0.8);
    g.lineTo(half * 0.85, v * r * 0.8);
    g.stroke();
  }
  // uç halkaları
  for (const ex of [-half, half]) {
    g.fillStyle = '#a77a48';
    g.beginPath();
    g.ellipse(ex, 0, r * 0.35, r * 0.95, 0, 0, TAU);
    g.fill();
    g.stroke();
  }
  g.restore();
}

function drawMeteor(fx, cell) {
  identity();
  const k = clamp(fx.t / fx.delay, 0, 1);
  const tx = sx(fx.x);
  const ty = sy(fx.y);
  // hedef halkası
  const pulse = 0.5 + 0.5 * Math.sin(time * 14);
  g.strokeStyle = rgba('#ff3b1e', 0.45 + 0.4 * pulse * k);
  g.lineWidth = Math.max(1.5, cell * 0.04);
  g.setLineDash([cell * 0.18, cell * 0.12]);
  g.beginPath();
  g.ellipse(tx, ty, fx.radius * cell, fx.radius * cell * 0.8, 0, 0, TAU);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = rgba('#ff3b1e', 0.08 + 0.12 * k);
  g.fill();
  // düşen kaya (sağ üstten)
  const e = k * k;
  const mx = lerp(tx + cell * 1.6, tx, e);
  const my = lerp(ty - cell * 6, ty, e);
  const ang = Math.atan2(ty - (ty - cell * 6), tx - (tx + cell * 1.6));
  const trail = cell * 1.4;
  const grad = g.createLinearGradient(mx, my, mx - Math.cos(ang) * trail, my - Math.sin(ang) * trail);
  grad.addColorStop(0, 'rgba(255, 210, 120, 0.95)');
  grad.addColorStop(0.4, 'rgba(255, 90, 30, 0.6)');
  grad.addColorStop(1, 'rgba(120, 20, 10, 0)');
  g.strokeStyle = grad;
  g.lineCap = 'round';
  g.lineWidth = cell * 0.22;
  g.beginPath();
  g.moveTo(mx, my);
  g.lineTo(mx - Math.cos(ang) * trail, my - Math.sin(ang) * trail);
  g.stroke();
  g.fillStyle = '#3a1a10';
  g.beginPath();
  g.arc(mx, my, cell * 0.16, 0, TAU);
  g.fill();
  g.fillStyle = '#ffcf7a';
  g.beginPath();
  g.arc(mx - cell * 0.03, my - cell * 0.03, cell * 0.08, 0, TAU);
  g.fill();
  light(mx, my, cell * 1.1, '#ff7a2f', 0.9);
}

/* --------------------------------------------------------------------------
 * 5. MENZİLLER VE KURULUM ÖNİZLEMESİ
 * ------------------------------------------------------------------------ */
function rangeCircle(x, y, r, color, alpha, dashed = true) {
  identity();
  const cell = state.view.cell;
  g.beginPath();
  g.arc(sx(x), sy(y), r * cell, 0, TAU);
  g.fillStyle = rgba(color, alpha * 0.16);
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = rgba(color, alpha * 0.7);
  if (dashed) {
    g.setLineDash([6, 6]);
    g.lineDashOffset = -time * 14;
  }
  g.stroke();
  g.setLineDash([]);
}

function drawRanges() {
  const run = state.run;
  if (!run) return;
  const ui = state.ui;
  const cell = state.view.cell;

  if (state.settings.showRanges) {
    for (const t of run.towers) if (!TOWERS[t.type].economy) rangeCircle(t.x, t.y, liveStats(t).range, TOWERS[t.type].colors.glow, 0.35, false);
  }

  const sel = ui.selectedId ? run.towerById.get(ui.selectedId) : null;
  if (sel) {
    if (!TOWERS[sel.type].economy) rangeCircle(sel.x, sel.y, liveStats(sel).range, TOWERS[sel.type].support && sel.type === 'bell' ? '#ffe08a' : THEME.gold, 1);
    identity();
    const pulse = 0.5 + 0.5 * Math.sin(time * 5);
    g.beginPath();
    g.ellipse(sx(sel.x), sy(sel.y + 0.22), cell * 0.48, cell * 0.2, 0, 0, TAU);
    g.lineWidth = 2;
    g.strokeStyle = rgba(THEME.gold, 0.5 + 0.4 * pulse);
    g.stroke();
  }

  // ana kule seçiliyse balistanın menzili (merkez: atış noktası)
  if (ui.keepSelected && run.castle) {
    const k = run.castle;
    rangeCircle(k.x, k.y, keepStats().range, THEME.gold, 1);
    identity();
    const pulse = 0.5 + 0.5 * Math.sin(time * 5);
    g.beginPath();
    g.arc(sx(k.x), sy(k.y), cell * (0.42 + 0.05 * pulse), 0, TAU);
    g.lineWidth = 2;
    g.strokeStyle = rgba(THEME.gold, 0.45 + 0.4 * pulse);
    g.stroke();
  }

  const type = ui.buildType;
  if (!type) return;
  // kurulabilir hücreler hafifçe parlar
  identity();
  const pulse = 0.08 + 0.05 * Math.sin(time * 3);
  g.fillStyle = rgba(THEME.gold, pulse);
  for (let r = 0; r < GRID.rows; r++) {
    for (let c = 0; c < GRID.cols; c++) {
      if (!isBuildable(c, r)) continue;
      g.fillRect(sx(c) + cell * 0.12, sy(r) + cell * 0.12, cell * 0.76, cell * 0.76);
    }
  }
  if (ui.ghostC < 0) return;
  const st = towerStats(type, 0);
  const x = ui.ghostC + 0.5;
  const y = ui.ghostR + 0.5;
  const color = ui.ghostValid ? THEME.gold : THEME.danger;
  if (!TOWERS[type].economy) rangeCircle(x, y, st.range, color, 1);
  const sp = S.towerSprite(type, 0, -1);
  drawSurface(sp.base, sx(x), sy(y), 1, 1, 0, ui.ghostValid ? 0.75 : 0.4);
  if (sp.head) drawSurface(sp.head, sx(x), sy(y + sp.headY), 1, 1, sp.aim ? -Math.PI / 2 : 0, ui.ghostValid ? 0.75 : 0.4);
  if (ui.ghostValid) {
    // bilgi akışı: bu nokta yolun kaç hücresini görüyor
    const n = pathCoverage(ui.ghostC, ui.ghostR, st.range);
    identity();
    g.font = `700 ${Math.round(cell * 0.3)}px ${FONTS.body}`;
    g.textAlign = 'center';
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    const label = `◎ ${n}`;
    g.strokeText(label, sx(x), sy(y + 0.85));
    g.fillStyle = n >= 8 ? THEME.ok : n >= 4 ? THEME.gold : '#ff9a6a';
    g.fillText(label, sx(x), sy(y + 0.85));
  }
}

/* --------------------------------------------------------------------------
 * 6. VARLIKLAR — kuleler ve düşmanlar, derinliğe göre sıralı
 * ------------------------------------------------------------------------ */
const drawList = [];
const depth = (o) => (o.flying ? o.y + 1.2 : o.y);
const byDepth = (a, b) => depth(a) - depth(b);

function drawEntities(quality) {
  const run = state.run;
  if (!run) return;
  drawList.length = 0;
  for (const t of run.towers) drawList.push(t);
  for (const e of run.enemies) drawList.push(e);
  drawList.sort(byDepth);
  for (const o of drawList) {
    if (o.wave !== undefined) drawEnemy(o, quality);
    else drawTower(o, quality);
  }
  for (const t of run.towers) if (t.type === 'curse') drawCurseRune(t);
}

/* — Kule — */
function drawTower(t, quality) {
  const sp = S.towerSprite(t.type, t.level, t.mastery);
  const cell = state.view.cell;
  const px = sx(t.x);
  const py = sy(t.y);
  const b = ease.outBack(clamp(t.buildT, 0, 1));
  const scaleY = 0.25 + 0.75 * b;
  const alpha = Math.min(1, t.buildT * 3);
  const silenced = t.silenced > 0;

  drawSurface(sp.base, px, py, 1, scaleY, 0, silenced ? alpha * 0.75 : alpha);
  if (t.flash > 0) {
    g.globalCompositeOperation = 'lighter';
    drawSurface(sp.base, px, py, 1, scaleY, 0, t.flash * 0.5);
    g.globalCompositeOperation = 'source-over';
  }

  // baş: nişan alan döner ve geri teper; çan sallanır; diğerleri süzülür
  let hx = px;
  let hy = py + sp.headY * cell * scaleY;
  if (sp.bob) hy += Math.sin(time * 2.1 + t.id) * sp.bob * cell;
  if (sp.head) {
    let rot = 0;
    if (sp.aim) {
      rot = t.angle;
      hx -= Math.cos(t.angle) * t.recoil * cell;
      hy -= Math.sin(t.angle) * t.recoil * cell;
    } else if (sp.swing) {
      // çan: hafif salınım; Ölüm Çanı çaldığında bir an güçlü sallanır
      rot = Math.sin(time * 2.4 + t.id) * sp.swing * (silenced ? 0.2 : 1);
      const st = statsOf(t);
      if (st.knell > 0 && t.cooldown > 0) {
        const since = 1 / st.rate - t.cooldown;
        if (since >= 0 && since < 0.8) rot += Math.sin(since * 14) * 0.4 * (1 - since / 0.8);
      }
    }
    drawSurface(sp.head, hx, hy, 1, 1, rot, alpha);
  }
  if (silenced) silenceMark(t, px, py, cell);
  if (silenced || alpha < 0.5) return;
  if (t.beam && t.beam.target) drawBeam(t, sp, hx, hy, cell, quality);
  if ((t.bRate > 0 || t.bDmg > 0) && quality.glow) {
    // çan güçlendirmesi: kulenin dibinde altın nabız
    light(px, py + cell * 0.18, cell * 0.42, '#ffe08a', 0.18 + 0.1 * Math.sin(time * 4 + t.id));
  }
  if (sp.wisp && quality.glow) {
    // kuyu: sudan yükselen ruh pırıltıları
    for (let i = 0; i < 3; i++) {
      const k = (time * 0.45 + i / 3 + t.id * 0.13) % 1;
      light(px + Math.sin(time * 2 + i * 2.1) * cell * 0.12, py + (sp.wisp.y - k * 0.7) * cell, cell * 0.09 * (1 - k * 0.5), sp.wisp.color, 0.7 * (1 - k));
    }
  }

  // canlı ışıklar
  for (let i = 0; i < sp.lights.length; i++) {
    const l = sp.lights[i];
    const fl = l.kind === 'fire' ? flicker(t.id + i, 9) : 0.85 + 0.15 * Math.sin(time * 3 + t.id);
    const ly = l.kind === 'core' && sp.bob ? hy : py + l.y * cell;
    light(px + l.x * cell, ly, l.r * cell, l.color, (quality.glow ? 0.75 : 0.45) * fl);
  }
  if (t.type === 'tesla' && quality.glow && Math.sin(time * 11 + t.id * 3) > 0.6) teslaSpark(hx, hy, cell);
  // gözler: göz kırpar, ateş ederken parlar
  const blink = blinkOpen(t.id);
  const hot = 1 + Math.max(0, 0.6 - t.cooldown) * 0.8;
  for (const [ex, ey] of sp.eyes) {
    const bx = sp.eyesOnHead ? hx : px;
    const by = sp.eyesOnHead ? hy : py;
    light(bx + ex * cell, by + ey * cell, sp.eyeR * cell * 2.8 * blink, sp.eyeColor, 0.95 * hot);
  }
}

/** Susturulmuş kulenin üstünde türüne göre işaret: alev, buz, ağ, lanet, gaz, boşluk. */
const SILENCE_COLOR = { fire: '#ff7a2f', frost: '#a6ecff', void: '#c04aff', web: '#d8d0e8', hex: '#b6ff3a', gas: '#a8c84a' };
function silenceMark(t, px, py, cell) {
  const kind = t.silenceKind || 'fire';
  const color = SILENCE_COLOR[kind] ?? '#ff7a2f';
  identity();
  if (kind === 'web') {
    g.strokeStyle = 'rgba(230,224,240,0.75)';
    g.lineWidth = Math.max(1, cell * 0.02);
    const cx = px;
    const cy = py - cell * 0.45;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a) * cell * 0.45, cy + Math.sin(a) * cell * 0.55);
      g.stroke();
    }
    for (const r of [0.16, 0.3, 0.42]) {
      g.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * TAU + 0.3;
        const x = cx + Math.cos(a) * cell * r;
        const y = cy + Math.sin(a) * cell * r * 1.2;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    }
  } else if (kind === 'frost') {
    g.fillStyle = 'rgba(190,236,255,0.28)';
    g.beginPath();
    g.ellipse(px, py - cell * 0.35, cell * 0.42, cell * 0.6, 0, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(220,248,255,0.7)';
    g.lineWidth = 1.2;
    g.stroke();
  }
  light(px, py - cell * 0.4, cell * 0.5, color, 0.35 + 0.15 * Math.sin(time * 6 + t.id));
}

/** Kristal Prizma ışını: kökten hedefe, ısındıkça kalınlaşan ve beyazlaşan çizgi. */
function drawBeam(t, sp, hx, hy, cell, quality) {
  const b = t.beam;
  const col = TOWERS[t.type].colors.glow;
  const k = b.k;
  const ray = (tx, ty, w, a) => {
    identity();
    g.globalCompositeOperation = 'lighter';
    for (const [wm, c2, am] of [[3.2, col, 0.25], [1.4, col, 0.8], [0.5, '#ffffff', 1]]) {
      g.globalAlpha = a * am * (0.75 + 0.25 * Math.sin(time * 30 + t.id));
      g.strokeStyle = c2;
      g.lineWidth = Math.max(1, cell * w * wm);
      g.beginPath();
      g.moveTo(hx, hy);
      g.lineTo(tx, ty);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    light(tx, ty, cell * (0.3 + 0.25 * k), col, 0.7);
  };
  const aim = (e) => [sx(e.x), sy(e.y - e.size * 0.9 - (e.flying ? (e.boss ? 0.7 : 0.55) : 0))];
  const [tx, ty] = aim(b.target);
  ray(tx, ty, 0.03 + 0.04 * k, 0.8 + 0.2 * k);
  for (const f of b.forks) {
    const [fx, fy] = aim(f);
    identity();
    ray(fx, fy, 0.02 + 0.02 * k, 0.6);
  }
  if (quality.glow) light(hx, hy, cell * (0.5 + 0.3 * k), col, 0.4 + 0.4 * k);
}

function teslaSpark(x, y, cell) {
  identity();
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(201,187,255,0.8)';
  g.lineWidth = 1.2;
  g.beginPath();
  const a = rng.range(0, TAU);
  let px = x;
  let py = y;
  g.moveTo(px, py);
  for (let i = 0; i < 4; i++) {
    px += Math.cos(a + rng.spread(0, 0.9)) * cell * 0.09;
    py += Math.sin(a + rng.spread(0, 0.9)) * cell * 0.09;
    g.lineTo(px, py);
  }
  g.stroke();
  g.globalCompositeOperation = 'source-over';
}

function drawCurseRune(t) {
  const sp = S.towerSprite(t.type, t.level, t.mastery);
  if (!sp.rune || t.silenced > 0) return;
  const cell = state.view.cell;
  const pulse = Math.max(0, 0.6 - (1 / statsOf(t).rate - Math.max(0, t.cooldown))); // nabızdan hemen sonra parlar
  identity();
  g.save();
  g.translate(sx(t.x), sy(t.y + sp.rune.y));
  g.scale(1, 0.38);
  g.rotate(time * 0.6);
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = rgba(sp.rune.color, 0.35 + pulse * 0.6);
  g.lineWidth = 2.2;
  g.setLineDash([cell * 0.12, cell * 0.16]);
  g.beginPath();
  g.arc(0, 0, sp.rune.r * cell, 0, TAU);
  g.stroke();
  g.setLineDash([]);
  g.restore();
  g.globalCompositeOperation = 'source-over';
}

/** Kişiye özel göz kırpma: ~4 sn'de bir, kısa kapanma. */
function blinkOpen(seed) {
  const k = (time * 0.27 + seed * 0.618) % 1;
  return k < 0.03 ? 0.15 : 1;
}

/** İki karelik animasyonda her koşulda 0 ya da 1 döner (eksi/NaN'a dayanıklı). */
function frameOf(v) {
  return Number.isFinite(v) ? Math.abs(Math.floor(v)) % 2 : 0;
}

/* — Düşman — */
function drawEnemy(e, quality) {
  const sp = S.enemySprite(e.type);
  const def = ENEMIES[e.type];
  const cell = state.view.cell;
  const px = sx(e.x);
  const py = sy(e.y);
  const flying = sp.fly > 0;
  const hover = flying ? Math.sin(time * 5 + e.id) * 0.05 : 0;
  const lift = (sp.fly + hover) * cell;
  const stepBob = flying ? 0 : Math.abs(Math.sin(e.walk * Math.PI)) * 0.05 * sp.height * cell;
  const frame = flying ? frameOf(time * (e.boss ? 3 : 8) + e.id) : frameOf(e.walk * 2);
  const squash = 1 + Math.sin(e.walk * TAU) * 0.035;
  const spawn = ease.outCubic(e.spawnT);
  const scale = 0.6 + 0.4 * spawn;
  let alpha = spawn;
  const burrowed = e.phased && def.phase?.kind === 'burrow';
  if (e.phased && !burrowed) alpha *= 0.28;
  const frozen = e.freezeT > 0;
  const stopped = e.stopT > 0;
  const bodyY = py - lift - stepBob;
  const midY = bodyY - sp.height * cell * 0.45;

  // toprağa gömülü: yalnızca kabaran toprak ve iki göz görünür
  if (burrowed) {
    drawMound(e, px, py, cell, sp, spawn);
    return;
  }

  // gölge yerde kalır
  identity();
  const sh = S.shadowSprite();
  const sr = sp.shadowR * cell * (flying ? 0.8 : 1);
  g.globalAlpha = 0.85 * spawn;
  g.drawImage(sh, px - sr, py - sr * 0.38, sr * 2, sr * 0.76);
  g.globalAlpha = 1;

  if (sp.aura && quality.glow) light(px, midY, sp.aura.r * cell * (1 + 0.08 * Math.sin(time * 3 + e.id)), sp.aura.color, 0.32);
  if (e.slowT > 0 && !frozen) footRing(px, py, cell, '#6fb7d6', 0.6);
  if (e.cursed) footRing(px, py, cell, '#ff4f8f', 0.35);
  if (e.enraged) {
    footRing(px, py, cell, '#ff3b2e', 0.7);
    if (quality.glow) light(px, midY, sp.height * cell * 0.8, '#ff3b2e', 0.28 + 0.12 * Math.sin(time * 9 + e.id));
  }
  if (e.hasteMult > 1 && !stopped) hasteStreaks(e, px, midY, cell, sp);
  if (stopped) footRing(px, py, cell, '#e8d7a8', 0.8);

  const still = frozen || stopped;
  drawSurface(sp.frames[still ? 0 : frame], px, bodyY, e.dir * scale, scale * (still ? 1 : squash), 0, alpha);
  if (e.flash > 0 || frozen || e.hardT > 0 || stopped) {
    g.globalCompositeOperation = 'lighter';
    const fa = frozen ? 0.35 : e.hardT > 0 ? 0.3 + 0.15 * Math.sin(time * 6) : stopped ? 0.22 : (e.flash / FEEL.hitFlash) * 0.8;
    drawSurface(sp.frames[still ? 0 : frame], px, bodyY, e.dir * scale, scale, 0, fa * alpha);
    g.globalCompositeOperation = 'source-over';
  }

  // durum işaretleri
  if (frozen) light(px, midY, sp.height * cell * 0.7, '#a6ecff', 0.6);
  if (e.stunT > 0) stunStars(px, bodyY - sp.height * cell * 1.02, cell, e.id);
  if (e.pStacks > 0) light(px, py - sp.height * cell * 0.2, sp.height * cell * 0.5, '#7dff5a', 0.18 + e.pStacks * 0.05);
  if (e.burnT > 0) light(px + Math.sin(time * 13 + e.id) * cell * 0.05, midY, sp.height * cell * 0.45, '#ff7a2f', 0.5 * flicker(e.id, 12));
  if (e.shieldT > 0) shieldBubble(px, midY, sp.height * cell * 0.75, sp.eyeColor);
  if (e.ward > 0) wardShell(e, px, midY, sp.height * cell * 0.62);
  if (e.meltT > 0) light(px, py - sp.height * cell * 0.3, sp.height * cell * 0.45, '#b04aff', 0.3);
  if (stopped) light(px, midY, sp.height * cell * 0.6, '#e8d7a8', 0.35);
  if (e.hardT > 0) light(px, midY, sp.height * cell * 0.7, '#c8c8d8', 0.25);

  // ışıklar ve gözler (sola bakarken yansıtılır)
  if (!e.phased || quality.glow) {
    for (let i = 0; i < sp.lights.length; i++) {
      const l = sp.lights[i];
      light(px + l.x * e.dir * cell * scale, bodyY + l.y * cell * scale, l.r * cell, l.color, 0.55 * flicker(e.id + i));
    }
    const blink = blinkOpen(e.id);
    const eyeA = (e.phased ? 0.6 : 1) * spawn;
    for (const [ex, ey] of sp.eyes) {
      light(px + ex * e.dir * cell * scale, bodyY + ey * cell * scale, sp.eyeR * cell * 3 * blink, sp.eyeColor, eyeA);
    }
  }

  // can barı: boss'ta hep, diğerlerinde yara alınca görünür
  if ((e.boss || e.hp < e.maxHp * 0.999) && !e.phased) hpBar(e, px, bodyY - sp.height * cell * 1.05 - 4, cell);
}

/** Çamur Sürüngeni gömülüyken: kabaran toprak, hafif kıpırtı ve iki soluk göz. */
function drawMound(e, px, py, cell, sp, spawn) {
  identity();
  const w = cell * e.size * 1.6;
  const wob = Math.sin(time * 12 + e.id) * cell * 0.02;
  g.globalAlpha = 0.9 * spawn;
  g.fillStyle = '#2a2014';
  g.beginPath();
  g.ellipse(px + wob, py - cell * 0.04, w, w * 0.38, 0, Math.PI, 0);
  g.fill();
  g.fillStyle = '#4a3a22';
  for (let i = 0; i < 4; i++) {
    const a = Math.PI + (i + 0.5) * (Math.PI / 4);
    g.beginPath();
    g.arc(px + Math.cos(a) * w * 0.8, py - cell * 0.04 + Math.sin(a) * w * 0.3, cell * 0.035, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
  const ex = px + e.dir * w * 0.45;
  light(ex, py - cell * 0.1, cell * 0.06, sp.eyeColor, 0.6);
}

/** Davul aurası: hızlanan düşmanın arkasında turuncu hız çizgileri. */
function hasteStreaks(e, px, py, cell, sp) {
  identity();
  g.strokeStyle = 'rgba(255,170,80,0.55)';
  g.lineWidth = Math.max(1, cell * 0.02);
  for (let i = 0; i < 3; i++) {
    const y = py + (i - 1) * sp.height * cell * 0.22;
    const len = cell * (0.18 + 0.06 * Math.sin(time * 18 + i + e.id));
    const x0 = px - e.dir * sp.height * cell * 0.35;
    g.beginPath();
    g.moveTo(x0, y);
    g.lineTo(x0 - e.dir * len, y);
    g.stroke();
  }
}

/** Ayaz Cadısı'nın buz kalkanı: kalan miktarla incelen buz kabuğu. */
function wardShell(e, px, py, r) {
  identity();
  const k = clamp(e.ward / Math.max(1, e.wardMax), 0, 1);
  g.beginPath();
  g.arc(px, py, r, 0, TAU);
  g.fillStyle = rgba('#bff4ff', 0.08 + 0.12 * k);
  g.fill();
  g.lineWidth = 1 + 2 * k;
  g.strokeStyle = rgba('#d8f6ff', 0.35 + 0.45 * k);
  g.stroke();
  // buz çatlakları
  g.lineWidth = 1;
  g.strokeStyle = rgba('#ffffff', 0.4 * k);
  g.beginPath();
  g.moveTo(px - r * 0.5, py - r * 0.6);
  g.lineTo(px - r * 0.2, py - r * 0.2);
  g.lineTo(px - r * 0.35, py + r * 0.2);
  g.stroke();
}

function footRing(px, py, cell, color, a) {
  identity();
  g.beginPath();
  g.ellipse(px, py, cell * 0.32, cell * 0.12, 0, 0, TAU);
  g.lineWidth = 1.5;
  g.strokeStyle = rgba(color, a);
  g.stroke();
}

function stunStars(px, py, cell, seed) {
  for (let i = 0; i < 3; i++) {
    const a = time * 6 + seed + (i * TAU) / 3;
    light(px + Math.cos(a) * cell * 0.18, py + Math.sin(a) * cell * 0.06, cell * 0.07, '#ffe066', 0.9);
  }
}

function shieldBubble(px, py, r, color) {
  identity();
  const pulse = 0.5 + 0.5 * Math.sin(time * 8);
  g.beginPath();
  g.arc(px, py, r * (1 + pulse * 0.05), 0, TAU);
  g.fillStyle = rgba(color, 0.1 + pulse * 0.06);
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = rgba(color, 0.6 + pulse * 0.3);
  g.stroke();
  light(px, py, r * 1.3, color, 0.25);
}

function hpBar(e, px, py, cell) {
  identity();
  const boss = e.boss;
  const w = (boss ? 1.5 : FEEL.hpBar.width) * cell * (boss ? 1 : Math.max(0.75, e.size * 2.2));
  const h = boss ? 6 : 4;
  const x = px - w / 2;
  const ratio = clamp(e.hp / e.maxHp, 0, 1);
  const shown = clamp(e.hpShown / e.maxHp, 0, 1);
  g.fillStyle = 'rgba(6,3,6,0.85)';
  g.fillRect(x - 1.5, py - 1.5, w + 3, h + 3);
  if (shown > ratio) {
    g.fillStyle = '#ffd27a'; // az önce kaybedilen parça
    g.fillRect(x, py, w * shown, h);
  }
  g.fillStyle = e.pStacks > 0 ? '#6fd14a' : ratio > 0.5 ? '#d9293b' : ratio > 0.25 ? '#e0602a' : '#ff3b2e';
  g.fillRect(x, py, w * ratio, h);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(x, py, w * ratio, 1);
  if (boss) {
    g.lineWidth = 1;
    g.strokeStyle = rgba(THEME.gold, 0.8);
    g.strokeRect(x - 1.5, py - 1.5, w + 3, h + 3);
  }
}

/* --------------------------------------------------------------------------
 * 7. MERMİLER
 * ------------------------------------------------------------------------ */
function drawProjectiles() {
  const cell = state.view.cell;
  for (const p of projectiles) {
    const px = sx(p.x);
    const py = sy(p.y);
    switch (p.kind) {
      case 'arrow': {
        identity();
        const c = Math.cos(p.angle);
        const s = Math.sin(p.angle);
        const L = cell * 0.26;
        const gold = p.crit || p.mastery === 0;
        g.lineWidth = Math.max(1.2, cell * 0.035);
        g.strokeStyle = gold ? '#ffd27a' : '#cbb89a';
        g.beginPath();
        g.moveTo(px - c * L, py - s * L);
        g.lineTo(px, py);
        g.stroke();
        g.strokeStyle = '#e9e1d3';
        g.lineWidth = Math.max(1, cell * 0.025);
        g.beginPath();
        g.moveTo(px - c * L, py - s * L);
        g.lineTo(px - c * L * 0.8 - s * cell * 0.05, py - s * L * 0.8 + c * cell * 0.05);
        g.stroke();
        if (gold) light(px, py, cell * 0.25, '#ffd27a', 0.7);
        break;
      }
      case 'lance': {
        identity();
        g.save();
        g.translate(px, py);
        g.rotate(p.angle);
        const L = cell * (p.mastery === 0 ? 0.5 : 0.42);
        g.lineCap = 'round';
        g.strokeStyle = '#1a120c';
        g.lineWidth = Math.max(2, cell * 0.06);
        g.beginPath();
        g.moveTo(-L, 0);
        g.lineTo(L * 0.6, 0);
        g.stroke();
        g.strokeStyle = '#9a7a4a';
        g.lineWidth = Math.max(1.2, cell * 0.035);
        g.stroke();
        g.fillStyle = p.mastery === 1 ? '#d8dee6' : '#e8eef4';
        g.beginPath();
        g.moveTo(L, 0);
        g.lineTo(L * 0.55, -cell * 0.06);
        g.lineTo(L * 0.55, cell * 0.06);
        g.closePath();
        g.fill();
        if (p.mastery === 1) {
          g.strokeStyle = 'rgba(200,180,140,0.6)';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(-L, 0);
          g.lineTo(-L - cell * 0.6, cell * 0.04);
          g.stroke();
        }
        g.restore();
        light(px, py, cell * 0.22, '#ffe2b0', 0.35);
        break;
      }
      case 'bullet': {
        identity();
        const c = Math.cos(p.angle);
        const s2 = Math.sin(p.angle);
        const L = cell * 0.5;
        const grd = g.createLinearGradient(px - c * L, py - s2 * L, px, py);
        grd.addColorStop(0, 'rgba(232,215,168,0)');
        grd.addColorStop(1, p.crit ? 'rgba(255,90,90,0.95)' : 'rgba(232,215,168,0.95)');
        g.strokeStyle = grd;
        g.lineWidth = Math.max(1.5, cell * 0.04);
        g.beginPath();
        g.moveTo(px - c * L, py - s2 * L);
        g.lineTo(px, py);
        g.stroke();
        light(px, py, cell * 0.2, p.crit ? '#ff5a5a' : '#e8d7a8', 0.6);
        break;
      }
      case 'shard':
        identity();
        g.save();
        g.translate(px, py);
        g.rotate(p.angle);
        g.fillStyle = '#d8f8ff';
        g.beginPath();
        g.moveTo(cell * 0.12, 0);
        g.lineTo(0, cell * 0.045);
        g.lineTo(-cell * 0.1, 0);
        g.lineTo(0, -cell * 0.045);
        g.closePath();
        g.fill();
        g.restore();
        light(px, py, cell * 0.3, '#a6ecff', 0.8);
        break;
      case 'shell':
      case 'glob': {
        const z = p.z * cell;
        identity();
        const sh = S.shadowSprite();
        const sr = cell * (0.14 - Math.min(0.06, p.z * 0.04));
        g.globalAlpha = 0.7;
        g.drawImage(sh, px - sr, py - sr * 0.4, sr * 2, sr * 0.8);
        g.globalAlpha = 1;
        const glob = p.kind === 'glob';
        const col = glob ? (p.mastery === 1 ? '#9a4fd0' : '#7dff5a') : p.mastery === 0 ? '#ff5a1f' : '#3a3640';
        const r = cell * (glob ? 0.08 : 0.095);
        g.fillStyle = col;
        g.beginPath();
        g.arc(px, py - z, r, 0, TAU);
        g.fill();
        g.lineWidth = 1;
        g.strokeStyle = 'rgba(0,0,0,0.7)';
        g.stroke();
        light(px, py - z, cell * (glob ? 0.3 : 0.24), glob ? col : '#ff9a3a', glob ? 0.6 : 0.5);
        break;
      }
      default:
        break;
    }
  }
}

/* --------------------------------------------------------------------------
 * 8. PARTİKÜLLER — particles.js sözleşmesine göre
 * ------------------------------------------------------------------------ */
const flameCache = new Map();
function flameColor(c1, c2, t) {
  const step = t < 0.33 ? 0 : t < 0.66 ? 1 : 2;
  const key = c1 + c2 + step;
  let c = flameCache.get(key);
  if (!c) {
    c = mixHex(c1, c2, step / 2);
    flameCache.set(key, c);
  }
  return c;
}

function drawParticles(layer) {
  const cell = state.view.cell;
  const list = fx.particles;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.layer !== layer || p.delay > 0) continue;
    const t = fx.progress(p);
    let a = p.fadeLate ? p.a0 * (t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3) : lerp(p.a0, p.a1, t);
    if (a <= 0.01) continue;
    const size = lerp(p.size0, p.size1, t) * cell;
    const px = sx(p.x);
    const py = sy(p.y) - p.z * cell;
    switch (p.shape) {
      case 'glow':
      case 'ember':
      case 'wisp':
        light(px, py, size * (p.shape === 'glow' ? 1 : 3), p.color, a);
        if (p.shape === 'wisp') light(px, py + size * 2, size * 1.6, p.color, a * 0.4);
        break;
      case 'flame':
        light(px, py, size * 2.2, flameColor(p.color, p.color2, t), a);
        break;
      case 'smoke':
      case 'mist':
      case 'stain': {
        identity();
        const sp = S.smokeSprite(p.color);
        if (p.blend === 'add') g.globalCompositeOperation = 'lighter';
        g.globalAlpha = a;
        const ry = p.shape === 'stain' ? 0.55 : 1;
        g.drawImage(sp, px - size, py - size * ry, size * 2, size * 2 * ry);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        break;
      }
      case 'spark': {
        identity();
        const len = Math.hypot(p.vx, p.vy) * p.len * cell * 2 + size;
        const ang = Math.atan2(p.vy, p.vx);
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = a;
        g.strokeStyle = p.color;
        g.lineWidth = Math.max(1, size);
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px - Math.cos(ang) * len, py - Math.sin(ang) * len);
        g.stroke();
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        break;
      }
      case 'ring':
        identity();
        if (p.blend === 'add') g.globalCompositeOperation = 'lighter';
        g.globalAlpha = a;
        g.strokeStyle = p.color;
        g.lineWidth = Math.max(1, p.width * cell * (1 - t * 0.6));
        g.beginPath();
        g.ellipse(px, py, size, size * 0.62, 0, 0, TAU);
        g.stroke();
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        break;
      case 'debris':
      case 'shard': {
        setLocal(Math.cos(p.rot), Math.sin(p.rot), -Math.sin(p.rot), Math.cos(p.rot), px, py);
        if (p.blend === 'add') g.globalCompositeOperation = 'lighter';
        g.globalAlpha = a;
        g.fillStyle = p.color;
        if (p.shape === 'shard') {
          g.beginPath();
          g.moveTo(size, 0);
          g.lineTo(-size * 0.6, size * 0.5);
          g.lineTo(-size * 0.6, -size * 0.5);
          g.closePath();
          g.fill();
        } else {
          g.fillRect(-size / 2, -size / 2, size, size);
        }
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        break;
      }
      case 'bubble':
        identity();
        g.globalAlpha = a;
        g.strokeStyle = p.color;
        g.lineWidth = 1.2;
        g.beginPath();
        g.arc(px, py, Math.max(1, size), 0, TAU);
        g.stroke();
        g.globalAlpha = 1;
        break;
      case 'coin': {
        identity();
        const spin = Math.abs(Math.cos(time * 9 + p.rot));
        g.globalAlpha = a;
        g.fillStyle = p.color;
        g.beginPath();
        g.ellipse(px, py, Math.max(0.8, size * spin), size, 0, 0, TAU);
        g.fill();
        g.globalAlpha = 1;
        light(px, py, size * 2.5, p.color, a * 0.5);
        break;
      }
      case 'pillar': {
        identity();
        const h = p.len * cell * (0.6 + 0.4 * (1 - t));
        const w = size;
        const grd = g.createLinearGradient(0, py - h, 0, py);
        grd.addColorStop(0, rgba(p.color, 0));
        grd.addColorStop(0.7, rgba(p.color, a * 0.6));
        grd.addColorStop(1, rgba('#ffffff', a));
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = grd;
        g.fillRect(px - w / 2, py - h, w, h);
        g.globalCompositeOperation = 'source-over';
        break;
      }
      case 'bolt':
        drawBolt(p, a, cell);
        break;
      default:
        break;
    }
  }
}

function drawBolt(p, a, cell) {
  identity();
  const pts = p.pts;
  if (!pts) return;
  g.globalCompositeOperation = 'lighter';
  for (const [w, color, alpha] of BOLT_STYLE) {
    g.globalAlpha = a * alpha;
    g.strokeStyle = color === 'c' ? p.color : color;
    g.lineWidth = Math.max(1, w * cell);
    g.beginPath();
    g.moveTo(sx(pts[0]), sy(pts[1]));
    for (let i = 1; i < fx.BOLT_POINTS; i++) g.lineTo(sx(pts[i * 2]), sy(pts[i * 2 + 1]));
    g.stroke();
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  light(sx(pts[0]), sy(pts[1]), cell * 0.35, p.color, a * 0.7);
}
const BOLT_STYLE = [[0.14, 'c', 0.35], [0.06, 'c', 0.8], [0.022, '#ffffff', 1]];

/* --------------------------------------------------------------------------
 * 9. ATMOSFER — karanlık, sis, metin, tehlike
 * ------------------------------------------------------------------------ */
function drawFog(a) {
  identity();
  const cell = state.view.cell;
  const sp = S.smokeSprite(state.map?.theme?.fog ?? '#6c5b8a');
  g.globalAlpha = a;
  for (let i = 0; i < 4; i++) {
    const x = ((time * (0.08 + i * 0.015) + i * 1.9) % (GRID.cols + 6)) - 3;
    const y = (i * 2.9 + Math.sin(time * 0.2 + i) * 0.8) % GRID.rows;
    const r = cell * (2.2 + (i % 3) * 0.6);
    g.drawImage(sp, sx(x) - r, sy(y) - r * 0.6, r * 2, r * 1.2);
  }
  g.globalAlpha = 1;
}

const TEXT_STYLE = {
  dmg: { px: 12, weight: 700 },
  crit: { px: 15, weight: 800 },
  dot: { px: 10, weight: 600 },
  soul: { px: 11, weight: 700 },
  loss: { px: 22, weight: 800 },
  info: { px: 12, weight: 700 },
};
const fontCache = {};
const fontFor = (style) => (fontCache[style] ??= `${TEXT_STYLE[style].weight} ${TEXT_STYLE[style].px}px ${FONTS.body}`);

function drawTexts() {
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  for (const t of fx.texts) {
    if (t.alpha <= 0.01) continue;
    const px = sx(t.x) + t.offX;
    const py = sy(t.y) + t.offY;
    setLocal(t.scale, 0, 0, t.scale, px, py);
    g.font = fontFor(t.style);
    g.globalAlpha = t.alpha;
    g.lineWidth = t.style === 'loss' ? 5 : 3.2;
    g.strokeStyle = 'rgba(8,4,8,0.9)';
    g.strokeText(t.str, 0, 0);
    g.fillStyle = t.color;
    g.fillText(t.str, 0, 0);
  }
  g.globalAlpha = 1;
}

/** Az can kalınca kenarlarda nabız gibi atan kırmızılık. */
function drawDanger() {
  const run = state.run;
  if (!run || state.scene !== 'game' || run.over === 'victory') return;
  const ratio = run.lives / run.maxLives;
  if (ratio > 0.3) return;
  const beat = 0.5 + 0.5 * Math.sin(time * (ratio < 0.15 ? 7 : 4.5));
  const a = (0.3 - ratio) * 1.4 * (0.55 + 0.45 * beat);
  identity();
  const grd = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
  grd.addColorStop(0, 'rgba(179,18,46,0)');
  grd.addColorStop(1, `rgba(179,18,46,${clamp(a, 0, 0.5)})`);
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
}

function drawFps() {
  identity();
  g.font = `600 11px ${FONTS.body}`;
  g.textAlign = 'left';
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillRect(state.view.inset.left + 4, state.view.inset.top + 4, 58, 16);
  g.fillStyle = fps < 45 ? '#ff9a6a' : THEME.ok;
  g.fillText(`${Math.round(fps)} FPS`, state.view.inset.left + 9, state.view.inset.top + 13);
}

/* --------------------------------------------------------------------------
 * 10. ANA MENÜ SAHNESİ
 *  Kamera Kül Vadisi'nin üstünde yavaşça süzülür; yolda ölüler alayı
 *  yürür, kuleler başlarını onlara çevirir, korlar yükselir.
 * ------------------------------------------------------------------------ */
let menuMap = null;
let menuTowers = [];
let ghosts = [];

/** Ana menünün sahnesi, açık olan en son bölümün haritası ve kuleleriyle kurulur. */
function menuSetup(def) {
  menuMap = createMap(def.id);
  menuTowers = def.showcase.map((t, i) => ({ ...t, id: 900 + i, x: t.c + 0.5, y: t.r + 0.5, angle: -Math.PI / 2, recoil: 0, buildT: 1, flash: 0, silenced: 0, cooldown: 1, beam: null, bRate: 0, bDmg: 0, bRange: 0 }));
  ghosts = def.procession.map((type, i) => ({
    type, id: 800 + i, wave: 0, path: i % menuMap.polys.length, x: 0, y: 0, angle: 0, seg: 0, dir: 1, walk: i * 0.37, d: 0,
    spawnT: 1, phased: false, freezeT: 0, slowT: 0, stunT: 0, stopT: 0, pStacks: 0, burnT: 0, shieldT: 0, ward: 0, hardT: 0,
    enraged: false, cursed: false, flash: 0, hp: 1, maxHp: 1, hpShown: 1, lastHit: -99, boss: false,
    size: ENEMIES[type].size, flying: ENEMIES[type].flying,
  }));
}
let emberT = 0;

function drawMenuScene(dt, quality) {
  const want = latestChapter();
  if (!menuMap || menuMap.id !== want.id) menuSetup(want);
  const savedMap = state.map;
  const savedRun = state.run;
  state.map = menuMap;
  state.run = null;
  try {
    drawMenuContents(dt, quality);
  } finally {
    // çizimde bir hata olsa bile oyunun durumu geri yüklenir
    state.map = savedMap;
    state.run = savedRun;
  }
}

function drawMenuContents(dt, quality) {

  // süzülen kamera
  const v = state.view;
  const cell = baseCell * 1.45;
  const cy = 7.5 + Math.sin(time * 0.045) * 5.2;
  const cx = 4.5 + Math.sin(time * 0.031) * 0.7;
  v.cell = cell;
  v.ox = W / 2 - cx * cell;
  v.oy = H * 0.56 - cy * cell;

  setBase(false);
  atIdentity = false;
  drawMapLayer();

  // alay ilerler
  for (let i = 0; i < ghosts.length; i++) {
    const e = ghosts[i];
    const poly = menuMap.polys[e.path];
    const speed = ENEMIES[e.type].speed * 0.45;
    e.d = (((time * speed + i * 4.1) % poly.length) + poly.length) % poly.length;
    samplePolyline(poly, e.d, e);
    const c = Math.cos(e.angle);
    if (c > 0.2) e.dir = 1;
    else if (c < -0.2) e.dir = -1;
    e.walk = e.d * 1.8;
    e.phased = !!ENEMIES[e.type].phase && Math.sin(time * 0.9 + i) > 0.75;
  }
  // kuleler en yakın yürüyene bakar
  for (const t of menuTowers) {
    let best = null;
    let bd = 9;
    for (const e of ghosts) {
      const d = Math.hypot(e.x - t.x, e.y - t.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best) {
      const want = Math.atan2(best.y - t.y, best.x - t.x);
      t.angle += angleDelta(t.angle, want) * Math.min(1, dt * 2);
    }
  }
  drawList.length = 0;
  for (const t of menuTowers) drawList.push(t);
  for (const e of ghosts) drawList.push(e);
  drawList.sort(byDepth);
  for (const o of drawList) {
    if (o.wave !== undefined) drawEnemy(o, quality);
    else drawTower(o, quality);
  }
  for (const t of menuTowers) if (t.type === 'curse') drawCurseRune(t);

  // bölümün havası: kül vadisinde aşağıdan yükselen korlar, diğerlerinde kendi zerreleri
  const kind = menuMap.theme.ambient;
  if (kind === 'ash') {
    emberT -= dt;
    while (emberT <= 0) {
      emberT += quality.id === 'low' ? 0.25 : 0.08;
      const wx = (rng.range(0, W) - v.ox) / cell;
      const wy = (H * 1.02 - v.oy) / cell;
      fx.ambientEmber(wx, wy, rng.chance(0.2) ? '#ff3b4e' : THEME.ember);
    }
  } else {
    ambientTick(dt * 1.6, quality, kind);
  }
  drawParticles('top');
  if (quality.fog) drawFog(0.1);
  drawOverlay(0.38);
  drawMapLights();
  flushLights();
}

