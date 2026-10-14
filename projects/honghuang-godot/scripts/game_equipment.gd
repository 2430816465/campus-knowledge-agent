class_name GameEquipment
extends RefCounted
## Original five-slot artifact rules. All rolls use a private persisted xorshift32 stream.
## Read/preview APIs never mutate, draw RNG, or predict a pending random result.
## Public commands are atomic even outside GameStore; rewards are internal settlement hooks.
static var _rules: Dictionary = {}
const COMMANDS = ["equipArtifact", "unequipArtifact", "lockArtifact", "favoriteArtifact", "enhanceArtifact", "salvageArtifacts", "equipBestArtifacts"]

static func rules() -> Dictionary:
	if _rules.is_empty(): _rules = GameData.normalize(JSON.parse_string(FileAccess.get_file_as_string("res://data/equipment-rules.json")))
	return _rules
static func slots() -> Array: return rules().slots
## Legacy five IDs remain stable. The shared loadout extends them without rewriting items.
static func shared_slots() -> Array: return slots() + rules().get("sharedExtraSlots", [])
static func shared_item(s: Dictionary, slot_id: String) -> Dictionary:
	return item(s, str(s.get("equipment", {}).get("sharedEquipped", {}).get(slot_id, "")))
static func active_loadout(s: Dictionary, character_id: String) -> Dictionary:
	var e: Dictionary = s.get("equipment", {})
	if s.has("framework"): return e.get("sharedEquipped",{}) if character_id == "palace-lord" else e.get("equipped",{}).get(character_id,{})
	return e.get("sharedEquipped", {}) if e.get("sharedActive", false) else e.get("equipped", {}).get(character_id, {})
static func rarity_rules(rarity: int) -> Dictionary: return rules().rarities.get(str(rarity), {})
static func max_level(rarity: int) -> int: return int(rarity_rules(rarity).get("maxLevel", 0))
static func _ok(data: Variant = null) -> Dictionary: return {"ok": true, "error": "", "data": data}
static func _fail(message: String) -> Dictionary: return {"ok": false, "error": message, "data": null}
static func ensure_state(s: Dictionary) -> void:
	if not s.has("equipment"):
		s.equipment = {"items": [], "equipped": {}, "nextId": 1, "randomState": maxi(1, (int(s.get("createdAt", 1)) ^ 0xa341316c) & 0xffffffff)}
	if s.equipment is Dictionary:
		if not s.equipment.has("version"): s.equipment.version = 1
		if not s.equipment.has("rewardHistory"): s.equipment.rewardHistory = {}
		if not s.equipment.has("commandHistory"): s.equipment.commandHistory = {}
static func _next(e: Dictionary) -> float:
	var value: int = int(e.randomState) & 0xffffffff
	if value == 0: value = 1
	value = (value ^ (value << 13)) & 0xffffffff
	value = (value ^ (value >> 17)) & 0xffffffff
	value = (value ^ (value << 5)) & 0xffffffff
	e.randomState = value
	return float(value) / 4294967296.0
static func _weighted(e: Dictionary, weights: Dictionary) -> String:
	var total: float = 0.0
	for value in weights.values(): total += float(value)
	var choice: float = _next(e) * total
	for key in weights:
		choice -= float(weights[key])
		if choice < 0: return str(key)
	return str(weights.keys()[-1])
static func _choose(e: Dictionary, values: Array) -> Variant: return values[mini(values.size() - 1, int(_next(e) * values.size()))]
static func _tier(e: Dictionary) -> int:
	var weights: Dictionary = {}
	for i in range(rules().tierWeights.size()): weights[str(i)] = rules().tierWeights[i]
	return int(_weighted(e, weights))
static func _round_stat(value: float) -> float: return float("%.6f" % value)
static func item(s: Dictionary, id: String) -> Dictionary:
	return GameData.named(s.get("equipment", {}).get("items", []), id)
## Names stored by older saves are presentation snapshots, not equipment identities.
## Resolve current labels without rewriting the item, receipts, or random stream.
static func display_name(artifact: Dictionary) -> String:
	if artifact.is_empty(): return "未装备"
	var slot_rule: Dictionary = GameData.named(shared_slots(), str(artifact.get("slot", "")))
	var set_rule: Dictionary = GameData.named(rules().sets, str(artifact.get("setId", "")))
	if not slot_rule.is_empty() and not set_rule.is_empty():
		return "%s·%s" % [set_rule.name, slot_rule.name]
	var saved_name: String = str(artifact.get("name", "")).strip_edges()
	return saved_name if not saved_name.is_empty() else "未命名装备"
static func equipped_by(s: Dictionary, id: String) -> String:
	if s.has("framework") and id in s.equipment.get("sharedEquipped",{}).values(): return "府主"
	if s.get("equipment", {}).get("sharedActive", false):
		return "全队" if id in s.equipment.get("sharedEquipped", {}).values() else ""
	for character_id in s.get("equipment", {}).get("equipped", {}):
		if id in s.equipment.equipped[character_id].values(): return str(character_id)
	return ""
static func _new_substat(e: Dictionary, artifact: Dictionary) -> void:
	var weights: Dictionary = rules().substatWeights.duplicate()
	weights.erase(artifact.mainStat)
	for sub in artifact.substats: weights.erase(sub.stat)
	var key: String = _weighted(e, weights)
	var tier: int = _tier(e)
	artifact.substats.append({"stat": key, "value": _sub_value(key, tier, int(artifact.rarity)), "rolls": [tier]})
