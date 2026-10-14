import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fresh} from '../games/nightwatch/profile.js';
import {createBattle,Battle,availableCards} from '../games/nightwatch/battle.js';
import {MONSTERS,SKILLS,WORLD,UPGRADE_EXTRAS} from '../games/nightwatch/data.js';

const base=process.env.BASE_URL||'http://127.0.0.1:4187';
const out='artifacts/nightwatch/art-v2/browser';
await fs.mkdir(out+'/motion-frames',{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],checks=[];
const read=page=>page.evaluate(()=>JSON.parse(render_game_to_text()));
const advance=(page,ms)=>page.evaluate(ms=>advanceTime(ms),ms);
const saveShot=(page,name)=>page.screenshot({path:`${out}/${name}.png`,fullPage:true});

// Presentation fixtures use huge HP only to hold each art sample on screen.
// These values are never written into a user's save or the game's data tables.
function fixture(ids=['bolt'],{dense=false,rapid=false,choice=false}={}){
 const p=fresh();p.seed=11001;p.frontier=30;p.settings={sound:false,damageNumbers:true,guides:false};
 const s=p.active=createBattle(p);s.wave=1;s.waiting=1000;s.points=0;s.partnerClock=1000;s.wallClock=1000;
 s.abilities=Object.fromEntries(ids.map(id=>[id,{level:1,damage:0,cooldown:rapid?4:0}]));
 s.cooldowns=Object.fromEntries(ids.map(id=>[id,0]));
 if(rapid)s.stats.speed=8;
 const engine=new Battle(s,p);
 const types=dense?Array.from({length:48},(_,i)=>MONSTERS[i%MONSTERS.length].id):MONSTERS.map(m=>m.id);
 for(const [i,type]of types.entries()){
  const cols=dense?6:4,x=dense?105+(i%cols)*54:100+(i%cols)*92,y=dense?150+Math.floor(i/cols)*43:180+Math.floor(i/cols)*105;
  const e=engine.spawn(type,x,y);e.hp=e.maxHp=1e9;e.attackClock=1000;e.special=1000;
 }
 if(!dense){
  const frozen=engine.spawn('skeleton',118,482);frozen.hp=frozen.maxHp=1e9;frozen.freeze=30;
  const slow=engine.spawn('orc_warrior',270,450);slow.hp=slow.maxHp=1e9;slow.slow=30;slow.attackClock=1000;
  const held=engine.spawn('guard_mid',365,WORLD.wallY-16);held.y=WORLD.wallY-held.radius;held.hp=held.maxHp=1e9;held.attackClock=1000;
 }
 s.effects=[];
 if(dense){
  s.upgrades={'fire-multi':2,'fire-ground':1,'ice-multi':2,'lightning-chain':1,'rock-crush':1,'wind-return':1,'meteor-multi':1,'familiar-extra':1};
 }
 if(choice){s.status='choice';s.points=1;s.choices=availableCards(s,p).filter(c=>c.skill&&ids.includes(c.skill)&&c.skill!=='bolt').filter(c=>c.kind==='damage').slice(0,3);}
 return p;
}

async function pageFor(p,viewport={width:390,height:844},extra={}){
 const ctx=await browser.newContext({viewport,hasTouch:true,isMobile:true,...extra});
 const page=await ctx.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.addInitScript(p=>{if(!localStorage.getItem('camp-nightwatch-v1'))localStorage.setItem('camp-nightwatch-v1',JSON.stringify(p));},p);
 await page.goto(base+'/games/nightwatch/index.html');
 await page.waitForFunction(()=>document.getElementById('loading')?.hidden&&window.render_game_to_text);
 await advance(page,0);
 await page.locator('[data-action="resume"]').click();await advance(page,0);
 assert.equal((await read(page)).artVersion,4);assert.equal((await read(page)).assetsLoaded,55);
 return {ctx,page};
}

async function icons(page,expected,selector){
 const actual=await page.locator(selector).evaluateAll(imgs=>imgs.map(img=>({src:img.getAttribute('src'),complete:img.complete,width:img.naturalWidth})));
 assert.deepEqual(actual.map(x=>x.src),expected.map(key=>`assets/art-v2/icon-${key}.png`));
 assert.ok(actual.every(x=>x.complete&&x.width===128));
 return actual;
}

try{
 const {ctx,page}=await pageFor(fixture(['bolt'],{rapid:true}));
 const first=(await read(page)).animation;
 await advance(page,600);
 const moved=(await read(page)).animation;
 for(const type of MONSTERS.map(m=>m.id)){
  const a=first.enemies.find(e=>e.type===type),z=moved.enemies.find(e=>e.id===a.id);
  assert.ok(z.travel>a.travel,`${type} travels`);assert.ok(z.y>a.y,`${type} moves`);
 }
 const frozenA=first.enemies.find(e=>e.frozen),frozenZ=moved.enemies.find(e=>e.id===frozenA.id);
 assert.equal(frozenZ.frame,frozenA.frame);assert.equal(frozenZ.y,frozenA.y);assert.equal(frozenZ.travel,0);
 const heldA=first.enemies.find(e=>e.action==='idle'),heldZ=moved.enemies.find(e=>e.id===heldA.id);
 assert.equal(heldZ.frame,heldA.frame);assert.equal(heldZ.y,heldA.y);assert.equal(heldZ.travel,0);
 const slowed=moved.enemies.filter(e=>e.type==='orc_warrior');
 assert.ok(Math.abs(slowed[1].travel/slowed[0].travel-.42)<.001);
 checks.push('All 11 monsters have distance-driven travel; frozen feet and wall-stopped steps hold still; slow movement changes cadence by the actual 42% distance');
 const frames=new Map(),heroSamples=[];
 for(let i=0;i<120;i++){
  await advance(page,1000/60);const v=(await read(page)).animation;heroSamples.push(v.hero);
  for(const e of v.enemies){if(!frames.has(e.type))frames.set(e.type,new Set());frames.get(e.type).add(e.frame);}
 }
 for(const type of MONSTERS.map(m=>m.id))assert.ok(frames.get(type).size>=4,`${type} shows actual gait poses`);
 assert.deepEqual(new Set(heroSamples.map(h=>h.x+','+h.y)),new Set(['240,644']));
 assert.deepEqual([...new Set(heroSamples.filter(h=>h.action==='shoot').map(h=>h.frame))].sort(),[0,1,2,3,4,5,6,7]);
 for(let i=1;i<heroSamples.length;i++){
  const a=heroSamples[i-1],z=heroSamples[i];
  if(a.cycleStart===z.cycleStart)assert.equal(z.facing,a.facing,'Standing direction never flips within a shot');
  if(a.phase==='release'&&z.phase==='windup')assert.ok(a.frame>=6,'Rapid shooting reaches recovery before the next windup');
 }
 checks.push('Rapid 0.14-second shots still display all 8 action poses, finish recovery, keep hero root fixed and never flip direction within a shot');
 await saveShot(page,'all-monsters-phone');
 await page.locator('[data-action="pause"]').click();await advance(page,0);
 const paused=(await read(page)).animation,t=(await read(page)).battle.time;
 await page.waitForTimeout(250);await advance(page,800);
 assert.deepEqual((await read(page)).animation,paused);assert.equal((await read(page)).battle.time,t);
 checks.push('Pause freezes every displayed body and effect phase using battle time');
 await page.locator('[data-action="save-home"]').click();await page.reload();
 await page.waitForFunction(()=>document.getElementById('loading')?.hidden&&window.render_game_to_text);await advance(page,0);
 await page.locator('[data-action="resume"]').click();await advance(page,0);
 assert.deepEqual((await read(page)).animation.enemies,paused.enemies);
 checks.push('Saved walking distance preserves monster gait frames after reload');
 await ctx.close();

 const groups=[['bolt','fire','ice','lightning','beam'],['bolt','rock','blizzard','wind','meteor'],['bolt','familiar','chain','flame']];
 const keys=new Set(),choiceKeys=new Set();
 for(let i=0;i<groups.length;i++){
  const ids=groups[i],f=await pageFor(fixture(ids,{dense:true,choice:true}));
  const expected=ids.map(id=>SKILLS.find(s=>s.id===id).icon);expected.forEach(k=>keys.add(k));
  await icons(f.page,expected,'#dock .skill-icon');
  const choiceExpected=expected.slice(1,4);choiceExpected.forEach(k=>choiceKeys.add(k));
  await icons(f.page,choiceExpected,'.choice-card .skill-icon');
  await saveShot(f.page,`choice-skills-${i}`);
  await f.page.locator('.choice-card').first().click();
  await advance(f.page,100);await saveShot(f.page,`dense-cast-${i}`);
  await advance(f.page,450);await saveShot(f.page,`dense-flight-${i}`);
  const s=await read(f.page),areas=await f.page.evaluate(()=>JSON.parse(localStorage.getItem('camp-nightwatch-v1')).active.areas.length);
  assert.equal(s.battle.enemies.length,48);assert.ok(s.battle.projectiles>0||areas>0);
  for(const viewport of [{width:320,height:568},{width:844,height:390},{width:1440,height:900}]){
   await f.page.setViewportSize(viewport);await f.page.waitForTimeout(50);await advance(f.page,0);
   const bounds=await f.page.locator('#dock').evaluate(el=>({width:el.scrollWidth,client:el.clientWidth,screen:document.documentElement.scrollWidth,inner:innerWidth}));
   assert.ok(bounds.width<=bounds.client);assert.ok(bounds.screen<=bounds.inner);
   assert.ok(await f.page.locator('[data-action="summon"]').isVisible());
   if(i===0)await saveShot(f.page,`battle-${viewport.width}x${viewport.height}`);
  }
  await f.page.setViewportSize({width:390,height:844});await f.page.waitForTimeout(50);
  if(i===0){
   for(let n=0;n<36;n++){await advance(f.page,50);await f.page.locator('#board').screenshot({path:`${out}/motion-frames/frame-${String(n).padStart(3,'0')}.png`});}
  }
  await f.ctx.close();
 }
 const lastChoices=fixture(['bolt','beam','meteor']);lastChoices.active.status='choice';lastChoices.active.points=1;
 lastChoices.active.choices=availableCards(lastChoices.active,lastChoices).filter(c=>['bolt','beam','meteor'].includes(c.skill)&&c.kind==='damage');
 const finalCards=await pageFor(lastChoices);await icons(finalCards.page,['crossbow','beam','meteor'],'.choice-card .skill-icon');
 ['crossbow','beam','meteor'].forEach(k=>choiceKeys.add(k));await saveShot(finalCards.page,'choice-skills-3');await finalCards.ctx.close();
 assert.equal(keys.size,12);assert.equal(choiceKeys.size,12);
 checks.push('All 12 attack icons load in the choice cards and skill strip; 3 legal skill builds cover every spell in dense 48-monster captures');
 checks.push('Five-skill strip and summon button fit 320px phone, landscape phone and desktop without overflow');

 const passives=[UPGRADE_EXTRAS.find(c=>c.effect==='heal'),{id:'night-power',name:'百战之力',desc:'所有伤害 +5%',effect:'runPower',kind:'extra',element:'physical'},{id:'night-speed',name:'熟练复弩',desc:'主武器射速 +5%',effect:'runSpeed',kind:'extra',element:'physical'},{id:'night-critical',name:'破敌洞察',desc:'暴击伤害 +10%',effect:'runCritical',kind:'extra',element:'arcane'}];
 for(let i=0;i<2;i++){
  const p=fixture();p.active.status='choice';p.active.points=1;p.active.choices=passives.slice(i*2,i*2+2).map(c=>({...c,kind:'extra',element:c.element||'arcane'}));
  const f=await pageFor(p);await icons(f.page,i===0?['repair','power']:['speed','critical'],'.choice-card .skill-icon');await saveShot(f.page,`choice-passives-${i}`);await f.ctx.close();
 }
 checks.push('Repair, power, rapid reload and critical insight have matching remade choice icons');

 const reduced=await pageFor(fixture(['bolt'],{rapid:true}),{width:390,height:844},{reducedMotion:'reduce'});
 const reducedWalks=new Map(),reducedShots=new Set();
 for(let i=0;i<80;i++){
  await advance(reduced.page,1000/60);const a=await read(reduced.page);
  for(const e of a.animation.enemies.filter(e=>e.action==='walk')){
   if(!reducedWalks.has(e.type))reducedWalks.set(e.type,new Set());reducedWalks.get(e.type).add(e.frame);
  }
  if(a.animation.hero.action==='shoot')reducedShots.add(a.animation.hero.frame);
 }
 for(const type of MONSTERS.map(m=>m.id))assert.ok(reducedWalks.get(type)?.size>=4,`${type} keeps essential gait with reduced motion`);
 assert.deepEqual([...reducedShots].sort(),[0,1,2,3,4,5,6,7]);
 await reduced.ctx.close();
 checks.push('Reduced-motion setting preserves every monster gait and all 8 essential firing poses');
 const natural=fresh();natural.seed=61904;natural.settings={sound:false,damageNumbers:true,guides:false};natural.active=createBattle(natural);
 const live=await pageFor(natural);await advance(live.page,12000);
 assert.equal((await read(live.page)).battle.status,'playing');
 await fs.mkdir(out+'/natural-motion-frames',{recursive:true});
 for(let n=0;n<80;n++){
  await advance(live.page,50);
  if((await read(live.page)).battle.status==='choice'){await live.page.locator('.choice-card').first().click();await advance(live.page,0);}
  assert.equal((await read(live.page)).battle.status,'playing');
  await live.page.locator('#board').screenshot({path:`${out}/natural-motion-frames/frame-${String(n).padStart(3,'0')}.png`});
 }
 await saveShot(live.page,'natural-first-wave');await live.ctx.close();
 checks.push('Recorded four seconds of a real fresh first-wave battle, using the unchanged live numbers');
 assert.deepEqual(errors,[]);
 await fs.writeFile(`${out}/report.json`,JSON.stringify({checks,errors,fixtureNote:'Huge HP in screenshots keeps art samples visible; it is presentation test data, not live balance.'},null,2));
 console.log(JSON.stringify({checks,errors},null,2));
}finally{await fs.writeFile(`${out}/latest-errors.json`,JSON.stringify(errors,null,2));await browser.close();}
