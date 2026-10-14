import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {attachLiars} from '../games/liars/server.mjs';

const root=resolve('.'),dir='artifacts/liars-126-audit/automatic-drink',errors=[],checks=[];
const server=createServer(async(req,res)=>{try{const p=resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!p.startsWith(root))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.webp':'image/webp'})[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.statusCode=404;res.end();}});
const service=attachLiars(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true}),peers=[];
const state=p=>p.evaluate(()=>JSON.parse(render_game_to_text()));
const phase=(p,name)=>p.waitForFunction(name=>JSON.parse(render_game_to_text()).screen===name,name,{timeout:15000});
await mkdir(dir,{recursive:true});
try{
 for(let i=0;i<2;i++){
  const context=await browser.newContext({viewport:i?{width:740,height:360}:{width:568,height:320}}),p=await context.newPage();
  p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  await p.goto(base+'/games/liars/index.html');await p.locator('[data-do="character:'+['hero','demon'][i]+'"]').click();
  if(i){await p.locator('[data-do="guest"]').click();await p.locator('#code').fill((await state(peers[0])).room);}
  await p.locator('[data-do="connect"]').click();await phase(p,'lobby');peers.push(p);
 }
 for(const p of peers)await p.locator('[data-do="ready"]').click();await peers[0].locator('[data-do="start"]').click();await phase(peers[0],'playing');
 const room=service.rooms.get((await state(peers[0])).room);
 for(const [stone,lie] of [[false,false],[true,false],[false,true]]){
  service.start(room);const g=room.game;g.order=[0,1];g.turn=0;g.target='hero';g.players[0].hand=[{id:'truth',kind:lie?'demon':'hero'},{id:'keep',kind:'thief'}];g.players[1].poisonAt=stone?1:6;g.players[0].poisonAt=6;service.broadcast(room);
  await peers[0].waitForFunction(()=>JSON.parse(render_game_to_text()).game.hand.some(c=>c.id==='truth'));
  await peers[0].locator('[data-do="card:truth"]').click();await peers[0].locator('[data-do="play"]').click();
  await peers[1].waitForFunction(()=>!document.querySelector('[data-do="challenge"]').disabled);await peers[1].locator('[data-do="challenge"]').click();await phase(peers[1],'reveal');
  const expected=g.deadline,loser=lie?0:1;
  await peers[1].waitForFunction(()=>JSON.parse(render_game_to_text()).action.beat==='verdict');
  assert.equal(g.event.loser,loser);assert.equal(g.event.lied,lie);
  for(const p of peers){assert.equal(await p.locator('[data-do="drink"]').count(),0);assert.equal((await state(p)).countdown.seat,null);}
  await peers[1].keyboard.press('d');assert.equal(g.phase,'reveal');assert.equal(g.players[loser].drinks,0);
  await phase(peers[1],'outcome');const delay=g.phaseAt-expected;
  assert.ok(delay>=0&&delay<350,'authority ticks at '+delay+'ms after verdict deadline');
  assert.equal(g.players[loser].drinks,1);assert.equal((await state(peers[1])).action.beat,'drinking');assert.equal(await peers[1].locator('.result-line').isVisible(),false);
  for(const p of peers)assert.equal(await p.locator('[data-do="drink"]').count(),0);
  await peers[1].waitForFunction(()=>JSON.parse(render_game_to_text()).action.beat!=='drinking');
  const box=await peers[1].locator('.outcome-scene').innerText();assert.equal(box.match(lie?/流浪勇者/g:/余烬魔王/g)?.length,1);assert.equal(box.match(stone?/石化/g:/安全/g)?.length,1);assert.equal(await peers[1].locator('.result-line').innerText(),stone?'已淘汰':'剩5瓶');
  await peers[1].screenshot({path:dir+(stone?'/concise-stone.png':'/concise-safe.png')});
  checks.push({scenario:lie?'lying accused automatically drinks':stone?'truthful caller automatically drinks cursed potion':'truthful caller automatically drinks safe potion',startDelayMs:delay,resultText:box});
 }
 // Actual bot policy and server ticks, with its largest random potion wait.
 await peers[0].reload();await phase(peers[0],'welcome');await peers[0].locator('[data-do="match"]').click();await phase(peers[0],'playing');
 const botRoom=service.rooms.get((await state(peers[0])).room),g=botRoom.game;service.randomInt=n=>n-1;
 g.phase='reveal';g.phaseAt=Date.now();g.deadline=g.phaseAt+6000;g.event={loser:1,caller:1,accused:0,target:g.target,lied:false,cards:[g.target]};g.revision++;botRoom.botAction=null;g.players[1].poisonAt=6;service.broadcast(botRoom);
 const start=g.deadline;await phase(peers[0],'outcome');const delay=g.phaseAt-start;assert.ok(delay>=0&&delay<350,'bot automatic drink at '+delay+'ms');assert.equal(g.players[1].drinks,1);checks.push({scenario:'bot receives same immediate automatic penalty',startDelayMs:delay});
 assert.deepEqual(errors,[]);const result={passed:true,checks,errors,realPhone:false};await writeFile(dir+'/potion-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();await new Promise(r=>server.close(r));}
