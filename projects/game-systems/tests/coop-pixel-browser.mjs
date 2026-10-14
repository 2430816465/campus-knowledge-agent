import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),G=require('../games/coop/src/game-shared.js'),T=require('../games/coop/src/mechanism-guide.js');
const base=process.env.BASE_URL||'http://127.0.0.1:4199',dir=process.env.REPORT_DIR||'artifacts/coop-pixel';
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],report={guides:[],viewports:[],physicalDevice:false};
const kinds=Object.keys(T.definitions);
const progression=JSON.stringify({version:1,progress:{coins:0,cleared:Array.from({length:49},(_,i)=>i+1),marks:{}},world:null});
const packageContext=process.env.STATIC_BUNDLE==='1'?{userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36 AdventureCampAndroid/1.14.0'}:{};
try {
 for(const viewport of [{width:844,height:390},{width:568,height:320},{width:1024,height:600},{width:1280,height:720},{width:390,height:844}]){
  const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,...packageContext}),p=await context.newPage();
  p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  await p.goto(base+'/games/coop/index.html?solo=1');await p.locator('#startSolo').click();await p.bringToFront();
  await p.waitForFunction(()=>RushGuide.inspect().active==='movement');
  const before=await p.evaluate(()=>CampCoop.snapshot().world.tick);await p.waitForTimeout(150);
  assert.equal(await p.evaluate(()=>CampCoop.snapshot().world.tick),before,'solo introductory guide pauses simulation');
  const box=await p.locator('#mechanismGuide').boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height+1);
  assert.equal(await p.locator('#guideBody').evaluate(e=>getComputedStyle(e).fontSize),'14px');
  await p.screenshot({path:`${dir}/intro-${viewport.width}.png`});
  await p.locator('#guideConfirm').click();assert.equal(await p.evaluate(()=>RushGuide.blocking),false);
  await p.keyboard.press('Escape');
  // Seed only tutorial preferences for the art gallery, no gameplay achievement flags.
  await p.addInitScript(({kinds,progression})=>{localStorage.setItem('zcyg_mechanism_guides_v1',JSON.stringify(kinds));localStorage.setItem('zcyg_solo_v1',progression);}, {kinds,progression});
  await p.reload();await p.locator('[data-level="27"]').click();await p.locator('#startSolo').click();await p.bringToFront();
  await p.evaluate(()=>RushArt.ready);await p.waitForTimeout(120);
  assert.deepEqual(await p.evaluate(()=>RushArt.failed),[]);
  await p.screenshot({path:`${dir}/scene-${viewport.width}.png`});
  await p.locator('#cornerMenu').click();await p.locator('#mechanismHelp').click();
  assert.equal(await p.locator('#guideList button').count(),18);
  assert.equal(await p.evaluate(()=>RushGuide.blocking),true);
  await p.locator('#guideList button').filter({hasText:'可伸缩桥'}).click();assert.equal(await p.evaluate(()=>RushGuide.inspect().active),'bridge');
  await p.locator('#guideSkip').click();assert.equal(await p.evaluate(()=>RushGuide.blocking),false);
  report.viewports.push({...viewport,pause:true,library:true,artLoaded:true});await context.close();
 }
 // First encounter for every actual campaign mechanism. These are placement fixtures, not route-completion claims.
 for(const kind of kinds){
  const context=await browser.newContext({viewport:{width:740,height:360},hasTouch:true,isMobile:true,...packageContext}),p=await context.newPage();
  p.on('pageerror',e=>errors.push(e.message));
  const index=G.LEVELS.findIndex((L,i)=>T.candidates(G.createWorld(i),G).some(x=>x.kind===kind));assert(index>=0);
  await p.addInitScript(({kinds,kind,progression})=>{localStorage.setItem('zcyg_mechanism_guides_v1',JSON.stringify(kinds.filter(k=>k!==kind)));localStorage.setItem('zcyg_solo_v1',progression);},{kinds,kind,progression});
  await p.goto(base+'/games/coop/index.html?solo=1');await p.locator(`[data-level="${index}"]`).click();await p.locator('#startSolo').click();await p.bringToFront();
  if(kind!=='movement'){
   await p.waitForTimeout(1100);
   await p.evaluate(kind=>{
    const state=CampCoop.snapshot(),w=state.world,item=RushGuide.candidates(w,RushGame).find(x=>x.kind===kind),e=item.entity;
    Object.assign(w.players[0],{x:Math.max(0,e.x-80),y:e.y+(e.h||56)-56,vx:0,vy:0,grounded:true});
    RushGuide.update(state,0);
   },kind);
  }
  await p.waitForFunction(k=>RushGuide.inspect().active===k,kind);
  assert.equal(await p.evaluate(()=>RushGuide.blocking),true);
  const original=await p.evaluate(()=>JSON.stringify(CampCoop.snapshot().world.flags));
  await p.screenshot({path:`${dir}/guide-${kind}.png`});
  await p.locator('#guideConfirm').click();assert.equal(await p.evaluate(()=>RushGuide.blocking),false);
  assert.equal(await p.evaluate(()=>JSON.stringify(CampCoop.snapshot().world.flags)),original,'guide never unlocks gameplay');
  // Acknowledge persists separately from progression; closing cannot leave a stuck pause.
  if(await p.locator('#mechanismGuide').isVisible())await p.locator('#guideConfirm').click();
  assert((await p.evaluate(()=>RushGuide.inspect().seen)).includes(kind));
  assert.equal(await p.evaluate(()=>RushGuide.blocking),false);
  report.guides.push({kind,firstLevel:index+1,acknowledged:true});
  await context.close();
 }
 // An actual host and guest prove LAN guidance never freezes the authoritative world.
 if(process.env.STATIC_BUNDLE!=='1'){
 const a=await browser.newContext(),b=await browser.newContext(),host=await a.newPage(),guest=await b.newPage();
 for(const p of [host,guest])p.on('pageerror',e=>errors.push(e.message));
 await host.goto(base+'/games/coop/index.html');await host.locator('#createRoom').click();await host.locator('#lobby:not(.hidden)').waitFor();
 const code=(await host.locator('#inviteCode').textContent()).trim();
 await guest.goto(base+'/games/coop/index.html');await guest.locator('#roomCode').fill(code);await guest.locator('#joinRoom').click();await guest.locator('#lobby:not(.hidden)').waitFor();
 await host.locator('#readyButton').click();await guest.locator('#readyButton').click();await host.locator('#startButton').click();
 await host.waitForFunction(()=>RushGuide.inspect().active==='movement');
 assert.equal(await host.evaluate(()=>RushGuide.blocking),false);
 const tick=await host.evaluate(()=>CampCoop.snapshot().world.tick);await host.waitForTimeout(160);
 assert((await host.evaluate(()=>CampCoop.snapshot().world.tick))>tick);
 await host.locator('#guideSkip').click();await guest.locator('#guideSkip').click();
 await a.close();await b.close();report.networkGuideNonblocking=true;
 }else{report.networkGuideNonblocking=null;report.staticBundle=true;}
 assert.deepEqual(errors,[]);report.errors=errors;report.passed=true;
 await writeFile(dir+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
