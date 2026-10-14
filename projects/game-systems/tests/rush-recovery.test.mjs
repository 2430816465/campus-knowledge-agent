import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBattle,bossSeal,bossDamageScale,spawn,step} from '../games/rush/battle.js';
import {STAGES,BOSS_HP} from '../games/rush/data.js';
import {fresh,persist,load,settle} from '../games/rush/profile.js';
test('new runs can defeat every boss despite all gate mistakes, with resistance capped at 24%',()=>{
 for(const stage of STAGES.slice(2)){
  const b=createBattle(stage.id,{power:8,speed:6,recruits:5});b.cursor=999;b.passed=stage.gates.length;b.mistakes=stage.gates.length;b.count=b.peak=48;b.weapon=3;b.modifiers={haste:3,range:3,damage:3};
  assert.equal(bossSeal(b),'open');assert.ok(bossDamageScale(b)>=.76);
  spawn(b,{kind:'boss',x:240,hp:BOSS_HP[stage.id-1],damage:2,type:'dragon'});b.entities.at(-1).y=360;
  for(let n=0;n<720&&b.status==='playing';n++)step(b,1/60);
  assert.equal(b.status,'won','stage '+stage.id);
  const p=fresh();p.active=b;const result=settle(p);assert.equal(result.mistakeLimit,null);assert.equal(result.ruleVersion,5);
 }
});
test('version 4 remains locked on excess mistakes; version 5 save round-trips without migration',()=>{
 const b=createBattle(18);b.passed=STAGES[17].gates.length;b.mistakes=1;assert.equal(bossSeal(b),'open');b.layoutVersion=4;assert.equal(bossSeal(b),'broken');
 b.layoutVersion=5;const p=fresh();p.active=b;const storage={raw:null,getItem(){return this.raw},setItem(k,v){this.raw=v}};persist(storage,p);assert.deepEqual(load(storage).profile.active,b);
});
test('version 5 evaluates recruit gates against actual current squad, without penalizing incomparable upgrades',()=>{
 for(const [left,right,count,expected] of [
  [{op:'+',value:8},{op:'×',value:2},3,0],
  [{op:'+',value:8},{op:'×',value:2},20,1],
  [{effect:'haste',value:1},{op:'+',value:8},3,0],
  [{op:'+',value:8},{effect:'range',value:1},3,0]]){
  const b=createBattle(4);b.cursor=999;b.fire=100;b.count=count;b.x=b.targetX=132;
  spawn(b,{kind:'gates',x:240,left,right,correctSide:'right',gateIndex:0});b.entities.at(-1).y=640;step(b,1/60);
  assert.equal(b.mistakes,expected);assert.equal(b.passed,1);
 }
});
