import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/24308/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const browser=await chromium.launch({headless:true}),errors=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(const mode of ['tower','mine']){
  await page.goto('http://127.0.0.1:4173');await page.locator(`[data-action="mode:${mode}"]`).last().click();await page.locator('[data-action="preview"]').click();
  await page.locator('iframe.game-frame').waitFor();await page.waitForFunction(mode=>document.querySelector('iframe.game-frame')?.contentWindow?.location?.pathname.includes('/games/'+mode+'/'),mode);
  await page.locator('[data-action="menu"]').click();await page.locator('[data-action="exit-game"]').click();await page.locator('[data-action="exit-confirm"]').click();
 }
 await page.goto('http://127.0.0.1:4173');await page.locator('[data-action="mode:coop"]').last().click();assert(await page.locator('[data-action="create-room"]').isVisible());
 for(const [width,height] of [[360,800],[390,844],[844,390],[1440,900]]){
  await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:4173');await page.locator('[data-action="mode:marble"]').last().click();await page.locator('[data-action="preview"]').click();const f=page.frameLocator('iframe.game-frame');const enter=f.locator('[data-action="new"], [data-action="continue"]');await enter.first().waitFor();await enter.first().click();
  const host=await page.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);const child=await page.frame({url:/games\/marble/}).evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);assert(host[0]<=host[1]+1,`host overflow at ${width}x${height}: ${host}`);assert(child[0]<=child[1]+1,`marble overflow at ${width}x${height}: ${child}`);
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,otherModes:['tower','mine','coop prepare'],viewports:4,errors}));await context.close();
}finally{await browser.close()}
