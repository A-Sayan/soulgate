/* ==========================================================================
 *  SOULGATE — content/chapters.js
 *  Sorumluluk : Bölümler — her bölümün haritası (yollar, süsler), renk
 *               teması, müziği, zorluk çarpanları, çarşıya getirdikleri ve
 *               30 dalgası. Saf veri; adlar ve dalga adları dil paketlerinde.
 *  Bağımlılık : YOK.
 *
 *  HARİTA (9 × 16 ızgara)
 *   paths: bir ya da iki yol. Köşe noktaları [sütun, satır]; ilk nokta ekranın
 *   üstündeki geçittir (satır −1). Bütün yollar kalede (4, 15) biter ve son
 *   parçaları kuzeyden dikey iner (kale kapısı kuzeye bakar). İki yollu
 *   haritalarda yollar bir noktada birleşir; birleşmeden sonraki köşe
 *   noktaları iki yolda aynıdır.
 *   decor: kule kurulamayan süs hücreleri (art/maps.js çizer).
 *
 *  DALGALAR
 *   g(tür, adet, aralık_sn, başlangıç_sn, yol): dalga başından "başlangıç"
 *   sn sonra başlar, "aralık" sn arayla "adet" düşman doğurur. yol verilmezse
 *   iki yollu haritada düşmanlar yollara sırayla dağılır.
 *   Boss'lar: dalga 10, 20, 30. Dalga 10'da önceki bölümlerden biri geri döner.
 *
 *  TEHDİT: threats → bölümün asıl tehditleri (THREATS kimlikleri, config.js);
 *  dalgalardaki sıradan düşmanların can payından seçildi. Bölüm kartında ve
 *  zorluk ekranında simgeyle, maps.<id>.threat cümlesiyle görünür.
 *  ÇARPANLAR: hp → düşman canı, horde → yalnızca sıradan düşmanların canı
 *  (patronlar hariç; ilk bölümlerde biraz yüksek, en zor bölümde düşük),
 *  souls → ruh ödülü, reward → oyun sonu altını.
 *  unlocks: bölüm AÇILINCA çarşıya gelen kule ve yetenekler.
 *  OLAY: event → bölümün kendine özgü harita olayı (config MAP_EVENTS kimliği):
 *  Kül Vadisi mezarlardan kalkan ölüler (mezar süsleri), Ayaz Geçidi tipi, Kara
 *  Bataklık gaz kabarcığı, Kor Ocakları lav sıçraması (lav süsleri), Boşluk Tahtı yarık.
 * ========================================================================== */

/**
 * Dalga grubu. echo > 0: önceki bölümün patronunun "yankısı" — canı bu
 * katsayıyla çarpılır ve kaleye ulaşırsa yalnızca WAVE_RULES.echoLives can
 * götürür (asıl bölüm sonu patronu gibi kaleyi tek başına düşürmez).
 */
const g = (type, count, gap, at = 0, path = -1, echo = 0) => ({ type, count, gap, at, path, echo });

/** Kale bütün haritalarda aynı yerde: yolun son hücresi ve iki yanındaki burçlar. */
const CASTLE_SPOT = { c: 4, r: 15, cells: [[3, 14], [5, 14], [3, 15], [5, 15]] };

