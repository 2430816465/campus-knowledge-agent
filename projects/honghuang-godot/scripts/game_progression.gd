class_name GameProgression
extends RefCounted
## Local cultivation transactions. Never grants assets during migration; only commands
## and authoritative battle settlement may award resources. UI previews are read-only.
static var _rules: Dictionary = {}
static var _definitions: Array = []
const COMMANDS = ["progMakeEmbryo","progForge","progFurnaceUpgrade","progForgeFilter","progAutoForge","progEquipShared","progUnequipShared","progRealmTrial","progRealmBreak","progSelectDirection","progDirectionNode","progSaveFormation","progLoadFormation","progVeinTrain","progVeinRoll","progVeinChoose","progAcquire","progTrain","progStar","progSelect","progPetInherit","progPetRebirth","progCraftObject","progObjectTrain","progSocket","progUnsocket","progFuse","progFriendGift","progFriendTalk","progStoryRead","progJobStart","progJobClaim","progRootGrow","progLifeBranch","progLifeNode","progLifeTrial","progMonument","progIdentify","progMountSpirit","progGrottoRestore","progLawInsight","progSourcePlace","progSourceRemove","progSourceExpand","progBodyNode","progBodyTrial","progGatherSeat","progGatherHelp","progHerbCommission","progDiscipleRecruit","progDiscipleTrain","progDisciplePair","progDiscipleGraduate","progDiscipleEvent","progShop","progManagerAuthorize","progManagerRun","progTaskClaim","progFishCatch","progFishTrain","progFishStar","progFishRoll","progFishChoose","progFishInherit","progFishSelect","progObjectLock"]
static func rules() -> Dictionary:
	if _rules.is_empty():
		_rules = GameData.normalize(JSON.parse_string(FileAccess.get_file_as_string("res://data/progression-rules.json")))
		if FileAccess.file_exists("res://data/progression-stories.json"):
			var stories: Variant = GameData.normalize(JSON.parse_string(FileAccess.get_file_as_string("res://data/progression-stories.json")))
			if stories is Dictionary: _rules.stories = stories
	return _rules
static func definitions() -> Array:
	if _definitions.is_empty(): _definitions = GameData.normalize(JSON.parse_string(FileAccess.get_file_as_string("res://data/progression-systems.json")))
	return _definitions
static func definition(id: String) -> Dictionary: return GameData.named(definitions(), id)
const EXTRA_COMMANDS = ["progUnselect","progFamilyLock","progProfile","progRefreshFertile","progGatherChallenge","progFriendSpar","progResumeTrial","progAbandonTrial","progCoreBreakthrough","progDispatchHerbs","progFishUnselect"]
static func handles(name: String) -> bool: return name in COMMANDS or name in EXTRA_COMMANDS
static func _ok(data: Variant = {}) -> Dictionary: return {"ok":true,"error":"","data":data}
static func _fail(error: String) -> Dictionary: return {"ok":false,"error":error,"data":{}}
static func _int(v: Variant, low: int, high: int) -> bool: return (v is int or v is float) and is_finite(float(v)) and float(v) == floor(float(v)) and int(v) >= low and int(v) <= high

static func _action(label: String, cmd: String, args: Dictionary = {}, enabled: bool = true, reason: String = "") -> Dictionary:
	return {"label":label,"cmd":cmd,"args":args,"enabled":enabled,"reason":reason}
static func _choices(values: Array) -> Array:
	var result: Array = []
	for value in values:
		if value is Dictionary: result.append({"id":str(value.id),"name":str(value.get("name",value.id))})
		else: result.append({"id":str(value),"name":{"main":"主位","helper":"助战位","exclusive":"专属位","outfit":"外观","study":"学识","gather":"采集","explore":"探索"}.get(str(value),str(value))})
	return result
static func _select(v: Dictionary, selection: Dictionary, key: String, title: String, choices: Array, fallback: String = "") -> String:
	var value: String = str(selection.get(key,fallback))
	if GameData.named(choices,value).is_empty(): value = str(choices[0].id) if not choices.is_empty() else ""
	v.selectors.append({"key":key,"name":title,"choices":choices,"selectedId":value})
	return value
static func stat_name(key: String) -> String:
	return {"hpPercent":"生命加成","atkPercent":"攻击加成","defPercent":"防御加成","critRate":"暴击率","critDamage":"暴击伤害","comboRate":"连击率","counterRate":"反击率","recoveryRate":"恢复率","critResist":"抗暴击","comboResist":"抗连击","counterResist":"抗反击","openingShield":"开场护盾","skillBonus":"神通增伤","petBonus":"灵兽增效","healBonus":"治疗加成","damageBonus":"伤害加成"}.get(key,key)
static func skill_name(key: String) -> String: return {"spring":"回春","flame":"灵焰","shell":"岩甲"}.get(key,key)
static func effect_text(effect: Dictionary) -> String:
	var text: Array = []
	for key in effect: text.append("%s+%.1f%%" % [stat_name(key),100*float(effect[key])])
	return " · ".join(text)
static func _option(v: Dictionary, id: String, name: String, detail: String = "", owned: bool = true) -> void:
	v.options.append({"id":id,"name":name,"detail":detail,"owned":owned,"selected":false})
static func _finish_view(v: Dictionary, id: String, s: Dictionary) -> Dictionary:
	v.selectedId = id
	if not s.progression.realm.pending.is_empty():
		v.actions.push_front(_action("继续未完成试炼","progResumeTrial"))
		v.actions.append(_action("放弃本次试炼","progAbandonTrial",{"confirm":true}))
	for option in v.options: option.selected = option.id == id
	for action in v.actions:
		action.costText = action_cost(s,action.cmd,action.args)
		if action.reason.is_empty() or action.enabled: action.reason = action.costText
	return v
static func _price(base: Dictionary = {}, mats: Dictionary = {}) -> String:
	var labels: Dictionary = {"stone":"灵石","xp":"修为","material":"灵材","herb":"灵药","ticket":"召唤符","fate":"仙缘"}
	var parts: Array = []
	for key in base:
		if int(base[key]) > 0 and not GameEconomy.free_currency(): parts.append("%d%s" % [int(base[key]),labels.get(key,key)])
	for key in mats:
		if int(mats[key]) > 0: parts.append("%d%s" % [int(mats[key]),rules().materials.get(key,key)])
	var text: String = "无需消耗" if parts.is_empty() else "消耗 "+" + ".join(parts)
	return "测试版货币免扣；" + text if GameEconomy.free_currency() and not base.is_empty() else text
static func action_cost(s: Dictionary, cmd: String, args: Dictionary = {}) -> String:
	var p: Dictionary = s.progression
	var id: String = str(args.get("id",""))
	var n: int = int(args.get("count",1))
	match cmd:
		"progForge": return _price({}, {} if s.has("framework") else {"embryo":1})
		"progMakeEmbryo": return _price({"stone":10*n,"material":3*n})+"；获得%d宝胚" % n
		"progAutoForge": return "基础炼器免费，最多%d次；背包满自动停止" % n
		"progFurnaceUpgrade": return _price({"stone":int(p.furnace.level)*250,"material":int(p.furnace.level)*20})
		"progRealmBreak": return _price({"xp":realm_requirement(s).xp})+"；需通过渡劫"
		"progDirectionNode":
			var lv: int = int(p.direction.levels.get(id,0))+1
			return _price({"stone":lv*100,"xp":lv*120})
		"progVeinTrain": return _price({"xp":80*(int(p.vein.level)+1)},{"veinessence":int(p.vein.level)+1})
		"progVeinRoll": return _price({"stone":80},{"veinessence":2})+"；新结果待确认"
		"progAcquire": return _price(_spec(str(args.get("family","")),id).get("cost",{}))
		"progTrain","progStar":
			var family: String = str(args.get("family",""))
			var record: Dictionary = _record(p,family,id)
			if record.is_empty(): return "先获得培养对象"
			if cmd == "progTrain": return _price({"stone":int(record.level)*35,"xp":int(record.level)*20},{rules().families[family].material:1+int(int(record.level)/5)})
			return _price({"stone":(int(record.stars)+1)*100},{rules().families[family].get("starMaterial",""):(int(record.stars)+1)*3})+" + %d份重复碎片" % (int(record.stars)+1)
		"progPetInherit": return _price({}, {"inheritstone":2})+"；替换持续属性特征，两只灵兽及等级均保留"
		"progPetRebirth": return _price({"stone":300},{"petsoul":5,"inheritstone":3})+"；须10级，等级/星级/投入/技能/内丹全保留"
		"progCraftObject": return _price({"stone":100},{rules().objectKinds.get(str(args.get("kind","")),{}).get("material",""):3})+"；获得1件随机品质器物"
		"progObjectTrain":
			var item: Dictionary = object(s,id)
			return "先获得器物" if item.is_empty() else _price({"stone":50*int(item.level)},{rules().objectKinds[item.kind].material:int(item.level)})
		"progCoreBreakthrough":
			var item: Dictionary = object(s,id)
			return "需选内丹" if item.is_empty() else _price({"stone":200*int(item.quality)},{"coreessence":6*int(item.quality)})+" + 1颗未锁定未嵌入的内丹；目标须%d级，突破品质+1，保留等级与投入" % (5*int(item.quality))
		"progFuse":
			var ids: Array = args.get("ids",[])
			var first: Dictionary = object(s,str(ids[0])) if not ids.is_empty() else {}
			return "消耗后两件同类同级器物及%d灵石；第一件%s" % [100*int(first.get("level",1)),"有%.0f%%概率升一级，失败保留并提高下次成功率" % (100*minf(1.0,0.6+0.1*int(first.get("fusionFailures",0)))) if first.get("kind","")=="gem" else "必定升一级"]
		"progFriendGift": return _price({}, {"friendgift":n})+"；交情+%d" % (n*10)
		"progDispatchHerbs": return _price({"stone":20*args.get("ids",[]).size()})+"；每位仙友90秒后采回%d灵药、3玉露，不占战斗阵容" % (20+int(p.root.level)*2)
		"progRootGrow": return _price({"herb":5*(int(p.root.level)+1)},{"dew":2*(int(p.root.level)+1)})
		"progLifeNode": return _price({"stone":150*(int(p.life.nodes)+1)},{"lifecore":int(p.life.nodes)+1})
		"progMonument":
			return _price({}, {"monumentshard":2})+"；关联藏品仍保留" if not str(args.get("link","")).is_empty() else _price({"stone":500*(int(p.monument.level)+1)},{"monumentshard":3*(int(p.monument.level)+1)})
		"progIdentify": return _price({"stone":120})+"；鉴定当前古宝，不能重复重抽"
		"progMountSpirit": return _price({"stone":100*(int(p.mountSpirits.get(id,0))+1)},{"spiritessence":int(p.mountSpirits.get(id,0))+1})
		"progLawInsight": return _price({"xp":200*(int(p.laws.get(id,0))+1)},{"lawpage":int(p.laws.get(id,0))+1})
		"progSourceExpand": return _price({"stone":200*int(p.source.width)},{"sourcefragment":3*int(p.source.width)})
		"progBodyNode": return _price({"xp":120*(int(p.body.get(id,0))+1)},{"bodypill":int(p.body.get(id,0))+1})
		"progHerbCommission": return "消耗1枚当前丹药；获得90灵石、1仙友礼物、1炼体丹"
		"progDiscipleRecruit": return _price({"stone":150,"herb":5})+"；招收一名随机资质弟子"
		"progDiscipleTrain": return _price({"stone":50*int(GameData.named(p.disciples,id).get("level",1))}) if s.has("framework") else _price({"xp":50*int(GameData.named(p.disciples,id).get("level",1))},{"disciplescroll":1})
		"progDisciplePair": return _price({"stone":100},{"disciplescroll":2})+"；两位弟子都保留"
		"progDiscipleGraduate": return "弟子移入永久出师榜，返还等级+学识数量的传道书；进行中事务须先结算"
		"progShop":
			var offer: Dictionary = GameData.named(rules().shops,id)
			var price: Dictionary = {}
			for key in offer.get("cost",{}): price[key] = int(offer.cost[key])*n
			return _price(price)+"；获得%d份%s" % [n*int(offer.get("amount",1)),rules().materials.get(offer.get("material",""),"")]
		"progFishCatch": return _price({}, {"fishbait":1})+" + 1次垂钓；重复灵鱼转同类鳞片"
		"progFishTrain": return _price({"stone":20*int(p.fish.owned.get(id,{}).get("level",1))},{"fishfood":1})
		"progFishStar":
			var star: int = int(p.fish.owned.get(id,{}).get("stars",0))+1
			return _price({}, {"fishscale":star})+" + %d份同类鳞片；灵鱼保留" % star
		"progFishRoll": return _price({}, {"fishscale":1})+"；新词条待确认"
		"progFishInherit": return _price({}, {"inheritstone":1})+"；只替换词条，不消耗灵鱼"
		"progJobStart","progGrottoRestore":
			var kind: String = str(args.get("kind","grotto"))
			match kind:
				"herbs": return "消耗20灵石；90秒后获得%d灵药、3玉露" % (20+int(p.root.level)*2)
				"excavate": return "消耗40灵石、1遗迹线索；120秒后获得1件待鉴古宝"
				"lawcore": return "消耗3法则残页；先感悟对应法则，90秒后灵核成型"
				"fertile":
					var target: String = str(args.get("target","stone"))
					return "消耗10灵石；60秒后获得%d%s" % [int(p.fertile.points.get(target,0)),{"stone":"灵石","material":"灵材","herb":"灵药"}.get(target,target)]
				"gather": return "无需消耗；120秒后获得120+位置×15修为"
				"disciple": return "消耗25灵石；60秒后获得2传道书和事件材料，提升选择的专长"
				"grotto":
					var lv: int = int(p.grotto.regions.get(str(args.get("target",id)),0))+1
					return _price({"stone":200*lv,"material":20*lv})+"；%d秒后区域恢复一级" % (60*lv)
		"enhanceArtifact":
			var preview: Dictionary = GameEquipment.enhance_preview(s,id,int(args.get("targetLevel",1)))
			return "强化等级已满" if not preview.ok else _price(preview.data.costs)+" + %d灵装精粹" % preview.data.essence
		"salvageArtifacts":
			var preview: Dictionary = GameEquipment.salvage_preview(s,args.get("ids",[]))
			return "分解选中法宝；强化投入80%折算精粹" if not preview.ok else "消耗选中法宝；获得%d灵装精粹" % preview.data.essence
		"progManagerRun": return "按授权执行；采药20灵石/次、炼器1宝胚/次；不花召唤符与仙缘"
		"progRefreshFertile": return "消耗20灵石，刷新待派遣福地；灵石60至120、灵材/灵药12至26，已有事务保留原产出"
		"progFriendSpar": return "无需消耗；当日首次获胜交情+10，失败不扣交情"
		"progGatherChallenge": return "无需消耗；本地实际战斗首次获胜解锁此位置，失败保留原位置"
		"progResumeTrial": return "沿用本次战前阵容与随机结果，不消耗材料"
		"progAbandonTrial": return "本次按失败结束，不发奖励、不扣境界；可重新发起挑战"
		"queueRecipe": return _price(GameData.named(GameEconomy.get_recipes(),str(args.get("recipeId",""))).get("cost",{}))
	return "无需消耗"
