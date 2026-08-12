const fs = require('fs');
const vm = require('vm');
const path = require('path');

const context = {};
context.globalThis = context;
vm.createContext(context);
for (const file of ['js/dice.js', 'js/engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
}

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const results = input.weapons.map(weapon => context.KF.engine.calculate({
  weapon,
  pool: input.pool,
  portrait: input.portrait,
  monster: input.monster
}));

process.stdout.write(JSON.stringify(results.map(result => ({
  woundChance: result.woundChance,
  expectedDamage: result.expectedDamage,
  fullMissChance: result.fullMissChance
}))));
