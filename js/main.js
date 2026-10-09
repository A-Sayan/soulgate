/* ==========================================================================
 *  SOULGATE — main.js
 *  Sorumluluk : Açılış (bootstrap), modülleri doğru sırayla kurmak, sabit
 *               adımlı oyun döngüsü ve modüller arası "yönlendirmeler":
 *               kalıcı kayıt, geri tuşu, sekme gizlenince otomatik duraklatma,
 *               ses kilidinin açılması, ekran boyutu, dil, service worker.
 *  Bağımlılık : her modül (zincirin en üst halkası; onu kimse import etmez).
 *
 *  DÖNGÜ
 *   Oyun mantığı sabit adımla (TIMING.step = 1/60 sn) ilerler; 2x/3x hız
 *   adım SAYISINI artırır. Böylece sonuçlar her hızda ve her ekran
 *   tazeleme oranında aynıdır. Hit-pause sırasında mantık ve partiküller
 *   donar, kamera sarsıntısı ve arayüz akmaya devam eder.
 *   Bir karede hata olursa döngü ölmez: sonraki kare önceden istenir,
 *   hata bir kez bildirilir.
 * ========================================================================== */

import { TIMING, GAME, STRINGS } from './config.js';
import { EV, on, emit } from './events.js';
import { language, detectLanguage, text, LANGUAGE_IDS } from './i18n.js';
import { state, applySettings, applyRecords, applyProfile, serializeRun, setSetting } from './state.js';
import * as save from './save.js';
import * as audio from './audio.js';
import * as fx from './particles.js';
import * as game from './game.js';
import * as render from './render.js';
import * as input from './input.js';
import * as modal from './modal.js';
import * as ui from './ui.js';
import * as menu from './menu.js';

/* --------------------------------------------------------------------------
 * 1. AÇILIŞ
 * ------------------------------------------------------------------------ */
function boot() {
  const saved = save.loadSettings();
  applySettings(saved);
  // ilk açılış (ya da eski kayıtta dil yok): tarayıcının diliyle başla
  const langOk = saved && LANGUAGE_IDS.includes(saved.lang);
  if (!langOk) setSetting('lang', detectLanguage());
  applyDocumentLanguage();
  applyRecords(save.loadRecords());
  applyProfile(save.loadProfile());

  const canvas = document.getElementById('game');
  audio.init(state.settings);
  fx.init();
  render.init(canvas);
  input.init(canvas);
  ui.init(document.getElementById('ui'));
  menu.init(document.getElementById('menu'));

  wireEvents();
  watchViewport();
  preventBrowserGestures();

  menu.openMain();
  requestAnimationFrame(loop);
  hideBootScreen();
  registerServiceWorker();
}

function hideBootScreen() {
  const el = document.getElementById('boot');
  if (!el) return;
  el.classList.add('gone');
  setTimeout(() => el.remove(), 700);
}

/* --------------------------------------------------------------------------
 * 2. OLAY YÖNLENDİRMELERİ
 * ------------------------------------------------------------------------ */
function wireEvents() {
  // kalıcılık: ayarlar her değişiklikte, oyun yalnızca saha boşken
  on(EV.SETTINGS, (key) => {
    save.saveSettings(state.settings);
    if (key === 'lang') applyDocumentLanguage();
  });
  // altın ve çarşı alımları hemen yazılır: uygulama kapansa da kaybolmaz
  on(EV.PROFILE, () => save.saveProfile(state.profile));
  on(EV.SAVEPOINT, () => {
    save.saveRun(serializeRun());
    save.saveRecords(state.records);
  });

  on(EV.BACK, routeBack);

  // ekranı açık tut: savaş sürerken telefon kararmasın
  on(EV.SCENE, syncWakeLock);
  on(EV.PAUSE, syncWakeLock);
  on(EV.RUN_END, syncWakeLock);

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', flushAll);

  // mobil tarayıcılar sesi ancak bir dokunuştan sonra açar
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  window.addEventListener('keydown', unlock, { capture: true });
}

/**
 * Geri tuşunun sırası: açık pencere → kurulum modu / kule paneli →
 * menü ekranları (ayar/rehber geri, oyunda duraklat ↔ devam).
 */
function routeBack() {
  if (modal.isOpen()) {
    modal.dismiss();
    return;
  }
  const run = state.run;
  const playing = state.scene === 'game' && run && !run.paused && !run.over && menu.currentScreen() === null;
  if (playing && ui.handleBack()) return;
  menu.handleBack();
}

function onVisibility() {
  const hidden = document.visibilityState === 'hidden';
  emit(EV.VISIBILITY, hidden);
  if (hidden) {
    flushAll();
    const run = state.run;
    if (state.scene === 'game' && run && !run.over && !run.paused) menu.openPause();
  } else {
    syncWakeLock();
  }
  lastTime = 0; // dönüşte biriken süreyi "yetişmeye" çalışma
  acc = 0;
}