static func view(s: Dictionary, system_id: String, selection: Dictionary = {}) -> Dictionary:
	var def: Dictionary = definition(system_id)
	var v: Dictionary = {"id":system_id,"name":def.get("name","培养"),"description":def.get("note",""),"summary":"","notice":"选择培养对象，再查看下方操作及所需材料。","options":[],"selectors":[],"actions":[],"items":[],"selectedId":""}
	if not s.get("progression") is Dictionary:
		v.notice = "培养存档尚未初始化"
		return v
	var p: Dictionary = s.progression
	var now: int = maxi(int(s.get("lastTime",0)),int(p.clock))
	var id: String = str(selection.get("id",""))
	var family_pages: Dictionary = {"008":"abilities","011":"cosmetics","012":"pets","014":"pets","017":"spirits","018":"primordial","022":"collections","028":"mounts","036":"manifestations"}
	if family_pages.has(system_id):
		var family: String = family_pages[system_id]
		var specs: Array = rules().families[family].choices
		if _spec(family,id).is_empty(): id = specs[0].id
		for spec in specs:
			var record: Dictionary = _record(p,family,spec.id)
			_option(v,spec.id,spec.name,"未获得" if record.is_empty() else "等级%d · %d星 · 碎片%d" % [record.level,record.stars,record.copies],not record.is_empty())
		var record: Dictionary = _record(p,family,id)
		var spec: Dictionary = _spec(family,id)
		v.summary = "培养材料：%s %d" % [rules().materials[rules().families[family].material],p.materials[rules().families[family].material]]
		if family == "pets":
			v.notice = "主战与助战仅提供持续属性，不攻击、不触发技能。传承改变常驻属性类型。"
			var support: Dictionary = battle_support(s)
			if not support.is_empty(): v.summary += " · 当前援护系数%.1f%%" % (100*float(support.coefficient))
		elif family != "cosmetics": v.notice = "基础效果："+effect_text(spec.get("effect",{}))+"；等级、星级提高此效果。"
		v.actions.append(_action("获得" if record.is_empty() else "再获一份碎片","progAcquire",{"family":family,"id":id},family != "cosmetics" or record.is_empty(),"已拥有此装扮"))
		if not record.is_empty() and family != "cosmetics":
			v.actions.append(_action("培养至%d级" % (int(record.level)+1),"progTrain",{"family":family,"id":id}))
			v.actions.append(_action("升星","progStar",{"family":family,"id":id},int(record.copies)>int(record.stars),"重复碎片不足"))
		if family != "collections":
			var positions: Array = {"abilities":[spec.get("category","")],"cosmetics":["outfit"],"pets":["helper"] if system_id == "014" else ["main","helper"],"spirits":["1","2","3"],"primordial":["exclusive"],"mounts":["main"],"manifestations":["main"]}[family]
			var slot: String = _select(v,selection,"slot","配置位置",_choices(positions))
			v.actions.append(_action("选择此对象","progSelect",{"family":family,"id":id,"slot":slot},not record.is_empty(),"尚未获得"))
			v.actions.append(_action("下阵此位置","progUnselect",{"family":family,"slot":slot},p.selected[family].has(slot),"位置为空"))
		if family == "pets" and not record.is_empty(): v.actions.append(_action("锁定灵兽" if not record.locked else "解锁灵兽","progFamilyLock",{"family":family,"id":id,"value":not record.locked}))
		if family == "cosmetics":
			v.profile = p.profile.duplicate()
			v.summary = p.profile.name+" · "+p.profile.signature
			v.fields = [{"key":"profileName","name":"府主名字","maxLength":12,"value":p.profile.name},{"key":"signature","name":"名片签名","maxLength":40,"value":p.profile.signature}]
			v.actions.append(_action("保存名片","progProfile",{"name":str(selection.get("profileName",p.profile.name)),"signature":str(selection.get("signature",p.profile.signature))}))
		return _finish_view(v,id,s)
	match system_id:
		"001":
			v.summary = "宝胚 %d · 炉鼎%d级 · 已炼器%d次" % [p.materials.embryo,p.furnace.level,p.furnace.forged]
			v.actions = [_action("免费炼器一次","progForge"),_action("高级炼器","fwAdvancedForge"),_action("制作10枚高级宝胚","progMakeEmbryo",{"count":10})]
			v.notice = "基础炼器无限免费，能出当前阶段最高品质。高级炼器消耗3宝胚保最低品质；分解府主装备稳定获得宝胚。"
		"002":
			v.summary = "炉鼎等级%d / %d" % [p.furnace.level,rules().forgeWeights.size()]
			for rarity in rules().forgeWeights[p.furnace.level-1]: _option(v,rarity,"%s星法宝" % rarity,"概率%s%%" % rules().forgeWeights[p.furnace.level-1][rarity])
			v.actions = [_action("升级炉鼎 · %d灵石 %d灵材" % [p.furnace.level*250,p.furnace.level*20],"progFurnaceUpgrade")]
			v.notice = "炉鼎等级控制品质概率；府主普通装备通过继续炼器、更换成长，不单独强化。"
		"003":
			var slot: String = _select(v,selection,"slot","法宝位置",_choices(GameEquipment.shared_slots()))
			var items: Array = GameEquipment.items(s,{"slot":slot}).filter(func(a: Dictionary) -> bool: return a.get("ownerKind") == "lord")
			if GameData.named(items,id).is_empty(): id = str(items[0].id) if not items.is_empty() else ""
			for item in items: _option(v,item.id,GameEquipment.display_name(item),"%d星%s" % [item.rarity," · 府主使用" if s.equipment.sharedEquipped.get(slot,"")==item.id else ""])
			v.items = items
			v.summary = "府主12个位置 · 背包%d / %d；神仙各有独立五件套" % [s.equipment.items.size(),GameEquipment.rules().inventoryCapacity]
			if not id.is_empty():
				var item: Dictionary = GameEquipment.item(s,id)
				v.actions = [_action("装备给府主","progEquipShared",{"id":id}),_action("锁定" if not item.locked else "解锁","lockArtifact",{"id":id,"value":not item.locked}),_action("分解","salvageArtifacts",{"ids":[id]},not item.locked and not item.favorite and GameEquipment.equipped_by(s,id).is_empty(),"已锁定、收藏或装备")]
			v.actions.append(_action("卸下此位置","progUnequipShared",{"slot":slot},s.equipment.sharedEquipped.has(slot),"此位置为空"))
		"004":
			var rarity: String = _select(v,selection,"rarity","最低保留品质",_choices([3,4,5]),str(p.furnace.filter.rarity))
			var stat_choices: Array = [{"id":"none","name":"不指定词条"}]
			for key in GameEquipment.rules().substatWeights: stat_choices.append({"id":key,"name":GameEquipment.rules().stats.get(key,{"name":key}).name})
			var stat: String = _select(v,selection,"stat","任一指定词条优先保留",stat_choices)
			var gain: String = _select(v,selection,"minGain","评分提升保留阈值",_choices([0,5,15,30,10000]),str(p.furnace.filter.minGain))
			var salvage: String = _select(v,selection,"salvage","低价值结果",[{"id":"no","name":"全部保留"},{"id":"yes","name":"不达标则分解"}],"yes" if p.furnace.filter.salvage else "no")
			v.summary = "宝胚%d；评分为属性加权预估，不决定战斗胜负。" % p.materials.embryo
			v.actions = [_action("保存筛选","progForgeFilter",{"rarity":int(rarity),"stats":[] if stat=="none" else [stat],"minGain":int(gain),"salvage":salvage=="yes"}),_action("在线炼器10次","progAutoForge",{"count":10})]
			v.notice = "品质、词条或评分提升任一达标即保留；锁定、收藏与现有背包物品永不自动分解。"
		"005":
			var req: Dictionary = realm_requirement(s)
			v.summary = "府主%s · 修为%d / %d · 需炉鼎%d级" % [realm_name(s),s.resources.xp,req.xp,req.furnace]
			v.actions = [_action("挑战渡劫","progRealmTrial",{},p.realm.pending.is_empty(),"已有待结算试炼"),_action("突破境界","progRealmBreak",{},req.level in p.realm.passed,"先通过渡劫")]
		"006":
			v.summary = "队伍战力 %d" % GameEquipment.team_power(s)
			var stats: Dictionary = combat_bonus(s)
			for key in stats: _option(v,key,stat_name(key),"%.2f%%" % (100*float(stats[key])))
			v.notice = "连击、反击、恢复和三类抗性最高45%；灵兽只提供持续属性，府主与神仙的养成作用范围分开。"
		"007":
			v.summary = "%s · %d级 · 品质%d" % [rules().veins[p.vein.branch].name,p.vein.level,p.vein.quality]
			v.actions = [_action("培养灵脉","progVeinTrain"),_action("重炼灵脉","progVeinRoll",{},p.vein.pending.is_empty(),"先处理待选结果")]
			if not p.vein.pending.is_empty():
				v.notice = "待选：%s 品质%d；旧灵脉在采用前继续生效。" % [rules().veins[p.vein.pending.branch].name,p.vein.pending.quality]
				v.actions.append(_action("采用新结果","progVeinChoose",{"accept":true}))
				v.actions.append(_action("保留旧结果","progVeinChoose",{"accept":false}))
		"009":
			if not rules().directions.has(id): id = p.direction.selected
			for key in rules().directions: _option(v,key,rules().directions[key].name,"%d节点%s" % [p.direction.levels[key]," · 当前方向" if key==p.direction.selected else ""])
			v.actions = [_action("选择此方向","progSelectDirection",{"id":id}),_action("修炼下一节点","progDirectionNode",{"id":id})]
		"010":
			if not id in ["1","2","3"]: id = "1"
			for key in ["1","2","3"]: _option(v,key,"阵容方案"+key,"已保存" if p.formations.has(key) else "空方案")
			v.actions = [_action("保存当前配置","progSaveFormation",{"id":id}),_action("切换此方案","progLoadFormation",{"id":id},p.formations.has(id),"尚未保存")]
			v.notice = "保存神仙站位与分支、共享法宝、伙伴、神通、镶嵌、本命分支与灵鱼配置。灵脉重炼结果与培养等级始终沿用当前值。"
		"013","016":
			var pets: Array = []
			for key in p.families.pets: pets.append({"id":key,"name":_spec("pets",key).name})
			var target: String = _select(v,selection,"target","目标灵兽",pets)
			if system_id == "013":
				var donor: String = _select(v,selection,"donor","传承来源",pets)
				var preview: Dictionary = inheritance_preview(s,"pets",target,donor)
				v.summary = str(preview.data.get("note",preview.error))
				v.actions = [_action("确认替换传承技能","progPetInherit",{"target":target,"donor":donor,"confirm":true},preview.ok,preview.error)]
			else:
				var into: String = _select(v,selection,"into","转生形态",_choices(rules().families.pets.choices))
				v.notice = "需10级、300灵石、5魂晶、3传承石；保留等级、星级、投入、传承技能和内丹。锁定对象不可转生。"
				v.actions = [_action("确认转生","progPetRebirth",{"id":target,"target":into,"confirm":true},not target.is_empty(),"先获得灵兽")]
		"015","024","027","032","033","034": return _object_view(s,v,system_id,selection)
		"019","020":
			var friends: Array = []
			for key in s.owned: friends.append({"id":key,"name":GameData.character(key).name})
			id = _select(v,selection,"id","仙友",friends)
			var friend: Dictionary = p.friends.get(id,{"affection":0,"chapters":[]})
			v.summary = "交情%d · 故事%d篇" % [friend.affection,friend.chapters.size()]
			if system_id == "019": v.actions = [_action("赠礼1份 · 交情+10","progFriendGift",{"id":id}),_action("今日论道 · 交情+5","progFriendTalk",{"id":id}),_action("与仙友切磋","progFriendSpar",{"id":id})]
			else:
				var chapters: Array = rules().stories.get(id,[])
				for i in range(chapters.size()):
					_option(v,str(i),chapters[i].title,chapters[i].text)
					v.actions.append(_action("阅读："+chapters[i].title,"progStoryRead",{"id":id,"chapter":i},int(friend.affection)>=(i+1)*20,"需要交情%d" % ((i+1)*20)))
				if chapters.is_empty(): v.notice = "此仙友新故事尚待编写；其人物生平保留在神仙图鉴，不用换姓名模板充作新章节。"
		"021","026","037","038","042","030": return _job_view(s,v,system_id,selection,now)
		"023":
			var choices: Array = []
			for key in rules().lifeBranches: choices.append({"id":key,"name":rules().lifeBranches[key].name})
			id = _select(v,selection,"id","形态",choices,p.life.branch)
			v.summary = "当前%s · 节点%d / 20" % [rules().lifeBranches[p.life.branch].name,p.life.nodes]
			v.actions = [_action("采用形态","progLifeBranch",{"id":id}),_action("培养节点","progLifeNode")]
		"025":
			v.summary = "镇府至宝%d级 · 已关联%d藏品" % [p.monument.level,p.monument.links.size()]
			var choices: Array = []
			for key in p.families.collections: choices.append({"id":key,"name":_spec("collections",key).name})
			var link: String = _select(v,selection,"link","关联藏品",choices)
			v.actions = [_action("培养镇府至宝","progMonument"),_action("关联此藏品","progMonument",{"link":link},not link.is_empty(),"先激活藏品")]
		"029":
			var choices: Array = []
			for key in p.families.mounts: choices.append({"id":key,"name":_spec("mounts",key).name})
			id = _select(v,selection,"id","座驾",choices)
			v.summary = "器灵等级%d" % p.mountSpirits.get(id,0)
			v.actions = [_action("培养座驾器灵","progMountSpirit",{"id":id},not id.is_empty(),"先获得座驾")]
		"031","035":
			var specs: Dictionary = rules().laws if system_id == "031" else rules().body
			if not specs.has(id): id = specs.keys()[0]
			for key in specs: _option(v,key,specs[key].name,"等级%d" % (p.laws[key] if system_id=="031" else p.body[key]))
			v.actions = [_action("感悟法则" if system_id=="031" else "培养部位","progLawInsight" if system_id=="031" else "progBodyNode",{"id":id})]
			if system_id == "035": v.actions.append(_action("挑战炼体试炼","progBodyTrial"))
		"039":
			var pills: Array = [{"id":"training","name":"修炼丹"},{"id":"ward","name":"护体丹"},{"id":"heal","name":"回春丹"},{"id":"cleanse","name":"清心丹"}]
			id = _select(v,selection,"id","交付丹药",pills)
			v.summary = "库存%d · 每种每日3次委托" % s.items.get(id,0)
			v.actions = [_action("交付1枚 · 90灵石+礼物+炼体丹","progHerbCommission",{"id":id})]
			for building in s.buildings:
				if building.type in ["garden","alchemy"]:
					v.actions.append(_action("领取已有灵田/丹坊产出","harvestBuilding",{"id":building.id}))
					for recipe in GameEconomy.available_recipes(s,building.type): v.actions.append(_action("安排："+recipe.name,"queueRecipe",{"id":building.id,"recipeId":recipe.id}))
			v.notice = "在仙府建设灵田与丹坊，即可种植灵药、排队炼丹；丹药可用于培养、战斗或交付来访委托。"
		"040","041": return _disciple_view(s,v,system_id,selection)
		"043":
			if GameData.named(rules().shops,id).is_empty(): id = "embryo"
			for offer in rules().shops: _option(v,offer.id,rules().materials[offer.material],"持有%d · 每日限购%d" % [p.materials[offer.material],offer.limit])
			var offer: Dictionary = GameData.named(rules().shops,id)
			v.summary = _price(offer.cost)+" / 份；每日已买%d" % p.shop.get("shop:"+GameEconomy.natural_day(now)+":"+id,0)
			v.actions = [_action("兑换1份","progShop",{"id":id,"count":1}),_action("兑换5份","progShop",{"id":id,"count":5})]
			v.notice = "灵石和灵材沿用旧余额，专用材料独立记账；不使用仙缘或召唤符。"
		"044":
			var names: Dictionary = {"claim":"自动领取","dispatch":"自动派遣采药","forge":"按筛选炼器","recover":"找回未领奖励"}
			for key in names:
				_option(v,key,names[key],"已授权" if p.manager[key] else "未授权")
				v.actions.append(_action(("关闭" if p.manager[key] else "授权")+names[key],"progManagerAuthorize",{"id":key,"value":not p.manager[key]}))
			v.actions.append(_action("执行已授权事务","progManagerRun"))
			v.notice = "在线执行已授权事务；离线不替你领取、派遣或消费。按筛选炼器为免费基础炼器；材料不足便跳过。"
		"045":
			v.summary = "炼器%d · 培养%d · 事务%d" % [p.tasks.forged,p.tasks.trained,p.tasks.claimed]
			v.actions = [_action("炼器10次奖励","progTaskClaim",{"id":"forge-10"}),_action("培养5次奖励","progTaskClaim",{"id":"train-5"}),_action("完成5项事务奖励","progTaskClaim",{"id":"jobs-5"}),_action("每日签到","claimCheckIn")]
			for task in GameData.economy("DAILY_TASKS"): v.actions.append(_action("领取日常："+task.name,"claimDailyTask",{"id":task.id}))
			v.notice = "日常、签到沿用原账本；这里新增自然重合的成长目标，不要求各系统逐日打卡。"
		"046": return _fish_view(s,v,selection,now)
	return _finish_view(v,id,s)

static func _object_view(s: Dictionary, v: Dictionary, system_id: String, selection: Dictionary) -> Dictionary:
	var p: Dictionary = s.progression
	var kind: String = {"015":"petcore","024":"seal","027":"gem","032":"lawcore","033":"chaos","034":"source"}[system_id]
	var items: Array = []
	for item in p.objects:
		if item.kind == kind: items.append(item)
	var id: String = str(selection.get("id",""))
	if GameData.named(items,id).is_empty(): id = str(items[0].id) if not items.is_empty() else ""
	for item in items: _option(v,item.id,rules().objectKinds[kind].name+"·"+str(item.quality)+"品","%d级 · %s%s" % [item.level,stat_name(item.stat)," · 已配置" if not _socket_owner(p,item.id).is_empty() else ""])
	v.items = items
	v.summary = "%s %d件 · %s %d" % [rules().objectKinds[kind].name,items.size(),rules().materials[rules().objectKinds[kind].material],p.materials[rules().objectKinds[kind].material]]
	if kind == "seal": v.actions.append(_action("挑战本命法宝试炼","progLifeTrial"))
	elif kind == "lawcore":
		var laws: Array = []
		for key in rules().laws: laws.append({"id":key,"name":rules().laws[key].name})
		var law: String = _select(v,selection,"law","成型法则",laws)
		v.actions.append(_action("感悟成型 · 等待90秒","progJobStart",{"kind":"lawcore","target":law}))
		for job in p.jobs:
			if job.kind == "lawcore" and not job.claimed: v.actions.append(_action("领取成型灵核","progJobClaim",{"id":job.id},maxi(int(s.lastTime),int(p.clock))>=int(job.readyAt),"尚未成型"))
	else: v.actions.append(_action("合成一件 · 3份材料+100灵石","progCraftObject",{"kind":kind}))
	if kind == "source":
		v.board = p.source.duplicate(true)
		var x: String = _select(v,selection,"x","横坐标",_choices(range(p.source.width)))
		var y: String = _select(v,selection,"y","纵坐标",_choices(range(p.source.height)))
		var rotation: String = _select(v,selection,"rotation","旋转",_choices([0,1,2,3]))
		v.actions.append(_action("摆放碎片","progSourcePlace",{"id":id,"x":int(x),"y":int(y),"rotation":int(rotation)},not id.is_empty(),"先获得本源碎片"))
		v.actions.append(_action("取下碎片","progSourceRemove",{"id":id},p.source.placements.has(id),"此碎片尚未摆放"))
		v.actions.append(_action("扩展盘面","progSourceExpand"))
	else:
		var targets: Array = []
		if kind == "petcore":
			for key in p.families.pets: targets.append({"id":"pet:"+key,"name":_spec("pets",key).name})
		elif kind == "seal": targets = [{"id":"life","name":"本命法宝"}]
		elif kind == "lawcore": targets = [{"id":"lawcore","name":"法则灵核位置"}]
		else:
			for obj in p.objects:
				if obj.kind == ("ancient" if kind == "gem" else "lawcore") and obj.identified: targets.append({"id":obj.id,"name":("古宝" if kind=="gem" else "灵核")+" · "+obj.id})
		var target: String = _select(v,selection,"target","镶嵌对象",targets)
		var slot: String = _select(v,selection,"slot","位置",_choices(["main","helper"] if kind=="lawcore" else ["1","2"]))
		v.actions.append(_action("镶嵌 / 配置","progSocket",{"id":id,"target":target,"slot":slot},not id.is_empty() and not target.is_empty(),"缺少器物或目标"))
		v.actions.append(_action("拆下当前位置","progUnsocket",{"target":target,"slot":slot}))
		if kind in ["petcore","seal","lawcore"]: v.actions.append(_action("培养此器物","progObjectTrain",{"id":id},not id.is_empty(),"先获得器物"))
	if kind == "petcore":
		var core_choices: Array = []
		for core in items:
			if core.id!=id: core_choices.append({"id":core.id,"name":"内丹 · %d级%d品" % [core.level,core.quality]})
		var donor: String = _select(v,selection,"coreDonor","突破消耗内丹",core_choices)
		v.actions.append(_action("内丹突破","progCoreBreakthrough",{"id":id,"donor":donor,"confirm":true},not id.is_empty() and not donor.is_empty(),"需另备一颗内丹"))
	if kind in ["petcore","gem","chaos","source"]:
		var choices: Array = []
		for item in items: choices.append({"id":item.id,"name":item.id+" · "+str(item.level)+"级"})
		var second: String = _select(v,selection,"second","合成材料二",choices,str(choices[1].id) if choices.size()>1 else "")
		var third: String = _select(v,selection,"third","合成材料三",choices,str(choices[2].id) if choices.size()>2 else "")
		v.actions.append(_action("确认三件合成","progFuse",{"ids":[id,second,third],"confirm":true},not id.is_empty() and id!=second and second!=third and id!=third,"请选择三件不同器物"))
		v.notice = "三件同类同级合成；消耗后两件。宝玉首试60%，失败保留第一件，每败+10%，第5次100%；其他类别必成。锁定或已配置者不可消耗。"
	if not id.is_empty(): v.actions.append(_action("锁定" if not object(s,id).locked else "解锁","progObjectLock",{"id":id,"value":not object(s,id).locked}))
	return _finish_view(v,id,s)

