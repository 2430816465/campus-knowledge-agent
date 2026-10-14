import test from 'node:test';
import assert from 'node:assert/strict';
import {responseDelay} from '../games/liars/bots.js';
import {seatCountdown} from '../games/liars/presentation.js';
import {Rooms} from '../games/liars/rooms.js';
import {createMatch,play,challenge,drink,step,TIMING} from '../games/liars/rules.js';
import {rng} from '../tools/liars-match-balance.mjs';

test('random thinking has inclusive bounds and 90/10 buckets',()=>{
 let short=0,long=0;
 for(let bucket=0;bucket<100;bucket++)for(const end of [false,true]){
  let first=true;const delay=responseDelay(n=>{if(first){first=false;return bucket;}return end?n-1:0;});
  if(bucket<90){short++;assert.equal(delay,end?8000:3000);}else{long++;assert.equal(delay,end?12000:8001);}
 }
 assert.equal(short,180);assert.equal(long,20);
 const random=rng(328),samples=Array.from({length:10000},()=>responseDelay(random));
 assert.ok(new Set(samples).size>1000);assert.ok(samples.every(n=>n>=3000&&n<=12000));assert.ok(samples.filter(n=>n>8000).length>800&&samples.filter(n=>n>8000).length<1200);
});
test('thinking is sampled once per hand and rerolls only for a new play',()=>{
 let calls=0,tail=false;const service=new Rooms({randomInt:n=>{calls++;return tail?n-1:0;}});
 const room={slots:['hero','demon'].map(character=>({name:character,character,bot:true})),humanCount:0,strength:.5};service.start(room,0);
 calls=0;service.botTick(room,0);assert.equal(room.botAction.at,3000);assert.equal(calls,2);
 service.botTick(room,500);service.botTick(room,2999);assert.equal(calls,2);assert.equal(room.game.revision,1);
 tail=true;room.game.revision++;service.botTick(room,1000);assert.equal(room.botAction.at,13000);assert.equal(calls,4);
 room.game.phase='reveal';room.game.event={loser:room.game.turn};room.game.revision++;service.botTick(room,1000);assert.equal(room.botAction,null);assert.equal(calls,4);
 room.game.phase='playing';room.game.deadline=4000;service.botTick(room,3990);assert.equal(room.botAction.at,3990);assert.equal(room.game.deadline,4000);
});
test('clock belongs only to current actor, follows seat changes and disappears during reveal/outcome',()=>{
 const g={phase:'playing',turn:2,phaseAt:0,deadline:30000,event:{loser:1}};
 assert.equal(seatCountdown(g,0,5000),null);assert.deepEqual(seatCountdown(g,2,5000),{seconds:25,fraction:25/30,action:'出牌'});
 g.turn=3;assert.equal(seatCountdown(g,2,5000),null);assert.equal(seatCountdown(g,3,29999).seconds,1);assert.equal(seatCountdown(g,3,31000).seconds,0);
 for(const phase of ['potion','reveal','outcome','finished']){g.phase=phase;for(let seat=0;seat<4;seat++)assert.equal(seatCountdown(g,seat,30000),null);}
});
test('verdict transitions directly to automatic drinking exactly once',()=>{
 for(const lie of [false,true]){
  const random=rng(42),g=createMatch(['hero','demon'].map(character=>({name:character,character})),random,0);
  const accused=g.turn;g.target='hero';g.players[accused].hand=[{id:'proof',kind:lie?'demon':'thief'},{id:'keep',kind:'hero'}];
  play(g,accused,['proof'],random,0);challenge(g,g.turn,10);const loser=g.event.loser,deadline=g.deadline,rev=g.revision;
  assert.equal(step(g,random,deadline-1),false);assert.equal(g.phase,'reveal');assert.equal(g.players[loser].drinks,0);
  assert.equal(step(g,random,deadline),true);assert.equal(g.phase,'outcome');assert.equal(g.players[loser].drinks,1);assert.equal(g.revision,rev+1);
  assert.equal(g.phaseAt,deadline);assert.equal(g.deadline,deadline+TIMING.outcome);assert.equal(step(g,random,deadline),false);
  assert.throws(()=>drink(g,loser,deadline+1),/不需要/);assert.equal(g.players[loser].drinks,1);assert.ok(TIMING.drink<=3000);
 }
});
