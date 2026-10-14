import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='output/puzzle-aim-fix';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch(),reports=[];
try{
 for(const [name,base,path] of [['camp',process.env.BASE_URL||'http://127.0.0.1:4173','/games/marble/puzzle.html'],...(process.env.ONLY_CAMP?[]:[['standalone','http://127.0.0.1:4180','/puzzle.html']])]){
  for(const [width,height] of [[844,390],[640,360],[1280,720],[390,844]]){
   const p=await browser.newPage({viewport:{width,height},hasTouch:true}),errors=[];
   p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
   await p.goto(base+path+'?review=1&level=1');await p.waitForFunction(()=>!!window.Puzzle);
   await p.evaluate(async()=>{document.documentElement.requestFullscreen=async()=>{};if(document.fullscreenElement)await document.exitFullscreen();Puzzle.act('tutorialSkip')});
   const state=()=>p.evaluate(()=>JSON.parse(render_game_to_text())),cdp=await p.context().newCDPSession(p);
   const touch=async(type,x,y)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:['touchEnd','touchCancel'].includes(type)?[]:[{x,y,id:1,radiusX:3,radiusY:3,force:1}]});await p.evaluate(()=>new Promise(requestAnimationFrame))};
   const r=await p.locator('#board').boundingBox(),x=r.x+r.width/2,y=r.y+r.height*320/360;
   await touch('touchStart',x,y);assert((await state()).aim.active);
   // Saturate, drag farther, then reverse a few pixels: no accumulated dead travel.
   await touch('touchMove',width-8,y);await touch('touchMove',width-2,y);
   const edge=(await state()).aim.degrees;assert(edge>89);
   await touch('touchMove',width-12,y);assert((await state()).aim.degrees<edge-1);
   await touch('touchMove',2,y);assert((await state()).aim.degrees<-89);
   await touch('touchMove',12,y);assert((await state()).aim.degrees>-89);
   const cancel=await p.locator('#aim-cancel').boundingBox(),hud=await p.locator('#hud').boundingBox();
   assert(cancel.y>height/2&&cancel.x>width/2);assert(cancel.y>=hud.y+hud.height);
   await p.screenshot({path:`${out}/${name}-aim-${width}x${height}.png`});
   await touch('touchCancel');assert(!(await state()).aim.active);assert.equal((await state()).shotsUsed,0);
   // Noninteractive HUD status must allow dragging through it.
   const label=await p.locator('#hud .name').boundingBox();
   await touch('touchStart',label.x+label.width/2,label.y+label.height/2);assert((await state()).aim.active);
   await touch('touchMove',label.x+label.width/2+20,label.y+label.height/2);await touch('touchCancel');
   // Letterboxed portions of a wide or tall phone are also valid drag starts.
   if(r.x>2||r.y>2){const a=r.x>2?{x:2,y:height/2}:{x:width/2,y:height-4};await touch('touchStart',a.x,a.y);assert((await state()).aim.active);const before=(await state()).aim.degrees;await touch('touchMove',a.x+20,a.y);assert((await state()).aim.degrees>before);await touch('touchCancel')}
   await touch('touchStart',x,y);await touch('touchMove',cancel.x+cancel.width/2,cancel.y+cancel.height/2);await touch('touchEnd');assert.equal((await state()).shotsUsed,0);
   await p.locator('[data-action=pause]').click();assert.equal((await state()).view,'pause');await p.locator('[data-action=close]').click();
   await touch('touchStart',x,y);await touch('touchMove',x+20,y);await touch('touchEnd');assert.equal((await state()).shotsUsed,1);assert.equal((await state()).phase,'flight');
   assert.deepEqual(errors,[]);reports.push({name,width,height,edge,cancel,hud,errors});await p.close();
  }
 }
 await fs.writeFile(`${out}/touch-report.json`,JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
}finally{await browser.close()}
