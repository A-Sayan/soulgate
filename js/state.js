/* ==========================================================================
 *  SOULGATE — state.js
 *  Sorumluluk : Oyunun tek değişebilir durumu, veri şekilleri ve bu verinin
 *               kayda dönüştürülmesi / kayıttan doğrulanarak geri kurulması.
 *               Kalıcı profilin (altın, çarşı alımları, kale) veri şekli de burada.
 *  Bağımlılık : config, utils, events, i18n (katman 0).
 *               Dil ayarı değişince etkin dili de burası değiştirir.
 *
 *  Kurallar
 *   - "state" nesnesi asla yeniden atanmaz; modüller referansını tutar.
 *   - Burada oyun KURALI yoktur (hasar, hedefleme, ekonomi → game.js).
 *     Yalnızca veri, veri yapısı işlemleri ve tutarlılık kontrolleri.
 *   - Düşman ve mermiler game.js'te yaratılır; burada sadece dizileri durur.
 *   - Kayıt yalnızca sahada düşman yokken alındığı için düşmanlar,
 *     mermiler ve doğurucular kayda girmez.
 * ========================================================================== */

import {
  GRID, MAPS, MAP_BY_ID, MAP_ORDER, WAVE_COUNT, DIFFICULTIES, DIFFICULTY_ORDER, DEFAULT_DIFFICULTY,
  DEFAULT_SETTINGS, SETTINGS_SCHEMA, TOWERS, TOWER_ORDER, TARGET_MODES, TIMING,
  META, CASTLE, SKILLS, SIDES, ENEMIES, LOADOUT_SIZE, TIPS, MODES, MODIFIERS, CHALLENGE_BY_ID, ENDLESS, MAP_EVENTS,
} from './config.js';
import { buildPolyline, polylineCells, cellIndex, inBounds } from './utils.js';
import { EV, emit } from './events.js';
import { setLanguage } from './i18n.js';

/** Hücre türleri (map.cells içinde) */
export const CELL = Object.freeze({ BUILD: 0, PATH: 1, BLOCKED: 2, CASTLE: 3 });

/* --------------------------------------------------------------------------
 * 1. DURUM NESNESİ
 * ------------------------------------------------------------------------ */
export const state = {
  /** 'boot' | 'menu' | 'game' */
  scene: 'boot',

  /** Ayarlar — her zaman SETTINGS_SCHEMA'ya uygun, tam bir nesne */
  settings: { ...DEFAULT_SETTINGS },

  /** Oyunlar arası kalıcı rekorlar */
  records: createRecords(),

  /** Kalıcı ilerleme: altın, satın alınanlar, kale (kurallar meta.js'te) */
  profile: createProfile(),

  /**
   * Ekran yerleşimi — render.js yazar, input.js okur.
   * Birimler CSS pikseli; cell = bir ızgara hücresinin piksel boyu,
   * (ox, oy) = ızgaranın sol üst köşesinin ekrandaki yeri.
   */
  view: {
    width: 0, height: 0, dpr: 1,
    cell: 32, ox: 0, oy: 0,
    inset: { top: 0, right: 0, bottom: 0, left: 0 },
  },

  /** Arayüz seçimleri — ui.js yazar, render.js çizer */
  ui: createUiState(),

  /** Süren oyun (yoksa null) */
  run: null,

  /** Süren oyunun haritası (yoksa null) */
  map: null,
};

function createUiState() {
  return {
    buildType: null,  // yerleştirme modundaki kule tipi
    selectedId: 0,    // seçili kulenin kimliği (0 = yok)
    ghostC: -1,       // yerleştirme önizlemesinin hücresi
    ghostR: -1,
    ghostValid: false,
    skillAim: -1,     // hedef seçilen yeteneğin sırası (-1 = yok)
    keepSelected: false, // ana kule seçili (menzili ve paneli görünür)
  };
}

/** Seçimleri ve önizlemeyi temizler. */
export function resetUi() {
  Object.assign(state.ui, createUiState());
}

/* --------------------------------------------------------------------------
 * 2. SAHNE, DURAKLATMA, HIZ — değişiklikler olayla duyurulur
 * ------------------------------------------------------------------------ */
export function setScene(name) {
  const prev = state.scene;
  if (prev === name) return;
  state.scene = name;
  emit(EV.SCENE, name, prev);
}

export function setPaused(paused) {
  const run = state.run;
  if (!run || run.paused === paused) return;
  run.paused = paused;
  emit(EV.PAUSE, paused);
}

