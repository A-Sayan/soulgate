import { runBot, makeProfile } from './sim.mjs';
import { PLANS } from './plans.mjs';
const [mapId, d, pk, pn] = process.argv.slice(2);
const plan = PLANS[pn].split(',');
const r = runBot({ mapId, difficulty: d, profile: makeProfile(pk, [...new Set(plan)].slice(0, 6)), plan });
console.log(mapId, d, pk, pn, r.victory ? 'WIN' : 'LOSE', r.wave, r.lives);
console.log(Object.entries(r.leaks).map(([k, v]) => `${k}=${v}`).join('  '));
