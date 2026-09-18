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
    if (!['break','power','best'].includes(c.armorSymbols)) throw new Error('Nieprawidłowe symbole pancerza.');
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
    if(c.armorSymbols==='best')return bestArmorModel(c);
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
      choose: () => [0,0,0],
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
    function choose(initial, loss) {
      const base=loss-c.soak-normalized.fixed-initial.reduce((sum,x)=>sum+x.total,0);
      let best=plans[0],bestMean=Infinity,bestRisk=Infinity;
      for(const plan of plans) {
        const remaining=base+plan.counts.reduce((sum,n,i)=>sum+initial[i].prefix[n],0);
        const [mean,risk]=score(plan,remaining);
        if(mean<bestMean-EPS || (Math.abs(mean-bestMean)<=EPS && (risk<bestRisk-EPS || (Math.abs(risk-bestRisk)<=EPS && plan.n<best.n)))) {
          best=plan;bestMean=mean;bestRisk=risk;
        }
      }
      return best.counts;
    }
    return {
      ...normalized,
      choose,
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
  // Keep both symbol totals jointly: their correlation on each face matters.
  function bestArmorModel(c) {
    const normalized=normalizeArmor(c.armor), jointCache=new Map(),scoreCache=new Map();
    function joint(counts) {
      const key=counts.join(',');if(jointCache.has(key))return jointCache.get(key);
      let states=new Map([[0,1]]);
      counts.forEach((n,i)=>{for(let d=0;d<n;d++){
        const next=new Map();
        for(const [sum,p] of states) for(const f of root.KF.POWER_DICE[COLORS[i]])add(next,sum+f.break*128+f.power,p/6);
        states=next;
      }});
      const result=[...states].map(([sum,p])=>({b:Math.floor(sum/128),a:sum%128,p}));
      jointCache.set(key,result);return result;
    }
    function options(dice) {
      let states=new Map([['0,0,0',{n:0,b:0,a:0,indices:[]}]]);
      dice.forEach(d=>{
        const next=new Map(states);
        for(const s of states.values())if(s.n<c.armorRerolls){
          const n=s.n+1,b=s.b+d.face.break,a=s.a+d.face.power;
          next.set(`${n},${b},${a}`,{n,b,a,indices:[...s.indices,d.index]});
        }
        states=next;
      });
      const all=[...states.values()];
      // For equal reroll counts, retaining at least as many of both symbols dominates.
      return all.filter(s=>!all.some(t=>t.n===s.n&&t.b<=s.b&&t.a<=s.a&&(t.b<s.b||t.a<s.a)));
    }
    function choose(dice,loss) {
      const b=dice.reduce((s,d)=>s+d.face.break,0),a=dice.reduce((s,d)=>s+d.face.power,0);
      const target=loss-c.soak-normalized.fixed;
      let best={indices:[],counts:[0,0,0],b,a,mean:Math.max(0,target-Math.max(b,a)),risk:target>Math.max(b,a)?1:0};
      if(best.mean===0||!c.armorRerolls)return best;
      const groups=COLORS.map(color=>options(dice.map((d,index)=>({...d,index})).filter(d=>d.color===color)));
      for(const r of groups[0])for(const k of groups[1])for(const w of groups[2]) {
        const n=r.n+k.n+w.n;if(n>c.armorRerolls)continue;
        const rb=b-r.b-k.b-w.b,ra=a-r.a-k.a-w.a,counts=[r.n,k.n,w.n];
        const key=`${target-rb},${target-ra},${counts}`;
        let score=scoreCache.get(key);
        if(!score){
          let mean=0,risk=0;
          for(const x of joint(counts)){const damage=Math.max(0,target-Math.max(rb+x.b,ra+x.a));mean+=damage*x.p;if(damage>0)risk+=x.p;}
          score={mean,risk};scoreCache.set(key,score);
        }
        if(score.mean<best.mean-EPS||(Math.abs(score.mean-best.mean)<=EPS&&(score.risk<best.risk-EPS||(Math.abs(score.risk-best.risk)<=EPS&&n<best.indices.length)))) {
          best={indices:[...r.indices,...k.indices,...w.indices],counts,b:rb,a:ra,...score};
        }
      }
      return best;
    }
    function initialColor(color,n) {
      let states=new Map([['',1]]);
      for(let i=0;i<n;i++){
        const next=new Map();
        for(const [key,p] of states)for(const f of root.KF.POWER_DICE[color]){
          const values=key?key.split(',').map(Number):[];
          values.push(f.break*128+f.power);values.sort((a,b)=>a-b);add(next,values.join(','),p/6);
        }
        states=next;
      }
      return [...states].map(([key,p])=>({p,dice:key?key.split(',').map(Number).map(x=>({color,face:{break:Math.floor(x/128),power:x%128}})):[]}));
    }
    let groups;
    return {...normalized,
      chooseDice:(dice,loss)=>choose(dice,loss).indices,
      lossDistribution(loss) {
        const out=new Map(),target=loss-c.soak-normalized.fixed;
        if(target<=0)return new Map([[0,1]]);
        if(!c.armorRerolls){
          for(const x of joint(COLORS.map(color=>normalized.counts[color])))add(out,Math.max(0,target-Math.max(x.b,x.a)),x.p);
          return out;
        }
        groups??=COLORS.map(color=>initialColor(color,normalized.counts[color]));
        for(const r of groups[0])for(const k of groups[1])for(const w of groups[2]){
          const best=choose([...r.dice,...k.dice,...w.dice],loss),weight=r.p*k.p*w.p;
          for(const x of joint(best.counts))add(out,Math.max(0,target-Math.max(best.b+x.b,best.a+x.a)),weight*x.p);
        }
        return out;
      }
    };
  }
  function simulate(input, random=Math.random) {
    const c=normalize(input);
    const dodge=c.dodge==='lesser' ? (c.evasionBonus===0?1:0) : Number(c.dodge)||0;
    const modifier=c.evasionBonus+dodge;
    const roll=()=>1+Math.floor(random()*10);
    const succeeds=(n,guard=0)=>n===10 || (n!==1 && n+modifier+guard>=c.difficulty);
    const evasion=Array.from({length:c.evasionDice},()=>{const n=roll();return {initial:n,roll:n,guard:0,reroll:null};});
    let guard=c.guard,free=c.rerolls,heat=c.heatRerolls;
    const candidates=evasion.filter(x=>!succeeds(x.roll)&&x.roll!==1).sort((a,b)=>b.roll-a.roll);
    for(const die of candidates) {
      const cost=c.difficulty-die.roll-modifier;
      if(cost<=guard){die.guard=cost;guard-=cost;}
    }
    for(const die of evasion) {
      if(!succeeds(die.roll,die.guard) && !die.guard && (free||heat)) {
        die.reroll=free?'Evasion':'Heat'; if(free)free--;else heat--;
        die.roll=roll();
      }
      die.evaded=succeeds(die.roll,die.guard);
    }
    const failures=evasion.filter(x=>!x.evaded).length;
    const blocked=Math.min(failures,c.block),hits=failures-blocked;
    const rawDamage=hits ? hits*c.damagePerHit+c.bonusDamage : 0;
    const armor=armorModel(c),armorDice=[];
    const face=color=>({...root.KF.POWER_DICE[color][Math.floor(random()*6)]});
    if(rawDamage>0) for(const color of COLORS) for(let i=0;i<armor.counts[color];i++) {
      const initial=face(color);armorDice.push({color,initial,face:initial,rerolled:false});
    }
    const sorted=COLORS.map(color=>armorDice.filter(x=>x.color===color).sort((a,b)=>a.face[c.armorSymbols]-b.face[c.armorSymbols]));
    const summaries=sorted.map(dice=>{const prefix=[0];dice.forEach(x=>prefix.push(prefix.at(-1)+x.face[c.armorSymbols]));return {prefix,total:prefix.at(-1)};});
    if(c.armorSymbols==='best') {
      const selected=rawDamage>0 ? armor.chooseDice(armorDice,rawDamage) : [];
      selected.forEach(i=>{const die=armorDice[i];die.face=face(die.color);die.rerolled=true;});
    } else {
      const selected=rawDamage>0 ? armor.choose(summaries,rawDamage) : [0,0,0];
      sorted.forEach((dice,i)=>dice.slice(0,selected[i]).forEach(die=>{die.face=face(die.color);die.rerolled=true;}));
    }
    const totals={break:0,power:0};
    armorDice.forEach(x=>{totals.break+=x.face.break;totals.power+=x.face.power;});
    const chosenSymbols=c.armorSymbols==='best' ? (totals.power>totals.break?'power':'break') : c.armorSymbols;
    const protection=rawDamage>0 ? armor.fixed+totals[chosenSymbols] : 0;
    const afterArmor=Math.max(0,rawDamage-protection),soaked=Math.min(afterArmor,c.soak);
    return {config:c,modifier,dodge,evasion,guardUsed:c.guard-guard,rerollsUsed:c.rerolls-free,heatUsed:c.heatRerolls-heat,blocked,hits,rawDamage,armorDice,totals,chosenSymbols,fixedArmor:rawDamage>0?armor.fixed:0,protection,afterArmor,soaked,damage:afterArmor-soaked};
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
  root.KF.defense={calculate,simulate,normalizeArmor,evasionDistribution,armorModel};
  if(typeof module!=='undefined')module.exports=root.KF.defense;
})(typeof globalThis!=='undefined'?globalThis:window);
