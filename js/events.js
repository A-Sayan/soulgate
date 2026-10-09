/* ==========================================================================
 *  SOULGATE — events.js
 *  Sorumluluk : Modüllerin birbirini import etmeden haberleştiği olay yolu
 *               ve tüm olayların sözleşmesi (adı + argümanları).
 *  Bağımlılık : YOK.
 *
 *  KATMAN KURALI
 *   Bir modül yalnızca kendinden ALT katmandakileri import eder:
 *     0  temel: utils · events · lang/* → i18n → config
 *        (saf veri ve yardımcılar; kendi içinde ok yönünde import eder)
 *     1  state · save · audio
 *     2  particles · sprites
 *     3  game
 *     4  render · input · modal
 *     5  ui · menu
 *     6  main
 *   Aşağı yön  → doğrudan fonksiyon çağrısı (ui → game.build(...)).
 *   Yukarı yön → olay (game "düşman öldü" der; ses, efekt, arayüz dinler).
 *   Aynı katman → olay (ui ↔ menu).
 *   Böylece döngüsel import yapısal olarak imkânsızdır.
 *
 *  PERFORMANS
 *   Olaylar nesne değil, sıralı argüman taşır: emit(EV.HIT, düşman, 24, true).
 *   Saniyede yüzlerce vuruşta bile bellek ayrılmaz. Dinleyici listeleri
 *   yalnızca on/off'ta kopyalanır; emit sırasında kopya yapılmaz.
 * ========================================================================== */

/* --------------------------------------------------------------------------
 * OLAY SÖZLEŞMESİ
 *  Biçim: AD: 'kanal:olay', // (argümanlar) — kim yayar → kim dinler
 * ------------------------------------------------------------------------ */
export const EV = Object.freeze({
  /* — Uygulama ve sahne — */
  SCENE: 'app:scene',             // (sahne, önceki) — menu/main → audio, ui, render
  VISIBILITY: 'app:visibility',   // (gizliMi) — main → audio, save, menu
  SETTINGS: 'app:settings',       // (anahtar, değer) — menu → audio, render, particles; 'lang' → ui, menu, main
  SAVE_ERROR: 'app:saveError',    // (neden: 'quota'|'blocked'|'corrupt') — save → ui

  /* — Oyun akışı — */
  RUN_START: 'run:start',         // (kayıttanMı, bölümKimliği) — game → herkes (efektleri sıfırla; ses bölüm müziğini seçer)
  RUN_END: 'run:end',             // (zaferMi, istatistik) — game → menu, audio
  SAVEPOINT: 'run:savepoint',     // () — game → main (sahne temiz, kaydet)
  PAUSE: 'run:pause',             // (duraklatıldıMı) — ui/menu/main → audio, ui
  SPEED: 'run:speed',             // (hız) — ui → audio
  SOULS: 'run:souls',             // (ruh, fark) — game → ui
  LIVES: 'run:lives',             // (can, fark) — game → ui, particles, audio

  /* — Dalgalar — */
  WAVE_PREP: 'wave:prep',         // (sıradakiNo, geriSayımSn | null) — game → ui, audio
  WAVE_START: 'wave:start',       // (dalgaNo, erkenBonus) — game → ui, audio
  WAVE_SPAWNED: 'wave:spawned',   // (dalgaNo) — game → ui (tüm düşmanlar doğdu)
  WAVE_CLEAR: 'wave:clear',       // (dalgaNo, bonus) — game → ui, audio

  /* — Kalıcı ilerleme (çarşı) — */
  PROFILE: 'meta:profile',        // () — meta → main (kaydet), menu, ui
  PURCHASE: 'meta:purchase',      // (tür: 'tower'|'skill'|'castle'|'side'|'repair', kimlik) — meta → audio, particles

  /* — Kuleler — */
  BUILD: 'tower:build',           // (kule) — game → particles, audio, ui
  UPGRADE: 'tower:upgrade',       // (kule) — game → particles, audio, ui
  SELL: 'tower:sell',             // (kule, iade) — game → particles, audio, ui
  FIRE: 'tower:fire',             // (kule, hedef) — game → audio, particles (ana kulenin atışı: kule.castle = true)
                                  //   Kristal Prizma ışın sürdükçe ~0,6 sn'de bir yayar (uğultu için)
  SILENCE: 'tower:silence',       // (kule, süre) — game → particles, ui, audio. Tür: kule.silenceKind
                                  //   'fire' | 'frost' | 'void' | 'web' | 'hex' | 'gas'
  GENERATE: 'tower:generate',     // (kule, miktar, tür: 'souls'|'interest'|'mend') — game → particles, audio
                                  //   Ruh Kuyusu ruh üretti / faiz verdi / kaleye can verdi

  /* — Düşmanlar — */
  SPAWN: 'enemy:spawn',           // (düşman) — game → particles
  HIT: 'enemy:hit',               // (düşman, miktar, kritikMi, hasarTipi, süreliMi) — game → particles, audio
                                  //   süreliMi: zehir/yanma tiki ise true (ses çalmaz, sayılar birleşir)
  KILL: 'enemy:kill',             // (düşman, ruh) — game → particles, audio
  LEAK: 'enemy:leak',             // (düşman, kaybedilenCan) — game → particles, audio
  PHASE: 'enemy:phase',           // (düşman, girdiMi) — game → particles, audio
  HEAL: 'enemy:heal',             // (şifacı, yarıçap) — game → particles, audio
  STATUS: 'enemy:status',         // (düşman, tür) — game → particles, audio
                                  //   tür: 'freeze' | 'stun' | 'evade' (ıskaladı) | 'execute' (infaz) |
                                  //        'enrage' (öfkelendi) | 'stop' (zaman durdu) | 'warded' (kalkan aldı)
  ABILITY: 'enemy:ability',       // (düşman, tür, x, y, değer) — game → particles, audio
                                  //   tür: 'ward' (değer: yarıçap) | 'cleanse' (yarıçap) | 'blink' (x,y: eski yer) |
                                  //        'web' (değer: kule) | 'deathblast' (yarıçap) | 'harden' | 'hex' (değer: kule sayısı) |
                                  //        'blizzard' (değer: süre) | 'rebirth' (yarıçap)

  /* — Boss — */
  BOSS_SPAWN: 'boss:spawn',       // (boss) — game → ui, audio, particles
  BOSS_PHASE: 'boss:phase',       // (boss, evreNo) — game → ui, audio, particles
  BOSS_ABILITY: 'boss:ability',   // (boss, tür: 'summon'|'scorch'|'stomp'|'voidburst', x, y, yarıçap) — game → particles, audio
                                  //   scorch: alev (Kül Ejderi, Anka), stomp: buz (Buzul Devi), voidburst: boşluk
  BOSS_DIE: 'boss:die',           // (boss) — game → ui, audio, particles

  /* — Yetenekler (yan kuleler) — */
  SKILL: 'run:skill',             // (kimlik, evre: 'cast'|'hit'|'impact'|'tick', x, y, değer) — game → particles, audio, ui

  /* — Görsel efekt istekleri — */
  IMPACT: 'fx:impact',            // (x, y, yarıçap, tür) — game → particles, audio
  BOLT: 'fx:bolt',                // (x1, y1, x2, y2, sekmeNo) — game → particles

  /* — Girdi (dünya koordinatı = hücre birimi) — */
  TAP: 'input:tap',               // (sütun, satır, x, y) — input → ui
  DRAG: 'input:drag',             // (sütun, satır, x, y) — input → ui
  DRAG_END: 'input:dragEnd',      // (sütun, satır, x, y) — input → ui
  BACK: 'input:back',             // () — input/main → menu (Android geri tuşu, Esc)
  CANCEL: 'input:cancel',         // () — input → ui (farenin sağ tuşu: kurulumu, hedeflemeyi ya da paneli kapat; asla duraklatmaz)
  HOTKEY: 'input:hotkey',         // (eylem, ek) — input → ui (yalnızca oyun sahnesinde). eylem:
                                  //   'tower' (ek: bardaki sıra 0–5) | 'wave' | 'speed' |
                                  //   'skill' (ek: 'left'|'right') | 'upgrade' | 'sell'

  /* — Arayüz — */
  TOAST: 'ui:toast',              // (metin, ton: 'info'|'warn'|'good') — herkes → ui
  OPEN: 'ui:open',                // ('pause'|'settings') ya da ('info', tür: 'tower'|'enemy'|'skill', kimlik) — ui → menu
});

