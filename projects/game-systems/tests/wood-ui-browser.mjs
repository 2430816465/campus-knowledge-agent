import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4215';
const out=process.env.REPORT_DIR||'artifacts/wood-ui-1.16.0';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});const report=[];
try{
 for(const size of [{width:390,height:844},{width:360,height:640},{width:844,height:390},{width:1280,height:800}]){
  const context=await browser.newContext({viewport:size,hasTouch:true,reducedMotion:'reduce'});const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  await page.goto(base);await page.locator('[data-action="settings"]').click();
  await page.waitForFunction(()=>[...document.images].every(i=>i.complete));
  const modal=page.locator('dialog');assert.equal(await modal.getAttribute('data-kind'),'settings');
  await page.screenshot({path:`${out}/settings-${size.width}.png`});
  const rect=await modal.boundingBox();assert(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=size.width+1&&rect.y+rect.height<=size.height+1,'Modal outside viewport');
  await page.locator('[data-volume="soundVolume"]').fill('35');
  assert.equal(await page.locator('[data-volume="soundVolume"]+output').textContent(),'35');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('adventure-camp-demo-v1')).settings.soundVolume),35);
  await page.locator('[data-action="settings-tab:controls"]').click();await page.locator('[data-setting="vibration"]').check();assert.equal(await page.locator('[data-setting="vibration"]+em').textContent(),'开');
  await page.locator('[data-action="settings-tab:controls"]').click();assert.equal(await page.locator('[data-setting="vibration"]').isChecked(),true);
  await page.locator('[data-action="settings-tab:display"]').click();await page.locator('[data-setting="reducedMotion"]').uncheck();assert.equal(await page.evaluate(()=>document.documentElement.dataset.reduceMotion),'false');
  await page.locator('[data-action="settings-tab:sound"]').click();await page.locator('[data-action="wood-defaults"]').click();
  assert.equal(await page.locator('[data-volume="soundVolume"]').inputValue(),'80');
  await page.locator('dialog [data-action="close"]').last().click();await page.reload();await page.locator('[data-action="settings"]').click();assert.equal(await page.locator('[data-volume="soundVolume"]').inputValue(),'80');
  await page.locator('dialog [data-action="close"]').last().click();
  await page.locator('[data-action="mode:rush"]').evaluate(e=>window.ScreenPages?.reveal(e));await page.locator('[data-action="mode:rush"]').click();await page.locator('[data-action="preview"]').click();
  await page.waitForSelector('iframe');await page.waitForFunction(()=>!document.querySelector('.game-loading'));
  const frame=page.frames().find(f=>f.url().includes('/games/rush/'));
  assert.equal(await frame.evaluate(()=>WoodUI.build),'b-1.16.0');
  await page.locator('[data-action="menu"]').click();await page.waitForTimeout(300);await page.screenshot({path:`${out}/pause-${size.width}.png`});
  await page.locator('[data-action="menu-settings"]').click();await page.locator('[data-volume="soundVolume"]').fill('25');
  await frame.waitForFunction(()=>WoodUI.preferences.soundVolume===25);
  const sample=await frame.evaluate(async()=>{const c=new OfflineAudioContext(1,480,48000),source=c.createConstantSource();source.offset.value=1;source.connect(c.destination);source.start();const b=await c.startRendering();return b.getChannelData(0)[200];});
  assert(Math.abs(sample-.25)<.001,'Actual audio destination volume did not follow slider');
  await page.locator('dialog [data-action="close"]').last().click();assert.equal(await modal.getAttribute('data-kind'),'menu');
  await page.locator('.wood-continue').click();assert.equal(await modal.evaluate(el=>el.open),false);
  await page.locator('[data-action="menu"]').click();await page.locator('[data-action="exit-game"]').evaluate(e=>window.ScreenPages?.reveal(e));await page.locator('[data-action="exit-game"]').click();await page.locator('[data-action="exit-confirm"]').click();
  assert.equal(await page.locator('[data-action^="mode:"]').count(),10);
  assert.deepEqual(errors,[]);report.push({size,passed:true,errors,checks:['settings tabs','real volume persistence','switch labels','defaults','reduced-motion','frame preferences','pause-settings-return','resume-exit','viewport bounds']});
  await context.close();
 }
 await fs.writeFile(out+'/results.json',JSON.stringify(report,null,2));console.log('PASS four viewport settings and menu flows');
}finally{await browser.close();}
