/* ==========================================================================
 *  SOULGATE — i18n.js
 *  Sorumluluk : Dil paketleri, etkin dil ve metin okuma.
 *  Bağımlılık : utils (sayı yazımı) · lang/tr, lang/en (saf veri).
 *
 *  NASIL ÇALIŞIR
 *   text('towers.archer.name') etkin dildeki metni verir. Bir dilde eksik
 *   olan anahtar Türkçe başvuru paketinden okunur; o da yoksa anahtarın
 *   kendisi döner (hata ekrana "towers.archer.name" diye çıkar, gözden kaçmaz).
 *
 *   live(...) ve section(...) "canlı" metin alanları üretir: alan her
 *   okunduğunda etkin dile bakar. config.js tabloları (TOWERS[x].name vb.)
 *   ve arayüzün kısa metinleri bu yolla dil değişince kendiliğinden değişir;
 *   onları okuyan kodun dilden haberi olması gerekmez.
 *
 *   Dili yalnızca state.js değiştirir (ayar 'lang' → setLanguage); arayüz
 *   EV.SETTINGS('lang') olayında kendini yeniden yazar.
 * ========================================================================== */

import { setNumberStyle } from './utils.js';
import tr from './lang/tr.js';
import en from './lang/en.js';

/* Bayraklar: dosya yok, çevrimdışı çalışır. Oranlar resmi ölçülere göre. */
const FLAG_TR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -30000 90000 60000"><path fill="#e30a17" d="M0-30000h90000v60000H0z"/><path fill="#fff" d="m41750 0 13568-4408-8386 11541v-14266l8386 11541zm925 8021a15000 15000 0 1 1 0-16042 12000 12000 0 1 0 0 16042z"/></svg>';
const FLAG_GB = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice"><clipPath id="s"><path d="M0 0v30h60V0z"/></clipPath><clipPath id="t"><path d="M30 15h30v15zv15H0zH0V0zV0h30z"/></clipPath><g clip-path="url(#s)"><path d="M0 0v30h60V0z" fill="#012169"/><path d="M0 0l60 30m0-30L0 30" stroke="#fff" stroke-width="6"/><path d="M0 0l60 30m0-30L0 30" clip-path="url(#t)" stroke="#C8102E" stroke-width="4"/><path d="M30 0v30M0 15h60" stroke="#fff" stroke-width="10"/><path d="M30 0v30M0 15h60" stroke="#C8102E" stroke-width="6"/></g></svg>';
const dataUri = (svg) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

/** Seçilebilir diller. Ad, her zaman kendi dilinde yazılır. */
export const LANGUAGES = Object.freeze([
  Object.freeze({ id: 'tr', name: 'Türkçe', html: 'tr', flag: dataUri(FLAG_TR) }),
  Object.freeze({ id: 'en', name: 'English', html: 'en', flag: dataUri(FLAG_GB) }),
]);
export const LANGUAGE_IDS = Object.freeze(LANGUAGES.map((l) => l.id));
export const FALLBACK_LANGUAGE = 'en'; // tarayıcı dili desteklenmiyorsa

const REFERENCE = 'tr';
const PACKS = { tr, en };

/* Her paketi bir kez düzleştir: 'a.b.c' → değer (hızlı okuma). */
function flatten(obj, prefix, out) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : String(k);
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out.set(key, Array.isArray(v) ? Object.freeze(v.slice()) : v);
  }
  return out;
}
const FLAT = Object.fromEntries(Object.entries(PACKS).map(([id, p]) => [id, flatten(p, '', new Map())]));

let current = REFERENCE;
let flat = FLAT[REFERENCE];
setNumberStyle(PACKS[REFERENCE].meta.numbers);

/** Etkin dilin kimliği ('tr' | 'en'). */
export const language = () => current;

/**
 * Etkin dili değiştirir. Bilinmeyen kimlik yok sayılır.
 * @returns {boolean} gerçekten değiştiyse true
 */
export function setLanguage(id) {
  if (!FLAT[id] || id === current) return false;
  current = id;
  flat = FLAT[id];
  setNumberStyle(PACKS[id].meta.numbers);
  return true;
}

/** Tarayıcının dil tercihlerinden desteklenen ilk dili seçer. */
export function detectLanguage(prefs) {
  const list = prefs ?? (globalThis.navigator ? navigator.languages ?? [navigator.language] : []);
  for (const raw of list) {
    const base = String(raw || '').toLowerCase().split(/[-_]/)[0];
    if (FLAT[base]) return base;
  }
  return FALLBACK_LANGUAGE;
}

/**
 * Metni okur. vars verilirse {ad} yerlerini doldurur.
 * fallback verilirse anahtar hiçbir pakette yokken o döner (isteğe bağlı metinler için).
 */
export function text(key, vars, fallback) {
  let v = flat.get(key);
  if (v === undefined) v = FLAT[REFERENCE].get(key);
  if (v === undefined) return fallback !== undefined ? fallback : key;
  if (vars && typeof v === 'string') v = v.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return v;
}

/**
 * obj üzerindeki alanları canlı yapar: obj[alan] → text(`${base}.${alan}`).
 * optional: pakette olmayabilecek alanlar ('' döner).
 */
export function live(obj, base, fields, optional = []) {
  for (const f of fields) {
    const key = `${base}.${f}`;
    const fb = optional.includes(f) ? '' : undefined;
    Object.defineProperty(obj, f, { get: () => text(key, undefined, fb), enumerable: true, configurable: false });
  }
  return obj;
}

/** Tek bir canlı metin alanı (anahtar adla aynı değilse). */
export function liveField(obj, field, key, fallback) {
  Object.defineProperty(obj, field, { get: () => text(key, undefined, fallback), enumerable: true, configurable: false });
  return obj;
}

/**
 * Paketin bir bölümünü aynı biçimde, canlı alanlı bir nesne olarak verir:
 * section('ui').noSouls → etkin dilde "Yetersiz ruh" / "Not enough souls".
 * Biçim, başvuru paketinden (Türkçe) alınır.
 */
export function section(base) {
  const build = (shape, prefix) => {
    const out = {};
    for (const [k, v] of Object.entries(shape)) {
      const key = `${prefix}.${k}`;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const child = build(v, key);
        Object.defineProperty(out, k, { value: child, enumerable: true });
      } else {
        Object.defineProperty(out, k, { get: () => text(key), enumerable: true });
      }
    }
    return Object.freeze(out);
  };
  const shape = base.split('.').reduce((o, k) => (o ? o[k] : undefined), PACKS[REFERENCE]);
  if (!shape || typeof shape !== 'object') throw new Error(`i18n: bölüm yok: ${base}`);
  return build(shape, base);
}

/**
 * Bir DOM ağacındaki işaretli öğelerin metnini etkin dile çevirir:
 *  data-t="anahtar"       → textContent
 *  data-t-aria="anahtar"  → aria-label
 */
export function applyText(root) {
  for (const node of root.querySelectorAll('[data-t]')) node.textContent = text(node.dataset.t);
  for (const node of root.querySelectorAll('[data-t-aria]')) node.setAttribute('aria-label', text(node.dataset.tAria));
}

/** Test ve geliştirme için: iki paketin anahtar farkları. */
export function missingKeys(id) {
  const ref = FLAT[REFERENCE];
  const other = FLAT[id];
  if (!other) return [];
  return [...ref.keys()].filter((k) => !other.has(k)).concat([...other.keys()].filter((k) => !ref.has(k)).map((k) => `+${k}`));
}
