// Denge tablosu: her bölüm × zorluk × profil × plan için bot sonucu.
import { MAP_ORDER } from '../js/config.js';
import { runBot, makeProfile } from './sim.mjs';

import { PLANS } from './plans.mjs';
export { PLANS };
const args = process.argv.slice(2);
const maps = args[0] && args[0] !== 'all' ? args[0].split(',') : MAP_ORDER;
const diffs = (args[1] ?? 'easy,normal,hard').split(',');
const profs = (args[2] ?? 'full,mid').split(',');
// varsayılan: "starter" hariç bütün planlar (o yalnızca "start" profiliyle anlamlı)
const plans = (args[3] ?? Object.keys(PLANS).filter((p) => p !== 'starter').join(',')).split(',');
for (const mapId of maps) {
  for (const pk of profs) {
    const row = [];
    for (const d of diffs) {
      const cells = [];
      for (const pn of plans) {
        const plan = PLANS[pn].split(',');
        const loadout = [...new Set(plan)].slice(0, 6);
        const r = runBot({ mapId, difficulty: d, profile: makeProfile(pk, loadout), plan });
        cells.push(r.victory ? `W${String(r.lives).padStart(2)}` : `L${String(r.wave).padStart(2)}`);
      }
      row.push(`${d[0]}:${cells.join(' ')}`);
    }
    console.log(`${mapId.padEnd(14)} ${pk.padEnd(4)} ${row.join(' | ')}`);
  }
}
console.log('plans:', plans.join(','));
