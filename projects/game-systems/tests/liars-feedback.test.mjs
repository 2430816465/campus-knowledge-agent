import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,play,challenge,step,publicMatch,TIMING,uniqueCharacters} from '../games/liars/rules.js';
import {Rooms} from '../games/liars/rooms.js';
import {Feedback,actionState} from '../games/liars/feedback.js';
import {rng} from '../tools/liars-match-balance.mjs';
const players=['勇者旅人','魔王旅人','地精旅人','盗贼旅人'].map((name,i)=>({name,character:['hero','demon','goblin','rogue'][i]}));
test('every table has unique roles; preserve distinct preferences without consuming game randomness',()=>{
 assert.deepEqual(uniqueCharacters(players),players);
 const choices=['hero','hero','goblin','rogue'].map((character,i)=>({name:'玩家'+i,character}));assert.deepEqual(uniqueCharacters(choices).map(p=>p.character),['hero','demon','goblin','rogue']);assert.deepEqual(choices.map(p=>p.character),['hero','hero','goblin','rogue']);
 for(let count=2;count<=4;count++){let calls=0;const source=Array.from({length:count},()=>({name:'同桌',character:'hero'}));const random=rng();const g=createMatch(source,n=>{calls++;return random(n);},0);assert.equal(new Set(g.players.map(p=>p.character)).size,count);assert.equal(calls,count+(count-1)+1+19);}
 const r=rng(),service=new Rooms({randomInt:r,now:()=>0}),room={slots:players.map(p=>({...p,character:'hero'}))};service.start(room);assert.equal(new Set(room.slots.map(p=>p.character)).size,4);assert.deepEqual(room.slots.map(p=>p.character),room.game.players.map(p=>p.character));service.start(room);assert.equal(new Set(room.game.players.map(p=>p.character)).size,4);
});

