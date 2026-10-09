# Soulgate: Tower Defense — Claude için proje notları

Bu dosya projenin kalıcı hafızasıdır. Yeni bir sohbette önce bunu oku. Bir şey değişince
(sürüm, içerik, yayın düzeni) bu dosyayı da güncelle.

## 1. Kim, ne, nasıl konuşulur

- **Oyun:** Soulgate: Tower Defense. Karanlık fantastik, dikey (portrait), mobil öncelikli kule savunma.
- **Künye:** Yayıncı Sayk Studio · Geliştirici A. Sayan · Yardımcı geliştirici S. Soytürk.
- **Kullanıcı kodcu değil.** Her zaman Türkçe, sade dille konuş. Teknik terim yerine ne değiştiğini ve
  oyuncunun ne göreceğini anlat. Kodu kendisi telefonda Spck Editor ile açar ve önizler.
- **Teslim alışkanlığı:** iş bitince kısa Türkçe özet, değişen dosyaların listesi, gerekiyorsa
  dosyalar (APK, zip) sohbete gönderilir. Uzun teknik anlatı yok.
- **Sürüm:** `js/config.js` → `GAME.version` (şu an **1.1.0**). APK sürümü de buradan okunur.

## 2. Yayın kanalları (hepsi canlı)

| Kanal | Yer | Nasıl güncellenir |
|---|---|---|
| GitHub deposu | `A-Sayan/soulgate` (public), dal `main` | push |
| Tarayıcı sürümü | https://a-sayan.github.io/soulgate/ | `main`'e push → `.github/workflows/pages.yml` kendiliğinden yayımlar |
| APK + web paketi | GitHub Releases (`v1.1.0` yayında) | `.github/workflows/release.yml` (elle tetikleme ya da `v*` etiketi) |
| itch.io | Kullanıcının sayfası (kuruldu) | Kullanıcı elle yükler: Release'teki `Soulgate-x.y.z-web.zip` + `Soulgate-x.y.z.apk` |

**Erişim:** Claude oturumları kullanıcının `m-Salih38` GitHub bağlantısıyla çalışır. `m-Salih38`, `A-Sayan/soulgate`
deposunda yazma yetkili ortak (collaborator); Claude GitHub App, A-Sayan hesabında bu depo için kurulu.
Oturum başında: `add_repo` (owner `A-Sayan`, repo `soulgate`, access `push`) → klonla.
Yönetici ayarlarını (Secrets, Pages, Collaborators) yalnızca depo sahibi A-Sayan değiştirebilir; gerekirse
kullanıcıya adım adım söyle.

**Commit yazarı:** `m-Salih38 <211886623+m-Salih38@users.noreply.github.com>`.

**Bu sandbox'ın ağ sınırları:** npm, PyPI, Maven, Google (dl.google.com), Gradle dağıtımları, Google Fonts ve
`*.github.io` erişilemez. GitHub git, API (yalnızca depoya bağlı uç noktalar: `gh api repos/A-Sayan/soulgate/...`)
ve Release dosyası indirme çalışır. Bu yüzden **APK yerelde derlenmez, GitHub Actions derler.**

## 3. Yeni sürüm çıkarma (sırayla)

1. Değişiklik + testler (bölüm 8).
2. `js/config.js` → `GAME.version` artır (semver). Android `versionCode = a*10000 + b*100 + c` kendiliğinden hesaplanır.
   **Sürüm artırılmadan Release tetikleme** (aynı etiket zaten var).
3. `.github/release-notes.md` güncelle (TR + EN, dosya adlarındaki sürüm).
4. `sw.js`: oyun dosyası eklendi/silindiyse `ASSETS` listesini güncelle ve `VERSION`'ı artır (şu an `soulgate-v5`).
5. Commit + `git push origin main` → Pages kendiliğinden yayımlar.
6. Release'i tetikle:
   `gh api repos/A-Sayan/soulgate/actions/workflows` ile release.yml kimliğini bul →
   `gh api -X POST repos/A-Sayan/soulgate/actions/workflows/<id>/dispatches -f ref=main`.
   Bitmesini bekle (`actions/runs`), başarısızsa `check-runs/<id>/annotations` içindeki "Gradle" hata özetini oku.
