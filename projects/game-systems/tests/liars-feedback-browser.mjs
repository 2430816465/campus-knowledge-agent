import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {attachLiars} from '../games/liars/server.mjs';
const root=resolve('.'),dir=process.env.LIARS_ARTIFACT_DIR||'artifacts/liars-turn-focus',errors=[],checks=[];
// Deterministic authority fixtures exist only in this test process, never in production routes.
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!path.startsWith(root))throw Error();const body=await readFile(path);res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.webp':'image/webp','.woff':'font/woff'})[extname(path)]||'application/octet-stream');res.end(body);}catch{res.statusCode=404;res.end();}});
const service=attachLiars(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
await mkdir(dir,{recursive:true});const browser=await chromium.launch({headless:true}),peers=[];
async function menuClick(page,id){if(!await page.locator('#'+id).isVisible())await page.locator('#table-menu').click();await page.locator('#'+id).click();}
const read=page=>page.evaluate(()=>JSON.parse(render_game_to_text()));
async function phase(page,name){await page.waitForFunction(name=>JSON.parse(render_game_to_text()).screen===name,name,{timeout:14000});return read(page);}
async function beat(page,name){await page.waitForFunction(name=>document.querySelector('.action-scene')?.dataset.beat===name,name,{timeout:8000});}
async function fit(page){const b=await page.evaluate(()=>{const box=document.querySelector('.event-box').getBoundingClientRect();return {x:box.x,y:box.y,right:box.right,bottom:box.bottom,w:innerWidth,h:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth};});assert.ok(b.x>=-8&&b.y>=0&&b.right<=b.w+8&&b.bottom<=b.h-2,JSON.stringify(b));assert.equal(b.overflow,false);}
try{
 for(let i=0;i<4;i++){
  const context=await browser.newContext({viewport:[{width:568,height:320},{width:844,height:390},{width:1280,height:800},{width:740,height:360}][i],hasTouch:i!==2});
  await context.addInitScript(()=>{const WS=WebSocket;window.WebSocket=class extends WS{constructor(...args){super(...args);window.turnTestSocket=this;}};window.testHaptics=[];window.CampHaptics={pulse:name=>testHaptics.push(name)};window.audioStarts=0;const start=OscillatorNode.prototype.start;OscillatorNode.prototype.start=function(...args){audioStarts++;return start.apply(this,args);};});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});await page.goto(base+'/games/liars/index.html');await page.locator('[data-do="character:'+['hero','demon','goblin','rogue'][i]+'"]').click();if(i){await page.locator('[data-do="guest"]').click();await page.locator('#code').fill((await read(peers[0])).room);}await page.locator('[data-do="connect"]').click();await phase(page,'lobby');peers.push(page);
 }
 for(const p of peers)await p.locator('[data-do="ready"]').click();await peers[0].locator('[data-do="start"]').click();await phase(peers[0],'playing');const room=service.rooms.get((await read(peers[0])).room);
 async function fixture(target='hero',{falseCard=false,drinks=0,curse=6}={}){
  service.start(room);const g=room.game;g.order=[0,1,2,3];g.turn=0;g.target=target;g.players[0].hand=[{id:'truth-a',kind:falseCard?['demon','hero','princess'].find(k=>k!==target):target},{id:'truth-b',kind:'thief'},{id:'keep',kind:target}];g.players[1].drinks=drinks;g.players[1].poisonAt=curse;g.players[0].poisonAt=6;service.broadcast(room);await phase(peers[0],'playing');return g;
 }
 async function openTruth(target='hero',options={}){
  const g=await fixture(target,options);await peers[0].locator('[data-do="card:truth-a"]').click();await peers[0].locator('[data-do="card:truth-b"]').click();assert.match(await peers[0].locator('.selection-note').innerText(),options.falseCard?/有假牌/:/全真/);await peers[0].locator('[data-do="play"]').click();await peers[1].waitForFunction(()=>!document.querySelector('[data-do="challenge"]').disabled);await peers[1].locator('[data-do="challenge"]').click();await phase(peers[0],'reveal');return g;
 }
 async function fitSeats(page){
  const boxes=await page.locator('.table-seat').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect(),stage=n.closest('.stage-space').getBoundingClientRect();return {seat:n.dataset.owner,x:r.x,y:r.y,right:r.right,bottom:r.bottom,stage:{x:stage.x,y:stage.y,right:stage.right,bottom:stage.bottom}};}));
  assert.equal(boxes.length,4);for(const b of boxes)assert.ok(b.x>=b.stage.x-3&&b.y>=b.stage.y-3&&b.right<=b.stage.right+3&&b.bottom<=b.stage.bottom+3,JSON.stringify(b));
  for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){const a=boxes[i],b=boxes[j];assert.ok(Math.min(a.right,b.right)-Math.max(a.x,b.x)<=2||Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)<=2,'overlapping seats '+JSON.stringify([a,b]));}
 }
 async function clocks(owner){
  for(const page of peers){await page.waitForFunction(owner=>{const timers=[...document.querySelectorAll('.seat-timer')].filter(n=>!n.hidden);return owner===null?timers.length===0:timers.length===1&&Number(timers[0].dataset.owner)===owner;},owner);assert.equal(await page.locator('#turn-clock').count(),0);const t=await read(page);assert.equal(t.countdown.seat,owner);if(owner!==null){const clock=page.locator(`.seat-timer[data-owner="${owner}"]`);assert.ok(Number(await clock.innerText())>=0);const fit=await clock.evaluate(n=>{const r=n.getBoundingClientRect(),seat=n.closest('.table-seat').getBoundingClientRect();return r.x>=seat.x&&r.right<=seat.right&&r.y>=seat.y&&r.bottom<=seat.bottom;});assert.ok(fit);}}
  if(owner!==null)for(const page of peers){const collision=await page.locator(`.seat-timer[data-owner="${owner}"]`).evaluate(n=>{const r=n.getBoundingClientRect();return [...n.closest('.table-seat').querySelectorAll('.pile-card')].some(c=>{const b=c.getBoundingClientRect();return Math.min(r.right,b.right)-Math.max(r.x,b.x)>2&&Math.min(r.bottom,b.bottom)-Math.max(r.y,b.y)>2;});});assert.equal(collision,false,'seat clock must not hide its cards');}
 }
 async function focus(page,g){
  await page.screenshot({path:dir+'/center-'+page.viewportSize().width+'.png'});
  const pane=page.locator('.center-reveal');assert.equal(await pane.getAttribute('data-owner'),String(g.event.accused));assert.equal(await pane.locator('.focus-card').count(),g.event.cards.length);assert.deepEqual(await pane.locator('img').evaluateAll(ns=>ns.map(n=>n.getAttribute('alt'))),g.event.cards.map(k=>({hero:'勇者',demon:'魔王',princess:'公主',thief:'小偷'})[k]));
  assert.equal(await pane.locator('.false-card').count(),g.event.cards.filter(k=>k!==g.event.target&&k!=='thief').length);assert.equal(await page.locator(`.table-seat[data-owner="${g.event.accused}"] .latest-card`).count(),g.event.cards.length);
  const layout=await pane.evaluate(n=>{const r=n.getBoundingClientRect(),s=n.closest('.stage-space').getBoundingClientRect(),owner=document.querySelector(`.table-seat[data-owner="${n.dataset.owner}"] .latest-card`),cards=[...n.querySelectorAll('.card-flipper')],actors=[...document.querySelectorAll('.actor-art,.pile-card')].map(n=>n.getBoundingClientRect());for(const label of document.querySelectorAll('.pile-label')){const range=document.createRange();range.selectNodeContents(label);actors.push(range.getBoundingClientRect());}return {box:r.toJSON(),stage:s.toJSON(),ratio:cards[0].getBoundingClientRect().width/owner.getBoundingClientRect().width,overlap:actors.filter(a=>Math.min(a.right,r.right)-Math.max(a.x,r.x)>2&&Math.min(a.bottom,r.bottom)-Math.max(a.y,r.y)>2).map(a=>a.toJSON())};});
  assert.ok(layout.ratio>=1.8,JSON.stringify(layout));assert.ok(layout.box.x>=layout.stage.x&&layout.box.right<=layout.stage.right&&layout.box.y>=layout.stage.y&&layout.box.bottom<=layout.stage.bottom,JSON.stringify(layout));assert.deepEqual(layout.overlap,[],JSON.stringify(layout));
 }
 // All four real clients play in turn, then reveal only the newest batch at its owner.
 const pileGame=await fixture('hero',{falseCard:true});await peers[0].waitForTimeout(200);assert.match(await peers[0].locator('.round-intro').innerText(),/勇者桌/);await peers[0].screenshot({path:dir+'/round-intro.png'});
 pileGame.players[0].hand.push({id:'earlier-proof',kind:'hero'},{id:'extra-proof',kind:'thief'});service.broadcast(room);
 const originalRevision=pileGame.revision,originalDeadline=pileGame.deadline;
 await peers[0].setViewportSize({width:320,height:568});await peers[0].waitForFunction(()=>JSON.parse(render_game_to_text()).orientationBlocked);assert.equal(await peers[0].locator('#orientation-prompt').isVisible(),true);
 await peers[0].evaluate(()=>{document.documentElement.requestFullscreen=async()=>{throw Error('test unsupported fullscreen');};});await peers[0].locator('[data-do="landscape"]').click();assert.match(await peers[0].locator('#orientation-message').innerText(),/请关闭手机方向锁定/);assert.equal(pileGame.revision,originalRevision);assert.equal(pileGame.deadline,originalDeadline);await peers[0].screenshot({path:dir+'/orientation-prompt.png'});
 await peers[0].setViewportSize({width:568,height:320});await peers[0].waitForFunction(()=>!JSON.parse(render_game_to_text()).orientationBlocked);assert.equal(await peers[0].locator('#orientation-prompt').isVisible(),false);checks.push('portrait prompt and fullscreen failure fallback; rotation never resets authority timer');
 await peers[0].waitForTimeout(2500);
 for(let i=0;i<4;i++)await peers[i].screenshot({path:dir+'/remake-playing-'+i+'.png'});
 for(const page of peers){
  const hud=await page.evaluate(()=>({menu:document.querySelector('#table-menu').getBoundingClientRect().toJSON(),sprites:[...document.querySelectorAll('.table-seat .actor-art')].map(n=>n.getBoundingClientRect().toJSON()),buttons:[...document.querySelectorAll('.actions button')].map(n=>n.getBoundingClientRect().toJSON()),cards:[...document.querySelectorAll('.hand .card')].map(n=>n.getBoundingClientRect().toJSON()),w:innerWidth,h:innerHeight}));
  for(const b of [...hud.sprites,...hud.buttons,...hud.cards])assert.ok(b.x>=0&&b.y>=0&&b.right<=hud.w&&b.bottom<=hud.h,JSON.stringify(b));
  for(const b of hud.sprites)assert.ok(Math.min(b.right,hud.menu.right)-Math.max(b.x,hud.menu.x)<=0||Math.min(b.bottom,hud.menu.bottom)-Math.max(b.y,hud.menu.y)<=0,'menu hides actor');
 }
 checks.push('scene remake: four visible larger actors, own hand and action targets in bounds, corner menu hides no actor');
 for(let i=0;i<4;i++){
  await clocks(i);
  const id=i===0?'truth-b':pileGame.players[i].hand[0].id;
  await peers[i].waitForFunction(()=>!document.querySelector('[data-do="play"]').disabled||!document.querySelector('.card').disabled);
  await peers[i].locator('[data-do="card:'+id+'"]').click();if(i===0)await peers[i].locator('[data-do="card:earlier-proof"]').click();await peers[i].locator('[data-do="play"]').click();
 }
 await peers[0].waitForFunction(()=>JSON.parse(render_game_to_text()).game.plays.length===4);
 for(const page of peers){const t=await read(page);assert.equal(t.table.flatMap(s=>s.cards).filter(c=>c.kind).length,0);await fitSeats(page);}
 for(const id of ['truth-a','keep','extra-proof'])await peers[0].locator('[data-do="card:'+id+'"]').click();await peers[0].locator('[data-do="play"]').click();await peers[1].waitForFunction(()=>JSON.parse(render_game_to_text()).game.plays.length===5);await peers[1].locator('[data-do="challenge"]').click();await beat(peers[0],'verdict');await peers[0].waitForTimeout(220);
 for(let i=0;i<4;i++){const page=peers[i],t=await read(page),owner=t.table.find(s=>s.seat===0);await clocks(null);await focus(page,pileGame);assert.equal(owner.cards.length,5);assert.equal(owner.cards[0].kind,null);assert.equal(owner.cards[1].kind,null);assert.equal(owner.cards[2].truth,false);assert.equal(t.table.flatMap(s=>s.cards).filter(c=>c.kind).length,3);assert.equal(await page.locator('.table-seat[data-owner="0"] .false-card').count(),1);assert.equal(await page.locator('.table-seat:not([data-owner="0"]) .false-card').count(),0);await fitSeats(page);await page.screenshot({path:dir+'/owned-piles-'+i+'.png'});}
 checks.push('current-seat timer follows all four turns; central enlarged latest batch matches preserved owner pile without overlap at four viewports');
 // Late-round piles: accused has two earlier backs + three challenged cards,
 // every other player retains four earlier backs. Rotate all possible owners.
 for(let accused=0;accused<4;accused++){
  const full=await fixture('hero');full.turn=accused;full.plays=[];full.players.forEach((p,seat)=>{
   p.hand=Array.from({length:seat===accused?3:1},(_,i)=>({id:`full-${accused}-${seat}-${i}`,kind:i===0?'demon':i===1?'hero':'thief'}));
   full.plays.push({seat,count:2,target:'hero',round:1,source:'player',at:Date.now()});if(seat!==accused)full.plays.push({seat,count:2,target:'hero',round:1,source:'player',at:Date.now()});
  });full.revision++;service.broadcast(room);await peers[accused].waitForFunction(id=>JSON.parse(render_game_to_text()).game.hand.some(c=>c.id===id),full.players[accused].hand[0].id);await clocks(accused);
  for(const c of full.players[accused].hand)await peers[accused].locator(`[data-do="card:${c.id}"]`).click();await peers[accused].locator('[data-do="play"]').click();await clocks(full.turn);
  if(accused===0){
   await peers[2].evaluate(()=>turnTestSocket.close());await peers[0].waitForFunction(()=>JSON.parse(render_game_to_text()).roomPhase==='paused');const frozen=(await read(peers[0])).countdown;await peers[0].waitForTimeout(450);assert.deepEqual((await read(peers[0])).countdown,frozen);await peers[0].waitForFunction(()=>JSON.parse(render_game_to_text()).roomPhase==='match');await clocks(full.turn);checks.push('actual socket disconnect freezes seat clock; reconnect resumes same turn');
  }
  const caller=full.turn;await peers[caller].locator('[data-do="challenge"]').click();await beat(peers[0],'verdict');await peers[0].waitForTimeout(250);for(const page of peers)await focus(page,full);
  await phase(peers[accused],'outcome');await clocks(null);for(let i=0;i<4;i++)await peers[i].screenshot({path:dir+`/full-piles-auto-drink-${accused}-${i}.png`});
 }
 checks.push('all four accused positions: full late-round piles stay visible beside enlarged center cards');
 for(const target of ['demon','hero','princess']){
  const g=await openTruth(target);assert.equal(g.event.lied,false);assert.equal(g.event.accused,0);assert.equal(g.event.caller,1);assert.equal(g.event.loser,1);assert.equal((await read(peers[0])).game.event.loser,1);
  const challenger=peers[0].locator('.challenger');assert.equal(await challenger.getAttribute('data-seat'),'1');assert.match(await challenger.innerText(),/余烬魔王/);assert.match(await peers[0].locator('.accused').innerText(),/流浪勇者/);
  if(target==='demon'){await peers[0].screenshot({path:dir+'/challenge-small.png'});await fit(peers[0]);}
  await beat(peers[0],'verdict');assert.match(await peers[0].locator('.verdict-line').innerText(),/^全真 · 质疑失败$/);assert.equal(await peers[0].locator('.table-seats .true-card').count(),2);assert.equal(await peers[0].locator('.table-seats .false-card').count(),0);
  if(target==='demon'){
   await peers[0].waitForTimeout(220);
   await peers[0].screenshot({path:dir+'/truth-small.png'});await peers[1].screenshot({path:dir+'/truth-landscape.png'});await fit(peers[1]);
   const h=await peers[0].evaluate(()=>testHaptics.length);service.say(room,1,1);service.broadcast(room);await peers[0].waitForTimeout(180);assert.equal(await peers[0].evaluate(()=>testHaptics.length),h);assert.equal((await read(peers[0])).action.beat,'verdict');
  }
  await phase(peers[0],'outcome');await clocks(null);for(const p of peers)assert.equal(await p.locator('[data-do=\"drink\"]').count(),0);assert.equal((await read(peers[0])).action.actor,1);await peers[0].waitForTimeout(720);assert.equal((await read(peers[0])).action.beat,'drinking');assert.equal(await peers[0].locator('.result-line').first().isVisible(),false);
  const sprite=peers[0].locator('.drinker .actor-body');assert.equal(await sprite.getAttribute('data-action'),'drink');assert.ok(Number(await sprite.getAttribute('data-frame'))>=2);assert.equal(await peers[0].locator('.drinker .action-bottle').count(),0);
  if(target==='demon'){await peers[0].screenshot({path:dir+'/drinking-small.png'});await peers[1].screenshot({path:dir+'/drinking-landscape.png'});}
  await peers[0].waitForFunction(()=>JSON.parse(render_game_to_text()).action.beat!=='drinking');assert.equal(g.event.eliminated,false);assert.equal(await peers[0].locator('.result-line').first().isVisible(),true);await phase(peers[0],'playing');checks.push(target+' true + wildcard -> caller drinks');
 }
 // Every potion effect, including a visible stone actor after the drinking gesture.
 for(const [effect,drinks,curse] of [['hiccup',1,6],['smoke',2,6],['stone',0,1]]){
  await openTruth('hero',{drinks,curse});await phase(peers[0],'outcome');await beat(peers[0],effect);assert.equal((await read(peers[0])).game.event.effect,effect);await peers[0].screenshot({path:dir+'/effect-'+effect+'.png'});await fit(peers[0]);await peers[0].waitForTimeout(550);const shake=await peers[0].locator('#table').evaluate(el=>el.style.transform);assert.equal(shake,'translate(0px, 0px)');checks.push(effect+' animation + decay');
 }
 await openTruth('princess',{falseCard:true});await beat(peers[0],'verdict');assert.equal((await read(peers[0])).game.event.loser,0);assert.equal(await peers[0].locator('.table-seats .false-card').count(),1);assert.match(await peers[0].locator('.verdict-line').innerText(),/^有假牌$/);await peers[0].waitForTimeout(220);await peers[0].screenshot({path:dir+'/lie-small.png'});checks.push('mixed false card punishes accused');
 // Reduced motion, haptics and mute preferences persist and do not change authority.
 await menuClick(peers[0],'help');await peers[0].locator('[data-do="motion"]').click();await peers[0].locator('[data-do="haptics"]').click();await peers[0].locator('[data-do="close"]').first().click();await menuClick(peers[0],'mute');const a=await peers[0].evaluate(()=>({sound:audioStarts,h:testHaptics.length}));
 await openTruth('hero');await beat(peers[0],'verdict');assert.equal(await peers[0].evaluate(()=>audioStarts),a.sound);assert.equal(await peers[0].evaluate(()=>testHaptics.length),a.h);const reduced=await read(peers[0]);assert.equal(reduced.feedback.reducedMotion,true);assert.equal(reduced.feedback.hapticsOn,false);assert.equal(reduced.feedback.soundOn,false);assert.equal(await peers[0].locator('.challenger img').evaluate(el=>getComputedStyle(el).animationName),'none');checks.push('mute/reduced motion/haptic off');
 await menuClick(peers[0],'help');await peers[0].locator('[data-do="journal"]').click();assert.match(await peers[0].locator('.audit-history').innerText(),/小偷：万能真牌/);await peers[0].locator('[data-do="close"]').first().click();checks.push('audit contains actors and per-card truth');
 const g=await fixture('hero',{falseCard:true});g.deadline=Date.now()-1;service.tick();await peers[0].waitForFunction(()=>JSON.parse(render_game_to_text()).game.last?.source==='timeout');assert.match(await peers[0].locator('.last-play').innerText(),/超时.*随机代出/);await peers[1].locator('[data-do="challenge"]').click();await phase(peers[0],'reveal');assert.match(await peers[0].locator('.timeout-note').innerText(),/超时代出/);checks.push('timeout explicitly identified');
 const audioCount=await peers[1].evaluate(()=>audioStarts),hapticsCount=await peers[1].evaluate(()=>testHaptics.length);assert.ok(audioCount>20);assert.ok(hapticsCount>=6);
 // The reported scenario through real UI + shared matchmaker + delayed bot policy.
 await peers[0].reload();await phase(peers[0],'welcome');assert.equal((await read(peers[0])).feedback.reducedMotion,true);assert.equal((await read(peers[0])).feedback.hapticsOn,false);await peers[0].locator('[data-do="match"]').click();await phase(peers[0],'playing');
 const botRoom=service.rooms.get((await read(peers[0])).room),bg=botRoom.game;assert.equal(botRoom.humanCount,1);assert.equal(new Set(bg.players.map(p=>p.character)).size,4);assert.equal(new Set((await read(peers[0])).players.map(p=>p.character)).size,4);bg.turn=0;bg.order=[0,1,2,3];bg.target='hero';bg.players[0].hand=[{id:'hero-proof',kind:'hero'},{id:'thief-proof',kind:'thief'},{id:'keep-proof',kind:'hero'}];bg.phaseAt=Date.now();bg.deadline=Date.now()+30000;bg.revision++;botRoom.botAction=null;botRoom.strength=.98;service.randomInt=()=>0;service.broadcast(botRoom);
 await peers[0].waitForFunction(()=>JSON.parse(render_game_to_text()).game.hand.some(c=>c.id==='hero-proof'));await peers[0].locator('[data-do="card:hero-proof"]').click();await peers[0].locator('[data-do="card:thief-proof"]').click();await peers[0].locator('[data-do="play"]').click();await phase(peers[0],'reveal');await beat(peers[0],'verdict');const proof=await read(peers[0]);assert.equal(proof.game.event.accused,0);assert.equal(proof.game.event.caller,1);assert.equal(proof.game.event.lied,false);assert.equal(proof.game.event.loser,1);assert.ok(bg.phaseAt-bg.last.at>=3000);await peers[0].waitForTimeout(220);await peers[0].screenshot({path:dir+'/bot-challenges-truth.png'});checks.push('real matching UI: delayed bot challenges human truth and is punished');
 checks.push('matching humans and bots have four unique characters');assert.deepEqual(errors,[]);
 const result={passed:true,realWebSocketClients:4,controlledAuthorityFixtures:true,checks,audioOscillatorStarts:audioCount,nativeHapticCalls:hapticsCount,realPhone:false,errors};await writeFile(dir+'/browser-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();await new Promise(r=>server.close(r));}
