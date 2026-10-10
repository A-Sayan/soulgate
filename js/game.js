/* ==========================================================================
 *  SOULGATE — game.js
 *  Sorumluluk : Oyunun bütün kuralları — dalgalar, düşman davranışları ve
 *               yetenekleri, hedefleme, mermiler, hasar formülü, durum
 *               etkileri, boss yetenekleri, ekonomi, kule güçlendirmeleri,
 *               ana kulenin atışı, yan kule yetenekleri ve oyun sonu.
 *               Çizim ve DOM YOKTUR.
 *  Bağımlılık : config, utils, events (0) · state (1) · meta (2).
 *  Yayınlar   : events.js'teki oyun olayları (ses ve efekt bunları dinler).
 *
 *  ZAMAN: update(dt) sabit adımla çağrılır (TIMING.step). Oyun hızı
 *  (2x/3x) adım sayısını artırır, adım boyunu değil → sonuçlar her hızda aynı.
 *
 *  YOLLAR: Bir harita bir ya da iki yol taşır (state.map.polys). Her düşman
 *  kendi yolunda (e.path) ilerler; d = yolda kat ettiği mesafe, rem = kaleye
 *  kalan mesafe. "Kaleye en yakın" hedefleme rem ile yapılır, böylece iki
 *  yolun uzunlukları farklı olsa da doğru düşman seçilir.
 *
 *  HASAR FORMÜLÜ (tek yerde, açık):
 *    çarpan  = (1 + lanet artışı) × (yavaşlamışsa 1 + kırılganlık)
 *              × (sertleşmiş boss'ta fiziksel hasar × harden.phys)
 *    savunma = fiziksel → zırh, büyü → direnç, saf → 0
 *              savunma × (1 − en güçlü savunma kırma) × (1 − delme), en fazla COMBAT.armorCap
 *              (savunma kırma: lanet aurası ya da Kara Alev'in erittiği zırh)
 *    hasar   = ham × çarpan × (1 − savunma); önce buz kalkanı (ward) emer
 *
 *  DALGA AKIŞI:
 *    İlk dalga (ve kayıttan yüklenen oyun) oyuncunun başlatmasını bekler.
 *    Bir dalganın son düşmanı doğunca sıradakinin geri sayımı başlar;
 *    yani yavaş temizlersen dalgalar üst üste biner. Geri sayım sürerken
 *    dalgayı erken çağırmak kalan her saniye için ruh kazandırır.
 *    OTOMATİK DALGA (ayar): geri sayım sürerken kalan düşman sayısı ve
 *    biriken ruh oyuncunun koşullarını sağlayınca dalga kendiliğinden
 *    çağrılır (erken çağrı bonusu dahil). İlk dalgayı hep oyuncu başlatır.
 *
 *  EKONOMİ: Oyun içi para birimi RUH'tur (öldürmeler, dalga bonusları,
 *    Ruh Kuyusu). Kule kurma/yükseltme ve yetenekler ruhla ödenir. Kalıcı
 *    ALTIN yalnızca oyun sonunda kazanılır ve oyun dışı çarşıda harcanır (meta.js).
 *
 *  MODLAR VE KURALLAR (1.5.0, config bölüm 6b):
 *    Sonsuz Gece'de 30. dalgadan sonraki dalgalar bölümün dalgalarından
 *    türetilir (waveDef); oyun yalnızca yenilgiyle biter. Kurallar (run.mods)
 *    ruhu, hızı, zırhı, kalabalığı, menzili, yetenekleri, satışı, ustalığı ve
 *    kalenin canını değiştirir. Kâbus ve "Öfkeli Patronlar": patronlar kükrer ve
 *    öfkelenir (BOSS_WRATH). Kâbus ve geç Sonsuz Gece: seçkin düşmanlar (ELITE).
 *  HARİTA OLAYLARI (bölüm 12b): her bölümün kendi olayı, savaş sürerken arada bir
 *    uyarıyla patlak verir (MAP_EVENTS). Etkileri run.effects'te yaşar, kayda girmez.
 * ========================================================================== */

import {
  TOWERS, TOWER_STAT_DEFAULTS, ENEMIES, WAVE_RULES, SCALING, DIFFICULTIES,
  ECONOMY, COMBAT, FEEL, CASTLE, SKILLS, AUTO_WAVE, MAP_ORDER, WAVE_COUNT,
  MODIFIERS, ENDLESS, ELITE, BOSS_WRATH, MAP_EVENTS, EVENT_RULES,
} from './config.js';
import { dist2, rng, samplePolyline, rotateTowards, angleDelta, damp, approach, createPool, lerp, clamp } from './utils.js';
import { EV, emit } from './events.js';
import {
  state, newRun, restoreRun, createTower, placeTower, removeTower, isBuildable, isUnlocked, hasMod,
} from './state.js';
import { castleStats, castleLevel, loadout, inLoadout } from './meta.js';

/* --------------------------------------------------------------------------
 * 1. KULE İSTATİSTİKLERİ — açılışta bir kez hesaplanır, sonra O(1) okunur
 * ------------------------------------------------------------------------ */
const STAT_KEYS = Object.keys(TOWER_STAT_DEFAULTS);

function resolveStats(type, level, mastery) {
  const def = TOWERS[type];
  const s = { ...TOWER_STAT_DEFAULTS };
  const apply = (src) => {
    for (const k of STAT_KEYS) if (src[k] !== undefined) s[k] = src[k];
  };
  for (let i = 0; i <= level; i++) apply(def.levels[i]);
  if (mastery >= 0) apply(def.masteries[mastery]);
  return Object.freeze(s);
}

/** RESOLVED[tip][seviye][ustalık + 1] */
const RESOLVED = Object.fromEntries(Object.entries(TOWERS).map(([type, def]) => {
  const last = def.levels.length - 1;
  const table = def.levels.map((_, lv) => {
    const row = [resolveStats(type, lv, -1)];
    if (lv === last) def.masteries.forEach((_, m) => row.push(resolveStats(type, lv, m)));
    return row;
  });
  return [type, table];
}));

/** Belirli bir kule durumunun istatistikleri (dondurulmuş nesne). */
export function towerStats(type, level, mastery = -1) {
  const row = RESOLVED[type][level];
  return row[mastery + 1] ?? row[0];
}
export const statsOf = (t) => towerStats(t.type, t.level, t.mastery);

/**
 * Savaş Çanı güçlendirmeleri işlenmiş canlı değerler. Güçlendirme yoksa
 * dondurulmuş tablo döner; varsa kulenin kendi nesnesi yalnızca değerler
 * değişince yeniden yazılır (her adımda bellek ayrılmaz).
 */
export function liveStats(t) {
  const base = statsOf(t);
  if (t.bRate === 0 && t.bDmg === 0 && t.bRange === 0) return base;
  let e = t.eff;
  if (!e || e.base !== base || e.bRate !== t.bRate || e.bDmg !== t.bDmg || e.bRange !== t.bRange) {
    e = t.eff ?? (t.eff = {});
    Object.assign(e, base);
    const dm = 1 + t.bDmg;
    e.damage = base.damage * dm;
    e.dps = base.dps * dm;
    e.burnDps = base.burnDps * dm;
    e.poisonDps = base.poisonDps * dm;
    e.rate = base.rate * (1 + t.bRate);
    e.range = base.range * (1 + t.bRange);
    e.base = base;
    e.bRate = t.bRate;
    e.bDmg = t.bDmg;
    e.bRange = t.bRange;
  }
  return e;
}

/** Kulenin aldığı çan güçlendirmesi (arayüz için). */
export const buffsOf = (t) => ({ rate: t.bRate, dmg: t.bDmg, range: t.bRange });

/** Mermilerin çıktığı yükseklik (hücre, çapanın üstü) — sprite'larla uyumlu. */
const MUZZLE = {
  archer: 0.5, mortar: 0.2, frost: 1.1, tesla: 0.8, poison: 0.25, curse: 0.6,
  lance: 0.55, prism: 1.05, flame: 0.45, hunter: 0.85, bell: 0.7, well: 0.3,
};
const AIMS = { archer: true, mortar: true, lance: true, flame: true, hunter: true };

/* --------------------------------------------------------------------------
 * 2. EKONOMİ SORGULARI (arayüz için)
 * ------------------------------------------------------------------------ */
const diffOf = () => DIFFICULTIES[state.run.difficulty];

/** Kurallardan gelen ruh çarpanı ("Kıt Ruh"). */
const soulMult = () => (hasMod('scarce') ? MODIFIERS.scarce.souls : 1);

/** Son dalganın numarası: bölüm 30, Sonsuz Gece sınırsız (Infinity). */
const lastWave = () => (state.run && state.run.mode === 'endless' ? Infinity : state.map.waves.length);

/*
 * Sonsuz Gece dalgaları (n > 30) bölümün kendi dalgalarından türetilir; aynı n
 * hep aynı dalgayı verir (kayıttan devamda da). Her 10. dalga bölümün 10., 20.
 * ve 30. dalgasının patronu sırayla (yankı değil, tam güçte); arada 11–29.
 * dalgalar (20. hariç) döner. Sıradan gruplar dalga başına ENDLESS.countGrowth
 * kalabalıklaşır (en çok countMax kat), aralıkları da biraz sıklaşır.
 */
const endlessWaves = new Map();
const LOOP = [11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29];

function makeEndlessWave(n) {
  const waves = state.map.waves;
  const k = n - WAVE_COUNT;
  const grow = Math.min(ENDLESS.countMax, 1 + ENDLESS.countGrowth * k);
  const gapK = 1 / Math.sqrt(grow);
  let src;
  if (n % 10 === 0) src = waves[(((n / 10) - 1) % 3 + 1) * 10 - 1];
  else src = waves[LOOP[(k - 1 - Math.floor((k - 1) / 10)) % LOOP.length] - 1];
  const groups = src.groups.map((gr) => (ENEMIES[gr.type].boss
    ? { ...gr, echo: 0 }
    : { ...gr, echo: 0, count: Math.ceil(gr.count * grow), gap: gr.gap * gapK }));
  return { tag: src.tag, name: '', groups };
}

/** n. dalganın tanımı (yoksa null). */
function waveDef(n) {
  const waves = state.map.waves;
  if (n >= 1 && n <= waves.length) return waves[n - 1];
  if (n < 1 || state.run.mode !== 'endless') return null;
  let w = endlessWaves.get(n);
  if (!w) {
    w = makeEndlessWave(n);
    endlessWaves.set(n, w);
  }
  return w;
}

/** Yükseltme seçenekleri: sıradaki seviye, ustalık seçimi ya da null (tam). */
export function upgradeOptions(t) {
  const def = TOWERS[t.type];
  const last = def.levels.length - 1;
  if (t.level < last) {
    return { kind: 'level', cost: def.levels[t.level + 1].cost, next: towerStats(t.type, t.level + 1) };
  }
  if (t.mastery < 0) {
    if (hasMod('nomastery')) return null; // "Ustasız" kuralı: kule 3. seviyede kalır
    return {
      kind: 'mastery',
      options: def.masteries.map((m, i) => ({
        index: i, id: m.id, name: m.name, desc: m.desc, cost: m.cost, next: towerStats(t.type, last, i),
      })),
    };
  }
  return null;
}

/** Bu kule şimdi satılırsa ne kadar geri gelir. */
export function sellValue(t) {
  const rate = t.fresh ? ECONOMY.freshRefund : ECONOMY.sellRefund;
  return Math.round(t.invested * rate);
}

/** Geri sayım sürerken dalgayı çağırmanın bonusu (yoksa 0). */
export function earlyBonus() {
  const run = state.run;
  if (!run || run.countdown === null) return 0;
  return Math.round(Math.max(0, run.countdown) * ECONOMY.earlyCallPerSecond * soulMult());
}

/** Dalga temizleme bonusu (zorlukla ölçeklenir). */
function clearBonus(n) {
  return Math.round((ECONOMY.waveClearBase + ECONOMY.waveClearPerWave * n) * diffOf().souls * soulMult());
}

/** Bir hücreden verilen menzilde yolun kaç hücresi görülüyor (kurulum önizlemesi). */
export function pathCoverage(c, r, range) {
  const map = state.map;
  if (!map) return 0;
  const x = c + 0.5;
  const y = r + 0.5;
  const r2 = range * range;
  let n = 0;
  for (const [pc, pr] of map.pathCells) if (dist2(x, y, pc + 0.5, pr + 0.5) <= r2) n++;
  return n;
}

/** Dalga önizlemesi: { n, tag, name, groups:[{type,count}], boss } */
export function waveInfo(n) {
  const w = state.map && state.run ? waveDef(n) : null;
  if (!w) return null;
  const counts = new Map();
  for (const g of w.groups) counts.set(g.type, (counts.get(g.type) ?? 0) + g.count);
  const groups = [...counts].map(([type, count]) => ({ type, count }));
  const bossGroup = groups.find((g) => ENEMIES[g.type].boss);
  return { n, tag: w.tag, name: w.name ?? '', groups, boss: bossGroup ? bossGroup.type : null };
}

/** Toplam dalga: bölümde 30, Sonsuz Gece'de Infinity. */
export const totalWaves = () => (state.map && state.run ? lastWave() : 0);

/* --------------------------------------------------------------------------
 * 3. OYUN BAŞLATMA
 * ------------------------------------------------------------------------ */
/**
 * Yeni oyun kurar. mapId verilmezse ilk bölüm.
 * opt: { mode, mods, challenge, daily } (Meydan Okumalar; yoksa bölüm oyunu)
 */
