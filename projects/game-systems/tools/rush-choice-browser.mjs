import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=new URL('../artifacts/rush-choice-1.23.0/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch(),errors=[],requests=[],checks=[];
const base=process.env.UI_URL||'http://127.0.0.1:4230/';
const state=p=>p.evaluate(()=>JSON.parse(render_game_to_text()));
async function tap(p,action){const el=p.locator(`[data-action="${action}"]`);await el.scrollIntoViewIfNeeded();await el.tap();}
async function ready(p){await p.waitForFunction(()=>typeof render_game_to_text==='function'&&JSON.parse(render_game_to_text()).assetsLoaded===15);}
try{
 for(const viewport of [{width:320,height:568},{width:360,height:640},{width:390,height:844},{width:568,height:320},{width:640,height:360},{width:844,height:390}]){
  const p=await browser.newPage({viewport,isMobile:true,hasTouch:true});p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)requests.push(r.url());});
  await p.goto(base+'games/rush/');await ready(p);await p.screenshot({path:decodeURIComponent(new URL(`home-${viewport.width}.png`,out).pathname.slice(1))});
  for(const action of ['start','switch-mode','training','help']){const info=await p.locator(`[data-action="${action}"]`).evaluate(e=>{const r=e.getBoundingClientRect();return{h:r.height,visible:r.bottom<=innerHeight&&r.top>=0};});assert.ok(info.h>=44&&info.visible,JSON.stringify({viewport,action,info}));}
  await tap(p,'start');await p.evaluate(()=>advanceTime(900));assert.equal((await state(p)).battle.layoutVersion,6);
  await tap(p,'pause');const before=(await state(p)).battle.time;await p.evaluate(()=>advanceTime(1000));assert.equal((await state(p)).battle.time,before);
  await tap(p,'save-home');await tap(p,'switch-mode');await ready(p);assert.equal((await state(p)).battle,null);await tap(p,'start');
  const rect=await p.locator('canvas').boundingBox();await p.touchscreen.tap(rect.x+rect.width*.8,rect.y+rect.height*.65);assert.equal((await state(p)).battle.aimLane,2);
  for(let i=0;i<20&&(await state(p)).screen==='playing';i++)await p.evaluate(()=>advanceTime(2000));
  let s=await state(p);assert.equal(s.screen,'choice');assert.equal(s.battle.offers.length,4);const savedTime=s.battle.time;
  await p.evaluate(()=>advanceTime(5000));assert.equal((await state(p)).battle.time,savedTime);
  await p.screenshot({path:decodeURIComponent(new URL(`choice-${viewport.width}.png`,out).pathname.slice(1))});
  for(const el of await p.locator('[data-action^="pick:"]').all()){const r=await el.boundingBox();assert.ok(r.height>=44&&r.y+r.height<=viewport.height&&r.x+r.width<=viewport.width);}
  await p.reload();await ready(p);await tap(p,'resume');assert.equal((await state(p)).screen,'choice');await tap(p,'pick:'+(await state(p)).battle.offers[0]);assert.equal((await state(p)).battle.wave,2);
  await tap(p,'pause');await tap(p,'save-home');await tap(p,'switch-mode');await ready(p);assert.equal((await state(p)).battle.mode,'campaign');assert.equal((await state(p)).battle.time,before);
  checks.push({viewport,choiceSave:true,modeIsolation:true,touchAim:true});await p.close();
 }
 // Inspect a late campaign with a full ascending squad, three gates and named numeric bosses.
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'games/rush/');await ready(p);
 const fixture=await p.evaluate(async()=>{const {fresh}=await import('./profile.js');const {createChoiceBattle,applyGrowth,choicePlan}=await import('./choice.js');const q=fresh();q.cleared=Array.from({length:17},(_,i)=>i+1);q.selected=18;q.active=createChoiceBattle(18,{},'visual');q.active.count=30;q.active.peak=30;for(let i=0;i<4;i++)applyGrowth(q.active,'realm');for(let i=0;i<3;i++){applyGrowth(q.active,'sword');applyGrowth(q.active,'art');}return q;});
 await p.addInitScript(q=>localStorage.setItem('camp-rush-v1',JSON.stringify(q)),fixture);await p.reload();await ready(p);await tap(p,'resume');await p.evaluate(()=>advanceTime(5000));await p.screenshot({path:decodeURIComponent(new URL('campaign-ascension.png',out).pathname.slice(1))});
 await tap(p,'pause');const bossFixture=await p.evaluate(async()=>{const {createChoiceBattle,choicePlan}=await import('./choice.js');const q=JSON.parse(localStorage.getItem('camp-rush-v1'));q.active=createChoiceBattle(18,{},'boss-visual');q.active.count=12;q.active.time=choicePlan(18).events.at(-1).time;q.active.cursor=choicePlan(18).events.length-1;q.active.passed=21;return q;});
 await p.addInitScript(q=>localStorage.setItem('camp-rush-v1',JSON.stringify(q)),bossFixture);await p.reload();await ready(p);await tap(p,'resume');await p.evaluate(()=>advanceTime(5500));await p.screenshot({path:decodeURIComponent(new URL('campaign-boss.png',out).pathname.slice(1))});assert.ok((await state(p)).battle.entities.some(e=>e.name==='天劫魔君'));
 await p.close();
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
}finally{await fs.writeFile(new URL('browser-report.json',out),JSON.stringify({checks,errors,requests},null,2));await browser.close();}
console.log('PASS phone controls, choice freeze/save/reload, isolated modes, boss/ascension rendering');
