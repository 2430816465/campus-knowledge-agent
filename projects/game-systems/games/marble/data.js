export const W=360,H=560,ORIGIN={x:180,y:516},BALL_R=7,SPEED=430,MAX_FLIGHT=6;
export const TUNING={energyMax:100,energyHit:12,energyPerShot:48,strongDamage:1.25,strongHits:2,echoRefunds:2,adHelpLimit:2,challengeHp:1.1,challengeReward:1.25,challengeRewardCap:52,crystalDamage:6,targetDamage:4};
export const TIERS=[{id:'fine',name:'精良',color:'#7ddbb7',chance:.70},{id:'rare',name:'稀有',color:'#80c9ff',chance:.25},{id:'epic',name:'史诗',color:'#e5a4ff',chance:.05}];
export const RELICS=[
 {id:'prism',icon:'◇',name:'棱镜核心',effect:['借墙后下次直击 +3','借墙后下次直击 +5','借墙后下次直击 +7'],values:[3,5,7],hint:'与你的回响纹章配合'},
 {id:'echoMark',icon:'⌁',name:'回声印记',effect:['第 3 次直击 +4','第 3 次直击 +6','第 3 次直击 +8'],values:[4,6,8],hint:'配合锐光核心持续命中'},
 {id:'ember',icon:'✺',name:'余烬核心',effect:['首次击杀溅射 2','首次击杀溅射 3','首次击杀溅射 4'],values:[2,3,4],hint:'配合破阵首击收割敌群'},
 {id:'hunter',icon:'➶',name:'猎手印记',effect:['残血直击 +2','残血直击 +3','残血直击 +4'],values:[2,3,4],hint:'配合爆裂火花处理残血'},
 {id:'guardian',icon:'⬟',name:'守护结晶',effect:['三连击护盾 +1','三连击护盾 +2','三连击护盾 +3'],values:[1,2,3],hint:'与守护薄膜叠加'},
 {id:'seed',icon:'✚',name:'复苏种子',effect:['本房首次击杀回血 1','本房首次击杀回血 2','本房首次击杀回血 3'],values:[1,2,3],hint:'与旅途补给配合续航'}
];
export const ENEMIES={
 guard:{name:'普通守卫',hp:18,period:2,damage:3,color:'#e5a968',symbol:'◆'},
 shield:{name:'盾甲守卫',hp:24,period:3,damage:4,color:'#a5bed0',symbol:'▣'},
 statue:{name:'蓄力石像',hp:22,period:3,damage:7,color:'#ed8065',symbol:'✦'},
 priest:{name:'治疗祭司',hp:16,period:2,heal:6,color:'#9bdab5',symbol:'✚'},
 boss:{name:'遗迹守卫',hp:70,period:2,damage:6,color:'#dcaaf2',symbol:'✥'}
};
export const UPGRADES=[
 {id:'core',icon:'✦',name:'锐光核心',effect:'直接伤害 +2',hint:'每次命中都受益'},
 {id:'first',icon:'✧',name:'破阵首击',effect:'每发首次直击追加 5 伤害',hint:'适合优先击杀'},
 {id:'echo',icon:'⌁',name:'回响纹章',effect:'每发首次碰墙或柱后，下次直击追加 4 伤害',hint:'借墙蓄能'},
 {id:'pierce',icon:'➜',name:'穿透符文',effect:'每发首次非正面盾命中后直穿',hint:'穿过敌阵'},
 {id:'burst',icon:'✺',name:'爆裂火花',effect:'每发首次直击，使 78 范围内其他敌人受 3 伤害',hint:'敌人聚集时使用'},
 {id:'elastic',icon:'∞',name:'弹性护符',effect:'每发碰撞上限 8 → 10',hint:'延长弹跳路线'},
 {id:'film',icon:'⬟',name:'守护薄膜',effect:'回收后抵挡紧接敌方阶段的 2 伤害',hint:'稳定防御'},
 {id:'supply',icon:'✚',name:'旅途补给',effect:'立即恢复 4 生命，进入新房再恢复 2',hint:'持久探险'}
];
const e=(type,x,y,extra={})=>({type,x,y,r:type==='boss'?32:22,...extra});
const wall=(x,y,w,h)=>({x,y,w,h});
const col=(x,y,r=19)=>({x,y,r});
export const ROOMS={
 R01:{name:'正面试射',hint:'从法阵向上拖动，在空白处松手发射',enemies:[e('guard',180,224,{hp:10})]},
 R02:{name:'借墙一下',hint:'侧墙可以把弹珠送回守卫身边',enemies:[e('guard',100,204)],walls:[wall(139,254,82,16)],target:{x:285,y:344,r:15}},
 R03:{name:'双点回响',hint:'留意错位目标的反弹路径',enemies:[e('guard',127,220),e('guard',241,172)]},
 R04:{name:'盾的侧面',hint:'正面盾减伤，寻找左右两侧',enemies:[e('shield',180,196,{facing:Math.PI/2})],columns:[col(112,292,18),col(248,292,18)]},
 R05:{name:'谁先出手',hint:'重击将至，先选目标',enemies:[e('guard',112,215,{clock:2}),e('statue',250,184,{clock:1})]},
 R06:{name:'点亮通道',hint:'先触碰开关，门会永久开启',enemies:[e('guard',180,141)],walls:[wall(34,237,113,16),wall(213,237,113,16)],door:wall(147,237,66,16),switch:{x:113,y:302,r:16},crystal:{x:276,y:188,r:16}},
 R07:{name:'石柱绕行',hint:'清怪或绕路拿宝箱，自行选择',enemies:[e('guard',173,174)],columns:[col(107,290,22),col(257,290,22)],chest:{x:290,y:205,r:19}},
 R08:{name:'先断治疗',hint:'祭司会治疗损血最多的友方',enemies:[e('guard',113,231),e('guard',247,231),e('priest',277,144)],crystal:{x:180,y:323,r:16}},
 R09:{name:'重击将至',hint:'选择先处理重击或盾甲',enemies:[e('statue',112,203),e('shield',251,202,{facing:Math.PI/2})],columns:[col(181,286,18)]},
 R10:{name:'开门之后',hint:'开启通路，再压制祭司',enemies:[e('priest',248,143),e('guard',91,191)],walls:[wall(32,247,130,16),wall(221,247,107,16)],door:wall(162,247,59,16),switch:{x:116,y:297,r:16},target:{x:281,y:339,r:15}},
 R11:{name:'守卫大厅',hint:'Boss 居中，两侧有宽反弹空间',enemies:[e('boss',180,178)],columns:[col(71,279,18),col(289,279,18)]},
 R12:{name:'回响祭坛',hint:'石柱能改变进攻角度',enemies:[e('boss',180,171)],columns:[col(107,265,23),col(253,265,23)]},
 E02:{name:'精英 · 双盾侧击',hint:'先借共鸣靶突破盾阵',enemies:[e('shield',107,216,{facing:Math.PI/2}),e('statue',252,170,{clock:2})],columns:[col(179,318,16)],target:{x:291,y:363,r:15}},
 E04:{name:'精英 · 祭司守阵',hint:'爆裂晶体可以打断治疗阵线',enemies:[e('shield',104,238,{facing:Math.PI/2}),e('priest',255,153,{clock:2}),e('statue',259,260,{clock:3})],crystal:{x:186,y:257,r:16}}
};
export const STAGES=[['R01','R02'],['R03','R04','R05'],['R06','R07'],['R08','R09','R10'],['R11','R12']];
export const FIRST_SEQUENCE=['R01','R03','R06','R08','R11'];
export function random(seed){let x=seed>>>0;return ()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296}};
export function sequence(seed,first=false){if(first)return [...FIRST_SEQUENCE];const next=random(seed);return STAGES.map(group=>group[Math.floor(next()*group.length)])}
export function choices(seed,owned,roomIndex){const next=random((seed+Math.imul(roomIndex+1,977))>>>0),pool=UPGRADES.filter(x=>!owned.includes(x.id));for(let i=pool.length-1;i>0;i--){const j=Math.floor(next()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}return pool.slice(0,3).map(x=>x.id)}
export function relicChoices(seed,pity){const next=random((seed^0x9e3779b9)>>>0),pool=RELICS.map(x=>x.id);for(let i=pool.length-1;i>0;i--){const j=Math.floor(next()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}const offer=pool.slice(0,3).map(id=>{const roll=next();return {id,tier:roll<.70?0:roll<.95?1:2}});if(pity>=4&&!offer.some(x=>x.tier===2))offer[Math.floor(next()*3)].tier=2;return offer}
