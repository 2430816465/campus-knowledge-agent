class_name GameActivities
extends RefCounted
## Original, deterministic local activity rules. No UI code or network impersonation.
## Public commands are atomic even when invoked without GameStore: failed drafts never commit.
const COMMANDS := ["activityStart", "activityAct", "activitySettle", "activityClaimMilestone", "activityFestivalExchange", "activityEquipCosmetic", "activityOnlineRequest", "activitySweep"]
const RESOURCE_KEYS := ["stone", "xp", "material", "herb", "ticket", "fate"]
static var _rules: Dictionary = {}

static func rules() -> Dictionary:
	if _rules.is_empty():
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://data/activities-rules.json"))
		if parsed is Dictionary: _rules = parsed
	return _rules

static func definitions() -> Array:
	return rules().get("definitions", []).duplicate(true)

static func definition(id: String) -> Dictionary:
	for item: Dictionary in rules().get("definitions", []):
		if str(item.id) == id: return item.duplicate(true)
	return {}

static func handles(cmd: String) -> bool:
	return cmd in COMMANDS

static func ensure_state(s: Dictionary) -> void:
	if not s.has("activities"):
		s.activities = {"version": 1, "seq": 0, "rng": maxi(1, int(s.get("createdAt", 1)) & 0xffffffff), "runs": {}, "settled": {}, "records": {}, "completed": 0, "spent": 0, "claimed": [], "history": [], "cosmetics": [], "festivals": {"083": {"tokens": 0, "tasks": {}, "purchases": {}}, "083b": {"tokens": 0, "tasks": {}, "purchases": {}}}}
	if not s.activities.has("equippedCosmetic"): s.activities.equippedCosmetic = ""
	if not s.activities.has("consumption"):
		s.activities.consumption = {"version":1,"fromAt":maxi(0,int(s.get("lastTime",s.get("createdAt",0)))),"commands":0,"resources":{},"materials":{},"legacyCultivation":_known_cultivation(s)}

static func _known_cultivation(s: Dictionary) -> int:
	var total: int = 0
	for member: Dictionary in s.get("owned", {}).values():
		for key: String in ["stone", "xp"]: total += int(member.get("spent", {}).get(key, 0))
	return mini(999999999,total)

## The economy calls this once on its successful draft before validate/commit.
## Failed commands must not call it. Newly gained/refunded assets never count.
static func record_consumption(after: Dictionary, before: Dictionary, _cmd: String, now: int) -> void:
	# The command may have migrated its draft already; inspect the pre-command save.
	var missing: bool = not before.get("activities", {}).has("consumption")
	ensure_state(after)
	var ledger: Dictionary = after.activities.consumption
	if missing: ledger.legacyCultivation = _known_cultivation(before); ledger.fromAt = maxi(0,now)
	var changed: bool = false
	for key: String in RESOURCE_KEYS:
		var spent: int = maxi(0,int(before.get("resources",{}).get(key,0))-int(after.get("resources",{}).get(key,0)))
		if spent > 0: ledger.resources[key] = mini(999999999,int(ledger.resources.get(key,0))+spent); changed = true
	var old_materials: Dictionary = before.get("progression",{}).get("materials",{})
	var new_materials: Dictionary = after.get("progression",{}).get("materials",{})
	for key: String in old_materials:
		var spent: int = maxi(0,int(old_materials[key])-int(new_materials.get(key,old_materials[key])))
		if spent > 0: ledger.materials[key] = mini(999999999,int(ledger.materials.get(key,0))+spent); changed = true
	if changed: ledger.commands = mini(999999999,int(ledger.commands)+1)

static func cosmetic_name(s: Dictionary) -> String:
	var id: String = str(s.get("activities",{}).get("equippedCosmetic",""))
	if id.is_empty() or id not in s.get("activities",{}).get("cosmetics",[]): return ""
	for offer: Dictionary in rules().festivalOffers + rules().celebrationOffers:
		if offer.get("cosmetic","") == id: return str(offer.name).replace("纪念名片·", "").replace("纪念名片 · ", "")
	return ""

static func _ok(data: Variant = null) -> Dictionary:
	return {"ok": true, "error": "", "data": data}

static func _fail(message: String) -> Dictionary:
	return {"ok": false, "error": message, "data": null}

static func _nat(value: Variant, cap: int = 999999999) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and float(value) == floor(float(value)) and value >= 0 and value <= cap

static func command(s: Dictionary, cmd: String, args: Dictionary = {}, now: int = -1) -> Dictionary:
	if not handles(cmd): return _fail("未知活动操作")
	var before_error: String = validate(s)
	if not before_error.is_empty(): return _fail(before_error)
	var draft: Dictionary = s.duplicate(true)
	ensure_state(draft)
	var result: Dictionary = _dispatch(draft, cmd, args, maxi(0, now if now >= 0 else int(s.get("lastTime", 0))))
	if not result.get("ok", false): return result
	var error: String = validate(draft)
	if not error.is_empty(): return _fail(error)
	s.clear()
	s.merge(draft, true)
	return result

static func _dispatch(s: Dictionary, cmd: String, args: Dictionary, now: int) -> Dictionary:
	var id: String = str(args.get("id", ""))
	var cfg: Dictionary = definition(id)
	if cmd == "activityClaimMilestone": return _claim_milestone(s, id)
	if cmd == "activityEquipCosmetic":
		var cosmetic: String = str(args.get("cosmetic",""))
		if not cosmetic.is_empty() and cosmetic not in s.activities.cosmetics: return _fail("尚未拥有这张纪念名片")
		s.activities.equippedCosmetic = cosmetic
		return _ok({"message":"已卸下纪念名片" if cosmetic.is_empty() else "已佩戴"+cosmetic_name(s)})
	if cfg.is_empty(): return _fail("活动不存在")
	if cmd == "activityOnlineRequest":
		var result: Dictionary = _fail("真人服务尚未接入：需要账号认证、服务器共享状态与权威结算；本地演练不提交真实资产。")
		result["code"] = "NETWORK_UNAVAILABLE"
		result["contract"] = service_contract(id)
		return result
	if cfg.kind == "existing": return _fail("请从原有%s入口继续；已有记录保持有效。" % cfg.name)
	if cmd == "activityFestivalExchange": return _festival_exchange(s, id, str(args.get("offer", "")))
	if cmd == "activitySweep": return _sweep(s, id, int(args.get("target", -1)))
	if cfg.kind in ["festival", "celebration"]:
		if cmd != "activityAct": return _fail("选择庆典任务或兑换物品")
		return _festival_act(s, id, args)
	if cfg.kind == "milestones": return _fail("选择已经达成的累计奖励")
	if cmd == "activityStart": return _start(s, cfg, args, now)
	if cmd == "activitySettle": return _settle(s, cfg, args, now)
	var run: Dictionary = s.activities.runs.get(id, {})
	if run.is_empty() or str(args.get("runId", "")) != str(run.id): return _fail("本局已结束或记录不匹配，请重新打开活动")
	if not _nat(args.get("revision", -1)) or int(args.revision) != int(run.revision): return _fail("操作已过期，请按当前盘面重新选择")
	if run.status != "active": return _fail("本局已结束，请领取结算")
	var action: String = str(args.get("action", ""))
	if action == "abandon":
		_finish(run, "withdrawn", "已结束本局，永久培养不受影响。")
		run.score = 0
		run.revision += 1
		return _ok(run.duplicate(true))
	if _uses_combat(str(cfg.kind),run,args) and _other_battle_pending(s): return _fail("请先结束当前主线、秘境、万仙或渡劫战斗，再推进活动交锋；本局进度已保留")
	var result: Dictionary
	match str(cfg.kind):
		"boss", "damage", "astral", "body": result = _trial(run, cfg, args)
		"tower": result = _tower(run, args)
		"dream": result = _dream(run, args)
		"ruins": result = _ruins(run, args)
		"cards": result = _cards(run, args)
		"sigils": result = _sigils(run, args)
		"chess": result = _chess(run, args)
		"construct", "puppet": result = _construct(run, cfg, args)
		"beasts": result = _beasts(run, args)
		"defense": result = _defense(run, args)
		"plinko": result = _plinko(run, args)
		"race": result = _race(run, args)
		"match": result = _match(run, args)
		"mansion": result = _mansion(run, args)
		"puzzle": result = _puzzle(run, args)
		"escort": result = _escort(run, args)
		"reincarnation": result = _reincarnation(run, args)
		"exorcism": result = _exorcism(run, args)
		"online": result = _practice(run, cfg, args)
		_: return _fail("此活动规则尚未实现")
	if result.get("ok", false): run.revision += 1
	return result

static func _other_battle_pending(s: Dictionary) -> bool:
	var expedition: Variant = s.get("expeditions",{}).get("active")
	return s.get("mainBattle") != null or s.get("characterChallenges",{}).get("active") != null or not s.get("progression",{}).get("realm",{}).get("pending",{}).is_empty() or (expedition is Dictionary and expedition.get("status","") == "battle")

static func _uses_combat(kind: String, run: Dictionary, args: Dictionary) -> bool:
	var action: String = str(args.get("action",""))
	if kind in ["boss","damage","astral","body","tower","dream","beasts"]: return action == "fight"
	if kind in ["construct","puppet"]: return action == "fight" or (action == "explore" and args.get("choice") == "ambush")
	if kind == "sigils": return action == "resolve"
	if kind == "defense": return action == "wave"
	if kind == "mansion": return action == "room" and args.get("choice") == 2
	if kind == "exorcism": return action == "node" and args.get("choice") in [0,1,2,5]
	if kind == "reincarnation" and action == "path":
		var step: int = int(run.step)+1
		var karma: int = int(run.model.karma)+(1 if args.get("choice") == "compassion" else 0)
		return step % 2 == 0 and not (step == 6 and karma >= 3)
	return false

static func _rng(run: Dictionary, limit: int) -> int:
	var value: int = int(run.rng) & 0xffffffff
	if value == 0: value = 1
	value = (value ^ (value << 13)) & 0xffffffff
	value = (value ^ (value >> 17)) & 0xffffffff
	value = (value ^ (value << 5)) & 0xffffffff
	run.rng = value
	return value % maxi(1, limit)

static func _log(run: Dictionary, text: String) -> void:
	run.log.append(text)
	while run.log.size() > 6: run.log.pop_front()

static func _finish(run: Dictionary, outcome: String, message: String) -> void:
	run.status = "ready"
	run.outcome = outcome
	_log(run, message)

static func _pay(s: Dictionary, cost: Dictionary) -> bool:
	if not GameEconomy.can_afford(s, cost): return false
	GameEconomy.pay(s, cost)
	return true

static func _gain(s: Dictionary, reward: Dictionary) -> bool:
	var caps: Dictionary = load("res://scripts/game_economy.gd").config().resourceCaps
	for key: String in reward:
		if int(s.get("resources", {}).get(key, 0)) + int(reward[key]) > int(caps.get(key, 999999999)): return false
	for key: String in reward: s.resources[key] = int(s.resources.get(key, 0)) + int(reward[key])
	return true

static func _team_snapshot(s: Dictionary) -> Array:
	if s.has("framework"): return load("res://scripts/game_framework.gd").party(s)
	var team: Array = []
	for id: String in s.get("team", []):
		var member: Dictionary = s.get("owned", {}).get(id, {})
		if member.is_empty(): continue
		var item: Dictionary = {"id": id, "level": int(member.get("level", 1)), "treasure": int(member.get("treasure", 0)), "branch": str(member.get("branch", "A")), "branchUnlocked": id in s.get("branchUnlocks", [])}
		item.equipmentStats = load("res://scripts/game_equipment.gd").stats_for(s, id)
		var growth: Dictionary = load("res://scripts/game_progression.gd").combat_bonus(s, id)
		for key: String in growth: item.equipmentStats[key] = float(item.equipmentStats.get(key, 0)) + float(growth[key])
		team.append(item)
	return team

