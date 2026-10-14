class_name GameCombat
extends RefCounted
## Native deterministic combat engine. Mutates TS-compatible Dictionary snapshots.
## act, auto_act and use_method return true only when a legal action was resolved.
## create returns {error:String} for invalid input; current_actor returns {} at end.
static var _serial: int = 0
static func cfg(key: String) -> Variant: return GameData.content(key)
static func tuning(id: String) -> Dictionary: return cfg("SKILL_TUNING").get(id, {})
static func enemy_cfg(id: String) -> Dictionary: return cfg("ENEMY_SKILLS")[id]
static func status(u: Dictionary, id: String) -> Dictionary:
	for s: Dictionary in u.get("statuses", []):
		if s.id == id: return s
	return {}
static func power(u: Dictionary, id: String) -> float: return float(status(u, id).get("power", 0))
static func unit(b: Dictionary, uid: Variant) -> Dictionary:
	for u: Dictionary in b.units:
		if u.uid == uid: return u
	return {}
static func living(b: Dictionary, side: String = "") -> Array:
	return b.units.filter(func(u: Dictionary) -> bool: return u.hp > 0 and (side.is_empty() or u.side == side))
static func opponents(b: Dictionary, u: Dictionary) -> Array: return living(b, "enemy" if u.side == "ally" else "ally")
static func friends(b: Dictionary, u: Dictionary) -> Array: return living(b, u.side)
static func debuffed(u: Dictionary) -> bool:
	for s: Dictionary in u.statuses:
		if cfg("STATUS_CONFIG").get(s.id, {}).get("debuff", false): return true
	return false
static func transferable_buff(s: Dictionary) -> bool:
	return cfg("STATUS_CONFIG").get(s.id, {}).get("transferable", false) and not s.get("copied", false) and s.get("sourceKind", "") != "boon"
static func has_branch(u: Dictionary) -> bool: return u.level >= cfg("COMBAT_RULES").branchesOpenLevel or u.get("branchUnlocked", false)
static func effective_speed(u: Dictionary) -> float: return u.speed * (1.0 + power(u, "haste"))
static func uids(units: Array) -> Array: return units.map(func(u: Dictionary) -> String: return u.uid)
static func round_sort(b: Dictionary) -> Array:
	var units: Array = living(b)
	units.sort_custom(func(a: Dictionary, z: Dictionary) -> bool:
		var difference: float = effective_speed(z) - effective_speed(a)
		return a.uid < z.uid if difference == 0 else difference < 0)
	return uids(units)
static func lowest(units: Array) -> Dictionary:
	if units.is_empty(): return {}
	var sorted: Array = units.duplicate()
	sorted.sort_custom(func(a: Dictionary, z: Dictionary) -> bool:
		var difference: float = float(a.hp) / a.maxHp - float(z.hp) / z.maxHp
		return a.uid < z.uid if difference == 0 else difference < 0)
	return sorted[0]
static func front_targets(b: Dictionary, u: Dictionary) -> Array:
	var foes: Array = opponents(b, u)
	var front: Array = foes.filter(func(t: Dictionary) -> bool: return t.row == "front")
	return front if not front.is_empty() else foes
static func log_line(b: Dictionary, message: String) -> void: b.log.append("[%d] %s" % [b.round, message])
static func begin_action(b: Dictionary, id: String, actor: Dictionary = {}, kind: String = "", source_id: Variant = null) -> void:
	if kind.is_empty(): kind = "enemy" if actor.get("side") == "enemy" else "character"
	if source_id == null: source_id = actor.get("id")
	b.actionContext = {"id": id, "origin": "direct" if actor else "system", "sourceKind": kind}
	if source_id != null: b.actionContext.sourceId = source_id
	if actor: b.actionContext.actorUid = actor.uid
static func source_key(b: Dictionary, source: Dictionary = {}) -> String:
	if b.actionContext.sourceKind in ["method", "pill", "boon"]: return "%s:%s" % [b.actionContext.sourceKind, b.actionContext.get("sourceId", "")]
	return str(source.get("uid", b.actionContext.get("actorUid", "")))
static func effect_context(b: Dictionary, origin: String, trigger_id: String, source_kind: String = "", source_id: String = "") -> Dictionary:
	var old: Dictionary = b.actionContext
	b.actionContext = old.duplicate()
	b.actionContext.origin = origin
	b.actionContext.triggerId = trigger_id
	if not source_kind.is_empty(): b.actionContext.sourceKind = source_kind
	if not source_id.is_empty(): b.actionContext.sourceId = source_id
	if not b.events.is_empty(): b.actionContext.parentSequence = b.events[-1].sequence
	else: b.actionContext.erase("parentSequence")
	return old
static func claim(b: Dictionary, key: String, scope: String, limit: float = 1) -> bool:
	var scope_id: String = str(b.actionContext.id) if scope == "action" else (str(int(b.round)) if scope == "round" else "all")
	var ledger_key: String = "%s:%s:%s" % [scope, scope_id, key]
	var count: int = int(b.triggerCounts.get(ledger_key, 0))
	if count >= limit: return false
	b.triggerCounts[ledger_key] = count + 1
	return true
static func event(b: Dictionary, type: String, source: Dictionary, targets: Array, amount: Variant = null, text_value: String = "", fx: String = "") -> void:
	var c: Dictionary = GameData.character(source.get("id", ""))
	var e: Dictionary = {"sequence": b.events.size() + 1, "type": type, "targetUids": uids(targets), "fx": fx if not fx.is_empty() else c.get("fx", source.get("role", type)), "actionId": b.actionContext.id, "origin": b.actionContext.origin, "sourceKind": b.actionContext.sourceKind}
	if source: e.actorUid = source.uid
	if amount != null: e.amount = amount
	if not text_value.is_empty(): e.text = text_value
	if c.has("color"): e.color = c.color
	if source and b.actionContext.sourceKind not in ["method", "pill", "boon"]:
		e.sourceKind = "enemy" if source.side == "enemy" else "character"
		e.sourceId = source.id
	elif b.actionContext.has("sourceId"): e.sourceId = b.actionContext.sourceId
	for key: String in ["triggerId", "parentSequence"]:
		if b.actionContext.has(key): e[key] = b.actionContext[key]
	b.events.append(e)
static func trigger(b: Dictionary, id: String, source: Dictionary, targets: Array, text_value: String) -> void:
	var s: Dictionary = b.stats.get(source_key(b, source), {})
	if s: s.triggers[id] = s.triggers.get(id, 0) + 1
	var fx: Dictionary = {"mark":"mark-follow", "nezhaFollow":"mark-follow", "exploit":"formation-pressure", "pearlCounter":"pearl-counter", "counter":"morale-focus", "protect":"morale-focus", "harmonize":"buff-transfer", "combined":"three-cloud-array"}
	event(b, "trigger", source, targets, 1, text_value, fx.get(id, ""))
	b.events[-1].triggerId = id
static func direct_trigger(b: Dictionary) -> bool: return b.actionContext.origin == "direct"
static func boon(b: Dictionary, id: String) -> Dictionary:
	return GameData.named(cfg("BOONS"), id) if id in b.boons else {}
static func with_boon(b: Dictionary, id: String, targets: Array) -> Dictionary:
	var old: Dictionary = effect_context(b, "boon", id, "boon", id)
	trigger(b, id, {}, targets, GameData.named(cfg("BOONS"), id).name)
	return old
static func random_number(b: Dictionary) -> float:
	var x: int = int(b.rng) & 0xffffffff
	x = (x ^ (x << 13)) & 0xffffffff
	x = (x ^ (x >> 17)) & 0xffffffff
	x = (x ^ (x << 5)) & 0xffffffff
	b.rng = x
	return float(x) / 4294967296.0
static func add_status(b: Dictionary, target: Dictionary, id: String, turns: float, strength: float, source: Dictionary = {}) -> void:
	if target.hp <= 0 or not cfg("STATUS_CONFIG").has(id) or (source and source.hp <= 0 and b.actionContext.origin != "periodic"): return
	var old: Dictionary = status(target, id)
	var replaces_source: bool = not old or strength >= old.power
	if old:
		old.turns = max(old.turns, turns)
		old.power = max(old.power, strength)
		if replaces_source:
			if source: old.sourceUid = source.uid
			else: old.erase("sourceUid")
	else:
		var applied: Dictionary = {"id":id, "name":cfg("STATUS_CONFIG")[id].name, "turns":turns, "power":strength, "actionId":b.actionContext.id, "sourceKind":b.actionContext.sourceKind, "stacks":1}
		if source: applied.sourceUid = source.uid
		if b.actionContext.has("sourceId"): applied.sourceId = b.actionContext.sourceId
		target.statuses.append(applied)
	var applied_status: Dictionary = status(target, id)
	if replaces_source:
		applied_status.copied = false
		applied_status.actionId = b.actionContext.id
		applied_status.sourceKind = ("enemy" if source.side == "enemy" else "character") if source and b.actionContext.sourceKind not in ["method", "pill", "boon"] else b.actionContext.sourceKind
		if source and b.actionContext.sourceKind not in ["method", "pill", "boon"]: applied_status.sourceId = source.id
		elif b.actionContext.has("sourceId"): applied_status.sourceId = b.actionContext.sourceId
		else: applied_status.erase("sourceId")
	event(b, "status", source, [target], strength, cfg("STATUS_CONFIG")[id].name)
	var cleansing: Dictionary = GameData.named(cfg("PILLS"), "cleanse") if b.pill == "cleanse" else {}
	if cleansing and target.side == "ally" and cfg("STATUS_CONFIG")[id].debuff and claim(b, "pill:cleanse:" + target.uid, "battle", cleansing.power):
		var context: Dictionary = effect_context(b, "direct", "pillPurify", "pill", "cleanse")
		trigger(b, "pillPurify", {}, [target], "清心丹：首次减益净化")
		cleanse(b, target, 1, {}, [id])
		b.actionContext = context
