import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4215',out='artifacts/workshop/click-remake';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch(),errors=[],checks=[];
const read=p=>p.evaluate(()=>JSON.parse(render_game_to_text())),time=(p,ms)=>p.evaluate(ms=>advanceTime(ms),ms);
async function device(p,id){const s=await read(p),f=id==='oven'?s.movement.layout.oven:s.movement.layout.farms[['wheat','cow','berries'].indexOf(id)],box=await p.locator('#board').boundingBox();await p.mouse.click(box.x+f.x/s.movement.world.width*box.width,box.y+(f.y-12)/s.movement.world.height*box.height);}
try{for(const viewport of [{width:360,height:640},{width:390,height:844},{width:640,height:360},{width:844,height:390}]){
 const c=await browser.newContext({viewport}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/games/workshop/index.html');await p.waitForFunction(()=>window.render_game_to_text&&JSON.parse(render_game_to_text()).assetsReady);
 assert.equal(await p.locator('#move-stick').count(),0);await p.screenshot({path:`${out}/intro-${viewport.width}.png`});await p.locator('#guide-action').click();await p.screenshot({path:`${out}/move-${viewport.width}.png`});
 const start=(await read(p)).movement.player;await p.keyboard.down('ArrowRight');await time(p,500);await p.keyboard.up('ArrowRight');assert.equal((await read(p)).movement.player.x,start.x);
 await time(p,9000);await p.locator('#guide-action').click();await time(p,7000);assert.equal((await read(p)).tutorial.step,2);
 await p.locator('#guide-action').click();await time(p,5000);await device(p,'oven');assert((await read(p)).job);assert.equal((await read(p)).tutorial.step,3);await p.screenshot({path:`${out}/assist-${viewport.width}.png`});
 for(let i=0;i<8;i++){await device(p,'oven');await time(p,200);}let s=await read(p);assert(s.effort.taps>=5);assert(s.hand.ready[0]||s.goods[0]);
 if(!s.goods[0])await device(p,'oven');
 // Finish the same manual recipe loop and build the line using real buttons.
 for(let i=0;i<6&&(await read(p)).goods[0]<3;i++){let q=await read(p);if(q.dust[0]<2&&!q.job&&!q.hand.ready[0]){await device(p,'wheat');await time(p,6000);await device(p,'oven');await time(p,5000);}q=await read(p);if(!q.job&&!q.hand.ready[0])await device(p,'oven');await time(p,3100);if((await read(p)).hand.ready[0])await device(p,'oven');}
 assert.equal((await read(p)).goods[0],3);assert.equal((await read(p)).tutorial.step,6);await p.locator('#guide-action').click();await time(p,5000);await p.locator('#interact').click();assert.equal((await read(p)).coins,90);await p.locator('[data-dialog=close]').click();await p.locator('#guide-action').click();
 await p.evaluate(()=>window.ScreenPages?.reveal(document.querySelector('#upgrade-3')));await p.locator('#upgrade-3').click();await p.locator('#close-panel').click();assert.equal((await read(p)).tutorial.step,8);await p.locator('#guide-action').click();
 await time(p,90000);await p.locator('[data-open=production]').click();await p.evaluate(()=>window.ScreenPages?.reveal(document.querySelector('#upgrade-1')));await p.locator('#upgrade-1').click();await p.locator('#close-panel').click();await device(p,'cow');await time(p,6000);await device(p,'cow');s=await read(p);assert.equal(s.effort.id,'cow');const taps=s.effort.taps;await time(p,1000);assert((await read(p)).elapsed>(s.effort.until));await device(p,'cow');assert((await read(p)).effort.taps>taps);
 await p.screenshot({path:`${out}/cow-${viewport.width}.png`});checks.push({viewport,tutorialComplete:true,clickOnly:true,continuousOvenAndCow:true});await c.close();
}assert.deepEqual(errors,[]);await fs.writeFile(out+'/results.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors}));}finally{await browser.close();}
