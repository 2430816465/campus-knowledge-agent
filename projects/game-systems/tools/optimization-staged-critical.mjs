import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const browser=await chromium.launch(),errors=[],report=[];
try{
 const p=await browser.newPage({viewport:{width:844,height:390},hasTouch:true});p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:4231/games/evolve/index.html');await p.locator('[data-action=new]').click();await p.waitForTimeout(700);const a=JSON.parse(await p.evaluate(()=>render_game_to_text()));assert.equal(a.phase,'playing');await p.screenshot({path:'artifacts/optimization-1.21.0/staged/evolve-playing.png'});report.push('evolve rendered live gameplay');
 await p.goto('http://127.0.0.1:4231/games/marble/index.html');await p.locator('[data-action=new]').click();await p.waitForTimeout(300);await p.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen();});await p.setViewportSize({width:390,height:844});await p.locator('#marble-rotate').waitFor({state:'visible'});assert.equal(await p.evaluate(()=>CampEconomyState().playing),false);await p.setViewportSize({width:844,height:390});await p.locator('#marble-rotate').waitFor({state:'hidden'});assert.equal(await p.evaluate(()=>CampEconomyState().playing),true);report.push('marble rotation blocks portrait combat and resumes landscape');
 await p.goto('http://127.0.0.1:4231/legal.html');assert.match(await p.locator('body').innerText(),/GPL/);const license=await p.request.get('http://127.0.0.1:4231/licenses/GPL-3.0.txt');assert.equal(license.status(),200);assert.match(await license.text(),/GNU GENERAL PUBLIC LICENSE/);report.push('offline notices and full GPL accessible');
 assert.deepEqual(errors,[]);await fs.writeFile('artifacts/optimization-1.21.0/staged-critical.json',JSON.stringify({report,errors},null,2));console.log(report);
}finally{await browser.close();}
