import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/24308/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const browser=await chromium.launch({headless:true}),errors=[],out='artifacts/tower-51';await mkdir(out,{recursive:true});
const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url())});
try{
 await page.goto('http://127.0.0.1:4173/');await page.locator('[data-action="mode:tower"]').click();await page.locator('[data-action="preview"]').click();
 await page.waitForFunction(()=>document.querySelector('iframe')&&!document.querySelector('.game-loading'));
 const frame=page.frames().find(f=>f.url().includes('/games/tower/'));
 await frame.getByRole('button',{name:'跳过教程',exact:true}).click();
 const inventory=await frame.evaluate(()=>{
  const floors=Object.keys(MT.FLOORS).map(Number).sort((a,b)=>a-b),g=MT.Game.G,fail=[];
  for(let i=0;i<=50;i++){
    const f=MT.FLOORS[i],grid=g.grids[i];if(!f||!grid){fail.push('missing '+i);continue}
    if(f.rows.length!==11||grid.length!==11||f.rows.some(r=>r.length!==11))fail.push('shape '+i);
    const stairs=MT.ORIGINAL50_MAPS[i].layers.stair.map(x=>x[3]);
    if(i<49&&!stairs.includes('stair_up'))fail.push('no up stair '+i);
    if(i>1&&i<50&&!stairs.includes('stair_down'))fail.push('no down stair '+i);
  }
  return {active:MT.ORIGINAL50_ACTIVE,floors,fail,current:g.floor,source:MT.ORIGINAL50_MAPS.length};
 });
 assert(inventory.active);assert.equal(inventory.source,51);assert.deepEqual(inventory.floors,Array.from({length:51},(_,i)=>i));assert.deepEqual(inventory.fail,[]);
 const results=[];
 for(const floor of Array.from({length:51},(_,i)=>i)){
   const result=await frame.evaluate(f=>{const g=MT.Game.G;g.floor=f;g.pos={x:5,y:5};MT.Game.syncAll();const state=JSON.parse(window.render_game_to_text());return {floor:f,rendered:state.floor,canvas:[document.querySelector('#board').width,document.querySelector('#board').height]}},floor);
   results.push(result);assert.equal(result.rendered,floor);
   if([1,25,50].includes(floor))await page.screenshot({path:`${out}/floor-${floor}.png`});
 }
 assert.deepEqual(errors,[]);await writeFile(out+'/results.json',JSON.stringify({inventory,results,errors},null,2));console.log(JSON.stringify({source:inventory.source,floors:inventory.floors.length,rendered:results.length,errors}));
}finally{await browser.close()}
