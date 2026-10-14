import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {fresh} from '../games/workshop/economy.js';
const browser=await chromium.launch({headless:true}),out='artifacts/workshop/business';await fs.mkdir(out,{recursive:true});const results=[];
for(const [width,height] of [[390,844],[844,390],[667,375],[1280,720]]){
 const context=await browser.newContext({viewport:{width,height},hasTouch:true}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const seed=fresh();seed.lineBuilt=true;seed.beacons=3;seed.deliveries=3;seed.coins=6000;seed.collectors=[3,3,3];Object.keys(seed.shop.facilities).forEach(id=>seed.shop.facilities[id]=1);seed.shop.stock=[25,25,25,2];seed.shop.guests=2;
 await page.addInitScript(s=>{localStorage.setItem('starlight-workshop-v1',JSON.stringify({...s,savedAt:Date.now()}));localStorage.setItem('demon-bakery-tutorial-v1',JSON.stringify({done:true}));},seed);
 await page.goto('http://127.0.0.1:4173/games/workshop/index.html');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).assetsReady);
 const read=async()=>JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
 async function walk(id){const snap=await read(),f=snap.movement.layout.facilities.find(f=>f.id===id),world=snap.movement.world;
  // Touch the actual fixture, then allow the walker to reach its service point.
  await page.touchscreen.tap(f.x/world.width*width,(f.y-30)/world.height*height);await page.evaluate(()=>window.advanceTime(6000));const current=await read();assert.equal(current.movement.nearby,id,`cannot reach ${id} on ${width}x${height}`);
 }
 async function act(id){await walk(id);await page.locator('#interact').click();}
 await act('rack');assert.equal((await read()).shop.carry.kind,'bread');await page.screenshot({animations:'disabled',path:`${out}/carry-${width}x${height}.png`});await act('table');assert.equal((await read()).shop.served,1);assert.equal((await read()).shop.carry,null);
 for(let basket=0;basket<3;basket++){await act('pack');assert((await read()).shop.packJob);await page.evaluate(()=>window.advanceTime(6200));await page.locator('#interact').click();assert.equal((await read()).shop.carry.kind,'parcel');await act('wagon');assert.equal((await read()).shop.carry,null);}
 assert((await read()).shop.trip);await page.screenshot({path:`${out}/trip-${width}x${height}.png`});const before=(await read()).coins;await page.evaluate(()=>window.advanceTime(46000));assert.equal((await read()).shop.trips,1);assert((await read()).coins>before);
 await page.locator('[data-open=business]').click();await page.waitForFunction(()=>getComputedStyle(document.getElementById('management')).opacity==='1');assert.equal((await read()).tab,'business');const panel=await page.locator('#management').boundingBox(),canvas=await page.locator('#board').boundingBox();assert(panel.width*panel.height/(width*height)<.6);assert(canvas.width*canvas.height/(width*height)>.99);await page.screenshot({path:`${out}/panel-${width}x${height}.png`});await page.locator('#close-panel').click();
 await page.locator('#pause').click();const frozen=await read();await page.evaluate(()=>window.advanceTime(10000));const still=await read();assert.equal(still.elapsed,frozen.elapsed);assert.deepEqual(still.shop,frozen.shop);await page.locator('#pause').click();
 assert.deepEqual(errors,[]);results.push({viewport:{width,height},served:still.shop.served,trips:still.shop.trips,panelFraction:panel.width*panel.height/(width*height),canvasFraction:canvas.width*canvas.height/(width*height),errors});await context.close();
}
// Exercise actual purchase onboarding, fourth recipe, and the expanded final
// goal without spending an hour of wall time on already-tested production.
const finalContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true}),finalPage=await finalContext.newPage(),finalErrors=[];
finalPage.on('pageerror',e=>finalErrors.push(e.message));
const earned=fresh();earned.lineBuilt=true;earned.beacons=6;earned.deliveries=6;earned.coins=10000;earned.collectors=[3,3,3];earned.dust=[10,10,10];earned.goods=[10,10,10,0];earned.shop.served=7;earned.shop.trips=2;
await finalPage.addInitScript(s=>{if(!sessionStorage.getItem('business-final-fixture')){localStorage.setItem('starlight-workshop-v1',JSON.stringify({...s,savedAt:Date.now()}));localStorage.setItem('demon-bakery-tutorial-v1',JSON.stringify({done:true}));sessionStorage.setItem('business-final-fixture','yes');}},earned);
await finalPage.goto('http://127.0.0.1:4173/games/workshop/index.html');await finalPage.waitForFunction(()=>JSON.parse(window.render_game_to_text()).assetsReady);
const finalRead=async()=>JSON.parse(await finalPage.evaluate(()=>window.render_game_to_text()));
await finalPage.locator('[data-open=production]').click();
for(const id of ['mill','rack','jam','table','pack','wagon']){await finalPage.locator('[data-build='+id+']').click();assert(await finalPage.locator('#dialog').isVisible());await finalPage.locator('[data-dialog=close]').click();assert.equal((await finalRead()).shop.facilities[id],1);}
await finalPage.locator('[data-tab=recipe]').click();await finalPage.locator('[data-recipe="3"]').click();await finalPage.evaluate(()=>window.advanceTime(25000));assert((await finalRead()).crafted>0);assert((await finalRead()).shop.jam>=0);
await finalPage.locator('[data-tab=business]').click();await finalPage.locator('[data-distribution=orders]').click();assert.equal((await finalRead()).shop.distribution,'orders');
for(let basket=0;basket<3;basket++)for(let i=0;i<3;i++)await finalPage.locator('[data-stock="'+i+'"]').click();await finalPage.locator('#close-panel').click();
async function finalWalk(id){const snap=await finalRead(),f=snap.movement.layout.facilities.find(f=>f.id===id),w=snap.movement.world;await finalPage.touchscreen.tap(f.x/w.width*390,(f.y-30)/w.height*844);await finalPage.evaluate(()=>window.advanceTime(6000));assert.equal((await finalRead()).movement.nearby,id);}
async function finalAct(id){await finalWalk(id);await finalPage.locator('#interact').click();}
await finalAct('rack');assert((await finalRead()).shop.carry);await finalPage.reload();await finalPage.waitForFunction(()=>JSON.parse(window.render_game_to_text()).assetsReady);assert((await finalRead()).shop.carry,'carried bread must survive reload');await finalAct('table');assert.equal((await finalRead()).shop.served,8);
for(let basket=0;basket<3;basket++){await finalAct('pack');await finalPage.evaluate(()=>window.advanceTime(6200));await finalPage.locator('#interact').click();assert.equal((await finalRead()).shop.carry.kind,'parcel');await finalAct('wagon');}
await finalPage.evaluate(()=>window.advanceTime(46000));assert((await finalRead()).goal.completed);assert.match(await finalPage.locator('#dialog').innerText(),/王国人气面包房/);await finalPage.screenshot({animations:'disabled',path:out+'/final-goal.png'});await finalPage.locator('[data-dialog=close]').click();await finalPage.reload();await finalPage.waitForFunction(()=>JSON.parse(window.render_game_to_text()).assetsReady);assert((await finalRead()).goal.completed);assert(!(await finalRead()).paused);assert.equal((await finalRead()).screen,'play');assert.deepEqual(finalErrors,[]);results.push({purchases:6,jamRecipe:true,inventoryDistribution:true,carryReload:true,goalCompletion:true,completionDialogOnlyOnce:true,errors:finalErrors});await finalContext.close();
await fs.writeFile(out+'/browser-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));await browser.close();
