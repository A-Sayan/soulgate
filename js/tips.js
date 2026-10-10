/* ==========================================================================
 *  SOULGATE — tips.js
 *  Sorumluluk : Öğretici ipuçları. İlk savaşta temel adımlar (kule kur, kule
 *               elde, dalga, yükselt, hız, otomatik dalga), sonra yeri gelince
 *               yenileri (yetenek, patron, ustalık, kule seçimi, çarşı, yetenek
 *               takma, her bölümün tehdidi). Her ipucu bir kez gösterilir.
 *  Bağımlılık : config, utils, events, i18n (0) · state, save, audio (1).
 *
 *  GÖRÜNÜM
 *   Küçük bir kart (başlık, metin, "Anladım", "Öğreticiyi kapat") ve
 *   anlatılan şeyin çevresinde nabız atan bir halka. Kart oyunu DURDURMAZ;
 *   anlatılan iş yapılınca (kule kurulunca, dalga başlayınca…) kendiliğinden
 *   kapanır. Aynı anda tek ipucu görünür, gerisi sırada bekler (TIPS.order).
 *   Kart hedefin altına ya da üstüne (sığmazsa yanına) yerleşir, hedefi örtmez.
 *
 *  KATMAN
 *   'game' ipuçları yalnızca oyun akarken (menü ekranı açık değilken) görünür,
 *   duraklatma ekranının altında kalır. 'menu' ipuçları belirli bir menü
 *   ekranına (screen) aittir; o ekran açıkken görünür. Görünmesi gereken yer
 *   kapanırsa ipucu sıraya geri döner (görülmüş sayılmaz).
 *
 *  KULLANIM
 *   init()            → main.js bir kez çağırır (oyun olaylarına abone olur)
 *   update()          → main.js her karede (sıra ve konum)
 *   trigger(id, opt)  → ui.js / menu.js: arayüze bağlı ipuçları
 *                       opt: { target, layer, screen, side }
 *                       target: CSS seçicisi | () => Element | { wx, wy, wr } (harita)
 *                       side: önce denenecek taraf ('left' | 'right' | 'above' | 'below')
 *   complete(id)      → anlatılan iş yapıldı: görüldü say, kapat
 *   menuScreen(ad)    → menu.js açık ekranı bildirir (null = menü kapalı)
 *   Ayar 'tips' kapalıysa hiçbir şey gösterilmez. Görülenler records.tips'te.
 * ========================================================================== */

import { TIPS, MAP_BY_ID, TOWERS } from './config.js';
import { template, clamp } from './utils.js';
import { EV, on, emit } from './events.js';
import { section } from './i18n.js';
import { state, discover, isDiscovered, setSetting } from './state.js';
import * as save from './save.js';
import { play } from './audio.js';

const T = section('tips');
const MOUSE = typeof matchMedia === 'function' ? matchMedia('(hover: hover) and (pointer: fine)') : null;
const mouse = () => !!(MOUSE && MOUSE.matches);

let root = null;
let card = null;
let ring = null;
const queue = [];          // { id, opt, rank }
let shown = null;          // görünen ipucu
let wait = 0;              // sıradakine kadar kalan süre (sn)
let menuNow = null;        // açık menü ekranı (menu.js bildirir)
let lastT = 0;
let lastKey = '';          // konum önbelleği (her karede DOM yazmamak için)

/* --------------------------------------------------------------------------
 * 1. KURULUM
 * ------------------------------------------------------------------------ */
export function init() {
  root = document.createElement('div');
  root.className = 'tips';
  root.innerHTML = `<div class="tip-ring" hidden></div>
    <section class="tip-card" role="dialog" aria-live="polite" hidden>
      <header class="tip-head"><span class="tip-mark" aria-hidden="true">?</span><strong class="tip-title"></strong></header>
      <p class="tip-text"></p>
      <div class="tip-actions">
        <button type="button" class="tip-off"></button>
        <button type="button" class="btn btn-primary tip-ok"></button>
      </div>
    </section>`;
  document.body.appendChild(root);
  card = root.querySelector('.tip-card');
  ring = root.querySelector('.tip-ring');
  card.querySelector('.tip-ok').addEventListener('click', () => {
    play('ui_tap');
    if (shown) complete(shown.id);
  });
  card.querySelector('.tip-off').addEventListener('click', () => {
    play('ui_close');
    turnOff();
  });
  subscribe();
}

