/* ==========================================================================
 *  SOULGATE — utils.js
 *  Sorumluluk : Saf yardımcılar — matematik, açı, yumuşatma (easing),
 *               rastgelelik, gürültü, renk, yol geometrisi, biçimlendirme,
 *               nesne havuzu ve zamanlama.
 *  Bağımlılık : YOK. Hiçbir modülü import etmez, oyun durumu tutmaz.
 *               (Yalnızca renk dizgileri için sınırlı bir önbellek ve etkin
 *               dilin sayı yazım kuralı vardır.)
 *  Performans : Sık çağrılan fonksiyonlar bellek ayırmaz; sonuç döndürmesi
 *               gerekenler isteğe bağlı bir "out" nesnesini doldurur.
 * ========================================================================== */

export const TAU = Math.PI * 2;
export const noop = () => {};

/* --------------------------------------------------------------------------
 * 1. TEMEL MATEMATİK
 * ------------------------------------------------------------------------ */
export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (a === b ? 0 : (v - a) / (b - a));

/** v'yi [a1,b1] aralığından [a2,b2] aralığına taşır (varsayılan: sınırlı). */
export function remap(v, a1, b1, a2, b2, clamped = true) {
  const t = invLerp(a1, b1, v);
  return lerp(a2, b2, clamped ? clamp01(t) : t);
}

