import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {initial} from '../services.js';
import {fresh,SAVE_KEY} from '../games/workshop/economy.js';
const out='artifacts/economy-v2/active',base='http://127.0.0.1:4192';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1100,height:650}}),p=await context.newPage(),errors=[];
p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
const wallet={...initial(),coins:2000,owned:['evolve-lotus','chess-bamboo','bakery-berry'],equipped:['evolve-lotus','chess-bamboo','bakery-berry']},bakery=fresh();bakery.lineBuilt=true;bakery.shop.facilities.rack=1;
await context.addInitScript(({wallet,bakery,key})=>{if(!sessionStorage.getItem('fixture')){localStorage.setItem('adventure-camp-demo-v1',JSON.stringify(wallet));localStorage.setItem(key,JSON.stringify(bakery));localStorage.setItem('demon-bakery-tutorial-v1','{"done":true}');sessionStorage.setItem('fixture','1');}},{wallet,bakery,key:SAVE_KEY});
for(const mode of ['evolve','workshop','chess','coop','marble']){
 await p.goto(base);await p.locator('[data-action="mode:'+mode+'"]').click();
 if(mode==='coop'){await p.locator('[data-action="choice:1"]').click();await p.locator('[data-action="create-room"]').click();}else await p.locator('[data-action="preview"]').click();
 await p.waitForSelector('iframe');const f=await (await p.locator('iframe').elementHandle()).contentFrame();await f.waitForSelector('#camp-wallet-chip');
 if(mode==='evolve')await f.locator('[data-action="new"]').click();
 if(mode==='workshop'){await f.waitForFunction(()=>JSON.parse(render_game_to_text()).assetsReady);if(await f.locator('#guide-skip').isVisible())await f.locator('#guide-skip').click();}
 if(mode==='chess')await f.locator('[data-do="practice"]').click();
 if(mode==='coop'){await f.locator('#startSolo').click();if(await f.locator('#guideSkip').isVisible())await f.locator('#guideSkip').click();}
 if(mode==='marble')await f.locator('[data-action="new"]').click();
 await p.waitForTimeout(300);const info=await f.evaluate(async mode=>{const {progressSnapshot}=await import('/economy-observer.js');return {state:JSON.parse(render_game_to_text()),sample:progressSnapshot(mode,window),cosmetics:window.CampCosmetics};},mode);
 assert.equal(info.sample?.playing,true,mode+' active adapter');assert(info.cosmetics.includes('evolve-lotus'));
 await fs.writeFile(out+'/'+mode+'.json',JSON.stringify(info,null,2));await p.screenshot({path:out+'/'+mode+'.png'});
}
await p.goto(base);await p.evaluate(async()=>{const {createServices}=await import('/services.js'),{platform}=await import('/platform.js');createServices(platform).progress({id:'ad-browser',mode:'evolve',seconds:120,units:8});});await p.reload();await p.locator('[data-action="wallet"]').first().click();
assert.equal(await p.locator('[data-action="wallet-ad:progress-ad-browser"]').count(),1);await p.screenshot({path:out+'/wallet.png'});
const before=await p.evaluate(()=>JSON.parse(localStorage.getItem('adventure-camp-demo-v1')).coins);
await p.locator('[data-action="wallet-ad:progress-ad-browser"]').click();await p.waitForFunction(expected=>JSON.parse(localStorage.getItem('adventure-camp-demo-v1')).coins===expected,before+2);
assert.equal(await p.locator('[data-action="wallet-ad:progress-ad-browser"]').count(),0);
await fs.writeFile(out+'/errors.json',JSON.stringify(errors));await browser.close();assert.deepEqual(errors,[]);console.log('PASS five actual playing adapters, equipped cosmetic rendering, wallet ad offer, no resource errors');