export function setSpeed(speed) {
  const run = state.run;
  if (!run || run.speed === speed || !TIMING.speeds.includes(speed)) return;
  run.speed = speed;
  emit(EV.SPEED, speed);
}

/* --------------------------------------------------------------------------
 * 3. HARİTA
 * ------------------------------------------------------------------------ */
/**
 * Harita tanımından çalışma anı haritası üretir (hücre tablosu, yollar, doluluk).
 * İki yollu haritalarda polys iki yol taşır; düşman hangi yoldaysa (e.path)
 * onun üstünde ilerler. pathCells bütün yolların hücreleridir (tekrarsız).
 */
export function createMap(mapId) {
  const def = MAP_BY_ID[mapId] ?? MAPS[0];
  const { cols, rows } = GRID;
  const cells = new Uint8Array(cols * rows); // varsayılan: BUILD

  const seen = new Set();
  const pathCells = [];
  for (const path of def.paths) {
    for (const [c, r] of polylineCells(path)) {
      const key = c + ',' + r;
      if (!inBounds(c, r, cols, rows) || seen.has(key)) continue;
      seen.add(key);
      pathCells.push([c, r]);
    }
  }
  for (const [c, r] of pathCells) cells[cellIndex(c, r, cols)] = CELL.PATH;

  for (const b of def.decor) {
    const i = cellIndex(b.c, b.r, cols);
    if (cells[i] === CELL.BUILD) cells[i] = CELL.BLOCKED;
  }
  for (const [c, r] of def.castle.cells) {
    const i = cellIndex(c, r, cols);
    if (cells[i] === CELL.BUILD) cells[i] = CELL.CASTLE;
  }

  return {
    id: def.id,
    index: def.index,
    cols,
    rows,
    cells,
    pathCells,
    polys: def.paths.map((p) => buildPolyline(p, 0.5)), // hücre merkezlerinden geçen yollar
    occupant: new Int32Array(cols * rows),    // hücredeki kulenin kimliği (0 = boş)
    castle: { c: def.castle.c, r: def.castle.r, x: def.castle.c + 0.5, y: def.castle.r + 0.5 },
    decor: def.decor,
    theme: def.theme,
    waves: def.waves,                         // bu bölümün dalgaları
    hp: def.hp,                               // bölüm çarpanları (düşman canı, ruh)
    horde: def.horde ?? 1,                    // yalnızca sıradan düşmanların canı (patronlar hariç)
    souls: def.souls,
    event: def.event ?? null,                 // bölümün harita olayı (config MAP_EVENTS)
  };
}

export function cellTypeAt(c, r) {
  const m = state.map;
  if (!m || !inBounds(c, r, m.cols, m.rows)) return -1;
  return m.cells[cellIndex(c, r, m.cols)];
}

/** Hücreye kule kurulabilir mi? (sınır içi, kurulabilir zemin, boş) */
export function isBuildable(c, r) {
  const m = state.map;
  if (!m || !inBounds(c, r, m.cols, m.rows)) return false;
  const i = cellIndex(c, r, m.cols);
  return m.cells[i] === CELL.BUILD && m.occupant[i] === 0;
}

/* --------------------------------------------------------------------------
 * 4. OYUN (RUN)
 * ------------------------------------------------------------------------ */
function createStats() {
  return { kills: 0, soulsEarned: 0, leaked: 0, built: 0, bossKills: 0, skillsUsed: 0 };
}

/** Bugünün yerel tarihi 'YYYY-AA-GG' (Günün Sınavı bununla seçilir). */
export function todayKey(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}
const isDayKey = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Oyunun modu ve kuralları (1.5.0). Bilinmeyen değerler atılır.
 * opt: { mode, mods, challenge, daily }
 */
function cleanModeOptions(opt) {
  const src = opt && typeof opt === 'object' ? opt : {};
  const mode = MODES.includes(src.mode) ? src.mode : 'campaign';
  const mods = Array.isArray(src.mods) ? [...new Set(src.mods.filter((m) => typeof m === 'string' && MODIFIERS[m]))] : [];
  const challenge = mode === 'challenge' && CHALLENGE_BY_ID[src.challenge] ? src.challenge : '';
  const daily = mode === 'daily' && isDayKey(src.daily) ? src.daily : '';
  return { mode, mods, challenge, daily };
}

