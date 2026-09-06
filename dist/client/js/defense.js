(function () {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const form = $('#defense-form');
  const defaults = Object.fromEntries(new FormData(form));
  const key = 'forlorn-forge-defense-v1';
  let worker, requestId = 0, timer;
  function config() {
    const c = Object.fromEntries(new FormData(form));
    for (const field of Object.keys(c)) if (!['dodge','armorSymbols'].includes(field)) c[field] = Number(c[field]);
    c.armor = {red:c.armorRed,black:c.armorBlack,white:c.armorWhite};
    return c;
  }
  function apply(values) {
    Object.entries(defaults).forEach(([name,value]) => { form.elements.namedItem(name).value = values[name] ?? value; });
  }
  try { apply(JSON.parse(localStorage.getItem(key)) || defaults); } catch (_) { apply(defaults); }
  const pct = p => (100*p).toLocaleString('pl-PL',{maximumFractionDigits:2}) + '%';
  const number = n => n.toLocaleString('pl-PL',{maximumFractionDigits:2});
  function render(result) {
    $('#defense-metrics').innerHTML = [
      ['Oczekiwana utrata Vigor',number(result.expectedDamage)],
      ['Minimum DMG',result.minDamage],['Maksimum DMG',result.maxDamage],
      ['Szansa na 0 DMG',pct(result.zeroDamageChance)]
    ].map(([label,value])=>`<div class="defense-metric"><strong>${value}</strong><span>${label}</span></div>`).join('');
    $('#defense-secondary').textContent = `Full Evade (z Block): ${pct(result.fullEvadeChance)} · Średnio nieunikniętych trafień: ${number(result.expectedHits)} · Łączna premia Evasion: ${result.effectiveEvasionBonus >= 0 ? '+' : ''}${result.effectiveEvasionBonus}`;
    const max=Math.max(...result.damageDistribution.map(x=>x.probability));
    $('#defense-chart').innerHTML = result.damageDistribution.map(x=>`<div class="defense-chart-row"><span>${x.damage} DMG</span><div class="defense-chart-track"><div class="defense-chart-bar${x.damage===0?' zero':''}" style="width:${100*x.probability/max}%"></div></div><strong>${pct(x.probability)}</strong></div>`).join('');
    $('#defense-chart').setAttribute('aria-label','Rozkład utraty Vigor: '+result.damageDistribution.map(x=>`${x.damage} DMG: ${pct(x.probability)}`).join('; '));
    const c=config();
    $('#defense-dodge-note').textContent = c.dodge==='lesser' ? (result.effectiveDodge ? 'Lesser Dodge aktywny: +1 do Evasion.' : 'Lesser Dodge nieaktywny: masz już inny modyfikator Evasion.') : `Dodge wnosi +${result.effectiveDodge}. Wybierasz jeden wariant zdolności.`;
    $('#defense-armor-note').textContent = `Pula po limitach: ${result.armorCounts.red} czerwonych, ${result.armorCounts.black} czarnych, ${result.armorCounts.white} białych${result.fixedArmor ? ` oraz ${result.fixedArmor} stałej ochrony z nadmiaru kości` : ''}.`;
    $('#defense-output').hidden=false;
    $('#defense-error').textContent='';
    $('#defense-calculation-status').textContent='wynik dokładny';
    $('#defense-results').setAttribute('aria-busy','false');
  }
  function fail(message) {
    $('#defense-error').textContent=message;
    $('#defense-output').hidden=true;
    $('#defense-calculation-status').textContent='sprawdź parametry';
    $('#defense-results').setAttribute('aria-busy','false');
  }
  function calculate() {
    if (!form.checkValidity()) { fail('Uzupełnij pola poprawnymi liczbami w podanych zakresach.'); return; }
    const c=config();
    try { localStorage.setItem(key,JSON.stringify(Object.fromEntries(new FormData(form)))); } catch (_) {}
    if (worker) worker.terminate();
    try {
      worker=new Worker('js/defense-worker.js');
      const id=++requestId;
      worker.onmessage=({data})=>{ if(data.id!==requestId)return; if(data.error)fail(data.error);else render(data.result); worker.terminate();worker=null; };
      worker.onerror=()=>{ fail('Nie udało się obliczyć wyniku. Odśwież stronę i spróbuj ponownie.'); worker?.terminate();worker=null; };
      worker.postMessage({id,config:c});
    } catch (_) { fail('Kalkulator obrony wymaga otwarcia aplikacji przez serwer HTTP.'); }
  }
  function schedule() {
    clearTimeout(timer);
    requestId++;
    worker?.terminate();worker=null;
    $('#defense-output').hidden=true;
    $('#defense-error').textContent='';
    $('#defense-calculation-status').textContent='obliczanie…';
    $('#defense-results').setAttribute('aria-busy','true');
    timer=setTimeout(calculate,180);
  }
  function selectTab(name,focus=false) {
    ['attack','defense'].forEach(mode=>{
      const selected=name===mode;
      $('#'+mode+'-panel').hidden=!selected;
      $('#'+mode+'-tab').setAttribute('aria-selected',String(selected));
      $('#'+mode+'-tab').tabIndex=selected?0:-1;
    });
    $('#reset-all').hidden=name==='defense';
    if(focus)$('#'+name+'-tab').focus();
    if(name==='defense')schedule();
  }
  ['attack','defense'].forEach(name=>{
    $('#'+name+'-tab').addEventListener('click',()=>selectTab(name));
    $('#'+name+'-tab').addEventListener('keydown',event=>{
      if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
        event.preventDefault();selectTab(event.key==='Home'?'attack':event.key==='End'?'defense':name==='attack'?'defense':'attack',true);
      }
    });
  });
  form.addEventListener('input',schedule);
  form.addEventListener('change',schedule);
  form.addEventListener('submit',event=>event.preventDefault());
  $('#reset-defense').addEventListener('click',()=>{apply(defaults);schedule();});
})();
