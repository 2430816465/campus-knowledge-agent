import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4196',version=JSON.parse(await fs.readFile('package.json','utf8')).version,dir=process.env.REPORT_DIR||'artifacts/endless-remake-20261001';
await fs.mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true}),report=[];
try{for(const id of ['tower','marble','mine','coop','liars','evolve','workshop']){
 const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36 AdventureCampAndroid/'+version}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url())});await page.goto(base+'/index.html');
 await page.locator(`[data-action="mode:${id}"]`).click();if(id==='coop')await page.locator('[data-action="choice:1"]').click();await page.locator(`[data-action="${id==='coop'?'create-room':'preview'}"]`).click();await page.waitForFunction(()=>document.querySelector('iframe')&&!document.querySelector('.game-loading'));
 const f=page.frames().find(f=>f.url().includes(`/games/${id}/`));assert(f);await f.waitForFunction(()=>typeof render_game_to_text==='function');
 if(id==='marble'){await f.locator('[data-action=new]').click();await f.evaluate(()=>{Marble.run.powers.fire=3;Marble.offerNext();Marble.persist();advanceTime(0)});await f.locator('[data-action="imprint:nova"]').click();assert.equal(await f.evaluate(()=>Marble.run.fireBranch),'nova');await f.locator('[data-action=pause]').click();await f.locator('[data-action=save]').click();await page.waitForFunction(()=>!document.querySelector('iframe'));}
 if(id==='evolve'){await f.locator('[data-action=new]').click();const state=await f.evaluate(()=>JSON.parse(render_game_to_text()));assert(state.level===1||state.player?.level===1);}
 if(id==='coop'){await f.locator('#soloMode[aria-pressed=true]').waitFor();assert.equal(await f.locator('.level-card').count(),50);await f.locator('#startSolo').tap();await f.locator('#game:not(.hidden)').waitFor();}
 if(id==='liars'){assert.equal(await f.locator('#name').count(),1);}
 await page.waitForTimeout(100);assert.deepEqual(errors,[]);report.push({id,errors,entry:true});await page.close();
 }}finally{await browser.close()}
await fs.writeFile(dir+'/packed-six-mode-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
