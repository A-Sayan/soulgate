"""Öğretici, kule elde kalma, bölüm tehditleri, geri bildirim ve ayarlar testi.

Temiz bir profille (hiç oynamamış oyuncu) gerçek index.html:
  1) Bölüm kartlarında ve zorluk ekranında tehdit etiketleri
  2) İlk savaş: "Kule kur" ipucu → kule kurulunca "Kule elinde" → bırakınca "Dalgayı başlat"
     → dalga başlayınca kapanır; kule elde kalır (peş peşe kurulur), yol dışına tıklayınca bırakılır
  3) Dalgalar ilerleyince "Kuleyi yükselt", "Oyun hızı", "Otomatik dalga"
  4) Duraklatınca oyun ipucu gizlenir, devam edince geri gelir
  5) "Öğreticiyi kapat" → ayar kapanır; Ayarlar → "İpuçlarını baştan göster" → yeniden açılır
  6) Bilgi kartları ayarı kapalıyken yeni düşman kartı çıkmaz
  7) 7. kule alınmış profilde zorluk ekranında "Kule seçimi" ipucu; altın varken ana menüde "Çarşı"
  8) Geri bildirim bağlantıları itch.io sayfasına gider
Bilgisayar (1366×768, fare) ve telefon (390×844, dokunmatik) boyutlarında. Görüntüler dev/out/tips/.
Depo kökünde sunucu açık olmalı: python3 -m http.server 8765 --bind 127.0.0.1
"""
import os
import sys
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'tips')
os.makedirs(OUT, exist_ok=True)
URL = 'http://127.0.0.1:8765/index.html'
errs = []
fails = []


def check(cond, msg):
    if not cond:
        fails.append(msg)
        print('  HATA:', msg)


def tip_id(pg):
    """Görünen ipucunun başlığı (yoksa '')."""
    return pg.evaluate("() => { const c = document.querySelector('.tip-card'); return c && !c.hidden ? c.querySelector('.tip-title').textContent : ''; }")


def wait_tip(pg, ms=1500):
    pg.wait_for_timeout(ms)
    return tip_id(pg)


S = "(await import('./js/state.js')).state"


