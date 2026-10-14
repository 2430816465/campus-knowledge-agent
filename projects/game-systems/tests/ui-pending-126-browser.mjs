import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {fresh,conclude} from '../games/nightwatch/profile.js';
import {createBattle,Battle} from '../games/nightwatch/battle.js';
const require=createRequire(import.meta.url),G=require('../games/coop/src/game-shared.js');
const base=process.env.BASE_URL||'http://127.0.0.1:4232';
const out=process.env.QA_OUT||'C:/Users/24308/Desktop/总/当前最新修改-待整合/1.26.0-守夜与闯关修复/验收';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),report={layouts:[],nightwatch:[],campaign:[],flows:[],errors:[]};
const sizes=[{width:320,height:568},{width:390,height:844},{width:412,height:915},{width:568,height:320},{width:844,height:390}];
const read=p=>p.evaluate(()=>JSON.parse(render_game_to_text()));
async function context(size,seed){const c=await browser.newContext({viewport:size,hasTouch:true,isMobile:true});const p=await c.newPage();p.on('pageerror',e=>report.errors.push(e.message));p.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});if(seed)await p.addInitScript(seed);return {c,p};}
async function audit(p,name,selector,strictVertical=false){
 const info=await p.locator(selector).evaluate((node,{strictVertical})=>{
  const rect=node.getBoundingClientRect(),bad=[];
  for(const button of node.querySelectorAll('button')){const r=button.getBoundingClientRect();if(!r.width||!r.height)continue;
   if(r.left<rect.left-1||r.right>rect.right+1||r.left<-.5||r.right>innerWidth+.5||(strictVertical&&(r.top<0||r.bottom>innerHeight+.5)))bad.push({id:button.id,text:button.textContent,rect:r.toJSON()});
  }
  return {rect:rect.toJSON(),bad,overflow:document.documentElement.scrollWidth>innerWidth+1};
 },{strictVertical});report.layouts.push({name,...info});await p.screenshot({path:out+'/'+name+'.png'});assert.deepEqual(info.bad,[],name+' button containment');assert.equal(info.overflow,false,name+' horizontal overflow');return info;
}
function nightFixture(summon='golem'){
 const p=fresh();p.frontier=30;p.settings.guides=false;p.settings.sound=false;p.summon=summon;p.summons=["golem","dragon"];
 const s=p.active=createBattle(p);s.wave=1;s.waiting=1000;s.partnerClock=s.wallClock=1000;s.points=0;
 s.abilities={bolt:{level:1,damage:0,cooldown:0},rock:{level:1,damage:0,cooldown:0}};s.cooldowns={bolt:1000,rock:1000};
 const e=new Battle(s,p).spawn('rock_golem',210,150);e.hp=e.maxHp=1e8;e.speed=0;e.special=e.attackClock=1000;return p;
}
async function nightPage(profile,size){const {c,p}=await context(size);await p.addInitScript(profile=>{if(!localStorage.getItem('camp-nightwatch-v1'))localStorage.setItem('camp-nightwatch-v1',JSON.stringify(profile));},profile);await p.goto(base+'/games/nightwatch/index.html');await p.waitForFunction(()=>document.querySelector('#loading')?.hidden&&window.render_game_to_text);await p.evaluate(()=>advanceTime(0));await p.locator('[data-action=resume]').click();return {c,p};}
function contrast(a,b){const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});const l=s=>rgb(s).reduce((n,x,i)=>n+x*[.2126,.7152,.0722][i],0),x=l(a),y=l(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
const returning=()=>localStorage.setItem('zcyg_mechanism_guides_v1',JSON.stringify(['movement','dash','doubleJump','push','lift','patrol','spikes','checkpoint','pickup','sharedExit']));
try{
 for(const size of sizes){
  const profile=nightFixture();profile.active.time=165;profile.active.kills=78;profile.active.damage={bolt:6400,rock:3600,partner:900,summon:1400};conclude(profile,profile.active,true);
  const {c,p}=await nightPage(profile,size);await audit(p,'night-result-'+size.width,'#screen .panel');
  const colors=await p.evaluate(()=>['.reward-list span','.panel-foot button','.damage-row','.result-banner .eyebrow'].map(sel=>{const e=document.querySelector(sel),s=getComputedStyle(e);let n=e,bg=s.backgroundColor;while(bg==='rgba(0, 0, 0, 0)'&&n.parentElement){n=n.parentElement;bg=getComputedStyle(n).backgroundColor;}return {sel,fg:s.color,bg};}));
  for(const color of colors){color.ratio=contrast(color.fg,color.bg);assert(color.ratio>=4.5,JSON.stringify(color));}report.nightwatch.push({size,colors});await c.close();
 }
 for(const summon of ['golem','dragon']){
  const {c,p}=await nightPage(nightFixture(summon),sizes[1]);await p.locator('[data-action=summon]').click();await p.evaluate(()=>advanceTime(0));assert.equal((await read(p)).animation.guardian.action,'summon');await p.screenshot({path:out+'/'+summon+'-action.png'});
  await p.evaluate(()=>advanceTime(700));const idle=(await read(p)).animation.guardian;assert.equal(idle.action,'idle');assert.equal(idle.frame,0);await p.screenshot({path:out+'/'+summon+'-idle.png'});
  await p.locator('[data-action=pause]').click();await p.evaluate(()=>advanceTime(1000));assert.deepEqual((await read(p)).animation.guardian,idle);await p.locator('[data-action=save-home]').click();await p.reload();await p.waitForFunction(()=>document.querySelector('#loading')?.hidden&&window.render_game_to_text);await p.evaluate(()=>advanceTime(0));await p.locator('[data-action=resume]').click();await p.evaluate(()=>advanceTime(0));assert.deepEqual((await read(p)).animation.guardian,idle);report.flows.push(summon+' action/idle/pause/save/resume');await c.close();
 }
 {const profile=nightFixture();const engine=new Battle(profile.active,profile);engine.cast('rock');const {c,p}=await nightPage(profile,sizes[1]);await p.evaluate(()=>advanceTime(0));const before=(await read(p)).animation.rocks[0];await p.screenshot({path:out+'/rock-0.png'});await p.evaluate(()=>advanceTime(200));const after=(await read(p)).animation.rocks[0];assert(Math.abs(after.y-before.y+30)<1e-7);assert(after.angle>before.angle);await p.screenshot({path:out+'/rock-200.png'});await p.locator('[data-action=pause]').click();await p.evaluate(()=>advanceTime(500));assert.deepEqual((await read(p)).animation.rocks[0],after);report.flows.push('rock travel/rotation/ground shadow/pause');await c.close();}
 for(const size of sizes){
  const {c,p}=await context(size,returning);await p.goto(base+'/games/coop/index.html?solo=1');await p.locator('#soloMode[aria-pressed=true]').waitFor();await audit(p,'coop-home-'+size.width,'#home');
  await p.locator('#chooseLevel').click();await audit(p,'coop-levels-'+size.width,'.level-panel');assert.equal(await p.locator('.level-card').count(),36);await p.locator('#hardMode').click();assert.equal(await p.locator('.level-card').count(),36);await p.locator('.level-card:not(:disabled)').first().click();
  await p.locator('#startSolo').click();await p.bringToFront();await p.waitForTimeout(80);await p.locator('#cornerMenu').click();await audit(p,'coop-menu-'+size.width,'#cornerPanel',true);
  const before=(await read(p)).elapsed;await p.waitForTimeout(160);assert.equal((await read(p)).elapsed,before);await p.keyboard.press('Tab');assert.notEqual(await p.evaluate(()=>document.activeElement.id),'helpButton','menu Tab remains usable');
  await p.locator('#helpButton').click();await audit(p,'coop-help-'+size.width,'#gameHelp');await p.locator('#closeHelp').click();assert.equal((await read(p)).soloPaused,false);
  await p.locator('#cornerMenu').click();await p.locator('#mechanismHelp').click();await audit(p,'coop-guide-library-'+size.width,'#guideLibrary');
  for(let i=0;i<10;i++){const button=p.locator('#guideList button').nth(i);const pager=p.locator('#guideLibrary .fit-pager select');for(let page=0;!(await button.isVisible())&&page<10;page++){await pager.selectOption(String(page));}await button.click();await audit(p,'coop-guide-'+size.width+'-'+i,'#mechanismGuide');assert.equal((await read(p)).soloPaused,true);await p.locator('#guideConfirm').click();assert.equal((await read(p)).soloPaused,false);await p.locator('#guideClose').click();await p.locator('#cornerMenu').click();await p.locator('#mechanismHelp').click();}
  await p.locator('#closeGuideLibrary').click();assert.equal((await read(p)).soloPaused,false);
  await p.locator('#switchPlayer').click();assert.equal((await read(p)).ownSlot,1);await p.locator('#switchPlayer').click();assert.equal((await read(p)).ownSlot,0);
  const cdp=await c.newCDPSession(p),pt={id:1,x:Math.min(200,size.width*.4),y:size.height*.6};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pt]});pt.x+=30;await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[pt]});assert.equal((await read(p)).controls.right,true);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal((await read(p)).controls.right,false);
  await p.locator('#cornerMenu').click();const resets=await p.evaluate(()=>CampCoop.snapshot().world.respawns);await p.locator('#resetButton').click();assert((await p.evaluate(()=>CampCoop.snapshot().world.respawns))>resets);assert.equal((await read(p)).soloPaused,false);
  await p.locator('#cornerMenu').click();await p.locator('#leaveGame').click();await p.locator('#resumeSolo').click();assert.equal((await read(p)).soloPaused,false);await p.locator('#cornerMenu').click();await p.locator('#mapButton').click();assert.equal((await read(p)).soloPaused,false);await p.locator('#cornerMenu').click();await p.locator('#mapButton').click();
  const icons=await p.evaluate(()=>[...document.querySelectorAll('.touch-controls button svg')].map(e=>{const a=e.getBoundingClientRect(),b=e.parentElement.getBoundingClientRect();return Math.abs((a.left+a.right-b.left-b.right)/2);}));assert(icons.every(n=>n<1),'touch icon horizontal centers');
  await p.evaluate(()=>{const w=CampCoop.snapshot().world,L=RushGame.stageFor(w);for(const player of w.players){player.x=L.exit.x+2;player.y=L.exit.y+L.exit.h-56;player.vx=player.vy=0;}});await p.evaluate(()=>advanceTime(50));assert.equal((await read(p)).phase,'intermission');await audit(p,'coop-result-size-'+size.width,'#result .result-card');const resultColors=await p.evaluate(()=>['#nextStatus','.reward-line strong','.reward-line small'].map(sel=>{const e=document.querySelector(sel),cs=getComputedStyle(e);let n=e,bg=cs.backgroundColor;while(bg==='rgba(0, 0, 0, 0)'&&n.parentElement){n=n.parentElement;bg=getComputedStyle(n).backgroundColor;}return{sel,fg:cs.color,bg};}));assert(resultColors.every(x=>contrast(x.fg,x.bg)>=4.5),'coop result contrast');if(size.width>size.height){const r=await p.locator('#resultHome').boundingBox();assert(r.y+r.height<=size.height,'short result home is fully visible');}await p.locator('#resultNext').click();assert.equal((await read(p)).soloPaused,false);
  report.flows.push('coop '+size.width+' touch/menus/10 guides/switch/reset/leave/resume/map/result/next/icon centers');await c.close();
 }
 // Each map is loaded through real selection UI. Exit placement is a fixture
 // testing transitions and recovery, not a claim of solving all map routes.
 {const {c,p}=await context(sizes[4],()=>{localStorage.setItem('zcyg_mechanism_guides_v1',JSON.stringify(['movement','dash','doubleJump','push','lift','patrol','spikes','checkpoint','pickup','sharedExit']));});
  await p.goto(base+'/games/coop/index.html?solo=1');await p.locator('#soloMode[aria-pressed=true]').waitFor();
  await p.evaluate(ids=>{const saved={version:1,progress:{coins:0,cleared:ids,marks:{},ownedSkins:['default'],skin:'default'},world:null,active:0,award:null};localStorage.setItem('zcyg_solo_72_v1',JSON.stringify(saved));},G.LEVELS.map(l=>l.id));await p.reload();await p.locator('#soloMode[aria-pressed=true]').waitFor();
  for(let index=0;index<72;index++){
   await p.locator('#chooseLevel').click();await p.locator(index<36?'#normalMode':'#hardMode').click();await p.locator('[data-level="'+index+'"]').click();await p.locator('#startSolo').click();await p.bringToFront();
   await p.evaluate(()=>advanceTime(200));assert.equal(await p.evaluate(()=>CampCoop.snapshot().world.levelIndex),index);await p.locator('#cornerMenu').click();await audit(p,'coop-map-menu-'+index,'#cornerPanel',true);await p.locator('#resetButton').click();assert.equal((await read(p)).soloPaused,false);
   await p.evaluate(()=>{const w=CampCoop.snapshot().world,L=RushGame.stageFor(w);for(const player of w.players){player.x=L.exit.x+2;player.y=L.exit.y+L.exit.h-56;player.vx=player.vy=0;}});await p.evaluate(()=>advanceTime(50));assert.equal((await read(p)).phase,'intermission','map '+index+' exit transition');await audit(p,'coop-result-'+index,'#result .result-card');
   const next=G.nextLevelIndex(index);if(next!==null){await p.locator('#resultNext').click();assert.equal(await p.evaluate(()=>CampCoop.snapshot().world.levelIndex),next);assert.equal((await read(p)).soloPaused,false);await p.locator('#cornerMenu').click();await p.locator('#leaveGame').click();}else{assert.equal(await p.locator('#resultNext').isVisible(),false);await p.locator('#resultHome').click();}
   report.campaign.push({index,loaded:true,reset:true,fixtureExit:true,next});
  }await c.close();
 }
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify({layouts:report.layouts.length,maps:report.campaign.length,flows:report.flows,errors:report.errors}));
}catch(e){report.failure=e.stack;throw e;}finally{await writeFile(out+'/browser-report.json',JSON.stringify(report,null,2));await browser.close();}

