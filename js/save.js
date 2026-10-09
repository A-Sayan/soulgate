/* ==========================================================================
 *  SOULGATE — save.js
 *  Sorumluluk : Kalıcı depolama — localStorage'a sürümlü, bozulmaya dayanıklı
 *               okuma/yazma. Verinin ŞEKLİNİ bilmez (o state.js'in işi).
 *  Bağımlılık : config, utils, events (katman 0).
 *
 *  Kayıt zarfı : { v: sürüm, t: zaman damgası, d: veri }
 *  Dayanıklılık:
 *   - Depolama kapalıysa (gizli sekme, kısıtlı önizleme) bellek içi yedeğe
 *     geçer: oyun çalışmaya devam eder, oturum boyunca kayıt tutulur.
 *   - Kota dolarsa yazılamayan veri bellekte tutulur, oyuncu uyarılır.
 *   - Bozuk JSON / tanınmayan zarf silinir, oyuncu uyarılır.
 *   - Daha yeni bir sürümün kaydına dokunulmaz (silinmez, okunmaz).
 *   - Eski sürüm kayıtları MIGRATIONS ile adım adım yükseltilir.
 * ========================================================================== */

import { SAVE } from './config.js';
import { debounce } from './utils.js';
import { EV, emit } from './events.js';

/**
 * Sürüm yükseltmeleri: { n: (veri) => sürüm n+1 verisi }.
 * Kayıt biçimi değişirse SAVE.version artırılır ve buraya bir adım eklenir.
 */
const MIGRATIONS = {};

/* --------------------------------------------------------------------------
 * DEPOLAMA ARKA UCU
 * ------------------------------------------------------------------------ */
const memory = new Map();   // depolama kapalıyken ya da yazılamayınca yedek
const reported = new Set(); // aynı hata türü oturumda bir kez bildirilir
let sealed = false;         // tüm veriler silindi: sayfa yeniden yüklenene kadar hiçbir şey yazılmaz

function detectStorage() {
  try {
    const probe = SAVE.prefix + '__probe';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

const backend = detectStorage();
const fullKey = (name) => SAVE.prefix + name;

function reportOnce(reason) {
  if (reported.has(reason)) return;
  reported.add(reason);
  emit(EV.SAVE_ERROR, reason);
}

function isQuotaError(err) {
  return err instanceof DOMException &&
    (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22);
}

function readRaw(name) {
  if (memory.has(name)) return memory.get(name);
  if (!backend) return null;
  try {
    return backend.getItem(fullKey(name));
  } catch {
    return null;
  }
}

function writeRaw(name, text) {
  if (!backend) {
    memory.set(name, text);
    reportOnce('blocked');
    return false;
  }
  try {
    backend.setItem(fullKey(name), text);
    memory.delete(name);
    return true;
  } catch (err) {
    memory.set(name, text);
    reportOnce(isQuotaError(err) ? 'quota' : 'blocked');
    return false;
  }
}

function removeRaw(name) {
  memory.delete(name);
  if (!backend) return;
  try {
    backend.removeItem(fullKey(name));
  } catch {
    /* kaldırılamıyorsa okunurken yine doğrulanır */
  }
}

/* --------------------------------------------------------------------------
 * ZARF
 * ------------------------------------------------------------------------ */
/** Veriyi zarflayıp yazar. @returns kalıcı depolamaya yazıldıysa true */
function store(name, data) {
  if (sealed) return false;
  let text;
  try {
    text = JSON.stringify({ v: SAVE.version, t: Date.now(), d: data });
  } catch {
    return false; // döngüsel/serileşemez veri: yazma, eski kayıt korunur
  }
  return writeRaw(name, text);
}

/** Zarfı açar, gerekirse yükseltir. Bulunamaz ya da kullanılamazsa null. */
function load(name) {
  const text = readRaw(name);
  if (text === null || text === undefined) return null;

  let env;
  try {
    env = JSON.parse(text);
  } catch {
    return discard(name);
  }
  if (!env || typeof env !== 'object' || !Number.isInteger(env.v) || !('d' in env)) {
    return discard(name);
  }
  if (env.v > SAVE.version) return null; // yeni sürümün kaydı: dokunma

  let { v, d } = env;
  while (v < SAVE.version) {
    const step = MIGRATIONS[v];
    if (!step) return discard(name);
    try {
      d = step(d);
    } catch {
      return discard(name);
    }
    v += 1;
  }
  return d;
}

function discard(name) {
  removeRaw(name);
  reportOnce('corrupt');
  return null;
}

/* --------------------------------------------------------------------------
 * GENEL ARAYÜZ
 * ------------------------------------------------------------------------ */
/** Kayıtlar cihazda kalıcı mı? (false ise yalnızca bu oturum boyunca) */
export const isPersistent = () => backend !== null;

/* — Ayarlar: her değişiklikte, kısa gecikmeyle (kaydırıcı sürüklenirken
     her adımda yazmamak için) — */
export const loadSettings = () => load(SAVE.keys.settings);
export const saveSettings = debounce((settings) => store(SAVE.keys.settings, settings), SAVE.debounceMs);

/* — Rekorlar — */
export const loadRecords = () => load(SAVE.keys.records);
export const saveRecords = (records) => store(SAVE.keys.records, records);

/* — Profil: altın ve çarşı alımları; her değişiklikte hemen yazılır (para kaybolmasın) — */
export const loadProfile = () => load(SAVE.keys.profile);
export const saveProfile = (profile) => store(SAVE.keys.profile, profile);

/* — Süren oyun — */
export const loadRun = () => load(SAVE.keys.run);
export const saveRun = (data) => (data ? store(SAVE.keys.run, data) : false);
export const clearRun = () => removeRaw(SAVE.keys.run);
/** Okunabilir bir oyun kaydı var mı? (bozuksa siler ve false döner) */
export const hasRun = () => loadRun() !== null;

/** Bekleyen gecikmeli yazmaları hemen yapar (sayfa gizlenirken/kapanırken). */
export function flush() {
  saveSettings.flush();
}

/* — Sıfırlama — */
/** İlerlemeyi siler: oyun kaydı, rekorlar ve profil (altın, alımlar). Ayarlar kalır. */
export function resetProgress() {
  removeRaw(SAVE.keys.run);
  removeRaw(SAVE.keys.records);
  removeRaw(SAVE.keys.profile);
}

/**
 * Bu oyunun cihazdaki bütün verisini siler (ayarlar dahil) ve yazmayı
 * kapatır: sayfa kapanırken yapılan son kayıt silinenleri geri getirmesin.
 * Çağıran sayfayı yeniden yüklemelidir.
 * @returns {number} silinen kalıcı anahtar sayısı
 */
export function wipeAll() {
  saveSettings.cancel();
  sealed = true;
  memory.clear();
  if (!backend) return 0;
  let removed = 0;
  try {
    const keys = [];
    for (let i = 0; i < backend.length; i++) {
      const k = backend.key(i);
      if (k && k.startsWith(SAVE.prefix)) keys.push(k);
    }
    for (const k of keys) {
      backend.removeItem(k);
      removed++;
    }
  } catch {
    /* silinemeyen anahtar okunurken yine doğrulanır */
  }
  return removed;
}
