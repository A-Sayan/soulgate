// Ekonomi ölçümü: bot bir bölümü oynarken ruhun nereden geldiğini ve haritanın
// ne kadar çabuk "doyduğunu" (her yer dolu, her kule en üstte) dalga dalga yazar.
// Kullanım: node dev/economy.mjs [bölümler|all] [zorluklar] [profil] [plan]
//   örn. node dev/economy.mjs all easy,normal full classic
// Sütunlar (5., 10., ... 30. dalganın sonunda):
//   kule/yer  = kurulu kule / kurulabilir hücre      dolu% = yatırımın, haritanın tamamını en üste
//   çıkarmanın kaçta kaçı (yaklaşık)                  boş = harcanmamış ruh
// Sonda: ruh kaynakları (öldürme / dalga bonusu / erken çağrı / kuyu), normal dalga ile patron
// dalgasında kaybedilen can ve patronların öldüğünde yolun yüzde kaçını yürüdüğü (yüksek = zorlu;
// 100+ = kaleye ulaştı, artı kalan canının yüzdesi).
import { MAP_ORDER, TOWERS } from '../js/config.js';
import { state, isBuildable } from '../js/state.js';
import * as game from '../js/game.js';
import { EV, on } from '../js/events.js';
import { runBot, makeProfile } from './sim.mjs';
import { PLANS } from './plans.mjs';

const args = process.argv.slice(2);
const maps = args[0] && args[0] !== 'all' ? args[0].split(',') : MAP_ORDER;
const diffs = (args[1] ?? 'easy,normal').split(',');
const pk = args[2] ?? 'full';
const pn = args[3] ?? 'classic';
const plan = PLANS[pn].split(',');
const loadout = [...new Set(plan)].slice(0, 6);

/** Bir kulenin en üste çıkana kadar toplam maliyeti (seviyeler + ucuz ustalık). */
function fullCost(type) {
  const def = TOWERS[type];
  let c = def.levels.reduce((s, l) => s + l.cost, 0);
  if (def.masteries && def.masteries.length) c += Math.min(...def.masteries.map((m) => m.cost));
  return c;
}

const totals = {};
for (const mapId of maps) {
  for (const d of diffs) {
    const src = { kill: 0, clear: 0, early: 0, well: 0 };
    const reach = [];
    const lost = { normal: 0, boss: 0 };
    const marks = [];
    let cells = 0;
    let avgFull = 0;
    const offs = [
      on(EV.KILL, (e, s) => { src.kill += s; }),
      on(EV.WAVE_CLEAR, (n, b) => { src.clear += b; }),
      on(EV.WAVE_START, (n, b) => {
        src.early += b || 0;
        if (n === 1) {
          // harita kuruldu: kurulabilir hücre sayısı ve yükleme ortalamasıyla "tam doluluk"
          for (let r = 0; r < state.map.rows; r++) for (let c = 0; c < state.map.cols; c++) if (isBuildable(c, r)) cells++;
          cells += state.run.towers.length;
          avgFull = loadout.reduce((s, t) => s + fullCost(t), 0) / loadout.length;
        }
      }),
      on(EV.GENERATE, (t, a, kind) => { if (kind !== 'mend') src.well += a; }),
      on(EV.BOSS_DIE, (e) => {
        const len = state.map.polys[e.path].length;
        reach.push(`${e.type.replace('boss_', '')}:${Math.round((1 - e.rem / len) * 100)}`);
      }),
      on(EV.LEAK, (e, l) => {
        if (e.boss) reach.push(`${e.type.replace('boss_', '')}:${100 + Math.round((e.hp / e.maxHp) * 100)}`);
        const boss = e.boss || [10, 20, 30].includes(state.run.wave);
        lost[boss ? 'boss' : 'normal'] += l;
      }),
      on(EV.WAVE_CLEAR, (n) => {
        if (n % 5) return;
        const run = state.run;
        const inv = run.towers.reduce((s, t) => s + t.invested, 0);
        const maxed = run.towers.filter((t) => !game.upgradeOptions(t)).length;
        marks.push(`${String(run.towers.length).padStart(2)}/${cells} ${String(Math.round(inv / (cells * avgFull) * 100)).padStart(3)}% m${String(maxed).padStart(2)} ${String(run.souls).padStart(5)}`);
      }),
    ];
    const r = runBot({ mapId, difficulty: d, profile: makeProfile(pk, loadout), plan });
    offs.forEach((f) => f());
    const all = src.kill + src.clear + src.early + src.well;
    const pct = (v) => `${Math.round((v / all) * 100)}%`;
    console.log(`${mapId.padEnd(14)} ${d.padEnd(6)} ${r.victory ? `W${String(r.lives).padStart(2)}` : `L${String(r.wave).padStart(2)}`}  ${marks.join(' | ')}`);
    console.log(`${''.padEnd(22)} ruh ${all}: öldürme ${pct(src.kill)} bonus ${pct(src.clear)} erken ${pct(src.early)} kuyu ${pct(src.well)} · can kaybı normal ${lost.normal} patron ${lost.boss} · patron yolu% ${reach.join(' ')}`);
    const k = d;
    totals[k] = totals[k] ?? { lostN: 0, lostB: 0, n: 0, wins: 0 };
    totals[k].lostN += lost.normal;
    totals[k].lostB += lost.boss;
    totals[k].n += 1;
    totals[k].wins += r.victory ? 1 : 0;
  }
}
console.log('profil', pk, 'plan', pn, '· sütun: kule/yer doluluk% m(en üstteki kule) boştaRuh');
for (const [k, v] of Object.entries(totals)) console.log(`${k}: kazanılan ${v.wins}/${v.n}, normal dalgada kayıp can ${v.lostN}, patron dalgasında ${v.lostB}`);