static func _sub_value(key: String, tier: int, rarity: int) -> float:
	return _round_stat(float(rules().substatTiers[key][tier]) * float(rarity_rules(rarity).scale))
static func main_value(key: String, rarity: int, level: int) -> float:
	return float(rarity_rules(rarity).mainValues[key][clampi(level, 0, max_level(rarity))])
static func _drop_weights(stage_id: int) -> Dictionary:
	for band in rules().dropBands:
		if stage_id <= int(band.maxStage): return band.weights
	return rules().dropBands[-1].weights

## Internal API: only a victorious battle/expedition settlement may grant these rewards.
static func grant_drop(s: Dictionary, options: Dictionary = {}) -> Dictionary:
	ensure_state(s)
	if s.equipment.items.size() >= int(rules().inventoryCapacity): return {}
	var e: Dictionary = s.equipment
	var rarity: int = int(options.get("rarity", 0))
	var slot_id: String = str(options.get("slot", ""))
	var set_id: String = str(options.get("setId", ""))
	if rarity != 0 and not rules().rarities.has(str(rarity)): return {}
	if not slot_id.is_empty() and GameData.named(shared_slots(), slot_id).is_empty(): return {}
	if not set_id.is_empty() and GameData.named(rules().sets, set_id).is_empty(): return {}
	if rarity == 0: rarity = int(_weighted(e, _drop_weights(int(options.get("stageId", 1)))))
	if slot_id.is_empty(): slot_id = _choose(e, slots()).id
	if set_id.is_empty(): set_id = _choose(e, rules().sets).id
	var slot_rule: Dictionary = GameData.named(shared_slots(), slot_id)
	var r: Dictionary = rarity_rules(rarity)
	var count_weights: Dictionary = {}
	for i in range(r.initialCounts.size()): count_weights[str(r.initialCounts[i])] = r.initialWeights[i]
	var count: int = int(_weighted(e, count_weights))
	var main_stat: String = _weighted(e, slot_rule.mainStats)
	var artifact: Dictionary = {"id": "artifact-%d" % int(e.nextId), "name": "", "slot": slot_id, "setId": set_id, "rarity": rarity, "level": 0, "xp": 0, "mainStat": main_stat, "mainValue": main_value(main_stat, rarity, 0), "substats": [], "initialCount": count, "enhancements": [], "locked": false, "favorite": false, "sourceId": str(options.get("sourceId", "battle"))}
	artifact.ownerKind = str(options.get("ownerKind","lord" if artifact.sourceId == "furnace" else "god"))
	artifact.name = display_name(artifact)
	for i in range(count): _new_substat(e, artifact)
	e.nextId = int(e.nextId) + 1
	e.items.append(artifact)
	return artifact.duplicate(true)

static func reward_drops(s: Dictionary, reward_id: String, options: Dictionary = {}, count: int = 1) -> Dictionary:
	if reward_id.is_empty() or reward_id.length() > 160 or count < 1 or count > 20: return _fail("灵装掉落结算参数无效")
	var draft: Dictionary = s.duplicate(true)
	ensure_state(draft)
	var prior_error: String = validate(draft)
	if not prior_error.is_empty(): return _fail(prior_error)
	if draft.equipment.rewardHistory.has(reward_id): return _ok(draft.equipment.rewardHistory[reward_id].duplicate(true))
	if options.has("rarity") and not rules().rarities.has(str(int(options.rarity))): return _fail("灵装星级无效")
	if options.has("slot") and GameData.named(slots(), str(options.slot)).is_empty(): return _fail("灵装部位无效")
	if options.has("setId") and GameData.named(rules().sets, str(options.setId)).is_empty(): return _fail("灵装套装无效")
	var received: Array = []
	var overflow_stone: int = 0
	for i in range(count):
		if draft.equipment.items.size() >= int(rules().inventoryCapacity):
			overflow_stone += 100
		else: received.append(grant_drop(draft, options))
	var credited_stone: int = mini(overflow_stone, maxi(0, int(GameData.economy("ECONOMY").resourceCaps.stone) - int(draft.resources.stone)))
	draft.resources.stone += credited_stone
	var data: Dictionary = {"items": received, "overflowStone": credited_stone, "discardedOverflowStone": overflow_stone - credited_stone, "rewardId": reward_id}
	draft.equipment.rewardHistory[reward_id] = data.duplicate(true)
	s.clear()
	s.merge(draft, true)
	return _ok(data)

static func xp_for_level(rarity: int, level: int) -> int:
	var result: int = 0
	for i in range(clampi(level, 0, max_level(rarity))): result += int(rarity_rules(rarity).xpPerLevel[i])
	return result
static func level_for_xp(rarity: int, xp: int) -> int:
	var level: int = 0
	var spent: int = 0
	for cost in rarity_rules(rarity).xpPerLevel:
		spent += int(cost)
		if xp < spent: break
		level += 1
	return level
static func feed_xp(artifact: Dictionary) -> int:
	return int(rarity_rules(int(artifact.rarity)).feedBaseXp) + int(floor(float(artifact.xp) * float(rules().feedingRecovery)))
static func _materials(s: Dictionary, target_id: String, consume_ids: Array) -> Dictionary:
	var used: Dictionary = {}
	var xp: int = 0
	for id in consume_ids:
		if not id is String or used.has(id) or id == target_id: return _fail("强化材料重复，或包含强化目标本身")
		used[id] = true
		var artifact: Dictionary = item(s, id)
		if artifact.is_empty(): return _fail("材料灵装不存在")
		if artifact.locked or artifact.favorite or not equipped_by(s, id).is_empty(): return _fail("已锁定、收藏或装备中的灵装不能消耗")
		xp += feed_xp(artifact)
	return _ok({"xp": xp, "ids": consume_ids.duplicate()})
