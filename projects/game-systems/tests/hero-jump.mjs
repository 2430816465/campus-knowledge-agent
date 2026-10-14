import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/24308/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const out='artifacts/hero-jump',base='http://127.0.0.1:4173';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],checks=[];
const contexts=[];
async function open(){const c=await browser.newContext({viewport:{width:1000,height:720},recordVideo:{dir:out+'/recordings',size:{width:1000,height:720}}});contexts.push(c);const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.locator('[data-action="mode:coop"]').click();return p;}
async function mounted(p){await p.waitForFunction(()=>document.querySelector('iframe')&&!document.querySelector('.game-loading'));return p.frames().find(f=>f.url().includes('/games/coop/'));}
try{
 const a=await open(),b=await open();
 await a.locator('[data-action="create-room"]').click();const af=await mounted(a);await af.locator('#lobby:not(.hidden)').waitFor();const code=await af.locator('#inviteCode').textContent();
 await b.locator('[data-action="join-room"]').click();await b.locator('#room-input').fill(code);await b.locator('[data-action="join-submit"]').click();const bf=await mounted(b);await bf.locator('#lobby:not(.hidden)').waitFor();
 await af.locator('#readyButton').click();await bf.locator('#readyButton').click();await af.locator('#startButton').click();await af.locator('#game:not(.hidden)').waitFor();await af.evaluate(()=>RushArt.ready);
 await af.locator('#board').click();await a.waitForTimeout(1600);await a.keyboard.down('ArrowRight');await a.waitForTimeout(180);
 assert.equal((await af.evaluate(()=>RushArt.inspect())).poses[0],'start');
 await a.waitForTimeout(430);assert.equal((await af.evaluate(()=>RushArt.inspect())).poses[0],'run');
 await a.screenshot({path:out+'/playing-run.png'});
 await a.keyboard.up('ArrowRight');await a.waitForTimeout(100);assert.equal((await af.evaluate(()=>RushArt.inspect())).poses[0],'stop');
 await a.waitForTimeout(700);assert.equal((await af.evaluate(()=>RushArt.inspect())).poses[0],'idle');
 checks.push('real keyboard: idle → start → run → stop → idle');
 await a.keyboard.down('ArrowLeft');await a.waitForTimeout(360);assert.equal(await af.evaluate(()=>CampCoop.snapshot().world.players[0].facing),-1);await a.keyboard.down('Space');await a.waitForTimeout(180);assert(!(await af.evaluate(()=>CampCoop.snapshot().world.players[0].grounded)));await a.screenshot({path:out+'/playing-jump.png'});await a.keyboard.up('Space');await a.keyboard.up('ArrowLeft');await a.waitForTimeout(1100);
 assert(await af.evaluate(()=>CampCoop.snapshot().world.players[0].grounded));checks.push('reverse, jump, land and idle work with unchanged physics');
 await bf.locator('#board').click();await b.keyboard.down('ArrowRight');await b.waitForTimeout(400);assert.equal((await bf.evaluate(()=>RushArt.inspect())).poses[1],'run');await b.screenshot({path:out+'/player-two.png'});await b.keyboard.up('ArrowRight');await b.waitForTimeout(700);checks.push('gold player uses new video sprites');
 const touch=await a.context().newCDPSession(a);await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 for(const [width,height] of [[844,390],[740,360]]){
   await a.setViewportSize({width,height});await a.waitForTimeout(200);
   const box=await af.locator('[data-control="right"]').boundingBox();assert(box);
   await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});await a.waitForTimeout(420);
   assert.equal((await af.evaluate(()=>RushArt.inspect())).poses[0],'run');
   await a.screenshot({path:out+`/touch-${width}x${height}.png`});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await a.waitForTimeout(700);
   assert.equal((await af.evaluate(()=>RushArt.inspect())).poses[0],'idle');assert.equal(await af.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 checks.push('844×390 and 740×360 mobile landscape: real touch hold/release, run and stop, no horizontal overflow');
 // Exercise display timing without touching the authoritative room simulation.
 const timing=await af.evaluate(()=>{
   const state=structuredClone(CampCoop.snapshot()),canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const ctx=canvas.getContext('2d');
   state.phase='playing';for(const p of state.world.players){p.x=140;p.y=544;p.vx=240;p.vy=0;p.grounded=true;}
   RushArt.reset();const observed=new Set(),cost=[];let last;
   for(let t=100;t<3000;t+=1000/120){state.world.tick++;const before=performance.now();RushArt.draw(ctx,state,0,t,false);cost.push(performance.now()-before);last=RushArt.inspect();if(last.poses[0]==='run')observed.add(last.frames[0]);}
   const before=JSON.stringify({frames:last.frames,poses:last.poses});state.phase='paused';for(let t=3000;t<3300;t+=1000/60)RushArt.draw(ctx,state,0,t,false);last=RushArt.inspect();const after=JSON.stringify({frames:last.frames,poses:last.poses});
   cost.sort((a,b)=>a-b);return {count:observed.size,fps:last.fps,paused:before===after,failed:RushArt.failed,p95:cost[Math.floor(cost.length*.95)],max:cost.at(-1),runSize:[RushArt.images.run.width,RushArt.images.run.height]};
 });
 assert.equal(timing.count,48);assert.deepEqual(timing.fps,[24,24]);assert(timing.paused);assert.deepEqual(timing.failed,[]);assert.deepEqual(timing.runSize,[1280,960]);checks.push('all 48 native run frames render at source speed; pause freezes both players; no missing sprites');

 const jump=await af.evaluate(()=>{
   const state=structuredClone(CampCoop.snapshot()),canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const ctx=canvas.getContext('2d');
   state.phase='playing';RushArt.reset();const seen=new Set(),phases=new Set();let t=100;
   function draw(grounded,vy){for(const p of state.world.players){p.x=140;p.y=400;p.vx=0;p.vy=vy;p.grounded=grounded;}state.world.tick++;RushArt.draw(ctx,state,0,t,false);const p=RushArt.inspect();phases.add(p.poses[0]);if(['jump','fall','land'].includes(p.poses[0]))seen.add(p.frames[0]);t+=1;return p;}
   for(let i=0;i<364;i++)draw(false,-100);
   for(let i=0;i<364;i++)draw(false,100);
   for(let i=0;i<1500;i++)draw(true,0);
   return {frames:[...seen].sort((a,b)=>a-b),phases:[...phases],count:RushArtConfig.hero.jumpVideo.count,files:[RushArt.images.jump.width,RushArt.images.jump.height],failed:RushArt.failed};
 });
 console.log('missing',Array.from({length:97},(_,i)=>i).filter(i=>!jump.frames.includes(i)),jump.phases);assert.equal(jump.count,97);assert.equal(jump.frames.length,97);assert.deepEqual(jump.files,[1280,2080]);assert(jump.phases.includes('idle'));assert.deepEqual(jump.failed,[]);
 checks.push('all 97 original jump frames reachable across ascent, fall and landing; full recovery returns to idle');
 await writeFile(out+'/jump-coverage.json',JSON.stringify(jump,null,2));
 await a.waitForTimeout(100);assert.deepEqual(errors,[]);
 await writeFile(out+'/runtime-results.json',JSON.stringify({checks,timing,errors},null,2));console.log({checks,timing,errors});
}finally{for(const c of contexts)await c.close();await browser.close();}