static func shield(b: Dictionary, target: Dictionary, amount: float, source: Dictionary = {}) -> void:
	if target.hp <= 0 or (source and source.hp <= 0 and b.actionContext.origin != "periodic"): return
	var gain: int = int(max(0, min(round(amount), floor(target.maxHp * cfg("COMBAT_RULES").shieldCap) - target.shield)))
	target.shield += gain
	if gain:
		var key: String = source_key(b, source)
		target.shieldLayers.append({"amount":gain, "sourceKey":key if not key.is_empty() else target.uid, "actionId":b.actionContext.id})
		event(b, "shield", source, [target], gain, "护盾")
static func heal(b: Dictionary, target: Dictionary, amount: float, source: Dictionary = {}) -> void:
	if not target or target.hp <= 0 or (source and source.hp <= 0 and b.actionContext.origin != "periodic"): return
	if source.get("id") == "taiyi" and source.hp > 0 and target.hp < target.maxHp * tuning("taiyi").lowHealthThreshold and claim(b, source.uid + ":mercy", "round", GameData.character(source.id).skill.triggerLimit):
		amount += source.atk * tuning("taiyi").lowHealthHeal
		source.counters.mercy = 1
		trigger(b, "mercy", source, [target], "低生命护生")
	if source: amount *= 1.0 + float(source.get("healBonus", 0.0))
	var gain: int = int(min(target.maxHp - target.hp, max(0, round(amount))))
	target.hp += gain
	if gain:
		var s: Dictionary = b.stats.get(source_key(b, source), {})
		if s: s.healing += gain
		event(b, "heal", source, [target], gain, "恢复")
static func cleanse(b: Dictionary, target: Dictionary, count: float, source: Dictionary = {}, allowed_ids: Array = []) -> int:
	if target.hp <= 0 or (source and source.hp <= 0): return 0
	var ids: Array = []
	for s: Dictionary in target.statuses:
		if ids.size() >= count: break
		if cfg("STATUS_CONFIG").get(s.id, {}).get("debuff", false) and (allowed_ids.is_empty() or s.id in allowed_ids): ids.append(s.id)
	target.statuses = target.statuses.filter(func(s: Dictionary) -> bool: return s.id not in ids)
	if not ids.is_empty():
		var name_value: String = source.get("name", GameData.named(cfg("PILLS"), b.actionContext.get("sourceId", "")).get("name", "清心诀") if b.actionContext.sourceKind == "pill" else "清心诀")
		var names: Array = ids.map(func(id: String) -> String: return cfg("STATUS_CONFIG")[id].name)
		log_line(b, "%s净化%s的%s" % [name_value, target.name, "、".join(names)])
		event(b, "cleanse", source, [target], ids.size(), "净化")
		var clear: Dictionary = boon(b, "clarity")
		if clear and direct_trigger(b) and target.side == "ally" and claim(b, "boon:clarity", clear.scope, clear.limit):
			var context: Dictionary = with_boon(b, "clarity", [target])
			shield(b, target, target.maxHp * clear.power)
			b.actionContext = context
	return ids.size()
static func consume_shield(b: Dictionary, target: Dictionary, amount: float, absorbed: bool) -> void:
	var remaining: float = amount
	for layer: Dictionary in target.shieldLayers:
		var used: float = min(layer.amount, remaining)
		layer.amount -= used
		remaining -= used
		if absorbed:
			var s: Dictionary = b.stats.get(layer.sourceKey, {})
			if s: s.shieldAbsorbed += used
		if remaining == 0: break
	target.shieldLayers = target.shieldLayers.filter(func(x: Dictionary) -> bool: return x.amount > 0)
	if remaining and absorbed:
		var s: Dictionary = b.stats.get(target.uid, {})
		if s: s.shieldAbsorbed += remaining
static func remove_shields(b: Dictionary, target: Dictionary, fraction: float, source: Dictionary = {}) -> void:
	if target.hp <= 0 or (source and source.hp <= 0): return
	var lost: int = int(ceil(target.shield * fraction))
	target.shield -= lost
	consume_shield(b, target, lost, false)
	if lost:
		log_line(b, "%s削去%s护盾 %d" % [source.get("name", "破护诀"), target.name, lost])
		event(b, "break", source, [target], lost, "破护")
static func reduce_will(b: Dictionary, target: Dictionary, amount: float, source: Dictionary = {}) -> void:
	if not target.boss or target.hp <= 0 or (source and source.hp <= 0) or status(target, "shaken"): return
	target.will = max(0, target.will - amount)
	log_line(b, "%s削减%s定力 %d（%d/%d）" % [source.get("name", "法门"), target.name, amount, target.will, target.maxWill])
	if not target.will:
		add_status(b, target, "shaken", cfg("COMBAT_RULES").shakenTurns, cfg("COMBAT_RULES").shakenReduction, source)
		target.charge = max(0, target.charge - cfg("COMBAT_RULES").shakenChargeDown)
		log_line(b, "%s定力耗尽，出现两轮破绽，强招仍可通过预告观察" % target.name)
static func reduce_charge(b: Dictionary, target: Dictionary, amount: float, source: Dictionary = {}) -> bool:
	if target.hp <= 0 or (source and source.hp <= 0) or target.charge <= 0: return false
	var reduced: float = min(target.charge, amount)
	target.charge -= reduced
	log_line(b, "%s削减%s蓄势 %d（余 %d）" % [source.get("name", "法门"), target.name, reduced, target.charge])
	event(b, "disrupt", source, [target], reduced, "削势")
	return true
static func check_result(b: Dictionary) -> void:
	if living(b, "enemy").is_empty(): b.result = "win"
	elif living(b, "ally").is_empty(): b.result = "lose"
static func lightning_ward(b: Dictionary, source: Dictionary) -> void:
	if source.hp <= 0 or not claim(b, source.uid + ":lightningWard", "round", GameData.character(source.id).skill.triggerLimit): return
	var allies: Array = friends(b, source)
	for target: Dictionary in allies:
		shield(b, target, target.maxHp * (tuning("leizhenzi").treasureShield if source.treasure else tuning("leizhenzi").shield), source)
	trigger(b, "lightningWard", source, allies, "折势雷翼护盾")
	log_line(b, "雷翼护盾生效，全队获得有限保护（每轮一次）")
static func shield_break_passive(b: Dictionary, target: Dictionary) -> void:
	if target.side != "ally": return
	var bixiao: Dictionary = GameData.named(living(b, "ally"), "bixiao")
	if bixiao and claim(b, bixiao.uid + ":breakWard", "round", tuning("bixiao").breakLimit):
		bixiao.counters.breakWard = 1
		var ally: Dictionary = lowest(living(b, "ally"))
		if ally:
			shield(b, ally, ally.maxHp * tuning("bixiao").breakShield, bixiao)
			trigger(b, "breakWard", bixiao, [ally], "碧霄续阵")
			log_line(b, "碧霄察觉破盾，为%s续阵（本轮一次）" % ally.name)
static func absorb(b: Dictionary, target: Dictionary, amount: float, source: Dictionary = {}, type: String = "damage") -> int:
	if target.hp <= 0 or amount <= 0: return 0
	amount = max(1, round(amount))
	var previous_shield: float = target.shield
	var previous_hp: float = target.hp
	var blocked: float = min(target.shield, amount)
	target.shield -= blocked
	consume_shield(b, target, blocked, true)
	var hp_damage: float = min(target.hp, amount - blocked)
	target.hp -= hp_damage
	event(b, type, source, [target], hp_damage + blocked, "护盾吸收 %d" % blocked if blocked else "受击")
	b.events[-1].hpDamage = hp_damage
	b.events[-1].shieldAbsorbed = blocked
	var stats: Dictionary = b.stats.get(source_key(b, source), {})
	if stats:
		stats.damage += hp_damage + blocked
		stats.hpDamage += hp_damage
	if previous_shield > 0 and not target.shield:
		log_line(b, "%s护盾被击破" % target.name)
		shield_break_passive(b, target)
	if not target.hp:
		log_line(b, "%s退场，后续行动跳过" % target.name)
		event(b, "death", source, [target], 0, "退场")
		var victory: Dictionary = boon(b, "victory")
		if victory and b.actionContext.origin == "periodic" and source.get("side") == "ally" and claim(b, "boon:victory", victory.scope, victory.limit):
			b.pendingAttacks.victory = {"round":b.round, "actionId":b.actionContext.id}
			var old: Dictionary = effect_context(b, "boon", "victory", "boon", "victory")
			event(b, "boonReady", source, [source], null, "持续伤害击倒，乘胜已就绪")
			b.actionContext = old
	var shade: Dictionary = boon(b, "shade")
	if shade and target.side == "ally" and (direct_trigger(b) or b.actionContext.origin == "periodic") and ((previous_shield > 0 and previous_shield == blocked) or (previous_hp > target.maxHp * 0.5 and target.hp <= target.maxHp * 0.5)):
		var injured: Dictionary = lowest(living(b, "ally").filter(func(x: Dictionary) -> bool: return x.hp < x.maxHp))
		if injured and claim(b, "boon:shade", shade.scope, shade.limit):
			var old: Dictionary = with_boon(b, "shade", [injured])
			heal(b, injured, injured.maxHp * shade.power)
			b.actionContext = old
	if target.boss and target.hp > 0 and target.phase == 1 and target.hp <= target.maxHp * enemy_cfg("dragon").phaseThreshold:
		target.phase = 2
		if target.role == "dragon":
			shield(b, target, target.maxHp * enemy_cfg("dragon").phaseShield, target)
			target.charge = max(enemy_cfg("dragon").phaseCharge, target.charge)
			log_line(b, "雷泽蛟君进入雷暴阶段，获得阶段护盾；可破护或承受后反攻")
			event(b, "phase", target, [target], null, "雷暴阶段")
		else: log_line(b, "%s进入第二阶段，意图更加猛烈" % target.name)
	return int(hp_damage)
