class_name FrameworkScreen
extends RefCounted
## Functional controls for the approved framework. The visual rebuild is separate.
const TABS = ["阵容","仙府","弟子","挑战","灵兽","本命","装备","卡池"]
static func choice(g: Control, parent: Node, key: String, options: Array) -> String:
	if options.is_empty(): return ""
	var saved: Dictionary = g.get_meta("framework_selection",{})
	var value: String = str(saved.get(key,options[0].id))
	if not options.any(func(x: Dictionary) -> bool: return str(x.id) == value): value = str(options[0].id)
	saved[key] = value; g.set_meta("framework_selection",saved)
	var select := OptionButton.new()
	select.custom_minimum_size = Vector2(0,38); select.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(select)
	for i in range(options.size()):
		select.add_item(str(options[i].get("name",options[i].id)))
		if str(options[i].id) == value: select.select(i)
	select.item_selected.connect(func(i: int) -> void:
		var current: Dictionary = g.get_meta("framework_selection",{})
		current[key] = str(options[i].id); g.set_meta("framework_selection",current); g._render())
	return value
static func action(g: Control, parent: Node, caption: String, command: String, args: Dictionary = {}) -> Button:
	return g.button(parent,caption,func() -> void: g._framework_action(command,args))
static func heroes(s: Dictionary) -> Array:
	var options: Array = []
	for id in s.owned: options.append({"id":id,"name":GameData.character(id).name+" · Lv.%d" % int(s.owned[id].level)})
	return options
static func build(g: Control, parent: Node, tab: String) -> void:
	var s: Dictionary = g.state()
	var head: HBoxContainer = g.row(parent)
	g.label(head,"玩法框架 · "+tab,21,GameTheme.GOLD)
	g.button(head,"主页",g._go.bind(5)); g.button(head,"百宝",g._systems_page)
	var tabs := GridContainer.new(); tabs.columns = 4; parent.add_child(tabs)
	for name in TABS:
		var b: Button = g.button(tabs,name,g._framework_page.bind(name),name == tab)
		b.custom_minimum_size = Vector2(0,32); GameTheme.style_tab(b,name == tab)
	match tab:
		"阵容": _party(g,parent,s)
		"仙府": _estate(g,parent,s)
		"弟子": _disciples(g,parent,s)
		"挑战": _challenges(g,parent,s)
		"灵兽": _pets(g,parent,s)
		"本命": _life(g,parent,s)
		"装备": _gear(g,parent,s)
		"卡池": _pools(g,parent,s)
static func _party(g: Control, parent: Node, s: Dictionary) -> void:
	g.label(parent,"府主固定上阵 · 神仙 %d/4 · 战力 %d" % [s.team.size(),GameEquipment.team_power(s)],16,GameTheme.JADE)
	var names: Array[String] = ["府主"]
	for id in s.team: names.append(GameData.character(id).name)
	g.label(parent,"  ＋  ".join(names),16)
	var cid: String = choice(g,parent,"hero",heroes(s))
	if not cid.is_empty():
		var h: HBoxContainer = g.row(parent)
		g.button(h,"移出" if cid in s.team else "上阵",func() -> void:
			var team: Array = g.state().team.duplicate()
			if cid in team: team.erase(cid)
			elif team.size() < 4: team.append(cid)
			else: g.toast("四名神仙位置已满，先移出一位"); return
			g._framework_action("setTeam",{"ids":team}))
		action(g,h,"升级","upgradeCharacter",{"id":cid})
		action(g,h,"升星","fwGodStar",{"id":cid})
		g.button(h,"重置",func() -> void: g._framework_reset("resetCharacter",cid,s.owned[cid].spent))
		g.label(parent,"星级 %d · 同名碎片 %d；升级用灵石，升星用碎片与灵材" % [int(s.framework.godStars.get(cid,0)),int(s.framework.petShards.get("god:"+cid,0))],13,GameTheme.MUTED)
	var preset: String = choice(g,parent,"preset",[{"id":"0","name":"方案一"},{"id":"1","name":"方案二"},{"id":"2","name":"方案三"}])
	var index: int = int(preset)
	var record: Variant = s.framework.presets[index]
	var field := LineEdit.new(); field.placeholder_text = "输入方案名"; field.max_length = 16
	field.text = str(record.name) if record is Dictionary else "方案%d" % (index+1); parent.add_child(field)
	var h: HBoxContainer = g.row(parent)
	g.button(h,"保存当前配置",func() -> void: g._framework_action("saveTeamPreset",{"slot":index,"name":field.text}))
	action(g,h,"应用方案","applyTeamPreset",{"slot":index})
	g.label(parent,"三个免费方案；保存阵容、分支、辅助配置和两套装备。缺项时保留可用部分，战斗中不能替换快照。",13,GameTheme.MUTED)
	g.button(parent,"府主修炼方向",g._systems_page.bind("009"))