/** Kare hızından bağımsız yumuşak takip. rate büyüdükçe hedefe daha hızlı varır. */
export function damp(current, target, rate, dt) {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

/** Hedefe en fazla maxDelta kadar yaklaşır, aşmaz. */
export function approach(current, target, maxDelta) {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

export const dist2 = (x1, y1, x2, y2) => (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
export const dist = (x1, y1, x2, y2) => Math.sqrt(dist2(x1, y1, x2, y2));

/* --------------------------------------------------------------------------
 * 2. AÇILAR — kulelerin hedefe yumuşakça dönmesi için
 * ------------------------------------------------------------------------ */
/** Açıyı (-π, π] aralığına sarar. */
export function wrapAngle(a) {
  a %= TAU;
  if (a <= -Math.PI) a += TAU;
  else if (a > Math.PI) a -= TAU;
  return a;
}

/** from'dan to'ya en kısa yönlü açı farkı. */
export const angleDelta = (from, to) => wrapAngle(to - from);

/** Açıyı hedefe en fazla maxStep radyan döndürür (en kısa yoldan). */
export function rotateTowards(current, target, maxStep) {
  const d = angleDelta(current, target);
  if (Math.abs(d) <= maxStep) return target;
  return wrapAngle(current + Math.sign(d) * maxStep);
}

/** Açılar için kare hızından bağımsız yumuşak takip. */
export function dampAngle(current, target, rate, dt) {
  return wrapAngle(current + angleDelta(current, target) * (1 - Math.exp(-rate * dt)));
}

/* --------------------------------------------------------------------------
 * 3. YUMUŞATMA EĞRİLERİ — t: 0..1 → 0..1 (outBack/outElastic hafif taşar)
 * ------------------------------------------------------------------------ */
export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outQuart: (t) => 1 - (1 - t) ** 4,
  outExpo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  outBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  outElastic: (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;
  },
  /** 0'dan başlar, ortada 1'e çıkar, 0'a döner — parlama/nabız için. */
  bell: (t) => Math.sin(Math.PI * clamp01(t)),
};

/* --------------------------------------------------------------------------
 * 4. RASTGELELİK
 *  rng            → Math.random tabanlı, oyun içi genel kullanım
 *  createRng(seed)→ tohumlu ve tekrarlanabilir (harita süsü, müzik)
 *  İkisi de aynı arayüze sahiptir, birbirinin yerine kullanılabilir.
 * ------------------------------------------------------------------------ */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(next) {
  return {
    next,
    /** [min, max) aralığında ondalık sayı */
    range: (min, max) => min + (max - min) * next(),
    /** [min, max] aralığında tam sayı (iki uç dahil) */
    int: (min, max) => min + Math.floor((max - min + 1) * next()),
    pick: (arr) => arr[Math.floor(arr.length * next())],
    chance: (p) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
    /** v ± amount aralığında rastgele değer */
    spread: (v, amount) => v + (next() * 2 - 1) * amount,
  };
}

export const rng = makeRng(Math.random);
export const createRng = (seed) => makeRng(mulberry32(seed));

/** Metinden kararlı 32 bit tohum üretir (FNV-1a). */
export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Fisher–Yates; diziyi yerinde karıştırır ve döndürür. */
export function shuffle(arr, r = rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = r.int(0, i);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/* --------------------------------------------------------------------------
 * 5. GÜRÜLTÜ — titreyen meşaleler, nefes alan gözler, sisli zemin
 *  Saklama gerektirmez: aynı girdi her zaman aynı çıktıyı verir.
 * ------------------------------------------------------------------------ */
/** İki tam sayıdan 0..1 arası kararlı değer (zemin dokusu varyasyonu için). */
export function hash2(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Yumuşak 1B gürültü, 0..1. t zamanla artırılınca organik dalgalanma verir. */
export function noise1(t, seed = 0) {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash2(i, seed), hash2(i + 1, seed), u);
}

/* --------------------------------------------------------------------------
 * 6. RENK — canvas için "rgba(...)" dizgileri
 *  Alfa 0.01 adımına yuvarlanır; önbellek renk başına en fazla 101 kayıt tutar.
 * ------------------------------------------------------------------------ */
const rgbCache = new Map();
const rgbaCache = new Map();

/** "#rgb" veya "#rrggbb" → {r, g, b} (sonuç önbelleklenir, değiştirmeyin). */
export function hexToRgb(hex) {
  let rgb = rgbCache.get(hex);
  if (rgb) return rgb;
  let h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  rgb = Object.freeze({ r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 });
  rgbCache.set(hex, rgb);
  return rgb;
}

/** Onaltılık renk + alfa → "rgba(r,g,b,a)" */
export function rgba(hex, alpha) {
  const a = Math.round(clamp01(alpha) * 100);
  const key = hex + a;
  let out = rgbaCache.get(key);
  if (out === undefined) {
    const { r, g, b } = hexToRgb(hex);
    out = `rgba(${r},${g},${b},${a / 100})`;
    rgbaCache.set(key, out);
  }
  return out;
}

const toHex2 = (v) => {
  const s = Math.round(clamp(v, 0, 255)).toString(16);
  return s.length === 1 ? '0' + s : s;
};

/** İki rengi t oranında karıştırır → "#rrggbb" */
export function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return '#' + toHex2(lerp(A.r, B.r, t)) + toHex2(lerp(A.g, B.g, t)) + toHex2(lerp(A.b, B.b, t));
}

/** amount > 0 açar (beyaza), amount < 0 koyulaştırır (siyaha). Aralık: -1..1 */
export function shadeHex(hex, amount) {
  return amount >= 0 ? mixHex(hex, '#ffffff', amount) : mixHex(hex, '#000000', -amount);
}

/* --------------------------------------------------------------------------
 * 7. YOL GEOMETRİSİ
 *  Düşmanlar yol üzerindeki "kat edilen mesafe" (d) ile tutulur;
 *  konumları her karede samplePolyline ile bulunur. Bu, "kaleye en yakın"
 *  hedeflemeyi tek bir sayı karşılaştırmasına indirir.
 * ------------------------------------------------------------------------ */
/**
 * Köşe noktalarından yol oluşturur.
 * @param {number[][]} points  [[x,y], ...]
 * @param {number} offset      her koordinata eklenir (hücre merkezi için 0.5)
 */
export function buildPolyline(points, offset = 0) {
  const pts = points.map(([x, y]) => ({ x: x + offset, y: y + offset }));
  const segs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    segs.push({
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      len,
      start: total,
      dx: (b.x - a.x) / len,
      dy: (b.y - a.y) / len,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    });
    total += len;
  }
  return Object.freeze({ points: pts, segs, length: total });
}

function findSegment(segs, d) {
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid].start <= d) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Yol üzerinde d mesafesindeki noktayı "out" nesnesine yazar.
 * out: { x, y, angle, seg } — bellek ayırmamak için yeniden kullanın.
 */
export function samplePolyline(poly, d, out = { x: 0, y: 0, angle: 0, seg: 0 }) {
  const segs = poly.segs;
  const dd = clamp(d, 0, poly.length);
  const i = findSegment(segs, dd);
  const s = segs[i];
  const local = dd - s.start;
  out.x = s.x1 + s.dx * local;
  out.y = s.y1 + s.dy * local;
  out.angle = s.angle;
  out.seg = i;
  return out;
}

/**
 * Yatay/dikey köşe noktalarından geçilen tüm ızgara hücrelerini verir.
 * Çapraz parça varsa hata fırlatır (ızgara yolu yalnızca dik açılı olabilir).
 * @returns {number[][]} [[sütun, satır], ...] — tekrar etmeyen, yol sırasıyla
 */
export function polylineCells(points) {
  const out = [];
  const seen = new Set();
  const push = (c, r) => {
    const k = c + ',' + r;
    if (!seen.has(k)) {
      seen.add(k);
      out.push([c, r]);
    }
  };
  push(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    if (x1 !== x2 && y1 !== y2) {
      throw new Error(`polylineCells: çapraz parça [${x1},${y1}] → [${x2},${y2}]`);
    }
    const sx = Math.sign(x2 - x1);
    const sy = Math.sign(y2 - y1);
    let x = x1;
    let y = y1;
    while (x !== x2 || y !== y2) {
      x += sx;
      y += sy;
      push(x, y);
    }
  }
  return out;
}

