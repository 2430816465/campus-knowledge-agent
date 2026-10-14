"""Author original native 0.4 roster data; does not mutate legacy constants."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def d(v,t='selected',**kw):return dict(op='damage',power=v,target=t,**kw)
def s(k,v,t='selected',turns=2,**kw):return dict(op='status',status=k,power=v,target=t,turns=turns,**kw)
def h(v,t='allies'):return dict(op='heal',power=v,target=t,scale='atk')
def sh(v,t='allies'):return dict(op='shield',power=v,target=t,scale='maxHp')
def cl(n=1,t='allies'):return dict(op='cleanse',power=n,target=t)
def cut(v,t='selected'):return dict(op='removeShield',power=v,target=t)
def will(v,t='enemies'):return dict(op='reduceWill',power=v,target=t)
def charge(v,t='enemies'):return dict(op='reduceCharge',power=v,target=t)
def strip(n=1,t='enemies'):return dict(op='stripBuff',power=n,target=t)
def stun(t='enemyLowest'):return dict(op='status',status='stun',power=1,turns=1,target=t,nonBossOnly=True)
def passive(trigger,effects,condition='',limit=1,scope='round'):return dict(trigger=trigger,effects=effects,condition=condition,limit=limit,scope=scope)
rows=[]
def add(id,name,stars,faction,bg,skill,treasure,role,color,target,cd,base,A,B,T,P,visual):
 # Faction is the game's broad classification; allegiance belongs in background.
 if faction in ('西岐','商庭'):
  bg=('西岐 · ' if faction=='西岐' else '朝歌（商庭） · ')+bg
  faction='人间'
 rows.append(dict(id=id,name=name,stars=stars,faction=faction,background=bg,skillName=skill,treasure=treasure,role=role,color=color,target=target,cd=cd,base=base,A=A,B=B,T=T,P=P,visual=visual))
add('yuanshi','元始天尊',5,'阐教','玉虚掌教，以清气统摄万法。','玉清镇岳','三宝玉如意','control','#e9dcad','allEnemies',3,[d(.90,'enemies'),s('defDown',.25,'enemies'),will(3)],[strip(1)],[sh(.10)],[charge(1)],passive('roundStart',[sh(.06,'allyLowest')]),'白金玉冠、白袍、玉如意、太极清光')
add('taishang','太上老君',5,'人教','炼丹养性，将阴阳调息化作护生之道。','太清返元','紫金八卦炉','healer','#a5bac4','allAllies',3,[h(1.20),cl(),s('regen',.30,'allies',scale='atk')],[s('regen',.60,'allies',scale='atk')],[s('burn',.25,'enemies',scale='atk')],[sh(.08)],passive('onActionEnd',[s('atkUp',.15,'self')],'skillOnly'), '白发青袍、拂尘、小型丹炉、紫气')
add('nvwa','女娲',5,'上古','以五色补天之意修复众生伤痕。','五彩补天','补天石','healer','#b2d5b8','allAllies',3,[h(1.60),sh(.12)],[cl(2)],[s('guard',.18,'allies')],[s('regen',.25,'allies',scale='atk')],passive('onAllyDamaged',[sh(.08,'allyLowest')],'allyLow'), '碧金仙衣、五彩灵石、慈和庄严')
add('jieyin','接引道人',5,'西方','于金莲清光中收束纷争，护持同道。','莲台接引','接引宝幢','support','#e4ca8b','allAllies',3,[s('guard',.22,'allies'),s('regen',.40,'allies',scale='atk')],[sh(.12)],[s('weakened',.15,'enemies')],[cl()],passive('onActionEnd',[h(.45,'allyLowest')],'skillOnly'), '金莲素袍、宝幢、莲台清光')
add('zhunti','准提道人',5,'西方','七宝妙树拂去杂念与法障。','七宝拂尘','七宝妙树','control','#adc388','allEnemies',3,[strip(1),d(.95,'enemies')],[stun()],[s('defDown',.20,'enemies')],[cut(.30,'enemies')],passive('onHit',[sh(.05,'self')]), '绿金法袍、七宝妙树、圆形佛光')
add('kongxuan','孔宣',5,'商庭','五色神光映照阵前，破除法宝重护。','五色归光','孔雀翎','striker','#77bca8','allEnemies',3,[cut(.25,'enemies'),d(1.20,'enemies')],[s('weakened',.20,'enemies')],[d(.50,'enemyBack')],[s('defDown',.18,'enemies')],passive('onKill',[s('haste',.10,'allies')]), '孔雀羽披、五色神光、长枪')
add('randeng','燃灯道人',5,'阐教','灵鹫灯火照见生灭，借残焰续战。','琉璃引魂','琉璃灯','sustain','#91a7d4','enemyAny',2,[d(1.50),s('burn',.30,scale='atk'),h(.50,'allyLowest')],[s('weakened',.20)],[h(.60,'allies')],[cut(.35)],passive('onKill',[h(.50,'self')]), '玄金道袍、琉璃灯、幽蓝灵火')
add('luya','陆压',5,'散仙','离火飞虹来去无踪，葫芦中藏凌厉锋芒。','离火飞刀','斩仙葫芦','striker','#e7b675','enemyAny',3,[s('mark',.15),d(2.30)],[d(.65,'selected',condition='targetLow')],[s('burn',.45,scale='atk')],[cut(.50)],passive('onHit',[s('haste',.12,'self')],'targetMarked'), '赤金羽冠、葫芦、白色刃焰')
add('duobao','多宝道人',5,'截教','随身百宝各尽其用，以攻守交替支援同门。','百宝轮转','多宝匣','support','#b1a1d4','enemyAny',2,[d(1.25),sh(.14),s('atkUp',.10,'self')],[cut(.45)],[cl()],[sh(.08,'allyLowest')],passive('onActionEnd',[sh(.05,'allyLowest')],'attackOnly'), '紫金法衣、浮空法宝环、宝匣')
add('jinling','金灵圣母',5,'截教','斗府清辉凝于双刃，以刚锐剑意断敌攻势。','龙虎星裁','龙虎如意','striker','#e4d3a3','enemyAny',2,[d(1.90),will(2,'selected')],[s('defDown',.30)],[d(.65,'enemyBack')],[charge(1,'selected')],passive('onHit',[d(.35,'selected')],'targetDebuffed'), '金白冠饰、龙虎如意、星芒剑气')
add('guangchengzi','广成子',4,'阐教','崆峒修道，翻天一印可破前阵重甲。','番天覆岳','番天印','breaker','#d6a178','enemyFront',3,[cut(.50),d(1.80),will(2,'selected')],[stun('selected')],[s('defDown',.25,'enemyFront')],[d(.35,'selected')],passive('onActionEnd',[sh(.07,'self')],'skillOnly'), '赤白道袍、巨大方印、山纹')
add('chijingzi','赤精子',4,'阐教','阴阳镜照分明，既克敌法亦保同道。','阴阳照鉴','阴阳镜','control','#bd8075','enemyAny',2,[strip(1,'selected'),d(1.45),s('weakened',.20)],[s('defDown',.20)],[h(.80,'allyLowest')],[charge(1,'selected')],passive('onDamaged',[s('weakened',.10,'selected')]), '赭红长袍、黑白阴阳镜、铜光')
add('yuding','玉鼎真人',4,'阐教','专注剑道传承，一剑先破虚妄再斩坚甲。','玉鼎问剑','斩仙剑','striker','#9bc1b1','enemyAny',2,[s('mark',.15),d(1.65)],[d(.50,'selected')],[s('defDown',.22,'enemyBack')],[s('atkUp',.18,'self')],passive('onHit',[sh(.04,'allyLowest')],'targetMarked'), '青玉道衣、长剑、清光玉环')
add('wenshu','文殊广法天尊',4,'阐教','阵桩成圈，善以困敌换取全队调整之机。','遁龙锁阵','遁龙桩','control','#909abf','enemyAny',3,[d(1.15),stun('selected'),will(3,'selected')],[charge(1)],[s('weakened',.18,'enemies')],[sh(.10)],passive('roundStart',[s('guard',.12,'allyLowest',turns=1)]), '靛金道袍、三环遁龙桩、金绳')
add('puxian','普贤真人',4,'阐教','吴钩双剑相随，切断敌阵后排的支援。','吴钩分影','吴钩双剑','striker','#b8add1','enemyAny',2,[d(1.10),d(.55,'enemyBack')],[s('defDown',.24)],[d(.40,'enemyFront')],[cut(.30,'enemyBack')],passive('onKill',[s('atkUp',.15,'allies')]), '白紫仙衣、吴钩双剑、交错剑弧')
add('cihang','慈航道人',4,'阐教','净瓶杨柳拂去灼痛，以甘露护持前行。','甘露净尘','清净琉璃瓶','healer','#b5d5cf','allAllies',2,[cl(2),h(1.05)],[sh(.12,'allyLowest')],[s('regen',.35,'allies',scale='atk')],[s('guard',.12,'allies')],passive('onAllyDamaged',[h(.25,'allyLowest')],'allyDebuffed'), '白青纱衣、净瓶、柳枝、水珠')
add('daoxing','道行天尊',4,'阐教','山间苦修沉稳，降魔杵直取蓄势中的破绽。','降魔折锋','降魔杵','breaker','#99aca0','enemyFront',2,[charge(2,'selected'),d(1.55),s('weakened',.15)],[will(3,'selected')],[sh(.12,'allyFront')],[s('defDown',.20)],passive('onHit',[sh(.06,'self')],'targetDebuffed'), '浅灰青袍、长柄降魔杵、山石纹')
add('qingxu','清虚道德真君',4,'阐教','五火七禽之风席卷敌阵，火势可攻亦可驱邪。','七禽焚阵','五火七禽扇','area','#a5bcc4','allEnemies',3,[d(.90,'enemies'),s('burn',.30,'enemies',scale='atk')],[d(.40,'enemyBack')],[cl()],[s('weakened',.12,'enemies')],passive('onActionEnd',[s('haste',.15,'self')],'skillOnly'), '苍青羽衣、七色羽扇、细碎火羽')
add('huanglong','黄龙真人',4,'阐教','以坚韧守阵，龙气环身为同门承受冲击。','黄龙护脉','龙纹玉佩','tank','#c5b071','allAllies',2,[sh(.13),s('guard',.15,'self')],[s('protect',.40,'allyOthers')],[h(.70,'allyLowest')],[s('atkUp',.15,'allyFront')],passive('onDamaged',[sh(.05,'self')]), '土金道袍、龙纹玉佩、岩金鳞纹')
add('juliusun','惧留孙',4,'阐教','捆仙绳不争锋芒，先束敌手再护己阵。','缚仙收势','捆仙绳','control','#b5a082','enemyAny',3,[stun('selected'),charge(2,'selected'),d(1.10)],[will(4,'selected')],[sh(.12)],[s('weakened',.25)],passive('onActionEnd',[s('guard',.18,'self')],'skillOnly'), '黄褐道袍、金色捆仙绳、结阵光环')
add('wudang','无当圣母',4,'截教','剑光如星，立阵时留一分余地护同门。','无当星阵','青萍副剑','area','#91adae','allEnemies',2,[d(1.00,'enemies'),s('defDown',.12,'enemies')],[sh(.10)],[d(.45,'enemyLowest')],[s('haste',.10,'allies')],passive('roundStart',[sh(.04,'allyBack')]), '墨青法衣、星芒剑阵、清冷银冠')
add('guiling','龟灵圣母',4,'截教','日月珠照耀玄水，厚重守御中暗藏反击。','玄水日月','日月珠','tank','#7ca6a7','allAllies',3,[sh(.20),s('guard',.18,'allyFront')],[cl()],[d(.70,'enemies')],[s('regen',.25,'self',scale='atk')],passive('onDamaged',[d(.45,'selected')]), '玄碧重衣、日月双珠、水纹盾')
add('shiji','石矶娘娘',4,'截教','顽石凝真，不轻言退让，以云帕守住阵脚。','石云护阵','八卦云光帕','tank','#a2aaa3','allAllies',2,[sh(.15),s('guard',.12,'allies')],[s('protect',.40,'allyBack')],[d(.90,'enemyFront')],[cl(1,'allyLowest')],passive('onAllyDamaged',[sh(.04,'allyLowest')],'allyLow'), '青灰石纹衣、八卦云光帕、石晶')
add('wenzhong','闻仲',4,'商庭','太师忠烈统军，双鞭雷声振奋前线。','雌雄雷鞭','雌雄双鞭','commander','#9ba9bd','enemyAny',2,[d(1.35),s('atkUp',.16,'allies'),charge(1,'selected')],[s('mark',.15)],[sh(.10,'allyFront')],[will(2,'selected')],passive('onAllyDamaged',[s('atkUp',.12,'allyLowest')]), '墨甲银发、额心神目、雌雄双鞭')
add('jiangziya','姜子牙',4,'西岐','持旗调兵，把法术与军阵合为破局之策。','杏黄封阵','打神鞭','commander','#d4c6aa','enemyAny',3,[d(1.20),s('mark',.15),sh(.10)],[s('haste',.15,'allies')],[cl(2)],[s('defDown',.20)],passive('roundStart',[s('atkUp',.10,'allyFront',turns=1)]), '鹤发白袍、打神鞭、杏黄旗')
add('shengongbao','申公豹',4,'散仙','擅借雷符扰乱阵势，行险时亦为同伴留后路。','玄雷借势','玄雷符','control','#849a91','allEnemies',3,[d(.85,'enemies'),s('weakened',.20,'enemies')],[strip(1)],[charge(1)],[d(.45,'enemyLowest')],passive('onActionEnd',[sh(.08,'self')],'skillOnly'), '黑绿道袍、虎纹、飘浮雷符')
add('sudaji','苏妲己',4,'商庭','九尾幻术为锋，迷乱视线后显露敌阵破绽。','狐影迷心','九尾绫','control','#c18cac','enemyAny',2,[d(1.20),s('weakened',.25),s('defDown',.15)],[stun('selected')],[s('burn',.25,'enemyBack',scale='atk')],[cut(.30)],passive('onHit',[h(.25,'self')],'targetDebuffed'), '紫红宫衣、白狐纹、轻羽扇')
add('longji','龙吉公主',4,'天庭','雾露收火，清波与鸾声护送同道渡险。','雾露清波','雾露乾坤网','healer','#a6cbd6','allAllies',2,[cl(),h(.90),s('guard',.12,'allies')],[sh(.12,'allyBack')],[s('weakened',.18,'enemies')],[s('haste',.12,'allies')],passive('onAllyDamaged',[h(.30,'allyLowest')],'allyLow'), '水蓝银衣、鸾凤冠、雾露光网')
add('tuxingsun','土行孙',3,'西岐','身形灵巧，借地行绕过重盾袭击后阵。','地行突袭','地行棍','skirmisher','#ba9a75','enemyAny',2,[d(1.50),cut(.20)],[s('defDown',.20)],[sh(.12,'self')],[s('haste',.18,'self')],passive('onActionEnd',[sh(.04,'self')],'attackOnly'), '赭衣矮壮、地行棍、土石飞尘')
add('dengchanyu','邓婵玉',3,'西岐','五色飞石取巧，以精准援护弥补阵中缺口。','五光飞石','五色石','skirmisher','#d4a69c','enemyAny',2,[s('mark',.15),d(1.35)],[s('weakened',.15)],[d(.45,'enemyBack')],[cut(.25)],passive('onHit',[s('haste',.08,'allyLowest')],'targetMarked'), '朱红轻甲、五色飞石、飘带')
add('huangtianhua','黄天化',3,'西岐','少年双锤冲阵，遇强盾更显锐气。','双锤破垒','攒心钉','breaker','#91aab5','enemyFront',2,[cut(.35),d(1.50)],[s('defDown',.20)],[d(.40,'enemyFront')],[will(2,'selected')],passive('onKill',[sh(.08,'self')]), '青黑少年战甲、双锤、金色钉光')
add('yangren','杨任',3,'西岐','掌中慧眼照见伏势，羽扇善解围阵之困。','神目巡阵','五火神焰扇','support','#a8b69c','allEnemies',3,[d(.75,'enemies'),s('mark',.10,'enemies')],[charge(1)],[cl()],[s('burn',.18,'enemies',scale='atk')],passive('roundStart',[h(.20,'allyLowest')]), '青绿儒将袍、手眼纹金扇、清亮目光')
add('zhenglun','郑伦',3,'商庭','哼声震阵，重甲先锋以镇定抵住正面攻势。','白气震魂','降魔杵','tank','#bda777','enemyFront',3,[d(1.10),s('weakened',.18),sh(.18,'self')],[charge(1,'selected')],[s('protect',.40,'allyLowest')],[s('guard',.20,'self')],passive('onDamaged',[d(.25,'selected')]), '铜金重甲、白色气流、降魔杵')
add('chenqi','陈奇',3,'商庭','哈气荡魔，善将守势化为压迫敌阵的反攻。','黄气荡阵','荡魔杵','tank','#b98b77','allEnemies',3,[d(.80,'enemies'),s('weakened',.12,'enemies'),sh(.10,'self')],[s('defDown',.15,'enemyFront')],[sh(.08,'allyFront')],[will(1)],passive('onActionEnd',[s('atkUp',.12,'self')],'guardOnly'), '暗红重甲、黄色气流、荡魔杵')
add('weihu','韦护',3,'阐教','行者持杵守道，援护低血同伴从不迟疑。','金杵护行','韦护降魔杵','support','#a2afbe','enemyFront',2,[d(1.20),sh(.12,'allyLowest')],[cl(1,'allyLowest')],[s('atkUp',.15,'allyLowest')],[charge(1,'selected')],passive('onAllyDamaged',[h(.18,'allyLowest')],'allyLow'), '灰蓝行者装、金降魔杵、素色绳结')
add('wuji','武吉',3,'西岐','樵夫出身的勇士，以最朴实的坚守护住身后人。','樵斧奋勇','青木护盾','guard','#9bad90','enemyFront',2,[d(1.20),s('guard',.18,'self')],[sh(.10,'allyLowest')],[s('defDown',.15)],[h(.35,'self')],passive('onDamaged',[s('atkUp',.10,'self')]), '粗布青袍、短斧、护民木盾')
assert len(rows)==36 and len({r['id'] for r in rows})==36
statusnames={'mark':'锁定','defDown':'破防','weakened':'攻击削弱','burn':'灼烧','regen':'持续恢复','guard':'减伤','haste':'疾行','atkUp':'战令','stun':'牵制','protect':'护卫'}
targetnames={'selected':'选定目标','enemies':'全敌','enemyFront':'敌方前排','enemyBack':'敌方后排','enemyLowest':'最低生命比例敌人','allies':'全队','allyLowest':'最低生命比例友方','self':'自身','allyFront':'己方前排','allyBack':'己方后排','allyOthers':'其他友方'}
def desc(e):
 t=targetnames.get(e['target'],e['target']);p=e['power'];op=e['op']
 if op=='damage':v=f'{t}受到{round(p*100)}%攻击伤害'
 elif op=='status':v=f'{t}获得{statusnames[e["status"]]}{round(p*100)}%（{e["turns"]}回合）' if e['status'] not in ('stun','protect') else f'{t}受到牵制1次行动（首领免疫）' if e['status']=='stun' else f'为{t}分担40%单体伤害（{e["turns"]}回合）'
 elif op=='heal':v=f'为{t}恢复{round(p*100)}%攻击生命'
 elif op=='shield':v=f'{t}获得{round(p*100)}%最大生命护盾'
 elif op=='cleanse':v=f'净化{t}{p}项减益'
 elif op=='removeShield':v=f'削去{t}{round(p*100)}%当前护盾'
 elif op=='reduceWill':v=f'削减{t}{p}点定力'
 elif op=='reduceCharge':v=f'削减{t}{p}层蓄势'
 elif op=='stripBuff':v=f'移除{t}{p}项普通增益'
 else:v=op
 if e.get('scale')=='atk' and op=='status':v+= '，数值以施法者攻击计算'
 if e.get('condition')=='targetLow':v='目标生命低于一半时，'+v
 return v
trig={'roundStart':'轮开始','onHit':'正常直接命中后','onKill':'正常行动击倒后','onDamaged':'受到直接伤害后','onAllyDamaged':'友方受到直接伤害后','onActionEnd':'正常行动结束'}
condition={'skillOnly':'且本次使用神通','attackOnly':'且本次为普攻','guardOnly':'且本次为护持','allyLow':'且有存活友方低于半血','allyDebuffed':'且有友方减益','targetMarked':'且目标被锁定','targetDebuffed':'且目标有减益','':''}
chars=[]
for index,r in enumerate(rows):
 role=r['role'];star=r['stars'];hp=460 if role in ('tank','guard') else 420 if role in ('healer','support','commander') else 390
 atk=98 if role in ('striker','area','breaker','skirmisher') else 84 if role in ('control','sustain','commander') else 75
 defense=32 if role in ('tank','guard') else 22
 speed=96 if role in ('striker','skirmisher') else 82 if role in ('tank','guard') else 90
 factor=1+(star-3)*.08
 p=r['P'];ps=trig[p['trigger']]+condition[p['condition']]+'：'+'；'.join(map(desc,p['effects']))+'。每轮最多一次；追加不递归。'
 c={k:r[k] for k in ['id','name','faction','background','skillName','treasure','color','stars']}
 c.update(rarity={3:'mortal',4:'immortal',5:'divine'}[star],hp=round(hp*factor),atk=round(atk*factor),**{'def':round(defense*factor)},speed=speed+(index%5),attackName=r['name']+'·'+{'striker':'断锋','area':'破阵','breaker':'碎甲','skirmisher':'飞袭','control':'镇法','healer':'清击','support':'灵击','sustain':'焰击','tank':'守击','commander':'令击','guard':'斧击'}[role],skillDescription='；'.join(map(desc,r['base']))+'。',passiveDescription=ps,branches=['专精A：'+'；'.join(map(desc,r['A']))+'。','专精B：'+'；'.join(map(desc,r['B']))+'。'],treasureEffect='一段：神通额外'+'；'.join(map(desc,r['T']))+'。',fx='expansion-'+r['id'],portraitIndex=index+14,portraitPath='res://assets/portraits/'+r['id']+'-premium.webp',avatarPath='res://assets/avatars/'+r['id']+'-premium.webp',visualBrief=r['visual'],combatRole=role,skill={'target':r['target'],'multiplier':next((e['power'] for e in r['base'] if e['op']=='damage'),1),'cooldown':r['cd'],'turns':2,'triggerLimit':1,'effect':'native-config:'+r['id'],'fx':'expansion-'+r['id'],'shape':r['skillName']+'独立法形','trajectory':r['visual'],'beats':[0,160,330]},combat={'skillEffects':r['base'],'branchA':r['A'],'branchB':r['B'],'treasureEffects':r['T'],'passive':p})
 chars.append(c)
# Deliberately separate expansion from golden base constants. Engine/UI aggregate via GameData.
result={'version':'v0.4.0','description':'原创洪荒封神群像扩展，36位角色均有真实原生神通、被动、双分支与法宝效果。','characters':chars}
(ROOT/'data/roster-expansion.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
(ROOT/'docs/combat/roster-design.json').write_text(json.dumps([{'id':c['id'],'name':c['name'],'stars':c['stars'],'role':c['combatRole'],'background':c['background'],'skill':c['skillDescription'],'passive':c['passiveDescription'],'branches':c['branches'],'treasure':c['treasureEffect'],'visualBrief':c['visualBrief']} for c in chars],ensure_ascii=False,indent=2)+'\n')
print('Authored',len(chars),'original extension characters')

(ROOT/'docs/roster-visual-briefs.json').write_text(json.dumps([{'id':c['id'],'name':c['name'],'stars':c['stars'],'visualBrief':c['visualBrief'],'portraitPath':c['portraitPath'],'avatarPath':c['avatarPath']} for c in chars],ensure_ascii=False,indent=2)+'\n')
