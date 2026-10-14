import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const base=process.env.BASE_URL||'http://127.0.0.1:4232';
const out='C:/Users/24308/Desktop/总/当前最新修改-待整合/1.26.0-守夜与闯关修复/验收';
await mkdir(out,{recursive:true});
const browser=await chromium.launch(),report={panels:[],flows:[],errors:[]};
const sizes=[{width:320,height:568},{width:390,height:844},{width:412,height:915},{width:568,height:320},{width:844,height:390}];
const seed=()=>localStorage.setItem('zcyg_mechanism_guides_v1',JSON.stringify(['movement','dash','doubleJump','push','lift','patrol','spikes','checkpoint','pickup','sharedExit']));
async function page(c){const p=await c.newPage();p.on('pageerror',e=>report.errors.push(e.message));await p.addInitScript(seed);await p.goto(base+'/games/coop/index.html');await p.locator('#createRoom').waitFor();return p;}
async function reveal(p,sel){const b=p.locator(sel),nav=p.locator('#lobby .fit-pager select');for(let i=0;!(await b.isVisible())&&i<15;i++){await nav.selectOption(String(i));}await b.click();}
async function audit(p,id,sel){const result=await p.locator(sel).evaluate(e=>{const outer=e.getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth+1,bad:[...e.querySelectorAll('button,input,select')].filter(b=>b.getClientRects().length).map(b=>({id:b.id,r:b.getBoundingClientRect().toJSON()})).filter(b=>b.r.left<outer.left-1||b.r.right>outer.right+1||b.r.left<-.5||b.r.right>innerWidth+.5)};});report.panels.push({id,...result});await p.screenshot({path:out+'/'+id+'.png'});assert.deepEqual(result.bad,[],id);assert.equal(result.overflow,false,id);}
try{
 for(const size of sizes){
  const c=await browser.newContext({viewport:size,hasTouch:true,isMobile:true}),d=await browser.newContext({viewport:size,hasTouch:true,isMobile:true});const a=await page(c),b=await page(d);
  await audit(a,'coop-duo-home-'+size.width,'#home');await a.locator('#createRoom').click();await a.locator('#lobby:not(.hidden)').waitFor();await audit(a,'coop-lobby-'+size.width,'.lobby-panel');
  const code=await a.locator('#inviteCode').textContent();await b.locator('#roomCode').fill(code);await b.locator('#joinRoom').click();await b.locator('#lobby:not(.hidden)').waitFor();await reveal(a,'#readyButton');await reveal(b,'#readyButton');await a.locator('#startButton:enabled').waitFor();await reveal(a,'#startButton');await a.locator('body.in-game').waitFor({state:'attached'});await b.locator('body.in-game').waitFor({state:'attached'});
  await a.bringToFront();await a.locator('#cornerMenu').click();await audit(a,'coop-duo-menu-'+size.width,'#cornerPanel');const run=await a.evaluate(()=>CampCoop.snapshot().world.run);await a.locator('#resetButton').click();await a.waitForFunction(run=>CampCoop.snapshot().world.run>run,run);
  await b.close();await a.locator('#pauseBanner:not(.hidden)').waitFor();await audit(a,'coop-disconnect-'+size.width,'#pauseBanner');await a.locator('#cornerMenu').click();await a.locator('#leaveGame').click();await a.locator('#home:not(.hidden)').waitFor();report.flows.push(size.width+' duo create/join/ready/start/reset/disconnect/leave');await c.close();await d.close();
  const native=await browser.newContext({viewport:size,hasTouch:true,isMobile:true,userAgent:'QA AdventureCampAndroid/1.26.0'});await native.addInitScript(()=>{window.PhoneLan={url:'',address:'',hosting:false,stop(){},host(){throw Error('QA mock native transport');},join(){throw Error('QA mock native transport');}};});const n=await page(native);await n.locator('#createRoom').click();await n.locator('#phoneLanSetup').waitFor();await audit(n,'coop-phone-setup-'+size.width,'#phoneLanSetup form');if(size.width>size.height){const r=await n.locator('#phoneLanSetup [data-cancel]').boundingBox();assert(r.y+r.height<=size.height,'phone setup cancel visible');}await n.locator('#phoneLanSetup [data-host]').click();await n.locator('#phoneLanSetup [data-error]').filter({hasText:'QA mock'}).waitFor();await n.locator('#phoneLanSetup [data-cancel]').click();assert.equal(await n.locator('#phoneLanSetup').isVisible(),false);report.flows.push(size.width+' phone setup/mock error/cancel');await native.close();
 }
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report));
}finally{await writeFile(out+'/lan-ui-report.json',JSON.stringify(report,null,2));await browser.close();}
