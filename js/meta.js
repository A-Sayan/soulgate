/* ==========================================================================
 *  SOULGATE — meta.js
 *  Sorumluluk : Kalıcı ilerlemenin kuralları — bölüm kilitleri ve
 *               yıldızlar, çarşı fiyatları, kilitleri ve alımlar, oyuna
 *               götürülen kuleler, ana kule (kale) istatistikleri, yıkılma
 *               ve onarım, yan kulelere yetenek takma, oyun sonu altın ödülü,
 *               Meydan Okumalar (Sonsuz Gece, Günün Sınavı, Sınavlar): kilitleri,
 *               günün sınavının seçimi ve mod ödülleri.
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
  MAPS, MAP_BY_ID, MAP_ORDER, WAVE_COUNT, LOADOUT_SIZE, CHALLENGES, CHALLENGE_BY_ID, DAILY, DAILY_POOL, ENDLESS,
  MODIFIERS,
} from './config.js';
import { createRng, hashString } from './utils.js';
import { EV, emit } from './events.js';
import { state, todayKey } from './state.js';

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
 * 3. MEYDAN OKUMALAR — Sonsuz Gece, Günün Sınavı, Sınavlar (1.5.0)
 *  Hepsi bir bölüm kazanılınca açılır; kayıtları records.endless / daily /
 *  challenges (state.js). Günün Sınavı tarih + kazanılan bölümlerden
 *  türetilir: aynı gün aynı oyuncuya hep aynı sınav çıkar (ağ yok).
 * ------------------------------------------------------------------------ */
/** Kazanılmış bölümler (çarşı sırasıyla). */
export const wonChapters = () => MAPS.filter((m) => chapterWon(m.id));

/** Meydan Okumalar açık mı (en az bir bölüm kazanıldı)? */
export const modesUnlocked = () => wonChapters().length > 0;

/** Sonsuz Gece bu bölümde açık mı? */
export const endlessUnlocked = (mapId) => chapterWon(mapId);

/** Sonsuz Gece rekoru (bölüm, zorluk). */
export const endlessBest = (mapId, diff) => state.records.endless[mapId]?.[diff] ?? 0;

export const challengeUnlocked = (id) => !!CHALLENGE_BY_ID[id] && chapterWon(CHALLENGE_BY_ID[id].map);
export const challengeDone = (id) => state.records.challenges.includes(id);
export const challengesDone = () => CHALLENGES.filter((c) => challengeDone(c.id)).length;

/**
 * Bir günün sınavı: { date, mapId, difficulty, mods, done, reward } ya da null
 * (henüz bölüm kazanılmadı). Bölüm kazanılanlardan, kurallar DAILY_POOL'dan seçilir.
 */
export function dailyChallenge(date = todayKey()) {
  const won = wonChapters();
  if (!won.length) return null;
  const r = createRng(hashString(`soulgate:${date}`)); // aynı gün → aynı seçim
  const map = r.pick(won);
  // kurallar: toplam ağırlık DAILY.maxWeight'i geçmesin (iki ağır kural bir arada çıkmaz)
  let pool = [...DAILY_POOL];
  const mods = [];
  let weight = 0;
  while (mods.length < DAILY.mods && pool.length) {
    const id = pool.splice(r.int(0, pool.length - 1), 1)[0];
    mods.push(id);
    weight += MODIFIERS[id].weight;
    pool = pool.filter((m) => weight + MODIFIERS[m].weight <= DAILY.maxWeight);
  }
  return {
    date,
    mapId: map.id,
    difficulty: DAILY.difficulty,
    mods,
    done: state.records.daily.last === date,
    reward: Math.round(DAILY.bonus * map.reward),
  };
}

/** Günün sınavı serisi şu an sürüyor mu (dün ya da bugün kazanıldıysa)? Kırıldıysa 0 gösterilir. */
export function dailyStreak(date = todayKey()) {
  const d = state.records.daily;
  if (!d.last) return 0;
  const t = (k) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
  const gap = Math.round((t(date) - t(d.last)) / 86400000);
  return gap <= 1 ? d.streak : 0;
}

/* --------------------------------------------------------------------------
 * 4. OYUN SONU
 * ------------------------------------------------------------------------ */
/**
 * Altın ödülünün dökümü.
 * @param {boolean} victory
 * @param {{wave:number, bossKills:number, difficulty:string, mapId:string,
 *          mode?:string, carry?:{waves,bosses}, challenge?:string}} stats
 * @param {{dailyFirst?:boolean, challengeFirst?:boolean}} [res] recordRunResult sonucu
 *  mult: zorluk × bölüm çarpanı (arayüz ikisini ayrı da gösterir).
 *  Sonsuz Gece: 30'dan sonraki dalgalar perWave × ENDLESS.rewardMult; zafer payı yok.
 *  Zaferden sonra sürdürülen oyunda zaferde ödenen kısım (carry) yeniden ödenmez.
 *  bonus: Günün Sınavı / Sınav ilk zafer ödülü (çarpansız, toplamın üstüne).
 */
export function runReward(victory, stats, res = {}) {
  const R = META.reward;
  const diff = DIFFICULTIES[stats.difficulty] ?? DIFFICULTIES[DEFAULT_DIFFICULTY];
  const chapter = MAP_BY_ID[stats.mapId] ?? MAPS[0];
  const mode = stats.mode ?? 'campaign';
  const carry = stats.carry ?? null;
  const cleared = victory ? WAVE_COUNT : Math.max(0, (stats.wave ?? 0) - 1); // yenilgide son dalga temizlenmedi
  const from = carry ? carry.waves : 0;
  const plain = Math.max(0, Math.min(cleared, WAVE_COUNT) - from);
  const extra = Math.max(0, cleared - Math.max(WAVE_COUNT, from));
  const waves = plain + extra;
  const bosses = Math.max(0, (stats.bossKills ?? 0) - (carry ? carry.bosses : 0));
  let bonus = 0;
  if (res.dailyFirst) bonus = Math.round(DAILY.bonus * chapter.reward);
  else if (res.challengeFirst && CHALLENGE_BY_ID[stats.challenge]) bonus = CHALLENGE_BY_ID[stats.challenge].reward;
  const parts = {
    waves: plain * R.perWave + Math.round(extra * R.perWave * ENDLESS.rewardMult),
    bosses: bosses * R.perBoss,
    victory: victory && mode !== 'endless' ? R.victory : 0,
    bonus,
  };
  const raw = parts.waves + parts.bosses + parts.victory;
  const mult = diff.reward * chapter.reward;
  const total = Math.max(R.minimum, Math.round(raw * mult)) + bonus;
  return { waves, bosses, parts, mult, diffMult: diff.reward, chapterMult: chapter.reward, total, mode };
}

/**
 * Biten oyunu profile işler: altını ekler, bölüm oyununda yenilgide kaleyi
 * yıkar (Meydan Okumalarda kale yıkılmaz).
 * @returns {object} runReward sonucu
 */
export function settleRun(victory, stats, res = {}) {
  const reward = runReward(victory, stats, res);
  const p = P();
  p.gold += reward.total;
  p.earned += reward.total;
  if (!victory && (stats.mode ?? 'campaign') === 'campaign') p.ruined = true;
  emit(EV.PROFILE);
  return reward;
}