static func _job_view(s: Dictionary, v: Dictionary, system_id: String, selection: Dictionary, now: int) -> Dictionary:
	var p: Dictionary = s.progression
	var kind: String = {"021":"herbs","026":"excavate","037":"fertile","038":"gather","042":"disciple","030":"grotto"}[system_id]
	var targets: Array = []
	if kind == "herbs":
		for hero in s.owned: targets.append({"id":hero,"name":GameData.character(hero).name})
	elif kind in ["excavate","disciple"]: targets = _choices(p.disciples)
	elif kind == "fertile": targets = [{"id":"stone","name":"灵石矿脉"},{"id":"material","name":"灵材山林"},{"id":"herb","name":"灵药坡地"}]
	elif kind == "gather": targets = _choices([1,2,3])
	else: targets = [{"id":"mountain","name":"山川"},{"id":"river","name":"河泽"},{"id":"stars","name":"星台"}]
	var target: String = _select(v,selection,"target","派遣对象" if kind in ["herbs","excavate","disciple"] else "区域 / 位置",targets)
	var start_args: Dictionary = {"kind":kind,"target":target}
	if kind == "excavate": start_args.site = _select(v,selection,"site","线索地点",_choices(rules().excavationSites),"mountain")
	if kind == "fertile":
		var workers: Array = []
		for hero in s.owned: workers.append({"id":hero,"name":GameData.character(hero).name})
		start_args.worker = _select(v,selection,"worker","采集仙友",workers)
	v.actions.append(_action("派遣 / 开始","progJobStart",start_args,not target.is_empty(),"缺少可派遣对象"))
	var jobs: Array = []
	for job in p.jobs:
		if job.kind != kind or job.claimed: continue
		jobs.append(job)
		_option(v,job.id,"事务 "+job.id,"可领取" if now>=job.readyAt else "剩余%d秒" % int(ceil((job.readyAt-now)/1000.0)))
	var id: String = str(selection.get("id",""))
	if GameData.named(jobs,id).is_empty(): id = str(jobs[0].id) if not jobs.is_empty() else ""
	v.summary = "进行中%d项；奖励满仓时保留，领取一次后不可重复。" % jobs.size()
	v.jobs = jobs.duplicate(true)
	if not id.is_empty():
		var job: Dictionary = GameData.named(jobs,id)
		v.actions.append(_action("领取所选事务","progJobClaim",{"id":id},now>=job.readyAt,"尚未完成"))
		if kind == "disciple":
			var choice: String = _select(v,selection,"choice","岔路事件",[{"id":"study","name":"研读残卷"},{"id":"gather","name":"采集灵药"},{"id":"explore","name":"探索遗迹"}])
			v.actions.append(_action("选择历练方向","progDiscipleEvent",{"id":job.target,"jobId":id,"choice":choice},str(job.extra.choice).is_empty(),"已作出选择"))
	if kind == "herbs":
		var idle: Array = []
		for hero in s.owned:
			var busy: bool = false
			for job in p.jobs:
				if not job.claimed and job.kind=="herbs" and job.target==hero: busy=true
			if not busy and idle.size()<5: idle.append(hero)
		v.actions.append(_action("批量派遣%d位仙友" % idle.size(),"progDispatchHerbs",{"ids":idle},not idle.is_empty(),"仙友都在采药中"))
		v.actions.append(_action("培育灵根","progRootGrow"))
		v.notice = "神仙法相代行采药，不占用战斗阵容；玉露只用于灵根。灵根当前%d级。" % p.root.level
	elif kind == "gather":
		v.actions.append(_action("选择此共修位置","progGatherSeat",{"seat":int(target)}))
		v.actions.append(_action("今日道友助力","progGatherHelp"))
		v.actions.append(_action("挑战本地道友赢取此位置","progGatherChallenge",{"seat":int(target)},int(target)>1 and not int(target) in p.gather.unlocked,"1号位免费，高阶位首次胜利解锁"))
		v.notice = "本地道友共修演练；1号位受保护，2/3号位须实际战斗获胜。原有挂机修为不受位置影响。"
	elif kind == "fertile":
		v.actions.append(_action("刷新福地 · 20灵石","progRefreshFertile"))
		v.notice = "当前产出：灵石%d、灵材%d、灵药%d；每位仙友同时采集一处福地，刷新不改变已派遣收益。" % [p.fertile.points.stone,p.fertile.points.material,p.fertile.points.herb]
	elif kind == "grotto":
		v.notice = "仙府洞天：山川%d级 · 河泽%d级 · 星台%d级。每次恢复都有独立时限，完成后再领取。" % [p.grotto.regions.get("mountain",0),p.grotto.regions.get("river",0),p.grotto.regions.get("stars",0)]
	elif kind == "excavate":
		var ancient: Array = []
		for item in p.objects:
			if item.kind == "ancient": ancient.append({"id":item.id,"name":("待鉴古宝" if not item.identified else GameData.named(rules().ancients,item.template).get("name","古宝"))+" · "+item.id})
		var selected: String = _select(v,selection,"ancient","发掘古宝",ancient)
		v.actions.append(_action("鉴定古宝 · 120灵石","progIdentify",{"id":selected},not selected.is_empty(),"先发掘一件古宝"))
		v.actions.append(_action("配置古宝","progSocket",{"id":selected,"target":"ancient","slot":"main"},not selected.is_empty(),"先发掘并鉴定古宝"))
		var ancient_slot: String = str(object(s,selected).get("template",""))
		v.actions.append(_action("卸下此类古宝","progUnsocket",{"target":"ancient","slot":ancient_slot},p.selected.ancient.has(ancient_slot),"此类古宝尚未配置"))
		v.notice = "古碑、古灯、古盏各有一位；当前线索："+GameData.named(rules().excavationSites,start_args.site).description+"。线索与品质在发掘完成后固定，鉴定不能重抽。"
	return _finish_view(v,id,s)

static func _disciple_view(s: Dictionary, v: Dictionary, system_id: String, selection: Dictionary) -> Dictionary:
	var p: Dictionary = s.progression
	var id: String = str(selection.get("id",""))
	if GameData.named(p.disciples,id).is_empty(): id = str(p.disciples[0].id) if not p.disciples.is_empty() else ""
	for disciple in p.disciples: _option(v,disciple.id,disciple.name,"%d级 · 学识%d 采集%d 历练%d" % [disciple.level,disciple.aptitude.study,disciple.aptitude.gather,disciple.aptitude.explore])
	v.summary = "在府%d / 30 · 已出师%d（本地出师榜）" % [p.disciples.size(),p.graduates.size()]
	v.graduates = p.graduates.duplicate(true)
	if system_id == "040":
		var mentors: Array = []
		for hero in s.owned: mentors.append({"id":hero,"name":GameData.character(hero).name})
		var mentor: String = _select(v,selection,"mentor","导师法相",mentors)
		v.actions = [_action("招收弟子 · 150灵石 5灵药","progDiscipleRecruit"),_action("导师传道培养","progDiscipleTrain",{"id":id,"mentor":mentor},not id.is_empty(),"先招收弟子")]
	else:
		var other: String = _select(v,selection,"other","结伴弟子",_choices(p.disciples))
		var talent: String = _select(v,selection,"talent","共同专长",[{"id":"study","name":"学识"},{"id":"gather","name":"采集"},{"id":"explore","name":"历练"}])
		v.actions = [_action("结伴合参","progDisciplePair",{"id":id,"other":other,"talent":talent},not id.is_empty() and id!=other,"请选择两名不同弟子"),_action("安排出师","progDiscipleGraduate",{"id":id},not id.is_empty(),"先招收并培养弟子")]
		v.notice = "同一组合每项专长只合参一次；保留两位弟子。10级且完成历练可出师，资质折为传道书，档案永久列入本地榜。"
	return _finish_view(v,id,s)

static func _fish_view(s: Dictionary, v: Dictionary, selection: Dictionary, now: int) -> Dictionary:
	var f: Dictionary = s.progression.fish
	var tab: String = _select(v,selection,"tab","灵池",[{"id":"pond","name":"垂钓"},{"id":"fish","name":"灵鱼"},{"id":"catalogue","name":"图鉴"}],"pond")
	var id: String = str(selection.get("id",""))
	if GameData.named(rules().fish,id).is_empty(): id = str(f.owned.keys()[0]) if not f.owned.is_empty() else str(rules().fish[0].id)
	for spec in rules().fish:
		var record: Dictionary = f.owned.get(spec.id,{})
		_option(v,spec.id,spec.name,("尚未钓得 · 原生"+stat_name(spec.stat)) if record.is_empty() else "%d级 · %d星 · %s%d品" % [record.level,record.stars,stat_name(record.affix),record.quality],not record.is_empty())
	v.summary = "垂钓次数%d / 5 · 鱼饵%d · 每小时积存一次" % [fish_charges(s,now),s.progression.materials.fishbait]
	if tab=="pond":
		v.actions = [_action("垂钓一次","progFishCatch",{},fish_charges(s,now)>0,"等待垂钓次数恢复")]
		v.notice = "每次消耗1份鱼饵和1次垂钓机会；重复灵鱼化为同类鳞片。切换灵鱼页进行培养与词条选择。"
		return _finish_view(v,id,s)
	if tab=="catalogue":
		v.summary = "已收集%d / %d种灵鱼；选择卡片查看原生水脉。" % [f.owned.size(),rules().fish.size()]
		v.notice = GameData.named(rules().fish,id).name+" · 原生"+stat_name(GameData.named(rules().fish,id).stat)+"；收集记录永久保留，培养与传承不会消耗灵鱼。"
		return _finish_view(v,id,s)
	if f.owned.has(id):
		v.summary = "当前%s · 同类鳞片%d · 点化鳞片%d" % [GameData.named(rules().fish,id).name,f.owned[id].copies,s.progression.materials.fishscale]
		var slot: String = _select(v,selection,"slot","水脉位置",_choices([1,2,3]))
		var choices: Array = []
		for key in f.owned: choices.append({"id":key,"name":GameData.named(rules().fish,key).name})
		var donor: String = _select(v,selection,"donor","词条传承来源",choices)
		v.actions.append(_action("温养一级","progFishTrain",{"id":id}))
		v.actions.append(_action("点化升星","progFishStar",{"id":id}))
		v.actions.append(_action("调整词条","progFishRoll",{"id":id},not f.pending.has(id),"先处理待选词条"))
		if f.pending.has(id):
			v.notice = "待选词条：%s · %d品；不采用则旧词条继续生效。" % [stat_name(f.pending[id].affix),f.pending[id].quality]
			v.actions.append(_action("采用新词条","progFishChoose",{"id":id,"accept":true}))
			v.actions.append(_action("保留旧词条","progFishChoose",{"id":id,"accept":false}))
		v.actions.append(_action("配置到水脉","progFishSelect",{"id":id,"slot":slot}))
		v.actions.append(_action("移出此水脉","progFishUnselect",{"slot":slot},f.selected.has(slot),"此水脉为空"))
		v.actions.append(_action("确认传承词条","progFishInherit",{"id":id,"donor":donor,"confirm":true},id!=donor,"选择另一条灵鱼"))
	return _finish_view(v,id,s)

static func ensure_state(s: Dictionary) -> void:
	GameEquipment.ensure_state(s)
	if not s.has("progression"):
		var families: Dictionary = {}
		for key in rules().families: families[key] = {}
		families.cosmetics.plain = {"level":1,"stars":0,"copies":0,"spent":{},"locked":false,"skill":"","rebirths":0}
		var materials: Dictionary = {}
		for key in rules().materials: materials[key] = 0
		s.progression = {"version":1,"randomState":maxi(1,(int(s.get("createdAt",1)) ^ 0x73af028d) & 0xffffffff),"nextId":1,"clock":int(s.get("lastTime",s.get("createdAt",0))),"materials":materials,"receipts":{},"furnace":{"level":1,"forged":0,"filter":{"rarity":4,"stats":[],"minGain":0,"salvage":false}},"realm":{"level":0,"passed":[],"pending":{}},"vein":{"level":0,"branch":"wood","quality":1,"pending":{}},"direction":{"selected":"sword","levels":{"sword":0,"beast":0,"guard":0}},"families":families,"selected":{"pets":{},"spirits":{},"primordial":{},"abilities":{},"mounts":{},"manifestations":{},"cosmetics":{"outfit":"plain"},"ancient":{},"lawcore":{}},"objects":[],"sockets":{},"formations":{},"friends":{},"jobs":[],"root":{"level":0},"life":{"branch":"sword","nodes":0,"passed":[]},"monument":{"level":0,"links":[]},"mountSpirits":{},"grotto":{"regions":{},"level":0},"laws":{"attack":0,"protect":0,"beast":0},"source":{"width":3,"height":3,"placements":{}},"body":{"bone":0,"blood":0,"spirit":0,"passed":[]},"gather":{"seat":0,"helpDay":""},"disciples":[],"graduates":[],"pairHistory":[],"shop":{},"manager":{"claim":false,"dispatch":false,"forge":false,"recover":false},"tasks":{"forged":0,"trained":0,"claimed":0,"received":[]},"fish":{"owned":{},"selected":{},"charges":0,"regenAt":int(s.get("lastTime",0)),"pending":{}}}
	# A new save stays compatible with legacy equipment calls until its first
	# progression command. Existing equipped saves migrate on their first load.
	if not s.equipment.has("sharedEquipped"):
		s.equipment.sharedEquipped = {}
		s.equipment.sharedActive = false
		s.equipment.legacyEquipped = s.equipment.equipped.duplicate(true)
		for hero in s.equipment.equipped:
			for slot in s.equipment.equipped[hero]:
				var candidate: Dictionary = GameEquipment.item(s,s.equipment.equipped[hero][slot])
				var old: Dictionary = GameEquipment.shared_item(s,slot)
				if not candidate.is_empty() and (old.is_empty() or _gear_score(candidate) > _gear_score(old)): s.equipment.sharedEquipped[slot] = candidate.id
		if not s.equipment.sharedEquipped.is_empty(): s.equipment.sharedActive = true
	if s.get("progression") is Dictionary:
		var p: Dictionary = s.progression
		if not p.has("profile"): p.profile = {"name":"府主","signature":"问道山河，广结仙缘"}
		if not p.has("managerLastRun"): p.managerLastRun = int(p.get("clock",0))
		if not p.has("fertile"): p.fertile = {"refreshes":0,"points":{"stone":80,"material":15,"herb":15}}
		if p.get("gather") is Dictionary and not p.gather.has("unlocked"): p.gather.unlocked = [1]
		if p.get("selected") is Dictionary and p.selected.get("ancient") is Dictionary and p.selected.ancient.has("main"):
			var previous: Dictionary = object(s,str(p.selected.ancient.main))
			if not previous.is_empty() and previous.get("identified",false):
				p.selected.ancient[str(previous.template)] = previous.id
				p.selected.ancient.erase("main")

static func _gear_score(item: Dictionary) -> float:
	var score: float = float(item.get("rarity",0)) * 10 + float(item.get("level",0)) * 4
	var scale: Dictionary = {"hpFlat":0.22,"atkFlat":3.0,"defFlat":2.0,"speedFlat":1.5}
	score += float(item.get("mainValue",0)) * float(scale.get(item.get("mainStat",""),100.0))
	for sub in item.get("substats",[]): score += float(sub.value) * float(scale.get(sub.stat,100.0))
	return score
static func _next(p: Dictionary) -> float:
	p.randomState = GameEconomy.advance_random(int(p.randomState))
	return float(p.randomState) / 4294967296.0
static func _uid(p: Dictionary, prefix: String) -> String:
	var id: String = prefix + "-" + str(p.nextId)
	p.nextId += 1
	return id
static func _pay(s: Dictionary, base: Dictionary = {}, mats: Dictionary = {}) -> bool:
	for k in base:
		if not k in GameEconomy.RESOURCE_KEYS or not _int(base[k],0,999999999): return false
	if not GameEconomy.can_afford(s, base): return false
	for k in mats:
		if not rules().materials.has(k) or not _int(mats[k],0,999999) or int(s.progression.materials[k]) < int(mats[k]): return false
	GameEconomy.pay(s, base)
	for k in mats: s.progression.materials[k] -= int(mats[k])
	return true
static func _reward(s: Dictionary, base: Dictionary = {}, mats: Dictionary = {}) -> bool:
	for k in base:
		if not k in GameEconomy.RESOURCE_KEYS or int(s.resources[k]) + int(base[k]) > int(GameEconomy.config().resourceCaps[k]): return false
	for k in mats:
		if not rules().materials.has(k) or int(s.progression.materials[k]) + int(mats[k]) > int(rules().materialCap): return false
	for k in base: s.resources[k] += int(base[k])
	for k in mats: s.progression.materials[k] += int(mats[k])
	return true
static func _spec(family: String, id: String) -> Dictionary: return GameData.named(rules().families.get(family,{}).get("choices",[]),id)
static func _record(p: Dictionary, family: String, id: String) -> Dictionary: return p.families.get(family,{}).get(id,{})
static func _record_spent(record: Dictionary, base: Dictionary = {}, mats: Dictionary = {}, already_paid: bool = false) -> void:
	# Transfer historical investment unchanged; new test payments are zero.
	for costs in [base if already_paid else GameEconomy.charged_cost(base),mats]:
		for key in costs: record.spent[key] = int(record.spent.get(key,0))+int(costs[key])
