import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fresh} from '../games/nightwatch/profile.js';
import {createBattle,Battle} from '../games/nightwatch/battle.js';
import {MONSTERS,WORLD} from '../games/nightwatch/data.js';

const base=process.env.BASE_URL||'http://127.0.0.1:4211';
const out=process.env.AUDIT_OUT||'C:/Users/24308/Documents/ChatGPT/游戏/full-ui-audit/nightwatch/evidence';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const errors=[],report={};
function fixture(dense=false){
 const p=fresh();p.settings={sound:false,damageNumbers:true,guides:false};
 const s=p.active=createBattle(p);s.waiting=1000;s.wave=1;s.partnerClock=s.wallClock=1000;
 s.stats.health=s.wall=1e8;s.stats.speed=4;
 const battle=new Battle(s,p);
 for(let i=0;i<(dense?100:MONSTERS.length);i++){
  const e=battle.spawn(MONSTERS[i%MONSTERS.length].id,94+i%5*72,130+Math.floor(i/5)%7*51);
  e.hp=e.maxHp=1e9;e.attackClock=e.special=1000;
 }
 const attack=battle.spawn('skeleton',144,WORLD.wallY-14);attack.hp=attack.maxHp=1e9;attack.attackClock=.24;
 const frozen=battle.spawn('skeleton',310,480);frozen.hp=frozen.maxHp=1e9;frozen.freeze=100;
 return p;
}
async function open(p,viewport={width:390,height:844},reducedMotion='no-preference'){
 const context=await browser.newContext({viewport,reducedMotion});const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.addInitScript(p=>localStorage.setItem('camp-nightwatch-v1',JSON.stringify(p)),p);
 await page.goto(base+'/games/nightwatch/index.html');
 await page.waitForFunction(()=>document.querySelector('#loading')?.hidden&&window.render_game_to_text);
 await page.locator('[data-action="resume"]').click();
 return {page,context};
}
const read=page=>page.evaluate(()=>JSON.parse(render_game_to_text()));
try{
 for(const preference of ['no-preference','reduce']){
  const {page,context}=await open(fixture(),undefined,preference);
  await page.evaluate(()=>advanceTime(0));
  const initial=await read(page),walks=new Set(),attacks=new Set(),frozen=initial.animation.enemies.find(e=>e.frozen);
  const attacking=initial.animation.enemies.find(e=>e.type==='skeleton'&&e.y>530);
  assert.equal(initial.artVersion,4);assert.equal(initial.assetsLoaded,55);
  await fs.mkdir(out+'/'+preference,{recursive:true});
  for(let i=0;i<72;i++){
   await page.evaluate(()=>advanceTime(1000/24));
   const state=await read(page);
   walks.add(state.animation.enemies.find(e=>e.type==='skeleton'&&e.action==='walk').frame);
   const hit=state.animation.enemies.find(e=>e.id===attacking.id);attacks.add(hit.frame);
   assert.equal(hit.sheet,'skeleton-attack');assert.equal(hit.x,attacking.x);assert.equal(hit.y,attacking.y);
   const ice=state.animation.enemies.find(e=>e.id===frozen.id);assert.equal(ice.frame,frozen.frame);assert.equal(ice.y,frozen.y);
   if(i<24)await page.locator('#board').screenshot({path:`${out}/${preference}/frame-${String(i).padStart(3,'0')}.png`});
  }
  assert.equal(walks.size,8);assert.equal(attacks.size,8);
  const before=await read(page);await page.locator('[data-action="pause"]').click();await page.evaluate(()=>advanceTime(2000));
  assert.equal((await read(page)).battle.time,before.battle.time);
  report[preference]={walkFrames:[...walks].sort(),attackFrames:[...attacks].sort(),freezeStable:true,pauseStable:true};
  await context.close();
 }
 const stress=await open(fixture(true));
 const samples=await stress.page.evaluate(()=>new Promise(resolve=>{const delta=[];let prev=performance.now();function tick(now){delta.push(now-prev);prev=now;if(delta.length<240)requestAnimationFrame(tick);else resolve(delta.slice(5));}requestAnimationFrame(tick);}));
 samples.sort((a,b)=>a-b);report.desktopFrameTime={fixtureEnemies:100,samples:samples.length,medianMs:samples[Math.floor(samples.length*.5)],p95Ms:samples[Math.floor(samples.length*.95)],over34ms:samples.filter(x=>x>34).length};
 await stress.page.screenshot({path:out+'/dense-battle.png'});await stress.context.close();
 for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
  const {page,context}=await open(fixture(),viewport);await page.evaluate(()=>advanceTime(1200));
  await page.screenshot({path:`${out}/battle-${viewport.width}x${viewport.height}.png`});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('[data-action="pause"]').click();await page.locator('[data-action="save-home"]').click();
  await page.screenshot({path:`${out}/home-${viewport.width}x${viewport.height}.png`});
  await context.close();
 }
 assert.deepEqual(errors,[]);report.errors=errors;
 await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
