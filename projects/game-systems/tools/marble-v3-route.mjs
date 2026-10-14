import {MarbleGame} from '../games/marble/state.js';
const data=new Map();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
const seed=Number(process.argv.find(x=>x.startsWith('--seed='))?.slice(7)??8136);
const g=new MarbleGame();g.meta.challengeUnlocked=true;g.newRun(seed,process.argv.includes('--challenge'));
const trail=[];let turn=0;
while(turn++<140&&g.run.phase!=='failed'&&g.run.phase!=='result'){
 const r=g.run;
 if(r.phase==='reward'){
  if(r.offerType==='relic'){g.openChest();g.selectRelic(r.chest.offer[0].id);g.continueRelic()}
  else{const best=r.offer.find(x=>x==='upgrade:supply')||r.offer.find(x=>x==='upgrade:extra')||r.offer.find(x=>x==='upgrade:core')||r.offer.find(x=>x==='element:lightning')||r.offer[0];if(!g.choose(best,Math.min(1,r.queue.length-1))){console.log('choice blocked',r.roomIndex,r.offer,best,r.upgrades);break}}
  continue;
 }
 const before=r.room.enemies.filter(e=>e.hp>0).length,room=r.roomIndex+1,wave=r.waveIndex+1,hp=r.hp;
 let chosen=0,score=-Infinity;
 for(const angle of Array.from({length:45},(_,i)=>-1.1+i*.05)){
  const trial=new MarbleGame();trial.run=structuredClone(r);trial.paused=false;
  trial.shoot(angle);for(let i=0;i<1000&&trial.run.phase==='flight';i++)trial.advance(250);
  const kills=trial.run.shots.at(-1)?.kills||0,damage=trial.run.room.enemies.reduce((n,e)=>n+e.maxHp-e.hp,0);
  const s=kills*100+damage+(trial.run.waveIndex>r.waveIndex?10000:0)+(trial.run.roomsCleared>r.roomsCleared?20000:0);
  if(s>score){score=s;chosen=angle}
 }
 g.shoot(chosen);
 for(let i=0;i<1000&&g.run.phase==='flight';i++)g.advance(250);
 trail.push({room,wave,angle:chosen,before,after:g.run.room.enemies.filter(e=>e.hp>0).length,hp,now:g.run.hp,kills:g.run.shots.at(-1)?.kills});
}
const result={seed,phase:g.run.phase,room:g.run.roomIndex+1,wave:g.run.waveIndex+1,hp:g.run.hp,cleared:g.run.roomsCleared,turns:trail.length,reward:g.reward()};
console.log(JSON.stringify(process.argv.includes('--compact')?result:{...result,trail:trail.slice(0,25)},null,2));
