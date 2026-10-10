# Soulgate: Tower Defense — Claude için proje notları

Bu dosya projenin kalıcı hafızasıdır. Yeni bir sohbette önce bunu oku. Bir şey değişince
(sürüm, içerik, yayın düzeni) bu dosyayı da güncelle.

## 1. Kim, ne, nasıl konuşulur

- **Oyun:** Soulgate: Tower Defense. Karanlık fantastik, dikey (portrait), mobil öncelikli kule savunma.
  1.2.0'dan beri bilgisayarda da oynanır (her pencere boyutu, fare + klavye); 1.3.0'dan beri bilgisayar ve yatay
  tablette ayrı, tam ekran "geniş düzen" var (bkz. bölüm 5 "Sahne, geniş düzen ve bilgisayar").
- **Künye:** Yayıncı Sayk Studio · Geliştirici A. Sayan · Yardımcı geliştirici S. Soytürk.
- **Kullanıcı kodcu değil.** Her zaman Türkçe, sade dille konuş. Teknik terim yerine ne değiştiğini ve
  oyuncunun ne göreceğini anlat. Kodu kendisi telefonda Spck Editor ile açar ve önizler.
- **Teslim alışkanlığı:** iş bitince kısa Türkçe özet, değişen dosyaların listesi, gerekiyorsa
  dosyalar (APK, zip) sohbete gönderilir. Uzun teknik anlatı yok.
- **Sürüm:** `js/config.js` → `GAME.version` (şu an **1.4.0**). APK sürümü de buradan okunur.

## 2. Yayın kanalları (hepsi canlı)

| Kanal | Yer | Nasıl güncellenir |
|---|---|---|
| GitHub deposu | `A-Sayan/soulgate` (public), dal `main` | push |
| Tarayıcı sürümü | https://a-sayan.github.io/soulgate/ | `main`'e push → `.github/workflows/pages.yml` kendiliğinden yayımlar |
| APK + web paketi | GitHub Releases (`v1.4.0` yayında) | `.github/workflows/release.yml` (elle tetikleme ya da `v*` etiketi) |
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
4. `sw.js`: oyun dosyası eklendi/silindiyse `ASSETS` listesini güncelle ve `VERSION`'ı artır (şu an `soulgate-v7`).
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
  Inter, ekran için ayarlanmış (hinted) TrueType'tır (Windows'ta keskin); `tools/make-fonts.py` Inter 4.1 paketinin
  `extras/ttf` dosyalarından aynı karakter kümesiyle üretir. Hinting'siz/CFF sürüme geri dönme (Windows'ta pikselli).
- **Döngüsel import yok.** Katman sırası aşağıda; yukarı ya da aynı katmana haber `events.js` ile gider.
- Mobil öncelikli, 60 FPS hedefi, bol "juice" (sarsıntı, parçacık, hit-pause, sayılar).
- Telefonda (dik ekran) görünüm değişmez: geniş düzen kuralları yalnızca `.wide` (html sınıfı) ya da
  `min-aspect-ratio: 7/10`, fare kuralları yalnızca `(hover: hover) and (pointer: fine)` altında. Arayüzde genişlik
  için `vw` değil `var(--stage-w)` kullan. Bilgisayar düzeni telefonla eşit önemdedir: yeni bir ekran ya da panel
  eklerken ikisini de tasarla ve `dev/desktop.py` ile `dev/e2e.py`'yi çalıştır.