static func damage(b: Dictionary, source: Dictionary, target: Dictionary, multiplier: float, options: Dictionary = {}) -> void:
	if source.hp <= 0 or target.hp <= 0 or b.result != null: return
	var rules: Dictionary = cfg("COMBAT_RULES")
	var charged_target: bool = target.charge > 0
	var attack: float = source.atk * (1.0 + power(source, "atkUp")) * (1.0 - power(source, "weakened")) * (1.0 - rules.shakenReduction if status(source, "shaken") else 1.0)
	var defense: float = target.def * (1.0 - power(target, "defDown")) * (1.0 - rules.shakenReduction if status(target, "shaken") else 1.0)
	var amount: float = max(rules.minimumDamage, attack * multiplier - defense * rules.defenseCoefficient) * (1.0 + (random_number(b) * 2.0 - 1.0) * rules.damageVariance)
	amount *= 1.0 + float(source.get("damageBonus", 0.0))
	if b.get("activeKind","")=="skill" and not options.get("reactive",false): amount*=1.0+float(source.get("skillBonus",0.0))
	var critical: bool = false
	if float(source.get("critRate", 0.0)) > 0.0:
		critical = random_number(b) < maxf(0.0,float(source.critRate)-float(target.get("critResist",0.0)))
		if critical: amount *= 1.0 + float(source.get("critDamage", 0.5))
	if status(target, "mark"): amount *= 1.0 + (tuning("yangjian").markBonus if source.id == "yangjian" else rules.generalMarkBonus)
	if status(target, "mark") and direct_trigger(b) and claim(b, source.uid + ":mark", "action"): trigger(b, "mark", source, [target], "识破集火")
	if source.id == "qiongxiao" and debuffed(target):
		amount *= 1.0 + tuning("qiongxiao").weakenedBonus
		if direct_trigger(b) and claim(b, source.uid + ":exploit", "action"): trigger(b, "exploit", source, [target], "利用通用削弱")
	var old_shield: float = target.shield
	var protect: Dictionary = status(target, "protect")
	var protector: Dictionary = unit(b, protect.get("sourceUid")) if protect else {}
	var protected_blocked: bool = false
	var protection_occurred: bool = false
	if not options.get("aoe", false) and not options.get("reactive", false) and protector and protector.uid != target.uid and protector.hp > 0:
		protection_occurred = true
		var shared: float = amount * rules.protectShare
		amount -= shared
		var guarded: float = shared * (1.0 - power(protector, "guard"))
		protected_blocked = protector.shield > 0 or guarded < shared
		absorb(b, protector, guarded, source)
		log_line(b, "%s护卫%s，分担 40%% 单体伤害" % [protector.name, target.name])
		if protector.id == "huangfeihu" and protector.hp > 0 and target.hp > 0 and claim(b, protector.uid + ":protect", "round", tuning("huangfeihu").protectLimit):
			protector.counters.protect = protector.counters.get("protect", 0) + 1
			add_status(b, target, "atkUp", GameData.character(protector.id).skill.turns, tuning("huangfeihu").protectAttackUp, protector)
			trigger(b, "protect", protector, [target], "护军战令")
	amount *= 1.0 - power(target, "guard")
	var before: float = target.hp
	var absorbed: float = min(target.shield, max(1, round(amount)))
	var damage_event_start: int = b.events.size()
	var received: int = absorb(b, target, amount, source, options.get("type", "damage"))
	if critical:
		for emitted: Dictionary in b.events.slice(damage_event_start):
			if emitted.get("actorUid") == source.uid and target.uid in emitted.targetUids and emitted.has("hpDamage") and emitted.actionId == b.actionContext.id: emitted.critical = true
	log_line(b, "%s → %s %d%s" % [source.name, target.name, received + absorbed, "（护盾吸收 %d）" % absorbed if absorbed else ""])
	if source.id == "leizhenzi" and charged_target and direct_trigger(b) and not options.get("reactive", false): lightning_ward(b, source)
	if before > 0 and target.hp <= 0 and source.id == "qiongxiao" and direct_trigger(b) and not options.get("reactive", false) and claim(b, source.uid + ":harvest", "round", tuning("qiongxiao").healLimit):
		source.counters.harvest = 1
		trigger(b, "harvest", source, [source], "击倒恢复")
		heal(b, lowest(friends(b, source)), source.atk * tuning("qiongxiao").defeatHeal, source)
	if not options.get("reactive", false) and target.side == "ally":
		var bigan: Dictionary = GameData.named(living(b, "ally"), "bigan")
		if bigan and claim(b, bigan.uid + ":steady", "round", tuning("bigan").passiveLimit):
			bigan.counters.steady = 1
			trigger(b, "steady", bigan, [target], "明心续护")
			heal(b, lowest(living(b, "ally")), bigan.atk * tuning("bigan").passiveHeal, bigan)
	if not options.get("reactive", false) and direct_trigger(b) and target.hp > 0 and source.hp > 0:
		if target.id == "zhouwang": target.morale = min(tuning("zhouwang").maxMorale, target.morale + tuning("zhouwang").moralePerHit)
		if target.id == "zhouwang" and claim(b, target.uid + ":counter", "round", tuning("zhouwang").counterLimit):
			target.counters.counter = 1
			log_line(b, "%s有限反击（本轮一次，反击不再触发反击）" % target.name)
			var old: Dictionary = effect_context(b, "counter", "counter")
			trigger(b, "counter", target, [source], "战意反击")
			event(b, "counter", target, [source], null, "反击")
			damage(b, target, source, tuning("zhouwang").counter, {"reactive":true, "type":"counterDamage"})
			b.actionContext = old
		var pearl: Dictionary = GameData.named(living(b, "ally"), "zhaogongming") if target.side == "ally" else {}
		var shielded: bool = old_shield > 0 or not status(target, "guard").is_empty() or protected_blocked
		if pearl and source.hp > 0 and (shielded or (pearl.uid == target.uid and pearl.treasure > 0)) and claim(b, pearl.uid + ":counter", "round", cfg("SYNERGY_RULES").protectedCounterLimit):
			pearl.counters.counter = 1
			var old: Dictionary = effect_context(b, "counter", "pearlCounter")
			log_line(b, "%s抵挡进攻，赵公明珠环反制（本轮一次，追加不再触发反制）" % target.name)
			trigger(b, "pearlCounter", pearl, [source], "抵挡反制")
			event(b, "counter", pearl, [source], null, "抵挡反制", "pearl-counter")
			damage(b, pearl, source, tuning("zhaogongming").counter, {"reactive":true, "type":"counterDamage"})
			b.actionContext = old
	var victory: Dictionary = boon(b, "victory")
	if victory and direct_trigger(b) and (not options.get("reactive", false) or options.get("type") == "multiHitDamage") and source.side == "ally" and before > 0 and target.hp <= 0 and claim(b, "boon:victory", victory.scope, victory.limit):
		b.pendingAttacks.victory = {"round":b.round, "actionId":b.actionContext.id}
		var old: Dictionary = effect_context(b, "boon", "victory", "boon", "victory")
		event(b, "boonReady", source, [source], null, "乘胜已就绪")
		log_line(b, "乘胜已就绪：本轮下一次合法普攻追加一次")
		b.actionContext = old
	if direct_trigger(b) and not options.get("reactive", false):
		_expansion_passive(b, source, "onHit", target)
		if before > 0 and target.hp <= 0: _expansion_passive(b, source, "onKill", target)
		_expansion_passive(b, target, "onDamaged", source)
		if protection_occurred and protector and protector.uid != target.uid: _expansion_passive(b, protector, "onDamaged", source)
		for ally: Dictionary in living(b, target.side): _expansion_passive(b, ally, "onAllyDamaged", target)
		if source.hp>0 and target.hp>0 and b.result==null:
			var counter_chance: float=maxf(0,float(target.get("counterRate",0))-float(source.get("counterResist",0)))
			if counter_chance>0 and random_number(b)<counter_chance and claim(b,target.uid+":equipment-counter","round",1):
				var old: Dictionary=effect_context(b,"counter","equipment-counter")
				event(b,"counter",target,[source],null,"反击")
				damage(b,target,source,0.45,{"reactive":true,"type":"counterDamage"})
				b.actionContext=old
			var combo_chance: float=maxf(0,float(source.get("comboRate",0))-float(target.get("comboResist",0)))
			if source.hp>0 and target.hp>0 and b.result==null and combo_chance>0 and random_number(b)<combo_chance and claim(b,source.uid+":equipment-combo","action",1):
				var old: Dictionary=effect_context(b,"follow","equipment-combo")
				event(b,"follow",source,[target],null,"连击")
				damage(b,source,target,0.4,{"reactive":true,"type":"multiHitDamage"})
				b.actionContext=old
	check_result(b)
static func follow(b: Dictionary, u: Dictionary) -> void:
	if not direct_trigger(b) or u.hp <= 0: return
	var targets: Array = opponents(b, u).filter(func(t: Dictionary) -> bool: return debuffed(t) or t.hp < t.maxHp * tuning("nezha").followHealthThreshold)
	if u.treasure <= 0:
		var legal: Array = uids(front_targets(b, u))
		targets = targets.filter(func(t: Dictionary) -> bool: return t.uid in legal)
	var target: Dictionary = lowest(targets.filter(func(t: Dictionary) -> bool: return t.row == "back")) if u.treasure > 0 else {}
	if not target: target = lowest(targets)
	if not target or not claim(b, u.uid + ":follow", "action", GameData.character(u.id).skill.triggerLimit): return
	u.counters.follow = 1
	log_line(b, "哪吒追击%s（每次正常行动一次）" % target.name)
	var old: Dictionary = effect_context(b, "follow", "nezhaFollow")
	trigger(b, "nezhaFollow", u, [target], "识破/削弱追击")
	event(b, "follow", u, [target], null, "追加追击", "mark-follow")
	damage(b, u, target, tuning("nezha").branchFollow if u.branch == "A" and has_branch(u) else tuning("nezha").follow, {"reactive":true, "type":"followDamage"})
	b.actionContext = old
static func intents(b: Dictionary) -> void:
	for u: Dictionary in living(b, "enemy"):
		if u.charge > 0: u.intent = "蓄势 %d：下次%s，可护持或削势" % [u.charge, "雷暴全队" if u.role == "dragon" else ("烈焰全队" if u.role == "furnace" else "前排重击")]
		elif u.role == "stone": u.intent = "即将修复石甲并保护侍卫" if u.cd == 0 else "敲击前排"
		elif u.role in ["furnace", "charger", "dragon"]: u.intent = "即将蓄势：强招提前一轮预告" if u.cd == 0 else "普通打击"
		elif u.role == "shield": u.intent = "护盾 / 保护后排" if u.cd == 0 else "前排攻击"
		elif u.role == "burner": u.intent = "全队灼烧" if u.cd == 0 else "火弹"
		elif u.role == "healer": u.intent = "恢复最低血同伴" if u.cd == 0 else "符击"
		else: u.intent = "穿阵攻击低血者" if u.role == "archer" else "攻击前排"
