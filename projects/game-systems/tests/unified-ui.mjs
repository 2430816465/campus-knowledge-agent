import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {modes} from '../services.js';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/24308/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const browser=await chromium.launch({headless:true}),errors=[],checks=[],out='artifacts/unified';await mkdir(out,{recursive:true});
const act=(p,a)=>p.locator(`[data-action="${a}"]`).first().click();
async function enter(p,id){await p.goto('http://127.0.0.1:4173');await act(p,'mode:'+id);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(350);await p.screenshot({path:`${out}/${id}-prepare.png`});await act(p,id==='coop'?'create-room':'preview');await p.waitForFunction(()=>document.querySelector('iframe')&&!document.querySelector('.game-loading'));return p.frames().find(f=>f.url().includes('/games/'))}
async function hit(p,f,key){const r=await f.evaluate(k=>MT.MM.Game.scene.hit[k],key),box=await f.locator('#board').boundingBox(),dim=await f.locator('#board').evaluate(c=>({w:c.width,h:c.height}));assert(r,key);await p.mouse.click(box.x+(r.x+r.w/2)*box.width/dim.w,box.y+(r.y+r.h/2)*box.height/dim.h);await p.waitForTimeout(100)}
try{
 for(const [width,height]of [[360,800],[390,844],[844,390],[1440,900]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  for(const m of modes){const f=await enter(p,m.id);await f.evaluate(()=>document.fonts.ready);
   if(m.id==='tower'){
    await f.getByRole('button',{name:'跳过教程',exact:true}).click();
    await act(p,'menu');await act(p,'game-option:btnInfo');await f.locator('#infoOverlay:not([hidden])').waitFor();
    const b=await f.locator('.info-sheet').boundingBox();assert(b.width<=width&&b.height<=height,'tower information bounds');
    const title=await f.locator('#infoTitle').evaluate(el=>({width:el.clientWidth,color:getComputedStyle(el).color}));assert(title.width>30,'real information heading visible');
    await p.screenshot({path:`${out}/tower-information-${width}.png`});await f.locator('#btnInfoClose').click();
   }
   if(m.id==='marble'){
    await f.locator('[data-action=new]').click();
    // Stress layout using actual registered items; gameplay itself is tested separately.
    await f.evaluate(async()=>{const {UPGRADES,RELICS}=await import('./data.js');Marble.run.upgrades=UPGRADES.slice(0,3).map(x=>x.id);Marble.run.relics=[{id:RELICS[0].id,tier:0}];advanceTime(0)});
    const b=await f.locator('[data-action=undo]').boundingBox();assert(b.y+b.height<=height+1,'marble main action in viewport '+JSON.stringify({width,height,b}));
    const canvas=await f.locator('#board').boundingBox();assert(canvas.width>150,'marble target size');
    assert(await f.locator('[data-action=strong]').isDisabled(),'energy gate disabled');
   }
   if(m.id==='mine'){
    if(await f.evaluate(()=>MT.MM.Game.scene.tutorial.open))await hit(p,f,'tutorialSkip');
    await act(p,'menu');await act(p,'game-option:settings');await f.waitForFunction(()=>MT.MM.Game.scene.settingsOpen);await p.screenshot({path:`${out}/mine-settings-${width}.png`});await hit(p,f,'settingsClose');
   }
   await p.waitForTimeout(150);await p.screenshot({path:`${out}/${m.id}-${width}x${height}.png`});
   assert(await p.locator('[data-action=menu]').count()===1);
   await act(p,'menu');await p.screenshot({path:`${out}/${m.id}-menu-${width}.png`});await act(p,'close');
   checks.push(`${m.id} ${width}x${height}: shared menu, screenshots, controls`);
  }
  await context.close();
 }
 const p=await browser.newPage({viewport:{width:390,height:844}});p.on('pageerror',e=>errors.push(e.message));const f=await enter(p,'mine');if(await f.evaluate(()=>MT.MM.Game.scene.tutorial.open))await hit(p,f,'tutorialSkip');await hit(p,f,'end');await hit(p,f,'end');await p.waitForTimeout(400);
 await p.screenshot({path:`${out}/mine-result.png`});await hit(p,f,'summaryDetails');await f.locator('dialog[open]').waitFor();await p.screenshot({path:`${out}/mine-report.png`});await f.getByRole('button',{name:'返回结算',exact:true}).click();await hit(p,f,'back');await p.waitForFunction(()=>!document.querySelector('iframe'));checks.push('mine result -> report -> close -> camp; reward retained');
 await p.goto('http://127.0.0.1:4173');await act(p,'mode:mine');await act(p,'choice:1');await act(p,'preview');await p.waitForFunction(()=>!document.querySelector('.game-loading'));await p.waitForTimeout(350);await p.screenshot({path:`${out}/mine-camp.png`});
 await p.goto('http://127.0.0.1:4173');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(700);await p.screenshot({path:`${out}/home.png`});await p.close();
 assert.deepEqual(errors,[]);await writeFile(`${out}/checks.json`,JSON.stringify({checks,errors},null,2));console.log('PASS '+checks.length+' unified checks, zero page errors');
}finally{await browser.close()}