/**
 * Yeni, boş bir oyun kurar ve state.run / state.map'e yerleştirir.
 * opt: { mode, mods, challenge, daily } — yoksa bölüm (campaign) oyunu.
 */
export function newRun(difficultyId, mapId = MAP_ORDER[0], opt = null) {
  const diff = DIFFICULTIES[difficultyId] ?? DIFFICULTIES[DEFAULT_DIFFICULTY];
  const m = cleanModeOptions(opt);
  state.map = createMap(mapId);
  state.run = {
    difficulty: diff.id,
    mapId: state.map.id,
    // — mod ve kurallar (1.5.0) —
    mode: m.mode,        // 'campaign' | 'endless' | 'daily' | 'challenge'
    mods: m.mods,        // açık kurallar (MODIFIERS kimlikleri)
    challenge: m.challenge, // sınav kimliği (mode 'challenge')
    daily: m.daily,      // günün sınavının tarihi (mode 'daily')
    // Bölüm zaferinden sonra Sonsuz Gece'ye devam edilirse, zaferde zaten işlenmiş
    // kısım: { waves, bosses, kills } (ödül ve rekor yalnızca sonrasından); yoksa null
    carry: null,
    souls: diff.startSouls,
    lives: diff.lives,
    maxLives: diff.lives,

    wave: 0,             // son BAŞLAYAN dalganın numarası (0 = hiçbiri)
    countdown: null,     // sıradaki dalgaya kalan sn; null = oyuncuyu bekle
    waveLeft: new Map(), // dalgaNo → bekleyen doğum + canlı düşman sayısı
    spawners: [],
    laneTurn: 0,         // iki yollu haritada yolu belirtilmemiş düşmanların sırası

    enemies: [],
    projectiles: [],
    towers: [],
    towerById: new Map(),

    time: 0,             // oyun zamanı (hızla ölçeklenir, duraklamada durur)
    speed: 1,
    paused: false,
    over: null,          // null | 'victory' | 'defeat'
    nextId: 1,           // kule/düşman/mermi kimlik sayacı
    stats: createStats(),

    // — ana kule ve yetenekler (game.js oyun başında doldurur) —
    ruined: false,       // kale yıkık başladı mı (can ve hasar düşük)
    castle: null,        // { cooldown, angle, damageMult, flash }
    skills: [],          // [{ side, id, level, freeUsed, cd }]
    effects: [],         // süren yetenek etkileri (tomruk, meteor) — kayda girmez
    savedSkills: null,   // kayıttan gelen yetenek durumu (game.js eşler)
    chill: 0,            // Kış Kraliçesi'nin tipisi: kalan süre (kuleler yavaş ateş eder)
    chillRate: 1,        // tipi sürerken atış hızı çarpanı
    eventT: 0,           // sıradaki harita olayına kalan savaş süresi (game.js kurar; kayda girmez)
  };
  resetUi();
  return state.run;
}

/** Bu oyunda kural açık mı? */
export const hasMod = (id) => !!state.run && state.run.mods.includes(id);

/** Oyunu kapatır (ana menüye dönüşte). */
export function clearRun() {
  state.run = null;
  state.map = null;
  resetUi();
}

/** Kule çarşıdan alınmış mı? (Başlangıç kuleleri hep açıktır.) */
export function isUnlocked(towerType) {
  return state.profile.towers.includes(towerType);
}

/* --------------------------------------------------------------------------
 * 5. KULELER — veri şekli ve harita üzerindeki yeri
 *  İstatistikler kulede saklanmaz; game.js (tip, seviye, ustalık) üçlüsünden
 *  önceden hesaplanmış tabloyu okur. Böylece kayıt küçük, hata riski az.
 * ------------------------------------------------------------------------ */
