import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const out=fileURLToPath(new URL('../artifacts/ui-restoration-1.22.0/',import.meta.url)),base=process.env.UI_URL||'http://127.0.0.1:4230/';
const b=await chromium.launch(),report=[],errors=[],requests=[];
try{
for(const [id,choice] of [['tower',0],['marble',0],['marble',1],['mine',0],['coop',1],['coop',0],['liars',0],['evolve',0],['workshop',0],['chess',0],['nightwatch',0],['rush',0]]){
 const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});p.on('pageerror',e=>errors.push({id,error:e.message}));p.on('response',r=>{if(r.status()>=400)requests.push({id,url:r.url(),status:r.status()})});
 await p.goto(base);await p.locator(`[data-action="mode:${id}"]`).click();await p.locator(`[data-action="choice:${choice}"]`).click();
 await p.locator(`[data-action="${id==='coop'?'create-room':'preview'}"]`).click();
 await p.waitForFunction(()=>document.querySelector('iframe.game-frame')&&!document.querySelector('.game-loading'),null,{timeout:20000});
 const f=p.frames().find(f=>f.url().includes('/games/'));assert.ok(f?.url().includes('/games/'+id+'/'));
 await p.waitForTimeout(400);await p.screenshot({path:`${out}/entry-${id}-${choice}.png`});report.push({type:'entry',id,choice,url:f.url()});await p.close();console.log('Entered',id,choice);
}
const p=await b.newPage({viewport:{width:390,height:844},hasTouch:true});p.on('pageerror',e=>errors.push({flow:'collection',error:e.message}));
await p.goto(base);await p.locator('.nav [data-action="nav:collection"]').click();
await p.locator('.item-preview[data-action="product:rose-orb"]').click();await p.locator('[data-action="buy:rose-orb"]').click();
assert.ok((await p.locator('.topbar .wallet').innerText()).includes('20'));
await p.locator('#modal [data-action="equip:rose-orb"]').click();await p.locator('#modal [data-action="close"]').click();
assert.equal(await p.locator('.item-card.equipped h2').innerText(),'桃霞弹珠');await p.reload();
await p.locator('.nav [data-action="nav:collection"]').click();assert.equal(await p.locator('.item-card.equipped h2').innerText(),'桃霞弹珠');
await p.locator('.item-card [data-action="equip:rose-orb"]').click();assert.equal(await p.locator('.item-card.equipped').count(),0);
await p.locator('[data-action="tab:avatars"]').click();await p.locator('.item-preview').first().click();assert.ok((await p.locator('#modal').innerText()).includes('余额不足'));
await p.locator('#modal [data-action="close"]').click();
await p.locator('.nav [data-action="nav:profile"]').click();await p.locator('[data-action="settings"]').click();
for(const tab of ['sound','controls','display']){await p.locator(`[data-action="settings-tab:${tab}"]`).click();assert.ok(await p.locator('#modal').evaluate(e=>e.scrollHeight<=e.clientHeight+1));}
await p.locator('#modal [data-action="close"]').first().click();report.push({type:'purchase-equip-save-and-settings',coins:20});
await p.evaluate(()=>{const k='adventure-camp-demo-v1',s=JSON.parse(localStorage.getItem(k));s.owned.push('camp-lights','camp-shelf');s.equipped.push('camp-lights','camp-shelf');localStorage.setItem(k,JSON.stringify(s));});
await p.reload();await p.screenshot({path:`${out}/home-equipped.png`});assert.equal(await p.locator('.camp-playfield>.camp-shelf>span').count(),10);
assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
await p.locator('.nav [data-action="nav:collection"]').click();await p.locator('[data-action="tab:decor"]').click();await p.screenshot({path:`${out}/collection-decor.png`});
report.push({type:'decor-equipped',items:2});await p.close();assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
}catch(e){errors.push({assertion:e.stack});console.error(e.stack);process.exitCode=1;}
finally{await fs.writeFile(`${out}/flows-audit.json`,JSON.stringify({base,report,errors,requests},null,2));await b.close();}
