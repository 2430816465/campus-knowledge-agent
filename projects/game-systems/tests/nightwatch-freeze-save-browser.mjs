import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {fresh} from '../games/nightwatch/profile.js';
import {Battle,createBattle} from '../games/nightwatch/battle.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4211',out=process.env.AUDIT_OUT||'C:/Users/24308/Documents/ChatGPT/游戏/nightwatch-v4';
const browser=await chromium.launch({headless:true}),results=[];
try{for(let phase=0;phase<12;phase++){
const p=fresh();p.settings={sound:false,guides:false,damageNumbers:false};p.active=createBattle(p);const s=p.active;s.waiting=1000;s.wave=1;s.partnerClock=s.wallClock=1000;s.abilities.ice={level:1,damage:0,cooldown:0};s.cooldowns={bolt:1000,fire:1000,ice:.1};s.upgrades['ice-freeze']=1;const engine=new Battle(s,p),e=engine.spawn('orc_warrior',240,400);e.hp=e.maxHp=1e9;e.walkDistance=phase;e.special=e.attackClock=1000;
const context=await browser.newContext(),page=await context.newPage();await page.addInitScript(p=>{if(!localStorage.getItem('camp-nightwatch-v1'))localStorage.setItem('camp-nightwatch-v1',JSON.stringify(p));},p);
await page.goto(base+'/games/nightwatch/index.html');await page.waitForFunction(()=>document.querySelector('#loading')?.hidden&&window.render_game_to_text);await page.evaluate(()=>advanceTime(0));await page.locator('[data-action="resume"]').click();
let before;for(let i=0;i<120;i++){await page.evaluate(()=>advanceTime(1000/60));before=await page.evaluate(()=>JSON.parse(render_game_to_text()).animation.enemies[0]);if(before.frozen)break;}
await page.locator('[data-action="pause"]').click();await page.locator('[data-action="save-home"]').click();await page.reload();await page.waitForFunction(()=>document.querySelector('#loading')?.hidden&&window.render_game_to_text);await page.evaluate(()=>advanceTime(0));await page.locator('[data-action="resume"]').click();await page.evaluate(()=>advanceTime(0));const after=await page.evaluate(()=>JSON.parse(render_game_to_text()).animation.enemies[0]);results.push({phase,before,after,equal:JSON.stringify(before)===JSON.stringify(after)});await context.close();
}assert.ok(results.every(r=>r.before.frozen));assert.ok(results.every(r=>r.equal),'Frozen pose must survive a real ice impact and reload without a one-frame jump');}finally{await browser.close();await fs.writeFile(out+'/live-freeze-save-final.json',JSON.stringify(results,null,2));console.log(JSON.stringify({cases:results.length,mismatches:results.filter(r=>!r.equal)},null,2));}
