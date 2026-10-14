import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {createChoiceBattle} from '../games/rush/choice.js';
import {fresh} from '../games/rush/profile.js';
import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const browser=await chromium.launch(),errors=[],report=[],base=process.env.UI_URL||'http://127.0.0.1:4230/';
try{
for(const choice of [0,1]){
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base);await p.locator('[data-action="mode:rush"]').tap();assert.ok((await p.locator('body').innerText()).includes('再选一次'));
 await p.locator(`[data-action="choice:${choice}"]`).tap();await p.locator('[data-action="preview"]').tap();
 await p.waitForFunction(()=>document.querySelector('iframe.game-frame')&&!document.querySelector('.game-loading'));
 const f=p.frames().find(f=>f.url().includes('/games/rush/'));assert.equal(new URL(f.url()).searchParams.get('mode'),choice?'defense':null);
 await f.locator('[data-action="start"]').tap();await f.evaluate(()=>advanceTime(1500));assert.equal((await f.evaluate(()=>JSON.parse(render_game_to_text()))).battle.mode,choice?'defense':'campaign');
 await f.locator('[data-action="pause"]').tap();await f.locator('[data-action="save-home"]').tap();await f.locator('[data-action="switch-mode"]').tap();
 await f.waitForFunction(()=>typeof render_game_to_text==='function'&&JSON.parse(render_game_to_text()).assetsLoaded===15);assert.equal(new URL(f.url()).searchParams.get('mode'),choice?null:'defense');
 report.push({choice,entry:true,modeSwitch:true});await p.close();
}
for(const mode of ['campaign','defense']){
 const p=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});p.on('pageerror',e=>errors.push(e.message));
 const q=fresh();q.active=createChoiceBattle(1,{},'receipt-'+mode,mode);q.active.status='won';q.active.wave=mode==='defense'?30:1;q.active.kills=120;q.active.time=100;
 await p.addInitScript(({q,mode})=>{if(location.pathname.includes('/games/rush/'))localStorage.setItem('camp-rush-v1'+(mode==='defense'?'-defense':''),JSON.stringify(q));},{q,mode});
 await p.goto(base);await p.locator('[data-action="mode:rush"]').click();await p.locator(`[data-action="choice:${mode==='defense'?1:0}"]`).click();await p.locator('[data-action="preview"]').click();
 await p.waitForFunction(()=>document.querySelector('iframe.game-frame')&&!document.querySelector('.game-loading'));
 const f=p.frames().find(f=>f.url().includes('/games/rush/'));await f.waitForFunction(()=>JSON.parse(render_game_to_text()).result?.acked);
 const wallet=await p.evaluate(()=>JSON.parse(localStorage.getItem('adventure-camp-demo-v1')));assert.equal(wallet.coins,mode==='defense'?160:168);assert.equal(wallet.economy.milestones.includes('rush-stage-1'),mode==='campaign');
 await f.locator('[data-action="next"]').click();assert.equal((await f.evaluate(()=>JSON.parse(render_game_to_text()))).battle.mode,mode);report.push({mode,receipt:true,coins:wallet.coins,restart:true});await p.close();
}
assert.deepEqual(errors,[]);
}finally{await fs.writeFile(new URL('../artifacts/rush-choice-1.23.0/integration.json',import.meta.url),JSON.stringify({report,errors},null,2));await browser.close();}
console.log('PASS camp entries, embedded mode switching, result receipts, isolated rewards and restart');