static func enhance_preview(s: Dictionary, id: String, target_level: int, consume_ids: Array = []) -> Dictionary:
	var artifact: Dictionary = item(s, id)
	if artifact.is_empty(): return _fail("灵装不存在")
	if artifact.get("ownerKind") == "lord": return _fail("府主普通装备通过炼器更换成长，不单独强化")
	if target_level <= int(artifact.level) or target_level > max_level(int(artifact.rarity)): return _fail("请选择高于当前、且未超过星级上限的强化等级")
	var materials: Dictionary = _materials(s, id, consume_ids)
	if not materials.ok: return materials
	var r: int = int(artifact.rarity)
	var required_xp: int = maxi(0, xp_for_level(r, target_level) - int(artifact.xp))
	var essence: int = int(ceil(maxi(0, required_xp - int(materials.data.xp)) / float(rules().essenceXp)))
	var provided_xp: int = int(materials.data.xp) + essence * int(rules().essenceXp)
	var maximum_xp: int = xp_for_level(r, max_level(r))
	var final_xp: int = mini(maximum_xp, int(artifact.xp) + provided_xp)
	var final_level: int = level_for_xp(r, final_xp)
	var excess_xp: int = maxi(0, int(artifact.xp) + provided_xp - maximum_xp)
	var refund_essence: int = int(excess_xp / int(rules().essenceXp))
	var cost: Dictionary = {"stone": int(ceil(provided_xp * float(rules().stonePerXp)))}
	if int(s.get("items", {}).get(rules().essenceItem, 0)) - essence + refund_essence > int(rules().essenceCap): return _fail("超额经验返还会使灵装精粹超过上限，请减少材料")
	var milestones: Array = []
	var projected_count: int = artifact.substats.size()
	for level in range(int(artifact.level) + 1, final_level + 1):
		if level % int(rules().milestoneEvery) != 0: continue
		var adds: bool = projected_count < int(rules().substatLimit)
		milestones.append({"level": level, "type": "add" if adds else "roll", "targetChance": 0.0 if adds else 1.0 / projected_count, "tierChance": 0.25, "description": "按公开权重新增一条不重复副词条；四档幅度各25%" if adds else "等概率强化已有四条之一；四档幅度各25%"})
		if adds: projected_count += 1
	var have_essence: int = int(s.get("items", {}).get(rules().essenceItem, 0))
	var affordable: bool = GameEconomy.can_afford(s, cost) and have_essence >= essence
	return _ok({"id": id, "fromLevel": int(artifact.level), "targetLevel": final_level, "requestedLevel": target_level, "costs": cost, "cost": cost, "essence": essence, "consumeIds": consume_ids.duplicate(), "materialXp": int(materials.data.xp), "providedXp": provided_xp, "finalXp": final_xp, "refundEssence": refund_essence, "lostXp": excess_xp % int(rules().essenceXp), "mainBefore": artifact.mainValue, "mainAfter": main_value(artifact.mainStat, r, final_level), "milestones": milestones, "affordable": affordable, "probabilityText": "每4级判定一次：副词条不足4条则新增，否则等概率强化已有一条；每次增量四档各25%。预览不会决定或刷新结果。经验暴击关闭。", "warning": "已选择的材料灵装会被消耗，已投入经验按80%继承。" if not consume_ids.is_empty() else ""})

static func command(s: Dictionary, name: String, args: Dictionary = {}) -> Dictionary:
	if not name in COMMANDS: return _fail("未知灵装操作")
	var draft: Dictionary = s.duplicate(true)
	ensure_state(draft)
	var prior_error: String = validate(draft)
	if not prior_error.is_empty(): return _fail(prior_error)
	var txid: String = str(args.get("txid", ""))
	if not txid.is_empty():
		if txid.length() > 160: return _fail("灵装事务编号无效")
		if draft.equipment.commandHistory.has(txid):
			var saved: Dictionary = draft.equipment.commandHistory[txid]
			if saved.name != name or saved.args != args: return _fail("事务编号已用于其他操作")
			return _ok(saved.data.duplicate(true) if saved.data is Dictionary or saved.data is Array else saved.data)
	var result: Dictionary = _command(draft, name, args)
	if not result.ok: return result
	if not txid.is_empty(): draft.equipment.commandHistory[txid] = {"name": name, "args": args.duplicate(true), "data": result.data}
	var error: String = validate(draft)
	if not error.is_empty(): return _fail(error)
	s.clear()
	s.merge(draft, true)
	return result