static func object(s: Dictionary, id: String) -> Dictionary: return GameData.named(s.get("progression",{}).get("objects",[]),id)
static func _socket_owner(p: Dictionary, id: String) -> String:
	for target in p.sockets:
		if id in p.sockets[target].values(): return str(target)
	for family in ["ancient","lawcore"]:
		if id in p.selected[family].values(): return family
	if p.source.placements.has(id): return "source"
	return ""
static func _new_object(p: Dictionary, kind: String, template: String = "") -> Dictionary:
	var spec: Dictionary = rules().objectKinds.get(kind,{})
	var stats: Array = spec.get("stats",["atkPercent","defPercent","hpPercent"])
	var item: Dictionary = {"id":_uid(p,kind),"kind":kind,"template":template,"level":1,"quality":1 + int(_next(p)*3),"stat":stats[int(_next(p)*stats.size())],"locked":false,"spent":{},"fusionFailures":0,"identified":kind != "ancient"}
	if kind == "source": item.shape = rules().sourceShapes[int(_next(p)*rules().sourceShapes.size())].duplicate(true)
	p.objects.append(item)
	return item

## Called only by the economy's elapsed-time transaction, never by a read view.
## One bounded pulse prevents offline time from draining a whole material wallet.
static func advance(s: Dictionary, now: int) -> Dictionary:
	if s.has("framework"): return _ok({"executed":false,"reason":"管家仅在玩家在线手动授权执行"})
	if not s.get("progression") is Dictionary: return _ok({"executed":false})
	var p: Dictionary = s.progression
	var enabled: bool = false
	for key in ["claim","dispatch","forge","recover"]:
		if p.get("manager",{}).get(key,false)==true: enabled=true
	if not enabled or now-int(p.get("managerLastRun",now))<60000: return _ok({"executed":false})
	var draft: Dictionary=s.duplicate(true)
	ensure_state(draft)
	var error: String=validate(draft)
	if not error.is_empty(): return _fail(error)
	var result: Dictionary=_manager(draft,maxi(now,int(draft.progression.clock)))
	draft.progression.managerLastRun=maxi(now,int(draft.progression.clock))
	draft.progression.clock=maxi(now,int(draft.progression.clock))
	error=validate(draft)
	if not error.is_empty(): return _fail(error)
	s.clear()
	s.merge(draft,true)
	return _ok({"executed":result.ok,"results":result.data.get("results",[])})

static func command(s: Dictionary, name: String, args: Dictionary = {}, now: int = -1) -> Dictionary:
	if not handles(name): return _fail("未知培养操作")
	var draft: Dictionary = s.duplicate(true)
	ensure_state(draft)
	if draft.has("framework"): GameFramework.ensure(draft)
	var error: String = validate(draft)
	if not error.is_empty(): return _fail(error)
	var p: Dictionary = draft.progression
	var txid: String = str(args.get("txid",""))
	if args.has("txid") and (not args.txid is String or txid.is_empty() or txid.length() > 160): return _fail("操作凭证无效")
	if not txid.is_empty() and p.receipts.has(txid):
		var receipt: Dictionary = p.receipts[txid]
		if receipt.name != name or receipt.args != args: return _fail("操作凭证已用于其他请求")
		return _ok(receipt.data.duplicate(true))
	if now < 0: now = int(draft.get("lastTime",p.clock))
	now = maxi(now,int(p.clock))
	var result: Dictionary = _command(draft,name,args,now)
	if not result.ok: return result
	if draft.has("framework"): GameFramework.ensure(draft)
	# An internal settlement may replace the draft's nested dictionaries.
	p = draft.progression
	p.clock = now
	if name in ["progForge","progAutoForge","progEquipShared","progUnequipShared","progLoadFormation"]: draft.equipment.sharedActive = not draft.has("framework")
	if not txid.is_empty(): p.receipts[txid] = {"name":name,"args":args.duplicate(true),"data":result.data.duplicate(true)}
	error = validate(draft)
	if not error.is_empty(): return _fail(error)
	s.clear()
	s.merge(draft,true)
	return result

static func _command(s: Dictionary, name: String, a: Dictionary, now: int) -> Dictionary:
	if s.has("framework") and GameFramework.handles(name): return GameFramework.command(s,name,a,now)
	var p: Dictionary = s.progression
	var id: String = str(a.get("id",""))
	match name:
		"progFishUnselect":
			var slot: String=str(a.get("slot",""))
			if not p.fish.selected.has(slot): return _fail("此水脉为空")
			p.fish.selected.erase(slot)
			return _ok({"slot":slot})
		"progDispatchHerbs":
			if not a.get("ids") is Array or a.ids.is_empty() or a.ids.size()>5: return _fail("每批派遣1至5位仙友")
			var jobs: Array = []
			var seen: Dictionary = {}
			for hero in a.ids:
				if not hero is String or seen.has(hero): return _fail("请选不同仙友")
				seen[hero] = true
				var result: Dictionary = _start_job(s,"herbs",{"target":hero},now)
				if not result.ok: return result
				jobs.append(result.data)
			return _ok({"jobs":jobs})
		"progResumeTrial":
			var trial: Dictionary = p.realm.pending
			if trial.is_empty(): return _fail("没有待完成试炼")
			return _ok({"trial":trial.duplicate(true),"requiresBattle":true,"battleRequest":{"stageId":trial.stageId,"team":trial.team.duplicate(true),"options":trial.options.duplicate(true)}})
		"progAbandonTrial":
			if p.realm.pending.is_empty(): return _fail("没有待放弃试炼")
			if a.get("confirm") != true: return _fail("请确认本次试炼按失败结束")
			return settle_trial(s,p.realm.pending.id,false)
		"progCoreBreakthrough":
			var core: Dictionary = object(s,id)
			var donor: Dictionary = object(s,str(a.get("donor","")))
			if core.get("kind")!="petcore" or donor.get("kind")!="petcore" or id==donor.id: return _fail("请选择两颗不同内丹")
			if core.quality>=3 or core.level<5*int(core.quality): return _fail("内丹需达到品质×5级，最高三品")
			if donor.locked or not _socket_owner(p,donor.id).is_empty(): return _fail("不能消耗锁定或已镶嵌内丹")
			if a.get("confirm")!=true: return _fail("确认消耗材料内丹；目标等级和投入会保留")
			var quality: int = int(core.quality)
			if not _pay(s,{"stone":quality*200},{"coreessence":quality*6}): return _fail("内丹突破材料不足")
			core.quality += 1
			_record_spent(core,donor.spent,{},true)
			_record_spent(core,{"stone":quality*200},{"coreessence":quality*6})
			p.objects = p.objects.filter(func(item: Dictionary) -> bool: return item.id!=donor.id)
			return _ok({"item":core.duplicate(true),"consumed":[donor.id]})
		"progProfile":
			if not a.get("name") is String or not a.get("signature") is String: return _fail("名片姓名和签名须为文字")
			var player_name: String = a.name.strip_edges()
			var signature: String = a.signature.strip_edges()
			if player_name.is_empty() or player_name.length()>12 or signature.length()>40: return _fail("名字1至12字，签名最多40字")
			p.profile = {"name":player_name,"signature":signature}
			return _ok(p.profile.duplicate())
		"progUnselect":
			var family: String = str(a.get("family",""))
			var slot: String = str(a.get("slot",""))
			if not p.selected.has(family) or not p.selected[family].has(slot): return _fail("此位置没有配置对象")
			p.selected[family].erase(slot)
			return _ok({"family":family,"slot":slot})
		"progFamilyLock":
			var record: Dictionary = _record(p,str(a.get("family","")),id)
			if record.is_empty() or not a.get("value") is bool: return _fail("对象或锁定状态无效")
			record.locked = a.value
			return _ok({"id":id,"locked":a.value})
		"progRefreshFertile":
			if not _pay(s,{"stone":20}): return _fail("刷新福地需要20灵石")
			for key in p.fertile.points: p.fertile.points[key] = (60+int(_next(p)*61)) if key=="stone" else (12+int(_next(p)*15))
			p.fertile.refreshes += 1
			return _ok(p.fertile.duplicate(true))
		"progGatherChallenge":
			if not _int(a.get("seat"),2,3) or int(a.seat) in p.gather.unlocked: return _fail("请选择尚未解锁的2或3号位置")
			return _start_trial(s,"gather",int(a.seat),"",now)
		"progFriendSpar":
			if not s.owned.has(id): return _fail("先与此仙友结缘")
			if _friend(p,id).get("sparDay","")==GameEconomy.natural_day(now): return _fail("今日已获得此仙友切磋奖励")
			return _start_trial(s,"friend",1,id,now)
		"progMakeEmbryo":
			if not _int(a.get("count",1),1,100): return _fail("宝胚数量须为1至100")
			var n: int = int(a.get("count",1))
			if not _pay(s,{"material":3*n,"stone":10*n}): return _fail("需要每枚3灵材、10灵石")
			if not _reward(s,{}, {"embryo":n}): return _fail("宝胚已满")
			return _ok({"count":n})
		"progForge": return _forge(s,false)
		"progAutoForge":
			if not _int(a.get("count",10),1,50): return _fail("每批自动炼器1至50次")
			var results: Array = []
			for i in range(int(a.get("count",10))):
				var result: Dictionary = _forge(s,true)
				if not result.ok:
					if results.is_empty(): return result
					return _ok({"results":results,"stopped":result.error})
				results.append(result.data)
			return _ok({"results":results,"stopped":"本批完成"})
		"progFurnaceUpgrade":
			var lv: int = int(p.furnace.level)
			if lv >= rules().forgeWeights.size(): return _fail("炉鼎已满级")
			if not _pay(s,{"stone":lv*250,"material":lv*20}): return _fail("炉鼎升级资源不足")
			p.furnace.level += 1
			return _ok({"level":p.furnace.level,"weights":rules().forgeWeights[p.furnace.level-1]})
		"progForgeFilter":
			if not _int(a.get("rarity",4),3,5) or not _int(a.get("minGain",0),0,10000) or not a.get("stats",[]) is Array or not a.get("salvage",false) is bool: return _fail("筛选条件无效")
			var seen: Dictionary = {}
			for key in a.get("stats",[]):
				if not key in GameEquipment.rules().substatWeights or seen.has(key): return _fail("筛选词条无效或重复")
				seen[key] = true
			p.furnace.filter = {"rarity":int(a.get("rarity",4)),"minGain":int(a.get("minGain",0)),"stats":a.get("stats",[]).duplicate(),"salvage":a.get("salvage",false)}
			return _ok(p.furnace.filter.duplicate(true))
		"progEquipShared":
			var item: Dictionary = GameEquipment.item(s,id)
			if item.is_empty(): return _fail("法宝不存在")
			if s.has("framework") and item.get("ownerKind") != "lord": return _fail("神仙套装不能作为府主炼器装备")
			var replaced: String = str(s.equipment.sharedEquipped.get(item.slot,""))
			s.equipment.sharedEquipped[item.slot] = id
			return _ok({"id":id,"slot":item.slot,"replacedId":replaced})
		"progUnequipShared":
			var slot: String = str(a.get("slot",""))
			if not s.equipment.sharedEquipped.has(slot): return _fail("此位置没有法宝")
			s.equipment.sharedEquipped.erase(slot)
			return _ok({"slot":slot})
		"progRealmTrial": return _start_trial(s,"realm",int(p.realm.level)+1,"",now)
		"progRealmBreak":
			var requirement: Dictionary = realm_requirement(s)
			if int(p.realm.level) >= rules().realms.size()-1: return _fail("府主境界已满")
			if not int(requirement.level) in p.realm.passed: return _fail("先完成此境界渡劫")
			if int(p.furnace.level) < int(requirement.furnace): return _fail("炉鼎等级不足")
			if not _pay(s,{"xp":int(requirement.xp)}): return _fail("突破修为不足")
			p.realm.level += 1
			return _ok({"level":p.realm.level,"name":realm_name(s)})
		"progSelectDirection":
			if not rules().directions.has(id): return _fail("修炼方向不存在")
			p.direction.selected = id
			return _ok({"id":id})
		"progDirectionNode":
			if not rules().directions.has(id): return _fail("修炼方向不存在")
			var lv: int = int(p.direction.levels[id])
			if lv >= 10 or not _pay(s,{"xp":120*(lv+1),"stone":100*(lv+1)}): return _fail("节点已满或修为不足")
			p.direction.levels[id] += 1
			p.tasks.trained += 1
			return _ok({"level":lv+1})
		"progSaveFormation":
			if not id in ["1","2","3"]: return _fail("请选择1至3号阵容方案")
			var branches: Dictionary = {}
			for hero in s.team: branches[hero] = s.owned[hero].branch
			p.formations[id] = {"team":s.team.duplicate(),"branches":branches,"equipment":s.equipment.sharedEquipped.duplicate(),"selected":p.selected.duplicate(true),"direction":p.direction.selected,"sockets":p.sockets.duplicate(true),"lifeBranch":p.life.branch,"fish":p.fish.selected.duplicate(),"source":p.source.placements.duplicate(true)}
			return _ok({"id":id})
		"progLoadFormation":
			if not p.formations.has(id): return _fail("此方案尚未保存")
			var saved: Dictionary = p.formations[id]
			for hero in saved.team:
				if not s.owned.has(hero): return _fail("方案中的神仙已不存在")
				if saved.get("branches",{}).get(hero,"A")=="B" and int(s.owned[hero].level)<int(GameEconomy.config().branchLevel) and not hero in s.branchUnlocks: return _fail("方案中的神仙分支尚未解锁")
			for item_id in saved.equipment.values():
				if GameEquipment.item(s,item_id).is_empty(): return _fail("方案中的法宝已被消耗，请重新保存")
			for family in saved.selected:
				for selected_id in saved.selected[family].values():
					if family in ["ancient","lawcore"]:
						if object(s,selected_id).is_empty(): return _fail("方案中的器物已不存在")
					elif _record(p,family,selected_id).is_empty(): return _fail("方案中的伙伴或神通已不存在")
			s.team = saved.team.duplicate()
			for hero in saved.get("branches",{}): s.owned[hero].branch = saved.branches[hero]
			s.equipment.sharedEquipped = saved.equipment.duplicate()
			p.selected = saved.selected.duplicate(true)
			p.direction.selected = saved.direction
			if saved.has("sockets"): p.sockets = saved.sockets.duplicate(true)
			if saved.has("lifeBranch"): p.life.branch = saved.lifeBranch
			if saved.has("fish"): p.fish.selected = saved.fish.duplicate()
			if saved.has("source"): p.source.placements = saved.source.duplicate(true)
			return _ok({"id":id})
		"progVeinTrain":
			var lv: int = int(p.vein.level)
			if lv >= 20 or not _pay(s,{"xp":80*(lv+1)},{"veinessence":lv+1}): return _fail("灵脉已满或材料不足")
			p.vein.level += 1
			p.tasks.trained += 1
			return _ok(p.vein.duplicate(true))
		"progVeinRoll":
			if not p.vein.pending.is_empty(): return _fail("请先保留旧灵脉或采用新结果")
			if not _pay(s,{"stone":80},{"veinessence":2}): return _fail("重炼材料不足")
			var branches: Array = rules().veins.keys()
			p.vein.pending = {"branch":branches[int(_next(p)*branches.size())],"quality":1+int(_next(p)*5)}
			return _ok(p.vein.pending.duplicate())
		"progVeinChoose":
			if p.vein.pending.is_empty() or not a.get("accept") is bool: return _fail("没有待选择的重炼结果")
			if a.accept:
				p.vein.branch = p.vein.pending.branch
				p.vein.quality = p.vein.pending.quality
			p.vein.pending = {}
			return _ok(p.vein.duplicate(true))
		"progAcquire","progTrain","progStar","progSelect": return _family_command(s,name,a)
		"progPetInherit": return _pet_inherit(s,a)
		"progPetRebirth": return _pet_rebirth(s,a)
		"progCraftObject","progObjectTrain","progSocket","progUnsocket","progFuse","progObjectLock": return _object_command(s,name,a)
		"progFriendGift","progFriendTalk","progStoryRead": return _friend_command(s,name,a,now)
		"progJobStart": return _start_job(s,str(a.get("kind","")),a,now)
		"progJobClaim": return _claim_job(s,id,now)
		"progRootGrow":
			var lv: int = int(p.root.level)
			if lv >= 30 or not _pay(s,{"herb":5*(lv+1)},{"dew":2*(lv+1)}): return _fail("灵根已满或玉露不足")
			p.root.level += 1
			return _ok(p.root.duplicate())
		"progLifeBranch":
			if not rules().lifeBranches.has(id): return _fail("本命法宝形态不存在")
			p.life.branch = id
			return _ok(p.life.duplicate(true))
		"progLifeNode":
			var lv: int = int(p.life.nodes)
			if lv >= 20 or not _pay(s,{"stone":150*(lv+1)},{"lifecore":lv+1}): return _fail("本命节点已满或材料不足")
			if lv > 0 and lv % 5 == 0 and not int(lv/5) in p.life.passed: return _fail("先通过对应本命法宝试炼")
			p.life.nodes += 1
			p.tasks.trained += 1
			return _ok(p.life.duplicate(true))
		"progLifeTrial": return _start_trial(s,"life",p.life.passed.size()+1,"",now)
		"progMonument": return _monument(s,a)
		"progIdentify":
			var item: Dictionary = object(s,id)
			if item.is_empty() or item.kind != "ancient" or item.identified: return _fail("请选择尚未鉴定的古宝")
			if not _pay(s,{"stone":120}): return _fail("鉴定需要120灵石")
			_record_spent(item,{"stone":120})
			var site: Dictionary = GameData.named(rules().excavationSites,str(item.get("site","mountain")))
			var roll: float = _next(p)
			var spec: Dictionary = GameData.named(rules().ancients,str(site.get("preferred","tablet")))
			if roll>=0.6:
				var other: Array = rules().ancients.filter(func(value: Dictionary) -> bool: return value.id!=site.get("preferred","tablet"))
				spec = other[0 if roll<0.8 else 1]
			item.template = spec.id
			item.stat = spec.stat
			item.identified = true
			return _ok(item.duplicate(true))
		"progMountSpirit":
			if _record(p,"mounts",id).is_empty(): return _fail("先获得此座驾")
			var lv: int = int(p.mountSpirits.get(id,0))
			if lv >= 10 or not _pay(s,{"stone":100*(lv+1)},{"spiritessence":lv+1}): return _fail("器灵已满或精华不足")
			p.mountSpirits[id] = lv+1
			return _ok({"id":id,"level":lv+1})
		"progGrottoRestore": return _start_job(s,"grotto",a,now)
		"progLawInsight":
			if not rules().laws.has(id): return _fail("法则分支不存在")
			var lv: int = int(p.laws[id])
			if lv >= 20 or not _pay(s,{"xp":200*(lv+1)},{"lawpage":lv+1}): return _fail("法则已满或感悟材料不足")
			p.laws[id] += 1
			p.tasks.trained += 1
			return _ok({"id":id,"level":lv+1})
		"progSourcePlace","progSourceRemove","progSourceExpand": return _source_command(s,name,a)
		"progBodyNode":
			if not rules().body.has(id): return _fail("炼体部位不存在")
			var lv: int = int(p.body[id])
			if lv >= 20 or not _pay(s,{"xp":120*(lv+1)},{"bodypill":lv+1}): return _fail("炼体已满或材料不足")
			if lv > 0 and lv % 5 == 0 and not int(lv/5) in p.body.passed: return _fail("先通过炼体试炼")
			p.body[id] += 1
			p.tasks.trained += 1
			return _ok({"id":id,"level":lv+1})
		"progBodyTrial": return _start_trial(s,"body",p.body.passed.size()+1,"",now)
		"progGatherSeat":
			if not _int(a.get("seat"),0,3): return _fail("共修位置为0至3")
			if int(a.seat)>0 and not int(a.seat) in p.gather.unlocked: return _fail("先在本地切磋中赢得此共修位置")
			p.gather.seat = int(a.seat)
			return _ok({"seat":p.gather.seat,"mode":"本地道友共修"})
		"progGatherHelp":
			var day: String = GameEconomy.natural_day(now)
			if p.gather.helpDay == day: return _fail("今日已请本地道友助力")
			if not _reward(s,{"xp":50}): return _fail("修为已满，请先培养")
			p.gather.helpDay = day
			return _ok({"xp":50,"mode":"本地道友助力"})
		"progHerbCommission": return _herb_commission(s,a,now)
		"progDiscipleRecruit","progDiscipleTrain","progDisciplePair","progDiscipleGraduate","progDiscipleEvent": return _disciple_command(s,name,a,now)
		"progShop": return _shop(s,id,int(a.get("count",1)),a.get("count",1),now)
		"progManagerAuthorize":
			if not p.manager.has(id) or not a.get("value") is bool: return _fail("管家授权必须明确选择开或关")
			if a.value and not true in p.manager.values(): p.managerLastRun = now
			p.manager[id] = a.value
			return _ok(p.manager.duplicate())
		"progManagerRun": return _manager(s,now)
		"progTaskClaim": return _task_claim(s,id,now)
		"progFishCatch","progFishTrain","progFishStar","progFishRoll","progFishChoose","progFishInherit","progFishSelect": return _fish_command(s,name,a,now)
	return _fail("未处理的培养操作")

