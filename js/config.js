/* ==========================================================================
 *  SOULGATE — config.js
 *  Sorumluluk : Oyundaki tüm sabitler, kurallar ve veri tabloları.
 *  Bağımlılık : i18n (yalnızca metin alanlarını bağlamak için).
 *  Kural      : Burada çalışma anı durumu tutulmaz. Dosyanın sonunda tüm
 *               tablolar dondurulur (Object.freeze), yanlışlıkla değişmez.
 *  Metinler   : Adlar ve açıklamalar burada YAZILMAZ; js/lang/ altındaki
 *               dil paketlerindedir. TOWERS.archer.name gibi alanlar "canlı"
 *               alanlardır: her okunduğunda etkin dildeki metni verir
 *               (bkz. bölüm 18).
 *  Birimler   : mesafe = hücre, süre = saniye, hız = hücre/sn,
 *               oranlar = 0..1 arası kesir (0.25 = %25).
 *  İçerik     : Büyük içerik tabloları js/content/ altındadır (kuleler,
 *               düşmanlar, bölümler); burada tamamlanır, metne bağlanır ve
 *               dondurulur. Oyun kodu her şeyi buradan okur.
 * ========================================================================== */

import { live, liveField, section, LANGUAGES, LANGUAGE_IDS, FALLBACK_LANGUAGE } from './i18n.js';
import { TOWER_DEFS, TOWER_STAT_DEFAULTS as TOWER_STATS, TOWER_ORDER as TOWER_LIST } from './content/towers.js';
import { ENEMY_DEFAULTS, ENEMY_DEFS } from './content/enemies.js';
import { CHAPTER_DEFS } from './content/chapters.js';

/* --------------------------------------------------------------------------
 * 1. KİMLİK
 *  Künye LICENSE dosyasıyla aynı tutulmalıdır.
 * ------------------------------------------------------------------------ */
export const GAME = {
  title: 'Soulgate',
  fullTitle: 'Soulgate: Tower Defense',
  version: '1.5.0',
  year: 2026,                 // ilk yayın yılı
  studio: 'Sayk Studio',      // yayıncı; telif satırında görünür
  owner: 'A. Sayan',          // telif sahibi
  credits: [                  // lisans ekranındaki künye (rol → lang: strings.about.roles)
    { role: 'publisher', name: 'Sayk Studio' },
    { role: 'developer', name: 'A. Sayan' },
    { role: 'assistant', name: 'S. Soytürk' },
  ],
  // tagline, taglines → canlı metin (bölüm 18)
  // Geri bildirim: ana menü ve ayarlardaki düğme bu adresi yeni sekmede açar
  // (Android uygulamasında telefonun tarayıcısında). İleride Play Store / GitHub
  // sayfasına yönlendirmek için yalnızca bu satır değişir.
  feedbackUrl: 'https://a-sayan.itch.io/soulgate-tower-defense',
};

/* --------------------------------------------------------------------------
 * 2. BÖLÜMLER VE HARİTALAR
 *  Dikey ekran için 9 × 16 ızgara (telefon oranına ~9:16 oturur).
 *  Beş bölüm, her biri kendi haritası, teması, müziği ve 30 dalgasıyla
 *  (content/chapters.js). Bölüm n+1, bölüm n herhangi bir zorlukta
 *  kazanılınca açılır. Kale bütün haritalarda en alttaki aynı yerdedir.
 *  map.waves[i].name → dil paketindeki dalga adı (yoksa '').
 * ------------------------------------------------------------------------ */
export const GRID = { cols: 9, rows: 16 };

export const MAPS = CHAPTER_DEFS.map((def, index) => ({ ...def, index, waves: def.waves.map((w) => ({ ...w })) }));
export const MAP_BY_ID = Object.fromEntries(MAPS.map((m) => [m.id, m]));
export const MAP_ORDER = MAPS.map((m) => m.id);
/** Bütün bölümlerde dalga sayısı aynıdır (kayıt doğrulaması ve arayüz için). */
export const WAVE_COUNT = 30;

/**
 * EKRAN DÜZENİ (1.3.0). Yatay ve yeterince büyük ekranda (bilgisayar, yatay
 * tablet) "geniş" düzen: harita ortada ekran boyunca, solda bilgi paneli,
 * sağda kule ve dalga paneli; menüler çok sütunlu. Aksi hâlde telefon düzeni
 * (geniş ama alçak ya da dar pencerede ortada dikey sahne). main.js bu sorguya
 * göre <html>'e .wide sınıfı koyar; style.css ve ui.js o sınıfa bakar.
 * Yatay telefon (yükseklik < 500) bu düzene girmez: orada "dik tut" uyarısı var.
 */
/**
 * ÖĞRETİCİ İPUÇLARI (tips.js). Kimlikler görülme listesine yazılır (records.tips);
 * metinler lang tips.<kimlik>. Sıra: aynı anda sıraya girenlerde öncelik (küçük önce).
 * 'chapter-<bölüm>' ipuçları (2.–5. bölüm) bölümün tehdidini ilk girişte anlatır;
 * 'event-<olay>' ipuçları her harita olayını ilk patlak verişinde (MAP_EVENTS).
 */
export const TIPS = {
  order: [
    'build', 'chain', 'wave', 'upgrade', 'speed', 'auto', 'discover', 'skill', 'boss',
    'wrath', 'elite', 'endless', 'mastery', 'loadout', 'market', 'equip', 'modes',
  ],
  delay: 0.6,   // bir ipucu kapandıktan sonra sıradakine kadar (sn)
};

export const LAYOUT = {
  wideQuery: '(min-aspect-ratio: 5/4) and (min-width: 880px) and (min-height: 500px)',
};

/* --------------------------------------------------------------------------
 * 3. ZAMAN
 * ------------------------------------------------------------------------ */
export const TIMING = {
  step: 1 / 60,      // sabit mantık adımı (hız ne olursa olsun deterministik)
  maxFrame: 0.1,     // uzun takılmalarda tek karede patlamayı önler
  speeds: [1, 2, 3, 0], // oyun hızı düğmesinin sırası; 0 = zaman durur (kurulum ve yükseltme serbest)
};

