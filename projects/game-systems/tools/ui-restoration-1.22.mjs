import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const out=fileURLToPath(new URL('../artifacts/ui-restoration-1.22.0/',import.meta.url));
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch(),report=[],errors=[],requests=[];
const base=process.env.UI_URL||'http://127.0.0.1:4230/';
const modes=['tower','marble','mine','coop','liars','evolve','workshop','chess','nightwatch','rush'];
async function usable(p,el){
 await el.scrollIntoViewIfNeeded();
 const r=await el.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{width:r.width,height:r.height,hit:hit===e||e.contains(hit),bottom:r.bottom,viewport:innerHeight}});
 assert.ok(r.height>=43&&r.hit&&r.bottom<=r.viewport+1,JSON.stringify(r));
}
try{
for(const viewport of [{width:320,height:568},{width:360,height:640},{width:390,height:844},{width:568,height:320},{width:640,height:360},{width:844,height:390}]){
 const p=await browser.newPage({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:1});
 p.on('pageerror',e=>errors.push({viewport,error:e.message}));
 p.on('response',r=>{if(r.status()>=400)requests.push({url:r.url(),status:r.status()})});
 await p.goto(base);await p.evaluate(()=>document.fonts.ready);
 for(const id of ['home','tasks','collection','profile']){
  await p.locator(`.nav [data-action="nav:${id}"]`).click();await p.waitForTimeout(120);
  await p.evaluate(()=>window.scrollTo(0,0));
  const metrics=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,scroll:document.documentElement.scrollHeight-innerHeight,background:getComputedStyle(document.querySelector('.world-far')).backgroundImage,nav:document.querySelector('.nav').getBoundingClientRect().toJSON(),main:document.querySelector('#main').getBoundingClientRect().toJSON()}));
  assert.ok(metrics.overflow<=1,JSON.stringify({viewport,id,metrics}));assert.ok(metrics.background.includes('camp-landscape.svg'));
  assert.ok(metrics.nav.bottom<=viewport.height+1);
  if(id==='tasks'||id==='profile'){
   const clipped=await p.locator('#main button,#main .catalog-note').evaluateAll(es=>es.filter(e=>{const r=e.getBoundingClientRect(),m=document.querySelector('#main').getBoundingClientRect();return r.bottom>m.bottom+1||r.top<m.top-1}).map(e=>e.textContent));
   assert.deepEqual(clipped,[],JSON.stringify({viewport,id,clipped}));
  }
  if(id==='home')assert.equal(await p.locator('.adventure-portal[data-action^="mode:"]').count(),10);
  if(id==='collection'){
   assert.equal(await p.locator('.item-card').count(),17);
   const cards=await p.locator('.item-card').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect(),art=e.querySelector('.item-preview').getBoundingClientRect(),button=e.querySelector(':scope>.button').getBoundingClientRect();return{inside:art.left>=b.left&&art.right<=b.right&&art.bottom<button.top,y:b.y,buttonY:button.y,titleY:e.querySelector('h2').getBoundingClientRect().y}}));
   assert.ok(cards.every(c=>c.inside));for(let i=1;i<cards.length;i+=2){assert.equal(cards[i].buttonY,cards[i-1].buttonY);assert.equal(cards[i].titleY,cards[i-1].titleY);}
  }
  await p.screenshot({path:`${out}/${id}-${viewport.width}.png`});report.push({type:'tab',id,viewport,metrics});
 }
 await p.locator('.nav [data-action="nav:home"]').click();
 for(const id of modes){
  await p.locator(`[data-action="mode:${id}"]`).click();await p.waitForTimeout(80);
  assert.equal(await p.locator('.prepare.panel').count(),1);assert.equal(await p.locator('.prepare-art h1').count(),1);
  assert.equal(await p.locator('.prepare-compact').count(),0);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(id==='marble')assert.ok((await p.locator('.feature-tags').innerText()).includes('50'));
  if(id==='coop')assert.ok((await p.locator('.prepare').innerText()).includes('困难36关'));
  if(viewport.width===390&&id==='marble')await p.screenshot({path:`${out}/prepare-marble-390.png`});
  const choices=await p.locator('.choices button').count();
  for(let i=0;i<choices;i++){const c=p.locator(`[data-action="choice:${i}"]`);await c.click();assert.equal(await c.getAttribute('aria-pressed'),'true');}
  const action=id==='coop'?'create-room':'preview';await usable(p,p.locator(`[data-action="${action}"]`));
  if(id==='coop'){await p.locator('[data-action="choice:0"]').click();await usable(p,p.locator('[data-action="join-room"]'));}
  if(viewport.width===390&&id==='marble')await p.screenshot({path:`${out}/prepare-actions-390.png`});
  report.push({type:'prepare',id,viewport,choices});await p.locator('[data-action="nav:home"]').click();
 }
 await p.locator('.nav [data-action="nav:collection"]').click();
 const actions=await p.locator('.item-preview').evaluateAll(es=>es.map(e=>e.dataset.action));
 for(const a of actions){
  const el=p.locator(`.item-preview[data-action="${a}"]`);await el.click();
  const bounds=await p.locator('#modal').evaluate(e=>{const r=e.getBoundingClientRect();return{scroll:e.scrollHeight-e.clientHeight,top:r.top,bottom:r.bottom,viewport:innerHeight}});
  assert.ok(bounds.scroll<=1&&bounds.top>=0&&bounds.bottom<=bounds.viewport,JSON.stringify({viewport,a,bounds}));
  await usable(p,p.locator('#modal .product-decision>.button'));await p.locator('#modal [data-action="close"]').click();
 }
 for(const [tab,count]of [['avatars',4],['skins',11],['decor',2],['codex',10],['all',17]]){
  await p.locator(`[data-action="tab:${tab}"]`).click();
  assert.equal(await p.locator(tab==='codex'?'.codex-card':'.item-card').count(),count);
 }
 await usable(p,p.locator('.item-card').last().locator(':scope>.button'));
 report.push({type:'collection-interaction',viewport,products:actions.length});
 await p.close();console.log('Viewport checked',viewport.width,viewport.height);
}
assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
}catch(e){errors.push({assertion:e.stack});console.error(e.stack);process.exitCode=1;}
finally{await fs.writeFile(`${out}/ui-audit.json`,JSON.stringify({base,report,errors,requests},null,2));await browser.close();console.log('Checks',report.length,'errors',errors.length);}
