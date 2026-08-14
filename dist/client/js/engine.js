(function (root) {
  'use strict';

  const COLORS = ['red', 'black', 'white'];
  const FACE_COUNT = 6;

  function splitBlackBreak(breakSymbols) {
    const total = clampInt(breakSymbols, 0, 99);
    return {
      direct: Math.min(1, total),
      normal: Math.max(0, total - 1)
    };
  }

  function conversionDamage(breakSymbols, hopeSymbols, pool) {
    const hopeTokens = clampInt(pool.hope);
    const hopeDamage = Math.min(clampInt(hopeSymbols), hopeTokens);
    const remainingHope = hopeTokens - hopeDamage;
    const breakDamage = Math.min(
      clampInt(breakSymbols),
      clampInt(pool.break) + remainingHope
    );
    return { hopeDamage, breakDamage, total: hopeDamage + breakDamage };
  }
  const EPSILON = 1e-12;
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

  function hitDistribution(attackDice, toHit, modifier, rerolls = 0) {
    const n = clampInt(attackDice, 0, 20);
    const p = hitProbability(toHit, modifier);
    const availableRerolls = clampInt(rerolls, 0, 20);
    const probabilities = Array(n + 1).fill(0);

    for (let firstHits = 0; firstHits <= n; firstHits += 1) {
      const firstProbability = binomial(n, firstHits) * p ** firstHits * (1 - p) ** (n - firstHits);
      const diceRerolled = Math.min(availableRerolls, n - firstHits);
      for (let rerollHits = 0; rerollHits <= diceRerolled; rerollHits += 1) {
        probabilities[firstHits + rerollHits] += firstProbability
          * binomial(diceRerolled, rerollHits)
          * p ** rerollHits
          * (1 - p) ** (diceRerolled - rerollHits);
      }
    }

    return probabilities.map((probability, hits) => ({ hits, probability }));
  }

  function convolvePowerDice(counts) {
    let states = new Map([['0|0|0', { power: 0, break: 0, hope: 0, probability: 1 }]]);
    for (const color of COLORS) {
      const count = clampInt(counts[color], 0, 40);
      for (let dieIndex = 0; dieIndex < count; dieIndex += 1) {
        const next = new Map();
        for (const state of states.values()) {
          for (const dieFace of dice()[color]) {
            const power = state.power + dieFace.power;
            const breakSymbols = state.break + dieFace.break;
            const hopeSymbols = state.hope + dieFace.hope;
            const key = `${power}|${breakSymbols}|${hopeSymbols}`;
            const probability = state.probability / FACE_COUNT;
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
    for (const color of COLORS) {
      result[color] = clampInt(portrait[color], 0, 10)
        + clampInt(weapon.extraDice[color], 0, 10)
        + clampInt(weapon.perHit[color], 0, 10) * hits;
    }
    return result;
  }

  function damageFromState(state, weapon, pool) {
    const converted = conversionDamage(state.break, state.hope, pool);
    return state.power
      + converted.total
      + clampInt(weapon.bonusDamage)
      + clampInt(pool.power);
  }

  const emptyRollState = () => ({
    eligible: Array(COLORS.length * FACE_COUNT).fill(0),
    locked: Array(COLORS.length * FACE_COUNT).fill(0),
    black: Array(COLORS.length * FACE_COUNT).fill(0)
  });

  const faceSlot = (colorIndex, faceIndex) => colorIndex * FACE_COUNT + faceIndex;
  const rollStateKey = state => `${state.eligible.join(',')}|${state.locked.join(',')}|${state.black.join(',')}`;

  function cloneRollState(state) {
    return {
      eligible: state.eligible.slice(),
      locked: state.locked.slice(),
      black: state.black.slice()
    };
  }

  function transitionReroll(state, sourceSlot, destinationFace, type) {
    const next = cloneRollState(state);
    const colorIndex = Math.floor(sourceSlot / FACE_COUNT);
    next.eligible[sourceSlot] -= 1;
    next[type === 'black' ? 'black' : 'locked'][faceSlot(colorIndex, destinationFace)] += 1;
    return next;
  }

  function symbolsFromRollState(state) {
    const symbols = { power: 0, break: 0, hope: 0, blackBreak: 0 };
    for (let slot = 0; slot < state.eligible.length; slot += 1) {
      const color = COLORS[Math.floor(slot / FACE_COUNT)];
      const dieFace = dice()[color][slot % FACE_COUNT];
      const normalCount = state.eligible[slot] + state.locked[slot];
      const blackCount = state.black[slot];
      const blackBreak = splitBlackBreak(dieFace.break);
      symbols.power += dieFace.power * (normalCount + blackCount);
      symbols.break += dieFace.break * normalCount + blackBreak.normal * blackCount;
      symbols.blackBreak += blackBreak.direct * blackCount;
      symbols.hope += dieFace.hope * (normalCount + blackCount);
    }
    return symbols;
  }

  function damageFromRollState(state, weapon, pool) {
    const symbols = symbolsFromRollState(state);
    const converted = conversionDamage(symbols.break, symbols.hope, pool);
    return symbols.power
      + symbols.blackBreak
      + converted.total
      + clampInt(weapon.bonusDamage)
      + clampInt(pool.power);
  }

  function distributionScore(distribution, at) {
    let woundChance = 0;
    let expectedDamage = 0;
    for (const [damage, probability] of distribution) {
      if (damage >= at) woundChance += probability;
      expectedDamage += damage * probability;
    }
    return { woundChance, expectedDamage };
  }

  function isBetterScore(candidate, current) {
    if (candidate.woundChance > current.woundChance + EPSILON) return true;
    return Math.abs(candidate.woundChance - current.woundChance) <= EPSILON
      && candidate.expectedDamage > current.expectedDamage + EPSILON;
  }

  function rerollSymbolDistribution(regularByColor, blackByColor, cache) {
    const cacheKey = `${regularByColor.join(',')}|${blackByColor.join(',')}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    let states = new Map([['0|0|0|0', { power: 0, break: 0, hope: 0, blackBreak: 0, probability: 1 }]]);
    for (const type of ['regular', 'black']) {
      const counts = type === 'regular' ? regularByColor : blackByColor;
      for (let colorIndex = 0; colorIndex < COLORS.length; colorIndex += 1) {
        const color = COLORS[colorIndex];
        for (let dieIndex = 0; dieIndex < counts[colorIndex]; dieIndex += 1) {
          const next = new Map();
          for (const state of states.values()) {
            for (const dieFace of dice()[color]) {
              const blackBreak = splitBlackBreak(dieFace.break);
              const power = state.power + dieFace.power;
              const breakSymbols = state.break + (type === 'regular' ? dieFace.break : blackBreak.normal);
              const hope = state.hope + dieFace.hope;
              const directBlackBreak = state.blackBreak + (type === 'black' ? blackBreak.direct : 0);
              const key = `${power}|${breakSymbols}|${hope}|${directBlackBreak}`;
              const probability = state.probability / FACE_COUNT;
              const existing = next.get(key);
              if (existing) existing.probability += probability;
              else next.set(key, { power, break: breakSymbols, hope, blackBreak: directBlackBreak, probability });
            }
          }
          states = next;
        }
      }
    }
    cache.set(cacheKey, states);
    return states;
  }

  function planDistribution(state, regularCounts, blackCounts, weapon, pool, outcomeCache) {
    const base = cloneRollState(state);
    const rerollsByColor = {
      regular: Array(COLORS.length).fill(0),
      black: Array(COLORS.length).fill(0)
    };
    for (let slot = 0; slot < state.eligible.length; slot += 1) {
      base.eligible[slot] -= regularCounts[slot] + blackCounts[slot];
      const colorIndex = Math.floor(slot / FACE_COUNT);
      rerollsByColor.regular[colorIndex] += regularCounts[slot];
      rerollsByColor.black[colorIndex] += blackCounts[slot];
    }

    const fixed = symbolsFromRollState(base);
    const rerolled = rerollSymbolDistribution(rerollsByColor.regular, rerollsByColor.black, outcomeCache);
    const distribution = new Map();
    for (const outcome of rerolled.values()) {
      const converted = conversionDamage(
        fixed.break + outcome.break,
        fixed.hope + outcome.hope,
        pool
      );
      const damage = fixed.power + outcome.power
        + fixed.blackBreak + outcome.blackBreak
        + converted.total
        + clampInt(weapon.bonusDamage)
        + clampInt(pool.power);
      distribution.set(damage, (distribution.get(damage) || 0) + outcome.probability);
    }
    return distribution;
  }

  function optimizePowerRoll(state, regularLimit, blackLimit, weapon, pool, at, memo) {
    const key = `${rollStateKey(state)}|${regularLimit}|${blackLimit}`;
    if (memo.has(key)) return memo.get(key);

    const currentDamage = damageFromRollState(state, weapon, pool);
    let best = {
      distribution: new Map([[currentDamage, 1]]),
      score: { woundChance: currentDamage >= at ? 1 : 0, expectedDamage: currentDamage },
      action: null
    };
    const regularCounts = Array(state.eligible.length).fill(0);
    const blackCounts = Array(state.eligible.length).fill(0);
    const activeSlots = state.eligible.map((count, slot) => count ? slot : -1).filter(slot => slot >= 0);
    memo.rerollOutcomes = memo.rerollOutcomes || new Map();

    function visit(position, regularLeft, blackLeft, used) {
      if (position === activeSlots.length) {
        if (!used) return;
        const distribution = planDistribution(state, regularCounts, blackCounts, weapon, pool, memo.rerollOutcomes);
        const score = distributionScore(distribution, at);
        if (isBetterScore(score, best.score)) {
          best = {
            distribution,
            score,
            action: { regular: regularCounts.slice(), black: blackCounts.slice() }
          };
        }
        return;
      }

      const slot = activeSlots[position];
      const count = state.eligible[slot];
      for (let regular = 0; regular <= Math.min(count, regularLeft); regular += 1) {
        for (let black = 0; black <= Math.min(count - regular, blackLeft); black += 1) {
          regularCounts[slot] = regular;
          blackCounts[slot] = black;
          visit(position + 1, regularLeft - regular, blackLeft - black, used + regular + black);
        }
      }
      regularCounts[slot] = 0;
      blackCounts[slot] = 0;
    }

    visit(0, clampInt(regularLimit, 0, 20), clampInt(blackLimit, 0, 20), 0);
    memo.set(key, best);
    return best;
  }

  function initialPowerRollStates(counts) {
    let states = new Map([[rollStateKey(emptyRollState()), { state: emptyRollState(), probability: 1 }]]);
    for (let colorIndex = 0; colorIndex < COLORS.length; colorIndex += 1) {
      const color = COLORS[colorIndex];
      for (let dieIndex = 0; dieIndex < clampInt(counts[color], 0, 40); dieIndex += 1) {
        const next = new Map();
        for (const entry of states.values()) {
          for (let faceIndex = 0; faceIndex < FACE_COUNT; faceIndex += 1) {
            const state = cloneRollState(entry.state);
            state.eligible[faceSlot(colorIndex, faceIndex)] += 1;
            const key = rollStateKey(state);
            const existing = next.get(key);
            if (existing) existing.probability += entry.probability / FACE_COUNT;
            else next.set(key, { state, probability: entry.probability / FACE_COUNT });
          }
        }
        states = next;
      }
    }
    return states;
  }

  function calculate(config) {
    const { weapon, pool, portrait, monster } = config;
    const modifier = Number(weapon.attackBonus || 0) + clampInt(pool.opening);
    const hitDist = hitDistribution(weapon.attackDice, monster.toHit, modifier, pool.attackRerolls);
    const damageMap = new Map([[0, hitDist[0]?.probability || 1]]);
    let hitChance = 0;
    let woundChance = 0;
    let conditionalExpectedNumerator = 0;
    let minOnHit = Infinity;
    let maxDamage = 0;

    for (const hitState of hitDist) {
      if (hitState.hits === 0 || hitState.probability === 0) continue;
      hitChance += hitState.probability;
      const counts = powerDiceForHits(weapon, portrait, hitState.hits);
      if (!clampInt(pool.powerRerolls, 0, 20) && !clampInt(pool.black, 0, 20)) {
        const powerStates = convolvePowerDice(counts);
        for (const state of powerStates.values()) {
          const damage = damageFromState(state, weapon, pool);
          const probability = hitState.probability * state.probability;
          damageMap.set(damage, (damageMap.get(damage) || 0) + probability);
          conditionalExpectedNumerator += damage * probability;
          if (damage >= clampInt(monster.at)) woundChance += probability;
          minOnHit = Math.min(minOnHit, damage);
          maxDamage = Math.max(maxDamage, damage);
        }
        continue;
      }
      const initialStates = initialPowerRollStates(counts);
      const memo = new Map();
      for (const initial of initialStates.values()) {
        const optimized = optimizePowerRoll(
          initial.state,
          clampInt(pool.powerRerolls, 0, 20),
          clampInt(pool.black, 0, 20),
          weapon,
          pool,
          clampInt(monster.at),
          memo
        );
        for (const [damage, finalProbability] of optimized.distribution) {
          const probability = hitState.probability * initial.probability * finalProbability;
          damageMap.set(damage, (damageMap.get(damage) || 0) + probability);
          conditionalExpectedNumerator += damage * probability;
          if (damage >= clampInt(monster.at)) woundChance += probability;
          minOnHit = Math.min(minOnHit, damage);
          maxDamage = Math.max(maxDamage, damage);
        }
      }
    }

    const distribution = [...damageMap.entries()]
      .map(([damage, probability]) => ({ damage, probability }))
      .sort((a, b) => a.damage - b.damage);
    const expectedDamage = distribution.reduce((sum, item) => sum + item.damage * item.probability, 0);

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

  function attackHits(roll, monster, modifier) {
    return roll === 10 || (roll !== 1 && roll + modifier >= monster.toHit);
  }

  function simulate(config, rng = Math.random) {
    const { weapon, pool, portrait, monster } = config;
    const modifier = Number(weapon.attackBonus || 0) + clampInt(pool.opening);
    const attackRolls = [];
    for (let i = 0; i < clampInt(weapon.attackDice, 0, 20); i += 1) {
      const roll = Math.floor(rng() * 10) + 1;
      attackRolls.push({ roll, initialRoll: roll, rerolled: false, hit: attackHits(roll, monster, modifier) });
    }
    let attackRerollsLeft = clampInt(pool.attackRerolls, 0, 20);
    for (const die of attackRolls) {
      if (die.hit || attackRerollsLeft <= 0) continue;
      die.roll = Math.floor(rng() * 10) + 1;
      die.rerolled = true;
      die.hit = attackHits(die.roll, monster, modifier);
      attackRerollsLeft -= 1;
    }
    const hits = attackRolls.filter(die => die.hit).length;
    attackRolls.forEach(die => { die.total = die.roll === 1 || die.roll === 10 ? die.roll : die.roll + modifier; });
    if (hits === 0) return { fullMiss: true, hits: 0, attackRolls, powerRolls: [], powerRerolls: [], damage: 0, wound: false };

    const counts = powerDiceForHits(weapon, portrait, hits);
    const powerRolls = [];
    let state = emptyRollState();
    for (let colorIndex = 0; colorIndex < COLORS.length; colorIndex += 1) {
      const color = COLORS[colorIndex];
      for (let i = 0; i < counts[color]; i += 1) {
        const rolledFace = Math.floor(rng() * FACE_COUNT);
        state.eligible[faceSlot(colorIndex, rolledFace)] += 1;
        powerRolls.push({ color, faceIndex: rolledFace, initialFaceIndex: rolledFace, rerolled: false, black: false });
      }
    }

    const memo = new Map();
    const powerRerolls = [];
    const optimized = optimizePowerRoll(
      state,
      clampInt(pool.powerRerolls, 0, 20),
      clampInt(pool.black, 0, 20),
      weapon,
      pool,
      clampInt(monster.at),
      memo
    );
    if (optimized.action) {
      for (const type of ['regular', 'black']) {
        const selections = optimized.action[type];
        for (let slot = 0; slot < selections.length; slot += 1) {
          for (let selection = 0; selection < selections[slot]; selection += 1) {
            const colorIndex = Math.floor(slot / FACE_COUNT);
            const color = COLORS[colorIndex];
            const oldFace = slot % FACE_COUNT;
            const die = powerRolls.find(item => !item.rerolled && item.color === color && item.faceIndex === oldFace);
            const newFace = Math.floor(rng() * FACE_COUNT);
            state = transitionReroll(state, slot, newFace, type);
            die.faceIndex = newFace;
            die.rerolled = true;
            die.black = type === 'black';
            powerRerolls.push({ type, color, from: dice()[color][oldFace].label, to: dice()[color][newFace].label });
          }
        }
      }
    }

    const symbols = symbolsFromRollState(state);
    const damage = damageFromRollState(state, weapon, pool);
    const renderedPowerRolls = powerRolls.map(item => ({
      color: item.color,
      ...dice()[item.color][item.faceIndex],
      rerolled: item.rerolled,
      black: item.black
    }));
    return { fullMiss: false, hits, attackRolls, powerRolls: renderedPowerRolls, powerRerolls, symbols, damage, wound: damage >= monster.at };
  }

  root.KF = root.KF || {};
  root.KF.engine = {
    calculate,
    simulate,
    hitProbability,
    hitDistribution,
    convolvePowerDice,
    damageFromState,
    powerDiceForHits,
    splitBlackBreak,
    conversionDamage
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
