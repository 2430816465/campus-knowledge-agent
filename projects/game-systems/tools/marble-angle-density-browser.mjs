import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
await fs.mkdir('output/angle-density',{recursive:true});
const browser=await chromium.launch({headless:true});
for(const [name,url] of [['integrated','http://127.0.0.1:4173/games/marble/index.html'],['standalone','http://127.0.0.1:4180/']]){
 const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
 for(const side of [-1,1]){
  await page.evaluate(()=>localStorage.removeItem('adventure-camp.marble.v1'));await page.reload();await page.locator('[data-action=new]').click();
  assert.equal(await page.evaluate(()=>Marble.run.room.enemies.length),110);
  const b=await page.locator('#board').boundingBox(),cdp=await page.context().newCDPSession(page);
  const start={x:b.x+b.width*.5,y:b.y+b.height*.65},end={x:b.x+b.width*(side<0?.08:.92),y:b.y+b.height*(338/360)};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[end]});
  const aim=await page.evaluate(()=>Marble.aim);assert.ok(aim&&side*aim.dx>0&&aim.dy<0);
  await page.screenshot({path:`output/angle-density/${name}-${side<0?'left':'right'}-preview.png`});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const angle=await page.evaluate(()=>Marble.run.volley?.angle);assert.ok(side*angle>1.5,JSON.stringify({name,side,angle}));
  await page.evaluate(()=>advanceTime(9000));assert.equal(await page.evaluate(()=>Marble.run.shot),1);
  console.log(JSON.stringify({name,side,angleRadians:angle,initialSpirits:110,shotAdvanced:true}));
 }
 assert.deepEqual(errors,[]);await page.close();
}
await browser.close();
