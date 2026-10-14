class_name GameFramework
extends RefCounted
## The design baseline adapter. All mutations run inside GameStore's draft/commit.
const LORD := "palace-lord"
static var _rules: Dictionary = {}
static func rules() -> Dictionary:
	if _rules.is_empty(): _rules = GameData.normalize(JSON.parse_string(FileAccess.get_file_as_string("res://data/framework-rules.json")))
	return _rules
static func day(now: int) -> String:
	return Time.get_date_string_from_unix_time(int(now / 1000) + int(rules().dayOffsetSeconds))
static func week(now: int) -> String:
	var seconds: int = int(now / 1000) + int(rules().dayOffsetSeconds)
	var weekday: int = int(Time.get_datetime_dict_from_unix_time(seconds).weekday)
	return Time.get_date_string_from_unix_time(seconds - ((weekday + 6) % 7) * 86400)
static func ensure(s: Dictionary) -> void:
	if not s.has("framework"):
		s.framework = {"version":1,"migration":{"from":"v0.9","at":s.lastTime,"reserveGods":s.team.slice(4)},"lord":{"level":1},"presets":[null,null,null],"lastParties":{},"receipts":{},"godStars":{},"levelLedgers":{},"petShards":{},"gacha":{"selected":"standard","limitedPity":0,"limitedFourPity":0,"exchanged":{}},"estate":{"clock":s.lastTime,"plans":{},"hosts":{},"teams":{},"orders":[],"orderSeq":0},"challenges":{},"mail":[]}
		s.team = s.team.slice(0,4)
		s.slots = 4
		# Old shared items become lord items; never copy an asset into two inventories.
		var shared_ids: Array = s.equipment.get("sharedEquipped",{}).values()
		for artifact in s.equipment.items:
			artifact.ownerKind = "lord" if artifact.id in shared_ids or artifact.sourceId == "furnace" or GameData.named(GameEquipment.slots(),artifact.slot).is_empty() else "god"
		for cid in s.equipment.equipped:
			for slot in s.equipment.equipped[cid].keys():
				if GameEquipment.item(s,s.equipment.equipped[cid][slot]).get("ownerKind") == "lord": s.equipment.equipped[cid].erase(slot)
		s.equipment.sharedActive = false
		for b in s.buildings:
			b.readyAt = 0
			if b.assigned and not s.framework.estate.hosts.has(b.type) and not b.assigned in s.framework.estate.hosts.values(): s.framework.estate.hosts[b.type] = b.assigned
			b.assigned = null
		for id in s.owned: s.framework.levelLedgers[id] = s.owned[id].spent.duplicate(true)
	for disciple in s.progression.disciples:
		if not disciple.has("fixedAptitude"): disciple.fixedAptitude = disciple.aptitude.duplicate(true)
		if not disciple.has("expertise"): disciple.expertise = {"study":0,"gather":0,"explore":0}
		if not disciple.has("levelSpent"): disciple.levelSpent = {}
		if not disciple.has("locked"): disciple.locked = false
		if not disciple.has("highestLevel"): disciple.highestLevel = int(disciple.level)
		if not disciple.has("resetLevel"): disciple.resetLevel = int(disciple.level) if disciple.levelSpent.is_empty() else 1
	var f: Dictionary = s.framework
	if not f.has("highestLevels"):
		f.highestLevels = {}
		for id in s.owned: f.highestLevels[id] = int(s.owned[id].level)
	if not f.has("lifeArtifacts"):
		f.lifeArtifacts = {s.progression.life.branch:{"level":1,"spent":{}}}
	if not f.has("storyNode"): f.storyNode = 1
	for cleared in s.cleared: f.storyNode = maxi(int(f.storyNode),int(cleared)+1)
	for record in s.progression.families.pets.values():
		if not record.has("levelSpent"): record.levelSpent = {}
		if not record.has("highestLevel"): record.highestLevel = int(record.level)
		if not record.has("resetLevel"): record.resetLevel = int(record.level) if record.levelSpent.is_empty() else 1
	load("res://scripts/game_estate_production.gd").ensure(s)
	load("res://scripts/game_challenges.gd").ensure(s)