/* Otomatik dalga ayarlarının sınırları (ayar şeması ve game.js aynı değerleri okur). */
export const AUTO_WAVE = {
  maxEnemies: 30,   // "kalan düşman" kaydırıcısının en üstü = koşul yok
  maxSouls: 2000,   // "ruh birikimi" kaydırıcısının en üstü
  soulsStep: 50,
};

/* --------------------------------------------------------------------------
 * 4. EKONOMİ VE ZORLUK
 *  İki para birimi var:
 *   RUH   → oyun içi. Öldürmeler ve dalga bonuslarıyla gelir; kule kurma,
 *           yükseltme ve ücretli yetenek kullanımı ruhla ödenir. Oyun bitince sıfırlanır.
 *   ALTIN → kalıcı. Yalnızca oyun sonunda kazanılır (bölüm 15b), çarşıda harcanır.
 * ------------------------------------------------------------------------ */
export const ECONOMY = {
  sellRefund: 0.7,          // satışta yatırımın %70'i geri gelir
  freshRefund: 1.0,         // bu hazırlık evresinde kurulduysa tam iade
  waveClearBase: 20,        // dalga temizleme bonusu = taban + dalga × ek
  waveClearPerWave: 4,
  earlyCallPerSecond: 3,    // erken çağrıda kalan her saniye için ruh
};

/*
 * Zorluklar. events: harita olaylarının sıklığı (rate, çarpan) ve sertliği (power:
 * susturma süresi, kalkan payı, kalkan ölü sayısı…; bkz. MAP_EVENTS). elites: dalga
 * ELITE.fromWave'den sonra sıradan düşmanların seçkin doğma olasılığı. wrath: patronlar
 * öfke yeteneği kazanır (BOSS_WRATH). Kâbus (1.5.0): olaylar sık ve sert, seçkinler,
 * öfkeli patronlar; ham can çarpanı biraz düştü, zorluk mekaniklerden gelir.
 */
export const DIFFICULTIES = {
  easy: {
    id: 'easy',
    hp: 0.78, souls: 1.08, lives: 30, startSouls: 250, reward: 0.7,
    events: { rate: 0.75, power: 0.85 }, elites: 0, wrath: false,
  },
  normal: {
    id: 'normal',
    hp: 1.0, souls: 1.0, lives: 20, startSouls: 200, reward: 1.0,
    events: { rate: 1, power: 1 }, elites: 0, wrath: false,
  },
  hard: {
    id: 'hard',
    hp: 1.08, souls: 1.0, lives: 12, startSouls: 180, reward: 1.9,
    events: { rate: 1.6, power: 1.35 }, elites: 0.1, wrath: true,
  },
};
export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard'];
export const DEFAULT_DIFFICULTY = 'normal';

/* --------------------------------------------------------------------------
 * 5. ÖLÇEKLEME — dalga numarasına (1..30) göre çarpanlar
 *  Can eğrisi hafif üsteldir: dalga 10 ≈ ×2.3, dalga 20 ≈ ×4.6, dalga 30 ≈ ×7.7
 *  Bunun üstüne sıradan düşmanlar (hordeHp) ile patronlar (bossHp) ayrı eğri
 *  izler: 1.2.1'den beri sıradan dalgalar daha dayanıklı (oyuncu haritayı
 *  kolayca doldurmasın), patronlar biraz daha az; böylece azalan ruha karşın
 *  patron savaşları eskisi gibi kalır. Bölümün kendi "horde" çarpanı da eklenir.
 *  Ruh 10. dalgaya kadar eskisi gibi, sonra daha yavaş artar; geç oyunda her
 *  kuleyi en üste çıkarmak artık mümkün değil, harcama kararları ağırlaşır.
 *  (Değerler 30 dalgayı oynayan bot simülasyonlarıyla ayarlandı: dev/economy.mjs.)
 * ------------------------------------------------------------------------ */
export const SCALING = {
  hp: (w) => 1 + 0.11 * (w - 1) + 0.0042 * (w - 1) ** 2,
  // sıradan düşmanlar: dalga 1 ×1.05, 10 ×1.08, 20 ×1.11, 30 ×1.14 (× bölümün horde'u)
  hordeHp: (w) => 1.05 + 0.003 * (w - 1),
  // patronlar ve yankıları: dalga 10 ×0.96, 20 ×0.92, 30 ×0.88 (azalan geç oyun ruhunu dengeler);
  // Sonsuz Gece'de ×0.75'in altına inmez
  bossHp: (w) => Math.max(0.75, 1 - 0.004 * (w - 1)),
  // dalga 10'a kadar dalga başına +%4.5, sonra +%3.5 (dalga 30: ×2.11; eskiden ×2.31)
  souls: (w) => 1 + 0.045 * (Math.min(w, 10) - 1) + 0.035 * Math.max(0, w - 10),
  speed: (w) => Math.min(1.35, 1 + 0.004 * (w - 1)), // Sonsuz Gece'de en çok ×1.35
};

/* --------------------------------------------------------------------------
 * 6. DALGA AKIŞI
 *  İlk dalga oyuncu "Başlat" diyene kadar bekler. Sonraki dalgaların
 *  geri sayımı, önceki dalganın son düşmanı doğduğunda başlar; yani
 *  yavaş temizlersen dalgalar üst üste biner. Erken çağrı altın kazandırır.
 * ------------------------------------------------------------------------ */
export const WAVE_RULES = {
  firstWaveManual: true,
  interWaveTime: 14,
  preBossTime: 22,
  echoLives: 10,   // önceki bölümden dönen patron (yankı) kaleye ulaşırsa götürdüğü can
  echoSouls: 320,  // yankı patronun bıraktığı ruh (asıl hali bölüm sonunda düştüğü için ödülsüzdür)
};

/* --------------------------------------------------------------------------
 * 6b. MODLAR, KURALLAR, HARİTA OLAYLARI (1.5.0)
 *  Oyun modu (run.mode):
 *   campaign  → bölümün 30 dalgası (yıldız ve bölüm açılması yalnızca buradan)
 *   endless   → Sonsuz Gece: 30. dalgadan sonra dalgalar biter (ENDLESS); zafer yok,
 *               rekor = ulaşılan dalga. Kazanılan bölümde açılır; bir bölüm zaferinin
 *               ardından aynı savaş "Sonsuza devam et" ile de sürdürülebilir.
 *   daily     → Günün Sınavı: her gün (yerel tarih) kazanılmış bölümlerden biri ve
 *               DAILY_POOL'dan iki kural; günde ilk zafer DAILY.bonus kazandırır.
 *   challenge → Sınavlar (CHALLENGES): sabit bölüm, zorluk ve kurallar; ilk
 *               tamamlamada ödül. Bölümü kazanınca açılır.
 *  Mod oyunlarında yenilgi kaleyi yıkmaz; bölüm rekorları ve yıldızlar değişmez.
 * ------------------------------------------------------------------------ */
