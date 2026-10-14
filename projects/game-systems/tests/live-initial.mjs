import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/24308/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const browser=await chromium.launch({headless:true});const results=[];
await mkdir('artifacts/live',{recursive:true});
for(const id of ['tower','guard','mine','coop']){
 const context=await browser.newContext({viewport:{width:id==='coop'?1280:390,height:id==='coop'?800:844}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url())});
 await page.goto('http://127.0.0.1:4173/');await page.locator(`[data-action="mode:${id}"]`).click();await page.locator(`[data-action="${id==='coop'?'create-room':'preview'}"]`).click();
 await page.waitForSelector('.game-frame');await page.waitForTimeout(3500);
 const frame=page.frames()[1];if(!frame){console.log(id,errors,await page.locator('body').innerText());continue}const info=await frame.evaluate(()=>({title:document.title,body:document.body.innerText.slice(0,1800),state:window.render_game_to_text?.(),mt:Object.keys(window.MT||{}),overflow:document.documentElement.scrollWidth>innerWidth}));
 await page.screenshot({path:`artifacts/live/${id}-initial.png`,fullPage:true});results.push({id,errors,info,loading:await page.locator('.game-loading').count()});await context.close();
}
await writeFile('artifacts/live/initial.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));await browser.close();