static func _command(s: Dictionary, name: String, args: Dictionary) -> Dictionary:
	var id: String = str(args.get("id", ""))
	var artifact: Dictionary = item(s, id)
	match name:
		"equipArtifact": return _equip(s, id, str(args.get("characterId", "")))
		"unequipArtifact":
			var character_id: String = str(args.get("characterId", ""))
			var slot_id: String = str(args.get("slot", ""))
			if s.equipment.get("sharedActive", false):
				if not s.equipment.sharedEquipped.has(slot_id): return _fail("此部位没有法宝")
				var shared_old: String = s.equipment.sharedEquipped[slot_id]
				s.equipment.sharedEquipped.erase(slot_id)
				return _ok({"id": shared_old, "slot": slot_id, "shared": true})
			if not s.owned.has(character_id) or GameData.named(slots(), slot_id).is_empty(): return _fail("角色或灵装部位无效")
			if not s.equipment.equipped.get(character_id, {}).has(slot_id): return _fail("此部位没有装备")
			var old: String = str(s.equipment.equipped[character_id][slot_id])
			s.equipment.equipped[character_id].erase(slot_id)
			return _ok({"id": old, "characterId": character_id, "slot": slot_id})
		"lockArtifact", "favoriteArtifact":
			if artifact.is_empty(): return _fail("灵装不存在")
			var key: String = "locked" if name == "lockArtifact" else "favorite"
			if args.has("value") and not args.value is bool: return _fail("灵装标记必须为开或关")
			artifact[key] = args.get("value", not artifact[key])
			return _ok(artifact.duplicate(true))
		"enhanceArtifact":
			if not args.get("consumeIds", []) is Array: return _fail("强化材料清单无效")
			if not _integer(args.get("targetLevel"), 1, 20): return _fail("强化目标等级必须为1至20的整数")
			return _enhance(s, id, int(args.get("targetLevel", 0)), args.get("consumeIds", []))
		"salvageArtifacts":
			if not args.get("ids", []) is Array: return _fail("分解材料清单无效")
			return _salvage(s, args.get("ids", []))
		"equipBestArtifacts": return _equip_best(s, str(args.get("characterId", "")))
	return _fail("未知灵装操作")
static func _equip(s: Dictionary, id: String, character_id: String) -> Dictionary:
	var artifact: Dictionary = item(s, id)
	if artifact.is_empty() or not s.owned.has(character_id): return _fail("灵装不存在或角色尚未结缘")
	if s.has("framework") and (artifact.get("ownerKind") != "god" or GameData.named(slots(),artifact.slot).is_empty()): return _fail("府主炼器装备不能放入神仙五件套")
	if s.equipment.get("sharedActive", false):
		var old_shared: String = str(s.equipment.sharedEquipped.get(artifact.slot, ""))
		s.equipment.sharedEquipped[artifact.slot] = id
		return _ok({"id": id, "slot": artifact.slot, "replacedId": old_shared, "shared": true})
	var owner: String = equipped_by(s, id)
	if not owner.is_empty() and owner != character_id: return _fail("灵装正在由另一位角色使用，请先卸下")
	if not s.equipment.equipped.has(character_id): s.equipment.equipped[character_id] = {}
	var replaced: String = str(s.equipment.equipped[character_id].get(artifact.slot, ""))
	s.equipment.equipped[character_id][artifact.slot] = id
	return _ok({"id": id, "characterId": character_id, "slot": artifact.slot, "replacedId": replaced})
static func _enhance(s: Dictionary, id: String, target_level: int, consume_ids: Array) -> Dictionary:
	if s.has("framework") and item(s,id).get("ownerKind") == "lord": return _fail("府主装备通过免费炼器更换提升，不单件强化")
	var preview: Dictionary = enhance_preview(s, id, target_level, consume_ids)
	if not preview.ok: return preview
	var p: Dictionary = preview.data
	if not p.affordable: return _fail("灵石或灵装精粹不足")
	var artifact: Dictionary = item(s, id)
	GameEconomy.pay(s, p.costs)
	s.items[rules().essenceItem] = int(s.items.get(rules().essenceItem, 0)) - int(p.essence) + int(p.refundEssence)
	var changes: Array = []
	for milestone in p.milestones:
		var change: Dictionary = {"level": int(milestone.level), "type": str(milestone.type)}
		if artifact.substats.size() < int(rules().substatLimit):
			_new_substat(s.equipment, artifact)
			var sub: Dictionary = artifact.substats[-1]
			change.merge({"stat": sub.stat, "tier": int(sub.rolls[0]), "value": sub.value})
		else:
			var index: int = int(_next(s.equipment) * artifact.substats.size())
			var tier: int = _tier(s.equipment)
			var sub: Dictionary = artifact.substats[index]
			var gain: float = _sub_value(sub.stat, tier, int(artifact.rarity))
			sub.value = _round_stat(float(sub.value) + gain)
			sub.rolls.append(tier)
			change.merge({"stat": sub.stat, "tier": tier, "value": gain})
		artifact.enhancements.append(change)
		changes.append(change.duplicate(true))
	artifact.level = int(p.targetLevel)
	artifact.xp = int(p.finalXp)
	artifact.mainValue = p.mainAfter
	s.equipment.items = s.equipment.items.filter(func(a: Dictionary) -> bool: return not a.id in consume_ids)
	_cleanup_retired_loadouts(s, consume_ids)
	return _ok({"item": artifact.duplicate(true), "changes": changes, "costs": p.costs, "essence": p.essence, "consumedIds": consume_ids.duplicate(), "refundEssence": p.refundEssence, "lostXp": p.lostXp})
static func salvage_preview(s: Dictionary, ids: Array) -> Dictionary:
	if ids.is_empty(): return _fail("请先选择要分解的灵装")
	var materials: Dictionary = _materials(s, "", ids)
	if not materials.ok: return materials
	var essence: int = 0
	var embryos: int = 0
	var names: Array = []
	for id in ids:
		var artifact: Dictionary = item(s, id)
		if artifact.get("ownerKind") == "lord": embryos += 1
		essence += int(rarity_rules(int(artifact.rarity)).salvageEssence) + int(floor(float(artifact.xp) * float(rules().feedingRecovery) / float(rules().essenceXp)))
		names.append(display_name(artifact))
	var fits: bool = int(s.items.get(rules().essenceItem, 0)) + essence <= int(rules().essenceCap)
	fits = fits and int(s.progression.materials.embryo)+embryos <= int(GameProgression.rules().materialCap)
	return _ok({"ids": ids.duplicate(), "names": names, "essence": essence, "embryos":embryos, "fits": fits, "warning": "将永久消耗选中的装备。府主装备每件另得1枚高级宝胚；神仙强化经验按80%折算精粹。"})