function subscribe() {
  on(EV.SETTINGS, (key, value) => {
    if (key === 'tips' && !value) clearAll();
    if (key === 'lang' && shown) fill(shown);
    if (key === 'autoWave' && value) complete('auto');
  });
  on(EV.SCENE, (name) => {
    if (name !== 'game') dropLayer('game'); // koşu bitti: oyun ipuçları bir sonrakinde yeniden tetiklenir
  });

  on(EV.RUN_START, (fromSave, mapId) => {
    dropLayer('game');
    const run = state.run;
    const map = MAP_BY_ID[mapId ?? run.mapId];
    if (map && map.index > 0 && run.wave === 0) trigger(`chapter-${map.id}`);
    if (run.wave === 0 && run.towers.length === 0) trigger('build', { target: '.bar' });
    else if (run.wave === 0) trigger('wave', { target: '[data-el="waveBtn"]' });
    if (run.skills.length > 0) trigger('skill', { target: '.skill-orb' });
  });
  on(EV.BUILD, () => {
    complete('build');
    if (state.run && state.run.wave === 0) trigger('wave', { target: '[data-el="waveBtn"]' });
  });
  on(EV.WAVE_START, () => {
    complete('wave');
    if (state.run && state.run.wave >= 1) complete(`chapter-${state.run.mapId}`); // savaş başladı: tehdit okundu sayılır
  });
  on(EV.WAVE_CLEAR, (n) => {
    if (n >= 1) offerUpgrade();
    if (n >= 2) trigger('speed', { target: '[data-el="speedBtn"]' });
    if (n >= 3 && !state.settings.autoWave) trigger('auto', { target: '[data-el="autoBtn"]' });
  });
  on(EV.UPGRADE, (t) => {
    complete('upgrade');
    if (t && t.mastery >= 0) complete('mastery');
  });
  on(EV.SPEED, () => complete('speed'));
  on(EV.SKILL, (id, phase) => {
    if (phase === 'cast') complete('skill');
  });
  on(EV.BOSS_SPAWN, () => trigger('boss', { target: '.bossbar' }));
  on(EV.BOSS_DIE, () => complete('boss'));
  on(EV.OPEN, (what) => {
    if (what === 'info') complete('discover');
  });
}

/** İlk dalgalardan sonra: ruhu yeten, yükseltilebilir bir kuleyi göster. */
function offerUpgrade() {
  const run = state.run;
  if (!run || !enabled() || isDiscovered('tip', 'upgrade')) return;
  const t = run.towers.find((tw) => tw.level < TOWERS[tw.type].levels.length - 1
    && run.souls >= TOWERS[tw.type].levels[tw.level + 1].cost);
  if (t) trigger('upgrade', { target: { wx: t.c + 0.5, wy: t.r + 0.5, wr: 0.62 } });
}

/* --------------------------------------------------------------------------
 * 2. SIRA
 * ------------------------------------------------------------------------ */
const enabled = () => !!state.settings.tips;
const rankOf = (id) => (id.startsWith('chapter-') ? -1 : TIPS.order.indexOf(id));

/** İpucunu sıraya koyar (kapalıysa, görülmüşse ya da zaten sıradaysa hiçbir şey olmaz). */
export function trigger(id, opt = {}) {
  if (!root || !enabled() || isDiscovered('tip', id)) return;
  const layer = opt.layer ?? (opt.screen ? 'menu' : 'game');
  const item = { id, opt: { ...opt, layer }, rank: rankOf(id) };
  if (shown && shown.id === id) {
    shown.opt = item.opt; // hedef değişmiş olabilir (ör. başka bir kule)
    return;
  }
  const i = queue.findIndex((q) => q.id === id);
  if (i >= 0) queue[i] = item;
  else queue.push(item);
  queue.sort((a, b) => a.rank - b.rank);
}

/** Anlatılan iş yapıldı ya da "Anladım": görüldü say, kartı kapat. */
export function complete(id) {
  const i = queue.findIndex((q) => q.id === id);
  if (i >= 0) queue.splice(i, 1);
  const wasShown = shown && shown.id === id;
  // iş gösterilmeden önce yapıldıysa da görüldü sayılır (oyuncu bunu zaten biliyor)
  if (discover('tip', id)) save.saveRecords(state.records);
  if (wasShown) hide(true);
}

/** Menü hangi ekranda? (null = menü kapalı, oyun ya da boş sahne) */
export function menuScreen(name) {
  menuNow = name ?? null;
}