static func _start(s: Dictionary, cfg: Dictionary, args: Dictionary, now: int) -> Dictionary:
	var a: Dictionary = s.activities
	var id: String = str(cfg.id)
	if a.runs.has(id): return _fail("本活动已有进行中的记录，请继续或结算")
	if int(a.seq) >= 999999: return _fail("活动记录已达到存档上限")
	if args.has("seed") and not _nat(args.seed, 4294967295): return _fail("随机种子无效")
	var team: Array = _team_snapshot(s)
	if str(cfg.kind) in ["boss", "damage", "astral", "body", "tower", "dream", "sigils", "defense", "construct", "puppet", "mansion", "reincarnation", "exorcism"] and team.is_empty(): return _fail("请先上阵至少一名神仙")
	if not _pay(s, cfg.cost): return _fail("开始本局需要灵石 %d，资源不足时不会扣除" % int(cfg.cost.get("stone", 0)))
	a.seq += 1
	var seed: int = int(args.seed) if args.has("seed") else _rng(a, 4294967295)
	var run: Dictionary = {"id": "activity-%s-%d" % [id, int(a.seq)], "definitionId": id, "seq": int(a.seq), "ruleVersion": str(rules().ruleVersion), "seed": seed, "rng": maxi(1, seed), "createdAt": now, "revision": 0, "status": "active", "outcome": "", "score": 0, "hp": 100, "maxHp": 100, "turn": 0, "step": 0, "log": [], "model": {}, "team": team, "battle": {}, "practice": str(cfg.kind) in ["online", "puppet"]}
	run.petSupport = load("res://scripts/game_progression.gd").battle_support(s)
	_init_model(run, cfg)
	if str(cfg.kind) == "race":
		var mount_id: String = str(s.get("progression",{}).get("selected",{}).get("mounts",{}).get("main",""))
		var mount: Dictionary = s.get("progression",{}).get("families",{}).get("mounts",{}).get(mount_id,{})
		run.model.mountId = mount_id; run.model.mountLevel = int(mount.get("level",0)); run.model.mountStars = int(mount.get("stars",0))
		run.model.growth = clampi(int(run.model.mountLevel)/3+int(run.model.mountStars),0,2)
		run.model.speed = 1 + int(run.model.growth)
	if str(cfg.group) == "development":
		var team_levels: int = 0
		for member: Dictionary in run.team: team_levels += int(member.level)
		run.model.inherited = clampi(team_levels / maxi(1,run.team.size()) / 5,0,3)
		run.model.supply += int(run.model.inherited)
	_log(run, "本地演练：不消耗真实物品、不产生真人排名。" if run.practice else "本局已保存，关闭页面后可以继续。")
	a.runs[id] = run
	a.spent += int(GameEconomy.charged_cost(cfg.cost).get("stone", 0))
	return _ok(run.duplicate(true))

static func _init_model(r: Dictionary, cfg: Dictionary) -> void:
	var m: Dictionary = r.model
	match str(cfg.kind):
		"boss", "damage", "astral", "body": m.merge({"target": 0, "stance": 0})
		"tower": m.merge({"floor": 1, "phase": "battle", "might": 0, "ward": 0})
		"dream":
			m.merge({"level": 1, "ward": 0, "phase": "choice", "boons": []})
			for member: Dictionary in r.team: member.level = 1; member.treasure = 0; member.equipmentStats = {}; member.branchUnlocked = false
		"ruins": m.merge({"loot": 0, "risk": 10, "depth": 0, "exitAt": 2})
		"cards": m.merge({"deck": [{"id": 0, "name": "青锋符", "hp": 28, "atk": 6}, {"id": 1, "name": "玄甲符", "hp": 38, "atk": 3}, {"id": 2, "name": "赤焰符", "hp": 22, "atk": 8}], "selected": 0, "budget": 10 + _rng(r, 6), "allocate": 6, "enemyHp": 24, "enemyMax": 24, "phase": "play"})
		"sigils": m.merge({"board": [-1,-1,-1,-1,-1,-1,-1,-1,-1], "next": _rng(r, 3), "placed": 0, "phase": "place", "boon": "force"})
		"chess": m.merge({"player": 12, "enemies": [0, 4, 20, 24], "lastEaten": -1})
		"construct", "puppet": m.merge({"parts": 6, "weapon": 0, "armor": 0, "talent": "", "explored": 0})
		"beasts": m.merge({"selected": 0, "team": [0, 1], "beasts": [{"id": 0, "name": "青鸾", "level": 1, "skill": "heal", "locked": true}, {"id": 1, "name": "玄龟", "level": 1, "skill": "guard", "locked": true}, {"id": 2, "name": "白虎", "level": 1, "skill": "strike", "locked": false}, {"id": 3, "name": "赤狐", "level": 1, "skill": "strike", "locked": false}]})
		"defense": m.merge({"coins": 8, "bench": [], "board": [0,0,0,0,0,0], "selected": -1, "enemyHp": 100, "incoming": [10, 12, 10]})
		"plinko": m.merge({"balls": 5, "path": [], "landing": -1})
		"race": m.merge({"lane": 1, "speed": 1, "distance": 0, "obstacle": _rng(r, 3), "wind": _rng(r, 3), "trail": [],"mountId":"","mountLevel":0,"mountStars":0,"growth":0})
		"match":
			m.board = []
			for i: int in 25: m.board.append(_rng(r, 5))
			m.board[1] = m.board[0]
			m.merge({"moves": 8, "collected": 0, "lastGroup": []})
		"mansion": m.merge({"rooms": [], "keys": 0, "clues": 0, "door": false, "phase": "map", "answer": _rng(r, 3)})
		"puzzle":
			m.merge({"board": [0,0,0,0,0,0,0,0,0], "counts": [0,0,0,0,0,0,0,0,0], "hint": -1})
			for i: int in 4: _rotate_puzzle(m, _rng(r, 9))
		"escort": m.merge({"swords": [1,1,1], "energy": 3, "incoming": [12, 16, 12], "focus": 1, "charged": false})
		"reincarnation": m.merge({"karma": 0, "fire": 0, "path": [], "level": 1})
		"exorcism": m.merge({"visited": [], "sigils": 0, "curse": 0, "ward": 0})
		"online": m.merge({"phase": "prepare", "supply": 8, "points": 0, "owned": [0], "map": [0,1,2,3,4,5,6,7,8], "clues": [], "party": [], "round": 0, "ledger": {}, "inventory": 3, "escrow": 0, "balance": 100, "bid": 0, "deadline": 3, "locked": false, "requests": [], "receipts": [], "cooldown": 0,"seriesWins":0,"seriesLosses":0,"missions":[],"glory":[],"inherited":0})

static func _reward(run: Dictionary) -> Dictionary:
	if bool(run.practice) or run.outcome in ["fail", "withdrawn"]: return {}
	var tier: int = clampi(1 + int(run.score) / 20, 1, 5)
	var reward: Dictionary = {}
	for key: String in rules().reward: reward[key] = int(rules().reward[key]) * tier
	if str(run.definitionId) == "050":
		for chest: Dictionary in rules().damageChests:
			if int(run.battle.get("damage", 0)) >= int(chest.damage):
				for key: String in chest.reward: reward[key] = int(reward.get(key, 0)) + int(chest.reward[key])
	return reward

static func _special_reward(run: Dictionary) -> Dictionary:
	if bool(run.practice) or run.outcome != "success": return {}
	var reward: Dictionary = rules().specialRewards.get(str(run.definitionId), {}).duplicate(true)
	var tier: int = clampi(1 + int(run.score) / 20, 1, 5)
	for key: String in reward: reward[key] = int(reward[key]) * tier
	return reward

static func _gain_materials(s: Dictionary, reward: Dictionary) -> bool:
	if reward.is_empty(): return true
	var progression: GDScript = load("res://scripts/game_progression.gd")
	progression.ensure_state(s)
	var caps: int = int(progression.rules().materialCap)
	for key: String in reward:
		if not progression.rules().materials.has(key) or int(s.progression.materials.get(key, 0)) + int(reward[key]) > caps: return false
	for key: String in reward: s.progression.materials[key] = int(s.progression.materials.get(key, 0)) + int(reward[key])
	return true

static func _settle(s: Dictionary, cfg: Dictionary, args: Dictionary, now: int) -> Dictionary:
	var id: String = str(cfg.id)
	var run_id: String = str(args.get("runId", ""))
	var run: Dictionary = s.activities.runs.get(id, {})
	if run.is_empty():
		var prefix: String = "activity-%s-" % id
		if run_id.begins_with(prefix) and run_id.trim_prefix(prefix).is_valid_int() and int(run_id.trim_prefix(prefix)) > 0 and int(run_id.trim_prefix(prefix)) <= int(s.activities.settled.get(id, 0)):
			return _ok({"duplicate": true, "reward": {}})
		return _fail("没有可结算的本局记录")
	if run_id != str(run.id): return _fail("结算记录不匹配")
	if run.status != "ready": return _fail("活动尚未结束；关闭页面即可保留进度")
	var reward: Dictionary = _reward(run)
	if not _gain(s, reward): return _fail("资源将超出上限；本局结果已保留，请消耗后再领取")
	var special: Dictionary = _special_reward(run)
	if not _gain_materials(s, special): return _fail("培养材料将超出上限；本局结果已保留，请消耗后再领取")
	var rec: Dictionary = s.activities.records.get(id, {"runs": 0, "wins": 0, "best": 0, "targets": []})
	rec.runs += 1
	if run.outcome == "success":
		rec.wins += 1
		if not run.practice: s.activities.completed += 1
		if cfg.kind == "boss" and int(run.model.target) not in rec.targets: rec.targets.append(int(run.model.target))
	rec.best = maxi(int(rec.best), int(run.score))
	if cfg.id == "064" and not run.model.glory.is_empty(): rec.practiceBadges = run.model.glory.duplicate()
	s.activities.records[id] = rec
	s.activities.settled[id] = int(run.seq)
	var receipt: Dictionary = {"id": run_id, "activity": id, "outcome": run.outcome, "score": int(run.score), "reward": reward, "materials": special, "practice": run.practice, "settledAt": now}
	s.activities.history.append(receipt)
	while s.activities.history.size() > 20: s.activities.history.pop_front()
	s.activities.runs.erase(id)
	return _ok(receipt)

static func _sweep(s: Dictionary, id: String, target: int) -> Dictionary:
	if id != "048" or target not in s.activities.records.get(id, {}).get("targets", []): return _fail("需先实际击败对应妖王并领取结算，才可扫荡")
	if s.activities.runs.has(id): return _fail("请先完成当前妖王挑战")
	if not _pay(s, {"stone": 12}): return _fail("扫荡需要灵石12")
	var reward: Dictionary = {"xp": 18 + target * 6, "material": 6 + target * 2}
	if not _gain(s, reward): return _fail("资源将超出上限")
	s.activities.spent += int(GameEconomy.charged_cost({"stone":12}).stone)
	return _ok({"reward": reward, "target": target})

static func _battle(r: Dictionary, profile: String, difficulty: int = 1, temporary: bool = false, window: int = 0) -> Dictionary:
	var combat: GDScript = load("res://scripts/game_combat.gd")
	var hp: int = 110 + difficulty * 36
	var atk: int = 20 + difficulty * 5
	var role: String = {"shield": "shield", "heal": "healer", "burn": "burner", "charge": "charger"}.get(profile, "soldier")
	var enemies: Array = [{"id": "activity-foe", "name": "镇境守卫", "role": role, "row": "front", "hp": hp, "atk": atk, "def": 6 + difficulty * 2, "speed": 58, "shield": hp / 3 if profile == "shield" else 0, "will": 0}]
	if profile in ["heal", "swarm"]: enemies.append({"id": "activity-guard", "name": "护阵妖灵", "role": "soldier", "row": "front", "hp": hp, "atk": atk, "def": 8, "speed": 60, "shield": 0, "will": 0})
	if window > 0: enemies[0].hp = 10000000; enemies[0].atk = 12; enemies[0].name = "凶兽法相"
	var team: Array = r.team.duplicate(true)
	if temporary:
		for member: Dictionary in team:
			member.level = clampi(int(r.model.get("level", 1)) + int(r.model.get("weapon", 0)), 1, 20)
			member.treasure = 0
			member.equipmentStats = {}
	var options: Dictionary = {"battleId": "%s:%d" % [r.id, int(r.revision)], "seed": _rng(r, 4294967295), "enemies": enemies, "autoOnly": true, "petSupport": {} if temporary else r.get("petSupport", {}).duplicate(true), "contextName": definition(str(r.definitionId)).name}
	var battle: Dictionary = combat.create(1, team, options)
	if battle.has("error"): return {"won": false, "damage": 0, "remaining": 0, "error": str(battle.error)}
	if temporary:
		for unit: Dictionary in battle.units:
			if unit.side == "ally":
				unit.hp = maxf(1, float(unit.maxHp) * float(r.hp) / 100.0)
				unit.def += int(r.model.get("ward", 0)) * 8 + int(r.model.get("armor", 0)) * 10
	if str(r.definitionId) == "049":
		for unit: Dictionary in battle.units:
			if unit.side == "ally":
				unit.atk *= 1.0 + 0.08 * int(r.model.might)
				unit.def += 8 * int(r.model.ward)
	if str(r.definitionId) == "071":
		for unit: Dictionary in battle.units:
			if unit.side == "ally":
				unit.atk *= 1.0 + float(r.model.get("force", 0)) / 150.0
				unit.def += int(r.model.get("guard", 0)) / 2
	var count: int = 0
	var limit: int = window if window > 0 else 500
	while battle.result == null and count < limit:
		if not combat.auto_act(battle): break
		count += 1
	var damage: int = 0
	for stat: Dictionary in battle.stats.values():
		if stat.get("side") == "ally": damage += int(stat.get("damage", 0))
	var total_hp: float = 0
	var max_hp: float = 0
	for unit: Dictionary in battle.units:
		if unit.side == "ally":
			total_hp += float(unit.hp)
			max_hp += float(unit.maxHp)
	var result: Dictionary = {"won": battle.result == "win", "damage": damage, "remaining": int(100 * total_hp / maxf(1, max_hp)), "actions": count, "rounds": int(battle.round), "log": battle.log.slice(maxi(0, battle.log.size() - 5)), "units": [], "triggers": battle.get("triggerCounts", {}).duplicate(true)}
	for unit: Dictionary in battle.units: result.units.append({"name": unit.name, "side": unit.side, "hp": int(unit.hp), "maxHp": int(unit.maxHp)})
	r.battle = result
	_log(r, "%s · %d次行动，造成%d伤害" % ["取胜" if result.won else "窗口结束" if window > 0 else "败退", count, damage])
	return result