export function newGame(difficultyId, mapId = MAP_ORDER[0], opt = null) {
  newRun(difficultyId, mapId, opt);
  endlessWaves.clear();
  setupKeep(false);
  projectiles.length = 0;
  wasClear = true;
  state.run.eventT = nextEventDelay(true);
  emit(EV.RUN_START, false, state.run.mapId);
  emit(EV.SOULS, state.run.souls, 0);
  emit(EV.LIVES, state.run.lives, 0);
  emit(EV.WAVE_PREP, 1, null);
}

/** Kayıttan devam eder. @returns {boolean} kayıt geçerliyse true */
export function loadGame(data) {
  if (!restoreRun(data)) return false;
  endlessWaves.clear();
  setupKeep(true);
  projectiles.length = 0;
  wasClear = true;
  const run = state.run;
  run.eventT = nextEventDelay(true);
  for (const t of run.towers) if (TOWERS[t.type].economy) t.genT = statsOf(t).soulEvery;
  emit(EV.RUN_START, true, run.mapId);
  emit(EV.SOULS, run.souls, 0);
  emit(EV.LIVES, run.lives, 0);
  emit(EV.WAVE_PREP, run.wave + 1, null);
  return true;
}

/**
 * Ana kule ve yan kuleler: can, başlangıç ruhu, balista ve yetenekler
 * profilden gelir. Kayıttan yüklenen oyunda can/ruh/yıkıklık kayıttaki
 * gibi kalır; yalnızca üst sınır ve takılı yetenekler profile göre kurulur.
 */
function setupKeep(fromSave) {
  const run = state.run;
  const cs = castleStats(run.difficulty);
  if (fromSave) {
    run.maxLives = Math.max(cs.lives, run.lives);
  } else {
    run.lives = cs.lives;
    run.maxLives = cs.lives;
    run.souls = cs.startSouls;
    run.ruined = cs.ruined;
  }
  if (hasMod('glass')) { // "Cam Kale": tek can, Surlar ve onarım sayılmaz
    run.maxLives = MODIFIERS.glass.lives;
    run.lives = Math.min(run.lives, run.maxLives);
  }
  const up = CASTLE.upgrades.ballista;
  const damageMult = (1 + castleLevel('ballista') * up.damage) * (run.ruined ? CASTLE.ruined.damage : 1);
  const { castle } = state.map;
  // FIRE olayında kule gibi davranır (ses ve kıvılcım okçu kulesininkini kullanır)
  run.castle = {
    castle: true, type: 'archer', mastery: 0, level: 2,
    x: castle.x, y: castle.y - CASTLE.muzzleY,
    angle: -Math.PI / 2, cooldown: 0.8, damageMult, target: null, retarget: 0,
    rangeBonus: cs.rangeBonus, rateMult: cs.rateMult, cdMult: cs.cooldownMult,
    kills: 0, damage: 0, // bu oyundaki payı (panelde görünür; kayda girmez)
  };
  const saved = run.savedSkills ?? [];
  run.skills = hasMod('noskills') ? [] : loadout().map((sk) => { // "Sessiz Burçlar": yetenek yok
    const prev = saved.find((k) => k.side === sk.side && k.id === sk.id);
    return { ...sk, freeUsed: prev ? prev.freeUsed : false, cd: 0, cdMax: SKILLS[sk.id].cooldown * cs.cooldownMult };
  });
  run.savedSkills = null;
  run.effects = [];
  run.chill = 0;
  run.chillRate = 1;
}

/* --------------------------------------------------------------------------
 * 4. OYUNCU KOMUTLARI
 *  Hepsi { ok, reason } ya da sonuç döndürür; arayüz nedeni oyuncuya söyler.
 *  reason: 'over' | 'locked' | 'cell' | 'souls' | 'max' | 'choice'
 * ------------------------------------------------------------------------ */
const fieldClear = () => state.run.enemies.length === 0 && state.run.spawners.length === 0;
let wasClear = true; // bir önceki adımda saha boş muydu (kayıt noktası için)

export function canBuild(type, c, r) {
  const run = state.run;
  if (!run || run.over) return { ok: false, reason: 'over' };
  if (!TOWERS[type] || !isUnlocked(type) || !inLoadout(type)) return { ok: false, reason: 'locked' };
  if (!isBuildable(c, r)) return { ok: false, reason: 'cell' };
  if (run.souls < TOWERS[type].levels[0].cost) return { ok: false, reason: 'souls' };
  return { ok: true, reason: '' };
}

/** Kule kurar. @returns {object|null} kurulan kule */
export function build(type, c, r) {
  if (!canBuild(type, c, r).ok) return null;
  const run = state.run;
  const cost = TOWERS[type].levels[0].cost;
  const t = createTower(type, c, r);
  t.invested = cost;
  // Tam iade yalnızca sahada kimse yokken kurulana: savaş ortasında
  // "kur-kullan-bedavaya sat" açığını kapatır.
  t.fresh = fieldClear();
  if (TOWERS[type].economy) t.genT = statsOf(t).soulEvery;
  if (!placeTower(t)) return null;
  run.souls -= cost;
  run.stats.built += 1;
  emit(EV.BUILD, t);
  emit(EV.SOULS, run.souls, -cost);
  afterAction();
  return t;
}

export function canUpgrade(t, masteryIndex = -1) {
  const run = state.run;
  if (!run || run.over) return { ok: false, reason: 'over' };
  const opt = upgradeOptions(t);
  if (!opt) return { ok: false, reason: 'max' };
  let cost = opt.cost;
  if (opt.kind === 'mastery') {
    const choice = opt.options[masteryIndex];
    if (!choice) return { ok: false, reason: 'choice' };
    cost = choice.cost;
  }
  if (run.souls < cost) return { ok: false, reason: 'souls' };
  return { ok: true, reason: '', cost };
}

/** Kuleyi bir seviye yükseltir ya da ustalık dalını seçer. */
export function upgrade(t, masteryIndex = -1) {
  const check = canUpgrade(t, masteryIndex);
  if (!check.ok) return false;
  const run = state.run;
  if (t.level < TOWERS[t.type].levels.length - 1) t.level += 1;
  else t.mastery = masteryIndex;
  run.souls -= check.cost;
  t.invested += check.cost;
  if (!fieldClear()) t.fresh = false;
  t.flash = 1;
  emit(EV.UPGRADE, t);
  emit(EV.SOULS, run.souls, -check.cost);
  afterAction();
  return true;
}

/**
 * Kule satılabilir mi? "Satış Yok" kuralında savaşa girmiş kule satılamaz
 * (bu hazırlıkta kurulan, henüz savaşmamış kule geri alınabilir).
 * reason: 'over' | 'rule'
 */
export function canSell(t) {
  const run = state.run;
  if (!run || run.over || !run.towerById.has(t.id)) return { ok: false, reason: 'over' };
  if (hasMod('nosell') && !t.fresh) return { ok: false, reason: 'rule' };
  return { ok: true, reason: '' };
}

/** Kuleyi satar. @returns {number} iade (satılamazsa 0) */
export function sell(t) {
  const run = state.run;
  if (!canSell(t).ok) return 0;
  const refund = sellValue(t);
  removeTower(t);
  run.souls += refund;
  emit(EV.SELL, t, refund);
  emit(EV.SOULS, run.souls, refund);
  afterAction();
  return refund;
}

export function setTargetMode(t, mode) {
  t.targetMode = mode;
  t.target = null;
  if (t.beam) t.beam.target = null;
}

/** Dalga şu an çağrılabilir mi? (ilk dalga, yüklenen oyun ya da geri sayım) */
export function canCallWave() {
  const run = state.run;
  if (!run || run.over || run.wave >= lastWave()) return false;
  if (run.countdown !== null) return true;
  return run.spawners.length === 0; // oyuncunun başlatmasını bekleyen durum
}

/** Sıradaki dalgayı şimdi başlatır (geri sayım varsa erken çağrı bonusu verir). */
export function callWave() {
  if (!canCallWave()) return false;
  startWave(earlyBonus());
  return true;
}

/** Sahada ve doğmayı bekleyen toplam düşman (bütün süren dalgalar). */
export function remainingEnemies() {
  let n = 0;
  for (const left of state.run.waveLeft.values()) n += left;
  return n;
}

/**
 * Otomatik dalga koşulları şu an sağlanıyor mu? Yalnızca geri sayım
 * sürerken (yani ilk dalga oyuncu tarafından başlatıldıktan sonra).
 *  kalan düşman ≤ autoWaveEnemies (en üst değer = fark etmez)
 *  ruh ≥ autoWaveSouls (0 = şartsız)
 */
export function autoWaveReady() {
  const run = state.run;
  const s = state.settings;
  if (!run || run.over || !s.autoWave || run.countdown === null) return false;
  if (s.autoWaveEnemies < AUTO_WAVE.maxEnemies && remainingEnemies() > s.autoWaveEnemies) return false;
  return run.souls >= s.autoWaveSouls;
}

function afterAction() {
  if (fieldClear() && !state.run.over) emit(EV.SAVEPOINT);
}

/* --------------------------------------------------------------------------
 * 5. DALGALAR
 * ------------------------------------------------------------------------ */
function startWave(bonus) {
  const run = state.run;
  run.wave += 1;
  const n = run.wave;
  run.countdown = null;
  let total = 0;
  const horde = hasMod('horde') ? MODIFIERS.horde.count : 1; // "Kalabalık": sıradan gruplar büyür
  for (const g of waveDef(n).groups) {
    const count = ENEMIES[g.type].boss ? g.count : Math.ceil(g.count * horde);
    const gap = horde > 1 && !ENEMIES[g.type].boss ? g.gap / Math.sqrt(horde) : g.gap;
    run.spawners.push({ wave: n, type: g.type, left: count, gap, t: g.at, path: g.path, echo: g.echo || 0 });
    total += count;
  }
  run.waveLeft.set(n, (run.waveLeft.get(n) ?? 0) + total);
  for (const t of run.towers) t.fresh = false;
  if (bonus > 0) {
    run.souls += bonus;
    emit(EV.SOULS, run.souls, bonus);
  }
  emit(EV.WAVE_START, n, bonus);
}

/** Hangi yoldan doğsun: grup belirtmişse o, yoksa iki yol arasında sırayla. */
function laneFor(groupPath) {
  const n = state.map.polys.length;
  if (n === 1) return 0;
  if (groupPath >= 0 && groupPath < n) return groupPath;
  const run = state.run;
  const lane = run.laneTurn % n;
  run.laneTurn += 1;
  return lane;
}

function updateSpawners(dt) {
  const run = state.run;
  let w = 0;
  for (let i = 0; i < run.spawners.length; i++) {
    const s = run.spawners[i];
    s.t -= dt;
    while (s.t <= 0 && s.left > 0) {
      spawnEnemy(s.type, s.wave, 0, false, laneFor(s.path), s.echo);
      s.left -= 1;
      s.t += s.gap;
    }
    if (s.left > 0) run.spawners[w++] = s;
    else if (!run.spawners.some((o, j) => j !== i && o.wave === s.wave && o.left > 0)) waveSpawned(s.wave);
  }
  run.spawners.length = w;

  if (run.countdown !== null) {
    run.countdown -= dt;
    if (run.countdown <= 0) startWave(0);
  }
}

/** Bir dalganın bütün düşmanları doğdu → sıradakinin geri sayımı başlar. */
function waveSpawned(n) {
  const run = state.run;
  emit(EV.WAVE_SPAWNED, n);
  if (n !== run.wave || n >= lastWave()) return;
  const next = n + 1;
  const bossNext = waveDef(next).groups.some((g) => ENEMIES[g.type].boss);
  run.countdown = bossNext ? WAVE_RULES.preBossTime : WAVE_RULES.interWaveTime;
  emit(EV.WAVE_PREP, next, run.countdown);
}

/** Bir dalgadan bir düşman eksildi (öldü ya da kaleye girdi). */
function waveDone(n) {
  const run = state.run;
  const left = (run.waveLeft.get(n) ?? 1) - 1;
  if (left > 0) {
    run.waveLeft.set(n, left);
    return;
  }
  run.waveLeft.delete(n);
  if (run.over) return;
  const bonus = clearBonus(n);
  run.souls += bonus;
  emit(EV.WAVE_CLEAR, n, bonus);
  emit(EV.SOULS, run.souls, bonus);
  wellsOnClear();
}

/** Ruh Kuyusu ustalıkları dalga temizlenince çalışır: faiz ve şifa. */
function wellsOnClear() {
  const run = state.run;
  for (const t of run.towers) {
    if (!TOWERS[t.type].economy || t.silenced > 0) continue;
    const st = statsOf(t);
    if (st.interest > 0) {
      const bonus = Math.min(st.interestMax, Math.round(run.souls * st.interest));
      if (bonus > 0) {
        run.souls += bonus;
        t.souls += bonus;
        emit(EV.GENERATE, t, bonus, 'interest');
        emit(EV.SOULS, run.souls, bonus);
      }
    }
    if (st.mendLives > 0 && run.lives < run.maxLives) {
      const add = Math.min(st.mendLives, run.maxLives - run.lives);
      run.lives += add;
      emit(EV.GENERATE, t, add, 'mend');
      emit(EV.LIVES, run.lives, add);
    }
  }
}

/* --------------------------------------------------------------------------
 * 6. DÜŞMANLAR
 * ------------------------------------------------------------------------ */
const polyOf = (e) => state.map.polys[e.path] ?? state.map.polys[0];
const immuneTo = (e, what) => ENEMIES[e.type].immune.includes(what);
/** Sersemlemiş, donmuş ya da zamanı durmuş düşman yeteneklerini kullanamaz. */
const disabled = (e) => e.freezeT > 0 || e.stunT > 0 || e.stopT > 0;

