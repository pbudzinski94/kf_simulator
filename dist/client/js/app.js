(function () {
  'use strict';

  const STORAGE_KEY = 'forlorn-forge-config-v1';
  const COLORS = ['red', 'black', 'white'];
  const DEFAULTS = {
    monster: { toHit: 7, at: 6 },
    portrait: { red: 1, black: 0, white: 0 },
    pool: { opening: 2, break: 1, hope: 0, power: 0 },
    weapons: [
      {
        name: 'Knighves', attackDice: 2, attackBonus: 0, bonusDamage: 0,
        perHit: { red: 1, black: 0, white: 0 },
        extraDice: { red: 0, black: 0, white: 0 },
        rerolls: { attack: 0, power: 0 }
      },
      {
        name: 'Broń II', attackDice: 1, attackBonus: 1, bonusDamage: 1,
        perHit: { red: 0, black: 1, white: 0 },
        extraDice: { red: 1, black: 0, white: 0 },
        rerolls: { attack: 0, power: 0 }
      }
    ]
  };

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  let state = loadState();
  let results = [];

  const $ = selector => document.querySelector(selector);
  const pct = value => `${(value * 100).toFixed(value > 0 && value < .01 ? 2 : 1)}%`;
  const num = value => Number(value).toFixed(2).replace('.', ',');
  const safeInt = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved?.weapons?.length === 2) {
        const migrated = deepClone(saved);
        const legacyPool = saved.weapons[0]?.pool;
        migrated.pool = { ...DEFAULTS.pool, ...(saved.pool || legacyPool || {}) };
        migrated.weapons.forEach(weapon => delete weapon.pool);
        return migrated;
      }
    } catch (_) { /* Local storage is optional. */ }
    return deepClone(DEFAULTS);
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* Ignore quota/privacy failures. */ }
  }

  function dieInputs(prefix, values) {
    return COLORS.map(color => `
      <label class="die-field die-${color}">
        <span>${{ red: 'Czerwone', black: 'Czarne', white: 'Białe' }[color]}</span>
        <input data-bind="${prefix}.${color}" type="number" min="0" max="20" value="${values[color]}" />
      </label>`).join('');
  }

  function weaponTemplate(weapon, index) {
    const accent = index === 0 ? '#c89b70' : '#91ad96';
    return `
      <article class="panel weapon-card" data-weapon="${index}" style="--weapon-accent:${accent}">
        <div class="weapon-header">
          <span class="weapon-index">${index + 1}</span>
          <input class="weapon-name" data-bind="name" aria-label="Nazwa broni ${index + 1}" value="${escapeHtml(weapon.name)}" />
        </div>
        <div class="weapon-content">
          <p class="subheading">Attack Roll · kości k10</p>
          <div class="fields-two">
            <label class="field"><span>Liczba kości ataku</span><input data-bind="attackDice" type="number" min="0" max="20" value="${weapon.attackDice}" /></label>
            <label class="field"><span>Bonus do wyniku</span><input data-bind="attackBonus" type="number" min="-20" max="20" value="${weapon.attackBonus}" /></label>
          </div>

          <div class="divider"></div>
          <p class="subheading">Power Dice za każde trafienie</p>
          <div class="fields-three">${dieInputs('perHit', weapon.perHit)}</div>

          <div class="divider"></div>
          <p class="subheading">Bonus po uniknięciu Full Miss</p>
          <label class="field"><span>Stałe dodatkowe obrażenia</span><input data-bind="bonusDamage" type="number" min="0" max="50" value="${weapon.bonusDamage}" /></label>
          <div class="fields-three bonus-dice">${dieInputs('extraDice', weapon.extraDice)}</div>

          <div class="result-strip" id="weapon-result-${index}"></div>
        </div>
      </article>`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function renderWeapons() {
    $('#weapon-grid').innerHTML = state.weapons.map(weaponTemplate).join('');
  }

  function bindInitialValues() {
    $('#monster-to-hit').value = state.monster.toHit;
    $('#monster-at').value = state.monster.at;
    for (const color of COLORS) $(`#portrait-${color}`).value = state.portrait[color];
    for (const key of ['opening', 'break', 'hope', 'power']) $(`#pool-${key}`).value = state.pool[key];
  }

  function setNested(object, path, value) {
    const keys = path.split('.');
    const final = keys.pop();
    const target = keys.reduce((current, key) => current[key], object);
    target[final] = final === 'name' ? value : safeInt(value);
  }

  function configFor(index) {
    const weapon = state.weapons[index];
    return { weapon, pool: state.pool, portrait: state.portrait, monster: state.monster };
  }

  function recalculate() {
    results = state.weapons.map((_, index) => KF.engine.calculate(configFor(index)));
    results.forEach((result, index) => renderWeaponResult(result, index));
    renderComparison();
    renderChart();
    saveState();
  }

  function renderWeaponResult(result, index) {
    $(`#weapon-result-${index}`).innerHTML = `
      <div class="result-primary">
        <div class="metric main"><strong>${pct(result.woundChance)}</strong><span>szansa zadania rany</span></div>
        <div class="metric"><strong>${num(result.expectedDamage)}</strong><span>średnie obrażenia</span></div>
        <div class="metric"><strong>${result.maxDamage}</strong><span>maksimum</span></div>
      </div>
      <div class="result-secondary">
        <span>Trafienie: <b>${pct(result.hitChance)}</b></span>
        <span>Full Miss: <b>${pct(result.fullMissChance)}</b></span>
        <span>Średnia po trafieniu: <b>${num(result.expectedOnHit)}</b></span>
        <span>Zakres po trafieniu: <b>${result.minOnHit}–${result.maxDamage}</b></span>
        <span>Modyfikator k10: <b>${result.effectiveAttackModifier >= 0 ? '+' : ''}${result.effectiveAttackModifier}</b></span>
      </div>`;
  }

  function winner(metric, higherIsBetter = true) {
    const a = results[0][metric];
    const b = results[1][metric];
    if (Math.abs(a - b) < 1e-10) return { text: 'Remis', className: 'tie' };
    const index = (higherIsBetter ? a > b : a < b) ? 0 : 1;
    return { text: state.weapons[index].name, className: '' };
  }

  function renderComparison() {
    const woundWinner = winner('woundChance');
    const averageWinner = winner('expectedDamage');
    const consistencyWinner = winner('fullMissChance', false);
    $('#comparison').innerHTML = [
      ['Największa szansa rany', woundWinner],
      ['Najwyższa średnia', averageWinner],
      ['Najmniej Full Missów', consistencyWinner]
    ].map(([label, value]) => `<div class="comparison-cell"><span>${label}</span><strong class="${value.className}">${escapeHtml(value.text)}</strong></div>`).join('');
  }

  function renderChart() {
    const maps = results.map(result => new Map(result.damageDistribution.map(item => [item.damage, item.probability])));
    const damages = [...new Set(results.flatMap(result => result.damageDistribution.map(item => item.damage)))].sort((a, b) => a - b);
    const maxProb = Math.max(
      ...results.flatMap(result => result.damageDistribution.map(item => item.probability)),
      .001
    );
    $('#chart').innerHTML = damages.map(damage => {
      const a = maps[0].get(damage) || 0;
      const b = maps[1].get(damage) || 0;
      return `<div class="chart-row">
        <span class="chart-label">${damage}</span>
        <div class="chart-track"><div class="chart-bar a" style="width:${a / maxProb * 100}%"></div></div>
        <span class="chart-value a">${pct(a)}</span>
        <div class="chart-track"><div class="chart-bar b" style="width:${b / maxProb * 100}%"></div></div>
        <span class="chart-value">${pct(b)}</span>
      </div>`;
    }).join('');
  }

  function renderSimulation(sim, index) {
    const weapon = state.weapons[index];
    const outcome = sim.fullMiss ? 'Full Miss' : sim.wound ? 'Rana' : 'Brak rany';
    const powerDice = sim.powerRolls.length
      ? sim.powerRolls.map(die => `<span class="power-chip ${die.color}">${escapeHtml(die.label)}</span>`).join('')
      : '<span class="power-chip">bez rzutu Power</span>';
    return `<article class="roll-card">
      <h3>${escapeHtml(weapon.name)} <span class="roll-outcome ${sim.fullMiss || !sim.wound ? 'miss' : ''}">${outcome}</span></h3>
      <div class="roll-line"><span>Kości ataku k10 · ${sim.hits} traf.</span><div class="dice-list">
        ${sim.attackRolls.map(item => `<span class="rolled-die ${item.hit ? 'hit' : 'miss'}" title="${item.hit ? 'Trafienie' : 'Pudło'}">${item.roll}</span>`).join('') || '<span class="power-chip">brak kości</span>'}
      </div></div>
      <div class="roll-line"><span>Kości Power</span><div class="dice-list">${powerDice}</div></div>
      ${sim.symbols ? `<div class="roll-line"><span>Suma symboli na kościach</span><div class="dice-list"><span class="power-chip">Moc ${sim.symbols.power}</span><span class="power-chip">Break ${sim.symbols.break}</span><span class="power-chip">Hope ${sim.symbols.hope}</span></div></div>` : ''}
      <div class="damage-total"><small>AT ${state.monster.at}</small><strong>${sim.damage} DMG</strong></div>
    </article>`;
  }

  function rollBoth() {
    const simulations = state.weapons.map((_, index) => KF.engine.simulate(configFor(index)));
    $('#simulator-results').innerHTML = simulations.map(renderSimulation).join('');
  }

  function handleInput(event) {
    const target = event.target;
    const weaponCard = target.closest('[data-weapon]');
    if (weaponCard && target.dataset.bind) {
      setNested(state.weapons[Number(weaponCard.dataset.weapon)], target.dataset.bind, target.value);
    } else if (target.id === 'monster-to-hit') state.monster.toHit = safeInt(target.value, 7);
    else if (target.id === 'monster-at') state.monster.at = safeInt(target.value, 0);
    else if (target.id.startsWith('portrait-')) state.portrait[target.id.replace('portrait-', '')] = safeInt(target.value);
    else if (target.id.startsWith('pool-')) state.pool[target.id.replace('pool-', '')] = safeInt(target.value);
    else return;
    recalculate();
  }

  function initTooltips() {
    const tooltip = $('#tooltip');
    document.addEventListener('pointerover', event => {
      const hint = event.target.closest('[data-tip]');
      if (!hint) return;
      tooltip.textContent = hint.dataset.tip;
      tooltip.style.display = 'block';
      const rect = hint.getBoundingClientRect();
      tooltip.style.left = `${Math.min(window.innerWidth - 275, rect.left)}px`;
      tooltip.style.top = `${rect.bottom + 8}px`;
    });
    document.addEventListener('pointerout', event => {
      if (event.target.closest('[data-tip]')) tooltip.style.display = 'none';
    });
  }

  function resetAll() {
    state = deepClone(DEFAULTS);
    renderWeapons();
    bindInitialValues();
    recalculate();
  }

  renderWeapons();
  bindInitialValues();
  recalculate();
  initTooltips();
  document.addEventListener('input', handleInput);
  $('#roll-both').addEventListener('click', rollBoth);
  $('#reset-all').addEventListener('click', resetAll);
})();
