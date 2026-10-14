import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,restore,upgrade,advance,offline,capacity,stockTotal,sweep,deliver,currentOrder,RECIPES,resonate,grantAd,SAVE_KEY} from '../games/workshop/economy.js';
import {createServices,modes} from '../services.js';
import {simulate} from '../tools/bakery-balance.mjs';
test('production travels before stocking and polishes while reserving order goods',()=>{
 const s=fresh();s.lineBuilt=true;s.coins=60;advance(s,3.1);assert.equal(s.carts.length,1);assert.equal(stockTotal(s),0);advance(s,21);assert.equal(s.goods[0],3);assert.equal(s.coins,60);const reward=deliver(s);assert.equal(reward.beacon,1);assert.equal(s.coins,150);advance(s,60);assert(s.goods[0]>=5);assert(s.coins>150);
});
test('locks, upgrade costs, max levels, manual collection and capacity prevent negative inventory',()=>{
 const s=fresh();s.coins=60;assert.equal(upgrade(s,'collector',1),false);assert.equal(upgrade(s,'collector',0),true);assert.equal(s.coins,20);assert.equal(upgrade(s,'rail'),false);advance(s,6.3);assert.equal(sweep(s),3);assert.equal(sweep(s),0);s.lineBuilt=true;s.dust=[capacity(s),0,0];s.recipe=1;s.beacons=1;s.collectors=[8,8,0];advance(s,300);assert(stockTotal(s)<=capacity(s));assert(s.crafted>10,'full blue stock must not block incoming gold');assert(s.buffer.every(n=>n<=24));assert(s.carts.length<=8);s.coins=1e7;for(let i=0;i<20;i++)upgrade(s,'rail');assert.equal(s.upgrades.rail,8);assert.equal(upgrade(s,'collector',99),false);
});
test('offline uses the same pipeline, caps two hours and explicit pause freezes gains',()=>{
 const s=fresh(1000);s.lineBuilt=true;advance(s,15);const clone=structuredClone(s);s.savedAt=1000;offline(s,601000);advance(clone,600);assert.deepEqual(s.dust,clone.dust);assert.equal(s.coins,clone.coins);const paused=structuredClone(s);paused.paused=true;const coins=paused.coins,elapsed=paused.elapsed;offline(paused,1e9);assert.equal(paused.coins,coins);assert.equal(paused.elapsed,elapsed);const cap=fresh(1000);const info=offline(cap,1e9);assert.equal(info.seconds,7200);assert(Math.abs(cap.elapsed-7200)<.01);
});
test('save normalization retains jobs and carts without accepting malformed values',()=>{
 const s=fresh(1000);sweep(s);advance(s,.1);const r=restore(JSON.parse(JSON.stringify(s)),2000);assert.deepEqual(r.job,s.job);assert.deepEqual(r.dust,s.dust);const bad=restore({version:1,coins:NaN,beacons:Infinity,collectors:[-4,99,99],dust:[1e8,1e8,1e8],carts:'bad',recipe:999,upgrades:{rail:99}},2000);assert.equal(bad.coins,0);assert.deepEqual(bad.collectors,[1,0,0]);assert.equal(stockTotal(bad),30);assert.equal(bad.recipe,0);assert.equal(bad.upgrades.rail,8);assert.deepEqual(restore({version:999},1000),fresh(1000));
});
test('free resonance and ad cooldown are mutually bounded and cannot be claimed twice',()=>{
 const s=fresh();assert.equal(resonate(s,'harvest'),false);s.focus=30;assert.equal(resonate(s,'harvest'),true);s.focus=30;assert.equal(resonate(s,'value'),false);assert.equal(grantAd(s),true);assert.equal(grantAd(s),false);advance(s,31);assert.equal(s.resonance,null);assert.equal(s.adBoost,0);assert(s.adCooldown>0);advance(s,90);assert.equal(grantAd(s),true);
});
test('six lamp milestones grant 10 camp coins each exactly once, and invalid evidence earns zero',()=>{
 let save;const storage={load:()=>save,save:d=>save=structuredClone(d)},service=createServices(storage);assert.equal(modes.find(m=>m.id==='workshop').slot,7);for(let i=1;i<=6;i++){service.finish('workshop-beacon-'+i,'workshop',true,i,{beacon:i});service.finish('workshop-beacon-'+i,'workshop',true,i,{beacon:i});}assert.equal(service.get().coins,220);const reloaded=createServices(storage);reloaded.finish('workshop-beacon-1','workshop',true,1,{beacon:1});reloaded.finish('invalid','workshop',true,99,{beacon:99});assert.equal(reloaded.get().coins,220);
});
test('no-ad campaign lasts 45–60 simulated minutes with quick first unlocks',()=>{
 for(const options of [{},{active:false},{upgradeLimit:6}]){const result=simulate(options);assert(result.completed);assert.equal(result.adBoost,0);assert(result.seconds>=2700&&result.seconds<=3600);assert(result.milestones[0]<60);assert(result.milestones[1]<240);console.log('Campaign pacing:',result);}
});
test('completed legacy teams remain complete; materials require an installed source',()=>{
 const s=fresh();s.beacons=4;s.deliveries=4;s.collectors=[3,2,2];s.goods=[20,12,5];const r=restore(structuredClone(s));assert.equal(r.beacons,4);assert.deepEqual(r.goods,[...s.goods,0]);assert.equal(currentOrder(r).name,'城堡法师队');
 const newShop=fresh();newShop.beacons=2;assert.equal(sweep(newShop,1),0);assert.equal(sweep(newShop,2),0);assert.equal(sweep(newShop,99),0);assert.equal(stockTotal(newShop),0);
});
