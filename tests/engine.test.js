const fs = require('fs');
const vm = require('vm');
const path = require('path');

const context = { console };
context.globalThis = context;
vm.createContext(context);
for (const file of ['js/dice.js', 'js/engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
}

const { engine, POWER_DICE } = context.KF;
const approx = (actual, expected, tolerance = 1e-9) => {
  if (Math.abs(actual - expected) > tolerance) throw new Error(`Expected ${expected}, got ${actual}`);
};

if (POWER_DICE.red.length !== 6 || POWER_DICE.black.length !== 6 || POWER_DICE.white.length !== 6) {
  throw new Error('Every Power Die must have six faces.');
}

approx(engine.hitProbability(7, 0), 0.4);
approx(engine.hitProbability(7, 3), 0.7);
approx(engine.hitProbability(99, 0), 0.1);
approx(engine.hitProbability(1, 99), 0.9);

const baseConfig = {
  monster: { toHit: 7, at: 6 },
  portrait: { red: 1, black: 0, white: 0 },
  weapon: {
    attackDice: 2, attackBonus: 0, bonusDamage: 0,
    perHit: { red: 1, black: 0, white: 0 },
    extraDice: { red: 0, black: 0, white: 0 }
  },
  pool: { opening: 0, break: 0, hope: 0, power: 0 }
};

const result = engine.calculate(baseConfig);
approx(result.hitChance, 0.64);
approx(result.fullMissChance, 0.36);
approx(result.damageDistribution.reduce((sum, item) => sum + item.probability, 0), 1, 1e-8);

const impossible = engine.calculate({ ...baseConfig, monster: { toHit: 99, at: 99 } });
if (impossible.woundChance !== 0) throw new Error('Impossible AT should not wound.');

const guaranteedByPool = engine.calculate({ ...baseConfig, monster: { toHit: 1, at: 5 }, pool: { opening: 0, break: 0, hope: 0, power: 5 } });
approx(guaranteedByPool.woundChance, guaranteedByPool.hitChance);

console.log('All engine tests passed.');