static func locked(s: Dictionary) -> bool:
	if s.get("mainBattle") or s.get("characterChallenges",{}).get("active") or not s.progression.realm.pending.is_empty(): return true
	if s.get("framework",{}).get("challenges",{}).get("pending"): return true
	var run: Variant = s.expeditions.active
	if run is Dictionary and run.get("status") == "battle": return true
	for run2 in s.activities.runs.values():
		if not run2.get("battle",{}).is_empty(): return true
	return false
static func party(s: Dictionary) -> Array:
	var result: Array = [{"id":LORD,"level":clampi(1+int(s.progression.realm.level)*2,1,20),"branch":"A","treasure":0,"branchUnlocked":true,"equipmentStats":GameEconomy.battle_extras(s,LORD)}]
	for id in s.team.slice(0,4):
		var c: Dictionary = s.owned[id]
		var extras: Dictionary = GameEconomy.battle_extras(s,id)
		result.append({"id":id,"level":c.level,"branch":c.branch,"treasure":c.treasure,"branchUnlocked":id in s.branchUnlocks or c.level >= GameEconomy.config().branchLevel,"equipmentStats":extras})
	return result
static func combat_bonus(s: Dictionary, hero_id: String) -> Dictionary:
	var p: Dictionary = s.progression
	var out: Dictionary = {}
	var lord: bool = hero_id == LORD
	# Explicit scope: personal cultivation is evaluated only for the fixed lord.
	if lord:
		GameProgression._add_effect(out,{"hpPercent":0.018,"atkPercent":0.012,"defPercent":0.012},int(p.realm.level))
		GameProgression._add_effect(out,GameProgression.rules().directions[p.direction.selected].effect,int(p.direction.levels[p.direction.selected]))
		out[GameProgression.rules().veins[p.vein.branch].stat] = 0.002*int(p.vein.level)*int(p.vein.quality)
		GameProgression._add_effect(out,GameProgression.rules().lifeBranches[p.life.branch].effect,int(p.life.nodes))
		for law in GameProgression.rules().laws: GameProgression._add_effect(out,GameProgression.rules().laws[law].effect,int(p.laws[law]))
		for part in GameProgression.rules().body: GameProgression._add_effect(out,GameProgression.rules().body[part].effect,int(p.body[part]))
		for id in p.source.placements: GameProgression._object_effect(out,GameProgression.object(s,id))
		for id in p.sockets.get("life",{}).values(): GameProgression._object_effect(out,GameProgression.object(s,id))
		for id in p.fish.selected.values():
			var fish: Dictionary = p.fish.owned[id]
			GameProgression._add_effect(out,{fish.affix:0.001*int(fish.quality)},int(fish.level)+int(fish.stars)*3)
	for family in ["spirits","primordial","abilities","mounts","manifestations"]:
		if family in ["mounts","manifestations"] and not lord: continue
		for id in p.selected[family].values():
			var record: Dictionary = p.families[family].get(id,{})
			if not record.is_empty(): GameProgression._add_effect(out,GameProgression._spec(family,id).effect,1.0+(int(record.level)-1)*0.1+int(record.stars)*0.25)
	for id in p.families.collections:
		var record: Dictionary = p.families.collections[id]
		GameProgression._add_effect(out,GameProgression._spec("collections",id).effect,1.0+(int(record.level)-1)*0.1+int(record.stars)*0.25)
	var sets: Dictionary = {}
	for id in p.families.collections:
		var spec: Dictionary = GameProgression._spec("collections",id)
		sets[spec.set] = int(sets.get(spec.set,0))+1
	for set_id in sets:
		if sets[set_id] >= 2: GameProgression._add_effect(out,{"hpPercent":0.015,"atkPercent":0.01})
	if lord:
		var life: Dictionary = s.framework.lifeArtifacts.get(p.life.branch,{})
		GameProgression._add_effect(out,GameProgression.rules().lifeBranches[p.life.branch].effect,maxi(0,int(life.get("level",1))-1))
	# First collection bonus and active support; no periodic pet unit or trigger.
	GameProgression._add_effect(out,{"hpPercent":0.001},p.families.spirits.size())
	for slot in ["main","helper"]:
		var id: String = str(p.selected.pets.get(slot,""))
		var pet: Dictionary = p.families.pets.get(id,{})
		if pet.is_empty(): continue
		var scale: float = (1.0 if slot == "main" else 0.5)*(1.0+(int(pet.level)-1)*0.1+int(pet.stars)*0.25)
		var trait_effect: Dictionary = GameProgression._spec("pets",id).effect
		for spec in GameProgression.rules().families.pets.choices:
			if spec.skill == pet.skill: trait_effect = spec.effect
		GameProgression._add_effect(out,trait_effect,scale)
		for core in p.sockets.get("pet:"+id,{}).values(): GameProgression._object_effect(out,GameProgression.object(s,core),1.0 if slot == "main" else 0.5)
	GameProgression._add_effect(out,{"hpPercent":0.01,"defPercent":0.008},int(p.monument.level)+p.monument.links.size()*0.5)
	GameProgression._add_effect(out,{"hpPercent":0.005},int(p.root.level)+int(p.grotto.level))
	if lord:
		for id in p.selected.mounts.values(): GameProgression._add_effect(out,{"counterResist":0.003},int(p.mountSpirits.get(id,0)))
		for family in ["ancient","lawcore"]:
			for slot in p.selected[family]:
				var id: String = p.selected[family][slot]
				GameProgression._object_effect(out,GameProgression.object(s,id),0.5 if slot == "helper" else 1.0)
				for gem in p.sockets.get(id,{}).values(): GameProgression._object_effect(out,GameProgression.object(s,gem))
	for key in out:
		out[key] = float("%.6f" % out[key])
		if key in ["critRate","comboRate","counterRate","recoveryRate","critResist","comboResist","counterResist"]: out[key] = clampf(out[key],0,0.45)
	return out
