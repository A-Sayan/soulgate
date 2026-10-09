/* ==========================================================================
 *  SOULGATE — ui.js
 *  Sorumluluk : Oyun içi arayüz — HUD (can, ruh, dalga, hız, duraklat),
 *               kule seçim barı, dalga düğmesi ve otomatik dalga anahtarı,
 *               kule ve ana kule paneli, boss barı, yan kule yetenek
 *               küreleri, keşif kartları, dalga bildirimleri ve kısa
 *               mesajlar. Kurulum / seçim / yetenek hedefi kararlarını
 *               burada verir (input.js yalnızca dokunuşu söyler).
 *  Bağımlılık : config, utils, events, i18n, icons (0) · state, audio (1) ·
 *               particles, sprites, meta (2) · game (3) · render, input (4).
 *
 *  HIZ: düğme 1× → 2× → 3× → 0× sırasıyla döner. 0× zamanı durdurur ama
 *  oyun duraklatılmış sayılmaz: kule kurmak, yükseltmek, satmak serbesttir.
 *
 *  KEŞİF KARTLARI
 *   İlk kez görülen düşman/boss ve oyunda ilk kez tanıtılan kule/yetenek
 *   için sol üstte küçük bir kart çıkar. Dokunulursa bilgi ekranı açılır
 *   (menu.js, oyun duraklar); yukarı kaydırılırsa hemen gider; dokunulmazsa
 *   FEEL.ui.discoverHold sn sonra kaybolur. Aynı anda en fazla iki kart
 *   görünür, gerisi sıra bekler.
 *
 *  YETENEKLER
 *   Kalenin iki yan kulesinin üstünde birer küre durur (yalnızca takılı
 *   yetenek varsa). Küreye dokun → yetenek kullanılır; alan yeteneğinde
 *   (meteor) önce haritada bir yere dokunulur. İlk kullanım ücretsizdir.
 *
 *  KURULUM AKIŞI
 *   • Bardaki kuleye dokun → kurulum modu. Haritada bir hücreye dokun:
 *     hayalet kule + menzil + yol kapsamı görünür. Aynı hücreye tekrar
 *     dokun → kurulur. (İki dokunuş: küçük ekranda yanlış kurulumu önler.)
 *   • Ya da kuleyi bardan haritaya sürükle-bırak (seçili olsun olmasın)
 *     → bırakınca kurulur. Bara geri bırakmak iptal eder.
 *   • Bardaki kuleye basılı tut → kulenin bilgi ekranı açılır.
 *   • Bir kuleye dokun → panel açılır: istatistik, yükseltme, ustalık,
 *     hedefleme, satış (satış iki dokunuşla onaylanır).
 *   • Ana kuleye (kale) dokun → menzili ve istatistikleri görünür.
 *
 *  DOM: init(root) tüm arayüzü root içine kurar; style.css biçimlendirir.
 *  Dil: sabit etiketler data-t / data-t-aria ile işaretlidir; dil değişince
 *  relocalize() onları ve açık olan dinamik metinleri yeniden yazar.
 *  Oyun alanını kapatmamak için HUD ve barın yüksekliği ölçülür ve
 *  state.view.inset'e yazılır (render.js ızgarayı aradaki boşluğa sığdırır).
 * ========================================================================== */

import {
  TOWERS, ENEMIES, WAVE_TAGS, TARGET_MODES, STAT_LABELS, STRINGS, TIMING, FEEL, THEME, SKILLS,
  CASTLE, CASTLE_UPGRADE_ORDER, MAP_BY_ID,
} from './config.js';
import { formatInt, formatValue, template, clamp, damp } from './utils.js';
import { EV, on, emit } from './events.js';
import {
  state, isUnlocked, towerAt, selectedTower, markSeen, discover, setSpeed, setSetting,
} from './state.js';
import { play } from './audio.js';
import { haptic } from './particles.js';
import { towerIcon, enemySprite } from './sprites.js';
import { castleLevel, loadoutTowers } from './meta.js';
import * as game from './game.js';
import { resize as resizeRender } from './render.js';
import { beginDrag, cancelDrag, hoverCell } from './input.js';
import { section, applyText } from './i18n.js';
import { ICON } from './icons.js';

/* Arayüze özgü kısa metinler: etkin dilden canlı okunur (lang: ui.*). */
const TXT = section('ui');
const KEYS = section('settings.keys'); // tuş adları (Boşluk / Space)

/* Fareyle oynanıyor mu (bilgisayar)? İpuçları "dokun" yerine "tıkla" der.
   Sorgu canlıdır: dokunmatik ekranlı bir dizüstünde fare takılınca değişir. */
const MOUSE = typeof matchMedia === 'function' ? matchMedia('(hover: hover) and (pointer: fine)') : null;
const mouse = () => !!(MOUSE && MOUSE.matches);

/* --------------------------------------------------------------------------
 * 1. DURUM
 * ------------------------------------------------------------------------ */
let root = null;
const el = {};                 // önbelleklenmiş DOM düğümleri
const barBtns = new Map();     // kule tipi → düğme
let dpr = 1;
let shownSouls = 0;
let lastSoulsText = '';
const orbs = [];               // yetenek küreleri (run.skills sırasıyla)
let countdownTotal = 0;
let uiLeft = 0;                // arayüzün ekrandaki sol kenarı (geniş ekranda sahne ortadadır)
let fromBar = false;           // kurulum bardan sürüklenerek mi başladı
let pressedWasActive = false;  // bar düğmesine basıldığında o tip zaten seçili miydi
let sellArmed = 0;             // satış onayı için kalan süre
let panelMode = '';            // '' | 'tower' | 'keep' — panelde ne gösteriliyor
let panelTowerId = 0;
let panelKey = '';
let liveT = 0;
let bossLag = 1;
let hinted = { tap: false, again: false };
const bannerQueue = [];
let bannerBusy = false;
let pressTimer = 0;            // bardaki kuleye basılı tutma (bilgi ekranı)
let pressCleanup = null;
let suppressClick = false;     // basılı tutma bitti: ardından gelen click kurulum seçmesin
const discoverQueue = [];      // sıra bekleyen keşif kartları
const discoverCards = new Map(); // kart → { timer, t0, left }
const SWIPE_DISMISS = 34;        // keşif kartını göndermek için yukarı kaydırma (px)

/* --------------------------------------------------------------------------
 * 2. KURULUM
 * ------------------------------------------------------------------------ */
/** Arayüzü root içine kurar ve olaylara abone olur. main.js bir kez çağırır. */
export function init(rootEl) {
  root = rootEl;
  dpr = Math.min(globalThis.devicePixelRatio || 1, 3);
  root.classList.add('ui');
  root.innerHTML = LAYOUT;
  for (const node of root.querySelectorAll('[data-el]')) el[node.dataset.el] = node;
  applyText(root);
  el.waveBtn.dataset.hotkey = KEYS.space;
  bindHud();
  subscribe();
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => measure());
    ro.observe(el.hud);
    ro.observe(el.dock);
  }
  setVisible(false);
}

