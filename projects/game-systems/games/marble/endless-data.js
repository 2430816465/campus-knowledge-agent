export const ENDLESS={width:640,height:360,origin:{x:320,y:344},line:324,startEnemies:36,maxEnemies:1000,maxBalls:32,maxMain:8,leakDamageCap:3,pushbackFree:2,pushbackAds:2,pushbackRatio:.5,freezeUses:2,freezeTurns:2,flight:7.2,speed:540,fxCap:160,soundCap:40};
export const RARITIES=[{name:'普通',color:'#b2becd',weight:60,points:1},{name:'精品',color:'#58c7ff',weight:27,points:2},{name:'史诗',color:'#cf89ff',weight:10,points:4},{name:'传说',color:'#ffc45c',weight:3,points:6}];
export const EVOLUTIONS={
 net:{requires:['chain','split'],effect:'分裂额外连锁3个邻近目标；每发最多2次，不递归。'},
 iceburst:{requires:['frost','fire'],effect:'爆炸击中冻结目标时追加一次碎冰波；每发最多2次，不递归。'},
 rail:{requires:['bounce','core'],effect:'主弹珠碰墙或障碍两次后，下一次Boss直击伤害翻倍，命中后重置。'}
};
export const POWERS=[
 {id:'net',name:'雷网分裂',max:1,hint:'组合进化 · 连锁＋分裂'},
 {id:'iceburst',name:'寒霜冰爆',max:1,hint:'组合进化 · 寒霜＋爆裂'},
 {id:'rail',name:'轨道重炮',max:1,hint:'组合进化 · 回响＋重芯'},
 {id:'extra',name:'弹珠增幅',max:7,hint:'击败首位领主后解锁；仅史诗+1颗、传说+2颗，主弹珠上限8颗。'},
 {id:'fire',name:'爆裂核心',max:18,hint:'直击触发；整发共享爆炸次数，不递归。'},
 {id:'pierce',name:'贯穿弹头',max:18,hint:'每颗主弹珠独立额度，用完后恢复反弹。'},
 {id:'chain',name:'雷电连锁',max:18,hint:'整发共享触发次数；邻近目标跳跃追击，不递归。'},
 {id:'split',name:'碎星分裂',max:12,hint:'整发共享子弹额度，每颗主弹珠最多分裂6颗；子弹对Boss伤害45%。'},
 {id:'bounce',name:'回响弹射',max:18,hint:'6点起底部可反弹两次，飞行限时不变。'},
 {id:'core',name:'重型弹芯',max:18,hint:'集中提升Boss直击伤害，后半段每点收益递减。'},
 {id:'frost',name:'寒霜波纹',max:18,hint:'整发触发一次冻结波，下沉减半。'},
 {id:'heal',name:'生命补给',max:3,hint:'立即回血，每局最多选 3 次。'}
];
export const power=id=>POWERS.find(p=>p.id===id);
export const live=e=>!e.dead&&(e.type!=='boss'||e.hp>0);
export const FIRE_BRANCHES={nova:{name:'余烬新星',hint:'覆盖更广，触发更少',detail:'爆炸半径 +10；整发触发次数减半，向上取整。'},spark:{name:'连环火花',hint:'频繁爆破，范围更小',detail:'爆炸半径降至 75%；整发多触发 2 次。'}};
export function fireStats(n,branch){const [count,radius]=stats('fire',n);return !n?[0,0]:branch==='nova'?[Math.ceil(count/2),radius+10]:branch==='spark'?[count+2,Math.round(radius*.75)]:[count,radius]}
export const BOSS_INTENTS=[{id:'advance',name:'号令推进',counter:'优先清理靠近防线的游魂'},{id:'shield',name:'铸造护甲',counter:'反弹重芯或多次命中击破护甲'},{id:'obstacles',name:'召唤石环',counter:'利用新石环改变反弹路线'}];
export function stageInfo(r){if(r.recoveryUntil>=r.shot)return {id:'recovery',name:'余烬休整',hint:'这一发新增敌人减半'};if(r.room.enemies.some(e=>live(e)&&e.type==='boss'))return {id:'boss',name:'领主交锋',hint:'观察血条下的行动预告'};if(r.nextBoss-r.shot<=2)return {id:'warning',name:'领主将至',hint:`${r.nextBoss-r.shot} 发后降临`};if(r.shot%10===6||r.shot%10===7)return {id:'elite',name:'护盾巡游',hint:'绕侧击碎，或用间接伤害破盾'};return {id:'normal',name:'游魂来潮',hint:'寻找反弹与连锁路线'}}
export const gain=(id,tier)=>id==='extra'?[0,0,1,2][tier]:id==='heal'?1:RARITIES[tier].points;
export const nextPower=(id,n,tier)=>Math.min(power(id).max,n+gain(id,tier));
export const stats=(id,n)=>({extra:1+Math.max(0,Math.min(7,Math.floor(n))),fire:[Math.ceil(n/3),18+3*Math.min(8,n)+Math.max(0,n-8)],pierce:n,chain:[Math.ceil(n/4),2+Math.min(8,n)+Math.floor(Math.max(0,n-8)/2)],split:n,bounce:n,core:12+4*Math.min(12,n)+Math.max(0,n-12)*2,frost:28+2*n}[id]);
export function volleyLimits(powers,branch=null){const main=stats('extra',powers.extra||0),bonus=main-1,fire=stats('fire',powers.fire||0)[0]+bonus,chain=stats('chain',powers.chain||0)[0]+bonus;return {fire:powers.fire?(branch==='nova'?Math.ceil(fire/2):branch==='spark'?fire+2:fire):0,chain:powers.chain?chain:0,split:powers.split?powers.split+Math.min(6,bonus):0,frost:powers.frost?1:0,net:powers.net?2:0,iceburst:powers.iceburst?2:0};}
export function offerEffect(id,n,tier,powers={},branch=null){if(EVOLUTIONS[id])return EVOLUTIONS[id].effect;const to=nextPower(id,n,tier),a=stats(id,n),b=stats(id,to),before={...powers,[id]:n},after={...powers,[id]:to},label=`强化 +${to-n} 点${to===power(id).max?'（达到上限）':''}；`;if(id==='heal')return `立即恢复 ${[1,2,3,5][tier]} 生命`;if(id==='extra')return `弹珠 +${b-a} 颗；每发 ${a} → ${b} 颗${b===8?'（达到上限）':''}`;
 if(id==='fire'){const x=fireStats(n,branch),y=fireStats(to,branch);return `${label}每发爆炸 ${volleyLimits(before,branch).fire} → ${volleyLimits(after,branch).fire} 次；半径 ${n?x[1]:0} → ${y[1]}`;}
 if(id==='chain')return `${label}每发连锁 ${volleyLimits(before).chain} → ${volleyLimits(after).chain} 次；每次 ${n?a[1]:0} → ${b[1]} 个目标`;
 return label+{pierce:`每颗主弹珠穿透 ${a} → ${b} 次`,split:`整发子弹额度 ${volleyLimits(before).split} → ${volleyLimits(after).split}；单颗主弹珠最多6颗`,bounce:`额外反弹 ${a} → ${b} 次${to>=6?'；底部可反弹 2 次':''}`,core:`Boss 直击伤害 ${a} → ${b}`,frost:`每发一次冻结，半径 ${n?a:0} → ${b}，下沉减半`}[id];}
