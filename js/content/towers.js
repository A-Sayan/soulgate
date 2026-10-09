/* ==========================================================================
 *  SOULGATE — content/towers.js
 *  Sorumluluk : Kule tabloları (12 kule). Saf veri; metinler dil
 *               paketlerinde, canlı bağlama ve dondurma config.js'te.
 *  Bağımlılık : YOK.
 *
 *  Her kule: 3 düz seviye + 4. seviyede iki "Ustalık" dalından biri.
 *   levels[i].cost  → o seviyeye çıkmanın bedeli (levels[0] = kuruluş), ruh
 *   masteries[j]    → seviye 3'ün üzerine yazılan değerler (yazılmayan miras kalır)
 *  Kuleler oyun içinde kilit açmaz: oyun dışı çarşıda altınla satın alınır
 *  (META.towerPrice). Bazıları ancak ilgili bölüm açılınca çarşıya gelir.
 *
 *  projectile (atış biçimi):
 *   arrow  → hedefi kovalayan ok          shard  → kovalayan, küçük alanlı kıymık
 *   shell / glob → kavisli, yere düşen    bolt   → anlık, seken şimşek
 *   lance  → düz giden, içinden geçtiği düşmanları delen mızrak
 *   beam   → sürekli ışın; aynı hedefte kaldıkça ısınır (hasar/sn)
 *   cone   → kısa menzilli alev konisi (ya da halka)
 *   bullet → çok hızlı, uzun menzilli tek atış
 *   none   → atış yok: aura (lanet), destek (çan) ya da ekonomi (kuyu)
 * ========================================================================== */

/** İstatistiklerin varsayılanları — her kulenin her durumu bunlarla tamamlanır. */
export const TOWER_STAT_DEFAULTS = {
  damage: 0, rate: 1, range: 2.5,
  splash: 0,
  slow: 0, slowDur: 0,
  freezeChance: 0, freezeDur: 0,
  stunChance: 0, stunDur: 0,
  chains: 0, chainRange: 1.6, chainFalloff: 0.7,
  crit: 0, critMult: 1,
  multishot: 1,
  burnDps: 0, burnDur: 0,
  poisonDps: 0, poisonDur: 0, poisonMax: 0, poisonPctHp: 0,
  contagion: 0,
  brittle: 0,
  auraAmp: 0, auraShred: 0, auraSlow: 0, auraSouls: 0,
  // — yeni kuleler —
  pierce: 0, armorPierce: 0, pull: 0,           // Mızrak Atar
  dps: 0, rampMax: 1, rampTime: 1, forks: 0, forkMult: 0.5, // Kristal Prizma
  cone: 0, melt: 0,                             // Ejder Ağzı (cone: yarım açı, radyan)
  bossBonus: 0, bigBonus: 0, execute: 0,        // Kara Avcı
  buffRate: 0, buffDmg: 0, buffRange: 0, knell: 0, // Savaş Çanı
  soulGen: 0, soulEvery: 0, interest: 0, interestMax: 0, mendLives: 0, // Ruh Kuyusu
};

