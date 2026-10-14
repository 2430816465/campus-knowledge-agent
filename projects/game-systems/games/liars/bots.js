// Policies receive only the same view as a human client. Hidden cards/potions
// must never be passed here, including at easy difficulty.
export const QUICK_PHRASES=['这手可都是真的。','你确定要质疑吗？','我先出一张。','这杯一定安全！','再来一轮！','好运，旅人。'];
// Draw once per action: 90% 3–8 seconds, 10% 8–12 seconds (inclusive).
export const responseDelay=rng=>rng(100)<90?3000+rng(5001):8001+rng(4000);
const chance=(rng,p)=>rng(10000)<Math.round(Math.max(0,Math.min(1,p))*10000);
const shuffle=(a,rng)=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=rng(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
export function chooseAction(view,strength,rng,{protectedSeat=null}={}){
 const seat=view.turn,own=view.players[seat],hand=view.hand;
 if(view.phase!=='playing'||!own?.alive||!hand.length)return null;
 const trueCards=hand.filter(c=>c.kind===view.target||c.kind==='thief');
 const deceptive=hand.filter(c=>c.kind!==view.target&&c.kind!=='thief');
 if(view.last){
  // Count-based suspicion and risk use public information only. Weak bots
  // often make poor challenges; stronger bots prefer informative claims.
  const available=8-trueCards.length,denominator=20-hand.length;
  let allTrue=1;for(let k=0;k<view.last.count;k++)allTrue*=Math.max(0,available-k)/(denominator-k);
  const suspicion=.38+(1-allTrue)*.32+(view.last.count-1)*.055;
  const risk=1/own.remaining;
  let threshold=.08+strength*.62;
  // In a solo test table, easy opponents pressure one another more and
  // hesitate to accuse the learner. This is a decision handicap, not an
  // oracle: only seat ids and claims already public at the table are used.
  if(protectedSeat!==null){if(view.last.seat===protectedSeat)threshold*=strength;else threshold+=(1-strength)*1.1;}
  if(chance(rng,threshold*suspicion*(1-risk*.35)))return {type:'challenge'};
 }
 if(chance(rng,strength)&&trueCards.length){
  const count=Math.min(3,trueCards.length,1+rng(3));
  return {type:'play',cards:shuffle(trueCards,rng).slice(0,count).map(c=>c.id)};
 }
 // Low-strength bots bluff loudly even when they could play safely. Random
 // choices can still win; no bottle positions or opponent hands are inspected.
 const candidates=deceptive.length&&chance(rng,1-strength*.7)?deceptive:hand;
 const count=Math.min(3,candidates.length,1+rng(3));
 return {type:'play',cards:shuffle(candidates,rng).slice(0,count).map(c=>c.id)};
}
export function adaptiveStrength(record={}){
 const outcomes=Array.isArray(record.outcomes)?record.outcomes.slice(-20):[];
 const wins=outcomes.filter(Boolean).length;
 const rate=(wins+4)/(outcomes.length+8);
 // Smoothed last-20 win rate: more wins -> stronger next-game opponents.
 // Frozen per game. Never rewrite a shuffled deck or a potion outcome.
 return Math.max(.02,Math.min(.98,.40+(rate-.5)*2));
}
