import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
await fs.mkdir('output/fullscreen',{recursive:true});
const browser=await chromium.launch({headless:true});
for(const [width,height] of [[667,375],[844,390],[915,412],[1280,720]]){
 const page=await browser.newPage({viewport:{width,height},hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/');await page.locator('[data-action="mode:marble"]').click();await page.locator('[data-action=preview]').click();
 const game=page.frameLocator('iframe.game-frame');await game.locator('[data-action=new]').click();await page.waitForTimeout(150);
 assert.equal(await page.locator('.game-toolbar').count(),0);
 const box=await game.locator('#board').boundingBox();const ratio=box.width*box.height/(width*height);assert.ok(ratio>=.8,JSON.stringify({box,ratio}));
 assert.ok(await game.locator('.arena-sidebar').isHidden());await page.screenshot({path:`output/fullscreen/arena-${width}.png`});
 await game.locator('[data-action=togglePanel]').first().click();assert.ok(await game.locator('.arena-sidebar').isVisible());assert.deepEqual(await game.locator('#board').boundingBox(),box);
 await page.screenshot({path:`output/fullscreen/settings-${width}.png`});
 await game.locator('[aria-label="收起设置"]').last().click();
 const cdp=await page.context().newCDPSession(page),x=box.x+box.width*.5,y=box.y+box.height*.9;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-50,y:box.y+box.height*.45}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const frame=page.frames().find(f=>f.url().includes('/games/marble/'));assert.equal(await frame.evaluate(()=>Marble.run.phase),'flight');
 await game.locator('[data-action=togglePanel]').first().click();const state=await frame.evaluate(()=>JSON.stringify(Marble.run.volley));await page.waitForTimeout(250);assert.equal(await frame.evaluate(()=>JSON.stringify(Marble.run.volley)),state);
 await game.locator('[aria-label="收起设置"]').last().click();await frame.evaluate(()=>advanceTime(8500));
 await game.locator('[data-action=pause]').click();await game.locator('[data-action=save]').click();await page.waitForTimeout(150);assert.equal(await page.locator('iframe.game-frame').count(),0);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({width,height,fieldPercent:Math.round(ratio*100),drawerKeepsFieldSize:true,touchLaunch:true,drawerPausesFlight:true,exit:true}));await page.close();
}
await browser.close();
