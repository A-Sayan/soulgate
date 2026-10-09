import os
"""Uçtan uca: gerçek index.html, telefon boyutu. Menüler, bölümler, kule seçimi,
çarşı ve her bölümde birkaç dalga. Ekran görüntüleri dev/out/e2e/ içine."""
import sys, os, json
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'e2e')
os.makedirs(OUT, exist_ok=True)
URL = 'http://127.0.0.1:8765/index.html'
ONLY = sys.argv[1] if len(sys.argv) > 1 else 'all'

errs = []

def shot(pg, name):
    pg.screenshot(path=f'{OUT}/{name}.png')

def act(pg, sel):
    pg.locator(f'.screen.active [data-act="{sel}"]').first.click()
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
    pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    pg.goto(URL)
    pg.wait_for_timeout(2500)
    shot(pg, '01-main-fresh')
    act(pg, 'new')
    shot(pg, '02-chapters-fresh')
    # kilitli bölüme dokun
    pg.locator('.chapter-card.locked').first.click(force=True)
    pg.wait_for_timeout(300)
    # profil: her şey açık, bol altın, dört bölüm kazanılmış
    pg.evaluate("""async () => {
      const S = await import('./js/state.js');
      const C = await import('./js/config.js');
      const save = await import('./js/save.js');
      const st = S.state;
      for (const m of C.MAP_ORDER.slice(0, 4)) { st.records.wins[m].easy = 1; st.records.best[m].easy = 30; }
      st.records.wins['kul-vadisi'].normal = 1;
      st.profile.gold = 99999;
      save.saveRecords(st.records);
      save.saveProfile ? save.saveProfile(st.profile) : null;
    }""")
    pg.reload()
    pg.wait_for_timeout(2500)
    shot(pg, '03-main-unlocked')
    act(pg, 'market')
    shot(pg, '04-market-towers')
    # tüm kuleleri satın al
    for _ in range(14):
        bb = pg.locator('.screen.active .shop-card:not(.locked) [data-act="buy"][data-kind="tower"]')
        if not bb.count():
            break
        bb.first.click()
        pg.wait_for_timeout(250)
        confirm_if(pg)
    pg.wait_for_timeout(300)
    shot(pg, '05-market-bought')
    tabs = pg.locator('.screen.active [data-act="shopTab"]')
    for i in range(tabs.count()):
        tabs.nth(i).click()
        pg.wait_for_timeout(350)
        if i == 1:
            for _ in range(30):
                bb = pg.locator('.screen.active .shop-card:not(.locked) [data-act="buy"][data-kind="skill"]')
                if not bb.count():
                    break
                bb.first.click(); pg.wait_for_timeout(200); confirm_if(pg)
        if i == 2:
            for _ in range(30):
                bb = pg.locator('.screen.active [data-act="buy"][data-kind="castle"], .screen.active [data-act="buy"][data-kind="side"]')
                if not bb.count():
                    break
                bb.first.click(); pg.wait_for_timeout(200); confirm_if(pg)
        shot(pg, f'06-market-tab{i}')
        pg.locator('.screen.active .shop-list').evaluate('e => e.scrollTop = e.scrollHeight')
        pg.wait_for_timeout(250)
        shot(pg, f'06-market-tab{i}-bottom')
    act(pg, 'back')
    act(pg, 'new')
    shot(pg, '07-chapters')
    chapters = pg.evaluate("async () => (await import('./js/config.js')).MAP_ORDER")
    for ci, mid in enumerate(chapters):
        if ONLY != 'all' and ONLY != mid:
            continue
        if not pg.locator('.screen.active[data-screen="chapters"]').count():
            pg.goto(URL); pg.wait_for_timeout(2200); act(pg, 'new')
        pg.locator(f'.screen.active .chapter-card[data-id="{mid}"]').click()
        pg.wait_for_timeout(500)
        shot(pg, f'1{ci}-a-difficulty')
        pg.locator('.screen.active .diff-scroll').evaluate('e => e.scrollTop = e.scrollHeight')
        pg.wait_for_timeout(250)
        # 6'dan fazla kule: seçimi dene (dolu uyarısı)
        lb = pg.locator('.screen.active .loadout-btn:not(.on)')
        if lb.count():
            lb.first.click(); pg.wait_for_timeout(300)
        shot(pg, f'1{ci}-b-loadout')
        # bu bölümün yeni kulelerini seçime al
        newt = pg.evaluate(f"async () => (await import('./js/config.js')).MAP_BY_ID['{mid}'].unlocks.towers")
        for t in newt:
            on = pg.locator(f'.screen.active .loadout-btn.on')
            if pg.locator(f'.screen.active .loadout-btn[data-id="{t}"].on').count():
                continue
            # birini çıkar
            for k in range(on.count()):
                tid = on.nth(k).get_attribute('data-id')
                if tid not in newt and tid not in ('archer',):
                    on.nth(k).click(); pg.wait_for_timeout(200); break
            pg.locator(f'.screen.active .loadout-btn[data-id="{t}"]').click(); pg.wait_for_timeout(200)
        act(pg, 'start')
        confirm_if(pg)
        pg.wait_for_timeout(1800)
        shot(pg, f'1{ci}-c-game')
        # botla kule diz, birkaç dalga oynat
        pg.evaluate("""async () => {
          const G = await import('./js/game.js');
          const S = await import('./js/state.js');
          const M = await import('./js/meta.js');
          const st = S.state;
          st.run.souls = 20000;
          const types = M.loadoutTowers();
          let i = 0;
          const cells = [];
          for (let r = 0; r < st.map.rows; r++) for (let c = 0; c < st.map.cols; c++) if (S.isBuildable(c, r)) cells.push([c, r]);
          // yola yakın hücreler önce
          const near = (c, r) => { let d = 9; for (const [pc, pr] of st.map.pathCells || []) d = Math.min(d, Math.abs(pc - c) + Math.abs(pr - r)); return d; };
          cells.sort((a, b) => near(a[0], a[1]) - near(b[0], b[1]));
          for (const [c, r] of cells.slice(0, 18)) {
            const t = types[i++ % types.length];
            if (G.canBuild(t, c, r).ok) G.build(t, c, r);
          }
          for (const t of st.run.towers) { for (let k = 0; k < 2; k++) if (G.canUpgrade(t, -1).ok) G.upgrade(t, -1); }
          return st.run.towers.length;
        }""")
        pg.wait_for_timeout(300)
        shot(pg, f'1{ci}-d-built')
        # dalga çağır, hızlandır
        for w in range(3):
            pg.evaluate("async () => { const G = await import('./js/game.js'); if (G.canCallWave()) G.callWave(); const S = await import('./js/state.js'); S.setSpeed(3); }")
            pg.wait_for_timeout(2600 if w < 2 else 1500)
        shot(pg, f'1{ci}-e-fight')
        # bir yetenek kullan
        pg.evaluate("""async () => {
          const G = await import('./js/game.js'); const S = await import('./js/state.js');
          const st = S.state; const e = st.run.enemies[0];
          for (const side of [0, 1]) { const ok = G.canCast(side); if (ok.ok && e) G.cast(side, e.x, e.y); }
        }""")
        pg.wait_for_timeout(700)
        shot(pg, f'1{ci}-f-skill')
        # boss dalgasına atla
        info = pg.evaluate("""async () => {
          const G = await import('./js/game.js'); const S = await import('./js/state.js');
          const st = S.state;
          for (let k = 0; k < 40000 && st.run.wave < 9; k++) { if (G.canCallWave()) G.callWave(); st.run.lives = 999; G.update(1 / 20); }
          st.run.enemies.length = 0; st.run.spawners.length = 0;
          st.run.lives = 999;
          G.update(0.1);
          if (G.canCallWave()) G.callWave();
          for (let k = 0; k < 40; k++) G.update(1 / 60 * 6);
          return { wave: st.run.wave, enemies: st.run.enemies.map(e => e.type).slice(0, 12) };
        }""")
        print(mid, 'boss wave', info)
        pg.wait_for_timeout(900)
        shot(pg, f'1{ci}-g-boss')
        # menüye dön
        pg.evaluate("async () => { const S = await import('./js/state.js'); S.setSpeed(1); }")
        pg.locator('[data-el="pauseBtn"]').click(); pg.wait_for_timeout(500)
        shot(pg, f'1{ci}-h-pause')
        act(pg, 'toMenu'); confirm_if(pg); pg.wait_for_timeout(600)
        act(pg, 'new')
    print('\n'.join(errs[:40]) or 'no console errors')
    b.close()
