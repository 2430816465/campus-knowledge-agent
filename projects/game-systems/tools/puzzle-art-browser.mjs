import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SOLUTIONS} from '../games/marble/puzzle-solutions.js';
const out='output/puzzle-art-v1/browser';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],seen=new Set();
const page=await browser.newPage({viewport:{width:915,height:412}});
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url())});
await page.goto('http://127.0.0.1:4173/games/marble/puzzle.html?review=1');await page.waitForFunction(()=>window.Puzzle);
for(let i=0;i<50;i++){
 await page.evaluate(i=>Puzzle.start(i),i);
 while(await page.evaluate(()=>!!Puzzle.tutorial)){
  const id=await page.evaluate(()=>Puzzle.tutorial);seen.add(id);
  assert.equal(await page.evaluate(()=>Puzzle.game.used),0);assert.equal(await page.evaluate(()=>Puzzle.game.assistUsed),false);
  assert.ok(await page.locator('.tutorial-art img').evaluate(img=>img.complete&&img.naturalWidth));
  const before=await page.evaluate(()=>JSON.stringify(Puzzle.game));await page.evaluate(()=>advanceTime(9000));
  assert.equal(await page.evaluate(()=>JSON.stringify(Puzzle.game)),before,'guide must pause and preserve game');
  await page.screenshot({path:`${out}/tutorial-${id}.png`});await page.locator('[data-action=tutorialNext]').click();
 }
 if([0,5,9,13,16,20,26,30,40,46,49].includes(i))await page.screenshot({path:`${out}/level-${i+1}.png`});
}
assert.equal(seen.size,19);assert.equal(await page.evaluate(()=>Object.keys(Puzzle.meta.tutorialSeen).length),19);
await page.evaluate(()=>Puzzle.start(30));await page.locator('[data-action=tutorial]').click();
assert.equal(await page.evaluate(()=>Puzzle.tutorial),'shoot');await page.locator('[data-action=tutorialSkip]').click();
assert.equal(await page.evaluate(()=>Puzzle.tutorial),null);assert.equal(await page.evaluate(()=>Puzzle.game.used),0);
await page.locator('[data-action=help]').click();await page.locator('#overlay [data-action=tutorial]').click();await page.locator('[data-action=tutorialSkip]').click();assert.equal(await page.evaluate(()=>JSON.parse(render_game_to_text()).view),'help');await page.locator('[data-action=close]').click();
await page.reload();await page.waitForFunction(()=>window.Puzzle);await page.locator('[data-action=continue]').click();assert.equal(await page.evaluate(()=>Puzzle.tutorial),null);
await page.evaluate(a=>{Puzzle.game.shoot(a*Math.PI/180);advanceTime(340)},SOLUTIONS[30][0]);assert.equal(await page.evaluate(()=>Puzzle.game.balls.filter(b=>!b.dead).length),2);await page.evaluate(()=>Puzzle.act('pause'));await page.screenshot({path:`${out}/split-flight-paused.png`});await page.locator('[data-action=close]').click();await page.evaluate(()=>advanceTime(9000));assert.equal(await page.evaluate(()=>Puzzle.game.phase),'won');
await page.evaluate(()=>{Puzzle.start(49);Puzzle.game.routeHint=true;Puzzle.act('close')});await page.screenshot({path:`${out}/level-50-route.png`});
await page.close();
for(const viewport of [{width:667,height:375},{width:390,height:844},{width:1280,height:720}]){
 const p=await browser.newPage({viewport});p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:4173/games/marble/puzzle.html?review=1');await p.waitForFunction(()=>window.Puzzle);await p.evaluate(()=>Puzzle.start(46));
 let n=0;while(await p.evaluate(()=>!!Puzzle.tutorial)){
  const id=await p.evaluate(()=>Puzzle.tutorial);const b=await p.locator('[data-action=tutorialNext]').boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=viewport.width&&b.y+b.height<=viewport.height,'visible tutorial action '+viewport.width+' '+id);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(['shoot','compound'].includes(id))await p.screenshot({path:`${out}/${id}-${viewport.width}.png`});await p.locator('[data-action=tutorialNext]').click();n++;
 }
 assert.ok(n>5);await p.close();
}
assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/result.json`,JSON.stringify({tutorials:[...seen],errors,layouts:[667,390,1280],rules:'unchanged',apk:'not built'},null,2));await browser.close();
console.log('PASS all nineteen introductions, actual art loads, no shot/reward changes, free replay/skip/save, branch flight, 3 tutorial sizes, zero browser/resource errors');