export const CHAPTER_DEFS = [
  /* ======================================================================
   * 1. KÜL VADİSİ — yanık topraklar, tek yol, yılan gibi kıvrılır
   * ==================================================================== */
  {
    id: 'kul-vadisi',
    paths: [
      [[1, -1], [1, 2], [7, 2], [7, 6], [1, 6], [1, 10], [7, 10], [7, 13], [4, 13], [4, 15]],
    ],
    castle: CASTLE_SPOT,
    decor: [
      { c: 0, r: 0, kind: 'tree' },
      { c: 8, r: 1, kind: 'rock' },
      { c: 4, r: 4, kind: 'shrine' },
      { c: 0, r: 8, kind: 'grave' },
      { c: 8, r: 8, kind: 'tree' },
      { c: 3, r: 12, kind: 'grave' },
      { c: 0, r: 14, kind: 'rock' },
      { c: 8, r: 14, kind: 'tree' },
    ],
    hp: 1, horde: 1.08, souls: 1, reward: 1,
    threats: ['armor', 'regen'], // asıl tehdit etiketleri (dalgaların can payına göre; metin: lang threats.*, maps.*.threat)
    event: 'rise', // harita olayı (config MAP_EVENTS)
    unlocks: { towers: [], skills: [] },
    theme: {
      ground: ['#0d0b11', '#15121b', '#1a1620'],
      blotch: ['#2a2233', '#0a080c'],
      speck: ['#3a3342', '#050407'],
      tuft: ['#2b2a1c', '#23202a'],
      path: { outer: '#3d2d20', fill: '#2b2119', stone: ['#3e3024', '#1c1510'] },
      portal: '#ff2a3c', portalGlow: '#ff3b4e',
      fog: '#6c5b8a',
      night: [4, 2, 10],
      ambient: 'ash',
      accent: '#ff7a2f',
    },
    music: { root: 55, scale: [0, 2, 3, 5, 7, 8, 10], boss: [0, 1, 3, 5, 7, 8, 10] },
    procession: ['ghoul', 'wraith', 'knight', 'ghoul', 'brute', 'shaman', 'wolf', 'wraith', 'skeleton'],
    // ana menünün hareketli sahnesinde (bu bölüm en son açılansa) duran kuleler
    showcase: [
      { type: 'archer', c: 2, r: 3, level: 2, mastery: 0 },
      { type: 'frost', c: 6, r: 8, level: 2, mastery: -1 },
      { type: 'mortar', c: 4, r: 11, level: 1, mastery: -1 },
      { type: 'curse', c: 6, r: 12, level: 2, mastery: 1 },
      { type: 'poison', c: 8, r: 5, level: 1, mastery: -1 },
    ],
    waves: [
      /*  1 */ { tag: 'normal', groups: [g('ghoul', 8, 1.3)] },
      /*  2 */ { tag: 'normal', groups: [g('ghoul', 10, 1.1), g('wolf', 4, 0.9, 7)] },
      /*  3 */ { tag: 'swarm', groups: [g('wolf', 14, 0.6)] },
      /*  4 */ { tag: 'normal', groups: [g('ghoul', 12, 0.95), g('knight', 2, 3, 5)] },
      /*  5 */ { tag: 'armored', groups: [g('knight', 6, 2.2), g('ghoul', 10, 0.8, 3)] },
      /*  6 */ { tag: 'air', groups: [g('bat', 12, 0.7), g('ghoul', 8, 1, 4)] },
      /*  7 */ { tag: 'phase', groups: [g('wraith', 7, 1.6), g('wolf', 10, 0.6, 2)] },
      /*  8 */ { tag: 'normal', groups: [g('shaman', 2, 5, 2), g('ghoul', 16, 0.7), g('knight', 4, 2, 8)] },
      /*  9 */ { tag: 'swarm', groups: [g('brood', 4, 3.2), g('wolf', 12, 0.55, 2)] },
      /* 10 */ { tag: 'boss', groups: [g('ghoul', 8, 1.2), g('boss_bone', 1, 0, 4), g('skeleton', 6, 1.5, 10)] },
      /* 11 */ { tag: 'normal', groups: [g('brute', 2, 6, 3), g('ghoul', 16, 0.7)] },
      /* 12 */ { tag: 'air', groups: [g('bat', 18, 0.5), g('wraith', 6, 1.4, 4)] },
      /* 13 */ { tag: 'armored', groups: [g('knight', 10, 1.4), g('shaman', 3, 3, 5)] },
      /* 14 */ { tag: 'swarm', groups: [g('wolf', 24, 0.4), g('bat', 10, 0.6, 5)] },
      /* 15 */ { tag: 'normal', groups: [g('brood', 6, 2.5), g('brute', 3, 5, 4), g('ghoul', 12, 0.8, 2)] },
      /* 16 */ { tag: 'phase', groups: [g('wraith', 16, 0.9), g('shaman', 4, 3, 3), g('knight', 6, 1.6, 5)] },
      /* 17 */ { tag: 'armored', groups: [g('knight', 12, 1.2), g('brute', 3, 5, 6), g('bat', 12, 0.6, 3)] },
      /* 18 */ { tag: 'normal', groups: [g('shaman', 6, 2.2), g('ghoul', 28, 0.45, 1), g('wraith', 8, 1.4, 8)] },
      /* 19 */ { tag: 'swarm', groups: [g('brood', 8, 2.0), g('wolf', 20, 0.45, 3), g('brute', 4, 4.5, 8)] },
      /* 20 */ { tag: 'boss', groups: [g('bat', 16, 0.5), g('boss_dragon', 1, 0, 6), g('bat', 10, 0.6, 16)] },
      /* 21 */ { tag: 'armored', groups: [g('brute', 6, 3.5), g('knight', 10, 1.2, 2)] },
      /* 22 */ { tag: 'air', groups: [g('wraith', 14, 0.95), g('bat', 20, 0.45, 3), g('knight', 6, 1.5, 6)] },
      /* 23 */ { tag: 'normal', groups: [g('ghoul', 30, 0.35), g('shaman', 6, 2.5, 2), g('knight', 8, 1.5, 6)] },
      /* 24 */ { tag: 'swarm', groups: [g('brood', 8, 1.9), g('brute', 5, 3.4, 4)] },
      /* 25 */ { tag: 'armored', groups: [g('knight', 16, 1.0), g('brute', 6, 3, 3), g('shaman', 4, 3, 6)] },
      /* 26 */ { tag: 'air', groups: [g('bat', 30, 0.35), g('wraith', 14, 0.9, 4), g('brute', 5, 3, 6)] },
      /* 27 */ { tag: 'swarm', groups: [g('wolf', 40, 0.25), g('brood', 8, 2, 4)] },
      /* 28 */ { tag: 'normal', groups: [g('brute', 12, 2.2), g('shaman', 6, 3, 2), g('wraith', 12, 1, 6)] },
      /* 29 */ { tag: 'normal', groups: [g('knight', 14, 1), g('bat', 20, 0.45, 2), g('brood', 8, 2, 5), g('brute', 6, 3, 8), g('shaman', 6, 3, 4)] },
      /* 30 */ { tag: 'boss', groups: [g('wraith', 10, 1), g('boss_king', 1, 0, 8), g('knight', 10, 1.6, 14), g('bat', 16, 0.6, 20)] },
    ],
  },

  /* ======================================================================
   * 2. AYAZ GEÇİDİ — karlı dağ geçidi, uzun düz koridorlar
   * ==================================================================== */
  {
    id: 'ayaz-gecidi',
    paths: [
      [[7, -1], [7, 3], [2, 3], [2, 6], [6, 6], [6, 9], [1, 9], [1, 12], [4, 12], [4, 15]],
    ],
    castle: CASTLE_SPOT,
    decor: [
      { c: 0, r: 1, kind: 'pine' },
      { c: 4, r: 0, kind: 'ice' },
      { c: 8, r: 5, kind: 'snowrock' },
      { c: 0, r: 6, kind: 'pine' },
      { c: 4, r: 4, kind: 'frozen' },
      { c: 8, r: 9, kind: 'pine' },
      { c: 3, r: 10, kind: 'ice' },
      { c: 7, r: 13, kind: 'snowrock' },
      { c: 0, r: 14, kind: 'pine' },
      { c: 8, r: 15, kind: 'pine' },
    ],
    hp: 1.05, horde: 1.04, souls: 1, reward: 1.25,
    threats: ['armor', 'fast', 'air'], // asıl tehdit etiketleri (dalgaların can payına göre; metin: lang threats.*, maps.*.threat)
    event: 'blizzard', // harita olayı (config MAP_EVENTS)
    unlocks: { towers: ['lance', 'prism'], skills: ['thunder', 'timestop'] },
    theme: {
      ground: ['#0c1018', '#141b26', '#1a2230'],
      blotch: ['#2a3a4e', '#06080e'],
      speck: ['#c8dcef', '#0a0e16'],
      tuft: ['#3a4a58', '#2a3442'],
      path: { outer: '#4a5a6c', fill: '#2c3644', stone: ['#5a6c80', '#1e2632'] },
      portal: '#6fd2ff', portalGlow: '#bff4ff', portalStone: '#4a5866',
      fog: '#9fb8d8',
      night: [2, 6, 14],
      ambient: 'snow',
      accent: '#a6ecff',
    },
    music: { root: 61.74, scale: [0, 2, 3, 5, 7, 9, 10], boss: [0, 1, 3, 5, 7, 8, 10] },
    procession: ['frostwolf', 'witch', 'golem', 'raven', 'frostwolf', 'ghoul', 'knight', 'raven', 'shardling'],
    showcase: [
      { type: 'lance', c: 5, r: 1, level: 2, mastery: 0 },
      { type: 'frost', c: 4, r: 5, level: 2, mastery: 0 },
      { type: 'prism', c: 3, r: 8, level: 2, mastery: 1 },
      { type: 'archer', c: 7, r: 7, level: 1, mastery: -1 },
      { type: 'tesla', c: 2, r: 11, level: 2, mastery: -1 },
    ],
    waves: [
      /*  1 */ { tag: 'normal', groups: [g('ghoul', 5, 1.2), g('frostwolf', 2, 1.2, 6)] },
      /*  2 */ { tag: 'swarm', groups: [g('frostwolf', 10, 0.8)] },
      /*  3 */ { tag: 'normal', groups: [g('ghoul', 6, 1.0), g('knight', 1, 3, 5)] },
      /*  4 */ { tag: 'air', groups: [g('raven', 12, 0.8), g('ghoul', 7, 1, 3)] },
      /*  5 */ { tag: 'armored', groups: [g('golem', 2, 5), g('knight', 4, 2, 3)] },
      /*  6 */ { tag: 'normal', groups: [g('witch', 2, 5, 2), g('ghoul', 11, 0.75), g('frostwolf', 5, 0.8, 6)] },
      /*  7 */ { tag: 'phase', groups: [g('wraith', 8, 1.4), g('frostwolf', 8, 0.7, 3)] },
      /*  8 */ { tag: 'air', groups: [g('raven', 23, 0.6), g('bat', 13, 0.8, 4)] },
      /*  9 */ { tag: 'swarm', groups: [g('frostwolf', 15, 0.45), g('golem', 2, 5, 6)] },
      /* 10 */ { tag: 'boss', groups: [g('ghoul', 8, 1.2), g('boss_bone', 1, 0, 4), g('skeleton', 6, 1.5, 10), g('frostwolf', 6, 0.8, 14)] },
      /* 11 */ { tag: 'armored', groups: [g('golem', 3, 3.5), g('witch', 1, 5, 4), g('knight', 4, 1.6, 6)] },
      /* 12 */ { tag: 'air', groups: [g('raven', 18, 0.5), g('wraith', 6, 1.4, 5)] },
      /* 13 */ { tag: 'normal', groups: [g('witch', 3, 3), g('ghoul', 16, 0.6, 1), g('brute', 2, 6, 8)] },
      /* 14 */ { tag: 'swarm', groups: [g('frostwolf', 19, 0.38), g('raven', 7, 0.6, 5)] },
      /* 15 */ { tag: 'armored', groups: [g('golem', 6, 2.8), g('knight', 8, 1.4, 3), g('witch', 3, 4, 6)] },
      /* 16 */ { tag: 'phase', groups: [g('wraith', 18, 0.9), g('witch', 5, 3, 3), g('frostwolf', 13, 0.6, 6)] },
      /* 17 */ { tag: 'air', groups: [g('raven', 33, 0.45), g('bat', 21, 0.5, 4), g('golem', 4, 4, 8)] },
      /* 18 */ { tag: 'normal', groups: [g('brute', 3, 4.5), g('witch', 4, 3, 2), g('ghoul', 18, 0.5, 4)] },
      /* 19 */ { tag: 'swarm', groups: [g('brood', 7, 2.2), g('frostwolf', 28, 0.4, 3), g('golem', 5, 3.5, 8)] },
      /* 20 */ { tag: 'boss', groups: [g('raven', 12, 0.6), g('boss_yeti', 1, 0, 6), g('frostwolf', 12, 0.6, 14)] },
      /* 21 */ { tag: 'armored', groups: [g('golem', 8, 2.4), g('knight', 10, 1.2, 2), g('witch', 4, 3.5, 6)] },
      /* 22 */ { tag: 'air', groups: [g('raven', 31, 0.4), g('wraith', 14, 0.9, 4), g('bat', 14, 0.6, 8)] },
      /* 23 */ { tag: 'normal', groups: [g('witch', 4, 2.6), g('brute', 4, 3.6, 3), g('ghoul', 19, 0.45, 1)] },
      /* 24 */ { tag: 'swarm', groups: [g('frostwolf', 40, 0.3), g('shaman', 5, 3, 4), g('golem', 6, 3, 8)] },
      /* 25 */ { tag: 'armored', groups: [g('golem', 10, 2), g('knight', 14, 1, 3), g('witch', 5, 3, 6)] },
      /* 26 */ { tag: 'air', groups: [g('raven', 55, 0.33), g('witch', 10, 2.6, 4), g('wraith', 21, 0.9, 8)] },
      /* 27 */ { tag: 'swarm', groups: [g('frostwolf', 46, 0.25), g('raven', 23, 0.45, 4)] },
      /* 28 */ { tag: 'normal', groups: [g('brute', 8, 2.6), g('witch', 8, 2.2, 2), g('golem', 6, 2.6, 6)] },
      /* 29 */ { tag: 'normal', groups: [g('golem', 9, 1.8), g('raven', 21, 0.4, 2), g('frostwolf', 21, 0.4, 5), g('witch', 7, 2.4, 4), g('brute', 5, 3, 8)] },
      /* 30 */ { tag: 'boss', groups: [g('witch', 6, 2), g('boss_queen', 1, 0, 8), g('golem', 6, 2.4, 14), g('raven', 20, 0.5, 20)] },
    ],
  },

  /* ======================================================================
   * 3. KARA BATAKLIK — iki geçit, iki yol; ortada birleşip kaleye iner
   * ==================================================================== */
  {
    id: 'kara-bataklik',
    paths: [
      [[1, -1], [1, 3], [3, 3], [3, 6], [1, 6], [1, 9], [4, 9], [4, 11], [1, 11], [1, 13], [4, 13], [4, 15]],
      [[7, -1], [7, 3], [5, 3], [5, 6], [7, 6], [7, 9], [4, 9], [4, 11], [1, 11], [1, 13], [4, 13], [4, 15]],
    ],
    castle: CASTLE_SPOT,
    decor: [
      { c: 4, r: 1, kind: 'pool' },
      { c: 0, r: 2, kind: 'deadtree' },
      { c: 8, r: 4, kind: 'mushroom' },
      { c: 2, r: 5, kind: 'reeds' },
      { c: 6, r: 8, kind: 'reeds' },
      { c: 0, r: 9, kind: 'mushroom' },
      { c: 8, r: 10, kind: 'deadtree' },
      { c: 6, r: 12, kind: 'pool' },
      { c: 0, r: 15, kind: 'deadtree' },
      { c: 8, r: 15, kind: 'mushroom' },
    ],
    hp: 1.1, horde: 0.97, souls: 1, reward: 1.5,
    threats: ['regen', 'split', 'phase'], // asıl tehdit etiketleri (dalgaların can payına göre; metin: lang threats.*, maps.*.threat)
    event: 'gas', // harita olayı (config MAP_EVENTS)
    unlocks: { towers: ['flame', 'well'], skills: ['plague', 'mend'] },
    theme: {
      ground: ['#080c08', '#101610', '#141a12'],
      blotch: ['#1e2e1a', '#040604'],
      speck: ['#3a4a2a', '#040604'],
      tuft: ['#2e3a1c', '#1e2a16'],
      path: { outer: '#3a3420', fill: '#26221a', stone: ['#3a3426', '#14120c'] },
      portal: '#8cff3a', portalGlow: '#c6ff6a', portalStone: '#3a4234',
      fog: '#6a8a5a',
      night: [2, 6, 3],
      ambient: 'firefly',
      accent: '#b6ff3a',
    },
    music: { root: 51.91, scale: [0, 1, 3, 5, 7, 8, 10], boss: [0, 1, 3, 4, 7, 8, 10] },
    procession: ['slime', 'lurker', 'troll', 'bloater', 'slimelet', 'ghoul', 'shaman', 'lurker', 'slimelet'],
    showcase: [
      { type: 'poison', c: 4, r: 3, level: 2, mastery: 1 },
      { type: 'flame', c: 2, r: 4, level: 2, mastery: 0 },
      { type: 'well', c: 6, r: 4, level: 2, mastery: 0 },
      { type: 'curse', c: 4, r: 7, level: 2, mastery: 0 },
      { type: 'mortar', c: 2, r: 12, level: 2, mastery: 0 },
    ],
    waves: [
      /*  1 */ { tag: 'normal', groups: [g('ghoul', 4, 1.3, 0, 0), g('ghoul', 4, 1.3, 2, 1)] },
      /*  2 */ { tag: 'normal', groups: [g('slime', 2, 2), g('ghoul', 4, 1, 4)] },
      /*  3 */ { tag: 'swarm', groups: [g('wolf', 7, 0.7, 0, 0), g('wolf', 7, 0.7, 1, 1)] },
      /*  4 */ { tag: 'normal', groups: [g('lurker', 5, 1.2), g('ghoul', 5, 1, 3)] },
      /*  5 */ { tag: 'armored', groups: [g('knight', 4, 1.8, 0, 0), g('slime', 3, 2, 3, 1), g('troll', 1, 0, 6, 1)] },
      /*  6 */ { tag: 'air', groups: [g('bat', 12, 0.7), g('bloater', 2, 4, 4)] },
      /*  7 */ { tag: 'phase', groups: [g('wraith', 4, 1.5, 0, 0), g('lurker', 6, 1, 0, 1)] },
      /*  8 */ { tag: 'normal', groups: [g('shaman', 2, 4, 2), g('slime', 6, 1.4), g('ghoul', 11, 0.7, 4)] },
      /*  9 */ { tag: 'swarm', groups: [g('brood', 3, 3, 0, 0), g('slime', 4, 1.6, 0, 1), g('wolf', 8, 0.6, 3)] },
      /* 10 */ { tag: 'boss', groups: [g('bat', 10, 0.8), g('boss_dragon', 1, 0, 6, 0, 0.55), g('bloater', 3, 3, 10, 1)] },
      /* 11 */ { tag: 'armored', groups: [g('troll', 2, 4.5), g('knight', 6, 1.5, 2)] },
      /* 12 */ { tag: 'normal', groups: [g('bloater', 4, 2.4), g('lurker', 7, 0.9, 3)] },
      /* 13 */ { tag: 'swarm', groups: [g('slime', 10, 1.1), g('wolf', 13, 0.5, 3)] },
      /* 14 */ { tag: 'phase', groups: [g('lurker', 7, 0.7), g('wraith', 5, 1, 4)] },
      /* 15 */ { tag: 'armored', groups: [g('troll', 4, 3.6, 0, 0), g('knight', 10, 1.2, 0, 1), g('shaman', 4, 3, 4)] },
      /* 16 */ { tag: 'air', groups: [g('bat', 43, 0.45), g('bloater', 8, 3, 5)] },
      /* 17 */ { tag: 'normal', groups: [g('slime', 14, 1), g('bloater', 6, 2.2, 3), g('ghoul', 20, 0.6, 2)] },
      /* 18 */ { tag: 'swarm', groups: [g('brood', 5, 2, 0, 0), g('slime', 6, 1.2, 0, 1), g('lurker', 7, 0.8, 6)] },
      /* 19 */ { tag: 'armored', groups: [g('troll', 6, 3), g('shaman', 6, 2.6, 2), g('knight', 10, 1.2, 5)] },
      /* 20 */ { tag: 'boss', groups: [g('slime', 4, 1), g('boss_rotmother', 1, 0, 6), g('lurker', 5, 0.7, 12)] },
      /* 21 */ { tag: 'normal', groups: [g('bloater', 8, 2), g('troll', 5, 3.2, 3), g('ghoul', 24, 0.5, 2)] },
      /* 22 */ { tag: 'phase', groups: [g('lurker', 19, 0.55), g('wraith', 12, 0.8, 4)] },
      /* 23 */ { tag: 'swarm', groups: [g('slime', 18, 0.8), g('wolf', 26, 0.35, 3)] },
      /* 24 */ { tag: 'air', groups: [g('bat', 49, 0.4), g('bloater', 14, 2, 4), g('shaman', 7, 3, 6)] },
      /* 25 */ { tag: 'armored', groups: [g('troll', 7, 2.4), g('knight', 12, 1, 3), g('slime', 8, 1, 6)] },
      /* 26 */ { tag: 'normal', groups: [g('bloater', 13, 1.8), g('lurker', 24, 0.6, 2), g('shaman', 8, 2.6, 5)] },
      /* 27 */ { tag: 'swarm', groups: [g('brood', 6, 1.6), g('slime', 10, 0.8, 3), g('wolf', 15, 0.4, 6)] },
      /* 28 */ { tag: 'armored', groups: [g('troll', 10, 2), g('bloater', 8, 2, 3), g('knight', 12, 1.1, 6)] },
      /* 29 */ { tag: 'normal', groups: [g('troll', 7, 2), g('lurker', 19, 0.5, 2), g('slime', 14, 0.9, 4), g('bat', 17, 0.5, 6), g('shaman', 5, 2.5, 3)] },
      /* 30 */ { tag: 'boss', groups: [g('slime', 7, 1), g('boss_hydra', 1, 0, 8), g('troll', 4, 2.6, 14), g('bloater', 6, 2, 18)] },
    ],
  },

  /* ======================================================================
   * 4. KOR OCAKLARI — lav nehirleri arasında uzun bir zikzak
   * ==================================================================== */
  {
    id: 'kor-ocaklari',
    paths: [
      [[1, -1], [1, 1], [7, 1], [7, 4], [1, 4], [1, 7], [7, 7], [7, 10], [1, 10], [1, 13], [4, 13], [4, 15]],
    ],
    castle: CASTLE_SPOT,
    decor: [
      { c: 0, r: 0, kind: 'brazier' },
      { c: 8, r: 2, kind: 'lava' },
      { c: 4, r: 3, kind: 'obsidian' },
      { c: 0, r: 5, kind: 'obsidian' },
      { c: 4, r: 5, kind: 'lava' },
      { c: 8, r: 8, kind: 'lava' },
      { c: 3, r: 9, kind: 'anvil' },
      { c: 0, r: 11, kind: 'brazier' },
      { c: 8, r: 12, kind: 'obsidian' },
      { c: 6, r: 15, kind: 'brazier' },
    ],
    hp: 1.25, horde: 1, souls: 1, reward: 1.75,
    threats: ['fireproof', 'armor', 'air'], // asıl tehdit etiketleri (dalgaların can payına göre; metin: lang threats.*, maps.*.threat)
    event: 'lava', // harita olayı (config MAP_EVENTS)
    unlocks: { towers: ['hunter', 'bell'], skills: ['vortex', 'reaper'] },
    theme: {
      ground: ['#0e0808', '#170e0c', '#1c100c'],
      blotch: ['#3a1408', '#060202'],
      speck: ['#5a2a14', '#060302'],
      tuft: ['#2a1a12', '#1e1410'],
      path: { outer: '#3a2a26', fill: '#1e1614', stone: ['#3a2c28', '#0e0a0a'] },
      portal: '#ff6a1a', portalGlow: '#ffb347', portalStone: '#3a2a28',
      fog: '#8a4a2a',
      night: [10, 3, 2],
      ambient: 'ember',
      accent: '#ff7a1a',
    },
    music: { root: 49, scale: [0, 2, 3, 5, 7, 8, 11], boss: [0, 1, 4, 5, 7, 8, 11] },
    procession: ['imp', 'drummer', 'molten', 'imp', 'wyvern', 'knight', 'imp', 'brute', 'imp'],
    showcase: [
      { type: 'hunter', c: 3, r: 2, level: 2, mastery: 0 },
      { type: 'bell', c: 5, r: 6, level: 2, mastery: 0 },
      { type: 'flame', c: 2, r: 6, level: 2, mastery: 1 },
      { type: 'mortar', c: 6, r: 9, level: 2, mastery: 1 },
      { type: 'tesla', c: 3, r: 11, level: 2, mastery: 0 },
    ],
    waves: [
      /*  1 */ { tag: 'swarm', groups: [g('imp', 5, 0.8)] },
      /*  2 */ { tag: 'normal', groups: [g('ghoul', 7, 1), g('imp', 4, 0.8, 5)] },
      /*  3 */ { tag: 'armored', groups: [g('knight', 3, 1.8), g('drummer', 1, 0, 4)] },
      /*  4 */ { tag: 'air', groups: [g('wyvern', 4, 2.5), g('bat', 8, 0.8, 3)] },
      /*  5 */ { tag: 'swarm', groups: [g('imp', 18, 0.5), g('drummer', 2, 5, 2)] },
      /*  6 */ { tag: 'armored', groups: [g('molten', 1, 5), g('knight', 3, 1.6, 3)] },
      /*  7 */ { tag: 'normal', groups: [g('shaman', 2, 4), g('imp', 11, 0.6, 1), g('drummer', 2, 5, 4)] },
      /*  8 */ { tag: 'air', groups: [g('wyvern', 9, 1.6), g('bat', 14, 0.6, 4)] },
      /*  9 */ { tag: 'swarm', groups: [g('wolf', 14, 0.5), g('imp', 14, 0.5, 3), g('drummer', 2, 5, 5)] },
      /* 10 */ { tag: 'boss', groups: [g('imp', 6, 0.8), g('boss_yeti', 1, 0, 5, -1, 0.55), g('drummer', 2, 4, 10)] },
      /* 11 */ { tag: 'armored', groups: [g('molten', 4, 3.5), g('drummer', 2, 5, 3)] },
      /* 12 */ { tag: 'air', groups: [g('wyvern', 8, 1.1), g('imp', 10, 0.6, 4)] },
      /* 13 */ { tag: 'phase', groups: [g('wraith', 11, 1), g('drummer', 3, 4, 3), g('imp', 11, 0.6, 6)] },
      /* 14 */ { tag: 'swarm', groups: [g('imp', 19, 0.3), g('drummer', 2, 4, 4)] },
      /* 15 */ { tag: 'armored', groups: [g('molten', 5, 3), g('knight', 10, 1.3, 3), g('drummer', 3, 4, 6)] },
      /* 16 */ { tag: 'air', groups: [g('wyvern', 20, 0.9), g('bat', 20, 0.5, 4)] },
      /* 17 */ { tag: 'normal', groups: [g('brute', 5, 4), g('drummer', 5, 3.5, 2), g('imp', 24, 0.5, 4)] },
      /* 18 */ { tag: 'armored', groups: [g('molten', 6, 2.6), g('shaman', 3, 3, 3)] },
      /* 19 */ { tag: 'swarm', groups: [g('imp', 53, 0.3), g('wolf', 35, 0.4, 3), g('drummer', 7, 3, 6)] },
      /* 20 */ { tag: 'boss', groups: [g('wyvern', 3, 1.2), g('boss_smith', 1, 0, 6), g('imp', 6, 0.5, 12)] },
      /* 21 */ { tag: 'armored', groups: [g('molten', 8, 2.4), g('drummer', 4, 3.4, 2), g('knight', 10, 1.1, 6)] },
      /* 22 */ { tag: 'air', groups: [g('wyvern', 23, 0.8), g('drummer', 5, 3.4, 4)] },
      /* 23 */ { tag: 'normal', groups: [g('brute', 4, 3), g('imp', 19, 0.4, 2), g('shaman', 4, 3, 5)] },
      /* 24 */ { tag: 'swarm', groups: [g('imp', 66, 0.25), g('drummer', 8, 3, 3)] },
      /* 25 */ { tag: 'armored', groups: [g('molten', 9, 2), g('knight', 12, 1, 3), g('drummer', 4, 3, 6)] },
      /* 26 */ { tag: 'air', groups: [g('wyvern', 33, 0.7), g('bat', 27, 0.4, 4), g('drummer', 5, 3, 6)] },
      /* 27 */ { tag: 'swarm', groups: [g('imp', 44, 0.22), g('wolf', 24, 0.35, 4)] },
      /* 28 */ { tag: 'armored', groups: [g('molten', 12, 1.8), g('brute', 6, 3, 4), g('drummer', 6, 2.6, 2)] },
      /* 29 */ { tag: 'normal', groups: [g('molten', 10, 1.8), g('wyvern', 20, 0.7, 2), g('imp', 30, 0.3, 4), g('drummer', 6, 2.6, 3), g('shaman', 6, 2.6, 6)] },
      /* 30 */ { tag: 'boss', groups: [g('drummer', 4, 2), g('boss_phoenix', 1, 0, 8), g('molten', 6, 2, 14), g('wyvern', 12, 0.7, 18)] },
    ],
  },

  /* ======================================================================
   * 5. BOŞLUK TAHTI — iki geçit: biri kıvrımlı, biri dümdüz ve kısa
   * ==================================================================== */
  {
    id: 'bosluk-tahti',
    paths: [
      [[1, -1], [1, 2], [3, 2], [3, 5], [1, 5], [1, 8], [4, 8], [4, 11], [7, 11], [7, 13], [4, 13], [4, 15]],
      [[7, -1], [7, 8], [4, 8], [4, 11], [7, 11], [7, 13], [4, 13], [4, 15]],
    ],
    castle: CASTLE_SPOT,
    decor: [
      { c: 4, r: 0, kind: 'pillar' },
      { c: 5, r: 3, kind: 'rift' },
      { c: 0, r: 4, kind: 'obelisk' },
      { c: 5, r: 6, kind: 'floatstone' },
      { c: 8, r: 4, kind: 'pillar' },
      { c: 2, r: 10, kind: 'rift' },
      { c: 8, r: 10, kind: 'obelisk' },
      { c: 0, r: 13, kind: 'floatstone' },
      { c: 1, r: 15, kind: 'pillar' },
      { c: 8, r: 15, kind: 'pillar' },
    ],
    hp: 1.2, horde: 0.95, souls: 1.12, reward: 2,
    threats: ['armor', 'resist', 'blink'], // asıl tehdit etiketleri (dalgaların can payına göre; metin: lang threats.*, maps.*.threat)
    event: 'rift', // harita olayı (config MAP_EVENTS)
    unlocks: { towers: [], skills: [] },
    theme: {
      ground: ['#07050c', '#0e0a16', '#120c1c'],
      blotch: ['#2a1640', '#020104'],
      speck: ['#6a4a9a', '#030206'],
      tuft: ['#2a1e3a', '#1c1428'],
      path: { outer: '#3a2e4a', fill: '#1c1626', stone: ['#3a2e4c', '#0e0a14'] },
      portal: '#b04aff', portalGlow: '#e0a0ff', portalStone: '#2e2640',
      fog: '#5a3a8a',
      night: [6, 2, 12],
      ambient: 'void',
      accent: '#d08aff',
    },
    music: { root: 46.25, scale: [0, 1, 3, 5, 6, 8, 10], boss: [0, 1, 3, 4, 6, 8, 9] },
    procession: ['voidwalker', 'revenant', 'spider', 'oracle', 'voidwalker', 'wraith', 'revenant', 'spider', 'voidwalker'],
    showcase: [
      { type: 'prism', c: 2, r: 4, level: 2, mastery: 0 },
      { type: 'hunter', c: 5, r: 5, level: 2, mastery: 1 },
      { type: 'bell', c: 6, r: 2, level: 2, mastery: 1 },
      { type: 'lance', c: 5, r: 10, level: 2, mastery: 1 },
      { type: 'curse', c: 2, r: 9, level: 2, mastery: 1 },
    ],
    waves: [
      /*  1 */ { tag: 'normal', groups: [g('voidwalker', 2, 1.5, 0, 0), g('ghoul', 2, 1.1, 0, 1)] },
      /*  2 */ { tag: 'swarm', groups: [g('frostwolf', 5, 0.7, 0, 0), g('imp', 5, 0.7, 0, 1)] },
      /*  3 */ { tag: 'normal', groups: [g('spider', 2, 2.5), g('ghoul', 4, 1, 3)] },
      /*  4 */ { tag: 'air', groups: [g('oracle', 4, 2.5), g('raven', 10, 0.7, 2)] },
      /*  5 */ { tag: 'armored', groups: [g('revenant', 2, 4), g('knight', 4, 1.6, 3)] },
      /*  6 */ { tag: 'normal', groups: [g('voidwalker', 5, 1.1), g('witch', 1, 5, 3), g('spider', 2, 2.5, 5)] },
      /*  7 */ { tag: 'swarm', groups: [g('lurker', 5, 0.9, 0, 0), g('frostwolf', 6, 0.6, 0, 1), g('drummer', 1, 5, 4)] },
      /*  8 */ { tag: 'air', groups: [g('wyvern', 6, 1.6), g('oracle', 6, 2, 2), g('raven', 12, 0.6, 4)] },
      /*  9 */ { tag: 'armored', groups: [g('golem', 2, 3.2, 0, 0), g('revenant', 2, 3.2, 0, 1), g('witch', 1, 4, 4)] },
      /* 10 */ { tag: 'boss', groups: [g('wraith', 3, 1), g('boss_king', 1, 0, 6, 0, 0.33), g('voidwalker', 3, 1, 12, 1)] },
      /* 11 */ { tag: 'normal', groups: [g('spider', 6, 1.8), g('voidwalker', 9, 1, 2), g('shaman', 2, 4, 5)] },
      /* 12 */ { tag: 'air', groups: [g('oracle', 5, 1.6), g('wyvern', 6, 1.1, 3), g('raven', 9, 0.5, 6)] },
      /* 13 */ { tag: 'armored', groups: [g('revenant', 3, 2.6), g('molten', 1, 4, 4), g('witch', 2, 3, 6)] },
      /* 14 */ { tag: 'swarm', groups: [g('imp', 10, 0.4, 0, 0), g('frostwolf', 10, 0.4, 0, 1), g('drummer', 2, 4, 4)] },
      /* 15 */ { tag: 'phase', groups: [g('lurker', 14, 0.7), g('wraith', 12, 0.9, 3), g('voidwalker', 12, 0.9, 6)] },
      /* 16 */ { tag: 'normal', groups: [g('troll', 4, 3.6), g('spider', 8, 1.6, 2), g('oracle', 4, 3, 5)] },
      /* 17 */ { tag: 'armored', groups: [g('revenant', 6, 2.2), g('golem', 3, 3, 3), g('witch', 4, 3, 6)] },
      /* 18 */ { tag: 'air', groups: [g('oracle', 9, 1.4), g('wyvern', 12, 0.9, 3), g('raven', 17, 0.45, 6)] },
      /* 19 */ { tag: 'swarm', groups: [g('slime', 15, 1, 0, 0), g('imp', 37, 0.3, 0, 1), g('drummer', 6, 3, 5)] },
      /* 20 */ { tag: 'boss', groups: [g('voidwalker', 4, 0.9), g('boss_herald', 1, 0, 6), g('spider', 2, 1.5, 12)] },
      /* 21 */ { tag: 'armored', groups: [g('revenant', 8, 1.8), g('molten', 4, 3, 3), g('oracle', 3, 3, 6)] },
      /* 22 */ { tag: 'normal', groups: [g('bloater', 7, 2), g('spider', 8, 1.4, 2), g('voidwalker', 13, 0.7, 4)] },
      /* 23 */ { tag: 'air', groups: [g('oracle', 10, 1.2), g('wyvern', 15, 0.8, 3), g('raven', 20, 0.4, 6)] },
      /* 24 */ { tag: 'swarm', groups: [g('frostwolf', 38, 0.3, 0, 0), g('imp', 38, 0.3, 0, 1), g('drummer', 8, 2.6, 4)] },
      /* 25 */ { tag: 'armored', groups: [g('revenant', 9, 1.6), g('troll', 4, 3, 3), g('witch', 5, 2.6, 6)] },
      /* 26 */ { tag: 'phase', groups: [g('voidwalker', 24, 0.5), g('lurker', 18, 0.6, 3), g('oracle', 6, 2.4, 6)] },
      /* 27 */ { tag: 'normal', groups: [g('spider', 8, 1.1), g('molten', 5, 2.2, 3), g('drummer', 3, 2.6, 6)] },
      /* 28 */ { tag: 'armored', groups: [g('revenant', 14, 1.4), g('golem', 8, 2.2, 3), g('oracle', 8, 2, 6)] },
      /* 29 */ { tag: 'normal', groups: [g('revenant', 10, 1.5), g('spider', 10, 1.2, 2), g('voidwalker', 16, 0.6, 4), g('wyvern', 13, 0.8, 6), g('witch', 7, 2.2, 3)] },
      /* 30 */ { tag: 'boss', groups: [g('revenant', 5, 1.6), g('boss_void', 1, 0, 8, 0), g('voidwalker', 10, 0.7, 14), g('oracle', 7, 1.4, 18)] },
    ],
  },
];