const LAYOUT = `
  <header class="hud" data-el="hud">
    <div class="hud-left">
      <div class="stat stat-lives" data-el="lives" data-t-aria="ui.aria.lives">${ICON.heart}<b data-el="livesText">0</b></div>
      <div class="stat stat-souls" data-el="souls" data-t-aria="ui.aria.souls">${ICON.soul}<b data-el="soulsText">0</b></div>
    </div>
    <div class="hud-center">
      <div class="wave-count"><small data-t="strings.hud.wave"></small><b data-el="waveText">0</b><span data-el="waveTotal">/30</span></div>
      <div class="wave-sub" data-el="waveSub"></div>
    </div>
    <div class="hud-right">
      <button type="button" class="hud-btn speed" data-el="speedBtn" data-t-aria="ui.aria.speed" data-hotkey="F">1×</button>
      <button type="button" class="hud-btn" data-el="pauseBtn" data-t-aria="strings.pause.title" data-hotkey="Esc">${ICON.pause}</button>
    </div>
  </header>
  <div class="bossbar" data-el="bossbar" hidden>
    <div class="bossbar-head">${ICON.skull}<span data-el="bossName"></span><em data-el="bossShield" data-t="ui.shield"></em></div>
    <div class="bossbar-track"><div class="bossbar-lag" data-el="bossLag"></div><div class="bossbar-fill" data-el="bossFill"></div></div>
  </div>
  <div class="discoveries" data-el="discoveries" role="region" data-t-aria="ui.aria.discoveries"></div>
  <div class="banner" data-el="banner" aria-live="polite">
    <div class="banner-kicker" data-el="bannerKicker"></div>
    <div class="banner-title" data-el="bannerTitle"></div>
    <div class="banner-sub" data-el="bannerSub"></div>
  </div>
  <div class="toasts" data-el="toasts" aria-live="polite"></div>
  <div class="skill-orbs" data-el="orbs"></div>
  <div class="dock" data-el="dock">
    <button type="button" class="auto-btn" data-el="autoBtn" data-t-aria="ui.aria.auto" aria-pressed="false">${ICON.auto}<span data-t="ui.auto"></span></button>
    <nav class="bar" data-el="bar" data-t-aria="ui.aria.towers"></nav>
    <button type="button" class="wave-btn" data-el="waveBtn">
      <span class="wave-dial">
        <svg class="wave-ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19"/><circle class="wave-ring-fill" data-el="waveRing" cx="22" cy="22" r="19"/></svg>
        <span class="wave-glyph" data-el="waveGlyph"></span>
      </span>
      <span class="wave-btn-label" data-el="waveLabel"></span>
    </button>
  </div>
  <section class="panel" data-el="panel" aria-hidden="true">
    <div class="panel-head">
      <canvas class="panel-icon" data-el="panelIcon"></canvas>
      <span class="panel-icon keep-icon" data-el="keepIcon" hidden>${ICON.keep}</span>
      <div class="panel-titles"><h3 data-el="panelName"></h3><div class="panel-sub" data-el="panelSub"></div></div>
      <button type="button" class="panel-close" data-el="panelClose" data-t-aria="ui.aria.close">✕</button>
    </div>
    <div class="panel-warn" data-el="panelWarn" data-t="strings.panel.disabled" hidden></div>
    <div class="panel-warn" data-el="keepWarn" hidden></div>
    <div class="panel-stats" data-el="panelStats"></div>
    <div class="panel-target" data-el="panelTarget"></div>
    <div class="panel-upgrade" data-el="panelUpgrade"></div>
    <div class="panel-foot">
      <div class="panel-record" data-el="panelRecord"></div>
      <button type="button" class="btn btn-sell" data-el="sellBtn" data-hotkey="X"></button>
    </div>
  </section>`;

function buildBar() {
  const size = 64;   // simgenin çizim çözünürlüğü (CSS pikseli); ekrandaki boyutu style.css verir (46 / geniş 58)
  const zoom = 1.14; // kule simgesi biraz büyütülür: tepesindeki boş pay ve ışıltı kırpılır, gövde öne çıkar
  el.bar.innerHTML = '';
  barBtns.clear();
  for (const type of loadoutTowers()) { // yalnızca savaşa götürülen kuleler (en çok 6)
    if (!isUnlocked(type)) continue;
    const def = TOWERS[type];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tower-btn';
    btn.dataset.hotkey = String(barBtns.size + 1); // bilgisayarda köşede kısayol tuşu görünür
    btn.style.setProperty('--tower', def.colors.glow);
    const cv = document.createElement('canvas');
    cv.width = Math.round(size * dpr);
    cv.height = Math.round(size * dpr);
    cv.className = 'tower-icon';
    const src = towerIcon(type, Math.round(cv.width * zoom));
    // yatayda ortalı, tabanı alt kenara oturur (taşan kısım üstten kırpılır)
    cv.getContext('2d').drawImage(src, Math.round((cv.width - src.width) / 2), cv.height - src.height);
    btn.appendChild(cv);
    btn.insertAdjacentHTML('beforeend', `<span class="tower-name"></span><span class="tower-cost">${ICON.soul}<b>${def.levels[0].cost}</b></span>`);
    btn.addEventListener('pointerdown', (e) => onBarDown(type, e));
    btn.addEventListener('click', () => onBarClick(type));
    btn.addEventListener('contextmenu', (e) => e.preventDefault()); // uzun basışta tarayıcı menüsü çıkmasın
    el.bar.appendChild(btn);
    barBtns.set(type, btn);
  }
  labelBar();
}

function labelBar() {
  for (const [type, btn] of barBtns) {
    const def = TOWERS[type];
    btn.setAttribute('aria-label', template(TXT.towerLabel, { name: def.name, cost: def.levels[0].cost }));
    btn.querySelector('.tower-name').textContent = def.name; // geniş düzende görünür
  }
}

/* — Yan kule yetenek küreleri — */
function buildOrbs() {
  el.orbs.innerHTML = '';
  orbs.length = 0;
  const run = state.run;
  if (!run) return;
  run.skills.forEach((sk, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `skill-orb side-${sk.side}`;
    btn.dataset.hotkey = sk.side === 'left' ? 'Q' : 'E';
    btn.style.setProperty('--skill', SKILLS[sk.id].color);
    btn.innerHTML = `<span class="orb-ring"></span><span class="orb-icon">${ICON[sk.id]}</span><span class="orb-cost"></span>`;
    btn.addEventListener('click', () => onOrb(i));
    el.orbs.appendChild(btn);
    orbs.push({ btn, cost: btn.querySelector('.orb-cost'), key: '', pos: '' });
  });
  labelOrbs();
  placeOrbs();
}

function labelOrbs() {
  const run = state.run;
  orbs.forEach((o, i) => {
    const sk = run.skills[i];
    const cost = game.skillCost(i);
    o.btn.setAttribute('aria-label', template(TXT.skillLabel, { name: SKILLS[sk.id].name, cost: cost > 0 ? cost : TXT.free }));
  });
}

/** Küreler yan kulelerin gövdesine oturur (kale hücreleri; kurulabilir alanı örtmez). */
function placeOrbs() {
  if (!orbs.length || !state.map) return;
  const v = state.view;
  const { x, y } = state.map.castle;
  const size = Math.round(v.cell * 0.92);
  orbs.forEach((o, i) => {
    const side = state.run.skills[i].side;
    const wx = x + (side === 'left' ? -1.2 : 1.2);
    const px = v.ox + wx * v.cell - uiLeft; // küreler arayüzün içinde: sahnenin kaymasını düş
    const py = v.oy + (y - 0.85) * v.cell;
    const pos = `${size}|${Math.round(px)}|${Math.round(py)}`;
    if (pos === o.pos) return; // yalnızca değişince yaz (her kare stil yazmak boşa iş)
    o.pos = pos;
    o.btn.style.width = `${size}px`;
    o.btn.style.height = `${size}px`;
    o.btn.style.transform = `translate(${Math.round(px - size / 2)}px, ${Math.round(py - size / 2)}px)`;
  });
}