7. APK'yı indir: `releases` → asset id → `curl -L -H "Authorization: token $GH_TOKEN" -H "Accept: application/octet-stream"
   https://api.github.com/repos/A-Sayan/soulgate/releases/assets/<id>`. İmza sertifikası SHA-256'sı
   `0D:9B:11:64:68:03:3E:CE:B6:FF:DD:21:86:B3:8B:03:93:F1:07:30:DF:48:94:28:B3:0D:1C:AB:06:48:3A:4F` olmalı.
   APK'yı ve itch için web zip'ini kullanıcıya gönder.

**İmza anahtarı:** Actions secret `SOULGATE_SIGNING` = `parola:base64(PKCS12 anahtar deposu)`, alias `soulgate`.
Yedeği kullanıcıda (`imza-anahtari.txt`). Depoya ASLA girmez. Anahtar değişirse telefonlardaki kurulum
güncellenemez ve oyuncunun ilerlemesi silinir.

## 4. Değişmez kurallar

- Saf ES modülleri + canvas. Derleme adımı yok, harici kütüphane yok, ağ isteği yok (tamamen çevrimdışı).
  Yazı tipleri `fonts/` içinde (Cinzel değişken + Inter 400/500/600/700, WOFF, OFL). Google Fonts kullanılmaz.
- **Döngüsel import yok.** Katman sırası aşağıda; yukarı ya da aynı katmana haber `events.js` ile gider.
- Mobil öncelikli, 60 FPS hedefi, bol "juice" (sarsıntı, parçacık, hit-pause, sayılar).
- Ses tamamen sentez (Web Audio), ses dosyası yok. Her bölümün kendi müziği (`audio.js` → `setTune`).
- Onay için yalnızca özel pencere (`modal.js`). `alert/confirm/prompt` yok.
- Ayarlar ve kayıtlar anında uygulanır/yazılır.
- TODO ya da yarım özellik bırakılmaz.
- Bir modül değişecekse yalnızca o modül ve ona doğrudan bağlı olanlar değişir.
- İki dil: her metin `js/lang/tr.js` ve `js/lang/en.js` içinde. `missingKeys('en')` ve `missingKeys('tr')` boş olmalı.
  Metinler `i18n.js` canlı alanlarıyla (`live`, `liveField`, `section`) bağlanır; dil değişince anında güncellenir.
- Kayıt: localStorage öneki `'sonkale.'` (oyunun eski adı). **Değiştirme**, oyuncu kayıtları kaybolur.
  Anahtarlar `settings/run/records/profile`, zarf `{v, t, d}`, `SAVE.version = 1`.
- Android kökeni `https://appassets.androidplatform.net` (`MainActivity.HOST`). **Değiştirme**, aynı sebep.
- Kod yorumları Türkçe. Her dosyanın başında "Sorumluluk / Bağımlılık" başlığı.

## 5. Mimari

Katmanlar (alttan üste; bir modül yalnızca alt katmanları import eder):

```
0  utils, events, lang/tr|en → i18n → content/towers|enemies|chapters → config, icons
1  state, save, audio
2  particles, sprites (+ art/kit, art/towers, art/enemies, art/maps), meta
3  game
4  render, input, modal
5  ui, menu
6  main
```

