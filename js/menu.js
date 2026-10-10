/* ==========================================================================
 *  SOULGATE — menu.js
 *  Sorumluluk : Oyun dışı ekranlar — ana menü, zorluk seçimi, duraklatma,
 *               ayarlar, rehber, çarşı, bilgi, lisans ve zafer/yenilgi
 *               ekranı. Oyunu başlatma, kayıttan devam, yeniden başlatma,
 *               menüye dönüş, çarşı alımları, kale onarımı ve verileri
 *               sıfırlama akışları.
 *  Bağımlılık : config, utils, events, i18n, icons (0) · state, save,
 *               audio (1) · particles, sprites, meta (2) · game (3) ·
 *               input, modal (4).
 *
 *  EKRANLAR (aynı anda yalnızca biri görünür)
 *   main · chapters · difficulty · modes · pause · settings · guide · market · info · about · end
 *   Yeni Oyun → bölüm seçimi (chapters) → zorluk ve oyuna götürülecek
 *   kuleler (difficulty) → savaş. Kilitli bölüm, önceki kazanılınca açılır.
 *   Meydan Okumalar (modes, 1.5.0): Sonsuz Gece (→ bölüm seçimi, yalnızca
 *   kazanılmış bölümler → zorluk), Günün Sınavı ve Sınavlar (→ savaş öncesi
 *   ekranı: kurallar + kule seçimi). Savaş öncesi ekranı (difficulty) hangi mod
 *   için açıldığını "pending"de tutar; geri tuşu da ona göre döner. Bölüm
 *   zaferinin sonuç ekranında "Sonsuza devam et" aynı savaşı Sonsuz Gece yapar.
 *   Ana menünün altındaki söz (GAME.taglines) birkaç saniyede bir rastgele
 *   bir başkasına geçer; ana menü görünmezken saat durur.
 *   Bilgi ekranı (info) bir kulenin, düşmanın ya da yeteneğin bütün
 *   değerlerini gösterir. Rehberden, oyundaki keşif kartından ya da bardaki
 *   kuleye basılı tutarak açılır (EV.OPEN 'info'); oyunun üstünde açılırsa
 *   oyun duraklar, kapanınca kaldığı yerden sürer.
 *   Rehberde süzgeçler vardır (ör. "Havayı vurur"); henüz görülmemiş
 *   düşmanlar yalnızca "Tümü"nde, adı gizli olarak görünür.
 *   Çarşı (market) üç sekmedir: Kuleler, Yetenekler, Kale (ana kule
 *   yükseltmeleri, yan kulelere yetenek takma, onarım). Her alım özel onay
 *   penceresiyle sorulur; altın meta.js'te harcanır, main.js kaydeder.
 *   Lisans ekranına (about) ana menünün altındaki telif satırından ve
 *   ayarların en altından gidilir. Tam metin, ilk açılışta kök klasördeki
 *   LICENSE dosyasından okunur; böylece lisansın tek bir kaynağı olur.
 *   Ana menü render.js'in hareketli sahnesinin üstüne şeffaf oturur;
 *   duraklatma, ayarlar ve rehber oyunun üstüne karartılmış perdeyle açılır.
 *
 *  Ayarlar ekranı config.SETTINGS_SCHEMA'dan, SETTINGS_GROUPS başlıkları
 *  altında kendiliğinden üretilir; her değişiklik anında uygulanır
 *  (setSetting → EV.SETTINGS) ve main.js tarafından kaydedilir. Dil
 *  değişince bütün menü yeni dilde yeniden kurulur ve oyuncu aynı ekranda
 *  kalır. "Veriler" grubu (ilerlemeyi sıfırla, tüm verileri sil) yalnızca
 *  ana menüden açılan ayarlarda görünür; ikisi de özel onay penceresiyle
 *  sorulur, tümünü silmek iki kez.
 * ========================================================================== */

import {
  GAME, STRINGS, DIFFICULTIES, DIFFICULTY_ORDER, DEFAULT_DIFFICULTY, SETTINGS_SCHEMA, SETTINGS_GROUPS,
  TOWERS, TOWER_ORDER, ENEMIES, DAMAGE_TYPES, META, CASTLE, CASTLE_UPGRADE_ORDER,
  SKILLS, SKILL_ORDER, SIDES, STAT_LABELS, MAPS, MAP_BY_ID, MAP_ORDER, WAVE_COUNT, LOADOUT_SIZE,
  MODIFIERS, CHALLENGES, CHALLENGE_BY_ID, MAP_EVENTS,
} from './config.js';
import { formatInt, formatValue, template } from './utils.js';
import { EV, on, emit } from './events.js';
import { section } from './i18n.js';
import { ICON } from './icons.js';
import {
  state, setScene, setPaused, setSetting, clearRun, recordRunResult, serializeRun, applyRecords, applyProfile, createMap, resetTips,
} from './state.js';
import * as save from './save.js';
import { play } from './audio.js';
import { haptic } from './particles.js';
import { towerIcon, enemySprite, mapThumb } from './sprites.js';
import * as meta from './meta.js';
import * as game from './game.js';
import { setBackTrap } from './input.js';
import { confirm, isOpen as modalOpen } from './modal.js';
import * as tips from './tips.js';

/* Menülere özgü kısa metinler: etkin dilden canlı okunur (lang: menu.*, market.*). */
const TXT = section('menu');
const M = section('market');
const RESET = section('settings.reset');
const KEYS = section('settings.keys');
const SET = section('settings');
const THREAT = section('threats');
const MODE = section('modes');

const COPYRIGHT = `© ${GAME.year} ${GAME.studio}`;

/** Geniş düzen (bilgisayar, yatay tablet): main.js <html>'e .wide koyar. */
const isWide = () => document.documentElement.classList.contains('wide');

/* --------------------------------------------------------------------------
 * 1. DURUM VE KURULUM
 * ------------------------------------------------------------------------ */
let root = null;
const screens = {};
let current = null;          // görünen ekranın adı (yoksa null)
let settingsReturn = 'main'; // ayarlardan geri dönülecek ekran
let chosenDiff = DEFAULT_DIFFICULTY;
let chosenMap = MAP_ORDER[0];  // bölüm seçiminde seçilen bölüm
// savaş öncesi ekranının modu (Meydan Okumalar): { mode, mods, challenge, daily }
let pending = { mode: 'campaign', mods: [], challenge: '', daily: '' };
let chaptersFor = 'campaign';  // bölüm seçimi hangi mod için açıldı: 'campaign' | 'endless'
let guideTab = 'towers';
let aboutReturn = 'main';    // lisans ekranından geri dönülecek ekran
let licenseState = 'idle';   // 'idle' | 'loading' | 'ready'
let lastEnd = null;          // son sonuç ekranının verisi (dil değişince yeniden yazmak için)
let shopTab = 'towers';      // çarşının açık sekmesi
let marketReturn = 'main';
let dpr = 1;
const guideFilter = { towers: 'all', enemies: 'all' }; // rehber sekmesi başına seçili süzgeç
let infoKind = '';           // bilgi ekranında gösterilen: 'tower' | 'enemy' | 'skill'
let infoId = '';
let infoReturn = null;       // bilgi ekranından dönülecek ekran (null = oyuna)
let infoPausedGame = false;  // bilgi ekranı oyunu duraklattı mı (kapanınca sürer)
const TAGLINE_MS = 6500;     // ana menüdeki sözün değişme aralığı
let taglineTimer = 0;
let taglineIdx = 0;

/** Menüleri root içine kurar ve olaylara abone olur. main.js bir kez çağırır. */
export function init(rootEl) {
  root = rootEl;
  dpr = Math.min(globalThis.devicePixelRatio || 1, 3);
  root.classList.add('menu');
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKeyActivate);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  build();

  on(EV.OPEN, (what, kind, id) => {
    if (what === 'pause') openPause();
    else if (what === 'settings') openSettings(current ?? 'pause');
    else if (what === 'info') openInfo(kind, id);
  });
  on(EV.RUN_END, onRunEnd);
  on(EV.PROFILE, onProfile);
  on(EV.SETTINGS, (key) => {
    if (key === 'lang') {
      relocalize();
      return;
    }
    syncSettings();
    if (key === 'shopHideOwned' && current === 'market') renderMarket();
  });
}

/** Bütün ekranları etkin dilde (yeniden) kurar. */
function build() {
  root.innerHTML = layout();
  for (const k of Object.keys(screens)) delete screens[k];
  for (const s of root.querySelectorAll('[data-screen]')) screens[s.dataset.screen] = s;
  buildSettings();
  ref('licenseBox').addEventListener('toggle', onLicenseToggle);
  licenseState = 'idle';
  syncFullscreen();
}

/* — Tam ekran (bilgisayar): tarayıcının Fullscreen API'si. Desteklenmeyen
     ya da izin vermeyen yerde (Android uygulaması, izinsiz çerçeve) düğme gizli. — */
const fsSupported = () => !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);
const isFullscreen = () => !!document.fullscreenElement;

function toggleFullscreen() {
  if (!fsSupported()) return;
  let p;
  try {
    p = isFullscreen() ? document.exitFullscreen() : document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    p = Promise.reject();
  }
  Promise.resolve(p).catch(() => emit(EV.TOAST, TXT.fullscreenFail, 'warn'));
}

/**
 * Tam ekrana girince Esc tuşu oyuna bırakılsın (Keyboard Lock; Chrome / Edge):
 * Esc oyunu duraklatır, tam ekrandan çıkmak için basılı tutulur (tarayıcı bunu
 * ekranda kendisi söyler). Desteklemeyen tarayıcıda ya da çerçeve içinde (itch.io)
 * Esc tam ekrandan çıkar; o zaman oyun da aynı anda duraklar (aşağıda).
 */
function onFullscreenChange() {
  const kb = navigator.keyboard;
  if (isFullscreen()) {
    if (kb && typeof kb.lock === 'function') kb.lock(['Escape']).catch(() => {});
  } else {
    if (kb && typeof kb.unlock === 'function') kb.unlock();
    const run = state.run;
    if (state.scene === 'game' && run && !run.over && !run.paused && current === null) openPause();
  }
  syncFullscreen();
}

/** Tam ekran düğmelerinin görünürlüğü, simgesi ve yazısı. */
function syncFullscreen() {
  if (!root) return;
  const ok = fsSupported();
  const on2 = isFullscreen();
  const label = on2 ? TXT.windowed : TXT.fullscreen;
  for (const b of root.querySelectorAll('[data-act="fullscreen"]')) {
    b.hidden = !ok;
    b.setAttribute('aria-label', label);
    b.title = label;
    b.setAttribute('aria-pressed', String(on2));
    if (b.classList.contains('fs-btn')) b.innerHTML = on2 ? ICON.windowed : ICON.fullscreen;
    const text = b.querySelector('.fs-label');
    if (text) text.textContent = label;
  }
}

/** Dil değişti: menü yeni dilde kurulur, oyuncu bulunduğu ekranda kalır. */
function relocalize() {
  const cur = current;
  root.classList.remove('intro');
  root.classList.add('instant'); // yeniden kurulan ekranlar solarak gelmesin
  build();
  syncSettings();
  refreshMain();
  if (cur === 'difficulty') renderDifficulties();
  else if (cur === 'chapters') renderChapters();
  else if (cur === 'guide') renderGuide();
  else if (cur === 'market') renderMarket();
  else if (cur === 'info') renderInfo();
  else if (cur === 'modes') renderModes();
  if (state.run && !state.run.over) renderSummary(); // ayarlardan duraklatmaya dönülecek
  if (cur === 'end' && lastEnd) renderEnd(...lastEnd);
  else show(cur);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('instant')));
}

const backBtn = () => `<button type="button" class="back" data-act="back" aria-label="${STRINGS.settings.back}">‹</button>`;