function refreshOrbs() {
  const run = state.run;
  orbs.forEach((o, i) => {
    const sk = run.skills[i];
    const def = SKILLS[sk.id];
    const cost = game.skillCost(i);
    const cd = sk.cd > 0 ? sk.cd / sk.cdMax : 0;
    const poor = cost > run.souls;
    const aiming = state.ui.skillAim === i;
    const key = `${cost}|${Math.ceil(cd * 40)}|${poor}|${aiming}`;
    if (key === o.key) return;
    o.key = key;
    o.btn.style.setProperty('--cd', cd.toFixed(3));
    o.btn.classList.toggle('cooling', cd > 0);
    o.btn.classList.toggle('poor', poor && cd <= 0);
    o.btn.classList.toggle('aiming', aiming);
    o.btn.classList.toggle('free', cost === 0);
    o.cost.innerHTML = cost === 0 ? TXT.free : `${ICON.soul}${formatInt(cost)}`;
  });
}

function onOrb(i) {
  if (!playing()) return;
  const sk = state.run.skills[i];
  if (!sk) return;
  if (state.ui.skillAim === i) {
    cancelAim();
    play('ui_close');
    return;
  }
  const check = game.canCast(i);
  if (!check.ok) {
    deny(check.reason === 'cooldown' ? TXT.cooling : check.reason === 'full' ? TXT.fullLives : TXT.noSouls);
    return;
  }
  const def = SKILLS[sk.id];
  if (def.target === 'area') {
    exitBuild();
    deselect(true);
    state.ui.skillAim = i;
    play('ui_open');
    haptic('tap');
    toast(template(mouse() ? TXT.aimClick : TXT.aim, { name: def.name }), 'info');
    return;
  }
  if (game.cast(i)) labelOrbs();
}

function cancelAim() {
  state.ui.skillAim = -1;
}

/** Dil değişti: sabit etiketler ve o an görünen dinamik metinler yeniden yazılır. */
function relocalize() {
  applyText(root);
  el.waveBtn.dataset.hotkey = KEYS.space;
  labelBar();
  if (state.run) labelOrbs();
  for (const o of orbs) o.key = '';
  for (const card of discoverCards.keys()) fillDiscovery(card);
  if (!state.run) return;
  refreshSpeed();
  refreshWave();
  refreshLocks();
  const boss = state.run.enemies.find((e) => e.boss);
  if (boss && !el.bossbar.hidden) el.bossName.textContent = ENEMIES[boss.type].name;
  if (panelMode === 'tower') renderPanel(true);
  else if (panelMode === 'keep') renderKeepPanel();
}

function bindHud() {
  el.speedBtn.addEventListener('click', () => {
    const run = state.run;
    if (!run) return;
    const i = TIMING.speeds.indexOf(run.speed);
    const next = TIMING.speeds[(i + 1) % TIMING.speeds.length];
    setSpeed(next);
    play('ui_toggle', { on: next > 0 });
    haptic('tap');
    if (next === 0) toast(TXT.stopped, 'info');
  });
  el.autoBtn.addEventListener('click', () => {
    const next = !state.settings.autoWave;
    setSetting('autoWave', next); // ayarlardaki anahtarla aynı; kaydedilir
    play('ui_toggle', { on: next });
    haptic('tap');
    toast(next ? TXT.autoOn : TXT.autoOff, 'info');
  });
  el.pauseBtn.addEventListener('click', () => {
    play('ui_tap');
    emit(EV.OPEN, 'pause');
  });
  el.waveBtn.addEventListener('click', () => {
    if (game.callWave()) haptic('tap');
    else play('ui_deny');
  });
  el.panelClose.addEventListener('click', () => deselect());
  el.sellBtn.addEventListener('click', onSell);
}

/** HUD ve bar yüksekliğini ölçüp render'a oyun alanını bildirir. */
export function measure() {
  if (!root || root.hidden) return;
  const hud = el.hud.getBoundingClientRect();
  const dock = el.dock.getBoundingClientRect();
  const W = globalThis.innerWidth || hud.right;
  const H = globalThis.innerHeight || dock.bottom;
  const inset = state.view.inset;
  let top, bottom, left, right;
  if (document.documentElement.classList.contains('wide')) {
    // geniş düzen: bilgi kartı solda, kule paneli sağda; harita aradaki bütün yüksekliği alır
    const gap = 12;
    top = gap;
    bottom = gap;
    left = Math.round(hud.right + gap);
    right = Math.max(0, Math.round(W - dock.left + gap));
    // seçili kule paneli dalga düğmesinin üstünde biter (OTO düğmesini örter: panel açıkken gerekmez)
    const ctl = el.waveBtn.getBoundingClientRect();
    root.style.setProperty('--panel-b', `${Math.round(H - ctl.top + 10)}px`);
  } else {
    top = Math.round(hud.bottom + 4);
    bottom = Math.round(H - dock.top + 4);
    // geniş ama alçak ekranda arayüz ortadaki sahnede durur: harita da onun genişliğine sığar
    left = Math.max(0, Math.round(hud.left));
    right = Math.max(0, Math.round(W - hud.right));
  }
  uiLeft = Math.round(root.getBoundingClientRect().left);
  root.style.setProperty('--hud-h', `${Math.round(hud.bottom)}px`);
  layoutToasts(); // boss barı açılıp kapanınca keşif kartları kayar
  if (inset.top === top && inset.bottom === bottom && inset.left === left && inset.right === right) return;
  inset.top = top;
  inset.bottom = bottom;
  inset.left = left;
  inset.right = right;
  resizeRender();
}

function setVisible(v) {
  root.hidden = !v;
  if (v) requestAnimationFrame(measure);
}

/* --------------------------------------------------------------------------
 * 3. OLAYLAR
 * ------------------------------------------------------------------------ */
function subscribe() {
  on(EV.SCENE, (name) => {
    setVisible(name === 'game');
    if (name !== 'game') resetTransient();
  });
  on(EV.RUN_START, (fromSave) => {
    resetTransient();
    buildBar();
    buildOrbs();
    shownSouls = state.run.souls;
    hinted = { tap: false, again: false };
    refreshAll();
    if (state.run.ruined && !fromSave) setTimeout(() => toast(TXT.ruined, 'warn'), 900);
    const ch = MAP_BY_ID[state.run.mapId];
    if (ch) banner({ kicker: template(TXT.chapter, { n: ch.index + 1 }), title: ch.name, sub: ch.sub, color: ch.theme.accent, small: true });
    introduceLoadout();
  });
  on(EV.ABILITY, (e, kind) => {
    if (kind === 'blizzard') toast(TXT.blizzard, 'warn');
  });
  on(EV.RUN_END, () => {
    exitBuild();
    deselect(true);
    el.bossbar.hidden = true;
  });
  on(EV.PAUSE, (p) => {
    root.classList.toggle('paused', p);
    holdDiscoveries(p);
    if (p) {
      clearLongPress();
      cancelDrag();
      exitBuild();
      cancelAim();
    }
  });
  on(EV.SPEED, refreshSpeed);
  on(EV.SOULS, (souls, delta) => {
    refreshAffordability();
    if (delta > 0) pop(el.souls, 'gain');
    else if (delta < 0) pop(el.souls, 'spend');
    if (panelTowerId) refreshPanelButtons();
  });
  on(EV.LIVES, (lives, delta) => {
    el.livesText.textContent = String(lives);
    el.lives.classList.toggle('low', state.run && lives / state.run.maxLives <= 0.3);
    if (delta < 0) pop(el.lives, 'hit');
  });
  on(EV.WAVE_PREP, (next, countdown) => {
    countdownTotal = countdown ?? 0;
    refreshWave();
    refreshLocks();
  });
  on(EV.WAVE_START, (n, bonus) => {
    const w = game.waveInfo(n);
    if (!w.boss) {
      const tag = WAVE_TAGS[w.tag];
      banner({ kicker: STRINGS.banner.wave, title: String(n), sub: w.name || tag.label, color: tag.color });
    }
    if (bonus > 0) toast(`${STRINGS.banner.earlyBonus} +${bonus}`, 'good');
    refreshWave();
    if (panelMode === 'tower') renderPanel(true);
    else if (panelMode === 'keep') renderKeepPanel(); // balista hasarı dalgayla büyür
  });
  on(EV.WAVE_SPAWNED, refreshWave);
  on(EV.WAVE_CLEAR, (n, bonus) => toast(template(TXT.cleared, { n, souls: bonus }), 'good'));
  on(EV.SKILL, (id, phase) => {
    if (phase === 'cast') labelOrbs();
  });
  on(EV.SPAWN, (e) => {
    if (ENEMIES[e.type].boss || !markSeen(e.type)) return;
    discoverCard('enemy', e.type);
  });
  on(EV.BOSS_SPAWN, (b) => {
    const def = ENEMIES[b.type];
    if (markSeen(b.type)) discoverCard('enemy', b.type);
    banner({ kicker: STRINGS.banner.bossIncoming, title: def.name, sub: def.title, color: THEME.danger, boss: true });
    el.bossName.textContent = def.name;
    el.bossbar.hidden = false;
    bossLag = 1;
    requestAnimationFrame(measure);
  });
  on(EV.BOSS_DIE, (b) => {
    toast(template(TXT.bossDown, { name: ENEMIES[b.type].name }), 'good');
  });
  on(EV.UPGRADE, (t) => {
    if (t.id === panelTowerId) renderPanel(true);
  });
  on(EV.SELL, (t) => {
    if (t.id === panelTowerId) deselect(true);
  });
  on(EV.SAVE_ERROR, (reason) => toast(TXT.save[reason] ?? TXT.save.corrupt, 'warn'));
  on(EV.TOAST, (text, tone) => toast(text, tone));
  on(EV.SETTINGS, (key) => {
    if (key === 'lang') relocalize();
    else if (key === 'autoWave') refreshAuto();
  });

  on(EV.TAP, onTap);
  on(EV.DRAG, onDrag);
  on(EV.DRAG_END, onDragEnd);
  on(EV.CANCEL, () => {
    if (playing()) handleBack(); // sağ tık: yalnızca vazgeçer, oyunu duraklatmaz
  });
  on(EV.HOTKEY, onHotkey);
}

