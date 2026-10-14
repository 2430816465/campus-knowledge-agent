import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'))}catch{({chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/24308/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'))}
const browser=await chromium.launch({headless:true}),results=[];
try{
 for(const [width,height] of [[390,844],[360,800]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:2,reducedMotion:'reduce'}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const tap=a=>page.locator(`[data-action="${a}"]`).first().tap();
  await page.goto('http://127.0.0.1:4173');await tap('mode:coop');await tap('create-room');await tap('demo-peer');await tap('ready');await tap('preview');
  await page.setViewportSize({width:844,height:390});const bottom=await page.locator('.preview-bottom').boundingBox();assert(bottom.y+bottom.height<=390);await tap('menu');await tap('menu-help');await tap('close');assert.equal(await page.locator('#dialog-title').textContent(),'冒险菜单');await tap('close');
  await page.setViewportSize({width,height});await tap('finish:win');await tap('ad');await page.waitForFunction(()=>!document.querySelector('dialog').open);assert(await page.locator('[data-action="ad"]').isDisabled());await tap('nav:home');await tap('nav:tasks');await tap('claim:first');assert(await page.locator('[data-action="none"]').isDisabled());await tap('nav:home');await tap('shop');await tap('product:scarf');await tap('buy:scarf');await tap('nav:collection');await tap('equip:scarf');assert(await page.locator('.identity .portrait.red').count());
  await page.waitForTimeout(3300);await page.screenshot({path:`artifacts/polish/touch-equipped-${width}.png`});assert.deepEqual(errors,[]);results.push(`${width}×${height}, DPR 2, touch emulation: co-op, rotation, nested menu, reward, claim, buy and equip passed`);await context.close();
 }
 await writeFile('artifacts/polish/touch-verification.json',JSON.stringify({time:new Date().toISOString(),checks:results,physicalDevice:false},null,2));console.log(results.join('\n'));
}finally{await browser.close()}