static func _forge(s: Dictionary, auto: bool, quality_floor: int = 3, top_multiplier: float = 1.0) -> Dictionary:
	var p: Dictionary = s.progression
	if s.equipment.items.size() >= int(GameEquipment.rules().inventoryCapacity): return _fail("法宝背包已满，请先整理")
	if not s.has("framework") and not _pay(s,{}, {"embryo":1}): return _fail("宝胚不足，可用灵材制作")
	var weights: Dictionary = rules().forgeWeights[int(p.furnace.level)-1].duplicate()
	var highest: int = 3
	for key in weights:
		if float(weights[key]) > 0: highest = maxi(highest,int(key))
	var total: float = 0.0
	for key in weights:
		if int(key) == highest: weights[key] = float(weights[key])*top_multiplier
		total += float(weights[key])
	var roll: float = _next(p)*total
	var rarity: int = 3
	for key in weights:
		roll -= float(weights[key])
		if roll < 0:
			rarity = int(key)
			break
	rarity = maxi(rarity,quality_floor)
	var slots: Array = GameEquipment.shared_slots()
	var slot: String = slots[int(_next(p)*slots.size())].id
	var item: Dictionary = GameEquipment.grant_drop(s,{"rarity":rarity,"slot":slot,"sourceId":"furnace"})
	if item.is_empty(): return _fail("炼器未生成法宝")
	var old: Dictionary = GameEquipment.shared_item(s,slot)
	var gain: float = _gear_score(item)-_gear_score(old)
	var matched: bool = false
	for stat in p.furnace.filter.stats:
		if item.mainStat == stat: matched = true
		for sub in item.substats:
			if sub.stat == stat: matched = true
	var keep: bool = rarity >= int(p.furnace.filter.rarity) or matched or gain >= float(p.furnace.filter.minGain)
	var salvaged: bool = false
	if auto and not keep and p.furnace.filter.salvage and not item.locked and not item.favorite:
		var result: Dictionary = GameEquipment._salvage(s,[item.id])
		salvaged = result.ok
	p.furnace.forged += 1
	p.tasks.forged += 1
	return _ok({"item":item,"replacedId":old.get("id",""),"scoreGain":gain,"kept":not salvaged,"matchedStat":matched,"note":"装备基础等级为0；炉鼎等级只控制品质概率。"})

static func realm_name(s: Dictionary) -> String: return rules().realms[clampi(int(s.get("progression",{}).get("realm",{}).get("level",0)),0,rules().realms.size()-1)]
static func realm_requirement(s: Dictionary) -> Dictionary:
	var level: int = int(s.get("progression",{}).get("realm",{}).get("level",0))+1
	return {"level":level,"xp":level*level*400,"furnace":mini(level,rules().forgeWeights.size())}
static func _start_trial(s: Dictionary, kind: String, level: int, target: String = "", now: int = -1) -> Dictionary:
	var p: Dictionary = s.progression
	if not p.realm.pending.is_empty(): return _fail("已有未结算试炼，请先完成")
	if s.has("framework") and GameFramework.locked(s): return _fail("请先结束当前锁定战斗")
	if level > (rules().realms.size()-1 if kind == "realm" else 4): return _fail("此试炼已全部完成")
	if s.team.is_empty(): return _fail("先设置神仙阵容")
	var active_expedition: Variant = s.get("expeditions",{}).get("active")
	if s.get("mainBattle") != null or s.get("characterChallenges",{}).get("active") != null or (active_expedition is Dictionary and active_expedition.get("status","") == "battle"): return _fail("请先结束当前战斗")
	var trial: Dictionary = {"id":_uid(p,"trial"),"kind":kind,"level":level,"target":target,"createdAt":maxi(int(p.clock),now),"stageId":clampi(level,1,12),"team":[],"seed":int(_next(p)*4294967296.0),"ruleVersion":GameData.content("BATTLE_RULE_VERSION")}
	for hero_id in s.team:
		var owned: Dictionary = s.owned[hero_id]
		var extras: Dictionary = GameEquipment.stats_for(s,hero_id)
		_add_effect(extras,combat_bonus(s,hero_id))
		trial.team.append({"id":hero_id,"level":owned.level,"branch":owned.branch,"treasure":owned.treasure,"branchUnlocked":hero_id in s.branchUnlocks or int(owned.level) >= int(GameEconomy.config().branchLevel),"equipmentStats":extras})
	if s.has("framework"): trial.team = load("res://scripts/game_framework.gd").party(s)
	trial.options = {"battleId":trial.id,"seed":trial.seed,"trial":true,"autoOnly":true,"ruleVersion":trial.ruleVersion,"petSupport":battle_support(s),"contextName":{"realm":"府主渡劫","life":"本命法宝试炼","body":"炼体试炼","friend":"仙友切磋","gather":"聚灵阵本地切磋"}.get(kind,"试炼")}
	p.realm.pending = trial.duplicate(true)
	return _ok({"trial":trial,"requiresBattle":true,"battleRequest":{"stageId":trial.stageId,"team":trial.team.duplicate(true),"options":trial.options.duplicate(true)}})
## INTERNAL settlement only: caller must replay its saved battle snapshot/seed.
## Public command() deliberately has no victory/finish command.
static func settle_trial(s: Dictionary, trial_id: String, won: bool) -> Dictionary:
	var draft: Dictionary = s.duplicate(true)
	ensure_state(draft)
	if not validate(draft).is_empty(): return _fail("培养存档校验失败")
	var p: Dictionary = draft.progression
	var trial: Dictionary = p.realm.pending
	if trial.is_empty() or trial.id != trial_id: return _fail("此试炼已经结算或不匹配")
	if won:
		if trial.kind in ["realm","life","body"]:
			var target: Dictionary = p.realm if trial.kind == "realm" else p.life if trial.kind == "life" else p.body
			if not int(trial.level) in target.passed: target.passed.append(int(trial.level))
		elif trial.kind == "gather":
			if not int(trial.level) in p.gather.unlocked: p.gather.unlocked.append(int(trial.level))
			p.gather.seat = int(trial.level)
		elif trial.kind == "friend":
			var friend: Dictionary = _friend(p,trial.target)
			friend.sparDay = GameEconomy.natural_day(int(trial.createdAt))
			friend.affection = mini(10000,int(friend.affection)+10)
		if trial.kind == "life":
			if p.objects.size() >= int(rules().objectCap): return _fail("器物背包已满，试炼结果保留待领取")
			_new_object(p,"seal")
		elif trial.kind == "body":
			if not _reward(draft,{}, {"bodypill":int(trial.level)*5}): return _fail("炼体丹已满，结果保留待领取")
	p.realm.pending = {}
	var final_error: String = validate(draft)
	if not final_error.is_empty(): return _fail(final_error)
	s.clear()
	s.merge(draft,true)
	return _ok({"won":won,"kind":trial.kind,"level":trial.level})

static func _family_command(s: Dictionary, name: String, a: Dictionary) -> Dictionary:
	var p: Dictionary = s.progression
	var family: String = str(a.get("family",""))
	var id: String = str(a.get("id",""))
	var spec: Dictionary = _spec(family,id)
	if spec.is_empty(): return _fail("培养对象不存在")
	var family_rule: Dictionary = rules().families[family]
	var record: Dictionary = _record(p,family,id)
	if name == "progAcquire":
		if int(p.realm.level) < int(family_rule.get("realm",0)): return _fail("府主境界不足")
		if family == "cosmetics" and not record.is_empty(): return _fail("已经拥有此装扮")
		if not _pay(s,spec.cost): return _fail("获取资源不足")
		if record.is_empty(): p.families[family][id] = {"level":1,"stars":0,"copies":0,"spent":GameEconomy.charged_cost(spec.cost),"locked":false,"skill":spec.get("skill",""),"rebirths":0}
		else:
			if int(record.copies) >= 999: return _fail("重复碎片已满")
			record.copies += 1
			_record_spent(record,spec.cost)
		return _ok({"family":family,"id":id,"record":p.families[family][id].duplicate(true)})
	if record.is_empty(): return _fail("请先获得此对象")
	if name == "progTrain":
		if family == "cosmetics": return _fail("外观无需升级")
		var lv: int = int(record.level)
		if lv >= 20+int(record.stars)*5: return _fail("已达当前星级上限，请先升星")
		var base: Dictionary = {"stone":lv*35,"xp":lv*20}
		var mats: Dictionary = {family_rule.material:1+int(lv/5)}
		if not _pay(s,base,mats): return _fail("培养材料不足")
		record.level += 1
		_record_spent(record,base,mats)
		p.tasks.trained += 1
		return _ok(record.duplicate(true))
	if name == "progStar":
		var star: int = int(record.stars)
		if family == "cosmetics" or star >= 5: return _fail("不能继续升星")
		if int(record.copies) < star+1: return _fail("需要%d份重复碎片" % (star+1))
		if not _pay(s,{"stone":(star+1)*100},{family_rule.starMaterial:(star+1)*3}): return _fail("升星材料不足")
		_record_spent(record,{"stone":(star+1)*100},{family_rule.starMaterial:(star+1)*3})
		record.copies -= star+1
		record.stars += 1
		return _ok(record.duplicate(true))
	var slot: String = str(a.get("slot",""))
	var legal: Array = {"pets":["main","helper"],"spirits":["1","2","3"],"primordial":["exclusive"],"mounts":["main"],"manifestations":["main"],"cosmetics":["outfit"],"abilities":[spec.get("category","")]}.get(family,[])
	if family == "collections": return _fail("藏品激活后常驻生效，无需上阵")
	if slot.is_empty() and legal.size() == 1: slot = legal[0]
	if not slot in legal: return _fail("请选择合法位置")
	if id in p.selected[family].values() and p.selected[family].get(slot,"") != id: return _fail("同一对象不能同时占用两个位置，请先更换原位置")
	p.selected[family][slot] = id
	return _ok({"family":family,"id":id,"slot":slot})

static func inheritance_preview(s: Dictionary, family: String, target: String, donor: String) -> Dictionary:
	var p: Dictionary = s.get("progression",{})
	if target == donor: return _fail("目标与传承来源不能相同")
	var t: Dictionary = _record(p,family,target)
	var d: Dictionary = _record(p,family,donor)
	if family != "pets" or t.is_empty() or d.is_empty(): return _fail("请先获得两只不同灵兽")
	return _ok({"target":target,"donor":donor,"oldSkill":t.skill,"newSkill":d.skill,"materials":{"inheritstone":2},"consumedPets":[],"note":"只替换目标的常驻属性类型，不产生攻击或触发技能；不消耗灵兽、内丹或既有等级。"})
static func _pet_inherit(s: Dictionary, a: Dictionary) -> Dictionary:
	var preview: Dictionary = inheritance_preview(s,"pets",str(a.get("target","")),str(a.get("donor","")))
	if not preview.ok: return preview
	if not a.get("confirm",false) is bool or not a.get("confirm",false): return _fail("请先确认传承预览")
	if not _pay(s,{},preview.data.materials): return _fail("传承石不足")
	s.progression.families.pets[preview.data.target].skill = preview.data.newSkill
	_record_spent(s.progression.families.pets[preview.data.target],{},preview.data.materials)
	return _ok(preview.data)
static func _pet_rebirth(s: Dictionary, a: Dictionary) -> Dictionary:
	var p: Dictionary = s.progression
	var from: String = str(a.get("id",""))
	var target: String = str(a.get("target",""))
	var record: Dictionary = _record(p,"pets",from)
	if record.is_empty() or _spec("pets",target).is_empty() or from == target: return _fail("转生目标无效")
	if record.locked or not _record(p,"pets",target).is_empty(): return _fail("锁定灵兽不能转生，目标须尚未获得")
	if int(record.level) < 10 or not a.get("confirm") is bool or a.confirm!=true: return _fail("需要灵兽10级并确认转生预览")
	if not _pay(s,{"stone":300},{"petsoul":5,"inheritstone":3}): return _fail("转生材料不足")
	p.families.pets[target] = record.duplicate(true)
	_record_spent(p.families.pets[target],{"stone":300},{"petsoul":5,"inheritstone":3})
	p.families.pets[target].rebirths += 1
	p.families.pets.erase(from)
	for slot in p.selected.pets:
		if p.selected.pets[slot] == from: p.selected.pets[slot] = target
	if p.sockets.has("pet:"+from):
		p.sockets["pet:"+target] = p.sockets["pet:"+from]
		p.sockets.erase("pet:"+from)
	return _ok({"from":from,"target":target,"retainedLevel":record.level,"retainedSpent":record.spent.duplicate(true),"retainedSkill":record.skill})

static func _object_command(s: Dictionary, name: String, a: Dictionary) -> Dictionary:
	var p: Dictionary = s.progression
	var id: String = str(a.get("id",""))
	var kind: String = str(a.get("kind",""))
	var item: Dictionary = object(s,id)
	if name == "progCraftObject":
		if not rules().objectKinds.has(kind) or kind in ["seal","lawcore","ancient"]: return _fail("符印须完成本命试炼，灵核须先感悟成型，古宝须派弟子发掘")
		if p.objects.size() >= int(rules().objectCap): return _fail("器物背包已满")
		if not _pay(s,{"stone":100},{rules().objectKinds[kind].material:3}): return _fail("合成材料不足")
		var created: Dictionary = _new_object(p,kind)
		_record_spent(created,{"stone":100},{rules().objectKinds[kind].material:3})
		return _ok(created.duplicate(true))
	if name == "progUnsocket":
		var target: String = str(a.get("target",""))
		var slot: String = str(a.get("slot",""))
		if target in ["ancient","lawcore"]:
			if not p.selected[target].has(slot): return _fail("此位置为空")
			p.selected[target].erase(slot)
		else:
			if not p.sockets.get(target,{}).has(slot): return _fail("此位置为空")
			p.sockets[target].erase(slot)
		return _ok({"target":target,"slot":slot})
	if name == "progFuse":
		if not a.get("ids") is Array or a.ids.size() != 3: return _fail("合成需三件同类同级器物")
		var ids: Array = a.ids
		var seen: Dictionary = {}
		var items: Array = []
		for entry in ids:
			var value: Dictionary = object(s,str(entry))
			if value.is_empty() or seen.has(entry) or value.locked or not _socket_owner(p,str(entry)).is_empty(): return _fail("不可使用重复、锁定、已装备或已摆放的器物")
			seen[entry] = true
			items.append(value)
		var first: Dictionary = items[0]
		if not first.kind in ["gem","chaos","source","petcore"]: return _fail("此类器物不能三合一")
		if first.level >= 10: return _fail("器物已满级")
		for value in items:
			if value.kind != first.kind or value.level != first.level: return _fail("请选择同类同级器物")
		var chance: float = minf(1.0,0.6+0.1*int(first.fusionFailures)) if first.kind == "gem" else 1.0
		if not a.get("confirm") is bool or a.confirm!=true: return _fail("请确认：消耗后两件；宝玉失败保留第一件并提高下次成功率")
		if not _pay(s,{"stone":100*int(first.level)}): return _fail("合成灵石不足")
		_record_spent(first,{"stone":100*int(first.level)})
		for consumed in items.slice(1): _record_spent(first,consumed.spent,{},true)
		var success: bool = _next(p) < chance
		if success:
			first.level += 1
			first.fusionFailures = 0
		else: first.fusionFailures += 1
		p.objects = p.objects.filter(func(v: Dictionary) -> bool: return not v.id in [ids[1],ids[2]])
		return _ok({"item":first.duplicate(true),"success":success,"chance":chance,"consumed":[ids[1],ids[2]],"nextChance":minf(1.0,0.6+0.1*int(first.fusionFailures))})
	if item.is_empty(): return _fail("器物不存在")
	if name == "progObjectLock":
		if not a.get("value") is bool: return _fail("锁定状态无效")
		item.locked = a.value
		return _ok(item.duplicate(true))
	if name == "progObjectTrain":
		if not rules().objectKinds.has(item.kind) or item.kind in ["gem","chaos","source"]: return _fail("此器物通过三件合成成长")
		if item.level >= 10 or not _pay(s,{"stone":50*int(item.level)},{rules().objectKinds[item.kind].material:int(item.level)}): return _fail("器物已满或培养材料不足")
		_record_spent(item,{"stone":50*int(item.level)},{rules().objectKinds[item.kind].material:int(item.level)})
		item.level += 1
		return _ok(item.duplicate(true))
	var target: String = str(a.get("target",""))
	var slot: String = str(a.get("slot",""))
	if not _socket_owner(p,id).is_empty(): return _fail("同一器物只能配置一次，请先拆下")
	if item.kind in ["ancient","lawcore"]:
		if not item.identified: return _fail("先鉴定古宝")
		if item.kind=="ancient" and slot=="main": slot=str(item.template)
		var legal: Array = [str(item.template)] if item.kind == "ancient" else ["main","helper"]
		if target != item.kind or not slot in legal: return _fail("器物配置位置无效")
		p.selected[item.kind][slot] = id
		return _ok({"id":id,"target":target,"slot":slot})
	if not slot in ["1","2"]: return _fail("镶嵌位置为1或2")
	var legal: bool = false
	match item.kind:
		"petcore": legal = target.begins_with("pet:") and p.families.pets.has(target.trim_prefix("pet:"))
		"seal": legal = target == "life"
		"gem": legal = object(s,target).get("kind","") == "ancient" and object(s,target).get("identified",false)
		"chaos": legal = object(s,target).get("kind","") == "lawcore"
	if not legal: return _fail("内丹用于灵兽、符印用于本命法宝、宝玉用于古宝、混沌石用于灵核")
	if not p.sockets.has(target): p.sockets[target] = {}
	p.sockets[target][slot] = id
	return _ok({"id":id,"target":target,"slot":slot})