const playing = () => state.scene === 'game' && state.run && !state.run.over && !state.run.paused;

/* --------------------------------------------------------------------------
 * 4. KURULUM VE SEÇİM
 * ------------------------------------------------------------------------ */
function onBarDown(type, ev) {
  suppressClick = false;
  if (ev.pointerType === 'mouse' && ev.button !== 0) {
    if (ev.button === 2) onLongPress(type); // sağ tık: basılı tutmakla aynı, bilgi ekranı
    return;
  }
  if (!playing()) return;
  armLongPress(type, ev); // ruh yetmese de bilgi ekranı açılabilir
  pressedWasActive = state.ui.buildType === type;
  const check = barCheck(type);
  if (!check.ok) return; // geri bildirim click'te verilir
  // seçili olsun olmasın, bardan sürüklenen kule bırakıldığı yere kurulur
  enterBuild(type);
  fromBar = true;
  beginDrag(ev);
}

/**
 * Basılı tutma: parmak kıpırdamadan FEEL.ui.longPressMs boyunca kalırsa
 * kulenin bilgi ekranı açılır. Kaydırma ya da bırakma bunu iptal eder.
 */
function armLongPress(type, ev) {
  clearLongPress();
  const id = ev.pointerId;
  const sx = ev.clientX;
  const sy = ev.clientY;
  const stop = (e) => {
    if (e.pointerId !== id) return;
    if (e.type === 'pointermove' && Math.hypot(e.clientX - sx, e.clientY - sy) <= 10) return;
    clearLongPress();
  };
  window.addEventListener('pointermove', stop);
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
  pressCleanup = () => {
    window.removeEventListener('pointermove', stop);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
  };
  pressTimer = setTimeout(() => {
    clearLongPress();
    onLongPress(type);
  }, FEEL.ui.longPressMs);
}

function clearLongPress() {
  clearTimeout(pressTimer);
  pressTimer = 0;
  if (pressCleanup) pressCleanup();
  pressCleanup = null;
}

function onLongPress(type) {
  if (!playing()) return;
  suppressClick = true;
  cancelDrag(); // bardan başlayan sürükleme iptal (DRAG_END −1 → kurulum modu kapanır)
  exitBuild();
  haptic('tap');
  emit(EV.OPEN, 'info', 'tower', type);
}

function onBarClick(type) {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  if (!playing()) return;
  const check = barCheck(type);
  if (!check.ok) {
    deny(check.reason === 'locked' ? template(TXT.locked, { name: TOWERS[type].name }) : TXT.noSouls);
    return;
  }
  fromBar = false;
  if (pressedWasActive) {
    exitBuild();
    play('ui_close');
    return;
  }
  play('ui_tap');
  haptic('tap');
  if (!hinted.tap) {
    hinted.tap = true;
    toast(mouse() ? TXT.clickToPlace : TXT.tapToPlace, 'info');
  }
}

function barCheck(type) {
  if (!isUnlocked(type)) return { ok: false, reason: 'locked' };
  if (state.run.souls < TOWERS[type].levels[0].cost) return { ok: false, reason: 'souls' };
  return { ok: true, reason: '' };
}

function enterBuild(type) {
  deselect(true);
  state.ui.buildType = type;
  state.ui.ghostC = -1;
  state.ui.ghostR = -1;
  for (const [t, b] of barBtns) b.classList.toggle('active', t === type);
}

function exitBuild() {
  state.ui.buildType = null;
  state.ui.ghostC = -1;
  state.ui.ghostR = -1;
  fromBar = false;
  for (const b of barBtns.values()) b.classList.remove('active');
}

function setGhost(c, r) {
  const ui = state.ui;
  if (c < 0) {
    ui.ghostC = -1;
    ui.ghostR = -1;
    return;
  }
  if (ui.ghostC !== c || ui.ghostR !== r) play('ui_tick');
  ui.ghostC = c;
  ui.ghostR = r;
  ui.ghostValid = game.canBuild(ui.buildType, c, r).ok;
}

function tryBuild(c, r) {
  const type = state.ui.buildType;
  const check = game.canBuild(type, c, r);
  if (!check.ok) {
    deny(check.reason === 'souls' ? TXT.noSouls : TXT.badCell);
    return false;
  }
  game.build(type, c, r);
  exitBuild();
  return true;
}

function onTap(c, r, x, y) {
  if (!playing() || c < 0) return;
  const ui = state.ui;
  if (ui.skillAim >= 0) {
    const i = ui.skillAim;
    cancelAim();
    if (game.cast(i, x, y)) labelOrbs();
    else deny(TXT.noSouls);
    return;
  }
  const tower = towerAt(c, r);
  const onKeep = isKeepCell(c, r);
  if (ui.buildType) {
    if (tower || onKeep) {
      exitBuild();
      if (tower) select(tower);
      else selectKeep();
      return;
    }
    if (ui.ghostC === c && ui.ghostR === r && ui.ghostValid) {
      tryBuild(c, r);
      return;
    }
    setGhost(c, r);
    if (!ui.ghostValid) deny(game.canBuild(ui.buildType, c, r).reason === 'souls' ? TXT.noSouls : TXT.badCell);
    else if (!hinted.again) {
      hinted.again = true;
      toast(mouse() ? TXT.clickAgain : TXT.tapAgain, 'info');
    }
    return;
  }
  if (tower) {
    if (tower.id === ui.selectedId) deselect();
    else select(tower);
  } else if (onKeep) {
    if (ui.keepSelected) deselect();
    else selectKeep();
  } else if (panelMode) {
    deselect();
  }
}