export const MODES = ['campaign', 'endless', 'daily', 'challenge'];

/**
 * Kurallar (sınavlar ve günün sınavı açar). Metin: lang mods.<kimlik>.
 *  glass     kale tek canla başlar (Surlar ve onarım sayılmaz)
 *  wrath     patronlar öfkelidir (BOSS_WRATH; Kâbus'ta zaten öyle)
 *  scarce    öldürme, dalga ve erken çağrı ruhu × souls
 *  swift     düşmanlar × speed hızlı
 *  armored   bütün düşmanların zırhı ve direnci + armor (en çok 0.85)
 *  horde     sıradan düşman grupları × count kalabalık
 *  noskills  yan kulelerin yetenekleri kullanılamaz
 *  nosell    kule satılamaz
 *  nomastery ustalık seçilemez (kuleler 3. seviyede kalır)
 *  fog       kule menzilleri + range (eksi = kısa)
 *  storm     harita olayları × events sık
 * weight: kuralın ağırlığı (Günün Sınavı'nda iki kuralın toplamı DAILY.maxWeight'i geçmez:
 * iki ağır kural bir arada çıkmaz, sınav yapılabilir kalır).
 */
export const MODIFIERS = {
  glass: { id: 'glass', weight: 3, lives: 1 },
  wrath: { id: 'wrath', weight: 2 },
  scarce: { id: 'scarce', weight: 2, souls: 0.8 },
  swift: { id: 'swift', weight: 2, speed: 1.2 },
  armored: { id: 'armored', weight: 1, armor: 0.15 },
  horde: { id: 'horde', weight: 2, count: 1.35 },
  noskills: { id: 'noskills', weight: 2 },
  nosell: { id: 'nosell', weight: 1 },
  nomastery: { id: 'nomastery', weight: 1 },
  fog: { id: 'fog', weight: 1, range: -0.15 },
  storm: { id: 'storm', weight: 1, events: 2.2 },
};
export const MODIFIER_ORDER = ['glass', 'wrath', 'scarce', 'swift', 'armored', 'horde', 'noskills', 'nosell', 'nomastery', 'fog', 'storm'];

/**
 * Sınavlar: her bölüme iki tane. map: bölüm (kazanılınca açılır), reward: ilk
 * tamamlamada altın (oyunun kendi ödülüne ek). Metin: lang challenges.<kimlik>.
 */
export const CHALLENGES = [
  { id: 'glass-ash', map: 'kul-vadisi', difficulty: 'normal', mods: ['glass'], reward: 260 },
  { id: 'iron-ash', map: 'kul-vadisi', difficulty: 'normal', mods: ['armored', 'nosell'], reward: 240 },
  { id: 'wrath-frost', map: 'ayaz-gecidi', difficulty: 'normal', mods: ['wrath', 'swift'], reward: 320 },
  { id: 'silent-frost', map: 'ayaz-gecidi', difficulty: 'normal', mods: ['noskills'], reward: 320 },
  { id: 'horde-mire', map: 'kara-bataklik', difficulty: 'normal', mods: ['horde', 'nomastery'], reward: 400 },
  { id: 'fog-mire', map: 'kara-bataklik', difficulty: 'normal', mods: ['fog', 'storm'], reward: 400 },
  { id: 'storm-forge', map: 'kor-ocaklari', difficulty: 'normal', mods: ['storm', 'wrath'], reward: 480 },
  { id: 'scarce-forge', map: 'kor-ocaklari', difficulty: 'normal', mods: ['scarce', 'horde'], reward: 480 },
  { id: 'night-void', map: 'bosluk-tahti', difficulty: 'hard', mods: ['wrath', 'storm'], reward: 650 },
  { id: 'glass-void', map: 'bosluk-tahti', difficulty: 'normal', mods: ['glass'], reward: 650 },
];
export const CHALLENGE_BY_ID = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));

/** Günün Sınavı: zorluk sabit, kurallar DAILY_POOL'dan; ilk zaferin ek altını = bonus × bölüm ödül çarpanı. */
export const DAILY = { difficulty: 'normal', mods: 2, maxWeight: 3, bonus: 220 };
export const DAILY_POOL = ['wrath', 'scarce', 'swift', 'armored', 'horde', 'noskills', 'nosell', 'nomastery', 'fog', 'storm'];

/**
 * Sonsuz Gece. 30. dalgadan sonra dalgalar bölümün 11–29. dalgalarından (20. hariç)
 * sırayla türetilir, her 10. dalga bölümün patronlarından biridir (10, 20, 30. dalga
 * patronları sırayla). Can ve hız dalga numarasıyla büyümeye devam eder (SCALING),
 * can ayrıca dalga başına hpGrowth (bileşik) artar; düşman sayısı dalga başına
 * countGrowth artar (en çok countMax katı) ve
 * seçkin payı elitePerWave artar (en çok eliteMax). Altın: 30'dan sonraki her dalga
 * META.reward.perWave × rewardMult.
 */
export const ENDLESS = {
  hpGrowth: 0.05,   // 30'dan sonra düşman canı dalga başına ayrıca ×1.05 (bileşik): gece giderek ağırlaşır
  countGrowth: 0.025, countMax: 2,
  elitePerWave: 0.01, eliteMax: 0.3,
  rewardMult: 1.5,
  maxWave: 9999, // kayıt doğrulaması için üst sınır
};

/** Seçkin düşman: can ve ruh katı, hız; dalga fromWave'den önce çıkmaz. Patron ve yavru seçkin olmaz. */
export const ELITE = { hp: 1.6, souls: 2, speed: 1.08, fromWave: 4 };

