// Başsız (headless) oyun simülasyonu: bir bot bölümü oynar.
// Kullanım: node sim.mjs <mapId> <difficulty> [profile=full|mid|start] [seed]
import { TOWERS, MAPS, MAP_BY_ID, SKILLS, SKILL_ORDER, TOWER_ORDER, CASTLE, TIMING, ENEMIES } from '../js/config.js';
import { state, applySettings, applyRecords, applyProfile, isBuildable } from '../js/state.js';
import * as game from '../js/game.js';
import { EV, on } from '../js/events.js';

export function makeProfile(kind, loadout) {
  const allTowers = [...TOWER_ORDER];
  if (kind === 'start') return { gold: 0, towers: ['archer', 'mortar'], skills: {}, castle: {}, sides: {}, loadout };
  const lvl = kind === 'full' ? 3 : 2;
  const castleLv = kind === 'full' ? 5 : 2;
  const skills = Object.fromEntries(SKILL_ORDER.map((s) => [s, lvl]));
  const castle = Object.fromEntries(Object.keys(CASTLE.upgrades).map((k) => [k, castleLv]));
  return { gold: 0, towers: allTowers, skills, castle, rightBuilt: kind === 'full', sides: { left: 'meteor', right: kind === 'full' ? 'thunder' : null }, loadout };
}

export function runBot({ mapId, difficulty, profile, plan, sides, verbose = false, maxMinutes = 60 }) {
  applySettings({ autoWave: false });
  applyRecords(null);
  applyProfile(profile);
  if (sides) state.profile.sides = sides;
  game.newGame(difficulty, mapId);
  const run = state.run;
  const map = state.map;
  let result = null;
  const offs = [];
  const leaks = {};
  offs.push(on(EV.LEAK, (e, lost) => { const k = `w${run.wave}:${e.type}${e.boss ? `(${Math.round(e.hp / e.maxHp * 100)}%)` : ''}`; leaks[k] = (leaks[k] ?? 0) + lost; }));
  offs.push(on(EV.RUN_END, (v, stats) => { result = { victory: v, wave: stats.wave, lives: stats.lives, kills: stats.kills, leaks }; }));
  // aday hücreler: yol kapsamı yüksek olanlar önce
  const cells = [];
  for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) if (isBuildable(c, r)) cells.push([c, r]);
  const cov = (c, r, range) => game.pathCoverage(c, r, range);
  let planIdx = 0;
  const step = TIMING.step;
  let t = 0;
  let mIdx = 0;
  while (!result && t < maxMinutes * 60) {
    // inşa / yükseltme kararı her 0.5 sn
    if (Math.round(t / step) % 30 === 0) {
      let acted = true;
      while (acted) {
        acted = false;
        const want = plan[planIdx % plan.length];
        const def = TOWERS[want];
        const free = cells.filter(([c, r]) => isBuildable(c, r));
        // plan bitince: bütün kuleler tam yükseltildiyse plana baştan devam (gerçek oyuncu gibi ruh harcanır)
        const allMaxed = run.towers.every((tw) => !game.upgradeOptions(tw));
        if ((planIdx < plan.length || allMaxed) && free.length && run.souls >= def.levels[0].cost) {
          const range = def.levels[0].range;
          free.sort((a, b) => cov(b[0], b[1], def.economy ? 0.1 : range) - cov(a[0], a[1], def.economy ? 0.1 : range));
          // ekonomi/destek: yol kapsamı önemsiz (kuyu yola uzak, çan kulelerin ortasında)
          let spot = free[0];
          if (def.economy) spot = free[free.length - 1];
          if (def.support) {
            let best = -1;
            for (const [c, r] of free) {
              const n = run.towers.filter((tw) => !TOWERS[tw.type].support && !TOWERS[tw.type].economy && Math.hypot(tw.c - c, tw.r - r) <= 1.6).length;
              if (n > best) { best = n; spot = [c, r]; }
            }
          }
          if (game.build(want, spot[0], spot[1])) { planIdx++; acted = true; continue; }
        }
        // en ucuz yükseltme (plan bittiyse ya da para birikti)
        const opts = run.towers.map((tw) => ({ tw, o: game.upgradeOptions(tw) })).filter((x) => x.o);
        opts.sort((a, b) => (a.o.cost ?? a.o.options[0].cost) - (b.o.cost ?? b.o.options[0].cost));
        const reserve = planIdx < plan.length ? TOWERS[plan[planIdx]].levels[0].cost : 0;
        for (const { tw, o } of opts) {
          const cost = o.kind === 'level' ? o.cost : o.options[0].cost;
          if (run.souls - cost < reserve * 0.5 && planIdx < plan.length && run.wave < 6) continue;
          if (run.souls >= cost) {
            const m = o.kind === 'mastery' ? (mIdx++ % 2) : -1;
            if (game.upgrade(tw, m)) { acted = true; break; }
          }
        }
      }
    }
    // yetenekler
    run.skills.forEach((sk, i) => {
      if (!game.canCast(i).ok) return;
      const alive = run.enemies.filter((e) => e.alive && !e.phased);
      const boss = alive.find((e) => e.boss);
      if (alive.length < 6 && !boss && !(sk.id === 'mend' && run.lives < run.maxLives - 3)) return;
      const def = SKILLS[sk.id];
      if (def.target === 'area') {
        const tg = boss ?? alive.sort((a, b) => a.rem - b.rem)[0];
        game.cast(i, tg.x, tg.y);
      } else game.cast(i);
    });
    // dalga çağır: saha boşsa ya da geri sayım bitmek üzereyse hemen
    if (game.canCallWave() && (run.enemies.length === 0 || run.countdown !== null && run.countdown < 4)) game.callWave();
    game.update(step);
    t += step;
  }
  offs.forEach((f) => f());
  return result ?? { victory: false, wave: run.wave, lives: run.lives, timeout: true, leaks };
}

if (process.argv[1].endsWith('sim.mjs')) {
  const [, , mapId = 'kul-vadisi', difficulty = 'normal', pk = 'full'] = process.argv;
  const plan = (process.argv[5] ?? 'archer,mortar,frost,archer,poison,tesla,mortar,curse,frost,archer,tesla,mortar').split(',');
  const loadout = [...new Set(plan)].slice(0, 6);
  const res = runBot({ mapId, difficulty, profile: makeProfile(pk, loadout), plan });
  console.log(mapId, difficulty, pk, JSON.stringify(res));
}