/**
 * Düşman doğurur. counted=true ise dalganın kalan sayısına eklenir
 * (yavrular, çağrılanlar); doğurucudan gelenler zaten sayılmıştır.
 */
function spawnEnemy(type, wave, d, counted, path = 0, echo = 0) {
  const run = state.run;
  const map = state.map;
  const def = ENEMIES[type];
  const diff = diffOf();
  const lane = map.polys[path] ? path : 0;
  const poly = map.polys[lane];
  const kind = def.boss ? SCALING.bossHp(wave) : SCALING.hordeHp(wave) * map.horde; // sıradan düşman ile patronun ayrı eğrisi
  // seçkin: yalnızca dalganın kendi düşmanları (yavru, çağrılan, patron değil)
  const elite = !counted && !def.boss && !def.minion && wave >= ELITE.fromWave && rng.chance(eliteChance(wave));
  const wrath = def.boss && (diff.wrath || hasMod('wrath'));
  const deep = run.mode === 'endless' && wave > WAVE_COUNT ? (1 + ENDLESS.hpGrowth) ** (wave - WAVE_COUNT) : 1; // Sonsuz Gece
  const hp = def.hp * SCALING.hp(wave) * kind * diff.hp * map.hp * (echo > 0 ? echo : 1)
    * (elite ? ELITE.hp : 1) * (wrath ? BOSS_WRATH.hp : 1) * deep;
  const baseSouls = def.souls > 0 ? def.souls : echo > 0 ? WAVE_RULES.echoSouls : 0; // yankı patron da ödül bırakır
  const souls = baseSouls > 0
    ? Math.max(1, Math.round(baseSouls * SCALING.souls(wave) * diff.souls * map.souls * soulMult() * (elite ? ELITE.souls : 1)))
    : 0;
  const plate = hasMod('armored') ? MODIFIERS.armored.armor : 0; // "Demir Ordu"
  const pace = (hasMod('swift') ? MODIFIERS.swift.speed : 1) * (elite ? ELITE.speed : 1);
  const dd = Math.min(Math.max(0, d), poly.length - 0.05);
  const e = {
    id: run.nextId++,
    type,
    wave,
    path: lane,
    size: def.size,
    boss: def.boss,
    flying: def.flying,
    hp,
    maxHp: hp,
    hpShown: hp,
    armor: plate > 0 ? Math.min(0.85, def.armor + plate) : def.armor,
    resist: plate > 0 ? Math.min(0.85, def.resist + plate) : def.resist,
    speed: def.speed * SCALING.speed(wave) * pace,
    elite,                       // seçkin (Kâbus, geç Sonsuz Gece): daha dayanıklı, iki kat ruh
    wrath,                       // öfkeli patron: kükrer, yarı canda hızlanır
    raged: false,
    roarT: wrath ? BOSS_WRATH.roar.first : 0,
    v: 0,
    souls,
    lives: echo > 0 ? Math.min(def.lives, WAVE_RULES.echoLives) : def.lives,
    d: dd,
    rem: poly.length - dd,
    x: 0, y: 0, angle: Math.PI / 2, seg: 0, dir: 1,
    alive: true,
    // durumlar
    slow: 0, slowT: 0, brittle: 0, freezeT: 0, stunT: 0, grace: 0, stopT: 0,
    burnDps: 0, burnT: 0, bSrc: null,
    pStacks: 0, pDps: 0, pT: 0, pMax: 0, pPct: 0, pSpread: false, pSrc: null,
    dotP: 0, dotB: 0, dotT: 0,
    cAmp: 0, cShred: 0, cSlow: 0, cSouls: 0, cursed: false,
    melt: 0, meltT: 0,           // Kara Alev: eriyen savunma
    ward: 0, wardMax: 0, wardT: 0, // Ayaz Cadısı'nın buz kalkanı
    hasteMult: 1,                // Savaş Davulcusu aurası
    enraged: false,
    regenAdd: 0,                 // Kara Hidra: her yeni baş yenilenmeyi artırır
    reborn: false,               // Kül Ankası küllerinden bir kez doğar
    // yetenek zamanlayıcıları
    phased: false,
    phaseT: def.phase ? def.phase.every * rng.range(0.4, 1) : 0,
    healT: def.heal ? def.heal.every * rng.range(0.5, 1) : 0,
    healedT: 0, // iyileştirme bekleme süresi (rahipler üst üste binmez)
    wardCd: def.ward ? def.ward.every * rng.range(0.3, 0.6) : 0,
    cleanseT: def.cleanse ? def.cleanse.every * rng.range(0.5, 0.9) : 0,
    blinkT: def.blink ? def.blink.every * rng.range(0.5, 1) : 0,
    webT: def.web ? def.web.every * rng.range(0.4, 0.8) : 0,
    summonT: def.summon ? def.summon.every * 0.6 : 0,
    scorchT: def.scorch ? def.scorch.every * 0.6 : 0,
    blizzT: def.blizzard ? def.blizzard.every * 0.6 : 0,
    hexT: def.hex ? def.hex.every * 0.6 : 0,
    hardT: 0,
    hardCd: def.harden ? def.harden.every * 0.5 : 0,
    shieldIdx: 0,
    shieldT: 0,
    // görsel durum (render okur)
    flash: 0, lastHit: -99, walk: rng.range(0, 1), spawnT: 0,
  };
  samplePolyline(poly, e.d, e);
  run.enemies.push(e);
  if (counted) run.waveLeft.set(wave, (run.waveLeft.get(wave) ?? 0) + 1);
  emit(EV.SPAWN, e);
  if (def.boss) emit(EV.BOSS_SPAWN, e);
  return e;
}

/** Mermilerin nişan aldığı gövde yüksekliği (uçanlar havada). */
function aimY(e) {
  const fly = e.flying ? (e.boss ? 0.7 : 0.55) : 0;
  return e.y - e.size * 0.9 - fly;
}

const targetable = (e) => e.alive && !e.phased;

/** Davulcu aurası: her adım yeniden işlenir (birikmez, en güçlüsü geçer). */
function applyEnemyAuras() {
  const enemies = state.run.enemies;
  for (const e of enemies) e.hasteMult = 1;
  for (const h of enemies) {
    const haste = ENEMIES[h.type].haste;
    if (!haste || !h.alive || disabled(h)) continue;
    const r2 = haste.radius * haste.radius;
    for (const o of enemies) {
      if (o === h || !o.alive || dist2(h.x, h.y, o.x, o.y) > r2) continue;
      if (o.hasteMult < haste.mult) o.hasteMult = haste.mult;
    }
  }
}

function updateEnemy(e, dt) {
  const def = ENEMIES[e.type];

  e.spawnT = Math.min(1, e.spawnT + dt * 2.5);
  e.flash = Math.max(0, e.flash - dt);
  e.hpShown = damp(e.hpShown, e.hp, FEEL.hpBar.lerp, dt);

  // — süreli durumlar —
  if (e.slowT > 0) {
    e.slowT -= dt;
    if (e.slowT <= 0) {
      e.slow = 0;
      e.brittle = 0;
    }
  }
  if (e.freezeT > 0) {
    e.freezeT -= dt;
    if (e.freezeT <= 0) e.grace = COMBAT.stunGrace;
  }
  if (e.stunT > 0) {
    e.stunT -= dt;
    if (e.stunT <= 0) e.grace = COMBAT.stunGrace;
  }
  if (e.stopT > 0) e.stopT -= dt;
  if (e.grace > 0) e.grace -= dt;
  if (e.shieldT > 0) e.shieldT = Math.max(0, e.shieldT - dt);
  if (e.healedT > 0) e.healedT -= dt;
  if (e.meltT > 0) {
    e.meltT -= dt;
    if (e.meltT <= 0) e.melt = 0;
  }
  if (e.wardT > 0) {
    e.wardT -= dt;
    if (e.wardT <= 0) e.ward = 0;
  }
  if (e.hardT > 0) e.hardT -= dt;

  // — süreli hasar: her adımda uygulanır, 0.4 sn'de bir toplu sayı olarak duyurulur —
  if (e.burnT > 0) {
    e.burnT -= dt;
    e.dotB += hurt(e, e.burnDps * dt, 'magic', e.bSrc, false, true);
  }
  if (e.pT > 0 && e.pStacks > 0 && e.alive) {
    const pct = e.pPct * e.maxHp * (e.boss ? COMBAT.bossPctHpFactor : 1);
    e.dotP += hurt(e, (e.pDps + pct) * e.pStacks * dt, 'pure', e.pSrc, false, true);
    e.pT -= dt;
    if (e.pT <= 0) {
      e.pStacks = 0;
      e.pSpread = false;
    }
  }
  e.dotT -= dt;
  if (e.dotT <= 0) {
    e.dotT = 0.4;
    if (e.dotP > 0.5) emit(EV.HIT, e, e.dotP, false, 'pure', true);
    if (e.dotB > 0.5) emit(EV.HIT, e, e.dotB, false, 'magic', true);
    e.dotP = 0;
    e.dotB = 0;
  }
  if (!e.alive) return;

  // — yenilenme (zehir durdurur) —
  const regen = def.regen + e.regenAdd;
  if (regen > 0 && !(COMBAT.poisonBlocksRegen && e.pStacks > 0)) {
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * regen * dt);
  }

  // — öfke: canı eşiğin altına inince hızlanır —
  if (def.enrage && !e.enraged && e.hp < e.maxHp * def.enrage.below) {
    e.enraged = true;
    emit(EV.STATUS, e, 'enrage');
  }
  if (e.wrath && !e.raged && e.hp < e.maxHp * BOSS_WRATH.rage.below) {
    e.raged = true;
    emit(EV.STATUS, e, 'enrage');
  }

  // — yetenekler (sersemlemiş/donmuş/zamanı durmuş düşman kullanamaz) —
  if (!disabled(e)) {
    if (def.phase) updatePhase(e, def, dt);
    if (def.heal) updateHeal(e, def, dt);
    if (def.ward) updateWard(e, def, dt);
    if (def.cleanse) updateCleanse(e, def, dt);
    if (def.blink) updateBlink(e, def, dt);
    if (def.web) updateWeb(e, def, dt);
    if (def.summon) updateSummon(e, def, dt);
    if (def.scorch) updateScorch(e, def, dt);
    if (def.blizzard) updateBlizzard(e, def, dt);
    if (def.hex) updateHex(e, def, dt);
    if (def.harden) updateHarden(e, def, dt);
    if (e.wrath) updateRoar(e, dt);
  }

  // — hareket —
  let mult = 0;
  if (e.freezeT <= 0 && e.stunT <= 0 && e.shieldT <= 0 && e.stopT <= 0) {
    let s = 1 - (1 - e.slow) * (1 - e.cSlow);
    if (e.boss) s *= COMBAT.bossSlowFactor;
    mult = (1 - Math.min(s, COMBAT.slowCap)) * e.hasteMult;
    if (e.enraged) mult *= def.enrage.speed;
    if (e.raged) mult *= BOSS_WRATH.rage.speed;
    if (e.phased && def.phase.speed) mult *= def.phase.speed;
  }
  e.v = e.speed * mult;
  e.d += e.v * dt;
  e.walk += e.v * dt * 1.8;
  const poly = polyOf(e);
  if (e.d >= poly.length) {
    leak(e);
    return;
  }
  e.rem = poly.length - e.d;
  samplePolyline(poly, e.d, e);
  const cx = Math.cos(e.angle);
  if (cx > 0.2) e.dir = 1;
  else if (cx < -0.2) e.dir = -1;
}

/** Hortlak ölüler diyarına geçer, Çamur Sürüngeni toprağa gömülür. */
function updatePhase(e, def, dt) {
  e.phaseT -= dt;
  if (e.phased) {
    // Lanet Totemi'nin aurası onları geri çeker
    if (e.phaseT <= 0 || e.cursed) {
      e.phased = false;
      e.phaseT = def.phase.every;
      emit(EV.PHASE, e, false);
    }
  } else if (e.phaseT <= 0) {
    if (e.cursed) {
      e.phaseT = 0.5;
    } else {
      e.phased = true;
      e.phaseT = def.phase.duration;
      emit(EV.PHASE, e, true);
    }
  }
}

function updateHeal(e, def, dt) {
  e.healT -= dt;
  if (e.healT > 0) return;
  e.healT = def.heal.every;
  const r2 = def.heal.radius * def.heal.radius;
  let healed = false;
  for (const o of state.run.enemies) {
    if (!o.alive || o.healedT > 0 || o.hp >= o.maxHp || dist2(e.x, e.y, o.x, o.y) > r2) continue;
    const cut = o.pStacks > 0 ? COMBAT.poisonHealCut : 1;
    o.hp = Math.min(o.maxHp, o.hp + o.maxHp * def.heal.pct * cut);
    o.healedT = COMBAT.healCooldown;
    healed = true;
  }
  if (healed) emit(EV.HEAL, e, def.heal.radius);
}

/** Ayaz Cadısı: çevresindekilere (boss hariç) canlarının bir kısmı kadar buz kalkanı. */
function updateWard(e, def, dt) {
  e.wardCd -= dt;
  if (e.wardCd > 0) return;
  e.wardCd = def.ward.every;
  const { radius, pct, dur } = def.ward;
  const r2 = radius * radius;
  let any = false;
  for (const o of state.run.enemies) {
    if (!o.alive || o.boss || dist2(e.x, e.y, o.x, o.y) > r2) continue;
    const amount = o.maxHp * pct;
    if (o.ward < amount) {
      o.ward = amount;
      o.wardMax = amount;
    }
    o.wardT = dur;
    any = true;
  }
  if (any) emit(EV.ABILITY, e, 'ward', e.x, e.y, radius);
}