function layout() {
  return `
  <section class="screen screen-main" data-screen="main" aria-label="${TXT.mainAria}">
    <span class="gold-chip main-gold" data-ref="mainGold" aria-label="${STRINGS.menu.gold}">${ICON.coin}<b></b></span>
    <div class="title-block">
      <h1 class="logo"><img src="icons/logo.svg" alt="${GAME.fullTitle}" width="660" height="412" draggable="false"></h1>
      <p class="tagline"><span data-ref="tagline">${currentTagline()}</span></p>
    </div>
    <div class="main-bottom">
      <div class="continue-info" data-ref="continueInfo"></div>
      <div class="ruin-note" data-ref="ruinNote" hidden>
        <span>${STRINGS.menu.ruined}</span>
        <button type="button" class="repair-btn" data-act="repair">${STRINGS.menu.repair}${ICON.coin}<b data-ref="ruinPrice"></b></button>
      </div>
      <nav class="menu-actions">
        <button type="button" class="menu-btn primary" data-act="continue">${STRINGS.menu.continue}</button>
        <button type="button" class="menu-btn" data-act="new">${STRINGS.menu.newGame}</button>
        <button type="button" class="menu-btn modes-btn" data-act="modes">${ICON.medal}<span>${MODE.title}</span></button>
        <button type="button" class="menu-btn market-btn" data-act="market">${ICON.coin}${STRINGS.menu.market}</button>
        <div class="menu-row">
          <button type="button" class="menu-btn small" data-act="guide">${STRINGS.menu.guide}</button>
          <button type="button" class="menu-btn small" data-act="settings">${STRINGS.menu.settings}</button>
        </div>
      </nav>
      <div class="records" data-ref="records"></div>
      <p class="storage-warn" data-ref="storageWarn" hidden>${TXT.storageOff}</p>
      <footer class="credits">
        <span>${COPYRIGHT}</span>
        <button type="button" class="credits-link" data-act="about">${STRINGS.about.title}</button>
        ${feedbackLink('credits-link')}
        <span class="credits-version">v${GAME.version}</span>
      </footer>
    </div>
    <button type="button" class="fs-btn pc-only" data-act="fullscreen" hidden></button>
  </section>

  <section class="screen screen-sheet" data-screen="chapters" aria-label="${TXT.chapters}">
    <header class="sheet-head">${backBtn()}<h2 data-ref="chaptersTitle">${TXT.chapters}</h2><span class="star-chip" data-ref="starChip"></span></header>
    <div class="chapter-list" data-ref="chapterList"></div>
  </section>

  <section class="screen screen-sheet" data-screen="difficulty" aria-label="${STRINGS.difficulty.title}">
    <header class="sheet-head">${backBtn()}<h2 data-ref="diffTitle">${STRINGS.difficulty.title}</h2></header>
    <div class="diff-scroll">
      <div class="diff-col">
        <div class="diff-chapter" data-ref="diffChapter"></div>
        <div class="diff-list" data-ref="diffList"></div>
      </div>
      <div class="loadout-col">
        <h3 class="shop-section loadout-head"><span>${TXT.loadout}</span><b data-ref="loadoutCount"></b></h3>
        <p class="shop-note">${template(TXT.loadoutHint, { n: LOADOUT_SIZE })}</p>
        <div class="loadout" data-ref="loadout" role="group" aria-label="${TXT.loadout}"></div>
      </div>
    </div>
    <button type="button" class="menu-btn primary block" data-act="start">${STRINGS.difficulty.start}</button>
  </section>

  <section class="screen screen-sheet" data-screen="modes" aria-label="${MODE.title}">
    <header class="sheet-head">${backBtn()}<h2>${MODE.title}</h2><span class="star-chip medal-chip" data-ref="medalChip"></span></header>
    <div class="modes-body" data-ref="modesBody"></div>
  </section>

  <section class="screen screen-card" data-screen="pause" aria-label="${STRINGS.pause.title}">
    <div class="card">
      <h2 class="card-title">${STRINGS.pause.title}</h2>
      <div class="run-summary" data-ref="runSummary"></div>
      <div class="run-mods" data-ref="runMods" hidden></div>
      <div class="card-actions">
        <button type="button" class="menu-btn primary" data-act="resume">${STRINGS.pause.resume}</button>
        <button type="button" class="menu-btn" data-act="settings">${STRINGS.pause.settings}</button>
        <button type="button" class="menu-btn" data-act="restart">${STRINGS.pause.restart}</button>
        <button type="button" class="menu-btn quiet" data-act="toMenu">${STRINGS.pause.menu}</button>
      </div>
    </div>
  </section>

  <section class="screen screen-sheet" data-screen="settings" aria-label="${STRINGS.settings.title}">
    <header class="sheet-head">${backBtn()}<h2>${STRINGS.settings.title}</h2></header>
    <div class="settings-list" data-ref="settingsList"></div>
  </section>

  <section class="screen screen-sheet" data-screen="guide" aria-label="${STRINGS.guide.title}">
    <header class="sheet-head">${backBtn()}<h2>${STRINGS.guide.title}</h2></header>
    <div class="seg guide-tabs">
      <button type="button" data-act="tab" data-tab="towers">${STRINGS.guide.towers}</button>
      <button type="button" data-act="tab" data-tab="enemies">${STRINGS.guide.enemies}</button>
    </div>
    <div class="chips" data-ref="guideChips" role="group" aria-label="${TXT.filterAria}"></div>
    <div class="guide-list" data-ref="guideList"></div>
  </section>

  <section class="screen screen-sheet" data-screen="info" aria-labelledby="info-title">
    <header class="sheet-head">${backBtn()}<h2 id="info-title" data-ref="infoTitle"></h2></header>
    <div class="info-body" data-ref="infoBody"></div>
  </section>

  <section class="screen screen-sheet" data-screen="market" aria-label="${M.title}">
    <header class="sheet-head">${backBtn()}<h2>${M.title}</h2><span class="gold-chip" data-ref="marketGold" aria-label="${STRINGS.menu.gold}">${ICON.coin}<b></b></span></header>
    <div class="seg shop-tabs">
      <button type="button" data-act="shopTab" data-tab="towers">${M.tabs.towers}</button>
      <button type="button" data-act="shopTab" data-tab="skills">${M.tabs.skills}</button>
      <button type="button" data-act="shopTab" data-tab="castle">${M.tabs.castle}</button>
    </div>
    <button type="button" class="shop-filter" role="switch" aria-checked="false" data-act="hideOwned" data-ref="hideOwned">
      <span>${M.hideOwned}</span><span class="switch" aria-hidden="true"><i></i></span>
    </button>
    <div class="shop-list" data-ref="shopList"></div>
  </section>

  <section class="screen screen-sheet" data-screen="about" aria-label="${STRINGS.about.title}">
    <header class="sheet-head">${backBtn()}<h2>${STRINGS.about.title}</h2></header>
    <div class="about-body" data-ref="aboutBody">
      <div class="about-mark">
        <img src="icons/logo.svg" alt="${GAME.fullTitle}" width="660" height="412" draggable="false">
        <span class="about-version">${template(STRINGS.about.version, { v: GAME.version })}</span>
      </div>
      <p class="about-copy">${COPYRIGHT}. ${STRINGS.about.rights}</p>
      <dl class="about-credits" aria-label="${STRINGS.about.credits}">${GAME.credits.map(
        (c) => `<div><dt>${STRINGS.about.roles[c.role]}</dt><dd>${c.name}</dd></div>`,
      ).join('')}</dl>
      <div class="about-terms">${STRINGS.about.terms.map((t) => `<p>${t}</p>`).join('')}</div>
      <details class="license-full" data-ref="licenseBox">
        <summary>${STRINGS.about.full}</summary>
        <div class="license-text" data-ref="licenseText"></div>
      </details>
    </div>
  </section>

  <section class="screen screen-card" data-screen="end" aria-label="${TXT.endAria}">
    <div class="card end-card" data-ref="endCard">
      <div class="end-kicker" data-ref="endKicker"></div>
      <h2 class="end-title" data-ref="endTitle"></h2>
      <p class="end-sub" data-ref="endSub"></p>
      <div class="end-stats" data-ref="endStats"></div>
      <div class="end-reward" data-ref="endReward"></div>
      <div class="end-ruin" data-ref="endRuin" hidden></div>
      <div class="card-actions">
        <button type="button" class="menu-btn primary" data-act="continueEndless" data-ref="endlessBtn" hidden>${ICON.endless}<span>${MODE.continueEndless}</span></button>
        <button type="button" class="menu-btn primary" data-act="retry" data-ref="retryBtn">${STRINGS.end.retry}</button>
        <button type="button" class="menu-btn quiet" data-act="endMenu">${STRINGS.end.menu}</button>
      </div>
    </div>
  </section>`;
}

const ref = (name) => root.querySelector(`[data-ref="${name}"]`);

/* --------------------------------------------------------------------------
 * 2. EKRAN YÖNETİMİ
 * ------------------------------------------------------------------------ */
function show(name) {
  for (const [key, s] of Object.entries(screens)) {
    const on2 = key === name;
    s.classList.toggle('active', on2);
    s.setAttribute('aria-hidden', on2 ? 'false' : 'true');
    s.inert = !on2;
  }
  current = name;
  tips.menuScreen(name); // menü ipuçları kendi ekranlarında, oyun ipuçları menü kapalıyken görünür
  if (name === 'main') startTaglines();
  else stopTaglines();
  root.classList.toggle('open', !!name);
  root.classList.toggle('over-game', !!name && state.scene === 'game');
  // ana menünün kökünde geri tuşu tarayıcıya bırakılır (oyuncu çıkabilsin)
  setBackTrap(!(name === 'main' && state.scene === 'menu'));
  if (name) {
    const first = screens[name].querySelector('.primary, .menu-btn, button');
    if (first && !matchMedia('(hover: none)').matches) first.focus({ preventScroll: true });
  }
}

function hide() {
  show(null);
}

export const currentScreen = () => current;

/* — Ana menü sözü: birkaç saniyede bir rastgele bir başkası — */
function currentTagline() {
  const lines = GAME.taglines;
  return lines.length ? lines[taglineIdx % lines.length] : GAME.tagline;
}

function startTaglines() {
  if (!taglineTimer) taglineTimer = setInterval(nextTagline, TAGLINE_MS);
}

function stopTaglines() {
  clearInterval(taglineTimer);
  taglineTimer = 0;
}

function nextTagline() {
  const lines = GAME.taglines;
  const node = ref('tagline');
  if (!node || lines.length < 2 || document.visibilityState === 'hidden') return;
  let i = taglineIdx % lines.length;
  while (i === taglineIdx % lines.length) i = Math.floor(Math.random() * lines.length);
  taglineIdx = i;
  node.classList.add('swap'); // CSS: söner, metin değişir, yanar
  setTimeout(() => {
    const live = ref('tagline'); // bu arada dil değiştiyse yeni düğüm
    if (!live) return;
    live.textContent = currentTagline();
    live.classList.remove('swap');
  }, 450);
}

/** Ana menüyü açar (uygulama açılışı ve oyundan dönüş). */
export function openMain() {
  setScene('menu');
  refreshMain();
  show('main');
  root.classList.remove('intro');
  void root.offsetWidth;
  root.classList.add('intro'); // tek, düzenlenmiş açılış animasyonu
}

/** Duraklatır ve duraklatma kartını açar. */
export function openPause() {
  const run = state.run;
  if (state.scene !== 'game' || !run || run.over) return;
  setPaused(true);
  renderSummary();
  show('pause');
  play('ui_open');
}

function resume() {
  if (!state.run) return;
  hide();
  setPaused(false);
  play('ui_close');
}

function openSettings(from) {
  settingsReturn = from === 'settings' ? settingsReturn : from;
  syncSettings();
  show('settings');
  play('ui_open');
}

/**
 * Bilgi ekranı. Oyun sürerken (menü kapalıyken) açılırsa oyunu duraklatır;
 * kapanınca oyun kaldığı yerden sürer.
 */
function openInfo(kind, id) {
  const table = { tower: TOWERS, enemy: ENEMIES, skill: SKILLS }[kind];
  if (!table || !table[id]) return;
  if (current !== 'info') {
    infoReturn = current;
    infoPausedGame = false;
    const run = state.run;
    if (current === null && state.scene === 'game' && run && !run.over && !run.paused) {
      setPaused(true);
      infoPausedGame = true;
    }
  }
  infoKind = kind;
  infoId = id;
  renderInfo();
  ref('infoBody').scrollTop = 0;
  show('info');
  play('ui_open');
}

function closeInfo() {
  play('ui_close');
  if (infoReturn) {
    show(infoReturn); // rehber olduğu gibi (kaydırma yeri korunur)
  } else {
    hide();
    if (infoPausedGame && state.run && !state.run.over) setPaused(false);
  }
  infoPausedGame = false;
}