static func _estate(g: Control, parent: Node, s: Dictionary) -> void:
	var categories: Array[String] = []
	for key in ["xp","stone","herb","material","consumable"]: categories.append("%s %d/%d" % [g.RESOURCE_NAMES.get(key,"成品"),GameEstateProduction.occupied(s,key),GameEstateProduction.capacity(s,key)])
	g.label(parent,"待领仓（含已预留批次）\n"+"　".join(categories),13,GameTheme.JADE)
	var buildings: Array = []
	for b in s.buildings:
		if not b.get("pendingPlacement",false): buildings.append({"id":b.id,"name":GameEconomy.spec(b.type).name+" · "+b.id+" Lv.%d" % int(b.level)})
	var id: String = choice(g,parent,"building",buildings)
	if not id.is_empty():
		var b: Dictionary = GameEconomy.building(s,id)
		var plan: Dictionary = s.framework.estate.plans[id]
		var recipes: Array = [{"id":"stop","name":"停止后续批次"}]
		if not GameEconomy.extension_rules().passiveRates.get(b.type,{}).is_empty(): recipes.append({"id":"passive","name":"基础长期生产"})
		for recipe in GameEconomy.available_recipes(s,b.type): recipes.append({"id":recipe.id,"name":recipe.name})
		var selected: String = choice(g,parent,"recipe:"+b.type,recipes)
		g.label(parent,"计划 %s · %s · 效率 %.0f%%" % [plan.recipe,plan.paused if not plan.paused.is_empty() else "运转",GameEstateProduction.efficiency(s,b)*100],13)
		if plan.active is Dictionary: g.label(parent,"当前批次余 %d 秒 · 实付 %s\n下批计划 %s" % [maxi(0,int((plan.active.readyAt-s.lastTime)/1000)),str(plan.active.paid),plan.nextRecipe],13)
		var h: HBoxContainer = g.row(parent)
		action(g,h,"安排长期计划","estatePlan",{"id":id,"recipe":selected})
		g.button(h,"取消当前批次",func() -> void:
			var current: Variant = g.state().framework.estate.plans[id].active
			if not current is Dictionary: g.toast("没有正在生产的批次"); return
			g._framework_reset("estateCancel",id,current.paid))
		action(g,h,"升级","upgradeBuilding",{"id":id})
		var host_options: Array = [{"id":"","name":"不设主持"}]+heroes(s)
		var host: String = choice(g,parent,"host",host_options)
		g.label(parent,"本类主持："+str(s.framework.estate.hosts.get(b.type,"未委任"))+"；可正常参战",13)
		action(g,parent,"委任本类所有建筑主持","estateHost",{"id":id,"hero":host})
	var h: HBoxContainer = g.row(parent)
	action(g,h,"集中领取仓库","claimAll")
	g.button(h,"建造与扩地",g._go.bind(0))
	action(g,h,"刷新空订单","estateOrdersRefresh")
	for order in s.framework.estate.orders:
		var card: VBoxContainer = g.card(parent,"仙府订单 "+order.receiptId,"交付 %s → 获得 %s · %s" % [str(order.need),str(order.reward),order.status])
		if order.status == "offered": action(g,card,"接取","estateOrderAccept",{"id":order.id})
		elif order.status == "accepted": action(g,card,"手动交付","estateOrderDeliver",{"id":order.id})
