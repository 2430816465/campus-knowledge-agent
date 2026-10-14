import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='artifacts/workshop/manual-start',base=process.env.BASE_URL||'http://127.0.0.1:4173';
await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true}),errors=[],checks=[];
const read=p=>p.evaluate(()=>JSON.parse(render_game_to_text()));
const time=(p,ms)=>p.evaluate(ms=>advanceTime(ms),ms);
try{
 for(const viewport of [{width:390,height:844},{width:844,height:390},{width:667,height:375},{width:1280,height:720}]){
  const c=await browser.newContext({viewport,hasTouch:true,isMobile:true}),p=await c.newPage();
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('response',r=>{if(r.status()>=400)errors.push(r.url()+' '+r.status());});
  await p.goto(base+'/games/workshop/index.html');await p.waitForFunction(()=>window.render_game_to_text&&JSON.parse(render_game_to_text()).assetsReady);
  let s=await read(p);assert.equal(s.coins,0);assert.equal(s.lineBuilt,false);assert.deepEqual(s.movement.visibleFacilities,['wheat','oven']);assert.equal(s.movement.obstacles.length,2);
  await time(p,60000);s=await read(p);assert.equal(s.crafted,0);assert.equal(s.coins,0);assert.deepEqual(s.dust,[0,0,0]);assert.deepEqual(s.carts,[]);await p.screenshot({path:`${out}/bare-${viewport.width}.png`});
  await p.locator('#guide-action').tap();await p.locator('#guide-action').tap();await time(p,6000);s=await read(p);assert.equal(s.tutorial.step,2);assert.equal(s.hand.raw[0],6);assert.equal(s.dust[0],0);
  await p.locator('#guide-action').tap();await time(p,5000);s=await read(p);assert.equal(s.movement.nearby,'oven');await p.locator('#interact').tap();s=await read(p);assert(s.job);assert.equal(s.tutorial.step,3);assert.equal(s.hand.raw[0],0);assert.equal(s.dust[0],4);
  for(let i=0;i<3;i++){
   await time(p,3100);s=await read(p);assert.equal(s.hand.ready[0],1);assert.equal(s.goods[0],i);
   if(i===0){await p.screenshot({path:`${out}/oven-ready-${viewport.width}.png`});await p.reload();await p.waitForFunction(()=>JSON.parse(render_game_to_text()).assetsReady);assert.equal((await read(p)).hand.ready[0],1);await p.locator('#guide-action').tap();await time(p,6000);}
   await p.locator('#interact').tap();assert.equal((await read(p)).goods[0],i+1);if(i<2)await p.locator('#interact').tap();
  }
  assert.equal((await read(p)).tutorial.step,6);await p.locator('#guide-action').tap();await time(p,5000);assert.equal((await read(p)).movement.nearby,'customer');await p.locator('#interact').tap();s=await read(p);assert.equal(s.beacons,1);assert.equal(s.coins,90);assert.equal(s.tutorial.step,7);await p.locator('[data-dialog=close]').tap();
  await p.locator('#guide-action').tap();assert.match(await p.locator('#upgrade-3').innerText(),/建造.*50/);await p.evaluate(()=>window.ScreenPages?.reveal(document.querySelector('#upgrade-3')));await p.locator('#upgrade-3').tap();s=await read(p);assert(s.lineBuilt);assert.equal(s.coins,40);assert.equal(s.upgrades.rail,0);assert.equal(s.tutorial.step,8);await p.locator('#close-panel').tap();await p.locator('#guide-action').tap();await p.screenshot({path:`${out}/line-built-${viewport.width}.png`});
  const crafted=s.crafted;await time(p,90000);s=await read(p);assert(s.crafted>crafted);assert(s.coins>=90);assert(s.movement.visibleFacilities.includes('line'));
  await p.locator('[data-open=production]').tap();await p.locator('[data-device-detail="machine-1"]').tap();await p.locator('#upgrade-1').tap();assert.equal((await read(p)).collectors[1],1);assert((await read(p)).movement.visibleFacilities.includes('cow'));await p.locator('#close-panel').tap();await p.locator('[data-open=recipe]').tap();await p.locator('[data-recipe-preview="1"]').tap();await p.locator('#select-1').tap();await p.locator('#close-panel').tap();await time(p,30000);assert((await read(p)).goods[1]>0);
  await p.locator('[data-open=recipe]').tap();await p.keyboard.press('Escape');assert.equal((await read(p)).panelOpen,false);assert.equal(await p.evaluate(()=>document.activeElement.dataset.open),'recipe');
  await p.locator('[data-open=production]').tap();await p.locator('[data-tab=production]').focus();await p.keyboard.press('ArrowRight');assert.equal((await read(p)).tab,'recipe');await p.keyboard.press('End');assert.equal((await read(p)).tab,'settings');await p.evaluate(()=>window.ScreenPages?.reveal(document.querySelector('#tutorial')));await p.locator('#tutorial').tap();assert.equal((await read(p)).tutorial.step,0);await p.locator('#guide-skip').tap();await p.reload();await p.waitForFunction(()=>JSON.parse(render_game_to_text()).assetsReady);assert.equal((await read(p)).tutorial.active,false);
  await p.locator('#pause').tap();const stopped=await read(p);await time(p,10000);assert.equal((await read(p)).crafted,stopped.crafted);assert.deepEqual((await read(p)).hand,stopped.hand);await p.locator('#pause').tap();
  await p.locator('[data-open=settings]').tap();await p.locator('#restart').tap();await p.locator('[data-dialog=reset]').tap();s=await read(p);assert.equal(s.coins,0);assert.equal(s.lineBuilt,false);assert.deepEqual(s.movement.visibleFacilities,['wheat','oven']);assert.deepEqual(s.hand,{raw:[0,0,0],ready:[0,0,0,0]});assert.deepEqual(s.tutorial,{active:true,step:0});
  checks.push({viewport,onlyTwoStarterFacilities:true,manualDeliveryReward:90,conveyorBuildCost:50,realDropConservation:true,ovenOutputReload:true,automaticMilkBreadAfterBuild:true,restartBareOpening:true});await c.close();
 }
 assert.deepEqual(errors,[]);await fs.writeFile(out+'/browser-results.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