function openAbout(from) {
  aboutReturn = from === 'about' || !from ? aboutReturn : from;
  ref('aboutBody').scrollTop = 0;
  show('about');
  play('ui_open');
}

/**
 * Geri tuşu (ui.js tüketmediyse main.js buraya yollar).
 * @returns {boolean} tüketildiyse true
 */
export function handleBack() {
  if (modalOpen()) return false;
  switch (current) {
    case 'settings':
      show(settingsReturn);
      if (settingsReturn === 'main') refreshMain(); // sıfırlamadan sonra kayıt ve rekorlar değişmiş olabilir
      play('ui_close');
      return true;
    case 'about':
      show(aboutReturn);
      play('ui_close');
      return true;
    case 'info':
      closeInfo();
      return true;
    case 'difficulty':
      if (pending.mode === 'daily' || pending.mode === 'challenge') {
        renderModes();
        show('modes');
      } else {
        renderChapters();
        show('chapters');
      }
      play('ui_close');
      return true;
    case 'chapters':
      if (chaptersFor === 'endless') {
        renderModes();
        show('modes');
      } else {
        show('main');
      }
      play('ui_close');
      return true;
    case 'modes':
    case 'guide':
      show('main');
      refreshMain();
      play('ui_close');
      return true;
    case 'market':
      show(marketReturn);
      if (marketReturn === 'main') refreshMain();
      play('ui_close');
      return true;
    case 'pause':
      resume();
      return true;
    case 'end':
    case 'main':
      return false;
    default:
      if (state.scene === 'game' && state.run && !state.run.over) {
        openPause();
        return true;
      }
      return false;
  }
}

/* --------------------------------------------------------------------------
 * 3. TIKLAMALAR
 * ------------------------------------------------------------------------ */
function onClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.disabled) return;
  const act = btn.dataset.act;
  const quiet = ['tab', 'diff', 'shopTab', 'equip', 'filter', 'hideOwned', 'loadout', 'chapter', 'challenge'];
  if (!quiet.includes(act)) {
    play('ui_tap');
    haptic('tap');
  }
  switch (act) {
    case 'continue': continueRun(); break;
    case 'new': openChapters('campaign'); break;
    case 'modes': openModes(); break;
    case 'endless': openChapters('endless'); break;
    case 'daily': chooseDaily(); break;
    case 'challenge': chooseChallenge(btn.dataset.id); break;
    case 'continueEndless': continueEndless(); break;
    case 'chapter': chooseChapter(btn.dataset.id); break;
    case 'loadout': toggleTower(btn, btn.dataset.id); break;
    case 'guide': renderGuide(); show('guide'); break;
    case 'settings': openSettings(current); break;
    case 'about': openAbout(current); break;
    case 'back': handleBack(); break;
    case 'diff': chooseDifficulty(btn.dataset.diff); break;
    case 'start': startNew(); break;
    case 'resume': resume(); break;
    case 'restart': restartRun(); break;
    case 'toMenu': leaveToMenu(); break;
    case 'retry': retryRun(); break;
    case 'endMenu': endToMenu(); break;
    case 'tab':
      guideTab = btn.dataset.tab;
      play('ui_toggle');
      renderGuide();
      break;
    case 'market': openMarket(current); break;
    case 'shopTab':
      shopTab = btn.dataset.tab;
      play('ui_toggle');
      renderMarket(true);
      break;
    case 'buy': purchase(btn, btn.dataset.kind, btn.dataset.id); break;
    case 'repair': purchase(btn, 'repair', 'castle'); break;
    case 'equip': equipSkill(btn.dataset.side, btn.dataset.id || null); break;
    case 'filter':
      guideFilter[guideTab] = btn.dataset.filter;
      play('ui_toggle');
      renderGuide();
      break;
    case 'info': openInfo(btn.dataset.kind, btn.dataset.id); break;
    case 'hideOwned': {
      const next = !state.settings.shopHideOwned;
      setSetting('shopHideOwned', next); // EV.SETTINGS → çarşı yeniden çizilir
      play('ui_toggle', { on: next });
      haptic('tap');
      break;
    }
    case 'showAll': setSetting('shopHideOwned', false); break;
    case 'fullscreen': toggleFullscreen(); break;
    case 'feedback': break; // bağlantının kendisi açılır (yeni sekme / telefonun tarayıcısı)
    case 'resetTips':
      resetTips();
      save.saveRecords(state.records);
      emit(EV.TOAST, SET.tipsResetDone, 'good');
      if (!state.settings.tips) setSetting('tips', true);
      break;
    case 'resetProgress': resetProgress(); break;
    case 'wipeAll': wipeAll(); break;
    default: break;
  }
}

/** Düğme olmayan dokunulabilir kartlar (rehber öğeleri) klavyeyle de açılır. */
function onKeyActivate(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const node = e.target;
  if (!node || node.tagName === 'BUTTON' || node.getAttribute('role') !== 'button' || !node.dataset.act) return;
  e.preventDefault();
  node.click();
}

/* --------------------------------------------------------------------------
 * 4. OYUN AKIŞLARI
 * ------------------------------------------------------------------------ */
function enterGame() {
  setScene('game');
  hide();
}

function continueRun() {
  const data = save.loadRun();
  if (data && game.loadGame(data)) {
    enterGame();
    return;
  }
  save.clearRun();
  refreshMain();
  confirm({ text: TXT.loadFailed, single: true });
}

async function startNew() {
  if (save.hasRun()) {
    const ok = await confirm({ title: STRINGS.confirm.overwriteTitle, text: STRINGS.confirm.overwrite, danger: true });
    if (!ok) return;
  }
  save.clearRun();
  game.newGame(chosenDiff, chosenMap, { ...pending, mods: [...pending.mods] });
  enterGame();
}

/** Süren (ya da biten) oyunun mod seçenekleri: yeniden başlatma aynı modla olur. */
function modeOf(run) {
  return { mode: run.mode, mods: [...run.mods], challenge: run.challenge, daily: run.daily };
}

async function restartRun() {
  const ok = await confirm({ title: STRINGS.confirm.restartTitle, text: STRINGS.confirm.restart, danger: true });
  if (!ok || !state.run) return;
  const { difficulty, mapId } = state.run;
  const opt = modeOf(state.run);
  save.clearRun();
  game.newGame(difficulty, mapId, opt);
  enterGame();
}

async function leaveToMenu() {
  const ok = await confirm({ title: STRINGS.confirm.menuTitle, text: STRINGS.confirm.menu });
  if (!ok) return;
  // saha boşsa (hazırlık evresi) son durum kaydedilir; savaş ortasıysa son kayıt noktası geçerli
  const run = state.run;
  if (run && !run.over && run.enemies.length === 0 && run.spawners.length === 0) save.saveRun(serializeRun());
  save.saveRecords(state.records);
  clearRun();
  openMain();
}

function retryRun() {
  const diff = state.run ? state.run.difficulty : chosenDiff;
  const mapId = state.run ? state.run.mapId : chosenMap;
  game.newGame(diff, mapId, state.run ? modeOf(state.run) : pending);
  enterGame();
}

/** Bölüm zaferinden sonra: aynı savaş Sonsuz Gece olarak sürer. */
function continueEndless() {
  if (!game.continueEndless()) return;
  lastEnd = null;
  hide();
  play('ui_open');
}

function endToMenu() {
  clearRun();
  openMain();
}

/** Oyun bitti: rekorları işle, kaydı sil, sonucu göster. */
function onRunEnd(victory, stats) {
  const before = MAPS.filter((m) => meta.chapterUnlocked(m.id)).length;
  const res = recordRunResult(victory);
  // bu zafer yeni bir bölüm açtı mı?
  res.unlocked = before < MAPS.length && MAPS.filter((m) => meta.chapterUnlocked(m.id)).length > before ? MAPS[before] : null;
  save.saveRecords(state.records);
  save.clearRun();
  const reward = meta.settleRun(victory, stats, res); // altın + bölüm yenilgisinde yıkık kale (profil kaydedilir)
  // sonuç ekranı, son vuruşun sarsıntısı ve sesi duyulduktan sonra gelir
  setTimeout(() => renderEnd(victory, stats, res, reward), victory ? 1400 : 1100);
}

/* --------------------------------------------------------------------------
 * 4b. ÇARŞI
 * ------------------------------------------------------------------------ */
function openMarket(from) {
  marketReturn = from === 'market' || !from ? marketReturn : from;
  tips.complete('market');
  renderMarket(true);
  show('market');
  play('ui_open');
}

/** Alımın adı, fiyatı ve türü (onay metni için). */
function describe(kind, id) {
  switch (kind) {
    case 'tower': return { name: TOWERS[id].name, price: meta.towerOffer(id).price, upgrade: false };
    case 'skill': {
      const o = meta.skillOffer(id);
      return { name: SKILLS[id].name, price: o.price, upgrade: o.kind === 'upgrade' };
    }
    case 'castle': return { name: CASTLE.upgrades[id].name, price: meta.castleOffer(id).price, upgrade: true };
    case 'side': return { name: M.right, price: META.rightSidePrice, upgrade: false };
    case 'repair': return { name: '', price: meta.repairPrice(), upgrade: false };
    default: return null;
  }
}

const BUY = {
  tower: meta.buyTower,
  skill: meta.buySkill,
  castle: meta.buyCastle,
  side: () => meta.buildRightSide(),
  repair: () => meta.repair(),
};

async function purchase(btn, kind, id) {
  const d = describe(kind, id);
  if (!d || !BUY[kind]) return;
  if ((kind === 'tower' && meta.towerOffer(id).locked) || (kind === 'skill' && meta.skillOffer(id).locked)) {
    play('ui_deny');
    pop(btn, 'shake');
    return;
  }
  if (meta.gold() < d.price) {
    play('ui_deny');
    pop(btn, 'shake');
    return;
  }
  const text = kind === 'repair'
    ? template(M.confirmRepair, { price: formatInt(d.price) })
    : template(d.upgrade ? M.confirmUpgrade : M.confirmBuy, { name: d.name, price: formatInt(d.price) });
  const ok = await confirm({ title: kind === 'repair' ? M.repair : M.confirmTitle, text });
  if (!ok) return;
  const res = BUY[kind](id);
  if (!res.ok) play('ui_deny');
  else haptic('upgrade');
}

function equipSkill(side, id) {
  const res = meta.equip(side, id);
  if (res.ok) {
    play('ui_toggle', { on: !!id });
    if (id) tips.complete('equip');
  } else play('ui_deny');
}

/** Profil değişti (alım, takma, oyun sonu): görünen her şey tazelenir. */
function onProfile() {
  refreshGold();
  if (current === 'market') renderMarket();
  else if (current === 'main') refreshMain();
  else if (current === 'end' && lastEnd) renderEndRuin();
}

function refreshGold() {
  const text = formatInt(meta.gold());
  for (const name of ['mainGold', 'marketGold']) {
    const chip = ref(name);
    if (!chip) continue;
    const b = chip.querySelector('b');
    if (b.textContent !== text) {
      if (b.textContent) pop(chip, 'tick');
      b.textContent = text;
    }
  }
}

