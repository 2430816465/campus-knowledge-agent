import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SOLUTIONS} from '../games/marble/puzzle-solutions.js';
const base=process.env.BASE_URL||'http://127.0.0.1:4173';
fs.mkdirSync('output/puzzle-v3/browser',{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url())});
await page.goto(base+'/games/marble/puzzle.html');await page.waitForFunction(()=>window.Puzzle);
const cdp=await context.newCDPSession(page);
async function shoot(deg,ms=9000){
 const o=await page.evaluate(()=>Puzzle.game.level.origin),a=deg*Math.PI/180,r=await page.locator('#board').boundingBox();
 const x=r.x+(o.x+Math.sin(a)*70)*r.width/640,y=r.y+(o.y-Math.cos(a)*70)*r.height/360;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.evaluate(ms=>advanceTime(ms),ms);
}
for(let i=0;i<50;i++){
 await page.locator(`[data-action="chapter:${Math.floor(i/5)}"]`).click();await page.locator(`[data-action="level:${i}"]`).click();
 while(await page.evaluate(()=>!!Puzzle.tutorial))await page.locator('[data-action=tutorialNext]').click();
 if([0,20,26,30,37,47,49].includes(i))await page.screenshot({path:`output/puzzle-v3/browser/room-${i+1}.png`});
 for(const a of SOLUTIONS[i])await shoot(a);
 assert.equal(await page.evaluate(()=>Puzzle.game.phase),'won',`actual touch ${i+1}`);assert.equal(await page.evaluate(()=>Puzzle.game.assistUsed),false);await page.locator('#overlay [data-action=levels]').click();
}
assert.equal(await page.evaluate(()=>Puzzle.meta.unlocked),50);assert.equal(await page.evaluate(()=>Object.keys(Puzzle.meta.best).length),50);
await page.reload();await page.waitForFunction(()=>window.Puzzle);assert.equal(await page.evaluate(()=>Puzzle.meta.unlocked),50);
await page.evaluate(()=>Puzzle.start(26));await shoot(SOLUTIONS[26][0]);assert.deepEqual(await page.evaluate(()=>Puzzle.game.brokenPlates),[0]);
await page.locator('[data-action=pause]').click();await page.reload();await page.locator('[data-action=continue]').click();assert.deepEqual(await page.evaluate(()=>Puzzle.game.brokenPlates),[0]);await page.screenshot({path:'output/puzzle-v3/browser/room-27-mirror-gone.png'});await shoot(SOLUTIONS[26][1]);assert.equal(await page.evaluate(()=>Puzzle.game.phase),'won');
await page.evaluate(()=>Puzzle.start(30));await shoot(SOLUTIONS[30][0],360);assert.equal(await page.evaluate(()=>Puzzle.game.balls.filter(b=>!b.dead).length),2);
await page.locator('[data-action=pause]').click();const frozen=await page.evaluate(()=>JSON.stringify(Puzzle.game.balls));await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>JSON.stringify(Puzzle.game.balls)),frozen);
await page.reload();await page.locator('[data-action=continue]').click();await page.screenshot({path:'output/puzzle-v3/browser/room-31-flight.png'});await page.evaluate(()=>advanceTime(9000));assert.equal(await page.evaluate(()=>Puzzle.game.phase),'won');
for(let i=0;i<50;i++){
 await page.evaluate(i=>Puzzle.start(i),i);await page.locator('[data-action=help]').click();await page.locator('[data-action="ad:route"]').click();
 if(i===0){await page.locator('[data-action=adCancel]').click();assert.equal(await page.evaluate(()=>Puzzle.game.routeHint),false);await page.locator('[data-action="ad:route"]').click();await page.locator('[data-action=adFail]').click();assert.equal(await page.evaluate(()=>Puzzle.game.routeHint),false);await page.locator('[data-action="ad:route"]').click()}
 await page.locator('[data-action=adComplete]').click();assert.ok(await page.evaluate(()=>Puzzle.game.route()));
 if([20,26,30,37,49].includes(i))await page.screenshot({path:`output/puzzle-v3/browser/room-${i+1}-hint.png`});
 for(const a of SOLUTIONS[i]){assert.ok(await page.evaluate(()=>Puzzle.game.route()));await shoot(a)}assert.equal(await page.evaluate(()=>Puzzle.game.phase),'won',`hint touch ${i+1}`);
}
await page.evaluate(()=>Puzzle.start(49));await page.locator('[data-action=help]').click();await page.locator('[data-action="ad:route"]').click();await page.locator('[data-action=adComplete]').click();await page.reload();await page.locator('[data-action=continue]').click();assert.equal(await page.evaluate(()=>Puzzle.game.routeHint),true);
await page.evaluate(()=>{while(Puzzle.game.phase==='aim')Puzzle.game.fireComplete(0);advanceTime(0)});assert.equal(await page.evaluate(()=>Puzzle.game.phase),'failed');await page.locator('#overlay [data-action=help]').click();await page.getByRole('button',{name:'免费重置并显示路线',exact:true}).click();assert.equal(await page.evaluate(()=>Puzzle.game.used),0);assert.ok(await page.evaluate(()=>Puzzle.game.route()));
await page.locator('[data-action=help]').click();await page.locator('[data-action="ad:extra"]').click();await page.locator('[data-action=adComplete]').click();assert.equal(await page.evaluate(()=>Puzzle.game.boostUsed),true);assert.equal(await page.evaluate(()=>Puzzle.game.routeHint),true);await page.evaluate(()=>Puzzle.start(0));assert.equal(await page.evaluate(()=>Puzzle.game.routeHint),false);
assert.deepEqual(errors,[]);console.log('PASS all 50 actual touch free clears + 50 rewarded hints, unlock/save, mirror save, branch flight save/resume, pause, cancel/fail/reset/extra reward; zero page/resource errors');await browser.close();
await import('./puzzle-v3-layout.mjs');
