import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,restore,advance,offline,sweep,furnaceAction,upgrade,deliver} from '../games/workshop/economy.js';
test('bare opening never transports, crafts or earns without player actions',()=>{
 const s=fresh(1000);assert.equal(s.coins,0);assert.equal(s.lineBuilt,false);assert.deepEqual(s.collectors,[1,0,0]);assert.equal(upgrade(s,'rail'),false);advance(s,600);
 assert.deepEqual(s.buffer,[6,0,0]);assert.deepEqual(s.dust,[0,0,0]);assert.deepEqual(s.carts,[]);assert.equal(s.crafted,0);assert.equal(s.coins,0);offline(s,3601000);assert.equal(s.coins,0);assert.equal(s.crafted,0);
});
test('real drops, hand capacity, explicit furnace and first earnings build a line',()=>{
 const s=fresh();assert.equal(sweep(s),0);advance(s,18.1);assert.equal(sweep(s),3);assert.deepEqual(s.hand.raw,[3,0,0]);assert.equal(sweep(s),0);advance(s,.4);assert.equal(sweep(s),3);assert.deepEqual(s.hand.raw,[6,0,0]);assert.equal(sweep(s),0);assert.equal(s.crafted,0);
 for(let i=0;i<3;i++){assert(furnaceAction(s).ok);assert(s.job);advance(s,3);assert.equal(s.goods[0],i);assert.equal(s.hand.ready[0],1);advance(s,6);assert.equal(s.hand.ready[0],1);assert.equal(s.job,null);assert(furnaceAction(s).ok);assert.equal(s.goods[0],i+1);}
 const result=deliver(s);assert.equal(result.reward,90);assert.equal(s.coins,90);assert(upgrade(s,'rail'));assert.equal(s.lineBuilt,true);assert.equal(s.coins,40);assert.equal(s.upgrades.rail,0);advance(s,90);assert(s.crafted>3);assert(s.coins>=90);assert(upgrade(s,'collector',1));
});
test('manual materials and oven output survive reload and pause; old automatic saves migrate',()=>{
 const s=fresh();advance(s,6.1);sweep(s);furnaceAction(s);advance(s,3);const r=restore(structuredClone(s));assert.equal(r.lineBuilt,false);assert.deepEqual(r.hand,s.hand);assert.equal(r.hand.ready[0],1);r.paused=true;assert.equal(furnaceAction(r).ok,false);assert.equal(sweep(r),0);const before=JSON.stringify(r);advance(r,90);assert.equal(JSON.stringify(r),before);
 const legacy=structuredClone(s);delete legacy.lineBuilt;delete legacy.hand;legacy.coins=321;legacy.upgrades.rail=2;const old=restore(legacy);assert.equal(old.lineBuilt,true);assert.equal(old.coins,321);assert.equal(old.upgrades.rail,2);assert.deepEqual(old.hand,{raw:[0,0,0],ready:[0,0,0,0]});
});
test('building with a bag and oven output transfers each item exactly once',()=>{
 const s=fresh();s.coins=50;s.hand.raw=[3,1,0];s.hand.ready=[1,0,0,0];assert(upgrade(s,'rail'));advance(s,.1);assert.deepEqual(s.hand.raw,[0,0,0]);assert.deepEqual(s.hand.ready,[0,0,0,0]);assert.equal(s.goods[0],1);assert.equal(s.dust[0],1);assert.equal(s.dust[1],1);advance(s,.1);assert.equal(s.goods[0],1);assert.equal(s.dust[1],1);
});
