import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fresh,SAVE_KEY} from '../games/workshop/economy.js';
const out='artifacts/workshop/bakery-drops',base=process.env.BASE_URL||'http://127.0.0.1:4173';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],checks=[];
const read=p=>p.evaluate(()=>JSON.parse(render_game_to_text()));
try{
 for(const [width,height] of [[360,800],[390,844],[844,390],[1440,900]]){
  const c=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:width<1000,deviceScaleFactor:1});
  const save=fresh();Object.assign(save,{beacons:2,deliveries:2,collectors:[2,2,2],coins:600});
  await c.addInitScript(({key,save})=>{localStorage.setItem(key,JSON.stringify({...save,savedAt:Date.now()}));localStorage.setItem('demon-bakery-tutorial-v1','{"done":true}');},{key:SAVE_KEY,save});
  const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('response',r=>{if(r.status()>=400)errors.push(r.url()+' '+r.status());});
  await p.goto(base+'/games/workshop/index.html');await p.waitForFunction(()=>window.render_game_to_text&&JSON.parse(render_game_to_text()).assetsReady);await p.evaluate(()=>advanceTime(6400));
  let s=await read(p);assert.equal(s.movement.groundDrops.length,3);assert(s.movement.groundDrops.every(d=>d.count===3&&d.phase==='resting'));
  assert.equal(new Set(s.movement.layout.conveyor.routes.map(r=>r[0].x)).size,3);
  await p.screenshot({path:`${out}/ground-${width}x${height}.png`});
  const drop=s.movement.pickups.find(d=>d.color===0),world=s.movement.world;
  await p.locator('#board').tap({position:{x:drop.x/world.width*width,y:drop.y/world.height*height}});
  for(let i=0;i<160&&(await read(p)).movement.flyingDrops===0;i++)await p.evaluate(()=>advanceTime(50));
  s=await read(p);assert(s.hand.raw[0]>0);assert.equal(s.movement.flyingDrops,3);
  await p.locator('#pause').tap();const frozen=(await read(p)).movement;await p.evaluate(()=>advanceTime(5000));assert.deepEqual((await read(p)).movement.groundDrops,frozen.groundDrops);assert.equal((await read(p)).movement.flyingDrops,3);
  await p.locator('#pause').tap();await p.keyboard.down('ArrowDown');await p.evaluate(()=>advanceTime(400));await p.keyboard.up('ArrowDown');await p.evaluate(()=>advanceTime(3700));s=await read(p);assert.equal(s.movement.flyingDrops,0);assert(s.movement.groundDrops.some(d=>d.color===0&&d.phase==='resting'));
  await p.locator('[data-open=production]').tap();await p.locator('#upgrade-3').tap();await p.locator('#close-panel').tap();await p.evaluate(()=>advanceTime(3200));s=await read(p);assert(s.lineBuilt);assert(s.carts.some(c=>c.color==='gold')&&s.carts.some(c=>c.color==='violet'));await p.screenshot({path:out+'/transport-'+width+'x'+height+'.png'});
  await p.locator('[data-open=orders]').tap();assert.equal(await p.locator('#order-progress').getAttribute('max'),'50');assert(await p.locator('#order-progress-note').innerText());await p.waitForTimeout(250);await p.screenshot({path:`${out}/order-${width}x${height}.png`});
  const sceneArea=await p.locator('#board').evaluate(e=>{const r=e.getBoundingClientRect();return r.width*r.height/(innerWidth*innerHeight);});const panelArea=await p.locator('#management').evaluate(e=>{const r=e.getBoundingClientRect();return r.width*r.height/(innerWidth*innerHeight);});assert(sceneArea>.99&&panelArea<.59);
  checks.push({viewport:[width,height],sceneArea,panelArea,dropSources:3,physicalPickupAndPause:true});await c.close();
 }
 const fastContext=await browser.newContext({viewport:{width:844,height:390}}),fastSave=fresh();Object.assign(fastSave,{lineBuilt:true,beacons:2,deliveries:2,collectors:[8,8,8],dust:[30,0,0],upgrades:{polish:8,rail:0,storage:3}});
 await fastContext.addInitScript(({key,save})=>{localStorage.setItem(key,JSON.stringify({...save,savedAt:Date.now()}));localStorage.setItem('demon-bakery-tutorial-v1','{"done":true}');},{key:SAVE_KEY,save:fastSave});
 const fastPage=await fastContext.newPage();await fastPage.goto(base+'/games/workshop/index.html');await fastPage.waitForFunction(()=>window.render_game_to_text&&JSON.parse(render_game_to_text()).assetsReady);await fastPage.evaluate(()=>advanceTime(3600));const baking=(await read(fastPage)).movement.breadTransits;assert.equal(baking.length,2);assert(Math.abs(baking[0].position.x-baking[1].position.x)>10);await fastPage.screenshot({path:out+'/fast-oven-multiple-breads.png'});checks.push('Upgraded oven keeps two independently moving breads; new bread cannot replace earlier cargo');await fastContext.close();
 assert.deepEqual(errors,[]);await fs.writeFile(out+'/results.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
