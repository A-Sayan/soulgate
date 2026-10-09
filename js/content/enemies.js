/* ==========================================================================
 *  SOULGATE — content/enemies.js
 *  Sorumluluk : Düşman tabloları (39 düşman, 11'i boss). Saf veri; adlar
 *               dil paketlerinde, varsayılanlarla tamamlama config.js'te.
 *  Bağımlılık : YOK.
 *
 *  Her düşman bir kuleye "soru sorar":
 *   Kurt → yavaşlatma?  Şövalye → büyü?  Hortlak → lanet?  Yarasa → havan dışı?
 *   Rahip → öncelikli hedef?  Dev → zehir?  Kuluçka Ana → alan hasarı?
 *   Ayaz Kurdu → yavaşlatma işe yaramaz, ham hasar?  Kuzgun → ıskalamayan
 *   alan/aura?  Şişkin → uzaktan öldür?  Davulcu → önce o?  Örümcek →
 *   kuleleri dağıt?  Kâhin → zehri/yavaşlatmayı temizler, önce onu?
 *  hp/souls (ruh ödülü) değerleri dalga 1 içindir; dalga, zorluk ve bölüm
 *  çarpanlarıyla büyür.
 *
 *  YETENEK ALANLARI (yoksa null / 0 / [])
 *   regen          saniyede maks. canın oranı kadar yenilenir (zehir durdurur)
 *   immune         ['slow','freeze','stun','burn','push'] — etkilenmediği durumlar
 *   evasion        tek hedefli mermilerden kaçma olasılığı (alan/aura/zehir kaçmaz)
 *   phase          { every, duration, speed?, kind } — hedef alınamaz evre
 *                  kind 'ghost' (hortlak) | 'burrow' (toprağa gömülür, hızlanır)
 *   heal           { every, radius, pct } — çevresini iyileştirir
 *   ward           { every, radius, pct, dur } — çevresine can kalkanı verir
 *   haste          { radius, mult } — çevresindekiler hızlanır (aura)
 *   cleanse        { every, radius } — çevresinden yavaşlatma/zehir/yanmayı siler
 *   blink          { every, dist } — yol boyunca ileri ışınlanır
 *   web            { every, range, duration } — en yakın kuleyi ağla susturur
 *   enrage         { below, speed } — canı oranın altına inince hızlanır
 *   spawnOnDeath   { type, count } — ölünce yavru doğurur
 *   deathBlast     { radius, duration } — ölünce yakındaki kuleleri susturur
 *   summon         { type, count, every } — yürürken çağırır
 *   scorch         { every, radius, duration, kind } — çevresindeki kuleleri susturur
 *                  kind: 'fire' | 'frost' | 'void' (yalnızca görüntü ve ses)
 *   blizzard       { every, duration, rate } — bütün kulelerin atış hızı düşer
 *   hex            { every, count, range, duration } — en güçlü kuleleri susturur
 *   harden         { every, duration, phys } — fiziksel hasar × phys olur
 *   rebirth        { hp, radius, duration } — ilk ölümünde küllerinden doğar
 *   shieldPhases   { at:[can oranları], duration, summon:{type,count}, regen? }
 * ========================================================================== */

export const ENEMY_DEFAULTS = {
  armor: 0,
  resist: 0,
  flying: false,
  boss: false,
  minion: false,
  regen: 0,
  immune: [],
  evasion: 0,
  phase: null,
  heal: null,
  ward: null,
  haste: null,
  cleanse: null,
  blink: null,
  web: null,
  enrage: null,
  spawnOnDeath: null,
  deathBlast: null,
  summon: null,
  scorch: null,
  blizzard: null,
  hex: null,
  harden: null,
  rebirth: null,
  shieldPhases: null,
};

