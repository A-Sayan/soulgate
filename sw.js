/* ==========================================================================
 *  SOULGATE — sw.js (service worker)
 *  Sorumluluk : Oyunu çevrimdışı oynanabilir kılmak.
 *
 *  STRATEJİ
 *   Oyun dosyaları → önce ağ, olmazsa önbellek. İnternet varken hep en
 *   güncel sürüm yüklenir (güncelleme sorunu yaşanmaz); yoksa son çalışan
 *   sürüm açılır.
 *   Yazı tipleri (Cinzel/Inter) oyunla birlikte gelir (fonts/), diğer
 *   dosyalar gibi önbelleğe alınır; dışarıdan hiçbir şey yüklenmez.
 *
 *  Dosya listesi değişirse VERSION artırılır.
 * ========================================================================== */

const VERSION = 'soulgate-v7';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './LICENSE',
  './fonts/fonts.css',
  './fonts/cinzel.woff',
  './fonts/inter-400.woff',
  './fonts/inter-500.woff',
  './fonts/inter-600.woff',
  './fonts/inter-700.woff',
  './icons/icon.svg',
  './icons/logo.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './js/main.js',
  './js/i18n.js',
  './js/icons.js',
  './js/meta.js',
  './js/lang/tr.js',
  './js/lang/en.js',
  './js/content/towers.js',
  './js/content/enemies.js',
  './js/content/chapters.js',
  './js/config.js',
  './js/utils.js',
  './js/events.js',
  './js/state.js',
  './js/save.js',
  './js/audio.js',
  './js/particles.js',
  './js/art/kit.js',
  './js/art/towers.js',
  './js/art/enemies.js',
  './js/art/maps.js',
  './js/sprites.js',
  './js/game.js',
  './js/render.js',
  './js/input.js',
  './js/modal.js',
  './js/tips.js',
  './js/ui.js',
  './js/menu.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return new Response('Çevrimdışı: bu dosya önbellekte yok.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
