import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {returningPlayer} from './coop-guide-preferences.mjs';
const base=process.env.BASE_URL||'http://127.0.0.1:4199';
await mkdir('artifacts/coop-fall',{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[];
try{
 for(const viewport of[{width:844,height:390},{width:740,height:360},{width:1024,height:600}]){
  const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,userAgent:'AdventureCampAndroid/1.12.0'});
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await returningPlayer(p);
  await p.addInitScript(()=>localStorage.setItem('zcyg_solo_v1',JSON.stringify({version:1,progress:{coins:0,cleared:[1],marks:{}},world:null})));
  await p.goto(base+'/games/coop/index.html?solo=1');await p.locator('[data-level="1"]').tap();await p.locator('#startSolo').tap();await p.bringToFront();await p.waitForTimeout(180);
  const text=()=>p.evaluate(()=>JSON.parse(render_game_to_text()));
  const zone=await p.locator('#moveZone').boundingBox(),cdp=await context.newCDPSession(p);
  for(const [rx,ry,direction] of[[.25,.35,1],[.8,.7,-1],[.025,.98,1]]){
   const point={id:1,x:zone.x+zone.width*rx,y:zone.y+zone.height*ry};
   const hit=await p.evaluate(({x,y})=>document.elementsFromPoint(x,y).map(e=>e.id||e.className),point);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
   assert.equal((await text()).joystick,'','touch origin is neutral');
   point.x+=28*direction;await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point]});
   await p.waitForTimeout(60);
   assert.equal((await text()).joystick,direction>0?'right':'left',`arbitrary/edge touch works: ${viewport.width}, ${rx}, ${ry}; zone=${JSON.stringify(zone)} hit=${hit.join(',')}`);
   if(rx===.25){
    const jump=await p.locator('[data-control=jump]').boundingBox();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point,{id:2,x:jump.x+jump.width/2,y:jump.y+jump.height/2}]});
    assert.equal((await text()).controls.jump,true);assert.equal((await text()).controls.right,true);
    await p.screenshot({path:`artifacts/coop-fall/floating-${viewport.width}.png`});
   }
   await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
   assert.equal((await text()).joystick,'');assert.equal((await text()).controls.jump,false);
  }
  // Saved-world fixture creates the actual lower-bridge fall; normal stepping/rendering is used.
  await p.evaluate(()=>{CampCoop.pause();const w=CampCoop.snapshot().world;w.flags.lowerBridge=false;Object.assign(w.players[1],{x:530,y:484,grounded:true,vy:0});CampCoop.resume();});
  await p.waitForFunction(()=>CampCoop.snapshot().world.fall?.slot===1);
  await p.evaluate(()=>CampCoop.pause());
  assert.ok((await text()).players[1].y>484);assert.deepEqual((await text()).art.poses.includes('fall'),true);
  await p.screenshot({path:`artifacts/coop-fall/descent-${viewport.width}.png`});
  const before=(await text()).players[1].y;await p.waitForTimeout(100);assert.equal((await text()).players[1].y,before,'menu pause freezes fall');
  await p.evaluate(()=>CampCoop.resume());await p.waitForFunction(()=>!CampCoop.snapshot().world.fall);
  assert.equal(await p.evaluate(()=>CampCoop.snapshot().world.safeRun),false);
  assert.equal((await text()).phase,'playing');
  await p.screenshot({path:`artifacts/coop-fall/restored-${viewport.width}.png`});
  await context.close();
 }
 assert.deepEqual(errors,[]);
 const report={passed:true,viewports:3,checks:['floating origin','arbitrary left region','edge origin','both directions','multitouch jump','cancel clears','visible fall pose','pause fall','restore'],errors,deviceTested:false};
 await writeFile('artifacts/coop-fall/ui-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
