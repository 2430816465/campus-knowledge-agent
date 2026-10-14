import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
const out='artifacts/optimization-1.21.0';await fs.mkdir(out,{recursive:true});const browser=await chromium.launch();const results=[];
for(const viewport of [{width:640,height:360},{width:844,height:390},{width:360,height:640},{width:390,height:844}]){
 for(const id of ['coop','marble','evolve']){
 const p=await browser.newPage({viewport,hasTouch:true});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(`http://127.0.0.1:4230/games/${id}/index.html${id==='coop'?'?solo=1':''}`);await p.waitForTimeout(900);
 if(id==='coop'&&viewport.width>viewport.height){
  await p.locator('#soloMode').click();await p.screenshot({path:`${out}/${id}-${viewport.width}-home.png`});
  await p.locator('#chooseLevel').click();await p.waitForTimeout(100);await p.screenshot({path:`${out}/${id}-${viewport.width}-levels.png`});await p.locator('#closeLevelLibrary').click();
  const start=p.locator('#startSolo');const r=await start.boundingBox();if(!r||r.y+r.height>viewport.height)errors.push('Start outside viewport');
  await start.click();await p.waitForTimeout(400);
 }else if(id==='marble'){await p.locator('[data-action=new]').click();await p.waitForTimeout(300);}
 await p.screenshot({path:`${out}/${id}-${viewport.width}.png`});
 const data=await p.evaluate(()=>({text:document.body.innerText.slice(0,800),pages:window.ScreenPages?.describe(),state:window.render_game_to_text?.(),overflow:document.documentElement.scrollWidth-innerWidth}));results.push({id,viewport,errors,data});await p.close();
 }
}await browser.close();await fs.writeFile(`${out}/phone-check.json`,JSON.stringify(results,null,2));console.log(results.map(r=>({id:r.id,w:r.viewport.width,errors:r.errors,pages:r.data.pages,overflow:r.data.overflow})));