/** Kale bloğu: yolun bittiği ana kule hücreleri ve iki yanındaki burçlar (3 × 2). */
function isKeepCell(c, r) {
  const k = state.map && state.map.castle;
  return !!k && Math.abs(c - k.c) <= 1 && r >= k.r - 1 && r <= k.r;
}

function onDrag(c, r) {
  if (!playing() || !state.ui.buildType) return;
  setGhost(c, r);
}

function onDragEnd(c, r) {
  if (!playing() || !state.ui.buildType) return;
  if (fromBar) {
    if (c >= 0 && game.canBuild(state.ui.buildType, c, r).ok) tryBuild(c, r);
    else {
      if (c >= 0) deny(TXT.badCell);
      exitBuild();
    }
    return;
  }
  setGhost(c, r); // haritada sürükleyerek yer ayarlandı; kurmak için dokunulur
}

function deny(text) {
  play('ui_deny');
  haptic('tap');
  toast(text, 'warn');
}

/* --------------------------------------------------------------------------
 * 5. KULE PANELİ
 * ------------------------------------------------------------------------ */
function select(t) {
  state.ui.selectedId = t.id;
  state.ui.keepSelected = false;
  panelMode = 'tower';
  panelTowerId = t.id;
  sellArmed = 0;
  renderPanel(true);
  openPanel();
}

/** Ana kule: menzili haritada (render.js), değerleri panelde görünür. */
function selectKeep() {
  if (!state.run || !state.run.castle) return;
  state.ui.selectedId = 0;
  state.ui.keepSelected = true;
  panelMode = 'keep';
  panelTowerId = 0;
  sellArmed = 0;
  renderKeepPanel();
  openPanel();
}

function openPanel() {
  el.panel.classList.add('open');
  el.panel.setAttribute('aria-hidden', 'false');
  play('ui_open');
  haptic('tap');
}

/** silent: ses çalmadan kapat (satış, oyun sonu gibi durumlarda). */
function deselect(silent = false) {
  const wasOpen = panelMode !== '';
  state.ui.selectedId = 0;
  state.ui.keepSelected = false;
  panelMode = '';
  panelTowerId = 0;
  sellArmed = 0;
  el.panel.classList.remove('open');
  el.panel.setAttribute('aria-hidden', 'true');
  if (wasOpen && !silent) play('ui_close');
}

/**
 * Panelin kule ve ana kule görünümleri arasında geçiş. Ana kule paneli
 * üstten açılır (kale ve menzili ekranın altında görünür kalsın); taraf
 * değişirken panel geçişsiz yer değiştirir, sonra kendi tarafından kayar.
 */
function setPanelLook(keep) {
  if (el.panel.classList.contains('keep') !== keep) {
    el.panel.style.transition = 'none';
    el.panel.classList.toggle('keep', keep);
    void el.panel.offsetWidth;
    el.panel.style.transition = '';
  }
  el.panelIcon.hidden = keep;
  el.keepIcon.hidden = !keep;
  el.sellBtn.hidden = keep;
  if (keep) el.panelWarn.hidden = true;
  else el.keepWarn.hidden = true;
}

/** Paneli yeniden kurar. force=false iken yalnızca yapı değiştiyse kurar. */
function renderPanel(force = false) {
  const t = selectedTower();
  if (!t) {
    deselect(true);
    return;
  }
  const key = `${t.id}:${t.level}:${t.mastery}:${t.targetMode}`;
  if (!force && key === panelKey) return;
  panelKey = key;
  setPanelLook(false);
  const def = TOWERS[t.type];
  const st = game.statsOf(t);
  const opt = game.upgradeOptions(t);

  el.panel.style.setProperty('--tower', def.colors.glow);
  const icon = el.panelIcon;
  icon.width = Math.round(48 * dpr);
  icon.height = Math.round(48 * dpr);
  icon.getContext('2d').drawImage(towerIcon(t.type, icon.width), 0, 0);
  el.panelName.textContent = def.name;
  const masteryName = t.mastery >= 0 ? `, ${def.masteries[t.mastery].name}` : '';
  el.panelSub.textContent = `${STRINGS.panel.level} ${t.level + 1}${masteryName}. ${def.role}`;

  // istatistikler: şimdiki → sonraki seviye
  const next = opt && opt.kind === 'level' ? opt.next : null;
  let rows = '';
  for (const key2 of def.panelStats) {
    const L = STAT_LABELS[key2];
    const now = st[key2];
    const nx = next ? next[key2] : now;
    if (!now && !nx) continue;
    if (key2 === 'multishot' && now <= 1 && nx <= 1) continue; // tek ok: bilgi taşımaz
    const up = nx !== now;
    rows += `<div class="stat-row"><span>${L.label}</span><b>${formatValue(now, L.fmt)}</b>${
      up ? `<i class="${nx > now ? 'up' : 'down'}">→ ${formatValue(nx, L.fmt)}</i>` : '<i></i>'
    }</div>`;
  }
  el.panelStats.innerHTML = rows;

  // hedefleme (aura kulesinde yok)
  if (def.projectile === 'none') {
    el.panelTarget.innerHTML = '';
  } else {
    el.panelTarget.innerHTML = `<span>${STRINGS.panel.target}</span><div class="seg">${TARGET_MODES.map(
      (m) => `<button type="button" data-mode="${m.id}" class="${m.id === t.targetMode ? 'on' : ''}">${m.label}</button>`,
    ).join('')}</div>`;
    for (const b of el.panelTarget.querySelectorAll('[data-mode]')) {
      b.addEventListener('click', () => {
        game.setTargetMode(t, b.dataset.mode);
        play('ui_toggle');
        haptic('tap');
        renderPanel();
      });
    }
  }

  // yükseltme / ustalık
  if (!opt) {
    el.panelUpgrade.innerHTML = `<div class="maxed">✦ ${STRINGS.panel.maxed} ✦</div>`;
  } else if (opt.kind === 'level') {
    el.panelUpgrade.innerHTML = `<button type="button" class="btn btn-primary btn-upgrade" data-up="-1" data-hotkey="U">${STRINGS.panel.upgrade} ${ICON.soul}<b>${opt.cost}</b></button>`;
  } else {
    el.panelUpgrade.innerHTML = `<div class="mastery-head">${STRINGS.panel.mastery}</div><div class="mastery">${opt.options.map(
      (o) => `<button type="button" class="mastery-card" data-up="${o.index}"><strong>${o.name}</strong><small>${o.desc}</small><b>${ICON.soul}${o.cost}</b></button>`,
    ).join('')}</div>`;
  }
  for (const b of el.panelUpgrade.querySelectorAll('[data-up]')) {
    b.addEventListener('click', () => {
      const m = Number(b.dataset.up);
      const check = game.canUpgrade(t, m);
      if (!check.ok) {
        deny(TXT.noSouls);
        return;
      }
      game.upgrade(t, m);
      haptic('upgrade');
    });
  }
  refreshPanelButtons();
  refreshPanelLive();
}

/** Ana kule paneli: can, balista değerleri, kale geliştirmeleri. */
function renderKeepPanel() {
  const run = state.run;
  if (!run || !run.castle) {
    deselect(true);
    return;
  }
  const K = TXT.keep;
  panelKey = '';
  setPanelLook(true);
  el.panel.style.setProperty('--tower', THEME.gold);
  el.panelName.textContent = K.name;
  el.panelSub.textContent = K.sub;
  el.keepWarn.hidden = !run.ruined;
  el.keepWarn.textContent = run.ruined
    ? template(K.ruined, { lives: Math.round(CASTLE.ruined.lives * 100), dmg: Math.round(CASTLE.ruined.damage * 100) })
    : '';
  el.panelTarget.innerHTML = '';
  const U = CASTLE.upgrades;
  el.panelUpgrade.innerHTML = `<div class="keep-ups"><div class="mastery-head">${K.upgrades}</div><div class="keep-grid">${CASTLE_UPGRADE_ORDER.map((k) => {
    const lv = castleLevel(k);
    const max = U[k].costs.length;
    const pips = Array.from({ length: max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
    return `<div class="keep-up" aria-label="${template(K.level, { name: U[k].name, n: lv, max })}"><span class="keep-up-icon">${ICON[k]}</span><span class="keep-up-name">${U[k].name}</span><span class="pips">${pips}</span></div>`;
  }).join('')}</div><p class="keep-hint">${K.hint}</p></div>`;
  refreshKeepLive();
}

