import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4215',out=process.env.REPORT_DIR||'artifacts/ui-response-audit';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});const reports=[];
const act=async(f,a)=>{const b=f.locator(`[data-action="${a}"]`).first();await b.evaluate(e=>window.ScreenPages?.reveal(e));await b.click({timeout:4000});};
const read=f=>f.evaluate(()=>JSON.parse(render_game_to_text()));
async function tapMine(page,f,key){await f.evaluate(()=>advanceTime(0));const p=await f.evaluate(k=>{const h=MT.MM.Game.scene.hit[k],c=document.querySelector('#board').getBoundingClientRect();return h&&{x:c.x+(h.x+h.w/2)*c.width/720,y:c.y+(h.y+h.h/2)*c.height/MT.MM.UI.LAYOUT.H};},key);assert(p,key);const b=await page.locator('iframe').boundingBox();await page.touchscreen.tap(b.x+p.x,b.y+p.y);await page.waitForTimeout(80);}
try{for(const id of ['tower','marble','marble-puzzle','mine','coop','liars','evolve','workshop','chess','nightwatch','rush']){
 const mode=id==='marble-puzzle'?'marble':id,land=['marble','coop','liars','evolve','workshop','chess'].includes(mode),c=await browser.newContext({viewport:land?{width:844,height:390}:{width:390,height:844},hasTouch:true,isMobile:true,userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36 AdventureCampAndroid/1.16.0'});
 await c.addInitScript(()=>{window.CampOrientation={setLandscape(){}};window.CampHaptics={pulse(){}};window.CampLan={start(){return JSON.stringify({address:'192.168.3.24',url:'ws://192.168.3.24:38474/ws?v=1'});},stop(){},active(){return false;},poll(){return '[]';},send(){}};});
 const p=await c.newPage();p.setDefaultTimeout(5000);const errors=[],checks=[],issues=[];p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 try{
 await p.goto(base);await act(p,'mode:'+mode);if(mode==='coop'||id==='marble-puzzle')await act(p,'choice:1');await act(p,mode==='coop'?'create-room':'preview');await p.waitForFunction(()=>document.querySelector('iframe')&&!document.querySelector('.game-loading'));
 const f=p.frames().find(f=>f.url().includes('/games/'+mode+'/'));await f.waitForFunction(()=>typeof render_game_to_text==='function');
 if(id==='tower'){const skip=f.getByRole('button',{name:'跳过教程',exact:true});if(await skip.count())await skip.click();}
 if(id==='marble')await act(f,'new');
 if(id==='marble-puzzle'){await act(f,'level:0');for(let n=0;n<8;n++){const b=f.locator('[data-action="tutorialNext"], [data-action="tutorialSkip"], [data-action="tutorialDone"]');if(!await b.count())break;await b.first().click();}}
 if(id==='coop'){await f.locator('#startSolo').click();await f.locator('#guideSkip').click();}
 if(id==='evolve')await act(f,'new');
 if(id==='rush')await act(f,'start');
 if(id==='nightwatch'){await act(f,'start');for(let n=0;n<8;n++){const b=f.locator('[data-action="guide-done"]');if(!await b.count())break;await b.click();}}
 if(id==='mine'){await f.evaluate(()=>localStorage.setItem(MT.MM.Tutorial.KEY,'1'));await tapMine(p,f,'start');await tapMine(p,f,'mineStart');await f.evaluate(()=>advanceTime(1600));}
 if(id==='workshop'){const skip=f.locator('#guide-skip');if(await skip.count())await skip.first().click();}
 const initial=await read(f);
 const nativeBack=()=>p.evaluate(()=>CampNavigation.back());
 if(id==='workshop'){await f.locator('[data-open="settings"]').click();await f.locator('#help').evaluate(e=>window.ScreenPages?.reveal(e));await f.locator('#help').click();await nativeBack();assert.equal(await f.locator('dialog[open]').count(),0);await nativeBack();assert.equal((await read(f)).paused,false);checks.push('系统返回关闭内部帮助和管理页，解除暂停');}
 if(id==='coop'){await f.locator('#cornerMenu').click();await nativeBack();assert(await f.locator('#cornerPanel').evaluate(e=>e.hidden));await f.locator('#cornerMenu').click();await f.locator('#mechanismHelp').click();await nativeBack();assert(await f.locator('#guideLibrary').evaluate(e=>e.hidden));await nativeBack();await p.locator('[data-action="menu"]').evaluate(e=>e.click());await act(p,'menu-options');await act(p,'game-option:helpButton');await p.waitForTimeout(80);await nativeBack();assert(await f.locator('#gameHelp').evaluate(e=>e.classList.contains('hidden')));checks.push('系统返回关闭合作角落菜单及帮助');}
 if(id==='mine'){await tapMine(p,f,'settings');await nativeBack();assert(!await f.evaluate(()=>MT.MM.Game.scene.settingsOpen));checks.push('系统返回关闭Canvas设置');}
 if(id==='tower'){for(const key of ['btnInfo','btnManual','btnSettings']){await p.locator('[data-action="menu"]').evaluate(e=>e.click());await act(p,'menu-options');await act(p,'game-option:'+key);await p.waitForTimeout(80);await nativeBack();assert.equal(await f.locator('#modal.show').count(),0);assert(await f.locator('#manualOverlay').evaluate(e=>e.hidden));assert(await f.locator('#infoOverlay').evaluate(e=>e.hidden));}checks.push('系统返回关闭信息/手册/设置');}
 if(mode==='marble'){await act(f,'pause');await nativeBack();assert.equal(await f.locator('[data-action="resume"]').count(),0);await nativeBack();assert.equal(await p.locator('dialog').getAttribute('data-kind'),'menu');await nativeBack();assert.equal(await p.locator('dialog[open]').count(),0);await p.waitForTimeout(100);assert.equal(await f.evaluate(()=>document.hasFocus()),true);checks.push('系统返回：暂停→游戏→公共菜单→游戏');}

 const menu=async()=>{const b=p.locator('[data-action="menu"]');if(await b.isVisible())await b.click();else await b.evaluate(e=>e.click());};
 // Every collection menu path is tested through actual controls; marble has no camp toolbar.
 if(mode!=='marble')for(let n=0;n<3;n++){
 await menu();await act(p,'menu-settings');await act(p,'settings-tab:controls');await act(p,'settings-tab:display');await act(p,'close');assert.equal(await p.locator('dialog').getAttribute('data-kind'),'menu');
 await act(p,'menu-help');await act(p,'close');assert.equal(await p.locator('dialog').getAttribute('data-kind'),'menu');
 await act(p,'exit-game');await p.locator('dialog [data-action="close"]').last().click();await p.waitForTimeout(150);assert.equal(await p.locator('dialog[open]').count(),0);
 const s=await read(f);
 if(id==='rush'&&s.screen!=='playing')issues.push('公共菜单返回后仍为 '+s.screen);
 if(id==='evolve'&&s.screen!=='play')issues.push('公共菜单返回后仍为 '+s.screen);
 if(id==='nightwatch'&&s.battle.paused)issues.push('公共菜单返回后战斗仍暂停');
 if(['mine','tower','coop'].includes(id)&&await f.evaluate(()=>!!window.campPaused))issues.push('campPaused 没有恢复');
 checks.push('公共菜单：设置/说明/取消退出，第 '+(n+1)+' 轮');
 // Continue if a game independently paused on blur, so later checks still execute.
 if(id==='rush'&&s.screen==='paused')await act(f,'resume');if(id==='evolve'&&s.screen==='pause')await act(f,'resume');
 }
 if(id==='rush'||id==='evolve'){await act(f,'pause');await menu();await act(p,'close');await p.waitForTimeout(100);assert.equal((await read(f)).screen,id==='rush'?'paused':'pause');await act(f,'resume');checks.push('公共菜单返回保留玩家主动暂停');}
 if(id==='rush'){for(const a of ['pause','help','help-close','resume'])await act(f,a);assert.equal((await read(f)).screen,'playing');checks.push('内部暂停→说明→返回→继续');}
 if(id==='evolve'){await act(f,'pause');await act(f,'rules');await act(f,'back');assert.equal((await read(f)).screen,'play');checks.push('内部暂停→图鉴→返回');}
 if(id==='nightwatch'){for(const a of ['pause','settings','close','pause','help','close'])await act(f,a);assert.equal((await read(f)).view,'battle');assert.equal((await read(f)).battle.paused,false);checks.push('内部声音/存档、说明返回战斗');}
 if(id==='mine'){await tapMine(p,f,'settings');assert(await f.evaluate(()=>MT.MM.Game.scene.settingsOpen));await tapMine(p,f,'settingsClose');assert(!await f.evaluate(()=>MT.MM.Game.scene.settingsOpen));checks.push('Canvas设置开关返回');}
 if(id==='workshop'){for(const tab of ['production','recipe','orders','business','sky','settings']){await f.locator(`[data-open="${tab}"]`).first().click();await f.locator('#close-panel').click();assert.equal((await read(f)).panelOpen,false);}await f.locator('[data-open="settings"]').click();await f.locator('#help').evaluate(e=>window.ScreenPages?.reveal(e));await f.locator('#help').click();await f.locator('[data-dialog="close"]').click();await f.locator('#close-panel').click();assert.equal((await read(f)).paused,false);checks.push('六个管理页返回和帮助弹窗关闭');}
 if(id==='chess'){for(const a of ['rules','settings']){await f.locator(`[data-do="${a}"]`).click();await f.locator('dialog [data-do="close-dialog"]').click();assert.equal(await f.locator('dialog[open]').count(),0);}await f.locator('[data-do="practice"]').evaluate(e=>window.ScreenPages?.reveal(e));await f.locator('[data-do="practice"]').click();await f.waitForFunction(()=>JSON.parse(render_game_to_text()).screen==='table');await f.locator('[data-do="back"]').click();await f.locator('[data-do="close-dialog"]').first().click();assert.equal((await read(f)).screen,'table');await f.locator('[data-do="back"]').click();await f.locator('[data-do="leave"]').click();assert.equal((await read(f)).screen,'home');checks.push('规则/联机设置关闭、离桌取消/确认');}
 if(id==='liars'){await f.locator('[data-do="match"]').evaluate(e=>window.ScreenPages?.reveal(e));await f.locator('[data-do="match"]').click();await f.waitForFunction(()=>JSON.parse(render_game_to_text()).screen==='playing',null,{timeout:20000});if(await f.locator('#table-menu').isVisible())await f.locator('#table-menu').click();await f.locator('#help').evaluate(e=>window.ScreenPages?.reveal(e));await f.locator('#help').click();await f.locator('dialog [data-do="close"]').click();assert.equal(await f.locator('dialog[open]').count(),0);if(await f.locator('#table-menu').isVisible())await f.locator('#table-menu').click();await f.locator('#exit').click();await f.locator('dialog [data-do="close"]').click();checks.push('桌面菜单说明、返回取消');}
 if(mode==='marble'){await act(f,'pause');await act(f,id==='marble'?'resume':'close');const s=await read(f);if(s.paused)issues.push('弹珠暂停关闭后仍暂停');checks.push('弹珠内部暂停→继续');}
 // Check event loop and controls remain alive, including actual exit and a new game entry.
 assert.equal(await f.evaluate(()=>new Promise(r=>setTimeout(()=>r('alive'),20))),'alive');
 if(mode!=='marble'){await menu();await act(p,'exit-game');await act(p,'exit-confirm');}else{await act(f,'pause');await act(f,id==='marble'?'save':'exit');}
 await p.waitForFunction(()=>document.body.dataset.page==='home');await act(p,'settings');await p.locator('dialog [data-action="close"]').first().click();assert.equal(await p.locator('[data-action^="mode:"]').count(),10);checks.push('退出后大厅设置再次响应');
 await act(p,'settings');await nativeBack();assert.equal(await p.locator('dialog[open]').count(),0);checks.push('大厅设置系统返回');
 if(id==='tower'){for(const target of ['tasks','collection','profile','shop']){await act(p,target==='shop'?'shop':'nav:'+target);assert.equal(await nativeBack(),true);assert.equal(await p.locator('body').getAttribute('data-page'),'home');}for(const action of ['wallet','help-all']){if(action==='help-all')await act(p,'nav:profile');await act(p,action);await nativeBack();assert.equal(await p.locator('dialog[open]').count(),0);}await nativeBack();checks.push('大厅任务/藏品/个人/商店/钱包/总说明返回');}
 await fs.unlink(out+'/'+id+'-failure.png').catch(()=>{});await p.screenshot({path:out+'/'+id+'.png'});reports.push({id,checks,issues,errors,initial});
 }catch(e){reports.push({id,checks,issues:[...issues,e.message],errors});await p.screenshot({path:out+'/'+id+'-failure.png'}).catch(()=>{});}finally{await c.close();}
 }}finally{await browser.close();await fs.writeFile(out+'/results.json',JSON.stringify(reports,null,2));}
console.log(JSON.stringify(reports.map(({id,checks,issues,errors})=>({id,checks:checks.length,issues,errors})),null,2));if(reports.some(r=>r.issues.length||r.errors.length))process.exitCode=1;