static func handles(name: String) -> bool:
	return name.begins_with("fw") or name.begins_with("estate") or name.begins_with("challenge") or name in ["saveTeamPreset","applyTeamPreset","progSaveFormation","progLoadFormation","progDiscipleTrain","progLifeBranch","upgradeCharacter","resetCharacter"]
static func command(s: Dictionary, name: String, a: Dictionary, now: int) -> Dictionary:
	var f: Dictionary = s.framework
	var tx: String = str(a.get("txid",""))
	if tx.length() > 160: return GameEconomy.fail("事务编号过长")
	if not tx.is_empty() and f.receipts.has(tx):
		var old: Dictionary = f.receipts[tx]
		if old.name != name or old.args != a: return GameEconomy.fail("事务编号已用于另一项操作")
		return GameEconomy.ok(old.data.duplicate(true) if old.data is Dictionary or old.data is Array else old.data)
	var result: Dictionary = _command(s,name,a,now)
	f = s.framework
	if result.ok and not tx.is_empty(): f.receipts[tx] = {"name":name,"args":a.duplicate(true),"data":result.data}
	return result
static func _command(s: Dictionary, name: String, a: Dictionary, now: int) -> Dictionary:
	if name.begins_with("estate"): return load("res://scripts/game_estate_production.gd").command(s,name,a,now)
	if name.begins_with("challenge"): return load("res://scripts/game_challenges.gd").command(s,name,a,now)
	var f: Dictionary = s.framework
	var id: String = str(a.get("id",""))
	match name:
		"upgradeCharacter":
			if not s.owned.has(id): return GameEconomy.fail("尚未获得这名神仙")
			var c: Dictionary = s.owned[id]
			if c.level >= 20: return GameEconomy.fail("已达当前等级上限")
			var cost: Dictionary = {"stone":25+int(c.level)*20}
			if not GameEconomy.can_afford(s,cost): return GameEconomy.fail("灵石不足")
			GameEconomy.pay(s,cost)
			c.spent.stone += GameEconomy.charged_cost(cost).stone
			c.level += 1
			if c.level >= GameEconomy.config().branchLevel and not id in s.branchUnlocks: s.branchUnlocks.append(id)
			if c.level > int(f.highestLevels.get(id,1)):
				f.highestLevels[id] = c.level
				s.stats.upgrades += 1
				GameEconomy.record_daily(s,"cultivation")
			return GameEconomy.ok(c.level)
		"resetCharacter":
			if locked(s): return GameEconomy.fail("请先结束已锁定的战斗")
			if not s.owned.has(id): return GameEconomy.fail("神仙不存在")
			var c: Dictionary = s.owned[id]
			if not GameEconomy.refund_room(s,c.spent): return GameEconomy.fail("背包空间不足以完整退还")
			var refund: Dictionary = c.spent.duplicate(true)
			GameEconomy.gain(s,refund)
			c.level = 1
			c.spent = {"stone":0,"xp":0}
			return GameEconomy.ok({"refund":refund,"starsRetained":true})
		"fwGodStar":
			if not s.owned.has(id): return GameEconomy.fail("神仙不存在")
			var n: int = int(f.godStars.get(id,0))+1
			if n > 5: return GameEconomy.fail("已达当前星级上限")
			if int(f.petShards.get("god:"+id,0)) < n or not GameEconomy.can_afford(s,{"material":10*n}): return GameEconomy.fail("需要同名神仙碎片和灵材")
			f.petShards["god:"+id] -= n
			GameEconomy.pay(s,{"material":10*n})
			f.godStars[id] = n
			return GameEconomy.ok({"stars":n})
		"saveTeamPreset","progSaveFormation","applyTeamPreset","progLoadFormation":
			var index: int = int(a.get("slot",int(id)-1 if not id.is_empty() else 0))
			if index < 0 or index >= 3: return GameEconomy.fail("只有三个免费方案位置")
			if name in ["saveTeamPreset","progSaveFormation"]:
				var branches: Dictionary = {}
				for cid in s.team: branches[cid] = s.owned[cid].branch
				f.presets[index] = {"name":str(a.get("name","方案%d" % (index+1))).strip_edges().left(16),"team":s.team.duplicate(),"branches":branches,"selected":s.progression.selected.duplicate(true),"direction":s.progression.direction.selected,"lordGear":s.equipment.sharedEquipped.duplicate(),"godGear":s.equipment.equipped.duplicate(true),"life":s.progression.life.branch,"fish":s.progression.fish.selected.duplicate(true),"sockets":s.progression.sockets.duplicate(true),"source":s.progression.source.placements.duplicate(true)}
				return GameEconomy.ok({"saved":index+1})
			if locked(s): return GameEconomy.fail("战斗中不能更换已锁定快照")
			var saved: Variant = f.presets[index]
			if not saved is Dictionary: return GameEconomy.fail("此方案尚未保存")
			var warnings: Array = []
			var team: Array = []
			for cid in saved.team:
				if s.owned.has(cid) and not cid in team and team.size() < 4: team.append(cid)
				else: warnings.append("神仙不可用："+str(cid))
			if not team.is_empty(): s.team = team
			for family in saved.selected:
				s.progression.selected[family] = {}
				for slot in saved.selected[family]:
					var obj: String = str(saved.selected[family][slot])
					if s.progression.families.get(family,{}).has(obj) or not GameProgression.object(s,obj).is_empty():
						for other_slot in s.progression.selected[family].keys():
							if other_slot != slot and s.progression.selected[family][other_slot] == obj: s.progression.selected[family].erase(other_slot)
						s.progression.selected[family][slot] = obj
					else: warnings.append("配置不可用："+obj)
			var used: Array = []
			s.equipment.equipped = {}
			for cid in saved.godGear:
				if not s.owned.has(cid): continue
				for slot in saved.godGear[cid]:
					var gear: Dictionary = GameEquipment.item(s,saved.godGear[cid][slot])
					if gear.is_empty() or gear.get("ownerKind") != "god" or gear.id in used: warnings.append("装备不可用："+str(saved.godGear[cid][slot])); continue
					used.append(gear.id)
					for other in s.equipment.equipped:
						for pos in s.equipment.equipped[other].keys():
							if s.equipment.equipped[other][pos] == gear.id: s.equipment.equipped[other].erase(pos)
					if not s.equipment.equipped.has(cid): s.equipment.equipped[cid] = {}
					s.equipment.equipped[cid][slot] = gear.id
			s.equipment.sharedEquipped = {}
			for slot in saved.lordGear:
				var gear: Dictionary = GameEquipment.item(s,saved.lordGear[slot])
				if gear.is_empty() or gear.get("ownerKind") != "lord": warnings.append("府主装备不可用："+str(saved.lordGear[slot]))
				else: s.equipment.sharedEquipped[slot] = gear.id
			s.progression.direction.selected = saved.direction
			if f.lifeArtifacts.has(saved.life): s.progression.life.branch = saved.life
			else: warnings.append("本命法宝未收集："+saved.life)
			for cid in saved.get("branches",{}):
				if not s.owned.has(cid): continue
				if saved.branches[cid] == "A" or cid in s.branchUnlocks: s.owned[cid].branch = saved.branches[cid]
				else: warnings.append("神仙分支未解锁："+cid)
			# Validate each asset separately: one missing gem must not discard
			# every other usable socket, fish or placement in this preset.
			if saved.has("fish"):
				s.progression.fish.selected = {}
				for slot in saved.fish:
					var candidate: Dictionary = s.duplicate(true)
					candidate.progression.fish.selected[slot] = saved.fish[slot]
					if GameProgression.validate(candidate).is_empty(): s.progression.fish.selected = candidate.progression.fish.selected
					else: warnings.append("灵鱼不可用："+str(saved.fish[slot]))
			if saved.has("sockets"):
				s.progression.sockets = {}
				for target in saved.sockets:
					for slot in saved.sockets[target]:
						var candidate: Dictionary = s.duplicate(true)
						if not candidate.progression.sockets.has(target): candidate.progression.sockets[target] = {}
						candidate.progression.sockets[target][slot] = saved.sockets[target][slot]
						if GameProgression.validate(candidate).is_empty(): s.progression.sockets = candidate.progression.sockets
						else: warnings.append("镶嵌不可用："+str(saved.sockets[target][slot]))
			if saved.has("source"):
				s.progression.source.placements = {}
				for object_id in saved.source:
					var candidate: Dictionary = s.duplicate(true)
					candidate.progression.source.placements[object_id] = saved.source[object_id].duplicate(true)
					if GameProgression.validate(candidate).is_empty(): s.progression.source.placements = candidate.progression.source.placements
					else: warnings.append("本源摆放不可用："+str(object_id))
			return GameEconomy.ok({"warnings":warnings,"message":"已应用可用部分"})
		"progDiscipleTrain","fwResetDisciple":
			var d: Dictionary = GameData.named(s.progression.disciples,id)
			if d.is_empty(): return GameEconomy.fail("弟子不存在")
			if name == "fwResetDisciple":
				if not GameEconomy.refund_room(s,d.levelSpent): return GameEconomy.fail("背包空间不足")
				GameEconomy.gain(s,d.levelSpent)
				var refund: Dictionary = d.levelSpent.duplicate()
				d.level = int(d.resetLevel); d.levelSpent = {}
				return GameEconomy.ok({"refund":refund,"aptitudeRetained":true,"expertiseRetained":true})
			if d.level >= 20: return GameEconomy.fail("弟子等级已满")
			var cost: Dictionary = {"stone":50*int(d.level)}
			if not GameEconomy.can_afford(s,cost): return GameEconomy.fail("灵石不足")
			GameEconomy.pay(s,cost)
			d.levelSpent.stone = int(d.levelSpent.get("stone",0))+int(GameEconomy.charged_cost(cost).stone)
			d.level += 1
			if d.level > int(d.highestLevel): d.highestLevel = d.level; s.progression.tasks.trained += 1
			return GameEconomy.ok(d.duplicate(true))
		"fwPetSummon":
			if not GameEconomy.can_afford(s,{"stone":240}): return GameEconomy.fail("灵石不足")
			var choices: Array = GameProgression.rules().families.pets.choices
			var pet: Dictionary = choices[int(GameEconomy.next_random(s,"summon")*choices.size())]
			GameEconomy.pay(s,{"stone":240})
			var duplicate: bool = s.progression.families.pets.has(pet.id)
			if duplicate: s.progression.families.pets[pet.id].copies += 1
			else: s.progression.families.pets[pet.id] = {"level":1,"stars":0,"copies":0,"spent":{},"levelSpent":{},"locked":false,"rebirths":0,"skill":pet.skill}
			return GameEconomy.ok({"id":pet.id,"duplicate":duplicate})
		"fwPetTrain","fwPetReset":
			var record: Dictionary = s.progression.families.pets.get(id,{})
			if record.is_empty(): return GameEconomy.fail("灵兽不存在")
			if not record.has("levelSpent"): record.levelSpent = {}
			if name == "fwPetReset":
				if locked(s): return GameEconomy.fail("战斗中不能重置")
				if not GameEconomy.refund_room(s,record.levelSpent): return GameEconomy.fail("背包空间不足")
				var refund: Dictionary = record.levelSpent.duplicate(); GameEconomy.gain(s,refund)
				record.level = int(record.resetLevel); record.levelSpent = {}
				return GameEconomy.ok({"refund":refund})
			if record.level >= 20+int(record.stars)*5: return GameEconomy.fail("灵兽等级已满")
			var cost: Dictionary = {"stone":35*int(record.level)}
			if not GameEconomy.can_afford(s,cost): return GameEconomy.fail("灵石不足")
			GameEconomy.pay(s,cost); record.level += 1
			if record.level > int(record.highestLevel): record.highestLevel = record.level; s.progression.tasks.trained += 1
			record.levelSpent.stone = int(record.levelSpent.get("stone",0))+int(GameEconomy.charged_cost(cost).stone)
			return GameEconomy.ok(record.duplicate(true))
		"fwDiscipleLock":
			var disciple: Dictionary = GameData.named(s.progression.disciples,id)
			if disciple.is_empty() or not a.get("value") is bool: return GameEconomy.fail("弟子或锁定选项无效")
			disciple.locked = a.value
			return GameEconomy.ok(disciple.duplicate(true))
		"fwLifeAcquire","fwLifeSelect","progLifeBranch","fwLifeTrain","fwLifeReset":
			if not GameProgression.rules().lifeBranches.has(id): return GameEconomy.fail("本命法宝不存在")
			var record: Dictionary = f.lifeArtifacts.get(id,{})
			if name == "fwLifeAcquire":
				if not record.is_empty(): return GameEconomy.fail("已收集此本命法宝")
				var cost: Dictionary = {"stone":int(rules().lifeAcquireCost)}
				if not GameEconomy.can_afford(s,cost): return GameEconomy.fail("灵石不足")
				GameEconomy.pay(s,cost); f.lifeArtifacts[id] = {"level":1,"spent":{}}
				return GameEconomy.ok({"id":id})
			if record.is_empty(): return GameEconomy.fail("请先收集此本命法宝")
			if name in ["fwLifeSelect","progLifeBranch"]:
				if locked(s): return GameEconomy.fail("请先结束锁定战斗")
				s.progression.life.branch = id; return GameEconomy.ok({"id":id})
			if name == "fwLifeReset":
				if locked(s): return GameEconomy.fail("请先结束锁定战斗")
				if not GameEconomy.refund_room(s,record.spent): return GameEconomy.fail("背包空间不足")
				var refund: Dictionary = record.spent.duplicate(); GameEconomy.gain(s,refund)
				record.spent = {}; record.level = 1; return GameEconomy.ok({"refund":refund})
			if record.level >= 20: return GameEconomy.fail("普通等级已满")
			var cost: Dictionary = {"stone":35*int(record.level)}
			if not GameEconomy.can_afford(s,cost): return GameEconomy.fail("灵石不足")
			GameEconomy.pay(s,cost)
			record.spent.stone = int(record.spent.get("stone",0))+int(GameEconomy.charged_cost(cost).stone); record.level += 1
			return GameEconomy.ok(record.duplicate(true))
		"fwAdvancedForge":
			if int(s.progression.materials.embryo) < int(rules().advancedForgeEmbryos): return GameEconomy.fail("高级宝胚不足；基础炼器依然免费")
			var available: Array = []
			for rarity in GameProgression.rules().forgeWeights[int(s.progression.furnace.level)-1]:
				if float(GameProgression.rules().forgeWeights[int(s.progression.furnace.level)-1][rarity]) > 0: available.append(int(rarity))
			available.sort()
			var minimum: int = available[maxi(0,available.size()-2)]
			var r: Dictionary = GameProgression._forge(s,false,minimum,float(rules().advancedForgeTopWeightMultiplier))
			if not r.ok: return r
			s.progression.materials.embryo -= int(rules().advancedForgeEmbryos)
			r.data.minimum = minimum
			return r
		"fwRecallParty":
			if locked(s): return GameEconomy.fail("请先结束锁定战斗")
			var remembered: Array = f.lastParties.get(id,[])
			if remembered.is_empty(): return GameEconomy.fail("此玩法尚未记录阵容")
			s.team = remembered.filter(func(cid: String) -> bool: return s.owned.has(cid)).slice(0,4)
			return GameEconomy.ok({"team":s.team.duplicate()})
		"fwCorrectArtifact": return _correct(s,a,now)
		"fwSetPool":
			if not id in ["standard","limited-new","limited-rerun"]: return GameEconomy.fail("卡池不存在")
			f.gacha.selected = id
			return GameEconomy.ok(id)
		"fwLimitedExchange":
			var pool: String = f.gacha.selected
			if pool == "standard": return GameEconomy.fail("请先选择限定卡池")
			var featured: String = featured(pool)
			var period: String = pool+":"+str(rules().limitedPeriod)
			if f.gacha.exchanged.has(period): return GameEconomy.fail("本期此卡池已兑换一次")
			var cost: Dictionary = {"fate":int(GameEconomy.gacha_config().redeemCost.divine)}
			if not GameEconomy.can_afford(s,cost): return GameEconomy.fail("仙缘不足")
			GameEconomy.pay(s,cost)
			if s.owned.has(featured): f.petShards["god:"+featured] = int(f.petShards.get("god:"+featured,0))+1
			GameEconomy.grant(s,featured); f.gacha.exchanged[period] = now
			return GameEconomy.ok({"id":featured,"pityUnchanged":true})
	return GameEconomy.fail("未知框架操作："+name)
