(function (root) {
  'use strict';
  const COLORS = ['red', 'black', 'white'];
  const EPS = 1e-12;
  const integer = (value, name, min, max) => {
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name}: podaj liczbę całkowitą od ${min} do ${max}.`);
    return value;
  };
  function normalize(input) {
    const c = { ...input, armor: { ...input.armor } };
    for (const [key, label, min, max] of [
      ['evasionDice','Kości uniku',0,20], ['difficulty','Próg uniku',1,30],
      ['damagePerHit','Obrażenia za trafienie',0,50], ['bonusDamage','Dodatkowe obrażenia',0,50],
      ['evasionBonus','Premia Evasion',-20,20], ['guard','Guard',0,40],
      ['rerolls','Przerzuty Evasion',0,20], ['heatRerolls','Przerzuty za Heat',0,20],
      ['armorRerolls','Przerzuty pancerza',0,40], ['soak','Soak',0,100]
    ]) integer(c[key], label, min, max);
    if (!['none','lesser','1','2','3'].includes(c.dodge)) throw new Error('Nieprawidłowy wariant Dodge.');
    integer(c.block, 'Block', 0, 3);
    if (!['break','power'].includes(c.armorSymbols)) throw new Error('Nieprawidłowe symbole pancerza.');
    for (const color of COLORS) integer(c.armor[color], 'Kości pancerza', 0, 20);
    return c;
  }
  function binomial(n, p) {
    const out = Array(n + 1).fill(0);
    out[0] = 1;
    for (let i = 0; i < n; i++) for (let j = i + 1; j >= 0; j--) out[j] = (out[j] || 0) * (1 - p) + (j ? out[j - 1] * p : 0);
    return out;
  }
  function convolve(a, b) {
    const result = Array(a.length + b.length - 1).fill(0);
    a.forEach((p,i) => b.forEach((q,j) => { result[i+j] += p*q; }));
    return result;
  }
  function add(map, key, probability) { map.set(key, (map.get(key) || 0) + probability); }
  function evasionDistribution(c) {
    const dodge = c.dodge === 'lesser' ? (c.evasionBonus === 0 ? 1 : 0) : (Number(c.dodge) || 0);
    const modifier = c.evasionBonus + dodge;
    let successFaces = 0;
    const costs = new Map();
    for (let roll = 1; roll <= 10; roll++) {
      if (roll === 10 || (roll !== 1 && roll + modifier >= c.difficulty)) successFaces++;
      else if (roll !== 1) {
        const cost = c.difficulty - roll - modifier;
        if (cost <= c.guard) costs.set(cost, (costs.get(cost) || 0) + 1);
      }
    }
    const p = successFaces / 10;
    // Assign outcomes by increasing Guard cost. Cheapest failed dice are rescued first.
    // State: number of unassigned dice, remaining Guard, number of rescued dice.
    let states = new Map([[`${c.evasionDice},${c.guard},0`, 1]]);
    let assignedProbability = 0;
    for (const [cost, faces] of [...costs].sort((a,b) => a[0]-b[0])) {
      const next = new Map();
      const conditional = (faces / 10) / (1 - assignedProbability);
      const distributions = Array.from({length:c.evasionDice+1}, (_,n) => binomial(n, conditional));
      for (const [key, weight] of states) {
        const [remaining, budget, rescued] = key.split(',').map(Number);
        distributions[remaining].forEach((probability,count) => {
          if (!probability) return;
          const saved = Math.min(count, Math.floor(budget / cost));
          add(next, `${remaining-count},${budget-saved*cost},${rescued+saved}`, weight*probability);
        });
      }
      states = next;
      assignedProbability += faces / 10;
    }
    const failures = Array(c.evasionDice+1).fill(0);
    const successConditional = Math.min(1, p / (1-assignedProbability));
    for (const [key, weight] of states) {
      const [remaining, , rescued] = key.split(',').map(Number);
      binomial(remaining, successConditional).forEach((probability,successes) => {
        failures[c.evasionDice-rescued-successes] += weight*probability;
      });
    }
    const hits = Array(c.evasionDice+1).fill(0);
    failures.forEach((probability, failed) => {
      if (!probability) return;
      const rerollCount = Math.min(failed, c.rerolls+c.heatRerolls);
      binomial(rerollCount, 1-p).forEach((q, failedAgain) => {
        hits[Math.max(0, failed-rerollCount+failedAgain-c.block)] += probability*q;
      });
    });
    return { hits, modifier, dodge };
  }
  function normalizeArmor(counts) {
    let { red, black, white } = counts;
    while (red > 7) { red -= 2; black++; }
    while (black > 4) { black -= 2; white++; }
    const fixed = Math.max(0, white-3);
    white = Math.min(white,3);
    // Excess white dice grant one Power and one Potential each; either scoring mode gets one.
    return { counts: { red, black, white }, fixed };
  }
  function scalarFaces(color, mode) {
    const probabilities = [];
    for (const face of root.KF.POWER_DICE[color]) probabilities[face[mode]] = (probabilities[face[mode]] || 0) + 1/6;
    return Array.from({length:probabilities.length}, (_,i) => probabilities[i] || 0);
  }
  function initialStates(n, faces) {
    let states = new Map([['',1]]);
    for (let i=0; i<n; i++) {
      const next = new Map();
      for (const [key,p] of states) for (let score=0; score<faces.length; score++) {
        if (!faces[score]) continue;
        const values = key ? key.split(',').map(Number) : [];
        values.push(score); values.sort((a,b)=>a-b);
        add(next,values.join(','),p*faces[score]);
      }
      states=next;
    }
    return [...states].map(([key,probability]) => {
      const values=key ? key.split(',').map(Number) : [];
      const prefix=[0]; values.forEach(value=>prefix.push(prefix.at(-1)+value));
      return { probability, prefix, total:prefix.at(-1) };
    });
  }
  function armorModel(c) {
    const normalized=normalizeArmor(c.armor);
    const counts=COLORS.map(color=>normalized.counts[color]);
    const faces=COLORS.map(color=>scalarFaces(color,c.armorSymbols));
    const convolutionCache=new Map();
    function distribution(r,b,w) {
      const key=`${r},${b},${w}`;
      if (convolutionCache.has(key)) return convolutionCache.get(key);
      let probabilities=[1];
      [r,b,w].forEach((n,color)=>{for(let i=0;i<n;i++) probabilities=convolve(probabilities,faces[color]);});
      const cdf=[],moments=[];
      let total=0,moment=0;
      probabilities.forEach((p,i)=>{total+=p;moment+=i*p;cdf.push(total);moments.push(moment);});
      const value={ probabilities, cdf, moments };
      convolutionCache.set(key,value);return value;
    }
    const full=distribution(...counts);
    if (!c.armorRerolls || counts.every(n=>n===0)) return {
      ...normalized,
      lossDistribution(loss) {
        const out=new Map();
        full.probabilities.forEach((p,protection)=>{ if(p) add(out,Math.max(0,loss-c.soak-normalized.fixed-protection),p); });
        return out;
      }
    };
    const groups=counts.map((n,i)=>initialStates(n,faces[i]));
    const plans=[];
    for(let r=0;r<=counts[0];r++) for(let b=0;b<=counts[1];b++) for(let w=0;w<=counts[2];w++) {
      const n=r+b+w;if(n>c.armorRerolls)continue;
      plans.push({ counts:[r,b,w], n, ...distribution(r,b,w) });
    }
    const score=(plan,remaining)=>{
      if(remaining<=0)return [0,0];
      const i=Math.min(remaining-1,plan.cdf.length-1);
      return [remaining*plan.cdf[i]-plan.moments[i],plan.cdf[i]];
    };
    return {
      ...normalized,
      lossDistribution(loss) {
        const out=new Map();
        for(const red of groups[0]) for(const black of groups[1]) for(const white of groups[2]) {
          const initial=[red,black,white];
          const weight=red.probability*black.probability*white.probability;
          const retained=red.total+black.total+white.total;
          const base=loss-c.soak-normalized.fixed-retained;
          if(base<=0){add(out,0,weight);continue;}
          let best=null,bestMean=Infinity,bestRisk=Infinity,bestRemaining=0;
          for(const plan of plans) {
            const remaining=base+plan.counts.reduce((sum,n,i)=>sum+initial[i].prefix[n],0);
            const [mean,risk]=score(plan,remaining);
            if(mean<bestMean-EPS || (Math.abs(mean-bestMean)<=EPS && (risk<bestRisk-EPS || (Math.abs(risk-bestRisk)<=EPS && plan.n<best.n)))) {
              best=plan;bestMean=mean;bestRisk=risk;bestRemaining=remaining;
            }
          }
          best.probabilities.forEach((p,protection)=>{if(p)add(out,Math.max(0,bestRemaining-protection),weight*p);});
        }
        return out;
      }
    };
  }
  function calculate(input) {
    const c=normalize(input);
    const evasion=evasionDistribution(c);
    const armor=armorModel(c);
    const damage=new Map();
    const cache=new Map();
    evasion.hits.forEach((p,hits)=>{
      if(!p)return;
      if(hits===0){add(damage,0,p);return;}
      const raw=hits*c.damagePerHit+c.bonusDamage;
      if(!cache.has(raw))cache.set(raw,armor.lossDistribution(raw));
      for(const [loss,q] of cache.get(raw))add(damage,loss,p*q);
    });
    const mass=[...damage.values()].reduce((a,b)=>a+b,0);
    const damageDistribution=[...damage].filter(([,p])=>p>0).sort((a,b)=>a[0]-b[0]).map(([damage,p])=>({damage,probability:p/mass}));
    return {
      damageDistribution,
      minDamage: damageDistribution[0].damage,
      maxDamage: damageDistribution.at(-1).damage,
      expectedDamage: damageDistribution.reduce((sum,x)=>sum+x.damage*x.probability,0),
      zeroDamageChance: (damage.get(0)||0)/mass,
      fullEvadeChance: evasion.hits[0],
      expectedHits: evasion.hits.reduce((sum,p,hits)=>sum+p*hits,0),
      effectiveEvasionBonus:evasion.modifier,
      effectiveDodge:evasion.dodge,
      armorCounts:armor.counts,
      fixedArmor:armor.fixed,
      hitsDistribution:evasion.hits
    };
  }
  root.KF=root.KF||{};
  root.KF.defense={calculate,normalizeArmor,evasionDistribution,armorModel};
  if(typeof module!=='undefined')module.exports=root.KF.defense;
})(typeof globalThis!=='undefined'?globalThis:window);
