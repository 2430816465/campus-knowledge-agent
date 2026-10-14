import fs from 'node:fs';
const edit=(file,fn)=>fs.writeFileSync(file,fn(fs.readFileSync(file,'utf8')));
edit('services.js',s=>{
 s="import {migrateWallet,calendar,milestoneKey,milestoneReward,recordActivity,recurringTasks,advertising} from './economy.js';\n"+s;
 const start=s.indexOf('export function createServices(storage)'),end=s.indexOf('export function createRoomService()',start);
 return s.slice(0,start)+`export function createServices(storage){
 let state=migrateWallet(storage.load(),initial);const now=()=>storage.now?.()??Date.now();
 const commit=fn=>{const next=structuredClone(state),result=fn(next);storage.save(next);state=next;return result;};
 const credit=(s,id,amount,label,meta={})=>{if(!Number.isSafeInteger(amount)||amount<0)throw Error('奖励金额无效');if(!amount||s.ledger.some(x=>x.id===id))return false;s.coins+=amount;s.ledger.unshift({id,amount,label,...meta});return true;};
 const modeOK=mode=>{if(!modes.some(x=>x.id===mode))throw Error('未知玩法，不能结算');};
 const idOK=id=>{if(typeof id!=='string'||!id||id.length>180||['__proto__','constructor','prototype'].includes(id))throw Error('结算标识无效');};
 return {
 get:()=>({...structuredClone(state),tasks:recurringTasks(state,now())}),reset:()=>commit(s=>Object.assign(s,migrateWallet(null,initial))),
 settings:(key,value)=>commit(s=>s.settings[key]=value),
 progress:data=>commit(s=>{modeOK(data.mode);idOK(data.id);if(!Number.isFinite(data.seconds)||!Number.isFinite(data.units)||data.seconds<0||data.units<0||data.seconds>86400||data.units>100000)throw Error('进度数据无效');return recordActivity(s,data,now(),credit);}),
 finish:(id,mode,win=true,score=0,details={})=>commit(s=>{
  modeOK(mode);idOK(id);details??={};
  const existing=s.runs.find(r=>r.id===id);if(existing){if(existing.mode!==mode)throw Error('结算玩法不匹配');if(!existing.win&&win){existing.win=true;existing.score=score;const key=milestoneKey(mode,true,score,details,id),value=milestoneReward(mode,key);if(key&&!s.economy.milestones.includes(key)){s.economy.milestones.push(key);const extra=existing.legacy&&mode==='tower'?Math.max(0,30-existing.reward):value;credit(s,'upgrade-'+id,extra,'首次目标奖励');existing.reward+=extra;existing.baseReward=0;}}return existing;}
  const key=milestoneKey(mode,win,score,details,id);let amount=0;
  if(key&&!s.economy.milestones.includes(key)){s.economy.milestones.push(key);amount=milestoneReward(mode,key);}
  const run={id,mode,win:!!win,score:Number.isFinite(score)?score:0,reward:amount,baseReward:0,day:calendar(now()).day,details:{stage:details.stage,beacon:details.beacon,campaign:details.campaign}};
  s.runs.push(run);s.last=mode;credit(s,'base-'+id,amount,'首次目标 · '+mode);return run;
 }),
 adInfo:id=>advertising(state,id,now()),
 adReward:id=>commit(s=>{const info=advertising(s,id,now());if(info.claimed)return false;if(!info.amount)throw Error('本次基础收益不足，或玩法不提供广告加币');if(!info.remaining)throw Error('今日三次广告加币已领完');const {day}=calendar(now());return credit(s,'ad-'+id,info.amount,'自愿广告奖励',{kind:'ad',day});}),
 claim:id=>commit(s=>{
  if(s.claimed.includes(id))return false;
  const q=recurringTasks(s,now()).find(x=>x.id===id);let amount;
  if(q){if(q.count<q.target)throw Error('任务尚未完成');amount=q.reward;}
  else{if(!['first','all'].includes(id))throw Error('任务不存在或已过期');const p=taskProgress(s,id);if(p.count<p.target)throw Error('任务尚未完成');amount=p.reward;}
  s.claimed.push(id);return credit(s,'task-'+id,amount,'营地任务奖励');
 }),
 buy:id=>commit(s=>{const p=products.find(x=>x.id===id);if(!p)throw Error('商品不存在');if(s.owned.includes(id))return 'owned';if(s.coins<p.price)return 'poor';s.coins-=p.price;s.owned.push(id);s.ledger.unshift({id:'buy-'+id,amount:-p.price,label:p.name});return 'bought';}),
 equip:id=>commit(s=>{if(!s.owned.includes(id))throw Error('尚未拥有该外观');s.equipped=s.equipped.includes(id)?s.equipped.filter(x=>x!==id):[...s.equipped.filter(x=>!((id.endsWith('-orb')&&x.endsWith('-orb'))||((id.startsWith('avatar-')||id==='scarf')&&(x.startsWith('avatar-')||x==='scarf')))),id];})
 };
}
`+s.slice(end);
});
for(const file of ['live-games.js','evolve-host.js'])edit(file,s=>{
 s="import {EconomyObserver} from './economy-observer.js';\n"+s;
 s=s.replace('let frame,listener,timer;','let frame,listener,timer,economy;');
 s=s.replace("frame.focus();}","frame.focus();economy?.stop();economy=new EconomyObserver("+(file==='live-games.js'?'id':"'evolve'")+",frame,options);economy.start();}");
 s=s.replace('options.onFinish?.(e.data.result)','options.onFinish?.(economy?.finish(e.data.result)||e.data.result)').replace('options.onFinish?.(d.result)','options.onFinish?.(economy?.finish(d.result)||d.result)');
 s=s.replace("pause(){send('pause')}","pause(){economy?.setPaused(true);send('pause')}").replace("resume(){send('resume')}","resume(){send('resume');economy?.setPaused(false)}");
 s=s.replace('destroy(){','destroy(){economy?.stop();economy=null;');
 return s;
});
edit('app.js',s=>s.replace('onFinish:r=>{','onProgress:data=>api.progress(data),onEconomyError:error=>toast(\'冒险收益未保存：\'+error.message),\n onFinish:r=>{').replace('api.adReward(id,amount);','api.adReward(id);').replace("api.adReward(run.id);toast('额外 20 冒险币已到账')","const bonus=api.adInfo(run.id).amount;api.adReward(run.id);toast('额外 '+bonus+' 冒险币已到账')").replace('每关首通奖励8冒险币','有效游玩分段获得冒险币，首通另有奖励').replace('分数只在本桌记账，不兑换冒险币。','桌内分数独立记录，有效参与可获得冒险币。').replace('吃同级直接进化；低级生物结伴并占据走位空间','主角加两只同级进化；低级随行三合一并占据走位空间').replace('主角或队员碰到强敌就失败','队员被更强生物吞噬；主角碰到强敌失败').replace('最后的幸存者获得30冒险币','冒险币按有效参与结算').replace('初始演示余额 160 冒险币','初始赠送 160 冒险币').replace('本桌分数不兑换冒险币。','本桌分数独立记录，有效参与收益保留。'));
edit('views.js',s=>{
 s=s.replace(" const achievement=tab==='achievements'"," const achievement=tab==='achievements'");
 const pos=s.indexOf('function tasks('),end=s.indexOf('function collection(',pos);
 s=s.slice(0,pos)+`function tasks({s,tab}){
 const achievement=tab==='achievements',quests=achievement?[{id:'all',name:'世界的四个方向',description:'探索四种玩法；或体验三种单人玩法并累计六次有效冒险。',...taskProgress(s,'all'),claimed:s.claimed.includes('all')}]:[{id:'first',name:'初次启程',description:'获得第一笔有效冒险收益。',...taskProgress(s,'first'),claimed:s.claimed.includes('first')},...(s.tasks||[])];
 return banner('quests','营地委托','每次启程，都有回响','选择喜欢的玩法，不需要连续登录。')+'<div class="tabs">'+btn('营地任务','tab:daily',achievement?'':'selected')+btn('旅人成就','tab:achievements',achievement?'selected':'')+'</div>'+quests.map(q=>'<section class="panel quest-detail"><div class="quest-seal">'+icon(q.claimed?'check':'flag')+'</div><div><h2>'+q.name+'</h2><p>'+q.description+'</p><progress value="'+Math.min(q.count,q.target)+'" max="'+q.target+'"></progress><div class="quest-reward"><span>'+Math.min(q.count,q.target)+' / '+q.target+'</span>'+money(q.reward)+'</div></div>'+btn(q.claimed?'已领取':q.count>=q.target?'领取奖励':'前往冒险',q.claimed?'none':q.count>=q.target?'claim:'+q.id:'nav:home',q.claimed?'secondary':'primary',q.claimed?'disabled':'')+'</section>').join('')+'<p class="journal-note">每日与每周委托按北京时间更新，奖励直接领取，无需广告。</p>';
}
`+s.slice(end);
 s=s.replace('每关首通奖励8冒险币，重复通关不重复发币。','有效游玩分段获得冒险币，首通另有奖励，重玩也能积累基础收益。').replace('牌桌积分只在本桌记账。','桌内积分独立记录，有效参与可获得冒险币。').replace('最后的幸存者获得 30 冒险币','冒险币按有效参与发放').replace('重复挑战不重复领取','首通奖励不重复领取，重玩仍可积累基础收益');
 return s;
});
// Task IDs contain dates; keep everything after the first colon as the action ID.
edit('app.js',s=>s.replace("const [type,id]=a.split(':');","const colon=a.indexOf(':'),type=colon<0?a:a.slice(0,colon),id=colon<0?undefined:a.slice(colon+1);"));
