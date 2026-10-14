import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {attachLiars} from '../games/liars/server.mjs';
const root=resolve('.'),dir='artifacts/liars-126-audit/turn-cues',errors=[],checks=[];
const server=createServer(async(req,res)=>{try{const p=resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!p.startsWith(root))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.woff':'font/woff'})[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.statusCode=404;res.end();}});
const service=attachLiars(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true}),peers=[];
const read=p=>p.evaluate(()=>JSON.parse(render_game_to_text()));await mkdir(dir,{recursive:true});
try{
 for(let i=0;i<4;i++){
  const c=await browser.newContext({viewport:{width:844,height:390},hasTouch:true});
  await c.addInitScript(()=>{window.pulses=[];window.CampHaptics={pulse:x=>pulses.push(x)};window.soundStarts=0;const start=OscillatorNode.prototype.start;OscillatorNode.prototype.start=function(...args){soundStarts++;return start.apply(this,args);};});
  const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});await p.goto(base+'/games/liars/index.html');
  await p.locator('[data-do="character:'+['hero','demon','goblin','rogue'][i]+'"]').click();if(i){await p.locator('[data-do="guest"]').click();await p.locator('#code').fill((await read(peers[0])).room);}await p.locator('[data-do="connect"]').click();await p.waitForFunction(()=>JSON.parse(render_game_to_text()).screen==='lobby');peers.push(p);
 }
 for(const p of peers)await p.locator('[data-do="ready"]').click();await peers[0].locator('[data-do="start"]').click();await peers[0].waitForFunction(()=>JSON.parse(render_game_to_text()).screen==='playing');const room=service.rooms.get((await read(peers[0])).room),g=room.game;
 g.order=[0,1,2,3];g.turn=0;g.roundAt=Date.now()-4000;g.revision++;service.broadcast(room);await peers[0].waitForTimeout(100);
 for(let actor=0;actor<4;actor++){
  const id=g.players[actor].hand[0].id;
  for(const p of peers)await p.evaluate(()=>{pulses.length=0;soundStarts=0;});
  await peers[actor].locator(`[data-do="card:${id}"]`).click();await peers[actor].locator('[data-do="play"]').click();
  for(const p of peers){
   await p.waitForFunction(actor=>document.querySelector('.play-actor')?.dataset.owner===String(actor),actor);
   assert.match(await p.locator('.play-actor .seat-role').innerText(),/打出1张/);
   assert.equal(await p.locator('.play-actor .latest-card .pile-back').count(),1);
   assert.equal(await p.locator('.play-actor .actor-body').evaluate(n=>getComputedStyle(n).animationName),'seat-play');
   assert.equal((await read(p)).action.actor,actor);assert.equal((await read(p)).countdown.seat,(actor+1)%4);
   assert.ok(await p.evaluate(()=>pulses.length>0&&soundStarts>0));
  }
  await peers[0].screenshot({path:dir+'/play-'+actor+'.png'});await peers[0].waitForTimeout(1500);
  const owner=g.turn,before=await Promise.all(peers.map(p=>p.evaluate(()=>({h:pulses.length,a:soundStarts}))));
  g.deadline=Date.now()+4900;service.broadcast(room);await peers[0].waitForTimeout(180);
  const warning=await Promise.all(peers.map(p=>p.evaluate(()=>({h:pulses.length,a:soundStarts}))));
  for(let i=0;i<4;i++){assert.equal(warning[i].h-before[i].h,i===owner?1:0);if(i===owner)assert.ok(warning[i].a>before[i].a);else assert.equal(warning[i].a,before[i].a);}
  for(const p of peers){assert.equal(await p.locator('.seat-timer.urgent').count(),1);assert.equal(await p.locator('.seat-timer.urgent').getAttribute('data-owner'),String(owner));}
  service.say(room,actor,0);service.broadcast(room);await peers[0].waitForTimeout(180);
  assert.deepEqual(await Promise.all(peers.map(p=>p.evaluate(()=>({h:pulses.length,a:soundStarts})))),warning);
  g.deadline=Date.now()+30000;service.broadcast(room);checks.push({actor,next:owner,playAnimation:true,playSoundAndPulseAllClients:true,warningOnlyCurrentPlayer:true,duplicateSnapshotSilent:true});
 }
 assert.deepEqual(errors,[]);await writeFile(dir+'/results.json',JSON.stringify({passed:true,clients:4,checks,errors,realPhone:false},null,2));console.log(JSON.stringify({passed:true,checks,errors}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
