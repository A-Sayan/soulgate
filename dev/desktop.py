"""Bilgisayar ve geniş ekran testi: gerçek index.html, fare ve klavye.

1) Birçok pencere boyutunda (geniş, alçak, dev, telefon) ana menü, ayarlar,
   bölümler, zorluk ve oyun ekranının görüntüsü; sahnenin genişliği, haritanın
   sahneye sığdığı ve hiçbir menü öğesinin ekran dışına taşmadığı denetlenir.
2) Fare + klavye akışı: 1 tuşu + fareyle kule kurma, U yükselt, X X sat,
   Boşluk dalga, F hız, Q / E yetenek, sağ tık vazgeç, Esc duraklat.
3) Telefon (dokunmatik): sahne tam genişlik, kısayol rozetleri ve ayarlardaki
   kısayol listesi gizli.

Depo kökünde sunucu açık olmalı: python3 -m http.server 8765 --bind 127.0.0.1
Çalıştır: python3 dev/desktop.py          (görüntüler dev/out/desktop/ içine)
"""
import os
import sys
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'desktop')
os.makedirs(OUT, exist_ok=True)
URL = 'http://127.0.0.1:8765/index.html'

SIZES = [(1920, 1080), (1920, 950), (1366, 657), (1280, 600), (1024, 500), (800, 450), (2560, 1440), (1000, 1200)]

errs = []
fails = []


def check(cond, msg):
    if not cond:
        fails.append(msg)
        print('  HATA:', msg)


def watch(pg, tag):
    pg.on('pageerror', lambda e: errs.append(f'{tag} PAGEERROR {e}'))
    pg.on('console', lambda m: errs.append(f'{tag} {m.type}: {m.text}') if m.type in ('error', 'warning') else None)


def act(pg, sel):
    pg.locator(f'.screen.active [data-act="{sel}"]').first.click()
    pg.wait_for_timeout(450)


def confirm_if(pg):
    m = pg.locator('.modal-backdrop.open .modal-actions .btn-primary, .modal-backdrop.open .modal-actions .btn-danger')
    if m.count():
        m.first.click()
        pg.wait_for_timeout(400)


PROFILE = """async () => {
  const S = await import('./js/state.js');
  const C = await import('./js/config.js');
  const save = await import('./js/save.js');
  const st = S.state;
  st.profile.towers = [...C.TOWER_ORDER];
  st.profile.loadout = ['archer', 'mortar', 'frost', 'poison', 'tesla', 'curse'];
  st.profile.skills = { log: 1, meteor: 1 };
  st.profile.rightBuilt = true;
  st.profile.sides = { left: 'log', right: 'meteor' };
  for (const m of C.MAP_ORDER) st.records.wins[m].easy = 1;
  save.saveProfile(st.profile);
  save.saveRecords(st.records);
}"""

# menü öğelerinin hepsi ekranda mı (kaydırılabilir listeler hariç)?
OVERFLOW = """() => {
  const out = [];
  const W = innerWidth, H = innerHeight;
  const scr = document.querySelector('.screen.active');
  if (!scr) return out;
  for (const n of scr.querySelectorAll('button, .gold-chip, .logo img')) {
    if (n.closest('.diff-scroll, .settings-list, .chapter-list, .shop-list, .guide-list, .info-body, .about-body')) continue;
    const r = n.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const scroller = n.closest('.screen-main');
    if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) continue; // sığmayınca kaydırılır
    if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) out.push((n.dataset.act || n.className) + ' ' + JSON.stringify([r.left|0, r.top|0, r.right|0, r.bottom|0]));
  }
  return out;
}"""

GAME_GEOM = """async () => {
  const S = await import('./js/state.js');
  const C = await import('./js/config.js');
  const v = S.state.view;
  const hud = document.querySelector('.hud').getBoundingClientRect();
  const dock = document.querySelector('.dock').getBoundingClientRect();
  return { cell: v.cell, ox: v.ox, oy: v.oy, mapW: C.GRID.cols * v.cell, mapH: C.GRID.rows * v.cell,
           hudL: hud.left, hudR: hud.right, hudB: hud.bottom, dockT: dock.top, W: innerWidth, H: innerHeight };
}"""


