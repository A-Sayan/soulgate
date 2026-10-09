import os
"""Mağaza ekran görüntüleri (1080x1920): menü, bölümler, kule seçimi ve her bölümden savaş."""
import sys
from playwright.sync_api import sync_playwright
URL = 'http://127.0.0.1:8765/index.html'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'store')
LANG = sys.argv[1] if len(sys.argv) > 1 else 'en'
os.makedirs(OUT, exist_ok=True)
errs = []

SETUP = """async (lang) => {
  const S = await import('./js/state.js'); const C = await import('./js/config.js'); const save = await import('./js/save.js');
  const st = S.state;
  for (const m of C.MAP_ORDER) { st.records.wins[m].easy = 1; st.records.best[m].easy = 30; }
  for (const m of C.MAP_ORDER.slice(0, 3)) { st.records.wins[m].normal = 1; st.records.best[m].normal = 30; }
  st.records.wins['kul-vadisi'].hard = 1;
  for (const k of Object.keys(C.ENEMIES)) S.discover('enemy', k);
  for (const k of C.TOWER_ORDER) S.discover('tower', k);
  for (const k of C.SKILL_ORDER) S.discover('skill', k);
  st.profile.gold = 4280; st.profile.towers = [...C.TOWER_ORDER];
  for (const s of C.SKILL_ORDER) st.profile.skills[s] = 2;
  for (const k of Object.keys(C.CASTLE.upgrades)) st.profile.castle[k] = 3;
  st.profile.rightBuilt = true; st.profile.sides = { left: 'meteor', right: 'thunder' };
  save.saveRecords(st.records); save.saveProfile(st.profile);
  S.setSetting('lang', lang);
}"""

BUILD = """async ([types, wave, souls]) => {
  const G = await import('./js/game.js'); const S = await import('./js/state.js');
  const st = S.state; st.run.souls = 99999;
  const cells = [];
  for (let r = 0; r < st.map.rows; r++) for (let c = 0; c < st.map.cols; c++) if (S.isBuildable(c, r)) cells.push([c, r, G.pathCoverage(c, r, 2.6)]);
  cells.sort((a, b) => b[2] - a[2]);
  let i = 0;
  for (const [c, r] of cells) {
    if (i >= 13) break;
    const t = types[i % types.length];
    if (!G.canBuild(t, c, r).ok) continue;
    const tw = G.build(t, c, r); i++;
    for (let k = 0; k < 2; k++) G.upgrade(tw, -1);
    if (i % 3 === 0) G.upgrade(tw, -1), G.upgrade(tw, i % 2);
    tw.buildT = 1;
  }
  st.run.wave = wave - 1; st.run.lives = st.run.maxLives - 3;
  G.callWave();
  st.run.souls = souls;
  return st.run.towers.length;
}"""

def shot(pg, name):
    pg.screenshot(path=f'{OUT}/{LANG}-{name}.png')

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 405, 'height': 720}, device_scale_factor=8 / 3, has_touch=True, is_mobile=True)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.goto(URL); pg.wait_for_timeout(1500)
    pg.evaluate(SETUP, LANG)
    pg.reload(); pg.wait_for_timeout(3500)
    shot(pg, '01-menu')
    pg.locator('.screen.active [data-act="new"]').click(); pg.wait_for_timeout(700)
    shot(pg, '02-chapters')
    pg.locator('.screen.active .chapter-card[data-id="kor-ocaklari"]').click(); pg.wait_for_timeout(600)
    pg.locator('.screen.active .diff-scroll').evaluate('e => e.scrollTop = e.scrollHeight'); pg.wait_for_timeout(400)
    shot(pg, '03-loadout')
    pg.locator('.screen.active [data-act="back"]').click(); pg.wait_for_timeout(400)
    plans = [
        ('ayaz-gecidi', ['frost', 'lance', 'archer', 'prism', 'tesla', 'bell'], 20, 7.5, 640),
        ('kara-bataklik', ['poison', 'archer', 'flame', 'curse', 'mortar', 'well'], 14, 8, 812),
        ('kor-ocaklari', ['flame', 'hunter', 'mortar', 'frost', 'bell', 'archer'], 23, 11, 905),
        ('bosluk-tahti', ['prism', 'tesla', 'hunter', 'lance', 'curse', 'frost'], 30, 12, 1240),
        ('kul-vadisi', ['archer', 'mortar', 'frost', 'poison', 'tesla', 'curse'], 10, 7, 455),
    ]
    for mid, types, wave, wait, souls in plans:
        pg.goto(URL); pg.wait_for_timeout(2200)
        pg.locator('.screen.active [data-act="new"]').click(); pg.wait_for_timeout(500)
        pg.locator(f'.screen.active .chapter-card[data-id="{mid}"]').click(); pg.wait_for_timeout(500)
        pg.evaluate("""async (t) => { const S = await import('./js/state.js'); const save = await import('./js/save.js'); S.state.profile.loadout = t; save.saveProfile(S.state.profile); }""", types)
        pg.locator('.screen.active .diff-card.diff-normal').click(); pg.wait_for_timeout(200)
        pg.locator('.screen.active [data-act="start"]').click(); pg.wait_for_timeout(300)
        m = pg.locator('.modal-backdrop.open .modal-actions .btn-danger, .modal-backdrop.open .modal-actions .btn-primary')
        if m.count(): m.first.click()
        pg.wait_for_timeout(3200)  # bölüm başlığı geçsin
        pg.evaluate(BUILD, [types, wave, souls])
        pg.wait_for_timeout(int(wait * 1000))
        shot(pg, f'1-{mid}')
        pg.evaluate("() => { for (const el of document.querySelectorAll('.ui, .menu, #ui, #menu')) el.style.visibility = 'hidden'; }")
        pg.wait_for_timeout(60)
        pg.screenshot(path=f'{OUT}/clean-{mid}.png')
    print('\n'.join(errs) or 'no errors')
    b.close()
