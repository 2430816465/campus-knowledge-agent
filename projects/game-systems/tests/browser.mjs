import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
let chromium;try{({chromium}=require('playwright'))}catch{({chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/24308/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'))}
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
const errors=[],report=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url())});
const act=a=>page.locator(`[data-action="${a}"]`).first().click();
const balance=async()=>Number((await page.locator('.topbar .wallet b').textContent()).replaceAll(',',''));
const shot=async name=>page.screenshot({path:`artifacts/polish/${name}.png`,fullPage:true});
const noOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'horizontal overflow');
await mkdir('artifacts/polish',{recursive:true});
try{
 await page.goto('http://127.0.0.1:4173/?dev=1');await page.evaluate(()=>localStorage.clear());await page.reload();
 await page.waitForFunction(()=>[...document.images].every(i=>i.complete));
 for(const [w,h] of [[390,844],[360,800],[844,390],[1440,1080]]){await page.setViewportSize({width:w,height:h});await noOverflow();await shot(`home-${w}`);if(w<600){const bottom=await page.locator('.mode-grid').evaluate(e=>e.getBoundingClientRect().bottom);assert(bottom<h-60,'four mode cards fit above navigation')}report.push(`Layout ${w}×${h}: no horizontal overflow, screenshot captured`)}
 await page.setViewportSize({width:390,height:844});
 for(const id of ['tower','guard','mine','coop']){
  await act('mode:'+id);await noOverflow();await shot('prepare-'+id);
  await act('choice:1');assert.equal(await page.locator('[data-action="choice:1"]').getAttribute('aria-pressed'),'true');
  await act('help');await act('close');
  if(id==='coop'){
   await act('join-room');await page.locator('#room-input').fill('000000');await act('join-submit');await page.getByText('房间不存在。演示房间码为 246810').waitFor();
   await page.locator('#room-input').fill('888888');await act('join-submit');await page.getByText('房间已满，请使用其他房间码').waitFor();await act('close');
   await act('create-room');assert(await page.locator('[data-action="preview"]').isDisabled());await shot('room-waiting');
   await page.locator('.developer summary').click();
   for(const state of ['joined','disconnected','failed','waiting','ready']){await page.locator('#room-state').selectOption(state);await noOverflow()}
   await act('ready');assert(await page.locator('[data-action="preview"]').isEnabled());await shot('room-ready');
  }
  await act('preview');await noOverflow();await shot('preview-'+id);await act('menu');await act('close');
  await act('finish:win');await shot('result-'+id);const base=await balance();await page.reload();assert.equal(await balance(),base,'base reward persists on refresh');
  // A page reload intentionally returns to the camp; retained rewards must not be repeated.
  report.push(`${id}: preparation, selection, help, preview, menu, settlement and persisted reward passed`);
 }
 await act('nav:tasks');const beforeClaim=await balance();await act('claim:first');assert.equal(await balance(),beforeClaim+50);assert(await page.getByRole('button',{name:'已领取',exact:true}).isDisabled());await page.reload();await act('nav:tasks');assert(await page.getByRole('button',{name:'已领取',exact:true}).isDisabled());
 await act('tab:achievements');await act('claim:all');report.push('Tasks: claim, persisted claimed state, four-mode achievement passed');
 await act('nav:home');await act('shop');await act('product:pick');const beforePoor=await balance();await act('buy:pick');await page.getByRole('heading',{name:'还差一点冒险币'}).waitFor();assert.equal(await balance(),beforePoor);await act('close');
 await act('product:scarf');const beforeBuy=await balance();await act('buy:scarf');assert.equal(await balance(),beforeBuy-120);await act('nav:collection');await act('equip:scarf');assert(await page.locator('.topbar .avatar').evaluate(e=>e.classList.contains('red')));await shot('collection');report.push('Store: insufficient funds, exchange, permanent ownership and equip passed');
 await act('nav:profile');await page.locator('[data-setting="vibration"]').check();await page.reload();await act('nav:profile');assert(await page.locator('[data-setting="vibration"]').isChecked());report.push('Settings persist across reload');
 await act('nav:home');await act('mode:tower');await act('preview');await act('finish:lose');
 if(!(await page.locator('.developer').evaluate(e=>e.open)))await page.locator('.developer summary').click();
 for(const outcome of ['cancel','unavailable','complete']){await page.locator('#ad-outcome').selectOption(outcome);const before=await balance();await act('ad');await page.waitForFunction(()=>!document.querySelector('#modal').open);assert.equal(await balance(),before+(outcome==='complete'?20:0));}
 assert(await page.locator('[data-action="ad"]').isDisabled());await shot('result-ad-claimed');report.push('Ads: early close / unavailable preserve base, completed adds 20 once');
 await act('nav:home');await act('mode:coop');await act('join-room');await page.locator('#room-input').fill('246810');await act('join-submit');await act('leave-room');await page.getByRole('heading',{name:'再闯一关',exact:true}).waitFor();report.push('Join as teammate and leave room passed');
 await act('nav:home');await page.setViewportSize({width:360,height:800});await act('shop');await act('product:pick');await noOverflow();await shot('modal-360');await act('close');
 await act('nav:home');await act('mode:coop');await act('create-room');
 if(!(await page.locator('.developer').evaluate(e=>e.open)))await page.locator('.developer summary').click();
 await page.locator('#room-state').selectOption('ready');await act('ready');await act('preview');
 await page.setViewportSize({width:844,height:390});await noOverflow();await shot('preview-coop-landscape');
 await act('finish:win');await act('peer-ad');await page.getByText('队友（模拟）：正在领取额外奖励').waitFor();
 await act('coop-next');assert(await page.locator('[data-action="ad"]').isDisabled());await act('peer-next');await act('coop-next');await page.locator('.room-panel').waitFor();
 report.push('Co-op result: peer ad status, own ready hides ad opportunity, both ready return to next chapter room');
 await act('leave-room');await act('nav:home');await act('wallet');await page.keyboard.press('Escape');assert.equal(await page.locator('#modal').evaluate(e=>e.open),false);
 await act('reset');await act('reset-confirm');assert.equal(await balance(),160);await page.reload();assert.equal(await balance(),160);report.push('Escape closes modal, reset clears and persists demo data');
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.mode-card').first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
 assert.deepEqual(errors,[]);report.push('No page errors or failed HTTP resources');
 await writeFile('artifacts/polish/flows.json',JSON.stringify({time:new Date().toISOString(),checks:report,errors},null,2));console.log(report.join('\n'));
}finally{await browser.close()}