export function createTower(type, c, r) {
  const run = state.run;
  return {
    id: run.nextId++,
    type,
    c,
    r,
    x: c + 0.5,
    y: r + 0.5,
    level: 0,            // TOWERS[type].levels dizinindeki sıra (0..2)
    mastery: -1,         // -1 = yok, 0/1 = seçilen ustalık dalı
    invested: 0,         // satış iadesinin hesaplandığı toplam harcama
    targetMode: TOWERS[type]?.defaultTarget ?? TARGET_MODES[0].id,
    kills: 0,
    damage: 0,
    souls: 0,            // Ruh Kuyusu: bu oyunda ürettiği ruh
    // — yalnızca çalışma anı (kayda girmez) —
    fresh: true,         // bu hazırlık evresinde mi kuruldu (tam iade)
    angle: -Math.PI / 2, // namlu açısı (yukarı bakarak doğar)
    cooldown: 0,
    target: null,
    recoil: 0,
    buildT: 0,           // kurulum animasyonu 0 → 1
    silenced: 0,         // susturulma süresi (Kül Ejderi, Buzul Devi, örümcek ağı…)
    silenceKind: '',     // susturmanın türü (görüntü için): fire | frost | void | web | hex | gas
    flash: 0,            // yükseltme / ateş parıltısı
    aura: 0,             // aura nabzı zamanlayıcısı (Lanet Totemi)
    // Savaş Çanı güçlendirmeleri (her adım yeniden hesaplanır)
    bRate: 0, bDmg: 0, bRange: 0,
    beam: null,          // Kristal Prizma: { target, ramp, forks:[...] }
    genT: 0,             // Ruh Kuyusu: sıradaki üretime kalan süre
  };
}

/** Kuleyi oyuna ve haritaya yerleştirir. Hücre uygun değilse false döner. */
export function placeTower(tower) {
  const { run, map } = state;
  if (!isBuildable(tower.c, tower.r)) return false;
  run.towers.push(tower);
  run.towerById.set(tower.id, tower);
  map.occupant[cellIndex(tower.c, tower.r, map.cols)] = tower.id;
  return true;
}

/** Kuleyi oyundan ve haritadan kaldırır. */
export function removeTower(tower) {
  const { run, map } = state;
  const i = run.towers.indexOf(tower);
  if (i === -1) return;
  run.towers.splice(i, 1);
  run.towerById.delete(tower.id);
  map.occupant[cellIndex(tower.c, tower.r, map.cols)] = 0;
  if (state.ui.selectedId === tower.id) state.ui.selectedId = 0;
}

export function towerAt(c, r) {
  const m = state.map;
  if (!m || !inBounds(c, r, m.cols, m.rows)) return null;
  const id = m.occupant[cellIndex(c, r, m.cols)];
  return id ? state.run.towerById.get(id) ?? null : null;
}

export function selectedTower() {
  const id = state.ui.selectedId;
  return id && state.run ? state.run.towerById.get(id) ?? null : null;
}

/* --------------------------------------------------------------------------
 * 6. EKRAN ↔ DÜNYA DÖNÜŞÜMÜ — dünya birimi = hücre
 * ------------------------------------------------------------------------ */
export function screenToWorld(px, py, out = { x: 0, y: 0 }) {
  const v = state.view;
  out.x = (px - v.ox) / v.cell;
  out.y = (py - v.oy) / v.cell;
  return out;
}

export function worldToScreen(x, y, out = { x: 0, y: 0 }) {
  const v = state.view;
  out.x = v.ox + x * v.cell;
  out.y = v.oy + y * v.cell;
  return out;
}

/* --------------------------------------------------------------------------
 * 7. KAYIT BİÇİMİ — süren oyun
 * ------------------------------------------------------------------------ */
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Süren oyunu düz JSON verisine çevirir. Bitmiş ya da olmayan oyun → null. */
export function serializeRun() {
  const run = state.run;
  if (!run || run.over) return null;
  return {
    difficulty: run.difficulty,
    mapId: run.mapId,
    mode: run.mode,
    mods: [...run.mods],
    challenge: run.challenge,
    daily: run.daily,
    carry: run.carry ? { ...run.carry } : null,
    souls: run.souls,
    lives: run.lives,
    wave: run.wave,
    speed: run.speed,
    nextId: run.nextId,
    time: Math.round(run.time),
    stats: { ...run.stats },
    ruined: run.ruined,
    skills: run.skills.map((sk) => ({ side: sk.side, id: sk.id, freeUsed: sk.freeUsed })),
    towers: run.towers.map((t) => ({
      id: t.id,
      type: t.type,
      c: t.c,
      r: t.r,
      level: t.level,
      mastery: t.mastery,
      invested: t.invested,
      targetMode: t.targetMode,
      kills: t.kills,
      damage: Math.round(t.damage),
      souls: Math.round(t.souls),
    })),
  };
}

/** Bir kulenin bu seviyeye/ustalığa gelene kadar toplam maliyeti. */
function costUpTo(type, level, mastery) {
  const def = TOWERS[type];
  let sum = 0;
  for (let i = 0; i <= level; i++) sum += def.levels[i].cost;
  if (mastery >= 0) sum += def.masteries[mastery].cost;
  return sum;
}

