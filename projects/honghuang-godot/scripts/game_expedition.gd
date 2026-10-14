class_name GameExpedition
extends RefCounted
## Native expedition rules. Commands mutate only a caller-owned transaction draft.
## All saved field names intentionally match the legacy v0.3 JSON schema.
const Data = preload("res://scripts/game_data.gd")
const RESOURCE_KEYS = ["stone", "xp", "material", "herb", "ticket", "fate"]
const BATTLE_NODES = [1, 3, 5]
const MAX_SAFE_INTEGER = 9007199254740991

static func command(state: Dictionary, name: String, args: Dictionary = {}, now: int = -1) -> Dictionary:
	match name:
		"startExpedition":
			var options: Dictionary = args.get("options", {}).duplicate(true) if args.get("options", {}) is Dictionary else {}
			for key in ["id", "seed"]:
				if args.has(key) and not options.has(key): options[key] = args[key]
			if now >= 0 and not options.has("now"): options.now = now
			return start_expedition(state, args.get("routeId", ""), options)
		"chooseBoon": return choose_boon(state, args.get("id", ""))
		"prepareExpeditionBattle": return prepare_expedition_battle(state)
		"settleExpeditionBattle": return settle_expedition_battle(state, args.get("battle"))
		"closeExpedition": return close_expedition(state, args.get("runId"), args.get("reason", "主动结算退出"))
		"isRouteUnlocked": return _ok(is_route_unlocked(state, args.get("routeId", "")))
		"expeditionCompatibility": return _ok(expedition_compatibility(state))
		"expeditionCandidates": return _ok(expedition_candidates(state))
	return _error("未知秘境命令：" + name)

static func routes() -> Array:
	return Data.expedition("ROUTES", []).duplicate(true)

static func route(route_id: Variant) -> Dictionary:
	return Data.named(Data.expedition("ROUTES", []), route_id)

static func empty_resources() -> Dictionary:
	return {"stone": 0, "xp": 0, "material": 0, "herb": 0, "ticket": 0, "fate": 0}

static func _full(part: Dictionary) -> Dictionary:
	var value: Dictionary = empty_resources()
	value.merge(part, true)
	return value

static func _ok(data: Variant = null) -> Dictionary:
	return {"ok": true, "error": "", "data": data}

static func _error(message: String) -> Dictionary:
	return {"ok": false, "error": message, "data": null}

static func _active(state: Dictionary) -> Variant:
	return state.get("expeditions", {}).get("active")

static func is_route_unlocked(state: Dictionary, route_id: Variant) -> bool:
	var cfg: Dictionary = route(route_id)
	if cfg.is_empty(): return false
	for stage_id in state.get("cleared", []):
		if _nat(stage_id) and int(stage_id) == int(cfg.unlockStage): return true
	return false

static func legal_boons(team: Array, method: Variant = null) -> Array:
	var cleansing: bool = method == "cleanse"
	for member in team:
		if member is Dictionary and (member.get("id") in ["taiyi", "bigan"] or (member.get("id") == "xuandu" and member.get("treasure", 0) > 0)):
			cleansing = true
	var result: Array = []
	for boon in Data.content("BOONS", []):
		if boon.id != "clarity" or cleansing: result.append(boon.id)
	return result

static func _advance_random(seed: int) -> int:
	var value: int = seed & 0xffffffff
	if value == 0: value = 1
	value = (value ^ (value << 13)) & 0xffffffff
	value = (value ^ (value >> 17)) & 0xffffffff
	return (value ^ (value << 5)) & 0xffffffff

static func _rng_next(stream: Array) -> float:
	stream[0] = _advance_random(int(stream[0]))
	return float(stream[0]) / 4294967296.0

static func _next_random(state: Dictionary, stream: String) -> float:
	state.randomStreams[stream] = _advance_random(int(state.randomStreams[stream]))
	return float(state.randomStreams[stream]) / 4294967296.0

static func _shuffle(values: Array, stream: Array) -> Array:
	var result: Array = values.duplicate()
	for i in range(result.size() - 1, 0, -1):
		var j: int = int(floor(_rng_next(stream) * (i + 1)))
		var previous: Variant = result[i]
		result[i] = result[j]
		result[j] = previous
	return result