static func _trial(r: Dictionary, cfg: Dictionary, a: Dictionary) -> Dictionary:
	var action: String = str(a.get("action", ""))
	if action == "target":
		var target: int = int(a.get("choice", -1))
		if target < 0 or target >= (5 if cfg.kind == "astral" else 3): return _fail("请选择有效挑战")
		r.model.target = target
		return _ok(target)
	if action != "fight": return _fail("先选择目标，再自动挑战")
	var profiles: Array = ["shield", "heal", "swarm", "burn", "charge"]
	var target: int = int(r.model.target)
	var b: Dictionary = _battle(r, profiles[target], 1 + target, false, 50 if cfg.kind == "damage" else 0)
	if cfg.kind == "damage":
		r.score = int(b.damage) / 25
		var chests: int = 0
		for chest: Dictionary in rules().damageChests:
			if int(b.damage) >= int(chest.damage): chests += 1
		_finish(r, "success", "个人伤害 %d，达成%d/3伤害宝箱；不进入真人排行。" % [int(b.damage), chests])
	else:
		r.score = 20 + target * 12 if b.won else 0
		_finish(r, "success" if b.won else "fail", "挑战完成，可领取本局成果。" if b.won else "挑战失败；调整阵容后可再次出发。")
	return _ok(b)

static func _tower(r: Dictionary, a: Dictionary) -> Dictionary:
	var m: Dictionary = r.model
	var action: String = str(a.get("action", ""))
	if action == "leave":
		if int(r.step) < 5 or m.phase != "choice": return _fail("至少击败五层守卫后，才可从层间阵门离塔")
		_finish(r, "success", "已携带第%d层的镇妖成果离塔。" % int(r.step))
		return _ok()
	if m.phase == "choice":
		var choice: String = str(a.get("choice", ""))
		if action != "boon" or choice not in ["might", "ward"]: return _fail("先选择本局的塔内加成")
		m[choice] += 1
		m.floor += 1; m.phase = "battle"
		_log(r, "塔内攻击提高8%。" if choice == "might" else "塔内防御提高8。")
		return _ok()
	if action != "fight": return _fail("选择自动挑战当前楼层")
	var battle: Dictionary = _battle(r, ["swarm", "shield", "heal", "burn", "charge"][(int(m.floor) - 1) % 5], int(m.floor))
	if not battle.won: _finish(r, "fail", "在第%d层败退，本局塔内加成结束。" % int(m.floor))
	else:
		r.step = int(m.floor); r.score = int(r.step) * 10
		if int(r.step) >= 20: _finish(r, "success", "二十层镇妖塔已贯通。")
		else: m.phase = "choice"; _log(r, "第%d层已过，选择塔内成长或在五层后离塔。" % int(r.step))
	return _ok(battle)

static func _dream(r: Dictionary, a: Dictionary) -> Dictionary:
	var m: Dictionary = r.model
	var action: String = str(a.get("action", ""))
	if m.phase == "choice":
		if action != "boon" or str(a.get("choice", "")) not in ["blade", "ward", "renew"]: return _fail("请选择一项梦境成长")
		var choice: String = str(a.choice)
		m.boons.append(choice)
		if choice == "blade": m.level += 2
		elif choice == "ward": m.ward += 1; r.hp = mini(100, int(r.hp) + 12)
		else: r.hp = mini(100, int(r.hp) + 40); m.level += 1
		m.phase = "battle"
		_log(r, {"blade": "本局临时等级 +2", "ward": "本局护体 +1，恢复12%生命", "renew": "恢复40%生命，临时等级 +1"}[choice])
		return _ok()
	if action != "fight": return _fail("成长已选定，请自动挑战")
	var result: Dictionary = _battle(r, ["swarm", "shield", "burn", "heal", "charge"][int(r.step)], int(r.step) + 1, true)
	r.hp = int(result.remaining)
	if not result.won: _finish(r, "fail", "梦境结束；永久角色与仙府没有变化。")
	else:
		r.score += 16
		r.step += 1
		if r.step >= 5: _finish(r, "success", "五重梦境已破，临时成长随结算结束。")
		else: m.phase = "choice"
	return _ok(result)

static func _ruins(r: Dictionary, a: Dictionary) -> Dictionary:
	var m: Dictionary = r.model
	var action: String = str(a.get("action", ""))
	if action == "exit":
		if int(m.depth) < int(m.exitAt): return _fail("先探索两层，才会显现撤离阵")
		r.score = int(m.loot)
		_finish(r, "success", "已携带 %d 点遗宝安全撤离。" % int(m.loot))
		return _ok()
	if action not in ["safe", "risk"]: return _fail("请选择探路、冒险或撤离")
	var danger: int = int(m.risk) + (18 if action == "risk" else -5)
	var roll: int = _rng(r, 100)
	m.depth += 1
	m.risk = mini(85, int(m.risk) + (16 if action == "risk" else 7))
	var loot: int = 8 + _rng(r, 8) + (15 if action == "risk" else 0)
	m.loot += loot
	if roll < danger:
		var damage: int = 18 + _rng(r, 20) + (12 if action == "risk" else 0)
		r.hp = maxi(0, int(r.hp) - damage)
		_log(r, "第%d层：获得遗宝%d，遭遇暗流，生命 -%d。" % [int(m.depth), loot, damage])
	else: _log(r, "第%d层：获得遗宝%d，暂时安全。" % [int(m.depth), loot])
	r.step = int(m.depth)
	if r.hp <= 0: m.loot = 0; _finish(r, "fail", "失去本局未带回的遗宝；永久资产不受影响。")
	elif m.depth >= 8: r.score = int(m.loot); _finish(r, "success", "已到达终点，携带遗宝返回。")
	return _ok({"danger": danger, "roll": roll})

static func _cards(r: Dictionary, a: Dictionary) -> Dictionary:
	var m: Dictionary = r.model
	var action: String = str(a.get("action", ""))
	var choice: int = int(a.get("choice", -1))
	if m.phase == "growth":
		if action != "growth" or choice not in [0,1,2]: return _fail("选择临时卡组的下一次成长")
		if choice == 0 and m.deck.size() < 4: m.deck.append({"id": 3, "name": "长生符", "hp": 30, "atk": 5})
		elif choice == 1:
			for card: Dictionary in m.deck: card.hp += 12
		else:
			for card: Dictionary in m.deck: card.atk += 2
		m.phase = "play"
		m.enemyMax = 24 + int(r.step) * 14
		m.enemyHp = m.enemyMax
		m.budget = 10 + _rng(r, 7)
		m.allocate = mini(int(m.allocate), int(m.budget))
		return _ok()
	if action == "select":
		if choice < 0 or choice >= m.deck.size() or m.deck[choice].hp <= 0: return _fail("这张神符无法出战")
		m.selected = choice
		return _ok()
	if action == "allocate":
		if choice < 0 or choice > int(m.budget): return _fail("分配不能超过本轮灵力")
		m.allocate = choice
		return _ok()
	if action != "resolve" or choice < 0 or choice >= m.deck.size() or m.deck[choice].hp <= 0: return _fail("请选择承伤神符")
	if m.deck[int(m.selected)].hp <= 0: return _fail("请更换已经破碎的出战神符")
	var attack: int = int(m.deck[int(m.selected)].atk) + int(m.allocate)
	m.enemyHp = maxi(0, int(m.enemyHp) - attack)
	var damage: int = maxi(1, 13 + int(r.step) * 3 + _rng(r, 5) - (int(m.budget) - int(m.allocate)))
	if m.enemyHp > 0: m.deck[choice].hp = maxi(0, int(m.deck[choice].hp) - damage)
	r.turn += 1
	_log(r, "出符伤害%d，护持%d，%s承伤%d。" % [attack, int(m.budget) - int(m.allocate), m.deck[choice].name, damage if m.enemyHp > 0 else 0])
	var living: Array = []
	for index: int in m.deck.size():
		if m.deck[index].hp > 0: living.append(index)
	if living.is_empty(): _finish(r, "fail", "临时神符全部破碎。")
	elif m.enemyHp <= 0:
		r.step += 1; r.score += 20
		if r.step >= 4: _finish(r, "success", "四重符阵挑战完成。")
		else: m.phase = "growth"
	else: m.budget = 10 + _rng(r, 7); m.allocate = mini(int(m.allocate), int(m.budget))
	if not living.is_empty() and m.deck[int(m.selected)].hp <= 0: m.selected = living[0]
	return _ok()

static func _sigil_lines(board: Array) -> Dictionary:
	var same: int = 0
	var cycle: int = 0
	for line: Array in [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]:
		var values: Array = [int(board[line[0]]), int(board[line[1]]), int(board[line[2]])]
		if -1 in values: continue
		if values[0] == values[1] and values[1] == values[2]: same += 1
		elif values[0] != values[1] and values[1] != values[2] and values[0] != values[2]: cycle += 1
	return {"same": same, "cycle": cycle}

static func _sigils(r: Dictionary, a: Dictionary) -> Dictionary:
	var m: Dictionary = r.model
	var action: String = str(a.get("action", ""))
	if m.phase == "choice":
		if action != "boon" or str(a.get("choice", "")) not in ["force", "guard"]: return _fail("选择下一层阵法方向")
		m.boon = str(a.choice); m.phase = "place"
		return _ok()
	if action == "place":
		var index: int = int(a.get("choice", -1))
		if index < 0 or index >= 9 or int(m.board[index]) != -1 or m.placed >= 9: return _fail("该阵位无法落符")
		m.board[index] = int(m.next); m.placed += 1; m.next = _rng(r, 3)
		return _ok()
	if action != "resolve" or m.placed < 6: return _fail("至少布置六枚阵纹后才能镇魔")
	var lines: Dictionary = _sigil_lines(m.board)
	var force: int = int(m.placed) * 4 + int(lines.same) * 14 + int(lines.cycle) * 8 + (10 if m.boon == "force" else 0)
	var defense: int = int(lines.cycle) * 5 + (18 if m.boon == "guard" else 0)
	m.force = force; m.guard = defense
	var battle: Dictionary = _battle(r, ["swarm", "burn", "charge"][int(r.step)], int(r.step)+1, true)
	r.hp = int(battle.remaining); r.score += force / 3; r.step += 1
	_log(r, "同纹%d条，相生%d条，攻击加成%d%%，防御+%d；实战生命余%d%%。" % [lines.same, lines.cycle, int(force / 1.5), defense / 2, r.hp])
	if not battle.won: _finish(r, "fail", "阵法失守，本局结束。")
	elif r.step >= 3: _finish(r, "success", "三层镇魔阵全部守住。")
	else: m.board = [-1,-1,-1,-1,-1,-1,-1,-1,-1]; m.placed = 0; m.phase = "choice"
	return _ok({"lines": lines, "force": force, "battle": battle})

static func _adjacent(a: int, b: int, width: int) -> bool:
	return absi(a % width - b % width) + absi(a / width - b / width) == 1

