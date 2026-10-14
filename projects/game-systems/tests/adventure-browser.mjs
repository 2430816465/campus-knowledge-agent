import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4186',dir='artifacts/adventure';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[];
async function page(){const p=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))errors.push(r.status()+' '+r.url());});return p;}
const act=(p,a)=>p.locator(`[data-action="${a}"]`).last().click();
async function enter(p,id,code){await act(p,'mode:'+id);if(code){await act(p,'join-room');await p.locator('#room-input').fill(code);await act(p,'join-submit');}else await act(p,id==='coop'?'create-room':'preview');await p.waitForFunction(()=>document.querySelector('iframe')&&!document.querySelector('.game-loading'));return p.frames().find(f=>f.url().includes('/games/'));}
try{
 const p=await page();await p.goto(base);
 // Purchase and equip a new item through the actual shop.
 await act(p,'shop');await act(p,'product:camp-lights');await act(p,'buy:camp-lights');await act(p,'nav:collection');await act(p,'equip:camp-lights');await act(p,'nav:home');assert.equal(await p.locator('.camp-playfield>.camp-lights').count(),1);await p.screenshot({path:dir+'/camp.png'});
 const f=await enter(p,'mine');await f.waitForFunction(()=>window.MT?.MM?.Game.scene?.run);
 // Deterministic fixture at a stable checkpoint, exercising the production draft and save pipeline.
 await f.evaluate(()=>{const m=MT.MM.Game.scene;m.tutorial.open=false;m.run.tutorialRun=false;m.run.state='EXPLORING';m.run.maxDepthReached=5;m.run.stats.digActions=5;m.run.stamina=75;advanceTime(20);});
 await f.locator('.mine-draft button').first().waitFor();const offer=await f.evaluate(()=>MT.MM.Game.scene.run.campDraft.offer);assert.equal(new Set(offer).size,3);await p.screenshot({path:dir+'/mine-draft.png'});
 const prior=await f.evaluate(()=>({id:MT.MM.Game.scene.run.campRunId,rng:MT.MM.Game.scene.run.rngLoot.state,next:MT.MM.Game.scene.run.rngLoot.next()}));
 await f.goto(f.url());await f.waitForFunction(()=>window.MT?.MM?.Game.scene?.run);await f.evaluate(()=>advanceTime(20));assert.deepEqual(await f.evaluate(()=>MT.MM.Game.scene.run.campDraft.offer),offer);assert.equal(await f.evaluate(()=>MT.MM.Game.scene.run.campRunId),prior.id);assert.equal(await f.evaluate(()=>MT.MM.Game.scene.run.rngLoot.next()),prior.next);
 await f.locator('.mine-draft button').first().click();assert.equal(await f.locator('.mine-draft').count(),0);assert.equal(await f.evaluate(()=>MT.MM.Game.scene.run.campDraft.chosen.length),1);
 await f.evaluate(()=>{const m=MT.MM.Game.scene;m.run.maxDepthReached=15;advanceTime(20);});await f.locator('.mine-draft button').first().click();assert.equal(await f.evaluate(()=>MT.MM.Game.scene.run.campDraft.chosen.length),2);
 await f.evaluate(()=>MT.MM.Game.scene.settle('direct'));await p.waitForTimeout(500);const wallet=await p.evaluate(()=>JSON.parse(localStorage.getItem('adventure-camp-demo-v1')));assert.equal(wallet.runs.filter(r=>r.id===prior.id).length,1);assert.equal(wallet.runs.find(r=>r.id===prior.id).reward,8);
 await f.goto(f.url());await p.waitForTimeout(600);assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('adventure-camp-demo-v1')).coins),wallet.coins);await p.screenshot({path:dir+'/mine-result.png'});
 const m=await page();await m.setViewportSize({width:844,height:390});await m.goto(base+'/games/marble/index.html');await m.locator('[data-action=new]').click();await m.evaluate(()=>{Marble.run.powers={chain:1,split:1};Marble.makeOffer('boss');Marble.persist();});
 await m.reload();await m.locator('[data-action=continue]').click();await m.locator('[data-action=reroll]').waitFor();await m.screenshot({path:dir+'/marble-evolution.png'});await m.locator('[data-action=reroll]').click();assert.equal(await m.locator('[data-action=reroll]').count(),0);assert(await m.evaluate(()=>Marble.run.rerolled));
 const a=await page(),b=await page();await a.goto(base);await b.goto(base);const af=await enter(a,'coop');await af.locator('#inviteCode').waitFor();const code=(await af.locator('#inviteCode').innerText()).trim(),bf=await enter(b,'coop',code);
 await af.locator('#contractChoices button').first().click();await af.locator('#readyButton').click();await bf.locator('#readyButton').click();assert(await af.locator('#startButton').isDisabled());await bf.locator('#contractChoices button').first().click();await af.locator('#readyButton').click();await bf.locator('#readyButton').click();await a.screenshot({path:dir+'/coop-contract.png'});await af.locator('#startButton').click();await af.locator('#game:not(.hidden)').waitFor();assert((await af.locator('#stageHint').innerText()).includes('契约：'));await a.setViewportSize({width:844,height:390});await a.waitForTimeout(250);await a.screenshot({path:dir+'/coop-play.png'});
 assert.deepEqual(errors,[]);await writeFile(dir+'/checks.json',JSON.stringify({ok:true,checks:['shop purchase/equip visible','mine three unique cards','reload preserves draft/run/RNG','two rewards apply once','mine settlement deduplicates across reload','marble evolution UI and one reroll','two clients agree contract then start'],errors},null,2));console.log('Adventure browser checks passed');
}finally{await browser.close();}
