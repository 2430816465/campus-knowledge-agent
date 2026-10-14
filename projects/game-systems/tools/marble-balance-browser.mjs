import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='output/endless-balance-v2/browser';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),reports=[];
for(const [name,url] of [['camp','http://127.0.0.1:4173/games/marble/index.html'],['standalone','http://127.0.0.1:4180/']]){
 const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,deviceScaleFactor:2}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
 await page.goto(url);await page.locator('[data-action=new]').click();await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>Marble.run.balanceRevision),2);assert.equal(await page.evaluate(()=>Marble.run.xpNeed),18);
 await page.screenshot({path:`${out}/${name}-early.png`});
 const b=await page.locator('#board').boundingBox();assert(b.width*b.height/(844*390)>.8);
 await page.mouse.move(b.x+b.width*.5,b.y+b.height*.85);await page.mouse.down();await page.mouse.move(b.x+b.width*.3,b.y+b.height*.25,{steps:5});await page.mouse.up();
 assert.equal(await page.evaluate(()=>Marble.run.phase),'flight');await page.waitForTimeout(100);assert(await page.evaluate(()=>impactAudio.played>0));await page.evaluate(()=>advanceTime(8500));assert.equal(await page.evaluate(()=>Marble.run.shot),1);
 await page.locator('[data-action=togglePanel]').first().click();await page.locator('[data-action=freeze]').click();await page.locator('#ad-result').selectOption('fail');await page.locator('[data-action=adStart]').click();await page.waitForTimeout(850);assert.equal(await page.evaluate(()=>Marble.run.freezeNext),true);assert.equal(await page.evaluate(()=>Marble.run.supportUsed),true);
 const cards=[];for(const tier of [0,1,2,3]){
  await page.evaluate(t=>{Marble.newRun(82);Marble.run.shot=10;Marble.run.selections=2;Marble.run.powers={extra:6};Marble.run.queue=Array(4).fill('basic');Marble.run.fireBranch='nova';Marble.makeOffer('upgrade');Marble.run.offer=[{id:'fire',tier:t},{id:'chain',tier:t},{id:'core',tier:t}];advanceTime(0)},tier);
  const text=await page.locator('.inline-cards').innerText();assert(text.includes(['普通','精品','史诗','传说'][tier]));assert(text.includes(`强化 +${[1,2,4,6][tier]} 点`));assert(!text.includes('每颗主弹珠爆炸'));
  cards.push(text);await page.waitForTimeout(450);await page.screenshot({path:`${out}/${name}-rarity-${tier}.png`});
  if(tier===1){
   await page.locator('[data-action="tierAd:fire"]').click();const preview=await page.locator('.ad-preview').innerText();assert(preview.includes('每发爆炸 0 → 2 次'));assert(preview.includes('每发爆炸 0 → 3 次'));assert(preview.includes('半径 0 → 40'));
   await page.locator('#ad-result').selectOption('cancel');await page.locator('[data-action=adStart]').click();await page.waitForTimeout(850);assert.equal(await page.evaluate(()=>Marble.run.offer[0].tier),1);assert.equal(await page.evaluate(()=>Marble.run.tierAdUsed),false);
   await page.locator('[data-action="tierAd:fire"]').click();await page.locator('[data-action=adStart]').click();await page.waitForTimeout(850);assert.equal(await page.evaluate(()=>Marble.run.offer[0].tier),2);
   await page.locator('[data-action="choose:fire"]').click();assert.equal(await page.evaluate(()=>Marble.run.powers.fire),4);assert.equal(await page.evaluate(()=>Marble.run.fireBranch),'nova');assert.equal(await page.evaluate(()=>Marble.run.phase),'aim');
   await page.reload();await page.locator('[data-action=continue]').click();assert.equal(await page.evaluate(()=>Marble.run.powers.fire),4);
  }
 }
 const stages=[];for(const shot of [30,70]){
  await page.evaluate(async shot=>{
   const d=await import('/'+(location.port==='4180'?'':'games/marble/')+'endless-data.js');Marble.newRun(77);const r=Marble.run;r.shot=shot;r.powers=Object.fromEntries(d.POWERS.filter(p=>p.id!=='heal').map(p=>[p.id,p.max]));r.queue=Array(d.ENDLESS.maxMain).fill('basic');r.fireBranch='nova';r.room.enemies=[];r.room.obstacles=[];Marble.spawn(d.pressure(shot).target);Marble.spawnBoss();r.nextBoss=9999;Marble.shoot(.35);advanceTime(950);
  },shot);
  await page.screenshot({path:`${out}/${name}-shot-${shot}-flight.png`});await page.evaluate(()=>advanceTime(7500));
  const state=await page.evaluate(()=>JSON.parse(render_game_to_text()));assert(state.volley.kills>80);assert(state.volley.xpGain<=45);assert(state.volley.generated<=32);for(const [id,n] of Object.entries(state.volley.procs))assert(n<=state.volley.limits[id]);
  if(shot===70)assert(state.enemies.some(e=>e.type==='boss'&&e.hp>0));stages.push({shot,kills:state.volley.kills,xp:state.volley.xpGain,procs:state.volley.procs,alive:state.enemies.length});await page.screenshot({path:`${out}/${name}-shot-${shot}-remaining.png`});
 }
 const leaks=await page.evaluate(()=>{Marble.newRun(22);const r=Marble.run;r.phase='descent';r.room.enemies=Array.from({length:40},(_,id)=>({id,type:'spirit',kind:'normal',x:30+id*10,y:325,r:4}));Marble.endDescent();advanceTime(0);return {hp:r.hp,lastLeak:r.lastLeak}});assert.equal(leaks.hp,7);
 await page.locator('[data-action=pause]').click();const t=await page.evaluate(()=>Marble.run.activeSeconds);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>Marble.run.activeSeconds),t);await page.locator('[data-action=resume]').click();
 assert.deepEqual(errors,[]);reports.push({name,fieldPercent:b.width*b.height/(844*390)*100,stages,leaks,errors,cards});await page.close();
}
await fs.writeFile(out+'/report.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports.map(({cards,...r})=>r)));await browser.close();
