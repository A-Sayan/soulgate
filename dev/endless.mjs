// Sonsuz Gece: botun kaçıncı dalgaya kadar dayandığı ve kazandığı altın (1.5.0).
// Kullanım: node dev/endless.mjs [bölümler|all] [zorluklar] [profiller] [tekrar]
// Örnek:    node dev/endless.mjs all normal full 2
import { MAP_ORDER } from '../js/config.js';
import { runBot, makeProfile } from './sim.mjs';
import { PLANS } from './plans.mjs';
import { runReward } from '../js/meta.js';

const args = process.argv.slice(2);
const maps = args[0] && args[0] !== 'all' ? args[0].split(',') : MAP_ORDER;
const diffs = (args[1] ?? 'normal').split(',');
const profs = (args[2] ?? 'full').split(',');
const runs = Number(args[3] ?? 1);
const plans = Object.keys(PLANS).filter((p) => p !== 'starter');
for (const mapId of maps) {
  for (const pk of profs) {
    for (const d of diffs) {
      const waves = [];
      const gold = [];
      for (const pn of plans) {
        for (let k = 0; k < runs; k++) {
          const plan = PLANS[pn].split(',');
          const r = runBot({ mapId, difficulty: d, profile: makeProfile(pk, [...new Set(plan)].slice(0, 6)), plan, maxMinutes: 150, opt: { mode: 'endless' } });
          waves.push(r.wave);
          gold.push(runReward(false, { wave: r.wave, bossKills: Math.floor(r.wave / 10), difficulty: d, mapId, mode: 'endless' }).total);
        }
      }
      const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
      console.log(`${mapId.padEnd(14)} ${pk.padEnd(4)} ${d.padEnd(6)} dalga: ${waves.join(' ')} (ort. ${avg(waves)})  altın ort. ${avg(gold)}`);
    }
  }
}