static func _salvage(s: Dictionary, ids: Array) -> Dictionary:
	var preview: Dictionary = salvage_preview(s, ids)
	if not preview.ok: return preview
	if not preview.data.fits: return _fail("精粹或高级宝胚容量不足，请先使用再分解")
	var essence: int = int(preview.data.essence)
	s.items[rules().essenceItem] = int(s.items.get(rules().essenceItem, 0)) + essence
	s.progression.materials.embryo += int(preview.data.embryos)
	s.equipment.items = s.equipment.items.filter(func(a: Dictionary) -> bool: return not a.id in ids)
	_cleanup_retired_loadouts(s, ids)
	return _ok({"ids": ids.duplicate(), "essence": essence,"embryos":preview.data.embryos})

static func _cleanup_retired_loadouts(s: Dictionary, ids: Array) -> void:
	if not s.equipment.get("sharedActive", false): return
	for hero in s.equipment.equipped:
		for slot in s.equipment.equipped[hero].keys():
			if s.equipment.equipped[hero][slot] in ids: s.equipment.equipped[hero].erase(slot)

static func set_bonuses(s: Dictionary, character_id: String) -> Array:
	if s.has("framework") and character_id == "palace-lord": return []
	var counts: Dictionary = {}
	for id in active_loadout(s, character_id).values():
		var artifact: Dictionary = item(s, str(id))
		if not artifact.is_empty(): counts[artifact.setId] = int(counts.get(artifact.setId, 0)) + 1
	var result: Array = []
	for set_id in counts:
		var spec: Dictionary = GameData.named(rules().sets, set_id)
		if counts[set_id] >= 2: result.append({"setId": set_id, "name": spec.name, "pieces": 2, "count": counts[set_id], "stats": spec.twoPiece.duplicate(), "description": spec.twoDescription})
		if counts[set_id] >= 4: result.append({"setId": set_id, "name": spec.name, "pieces": 4, "count": counts[set_id], "stats": spec.fourPiece.duplicate(), "description": spec.fourDescription})
	return result
static func stats_for(s: Dictionary, character_id: String) -> Dictionary:
	var result: Dictionary = {}
	for id in active_loadout(s, character_id).values():
		var artifact: Dictionary = item(s, str(id))
		if artifact.is_empty(): continue
		result[artifact.mainStat] = float(result.get(artifact.mainStat, 0.0)) + float(artifact.mainValue)
		for sub in artifact.substats: result[sub.stat] = float(result.get(sub.stat, 0.0)) + float(sub.value)
	for bonus in set_bonuses(s, character_id):
		for key in bonus.stats: result[key] = float(result.get(key, 0.0)) + float(bonus.stats[key])
	for key in result: result[key] = _round_stat(result[key])
	return result
static func character_stats(s: Dictionary, character_id: String) -> Dictionary:
	var character: Dictionary = GameData.character(character_id)
	if character.is_empty() or not s.owned.has(character_id): return {}
	var owned: Dictionary = s.owned[character_id]
	var combat: Dictionary = GameData.content("COMBAT_RULES")
	var level: int = clampi(int(owned.level), 1, int(combat.levelCap))
	var treasure: int = clampi(int(owned.treasure), 0, int(combat.treasureCap))
	var extras: Dictionary = stats_for(s, character_id)
	var progression_stats: Dictionary = {}
	if s.has("progression"):
		progression_stats = load("res://scripts/game_progression.gd").combat_bonus(s, character_id)
		for stat in progression_stats: extras[stat] = float(extras.get(stat,0.0)) + float(progression_stats[stat])
	if s.has("framework"):
		for key in ["hpPercent","atkPercent","defPercent"]: extras[key] = float(extras.get(key,0))+int(s.framework.godStars.get(character_id,0))*0.03
	var result: Dictionary = {}
	for key in ["hp", "atk", "def"]:
		var growth: float = float(combat[{"hp": "hpGrowth", "atk": "attackGrowth", "def": "defenseGrowth"}[key]])
		var base: int = int(round(float(character[key]) * (1.0 + (level - 1) * growth + treasure * float(combat.treasureStatGrowth))))
		result[key] = int(round(base * (1.0 + float(extras.get(key + "Percent", 0))) + float(extras.get(key + "Flat", 0))))
	result.speed = maxf(1.0, float(character.speed) + float(extras.get("speedFlat", 0)))
	result.critRate = clampf(float(extras.get("critRate", 0)), 0.0, 1.0)
	result.critDamage = 0.5 + float(extras.get("critDamage", 0))
	result.damageBonus = float(extras.get("damageBonus", 0))
	result.healBonus = float(extras.get("healBonus", 0))
	result.equipmentStats = extras
	result.progressionStats = progression_stats
	return result
