import {SKILLS,PARTNERS,SUMMONS,WALLS,CORES,monsterById,UPGRADE_EXTRAS} from './data.js';
const entry=(id,title,lines,tip='')=>({id,title,lines,tip});
export const TUTORIALS=[
 entry('combat','你守城，勇者负责攻击',['连弩和开局法术都会自动攻击，优先拦截最靠近城门的敌人。','按住战场拖动，只改变连弩瞄准；松手恢复自动索敌。','怪物碰到城门或远程施法会损伤耐久。耐久归零才算失守。'],'先观察敌群，再用守护灵解围。教学期间战斗暂停。'),
 entry('choice','升级时，选一项就好',['击破魔物获得经验，经验条满后暂停战斗，随机出现三项能力。','新技能增加一种自动攻击，最多携带五项；强化与分支改善已有技能。','这些选择只在本夜生效。针对当前敌群，补范围伤害、控制或单体伤害。'],'没有固定必选项；同类伤害强化相加，不会每次乘倍。'),
 entry('branches','分支有前置，也有取舍',['贯通箭 → 裂矢 → 爆裂箭：先拿前置，后续抽选才会出现下一项。','燃火箭、霜纹箭、雷鸣箭与裂矢互斥；巨型火球与连发火球互斥。','穿透箭每经过一名敌人伤害衰减 15%；齐射新增箭矢的伤害为 65%。'],'符合前置的能力才进入随机池；先想好这一夜的路线。'),
 entry('elements','看弱点，别只堆攻击',['火焰造成燃烧；寒霜减速并可通过分支冻结；雷电短暂麻痹。','弱点元素造成 1.65 倍伤害；抗性元素只承受 30% 伤害。护甲只抵挡物理。','首领减速较弱、麻痹最长 0.45 秒；图鉴注明的冻结或击退免疫依然生效。'],'遇到铁盾选雷电，游魂选奥术；控制不能代替伤害。'),
 entry('reactions','技能联动，改变清场方式',['冰火裂变：先用寒霜长矛与极寒冻结冻住敌人，再用火焰命中融冰爆破。','霜纹导雷：对已减速魔物施放雷电，传导给附近两名敌人。','反应需要先抽到对应分支；每名目标冷却 3 秒，反应伤害不会再次触发反应。'],'引力聚怪 → 地雷引爆 → 霜焰封路，也是一条可选路线。首领控制免疫仍然生效。'),
 entry('boss','最后一波，有首领',['每夜最后一波会出现首领。首领还会召唤援军，不能只顾清小怪。','暮夜领主弱雷电、黑甲统领弱奥术、焰翼古龙弱寒霜。','留意城门耐久与守护灵冷却；首领的控制免疫可在图鉴查看。'],'第 5、10 夜等精英夜有十二波，普通夜十波。'),
 entry('revive','失守后，还有一次重整',['每夜可免费重整一次，恢复城门最大耐久的 60%。','敌阵后退并短暂眩晕，已选技能和波次保留；守护灵冷却保留。','第二次失守只能结算。失败也按击破数给材料，下一夜前可以继续养成。']),
 entry('rewards','战果用来准备下一夜',['首通给更多符印，胜利获得金币、书页、矿石、装备与符石。','城门剩余耐久超过 80% 得三星，超过 40% 得两星，其余一星；一星也能解锁下一夜。','奖励已自动保存；回到补给领取完成的委托，再到装备与研习提升。'],'掉落装备进入背包，需要穿戴；不会自动替换你的选择。'),
 entry('gear','装备怎么变强',['六个部位共同增加攻击和城门耐久，阶级、品质、强化都会影响强度。','一键穿戴比较装备的基础强度；换装时转移较高强化等级，不必从零强化。','普通和精良一孔，稀有和史诗两孔，传说三孔。分解未穿戴低品质装备可得到矿石。']),
 entry('gems','符石负责改变打法',['符石只能放进指定部位，同部位不能重复镶嵌同类符石；点击已镶嵌符石可卸下。','三颗同类、同品质且未镶嵌的符石才能合成。品质越高，多数属性加成越大。','齐射与穿透每颗固定加一；孔位变少时，多余符石回到背包，不会消失。'],'穿透适合密集敌列，齐射适合宽敌阵，坚城与减伤适合保住星级。'),
 entry('research','研习是永久成长',['连弩每级基础攻击 +2，影响法术与伙伴；城门每级基础耐久 +50。','法术研习每级基础伤害 +6%，同类等级加成相加；强化前会显示材料费用。','金币共用、矿石用于工事与装备、书页用于法术和伙伴，优先补当前短板。'],'局外成长永久保存；战斗中无法调整装备或研习。'),
 entry('cores','符印决定开局法术',['选择一个符印，开局自动携带对应法术，并增加对应元素伤害 12%。','余烬带火球，霜月带长矛，雷鸣带穿刺，星河带射线。','解锁只花一次符印；之后可免费切换，下一夜生效。'],'符印是开局路线，仍可在战斗中抽到其他法术。'),
 entry('allies','伙伴、守护灵和城门各做什么',['伙伴按周期自动协战，以箭矢、法术或治疗生效，不需要点击。','守护灵需要你按右下角按钮召唤，冷却 45 秒，是解围手段。','城门的特殊效果自动触发；三类位置各选一种，出战下一夜生效。'],'可点击每一项的“作用教学”，查看实际效果。'),
 entry('supplies','补给和委托',['补给箱消耗游戏内符印，每箱一件装备、一颗符石；最多十箱必出史诗装备。','装备概率：普通 40%、精良 35%、稀有 18%、史诗 6%、传说 1%；史诗以上会重置保底。','委托奖励需要手动领取。先解锁适合的伙伴或符印，也可攒符印再开箱。'],'补给没有真实付费。符石品质随据点进度解锁更高档掉落。'),
 entry('endless','无尽魔潮怎样结算',['守住第二夜后解锁。敌人耐久和攻击随波次继续增长，每五波出现首领。','无尽没有最终胜利；通过暂停菜单结束并结算，或失守后结算。','击破与完成波次决定材料，空局退出没有奖励；至少推进到第三波且击破十名才获得掉落。']),
 entry('preparation','新章节，先备战',['第二章开局多一次能力选择，第三章多两次，帮助构筑应对新的敌种。','先选完备战能力，魔潮才推进；这些能力仍然只在本夜生效。','每夜先来步卒与兽兵，后续波次逐步加入盾卫、术士等特殊敌人。']),
 entry('save','离开也能接着守',['暂停可保存回到据点，下次继续同一波、同一组敌人和已选能力。','每两秒、升级抽选、召唤和结算都会自动保存。教学与暂停期间战斗不推进。','本机存档不跨设备；设置里可导出备份，也能导入本游戏存档。']),
 ...SKILLS.filter(x=>x.id!=='bolt').map(x=>entry('skill-'+x.id,x.name+'怎么用',[x.desc,'学会后自动施放，底部图标的阴影表示剩余冷却；不需要点技能图标。',({fire:'火球伤害为基础攻击的 3.3 倍；爆炸额外波及附近敌人，燃烧持续 3 秒。',ice:'长矛伤害为基础攻击的 2.1 倍，最多穿透四名敌人；冻结需要极寒冻结分支。',lightning:'雷光伤害为基础攻击的 3.2 倍，贯穿一列敌人；雷光分支可打邻近敌人。',beam:'每 0.45 秒造成基础攻击的 1.8 倍伤害，持续 2 秒；适合集中处理首领。',rock:'滚石伤害为基础攻击的 3.8 倍，碾压并击退；击退免疫者只受伤害。',blizzard:'法阵持续 4 秒，每 0.45 秒造成基础攻击的 0.55 倍伤害并减速。',wind:'风刃伤害为基础攻击的 2.4 倍，在边缘反弹；反弹后可再次命中旧目标。',meteor:'落点预警 0.8 秒后爆炸，造成基础攻击的 6 倍范围伤害。',familiar:'精灵追猎 5 秒，每 0.45 秒造成基础攻击的 0.75 倍伤害，目标额外承受 25% 伤害。',chain:'闪电伤害为基础攻击的 2.3 倍，依次攻击附近最多四个目标。',gravity:'符阵持续 3.5 秒，每秒把普通魔物拉近 55 距离；拖动瞄准可指定落点。配合陨星、火场和地雷清群。',ward:'结界持续 4 秒，最多拦截 3 发穿过结界的敌方法术。每次反射基础攻击的 1.5 倍奥术伤害，近战仍会伤城门。',trap:'地雷武装需 1 秒，武装后范围内 3 名敌人触发；否则 6 秒后自动炸开。爆炸伤害为基础攻击的 4 倍。',flame:'火场持续 4 秒，每 0.45 秒造成基础攻击的 0.7 倍伤害并附加燃烧。'})[x.id]],'基础倍率还会受研习、分支、符石和敌人抗性影响。')),
 ...PARTNERS.map(x=>entry('partner-'+x.id,x.name+' · 自动协战',[x.desc,'伙伴不占五个技能栏位，伤害独立计算，不继承连弩的齐射、元素箭和分裂分支。','伙伴升级永久保存；出战选择在下一夜生效。'])),
 ...SUMMONS.map(x=>entry('summon-'+x.id,x.name+' · 手动解围',[x.desc,x.id==='golem'?'震击伤害为基础攻击的 4.2 倍。敌群逼近时使用，让击退和减伤一起发挥作用。':'吐息伤害为基础攻击的 5.5 倍。敌群集中时使用，争取冻结期间的输出时间。','按右下角按钮或空格释放。效果结束后，按钮继续显示剩余冷却。'],'冷却未好不能召唤；不是持续跟随攻击的伙伴。')),
 entry('wall-stone','灯火石墙 · 城门耐久',['初始城门没有额外攻击或冻结效果。','耐久成长来自工事、装备和符石；归零时失守。','解锁后可切换荆棘或霜纹城门，下一夜生效。']),
 ...WALLS.filter(x=>x.id!=='stone').map(x=>entry('wall-'+x.id,x.name+' · 自动防守',[x.desc,'只对已经接近城门的敌人触发，伤害为基础攻击的两倍。','城门效果不需要点击；耐久成长来自工事、装备和符石。'])),
];
export const tutorialById=Object.fromEntries(TUTORIALS.map(x=>[x.id,x]));
export function nextTutorial(p,view,s,tab){
 if(!p.settings.guides)return null;
 const unseen=id=>!p.tutorials.includes(id)&&tutorialById[id];
 const menus={equipment:tab==='gems'?'gems':'gear',research:'research',allies:'allies',supplies:'supplies',codex:'elements'};
 if(menus[view])return unseen(menus[view])?.id||null;
 if(view==='result')return unseen('rewards')?.id||null;
 if(view!=='battle'||!s)return null;
 if(s.status==='defeated')return unseen('revive')?.id||null;
 if(s.status==='choice'){
  if(s.stage>=11&&s.wave===0&&unseen('preparation'))return 'preparation';
  if(unseen('choice'))return 'choice';
  if(s.choices.some(c=>UPGRADE_EXTRAS.find(x=>x.id===c.id&&(x.requires||x.requiresSkill||x.excludes)))&&unseen('branches'))return 'branches';
  return null;
 }
 if(s.status!=='playing')return null;
 if(unseen('combat'))return 'combat';
 if(s.mode==='endless'&&unseen('endless'))return 'endless';
 if(s.enemies.some(e=>e.hp>0&&e.y>370)&&s.summonCooldown<=0&&unseen('summon-'+s.summon))return 'summon-'+s.summon;
 if(s.enemies.some(e=>monsterById[e.type].boss)&&unseen('boss'))return 'boss';
 if(s.enemies.some(e=>{const d=monsterById[e.type];return d.armor||d.resist;})&&unseen('elements'))return 'elements';
 if(s.wave>=2&&unseen('partner-'+s.partner))return 'partner-'+s.partner;
 if(s.time>3&&s.wallKind!=='stone'&&unseen('wall-'+s.wallKind))return 'wall-'+s.wallKind;
 if(s.time>2&&s.upgrades&&(s.upgrades['thermal-shock']||s.upgrades['storm-conduct'])&&unseen('reactions'))return 'reactions';
 if(s.time>2){const skill=Object.keys(s.abilities).find(id=>unseen('skill-'+id));if(skill)return 'skill-'+skill;}
 return null;
}
