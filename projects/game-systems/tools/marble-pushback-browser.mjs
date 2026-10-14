import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='output/endless-pushback/browser';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),reports=[];
try{
 for(const [name,url] of [['camp','http://127.0.0.1:4173/games/marble/index.html'],['standalone','http://127.0.0.1:4180/']]){
  const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,deviceScaleFactor:2}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
  await page.goto(url);await page.locator('[data-action=new]').tap();
  await page.evaluate(()=>{Marble.newRun(77);const r=Marble.run;r.shot=30;r.hp=4;r.xp=12;for(const e of r.room.enemies)e.y=80+(e.y-24)*1.7;Marble.spawnBoss();const boss=r.room.enemies.find(e=>e.type==='boss');boss.y=280;boss.rushIn=1;boss.armor=70;r.nextBoss=39;Marble.notice='底部积压 · 击退可腾出空间';Marble.persist();advanceTime(0)});
  const before=await page.evaluate(()=>JSON.parse(render_game_to_text())),b=await page.locator('#board').boundingBox();assert(b.width*b.height/(844*390)>.8);
  await page.screenshot({path:`${out}/${name}-before.png`});
  await page.locator('[data-action=togglePanel]').first().tap();const free=page.locator('[data-action=pushback]');await free.scrollIntoViewIfNeeded();
  const buttonBox=await free.boundingBox();assert(buttonBox.height>=44);assert(buttonBox.y>=0&&buttonBox.y+buttonBox.height<=390);assert((await page.locator('.pushback-support').innerText()).includes('免费 2/2'));
  await page.screenshot({path:`${out}/${name}-free-menu.png`});await free.tap();
  const afterFree=await page.evaluate(()=>JSON.parse(render_game_to_text()));assert.equal(afterFree.pushback.freeUsed,1);assert.equal(afterFree.player.hp,4);assert.equal(afterFree.xp,12);assert.equal(afterFree.shot,30);
  for(const e of before.enemies){const now=afterFree.enemies.find(x=>x.id===e.id);assert(Math.abs(now.y-Math.max(e.r+4,e.y*.5))<.11);assert.equal(now.x,e.x);if(e.type==='boss'){assert.equal(now.hp,e.hp);assert.equal(now.armor,e.armor);assert.equal(now.actsIn,1)}}
  assert(!await page.locator('#arena-settings').isVisible());assert(!afterFree.supportUsed);await page.waitForTimeout(150);await page.screenshot({path:`${out}/${name}-after-free.png`});
  await page.reload();await page.locator('[data-action=continue]').tap();assert.equal(await page.evaluate(()=>Marble.run.pushback.freeUsed),1);
  await page.locator('[data-action=togglePanel]').first().tap();await page.locator('[data-action=pushback]').tap();
  assert.equal(await page.evaluate(()=>Marble.run.pushback.freeUsed),2);
  await page.locator('[data-action=togglePanel]').first().tap();await page.locator('[data-action=pushbackAd]').tap();
  assert((await page.locator('.ad-preview').innerText()).includes('剩余 2 次'));await page.locator('[data-action=close]').tap();assert.equal(await page.evaluate(()=>Marble.run.pushback.adUsed),0);
  await page.locator('[data-action=pushbackAd]').tap();await page.locator('#ad-result').selectOption('cancel');await page.locator('[data-action=adStart]').tap();await page.waitForTimeout(850);
  assert.equal(await page.evaluate(()=>Marble.run.pushback.adUsed),0);assert.equal(await page.evaluate(()=>Marble.run.help.records.length),2);
  await page.locator('[data-action=pushbackAd]').tap();await page.locator('[data-action=adStart]').tap();await page.waitForTimeout(850);
  assert.equal(await page.evaluate(()=>Marble.run.pushback.adUsed),1);assert(!await page.locator('#arena-settings').isVisible());
  await page.locator('[data-action=togglePanel]').first().tap();await page.locator('[data-action=pushbackAd]').tap();
  await page.reload();await page.locator('[data-action=continue]').tap();assert.equal(await page.evaluate(()=>Marble.run.pushback.adUsed),1);
  await page.locator('[data-action=togglePanel]').first().tap();await page.locator('[data-action=pushbackAd]').tap();await page.locator('#ad-result').selectOption('showFail');await page.locator('[data-action=adStart]').tap();await page.waitForTimeout(850);
  const exhausted=await page.evaluate(()=>JSON.parse(render_game_to_text()));assert.deepEqual(exhausted.pushback,{freeUsed:2,adUsed:2,freeRemaining:0,adRemaining:0});assert.equal(exhausted.help.used,2);assert.equal(exhausted.help.records.length,4);assert(exhausted.notice.includes('兜底'));assert.equal(exhausted.enemies.find(e=>e.type==='boss').actsIn,1);
  await page.locator('[data-action=togglePanel]').first().tap();assert(await page.locator('[data-action=pushbackAd]').isDisabled());assert(await page.locator('[data-action=freeze]').isEnabled());assert(await page.locator('[data-action=extraChoice]').isEnabled());
  await page.screenshot({path:`${out}/${name}-exhausted-menu.png`});
  await page.reload();await page.locator('[data-action=continue]').tap();assert.equal(await page.evaluate(()=>Marble.run.pushback.adUsed),2);
  await page.evaluate(()=>{Marble.newRun(86);advanceTime(0)});assert.deepEqual(await page.evaluate(()=>Marble.run.pushback),{freeUsed:0,adUsed:0});
  const drag=await page.locator('#board').boundingBox();await page.mouse.move(drag.x+drag.width*.5,drag.y+drag.height*.85);await page.mouse.down();await page.mouse.move(drag.x+drag.width*.3,drag.y+drag.height*.25,{steps:5});await page.mouse.up();
  assert.equal(await page.evaluate(()=>Marble.run.phase),'flight');await page.locator('[data-action=togglePanel]').first().tap();assert(await page.locator('[data-action=pushback]').isDisabled());assert(!await page.evaluate(()=>Marble.canAdHelp('pushback')));
  await page.locator('[data-action=togglePanel]').last().tap();await page.evaluate(()=>advanceTime(8500));assert.equal(await page.evaluate(()=>Marble.run.shot),1);
  await page.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen()});const sizes=[];for(const [width,height] of [[720,360],[1280,720]]){await page.setViewportSize({width,height});await page.locator('[data-action=togglePanel]').first().tap();await page.locator('[data-action=pushback]').scrollIntoViewIfNeeded();const box=await page.locator('[data-action=pushback]').boundingBox();assert(box.height>=44&&box.y>=0&&box.y+box.height<=height);sizes.push({width,height,button:box});await page.screenshot({path:`${out}/${name}-${width}x${height}-menu.png`});await page.locator('[data-action=togglePanel]').last().tap()}
  assert.deepEqual(errors,[]);reports.push({name,beforeEnemies:before.enemies.length,fieldPercent:b.width*b.height/(844*390)*100,afterFree:afterFree.pushback,exhausted:exhausted.pushback,records:exhausted.help.records,buttonBox,sizes,errors});await page.close();
 }
 await fs.writeFile(`${out}/report.json`,JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
}finally{await browser.close()}