/** Ana kulenin değişen değerleri (can, hasar, öldürme). */
function refreshKeepLive() {
  const run = state.run;
  if (!run || !run.castle) return;
  const ks = game.keepStats();
  const row = (label, value) => `<div class="stat-row"><span>${label}</span><b>${value}</b><i></i></div>`;
  const html = row(TXT.keep.lives, `${run.lives}/${run.maxLives}`)
    + row(STAT_LABELS.damage.label, formatValue(ks.damage, 'int'))
    + row(STAT_LABELS.rate.label, formatValue(ks.rate, 'dec1'))
    + row(STAT_LABELS.range.label, formatValue(ks.range, 'dec1'));
  if (el.panelStats.innerHTML !== html) el.panelStats.innerHTML = html;
  el.panelRecord.innerHTML = `<span>${TXT.kills} <b>${formatInt(run.castle.kills)}</b></span><span>${TXT.damage} <b>${formatInt(run.castle.damage)}</b></span>`;
}

/** Altın değişince düğmelerin kullanılabilirliği ve satış değeri. */
function refreshPanelButtons() {
  const t = selectedTower();
  if (!t) return;
  for (const b of el.panelUpgrade.querySelectorAll('[data-up]')) {
    const check = game.canUpgrade(t, Number(b.dataset.up));
    b.classList.toggle('poor', !check.ok && check.reason === 'souls');
  }
  const value = game.sellValue(t);
  el.sellBtn.innerHTML = sellArmed > 0
    ? `${STRINGS.panel.sellConfirm} <b>+${value}</b>`
    : `${STRINGS.panel.sell} <b>+${value}</b>${t.fresh ? `<small>${TXT.fresh}</small>` : ''}`;
  el.sellBtn.classList.toggle('armed', sellArmed > 0);
}

/** Öldürme/hasar (kuyuda: üretilen ruh) sayacı, çan güçlendirmesi ve susturma uyarısı (birkaç karede bir). */
function refreshPanelLive() {
  const t = selectedTower();
  if (!t) return;
  const def = TOWERS[t.type];
  const b = game.buffsOf(t);
  const buff = b.rate > 0 || b.dmg > 0
    ? `<span class="buff-note">${template(b.dmg > 0 ? TXT.buffed : TXT.buffedRate, { rate: formatValue(b.rate, 'pct'), dmg: formatValue(b.dmg, 'pct') })}</span>`
    : '';
  const html = def.economy
    ? `<span>${TXT.generated} <b>${formatInt(t.souls)}</b></span>${buff}`
    : `<span>${TXT.kills} <b>${formatInt(t.kills)}</b></span><span>${TXT.damage} <b>${formatInt(t.damage)}</b></span>${buff}`;
  if (el.panelRecord.innerHTML !== html) el.panelRecord.innerHTML = html;
  el.panelWarn.hidden = !(t.silenced > 0);
}

function onSell() {
  const t = selectedTower();
  if (!t || !playing()) return;
  if (sellArmed <= 0) {
    sellArmed = 2.5;
    play('ui_tap');
    haptic('tap');
    refreshPanelButtons();
    return;
  }
  game.sell(t);
}

/* --------------------------------------------------------------------------
 * 6. HUD TAZELEME
 * ------------------------------------------------------------------------ */
function refreshAll() {
  const run = state.run;
  el.livesText.textContent = String(run.lives);
  el.lives.classList.toggle('low', run.lives / run.maxLives <= 0.3);
  el.waveTotal.textContent = `/${game.totalWaves()}`;
  el.bossbar.hidden = true;
  refreshSpeed();
  refreshAuto();
  refreshWave();
  refreshLocks();
  refreshAffordability();
}

function refreshSpeed() {
  const run = state.run;
  if (!run) return;
  el.speedBtn.textContent = template(TXT.speed, { n: run.speed });
  el.speedBtn.classList.toggle('fast', run.speed > 1);
  el.speedBtn.classList.toggle('stopped', run.speed === 0);
  root.classList.toggle('frozen', run.speed === 0);
}

function refreshAuto() {
  const on2 = !!state.settings.autoWave;
  el.autoBtn.classList.toggle('on', on2);
  el.autoBtn.setAttribute('aria-pressed', String(on2));
}

function refreshWave() {
  const run = state.run;
  if (!run) return;
  el.waveText.textContent = String(run.wave);
  const nextN = run.wave + 1;
  const spawning = run.spawners.length > 0;
  let sub = '';
  let color = THEME.textDim;
  if (spawning || nextN > game.totalWaves()) {
    const cur = game.waveInfo(run.wave);
    if (cur) {
      sub = cur.name || WAVE_TAGS[cur.tag].label;
      color = WAVE_TAGS[cur.tag].color;
    }
  } else {
    const nx = game.waveInfo(nextN);
    const top = nx.groups.slice().sort((a, b) => b.count - a.count).slice(0, 2)
      .map((gr) => `${ENEMIES[gr.type].name} ×${gr.count}`).join(', ');
    sub = `${STRINGS.hud.next}: ${nx.boss ? ENEMIES[nx.boss].name : top}`;
    color = WAVE_TAGS[nx.tag].color;
  }
  el.waveSub.textContent = sub;
  el.waveSub.style.color = color;
  refreshWaveButton();
}

let glyphKey = '';
function setGlyph(key) {
  if (key === glyphKey) return;
  glyphKey = key;
  el.waveGlyph.innerHTML = key === 'play' ? ICON.play : key === 'swords' ? ICON.swords : `<b>${key}</b>`;
}

function refreshWaveButton() {
  const run = state.run;
  const can = game.canCallWave();
  el.waveBtn.disabled = !can;
  el.waveBtn.classList.toggle('pulse', can && run.countdown === null);
  el.waveBtn.classList.toggle('counting', can && run.countdown !== null);
  if (!can) {
    const last = run.wave >= game.totalWaves();
    el.waveLabel.textContent = last ? TXT.btnLast : TXT.btnRunning;
    el.waveBtn.setAttribute('aria-label', last ? TXT.lastWave : TXT.running);
    setGlyph('swords');
  } else if (run.countdown === null) {
    el.waveLabel.textContent = TXT.btnStart;
    el.waveBtn.setAttribute('aria-label', STRINGS.hud.start);
    setGlyph('play');
  } else {
    el.waveLabel.textContent = TXT.btnEarly;
    el.waveBtn.setAttribute('aria-label', STRINGS.hud.callEarly);
  }
}

function refreshLocks() {
  if (!state.run) return;
  refreshAffordability();
}

function refreshAffordability() {
  const run = state.run;
  if (!run) return;
  for (const [type, b] of barBtns) b.classList.toggle('poor', run.souls < TOWERS[type].levels[0].cost);
}