/** Tek kule kaydını doğrular; geçersizse null döner. */
function validTowerRecord(rec, usedIds) {
  if (!isObj(rec)) return null;
  const def = TOWERS[rec.type];
  if (!def) return null;
  if (!isInt(rec.c) || !isInt(rec.r) || !isBuildable(rec.c, rec.r)) return null;

  const maxLevel = def.levels.length - 1;
  const level = isInt(rec.level) && rec.level >= 0 && rec.level <= maxLevel ? rec.level : 0;
  const masteryOk = isInt(rec.mastery) && rec.mastery >= 0 && rec.mastery < def.masteries.length;
  const mastery = masteryOk && level === maxLevel ? rec.mastery : -1;

  return {
    id: isInt(rec.id) && rec.id > 0 && !usedIds.has(rec.id) ? rec.id : 0,
    level,
    mastery,
    invested: isNum(rec.invested) && rec.invested >= 0 ? rec.invested : costUpTo(rec.type, level, mastery),
    targetMode: TARGET_MODES.some((m) => m.id === rec.targetMode) ? rec.targetMode : TARGET_MODES[0].id,
    kills: isInt(rec.kills) && rec.kills >= 0 ? rec.kills : 0,
    damage: isNum(rec.damage) && rec.damage >= 0 ? rec.damage : 0,
    souls: isNum(rec.souls) && rec.souls >= 0 ? rec.souls : 0,
  };
}

/**
 * Kayıttan oyunu doğrulayarak kurar. Temel alanlar bozuksa hiçbir şeye
 * dokunmadan false döner. Bozuk tek bir kule kaydı ise yalnızca atlanır.
 * Yüklenen oyun her zaman oyuncunun "Dalgayı Başlat" demesini bekler.
 */
export function restoreRun(data) {
  if (!isObj(data)) return false;
  const diff = DIFFICULTIES[data.difficulty];
  const mapDef = MAP_BY_ID[data.mapId];
  if (!diff || !mapDef) return false;
  const m = cleanModeOptions(data); // eski kayıtlarda alan yok: bölüm oyunu
  const lastWave = m.mode === 'endless' ? ENDLESS.maxWave : mapDef.waves.length;
  if (!isInt(data.wave) || data.wave < 0 || data.wave >= lastWave) return false;
  const souls = isNum(data.souls) ? data.souls : data.gold; // eski kayıtlarda alan adı 'gold'
  if (!isNum(souls) || souls < 0) return false;
  if (!isInt(data.lives) || data.lives < 1) return false;

  const run = newRun(diff.id, mapDef.id, m);
  const c = data.carry;
  if (m.mode === 'endless' && isObj(c) && isInt(c.waves) && c.waves > 0 && c.waves <= data.wave
    && isInt(c.bosses) && c.bosses >= 0 && isInt(c.kills) && c.kills >= 0) {
    run.carry = { waves: c.waves, bosses: c.bosses, kills: c.kills };
  }
  run.souls = Math.floor(souls);
  // can üst sınırını kale yükseltmeleri belirler (game.js); burada yalnızca korunur
  run.lives = data.lives;
  run.maxLives = Math.max(run.maxLives, data.lives);
  run.ruined = data.ruined === true;
  run.savedSkills = Array.isArray(data.skills)
    ? data.skills.filter((k) => isObj(k) && SKILLS[k.id] && SIDES.includes(k.side)).map((k) => ({ side: k.side, id: k.id, freeUsed: k.freeUsed === true }))
    : [];
  run.wave = data.wave;
  // durdurulmuş (0×) kaydedilen oyun yüklenince akar: oyuncu donmuş bir sahneyle karşılaşmasın
  run.speed = TIMING.speeds.includes(data.speed) && data.speed > 0 ? data.speed : 1;
  run.time = isNum(data.time) && data.time >= 0 ? data.time : 0;
  if (isObj(data.stats)) {
    for (const key of Object.keys(run.stats)) {
      if (isNum(data.stats[key]) && data.stats[key] >= 0) run.stats[key] = data.stats[key];
    }
  }

  const usedIds = new Set();
  const records = Array.isArray(data.towers) ? data.towers : [];
  for (const rec of records) {
    const valid = validTowerRecord(rec, usedIds);
    if (!valid) continue;
    const tower = createTower(rec.type, rec.c, rec.r);
    if (valid.id) tower.id = valid.id;
    Object.assign(tower, {
      level: valid.level,
      mastery: valid.mastery,
      invested: valid.invested,
      targetMode: valid.targetMode,
      kills: valid.kills,
      damage: valid.damage,
      souls: valid.souls,
      fresh: false,
      buildT: 1,
    });
    usedIds.add(tower.id);
    placeTower(tower);
  }

  // Kimlik sayacı hiçbir mevcut kimlikle çakışmamalı
  const maxId = Math.max(0, ...usedIds);
  run.nextId = Math.max(isInt(data.nextId) ? data.nextId : 1, maxId + 1, run.nextId);
  return true;
}

