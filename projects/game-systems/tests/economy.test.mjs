import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServices,initial,products} from '../services.js';
import {calendar} from '../economy.js';
import {progressSnapshot,EconomyObserver} from '../economy-observer.js';
const storage=(saved=null)=>{let data=saved,time=Date.parse('2026-10-01T04:00:00Z');return {load:()=>data,save:x=>data=structuredClone(x),now:()=>time,setTime:t=>time=t};};
const active=(s,id='session',mode='evolve',seconds=120,units=10)=>s.progress({id,mode,seconds,units});
test('old wallet, purchases, settings and first-clear survive migration',()=>{
 const old=initial();old.coins=731;old.owned=['rose-orb'];old.equipped=['rose-orb'];old.claimed=['first'];old.settings.sound=false;old.runs=[{id:'workshop-beacon-1',mode:'workshop',win:true,score:1,reward:10}];
 const s=createServices(storage(old));assert.equal(s.get().coins,731);assert.deepEqual(s.get().owned,old.owned);assert.equal(s.get().settings.sound,false);
 assert.equal(s.finish('different-id','workshop',true,1,{beacon:1}).reward,0);assert.equal(s.get().coins,731);
});
test('observer stationary position, pause and unattended time cannot create progress',()=>{
 const original={document:globalThis.document,location:globalThis.location,performance:globalThis.performance};let time=0;
 globalThis.document={hidden:false};globalThis.location={origin:'http://test'};globalThis.performance={now:()=>time};
 try{
  const s=createServices(storage()),g={floor:1,pos:{x:5,y:10},hero:{gold:0},grids:{}},w={MT:{Game:{G:g}},render_game_to_text:()=>JSON.stringify({modal:false}),document:{addEventListener(){},removeEventListener(){}},postMessage(){}};
  const o=new EconomyObserver('tower',{contentWindow:w},{onProgress:d=>s.progress(d),getBalance:()=>s.get().coins});o.input();o.sample();
  const tick=()=>{time+=2000;o.sample();};for(let i=0;i<16;i++)tick();assert.equal(o.units,0);assert.equal(s.get().coins,160);
  g.pos.x=6;tick();assert.equal(o.units,1);assert.equal(s.get().coins,161);o.setPaused(true);g.pos.x=7;tick();assert.equal(o.units,1);o.setPaused(false);
  time+=61000;g.pos.x=8;o.sample();assert.equal(o.units,1);assert.equal(s.get().coins,161);
 }finally{for(const [k,v]of Object.entries(original))if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
});
test('false final level and corrupt wallet cannot silently reset or grant first-clear',()=>{
 const s=createServices(storage());assert.equal(s.finish('too-early','evolve',true,10,{rulesVersion:2,level:10,eaten:30}).reward,0);
 assert.equal(s.finish('real-final','evolve',true,20,{rulesVersion:2,level:20,eaten:30}).reward,10);
 assert.throws(()=>createServices(storage({version:9,coins:900})),/存档/);
});
test('idle has no income, meaningful activity is time bounded and incremental',()=>{
 const st=storage(),s=createServices(st);assert.equal(active(s,'idle','evolve',600,0).amount,0);assert.equal(active(s,'session','evolve',120,10).amount,4);assert.equal(s.get().coins,164);
 assert.equal(active(s).amount,0);assert.equal(active(s,'session','evolve',180,12).amount,2);assert.equal(active(s,'session','evolve',90,2).amount,0);
 const restored=createServices(st);assert.equal(active(restored,'session','evolve',180,12).amount,0);assert.equal(restored.get().coins,166);
});
test('all ten modes can earn without exchanging local resources',()=>{
 const s=createServices(storage());for(const mode of ['tower','marble','mine','coop','liars','evolve','workshop','chess','nightwatch','rush'])assert.equal(active(s,mode,mode).amount,4);assert.equal(s.get().coins,200);
});
test('unknown modes, malformed IDs and negative currency input are rejected',()=>{
 const s=createServices(storage());assert.throws(()=>s.finish('x','unknown',false));assert.throws(()=>active(s,'__proto__'));assert.throws(()=>active(s,'x','evolve',-1));assert.throws(()=>active(s,'x','evolve',NaN));assert.equal(s.get().coins,160);
});
test('first-clear cannot be farmed using another receipt ID',()=>{
 const s=createServices(storage());assert.equal(s.finish('a','coop',true,1).reward,8);assert.equal(s.finish('b','coop',true,1).reward,0);assert.equal(s.finish('c','coop',false,2).reward,0);
 assert.equal(s.finish('r1','rush',true,1,{stage:1}).reward,8);const paid=s.get().coins;s.finish('r2','rush',true,1,{stage:1});assert.equal(s.get().coins,paid);
 assert.equal(s.finish('w1','workshop',true,1,{beacon:1}).reward,10);assert.equal(s.finish('w2','workshop',true,1,{beacon:1}).reward,0);
});
test('daily, weekly, cross-midnight and duplicate claims',()=>{
 const st=storage(),s=createServices(st);for(let i=0;i<5;i++)active(s,'s'+i);
 const q=s.get().tasks;assert.equal(q[0].count,5);assert.equal(q[2].count,5);for(const item of q)assert.equal(s.claim(item.id),true);const balance=s.get().coins;for(const item of q)assert.equal(s.claim(item.id),false);assert.equal(s.get().coins,balance);
 st.setTime(Date.parse('2026-10-01T16:00:01Z'));assert.equal(s.get().tasks[0].count,0);assert.equal(s.get().tasks[2].claimed,true);assert.throws(()=>s.claim(q[0].id+'-expired'));
 assert.equal(calendar(Date.parse('2026-10-04T16:00:00Z')).week,'2026-10-05');
});

test('normal and hard marble first-clears are independent and cannot repeat after reload',()=>{
 const st=storage();let s=createServices(st);
 for(let level=1;level<=50;level++){
  assert.equal(s.finish('marble-ruins-v2-level-'+level,'marble',true,level,{campaign:true}).reward,8);
  assert.equal(s.finish('marble-hard-v3-level-'+level,'marble',true,level,{campaign:'marble-hard-v3',difficulty:'hard',levelId:level}).reward,8);
 }
 assert.equal(s.get().coins,960);s=createServices(st);
 assert.equal(s.finish('hard-replay','marble',true,1,{campaign:'marble-hard-v3',levelId:1}).reward,0);
 assert.equal(s.finish('normal-replay','marble',true,1,{campaign:true}).reward,0);
 s.finish('marble-hard-v3-level-1','marble',true,1,{campaign:'marble-hard-v3',levelId:1});assert.equal(s.get().coins,960);
});

test('marble hard receipts preserve legacy normal milestones and reject mismatched map evidence',()=>{
 const old=initial();old.coins=501;old.runs=[{id:'marble-ruins-v2-level-1',mode:'marble',win:true,score:1,reward:8,details:{campaign:true}}];
 const s=createServices(storage(old));
 assert.equal(s.finish('normal-replay','marble',true,1,{campaign:true}).reward,0);
 assert.equal(s.finish('marble-hard-v3-level-1','marble',true,1,{campaign:'marble-hard-v3',levelId:1}).reward,8);
 assert.equal(s.get().coins,509);
 assert.equal(s.finish('bad-hard-score','marble',true,2,{campaign:'marble-hard-v3',levelId:1}).reward,0);
 assert.equal(s.finish('marble-hard-v3-level-4','marble',true,3,{campaign:'marble-hard-v3',levelId:3}).reward,0);
 assert.equal(s.get().coins,509);
});
test('ads scale to actual basic income, exclude first-clear and stop at three',()=>{
 const st=storage(),s=createServices(st);
 for(let i=0;i<4;i++){active(s,'s'+i,'evolve',600,30);s.finish('end'+i,'evolve',false,3,{sessionId:'s'+i});assert.equal(s.adInfo('end'+i).amount,10);if(i<3){assert.equal(s.adReward('end'+i),true);assert.equal(s.adReward('end'+i),false);}else assert.throws(()=>s.adReward('end'+i));}
 s.finish('milestone','workshop',true,1,{beacon:1});assert.equal(s.adInfo('milestone').amount,0);
 st.setTime(Date.parse('2026-10-01T16:00:01Z'));assert.equal(s.adInfo('end3').remaining,3);assert.equal(s.adReward('end3'),true);
});
test('failed writes leave balance, progress and purchase unmodified for retry',()=>{
 const s=createServices({load:()=>null,save:()=>{throw Error('QuotaExceeded');}});assert.throws(()=>active(s));assert.equal(s.get().coins,160);assert.equal(Object.keys(s.get().economy.sessions).length,0);assert.throws(()=>s.buy('chess-bamboo'));assert.deepEqual(s.get().owned,[]);
});
test('cosmetic purchase/equip persists without modifying game stats',()=>{
 const old=initial();old.coins=1500;const st=storage(old),s=createServices(st);for(const id of ['evolve-lotus','chess-bamboo','bakery-berry']){assert.equal(s.buy(id),'bought');s.equip(id);assert.equal(s.buy(id),'owned');}
 assert.equal(s.get().coins,480);assert.equal(createServices(st).get().equipped.length,3);assert.equal(products.find(x=>x.id==='evolve-lotus').price,300);
});
test('adapters only inspect public progress and do not credit menu snapshots',()=>{
 const w=s=>({render_game_to_text:()=>JSON.stringify(s)});
 assert.equal(progressSnapshot('evolve',w({phase:'playing',screen:'title'})).playing,false);
 assert.equal(progressSnapshot('rush',w({screen:'playing',battle:{status:'playing',kills:2}})).playing,true);
 assert.equal(progressSnapshot('mine',w({state:'EXPLORING',settled:false,stats:{digActions:5}})).metrics.digs,5);
 assert.equal(progressSnapshot('nightwatch',w({view:'home',battle:{status:'playing'}})).playing,false);
});
