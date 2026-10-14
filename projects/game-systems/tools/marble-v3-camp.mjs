import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
try{
 await page.goto('http://127.0.0.1:4173/');
 await page.locator('[data-action="mode:marble"]').click();
 await page.locator('[data-action="preview"]').click();
 const frame=page.frameLocator('iframe.game-frame');
 await frame.locator('[data-action="new"]').click();
 const game=page.frame({url:/games\/marble/});
 await game.evaluate(()=>{window.Marble.shoot(-.5);window.advanceTime(8500)});
 await frame.locator('[data-action^="choose:"]').first().waitFor();
 assert.equal(await game.evaluate(()=>window.Marble.run.roomsCleared),1);
 await frame.locator('[data-action^="choose:"]').first().click();
 await game.evaluate(()=>{document.querySelector('[data-action="pause"]').click();document.querySelector('[data-action="end"]').click()});
 assert.equal(await game.evaluate(()=>window.Marble.reward()),2);
 await game.evaluate(()=>document.querySelector('[data-action="claim"]').click());
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('adventure-camp-demo-v1')).runs.some(r=>r.mode==='marble'&&r.reward===2));
 const first=await page.evaluate(()=>JSON.parse(localStorage.getItem('adventure-camp-demo-v1')));
 assert.equal(first.coins,162);
 await game.evaluate(()=>{document.querySelector('[data-action="bonus"]').click();document.querySelector('#ad-result').value='complete';document.querySelector('[data-action="adStart"]').click()});
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('adventure-camp-demo-v1')).coins===163);
 await page.reload();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('adventure-camp-demo-v1')).coins),163);
 assert.deepEqual(errors,[]);
 console.log('V3 camp wallet: base +2, optional bonus +1, reload idempotent; errors 0');
}finally{await browser.close()}