static func _chess(r: Dictionary, a: Dictionary) -> Dictionary:
	var m: Dictionary = r.model
	var target: int = int(a.get("choice", -1))
	if str(a.get("action", "")) != "move" or target < 0 or target >= 25 or not _adjacent(int(m.player), target, 5): return _fail("每次只能上下左右移动一格")
	m.lastEaten = -1
	if target in m.enemies: m.enemies.erase(target); m.lastEaten = target; r.score += 12
	m.player = target
	var moved: Array = []
	for enemy: Variant in m.enemies:
		var from: int = int(enemy)
		var dx: int = signi(target % 5 - from % 5)
		var dy: int = signi(target / 5 - from / 5)
		var to: int = from + (dx if (int(r.turn) % 2 == 0 and dx != 0) or dy == 0 else dy * 5)
		if to == target: r.hp = maxi(0, int(r.hp) - 22); to = from
		if to in moved or (to in m.enemies and to != from): to = from
		moved.append(to)
	m.enemies = moved
	r.turn += 1
	r.step = int(r.turn)
	_log(r, "第%d回合：%s；敌军已推进。" % [int(r.turn), "吃子成功" if m.lastEaten >= 0 else "移至安全位置"])
	if r.hp <= 0: _finish(r, "fail", "棋阵被围，重新选择路线可再挑战。")
	elif r.turn >= 8 or m.enemies.is_empty(): r.score += int(r.hp) / 2; _finish(r, "success", "生存目标达成。")
	return _ok()

static func _construct(r: Dictionary, cfg: Dictionary, a: Dictionary) -> Dictionary:
	var m: Dictionary = r.model
	var action: String = str(a.get("action", ""))
	var choice: String = str(a.get("choice", ""))
	if action == "craft":
		if choice not in ["weapon", "armor"] or int(m.get(choice, 0)) >= 4: return _fail("该部位已达本局制作上限")
		var cost: int = 3 if choice == "weapon" else 2
		if m.parts < cost: return _fail("本局零件不足，先探索取得零件")
		m.parts -= cost; m[choice] += 1
		_log(r, "%s提升至%d级，零件 -%d。" % ["武器" if choice == "weapon" else "护甲", int(m[choice]), cost])
		return _ok()
	if action == "talent":
		if choice not in ["blade", "ward", "renew"] or m.talent != "": return _fail("本局天赋只可选择一次")
		m.talent = choice
		if choice == "blade": m.weapon += 1
		elif choice == "ward": m.armor += 1
		else: r.hp = 100; m.parts += 2
		return _ok()
	if action == "explore":
		if m.explored >= 3: return _fail("探索节点已完成，请挑战目标")
		if choice not in ["salvage", "ambush"]: return _fail("选择采集或清除守卫")
		if choice == "salvage": m.parts += 3; r.hp = maxi(1, int(r.hp) - 8)
		else:
			var fight: Dictionary = _battle(r, "swarm", 1 + int(m.explored), true)
			r.hp = int(fight.remaining)
			if not fight.won: _finish(r, "fail", "临时道兵探索失败。")
			else: m.parts += 5; r.score += 8
		m.explored += 1; r.step = int(m.explored)
		_log(r, "第%d处遗迹已探索，当前零件%d。" % [int(m.explored), int(m.parts)])
		return _ok()
	if action != "fight" or m.explored < 3 or m.talent == "": return _fail("先完成三处探索并选择天赋")
	var battle: Dictionary = _battle(r, "shield" if cfg.kind == "construct" else "charge", 3, true)
	r.score += 40 if battle.won else 0
	_finish(r, "success" if battle.won else "fail", "本地傀儡演练结束；不计入真人排名。" if cfg.kind == "puppet" else "道兵守关挑战结束。")
	return _ok(battle)

static func _beast(m: Dictionary, id: int) -> Dictionary:
	for beast: Dictionary in m.beasts:
		if int(beast.id) == id: return beast
	return {}

static func inheritance_preview(s: Dictionary, target: int, donor: int) -> Dictionary:
	var run: Dictionary = s.get("activities", {}).get("runs", {}).get("075", {})
	if run.is_empty(): return {"ok": false, "reason": "没有灵兽对战记录"}
	var primary: Dictionary = _beast(run.model, target)
	var secondary: Dictionary = _beast(run.model, donor)
	if primary.is_empty() or secondary.is_empty() or target == donor: return {"ok": false, "reason": "请选择两只不同兽魂"}
	if secondary.locked or donor in run.model.team: return {"ok": false, "reason": "副兽已锁定或正在出战，请先调整"}
	return {"ok": true, "target": target, "donor": donor, "targetName": primary.name, "donorName": secondary.name, "newLevel": mini(6, int(primary.level) + int(secondary.level)), "inheritedSkill": secondary.skill, "consumes": "仅消耗本局副兽魂；永久灵兽收藏不变"}

static func _beasts(r: Dictionary, a: Dictionary) -> Dictionary:
	var m: Dictionary = r.model
	var action: String = str(a.get("action", ""))
	var choice: int = int(a.get("choice", -1))
	var selected: Dictionary = _beast(m, choice)
	if action in ["select", "lock", "team"]:
		if selected.is_empty(): return _fail("兽魂不存在")
		if action == "select": m.selected = choice
		elif action == "lock": selected.locked = not bool(selected.locked)
		elif choice in m.team: m.team.erase(choice)
		elif m.team.size() >= 2: return _fail("独立兽魂队伍最多两只")
		else: m.team.append(choice)
		return _ok()
	if action == "inherit":
		var donor: Dictionary = _beast(m, int(a.get("target", -1)))
		if selected.is_empty() or donor.is_empty() or donor.id == selected.id: return _fail("请选择两只不同兽魂")
		if donor.locked or donor.id in m.team: return _fail("副兽已锁定或正在出战，不会被消耗")
		if not bool(a.get("confirmed", false)): return _fail("请先查看主副传承预览并确认消耗")
		selected.level = mini(6, int(selected.level) + int(donor.level))
		selected.skill = donor.skill if bool(a.get("inheritSkill", true)) else selected.skill
		m.beasts.erase(donor)
		m.selected = int(selected.id)
		_log(r, "%s完成传承，仅消耗了本局副兽魂。" % selected.name)
		return _ok()
	if action != "fight" or m.team.is_empty(): return _fail("请先编入至少一只兽魂")
	var allies: Array = []
	for id: Variant in m.team:
		var beast: Dictionary = _beast(m, int(id))
		allies.append({"name": beast.name, "hp": 32 + int(beast.level) * 18, "maxHp": 32 + int(beast.level) * 18, "atk": 7 + int(beast.level) * 4, "skill": beast.skill})
	var enemy_hp: int = 45 + int(r.step) * 28
	var turns: int = 0
	while enemy_hp > 0 and turns < 30:
		var living: Array = allies.filter(func(x: Dictionary) -> bool: return int(x.hp) > 0)
		if living.is_empty(): break
		for beast: Dictionary in living:
			enemy_hp -= int(beast.atk) + (7 if beast.skill == "strike" and turns % 3 == 0 else 0)
			if beast.skill == "heal" and turns % 3 == 0:
				for other: Dictionary in living: other.hp = mini(int(other.maxHp), int(other.hp) + 8)
		if enemy_hp > 0:
			var victim: Dictionary = living[turns % living.size()]
			victim.hp = maxi(0, int(victim.hp) - maxi(1, 12 + int(r.step) * 3 - (7 if victim.skill == "guard" else 0)))
		turns += 1
	r.battle = {"units": allies, "rounds": turns, "won": enemy_hp <= 0}
	if enemy_hp > 0: _finish(r, "fail", "兽魂队伍挑战失败；永久灵兽不受影响。")
	else:
		r.step += 1; r.score += 24
		_log(r, "第%d关胜出，经过%d回合。" % [int(r.step), turns])
		if r.step >= 3: _finish(r, "success", "灵兽独立队伍三关完成。")
	return _ok(r.battle)

static func _defense(r: Dictionary, a: Dictionary) -> Dictionary:
	var m: Dictionary = r.model
	var action: String = str(a.get("action", ""))
	var choice: int = int(a.get("choice", -1))
	if action == "recruit":
		if (not GameEconomy.free_currency() and m.coins < 2) or m.bench.size() >= 6: return _fail("招募需要2枚本局铜钱，待命区最多六人")
		if not GameEconomy.free_currency(): m.coins -= 2
		m.bench.append(1)
		return _ok()
	if action == "select":
		if choice < 0 or choice >= m.bench.size(): return _fail("请先招募单位")
		m.selected = choice
		return _ok()
	if action == "merge":
		var other: int = int(a.get("target", -1))
		if choice < 0 or other < 0 or choice >= m.bench.size() or other >= m.bench.size() or choice == other or int(m.bench[choice]) != int(m.bench[other]) or int(m.bench[choice]) >= 3: return _fail("选择两名同阶待命单位合成，最高三阶")
		var level: int = int(m.bench[choice]) + 1
		m.bench.remove_at(maxi(choice, other)); m.bench.remove_at(mini(choice, other)); m.bench.append(level); m.selected = m.bench.size() - 1
		return _ok()
	if action == "place":
		var from: int = int(m.selected)
		if choice < 0 or choice >= 6 or from < 0 or from >= m.bench.size() or int(m.board[choice]) != 0: return _fail("先选择待命单位，再选择空阵位")
		m.board[choice] = int(m.bench[from]); m.bench.remove_at(from); m.selected = -1
		return _ok()
	if action == "recall":
		if choice < 0 or choice >= 6 or int(m.board[choice]) == 0 or m.bench.size() >= 6: return _fail("该单位无法召回")
		m.bench.append(int(m.board[choice])); m.board[choice] = 0
		return _ok()
	if action != "wave": return _fail("选择招募、合成、布置或迎敌")
	var occupied: bool = false
	for unit: Variant in m.board: occupied = occupied or int(unit) > 0
	if not occupied: return _fail("至少布置一名单位再迎敌")
	var incoming: int = 0
	var pressure: int = 0
	var lanes: Array = []
	for lane: int in 3:
		var attack: int = int(m.board[lane]) * 12 + int(m.board[lane + 3]) * 18
		var fight: Dictionary = _defense_skirmish(r, lane)
		lanes.append(fight)
		var defeated: int = int(m.incoming[lane]) if fight.won else mini(int(m.incoming[lane]), int(fight.damage) / 35)
		incoming += maxi(0, int(m.incoming[lane]) - defeated)
		if fight.won: pressure += maxi(0, attack - int(m.incoming[lane]))
	r.battle = {"lanes": lanes, "won": incoming == 0, "actions": 0, "damage": 0}
	for lane: Dictionary in lanes:
		r.battle.actions += int(lane.get("actions", 0)); r.battle.damage += int(lane.get("damage", 0))
	r.hp = maxi(0, int(r.hp) - incoming)
	m.enemyHp = maxi(0, int(m.enemyHp) - pressure)
	r.step += 1; m.coins += 4
	_log(r, "第%d波：仙府承伤%d，敌方阵眼 -%d，本局铜钱 +4。" % [int(r.step), incoming, pressure])
	if r.hp <= 0: _finish(r, "fail", "仙府失守；本局临时单位退场。")
	elif m.enemyHp <= 0: r.score = int(r.hp); _finish(r, "success", "已攻破敌方阵眼，守护成功。")
	elif r.step >= 6:
		r.score = int(r.hp) / 2
		_finish(r, "success", "六波防守完成，按仙府耐久结算。")
	else:
		for lane: int in 3: m.incoming[lane] = 12 + int(r.step) * 5 + _rng(r, 8)
	return _ok()

## Each occupied lane invokes the existing heroes' basic/unique skill automatic combat.
## Copies are temporary projections; neither permanent levels nor equipment are edited.
static func _defense_skirmish(r: Dictionary, lane: int) -> Dictionary:
	var members: Array = []
	for slot: int in [lane, lane + 3]:
		var rank: int = int(r.model.board[slot])
		if rank <= 0: continue
		var member: Dictionary = r.team[slot % r.team.size()].duplicate(true)
		member.level = 1 + rank * 3
		member.treasure = 0; member.equipmentStats = {}; member.branchUnlocked = false
		var existing: Dictionary = {}
		for ally: Dictionary in members:
			if ally.id == member.id: existing = ally
		if existing.is_empty(): members.append(member)
		else: existing.level = maxi(int(existing.level), int(member.level)) + rank
	if members.is_empty(): return {"won": false, "damage": 0, "actions": 0, "units": []}
	var arena: Dictionary = r.duplicate(true)
	arena.team = members; arena.petSupport = {}
	var result: Dictionary = _battle(arena, ["swarm", "shield", "charge"][lane], maxi(1, int(r.step)))
	r.rng = arena.rng
	result.lane = lane
	return result

static func _plinko(r: Dictionary, a: Dictionary) -> Dictionary:
	var lane: int = int(a.get("choice", -1))
	if str(a.get("action", "")) != "drop" or lane < 0 or lane >= 5 or r.model.balls <= 0: return _fail("选择五个入口之一投珠")
	var path: Array = [lane]
	for row: int in 6:
		lane = clampi(lane + (-1 if _rng(r, 2) == 0 else 1), 0, 4)
		path.append(lane)
	r.model.path = path; r.model.landing = lane; r.model.balls -= 1
	var points: int = [18, 8, 5, 8, 18][lane]
	r.score += points; r.turn += 1
	_log(r, "灵珠经过六层阵钉，落入第%d槽，积分 +%d。" % [lane + 1, points])
	if r.model.balls == 0: _finish(r, "success", "五枚灵珠已全部落定。")
	return _ok({"path": path, "landing": lane, "points": points})