def start_chapter(pg, mid='kul-vadisi'):
    act(pg, 'new')
    pg.locator(f'.screen.active .chapter-card[data-id="{mid}"]').click()
    pg.wait_for_timeout(450)
    act(pg, 'start')
    confirm_if(pg)
    pg.wait_for_timeout(1600)


with sync_playwright() as p:
    b = p.chromium.launch()

    # ---------------------------------------------------------------- 1) boyutlar
    for w, h in SIZES:
        tag = f'{w}x{h}'
        print(tag)
        ctx = b.new_context(viewport={'width': w, 'height': h})
        pg = ctx.new_page()
        watch(pg, tag)
        pg.goto(URL)
        pg.wait_for_timeout(2200)
        check(not pg.locator('.rotate-hint').is_visible(), f'{tag}: "dik tut" uyarısı bilgisayarda görünmemeli')
        pg.screenshot(path=f'{OUT}/{tag}-1-main.png')
        check(pg.evaluate(OVERFLOW) == [], f'{tag}: ana menü taşıyor {pg.evaluate(OVERFLOW)}')
        act(pg, 'settings')
        pg.screenshot(path=f'{OUT}/{tag}-2-settings.png')
        check(pg.locator('.keys-group').is_visible(), f'{tag}: ayarlarda kısayol listesi görünmeli')
        pg.locator('.keys-group').scroll_into_view_if_needed()
        pg.wait_for_timeout(150)
        pg.screenshot(path=f'{OUT}/{tag}-2-settings-keys.png')
        act(pg, 'back')
        act(pg, 'new')
        pg.screenshot(path=f'{OUT}/{tag}-3-chapters.png')
        pg.locator('.screen.active .chapter-card').first.click()
        pg.wait_for_timeout(450)
        pg.screenshot(path=f'{OUT}/{tag}-4-difficulty.png')
        check(pg.evaluate(OVERFLOW) == [], f'{tag}: zorluk ekranı taşıyor {pg.evaluate(OVERFLOW)}')
        act(pg, 'start')
        confirm_if(pg)
        pg.wait_for_timeout(1800)
        geo = pg.evaluate(GAME_GEOM)
        pg.screenshot(path=f'{OUT}/{tag}-5-game.png')
        # harita sahneye (HUD genişliği) ve HUD ile bar arasına sığmalı
        check(geo['ox'] >= geo['hudL'] - 1 and geo['ox'] + geo['mapW'] <= geo['hudR'] + 1, f'{tag}: harita sahneden taşıyor {geo}')
        check(geo['oy'] >= geo['hudB'] - 1 and geo['oy'] + geo['mapH'] <= geo['dockT'] + 1, f'{tag}: harita HUD/bar altında {geo}')
        check(abs((geo['hudL'] + geo['hudR']) / 2 - w / 2) <= 1, f'{tag}: sahne ortada değil {geo}')
        print('  hücre', round(geo['cell'], 1), 'sahne', round(geo['hudR'] - geo['hudL']))
        ctx.close()

    # ---------------------------------------------------------------- 2) fare + klavye
    print('fare + klavye')
    ctx = b.new_context(viewport={'width': 1366, 'height': 657})
    pg = ctx.new_page()
    watch(pg, 'keys')
    pg.goto(URL)
    pg.wait_for_timeout(1500)
    pg.evaluate(PROFILE)
    pg.reload()
    pg.wait_for_timeout(2200)
    start_chapter(pg)
    pg.evaluate("async () => { (await import('./js/state.js')).state.run.souls = 5000; }")
    S = "(await import('./js/state.js')).state"
    # kurulabilir bir hücrenin ekran yeri
    cell = pg.evaluate(f"""async () => {{
      const S = await import('./js/state.js'); const st = S.state;
      // haritanın ortasından aşağı: sol üstteki keşif kartlarının altında kalmasın
      for (let r = 7; r < st.map.rows; r++) for (let c = 2; c < st.map.cols; c++) if (S.isBuildable(c, r)) {{
        const v = st.view; return {{ c, r, x: v.ox + (c + 0.5) * v.cell, y: v.oy + (r + 0.5) * v.cell }};
      }}
    }}""")
    pg.mouse.move(cell['x'], cell['y'])
    pg.wait_for_timeout(100)
    pg.keyboard.press('1')
    pg.wait_for_timeout(150)
    ui = pg.evaluate(f"async () => {{ const st = {S}; return {{ b: st.ui.buildType, c: st.ui.ghostC, r: st.ui.ghostR }}; }}")
    check(ui['b'] == 'archer' and ui['c'] == cell['c'] and ui['r'] == cell['r'], f'1 tuşu: hayalet farenin altında olmalı {ui} {cell}')
    pg.screenshot(path=f'{OUT}/keys-1-ghost.png')
    pg.mouse.click(cell['x'], cell['y'])
    pg.wait_for_timeout(250)
    n = pg.evaluate(f"async () => {S}.run.towers.length")
    check(n == 1, f'tek tıkla kule kurulmalı (kule sayısı {n})')
    pg.mouse.click(cell['x'], cell['y'])  # kuleyi seç → panel
    pg.wait_for_timeout(350)
    check(pg.locator('.panel.open').count() == 1, 'kuleye tıklayınca panel açılmalı')
    pg.screenshot(path=f'{OUT}/keys-2-panel.png')
    pg.keyboard.press('u')
    pg.wait_for_timeout(250)
    lv = pg.evaluate(f"async () => {S}.run.towers[0].level")
    check(lv >= 1, f'U yükseltmeli (seviye {lv})')
    pg.keyboard.press('x')
    pg.wait_for_timeout(150)
    pg.keyboard.press('x')
    pg.wait_for_timeout(300)
    n = pg.evaluate(f"async () => {S}.run.towers.length")
    check(n == 0, f'X X satmalı (kule sayısı {n})')
    # 2 tuşu, sağ tık vazgeç
    pg.keyboard.press('2')
    pg.wait_for_timeout(120)
    pg.mouse.click(cell['x'], cell['y'], button='right')
    pg.wait_for_timeout(150)
    bt = pg.evaluate(f"async () => {S}.ui.buildType")
    check(bt is None, f'sağ tık kurulumu iptal etmeli ({bt})')
    paused = pg.evaluate(f"async () => {S}.run.paused")
    check(not paused, 'sağ tık oyunu duraklatmamalı')
    # aynı tuş iki kez: seç / bırak
    pg.keyboard.press('3')
    pg.keyboard.press('3')
    pg.wait_for_timeout(120)
    check(pg.evaluate(f"async () => {S}.ui.buildType") is None, '3 iki kez: kurulum kapanmalı')
    # dalga, hız
    pg.keyboard.press('Space')
    pg.wait_for_timeout(300)
    w = pg.evaluate(f"async () => {S}.run.wave")
    check(w >= 1, f'Boşluk dalgayı başlatmalı (dalga {w})')
    pg.keyboard.press('f')
    pg.wait_for_timeout(100)
    sp = pg.evaluate(f"async () => {S}.run.speed")
    check(sp == 2, f'F hızı 2x yapmalı ({sp})')
    # fareyle hız düğmesine tıkla, sonra Boşluk o düğmeyi basmasın
    pg.locator('[data-el="speedBtn"]').click()
    pg.wait_for_timeout(100)
    sp = pg.evaluate(f"async () => {S}.run.speed")
    pg.keyboard.press('Space')
    pg.wait_for_timeout(200)
    check(pg.evaluate(f"async () => {S}.run.speed") == sp, 'Boşluk odaktaki hız düğmesine basmamalı')
    pg.evaluate("async () => { (await import('./js/state.js')).setSpeed(1); }")
    # yetenekler: Q tomruk (hemen), E meteor (hedef) → sağ tık vazgeç
    pg.wait_for_timeout(1500)
    pg.keyboard.press('q')
    pg.wait_for_timeout(200)
    cd = pg.evaluate(f"async () => {S}.run.skills.map(s => [s.side, s.id, s.cd > 0])")
    check(any(s[0] == 'left' and s[2] for s in cd), f'Q sol yeteneği kullanmalı {cd}')
    pg.keyboard.press('e')
    pg.wait_for_timeout(150)
    aim = pg.evaluate(f"async () => {S}.ui.skillAim")
    check(aim >= 0, f'E hedefli yetenekte nişan almalı ({aim})')
    pg.screenshot(path=f'{OUT}/keys-3-aim.png')
    pg.mouse.click(cell['x'], cell['y'], button='right')
    pg.wait_for_timeout(150)
    check(pg.evaluate(f"async () => {S}.ui.skillAim") == -1, 'sağ tık nişanı bırakmalı')
    # bardaki kuleye sağ tık → bilgi
    pg.locator('.tower-btn').first.click(button='right')
    pg.wait_for_timeout(500)
    check(pg.locator('.screen.active[data-screen="info"]').count() == 1, 'bardaki kuleye sağ tık bilgi açmalı')
    pg.screenshot(path=f'{OUT}/keys-4-info.png')
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(450)
    check(pg.evaluate(f"async () => {S}.run.paused") is False, 'Esc bilgi ekranından oyuna dönmeli')
    # duraklatma ekranında kısayollar çalışmaz
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(450)
    check(pg.locator('.screen.active[data-screen="pause"]').count() == 1, 'Esc duraklatmalı')
    pg.keyboard.press('1')
    pg.wait_for_timeout(100)
    check(pg.evaluate(f"async () => {S}.ui.buildType") is None, 'duraklamada 1 tuşu kurulum açmamalı')
    pg.screenshot(path=f'{OUT}/keys-5-pause.png')
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(450)
    # rozetler görünüyor mu, ayarlarda kısayol listesi
    badge = pg.evaluate("getComputedStyle(document.querySelector('.tower-btn'), '::after').content")
    check(badge == '"1"', f'kule rozetinde 1 yazmalı ({badge})')
    pg.screenshot(path=f'{OUT}/keys-6-badges.png')
    ctx.close()

    # ---------------------------------------------------------------- 3) telefon
    print('telefon')
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg = ctx.new_page()
    watch(pg, 'phone')
    pg.goto(URL)
    pg.wait_for_timeout(2000)
    act(pg, 'settings')
    check(not pg.locator('.keys-group').is_visible(), 'telefonda kısayol listesi gizli olmalı')
    act(pg, 'back')
    start_chapter(pg)
    geo = pg.evaluate(GAME_GEOM)
    check(geo['hudL'] == 0 and geo['hudR'] == 390, f'telefonda sahne tam genişlik olmalı {geo}')
    badge = pg.evaluate("getComputedStyle(document.querySelector('.tower-btn'), '::after').content")
    check(badge in ('none', 'normal', ''), f'telefonda kısayol rozeti olmamalı ({badge})')
    pg.screenshot(path=f'{OUT}/phone-game.png')
    ctx.close()

    # telefon yatay: "dik tut" uyarısı kalır
    ctx = b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg = ctx.new_page()
    watch(pg, 'phone-land')
    pg.goto(URL)
    pg.wait_for_timeout(1500)
    check(pg.locator('.rotate-hint').is_visible(), 'yatay telefonda "dik tut" uyarısı görünmeli')
    ctx.close()
    b.close()

print('\n'.join(errs[:40]) or 'konsol hatası yok')
print('SONUÇ:', 'BAŞARILI' if not fails and not errs else f'{len(fails)} hata, {len(errs)} konsol mesajı')
sys.exit(1 if fails or errs else 0)
