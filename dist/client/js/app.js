(function () {
  'use strict';

  const STORAGE_KEY = 'forlorn-forge-config-v1';
  const COLORS = ['red', 'black', 'white'];
  const DEFAULTS = {
    monster: { toHit: 7, at: 6 },
    portrait: { red: 1, black: 0, white: 0 },
    pool: { opening: 2, break: 1, hope: 0, power: 0, attackRerolls: 0, powerRerolls: 0, black: 0 },
    weapons: [
      {
        name: 'Knighves', attackDice: 2, attackBonus: 0, bonusDamage: 0,
        perHit: { red: 1, black: 0, white: 0 },
        extraDice: { red: 0, black: 0, white: 0 }
      },
      {
        name: 'Broń II', attackDice: 1, attackBonus: 1, bonusDamage: 1,
        perHit: { red: 0, black: 1, white: 0 },
        extraDice: { red: 1, black: 0, white: 0 }
      }
    ]
  };

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  let state = loadState();
  let results = [];
  let savedWeapons = [];
  let editingId = null;
  let deletingId = null;
  let saving = false;

  const $ = selector => document.querySelector(selector);
  const pct = value => `${(value * 100).toFixed(value > 0 && value < .01 ? 2 : 1)}%`;
  const num = value => Number(value).toFixed(2).replace('.', ',');
  const safeInt = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;

  async function loadAppVersion() {
    const target = $('#app-version');
    if (!target) return;
    try {
      const response = await fetch(`app.config.json?ts=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Config HTTP ${response.status}`);
      const config = await response.json();
      const version = String(config.version || '').trim();
      if (!version) throw new Error('Missing app version');
      target.textContent = `Wersja ${version} · Obliczenia lokalne · biblioteka broni`;
    } catch (_) {
      target.textContent = 'Wersja lokalna · Obliczenia lokalne · biblioteka broni';
    }
  }

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
          <div class="weapon-title-fields">
            <input class="weapon-name" data-bind="name" aria-label="Nazwa broni ${index + 1}" value="${escapeHtml(weapon.name)}" />
            <select class="weapon-select" data-load-weapon aria-label="Wczytaj zapisaną broń do pola ${index + 1}">
              ${weaponOptions()}
            </select>
          </div>

        </div>
        <div class="weapon-content">
          <button class="button button-ghost save-comparison" data-save-weapon type="button">Dodaj ten wariant do zbrojowni</button>
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

  function weaponOptions() {
    const options = savedWeapons.map(weapon => `<option value="${weapon.id}">${escapeHtml(weapon.name)}</option>`).join('');
    return `<option value="">Wczytaj z biblioteki…</option>${options}`;
  }

  function renderWeapons() {
    $('#weapon-grid').innerHTML = state.weapons.map(weaponTemplate).join('');
    refreshWeaponSelects();
  }

  function setLibraryStatus(message, type = '') {
    const target = $('#weapon-library-status');
    target.textContent = message;
    target.className = 'library-status ' + type;
  }

  function refreshWeaponSelects() {
    document.querySelectorAll('[data-load-weapon]').forEach(select => {
      select.innerHTML = weaponOptions();
      const slot = Number(select.closest('[data-weapon]').dataset.weapon);
      select.value = state.weapons[slot].id || '';
    });
  }

  async function loadWeaponLibrary(showSuccess = false) {
    const refreshButton = $('#refresh-weapons');
    refreshButton.disabled = true;
    setLibraryStatus('Pobieranie zapisanych broni…');
    try {
      const response = await fetch('/api/weapons', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      savedWeapons = Array.isArray(data.weapons) ? data.weapons : [];
      refreshWeaponSelects();
      renderLibrary();
      const message = savedWeapons.length
        ? `${savedWeapons.length} ${savedWeapons.length === 1 ? 'zapisana broń' : 'zapisanych broni'}${showSuccess ? ' · lista odświeżona' : ''}`
        : 'Zbrojownia jest pusta. Dodaj swoją pierwszą broń.';
      setLibraryStatus(message, 'success');
    } catch (error) {
      setLibraryStatus(`Nie udało się pobrać biblioteki: ${error.message}`, 'error');
    } finally {
      refreshButton.disabled = false;
    }
  }

  function renderLibrary() {
    const query = $('#weapon-search').value.trim().normalize('NFKC').toLowerCase();
    const filtered = savedWeapons.filter(w => w.name.normalize('NFKC').toLowerCase().includes(query));
    $('#weapon-library-list').innerHTML = filtered.length ? filtered.map(w => `<article class="library-row">
      <div class="library-weapon"><strong>${escapeHtml(w.name)}</strong><span>${w.attackDice} × k10 · bonus ataku ${w.attackBonus >= 0 ? '+' : ''}${w.attackBonus} · +${w.bonusDamage} DMG</span></div>
      <div class="library-actions"><button class="button button-ghost" data-use-id="${w.id}" data-slot="0" aria-label="Porównaj ${escapeHtml(w.name)} w polu 1">Do I</button><button class="button button-ghost" data-use-id="${w.id}" data-slot="1" aria-label="Porównaj ${escapeHtml(w.name)} w polu 2">Do II</button><button class="button button-ghost" data-edit-id="${w.id}" aria-label="Edytuj ${escapeHtml(w.name)}">Edytuj</button><button class="button button-danger-ghost" data-delete-id="${w.id}" aria-label="Usuń ${escapeHtml(w.name)}">Usuń</button></div>
    </article>`).join('') : '<p class="library-empty">' + (query ? 'Brak broni pasujących do wyszukiwania.' : 'Twoje zapisane bronie pojawią się tutaj.') + '</p>';
  }

  function openEditor(weapon = { name: '', attackDice: 1, attackBonus: 0, bonusDamage: 0, perHit: { red: 0, black: 0, white: 0 }, extraDice: { red: 0, black: 0, white: 0 } }, id = null) {
    editingId = id;
    $('#editor-title').textContent = id === null ? 'Dodaj broń' : 'Edytuj broń';
    $('#editor-submit').textContent = id === null ? 'Dodaj broń' : 'Zapisz zmiany';
    $('#editor-error').textContent = '';
    $('#editor-fields').innerHTML = `
      <label class="field"><span>Nazwa broni</span><input data-bind="name" value="${escapeHtml(weapon.name)}" required maxlength="100" autocomplete="off" aria-describedby="name-help" /></label>
      <p id="name-help" class="field-group-note">Unikalna nazwa, do 100 znaków. Wielkość liter nie rozróżnia broni.</p>
      <fieldset class="field-group"><legend>Atak</legend><div class="fields-three">
        <label class="field"><span>Kości k10</span><input data-bind="attackDice" type="number" required min="0" max="20" value="${weapon.attackDice}" /></label>
        <label class="field"><span>Bonus do wyniku</span><input data-bind="attackBonus" type="number" required min="-20" max="20" value="${weapon.attackBonus}" /></label>
        <label class="field"><span>Dodatkowe DMG</span><input data-bind="bonusDamage" type="number" required min="0" max="50" value="${weapon.bonusDamage}" /></label>
      </div></fieldset>
      <fieldset class="field-group"><legend>Power za każde trafienie</legend><div class="fields-three">${dieInputs('perHit',weapon.perHit)}</div></fieldset>
      <fieldset class="field-group"><legend>Dodatkowe Power po trafieniu</legend><div class="fields-three">${dieInputs('extraDice',weapon.extraDice)}</div></fieldset>`;
    $('#editor-fields').querySelectorAll('input').forEach(input => input.required = true);
    $('#weapon-editor').showModal();
    $('#editor-fields input').focus();
  }

  async function submitWeapon(event) {
    event.preventDefault();
    if (saving) return;
    const weapon = { perHit: {}, extraDice: {} };
    $('#editor-fields').querySelectorAll('[data-bind]').forEach(input => setNested(weapon, input.dataset.bind, input.value));
    weapon.name = weapon.name.normalize('NFKC').trim().replace(/\s+/gu, ' ');
    const errorTarget = $('#editor-error');
    errorTarget.textContent = '';
    if (!weapon.name) { errorTarget.textContent = 'Podaj nazwę broni.'; return; }
    if (savedWeapons.some(w => w.id !== editingId && w.name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase() === weapon.name.toLowerCase())) {
      errorTarget.textContent = 'Broń o tej nazwie już istnieje. Wybierz inną nazwę.'; return;
    }
    saving = true;
    $('#weapon-form').querySelectorAll('button, input').forEach(el => el.disabled = true);
    try {
      const response = await fetch('/api/weapons' + (editingId === null ? '' : '/' + editingId), { method: editingId === null ? 'POST' : 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(weapon) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Nie udało się zapisać broni. Spróbuj ponownie.');
      savedWeapons = savedWeapons.filter(w => w.id !== data.weapon.id).concat(data.weapon).sort((a,b) => a.name.localeCompare(b.name, 'pl'));
      state.weapons = state.weapons.map(w => w.id === data.weapon.id ? deepClone(data.weapon) : w);
      renderWeapons(); recalculate(); renderLibrary();
      $('#weapon-editor').close();
      $('#weapon-search').focus();
      setLibraryStatus('Zapisano „' + data.weapon.name + '”.', 'success');
    } catch (error) { errorTarget.textContent = error.message; }
    finally { saving = false; $('#weapon-form').querySelectorAll('button, input').forEach(el => el.disabled = false); }
  }

  async function deleteWeapon() {
    if (saving) return;
    saving = true;
    $('#delete-dialog').querySelectorAll('button').forEach(el => el.disabled = true);
    try {
      const response = await fetch('/api/weapons/' + deletingId, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) { const data = await response.json(); throw new Error(data.error || 'Nie udało się usunąć broni.'); }
      savedWeapons = savedWeapons.filter(w => w.id !== deletingId);
      renderLibrary(); refreshWeaponSelects();
      state.weapons.forEach(w => { if (w.id === deletingId) delete w.id; });
      saveState();
      $('#delete-dialog').close();
      $('#weapon-search').focus();
      setLibraryStatus('Broń została usunięta ze zbrojowni.', 'success');
    } catch (error) { $('#delete-error').textContent = error.message; }
    finally { saving = false; $('#delete-dialog').querySelectorAll('button').forEach(el => el.disabled = false); }
  }

  function loadSavedWeapon(index, id) {
    const saved = savedWeapons.find(weapon => String(weapon.id) === String(id));
    if (!saved) return;
    state.weapons[index] = {
      id: saved.id,
      name: saved.name,
      attackDice: saved.attackDice,
      attackBonus: saved.attackBonus,
      bonusDamage: saved.bonusDamage,
      perHit: deepClone(saved.perHit),
      extraDice: deepClone(saved.extraDice)
    };
    renderWeapons();
    recalculate();
    setLibraryStatus(`Wczytano „${saved.name}” do pola ${index + 1}.`, 'success');
  }

  function bindInitialValues() {
    $('#monster-to-hit').value = state.monster.toHit;
    $('#monster-at').value = state.monster.at;
    for (const color of COLORS) $(`#portrait-${color}`).value = state.portrait[color];
    for (const key of ['opening', 'break', 'hope', 'power', 'attackRerolls', 'powerRerolls', 'black']) {
      $(`#pool-${key}`).value = state.pool[key];
    }
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
      ? sim.powerRolls.map(die => `<span class="power-chip ${die.color}${die.black ? ' black-effect' : ''}">${escapeHtml(die.label)}${die.rerolled ? ` <small>↻${die.black ? ' Black' : ''}</small>` : ''}</span>`).join('')
      : '<span class="power-chip">bez rzutu Power</span>';
    return `<article class="roll-card">
      <h3>${escapeHtml(weapon.name)} <span class="roll-outcome ${sim.fullMiss || !sim.wound ? 'miss' : ''}">${outcome}</span></h3>
      <div class="roll-line"><span>Kości ataku k10 · ${sim.hits} traf.</span><div class="dice-list">
        ${sim.attackRolls.map(item => `<span class="rolled-die ${item.hit ? 'hit' : 'miss'}" title="${item.rerolled ? `Przerzut: ${item.initialRoll} → ${item.roll}. ` : ''}${item.hit ? 'Trafienie' : 'Pudło'}">${item.roll}${item.rerolled ? '<small>↻</small>' : ''}</span>`).join('') || '<span class="power-chip">brak kości</span>'}
      </div></div>
      <div class="roll-line"><span>Kości Power</span><div class="dice-list">${powerDice}</div></div>
      ${sim.symbols ? `<div class="roll-line"><span>Suma symboli na kościach</span><div class="dice-list"><span class="power-chip">Moc ${sim.symbols.power}</span><span class="power-chip">Break ${sim.symbols.break}</span><span class="power-chip">Hope ${sim.symbols.hope}</span>${sim.symbols.blackBreak ? `<span class="power-chip black-effect">Black DMG +${sim.symbols.blackBreak}</span>` : ''}</div></div>` : ''}
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
      const weapon = state.weapons[Number(weaponCard.dataset.weapon)];
      setNested(weapon, target.dataset.bind, target.value);
      delete weapon.id;
      weaponCard.querySelector('[data-load-weapon]').value = '';
    } else if (target.id === 'monster-to-hit') state.monster.toHit = safeInt(target.value, 7);
    else if (target.id === 'monster-at') state.monster.at = safeInt(target.value, 0);
    else if (target.id.startsWith('portrait-')) state.portrait[target.id.replace('portrait-', '')] = safeInt(target.value);
    else if (target.id.startsWith('pool-')) state.pool[target.id.replace('pool-', '')] = safeInt(target.value);
    else return;
    recalculate();
  }

  function handleWeaponActions(event) {
    const card = event.target.closest('[data-weapon]');
    if (!card) return;
    const index = Number(card.dataset.weapon);
    if (event.target.matches('[data-save-weapon]')) openEditor(deepClone(state.weapons[index]));
    if (event.type === 'change' && event.target.matches('[data-load-weapon]')) loadSavedWeapon(index, event.target.value);
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
  loadAppVersion();
  loadWeaponLibrary();
  bindInitialValues();
  recalculate();
  initTooltips();
  document.addEventListener('input', handleInput);
  document.addEventListener('click', handleWeaponActions);
  document.addEventListener('change', handleWeaponActions);
  $('#add-weapon').addEventListener('click', () => openEditor());
  $('#weapon-search').addEventListener('input', renderLibrary);
  $('#weapon-form').addEventListener('submit', submitWeapon);
  $('#confirm-delete').addEventListener('click', deleteWeapon);
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
    dialog.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => { if (!saving) dialog.close(); }));
  });
  $('#weapon-library-list').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.useId) loadSavedWeapon(Number(button.dataset.slot), button.dataset.useId);
    if (button.dataset.editId) { const w = savedWeapons.find(w => String(w.id) === button.dataset.editId); if (w) openEditor(w, w.id); }
    if (button.dataset.deleteId) {
      const w = savedWeapons.find(w => String(w.id) === button.dataset.deleteId);
      if (!w) return;
      deletingId = w.id; $('#delete-description').textContent = 'Usunąć „' + w.name + '”? Tej operacji nie można cofnąć.';
      $('#delete-error').textContent = ''; $('#delete-dialog').showModal(); $('#delete-dialog [data-close-dialog]').focus();
    }
  });
  $('#refresh-weapons').addEventListener('click', () => loadWeaponLibrary(true));
  $('#roll-both').addEventListener('click', rollBoth);
  $('#reset-all').addEventListener('click', resetAll);
})();
