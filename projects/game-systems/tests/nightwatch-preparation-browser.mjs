import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {fresh} from '../games/nightwatch/profile.js';
import {createBattle,Battle,availableCards} from '../games/nightwatch/battle.js';
import {SKILLS,PARTNERS,SUMMONS,WALLS} from '../games/nightwatch/data.js';
const base=process.env.BASE_URL||'http://127.0.0.1:4232',out='C:/Users/24308/Desktop/总/当前最新修改-待整合/1.26.0-守夜技能与备战优化/验收';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),report={layouts:[],flows:[],errors:[]};
const sizes=[{width:320,height:568},{width:360,height:640},{width:390,height:844},{width:412,height:915},{width:568,height:320},{width:740,height:360},{width:844,height:390},{width:1280,height:800}];
const suite=process.env.NIGHTWATCH_SUITE||'full';
const read=page=>page.evaluate(()=>JSON.parse(render_game_to_text()));
async function ready(page){await page.waitForFunction(()=>document.querySelector('#loading')?.hidden&&window.render_game_to_text);await page.evaluate(async()=>{await document.fonts.ready;advanceTime(0);});await page.waitForTimeout(100);}
async function settle(page){await page.waitForTimeout(80);}
async function click(page,action){const button=page.locator(`[data-action="${action}"]`).first();await button.evaluate(e=>window.ScreenPages?.reveal(e));await settle(page);await button.click();await settle(page);}
async function open(profile,size){const ctx=await browser.newContext({viewport:size,hasTouch:true,isMobile:true}),page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`);});await page.addInitScript(profile=>{if(!localStorage.getItem('camp-nightwatch-v1'))localStorage.setItem('camp-nightwatch-v1',JSON.stringify(profile));},profile);await page.goto(base+'/games/nightwatch/index.html');await ready(page);return {ctx,page};}
async function audit(page,name,selector='.preparation-panel',screenshot=false){
 const result=await page.locator(selector).evaluate(root=>{
  const bounds=root.getBoundingClientRect(),bad=[],buttons=[];
  const visible=e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(e).visibility!=='hidden';};
  for(const e of root.querySelectorAll('button,select,input')){if(!visible(e))continue;const r=e.getBoundingClientRect();buttons.push({text:e.textContent.trim().slice(0,50),r:r.toJSON(),tag:e.tagName});if(r.left<bounds.left-1||r.right>bounds.right+1||r.top<bounds.top-1||r.bottom>bounds.bottom+1||r.top<0||r.bottom>innerHeight+1||r.left<0||r.right>innerWidth+1)bad.push({kind:'control-outside',text:e.textContent,r:r.toJSON()});}
  for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++){const a=buttons[i].r,b=buttons[j].r;if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2)bad.push({kind:'controls-overlap',a:buttons[i].text,b:buttons[j].text});}
  const body=root.querySelector('.panel-body');if(root.hasAttribute('data-fit-native')&&body&&body.scrollHeight>body.clientHeight+1)bad.push({kind:'body-clipped',height:body.clientHeight,scroll:body.scrollHeight});
  for(const e of root.querySelectorAll('h2,h3,p,small,.mini-icon'))if(visible(e)){const r=e.getBoundingClientRect();if(r.left<bounds.left-1||r.right>bounds.right+1||r.bottom>innerHeight+1)bad.push({kind:'text-outside',text:e.textContent,r:r.toJSON()});if(!e.children.length&&e.scrollWidth>e.clientWidth+2)bad.push({kind:'text-horizontal-clipping',text:e.textContent});}
  return {bounds:bounds.toJSON(),bad,buttons,overflow:document.documentElement.scrollWidth>innerWidth+1};
 });report.layouts.push({name,...result});if(screenshot||result.bad.length)await page.screenshot({path:out+'/'+name+'.png'});assert.deepEqual(result.bad,[],name+' bounds/overlap');assert.equal(result.overflow,false,name+' horizontal overflow');
}
async function auditPages(page,name,selector='.panel'){
 await page.waitForTimeout(150);const pager=page.locator(selector+' .fit-pager:not([hidden]) select'),count=await pager.count()?await pager.locator('option').count():1;
 for(let n=0;n<count;n++){if(await pager.count()){await pager.selectOption(String(n));await settle(page);}await audit(page,name+'-page-'+n,selector,n===0);}
}
function rich(){const p=fresh();p.frontier=30;p.runs=1;p.settings.guides=p.settings.sound=false;p.coins=p.pages=p.ore=p.seals=1e7;return p;}
try{
 if(suite!=='pages')for(const size of sizes){
  const {ctx,page}=await open(rich(),size),suffix=size.width+'x'+size.height;await click(page,'prepare:campaign');await audit(page,'prepare-'+suffix,undefined,true);
  for(const tab of ['works','spells','cores']){
   await click(page,'research-tab:'+tab);await audit(page,tab+'-'+suffix,undefined,true);
   if(tab==='works'){await page.locator('[data-picker=work]').selectOption('wall');await settle(page);await audit(page,'wall-'+suffix);await page.locator('[data-picker=work]').selectOption('weapon');await settle(page);const before=(await read(page)).profile;await click(page,'improve:weapon:-');assert.equal((await read(page)).profile.weapon,before.weapon+1);await audit(page,'work-upgraded-'+suffix);}
   if(tab==='spells')for(const skill of SKILLS){await page.locator('[data-picker=skill]').focus();await page.locator('[data-picker=skill]').selectOption(skill.id);await settle(page);assert.equal(await page.evaluate(()=>document.activeElement?.dataset.picker),'skill');await audit(page,'spell-'+skill.id+'-'+suffix);}
   if(tab==='cores')for(const core of ['ember','frost','storm','star']){await page.locator('[data-picker=core]').selectOption(core);await settle(page);await audit(page,'core-'+core+'-'+suffix);}
  }
  await page.locator('[data-picker=core]').selectOption('frost');await click(page,'acquire:core:frost');assert.equal((await read(page)).profile.core,'frost');await click(page,'research-tab:summary');
  for(const action of ['allies','equipment','stages']){await click(page,action);await audit(page,action+'-'+suffix,'.panel',true);if(action==='allies')for(const [category,items]of [['partner',PARTNERS],['summon',SUMMONS],['wall',WALLS]]){await click(page,'ally-tab:'+category);for(const item of items){await page.locator('[data-picker=ally]').selectOption(item.id);await settle(page);await audit(page,'ally-'+item.id+'-'+suffix);const acquire=page.locator('[data-action="acquire:'+category+':'+item.id+'"]');if(!await acquire.isDisabled()){await click(page,'acquire:'+category+':'+item.id);await audit(page,'ally-owned-'+item.id+'-'+suffix);}if(category==='partner'){await click(page,'improve:partner:'+item.id);await audit(page,'ally-upgraded-'+item.id+'-'+suffix);}}}await click(page,'close');assert.equal((await read(page)).view,'prepare');}
  await click(page,'start-prepared');assert.equal((await read(page)).view,'battle');assert((await read(page)).battle.skills.ice);await page.evaluate(()=>advanceTime(500));await click(page,'pause');const t=(await read(page)).battle.time;await page.evaluate(()=>advanceTime(2000));assert.equal((await read(page)).battle.time,t);await click(page,'save-home');await page.reload();await ready(page);await click(page,'resume');assert.equal((await read(page)).battle.time,t);report.flows.push({size,prepUpgradeLoadoutStartPauseResume:true});await ctx.close();
 }
 if(suite!=='preparation')for(const size of sizes){const {ctx,page}=await open(rich(),size),suffix=size.width+'x'+size.height;
  for(const action of ['equipment','supplies','codex','settings','stages','help']){if(action==='help')await click(page,'settings');await click(page,action);await auditPages(page,'menu-'+action+'-'+suffix);if(action==='equipment'){await click(page,'tab:gems');await auditPages(page,'menu-gems-'+suffix);}await click(page,'close');}
  await click(page,'settings');await click(page,'help');for(const id of ['skill-gravity','skill-ward','skill-trap','reactions']){await click(page,'guide:'+id);await auditPages(page,'guide-'+id+'-'+suffix,'.guide-card');await click(page,'guide-done');}await ctx.close();
 }
 if(suite!=='pages'){
 for(const type of ['new','poor','max']){
  const p=type==='new'?fresh():rich();p.settings.guides=p.settings.sound=false;if(type==='poor')p.coins=p.pages=p.seals=p.ore=0;if(type==='max'){p.weapon=p.wallLevel=50;for(const key of Object.keys(p.skills))p.skills[key]=20;}
  const {ctx,page}=await open(p,sizes[0]);await click(page,'prepare:campaign');await click(page,'research-tab:works');await audit(page,type+'-works',undefined,true);if(type!=='new')assert(await page.locator('[data-action="improve:weapon:-"]').isDisabled());
  await click(page,'research-tab:spells');await page.locator('[data-picker=skill]').selectOption('ward');await settle(page);await audit(page,type+'-skill',undefined,true);if(type!=='rich')assert(await page.locator('[data-action="improve:skill:ward"]').isDisabled());await click(page,'close');assert.equal((await read(page)).view,'home');await ctx.close();
 }
 for(const size of sizes){
  const p=rich(),s=p.active=createBattle(p);s.status='choice';s.points=1;s.choices=['learn-gravity','learn-ward','learn-trap'].map(id=>availableCards(s,p).find(c=>c.id===id));
  const {ctx,page}=await open(p,size);await click(page,'resume');await audit(page,'choice-new-'+size.width+'x'+size.height,'.choice-panel',true);await click(page,'card:learn-gravity');assert((await read(page)).battle.skills.gravity);await ctx.close();
  const p2=rich(),b=p2.active=createBattle(p2);b.abilities.ice=b.abilities.lightning={level:1,damage:0,cooldown:0};b.upgrades['ice-freeze']=1;b.status='choice';b.points=1;b.choices=['thermal-shock','storm-conduct','fire-super'].map(id=>({...availableCards(b,p2).find(c=>c.id===id)}));b.choices[2]={id:'fire-super',name:'巨型火球',desc:'火球伤害 +100%，爆炸范围 +40%',element:'fire',skill:'fire',kind:'extra'};
  const next=await open(p2,size);await click(next.page,'resume');await audit(next.page,'choice-reaction-'+size.width+'x'+size.height,'.choice-panel',true);await next.ctx.close();
 }
 // Real tactical battlefield, including persisted arming phase and charges.
 const p=rich(),s=p.active=createBattle(p),engine=new Battle(s,p);s.waiting=s.partnerClock=s.wallClock=1000;s.wave=1;s.abilities=Object.fromEntries(['bolt','gravity','ward','trap','ice'].map(id=>[id,{level:1,damage:0,cooldown:0}]));s.cooldowns=Object.fromEntries(Object.keys(s.abilities).map(id=>[id,1000]));for(const [i,type]of ['skeleton','skeleton','mage_red'].entries()){const e=engine.spawn(type,200+i*30,280+i*12);e.speed=0;e.hp=e.maxHp=10000;e.special=e.attackClock=1000;}s.aim={x:230,y:290};for(const id of ['gravity','ward','trap'])engine.cast(id);
 const {ctx,page}=await open(p,sizes[2]);await click(page,'resume');await page.evaluate(()=>advanceTime(500));await page.screenshot({path:out+'/tactical-battle.png'});const before=(await read(page)).battle.mechanics;assert.equal(before.areas.length,3);await click(page,'pause');await page.evaluate(()=>advanceTime(3000));assert.deepEqual((await read(page)).battle.mechanics,before);await click(page,'save-home');await page.reload();await ready(page);await click(page,'resume');assert.deepEqual((await read(page)).battle.mechanics,before);await page.evaluate(()=>advanceTime(600));assert.equal((await read(page)).battle.mechanics.detonations,1);await page.screenshot({path:out+'/mine-triggered.png'});await ctx.close();
 }
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify({layouts:report.layouts.length,flows:report.flows.length,errors:report.errors}));
}catch(error){report.failure=error.stack;throw error;}finally{await writeFile(out+'/'+(suite==='pages'?'pages-browser-report':'preparation-browser-report')+'.json',JSON.stringify(report,null,2));await browser.close();}