static func _race(r: Dictionary, a: Dictionary) -> Dictionary:
	var m: Dictionary = r.model
	var lane: int = int(a.get("choice", -1))
	if str(a.get("action", "")) != "drive" or lane < 0 or lane >= 3 or absi(lane - int(m.lane)) > 1: return _fail("每步可留在原道或移向相邻赛道")
	m.lane = lane
	var hit: bool = lane == int(m.obstacle)
	if hit: r.hp = maxi(0, int(r.hp) - (28-4*int(m.growth))); m.speed = 1 + int(m.growth)
	elif lane == int(m.wind): m.speed = mini(3+int(m.growth), int(m.speed) + 1)
	m.distance += int(m.speed); r.turn += 1
	m.trail.append({"lane": lane, "hit": hit, "speed": int(m.speed)})
	while m.trail.size() > 5: m.trail.pop_front()
	_log(r, "第%d段：%s，速度%d，里程%d。" % [int(r.turn), "碰到障碍" if hit else "乘风加速" if lane == int(m.wind) else "平稳前进", int(m.speed), int(m.distance)])
	if r.hp <= 0: _finish(r, "fail", "座驾耐久耗尽，本局结束。")
	elif r.turn >= 12: r.score = int(m.distance) * 2 + int(r.hp) / 4; _finish(r, "success", "短程竞速完成；这是个人赛，不是真人实时竞赛。")
	else: m.obstacle = _rng(r, 3); m.wind = (int(m.obstacle) + 1 + _rng(r, 2)) % 3
	return _ok()

static func match_group(board: Array, cell: int) -> Array:
	if cell < 0 or cell >= 25: return []
	var result: Array = [cell]
	var queue: Array = [cell]
	while not queue.is_empty():
		var current: int = int(queue.pop_front())
		for target: int in [current - 5, current + 5, current - 1, current + 1]:
			if target >= 0 and target < 25 and _adjacent(current, target, 5) and target not in result and int(board[target]) == int(board[cell]): result.append(target); queue.append(target)
	return result

static func _match(r: Dictionary, a: Dictionary) -> Dictionary:
	var m: Dictionary = r.model
	if str(a.get("action", "")) != "collect": return _fail("选择两枚以上相邻同色灵珠")
	var group: Array = match_group(m.board, int(a.get("choice", -1)))
	if group.size() < 2: return _fail("至少两枚同色灵珠相邻才能采集，不消耗步数")
	m.lastGroup = group; m.collected += group.size(); m.moves -= 1
	r.score += group.size() * group.size()
	for column: int in 5:
		var values: Array = []
		for row: int in range(4, -1, -1):
			var index: int = row * 5 + column
			if index not in group: values.append(m.board[index])
		while values.size() < 5: values.append(_rng(r, 5))
		for row: int in 5: m.board[(4 - row) * 5 + column] = values[row]
	var has_move: bool = false
	for cell: int in 25:
		if match_group(m.board, cell).size() >= 2: has_move = true; break
	if not has_move: m.board[1] = m.board[0]; _log(r, "盘面无可采集组合，已自动重整一组灵珠。")
	r.turn += 1
	_log(r, "采集%d枚，累计%d / 25，剩余%d步。" % [group.size(), int(m.collected), int(m.moves)])
	if m.collected >= 25: _finish(r, "success", "五行采集目标完成。")
	elif m.moves <= 0: _finish(r, "fail", "本局步数用尽，下次可以寻找更大的同色组。")
	return _ok({"cells": group})

static func _mansion(r: Dictionary, a: Dictionary) -> Dictionary:
	var m: Dictionary = r.model
	var action: String = str(a.get("action", ""))
	var choice: int = int(a.get("choice", -1))
	if action == "hint": _log(r, "门阵铭文：%s居中，其余两枚向外。" % ["木", "水", "火"][int(m.answer)]); return _ok()
	if action == "answer":
		if m.phase != "riddle" or choice < 0 or choice >= 3: return _fail("当前没有待解的门阵")
		if choice != int(m.answer): _log(r, "机关未响应，可查看提示后重试；没有扣除资源。")
		else: m.door = true; m.phase = "map"; r.score += 20; _log(r, "门阵已解，遗宝室开启。")
		return _ok()
	if action != "room" or choice < 0 or choice >= 6 or choice in m.rooms: return _fail("选择尚未探索的房间")
	if m.phase != "map": return _fail("先解开当前门阵")
	match choice:
		0: m.clues += 1; r.score += 8; _log(r, "书房：找到阵眼线索。")
		1: m.keys += 1; r.score += 8; _log(r, "侧室：取得一枚铜钥。")
		2:
			var battle: Dictionary = _battle(r, "shield", 2)
			if not battle.won: _finish(r, "fail", "守卫拦住了去路。")
			else: m.keys += 1; r.score += 16
		3: m.clues += 1; r.hp = mini(100, int(r.hp) + 20); _log(r, "静室：灵泉恢复生命并找到第二条线索。")
		4:
			if m.clues < 1: return _fail("先到书房或静室取得线索")
			m.phase = "riddle"; _log(r, "三枚机关珠中，哪一枚应置于中央？可免费查看提示。")
		5:
			if not m.door or m.keys < 1: return _fail("遗宝室需要解开门阵并持有一枚铜钥")
			m.keys -= 1; r.score += 30; _finish(r, "success", "铜钥开启遗宝室，洞府探索完成。")
	m.rooms.append(choice); r.step = m.rooms.size()
	return _ok()

static func _rotate_puzzle(m: Dictionary, cell: int) -> void:
	for target: int in [cell, cell - 3, cell + 3, cell - 1, cell + 1]:
		if target < 0 or target >= 9 or (target != cell and not _adjacent(cell, target, 3)): continue
		m.board[target] = (int(m.board[target]) + 1) % 3
	m.counts[cell] = (int(m.counts[cell]) + 1) % 3

static func _puzzle(r: Dictionary, a: Dictionary) -> Dictionary:
	var m: Dictionary = r.model
	var action: String = str(a.get("action", ""))
	if action == "hint":
		for cell: int in 9:
			if int(m.counts[cell]) != 0:
				m.hint = cell; _log(r, "提示：第%d格再转动%d次，消去这一处扰动。" % [cell + 1, 3 - int(m.counts[cell])]); return _ok()
		return _ok()
	var cell: int = int(a.get("choice", -1))
	if action != "rotate" or cell < 0 or cell >= 9: return _fail("点击机关可转动自身与相邻阵纹")
	_rotate_puzzle(m, cell); r.turn += 1; m.hint = -1
	var done: bool = true
	for value: Variant in m.board: done = done and int(value) == 0
	if done: r.score = maxi(20, 90 - int(r.turn) * 2); _finish(r, "success", "所有阵纹归木，机关开启。")
	return _ok()

static func _escort(r: Dictionary, a: Dictionary) -> Dictionary:
	var m: Dictionary = r.model
	var action: String = str(a.get("action", ""))
	if action == "focus":
		var lane: int = int(a.get("choice", -1))
		if lane < 0 or lane >= 3: return _fail("选择左、中、右一路")
		m.focus = lane; m.swords = [1,1,1]; m.swords[lane] = 2
		return _ok()
	if action == "repair":
		if m.energy < 2 or r.hp >= 100: return _fail("修补需要2灵力，仙舟满耐久时无需修补")
		m.energy -= 2; r.hp = mini(100, int(r.hp) + 25)
		return _ok()
	if action == "charge":
		if m.energy < 2 or m.charged: return _fail("蓄力需要2灵力，且不可重复蓄力")
		m.energy -= 2; m.charged = true
		return _ok()
	if action != "wave": return _fail("配置护舟飞剑后迎敌")
	var damage: int = 0
	var defeated: int = 0
	for lane: int in 3:
		var attack: int = int(m.swords[lane]) * 13 + (10 if m.charged else 0)
		damage += maxi(0, int(m.incoming[lane]) - attack)
		defeated += mini(attack, int(m.incoming[lane]))
	r.hp = maxi(0, int(r.hp) - damage); r.score += defeated / 4; r.step += 1; m.energy += 1; m.charged = false
	_log(r, "第%d波：击退%d敌势，仙舟受损%d，灵力 +1。" % [int(r.step), defeated, damage])
	if r.hp <= 0: _finish(r, "fail", "仙舟未能抵达。")
	elif r.step >= 6: r.score += int(r.hp) / 3; _finish(r, "success", "六波来敌尽退，仙舟平安抵达。")
	else:
		for lane: int in 3: m.incoming[lane] = 12 + int(r.step) * 3 + _rng(r, 12)
	return _ok()

static func _reincarnation(r: Dictionary, a: Dictionary) -> Dictionary:
	var m: Dictionary = r.model
	var choice: String = str(a.get("choice", ""))
	if str(a.get("action", "")) != "path" or choice not in ["compassion", "courage", "rest"]: return _fail("选择本轮历劫方向")
	m.path.append(choice)
	if choice == "compassion": m.karma += 1; r.hp = mini(100, int(r.hp) + 6)
	elif choice == "courage": m.fire += 1; m.level += 2
	else: r.hp = mini(100, int(r.hp) + 25)
	r.step += 1; r.score += 8
	_log(r, "第%d节点：善缘%d，心火%d，临时等级%d。" % [int(r.step), int(m.karma), int(m.fire), int(m.level)])
	if int(r.step) % 2 == 0:
		if m.karma >= 3 and r.step == 6: r.score += 24; _finish(r, "success", "善缘化解终劫，轮回历练完成。")
		else:
			var battle: Dictionary = _battle(r, "burn", maxi(1, int(r.step) - 1), true)
			r.hp = int(battle.remaining)
			if not battle.won: _finish(r, "fail", "历劫暂止，永久养成保留。")
			elif r.step >= 6: r.score += 24; _finish(r, "success", "以心火破劫，本轮成果可领取。")
	return _ok()

static func _exorcism(r: Dictionary, a: Dictionary) -> Dictionary:
	var m: Dictionary = r.model
	var node: int = int(a.get("choice", -1))
	if str(a.get("action", "")) != "node" or node < 0 or node >= 6 or node in m.visited: return _fail("选择尚未完成的封神遗迹节点")
	if node == 5 and m.sigils < 3: return _fail("先从三个封印节点取得符印，再开启最终魔阵")
	if node == 3: m.curse = maxi(0, int(m.curse) - 2); r.hp = mini(100, int(r.hp) + 30); _log(r, "净坛：清除两层侵蚀，恢复生命。")
	elif node == 4: m.ward += 2; _log(r, "护坛：本局护体 +2。")
	else:
		var battle: Dictionary = _battle(r, ["shield", "heal", "swarm", "burn", "charge", "charge"][node], 1 + node + int(m.curse), true)
		r.hp = int(battle.remaining)
		if not battle.won: _finish(r, "fail", "此处魔阵未能清除。")
		elif node == 5: r.score += 35; _finish(r, "success", "符印合一，封神遗劫已平。")
		else: m.sigils += 1; m.curse += 1; r.score += 15
	m.visited.append(node); r.step = m.visited.size()
	return _ok()

static func service_contract(id: String) -> Dictionary:
	var cfg: Dictionary = definition(id)
	return {"configured": false, "activity": id, "method": "POST", "path": "/v1/activities/%s/commands" % id, "required": ["authenticatedAccount", "requestId", "expectedRevision", "operation", "payload"], "serverAuthority": ["membership", "sharedMap", "matchmaking", "inventoryEscrow", "rewards", "ranking"], "mode": "not_connected", "reason": "尚未配置认证与权威服务；%s的本地演练资产和成绩不提交线上。" % str(cfg.get("name", "该玩法"))}

