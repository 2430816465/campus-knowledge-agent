import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const b=await chromium.launch({headless:true}),p=await b.newPage({viewport:{width:390,height:844},hasTouch:true});const errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
await p.goto((process.env.BASE_URL||'http://127.0.0.1:4186')+'/games/mine/index.html?start=1&seed=regression');await p.waitForFunction(()=>window.MT?.MM?.Game.scene?.run);
async function setup(){await p.evaluate(()=>{const m=MT.MM.Game.scene;m.newRun('warehouse-regression');m.tutorial.open=false;m.tutorial.guided=false;m.run.tutorialRun=false;advanceTime(1600)});while(await p.locator('.mine-draft button').count())await p.locator('.mine-draft button').first().tap()}
async function touchHit(name){const r=await p.evaluate(name=>{const m=MT.MM.Game.scene,h=m.hit[name],c=document.querySelector('#board').getBoundingClientRect(),l=MT.MM.UI.LAYOUT;return h&&{x:c.x+(h.x+h.w/2)*c.width/l.W,y:c.y+(h.y+h.h/2)*c.height/l.H}},name);assert(r,'missing '+name);await p.touchscreen.tap(r.x,r.y);await p.waitForTimeout(80)}
const checks=[];
for(const choice of ['supplies','materials']){
 await setup();await p.evaluate(()=>{const m=MT.MM.Game.scene;m.run.state='MOVING';m.run.move=null;m.run.pendingRoomChoice='warehouse';m.finishPending();advanceTime(0)});
 assert.equal(await p.evaluate(()=>MT.MM.Game.scene.modal.type),'warehouseChoice');await p.screenshot({path:'artifacts/mine-warehouse-'+choice+'.png'});
 await touchHit(choice==='supplies'?'warehouseSupplies':'warehouseMaterials');assert.equal(await p.evaluate(()=>MT.MM.Game.scene.modal),null);assert.equal(await p.evaluate(()=>MT.MM.Game.scene.run.state),'EXPLORING');
 const before=await p.evaluate(()=>MT.MM.Game.scene.run.stats.digActions);
 const pos=await p.evaluate(()=>{const m=MT.MM.Game.scene,l=MT.MM.UI.LAYOUT,pt=m.worldToScreen((m.run.playerX+.5)*l.TILE,(m.run.playerY+1.5)*l.TILE),c=document.querySelector('#board').getBoundingClientRect();return{x:c.x+pt.x*c.width/l.W,y:c.y+pt.y*c.height/l.H}});
 await p.touchscreen.tap(pos.x,pos.y);await p.evaluate(()=>advanceTime(1800));assert((await p.evaluate(()=>MT.MM.Game.scene.run.stats.digActions))>before,'dig after warehouse '+choice);checks.push('Warehouse '+choice+': close choice by touch then dig by touch');
}
await setup();await p.evaluate(()=>{const m=MT.MM.Game.scene;m.run.state='MOVING';m.run.move=null;advanceTime(100)});assert.equal(await p.evaluate(()=>MT.MM.Game.scene.run.state),'EXPLORING');checks.push('Empty movement route recovers');
const fuzz=await p.evaluate(()=>{const results=[];let actions=0,warehouses=0;for(let seed=0;seed<30;seed++){const m=MT.MM.Game.scene;m.newRun('repro-'+seed);m.tutorial.open=false;m.tutorial.guided=false;m.run.tutorialRun=false;for(let i=0;i<220;i++){advanceTime(10000);if(m.run.campDraft?.offer.length){document.querySelector('.mine-draft button')?.click();continue}if(m.modal){if(m.modal.type==='supply')m.chooseSupply(0);else if(m.modal.type==='warehouseChoice'){m.chooseWarehouse(seed%2?'materials':'supplies');warehouses++}else m.modal=null;continue}if(m.run.settled)break;if(m.run.state!=='EXPLORING'){results.push({seed,i,state:m.run.state,move:m.run.move});break}m.run.stamina=100;const x=m.run.playerX,y=m.run.playerY,candidates=[[x,y+1],[x-1,y],[x+1,y],[x,y-1]].filter(([x,y])=>m.map.inBounds(x,y)),target=candidates.find(([x,y])=>!m.map.get(x,y).excavated)||candidates[(i+seed)%candidates.length];if(target){m.onCellClick(...target);actions++}}}return{results,actions,warehouses}});
assert.deepEqual(fuzz.results,[]);assert.deepEqual(errors,[]);await p.screenshot({path:'artifacts/mine-regression-final.png'});await writeFile('artifacts/mine-regression.json',JSON.stringify({checks,fuzz,errors,fixtureNote:'Stamina refilled for long fuzz exploration; modal state fixtures plus actual touch; not a real-device test'},null,2));console.log({checks,fuzz,errors});
}finally{await b.close()}