static func _friend(p: Dictionary, id: String) -> Dictionary:
	if not p.friends.has(id): p.friends[id] = {"affection":0,"talkDay":"","chapters":[],"gifts":0}
	return p.friends[id]
static func friend_story(s: Dictionary, id: String, chapter: int) -> Dictionary:
	var entries: Array = rules().stories.get(id,[])
	if chapter >= 0 and chapter < entries.size(): return entries[chapter].duplicate()
	return {}
static func _friend_command(s: Dictionary, name: String, a: Dictionary, now: int) -> Dictionary:
	var id: String = str(a.get("id",""))
	if not s.owned.has(id): return _fail("先与此神仙结缘")
	var p: Dictionary = s.progression
	var friend: Dictionary = _friend(p,id)
	if name == "progFriendGift":
		if not _int(a.get("count",1),1,20): return _fail("赠礼数量须为1至20")
		var count: int = int(a.get("count",1))
		if not _pay(s,{}, {"friendgift":count}): return _fail("仙友礼物不足")
		if friend.affection + count*10 > 10000: return _fail("交情已满")
		friend.affection += count*10
		friend.gifts += count
		return _ok({"affection":friend.affection,"giftCount":count})
	if name == "progFriendTalk":
		var day: String = GameEconomy.natural_day(now)
		if friend.talkDay == day: return _fail("今日已与此仙友论道")
		friend.talkDay = day
		friend.affection = mini(10000,int(friend.affection)+5)
		var c: Dictionary = GameData.character(id)
		return _ok({"affection":friend.affection,"text":str(c.get("lore",c.get("description","论道重在互相印证。"))),"name":c.name})
	if not _int(a.get("chapter",0),0,20): return _fail("故事章节无效")
	var chapter: int = int(a.get("chapter",0))
	var story: Dictionary = friend_story(s,id,chapter)
	if story.is_empty(): return _fail("此仙友新故事尚未开放；人物生平可在神仙图鉴查看")
	if int(friend.affection) < (chapter+1)*20: return _fail("需要交情%d" % ((chapter+1)*20))
	if chapter in friend.chapters: return _ok({"story":story,"repeat":true})
	friend.chapters.append(chapter)
	if story.has("gift") and not p.families.cosmetics.has(story.gift): p.families.cosmetics[story.gift] = {"level":1,"stars":0,"copies":0,"spent":{},"locked":false,"skill":"","rebirths":0}
	return _ok({"story":story,"repeat":false})

static func _start_job(s: Dictionary, kind: String, a: Dictionary, now: int) -> Dictionary:
	if s.has("framework"):
		var worker: String = str(a.get("target",""))
		for team in s.framework.estate.teams.values():
			if worker in team: return _fail("弟子正在生产岗位，请先调回候补")
		for plan in s.framework.estate.plans.values():
			if plan.active is Dictionary and worker in plan.active.workers: return _fail("请先完成或取消弟子的当前生产批次")
	var p: Dictionary = s.progression
	if not kind in ["herbs","excavate","lawcore","fertile","gather","disciple","grotto"]: return _fail("派遣事务不存在")
	var active: int = 0
	for job in p.jobs:
		if not job.claimed: active += 1
	if active >= 12: return _fail("同时进行的事务已满12项")
	var target: String = str(a.get("target",a.get("id","")))
	var base: Dictionary = {}
	var mats: Dictionary = {}
	var duration: int = 60000
	var reward_base: Dictionary = {}
	var reward_mats: Dictionary = {}
	var extra: Dictionary = {}
	match kind:
		"herbs":
			if not s.owned.has(target): return _fail("请选择已拥有的神仙采药")
			base = {"stone":20}
			duration = 90000
			reward_base = {"herb":20+int(p.root.level)*2}
			reward_mats = {"dew":3}
		"excavate":
			var disciple: Dictionary = GameData.named(p.disciples,target)
			if disciple.is_empty(): return _fail("先招收弟子，再派弟子寻找古宝")
			var site: String = str(a.get("site","mountain"))
			if GameData.named(rules().excavationSites,site).is_empty(): return _fail("请选择有线索的遗迹地点")
			extra.site=site
			mats = {"clue":1}
			base = {"stone":40}
			duration = 120000
		"lawcore":
			if not rules().laws.has(target) or int(p.laws[target]) < 1: return _fail("先感悟对应法则")
			mats = {"lawpage":3}
			duration = 90000
		"fertile":
			if not target in ["stone","material","herb"]: return _fail("请选择灵石、灵材或灵药福地")
			var worker: String = str(a.get("worker",""))
			var busy_workers: Array = []
			for job in p.jobs:
				if not job.claimed and job.kind=="fertile": busy_workers.append(job.extra.get("worker",""))
			if worker.is_empty():
				for hero in s.owned:
					if not hero in busy_workers:
						worker=hero
						break
			if not s.owned.has(worker) or worker in busy_workers: return _fail("请选择一位尚未采集福地的仙友")
			extra.worker = worker
			base = {"stone":10}
			duration = 60000
			reward_base = {target:int(p.fertile.points[target])}
		"gather":
			if p.gather.seat < 1: return _fail("先选择聚灵阵位置")
			target = str(p.gather.seat)
			duration = 120000
			reward_base = {"xp":120+int(p.gather.seat)*15}
		"disciple":
			var disciple: Dictionary = GameData.named(p.disciples,target)
			if disciple.is_empty(): return _fail("弟子不存在")
			base = {"stone":25}
			duration = 60000
			reward_mats = {"disciplescroll":2}
			extra = {"event":"crossroad","choice":""}
		"grotto":
			if not target in ["mountain","river","stars"]: return _fail("请选择山川、河泽或星台区域")
			var lv: int = int(p.grotto.regions.get(target,0))
			if lv >= 5: return _fail("此洞天区域已完成恢复")
			base = {"stone":200*(lv+1),"material":20*(lv+1)}
			duration = 60000*(lv+1)
			extra = {"fromLevel":lv}
	for job in p.jobs:
		if not job.claimed and job.target == target and (job.kind == kind or (kind in ["disciple","excavate"] and job.kind in ["disciple","excavate"])): return _fail("此对象已经有进行中的事务")
	if not _pay(s,base,mats): return _fail("派遣资源不足")
	if kind == "disciple": _record_spent(GameData.named(p.disciples,target),base,mats)
	var job: Dictionary = {"id":_uid(p,"job"),"kind":kind,"target":target,"startedAt":now,"readyAt":now+duration,"claimed":false,"base":reward_base,"materials":reward_mats,"extra":extra}
	p.jobs.append(job)
	return _ok(job.duplicate(true))
static func _claim_job(s: Dictionary, id: String, now: int) -> Dictionary:
	var p: Dictionary = s.progression
	var job: Dictionary = GameData.named(p.jobs,id)
	if job.is_empty() or job.claimed: return _fail("事务不存在或已经领取")
	if now < int(job.readyAt): return _fail("事务尚未完成")
	var data: Dictionary = {"id":id,"base":job.base.duplicate(),"materials":job.materials.duplicate()}
	if job.kind == "disciple" and str(job.extra.choice).is_empty(): return _fail("先选择弟子历练事件的处理方式")
	if job.kind in ["excavate","lawcore"]:
		if p.objects.size() >= int(rules().objectCap): return _fail("器物背包已满，奖励保留待领取")
		var created: Dictionary = _new_object(p,"ancient" if job.kind == "excavate" else "lawcore",job.target)
		if job.kind=="excavate":
			created.site=job.extra.get("site","mountain")
			_record_spent(created,{"stone":40},{"clue":1})
		else: _record_spent(created,{}, {"lawpage":3})
		data.item = created.duplicate(true)
	elif job.kind == "grotto":
		p.grotto.regions[job.target] = int(job.extra.fromLevel)+1
		p.grotto.level += 1
	elif job.kind == "disciple":
		var disciple: Dictionary = GameData.named(p.disciples,job.target)
		if disciple.is_empty(): return _fail("派遣弟子不存在")
		disciple.expeditions += 1
		if s.has("framework"): disciple.expertise[job.extra.choice] = mini(1000,int(disciple.expertise[job.extra.choice])+1)
		else: disciple.aptitude[job.extra.choice] = mini(100,int(disciple.aptitude[job.extra.choice])+1)
	if not _reward(s,job.base,job.materials): return _fail("奖励仓库已满，事务保留待领取")
	job.claimed = true
	p.tasks.claimed += 1
	return _ok(data)

static func _monument(s: Dictionary, a: Dictionary) -> Dictionary:
	var p: Dictionary = s.progression
	if int(p.realm.level) < 2: return _fail("筑基境界开放镇府至宝")
	var link: String = str(a.get("link",""))
	if not link.is_empty():
		if not p.families.collections.has(link) or link in p.monument.links: return _fail("需先激活藏品，且每件只能关联一次")
		if not _pay(s,{}, {"monumentshard":2}): return _fail("至宝碎片不足")
		p.monument.links.append(link)
		return _ok({"linked":link,"consumedCharacters":[]})
	var lv: int = int(p.monument.level)
	if lv >= 10 or not _pay(s,{"stone":500*(lv+1)},{"monumentshard":3*(lv+1)}): return _fail("至宝已满或材料不足")
	p.monument.level += 1
	return _ok(p.monument.duplicate(true))

static func source_cells(s: Dictionary, id: String, x: int, y: int, rotation: int) -> Array:
	var piece: Dictionary = object(s,id)
	var result: Array = []
	for cell in piece.get("shape",[]):
		var cx: int = int(cell[0])
		var cy: int = int(cell[1])
		for r in range(rotation):
			var old_x: int = cx
			cx = -cy
			cy = old_x
		result.append([x+cx,y+cy])
	return result
static func _source_command(s: Dictionary, name: String, a: Dictionary) -> Dictionary:
	var p: Dictionary = s.progression
	if name == "progSourceExpand":
		if p.source.width >= 6: return _fail("本源盘面已扩至6×6")
		if not _pay(s,{"stone":int(p.source.width)*200},{"sourcefragment":int(p.source.width)*3}): return _fail("扩容材料不足")
		p.source.width += 1
		p.source.height += 1
		return _ok(p.source.duplicate(true))
	var id: String = str(a.get("id",""))
	if object(s,id).get("kind","") != "source": return _fail("请选择本源碎片")
	if name == "progSourceRemove":
		if not p.source.placements.has(id): return _fail("此碎片未摆放")
		p.source.placements.erase(id)
		return _ok({"id":id})
	for key in ["x","y","rotation"]:
		if not _int(a.get(key,0),0,5 if key != "rotation" else 3): return _fail("本源坐标或旋转无效")
	var occupied: Dictionary = {}
	for other in p.source.placements:
		if other == id: continue
		var place: Dictionary = p.source.placements[other]
		for cell in source_cells(s,other,place.x,place.y,place.rotation): occupied[str(cell)] = true
	for cell in source_cells(s,id,int(a.get("x",0)),int(a.get("y",0)),int(a.get("rotation",0))):
		if cell[0] < 0 or cell[1] < 0 or cell[0] >= p.source.width or cell[1] >= p.source.height or occupied.has(str(cell)): return _fail("本源碎片重叠或超出盘面")
	p.source.placements[id] = {"x":int(a.get("x",0)),"y":int(a.get("y",0)),"rotation":int(a.get("rotation",0))}
	return _ok(p.source.placements[id].duplicate())

static func _herb_commission(s: Dictionary, a: Dictionary, now: int) -> Dictionary:
	var item_id: String = str(a.get("id","training"))
	if not item_id in ["training","ward","heal","cleanse"]: return _fail("请交付丹坊产出的真实丹药")
	var key: String = "commission:"+GameEconomy.natural_day(now)+":"+item_id
	if int(s.progression.shop.get(key,0)) >= 3: return _fail("此丹药今日委托已完成3次")
	if int(s.items.get(item_id,0)) < 1: return _fail("丹药不足，请先在既有丹坊炼制")
	if not _reward(s,{"stone":90},{"friendgift":1,"bodypill":1}): return _fail("奖励仓库已满")
	s.items[item_id] -= 1
	s.progression.shop[key] = int(s.progression.shop.get(key,0))+1
	return _ok({"consumed":item_id,"stone":90,"materials":{"friendgift":1,"bodypill":1}})

static func _disciple_command(s: Dictionary, name: String, a: Dictionary, now: int) -> Dictionary:
	var p: Dictionary = s.progression
	var id: String = str(a.get("id",""))
	if name == "progDiscipleRecruit":
		if p.disciples.size() >= 30: return _fail("弟子住处已满30人，请安排出师")
		if not _pay(s,{"stone":150,"herb":5}): return _fail("招收需要150灵石、5灵药")
		var names: Array = ["青禾","知微","松月","听澜","明川","望舒","竹眠","星池"]
		var disciple: Dictionary = {"id":_uid(p,"disciple"),"name":names[int(_next(p)*names.size())],"level":1,"aptitude":{"study":1+int(_next(p)*10),"gather":1+int(_next(p)*10),"explore":1+int(_next(p)*10)},"expeditions":0,"spent":GameEconomy.charged_cost({"stone":150,"herb":5}),"paired":[],"mentor":""}
		for graduate in p.graduates:
			for skill in ["study","gather","explore"]: disciple.aptitude[skill] = maxi(int(disciple.aptitude[skill]),mini(10,int(graduate.aptitude[skill])/2))
		p.disciples.append(disciple)
		return _ok(disciple.duplicate(true))
	var disciple: Dictionary = GameData.named(p.disciples,id)
	if disciple.is_empty(): return _fail("弟子不存在")
	if name == "progDiscipleTrain":
		var mentor: String = str(a.get("mentor",""))
		if not mentor.is_empty() and not s.owned.has(mentor): return _fail("导师须为已拥有神仙")
		if disciple.level >= 20 or not _pay(s,{"xp":int(disciple.level)*50},{"disciplescroll":1}): return _fail("弟子已满或传道材料不足")
		_record_spent(disciple,{"xp":int(disciple.level)*50},{"disciplescroll":1})
		disciple.level += 1
		disciple.mentor = mentor
		if not mentor.is_empty(): disciple.expertise.study = mini(1000,int(disciple.expertise.get("study",0))+1)
		p.tasks.trained += 1
		return _ok(disciple.duplicate(true))
	if name == "progDisciplePair":
		var other: Dictionary = GameData.named(p.disciples,str(a.get("other","")))
		var talent: String = str(a.get("talent",""))
		if other.is_empty() or other.id == id or not talent in ["study","gather","explore"]: return _fail("选择两名不同弟子及一项共同专长")
		var pair: Array = [id,other.id]
		pair.sort()
		var key: String = ":".join(pair)+":"+talent
		if key in p.pairHistory: return _fail("这对弟子的此项专长已经合参")
		if not _pay(s,{"stone":100},{"disciplescroll":2}): return _fail("结伴材料不足")
		# Shared expense is split once across the two permanent archives.
		_record_spent(disciple,{"stone":50},{"disciplescroll":1})
		_record_spent(other,{"stone":50},{"disciplescroll":1})
		var gain: int = maxi(1,int((int(disciple.aptitude[talent])+int(other.aptitude[talent]))/10))
		disciple.expertise[talent] = mini(1000,int(disciple.expertise[talent])+gain)
		other.expertise[talent] = mini(1000,int(other.expertise[talent])+gain)
		p.pairHistory.append(key)
		return _ok({"ids":pair,"talent":talent,"gain":gain,"note":"本地合参保留两位弟子；此规则是本作改动。"})
	if name == "progDiscipleGraduate":
		if disciple.level < 10 or disciple.expeditions < 1: return _fail("出师需要10级并完成至少一次历练")
		for job in p.jobs:
			if not job.claimed and job.target == id: return _fail("弟子仍在外出，请先结算")
		var reward: int = int(disciple.level)+int(disciple.aptitude.study)
		if not _reward(s,{}, {"disciplescroll":reward}): return _fail("传道书已满")
		var entry: Dictionary = disciple.duplicate(true)
		entry.graduatedAt = now
		p.graduates.append(entry)
		p.disciples = p.disciples.filter(func(v: Dictionary) -> bool: return v.id != id)
		return _ok({"graduate":entry,"disciplescroll":reward,"ranking":"本地出师榜"})
	var job: Dictionary = GameData.named(p.jobs,str(a.get("jobId","")))
	var choice: String = str(a.get("choice",""))
	if job.is_empty() or job.kind != "disciple" or job.target != id or job.claimed or not str(job.extra.choice).is_empty() or not choice in ["study","gather","explore"]: return _fail("历练事件已经选择或参数不符")
	job.extra.choice = choice
	job.materials["lawpage" if choice == "study" else "dew" if choice == "gather" else "clue"] = 1
	return _ok({"choice":choice,"note":"读残卷、采灵药、探遗迹会分别提高对应专长并带回不同材料。"})

