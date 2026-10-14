import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
const out='artifacts/optimization-1.21.0';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));const report=[];
async function measure(name){await page.waitForTimeout(220);const item=await page.evaluate(name=>{
 const root=document.querySelector('#management:not([hidden]) #panel-body')||document.querySelector('#main'),r=root.getBoundingClientRect();
 const buttons=[...root.querySelectorAll('button')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
 return {name,height:innerHeight,documentScroll:document.documentElement.scrollHeight-innerHeight,bodyScroll:root.scrollHeight-root.clientHeight,clipped:buttons.filter(e=>{const b=e.getBoundingClientRect();return b.top<r.top-1||b.bottom>r.bottom+1||b.left<r.left-1||b.right>r.right+1}).map(e=>e.textContent.trim()),small:buttons.filter(e=>e.getBoundingClientRect().height<39).map(e=>e.textContent.trim())};
 },name);report.push(item);await page.screenshot({path:out+'/'+name+'.png'});}
for(const [width,height] of [[390,844],[360,640],[844,390],[640,360]]){
 await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:4230');
 for(const id of ['home','tasks','collection','profile']){if(id!=='home')await page.locator('.nav [data-action="nav:'+id+'"]').click();await measure(id+'-'+width);}
 await page.goto('http://127.0.0.1:4230/games/workshop/index.html');await page.waitForTimeout(500);await page.locator('#guide-skip').evaluate(e=>e.click());
 for(const id of ['production','orders','recipe','business','settings','sky']){await page.locator('[data-open="'+id+'"]').first().evaluate(e=>e.click());await measure('bakery-'+id+'-'+width);}
 await page.locator('[data-tab="production"]').click();await page.locator('[data-device-detail="machine-0"]').click();await measure('bakery-device-'+width);
}
await fs.writeFile(out+'/report.json',JSON.stringify({report,errors},null,2));console.log(JSON.stringify({report,errors}));await browser.close();
