export const WORLD={width:480,height:760,wallY:554,heroY:644};
export const BALANCE_VERSION=2;
export const SAVE_KEY='camp-nightwatch-v1';
export const ELEMENTS={physical:{name:'物理',color:'#f7d397'},fire:{name:'火焰',color:'#ff955c'},ice:{name:'寒霜',color:'#9ee3ef'},lightning:{name:'雷电',color:'#d1b4ff'},arcane:{name:'奥术',color:'#9bd5ae'}};
export const QUALITIES=[{name:'普通',color:'#9eafa7'},{name:'精良',color:'#88c592'},{name:'稀有',color:'#8fc8ee'},{name:'史诗',color:'#c5a1e9'},{name:'传说',color:'#edc675'}];
export const SLOTS=[{id:'helm',name:'头盔'},{id:'armor',name:'胸甲'},{id:'gloves',name:'护手'},{id:'belt',name:'腰带'},{id:'boots',name:'战靴'},{id:'amulet',name:'护符'}];
export const SKILLS=[
 {id:'bolt',name:'符文连弩',element:'physical',unlock:1,desc:'自动连射，拖动可瞄准。穿透与分裂形成箭雨。',cooldown:.62,damage:1.05,icon:'crossbow'},
 {id:'fire',name:'爆裂火球',element:'fire',unlock:1,desc:'火球命中爆炸，强化后留下燃烧地面。',cooldown:4.8,damage:3.3,icon:'fire'},
 {id:'ice',name:'寒霜长矛',element:'ice',unlock:1,desc:'穿透敌阵并减速，可强化冻结与碎冰。',cooldown:4.2,damage:2.1,icon:'ice'},
 {id:'lightning',name:'雷光穿刺',element:'lightning',unlock:1,desc:'一道雷光贯穿整列敌人，短暂麻痹。',cooldown:5.8,damage:3.2,icon:'lightning'},
 {id:'beam',name:'星辉射线',element:'arcane',unlock:2,desc:'锁定单个敌人连续灼射，适合首领。',cooldown:6.5,damage:1.8,icon:'beam'},
 {id:'rock',name:'滚石冲锋',element:'physical',unlock:3,desc:'滚石从城门向外推进，碾压并击退。',cooldown:8,damage:3.8,icon:'rock'},
 {id:'blizzard',name:'霜雪法阵',element:'ice',unlock:4,desc:'在敌群脚下留下寒霜区域，持续伤害与减速。',cooldown:8.5,damage:.55,icon:'snow'},
 {id:'wind',name:'回旋风刃',element:'physical',unlock:5,desc:'风刃斜穿敌群，在场地边缘反弹。',cooldown:6,damage:2.4,icon:'wind'},
 {id:'meteor',name:'陨星坠落',element:'fire',unlock:6,desc:'落点预警后，陨星炸开大片敌群。',cooldown:9,damage:6,icon:'meteor'},
 {id:'familiar',name:'追猎精灵',element:'arcane',unlock:7,desc:'精灵持续追击，给目标附加易伤。',cooldown:9,damage:.75,icon:'familiar'},
 {id:'chain',name:'连锁闪电',element:'lightning',unlock:8,desc:'雷电在附近敌人间跳跃，克制成群魔物。',cooldown:5.5,damage:2.3,icon:'chain'},
 {id:'flame',name:'炼火地带',element:'fire',unlock:9,desc:'点燃敌阵，燃烧造成持续伤害。',cooldown:8,damage:.7,icon:'flame'},
 {id:'gravity',name:'引力符阵',element:'arcane',unlock:6,desc:'在瞄准点布阵，将普通敌人聚拢，方便范围技能清场；首领和岩壳巨人只减速。',cooldown:11,damage:.32,icon:'gravity',role:'聚怪'},
 {id:'ward',name:'折光结界',element:'arcane',unlock:8,desc:'在城门前展开结界，拦截最多 3 发敌方法术并反射给施法者；无法挡住近战。',cooldown:12,damage:1.5,icon:'ward',role:'反射'},
 {id:'trap',name:'焰纹地雷',element:'fire',unlock:10,desc:'在瞄准点布雷，1 秒后武装；3 名敌人进入或 6 秒到时引爆，可借聚怪触发。',cooldown:10,damage:4,icon:'trap',role:'布置'}
];
export const skillRole=id=>({bolt:'连射',fire:'爆破',ice:'穿透控制',lightning:'列阵打击',beam:'单体追击',rock:'击退',blizzard:'区域减速',wind:'反弹',meteor:'预警爆破',familiar:'追踪易伤',chain:'跳跃清群',flame:'持续灼烧',gravity:'聚怪',ward:'反射',trap:'布置'}[id]||'强化');
export const skillById=Object.fromEntries(SKILLS.map(s=>[s.id,s]));
export const MONSTERS=[
 {id:'skeleton',name:'骷髅步卒',hp:90,speed:32,attack:8,radius:14,element:'physical',desc:'成群推进，耐久较低。'},
 {id:'orc_warrior',name:'疾跑兽兵',hp:120,speed:46,attack:10,radius:15,weak:'ice',desc:'移动迅速，寒霜能拖慢冲锋。'},
 {id:'guard_mid',name:'铁盾守卫',hp:210,speed:25,attack:14,radius:18,armor:.42,weak:'lightning',desc:'抵挡物理伤害，畏惧雷电。'},
 {id:'mage_red',name:'余烬术士',hp:145,speed:28,attack:9,radius:15,ranged:true,resist:'fire',weak:'ice',desc:'远程轰击城门，火焰抗性高。'},
 {id:'ghost_warrior',name:'雾影游魂',hp:130,speed:38,attack:9,radius:16,resist:'physical',weak:'arcane',desc:'抵抗普通箭矢，奥术造成额外伤害。'},
 {id:'rock_golem',name:'岩壳巨人',hp:430,speed:22,attack:24,radius:24,armor:.48,immune:'knock',weak:'fire',desc:'不受击退，火焰可破岩壳。'},
 {id:'skeleton_elite',name:'骨刃精英',hp:360,speed:36,attack:18,radius:20,elite:true,desc:'每隔一段时间加速冲锋。'},
 {id:'mage_low',name:'霜袍祭司',hp:190,speed:26,attack:12,radius:17,ranged:true,resist:'ice',weak:'fire',desc:'抵抗寒霜，远程攻击附加压力。'},
 {id:'vampire',name:'暮夜领主',hp:1400,speed:23,attack:28,radius:31,boss:true,immune:'freeze',weak:'lightning',desc:'召唤骷髅，不受完全冻结。'},
 {id:'knight_black',name:'黑甲统领',hp:1800,speed:22,attack:35,radius:32,boss:true,armor:.35,immune:'knock',weak:'arcane',desc:'重甲与冲锋，奥术更有效。'},
 {id:'dragon',name:'焰翼古龙',hp:2400,speed:18,attack:42,radius:38,boss:true,resist:'fire',immune:'freeze',weak:'ice',ranged:true,desc:'喷吐火焰并召唤术士，畏惧寒霜。'}
];
export const monsterById=Object.fromEntries(MONSTERS.map(m=>[m.id,m]));
const chapters=[{name:'林间村口',story:'第一声钟响，魔物已到村口。守住这条路，让村民安心过夜。',boss:'vampire'},{name:'矿道哨站',story:'矿道里的旧封印熄灭了。守住哨站，保护运送符石的队伍。',boss:'knight_black'},{name:'古堡长夜',story:'魔潮源头藏在古堡深处。守到天亮，让封印重新亮起。',boss:'dragon'}];
export const STAGES=Array.from({length:30},(_,i)=>{const chapter=Math.floor(i/10),night=i%10+1;return {id:i+1,chapter:chapter+1,name:`${chapters[chapter].name} · 第${night}夜`,story:chapters[chapter].story,boss:chapters[chapter].boss,waves:night%5===0?12:10,elite:night%5===0,multiplier:1.06**i,attackMultiplier:1+.085*i,types:MONSTERS.filter(m=>!m.boss).slice(0,Math.min(8,2+Math.floor(i/3))).map(m=>m.id)};});
export const CORES=[{id:'ember',name:'余烬符印',skill:'fire',desc:'开局掌握爆裂火球，火焰伤害 +12%。',element:'fire',cost:0,unlock:1},{id:'frost',name:'霜月符印',skill:'ice',desc:'开局掌握寒霜长矛，寒霜伤害 +12%。',element:'ice',cost:90,unlock:3},{id:'storm',name:'雷鸣符印',skill:'lightning',desc:'开局掌握雷光穿刺，雷电伤害 +12%。',element:'lightning',cost:120,unlock:5},{id:'star',name:'星河符印',skill:'beam',desc:'开局掌握星辉射线，奥术伤害 +12%。',element:'arcane',cost:150,unlock:8}];
export const PARTNERS=[{id:'ranger',name:'林间弓手',desc:'每 3 秒自动射箭，造成基础攻击 75% 的物理伤害，可穿透 1 名敌人；每级伤害 +8%，最多 +150%。',cost:0,unlock:1},{id:'witch',name:'霜灯法师',desc:'每 6 秒自动施法，造成基础攻击 125% 的寒霜范围伤害并冻结 1 秒；免疫冻结的首领只减速。',cost:180,unlock:4},{id:'healer',name:'晨光祭司',desc:'每 9 秒恢复城门 2% 耐久并灼射最近魔物；升级提高伤害与治疗，治疗最多 4%。',cost:220,unlock:7}];
export const SUMMONS=[{id:'golem',name:'符石巨像',desc:'手动召唤：全场震击并击退 55 距离，8 秒内城门减伤 40%；冷却 45 秒。岩壳巨人等免疫击退。',cost:0,unlock:1},{id:'dragon',name:'星翼守护灵',desc:'手动召唤：寒霜吐息横扫全场，持续 6 秒冻结普通魔物；冷却 45 秒。免疫冻结的首领只受伤害与减速。',cost:200,unlock:10}];
export const WALLS=[{id:'stone',name:'灯火石墙',desc:'初始城门，耐久成长稳定。',cost:0,unlock:1},{id:'thorn',name:'荆棘壁垒',desc:'每 8 秒对靠近城门的敌人造成物理伤害。',cost:100,unlock:5},{id:'frost',name:'霜纹城门',desc:'每 12 秒冻结城门前的普通敌人。',cost:150,unlock:10}];
export const GEMS=[
 {id:'attack',name:'锐锋石',slot:'helm',desc:'全伤害 +5%',stat:'damage',value:.05},
 {id:'pierce',name:'贯通石',slot:'helm',desc:'主武器穿透 +1',stat:'pierce',value:1},
 {id:'critical',name:'鹰眼石',slot:'helm',desc:'暴击率 +4%',stat:'crit',value:.04},
 {id:'multi',name:'双弦石',slot:'armor',desc:'主武器齐射 +1；额外箭矢造成 65% 伤害',stat:'multi',value:1},
 {id:'health',name:'坚城石',slot:'armor',desc:'城门耐久 +8%',stat:'health',value:.08},
 {id:'guard',name:'守誓石',slot:'armor',desc:'城门减伤 +4%',stat:'guard',value:.04},
 {id:'fire',name:'余烬石',slot:'gloves',desc:'火焰伤害 +12%',stat:'fire',value:.12},
 {id:'burn',name:'焚心石',slot:'gloves',desc:'燃烧每秒追加敌人最大生命 0.35%',stat:'burnPercent',value:.0035},
 {id:'critdamage',name:'破军石',slot:'gloves',desc:'暴击伤害 +15%',stat:'critDamage',value:.15},
 {id:'ice',name:'霜月石',slot:'belt',desc:'寒霜伤害 +12%',stat:'ice',value:.12},
 {id:'duration',name:'凝时石',slot:'belt',desc:'负面状态持续时间 +10%',stat:'duration',value:.1},
 {id:'vulnerability',name:'裂甲石',slot:'belt',desc:'对减速或燃烧目标伤害 +8%',stat:'vulnerability',value:.08},
 {id:'cooldown',name:'疾风石',slot:'boots',desc:'自动技能冷却缩短 5%',stat:'cooldown',value:.05},
 {id:'speed',name:'急弦石',slot:'boots',desc:'主武器射速 +6%',stat:'speed',value:.06},
 {id:'heal',name:'回春石',slot:'boots',desc:'每击破 20 名魔物，恢复城门 0.8% 耐久',stat:'heal',value:.008},
 {id:'lightning',name:'雷鸣石',slot:'amulet',desc:'雷电伤害 +12%',stat:'lightning',value:.12},
 {id:'arcane',name:'星辉石',slot:'amulet',desc:'奥术伤害 +12%',stat:'arcane',value:.12},
 {id:'experience',name:'启明石',slot:'amulet',desc:'击破经验 +8%',stat:'experience',value:.08}
];
export const UPGRADE_EXTRAS=[
 {id:'bolt-pierce',skill:'bolt',name:'贯通箭',desc:'主武器穿透 +1',effect:'pierce',max:4},
 {id:'bolt-multi',skill:'bolt',name:'双弦齐射',desc:'主武器齐射 +1；额外箭矢造成 65% 伤害',effect:'multi',max:3},
 {id:'bolt-split',skill:'bolt',name:'裂矢',desc:'命中后向两侧分裂箭矢',effect:'split',max:1,requires:['bolt-pierce'],excludes:['bolt-fire','bolt-ice','bolt-lightning']},
 {id:'bolt-explode',skill:'bolt',name:'爆裂箭',desc:'箭矢命中时小范围爆炸',effect:'explode',max:1,requires:['bolt-split']},
 ...['fire','ice','lightning'].map(id=>({id:'bolt-'+id,skill:'bolt',name:{fire:'燃火箭',ice:'霜纹箭',lightning:'雷鸣箭'}[id],desc:'主武器转为'+ELEMENTS[id].name+'伤害并附加状态',effect:'element',value:id,max:1,requiresSkill:id,excludes:['bolt-split',...['fire','ice','lightning'].filter(x=>x!==id).map(x=>'bolt-'+x)]})),
 {id:'fire-ground',skill:'fire',name:'余烬火场',desc:'火球爆炸后留下 3 秒火场',effect:'ground',max:1},
 {id:'fire-multi',skill:'fire',name:'连发火球',desc:'每次多发一颗火球（额外火球伤害 70%）',effect:'multi',max:3,excludes:['fire-super']},
 {id:'fire-super',skill:'fire',name:'巨型火球',desc:'火球伤害 +100%，爆炸范围 +40%',effect:'super',max:1,requires:['fire-ground'],excludes:['fire-multi']},
 {id:'ice-freeze',skill:'ice',name:'极寒冻结',desc:'寒霜长矛可冻结普通魔物 1.5 秒',effect:'freeze',max:1},
 {id:'ice-shatter',skill:'ice',name:'碎冰四射',desc:'被冻结魔物击破时释放四枚冰片',effect:'shatter',max:1,requires:['ice-freeze']},
 {id:'ice-multi',skill:'ice',name:'双重霜矛',desc:'每次多发一支长矛（额外长矛伤害 70%）',effect:'multi',max:3},
 {id:'lightning-chain',skill:'lightning',name:'雷光分支',desc:'雷光命中后跳向附近三个敌人',effect:'chain',max:1},
 {id:'lightning-stun',skill:'lightning',name:'深度麻痹',desc:'麻痹时间增加至 1.6 秒',effect:'stun',max:1},
 {id:'beam-duration',skill:'beam',name:'长明射线',desc:'射线持续时间 +1 秒',effect:'duration',max:3},
 {id:'beam-expose',skill:'beam',name:'星痕易伤',desc:'被射线命中的敌人额外承受 25% 伤害',effect:'expose',max:1},
 {id:'rock-multi',skill:'rock',name:'连续滚石',desc:'每次多召唤一块滚石',effect:'multi',max:2},
 {id:'rock-crush',skill:'rock',name:'破城巨岩',desc:'滚石伤害 +60%，体积 +25%',effect:'super',max:1},
 {id:'blizzard-freeze',skill:'blizzard',name:'冰封领域',desc:'法阵中的普通魔物会被短暂冻结',effect:'freeze',max:1},
 {id:'wind-return',skill:'wind',name:'回旋之刃',desc:'风刃反弹次数 +2，飞行时间 +0.8 秒',effect:'bounce',max:2},
 {id:'meteor-multi',skill:'meteor',name:'陨星雨',desc:'每次额外落下一颗陨星',effect:'multi',max:3},
 {id:'familiar-extra',skill:'familiar',name:'双生精灵',desc:'每次额外召唤一只追猎精灵',effect:'multi',max:2},
 {id:'chain-extra',skill:'chain',name:'雷鸣扩散',desc:'闪电额外跳跃三个目标',effect:'chain',max:3},
 {id:'flame-duration',skill:'flame',name:'不熄之火',desc:'炼火地带持续时间 +2 秒',effect:'duration',max:2},
 {id:'thermal-shock',skill:'fire',name:'冰火裂变',desc:'火焰命中冻结目标时融冰，追加一次小范围奥术爆破；每个目标冷却 3 秒。',effect:'reaction',max:1,requiresSkill:'ice',requires:['ice-freeze'],unlock:6},
 {id:'storm-conduct',skill:'lightning',name:'霜纹导雷',desc:'雷电命中减速目标时，传导给附近 2 名魔物；每个目标冷却 3 秒。',effect:'reaction',max:1,requiresSkill:'ice',unlock:6},
 {id:'gravity-release',skill:'gravity',name:'引力斥环',desc:'引力阵结束时向城门外震退普通魔物；首领与岩壳巨人不受位移。',effect:'release',max:1},
 {id:'ward-mend',skill:'ward',name:'反射修缮',desc:'每拦截一发敌方法术恢复城门 1% 耐久；每面结界最多 3 次。',effect:'mend',max:1},
 {id:'trap-frost',skill:'trap',name:'霜焰封路',desc:'地雷引爆后留下 3 秒寒霜地带，减速追兵；需要掌握寒霜长矛。',effect:'terrain',max:1,requiresSkill:'ice'},
 {id:'wind-reap',skill:'wind',name:'回刃收割',desc:'风刃击破敌人时延长飞行 0.5 秒，最多延长 3 次，并恢复一次反弹。',effect:'reap',max:1},
 {id:'wall-heal',name:'紧急修缮',desc:'立即恢复城门 15% 耐久',effect:'heal',max:99},
 {id:'all-power',name:'勇者誓言',desc:'所有伤害 +8%（同类强化相加）',effect:'allDamage',max:8}
];