static func character_power(s: Dictionary, character_id: String) -> int:
	var stats: Dictionary = character_stats(s, character_id)
	if stats.is_empty(): return 0
	var character: Dictionary = GameData.character(character_id)
	var skill: Dictionary = character.get("skill", {})
	var skill_coefficient: float = float(skill.get("multiplier", 1.0))
	var cooldown: float = maxf(1.0, float(skill.get("cooldown", 2)))
	var skill_score: float = float(stats.atk) * skill_coefficient / cooldown
	var owned: Dictionary = s.owned[character_id]
	if int(owned.level) >= int(GameData.content("COMBAT_RULES").branchesOpenLevel) or character_id in s.get("branchUnlocks", []): skill_score *= 1.15
	var extras: Dictionary = stats.equipmentStats
	skill_score *= 1.0+float(extras.get("skillBonus",0))
	var attack_score: float = float(stats.atk)*3.0*(1.0+float(stats.critRate)*float(stats.critDamage))*(1.0+float(stats.damageBonus))
	attack_score *= 1.0+0.65*float(extras.get("comboRate",0))+0.35*float(extras.get("counterRate",0))
	var sustain: float = float(extras.get("recoveryRate",0))+0.35*float(extras.get("openingShield",0))
	for resistance in ["critResist","comboResist","counterResist"]: sustain += 0.25*float(extras.get(resistance,0))
	return int(round(float(stats.hp)*0.22*(1.0+sustain)+attack_score+float(stats.def)*2.0+float(stats.speed)*1.5+float(stats.atk)*float(stats.healBonus)+skill_score))
static func team_power(s: Dictionary, ids: Array = []) -> int:
	var result: int = 0
	if s.has("framework"):
		var lord_stats: Dictionary = GameCombat.member_stats(load("res://scripts/game_framework.gd").party(s)[0])
		result += int(lord_stats.maxHp*0.22+lord_stats.atk*4+lord_stats.def*2+lord_stats.speed*1.5)
	var team: Array = s.get("team", []) if ids.is_empty() else ids
	for id in team: result += character_power(s, str(id))
	# A main pet supports the whole party once per interval. Its estimate is added
	# once to team power, rather than inflating each of the five character cards.
	if not team.is_empty() and s.has("progression"):
		var support: Dictionary = load("res://scripts/game_progression.gd").battle_support(s)
		var source: Dictionary = character_stats(s,str(team[0]))
		if not support.is_empty() and not source.is_empty():
			var reach: float = maxf(1.0,float(team.size())*0.6) if support.skill=="shell" else 1.0
			result += int(round(float(source.atk)*float(support.coefficient)*2.0*reach))
	return result
static func _equip_best(s: Dictionary, character_id: String) -> Dictionary:
	if not s.owned.has(character_id): return _fail("角色尚未结缘")
	var changes: Array = []
	if s.equipment.get("sharedActive", false):
		for slot_rule in shared_slots():
			var best_id: String = str(s.equipment.sharedEquipped.get(slot_rule.id,""))
			var best_power: int = character_power(s,character_id)
			for artifact in s.equipment.items:
				if artifact.slot != slot_rule.id: continue
				var candidate: Dictionary = s.duplicate(false)
				candidate.equipment = s.equipment.duplicate(false)
				candidate.equipment.sharedEquipped = s.equipment.sharedEquipped.duplicate()
				candidate.equipment.sharedEquipped[slot_rule.id] = artifact.id
				var candidate_power: int = character_power(candidate,character_id)
				if candidate_power > best_power:
					best_id = artifact.id
					best_power = candidate_power
			if not best_id.is_empty(): changes.append(_equip(s,best_id,character_id).data)
		return _ok({"equipped":changes,"power":character_power(s,character_id),"note":"逐部位比较全队共享法宝；保留所有背包物品，不保证全局最优套装。"})
	# Greedy actual-power comparison, includes active set bonuses; never takes another character's gear.
	for slot_rule in slots():
		var best_id: String = str(s.equipment.equipped.get(character_id, {}).get(slot_rule.id, ""))
		var best_power: int = character_power(s, character_id)
		for artifact in s.equipment.items:
			if artifact.slot != slot_rule.id: continue
			if s.has("framework") and artifact.get("ownerKind") != "god": continue
			var owner: String = equipped_by(s, artifact.id)
			if not owner.is_empty() and owner != character_id: continue
			# Only the slot mapping changes while evaluating. Do not copy the whole 500-item bag.
			var candidate: Dictionary = s.duplicate(false)
			candidate.equipment = s.equipment.duplicate(false)
			candidate.equipment.equipped = s.equipment.equipped.duplicate(true)
			_equip(candidate, artifact.id, character_id)
			var candidate_power: int = character_power(candidate, character_id)
			if candidate_power > best_power:
				best_power = candidate_power
				best_id = artifact.id
		if not best_id.is_empty(): changes.append(_equip(s, best_id, character_id).data)
	return _ok({"equipped": changes, "power": character_power(s, character_id), "note": "逐部位按面板战力选取；不会挪用其他角色装备，未保证最佳阵容或最佳套装组合。"})
