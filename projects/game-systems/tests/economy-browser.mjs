import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1100,height:760}}),p=await context.newPage(),errors=[];
p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});await fs.mkdir('artifacts/economy-v2/browser',{recursive:true});
await p.goto('http://127.0.0.1:4192');await p.waitForSelector('[data-action="nav:tasks"]');await p.locator('[data-action="nav:tasks"]').click();await p.waitForTimeout(200);
assert.equal(await p.locator('.quest-detail').count(),4);await p.screenshot({path:'artifacts/economy-v2/browser/tasks.png',fullPage:true});
await p.evaluate(async()=>{
 const {createServices}=await import('/services.js'),{platform}=await import('/platform.js');const s=createServices(platform);
 for(let i=0;i<5;i++)s.progress({id:'ui-s'+i,mode:'evolve',seconds:120,units:10});
});await p.reload();await p.locator('[data-action="nav:tasks"]').click();const claim=p.locator('[data-action^="claim:daily-play:"]');assert.equal(await claim.count(),1);await claim.click();assert.equal(await p.locator('[data-action^="claim:daily-play:"]').count(),0);
await p.locator('[data-action="shop"]').first().click().catch(async()=>{await p.locator('[data-action="nav:home"]').first().click();await p.locator('[data-action="shop"]').first().click();});
assert.equal(await p.locator('[data-action="product:chess-bamboo"]').count(),1);await p.locator('[data-action="product:chess-bamboo"]').click();await p.locator('[data-action="buy:chess-bamboo"]').click();
const balance=await p.evaluate(()=>JSON.parse(localStorage.getItem('adventure-camp-demo-v1')).coins);assert.equal(balance,70);
await p.screenshot({path:'artifacts/economy-v2/browser/shop.png',fullPage:true});
await p.evaluate(async()=>{const {createServices}=await import('/services.js'),{platform}=await import('/platform.js');createServices(platform).equip('chess-bamboo');});
for(const mode of ['tower','marble','mine','coop','liars','evolve','workshop','chess','nightwatch','rush']){
 await p.goto('http://127.0.0.1:4192');await p.locator('[data-action="mode:'+mode+'"]').click();
 if(mode==='coop'){await p.locator('[data-action="choice:1"]').click();await p.locator('[data-action="create-room"]').click();}else await p.locator('[data-action="preview"]').click();
 await p.waitForSelector('iframe');const iframe=await p.locator('iframe').elementHandle(),f=await iframe.contentFrame();await f.waitForSelector('#camp-wallet-chip');await p.waitForTimeout(500);
 const info=await f.evaluate(async mode=>{const {progressSnapshot}=await import('/economy-observer.js');return {state:JSON.parse(window.render_game_to_text?.()||'{}'),sample:progressSnapshot(mode,window),theme:document.documentElement.dataset.campTheme};},mode);
 await fs.writeFile('artifacts/economy-v2/browser/'+mode+'.json',JSON.stringify(info,null,2));
 if(mode==='chess')assert.equal(info.theme,'bamboo');
 await p.screenshot({path:'artifacts/economy-v2/browser/'+mode+'.png'});
}
await fs.writeFile('artifacts/economy-v2/browser/errors.json',JSON.stringify(errors));await browser.close();assert.deepEqual(errors,[]);console.log('PASS tasks, dated claim action, purchase/equip, ten iframe integrations and console errors');
