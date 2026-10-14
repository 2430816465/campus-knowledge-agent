import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {KEY,STAGES} from '../games/rush/data.js';
import {createBattle,spawn} from '../games/rush/battle.js';
import {fresh} from '../games/rush/profile.js';
const base=process.env.BASE_URL||'http://127.0.0.1:4173',out='artifacts/rush/mechanics/details';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],checks=[];
const read=p=>p.evaluate(()=>JSON.parse(render_game_to_text()));
const click=(p,a)=>p.locator(`[data-action="${a}"]`).click();
function fixture(stage=16,count=12){const b=createBattle(stage,{},'fixture-'+stage);b.count=b.peak=count;b.cursor=999;return b;}
function entity(b,event,y){spawn(b,event);b.entities.at(-1).y=y;}
async function pageFor(b,width=390,height=844,dpr=1){
 const p=await browser.newPage({viewport:{width,height},deviceScaleFactor:dpr,hasTouch:true});
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 const profile=fresh();profile.active=b;profile.selected=b.stage;profile.cleared=STAGES.map(s=>s.id);
 await p.addInitScript(({profile,key})=>{
  if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(profile));
  // Deterministic browser tests still use real input and production step/collision code.
  window.requestAnimationFrame=()=>0;window.__canvasTexts=[];
  const original=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.__canvasTexts.push(String(text));return original.call(this,text,...args);};
 },{profile,key:KEY});
 await p.goto(base+'/games/rush/index.html');await p.waitForFunction(()=>document.getElementById('loading').hidden,null,{polling:50});await click(p,'resume');return p;
}
async function touch(p,x){const box=await p.locator('canvas').boundingBox();await p.touchscreen.tap(box.x+x/480*box.width,box.y+box.height*.85);}
try{
 for(const [effect,stage]of [['haste',4],['range',7],['damage',10]]){
  const b=fixture(stage);entity(b,{kind:'gates',x:240,left:{effect,value:1,op:'+'},right:{op:'+',value:8}},400);
  const p=await pageFor(b,320,568);await p.evaluate(()=>advanceTime(0));await p.screenshot({path:`${out}/${effect}-gate.png`});
  assert.ok(!(await p.evaluate(()=>__canvasTexts)).some(t=>t.includes('剩')));await touch(p,132);await p.evaluate(()=>advanceTime(2600));
  const after=await read(p);assert.equal(after.battle.count,12);assert.equal(after.battle.modifiers[effect],1);assert.equal(after.battle.passed,1);assert.ok((await p.locator('#buff-label').innerText()).includes(effect==='damage'?'25%':'20%'));
  await click(p,'pause');const saved=await read(p);await p.reload();await p.waitForFunction(()=>document.getElementById('loading').hidden,null,{polling:50});assert.equal((await read(p)).battle.modifiers[effect],1);assert.equal((await read(p)).battle.time,saved.battle.time);
  await click(p,'resume');await p.evaluate(()=>advanceTime(600));assert.equal((await read(p)).battle.modifiers[effect],1);checks.push({effect,touchGate:true,reloadOnce:true});await p.close();
 }
 for(const [loot,amount,count,expected]of [['army',20,40,48],['trap',4,8,4],['lightning',0,8,8],['flame',0,8,8]]){
  const b=fixture(16,count);entity(b,{kind:'chest',x:132,hp:8,loot,amount,delivery:'break'},350);
  const p=await pageFor(b);await touch(p,132);await p.evaluate(()=>advanceTime(2500));const after=await read(p);
  assert.equal(after.battle.count,expected);assert.equal(after.battle.crates,1);
  if(loot==='trap')assert.equal(after.battle.trapLoss,4);
  if(['lightning','flame'].includes(loot)){assert.equal(after.battle.weaponType,loot);assert.ok((await p.locator('#stage-label').innerText()).includes(loot==='lightning'?'雷符':'炎符'));}
  await p.screenshot({path:`${out}/reward-${loot}.png`});await click(p,'pause');await p.reload();await p.waitForFunction(()=>document.getElementById('loading').hidden,null,{polling:50});assert.equal((await read(p)).battle.count,expected);assert.equal((await read(p)).battle.crates,1);checks.push({loot,actualAutoFire:true,count:expected,saveOnce:true});await p.close();
 }
 for(const type of ['lightning','flame']){
  const b=fixture(16,1);b.weaponType=type;
  for(const x of [240,270,290,300])entity(b,{kind:'enemy',x,hp:100,damage:1,type:'skeleton'},540);
  entity(b,{kind:'chest',x:280,hp:100,loot:'trap',amount:4,delivery:'break'},550);
  const p=await pageFor(b);await p.evaluate(()=>advanceTime(250));const s=await read(p),foes=s.battle.entities.filter(e=>e.kind==='enemy');
  assert.equal(foes[0].hp,99);assert.equal(foes.slice(1).filter(e=>e.hp<100).length,type==='lightning'?2:3);assert.equal(s.battle.entities.find(e=>e.loot==='trap').hp,100);
  await p.screenshot({path:`${out}/${type}-impact.png`});checks.push({type,actualAreaImpact:true,crateUnaffected:true});await p.close();
 }
 // Red crates can be intentionally avoided by real touch; do not require shooting them.
 const avoid=fixture(2,8);entity(avoid,{kind:'chest',x:84,hp:60,loot:'trap',amount:4,delivery:'break'},200);
 const safe=await pageFor(avoid);await touch(safe,300);await safe.evaluate(()=>advanceTime(7500));assert.equal((await read(safe)).battle.count,8);assert.equal((await read(safe)).battle.trapLoss,0);await safe.close();checks.push('red crate avoided by changing lanes');
 // Visual stress fixture: approved apprentice art, full team, all distinct crates, real rune projectiles.
 for(const [width,height,dpr,type]of [[320,568,1,'lightning'],[390,844,3,'flame'],[844,390,1,'lightning'],[1440,900,1,'flame']]){
  const b=fixture(18,48);b.weaponType=type;b.weapon=2;b.modifiers={haste:3,range:3,damage:3};
  entity(b,{kind:'gates',x:240,left:{effect:'damage',value:1,op:'+'},right:{op:'÷',value:3}},220);
  for(const [x,loot,amount]of [[84,'trap',12],[190,'army',20],[300,'lightning',0],[396,'flame',0]])entity(b,{kind:'chest',x,hp:999,loot,amount,delivery:'break'},420);
  const p=await pageFor(b,width,height,dpr);await p.evaluate(()=>advanceTime(800));await p.screenshot({path:`${out}/full-${width}x${height}-dpr${dpr}-${type}.png`});const s=await read(p);assert.equal(s.battle.count,48);assert.ok(s.battle.bullets<=240);assert.equal(s.assetsLoaded,9);
  const bounds=await p.locator('#hud').boundingBox(),pause=await p.locator('#pause').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1);assert.ok(pause.y>=0&&pause.y+pause.height<=height);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.ok(!(await p.evaluate(()=>__canvasTexts)).some(t=>t.includes('剩')));
  checks.push({width,height,dpr,type,count:48,bullets:s.battle.bullets});await p.close();
 }
 // Previous authored-layout snapshots resume with their original rules.
 const old=fixture(3,9);old.layoutVersion=2;delete old.modifiers;delete old.weaponType;old.cursor=0;
 const legacy=await pageFor(old);await click(legacy,'pause');assert.ok((await legacy.locator('#overlay').innerText()).includes('更新前的旧路线'));await click(legacy,'resume');await legacy.evaluate(()=>advanceTime(11000));assert.equal((await read(legacy)).battle.layoutVersion,2);assert.ok(!(await read(legacy)).battle.entities.some(e=>e.delivery==='break'));await legacy.close();checks.push('version 2 active route retained');
 assert.deepEqual(errors,[]);await fs.writeFile(`${out}/report.json`,JSON.stringify({checks,errors},null,2));console.log('PASS: touch stat gates, direct crate rewards/loss/avoidance, weapon change, exact reload, full squad at four viewport/DPR settings, old route and no remaining-person labels');
}finally{await browser.close();}