/** CSS animasyonunu yeniden tetikler. */
function pop(node, cls) {
  if (!node) return;
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

/* --------------------------------------------------------------------------
 * 7. BİLDİRİMLER — dalga afişleri ve kısa mesajlar
 * ------------------------------------------------------------------------ */
/** Ekranın ortasında büyük afiş; sıraya girer, aynı anda biri gösterilir. */
function banner(item) {
  bannerQueue.push(item);
  if (!bannerBusy) nextBanner();
}

function nextBanner() {
  const item = bannerQueue.shift();
  if (!item) {
    bannerBusy = false;
    return;
  }
  bannerBusy = true;
  el.bannerKicker.textContent = item.kicker;
  el.bannerTitle.textContent = item.title;
  el.bannerSub.textContent = item.sub ?? '';
  el.banner.style.setProperty('--accent', item.color ?? THEME.gold);
  el.banner.classList.toggle('boss', !!item.boss);
  el.banner.classList.toggle('small', !!item.small);
  pop(el.banner, 'show');
  const hold = FEEL.ui.bannerHold * (item.boss ? 1.4 : item.small ? 1.25 : 1) * 1000;
  setTimeout(() => {
    el.banner.classList.remove('show');
    setTimeout(nextBanner, FEEL.ui.panelMs + 80);
  }, hold);
}

/* — Keşif kartları — */
/** Oyunun başında, bu oyuncuya henüz tanıtılmamış kuleler ve takılı yetenekler. */
function introduceLoadout() {
  const run = state.run;
  setTimeout(() => {
    if (state.run !== run || run.over) return; // bu arada oyun değiştiyse
    for (const type of loadoutTowers()) if (isUnlocked(type) && discover('tower', type)) discoverCard('tower', type);
    for (const sk of run.skills) if (discover('skill', sk.id)) discoverCard('skill', sk.id);
  }, 1200); // kameranın açılış yakınlaşmasından sonra
}

function discoverCard(kind, id) {
  discoverQueue.push({ kind, id });
  pumpDiscoveries();
}

function pumpDiscoveries() {
  while (discoverCards.size < 2 && discoverQueue.length) showDiscovery(discoverQueue.shift());
}

function showDiscovery({ kind, id }) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = `discovery disc-${kind}`;
  card.dataset.kind = kind;
  card.dataset.id = id;
  card.style.setProperty('--hold', `${FEEL.ui.discoverHold}s`);
  fillDiscovery(card);
  card.addEventListener('click', () => {
    if (card.dataset.swiped) return; // kaydırma bir dokunuş sayılmaz
    play('ui_open');
    haptic('tap');
    dismissDiscovery(card);
    emit(EV.OPEN, 'info', kind, id);
  });
  bindSwipe(card);
  el.discoveries.appendChild(card);
  layoutToasts();
  const hold = FEEL.ui.discoverHold * 1000;
  const entry = { timer: 0, t0: performance.now(), left: hold };
  discoverCards.set(card, entry);
  if (state.run && state.run.paused) card.classList.add('held');
  else entry.timer = setTimeout(() => dismissDiscovery(card), hold);
  play('unlock');
}

/** Kartın simgesi ve metni (dil değişince yeniden yazılır). */
function fillDiscovery(card) {
  const { kind, id } = card.dataset;
  const D = TXT.discover;
  const open = mouse() ? D.openClick : D.open;
  let kicker = D[kind];
  let name = '';
  let color = THEME.gold;
  const size = Math.round(38 * dpr);
  let icon = null;
  if (kind === 'tower') {
    name = TOWERS[id].name;
    color = TOWERS[id].colors.glow;
    icon = document.createElement('canvas');
    icon.width = size;
    icon.height = size;
    icon.getContext('2d').drawImage(towerIcon(id, size), 0, 0);
  } else if (kind === 'enemy') {
    const def = ENEMIES[id];
    name = def.name;
    color = def.boss ? THEME.danger : def.colors.eye;
    if (def.boss) kicker = D.boss;
    icon = document.createElement('canvas');
    icon.width = size;
    icon.height = size;
    const f = enemySprite(id).frames[0];
    const k = Math.min(size / f.c.width, size / f.c.height) * 0.92;
    icon.getContext('2d').drawImage(f.c, (size - f.c.width * k) / 2, (size - f.c.height * k) / 2, f.c.width * k, f.c.height * k);
  } else {
    name = SKILLS[id].name;
    color = SKILLS[id].color;
  }
  card.style.setProperty('--accent', color);
  card.innerHTML = `<span class="disc-icon">${kind === 'skill' ? ICON[id] : ''}</span>
    <span class="disc-text"><small>${kicker}</small><b>${name}</b><em>${open}</em></span>
    <span class="disc-info">${ICON.info}</span><span class="disc-bar"></span>`;
  if (icon) card.querySelector('.disc-icon').appendChild(icon);
  card.setAttribute('aria-label', `${kicker}: ${name}. ${open}`);
}

/**
 * Kartı yukarı kaydırmak onu süresini beklemeden gönderir. Parmak kartı
 * izler; eşik aşılmadan bırakılırsa kart yerine döner. Hızlı bir fiske
 * kısa da olsa yeter. Kısa, kıpırtısız dokunuş yine bilgi ekranını açar.
 */
function bindSwipe(card) {
  let drag = null; // { id, y0, dy, v, t } — v: son hareketin hızı (px/ms, eksi = yukarı)
  const end = (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const { dy, v, t } = drag;
    drag = null;
    const speed = ev.timeStamp - t < 120 ? v : 0; // parmak durup bırakıldıysa fiske sayılmaz
    card.style.transition = '';
    if (ev.type === 'pointerup' && (dy < -SWIPE_DISMISS || (dy < -12 && speed < -0.45))) {
      dismissDiscovery(card, true);
    } else {
      card.style.transform = '';
      card.style.opacity = '';
    }
    // swiped bayrağı bu dokunuşun click'ini yutar; bir sonraki basışta kalkar
  };
  card.addEventListener('pointerdown', (ev) => {
    if (drag || card.classList.contains('out')) return;
    drag = { id: ev.pointerId, y0: ev.clientY, dy: 0, v: 0, t: ev.timeStamp };
    delete card.dataset.swiped;
    try {
      card.setPointerCapture(ev.pointerId); // parmak kartın dışına çıksa da izlenir
    } catch {
      /* işaretçi zaten bırakılmışsa yakalama gerekmez */
    }
  });
  card.addEventListener('pointermove', (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const raw = ev.clientY - drag.y0;
    if (!card.dataset.swiped && Math.abs(raw) < 8) return;
    card.dataset.swiped = '1';
    drag.v = (raw - drag.dy) / Math.max(1, ev.timeStamp - drag.t);
    drag.t = ev.timeStamp;
    drag.dy = raw;
    // yukarı serbest, aşağı direnerek (lastik gibi)
    const shown = raw < 0 ? raw : raw * 0.25;
    card.style.animation = 'none';
    card.style.transition = 'none';
    card.style.transform = `translateY(${shown}px)`;
    card.style.opacity = String(Math.max(0.15, 1 + Math.min(0, raw) / 140));
  });
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
}

/** swiped: yukarı kaydırılarak gönderildi (kart yukarı uçar). */
function dismissDiscovery(card, swiped = false) {
  const entry = discoverCards.get(card);
  if (!entry) return;
  clearTimeout(entry.timer);
  discoverCards.delete(card);
  if (swiped) {
    card.style.transform = `translateY(${-(card.offsetHeight + 24)}px)`;
    card.style.opacity = '0';
    play('ui_close');
    haptic('tap');
  }
  card.classList.add('out');
  setTimeout(() => {
    card.remove();
    pumpDiscoveries();
    layoutToasts();
  }, FEEL.ui.panelMs + 60);
}

/** Kısa mesajlar keşif kartlarının üstüne binmesin: kart varsa altından başlar. */
function layoutToasts() {
  const last = el.discoveries.lastElementChild;
  if (!last) {
    root.style.removeProperty('--toast-top');
    return;
  }
  const r = el.discoveries.getBoundingClientRect();
  root.style.setProperty('--toast-top', `${Math.round(r.bottom + 8)}px`);
}