/* --------------------------------------------------------------------------
 * 8. IZGARA
 * ------------------------------------------------------------------------ */
export const cellIndex = (c, r, cols) => r * cols + c;
export const inBounds = (c, r, cols, rows) => c >= 0 && r >= 0 && c < cols && r < rows;

/* --------------------------------------------------------------------------
 * 9. BİÇİMLENDİRME — etkin dilin sayı yazımıyla
 *  Türkçe: 12.351 · 2,5 · %25 · 1,4 sn    İngilizce: 12,351 · 2.5 · 25% · 1.4 s
 *  Dil değişince i18n.js setNumberStyle() ile kuralı değiştirir.
 * ------------------------------------------------------------------------ */
const numberStyle = { thousands: '.', decimal: ',', percentFirst: true, seconds: ' sn' };

/** Sayı yazım kuralını değiştirir (yalnızca i18n.js çağırır). */
export function setNumberStyle(style) {
  Object.assign(numberStyle, style);
}

const decimal = (v, digits) => v.toFixed(digits).replace('.', numberStyle.decimal);
const percent = (s) => (numberStyle.percentFirst ? '%' + s : s + '%');

/** Binlik ayırıcılı tam sayı: 12351 → "12.351" / "12,351" (Intl gerektirmez, çevrimdışı güvenli) */
export function formatInt(n) {
  const v = Math.round(n);
  const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, numberStyle.thousands);
  return v < 0 ? '-' + s : s;
}

/**
 * Kule paneli istatistikleri için (config STAT_LABELS.fmt değerleri):
 * 'int' | 'dec1' | 'pct' | 'pct1' | 'sec' | 'mult' (×2,5) | 'deg' (yarım açı → toplam derece)
 */
export function formatValue(v, fmt) {
  switch (fmt) {
    case 'int': return formatInt(v);
    case 'dec1': return decimal(v, 1);
    case 'pct': return percent(String(Math.round(v * 100)));
    case 'pct1': return percent(decimal(v * 100, 1));
    case 'sec': return decimal(v, 1) + numberStyle.seconds;
    case 'mult': return '×' + (Number.isInteger(v) ? String(v) : decimal(v, 1));
    case 'deg': return Math.min(360, Math.round((v * 2 * 180) / Math.PI)) + '°';
    default: return String(v);
  }
}

/** Saniye → "d:ss" */
export function formatTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + (r < 10 ? '0' + r : r);
}

/** "Dalga {n}" + {n: 5} → "Dalga 5". Bilinmeyen anahtarlar olduğu gibi kalır. */
export function template(str, vars) {
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/* --------------------------------------------------------------------------
 * 10. DİZİLER VE HAVUZ
 * ------------------------------------------------------------------------ */
/** O(1) silme: son elemanı i'nin yerine koyar. Sıra korunmaz. */
export function swapRemove(arr, i) {
  const last = arr.length - 1;
  if (i !== last) arr[i] = arr[last];
  arr.length = last;
}

/**
 * Basit nesne havuzu: sık yaratılıp yok edilen nesneleri yeniden kullanır,
 * çöp toplayıcının oyun ortasında takılmasını önler.
 * @param {() => object} factory  yeni nesne üretir
 * @param {number} prewarm        başta hazırlanacak nesne sayısı
 */
export function createPool(factory, prewarm = 0) {
  const free = [];
  for (let i = 0; i < prewarm; i++) free.push(factory());
  return {
    acquire: () => (free.length > 0 ? free.pop() : factory()),
    release: (obj) => {
      free.push(obj);
    },
    /** Havuzda bekleyen nesne sayısı */
    available: () => free.length,
    /** Bekleyen nesneleri bırakır (yeniden başlatmada belleği küçültmek için) */
    drain: () => {
      free.length = 0;
    },
  };
}

/* --------------------------------------------------------------------------
 * 11. ZAMANLAMA
 * ------------------------------------------------------------------------ */
export const nowSec = () => performance.now() / 1000;

/**
 * Son çağrıdan ms milisaniye sonra fn'i bir kez çalıştırır.
 * .flush() bekleyen çağrıyı hemen yapar (sayfa kapanırken kayıt için),
 * .cancel() bekleyen çağrıyı iptal eder.
 */
export function debounce(fn, ms) {
  let timer = null;
  let pendingArgs = null;
  const run = () => {
    timer = null;
    const args = pendingArgs;
    pendingArgs = null;
    fn(...args);
  };
  const debounced = (...args) => {
    pendingArgs = args;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(run, ms);
  };
  debounced.flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    run();
  };
  debounced.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pendingArgs = null;
  };
  return debounced;
}