static func start_expedition(state: Dictionary, route_id: Variant, options: Dictionary = {}) -> Dictionary:
	if state.get("mainBattle") != null: return _error("请先完成或结束当前主线挑战")
	if state.get("characterChallenges", {}).get("active"): return _error("请先完成当前神仙试炼")
	if state.get("progression", {}).get("realm", {}).get("pending"): return _error("请先完成当前修行挑战")
	if _active(state) != null: return _error("已有一趟秘境，请继续或结算退出")
	var cfg: Dictionary = route(route_id)
	if cfg.is_empty(): return _error("秘境路线不存在")
	if not is_route_unlocked(state, route_id): return _error("先首通主线第%s节点" % int(cfg.unlockStage))
	var run_id: Variant = options.get("id")
	if run_id == null or run_id == "":
		run_id = "expedition-%s-%s" % [Data.now_ms(), Crypto.new().generate_random_bytes(12).hex_encode()]
	if not _text(run_id, 140, false) or state.expeditions.settled.has(run_id): return _error("秘境ID无效或已结算")
	if state.get("chosenMethod") == "thunderward" and state.get("thunderProject", {}).get("direction") != "teaching": return _error("雷泽传法当前未启用")
	var ids: Variant = state.get("team")
	if not _string_list(ids, 5) or ids.is_empty() or ids.size() > state.get("slots", 0): return _error("秘境队伍无效")
	for id in ids:
		if not state.get("owned", {}).get(id) is Dictionary: return _error("秘境队伍无效")
	var method: Variant = state.get("chosenMethod")
	if method != null and method != "" and not state.get("methods", []).has(method): return _error("秘境法门尚未研究")
	if options.has("seed") and not _nat(options.seed, 4294967295): return _error("秘境种子无效")
	var team: Array = []
	for id in ids:
		var member: Dictionary = state.owned[id]
		var snapshot_member = {"id": id, "level": member.level, "branch": member.branch, "treasure": member.treasure, "branchUnlocked": state.get("branchUnlocks", []).has(id) or member.level >= 3}
		var equipment_stats = GameEconomy.battle_extras(state, id)
		if not equipment_stats.is_empty(): snapshot_member.equipmentStats = equipment_stats.duplicate(true)
		team.append(snapshot_member)
	if state.has("framework"): team = load("res://scripts/game_framework.gd").party(state)
	var pill: Variant = state.get("chosenPill")
	if pill != null and state.get("items", {}).get(pill, 0) <= 0: return _error("所选丹药不足")
	var pool: Array = legal_boons(team, method)
	if pool.size() < 4: return _error("合法机缘不足，无法保证两次三选一")
	var candidate_seed: int = int(options.seed) if options.has("seed") else int(floor(_next_random(state, "expedition") * 4294967296.0))
	var candidate_stream: Array = [candidate_seed & 0xffffffff]
	var battle_stream: Array = [(int(options.seed) ^ 0x27d4eb2f) & 0xffffffff] if options.has("seed") else []
	var first: Array = _shuffle(pool, candidate_stream).slice(0, 3)
	var second_by_first: Dictionary = {}
	for choice in first:
		var remaining: Array = pool.duplicate()
		remaining.erase(choice)
		second_by_first[choice] = _shuffle(remaining, candidate_stream).slice(0, 3)
	var seeds: Dictionary = {}
	var node_rewards: Dictionary = {}
	for node in BATTLE_NODES:
		seeds[str(node)] = int(floor((_next_random(state, "battle") if battle_stream.is_empty() else _rng_next(battle_stream)) * 4294967296.0))
		node_rewards[str(node)] = node_reward(route_id, node)
	var run: Dictionary = {
		"id": run_id, "routeId": route_id, "createdAt": options.get("now", state.get("lastTime", 0)),
		"ruleVersion": Data.content("BATTLE_RULE_VERSION"), "snapshot": {"team": team, "method": method, "pill": pill, "autoOnly": true, "petSupport": load("res://scripts/game_progression.gd").battle_support(state)},
		"encounters": Data.content("SECRET_ENCOUNTERS", {})[route_id].duplicate(true), "seeds": seeds,
		"candidates": {"first": first, "secondByFirst": second_by_first}, "selectedBoons": [],
		"node": 1, "status": "ready", "startedBattles": [], "completedBattles": [], "rewards": [],
		"nodeRewards": node_rewards, "completionReward": _full(cfg.completionReward), "firstReward": _full(cfg.firstReward)
	}
	state.expeditions.active = run
	return _ok(run.duplicate(true))

static func expedition_compatibility(state: Dictionary) -> Dictionary:
	var run: Variant = _active(state)
	var compatible: bool = run == null or run.get("ruleVersion") == Data.content("BATTLE_RULE_VERSION")
	return {"compatible": compatible, "message": "" if compatible else "秘境规则版本已改变；已完成节点成果可结算退出，尚未挑战节点不补发"}