test('all legal 1–3-card kinds at all three tables: only non-target ordinary cards count as lies',()=>{
 let cases=0;
 for(const target of ['demon','hero','princess'])for(let length=1;length<=3;length++)for(let encoded=0;encoded<4**length;encoded++){
  let n=encoded;const kinds=Array.from({length},()=>{const kind=['demon','hero','princess','thief'][n%4];n=Math.floor(n/4);return kind;});if(kinds.filter(k=>k==='thief').length>2)continue;
  const g=createMatch(players,rng(cases+1),0),seat=g.turn;g.target=target;g.players[seat].hand=kinds.map((kind,i)=>({id:'choice-'+i,kind})).concat({id:'keep',kind:target});
  const ids=g.players[seat].hand.slice(0,length).map(c=>c.id);play(g,seat,ids,rng(),100);const caller=g.turn;
  challenge(g,caller,200);const expectedLie=kinds.some(k=>k!==target&&k!=='thief');assert.equal(g.event.lied,expectedLie);assert.equal(g.event.loser,expectedLie?seat:caller);assert.equal(g.event.accused,seat);assert.equal(g.event.target,target);assert.deepEqual(g.event.cards,kinds);cases++;
 }
 assert.equal(cases,249);
});
test('challenge resolves the immutable previous play and its table, not an earlier human play',()=>{
 const r=rng(),g=createMatch(players,r,0);g.order=[0,1,2,3];g.turn=0;g.target='hero';g.players[0].hand=[{id:'true',kind:'hero'},{id:'keep0',kind:'thief'}];g.players[1].hand=[{id:'bluff',kind:'demon'},{id:'keep1',kind:'thief'}];
 play(g,0,['true'],r,100);play(g,1,['bluff'],r,200);challenge(g,2,300);assert.equal(g.event.accused,1);assert.equal(g.event.loser,1);assert.notEqual(g.event.accused,0);
 const fresh=createMatch(players,r,0);fresh.target='hero';const accused=fresh.turn;fresh.players[accused].hand=[{id:'true',kind:'hero'},{id:'keep',kind:'demon'}];play(fresh,accused,['true'],r,100);fresh.target='princess';challenge(fresh,fresh.turn,200);assert.equal(fresh.event.target,'hero');assert.equal(fresh.event.lied,false);assert.notEqual(fresh.event.loser,accused);
});
test('truthful final hand still punishes the forced challenger; wildcard is truthful',()=>{
 const r=rng(),g=createMatch(players.slice(0,2),r,0),seat=g.turn;g.players[seat].hand=[{id:'last',kind:'thief'}];play(g,seat,['last'],r,100);assert.equal(g.event.auto,true);assert.equal(g.event.lied,false);assert.equal(g.event.loser,g.event.caller);assert.notEqual(g.event.loser,seat);
});
test('timeout provenance survives the reveal and unrevealed public last never exposes card kinds',()=>{
 const r=rng(),g=createMatch(players,r,0),seat=g.turn;step(g,r,30000);const view=publicMatch(g,g.turn);assert.equal(view.last.source,'timeout');assert.equal(view.last.target,g.target);assert.ok(!('cards' in view.last));challenge(g,g.turn,31000);assert.equal(g.event.source,'timeout');assert.equal(g.event.accused,seat);assert.equal(g.deadline,31000+TIMING.reveal);
});
test('real room bot waits, then challenges human truth and receives the penalty itself',()=>{
 let now=0;const service=new Rooms({randomInt:rng(19),now:()=>now}),sent=[];service.open('human',m=>sent.push(m));service.handle('human',{v:1,type:'match',clientId:'human-client',playerId:'human-player',name:'真牌玩家'});now=8000;service.tick();const room=[...service.rooms.values()][0],g=room.game;
 g.order=[0,1,2,3];g.turn=0;g.players[0].hand=[{id:'truth',kind:g.target},{id:'wild',kind:'thief'},{id:'keep',kind:g.target}];play(g,0,['truth','wild'],rng(),now);room.strength=.98;service.randomInt=()=>0;
 service.tick();const before=g.revision;assert.equal(room.botAction.at,11000);now=10999;service.tick();assert.equal(g.revision,before);now=11000;service.tick();assert.equal(g.phase,'reveal');assert.equal(g.event.caller,1);assert.equal(g.event.accused,0);assert.equal(g.event.lied,false);assert.equal(g.event.loser,1);
});
test('feedback timeline names the right actor and waits for sipping before displaying effects',()=>{
 const game={phase:'reveal',phaseAt:100,event:{caller:2,accused:0,loser:2}};assert.deepEqual(actionState(game,100),{age:0,actor:2,subject:0,beat:'challenge'});assert.equal(actionState(game,1500).beat,'flip');assert.equal(actionState(game,3000).beat,'verdict');game.phase='outcome';game.event={loser:2,effect:'stone',eliminated:true};assert.equal(actionState(game,1899).beat,'drinking');assert.equal(actionState(game,1900).beat,'stone');assert.equal(actionState(game,1900).actor,2);
});
test('duplicate snapshots do not repeat cues; late reconnect avoids old impacts; shake decays',()=>{
 globalThis.document={hidden:false};const calls=[],vibrations=[],f=new Feedback({vibrate:p=>vibrations.push(p)});const original=f.cue.bind(f);f.cue=(name,now)=>{calls.push(name);original(name,now);};
 const s={phase:'match',game:{id:'one',revision:4,phase:'reveal',phaseAt:0,event:{lied:false}}};f.update(s,0);f.update(s,0);f.update(s,1400);f.update(s,2900);f.update(s,2900);assert.deepEqual(calls,['challenge','flip','truth']);assert.equal(vibrations.length,2);assert.notDeepEqual(f.update(s,2930),{x:0,y:0});assert.deepEqual(f.update(s,3450),{x:0,y:0});
 const late=new Feedback({vibrate:()=>assert.fail('old event must not vibrate')});late.update(s,4000);assert.equal(late.lastCue,null);
});
test('reduced motion and vibration preference suppress haptics; pause and hidden page suppress new impacts',()=>{
 globalThis.document={hidden:false};for(const prefs of [{reduced:()=>true},{haptics:()=>false}]){const f=new Feedback({...prefs,vibrate:()=>assert.fail('vibration disabled')});f.cue('stone',0);if(prefs.reduced)assert.deepEqual(f.update({phase:'match',game:{phase:'playing',phaseAt:0}},10),{x:0,y:0});}
 const f=new Feedback({vibrate:()=>assert.fail('paused/hidden')});const s={phase:'paused',game:{id:'two',phase:'outcome',revision:1,phaseAt:0,event:{effect:'stone'}}};f.update(s,1800);assert.equal(f.lastCue,null);s.phase='match';document.hidden=true;f.update(s,1800);assert.equal(f.lastCue,null);
});
test('play and local turn cues fire once; only the active player gets the last five seconds',()=>{
 globalThis.document={hidden:false};const cues=[],vibrations=[],f=new Feedback({vibrate:p=>vibrations.push(p)}),cue=f.cue.bind(f);
 f.cue=(name,now)=>{cues.push(name);cue(name,now);};
 const s={phase:'match',seat:1,game:{id:'turn',revision:2,phase:'playing',phaseAt:0,deadline:30000,turn:1,last:{seat:0,count:2}}};
 assert.deepEqual(actionState(s.game,300),{age:300,actor:0,subject:1,beat:'play'});
 assert.equal(actionState(s.game,1400).actor,1);assert.equal(actionState(s.game,1400).beat,'turn');
 f.update(s,0);f.update(s,0);f.update(s,900);f.update(s,950);assert.deepEqual(cues,['play','turn']);assert.equal(vibrations.length,2);
 for(const t of [25000,25010,26000,27000,28000,29000,30000])f.update(s,t);
 assert.deepEqual(cues,['play','turn','warning','tick','tick','tick','tick']);assert.equal(vibrations.length,3);
 const spectator=new Feedback({vibrate:()=>{}});spectator.update({...s,seat:2},25000);assert.equal(spectator.lastCue,null);
 s.phase='paused';f.update(s,29500);assert.equal(cues.length,7);
});
