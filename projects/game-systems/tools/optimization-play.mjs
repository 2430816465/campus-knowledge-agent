import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
const out='artifacts/optimization-1.21.0',b=await chromium.launch(),results=[];
for(const id of ['tower','marble','mine','coop','liars','evolve','workshop','chess','nightwatch','rush']){
const landscape=['coop','liars','evolve','chess','workshop','marble'].includes(id),p=await b.newPage({viewport:landscape?{width:844,height:390}:{width:390,height:844},hasTouch:true});const errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
await p.goto('http://127.0.0.1:4230/');for(let n=0;n<6&&!await p.locator(`[data-action="mode:${id}"]`).count();n++)await p.locator('[data-action="catalog-next:games"]').click();await p.locator(`[data-action="mode:${id}"]`).click();if(id==='coop')await p.locator('[data-action="choice:1"]').click();await p.locator(`[data-action="${id==='coop'?'create-room':'preview'}"]`).click();await p.waitForFunction(()=>document.querySelector('iframe')&&!document.querySelector('.game-loading'));await p.waitForTimeout(1200);const f=p.frames().find(f=>f.url().includes('/games/'));
if(id==='tower')await f.getByRole('button',{name:'跳过教程',exact:true}).click();
else if(id==='mine'){const r=await f.locator('canvas').boundingBox(),hit=await f.evaluate(()=>MT.MM.Game.scene.hit.start),size=await f.locator('canvas').evaluate(e=>({w:e.width,h:e.height}));await p.mouse.click(r.x+(hit.x+hit.w/2)*r.width/size.w,r.y+(hit.y+hit.h/2)*r.height/size.h);}
else if(id==='coop')await f.locator('#startSolo').click();
else if(id==='liars')await f.getByRole('button',{name:'开一桌新牌',exact:true}).click();
else if(id==='workshop')await f.locator('#guide-skip').click();
else if(id==='chess')await f.getByRole('button',{name:'开始练习',exact:true}).click();
else {if(id==='evolve')await f.locator('[data-action="modeHell"]').click();await f.locator(`[data-action="${['marble','evolve'].includes(id)?'new':'start'}"]`).click();}
await p.waitForTimeout(id==='liars'?9000:1500);await p.screenshot({path:`${out}/${id}-play.png`});
if(id==='mine'){const r=await f.locator('canvas').boundingBox();await p.mouse.click(r.x+r.width*.5,r.y+r.height*.62);}
if(id==='nightwatch')await f.getByRole('button',{name:'明白了，继续',exact:true}).click();
if(id==='coop'){const skip=f.getByRole('button',{name:'已了解，略过',exact:true});if(await skip.isVisible())await skip.click();}
if(id==='marble'){const r=await f.locator('canvas').first().boundingBox();await p.mouse.move(r.x+r.width*.5,r.y+r.height*.8);await p.mouse.down();await p.mouse.move(r.x+r.width*.65,r.y+r.height*.5);await p.mouse.up();}
if(['mine','nightwatch','coop','marble'].includes(id)){await p.waitForTimeout(1500);await p.screenshot({path:`${out}/${id}-active.png`});}
results.push({id,errors,metrics:await f.evaluate(()=>({text:document.body.innerText.slice(0,8000),state:window.render_game_to_text?.(),hell:(()=>{const e=document.querySelector('.hell-status');if(!e)return null;const s=getComputedStyle(e),r=e.getBoundingClientRect();return {text:e.textContent,position:s.position,x:r.x,y:r.y,w:r.width,h:r.height}})(),scrollY:document.documentElement.scrollHeight-innerHeight}))});console.log(id,'captured');
}catch(e){results.push({id,error:e.message,errors});console.log(id,e.message.slice(0,120))}finally{await p.close();await fs.writeFile(`${out}/play-audit.json`,JSON.stringify(results,null,2))}}
await b.close();