static func _practice(r: Dictionary, cfg: Dictionary, a: Dictionary) -> Dictionary:
	var m: Dictionary = r.model
	var action: String = str(a.get("action", ""))
	var choice: int = int(a.get("choice", -1))
	var group: String = str(cfg.group)
	if group in ["trade", "auction"]:
		if action == "list":
			if m.locked or m.inventory <= 0 or m.cooldown > 0: return _fail("演练物品已占用或仍在冷却")
			m.inventory -= 1; m.escrow = 1; m.locked = true; m.phase = "listed"; m.deadline = 3; m.bid = 0
		elif action == "cancel":
			if not m.locked or m.bid > 0: return _fail("当前挂单不可撤回")
			m.inventory += int(m.escrow); m.escrow = 0; m.locked = false; m.phase = "prepare"
		elif action == "bid" and group == "auction":
			if not m.locked or m.deadline <= 0 or choice <= int(m.bid) or choice < 10 or (not GameEconomy.free_currency() and choice > int(m.balance) + int(m.bid)): return _fail("演练出价无效或余额不足")
			if not GameEconomy.free_currency(): m.balance += int(m.bid); m.balance -= choice
			m.bid = choice
		elif action == "tick" and group == "auction":
			if not m.locked or m.deadline <= 0: return _fail("没有进行中的演练拍卖")
			m.deadline -= 1
		elif action == "settle_trade":
			if not m.locked or (group == "auction" and m.deadline > 0): return _fail("演练成交条件尚未满足")
			var receipt: String = "sandbox-sale-%d" % int(r.revision)
			m.ledger[receipt] = {"amount": int(m.bid) if group == "auction" else 20, "sandbox": true}
			m.balance += 20 if group == "trade" else int(m.bid)
			m.escrow = 0; m.bid = 0; m.locked = false; m.cooldown = 2; m.phase = "done"
			_finish(r, "success", "本地账本演练结束，未发生真实交易或拍卖。")
		else: return _fail("请选择演练挂单、撤单、出价或结算")
		_log(r, "沙盘账本：库存%d，占用%d，可用演练币%d。" % [int(m.inventory), int(m.escrow), int(m.balance)])
		return _ok()
	if group in ["gift", "aid", "seal", "rescue"]:
		if action == "request":
			if m.phase != "prepare": return _fail("本次演练请求已创建")
			m.phase = "pending"; m.requests.append("local-request"); _log(r, "已生成明确标记为本地的演练请求。")
		elif action == "assist":
			if m.phase != "pending": return _fail("没有待处理的演练请求")
			m.points += 1
			if m.points >= (3 if group == "seal" else 1): m.phase = "receivable"
			_log(r, "演练进度%d；没有真实好友或盟友参与。" % int(m.points))
		elif action == "receive":
			if m.phase != "receivable" or "local-receipt" in m.receipts: return _fail("本次演练已收取或条件不足")
			m.receipts.append("local-receipt"); m.phase = "done"
			_finish(r, "success", "演练收取成功；重复收取会被拒绝，真实资产未变。")
		else: return _fail("按创建请求、处理、确认收取的顺序演练")
		return _ok()
	if group == "clues":
		if action != "clue" or choice < 0 or choice >= 9 or choice in m.clues: return _fail("选择尚未提交的残图；重复提交不会计数")
		m.clues.append(choice); m.points += 1; r.step += 1
		_log(r, "本地残图%d / 9；共享仙盟进度尚未接入。" % m.clues.size())
		if m.clues.size() >= 9: _finish(r, "success", "沙盘残图已拼合，不发放真人协作奖励。")
		return _ok()
	if group in ["territory", "tide", "core", "explore", "development"]:
		if action == "develop" and group == "development":
			if m.supply < 2 or m.round >= 3: return _fail("营地升级需要2补给，最多三级")
			m.supply -= 2; m.round += 1; _log(r, "本局营地%d级；外部养成未重置。" % int(m.round)); return _ok()
		if action == "resupply":
			if m.phase == "resupplied": return _fail("每次占领间只可补给一次")
			m.supply += 2 + int(m.round); m.phase = "resupplied"; return _ok()
		if action != "capture" or choice < 0 or choice >= 9 or choice in m.owned or m.supply <= 0: return _fail("选择相连且尚未占领的节点，并保证有补给")
		var linked: bool = false
		for node: Variant in m.owned: linked = linked or _adjacent(int(node), choice, 3)
		if not linked: return _fail("只能从已占据的节点推进到相邻节点")
		if group == "tide" and choice == (int(r.turn) + 4) % 9: return _fail("该节点本轮被潮汐封闭，请换一条路线")
		if group == "core" and choice == 8 and m.owned.size() < 4: return _fail("先取得四个前哨，再攻核心")
		m.supply -= 1; m.owned.append(choice); m.points += 5 + int(m.round); r.turn += 1; m.phase = "capture"
		_log(r, "沙盘节点%d已推进，补给%d；未生成真人战功。" % [choice + 1, int(m.supply)])
		if (group == "core" and choice == 8) or (group != "core" and m.owned.size() >= 6): _finish(r, "success", "本地地图演练完成。")
		return _ok()
	if group == "league" and action == "mission":
		if m.phase != "missions" or choice < 0 or choice > 2 or choice in m.missions: return _fail("每轮需依次完成不同盟会任务，不能重复提交")
		if choice == 0: m.supply += 2; m.points += 1
		elif choice == 1:
			if m.supply < 3: return _fail("攻关需要3补给；可先完成筹备任务")
			m.supply -= 3; m.points += 3
		else:
			if m.supply < 1: return _fail("巡防需要1补给")
			m.supply -= 1; m.points += 2
		m.missions.append(choice)
		if m.missions.size() == 3: m.phase = "training"; m.target = _rng(r,3)
		_log(r,"第%d轮任务%d/3，补给%d。" % [int(m.round)+1,m.missions.size(),int(m.supply)])
		return _ok()
	if action == "support":
		if m.phase != "prepare" or choice < 0 or choice >= 3: return _fail("在准备阶段选择三个支援位置")
		if choice in m.party: m.party.erase(choice)
		else: m.party.append(choice)
		return _ok()
	if action == "ready":
		if m.phase != "prepare" or m.party.size() != 3: return _fail("三个演练支援位都安排后才能准备")
		m.phase = "missions" if group == "league" else "training"; m.target = _rng(r, 3); return _ok()
	if action == "strategy":
		if m.phase != "training" or choice < 0 or choice >= 3: return _fail("先完成排阵准备")
		var counter: bool = choice == (int(m.target) + 1) % 3
		if group == "bracket":
			if counter: m.seriesWins += 1
			else: m.seriesLosses += 1
			m.target = _rng(r,3)
			if m.seriesLosses >= 2: _finish(r,"fail","沙盘三局两胜中失利，真实段位不受影响。")
			elif m.seriesWins >= 2:
				m.round += 1; m.points += 10; m.seriesWins = 0; m.seriesLosses = 0
				if m.round >= 3: r.score = int(m.points); _finish(r,"success","沙盘三轮晋级完成；不是与真人比赛。")
			_log(r,"沙盘第%d轮：本轮胜%d、负%d。" % [mini(3,int(m.round)+1),int(m.seriesWins),int(m.seriesLosses)])
			return _ok()
		if group == "league":
			m.points += 3 if counter else 1; m.round += 1; r.score = int(m.points)
			if m.round >= 3:
				m.glory.append("沙盘·协作旗" if m.points >= 24 else "沙盘·参与名帖")
				_finish(r,"success","三轮任务与对阵完成；获得本地沙盘纪念，不发真实盟会奖。")
			else: m.phase = "missions"; m.missions = []
			return _ok()
		m.points += 3 if counter else 1; m.round += 1; m.target = _rng(r, 3)
		_log(r, "第%d轮沙盘：%s，演练积分%d。" % [int(m.round), "对策命中" if counter else "稳步推进", int(m.points)])
		if m.round >= 3: _finish(r, "success", "三轮本地演练完成；真实匹配、晋级和排行待服务端。")
		return _ok()
	return _fail("先安排支援、准备，再选择本轮对策")

static func _task_token(f: Dictionary, key: String, amount: int) -> bool:
	if int(f.tasks.get(key, 0)) > 0: return false
	f.tasks[key] = 1; f.tokens += amount
	return true

static func _festival_act(s: Dictionary, id: String, a: Dictionary) -> Dictionary:
	var f: Dictionary = s.activities.festivals[id]
	var action: String = str(a.get("action", ""))
	if id == "083":
		if action == "craft":
			var count: int = int(f.tasks.get("craft", 0))
			if count >= 3: return _fail("本期三盏花灯已经制作完成")
			if not _pay(s, {"herb": 2}): return _fail("制作花灯需要灵药2")
			f.tasks.craft = count + 1; f.tokens += 3
			return _ok({"message": "花灯已制作，节日花笺 +3"})
		if action == "riddle":
			if int(a.get("choice", -1)) != int(rules().riddle.correct): return _fail("谜底尚未解开，请重试；不会扣除资源")
			if not _task_token(f, "riddle", 3): return _fail("灯谜奖励已领取")
			return _ok({"message": "灯谜答对，节日花笺 +3"})
	else:
		if action == "debate":
			var index: int = int(a.get("topic", -1))
			if index < 0 or index >= rules().topics.size(): return _fail("论题不存在")
			if int(a.get("choice", -1)) != int(rules().topics[index].correct): return _fail("请结合论题重新思考；无资源损失")
			if not _task_token(f, "topic-%d" % index, 3): return _fail("此论题已完成")
			return _ok({"message": "论道完成，庆典印记 +3"})
	if action == "participate":
		if int(s.activities.completed) < 1: return _fail("先完成任意一局本地活动并结算")
		if not _task_token(f, "participate", 5): return _fail("参与任务已领取")
		return _ok({"message": "参与奖励 +5"})
	return _fail("选择当前庆典任务")

static func _festival_exchange(s: Dictionary, id: String, offer_id: String) -> Dictionary:
	if id not in ["083", "083b"]: return _fail("该活动没有庆典兑换")
	var f: Dictionary = s.activities.festivals[id]
	var pool: Array = rules().festivalOffers if id == "083" else rules().celebrationOffers
	var offer: Dictionary = {}
	for item: Dictionary in pool:
		if str(item.id) == offer_id: offer = item
	if offer.is_empty(): return _fail("兑换物品不存在")
	if int(f.purchases.get(offer_id, 0)) >= int(offer.limit): return _fail("本期兑换次数已用尽")
	if not GameEconomy.free_currency() and f.tokens < int(offer.price): return _fail("庆典收集物不足")
	if not _gain(s, offer.reward): return _fail("资源将超出上限，请先消耗")
	if not GameEconomy.free_currency(): f.tokens -= int(offer.price)
	f.purchases[offer_id] = int(f.purchases.get(offer_id, 0)) + 1
	if offer.has("cosmetic") and offer.cosmetic not in s.activities.cosmetics: s.activities.cosmetics.append(offer.cosmetic)
	return _ok({"reward": offer.reward, "cosmetic": offer.get("cosmetic", ""), "message": "已兑换%s" % offer.name})

static func milestone_progress(s: Dictionary, metric: String) -> int:
	match metric:
		"completed": return int(s.get("activities", {}).get("completed", 0))
		"storyClears": return s.get("cleared", []).size()
		"cultivationSpent":
			var ledger: Dictionary = s.get("activities",{}).get("consumption",{})
			var total: int = int(ledger.get("legacyCultivation",_known_cultivation(s)))
			for value: Variant in ledger.get("resources",{}).values(): total += int(value)
			for value: Variant in ledger.get("materials",{}).values(): total += int(value)
			return total
	return 0

static func _claim_milestone(s: Dictionary, id: String) -> Dictionary:
	var item: Dictionary = {}
	for entry: Dictionary in rules().milestones:
		if str(entry.id) == id: item = entry
	if item.is_empty() or id in s.activities.claimed: return _fail("累计奖励不存在或已领取")
	if milestone_progress(s, str(item.metric)) < int(item.target): return _fail("累计目标尚未达成；已投入资源会自动追溯")
	if not _gain(s, item.reward): return _fail("资源将超出上限")
	s.activities.claimed.append(id)
	return _ok({"reward": item.reward})

static func _numbers(value: Variant, count: int, cap: int, minimum: int = 0, unique: bool = false) -> bool:
	if not value is Array or value.size() > count: return false
	var seen: Array = []
	for entry: Variant in value:
		if not (entry is int or entry is float) or not is_finite(float(entry)) or float(entry) != floor(float(entry)) or entry < minimum or entry > cap or (unique and entry in seen): return false
		seen.append(entry)
	return true