static func expedition_candidates(state: Dictionary) -> Array:
	var run: Variant = _active(state)
	if not run is Dictionary: return []
	if run.node == 2: return run.candidates.first.duplicate()
	if run.node == 4 and not run.selectedBoons.is_empty(): return run.candidates.secondByFirst.get(run.selectedBoons[0], []).duplicate()
	return []

static func choose_boon(state: Dictionary, id: Variant) -> Dictionary:
	var run: Variant = _active(state)
	if not run is Dictionary: return _error("没有正在进行的秘境")
	if not expedition_compatibility(state).compatible: return _error("规则版本不兼容，请结算退出")
	if run.status != "choice" or not expedition_candidates(state).has(id) or run.selectedBoons.has(id): return _error("机缘不可选或已选择")
	run.selectedBoons.append(id)
	run.node += 1
	run.status = "ready"
	return _ok(id)

static func prepare_expedition_battle(state: Dictionary) -> Dictionary:
	if state.get("mainBattle") != null: return _error("请先完成当前主线挑战")
	if state.get("characterChallenges", {}).get("active"): return _error("请先完成当前神仙试炼")
	if state.get("progression", {}).get("realm", {}).get("pending"): return _error("请先完成当前修行挑战")
	var run: Variant = _active(state)
	if not run is Dictionary: return _error("没有正在进行的秘境")
	if not expedition_compatibility(state).compatible: return _error("规则版本不兼容，请保留成果后结算退出")
	if not BATTLE_NODES.has(int(run.node)) or not ["ready", "battle", "failed"].has(run.status): return _error("当前节点不是战斗")
	var battle_id: String = "%s:node-%s" % [run.id, int(run.node)]
	if not run.startedBattles.has(battle_id):
		var pill: Variant = run.snapshot.pill
		if pill != null:
			if state.items.get(pill, 0) <= 0: return _error("这一节点锁定丹药不足，请先补充同种丹药")
			state.items[pill] -= 1
			if state.items[pill] == 0 and state.get("chosenPill") == pill: state.chosenPill = null
		run.startedBattles.append(battle_id)
	run.status = "battle"
	var encounter: Dictionary = run.encounters[str(int(run.node))]
	var options: Dictionary = {
		"battleId": battle_id, "seed": run.seeds[str(int(run.node))], "enemies": encounter.enemies.duplicate(true),
		"boons": run.selectedBoons.duplicate(), "ruleVersion": run.ruleVersion,
		"contextName": "%s · %s" % [route(run.routeId).name, encounter.name]
	}
	if run.snapshot.method != null: options.method = run.snapshot.method
	if run.snapshot.pill != null: options.pill = run.snapshot.pill
	options.autoOnly = bool(run.snapshot.get("autoOnly", false))
	options.petSupport = run.snapshot.get("petSupport", {}).duplicate(true)
	return _ok({"battleId": battle_id, "stageId": encounter.stageId, "team": run.snapshot.team.duplicate(true), "options": options})

static func node_reward(route_id: Variant, node: int) -> Dictionary:
	var amounts: Dictionary = {1: [25, 20, 2, 1], 3: [45, 35, 4, 1], 5: [80, 60, 6, 2]} if route_id == "danfire" else {1: [35, 25, 3, 1], 3: [65, 45, 5, 2], 5: [110, 80, 8, 3]}
	if not amounts.has(node): return empty_resources()
	var value: Array = amounts[node]
	return _full({"stone": value[0], "xp": value[1], "material": value[2], "herb": value[3]})

