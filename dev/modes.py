"""Meydan Okumalar (1.5.0) testi: Sonsuz Gece, Günün Sınavı, Sınavlar, harita olayları, Kâbus.

Temiz profille gerçek index.html, bilgisayar (1366×768, fare) ve telefon (390×844, dokunmatik):
  1) Hiç bölüm kazanılmamışken Meydan Okumalar kilitli (not görünür, düğmeler kapalı)
  2) Kül Vadisi + Ayaz Geçidi kazanılmış sayılınca: 2 mod kartı, 10 sınav (4'ü açık)
  3) Günün Sınavı: kurallar kartı, oyunda mod ve kurallar, duraklatmada kural çipleri,
     zafer → günün ödülü, seri, kayıt
  4) Sınav "Cam Kale": kale 1 can; yenilgide kale YIKILMAZ
  5) Sonsuz Gece: bölüm seçimi yalnızca kazanılmış bölümler; 40. dalga patron,
     HUD "/∞", yenilgide rekor ve "Gece Sona Erdi"
  6) Bölüm zaferi → "Sonsuza devam et" → aynı savaş sürer (31. dalga, carry)
  7) Her bölümün harita olayı uyarı + etki verir (konsol hatası yok); Kâbus'ta
     seçkin düşman ve patron kükremesi
Görüntüler dev/out/modes/. Depo kökünde sunucu açık olmalı: python3 -m http.server 8765 --bind 127.0.0.1
"""
import os
import sys
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'modes')
os.makedirs(OUT, exist_ok=True)
URL = 'http://127.0.0.1:8765/index.html'
errs = []
fails = []


def check(cond, msg):
    if not cond:
        fails.append(msg)
        print('  HATA:', msg)


S = "(await import('./js/state.js'))"
G = "(await import('./js/game.js'))"


def ev(pg, body):
    return pg.evaluate(f"async () => {{ const st = {S}.state; const S = {S}; const G = {G}; {body} }}")


def act(pg, sel, n=0):
    pg.locator(f'.screen.active [data-act="{sel}"]').nth(n).click()
    pg.wait_for_timeout(450)


def confirm_if(pg):
    m = pg.locator('.modal-backdrop.open .modal-actions .btn-primary, .modal-backdrop.open .modal-actions .btn-danger')
    if m.count():
        m.first.click()
        pg.wait_for_timeout(400)


def win_now(pg):
    """Sahayı boşaltıp son dalgayı bitmiş say: oyun zaferle biter."""
    ev(pg, """st.run.wave = st.map.waves.length; st.run.countdown = null;
      st.run.enemies.length = 0; st.run.spawners.length = 0; st.run.waveLeft.clear(); G.update(1 / 60);""")


def lose_now(pg):
    ev(pg, """const e = st.run.enemies[0]; st.run.lives = 1;
      if (!e) { if (G.canCallWave()) G.callWave(); for (let i = 0; i < 400 && !st.run.enemies.length; i++) G.update(1 / 60); }
      const f = st.run.enemies[0]; f.d = st.map.polys[f.path].length - 0.01; G.update(1 / 60);""")