| Dosya | Sorumluluk |
|---|---|
| `js/content/towers.js` | 12 kulenin verisi (`TOWER_DEFS`, `TOWER_ORDER`, `TOWER_STAT_DEFAULTS`) |
| `js/content/enemies.js` | 39 düşman (`ENEMY_DEFS`, `ENEMY_DEFAULTS`) |
| `js/content/chapters.js` | 5 bölüm: yollar, kale yeri, süsler, tema, müzik, vitrin, 30'ar dalga |
| `js/config.js` | Her şeyin birleştiği ayar: `MAPS`, `TOWERS`, `ENEMIES`, `SKILLS`, `CASTLE`, `META`, `DIFFICULTIES`, `SCALING`, `WAVE_RULES`, `SAVE`, `GAME` |
| `js/state.js` | Oyun durumu, harita kurma (`createMap`), koşu (`newRun`), kayıt biçimi, rekorlar, profil |
| `js/meta.js` | Altın, çarşı, bölüm açılma ve yıldızlar, kule seçimi (loadout), kale istatistikleri, ödül |
| `js/game.js` | Bütün oyun kuralları: dalgalar, düşman yetenekleri, kuleler, mermiler, beceriler, hasar |
| `js/art/*.js` | Önceden çizilen sprite'lar (kule, düşman, harita/tema), `art/kit.js` çizim araçları |
| `js/sprites.js` | Sprite önbelleği, harita katmanı, küçük resimler (`mapThumb`), ikonlar |
| `js/render.js` | Canvas çizimi, menü sahnesi, efektler, atmosfer |
| `js/particles.js` | Parçacıklar ve olay efektleri |
| `js/audio.js` | Sentez sesler ve müzik |
| `js/ui.js` | Oyun içi arayüz (HUD, kule barı, paneller, keşif kartları, beceri küreleri) |
| `js/menu.js` | Menüler: ana, bölümler, zorluk + kule seçimi, çarşı, rehber, bilgi, ayarlar, hakkında, sonuç |
| `js/main.js` | Açılış, sabit adımlı döngü, geri tuşu, görünürlük, wake lock, service worker |
| `sw.js` | Çevrimdışı önbellek (önce ağ). Yerel önizlemede kurulmaz |
| `android/` | WebView kabuğu (bölüm 7) |

**Önemli mekanikler**

- Döngü sabit adım `1/60`; hız `[1, 2, 3, 0]` adım sayısını çarpar.
- Çok yollu haritalar: `map.polys`; düşmanda `e.path` (yol) ve `e.rem` (kalan mesafe); "first" hedefleme `-rem`.
  Grup yolu `-1` ise iki yol arasında sırayla dağıtılır (`laneFor`).
- Dalga grubu `g(type, count, gap, at, path, echo)`. `echo > 0`: önceki bölümün patronunun "yankısı"
  (can × echo, kaleye ulaşırsa `WAVE_RULES.echoLives` = 10 can, `echoSouls` = 320 ruh). 10. dalgalarda kullanılır.
- Hasar: çarpan = (1 + lanet artışı) × kırılganlık × (fiziksel ise sertleşme); savunma = zırh/direnç ×
  (1 − max(lanet aşındırma, erime)) × (1 − delme), en çok 0.9. Önce buz kalkanı (ward) emer.
- Savaş Çanı güçlendirmesi `applyTowerAuras` (`t.bRate/bDmg/bRange`) + `liveStats(t)`.
- Bölüm çarpanları: can 1 / 1.05 / 1.1 / 1.25 / 1.2, ödül 1 / 1.25 / 1.5 / 1.75 / 2.
- Zorluk: easy (30 can, 250 ruh, can ×0.78, altın ×0.7), normal (20, 200, ×1.0, ×1.0), hard (12, 180, ×1.18, ×1.6).
- Açılma: bölüm n+1, bölüm n herhangi bir zorlukta kazanılınca açılır. Kazanılan her zorluk bir yıldız (toplam 15).
  Çarşı ürünleri bölümün `unlocks` listesiyle açılır. Rekorlar bölüm × zorluk bazında; eski biçimden geçiş var.
- Savaştan önce en çok 6 kule seçilir (`LOADOUT_SIZE`).

## 6. İçerik (1.1.0)

**Bölümler** (her biri 30 dalga; 10/20/30 patron):
1. `kul-vadisi` Kül Vadisi (tek yol). 2. `ayaz-gecidi` Ayaz Geçidi (açar: lance, prism, thunder, timestop).
3. `kara-bataklik` Kara Bataklık (iki kapı; açar: flame, well, plague, mend).
4. `kor-ocaklari` Kor Ocakları (açar: hunter, bell, vortex, reaper). 5. `bosluk-tahti` Boşluk Tahtı (iki kapı).

**Kuleler (12):** archer Okçu Kulesi, mortar Ateş Havanı (başlangıçta açık), frost Ayaz Obeliski 150,
poison Veba Kazanı 260, tesla Fırtına Kulesi 420, curse Lanet Totemi 560, lance Mızrak Atar 380,
prism Kristal Prizma 520, flame Ejder Ağzı 450, hunter Kara Avcı 560, bell Savaş Çanı 700 (destek),
well Ruh Kuyusu 600 (ekonomi). Rakamlar çarşı altın fiyatı. Her kulede 3 seviye + 2 ustalıktan biri.

