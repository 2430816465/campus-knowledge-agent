import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,play,challenge,publicMatch,beginRound} from '../games/liars/rules.js';
import {tableSeats,roundIntro} from '../games/liars/presentation.js';
const random=n=>0;
test('per-seat piles survive intervening plays, only latest batch reveals and public piles never leak hidden kinds',()=>{
 const g=createMatch([0,1,2,3].map(i=>({name:'同桌'+i,character:'hero'})),random,100,'ownership');g.order=[0,1,2,3];g.turn=0;g.target='hero';
 for(let i=0;i<4;i++)g.players[i].hand=[{id:i+'a',kind:'hero'},{id:i+'b',kind:'demon'},{id:i+'c',kind:'thief'}];
 for(let i=0;i<4;i++)play(g,i,[i+'a'],random,200+i*10);
 play(g,0,['0b'],random,300);let view=publicMatch(g,1);
 assert.equal(view.plays.length,5);assert.ok(view.plays.every(p=>!('cards'in p)&&!('kind'in p)));assert.equal(tableSeats(view,1).find(p=>p.seat===0).cards.length,2);assert.ok(tableSeats(view,1).every(p=>p.cards.every(c=>c.kind===null)));
 challenge(g,1,400);view=publicMatch(g,1);const seats=tableSeats(view,1),owner=seats.find(p=>p.seat===0);
 assert.equal(owner.role,'被开牌者');assert.equal(seats.find(p=>p.seat===1).role,'质疑者');assert.equal(owner.cards[0].kind,null);assert.equal(owner.cards[1].kind,'demon');assert.equal(owner.cards[1].truth,false);assert.equal(seats.flatMap(p=>p.cards).filter(c=>c.kind).length,1);assert.equal(g.event.loser,0);
 beginRound(g,0,random,1000);assert.equal(g.plays.length,0);assert.ok(tableSeats(publicMatch(g,0),0).every(p=>p.cards.length===0));assert.equal(g.roundAt,1000);
});
test('round announcement uses fixed round start rather than play snapshot time and never blocks simulation',()=>{
 const g=createMatch([{name:'A'},{name:'B'}],random,100);assert.equal(roundIntro(g,100),true);assert.equal(roundIntro(g,2499),true);assert.equal(roundIntro(g,2500),false);assert.equal(g.deadline,30100);
 play(g,g.turn,[g.players[g.turn].hand[0].id],random,300);assert.equal(g.roundAt,100);assert.equal(roundIntro(g,300),false);
});