static func _disciples(g: Control, parent: Node, s: Dictionary) -> void:
	g.label(parent,"按建筑类别组成事务队，支持同类所有建筑。\n初始资质固定；实际工作增长专长，候补不产出。",14,GameTheme.JADE)
	action(g,parent,"招收新弟子","progDiscipleRecruit")
	var options: Array = []
	for d in s.progression.disciples: options.append({"id":d.id,"name":d.name+" Lv.%d" % int(d.level)})
	var id: String = choice(g,parent,"disciple",options)
	if id.is_empty(): return
	var d: Dictionary = GameData.named(s.progression.disciples,id)
	g.label(parent,"资质 %s\n专长 %s · 普通等级实付 %s" % [str(d.aptitude),str(d.expertise),str(d.levelSpent)],14)
	var h: HBoxContainer = g.row(parent)
	action(g,h,"升级","progDiscipleTrain",{"id":id})
	g.button(h,"重置等级",func() -> void: g._framework_reset("fwResetDisciple",id,d.levelSpent))
	action(g,h,"解锁" if d.locked else "锁定","fwDiscipleLock",{"id":id,"value":not d.locked})
	var posts: Array = [{"id":"reserve","name":"候补（不工作）"}]
	var types: Array = []
	for b in s.buildings:
		if not b.type in types:
			types.append(b.type)
			posts.append({"id":b.type,"name":GameEconomy.spec(b.type).name+"事务队"})
	var post: String = choice(g,parent,"post",posts)
	action(g,parent,"安排事务队","estateAssign",{"worker":id,"type":post})
	g.label(parent,"每类名额%d人；工作加成由同类生产建筑共享。\n当前事务队：%s" % [GameEstateProduction.team_limit(s),str(s.framework.estate.teams)],13,GameTheme.MUTED)
	g.button(parent,"事务与发掘",g._systems_page.bind("041"))
