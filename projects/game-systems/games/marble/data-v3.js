// The dense expedition is deliberately separate from the five-room data so saved
// version-2 expeditions can finish with their original layouts and rewards.
export const V3={rooms:15,baseBalls:6,maxMainBalls:10,maxBalls:24,launchGap:.085,ballHits:18,childHits:7,volleySeconds:8,energyHit:5,energyPerVolley:60,strongDamage:1.25,strongHits:2,killRefunds:3,attackerCap:3,lateAttackerCap:4,supportCap:1,enemyCap:30,chainCap:8,baseRoomCoins:2,bossCoins:8,challengeMultiplier:1.2,challengeCap:50};
export const ELEMENTS={
 basic:{name:'基础',icon:'◆',color:'#92f3f5',damage:8,description:'稳定直击 8'},
 fire:{name:'火焰',icon:'✹',color:'#ff9865',damage:7,description:'直击 7；每球最多 3 次范围爆炸'},
 lightning:{name:'雷电',icon:'ϟ',color:'#ffe174',damage:7,description:'直击 7；每球最多 3 次双目标电链'},
 pierce:{name:'穿透',icon:'➜',color:'#c5a5ff',damage:7,description:'直击 7；每球前 2 次非正面盾接触穿透'},
 ice:{name:'寒冰',icon:'❄',color:'#94d6ff',damage:7,description:'直击 7；叠两层冰霜冻结一次'},
 split:{name:'分裂',icon:'✣',color:'#a9ec91',damage:7,description:'直击 7；首次命中生成两颗弱子球'}
};
export const V3_UPGRADES={
 extra:{name:'追加弹珠',icon:'◉',effect:'主球队列增加 1 槽，最多 10 槽'},
 core:{name:'锐光核心',icon:'✦',effect:'每次主球直接命中 +2'},
 first:{name:'破阵首击',icon:'✧',effect:'每个齐射回合首次直击 +5'},
 echo:{name:'回响纹章',icon:'⌁',effect:'每颗主球首次借墙后下次直击 +4'},
 pierce:{name:'穿透符文',icon:'➜',effect:'每个齐射回合首次非正面盾直击穿透'},
 burst:{name:'爆裂火花',icon:'✺',effect:'每回合首次直击对周围造成 3 间接伤害'},
 elastic:{name:'弹性护符',icon:'∞',effect:'每颗主球碰撞预算 +2'},
 film:{name:'守护薄膜',icon:'⬟',effect:'敌方阶段抵挡 2 伤害'},
 supply:{name:'旅途补给',icon:'✚',effect:'立即恢复 7 生命，每次进入新房恢复 2'}
};
const rows=(count,pattern='line')=>{
 const xs=pattern==='wings'?[55,92,130,230,268,305]:pattern==='corridor'?[54,94,132,228,266,306]:[56,97,138,180,222,263,304];
 const spots=[];for(let row=0;row<5;row++)for(let col=0;col<xs.length;col++){
  if(pattern==='ring'&&row===2&&col>1&&col<xs.length-2)continue;
  const y=pattern==='wings'?176+row*39:170+row*39;
  spots.push([xs[col],y]);
 }
 return spots.slice(0,count).map(([x,y])=>({type:'minion',x,y,r:9}));
};
const special=(type,x,y)=>({type,x,y,r:type==='boss'?31:type==='elite'?20:15});
const spring=(x,y,r=14)=>({x,y,r});
const plate=(x1,y1,x2,y2)=>({x1,y1,x2,y2});
const cluster=(x,y)=>({x,y,r:12});
const wave=(minions,formation='line',specials=[],facilities='standard')=>{
 const layouts={
  standard:{springs:[spring(47,365),spring(313,365)],plates:[plate(51,326,83,358),plate(277,358,309,326)],clusters:[cluster(117,246),cluster(180,246),cluster(243,246)]},
  wings:{springs:[spring(43,292),spring(317,292)],plates:[plate(58,374,91,407),plate(269,407,302,374)],clusters:[cluster(83,230),cluster(180,230),cluster(277,230)]},
  ring:{springs:[spring(72,339),spring(288,339)],plates:[plate(69,404,102,371),plate(258,371,291,404)],clusters:[cluster(130,249),cluster(180,249),cluster(230,249)]},
  boss:{springs:[spring(48,335),spring(312,335)],plates:[plate(51,397,91,357),plate(269,357,309,397)],clusters:[cluster(104,241),cluster(256,241)]}
 };
 return {enemies:[...rows(minions,formation),...specials],...layouts[facilities]};
};
// Each room is curated from a small set of readable formations. Wave counts are
// intentionally restrained: fifteen rooms should not become thirty slow menus.
export const V3_ROOMS=[
 {name:'第一串弹珠',hint:'六球齐射，先清杂兵',waves:[wave(8,'line',[],'standard')]},
 {name:'弹力侧廊',hint:'借两侧弹力柱延长击打',waves:[wave(11,'wings',[special('guard',180,116)],'wings')]},
 {name:'晶簇花园',hint:'打进晶簇之间引发连锁',waves:[wave(15,'line',[special('guard',180,113)],'standard'),wave(10,'wings',[],'wings')]},
 {name:'盾阵破口',hint:'前排盾兵，后排杂兵',waves:[wave(16,'corridor',[special('shield',180,111)],'ring')]},
 {name:'补给深井',hint:'进入时恢复生命，继续形成构筑',heal:12,waves:[wave(17,'ring',[special('elite',180,105)],'ring')]},
 {name:'雷鸣回廊',hint:'电链可处理两翼怪群',waves:[wave(18,'wings',[special('priest',180,105)],'wings'),wave(12,'line',[],'standard')]},
 {name:'分岔矿道',hint:'斜板把弹珠送回敌阵',waves:[wave(19,'corridor',[special('guard',180,104)],'standard')]},
 {name:'余烬环阵',hint:'让火焰与晶簇连成一片',waves:[wave(20,'ring',[special('elite',180,104)],'ring')]},
 {name:'冻结窗口',hint:'抓住攻击预告，优先处理危险目标',waves:[wave(19,'wings',[special('statue',180,104)],'wings'),wave(14,'line',[special('shield',180,105)],'standard')]},
 {name:'第二处补给',hint:'恢复生命，准备更密集的后半程',heal:12,waves:[wave(21,'corridor',[special('priest',180,105)],'standard')]},
 {name:'精英双翼',hint:'两翼反弹与精英压制',waves:[wave(22,'wings',[special('elite',180,104)],'wings')]},
 {name:'碎晶长厅',hint:'三簇连爆，寻找侧面通道',waves:[wave(23,'line',[special('shield',180,104)],'standard'),wave(16,'ring',[],'ring')]},
 {name:'构筑检验',hint:'两种阵形连续出现',waves:[wave(24,'corridor',[special('elite',180,103)],'ring')]},
 {name:'守门双阵',hint:'清掉攻击者，保留生命迎战守卫',waves:[wave(24,'wings',[special('statue',180,104)],'wings'),wave(20,'line',[special('elite',180,104)],'standard')]},
 {name:'遗迹守卫',hint:'击破守卫即可结束，第二阶段会召唤杂兵',waves:[wave(10,'wings',[special('boss',180,114)],'boss')]}
];
V3_ROOMS[1].waves[0].target={x:180,y:354,r:12};
V3_ROOMS[7].waves[0].target={x:180,y:370,r:12};
export const SAMPLE=wave(15,'line',[special('guard',105,108),special('guard',255,108),special('elite',180,68)],'standard');
export const sampleCount=SAMPLE.enemies.length;
export function v3Offers(seed,roomIndex,queue,upgrades){
 const rng=((seed+Math.imul(roomIndex+1,1103515245))>>>0);
 const elementOrder=['fire','lightning','pierce','ice','split'];
 if(roomIndex===0)return elementOrder.slice(0,3).map(id=>'element:'+id);
 const shift=rng%elementOrder.length,element=[...elementOrder.slice(shift),...elementOrder.slice(0,shift)];
 const pool=[...element.map(id=>'element:'+id),...Object.keys(V3_UPGRADES).filter(id=>id==='extra'?queue.length<V3.maxMainBalls:!upgrades.includes(id)).map(id=>'upgrade:'+id)];
 return [pool[(roomIndex*3)%pool.length],pool[(roomIndex*3+3)%pool.length],pool[(roomIndex*3+6)%pool.length]].filter((x,i,a)=>a.indexOf(x)===i);
}
