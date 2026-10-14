import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
const reports=[];
try{
 for(const standalone of process.env.ONLY_CAMP?[false]:[false,true]){
  const page=await browser.newPage({viewport:{width:844,height:390}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
  await page.goto(standalone?'http://127.0.0.1:4180/':(process.env.BASE_URL||'http://127.0.0.1:4173')+'/');
  let frame=page;if(!standalone){await page.locator('[data-action="mode:marble"]').click();await page.locator('[data-action=preview]').click();await page.frameLocator('iframe.game-frame').locator('[data-action=puzzle]').waitFor({state:'attached'});frame=page.frames().find(f=>f.url().includes('/games/marble/'))}
  await frame.waitForFunction(()=>window.Marble);
  const entry=frame.locator('[data-action=puzzle]');
  if(!await entry.isVisible()){const select=frame.locator('.fit-pager select').first(),options=await select.locator('option').evaluateAll(es=>es.map(e=>e.value));for(const value of options){await select.selectOption(value);if(await entry.isVisible())break;}}
  assert(await entry.isVisible());await entry.click();await frame.waitForFunction(()=>window.Puzzle);await frame.locator('[data-action="level:0"]').first().click();while(await frame.evaluate(()=>!!Puzzle.tutorial))await frame.locator('[data-action=tutorialNext]').click();
  const box=await frame.locator('#board').boundingBox();assert(box.width*box.height/(844*390)>.8);
  await frame.evaluate(()=>Puzzle.game.shoot(-.9));await frame.locator('[data-action=pause]').click();const before=await frame.evaluate(()=>JSON.stringify(Puzzle.game.ball));await page.waitForTimeout(150);assert.equal(await frame.evaluate(()=>JSON.stringify(Puzzle.game.ball)),before);await frame.locator('[data-action=close]').click();await frame.evaluate(()=>advanceTime(9000));await frame.evaluate(()=>Puzzle.act('levels'));await frame.locator('[data-action=home]').click();await frame.waitForFunction(()=>window.Marble);await frame.locator('[data-action=new]').click();assert.equal(await frame.evaluate(()=>Marble.run.version),4);
  assert.deepEqual(errors,[]);reports.push({standalone,entry:true,pause:true,endlessReturn:true,errors});await page.close();
 }
 const p=await browser.newPage();await p.goto((process.env.BASE_URL||'http://127.0.0.1:4173')+'/games/marble/puzzle.html?review=1');await p.locator('[data-action="level:0"]').click();await p.waitForTimeout(250);const intro=await p.locator('[data-action=tutorialNext]').boundingBox();const b=await p.locator('#board').boundingBox();console.log({intro,canvas:b});await p.screenshot({path:'output/puzzle-normal-v2/browser/tutorial.png'});await p.close();
 await fs.writeFile('output/puzzle-normal-v2/browser/entry-report.json',JSON.stringify(reports,null,2));console.log(reports);
}finally{await browser.close()}

