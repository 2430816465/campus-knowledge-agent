export {STAGES as PREVIOUS_STAGES,plan as previousPlan} from './layout-v2.js';
export const KEY='camp-rush-v1', W=480, H=800, MAX_SQUAD=48;
export const CHAPTERS=[{name:'林间救援',color:'#658573',road:'#a99d7c',enemy:'skeleton',story:'打通林间道路，带被困旅人回到营地。'},{name:'废矿护送',color:'#656f85',road:'#a4a6ab',enemy:'orc_warrior',story:'护送符石运输队，夺回被魔物占据的矿道。'},{name:'古堡破阵',color:'#82737b',road:'#aba19a',enemy:'knight_black',story:'突破古堡封锁，重新点亮通往营地的封印灯。'}];
// 每关独立编排；门：[时间, 左运算, 右运算, 分界, 摆幅]，波次：[时间, 阵形, 数量]。
const BLUEPRINTS=[
 {name:'林口集结',terrain:'trail',hint:'先集结，打破左侧剑匣，再接右侧伙伴。',gates:[[0,'+5','+2'],[8,'+2!','+4'],[17,'×2','+9'],[28,'+5','+3']],waves:[[4,'left',4],[11,'right',4],[20,'row',4],[31,'wedge',4]],chests:[[13,132,'weapon'],[23,348,'rescue']],rocks:[],bossTime:40,bossX:240},
 {name:'溪畔折返',terrain:'brook',hint:'敌人沿左右岸交替来袭；别追着石块走。',gates:[[0,'+3','+6',280],[7,'+4','−3',200],[18,'+8','×2',270],[29,'−4','+6',200]],waves:[[3,'right',4],[12,'left',5],[22,'right',5],[33,'left',4]],chests:[[10,348,'weapon'],[25,132,'rescue']],rocks:[[15,90],[24,390]],bossTime:41,bossX:300},
 {name:'残桥算阵',terrain:'bridge',hint:'首次双减员：÷2 与 −3，选通过后人数更多的一边。',gates:[[0,'+7','+3'],[9,'÷2','−3'],[18,'+9','×2'],[30,'−4','÷2']],waves:[[5,'column',5],[14,'wedge',5],[24,'column',6],[34,'row',5]],chests:[[13,132,'weapon'],[26,348,'rescue']],rocks:[[21,84],[21,396]],bossTime:42,bossX:210},
 {name:'荆棘回廊',terrain:'thorns',hint:'石阵左右错开，连续换边后再接补员光幕。',gates:[[0,'+4','+7',205],[8,'−4','÷2',270],[19,'×2','+10',205],[31,'+5','−5',270]],waves:[[4,'diagonal',5],[13,'reverse',6],[24,'diagonal',6],[35,'wedge',5]],chests:[[12,348,'weapon'],[27,132,'rescue']],rocks:[[14,100],[20,380],[28,90]],bossTime:43,bossX:280},
 {name:'围笼救援',terrain:'grove',hint:'两只伙伴牢笼分居两侧；救援能补回减员，保住人数。',gates:[[0,'+8','+4'],[10,'−5','÷2'],[21,'+8','×2'],[33,'÷2','−6']],waves:[[4,'pincer',6],[15,'row',6],[25,'pincer',7],[36,'column',6]],chests:[[7,132,'weapon'],[17,348,'rescue'],[28,132,'rescue']],rocks:[[20,390],[30,84]],bossTime:44,bossX:240},
 {name:'林灯守卫',terrain:'shrine',hint:'集齐两道剑诀，穿透左右包抄；守卫会发射三枚法球。',gates:[[0,'+5','+9'],[9,'+4!','−4'],[20,'×2','+11'],[31,'−7','÷2'],[37,'+8','+5']],waves:[[4,'wedge',6],[15,'pincer',7],[25,'row',7],[36,'pincer',7]],chests:[[12,132,'weapon'],[26,348,'weapon']],rocks:[[18,90],[29,390]],bossTime:45,bossX:240},
 {name:'矿轨岔口',terrain:'rails',hint:'偏置光幕改变两路宽度；击破沿轨道推进的矿兵。',gates:[[0,'+9','+5',190],[8,'−5','÷2',290],[20,'+11','×2',190],[32,'÷2','−7',290],[38,'+6','+9']],waves:[[4,'rails',7],[13,'left',7],[24,'rails',8],[36,'right',7]],chests:[[11,132,'weapon'],[27,348,'rescue']],rocks:[[18,90],[29,390]],bossTime:45.5,bossX:220},
 {name:'碎石斜坡',terrain:'scree',hint:'斜列敌人与交错落石；用短距离换边保住伙伴。',gates:[[0,'+6','+10'],[9,'÷2','−6'],[22,'×2','+12'],[33,'−8','÷2'],[39,'+9','+6']],waves:[[4,'diagonal',7],[14,'reverse',8],[25,'diagonal',8],[36,'reverse',7]],chests:[[12,348,'weapon'],[29,132,'rescue']],rocks:[[10,82],[19,395],[28,95],[36,385]],bossTime:46,bossX:280},
 {name:'符矿摆阵',terrain:'crystals',hint:'门的分界会摆动，按队长脚下位置选路；除法向下取整。',gates:[[0,'+10','+6'],[10,'−6','÷2',240,28],[21,'×2','+13',225,26],[33,'÷3','−9',255,24],[40,'+7','+10']],waves:[[4,'wedge',8],[15,'rails',8],[26,'wedge',9],[37,'pincer',8]],chests:[[13,132,'weapon'],[29,348,'rescue']],rocks:[[18,390],[31,84]],bossTime:46.5,bossX:240},
 {name:'双塔夹击',terrain:'pillars',hint:'左右法师夹击，先选人数，再转向火力较弱的一侧。',gates:[[0,'+7','+11',210],[9,'÷2','−7',270],[22,'+12','×2',210],[34,'−9','÷3',270],[40,'+10','+7']],waves:[[4,'pincer',6],[15,'left',6],[26,'right',11],[37,'row',11]],chests:[[12,348,'weapon'],[29,132,'rescue']],rocks:[[19,85],[32,395]],mages:[[17,132],[28,348]],bossTime:47,bossX:240},
 {name:'运输折线',terrain:'cargo',hint:'三个补给点排成折线；第二只剑匣可解锁穿透。',gates:[[0,'+11','+7'],[10,'−7','÷2'],[23,'×2','+14'],[35,'÷3','−10'],[41,'+8','+11']],waves:[[4,'reverse',9],[16,'diagonal',9],[27,'rails',10],[38,'wedge',9]],chests:[[12,132,'weapon'],[24,348,'weapon'],[32,132,'rescue']],rocks:[[18,390],[30,390]],mages:[[28,348]],bossTime:47.5,bossX:260},
 {name:'矿心巨像',terrain:'forge',hint:'巨像横移并发射三枚法球；双剑诀与末段补员是关键。',gates:[[0,'+8','+12'],[10,'÷2','−8',215,20],[23,'+14','×2',265,22],[35,'−11','÷3'],[42,'+12','+8']],waves:[[4,'rails',9],[16,'pincer',10],[28,'wedge',10],[39,'row',10]],chests:[[13,132,'weapon'],[29,348,'weapon']],rocks:[[20,88],[33,392]],mages:[[25,348],[37,132]],bossTime:48,bossX:240},
 {name:'城门分流',terrain:'bastion',hint:'宽窄两路交替，黑甲兵结阵；不要在窄侧追赶魔物。',gates:[[0,'+12','+8',195],[10,'−8','÷2',285],[23,'×2','+15',195],[36,'÷3','−11',285],[43,'+9','+12']],waves:[[4,'column',10],[16,'row',10],[28,'pincer',11],[40,'rails',10]],chests:[[13,348,'weapon'],[30,132,'rescue']],rocks:[[20,90],[34,390]],mages:[[26,132]],bossTime:48.5,bossX:210},
 {name:'钟庭游阵',terrain:'clock',hint:'摆动门与横移黑甲兵同时出现；给换边留出距离。',gates:[[0,'+9','+13'],[11,'÷2','−9',230,30],[24,'+15','×2',250,32],[37,'−12','÷3',230,28],[44,'+13','+9']],waves:[[4,'wedge',10],[17,'pincer',11],[29,'diagonal',11],[41,'reverse',11]],chests:[[14,132,'weapon'],[31,348,'rescue']],rocks:[[21,390],[35,85]],mages:[[27,348],[39,132]],bossTime:49,bossX:240},
 {name:'断垣蛇道',terrain:'ruins',hint:'落石与敌阵形成左右折返；先读下一道双减员门。',gates:[[0,'+13','+9',210],[11,'−9','÷2',270],[24,'×2','+16',210],[37,'÷3','−12',270],[44,'+10','+13']],waves:[[4,'left',11],[17,'right',11],[30,'left',12],[42,'right',11]],chests:[[14,348,'weapon'],[32,132,'rescue']],rocks:[[12,90],[21,390],[30,90],[39,390]],mages:[[26,348],[40,132]],bossTime:49.5,bossX:270},
 {name:'牢狱取舍',terrain:'prison',hint:'两侧同时来补给：剑匣提高火力，牢笼补人数，自选路线。',gates:[[0,'+10','+14'],[12,'÷2','−10'],[25,'+16','×2'],[38,'−13','÷3'],[45,'+14','+10']],waves:[[4,'rails',11],[18,'pincer',12],[31,'row',12],[43,'wedge',12]],chests:[[15,84,'weapon'],[15,396,'rescue'],[32,396,'weapon'],[32,84,'rescue']],rocks:[[23,85],[40,395]],mages:[[28,132],[41,348]],bossTime:50,bossX:240},
 {name:'封印连算',terrain:'runes',hint:'两道双减员门连续到来；保人数与第二把剑诀需同时兼顾。',gates:[[0,'+14','+10'],[10,'−8','÷2',220,22],[18,'÷2','−4',260,22],[27,'×2','+17'],[38,'−13','÷2'],[46,'+15','+11']],waves:[[4,'wedge',8],[15,'reverse',8],[28,'diagonal',15],[41,'pincer',15]],chests:[[6,132,'weapon'],[30,348,'weapon'],[35,132,'rescue']],rocks:[[23,390],[37,85]],mages:[[25,348],[40,132]],bossTime:50.5,bossX:240},
 {name:'古堡终阵',terrain:'throne',hint:'六道光幕、折返补给与横移龙卫；计算损失后再迎最终法球。',gates:[[0,'+11','+15'],[11,'÷2','−9',215,24],[20,'−4','÷2',265,24],[29,'+18','×2'],[39,'÷3','−14',235,30],[47,'+12','+16']],waves:[[4,'pincer',9],[16,'rails',9],[30,'wedge',15],[43,'row',15]],chests:[[6,348,'weapon'],[32,132,'weapon'],[36,348,'rescue']],rocks:[[24,90],[35,390],[44,88]],mages:[[27,132],[40,348]],bossTime:51,bossX:240}
];
// 每三关首次引入一个机制；既有路线与地形保留，后续关卡组合已学机制。
export const MECHANICS=[
 {first:1,name:'补给与爆裂箱',hint:'金箱强化剑诀，蓝箱召集伙伴；红箱击破或撞上都会减员。'},
 {first:4,name:'射速光幕',hint:'射速门提高出剑频率，可与人数门二选一。'},
 {first:7,name:'射程光幕',hint:'射程门让飞剑更早打到远处目标。'},
 {first:10,name:'伤害光幕',hint:'伤害门增强每次命中，配合剑诀穿透。'},
 {first:13,name:'雷符武器',hint:'击破雷符箱换装雷符，命中后连锁附近两个魔物。'},
 {first:16,name:'炎符武器',hint:'击破炎符箱换装炎符，命中后灼伤附近魔物。'}
];
// 前三关单独校准：第一关轻增压力；第二关更密、更硬；第三关继续增加并保留双减员计算。
BLUEPRINTS[0].waves=[[4,'left',4],[11,'right',5],[20,'row',4],[31,'wedge',5]];
BLUEPRINTS[1].waves=[[3,'right',6],[12,'left',7],[22,'right',7],[33,'left',6]];
BLUEPRINTS[2].waves=[[5,'column',7],[14,'wedge',8],[24,'column',8],[34,'row',7]];
const extraCrates=[
 [[25,84,'trap',2]],
 [[6,84,'trap',4],[16,132,'army',8],[27,396,'trap',4]],
 [[6,396,'trap',5],[17,348,'army',8],[28,84,'trap',5]],
 [[5,132,'army',12],[15,396,'trap',5]],
 [[6,396,'trap',5],[23,348,'army',12]],
 [[6,348,'army',12],[17,84,'trap',6],[32,396,'trap',6]],
 [[6,132,'army',14],[17,396,'trap',6]],
 [[6,396,'trap',7],[23,348,'army',14]],
 [[6,132,'army',14],[17,84,'trap',7],[34,396,'trap',7]],
 [[6,348,'army',16],[18,84,'trap',8]],
 [[6,396,'trap',8],[23,132,'army',16]],
 [[6,348,'army',16],[18,84,'trap',8],[36,396,'trap',8]],
 [[7,348,'lightning'],[18,84,'trap',9],[34,132,'army',18]],
 [[7,132,'lightning'],[19,396,'trap',9],[35,348,'army',18]],
 [[7,348,'lightning'],[19,84,'trap',10],[35,132,'army',18]],
 [[7,132,'flame'],[19,396,'trap',10],[34,348,'army',20]],
 [[7,348,'flame'],[21,84,'trap',10],[36,132,'army',20]],
 [[7,132,'flame'],[22,396,'trap',12],[37,348,'army',20]]
];
BLUEPRINTS.forEach((s,i)=>{
 const stage=i+1,block=Math.floor(i/3);s.mechanic=block;
 s.chests.push(...extraCrates[i]);
 if(stage>=4)s.waves=s.waves.map(([t,p,n])=>[t,p,n+2]);
 if(stage>=4&&stage<=6)s.gates[2][2]='haste:1';
 if(stage>=7&&stage<=9){s.gates[2][1]='range:1';s.gates.at(-1)[1]='haste:1';}
 if(stage>=10){s.gates[2][1]='damage:1';s.gates[0][1]='range:1';s.gates.at(-1)[1]='haste:1';}
 s.hint=MECHANICS[block].hint+' '+s.hint;
});
export const STAGES=BLUEPRINTS.map((s,i)=>({...s,id:i+1,chapter:Math.floor(i/6),boss:i%6===5,pace:92+i*.9,duration:s.bossTime+16,difficulty:i+1}));
export const TRAINING={power:{name:'淬剑修习',description:'每级提高每柄飞剑的伤害。',max:8,cost:lv=>24+lv*16},speed:{name:'御剑熟练',description:'每级提高小队的出剑速度。',max:6,cost:lv=>30+lv*22},recruits:{name:'伙伴集结',description:'每级增加一名开局队员。',max:5,cost:lv=>38+lv*26}};
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// 旧局保留旧事件表与速度，新的编排仅在下一次出发生效。
export function legacyPlan(stage){
 const s=STAGES[stage-1], events=[];
 const add=(time,kind,x,extra={})=>events.push({time,kind,x,...extra});
 add(0,'gates',240,{left:{op:'+',value:5},right:{op:'+',value:2}});
 add(8,'gates',240,{left:{op:'+',value:-5-stage%3,shoot:true},right:{op:'+',value:3}});
 add(17,'gates',240,{left:{op:'×',value:2},right:{op:'+',value:8+stage%4}});
 add(28,'gates',240,{left:{op:'+',value:5},right:{op:'+',value:-7,shoot:true}});
 for(const t of [4,11,20,31])for(let i=0;i<4+Math.floor(stage/3);i++)add(t+i*.22,'enemy',76+(i%5)*82,{hp:9+stage*1.3,damage:1+(s.chapter===2?1:0),type:s.chapter===1&&i%4===3?'mage':CHAPTERS[s.chapter].enemy});
 add(13,'chest',stage%2?132:348,{hp:28+stage*3,loot:'weapon'});
 add(23,'chest',stage%2?348:132,{hp:22+stage*2,loot:'rescue'});
 if(stage>=3)add(13.5,'rock',stage%2?348:132,{radius:38});
 if(stage>=5)add(24,'rock',240,{radius:32});
 if(stage>=8)add(33,'enemy',stage%2?132:348,{hp:45+stage*2,damage:2,type:'mage'});
 add(40,'boss',240,{hp:s.boss?450+stage*28:90+stage*13,damage:s.boss?4:2,type:s.chapter===2?'dragon':s.chapter===1?'rock_golem':'skeleton_captain'});
 return events.sort((a,b)=>a.time-b.time);
}
export const EFFECTS={haste:{name:'射速',percent:20,color:'#518caa'},range:{name:'射程',percent:20,color:'#697aa4'},damage:{name:'伤害',percent:25,color:'#bd8144'}};
export const WEAPONS={sword:'飞剑',lightning:'雷符',flame:'炎符'};
export const gateLabel=g=>g.effect?EFFECTS[g.effect].name+' +'+EFFECTS[g.effect].percent*g.value+'%':g.op==='+'&&g.value<0?'−'+Math.abs(g.value):g.op+g.value;
export function plan(stage){
 const s=STAGES[stage-1],events=[];
 const add=(time,kind,x,extra={})=>events.push({time,kind,x,...extra});
 const gate=str=>str.includes(':')?{effect:str.split(':')[0],value:Number(str.split(':')[1]),op:'+'}:{op:str[0],value:Number(str.slice(1).replace('!','')),shoot:str.endsWith('!')};
 for(const [time,left,right,split=240,drift=0]of s.gates)add(time,'gates',240,{left:gate(left),right:gate(right),split,baseSplit:split,drift});
 const patterns={left:[80,116,152,188],right:[292,328,364,400],row:[80,160,240,320,400],column:[214,240,266],rails:[132,348],pincer:[90,390,130,350,170,310],wedge:[240,204,276,168,312,132,348],diagonal:[88,148,208,268,328,388],reverse:[388,328,268,208,148,88]};
 for(const [time,pattern,n]of s.waves){const xs=patterns[pattern];for(let i=0;i<n;i++)add(time+i*(pattern==='column'?.34:.24),'enemy',xs[i%xs.length],{hp:stage<=3?[11.2,15.4,18.3][stage-1]:14+stage*1.1,damage:1+(s.chapter===2?1:0),type:CHAPTERS[s.chapter].enemy,sway:stage>=9?(pattern==='pincer'?12:20):0,pattern});}
 for(const [time,x,loot,amount]of s.chests)add(time,'chest',x,{hp:loot==='trap'?52+stage*4:loot==='weapon'?16+stage*1.6:14+stage*.8,loot,amount:amount??(loot==='rescue'?5:0),delivery:'break'});
 for(const [time,x]of s.rocks)add(time,'rock',x,{radius:30});
 for(const [time,x]of s.mages||[])add(time,'enemy',x,{hp:38+stage*2,damage:2,type:'mage',sway:stage>=14?16:0});
 add(s.bossTime,'boss',s.bossX,{hp:stage<=3?[112,155,195][stage-1]:s.boss?[360,550,760][s.chapter]:90+stage*13,damage:s.boss?4:2,type:s.chapter===2?'dragon':s.chapter===1?'rock_golem':'skeleton_captain',sway:stage>=7?(s.boss?42:26):0,burst:s.boss?3:stage>=14?2:0,bulletSpeed:118+stage*2,shotInterval:s.boss?3.3:3.8});
 return events.sort((a,b)=>a.time-b.time);
}
