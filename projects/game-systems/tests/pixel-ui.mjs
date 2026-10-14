import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {initial,modes} from '../services.js';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/24308/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const browser=await chromium.launch({headless:true}),root='artifacts/pixel',shots=[],errors=[];
await mkdir(root,{recursive:true});
try {
 for(const [width,height] of [[390,844],[360,800],[844,390],[1440,900]]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',hasTouch:width<1000});
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url())});
  const act=a=>p.locator(`[data-action="${a}"]`).first().click();
  const shot=async name=>{
   await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(65);
   const bounds=await p.evaluate(()=>{const d=document.querySelector('dialog'),r=d.getBoundingClientRect();const header=[...document.querySelector('.topbar').children].map(e=>e.getBoundingClientRect());return {overflow:document.documentElement.scrollWidth>innerWidth,headerOverlap:header.some((r,i)=>i&&r.left<header[i-1].right-1),modal:d.open&&(r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1||d.scrollWidth>d.clientWidth+1)};});
   assert(!bounds.overflow&&!bounds.headerOverlap&&!bounds.modal,`${name} ${width}: ${JSON.stringify(bounds)}`);
   const file=`${name}-${width}.png`;await p.screenshot({path:`${root}/${file}`,fullPage:!await p.locator('dialog').evaluate(e=>e.open)});shots.push({name,width,height,file});
  };
  await p.goto('http://127.0.0.1:4173/');await shot('home');
  assert(await p.evaluate(()=>[...document.fonts].some(f=>f.family==='CampDisplay'&&f.status==='loaded')),'local display font loaded');
  assert(await p.locator('.portal-plaque strong').first().evaluate(e=>getComputedStyle(e).fontFamily.includes('CampDisplay')),'game titles use display typography');
  // New scene facilities must remain real, unobstructed controls on touch screens.
  for(const action of ['help-all','nav:tasks','shop','nav:collection']){
   const entry=p.locator(`.home-layout [data-action="${action}"]`);
   await entry.scrollIntoViewIfNeeded();
   assert(await entry.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),'scenery must not cover '+action);
   await entry.click();
   if(action==='help-all'){assert(await p.locator('dialog').evaluate(d=>d.open));await act('close');assert(await entry.evaluate(e=>e===document.activeElement),'handbook restores focus');}
   else {assert.equal(await p.locator('body').getAttribute('data-page'),action==='shop'?'shop':action.split(':')[1]);await act('nav:home');}
  }
  await p.evaluate(()=>scrollTo(0,0));
  if(width<651){const b=await p.locator('.mode-grid').boundingBox(),n=await p.locator('.nav').boundingBox();assert(b.y+b.height<n.y,'four entrances above mobile navigation');}
  for(const id of modes.map(m=>m.id)){await act('mode:'+id);await shot('prepare-'+id);if(width<651){const b=await p.locator(`[data-action="${id==='coop'?'create-room':'preview'}"]`).boundingBox();assert(b.y+b.height<height,`${id}: primary action visible`)}await act('help');await shot('help-'+id);await act('close');if(id==='coop'){await act('join-room');await p.locator('#room-input').fill('12');await act('join-submit');await p.getByText('请输入六位数字房间码',{exact:true}).waitFor();await shot('join-validation');await act('close');}await act('nav:home');}
  await act('nav:tasks');await shot('tasks-progress');await act('tab:achievements');await shot('achievements');
  await act('nav:collection');await shot('collection-locked');await act('tab:codex');await shot('codex');await act('codex:tower');await shot('codex-detail');await act('close');
  await act('nav:profile');await shot('profile');await act('records:mine');await shot('records-empty');await act('close');await act('help-all');await shot('help-list');await act('close');
  await act('nav:home');await act('shop');await shot('shop');await act('product:pick');await shot('product');await act('buy:pick');await shot('insufficient');await act('close');await act('wallet');await shot('wallet-empty');await act('close');
  const s=initial();s.name='远山归来的冒险家与同行旅伴';s.coins=123456789;s.runs=[{id:'pixel-test',mode:'tower',win:true,reward:30}];
  await p.evaluate(s=>localStorage.setItem('adventure-camp-demo-v1',JSON.stringify(s)),s);await p.reload();await shot('long-name-balance');await act('nav:tasks');await shot('tasks-claimable');await act('claim:first');await shot('tasks-claimed');await act('nav:home');await act('shop');await act('product:scarf');await act('buy:scarf');await shot('purchase-success');await act('nav:collection');await act('equip:scarf');await shot('collection-equipped');
  await context.close();console.log(`PASS pixel pages and modal bounds: ${width} x ${height}`);
 }
 assert.deepEqual(errors,[]);await writeFile(`${root}/results.json`,JSON.stringify({shots,errors},null,2));
 await writeFile(`${root}/index.html`,`<!doctype html><meta charset="utf-8"><title>暖色像素 UI · 实际运行截图</title><style>body{background:#f2e7cf;color:#493826;font:16px sans-serif;padding:24px}section{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:24px}img{width:100%;border:2px solid #c4a77c}figure{margin:0}figcaption{padding:12px}</style><h1>暖色像素 UI · 实际运行截图</h1><p>全部来自本地运行页面；余额和任务状态使用隔离测试数据。</p><section>${shots.map(s=>`<figure><a href="${s.file}"><img loading="lazy" src="${s.file}" alt="${s.name}"></a><figcaption>${s.name} · ${s.width} × ${s.height}</figcaption></figure>`).join('')}</section>`);
 console.log(`PASS ${shots.length} screenshots; zero browser/network errors`);
}finally{await browser.close()}
