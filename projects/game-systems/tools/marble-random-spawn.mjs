import assert from 'node:assert/strict';
import {MarbleGame} from '../games/marble/state.js';

const data=new Map();
globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
let waves=0;
for(const challenge of [false,true])for(let seed=1;seed<=32;seed++){
 const game=new MarbleGame();game.meta.challengeUnlocked=true;game.newRun(seed,challenge);
 for(let room=0;room<15;room++){
  game.enterRoom(room);
  const template=game.template();
  for(let wave=0;wave<template.waves.length;wave++){
   if(wave)game.loadWave(wave);
   const enemies=game.run.room.enemies;
   assert.ok(enemies.every(e=>e.x>=30&&e.x<=330&&e.y>=72&&e.y<=320),'monster outside safe field');
   for(let i=0;i<enemies.length;i++)for(let j=i+1;j<enemies.length;j++)
    assert.ok(Math.hypot(enemies[i].x-enemies[j].x,enemies[i].y-enemies[j].y)>=enemies[i].r+enemies[j].r+5,`overlap seed ${seed} room ${room} wave ${wave}`);
   const minions=enemies.filter(e=>e.type==='minion');
   if(minions.length>=8)assert.ok(new Set(minions.map(e=>e.y)).size>=minions.length*.75,'monsters aligned into rows');
   waves++;
  }
 }
 game.enterRoom(14);game.run.room.enemies.find(e=>e.type==='boss').hp=50;
 game.shoot(0);game.earlyRecall();
 const summoned=game.run.room.enemies;
 assert.equal(summoned.filter(e=>e.id>=200).length,6,'boss should summon six randomly positioned minions');
 for(let i=0;i<summoned.length;i++)for(let j=i+1;j<summoned.length;j++)
  assert.ok(Math.hypot(summoned[i].x-summoned[j].x,summoned[i].y-summoned[j].y)>=summoned[i].r+summoned[j].r+5,'boss summon overlap');
}
const first=new MarbleGame();first.newRun(888);
const positions=first.run.room.enemies.map(e=>[e.x,e.y]);
const repeat=new MarbleGame();repeat.newRun(888);
assert.deepEqual(repeat.run.room.enemies.map(e=>[e.x,e.y]),positions,'same seed should restore the same layout');
repeat.newRun(889);
assert.notDeepEqual(repeat.run.room.enemies.map(e=>[e.x,e.y]),positions,'new seed should change the layout');
repeat.enterRoom(14);repeat.run.room.enemies.find(e=>e.type==='boss').hp=50;
repeat.shoot(0);repeat.earlyRecall();
assert.equal(repeat.run.room.enemies.filter(e=>e.id>=200).length,6,'boss reinforcements should also scatter');
console.log(`Random spawn checked across ${waves} normal/challenge waves, plus seed stability and boss summons.`);
