import test from 'node:test';import assert from 'node:assert/strict';
import {fresh,restore,advance,offline,RECIPES,recipeUnlocked} from '../games/workshop/economy.js';
import {buildFacility,businessAction,returnCarry,stockShelf,shopGoal,FACILITIES} from '../games/workshop/shop.js';
const ready=()=>{const s=fresh();s.beacons=3;s.lineBuilt=true;s.coins=10000;for(const f of FACILITIES)assert(buildFacility(s,f.id));return s;};
test('build gates, flour substitution and jam recipe consume real ingredients',()=>{
 const locked=fresh();locked.coins=10000;assert.equal(buildFacility(locked,'wagon'),false);assert.equal(buildFacility(locked,'bad'),false);
 const s=ready();assert(recipeUnlocked(s,3));s.dust=[20,10,20];s.recipe=3;const before=s.crafted;advance(s,20);assert(s.crafted>before);assert(s.shop.jam>=0);assert(s.shop.flour>=0);assert(s.dust.every(n=>n>=0));assert.equal(recipeUnlocked(fresh(),3),false);
});
test('meal delivery and returning carry conserve bread and award each meal once',()=>{
 const s=ready();s.shop.stock=[2,0,0,0];const coins=s.coins;assert(businessAction(s,'rack',RECIPES).ok);assert.equal(s.shop.stock[0],1);assert(returnCarry(s));assert.equal(s.shop.stock[0],2);assert.equal(returnCarry(s),false);assert(businessAction(s,'rack',RECIPES).ok);assert(businessAction(s,'table',RECIPES).ok);assert.equal(s.shop.served,1);assert.equal(s.coins,coins+21);assert.equal(businessAction(s,'table',RECIPES).ok,false);assert.equal(s.coins,coins+21);
});
test('three paid baskets make one trip; reload/offline cannot duplicate payment',()=>{
 const s=ready();s.shop.stock=[3,3,3,0];const start=s.coins;
 for(let i=0;i<3;i++){assert(businessAction(s,'pack',RECIPES).ok);assert.equal(businessAction(s,'pack',RECIPES).ok,false);advance(s,6.1);assert(businessAction(s,'pack',RECIPES).ok);assert.equal(businessAction(s,'pack',RECIPES).ok,false);assert(businessAction(s,'wagon',RECIPES).ok);}
 assert(s.shop.trip);assert.equal(s.coins,start);const clone=restore(structuredClone(s),1000);clone.savedAt=1000;offline(clone,47000);assert.equal(clone.shop.trips,1);assert.equal(clone.coins-start,626);const after=clone.coins;clone.collectors=[0,0,0];clone.dust=[0,0,0];clone.buffer=[0,0,0];clone.carts=[];clone.job=null;offline(clone,47000);assert.equal(clone.coins,after);assert.equal(clone.shop.trips,1);
});
test('pause, legacy migration, bad saves, shelf transfer and final goal have explicit limits',()=>{
 const s=ready();s.goods[0]=2;assert(stockShelf(s,0));assert.equal(s.goods[0],1);assert.equal(s.shop.stock[0],1);s.paused=true;const before=JSON.stringify(s);advance(s,60);assert.equal(businessAction(s,'rack',RECIPES).ok,false);assert.equal(buildFacility(s,'rack'),false);assert.equal(JSON.stringify(s),before);
 const legacy=restore({version:1,beacons:6,goods:[5,4,3]});assert.deepEqual(legacy.goods,[5,4,3,0]);assert.equal(legacy.beacons,6);assert(!shopGoal(legacy));const bad=restore({version:1,shop:{stock:[NaN,-2,Infinity,2],carry:{kind:'bread',recipe:77},trip:{value:-1,t:2}}});assert.deepEqual(bad.shop.stock,[0,0,0,2]);assert.equal(bad.shop.carry,null);assert.equal(bad.shop.trip,null);
 s.paused=false;s.beacons=6;s.shop.served=8;s.shop.trips=3;assert(shopGoal(s));s.shop.facilities.wagon=0;assert(!shopGoal(s));
});
