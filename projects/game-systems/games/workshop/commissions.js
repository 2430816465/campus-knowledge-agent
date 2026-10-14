// Hand-authored, finite festivals. Progress comes from explicit work, never time.
export const COMMISSIONS=[
 {id:'breakfast',name:'骑士早餐周',unlock:1,reward:180,story:'同时准备两种早餐，练习把烘烤间隙用来备料。',goals:[['bread0',6,'取出普通面包'],['bread1',4,'取出牛奶面包'],['orders',3,'交付普通订单']]},
 {id:'forest',name:'森林野餐会',unlock:2,reward:260,story:'把麦子先磨成面粉，再准备莓果风味，体验加工路线。',goals:[['flour',6,'取出面粉'],['bread2',6,'取出莓果面包'],['orders',3,'交付普通订单']]},
 {id:'tea',name:'法师下午茶',unlock:2,reward:340,story:'备果酱、做点心、补展示架，亲自招待到店客人。',goals:[['jam',4,'取出果酱'],['bread3',4,'取出果酱面包'],['served',6,'主动送餐']]},
 {id:'picnic',name:'远足补给站',unlock:3,reward:420,story:'提前准备三味面包，把打包与下一批烘焙交错安排。',goals:[['packed',4,'亲自取出外卖篮'],['trips',3,'签收外卖回款'],['bread1',4,'取出牛奶面包']]},
 {id:'tasting',name:'四味品鉴会',unlock:4,reward:500,story:'为顾客准备完整风味，不靠单一高价配方反复刷钱。',goals:[['bread0',4,'取出普通面包'],['bread1',4,'取出牛奶面包'],['bread2',4,'取出莓果面包'],['bread3',4,'取出果酱面包'],['served',8,'主动送餐']]},
 {id:'festival',name:'王国面包节',unlock:5,reward:680,story:'同时兼顾订单、堂食和外卖，用设施提升调度效率。',goals:[['orders',5,'交付普通订单'],['served',10,'主动送餐'],['trips',4,'签收外卖回款'],['bread3',6,'取出果酱面包']]}
];
export const freshJournal=()=>({active:null,done:[],progress:{}});
export function restoreJournal(raw){const j=freshJournal();for(const c of COMMISSIONS){if(raw?.done?.includes(c.id))j.done.push(c.id);if(raw?.progress?.[c.id])j.progress[c.id]=Object.fromEntries(c.goals.map(([k,n])=>[k,Math.min(n,Math.max(0,Math.floor(Number(raw.progress[c.id][k])||0)))]));}if(COMMISSIONS.some(c=>c.id===raw?.active)&&!j.done.includes(raw.active))j.active=raw.active;return j;}
export function chooseCommission(s,id){const c=COMMISSIONS.find(c=>c.id===id);if(s.paused||!c||s.beacons<c.unlock||s.journal.done.includes(id))return false;s.journal.active=id;s.journal.progress[id]||={};return true;}
export function recordWork(s,key,count=1){const id=s.journal.active,c=COMMISSIONS.find(c=>c.id===id),g=c?.goals.find(g=>g[0]===key);if(!g||count<=0)return;const p=s.journal.progress[id]||=( {} );p[key]=Math.min(g[1],(p[key]||0)+count);}
export function commissionReady(s,id=s.journal.active){const c=COMMISSIONS.find(c=>c.id===id);return !!c&&!s.journal.done.includes(id)&&c.goals.every(([k,n])=>(s.journal.progress[id]?.[k]||0)>=n);}
export function claimCommission(s,id){const c=COMMISSIONS.find(c=>c.id===id);if(s.paused||!commissionReady(s,id))return false;s.journal.done.push(id);s.coins+=c.reward;s.earned+=c.reward;if(s.journal.active===id)s.journal.active=null;return true;}
export function journalHint(s){const c=COMMISSIONS.find(c=>c.id===s.journal.active);if(!c)return `主题委托 ${s.journal.done.length} / 6 · 在订单簿选择`;if(commissionReady(s))return `${c.name}已完成 · 到柜台领纪念章`;const g=c.goals.find(([k,n])=>(s.journal.progress[c.id]?.[k]||0)<n);return `${c.name} · ${g[2]} ${s.journal.progress[c.id]?.[g[0]]||0}/${g[1]}`;}