/* --------------------------------------------------------------------------
 * 8. AYARLAR
 * ------------------------------------------------------------------------ */
function validSetting(entry, value) {
  switch (entry.type) {
    case 'range':
      return isNum(value) ? Math.min(entry.max, Math.max(entry.min, value)) : undefined;
    case 'toggle':
      return typeof value === 'boolean' ? value : undefined;
    case 'choice':
      return entry.options.some((o) => o.id === value) ? value : undefined;
    default:
      return undefined;
  }
}

/** Kayıttan gelen ayarları şemaya göre süzer; eksik/bozuk olan varsayılana döner. */
export function applySettings(raw) {
  const src = isObj(raw) ? raw : {};
  for (const entry of SETTINGS_SCHEMA) {
    const v = validSetting(entry, src[entry.key]);
    state.settings[entry.key] = v === undefined ? DEFAULT_SETTINGS[entry.key] : v;
  }
  setLanguage(state.settings.lang);
}

/**
 * Tek bir ayarı değiştirir ve EV.SETTINGS yayar.
 * @returns {boolean} değer geçerli ve gerçekten değiştiyse true
 */
export function setSetting(key, value) {
  const entry = SETTINGS_SCHEMA.find((e) => e.key === key);
  if (!entry) return false;
  const v = validSetting(entry, value);
  if (v === undefined || state.settings[key] === v) return false;
  state.settings[key] = v;
  if (key === 'lang') setLanguage(v); // dinleyiciler yeni dili hazır bulur
  emit(EV.SETTINGS, key, v);
  return true;
}

/* --------------------------------------------------------------------------
 * 9. REKORLAR
 * ------------------------------------------------------------------------ */
function createRecords() {
  const perDifficulty = () => Object.fromEntries(DIFFICULTY_ORDER.map((id) => [id, 0]));
  const perMap = () => Object.fromEntries(MAP_ORDER.map((id) => [id, perDifficulty()]));
  return {
    best: perMap(),          // bölüm → zorluk → ulaşılan en yüksek dalga
    wins: perMap(),          // bölüm → zorluk → zafer sayısı
    kills: 0,
    runs: 0,
    seen: [],                // karşılaşılan düşman tipleri (rehber + keşif kartı)
    seenTowers: [],          // oyunda tanıtılmış kuleler (keşif kartı bir kez çıkar)
    seenSkills: [],          // oyunda tanıtılmış yetenekler
    tips: [],                // görülen öğretici ipuçları (tips.js; TIPS kimlikleri + 'chapter-<bölüm>' + 'event-<olay>')
    endless: perMap(),       // Sonsuz Gece: bölüm → zorluk → ulaşılan en yüksek dalga
    daily: { last: '', streak: 0, best: 0, wins: 0 }, // Günün Sınavı: son kazanılan gün, seri, en uzun seri, zafer
    challenges: [],          // tamamlanan sınavlar (CHALLENGES kimlikleri)
  };
}

const SEEN_LISTS = { enemy: 'seen', tower: 'seenTowers', skill: 'seenSkills', tip: 'tips' };
const isTipId = (id) => TIPS.order.includes(id)
  || (id.startsWith('chapter-') && MAP_ORDER.includes(id.slice(8)))
  || (id.startsWith('event-') && !!MAP_EVENTS[id.slice(6)]);
const knownId = { enemy: (id) => !!ENEMIES[id], tower: (id) => !!TOWERS[id], skill: (id) => !!SKILLS[id], tip: isTipId };
const cleanList = (list, kind) => (Array.isArray(list)
  ? [...new Set(list.filter((s) => typeof s === 'string' && knownId[kind](s)))]
  : []);

