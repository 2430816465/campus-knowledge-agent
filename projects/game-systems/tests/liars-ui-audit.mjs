import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {attachLiars} from '../games/liars/server.mjs';
const root=resolve(process.env.LIARS_WEB_ROOT||'.'),dir=process.env.LIARS_ARTIFACT_DIR||'artifacts/liars-126-audit/final',errors=[],checks=[];
const server=createServer(async(req,res)=>{try{const p=resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!p.startsWith(root))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.woff':'font/woff'})[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.statusCode=404;res.end();}});
const service=attachLiars(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true}),peers=[];await mkdir(dir,{recursive:true});
const read=p=>p.evaluate(()=>JSON.parse(render_game_to_text()));
const wait=(p,screen)=>p.waitForFunction(screen=>JSON.parse(render_game_to_text()).screen===screen,screen);
async function audit(p,label){
 const report=await p.evaluate(()=>{
  const issue=[],buttons=[];const visible=n=>{if(document.querySelector('dialog[open]')&&!n.closest('dialog'))return false;for(let a=n;a;a=a.parentElement){const s=getComputedStyle(a);if(s.visibility==='hidden'||s.display==='none'||Number(s.opacity)===0)return false;}const s=getComputedStyle(n),r=n.getBoundingClientRect();return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&Number(s.opacity)>0&&!(n.closest('.hand-zone')&&getComputedStyle(n.closest('.hand-zone')).visibility==='hidden');};
  for(const n of document.querySelectorAll('button,.actor-body,.seat-timer,.focus-card,.table-emblem,.scene-heading,.verdict-line,.action-actor strong,.seat-role,.pile-label,.selection-note,.seat-speech')){
   if(!visible(n))continue;const r=n.getBoundingClientRect(),text=(n.innerText||n.getAttribute('aria-label')||n.className).trim();
   const panel=n.closest('dialog[open],.event-box,.hand-zone,.panel');
   const scrollable=!document.body.classList.contains('at-table')||n.closest('dialog');
   if(r.x<-.5||r.right>innerWidth+.5||!scrollable&&(r.y<-.5||r.bottom>innerHeight+.5))issue.push({type:'viewport',text,box:r.toJSON()});
   if(n.tagName==='BUTTON'){const range=document.createRange();range.selectNodeContents(n);const t=range.getBoundingClientRect();if(t.width&&n.childElementCount===0&&(t.x<r.x-1||t.right>r.right+1||t.y<r.y-1||t.bottom>r.bottom+1))issue.push({type:'button-text',text});buttons.push({text,box:r.toJSON()});}
   if(panel&&document.body.classList.contains('at-table')&&!n.closest('dialog')){const b=panel.getBoundingClientRect();if(r.x<b.x-2||r.right>b.right+2||r.y<b.y-2||r.bottom>b.bottom+2)issue.push({type:'panel',text,box:r.toJSON(),panel:b.toJSON()});}
  }
  const actors=[...document.querySelectorAll('.actor-art')].filter(visible).map(n=>n.getBoundingClientRect());
  for(const n of document.querySelectorAll('.focus-card,.play-top,.seat-speech'))if(visible(n)){const r=n.getBoundingClientRect();if(actors.some(b=>Math.min(r.right,b.right)-Math.max(r.x,b.x)>3&&Math.min(r.bottom,b.bottom)-Math.max(r.y,b.y)>3))issue.push({type:'actor-overlap',text:n.innerText});}
  return {width:innerWidth,height:innerHeight,issue,buttons,overflow:document.documentElement.scrollWidth>innerWidth,text:document.querySelector('.event-box')?.innerText};
 });
 await p.screenshot({path:dir+'/'+label+'.png'});checks.push({label,...report});
}
try{
 for(let i=0;i<4;i++){
  const c=await browser.newContext({viewport:{width:844,height:390},hasTouch:true}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});await p.goto(base+'/games/liars/index.html');
  await p.locator('[data-do="character:'+['hero','demon','goblin','rogue'][i]+'"]').click();if(i){await p.locator('[data-do="guest"]').click();await p.locator('#code').fill((await read(peers[0])).room);}await p.locator('[data-do="connect"]').click();await wait(p,'lobby');peers.push(p);
 }
 for(const p of peers)await p.locator('[data-do="ready"]').click();await peers[0].locator('[data-do="start"]').click();await wait(peers[0],'playing');const room=service.rooms.get((await read(peers[0])).room),p=peers[0];
 for(const [width,height] of [[568,320],[667,375],[740,360],[844,390],[915,412],[1024,768],[1280,800]]){
  await p.setViewportSize({width,height});
  for(const scene of ['turn','other-turn','played','selected','urgent','chat-bottom','chat-top','challenge','flip','verdict-true','verdict-lie','drink','safe','stone','finished']){
   room.chat=[];service.start(room);const g=room.game,now=Date.now();g.order=[0,1,2,3];g.turn=scene==='other-turn'?1:0;g.target='hero';g.roundAt=now-4000;g.phaseAt=now;g.deadline=now+30000;
   if(scene==='urgent')g.deadline=now+4800;
   if(scene==='played'){g.plays=[{seat:3,count:2,target:'hero',round:1,at:now}];g.last={seat:3,cards:[{kind:'hero'},{kind:'thief'}],target:'hero',round:1,at:now};}
   if(!['turn','other-turn','played','selected','urgent','chat-bottom','chat-top'].includes(scene)){
    const lie=scene==='verdict-lie',stone=scene==='stone';g.plays=[{seat:0,count:2},{seat:1,count:4},{seat:2,count:4},{seat:3,count:4},{seat:0,count:3}].map(a=>({...a,round:1,target:'hero',at:now-1000}));g.last={seat:0,cards:[{kind:'hero'},{kind:'thief'},{kind:lie?'demon':'hero'}],target:'hero',round:1,at:now-1000};g.event={caller:1,accused:0,loser:lie?0:1,lied:lie,target:'hero',cards:g.last.cards.map(c=>c.kind)};
    if(['challenge','flip','verdict-true','verdict-lie'].includes(scene)){g.phase='reveal';g.phaseAt=now-({challenge:250,flip:1900,'verdict-true':3400,'verdict-lie':3400}[scene]);g.deadline=now+6000;}
    else if(scene==='finished'){g.phase='finished';g.winner=0;g.deadline=null;g.players.forEach((a,i)=>a.alive=i===0);}
    else{g.phase='outcome';g.phaseAt=now-(scene==='drink'?800:2200);g.deadline=now+4800;g.players[1].drinks=1;g.players[1].alive=!stone;Object.assign(g.event,{drink:1,effect:stone?'stone':'spark',eliminated:stone});}
   }
   service.broadcast(room);await p.waitForFunction(id=>JSON.parse(render_game_to_text()).game.id===id,g.id);await p.waitForTimeout(60);if(scene==='selected')for(const card of (await p.locator('.hand .card').all()).slice(0,3))await card.click();if(scene.startsWith('chat-')){service.say(room,scene==='chat-top'?2:0,0);service.broadcast(room);await p.waitForTimeout(60);}await audit(p,width+'x'+height+'-'+scene);
  }
  if(!await p.locator('#help').isVisible())await p.locator('#table-menu').click();await p.locator('#help').click();await audit(p,width+'x'+height+'-rules');await p.locator('[data-do="close"]').first().click();
  await p.locator('#table-menu').click();await audit(p,width+'x'+height+'-menu');await p.locator('#chat').click();await audit(p,width+'x'+height+'-quick-chat');await p.locator('[data-do="close"]').first().click();await p.locator('#table-menu').click();await p.locator('#help').click();await p.locator('[data-do="journal"]').click();await audit(p,width+'x'+height+'-journal');await p.locator('[data-do="close"]').first().click();
 }
 const report={baseline:root,checks,errors,issues:checks.flatMap(c=>c.issue.map(i=>({label:c.label,...i})))};await writeFile(dir+'/ui-results.json',JSON.stringify(report,null,2));assert.deepEqual(errors,[]);assert.deepEqual(report.issues,[]);console.log(JSON.stringify({scenes:checks.length,issues:report.issues.length,errors,examples:report.issues.slice(0,12)}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
