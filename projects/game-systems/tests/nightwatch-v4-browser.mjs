import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fresh} from '../games/nightwatch/profile.js';
import {createBattle,Battle} from '../games/nightwatch/battle.js';
import {MONSTERS,WORLD} from '../games/nightwatch/data.js';

const base=process.env.BASE_URL||'http://127.0.0.1:4211';
const out=process.env.AUDIT_OUT||'C:/Users/24308/Documents/ChatGPT/游戏/nightwatch-v4/browser';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],report={actors:{},hero:{},flights:{},standingCasts:{},viewports:[]};
function fixture(type='skeleton',{rapid=false,dense=false}={}){
 const p=fresh();p.settings={sound:false,damageNumbers:false,guides:false};
 const s=p.active=createBattle(p);s.waiting=1000;s.wave=1;s.partnerClock=s.wallClock=1000;s.stats.health=s.wall=1e8;s.cooldowns.bolt=.2;
 s.abilities={bolt:{level:1,damage:0,cooldown:0}};s.stats.speed=rapid?100:0;const engine=new Battle(s,p);
 const ids={};for(const [role,x,y]of [['walk',120,100],['attack',240,WORLD.wallY-MONSTERS.find(d=>d.id===type).radius],['frozen',350,360]]){
  const e=engine.spawn(type,x,y);e.hp=e.maxHp=1e9;e.special=1000;e.attackClock=role==='attack'?.24:1000;if(role==='frozen')e.freeze=1000;ids[role]=e.id;
 }
 if(dense)for(let i=0;i<97;i++){const e=engine.spawn(MONSTERS[i%11].id,95+i%6*58,100+Math.floor(i/6)%7*55);e.hp=e.maxHp=1e9;e.special=1000;}
 return {p,ids};
}
async function open(p,viewport={width:390,height:844},reducedMotion='no-preference'){
 const context=await browser.newContext({viewport,reducedMotion,hasTouch:true});const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.addInitScript(p=>{if(!localStorage.getItem('camp-nightwatch-v1'))localStorage.setItem('camp-nightwatch-v1',JSON.stringify(p));},p);
 await page.goto(base+'/games/nightwatch/index.html');await page.waitForFunction(()=>document.querySelector('#loading')?.hidden&&window.render_game_to_text);
 await page.evaluate(()=>advanceTime(0));await page.locator('[data-action="resume"]').click();await page.evaluate(()=>advanceTime(0));
 return {page,context};
}
const read=page=>page.evaluate(()=>JSON.parse(render_game_to_text()));
try{
 for(const d of MONSTERS.filter(d=>!process.env.ACTORS||process.env.ACTORS.split(',').includes(d.id))){
  const {p,ids}=fixture(d.id),{page,context}=await open(p);const first=await read(page);assert.equal(first.artVersion,4);
  const samples=await page.evaluate(ids=>{const walks=[],attacks=[],frozen=[],hero=[];for(let i=0;i<360;i++){advanceTime(1000/60);const a=JSON.parse(render_game_to_text()).animation;walks.push(a.enemies.find(e=>e.id===ids.walk));attacks.push(a.enemies.find(e=>e.id===ids.attack));frozen.push(a.enemies.find(e=>e.id===ids.frozen));hero.push(a.hero);}return {walks,attacks,frozen,hero};},ids);
  const walking=[...new Set(samples.walks.filter(e=>e.action==='walk').map(e=>e.frame))].sort();const attacking=[...new Set(samples.attacks.map(e=>e.frame))].sort();
  assert.deepEqual(walking,[0,1,2,3,4,5,6,7],d.id+' walking');assert.deepEqual(attacking,[0,1,2,3,4,5,6,7],d.id+' attacking');
  assert.ok(samples.attacks.every(e=>e.sheet===d.id+'-attack'));assert.ok(samples.frozen.every(e=>e.frame===samples.frozen[0].frame&&e.y===360));
  assert.ok(samples.attacks.every(e=>e.x===240&&e.y===WORLD.wallY-d.radius));
  await page.screenshot({path:`${out}/${d.id}-in-game.png`});
  const before=await read(page);await page.locator('[data-action="pause"]').click();await page.evaluate(()=>advanceTime(500));assert.deepEqual((await read(page)).animation,before.animation);
  await page.locator('[data-action="save-home"]').click();await page.reload();await page.waitForFunction(()=>document.querySelector('#loading')?.hidden&&window.render_game_to_text);await page.evaluate(()=>advanceTime(0));await page.locator('[data-action="resume"]').click();await page.evaluate(()=>advanceTime(0));
  assert.deepEqual((await read(page)).animation.enemies,before.animation.enemies);
  report.actors[d.id]={walking,attacking,frozenStable:true,pauseStable:true,saveResumeStable:true};await context.close();
 }
 for(const rapid of [false,true])for(const motion of ['no-preference','reduce']){
  const {p}=fixture('rock_golem',{rapid}),{page,context}=await open(p,undefined,motion);
  const frames=await page.evaluate(()=>{const result=[];for(let i=0;i<240;i++){advanceTime(1000/60);result.push(JSON.parse(render_game_to_text()).animation.hero);}return result;});
  const seen=[...new Set(frames.filter(f=>f.action==='shoot').map(f=>f.frame))].sort();assert.deepEqual(seen,[0,1,2,3,4,5,6,7]);
  assert.ok(frames.every(f=>f.x===240&&f.y===644));
  report.hero[(rapid?'rapid':'ordinary')+'-'+motion]={frames:seen,rootStable:true};await page.screenshot({path:`${out}/hero-${rapid?'rapid':'ordinary'}-${motion}.png`});await context.close();
 }
 // Record real spell trajectories and compare wall damage/event effects with
 // the exact frame where the projectile disappears at the wall.
 for(const type of ['mage_red','mage_low','dragon']){
  const {p}=fixture(type);const s=p.active;s.cooldowns.bolt=1000;s.enemies=s.enemies.filter(e=>e.type===type).slice(0,1);const e=s.enemies[0];e.y=350;e.attackClock=0;e.speed=0;
  const {page,context}=await open(p);const samples=await page.evaluate(()=>{const rows=[];for(let i=0;i<40;i++){advanceTime(1000/60);const v=JSON.parse(render_game_to_text()),s=JSON.parse(localStorage.getItem('camp-nightwatch-v1')).active;rows.push({time:s.time,wall:s.wall,shots:v.animation.enemyShots,effects:s.effects.filter(f=>f.kind==='wall'),log:s.wallDamageByType||{}});}return rows;});
  const impact=samples.findIndex((r,i)=>i>0&&r.wall<samples[i-1].wall);assert.ok(impact>0);assert.ok(samples[impact-1].shots.length===1);assert.equal(samples[impact].shots.length,0);assert.equal(samples[impact].effects.length,1);assert.ok(samples[impact].log[type]>0);
  assert.ok(samples.slice(0,impact).every(r=>r.effects.length===0));const ys=samples.slice(0,impact).map(r=>r.shots[0].y);assert.ok(ys.every((y,i)=>!i||y>ys[i-1]));
  report.flights[type]={impactFrame:impact,damage:samples[0].wall-samples[impact].wall,lastVisibleY:ys.at(-1),wallY:WORLD.wallY,wallEffectMatchesImpact:true};await fs.writeFile(`${out}/${type}-flight-log.json`,JSON.stringify(samples,null,2));await context.close();
 }
 for(const type of ['mage_red','mage_low','dragon']){
  const {p}=fixture(type);p.active.cooldowns.bolt=1000;p.active.enemies=p.active.enemies.slice(0,1);const e=p.active.enemies[0];e.y=295;e.attackClock=.1;
  const {page,context}=await open(p);const samples=await page.evaluate(()=>{const rows=[];for(let i=0;i<110;i++){advanceTime(1000/60);rows.push(JSON.parse(render_game_to_text()).animation.enemies[0]);}return rows;});
  const casts=samples.filter(e=>e.action==='windup'||e.action==='attack');assert.deepEqual([...new Set(casts.map(e=>e.frame))].sort(),[0,1,2,3,4,5,6,7]);assert.ok(casts.every(e=>e.y===300.01));assert.ok(samples.at(-1).y>300.01);
  report.standingCasts[type]={allEightFrames:true,stationaryY:300.01,resumedAtOriginalSpeed:true};await fs.writeFile(`${out}/${type}-standing-cast.json`,JSON.stringify(samples,null,2));await context.close();
 }
 for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1440,height:900}]){
  const {p}=fixture('dragon',{dense:true,rapid:true}),{page,context}=await open(p,viewport);await page.evaluate(()=>advanceTime(1100));await page.screenshot({path:`${out}/battle-${viewport.width}x${viewport.height}.png`});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.ok(await page.locator('[data-action="summon"]').isVisible());report.viewports.push(viewport);await context.close();
 }
 const {p}=fixture('dragon',{dense:true,rapid:true}),stress=await open(p);await stress.page.reload();await stress.page.waitForFunction(()=>document.querySelector('#loading')?.hidden&&window.render_game_to_text);await stress.page.locator('[data-action="resume"]').click();
 const timings=await stress.page.evaluate(()=>new Promise(resolve=>{const values=[];let last=performance.now();function tick(now){values.push(now-last);last=now;if(values.length<245)requestAnimationFrame(tick);else resolve(values.slice(5));}requestAnimationFrame(tick);}));timings.sort((a,b)=>a-b);report.desktopFrameTime={enemies:100,samples:timings.length,medianMs:timings[120],p95Ms:timings[228],over34ms:timings.filter(t=>t>34).length};await stress.page.screenshot({path:out+'/dense-live.png'});await stress.context.close();
 assert.deepEqual(errors,[]);report.errors=errors;await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await fs.writeFile(out+'/errors.json',JSON.stringify(errors,null,2));await browser.close();}
