/* ==========================================================================
 *  SOULGATE — input.js
 *  Sorumluluk : Dokunma / fare / klavye / Android geri tuşunu anlamlı
 *               olaylara çevirmek: TAP, DRAG, DRAG_END, BACK.
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

/** Dinleyicileri kurar. main.js bir kez çağırır. */
export function init(el) {
  canvas = el;
  canvas.addEventListener('pointerdown', onDown, { passive: false });
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', onKey);
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
  if (active || (ev.pointerType === 'mouse' && ev.button !== 0)) return; // ikinci parmak / sağ tık yok sayılır
  ev.preventDefault();
  active = { id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, t0: ev.timeStamp, moved: false, external: false };
}

function onMove(ev) {
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
  if (ev.repeat) return;
  const typing = ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA');
  if (typing) return;
  if (ev.key === 'Escape' || ev.key === 'Backspace' || ev.key === 'p' || ev.key === 'P') {
    ev.preventDefault();
    emit(EV.BACK);
  }
}

function onPop() {
  if (!backTrap) return;
  emit(EV.BACK);
  history.pushState({ sonkale: 1 }, ''); // tuzağı yeniden kur
}
