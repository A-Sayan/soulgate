import os
"""Kare süresi ölçümü: bir bölümde belirli dalgaya atla, kalabalık sahnede rAF aralıklarını ölç."""
import sys
from playwright.sync_api import sync_playwright
URL = 'http://127.0.0.1:8765/index.html'
mid, wave = sys.argv[1], int(sys.argv[2])
with sync_playwright() as p:
    b = p.chromium.launch(args=['--enable-gpu-rasterization'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(2000)
    pg.evaluate("""async () => {
      const S = await import('./js/state.js'); const C = await import('./js/config.js'); const save = await import('./js/save.js');
      const st = S.state; for (const m of C.MAP_ORDER) st.records.wins[m].easy = 1;
      st.profile.towers = [...C.TOWER_ORDER]; for (const s of C.SKILL_ORDER) st.profile.skills[s] = 3;
      st.profile.loadout = ['archer', 'mortar', 'tesla', 'prism', 'flame', 'bell'];
      save.saveRecords(st.records); save.saveProfile(st.profile);
    }""")
    pg.reload(); pg.wait_for_timeout(2000)
    pg.locator('.screen.active [data-act="new"]').click(); pg.wait_for_timeout(400)
    pg.locator(f'.screen.active .chapter-card[data-id="{mid}"]').click(); pg.wait_for_timeout(400)
    pg.locator('.screen.active [data-act="start"]').click(); pg.wait_for_timeout(1200)
    info = pg.evaluate("""async (W) => {
      const G = await import('./js/game.js'); const S = await import('./js/state.js');
      const st = S.state; st.run.souls = 99999;
      const types = ['archer', 'mortar', 'tesla', 'prism', 'flame', 'bell'];
      let i = 0;
      for (let r = 0; r < st.map.rows; r++) for (let c = 0; c < st.map.cols; c++) {
        const t = types[i % 6]; if (i < 22 && G.canBuild(t, c, r).ok && G.pathCoverage(c, r, 2.5) > 1.5) { const tw = G.build(t, c, r); i++; for (let k = 0; k < 3; k++) G.upgrade(tw, -1); G.upgrade(tw, i % 2); }
      }
      st.run.wave = W - 1; st.run.lives = 9999;
      G.callWave();
      if (W > 0) { const orig = st.run.enemies; setInterval(() => { for (const e of st.run.enemies) if (!e.boss) e.hp = Math.max(e.hp, e.maxHp * 0.6); }, 200); }
      return st.run.towers.length;
    }""", wave)
    pg.evaluate("async () => { const S = await import('./js/state.js'); S.setSpeed(2); }")
    pg.wait_for_timeout(int(sys.argv[3]) if len(sys.argv) > 3 else 3500)
    cdp = ctx.new_cdp_session(pg); cdp.send('Performance.enable')
    m0 = {m['name']: m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}
    res = pg.evaluate("""() => new Promise((res) => {
      const ts = []; let last = performance.now();
      function f(t) { ts.push(t - last); last = t; if (ts.length < 240) requestAnimationFrame(f); else res(ts); }
      requestAnimationFrame(f);
    })""")
    m1 = {m['name']: m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}
    print('script ms/frame', round((m1['ScriptDuration'] - m0['ScriptDuration']) * 1000 / 240, 2), 'task ms/frame', round((m1['TaskDuration'] - m0['TaskDuration']) * 1000 / 240, 2))
    n = pg.evaluate("async () => { const S = await import('./js/state.js'); return [S.state.run.enemies.length, S.state.run.towers.length, S.state.run.wave]; }")
    res = sorted(res[5:])
    avg = sum(res) / len(res)
    print(mid, 'wave', wave, 'enemies/towers/wave', n, 'towers built', info, f'avg {avg:.1f}ms p95 {res[int(len(res)*0.95)]:.1f}ms max {res[-1]:.1f}ms', errs[:3])
    pg.screenshot(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', f'perf-{mid}.png'))
    b.close()
