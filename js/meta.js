/* ==========================================================================
 *  SOULGATE — meta.js
 *  Sorumluluk : Kalıcı ilerlemenin kuralları — bölüm kilitleri ve
 *               yıldızlar, çarşı fiyatları, kilitleri ve alımlar, oyuna
 *               götürülen kuleler, ana kule (kale) istatistikleri, yıkılma
 *               ve onarım, yan kulelere yetenek takma, oyun sonu altın ödülü.
 *  Bağımlılık : config, utils, events (0) · state (1).
 *  Veri       : state.profile (şekli ve doğrulaması state.js'te).
 *  Yayınlar   : EV.PROFILE (her değişiklikte; main.js kaydeder),
 *               EV.PURCHASE (alımda; ses ve efekt).
 *
 *  Bütün alım fonksiyonları { ok, reason } döndürür:
 *   reason: 'owned' | 'max' | 'gold' | 'locked' | 'unknown' | 'none'
 * ========================================================================== */

import {
  META, CASTLE, SKILLS, SIDES, TOWERS, TOWER_ORDER, DIFFICULTIES, DIFFICULTY_ORDER, DEFAULT_DIFFICULTY,
  MAPS, MAP_BY_ID, MAP_ORDER, WAVE_COUNT, LOADOUT_SIZE,
} from './config.js';
import { EV, emit } from './events.js';
import { state } from './state.js';

const P = () => state.profile;

/* --------------------------------------------------------------------------
 * 0. BÖLÜMLER — açılma ve yıldızlar (rekorlardan türetilir, ayrıca saklanmaz)
 *  Bölüm n+1, bölüm n herhangi bir zorlukta kazanılınca açılır.
 *  Yıldız: kazanılan her zorluk bir yıldız (en çok 3).
 * ------------------------------------------------------------------------ */
const winsOf = (mapId) => state.records.wins[mapId] ?? {};

/** Bölüm kazanıldı mı (herhangi bir zorlukta)? */
export const chapterWon = (mapId) => DIFFICULTY_ORDER.some((d) => (winsOf(mapId)[d] ?? 0) > 0);

export function chapterUnlocked(mapId) {
  const m = MAP_BY_ID[mapId];
  if (!m) return false;
  return m.index === 0 || chapterWon(MAPS[m.index - 1].id);
}

/** Bölümün yıldızları: kazanılan zorlukların listesi ve sayısı. */
export function chapterStars(mapId) {
  const won = DIFFICULTY_ORDER.filter((d) => (winsOf(mapId)[d] ?? 0) > 0);
  return { count: won.length, won };
}

export const totalStars = () => MAP_ORDER.reduce((n, id) => n + chapterStars(id).count, 0);
export const maxStars = () => MAP_ORDER.length * DIFFICULTY_ORDER.length;

/** Açık olan en son bölüm (ana menü sahnesi ve varsayılan seçim). */
export function latestChapter() {
  let last = MAPS[0];
  for (const m of MAPS) if (chapterUnlocked(m.id)) last = m;
  return last;
}

/** Bir çarşı öğesini çarşıya getiren bölüm (yoksa null = baştan açık). */
export function unlockChapter(kind, id) {
  const key = kind === 'tower' ? 'towers' : 'skills';
  return MAPS.find((m) => m.unlocks[key].includes(id)) ?? null;
}

/** Öğe çarşıda alınabilir mi (bölümü açıldı mı)? */
export function available(kind, id) {
  const ch = unlockChapter(kind, id);
  return !ch || chapterUnlocked(ch.id);
}

/* --------------------------------------------------------------------------
 * 1. SORGULAR
 * ------------------------------------------------------------------------ */
export const gold = () => P().gold;
export const ownsTower = (type) => P().towers.includes(type);
export const skillLevel = (id) => P().skills[id] ?? 0;
export const castleLevel = (key) => P().castle[key] ?? 0;
export const isRuined = () => P().ruined;
export const rightBuilt = () => P().rightBuilt;
export const equipped = (side) => P().sides[side] ?? null;

/** Kale yükseltmelerinin toplam seviyesi (onarım fiyatı buna bağlı). */
function totalCastleLevels() {
  return Object.values(P().castle).reduce((a, b) => a + b, 0);
}

export function repairPrice() {
  return META.repair.base + META.repair.perLevel * totalCastleLevels();
}

/** Çarşıdaki bir kulenin durumu. locked: bölümü henüz açılmadı (chapter: hangi bölüm). */
export function towerOffer(type) {
  const price = META.towerPrice[type] ?? 0;
  const owned = ownsTower(type);
  const locked = !owned && !available('tower', type);
  return { owned, price, locked, chapter: unlockChapter('tower', type), affordable: !locked && (owned || gold() >= price) };
}