/**
 * Kayıttan gelen rekorları süzerek yükler.
 * Bölümler gelmeden önceki kayıtlarda rekorlar doğrudan zorluk başınaydı
 * ({ best: { easy: 12 } }); bunlar ilk bölümün (Kül Vadisi) rekoru sayılır.
 */
export function applyRecords(raw) {
  const fresh = createRecords();
  const src = isObj(raw) ? raw : {};
  const read = (table, mapId, diffId) => {
    if (!isObj(table)) return undefined;
    if (isObj(table[mapId])) return table[mapId][diffId];
    return mapId === MAP_ORDER[0] ? table[diffId] : undefined; // eski biçim
  };
  for (const mapId of MAP_ORDER) {
    for (const id of DIFFICULTY_ORDER) {
      const best = read(src.best, mapId, id);
      const wins = read(src.wins, mapId, id);
      fresh.best[mapId][id] = isInt(best) ? Math.min(Math.max(best, 0), WAVE_COUNT) : 0;
      fresh.wins[mapId][id] = isInt(wins) && wins >= 0 ? wins : 0;
    }
  }
  fresh.kills = isInt(src.kills) && src.kills >= 0 ? src.kills : 0;
  fresh.runs = isInt(src.runs) && src.runs >= 0 ? src.runs : 0;
  for (const [kind, key] of Object.entries(SEEN_LISTS)) fresh[key] = cleanList(src[key], kind);
  // — modlar (1.5.0) —
  for (const mapId of MAP_ORDER) {
    for (const id of DIFFICULTY_ORDER) {
      const v = isObj(src.endless) && isObj(src.endless[mapId]) ? src.endless[mapId][id] : 0;
      fresh.endless[mapId][id] = isInt(v) ? Math.min(Math.max(v, 0), ENDLESS.maxWave) : 0;
    }
  }
  if (isObj(src.daily)) {
    const d = src.daily;
    fresh.daily.last = isDayKey(d.last) ? d.last : '';
    for (const k of ['streak', 'best', 'wins']) fresh.daily[k] = isInt(d[k]) && d[k] >= 0 ? d[k] : 0;
  }
  fresh.challenges = Array.isArray(src.challenges)
    ? [...new Set(src.challenges.filter((c) => typeof c === 'string' && CHALLENGE_BY_ID[c]))]
    : [];
  Object.assign(state.records, fresh);
}

/**
 * Bir düşmanı, kuleyi ya da yeteneği "tanındı" olarak işaretler.
 * kind: 'enemy' | 'tower' | 'skill'
 * @returns {boolean} oyuncu bunu ilk kez görüyorsa true (keşif kartı gösterilir)
 */
export function discover(kind, id) {
  const key = SEEN_LISTS[kind];
  if (!key || !knownId[kind](id)) return false;
  const list = state.records[key];
  if (list.includes(id)) return false;
  list.push(id);
  return true;
}

/** Düşman tipini "görüldü" olarak işaretler (rehber bunu okur). */
export const markSeen = (enemyType) => discover('enemy', enemyType);

/** Bu kind/id daha önce tanındı mı? */
export const isDiscovered = (kind, id) => !!SEEN_LISTS[kind] && state.records[SEEN_LISTS[kind]].includes(id);

/** Öğretici ipuçlarını baştan gösterir (görülme listesini boşaltır). */
export function resetTips() {
  state.records.tips = [];
}

/* --------------------------------------------------------------------------
 * 10. PROFİL — kalıcı ilerleme (veri şekli ve doğrulama; kurallar meta.js'te)
 * ------------------------------------------------------------------------ */
function createProfile() {
  return {
    gold: 0,                                  // harcanabilir altın
    earned: 0,                                // ömür boyu kazanılan (istatistik)
    towers: [...META.startTowers],            // sahip olunan kuleler
    skills: {},                               // yetenek kimliği → seviye (1..3)
    castle: Object.fromEntries(Object.keys(CASTLE.upgrades).map((k) => [k, 0])),
    ruined: false,                            // kale son oyunda düştü ve onarılmadı
    rightBuilt: false,                        // sağ yan kule inşa edildi mi
    sides: { left: null, right: null },       // yan kulelere takılı yetenekler
    loadout: [],                              // oyuna götürülen kuleler (boşsa: sahip olunan ilk LOADOUT_SIZE kule)
  };
}

