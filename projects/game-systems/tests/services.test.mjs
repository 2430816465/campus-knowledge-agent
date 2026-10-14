import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServices,createRoomService,initial} from '../services.js';
import {GameHost,registerGame} from '../adapters.js';
const memory=(saved=null)=>{let data=saved;return {load:()=>data,save:v=>{data=structuredClone(v)}}};
test('avatar and orb slots are independent, exclusive, persistent, and cannot equip unowned items',()=>{
 const storage=memory({...initial(),coins:1000}),s=createServices(storage);
 for(const id of ['avatar-ranger','avatar-camper','scarf','rose-orb','mint-orb'])assert.equal(s.buy(id),'bought');
 s.equip('avatar-ranger');s.equip('rose-orb');s.equip('avatar-camper');assert.deepEqual(s.get().equipped,['rose-orb','avatar-camper']);
 s.equip('scarf');s.equip('mint-orb');assert.deepEqual(s.get().equipped,['scarf','mint-orb']);
 const balance=s.get().coins;assert.equal(s.buy('mint-orb'),'owned');assert.equal(s.get().coins,balance);
 const restored=createServices(storage);assert.deepEqual(restored.get().equipped,['scarf','mint-orb']);restored.equip('mint-orb');assert.deepEqual(restored.get().equipped,['scarf']);assert.throws(()=>restored.equip('avatar-fox'));
});
test('base and ad rewards, task claims and purchases are idempotent across reloads',()=>{
 const storage=memory(),s=createServices(storage);s.progress({id:'play',mode:'tower',seconds:600,units:30});s.finish('a','tower',true,50,{sessionId:'play'});s.finish('a','tower');assert.equal(s.get().coins,210);
 s.adReward('a');s.adReward('a');assert.equal(s.get().coins,220);s.claim('first');s.claim('first');assert.equal(s.get().coins,270);
 assert.equal(s.buy('scarf'),'bought');assert.equal(s.buy('scarf'),'owned');assert.equal(s.get().coins,150);
 const restored=createServices(storage);assert.equal(restored.get().coins,150);assert.equal(restored.get().runs.length,2);restored.equip('scarf');assert.deepEqual(restored.get().equipped,['scarf']);
 assert.equal(restored.buy('pick'),'poor');assert.equal(restored.get().coins,150);assert.throws(()=>restored.claim('all'));assert.throws(()=>restored.adReward('missing'));
});
test('failed persistence does not mutate in-memory wallet',()=>{const s=createServices({load:()=>null,save:()=>{throw Error('QuotaExceeded')}});assert.throws(()=>s.finish('a','tower'));assert.equal(s.get().coins,160);assert.equal(s.get().runs.length,0)});
test('four-mode achievement and reset',()=>{const s=createServices(memory());['tower','marble','mine','coop'].forEach((m,i)=>s.progress({id:'r'+i,mode:m,seconds:120,units:10}));s.claim('all');assert.equal(s.get().coins,276);s.reset();assert.equal(s.get().coins,160);assert.equal(s.get().runs.length,0)});
test('marble base and simulated-ad rewards keep stable IDs and capped values',()=>{const storage=memory(),s=createServices(storage);s.progress({id:'play',mode:'marble',seconds:600,units:20});s.finish('marble-run','marble',true,5,{total:20,sessionId:'play'});s.finish('marble-run','marble',true,5,{total:41});assert.equal(s.get().coins,180);s.adReward('marble-run',99);s.adReward('marble-run',99);assert.equal(s.get().coins,190);const restored=createServices(storage);restored.finish('marble-run','marble',true,5,{total:20});restored.adReward('marble-run',12);assert.equal(restored.get().coins,190)});
test('room creation, joining, full, missing, readiness and leave',()=>{const room=createRoomService();assert.throws(()=>room.join('000000'),/不存在/);assert.throws(()=>room.join('888888'),/已满/);room.create();assert.equal(room.get().state,'waiting');room.set('joined');room.ready();assert.equal(room.get().ready,true);room.set('ready');room.set('disconnected');assert.equal(room.get().state,'disconnected');room.set('failed');assert.equal(room.get().state,'failed');room.leave();assert.equal(room.get(),null);room.join('246810');assert.equal(room.get().host,false)});
test('leaving while assets load cancels stale entry and destroys resources',async()=>{let release,entered=0,destroyed=0;registerGame('tower',{load:()=>new Promise(r=>release=r),enter:()=>entered++,exit:()=>{},destroy:()=>destroyed++});const host=new GameHost();const start=host.start('tower',{});host.stop();release();await start;assert.equal(entered,0);assert.equal(destroyed,1)});

test('resuming a fallen tower run and winning only pays the difference once',()=>{const storage=memory(),s=createServices(storage);s.finish('same-tower','tower',false,3);s.finish('same-tower','tower',true,50);s.finish('same-tower','tower',true,50);assert.equal(s.get().runs.length,1);assert.equal(s.get().runs[0].score,50);assert.equal(s.get().runs[0].reward,30);assert.equal(s.get().coins,190);const restored=createServices(storage);restored.finish('same-tower','tower',true,50);assert.equal(restored.get().coins,190)});
