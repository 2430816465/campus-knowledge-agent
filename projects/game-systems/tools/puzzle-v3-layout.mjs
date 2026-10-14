import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('output/puzzle-v3/browser',{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[];
for(const viewport of [{width:667,height:375},{width:915,height:412},{width:390,height:844}]){
 // Fresh desktop context avoids resizing a native fullscreen window from touch tests.
 const page=await browser.newPage({viewport});page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.BASE_URL||'http://127.0.0.1:4173')+'/games/marble/puzzle.html?review=1');await page.waitForFunction(()=>window.Puzzle);
 assert.equal(await page.locator('[data-action^="chapter:"]').count(),10);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('[data-action="chapter:9"]').click();await page.screenshot({path:`output/puzzle-v3/browser/menu-${viewport.width}.png`});await page.locator('[data-action="level:49"]').click();assert.equal(await page.evaluate(()=>Puzzle.game.index),49);
 if(viewport.width>viewport.height){const b=await page.locator('#board').boundingBox();assert.ok(b.width*b.height/(viewport.width*viewport.height)>.8)}
 await page.close();
}
assert.deepEqual(errors,[]);await browser.close();console.log('PASS ten chapters, last-room access, three menu sizes, no overflow and >80% landscape playfield');