static func next_round(b: Dictionary) -> void:
	b.round += 1
	begin_action(b, "round-%d" % b.round)
	b.pendingAttacks.erase("victory")
	event(b, "round", {}, [], b.round, "第 %d 回合" % b.round)
	log_line(b, "新回合：持续状态 → 时长/CD递减 → 重排速度")
	for u: Dictionary in b.units: u.counters = {}
	for u: Dictionary in living(b):
		for s: Dictionary in u.statuses.duplicate():
			var previous: Dictionary = b.actionContext
			b.actionContext = {"id":s.get("actionId", "round-%d" % b.round), "origin":"periodic", "sourceKind":s.get("sourceKind", "character")}
			if s.has("sourceId"): b.actionContext.sourceId = s.sourceId
			if s.has("sourceUid"): b.actionContext.actorUid = s.sourceUid
			if s.id == "burn": absorb(b, u, s.power, unit(b, s.get("sourceUid")), "burnDamage")
			if s.id == "regen": heal(b, u, s.power, unit(b, s.get("sourceUid")))
			b.actionContext = previous
			if s.id != "stun": s.turns -= 1
		u.statuses = u.statuses.filter(func(s: Dictionary) -> bool: return s.turns > 0)
		u.cd = max(0, u.cd - 1)
		if u.boss and not status(u, "shaken"): u.will = min(u.maxWill, u.will + cfg("COMBAT_RULES").willRecovery)
	for survivor: Dictionary in living(b): _expansion_passive(b, survivor, "roundStart")
	check_result(b)
	if b.round > cfg("COMBAT_RULES").maximumRounds and b.result == null:
		b.result = "lose"
		log_line(b, "战斗超过 60 轮，队伍撤退")
	b.order = round_sort(b)
	b.cursor = 0
	intents(b)
static func advance(b: Dictionary) -> void:
	b.actionCount += 1
	b.cursor += 1
	check_result(b)
	intents(b)
	if b.result != null:
		log_line(b, "敌阵已破，战斗胜利" if b.result == "win" else "本方退场，免费重试")
		return
	while b.cursor < b.order.size() and unit(b, b.order[b.cursor]).get("hp", 0) <= 0: b.cursor += 1
	if b.cursor >= b.order.size(): next_round(b)
static func _empty_unit() -> Dictionary:
	return {"shield":0, "shieldLayers":[], "cd":0, "statuses":[], "branch":"A", "treasure":0, "boss":false, "will":0, "maxWill":0, "charge":0, "phase":1, "formation":0, "morale":0, "intent":"", "counters":{}}
static func _empty_stat(uid: String, name_value: String, side: String) -> Dictionary:
	return {"uid":uid, "name":name_value, "side":side, "damage":0, "hpDamage":0, "shieldAbsorbed":0, "healing":0, "triggers":{}}
static func create(stage_id: int, team: Array, options: Dictionary = {}) -> Dictionary:
	var stage: Dictionary = GameData.stage(stage_id)
	var rules: Dictionary = cfg("COMBAT_RULES")
	if not stage: return {"error":"不存在的主线节点"}
	if options.has("ruleVersion") and options.ruleVersion != cfg("BATTLE_RULE_VERSION"): return {"error":"战斗规则版本不兼容，请保留成果后退出旧秘境"}
	if options.has("enemies"):
		if not options.enemies is Array or options.enemies.is_empty() or options.enemies.size() > 8: return {"error":"自定义敌组不合法"}
		for e: Dictionary in options.enemies:
			if not is_finite(float(e.get("hp", NAN))) or e.get("hp", 0) <= 0 or not is_finite(float(e.get("atk", NAN))) or e.get("atk", -1) < 0: return {"error":"自定义敌组不合法"}
	for id: String in options.get("boons", []):
		if not GameData.named(cfg("BOONS"), id): return {"error":"未知秘境机缘"}
	if team.size() < 1 or team.size() > 5: return {"error":"必须上阵 1 至 5 名角色"}
	var used: Array = []
	for m: Dictionary in team:
		if m.id in used: return {"error":"同名角色不能重复上阵"}
		used.append(m.id)
		if not GameData.character(m.id): return {"error":"未知角色：" + str(m.id)}
	var seed: int = int(options.get("seed", 20261006)) & 0xffffffff
	_serial += 1
	var b: Dictionary = {"id":options.get("battleId", "battle-%d-%d-%d" % [GameData.now_ms(), _serial, seed]), "stageId":stage_id, "trial":bool(options.get("trial", false)), "round":1, "units":[], "order":[], "cursor":0, "result":null, "log":[], "events":[], "seed":seed, "rng":seed if seed != 0 else 1, "method":options.get("method") if GameData.named(cfg("METHODS"), options.get("method")) else null, "methodUses":0, "pill":options.get("pill") if GameData.named(cfg("PILLS"), options.get("pill")) else null, "actionCount":0, "ruleVersion":cfg("BATTLE_RULE_VERSION"), "contextName":options.get("contextName", stage.name), "boons":[], "stats":{}, "triggerCounts":{}, "pendingAttacks":{}, "methodSerial":0, "actionContext":{"id":"opening", "origin":"system", "sourceKind":"system"}}
	if options.get("autoOnly",false): b.autoOnly=true
	if not options.get("petSupport",{}).is_empty():
		b.petSupport=options.petSupport.duplicate(true)
		b.petActions=0
	for id: String in options.get("boons", []):
		if id not in b.boons: b.boons.append(id)
	for i: int in range(team.size()):
		var m: Dictionary = team[i]
		var c: Dictionary = GameData.character(m.id)
		var level: int = int(clamp(floor(m.get("level", 1)), 1, rules.levelCap))
		var treasure: int = int(clamp(floor(m.get("treasure", 0)), 0, rules.treasureCap))
		var max_hp: int = int(round(c.hp * (1.0 + (level - 1) * rules.hpGrowth + treasure * rules.treasureStatGrowth)))
		var u: Dictionary = _empty_unit()
		u.merge({"uid":"a%d-%s" % [i, c.id], "id":c.id, "name":c.name, "side":"ally", "row":"front" if i < 2 else "back", "hp":max_hp, "maxHp":max_hp, "atk":int(round(c.atk * (1.0 + (level - 1) * rules.attackGrowth + treasure * rules.treasureStatGrowth))), "def":int(round(c.def * (1.0 + (level - 1) * rules.defenseGrowth + treasure * rules.treasureStatGrowth))), "speed":c.speed, "level":level, "branch":"B" if m.get("branch") == "B" else "A", "treasure":treasure, "portraitIndex":c.portraitIndex, "role":c.id, "formation":tuning("tongtian").treasureLayers if c.id == "tongtian" and treasure > 0 else 0, "morale":tuning("zhouwang").treasureMorale if c.id == "zhouwang" and treasure > 0 else 0}, true)
		if m.get("branchUnlocked", false): u.branchUnlocked = true
		if not m.get("equipmentStats", {}).is_empty():
			u.merge(member_stats(m), true)
			u.hp = u.maxHp
			u.equipmentStats = m.equipmentStats.duplicate(true)
		b.units.append(u)
	var enemy_data: Array = options.get("enemies", stage.enemies)
	for i: int in range(enemy_data.size()):
		var e: Dictionary = enemy_data[i]
		var uid: String = "e%d-%s" % [i, e.id]
		var u: Dictionary = _empty_unit()
		u.merge({"uid":uid, "id":e.id, "name":e.name, "side":"enemy", "row":e.row, "hp":e.hp, "maxHp":e.hp, "shield":e.get("shield", 0), "atk":e.atk, "def":e.def, "speed":e.speed, "level":stage.recommendedLevel, "portraitIndex":-1, "role":e.role, "boss":bool(e.get("will", 0)), "will":e.get("will", 0), "maxWill":e.get("will", 0)}, true)
		if u.shield: u.shieldLayers = [{"amount":u.shield, "sourceKey":uid, "actionId":"opening"}]
		b.units.append(u)
	for u: Dictionary in b.units: b.stats[u.uid] = _empty_stat(u.uid, u.name, u.side)
	if not b.get("petSupport",{}).is_empty(): b.stats["pet:"+str(b.petSupport.get("petId","spirit"))]=_empty_stat("pet:"+str(b.petSupport.get("petId","spirit")),str(b.petSupport.get("name","灵兽")),"ally")
	for kind: String in ["boon", "method", "pill"]:
		var items: Array = cfg({"boon":"BOONS", "method":"METHODS", "pill":"PILLS"}[kind])
		for item: Dictionary in items:
			if (kind == "boon" and item.id in b.boons) or (kind != "boon" and item.id == b[kind]):
				var key: String = kind + ":" + item.id
				b.stats[key] = _empty_stat(key, item.name, "ally")
	var pill: Dictionary = GameData.named(cfg("PILLS"), b.pill)
	if pill:
		begin_action(b, "opening-pill", {}, "pill", pill.id)
		for u: Dictionary in living(b, "ally"):
			if pill.id == "ward": shield(b, u, u.maxHp * pill.power)
			if pill.id == "training": add_status(b, u, "atkUp", pill.turns, pill.power)
			if pill.id == "heal": add_status(b, u, "regen", pill.turns, round(u.maxHp * pill.power))
		if pill.id == "cleanse": event(b, "pillReady", {}, living(b, "ally"), 1, "清心丹：每名友方首次减益自动净化")
		log_line(b, "%s在开场生效，每场只携带一种" % pill.name)
	var barrier: Dictionary = boon(b, "barrier")
	if barrier and claim(b, "boon:barrier", barrier.scope, barrier.limit):
		begin_action(b, "opening-barrier", {}, "boon", barrier.id)
		var shielded: Array = living(b, "enemy").filter(func(x: Dictionary) -> bool: return x.shield > 0)
		var targets: Array = shielded if not shielded.is_empty() else living(b, "ally").filter(func(x: Dictionary) -> bool: return x.row == "front")
		var old: Dictionary = with_boon(b, "barrier", targets)
		if not shielded.is_empty():
			for x: Dictionary in shielded: remove_shields(b, x, barrier.shieldCut)
		else:
			for x: Dictionary in targets: shield(b, x, x.maxHp * barrier.power)
		log_line(b, "破障削去敌方初始护盾，不同时增加己方护盾" if not shielded.is_empty() else "敌方无初始盾，破障改为给予己方前排小护盾")
		b.actionContext = old
	for u: Dictionary in living(b,"ally"):
		if float(u.get("openingShield",0))>0: shield(b,u,u.maxHp*float(u.openingShield),u)
	if b.get("autoOnly",false) and b.method!=null:
		var method: Dictionary=GameData.named(cfg("METHODS"),b.method)
		if not method.is_empty(): _apply_method(b,living(b,"ally")[0],method,true)
	begin_action(b, "opening")
	b.order = round_sort(b)
	intents(b)
	log_line(b, "%s开始；前两位前排，后三位后排" % b.contextName)
	return b
