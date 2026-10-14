import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createBattle,spawn,members} from '../games/rush/battle.js';
import {fresh} from '../games/rush/profile.js';
import {KEY} from '../games/rush/data.js';
const base=process.env.BASE_URL||'http://127.0.0.1:4173',out='artifacts/rush/mechanics/sword-review';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],checks=[];
try{
 for(const [width,height,dpr] of [[320,568,1],[390,844,1],[390,844,3],[844,390,1],[1440,900,1]]){
  const c=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  const profile=fresh(),b=createBattle(18,{power:5,speed:3,recruits:2},'art-review');b.count=b.peak=48;b.weapon=2;b.cursor=999;b.x=b.targetX=240;
  spawn(b,{kind:'gates',x:240,left:{op:'+',value:5},right:{op:'×',value:2}});b.entities[0].y=260;
  spawn(b,{kind:'boss',x:240,hp:5000,damage:4,type:'dragon'});b.entities[1].y=90;profile.active=b;
  await p.addInitScript(({key,profile})=>localStorage.setItem(key,JSON.stringify(profile)),{key:KEY,profile});await p.goto(base+'/games/rush/index.html');await p.waitForFunction(()=>document.getElementById('loading').hidden);await p.locator('[data-action="resume"]').click();await p.evaluate(()=>advanceTime(900));
  const read=()=>p.evaluate(()=>JSON.parse(render_game_to_text())),state=await read();assert.equal(state.assetsLoaded,9);assert.equal(state.battle.count,48);assert.equal(await p.evaluate(()=>getComputedStyle(document.querySelector('canvas')).imageRendering),'pixelated');
  await p.screenshot({path:`${out}/full-squad-${width}x${height}-dpr${dpr}.png`});
  const saved=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)).active,KEY);const team=members(saved||b);assert.ok(team.every(m=>m.y+17<790));
  const box=await p.locator('canvas').boundingBox();await p.screenshot({path:`${out}/squad-detail-${width}-dpr${dpr}.png`,clip:{x:box.x,y:box.y+box.height*.71,width:box.width,height:box.height*.28}});
  await p.locator('[data-action="pause"]').click();const before=await read();await p.evaluate(()=>advanceTime(2000));assert.equal((await read()).battle.time,before.battle.time);
  checks.push({width,height,dpr,visibleBodyHeight:32*box.height/800,columnPitch:26*box.width/480,rowPitch:34*box.height/800,bullets:state.battle.bullets});await c.close();
 }
 // Old arrow snapshots keep their progress and continue as flying swords after the artwork change.
 const c=await browser.newContext(),p=await c.newPage(),profile=fresh(),b=createBattle(1);delete b.lastCast;b.cursor=999;b.bullets=[{x:240,y:420,oldY:420,damage:1,pierce:0,hits:[]}];profile.active=b;
 await p.addInitScript(({key,profile})=>localStorage.setItem(key,JSON.stringify(profile)),{key:KEY,profile});await p.goto(base+'/games/rush/index.html');await p.waitForFunction(()=>document.getElementById('loading').hidden);await p.locator('[data-action="resume"]').click();await p.evaluate(()=>advanceTime(300));assert.equal(await p.evaluate(()=>JSON.parse(render_game_to_text()).screen),'playing');assert.equal(await p.locator('#error').isVisible(),false);await c.close();
 const campContext=await browser.newContext({viewport:{width:390,height:844}}),camp=await campContext.newPage();camp.on('pageerror',e=>errors.push(e.message));camp.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 const click=(s,a)=>s.locator(`[data-action="${a}"]`).click();
 await camp.goto(base+'/');await click(camp,'mode:rush');await camp.screenshot({path:`${out}/camp-card.png`});await click(camp,'preview');await camp.waitForSelector('iframe[src*="rush"]');let game=camp.frames().find(f=>f.url().includes('/games/rush/'));await game.waitForFunction(()=>document.getElementById('loading').hidden);await click(game,'start');await game.evaluate(()=>advanceTime(1000));
 await click(camp,'menu');await game.waitForFunction(()=>JSON.parse(render_game_to_text()).hostPaused);const paused=await game.evaluate(()=>JSON.parse(render_game_to_text()));await game.evaluate(()=>advanceTime(2000));assert.equal(await game.evaluate(()=>JSON.parse(render_game_to_text()).battle.time),paused.battle.time);
 await click(camp,'menu-options');await click(camp,'game-option:pause');await game.waitForFunction(()=>JSON.parse(render_game_to_text()).screen==='paused'&&!JSON.parse(render_game_to_text()).hostPaused);await click(game,'resume');await game.evaluate(()=>advanceTime(1000));await click(camp,'menu');await game.waitForFunction(()=>JSON.parse(render_game_to_text()).hostPaused);const savedTime=await game.evaluate(()=>JSON.parse(render_game_to_text()).battle.time);await click(camp,'exit-game');await click(camp,'exit-confirm');await click(camp,'mode:rush');await click(camp,'preview');await camp.waitForSelector('iframe[src*="rush"]');game=camp.frames().find(f=>f.url().includes('/games/rush/'));await game.waitForFunction(()=>document.getElementById('loading').hidden);assert.equal(await game.evaluate(()=>JSON.parse(render_game_to_text()).screen),'paused');assert.equal(await game.evaluate(()=>JSON.parse(render_game_to_text()).battle.time),savedTime);await campContext.close();
 assert.deepEqual(errors,[]);await fs.writeFile(`${out}/report.json`,JSON.stringify({checks,errors,oldSnapshotResumed:true,campMenuAndExitResumed:true},null,2));console.log('PASS: 48-member sword formation at five viewport/DPR settings, crisp rendering, pause, legacy snapshots and camp menu/exit/re-entry');
}finally{await browser.close();}