/**
 * Patron öfkesi (Kâbus ya da "Öfkeli Patronlar" kuralı): can × hp; her roar.every
 * sn'de kükrer (radius içindeki kuleler duration sn susar); canı rage.below'un
 * altına inince rage.speed kat hızlanır.
 */
export const BOSS_WRATH = {
  hp: 1.12,
  roar: { every: 11, radius: 2.2, duration: 1.6, first: 6 },
  rage: { below: 0.5, speed: 1.3 },
};

/**
 * HARİTA OLAYLARI — her bölümün kendine özgü olayı (content/chapters.js → event).
 * Yalnızca savaş sürerken (sahada düşman varken) ve EVENT_RULES.fromWave'den sonra
 * patlak verir; her olaydan önce haritada uyarı (warn sn) görünür. every: iki olay
 * arası [en az, en çok] sn (zorluğun events.rate'i ve "storm" kuralı kısaltır).
 * Zorluğun events.power'ı olayın oyuncuya zor gelen yanını büyütür.
 *  rise     Kül Vadisi — Ölüler Uyanıyor: bir mezardan count (+1 / perWaves dalga) iskelet kalkar.
 *           Yeni kalkmış, çürük iskeletlerdir: can × hp, zırh armor; ama mezar eşyası taşır, ruhları
 *           × souls (fazladan düşman, fazladan ruh). İlk bölüm olduğu için 5. dalgadan önce olmaz.
 *           power → iskelet sayısı.
 *  blizzard Ayaz Geçidi — Tipi: duration sn kuleler towerRate hızında ateş eder, düşmanlar
 *           enemySlow kadar yavaşlar (yavaşlamayanlar hariç). power → süre ve kule yavaşlığı.
 *  gas      Kara Bataklık — Bataklık Gazı: radius alanda kuleler silence sn susar; duration sn
 *           boyunca içindeki düşmanlar dps × dalga can ölçeği saf hasar alır, zehirlenir
 *           (yenilenmeleri durur). power → susturma.
 *  lava     Kor Ocakları — Lav Sıçraması: lav gölünden globs top fırlar; düştüğü yerde
 *           düşmanlar damage × can ölçeği büyü hasarı alıp tutuşur (uçanlar hariç), kuleler
 *           silence sn susar. power → susturma, Kâbus'ta bir top fazla.
 *  rift     Boşluk Tahtı — Boşluk Yarığı: yolda duration sn açık kalan yarık; içinden geçen
 *           her düşman (patron hariç) push hücre geri savrulur ama canının ward payı kadar
 *           boşluk kalkanı kazanır. power → kalkan.
 */
export const MAP_EVENTS = {
  rise: { id: 'rise', every: [40, 58], warn: 1.8, count: 2, perWaves: 15, type: 'skeleton', fromWave: 5, hp: 0.6, armor: 0, souls: 3 },
  blizzard: { id: 'blizzard', every: [40, 56], warn: 1.8, duration: 6, towerRate: 0.8, enemySlow: 0.3 },
  gas: { id: 'gas', every: [34, 50], warn: 1.6, radius: 1.35, duration: 6, dps: 8, silence: 2.5 },
  lava: { id: 'lava', every: [32, 48], warn: 1.5, globs: 2, radius: 1.0, damage: 26, burn: 0.07, burnDur: 3, silence: 2.2 },
  rift: { id: 'rift', every: [36, 52], warn: 1.6, radius: 0.75, duration: 7, push: 2.4, ward: 0.15 },
};
export const EVENT_RULES = { fromWave: 3, firstDelay: 0.6, maxRate: 3 }; // fromWave: olay kendi fromWave'ini verebilir

export const WAVE_TAGS = {
  normal: { color: '#e9e1d3' },
  swarm: { color: '#ffb35c' },
  armored: { color: '#cfd6e0' },
  air: { color: '#ff6b7d' },
  phase: { color: '#a9c2ff' },
  boss: { color: '#ff3b4e' },
};

/* --------------------------------------------------------------------------
 * 7. SAVAŞ KURALLARI
 *  Üç hasar tipi var ve her biri farklı bir savunmaya takılır:
 *   phys  → zırh (armor) azaltır
 *   magic → direnç (resist) azaltır
 *   pure  → hiçbir şey azaltmaz (zehir)
 * ------------------------------------------------------------------------ */
export const DAMAGE_TYPES = {
  phys: { color: '#f2e6d0' },
  magic: { color: '#c9b0ff' },
  pure: { color: '#a8ff7c' },
};

export const COMBAT = {
  armorCap: 0.9,            // hiçbir savunma hasarı %90'dan fazla kesemez
  slowCap: 0.75,            // yavaşlatma en fazla %75
  bossSlowFactor: 0.5,      // boss'lar yavaşlatmanın yarısını hisseder
  bossPctHpFactor: 0.25,    // maks-can yüzdeli hasar boss'ta %25 etkili
  bossStunImmune: true,     // boss'lar sersemlemez / donmaz
  stunGrace: 1.0,           // sersemleme bitince 1 sn bağışıklık (kilitlemeyi önler)
  curseStacks: false,       // birden çok lanet aurası toplanmaz, en güçlüsü geçerli
  shredMode: 'relative',    // savunma kırma: zırh × (1 − shred); direnç de aynı şekilde
  poisonStackRule: 'max',   // düşmandaki katman sınırı = onu zehirleyen kulelerin en yüksek poisonMax'i
  poisonBlocksRegen: true,  // zehirli düşman yenilenemez
  poisonHealCut: 0.5,       // zehirli düşmana gelen iyileştirme yarıya iner
  healCooldown: 2.5,        // bir düşman bu süre içinde ikinci kez iyileştirilemez (rahipler üst üste binmez)
  chainHopDelay: 0.05,      // şimşek sekmeleri arası görsel gecikme
  contagionRadius: 1.2,     // Kara Veba bulaşma yarıçapı
  spawnSpread: 0.35,        // ölümde doğan yavruların yol üzerindeki dağılımı
};

/* --------------------------------------------------------------------------
 * 8. KULELER
 *  12 kule; tablolar content/towers.js'te. Her kule: 3 düz seviye +
 *  4. seviyede iki "Ustalık" dalından biri. Kuleler oyun dışı çarşıda altınla
 *  satın alınır (META.towerPrice); sahip olunanlardan en fazla LOADOUT_SIZE
 *  tanesi oyuna götürülür (savaş öncesi seçilir).
 * ------------------------------------------------------------------------ */