function pop(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

const pips = (level, max) => `<span class="pips" aria-label="${template(M.level, { n: level, max })}">${
  Array.from({ length: max }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('')
}</span>`;

/** Satın al / yükselt / sahipsin düğmesi. */
function buyButton(kind, id, price, affordable, label) {
  return `<button type="button" class="buy-btn ${affordable ? '' : 'poor'}" data-act="buy" data-kind="${kind}" data-id="${id}">
    <small>${label}</small><b>${ICON.coin}${formatInt(price)}</b></button>`;
}
const ownedBadge = (text) => `<span class="owned-badge">${ICON.check}${text}</span>`;

function renderMarket(resetScroll = false) {
  refreshGold();
  for (const b of root.querySelectorAll('.shop-tabs button')) b.classList.toggle('on', b.dataset.tab === shopTab);
  const hide = state.settings.shopHideOwned; // alınmış / en üst seviyedekileri gizle
  ref('hideOwned').setAttribute('aria-checked', String(hide));
  const list = ref('shopList');
  if (resetScroll) list.scrollTop = 0;
  const keep = list.scrollTop;
  list.innerHTML = '';
  if (shopTab === 'towers') {
    for (const type of TOWER_ORDER) if (!(hide && meta.ownsTower(type))) list.appendChild(towerShopCard(type));
  } else if (shopTab === 'skills') {
    list.insertAdjacentHTML('beforeend', SKILL_ORDER.filter((id) => !(hide && meta.skillOffer(id).kind === 'max')).map(skillShopCard).join(''));
  } else {
    list.insertAdjacentHTML('beforeend', castleShop(hide));
  }
  if (!list.children.length) {
    list.innerHTML = `<div class="shop-empty"><p>${M.allDone}</p><button type="button" class="menu-btn small" data-act="showAll">${M.showAll}</button></div>`;
  }
  list.scrollTop = keep;
  // yetenek alındı ama yan kuleye takılmadı: Kale sekmesini (oradaysa takma düğmelerini) göster
  const ownsSkill = SKILL_ORDER.some((id) => meta.skillLevel(id) > 0);
  if (ownsSkill && SIDES.every((side) => !meta.equipped(side))) {
    tips.trigger('equip', { screen: 'market', target: shopTab === 'castle' ? '.equip-chips' : '.shop-tabs [data-tab="castle"]' });
  }
}

/** "Bölüm 3'te açılır" rozeti. */
const lockedBadge = (chapter) => `<span class="owned-badge locked-badge">${ICON.lock}${template(M.locked, { n: chapter.index + 1, name: chapter.name })}</span>`;

function towerShopCard(type) {
  const def = TOWERS[type];
  const o = meta.towerOffer(type);
  const item = document.createElement('article');
  item.className = `shop-card ${o.owned ? 'owned' : ''} ${o.locked ? 'locked' : ''}`;
  item.style.setProperty('--tower', def.colors.glow);
  const cv = iconCanvas(52);
  cv.className = 'shop-icon';
  cv.getContext('2d').drawImage(towerIcon(type, cv.width), 0, 0);
  const facts = [`${TXT.damage} <b>${DAMAGE_TYPES[def.dmgType].label}</b>`, def.targetsAir ? TXT.air : TXT.noAir];
  item.innerHTML = `<div class="shop-body"><h3>${def.name}</h3><p class="shop-role">${def.role}</p><p>${def.desc}</p>
    <div class="guide-facts">${facts.map((f) => `<span>${f}</span>`).join('')}</div></div>
    <div class="shop-action">${o.owned ? ownedBadge(M.owned) : o.locked ? lockedBadge(o.chapter) : buyButton('tower', type, o.price, o.affordable, M.buy)}</div>`;
  item.prepend(cv);
  return item;
}

function skillShopCard(id) {
  const def = SKILLS[id];
  const o = meta.skillOffer(id);
  const lv = Math.max(o.level, 1) - 1;
  const stats = [
    def.damage ? template(M.statDamage, { n: formatInt(def.damage[lv]) }) : null,
    def.heal ? template(M.statHeal, { n: def.heal[lv] }) : null,
    def.duration && !def.damage ? template(M.statDuration, { n: formatValue(def.duration[lv], 'dec1') }) : null,
    template(M.statCooldown, { n: def.cooldown }),
    template(M.statCost, { n: def.soulCost }),
  ].filter(Boolean);
  const action = o.kind === 'max'
    ? ownedBadge(M.maxed)
    : o.locked ? lockedBadge(o.chapter)
      : buyButton('skill', id, o.price, o.affordable, o.kind === 'buy' ? M.buy : M.upgrade);
  return `<article class="shop-card skill ${o.level > 0 ? 'owned' : ''} ${o.locked ? 'locked' : ''}" style="--tower:${def.color}">
    <span class="shop-icon skill-icon">${ICON[id]}</span>
    <div class="shop-body"><h3>${def.name}</h3>${pips(o.level, o.max)}<p>${def.desc}</p>
      <div class="guide-facts">${stats.map((t) => `<span>${t}</span>`).join('')}</div></div>
    <div class="shop-action">${action}</div>
  </article>`;
}

/** Kale sekmesi. hide: en üst seviyedeki geliştirmeler gösterilmez (onarım, ana kule ve yan kuleler hep görünür). */
function castleShop(hide = false) {
  const parts = [];
  if (meta.isRuined()) {
    parts.push(`<article class="shop-card ruin">
      <span class="shop-icon skill-icon">${ICON.keep}</span>
      <div class="shop-body"><h3>${M.ruinedTitle}</h3><p>${template(M.ruinedDesc, { lives: Math.round(CASTLE.ruined.lives * 100), dmg: Math.round(CASTLE.ruined.damage * 100) })}</p></div>
      <div class="shop-action"><button type="button" class="buy-btn ${meta.gold() >= meta.repairPrice() ? '' : 'poor'}" data-act="repair"><small>${M.repair}</small><b>${ICON.coin}${formatInt(meta.repairPrice())}</b></button></div>
    </article>`);
  }
  const U = CASTLE.upgrades;
  const bonus = {
    lives: meta.castleLevel('walls') * U.walls.lives,
    dmg: Math.round(meta.castleLevel('ballista') * U.ballista.damage * 100),
    souls: meta.castleLevel('treasury') * U.treasury.souls,
    range: formatValue(meta.castleLevel('watch') * U.watch.range, 'dec1'),
    cd: Math.round(meta.castleLevel('runes') * U.runes.cooldown * 100),
  };
  parts.push(`<article class="shop-card keep">
    <span class="shop-icon skill-icon">${ICON.keep}</span>
    <div class="shop-body"><h3>${M.keep}</h3><p>${M.keepDesc}</p><p class="shop-role">${template(M.keepStats, bonus)}</p></div>
  </article>`);
  const per = {
    walls: U.walls.lives,
    ballista: Math.round(U.ballista.damage * 100),
    treasury: U.treasury.souls,
    watch: formatValue(U.watch.range, 'dec1'),
    runes: Math.round(U.runes.cooldown * 100),
  };
  for (const key of CASTLE_UPGRADE_ORDER) {
    const up = U[key];
    const o = meta.castleOffer(key);
    if (hide && o.level >= o.max) continue;
    const action = o.level >= o.max ? ownedBadge(M.maxed) : buyButton('castle', key, o.price, o.affordable, M.upgrade);
    parts.push(`<article class="shop-card upgrade">
      <span class="shop-icon skill-icon">${ICON[key]}</span>
      <div class="shop-body"><h3>${up.name}</h3>${pips(o.level, o.max)}<p>${template(up.desc, { n: per[key], r: Math.round(U.watch.rate * 100) })}</p></div>
      <div class="shop-action">${action}</div>
    </article>`);
  }
  // yan kuleler: yetenekler burada takılır
  const owned = SKILL_ORDER.filter((id) => meta.skillLevel(id) > 0);
  parts.push(`<h3 class="shop-section">${M.sides}</h3><p class="shop-note">${M.sidesDesc}</p>`);
  for (const side of SIDES) {
    const title = side === 'left' ? M.left : M.right;
    if (side === 'right' && !meta.rightBuilt()) {
      parts.push(`<article class="shop-card side locked">
        <span class="shop-icon skill-icon">${ICON.keep}</span>
        <div class="shop-body"><h3>${title}</h3><p>${M.sidesDesc}</p></div>
        <div class="shop-action">${buyButton('side', 'right', META.rightSidePrice, meta.gold() >= META.rightSidePrice, M.build)}</div>
      </article>`);
      continue;
    }
    const cur = meta.equipped(side);
    const chips = owned.length
      ? [...owned.map((id) => `<button type="button" class="${cur === id ? 'on' : ''}" data-act="equip" data-side="${side}" data-id="${id}" aria-pressed="${cur === id}" style="--skill:${SKILLS[id].color}">${ICON[id]}${SKILLS[id].name}</button>`),
        `<button type="button" class="${cur ? '' : 'on'}" data-act="equip" data-side="${side}" data-id="" aria-pressed="${!cur}">${M.empty}</button>`].join('')
      : `<p class="shop-note">${M.noSkills}</p>`;
    parts.push(`<article class="shop-card side">
      <span class="shop-icon skill-icon" style="--tower:${cur ? SKILLS[cur].color : 'var(--gold)'}">${cur ? ICON[cur] : ICON.keep}</span>
      <div class="shop-body"><h3>${title}</h3><div class="equip-chips">${chips}</div></div>
    </article>`);
  }
  return parts.join('');
}

/* --------------------------------------------------------------------------
 * 5. EKRAN İÇERİKLERİ
 * ------------------------------------------------------------------------ */
function refreshMain() {
  const data = save.loadRun();
  const hasSave = !!data;
  const cont = root.querySelector('[data-act="continue"]');
  const neu = root.querySelector('[data-act="new"]');
  cont.hidden = !hasSave;
  cont.classList.toggle('primary', hasSave);
  neu.classList.toggle('primary', !hasSave);
  const info = ref('continueInfo');
  if (hasSave) {
    const diff = DIFFICULTIES[data.difficulty];
    const ch = MAP_BY_ID[data.mapId];
    const endless = data.mode === 'endless';
    const where = data.wave > 0 ? `${STRINGS.menu.wave} ${data.wave}${endless ? '' : `/${WAVE_COUNT}`}` : TXT.beforeFirst;
    const mode = data.mode && data.mode !== 'campaign' && MODE[data.mode] ? `${MODE[data.mode].name} · ` : '';
    info.textContent = `${TXT.saved}: ${mode}${ch ? `${ch.name}, ` : ''}${where}, ${diff ? diff.name : ''}`;
    info.hidden = false;
  } else {
    info.hidden = true;
  }
  ref('storageWarn').hidden = save.isPersistent();
  refreshGold();
  // ana menü ipuçları kartı düğmelerin üstüne (logonun önüne) koyar: hiçbir menü düğmesini örtmez
  if (meta.gold() > 0 && state.records.runs > 0) tips.trigger('market', { screen: 'main', target: '.screen-main [data-act="market"]', side: 'above' });
  if (meta.modesUnlocked()) tips.trigger('modes', { screen: 'main', target: '.screen-main [data-act="modes"]', side: 'above' });
  root.querySelector('.screen-main [data-act="modes"]').classList.toggle('dim', !meta.modesUnlocked());
  ref('ruinNote').hidden = !meta.isRuined();
  ref('ruinPrice').textContent = formatInt(meta.repairPrice());
  // bölüm ilerlemesi: her bölüm bir mühür, altında yıldızları
  ref('records').innerHTML = MAPS.map((m) => {
    const open = meta.chapterUnlocked(m.id);
    const stars = meta.chapterStars(m.id).count;
    const label = template(TXT.chapter, { n: m.index + 1 });
    return `<div class="record chapter-seal ${open ? '' : 'locked'} ${stars > 0 ? 'won' : ''}" style="--accent:${m.theme.accent}" aria-label="${label}: ${open ? m.name : TXT.lockedShort}, ${template(TXT.stars, { n: stars, max: 3 })}">
      <small>${m.index + 1}</small><b>${open ? starRow(stars) : ICON.lock}</b></div>`;
  }).join('');
}

/** ★★☆ biçiminde yıldız sırası. */
function starRow(n, max = 3) {
  return `<span class="stars" aria-hidden="true">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
}

/* — Bölüm seçimi (bölüm oyunu ya da Sonsuz Gece) — */
/** Bu bölüm seçilebilir mi? Sonsuz Gece yalnızca kazanılmış bölümlerde. */
const chapterOpen = (id) => (chaptersFor === 'endless' ? meta.endlessUnlocked(id) : meta.chapterUnlocked(id));

function openChapters(mode = 'campaign') {
  chaptersFor = mode;
  pending = { mode, mods: [], challenge: '', daily: '' };
  if (!chapterOpen(chosenMap)) {
    const open = MAPS.filter((m) => chapterOpen(m.id));
    chosenMap = open.length ? open[open.length - 1].id : meta.latestChapter().id;
  }
  renderChapters();
  show('chapters');
  play('ui_open');
}

function renderChapters() {
  const list = ref('chapterList');
  const endless = chaptersFor === 'endless';
  ref('chaptersTitle').textContent = endless ? MODE.endless.name : TXT.chapters;
  ref('starChip').innerHTML = `<i class="star"></i>${meta.totalStars()}<small>/${meta.maxStars()}</small>`;
  list.innerHTML = '';
  for (const m of MAPS) {
    const open = chapterOpen(m.id);
    const stars = meta.chapterStars(m.id);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `chapter-card ${open ? '' : 'locked'} ${m.id === chosenMap ? 'on' : ''}`;
    card.dataset.act = 'chapter';
    card.dataset.id = m.id;
    card.style.setProperty('--accent', m.theme.accent);
    if (!open) card.setAttribute('aria-disabled', 'true');
    const best = DIFFICULTY_ORDER.map((d) => state.records.best[m.id][d]);
    const bestTop = Math.max(...best);
    const prev = MAPS[m.index - 1];
    let line;
    if (endless) {
      const eb = Math.max(...DIFFICULTY_ORDER.map((d) => meta.endlessBest(m.id, d)));
      line = !open ? MODE.endlessLocked : eb > 0 ? template(TXT.bestWave, { n: eb }) : TXT.never;
    } else {
      line = open
        ? (bestTop > 0 ? template(TXT.bestWave, { n: bestTop }) : TXT.never)
        : template(TXT.lockedBy, { name: prev ? prev.name : '' });
    }
    card.innerHTML = `<span class="chapter-thumb"></span>
      <span class="chapter-body">
        <small class="chapter-kicker">${template(TXT.chapter, { n: m.index + 1 })}</small>
        <strong>${m.name}</strong>
        <span class="chapter-sub">${m.sub}</span>
        <span class="chapter-meta">${open ? starRow(stars.count) : `${ICON.lock}<em>${TXT.lockedShort}</em>`}<span>${line}</span>${m.paths.length > 1 ? `<span class="chapter-tag">${TXT.twoGates}</span>` : ''}</span>
        ${threatChips(m)}
      </span>`;
    card.querySelector('.chapter-thumb').appendChild(chapterThumb(m.id));
    list.appendChild(card);
  }
}

/** Bölümün asıl tehditleri: simge + kısa ad (content/chapters.js → threats). */
function threatChips(m) {
  return `<span class="threats" aria-label="${TXT.threat}">${m.threats.map(
    (id) => `<span class="threat threat-${id}">${ICON[`t_${id}`]}${THREAT[id]}</span>`,
  ).join('')}</span>`;
}

/** Geri bildirim bağlantısı: yeni sekmede (Android'de telefonun tarayıcısında) açılır. */
function feedbackLink(cls) {
  return `<a class="${cls}" href="${GAME.feedbackUrl}" target="_blank" rel="noopener" data-act="feedback">${TXT.feedback}</a>`;
}

/** Bölümün küçük harita resmi (bir kez çizilir, önbellekte durur). */
function chapterThumb(id) {
  const w = Math.round((isWide() ? 260 : 64) * dpr); // geniş düzende kartın üstünde büyük harita
  const src = mapThumb(createMap(id), w);
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.className = 'thumb-canvas';
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

function chooseChapter(id) {
  if (!MAP_BY_ID[id]) return;
  if (!chapterOpen(id)) {
    play('ui_deny');
    const card = ref('chapterList').querySelector(`[data-id="${id}"]`);
    if (card) pop(card, 'shake');
    return;
  }
  chosenMap = id;
  play('ui_open');
  haptic('tap');
  renderDifficulties();
  show('difficulty');
}

/**
 * Savaş öncesi ekranı: bölüm kutusu (tanım, asıl tehdit, harita olayı) +
 * bölüm/Sonsuz Gece'de zorluk kartları, Günün Sınavı/Sınav'da kurallar kartı +
 * oyuna götürülecek kuleler.
 */
function renderDifficulties() {
  const rec = state.records;
  const m = MAP_BY_ID[chosenMap];
  const mode = pending.mode;
  const ev = MAP_EVENTS[m.event];
  ref('diffTitle').textContent = m.name;
  let kicker = template(TXT.chapter, { n: m.index + 1 });
  if (mode === 'endless') kicker = `${MODE.endless.name} · ${kicker}`;
  else if (mode === 'daily') kicker = `${MODE.daily.name} · ${dayLabel(pending.daily)}`;
  else if (mode === 'challenge') kicker = `${template(MODE.challengeKicker, { name: CHALLENGE_BY_ID[pending.challenge].name })} · ${kicker}`;
  ref('diffChapter').innerHTML = `<small>${kicker}</small><p>${mode === 'endless' ? MODE.endless.desc : m.desc}</p>
    <div class="diff-threat"><b>${TXT.threat}</b>${threatChips(m)}<p>${m.threat}</p></div>
    ${ev ? `<div class="diff-event"><b>${MODE.event}: ${ev.name}</b><p>${ev.desc}</p></div>` : ''}
    <span class="diff-facts"><span class="reward">${template(TXT.chapterReward, { m: formatValue(m.reward, 'dec1') })}</span>${m.paths.length > 1 ? `<span>${TXT.twoGates}</span>` : ''}</span>`;
  ref('diffChapter').style.setProperty('--accent', m.theme.accent);
  if (mode === 'daily' || mode === 'challenge') {
    ref('diffList').innerHTML = rulesCard();
    renderLoadout();
    return;
  }
  ref('diffList').innerHTML = DIFFICULTY_ORDER.map((id) => {
    const d = DIFFICULTIES[id];
    const best = mode === 'endless' ? meta.endlessBest(m.id, id) : rec.best[m.id][id];
    const wins = mode === 'endless' ? 0 : rec.wins[m.id][id];
    const recLine = best > 0
      ? `${template(TXT.bestWave, { n: best })}${wins > 0 ? `, ${template(TXT.wins, { n: wins })}` : ''}`
      : TXT.never;
    return `<button type="button" class="diff-card diff-${id} ${id === chosenDiff ? 'on' : ''} ${wins > 0 ? 'won' : ''}" data-act="diff" data-diff="${id}" aria-pressed="${id === chosenDiff}">
      <strong>${d.name}${wins > 0 ? '<i class="star" aria-hidden="true"></i>' : ''}</strong>
      <span class="diff-desc">${d.desc}</span>
      <span class="diff-facts"><span>${TXT.lives} <b>${d.lives}</b></span><span>${TXT.souls} <b>${d.startSouls}</b></span><span class="reward">${template(TXT.reward, { m: formatValue(d.reward * m.reward, 'dec1') })}</span></span>
      <span class="diff-record">${recLine}</span>
    </button>`;
  }).join('');
  renderLoadout();
}

/** 'YYYY-AA-GG' → "10 Ekim" (etkin dilde ay adı). */
function dayLabel(key) {
  if (!key) return '';
  const months = MODE.months;
  return template(MODE.dayFormat, { d: Number(key.slice(8, 10)), m: months[Number(key.slice(5, 7)) - 1] ?? '' });
}

/** Kural çipleri (simge + ad); full: açıklamalarıyla liste. */
function modChips(mods) {
  return `<span class="mod-chips">${mods.map((id) => `<span class="mod-chip mod-${id}">${ICON[`m_${id}`] ?? ''}${MODIFIERS[id].name}</span>`).join('')}</span>`;
}
function modList(mods) {
  return `<ul class="mod-list">${mods.map((id) => `<li class="mod-${id}"><span class="mod-ico">${ICON[`m_${id}`] ?? ''}</span><span><b>${MODIFIERS[id].name}</b><small>${MODIFIERS[id].desc}</small></span></li>`).join('')}</ul>`;
}

/** Günün Sınavı / Sınav: zorluk sabit; kurallar, ödül ve durum. */
function rulesCard() {
  const d = DIFFICULTIES[chosenDiff];
  let reward;
  let done;
  if (pending.mode === 'daily') {
    const daily = meta.dailyChallenge(pending.daily);
    done = !!daily && daily.done;
    reward = daily ? daily.reward : 0;
  } else {
    const c = CHALLENGE_BY_ID[pending.challenge];
    done = meta.challengeDone(c.id);
    reward = c.reward;
  }
  const state2 = done
    ? `<span class="rules-done">${ICON.check}${pending.mode === 'daily' ? MODE.dailyDone : MODE.challengeDone}</span>`
    : `<span class="reward">${ICON.coin}+${formatInt(reward)} ${MODE.firstWin}</span>`;
  return `<div class="rules-card">
    <h3 class="shop-section">${MODE.rules}</h3>
    ${modList(pending.mods)}
    <div class="rules-foot"><span class="diff-pill diff-${d.id}">${d.name}</span><span>${TXT.lives} <b>${pending.mods.includes('glass') ? MODIFIERS.glass.lives : d.lives}</b></span>${state2}</div>
  </div>`;
}

/* — Meydan Okumalar (1.5.0) — */
function openModes() {
  tips.complete('modes');
  renderModes();
  ref('modesBody').scrollTop = 0;
  show('modes');
  play('ui_open');
}

function renderModes() {
  const open = meta.modesUnlocked();
  const done = meta.challengesDone();
  ref('medalChip').innerHTML = `${ICON.medal}${done}<small>/${CHALLENGES.length}</small>`;
  // Sonsuz Gece: en iyi rekor (bölüm ve zorluk)
  let top = null;
  for (const m of MAPS) for (const d of DIFFICULTY_ORDER) {
    const n = meta.endlessBest(m.id, d);
    if (n > 0 && (!top || n > top.n)) top = { n, m, d };
  }
  const endlessRec = top ? template(MODE.endlessRecord, { n: top.n, name: top.m.name, diff: DIFFICULTIES[top.d].name }) : MODE.endlessNone;
  // Günün Sınavı
  const daily = meta.dailyChallenge();
  const streak = meta.dailyStreak();
  let dailyHtml;
  if (daily) {
    const m = MAP_BY_ID[daily.mapId];
    dailyHtml = `<p class="mode-where" style="--accent:${m.theme.accent}"><b>${m.name}</b> · ${DIFFICULTIES[daily.difficulty].name}</p>
      ${modChips(daily.mods)}
      <span class="mode-record">${daily.done ? `${ICON.check}${MODE.dailyDone}` : `${ICON.coin}+${formatInt(daily.reward)}`}${streak > 0 ? ` · ${template(MODE.streak, { n: streak })}` : ''}</span>`;
  } else {
    dailyHtml = `<span class="mode-record">${MODE.lockedFirst}</span>`;
  }
  const head = open ? '' : `<p class="modes-locked">${ICON.lock}<span>${MODE.lockedAll}</span></p>`;
  ref('modesBody').innerHTML = `<div class="modes-col">${head}
    <div class="mode-cards">
      <article class="mode-card mode-endless ${open ? '' : 'locked'}">
        <span class="mode-icon">${ICON.endless}</span>
        <div class="mode-text"><h3>${MODE.endless.name}</h3><p>${MODE.endless.card}</p><span class="mode-record">${endlessRec}</span></div>
        <button type="button" class="menu-btn small" data-act="endless" ${open ? '' : 'disabled'}>${MODE.pickChapter}</button>
      </article>
      <article class="mode-card mode-daily ${open ? '' : 'locked'} ${daily && daily.done ? 'done' : ''}">
        <span class="mode-icon">${ICON.daily}</span>
        <div class="mode-text"><h3>${MODE.daily.name}<small>${dayLabel(daily ? daily.date : '')}</small></h3><p>${MODE.daily.card}</p>${dailyHtml}</div>
        <button type="button" class="menu-btn small ${daily && !daily.done ? 'primary' : ''}" data-act="daily" ${daily ? '' : 'disabled'}>${daily && daily.done ? MODE.replay : MODE.start}</button>
      </article>
    </div></div>
    <div class="trials-col">
      <h3 class="shop-section challenge-head"><span>${MODE.challenges}</span><b>${done}/${CHALLENGES.length}</b></h3>
      <p class="shop-note">${MODE.challengesHint}</p>
      <div class="challenge-list">${CHALLENGES.map(challengeCard).join('')}</div>
    </div>`;
}

function challengeCard(c) {
  const m = MAP_BY_ID[c.map];
  const open = meta.challengeUnlocked(c.id);
  const done = meta.challengeDone(c.id);
  const foot = !open
    ? `${ICON.lock}<em>${template(MODE.challengeLocked, { name: m.name })}</em>`
    : done ? `<span class="ch-done">${ICON.check}${MODE.challengeDone}</span>` : `<span class="reward">${ICON.coin}+${formatInt(c.reward)}</span>`;
  return `<button type="button" class="challenge-card ${open ? '' : 'locked'} ${done ? 'done' : ''}" data-act="challenge" data-id="${c.id}" style="--accent:${m.theme.accent}" ${open ? '' : 'aria-disabled="true"'}>
    <small class="ch-kicker">${template(TXT.chapter, { n: m.index + 1 })} · ${m.name} · ${DIFFICULTIES[c.difficulty].name}</small>
    <strong>${c.name}</strong>
    ${modChips(c.mods)}
    <span class="ch-foot">${foot}</span>
  </button>`;
}

function chooseDaily() {
  const daily = meta.dailyChallenge();
  if (!daily) {
    play('ui_deny');
    return;
  }
  pending = { mode: 'daily', mods: [...daily.mods], challenge: '', daily: daily.date };
  chosenMap = daily.mapId;
  chosenDiff = daily.difficulty;
  renderDifficulties();
  ref('diffList').scrollTop = 0;
  show('difficulty');
  play('ui_open');
}

function chooseChallenge(id) {
  const c = CHALLENGE_BY_ID[id];
  if (!c) return;
  if (!meta.challengeUnlocked(id)) {
    play('ui_deny');
    const card = ref('modesBody').querySelector(`[data-id="${id}"]`);
    if (card) pop(card, 'shake');
    return;
  }
  play('ui_open');
  haptic('tap');
  pending = { mode: 'challenge', mods: [...c.mods], challenge: c.id, daily: '' };
  chosenMap = c.map;
  chosenDiff = c.difficulty;
  renderDifficulties();
  show('difficulty');
}

/* — Oyuna götürülecek kuleler — */
function renderLoadout() {
  const box = ref('loadout');
  const chosen = meta.loadoutTowers();
  ref('loadoutCount').textContent = `${chosen.length}/${LOADOUT_SIZE}`;
  if (TOWER_ORDER.filter((t) => meta.ownsTower(t)).length > LOADOUT_SIZE) tips.trigger('loadout', { screen: 'difficulty', target: '.loadout' });
  box.innerHTML = '';
  for (const type of TOWER_ORDER) {
    if (!meta.ownsTower(type)) continue;
    const on2 = chosen.includes(type);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `loadout-btn ${on2 ? 'on' : ''}`;
    b.dataset.act = 'loadout';
    b.dataset.id = type;
    b.setAttribute('aria-pressed', String(on2));
    b.setAttribute('aria-label', TOWERS[type].name);
    b.style.setProperty('--tower', TOWERS[type].colors.glow);
    const cv = iconCanvas(40);
    cv.className = 'loadout-icon';
    cv.getContext('2d').drawImage(towerIcon(type, cv.width), 0, 0);
    b.appendChild(cv);
    b.insertAdjacentHTML('beforeend', `<span>${TOWERS[type].short}</span><i class="loadout-check">${ICON.check}</i>`);
    box.appendChild(b);
  }
}

function toggleTower(btn, type) {
  tips.complete('loadout');
  const res = meta.toggleLoadout(type); // EV.PROFILE → kaydedilir
  if (!res.ok) {
    play('ui_deny');
    pop(btn, 'shake');
    confirmHint(res.reason);
    return;
  }
  play('ui_toggle', { on: meta.inLoadout(type) });
  haptic('tap');
  renderLoadout();
}

/** Seçim reddedilince kısa açıklama (menüde ui.js'in mesaj kutusu görünmez). */
function confirmHint(reason) {
  const text = reason === 'full' ? template(TXT.loadoutFull, { n: LOADOUT_SIZE }) : reason === 'last' ? TXT.loadoutLast : '';
  const box = ref('loadoutCount');
  if (!text || !box) return;
  box.dataset.tip = text;
  pop(box, 'tip');
}

function chooseDifficulty(id) {
  if (!DIFFICULTIES[id] || id === chosenDiff || pending.mode === 'daily' || pending.mode === 'challenge') return;
  chosenDiff = id;
  play('ui_toggle');
  haptic('tap');
  for (const b of ref('diffList').querySelectorAll('.diff-card')) {
    const on2 = b.dataset.diff === id;
    b.classList.toggle('on', on2);
    b.setAttribute('aria-pressed', String(on2));
  }
}

function renderSummary() {
  const run = state.run;
  const total = game.totalWaves();
  const mods = ref('runMods');
  const label = run.mode === 'challenge' && CHALLENGE_BY_ID[run.challenge]
    ? template(MODE.challengeKicker, { name: CHALLENGE_BY_ID[run.challenge].name })
    : run.mode !== 'campaign' ? MODE[run.mode].name : '';
  mods.hidden = !label && !run.mods.length;
  mods.innerHTML = `${label ? `<small>${label}</small>` : ''}${run.mods.length ? modChips(run.mods) : ''}`;
  ref('runSummary').innerHTML = `
    <div><small>${STRINGS.menu.wave}</small><b>${run.wave}<span>/${Number.isFinite(total) ? total : '∞'}</span></b></div>
    <div><small>${TXT.lives}</small><b>${run.lives}</b></div>
    <div><small>${TXT.soulsNow}</small><b>${formatInt(run.souls)}</b></div>
    <div><small>${TXT.kills}</small><b>${formatInt(run.stats.kills)}</b></div>`;
}

function renderEnd(victory, stats, res, reward) {
  if (state.scene !== 'game') return; // oyuncu bu arada menüye döndüyse
  lastEnd = [victory, stats, res, reward];
  const card = ref('endCard');
  card.classList.toggle('victory', victory);
  card.classList.toggle('defeat', !victory);
  card.classList.toggle('endless', (stats.mode ?? 'campaign') === 'endless');
  const ch = MAP_BY_ID[stats.mapId] ?? MAPS[0];
  const mode = stats.mode ?? 'campaign';
  const endless = mode === 'endless';
  let where = `${ch.name} · ${DIFFICULTIES[stats.difficulty].name}`;
  if (endless) where = `${MODE.endless.name} · ${ch.name}`;
  else if (mode === 'daily') where = `${MODE.daily.name} · ${dayLabel(stats.daily)}`;
  else if (mode === 'challenge' && CHALLENGE_BY_ID[stats.challenge]) where = template(MODE.challengeKicker, { name: CHALLENGE_BY_ID[stats.challenge].name });
  ref('endKicker').textContent = res.newBest ? `${TXT.newBest} · ${endless ? MODE.endless.name : ch.name}` : where;
  ref('endKicker').classList.toggle('best', res.newBest);
  let title = victory ? STRINGS.end.victory : STRINGS.end.defeat;
  let sub = victory ? STRINGS.end.victorySub : STRINGS.end.defeatSub;
  if (endless) {
    title = MODE.endlessOver;
    sub = template(MODE.endlessSub, { n: res.reached, best: res.best });
  } else if (victory && mode === 'daily') {
    sub = res.dailyFirst ? template(MODE.dailyWin, { n: res.streak }) : MODE.dailyAgain;
  } else if (victory && mode === 'challenge') {
    sub = res.challengeFirst ? MODE.challengeWin : MODE.challengeAgain;
  } else if (!victory && mode !== 'campaign') {
    sub = MODE.noRuin; // Meydan Okumalarda kale yıkılmaz
  }
  ref('endTitle').textContent = title;
  ref('endSub').textContent = sub;
  // bölüm zaferinde: aynı savaşı Sonsuz Gece olarak sürdür
  const more = victory && mode === 'campaign';
  ref('endlessBtn').hidden = !more;
  ref('retryBtn').classList.toggle('primary', !more);
  ref('endStats').innerHTML = `
    <div><small>${STRINGS.end.reached}</small><b>${res.reached}<span>${endless ? '' : `/${WAVE_COUNT}`}</span></b></div>
    <div><small>${STRINGS.end.kills}</small><b>${formatInt(stats.kills)}</b></div>
    <div><small>${STRINGS.end.soulsEarned}</small><b>${formatInt(stats.soulsEarned)}</b></div>
    <div><small>${STRINGS.end.livesLeft}</small><b>${stats.lives}</b></div>`;
  const E = STRINGS.end;
  const lines = [
    reward.parts.waves > 0 ? [template(E.rewardWaves, { n: reward.waves }), reward.parts.waves] : null,
    reward.parts.bosses > 0 ? [template(E.rewardBosses, { n: reward.bosses }), reward.parts.bosses] : null,
    reward.parts.victory > 0 ? [E.rewardVictory, reward.parts.victory] : null,
  ].filter(Boolean);
  const unlock = res.unlocked
    ? `<div class="end-unlock" style="--accent:${res.unlocked.theme.accent}"><small>${TXT.newChapter}</small><b>${res.unlocked.name}</b>${
      res.unlocked.unlocks.towers.length + res.unlocked.unlocks.skills.length > 0 ? `<span>${TXT.newItems}</span>` : ''}</div>`
    : '';
  const bonus = reward.parts.bonus > 0
    ? `<li class="bonus"><span>${mode === 'daily' ? MODE.bonusDaily : MODE.bonusChallenge}</span><b>+${formatInt(reward.parts.bonus)}</b></li>`
    : '';
  ref('endReward').innerHTML = `${unlock}<div class="reward-head"><small>${E.reward}</small><b>${ICON.coin}+${formatInt(reward.total)}</b></div>
    <ul class="reward-lines">${lines.map(([t, v]) => `<li><span>${t}</span><b>${formatInt(v)}</b></li>`).join('')}
    <li class="mult"><span>${template(E.rewardDifficulty, { m: formatValue(reward.diffMult, 'dec1') })}</span><span>${template(E.rewardChapter, { m: formatValue(reward.chapterMult, 'dec1') })}</span></li>${bonus}</ul>`;
  renderEndRuin();
  show('end');
}

/** Yenilgiden sonra: kale yıkıldı notu ve onar düğmesi (onarılınca kaybolur). */
function renderEndRuin() {
  const box = ref('endRuin');
  const show2 = meta.isRuined() && lastEnd && !lastEnd[0];
  box.hidden = !show2;
  if (!show2) return;
  const price = meta.repairPrice();
  box.innerHTML = `<p>${STRINGS.end.ruined}</p>
    <button type="button" class="buy-btn ${meta.gold() >= price ? '' : 'poor'}" data-act="repair"><small>${STRINGS.end.repair}</small><b>${ICON.coin}${formatInt(price)}</b></button>`;
}

/* — Ayarlar: şemadan, gruplar hâlinde üretilir — */
function settingRow(s) {
  if (s.type === 'range') {
    const input = `<input type="range" min="${s.min}" max="${s.max}" step="${s.step}" data-key="${s.key}" aria-label="${s.label}">`;
    if (s.value) { // sözlü değerli kaydırıcı: etiket ve değer üstte, kaydırıcı tam genişlikte
      return `<label class="set-row column range-row" data-row="${s.key}"><span class="range-head"><span>${s.label}</span><output data-out="${s.key}"></output></span>${input}</label>`;
    }
    return `<label class="set-row" data-row="${s.key}"><span>${s.label}</span>
      <span class="range">${input}<output data-out="${s.key}"></output></span></label>`;
  }
  if (s.type === 'toggle') {
    return `<div class="set-row" data-row="${s.key}"><span id="lbl-${s.key}">${s.label}</span>
      <button type="button" class="switch" role="switch" data-key="${s.key}" aria-labelledby="lbl-${s.key}"><i></i></button></div>`;
  }
  if (s.view === 'language') {
    return `<div class="set-row column lang-row" data-row="${s.key}"><span>${s.label}</span><div class="seg lang-seg">${s.options.map(
      (o) => `<button type="button" data-key="${s.key}" data-value="${o.id}" lang="${o.html}"><img src="${o.flag}" alt="" width="27" height="18">${o.name}</button>`,
    ).join('')}</div></div>`;
  }
  return `<div class="set-row column" data-row="${s.key}"><span>${s.label}</span><div class="seg">${s.options.map(
    (o) => `<button type="button" data-key="${s.key}" data-value="${o.id}">${o.label}</button>`,
  ).join('')}</div></div>`;
}

/**
 * Bilgisayar: kısayol tuşları listesi. Yalnızca fare ve klavyeyle oynanırken
 * görünür (style.css); telefonda gizli kalır.
 */
function keysGroup() {
  const rows = [
    ['1–6', KEYS.tower], [KEYS.space, KEYS.wave], ['F', KEYS.speed], ['Q · E', KEYS.skills],
    ['U', KEYS.upgrade], ['X', KEYS.sell], ['Esc · P', KEYS.pause],
    [KEYS.rightClick, KEYS.cancel], [KEYS.rightClick, KEYS.info],
  ];
  return `<section class="set-group keys-group" data-group="keys" aria-labelledby="set-keys"><h3 class="set-head" id="set-keys">${KEYS.title}</h3>
    <dl class="key-list">${rows.map(([k, t]) => `<div class="key-row"><dt><kbd>${k}</kbd></dt><dd>${t}</dd></div>`).join('')}</dl></section>`;
}

/** Veriler grubu: iki tehlikeli eylem, açıklamalarıyla. */
function dataRows() {
  return `<button type="button" class="set-row set-danger" data-act="resetProgress"><span><b>${RESET.progress}</b><small>${RESET.progressDesc}</small></span></button>
    <button type="button" class="set-row set-danger strong" data-act="wipeAll"><span><b>${RESET.wipe}</b><small>${RESET.wipeDesc}</small></span></button>`;
}

function buildSettings() {
  const list = ref('settingsList');
  const groups = SETTINGS_GROUPS.map((gr) => {
    const rows = SETTINGS_SCHEMA.filter((s) => s.group === gr.id && s.view !== 'hidden').map(settingRow);
    if (gr.id === 'display') {
      rows.unshift(`<button type="button" class="set-row set-link pc-only" data-act="fullscreen" hidden><span class="fs-label">${TXT.fullscreen}</span><span class="set-value">F11</span></button>`);
    }
    if (gr.id === 'help') {
      rows.push(`<button type="button" class="set-row set-link" data-act="resetTips"><span><b>${SET.tipsReset}</b><small>${SET.tipsResetDesc}</small></span></button>`);
    }
    if (gr.id === 'data') rows.push(dataRows());
    if (!rows.length) return '';
    const note = gr.note ? `<p class="set-note">${gr.noteText}</p>` : '';
    return `<section class="set-group" data-group="${gr.id}" aria-labelledby="set-${gr.id}"><h3 class="set-head" id="set-${gr.id}">${gr.label}</h3>${rows.join('')}${note}</section>`;
  });
  const dataAt = SETTINGS_GROUPS.findIndex((gr) => gr.id === 'data');
  groups.splice(dataAt < 0 ? groups.length : dataAt, 0, keysGroup());
  list.innerHTML = groups.join('')
    + `<a class="set-row set-link" href="${GAME.feedbackUrl}" target="_blank" rel="noopener" data-act="feedback"><span><b>${TXT.feedback}</b><small>${TXT.feedbackDesc}</small></span><span class="set-value">itch.io ↗</span></a>`
    + `<button type="button" class="set-row set-link" data-act="about"><span>${STRINGS.about.title}</span> <span class="set-value">${COPYRIGHT}</span></button>`;

  for (const input of list.querySelectorAll('input[type="range"]')) {
    input.addEventListener('input', () => {
      setSetting(input.dataset.key, Number(input.value));
      if (input.dataset.key === 'sfxVolume') play('ui_tick'); // seviyeyi kulakla duyur
    });
  }
  for (const btn of list.querySelectorAll('.switch')) {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const next = !state.settings[key];
      setSetting(key, next);
      play('ui_toggle', { on: next });
      haptic('tap');
    });
  }
  for (const btn of list.querySelectorAll('.seg button')) {
    btn.addEventListener('click', () => {
      setSetting(btn.dataset.key, btn.dataset.value);
      play('ui_toggle');
    });
  }
}

/** Kaydırıcının yazılı değeri: sözlü uçlar ("Saha boş"), kalıplı ara değerler ("En çok 5"). */
function rangeText(s, v) {
  if (s.zero && v <= s.min) return s.zeroLabel;
  if (s.top && v >= s.max) return s.topLabel;
  const n = s.fmt === 'pct' ? formatValue(v, 'pct') : formatInt(v);
  return s.value ? template(s.valueLabel, { n }) : n;
}

/** Ayar denetimlerini state.settings ile eşitler. */
function syncSettings() {
  if (!root) return;
  const list = ref('settingsList');
  for (const s of SETTINGS_SCHEMA) {
    if (s.view === 'hidden') continue;
    const v = state.settings[s.key];
    if (s.type === 'range') {
      const input = list.querySelector(`input[data-key="${s.key}"]`);
      if (Number(input.value) !== v) input.value = String(v);
      input.style.setProperty('--fill', `${((v - s.min) / (s.max - s.min)) * 100}%`);
      list.querySelector(`[data-out="${s.key}"]`).textContent = rangeText(s, v);
    } else if (s.type === 'toggle') {
      list.querySelector(`.switch[data-key="${s.key}"]`).setAttribute('aria-checked', String(!!v));
    } else {
      for (const b of list.querySelectorAll(`.seg button[data-key="${s.key}"]`)) {
        b.classList.toggle('on', b.dataset.value === v);
        b.setAttribute('aria-pressed', String(b.dataset.value === v));
      }
    }
    // otomatik dalga kapalıyken koşulları soluk (yine de ayarlanabilir)
    if (s.group === 'auto' && s.key !== 'autoWave') {
      list.querySelector(`[data-row="${s.key}"]`).classList.toggle('dim', !state.settings.autoWave);
    }
  }
  // sıfırlama yalnızca ana menüden: süren bir oyunun altından veri çekilmesin
  const data = list.querySelector('[data-group="data"]');
  if (data) data.hidden = state.scene === 'game';
}

/* — Sıfırlama — */
async function resetProgress() {
  const ok = await confirm({ title: RESET.progressTitle, text: RESET.progressText, yes: RESET.progressYes, danger: true });
  if (!ok) return;
  save.resetProgress();
  applyRecords(null);
  applyProfile(null);
  save.saveRecords(state.records);
  emit(EV.PROFILE); // main.js boş profili yazar; altın ve çarşı tazelenir
  guideFilter.towers = 'all';
  guideFilter.enemies = 'all';
  haptic('upgrade');
  confirm({ text: RESET.progressDone, single: true });
}

async function wipeAll() {
  const first = await confirm({ title: RESET.wipeTitle, text: RESET.wipeText, yes: RESET.wipeYes, danger: true });
  if (!first) return;
  const sure = await confirm({ title: RESET.wipeTitle2, text: RESET.wipeText2, yes: RESET.wipeYes2, danger: true });
  if (!sure) return;
  save.wipeAll(); // yazma kapanır: sayfa kapanırken son kayıt silinenleri geri getirmez
  root.classList.add('wiping');
  setTimeout(() => location.reload(), 300);
}

/* — Lisans: tam metin ilk açılışta LICENSE dosyasından okunur — */
function onLicenseToggle(e) {
  const open = e.target.open;
  play('ui_toggle', { on: open });
  if (open) loadLicense();
}

async function loadLicense() {
  if (licenseState !== 'idle') return;
  licenseState = 'loading';
  const box = ref('licenseText');
  box.textContent = STRINGS.about.loading;
  try {
    const res = await fetch('LICENSE');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.trim() || /^\s*</.test(text)) throw new Error('LICENSE yerine başka bir sayfa geldi');
    box.replaceChildren(licenseNodes(text));
    licenseState = 'ready';
  } catch {
    box.textContent = STRINGS.about.failed;
    licenseState = 'idle'; // bir sonraki açılışta yeniden dener
  }
}

/**
 * Düz metin lisansı telefona uygun paragraflara çevirir: sabit genişlikte
 * kırılmış satırları birleştirir, çizgi satırlarını atar, kısa başlıkları
 * ve a) b) maddelerini ayırır. Metin hiçbir zaman HTML olarak yorumlanmaz.
 */
function licenseNodes(text) {
  const frag = document.createDocumentFragment();
  for (const block of text.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/)) {
    const items = [];
    let prevLen = 0;
    for (const raw of block.split('\n')) {
      const line = raw.trim();
      if (!line || /^[-=_*]{4,}$/.test(line)) {
        prevLen = 0;
        continue;
      }
      const indent = raw.length - raw.trimStart().length;
      const last = items[items.length - 1];
      if (/^[a-z]\)\s/i.test(line)) items.push({ kind: 'item', text: line });
      else if (indent === 0 && last && last.kind === 'plain' && prevLen >= 60) last.text += ` ${line}`;
      else if (indent > 0 && last && last.kind !== 'plain') last.text += ` ${line}`;
      else items.push({ kind: indent === 0 ? 'plain' : 'body', text: line });
      prevLen = raw.length;
    }
    for (const it of items) {
      const heading = it.kind === 'plain' && it.text.length < 50 && !/[.;:]$/.test(it.text);
      const el = document.createElement(heading ? 'h4' : 'p');
      if (it.kind === 'item') el.className = 'lic-item';
      el.textContent = it.text;
      frag.appendChild(el);
    }
  }
  return frag;
}

/* — Rehber — */
function iconCanvas(size) {
  const c = document.createElement('canvas');
  c.width = Math.round(size * dpr);
  c.height = Math.round(size * dpr);
  c.className = 'guide-icon';
  return c;
}

/* — Rehber süzgeçleri: sekme başına; düşmanlarda yalnızca görülmüşler süzülür — */
const slowsAtAll = (type) => {
  const def = TOWERS[type];
  const last = def.levels.length - 1;
  const states = def.levels.map((_, i) => game.towerStats(type, i)).concat(def.masteries.map((_, m) => game.towerStats(type, last, m)));
  return states.some((st) => st.slow > 0 || st.auraSlow > 0 || st.freezeChance > 0);
};
const TOWER_FILTERS = {
  all: () => true,
  owned: (t) => meta.ownsTower(t),
  air: (t) => TOWERS[t].targetsAir,
  area: (t) => TOWERS[t].levels[0].splash > 0,
  slow: slowsAtAll,
  pierce: (t) => TOWERS[t].dmgType !== 'phys' || TOWERS[t].levels.some((l) => l.armorPierce > 0),
  support: (t) => TOWERS[t].projectile === 'none',
};
const ENEMY_FILTERS = {
  all: () => true,
  flying: (e) => ENEMIES[e].flying,
  armored: (e) => ENEMIES[e].armor > 0,
  resist: (e) => ENEMIES[e].resist > 0,
  fast: (e) => ENEMIES[e].speed >= 1.4,
  special: (e) => {
    const d = ENEMIES[e];
    return !!(d.phase || d.regen || d.spawnOnDeath || d.immune.length || d.evasion || d.blink || d.enrage || d.shieldPhases || d.harden || d.rebirth);
  },
  aid: (e) => {
    const d = ENEMIES[e];
    return !!(d.heal || d.ward || d.haste || d.cleanse || d.summon);
  },
  disrupt: (e) => {
    const d = ENEMIES[e];
    return !!(d.scorch || d.web || d.hex || d.deathBlast || d.blizzard);
  },
  boss: (e) => ENEMIES[e].boss,
};

function renderGuide(resetScroll = true) {
  for (const b of root.querySelectorAll('.guide-tabs button')) b.classList.toggle('on', b.dataset.tab === guideTab);
  const towers = guideTab === 'towers';
  const filters = towers ? TOWER_FILTERS : ENEMY_FILTERS;
  const all = towers ? TOWER_ORDER : Object.keys(ENEMIES);
  const seen = new Set(state.records.seen);
  // görülmemiş düşmanın özelliği süzgeçle ele verilmez
  const pool = towers ? all : all.filter((t) => seen.has(t));
  let active = guideFilter[guideTab];
  if (!filters[active]) active = guideFilter[guideTab] = 'all';
  ref('guideChips').innerHTML = Object.keys(filters).map((id) => {
    const n = id === 'all' ? all.length : pool.filter(filters[id]).length;
    const on2 = id === active;
    return `<button type="button" class="chip ${on2 ? 'on' : ''}" data-act="filter" data-filter="${id}" aria-pressed="${on2}" ${n === 0 && !on2 ? 'disabled' : ''}>${TXT.filter[id]}<small>${n}</small></button>`;
  }).join('');
  const list = ref('guideList');
  list.innerHTML = '';
  if (resetScroll) list.scrollTop = 0;
  const shown = active === 'all' ? all : pool.filter(filters[active]);
  for (const type of shown) list.appendChild(towers ? towerEntry(type) : enemyEntry(type, seen.has(type)));
  if (!shown.length) list.innerHTML = `<p class="guide-empty">${TXT.noMatch}</p>`;
}

/** Rehber kartını bilgi ekranına bağlar (kartın tamamı dokunulabilir). */
function infoLink(item, kind, id) {
  item.dataset.act = 'info';
  item.dataset.kind = kind;
  item.dataset.id = id;
  item.setAttribute('role', 'button');
  item.tabIndex = 0;
  item.insertAdjacentHTML('beforeend', `<span class="guide-more" aria-hidden="true">${ICON.info}</span>`);
}

/** Kulenin sahiplik durumu: sahipsin / çarşıda fiyatı / hangi bölümde açılır. */
function ownership(type) {
  const o = meta.towerOffer(type);
  if (o.owned) return TXT.owned;
  if (o.locked) return template(M.locked, { n: o.chapter.index + 1, name: o.chapter.name });
  return template(TXT.price, { n: formatInt(o.price) });
}

function towerEntry(type) {
  const def = TOWERS[type];
  const item = document.createElement('article');
  item.className = 'guide-item';
  item.style.setProperty('--tower', def.colors.glow);
  const cv = iconCanvas(56);
  cv.getContext('2d').drawImage(towerIcon(type, cv.width), 0, 0);
  const masteries = def.masteries.map((m) => `<div class="mastery-note"><strong>${m.name}</strong><span>${m.desc}</span></div>`).join('');
  const facts = [
    `${TXT.cost} <b>${def.levels[0].cost}</b>`,
    `${TXT.damage} <b>${DAMAGE_TYPES[def.dmgType].label}</b>`,
    def.targetsAir ? TXT.air : TXT.noAir,
  ];
  facts.push(ownership(type));
  item.innerHTML = `<div class="guide-body"><h3>${def.name}</h3><p class="guide-role">${def.role}</p><p>${def.desc}</p>
    <div class="guide-facts">${facts.map((f) => `<span>${f}</span>`).join('')}</div><div class="guide-masteries">${masteries}</div></div>`;
  item.prepend(cv);
  infoLink(item, 'tower', type);
  return item;
}

/** Düşman çizimini kanvasa sığdırır (görülmemişse karanlık silüet). */
function drawEnemy(cv, type, dark = false) {
  const g = cv.getContext('2d');
  const f = enemySprite(type).frames[0];
  const scale = Math.min(cv.width / f.c.width, cv.height / f.c.height) * 0.92;
  const w = f.c.width * scale;
  const h = f.c.height * scale;
  if (dark) g.filter = 'brightness(0) opacity(0.55)';
  g.drawImage(f.c, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
}

function enemyTraits(def) {
  const T = TXT.trait;
  const traits = [];
  if (def.boss) traits.push(T.boss);
  if (def.armor > 0) traits.push(template(T.armor, { n: Math.round(def.armor * 100) }));
  if (def.resist > 0) traits.push(template(T.resist, { n: Math.round(def.resist * 100) }));
  if (def.flying) traits.push(T.flying);
  if (def.speed >= 1.4) traits.push(T.fast);
  if (def.regen) traits.push(T.regen);
  if (def.heal) traits.push(T.heal);
  if (def.phase) traits.push(def.phase.kind === 'burrow' ? T.burrow : T.phase);
  if (def.spawnOnDeath) traits.push(T.spawn);
  if (def.immune.includes('slow')) traits.push(T.immuneSlow);
  if (def.immune.includes('burn')) traits.push(T.immuneBurn);
  if (def.evasion > 0) traits.push(template(T.evasion, { n: Math.round(def.evasion * 100) }));
  if (def.ward) traits.push(T.ward);
  if (def.haste) traits.push(T.haste);
  if (def.cleanse) traits.push(T.cleanse);
  if (def.blink) traits.push(T.blink);
  if (def.web) traits.push(T.web);
  if (def.enrage) traits.push(T.enrage);
  if (def.deathBlast) traits.push(T.deathBlast);
  if (def.summon) traits.push(T.summon);
  if (def.scorch) traits.push(T.scorch);
  if (def.blizzard) traits.push(T.blizzard);
  if (def.hex) traits.push(T.hex);
  if (def.harden) traits.push(T.harden);
  if (def.rebirth) traits.push(T.rebirth);
  if (def.shieldPhases) traits.push(T.phases);
  traits.push(template(T.lives, { n: def.lives >= 999 ? '∞' : def.lives }));
  return traits;
}

function enemyEntry(type, seen) {
  const def = ENEMIES[type];
  const item = document.createElement('article');
  item.className = `guide-item enemy ${seen ? '' : 'unseen'} ${def.boss ? 'boss' : ''}`;
  const cv = iconCanvas(56);
  drawEnemy(cv, type, !seen);
  if (!seen) {
    item.innerHTML = `<div class="guide-body"><h3>???</h3><p>${TXT.unseen}</p></div>`;
  } else {
    const title = def.title ? `<p class="guide-role">${def.title}</p>` : '';
    item.innerHTML = `<div class="guide-body"><h3>${def.name}</h3>${title}<p>${def.desc}</p>
      <div class="guide-facts">${enemyTraits(def).map((t) => `<span>${t}</span>`).join('')}</div></div>`;
    item.style.setProperty('--tower', def.colors.eye);
    infoLink(item, 'enemy', type);
  }
  item.prepend(cv);
  return item;
}

/* --------------------------------------------------------------------------
 * 6. BİLGİ EKRANI — kule, düşman ya da yeteneğin bütün değerleri
 * ------------------------------------------------------------------------ */
const I = TXT.info;

function renderInfo() {
  const body = ref('infoBody');
  if (!body || !infoKind) return;
  ref('infoTitle').textContent = I[infoKind];
  body.innerHTML = '';
  if (infoKind === 'tower') body.appendChild(infoTower(infoId));
  else if (infoKind === 'enemy') body.appendChild(infoEnemy(infoId));
  else body.appendChild(infoSkill(infoId));
}

function infoHead(node, name, sub, color) {
  const head = document.createElement('header');
  head.className = 'info-head';
  head.style.setProperty('--tower', color);
  head.innerHTML = `<div class="info-titles"><h3>${name}</h3>${sub ? `<p>${sub}</p>` : ''}</div>`;
  head.prepend(node);
  return head;
}

/** Sütunlu değer tablosu: başlıklar + [etiket, ...değerler] satırları. */
function infoTable(heads, rows) {
  return `<table class="info-table"><thead><tr><th scope="col"></th>${heads.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([label, ...vals]) => `<tr><th scope="row">${label}</th>${vals.map((v) => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function infoTower(type) {
  const def = TOWERS[type];
  const wrap = document.createElement('article');
  wrap.className = 'info-card';
  const cv = iconCanvas(64);
  cv.className = 'info-icon';
  cv.getContext('2d').drawImage(towerIcon(type, cv.width), 0, 0);
  const last = def.levels.length - 1;
  const levels = def.levels.map((_, i) => game.towerStats(type, i));
  const keys = def.panelStats.filter((k) => levels.some((st) => st[k]) && !(k === 'multishot' && levels.every((st) => st[k] <= 1)));
  const rows = [[I.cost, ...def.levels.map((lv) => `${ICON.soul}${formatInt(lv.cost)}`)]]
    .concat(keys.map((k) => [STAT_LABELS[k].label, ...levels.map((st) => (st[k] ? formatValue(st[k], STAT_LABELS[k].fmt) : '–'))]));
  const masteries = def.masteries.map((m, i) => {
    const st = game.towerStats(type, last, i);
    const top = levels[last];
    const changed = def.panelStats.filter((k) => st[k] !== top[k] && st[k]);
    const chips = changed.map((k) => `<span>${STAT_LABELS[k].label} <b>${formatValue(st[k], STAT_LABELS[k].fmt)}</b></span>`).join('');
    return `<div class="info-mastery"><div class="info-mastery-head"><strong>${m.name}</strong><b>${ICON.soul}${formatInt(m.cost)}</b></div>
      <p>${m.desc}</p><div class="guide-facts">${chips}</div></div>`;
  }).join('');
  const facts = [
    `${TXT.damage} <b>${DAMAGE_TYPES[def.dmgType].label}</b>`,
    def.targetsAir ? TXT.air : TXT.noAir,
    ownership(type),
  ];
  wrap.innerHTML = `<div class="info-main"><p class="info-desc">${def.desc}</p>
    <div class="guide-facts">${facts.map((f) => `<span>${f}</span>`).join('')}</div>
    <h4 class="info-sub">${I.levels}</h4>
    ${infoTable(def.levels.map((_, i) => template(I.level, { n: i + 1 })), rows)}</div>
    <div class="info-side"><h4 class="info-sub">${I.masteries}</h4>
    <div class="info-masteries">${masteries}</div></div>`;
  wrap.prepend(infoHead(cv, def.name, def.role, def.colors.glow));
  return wrap;
}

function infoEnemy(type) {
  const def = ENEMIES[type];
  const wrap = document.createElement('article');
  wrap.className = `info-card ${def.boss ? 'boss' : ''}`;
  const cv = iconCanvas(64);
  cv.className = 'info-icon';
  drawEnemy(cv, type);
  const pct = (v) => (v > 0 ? formatValue(v, 'pct') : '–');
  const rows = [
    [I.hp, formatInt(def.hp)],
    [I.speed, formatValue(def.speed, 'dec1')],
    [I.armor, pct(def.armor)],
    [I.resist, pct(def.resist)],
    [I.souls, def.souls > 0 ? `${ICON.soul}${formatInt(def.souls)}` : '–'],
    [I.lives, def.lives >= 999 ? '∞' : formatInt(def.lives)],
  ];
  wrap.innerHTML = `<div class="info-main"><p class="info-desc">${def.desc}</p>
    <div class="guide-facts">${enemyTraits(def).map((t) => `<span>${t}</span>`).join('')}</div></div>
    <div class="info-side"><h4 class="info-sub">${I.stats}</h4>
    <dl class="info-stats">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    <p class="info-note">${I.enemyNote}</p></div>`;
  wrap.prepend(infoHead(cv, def.name, def.title, def.boss ? 'var(--blood-hi)' : def.colors.eye));
  return wrap;
}

function infoSkill(id) {
  const def = SKILLS[id];
  const wrap = document.createElement('article');
  wrap.className = 'info-card';
  const icon = document.createElement('span');
  icon.className = 'info-icon skill-icon';
  icon.style.setProperty('--tower', def.color);
  icon.innerHTML = ICON[id];
  const n = def.levels;
  const lvls = Array.from({ length: n }, (_, i) => i);
  const rows = [];
  if (def.damage) rows.push([def.id === 'plague' ? I.dps : I.damage, ...lvls.map((i) => formatInt(def.damage[i]))]);
  rows.push([I.cooldown, ...lvls.map(() => formatValue(def.cooldown, 'sec'))]);
  rows.push([I.soulCost, ...lvls.map(() => `${ICON.soul}${formatInt(def.soulCost)}`)]);
  if (def.count) rows.push([I.count, ...lvls.map((i) => formatInt(def.count[i]))]);
  if (def.stun) rows.push([I.stun, ...lvls.map(() => formatValue(def.stun, 'sec'))]);
  if (def.slow) rows.push([I.slow, ...lvls.map((i) => formatValue(def.slow[i], 'pct'))]);
  if (def.duration) rows.push([I.duration, ...lvls.map((i) => formatValue(def.duration[i], 'sec'))]);
  if (def.pull) rows.push([I.pull, ...lvls.map((i) => formatValue(def.pull[i], 'dec1'))]);
  if (def.heal) rows.push([I.heal, ...lvls.map((i) => formatInt(def.heal[i]))]);
  if (def.execute) rows.push([I.execute, ...lvls.map((i) => formatValue(def.execute[i], 'pct'))]);
  if (def.radius) rows.push([I.radius, ...lvls.map(() => formatValue(def.radius, 'dec1'))]);
  const lv = meta.skillLevel(id);
  const ch = meta.unlockChapter('skill', id);
  const own = lv > 0
    ? template(I.ownedLevel, { n: lv, max: n })
    : meta.available('skill', id) ? template(I.notOwned, { n: formatInt(def.price) }) : template(M.locked, { n: ch.index + 1, name: ch.name });
  wrap.innerHTML = `<div class="info-main"><p class="info-desc">${def.desc}</p>
    <div class="guide-facts">${def.damage ? `<span>${TXT.damage} <b>${DAMAGE_TYPES[def.dmgType].label}</b></span>` : ''}<span>${own}</span></div></div>
    <div class="info-side"><h4 class="info-sub">${I.levels}</h4>
    ${infoTable(lvls.map((i) => template(I.level, { n: i + 1 })), rows)}
    <p class="info-note">${I.skillNote}</p></div>`;
  wrap.prepend(infoHead(icon, def.name, '', def.color));
  return wrap;
}
