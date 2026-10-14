import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/24308/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const base=process.env.BASE_URL||'http://192.168.3.24:4173';
const browser=await chromium.launch({headless:true}),errors=[],checks=[];
await mkdir('artifacts/coop-lan',{recursive:true});
async function open(size={width:390,height:844}){const c=await browser.newContext({viewport:size,hasTouch:true});const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.locator('[data-action="mode:coop"]').click();return {c,p};}
async function mounted(p){await p.waitForFunction(()=>document.querySelector('iframe')&&!document.querySelector('.game-loading'));return p.frames().find(f=>f.url().includes('/games/coop/'));}
try{
 for(const [width,height] of [[360,800],[390,844],[844,390],[1440,900]]){
  const {c,p}=await open({width,height});await p.locator('[data-action="create-room"]').click();const f=await mounted(p);await f.locator('#lobby:not(.hidden)').waitFor();
  assert.equal(await f.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const boxes=await f.evaluate(()=>['.lobby-title','.invite-code','.lobby-players','.room-level-select','.lobby-actions'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {s,x:r.x,y:r.y,w:r.width,h:r.height};}));
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert(!(a.x<b.x+b.w-1&&a.x+a.w>b.x+1&&a.y<b.y+b.h-1&&a.y+a.h>b.y+1),`overlap ${width}: ${a.s} ${b.s}`);}
  await p.screenshot({path:`artifacts/coop-lan/room-${width}x${height}.png`});checks.push(`room ${width}x${height}: no overlaps/overflow`);await c.close();
 }
 const a=await open({width:1000,height:720}),b=await open({width:1000,height:720});
 await a.p.locator('[data-action="create-room"]').click();const af=await mounted(a.p);await af.locator('#lobby:not(.hidden)').waitFor();const code=await af.locator('#inviteCode').textContent();
 await b.p.locator('[data-action="join-room"]').click();await b.p.locator('#room-input').fill(code);await b.p.locator('[data-action="join-submit"]').click();const bf=await mounted(b.p);await bf.locator('#lobby:not(.hidden)').waitFor();
 await af.locator('#readyButton').click();await bf.locator('#readyButton').click();await af.locator('#startButton').click();await af.locator('#game:not(.hidden)').waitFor();
 await af.locator('#board').click();await a.p.waitForTimeout(200);
 await a.p.keyboard.down('ArrowRight');await a.p.waitForTimeout(230);await a.p.keyboard.down('Space');await a.p.waitForTimeout(130);await a.p.keyboard.up('Space');
 const flying=await af.evaluate(()=>({world:CampCoop.snapshot().world,art:RushArt.inspect()}));assert(!flying.world.players[0].grounded);assert(flying.art.poses.includes('jump'));
 await a.p.screenshot({path:'artifacts/coop-lan/jump-playing.png'});await a.p.keyboard.up('ArrowRight');await a.p.waitForTimeout(700);
 const xA=await af.evaluate(()=>CampCoop.snapshot().world.players[0].x),xB=await bf.evaluate(()=>CampCoop.snapshot().world.players[0].x);assert(Math.abs(xA-xB)<5);checks.push('LAN IP: create/join/ready/start, jump and movement synchronized across two clients');
 // Exercise every actual loaded run frame with a controlled render state, no game physics changed.
 const result=await af.evaluate(async()=>{await RushArt.ready;const world=structuredClone(CampCoop.snapshot());world.phase='playing';world.world.players[0].grounded=true;world.world.players[0].vx=240;world.world.players[0].vy=0;world.world.players[0].x=140;world.world.players[0].y=544;RushArt.reset();const frames=new Set();for(let t=0;t<3000;t+=16.6667){world.world.tick++;RushArt.draw(document.querySelector('#board').getContext('2d'),world,0,t,false);if(RushArt.inspect().poses[0]==='run')frames.add(RushArt.inspect().frames[0]);}return {frames:[...frames],failed:RushArt.failed,width:RushArt.images.run.width};});
 assert.equal(result.width,1280);assert(result.frames.length===48);assert.deepEqual(result.failed,[]);checks.push('video run atlas displayed at native 24 fps; 97-frame source jump atlas loaded; no missing art');
 await b.c.close();await af.locator('#pauseBanner').waitFor();checks.push('peer disconnect pauses room');await a.c.close();
 const setup=await open();await setup.p.locator('[data-action="create-room"]').click();const sf=await mounted(setup.p);await sf.locator('#lobby:not(.hidden)').waitFor();await sf.locator('.lan-info button').click();await sf.locator('#serverAddress').fill(base);await sf.locator('#androidServerSetup button[type=submit]').click();await setup.p.waitForTimeout(400);assert.equal(await sf.evaluate(()=>localStorage.getItem('adventure-camp.coop.ws-url')),base.replace('http:','ws:')+'/ws');await sf.locator('#createRoom').click();await sf.locator('#lobby:not(.hidden)').waitFor();checks.push('HTTP/LAN address normalization, server switching, room recreated');await setup.c.close();
 assert.deepEqual(errors,[]);await writeFile('artifacts/coop-lan/results.json',JSON.stringify({base,checks,errors},null,2));console.log(checks);
}finally{await browser.close();}
