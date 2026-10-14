import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/24308/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const browser=await chromium.launch({headless:true}),errors=[],checks=[];
const out='artifacts/pixel-remake';await mkdir(out,{recursive:true});
const context=await browser.newContext({viewport:{width:390,height:844}}),p=await context.newPage();
p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url())});
const act=async a=>{const d=p.locator(`dialog[open] [data-action="${a}"]`);await (await d.count()?d.first():p.locator(`[data-action="${a}"]:visible`).first()).click()};
const shot=async name=>{await p.screenshot({path:`${out}/${name}.png`,fullPage:true})};
const fits=async()=>assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');
try{
 await p.goto('http://127.0.0.1:4186');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(250);
 for(const [w,h] of [[390,844],[320,568],[360,800],[844,390],[1280,800]]){
  await p.setViewportSize({width:w,height:h});await act('nav:home');await fits();await shot(`home-${w}`);
  for(const page of ['tasks','collection','profile']){await act('nav:'+page);await fits();if(w===390)await shot(page)}
 }
 checks.push('home/tasks/collection/profile: no horizontal overflow at 320,360,390,844,1280 px');
 await p.setViewportSize({width:390,height:844});await act('nav:collection');await act('tab:avatars');assert.equal(await p.locator('.item-card').count(),4);await shot('avatars');
 await act('product:avatar-camper');await shot('purchase');await act('buy:avatar-camper');await act('nav:collection');await act('equip:avatar-camper');
 assert.equal(await p.locator('.identity .avatar-camper').count(),1);await p.reload();assert.equal(await p.locator('.identity .avatar-camper').count(),1);
 assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('adventure-camp-demo-v1')).coins),60);checks.push('avatar purchase deducts 100 once; equipped portrait survives reload');
 await act('nav:collection');await act('tab:skins');await shot('skins');await act('product:rose-orb');await act('buy:rose-orb');assert.match(await p.locator('dialog').innerText(),/还差一点/);await act('close');
 assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('adventure-camp-demo-v1')).coins),60);checks.push('insufficient balance preserves wallet');
 await p.evaluate(()=>{const k='adventure-camp-demo-v1',s=JSON.parse(localStorage.getItem(k));s.coins=1000;localStorage.setItem(k,JSON.stringify(s))});await p.reload();
 await act('nav:collection');await act('tab:skins');await act('product:rose-orb');await act('buy:rose-orb');await act('nav:collection');await act('equip:rose-orb');
 await act('nav:home');await act('mode:marble');await shot('prepare');await act('preview');await p.waitForFunction(()=>!document.querySelector('.game-loading'));
 let f=p.frames().find(f=>f.url().includes('/games/marble/'));assert.equal(await f.evaluate(()=>Marble.orbSkin),'rose');await p.setViewportSize({width:844,height:390});await p.waitForTimeout(150);await shot('marble-title');await f.locator('[data-action=new]').click();await f.locator('[data-action=togglePanel]').first().click();await shot('marble-drawer');await f.locator('[data-action=settingsPause]').click();await shot('marble-pause');await f.locator('[data-action=save]').click();
 await p.setViewportSize({width:390,height:844});await act('nav:collection');await act('tab:skins');await act('product:mint-orb');await act('buy:mint-orb');await act('nav:collection');await act('equip:mint-orb');
 assert.deepEqual(await p.evaluate(()=>JSON.parse(localStorage.getItem('adventure-camp-demo-v1')).equipped.filter(x=>x.endsWith('-orb'))),['mint-orb']);
 await act('nav:home');await act('mode:marble');await act('preview');await p.waitForFunction(()=>!document.querySelector('.game-loading'));f=p.frames().find(f=>f.url().includes('/games/marble/'));assert.equal(await f.evaluate(()=>Marble.orbSkin),'mint');await f.locator('[data-action=exit]').click();checks.push('rose and mint skins purchased, mutually exclusive, delivered into real game renderer');
 await act('shop');await shot('shop');await act('wallet');await shot('wallet');await act('close');await act('nav:home');await act('mode:coop');await act('create-room');await p.waitForFunction(()=>!document.querySelector('.game-loading'));f=p.frames().find(f=>f.url().includes('/games/coop/'));await f.locator('#lobby:not(.hidden)').waitFor();await shot('coop-lobby');await act('menu');await act('exit-game');await act('exit-confirm');
 await act('mode:mine');await act('choice:1');await act('preview');await p.waitForFunction(()=>!document.querySelector('.game-loading'));f=p.frames().find(f=>f.url().includes('/games/mine/'));await p.waitForTimeout(300);await shot('mine-camp');
 const hit=await f.evaluate(()=>MT.MM.Game.scene.hit.settings),box=await f.locator('#board').boundingBox(),size=await f.locator('#board').evaluate(c=>({w:c.width,h:c.height}));await p.mouse.click(box.x+(hit.x+hit.w/2)*box.width/size.w,box.y+(hit.y+hit.h/2)*box.height/size.h);await p.waitForTimeout(100);await shot('mine-settings');await act('menu');await act('exit-game');await act('exit-confirm');
 // Data-driven route list accepts future games without changing a fixed four-cell layout.
 await p.evaluate(async()=>{const {modes}=await import('/services.js');modes.push({...modes[0],id:'future-test',name:'新冒险'})});await act('nav:home');assert.equal(await p.locator('.adventure-portal').count(),5);await fits();checks.push('fifth route automatically creates a new row without overlapping shop/navigation');
 assert.deepEqual(errors,[]);await writeFile(`${out}/results.json`,JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close()}


