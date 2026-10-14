import {migrateWallet,calendar,milestoneKey,milestoneReward,recordActivity,recurringTasks,advertising} from './economy.js';
export const modes=[
 {id:'tower',name:'再上一层',tag:'策略登塔',people:'单人',color:'#b7a0ed',line:'一把钥匙，一次取舍。',description:'规划路线，管理生命与钥匙，在每一次选择中走向更高处。',choices:['继续登塔 · 自动读取本地存档'],unit:'层',hud:['生命 1000','攻击 100','防御 100','塔内金币 0'],orientation:'portrait'},
 {id:'marble',name:'再弹一次',tag:'无尽 / 普通 / 困难',people:'单人',color:'#72d9da',line:'弹珠反弹，连锁清场。',description:'无尽守线里组合能力、绕盾清场；普通闯关挑战 50 张反弹地图；困难闯关再挑战 50 张机关地图，运用传送门、单向镜与分裂弹珠破解谜题。三种模式分别保存进度。',choices:['无尽守线 · 余烬流派','普通闯关 · 50 张地图','困难闯关 · 50 张机关地图'],unit:'击破',hud:['无尽守线','普通 50 关','困难 50 关'],orientation:'landscape'},
 {id:'mine',name:'再挖一层',tag:'矿洞探索',people:'单人',color:'#8bd4c1',line:'再深一点，也许就是宝藏。',description:'探索旧矿井、共鸣晶窟、机巧矿场和封存矿库，制作六种局内改造、完成九项目标，解开矿脉机关。旧成绩保留，新规则分别记榜。',choices:['矿脉远征 · 开始或继续','矿工营地 · 图鉴与挑战'],unit:'米',hud:['四种矿区','六种改造 / 两个槽位','目标手册与续玩'],orientation:'portrait'},
 {id:'coop',name:'再闯一关',tag:'接力解谜',people:'单人 / 双人',color:'#8ebcde',line:'有人同行，难关也有回响。',description:'普通36关与困难36关，支持好友联机或单人接力。独自游玩时自由切换 1P / 2P，待命角色留守机关，两人抵达终点。',choices:['双人联机 · 36普通 + 36困难','单人双角色 · 36普通 + 36困难'],unit:'关',hud:['石库 · 认识搭档','1P 就绪','2P 就绪'],orientation:'landscape'},
 {id:'liars',name:'再骗一杯',tag:'经典诈唬牌局',people:'1—4 人',color:'#c6a479',line:'一桌假话，六杯未知。',description:'魔王、勇者、公主轮流坐庄，小偷可以伪装成任何牌。快速匹配同桌旅人，或邀请好友扣牌、质疑，喝下未知魔药，成为最后的幸存者。',choices:['快速匹配','创建局域网房间','加入好友房间'],unit:'轮',hud:['快速匹配','六杯魔药','有效参与获冒险币'],orientation:'portrait'}
];
modes.push({id:'evolve',slot:6,name:'再进化一次',tag:'吞噬进化',people:'单人',color:'#82bba8',line:'带着小伙伴，游向星冠之巅。',description:'主角加两只同级进化，低级随行三合一并占据走位空间；在辽阔池塘横屏游动，躲避各级生物与移动水流，挑战二十级星冠巨兽。地狱挑战增加毒潮、移动裂隙和强水流，与普通旅程分别存档。',choices:['普通进化 · 开始或继续','地狱模式 · 独立挑战'],unit:'级',hud:['等级 1','随行队伍 0','二十级进化'],orientation:'landscape'});
modes.push({id:'workshop',slot:7,name:'魔王面包房',tag:'像素经营',people:'单人',color:'#e9b653',line:'魔王开店，勇者吃饱再出发。',description:'原料、烘焙、门店、外卖四区经营。亲自采集、入仓、投一批、取面包，再交小订单或送餐签收。设备提高操作效率，离线只完成已提交批次，不自动赚钱。',choices:['继续经营 · 自动读取本机小店'],unit:'队订单',hud:['四区分工，名称与用途明确','有限批次，主动交付赚钱','点工位移动，按住采集'],orientation:'landscape'});
modes.push({id:'chess',slot:8,name:'勇者棋牌',tag:'扑克 / 南京麻将',people:'1—4 人',color:'#c5bb7b',line:'围桌而坐，再来一局。',description:'三人斗地主、四人斗地主、掼蛋与南京麻将。四位勇者陪你练习，好友房支持机器人补位和断线重连；局域网开房，或连接已部署的公网服务器。',choices:['进入勇者酒馆 · 选择玩法'],unit:'局',hud:['四种玩法','好友房 / 人机练习','本桌记分'],orientation:'landscape'});
modes.push({id:'nightwatch',slot:9,name:'再守一夜',tag:'勇者守城',people:'单人',color:'#afc5a0',line:'点亮城门，守到天明。',description:'符文连弩自动射击，拖动调整瞄准。击破魔潮、升级三选一，组合五项技能与分支；强化六部位装备、镶嵌符石，带伙伴与守护灵守住三章三十夜。',choices:['进入守夜据点 · 开始或继续'],unit:'夜',hud:['自动射击 / 手动瞄准','三选一技能','装备与符石'],orientation:'portrait'});
export const productCategory=p=>p.id.startsWith('avatar-')||p.id==='scarf'?'avatars':p.id.startsWith('camp-')?'decor':'skins';
export const products=[
 {id:'rose-orb',name:'桃霞弹珠',mode:'再弹一次',price:140,effect:'弹珠、拖尾与发射法阵染成桃霞粉。仅改变外观，不影响能力、伤害与判定。',type:'永久皮肤',icon:'star'},
 {id:'mint-orb',name:'薄荷弹珠',mode:'再弹一次',price:140,effect:'弹珠、拖尾与发射法阵染成薄荷绿。仅改变外观，不影响能力、伤害与判定。',type:'永久皮肤',icon:'star'},

 {id:'avatar-ranger',name:'林间旅人',mode:'营地头像',price:80,effect:'以篝火旁的绿围巾旅人作为营地头像。永久拥有，可随时切换。',type:'永久头像',icon:'user'},
 {id:'avatar-camper',name:'麦田来客',mode:'营地头像',price:100,effect:'以戴草帽的露营伙伴作为营地头像。仅改变营地肖像。',type:'永久头像',icon:'user'},
 {id:'avatar-fox',name:'午睡小狐',mode:'营地头像',price:120,effect:'把篝火旁熟睡的小狐狸带到头像中。仅改变营地肖像。',type:'永久头像',icon:'user'},

 {id:'camp-lights',name:'星夜灯串',mode:'营地布置',price:100,effect:'在营地主场景点亮暖色灯串，永久拥有。',type:'永久装饰',icon:'star'},
 {id:'camp-shelf',name:'旅途展示架',mode:'营地布置',price:180,effect:'营地展示十条路线的实际游玩记录；尚未探索的路线保留空位。',type:'永久装饰',icon:'book'},
 {id:'mine-lamp',name:'青辉矿灯',mode:'再挖一层',price:140,effect:'为矿工脚下添加青色灯环；不改变视野和挖掘成本。',type:'永久外观',icon:'star'},
 {id:'scarf',name:'余烬围巾',mode:'营地头像',price:120,effect:'营地头像佩戴暖红围巾；不会替换原游戏角色。',type:'永久外观',icon:'scarf'},
 {id:'flag',name:'落日战旗',mode:'再弹一次',price:180,effect:'装备后，在《再弹一次》战斗画布右下角展示战旗徽记；不影响战斗。',type:'永久外观',icon:'flag'},
 {id:'amber-orb',name:'琥珀弹珠',mode:'再弹一次',price:120,effect:'将弹珠与发射法阵改为琥珀色；碰撞半径、伤害和生命不变。',type:'永久外观',icon:'star'},
 {id:'violet-orb',name:'紫晶弹珠',mode:'再弹一次',price:160,effect:'将弹珠与尾迹改为紫晶色；仅改变外观。',type:'永久外观',icon:'star'},
 {id:'comet-orb',name:'彗星弹珠',mode:'再弹一次',price:220,effect:'将弹珠与尾迹改为暖金色；仅改变外观。',type:'永久外观',icon:'star'},
 {id:'pick',name:'星辉矿镐',mode:'再挖一层',price:600,effect:'装备后，挖掘时矿工周围绽放星辉，矿工脚下显示金色光环；保留营地徽记，不增加挖掘能力。',type:'永久外观',icon:'pick'}
];
products.push(
 {id:'evolve-lotus',name:'莲塘花冠队伍',mode:'再进化一次',game:'evolve',price:300,effect:'主角与全部随行佩戴莲花冠，二十级均适用。保留物种轮廓、同级大小与吞噬判定。',type:'永久队伍外观',icon:'star'},
 {id:'chess-bamboo',name:'竹林牌桌',mode:'勇者棋牌',game:'chess',price:120,effect:'替换为竹绿色牌桌与竹叶桌边装饰；牌面、暗牌信息和计分不变。',type:'永久桌面',icon:'book'},
 {id:'bakery-berry',name:'莓果甜品屋',mode:'魔王面包房',game:'workshop',price:600,effect:'烤箱与柜台增加莓果装饰、织物桌旗和甜品店招；不改变角色、设施占地、配方或生产收益。',type:'永久店铺主题',icon:'flag'}
);
export function mineReward(details){
 const n=v=>Number.isFinite(v)?Math.max(0,Math.floor(v)):0;
 const digs=n(details?.digActions),depth=n(details?.maxDepth),rooms=n(details?.rooms);
 if(digs<5)return 0;
 return Math.min(30,Math.min(10,Math.floor(digs/5)*2)+Math.min(10,Math.floor(depth/5)*2)+Math.min(4,rooms*2)+(details?.treasureReached?6:0));
}
export function evolveReward(details,win=false){
 const eaten=Number.isFinite(details?.eaten)?Math.max(0,Math.floor(details.eaten)):0;
 const max=details?.rulesVersion===2?20:10;
 const level=Number.isFinite(details?.level)?Math.max(1,Math.min(max,Math.floor(details.level))):1;
 const growth=max===20?Math.floor((level-1)*18/19):(level-1)*2;
 return eaten<5?0:Math.min(36,Math.min(24,growth+Math.floor(eaten/4))+(win&&level===max?12:0));
}
export function nightwatchReward(details,win=false){
 const kills=Number.isFinite(details?.kills)?Math.max(0,Math.floor(details.kills)):0;
 const wave=Number.isFinite(details?.wave)?Math.max(0,Math.floor(details.wave)):0;
 return kills<10?0:Math.min(36,Math.floor(kills/10)+Math.min(10,wave)+(win?12:0));
}
// Every route has one stable camp receipt, independent of replay/run IDs.
export function rushReward(details,win=false,score=0){return details?.submode!=='defense'&&win&&Number.isInteger(details?.stage)&&details.stage>=1&&details.stage<=18&&score===details.stage?8:0;}
modes.push({id:'rush',slot:10,name:'再选一次',tag:'选路成长 · 守点御剑',people:'单人',color:'#80b9a0',line:'御剑集结，打通回家的道路。',description:'移动选路或固定守点，选择人数、飞剑、剑诀与全队飞升。第三关起光幕逐关增加，挑战18位魔物首领与8类小怪；守点每波暂停四选一，两种玩法分别保存。',choices:['御剑选路 · 十八关','灵阵守点 · 三十波'],unit:'关',hud:['加减乘除选路','十八关独立布局','三项轻量成长'],orientation:'portrait'});
export function taskProgress(s,id){
 const runs=s.runs.filter(r=>r.reward>0);
 if(id==='first')return {count:runs.length,target:1,reward:50};
 const valid=new Set(modes.map(m=>m.id)),visited=new Set(runs.filter(r=>valid.has(r.mode)).map(r=>r.mode));
 const soloModes=new Set(modes.filter(m=>m.people==='单人').map(m=>m.id));
 const solo=[...visited].filter(id=>soloModes.has(id)),soloRuns=runs.filter(r=>soloModes.has(r.mode)).length;
 return {count:visited.size>=4?4:Math.min(4,solo.length+(soloRuns>=6&&solo.length>=3?1:0)),target:4,reward:100};
}
export function initial(){return {version:1,name:'旅人',coins:160,ledger:[],runs:[],claimed:[],owned:[],equipped:[],settings:{music:false,sound:true,vibration:false},last:null}}
export function createServices(storage){
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
  if(typeof win!=='boolean')throw Error('结算结果无效');
  if(mode==='rush'&&details.submode!=='defense'&&win&&score===details.stage&&Number.isInteger(score)&&score>=1&&score<=18)id='rush-stage-'+score;
  if(mode==='rush'&&details.submode!=='defense'&&score!==details.stage)win=false;
  if(mode==='workshop'&&score!==details.beacon)win=false;
  const existing=s.runs.find(r=>r.id===id);if(existing){if(existing.mode!==mode)throw Error('结算玩法不匹配');if(!existing.win&&win){existing.win=true;existing.score=score;const key=milestoneKey(mode,true,score,details,id),value=milestoneReward(mode,key);if(key&&!s.economy.milestones.includes(key)){s.economy.milestones.push(key);const extra=existing.legacy&&mode==='tower'?Math.max(0,30-existing.reward):value;credit(s,'upgrade-'+id,extra,'首次目标奖励');existing.reward+=extra;existing.baseReward=0;}}return existing;}
  const key=milestoneKey(mode,win,score,details,id);let amount=0;
  if(key&&!s.economy.milestones.includes(key)){s.economy.milestones.push(key);amount=milestoneReward(mode,key);}
  const run={id,mode,win:!!win,score:Number.isFinite(score)?score:0,reward:amount,baseReward:s.economy.sessions[details.sessionId]?.reward||0,day:calendar(now()).day,details:{submode:details.submode,wave:details.wave,stage:details.stage,beacon:details.beacon,campaign:details.campaign,levelId:details.levelId,difficulty:details.difficulty}};
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
export function createRoomService(){let room=null;return {
 get:()=>room?{...room}:null,
 create:()=>room={code:'246810',host:true,state:'waiting',ready:false},
 join:code=>{if(code==='888888')throw Error('房间已满，请使用其他房间码');if(code!=='246810')throw Error('房间不存在。演示房间码为 246810');return room={code,host:false,state:'joined',ready:false}},
 set:value=>{if(room){room.state=value;if(value==='waiting')room.ready=false}},
 ready:()=>{if(room)room.ready=!room.ready},leave:()=>{room=null}
}}

