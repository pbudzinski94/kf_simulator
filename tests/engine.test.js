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

const oneAttackReroll = engine.hitDistribution(2, 7, 0, 1);
approx(oneAttackReroll[0].probability, 0.216);
approx(oneAttackReroll[1].probability, 0.432);
approx(oneAttackReroll[2].probability, 0.352);

const allAttackRerolls = engine.hitDistribution(2, 7, 0, 2);
approx(allAttackRerolls[0].probability, 0.1296);

const singleRedConfig = {
  monster: { toHit: 1, at: 2 },
  portrait: { red: 1, black: 0, white: 0 },
  weapon: {
    attackDice: 1, attackBonus: 0, bonusDamage: 0,
    perHit: { red: 0, black: 0, white: 0 },
    extraDice: { red: 0, black: 0, white: 0 }
  },
  pool: { opening: 0, break: 0, hope: 0, power: 0, attackRerolls: 0, powerRerolls: 1, black: 0 }
};
const regularPowerReroll = engine.calculate(singleRedConfig);
approx(regularPowerReroll.woundChance, 0.9 * 11 / 36);
approx(regularPowerReroll.damageDistribution.reduce((sum, item) => sum + item.probability, 0), 1, 1e-8);

const blackPowerReroll = engine.calculate({
  ...singleRedConfig,
  pool: { ...singleRedConfig.pool, powerRerolls: 0, black: 1 }
});
approx(blackPowerReroll.woundChance, 0.9 * 7 / 12);
approx(blackPowerReroll.damageDistribution.reduce((sum, item) => sum + item.probability, 0), 1, 1e-8);

// With 1 base Power and 1 Break token, Black results containing respectively
// 1, 2 and 3 Breaks deal 2, 3 and 3 damage.
for (const [breakSymbols, expectedDamage] of [[1, 2], [2, 3], [3, 3]]) {
  const split = engine.splitBlackBreak(breakSymbols);
  const damage = 1 + split.direct + Math.min(split.normal, 1);
  if (damage !== expectedDamage) {
    throw new Error(`Black result with ${breakSymbols} Break expected ${expectedDamage}, got ${damage}`);
  }
}

// Hope converts Hope symbols first, then uses only its remainder on Breaks.
const hopeFirst = engine.conversionDamage(1, 2, { break: 0, hope: 1 });
if (hopeFirst.hopeDamage !== 1 || hopeFirst.breakDamage !== 0 || hopeFirst.total !== 1) {
  throw new Error(`Hope priority is incorrect: ${JSON.stringify(hopeFirst)}`);
}
const flexibleHope = engine.conversionDamage(2, 1, { break: 0, hope: 2 });
if (flexibleHope.hopeDamage !== 1 || flexibleHope.breakDamage !== 1 || flexibleHope.total !== 2) {
  throw new Error(`Hope should convert a remaining Break: ${JSON.stringify(flexibleHope)}`);
}
const noDoubleSpend = engine.conversionDamage(2, 1, { break: 1, hope: 2 });
if (noDoubleSpend.total !== 3) {
  throw new Error(`Break symbols were counted more than once: ${JSON.stringify(noDoubleSpend)}`);
}
if (engine.damageFromState(
  { power: 1, break: 2, hope: 1 },
  { bonusDamage: 0 },
  { break: 1, hope: 2, power: 0 }
) !== 4) {
  throw new Error('Flexible Hope was not included in final damage.');
}

const zeroAt = engine.calculate({ ...baseConfig, monster: { toHit: 7, at: 0 } });
approx(zeroAt.woundChance, zeroAt.hitChance);

const impossible = engine.calculate({ ...baseConfig, monster: { toHit: 99, at: 99 } });
if (impossible.woundChance !== 0) throw new Error('Impossible AT should not wound.');

const guaranteedByPool = engine.calculate({ ...baseConfig, monster: { toHit: 1, at: 5 }, pool: { opening: 0, break: 0, hope: 0, power: 5 } });
approx(guaranteedByPool.woundChance, guaranteedByPool.hitChance);

console.log('All engine tests passed.');