/** Bir yeteneğin sıradaki alımı: satın alma, yükseltme ya da tam. */
export function skillOffer(id) {
  const def = SKILLS[id];
  const level = skillLevel(id);
  const max = def.levels;
  const chapter = unlockChapter('skill', id);
  if (level >= max) return { kind: 'max', level, max, price: 0, affordable: false, locked: false, chapter };
  const locked = level === 0 && !available('skill', id);
  const price = level === 0 ? def.price : def.upgrade[level - 1];
  return { kind: level === 0 ? 'buy' : 'upgrade', level, max, price, locked, chapter, affordable: !locked && gold() >= price };
}

/* — Oyuna götürülen kuleler (en çok LOADOUT_SIZE) — */
/**
 * Oyuna götürülecek kuleler, çarşı sırasıyla. Profilde seçim yoksa (ya da
 * seçilenlerin hiçbiri artık geçerli değilse) sahip olunan ilk
 * LOADOUT_SIZE kule götürülür.
 */
export function loadoutTowers() {
  const p = P();
  const chosen = p.loadout.filter((t) => p.towers.includes(t));
  const list = chosen.length ? chosen : TOWER_ORDER.filter((t) => p.towers.includes(t)).slice(0, LOADOUT_SIZE);
  return TOWER_ORDER.filter((t) => list.includes(t));
}

export const inLoadout = (type) => loadoutTowers().includes(type);

/**
 * Kuleyi seçime ekler ya da çıkarır. Seçim dolu iken eklenemez; son kule
 * çıkarılamaz (oyuna en az bir kuleyle girilir).
 * reason: 'locked' (sahip değil) | 'full' | 'last'
 */
export function toggleLoadout(type) {
  const p = P();
  if (!p.towers.includes(type)) return { ok: false, reason: 'locked' };
  const cur = loadoutTowers();
  let next;
  if (cur.includes(type)) {
    if (cur.length <= 1) return { ok: false, reason: 'last' };
    next = cur.filter((t) => t !== type);
  } else {
    if (cur.length >= LOADOUT_SIZE) return { ok: false, reason: 'full' };
    next = [...cur, type];
  }
  p.loadout = TOWER_ORDER.filter((t) => next.includes(t));
  emit(EV.PROFILE);
  return { ok: true, reason: '' };
}

/** Bir kale yükseltmesinin sıradaki seviyesi. */
export function castleOffer(key) {
  const up = CASTLE.upgrades[key];
  const level = castleLevel(key);
  const max = up.costs.length;
  if (level >= max) return { level, max, price: 0, affordable: false };
  const price = up.costs[level];
  return { level, max, price, affordable: gold() >= price };
}

/**
 * Ana kulenin bir oyun başındaki değerleri (zorluğa göre).
 * @returns {{lives:number, damageMult:number, startSouls:number, ruined:boolean}}
 */
export function castleStats(difficultyId) {
  const diff = DIFFICULTIES[difficultyId] ?? DIFFICULTIES[DEFAULT_DIFFICULTY];
  const ups = CASTLE.upgrades;
  const ruined = isRuined();
  let lives = diff.lives + castleLevel('walls') * ups.walls.lives;
  let damageMult = 1 + castleLevel('ballista') * ups.ballista.damage;
  if (ruined) {
    lives = Math.max(1, Math.ceil(lives * CASTLE.ruined.lives));
    damageMult *= CASTLE.ruined.damage;
  }
  return {
    lives,
    damageMult,
    startSouls: diff.startSouls + castleLevel('treasury') * ups.treasury.souls,
    ruined,
    rangeBonus: castleLevel('watch') * ups.watch.range,          // balista menzili (+hücre)
    rateMult: 1 + castleLevel('watch') * ups.watch.rate,         // balista atış hızı
    cooldownMult: Math.max(0.5, 1 - castleLevel('runes') * ups.runes.cooldown), // yetenek bekleme süresi
  };
}

/** Yan kulelere takılı ve kullanılabilir yetenekler (oyun başında okunur). */
export function loadout() {
  const out = [];
  for (const side of SIDES) {
    if (side === 'right' && !rightBuilt()) continue;
    const id = equipped(side);
    if (id && skillLevel(id) > 0) out.push({ side, id, level: skillLevel(id) });
  }
  return out;
}

/* --------------------------------------------------------------------------
 * 2. ALIMLAR
 * ------------------------------------------------------------------------ */
function spend(price, kind, id) {
  const p = P();
  p.gold -= price;
  emit(EV.PURCHASE, kind, id);
  emit(EV.PROFILE);
  return { ok: true, reason: '' };
}