/** Kâhin Göz: çevresindekilerin yavaşlatma, donma, zehir, yanık ve erimesini siler. */
function updateCleanse(e, def, dt) {
  e.cleanseT -= dt;
  if (e.cleanseT > 0) return;
  e.cleanseT = def.cleanse.every;
  const r2 = def.cleanse.radius * def.cleanse.radius;
  let any = false;
  for (const o of state.run.enemies) {
    if (!o.alive || dist2(e.x, e.y, o.x, o.y) > r2) continue;
    if (o.slowT <= 0 && o.pStacks <= 0 && o.burnT <= 0 && o.freezeT <= 0 && o.stunT <= 0 && o.meltT <= 0) continue;
    o.slow = 0;
    o.slowT = 0;
    o.brittle = 0;
    o.pStacks = 0;
    o.pT = 0;
    o.pSpread = false;
    o.burnT = 0;
    o.freezeT = 0;
    o.stunT = 0;
    o.melt = 0;
    o.meltT = 0;
    any = true;
  }
  if (any) emit(EV.ABILITY, e, 'cleanse', e.x, e.y, def.cleanse.radius);
}

/** Boşluk Gezgini: yol boyunca ileri ışınlanır (kalenin dibine değil). */
function updateBlink(e, def, dt) {
  e.blinkT -= dt;
  if (e.blinkT > 0) return;
  e.blinkT = def.blink.every;
  const poly = polyOf(e);
  const to = Math.min(e.d + def.blink.dist, poly.length - 0.9);
  if (to <= e.d + 0.2) return;
  const fx = e.x;
  const fy = e.y;
  e.d = to;
  e.rem = poly.length - e.d;
  samplePolyline(poly, e.d, e);
  emit(EV.ABILITY, e, 'blink', fx, fy, def.blink.dist);
}

/** Gölge Örümceği: menzildeki en yakın kuleyi ağla sarar. */
function updateWeb(e, def, dt) {
  e.webT -= dt;
  if (e.webT > 0) return;
  const r2 = def.web.range * def.web.range;
  let best = null;
  let bd = Infinity;
  for (const t of state.run.towers) {
    if (t.silenced > 0) continue;
    const d2 = dist2(e.x, e.y, t.x, t.y);
    if (d2 <= r2 && d2 < bd) {
      bd = d2;
      best = t;
    }
  }
  if (!best) {
    e.webT = 0.5; // menzilde kule yok: kısa süre sonra yeniden bakar
    return;
  }
  e.webT = def.web.every;
  silenceTower(best, def.web.duration, 'web');
  emit(EV.ABILITY, e, 'web', best.x, best.y, best);
}

function updateSummon(e, def, dt) {
  e.summonT -= dt;
  if (e.summonT > 0) return;
  e.summonT = def.summon.every;
  for (let i = 0; i < def.summon.count; i++) {
    spawnEnemy(def.summon.type, e.wave, e.d - 0.4 - i * 0.3, true, e.path);
  }
  emit(EV.BOSS_ABILITY, e, 'summon', e.x, e.y, 1);
}

/** Alev nefesi (Kül Ejderi, Anka), buz tepinmesi (Buzul Devi), boşluk patlaması. */
const SCORCH_KIND = { fire: 'scorch', frost: 'stomp', void: 'voidburst' };

function updateScorch(e, def, dt) {
  e.scorchT -= dt;
  if (e.scorchT > 0) return;
  e.scorchT = def.scorch.every;
  const { radius, duration, kind } = def.scorch;
  const r2 = radius * radius;
  for (const t of state.run.towers) {
    if (dist2(e.x, e.y, t.x, t.y) > r2) continue;
    silenceTower(t, duration, kind);
  }
  emit(EV.BOSS_ABILITY, e, SCORCH_KIND[kind] ?? 'scorch', e.x, e.y, radius);
}

/** Kış Kraliçesi: tipi — bütün kuleler bir süre yavaş ateş eder. */
function updateBlizzard(e, def, dt) {
  e.blizzT -= dt;
  if (e.blizzT > 0) return;
  e.blizzT = def.blizzard.every;
  const run = state.run;
  run.chill = Math.max(run.chill, def.blizzard.duration);
  run.chillRate = def.blizzard.rate;
  emit(EV.ABILITY, e, 'blizzard', e.x, e.y, def.blizzard.duration);
}

/** Çürük Ana: menzilindeki en değerli kuleleri lanetler (susturur). */
function updateHex(e, def, dt) {
  e.hexT -= dt;
  if (e.hexT > 0) return;
  const r2 = def.hex.range * def.hex.range;
  const list = state.run.towers.filter((t) => t.silenced <= 0 && dist2(e.x, e.y, t.x, t.y) <= r2);
  if (!list.length) {
    e.hexT = 0.6;
    return;
  }
  e.hexT = def.hex.every;
  list.sort((a, b) => b.invested - a.invested);
  const n = Math.min(def.hex.count, list.length);
  for (let i = 0; i < n; i++) silenceTower(list[i], def.hex.duration, 'hex');
  emit(EV.ABILITY, e, 'hex', e.x, e.y, n);
}

/** Örs Lordu: bir süre demirleşir, fiziksel hasar neredeyse işlemez. */
function updateHarden(e, def, dt) {
  e.hardCd -= dt;
  if (e.hardCd > 0 || e.hardT > 0) return;
  e.hardCd = def.harden.every;
  e.hardT = def.harden.duration;
  emit(EV.ABILITY, e, 'harden', e.x, e.y, def.harden.duration);
}

/** Öfkeli patron (Kâbus / "Öfkeli Patronlar"): arada bir kükrer, yakındaki kuleler susar. */
function updateRoar(e, dt) {
  e.roarT -= dt;
  if (e.roarT > 0) return;
  const { every, radius, duration } = BOSS_WRATH.roar;
  e.roarT = every;
  const r2 = radius * radius;
  for (const t of state.run.towers) if (dist2(e.x, e.y, t.x, t.y) <= r2) silenceTower(t, duration, 'roar');
  emit(EV.BOSS_ABILITY, e, 'roar', e.x, e.y, radius);
}

/** Seçkin doğma olasılığı: zorluk + Sonsuz Gece'de 30. dalgadan sonra artan pay. */
function eliteChance(w) {
  let p = diffOf().elites;
  if (state.run.mode === 'endless' && w > WAVE_COUNT) p += Math.min(ENDLESS.eliteMax, (w - WAVE_COUNT) * ENDLESS.elitePerWave);
  return p;
}

/** Can eşiklerinde kalkanlanır, durur ve çağırır (Gece Hükümdarı, Kara Hidra, Kadim Boşluk). */
function checkShield(e) {
  const def = ENEMIES[e.type];
  const sp = def.shieldPhases;
  if (!sp || e.shieldIdx >= sp.at.length) return;
  const at = sp.at[e.shieldIdx];
  if (e.hp > e.maxHp * at) return;
  e.hp = e.maxHp * at; // fazla hasar bir sonraki evreyi atlatamaz
  e.shieldIdx += 1;
  e.shieldT = sp.duration;
  e.slow = 0;
  e.slowT = 0;
  if (sp.regen) e.regenAdd += sp.regen;
  emit(EV.BOSS_PHASE, e, e.shieldIdx);
  for (let i = 0; i < sp.summon.count; i++) spawnEnemy(sp.summon.type, e.wave, e.d - 0.5 - i * 0.35, true, e.path);
  emit(EV.BOSS_ABILITY, e, 'summon', e.x, e.y, 1.4);
}

/* --------------------------------------------------------------------------
 * 7. HASAR, ÖLÜM, KAÇIŞ
 * ------------------------------------------------------------------------ */
/**
 * Hasar uygular. @returns {number} cana işleyen gerçek hasar
 * periodic: süreli hasar (sayı toplanıp ayrıca duyurulur)
 * pen: savunma delme oranı (Mızrak Atar)
 */
function hurt(e, raw, type, src, crit = false, periodic = false, pen = 0) {
  if (!e.alive || e.phased || e.shieldT > 0 || raw <= 0) return 0;
  let mult = 1 + e.cAmp;
  if (e.brittle > 0 && e.slowT > 0) mult *= 1 + e.brittle;
  let def = 0;
  if (type === 'phys') {
    def = e.armor;
    if (e.hardT > 0) mult *= ENEMIES[e.type].harden.phys;
  } else if (type === 'magic') {
    def = e.resist;
  }
  const shred = Math.max(e.cShred, e.meltT > 0 ? e.melt : 0);
  def = Math.min(def * (1 - shred) * (1 - pen), COMBAT.armorCap);
  let amount = raw * mult * (1 - def);
  if (e.ward > 0) {
    const soak = Math.min(e.ward, amount);
    e.ward -= soak;
    amount -= soak;
    if (e.ward <= 0.01) {
      e.ward = 0;
      e.wardT = 0;
    }
    if (amount <= 0) {
      if (!periodic) e.flash = FEEL.hitFlash;
      return 0;
    }
  }
  const dealt = Math.min(e.hp, amount);
  e.hp -= dealt;
  e.lastHit = state.run.time;
  if (src) src.damage += dealt;
  if (!periodic) {
    e.flash = FEEL.hitFlash;
    emit(EV.HIT, e, dealt, crit, type, false);
  }
  if (e.hp <= 0.001) kill(e, src);
  else checkShield(e);
  return dealt;
}

/** Tek hedefli mermi ıskaladı mı? (Kar Kuzgunu) Sersemlemiş/donmuş olan kaçamaz. */
function dodged(e) {
  const ev = ENEMIES[e.type].evasion;
  if (ev <= 0 || disabled(e) || !rng.chance(ev)) return false;
  emit(EV.STATUS, e, 'evade');
  return true;
}

function kill(e, src) {
  const run = state.run;
  const def = ENEMIES[e.type];
  // Kül Ankası ilk ölümünde küllerinden doğar
  if (def.rebirth && !e.reborn) {
    rebirth(e, def);
    return;
  }
  e.alive = false;
  e.hp = 0;
  const souls = Math.round(e.souls * (1 + e.cSouls));
  run.souls += souls;
  run.stats.kills += 1;
  run.stats.soulsEarned += souls;
  if (src) src.kills += 1;
  emit(EV.KILL, e, souls);
  if (souls > 0) emit(EV.SOULS, run.souls, souls);
  if (e.boss) {
    run.stats.bossKills += 1;
    emit(EV.BOSS_DIE, e);
  }
  if (def.spawnOnDeath) {
    for (let i = 0; i < def.spawnOnDeath.count; i++) {
      spawnEnemy(def.spawnOnDeath.type, e.wave, e.d + rng.spread(0, COMBAT.spawnSpread), true, e.path);
    }
  }
  if (def.deathBlast) {
    const { radius, duration } = def.deathBlast;
    const r2 = radius * radius;
    for (const t of run.towers) if (dist2(e.x, e.y, t.x, t.y) <= r2) silenceTower(t, duration, 'gas');
    emit(EV.ABILITY, e, 'deathblast', e.x, e.y, radius);
  }
  if (e.pSpread && e.pStacks > 0) spreadPoison(e);
  waveDone(e.wave);
}

function rebirth(e, def) {
  const { hp, radius, duration } = def.rebirth;
  e.reborn = true;
  e.hp = e.maxHp * hp;
  e.shieldT = 1.4; // doğarken dokunulmaz
  e.burnT = 0;
  e.pStacks = 0;
  e.pT = 0;
  e.slow = 0;
  e.slowT = 0;
  const r2 = radius * radius;
  for (const t of state.run.towers) if (dist2(e.x, e.y, t.x, t.y) <= r2) silenceTower(t, duration, 'fire');
  emit(EV.ABILITY, e, 'rebirth', e.x, e.y, radius);
  emit(EV.BOSS_PHASE, e, 9);
}

/** Kara Veba: ölen düşmanın zehri çevresine bulaşır. */
function spreadPoison(from) {
  const r2 = COMBAT.contagionRadius * COMBAT.contagionRadius;
  for (const o of state.run.enemies) {
    if (!o.alive || o === from || dist2(from.x, from.y, o.x, o.y) > r2) continue;
    o.pMax = Math.max(o.pMax, from.pMax);
    o.pStacks = Math.max(o.pStacks, from.pStacks);
    o.pDps = Math.max(o.pDps, from.pDps);
    o.pPct = Math.max(o.pPct, from.pPct);
    o.pT = Math.max(o.pT, from.pT, 2);
    o.pSpread = true;
    o.pSrc = from.pSrc;
  }
}

function leak(e) {
  const run = state.run;
  e.alive = false;
  const lost = Math.min(run.lives, e.lives);
  run.lives -= lost;
  run.stats.leaked += 1;
  emit(EV.LEAK, e, e.lives);
  emit(EV.LIVES, run.lives, -lost);
  // önce yenilgi: dalga temizlenince çalışan şifa (Ruh Kuyusu) düşmüş kaleyi geri getirmesin
  if (run.lives <= 0) endRun(false);
  waveDone(e.wave);
}

function endRun(victory) {
  const run = state.run;
  if (run.over) return;
  run.over = victory ? 'victory' : 'defeat';
  run.spawners.length = 0;
  run.countdown = null;
  run.effects.length = 0;
  run.chill = 0;
  // havada donup kalan mermiler sonuç ekranının arkasında tuhaf durur
  for (const p of projectiles) releaseProjectile(p);
  projectiles.length = 0;
  for (const t of run.towers) if (t.beam) t.beam.target = null;
  emit(EV.RUN_END, victory, {
    ...run.stats,
    wave: run.wave,
    lives: run.lives,
    difficulty: run.difficulty,
    mapId: run.mapId,
    mode: run.mode,
    mods: [...run.mods],
    challenge: run.challenge,
    daily: run.daily,
    carry: run.carry ? { ...run.carry } : null,
  });
}

