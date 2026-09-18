const assert = require('node:assert/strict');
require('../js/dice.js');
const { calculate, evasionDistribution, normalizeArmor, armorModel } = require('../js/defense-engine.js');
const base = { evasionDice:1,difficulty:6,damagePerHit:2,bonusDamage:0,evasionBonus:0,dodge:'none',block:0,guard:0,rerolls:0,heatRerolls:0,armor:{red:0,black:0,white:0},armorRerolls:0,armorSymbols:'break',soak:0 };
const {simulate}=require('../js/defense-engine.js');
const sequence=values=>()=>{assert.ok(values.length,'Unexpected extra roll');return values.shift();};
const guarded=simulate({...base,evasionDice:3,guard:1,rerolls:1,heatRerolls:1},sequence([.4,0,.1,.9,0]));
assert.equal(guarded.evasion[0].guard,1);
assert.equal(guarded.evasion[0].reroll,null);
assert.equal(guarded.evasion[1].reroll,'Evasion');
assert.equal(guarded.evasion[2].reroll,'Heat');
assert.equal(guarded.hits,1);
assert.equal(guarded.damage,2);
assert.equal(simulate({...base,block:1,bonusDamage:10},()=>0).damage,0);
assert.equal(simulate({...base,evasionDice:0},sequence([])).armorDice.length,0);
let seed=123456;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(const mode of ['break','power','best']) {
  const config={...base,evasionDice:3,guard:2,rerolls:1,heatRerolls:1,bonusDamage:2,armor:{red:1,black:1,white:0},armorRerolls:1,armorSymbols:mode,soak:1};
  const exact=calculate(config);let total=0,zeros=0;
  for(let i=0;i<12000;i++) {
    const s=simulate(config,random);total+=s.damage;zeros+=s.damage===0;
    assert.equal(s.damage,Math.max(0,s.rawDamage-s.protection-config.soak));
    assert.ok(s.armorDice.filter(d=>d.rerolled).length<=1);
    assert.ok(s.evasion.every(d=>!d.guard||!d.reroll));
  }
  assert.ok(Math.abs(total/12000-exact.expectedDamage)<.035,'Simulation mean matches exact engine');
  assert.ok(Math.abs(zeros/12000-exact.zeroDamageChance)<.015,'Simulation zero damage matches exact engine');
}
const near=(a,b,msg='')=>assert.ok(Math.abs(a-b)<1e-9, `${msg}: ${a} != ${b}`);
const distribution=(config)=>Object.fromEntries(calculate({...base,...config}).damageDistribution.map(x=>[x.damage,x.probability]));
assert.deepEqual(distribution({}),{0:.5,2:.5});
assert.deepEqual(distribution({rerolls:1}),{0:.75,2:.25});
near(calculate({...base,guard:1}).fullEvadeChance,.6);
near(calculate({...base,guard:1,rerolls:1}).fullEvadeChance,.8);
near(calculate({...base,evasionBonus:20,guard:40}).fullEvadeChance,.9,'natural one remains a fail with Guard');
near(calculate({...base,evasionBonus:-20}).fullEvadeChance,.1,'natural ten succeeds');
near(calculate({...base,dodge:'lesser'}).effectiveEvasionBonus,1);
near(calculate({...base,dodge:'lesser',evasionBonus:1}).effectiveEvasionBonus,1);
near(calculate({...base,dodge:'2',evasionBonus:1}).effectiveEvasionBonus,3);
assert.deepEqual(distribution({block:1,bonusDamage:10}),{0:1});
assert.deepEqual(distribution({evasionDice:0,bonusDamage:10}),{0:1});
assert.deepEqual(distribution({soak:2}),{0:1});
assert.deepEqual(distribution({bonusDamage:3}),{0:.5,5:.5});
let d=distribution({armor:{red:1,black:0,white:0}});
near(d[0],.5);near(d[1],.25);near(d[2],.25);
d=distribution({armor:{red:1,black:0,white:0},armorRerolls:1});
near(d[0],.5);near(d[1],.375);near(d[2],.125);
const breakLoss=calculate({...base,armor:{red:1,black:0,white:0}}).expectedDamage;
const swordLoss=calculate({...base,armor:{red:1,black:0,white:0},armorSymbols:'power'}).expectedDamage;
assert.ok(swordLoss<breakLoss);
assert.deepEqual(normalizeArmor({red:8,black:0,white:0}),{counts:{red:6,black:1,white:0},fixed:0});
assert.deepEqual(normalizeArmor({red:0,black:5,white:0}),{counts:{red:0,black:3,white:1},fixed:0});
assert.deepEqual(normalizeArmor({red:0,black:0,white:4}),{counts:{red:0,black:0,white:3},fixed:1});
assert.throws(()=>calculate({...base,evasionDice:1.2}));
assert.throws(()=>calculate({...base,armorSymbols:'both'}));
// Independent ordered d10 enumeration and exhaustive Guard subsets.
function enumerateRolls(n,sides,fn,values=[]) { if(values.length===n){fn(values);return;} for(let face=1;face<=sides;face++)enumerateRolls(n,sides,fn,[...values,face]); }
for (const guard of [0,1,3,7]) for(const rerolls of [0,1,3]) {
  const c={...base,evasionDice:3,guard,rerolls};
  const expected=Array(4).fill(0);
  enumerateRolls(3,10,roll=>{
    const failed=roll.filter(v=>v===1 || (v!==10 && v<6));
    let rescued=0;
    for(let mask=0;mask<(1<<failed.length);mask++) {
      let cost=0,count=0;
      for(let i=0;i<failed.length;i++)if(mask&(1<<i)){cost+=failed[i]===1?Infinity:6-failed[i];count++;}
      if(cost<=guard)rescued=Math.max(rescued,count);
    }
    const remaining=failed.length-rescued, reroll=Math.min(remaining,rerolls);
    enumerateRolls(reroll,10,again=>{const hits=remaining-reroll+again.filter(v=>v<6).length;expected[hits]+=1/(1000*10**reroll);});
  });
  evasionDistribution(c).hits.forEach((p,i)=>near(p,expected[i],`Guard ${guard}, rerolls ${rerolls}, hits ${i}`));
}
// Independent exhaustive Armor choices: enumerate all physical faces and every reroll mask.
function bruteArmor(colors,mode,rerolls,loss,soak) {
  let mean=0,zero=0;
  enumerateRolls(colors.length,6,roll=>{
    let bestMean=Infinity,bestZero=-1,bestN=Infinity;
    for(let mask=0;mask<(1<<colors.length);mask++) {
      const chosen=colors.map((_,i)=>i).filter(i=>mask&(1<<i));if(chosen.length>rerolls)continue;
      let m=0,z=0;
      enumerateRolls(chosen.length,6,again=>{
        const values=[...roll];chosen.forEach((index,i)=>values[index]=again[i]);
        const sum=symbol=>values.reduce((total,face,i)=>total+KF.POWER_DICE[colors[i]][face-1][symbol],0);
        const armor=mode==='best'?Math.max(sum('break'),sum('power')):sum(mode);
        const dmg=Math.max(0,loss-soak-armor),p=1/6**chosen.length;m+=dmg*p;if(dmg===0)z+=p;
      });
      if(m<bestMean-1e-12 || (Math.abs(m-bestMean)<1e-12 && (z>bestZero+1e-12 || (Math.abs(z-bestZero)<1e-12 && chosen.length<bestN)))){bestMean=m;bestZero=z;bestN=chosen.length;}
    }
    mean+=bestMean/6**colors.length;zero+=bestZero/6**colors.length;
  });
  return {mean,zero};
}
for(const mode of ['break','power','best'])for(const loss of [1,3,6])for(const rerolls of [0,1,2]) {
  const c={...base,armor:{red:1,black:1,white:0},armorSymbols:mode,armorRerolls:rerolls,soak:1};
  const actual=armorModel(c).lossDistribution(loss), expected=bruteArmor(['red','black'],mode,rerolls,loss,1);
  near([...actual].reduce((s,[d,p])=>s+d*p,0),expected.mean,'armor expected loss');near(actual.get(0)||0,expected.zero,'armor zero probability');
}
for(const config of [base,{...base,evasionDice:8,guard:10,rerolls:3,block:2,armor:{red:4,black:2,white:1},armorRerolls:3,soak:2}]) {
  const r=calculate(config);near(r.damageDistribution.reduce((s,x)=>s+x.probability,0),1);
  assert.ok(r.minDamage>=0);assert.ok(r.expectedDamage>=r.minDamage-1e-9 && r.expectedDamage<=r.maxDamage+1e-9);
}
// Two red dice: 2 Attack and 1 Break protect for 2, not the per-die maximum 3.
const whole=simulate({...base,damagePerHit:5,armor:{red:2,black:0,white:0},armorSymbols:'best'},sequence([0,.2,.4]));
assert.equal(whole.protection,2);assert.equal(whole.damage,3);assert.equal(whole.chosenSymbols,'power');
const cups=simulate({...base,damagePerHit:5,armor:{red:2,black:0,white:0},armorSymbols:'best'},sequence([0,.4,.4]));
assert.equal(cups.protection,2);assert.equal(cups.chosenSymbols,'break');
console.log('Defense tests passed, including whole-roll best symbols, exhaustive reroll choices and seeded simulation comparisons.');
