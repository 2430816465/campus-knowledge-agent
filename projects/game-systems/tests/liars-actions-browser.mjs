import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {attachLiars} from '../games/liars/server.mjs';
const root=resolve('.'),dir=process.env.LIARS_ARTIFACT_DIR||'artifacts/liars-actions/browser',errors=[],checks=[],roles=['hero','demon','goblin','rogue'],names=['流浪勇者','余烬魔王','地精商人','暮影盗贼'];
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!path.startsWith(root))throw Error();const body=await readFile(path);res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.woff':'font/woff'})[extname(path)]||'application/octet-stream');res.end(body);}catch{res.statusCode=404;res.end();}});
const service=attachLiars(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
await mkdir(dir+'/preview-frames',{recursive:true});const browser=await chromium.launch({headless:true}),peers=[];
const read=p=>p.evaluate(()=>JSON.parse(render_game_to_text()));
const phase=(p,name)=>p.waitForFunction(name=>JSON.parse(render_game_to_text()).screen===name,name,{timeout:14000});
const beat=(p,name)=>p.waitForFunction(name=>JSON.parse(render_game_to_text()).action?.beat===name,name,{timeout:8000});
async function privacy(p){const text=await p.evaluate(()=>document.body.innerText+' '+[...document.querySelectorAll('[alt],[aria-label]')].map(n=>n.getAttribute('alt')||n.getAttribute('aria-label')).join(' ')+' '+render_game_to_text());assert.ok(!text.includes('真实姓名'),text);}
async function menu(p,id){if(!await p.locator('#'+id).isVisible())await p.locator('#table-menu').click();await p.locator('#'+id).click();}
let frameNumber=0;
async function recordUntil(g,phaseName){
 while(g.phase===phaseName){await peers[0].screenshot({path:dir+'/preview-frames/'+String(frameNumber++).padStart(3,'0')+'.png'});await peers[0].waitForTimeout(180);}
}
try{
 for(let i=0;i<4;i++){
  const context=await browser.newContext({viewport:[{width:844,height:390},{width:568,height:320},{width:1280,height:800},{width:740,height:360}][i],hasTouch:i!==2});
  await context.addInitScript(()=>{const WS=WebSocket;window.WebSocket=class extends WS{constructor(...args){super(...args);window.actionTestSocket=this;}};window.spriteFrames={};function watch(){for(const img of document.querySelectorAll('.actor-body[data-action]:not([data-action=""])')){if(img.complete&&img.naturalWidth){const key=img.dataset.character+':'+img.dataset.action;(spriteFrames[key]??=[]);const n=Number(img.dataset.frame);if(!spriteFrames[key].includes(n))spriteFrames[key].push(n);}}requestAnimationFrame(watch);}requestAnimationFrame(watch);});
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});await p.goto(base+'/games/liars/index.html');assert.equal(await p.locator('#name').count(),0);await p.locator('[data-do="character:'+roles[i]+'"]').click();if(i){await p.locator('[data-do="guest"]').click();await p.locator('#code').fill((await read(peers[0])).room);}await p.locator('[data-do="connect"]').click();await phase(p,'lobby');peers.push(p);
 }
 const room=service.rooms.get((await read(peers[0])).room);
 room.slots.forEach((p,i)=>{p.name='真实姓名'+i;});service.broadcast(room);for(const p of peers)await privacy(p);
 for(const p of peers)await p.locator('[data-do="ready"]').click();await peers[0].locator('[data-do="start"]').click();await phase(peers[0],'playing');
 for(let caller=0;caller<4;caller++){
  service.start(room);const g=room.game,accused=(caller+3)%4;g.order=[0,1,2,3];g.turn=accused;g.target='hero';g.players[accused].hand=[{id:'proof',kind:'hero'},{id:'keep',kind:'thief'}];g.players[caller].poisonAt=caller===3?1:6;service.broadcast(room);
  await peers[accused].waitForFunction(id=>JSON.parse(render_game_to_text()).game.id===id,g.id);await peers[accused].locator('[data-do="card:proof"]').click();await peers[accused].locator('[data-do="play"]').click();await peers[caller].waitForFunction(()=>!document.querySelector('[data-do="challenge"]').disabled);await peers[caller].locator('[data-do="challenge"]').click();await phase(peers[0],'reveal');assert.equal(g.event.loser,caller);assert.equal(g.event.accused,accused);
  if(caller===1)await recordUntil(g,'reveal');else{
   await peers[0].waitForTimeout(650);for(const p of peers){assert.equal(await p.locator('.challenger .actor-body').getAttribute('data-character'),roles[caller]);assert.ok(Number(await p.locator('.challenger .actor-body').getAttribute('data-frame'))>=3);assert.match(await p.locator('.scene-heading').innerText(),new RegExp(names[caller]));await privacy(p);}
   await peers[0].screenshot({path:dir+'/'+roles[caller]+'-challenge.png'});
   if(caller===0){await peers[2].evaluate(()=>actionTestSocket.close());await peers[0].waitForFunction(()=>JSON.parse(render_game_to_text()).roomPhase==='paused');const frozen=await read(peers[0]),pose=await peers[0].locator('.challenger .actor-body').getAttribute('data-frame');await peers[0].waitForTimeout(450);assert.equal((await read(peers[0])).action.age,frozen.action.age);assert.equal(await peers[0].locator('.challenger .actor-body').getAttribute('data-frame'),pose);await privacy(peers[0]);assert.ok(!(await peers[0].locator('#status').textContent()).includes('真实姓名'));await peers[0].waitForFunction(()=>JSON.parse(render_game_to_text()).roomPhase==='match');checks.push('actual socket pause freezes sprite and age, hides raw name, reconnect resumes');}
   await beat(peers[0],'verdict');await peers[0].screenshot({path:dir+'/'+roles[caller]+'-verdict.png'});
  }
  await phase(peers[0],'outcome');for(const p of peers){assert.equal(await p.locator('[data-do=\"drink\"]').count(),0);await privacy(p);}
  if(caller===1)await recordUntil(g,'outcome');else{
   await peers[0].waitForTimeout(850);for(const p of peers){assert.equal(await p.locator('.drinker .actor-body').getAttribute('data-character'),roles[caller]);assert.equal(await p.locator('.result-line').first().isVisible(),false);assert.equal(await p.locator('.seat-outcome.stone-seat').count(),0);await privacy(p);}
   await peers[0].screenshot({path:dir+'/'+roles[caller]+'-drink.png'});
   if(caller===3){for(const p of peers){assert.ok(!(await p.locator('.drinker .actor-body').evaluate(n=>getComputedStyle(n).filter)).includes('grayscale'));}await beat(peers[0],'stone');assert.equal(await peers[0].locator('.seat-outcome.stone-seat').count(),1);await peers[0].screenshot({path:dir+'/rogue-stone.png'});}else await peers[0].waitForFunction(()=>JSON.parse(render_game_to_text()).action?.beat!=='drinking');
   await phase(peers[0],'playing');
  }
  for(const p of peers){const observed=await p.evaluate(()=>spriteFrames);assert.deepEqual(observed[roles[caller]+':challenge'],[0,1,2,3,4,5]);assert.deepEqual(observed[roles[caller]+':drink'],[0,1,2,3,4,5]);}
  checks.push(names[caller]+': six challenge + six drink frames observed on all four clients');
 }
 service.say(room,2,1);service.broadcast(room);await menu(peers[0],'chat');assert.match(await peers[0].locator('.chat-history').innerText(),/地精商人/);await privacy(peers[0]);await peers[0].locator('[data-do="close"]').first().click();await menu(peers[0],'help');await peers[0].locator('[data-do="journal"]').click();assert.match(await peers[0].locator('.audit-history').innerText(),/余烬魔王/);await privacy(peers[0]);await peers[0].locator('[data-do="close"]').first().click();checks.push('raw authority names never appear in lobby, actors, events, chat, journal or accessible labels');
 const g=room.game;g.phase='finished';g.winner=2;g.revision++;g.deadline=null;service.broadcast(room);await phase(peers[0],'finished');assert.equal(await peers[0].locator('.result-name').innerText(),'地精商人');await privacy(peers[0]);await peers[0].screenshot({path:dir+'/role-only-finish.png'});checks.push('winner and settlement summary use role names');checks.push('cursed loser stays colored until the complete drink finishes');
 const nativeContext=await browser.newContext({viewport:{width:568,height:320},hasTouch:true});await nativeContext.addInitScript(()=>{window.CampLan={stop(){},active(){return false;}};});const native=await nativeContext.newPage();native.on('pageerror',e=>errors.push(e.message));await native.goto(base+'/games/liars/index.html');await native.locator('[data-do="match"]').click();await phase(native,'playing');const ns=await read(native);assert.deepEqual(new Set(ns.game.players.map(p=>p.name)),new Set(names));assert.equal(new Set(ns.game.players.map(p=>p.character)).size,4);assert.ok(ns.players.every(p=>names.includes(p.name)));await native.screenshot({path:dir+'/phone-worker-role-table.png'});checks.push('production phone Worker matching displays four distinct role names');
 assert.deepEqual(errors,[]);const result={passed:true,realWebSocketClients:4,controlledAuthorityFixtures:true,generatedSpriteFrames:48,viewports:['844x390','568x320','1280x800','740x360'],previewFrames:frameNumber,checks,realPhone:false,errors};await writeFile(dir+'/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();await new Promise(r=>server.close(r));}
