import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as E from '../games/workshop/active-state.js';
import {progressSnapshot} from '../economy-observer.js';
const base=process.env.BASE_URL||'http://127.0.0.1:4173',out='artifacts/workshop-topdown-v3/host';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),p=await browser.newPage({viewport:{width:844,height:390}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
const seed=E.fresh();seed.beacons=2;seed.orders=[];E.refillOrders(seed);seed.served=4;seed.trips=2;await p.addInitScript(s=>{if(!sessionStorage.getItem('host-fixture')){localStorage.setItem('starlight-workshop-v1',JSON.stringify(s));sessionStorage.setItem('host-fixture','1');}},seed);
await p.goto(base);assert.ok(await p.locator('[data-action="mode:workshop"]').isVisible());await p.click('[data-action="mode:workshop"]');await p.screenshot({path:out+'/prepare.png'});await p.click('[data-action=preview]');await p.waitForFunction(()=>document.querySelector('iframe')&&!document.querySelector('.game-loading'));
const game=p.frames().find(f=>f.url().includes('/games/workshop/')),snap=()=>game.evaluate(()=>JSON.parse(render_game_to_text()));await game.waitForFunction(()=>window.render_game_to_text);assert.equal((await snap()).rules,'active-batch-v3');
const balance=await p.evaluate(()=>JSON.parse(localStorage.getItem('adventure-camp-demo-v1')).coins);assert.equal(balance,180);await game.evaluate(()=>CampBridge.control('enter'));await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('adventure-camp-demo-v1')).coins),balance);
const parsed=await snap();const metrics=progressSnapshot('workshop',{render_game_to_text:()=>JSON.stringify(parsed)});assert.equal(metrics.metrics.served,4);assert.equal(metrics.metrics.trips,2);
await game.evaluate(()=>CampBridge.control('pause'));await game.click('#menu');await game.click('#close-panel');assert.equal((await snap()).paused,true);await game.evaluate(()=>advanceTime(10000));await game.evaluate(()=>CampBridge.control('resume'));assert.equal((await snap()).paused,false);
await game.evaluate(()=>CampBridge.control('enter',{cosmetics:['bakery-berry']}));assert.equal((await snap()).theme,'bakery-berry');await game.click('[data-room=bake]');await p.screenshot({path:out+'/berry-theme.png'});
// Shared provider lives in parent; cancellation must recover the child as well.
await game.click('#menu');await game.click('[data-ad]');await p.waitForFunction(()=>!!document.querySelector('dialog[aria-label="开发模拟广告"][open]'));await p.keyboard.press('Escape');await game.waitForFunction(()=>!JSON.parse(render_game_to_text()).paused);
await game.click('#menu');await game.click('[data-exit]');await p.waitForFunction(()=>!document.querySelector('iframe'));assert.ok(await p.locator('[data-action="mode:workshop"]').isVisible());
await fs.writeFile(out+'/report.json',JSON.stringify({balance,replayBalance:balance,metrics,themePreserved:true,embeddedAdCancel:true,exit:true,errors},null,2));assert.deepEqual(errors,[]);console.log('PASS real hub entry/prepare, receipt/replay, observer counters, host pause, owned theme, parent advert cancel and exit');await browser.close();
