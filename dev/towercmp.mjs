import { runBot, makeProfile } from './sim.mjs';
const [mapId = 'kara-bataklik', d = 'hard'] = process.argv.slice(2);
const types = ['archer', 'mortar', 'frost', 'poison', 'tesla', 'curse', 'lance', 'prism', 'flame', 'hunter', 'bell', 'well'];
for (const x of types) {
  const plan = ['archer', 'frost', x, x, x, 'archer', x, x, x, 'frost', x, x];
  const res = [];
  for (let k = 0; k < 3; k++) {
    const r = runBot({ mapId, difficulty: d, profile: makeProfile('full', [...new Set(plan)]), plan });
    res.push(r.victory ? `W${r.lives}` : `L${r.wave}`);
  }
  console.log(x.padEnd(8), res.join(' '));
}
