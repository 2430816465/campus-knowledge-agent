import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='artifacts/optimization-1.21.0',browser=await chromium.launch(),report=[];
const p=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
const errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto('http://127.0.0.1:4230/games/mine/index.html');await p.waitForTimeout(500);
 async function tapHit(key){const rect=await p.evaluate(k=>window.MT.MM.Game.scene.hit[k],key);assert.ok(rect,key);const box=await p.locator('canvas').boundingBox();const size=await p.locator('canvas').evaluate(e=>({w:e.width,h:e.height}));await p.mouse.click(box.x+(rect.x+rect.w/2)*box.width/size.w,box.y+(rect.y+rect.h/2)*box.height/size.h);await p.waitForTimeout(120);}
 assert.equal(await p.evaluate(()=>!!window.MT.MM.Game.scene.hit.more),true);
 await tapHit('more');assert.equal(await p.evaluate(()=>window.MT.MM.Game.scene.moreOpen),true);
 await p.goto('http://127.0.0.1:4230/games/mine/index.html');await p.waitForTimeout(200);await tapHit('start');assert.equal(await p.evaluate(()=>window.MT.MM.Game.scene.minePickerOpen),true);await p.screenshot({path:out+'/mine-picker.png'});
 await p.goto('http://127.0.0.1:4230/games/mine/index.html?start=1');await p.waitForTimeout(250);assert.equal(JSON.parse(await p.evaluate(()=>render_game_to_text())).scene,'MiningMode');
 await p.evaluate(()=>{const s=MT.MM.Game.scene,original=s.update;s.update=function(){s.update=original;throw Error('QA injected one-shot fault');};});
 await p.locator('#mine-recovery').waitFor();await p.getByRole('button',{name:'恢复本局',exact:true}).click();await p.waitForTimeout(250);assert.equal(await p.locator('#mine-recovery').count(),0);report.push({mine:'compact menu, mine picker and one-shot fault recovery passed'});
 await p.goto('http://127.0.0.1:4230/games/tower/index.html?camp=1');await p.waitForTimeout(200);const skip=p.getByRole('button',{name:'跳过教程',exact:true});if(await skip.isVisible())await skip.click();
 const checkpoint=await p.evaluate(()=>{const g=MT.Game;g.G.hero.hp=777;g.save(false);g.G.hero.hp=444;g.save(true);g.load(true);return g.G.hero.hp;});assert.equal(checkpoint,777);await p.reload();await p.waitForTimeout(200);assert.equal(await p.evaluate(()=>MT.Game.G.hero.hp),777);report.push({tower:'manual checkpoint independent from automatic saves passed'});
 await p.goto('http://127.0.0.1:4230/');
 const status=await p.evaluate(async()=>{localStorage.removeItem('adventure-camp.test-ads.v1');const task=CampAds.show('qa','cancel','one');setTimeout(()=>CampAds.dismiss(),100);return task;});assert.equal(status.status,'cancelled');assert.equal(await p.evaluate(()=>localStorage.getItem('adventure-camp.test-ads.v1')),null);
 const completed=await p.evaluate(()=>CampAds.show('qa','complete','two'));assert.equal(completed.status,'completed');assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('adventure-camp.test-ads.v1')).receipts.length),1);report.push({ads:'native modal cancel without reward and one completed receipt passed'});
 assert.deepEqual(errors,[]);await fs.writeFile(out+'/focused-verification.json',JSON.stringify({report,errors},null,2));console.log(report);
}finally{await browser.close();}