- Ses tamamen sentez (Web Audio), ses dosyası yok. Her bölümün kendi müziği (`audio.js` → `setTune`).
  Müzikte sürekli bas uğultusu ve rüzgâr YOK (1.3.0'da kullanıcı isteğiyle kaldırıldı: boğuk, yorucu). Geri ekleme.
- Onay için yalnızca özel pencere (`modal.js`). `alert/confirm/prompt` yok.
- Yeni bir mekanik ya da ekran oyuncuya anlatılmalıysa öğreticiye ipucu ekle (bkz. bölüm 5 "Öğretici"); ipucu oyunu
  durdurmaz, anlattığı iş yapılınca `tips.complete(id)` ile kapanır.
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
4  render, input, modal, tips
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
| `js/tips.js` | Öğretici ipuçları: sıra, kart + halka, olaylara göre tetikleme/kapanma (`TIPS` config'de) |
| `js/ui.js` | Oyun içi arayüz (HUD, kule barı, paneller, keşif kartları, beceri küreleri) |
| `js/menu.js` | Menüler: ana, bölümler, zorluk + kule seçimi, çarşı, rehber, bilgi, ayarlar, hakkında, sonuç |
| `js/main.js` | Açılış, sabit adımlı döngü, geri tuşu, görünürlük, wake lock, service worker |
| `sw.js` | Çevrimdışı önbellek (önce ağ). Yerel önizlemede kurulmaz |
| `android/` | WebView kabuğu (bölüm 7) |

**Sahne, geniş düzen ve bilgisayar (1.2.0 → 1.3.0)**

- Üç düzen: (1) telefon (dik): her şey eskisi gibi. (2) **Geniş düzen** (`html.wide`): `config LAYOUT.wideQuery` =
  en/boy ≥ 5/4, genişlik ≥ 880, yükseklik ≥ 500 (bilgisayar, yatay tablet). `main.js applyLayout()` sınıfı açılışta ve her
  yeniden boyutlanmada koyar. (3) Geniş ama küçük pencere (ör. 800×450, 1000×1200): ortada dikey sahne (`--stage-w`).
  Yatay telefon (yükseklik < 500, dokunmatik) "dik tut" uyarısı alır.
- Geniş düzen, oyun (style.css bölüm 15): `--stage-w: 100vw`, harita ortada ekran boyunca. Solda bilgi kartı (`.hud`:
  can/ruh, dalga, hız/duraklat) ve altında keşif kartları; sağda `.dock` sütunu (2'li ızgarada adlı kuleler `.tower-name`,
  altta OTO ve yatay dalga düğmesi). Kule/ana kule paneli sağ sütunda kulelerin üstünde açılır (`--panel-b` = dalga
  düğmesinin üstü). Patron barı, afiş ve kısa mesajlar iki panelin arasında. `--panel-w` haritanın iki yanında kalan
  yerden hesaplanır (250–340px). Alçak pencerede (≤ 760 / ≤ 580px) panel sıkışır; kule paneli hiçbir boyutta kaydırma
  istememeli (desktop.py denetler).
- `ui.measure()`: geniş düzende inset = hud.sağ / dock.sol (üst-alt 12px), telefonda HUD altı / bar üstü; `--hud-h`,
  `--panel-b` yazar. `render.resize()` haritayı aradaki alana sığdırır. Yetenek küreleri `uiLeft` kadar kaydırılır.
- **Haritanın çevresi** (`art/maps.js buildSurround`, `sprites.surroundLayer`, `render.drawSurround`): haritanın yanlarında
  yer varsa zemin ekranın kenarına kadar uzanır (aynı tema, karartılmış, doğal süsler `NATURAL`, kenarda çukur gölgesi).
  En çok 40px/hücre çözünürlükte, basamaklı boyutla önbelleğe alınır (yeniden boyutlanırken her kare çizilmez).
  `drawGround/drawGroundExtras` artık dikdörtgen + yoğunluk alır; harita katmanının çıktısı birebir aynı kaldı.
- Geniş düzen, menüler (bölüm 16): sayfalar `--sheet-w` (≤ 1240px) genişliğinde. Bölümler büyük harita kartlı ızgara
  (`chapterThumb` geniş düzende 260px çizer); zorluk ekranı ızgara: solda bölüm + zorluklar, sağda kule seçimi, altında
  başlat düğmesi (her sütun kendi içinde kayar); çarşı/rehber ızgara; bilgi ekranı `info-main` / `info-side` iki sütun;
  ayarlar iki sütun (column-count); kartlar (duraklat, sonuç) daha geniş. Telefonda bu sarmalayıcılar `display: contents`.
- Tam ekran (bilgisayar): ana menüde sol üstte `.fs-btn` ve Ayarlar → Görüntü'de satır (`data-act="fullscreen"`,
  `menu.js toggleFullscreen/syncFullscreen`, Fullscreen API). Destek yoksa (Android, izinsiz çerçeve) gizli. `.pc-only` =
  yalnızca fareyle görünen öğe. Tam butonların sınıfı `.menu-btn.block` (`.wide` artık html düzen sınıfı, karıştırma).
- Telefonla eskisini karşılaştırmak için: ekran görüntüleri birebir aynı düzende olmalı (yalnızca yazı tipi pikselleri farklı).
- "Dik tut" uyarısı (index.html) yalnızca dokunmatik telefonda yatayda (`hover: none` + `pointer: coarse`).
- Girdi (`input.js`): farenin sağ tuşu oyun alanında `EV.CANCEL` (kurulum / nişan / panel kapanır, asla duraklatmaz);
  oyun sahnesinde kısayollar `EV.HOTKEY (eylem, ek)`: 1–6 bardaki kule, Boşluk dalga, F hız, Q / E sol / sağ yetenek,
  U yükselt (ustalıkta yok), X / Delete sat (iki basış). Esc / P / Backspace = BACK (değişmedi). Ctrl/Alt/Meta'lı tuşlar
  tarayıcıya bırakılır; Tab ile odağa gelen düğmede Boşluk tarayıcının olur, fareyle tıklanan düğme Boşlukta odaktan çıkar.
  `hoverCell()` farenin altındaki hücre (klavyeyle seçilen kulenin hayaleti orada belirir).
- `ui.js` bölüm 10: kısayol eylemleri ekrandaki düğmeye basar (`pressFx` → `.key-press`). Bardaki kuleye sağ tık = basılı
  tutmak (bilgi ekranı). Fareyle oynanırken ipuçları "tıkla" der (`ui.clickToPlace`, `clickAgain`, `aimClick`, `discover.openClick`).
- Kısayol rozetleri: düğmelerde `data-hotkey` → CSS `::after` (yalnızca fareyle). `data-key` KULLANMA: ayarlarda başka işi var.
  Ayarlarda "Klavye ve Fare" listesi (`menu.js keysGroup`, metinler `settings.keys.*`) yalnızca bilgisayarda görünür.

**Öğretici, tehditler, geri bildirim (1.4.0)**

- `js/tips.js` (katman 4): her ipucu bir kez gösterilir; görülenler `records.tips` (`discover('tip', id)`). Ayar `tips`
  kapalıysa hiçbir şey çıkmaz. Sıra `config TIPS.order` (build, chain, wave, upgrade, speed, auto, discover, skill, boss,
  mastery, loadout, market, equip) + `chapter-<id>` (yeni bölüme ilk giriş, `map.threat` metni; ilk dalga başlayınca kapanır).
  `trigger(id, {target, screen, side})`: hedef CSS seçicisi ya da harita noktası `{wx, wy, wr}`; `screen` verilirse menü
  ipucudur (o ekran açıkken), yoksa oyun ipucu (oyun akarken; duraklatınca gizlenir, sırada bekler). `complete(id)`:
  iş yapıldı (gösterilmemiş olsa da görüldü sayılır). Oyun olaylarını tips.js kendisi dinler (BUILD, WAVE_START,
  WAVE_CLEAR, UPGRADE, SPEED, SKILL, BOSS_SPAWN…); arayüze bağlı olanları ui.js (chain, discover, mastery) ve menu.js
  (market, equip, loadout) tetikler. Kart hedefi örtmez: önce alt/üst, sonra yanlar; OTO/dalga ve ana menüdeki oyna
  düğmelerinin üstüne binmez (`AVOID`); menüde hedef görünmüyorsa sayfa kaydırılır. Ayarlar → Rehberlik
  (`tips`, `discoveries` ve `resetTips`). `discoveries` kapalıysa keşif kartları çıkmaz (düşman yine rehbere girer).
- Kule elde kalır (`ui.js` `chained`): kurduktan sonra aynı kule seçili kalır. Bırakmak: bardaki kuleye yeniden basmak,
  yola/dolu hücreye dokunmak (ruh yetmiyorsa elde kalır), sağ tık, Esc. İlk bırakışta 'chain' ipucu tamamlanır.
- Bölüm tehdidi: `chapters.js` → `threats` (armor, resist, regen, air, fast, split, phase, fireproof, blink) ve dil
  dosyasında `maps.<id>.threat` cümlesi. Etiketler `menu.js threatChips` (simgeler `icons.js t_*`, adlar `threats.*`):
  bölüm kartında ve zorluk ekranında ("Asıl tehdit" kutusu). Tehditler bölümün düşman can paylarına göre seçildi.
- Geri bildirim: `GAME.feedbackUrl` (şimdilik itch.io sayfası). `menu.js feedbackLink`: ana menü alt satırı ve Ayarlar'da
  `<a target=_blank>`; Android'de telefonun tarayıcısında açılır. İleride Play Store / GitHub'a çevirmek için yalnızca URL.
- Esc ve tam ekran: tam ekrana girince `navigator.keyboard.lock(['Escape'])` (Chrome/Edge, yalnızca üst pencerede): Esc
  sayfaya gelir ve duraklatır; çıkmak için Esc basılı tutulur. Kilit yoksa (Firefox/Safari, itch.io'nun kendi tam ekranı)
  tam ekrandan çıkınca oyun duraklar (`menu.js onFullscreenChange`); itch'in çerçeve tam ekranı için `main.js
  pauseOnShrink` (fareli cihazda pencere alanı %20'den çok küçülünce oyun duraklar).

**Önemli mekanikler**

- Döngü sabit adım `1/60`; hız `[1, 2, 3, 0]` adım sayısını çarpar.
- Çok yollu haritalar: `map.polys`; düşmanda `e.path` (yol) ve `e.rem` (kalan mesafe); "first" hedefleme `-rem`.
  Grup yolu `-1` ise iki yol arasında sırayla dağıtılır (`laneFor`).
- Dalga grubu `g(type, count, gap, at, path, echo)`. `echo > 0`: önceki bölümün patronunun "yankısı"
  (can × echo, kaleye ulaşırsa `WAVE_RULES.echoLives` = 10 can, `echoSouls` = 320 ruh). 10. dalgalarda kullanılır.
- Hasar: çarpan = (1 + lanet artışı) × kırılganlık × (fiziksel ise sertleşme); savunma = zırh/direnç ×
  (1 − max(lanet aşındırma, erime)) × (1 − delme), en çok 0.9. Önce buz kalkanı (ward) emer.
- Savaş Çanı güçlendirmesi `applyTowerAuras` (`t.bRate/bDmg/bRange`) + `liveStats(t)`.
- Düşman canı = taban × `SCALING.hp(dalga)` × (patron: `bossHp`, sıradan: `hordeHp` × bölümün `horde`) × zorluk × bölüm `hp`.
  1.2.1 dengesi (kullanıcı: "sıradan düşmanlar kolay, harita dolup her şey en üste çıkıyor; patronlar iyi"):
  `hordeHp` 1.05→1.14 (dalga 1→30), `bossHp` 1→0.88, ruh 10. dalgaya kadar +%4.5/dalga sonra +%3.5,
  dalga bonusu 20 + 4×dalga. Patronların yürüdüğü yol (dev/economy.mjs) eskisiyle aynı tutuldu.
- Bölüm çarpanları: can 1 / 1.05 / 1.1 / 1.25 / 1.2, sıradan düşman (`horde`) 1.08 / 1.04 / 0.97 / 1 / 0.95,
  ruh 1 / 1 / 1 / 1 / 1.12, ödül 1 / 1.25 / 1.5 / 1.75 / 2.
- Zorluk: easy (30 can, 250 ruh, can ×0.78, ruh ×1.08, altın ×0.7), normal (20, 200, ×1.0, ×1.0, ×1.0),
  hard (12, 180, ×1.18, ruh ×1.0, altın ×1.6).
- Açılma: bölüm n+1, bölüm n herhangi bir zorlukta kazanılınca açılır. Kazanılan her zorluk bir yıldız (toplam 15).
  Çarşı ürünleri bölümün `unlocks` listesiyle açılır. Rekorlar bölüm × zorluk bazında; eski biçimden geçiş var.
- Savaştan önce en çok 6 kule seçilir (`LOADOUT_SIZE`).

## 6. İçerik (1.4.0)

**Bölümler** (her biri 30 dalga; 10/20/30 patron):
1. `kul-vadisi` Kül Vadisi (tek yol). 2. `ayaz-gecidi` Ayaz Geçidi (açar: lance, prism, thunder, timestop).
3. `kara-bataklik` Kara Bataklık (iki kapı; açar: flame, well, plague, mend).
4. `kor-ocaklari` Kor Ocakları (açar: hunter, bell, vortex, reaper). 5. `bosluk-tahti` Boşluk Tahtı (iki kapı).
Tehditler: 1 zırh + yenilenme · 2 zırh + hızlı + uçan · 3 yenilenme + bölünen + kaybolan · 4 yanmaz + zırh + uçan ·
5 zırh + büyü direnci + ışınlanan.

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
- Tarayıcı testleri: depo kökünde `python3 -m http.server 8765 --bind 127.0.0.1`, sonra `python3 dev/e2e.py all`
  (telefon) ve `python3 dev/desktop.py` (bilgisayar: 8 pencere boyutu, fare + klavye; "SONUÇ: BAŞARILI" yazmalı).
  Konsolda hata olmamalı. Ekran görüntülerine bakarak kontrol et (desktop.py 9 boyut: geniş, alçak, dev, ultra geniş).
  Ayrıca `python3 dev/e2e2.py` (zafer, rehber, paneller) ve `python3 dev/tips.py` (öğretici sırası, kule elde kalma,
  tehdit etiketleri, geri bildirim, Rehberlik ayarları; bilgisayar + telefon; "SONUÇ: BAŞARILI").
- Denge: `node dev/balance.mjs all easy,normal,hard full,mid` (iki kez çalıştır, sonuçlar rastgelelik içerir);
  yeni oyuncu: `node dev/balance.mjs kul-vadisi,ayaz-gecidi easy,normal,hard start starter`.
  Ekonomi ve patron hissi: `node dev/economy.mjs all easy,normal,hard full classic` (ruh kaynakları, harita doluluğu,
  normal/patron dalgasında can kaybı, patronların yolun yüzde kaçını yürüdüğü). Ayrıntılar `dev/README.md`.
- Mevcut denge (bot, 1.2.1): tam profil her bölümde easy'yi, normal'i çoğunlukla kazanır (3 ve 5 arada kaybeder);
  hard: 1/2/4 çoğunlukla kazanılır, 3 ve 5 zorlanır. Orta profil easy'yi kazanır, normal'de 1. bölümü kazanır,
  sonrasında zorlanır. 1.1.0'a göre: oyun başına ruh ~%10 az, sıradan dalgada kaybedilen can 2-3 kat,
  patronların yürüdüğü yol aynı (±2 puan). Bot zayıf bir oyuncudur (12 kuleyi en üste çıkarmadan yenisini kurmaz).
- APK Claude tarafından cihazda çalıştırılamaz. Kullanıcının telefonunda denemesini iste
  (ses, geri tuşu, kapatıp açınca kayıt).

## 9. Açık konular

- 1.2.1 APK kullanıcının telefonunda denendi: ses açma/kapama, geri tuşu ve diğerleri sorunsuz. 1.4.0'ın denemesi
  bekleniyor (öğretici telefonda, geri bildirim bağlantısının tarayıcıda açılması).
- itch.io gömülü pencere boyutu kullanıcıda; oyun her boyutta açılır, dikey (ör. 540×960) ya da tam ekran düğmesi en iyisi.
- Lisans ekranındaki bir madde (`strings.about.terms`, iki dilde) yazı tiplerinin "Google Fonts'tan yüklendiğini" söylüyor;
  oysa oyunla birlikte geliyorlar. Kullanıcıya söylendi, onayı olmadan değiştirilmedi.
- Cinzel (başlık yazı tipi) değişken ve hinting'siz; bu ortamda ttfautohint yok. Windows'ta küçük Cinzel yazılar hâlâ
  yumuşak görünebilir; geniş düzende küçük Cinzel boyutları büyütüldü.
- Sandbox'tan `a-sayan.github.io` açılamaz. Pages'in sağlığı Actions/deployments durumundan okunur.
