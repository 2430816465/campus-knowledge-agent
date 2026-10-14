import test from 'node:test';
import assert from 'node:assert/strict';
import {createWalker} from '../games/workshop/movement.js';
import {fresh,restore,cost,advance} from '../games/workshop/economy.js';
import {rewardOffer,claimReward} from '../games/workshop/rewards.js';
const bounds={left:0,right:600,top:0,bottom:600};
test('Click destinations obey diagonal speed and world bounds',()=>{
 const a=createWalker(100,100),b=createWalker(100,100);a.configure(bounds,[]);b.configure(bounds,[]);
 a.go(600,100);b.go(600,600);a.step(.1);b.step(.1);
 assert(Math.abs(Math.hypot(b.p.x-100,b.p.y-100)-(a.p.x-100))<.001);
 a.go(1000,1000);for(let i=0;i<100;i++)a.step(.05);assert(a.p.x<=600&&a.p.y<=600);
});
test('Fixtures block walking; pause discards click targets',()=>{
 const w=createWalker(90,150);w.configure(bounds,[{left:130,right:180,top:100,bottom:200}]);w.go(600,150);for(let i=0;i<10;i++)w.step(.05);assert(w.p.x<=119);
 const x=w.p.x,y=w.p.y;w.step(.1,false);w.step(.1);assert.equal(w.p.x,x);assert.equal(w.p.y,y);
 w.go(20,400);w.step(.05);assert(w.p.y>y);w.step(.05,false);const frozen={...w.p};w.step(.1);assert.deepEqual(w.p,frozen);
});
test('Tutorial completion gates reward offers; coin subsidy only appears for shortfalls',()=>{
 const s=fresh();assert.equal(rewardOffer(s,'production'),null);s.deliveries=1;s.beacons=1;
 s.coins=cost(s,'collector',0);assert.equal(rewardOffer(s,'coins',0),null);s.coins=0;const offer=rewardOffer(s,'coins',1);assert.equal(offer.value,45);
 assert.equal(claimReward(s,offer),true);assert.equal(s.coins,45);assert.equal(claimReward(s,offer),false);
 advance(s,121);s.coins=cost(s,'collector',1);assert.equal(rewardOffer(s,'coins',1),null);assert.equal(rewardOffer(s,'coins',2),null);
});
test('Offline pending reward survives legacy save restore and grants exactly once',()=>{
 const old=fresh();old.beacons=2;old.deliveries=2;old.collectors=[3,2,1];old.coins=123;old.offlineBonus=77;
 const s=restore(JSON.parse(JSON.stringify(old)));assert.deepEqual(s.collectors,old.collectors);assert.equal(s.coins,123);
 const offer=rewardOffer(s,'offline');assert.equal(claimReward(s,offer),true);assert.equal(s.coins,200);assert.equal(s.offlineBonus,0);advance(s,121);assert.equal(claimReward(s,offer),false);
});
