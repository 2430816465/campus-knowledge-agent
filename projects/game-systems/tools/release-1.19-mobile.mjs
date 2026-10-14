import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
const b=await chromium.launch();const results=[];const errors=[];
for(const [width,height] of [[360,640],[390,844],[640,360],[844,390]]){
 const p=await b.newPage({viewport:{width,height},hasTouch:true});p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:4210');await p.locator('[data-action="nav:profile"]').first().click();await p.locator('[data-action="settings"]').click();
 for(const tab of ['sound','controls','display']){await p.locator('[data-action="settings-tab:'+tab+'"]').click();await p.waitForTimeout(80);const r=await p.locator('#modal').evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,scroll:el.scrollHeight-el.clientHeight,clipped:[...el.querySelectorAll('button,input')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&(r.top<0||r.bottom>innerHeight||r.left<0||r.right>innerWidth)}).map(e=>e.textContent||e.ariaLabel)}});results.push({width,height,tab,...r});}
 await p.screenshot({path:`artifacts/release-1.19.0/settings-${width}.png`});await p.close();
}
const p=await b.newPage({viewport:{width:390,height:844}});for(const id of ['tower','marble','mine','coop','liars','evolve','workshop','chess','nightwatch','rush']){await p.goto('http://127.0.0.1:4210/games/'+id+'/index.html');await p.waitForTimeout(250);results.push({game:id,emphasis:await p.evaluate(()=>[...document.querySelectorAll('button')].filter(x=>/返回营地|结束本局|结束并结算|结束并领取/.test(x.textContent)).map(x=>({text:x.textContent,marked:x.classList.contains('camp-important-action'),color:getComputedStyle(x).color})))})}await fs.writeFile('artifacts/release-1.19.0/mobile-audit.json',JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors}));await b.close();

