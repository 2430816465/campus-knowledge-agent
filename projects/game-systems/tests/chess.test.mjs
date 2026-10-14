import test from 'node:test';
import assert from 'node:assert/strict';
import {makePoker,analyzePlay,strength} from '../games/chess/cards.js';
import {createPoker,actPoker,publicPoker,choosePoker} from '../games/chess/poker.js';
import {MAHJONG_DEFAULTS,makeTiles,winning,scoreHand,createMahjong,actMahjong,publicMahjong,chooseMahjong} from '../games/chess/mahjong.js';
import {Rooms,normalizeOptions} from '../games/chess/rooms.js';
import {privateIPv4,serverEndpoint} from '../games/chess/network.js';
const profiles=Array.from({length:4},(_,i)=>({name:'旅人'+i,character:['knight','dwarf','mage','rogue'][i]}));
const rng=seed=>max=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%max;};
let serial=0;const cards=vs=>vs.map(value=>({value,type:(serial++%4),id:'fixture-'+serial}));
const same=(v,n)=>cards(Array(n).fill(v));
test('physical decks and four-player landlord deal are exact',()=>{
 assert.equal(makePoker(1).length,54);assert.equal(new Set(makePoker(2).map(c=>c.id)).size,108);assert.equal(makeTiles().length,144);
 const g=createPoker('ddz4',profiles,{rounds:4},rng(18),0);assert.deepEqual(g.players.map(p=>p.hand.length),[25,25,25,25]);assert.equal(g.bottom.length,8);actPoker(g,g.turn,{type:'bid',value:3},rng(1),1);assert.equal(g.players[g.landlord].hand.length,33);
});
test('landlord shapes, bomb sizes, wings and joker ordering',()=>{
 assert(analyzePlay(cards([3,4,5,6,7]),'ddz3'));assert(!analyzePlay(cards([11,12,13,14,15]),'ddz3'));assert(analyzePlay(cards([3,3,3,4]),'ddz3'));assert(!analyzePlay(cards([3,3,3,4]),'ddz4'));assert(!analyzePlay(cards([3,3,3,4,4,4,5,6]),'ddz4'));assert(analyzePlay(cards([3,3,3,4,4,4,5,5,6,6]),'ddz4'));
 const small=analyzePlay(same(14,4),'ddz4');assert(analyzePlay(same(3,5),'ddz4',null,small));assert(!analyzePlay(same(13,4),'ddz4',null,small));assert(analyzePlay(cards([16,16,17,17]),'ddz4',null,analyzePlay(same(15,8),'ddz4')));
});
test('Guandan level is above A, ordinary 2 is below 3; wildcard cannot become a joker',()=>{
 const level=8;assert(strength({value:8},level)>strength({value:14},level));assert(strength({value:15},level)<strength({value:3},level));
 assert(!analyzePlay([{id:'a',value:16,type:0},{id:'b',value:8,type:2}],'guandan',level));assert(analyzePlay([{id:'a',value:16,type:0},{id:'b',value:16,type:0}],'guandan',level));
 const flush=analyzePlay([3,4,5,6,7].map((value,i)=>({value,type:0,id:'f'+i})),'guandan',8);assert.equal(flush.type,'STRAIGHT_FLUSH');assert(!analyzePlay(same(14,5),'guandan',8,flush));assert(analyzePlay(same(3,6),'guandan',8,flush));
 assert(!analyzePlay(cards([3,3,3,4,5]),'guandan',8));assert(!analyzePlay(cards([3,4,5,6,7,8]),'guandan',10));
});
test('Nanjing pairs, flowers, base/menqing and caps are explicit',()=>{
 const hand=cards([0,0,1,1,2,2,3,3,4,4,5,5,6,6]);assert(winning(hand));assert(!winning(cards([31,31,1,1,2,2,3,3,4,4,5,5,6,6])));
 const g=createMahjong(profiles,{...MAHJONG_DEFAULTS},rng(8),0);g.discardCount=4;g.wall=Array(20).fill({});g.players[0].hand=hand;g.players[0].flowers=[];g.players[0].melds=[];
 const s=scoreHand(g,0,hand.at(-1),true);assert(s.patterns.some(p=>p.name==='七对'));assert.equal(s.menqing,true);assert(s.details.includes('门清 0'));g.options.cap=300;g.biMultiplier=2;g.players[0].drawReason='gang';assert.equal(scoreHand(g,0,hand.at(-1),true).flowers,300);
});
test('simultaneous wins wait for all responses and zero-sum payments',()=>{
 const g=createMahjong(profiles,{...MAHJONG_DEFAULTS},rng(3),0);g.discardCount=5;const winningCards=cards([0,0,1,1,2,2,3,3,4,4,5,5,6]);g.players[1].hand=winningCards;g.players[2].hand=cards(winningCards.map(c=>c.value));g.players.forEach(p=>{p.flowers=[];p.melds=[];p.river=[];p.startScore=p.score=0;});
 const tile=cards([6])[0];g.players[0].hand=[tile];g.turn=0;actMahjong(g,0,{type:'discard',card:tile.id},rng(1),1);assert(g.pending.eligible[1].includes('hu'));assert(g.pending.eligible[2].includes('hu'));
 for(const seat of Object.keys(g.pending.eligible).map(Number)){actMahjong(g,seat,{type:'claim',value:[1,2].includes(seat)?'hu':'pass'},rng(1),2);}
 assert.deepEqual(g.settlement.winners,[1,2]);assert.equal(g.players.reduce((n,p)=>n+p.score,0),0);assert.equal(g.nextBi,true);
});
test('twenty seeded complete matches per mode conserve cards, finish and never expose hidden state',()=>{
 for(const kind of ['ddz3','ddz4','guandan','nanjing'])for(let seed=1;seed<=20;seed++){
  const random=rng(seed),n=kind==='ddz3'?3:4;let g=kind==='nanjing'?createMahjong(profiles,MAHJONG_DEFAULTS,random,0):createPoker(kind,profiles.slice(0,n),{rounds:4},random,0),now=0;
  for(let step=0;step<2000&&!['roundEnd','finished'].includes(g.phase);step++){
   const all=kind==='nanjing'?[...g.wall,...g.players.flatMap(p=>[...p.hand,...p.flowers,...p.river,...p.melds.flatMap(m=>m.cards)]),...(g.last?.rob?[g.last.card]:[])]:[...g.players.flatMap(p=>p.hand),...g.played,...(g.landlord===null?g.bottom:[])];
   assert.equal(all.length,kind==='nanjing'?144:kind==='ddz3'?54:108,kind+' conservation');assert.equal(new Set(all.map(c=>c.id)).size,all.length);
   const seat=g.pending?Number(Object.keys(g.pending.eligible).find(i=>!g.pending.responses[i])):g.turn,view=kind==='nanjing'?publicMahjong(g,seat):publicPoker(g,seat);assert(!('wall' in view));assert(view.players.every(p=>!('hand'in p)));const a=kind==='nanjing'?chooseMahjong(view):choosePoker(view);assert(a);now+=100;
   if(kind==='nanjing')actMahjong(g,seat,a,random,now);else actPoker(g,seat,a,random,now);
  }
  assert(['roundEnd','finished'].includes(g.phase),kind+' terminates seed '+seed);assert.equal(g.players.reduce((n,p)=>n+p.score,0),0);
 }
});
test('robbing an added kong cancels payment, retains pong and honors closest-only win and bao',()=>{
 const g=createMahjong(profiles,{...MAHJONG_DEFAULTS,multiHu:false},rng(8),0);g.discardCount=9;g.players.forEach(p=>{p.hand=[];p.flowers=[];p.melds=[];p.river=[];p.score=p.startScore=0;});
 const tile=cards([6])[0];g.players[0].hand=[tile];g.players[0].melds=[{type:'peng',value:6,cards:same(6,3),from:3}];g.turn=0;
 for(const s of [1,2])g.players[s].hand=cards([0,0,1,1,2,2,3,3,4,4,5,5,6]);
 actMahjong(g,0,{type:'gang',card:tile.id},rng(1),1);assert(g.pending.rob);assert.equal(g.payments.length,0);actMahjong(g,2,{type:'claim',value:'hu'},rng(1),2);assert.equal(g.phase,'playing');actMahjong(g,1,{type:'claim',value:'hu'},rng(1),3);
 assert.deepEqual(g.settlement.winners,[1]);assert.equal(g.players[0].melds[0].type,'peng');assert.equal(g.players[0].melds[0].cards.length,3);assert.equal(g.payments.length,0);assert.equal(g.settlement.breakdowns[0].bao,0);assert.equal(g.players[1].score,g.settlement.breakdowns[0].flowers*3);assert.equal(g.players[2].score,0);assert.equal(g.players.reduce((n,p)=>n+p.score,0),0);
});
test('concealed kong pays each opponent immediately and replaces from the tail',()=>{
 const g=createMahjong(profiles,MAHJONG_DEFAULTS,rng(4),0);g.players.forEach(p=>{p.score=p.startScore=0;p.hand=[];p.flowers=[];p.melds=[];});g.turn=0;g.players[0].hand=same(2,4);g.wall=cards([1,2,3]);const tail=g.wall.at(-1).id;actMahjong(g,0,{type:'gang',card:g.players[0].hand[0].id},rng(1),1);assert.equal(g.players[0].drawn,tail);assert.equal(g.players[0].melds[0].type,'concealed');assert.deepEqual(g.players.map(p=>p.score),[15,-5,-5,-5]);assert.equal(g.players[0].drawReason,'gang');
});
test('Guandan multi-round tribute finishes and levels advance',()=>{
 const random=rng(723);let previous=null;
 for(let round=0;round<12;round++){const g=createPoker('guandan',profiles,{rounds:4},random,0,previous);if(previous){assert(g.phase==='tribute'||g.events.some(x=>x.includes('抗贡')));}
  for(let i=0;i<1200&&g.phase!=='roundEnd'&&g.phase!=='finished';i++){const a=choosePoker(publicPoker(g,g.turn));assert(a);actPoker(g,g.turn,a,random,i*100);}
  assert(g.settlement);previous=g;if(g.phase==='finished')break;
 }assert(previous.teamLevels.some(v=>v!==15));
});
test('room action deduplication, stale revision, seat token, owner transfer and matchmaking',()=>{
 let now=0,id=0;const service=new Rooms({randomInt:rng(555),uuid:()=>String(++id).padStart(12,'0'),now:()=>now,botDelay:0}),messages=new Map();
 const open=k=>{messages.set(k,[]);service.open(k,m=>messages.get(k).push(m));};const send=(k,m)=>service.handle(k,{v:1,...m});open('p0');open('p1');send('p0',{type:'create',kind:'ddz4',clientId:'player-zero'});const room=[...service.rooms.values()][0];send('p1',{type:'join',code:room.code,clientId:'player-one'});send('p0',{type:'ready',value:true});send('p1',{type:'ready',value:true});send('p0',{type:'start'});assert.equal(room.slots.filter(s=>s.bot).length,2);
 room.game.turn=0;const m={type:'action',requestId:'request-0001',revision:room.game.revision,action:{type:'bid',value:3}};send('p0',m);const rev=room.game.revision;send('p0',m);assert.equal(room.game.revision,rev);assert(messages.get('p0').some(m=>m.duplicate));send('p0',{...m,requestId:'request-0002'});assert.equal(room.game.revision,rev);
 const token=room.slots[0].token;service.close('p0');assert.equal(room.host,1);now=100;open('p2');send('p2',{type:'join',code:room.code,token,clientId:'player-zero'});assert.equal(service.peers.get('p2').seat,0);assert.equal(service.metrics.resumes,1);assert(messages.get('p2').filter(m=>m.type==='snapshot').every(m=>m.game.players.every(p=>!p.hand)));
 service.close('p2');now=30101;service.tick();assert(room.slots[0].bot);open('p3');send('p3',{type:'join',code:room.code,token,clientId:'player-zero'});assert(messages.get('p3').some(m=>m.type==='error'));
 open('q');send('q',{type:'match',kind:'ddz3',clientId:'queue-person'});now+=8001;service.tick();assert(service.peers.get('q').room);assert.equal(service.queue.size,0);
});
test('network addresses and room option bounds',()=>{
 assert.equal(privateIPv4('192.168.1.23'),'192.168.1.23');assert.throws(()=>privateIPv4('8.8.8.8'));assert.throws(()=>serverEndpoint('http://example.com'));assert.equal(serverEndpoint('https://example.com'),'wss://example.com/chess-ws?v=1');assert.throws(()=>normalizeOptions('nanjing',{players:5}));assert.throws(()=>normalizeOptions('nanjing',{bao:'yes'}));
});
