import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4185';
const browser=await chromium.launch({headless:true}),errors=[],peers=[];
await mkdir('artifacts/liars',{recursive:true});
async function menuClick(page,id){if(!await page.locator('#'+id).isVisible())await page.locator('#table-menu').click();await page.locator('#'+id).click();}
const read=f=>f.evaluate(()=>JSON.parse(render_game_to_text()));
async function until(f,test,timeout=12000){await f.waitForFunction(test,null,{timeout});return read(f);}
try{
 for(let i=0;i<4;i++){
  const context=await browser.newContext({viewport:i===0?{width:844,height:390}:i===1?{width:844,height:390}:{width:1280,height:800},hasTouch:i<2});
  await context.addInitScript(()=>{window.orientationCalls=[];window.CampOrientation={setLandscape:v=>orientationCalls.push(v)};const Original=WebSocket;window.WebSocket=class extends Original{constructor(...a){super(...a);window.testSocket=this;}};});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});await page.goto(base+'/');await page.locator('[data-action="mode:liars"]').click();await page.locator('[data-action="preview"]').click();await page.waitForFunction(()=>document.querySelector('iframe')&&!document.querySelector('.game-loading'));
  const frame=page.frames().find(f=>f.url().includes('/games/liars/'));await frame.locator('[data-do="character:'+(process.env.DUPLICATE_ROLES==='1'?'hero':['hero','demon','goblin','rogue'][i])+'"]').click();
  if(i){await frame.locator('[data-do="guest"]').click();await frame.locator('#code').fill((await read(peers[0].frame)).room);}
  await frame.locator('[data-do="connect"]').click();await until(frame,()=>JSON.parse(render_game_to_text()).screen==='lobby');peers.push({context,page,frame});
 }
 const host=peers[0];await host.page.screenshot({path:'artifacts/liars/lobby-phone.png'});assert.equal((await read(host.frame)).players.filter(Boolean).length,4);
 for(const p of peers)assert.deepEqual(await p.page.evaluate(()=>orientationCalls),[true]);
 for(const p of peers)await p.frame.locator('[data-do="ready"]').click();await host.frame.locator('[data-do="start"]').click();for(const p of peers)await until(p.frame,()=>JSON.parse(render_game_to_text()).screen==='playing');
 await host.page.screenshot({path:'artifacts/liars/table-phone.png'});await peers[1].page.screenshot({path:'artifacts/liars/table-landscape.png'});await peers[2].page.screenshot({path:'artifacts/liars/table-desktop.png'});
 let state=await read(host.frame);for(const p of peers){const s=await read(p.frame);assert.equal(s.game.hand.length,5);assert.equal(new Set(s.game.players.map(a=>a.character)).size,4);assert.deepEqual(s.players.map(a=>a.character),s.game.players.map(a=>a.character));assert.ok(s.game.players.every(a=>!('hand' in a)&&!('poisonAt' in a)));assert.ok(!JSON.stringify(s).includes('poisonAt'));}
 if(process.env.LAYOUT_ONLY==='1'){
  for(const p of peers){const bounds=await p.frame.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,width:innerWidth,buttons:[...document.querySelectorAll('.actions button')].map(b=>b.getBoundingClientRect().toJSON()),height:innerHeight}));assert.ok(bounds.scrollWidth<=bounds.width);assert.ok(bounds.buttons.every(b=>b.bottom<=bounds.height));}
  await host.page.setViewportSize({width:320,height:568});await host.frame.waitForFunction(()=>JSON.parse(render_game_to_text()).orientationBlocked);assert.equal(await host.frame.locator('#orientation-prompt').isVisible(),true);await host.page.screenshot({path:'artifacts/liars/rotate-phone.png'});
  await host.page.setViewportSize({width:568,height:320});await host.frame.waitForFunction(()=>!JSON.parse(render_game_to_text()).orientationBlocked);const small=await host.frame.evaluate(()=>({width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,bottom:Math.max(...[...document.querySelectorAll('.actions button')].map(b=>b.getBoundingClientRect().bottom))}));assert.ok(small.scroll<=small.width);assert.ok(small.bottom<=small.height);await host.page.screenshot({path:'artifacts/liars/table-small-phone.png'});
  for(const p of peers){assert.equal(await p.page.locator('.game-toolbar').isVisible(),false);const sizes=await p.frame.evaluate(()=>({h:innerHeight,parentH:parent.innerHeight,table:document.querySelector('#table').getBoundingClientRect().height}));assert.equal(sizes.h,sizes.parentH);assert.equal(sizes.table,sizes.h);}
  await menuClick(peers[3].frame,'exit');await peers[3].frame.locator('[data-do="confirm-return"]').click();await peers[3].page.waitForFunction(()=>orientationCalls.includes(false));assert.deepEqual(await peers[3].page.evaluate(()=>orientationCalls),[true,false]);
  assert.deepEqual(errors,[]);console.log('PASS full-height four-seat table, mobile portrait prompt, small landscape and desktop');
 }else{
 // Close a real client socket, preserve the authoritative turn/deadline, and resume.
 await peers[1].frame.evaluate(()=>testSocket.close());await until(host.frame,()=>JSON.parse(render_game_to_text()).roomPhase==='paused');await until(host.frame,()=>JSON.parse(render_game_to_text()).roomPhase==='match');assert.equal((await read(peers[1].frame)).seat,1);
 // Exercise normal selection, capped selection, play, reveal, drink and final receipt.
 let iterations=0,reveals=0,drinks=0,savedReveal=false,savedPotion=false;
 while(iterations++<300){
  state=await read(host.frame);const g=state.game;if(g.phase==='finished')break;
  if(g.phase==='playing'){
   const p=peers[g.turn];
   await p.frame.waitForFunction(revision=>JSON.parse(render_game_to_text()).game.revision===revision,g.revision);
   if(g.last){await p.frame.locator('[data-do="challenge"]').click();reveals++;}
   else{await p.frame.locator('.card').first().click();assert.equal((await read(p.frame)).selected.length,1);await p.frame.locator('[data-do="play"]').click();}
   await host.frame.waitForFunction(rev=>JSON.parse(render_game_to_text()).game.revision>rev,g.revision);
  }else if(g.phase==='reveal'){
   if(!savedReveal){await peers[g.event.caller].page.screenshot({path:'artifacts/liars/reveal.png'});savedReveal=true;}
   await host.frame.waitForFunction(()=>JSON.parse(render_game_to_text()).game.phase!=='reveal');
  }else{
   if(!savedPotion){await peers[g.event.loser].page.screenshot({path:'artifacts/liars/automatic-potion.png'});savedPotion=true;}
   drinks++;for(const p of peers)assert.equal(await p.frame.locator('[data-do="drink"]').count(),0);
   await host.frame.waitForFunction(()=>JSON.parse(render_game_to_text()).game.phase!=='outcome');
  }
 }
 state=await read(host.frame);assert.equal(state.game.phase,'finished');const winner=state.game.winner;
 for(let i=0;i<4;i++){const p=peers[i];await until(p.frame,()=>!!JSON.parse(render_game_to_text()).receipt);const saved=await p.page.evaluate(()=>JSON.parse(localStorage.getItem('adventure-camp-demo-v1')));assert.equal(saved.coins,160);assert.equal(saved.runs.filter(r=>r.mode==='liars').length,1);assert.equal(saved.runs[0].reward,0);}
 await peers[winner].page.screenshot({path:'artifacts/liars/winner.png'});
 // The title toolbar was removed; necessary controls live inside the game.
 assert.equal(await host.page.locator('.game-toolbar').isVisible(),false);await menuClick(host.frame,'help');await host.frame.locator('[data-do="close"]').first().click();
 await host.frame.locator('[data-do="rematch"]').click();for(const p of peers)await until(p.frame,()=>JSON.parse(render_game_to_text()).screen==='lobby');for(const p of peers)await p.frame.locator('[data-do="ready"]').click();await host.frame.locator('[data-do="start"]').click();await until(host.frame,()=>JSON.parse(render_game_to_text()).screen==='playing');const rematch=await read(host.frame);assert.notEqual(rematch.game.id,state.game.id);assert.ok(rematch.game.players.every(p=>p.drinks===0&&p.remaining===6));
 await menuClick(peers[3].frame,'exit');await peers[3].frame.locator('[data-do="confirm-return"]').click();await until(host.frame,()=>JSON.parse(render_game_to_text()).screen==='welcome');for(let i=0;i<3;i++){const saved=await peers[i].page.evaluate(()=>JSON.parse(localStorage.getItem('adventure-camp-demo-v1')));assert.equal(saved.runs.filter(r=>r.mode==='liars').length,1);}
 await peers[3].page.waitForFunction(()=>orientationCalls.includes(false));assert.deepEqual(await peers[3].page.evaluate(()=>orientationCalls),[true,false]);
 assert.deepEqual(errors,[]);const result={passed:true,realClients:4,reveals,drinks,winner,checks:['camp fifth portal','four roles','ready/start','private hands','real websocket reconnect','play/challenge/automatic drink','1.26 camp receipt once, no table coin farming','rematch resets potions','unfinished departure cancels','landscape table and full-height camp integration'],errors};await writeFile('artifacts/liars/browser-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }
}finally{await browser.close();}