static func current_actor(b: Dictionary) -> Dictionary:
	if b.get("result") != null or b.has("error"): return {}
	while b.cursor < b.order.size() and unit(b, b.order[b.cursor]).get("hp", 0) <= 0: b.cursor += 1
	if b.cursor >= b.order.size(): next_round(b)
	return {} if b.result != null else unit(b, b.order[b.cursor])
static func legal_sources(b: Dictionary) -> Array:
	var u: Dictionary = current_actor(b)
	return uids(friends(b, u)) if u and u.id == "xuandu" else []
static func combine_availability(b: Dictionary) -> Dictionary:
	var actor: Dictionary = current_actor(b)
	var allies: Array = living(b, "ally")
	var combined: Dictionary = cfg("COMBINED_FORM")
	var yun: Dictionary = GameData.named(allies, "yunxiao")
	var missing_ids: Array = combined.required.filter(func(id: String) -> bool: return not GameData.named(allies, id))
	var blocked: Array = allies.filter(func(x: Dictionary) -> bool:
		if x.id not in combined.required: return false
		for id: String in combined.blockingStatuses:
			if status(x, id): return true
		return false)
	var cooldown: int = int(yun.get("cd", 0))
	var reason: String = "可用：消耗云霄本次正常行动，与普通式共享冷却"
	if b.result != null: reason = "战斗已结束"
	elif not actor or actor.side != "ally" or actor.id != "yunxiao": reason = "须等云霄的正常行动"
	elif status(actor, "stun"): reason = "云霄被牵制，无法正常施法"
	elif cooldown > 0: reason = "与普通式共享冷却，尚余%d回合" % cooldown
	elif not missing_ids.is_empty(): reason = "缺少存活同伴：" + "、".join(missing_ids.map(func(id: String) -> String: return GameData.character(id).name))
	elif not blocked.is_empty(): reason = "、".join(blocked.map(func(x: Dictionary) -> String: return x.name)) + "受牵制，无法响应合阵；云霄仍可使用普通式"
	return {"available":not actor.is_empty() and actor.get("side") == "ally" and actor.get("id") == "yunxiao" and b.result == null and not status(actor, "stun") and cooldown == 0 and missing_ids.is_empty() and blocked.is_empty(), "reason":reason, "missingIds":missing_ids, "blockedIds":blocked.map(func(x: Dictionary) -> String: return x.id), "cooldown":cooldown}
static func can_combine(b: Dictionary) -> bool: return combine_availability(b).available
static func get_legal_boons(team: Array, method: String = "") -> Array:
	var cleansing: bool = method == "cleanse"
	for x: Dictionary in team:
		if x.id in ["taiyi", "bigan"] or (x.id == "xuandu" and x.get("treasure", 0) > 0): cleansing = true
		var extra: Dictionary = GameData.character(x.id).get("combat", {})
		if not extra.is_empty():
			var effects: Array = extra.get("skillEffects", []).duplicate()
			if x.get("level", 1) >= cfg("COMBAT_RULES").branchesOpenLevel or x.get("branchUnlocked", false): effects.append_array(extra.get("branchB" if x.get("branch", "A") == "B" else "branchA", []))
			if x.get("treasure", 0) > 0: effects.append_array(extra.get("treasureEffects", []))
			if effects.any(func(effect: Dictionary) -> bool: return effect.get("op") == "cleanse"): cleansing = true
	var result: Array = []
	for x: Dictionary in cfg("BOONS"):
		if x.id != "clarity" or cleansing: result.append(x.id)
	return result
static func legal_targets(b: Dictionary, kind: String, source_id: String = "") -> Array:
	var u: Dictionary = current_actor(b)
	if not u: return []
	if kind == "guard": return uids(friends(b, u))
	if kind == "attack": return uids(front_targets(b, u))
	var c: Dictionary = GameData.character(u.id)
	if not c: return uids(opponents(b, u))
	if u.cd > 0: return []
	if c.skill.target in ["allAllies", "ally"]: return uids(friends(b, u))
	if c.skill.target == "sourceRecipient":
		if not source_id.is_empty() and source_id not in legal_sources(b): return []
		return uids(friends(b, u).filter(func(t: Dictionary) -> bool: return t.uid != source_id or friends(b, u).size() == 1))
	if c.skill.target == "enemyFront": return uids(front_targets(b, u))
	return uids(opponents(b, u))