export const TOWER_STAT_DEFAULTS = TOWER_STATS;

export const TOWERS = Object.fromEntries(Object.entries(TOWER_DEFS).map(([id, def]) => [id, {
  id, support: false, economy: false, defaultTarget: 'first', ...def,
  // ses ve parçacık tarifleri kulenin kimliğiyle aynı adı taşır
  sfx: id,
}]));
export const TOWER_ORDER = TOWER_LIST;

/** Oyuna götürülebilecek en fazla kule (bar bu kadar yer alır). */
export const LOADOUT_SIZE = 6;

export const TARGET_MODES = [
  { id: 'first' },   // kaleye en yakın
  { id: 'last' },    // geçide en yakın
  { id: 'strong' },  // en yüksek can
  { id: 'close' },   // kuleye en yakın
];

// Kule panelinde istatistiklerin nasıl gösterileceği
export const STAT_LABELS = {
  damage: { fmt: 'int' },
  rate: { fmt: 'dec1' },
  range: { fmt: 'dec1' },
  splash: { fmt: 'dec1' },
  slow: { fmt: 'pct' },
  freezeChance: { fmt: 'pct' },
  stunChance: { fmt: 'pct' },
  stunDur: { fmt: 'sec' },
  chains: { fmt: 'int' },
  crit: { fmt: 'pct' },
  multishot: { fmt: 'int' },
  burnDps: { fmt: 'int' },
  poisonDps: { fmt: 'int' },
  poisonMax: { fmt: 'int' },
  poisonPctHp: { fmt: 'pct1' },
  brittle: { fmt: 'pct' },
  auraAmp: { fmt: 'pct' },
  auraShred: { fmt: 'pct' },
  auraSlow: { fmt: 'pct' },
  auraSouls: { fmt: 'pct' },
  pierce: { fmt: 'int' },
  armorPierce: { fmt: 'pct' },
  dps: { fmt: 'int' },
  rampMax: { fmt: 'mult' },
  forks: { fmt: 'int' },
  cone: { fmt: 'deg' },
  melt: { fmt: 'pct' },
  bossBonus: { fmt: 'pct' },
  bigBonus: { fmt: 'pct' },
  execute: { fmt: 'pct' },
  buffRate: { fmt: 'pct' },
  buffDmg: { fmt: 'pct' },
  buffRange: { fmt: 'pct' },
  knell: { fmt: 'sec' },
  soulGen: { fmt: 'int' },
  soulEvery: { fmt: 'sec' },
  interest: { fmt: 'pct' },
  mendLives: { fmt: 'int' },
};

/* --------------------------------------------------------------------------
 * 9. DÜŞMANLAR
 *  39 düşman (11'i boss); tablolar ve yetenek alanlarının açıklaması
 *  content/enemies.js'te. hp/souls değerleri dalga 1 içindir; SCALING,
 *  zorluk ve bölüm çarpanlarıyla büyür.
 * ------------------------------------------------------------------------ */
// Her tanımı varsayılanlarla tamamlar: oyun kodu "undefined" kontrolü yapmaz.
export const ENEMIES = Object.fromEntries(
  Object.entries(ENEMY_DEFS).map(([id, def]) => [id, { id, ...ENEMY_DEFAULTS, ...def }])
);

/* --------------------------------------------------------------------------
 * 11. HİS (JUICE)
 *  Sarsıntı "travma" modeliyle çalışır: olaylar 0..1 arası travma ekler,
 *  sarsıntı = travma² (küçük vuruşlar hafif, büyükler sert hissettirir).
 * ------------------------------------------------------------------------ */
export const FEEL = {
  shake: {
    maxOffset: 12,      // piksel
    maxAngle: 0.012,    // radyan
    decay: 1.8,         // saniyede travma kaybı
    trauma: {
      hitHeavy: 0.10,
      mortar: 0.16,
      quake: 0.28,
      lifeLost: 0.45,
      scorch: 0.35,
      bossSpawn: 0.5,
      bossPhase: 0.4,
      bossDeath: 0.85,
    },
  },
  hitStop: {            // kısa donma (saniye)
    crit: 0.025,
    lifeLost: 0.05,
    bossPhase: 0.08,
    bossDeath: 0.2,
  },
  damageText: { life: 0.85, rise: 34, spread: 10, critScale: 1.45, mergeWindow: 0.12 },
  hpBar: { lerp: 6, visibleAfterHit: 2.5, width: 0.8 },
  hitFlash: 0.08,
  towerTurnRate: 9,     // radyan/sn — kuleler hedefe yumuşakça döner
  recoil: { distance: 0.08, recover: 10 },
  buildTime: 0.35,      // kurulum animasyonu
  ui: { panelMs: 220, bannerHold: 2.2, toastHold: 1.6, discoverHold: 7, longPressMs: 450 },
  vibration: {          // ms veya desen
    tap: 8,
    build: 18,
    upgrade: [14, 30, 22],
    lifeLost: [40, 40, 60],
    boss: [80, 60, 120],
    victory: [60, 40, 60, 40, 160],
    defeat: [220],
  },
};

/* --------------------------------------------------------------------------
 * 12. GRAFİK KALİTESİ — düşük cihazlar için ayarlardan seçilir
 *  Not: canvas shadowBlur mobilde çok pahalı; parıltılar önceden
 *  çizilmiş dokularla yapılır, "glow" sadece bunların kullanımını açar.
 * ------------------------------------------------------------------------ */
export const QUALITY = {
  low: { id: 'low', maxParticles: 160, glow: false, lights: false, fog: false, dprCap: 1, ambient: 0.3 },
  medium: { id: 'medium', maxParticles: 420, glow: true, lights: false, fog: true, dprCap: 1.5, ambient: 0.65 },
  high: { id: 'high', maxParticles: 900, glow: true, lights: true, fog: true, dprCap: 2, ambient: 1 },
};

/* --------------------------------------------------------------------------
 * 13. TEMA VE YAZI TİPLERİ (dark fantasy)
 *  Yazı tipleri çevrimdışıyken sistem yedeğine düşer.
 * ------------------------------------------------------------------------ */