static func settle_expedition_battle(state: Dictionary, battle: Variant) -> Dictionary:
	var run: Variant = _active(state)
	if not run is Dictionary: return _error("没有正在进行的秘境")
	if not battle is Dictionary: return _error("秘境战斗快照不符")
	if run.completedBattles.has(battle.get("id")): return _ok({"duplicate": true, "won": true, "node": run.node})
	if run.status != "battle" or battle.get("id") != "%s:node-%s" % [run.id, int(run.node)] or not run.startedBattles.has(battle.get("id")): return _error("战斗不属于当前秘境节点")
	var encounter: Dictionary = run.encounters[str(int(run.node))]
	if battle.get("stageId") != encounter.stageId or battle.get("seed") != run.seeds[str(int(run.node))] or battle.get("ruleVersion") != run.ruleVersion or battle.get("trial", false): return _error("秘境战斗快照不符")
	if run.snapshot.get("autoOnly", false):
		var verified: String = GameCombat.replay_auto(prepare_expedition_battle(state).data, battle)
		if not verified.is_empty(): return _error(verified)
	if not battle.get("units") is Array: return _error("秘境队伍或携带快照不符")
	var allies: Array = []
	var enemies: Array = []
	for unit in battle.units:
		if not unit is Dictionary: return _error("秘境队伍或携带快照不符")
		if unit.get("side") == "ally": allies.append(unit)
		elif unit.get("side") == "enemy": enemies.append(unit)
	if allies.size() != run.snapshot.team.size(): return _error("秘境队伍或携带快照不符")
	for i in range(allies.size()):
		var unit: Dictionary = allies[i]
		var locked: Dictionary = run.snapshot.team[i]
		if unit.get("equipmentStats", {}) != locked.get("equipmentStats", {}): return _error("秘境装备快照不符")
		for key in ["id", "level", "branch", "treasure"]:
			if unit.get(key) != locked.get(key): return _error("秘境队伍或携带快照不符")
		if bool(unit.get("branchUnlocked", false)) != bool(locked.get("branchUnlocked", false)): return _error("秘境队伍或携带快照不符")
	if battle.get("method") != run.snapshot.method or battle.get("pill") != run.snapshot.pill or battle.get("boons") != run.selectedBoons: return _error("秘境队伍或携带快照不符")
	if enemies.size() != encounter.enemies.size(): return _error("秘境敌组快照不符")
	for i in range(enemies.size()):
		if enemies[i].get("id") != encounter.enemies[i].id: return _error("秘境敌组快照不符")
	if battle.get("result") not in ["win", "lose"]: return _error("战斗尚未结束")
	if battle.result == "win":
		for enemy in enemies:
			if not _nat(enemy.get("hp"), 1000000000) or enemy.hp > 0: return _error("首领未击败，不能结算勝利")
	if battle.result == "lose":
		run.status = "failed"
		return _ok({"duplicate": false, "won": false, "node": run.node})
	run.completedBattles.append(battle.id)
	_record_daily_battle(state)
	var reward: Dictionary = run.get("nodeRewards", {}).get(str(int(run.node)), node_reward(run.routeId, int(run.node)))
	run.rewards.append({"id": battle.id, "node": run.node, "reward": reward.duplicate(true)})
	if run.node == 5 and not state.expeditions.bossClears.has(run.routeId): state.expeditions.bossClears.append(run.routeId)
	run.node += 1
	run.status = "complete" if run.node == 6 else "choice"
	return _ok({"duplicate": false, "won": true, "node": run.node})

static func _record_daily_battle(state: Dictionary) -> void:
	var day: String = Time.get_datetime_string_from_unix_time(int(int(state.get("lastTime", 0)) / 1000)).substr(0, 10)
	if not state.get("daily") is Dictionary or day > str(state.daily.get("day", "")):
		state.daily = {"day": day, "progress": {"estate": 0, "battle": 0, "cultivation": 0}, "claimed": []}
	state.daily.progress.battle = mini(999999, int(state.daily.progress.get("battle", 0)) + 1)

static func close_expedition(state: Dictionary, run_id: Variant = null, reason: Variant = "主动结算退出") -> Dictionary:
	var run: Variant = _active(state)
	if run_id == null and run is Dictionary: run_id = run.id
	if not _text(run_id, 140, false): return _error("没有待结算秘境")
	if not _text(reason, 200): return _error("秘境结算原因无效")
	for previous in state.get("expeditions", {}).get("closed", []):
		if previous.id == run_id:
			var copy: Dictionary = previous.duplicate(true)
			copy.duplicate = true
			return _ok(copy)
	if not run is Dictionary: return _error("没有正在进行的秘境")
	if run.id != run_id: return _error("秘境ID不符")
	var complete: bool = run.status == "complete" and run.completedBattles.size() == 3
	var first: bool = complete and not state.expeditions.firstCleared.has(run.routeId)
	var reward: Dictionary = empty_resources()
	for earned in run.rewards:
		for key in RESOURCE_KEYS: reward[key] += earned.reward[key]
	if complete:
		for key in RESOURCE_KEYS: reward[key] += run.completionReward[key]
	if first:
		for key in RESOURCE_KEYS: reward[key] += run.firstReward[key]
	var caps: Dictionary = Data.economy("ECONOMY", {}).get("resourceCaps", {})
	for key in RESOURCE_KEYS: state.resources[key] = mini(int(caps[key]), int(state.resources[key] + reward[key]))
	if first: state.expeditions.firstCleared.append(run.routeId)
	var summary: Dictionary = {"id": run.id, "routeId": run.routeId, "complete": complete, "first": first, "reward": reward, "reason": reason}
	state.expeditions.settled.append(run.id)
	state.expeditions.closed.append(summary)
	state.expeditions.active = null
	var result: Dictionary = summary.duplicate(true)
	result.duplicate = false
	return _ok(result)

