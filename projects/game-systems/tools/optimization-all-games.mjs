import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
const out='artifacts/optimization-1.21.0';const browser=await chromium.launch();const report=[];
for(const viewport of [{width:360,height:640},{width:390,height:844},{width:640,height:360},{width:844,height:390}]){
 for(const id of ['tower','marble','mine','coop','liars','evolve','workshop','chess','nightwatch','rush']){
 const p=await browser.newPage({viewport,hasTouch:true});const errors=[],requests=[];p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)requests.push({url:r.url(),status:r.status()})});
 try{
 await p.goto('http://127.0.0.1:4230/');
 for(let n=0;n<6&&!await p.locator(`[data-action="mode:${id}"]`).count();n++)await p.locator('[data-action="catalog-next:games"]').click();
 await p.locator(`[data-action="mode:${id}"]`).click();
 if(id==='coop')await p.locator('[data-action="choice:1"]').click();
 await p.locator(`[data-action="${id==='coop'?'create-room':'preview'}"]`).click();
 await p.waitForFunction(()=>document.querySelector('iframe')&&!document.querySelector('.game-loading'),{timeout:20000});
 await p.waitForTimeout(500);
 const f=p.frames().find(f=>f.url().includes('/games/'));
 const initial=await f.evaluate(()=>({text:document.body.innerText.slice(0,6500),buttons:[...document.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height).map(e=>({text:e.innerText,action:e.dataset.action,id:e.id}))}));
 await p.screenshot({path:`${out}/${id}-${viewport.width}-entry.png`});
 const metrics=await f.evaluate(()=>({width:innerWidth,height:innerHeight,scrollX:document.documentElement.scrollWidth-innerWidth,scrollY:document.documentElement.scrollHeight-innerHeight,buttons:[...document.querySelectorAll('button')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'}).map(e=>{const r=e.getBoundingClientRect();return {text:e.innerText.slice(0,30),w:Math.round(r.width),h:Math.round(r.height),outside:r.x<0||r.y<0||r.right>innerWidth+1||r.bottom>innerHeight+1}}),state:window.render_game_to_text?.(),resources:performance.getEntriesByType('resource').map(r=>({url:r.name,bytes:r.decodedBodySize}))}));
 report.push({id,viewport,initial,metrics,errors,requests});console.log(id,viewport.width,'ok',errors.length,'errors');
 }catch(e){report.push({id,viewport,error:e.message,errors,requests});console.log(id,viewport.width,e.message.slice(0,150))}finally{await p.close()}
 await fs.writeFile(`${out}/browser-audit.json`,JSON.stringify(report,null,2));
 }}await browser.close();