const pixelIcons={
 extra:['01100010','10010111','10010010','01100000','00001100','00010010','00010010','00001100'],
 fire:['00010000','00110000','00110100','01111100','01111110','11111110','01111100','00111000'],
 pierce:['00011111','00000011','00000101','00001001','00010000','00100000','01000000','10000000'],
 chain:['00011100','00111000','01110000','11111110','00011100','00111000','01110000','01100000'],
 split:['10000001','11000011','01100110','00111100','00011000','00011000','00011000','00011000'],
 bounce:['11111111','00110000','00110000','01111000','01101100','11000110','10000011','00000010'],
 core:['00011000','00111100','01100110','11011011','11011011','01100110','00111100','00011000'],
 frost:['10011001','01011010','00111100','11111111','11111111','00111100','01011010','10011001'],
 heal:['01100110','11111111','11111111','11111111','01111110','00111100','00011000','00000000'],
 net:['11000011','01100110','00111100','11111111','11111111','00111100','01100110','11000011'],
 iceburst:['10011001','01111110','00111100','11111111','01111110','00111100','01100110','10000001'],
 rail:['00011111','00000011','00000111','00001110','00011100','00111000','01110000','11100000']
};
export const powerIcon=id=>`<svg viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true">${(pixelIcons[id]||pixelIcons.core).flatMap((row,y)=>[...row].map((bit,x)=>bit==='1'?`<rect x="${4+x*2}" y="${4+y*2}" width="2" height="2" fill="currentColor"/>`:'')).join('')}</svg>`;
export function pressure(shot){
 const middle=Math.max(0,shot-20),late=Math.max(0,shot-55),surge=Math.max(0,shot-75);
 return {target:Math.min(960,ENDLESS.startEnemies+shot*3+middle*8+late*12),
  spawnMin:Math.round(10+shot*.65+middle*.55+late*2.3),spawnDepth:Math.min(205,80+shot*.65+middle*.65),
  drop:Math.min(90,8+shot*.065+Math.max(0,shot-25)*.12+late*.75+surge*.65),
  bossHp:Math.round(85+shot*3+Math.max(0,shot-30)**2*.65+Math.max(0,shot-60)**2*1.8),
  bossArmor:Math.min(120,12+Math.max(0,shot-20)*1.2),bossRush:Math.min(28,3+Math.max(0,shot-30)*.2),
  bossDrop:shot<55?.85:1.05};
}
export const BOSS_FORMS=[
 {id:'knight_black',name:'黑甲领主'},
 {id:'rock_golem',name:'符岩巨像'},
 {id:'archmage',name:'暮影法师'},
 {id:'dragon',name:'翡翠翼龙'}
];
export const bossInterval=spawns=>Math.max(10,16-spawns);
export const xpThreshold=level=>18+8*(level-1)+(level-1)**2;
export const volleyXP=raw=>Math.min(45,raw<=24?raw:24+Math.floor((raw-24)*.18));
export const rulesEndless=`<h2>弹珠 · 无尽守线</h2><p><b class="rule-section-title">怎样瞄准与守线</b>横屏拖动瞄准，上方180°自由调整，松手发射。初始1颗弹珠、10点生命，白色游魂一击即碎。齐射后敌人下沉，游魂越线扣1生命，领主扣3生命；每轮下沉的总伤害最多3点。瞄准下方威胁，利用障碍反弹与群伤清理密集区域。</p><p><b class="rule-section-title">经验与选卡</b>前两次经验选卡提供明确的群伤选项。击败首位领主后，弹珠增幅才进入候选池，且仅有史诗和传说品质。每次齐射前24点原始经验全额获得，后续按18%计入，每发最多45经验；溢出的原始经验不计入。已获得的经验可累计，升级需求逐级增加。经验选卡至少间隔3发，同一发最多一次经验或领主馈赠；待发放的馈赠保留。铭刻和主动额外选卡不消耗经验。</p><p><b class="rule-section-title">品质概率与补给</b>普通60%（银）· 精品27%（蓝）· 史诗10%（紫）· 传说3%（金），每张独立抽取，领主馈赠同概率。常规能力分别获得1／2／4／6强化点；弹珠增幅史诗增加1颗、传说增加2颗，主弹珠上限8颗；卡面显示实际前后变化。所有品质均能免费获得。生命补给按品质恢复1／2／3／5生命，每局最多3次。</p><p><b class="rule-section-title">弹珠与群伤上限</b>爆裂、连锁和分裂的触发额度由整次齐射共享；额外弹珠增加部分额度，子弹不复制群伤能力。贯穿和回响仍分别强化每颗主弹珠。主弹珠最多8颗，总弹珠最多32颗，子弹最多碰撞6次；主弹珠碰撞额度为22＋回响点数，回响6点起底部可反弹2次。飞行硬上限7.2秒，子弹对领主直击伤害45%，间接伤害不递归。</p><p><b class="rule-section-title">能力组合进化</b>连锁＋分裂、寒霜＋爆裂、回响＋重芯分别解锁雷网分裂、寒霜冰爆、轨道重炮候选；符合条件的领主奖励及每第3次常规选卡保证出现一个可用进化。雷网、冰爆每发分别最多2次；重炮需要累计2次墙或障碍反弹，下次领主直击翻倍并重置。寒霜整发最多触发一次冻结波，只减缓范围内敌人的下沉。</p><p><b class="rule-section-title">爆裂铭刻</b>爆裂达到3点后，免费铭刻一次且本局不能更换：余烬新星半径＋10，整发爆炸额度减半向上取整；连环火花半径为75%，整发爆炸额度＋2。铭刻不改变品质概率。</p><p><b class="rule-section-title">游魂与领主</b>每击破8个游魂，对场上领主造成6点震荡伤害（可被护甲吸收），每发最多8次；震荡不触发爆炸、连锁或额外震荡。每发同时补足场上目标数量并维持最低新增数量；场上硬上限1000，后期新增、生成纵深和下沉速度继续增长。领主首次第15发，之后依次间隔15、14、13、12、11、10发，此后每10发出现。独立按发射次数计数，已有领主存活、被击败或越线均不推迟下一位。前期生命和推进放缓，第55发后游魂新增与下沉加速，第75发后进一步加压，领主生命后期加速增长。每存活3发按可见预告轮流推进、铸甲、召唤石环，护甲随进度增强但上限120，下次动作解除。击杀领主后的一发新增敌人减半。</p><p><b class="rule-section-title">障碍与护盾</b>石环3次、棱镜5次、合金柱8次反弹后消失；障碍不下沉且最多12个。每十发的第7、8发为护盾巡游，护盾游魂最多6个：侧背面可一击击碎，正面拦截；间接伤害第一次破盾，第二次击碎。</p><p><b class="rule-section-title">免费帮助与可选广告</b>每局可免费重选一次。每第3次常规／领主选择，可选模拟广告提升一张能力卡一档，先显示确定收益，传说和进化不升档。每局有2次免费全敌击退，免费用完后可选模拟广告再使用2次，两类次数独立保存。只在发射前使用，所有存活敌人含领主向地图顶部退回当前位置的一半，顶部保留角色半径；不回血、不重置领主预告、不移动障碍。全体冻结与额外三选一独立：冻结每局2次，每次连续2发停止下沉并暂停领主行动，冻结期间不可叠加；额外三选一每局1次。各帮助入口还受合集统一限制：每局最多完成2次模拟广告、间隔2分钟、每日最多6次；取消或失败不发放帮助、不消耗次数，可重试。难度、命中及抽卡概率不根据广告行为改变。</p><p><b class="rule-section-title">收益与设置</b>基础冒险币每局最多40；追加收益最多12。能力、声音及可选帮助在右上角设置中展开，战斗查看设置时暂停。</p>`;