**Beceriler (9, yan kulelere takılır):** log Yuvarlanan Tomruk, meteor Kızıl Meteor, frost Ayaz Nefesi,
thunder Gök Hiddeti, timestop Zaman Mührü, plague Veba Bulutu, mend Kutsal Onarım, vortex Kara Girdap,
reaper Ölüm Tırpanı.

**Kale geliştirmeleri (5):** walls Surlar, ballista Balista, treasury Ruh Sunağı, watch Gözcü Burcu, runes Rün Ocağı.

**Düşmanlar (28 + 11 patron):** ghoul, wolf, knight, wraith, bat, shaman, brute, brood, larva, skeleton,
frostwolf, raven, golem, shardling, witch, slime, slimelet, bloater, lurker, troll, imp, drummer, molten,
wyvern, voidwalker, spider, revenant, oracle.
Patronlar: boss_bone Kemik Lordu, boss_dragon Kül Ejderi, boss_king Gece Hükümdarı, boss_yeti Buzul Devi,
boss_queen Kış Kraliçesi, boss_rotmother Çürük Ana, boss_hydra Kara Hidra, boss_smith Örs Lordu,
boss_phoenix Kül Ankası, boss_herald Boşluk Habercisi, boss_void Kadim Boşluk.

## 7. Android kabuğu (`android/`)

- AGP 8.5.2, Gradle 8.9 (wrapper), compileSdk/targetSdk 34, minSdk 24, Java 17. AndroidX yok, bağımlılık yok.
- Paket `com.saykstudio.soulgate`. İzinler: INTERNET, VIBRATE. Dikey kilit, tam ekran.
- `MainActivity.java`: WebView, `https://appassets.androidplatform.net/` isteklerini `assets/www`'den verir.
  `index.html`'e köprü betiği ekler: `navigator.wakeLock` → ekranı açık tut, `serviceWorker.register` → etkisiz.
  Geri tuşu: `webView.canGoBack()` ise `goBack()` (oyunun history geri tuşu tuzağı), değilse çıkış.
  `textZoom` 100. Dış bağlantılar telefonun tarayıcısında açılır.
- Gradle görevi `copyWebAssets` her derlemede `index.html, style.css, manifest.webmanifest, LICENSE, js/**, icons/**, fonts/**`
  dosyalarını `assets/www`'ye kopyalar (sw.js hariç). Release'de lint kapalı.
- Simge: `icons/icon-512.png` (eski) + `icon-512-maskable.png` (uyarlanabilir ön katman), zemin `#090509`.
- Play Store için AAB + targetSdk 35 + edge-to-edge gerekir; **yapılmadı**.

## 8. Test (teslimden önce)

- `for f in js/*.js js/*/*.js; do node --check $f; done`, döngüsel import taraması, iki dilin anahtar eşitliği.
- Tarayıcı testleri: depo kökünde `python3 -m http.server 8765 --bind 127.0.0.1`, sonra `python3 dev/e2e.py all`.
  Konsolda hata olmamalı. Ekran görüntülerine bakarak kontrol et.
- Denge: `node dev/balance.mjs all easy,normal,hard full,mid` (iki kez çalıştır, sonuçlar rastgelelik içerir).
  Ayrıntılar `dev/README.md`.
- Mevcut denge (bot, 1.1.0): tam profil bütün bölümlerde easy+normal kazanır. Hard: 1/2/4 çoğunlukla kazanılır;
  3 ve 5 (en zor bölüm) zorlanır. Orta profil her bölümde easy'yi, ilk bölümlerde normal'i kazanır.
- APK Claude tarafından cihazda çalıştırılamaz. Kullanıcının telefonunda denemesini iste
  (ses, geri tuşu, kapatıp açınca kayıt).

## 9. Açık konular

- 1.1.0 APK'sının kullanıcı telefonundaki denemesinin sonucu bekleniyor.
- Sandbox'tan `a-sayan.github.io` açılamaz. Pages'in sağlığı Actions/deployments durumundan okunur.