function turnOff() {
  hide(false);
  setSetting('tips', false); // ayar dinleyicisi sırayı boşaltır; kaydı main.js yazar
  emit(EV.TOAST, T.offDone, 'info');
}

function clearAll() {
  queue.length = 0;
  hide(false);
}

function dropLayer(layer) {
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].opt.layer === layer) queue.splice(i, 1);
  if (shown && shown.opt.layer === layer) hide(false);
}

/** Bu ipucu şu an görünebilir mi? */
function canShow(item) {
  if (item.opt.layer === 'menu') return menuNow === item.opt.screen;
  const run = state.run;
  return state.scene === 'game' && menuNow === null && !!run && !run.over;
}

/* --------------------------------------------------------------------------
 * 3. GÖSTERİM (main.js her karede)
 * ------------------------------------------------------------------------ */
export function update() {
  if (!root) return;
  const now = performance.now() / 1000;
  const dt = lastT ? Math.min(0.25, now - lastT) : 0;
  lastT = now;
  if (shown) {
    if (!canShow(shown)) {
      // görüneceği yer kapandı (duraklatma, başka menü): sıraya geri
      queue.unshift(shown);
      hide(false, true);
      return;
    }
    place();
    return;
  }
  if (wait > 0) {
    wait -= dt;
    return;
  }
  const next = queue.find(canShow);
  if (!next) return;
  queue.splice(queue.indexOf(next), 1);
  show(next);
}

function show(item) {
  shown = item;
  fill(item);
  root.dataset.layer = item.opt.layer;
  card.hidden = false;
  lastKey = '';
  reveal(item);
  place();
  card.classList.remove('in');
  void card.offsetWidth;
  card.classList.add('in');
  play('ui_open');
}

/** Menü ipucunun hedefi kaydırılan sayfada görünmüyorsa ekrana getirilir (kart yanına konur). */
function reveal(item) {
  if (item.opt.layer !== 'menu' || typeof item.opt.target !== 'string') return;
  const node = [...document.querySelectorAll(item.opt.target)].find(visible);
  if (!node) return;
  const r = node.getBoundingClientRect();
  if (r.top >= 0 && r.bottom <= globalThis.innerHeight) return;
  const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  node.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
}

/** Kartın başlığı ve metni (fareyle oynanıyorsa varsa "pc" metni). */
function fill(item) {
  const id = item.id;
  let title;
  let text;
  if (id.startsWith('chapter-')) {
    const map = MAP_BY_ID[id.slice(8)];
    title = template(T.chapter.title, { name: map.name });
    text = map.threat;
  } else {
    const sec = T[id];
    title = sec.title;
    text = mouse() && sec.pc ? sec.pc : sec.text;
  }
  card.querySelector('.tip-title').textContent = title;
  card.querySelector('.tip-text').textContent = text;
  card.querySelector('.tip-ok').textContent = T.ok;
  card.querySelector('.tip-off').textContent = T.off;
  card.setAttribute('aria-label', `${T.aria}: ${title}`);
}

/** quiet: sıraya geri dönüşte bekleme yok. */
function hide(done, quiet = false) {
  shown = null;
  if (card) card.hidden = true;
  if (ring) ring.hidden = true;
  wait = quiet ? 0 : TIPS.delay;
  if (done) play('ui_close');
}

/* — Hedef ve yerleşim — */
const GAP = 12;
const EDGE = 8;
// kartın örtmemesi gereken düğmeler (oyunda OTO ve dalga, ana menüde oyna/devam et)
const AVOID = {
  game: ['[data-el="autoBtn"]', '[data-el="waveBtn"]'],
  menu: ['.screen.active [data-act="continue"]', '.screen.active [data-act="new"]'],
};

/** Hedefin ekrandaki dikdörtgeni (yoksa null). */
function targetRect(target) {
  if (!target) return null;
  if (typeof target === 'string') {
    const node = [...document.querySelectorAll(target)].find(visible);
    return node ? node.getBoundingClientRect() : null;
  }
  if (typeof target === 'function') {
    const node = target();
    return node && visible(node) ? node.getBoundingClientRect() : null;
  }
  if (typeof target.wx === 'number') {
    const v = state.view;
    const r = target.wr * v.cell;
    const x = v.ox + target.wx * v.cell;
    const y = v.oy + target.wy * v.cell;
    return { left: x - r, top: y - r, right: x + r, bottom: y + r, width: r * 2, height: r * 2 };
  }
  return null;
}