static func validate(s: Dictionary) -> String:
	if not s.has("activities"): return ""
	var a: Variant = s.activities
	if not a is Dictionary: return "活动存档结构无效"
	for key: String in ["version", "seq", "rng", "completed", "spent"]:
		if not _nat(a.get(key), 4294967295 if key == "rng" else 999999999): return "活动计数无效：" + key
	if int(a.version) != 1 or int(a.seq) > 999999 or int(a.rng) == 0: return "活动存档版本或随机流无效"
	for key: String in ["runs", "settled", "records", "festivals"]:
		if not a.get(key) is Dictionary: return "活动记录无效：" + key
	for key: String in ["claimed", "history", "cosmetics"]:
		if not a.get(key) is Array: return "活动列表无效：" + key
	if a.history.size() > 20 or a.claimed.size() > rules().milestones.size() or a.cosmetics.size() > 10: return "活动列表超过上限"
	if not a.get("equippedCosmetic","") is String or (not str(a.get("equippedCosmetic","")).is_empty() and a.equippedCosmetic not in a.cosmetics): return "佩戴名片尚未拥有"
	if a.has("consumption"):
		var ledger: Variant = a.consumption
		if not ledger is Dictionary or ledger.get("version") != 1 or not _nat(ledger.get("fromAt"),9007199254740991) or not _nat(ledger.get("commands")) or not _nat(ledger.get("legacyCultivation")) or not ledger.get("resources") is Dictionary or not ledger.get("materials") is Dictionary: return "累计消耗台账无效"
		for key: Variant in ledger.resources:
			if key not in RESOURCE_KEYS or not _nat(ledger.resources[key]): return "累计资源消耗无效"
		var materials: Dictionary = load("res://scripts/game_progression.gd").rules().materials
		for key: Variant in ledger.materials:
			if not materials.has(key) or not _nat(ledger.materials[key]): return "累计培养材料消耗无效"
	var cosmetic_ids: Array = []
	for offer: Dictionary in rules().festivalOffers + rules().celebrationOffers:
		if offer.has("cosmetic"): cosmetic_ids.append(offer.cosmetic)
	var cosmetic_seen: Array = []
	for cosmetic: Variant in a.cosmetics:
		if cosmetic not in cosmetic_ids or cosmetic in cosmetic_seen: return "庆典纪念物无效或重复"
		cosmetic_seen.append(cosmetic)
	for receipt: Variant in a.history:
		if not receipt is Dictionary or not receipt.get("id") is String or definition(str(receipt.get("activity", ""))).is_empty() or receipt.get("outcome") not in ["success", "fail", "withdrawn"] or not receipt.get("practice") is bool or not _nat(receipt.get("score")) or not _nat(receipt.get("settledAt"), 9007199254740991) or not receipt.get("reward") is Dictionary: return "活动结算凭证无效"
		for key: Variant in receipt.reward:
			if key not in RESOURCE_KEYS or not _nat(receipt.reward[key]): return "活动结算奖励无效"
		if not receipt.get("materials", {}) is Dictionary: return "活动培养材料凭证无效"
		for key: Variant in receipt.get("materials", {}):
			if key not in ["abilitypage", "bodypill", "sealfragment", "petfood", "lifecore", "spiritessence"] or not _nat(receipt.materials[key]): return "活动培养材料奖励无效"
		if receipt.practice and not receipt.reward.is_empty(): return "演练不应有真实奖励"
		if receipt.practice and not receipt.get("materials", {}).is_empty(): return "演练不应有真实培养材料"
	var seen: Array = []
	for id: Variant in a.claimed:
		var found: bool = false
		for entry: Dictionary in rules().milestones: found = found or entry.id == id
		if not found or id in seen: return "累计奖励领取记录重复或无效"
		seen.append(id)
	for id: Variant in a.settled:
		if not id is String or definition(id).is_empty() or not _nat(a.settled[id], int(a.seq)): return "活动结算序号无效"
	for id: Variant in a.records:
		var rec: Variant = a.records[id]
		if not id is String or definition(id).is_empty() or not rec is Dictionary: return "活动成绩无效"
		for key: String in ["runs", "wins", "best"]:
			if not _nat(rec.get(key)): return "活动成绩数值无效"
		if rec.wins > rec.runs or not _numbers(rec.get("targets"), 3, 2, 0, true): return "活动挑战资格无效"
		if rec.has("practiceBadges"):
			if id != "064" or not rec.practiceBadges is Array or rec.practiceBadges.size() > 1: return "沙盘纪念记录无效"
			for badge: Variant in rec.practiceBadges:
				if badge not in ["沙盘·协作旗","沙盘·参与名帖"]: return "沙盘纪念名称无效"
	for id: String in ["083", "083b"]:
		var festival: Variant = a.festivals.get(id)
		if not festival is Dictionary or not _nat(festival.get("tokens"), 100) or not festival.get("tasks") is Dictionary or not festival.get("purchases") is Dictionary: return "庆典记录无效"
		var task_keys: Array = ["craft", "riddle", "participate"] if id == "083" else ["topic-0", "topic-1", "topic-2", "participate"]
		for key: Variant in festival.tasks:
			if key not in task_keys or not _nat(festival.tasks[key], 3 if key == "craft" else 1): return "庆典任务次数无效"
		for key: Variant in festival.purchases:
			var found: Dictionary = {}
			for offer: Dictionary in rules().festivalOffers if id == "083" else rules().celebrationOffers:
				if offer.id == key: found = offer
			if found.is_empty() or not _nat(festival.purchases[key], int(found.limit)): return "庆典兑换记录无效"
	for id: Variant in a.runs:
		var r: Variant = a.runs[id]
		var cfg: Dictionary = definition(str(id))
		if cfg.is_empty() or cfg.kind in ["existing", "milestones", "festival", "celebration"] or not r is Dictionary: return "活动局记录无效"
		if r.get("definitionId") != id or not _nat(r.get("seq"), int(a.seq)) or int(r.seq) <= int(a.settled.get(id, 0)) or str(r.get("id", "")) != "activity-%s-%d" % [id, int(r.seq)]: return "活动局身份或去重记录无效"
		if r.get("ruleVersion") != rules().ruleVersion: return "活动规则版本不兼容；请保留旧档"
		for key: String in ["seed", "rng", "createdAt", "revision", "score", "hp", "maxHp", "turn", "step"]:
			if not _nat(r.get(key), 9007199254740991 if key == "createdAt" else 4294967295): return "活动局数值无效：" + key
		if int(r.rng) == 0 or int(r.hp) > int(r.maxHp) or int(r.maxHp) != 100: return "活动生命或随机流无效"
		if r.get("status") not in ["active", "ready"] or r.get("outcome") not in ["", "success", "fail", "withdrawn"]: return "活动局状态无效"
		if (r.status == "active") != (r.outcome == ""): return "活动局结束状态不一致"
		if not r.get("practice") is bool or bool(r.practice) != (str(cfg.kind) in ["online", "puppet"]): return "活动演练标识无效"
		if not r.get("log") is Array or r.log.size() > 6 or not r.get("team") is Array or r.team.size() > 5 or not r.get("model") is Dictionary or not r.get("battle") is Dictionary: return "活动快照无效"
		for member: Variant in r.team:
			if not member is Dictionary or not member.get("id") is String or not _nat(member.get("level"), 1000) or int(member.level) < 1 or not _nat(member.get("treasure"), 1000) or not member.get("equipmentStats") is Dictionary: return "活动队伍快照无效"
		if not r.get("petSupport", {}) is Dictionary: return "活动灵兽快照无效"
		var step_caps: Dictionary = {"tower":20,"dream":5,"ruins":8,"cards":4,"sigils":3,"chess":8,"construct":3,"puppet":3,"beasts":3,"defense":6,"reincarnation":6,"exorcism":6,"escort":6,"online":9}
		if int(r.step) > int(step_caps.get(str(cfg.kind), 60)): return "活动节点超过上限"
		for text: Variant in r.log:
			if not text is String or text.length() > 240: return "活动日志无效"
		var error: String = _validate_model(str(cfg.kind), r.model)
		if not error.is_empty(): return str(cfg.name) + "：" + error
	return ""

static func _action(label: String, action: String, choice: Variant = null, extra: Dictionary = {}) -> Dictionary:
	var args: Dictionary = {"action": action}
	if choice != null: args.choice = choice
	args.merge(extra, true)
	return {"label": label, "cmd": "activityAct", "args": args}

static func view(s: Dictionary, id: String) -> Dictionary:
	var copy: Dictionary = s.duplicate(true)
	ensure_state(copy)
	var cfg: Dictionary = definition(id)
	if cfg.is_empty(): return {}
	var result: Dictionary = {"definition": cfg, "run": copy.activities.runs.get(id, {}).duplicate(true), "record": copy.activities.records.get(id, {}).duplicate(true), "actions": [], "network": service_contract(id), "festival": copy.activities.festivals.get(id, {}).duplicate(true), "milestones": []}
	for item: Dictionary in rules().milestones:
		var value: Dictionary = item.duplicate(true)
		value.progress = milestone_progress(copy, str(item.metric)); value.claimed = item.id in copy.activities.claimed
		result.milestones.append(value)
	result.actions = available_actions(copy, id)
	return result

static func available_actions(s: Dictionary, id: String) -> Array:
	var cfg: Dictionary = definition(id)
	if cfg.is_empty() or cfg.kind == "existing": return []
	var list: Array = []
	if cfg.kind == "milestones":
		for entry: Dictionary in rules().milestones:
			list.append({"label": "%s %d/%d%s" % [entry.name, mini(milestone_progress(s, str(entry.metric)), int(entry.target)), int(entry.target), " · 已领" if entry.id in s.activities.claimed else ""], "cmd": "activityClaimMilestone", "args": {"id": entry.id}, "disabled": entry.id in s.activities.claimed or milestone_progress(s, str(entry.metric)) < int(entry.target)})
		return list
	if cfg.kind in ["festival", "celebration"]:
		var f: Dictionary = s.activities.festivals[id]
		if id == "083":
			list.append(_action("制作花灯 · 灵药2", "craft"))
			for i: int in 3: list.append(_action("谜底 · " + str(rules().riddle.answers[i]), "riddle", i))
		else:
			for i: int in rules().topics.size(): list.append(_action("论题%d · 开始答辩" % (i + 1), "debate", 0, {"topic": i, "previewTopic": true}))
		list.append(_action("领取参与奖励", "participate"))
		for offer: Dictionary in rules().festivalOffers if id == "083" else rules().celebrationOffers:
			if offer.get("cosmetic","") in s.activities.cosmetics:
				var equipped: bool = s.activities.get("equippedCosmetic","") == offer.cosmetic
				list.append({"label":"卸下纪念名片" if equipped else "佩戴 · "+str(offer.name).replace("纪念名片·",""),"cmd":"activityEquipCosmetic","args":{"cosmetic":"" if equipped else offer.cosmetic}})
				continue
			list.append({"label": "%s · %d枚" % [offer.name, int(offer.price)], "cmd": "activityFestivalExchange", "args": {"offer": offer.id}, "disabled": int(f.purchases.get(offer.id, 0)) >= int(offer.limit)})
		return list
	var run: Dictionary = s.get("activities", {}).get("runs", {}).get(id, {})
	if run.is_empty():
		list.append({"label": "开始本地演练" if cfg.kind in ["online", "puppet"] else "开始本局 · 灵石%d" % int(cfg.cost.get("stone", 0)), "cmd": "activityStart", "args": {}})
		if id == "048":
			for target: Variant in s.activities.records.get(id, {}).get("targets", []): list.append({"label": "扫荡妖王%d · 灵石12" % (int(target) + 1), "cmd": "activitySweep", "args": {"target": int(target)}})
		return list
	if run.status == "ready": return [{"label": "结束演练" if run.practice else "领取结算" if run.outcome == "success" else "结束本局", "cmd": "activitySettle", "args": {"runId": run.id}}]
	var m: Dictionary = run.model
	match str(cfg.kind):
		"boss", "astral", "body":
			var names: Array = ["玄岩 · 护盾", "青木 · 恢复", "群妖 · 多目标", "赤火 · 灼烧", "惊雷 · 蓄势"] if cfg.kind != "body" else ["护体试炼", "续战试炼", "攻伐试炼"]
			for i: int in (5 if cfg.kind == "astral" else 3): list.append(_action(("✓ " if int(m.target) == i else "") + names[i], "target", i))
			list.append(_action("自动挑战", "fight"))
		"damage": list.append(_action("开始50次行动挑战", "fight"))
		"tower":
			if m.phase == "choice":
				list.append(_action("锋芒 · 攻击+8%", "boon", "might")); list.append(_action("坚壁 · 防御+8", "boon", "ward"))
				if int(run.step) >= 5: list.append(_action("携成果离塔", "leave"))
			else: list.append(_action("自动挑战第%d层" % int(m.floor), "fight"))
		"dream":
			if m.phase == "choice": list.append(_action("剑意 · 等级+2", "boon", "blade")); list.append(_action("护体 · 防御成长", "boon", "ward")); list.append(_action("回春 · 恢复40%", "boon", "renew"))
			else: list.append(_action("自动挑战梦境", "fight"))
		"ruins": list.append(_action("探路 · 稳步深入", "safe")); list.append(_action("冒险 · 更多遗宝", "risk")); list.append(_action("携宝撤离", "exit"))
		"cards":
			if m.phase == "growth": list.append(_action("加入长生符", "growth", 0)); list.append(_action("全卡恢复12", "growth", 1)); list.append(_action("全卡攻击+2", "growth", 2))
			else:
				list.append(_action("全部护持", "allocate", 0)); list.append(_action("攻守均分", "allocate", int(m.budget) / 2)); list.append(_action("全部攻击", "allocate", int(m.budget)))
				for i: int in m.deck.size():
					if int(m.deck[i].hp) > 0: list.append(_action("%s承伤 · 出符" % m.deck[i].name, "resolve", i))
		"sigils":
			if m.phase == "choice": list.append(_action("下一层 · 攻阵", "boon", "force")); list.append(_action("下一层 · 守阵", "boon", "guard"))
			else: list.append(_action("镇魔 · 至少六符", "resolve"))
		"construct", "puppet":
			list.append(_action("制作武器 · 零件3", "craft", "weapon")); list.append(_action("制作护甲 · 零件2", "craft", "armor"))
			if m.talent == "": list.append(_action("天赋 · 剑术", "talent", "blade")); list.append(_action("天赋 · 守御", "talent", "ward")); list.append(_action("天赋 · 巧工", "talent", "renew"))
			list.append(_action("探索 · 回收零件", "explore", "salvage")); list.append(_action("探索 · 清除守卫", "explore", "ambush")); list.append(_action("挑战守关者", "fight"))
		"beasts":
			var selected: Dictionary = _beast(m, int(m.selected))
			if not selected.is_empty():
				list.append(_action("下阵" if selected.id in m.team else "上阵", "team", int(m.selected)))
				list.append(_action("解除锁定" if selected.locked else "锁定保护", "lock", int(m.selected)))
				for donor: Dictionary in m.beasts:
					if donor.id != m.selected and not donor.locked and donor.id not in m.team: list.append(_action("传承 · " + str(donor.name), "inherit", int(m.selected), {"target": int(donor.id), "requiresConfirm": true}))
			list.append(_action("兽魂队伍挑战", "fight"))
		"defense":
			list.append(_action("招募 · 铜钱2", "recruit"))
			var pair: Array = []
			for i: int in m.bench.size():
				for j: int in range(i + 1, m.bench.size()):
					if int(m.bench[i]) == int(m.bench[j]) and int(m.bench[i]) < 3 and pair.is_empty(): pair = [i, j]
			if not pair.is_empty(): list.append(_action("合成两名同阶单位", "merge", pair[0], {"target": pair[1]}))
			list.append(_action("迎击下一波", "wave"))
		"plinko":
			for i: int in 5: list.append(_action("第%d入口投珠" % (i + 1), "drop", i))
		"race":
			for i: int in 3: list.append(_action(["左路", "中路", "右路"][i], "drive", i))
		"mansion":
			if m.phase == "riddle":
				for i: int in 3: list.append(_action(["木珠居中", "水珠居中", "火珠居中"][i], "answer", i))
			list.append(_action("查看机关提示", "hint"))
		"puzzle": list.append(_action("免费查看下一步提示", "hint"))
		"escort":
			for i: int in 3: list.append(_action("飞剑集中" + ["左路", "中路", "右路"][i], "focus", i))
			list.append(_action("修补 · 灵力2", "repair")); list.append(_action("蓄力 · 灵力2", "charge")); list.append(_action("迎击下一波", "wave"))
		"reincarnation": list.append(_action("慈悲 · 积累善缘", "path", "compassion")); list.append(_action("勇毅 · 临时成长", "path", "courage")); list.append(_action("休整 · 恢复25%", "path", "rest"))
		"online": list = _practice_actions(run, cfg)
	list.append(_action("结束本局", "abandon"))
	return list

