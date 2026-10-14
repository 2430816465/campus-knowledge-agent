import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true}),errors=[];
try{
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/games/liars/index.html');await page.locator('[data-do="match"]').click();await page.waitForFunction(()=>JSON.parse(render_game_to_text()).screen==='playing',{timeout:15000});
 const read=()=>page.evaluate(()=>JSON.parse(render_game_to_text()));let before=await read();
 if(before.game.turn===before.seat){await page.locator('.card').first().click();await page.locator('[data-do="play"]').click();await page.waitForFunction(rev=>JSON.parse(render_game_to_text()).game.revision>rev,before.game.revision);before=await read();}
 assert.notEqual(before.game.turn,before.seat);assert.equal(before.countdown.seat,before.game.turn);
 await page.waitForTimeout(2500);await page.screenshot({path:'artifacts/liars-turn-focus/live-playing.png'});
 await page.waitForFunction(rev=>JSON.parse(render_game_to_text()).game.revision>rev,before.game.revision,{timeout:15000});const after=await read(),wait=after.game.phaseAt-before.game.phaseAt;
 assert.ok(wait>=3000&&wait<=13000,String(wait));assert.deepEqual(errors,[]);
 const result={passed:true,url:'http://127.0.0.1:4173/',actualBotResponseMs:wait,currentSeatClock:true,errors};await writeFile('artifacts/liars-turn-focus/live-preview.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