/**
 * Kazanılan bölüm Sonsuz Gece olarak sürer: aynı kuleler, aynı can; dalgalar
 * 30'dan sonra biter. Zaferin ödülü ve rekoru zaten işlendi (carry: o ana kadarki
 * dalga, patron ve öldürme; sonraki ödül yalnızca bunların üstünden).
 * @returns {boolean} sürdürülebildiyse true
 */
export function continueEndless() {
  const run = state.run;
  if (!run || run.over !== 'victory' || run.mode !== 'campaign') return false;
  run.carry = { waves: run.wave, bosses: run.stats.bossKills, kills: run.stats.kills };
  run.mode = 'endless';
  run.over = null;
  run.countdown = null; // 31. dalgayı oyuncu başlatır
  run.eventT = nextEventDelay(true);
  wasClear = true;
  emit(EV.RUN_CONTINUE);
  emit(EV.WAVE_PREP, run.wave + 1, null);
  emit(EV.SAVEPOINT);
  return true;
}

/* --------------------------------------------------------------------------
 * 8. DURUM ETKİLERİ
 * ------------------------------------------------------------------------ */
function applySlow(e, st) {
  if (st.slow <= 0 || !e.alive || immuneTo(e, 'slow')) return;
  e.slow = Math.max(e.slow, st.slow);
  e.slowT = Math.max(e.slowT, st.slowDur);
  if (st.brittle > 0) e.brittle = Math.max(e.brittle, st.brittle);
}

function canDisable(e) {
  return e.alive && !(e.boss && COMBAT.bossStunImmune) && e.grace <= 0 && e.freezeT <= 0 && e.stunT <= 0 && e.shieldT <= 0;
}

function tryFreeze(e, st) {
  if (st.freezeChance <= 0 || !canDisable(e) || immuneTo(e, 'freeze') || !rng.chance(st.freezeChance)) return;
  e.freezeT = st.freezeDur;
  emit(EV.STATUS, e, 'freeze');
}

function stunFor(e, seconds) {
  if (!canDisable(e) || immuneTo(e, 'stun')) return false;
  e.stunT = seconds;
  emit(EV.STATUS, e, 'stun');
  return true;
}

function tryStun(e, st) {
  if (st.stunChance <= 0 || !rng.chance(st.stunChance)) return;
  stunFor(e, st.stunDur);
}

function applyBurn(e, st, src) {
  if (st.burnDps <= 0 || !e.alive || immuneTo(e, 'burn')) return;
  e.burnDps = Math.max(e.burnDps, st.burnDps);
  e.burnT = Math.max(e.burnT, st.burnDur);
  e.bSrc = src;
}

function applyPoison(e, st, src) {
  if (st.poisonDps <= 0 || !e.alive) return;
  e.pMax = Math.max(e.pMax, st.poisonMax);
  e.pStacks = Math.min(e.pMax, e.pStacks + 1);
  e.pDps = Math.max(e.pDps, st.poisonDps);
  e.pPct = Math.max(e.pPct, st.poisonPctHp);
  e.pT = st.poisonDur;
  e.pSrc = src;
  if (st.contagion > 0) e.pSpread = true;
}

/** Düşmanı yolunda geriye iter (tomruk, zıpkın, girdap). Boss'lar az etkilenir. */
function pushBack(e, dist) {
  if (!e.alive || dist <= 0 || immuneTo(e, 'push')) return;
  const poly = polyOf(e);
  e.d = Math.max(0, e.d - dist * (e.boss ? 0.25 : 1));
  e.rem = poly.length - e.d;
  samplePolyline(poly, e.d, e);
}

/** Kuleyi susturur. kind yalnızca görüntü ve ses içindir. */
function silenceTower(t, duration, kind) {
  t.silenced = Math.max(t.silenced, duration);
  t.silenceKind = kind;
  t.target = null;
  if (t.beam) t.beam.target = null;
  emit(EV.SILENCE, t, duration);
}

/* --------------------------------------------------------------------------
 * 9. KULELER — hedef seçimi, dönüş, ateş, destek ve ekonomi
 * ------------------------------------------------------------------------ */
function canHit(def, e) {
  return e.flying ? def.targetsAir : def.targetsGround;
}

function score(t, e, d2) {
  switch (t.targetMode) {
    case 'last': return e.rem;
    case 'strong': return e.hp;
    case 'close': return -d2;
    default: return -e.rem; // 'first': kaleye en yakın
  }
}

/** En iyi hedef. Kalkanlı boss'a yalnızca başka seçenek yoksa ateş edilir. */
function pickTarget(t, st, def) {
  const r2 = st.range * st.range;
  let best = null;
  let bestScore = -Infinity;
  for (const e of state.run.enemies) {
    if (!targetable(e) || !canHit(def, e)) continue;
    const d2 = dist2(t.x, t.y, e.x, e.y);
    if (d2 > r2) continue;
    const s = score(t, e, d2) - (e.shieldT > 0 ? 1e9 : 0);
    if (s > bestScore) {
      bestScore = s;
      best = e;
    }
  }
  return best;
}

const pickBuf = [];
/** Ok Yağmuru için n farklı hedef (en iyi skorlardan). */
function pickTargets(t, st, def, n) {
  const r2 = st.range * st.range;
  pickBuf.length = 0;
  for (const e of state.run.enemies) {
    if (!targetable(e) || !canHit(def, e)) continue;
    const d2 = dist2(t.x, t.y, e.x, e.y);
    if (d2 <= r2) pickBuf.push(e);
  }
  pickBuf.sort((a, b) => score(t, b, dist2(t.x, t.y, b.x, b.y)) - score(t, a, dist2(t.x, t.y, a.x, a.y)));
  if (pickBuf.length > n) pickBuf.length = n;
  return pickBuf;
}

function stillValid(t, st, def) {
  const e = t.target;
  if (!e || !targetable(e) || !canHit(def, e)) return false;
  return dist2(t.x, t.y, e.x, e.y) <= st.range * st.range;
}

/** Savaş Çanı güçlendirmeleri: her adım yeniden hesaplanır (birikmez, en güçlüsü geçer). */
function applyTowerAuras() {
  const towers = state.run.towers;
  for (const t of towers) {
    t.bRate = 0;
    t.bDmg = 0;
    t.bRange = 0;
  }
  for (const b of towers) {
    if (b.type !== 'bell' || b.silenced > 0) continue;
    const st = statsOf(b);
    const r2 = st.range * st.range;
    for (const t of towers) {
      if (t === b) continue;
      const d = TOWERS[t.type];
      if (d.support || d.economy || dist2(b.x, b.y, t.x, t.y) > r2) continue;
      if (t.bRate < st.buffRate) t.bRate = st.buffRate;
      if (t.bDmg < st.buffDmg) t.bDmg = st.buffDmg;
      if (t.bRange < st.buffRange) t.bRange = st.buffRange;
    }
  }
  if (hasMod('fog')) for (const t of towers) t.bRange += MODIFIERS.fog.range; // "Sis": bütün menziller kısa
}

function updateTower(t, dt, chill) {
  t.buildT = Math.min(1, t.buildT + dt / FEEL.buildTime);
  t.recoil = approach(t.recoil, 0, FEEL.recoil.distance * FEEL.recoil.recover * dt);
  t.flash = Math.max(0, t.flash - dt * 1.5);
  t.cooldown -= dt * chill;
  if (t.silenced > 0) {
    t.silenced = Math.max(0, t.silenced - dt);
    return;
  }
  const def = TOWERS[t.type];
  const st = liveStats(t);
  if (t.type === 'curse') {
    curseTotem(t, st);
    return;
  }
  if (def.economy) {
    wellTick(t, st, dt);
    return;
  }
  if (def.support) {
    bellTick(t, st);
    return;
  }
  if (def.projectile === 'beam') {
    beamTower(t, st, def, dt * chill);
    return;
  }
  t.retarget = (t.retarget ?? 0) - dt; // en iyi hedef 0.12 sn'de bir yeniden seçilir
  if (!stillValid(t, st, def) || t.retarget <= 0) {
    t.target = pickTarget(t, st, def);
    t.retarget = 0.12;
  }
  const e = t.target;
  if (!e) return;
  const want = Math.atan2(aimY(e) - (t.y - MUZZLE[t.type]), e.x - t.x);
  t.angle = rotateTowards(t.angle, want, FEEL.towerTurnRate * dt);
  if (t.cooldown > 0) return;
  if (AIMS[t.type] && Math.abs(angleDelta(t.angle, want)) > 0.35) return;
  fire(t, st, def, e);
}

function fire(t, st, def, e) {
  t.cooldown = 1 / st.rate;
  t.recoil = FEEL.recoil.distance;
  emit(EV.FIRE, t, e);
  switch (def.projectile) {
    case 'arrow': {
      const list = st.multishot > 1 ? pickTargets(t, st, def, st.multishot) : null;
      if (list && list.length > 0) for (const tg of list) shootArrow(t, st, def, tg);
      else shootArrow(t, st, def, e);
      break;
    }
    case 'bullet':
      shootArrow(t, st, def, e, 'bullet');
      break;
    case 'shard':
      launchHoming('shard', t, st, def, e, st.damage, false);
      break;
    case 'shell':
    case 'glob':
      launchLob(def.projectile, t, st, def, e);
      break;
    case 'bolt':
      chainLightning(t, st, e);
      break;
    case 'lance':
      launchLance(t, st, def, e);
      break;
    case 'cone':
      flameCone(t, st, def, e);
      break;
    default:
      break;
  }
}

function shootArrow(t, st, def, e, kind = 'arrow') {
  const crit = st.crit > 0 && rng.chance(st.crit);
  launchHoming(kind, t, st, def, e, st.damage * (crit ? st.critMult : 1), crit);
}

/** Fırtına Kulesi: hedefler arasında seken, her sekmede zayıflayan şimşek. */
function chainLightning(t, st, first) {
  const hit = [];
  let cur = first;
  let dmg = st.damage;
  let fx = t.x;
  let fy = t.y - MUZZLE.tesla;
  const cr2 = st.chainRange * st.chainRange;
  for (let hop = 0; hop <= st.chains && cur; hop++) {
    const ty = aimY(cur);
    emit(EV.BOLT, fx, fy, cur.x, ty, hop);
    hurt(cur, dmg, 'magic', t);
    tryStun(cur, st);
    hit.push(cur);
    fx = cur.x;
    fy = ty;
    let next = null;
    let bestD = Infinity;
    for (const o of state.run.enemies) {
      if (!targetable(o) || hit.includes(o)) continue;
      const d2 = dist2(cur.x, cur.y, o.x, o.y);
      if (d2 <= cr2 && d2 < bestD) {
        bestD = d2;
        next = o;
      }
    }
    cur = next;
    dmg *= st.chainFalloff;
  }
}

/** Lanet Totemi: aura her adım yenilenir; nabız menzildekilere hasar verir. */
function curseTotem(t, st) {
  if (t.cooldown > 0) return;
  const r2 = st.range * st.range;
  let any = false;
  for (const e of state.run.enemies) {
    if (e.alive && dist2(t.x, t.y, e.x, e.y) <= r2) {
      any = true;
      break;
    }
  }
  if (!any) return;
  t.cooldown = 1 / st.rate;
  emit(EV.FIRE, t, null);
  for (const e of state.run.enemies) {
    if (e.alive && dist2(t.x, t.y, e.x, e.y) <= r2) hurt(e, st.damage, 'magic', t);
  }
}

/** Her adımın başında lanet auralarını düşmanlara işler (birikmez, en güçlüsü geçer). */
function applyCurseAuras() {
  const run = state.run;
  for (const e of run.enemies) {
    e.cAmp = 0;
    e.cShred = 0;
    e.cSlow = 0;
    e.cSouls = 0;
    e.cursed = false;
  }
  for (const t of run.towers) {
    if (t.type !== 'curse' || t.silenced > 0) continue;
    const st = liveStats(t);
    const r2 = st.range * st.range;
    for (const e of run.enemies) {
      if (!e.alive || dist2(t.x, t.y, e.x, e.y) > r2) continue;
      e.cursed = true;
      e.cAmp = Math.max(e.cAmp, st.auraAmp);
      e.cShred = Math.max(e.cShred, st.auraShred);
      e.cSlow = Math.max(e.cSlow, immuneTo(e, 'slow') ? 0 : st.auraSlow);
      e.cSouls = Math.max(e.cSouls, st.auraSouls);
    }
  }
}

/**
 * Kristal Prizma: sürekli ışın. Aynı hedefte kaldıkça ısınır (rampTime
 * saniyede rampMax katına çıkar); hedef değişince soğur. Kırılan Işık
 * ustalığı ana hedefin yakınındaki birkaç düşmana daha ince ışınlar yollar.
 * render için: t.beam = { target, k (0..1 ısınma), forks[] }
 */