static func items(s: Dictionary, filters: Dictionary = {}, sort_by: String = "rarity") -> Array:
	var result: Array = []
	for artifact in s.get("equipment", {}).get("items", []):
		if filters.has("slot") and not str(filters.slot).is_empty() and artifact.slot != filters.slot: continue
		if filters.has("setId") and not str(filters.setId).is_empty() and artifact.setId != filters.setId: continue
		if int(filters.get("rarity", 0)) > 0 and int(artifact.rarity) != int(filters.rarity): continue
		if filters.has("mainStat") and not str(filters.mainStat).is_empty() and artifact.mainStat != filters.mainStat: continue
		if filters.get("locked", false) and not artifact.locked: continue
		if filters.get("favorite", false) and not artifact.favorite: continue
		var owner: String = equipped_by(s, artifact.id)
		if filters.get("unequipped", false) and not owner.is_empty(): continue
		if filters.has("characterId") and not str(filters.characterId).is_empty() and owner != str(filters.characterId): continue
		var copy: Dictionary = artifact.duplicate(true)
		copy.equippedBy = owner
		result.append(copy)
	result.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		if sort_by == "level" and a.level != b.level: return a.level > b.level
		if sort_by == "newest": return int(a.id.trim_prefix("artifact-")) > int(b.id.trim_prefix("artifact-"))
		if sort_by == "favorite" and a.favorite != b.favorite: return a.favorite
		if sort_by == "slot" and a.slot != b.slot: return _slot_index(a.slot) < _slot_index(b.slot)
		if a.rarity != b.rarity: return a.rarity > b.rarity
		if a.level != b.level: return a.level > b.level
		return int(a.id.trim_prefix("artifact-")) < int(b.id.trim_prefix("artifact-")))
	return result
static func _slot_index(id: String) -> int:
	for i in range(slots().size()):
		if slots()[i].id == id: return i
	return 0
static func stat_text(key: String, value: float) -> String:
	var spec: Dictionary = rules().stats.get(key, {"name": key, "percent": false})
	return "%s +%.1f%%" % [spec.name, value * 100.0] if spec.percent else "%s +%s" % [spec.name, str(snappedf(value, 0.1))]
static func describe_item(artifact: Dictionary) -> String:
	if artifact.is_empty(): return "空部位"
	var lines: PackedStringArray = ["%s  %d星 +%d/%d" % [display_name(artifact), int(artifact.rarity), int(artifact.level), max_level(int(artifact.rarity))], stat_text(artifact.mainStat, float(artifact.mainValue))]
	for sub in artifact.substats: lines.append("· %s（%d次）" % [stat_text(sub.stat, float(sub.value)), sub.rolls.size()])
	var set_rule: Dictionary = GameData.named(rules().sets, artifact.setId)
	lines.append("2件：%s；4件：%s" % [set_rule.twoDescription, set_rule.fourDescription])
	return "\n".join(lines)