static func player_skill(b: Dictionary, u: Dictionary, target: Dictionary, source: Dictionary, form: String = "normal") -> void:
	var c: Dictionary = GameData.character(u.id)
	var foes: Array = opponents(b, u).duplicate()
	var allies: Array = friends(b, u).duplicate()
	var branch: String = u.branch if has_branch(u) else ""
	var turns: float = c.skill.turns
	var tune: Dictionary = tuning(u.id)
	if form == "combined":
		var combined: Dictionary = cfg("COMBINED_FORM")
		u.cd = combined.cooldown
		event(b, "combined", u, foes + allies, null, combined.name, combined.fx)
		b.events[-1].responderUids = combined.required.map(func(id: String) -> String: return GameData.named(allies, id).uid)
		trigger(b, "combined", u, allies, "三霄合阵：云霄正常行动")
		log_line(b, "三霄依次响应合阵（云霄正常行动，共享CD%d；另两霄继续正常行动）" % combined.cooldown)
		for t: Dictionary in foes:
			add_status(b, t, "weakened", combined.turns + (tune.treasureTurns if u.treasure else 0), combined.weaken, u)
			add_status(b, t, "defDown", combined.turns + (tune.treasureTurns if u.treasure else 0), combined.defenseDown, u)
			reduce_will(b, t, combined.willDown, u)
			damage(b, u, t, combined.multiplier, {"aoe":true})
		for t: Dictionary in allies:
			shield(b, t, t.maxHp * combined.shield, u)
			add_status(b, t, "guard", combined.turns, combined.reduction, u)
		return
	u.cd = c.skill.cooldown
	var event_targets: Array = foes if c.skill.target == "allEnemies" else (allies if c.skill.target == "allAllies" else ([target] if target else []))
	event(b, "skill", u, event_targets, null, c.skillName)
	log_line(b, "%s施放%s（CD%d）" % [u.name, c.skillName, c.skill.cooldown])
	if u.id == "palace-lord":
		if target: damage(b,u,target,2.0)
		return
	if c.has("combat"):
		_run_effects(b, u, target, c.combat.get("skillEffects", []))
		if branch == "A": _run_effects(b, u, target, c.combat.get("branchA", []))
		if branch == "B": _run_effects(b, u, target, c.combat.get("branchB", []))
		if u.treasure > 0: _run_effects(b, u, target, c.combat.get("treasureEffects", []))
		return
	match u.id:
		"yangjian":
			if target:
				if u.treasure: remove_shields(b, target, tune.treasureShieldCut, u)
				add_status(b, target, "mark", turns, tune.mark, u)
				add_status(b, target, "defDown", turns, tune.defenseDown, u)
				damage(b, u, target, c.skill.multiplier)
				if branch == "A" and u.hp > 0 and target.hp > 0 and claim(b, u.uid + ":spearFinish", "action", c.skill.triggerLimit):
					var old: Dictionary = effect_context(b, "follow", "spearFinish")
					trigger(b, "spearFinish", u, [target], "天眼追加")
					damage(b, u, target, tune.branchFollow, {"reactive":true, "type":"followDamage"})
					b.actionContext = old
				if branch == "B":
					for t: Dictionary in foes.filter(func(t: Dictionary) -> bool: return t.uid != target.uid).slice(0, int(tune.branchSpread)): add_status(b, t, "defDown", turns, tune.defenseDown, u)
		"nezha":
			for t: Dictionary in foes:
				damage(b, u, t, tune.branchArea if branch == "B" else c.skill.multiplier, {"aoe":true})
				add_status(b, t, "burn", turns, round(u.atk * tune.burn), u)
			follow(b, u)
		"taiyi":
			for t: Dictionary in allies:
				heal(b, t, u.atk * c.skill.multiplier, u)
				cleanse(b, t, tune.cleanseCount, u)
				shield(b, t, t.maxHp * (tune.shield + (tune.treasureShield if u.treasure else 0)), u)
				if branch == "A": add_status(b, t, "regen", turns, round(u.atk * tune.regeneration), u)
			if branch == "B":
				for t: Dictionary in foes: add_status(b, t, "burn", turns, round(u.atk * tune.branchBurn), u)
		"leizhenzi":
			var disrupted: bool = false
			for t: Dictionary in foes:
				disrupted = reduce_charge(b, t, tune.branchChargeDown if branch == "A" else tune.chargeDown, u) or disrupted
				reduce_will(b, t, tune.branchWillDown if branch == "A" else tune.willDown, u)
				damage(b, u, t, c.skill.multiplier, {"aoe":true})
			if disrupted or u.treasure: lightning_ward(b, u)
			if branch == "B":
				for t: Dictionary in allies: add_status(b, t, "haste", turns, tune.haste, u)
		"tongtian":
			var layers: float = u.formation
			for t: Dictionary in foes: damage(b, u, t, c.skill.multiplier + layers * tune.perLayer, {"aoe":true})
			if branch == "B" and layers > 0:
				var victim: Dictionary = lowest(opponents(b, u))
				if victim and u.hp > 0 and claim(b, u.uid + ":swordFinish", "action", c.skill.triggerLimit):
					var old: Dictionary = effect_context(b, "follow", "swordFinish")
					trigger(b, "swordFinish", u, [victim], "剑阵收束")
					damage(b, u, victim, tune.consumeStrike + layers * tune.consumePerLayer, {"reactive":true})
					b.actionContext = old
				u.formation = 0
			else: u.formation = min(tune.maxLayers, u.formation + tune.layersPerAction)
			if branch == "A":
				for t: Dictionary in allies: shield(b, t, t.maxHp * tune.branchShield, u)
			log_line(b, "剑阵收益：本次 %d 层，剩余阵势 %d/3" % [layers, u.formation])
		"zhaogongming":
			for t: Dictionary in allies: shield(b, t, t.maxHp * (tune.branchShield if branch == "A" else tune.shield), u)
			add_status(b, u, "counter", turns, tune.counter, u)
			if target:
				for hit: int in range(int(tune.hitCount)):
					if target.hp <= 0 or u.hp <= 0: break
					damage(b, u, target, tune.branchHit if branch == "B" else c.skill.multiplier, {"reactive":hit > 0, "type":"multiHitDamage"})
		"yunxiao":
			for t: Dictionary in foes:
				add_status(b, t, "weakened", turns + (tune.treasureTurns if u.treasure else 0), tune.weaken, u)
				add_status(b, t, "defDown", turns + (tune.treasureTurns if u.treasure else 0), tune.defenseDown, u)
				reduce_will(b, t, tune.branchWillDown if branch == "A" else tune.willDown, u)
				if branch == "B":
					t.statuses = t.statuses.filter(func(s: Dictionary) -> bool: return cfg("STATUS_CONFIG").get(s.id, {}).get("debuff", false))
					remove_shields(b, t, tune.shieldCut, u)
					log_line(b, "云霄解去%s普通防护" % t.name)
				damage(b, u, t, c.skill.multiplier, {"aoe":true})
			if branch == "A":
				for minor: Dictionary in foes.filter(func(t: Dictionary) -> bool: return not t.boss and t.hp > 0).slice(0, int(c.skill.triggerLimit)): add_status(b, minor, "stun", tune.stunActions, 1, u)
		"qiongxiao":
			if target:
				var exploited: bool = debuffed(target)
				if branch == "A" and exploited: remove_shields(b, target, tune.shieldCut, u)
				damage(b, u, target, c.skill.multiplier)
				if branch == "B":
					for t: Dictionary in foes.filter(func(t: Dictionary) -> bool: return t.uid != target.uid).slice(0, int(tune.spreadCount)): damage(b, u, t, tune.spreadHit, {"aoe":true})
				if u.treasure and exploited:
					u.cd = max(0, u.cd - tune.treasureCooldownCut)
					log_line(b, "金蛟剪修复效果：利用削弱，冷却减少 1")
		"bixiao":
			for t: Dictionary in allies:
				shield(b, t, t.maxHp * (c.skill.multiplier + (tune.branchShieldExtra if branch == "A" else 0)), u)
				add_status(b, t, "guard", turns, tune.guard, u)
				if branch == "B": heal(b, t, u.atk * tune.branchHeal, u)
				if u.treasure: add_status(b, t, "haste", turns, tune.treasureHaste, u)
			var master: Dictionary = GameData.named(allies, "tongtian")
			if master:
				master.formation = min(tuning("tongtian").maxLayers, master.formation + tune.maintainLayers)
				log_line(b, "碧水守阵维持一层剑阵；队伍没有剑阵时仍提供完整防护")
		"zhouwang":
			for t: Dictionary in allies:
				add_status(b, t, "atkUp", turns, tune.attackUp, u)
				if branch == "B": shield(b, t, t.maxHp * tune.branchShield, u)
			if target:
				damage(b, u, target, c.skill.multiplier + u.morale * tune.moralePerLayer)
				if u.treasure: reduce_will(b, target, tune.treasureWillDown, u)
				if branch == "A" and u.morale and u.hp > 0 and target.hp > 0 and claim(b, u.uid + ":moraleFinish", "action", c.skill.triggerLimit):
					var old: Dictionary = effect_context(b, "follow", "moraleFinish")
					trigger(b, "moraleFinish", u, [target], "战意追击")
					damage(b, u, target, tune.branchHit, {"reactive":true})
					b.actionContext = old
			log_line(b, "战意 %d/3 已用于战令" % u.morale)
			u.morale = 0
		"bigan":
			for t: Dictionary in allies:
				heal(b, t, u.atk * c.skill.multiplier, u)
				cleanse(b, t, tune.branchCleanseCount if branch == "A" else tune.cleanseCount, u)
				add_status(b, t, "regen", turns, round(u.atk * (tune.branchRegeneration if branch == "B" else tune.regeneration)), u)
				if u.treasure and t.hp < t.maxHp * tune.treasureShieldThreshold: shield(b, t, t.maxHp * tune.treasureShield, u)
			if branch == "A":
				for t: Dictionary in foes: reduce_charge(b, t, tune.branchChargeDown, u)
		"huangfeihu":
			for t: Dictionary in allies:
				if t.uid != u.uid: add_status(b, t, "protect", turns, cfg("COMBAT_RULES").protectShare, u)
			shield(b, u, u.maxHp * (tune.branchShield if branch == "A" else c.skill.multiplier), u)
			add_status(b, u, "guard", turns, tune.guard, u)
			if branch == "B":
				for t: Dictionary in allies: add_status(b, t, "atkUp", turns, tune.branchAttackUp, u)
			if u.treasure:
				var protected_unit: Dictionary = lowest(allies.filter(func(t: Dictionary) -> bool: return t.uid != u.uid))
				if protected_unit: shield(b, protected_unit, protected_unit.maxHp * tune.treasureShield, u)
			log_line(b, "武成护军就位：分担单体伤害，群攻按每人护持独立结算")
		"jifa":
			for t: Dictionary in allies:
				add_status(b, t, "atkUp", turns, tune.attackUp, u)
				if branch == "A": add_status(b, t, "haste", turns, tune.branchHaste, u)
				if branch == "B": shield(b, t, t.maxHp * tune.branchShield, u)
			if target:
				add_status(b, target, "mark", turns, tune.mark, u)
				damage(b, u, target, c.skill.multiplier)
			if u.treasure: heal(b, lowest(allies), u.atk * tune.treasureHeal, u)
		"xuandu":
			if target and source:
				var copied_buffs: Array = [] if source.uid == target.uid else source.statuses.filter(transferable_buff).slice(0, int(tune.copiedBuffLimit))
				for copied: Dictionary in copied_buffs:
					add_status(b, target, copied.id, copied.turns, copied.power, u)
					var received: Dictionary = status(target, copied.id)
					if received.get("sourceUid") == u.uid: received.copied = true
					if branch == "A": source.statuses.erase(copied)
					log_line(b, "玄都%s%s的%s → %s（仅一项普通增益）" % ["转移" if branch == "A" else "复制", source.name, copied.name, target.name])
				if not copied_buffs.is_empty():
					trigger(b, "harmonize", u, [target], "普通增益调和")
					event(b, "harmonize", u, [source, target], copied_buffs.size(), "来源 → 接受者", "buff-transfer")
				else: log_line(b, "%s无可调和普通增益，%s仍获得基础护盾" % [source.name, target.name])
				shield(b, target, target.maxHp * (tune.transferShield if branch == "A" else c.skill.multiplier), u)
				if branch == "B": shield(b, source, source.maxHp * tune.sourceShield, u)
				if u.treasure: cleanse(b, target, tune.treasureCleanse, u)
				heal(b, lowest(allies), u.atk * tune.passiveHeal, u)
static func enemy_action(b: Dictionary, u: Dictionary) -> void:
	var allies: Array = friends(b, u)
	var foes: Array = opponents(b, u)
	var target: Dictionary = lowest(front_targets(b, u))
	if not target: return
	if u.charge > 0:
		var charge: float = u.charge
		u.charge = 0
		u.cd = enemy_cfg("charger").cooldown
		var aoe: bool = u.role in ["dragon", "furnace"]
		log_line(b, "%s释放预告%s重击，剩余蓄势 %d" % [u.name, "群体" if aoe else "单体", charge])
		event(b, "skill", u, foes if aoe else [target], null, "蓄势重击", "storm-wave" if u.role == "dragon" else "furnace-smash")
		if aoe:
			var config: Dictionary = enemy_cfg("dragon" if u.role == "dragon" else "furnace")
			for t: Dictionary in foes:
				damage(b, u, t, config.multiplier + charge * config.perCharge + (config.phaseBonus if u.phase == 2 else 0), {"aoe":true})
				if u.role == "furnace": add_status(b, t, "burn", enemy_cfg("furnace").turns, round(u.atk * enemy_cfg("furnace").burn), u)
		else: damage(b, u, target, enemy_cfg("charger").multiplier + charge * enemy_cfg("charger").perCharge)
		return
	if u.cd == 0:
		match u.role:
			"stone":
				var config: Dictionary = enemy_cfg("stone")
				shield(b, u, u.maxHp * config.selfShield, u)
				for t: Dictionary in allies:
					if t.uid == u.uid: continue
					shield(b, t, t.maxHp * config.allyShield, u)
					add_status(b, t, "protect", config.turns, cfg("COMBAT_RULES").protectShare, u)
				u.cd = config.cooldown
				log_line(b, "石甲妖将维持石甲并保护侍卫；先清怪或破护均可")
				event(b, "skill", u, allies, null, "石甲护阵")
				return
			"charger", "furnace", "dragon":
				var config: Dictionary = enemy_cfg(u.role)
				u.charge = config.charge
				u.cd = config.cooldown
				log_line(b, "%s开始蓄势 %d，下次行动释放强招；护持、折势、净化恢复可应对" % [u.name, u.charge])
				event(b, "charge", u, [u], u.charge, "预告强招")
				return
			"shield":
				var config: Dictionary = enemy_cfg("shield")
				shield(b, u, u.maxHp * config.selfShield, u)
				add_status(b, u, "guard", config.turns, config.reduction, u)
				var back: Array = allies.filter(func(t: Dictionary) -> bool: return t.uid != u.uid and t.row == "back")
				for t: Dictionary in back: add_status(b, t, "protect", config.turns, cfg("COMBAT_RULES").protectShare, u)
				u.cd = config.cooldown
				log_line(b, "%s展开护盾并保护后排" % u.name)
				event(b, "skill", u, [u] + back, null, "盾卫护阵")
				return
			"burner":
				var config: Dictionary = enemy_cfg("burner")
				for t: Dictionary in foes:
					damage(b, u, t, config.multiplier, {"aoe":true})
					add_status(b, t, "burn", config.turns, round(u.atk * config.burn), u)
				u.cd = config.cooldown
				log_line(b, "%s施加全队灼烧，可净化或恢复" % u.name)
				event(b, "skill", u, foes, null, "灼烧")
				return
			"healer":
				var config: Dictionary = enemy_cfg("healer")
				var wounded: Dictionary = lowest(allies)
				if wounded and wounded.hp < wounded.maxHp * config.threshold:
					heal(b, wounded, u.atk * config.multiplier, u)
					u.cd = config.cooldown
					log_line(b, "%s恢复%s" % [u.name, wounded.name])
					return
	var attack_target: Dictionary = lowest(foes) if u.role == "archer" else target
	if not attack_target: attack_target = target
	event(b, "attack", u, [attack_target], null, "普通攻击")
	damage(b, u, attack_target, enemy_cfg("attack").multiplier)
