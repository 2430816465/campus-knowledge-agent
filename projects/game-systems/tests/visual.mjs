import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {initial} from '../services.js';
const require=createRequire(import.meta.url);
let chromium;try{({chromium}=require('playwright'))}catch{({chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/24308/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'))}
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
const page=await context.newPage(),errors=[],checks=[],shots=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url())});
const root='artifacts/polish',key='adventure-camp-demo-v1';
await mkdir(root,{recursive:true});
const act=a=>page.locator(`[data-action="${a}"]`).first().click();
const settle=async()=>{await page.waitForFunction(()=>[...document.images].every(i=>i.complete));await page.evaluate(()=>document.fonts.ready)};
const seed=async(s=initial(),dev=false)=>{await page.goto('http://127.0.0.1:4173/'+(dev?'?dev=1':''));await page.evaluate(({key,s})=>localStorage.setItem(key,JSON.stringify(s)),{key,s});await page.reload();await settle()};
const checkLayout=async label=>{
 const result=await page.evaluate(()=>{
  const h=document.querySelector('.topbar'),children=[...h.children].map(e=>e.getBoundingClientRect());
  const dialog=document.querySelector('dialog'),d=dialog.getBoundingClientRect();
  return {overflow:document.documentElement.scrollWidth>innerWidth,headerOverlap:children.some((r,i)=>i>0&&r.left<children[i-1].right-1),modalOverflow:dialog.open&&(dialog.scrollWidth>dialog.clientWidth+1||d.left<0||d.right>innerWidth||d.top<0||d.bottom>innerHeight)};
 });
 assert.equal(result.overflow,false,label+' document overflow');assert.equal(result.headerOverlap,false,label+' header overlap');assert.equal(result.modalOverflow,false,label+' modal overflow');
 const nav=page.locator('.nav');if(await nav.count()&&page.viewportSize().width<651){const scroll=await page.evaluate(()=>scrollY);await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));const clearance=await page.evaluate(()=>document.querySelector('.nav').getBoundingClientRect().top-document.querySelector('main').getBoundingClientRect().bottom);assert(clearance>=0,label+' navigation clearance');await page.evaluate(y=>scrollTo(0,y),scroll)}
 checks.push(label+': layout passed');
};
const shot=async(name,{full=true}={})=>{await settle();if(full)await page.evaluate(()=>scrollTo(0,0));await checkLayout(name);await page.screenshot({path:`${root}/${name}.png`,fullPage:full});shots.push({name,file:name+'.png',size:page.viewportSize()})};
const rich=()=>{const s=initial();s.coins=340;s.runs=['tower','guard','mine','coop'].map((mode,i)=>({id:'visual-'+i,mode,win:true,reward:30}));s.last='mine';s.ledger=[{id:'base-visual',amount:30,label:'预览基础奖励'}];s.owned=['scarf'];s.equipped=['scarf'];return s};
async function readyRoom(){await act('create-room');await page.locator('.developer summary').click();await page.locator('#room-state').selectOption('ready');await act('ready')}
try{
 for(const [width,height] of [[390,844],[360,800],[844,390],[1440,1080]]){
  await page.setViewportSize({width,height});await seed();
  assert.equal(await page.locator('.developer').count(),0,'public page hides developer panel');
  await shot(`public-home-${width}`);
  if(width<600){const bottom=await page.locator('.mode-grid').evaluate(e=>e.getBoundingClientRect().bottom);const top=await page.locator('.nav').evaluate(e=>e.getBoundingClientRect().top);assert(bottom<top,'four entries visible above fixed nav')}
  await act('nav:tasks');await shot(`tasks-${width}`);await act('tab:achievements');await shot(`achievements-${width}`);
  await act('nav:collection');await shot(`outfits-${width}`);await act('tab:codex');await shot(`codex-${width}`);await act('codex:tower');await shot(`codex-detail-${width}`,{full:false});await act('close');
  await act('nav:profile');await shot(`profile-${width}`);await act('records:mine');await shot(`empty-record-${width}`,{full:false});await act('close');await act('help-all');await shot(`help-list-${width}`,{full:false});await act('help-mode:mine');await shot(`help-detail-${width}`,{full:false});await act('close');
  await act('nav:home');await act('shop');await shot(`shop-${width}`);await act('product:pick');await shot(`product-${width}`,{full:false});await act('buy:pick');await shot(`insufficient-${width}`,{full:false});await act('close');
  await act('wallet');await shot(`wallet-empty-${width}`,{full:false});await act('close');
  await act('nav:home');
  for(const id of ['tower','guard','mine','coop']){
   await act('mode:'+id);await shot(`prepare-${id}-${width}`);
   if(width<600){const r=await page.locator(`[data-action="${id==='coop'?'create-room':'preview'}"]`).boundingBox();assert(r.y+r.height<height,`${id} primary CTA visible ${width}`)}
   if(id==='coop'){
    await act('join-room');await page.locator('#room-input').fill('000000');await page.keyboard.press('Enter');await shot(`join-error-${width}`,{full:false});await act('close');
    await act('create-room');await shot(`room-waiting-${width}`);
    await act('demo-peer');await act('ready');await shot(`room-ready-${width}`);await act('preview');await shot(`preview-coop-${width}`);await act('menu');await shot(`menu-coop-${width}`,{full:false});await act('close');await act('finish:win');await shot(`result-coop-${width}`);
    await act('nav:home');continue;
   }
   await act('preview');await shot(`preview-${id}-${width}`);await act('menu');await shot(`menu-${id}-${width}`,{full:false});
   await act('menu-help');await act('close');assert.equal(await page.locator('#dialog-title').textContent(),'冒险菜单','help returns to menu');await act('close');assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'menu','menu focus restored');
   await act('finish:'+(id==='guard'?'lose':'win'));await shot(`result-${id}-${width}`);await act('nav:home');
  }
  checks.push(`${width}×${height}: public navigation, all preparation pages, dialogs, focus return, primary actions verified`);
 }
 await page.setViewportSize({width:390,height:844});await seed(rich(),true);
 await act('nav:tasks');await shot('task-claimable');await act('claim:first');await page.waitForTimeout(3300);await shot('task-claimed');await act('tab:achievements');await shot('achievement-claimable');
 await act('nav:collection');await act('tab:daily');await shot('outfit-equipped');await act('product:scarf');await shot('product-owned',{full:false});await act('close');
 await act('nav:profile');await act('records:mine');await shot('records-populated',{full:false});await act('close');await act('wallet');await shot('ledger-populated',{full:false});await act('close');
 await act('nav:home');await act('shop');await act('product:flag');await shot('exchange-confirm',{full:false});await act('buy:flag');await shot('exchange-success',{full:false});await act('close');
 assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'product:flag','replacement dialog restores launch control');
 await act('nav:home');await act('mode:coop');await act('create-room');await page.locator('.developer summary').click();
 for(const state of ['joined','disconnected','failed','waiting','ready']){await page.locator('#room-state').selectOption(state);await shot('room-'+state+'-detail')}
 await page.locator('#room-state').selectOption('failed');await act('reconnect-room');assert.equal(await page.locator('.connection-state>span').textContent(),'同行者已到达，等待准备房间状态来自本地模拟，不会连接真实好友。');await act('demo-peer');await act('ready');await act('preview');await shot('preview-coop-dev-390');await page.setViewportSize({width:844,height:390});await shot('preview-coop-dev-844');
 const stage=await page.locator('.preview-bottom').boundingBox();assert(stage.y+stage.height<=390,'landscape game controls fit screen');
 await page.setViewportSize({width:390,height:844});await act('finish:win');await shot('result-coop-dev-390');await act('ad');await page.screenshot({path:`${root}/advert-loading.png`});shots.push({name:'advert-loading',file:'advert-loading.png',size:page.viewportSize()});assert(await page.locator('[data-action="close"]').isDisabled());await page.waitForFunction(()=>!document.querySelector('#modal').open);await page.waitForTimeout(3300);await shot('advert-reward-received');
 await act('reset');await shot('reset-confirm',{full:false});await act('close');
 // Long real state and content stress checks, kept out of production data.
 const stress=rich();stress.name='走过月影高塔与微光矿井的长名字旅人';stress.coins=9876543210;
 for(const width of [360,390,844,1440]){await page.setViewportSize({width,height:width===844?390:width===1440?1080:844});await seed(stress);await shot('long-name-balance-'+width);await act('nav:profile');await checkLayout('long profile '+width);await act('wallet');await shot('long-wallet-'+width,{full:false});await act('close')}
 await page.setViewportSize({width:360,height:800});await seed();await act('nav:home');await act('shop');
 await page.evaluate(async()=>{const {products}=await import('/services.js');products[0].name='从月影高塔带回的旅人限定余烬保暖围巾';products[0].effect='这是一段用于验证多行商品说明的内容。'.repeat(8)});await act('nav:home');await act('shop');await shot('long-product-name');await act('product:scarf');await shot('long-product-detail',{full:false});await act('close');
 await act('nav:home');await act('nav:tasks');await page.locator('.quest-detail p').evaluate(e=>e.textContent='这是一段用于检验多行任务描述的文本，按钮和奖励应保持正常换行。'.repeat(8));await shot('long-task-description');
 // Browser keyboard focus, switch, scroll restoration, reduced motion.
 await seed(rich());await act('nav:profile');await page.locator('[data-setting="sound"]').focus();await page.keyboard.press('Space');assert.equal(await page.locator('[data-setting="sound"]').isChecked(),false);await act('records:mine');const scroll=await page.evaluate(()=>scrollY);await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'records:mine');assert.equal(await page.evaluate(()=>scrollY),scroll);
 assert.equal(await page.locator('.button').first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
 checks.push('Long names/10-digit balances/multiline task and product text: no overflow; keyboard switch, Escape, focus and scroll restore passed');
 // Simulate a failed decorative asset. Content remains operable, retry restores it.
 await page.route('**/assets/environment.webp',r=>r.abort());await page.reload();await page.locator('.asset-warning').waitFor();await act('mode:mine');await shot('asset-error-recoverable');await page.unroute('**/assets/environment.webp');await act('reload-art');await settle();assert.equal(await page.locator('.asset-warning').count(),0);checks.push('Decorative asset failure preserves navigation; retry restores image');
 assert.deepEqual(errors,[]);checks.push('No uncaught browser exceptions or HTTP failures (intentional network abort tested separately)');
 await writeFile(root+'/visual-verification.json',JSON.stringify({time:new Date().toISOString(),checks,shots,errors},null,2));
 const labels={'public-home':'冒险大厅','tasks':'营地任务','achievements':'旅人成就','outfits':'外观藏品','codex':'探索图鉴','profile':'我的与设置','shop':'补给铺','prepare':'准备页','preview':'玩法承载','result':'结算'};
 await writeFile(root+'/index.html',`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>冒险营地 · 实际运行截图</title><style>body{margin:0;background:#101e2e;color:#eee6d7;font:15px system-ui;padding:30px}h1{font-size:28px}p{color:#bfccd6;line-height:1.8}a{color:#e3c797}nav{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0}button{padding:10px 16px;background:#253a4c;border:1px solid #9b926c;color:#e5d3ae;cursor:pointer;border-radius:4px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:22px}figure{margin:0;padding:12px;background:#1b2d3d;border:1px solid #596776;border-radius:5px}img{display:block;width:100%;height:380px;object-fit:contain;object-position:top;background:#0b1726}figcaption{font-size:13px;padding-top:12px;overflow-wrap:anywhere}small{display:block;color:#aabcca;margin-top:5px}[hidden]{display:none!important}</style><h1>冒险营地 · 全页运行截图</h1><p>全部图片来自本地 Chromium 实际访问与点击。点击缩略图查看原始截图。部分页面采用完整滚动截图；弹窗采用视口截图。长文本与资源失败项为明确的测试注入。</p><p><a href="/">进入可交互项目</a> · <a href="visual-verification.json">逐项验证结果</a> · <a href="flows.json">业务流程结果</a></p><nav>${['全部','390','360','844','1440','状态'].map(x=>`<button onclick="document.querySelectorAll('figure').forEach(f=>f.hidden='${x}'!=='全部'&&f.dataset.group!=='${x}')">${x==='状态'?'交互与边界状态':x==='全部'?x:x+' px'}</button>`).join('')}</nav><main>${shots.map(s=>`<figure data-group="${/-\d+$/.test(s.name)?s.size.width:'状态'}"><a href="${s.file}" target="_blank"><img loading="lazy" src="${s.file}" alt="${s.name}"></a><figcaption>${s.name}<small>${s.size.width} × ${s.size.height} 浏览器视口</small></figcaption></figure>`).join('')}</main></html>`);
 console.log(`Visual QA: ${checks.length} checks, ${shots.length} actual screenshots, ${errors.length} errors`);
}finally{await browser.close()}


