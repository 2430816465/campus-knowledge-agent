import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const b=await chromium.launch(),report=[],errors=[];
for(const viewport of [{width:360,height:640},{width:390,height:844},{width:640,height:360},{width:844,height:390}]){
 const p=await b.newPage({viewport,hasTouch:true});p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:4210');await p.locator('.nav [data-action="nav:collection"]').click();let n=0;
 for(let i=0;i<10;i++){
  const actions=await p.locator('.catalog-item').evaluateAll(a=>a.map(e=>e.dataset.action));
  for(const a of actions){await p.locator('[data-action="'+a+'"]').click();await p.waitForTimeout(100);const r=await p.locator('#modal').evaluate(e=>({scroll:e.scrollHeight-e.clientHeight,height:e.getBoundingClientRect().height,clipped:[...e.querySelectorAll('button')].filter(b=>{const r=b.getBoundingClientRect(),m=e.getBoundingClientRect();return r.top<m.top||r.bottom>m.bottom}) .map(b=>b.textContent)}));assert.equal(r.scroll,0,JSON.stringify({viewport,a,r}));assert.deepEqual(r.clipped,[]);n++;await p.locator('#modal [data-action="close"]').click()}
  const next=p.locator('[data-action^="catalog-next:collection"]');if(await next.isDisabled())break;await next.click();
 }
 assert.equal(n,17);await p.locator('[data-action="tab:codex"]').click();let codex=0;for(let i=0;i<5;i++){codex+=await p.locator('.catalog-item').count();const next=p.locator('[data-action^="catalog-next:collection"]');if(await next.isDisabled())break;await next.click()}assert.equal(codex,10);await p.screenshot({path:'artifacts/ui-redesign/codex-'+viewport.width+'.png'});report.push({viewport,productDetails:n,codex,noOverflow:true});await p.close();
}
assert.deepEqual(errors,[]);await fs.writeFile('artifacts/ui-redesign/collection-audit.json',JSON.stringify({report,errors},null,2));console.log(JSON.stringify({report,errors}));await b.close();