function beamTower(t, st, def, dt) {
  const b = t.beam ?? (t.beam = { target: null, ramp: 0, k: 0, forks: [], hum: 0 });
  let e = b.target;
  if (!e || !targetable(e) || !canHit(def, e) || dist2(t.x, t.y, e.x, e.y) > st.range * st.range) {
    e = pickTarget(t, st, def);
    if (e !== b.target) b.ramp = 0;
    b.target = e;
  }
  b.forks.length = 0;
  if (!e) {
    b.k = 0;
    b.ramp = 0;
    return;
  }
  b.ramp = Math.min(st.rampTime, b.ramp + dt);
  b.k = b.ramp / st.rampTime;
  const mult = 1 + (st.rampMax - 1) * b.k;
  t.angle = Math.atan2(aimY(e) - (t.y - MUZZLE.prism), e.x - t.x);
  if (st.forks > 0) {
    const r2 = 1.8 * 1.8;
    for (let k = 0; k < st.forks; k++) {
      let next = null;
      let bd = Infinity;
      for (const o of state.run.enemies) {
        if (o === e || !targetable(o) || !canHit(def, o) || b.forks.includes(o)) continue;
        const d2 = dist2(e.x, e.y, o.x, o.y);
        if (d2 <= r2 && d2 < bd) {
          bd = d2;
          next = o;
        }
      }
      if (!next) break;
      b.forks.push(next);
    }
    for (const f of b.forks) f.dotB += hurt(f, st.dps * st.forkMult * mult * dt, 'magic', t, false, true);
  }
  e.dotB += hurt(e, st.dps * mult * dt, 'magic', t, false, true);
  b.hum -= dt;
  if (b.hum <= 0) {
    b.hum = 0.6;
    emit(EV.FIRE, t, e);
  }
}

/** Ejder Ağzı: önündeki koni içindeki yer düşmanlarını yakar (Alev Çemberi: her yön). */
function flameCone(t, st, def, target) {
  const ang = Math.atan2(target.y - t.y, target.x - t.x);
  const r2 = st.range * st.range;
  const ring = st.cone >= Math.PI - 0.01;
  for (const o of state.run.enemies) {
    if (!targetable(o) || !canHit(def, o)) continue;
    const d2 = dist2(t.x, t.y, o.x, o.y);
    if (d2 > r2) continue;
    if (!ring && d2 > 0.04 && Math.abs(angleDelta(ang, Math.atan2(o.y - t.y, o.x - t.x))) > st.cone) continue;
    o.dotB += hurt(o, st.damage, 'magic', t, false, true);
    if (!o.alive) continue;
    applyBurn(o, st, t);
    if (st.melt > 0 && !immuneTo(o, 'burn')) {
      o.melt = Math.max(o.melt, st.melt);
      o.meltT = Math.max(o.meltT, st.burnDur);
    }
  }
}

/** Savaş Çanı: güçlendirme applyTowerAuras'ta; Ölüm Çanı ayrıca nabızla sersemletir. */
function bellTick(t, st) {
  if (st.knell <= 0 || t.cooldown > 0) return;
  const r2 = st.range * st.range;
  let any = false;
  for (const e of state.run.enemies) {
    if (targetable(e) && dist2(t.x, t.y, e.x, e.y) <= r2) {
      any = true;
      break;
    }
  }
  if (!any) return;
  t.cooldown = 1 / st.rate;
  emit(EV.FIRE, t, null);
  for (const e of state.run.enemies) {
    if (!targetable(e) || dist2(t.x, t.y, e.x, e.y) > r2) continue;
    hurt(e, st.damage, 'magic', t);
    if (e.alive) stunFor(e, st.knell);
  }
  emit(EV.IMPACT, t.x, t.y, st.range, 'knell');
}

/** Ruh Kuyusu: savaş sürerken (sahada düşman ya da doğum varken) düzenli ruh üretir. */
function wellTick(t, st, dt) {
  const run = state.run;
  if (run.spawners.length === 0 && run.enemies.length === 0) return; // hazırlıkta durur
  t.genT -= dt;
  if (t.genT > 0) return;
  t.genT = st.soulEvery;
  const amount = Math.max(1, Math.round(st.soulGen * SCALING.souls(waveNow()) * diffOf().souls));
  run.souls += amount;
  run.stats.soulsEarned += amount;
  t.souls += amount;
  emit(EV.GENERATE, t, amount, 'souls');
  emit(EV.SOULS, run.souls, amount);
}

/* --------------------------------------------------------------------------
 * 10. MERMİLER
 *  homing: ok, kurşun ve buz kıymığı hedefi kovalar.
 *  lob   : gülle ve zehir topu, hedefin varacağı yere kavis çizerek düşer
 *          (hedefin yoldaki hızına göre önden nişan alınır).
 *  lance : düz bir çizgide uçar, değdiği düşmanları sırayla deler.
 *  render için alanlar: kind, type, x, y, z (yükseklik), angle, mastery
 * ------------------------------------------------------------------------ */
export const projectiles = [];
const projPool = createPool(() => ({
  kind: '', type: '', mastery: -1, src: null, stats: null,
  x: 0, y: 0, z: 0, sx: 0, sy: 0, tx: 0, ty: 0, angle: 0,
  target: null, speed: 0, dmg: 0, crit: false, dmgType: 'phys',
  t: 0, dur: 0, h: 0, homing: false,
  vx: 0, vy: 0, travel: 0, pierce: 0, hitIds: [],
}), 32);
const predict = { x: 0, y: 0, angle: 0, seg: 0 };

function releaseProjectile(p) {
  p.target = null;
  p.src = null;
  p.stats = null;
  p.hitIds.length = 0;
  projPool.release(p);
}

function newProjectile(kind, t, st, def) {
  const p = projPool.acquire();
  p.kind = kind;
  p.type = t.type;
  p.mastery = t.mastery;
  p.src = t;
  p.stats = st;
  p.dmgType = def.dmgType;
  p.x = p.sx = t.x + Math.cos(t.angle) * 0.25;
  p.y = p.sy = t.y - MUZZLE[t.type] + Math.sin(t.angle) * 0.25;
  p.z = 0;
  p.t = 0;
  p.crit = false;
  p.hitIds.length = 0;
  projectiles.push(p);
  return p;
}

function launchHoming(kind, t, st, def, e, dmg, crit) {
  const p = newProjectile(kind, t, st, def);
  p.homing = true;
  p.target = e;
  p.tx = e.x;
  p.ty = aimY(e);
  p.speed = def.projSpeed;
  p.dmg = dmg;
  p.crit = crit;
  p.angle = Math.atan2(p.ty - p.y, p.tx - p.x);
}

function launchLob(kind, t, st, def, e) {
  const p = newProjectile(kind, t, st, def);
  p.homing = false;
  p.target = null;
  const dist = Math.hypot(e.x - p.x, e.y - p.y);
  const flight = Math.max(0.35, dist / def.projSpeed);
  const poly = polyOf(e);
  samplePolyline(poly, Math.min(e.d + e.v * flight, poly.length), predict);
  p.tx = predict.x;
  p.ty = predict.y;
  p.dur = Math.max(0.35, Math.hypot(p.tx - p.sx, p.ty - p.sy) / def.projSpeed);
  p.h = 0.5 + dist * 0.18;
  p.dmg = st.damage;
  p.angle = Math.atan2(p.ty - p.sy, p.tx - p.sx);
}

function launchLance(t, st, def, e) {
  const p = newProjectile('lance', t, st, def);
  p.homing = false;
  p.target = null;
  const dx = e.x - p.x;
  const dy = aimY(e) - p.y;
  const d = Math.hypot(dx, dy) || 1;
  p.vx = dx / d;
  p.vy = dy / d;
  p.travel = st.range + 0.9;
  p.speed = def.projSpeed;
  p.dmg = st.damage;
  p.pierce = Math.max(1, st.pierce);
  p.angle = Math.atan2(dy, dx);
}

function updateProjectiles(dt) {
  let w = 0;
  for (let i = 0; i < projectiles.length; i++) {
    const p = projectiles[i];
    const alive = p.kind === 'lance' ? stepLance(p, dt) : p.homing ? stepHoming(p, dt) : stepLob(p, dt);
    if (alive) projectiles[w++] = p;
    else releaseProjectile(p);
  }
  projectiles.length = w;
}

/** @returns {boolean} mermi hâlâ uçuyor mu */
function stepHoming(p, dt) {
  const e = p.target;
  if (e && targetable(e)) {
    p.tx = e.x;
    p.ty = aimY(e);
  } else {
    p.target = null;
  }
  const dx = p.tx - p.x;
  const dy = p.ty - p.y;
  const d = Math.hypot(dx, dy);
  const step = p.speed * dt;
  p.angle = Math.atan2(dy, dx);
  if (d > step && d > 0.12) {
    p.x += (dx / d) * step;
    p.y += (dy / d) * step;
    return true;
  }
  p.x = p.tx;
  p.y = p.ty;
  impact(p, p.target);
  return false;
}

function stepLob(p, dt) {
  p.t += dt / p.dur;
  const k = Math.min(1, p.t);
  p.x = lerp(p.sx, p.tx, k);
  p.y = lerp(p.sy, p.ty, k);
  p.z = p.h * 4 * k * (1 - k);
  if (k < 1) return true;
  impact(p, null);
  return false;
}

/** Mızrak: düz uçar; yolundaki her düşmana bir kez değer, delme hakkı bitince durur. */
function stepLance(p, dt) {
  const step = p.speed * dt;
  p.x += p.vx * step;
  p.y += p.vy * step;
  p.travel -= step;
  const def = TOWERS[p.type];
  const src = state.run.towerById.get(p.src?.id) ?? null;
  for (const e of state.run.enemies) {
    if (!targetable(e) || !canHit(def, e) || p.hitIds.includes(e.id)) continue;
    const r = 0.2 + e.size * 0.6;
    if (dist2(p.x, p.y, e.x, aimY(e)) > r * r) continue;
    p.hitIds.push(e.id);
    if (dodged(e)) continue; // kuzgun kaçtı: delme hakkı harcanmaz
    const st = p.stats;
    hurt(e, p.dmg, 'phys', src, false, false, st.armorPierce);
    if (e.alive && st.pull > 0) pushBack(e, st.pull);
    if (e.alive) applySlow(e, st);
    emit(EV.IMPACT, e.x, aimY(e), 0.25, p.mastery === 1 ? 'harpoon' : 'lance');
    p.pierce -= 1;
    if (p.pierce <= 0) return false;
  }
  return p.travel > 0;
}

/** Alan içindeki düşmanları dolaşır (yere düşen mermiler için). */
function forEachInRadius(x, y, r, air, fn) {
  const r2 = r * r;
  for (const e of state.run.enemies) {
    if (!targetable(e) || (e.flying && !air)) continue;
    const d2 = dist2(x, y, e.x, e.y);
    if (d2 <= r2) fn(e, Math.sqrt(d2));
  }
}

function impact(p, target) {
  const st = p.stats;
  // satılmış kule kredi almaz; ana kulenin kimliği yoktur, kendisi yazılır
  const src = p.src?.castle ? p.src : state.run.towerById.get(p.src?.id) ?? null;
  switch (p.kind) {
    case 'arrow':
      if (target && !dodged(target)) hurt(target, p.dmg, p.dmgType, src, p.crit);
      break;
    case 'bullet': {
      if (!target || dodged(target)) break;
      let dmg = p.dmg;
      if (target.boss) dmg *= 1 + st.bossBonus;
      else if (ENEMIES[target.type].lives >= 2) dmg *= 1 + st.bigBonus;
      hurt(target, dmg, p.dmgType, src, p.crit);
      if (st.execute > 0 && target.alive && !target.boss && target.hp < target.maxHp * st.execute) {
        emit(EV.STATUS, target, 'execute');
        kill(target, src);
      }
      break;
    }
    case 'shard': {
      const cx = target ? target.x : p.x;
      const cy = target ? target.y : p.y + 0.3;
      forEachInRadius(cx, cy, st.splash, true, (e) => {
        hurt(e, p.dmg, p.dmgType, src);
        applySlow(e, st);
        tryFreeze(e, st);
      });
      emit(EV.IMPACT, cx, cy, st.splash, 'shard');
      break;
    }
    case 'shell': {
      const kind = p.mastery === 0 ? 'hellmaw' : p.mastery === 1 ? 'quake' : 'shell';
      forEachInRadius(p.tx, p.ty, st.splash, false, (e, d) => {
        const falloff = 1 - 0.5 * (d / st.splash);
        hurt(e, p.dmg * falloff, p.dmgType, src);
        applyBurn(e, st, src);
        tryStun(e, st);
      });
      emit(EV.IMPACT, p.tx, p.ty, st.splash, kind);
      break;
    }
    case 'glob':
      forEachInRadius(p.tx, p.ty, st.splash, true, (e) => {
        hurt(e, p.dmg, p.dmgType, src);
        applyPoison(e, st, src);
      });
      emit(EV.IMPACT, p.tx, p.ty, st.splash, 'glob');
      break;
    default:
      break;
  }
}

/* --------------------------------------------------------------------------
 * 11. ANA KULE — balistası kaleye en yaklaşmış düşmana ateş eder
 *  Hasar dalgayla büyür (SCALING.hp^waveGrowth): geç oyunda da anlamlı kalır.
 *  Gözcü Burcu menzili ve atış hızını artırır.
 * ------------------------------------------------------------------------ */
/** Ana kulenin şu anki atış değerleri (arayüz ve test için). */
export function keepStats() {
  const run = state.run;
  const A = CASTLE.attack;
  const k = run.castle;
  const growth = SCALING.hp(Math.max(1, run.wave)) ** A.waveGrowth;
  return { damage: A.damage * k.damageMult * growth, rate: A.rate * k.rateMult, range: A.range + k.rangeBonus };
}

