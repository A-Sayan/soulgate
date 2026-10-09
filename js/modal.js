/* ==========================================================================
 *  SOULGATE — modal.js
 *  Sorumluluk : Oyunun stilinde onay penceresi (tarayıcının confirm()'ü
 *               yerine). Promise döndürür, istekleri sıraya alır.
 *  Bağımlılık : config, utils (0) · audio (1) · particles (2).
 *
 *  KULLANIM
 *   const evet = await confirm({ title, text, yes, no, danger, single });
 *   dismiss() → açık pencereyi "hayır" ile kapatır (geri tuşu bunu çağırır)
 *
 *  DOM (style.css bu sınıfları biçimlendirir)
 *   .modal-backdrop[.open]  > .modal[.danger]
 *     > .modal-sigil  > h2.modal-title  > p.modal-text
 *     > .modal-actions > button.btn.btn-ghost  + button.btn.btn-primary|btn-danger
 *   Açılış/kapanış geçişi CSS'te; süre FEEL.ui.panelMs.
 * ========================================================================== */

import { STRINGS, FEEL } from './config.js';
import { play } from './audio.js';
import { haptic } from './particles.js';

const queue = [];
let current = null;   // { opts, resolve }
let root = null;
let els = null;
let closing = false;

/**
 * Onay penceresi açar.
 * @param {{title?:string, text:string, yes?:string, no?:string, danger?:boolean, single?:boolean}} opts
 *   single: tek düğmeli bilgi penceresi (yalnızca "Tamam")
 * @returns {Promise<boolean>}
 */
export function confirm(opts) {
  return new Promise((resolve) => {
    queue.push({ opts, resolve });
    if (!current && !closing) showNext();
  });
}

export const isOpen = () => current !== null;

/** Açık pencereyi "hayır" ile kapatır. */
export function dismiss() {
  if (current) close(false);
}

/* --------------------------------------------------------------------------
 * İÇ İŞLEYİŞ
 * ------------------------------------------------------------------------ */
function ensureDom() {
  if (root) return;
  root = document.createElement('div');
  root.className = 'modal-backdrop';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-text">
      <div class="modal-sigil" aria-hidden="true"></div>
      <h2 class="modal-title" id="modal-title"></h2>
      <p class="modal-text" id="modal-text"></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-act="no"></button>
        <button type="button" class="btn btn-primary" data-act="yes"></button>
      </div>
    </div>`;
  document.body.appendChild(root);
  els = {
    box: root.querySelector('.modal'),
    title: root.querySelector('.modal-title'),
    text: root.querySelector('.modal-text'),
    no: root.querySelector('[data-act="no"]'),
    yes: root.querySelector('[data-act="yes"]'),
  };
  els.yes.addEventListener('click', () => close(true));
  els.no.addEventListener('click', () => close(false));
  // pencerenin dışına dokunmak "vazgeç" demektir
  root.addEventListener('pointerdown', (e) => {
    if (e.target === root) close(false);
  });
}

function showNext() {
  const next = queue.shift();
  if (!next) return;
  ensureDom();
  current = next;
  const o = next.opts;
  els.title.textContent = o.title ?? '';
  els.title.hidden = !o.title;
  els.text.textContent = o.text ?? '';
  els.yes.textContent = o.yes ?? (o.single ? STRINGS.confirm.ok : STRINGS.confirm.yes);
  els.no.textContent = o.no ?? STRINGS.confirm.no;
  els.no.hidden = !!o.single;
  els.box.classList.toggle('danger', !!o.danger);
  els.yes.className = `btn ${o.danger ? 'btn-danger' : 'btn-primary'}`;
  root.setAttribute('aria-hidden', 'false');
  // bir kare bekle ki geçiş animasyonu başlangıç durumundan çalışsın
  requestAnimationFrame(() => {
    root.classList.add('open');
    (o.danger ? els.no : els.yes).focus({ preventScroll: true });
  });
  play('ui_open');
  haptic('tap');
}

function close(result) {
  if (!current || closing) return;
  const { resolve } = current;
  current = null;
  closing = true;
  root.classList.remove('open');
  root.setAttribute('aria-hidden', 'true');
  play(result ? 'ui_confirm' : 'ui_close');
  haptic('tap');
  resolve(result);
  setTimeout(() => {
    closing = false;
    if (queue.length) showNext();
  }, FEEL.ui.panelMs);
}