/** Kayıttan gelen profili süzerek yükler; bozuk alanlar varsayılana döner. */
export function applyProfile(raw) {
  const p = createProfile();
  const src = isObj(raw) ? raw : {};
  if (isInt(src.gold) && src.gold >= 0) p.gold = src.gold;
  if (isInt(src.earned) && src.earned >= 0) p.earned = src.earned;
  if (Array.isArray(src.towers)) {
    for (const t of src.towers) if (TOWERS[t] && !p.towers.includes(t)) p.towers.push(t);
  }
  if (isObj(src.skills)) {
    for (const [id, lv] of Object.entries(src.skills)) {
      const def = SKILLS[id];
      if (def && isInt(lv) && lv >= 1) p.skills[id] = Math.min(lv, def.levels);
    }
  }
  if (isObj(src.castle)) {
    for (const [k, up] of Object.entries(CASTLE.upgrades)) {
      const lv = src.castle[k];
      if (isInt(lv) && lv >= 0) p.castle[k] = Math.min(lv, up.costs.length);
    }
  }
  p.ruined = src.ruined === true;
  p.rightBuilt = src.rightBuilt === true;
  if (isObj(src.sides)) {
    for (const side of SIDES) {
      const id = src.sides[side];
      const usable = side === 'left' || p.rightBuilt;
      if (usable && typeof id === 'string' && p.skills[id] && !Object.values(p.sides).includes(id)) p.sides[side] = id;
    }
  }
  if (Array.isArray(src.loadout)) {
    for (const t of src.loadout) {
      if (p.loadout.length >= LOADOUT_SIZE) break;
      if (typeof t === 'string' && p.towers.includes(t) && !p.loadout.includes(t)) p.loadout.push(t);
    }
  }
  state.profile = p;
}

/** İki 'YYYY-AA-GG' arasındaki gün farkı (b − a). */
function dayGap(a, b) {
  const t = (k) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
  return Math.round((t(b) - t(a)) / 86400000);
}

/**
 * Biten oyunu rekorlara işler. Bölüm rekoru ve zaferler yalnızca bölüm
 * (campaign) oyunlarından gelir; modların kendi kayıtları var.
 * @returns {{reached:number, newBest:boolean, firstWin:boolean, best:number,
 *            dailyFirst:boolean, streak:number, challengeFirst:boolean}}
 */
export function recordRunResult(victory) {
  const run = state.run;
  const rec = state.records;
  const out = { reached: run.wave, newBest: false, firstWin: false, best: 0, dailyFirst: false, streak: 0, challengeFirst: false };
  // zaferden sonra sürdürülen Sonsuz Gece: oyun ve önceki öldürmeler zaferde sayıldı
  rec.kills += run.stats.kills - (run.carry ? run.carry.kills : 0);
  if (!run.carry) rec.runs += 1;
  if (run.mode === 'endless') {
    // Sonsuz Gece bitince: ulaşılan dalga (son başlayan dalga) rekor olur
    const table = rec.endless[run.mapId];
    out.newBest = run.wave > table[run.difficulty];
    if (out.newBest) table[run.difficulty] = run.wave;
    out.best = table[run.difficulty];
    return out;
  }
  if (run.mode === 'daily') {
    if (victory) out.reached = state.map.waves.length;
    const d = rec.daily;
    if (victory && d.last !== run.daily) {
      const gap = d.last ? dayGap(d.last, run.daily) : 99;
      if (gap > 0) { // eski bir günün sınavı (gece yarısı geçti) seriyi geri saramaz
        d.streak = gap === 1 ? d.streak + 1 : 1;
        d.best = Math.max(d.best, d.streak);
        d.last = run.daily;
      }
      d.wins += 1;
      out.dailyFirst = true;
    }
    out.streak = d.streak;
    return out;
  }
  if (run.mode === 'challenge') {
    if (victory) out.reached = state.map.waves.length;
    if (victory && !rec.challenges.includes(run.challenge)) {
      rec.challenges.push(run.challenge);
      out.challengeFirst = true;
    }
    return out;
  }
  const best = rec.best[run.mapId];
  const wins = rec.wins[run.mapId];
  out.reached = victory ? state.map.waves.length : run.wave;
  out.firstWin = victory && DIFFICULTY_ORDER.every((id) => wins[id] === 0); // bölüm ilk kez kazanıldı
  out.newBest = out.reached > best[run.difficulty];
  if (out.newBest) best[run.difficulty] = out.reached;
  out.best = best[run.difficulty];
  if (victory) wins[run.difficulty] += 1;
  return out;
}