static func act(b: Dictionary, action: Dictionary) -> bool:
	var u: Dictionary = current_actor(b)
	if not u or b.result != null: return false
	if action.get("form") == "combined" and (action.get("kind") != "skill" or not can_combine(b)): return false
	var stunned: Dictionary = status(u, "stun")
	if stunned:
		begin_action(b, "action-%d" % (b.actionCount + 1), u)
		u.statuses.erase(stunned)
		log_line(b, "%s受牵制，跳过一次正常行动" % u.name)
		event(b, "skip", u, [u], 0, "牵制")
		advance(b)
		return true
	if u.side == "enemy":
		begin_action(b, "action-%d" % (b.actionCount + 1), u)
		enemy_action(b, u)
		advance(b)
		return true
	var kind: String = action.get("kind", "attack")
	if b.get("autoOnly",false) and kind not in ["attack","skill"]: return false
	var source_id: String = action.get("sourceId", "")
	var targets: Array = legal_targets(b, kind, source_id)
	if kind == "skill" and u.cd > 0: return false
	var c: Dictionary = GameData.character(u.id)
	if kind == "skill" and c.skill.target == "sourceRecipient" and (source_id.is_empty() or source_id not in legal_sources(b)): return false
	if action.get("targetId", "") != "" and action.targetId not in targets: return false
	if targets.is_empty(): return false
	begin_action(b, "action-%d" % (b.actionCount + 1), u)
	b.activeKind=kind
	var target: Dictionary = unit(b, action.get("targetId", targets[0]))
	u.counters.follow = 0
	if kind == "guard" and target:
		shield(b, target, target.maxHp * cfg("COMBAT_RULES").guardShield, u)
		add_status(b, target, "guard", cfg("COMBAT_RULES").guardTurns, cfg("COMBAT_RULES").guardReduction, u)
		log_line(b, "%s护持%s，获得护盾与 38%% 减伤 2 回合" % [u.name, target.name])
		event(b, "guard", u, [target], null, "护持")
		var same: Dictionary = boon(b, "solidarity")
		if same and claim(b, "boon:solidarity", same.scope, same.limit):
			var old: Dictionary = with_boon(b, "solidarity", [target])
			shield(b, target, target.maxHp * same.power)
			b.actionContext = old
	elif kind == "skill":
		player_skill(b, u, target, unit(b, source_id), action.get("form", "normal"))
		var first: Dictionary = boon(b, "initiative")
		if first and b.round == 1 and claim(b, "boon:initiative", first.scope, first.limit):
			b.pendingAttacks.initiative = {"round":b.round, "actionId":b.actionContext.id}
			var old: Dictionary = effect_context(b, "boon", "initiative", "boon", "initiative")
			event(b, "boonReady", u, [u], null, "先声已就绪")
			log_line(b, "先声已就绪：下一次合法普攻追加并削弱目标攻击")
			b.actionContext = old
	elif target:
		var pending: Dictionary = b.pendingAttacks.duplicate()
		event(b, "attack", u, [target], null, c.attackName)
		damage(b, u, target, cfg("COMBAT_RULES").attackMultiplier)
		if u.id == "nezha": follow(b, u)
		if u.id == "tongtian":
			u.formation = min(tuning("tongtian").maxLayers, u.formation + tuning("tongtian").layersPerAction)
			log_line(b, "通天积累剑阵 %d/3" % u.formation)
		for id: String in ["victory", "initiative"]:
			if not pending.has(id) or pending[id].actionId == b.actionContext.id or u.hp <= 0 or b.result != null: continue
			var bonus: Dictionary = boon(b, id)
			if not bonus: continue
			var follow_target: Dictionary = target if target.hp > 0 else lowest(front_targets(b, u))
			b.pendingAttacks.erase(id)
			if not follow_target: continue
			var old: Dictionary = with_boon(b, id, [follow_target])
			if id == "initiative": add_status(b, follow_target, "weakened", bonus.turns, bonus.attackDown, u)
			event(b, "follow", u, [follow_target], null, "%s追加" % bonus.name, "boon-follow")
			damage(b, u, follow_target, bonus.power, {"reactive":true, "type":"boonDamage"})
			b.actionContext = old
	_expansion_passive(b, u, "onActionEnd", target, kind)
	if u.hp>0 and float(u.get("recoveryRate",0))>0: heal(b,u,u.atk*float(u.recoveryRate),u)
	if not b.get("petSupport",{}).is_empty():
		b.petActions=int(b.get("petActions",0))+1
		if int(b.petActions)%maxi(1,int(b.petSupport.get("interval",6)))==0: _pet_action(b)
	b.erase("activeKind")
	advance(b)
	return true
static func choose_auto_action(b: Dictionary) -> Dictionary:
	var u: Dictionary = current_actor(b)
	if not u or u.side == "enemy" or status(u, "stun"): return {"kind":"attack"}
	var allies: Array = friends(b, u)
	var foes: Array = opponents(b, u)
	var threatened: bool = foes.any(func(x: Dictionary) -> bool: return x.charge > 0)
	var wounded: Dictionary = lowest(allies)
	var missing: float = 0
	var capacity: float = 0
	for x: Dictionary in allies:
		missing += x.maxHp - x.hp
		capacity += x.maxHp
	var needs_heal: bool = missing >= capacity * cfg("SYNERGY_RULES").autoHealMissingRatio
	var needs_cleanse: bool = allies.any(debuffed)
	if u.cd == 0:
		if u.id == "xuandu":
			var sources: Array = allies.filter(func(t: Dictionary) -> bool: return t.statuses.any(transferable_buff))
			var source: Dictionary = sources[0] if not sources.is_empty() else allies[0]
			var recipient: Dictionary = lowest(allies.filter(func(t: Dictionary) -> bool: return t.uid != source.uid))
			if not recipient: recipient = source
			return {"kind":"skill", "sourceId":source.uid, "targetId":recipient.uid}
		var healing_only: bool = u.id in ["bigan", "taiyi"] or GameData.character(u.id).get("combatRole", "") == "healer"
		var useful_heal: bool = not healing_only or needs_heal or needs_cleanse or threatened or (u.id == "taiyi" and u.branch == "B" and has_branch(u))
		var targets: Array = legal_targets(b, "skill")
		var target_units: Array = targets.map(func(uid: String) -> Dictionary: return unit(b, uid))
		var enemies: Array = target_units.filter(func(t: Dictionary) -> bool: return t.side != u.side)
		var marked: Array = enemies.filter(func(t: Dictionary) -> bool: return not status(t, "mark").is_empty())
		var exploited: Array = enemies.filter(debuffed) if u.id == "qiongxiao" else []
		var target: Dictionary = lowest(exploited)
		if not target: target = lowest(marked)
		if not target: target = lowest(enemies)
		if not target: target = lowest(target_units)
		if useful_heal:
			var chosen: Dictionary = {"kind":"skill", "form":"combined" if u.id == "yunxiao" and can_combine(b) and (foes.size() >= 3 or threatened or needs_heal) else "normal"}
			if target: chosen.targetId = target.uid
			return chosen
	if not b.get("autoOnly",false) and threatened and wounded and float(wounded.hp) / wounded.maxHp < cfg("SYNERGY_RULES").autoProtectHealthRatio and (not status(wounded, "guard") or wounded.shield == 0): return {"kind":"guard", "targetId":wounded.uid}
	var attack_targets: Array = legal_targets(b, "attack").map(func(uid: String) -> Dictionary: return unit(b, uid))
	var target: Dictionary = lowest(attack_targets.filter(func(t: Dictionary) -> bool: return not status(t, "mark").is_empty()))
	if not target: target = lowest(attack_targets)
	var chosen: Dictionary = {"kind":"attack"}
	if target: chosen.targetId = target.uid
	return chosen
static func auto_act(b: Dictionary) -> bool: return act(b, choose_auto_action(b))
static func use_method(b: Dictionary) -> bool:
	if b.get("autoOnly",false): return false
	var u: Dictionary = current_actor(b)
	var method: Dictionary = GameData.named(cfg("METHODS"), b.method)
	if not u or u.side != "ally" or not method or b.methodUses >= method.maxUses or b.result != null: return false
	_apply_method(b,u,method,false)
	return true