static func _integer(value: Variant, minimum: int, maximum: int) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and float(value) == floor(float(value)) and int(value) >= minimum and int(value) <= maximum
static func validate(s: Dictionary) -> String:
	if not s.get("equipment") is Dictionary: return "灵装存档格式无效"
	var e: Dictionary = s.equipment
	if not e.get("items") is Array or e.items.size() > int(rules().inventoryCapacity) or not e.get("equipped") is Dictionary: return "灵装背包无效"
	if not _integer(e.get("version"), 1, 1) or not _integer(e.get("nextId"), 1, 2147483647) or not _integer(e.get("randomState"), 1, 4294967295): return "灵装版本或随机序列无效"
	if not e.get("rewardHistory") is Dictionary or not e.get("commandHistory") is Dictionary: return "灵装事务记录无效"
	for reward_id in e.rewardHistory:
		var receipt: Variant = e.rewardHistory[reward_id]
		if not reward_id is String or reward_id.is_empty() or reward_id.length() > 160 or not receipt is Dictionary: return "灵装奖励记录无效"
		if receipt.get("rewardId") != reward_id or not receipt.get("items") is Array or receipt.items.size() > 20 or not _integer(receipt.get("overflowStone"), 0, 2000) or not _integer(receipt.get("discardedOverflowStone"), 0, 2000): return "灵装奖励凭证无效"
	for txid in e.commandHistory:
		var receipt: Variant = e.commandHistory[txid]
		if not txid is String or txid.is_empty() or txid.length() > 160 or not receipt is Dictionary: return "灵装操作记录无效"
		if not receipt.get("name") in COMMANDS or not receipt.get("args") is Dictionary or not receipt.has("data") or str(receipt.args.get("txid", "")) != txid: return "灵装操作凭证无效"
	var ids: Dictionary = {}
	for artifact in e.items:
		if not artifact is Dictionary or not artifact.get("id") is String or ids.has(artifact.id): return "灵装编号无效或重复"
		if not artifact.id.begins_with("artifact-") or not artifact.id.trim_prefix("artifact-").is_valid_int(): return "灵装编号格式无效"
		var sequence: int = int(artifact.id.trim_prefix("artifact-"))
		if sequence < 1 or sequence >= int(e.nextId): return "灵装编号序列无效"
		ids[artifact.id] = artifact
		if s.has("framework") and not artifact.get("ownerKind") in ["lord","god"]: return "装备归属无效"
		if not _integer(artifact.get("rarity"), 3, 5): return "灵装星级无效"
		var rarity: int = int(artifact.rarity)
		var slot_rule: Dictionary = GameData.named(shared_slots(), artifact.get("slot"))
		if slot_rule.is_empty() or GameData.named(rules().sets, artifact.get("setId")).is_empty(): return "灵装部位或套装无效"
		if not artifact.get("mainStat") is String or not slot_rule.mainStats.has(artifact.mainStat): return "灵装主词条不适用此部位"
		if not _integer(artifact.get("level"), 0, max_level(rarity)) or not _integer(artifact.get("xp"), 0, xp_for_level(rarity, max_level(rarity))): return "灵装等级或经验无效"
		if level_for_xp(rarity, int(artifact.xp)) != int(artifact.level): return "灵装等级与经验不一致"
		if not artifact.get("mainValue") is int and not artifact.get("mainValue") is float: return "灵装主词条数值无效"
		if not is_finite(float(artifact.mainValue)) or absf(float(artifact.mainValue) - main_value(artifact.mainStat, rarity, int(artifact.level))) > 0.00001: return "灵装主词条与等级不一致"
		if not artifact.get("locked") is bool or not artifact.get("favorite") is bool or not artifact.get("sourceId") is String or not artifact.get("name") is String: return "灵装标记或来源无效"
		if not _integer(artifact.get("initialCount"), rarity - 2, rarity - 1): return "灵装初始副词条数量无效"
		if not artifact.get("substats") is Array or not artifact.get("enhancements") is Array: return "灵装副词条记录无效"
		var milestones: int = int(artifact.level) / int(rules().milestoneEvery)
		if artifact.enhancements.size() != milestones or artifact.substats.size() != mini(int(rules().substatLimit), int(artifact.initialCount) + milestones): return "灵装强化次数不一致"
		var sub_keys: Dictionary = {}
		var roll_count: int = 0
		for sub in artifact.substats:
			if not sub is Dictionary or not sub.get("stat") is String or not rules().substatTiers.has(sub.stat) or sub.stat == artifact.mainStat or sub_keys.has(sub.stat): return "灵装副词条重复或与主词条冲突"
			sub_keys[sub.stat] = true
			if not sub.get("rolls") is Array or sub.rolls.is_empty() or sub.rolls.size() > 6: return "灵装副词条强化档位无效"
			var total: float = 0.0
			for tier in sub.rolls:
				if not _integer(tier, 0, 3): return "灵装副词条档位越界"
				total += _sub_value(sub.stat, int(tier), rarity)
				roll_count += 1
			if (not sub.get("value") is int and not sub.get("value") is float) or not is_finite(float(sub.get("value", NAN))) or absf(float(sub.value) - total) > 0.00001: return "灵装副词条增量校验失败"
		if roll_count != int(artifact.initialCount) + milestones: return "灵装副词条总次数无效"
		var historical_counts: Dictionary = {}
		for index in range(int(artifact.initialCount)): historical_counts[artifact.substats[index].stat] = 1
		for i in range(artifact.enhancements.size()):
			var event: Variant = artifact.enhancements[i]
			if not event is Dictionary or not _integer(event.get("level"), (i + 1) * int(rules().milestoneEvery), (i + 1) * int(rules().milestoneEvery)) or not event.get("type") in ["add", "roll"] or not sub_keys.has(event.get("stat")) or not _integer(event.get("tier"), 0, 3): return "灵装强化历史无效"
			var expected_type: String = "add" if historical_counts.size() < int(rules().substatLimit) else "roll"
			if event.type != expected_type: return "灵装强化新增与强化顺序无效"
			var sub: Dictionary = {}
			for candidate in artifact.substats:
				if candidate.stat == event.stat: sub = candidate
			if event.type == "add":
				if historical_counts.has(event.stat) or artifact.substats[historical_counts.size()].stat != event.stat: return "灵装新增副词条历史无效"
				historical_counts[event.stat] = 0
			elif not historical_counts.has(event.stat): return "灵装强化了尚不存在的副词条"
			var roll_index: int = int(historical_counts[event.stat])
			if roll_index >= sub.rolls.size() or int(sub.rolls[roll_index]) != int(event.tier): return "灵装强化档位历史不一致"
			if (not event.get("value") is int and not event.get("value") is float) or not is_finite(float(event.get("value", NAN))) or absf(float(event.value) - _sub_value(event.stat, int(event.tier), rarity)) > 0.00001: return "灵装强化增量历史不一致"
			historical_counts[event.stat] = roll_index + 1
		for sub in artifact.substats:
			if int(historical_counts.get(sub.stat, 0)) != sub.rolls.size(): return "灵装词条与强化历史不一致"
	var equipped_ids: Dictionary = {}
	for character_id in e.equipped:
		if not s.get("owned", {}).has(character_id) or not e.equipped[character_id] is Dictionary: return "灵装穿戴角色无效"
		for slot_id in e.equipped[character_id]:
			var artifact_id: Variant = e.equipped[character_id][slot_id]
			if not artifact_id is String or not ids.has(artifact_id) or equipped_ids.has(artifact_id) or ids[artifact_id].slot != slot_id: return "灵装穿戴部位冲突或重复"
			if s.has("framework") and (ids[artifact_id].get("ownerKind") != "god" or GameData.named(slots(),slot_id).is_empty()): return "神仙只能穿戴自己的五件套装"
			equipped_ids[artifact_id] = true
	if e.has("sharedEquipped"):
		if not e.sharedEquipped is Dictionary or not e.get("sharedActive", false) is bool: return "全队法宝栏格式无效"
		var shared_ids: Dictionary = {}
		for slot_id in e.sharedEquipped:
			var artifact_id: Variant = e.sharedEquipped[slot_id]
			if not artifact_id is String or not ids.has(artifact_id) or shared_ids.has(artifact_id) or ids[artifact_id].slot != slot_id: return "全队法宝部位冲突或重复"
			if s.has("framework") and (ids[artifact_id].get("ownerKind") != "lord" or equipped_ids.has(artifact_id)): return "府主装备不能与神仙混用"
			shared_ids[artifact_id] = true
	if s.has("framework") and e.get("sharedActive",false): return "两套装备不能共享属性"
	return ""
