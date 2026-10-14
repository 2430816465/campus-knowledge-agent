import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:470,height:940}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4173/games/marble/index.html');
await page.click('[data-action=new]');
assert.equal(await page.evaluate(()=>window.Marble.run.sequence.length),15);
async function bestShot(){
 const angle=await page.evaluate(()=>{
  const g=window.Marble,r=g.run;let best=0,score=-Infinity;
  for(let i=0;i<45;i++){const a=-1.1+i*.05,t=new g.constructor();t.run=structuredClone(r);t.paused=false;t.shoot(a);
   for(let n=0;n<1000&&t.run.phase==='flight';n++)t.advance(250);
   const s=(t.run.shots.at(-1)?.kills||0)*100+(t.run.waveIndex>r.waveIndex?10000:0)+(t.run.roomsCleared>r.roomsCleared?20000:0);
   if(s>score){score=s;best=a}}
  return best;
 });
 await page.evaluate(a=>window.Marble.shoot(a),angle);
 await page.evaluate(()=>window.advanceTime(8500));
}
const box=await page.locator('#board').boundingBox();
const pos=(x,y)=>({x:box.x+x/360*box.width,y:box.y+y/560*box.height});
const start=pos(180,470),end=pos(15,370);
await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});await page.mouse.up();
assert.equal(await page.evaluate(()=>window.Marble.run.phase),'flight');
await page.evaluate(()=>window.advanceTime(8500));
for(let i=0;i<4&&await page.evaluate(()=>window.Marble.run.phase==='aim');i++)await bestShot();
assert.equal(await page.evaluate(()=>window.Marble.run.phase),'reward');
assert.equal(await page.evaluate(()=>window.Marble.run.roomsCleared),1);
await page.screenshot({path:'output/marble-v3-ui-reward.png',fullPage:true});
await page.locator('[data-action^="choose:element:"]').first().click();
assert.equal(await page.evaluate(()=>window.Marble.run.roomIndex),1);
assert.ok(await page.evaluate(()=>window.Marble.run.queue.some(x=>x!=='basic')));
for(let guard=0;guard<12&&await page.evaluate(()=>window.Marble.run.roomIndex<3);guard++){
 const state=await page.evaluate(()=>({phase:window.Marble.run.phase,room:window.Marble.run.roomIndex,wave:window.Marble.run.waveIndex,offer:window.Marble.run.offer}));
 if(state.phase==='reward'){
  if(state.room===2)break;
  await page.locator('[data-action^="choose:"]').first().click();continue;
 }
 if(state.phase!=='aim')throw new Error(JSON.stringify(state));
 await bestShot();
}
assert.equal(await page.evaluate(()=>window.Marble.run.offerType),'relic');
await page.click('[data-action=openChest]');
await page.waitForTimeout(1150);
assert.equal(await page.locator('.relic-cards .upgrade-card').count(),3);
await page.locator('[data-action^="relic:"]').first().click();
assert.equal(await page.evaluate(()=>window.Marble.run.relics.length),1);
await page.click('[data-action=relicContinue]');
assert.equal(await page.evaluate(()=>window.Marble.run.roomIndex),3);
console.log('pointer → first reward → element slot → waves → free chest → relic → room 4: OK');
console.log('errors',errors);
await browser.close();