static func _nat(value: Variant, maximum: int = MAX_SAFE_INTEGER) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and value >= 0 and value <= maximum and float(value) == floor(float(value))

static func _text(value: Variant, maximum: int, allow_empty: bool = true) -> bool:
	return value is String and value.length() <= maximum and (allow_empty or not value.is_empty())

static func _string_list(value: Variant, maximum: int = 100000) -> bool:
	if not value is Array or value.size() > maximum: return false
	var seen: Dictionary = {}
	for id in value:
		if not _text(id, 200, false) or seen.has(id): return false
		seen[id] = true
	return true

static func _reward_shape(value: Variant) -> bool:
	if not value is Dictionary: return false
	for key in RESOURCE_KEYS:
		if not _nat(value.get(key), 10000): return false
	return value.ticket == 0 and value.fate == 0

## Structural validation deliberately accepts old rule snapshots for safe export/closure.
## Empty string means valid. A nonempty string is a user-facing validation error.
static func validate_expedition_ledger(value: Variant, state: Dictionary) -> String:
	if not value is Dictionary: return "秘境记录无效"
	if not _string_list(value.get("settled")) or not _string_list(value.get("firstCleared"), 2) or not _string_list(value.get("bossClears"), 2): return "秘境结算记录无效"
	for id in value.firstCleared + value.bossClears:
		if route(id).is_empty(): return "秘境结算记录无效"
	for id in value.firstCleared:
		if not value.bossClears.has(id): return "秘境首通缺少首领记录"
	if not value.get("closed") is Array or value.closed.size() != value.settled.size(): return "秘境历史无效"
	var summary_ids: Dictionary = {}
	for summary in value.closed:
		if not summary is Dictionary: return "秘境历史成果无效"
		if not value.settled.has(summary.get("id")) or summary_ids.has(summary.get("id")) or route(summary.get("routeId")).is_empty(): return "秘境历史成果无效"
		if not summary.get("complete") is bool or not summary.get("first") is bool or (summary.first and not summary.complete) or not _reward_shape(summary.get("reward")) or not _text(summary.get("reason"), 200): return "秘境历史成果无效"
		summary_ids[summary.id] = true
	if not value.has("active") or (value.active != null and not value.active is Dictionary): return "当前秘境无效"
	if value.active == null: return ""
	var run: Dictionary = value.active
	if not _text(run.get("id"), 140, false) or value.settled.has(run.get("id")) or route(run.get("routeId")).is_empty() or not is_route_unlocked(state, run.get("routeId")) or not _nat(run.get("createdAt")) or not _text(run.get("ruleVersion"), 40): return "秘境路线或规则无效"
	if not _nat(run.get("node"), 6) or run.node < 1 or run.get("status") not in ["ready", "battle", "choice", "failed", "complete"]: return "秘境节点无效"
	if (int(run.node) in [2, 4]) != (run.status == "choice") or (run.node == 6) != (run.status == "complete"): return "秘境状态与节点不符"
	if not run.get("snapshot") is Dictionary or not run.snapshot.get("team") is Array or run.snapshot.team.is_empty() or run.snapshot.team.size() > 5: return "秘境队伍快照无效"
	var member_ids: Dictionary = {}
	for member in run.snapshot.team:
		if not member is Dictionary or not member.get("id") is String: return "秘境角色快照无效"
		if member_ids.has(member.id): return "秘境队伍快照无效"
		member_ids[member.id] = true
		if (member.id != GameFramework.LORD and not state.get("owned", {}).has(member.id)) or not _nat(member.get("level"), 20) or member.level < 1 or member.get("branch") not in ["A", "B"] or not _nat(member.get("treasure"), 3): return "秘境角色快照无效"
	if not run.snapshot.has("method") or run.snapshot.method not in [null, "break", "ward", "cleanse", "thunderward"]: return "秘境法门快照无效"
	if not run.snapshot.has("pill") or run.snapshot.pill not in [null, "training", "ward", "heal", "cleanse"]: return "秘境丹药快照无效"
	if not run.get("encounters") is Dictionary or not run.get("seeds") is Dictionary: return "秘境敌组快照无效"
	for node in BATTLE_NODES:
		var encounter: Variant = run.encounters.get(str(node))
		if not encounter is Dictionary: return "秘境战斗配置无效"
		if not _text(encounter.get("name"), 100) or not _text(encounter.get("description"), 500) or (not _nat(encounter.get("stageId")) or int(encounter.stageId) not in [8, 12]) or not encounter.get("enemies") is Array or encounter.enemies.is_empty() or encounter.enemies.size() > 8 or not _nat(run.seeds.get(str(node)), 4294967295): return "秘境战斗配置无效"
		for enemy in encounter.enemies:
			if not enemy is Dictionary: return "秘境敌人快照无效"
			if not enemy.get("id") is String or not enemy.get("name") is String or enemy.get("row") not in ["front", "back"] or not _nat(enemy.get("hp"), 100000) or enemy.hp <= 0 or not _nat(enemy.get("atk"), 10000) or not _nat(enemy.get("def"), 10000) or not _nat(enemy.get("speed"), 1000): return "秘境敌人快照无效"
	if not run.get("candidates") is Dictionary or not _string_list(run.candidates.get("first"), 3) or run.candidates.first.size() != 3 or not run.candidates.get("secondByFirst") is Dictionary: return "机缘候选快照无效"
	var legal: Array = legal_boons(run.snapshot.team, run.snapshot.method) if run.ruleVersion == Data.content("BATTLE_RULE_VERSION") else run.candidates.first.duplicate()
	if run.ruleVersion != Data.content("BATTLE_RULE_VERSION"):
		for choices in run.candidates.secondByFirst.values():
			if not choices is Array: return "第二次机缘必须预存三个合法且不重复的候选"
			for choice in choices:
				if not legal.has(choice): legal.append(choice)
	for choice in run.candidates.first:
		var second: Variant = run.candidates.secondByFirst.get(choice)
		if not legal.has(choice) or not _string_list(second, 3) or second.size() != 3: return "第二次机缘必须预存三个合法且不重复的候选"
		for id in second:
			if not legal.has(id) or id == choice: return "第二次机缘必须预存三个合法且不重复的候选"
	if not _string_list(run.get("selectedBoons"), 2) or run.selectedBoons.size() != (0 if run.node <= 2 else 1 if run.node <= 4 else 2): return "已选机缘无效"
	if not run.selectedBoons.is_empty() and not run.candidates.first.has(run.selectedBoons[0]): return "已选机缘无效"
	if run.selectedBoons.size() == 2 and not run.candidates.secondByFirst[run.selectedBoons[0]].has(run.selectedBoons[1]): return "已选机缘无效"
	if not _string_list(run.get("startedBattles"), 3) or not _string_list(run.get("completedBattles"), 3): return "节点去重记录无效"
	var ticket_ids: Array = []
	var done_ids: Array = []
	for node in BATTLE_NODES:
		var ticket: String = "%s:node-%s" % [run.id, node]
		ticket_ids.append(ticket)
		if node < run.node: done_ids.append(ticket)
	for id in run.startedBattles:
		if not ticket_ids.has(id): return "节点去重记录无效"
	for id in run.completedBattles:
		if not run.startedBattles.has(id): return "节点去重记录无效"
	if done_ids.size() != run.completedBattles.size(): return "节点完成顺序无效"
	for id in done_ids:
		if not run.completedBattles.has(id): return "节点完成顺序无效"
	if not run.get("rewards") is Array or run.rewards.size() != run.completedBattles.size(): return "节点待结算成果无效"
	var reward_ids: Dictionary = {}
	for earned in run.rewards:
		if not earned is Dictionary or not earned.get("id") is String or not _nat(earned.get("node"), 5): return "节点待结算成果无效"
		if reward_ids.has(earned.id) or not run.completedBattles.has(earned.id) or earned.id != "%s:node-%s" % [run.id, int(earned.node)] or not _reward_shape(earned.get("reward")): return "节点待结算成果无效"
		reward_ids[earned.id] = true
	if run.has("nodeRewards"):
		if not run.nodeRewards is Dictionary: return "节点奖励快照无效"
		for node in BATTLE_NODES:
			if not _reward_shape(run.nodeRewards.get(str(node))): return "节点奖励快照无效"
	if not _reward_shape(run.get("completionReward")) or not _reward_shape(run.get("firstReward")): return "整趟奖励快照无效"
	return ""