export const THEME = {
  void: '#050407',
  bg: '#0b090f',
  ground: '#15121b',
  groundAlt: '#1b1722',
  path: '#2b2119',
  pathEdge: '#3d2d20',
  ember: '#ff7a2f',
  gold: '#e8b84a',
  goldDim: '#8a6a28',
  blood: '#b3122e',
  danger: '#ff3b4e',
  mist: '#6c5b8a',
  bone: '#d9cfbf',
  text: '#ece4d6',
  textDim: '#8e8496',
  ok: '#7dff9a',
  soul: '#a8e6ff',     // ruh (oyun içi para): soluk hayalet mavisi
  rangeOk: 'rgba(232,184,74,0.18)',
  rangeBad: 'rgba(255,59,78,0.18)',
};

export const FONTS = {
  title: "'Cinzel', 'Trajan Pro', Georgia, 'Times New Roman', serif",
  body: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

/* --------------------------------------------------------------------------
 * 14. SES
 *  Tüm sesler WebAudio ile anlık sentezlenir: dosya yok, çevrimdışı çalışır.
 * ------------------------------------------------------------------------ */
export const AUDIO = {
  master: 0.9,
  sfxThrottle: 0.035,   // aynı sesin en kısa tekrar aralığı (sn)
  maxVoicesPerSfx: 4,
  music: {
    bpm: 54,
    root: 55,                         // A1 — derin, karanlık taban
    scale: [0, 2, 3, 5, 7, 8, 10],    // Aeolian (doğal minör)
    altScale: [0, 1, 3, 5, 7, 8, 10], // Frigyen — gerilim anları
    combatIntensity: { calm: 0.25, wave: 0.6, boss: 1.0 },
  },
};

/* --------------------------------------------------------------------------
 * 15. AYARLAR — varsayılanlar ve ayar ekranının şeması
 *  Ayar ekranı bu şemadan otomatik üretilir; yeni ayar = buraya bir satır.
 * ------------------------------------------------------------------------ */
export const DEFAULT_SETTINGS = {
  lang: FALLBACK_LANGUAGE, // ilk açılışta main.js tarayıcı dilini seçer
  sfxVolume: 0.8,
  musicVolume: 0.5,
  vibration: true,
  screenShake: true,
  damageNumbers: true,
  showRanges: false,    // tüm kule menzillerini sürekli göster
  quality: 'high',
  showFps: false,
  autoWave: false,      // geri sayımda koşullar sağlanınca sıradaki dalgayı kendiliğinden çağır
  autoWaveEnemies: 0,   // en çok bu kadar düşman kalınca (0 = saha boş, AUTO_WAVE.maxEnemies = fark etmez)
  autoWaveSouls: 0,     // en az bu kadar ruh birikince (0 = şartsız)
  shopHideOwned: false, // çarşıda alınmış / en üst seviyedekileri gizle (çarşının kendi düğmesi)
  tips: true,           // öğretici ipuçları (tips.js)
  discoveries: true,    // ilk kez görülen düşman / kule için oyun içi bilgi kartları
};

/*
 * Ayar ekranı bu şemadan kurulur, gruplara ayrılarak (SETTINGS_GROUPS sırası).
 * Etiketler canlıdır: lang: settings.<key>, seçenekler settings.options.<key>.<id>,
 * grup başlıkları settings.groups.<id>, grup notları settings.notes.<id>.
 * Kaydırıcılar: fmt → değerin yazımı ('pct' | 'int'); zero / top → en alt / en
 * üst değerin sözlü adı (settings.zero.<key>, settings.top.<key>); value → ara
 * değerlerin kalıbı (settings.value.<key>, örn. "≤ {n}").
 * view 'language': bayrak + dilin kendi adı. view 'hidden': ayar ekranında
 * görünmez, başka bir ekranın düğmesiyle değişir (yine kaydedilir ve doğrulanır).
 */
export const SETTINGS_GROUPS = [
  { id: 'general' },
  { id: 'sound' },
  { id: 'display' },
  { id: 'auto', note: true },
  { id: 'help', note: true },  // öğretici ve bilgi kartları (+ "baştan göster", menu.js)
  { id: 'data', note: true }, // ilerlemeyi sıfırla / tüm verileri sil (menu.js; yalnızca ana menüden)
];

export const SETTINGS_SCHEMA = [
  { key: 'lang', group: 'general', type: 'choice', view: 'language', options: LANGUAGE_IDS.map((id) => ({ id })) },
  { key: 'sfxVolume', group: 'sound', type: 'range', min: 0, max: 1, step: 0.05, fmt: 'pct' },
  { key: 'musicVolume', group: 'sound', type: 'range', min: 0, max: 1, step: 0.05, fmt: 'pct' },
  { key: 'vibration', group: 'sound', type: 'toggle' },
  { key: 'screenShake', group: 'display', type: 'toggle' },
  { key: 'damageNumbers', group: 'display', type: 'toggle' },
  { key: 'showRanges', group: 'display', type: 'toggle' },
  { key: 'quality', group: 'display', type: 'choice', options: [{ id: 'low' }, { id: 'medium' }, { id: 'high' }] },
  { key: 'showFps', group: 'display', type: 'toggle' },
  { key: 'autoWave', group: 'auto', type: 'toggle' },
  {
    key: 'autoWaveEnemies', group: 'auto', type: 'range', min: 0, max: AUTO_WAVE.maxEnemies, step: 1,
    fmt: 'int', zero: true, top: true, value: true,
  },
  {
    key: 'autoWaveSouls', group: 'auto', type: 'range', min: 0, max: AUTO_WAVE.maxSouls, step: AUTO_WAVE.soulsStep,
    fmt: 'int', zero: true, value: true,
  },
  { key: 'shopHideOwned', type: 'toggle', view: 'hidden' },
  { key: 'tips', group: 'help', type: 'toggle' },
  { key: 'discoveries', group: 'help', type: 'toggle' },
];

/* --------------------------------------------------------------------------
 * 15b. KALICI İLERLEME — çarşı, ana kule, yan kuleler, yetenekler
 *
 *  ALTIN ÖDÜLÜ (oyun sonunda, kazansan da kaybetsen de):
 *    (temizlenen dalga × perWave + öldürülen boss × perBoss + zafer)
 *    × zorluk.reward  — en az META.reward.minimum
 *
 *  ANA KULE (kale): kendi balistasıyla yaklaşan düşmanlara ateş eder.
 *    Can  = zorluğun canı + Surlar seviyesi × CASTLE.upgrades.walls.lives
 *    Kale düşerse (yenilgi) YIKIK kalır: onarılana kadar sonraki oyunlarda
 *    can × ruined.lives, hasar × ruined.damage. Onarım altınla yapılır.
 *
 *  YAN KULELER: kalenin iki yanındaki burçlar; her biri bir yetenek taşır.
 *    Sol kule baştan vardır, sağ kule çarşıdan inşa edilir.
 *
 *  YETENEKLER: çarşıdan altınla alınır ve yükseltilir, yan kuleye takılır.
 *    Her oyunda ilk kullanım ücretsiz; sonrakiler sabit bir ruh bedeli ister.
 *    Hasar dalganın can ölçeğiyle büyür; geç oyunda da işe yarar.
 *
 *  BÖLÜMLER: ödül ayrıca bölümün reward çarpanıyla büyür. Bölüm açılınca
 *    unlocks listesindeki kule ve yetenekler çarşıya gelir. Her zorluktaki
 *    zafer bölüme bir yıldız verir (en çok 3).
 * ------------------------------------------------------------------------ */
export const META = {
  startTowers: ['archer', 'mortar'],
  towerPrice: {
    archer: 0, mortar: 0, frost: 150, poison: 260, tesla: 420, curse: 560,
    lance: 380, prism: 520, flame: 450, well: 600, hunter: 560, bell: 700,
  },
  rightSidePrice: 300,
  reward: { perWave: 6, perBoss: 30, victory: 120, minimum: 10 },
  repair: { base: 30, perLevel: 12 }, // onarım = taban + toplam kale yükseltme seviyesi × ek
};

export const CASTLE = {
  // balista: hasar × (1 + ballista seviyesi × upgrades.ballista.damage) × SCALING.hp(dalga)^waveGrowth
  attack: { damage: 14, rate: 0.9, range: 3.1, speed: 16, waveGrowth: 0.6 },
  muzzleY: 0.95,   // atışın çıktığı yükseklik (kale merkezinin üstü, hücre)
  ruined: { lives: 0.6, damage: 0.5 },
  upgrades: {
    walls: { costs: [80, 150, 250, 380, 550], lives: 3 },
    ballista: { costs: [90, 170, 280, 420, 600], damage: 0.25 },
    treasury: { costs: [70, 140, 230, 350, 500], souls: 20 },
    watch: { costs: [100, 180, 290, 430, 620], range: 0.3, rate: 0.08 },   // balista menzili ve atış hızı
    runes: { costs: [120, 210, 330, 480, 680], cooldown: 0.06 },          // yetenek bekleme süresi −%6/sv
  },
};
export const CASTLE_UPGRADE_ORDER = ['walls', 'ballista', 'treasury', 'watch', 'runes'];
export const SIDES = ['left', 'right'];

/*
 * YETENEKLER (9). levels: seviye sayısı (hepsi 3). price: ilk alım, upgrade:
 * sonraki seviyeler. Dizi olan değerler seviyeye göre okunur ([sv1, sv2, sv3]).
 * target 'area' → oyuncu haritada bir yer seçer; 'none' → hemen etki eder.
 */
export const SKILLS = {
  log: {
    id: 'log', target: 'none', levels: 3, price: 180, upgrade: [160, 280],
    soulCost: 25, cooldown: 30, color: '#d9944f', dmgType: 'phys',
    damage: [110, 160, 220], push: 0.6, speed: 6.5, width: 0.45,
  },
  meteor: {
    id: 'meteor', target: 'area', levels: 3, price: 280, upgrade: [220, 380],
    soulCost: 40, cooldown: 35, color: '#ff5a2a', dmgType: 'magic',
    damage: [220, 320, 450], radius: 1.4, delay: 0.75, burn: 0.06, burnDur: 3,
  },
  frost: {
    id: 'frost', target: 'none', levels: 3, price: 220, upgrade: [190, 320],
    soulCost: 30, cooldown: 40, color: '#9fe8ff', dmgType: 'magic',
    damage: [20, 35, 55], slow: [0.45, 0.55, 0.65], duration: [3.5, 4.5, 5.5],
  },
  // en güçlü düşmanlara yıldırım düşer, sersemletir (boss sersemlemez)
  thunder: {
    id: 'thunder', target: 'none', levels: 3, price: 260, upgrade: [200, 340],
    soulCost: 35, cooldown: 32, color: '#c9bbff', dmgType: 'magic',
    damage: [120, 170, 240], count: [4, 6, 8], stun: 0.6,
  },
  // bütün düşmanları (boss hariç) olduğu yerde dondurur; boss'lar yavaşlar
  timestop: {
    id: 'timestop', target: 'none', levels: 3, price: 340, upgrade: [260, 420],
    soulCost: 45, cooldown: 50, color: '#e8d7a8', dmgType: 'magic',
    duration: [2, 2.5, 3], bossSlow: 0.6,
  },
  // seçilen alana çöken zehirli bulut: saf hasar/sn, zehirler (yenilenmeyi keser)
  plague: {
    id: 'plague', target: 'area', levels: 3, price: 280, upgrade: [210, 350],
    soulCost: 35, cooldown: 36, color: '#9fd84a', dmgType: 'pure',
    damage: [30, 45, 65], radius: 1.4, duration: [6, 7, 8],
  },
  // kaleye can geri verir (en çok başlangıç canı kadar)
  mend: {
    id: 'mend', target: 'none', levels: 3, price: 240, upgrade: [200, 320],
    soulCost: 50, cooldown: 75, color: '#ffe08a', dmgType: 'pure',
    heal: [3, 5, 7],
  },
  // seçilen alandaki düşmanları yol boyunca geriye çeker ve hasar verir
  vortex: {
    id: 'vortex', target: 'area', levels: 3, price: 300, upgrade: [230, 380],
    soulCost: 40, cooldown: 38, color: '#9a6aff', dmgType: 'magic',
    damage: [80, 120, 170], radius: 1.5, pull: [1.5, 2.0, 2.6], delay: 0.35,
  },
  // sahayı süpüren tırpan: canı eşiğin altındakileri biçer (boss hariç), diğerlerine hasar
  reaper: {
    id: 'reaper', target: 'none', levels: 3, price: 360, upgrade: [270, 440],
    soulCost: 45, cooldown: 45, color: '#d6d2e8', dmgType: 'magic',
    damage: [60, 90, 130], execute: [0.15, 0.2, 0.25],
  },
};
export const SKILL_ORDER = ['log', 'meteor', 'frost', 'thunder', 'timestop', 'plague', 'mend', 'vortex', 'reaper'];

/* --------------------------------------------------------------------------
 * 16. KAYIT
 *  run      → süren oyun; sahada düşman kalmadığı ve doğum bittiği her an
 *              (tipik olarak dalga araları). Savaş ortasında asla kaydedilmez.
 *  settings → ayarlar (her değişiklikte)
 *  records  → en iyi dalga, zaferler, toplam öldürme
 *  profile  → kalıcı ilerleme: altın, satın alınan kule/yetenekler, kale
 * ------------------------------------------------------------------------ */
export const SAVE = {
  prefix: 'sonkale.',   // iç anahtar (oyunun eski adı); değişirse oyuncu kayıtları kaybolur
  version: 1,
  keys: { settings: 'settings', run: 'run', records: 'records', profile: 'profile' },
  debounceMs: 500,
};

/* --------------------------------------------------------------------------
 * 17. METİNLER — dil paketlerinden canlı okunur (js/lang/*.js)
 *  STRINGS.menu.newGame → etkin dilde "Yeni Oyun" / "New Game".
 * ------------------------------------------------------------------------ */
export const STRINGS = section('strings');

/* --------------------------------------------------------------------------
 * 18. METİN BAĞLAMA
 *  Tabloların ad/açıklama alanları burada dil paketine bağlanır. Böylece
 *  oyun kodu TOWERS[t].name okumaya devam eder; değer etkin dile göre gelir.
 *  (Dondurmadan önce yapılmalı.)
 * ------------------------------------------------------------------------ */
liveField(GAME, 'tagline', 'game.tagline');
liveField(GAME, 'taglines', 'game.taglines'); // ana menüde sırayla değişen sözler
for (const m of MAPS) {
  live(m, `maps.${m.id}`, ['name', 'sub', 'desc', 'threat']);
  m.waves.forEach((w, i) => liveField(w, 'name', `waves.${m.id}.${i + 1}`, ''));
}
for (const [id, d] of Object.entries(DIFFICULTIES)) live(d, `difficulties.${id}`, ['name', 'desc']);
for (const [id, tag] of Object.entries(WAVE_TAGS)) liveField(tag, 'label', `waveTags.${id}`, '');
for (const [id, dt] of Object.entries(DAMAGE_TYPES)) liveField(dt, 'label', `damageTypes.${id}`);
for (const [id, t] of Object.entries(TOWERS)) {
  live(t, `towers.${id}`, ['name', 'short', 'role', 'desc']);
  for (const m of t.masteries) live(m, `towers.${id}.masteries.${m.id}`, ['name', 'desc']);
}
for (const m of TARGET_MODES) liveField(m, 'label', `targetModes.${m.id}`);
for (const [k, L] of Object.entries(STAT_LABELS)) liveField(L, 'label', `stats.${k}`);
for (const [id, e] of Object.entries(ENEMIES)) live(e, `enemies.${id}`, ['name', 'desc', 'title'], ['title']);
for (const [id, sk] of Object.entries(SKILLS)) live(sk, `skills.${id}`, ['name', 'desc']);
for (const [id, up] of Object.entries(CASTLE.upgrades)) live(up, `castle.${id}`, ['name', 'desc']);
for (const [id, m] of Object.entries(MODIFIERS)) live(m, `mods.${id}`, ['name', 'desc']);
for (const c of CHALLENGES) liveField(c, 'name', `challenges.${c.id}`);
for (const [id, ev] of Object.entries(MAP_EVENTS)) live(ev, `events.${id}`, ['name', 'desc', 'warnText']);
for (const gr of SETTINGS_GROUPS) {
  liveField(gr, 'label', `settings.groups.${gr.id}`);
  if (gr.note) liveField(gr, 'noteText', `settings.notes.${gr.id}`);
}
for (const s of SETTINGS_SCHEMA) {
  liveField(s, 'label', `settings.${s.key === 'lang' ? 'language' : s.key}`);
  if (s.zero) liveField(s, 'zeroLabel', `settings.zero.${s.key}`);
  if (s.top) liveField(s, 'topLabel', `settings.top.${s.key}`);
  if (s.value) liveField(s, 'valueLabel', `settings.value.${s.key}`);
  for (const o of s.options ?? []) {
    if (s.view === 'language') Object.assign(o, LANGUAGES.find((l) => l.id === o.id));
    else liveField(o, 'label', `settings.options.${s.key}.${o.id}`);
  }
}

/* --------------------------------------------------------------------------
 * 19. DONDURMA — tüm tablolar salt okunur hâle gelir
 * ------------------------------------------------------------------------ */
function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const key of Object.keys(obj)) deepFreeze(obj[key]);
  }
  return obj;
}

[
  GAME, GRID, LAYOUT, TIPS, MAPS, TIMING, ECONOMY, DIFFICULTIES, DIFFICULTY_ORDER, SCALING,
  WAVE_RULES, WAVE_TAGS, DAMAGE_TYPES, COMBAT, TOWER_STAT_DEFAULTS, TOWERS,
  TOWER_ORDER, TARGET_MODES, STAT_LABELS, ENEMIES, FEEL, QUALITY, MAP_BY_ID, MAP_ORDER,
  THEME, FONTS, AUDIO, DEFAULT_SETTINGS, SETTINGS_SCHEMA, SETTINGS_GROUPS, AUTO_WAVE, SAVE, STRINGS,
  META, CASTLE, CASTLE_UPGRADE_ORDER, SIDES, SKILLS, SKILL_ORDER,
  MODES, MODIFIERS, MODIFIER_ORDER, CHALLENGES, CHALLENGE_BY_ID, DAILY, DAILY_POOL, ENDLESS, ELITE, BOSS_WRATH,
  MAP_EVENTS, EVENT_RULES,
].forEach(deepFreeze);
