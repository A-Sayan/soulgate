"""İkinci tur: zafer + bölüm açılışı, rehber, bilgi ekranları, ana kule paneli,
çan/kuyu paneli, yetenek küreleri. Ekran görüntüleri dev/out/e2e2/ içine."""
import os
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'e2e2')
os.makedirs(OUT, exist_ok=True)
URL = 'http://127.0.0.1:8765/index.html'
errs = []

def shot(pg, name):
    pg.screenshot(path=f'{OUT}/{name}.png')

def act(pg, sel, n=0):
    pg.locator(f'.screen.active [data-act="{sel}"]').nth(n).click()
    pg.wait_for_timeout(450)

def confirm_if(pg):
    m = pg.locator('.modal-backdrop.open .modal-actions .btn-primary, .modal-backdrop.open .modal-actions .btn-danger')
    if m.count():
        m.first.click()
        pg.wait_for_timeout(400)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') and 'ERR_TUNNEL' not in m.text else None)
    pg.goto(URL)
    pg.wait_for_timeout(2200)
    # temiz başlangıç: bölüm 1 kolayda kazan → bölüm 2 açılmalı
    act(pg, 'new')
    pg.locator('.screen.active .chapter-card[data-id="kul-vadisi"]').click(); pg.wait_for_timeout(400)
    pg.locator('.screen.active .diff-card.diff-easy').click(); pg.wait_for_timeout(200)
    act(pg, 'start'); confirm_if(pg); pg.wait_for_timeout(1500)
    pg.evaluate("""async () => {
      const G = await import('./js/game.js'); const S = await import('./js/state.js');
      const st = S.state; st.run.wave = st.map.waves.length; st.run.countdown = null;
      st.run.enemies.length = 0; st.run.spawners.length = 0; G.update(1 / 60);
    }""")
    pg.wait_for_timeout(2600)
    shot(pg, '01-victory-unlock')
    act(pg, 'endMenu'); pg.wait_for_timeout(800)
    shot(pg, '02-main-after-win')
    act(pg, 'new')
    shot(pg, '03-chapters-after-win')
    act(pg, 'back')
    # çarşı: kilitli/yeni açılan ürünler
    act(pg, 'market')
    pg.locator('.screen.active .shop-list').evaluate('e => e.scrollTop = e.scrollHeight')
    pg.wait_for_timeout(300)
    shot(pg, '04-market-locks')
    pg.locator('.screen.active [data-act="shopTab"]').nth(1).click(); pg.wait_for_timeout(300)
    pg.locator('.screen.active .shop-list').evaluate('e => e.scrollTop = e.scrollHeight')
    pg.wait_for_timeout(300)
    shot(pg, '05-market-skills-locks')
    act(pg, 'back')
    # rehber
    act(pg, 'guide')
    tabs = pg.locator('.screen.active [data-act="tab"]')
    for i in range(tabs.count()):
        tabs.nth(i).click(); pg.wait_for_timeout(300)
        shot(pg, f'06-guide-tab{i}')
        pg.locator('.screen.active .guide-list').evaluate('e => e.scrollTop = e.scrollHeight')
        pg.wait_for_timeout(200)
        shot(pg, f'06-guide-tab{i}-end')
    act(pg, 'back')
    # her şey açık + görülmüş, bilgi ekranları
    pg.evaluate("""async () => {
      const S = await import('./js/state.js'); const C = await import('./js/config.js'); const save = await import('./js/save.js');
      const st = S.state;
      for (const m of C.MAP_ORDER) { st.records.wins[m].easy = 1; st.records.wins[m].normal = 1; st.records.best[m].easy = 30; }
      st.records.wins['kul-vadisi'].hard = 2;
      for (const k of Object.keys(C.ENEMIES)) S.discover('enemy', k);
      st.profile.gold = 120000; st.profile.towers = [...C.TOWER_ORDER];
      for (const s of C.SKILL_ORDER) st.profile.skills[s] = 3;
      for (const k of Object.keys(C.CASTLE.upgrades)) st.profile.castle[k] = C.CASTLE.upgrades[k].costs.length;
      st.profile.rightBuilt = true; st.profile.sides = { left: 'mend', right: 'vortex' };
      st.profile.loadout = ['archer', 'bell', 'well', 'prism', 'hunter', 'flame'];
      save.saveRecords(st.records); save.saveProfile(st.profile);
    }""")
    pg.reload(); pg.wait_for_timeout(2400)
    shot(pg, '07-main-allstars')
    act(pg, 'guide')
    tabs = pg.locator('.screen.active [data-act="tab"]')
    for i in range(tabs.count()):
        tabs.nth(i).click(); pg.wait_for_timeout(300)
        items = pg.locator('.screen.active .guide-item')
        n = items.count()
        for k in ([n - 1, n - 3] if n > 3 else [0]):
            items.nth(k).scroll_into_view_if_needed(); items.nth(k).click(); pg.wait_for_timeout(450)
            shot(pg, f'08-info-tab{i}-{k}')
            act(pg, 'back')
    act(pg, 'back')
    # oyun: ana kule paneli, çan/kuyu paneli, küreler
    act(pg, 'new')
    pg.locator('.screen.active .chapter-card[data-id="kor-ocaklari"]').click(); pg.wait_for_timeout(400)
    act(pg, 'start'); confirm_if(pg); pg.wait_for_timeout(1500)
    pos = pg.evaluate("""async () => {
      const G = await import('./js/game.js'); const S = await import('./js/state.js');
      const st = S.state; st.run.souls = 9000;
      const spots = [[3, 2], [4, 2], [5, 2], [3, 3], [5, 3], [4, 3]];
      const ok = [];
      const types = ['bell', 'archer', 'prism', 'hunter', 'flame', 'well'];
      for (let r = 6; r < st.map.rows && ok.length < 6; r++) for (let c = 0; c < st.map.cols && ok.length < 6; c++) {
        const t = types[ok.length]; if (G.canBuild(t, c, r).ok) { G.build(t, c, r); ok.push([t, c, r]); }
      }
      const w = st.run.towers.find((t) => t.type === 'well');
      const b = st.run.towers.find((t) => t.type === 'archer');
      const s1 = S.worldToScreen(w.x, w.y), s2 = S.worldToScreen(b.x, b.y), k = S.worldToScreen(st.map.castle.x, st.map.castle.y);
      return { well: [s1.x, s1.y], archer: [s2.x, s2.y], keep: [k.x, k.y], dpr: devicePixelRatio };
    }""")
    print(pos)
    pg.evaluate("async () => { const G = await import('./js/game.js'); G.callWave(); }")
    pg.wait_for_timeout(3000)
    d = 1
    pg.mouse.click(pos['archer'][0] / d, pos['archer'][1] / d); pg.wait_for_timeout(600)
    shot(pg, '09-panel-buffed')
    pg.mouse.click(pos['well'][0] / d, pos['well'][1] / d); pg.wait_for_timeout(600)
    shot(pg, '10-panel-well')
    pg.mouse.click(pos['keep'][0] / d, pos['keep'][1] / d); pg.wait_for_timeout(600)
    shot(pg, '11-panel-keep')
    pg.mouse.click(195, 400); pg.wait_for_timeout(300)
    # vortex orb
    orbs = pg.locator('.skill-orb')
    print('orbs', orbs.count())
    if orbs.count() > 1:
        orbs.nth(1).click(); pg.wait_for_timeout(300)
        shot(pg, '12-aiming')
        pg.mouse.click(195, 330); pg.wait_for_timeout(500)
        shot(pg, '13-vortex')
    pg.wait_for_timeout(4000)
    shot(pg, '14-later')
    print('\n'.join(errs[:40]) or 'no console errors')
    b.close()