/** Sayfanın dili, başlığı ve yatay ekran uyarısı etkin dile uyar. */
function applyDocumentLanguage() {
  document.documentElement.lang = language();
  document.title = GAME.fullTitle;
  const hint = document.querySelector('.rotate-hint');
  if (hint) hint.textContent = text('doc.rotate');
  const board = document.getElementById('game');
  if (board) board.setAttribute('aria-label', text('doc.canvas'));
}

function flushAll() {
  save.flush();
  save.saveRecords(state.records);
  save.saveProfile(state.profile);
}

/* — Ekran kilidi (Wake Lock): destek yoksa sessizce geçer — */
let wakeLock = null;
/** Çerçeve içinde (ör. itch.io) izin yoksa hiç istenmez; konsol hatası da çıkmaz. */
function wakeLockAllowed() {
  const policy = document.permissionsPolicy || document.featurePolicy;
  return !policy || typeof policy.allowsFeature !== 'function' || policy.allowsFeature('screen-wake-lock');
}

async function syncWakeLock() {
  const run = state.run;
  const want = state.scene === 'game' && run && !run.paused && !run.over && document.visibilityState === 'visible';
  try {
    if (want && !wakeLock && navigator.wakeLock && wakeLockAllowed()) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    } else if (!want && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    wakeLock = null; // pil tasarrufu modu vb. reddedebilir
  }
}

/* --------------------------------------------------------------------------
 * 3. EKRAN BOYUTU VE TARAYICI JESTLERİ
 * ------------------------------------------------------------------------ */
function watchViewport() {
  let pending = 0;
  const onResize = () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      render.resize();
      ui.measure();
    });
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 250));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
  // yazı tipleri yüklenince HUD yüksekliği değişebilir
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize);
}

function preventBrowserGestures() {
  // iOS: iki parmakla yakınlaştırma ve çift dokunuşla büyütme oyunu bozar
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('input, textarea')) e.preventDefault();
  });
}

/* --------------------------------------------------------------------------
 * 4. OYUN DÖNGÜSÜ
 * ------------------------------------------------------------------------ */
let lastTime = 0;
let acc = 0;
const reported = new Set();

function loop(now) {
  requestAnimationFrame(loop); // önce iste: bu karede hata olsa da döngü sürer
  let dt = lastTime ? (now - lastTime) / 1000 : 0;
  lastTime = now;
  if (!(dt > 0)) dt = 0;       // eksi ya da NaN zaman damgası
  if (dt > 0.25) dt = 0.25;    // uzun takılmadan sonra sıçrama yapma
  try {
    frame(dt);
  } catch (err) {
    report(err);
  }
}

function frame(dt) {
  const run = state.run;
  const playing = state.scene === 'game' && run && !run.paused && !run.over;

  if (playing) {
    if (!fx.isHitStopped()) {
      acc += Math.min(dt, TIMING.maxFrame);
      let steps = 0;
      while (acc >= TIMING.step && steps < 8) {
        for (let i = 0; i < run.speed; i++) {
          game.update(TIMING.step);
          fx.update(TIMING.step);
        }
        acc -= TIMING.step;
        steps++;
      }
      if (acc > TIMING.step * 4) acc = 0; // cihaz yetişemiyorsa yavaşla, sarmala girme
    }
  } else {
    acc = 0;
    // menüde korlar uçuşur; oyun bitince son patlamalar söner
    if (state.scene === 'menu' || (run && run.over)) fx.update(dt);
  }

  fx.updateReal(dt);
  ui.update(dt);
  render.draw(dt);
}

function report(err) {
  const key = String(err && err.message);
  if (reported.has(key)) return;
  reported.add(key);
  console.error('[Soulgate] Karede hata:', err);
  emit(EV.TOAST, STRINGS.errors.frame, 'warn');
}

/* --------------------------------------------------------------------------
 * 5. ÇEVRİMDIŞI (service worker)
 *  Yalnızca gerçek bir sitede (https) kurulur. Yerel önizlemede (Spck,
 *  localhost, ev ağı) kurulmaz ki düzenlediğin dosyalar hep taze yüklensin.
 *  Test için adresin sonuna ?sw ekleyerek zorlanabilir.
 * ------------------------------------------------------------------------ */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const forced = new URLSearchParams(location.search).has('sw');
  const local = /^(localhost|127\.|10\.|192\.168\.|\[::1\])/.test(location.hostname) || location.hostname.endsWith('.local');
  if (!forced && (location.protocol !== 'https:' || local)) return;
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('[Soulgate] Çevrimdışı mod kurulamadı:', err));
}

boot();
