/* ==========================================================================
 *  SOULGATE — input.js
 *  Sorumluluk : Dokunma / fare / klavye / Android geri tuşunu anlamlı
 *               olaylara çevirmek: TAP, DRAG, DRAG_END, BACK, CANCEL, HOTKEY.
 *               Ne yapılacağına KARAR VERMEZ (o ui.js'in işi).
 *  Bağımlılık : events (0) · state (1).
 *
 *  OLAY ANLAMLARI (koordinatlar: sütun, satır, dünya x, dünya y)
 *   TAP      → kısa ve kıpırdamadan dokunuş / tıklama
 *   DRAG     → basılı sürükleme ya da (fareyle) üzerinde gezinme;
 *              parmak oyun alanında değilse sütun = satır = −1
 *   DRAG_END → sürükleme bitti; tuval dışında (ör. bara geri) bırakıldıysa
 *              sütun = satır = −1 → arayüz bunu "iptal" sayar
 *   BACK     → Esc / Backspace / P / Android geri tuşu
 *   CANCEL   → oyun alanında farenin sağ tuşu (kurulumu / paneli kapatır)
 *   HOTKEY   → oyundayken kısayol tuşları (bilgisayar):
 *              1–6 bardaki kule · Boşluk dalga · F hız · Q / E sol / sağ
 *              yetenek · U yükselt · X ya da Delete sat
 *
 *  KULE BARINDAN SÜRÜKLEME
 *   ui.js bir bar düğmesinin pointerdown'unda beginDrag(olay) çağırır;
 *   parmağın sonraki hareketini buradan izleriz (dokunmatikte örtük
 *   yakalama olduğu için hareketler window'a kabarcıklanarak gelir).
 * ========================================================================== */

import { EV, emit } from './events.js';
import { state, screenToWorld } from './state.js';

const TAP_MAX_MOVE = 10;   // piksel — bundan fazlası sürüklemedir
const TAP_MAX_TIME = 0.6;  // saniye — bundan uzunu dokunuş sayılmaz

let canvas = null;
let active = null;         // { id, sx, sy, t0, moved, external }
let backTrap = false;
const world = { x: 0, y: 0 };
const hover = { x: 0, y: 0, on: false }; // farenin oyun alanındaki son yeri (ekran pikseli)
let tabbing = false;       // odak Tab ile mi geldi (klavyeyle gezinen biri Boşlukla düğmeye basabilsin)

/* Kısayol tuşları: tuşun yazdığı harf (klavye düzeni ne olursa olsun F = hız) */
const HOTKEYS = {
  1: ['tower', 0], 2: ['tower', 1], 3: ['tower', 2], 4: ['tower', 3], 5: ['tower', 4], 6: ['tower', 5],
  ' ': ['wave'], f: ['speed'], q: ['skill', 'left'], e: ['skill', 'right'],
  u: ['upgrade'], x: ['sell'], Delete: ['sell'],
};

/** Dinleyicileri kurar. main.js bir kez çağırır. */
export function init(el) {
  canvas = el;
  canvas.addEventListener('pointerdown', onDown, { passive: false });
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') hover.on = false;
  });
  window.addEventListener('keydown', onKey);
  window.addEventListener('pointerdown', () => {
    tabbing = false;
  }, { capture: true, passive: true });
  window.addEventListener('popstate', onPop);
}

/**
 * Kule barından başlayan sürüklemeyi devralır. Parmak eşiği aşmadan
 * bırakılırsa hiçbir olay yayılmaz: düğmeye sıradan bir dokunuş olur.
 */
export function beginDrag(ev) {
  active = { id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, t0: ev.timeStamp, moved: false, external: true };
}

export const isDragging = () => !!active && active.moved;

/**
 * Fare şu an oyun alanının üstündeyse altındaki hücre ({ c, r }), değilse null.
 * Klavyeyle kule seçilince hayalet kule farenin olduğu yerde belirsin diye.
 */
export function hoverCell() {
  if (!hover.on || !canvas || !overCanvas(hover.x, hover.y)) return null;
  const rect = canvas.getBoundingClientRect();
  screenToWorld(hover.x - rect.left, hover.y - rect.top, world);
  return { c: Math.floor(world.x), r: Math.floor(world.y) };
}

/** Sürüklemeyi sessizce bırakır (ör. oyun duraklatıldığında). */
export function cancelDrag() {
  if (!active) return;
  active = null;
  emit(EV.DRAG_END, -1, -1, 0, 0);
}