static func _challenges(g: Control, parent: Node, s: Dictionary) -> void:
	var c: Dictionary = s.framework.challenges
	var kind: String = choice(g,parent,"challenge-kind",[{"id":"story","name":"主线章节"},{"id":"material","name":"材料秘境"},{"id":"set","name":"神仙套装秘境"},{"id":"tower","name":"镇妖塔"},{"id":"beast","name":"讨伐凶兽"},{"id":"mountain","name":"每周仙山"}])
	var diffs: Array = []
	for i in range(1,13): diffs.append({"id":str(i),"name":"难度 %d" % i})
	var difficulty: int = int(choice(g,parent,"difficulty",diffs))
	var args: Dictionary = {"kind":kind,"difficulty":difficulty}
	if kind == "story": g.label(parent,"第%d章 · 节点%d/12；后续章节复用现有敌组并逐章提高属性" % [int((s.framework.storyNode-1)/12)+1,int((s.framework.storyNode-1)%12)+1],14)
	if kind == "material":
		args.type = choice(g,parent,"material",GameFramework.rules().materials)
		g.label(parent,"本类免费领取 %d/6 · 每日05:00补2次\n已解锁扫荡难度%d；零次数仍能实际挑战" % [int(c.materialCharges[args.type]),int(c.materialUnlocks.get(args.type,0))],14)
		action(g,parent,"扫荡一次（使用1次领取）","challengeSweep",{"type":args.type,"difficulty":difficulty})
		g.label(parent,"激励广告：本地版未接入SDK，当前不可用",12,GameTheme.MUTED)
	if kind == "set":
		args.dungeon = int(choice(g,parent,"set-dungeon",[{"id":"0","name":"秘境一 · 前两套"},{"id":"1","name":"秘境二 · 中两套"},{"id":"2","name":"秘境三 · 后两套"}]))
		g.label(parent,"体力 %d/120 · 每6分钟恢复1 · 领取胜利装备消耗20\n不限挑战次数；没有扫荡或离线直接发装" % int(c.stamina),14)
		action(g,parent,"补充40体力（每日限3次）","challengeStaminaBuy")
		g.button(parent,"连续真实挑战（仅前台，失败或体力不足停止）",func() -> void:
			g.framework_auto_set = true; g.framework_auto_args = args.duplicate()
			g._framework_action("challengePrepare",args))
	if kind == "tower": g.label(parent,"本周第%d层 · 历史最高%d层\n周一05:00重开，跳层周期奖励与永久首破分开" % [int(c.towerFloor),int(c.towerHistory)],14)
	if kind == "beast":
		g.label(parent,"今日最高单次伤害 %d；不累加多场" % int(c.beastBest),14)
		var h: HBoxContainer = g.row(parent)
		for threshold in [1000,5000,10000]: action(g,h,"%d档奖励" % threshold,"challengeBeastChest",{"threshold":threshold})
	if kind == "mountain":
		if c.mountain == null:
			action(g,parent,"开启当前周行程","challengeMountainStart"); return
		var run: Dictionary = c.mountain
		g.label(parent,"归属%s · 节点%d/5 · %s\n本轮增益 %s" % [run.week,int(run.node),run.status,str(run.boons)],14)
		if run.status == "choice":
			var h: HBoxContainer = g.row(parent)
			for route in [["battle","普通"],["elite","精英"],["event","机缘"],["boon","增益"]]: action(g,h,route[1],"challengeMountainChoose",{"choice":route[0]})
		if run.status == "complete": action(g,parent,"再探索一轮","challengeMountainStart")
		action(g,parent,"结束本轮行程","challengeMountainEnd")
	var h: HBoxContainer = g.row(parent)
	action(g,h,"恢复战前阵容","fwRecallParty",{"id":kind})
	action(g,h,"继续保存的战斗" if c.pending != null else "进入真实战斗","challengePrepare",args)
	if c.pending != null: action(g,parent,"放弃待完成战斗（不扣领奖次数）","challengeAbandon")
	for record in c.completed.values():
		if not record.get("claimed",true): action(g,parent,"领取胜利奖励 · "+record.id,"challengeClaim",{"id":record.id})
	for mail in s.framework.mail:
		if not mail.claimed: action(g,parent,"补领箱 · "+mail.id,"challengeMailClaim",{"id":mail.id})
static func _pets(g: Control, parent: Node, s: Dictionary) -> void:
	g.label(parent,"随机召唤获得灵兽；主战、助战只提供常驻属性，不增加战斗单位。",14,GameTheme.JADE)
	action(g,parent,"召唤灵兽（240灵石）","fwPetSummon")
	var options: Array = []
	for id in s.progression.families.pets: options.append({"id":id,"name":GameProgression._spec("pets",id).name})
	var id: String = choice(g,parent,"pet",options)
	if id.is_empty(): return
	var record: Dictionary = s.progression.families.pets[id]
	g.label(parent,"Lv.%d · 星级%d · 同名碎片%d\n普通等级实付 %s" % [int(record.level),int(record.stars),int(record.copies),str(record.levelSpent)],14)
	var h: HBoxContainer = g.row(parent)
	action(g,h,"升级","fwPetTrain",{"id":id}); action(g,h,"升星","progStar",{"family":"pets","id":id})
	g.button(h,"重置等级",func() -> void: g._framework_reset("fwPetReset",id,record.levelSpent))
	var h2: HBoxContainer = g.row(parent)
	action(g,h2,"配置主战","progSelect",{"family":"pets","id":id,"slot":"main"})
	action(g,h2,"配置助战","progSelect",{"family":"pets","id":id,"slot":"helper"})
	g.label(parent,"当前配置："+str(s.progression.selected.pets),13)