static func featured(pool: String) -> String:
	return str(rules().featured.get(pool,""))
static func _correct(s: Dictionary, a: Dictionary, now: int) -> Dictionary:
	var artifact: Dictionary = GameEquipment.item(s,str(a.get("id","")))
	if artifact.is_empty() or artifact.get("ownerKind") != "god": return GameEconomy.fail("请选择神仙套装")
	var index: int = int(a.get("event",-1))
	var target: String = str(a.get("stat",""))
	if index < 0 or index >= artifact.enhancements.size(): return GameEconomy.fail("请选择一次已发生的强化")
	var event: Dictionary = artifact.enhancements[index]
	if event.type != "roll" or target == event.stat: return GameEconomy.fail("只能调整已有副词条的一次增量")
	var target_sub: Dictionary = GameData.named(artifact.substats,target)
	for sub in artifact.substats:
		if sub.stat == target: target_sub = sub
	if target_sub.is_empty(): return GameEconomy.fail("不能新增副词条")
	var existed: bool = artifact.substats.slice(0,artifact.initialCount).any(func(x: Dictionary) -> bool: return x.stat == target)
	for i in range(index):
		if artifact.enhancements[i].stat == target: existed = true
	if not existed: return GameEconomy.fail("此副词条在该强化时尚未存在")
	var key: String = "correction:"+day(now)
	if s.framework.receipts.has(key): return GameEconomy.fail("今日免费调整已用；付费渠道尚未接入")
	var old_stat: String = event.stat
	var tier: int = event.tier
	for sub in artifact.substats:
		var rolls: Array = []
		if artifact.substats.find(sub) < int(artifact.initialCount): rolls.append(sub.rolls[0])
		for i in range(artifact.enhancements.size()):
			var e: Dictionary = artifact.enhancements[i]
			if (target if i == index else str(e.stat)) == sub.stat: rolls.append(int(e.tier))
		var value: float = 0
		for roll in rolls: value += GameEquipment._sub_value(sub.stat,int(roll),artifact.rarity)
		sub.rolls = rolls; sub.value = GameEquipment._round_stat(value)
	artifact.enhancements[index].stat = target
	artifact.enhancements[index].value = GameEquipment._sub_value(target,tier,artifact.rarity)
	s.framework.receipts[key] = {"name":"fwCorrectArtifact","args":{},"data":{"id":artifact.id,"from":old_stat,"to":target}}
	return GameEconomy.ok({"id":artifact.id,"from":old_stat,"to":target})