/** Oyun duraklarken kartların süresi de durur (bilgi ekranından dönünce kaldığı yerden). */
function holdDiscoveries(paused) {
  const now = performance.now();
  for (const [card, entry] of discoverCards) {
    if (paused) {
      clearTimeout(entry.timer);
      entry.left = Math.max(0, entry.left - (now - entry.t0));
      card.classList.add('held');
    } else {
      entry.t0 = now;
      entry.timer = setTimeout(() => dismissDiscovery(card), Math.max(entry.left, 1500));
      card.classList.remove('held');
    }
  }
}

function clearDiscoveries() {
  for (const entry of discoverCards.values()) clearTimeout(entry.timer);
  discoverCards.clear();
  discoverQueue.length = 0;
  el.discoveries.innerHTML = '';
  root.style.removeProperty('--toast-top');
}

/**
 * Kısa mesaj. tone: 'info' | 'warn' | 'good'
 * Aynı mesaj art arda gelirse çoğaltılmaz; en fazla üçü görünür.
 */
export function toast(text, tone = 'info') {
  if (!el.toasts) return;
  const last = el.toasts.lastElementChild;
  if (last && last.textContent === text && !last.classList.contains('out')) return;
  while (el.toasts.children.length >= 3) el.toasts.firstElementChild.remove();
  const node = document.createElement('div');
  node.className = `toast ${tone}`;
  node.textContent = text;
  el.toasts.appendChild(node);
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), FEEL.ui.panelMs + 60);
  }, FEEL.ui.toastHold * 1000);
}

/* --------------------------------------------------------------------------
 * 8. KARE GÜNCELLEMESİ — main.js her karede çağırır (gerçek zaman)
 * ------------------------------------------------------------------------ */
export function update(dt) {
  const run = state.run;
  if (!run || root.hidden) return;

  // ruh sayacı hedefe doğru akar
  shownSouls = damp(shownSouls, run.souls, 14, dt);
  if (Math.abs(shownSouls - run.souls) < 0.5) shownSouls = run.souls;
  const sText = formatInt(shownSouls);
  if (sText !== lastSoulsText) {
    el.soulsText.textContent = sText;
    lastSoulsText = sText;
  }

  // yetenek küreleri: kameranın açılış yakınlaşmasını izler, bekleme halkası dolar
  if (orbs.length) {
    placeOrbs();
    refreshOrbs();
  }

  // dalga geri sayımı
  if (run.countdown !== null && countdownTotal > 0) {
    const k = clamp(run.countdown / countdownTotal, 0, 1);
    el.waveRing.style.strokeDashoffset = String(119.4 * (1 - k));
    const bonus = game.earlyBonus();
    setGlyph(bonus > 0 ? `+${bonus}` : 'play');
  } else if (el.waveRing.style.strokeDashoffset !== '0') {
    el.waveRing.style.strokeDashoffset = '0';
  }
  if (el.waveBtn.disabled === game.canCallWave()) refreshWaveButton();

  // boss barı
  if (!el.bossbar.hidden) {
    const boss = run.enemies.find((e) => e.boss);
    if (!boss) {
      el.bossbar.hidden = true;
      requestAnimationFrame(measure);
    } else {
      const k = clamp(boss.hp / boss.maxHp, 0, 1);
      bossLag = damp(bossLag, k, 3, dt);
      el.bossFill.style.transform = `scaleX(${k})`;
      el.bossLag.style.transform = `scaleX(${Math.max(k, bossLag)})`;
      el.bossShield.hidden = !(boss.shieldT > 0);
      el.bossbar.classList.toggle('shielded', boss.shieldT > 0);
    }
  }

  // satış onayının süresi
  if (sellArmed > 0) {
    sellArmed -= dt;
    if (sellArmed <= 0) refreshPanelButtons();
  }
  liveT -= dt;
  if (liveT <= 0 && panelMode) {
    liveT = 0.25;
    if (panelMode === 'keep') refreshKeepLive();
    else if (!run.towerById.has(panelTowerId)) deselect(true);
    else refreshPanelLive();
  }
}

/* --------------------------------------------------------------------------
 * 9. GERİ TUŞU VE TEMİZLİK
 * ------------------------------------------------------------------------ */
/**
 * Geri tuşu önce burada tüketilir: kurulum modundan çık ya da paneli kapat.
 * @returns {boolean} tüketildiyse true (menu.js duraklatmaz)
 */
export function handleBack() {
  if (state.ui.skillAim >= 0) {
    cancelAim();
    play('ui_close');
    return true;
  }
  if (state.ui.buildType) {
    cancelDrag();
    exitBuild();
    play('ui_close');
    return true;
  }
  if (panelMode) {
    deselect();
    return true;
  }
  return false;
}

function resetTransient() {
  clearLongPress();
  exitBuild();
  deselect(true);
  cancelAim();
  clearDiscoveries();
  root.classList.remove('paused', 'frozen');
  bannerQueue.length = 0;
  el.toasts.innerHTML = '';
  el.banner.classList.remove('show');
  el.bossbar.hidden = true;
}

/* --------------------------------------------------------------------------
 * 10. KISAYOL TUŞLARI (bilgisayar)
 *  input.js yalnızca oyun sahnesinde HOTKEY yayar; burada yalnızca oyun
 *  akarken (duraklatma, bilgi ekranı ya da oyun sonu değilken) uygulanır.
 *  Her tuş ekrandaki düğmenin yaptığını yapar ve o düğme kısaca "basılır".
 * ------------------------------------------------------------------------ */
function onHotkey(action, arg) {
  if (!playing()) return;
  if (action === 'tower') pickTowerByKey(arg);
  else if (action === 'wave') {
    pressFx(el.waveBtn);
    if (el.waveBtn.disabled) play('ui_deny');
    else el.waveBtn.click();
  } else if (action === 'speed') {
    pressFx(el.speedBtn);
    el.speedBtn.click();
  } else if (action === 'skill') {
    const i = state.run.skills.findIndex((sk) => sk.side === arg);
    if (i < 0 || !orbs[i]) return;
    pressFx(orbs[i].btn);
    onOrb(i);
  } else if (action === 'upgrade') {
    const b = panelMode === 'tower' ? el.panelUpgrade.querySelector('[data-up="-1"]') : null;
    if (!b) return; // ustalıkta iki seçenek var: seçimi oyuncu tıklayarak yapar
    pressFx(b);
    b.click();
  } else if (action === 'sell') {
    if (panelMode !== 'tower' || el.sellBtn.hidden) return;
    pressFx(el.sellBtn);
    el.sellBtn.click(); // ilk basış kurar, ikincisi satar (dokunmadaki gibi)
  }
}

/** Bardaki sıradaki kuleyi seçer ya da (zaten seçiliyse) bırakır; hayalet farenin altında belirir. */
function pickTowerByKey(index) {
  const entry = [...barBtns][index];
  if (!entry) return;
  const [type, btn] = entry;
  pressFx(btn);
  if (state.ui.buildType === type) {
    exitBuild();
    play('ui_close');
    return;
  }
  const check = barCheck(type);
  if (!check.ok) {
    deny(check.reason === 'locked' ? template(TXT.locked, { name: TOWERS[type].name }) : TXT.noSouls);
    return;
  }
  cancelAim();
  enterBuild(type);
  fromBar = false;
  play('ui_tap');
  const cell = hoverCell();
  if (cell) setGhost(cell.c, cell.r);
}

/** Klavyeyle basılan düğme, dokunulmuş gibi kısa bir an içe göçer. */
function pressFx(node) {
  if (!node) return;
  node.classList.remove('key-press');
  void node.offsetWidth; // aynı düğmeye art arda basılınca animasyon yeniden başlasın
  node.classList.add('key-press');
  setTimeout(() => node.classList.remove('key-press'), 140);
}
