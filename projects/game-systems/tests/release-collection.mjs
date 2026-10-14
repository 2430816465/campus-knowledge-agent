import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4215';
const out=process.env.REPORT_DIR||'artifacts/release-1.15.0/browser';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),report=[],failures=[];
const read=f=>f.evaluate(()=>JSON.parse(render_game_to_text()));
async function clickVisible(b){await b.evaluate(e=>window.ScreenPages?.reveal(e));await b.click({timeout:5000});}
const action=(f,id)=>clickVisible(f.locator(`[data-action="${id}"]`));
async function hit(page,f,key){
 await f.evaluate(()=>advanceTime(0));
 const point=await f.evaluate(key=>{const m=MT.MM.Game.scene,h=m.hit[key],c=document.querySelector('#board').getBoundingClientRect();return h&&{x:c.x+(h.x+h.w/2)*c.width/720,y:c.y+(h.y+h.h/2)*c.height/MT.MM.UI.LAYOUT.H};},key);
 assert(point,'Missing mine control '+key);const b=await page.locator('iframe').boundingBox();await page.touchscreen.tap(b.x+point.x,b.y+point.y);await page.waitForTimeout(120);
}
async function guides(f){for(let i=0;i<8;i++){const b=f.locator('[data-action="guide-done"]');if(!await b.count())break;await b.click();}}
try{
 for(const id of ['tower','marble','mine','coop','liars','evolve','workshop','chess','nightwatch','rush']){
  const landscape=['marble','coop','liars','evolve','workshop','chess'].includes(id),errors=[];
  const ctx=await browser.newContext({viewport:landscape?{width:844,height:390}:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce',userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36 AdventureCampAndroid/1.18.0'});
  await ctx.addInitScript(()=>{window.CampOrientation={setLandscape(){}};window.CampHaptics={pulse(){}};window.CampLan={start(){return JSON.stringify({address:'192.168.3.24',url:'ws://192.168.3.24:38474/ws?v=1'});},stop(){},active(){return false;},poll(){return '[]';},send(){}};});
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  try{
   await page.goto(base+'/index.html');assert.equal(await page.locator('[data-action^="mode:"]').count(),10);
   await action(page,'mode:'+id);if(id==='coop')await action(page,'choice:1');await action(page,id==='coop'?'create-room':'preview');
   await page.waitForFunction(()=>document.querySelector('iframe')&&!document.querySelector('.game-loading'));
   const f=page.frames().find(f=>f.url().includes('/games/'+id+'/'));assert(f);await f.waitForFunction(()=>typeof render_game_to_text==='function');
   const checks=['合集入口加载'];
   if(id==='tower'){const skip=f.getByRole('button',{name:'跳过教程',exact:true});if(await skip.count())await skip.click();await f.evaluate(()=>CampBridge.control('ui-action',{action:'btnSave'}));await page.keyboard.press('ArrowDown');checks.push('跳过教学、合集保存桥接和移动输入');}
   if(id==='marble'){await action(f,'new');await f.evaluate(()=>advanceTime(500));assert(await f.locator('canvas').isVisible());checks.push('无尽新局');}
   if(id==='mine'){
    await f.evaluate(()=>{localStorage.setItem(MT.MM.Tutorial.KEY,'1');advanceTime(0);});
    await hit(page,f,'start');assert.equal(await f.evaluate(()=>MT.MM.Game.scene.hit.mineCards.length),4);await hit(page,f,'mineStart');await f.evaluate(()=>advanceTime(1600));
    await f.locator('canvas').focus();await page.keyboard.press('ArrowDown');await f.evaluate(()=>advanceTime(1400));assert((await read(f)).stats.digActions>=1);
    const saved=await read(f);assert(await f.evaluate(()=>MT.MM.Save.hasActiveRun()));
    await f.evaluate(()=>MT.MM.Game.setScene(new MT.MM.TitleScene()));await hit(page,f,'start');await hit(page,f,'mineResume');assert.equal((await read(f)).runId,saved.runId);assert.equal((await read(f)).depth,saved.depth);
    await f.evaluate(()=>{const m=MT.MM.Game.scene;m.run.maxDepthReached=5;m.run.playerY=0;advanceTime(0);});await f.locator('.mine-draft button').first().click();
    const chosen=(await read(f)).draft.chosen;assert.equal(chosen.length,1);await f.evaluate(()=>MT.MM.Game.setScene(new MT.MM.TitleScene()));await hit(page,f,'start');await hit(page,f,'mineResume');assert.deepEqual((await read(f)).draft.chosen,chosen);
    await hit(page,f,'end');await hit(page,f,'end');assert((await read(f)).settled);await hit(page,f,'exportRun');await f.locator('dialog[open]').waitFor();await f.getByRole('button',{name:'返回结算',exact:true}).click();checks.push('四矿区选择、挖掘、续玩、工具箱恢复、结算手记');
   }
   if(id==='coop'){assert.equal(await f.locator('.level-card').count(),50);await f.locator('#startSolo').click();await f.locator('#game:not(.hidden)').waitFor();await page.keyboard.press('ArrowRight');checks.push('50关单人接力开局');}
   if(id==='liars'){await f.locator('[data-do="match"]').click();await f.waitForFunction(()=>JSON.parse(render_game_to_text()).screen==='playing',null,{timeout:20000});assert.equal((await read(f)).game.players.length,4);checks.push('Android离线机器人匹配');}
   if(id==='evolve'){await action(f,'new');const s=await read(f);assert.equal(s.level||s.player?.level,1);checks.push('一级生物新局');}
   if(id==='workshop'){const s=await read(f);assert(await f.locator('canvas').isVisible());checks.push('手动经营开局');}
   if(id==='chess'){
    for(const kind of ['ddz3','ddz4','guandan','nanjing']){await clickVisible(f.locator(`[data-do="kind:${kind}"]`));await f.locator('[data-do="practice"]').click();await f.waitForFunction(()=>JSON.parse(render_game_to_text()).screen==='table');assert.equal((await read(f)).kind,kind);await f.locator('[data-do="auto"]').click();await page.waitForTimeout(250);await page.screenshot({path:out+'/chess-'+kind+'.png'});await f.locator('[data-do="back"]').click();await f.locator('[data-do="leave"]').click();await f.waitForFunction(()=>JSON.parse(render_game_to_text()).screen==='home');}checks.push('四种棋牌人机开局、托管和退出');
   }
   if(id==='nightwatch'){await action(f,'start');await guides(f);const s=await read(f);assert(s.battle);assert.equal(s.presentation.build,'20261001-motion-fix');assert.equal(s.presentation.reducedMotion,true);checks.push('守城新局、教学、减少动态效果下新版动画');}
   if(id==='rush'){await action(f,'start');assert.equal((await read(f)).screen,'playing');await f.evaluate(()=>advanceTime(500));checks.push('御剑新局');}
   await page.screenshot({path:out+'/'+id+'.png'});await fs.writeFile(out+'/'+id+'-state.json',JSON.stringify(await read(f),null,2));assert.deepEqual(errors,[]);report.push({id,passed:true,checks,errors});
  }catch(e){failures.push(id+': '+e.message);report.push({id,passed:false,error:e.message,errors});await page.screenshot({path:out+'/'+id+'-failure.png'}).catch(()=>{});}
  finally{await ctx.close();}
 }
 // The puzzle entry is independent from the endless entry and must load from the package.
 const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});await page.goto(base+'/index.html');await action(page,'mode:marble');await action(page,'choice:1');await action(page,'preview');await page.waitForFunction(()=>document.querySelector('iframe')&&!document.querySelector('.game-loading'));const f=page.frames().find(f=>f.url().includes('/games/marble/'));await f.waitForFunction(()=>typeof render_game_to_text==='function');await page.screenshot({path:out+'/marble-puzzle.png'});assert.deepEqual(errors,[]);report.push({id:'marble-puzzle',passed:true,state:await read(f),errors});await page.close();
}finally{await browser.close();await fs.writeFile(out+'/results.json',JSON.stringify({base,report,failures,realAndroidDevicesTested:false,nativeInterfaces:'simulated'},null,2));}
console.log(JSON.stringify({report:report.map(({id,passed,error})=>({id,passed,error})),failures}));assert.deepEqual(failures,[]);
