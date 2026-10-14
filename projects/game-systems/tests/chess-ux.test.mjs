import test from 'node:test';
import assert from 'node:assert/strict';
import {makePoker,analyzePlay} from '../games/chess/cards.js';
import {createPoker,actPoker,publicPoker,choosePoker} from '../games/chess/poker.js';
import {Rooms} from '../games/chess/rooms.js';
import {rangeSelection,sameRankSelection,selectionInfo,layoutHand,HintCycle,remainingRanks} from '../games/chess/ui-model.js';
const profiles=Array.from({length:4},(_,i)=>({name:'玩家'+i,character:'knight'}));
const rng=seed=>max=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%max;};
test('drag range reverses without leaving stale cards and removes previously selected ranges',()=>{
 const order=['a','b','c','d','e'];
 assert.deepEqual(rangeSelection(order,['e'],'a','d',true),order);
 assert.deepEqual(rangeSelection(order,['e'],'a','b',true),['a','b','e']);
 assert.deepEqual(rangeSelection(order,order,'d','b',false),['a','e']);
});
test('same rank selection toggles a full group, and grouping conserves physical IDs',()=>{
 const g=publicPoker(createPoker('ddz4',profiles,{rounds:4},rng(8),0),0),c=g.hand[0],ids=g.hand.filter(x=>x.value===c.value).map(x=>x.id);
 assert.deepEqual(sameRankSelection(g.hand,[],c.id),ids);assert.deepEqual(sameRankSelection(g.hand,ids,c.id),[]);
 assert.deepEqual(layoutHand(g,'shape').map(c=>c.id).sort(),g.hand.map(c=>c.id).sort());
});
test('mahjong groups suits in numeric order and keeps the newly drawn tile at the right',()=>{
 const g={kind:'nanjing',hand:[{id:'c',value:19},{id:'a',value:1},{id:'d',value:0},{id:'b',value:10}],drawn:'d'};
 assert.deepEqual(layoutHand(g,'rank').map(c=>c.id),['a','b','c','d']);
});
test('hint cycles only legal responses and resets when the turn context changes',()=>{
 const g=createPoker('ddz3',profiles.slice(0,3),{rounds:4},rng(9),0);actPoker(g,g.turn,{type:'bid',value:3},rng(9),1);
 const v=publicPoker(g,g.turn),cycle=new HintCycle(),a=cycle.next(v),b=cycle.next(v);assert(a.total>1);assert.notDeepEqual(a.cards,b.cards);
 for(let i=0;i<a.total;i++){const h=cycle.next(v);assert(analyzePlay(v.hand.filter(c=>h.cards.includes(c.id)),v.kind,v.level,v.last?.info));}
 assert.equal(cycle.next({...v,revision:v.revision+1}).index,1);
});
test('selection explains illegal shape, insufficient strength and waiting without allowing play',()=>{
 const deck=makePoker(),hand=[deck.find(c=>c.value===3),deck.find(c=>c.value===4)],g={hand,kind:'ddz3',phase:'playing',choices:{play:true},last:null};
 assert.match(selectionInfo(g,hand.map(c=>c.id)).text,/不是合法/);
 const info=analyzePlay([deck.find(c=>c.value===14)],'ddz3');assert.match(selectionInfo({...g,last:{info}},[hand[0].id]).text,/压不过/);
 assert.equal(selectionInfo({...g,choices:{}},[hand[0].id]).valid,false);assert.match(selectionInfo({...g,choices:{}},[hand[0].id]).text,/等待/);
});
test('rank recorder subtracts public played and own cards once, never duplicates bottom cards',()=>{
 const g=createPoker('ddz4',profiles,{rounds:4},rng(4),0);actPoker(g,g.turn,{type:'bid',value:3},rng(4),1);let v=publicPoker(g,g.landlord);
 assert.equal(remainingRanks(v).reduce((n,x)=>n+x.count,0),75);
 const card=v.hand.at(-1);actPoker(g,g.turn,{type:'play',cards:[card.id]},rng(4),2);v=publicPoker(g,g.landlord);
 assert.equal(remainingRanks(v).reduce((n,x)=>n+x.count,0),75);
 assert.deepEqual(remainingRanks({...v,played:[...v.played,...v.played]}),remainingRanks(v));
});
test('per-seat public plays survive passes and clear at the next trick; hands stay private until settlement',()=>{
 const g=createPoker('ddz3',profiles.slice(0,3),{rounds:4},rng(7),0),random=rng(7);actPoker(g,g.turn,{type:'bid',value:3},random,1);const seat=g.turn,card=g.players[seat].hand[0];actPoker(g,seat,{type:'play',cards:[card.id]},random,2);
 for(let i=0;i<2;i++)actPoker(g,g.turn,{type:'pass'},random,3+i);
 assert.equal(g.tablePlays[seat].cards[0].id,card.id);assert.equal(g.tablePlays.filter(x=>x?.type==='pass').length,2);assert.equal(g.last,null);
 let v=publicPoker(g,seat);assert(v.players.every(p=>!p.hand&&!p.remaining));assert.equal(v.actionLog.filter(x=>x.type==='pass').length,2);
 actPoker(g,g.turn,choosePoker(v),random,5);assert.equal(g.tablePlays.filter(Boolean).length,1);
 for(let i=0;i<1000&&!g.settlement;i++)actPoker(g,g.turn,choosePoker(publicPoker(g,g.turn)),random,i+6);
 assert(g.settlement);v=publicPoker(g,seat);assert(v.players.every(p=>Array.isArray(p.remaining)));assert.equal(v.players.reduce((n,p)=>n+p.remaining.length,0)+v.played.length,54);
});
test('every connected human must continue, guest can prepare and next match removes prior history',()=>{
 let id=0;const rooms=new Rooms({uuid:()=>String(++id).padStart(12,'0'),randomInt:rng(22),now:()=>0}),messages=[];
 for(const p of ['a','b'])rooms.open(p,m=>messages.push(m));const send=(p,m)=>rooms.handle(p,{v:1,...m});
 send('a',{type:'create',kind:'ddz3',clientId:'human-player-a'});const r=[...rooms.rooms.values()][0];send('b',{type:'join',code:r.code,clientId:'human-player-b'});
 for(const p of ['a','b'])send(p,{type:'ready',value:true});send('a',{type:'start'});
 for(let i=0;i<1000&&!r.game.settlement;i++)rooms.apply(r,r.game.turn,choosePoker(publicPoker(r.game,r.game.turn)));
 assert(r.game.settlement);assert.equal(r.slots[0].ready,false);assert.equal(r.slots[1].ready,false);const round=r.game.round;
 send('a',{type:'next'});assert.equal(r.game.round,round);assert.equal(r.slots[0].ready,true);send('b',{type:'continue'});assert.equal(r.game.round,round+1);assert.equal(r.game.actionLog.length,0);
 assert(!messages.some(m=>m.type==='error'));
});
