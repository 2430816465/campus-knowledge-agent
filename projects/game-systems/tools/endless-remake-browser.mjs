import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const output='artifacts/endless-remake-20261001';await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true}),reports=[];
for(const [width,height] of [[844,390],[720,360],[1280,720],[390,844]]){
 const page=await browser.newPage({viewport:{width,height},hasTouch:true,deviceScaleFactor:2}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url())});
 await page.goto((process.env.BASE_URL||'http://127.0.0.1:4194')+'/games/marble/index.html');await page.locator('[data-action=codex]').click();assert.match(await page.locator('.dialog').innerText(),/余烬构筑图鉴/);await page.locator('[data-action=close]').click();assert.equal(await page.locator('[data-action=new]').count(),1);
 await page.locator('[data-action=new]').click();await page.waitForTimeout(100);const box=await page.locator('#board').boundingBox();assert(Math.abs(box.width/box.height-640/360)<.01);assert(box.x>=-.5&&box.y>=-.5&&box.x+box.width<=width+.5&&box.y+box.height<=height+.5);
 await page.screenshot({path:`${output}/battle-${width}.png`});
 if(width>height){
  const session=await page.context().newCDPSession(page);const x=box.x+box.width*.5,y=box.y+box.height*.86;
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-box.width*.07,y:box.y+box.height*.3}]});await page.screenshot({path:`${output}/aim-${width}.png`});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await page.evaluate(()=>Marble.run.phase),'flight');await page.evaluate(()=>window.testCanvas=document.querySelector('#board'));await page.waitForTimeout(300);assert(await page.evaluate(()=>testCanvas===document.querySelector('#board')));await page.evaluate(()=>advanceTime(8500));
  if(await page.locator('[data-action^="choose:"]').count())await page.locator('[data-action^="choose:"]').first().click();
  await page.locator('[data-action=pause]').click();const seconds=await page.evaluate(()=>Marble.run.activeSeconds);await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>Marble.run.activeSeconds),seconds);await page.locator('[data-action=resume]').click();
  await page.locator('[data-action=togglePanel]').first().click();await page.locator('[data-action=lowFx]').click();assert.equal(await page.evaluate(()=>Marble.lowEffects),true);await page.locator('[data-action=freeze]').click();await page.locator('#ad-result').selectOption('cancel');await page.locator('[data-action=adStart]').click();await page.waitForTimeout(850);assert.equal(await page.evaluate(()=>Marble.run.supportUsed),false);
 }
 await page.evaluate(()=>{Marble.newRun(82);Marble.run.selections=2;Marble.makeOffer('upgrade');Marble.run.offer=[{id:'extra',tier:0},{id:'fire',tier:2},{id:'pierce',tier:3}];Marble.persist();advanceTime(0)});
 await page.waitForTimeout(400);await page.screenshot({path:`${output}/cards-${width}.png`});
 if(width>height){for(const card of await page.locator('.pick-power').all()){const b=await card.boundingBox();assert(b.x>=0&&b.x+b.width<=width&&b.y>=0&&b.y+b.height<=height)}const reroll=await page.locator('[data-action=reroll]').boundingBox();assert(reroll.width<140);}
 await page.locator('[data-action="tierAd:extra"]').click();await page.locator('[data-action=adStart]').click();await page.waitForTimeout(850);assert.equal(await page.evaluate(()=>Marble.run.offer[0].tier),1);await page.locator('[data-action="choose:fire"]').click();assert.equal(await page.evaluate(()=>Marble.run.offerType),'imprint');await page.waitForTimeout(400);await page.screenshot({path:`${output}/imprint-${width}.png`});await page.locator('[data-action="imprint:spark"]').click();assert.equal(await page.evaluate(()=>Marble.run.fireBranch),'spark');
 await page.reload();await page.locator('[data-action=continue]').click();assert.equal(await page.evaluate(()=>Marble.run.fireBranch),'spark');assert.equal(await page.evaluate(()=>Marble.lowEffects),width>height);
 await page.evaluate(()=>{Marble.run.shot=15;Marble.spawnBoss();Marble.run.room.enemies.find(e=>e.type==='boss').rushIn=1;Marble.persist();advanceTime(0)});await page.screenshot({path:`${output}/boss-${width}.png`});
 const state=await page.evaluate(()=>JSON.parse(render_game_to_text()));assert(state.enemies.some(e=>e.type==='boss'&&e.actsIn===1));
 await page.evaluate(()=>{Marble.finish();advanceTime(0)});await page.locator('[data-action=codex]').click();assert.match(await page.locator('.endless-codex').innerText(),/连环火花/);await page.locator('[data-action=close]').click();await page.locator('[data-action=claim]').click();assert.equal(await page.evaluate(()=>Marble.run.claimed),true);
 assert.deepEqual(errors,[]);reports.push({width,height,box,errors,branch:state.fireBranch});await page.close();
}
await fs.writeFile(`${output}/browser-report.json`,JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));await browser.close();