static func _shop(s: Dictionary, id: String, count: int, raw_count: Variant, now: int) -> Dictionary:
	if not _int(raw_count,1,100): return _fail("兑换数量须为1至100")
	var offer: Dictionary = GameData.named(rules().shops,id)
	if offer.is_empty(): return _fail("商品不存在")
	var key: String = "shop:"+GameEconomy.natural_day(now)+":"+id
	var used: int = int(s.progression.shop.get(key,0))
	if used+count > int(offer.limit): return _fail("超过今日限购%d次" % int(offer.limit))
	var costs: Dictionary = {}
	for resource in offer.cost: costs[resource] = int(offer.cost[resource])*count
	if not _pay(s,costs): return _fail("兑换资源不足")
	if not _reward(s,{}, {offer.material:int(offer.amount)*count}): return _fail("材料已满")
	s.progression.shop[key] = used+count
	return _ok({"material":offer.material,"amount":int(offer.amount)*count,"remaining":int(offer.limit)-used-count,"resets":"北京时间次日05:00"})
static func _manager(s: Dictionary, now: int) -> Dictionary:
	var p: Dictionary = s.progression
	var results: Array = []
	if p.manager.claim or p.manager.recover:
		for job in p.jobs:
			if not job.claimed and int(job.readyAt) <= now:
				var trial: Dictionary = s.duplicate(true)
				var result: Dictionary = _claim_job(trial,job.id,now)
				if result.ok:
					# Merge after iteration below: direct claim is now guaranteed affordable.
					results.append(_claim_job(s,job.id,now).data)
	if p.manager.dispatch:
		for hero in s.owned:
			var candidate: Dictionary = s.duplicate(true)
			var result: Dictionary = _start_job(candidate,"herbs",{"target":hero},now)
			if result.ok:
				results.append(_start_job(s,"herbs",{"target":hero},now).data)
				break
	if p.manager.forge:
		var candidate: Dictionary = s.duplicate(true)
		var result: Dictionary = _forge(candidate,true)
		if result.ok: results.append(_forge(s,true).data)
	if results.is_empty(): return _fail("没有已授权且可执行的事务；不会消耗仙缘或召唤符")
	return _ok({"results":results,"note":"只执行已授权领取、采药派遣与基础炼器；找回使用原事务凭证，不重复发奖。"})
static func _task_claim(s: Dictionary, id: String, now: int) -> Dictionary:
	var p: Dictionary = s.progression
	var tasks: Dictionary = {"forge-10":{"stat":"forged","goal":10,"materials":{"embryo":5}},"train-5":{"stat":"trained","goal":5,"materials":{"abilitypage":5}},"jobs-5":{"stat":"claimed","goal":5,"materials":{"clue":3}}}
	if not tasks.has(id): return _fail("成长目标不存在；日常与签到使用原有任务入口")
	if id in p.tasks.received: return _fail("此成长奖励已经领取")
	var task: Dictionary = tasks[id]
	if int(p.tasks[task.stat]) < int(task.goal): return _fail("尚未达到成长目标")
	if not _reward(s,{},task.materials): return _fail("奖励仓库已满")
	p.tasks.received.append(id)
	return _ok({"id":id,"materials":task.materials.duplicate()})

static func fish_charges(s: Dictionary, now: int) -> int:
	var f: Dictionary = s.get("progression",{}).get("fish",{})
	return mini(5,int(f.get("charges",0))+maxi(0,int((now-int(f.get("regenAt",now)))/3600000)))
static func _fish_command(s: Dictionary, name: String, a: Dictionary, now: int) -> Dictionary:
	var p: Dictionary = s.progression
	var f: Dictionary = p.fish
	var id: String = str(a.get("id",""))
	if name == "progFishCatch":
		var earned: int = maxi(0,int((now-int(f.regenAt))/3600000))
		if earned > 0:
			f.charges = mini(5,int(f.charges)+earned)
			f.regenAt += earned*3600000
		if f.charges <= 0: return _fail("普通垂钓每小时恢复一次，最多积存5次")
		if not _pay(s,{}, {"fishbait":1}): return _fail("需要1份鱼饵")
		var spec: Dictionary = rules().fish[int(_next(p)*rules().fish.size())]
		if not f.owned.has(spec.id): f.owned[spec.id] = {"level":1,"stars":0,"copies":0,"affix":spec.stat,"quality":1,"spent":{}}
		else: f.owned[spec.id].copies += 1
		_record_spent(f.owned[spec.id],{}, {"fishbait":1})
		f.charges -= 1
		return _ok({"id":spec.id,"name":spec.name,"record":f.owned[spec.id].duplicate(true),"charges":f.charges,"note":"重复灵鱼记为同类鳞片，不消耗现有灵鱼。"})
	var record: Dictionary = f.owned.get(id,{})
	if record.is_empty(): return _fail("先钓得此灵鱼")
	match name:
		"progFishTrain":
			if record.level >= 20 or not _pay(s,{"stone":20*int(record.level)},{"fishfood":1}): return _fail("灵鱼已满或饲料不足")
			_record_spent(record,{"stone":20*int(record.level)},{"fishfood":1})
			record.level += 1
		"progFishStar":
			if record.stars >= 5 or record.copies < record.stars+1: return _fail("升星需同类鳞片，且最多5星")
			if not _pay(s,{}, {"fishscale":int(record.stars)+1}): return _fail("点化鳞片不足")
			_record_spent(record,{}, {"fishscale":int(record.stars)+1})
			record.copies -= int(record.stars)+1
			record.stars += 1
		"progFishRoll":
			if f.pending.has(id): return _fail("请先保留或采用待选词条")
			if not _pay(s,{}, {"fishscale":1}): return _fail("调整词条需要灵鱼鳞片")
			_record_spent(record,{}, {"fishscale":1})
			var stats: Array = ["atkPercent","hpPercent","defPercent","critResist","comboResist"]
			f.pending[id] = {"affix":stats[int(_next(p)*stats.size())],"quality":1+int(_next(p)*5)}
			return _ok(f.pending[id].duplicate())
		"progFishChoose":
			if not f.pending.has(id) or not a.get("accept") is bool: return _fail("待选词条不存在")
			if a.accept:
				record.affix = f.pending[id].affix
				record.quality = f.pending[id].quality
			f.pending.erase(id)
		"progFishInherit":
			var donor: Dictionary = f.owned.get(str(a.get("donor","")),{})
			if donor.is_empty() or str(a.get("donor","")) == id or not a.get("confirm") is bool or a.confirm!=true: return _fail("选择另一条灵鱼并确认词条替换；不消耗灵鱼")
			if not _pay(s,{}, {"inheritstone":1}): return _fail("传承石不足")
			_record_spent(record,{}, {"inheritstone":1})
			record.affix = donor.affix
			record.quality = donor.quality
		"progFishSelect":
			var slot: String = str(a.get("slot",""))
			if not slot in ["1","2","3"]: return _fail("请选择1至3号水脉位置")
			if id in f.selected.values() and f.selected.get(slot,"") != id: return _fail("同一条灵鱼不可占两个位置")
			f.selected[slot] = id
	return _ok({"id":id,"record":record.duplicate(true)})

static func _add_effect(result: Dictionary, effect: Dictionary, scale: float = 1.0) -> void:
	for key in effect: result[key] = float(result.get(key,0.0))+float(effect[key])*scale
static func _object_effect(result: Dictionary, item: Dictionary, scale: float = 1.0) -> void:
	if item.is_empty() or not item.get("identified",true): return
	result[item.stat] = float(result.get(item.stat,0.0))+0.003*int(item.level)*int(item.quality)*scale
static func combat_bonus(s: Dictionary, hero_id: String = "") -> Dictionary:
	if not s.get("progression") is Dictionary: return {}
	if s.has("framework"): return load("res://scripts/game_framework.gd").combat_bonus(s,hero_id)
	var p: Dictionary = s.progression
	var result: Dictionary = {}
	_add_effect(result,{"hpPercent":0.018,"atkPercent":0.012,"defPercent":0.012},int(p.realm.level))
	_add_effect(result,rules().directions[p.direction.selected].effect,int(p.direction.levels[p.direction.selected]))
	result[rules().veins[p.vein.branch].stat] = 0.002*int(p.vein.level)*int(p.vein.quality)
	for family in ["spirits","primordial","abilities","mounts","manifestations"]:
		for id in p.selected[family].values():
			var record: Dictionary = _record(p,family,id)
			if record.is_empty(): continue
			_add_effect(result,_spec(family,id).effect,1.0+(int(record.level)-1)*0.1+int(record.stars)*0.25)
	var sets: Dictionary = {}
	for id in p.families.collections:
		var spec: Dictionary = _spec("collections",id)
		var record: Dictionary = p.families.collections[id]
		_add_effect(result,spec.effect,1.0+(int(record.level)-1)*0.1+int(record.stars)*0.25)
		sets[spec.set] = int(sets.get(spec.set,0))+1
	for set_id in sets:
		if sets[set_id] >= 2: _add_effect(result,{"hpPercent":0.015,"atkPercent":0.01})
	_add_effect(result,rules().lifeBranches[p.life.branch].effect,int(p.life.nodes))
	_add_effect(result,{"hpPercent":0.01,"defPercent":0.008},int(p.monument.level)+p.monument.links.size()*0.5)
	for id in p.selected.mounts.values(): _add_effect(result,{"counterResist":0.003},int(p.mountSpirits.get(id,0)))
	_add_effect(result,{"hpPercent":0.005},int(p.root.level)+int(p.grotto.level))
	for law in rules().laws: _add_effect(result,rules().laws[law].effect,int(p.laws[law]))
	for part in rules().body: _add_effect(result,rules().body[part].effect,int(p.body[part]))
	for family in ["ancient","lawcore"]:
		for slot in p.selected[family]:
			var id: String = p.selected[family][slot]
			var scale: float = 0.5 if slot == "helper" else 1.0
			_object_effect(result,object(s,id),scale)
			for socketed in p.sockets.get(id,{}).values(): _object_effect(result,object(s,socketed),scale)
	for id in p.sockets.get("life",{}).values(): _object_effect(result,object(s,id))
	for id in p.source.placements: _object_effect(result,object(s,id))
	for id in p.fish.selected.values():
		var fish: Dictionary = p.fish.owned[id]
		_add_effect(result,{fish.affix:0.001*int(fish.quality)},int(fish.level)+int(fish.stars)*3)
	# Rate caps are explicit and shared; the battle consumer applies each rate once
	# per acting unit rather than multiplying a team-wide trigger by five.
	for rate in ["critRate","comboRate","counterRate","recoveryRate","critResist","comboResist","counterResist"]:
		if result.has(rate): result[rate] = clampf(float(result[rate]),0,0.45)
	for rate in ["openingShield","skillBonus","petBonus"]:
		if result.has(rate): result[rate] = clampf(float(result[rate]),0,0.6)
	for key in result: result[key] = float("%.6f" % result[key])
	return result
## Main pet has a single real battle effect; helper and inner cores only modify it.
static func battle_support(s: Dictionary) -> Dictionary:
	if s.has("framework"): return {}
	if not s.get("progression") is Dictionary: return {}
	var p: Dictionary = s.progression
	var id: String = str(p.selected.pets.get("main",""))
	var record: Dictionary = _record(p,"pets",id)
	if record.is_empty(): return {}
	var helper_id: String = str(p.selected.pets.get("helper",""))
	var helper: Dictionary = _record(p,"pets",helper_id)
	var coefficient: float = 0.12+0.01*int(record.level)+0.025*int(record.stars)
	if not helper.is_empty():
		var synergy: Dictionary = {"spring":{"spring":0.06,"flame":0.025,"shell":0.05},"flame":{"spring":0.04,"flame":0.06,"shell":0.025},"shell":{"spring":0.025,"flame":0.05,"shell":0.06}}
		coefficient += float(synergy[record.skill][helper.skill])+0.002*int(helper.level)+0.005*int(helper.stars)
	var core_bonus: Dictionary = {}
	for pet_id in [id,helper_id]:
		for object_id in p.sockets.get("pet:"+pet_id,{}).values(): _object_effect(core_bonus,object(s,object_id),1.0 if pet_id == id else 0.5)
	for value in core_bonus.values(): coefficient += float(value)
	coefficient *= 1.0+float(combat_bonus(s).get("petBonus",0))
	return {"petId":id,"name":_spec("pets",id).name,"skill":record.skill,"coefficient":minf(1.5,coefficient),"interval":6.0,"helperId":helper_id,"scope":"once_per_team"}

static func _reference_map(value: Variant) -> bool:
	if not value is Dictionary: return false
	for key in value:
		if not key is String or key.is_empty() or not value[key] is String or value[key].is_empty(): return false
	return true
static func _spent_map(value: Variant) -> bool:
	if not value is Dictionary: return false
	for key in value:
		if not (key is String or key is StringName) or not _int(value[key],0,999999999): return false
	return true
static func _stat_map(value: Variant) -> bool:
	if not value is Dictionary: return false
	for key in value:
		if not GameEquipment.rules().stats.has(key) and not key in ["comboRate","counterRate","recoveryRate","critResist","comboResist","counterResist","openingShield","skillBonus","petBonus"]: return false
		if not (value[key] is int or value[key] is float) or not is_finite(float(value[key])) or float(value[key]) < 0 or float(value[key]) > 1000000000: return false
	return true
static func _trial_error(s: Dictionary, trial: Dictionary) -> String:
	if not trial.get("id") is String or trial.id.is_empty() or trial.id.length()>140 or not trial.get("kind") in ["realm","life","body","friend","gather"] or not _int(trial.get("level"),1,8) or not _int(trial.get("stageId"),1,12): return "待战试炼记录无效"
	if not _int(trial.get("createdAt"),0,99999999999999) or not _int(trial.get("seed"),0,4294967295) or not trial.get("ruleVersion") is String or trial.ruleVersion.is_empty() or trial.ruleVersion.length()>40 or not trial.get("target") is String: return "试炼时钟或规则快照无效"
	if trial.kind == "friend" and not s.owned.has(trial.target): return "切磋仙友不存在"
	if trial.kind == "gather" and not trial.level in [2,3]: return "聚灵阵挑战位置无效"
	if trial.kind in ["body","life"] and trial.level>4: return "试炼等级无效"
	if not trial.get("team") is Array or trial.team.is_empty() or trial.team.size()>5: return "试炼队伍快照无效"
	var seen: Dictionary = {}
	for member in trial.team:
		if not member is Dictionary or (member.get("id") != "palace-lord" and not s.owned.has(member.get("id"))) or seen.has(member.id) or not _int(member.get("level"),1,20) or not member.get("branch") in ["A","B"] or not _int(member.get("treasure"),0,3) or not member.get("branchUnlocked") is bool or not _stat_map(member.get("equipmentStats")): return "试炼成员快照无效"
		seen[member.id] = true
	var options: Variant = trial.get("options")
	if not options is Dictionary or options.get("battleId")!=trial.id or options.get("seed")!=trial.seed or options.get("ruleVersion")!=trial.ruleVersion or options.get("trial")!=true or options.get("autoOnly")!=true or not options.get("contextName") is String or not options.get("petSupport") is Dictionary: return "试炼选项与快照不符"
	var pet: Dictionary = options.petSupport
	if not pet.is_empty():
		if _spec("pets",str(pet.get("petId",""))).is_empty() or not pet.get("name") is String or not pet.get("skill") in ["spring","flame","shell"] or not (pet.get("coefficient") is float or pet.get("coefficient") is int) or not is_finite(float(pet.coefficient)) or float(pet.coefficient)<0 or float(pet.coefficient)>1.5 or pet.get("interval")!=6 or pet.get("scope")!="once_per_team" or not pet.get("helperId") is String: return "灵兽支援快照无效"
	return ""
static func _formation_error(saved: Variant) -> String:
	# Retired asset references remain readable; a load reports missing assets without
	# making every future transaction fail after a legitimate rebirth or salvage.
	if not saved is Dictionary or not saved.get("team") is Array or saved.team.size()>5 or not _reference_map(saved.get("equipment")) or not saved.get("selected") is Dictionary or not rules().directions.has(saved.get("direction")): return "阵容方案格式无效"
	var seen: Dictionary = {}
	for id in saved.team:
		if not id is String or GameData.character(id).is_empty() or seen.has(id): return "阵容方案神仙重复或无效"
		seen[id] = true
	for slot in saved.equipment:
		if GameData.named(GameEquipment.shared_slots(),slot).is_empty(): return "阵容法宝位置无效"
	for family in ["pets","spirits","primordial","abilities","mounts","manifestations","cosmetics","ancient","lawcore"]:
		if not _reference_map(saved.selected.get(family)): return "阵容伙伴配置无效"
	for family in saved.selected:
		if not family in ["pets","spirits","primordial","abilities","mounts","manifestations","cosmetics","ancient","lawcore"]: return "阵容伙伴分类无效"
	if saved.has("branches"):
		if not saved.branches is Dictionary: return "阵容神仙分支无效"
		for id in saved.branches:
			if not id in saved.team or not saved.branches[id] in ["A","B"]: return "阵容神仙分支无效"
	if saved.has("lifeBranch") and not rules().lifeBranches.has(saved.lifeBranch): return "阵容本命分支无效"
	if saved.has("fish") and not _reference_map(saved.fish): return "阵容灵鱼配置无效"
	if saved.has("sockets"):
		if not saved.sockets is Dictionary: return "阵容镶嵌记录无效"
		for key in saved.sockets:
			if not key is String or not _reference_map(saved.sockets[key]): return "阵容镶嵌记录无效"
	if saved.has("source"):
		if not saved.source is Dictionary: return "阵容本源配置无效"
		for key in saved.source:
			var place: Variant = saved.source[key]
			if not key is String or not place is Dictionary or not _int(place.get("x"),0,5) or not _int(place.get("y"),0,5) or not _int(place.get("rotation"),0,3): return "阵容本源坐标无效"
	return ""