def run(tag, ctx_kw, mouse):
    print(tag)
    ctx = b.new_context(**ctx_kw)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(f'{tag} PAGEERROR {e}'))
    pg.on('console', lambda m: errs.append(f'{tag} {m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    pg.goto(URL)
    pg.wait_for_timeout(1500)
    pg.evaluate("async () => { const S = await import('./js/state.js'); S.setSetting('lang', 'tr'); }")
    pg.wait_for_timeout(300)

    # 8) geri bildirim
    hrefs = pg.evaluate("() => [...document.querySelectorAll('a[data-act=\"feedback\"]')].map(a => a.href)")
    check(len(hrefs) >= 2 and all('a-sayan.itch.io/soulgate-tower-defense' in h for h in hrefs), f'{tag}: geri bildirim bağlantısı {hrefs}')

    # 1) tehditler
    pg.locator('.screen.active [data-act="new"]').click()
    pg.wait_for_timeout(450)
    n = pg.locator('.screen.active .chapter-card .threat').count()
    check(n >= 10, f'{tag}: bölüm kartlarında tehdit etiketi yok ({n})')
    pg.screenshot(path=f'{OUT}/{tag}-1-chapters.png')
    pg.locator('.screen.active .chapter-card').first.click()
    pg.wait_for_timeout(450)
    check(pg.locator('.screen.active .diff-threat .threat').count() == 2, f'{tag}: zorluk ekranında tehdit yok')
    pg.screenshot(path=f'{OUT}/{tag}-2-difficulty.png')
    pg.locator('.screen.active [data-act="start"]').click()
    pg.wait_for_timeout(600)

    # 2) ilk savaş
    t = wait_tip(pg, 1600)
    check(t == 'Kule kur', f'{tag}: ilk ipucu "Kule kur" olmalı ({t!r})')
    pg.screenshot(path=f'{OUT}/{tag}-3-build.png')
    cells = pg.evaluate(f"""async () => {{ const S = await import('./js/state.js'); const st = S.state; const out = [];
      for (let r = 7; r < st.map.rows && out.length < 3; r++) for (let c = 2; c < st.map.cols && out.length < 3; c++) if (S.isBuildable(c, r)) {{
        const v = st.view; out.push({{ c, r, x: v.ox + (c + 0.5) * v.cell, y: v.oy + (r + 0.5) * v.cell }}); }}
      const pc = st.map.polys[0].segs[3]; const v = st.view;
      out.push({{ path: true, x: v.ox + (pc.x1 + 0.5 * pc.dx) * v.cell, y: v.oy + (pc.y1 + 0.5 * pc.dy) * v.cell }});
      return out; }}""")
    pg.locator('.tower-btn').first.click()
    pg.wait_for_timeout(200)
    for cell in cells[:2]:
        if mouse:
            pg.mouse.move(cell['x'], cell['y'])
            pg.wait_for_timeout(60)
            pg.mouse.click(cell['x'], cell['y'])
        else:
            pg.touchscreen.tap(cell['x'], cell['y'])
            pg.wait_for_timeout(120)
            pg.touchscreen.tap(cell['x'], cell['y'])
        pg.wait_for_timeout(250)
    st = pg.evaluate(f"async () => {{ const st = {S}; return [st.run.towers.length, st.ui.buildType]; }}")
    check(st[0] == 2 and st[1] == 'archer', f'{tag}: kule elde kalmalı, iki kule kurulmalı {st}')
    t = wait_tip(pg, 1200)
    check(t == 'Kule elinde', f'{tag}: "Kule elinde" ipucu ({t!r})')
    pg.screenshot(path=f'{OUT}/{tag}-4-chain.png')
    # yola dokununca / tıklayınca bırakılır
    path = cells[-1]
    if mouse:
        pg.mouse.click(path['x'], path['y'])
    else:
        pg.touchscreen.tap(path['x'], path['y'])
    pg.wait_for_timeout(300)
    bt = pg.evaluate(f"async () => {S}.ui.buildType")
    check(bt is None, f'{tag}: yola dokununca kule bırakılmalı ({bt})')
    t = wait_tip(pg, 1300)
    check(t == 'Dalgayı başlat', f'{tag}: "Dalgayı başlat" ipucu ({t!r})')
    pg.screenshot(path=f'{OUT}/{tag}-5-wave.png')
    # 4) duraklatınca gizlenir
    pg.locator('[data-el="pauseBtn"]').click()
    pg.wait_for_timeout(500)
    check(tip_id(pg) == '', f'{tag}: duraklatmada oyun ipucu görünmemeli')
    pg.locator('.screen.active [data-act="resume"]').click()
    t = wait_tip(pg, 900)
    check(t == 'Dalgayı başlat', f'{tag}: devam edince ipucu geri gelmeli ({t!r})')
    pg.locator('[data-el="waveBtn"]').click()
    pg.wait_for_timeout(400)
    check(tip_id(pg) != 'Dalgayı başlat', f'{tag}: dalga başlayınca ipucu kapanmalı')
    # 3) dalgaları hızla bitir: yükselt, hız, otomatik
    seen = []
    for k in range(4):
        pg.evaluate("""async () => { const G = await import('./js/game.js'); const S = await import('./js/state.js'); const st = S.state;
          st.run.souls = Math.max(st.run.souls, 400); st.run.lives = 20;
          for (let i = 0; i < 4000 && (st.run.enemies.length || st.run.spawners.length); i++) { G.update(1 / 20); st.run.lives = 20; }
          st.run.lives = 20; if (G.canCallWave()) G.callWave(); }""")
        t = wait_tip(pg, 1500)
        if t:
            seen.append(t)
            pg.screenshot(path=f'{OUT}/{tag}-6-{k}.png')
            pg.locator('.tip-ok').click()
            pg.wait_for_timeout(300)
    check('Kuleyi yükselt' in seen and 'Oyun hızı' in seen, f'{tag}: yükselt ve hız ipuçları {seen}')
    # 5) öğreticiyi kapat
    pg.evaluate("async () => { const tips = await import('./js/tips.js'); tips.trigger('boss', { target: '.hud' }); }")
    t = wait_tip(pg, 1200)
    if t:
        pg.locator('.tip-off').click()
        pg.wait_for_timeout(300)
    on = pg.evaluate(f"async () => {S}.settings.tips")
    check(on is False, f'{tag}: "Öğreticiyi kapat" ayarı kapatmalı ({on})')
    # ayarlarda iki düğme ve baştan göster
    pg.locator('[data-el="pauseBtn"]').click()
    pg.wait_for_timeout(400)
    pg.locator('.screen.active [data-act="settings"]').click()
    pg.wait_for_timeout(400)
    check(pg.locator('.screen.active .switch[data-key="tips"]').count() == 1, f'{tag}: ayarlarda öğretici düğmesi')
    check(pg.locator('.screen.active .switch[data-key="discoveries"]').count() == 1, f'{tag}: ayarlarda bilgi kartı düğmesi')
    pg.locator('.screen.active [data-act="resetTips"]').scroll_into_view_if_needed()
    pg.screenshot(path=f'{OUT}/{tag}-7-settings.png')
    pg.locator('.screen.active [data-act="resetTips"]').click()
    pg.wait_for_timeout(300)
    st = pg.evaluate(f"async () => {{ const st = {S}; return [st.settings.tips, st.records.tips.length]; }}")
    check(st[0] is True and st[1] == 0, f'{tag}: baştan göster: öğretici açık ve liste boş olmalı {st}')
    # 6) bilgi kartları kapalı
    pg.locator('.screen.active .switch[data-key="discoveries"]').click()
    pg.wait_for_timeout(200)
    pg.locator('.screen.active [data-act="back"]').click()
    pg.wait_for_timeout(300)
    pg.locator('.screen.active [data-act="resume"]').click()
    pg.wait_for_timeout(300)
    pg.evaluate("""async () => { const S = await import('./js/state.js'); const G = await import('./js/game.js'); const st = S.state;
      st.records.seen = st.records.seen.filter(t => t !== 'ghoul'); st.run.lives = 20;
      if (G.canCallWave()) G.callWave(); for (let i = 0; i < 80; i++) G.update(1 / 20); }""")
    pg.wait_for_timeout(600)
    check(pg.locator('.discovery').count() == 0, f'{tag}: bilgi kartları kapalıyken kart çıkmamalı')
    pg.evaluate("async () => { (await import('./js/state.js')).setSetting('discoveries', true); }")
    # 7) kule seçimi ve çarşı ipuçları (menü)
    pg.evaluate("""async () => { const S = await import('./js/state.js'); const C = await import('./js/config.js'); const save = await import('./js/save.js');
      const st = S.state; st.profile.towers = [...C.TOWER_ORDER]; st.profile.gold = 500; st.records.runs = 2;
      save.saveProfile(st.profile); save.saveRecords(st.records); }""")
    pg.locator('[data-el="pauseBtn"]').click()
    pg.wait_for_timeout(400)
    pg.locator('.screen.active [data-act="toMenu"]').click()
    pg.wait_for_timeout(400)
    m = pg.locator('.modal-backdrop.open .modal-actions .btn-primary, .modal-backdrop.open .modal-actions .btn-danger')
    if m.count():
        m.first.click()
        pg.wait_for_timeout(600)
    t = wait_tip(pg, 1200)
    check(t == 'Çarşı', f'{tag}: ana menüde "Çarşı" ipucu ({t!r})')
    pg.screenshot(path=f'{OUT}/{tag}-8-market.png')
    pg.locator('.tip-ok').click()
    pg.wait_for_timeout(300)
    pg.locator('.screen.active [data-act="new"]').click()
    pg.wait_for_timeout(400)
    pg.locator('.screen.active .chapter-card').first.click()
    t = wait_tip(pg, 1200)
    check(t == 'Kule seçimi', f'{tag}: zorluk ekranında "Kule seçimi" ipucu ({t!r})')
    pg.screenshot(path=f'{OUT}/{tag}-9-loadout.png')
    pg.locator('.screen.active .loadout-btn:not(.on)').first.click()
    pg.wait_for_timeout(300)
    check(tip_id(pg) != 'Kule seçimi', f'{tag}: kule seçince ipucu kapanmalı')
    ctx.close()


with sync_playwright() as p:
    b = p.chromium.launch()
    run('pc', dict(viewport={'width': 1366, 'height': 768}), True)
    run('phone', dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True), False)
    b.close()

print('\n'.join(errs[:30]) or 'konsol hatası yok')
print('SONUÇ:', 'BAŞARILI' if not fails and not errs else f'{len(fails)} hata, {len(errs)} konsol mesajı')
sys.exit(1 if fails or errs else 0)