function updateKeep(dt) {
  const k = state.run.castle;
  if (!k) return;
  k.cooldown -= dt;
  const st = keepStats();
  const r2 = st.range * st.range;
  k.retarget -= dt;
  const cur = k.target;
  if (!cur || !targetable(cur) || dist2(k.x, k.y, cur.x, cur.y) > r2 || k.retarget <= 0) {
    k.retarget = 0.15;
    let best = null;
    for (const e of state.run.enemies) {
      if (!targetable(e) || dist2(k.x, k.y, e.x, e.y) > r2) continue;
      if (!best || e.rem < best.rem) best = e;
    }
    k.target = best;
  }
  const e = k.target;
  if (!e) return;
  const want = Math.atan2(aimY(e) - k.y, e.x - k.x);
  k.angle = rotateTowards(k.angle, want, FEEL.towerTurnRate * dt);
  if (k.cooldown > 0) return;
  k.cooldown = 1 / st.rate;
  emit(EV.FIRE, k, e);
  const p = projPool.acquire();
  p.kind = 'arrow';
  p.type = 'archer';
  p.mastery = 0;          // altın ok görünümü
  p.src = k;              // impact() ana kuleyi tanır: öldürme ve hasar ona yazılır
  p.stats = null;
  p.dmgType = 'phys';
  p.x = p.sx = k.x + Math.cos(k.angle) * 0.2;
  p.y = p.sy = k.y + Math.sin(k.angle) * 0.2;
  p.z = 0;
  p.t = 0;
  p.crit = false;
  p.homing = true;
  p.target = e;
  p.tx = e.x;
  p.ty = aimY(e);
  p.speed = CASTLE.attack.speed;
  p.dmg = st.damage;
  p.angle = Math.atan2(p.ty - p.y, p.tx - p.x);
  p.hitIds.length = 0;
  projectiles.push(p);
}

/* --------------------------------------------------------------------------
 * 12. YETENEKLER — yan kulelerin taşıdığı güçler
 *  İlk kullanım ücretsiz; sonrakiler sabit bir ruh bedeli ister.
 *  Hasar dalganın can ölçeğiyle büyür. Etkiler run.effects'te yaşar,
 *  kayda girmez (kayıt yalnızca saha boşken alınır).
 *  Rün Ocağı bekleme sürelerini kısaltır (sk.cdMax).
 * ------------------------------------------------------------------------ */
const waveNow = () => Math.max(1, state.run.wave);

/**
 * i. yeteneğin şu anki ruh bedeli (ilk kullanımda 0). Bedel sabittir; hasar
 * dalgayla büyüdüğü için yetenek geç oyunda da değerli kalır, sınırı bekleme süresidir.
 */
export function skillCost(i) {
  const s = state.run?.skills[i];
  if (!s || !s.freeUsed) return 0;
  return SKILLS[s.id].soulCost;
}

/** reason: 'over' | 'empty' | 'cooldown' | 'souls' | 'full' (Kutsal Onarım: can zaten tam) */
export function canCast(i) {
  const run = state.run;
  if (!run || run.over) return { ok: false, reason: 'over' };
  const s = run.skills[i];
  if (!s) return { ok: false, reason: 'empty' };
  if (s.cd > 0) return { ok: false, reason: 'cooldown' };
  if (s.id === 'mend' && run.lives >= run.maxLives) return { ok: false, reason: 'full' };
  if (run.souls < skillCost(i)) return { ok: false, reason: 'souls' };
  return { ok: true, reason: '' };
}

/** Yeteneği kullanır. Alan yetenekleri (x, y) dünya noktası ister. */
export function cast(i, x, y) {
  const check = canCast(i);
  if (!check.ok) return false;
  const run = state.run;
  const s = run.skills[i];
  const def = SKILLS[s.id];
  if (def.target === 'area' && !(Number.isFinite(x) && Number.isFinite(y))) return false;
  const cost = skillCost(i);
  if (cost > 0) {
    run.souls -= cost;
    emit(EV.SOULS, run.souls, -cost);
  }
  s.freeUsed = true;
  s.cd = s.cdMax;
  run.stats.skillsUsed += 1;
  const lv = s.level - 1;
  const grow = SCALING.hp(waveNow());
  const dmg = def.damage ? def.damage[lv] * grow : 0;
  const { castle } = state.map;
  switch (s.id) {
    case 'log': {
      // her yoldan bir tomruk: ortak yolda aynı düşmana iki kez çarpmaz
      const hit = new Set();
      state.map.polys.forEach((poly, lane) => {
        const fx = { kind: 'log', lane, d: poly.length - 0.6, speed: def.speed, width: def.width, dmg, push: def.push, hit, roll: 0, x: 0, y: 0, angle: 0, seg: 0 };
        samplePolyline(poly, fx.d, fx);
        run.effects.push(fx);
      });
      emit(EV.SKILL, 'log', 'cast', castle.x, castle.y - 1, s.level);
      break;
    }
    case 'meteor':
      run.effects.push({ kind: 'meteor', x, y, t: 0, delay: def.delay, dmg, radius: def.radius, burn: { burnDps: dmg * def.burn, burnDur: def.burnDur } });
      emit(EV.SKILL, 'meteor', 'cast', x, y, def.radius);
      break;
    case 'frost': {
      const slow = def.slow[lv];
      const dur = def.duration[lv];
      emit(EV.SKILL, 'frost', 'cast', castle.x, castle.y, dur);
      for (const e of run.enemies) {
        if (!e.alive) continue;
        hurt(e, dmg, 'magic', null);
        if (!e.alive || immuneTo(e, 'slow')) continue;
        e.slow = Math.max(e.slow, slow);
        e.slowT = Math.max(e.slowT, dur);
        emit(EV.SKILL, 'frost', 'hit', e.x, e.y, 0);
      }
      break;
    }
    case 'thunder': {
      emit(EV.SKILL, 'thunder', 'cast', castle.x, castle.y, def.count[lv]);
      const list = run.enemies.filter(targetable).sort((a, b) => b.hp - a.hp).slice(0, def.count[lv]);
      list.forEach((e, k) => {
        emit(EV.SKILL, 'thunder', 'hit', e.x, aimY(e), k);
        hurt(e, dmg, 'magic', null);
        if (e.alive) stunFor(e, def.stun);
      });
      break;
    }
    case 'timestop': {
      const dur = def.duration[lv];
      emit(EV.SKILL, 'timestop', 'cast', castle.x, castle.y, dur);
      for (const e of run.enemies) {
        if (!e.alive) continue;
        if (e.boss) {
          e.slow = Math.max(e.slow, def.bossSlow);
          e.slowT = Math.max(e.slowT, dur);
        } else {
          e.stopT = Math.max(e.stopT, dur);
          emit(EV.STATUS, e, 'stop');
        }
      }
      break;
    }
    case 'plague':
      run.effects.push({ kind: 'plague', x, y, t: 0, dur: def.duration[lv], dps: dmg, radius: def.radius, tick: 0 });
      emit(EV.SKILL, 'plague', 'cast', x, y, def.radius);
      break;
    case 'mend': {
      const add = Math.min(def.heal[lv], run.maxLives - run.lives);
      run.lives += add;
      emit(EV.SKILL, 'mend', 'cast', castle.x, castle.y, add);
      emit(EV.LIVES, run.lives, add);
      break;
    }
    case 'vortex':
      run.effects.push({ kind: 'vortex', x, y, t: 0, delay: def.delay, dmg, radius: def.radius, pull: def.pull[lv], done: false });
      emit(EV.SKILL, 'vortex', 'cast', x, y, def.radius);
      break;
    case 'reaper': {
      const exec = def.execute[lv];
      emit(EV.SKILL, 'reaper', 'cast', castle.x, castle.y, exec);
      run.effects.push({ kind: 'reaper', t: 0, dur: 0.7 });
      for (const e of run.enemies) {
        if (!targetable(e)) continue;
        if (!e.boss && e.hp <= e.maxHp * exec) {
          emit(EV.SKILL, 'reaper', 'hit', e.x, e.y, 1);
          kill(e, null);
        } else {
          hurt(e, dmg, 'magic', null);
          emit(EV.SKILL, 'reaper', 'hit', e.x, e.y, 0);
        }
      }
      break;
    }
    default:
      break;
  }
  return true;
}

function updateEffects(dt) {
  const run = state.run;
  for (const s of run.skills) if (s.cd > 0) s.cd = Math.max(0, s.cd - dt);
  let w = 0;
  for (let i = 0; i < run.effects.length; i++) {
    const fx = run.effects[i];
    let keep;
    switch (fx.kind) {
      case 'log': keep = stepLog(fx, dt); break;
      case 'meteor': keep = stepMeteor(fx, dt); break;
      case 'plague': keep = stepPlague(fx, dt); break;
      case 'vortex': keep = stepVortex(fx, dt); break;
      case 'ev_rise': keep = stepRise(fx, dt); break;
      case 'ev_blizzard': keep = stepBlizzard(fx, dt); break;
      case 'ev_gas': keep = stepGas(fx, dt); break;
      case 'ev_lava': keep = stepLava(fx, dt); break;
      case 'ev_rift': keep = stepRift(fx, dt); break;
      default:
        fx.t += dt;
        keep = fx.t < fx.dur;
        break;
    }
    if (keep) run.effects[w++] = fx;
  }
  run.effects.length = w;
}

/**
 * Tomruk: yol boyunca kaleden geçide yuvarlanır, her yer düşmanına bir kez
 * çarpar. İki yollu haritada her yolda bir tomruk vardır; ortak parçada
 * ikisi üst üste yuvarlanır, ortak "hit" kümesi çifte vuruşu önler.
 */
function stepLog(fx, dt) {
  const poly = state.map.polys[fx.lane];
  fx.d -= fx.speed * dt;
  fx.roll += fx.speed * dt;
  if (fx.d <= 0) return false;
  samplePolyline(poly, fx.d, fx);
  for (const e of state.run.enemies) {
    if (!targetable(e) || e.flying || e.path !== fx.lane || fx.hit.has(e.id)) continue;
    if (Math.abs(e.d - fx.d) > fx.width) continue;
    fx.hit.add(e.id);
    hurt(e, fx.dmg, 'phys', null);
    emit(EV.SKILL, 'log', 'hit', e.x, e.y, 0);
    if (e.alive) pushBack(e, fx.push);
  }
  return true;
}

/** Meteor: kısa bir düşüşten sonra alana çarpar ve tutuşturur. */
function stepMeteor(fx, dt) {
  fx.t += dt;
  if (fx.t < fx.delay) return true;
  forEachInRadius(fx.x, fx.y, fx.radius, true, (e, d) => {
    hurt(e, fx.dmg * (1 - 0.35 * (d / fx.radius)), 'magic', null);
    applyBurn(e, fx.burn, null);
  });
  emit(EV.SKILL, 'meteor', 'impact', fx.x, fx.y, fx.radius);
  return false;
}

/** Veba Bulutu: alanda kalanlar saf hasar alır ve zehirlenir (yenilenme durur, şifa yarıya iner). */
function stepPlague(fx, dt) {
  fx.t += dt;
  if (fx.t >= fx.dur) return false;
  forEachInRadius(fx.x, fx.y, fx.radius, true, (e) => {
    e.dotP += hurt(e, fx.dps * dt, 'pure', null, false, true);
    if (!e.alive) return;
    if (e.pStacks <= 0) {
      e.pStacks = 1;
      e.pMax = Math.max(e.pMax, 1);
    }
    e.pT = Math.max(e.pT, 0.4);
  });
  fx.tick -= dt;
  if (fx.tick <= 0) {
    fx.tick = 0.5;
    emit(EV.SKILL, 'plague', 'tick', fx.x, fx.y, fx.radius);
  }
  return true;
}

/** Kara Girdap: kısa bir dönüşten sonra alandakileri geri savurur ve hasar verir. */
function stepVortex(fx, dt) {
  fx.t += dt;
  if (!fx.done && fx.t >= fx.delay) {
    fx.done = true;
    forEachInRadius(fx.x, fx.y, fx.radius, true, (e) => {
      hurt(e, fx.dmg, 'magic', null);
      if (e.alive) pushBack(e, fx.pull);
    });
    emit(EV.SKILL, 'vortex', 'impact', fx.x, fx.y, fx.radius);
  }
  return fx.t < fx.delay + 0.6; // girdap biraz daha döner (görüntü)
}

/* --------------------------------------------------------------------------
 * 12b. HARİTA OLAYLARI — her bölümün kendine özgü olayı (config MAP_EVENTS)
 *  Yalnızca savaş sürerken (sahada ya da doğmayı bekleyen düşman varken) ve
 *  EVENT_RULES.fromWave'den sonra sayaç işler. Olay önce "uyarı" verir
 *  (haritada işaret, kısa mesaj), warn sn sonra patlak verir. Zorluğun
 *  events.rate'i sıklığı, events.power'ı oyuncuya zor gelen yanını büyütür;
 *  "Olay Fırtınası" (storm) kuralı sıklaştırır. Etkiler run.effects'te
 *  ('ev_*') yaşar; render.js çizer, particles/audio olayı dinler.
 * ------------------------------------------------------------------------ */
function eventRate() {
  const base = diffOf().events.rate * (hasMod('storm') ? MODIFIERS.storm.events : 1);
  return Math.min(EVENT_RULES.maxRate, base);
}

/** Sıradaki olaya kalan savaş süresi (ilki biraz daha erken gelir). */
function nextEventDelay(first = false) {
  const ev = state.map && MAP_EVENTS[state.map.event];
  if (!ev) return Infinity;
  const t = rng.range(ev.every[0], ev.every[1]) / eventRate();
  return first ? t * EVENT_RULES.firstDelay : t;
}