static func _practice_actions(r: Dictionary, cfg: Dictionary) -> Array:
	var m: Dictionary = r.model
	var group: String = str(cfg.group)
	var list: Array = []
	if group in ["trade", "auction"]:
		if not m.locked: list.append(_action("演练挂单 · 占用1件", "list"))
		else:
			list.append(_action("撤回演练挂单", "cancel"))
			if group == "auction": list.append(_action("出价 · 加10演练币", "bid", int(m.bid) + 10)); list.append(_action("推进拍卖一轮", "tick"))
			list.append(_action("演练成交结算", "settle_trade"))
	elif group in ["gift", "aid", "seal", "rescue"]:
		if m.phase == "prepare": list.append(_action("创建演练请求", "request"))
		elif m.phase == "pending": list.append(_action("反抗封印" if group == "seal" else "执行本地处理", "assist"))
		else: list.append(_action("确认演练收取", "receive"))
	elif group in ["territory", "tide", "core", "explore", "development"]:
		list.append(_action("补给 · 本地资源", "resupply"))
		if group == "development": list.append(_action("营地升级 · 补给2", "develop"))
	elif group != "clues":
		if m.phase == "prepare":
			for i: int in 3: list.append(_action(("✓ " if i in m.party else "") + ["攻伐支援", "守御支援", "恢复支援"][i], "support", i))
			list.append(_action("准备演练阵容", "ready"))
		elif group == "league" and m.phase == "missions":
			for i: int in 3:
				var item: Dictionary = _action(["筹备 · 补给+2","攻关 · 补给3","巡防 · 补给1"][i],"mission",i)
				item.disabled = i in m.missions
				list.append(item)
		else:
			for i: int in 3: list.append(_action(["攻伐", "守御", "恢复"][i] + "对策", "strategy", i))
	return list

static func _validate_model(kind: String, m: Dictionary) -> String:
	if kind == "tower" and (not _nat(m.get("floor"), 20) or int(m.floor) < 1 or not _nat(m.get("might"), 19) or not _nat(m.get("ward"), 19) or m.get("phase") not in ["battle", "choice"]): return "塔内楼层或加成无效"
	var numerical: Dictionary = {"boss": ["target", "stance"], "damage": ["target", "stance"], "astral": ["target", "stance"], "body": ["target", "stance"], "dream": ["level", "ward"], "ruins": ["loot", "risk", "depth", "exitAt"], "cards": ["selected", "budget", "allocate", "enemyHp", "enemyMax"], "sigils": ["next", "placed"], "chess": ["player"], "construct": ["parts", "weapon", "armor", "explored"], "puppet": ["parts", "weapon", "armor", "explored"], "beasts": ["selected"], "defense": ["coins", "enemyHp"], "plinko": ["balls"], "race": ["lane", "speed", "distance", "obstacle", "wind"], "match": ["moves", "collected"], "mansion": ["keys", "clues", "answer"], "escort": ["energy", "focus"], "reincarnation": ["karma", "fire", "level"], "exorcism": ["sigils", "curse", "ward"], "online": ["supply", "points", "round", "inventory", "escrow", "balance", "bid", "deadline", "cooldown"]}
	for key: String in numerical.get(kind, []):
		if not _nat(m.get(key), 999999): return "局内数值无效：" + key
	var board_size: int = {"sigils": 9, "match": 25, "puzzle": 9, "defense": 6}.get(kind, 0)
	if board_size > 0:
		if not _numbers(m.get("board"), board_size, 4 if kind == "match" else 3 if kind == "defense" else 2, -1 if kind == "sigils" else 0) or m.board.size() != board_size: return "盘面无效"
	match kind:
		"boss", "body", "damage", "astral":
			if int(m.target) >= (5 if kind == "astral" else 3): return "挑战目标无效"
		"cards":
			if not m.get("deck") is Array or m.deck.size() < 1 or m.deck.size() > 4 or m.selected >= m.deck.size() or m.allocate > m.budget or m.get("phase") not in ["play", "growth"]: return "临时卡组无效"
			for card: Variant in m.deck:
				if not card is Dictionary or not _nat(card.get("hp"), 500) or not _nat(card.get("atk"), 100) or not card.get("name") is String: return "临时神符无效"
		"sigils":
			if m.next > 2 or m.placed > 9 or m.get("phase") not in ["place", "choice"] or m.get("boon") not in ["force", "guard"]: return "阵纹阶段无效"
			if int(m.placed) != 9 - m.board.count(-1): return "阵纹数量与盘面不一致"
		"chess":
			if m.player >= 25 or not _numbers(m.get("enemies"), 6, 24, 0, true) or m.player in m.enemies: return "棋子位置无效"
		"dream":
			if m.get("phase") not in ["choice", "battle"] or not m.get("boons") is Array or m.boons.size() > 5: return "梦境成长无效"
		"construct", "puppet":
			if m.get("talent") not in ["", "blade", "ward", "renew"] or m.explored > 3: return "道兵构筑无效"
		"beasts":
			if not m.get("beasts") is Array or m.beasts.size() > 4 or m.beasts.is_empty() or not _numbers(m.get("team"), 2, 3, 0, true): return "独立兽魂队伍无效"
			var ids: Array = []
			for beast: Variant in m.beasts:
				if not beast is Dictionary or not _nat(beast.get("id"), 3) or beast.id in ids or not _nat(beast.get("level"), 6) or int(beast.level) < 1 or beast.get("skill") not in ["strike", "guard", "heal"] or not beast.get("locked") is bool or not beast.get("name") is String: return "兽魂记录无效"
				ids.append(beast.id)
			for id: Variant in m.team:
				if id not in ids: return "出战兽魂已不存在"
			if m.selected not in ids: return "选中的兽魂已不存在"
		"defense":
			if not _numbers(m.get("bench"), 6, 3, 1) or not _numbers(m.get("incoming"), 3, 100) or m.incoming.size() != 3: return "防守单位无效"
			if not _numbers([m.get("selected")], 1, m.bench.size() - 1, -1): return "待命单位选择无效"
		"plinko":
			if m.balls > 5 or not _numbers(m.get("path"), 7, 4): return "落珠路径无效"
		"race":
			if m.lane > 2 or m.obstacle > 2 or m.wind > 2 or m.speed < 1 or m.speed > 5 or not m.get("trail") is Array or m.trail.size() > 5: return "赛道记录无效"
			if not _nat(m.get("growth"),2) or not _nat(m.get("mountLevel"),45) or not _nat(m.get("mountStars"),5) or not m.get("mountId") is String: return "座驾成长快照无效"
			if int(m.growth) != clampi(int(m.mountLevel)/3+int(m.mountStars),0,2) or int(m.speed) < 1+int(m.growth) or int(m.speed)>3+int(m.growth): return "座驾成长或速度不一致"
			if str(m.mountId).is_empty():
				if int(m.mountLevel) != 0 or int(m.mountStars) != 0: return "未选座驾不应有培养快照"
			else:
				var known_mount: bool = false
				for mount: Dictionary in load("res://scripts/game_progression.gd").rules().families.mounts.choices: known_mount = known_mount or mount.id == m.mountId
				if not known_mount or int(m.mountLevel)<1 or int(m.mountLevel)>20+int(m.mountStars)*5: return "座驾快照等级或对象无效"
		"mansion":
			if not _numbers(m.get("rooms"), 6, 5, 0, true) or not m.get("door") is bool or m.get("phase") not in ["map", "riddle"] or m.answer > 2: return "洞府机关无效"
		"puzzle":
			if not _numbers(m.get("counts"), 9, 2) or m.counts.size() != 9: return "机关转动记录无效"
			if not _numbers([m.get("hint")], 1, 8, -1): return "机关提示位置无效"
		"escort":
			if not _numbers(m.get("swords"), 3, 2) or m.swords.size() != 3 or not _numbers(m.get("incoming"), 3, 100) or m.incoming.size() != 3 or not m.get("charged") is bool: return "护舟配置无效"
			if int(m.focus) > 2: return "飞剑阵位无效"
		"reincarnation":
			if not m.get("path") is Array or m.path.size() > 6: return "轮回节点无效"
		"exorcism":
			if not _numbers(m.get("visited"), 6, 5, 0, true): return "封神节点无效"
		"online":
			for key: String in ["owned", "map", "clues", "party"]:
				if not _numbers(m.get(key), 9, 8, 0, true): return "演练地图无效"
			for key: String in ["requests", "receipts"]:
				if not m.get(key) is Array or m[key].size() > 1: return "演练去重记录无效"
			if not m.get("ledger") is Dictionary or not m.get("locked") is bool or not m.get("phase") is String: return "演练流程无效"
			if m.phase not in ["prepare", "training", "pending", "receivable", "listed", "done", "capture", "resupplied", "missions"]: return "演练阶段无效"
			if not _nat(m.get("seriesWins"),2) or not _nat(m.get("seriesLosses"),2) or not _nat(m.get("inherited"),3) or not _numbers(m.get("missions"),3,2,0,true) or not m.get("glory") is Array or m.glory.size()>1: return "沙盘赛程或继承无效"
			for badge: Variant in m.glory:
				if badge not in ["沙盘·协作旗","沙盘·参与名帖"]: return "沙盘荣耀记录无效"
			if m.phase == "training" and not _nat(m.get("target"), 2): return "演练目标无效"
	return ""
