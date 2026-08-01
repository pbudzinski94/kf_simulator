(function (root) {
  'use strict';

  const dice = () => root.KF.POWER_DICE;
  const clampInt = (value, min = 0, max = 99) => Math.min(max, Math.max(min, Math.trunc(Number(value) || 0)));

  function hitProbability(toHit, modifier) {
    let successes = 0;
    for (let roll = 1; roll <= 10; roll += 1) {
      if (roll === 10 || (roll !== 1 && roll + modifier >= toHit)) successes += 1;
    }
    return successes / 10;
  }

  function binomial(n, k) {
    if (k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    let result = 1;
    for (let i = 1; i <= k; i += 1) result = result * (n - k + i) / i;
    return result;
  }

  function hitDistribution(attackDice, toHit, modifier) {
    const n = clampInt(attackDice, 0, 20);
    const p = hitProbability(toHit, modifier);
    return Array.from({ length: n + 1 }, (_, hits) => ({
      hits,
      probability: binomial(n, hits) * p ** hits * (1 - p) ** (n - hits)
    }));
  }

  function convolvePowerDice(counts) {
    let states = new Map([['0|0|0', { power: 0, break: 0, hope: 0, probability: 1 }]]);
    for (const color of ['red', 'black', 'white']) {
      const count = clampInt(counts[color], 0, 40);
      for (let dieIndex = 0; dieIndex < count; dieIndex += 1) {
        const next = new Map();
        for (const state of states.values()) {
          for (const dieFace of dice()[color]) {
            const power = state.power + dieFace.power;
            const breakSymbols = state.break + dieFace.break;
            const hopeSymbols = state.hope + dieFace.hope;
            const key = `${power}|${breakSymbols}|${hopeSymbols}`;
            const probability = state.probability / 6;
            const existing = next.get(key);
            if (existing) existing.probability += probability;
            else next.set(key, { power, break: breakSymbols, hope: hopeSymbols, probability });
          }
        }
        states = next;
      }
    }
    return states;
  }

  function powerDiceForHits(weapon, portrait, hits) {
    const result = {};
    for (const color of ['red', 'black', 'white']) {
      result[color] = clampInt(portrait[color], 0, 10)
        + clampInt(weapon.extraDice[color], 0, 10)
        + clampInt(weapon.perHit[color], 0, 10) * hits;
    }
    return result;
  }

  function damageFromState(state, weapon, pool) {
    return state.power
      + Math.min(state.break, clampInt(pool.break))
      + Math.min(state.hope, clampInt(pool.hope))
      + clampInt(weapon.bonusDamage)
      + clampInt(pool.power);
  }

  function calculate(config) {
    const { weapon, pool, portrait, monster } = config;
    const modifier = Number(weapon.attackBonus || 0) + clampInt(pool.opening);
    const hitDist = hitDistribution(weapon.attackDice, monster.toHit, modifier);
    const damageMap = new Map([[0, hitDist[0]?.probability || 1]]);
    let hitChance = 0;
    let conditionalExpectedNumerator = 0;
    let minOnHit = Infinity;
    let maxDamage = 0;

    for (const hitState of hitDist) {
      if (hitState.hits === 0 || hitState.probability === 0) continue;
      hitChance += hitState.probability;
      const counts = powerDiceForHits(weapon, portrait, hitState.hits);
      const powerStates = convolvePowerDice(counts);
      for (const state of powerStates.values()) {
        const damage = damageFromState(state, weapon, pool);
        const probability = hitState.probability * state.probability;
        damageMap.set(damage, (damageMap.get(damage) || 0) + probability);
        conditionalExpectedNumerator += damage * probability;
        minOnHit = Math.min(minOnHit, damage);
        maxDamage = Math.max(maxDamage, damage);
      }
    }

    const distribution = [...damageMap.entries()]
      .map(([damage, probability]) => ({ damage, probability }))
      .sort((a, b) => a.damage - b.damage);
    const expectedDamage = distribution.reduce((sum, item) => sum + item.damage * item.probability, 0);
    const woundChance = distribution
      .filter(item => item.damage >= clampInt(monster.at))
      .reduce((sum, item) => sum + item.probability, 0);

    return {
      hitChance,
      fullMissChance: 1 - hitChance,
      woundChance,
      expectedDamage,
      expectedOnHit: hitChance ? conditionalExpectedNumerator / hitChance : 0,
      minOnHit: Number.isFinite(minOnHit) ? minOnHit : 0,
      maxDamage,
      hitDistribution: hitDist,
      damageDistribution: distribution,
      effectiveAttackModifier: modifier
    };
  }

  function randomItem(items, rng = Math.random) {
    return items[Math.floor(rng() * items.length)];
  }

  function simulate(config, rng = Math.random) {
    const { weapon, pool, portrait, monster } = config;
    const modifier = Number(weapon.attackBonus || 0) + clampInt(pool.opening);
    const attackRolls = [];
    let hits = 0;
    for (let i = 0; i < clampInt(weapon.attackDice, 0, 20); i += 1) {
      const roll = Math.floor(rng() * 10) + 1;
      const hit = roll === 10 || (roll !== 1 && roll + modifier >= monster.toHit);
      if (hit) hits += 1;
      attackRolls.push({ roll, hit, total: roll === 1 || roll === 10 ? roll : roll + modifier });
    }
    if (hits === 0) return { fullMiss: true, hits: 0, attackRolls, powerRolls: [], damage: 0, wound: false };

    const counts = powerDiceForHits(weapon, portrait, hits);
    const powerRolls = [];
    const state = { power: 0, break: 0, hope: 0 };
    for (const color of ['red', 'black', 'white']) {
      for (let i = 0; i < counts[color]; i += 1) {
        const rolled = randomItem(dice()[color], rng);
        powerRolls.push({ color, ...rolled });
        state.power += rolled.power;
        state.break += rolled.break;
        state.hope += rolled.hope;
      }
    }
    const damage = damageFromState(state, weapon, pool);
    return { fullMiss: false, hits, attackRolls, powerRolls, symbols: state, damage, wound: damage >= monster.at };
  }

  root.KF = root.KF || {};
  root.KF.engine = { calculate, simulate, hitProbability, hitDistribution, convolvePowerDice, damageFromState };
})(typeof globalThis !== 'undefined' ? globalThis : window);