export const ENEMY_DEFS = {
  /* ===================== KÜL VADİSİ ===================== */
  ghoul: {
    hp: 42, speed: 1.0, souls: 4, lives: 1, size: 0.30,
    colors: { body: '#56634a', dark: '#232a1e', eye: '#ffc53a' },
  },
  wolf: {
    hp: 26, speed: 1.85, souls: 3, lives: 1, size: 0.27,
    colors: { body: '#4b4453', dark: '#1b171f', eye: '#ff3b3b' },
  },
  knight: {
    hp: 115, speed: 0.7, armor: 0.55, souls: 9, lives: 2, size: 0.34,
    colors: { body: '#a39d92', dark: '#3a3833', eye: '#58eaff' },
  },
  wraith: {
    hp: 62, speed: 1.15, resist: 0.45, souls: 7, lives: 1, size: 0.30,
    phase: { every: 3.4, duration: 1.2, kind: 'ghost' },
    colors: { body: '#7f93cf', dark: '#1a2142', eye: '#eaf6ff' },
  },
  bat: {
    hp: 34, speed: 1.45, flying: true, souls: 4, lives: 1, size: 0.25,
    colors: { body: '#6b2133', dark: '#250a11', eye: '#ff2b3c' },
  },
  shaman: {
    hp: 75, speed: 0.85, resist: 0.2, souls: 11, lives: 1, size: 0.31,
    heal: { every: 3.0, radius: 1.6, pct: 0.08 },
    colors: { body: '#8f1d2a', dark: '#36090f', eye: '#ffe066' },
  },
  brute: {
    hp: 340, speed: 0.5, armor: 0.3, resist: 0.3, regen: 0.012, souls: 24, lives: 3, size: 0.46,
    colors: { body: '#6d635a', dark: '#28231f', eye: '#ff8a2a' },
  },
  brood: {
    hp: 160, speed: 0.72, armor: 0.15, souls: 12, lives: 2, size: 0.40,
    spawnOnDeath: { type: 'larva', count: 4 },
    colors: { body: '#6c7a2a', dark: '#252e0f', eye: '#d6ff3a' },
  },
  larva: {
    hp: 20, speed: 1.35, souls: 1, lives: 1, size: 0.18, minion: true,
    colors: { body: '#8a9a3a', dark: '#2e3510', eye: '#eaff6a' },
  },
  skeleton: {
    hp: 48, speed: 0.9, armor: 0.3, souls: 2, lives: 1, size: 0.27, minion: true,
    colors: { body: '#cfc6b5', dark: '#4a453d', eye: '#58eaff' },
  },

  /* ===================== AYAZ GEÇİDİ ===================== */
  frostwolf: {
    hp: 40, speed: 1.7, resist: 0.1, souls: 4, lives: 1, size: 0.28,
    immune: ['slow', 'freeze', 'stun'],
    colors: { body: '#a9c4d6', dark: '#2b3a48', eye: '#7fe8ff' },
  },
  raven: {
    hp: 30, speed: 1.55, flying: true, souls: 4, lives: 1, size: 0.24,
    evasion: 0.35,
    colors: { body: '#2c2c3c', dark: '#0e0e16', eye: '#bff4ff' },
  },
  golem: {
    hp: 240, speed: 0.55, armor: 0.6, souls: 14, lives: 2, size: 0.44,
    spawnOnDeath: { type: 'shardling', count: 3 },
    colors: { body: '#8fb8d0', dark: '#2c4a5e', eye: '#e6fbff' },
  },
  shardling: {
    hp: 28, speed: 1.3, armor: 0.3, souls: 1, lives: 1, size: 0.2, minion: true,
    colors: { body: '#b8e2f2', dark: '#3a6a82', eye: '#ffffff' },
  },
  witch: {
    hp: 85, speed: 0.8, resist: 0.35, souls: 12, lives: 1, size: 0.31,
    ward: { every: 4, radius: 1.7, pct: 0.3, dur: 6 },
    colors: { body: '#3a5a8a', dark: '#101a30', eye: '#9fe8ff' },
  },

  /* ===================== KARA BATAKLIK ===================== */
  slime: {
    hp: 110, speed: 0.7, resist: 0.25, souls: 8, lives: 1, size: 0.34,
    spawnOnDeath: { type: 'slimelet', count: 2 },
    colors: { body: '#4f7d3a', dark: '#16280f', eye: '#d6ff6a' },
  },
  slimelet: {
    hp: 36, speed: 1.05, resist: 0.25, souls: 2, lives: 1, size: 0.22, minion: true,
    colors: { body: '#6a9a4a', dark: '#1e3214', eye: '#e8ff8a' },
  },
  bloater: {
    hp: 160, speed: 0.6, armor: 0.1, souls: 11, lives: 2, size: 0.40,
    deathBlast: { radius: 1.7, duration: 3 },
    colors: { body: '#7a8a5a', dark: '#2a2a18', eye: '#ffcf3a' },
  },
  lurker: {
    hp: 90, speed: 0.95, armor: 0.25, souls: 8, lives: 1, size: 0.30,
    phase: { every: 4.2, duration: 1.6, speed: 1.9, kind: 'burrow' },
    colors: { body: '#6a5638', dark: '#201a10', eye: '#ffb02a' },
  },
  troll: {
    hp: 420, speed: 0.5, armor: 0.2, resist: 0.1, regen: 0.03, souls: 26, lives: 3, size: 0.48,
    colors: { body: '#4f6a4a', dark: '#1a2418', eye: '#ff6a2a' },
  },

  /* ===================== KOR OCAKLARI ===================== */
  imp: {
    hp: 42, speed: 1.45, resist: 0.3, souls: 4, lives: 1, size: 0.25,
    immune: ['burn'],
    colors: { body: '#c84a2a', dark: '#3a0a05', eye: '#ffd23a' },
  },
  drummer: {
    hp: 150, speed: 0.72, armor: 0.35, souls: 13, lives: 2, size: 0.38,
    haste: { radius: 1.9, mult: 1.35 },
    colors: { body: '#7a3a2a', dark: '#2a100a', eye: '#ffb35c' },
  },
  molten: {
    hp: 360, speed: 0.48, armor: 0.5, resist: 0.2, souls: 24, lives: 3, size: 0.46,
    immune: ['burn'],
    enrage: { below: 0.5, speed: 1.8 },
    colors: { body: '#3a2a28', dark: '#120a08', eye: '#ff7a1a' },
  },
  wyvern: {
    hp: 105, speed: 1.1, flying: true, resist: 0.4, souls: 10, lives: 2, size: 0.34,
    colors: { body: '#8a2a1a', dark: '#2a0805', eye: '#ffd27a' },
  },

  /* ===================== BOŞLUK TAHTI ===================== */
  voidwalker: {
    hp: 105, speed: 0.8, resist: 0.3, souls: 9, lives: 1, size: 0.31,
    blink: { every: 4.5, dist: 1.8 },
    colors: { body: '#4a3a6a', dark: '#120a20', eye: '#d08aff' },
  },
  spider: {
    hp: 125, speed: 0.9, armor: 0.25, souls: 10, lives: 1, size: 0.32,
    web: { every: 5, range: 2.4, duration: 2.6 },
    colors: { body: '#2a2430', dark: '#0a080e', eye: '#ff3aa0' },
  },
  revenant: {
    hp: 300, speed: 0.6, armor: 0.5, resist: 0.5, souls: 20, lives: 2, size: 0.38,
    colors: { body: '#3a3a5a', dark: '#0e0e1a', eye: '#a07aff' },
  },
  oracle: {
    hp: 80, speed: 0.85, flying: true, resist: 0.5, souls: 9, lives: 1, size: 0.28,
    cleanse: { every: 3, radius: 1.8 },
    colors: { body: '#6a4a8a', dark: '#1a0e2a', eye: '#ffe06a' },
  },

  /* ===================== BOSS'LAR ===================== */
  boss_bone: {
    boss: true,
    hp: 1250, speed: 0.42, armor: 0.4, resist: 0.2, souls: 160, lives: 8, size: 0.62,
    summon: { type: 'skeleton', count: 3, every: 6.5 },
    colors: { body: '#ddd3c0', dark: '#2d2a25', eye: '#3affd5' },
  },
  boss_dragon: {
    boss: true, flying: true,
    hp: 2800, speed: 0.45, armor: 0.1, resist: 0.35, souls: 320, lives: 10, size: 0.70,
    scorch: { every: 7, radius: 2.6, duration: 2.5, kind: 'fire' },
    colors: { body: '#5a2418', dark: '#1a0805', eye: '#ffb21a' },
  },
  boss_king: {
    boss: true,
    hp: 4600, speed: 0.38, armor: 0.35, resist: 0.35, souls: 0, lives: 999, size: 0.72,
    shieldPhases: { at: [0.66, 0.33], duration: 3.5, summon: { type: 'wraith', count: 5 } },
    colors: { body: '#2a1f3a', dark: '#0b0812', eye: '#ff2a55' },
  },
  boss_yeti: {
    boss: true,
    hp: 3000, speed: 0.4, armor: 0.45, resist: 0.15, souls: 340, lives: 10, size: 0.70,
    scorch: { every: 7, radius: 2.4, duration: 2.5, kind: 'frost' },
    enrage: { below: 0.4, speed: 1.6 },
    colors: { body: '#d8e6ee', dark: '#3a4a5a', eye: '#58c8ff' },
  },
  boss_queen: {
    boss: true,
    hp: 5200, speed: 0.36, armor: 0.2, resist: 0.45, souls: 0, lives: 999, size: 0.70,
    blizzard: { every: 10, duration: 4, rate: 0.5 },
    summon: { type: 'frostwolf', count: 4, every: 9 },
    colors: { body: '#cfe8ff', dark: '#1a2a44', eye: '#bff4ff' },
  },
  boss_rotmother: {
    boss: true,
    hp: 2800, speed: 0.4, armor: 0.15, resist: 0.4, souls: 360, lives: 10, size: 0.68,
    hex: { every: 8, count: 2, range: 4.5, duration: 4 },
    heal: { every: 4, radius: 2.2, pct: 0.06 },
    colors: { body: '#5a3a4a', dark: '#1e0f18', eye: '#b6ff3a' },
  },
  boss_hydra: {
    boss: true,
    hp: 4800, speed: 0.33, armor: 0.3, resist: 0.3, souls: 0, lives: 999, size: 0.74,
    shieldPhases: { at: [0.75, 0.5, 0.25], duration: 2.5, summon: { type: 'slime', count: 3 }, regen: 0.004 },
    colors: { body: '#2e4a2e', dark: '#0a120a', eye: '#d6ff3a' },
  },
  boss_smith: {
    boss: true,
    hp: 3300, speed: 0.38, armor: 0.6, resist: 0.2, souls: 380, lives: 10, size: 0.70,
    harden: { every: 9, duration: 3.5, phys: 0.1 },
    summon: { type: 'imp', count: 4, every: 8 },
    colors: { body: '#4a4048', dark: '#16121a', eye: '#ff8a2a' },
  },
  boss_phoenix: {
    boss: true, flying: true,
    hp: 3600, speed: 0.42, armor: 0.1, resist: 0.35, souls: 0, lives: 999, size: 0.70,
    rebirth: { hp: 0.5, radius: 2.6, duration: 3 },
    scorch: { every: 8, radius: 2.3, duration: 2, kind: 'fire' },
    immune: ['burn'],
    colors: { body: '#ff7a2a', dark: '#5a1a05', eye: '#fff0a0' },
  },
  boss_herald: {
    boss: true,
    hp: 2800, speed: 0.4, armor: 0.3, resist: 0.5, souls: 420, lives: 10, size: 0.70,
    blink: { every: 6, dist: 2.2 },
    summon: { type: 'voidwalker', count: 3, every: 8 },
    colors: { body: '#2a1a3a', dark: '#0a0512', eye: '#e08aff' },
  },
  boss_void: {
    boss: true,
    hp: 3900, speed: 0.3, armor: 0.4, resist: 0.4, souls: 0, lives: 999, size: 0.78,
    shieldPhases: { at: [0.75, 0.5, 0.25], duration: 3.5, summon: { type: 'revenant', count: 3 } },
    scorch: { every: 9, radius: 2.4, duration: 2.5, kind: 'void' },
    blink: { every: 10, dist: 1.5 },
    colors: { body: '#1a0e28', dark: '#05020a', eye: '#ff3a8a' },
  },
};