def run(tag, ctx_kw, shots):
    print(tag)
    ctx = b.new_context(**ctx_kw)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(f'{tag} PAGEERROR {e}'))
    pg.on('console', lambda m: errs.append(f'{tag} {m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    pg.goto(URL)
    pg.wait_for_timeout(1500)
    ev(pg, "S.setSetting('lang', 'tr'); S.setSetting('tips', false);")
    pg.wait_for_timeout(200)

    # 1) kilitli
    act(pg, 'modes')
    check(pg.locator('.screen.active .modes-locked').count() == 1, f'{tag}: kilit notu yok')
    check(pg.locator('.screen.active [data-act="endless"]').is_disabled(), f'{tag}: Sonsuz Gece kilitli olmalı')
    check(pg.locator('.screen.active .challenge-card.locked').count() == 10, f'{tag}: bütün sınavlar kilitli olmalı')
    pg.screenshot(path=f'{OUT}/{tag}-1-locked.png')
    act(pg, 'back')

    # 2) iki bölüm kazanılmış
    ev(pg, """st.records.wins['kul-vadisi'].normal = 1; st.records.wins['ayaz-gecidi'].normal = 1;
      const save = await import('./js/save.js'); save.saveRecords(st.records);""")
    act(pg, 'modes')
    check(pg.locator('.screen.active .modes-locked').count() == 0, f'{tag}: kilit notu kalkmalı')
    check(pg.locator('.screen.active .mode-card').count() == 2, f'{tag}: iki mod kartı')
    n_open = pg.locator('.screen.active .challenge-card:not(.locked)').count()
    check(n_open == 4, f'{tag}: 4 sınav açık olmalı ({n_open})')
    pg.screenshot(path=f'{OUT}/{tag}-2-modes.png')
    if tag == 'phone':
        pg.locator('.screen.active .modes-body').evaluate('e => e.scrollTop = e.scrollHeight')
        pg.wait_for_timeout(200)
        pg.screenshot(path=f'{OUT}/{tag}-2b-modes-end.png')

    # 3) Günün Sınavı
    daily = ev(pg, "const m = await import('./js/meta.js'); return m.dailyChallenge();")
    act(pg, 'daily')
    check(pg.locator('.screen.active .rules-card .mod-list li').count() == 2, f'{tag}: günün sınavında iki kural')
    pg.screenshot(path=f'{OUT}/{tag}-3-daily.png')
    gold0 = ev(pg, 'return st.profile.gold;')
    act(pg, 'start')
    confirm_if(pg)
    pg.wait_for_timeout(900)
    r = ev(pg, 'return [st.run.mode, st.run.mods, st.run.mapId, st.run.daily];')
    check(r[0] == 'daily' and r[1] == daily['mods'] and r[2] == daily['mapId'], f'{tag}: günün sınavı oyunu {r} / {daily}')
    pg.locator('[data-el="pauseBtn"]').click()
    pg.wait_for_timeout(400)
    check(pg.locator('.screen.active .run-mods .mod-chip').count() == 2, f'{tag}: duraklatmada kural çipleri')
    pg.screenshot(path=f'{OUT}/{tag}-4-pause.png')
    act(pg, 'resume')
    win_now(pg)
    pg.wait_for_timeout(1900)
    d = ev(pg, 'return [st.records.daily, st.profile.gold];')
    check(d[0]['last'] == daily['date'] and d[0]['streak'] == 1 and d[0]['wins'] == 1, f'{tag}: günün sınavı kaydı {d[0]}')
    check(d[1] - gold0 >= daily['reward'], f'{tag}: günün ödülü eklenmeli ({d[1] - gold0} < {daily["reward"]})')
    check(pg.locator('.screen.active .reward-lines .bonus').count() == 1, f'{tag}: sonuçta ödül satırı')
    check(pg.locator('.screen.active [data-act="continueEndless"]').is_hidden(), f'{tag}: günün sınavında sonsuza devam yok')
    pg.screenshot(path=f'{OUT}/{tag}-5-daily-win.png')
    act(pg, 'endMenu')
    pg.wait_for_timeout(500)

    # 4) Sınav: Cam Kale (yenilgi kaleyi yıkmaz)
    act(pg, 'modes')
    pg.locator('.screen.active .challenge-card[data-id="glass-ash"]').click()
    pg.wait_for_timeout(450)
    act(pg, 'start')
    confirm_if(pg)
    pg.wait_for_timeout(800)
    r = ev(pg, 'return [st.run.mode, st.run.challenge, st.run.lives, st.run.maxLives];')
    check(r == ['challenge', 'glass-ash', 1, 1], f'{tag}: cam kale {r}')
    lose_now(pg)
    pg.wait_for_timeout(1700)
    r = ev(pg, 'return [st.run.over, st.profile.ruined];')
    check(r == ['defeat', False], f'{tag}: sınav yenilgisi kaleyi yıkmamalı {r}')
    pg.screenshot(path=f'{OUT}/{tag}-6-challenge-lose.png')
    act(pg, 'endMenu')
    pg.wait_for_timeout(500)

    # 5) Sonsuz Gece
    act(pg, 'modes')
    act(pg, 'endless')
    n_open = pg.locator('.screen.active .chapter-card:not(.locked)').count()
    check(n_open == 2, f'{tag}: sonsuz gecede yalnızca kazanılan bölümler ({n_open})')
    pg.screenshot(path=f'{OUT}/{tag}-7-endless-chapters.png')
    pg.locator('.screen.active .chapter-card[data-id="kul-vadisi"]').click()
    pg.wait_for_timeout(450)
    pg.locator('.screen.active .diff-card.diff-normal').click()
    act(pg, 'start')
    confirm_if(pg)
    pg.wait_for_timeout(800)
    r = ev(pg, """const total = G.totalWaves(); st.run.wave = 39; const w = G.waveInfo(40); const w31 = G.waveInfo(31);
      return [st.run.mode, total === Infinity, !!(w && w.boss), w31 && w31.groups.length > 0];""")
    check(r == ['endless', True, True, True], f'{tag}: sonsuz dalgalar {r}')
    check(pg.locator('[data-el="waveTotal"]').inner_text() == '/∞', f'{tag}: HUD /∞')
    ev(pg, """st.run.souls = 5000; G.callWave(); for (let i = 0; i < 300; i++) G.update(1 / 30);""")
    pg.wait_for_timeout(500)
    pg.screenshot(path=f'{OUT}/{tag}-8-endless-boss.png')
    ev(pg, 'st.run.wave = 41;')
    lose_now(pg)
    pg.wait_for_timeout(1700)
    r = ev(pg, "return [st.records.endless['kul-vadisi'].normal, st.profile.ruined];")
    check(r == [41, False], f'{tag}: sonsuz rekor {r}')
    check('Gece' in pg.locator('.screen.active .end-title').inner_text() or 'Night' in pg.locator('.screen.active .end-title').inner_text(), f'{tag}: sonsuz sonu başlığı')
    pg.screenshot(path=f'{OUT}/{tag}-9-endless-end.png')
    act(pg, 'endMenu')
    pg.wait_for_timeout(500)

    # 6) Bölüm zaferi → sonsuza devam
    act(pg, 'new')
    pg.locator('.screen.active .chapter-card[data-id="kul-vadisi"]').click()
    pg.wait_for_timeout(450)
    act(pg, 'start')
    confirm_if(pg)
    pg.wait_for_timeout(800)
    win_now(pg)
    pg.wait_for_timeout(1900)
    check(pg.locator('.screen.active [data-act="continueEndless"]').is_visible(), f'{tag}: sonsuza devam düğmesi')
    pg.screenshot(path=f'{OUT}/{tag}-10-victory.png')
    act(pg, 'continueEndless')
    pg.wait_for_timeout(1200)
    r = ev(pg, "return [st.run.mode, st.run.over, st.run.carry && st.run.carry.waves, G.canCallWave(), st.records.wins['kul-vadisi'].normal];")
    check(r == ['endless', None, 30, True, 2], f'{tag}: sonsuza devam {r}')
    check(pg.locator('[data-el="waveTotal"]').inner_text() == '/∞', f'{tag}: devamda HUD /∞')
    pg.screenshot(path=f'{OUT}/{tag}-11-continued.png')
    pg.locator('[data-el="waveBtn"]').click()
    pg.wait_for_timeout(400)
    check(ev(pg, 'return st.run.wave;') == 31, f'{tag}: 31. dalga başlamalı')

    # 7) harita olayları (her bölüm) ve Kâbus
    if shots:
        for mid in ['kul-vadisi', 'ayaz-gecidi', 'kara-bataklik', 'kor-ocaklari', 'bosluk-tahti']:
            ev(pg, f"""S.clearRun(); G.newGame('hard', '{mid}');
              (await import('./js/state.js')).setScene('game');""")
            pg.wait_for_timeout(300)
            ev(pg, """const cells = []; for (let r = 2; r < st.map.rows - 2; r++) for (let c = 0; c < st.map.cols; c++) if (S.isBuildable(c, r)) cells.push([c, r]);
              st.run.souls = 99999; for (let i = 0; i < 10; i++) { const [c, r] = cells[(i * 7) % cells.length]; G.build('archer', c, r); }
              st.run.wave = 4; G.callWave(); for (let i = 0; i < 120; i++) G.update(1 / 60); st.run.eventT = 0.01; G.update(1 / 60);""")
            pg.wait_for_timeout(450)
            kinds = ev(pg, "return st.run.effects.map((f) => f.kind);")
            check(any(k.startswith('ev_') for k in kinds), f'{tag}: {mid} olayı başlamadı {kinds}')
            pg.screenshot(path=f'{OUT}/{tag}-ev-{mid}-warn.png')
            ev(pg, "for (let i = 0; i < 130; i++) { G.update(1 / 60); st.run.lives = 12; }")
            pg.wait_for_timeout(350)
            pg.screenshot(path=f'{OUT}/{tag}-ev-{mid}-act.png')
        # Kâbus: seçkinler ve kükreme
        r = ev(pg, """const E = await import('./js/events.js'); const seen = []; const off = E.on(E.EV.BOSS_ABILITY, (b, k) => seen.push(k));
          S.clearRun(); G.newGame('hard', 'kul-vadisi'); st.run.souls = 99999; let elites = 0;
          for (let w = 0; w < 12; w++) { st.run.wave = 6 + w; G.callWave(); for (let i = 0; i < 900; i++) { G.update(1 / 30); st.run.lives = 12; }
            elites += st.run.enemies.filter((e) => e.elite).length; st.run.enemies.length = 0; st.run.spawners.length = 0; st.run.waveLeft.clear(); }
          st.run.wave = 9; G.callWave(); for (let i = 0; i < 1200; i++) { G.update(1 / 30); st.run.lives = 12; }
          const boss = st.run.enemies.find((e) => e.boss); off();
          return [elites > 0, !!boss && boss.wrath, seen.includes('roar')];""")
        check(r == [True, True, True], f'{tag}: Kâbus seçkin/öfke {r}')
    ctx.close()


with sync_playwright() as p:
    b = p.chromium.launch()
    run('pc', dict(viewport={'width': 1366, 'height': 768}), True)
    run('phone', dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True), True)
    b.close()

print('\n'.join(errs[:30]) or 'konsol hatası yok')
print('SONUÇ:', 'BAŞARILI' if not fails and not errs else f'{len(fails)} hata, {len(errs)} konsol mesajı')
sys.exit(1 if fails or errs else 0)