export const TOWER_DEFS = {
  archer: {
    dmgType: 'phys',
    projectile: 'arrow',
    projSpeed: 15,
    targetsAir: true,
    targetsGround: true,
    colors: { main: '#c8a26b', glow: '#ffd27a', dark: '#3a2a17' },
    panelStats: ['damage', 'rate', 'range', 'crit', 'multishot'],
    levels: [
      { cost: 50, damage: 10, rate: 1.6, range: 2.6 },
      { cost: 65, damage: 17, rate: 1.8, range: 2.8 },
      { cost: 110, damage: 28, rate: 2.0, range: 3.0 },
    ],
    masteries: [
      { id: 'eagle', cost: 190, damage: 52, rate: 1.9, range: 3.8, crit: 0.25, critMult: 2.5 },
      { id: 'volley', cost: 190, damage: 30, rate: 2.3, range: 3.0, multishot: 3 },
    ],
  },

  mortar: {
    dmgType: 'phys',
    projectile: 'shell',
    projSpeed: 5.5,
    targetsAir: false,
    targetsGround: true,
    colors: { main: '#b0533e', glow: '#ff7a2f', dark: '#2b1410' },
    panelStats: ['damage', 'rate', 'range', 'splash', 'burnDps', 'stunDur'],
    levels: [
      { cost: 90, damage: 30, rate: 0.5, range: 3.2, splash: 0.9 },
      { cost: 95, damage: 52, rate: 0.55, range: 3.3, splash: 1.0 },
      { cost: 150, damage: 85, rate: 0.6, range: 3.5, splash: 1.1 },
    ],
    masteries: [
      { id: 'hellmaw', cost: 260, damage: 150, splash: 1.3, burnDps: 20, burnDur: 3 },
      { id: 'quake', cost: 260, damage: 110, splash: 1.5, stunChance: 0.6, stunDur: 0.6 },
    ],
  },

  frost: {
    dmgType: 'magic',
    projectile: 'shard',
    projSpeed: 10,
    targetsAir: true,
    targetsGround: true,
    colors: { main: '#6fb7d6', glow: '#a6ecff', dark: '#11262f' },
    panelStats: ['damage', 'rate', 'range', 'slow', 'splash', 'freezeChance', 'brittle'],
    levels: [
      { cost: 70, damage: 5, rate: 1.0, range: 2.4, slow: 0.35, slowDur: 1.8, splash: 0.55 },
      { cost: 75, damage: 9, rate: 1.0, range: 2.6, slow: 0.45, slowDur: 1.8, splash: 0.55 },
      { cost: 120, damage: 14, rate: 1.1, range: 2.8, slow: 0.55, slowDur: 2.0, splash: 0.75 },
    ],
    masteries: [
      { id: 'zero', cost: 210, damage: 22, slow: 0.6, freezeChance: 0.18, freezeDur: 1.4 },
      { id: 'brittle', cost: 210, damage: 18, splash: 1.0, brittle: 0.25 },
    ],
  },

  tesla: {
    dmgType: 'magic',
    projectile: 'bolt',
    projSpeed: 0, // anlık
    targetsAir: true,
    targetsGround: true,
    colors: { main: '#7d6be0', glow: '#c9bbff', dark: '#1b1636' },
    panelStats: ['damage', 'rate', 'range', 'chains', 'stunChance'],
    levels: [
      { cost: 125, damage: 24, rate: 0.75, range: 2.5, chains: 2, chainFalloff: 0.7 },
      { cost: 115, damage: 38, rate: 0.8, range: 2.5, chains: 3, chainFalloff: 0.7 },
      { cost: 180, damage: 58, rate: 0.85, range: 2.7, chains: 4, chainFalloff: 0.72 },
    ],
    masteries: [
      { id: 'thunder', cost: 300, damage: 150, rate: 0.7, chains: 2, chainFalloff: 0.6, stunChance: 0.5, stunDur: 0.4 },
      { id: 'web', cost: 300, damage: 55, rate: 0.95, chains: 8, chainFalloff: 0.9, chainRange: 1.9 },
    ],
  },

  poison: {
    dmgType: 'pure',
    projectile: 'glob',
    projSpeed: 7,
    targetsAir: true,
    targetsGround: true,
    colors: { main: '#5f9a3a', glow: '#a4ff63', dark: '#15240c' },
    panelStats: ['poisonDps', 'poisonMax', 'rate', 'range', 'splash', 'poisonPctHp'],
    levels: [
      { cost: 100, damage: 4, rate: 0.75, range: 2.6, splash: 0.6, poisonDps: 7, poisonDur: 4, poisonMax: 3 },
      { cost: 95, damage: 5, rate: 0.75, range: 2.6, splash: 0.6, poisonDps: 11, poisonDur: 4, poisonMax: 4 },
      { cost: 150, damage: 6, rate: 0.8, range: 2.8, splash: 0.8, poisonDps: 16, poisonDur: 4, poisonMax: 5 },
    ],
    masteries: [
      { id: 'plague', cost: 250, poisonDps: 22, poisonMax: 6, contagion: 1 },
      { id: 'rot', cost: 250, poisonDps: 18, poisonMax: 6, poisonPctHp: 0.003 },
    ],
  },

  curse: {
    dmgType: 'magic',
    projectile: 'none', // aura: "rate" vuruş sıklığı, "damage" nabız hasarı
    projSpeed: 0,
    targetsAir: true,
    targetsGround: true,
    colors: { main: '#8a2a4a', glow: '#ff4f8f', dark: '#26070f' },
    panelStats: ['auraAmp', 'auraShred', 'damage', 'range', 'auraSlow', 'auraSouls'],
    levels: [
      { cost: 110, damage: 3, rate: 1.0, range: 1.9, auraAmp: 0.15, auraShred: 0.3 },
      { cost: 100, damage: 5, rate: 1.0, range: 2.1, auraAmp: 0.22, auraShred: 0.3 },
      { cost: 150, damage: 8, rate: 1.0, range: 2.4, auraAmp: 0.30, auraShred: 0.35 },
    ],
    masteries: [
      { id: 'harvest', cost: 220, damage: 10, auraSouls: 0.6 },
      { id: 'doom', cost: 220, damage: 12, range: 2.6, auraAmp: 0.42, auraSlow: 0.2 },
    ],
  },

  /* ---------------- MIZRAK ATAR: düz giden, sıra delen mızrak ---------------- */
  lance: {
    dmgType: 'phys',
    projectile: 'lance',
    projSpeed: 17,
    targetsAir: true,
    targetsGround: true,
    colors: { main: '#9a7d5a', glow: '#ffe2b0', dark: '#2a2018' },
    panelStats: ['damage', 'rate', 'range', 'pierce', 'armorPierce', 'slow'],
    levels: [
      { cost: 110, damage: 28, rate: 0.7, range: 3.0, pierce: 3 },
      { cost: 105, damage: 46, rate: 0.75, range: 3.2, pierce: 3, armorPierce: 0.2 },
      { cost: 170, damage: 74, rate: 0.8, range: 3.4, pierce: 4, armorPierce: 0.3 },
    ],
    masteries: [
      { id: 'impaler', cost: 280, damage: 112, rate: 0.85, range: 3.8, pierce: 8, armorPierce: 0.6 },
      { id: 'harpoon', cost: 280, damage: 240, rate: 0.65, pierce: 1, pull: 0.9, slow: 0.5, slowDur: 1.6 },
    ],
  },

  /* ---------------- KRİSTAL PRİZMA: aynı hedefte ısınan ışın ---------------- */
  prism: {
    dmgType: 'magic',
    projectile: 'beam',
    projSpeed: 0,
    targetsAir: true,
    targetsGround: true,
    colors: { main: '#4fc8bc', glow: '#b8fff4', dark: '#0f2a28' },
    panelStats: ['dps', 'rampMax', 'range', 'forks'],
    levels: [
      { cost: 140, dps: 16, range: 2.6, rampMax: 2.5, rampTime: 2.5 },
      { cost: 130, dps: 26, range: 2.7, rampMax: 3, rampTime: 2.5 },
      { cost: 200, dps: 40, range: 2.9, rampMax: 3.5, rampTime: 2.5 },
    ],
    masteries: [
      { id: 'focus', cost: 320, dps: 54, range: 3.1, rampMax: 6, rampTime: 2 },
      { id: 'refract', cost: 320, dps: 48, rampMax: 3.5, forks: 2, forkMult: 0.5 },
    ],
  },

  /* ---------------- EJDER AĞZI: kısa menzilli alev konisi ---------------- */
  flame: {
    dmgType: 'magic',
    projectile: 'cone',
    projSpeed: 0,
    targetsAir: false,
    targetsGround: true,
    colors: { main: '#a8482a', glow: '#ffb347', dark: '#2a0e06' },
    panelStats: ['damage', 'rate', 'range', 'burnDps', 'cone', 'melt'],
    levels: [
      { cost: 120, damage: 6, rate: 3, range: 1.8, cone: 0.55, burnDps: 8, burnDur: 2 },
      { cost: 115, damage: 10, rate: 3, range: 1.9, cone: 0.6, burnDps: 13, burnDur: 2 },
      { cost: 180, damage: 15, rate: 3.2, range: 2.0, cone: 0.65, burnDps: 19, burnDur: 2.5 },
    ],
    masteries: [
      { id: 'blackfire', cost: 290, damage: 20, burnDps: 28, burnDur: 3, melt: 0.35 },
      { id: 'ring', cost: 290, damage: 18, range: 1.9, cone: Math.PI, burnDps: 23 },
    ],
  },

  /* ---------------- KARA AVCI: uzun menzil, ağır tek atış ---------------- */
  hunter: {
    dmgType: 'phys',
    projectile: 'bullet',
    projSpeed: 26,
    targetsAir: true,
    targetsGround: true,
    defaultTarget: 'strong',
    colors: { main: '#4a4652', glow: '#e8d7a8', dark: '#121218' },
    panelStats: ['damage', 'rate', 'range', 'bossBonus', 'bigBonus', 'execute', 'crit'],
    levels: [
      { cost: 130, damage: 76, rate: 0.4, range: 4.6 },
      { cost: 125, damage: 126, rate: 0.43, range: 4.9 },
      { cost: 190, damage: 196, rate: 0.46, range: 5.2 },
    ],
    masteries: [
      { id: 'slayer', cost: 300, damage: 290, rate: 0.48, range: 5.6, bossBonus: 1.2, bigBonus: 0.5 },
      { id: 'executioner', cost: 300, damage: 240, rate: 0.5, execute: 0.18, crit: 0.2, critMult: 2 },
    ],
  },

  /* ---------------- SAVAŞ ÇANI: yakındaki kuleleri hızlandırır ---------------- */
  bell: {
    dmgType: 'magic',
    projectile: 'none', // destek: çevresindeki kulelere güç verir
    projSpeed: 0,
    targetsAir: true,
    targetsGround: true,
    support: true,
    colors: { main: '#b8913a', glow: '#ffe08a', dark: '#2a2010' },
    panelStats: ['buffRate', 'buffDmg', 'buffRange', 'range', 'knell', 'damage'],
    levels: [
      { cost: 150, range: 1.6, buffRate: 0.12 },
      { cost: 140, range: 1.8, buffRate: 0.18, buffDmg: 0.05 },
      { cost: 200, range: 2.0, buffRate: 0.22, buffDmg: 0.1 },
    ],
    masteries: [
      { id: 'charge', cost: 330, range: 2.3, buffRate: 0.32, buffDmg: 0.2, buffRange: 0.12 },
      { id: 'knell', cost: 330, range: 2.2, buffRate: 0.25, buffDmg: 0.12, knell: 0.7, rate: 0.25, damage: 25 },
    ],
  },

  /* ---------------- RUH KUYUSU: savaş sürerken ruh üretir ---------------- */
  well: {
    dmgType: 'pure',
    projectile: 'none', // ekonomi: saldırmaz
    projSpeed: 0,
    targetsAir: false,
    targetsGround: false,
    economy: true,
    colors: { main: '#3a8aa8', glow: '#a8e6ff', dark: '#0e2430' },
    panelStats: ['soulGen', 'soulEvery', 'interest', 'mendLives'],
    levels: [
      { cost: 160, range: 1, soulGen: 6, soulEvery: 8 },
      { cost: 150, range: 1, soulGen: 10, soulEvery: 8 },
      { cost: 220, range: 1, soulGen: 15, soulEvery: 7.5 },
    ],
    masteries: [
      { id: 'bank', cost: 300, soulGen: 18, interest: 0.08, interestMax: 90 },
      { id: 'spring', cost: 300, soulGen: 16, mendLives: 1 },
    ],
  },
};

/** Çarşı, rehber ve seçim ekranındaki sıra. */
export const TOWER_ORDER = ['archer', 'mortar', 'frost', 'poison', 'tesla', 'curse', 'lance', 'prism', 'flame', 'hunter', 'bell', 'well'];
