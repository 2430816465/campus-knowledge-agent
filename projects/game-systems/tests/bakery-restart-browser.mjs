import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fresh,SAVE_KEY,RECIPES} from '../games/workshop/economy.js';
const out='artifacts/workshop/restart',base=process.env.BASE_URL||'http://127.0.0.1:4173';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],checks=[];
const read=p=>p.evaluate(()=>JSON.parse(render_game_to_text()));
try{
 for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  const c=await browser.newContext({viewport,hasTouch:true,isMobile:true});
  const save=fresh();save.lineBuilt=true;save.coins=3000;save.beacons=5;save.deliveries=5;save.collectors=[6,5,4];save.goods=[50,40,30,2];save.dust=[4,3,2];save.upgrades={rail:3,polish:4,storage:2};save.recipe=2;save.elapsed=1600;save.offlineBonus=45;save.adBoost=20;save.adCooldown=110;
  Object.keys(save.shop.facilities).forEach(k=>save.shop.facilities[k]=1);
  Object.assign(save.shop,{served:7,trips:2,stock:[4,3,2,1],flour:8,jam:5,carry:{kind:'bread',recipe:2},packJob:{t:4,value:200},parcels:[{value:200}],load:[{value:200}],trip:{t:30,value:600}});
  await c.addInitScript(({save,key})=>{if(!sessionStorage.getItem('restart-fixture')){localStorage.setItem(key,JSON.stringify(save));localStorage.setItem('demon-bakery-click-tutorial-v2','{"done":true}');localStorage.setItem('adventure-camp-demo-v1','{"coins":777,"claimed":["workshop-beacon-1"]}');localStorage.setItem('another-game-test','keep');sessionStorage.setItem('restart-fixture','1');}},{save,key:SAVE_KEY});
  const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('response',r=>{if(r.status()>=400)errors.push(r.url()+' '+r.status());});
  await p.goto(base+'/games/workshop/index.html');await p.waitForFunction(()=>window.render_game_to_text&&JSON.parse(render_game_to_text()).assetsReady);
  if(await p.locator('#dialog').isVisible())await p.locator('[data-dialog=close]').tap();
  await p.locator('#pause').tap();
  await p.locator('[data-open=settings]').tap();await p.evaluate(()=>ScreenPages.reveal(document.querySelector('#restart')));await p.locator('#restart').tap();
  const before=await read(p);assert.match(await p.locator('#dialog').innerText(),/堂食和外卖/);
  await p.screenshot({path:`${out}/confirm-${viewport.width}.png`});
  await p.locator('[data-dialog=close]').tap();
  const canceled=await read(p);assert.equal(canceled.coins,before.coins);assert.deepEqual(canceled.shop,before.shop);assert.equal(canceled.beacons,5);assert(canceled.paused);
  await p.evaluate(()=>ScreenPages.reveal(document.querySelector('#restart')));await p.locator('#restart').tap();await p.locator('[data-dialog=reset]').tap();
  const s=await read(p),initial=fresh();assert.equal(s.screen,'play');assert.equal(s.panelOpen,false);assert.equal(s.paused,false);assert.equal(s.coins,0);assert.equal(s.beacons,0);assert.equal(s.deliveries,0);assert.deepEqual(s.collectors,initial.collectors);assert.deepEqual(s.goods,initial.goods);assert.deepEqual(s.dust,initial.dust);assert.deepEqual(s.upgrades,initial.upgrades);assert.equal(s.recipe,RECIPES[initial.recipe].id);assert.equal(s.job,null);assert.deepEqual(s.carts,[]);assert.deepEqual(s.shop,initial.shop);assert.equal(s.offlineBonus,0);assert.equal(s.adBoost,0);assert.equal(s.adCooldown,0);assert.equal(s.movement.flyingDrops,0);assert.deepEqual(s.movement.breadTransits,[]);assert.deepEqual(s.tutorial,{active:true,step:0});
  const storage=await p.evaluate(key=>({game:JSON.parse(localStorage.getItem(key)),camp:localStorage.getItem('adventure-camp-demo-v1'),other:localStorage.getItem('another-game-test')}),SAVE_KEY);
  assert.equal(storage.game.coins,0);assert.deepEqual(storage.game.shop,initial.shop);assert.equal(storage.camp,'{"coins":777,"claimed":["workshop-beacon-1"]}');assert.equal(storage.other,'keep');
  await p.screenshot({path:`${out}/fresh-${viewport.width}.png`});
  await p.reload();await p.waitForFunction(()=>window.render_game_to_text&&JSON.parse(render_game_to_text()).assetsReady);
  assert.deepEqual((await read(p)).tutorial,{active:true,step:0});assert.equal((await read(p)).beacons,0);assert.equal((await read(p)).coins,0);
  await p.locator('#guide-action').tap();await p.locator('#sweep').tap();await p.evaluate(()=>advanceTime(10000));assert.equal((await read(p)).tutorial.step,2);assert.equal((await read(p)).paused,false);
  await p.locator('#guide-skip').tap();await p.locator('[data-open=settings]').tap();await p.evaluate(()=>ScreenPages.reveal(document.querySelector('#help')));await p.locator('#help').tap();await p.evaluate(()=>ScreenPages.reveal(document.querySelector('[data-dialog=rebuild]')));await p.locator('[data-dialog=rebuild]').tap();await p.locator('[data-dialog=reset]').tap();assert.deepEqual((await read(p)).tutorial,{active:true,step:0});assert.equal((await read(p)).panelOpen,false);
  checks.push({viewport,cancelRetainsProgress:true,pausedRestartResumes:true,newSaveSurvivesReload:true,tutorialPlayable:true,otherGamesPreserved:true,legacyHelpEntry:true});await c.close();
 }
 assert.deepEqual(errors,[]);await fs.writeFile(out+'/results.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
