import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fresh} from '../games/nightwatch/profile.js';
import {createBattle,Battle} from '../games/nightwatch/battle.js';
import {MONSTERS,WORLD} from '../games/nightwatch/data.js';

const baseline=process.argv.includes('--baseline');
const base=process.env.BASE_URL||'http://127.0.0.1:4187';
const out=`artifacts/nightwatch/motion-fix/${baseline?'before':'after'}`;
const browser=await chromium.launch({headless:true});
const errors=[],results=[];
await fs.mkdir(out,{recursive:true});

function fixture(){
 const p=fresh();p.settings={sound:false,damageNumbers:false,guides:false};
 const s=p.active=createBattle(p);s.waiting=1000;s.wave=1;s.partnerClock=s.wallClock=1000;
 s.stats.speed=8;
 const battle=new Battle(s,p);
 // Presentation-only HP holds each character on screen; real balance is untouched.
 for(const [i,type]of MONSTERS.map(m=>m.id).entries()){
  const e=battle.spawn(type,96+i%4*94,190+Math.floor(i/4)*105);
  e.hp=e.maxHp=1e9;e.attackClock=e.special=1000;
 }
 const frozen=battle.spawn('skeleton',100,485);frozen.hp=frozen.maxHp=1e9;frozen.freeze=30;
 const held=battle.spawn('guard_mid',370,WORLD.wallY-18);held.y=WORLD.wallY-held.radius;held.hp=held.maxHp=1e9;held.attackClock=1000;
 s.effects=[];
 return p;
}

async function open(reducedMotion){
 const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion});
 const page=await ctx.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.addInitScript(p=>localStorage.setItem('camp-nightwatch-v1',JSON.stringify(p)),fixture());
 await page.goto(base+'/games/nightwatch/index.html?v=20261001-motion-fix');
 await page.waitForFunction(()=>document.getElementById('loading')?.hidden&&window.render_game_to_text);
 assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),reducedMotion==='reduce');
 await page.locator('[data-action="resume"]').click();
 return {ctx,page};
}
const read=page=>page.evaluate(()=>JSON.parse(render_game_to_text()));

try{
 for(const preference of ['no-preference','reduce']){
  const {ctx,page}=await open(preference);
  const first=await read(page),liveFrames=new Set(),liveHero=new Set();
  // Exercise the actual requestAnimationFrame loop before using deterministic time.
  for(let i=0;i<24;i++){
   await page.waitForTimeout(50);
   const state=await read(page);
   liveFrames.add(state.animation.enemies.find(e=>e.id===first.animation.enemies[0].id).frame);
   if(state.animation.hero.action==='shoot')liveHero.add(state.animation.hero.frame);
  }
  const live=await read(page);assert.ok(live.battle.time>first.battle.time+.4);
  const folder=out+'/'+preference;await fs.mkdir(folder,{recursive:true});
  const walks=new Map(),shots=new Set(),fixed=(await read(page)).animation.enemies.filter(e=>e.action==='held'||e.action==='idle');
  for(let i=0;i<40;i++){
   await page.evaluate(()=>advanceTime(50));
   const state=await read(page);
   for(const e of state.animation.enemies){
    if(e.action!=='walk')continue;
    if(!walks.has(e.type))walks.set(e.type,new Set());walks.get(e.type).add(e.frame);
   }
   if(state.animation.hero.action==='shoot')shots.add(state.animation.hero.frame);
   await page.locator('#board').screenshot({path:`${folder}/frame-${String(i).padStart(3,'0')}.png`});
  }
  const last=await read(page);
  for(const a of fixed){
   const z=last.animation.enemies.find(e=>e.id===a.id);
   assert.equal(z.frame,a.frame);assert.equal(z.y,a.y);
  }
  const frameCounts=Object.fromEntries([...walks].map(([type,set])=>[type,set.size]));
  if(baseline&&preference==='reduce'){
   assert.ok(Object.values(frameCounts).every(count=>count===1));
   assert.deepEqual([...shots],[0]);
  }else{
   assert.equal(walks.size,MONSTERS.length);
   assert.ok(Object.values(frameCounts).every(count=>count>=4));
   assert.ok(liveFrames.size>=4,'Real-time walking displays several actual poses');
   assert.ok(liveHero.size>=4,'Real-time shooting displays several actual poses');
   assert.deepEqual([...shots].sort(),[0,1,2,3,4,5,6,7]);
  }
  results.push({preference,liveWalkingPoses:liveFrames.size,liveShootingPoses:liveHero.size,monsterPoses:frameCounts,shootingPoses:[...shots].sort(),assets:live.assetsLoaded,presentation:live.presentation});
  await page.screenshot({path:out+'/'+preference+'.png',fullPage:true});
  await ctx.close();
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(out+'/report.json',JSON.stringify({baseline,results,errors},null,2));
 console.log(JSON.stringify({baseline,results,errors},null,2));
}finally{await browser.close();}
