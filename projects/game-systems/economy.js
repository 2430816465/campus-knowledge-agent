// One cosmetic wallet. Gameplay currencies and combat statistics never enter this ledger.
export const ECONOMY_VERSION=2;
export function calendar(now=Date.now()){
 const day=new Date(now+8*3600000).toISOString().slice(0,10),d=new Date(day+'T00:00:00Z');
 d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
 return {day,week:d.toISOString().slice(0,10)};
}
const number=v=>Number.isFinite(v)?Math.max(0,Math.floor(v)):0;
export function migrateWallet(saved,initial){
 if(!saved)return {...initial(),economyVersion:2,economy:{sessions:{},days:{},weeks:{},milestones:[]}};
 if(saved.version!==1||!Array.isArray(saved.runs))throw Error('冒险币存档格式异常，原始数据已保留，请先导出备份');
 const s=structuredClone(saved);
 if(!Number.isSafeInteger(s.coins)||s.coins<0)throw Error('冒险币存档异常，原始数据已保留，请先导出备份');
 for(const key of ['ledger','owned','equipped','claimed'])if(!Array.isArray(s[key]))s[key]=[];
 s.settings={...initial().settings,...s.settings};
 s.economy??={sessions:{},days:{},weeks:{},milestones:[]};
 s.economy.sessions??={};s.economy.days??={};s.economy.weeks??={};s.economy.milestones??=[];
 // Historical receipts grant ownership of their first-clear, never money a second time.
 if(s.economyVersion!==2){
  for(const r of s.runs){r.legacy=true;const key=milestoneKey(r.mode,r.win,r.score,r.details||{},r.id);if(key&&!s.economy.milestones.includes(key))s.economy.milestones.push(key);}
  s.economyVersion=2;
 }
 return s;
}
export function milestoneKey(mode,win,score,details={},id=''){
 if(!win)return null;
 if(mode==='coop'){
  if(details.campaign==='slf-72-v1'&&Number.isInteger(details.levelId)&&details.levelId>=51&&details.levelId<=122&&score===details.levelId)return 'coop-slf-72-v1-'+details.levelId;
  if(Number.isInteger(score)&&score>=1&&score<=50)return 'coop-level-'+score;
 }
 if(mode==='marble'&&Number.isInteger(score)&&score>=1&&score<=50){
  if(details.campaign==='marble-hard-v3'||/^marble-hard-v3-level-/.test(id)){
   if(details.levelId!==undefined&&details.levelId!==score)return null;
   if(/^marble-hard-v3-level-/.test(id)&&id!=='marble-hard-v3-level-'+score)return null;
   return 'marble-hard-v3-level-'+score;
  }
  if(details.campaign||/^marble-ruins-v2-level-/.test(id))return 'marble-level-'+score;
 }
 if(mode==='rush'&&details.submode!=='defense'&&Number.isInteger(details.stage??score)&&(details.stage??score)>=1&&(details.stage??score)<=18)return 'rush-stage-'+(details.stage??score);
 if(mode==='workshop'&&Number.isInteger(details.beacon??score)&&(details.beacon??score)>=1&&(details.beacon??score)<=6)return 'workshop-beacon-'+(details.beacon??score);
 if(mode==='tower')return 'tower-complete';
 if(mode==='evolve')return details.level>=(details.rulesVersion===2?20:10)&&details.eaten>=5?'evolve-first-win':null;
 if(mode==='mine')return details.digActions>=5&&details.treasureReached?'mine-first-win':null;
 if(mode==='nightwatch')return details.kills>=10?'nightwatch-first-win':null;
 return null;
}
export function milestoneReward(mode,key){return !key?0:mode==='tower'?30:mode==='workshop'?10:['coop','marble','rush'].includes(mode)?8:10;}
export function recordActivity(s,{id,mode,seconds,units},now,credit){
 const {day,week}=calendar(now),e=s.economy;
 let r=e.sessions[id];
 if(!r)r=e.sessions[id]={mode,seconds:0,units:0,reward:0,qualified:false};
 if(r.mode!==mode)throw Error('奖励记录与玩法不匹配');
 const t=number(seconds),u=number(units);
 if(t<r.seconds||u<r.units)return {amount:0,reward:r.reward};
 // Progress earns; elapsed time only bounds its rate. No idle or welcome burst money.
 const earned=Math.min(Math.floor(t/30),u),amount=Math.max(0,earned-r.reward);
 const d=e.days[day]??={units:0,seconds:0,sessions:0},w=e.weeks[week]??={sessions:0};
 d.units+=u-r.units;d.seconds+=t-r.seconds;r.seconds=t;r.units=u;
 if(amount){credit(s,'progress-'+id+'-'+earned,amount,'有效冒险 · '+mode);r.reward=earned;
  let run=s.runs.find(x=>x.id==='progress-'+id);if(!run){run={id:'progress-'+id,mode,win:false,score:u,reward:earned,day,kind:'progress'};s.runs.push(run);}else{run.reward=earned;run.score=u;}
 }
 if(!r.qualified&&t>=120&&u>=3){r.qualified=true;d.sessions++;w.sessions++;}
 return {amount,reward:r.reward};
}
export function recurringTasks(s,now=Date.now()){
 const {day,week}=calendar(now),d=s.economy?.days?.[day]||{},w=s.economy?.weeks?.[week]||{};
 return [
  {id:'daily-play:'+day,name:'认真冒险',description:'自选玩法有效游玩两分钟，并完成至少三个有效目标。',count:d.sessions||0,target:1,reward:10},
  {id:'daily-progress:'+day,name:'再进一点',description:'有效游玩两分钟，并累计完成八个有效目标。',count:d.seconds>=120?d.units||0:0,target:8,reward:10},
  {id:'weekly-play:'+week,name:'本周旅途',description:'本周累计完成五次有效冒险，不要求连续登录。',count:w.sessions||0,target:5,reward:60}
 ].map(q=>({...q,claimed:s.claimed.includes(q.id)}));
}
export function advertising(s,id,now=Date.now()){
 const run=s.runs.find(r=>r.id===id),{day}=calendar(now),count=s.ledger.filter(x=>x.kind==='ad'&&x.day===day).length;
 const amount=run&&!['liars','rush','chess'].includes(run.mode)?Math.min(10,Math.floor((run.kind==='progress'?run.reward:run.baseReward||0)*.5)):0;
 return {amount,claimed:s.ledger.some(x=>x.id==='ad-'+id),remaining:Math.max(0,3-count)};
}
