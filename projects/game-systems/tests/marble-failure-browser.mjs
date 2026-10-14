import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/24308/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const browser=await chromium.launch({headless:true}),errors=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4173/games/marble/index.html');await page.locator('[data-action="new"]').click();await page.evaluate(async()=>{const {MarbleGame:Old}=await import('./state-v2.js');Old.prototype.newRun.call(Marble,42);advanceTime(0)});
 await page.evaluate(()=>{Marble.run.hp=1;Marble.run.room.enemies[0].clock=1;Marble.shoot(1.1);Marble.earlyRecall();advanceTime(0)});
 assert.equal(await page.evaluate(()=>Marble.run.phase),'failed');await page.screenshot({path:'artifacts/marble/failure.png',fullPage:true});
 await page.locator('[data-action="freeUndo"]').click();assert.equal(await page.evaluate(()=>Marble.run.phase),'aim');assert.equal(await page.evaluate(()=>Marble.run.help.freeUndo),1);
 await page.evaluate(()=>{Marble.run.hp=1;Marble.run.room.enemies[0].clock=1;Marble.shoot(1.1);Marble.earlyRecall();advanceTime(0)});assert.equal(await page.evaluate(()=>Marble.run.phase),'failed');
 await page.locator('[data-action="rescue"]').click();await page.locator('#ad-result').selectOption('cancel');await page.locator('[data-action="adStart"]').click();await page.waitForTimeout(850);assert.equal(await page.evaluate(()=>Marble.run.help.rescue),0);
 await page.locator('[data-action="rescue"]').click();await page.locator('[data-action="adStart"]').click();await page.waitForFunction(()=>Marble.run.help.rescue===1);assert.equal(await page.evaluate(()=>Marble.run.hp),12);assert.equal(await page.evaluate(()=>Marble.run.phase),'aim');assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,errors}));await context.close();
}finally{await browser.close()}
