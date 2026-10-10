# dev/ — geliştirme ve test araçları

Oyuna, APK'ya, web paketine ya da GitHub Pages'e girmez. Hepsi depo kökünden çalıştırılır.

| Araç | Ne yapar | Örnek |
|---|---|---|
| `sim.mjs` | Başsız bot: bir bölümü baştan sona oynar (Node, tarayıcısız) | `node dev/sim.mjs ayaz-gecidi normal full` |
| `balance.mjs` | Denge tablosu: bölüm × zorluk × profil (full/mid/start) × plan | `node dev/balance.mjs all easy,normal,hard full,mid` · yeni oyuncu: `node dev/balance.mjs kul-vadisi,ayaz-gecidi easy,normal,hard start starter` |
| `economy.mjs` | Ekonomi: 5'er dalgada kule/yer, doluluk, en üstteki kule sayısı, boştaki ruh; ruhun kaynakları; normal dalga ve patron dalgasında kaybedilen can; patronların yolun yüzde kaçını yürüdüğü | `node dev/economy.mjs all easy,normal full classic` |
| `plans.mjs` | Botun kule planları (classic, pierce, burn, mixed; starter = yalnızca okçu + havan) | — |
| `leak.mjs` | Tek koşu; hangi dalgada hangi düşman kaleye ulaştı (boss'ta kalan can %) | `node dev/leak.mjs bosluk-tahti normal full classic` |
| `towercmp.mjs` | Her kuleyi ağırlıklı planla karşılaştırır | `node dev/towercmp.mjs kara-bataklik hard` |
| `e2e.py` | Gerçek index.html, telefon boyutu: menü, çarşı, kule seçimi, her bölüm, boss dalgası | `python3 dev/e2e.py all` |
| `desktop.py` | Bilgisayar: 8 pencere boyutunda (geniş, alçak, dev) menüler ve oyun, harita sahneye sığıyor mu; fare + klavye kısayolları; telefonda rozet/liste gizli, yatayda "dik tut" uyarısı | `python3 dev/desktop.py` |
| `e2e2.py` | Zafer + bölüm açılışı, rehber, bilgi ekranları, paneller, yetenek küreleri | `python3 dev/e2e2.py` |
| `tips.py` | Öğretici: ilk savaşta ipucu sırası, kule elde kalma, duraklatınca gizlenme, Rehberlik ayarları (ipucu / bilgi kartı / baştan göster), çarşı ve kule seçimi ipuçları, bölüm tehdit etiketleri, geri bildirim bağlantısı; bilgisayar + telefon | `python3 dev/tips.py` |
| `shots.py` | Mağaza ekran görüntüleri 1080×1920 (+ arayüzsüz "clean-*" sahneler) | `python3 dev/shots.py en` |
| `perf.py` | Kalabalık sahnede kare süresi ve JS süresi | `python3 dev/perf.py kor-ocaklari 28 5000` |
| `shot.py` + `*-sheet.html` | Kule/düşman sprite sayfaları, simge sayfası | `python3 dev/shot.py dev/tower-sheet.html dev/out/towers.png 1200 900` |

`e2e*.py`, `desktop.py`, `tips.py`, `shots.py`, `perf.py` için depo kökünde sunucu açık olmalı:
`python3 -m http.server 8765 --bind 127.0.0.1`

Çıktılar `dev/out/` içine yazılır (depoya girmez). Tarayıcı testlerinde oyunun modüllerine
`page.evaluate("async () => (await import('./js/state.js')).state")` ile erişilir; sayfadaki modüllerin aynısıdır.
