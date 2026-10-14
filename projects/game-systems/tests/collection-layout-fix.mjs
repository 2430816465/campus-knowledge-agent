import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/24308/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const browser=await chromium.launch({headless:true});const p=await browser.newPage();const errors=[],checks=[];p.on('pageerror',e=>errors.push(e.message));
await mkdir('artifacts/collection-fix',{recursive:true});
try{
await p.goto('http://127.0.0.1:4186');
for(const width of [320,360,390,450,844]){
 await p.setViewportSize({width,height:900});await p.locator('[data-action="nav:collection"]').click();
 await p.evaluate(()=>document.fonts.ready);
 const issues=await p.evaluate(()=>[...document.querySelectorAll('.item-card')].flatMap(card=>{
 const art=card.querySelector('.item-art'),button=card.querySelector('.button'),title=card.querySelector('h2');const a=art.getBoundingClientRect(),c=card.getBoundingClientRect(),b=button.getBoundingClientRect(),t=title.getBoundingClientRect();
 return (getComputedStyle(art).position==='absolute'||a.left<c.left||a.right>c.right||a.bottom>t.top||t.bottom>b.top)?[card.innerText]:[];
 }));assert.deepEqual(issues,[],`card overlap at ${width}`);
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 checks.push(`all collection artwork stays inside card above title and exchange button at ${width}px`);
 if(width===390)await p.screenshot({path:'artifacts/collection-fix/collection-390.png',fullPage:true});
}
await p.setViewportSize({width:390,height:844});
for(const id of ['camp-lights','camp-shelf']){
 await p.locator(`[data-action="product:${id}"]`).first().click();
 assert.equal(await p.locator('dialog .item-art').evaluate(e=>getComputedStyle(e).position),'static');
 await p.locator('dialog [data-action="close"]').click();
}
await p.locator('[data-action="nav:home"]').click();await p.locator('[data-action="shop"]').first().click();
assert.equal(await p.locator('.item-card .item-art.camp-shelf').evaluate(e=>getComputedStyle(e).position),'static');
assert.deepEqual(errors,[]);await writeFile('artifacts/collection-fix/results.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors}));
}finally{await browser.close()}