static func _apply_method(b: Dictionary,u: Dictionary,method: Dictionary,passive: bool) -> void:
	b.methodUses += 1
	b.methodSerial += 1
	begin_action(b, "method-%d" % b.methodSerial, u, "method", method.id)
	var allies: Array = living(b, "ally")
	var foes: Array = living(b, "enemy")
	if method.id == "break":
		for t: Dictionary in foes:
			remove_shields(b, t, method.shieldCut)
			add_status(b, t, "defDown", method.turns, method.power)
			reduce_will(b, t, method.willDown)
	if method.id in ["ward", "thunderward"]:
		for t: Dictionary in allies:
			shield(b, t, t.maxHp * method.power)
			add_status(b, t, "guard", method.turns, method.reduction)
	if method.id == "cleanse":
		for t: Dictionary in allies:
			cleanse(b, t, method.cleanseCount)
			heal(b, t, t.maxHp * method.power)
	log_line(b, ("%s开场自动生效" if passive else "施放%s（独立于行动，每战仅一次）") % method.name)
	event(b, "method", u, foes if method.id == "break" else allies, null, method.name)
	intents(b)

static func _pet_action(b: Dictionary) -> void:
	var allies: Array=living(b,"ally")
	var foes: Array=living(b,"enemy")
	if allies.is_empty() or foes.is_empty() or b.result!=null: return
	var pet: Dictionary=b.petSupport
	var source: Dictionary=allies[0]
	var old: Dictionary=effect_context(b,"pet","pet-support","pet",str(pet.get("petId","spirit")))
	# The locked support coefficient already includes cultivation and inner-pill bonuses.
	var coefficient: float=maxf(0,float(pet.get("coefficient",0.25)))
	match str(pet.get("skill","flame")):
		"spring":
			var target: Dictionary=lowest(allies)
			heal(b,target,source.atk*coefficient,source)
			event(b,"heal",source,[target],null,str(pet.get("name","灵兽"))+" · 灵泉")
		"shell":
			for target: Dictionary in allies: shield(b,target,source.atk*coefficient,source)
			event(b,"guard",source,allies,null,str(pet.get("name","灵兽"))+" · 护佑")
		_:
			var target: Dictionary=lowest(foes)
			damage(b,source,target,coefficient,{"reactive":true,"type":"petDamage"})
			event(b,"skill",source,[target],null,str(pet.get("name","灵兽"))+" · 灵焰")
	b.actionContext=old

## Shared display/combat calculation. Equipment is optional and never determines victory.
static func member_stats(member: Dictionary) -> Dictionary:
	var c: Dictionary = GameData.character(str(member.get("id", "")))
	if c.is_empty(): return {}
	var rules: Dictionary = cfg("COMBAT_RULES")
	var level: int = int(clamp(floor(member.get("level", 1)), 1, rules.levelCap))
	var treasure: int = int(clamp(floor(member.get("treasure", 0)), 0, rules.treasureCap))
	var stats: Dictionary = {
		"maxHp":int(round(c.hp * (1.0 + (level - 1) * rules.hpGrowth + treasure * rules.treasureStatGrowth))),
		"atk":int(round(c.atk * (1.0 + (level - 1) * rules.attackGrowth + treasure * rules.treasureStatGrowth))),
		"def":int(round(c.def * (1.0 + (level - 1) * rules.defenseGrowth + treasure * rules.treasureStatGrowth))),
		"speed":c.speed, "critRate":0.0, "critDamage":0.5, "damageBonus":0.0, "healBonus":0.0}
	var equipment: Dictionary = member.get("equipmentStats", {})
	for pair: Array in [["maxHp","hp"],["atk","atk"],["def","def"]]:
		var flat: float = float(equipment.get(pair[1] + "Flat", 0.0))
		var percent: float = float(equipment.get(pair[1] + "Percent", 0.0))
		if not is_finite(flat): flat = 0.0
		if not is_finite(percent): percent = 0.0
		stats[pair[0]] = int(max(1 if pair[0] == "maxHp" else 0, round(stats[pair[0]] * (1.0 + max(-0.95, percent)) + flat)))
	for key: String in ["speedFlat", "critRate", "critDamage", "damageBonus", "healBonus","comboRate","counterRate","recoveryRate","critResist","comboResist","counterResist","openingShield","skillBonus","petBonus"]:
		if not equipment.has(key) and key not in ["speedFlat","critRate","critDamage","damageBonus","healBonus"]: continue
		var value: float = float(equipment.get(key, 0.0))
		if not is_finite(value): value = 0.0
		match key:
			"speedFlat": stats.speed = max(1.0, stats.speed + value)
			"critRate": stats.critRate = clamp(value, 0.0, 1.0)
			"critDamage": stats.critDamage = max(0.0, 0.5 + value)
			_: stats[key] = max(-0.95, value)
	return stats

static func replay_auto(request: Dictionary,submitted: Dictionary) -> String:
	var expected: Dictionary=create(int(request.get("stageId",1)),request.get("team",[]),request.get("options",{}))
	if expected.has("error"): return str(expected.error)
	if not expected.get("autoOnly",false): return "战前未启用自动规则"
	var safety: int=0
	while expected.result==null and safety<5000:
		if not auto_act(expected): return "战斗重演无法行动"
		safety+=1
	if expected.result==null: return "战斗重演超过行动上限"
	for key: String in ["id","stageId","seed","rng","result","actionCount","round","units","events","stats","method","methodUses","pill","autoOnly","petSupport"]:
		if GameData.normalize(expected.get(key))!=GameData.normalize(submitted.get(key)): return "战斗重演结果不符："+key
	return ""

## Declarative native skills for the v0.4 mythology roster. No executable external code.
static func _effect_targets(b: Dictionary, owner: Dictionary, selected: Dictionary, selector: String) -> Array:
	var allies: Array = friends(b, owner)
	var foes: Array = opponents(b, owner)
	match selector:
		"self": return [owner] if owner.hp > 0 else []
		"allies": return allies
		"enemies": return foes
		"allyOthers": return allies.filter(func(t: Dictionary) -> bool: return t.uid != owner.uid)
		"allyFront": return allies.filter(func(t: Dictionary) -> bool: return t.row == "front")
		"allyBack": return allies.filter(func(t: Dictionary) -> bool: return t.row == "back")
		"enemyFront": return front_targets(b, owner)
		"enemyBack":
			var back: Array = foes.filter(func(t: Dictionary) -> bool: return t.row == "back")
			return back if not back.is_empty() else foes
		"allyLowest":
			var target: Dictionary = lowest(allies)
			return [target] if target else []
		"enemyLowest":
			var target: Dictionary = lowest(foes)
			return [target] if target else []
		_: return [selected] if selected and selected.hp > 0 else []
static func _expansion_condition(b: Dictionary, owner: Dictionary, selected: Dictionary, condition: String, action_kind: String = "") -> bool:
	match condition:
		"targetLow": return not selected.is_empty() and selected.hp < selected.maxHp * 0.5
		"targetMarked": return not selected.is_empty() and not status(selected, "mark").is_empty()
		"targetDebuffed": return not selected.is_empty() and debuffed(selected)
		"allyLow": return friends(b, owner).any(func(x: Dictionary) -> bool: return x.hp < x.maxHp * 0.5)
		"allyDebuffed": return friends(b, owner).any(debuffed)
		"skillOnly": return action_kind == "skill"
		"attackOnly": return action_kind == "attack"
		"guardOnly": return action_kind == "guard"
		"": return true
		_: return false
static func _run_effects(b: Dictionary, owner: Dictionary, selected: Dictionary, effects: Array, reactive: bool = false) -> void:
	for effect: Dictionary in effects:
		if owner.hp <= 0: return
		var targets: Array = _effect_targets(b, owner, selected, effect.get("target", "selected"))
		for target: Dictionary in targets:
			if target.hp <= 0 or not _expansion_condition(b, owner, target, effect.get("condition", "")): continue
			if effect.get("nonBossOnly", false) and target.boss: continue
			var strength: float = float(effect.get("power", 0.0))
			var amount: float = strength
			match str(effect.get("scale", "")):
				"atk": amount *= owner.atk
				"maxHp": amount *= target.maxHp
			match str(effect.op):
				"damage":
					damage(b, owner, target, strength, {"aoe":effect.get("target", "selected") in ["enemies","enemyFront","enemyBack"], "reactive":reactive, "type":"followDamage" if reactive else "damage"})
				"status": add_status(b, target, effect.status, float(effect.get("turns", 2)), round(amount) if effect.get("scale", "") == "atk" else amount, owner)
				"heal": heal(b, target, amount, owner)
				"shield": shield(b, target, amount, owner)
				"cleanse": cleanse(b, target, strength, owner)
				"removeShield": remove_shields(b, target, strength, owner)
				"reduceWill": reduce_will(b, target, strength, owner)
				"reduceCharge": reduce_charge(b, target, strength, owner)
				"stripBuff":
					var removed: Array = []
					for buff: Dictionary in target.statuses:
						if removed.size() >= int(strength): break
						if cfg("STATUS_CONFIG").get(buff.id, {}).get("transferable", false): removed.append(buff)
					for buff: Dictionary in removed: target.statuses.erase(buff)
					if not removed.is_empty():
						event(b, "dispel", owner, [target], removed.size(), "解去普通增益")
						log_line(b, "%s解去%s的%d项普通增益" % [owner.name, target.name, removed.size()])
static func _expansion_passive(b: Dictionary, owner: Dictionary, trigger_name: String, selected: Dictionary = {}, action_kind: String = "") -> void:
	if not owner or owner.hp <= 0: return
	var character: Dictionary = GameData.character(owner.id)
	var passive: Dictionary = character.get("combat", {}).get("passive", {})
	if passive.is_empty() or passive.get("trigger", "") != trigger_name: return
	if not _expansion_condition(b, owner, selected, passive.get("condition", ""), action_kind): return
	var trigger_id: String = "passive:" + str(owner.id)
	if not claim(b, owner.uid + ":" + trigger_id, passive.get("scope", "round"), passive.get("limit", 1)): return
	var old: Dictionary = effect_context(b, "follow", trigger_id)
	trigger(b, trigger_id, owner, [owner], character.name + "被动")
	_run_effects(b, owner, selected, passive.get("effects", []), true)
	b.actionContext = old