static func validate(s: Dictionary) -> String:
	var f: Variant = s.get("framework")
	if not f is Dictionary or f.get("version") != 1: return "执行基线存档版本无效"
	if not f.get("presets") is Array or f.presets.size() != 3: return "阵容方案记录无效"
	if s.slots != 4 or s.team.size() > 4: return "府主之外最多四位神仙"
	for field in ["highestLevels","lifeArtifacts","receipts","godStars","petShards","lastParties","gacha"]:
		if not f.get(field) is Dictionary: return "执行基线字段无效："+field
	if not GameEconomy._nat(f.get("storyNode"),9999999) or int(f.storyNode) < 1: return "主线章节进度无效"
	if not f.gacha.get("selected") in ["standard","limited-new","limited-rerun"] or not GameEconomy._nat(f.gacha.get("limitedPity"),89) or not GameEconomy._nat(f.gacha.get("limitedFourPity"),9) or not f.gacha.get("exchanged") is Dictionary: return "限定卡池记录无效"
	for id in f.godStars:
		if not s.owned.has(id) or not GameEconomy._nat(f.godStars[id],5): return "神仙星级记录无效"
	for id in f.petShards:
		if not id is String or not GameEconomy._nat(f.petShards[id],9999999): return "碎片账本无效"
	for id in f.lifeArtifacts:
		var record: Variant = f.lifeArtifacts[id]
		if not GameProgression.rules().lifeBranches.has(id) or not record is Dictionary or not GameEconomy._nat(record.get("level"),20) or record.level < 1 or not record.get("spent") is Dictionary: return "本命法宝收藏无效"
		for key in record.spent:
			if not s.resources.has(key) or not GameEconomy._nat(record.spent[key],999999): return "本命法宝投入无效"
	if not f.lifeArtifacts.has(s.progression.life.branch): return "已装配本命法宝未收集"
	for id in f.receipts:
		var receipt: Variant = f.receipts[id]
		if not id is String or id.is_empty() or id.length() > 160 or not receipt is Dictionary or not receipt.get("name") is String or not receipt.get("args") is Dictionary or not receipt.has("data"): return "执行基线事务凭证无效"
	for preset in f.presets:
		if preset == null: continue
		if not preset is Dictionary or not preset.get("name") is String or not preset.get("team") is Array or preset.team.size() > 4 or not preset.get("selected") is Dictionary or not preset.get("lordGear") is Dictionary or not preset.get("godGear") is Dictionary or not GameProgression.rules().directions.has(preset.get("direction")) or not GameProgression.rules().lifeBranches.has(preset.get("life")): return "阵容方案结构无效"
	var mail_ids: Array = []
	if not f.get("mail") is Array: return "补领箱无效"
	for mail in f.mail:
		if not mail is Dictionary or not mail.get("id") is String or mail.id in mail_ids or not mail.get("reward") is Dictionary or not mail.get("claimed") is bool: return "补领箱记录重复或无效"
		mail_ids.append(mail.id)
		for key in mail.reward:
			if not s.resources.has(key) or not GameEconomy._nat(mail.reward[key],999999): return "补领奖励无效"
	for d in s.progression.disciples:
		if d.get("fixedAptitude") != d.aptitude: return "弟子初始资质被修改"
		if not d.get("expertise") is Dictionary or not d.get("levelSpent") is Dictionary or not d.get("locked") is bool: return "弟子成长记录无效"
		for key in ["study","gather","explore"]:
			if not GameEconomy._nat(d.expertise.get(key),1000): return "弟子专长无效"
		if not d.get("workMs") is Dictionary: return "弟子工作经验余量无效"
		for skill in ["study","gather","explore"]:
			if not GameEconomy._nat(d.workMs.get(skill),59999): return "弟子工作经验余量无效"
		for key in d.levelSpent:
			if not s.resources.has(key) or not GameEconomy._nat(d.levelSpent[key],999999): return "弟子等级投入无效"
		if not GameEconomy._nat(d.get("resetLevel"),20) or d.resetLevel < 1 or d.resetLevel > d.level or not GameEconomy._nat(d.get("highestLevel"),20) or d.highestLevel < d.level: return "弟子等级历史无效"
	for record in s.progression.families.pets.values():
		if not record.get("levelSpent") is Dictionary or not GameEconomy._nat(record.get("resetLevel"),45) or record.resetLevel < 1 or record.resetLevel > record.level or not GameEconomy._nat(record.get("highestLevel"),45) or record.highestLevel < record.level: return "灵兽等级历史无效"
		for key in record.levelSpent:
			if not s.resources.has(key) or not GameEconomy._nat(record.levelSpent[key],999999): return "灵兽等级投入无效"
	return load("res://scripts/game_estate_production.gd").validate(s) if load("res://scripts/game_challenges.gd").validate(s).is_empty() else load("res://scripts/game_challenges.gd").validate(s)
