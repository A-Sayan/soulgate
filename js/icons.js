/* ==========================================================================
 *  SOULGATE — icons.js
 *  Sorumluluk : Arayüzde kullanılan küçük satır içi SVG simgeleri.
 *  Bağımlılık : YOK (saf veri). Dosya yok, çevrimdışı çalışır.
 *  Renkler style.css'ten gelir (.ico-soul, .ico-coin, .i-line, .i-hi).
 * ========================================================================== */

export const ICON = Object.freeze({
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.2 0 3.6 1.2 4.3 2.4.7-1.2 2.1-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>',
  soul: '<svg class="ico-soul" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c3.6 3.2 6.5 6.6 6.5 10.6a6.5 6.5 0 0 1-13 0c0-2.6 1.3-4.6 3.2-6.4.2 2 .9 3.2 2.1 3.9-.3-3 .2-5.5 1.2-8.1z"/><path class="i-hi" d="M12 20.2a3 3 0 0 1-3-3c0-1.5.8-2.6 1.9-3.6.2 1.3.8 2 1.6 2.4.5-1 .9-2 .8-3.3 1 1 1.7 2.2 1.7 4.5a3 3 0 0 1-3 3z"/></svg>',
  coin: '<svg class="ico-coin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path class="i-hi" d="M12 6.5v11M9 9.2c0-1.2 1.3-2 3-2s3 .8 3 2-1.3 1.8-3 2.3-3 1.1-3 2.4 1.3 2 3 2 3-.8 3-2"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path class="i-line" d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  swords: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-line" d="M5 5l9.5 9.5M19 5l-9.5 9.5M12.5 16.5l2 2M11.5 16.5l-2 2M7 17l-2 2M17 17l2 2"/></svg>',
  skull: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C7 3 4 6.5 4 10.5c0 2.5 1.2 4.3 3 5.3V19h2v-2h2v2h2v-2h2v2h2v-3.2c1.8-1 3-2.8 3-5.3C20 6.5 17 3 12 3zM9 13a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm6 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>',
  log: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 8h12a4 4 0 0 1 0 8h-12a4 4 0 0 1 0-8z"/><ellipse class="i-hi" cx="17.5" cy="12" rx="2.2" ry="3.2"/><path class="i-line" d="M5 10.5h8M6 13.5h7"/></svg>',
  meteor: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-line" d="M3.5 20.5l7-7M3 15.5l5-5M8.5 21l5-5"/><circle cx="15.5" cy="8.5" r="5"/><circle class="i-hi" cx="14" cy="7" r="1.8"/></svg>',
  frost: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-line" d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6M9.5 4l2.5 2.5L14.5 4M9.5 20l2.5-2.5 2.5 2.5M4.5 10.5l3.4.9-1 3.4M19.5 13.5l-3.4-.9 1-3.4"/></svg>',
  keep: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V9h2V6h2v3h2V6h2v3h2V6h2v3h2v12h-5v-4a2 2 0 0 0-4 0v4z"/></svg>',
  walls: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 20.5v-10h3v2.5h3v-2.5h3v2.5h3v-2.5h3v2.5h3v-2.5h1.5v10z"/><path class="i-hi" d="M5 16.5h4M12 16.5h4M8.5 19h4"/></svg>',
  ballista: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-line" d="M3.5 12h15M14 5.5c3.6 1.6 3.6 11.4 0 13M18.5 9.5L21 12l-2.5 2.5M6 9.5v5"/></svg>',
  treasury: '<svg class="ico-soul" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c3.6 3.2 6.5 6.6 6.5 10.6a6.5 6.5 0 0 1-13 0c0-2.6 1.3-4.6 3.2-6.4.2 2 .9 3.2 2.1 3.9-.3-3 .2-5.5 1.2-8.1z"/><path class="i-hi" d="M12 20.2a3 3 0 0 1-3-3c0-1.5.8-2.6 1.9-3.6.2 1.3.8 2 1.6 2.4.5-1 .9-2 .8-3.3 1 1 1.7 2.2 1.7 4.5a3 3 0 0 1-3 3z"/></svg>',
  // ---- bölümlerle açılan beceriler ----
  thunder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 1.8L4.6 13.4h5.8L8.6 22.2l10.2-12.6h-6z"/><path class="i-hi" d="M12.2 5.4l-3.9 5h2.6z"/></svg>',
  timestop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 2.5h13v2h-1.3c0 3.2-2.2 5.3-3.9 7.5 1.7 2.2 3.9 4.3 3.9 7.5h1.3v2h-13v-2h1.3c0-3.2 2.2-5.3 3.9-7.5C9 9.8 6.8 7.7 6.8 4.5H5.5z"/><path class="i-hi" d="M9 19.4h6c-.4-1.7-1.6-2.8-3-3.9-1.4 1.1-2.6 2.2-3 3.9zM9.4 6.2h5.2c-.5 1.2-1.4 2.1-2.6 3.1-1.2-1-2.1-1.9-2.6-3.1z"/></svg>',
  plague: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.8 17.5a4.3 4.3 0 0 1-.4-8.6 5.8 5.8 0 0 1 11.1-1 4.8 4.8 0 0 1-.3 9.6z"/><circle class="i-hi" cx="9.4" cy="12.6" r="1.5"/><circle class="i-hi" cx="13.8" cy="10.6" r="1.1"/><circle class="i-hi" cx="15" cy="14.4" r="1.3"/><path d="M8.5 19.2a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zM15.2 19.6a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8z"/></svg>',
  mend: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.2 0 3.6 1.2 4.3 2.4.7-1.2 2.1-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/><path class="i-hi" d="M10.8 8.4h2.4v2.7h2.7v2.4h-2.7v2.7h-2.4v-2.7H8.1v-2.4h2.7z"/></svg>',
  vortex: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-line" d="M12 12a1.6 1.6 0 0 1 3.2 0 3.2 3.2 0 0 1-6.4 0 4.8 4.8 0 0 1 9.6 0 6.4 6.4 0 0 1-12.8 0"/></svg>',
  reaper: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-line" d="M16.2 2.8c-1 6.8-2.6 12.6-6.4 18.7M10.2 13.4l3.6 1.3"/><path d="M16.4 3.4C10.6 1.2 4.4 3.7 1.6 11.2 4.8 7.6 9.2 6.2 15.6 7.2z"/><path class="i-hi" d="M12.6 4.2c-3.4-.3-6.6 1.3-8.6 4.2 2.4-1.6 5-2.4 8.2-2.4z"/></svg>',
  // ---- kale geliştirmeleri (bölüm güncellemesi) ----
  watch: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1.8 12S5.6 5.3 12 5.3 22.2 12 22.2 12 18.4 18.7 12 18.7 1.8 12 1.8 12z"/><circle class="i-hi" cx="12" cy="12" r="3.6"/><circle cx="12" cy="12" r="1.5"/></svg>',
  runes: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M7.2 2.5h9.6l2.4 9.5-2.4 9.5H7.2L4.8 12zM10.9 6.5v4.4L8.6 8.8 7.3 10.3l3.6 3.2v4h2.2v-4l3.6-3.2-1.3-1.5-2.3 2.1V6.5z"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-line" d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  // otomatik dalga: kendi üstüne dönen ok
  auto: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-line" d="M4.5 11.5a7.5 7.5 0 0 1 13-4.6l1.8 2M19.5 12.5a7.5 7.5 0 0 1-13 4.6l-1.8-2M19.6 4.2v5h-5M4.4 19.8v-5h5"/></svg>',
  // bilgi: keşif kartı ve bilgi ekranı
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="i-line" cx="12" cy="12" r="9"/><path class="i-line" d="M12 11v6"/><circle cx="12" cy="7.6" r="1.4"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-line" d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
  // tam ekran: dışa açılan köşeler / pencereye dönüş: içe kapanan köşeler
  fullscreen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-line" d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>',
  windowed: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-line" d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/></svg>',
  // ---- bölüm tehditleri (content/chapters.js → threats; renk style.css .threat) ----
  t_armor: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l7.5 3v6c0 4.6-3.2 8.4-7.5 10-4.3-1.6-7.5-5.4-7.5-10v-6z"/><path class="i-hi" d="M12 5.4v13.4"/></svg>',
  t_resist: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="i-line" cx="12" cy="12" r="8.5"/><path d="M12 6.5l1.6 3.9 4.2.3-3.2 2.7 1 4.1-3.6-2.2-3.6 2.2 1-4.1-3.2-2.7 4.2-.3z"/></svg>',
  t_regen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.2 0 3.6 1.2 4.3 2.4.7-1.2 2.1-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/><path class="i-hi" d="M12 9v6M9 12h6"/></svg>',
  t_air: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 13c-1.6-3.4-4.6-5.6-9.5-6 1.4 4.4 4 7.6 9.5 9.5 5.5-1.9 8.1-5.1 9.5-9.5-4.9.4-7.9 2.6-9.5 6z"/><circle cx="12" cy="9.5" r="1.8"/></svg>',
  t_fast: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-line" d="M4 6l6 6-6 6M12 6l6 6-6 6"/></svg>',
  t_split: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4.2"/><circle cx="6" cy="17.5" r="2.6"/><circle cx="12" cy="18.8" r="2"/><circle cx="18" cy="17.5" r="2.6"/></svg>',
  t_phase: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20.5V11a7 7 0 0 1 14 0v9.5l-2.4-1.8-2.3 1.8-2.3-1.8-2.3 1.8-2.3-1.8z"/><circle class="i-hi" cx="9.5" cy="11" r="1.4"/><circle class="i-hi" cx="14.5" cy="11" r="1.4"/></svg>',
  t_fireproof: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c3.6 3.2 6.5 6.6 6.5 10.6a6.5 6.5 0 0 1-13 0c0-2.6 1.3-4.6 3.2-6.4.2 2 .9 3.2 2.1 3.9-.3-3 .2-5.5 1.2-8.1z"/><path class="i-line i-cut" d="M4 4l16 16"/></svg>',
  t_blink: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/><circle cx="18.5" cy="18.5" r="1.6"/><circle cx="5" cy="19.5" r="1.1"/></svg>',
});