export function buyTower(type) {
  if (!TOWERS[type]) return { ok: false, reason: 'unknown' };
  const o = towerOffer(type);
  if (o.owned) return { ok: false, reason: 'owned' };
  if (o.locked) return { ok: false, reason: 'locked' };
  if (gold() < o.price) return { ok: false, reason: 'gold' };
  const p = P();
  const before = loadoutTowers();
  p.towers.push(type);
  // seçimde yer varsa yeni kule kendiliğinden eklenir
  if (before.length < LOADOUT_SIZE) p.loadout = TOWER_ORDER.filter((t) => before.includes(t) || t === type);
  return spend(o.price, 'tower', type);
}

export function buySkill(id) {
  if (!SKILLS[id]) return { ok: false, reason: 'unknown' };
  const o = skillOffer(id);
  if (o.kind === 'max') return { ok: false, reason: 'max' };
  if (o.locked) return { ok: false, reason: 'locked' };
  if (gold() < o.price) return { ok: false, reason: 'gold' };
  const p = P();
  p.skills[id] = o.level + 1;
  // ilk alınan yetenek boş bir yan kuleye kendiliğinden takılır
  if (o.kind === 'buy') {
    if (!p.sides.left) p.sides.left = id;
    else if (p.rightBuilt && !p.sides.right) p.sides.right = id;
  }
  return spend(o.price, 'skill', id);
}

export function buyCastle(key) {
  if (!CASTLE.upgrades[key]) return { ok: false, reason: 'unknown' };
  const o = castleOffer(key);
  if (o.level >= o.max) return { ok: false, reason: 'max' };
  if (gold() < o.price) return { ok: false, reason: 'gold' };
  P().castle[key] = o.level + 1;
  return spend(o.price, 'castle', key);
}

/** Sağ yan kuleyi inşa eder (ikinci yetenek yuvası). */
export function buildRightSide() {
  const p = P();
  if (p.rightBuilt) return { ok: false, reason: 'owned' };
  if (gold() < META.rightSidePrice) return { ok: false, reason: 'gold' };
  p.rightBuilt = true;
  const free = Object.keys(p.skills).find((id) => p.sides.left !== id);
  if (free && !p.sides.right) p.sides.right = free;
  return spend(META.rightSidePrice, 'side', 'right');
}

export function repair() {
  if (!isRuined()) return { ok: false, reason: 'none' };
  const price = repairPrice();
  if (gold() < price) return { ok: false, reason: 'gold' };
  P().ruined = false;
  return spend(price, 'repair', 'castle');
}

/**
 * Yan kuleye yetenek takar (null → boşaltır). Aynı yetenek öbür kuledeyse
 * yer değiştirir; bir yetenek aynı anda iki kulede olamaz.
 */
export function equip(side, id) {
  const p = P();
  if (!SIDES.includes(side)) return { ok: false, reason: 'unknown' };
  if (side === 'right' && !p.rightBuilt) return { ok: false, reason: 'locked' };
  if (id !== null && !p.skills[id]) return { ok: false, reason: 'locked' };
  const other = side === 'left' ? 'right' : 'left';
  if (id !== null && p.sides[other] === id) p.sides[other] = p.sides[side];
  p.sides[side] = id;
  emit(EV.PROFILE);
  return { ok: true, reason: '' };
}

/* --------------------------------------------------------------------------
 * 3. OYUN SONU
 * ------------------------------------------------------------------------ */
/**
 * Altın ödülünün dökümü.
 * @param {boolean} victory
 * @param {{wave:number, bossKills:number, difficulty:string, mapId:string}} stats
 *  mult: zorluk × bölüm çarpanı (arayüz ikisini ayrı da gösterir)
 */
export function runReward(victory, stats) {
  const R = META.reward;
  const diff = DIFFICULTIES[stats.difficulty] ?? DIFFICULTIES[DEFAULT_DIFFICULTY];
  const chapter = MAP_BY_ID[stats.mapId] ?? MAPS[0];
  const waves = victory ? WAVE_COUNT : Math.max(0, (stats.wave ?? 0) - 1); // yenilgide son dalga temizlenmedi
  const bosses = stats.bossKills ?? 0;
  const parts = {
    waves: waves * R.perWave,
    bosses: bosses * R.perBoss,
    victory: victory ? R.victory : 0,
  };
  const raw = parts.waves + parts.bosses + parts.victory;
  const mult = diff.reward * chapter.reward;
  const total = Math.max(R.minimum, Math.round(raw * mult));
  return { waves, bosses, parts, mult, diffMult: diff.reward, chapterMult: chapter.reward, total };
}

/**
 * Biten oyunu profile işler: altını ekler, yenilgide kaleyi yıkar.
 * @returns {object} runReward sonucu
 */
export function settleRun(victory, stats) {
  const reward = runReward(victory, stats);
  const p = P();
  p.gold += reward.total;
  p.earned += reward.total;
  if (!victory) p.ruined = true;
  emit(EV.PROFILE);
  return reward;
}
