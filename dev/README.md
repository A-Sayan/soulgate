# dev/ — geliştirme ve test araçları

Oyuna, APK'ya, web paketine ya da GitHub Pages'e girmez. Hepsi depo kökünden çalıştırılır.

| Araç | Ne yapar | Örnek |
|---|---|---|
| `sim.mjs` | Başsız bot: bir bölümü baştan sona oynar (Node, tarayıcısız) | `node dev/sim.mjs ayaz-gecidi normal full` |
| `balance.mjs` | Denge tablosu: bölüm × zorluk × profil (full/mid/start) × plan | `node dev/balance.mjs all easy,normal,hard full,mid` |
| `plans.mjs` | Botun kule planları (classic, pierce, burn, mixed) | — |
| `leak.mjs` | Tek koşu; hangi dalgada hangi düşman kaleye ulaştı (boss'ta kalan can %) | `node dev/leak.mjs bosluk-tahti normal full classic` |
| `towercmp.mjs` | Her kuleyi ağırlıklı planla karşılaştırır | `node dev/towercmp.mjs kara-bataklik hard` |
| `e2e.py` | Gerçek index.html, telefon boyutu: menü, çarşı, kule seçimi, her bölüm, boss dalgası | `python3 dev/e2e.py all` |
| `e2e2.py` | Zafer + bölüm açılışı, rehber, bilgi ekranları, paneller, yetenek küreleri | `python3 dev/e2e2.py` |
| `shots.py` | Mağaza ekran görüntüleri 1080×1920 (+ arayüzsüz "clean-*" sahneler) | `python3 dev/shots.py en` |
| `perf.py` | Kalabalık sahnede kare süresi ve JS süresi | `python3 dev/perf.py kor-ocaklari 28 5000` |
| `shot.py` + `*-sheet.html` | Kule/düşman sprite sayfaları, simge sayfası | `python3 dev/shot.py dev/tower-sheet.html dev/out/towers.png 1200 900` |

`e2e*.py`, `shots.py`, `perf.py` için depo kökünde sunucu açık olmalı:
`python3 -m http.server 8765 --bind 127.0.0.1`

Çıktılar `dev/out/` içine yazılır (depoya girmez). Tarayıcı testlerinde oyunun modüllerine
`page.evaluate("async () => (await import('./js/state.js')).state")` ile erişilir; sayfadaki modüllerin aynısıdır.