function updateMapEvent(dt) {
  const run = state.run;
  const ev = MAP_EVENTS[state.map.event];
  if (!ev || run.wave < (ev.fromWave ?? EVENT_RULES.fromWave) || fieldClear()) return;
  run.eventT -= dt;
  if (run.eventT > 0) return;
  run.eventT = nextEventDelay();
  if (run.effects.some((fx) => fx.kind === `ev_${ev.id}`)) return; // öncekisi sürüyor: bu sefer atla
  const power = diffOf().events.power;
  switch (ev.id) {
    case 'rise': startRise(ev, power); break;
    case 'blizzard': startBlizzard(ev, power); break;
    case 'gas': startGas(ev, power); break;
    case 'lava': startLava(ev, power); break;
    case 'rift': startRift(ev, power); break;
    default: break;
  }
}

/** Bir noktaya en yakın yol noktası: { lane, d, x, y }. */
function nearestOnPath(x, y) {
  let best = null;
  let bd = Infinity;
  state.map.polys.forEach((poly, lane) => {
    for (const sg of poly.segs) {
      const t = clamp((x - sg.x1) * sg.dx + (y - sg.y1) * sg.dy, 0, sg.len);
      const px = sg.x1 + sg.dx * t;
      const py = sg.y1 + sg.dy * t;
      const d2 = dist2(x, y, px, py);
      if (d2 < bd) {
        bd = d2;
        best = { lane, d: sg.start + t, x: px, y: py };
      }
    }
  });
  return best;
}

/**
 * Olayın düşeceği yol hücresi. Yarı yarıya rastgele, yarı yarıya kuleleri en
 * çok kapsayan hücre (olayın iki yanı da hissedilsin). Geçide ve kaleye çok
 * yakın hücreler seçilmez. avoid: önceden seçilmiş noktalar (üst üste düşmesin).
 */
function eventSpot(radius, avoid = []) {
  const map = state.map;
  const towers = state.run.towers;
  const reach = (radius + 0.3) * (radius + 0.3);
  const far = avoid.length ? (radius * 1.6) ** 2 : 0;
  const cells = map.pathCells.filter(([c, r]) => r >= 1 && r <= map.rows - 3
    && avoid.every((a) => dist2(c + 0.5, r + 0.5, a.x, a.y) > far));
  const list = cells.length ? cells : map.pathCells;
  let pick = rng.pick(list);
  if (towers.length && rng.chance(0.5)) {
    let top = -1;
    let best = [];
    for (const cell of list) {
      const x = cell[0] + 0.5;
      const y = cell[1] + 0.5;
      let n = 0;
      for (const t of towers) if (dist2(x, y, t.x, t.y) <= reach) n++;
      if (n > top) {
        top = n;
        best = [cell];
      } else if (n === top) best.push(cell);
    }
    pick = rng.pick(best);
  }
  return { x: pick[0] + 0.5, y: pick[1] + 0.5 };
}

/** Şu an süren en yeni dalga (olaydan doğanlar onun sayısına katılır; temizlenmiş dalga yeniden açılmaz). */
function activeWave() {
  let n = 0;
  for (const k of state.run.waveLeft.keys()) if (k > n) n = k;
  return n || Math.max(1, state.run.wave);
}

/* — Kül Vadisi: Ölüler Uyanıyor — */
function startRise(ev, power) {
  const map = state.map;
  const run = state.run;
  // kaleye çok yakın mezar seçilmez: kalkanlar savunmayı görmeden kapıya varmasın
  const graves = map.decor.filter((d) => d.kind === 'grave').map((d) => ({ x: d.c + 0.5, y: d.r + 0.5 }))
    .filter((p) => {
      const at = nearestOnPath(p.x, p.y);
      return map.polys[at.lane].length - at.d >= 4.5;
    });
  const spot = graves.length ? rng.pick(graves) : eventSpot(0.5);
  const at = nearestOnPath(spot.x, spot.y);
  const count = Math.max(1, Math.round((ev.count + Math.floor(run.wave / ev.perWaves)) * power));
  run.effects.push({ kind: 'ev_rise', x: spot.x, y: spot.y, px: at.x, py: at.y, lane: at.lane, d: at.d, t: 0, warn: ev.warn, count, done: false });
  emit(EV.MAP_EVENT, 'rise', 'warn', spot.x, spot.y, ev.warn);
}

function stepRise(fx, dt) {
  fx.t += dt;
  if (!fx.done && fx.t >= fx.warn) {
    fx.done = true;
    const wave = activeWave();
    const ev = MAP_EVENTS.rise;
    for (let i = 0; i < fx.count; i++) {
      // yeni kalkmış, çürük iskelet: az can, zırhsız; mezar eşyası taşır (fazla ruh)
      const e = spawnEnemy(ev.type, wave, fx.d - i * 0.35, true, fx.lane);
      e.maxHp *= ev.hp;
      e.hp = e.maxHp;
      e.hpShown = e.maxHp;
      e.armor = Math.max(0, e.armor - ENEMIES[ev.type].armor + ev.armor); // "Demir Ordu" eki kalır
      e.souls = Math.round(e.souls * ev.souls);
    }
    emit(EV.MAP_EVENT, 'rise', 'act', fx.px, fx.py, fx.count);
  }
  return fx.t < fx.warn + 0.9;
}

/* — Ayaz Geçidi: Tipi — */
function startBlizzard(ev, power) {
  const run = state.run;
  const dur = ev.duration * power;
  const rate = clamp(1 - (1 - ev.towerRate) * power, 0.4, 1);
  run.effects.push({ kind: 'ev_blizzard', t: 0, warn: ev.warn, dur, rate, slow: ev.enemySlow, tick: 0, started: false });
  const { castle } = state.map;
  emit(EV.MAP_EVENT, 'blizzard', 'warn', castle.x, castle.y, ev.warn);
}

function stepBlizzard(fx, dt) {
  const run = state.run;
  fx.t += dt;
  if (fx.t < fx.warn) return true;
  if (!fx.started) {
    fx.started = true;
    const before = run.chill > 0 ? run.chillRate : 1; // Kış Kraliçesi'nin tipisi sürüyorsa en yavaşı geçer
    run.chill = Math.max(run.chill, fx.dur);
    run.chillRate = Math.min(before, fx.rate);
    const { castle } = state.map;
    emit(EV.MAP_EVENT, 'blizzard', 'act', castle.x, castle.y, fx.dur);
  }
  // tipi sürerken yeni gelenler de yavaşlar
  fx.tick -= dt;
  if (fx.tick <= 0) {
    fx.tick = 0.5;
    for (const e of run.enemies) {
      if (!e.alive || immuneTo(e, 'slow')) continue;
      e.slow = Math.max(e.slow, fx.slow);
      e.slowT = Math.max(e.slowT, 0.6);
    }
  }
  if (fx.t >= fx.warn + fx.dur) {
    emit(EV.MAP_EVENT, 'blizzard', 'end', 0, 0, 0);
    return false;
  }
  return true;
}

/* — Kara Bataklık: Bataklık Gazı — */
function startGas(ev, power) {
  const spot = eventSpot(ev.radius);
  state.run.effects.push({
    kind: 'ev_gas', x: spot.x, y: spot.y, t: 0, warn: ev.warn, dur: ev.duration, radius: ev.radius,
    dps: ev.dps * SCALING.hp(waveNow()), silence: ev.silence * power, burst: false, tick: 0,
  });
  emit(EV.MAP_EVENT, 'gas', 'warn', spot.x, spot.y, ev.warn);
}

function stepGas(fx, dt) {
  fx.t += dt;
  if (fx.t < fx.warn) return true;
  if (!fx.burst) {
    fx.burst = true;
    const r2 = (fx.radius + 0.15) ** 2;
    for (const t of state.run.towers) if (dist2(fx.x, fx.y, t.x, t.y) <= r2) silenceTower(t, fx.silence, 'gas');
    emit(EV.MAP_EVENT, 'gas', 'act', fx.x, fx.y, fx.radius);
  }
  if (fx.t >= fx.warn + fx.dur) {
    emit(EV.MAP_EVENT, 'gas', 'end', fx.x, fx.y, fx.radius);
    return false;
  }
  // içindekiler zehirlenir: saf hasar, yenilenme durur (Veba Bulutu gibi)
  forEachInRadius(fx.x, fx.y, fx.radius, true, (e) => {
    e.dotP += hurt(e, fx.dps * dt, 'pure', null, false, true);
    if (!e.alive) return;
    if (e.pStacks <= 0) {
      e.pStacks = 1;
      e.pMax = Math.max(e.pMax, 1);
    }
    e.pT = Math.max(e.pT, 0.4);
  });
  return true;
}

/* — Kor Ocakları: Lav Sıçraması — */
function startLava(ev, power) {
  const map = state.map;
  const pools = map.decor.filter((d) => d.kind === 'lava');
  const globs = ev.globs + (power > 1.2 ? 1 : 0);
  const dmg = ev.damage * SCALING.hp(waveNow());
  const taken = [];
  for (let i = 0; i < globs; i++) {
    const src = pools.length ? rng.pick(pools) : { c: rng.int(0, map.cols - 1), r: 0 };
    const spot = eventSpot(ev.radius, taken);
    taken.push(spot);
    state.run.effects.push({
      kind: 'ev_lava', sx: src.c + 0.5, sy: src.r + 0.5, x: spot.x, y: spot.y,
      t: -i * 0.35, warn: ev.warn, radius: ev.radius, dmg,
      burn: { burnDps: dmg * ev.burn, burnDur: ev.burnDur }, silence: ev.silence * power,
    });
  }
  emit(EV.MAP_EVENT, 'lava', 'warn', taken[0].x, taken[0].y, ev.warn);
}

function stepLava(fx, dt) {
  fx.t += dt;
  if (fx.t < fx.warn) return true;
  forEachInRadius(fx.x, fx.y, fx.radius, false, (e, d) => {
    hurt(e, fx.dmg * (1 - 0.35 * (d / fx.radius)), 'magic', null);
    applyBurn(e, fx.burn, null);
  });
  const r2 = (fx.radius + 0.15) ** 2;
  for (const t of state.run.towers) if (dist2(fx.x, fx.y, t.x, t.y) <= r2) silenceTower(t, fx.silence, 'fire');
  emit(EV.MAP_EVENT, 'lava', 'act', fx.x, fx.y, fx.radius);
  return false;
}

/* — Boşluk Tahtı: Boşluk Yarığı — */
function startRift(ev, power) {
  const polys = state.map.polys;
  const lane = rng.int(0, polys.length - 1);
  const poly = polys[lane];
  const d = poly.length * rng.range(0.25, 0.72);
  const at = samplePolyline(poly, d, { x: 0, y: 0, angle: 0, seg: 0 });
  state.run.effects.push({
    kind: 'ev_rift', x: at.x, y: at.y, t: 0, warn: ev.warn, dur: ev.duration, radius: ev.radius,
    push: ev.push, ward: ev.ward * power, hit: new Set(), opened: false,
  });
  emit(EV.MAP_EVENT, 'rift', 'warn', at.x, at.y, ev.warn);
}

function stepRift(fx, dt) {
  fx.t += dt;
  if (fx.t < fx.warn) return true;
  if (!fx.opened) {
    fx.opened = true;
    emit(EV.MAP_EVENT, 'rift', 'act', fx.x, fx.y, fx.radius);
  }
  if (fx.t >= fx.warn + fx.dur) {
    emit(EV.MAP_EVENT, 'rift', 'end', fx.x, fx.y, fx.radius);
    return false;
  }
  const r2 = fx.radius * fx.radius;
  for (const e of state.run.enemies) {
    if (!e.alive || e.boss || fx.hit.has(e.id) || dist2(e.x, e.y, fx.x, fx.y) > r2) continue;
    fx.hit.add(e.id);
    const ox = e.x;
    const oy = e.y;
    pushBack(e, fx.push);
    const amount = e.maxHp * fx.ward;
    if (e.ward < amount) {
      e.ward = amount;
      e.wardMax = amount;
    }
    e.wardT = Math.max(e.wardT, 6);
    emit(EV.MAP_EVENT, 'rift', 'hit', ox, oy, e);
  }
  return true;
}

/* --------------------------------------------------------------------------
 * 13. ANA GÜNCELLEME — sabit adım
 * ------------------------------------------------------------------------ */
export function update(dt) {
  const run = state.run;
  if (!run || run.over || run.paused) return;
  run.time += dt;
  if (run.chill > 0) run.chill = Math.max(0, run.chill - dt);
  const chill = run.chill > 0 ? run.chillRate : 1;

  updateSpawners(dt);
  applyCurseAuras();
  applyEnemyAuras();
  applyTowerAuras();
  const enemies = run.enemies;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.alive) updateEnemy(e, dt);
    if (run.over) return;
  }
  for (const t of run.towers) updateTower(t, dt, chill);
  updateKeep(dt);
  updateProjectiles(dt);
  updateMapEvent(dt);
  updateEffects(dt);

  // ölüleri ayıkla (sıra korunur)
  let w = 0;
  for (let i = 0; i < enemies.length; i++) if (enemies[i].alive) enemies[w++] = enemies[i];
  enemies.length = w;
  if (run.over) return;

  // saha temizlendi mi?
  const clear = fieldClear();
  if (clear && run.wave >= lastWave()) {
    endRun(true);
    return;
  }
  if (clear && !wasClear) emit(EV.SAVEPOINT);
  wasClear = clear;

  // otomatik dalga: kayıt noktası alındıktan sonra (saha boşken çağrılırsa kayıt önce düşer)
  if (autoWaveReady()) callWave();
}
