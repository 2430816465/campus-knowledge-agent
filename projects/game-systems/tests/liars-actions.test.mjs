import test from 'node:test';
import assert from 'node:assert/strict';
import {roleSnapshot} from '../games/liars/presentation.js';
import {actorPose,seatActionLabel} from '../games/liars/animations.js';
const characters=['hero','demon','goblin','rogue'],names=['流浪勇者','余烬魔王','地精商人','暮影盗贼'];
test('role-only projection covers lobby, chat, pause and final game while preserving authority data',()=>{
 const players=characters.map((character,i)=>({character,name:'真实姓名'+i,count:5,remaining:6,alive:true}));
 const raw={phase:'paused',players,reason:'真实姓名1连接中断',chat:[{seat:1,name:'真实姓名1',text:'轮到你了'}],game:{id:'match',players,history:['真实姓名0获胜'],hand:[{id:'a',kind:'hero'}],event:{caller:1,accused:0,loser:1},winner:0}};
 const source=structuredClone(raw),view=roleSnapshot(raw);assert.deepEqual(view.players.map(p=>p.name),names);assert.deepEqual(view.game.players.map(p=>p.name),names);assert.equal(view.chat[0].name,names[1]);assert.ok(!JSON.stringify(view).includes('真实姓名'));assert.deepEqual(view.game.hand,source.game.hand);assert.deepEqual(view.game.event,source.game.event);assert.equal(view.game.winner,source.game.winner);assert.deepEqual(raw,source);
 assert.equal(roleSnapshot({players:[players[0],null,players[2]],chat:[{seat:2,name:'真实姓名2'}]}).chat[0].name,names[2]);
});
test('each role plays all six frames only at the caller or loser; reconnect resumes instead of restarting',()=>{
 for(let seat=0;seat<4;seat++){
  const g={players:characters.map(character=>({character})),phaseAt:100,phase:'reveal',event:{caller:seat,accused:(seat+3)%4,loser:seat,lied:false}};
  assert.deepEqual([0,170,360,600,950,1200].map(t=>actorPose(g,seat,t+100).frame),[0,1,2,3,4,5]);assert.match(actorPose(g,seat,1050).path,new RegExp(characters[seat]+'/challenge/4.png'));assert.equal(actorPose(g,(seat+1)%4,800),null);assert.match(seatActionLabel(g,seat,3200),/输了/);
  g.phase='outcome';assert.deepEqual([0,220,460,740,1250,1550].map(t=>actorPose(g,seat,t+100).frame),[0,1,2,3,4,5]);assert.equal(actorPose(g,(seat+1)%4,1100),null);assert.equal(actorPose(g,seat,900,true).frame,2);
 }
});
