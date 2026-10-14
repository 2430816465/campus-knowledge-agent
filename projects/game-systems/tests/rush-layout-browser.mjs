import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {STAGES,KEY} from '../games/rush/data.js';
import {createBattle,step,spawn} from '../games/rush/battle.js';
import {fresh} from '../games/rush/profile.js';
import {route} from './rush-policy.mjs';
const out='artifacts/rush/mechanics/layouts',base=process.env.BASE_URL||'http://127.0.0.1:4173';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],shots=[];
const read=p=>p.evaluate(()=>JSON.parse(render_game_to_text()));
async function pageFor(profile,width=390,height=844){const p=await browser.newPage({viewport:{width,height}});p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});await p.addInitScript(({profile,key})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(profile));},{profile,key:KEY});await p.goto(base+'/games/rush/index.html');await p.waitForFunction(()=>document.getElementById('loading').hidden);return p;}
try{
 for(const stage of STAGES){
  const f=fresh();f.cleared=STAGES.map(s=>s.id);f.selected=stage.id;f.upgrades={power:7,speed:4,recruits:2};
  const b=createBattle(stage.id,f.upgrades,'visual-'+stage.id),until=stage.gates[1][0]+3.5;
  for(let i=0;i<Math.round(until*60);i++){b.targetX=route(b);step(b,1/60);}assert.equal(b.status,'playing');f.active=b;
  const p=await pageFor(f);await p.locator('[data-action="resume"]').click();const state=await read(p);assert.equal(state.battle.layoutVersion,4);assert.equal(state.battle.title,stage.name);assert.equal(state.assetsLoaded,9);assert.ok(state.battle.entities.some(e=>e.kind==='gates'&&!e.hit));await p.screenshot({path:`${out}/stage-${String(stage.id).padStart(2,'0')}.png`});shots.push({stage:stage.id,title:stage.name,time:state.battle.time,gates:state.battle.entities.filter(e=>e.kind==='gates')});await p.close();
 }
 // 真实触控跨门、一次结算、暂停/重载；fixture仅布置算术场景，不赋予胜利。
 for(const [side,count,expected,width]of [[132,9,4,320],[348,9,6,390],[132,1,0,390]]){
  const f=fresh(),b=createBattle(3,{},'math-'+side+'-'+count);b.count=count;b.cursor=999;b.x=b.targetX=240;spawn(b,{kind:'gates',x:240,left:{op:'÷',value:2},right:{op:'−',value:3}});b.entities[0].y=400;f.active=b;f.selected=3;
  const p=await pageFor(f,width,width===320?568:844);await p.locator('[data-action="resume"]').click();const box=await p.locator('canvas').boundingBox();await p.mouse.move(box.x+side/480*box.width,box.y+box.height*.85);await p.mouse.down();await p.mouse.up();await p.screenshot({path:`${out}/arithmetic-${width}-${side}-${count}.png`});await p.evaluate(()=>advanceTime(2600));const s=await read(p);
  if(expected===0){assert.equal(s.screen,'result');assert.equal(s.result.win,false);}
  else{assert.equal(s.battle.count,expected);assert.equal(s.battle.passed,1);await p.locator('[data-action="pause"]').click();const paused=await read(p);await p.reload();await p.waitForFunction(()=>document.getElementById('loading').hidden);assert.equal((await read(p)).battle.count,expected);assert.equal((await read(p)).battle.time,paused.battle.time);await p.locator('[data-action="resume"]').click();await p.evaluate(()=>advanceTime(1000));assert.equal((await read(p)).battle.count,expected);assert.equal((await read(p)).battle.passed,1);}
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.close();
 }
 const old=fresh(),legacy=createBattle(3);delete legacy.layoutVersion;for(let i=0;i<492;i++){legacy.targetX=route(legacy);step(legacy,1/60);}old.active=legacy;const resumed=await pageFor(old);assert.ok((await resumed.locator('#overlay').innerText()).includes('更新前的旧路线'));assert.equal((await read(resumed)).battle.layoutVersion,1);await resumed.locator('[data-action="resume"]').click();assert.ok((await resumed.locator('#stage-label').innerText()).includes('旧路线'));await resumed.evaluate(()=>advanceTime(1000));assert.ok((await read(resumed)).battle.entities.some(e=>e.kind==='gates'&&e.left.op==='+'&&e.left.shoot));await resumed.locator('[data-action="pause"]').click();const saved=await read(resumed);await resumed.reload();await resumed.waitForFunction(()=>document.getElementById('loading').hidden);assert.equal((await read(resumed)).battle.layoutVersion,1);assert.equal((await read(resumed)).battle.time,saved.battle.time);await resumed.close();
 const f=fresh();f.cleared=STAGES.map(s=>s.id);const home=await pageFor(f,320,568);await home.locator('[data-action="stages"]').click();await home.locator('[data-action="chapter:2"]').click();await home.locator('[data-action="stage:18"]').click();assert.ok((await home.locator('.stage-note').innerText()).includes('六道光幕'));await home.screenshot({path:`${out}/stage-select-320.png`});await home.close();
 assert.deepEqual(errors,[]);await fs.writeFile(`${out}/browser.json`,JSON.stringify({shots,legacySnapshotResumed:true,arithmetic:'÷向下取整、−真实扣人数、零人失败、暂停/重载不重复结算、320px/390px无溢出',errors},null,2));console.log('PASS: 18 real-layout screenshots, arithmetic contact/reload/loss, legacy routes, chapter selection and zero browser errors');
}finally{await browser.close();}
