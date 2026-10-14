import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {fresh} from '../games/nightwatch/profile.js';
import {createBattle,availableCards} from '../games/nightwatch/battle.js';
const base=process.env.BASE_URL||'http://127.0.0.1:4232',out='C:/Users/24308/Desktop/总/当前最新修改-待整合/1.26.0-守夜技能与备战优化/验收';
const browser=await chromium.launch({headless:true}),report={checks:[],errors:[]};
const read=page=>page.evaluate(()=>JSON.parse(render_game_to_text()));
async function open(size,p){const ctx=await browser.newContext({viewport:size,hasTouch:true,isMobile:true}),page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.addInitScript(p=>localStorage.setItem('camp-nightwatch-v1',JSON.stringify(p)),p);await page.goto(base+'/games/nightwatch/index.html');await page.waitForFunction(()=>document.querySelector('#loading').hidden&&window.render_game_to_text);await page.evaluate(()=>advanceTime(0));return {ctx,page};}
async function tap(page,action){const e=page.locator(`[data-action="${action}"]`).first();await e.evaluate(e=>window.ScreenPages?.reveal(e));await page.waitForTimeout(60);await e.tap();await page.waitForTimeout(60);}
try{
 for(const size of [{width:390,height:844},{width:568,height:320}]){
  const p=fresh();p.frontier=30;p.runs=1;p.coins=p.seals=p.pages=p.ore=10000;p.settings.guides=p.settings.sound=false;
  const {ctx,page}=await open(size,p);await tap(page,'prepare:campaign');await tap(page,'research-tab:works');await tap(page,'improve:weapon:-');assert.equal((await read(page)).profile.weapon,2);
  await tap(page,'research-tab:summary');await tap(page,'allies');await page.locator('[data-picker=ally]').selectOption('witch');await tap(page,'acquire:partner:witch');assert.equal((await read(page)).profile.partner,'witch');await tap(page,'guide:partner-witch');await tap(page,'guide-done');await tap(page,'close');assert.equal((await read(page)).view,'prepare');await tap(page,'start-prepared');
  const cdp=await ctx.newCDPSession(page),point={x:Math.round(size.width*.48),y:Math.round(size.height*.42)};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});await page.waitForTimeout(60);await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x+20,y:point.y+12,id:1}]});await page.waitForTimeout(60);assert((await read(page)).battle.aim);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal((await read(page)).battle.aim,null);
  await page.waitForTimeout(100);await tap(page,'pause');assert.equal((await read(page)).battle.paused,true);await tap(page,'close');assert.equal((await read(page)).battle.paused,false);await tap(page,'summon');assert.equal((await read(page)).battle.summonActive,8);report.checks.push({size,preparationUpgradeAllyGuideAimPauseSummon:true});await ctx.close();
  const choice=fresh();choice.frontier=30;choice.settings.guides=choice.settings.sound=false;const s=choice.active=createBattle(choice);s.status='choice';s.points=1;s.choices=['learn-gravity','learn-ward','learn-trap'].map(id=>availableCards(s,choice).find(c=>c.id===id));const next=await open(size,choice);await tap(next.page,'resume');await tap(next.page,'card:learn-trap');assert((await read(next.page)).battle.skills.trap);assert.equal((await read(next.page)).battle.status,'playing');await next.ctx.close();report.checks.push({size,tacticalChoiceByTouch:true});
 }
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report));
}catch(e){report.failure=e.stack;throw e;}finally{await writeFile(out+'/touch-browser-report.json',JSON.stringify(report,null,2));await browser.close();}
