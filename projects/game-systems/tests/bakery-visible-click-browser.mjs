import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fresh} from '../games/workshop/economy.js';
import {FACILITIES} from '../games/workshop/shop.js';
const base=process.env.BASE_URL||'http://127.0.0.1:4173',out='artifacts/workshop/visible-click';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),checks=[],errors=[];
const read=p=>p.evaluate(()=>JSON.parse(render_game_to_text()));
async function create(viewport,s){
 const context=await browser.newContext({viewport,hasTouch:true,isMobile:true}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.addInitScript(s=>{localStorage.setItem('starlight-workshop-v1',JSON.stringify({...s,savedAt:Date.now()}));localStorage.setItem('demon-bakery-click-tutorial-v2',JSON.stringify({done:true}));},s);
 await page.goto(base+'/games/workshop/index.html');await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(render_game_to_text()).assetsReady);
 if(await page.locator('#guide-skip').isVisible())await page.locator('#guide-skip').tap();
 if(await page.locator('#dismiss-rotate').isVisible())await page.locator('#dismiss-rotate').tap();
 return {context,page};
}
async function tap(page,f){
 const s=await read(page),box=await page.locator('#board').boundingBox();
 await page.locator('#board').tap({position:{x:f.x/s.movement.world.width*box.width,y:(f.y-20)/s.movement.world.height*box.height}});
 await page.evaluate(()=>advanceTime(150));
}
try{
 for(const viewport of [{width:390,height:844},{width:844,height:390},{width:667,height:375},{width:1280,height:720}]){
  for(let stage=0;stage<=3;stage++){
   const s=fresh();s.beacons=stage;s.coins=10000;
   const {context,page}=await create(viewport,s),layout=(await read(page)).movement.layout;
   for(const f of layout.facilities){
    const spec=FACILITIES.find(t=>t.id===f.id),visible=stage>=spec.unlock,before=await read(page);
    await tap(page,f);const after=await read(page);
    assert.equal(after.panelOpen,visible,`${viewport.width} stage${stage} ${f.id}: hidden floor must not open facility`);
    if(visible){assert.equal(after.tab,'production');assert.equal(await page.locator('#panel-title').innerText(),spec.name);await page.locator('#close-panel').tap();}
    else assert(after.movement.player.distance>before.movement.player.distance,`${f.id}: hidden space should move player`);
    checks.push({viewport,stage,facility:f.id,ghostVisible:visible,opensDetail:after.panelOpen});
   }
   if(stage===0||stage===3)await page.screenshot({path:`${out}/${stage===0?'hidden':'ghosts'}-${viewport.width}.png`});
   await context.close();
  }
  // Already owned facilities stay visible/interactable, including legacy saves
  // whose order stage no longer meets the normal unlock requirement.
  const owned=fresh();owned.lineBuilt=true;owned.beacons=0;owned.coins=1000;
  for(const f of FACILITIES)owned.shop.facilities[f.id]=1;
  owned.shop.stock=[3,3,3,0];owned.shop.parcels=[{value:100}];
  const {context,page}=await create(viewport,owned),layout=(await read(page)).movement.layout;
  for(const f of layout.facilities){
   await tap(page,f);
   if(['mill','jam'].includes(f.id)){assert.equal((await read(page)).panelOpen,true);await page.locator('#close-panel').tap();}
   else {assert.equal((await read(page)).panelOpen,false);await page.evaluate(()=>advanceTime(5000));assert.equal((await read(page)).movement.nearby,f.id,`owned ${f.id} remains a travel/interaction target`);}
   checks.push({viewport,ownedFacility:f.id,clickableBelowUnlock:true});
  }
  await context.close();
  // Other invisible equipment also must leave its former footprint as floor.
  const empty=fresh();empty.lineBuilt=true;
  const hidden=await create(viewport,empty),L=(await read(hidden.page)).movement.layout;
  for(const [id,f] of [['cow',L.farms[1]],['berries',L.farms[2]],['counter',L.counter],['crate',L.crate]]){
   await tap(hidden.page,f);assert.equal((await read(hidden.page)).panelOpen,false,`${id} hidden base fixture must not open panel`);checks.push({viewport,hiddenBase:id,opensPanel:false});
  }
  await hidden.context.close();
 }
 assert.deepEqual(errors,[]);await fs.writeFile(out+'/results.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks:checks.length,errors}));
}finally{await browser.close();}