/**
 * Asıl düğmeler (oyunda OTO ve dalga, menüde oyna) kartın altında kalmasın:
 * kart hedefin üstüne/altına konup bunlardan birine biniyorsa onu da aşar.
 */
function dodge(side, x, y, cw, ch, target) {
  const rects = (AVOID[shown.opt.layer] ?? [])
    .map((sel) => document.querySelector(sel))
    .filter(visible)
    .map((node) => node.getBoundingClientRect())
    .filter((r) => Math.abs(r.top - target.top) >= 1 || Math.abs(r.left - target.left) >= 1); // hedefin kendisi değil
  // yukarı kaçarken alttan üste, aşağı kaçarken üstten alta (üst üste düğmeler)
  rects.sort((a, b) => (side === 'above' ? b.top - a.top : a.top - b.top));
  for (const r of rects) {
    const overlaps = x < r.right && x + cw > r.left && y < r.bottom && y + ch > r.top;
    if (overlaps) y = side === 'above' ? r.top - GAP - ch : r.bottom + GAP;
  }
  return y;
}

function visible(node) {
  if (!node || node.hidden) return false;
  const r = node.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function place() {
  const W = globalThis.innerWidth;
  const H = globalThis.innerHeight;
  const rect = targetRect(shown.opt.target);
  const cw = Math.min(330, W - EDGE * 2);
  const key = `${W}|${H}|${rect ? [rect.left, rect.top, rect.width, rect.height].map(Math.round).join(',') : '-'}`;
  if (key === lastKey) return;
  lastKey = key;
  card.style.width = `${cw}px`;
  const ch = card.offsetHeight;
  let x;
  let y;
  if (rect) {
    ring.hidden = false;
    const pad = 6;
    ring.style.transform = `translate(${Math.round(rect.left - pad)}px, ${Math.round(rect.top - pad)}px)`;
    ring.style.width = `${Math.round(rect.width + pad * 2)}px`;
    ring.style.height = `${Math.round(rect.height + pad * 2)}px`;
    ring.classList.toggle('round', !!(shown.opt.target && typeof shown.opt.target.wx === 'number'));
    // sığan ilk taraf: önce alt/üst (kart aynı sütunda kalır), sonra yanlar;
    // opt.side öne alınabilir. Hiçbiri sığmazsa en çok yer olan taraf.
    const space = {
      above: rect.top - GAP - EDGE,
      below: H - rect.bottom - GAP - EDGE,
      left: rect.left - GAP - EDGE,
      right: W - rect.right - GAP - EDGE,
    };
    const fits = (side) => (side === 'above' || side === 'below' ? space[side] >= ch : space[side] >= cw);
    const bySpace = (a, b) => space[b] - space[a];
    const order = ['below', 'above', 'left', 'right'];
    if (shown.opt.side) order.unshift(shown.opt.side);
    const side = order.find(fits) ?? Object.keys(space).sort(bySpace)[0];
    const cx = (rect.left + rect.right) / 2;
    const cy = (rect.top + rect.bottom) / 2;
    if (side === 'above') { x = cx - cw / 2; y = rect.top - GAP - ch; }
    else if (side === 'below') { x = cx - cw / 2; y = rect.bottom + GAP; }
    else if (side === 'left') { x = rect.left - GAP - cw; y = cy - ch / 2; }
    else { x = rect.right + GAP; y = cy - ch / 2; }
    if (side === 'above' || side === 'below') y = dodge(side, clamp(x, EDGE, W - cw - EDGE), y, cw, ch, rect);
  } else {
    ring.hidden = true;
    // hedefsiz: oyunda kule barının yanına (genişte sağ sütunda barın altı,
    // telefonda barın ve OTO'nun üstü; bölüm afişi ve keşif kartları açık kalır)
    const bar = shown.opt.layer === 'game' ? document.querySelector('[data-el="bar"]') : null;
    const br = bar && visible(bar) ? bar.getBoundingClientRect() : null;
    if (br && document.documentElement.classList.contains('wide')) { x = br.right - cw; y = br.bottom + GAP; }
    else if (br) { x = W / 2 - cw / 2; y = dodge('above', clamp(x, EDGE, W - cw - EDGE), br.top - GAP - ch, cw, ch, br); }
    else { x = W / 2 - cw / 2; y = H - ch - 24; }
  }
  x = clamp(x, EDGE, W - cw - EDGE);
  y = clamp(y, EDGE, Math.max(EDGE, H - ch - EDGE));
  card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}