const KNOWN = new Set(Object.values(EV));
const warned = new Set();

function checkName(type) {
  if (KNOWN.has(type) || warned.has(type)) return;
  warned.add(type);
  console.warn(`[events] Sözleşmede olmayan olay: "${type}" — yazım hatası olabilir.`);
}

/* --------------------------------------------------------------------------
 * OLAY YOLU
 * ------------------------------------------------------------------------ */
const listeners = new Map(); // ad → dinleyici dizisi (değişmez kopya)

/**
 * Dinleyici ekler.
 * @returns {() => void} çağrıldığında dinleyiciyi kaldıran fonksiyon
 */
export function on(type, fn) {
  checkName(type);
  const list = listeners.get(type);
  listeners.set(type, list ? [...list, fn] : [fn]);
  return () => off(type, fn);
}

/** Dinleyiciyi kaldırır. Emit sırasında güvenle çağrılabilir. */
export function off(type, fn) {
  const list = listeners.get(type);
  if (!list) return;
  const next = list.filter((f) => f !== fn);
  if (next.length > 0) listeners.set(type, next);
  else listeners.delete(type);
}

/** Yalnızca bir kez tetiklenen dinleyici ekler. */
export function once(type, fn) {
  const remove = on(type, (a, b, c, d, e) => {
    remove();
    fn(a, b, c, d, e);
  });
  return remove;
}

/**
 * Olay yayar. En fazla beş sıralı argüman taşır (bkz. EV sözleşmesi).
 * Bir dinleyicinin hatası diğerlerini ve oyun döngüsünü durdurmaz.
 */
export function emit(type, a, b, c, d, e) {
  const list = listeners.get(type);
  if (list === undefined) {
    checkName(type);
    return;
  }
  for (let i = 0; i < list.length; i++) {
    try {
      list[i](a, b, c, d, e);
    } catch (err) {
      console.error(`[events] "${type}" dinleyicisinde hata:`, err);
    }
  }
}