static func _life(g: Control, parent: Node, s: Dictionary) -> void:
	var options: Array = []
	for id in GameProgression.rules().lifeBranches: options.append({"id":id,"name":GameProgression.rules().lifeBranches[id].name})
	var id: String = choice(g,parent,"life",options)
	g.label(parent,"可收集多件，同时装配一件；当前："+GameProgression.rules().lifeBranches[s.progression.life.branch].name,14,GameTheme.JADE)
	var record: Dictionary = s.framework.lifeArtifacts.get(id,{})
	if record.is_empty(): action(g,parent,"收集本命法宝（1500灵石）","fwLifeAcquire",{"id":id}); return
	g.label(parent,"普通等级%d · 实付%s；原有高阶节点与试炼保留" % [int(record.level),str(record.spent)],14)
	var h: HBoxContainer = g.row(parent)
	action(g,h,"装配","fwLifeSelect",{"id":id}); action(g,h,"灵石升级","fwLifeTrain",{"id":id})
	g.button(h,"重置普通等级",func() -> void: g._framework_reset("fwLifeReset",id,record.spent))
	g.button(parent,"节点、符印与试炼",func() -> void: g.system_view="023"; g.page=8; g._render())
static func _gear(g: Control, parent: Node, s: Dictionary) -> void:
	g.label(parent,"府主炼器装备12部位；神仙各自五件套装。互不共用。\n神仙强化喂养返还80%经验，历史不会重掷。",14,GameTheme.JADE)
	var h: HBoxContainer = g.row(parent)
	g.button(h,"府主炼器与换装",g._systems_page.bind("001")); g.button(h,"神仙套装与强化",g._go.bind(1))
	var options: Array = []
	for item in s.equipment.items:
		if item.get("ownerKind") == "god": options.append({"id":item.id,"name":GameEquipment.display_name(item)+" +%d" % int(item.level)})
	var id: String = choice(g,parent,"correct-gear",options)
	if id.is_empty(): g.label(parent,"实际完成套装秘境并领取，获得第一件神仙套装。",14); return
	var item: Dictionary = GameEquipment.item(s,id)
	var events: Array = []
	for i in range(item.enhancements.size()):
		if item.enhancements[i].type == "roll": events.append({"id":str(i),"name":"强化%d · %s" % [i+1,item.enhancements[i].stat]})
	var index: String = choice(g,parent,"correct-event",events)
	var stats: Array = []
	for sub in item.substats: stats.append({"id":sub.stat,"name":sub.stat})
	var stat: String = choice(g,parent,"correct-stat",stats)
	g.label(parent,"每日1次免费调整已有强化落点；主属性、套装身份和初始词条保持。",13,GameTheme.MUTED)
	if not index.is_empty(): action(g,parent,"把这次增量改到已有词条","fwCorrectArtifact",{"id":id,"event":int(index),"stat":stat})
static func _pools(g: Control, parent: Node, s: Dictionary) -> void:
	var pool: String = choice(g,parent,"pool",[{"id":"standard","name":"常驻神仙"},{"id":"limited-new","name":"当期限定 · 通天教主"},{"id":"limited-rerun","name":"返场限定 · 杨戬"}])
	g.label(parent,"当前：%s\n常驻保底%d · 限定共享保底%d；使用同一种召唤符" % [s.framework.gacha.selected,int(s.pity),int(s.framework.gacha.limitedPity)],14,GameTheme.JADE)
	action(g,parent,"切换卡池","fwSetPool",{"id":pool})
	if s.framework.gacha.selected != "standard": action(g,parent,"本期仙缘兑换限定（最多一份）","fwLimitedExchange")
	g.button(parent,"进入召唤演出",g._go.bind(3))
	g.label(parent,"概率、90抽五星与10抽四星保底沿用已有配置；限定五星必为展示角色。当前两池用已有角色检验框架，不代表新增角色已制作。",13,GameTheme.MUTED)