/**
 * Android geri tuşunu yakalar: açıkken geri tuşu sayfadan çıkmak yerine
 * BACK olayı üretir. Ana menünün kökünde kapatılması gerekir ki oyuncu
 * isterse uygulamadan çıkabilsin.
 */
export function setBackTrap(on) {
  if (on === backTrap || typeof history === 'undefined') return;
  backTrap = on;
  if (on) history.pushState({ sonkale: 1 }, '');
  else if (history.state && history.state.sonkale) history.back();
}

/* --------------------------------------------------------------------------
 * İŞARETÇİ OLAYLARI
 * ------------------------------------------------------------------------ */
function onDown(ev) {
  if (ev.pointerType === 'mouse' && ev.button === 2 && !active) {
    ev.preventDefault();
    emit(EV.CANCEL); // sağ tık: vazgeç
    return;
  }
  if (active || (ev.pointerType === 'mouse' && ev.button !== 0)) return; // ikinci parmak / orta tuş yok sayılır
  ev.preventDefault();
  active = { id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, t0: ev.timeStamp, moved: false, external: false };
}

function onMove(ev) {
  if (ev.pointerType === 'mouse') {
    hover.x = ev.clientX;
    hover.y = ev.clientY;
    hover.on = ev.target === canvas;
  }
  if (!active) {
    // fare gezinmesi: kurulum modunda hayalet kuleyi taşır
    if (ev.pointerType === 'mouse' && ev.target === canvas && state.ui.buildType) emitAt(EV.DRAG, ev.clientX, ev.clientY);
    return;
  }
  if (ev.pointerId !== active.id) return;
  if (!active.moved && Math.hypot(ev.clientX - active.sx, ev.clientY - active.sy) > TAP_MAX_MOVE) active.moved = true;
  if (active.moved) {
    if (ev.cancelable) ev.preventDefault();
    emitAt(EV.DRAG, ev.clientX, ev.clientY);
  }
}

function onUp(ev) {
  if (!active || ev.pointerId !== active.id) return;
  const a = active;
  active = null;
  const quick = (ev.timeStamp - a.t0) / 1000 <= TAP_MAX_TIME;
  if (!a.moved && !a.external && quick) emitAt(EV.TAP, ev.clientX, ev.clientY);
  else if (a.moved) emitAt(EV.DRAG_END, ev.clientX, ev.clientY);
}

function onCancel(ev) {
  if (active && ev.pointerId === active.id) cancelDrag();
}

/** Ekran noktasını hücreye çevirip olayı yayar; tuval dışındaysa −1. */
function emitAt(type, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const over = overCanvas(clientX, clientY);
  screenToWorld(px, py, world);
  const c = over ? Math.floor(world.x) : -1;
  const r = over ? Math.floor(world.y) : -1;
  emit(type, c, r, world.x, world.y);
}

/** Parmak gerçekten oyun alanının üstünde mi (arayüz öğelerinin değil)? */
function overCanvas(x, y) {
  if (typeof document.elementFromPoint !== 'function') return true;
  const el = document.elementFromPoint(x, y);
  return el === canvas || el === null;
}

/* --------------------------------------------------------------------------
 * KLAVYE VE GERİ TUŞU
 * ------------------------------------------------------------------------ */
function onKey(ev) {
  if (ev.key === 'Tab') tabbing = true;
  if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return; // Ctrl+F gibi tarayıcı kısayolları serbest
  const typing = ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA');
  if (typing) return;
  if (ev.key === 'Escape' || ev.key === 'Backspace' || ev.key === 'p' || ev.key === 'P') {
    ev.preventDefault();
    emit(EV.BACK);
    return;
  }
  if (state.scene !== 'game') return;
  const key = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
  const hot = HOTKEYS[key];
  if (!hot) return;
  // Tab ile bir düğmeye gelen, Boşlukla o düğmeye basabilsin
  const focused = document.activeElement;
  const onControl = focused && focused !== document.body && focused !== document.documentElement;
  if (key === ' ' && tabbing && onControl) return;
  ev.preventDefault();
  // fareyle tıklanmış bir düğme odakta kalırsa Boşluk onu da basmasın
  if (onControl && typeof focused.blur === 'function') focused.blur();
  emit(EV.HOTKEY, hot[0], hot[1]);
}

function onPop() {
  if (!backTrap) return;
  emit(EV.BACK);
  history.pushState({ sonkale: 1 }, ''); // tuzağı yeniden kur
}