static func validate(s: Dictionary) -> String:
	if not s.get("progression") is Dictionary: return "培养存档格式无效"
	var p: Dictionary = s.progression
	for key in ["materials","receipts","furnace","realm","vein","direction","families","selected","sockets","formations","friends","root","life","monument","mountSpirits","grotto","laws","source","body","gather","shop","manager","tasks","fish","profile","fertile"]:
		if not p.get(key) is Dictionary: return "培养记录缺失："+key
	for key in ["objects","jobs","disciples","graduates","pairHistory"]:
		if not p.get(key) is Array: return "培养清单无效："+key
	if not _int(p.get("version"),1,1) or not _int(p.get("nextId"),1,2147483647) or not _int(p.get("randomState"),1,4294967295) or not _int(p.get("clock"),0,99999999999999): return "培养版本、时钟或随机序列无效"
	if not _int(p.get("managerLastRun"),0,99999999999999): return "管家执行时钟无效"
	if not p.profile.get("name") is String or p.profile.name.strip_edges().is_empty() or p.profile.name.length()>12 or not p.profile.get("signature") is String or p.profile.signature.length()>40: return "府主名片无效"
	if not _int(p.fertile.get("refreshes"),0,2147483647) or not p.fertile.get("points") is Dictionary: return "福地资源点无效"
	for key in ["stone","material","herb"]:
		if not _int(p.fertile.points.get(key),60 if key=="stone" else 12,120 if key=="stone" else 26): return "福地产量无效"
	for key in rules().materials:
		if not _int(p.materials.get(key),0,int(rules().materialCap)): return "专用材料余额无效："+key
	for key in p.materials:
		if not rules().materials.has(key): return "未知专用材料"
	for txid in p.receipts:
		var receipt: Variant = p.receipts[txid]
		if not txid is String or txid.is_empty() or txid.length() > 160 or not receipt is Dictionary or not handles(str(receipt.get("name",""))) or not receipt.get("args") is Dictionary or not receipt.has("data") or receipt.args.get("txid") != txid: return "培养操作凭证无效"
	if not _int(p.furnace.get("level"),1,rules().forgeWeights.size()) or not _int(p.furnace.get("forged"),0,2147483647) or not p.furnace.get("filter") is Dictionary: return "炉鼎记录无效"
	var filter: Dictionary = p.furnace.filter
	if not _int(filter.get("rarity"),3,5) or not _int(filter.get("minGain"),0,10000) or not filter.get("salvage") is bool or not filter.get("stats") is Array: return "自动炼器筛选无效"
	var seen: Dictionary = {}
	for stat in filter.stats:
		if not stat in GameEquipment.rules().substatWeights or seen.has(stat): return "自动炼器词条无效"
		seen[stat] = true
	if not _int(p.realm.get("level"),0,rules().realms.size()-1) or not p.realm.get("passed") is Array or not p.realm.get("pending") is Dictionary: return "府主境界记录无效"
	for group in [p.realm,p.life,p.body]:
		if not group.get("passed") is Array: return "试炼通关记录无效"
		seen.clear()
		for level in group.passed:
			if not _int(level,1,8) or seen.has(str(level)): return "试炼通关记录重复或无效"
			seen[str(level)] = true
	if not p.realm.pending.is_empty():
		var trial_error: String = _trial_error(s,p.realm.pending)
		if not trial_error.is_empty(): return trial_error
	if not _int(p.vein.get("level"),0,20) or not rules().veins.has(p.vein.get("branch")) or not _int(p.vein.get("quality"),1,5) or not p.vein.get("pending") is Dictionary: return "灵脉记录无效"
	if not p.vein.pending.is_empty() and (not rules().veins.has(p.vein.pending.get("branch")) or not _int(p.vein.pending.get("quality"),1,5)): return "灵脉重炼记录无效"
	if not rules().directions.has(p.direction.get("selected")) or not p.direction.get("levels") is Dictionary: return "修炼方向无效"
	for key in rules().directions:
		if not _int(p.direction.levels.get(key),0,10): return "方向节点无效"
	for family in rules().families:
		if not p.families.get(family) is Dictionary: return "收藏记录无效："+family
		for id in p.families[family]:
			var record: Variant = p.families[family][id]
			if _spec(family,id).is_empty() or not record is Dictionary or not _int(record.get("level"),1,45) or not _int(record.get("stars"),0,5) or not _int(record.get("copies"),0,999) or not record.get("spent") is Dictionary or not record.get("locked") is bool or not _int(record.get("rebirths"),0,999): return "收藏培养条目无效："+family
			if record.level > 20+int(record.stars)*5 and family != "cosmetics": return "收藏等级超过星级上限"
			if family == "pets" and not record.get("skill") in ["spring","flame","shell"]: return "灵兽技能无效"
			for key in record.spent:
				if not _int(record.spent[key],0,999999999): return "培养投入台账无效"
	for family in p.families:
		if not rules().families.has(family): return "未知收藏分类"
	for id in p.formations:
		if not id in ["1","2","3"]: return "阵容方案编号无效"
		var formation_error: String = _formation_error(p.formations[id])
		if not formation_error.is_empty(): return formation_error
	var object_ids: Dictionary = {}
	if p.objects.size() > int(rules().objectCap): return "器物背包超限"
	for item in p.objects:
		if not item is Dictionary or not item.get("id") is String or object_ids.has(item.id) or not item.get("kind") in ["petcore","seal","gem","lawcore","chaos","source","ancient"]: return "器物编号或类型无效"
		if not _int(item.get("level"),1,10) or not _int(item.get("quality"),1,3) or not item.get("locked") is bool or not item.get("identified") is bool or not item.get("spent") is Dictionary or not _int(item.get("fusionFailures"),0,4): return "器物培养数据无效"
		if not item.get("stat") in ["atkPercent","hpPercent","defPercent","critRate","counterResist","healBonus","damageBonus"]: return "器物属性无效"
		if not _spent_map(item.spent): return "器物投入台账无效"
		if item.kind=="ancient" and item.identified and GameData.named(rules().ancients,str(item.get("template",""))).is_empty(): return "古宝鉴定档案无效"
		if item.kind=="ancient" and item.has("site") and GameData.named(rules().excavationSites,str(item.site)).is_empty(): return "古宝线索地点无效"
		if item.kind == "source" and (not item.get("shape") is Array or not item.shape in rules().sourceShapes): return "本源碎片形状无效"
		object_ids[item.id] = item
	var occupied_objects: Dictionary = {}
	for family in p.selected:
		if not family in ["pets","spirits","primordial","abilities","mounts","manifestations","cosmetics","ancient","lawcore"]: return "未知伙伴配置分类"
	for family in ["pets","spirits","primordial","abilities","mounts","manifestations","cosmetics","ancient","lawcore"]:
		if not p.selected.get(family) is Dictionary: return "配置记录无效："+family
		seen.clear()
		for slot in p.selected[family]:
			var id: Variant = p.selected[family][slot]
			if not id is String or seen.has(id): return "配置对象重复或无效"
			seen[id] = true
			if family in ["ancient","lawcore"]:
				if not object_ids.has(id) or object_ids[id].kind != family or not object_ids[id].identified: return "器物配置无效"
				if not slot in (["main",str(object_ids[id].template)] if family == "ancient" else ["main","helper"]): return "器物位置无效"
				occupied_objects[id] = true
			else:
				if _record(p,family,id).is_empty(): return "配置未拥有的伙伴"
				var legal: Array = {"pets":["main","helper"],"spirits":["1","2","3"],"primordial":["exclusive"],"abilities":[_spec(family,id).get("category","")],"mounts":["main"],"manifestations":["main"],"cosmetics":["outfit"]}[family]
				if not slot in legal: return "伙伴配置位置无效"
	for target in p.sockets:
		if not target is String or not p.sockets[target] is Dictionary: return "镶嵌记录无效"
		for slot in p.sockets[target]:
			var id: Variant = p.sockets[target][slot]
			if not slot in ["1","2"] or not id is String or not object_ids.has(id) or occupied_objects.has(id): return "同一器物重复镶嵌或位置无效"
			var kind: String = object_ids[id].kind
			var legal: bool = (kind == "petcore" and target.begins_with("pet:") and p.families.pets.has(target.trim_prefix("pet:"))) or (kind == "seal" and target == "life") or (kind == "gem" and object_ids.get(target,{}).get("kind","") == "ancient") or (kind == "chaos" and object_ids.get(target,{}).get("kind","") == "lawcore")
			if not legal: return "镶嵌材料与对象类型不符"
			occupied_objects[id] = true
	if not _int(p.source.get("width"),3,6) or p.source.get("height") != p.source.width or not p.source.get("placements") is Dictionary: return "本源盘面无效"
	var cells: Dictionary = {}
	for id in p.source.placements:
		if not object_ids.has(id) or object_ids[id].kind != "source": return "本源摆放对象无效"
		var place: Variant = p.source.placements[id]
		if not place is Dictionary or not _int(place.get("x"),0,5) or not _int(place.get("y"),0,5) or not _int(place.get("rotation"),0,3): return "本源摆放坐标无效"
		for cell in source_cells(s,id,place.x,place.y,place.rotation):
			if cell[0] < 0 or cell[1] < 0 or cell[0] >= p.source.width or cell[1] >= p.source.height or cells.has(str(cell)): return "本源摆放重叠或越界"
			cells[str(cell)] = true
	if not _int(p.root.get("level"),0,30) or not rules().lifeBranches.has(p.life.get("branch")) or not _int(p.life.get("nodes"),0,20) or not _int(p.monument.get("level"),0,10) or not p.monument.get("links") is Array: return "灵根或法宝长期培养无效"
	seen.clear()
	for link in p.monument.links:
		if not p.families.collections.has(link) or seen.has(link): return "至宝关联无效"
		seen[link] = true
	for id in p.mountSpirits:
		if not p.families.mounts.has(id) or not _int(p.mountSpirits[id],0,10): return "座驾器灵记录无效"
	if not p.grotto.get("regions") is Dictionary or not _int(p.grotto.get("level"),0,15): return "洞天恢复记录无效"
	var total_level: int = 0
	for id in p.grotto.regions:
		if not id in ["mountain","river","stars"] or not _int(p.grotto.regions[id],1,5): return "洞天区域无效"
		total_level += p.grotto.regions[id]
	if total_level != p.grotto.level: return "洞天区域等级不一致"
	for key in rules().laws:
		if not _int(p.laws.get(key),0,20): return "法则节点无效"
	for key in rules().body:
		if not _int(p.body.get(key),0,20): return "炼体节点无效"
	if not _int(p.gather.get("seat"),0,3) or not p.gather.get("helpDay") is String or not p.gather.get("unlocked") is Array or not 1 in p.gather.unlocked: return "聚灵阵记录无效"
	seen.clear()
	for seat in p.gather.unlocked:
		if not _int(seat,1,3) or seen.has(str(seat)): return "聚灵阵位置解锁重复或无效"
		seen[str(seat)] = true
	if p.gather.seat!=0 and not p.gather.seat in p.gather.unlocked: return "聚灵阵当前位置未解锁"
	for key in ["claim","dispatch","forge","recover"]:
		if not p.manager.get(key) is bool: return "管家授权无效"
	for key in ["forged","trained","claimed"]:
		if not _int(p.tasks.get(key),0,2147483647): return "成长任务进度无效"
	if not p.tasks.get("received") is Array: return "成长任务领取记录无效"
	seen.clear()
	for task in p.tasks.received:
		if not task in ["forge-10","train-5","jobs-5"] or seen.has(task): return "成长奖励重复或无效"
		seen[task] = true
	for id in p.friends:
		var friend: Variant = p.friends[id]
		if not s.owned.has(id) or not friend is Dictionary or not _int(friend.get("affection"),0,10000) or not friend.get("talkDay") is String or not friend.get("chapters") is Array or not _int(friend.get("gifts"),0,1000000): return "仙友交情记录无效"
		if friend.has("sparDay") and not friend.sparDay is String: return "仙友切磋日期无效"
		seen.clear()
		for chapter in friend.chapters:
			if not _int(chapter,0,20) or seen.has(str(chapter)): return "仙友故事重复或无效"
			seen[str(chapter)] = true
	var disciple_ids: Dictionary = {}
	if p.disciples.size() > 30: return "弟子住处已满"
	for disciple in p.disciples+p.graduates:
		if not disciple is Dictionary or not disciple.get("id") is String or disciple_ids.has(disciple.id) or not disciple.get("name") is String or not _int(disciple.get("level"),1,20) or not disciple.get("aptitude") is Dictionary or not disciple.get("spent") is Dictionary or not _int(disciple.get("expeditions"),0,2147483647): return "弟子档案无效"
		for talent in ["study","gather","explore"]:
			if not _int(disciple.aptitude.get(talent),1,100): return "弟子资质无效"
		if not _spent_map(disciple.spent) or not disciple.get("mentor") is String or (not disciple.mentor.is_empty() and not s.owned.has(disciple.mentor)): return "弟子传道台账无效"
		disciple_ids[disciple.id] = true
	seen.clear()
	for pair in p.pairHistory:
		if not pair is String or pair.is_empty() or seen.has(pair): return "弟子结伴记录重复或无效"
		seen[pair]=true
	seen.clear()
	var active_jobs: int = 0
	var active_targets: Dictionary = {}
	var active_workers: Dictionary = {}
	for job in p.jobs:
		if not job is Dictionary or not job.get("id") is String or seen.has(job.id) or not job.get("kind") in ["herbs","excavate","lawcore","fertile","gather","disciple","grotto"] or not job.get("target") is String or not _int(job.get("startedAt"),0,99999999999999) or not _int(job.get("readyAt"),int(job.startedAt),99999999999999) or not job.get("claimed") is bool or not job.get("base") is Dictionary or not job.get("materials") is Dictionary or not job.get("extra") is Dictionary: return "派遣事务记录无效"
		seen[job.id] = true
		if not job.claimed:
			active_jobs += 1
			var target_key: String = ("disciple" if job.kind in ["disciple","excavate"] else job.kind)+":"+job.target
			if active_targets.has(target_key): return "同一对象被重复派遣"
			active_targets[target_key]=true
		for key in job.base:
			if not key in GameEconomy.RESOURCE_KEYS or not _int(job.base[key],0,99999): return "事务奖励无效"
		for key in job.materials:
			if not rules().materials.has(key) or not _int(job.materials[key],0,999): return "事务材料奖励无效"
		match job.kind:
			"herbs":
				if not s.owned.has(job.target) or job.base.keys()!=["herb"] or not _int(job.base.herb,20,80) or job.materials!={"dew":3}: return "采药收益快照无效"
			"excavate","disciple":
				if not disciple_ids.has(job.target) or (not job.claimed and GameData.named(p.disciples,job.target).is_empty()): return "派遣弟子档案缺失"
				if not job.base.is_empty(): return "弟子事务收益无效"
				if job.kind=="excavate" and not job.materials.is_empty(): return "发掘奖励无效"
				if job.kind=="excavate" and job.extra.has("site") and GameData.named(rules().excavationSites,str(job.extra.site)).is_empty(): return "发掘线索地点无效"
				if job.kind=="disciple":
					var choice: String = str(job.extra.get("choice",""))
					if not choice in ["","study","gather","explore"]: return "历练事件选择无效"
					var expected: Dictionary = {"disciplescroll":2}
					if not choice.is_empty(): expected[{"study":"lawpage","gather":"dew","explore":"clue"}[choice]]=1
					if job.materials!=expected: return "弟子事件奖励快照无效"
			"lawcore":
				if not rules().laws.has(job.target) or not job.base.is_empty() or not job.materials.is_empty(): return "灵核成型记录无效"
			"fertile":
				if not job.target in ["stone","material","herb"] or job.base.keys()!=[job.target] or not _int(job.base[job.target],60 if job.target=="stone" else 12,120 if job.target=="stone" else 26) or not job.materials.is_empty(): return "福地收益快照无效"
				if job.extra.has("worker"):
					if not s.owned.has(job.extra.worker): return "福地采集仙友无效"
					if not job.claimed:
						if active_workers.has(job.extra.worker): return "同一仙友重复采集福地"
						active_workers[job.extra.worker]=true
			"gather":
				if not job.target in ["1","2","3"] or job.base!={"xp":120+int(job.target)*15} or not job.materials.is_empty(): return "聚灵阵收益快照无效"
			"grotto":
				if not job.target in ["mountain","river","stars"] or not _int(job.extra.get("fromLevel"),0,4) or not job.base.is_empty() or not job.materials.is_empty(): return "洞天恢复事务无效"
	if active_jobs > 12: return "派遣数量超限"
	for key in p.shop:
		if not key is String or not _int(p.shop[key],0,99999): return "限购记录无效"
	if not p.fish.get("owned") is Dictionary or not p.fish.get("selected") is Dictionary or not p.fish.get("pending") is Dictionary or not _int(p.fish.get("charges"),0,5) or not _int(p.fish.get("regenAt"),0,99999999999999): return "灵池记录无效"
	for id in p.fish.owned:
		var fish: Variant = p.fish.owned[id]
		if GameData.named(rules().fish,id).is_empty() or not fish is Dictionary or not _int(fish.get("level"),1,20) or not _int(fish.get("stars"),0,5) or not _int(fish.get("copies"),0,999999) or not _int(fish.get("quality"),1,5) or not fish.get("affix") in ["atkPercent","hpPercent","defPercent","critResist","comboResist"] or not fish.get("spent") is Dictionary: return "灵鱼档案无效"
		if not _spent_map(fish.spent): return "灵鱼投入台账无效"
	seen.clear()
	for slot in p.fish.selected:
		var id: Variant = p.fish.selected[slot]
		if not slot in ["1","2","3"] or not p.fish.owned.has(id) or seen.has(id): return "灵鱼阵位无效"
		seen[id] = true
	for id in p.fish.pending:
		var pending: Variant = p.fish.pending[id]
		if not p.fish.owned.has(id) or not pending is Dictionary or not _int(pending.get("quality"),1,5) or not pending.get("affix") in ["atkPercent","hpPercent","defPercent","critResist","comboResist"]: return "灵鱼待选词条无效"
	return GameEquipment.validate(s)
