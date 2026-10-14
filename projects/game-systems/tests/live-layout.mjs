import {modes} from '../services.js';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('C:/Users/24308/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const browser=await chromium.launch({headless:true}),errors=[],results=[];
const dir=process.env.REPORT_DIR||'artifacts/live/layout';
await mkdir(dir,{recursive:true});
function inBounds(rect,w,h,label){assert(rect,`${label}: missing element`);assert(rect.x>=-1&&rect.x+rect.width<=w+1&&rect.y>=-1&&rect.y+rect.height<=h+1,`${label}: outside viewport ${JSON.stringify(rect)}`);}
try{
 for(const [w,h] of [[390,844],[360,800],[844,390],[1440,900]])for(const id of modes.map(m=>m.id)){
  const context=await browser.newContext({viewport:{width:w,height:h},hasTouch:w<1000}),p=await context.newPage();
  p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url())});
  await p.goto(process.env.BASE_URL||'http://127.0.0.1:4173/');
  await p.locator(`[data-action="mode:${id}"]`).click();
  await p.locator(`[data-action="${id==='coop'?'create-room':'preview'}"]`).click();
  await p.waitForFunction(()=>document.querySelector('iframe')&&!document.querySelector('.game-loading'));
  const f=p.frames().find(f=>f.url().includes('/games/'));
  if(id==='marble')await f.locator('[data-action=new]').click();
  if(id==='tower')await f.getByRole('button',{name:'跳过教程',exact:true}).click();
  if(id==='evolve'&&w>=h)await f.locator('[data-action=new]').click();
  await p.waitForTimeout(400);
  const outer=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,frame:document.querySelector('iframe').getBoundingClientRect().bottom,height:innerHeight}));
  const inner=await f.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,canvas:document.querySelector('#board,canvas')?.getBoundingClientRect().toJSON()||null,width:innerWidth,height:innerHeight}));
  assert(!outer.overflow&&!inner.overflow,`${id} ${w}: horizontal overflow`);assert(outer.frame<=outer.height+1,`${id} ${w}: frame outside viewport`);
  await p.screenshot({path:`${dir}/${id}-${w}x${h}.png`});
  let panel,scope='camp menu';
  if(id==='marble'){
   if(w<h){panel=f.locator('.rotate-hint');scope='portrait rotation hint';}
   else{await f.locator('[data-action=pause]').click();panel=f.locator('.shade .dialog');scope='game pause';}
  }else if(id==='evolve'){
   if(w<h){panel=f.locator('#orientation-prompt');scope='portrait rotation hint';}
   else{await f.locator('[data-action=pause]').click();panel=f.locator('#scene-overlay .panel');scope='game pause';}
  }else{await p.locator('[data-action=menu]').click();panel=p.locator('dialog[open]');}
  await p.waitForTimeout(120);
  const rect=await panel.boundingBox();
  inBounds(rect,w,h,`${id} ${w} ${scope}`);
  await p.screenshot({path:`${dir}/${id}-menu-${w}x${h}.png`});
  results.push({id,viewport:[w,h],outer,inner,checked:scope,panel:rect});await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(dir+'/results.json',JSON.stringify({results,errors},null,2));console.log(`PASS ${results.length} game viewport combinations, menus or orientation prompts in bounds, no errors`);
}finally{await browser.close()}
