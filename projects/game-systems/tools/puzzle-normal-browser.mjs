import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {SOLUTIONS} from '../games/marble/puzzle-solutions.js';
const out='output/puzzle-normal-v2/browser';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),reports=[];
try{
 for(const [name,url] of [['camp',(process.env.BASE_URL||'http://127.0.0.1:4173')+'/games/marble/puzzle.html?review=1'],...(process.env.ONLY_CAMP?[]:[['standalone','http://127.0.0.1:4180/puzzle.html?review=1']])]){
  const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,deviceScaleFactor:1}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
  await page.goto(url);await page.waitForFunction(()=>!!window.Puzzle);
  await page.evaluate(()=>localStorage.setItem('adventure-camp.marble.ruins.v3',JSON.stringify({meta:{unlocked:37}})));
  await page.locator('[data-action="level:0"]').tap();assert.equal(await page.evaluate(()=>Puzzle.tutorial),'shoot');while(await page.locator('[data-action=tutorialNext]').count())await page.locator('[data-action=tutorialNext]').tap();
  await page.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen();document.documentElement.requestFullscreen=async()=>{};});
  const state=()=>page.evaluate(()=>JSON.parse(render_game_to_text()));
  const rect=await page.locator('#board').boundingBox(),pt=(x,y)=>({x:rect.x+x*rect.width/640,y:rect.y+y*rect.height/360});
  assert(rect.width*rect.height/(844*390)>.8);assert.equal(await page.locator('#hud button').count(),3);
  const cdp=await page.context().newCDPSession(page);
  const touch=async(type,p)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{...p,id:1,radiusX:3,radiusY:3,force:1}]});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)))};
  const origin=pt(320,320);await touch('touchStart',origin);await touch('touchMove',pt(350,320));const a=(await state()).aim.degrees;
  await page.waitForTimeout(650);await touch('touchMove',pt(380,320));const b=(await state()).aim.degrees;assert(Math.abs((b-a)-a)<.2,JSON.stringify({a,b,state:await state(),rect}));
  await touch('touchMove',pt(100,320));assert((await state()).aim.degrees<-89);await touch('touchMove',pt(540,320));assert((await state()).aim.degrees>89);await touch('touchMove',pt(320,320));assert((await state()).aim.degrees<0);
  await page.screenshot({path:`${out}/${name}-aim.png`});
  await touch('touchCancel');assert(!(await state()).aim.active);assert.equal((await state()).shotsUsed,0);
  await touch('touchStart',origin);await touch('touchMove',pt(350,320));const cb=await page.locator('#aim-cancel').boundingBox();await touch('touchMove',{x:cb.x+cb.width/2,y:cb.y+cb.height/2});await touch('touchEnd');assert.equal((await state()).shotsUsed,0);
  // Release coordinates are incorporated even if the last move was not delivered.
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...origin,button:'left',buttons:1,clickCount:1});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...pt(370,320),button:'left',buttons:0,clickCount:1});
  assert(Math.abs((await state()).aim.lastDegrees-50*180/(640*.65))<.1);assert.equal((await state()).shotsUsed,1);
  // First room needs a real bank shot. A screen tap chooses a reference direction.
  if((await state()).phase==='flight')await page.evaluate(()=>{Puzzle.start(0)});
  const firstAngle=SOLUTIONS[0][0]*Math.PI/180,firstPoint=pt(320+Math.sin(firstAngle)*200,320-Math.cos(firstAngle)*200);
  await page.touchscreen.tap(firstPoint.x,firstPoint.y);assert.equal((await state()).phase,'flight');await page.evaluate(()=>advanceTime(8500));assert.equal((await state()).phase,'won');
  await page.locator('[data-action=next]').tap();assert.equal((await state()).level,2);await page.locator('[data-action=pause]').tap();const before=(await state()).shotsLeft;await page.evaluate(()=>advanceTime(9000));assert.equal((await state()).shotsLeft,before);await page.locator('[data-action=close]').tap();
  // Reference routes through real drag-to-fire controls, with all first-use tutorials.
  const wins=[];
  for(const i of [5,13,24,30,40,49]){
   await page.evaluate(i=>Puzzle.start(i),i);while(await page.locator('[data-action=tutorialNext]').count())await page.locator('[data-action=tutorialNext]').tap();
   for(const deg of SOLUTIONS[i]){if((await state()).phase==='won')break;const s=await state(),box=await page.locator('#board').boundingBox(),p={x:box.x+320*box.width/640,y:box.y+300*box.height/360},dx=(deg-s.aim.lastDegrees)*Math.PI/180*640*.65/Math.PI*box.width/640;
    await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+dx,p.y,{steps:4});await page.mouse.up();assert.equal((await state()).phase,'flight');await page.evaluate(()=>advanceTime(8500));
   }
   assert.equal((await state()).phase,'won','screen route '+(i+1));wins.push(i+1);
  }
  await page.evaluate(()=>Puzzle.start(40));await page.locator('[data-action=help]').tap();await page.locator('[data-action="ad:route"]').tap();await page.locator('[data-action=adCancel]').tap();assert(!(await state()).routeHint);await page.locator('[data-action="ad:route"]').tap();await page.locator('[data-action=adFail]').tap();assert(!(await state()).routeHint);await page.locator('[data-action="ad:route"]').tap();await page.locator('[data-action=adComplete]').tap();assert((await state()).correctRoute);await page.screenshot({path:`${out}/${name}-hint.png`});
  await page.locator('[data-action=pause]').tap();await page.locator('[data-action=retry]').tap();assert((await state()).routeHint);await page.reload();await page.locator('[data-action=continue]').tap();assert((await state()).routeHint);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('adventure-camp.marble.ruins.v3')).meta.unlocked),37);
  const shotsBeforeHelp=(await state()).shotsLeft;await page.locator('[data-action=help]').tap();await page.locator('[data-action="ad:extra"]').tap();await page.locator('[data-action=adComplete]').tap();assert.equal((await state()).shotsLeft,shotsBeforeHelp+1);
  await page.evaluate(async()=>{document.documentElement.requestFullscreen=async()=>{};if(document.fullscreenElement)await document.exitFullscreen()});
  const windowInfo=await cdp.send('Browser.getWindowForTarget');await cdp.send('Browser.setWindowBounds',{windowId:windowInfo.windowId,bounds:{windowState:'normal'}});
  const sizes=[];for(const [width,height] of [[640,360],[844,390],[1280,720],[390,844]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>Puzzle.start(49));await page.screenshot({path:`${out}/${name}-${width}x${height}-board.png`});
   for(const action of ['pause','help','levels']){await page.evaluate(action=>Puzzle.act(action),action);const panel=await page.locator('.panel').evaluate(el=>({height:el.clientHeight,content:el.scrollHeight}));assert(panel.content<=panel.height+2,`${name} ${width}x${height} ${action} scroll`);const boxes=await page.locator('.panel button').evaluateAll(es=>es.map(e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})));for(const b of boxes)assert(b.x>=0&&b.y>=0&&b.x+b.w<=width+1&&b.y+b.h<=height+1);}
   sizes.push({width,height});
  }
  await page.setViewportSize({width:1280,height:720});await page.evaluate(()=>Puzzle.start(0));await page.evaluate(()=>Puzzle.act('tutorial'));const intro=await page.locator('[data-action=tutorialNext]').boundingBox();
  await page.evaluate(()=>Puzzle.act('tutorialSkip'));for(let i=0;i<50;i++){await page.evaluate(i=>{Puzzle.start(i);if(Puzzle.tutorial)Puzzle.act('tutorialSkip')},i);await page.locator('#board').screenshot({path:`${out}/level-${String(i+1).padStart(2,'0')}.png`});}
  assert.deepEqual(errors,[]);reports.push({name,wins,longHold:{first:a,second:b},fieldRatio:rect.width*rect.height/(844*390),sizes,intro,errors});await page.close();
 }
 const migration=await browser.newPage();
 // Install the previous-version fixture before game boot; pagehide saves the
 // current in-memory game and would overwrite a fixture injected before reload.
 await migration.addInitScript(()=>{localStorage.removeItem('adventure-camp.marble.normal.v2');localStorage.setItem('adventure-camp.marble.normal.v1',JSON.stringify({meta:{unlocked:24,best:{0:{stars:3}},tutorialSeen:{shoot:true,bounce:true}},run:{index:19,phase:'aim'}}))});await migration.goto((process.env.BASE_URL||'http://127.0.0.1:4173')+'/games/marble/puzzle.html');
 assert.equal(await migration.evaluate(()=>Puzzle.meta.unlocked),24);assert.equal(await migration.evaluate(()=>Object.keys(Puzzle.meta.best).length),0);assert.equal(await migration.evaluate(()=>JSON.parse(localStorage.getItem('adventure-camp.marble.normal.v1')).run.index),19);
 await migration.goto((process.env.BASE_URL||'http://127.0.0.1:4173')+'/games/marble/puzzle.html?review=1&level=50');assert.equal(await migration.evaluate(()=>Puzzle.game.index),49);await migration.close();
 reports.push({oldSavePreserved:true,newMapsKeepUnlocked:true,oldStarsNotMisapplied:true,reviewLinkLevel50:true});
 await fs.writeFile(`${out}/report.json`,JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
}finally{await browser.close()}
