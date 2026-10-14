class_name GameEconomy
extends RefCounted
## Native deterministic V3 economy. Only dictionaries passed as transaction drafts mutate.
const RESOURCE_KEYS = ["stone", "xp", "material", "herb", "ticket", "fate"]
const RULE_VERSION = "v0.3.0"

static func ok(data: Variant = null) -> Dictionary:
	return {"ok": true, "error": "", "data": data}
static func fail(message: String) -> Dictionary:
	return {"ok": false, "error": message, "data": null}
static func config() -> Dictionary:
	return GameData.economy("ECONOMY")
static func empty_resources() -> Dictionary:
	return {"stone": 0, "xp": 0, "material": 0, "herb": 0, "ticket": 0, "fate": 0}
static var _extension_cache: Dictionary = {}
static func extension_rules() -> Dictionary:
	if _extension_cache.is_empty(): _extension_cache = GameData.normalize(JSON.parse_string(FileAccess.get_file_as_string("res://data/godot-rules.json")))
	return _extension_cache
static func ensure_extensions(s: Dictionary) -> void:
	if not s.has("fourStarPity"): s.fourStarPity = 0
	if not s.has("idleMissions"): s.idleMissions = {"active": [], "claimed": []}
	if not s.has("shopLedger"): s.shopLedger = {}
	if not s.has("characterChallenges"): s.characterChallenges = {"active": null, "claimed": []}
	if not s.has("claimedMockReceipts"): s.claimedMockReceipts = []
	if not s.has("expandedPlots"): s.expandedPlots = []
	if not s.has("checkIn"): s.checkIn = {"claimedDays": [], "total": 0}
	if not s.has("claimedMail"): s.claimedMail = []
	if not s.has("claimedActivities"): s.claimedActivities = []
	load("res://scripts/game_equipment.gd").ensure_state(s)
	load("res://scripts/game_community.gd").ensure_state(s)
	load("res://scripts/game_progression.gd").ensure_state(s)
	load("res://scripts/game_activities.gd").ensure_state(s)
	load("res://scripts/game_framework.gd").ensure(s)
static func get_all_plots() -> Array:
	return GameData.economy("PLOTS").duplicate(true) + extension_rules().expansionPlots.duplicate(true)
static func get_building_types() -> Array:
	var types: Array = GameData.economy("BUILDING_TYPES").duplicate(true) + extension_rules().buildingTypes.duplicate(true)
	var limits: Dictionary = GameFramework.rules().productionBuildingLimits
	for def in types:
		def.duration = 0
		if limits.has(def.id):
			def.max = limits[def.id]
			def.description = "%s；可逐座安排长期计划，最多%d座。" % [str(def.description).replace("最多建设两座，",""),int(def.max)]
	return types
static func get_recipes() -> Array:
	return GameData.economy("RECIPES").duplicate(true) + extension_rules().recipes.duplicate(true)
static func warehouse_capacity(s: Dictionary, item: bool = false) -> int:
	if s.has("framework"): return 1000000
	var value = int(config().itemWarehouseCapacity if item else config().warehouseCapacity)
	for b in s.buildings:
		if b.type == "warehouse" and not b.get("pendingPlacement", false): value += (int(b.level) - (1 if b.readyAt else 0)) * (50 if item else 2000)
	return value
static func _has_num(values: Array, number: int) -> bool:
	for value in values:
		if int(value) == number: return true
	return false
static func plot_unlocked(s: Dictionary, id: String) -> bool:
	var plot = GameData.named(get_all_plots(), id)
	return not plot.is_empty() and _has_num(s.unlockedRegions, int(plot.region)) and (not plot.get("expansion", false) or id in s.get("expandedPlots", []))
static func expansion_info(s: Dictionary, id: String) -> Dictionary:
	var plot = GameData.named(extension_rules().expansionPlots, id)
	var reason = ""
	if plot.is_empty(): reason = "此地块无需扩建"
	elif not _has_num(s.unlockedRegions, int(plot.region)): reason = "先融入章节核心开放此区域"
	elif id in s.get("expandedPlots", []): reason = "地块已经扩建"
	elif not can_afford(s, plot.cost): reason = "扩建资源不足"
	return {"ok": reason.is_empty(), "reason": reason, "cost": plot.get("cost", {})}
static func create_state(now_ms: int = -1) -> Dictionary:
	if now_ms < 0: now_ms = GameData.now_ms()
	var s: Dictionary = GameData.all().initialState.duplicate(true)
	s.createdAt = now_ms
	s.lastTime = now_ms
	s.randomStreams = initial_random_streams(now_ms)
	s.daily = fresh_daily(now_ms)
	ensure_extensions(s)
	return s
static func demo_state(preset: String, now_ms: int = -1) -> Dictionary:
	if now_ms < 0: now_ms = GameData.now_ms()
	if not GameData.all().demoStates.has(preset): return {}
	var s: Dictionary = GameData.all().demoStates[preset].duplicate(true)
	s.createdAt = now_ms
	s.lastTime = now_ms
	s.daily = fresh_daily(now_ms)
	s.randomStreams = initial_random_streams(now_ms)
	ensure_extensions(s)
	if preset != "new":
		var level = 5 if preset == "roster" else 11 if preset == "expedition-project" else 3
		for def in GameData.content("CHARACTERS"):
			if s.owned.has(def.id): continue
			grant(s, def.id)
			var c: Dictionary = s.owned[def.id]
			c.level = level
			c.treasure = 0 if preset == "estate-initial" else 1
			for n in range(1, level):
				var cost = upgrade_cost(n)
				c.spent.stone += cost.stone
				c.spent.xp += cost.xp
			s.branchUnlocks.append(def.id)
	# Deliberate isolated review assets. This path is never invoked by normal
	# create_state/migration, and resets regenerate a fresh sandbox only.
	if preset in ["roster", "estate-complete", "expedition-project"]:
		var gear = load("res://scripts/game_equipment.gd")
		for set_rule in gear.rules().sets:
			for slot_rule in gear.slots():
				for rarity in [3,4,5]:
					gear.grant_drop(s, {"rarity":rarity,"slot":slot_rule.id,"setId":set_rule.id,"sourceId":"isolated-demo:" + preset})
		s.items["relic-essence"] = 600
		s.resources.stone = maxi(int(s.resources.stone), 100000)
	if preset == "estate-complete":
		for plot in extension_rules().expansionPlots: s.expandedPlots.append(plot.id)
		var homes = {"warehouse":"p9","mine":"p12","relicworkshop":"p13"}
		for type in homes:
			s.buildings.append({"id":"demo-" + type,"type":type,"plot":homes[type],"level":1,"readyAt":0,"queue":[],"assigned":null,"progress":0})
	return s
static func initial_random_streams(seed: int) -> Dictionary:
	var base = (seed ^ int(floor(float(seed) / 4294967296.0))) & 0xffffffff
	return {"summon": maxi(1, (base ^ 0x9e3779b9) & 0xffffffff), "battle": maxi(1, (base ^ 0x85ebca6b) & 0xffffffff), "expedition": maxi(1, (base ^ 0xc2b2ae35) & 0xffffffff)}
static func advance_random(seed: int) -> int:
	var n = seed & 0xffffffff
	if n == 0: n = 1
	n = (n ^ (n << 13)) & 0xffffffff
	n = (n ^ (n >> 17)) & 0xffffffff
	n = (n ^ (n << 5)) & 0xffffffff
	return n
static func next_random(s: Dictionary, stream: String) -> float:
	s.randomStreams[stream] = advance_random(int(s.randomStreams[stream]))
	return float(s.randomStreams[stream]) / 4294967296.0
static func natural_day(now: int) -> String:
	return load("res://scripts/game_framework.gd").day(now)
static func fresh_daily(now: int) -> Dictionary:
	return {"day": natural_day(now), "progress": {"estate": 0, "battle": 0, "cultivation": 0}, "claimed": []}
static func sync_daily(s: Dictionary, now: int = -1) -> Dictionary:
	if now < 0: now = int(s.lastTime)
	var day = natural_day(maxi(now, int(s.lastTime)))
	if day > s.daily.day: s.daily = fresh_daily(maxi(now, int(s.lastTime)))
	return s.daily
static func record_daily(s: Dictionary, id: String) -> void:
	var daily = sync_daily(s)
	daily.progress[id] = mini(999999, int(daily.progress[id]) + 1)
## Build-level test switch; never fills or rewrites the player's saved wallet.
static func free_currency() -> bool:
	return bool(ProjectSettings.get_setting("testing/free_currency", false)) and not OS.get_cmdline_user_args().has("--balanced-economy")
static func zero_cost(cost: Dictionary) -> Dictionary:
	var result: Dictionary = cost.duplicate(true)
	for key in result: result[key] = 0
	return result
static func charged_cost(cost: Dictionary) -> Dictionary:
	return zero_cost(cost) if free_currency() else cost.duplicate(true)
static func can_afford(s: Dictionary, cost: Dictionary) -> bool:
	if free_currency(): return true
	for key in RESOURCE_KEYS:
		if s.resources[key] < cost.get(key, 0): return false
	return true
static func refund_room(s: Dictionary, cost: Dictionary) -> bool:
	for key in RESOURCE_KEYS:
		if s.resources[key] + cost.get(key, 0) > config().resourceCaps[key]: return false
	return true
static func pay(s: Dictionary, cost: Dictionary) -> void:
	if free_currency(): return
	for key in RESOURCE_KEYS: s.resources[key] -= cost.get(key, 0)
static func gain(s: Dictionary, reward: Dictionary) -> void:
	for key in RESOURCE_KEYS: s.resources[key] = mini(int(config().resourceCaps[key]), int(s.resources[key]) + int(reward.get(key, 0)))
static func grant(s: Dictionary, id: String) -> void:
	if not s.owned.has(id): s.owned[id] = {"level": 1, "branch": "A", "treasure": 0, "spent": {"stone": 0, "xp": 0}}
static func building(s: Dictionary, id: String) -> Dictionary:
	return GameData.named(s.buildings, id)
static func spec(type: String) -> Dictionary:
	return GameData.named(get_building_types(), type)
static func upgrade_cost(level: int) -> Dictionary:
	return {"stone": 25 + level * 20, "xp": 20 + level * 15}
static func treasure_cost(tier: int) -> Dictionary:
	return {"stone": 80 + tier * 80, "material": 20 + tier * 15}
static func building_upgrade_cost(level: int) -> Dictionary:
	return {"stone": 80 * level, "material": 16 * level}
static func thunder_repair_cost(tier: int) -> Dictionary:
	return {"stone": 80 + tier * 80, "material": int(ceil((20 + tier * 15) / 2.0)), "herb": 20 + tier * 15}
static func recorded_repair_cost(version: String, tier: int) -> Variant:
	return thunder_repair_cost(tier) if version in ["v0.2.0", "v0.3.0"] else null
static func production_bonus(_s: Dictionary, b: Dictionary) -> Dictionary:
	var plot = GameData.named(get_all_plots(), b.plot)
	var nourishment = 0.2 if b.type == "farm" and plot.get("nourished", false) else 0.0
	var specialist = 0.0
	if b.assigned: specialist = 0.15 if b.assigned in spec(b.type).specialist else 0.05
	return {"nourishment": nourishment, "specialist": specialist, "multiplier": 1.0 + nourishment + specialist}
static func source_inventory(s: Dictionary, id: String) -> Dictionary:
	if not s.warehouse.sources.has(id): s.warehouse.sources[id] = {"resources": empty_resources(), "items": {}, "repairs": []}
	return s.warehouse.sources[id]
static func accept_output(s: Dictionary, b: Dictionary, job: Dictionary) -> bool:
	var output: Dictionary = job.output
	var source = source_inventory(s, b.id)
	if output.has("resource"):
		if s.warehouse.resources[output.resource] + output.count > warehouse_capacity(s): return false
		s.warehouse.resources[output.resource] += output.count
		source.resources[output.resource] += output.count
	elif output.has("item"):
		if s.warehouse.items.get(output.item, 0) + output.count > warehouse_capacity(s, true): return false
		s.warehouse.items[output.item] = s.warehouse.items.get(output.item, 0) + output.count
		source.items[output.item] = source.items.get(output.item, 0) + output.count
	else:
		if s.warehouse.repairs.size() >= warehouse_capacity(s, true): return false
		var repair = {"id": output.repair, "tier": output.tier, "jobId": job.id}
		s.warehouse.repairs.append(repair)
		source.repairs.append(repair.duplicate(true))
	return true
static func advance(s: Dictionary, now: int = -1) -> Dictionary:
	if now < 0: now = GameData.now_ms()
	if now > 8640000000000000: return fail("时钟无效")
	if s.has("framework"):
		var result: Dictionary = load("res://scripts/game_estate_production.gd").advance(s,now)
		if result.ok: load("res://scripts/game_challenges.gd").sync(s,maxi(now,int(s.lastTime)))
		return result
	var from = int(s.lastTime)
	sync_daily(s, maxi(now, from))
	var resources = empty_resources()
	var items = {}
	if now < from:
		s.clockWarnings += 1
		return ok({"elapsedMs": 0, "capped": false, "backwards": true, "resources": resources, "items": items})
	var elapsed = mini(now - from, int(config().offlineCapMs))
	var end = from + elapsed
	var excess = now - end
	for b in s.buildings:
		if b.get("pendingPlacement", false):
			if b.readyAt: b.readyAt += now - from
			for job in b.queue:
				job.startedAt += now - from
				job.readyAt += now - from
			continue
		var start = maxi(from, int(b.readyAt) if b.readyAt else from)
		var active = maxi(0, end - start)
		if b.readyAt and b.readyAt <= now: b.readyAt = 0
		if extension_rules().passiveRates.has(b.type):
			var rate: Dictionary = extension_rules().passiveRates[b.type]
			var key = rate.resource
			b.progress += (active / 60000.0) * rate.perMinute * b.level * production_bonus(s, b).multiplier
			var output = int(floor(b.progress + 0.000000001))
			b.progress = maxf(0.0, b.progress - output)
			var accepted = mini(output, int(warehouse_capacity(s) - s.warehouse.resources[key]))
			s.warehouse.resources[key] += accepted
			source_inventory(s, b.id).resources[key] += accepted
			resources[key] += accepted
		while not b.queue.is_empty() and b.queue[0].readyAt <= end:
			var job: Dictionary = b.queue[0]
			if not accept_output(s, b, job): break
			if job.output.has("item"): items[job.output.item] = items.get(job.output.item, 0) + job.output.count
			elif job.output.has("resource"): resources[job.output.resource] += job.output.count
			b.queue.pop_front()
		if excess:
			for job in b.queue:
				if job.readyAt > end:
					job.startedAt += excess
					job.readyAt += excess
	s.lastTime = now
	var manager: Dictionary = load("res://scripts/game_progression.gd").advance(s, now)
	if not manager.ok: return manager
	return ok({"elapsedMs": elapsed, "capped": excess > 0, "backwards": false, "resources": resources, "items": items, "manager": manager.data})
static func settle_production(s: Dictionary, now: int = -1) -> Dictionary:
	return advance(s, now)

## The public command surface rolls back even when called without GameStore.
static func command(s: Dictionary, name: String, args: Dictionary = {}, now: int = -1) -> Dictionary:
	if now < 0: now = GameData.now_ms()
	var draft = s.duplicate(true)
	ensure_extensions(draft)
	var elapsed = advance(draft, now)
	if not elapsed.ok: return elapsed
	var result = elapsed if name in ["advance", "settleProduction"] else _command(draft, name, args, maxi(now, int(draft.lastTime)))
	if result.ok:
		load("res://scripts/game_framework.gd").ensure(draft)
		load("res://scripts/game_activities.gd").record_consumption(draft, s, name, maxi(now, int(draft.lastTime)))
		var activity_error: String=validate_state(draft)
		if not activity_error.is_empty(): return fail(activity_error)
		s.clear()
		s.merge(draft, true)
	return result
static func _command(s: Dictionary, name: String, a: Dictionary, now: int) -> Dictionary:
	if load("res://scripts/game_framework.gd").handles(name): return load("res://scripts/game_framework.gd").command(s,name,a,now)
	if name == "queueRecipe": return load("res://scripts/game_framework.gd").command(s,"estatePlan",{"id":a.get("id",""),"recipe":a.get("recipeId","")},now)
	if name == "assign": return load("res://scripts/game_framework.gd").command(s,"estateHost",{"id":a.get("id",""),"hero":a.get("characterId","") if a.get("characterId") != null else ""},now)
	if name == "setTeam" and load("res://scripts/game_framework.gd").locked(s): return fail("战斗快照已锁定，请先结束战斗")
	if name == "progAcquire" and a.get("family") == "pets": return fail("灵兽改为随机召唤，请使用灵兽召唤入口")
	if name == "progTrain" and a.get("family") == "pets": return load("res://scripts/game_framework.gd").command(s,"fwPetTrain",a,now)
	if load("res://scripts/game_progression.gd").handles(name): return load("res://scripts/game_progression.gd").command(s, name, a, now)
	if load("res://scripts/game_activities.gd").handles(name): return load("res://scripts/game_activities.gd").command(s, name, a, now)
	if name == "settleProgressionTrial": return _settle_progression_trial(s, a.get("battle", {}))
	if name.begins_with("guild"): return load("res://scripts/game_community.gd").command(s,name,a)
	var timed = ["advance", "settleProduction", "build", "upgradeBuilding", "accelerateBuilding", "moveBuilding", "assign", "queueRecipe", "cancelQueue", "harvestBuilding", "harvest", "repairTreasure", "integrateCore", "researchMethod", "submitThunderStage", "chooseThunderDirection", "queueThunderRepair", "claimDailyTask", "startMaterialSweep", "claimMaterialSweep", "expandPlot", "claimCheckIn", "claimMail", "claimActivity", "startIdleMission", "claimIdleMission", "buyShopItem", "useItem", "prepareCharacterChallenge", "settleCharacterChallenge", "abandonCharacterChallenge", "redeemMockReceipt"]
	if name in timed:
		var elapsed = advance(s, now)
		if not elapsed.ok or name in ["advance", "settleProduction"]: return elapsed
		now = maxi(now, int(s.lastTime))
	var id = str(a.get("id", ""))
	match name:
		"expandPlot", "claimCheckIn", "claimMail", "claimActivity": return _extension_command(s, name, a, now)
		"startIdleMission", "claimIdleMission", "buyShopItem", "useItem", "prepareCharacterChallenge", "settleCharacterChallenge", "abandonCharacterChallenge", "redeemMockReceipt": return _content_command(s, name, a, now)
		"summon": return _summon(s, int(a.get("count", 1)), str(a.get("txid", "draw-%d" % (s.drawHistory.size() + 1))), a.get("rng", Callable()))
		"redeem", "upgradeCharacter", "resetCharacter", "switchBranch", "repairTreasure": return _character_command(s, name, id, a)
		"setTeam":
			var ids = a.get("ids", a.get("team", []))
			if not ids is Array or ids.is_empty() or ids.size() > s.slots: return fail("当前开放%d个位置" % int(s.slots))
			var seen = {}
			for member in ids:
				if seen.has(member) or not s.owned.has(member): return fail("不能重复上阵或使用未结缘角色")
				seen[member] = true
			s.team = ids.duplicate()
			return ok(s.team)
		"build", "upgradeBuilding", "accelerateBuilding", "moveBuilding", "assign", "queueRecipe", "cancelQueue", "queueThunderRepair": return _building_command(s, name, a, now)
		"harvestBuilding": return _harvest_building(s, id)
		"harvest": return _harvest(s)
		"settleVictory": return _settle_victory(s, str(a.get("battleId", "")), int(a.get("stageId", 0)))
		"chooseGift":
			if not s.choicePending or s.giftChosen: return fail("没有待领取的结缘自选")
			if not id in GameData.economy("GIFT_CHOICES"): return fail("该角色不在结缘自选内")
			if s.owned.has(id): gain(s, {"fate": config().duplicateDivine if GameData.character(id).rarity == "divine" else config().duplicateImmortal})
			grant(s, id)
			s.choicePending = false
			s.giftChosen = id
			if s.team.size() < s.slots and not id in s.team: s.team.append(id)
			return ok(id)
		"integrateCore": return _integrate_core(s, id)
		"claimTask", "claimDailyTask": return _claim_task(s, id, name == "claimDailyTask")
		"researchMethod", "selectMethod", "selectPill", "consumePill", "setWishlist": return _selection_command(s, name, a.get("id"))
		"saveTeamPreset", "applyTeamPreset": return _preset_command(s, name, a)
		"beginThunderProject", "submitThunderStage", "chooseThunderDirection": return _project_command(s, name, a)
		"startMaterialSweep", "claimMaterialSweep": return _sweep_command(s, name, a)
		"prepareMainBattle": return _prepare_main(s, int(a.get("stageId", 0)), a.get("options", {}))
		"settleMainBattle": return _settle_main(s, a.get("battle", {}))
		"abandonMainBattle":
			var ticket = s.mainBattle
			if ticket and not ticket.id in s.settledBattles: s.settledBattles.append(ticket.id)
			s.mainBattle = null
			return ok({"abandoned": ticket != null, "consumedPill": ticket.pill if ticket else null})
		"settings", "setSetting":
			var key = str(a.get("key", ""))
			var value = a.get("value")
			if key == "speed":
				if not value in [1, 2, 3]: return fail("速度无效")
			elif not key in ["sound", "music", "simplified", "tutorialSkipped"] or not value is bool: return fail("设置无效")
			s.settings[key] = value
			return ok(value)
		"equipArtifact", "unequipArtifact", "lockArtifact", "favoriteArtifact", "enhanceArtifact", "salvageArtifacts", "equipBestArtifacts":
			return load("res://scripts/game_equipment.gd").command(s, name, a)
		"startExpedition", "chooseBoon", "prepareExpeditionBattle", "settleExpeditionBattle", "closeExpedition":
			if name == "startExpedition" and s.get("characterChallenges", {}).get("active"): return fail("请先结束当前万仙试炼")
			var route = s.expeditions.active.routeId if s.expeditions.active else ""
			var run_id = s.expeditions.active.id if s.expeditions.active else ""
			var result = load("res://scripts/game_expedition.gd").command(s, name, a, now)
			if result.ok and name == "closeExpedition" and result.data.get("complete", false) and not result.data.get("duplicate", false):
				var drops = load("res://scripts/game_equipment.gd").reward_drops(s, "route:" + run_id, {"sourceId": run_id, "stageId": 8 if route == "danfire" else 12}, 2)
				if not drops.ok: return drops
				result.data.equipment = drops.data
			return result
	return fail("未知操作：" + name)

static func gacha_config() -> Dictionary:
	return extension_rules().gacha
static func _summon(s: Dictionary, count: int, txid: String, rng: Callable = Callable()) -> Dictionary:
	for previous in s.drawHistory:
		if previous.id == txid: return ok(previous.results.duplicate(true))
	if not count in [1, 10]: return fail("只支持单抽或十连")
	if not can_afford(s, {"ticket": count}): return fail("召请符不足，十连整体不执行")
	if txid.is_empty() or txid.length() > 200: return fail("召请交易ID无效")
	var rules = gacha_config()
	var results = []
	var simulated = s.owned.duplicate(true)
	var selected_pool: String = str(s.framework.gacha.selected)
	var limited: bool = selected_pool != "standard"
	var pity = int(s.framework.gacha.limitedPity) if limited else int(s.pity)
	var four_pity = int(s.framework.gacha.limitedFourPity) if limited else int(s.get("fourStarPity", 0))
	for i in range(count):
		var chance = rng.call() if rng.is_valid() else next_random(s, "summon")
		if not (chance is int or chance is float) or not is_finite(float(chance)) or chance < 0 or chance >= 1: return fail("随机源必须返回[0,1)")
		var rarity = "mortal"
		if pity >= int(rules.fiveStarPity) - 1 or chance < rules.fiveStarChance: rarity = "divine"
		elif four_pity >= int(rules.fourStarPity) - 1 or chance < rules.fiveStarChance + rules.fourStarChance: rarity = "immortal"
		var pool = []
		for c in GameData.content("CHARACTERS"):
			if c.rarity == rarity: pool.append(c)
		if limited and rarity == "divine": pool = [GameData.character(load("res://scripts/game_framework.gd").featured(selected_pool))]
		if pool.is_empty(): return fail("当前星级卡池尚未加载完整")
		var pick = rng.call() if rng.is_valid() else next_random(s, "summon")
		if not (pick is int or pick is float) or not is_finite(float(pick)) or pick < 0 or pick >= 1: return fail("随机源必须返回[0,1)")
		var c: Dictionary = pool[int(floor(pick * pool.size()))]
		var duplicate = simulated.has(c.id)
		simulated[c.id] = true
		results.append({"id": c.id, "rarity": rarity, "duplicate": duplicate, "fate": 1 + (int(rules.duplicateExtra[rarity]) if duplicate else 0)})
		pity = 0 if rarity == "divine" else pity + 1
		four_pity = 0 if rarity in ["divine", "immortal"] else four_pity + 1
	pay(s, {"ticket": count})
	if limited:
		s.framework.gacha.limitedPity = pity
		s.framework.gacha.limitedFourPity = four_pity
	else:
		s.pity = pity
		s.fourStarPity = four_pity
	for r in results:
		if r.duplicate: s.framework.petShards["god:"+str(r.id)] = int(s.framework.petShards.get("god:"+str(r.id),0))+1
		grant(s, r.id)
		gain(s, {"fate": r.fate})
	s.drawHistory.append({"id": txid, "results": results.duplicate(true), "at": s.lastTime, "ruleVersion": rules.ruleVersion,"pool":selected_pool})
	return ok(results)
static func _character_command(s: Dictionary, name: String, id: String, a: Dictionary) -> Dictionary:
	if GameData.character(id).is_empty(): return fail("未知角色")
	if name == "redeem":
		if s.owned.has(id): return fail("已结缘，无需重复兑换")
		var cost = {"fate": gacha_config().redeemCost[GameData.character(id).rarity]}
		if not can_afford(s, cost): return fail("道缘不足")
		pay(s, cost)
		grant(s, id)
		return ok(id)
	if not s.owned.has(id): return fail("尚未结缘")
	var c: Dictionary = s.owned[id]
	match name:
		"upgradeCharacter":
			if c.level >= config().maxLevel: return fail("已达20级上限")
			var cost = upgrade_cost(int(c.level))
			if not can_afford(s, cost): return fail("资源不足，请挑战已通关节点获得材料")
			pay(s, cost)
			var paid: Dictionary = charged_cost(cost)
			c.spent.stone += paid.stone
			c.spent.xp += paid.xp
			c.level += 1
			if c.level >= config().branchLevel and not id in s.branchUnlocks: s.branchUnlocks.append(id)
			s.stats.upgrades += 1
			record_daily(s, "cultivation")
			return ok(c.level)
		"resetCharacter":
			var refund: Dictionary = c.spent.duplicate(true)
			if not refund_room(s, refund): return fail("背包容量不足以完整退还原投入，请先使用部分资源")
			gain(s, refund)
			if c.level >= config().branchLevel and not id in s.branchUnlocks: s.branchUnlocks.append(id)
			c.level = 1
			c.spent = {"stone": 0, "xp": 0}
			return ok(refund)
		"switchBranch":
			if c.level < config().branchLevel and not id in s.branchUnlocks: return fail("3级开放神通分支；已解锁后重置保留")
			var branch = a.get("branch", "")
			if not branch in ["A", "B"]: return fail("分支无效")
			if not id in s.branchUnlocks: s.branchUnlocks.append(id)
			if c.branch != branch: record_daily(s, "cultivation")
			c.branch = branch
			return ok(branch)
		"repairTreasure":
			if has_pending_repair(s, id): return fail("该角色已有待完成或待领取的修复工序")
			if c.treasure >= 3: return fail("灵宝已完成三段修复")
			if not has_ready_building(s, "forge"): return fail("先建成炼器坊")
			if c.treasure >= 1 and not "furnace" in s.integratedCores: return fail("第二、三段修复需要融入炉心")
			var cost = treasure_cost(int(c.treasure))
			if not can_afford(s, cost): return fail("资源不足")
			pay(s, cost)
			c.treasure += 1
			record_daily(s, "cultivation")
			return ok(c.treasure)
	return fail("未知培养操作")

static func has_ready_building(s: Dictionary, type: String) -> bool:
	for b in s.buildings:
		if b.type == type and not b.readyAt and not b.get("pendingPlacement", false): return true
	return false
static func has_pending_repair(s: Dictionary, id: String) -> bool:
	for b in s.buildings:
		for q in b.queue:
			if q.output.get("repair") == id: return true
	for r in s.warehouse.repairs:
		if r.id == id: return true
	return false
static func check_plot(s: Dictionary, plot_id: String, type: String, moving: String = "") -> String:
	var p = GameData.named(get_all_plots(), plot_id)
	if p.is_empty(): return "地块不存在"
	if not _has_num(s.unlockedRegions, int(p.region)): return "区域尚未修复"
	if not plot_unlocked(s, plot_id): return "先扩建此地块"
	if p.has("fixed"): return "固定地标不可占用"
	for b in s.buildings:
		if b.plot == plot_id and b.id != moving: return "地块已有设施"
	if not _has_num(s.unlockedRegions, int(spec(type).region)): return "先融入主线灵脉核心开放设施"
	return ""
static func _building_command(s: Dictionary, name: String, a: Dictionary, now: int) -> Dictionary:
	var id = str(a.get("buildingId", a.get("id", ""))) if name == "queueThunderRepair" else str(a.get("id", ""))
	var b = building(s, id)
	if name == "build":
		var type = str(a.get("type", ""))
		var plot = str(a.get("plot", ""))
		var def = spec(type)
		if def.is_empty(): return fail("未知设施")
		if def.get("fixed", false): return fail("地标已经存在")
		var error = check_plot(s, plot, type)
		if error: return fail(error)
		var count = 0
		for other in s.buildings:
			if other.type == type: count += 1
		if count >= def.max: return fail("已达到此类设施数量上限")
		if not can_afford(s, def.cost): return fail("资源不足，请挑战已通关节点获得材料")
		pay(s, def.cost)
		var serial = int(s.stats.builds) + 1
		while not building(s, "%s-%d" % [type, serial]).is_empty(): serial += 1
		b = {"id": "%s-%d" % [type, serial], "type": type, "plot": plot, "level": 1, "readyAt": 0, "queue": [], "assigned": null, "progress": 0.0}
		s.buildings.append(b)
		load("res://scripts/game_estate_production.gd").ensure(s)
		s.stats.builds += 1
		record_daily(s, "estate")
		return ok(b)
	if b.is_empty(): return fail("设施不存在")
	match name:
		"upgradeBuilding":
			if b.type == "hall": return fail("万仙殿由核心升格")
			if b.get("pendingPlacement", false): return fail("设施尚在待安置区，请先选择合法地块")
			if b.readyAt: return fail("设施施工中")
			if b.level >= 3: return fail("设施已达3级")
			if not b.queue.is_empty(): return fail("请先完成或取消生产队列再升级")
			var cost = building_upgrade_cost(int(b.level))
			if not can_afford(s, cost): return fail("资源不足")
			pay(s, cost)
			b.level += 1
			b.readyAt = 0
			return ok(b.level)
		"accelerateBuilding":
			if b.get("pendingPlacement", false): return fail("设施尚在待安置区，请先选择合法地块")
			if b.readyAt <= now: return fail("无需加速")
			var cost = int(ceil((b.readyAt - now) / 10000.0)) * 2
			if not can_afford(s, {"material": cost}): return fail("灵材不足")
			pay(s, {"material": cost})
			b.readyAt = 0
			return ok(cost)
		"moveBuilding":
			if spec(b.type).get("fixed", false): return fail("固定地标不可搬动")
			var plot = str(a.get("plot", ""))
			var error = check_plot(s, plot, b.type, id)
			if error: return fail(error)
			b.plot = plot
			b.erase("pendingPlacement")
			return ok(b)
		"assign":
			if b.type == "hall": return fail("地标无需主持")
			var character_id = a.get("characterId")
			if character_id != null:
				if not s.owned.has(character_id): return fail("角色尚未结缘")
				for other in s.buildings:
					if other.id != id and other.assigned == character_id: return fail("同一角色只能主持一处设施")
			b.assigned = character_id
			return ok(b)
		"queueRecipe":
			var recipe_id = str(a.get("recipeId", ""))
			var usable = can_queue_recipe(s, id, recipe_id)
			if not usable.ok: return fail(usable.reason)
			var r = GameData.named(get_recipes(), recipe_id)
			pay(s, r.cost)
			var paid: Dictionary = charged_cost(r.cost)
			if recipe_id == "thunder-component":
				for key in paid: s.thunderProject.invested[key] = s.thunderProject.invested.get(key, 0) + paid[key]
			var start = maxi(now, int(b.queue[-1].readyAt) if not b.queue.is_empty() else now)
			var duration = int(ceil(r.duration / (production_bonus(s, b).multiplier * (1.0 + (b.level - 1) * 0.1))))
			var serial = b.queue.size()
			var job_id = "%s-%d-%d" % [id, now, serial]
			while not GameData.named(b.queue, job_id).is_empty():
				serial += 1
				job_id = "%s-%d-%d" % [id, now, serial]
			var job = {"id": job_id, "recipe": recipe_id, "startedAt": start, "readyAt": start + duration, "cost": r.cost.duplicate(true), "output": r.output.duplicate(true), "duration": duration, "ruleVersion": "godot-economy-1" if not GameData.named(extension_rules().recipes, recipe_id).is_empty() else RULE_VERSION}
			b.queue.append(job)
			job.paidCost = paid
			return ok(job)
		"cancelQueue":
			var job_id = str(a.get("jobId", ""))
			var index = -1
			for n in range(b.queue.size()):
				if b.queue[n].id == job_id: index = n
			if index < 0: return fail("该生产已经完成或不存在")
			var job: Dictionary = b.queue[index]
			if job.readyAt <= now: return fail("已完成的产物不能取消退料")
			var refund: Dictionary = job.get("paidCost", job.cost)
			if not refund_room(s, refund): return fail("背包容量不足以完整退还原投入，请先使用部分资源")
			gain(s, refund)
			if job.recipe == "thunder-component":
				for key in refund: s.thunderProject.invested[key] = maxi(0, int(s.thunderProject.invested.get(key, 0) - refund[key]))
			b.queue.remove_at(index)
			var start = int(b.queue[index - 1].readyAt) if index > 0 else now
			for n in range(index, b.queue.size()):
				var q: Dictionary = b.queue[n]
				var duration = int(q.readyAt - q.startedAt)
				q.startedAt = start
				q.readyAt = start + duration
				start = int(q.readyAt)
			return ok(refund)
		"queueThunderRepair":
			if s.thunderProject.direction != "forge" or s.thunderProject.stage != "complete": return fail("雷淬工坊用途尚未启用")
			if b.type != "forge" or b.get("pendingPlacement", false) or b.readyAt or b.queue.size() >= 20: return fail("需要已建成且队列有空位的炼器坊")
			var cid = str(a.get("id", ""))
			var c: Dictionary = s.owned.get(cid, {})
			if c.is_empty() or c.treasure >= 3 or has_pending_repair(s, cid): return fail("角色不存在、已修满或已有修复工序")
			if c.treasure >= 1 and not "furnace" in s.integratedCores: return fail("第二、三段修复需要融入炉心")
			var cost = thunder_repair_cost(int(c.treasure))
			if not can_afford(s, cost): return fail("资源不足")
			pay(s, cost)
			var duration = int(ceil(45000.0 / (production_bonus(s, b).multiplier * (1.0 + (b.level - 1) * 0.1))))
			var start = maxi(now, int(b.queue[-1].readyAt) if not b.queue.is_empty() else now)
			var job = {"id": "%s-%d-repair-%s" % [b.id, now, cid], "recipe": "thunder-repair", "startedAt": start, "readyAt": start + duration, "duration": duration, "cost": cost, "output": {"repair": cid, "tier": c.treasure + 1, "count": 1}, "ruleVersion": RULE_VERSION}
			job.paidCost = charged_cost(cost)
			b.queue.append(job)
			return ok(job)
	return fail("未知设施操作")
static func _harvest_building(s: Dictionary, id: String) -> Dictionary:
	if not s.warehouse.sources.has(id): return fail("此设施没有待领取产物")
	var source: Dictionary = s.warehouse.sources[id]
	var resources = empty_resources()
	var items = {}
	var total = 0
	# Validate every repair before any transfer, including hand-edited drafts.
	for repair in source.get("repairs", []):
		if not s.owned.has(repair.id) or s.owned[repair.id].treasure != repair.tier - 1: return fail("修复领取与角色灵宝状态不符")
	for key in RESOURCE_KEYS:
		var amount = mini(int(source.resources[key]), int(config().resourceCaps[key] - s.resources[key]))
		resources[key] = amount
		s.resources[key] += amount
		source.resources[key] -= amount
		s.warehouse.resources[key] -= amount
		total += amount
	for key in source.items:
		var amount = mini(int(source.items[key]), 999 - int(s.items.get(key, 0)))
		s.items[key] = s.items.get(key, 0) + amount
		source.items[key] -= amount
		s.warehouse.items[key] -= amount
		items[key] = amount
		total += amount
	for repair in source.get("repairs", []):
		s.owned[repair.id].treasure = repair.tier
		record_daily(s, "cultivation")
		for index in range(s.warehouse.repairs.size() - 1, -1, -1):
			if s.warehouse.repairs[index].jobId == repair.jobId: s.warehouse.repairs.remove_at(index)
		total += 1
	source.repairs = []
	if total:
		s.stats.harvests += 1
		record_daily(s, "estate")
	return ok({"resources": resources, "items": items, "total": total})
static func _harvest(s: Dictionary) -> Dictionary:
	var resources = empty_resources()
	var items = {}
	var total = 0
	var before = int(s.stats.harvests)
	for id in s.warehouse.sources.keys():
		var result = _harvest_building(s, id)
		if not result.ok: return result
		for key in RESOURCE_KEYS: resources[key] += result.data.resources[key]
		for key in result.data.items: items[key] = items.get(key, 0) + result.data.items[key]
		total += int(result.data.total)
	s.stats.harvests = before + (1 if total else 0)
	return ok({"resources": resources, "items": items, "total": total})
static func stage_reward(stage_id: int, first: bool) -> Dictionary:
	return {"stone": 120 + stage_id * 25 + (200 + stage_id * 25 if first else 0), "xp": 90 + stage_id * 20 + (200 + stage_id * 20 if first else 0), "material": 12 + stage_id * 2 + (20 if first else 0), "herb": 2, "ticket": (5 if stage_id % 4 == 0 else 2) if first else 0, "fate": 0}
static func _stage_error(s: Dictionary, stage_id: int) -> String:
	if stage_id < 1 or stage_id > 12: return "主线节点无效"
	if stage_id != 1 and not _has_num(s.cleared, stage_id - 1): return "请先通关前一节点"
	if stage_id > 4 and not "spring" in s.integratedCores: return "请先回府融入灵脉核心"
	if stage_id > 8 and not "furnace" in s.integratedCores: return "请先回府融入炉心"
	return ""
static func _settle_victory(s: Dictionary, battle_id: String, stage_id: int) -> Dictionary:
	if battle_id.is_empty(): return fail("战斗ID无效")
	if stage_id < 1 or stage_id > 12: return fail("主线节点无效")
	if battle_id in s.settledBattles: return ok({"duplicate": true, "first": false, "reward": empty_resources()})
	var error = _stage_error(s, stage_id)
	if error: return fail(error)
	var first = not _has_num(s.cleared, stage_id)
	var reward = stage_reward(stage_id, first)
	if first:
		s.cleared.append(stage_id)
		if stage_id == 2:
			grant(s, "leizhenzi")
			s.slots = 4
			if s.team.size() < 4: s.team.append("leizhenzi")
		if stage_id == 3:
			s.choicePending = true
			s.slots = 4
		if stage_id % 4 == 0: s.cores.append("spring" if stage_id == 4 else "furnace" if stage_id == 8 else "thunder")
	gain(s, reward)
	s.settledBattles.append(battle_id)
	s.stats.battles += 1
	record_daily(s, "battle")
	return ok({"duplicate": false, "first": first, "reward": reward})
static func _integrate_core(s: Dictionary, id: String) -> Dictionary:
	if not id in s.cores or id in s.integratedCores: return fail("核心不存在或已经融入")
	if id == "furnace" and not "spring" in s.integratedCores: return fail("先融入灵脉核心")
	if id == "thunder" and not "furnace" in s.integratedCores: return fail("先融入炉心")
	if not id in ["spring", "furnace", "thunder"]: return fail("核心无效")
	s.cores.erase(id)
	s.integratedCores.append(id)
	if id == "spring": s.unlockedRegions.append(1)
	if id == "furnace": s.unlockedRegions.append(2)
	var hall = building(s, "hall")
	if not hall.is_empty(): hall.level = 1 + s.integratedCores.size()
	if id == "thunder":
		var spring = building(s, "spring")
		if not spring.is_empty(): spring.level = mini(3, int(spring.level) + 1)
	return ok(id)
static func _claim_task(s: Dictionary, id: String, daily: bool) -> Dictionary:
	if daily:
		var day = sync_daily(s)
		if id in day.claimed: return fail("今日奖励已经领取")
		var task = GameData.named(GameData.economy("DAILY_TASKS"), id)
		if task.is_empty() and id != "summary": return fail("日常任务不存在")
		if task.is_empty():
			for entry in GameData.economy("DAILY_TASKS"):
				if not entry.id in day.claimed: return fail("先领取今日三个目标奖励")
		elif day.progress[task.id] < task.goal: return fail("今日任务条件尚未完成")
		var reward: Dictionary = {"ticket": 1} if task.is_empty() else task.reward.duplicate(true)
		gain(s, reward)
		day.claimed.append(id)
		return ok({"id": "%s:%s" % [day.day, id], "day": day.day, "reward": reward})
	var task = GameData.named(GameData.economy("TASKS"), id)
	if task.is_empty(): return fail("任务不存在")
	if id in s.claimedTasks: return fail("任务已经领取")
	if s.stats[task.stat] < task.goal: return fail("任务条件尚未完成")
	gain(s, task.reward)
	s.claimedTasks.append(id)
	return ok(task.reward)

static func _selection_command(s: Dictionary, name: String, id: Variant) -> Dictionary:
	match name:
		"researchMethod":
			var m = GameData.named(GameData.economy("METHODS"), id)
			if m.is_empty(): return fail("法门不存在")
			if id == "thunderward": return fail("雷泽护持由引雷工程传法用途开放")
			if not has_ready_building(s, "library"): return fail("先建成藏经阁")
			if id in s.methods: return fail("已研究此法门")
			if not can_afford(s, m.cost): return fail("资源不足")
			pay(s, m.cost)
			s.methods.append(id)
			if not s.chosenMethod: s.chosenMethod = id
			return ok(id)
		"selectMethod":
			if id != null and not id in s.methods: return fail("尚未研究此法门")
			if id == "thunderward" and s.thunderProject.direction != "teaching": return fail("雷泽传法当前未启用，不能新装备")
			s.chosenMethod = id
			return ok(id)
		"selectPill":
			if id != null and (not id in ["training", "ward", "heal", "cleanse"] or s.items.get(id, 0) <= 0): return fail("丹药不足")
			s.chosenPill = id
			return ok(id)
		"consumePill":
			id = s.chosenPill
			if id:
				if s.items.get(id, 0) <= 0: return fail("丹药不足")
				s.items[id] -= 1
				if not s.items[id]: s.chosenPill = null
			return ok(id)
		"setWishlist":
			if id != null and GameData.character(str(id)).is_empty(): return fail("未知角色")
			s.wishlist = id
			return ok(wishlist_info(s))
	return fail("未知选择操作")
static func wishlist_info(s: Dictionary) -> Variant:
	if not s.wishlist: return null
	var c = GameData.character(s.wishlist)
	var cost = int(gacha_config().redeemCost[c.rarity])
	return {"id": c.id, "owned": s.owned.has(c.id), "fate": s.resources.fate, "cost": cost, "deficit": maxi(0, cost - int(s.resources.fate)), "probabilityChanged": false, "source": "每次召请获得1道缘，重复仙品额外3、神品额外8；主线首通与事务提供召请符"}
static func _preset_command(s: Dictionary, name: String, a: Dictionary) -> Dictionary:
	var slot = int(a.get("slot", -1))
	if slot < 0 or slot > 2: return fail("预设位置无效")
	if name == "saveTeamPreset":
		var candidate: Dictionary = a.get("preset", {})
		if candidate.is_empty():
			candidate = {"team": [], "method": s.chosenMethod}
			for id in s.team: candidate.team.append({"id": id, "branch": s.owned[id].branch})
		if not candidate.get("team") is Array or candidate.team.is_empty() or candidate.team.size() > 5: return fail("预设编队无效")
		var seen = {}
		for c in candidate.team:
			if not c is Dictionary or GameData.character(str(c.get("id", ""))).is_empty() or seen.has(c.id): return fail("预设编队无效")
			if not c.get("branch") in ["A", "B"]: return fail("预设分支无效")
			seen[c.id] = true
		if candidate.get("method") != null and GameData.named(GameData.economy("METHODS"), candidate.method).is_empty(): return fail("预设法门无效")
		s.teamPresets[slot] = {"team": [], "method": candidate.get("method")}
		for c in candidate.team: s.teamPresets[slot].team.append({"id": c.id, "branch": c.branch})
		return ok(s.teamPresets[slot])
	var issues = preset_issues(s, slot)
	if not issues.is_empty(): return fail("；".join(issues))
	var preset: Dictionary = s.teamPresets[slot]
	s.team = []
	for c in preset.team:
		s.team.append(c.id)
		s.owned[c.id].branch = c.branch
	s.chosenMethod = preset.method
	return ok(preset.duplicate(true))
static func preset_issues(s: Dictionary, slot: int) -> Array:
	if slot < 0 or slot > 2 or not s.teamPresets[slot]: return ["该预设尚未保存"]
	var preset: Dictionary = s.teamPresets[slot]
	var issues = []
	if preset.team.size() > s.slots: issues.append("当前仅开放%d个阵位" % int(s.slots))
	for c in preset.team:
		if not s.owned.has(c.id): issues.append("%s尚未结缘，请替换" % GameData.character(c.id).name)
		elif c.branch == "B" and s.owned[c.id].level < config().branchLevel and not c.id in s.branchUnlocks: issues.append("%s未到3级，不能使用B分支" % GameData.character(c.id).name)
	if preset.method and not preset.method in s.methods: issues.append("预设法门尚未学习")
	if preset.method == "thunderward" and s.thunderProject.direction != "teaching": issues.append("雷泽传法当前未启用")
	return issues
static func is_thunder_project_unlocked(s: Dictionary) -> bool:
	return _has_num(s.cleared, 12) or "thunder" in s.integratedCores
static func _project_command(s: Dictionary, name: String, a: Dictionary) -> Dictionary:
	var p: Dictionary = s.thunderProject
	if not is_thunder_project_unlocked(s): return fail("先首通雷泽蛟君或融入雷泽核心")
	if name == "beginThunderProject":
		if p.stage == "unstarted": p.stage = "survey"
		return ok(p)
	if name == "submitThunderStage":
		var stage = str(a.get("stage", ""))
		if not stage in ["survey", "prepare", "stabilize"]: return fail("工程阶段无效")
		if stage in p.completedStages: return ok({"duplicate": true, "stage": p.stage})
		if stage == "survey":
			if not p.stage in ["unstarted", "survey"]: return fail("当前不是勘定阶段")
			p.stage = "prepare"
		elif stage == "prepare":
			if p.stage != "prepare" or s.items.get("thunder-component", 0) < 1: return fail("先在炼器坊完成并收取引雷构件")
			s.items["thunder-component"] -= 1
			p.stage = "stabilize"
		elif p.stage != "stabilize" or s.expeditions.bossClears.is_empty(): return fail("先完成任一已开放短秘境首领；此前胜利可回认")
		p.completedStages.append(stage)
		return ok({"duplicate": false, "stage": p.stage})
	var direction = a.get("direction")
	if not direction in ["forge", "teaching"]: return fail("工程用途无效")
	if not "stabilize" in p.completedStages: return fail("先完成稳脉并查看成形用途")
	if a.get("battleActive", false) or a.get("options", {}).get("battleActive", false) or s.mainBattle or s.get("characterChallenges", {}).get("active") or (s.expeditions.active and s.expeditions.active.status == "battle"): return fail("请在非战斗时改建")
	for b in s.buildings:
		for q in b.queue:
			if q.recipe in ["thunder-component", "thunder-repair"]: return fail("相关工序尚未结束")
	var first = not "form" in p.completedStages
	p.stage = "complete"
	p.direction = direction
	if first: p.completedStages.append("form")
	if direction == "teaching" and not "thunderward" in s.methods: s.methods.append("thunderward")
	if direction != "teaching" and s.chosenMethod == "thunderward": s.chosenMethod = null
	return ok({"first": first, "direction": direction})
static func available_recipes(s: Dictionary, type: String) -> Array:
	var result = []
	for r in get_recipes():
		if r.building == type and (r.id != "thunder-component" or s.thunderProject.stage == "prepare"): result.append(r)
	return result
static func can_queue_recipe(s: Dictionary, id: String, recipe_id: String) -> Dictionary:
	var b = building(s, id)
	var r = GameData.named(get_recipes(), recipe_id)
	var reason = ""
	if b.is_empty() or r.is_empty() or r.building != b.type: reason = "此设施没有该配方"
	elif GameData.named(available_recipes(s, b.type), recipe_id).is_empty(): reason = "工程阶段尚未开放该配方"
	elif b.get("pendingPlacement", false): reason = "设施待安置，生产已暂停"
	elif b.readyAt: reason = "设施施工中"
	elif b.queue.size() >= 20: reason = "队列最多20项"
	elif recipe_id == "thunder-component":
		if s.items.get(recipe_id, 0) or s.warehouse.items.get(recipe_id, 0): reason = "构件已备妥或正在加工"
		for other in s.buildings:
			for job in other.queue:
				if job.recipe == recipe_id: reason = "构件已备妥或正在加工"
	if not reason and not can_afford(s, r.get("cost", {})): reason = "资源不足"
	return {"ok": reason.is_empty(), "reason": reason, "cost": r.get("cost", {})}
static func get_building_status(s: Dictionary, id: String, now: int = -1) -> Dictionary:
	if now < 0: now = int(s.lastTime)
	var b = building(s, id)
	if b.is_empty(): return {}
	var stock: Dictionary = s.warehouse.sources.get(id, {})
	var pending_count = 0
	if not stock.is_empty():
		for value in stock.resources.values(): pending_count += int(value)
		for value in stock.items.values(): pending_count += int(value)
		pending_count += stock.get("repairs", []).size()
	var passive = extension_rules().passiveRates.has(b.type)
	var key = extension_rules().passiveRates.get(b.type, {}).get("resource", "herb")
	var head: Dictionary = b.queue[0] if not b.queue.is_empty() else {}
	var full = passive and s.warehouse.resources[key] >= warehouse_capacity(s)
	if not head.is_empty():
		var output: Dictionary = head.output
		if output.has("resource"): full = s.warehouse.resources[output.resource] + output.count > warehouse_capacity(s)
		elif output.has("item"): full = s.warehouse.items.get(output.item, 0) + output.count > warehouse_capacity(s, true)
		else: full = s.warehouse.repairs.size() >= warehouse_capacity(s, true)
	var constructing = b.readyAt > 0
	var recipes = available_recipes(s, b.type)
	var missing = head.is_empty() and not recipes.is_empty()
	for r in recipes:
		if can_afford(s, r.cost): missing = false
	var production = "idle"
	if not b.get("pendingPlacement", false) and not constructing:
		if full: production = "storage-full"
		elif not head.is_empty() or passive: production = "producing"
		elif missing: production = "missing-materials"
	return {"construction": "building" if constructing else "ready", "production": production, "pending": pending_count > 0, "pendingCount": pending_count, "progress": clampf((now - head.startedAt) / float(head.duration), 0.0, 1.0) if not head.is_empty() else b.progress, "productionEndsAt": head.get("readyAt")}
static func get_building_statuses(s: Dictionary, now: int = -1) -> Dictionary:
	var result = {}
	for b in s.buildings: result[b.id] = get_building_status(s, b.id, now)
	return result
static func daily_task_status(s: Dictionary, now: int = -1) -> Dictionary:
	if now < 0: now = int(s.lastTime)
	var day = natural_day(maxi(now, int(s.lastTime)))
	var daily: Dictionary = fresh_daily(maxi(now, int(s.lastTime))) if day > s.daily.day else s.daily
	var ready = true
	var tasks = []
	for task in GameData.economy("DAILY_TASKS"):
		var row: Dictionary = task.duplicate(true)
		row.progress = daily.progress[task.id]
		row.complete = row.progress >= task.goal
		row.claimed = task.id in daily.claimed
		tasks.append(row)
		if not row.claimed: ready = false
	return {"day": daily.day, "timezone": "北京时间每日05:00", "summaryClaimed": "summary" in daily.claimed, "summaryReady": ready, "tasks": tasks}
static func _sweep_command(s: Dictionary, name: String, a: Dictionary) -> Dictionary:
	if name == "startMaterialSweep":
		if s.materialSweep: return fail("已有材料扫荡进行中或待领取")
		var stage = int(a.get("stageId", 0))
		if not _has_num(s.cleared, stage) or stage % 4 == 0: return fail("只能扫荡已首通的普通材料节点")
		var start = int(s.lastTime)
		s.materialSweep = {"id": "sweep-%d-%d-%d" % [stage, start, s.settledBattles.size()], "stageId": stage, "startedAt": start, "readyAt": start + 60000, "reward": stage_reward(stage, false), "ruleVersion": RULE_VERSION}
		return ok(s.materialSweep.duplicate(true))
	var sweep = s.materialSweep
	if not sweep: return fail("没有待领取的材料扫荡")
	if s.lastTime < sweep.readyAt: return fail("材料扫荡尚未完成，需要60秒")
	if sweep.id in s.settledBattles: return fail("此扫荡已经结算")
	gain(s, sweep.reward)
	s.settledBattles.append(sweep.id)
	s.stats.battles += 1
	record_daily(s, "battle")
	s.materialSweep = null
	return ok({"duplicate": false, "first": false, "reward": sweep.reward.duplicate(true)})
static func main_battle_compatibility(s: Dictionary) -> Dictionary:
	var compatible = not s.mainBattle or s.mainBattle.ruleVersion == GameData.content("BATTLE_RULE_VERSION")
	return {"compatible": compatible, "message": "" if compatible else "战斗规则已更新，请结束旧挑战后重新准备；已消耗丹药不重复退还"}
static func _prepare_main(s: Dictionary, stage_id: int, options: Dictionary) -> Dictionary:
	if not s.mainBattle and GameFramework.locked(s): return fail("请先结束其他已锁定战斗")
	var error = _stage_error(s, stage_id)
	if error: return fail(error)
	if s.expeditions.active and s.expeditions.active.status == "battle": return fail("请先结束当前秘境战斗")
	if s.get("characterChallenges", {}).get("active"): return fail("请先结束当前万仙试炼")
	if s.get("progression", {}).get("realm", {}).get("pending"): return fail("请先完成当前修行挑战")
	var compatibility = main_battle_compatibility(s)
	if not compatibility.compatible: return fail(compatibility.message)
	if not s.mainBattle:
		if s.team.is_empty() or s.team.size() > s.slots: return fail("队伍无效")
		var seen = {}
		for id in s.team:
			if seen.has(id) or not s.owned.has(id): return fail("队伍无效")
			seen[id] = true
		if s.chosenMethod and not s.chosenMethod in s.methods: return fail("法门尚未研究")
		if s.chosenMethod == "thunderward" and s.thunderProject.direction != "teaching": return fail("雷泽传法当前未启用")
		var id = str(options.get("id", "battle-%d-%d" % [int(s.lastTime), s.settledBattles.size()]))
		if id.is_empty() or id.length() > 140 or id in s.settledBattles: return fail("战斗ID无效或已经结算")
		if options.has("seed") and not _nat(options.seed, 4294967295): return fail("战斗种子无效")
		var pill = s.chosenPill
		if pill and s.items.get(pill, 0) <= 0: return fail("丹药不足")
		var ticket = {"id": id, "stageId": stage_id, "seed": int(options.seed) if options.has("seed") else int(next_random(s, "battle") * 4294967296.0), "createdAt": options.get("now", s.lastTime), "ruleVersion": GameData.content("BATTLE_RULE_VERSION"), "team": [], "method": s.chosenMethod, "pill": pill, "autoOnly": true, "petSupport": load("res://scripts/game_progression.gd").battle_support(s)}
		for cid in s.team:
			var c: Dictionary = s.owned[cid]
			var member = {"id": cid, "level": c.level, "branch": c.branch, "treasure": c.treasure, "branchUnlocked": cid in s.branchUnlocks or c.level >= config().branchLevel}
			var equipment_stats = battle_extras(s, cid)
			if not equipment_stats.is_empty(): member.equipmentStats = equipment_stats.duplicate(true)
			ticket.team.append(member)
		ticket.team = load("res://scripts/game_framework.gd").party(s)
		_selection_command(s, "consumePill", null)
		s.mainBattle = ticket
	var ticket: Dictionary = s.mainBattle
	if ticket.stageId != stage_id: return fail("已有未结束的主线挑战；继续原节点或先结束挑战")
	return ok(_main_request(ticket))

static func battle_extras(s: Dictionary, cid: String) -> Dictionary:
	var extras: Dictionary = load("res://scripts/game_equipment.gd").stats_for(s, cid).duplicate(true)
	var bonus: Dictionary = load("res://scripts/game_progression.gd").combat_bonus(s, cid)
	for key in bonus: extras[key] = float(extras.get(key, 0)) + float(bonus[key])
	if s.has("framework") and cid != GameFramework.LORD:
		for key in ["hpPercent","atkPercent","defPercent"]: extras[key] = float(extras.get(key,0))+int(s.framework.godStars.get(cid,0))*0.03
	return GameData.normalize(extras)

static func _main_request(ticket: Dictionary) -> Dictionary:
	return {"battleId": ticket.id, "stageId": ticket.stageId, "team": ticket.team.duplicate(true), "options": {"battleId": ticket.id, "seed": ticket.seed, "method": ticket.method, "pill": ticket.pill, "ruleVersion": ticket.ruleVersion, "autoOnly": bool(ticket.get("autoOnly", false)), "petSupport": ticket.get("petSupport", {}).duplicate(true)}}

static func _settle_progression_trial(s: Dictionary, battle: Dictionary) -> Dictionary:
	var trial: Variant = s.get("progression", {}).get("realm", {}).get("pending")
	if not trial is Dictionary or trial.is_empty() or battle.get("id") != trial.get("id"): return fail("没有与此战斗对应的修行挑战")
	var request: Dictionary = {"stageId": trial.stageId, "team": trial.team, "options": trial.options}
	var error: String = GameCombat.replay_auto(request, battle)
	if not error.is_empty(): return fail(error)
	return load("res://scripts/game_progression.gd").settle_trial(s, str(trial.id), battle.result == "win")
static func _settle_main(s: Dictionary, battle: Dictionary) -> Dictionary:
	if battle.get("id", "") in s.settledBattles: return ok({"duplicate": true, "first": false, "reward": empty_resources(), "won": battle.get("result") == "win"})
	var ticket = s.mainBattle
	if not ticket or ticket.id != battle.get("id") or battle.get("stageId") != ticket.stageId or battle.get("seed") != ticket.seed or battle.get("ruleVersion") != ticket.ruleVersion or battle.get("trial", true) or not battle.get("boons", ["invalid"]).is_empty(): return fail("战斗不属于当前主线挑战")
	if ticket.get("autoOnly", false):
		var verified: String = GameCombat.replay_auto(_main_request(ticket), battle)
		if not verified.is_empty(): return fail(verified)
	var team = []
	var enemies = []
	var living_enemy = false
	for u in battle.get("units", []):
		if u.side == "ally":
			var member = {"id": u.id, "level": u.level, "branch": u.branch, "treasure": u.treasure, "branchUnlocked": bool(u.get("branchUnlocked", false))}
			if not u.get("equipmentStats", {}).is_empty(): member.equipmentStats = u.equipmentStats.duplicate(true)
			team.append(member)
		else:
			enemies.append(u.id)
			if u.hp > 0: living_enemy = true
	if team != ticket.team or battle.get("method") != ticket.method or battle.get("pill") != ticket.pill: return fail("主线队伍或携带快照不符")
	var expected_enemies = []
	for u in GameData.stage(int(ticket.stageId)).enemies: expected_enemies.append(u.id)
	if enemies != expected_enemies: return fail("主线敌组快照不符")
	if not battle.get("result") in ["win", "lose"]: return fail("战斗尚未结束")
	if battle.result == "lose": return ok({"duplicate": false, "first": false, "reward": empty_resources(), "won": false})
	if living_enemy: return fail("敌方尚未击败，不能结算胜利")
	var result = _settle_victory(s, ticket.id, int(ticket.stageId))
	if not result.ok: return result
	s.mainBattle = null
	var drops = load("res://scripts/game_equipment.gd").reward_drops(s, "main:" + str(battle.id), {"sourceId": battle.id, "stageId": battle.stageId}, 1)
	if not drops.ok: return drops
	result.data.equipment = drops.data
	result.data.won = true
	return result
static func _nat(value: Variant, maximum: int = 9007199254740991) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and value >= 0 and value <= maximum and floor(float(value)) == value
static func check_in_status(s: Dictionary, now: int = -1) -> Dictionary:
	if now < 0: now = int(s.lastTime)
	var day = natural_day(maxi(now, int(s.lastTime)))
	var ledger: Dictionary = s.get("checkIn", {"claimedDays": [], "total": 0})
	var count = int(ledger.total)
	var index = count % 7
	return {"day": day, "timezone": "北京时间每日05:00", "claimed": day in ledger.claimedDays, "total": count, "cycleDay": index + 1, "reward": extension_rules().checkInRewards[index].duplicate(true), "rewards": extension_rules().checkInRewards.duplicate(true)}
static func activity_status(s: Dictionary) -> Array:
	var result = []
	for def in extension_rules().activityGoals:
		var complete = true
		if def.has("plots") and s.get("expandedPlots", []).size() < def.plots: complete = false
		if def.has("buildings") and s.buildings.size() < def.buildings: complete = false
		if def.has("stage") and not _has_num(s.cleared, int(def.stage)): complete = false
		if def.has("building") and not has_ready_building(s, def.building): complete = false
		var row: Dictionary = def.duplicate(true)
		row.complete = complete
		row.claimed = def.id in s.get("claimedActivities", [])
		result.append(row)
	return result
static func _extension_command(s: Dictionary, name: String, a: Dictionary, now: int) -> Dictionary:
	match name:
		"expandPlot":
			var id = str(a.get("plot", a.get("id", "")))
			var info = expansion_info(s, id)
			if not info.ok: return fail(info.reason)
			pay(s, info.cost)
			s.expandedPlots.append(id)
			record_daily(s, "estate")
			return ok({"plot": id, "cost": info.cost})
		"claimCheckIn":
			var info = check_in_status(s, now)
			if info.claimed: return fail("今日已签到，北京时间05:00更新")
			# A clock rollback must not produce an earlier never-claimed date.
			for day in s.checkIn.claimedDays:
				if day > info.day: return fail("时钟早于最近签到日期")
			gain(s, info.reward)
			s.checkIn.claimedDays.append(info.day)
			s.checkIn.total += 1
			return ok(info)
		"claimMail":
			var id = str(a.get("id", ""))
			var mail = GameData.named(extension_rules().localMail, id)
			if mail.is_empty(): return fail("本地奖励信不存在")
			if id in s.claimedMail: return fail("奖励信已经领取")
			gain(s, mail.reward)
			s.claimedMail.append(id)
			return ok(mail)
		"claimActivity":
			var id = str(a.get("id", ""))
			var row = GameData.named(activity_status(s), id)
			if row.is_empty(): return fail("成长目标不存在")
			if row.claimed: return fail("成长目标已经领取")
			if not row.complete: return fail("成长目标条件尚未达成")
			gain(s, row.reward)
			s.claimedActivities.append(id)
			return ok(row)
	return fail("未知仙府扩展操作")

## Save boundaries validate shape, cross-ledger consistency and historical commitments.
## Local validation is recovery hygiene, not authentication against edited files.
static func _strings(value: Variant, maximum: int = 100000, unique: bool = true) -> bool:
	if not value is Array or value.size() > maximum: return false
	var seen = {}
	for item in value:
		if not item is String or item.is_empty() or item.length() > 200 or (unique and seen.has(item)): return false
		seen[item] = true
	return true
static func _resources(value: Variant, caps: Dictionary) -> bool:
	if not value is Dictionary: return false
	for key in RESOURCE_KEYS:
		if not _nat(value.get(key), int(caps[key])): return false
	return true
static func _items(value: Variant, maximum: int) -> bool:
	if not value is Dictionary: return false
	for key in value:
		if not key in ["training", "ward", "heal", "cleanse", "thunder-component", "relic-essence", "xp-scroll", "herb-crate", "essence-pack"] or not _nat(value[key], maximum): return false
	return true
static func _number_list(value: Variant, maximum: int, count_limit: int) -> bool:
	if not value is Array or value.size() > count_limit: return false
	var seen = {}
	for n in value:
		if not _nat(n, maximum) or seen.has(int(n)): return false
		seen[int(n)] = true
	return true
static func validate_state(value: Variant) -> String:
	if not value is Dictionary: return "存档数据不是对象"
	var s: Dictionary = value
	for key in GameData.all().initialState:
		if not s.has(key): return "存档缺少字段：" + key
	if s.version != 3 or s.schemaRevision != 1: return "存档版本或字段版本无效"
	for key in ["revision", "createdAt", "lastTime", "clockWarnings"]:
		if not _nat(s[key]): return "存档时钟或修订无效"
	if s.lastTime > 8640000000000000: return "存档日期超出范围"
	if not s.randomStreams is Dictionary: return "随机流无效"
	for key in ["summon", "battle", "expedition"]:
		if not _nat(s.randomStreams.get(key), 4294967295) or s.randomStreams[key] <= 0: return "随机流无效"
	if s.demo != null and not GameData.all().demoStates.has(s.demo): return "展示档标记无效"
	if not _resources(s.resources, config().resourceCaps): return "资源数量不合理"
	if not s.owned is Dictionary or s.owned.size() > GameData.content("CHARACTERS").size(): return "角色收藏无效"
	for id in s.owned:
		var c = s.owned[id]
		if GameData.character(str(id)).is_empty() or not c is Dictionary: return "角色收藏无效"
		if not _nat(c.get("level"), 20) or c.level < 1 or not c.get("branch") in ["A", "B"] or not _nat(c.get("treasure"), 3): return "角色状态无效"
		if not c.get("spent") is Dictionary or not _nat(c.spent.get("stone"), 999999) or not _nat(c.spent.get("xp"), 999999): return "培养投入台账无效"
		if c.level == 1 and (c.spent.stone != 0 or c.spent.xp != 0): return "一级角色培养投入必须为零"
	if not _nat(s.slots, 5) or s.slots < 3 or not _strings(s.team, 5) or s.team.is_empty() or s.team.size() > s.slots: return "编队状态无效"
	for id in s.team:
		if not s.owned.has(id): return "编队含未拥有角色"
	if not _number_list(s.cleared, 12, 12): return "主线状态无效"
	for stage in s.cleared:
		if stage < 1 or (stage != 1 and not _has_num(s.cleared, int(stage) - 1)): return "主线进度不连续"
	if not _nat(s.pity, int(gacha_config().fiveStarPity) - 1) or not _nat(s.get("fourStarPity", 0), int(gacha_config().fourStarPity) - 1) or not s.drawHistory is Array or s.drawHistory.size() > 100000: return "召请记录无效"
	var draws = {}
	for h in s.drawHistory:
		if not h is Dictionary or not _strings([h.get("id")], 1) or draws.has(h.id) or not _nat(h.get("at")) or not h.get("results") is Array or not h.results.size() in [1, 10]: return "召请交易无效"
		draws[h.id] = true
		for r in h.results:
			if not r is Dictionary or not s.owned.has(r.get("id")) or not r.get("rarity") in ["divine", "immortal", "mortal"] or not r.get("duplicate") is bool: return "召请结果无效"
			if GameData.character(r.id).rarity != r.rarity or r.get("fate") != ((9 if r.rarity == "divine" else 4 if r.rarity == "immortal" else 2) if r.duplicate else 1): return "召请转换数额无效"
	if not _number_list(s.unlockedRegions, 2, 3) or not _has_num(s.unlockedRegions, 0): return "区域状态无效"
	if not _strings(s.get("expandedPlots", []), 15): return "扩建地块台账无效"
	for id in s.get("expandedPlots", []):
		var plot = GameData.named(extension_rules().expansionPlots, id)
		if plot.is_empty() or not _has_num(s.unlockedRegions, int(plot.region)): return "扩建地块未开放"
	if not s.buildings is Array or s.buildings.size() < 2 or s.buildings.size() > get_all_plots().size(): return "设施数量无效"
	var ids = {}
	var plots = {}
	var assigned = {}
	var type_counts = {}
	var repair_characters = {}
	for b in s.buildings:
		if not b is Dictionary or not _strings([b.get("id")], 1) or b.id.length() > 100 or ids.has(b.id) or not b.get("plot") is String or plots.has(b.plot): return "设施地块无效"
		if b.has("pendingPlacement") and not b.pendingPlacement is bool: return "设施待安置标记无效"
		if b.get("pendingPlacement", false):
			if b.plot != "pending:" + b.id or b.get("type") in ["hall", "spring"]: return "待安置设施无效"
		elif not plot_unlocked(s, b.plot): return "设施地块不存在或未开放"
		ids[b.id] = true
		plots[b.plot] = true
		var def = spec(str(b.get("type", "")))
		if def.is_empty() or not _nat(b.get("level"), 4 if b.type == "hall" else 3) or b.level < 1 or not _nat(b.get("readyAt")) or not (b.get("progress") is int or b.get("progress") is float) or not is_finite(float(b.progress)) or b.progress < 0 or b.progress >= 1.000001: return "设施状态无效"
		type_counts[b.type] = type_counts.get(b.type, 0) + 1
		if type_counts[b.type] > def.max: return "设施数量超限"
		if b.get("assigned") != null:
			if not s.owned.has(b.assigned) or assigned.has(b.assigned): return "驻府委任无效"
			assigned[b.assigned] = true
		if not b.get("queue") is Array or b.queue.size() > 20: return "生产队列无效"
		var jobs = {}
		for q in b.queue:
			if not q is Dictionary or not _strings([q.get("id")], 1) or jobs.has(q.id) or not _nat(q.get("startedAt")) or not _nat(q.get("readyAt")) or not _nat(q.get("duration"), 45000) or q.duration <= 0 or q.readyAt - q.startedAt != q.duration or not q.get("cost") is Dictionary or not q.get("output") is Dictionary: return "生产项目无效"
			jobs[q.id] = true
			# Legacy jobs retain their original cost. New jobs refund only actual payment,
			# including after switching back to the balanced build.
			if q.has("paidCost") and (not q.paidCost is Dictionary or (q.paidCost != q.cost and q.paidCost != zero_cost(q.cost))): return "生产实付台账无效"
			var historical: Dictionary = GameData.economy("PRODUCTION_RULES_BY_VERSION").get(q.get("ruleVersion"), {})
			var recipe: Dictionary = historical.get(q.get("recipe"), {})
			if recipe.is_empty(): recipe = extension_rules().productionRulesByVersion.get(q.get("ruleVersion"), {}).get(q.get("recipe"), {})
			if not recipe.is_empty():
				if recipe.building != b.type or q.cost != recipe.cost or q.output != recipe.output or q.duration > recipe.duration: return "锁定生产承诺不符"
			elif q.get("recipe") == "thunder-repair" and b.type == "forge":
				var output: Dictionary = q.output
				if not s.owned.has(output.get("repair")) or not _nat(output.get("tier"), 3) or output.tier < 1 or output.get("count") != 1 or output.tier != s.owned[output.repair].treasure + 1 or repair_characters.has(output.repair): return "锁定修复无效"
				var expected = recorded_repair_cost(str(q.get("ruleVersion", "")), int(output.tier) - 1)
				if expected == null or q.cost != expected: return "修复投入不符"
				repair_characters[output.repair] = true
			else: return "未知生产配方或历史规则"
	if building(s, "hall").get("type") != "hall" or building(s, "hall").get("plot") != "p0" or building(s, "spring").get("type") != "spring" or building(s, "spring").get("plot") != "p1": return "固定地标缺失"
	var warehouse_caps = {}
	for key in RESOURCE_KEYS: warehouse_caps[key] = warehouse_capacity(s)
	if not s.warehouse is Dictionary or not _resources(s.warehouse.get("resources"), warehouse_caps) or not _items(s.warehouse.get("items"), warehouse_capacity(s, true)) or not _items(s.items, 999): return "仓库无效"
	if not s.warehouse.get("sources") is Dictionary or s.warehouse.sources.size() > s.buildings.size() + 1 or not s.warehouse.get("repairs") is Array: return "仓库来源无效"
	var summed = empty_resources()
	var item_sum = {}
	var repairs = {}
	for source_id in s.warehouse.sources:
		var inventory = s.warehouse.sources[source_id]
		if (source_id != "legacy" and not ids.has(source_id)) or not inventory is Dictionary or not _resources(inventory.get("resources"), warehouse_caps) or not _items(inventory.get("items"), warehouse_capacity(s, true)): return "设施仓库无效"
		for key in RESOURCE_KEYS: summed[key] += inventory.resources[key]
		for key in inventory.items: item_sum[key] = item_sum.get(key, 0) + inventory.items[key]
		if not inventory.get("repairs", []) is Array or inventory.get("repairs", []).size() > warehouse_capacity(s, true): return "修复仓库无效"
		for repair in inventory.get("repairs", []):
			if not repair is Dictionary or not _strings([repair.get("jobId")], 1) or repairs.has(repair.jobId) or not s.owned.has(repair.get("id")) or not _nat(repair.get("tier"), 3) or repair.tier != s.owned[repair.id].treasure + 1 or repair_characters.has(repair.id): return "待领修复无效"
			repairs[repair.jobId] = repair
			repair_characters[repair.id] = true
	if summed != s.warehouse.resources: return "仓库来源与汇总不符"
	for key in item_sum.keys() + s.warehouse.items.keys():
		if item_sum.get(key, 0) != s.warehouse.items.get(key, 0): return "物品来源与汇总不符"
	if s.warehouse.repairs.size() != repairs.size(): return "修复来源与汇总不符"
	for repair in s.warehouse.repairs:
		if not repair is Dictionary or not repairs.has(repair.get("jobId")) or repairs[repair.jobId] != repair: return "修复汇总损坏"
	if not _strings(s.methods, 4): return "法门无效"
	for id in s.methods:
		if GameData.named(GameData.economy("METHODS"), id).is_empty(): return "未知法门"
	if s.chosenMethod != null and not s.chosenMethod in s.methods: return "携带法门无效"
	if s.chosenPill != null and (not s.chosenPill in ["training", "ward", "heal", "cleanse"] or s.items.get(s.chosenPill, 0) <= 0): return "携带丹药无效"
	if not s.choicePending is bool or (s.giftChosen != null and (not s.giftChosen in GameData.economy("GIFT_CHOICES") or not s.owned.has(s.giftChosen))): return "结缘自选状态无效"
	if not _strings(s.cores, 3) or not _strings(s.integratedCores, 3) or not _strings(s.cores + s.integratedCores, 3): return "核心状态无效"
	for id in s.cores + s.integratedCores:
		if not id in ["spring", "furnace", "thunder"]: return "未知核心"
	if not _strings(s.settledBattles) or not _strings(s.transactions): return "事务记录无效"
	if not s.stats is Dictionary: return "任务统计无效"
	for key in ["builds", "battles", "harvests", "upgrades"]:
		if not _nat(s.stats.get(key)): return "任务统计无效"
	if not _strings(s.claimedTasks, 4): return "任务状态无效"
	for id in s.claimedTasks:
		if not id in ["build", "battle", "harvest", "upgrade"]: return "未知已领任务"
	if not s.settings is Dictionary or not _nat(s.settings.get("speed"), 3) or s.settings.speed < 1: return "设置无效"
	for key in ["sound", "simplified", "tutorialSkipped"]:
		if not s.settings.get(key) is bool: return "设置无效"
	if s.settings.has("music") and not s.settings.music is bool: return "音乐设置无效"
	if s.slots != (4 if s.has("framework") else (5 if _has_num(s.cleared, 3) else 4 if _has_num(s.cleared, 2) else 3)): return "上阵位置与进度不符"
	for id in ["nezha", "huangfeihu", "bigan"]:
		if not s.owned.has(id): return "新手保证角色缺失"
	if _has_num(s.cleared, 2) and not s.owned.has("leizhenzi"): return "雷震子保证奖励缺失"
	if s.choicePending != (_has_num(s.cleared, 3) and s.giftChosen == null) or (s.giftChosen != null and not _has_num(s.cleared, 3)): return "结缘自选与新手进度不符"
	for pair in [["spring", 4], ["furnace", 8], ["thunder", 12]]:
		if _has_num(s.cleared, pair[1]) != (pair[0] in s.cores or pair[0] in s.integratedCores): return "核心与首通进度不符"
	if _has_num(s.unlockedRegions, 1) != ("spring" in s.integratedCores) or _has_num(s.unlockedRegions, 2) != ("furnace" in s.integratedCores): return "区域与核心进度不符"
	if building(s, "hall").level != s.integratedCores.size() + 1: return "万仙殿升格与核心进度不符"
	if s.wishlist != null and GameData.character(str(s.wishlist)).is_empty(): return "心愿无效"
	if not s.teamPresets is Array or s.teamPresets.size() != 3: return "编队预设无效"
	for preset in s.teamPresets:
		if preset == null: continue
		if not preset is Dictionary or not preset.get("team") is Array or preset.team.is_empty() or preset.team.size() > 5: return "预设角色无效"
		var members = []
		for c in preset.team:
			if not c is Dictionary or GameData.character(str(c.get("id", ""))).is_empty() or not c.get("branch") in ["A", "B"]: return "预设角色无效"
			members.append(c.id)
		if not _strings(members, 5): return "预设角色重复"
		if preset.get("method") != null and GameData.named(GameData.economy("METHODS"), preset.method).is_empty(): return "预设法门无效"
	var error = _validate_progress_ledgers(s)
	if error: return error
	if s.has("equipment"):
		var equipment_copy = s.duplicate(true)
		load("res://scripts/game_equipment.gd").ensure_state(equipment_copy)
		error = load("res://scripts/game_equipment.gd").validate(equipment_copy)
		if error: return error
	var expedition_script = load("res://scripts/game_expedition.gd")
	error = load("res://scripts/game_community.gd").validate(s)
	if error: return error
	if s.has("progression"):
		error = load("res://scripts/game_progression.gd").validate(s)
		if error: return error
	if s.has("activities"):
		error = load("res://scripts/game_activities.gd").validate(s)
		if error: return error
	return expedition_script.validate_expedition_ledger(s.expeditions, s)
static func _validate_progress_ledgers(s: Dictionary) -> String:
	var p = s.thunderProject
	if not p is Dictionary or p.get("id") != "thunder-project" or not p.get("stage") in ["unstarted", "survey", "prepare", "stabilize", "complete"] or not p.get("direction") in [null, "forge", "teaching"]: return "引雷工程无效"
	if not _strings(p.get("completedStages"), 4) or not p.get("invested") is Dictionary: return "工程阶段台账无效"
	var stages = ["survey", "prepare", "stabilize", "form"]
	for stage in p.completedStages:
		var index = stages.find(stage)
		if index < 0 or (index > 0 and not stages[index - 1] in p.completedStages): return "工程阶段不连续"
	for key in p.invested:
		if not key in ["stone", "material", "herb"] or not _nat(p.invested[key], 1000): return "工程投入无效"
	if p.stage != "unstarted" and not is_thunder_project_unlocked(s): return "工程尚未解锁"
	if (p.stage == "complete") != ("form" in p.completedStages) or (p.direction != null) != (p.stage == "complete"): return "工程用途与阶段不符"
	if "thunderward" in s.methods and p.stage != "complete": return "引雷法门来源无效"
	if s.chosenMethod == "thunderward" and p.direction != "teaching": return "未启用的引雷法门不能新装备"
	if not _strings(s.branchUnlocks, GameData.content("CHARACTERS").size()): return "神通解锁记录无效"
	for id in s.branchUnlocks:
		if not s.owned.has(id): return "神通解锁来源无效"
	var daily = s.daily
	if not daily is Dictionary or not daily.get("day") is String or not _date_string(daily.day) or not daily.get("progress") is Dictionary or not _strings(daily.get("claimed"), 4): return "日常记录无效"
	for key in ["estate", "battle", "cultivation"]:
		if not _nat(daily.progress.get(key), 999999): return "日常进度无效"
	for id in daily.claimed:
		if not id in ["estate", "battle", "cultivation", "summary"]: return "日常奖励ID无效"
	if "summary" in daily.claimed:
		for id in ["estate", "battle", "cultivation"]:
			if not id in daily.claimed: return "日常汇总来源无效"
	if s.materialSweep != null:
		var sweep = s.materialSweep
		if not sweep is Dictionary or not _strings([sweep.get("id")], 1) or not _nat(sweep.get("stageId"), 12) or sweep.stageId < 1 or int(sweep.stageId) % 4 == 0 or not _has_num(s.cleared, int(sweep.stageId)) or not _nat(sweep.get("startedAt")) or not _nat(sweep.get("readyAt")) or sweep.readyAt <= sweep.startedAt or not _resources(sweep.get("reward"), config().resourceCaps) or sweep.reward.ticket != 0 or sweep.reward.fate != 0 or not sweep.get("ruleVersion") is String or sweep.id in s.settledBattles: return "材料扫荡记录无效"
	if s.mainBattle != null:
		var ticket = s.mainBattle
		if not ticket is Dictionary or not _strings([ticket.get("id")], 1) or ticket.id.length() > 140 or ticket.id in s.settledBattles or not _nat(ticket.get("stageId"), 12) or ticket.stageId < 1 or (ticket.stageId != 1 and not _has_num(s.cleared, int(ticket.stageId) - 1)) or not _nat(ticket.get("seed"), 4294967295) or not _nat(ticket.get("createdAt")) or not ticket.get("ruleVersion") is String or ticket.ruleVersion.length() > 40: return "主线挑战记录无效"
		if not ticket.get("team") is Array or ticket.team.is_empty() or ticket.team.size() > 5: return "主线队伍快照无效"
		var members = []
		for c in ticket.team:
			if not c is Dictionary or (c.get("id") != "palace-lord" and not s.owned.has(c.get("id"))) or not _nat(c.get("level"), 20) or c.level < 1 or not c.get("branch") in ["A", "B"] or not _nat(c.get("treasure"), 3): return "主线队伍快照无效"
			members.append(c.id)
		if not _strings(members, 5): return "主线队伍重复"
		if ticket.get("method") != null and GameData.named(GameData.economy("METHODS"), ticket.method).is_empty(): return "主线法门快照无效"
		if ticket.get("pill") != null and not ticket.pill in ["training", "ward", "heal", "cleanse"]: return "主线丹药快照无效"
	if s.has("checkIn"):
		var check_in = s.checkIn
		if not check_in is Dictionary or not _strings(check_in.get("claimedDays")) or not _nat(check_in.get("total")) or check_in.total != check_in.claimedDays.size(): return "签到台账无效"
		var previous = ""
		for day in check_in.claimedDays:
			if not _date_string(day) or day <= previous: return "签到日期不递增"
			previous = day
	for key in ["claimedMail", "claimedActivities"]:
		if not _strings(s.get(key, [])): return "扩展奖励台账无效"
	for id in s.get("claimedMail", []):
		if GameData.named(extension_rules().localMail, id).is_empty(): return "奖励信来源无效"
	for id in s.get("claimedActivities", []):
		if GameData.named(extension_rules().activityGoals, id).is_empty(): return "成长目标来源无效"
	var content_error = _validate_content_ledgers(s)
	if content_error.is_empty() and s.has("framework"): return load("res://scripts/game_framework.gd").validate(s)
	return content_error
static func _date_string(value: String) -> bool:
	if value.length() != 10 or value[4] != "-" or value[7] != "-": return false
	var chunks = value.split("-")
	return chunks.size() == 3 and chunks[0].is_valid_int() and chunks[1].is_valid_int() and chunks[2].is_valid_int() and int(chunks[1]) >= 1 and int(chunks[1]) <= 12 and int(chunks[2]) >= 1 and int(chunks[2]) <= 31
static func migrate_state(value: Variant, version: int) -> Dictionary:
	if not version in [1, 2, 3]: return {"error": "不兼容的存档版本"}
	if not value is Dictionary or value.get("version") != version: return {"error": "存档数据版本不符"}
	if value.has("schemaRevision") and value.schemaRevision != 1: return {"error": "不兼容的存档字段版本"}
	var old: Dictionary = GameData.normalize(value.duplicate(true))
	# Existing current-schema ledgers must validate before filling extension defaults.
	if version == 3 and old.get("schemaRevision") == 1:
		var error = validate_state(old)
		if error: return {"error": error}
		ensure_extensions(old)
		return old
	var initial = create_state(int(old.createdAt) if _nat(old.get("createdAt")) else GameData.now_ms())
	var migrated = initial.duplicate(true)
	migrated.merge(old, true)
	if not old.has("framework"): migrated.erase("framework")
	migrated.version = 3
	migrated.schemaRevision = 1
	for key in ["settings", "stats", "warehouse"]:
		if old.has(key) and not old[key] is Dictionary: return {"error": "旧档结构无效：" + key}
		migrated[key] = initial[key].duplicate(true)
		migrated[key].merge(old.get(key, {}), true)
	if not migrated.owned is Dictionary or not migrated.buildings is Array or not migrated.unlockedRegions is Array: return {"error": "旧档角色或设施无效"}
	for id in migrated.owned:
		var c = migrated.owned[id]
		if not c is Dictionary or not _nat(c.get("level"), 20) or c.level < 1: return {"error": "旧档角色状态无效"}
		if not c.has("spent"):
			c.spent = {"stone": 0, "xp": 0}
			# Frozen V1 prices; not derived from mutable live configuration.
			for level in range(1, int(c.level)):
				c.spent.stone += 25 + level * 20
				c.spent.xp += 20 + level * 15
	if not old.has("branchUnlocks"):
		migrated.branchUnlocks = []
		for id in migrated.owned:
			if migrated.owned[id].level >= 3 or migrated.owned[id].get("branch") == "B": migrated.branchUnlocks.append(id)
	if not old.has("daily"):
		if not _nat(migrated.lastTime): return {"error": "旧档时钟无效"}
		migrated.daily = fresh_daily(int(migrated.lastTime))
	if not old.get("warehouse", {}).has("sources"):
		migrated.warehouse.sources = {"legacy": {"resources": migrated.warehouse.resources.duplicate(true), "items": migrated.warehouse.items.duplicate(true), "repairs": []}}
	for source in migrated.warehouse.sources.values():
		if not source is Dictionary: return {"error": "旧档产物来源无效"}
		if not source.has("repairs"): source.repairs = []
	if version < 3:
		for b in migrated.buildings:
			if not b is Dictionary or not b.get("queue") is Array: return {"error": "旧档设施队列无效"}
			for q in b.queue:
				if not q is Dictionary: return {"error": "旧档生产项目无效"}
				var recipe: Dictionary = GameData.economy("PRODUCTION_RULES_BY_VERSION")["v0.1.0"].get(q.get("recipe"), {})
				if recipe.is_empty() or not _nat(q.get("startedAt")) or not _nat(q.get("readyAt")): return {"error": "旧档生产配方无效"}
				q.output = recipe.output.duplicate(true)
				q.duration = q.readyAt - q.startedAt
				q.ruleVersion = "v0.1.0"
	ensure_extensions(migrated)
	var placement_error = migrate_building_placements(migrated)
	if placement_error: return {"error": placement_error}
	var error = validate_state(migrated)
	return {"error": error} if error else migrated
static func migrate_building_placements(s: Dictionary) -> String:
	var occupied = {"p0": true, "p1": true}
	var movable = []
	for b in s.buildings:
		if not b is Dictionary or not b.get("id") is String or not b.get("type") is String: return "旧档设施无效"
		if b.type in ["hall", "spring"]:
			b.plot = "p0" if b.type == "hall" else "p1"
			b.erase("pendingPlacement")
		else: movable.append(b)
	movable.sort_custom(func(a, b): return a.id < b.id)
	var displaced = []
	for b in movable:
		var plot = GameData.named(get_all_plots(), b.get("plot"))
		if not plot.is_empty() and not plot.has("fixed") and plot_unlocked(s, plot.id) and not occupied.has(plot.id):
			occupied[plot.id] = true
			b.erase("pendingPlacement")
		else: displaced.append(b)
	for b in displaced:
		var target = {}
		for plot in get_all_plots():
			if not plot.has("fixed") and plot_unlocked(s, plot.id) and not occupied.has(plot.id):
				target = plot
				break
		if not target.is_empty():
			b.plot = target.id
			occupied[target.id] = true
			b.erase("pendingPlacement")
		else:
			b.plot = "pending:" + b.id
			b.pendingPlacement = true
	return ""

static func idle_mission_status(s: Dictionary, now: int = -1) -> Array:
	if now < 0: now = int(s.lastTime)
	var result = []
	for mission in s.get("idleMissions", {}).get("active", []):
		var row: Dictionary = mission.duplicate(true)
		row.ready = maxi(now, int(s.lastTime)) >= int(mission.readyAt)
		row.remainingMs = maxi(0, int(mission.readyAt) - maxi(now, int(s.lastTime)))
		result.append(row)
	return result
static func shop_status(s: Dictionary, now: int = -1) -> Array:
	if now < 0: now = int(s.lastTime)
	var day = natural_day(maxi(now, int(s.lastTime)))
	var result = []
	for def in extension_rules().shopItems:
		var row: Dictionary = def.duplicate(true)
		row.day = day
		row.purchased = s.get("shopLedger", {}).get(day + ":" + str(def.id), 0)
		row.remaining = maxi(0, int(def.dailyLimit) - int(row.purchased))
		result.append(row)
	return result
static func _grant_items(s: Dictionary, items: Dictionary) -> String:
	for id in items:
		if not _nat(items[id], 999) or s.items.get(id, 0) + items[id] > 999: return "背包物品容量不足，请先使用物品"
	for id in items: s.items[id] = s.items.get(id, 0) + items[id]
	return ""
static func character_challenge_encounter(id: String, tier: int) -> Dictionary:
	return GameData.named(extension_rules().characterChallenge.get("encounters", {}).get(id, []), tier)
static func character_challenge_status(s: Dictionary, id: String) -> Array:
	var result = []
	for tier in extension_rules().characterChallenge.tiers:
		var row: Dictionary = tier.duplicate(true)
		row.characterId = id
		var encounter = character_challenge_encounter(id, int(tier.id))
		row.encounterName = encounter.get("name", "旧版试炼")
		row.mechanic = encounter.get("mechanic", "")
		row.focusSkill = encounter.get("focusSkill", "")
		row.enemies = encounter.get("enemies", []).duplicate(true)
		row.claimId = "%s:%d" % [id, int(tier.id)]
		row.claimed = row.claimId in s.get("characterChallenges", {}).get("claimed", [])
		row.unlocked = s.owned.has(id) and s.owned[id].level >= tier.minLevel and _stage_error(s, int(tier.stageId)).is_empty()
		result.append(row)
	return result
static func _content_command(s: Dictionary, name: String, a: Dictionary, now: int) -> Dictionary:
	match name:
		"startIdleMission":
			var id = str(a.get("missionId", ""))
			var def = GameData.named(extension_rules().idleMissions, id)
			if def.is_empty(): return fail("派遣委托不存在")
			if def.unlockStage > 0 and not _has_num(s.cleared, int(def.unlockStage)): return fail("先完成委托要求的主线节点")
			if s.idleMissions.active.size() >= 3: return fail("同时最多三项派遣委托")
			var characters = a.get("characters", [])
			if not _strings(characters, int(def.maxCharacters)) or characters.size() < def.minCharacters: return fail("请选择合法的已结缘派遣队伍")
			for cid in characters:
				if not s.owned.has(cid): return fail("不能派遣未结缘角色")
				for running in s.idleMissions.active:
					if cid in running.characters: return fail("该角色正在另一项派遣中")
			var serial = s.idleMissions.claimed.size() + s.idleMissions.active.size()
			var run_id = "idle-%s-%d-%d" % [id, now, serial]
			while not GameData.named(s.idleMissions.active, run_id).is_empty() or run_id in s.idleMissions.claimed:
				serial += 1
				run_id = "idle-%s-%d-%d" % [id, now, serial]
			var mission = {"id": run_id, "missionId": id, "name": def.name, "characters": characters.duplicate(), "startedAt": now, "readyAt": now + mini(43200000, int(def.duration)), "reward": def.reward.duplicate(true), "items": def.get("items", {}).duplicate(true), "ruleVersion": "godot-idle-v1"}
			s.idleMissions.active.append(mission)
			return ok(mission)
		"claimIdleMission":
			var id = str(a.get("id", ""))
			if id in s.idleMissions.claimed: return fail("派遣奖励已经领取")
			var mission = GameData.named(s.idleMissions.active, id)
			if mission.is_empty(): return fail("派遣委托不存在")
			if s.lastTime < mission.readyAt: return fail("派遣尚未完成")
			var error = _grant_items(s, mission.items)
			if error: return fail(error)
			gain(s, mission.reward)
			s.idleMissions.claimed.append(id)
			s.idleMissions.active.erase(mission)
			record_daily(s, "estate")
			return ok(mission)
		"buyShopItem":
			var id = str(a.get("id", ""))
			var count = a.get("count", 1)
			if not _nat(count, 5) or count < 1: return fail("购买数量无效")
			var def = GameData.named(shop_status(s, now), id)
			if def.is_empty(): return fail("商店物品不存在")
			if count > def.remaining: return fail("超过今日该物品兑换数量")
			var cost = {}
			for key in def.cost: cost[key] = int(def.cost[key]) * int(count)
			if not can_afford(s, cost): return fail("兑换资源不足")
			var error = _grant_items(s, {def.item: int(def.count) * int(count)})
			if error: return fail(error)
			pay(s, cost)
			s.shopLedger[def.day + ":" + id] = int(def.purchased) + int(count)
			return ok({"id": id, "count": count, "cost": cost})
		"useItem":
			var id = str(a.get("id", ""))
			var count = a.get("count", 1)
			var def = GameData.named(extension_rules().shopItems, id)
			if def.is_empty(): return fail("此物品需要在对应玩法中使用；丹药请战前携带")
			if not _nat(count, 999) or count < 1 or s.items.get(id, 0) < count: return fail("物品数量不足")
			var reward = {}
			var items = {}
			for key in def.get("useReward", {}): reward[key] = int(def.useReward[key]) * int(count)
			for key in def.get("useItems", {}): items[key] = int(def.useItems[key]) * int(count)
			if not refund_room(s, reward): return fail("资源背包容量不足以完整获得道具效果")
			var error = _grant_items(s, items)
			if error: return fail(error)
			s.items[id] -= count
			gain(s, reward)
			return ok({"id": id, "count": count, "reward": reward, "items": items})
		"prepareCharacterChallenge": return _prepare_character_challenge(s, a)
		"settleCharacterChallenge": return _settle_character_challenge(s, a.get("battle", {}))
		"abandonCharacterChallenge":
			var active = s.characterChallenges.active
			s.characterChallenges.active = null
			return ok({"abandoned": active != null, "consumedPill": active.pill if active else null})
		"redeemMockReceipt":
			if not s.get("mockAccount") or not s.get("mockRealm") or s.get("demo") != null: return fail("只有本地模拟账号分区可以领取模拟回执")
			if str(a.get("account", "")) != str(s.mockAccount) or str(a.get("realm", "")) != str(s.mockRealm): return fail("模拟回执账号或分区不匹配")
			var receipt_id = str(a.get("receipt_id", ""))
			if receipt_id.is_empty() or receipt_id.length() > 160: return fail("模拟回执编号无效")
			if receipt_id in s.claimedMockReceipts: return ok({"duplicate": true, "receipt_id": receipt_id})
			var rewards = a.get("rewards", {})
			if not rewards is Dictionary or rewards.is_empty(): return fail("模拟回执奖励无效")
			for key in rewards:
				if not key in RESOURCE_KEYS or not _nat(rewards[key], int(config().resourceCaps[key])): return fail("模拟回执奖励无效")
			gain(s, rewards)
			s.claimedMockReceipts.append(receipt_id)
			return ok({"duplicate": false, "receipt_id": receipt_id, "reward": rewards.duplicate(true), "mock": true})
	return fail("未知内容操作")
static func _prepare_character_challenge(s: Dictionary, a: Dictionary) -> Dictionary:
	var cid = str(a.get("characterId", ""))
	var tier_id = int(a.get("tier", 1))
	var ticket = s.characterChallenges.active
	# A paid challenge is resumed from its immutable admission snapshot. Current
	# level, roster, branch, gear and selected pill only gate the next admission.
	if ticket:
		if ticket.challengeId != "%s:%d" % [cid, tier_id]: return fail("请先结束当前角色试炼")
		return _character_challenge_request(ticket)
	var row = GameData.named(character_challenge_status(s, cid), tier_id)
	if row.is_empty() or not row.unlocked: return fail("角色或试炼未解锁，请达到要求等级并推进主线")
	if row.claimed: return fail("此角色本阶试炼已完成")
	if not cid in s.team: return fail("请先将主试角色编入当前队伍")
	if s.mainBattle or (s.expeditions.active and s.expeditions.active.status == "battle"): return fail("请先结束当前主线或秘境战斗")
	# Reuse the same real combat admission and one-pill ticket semantics.
	var request = _prepare_main(s, int(row.stageId), {"id": "challenge-%s-%d-%d" % [cid, tier_id, int(s.lastTime)], "now": s.lastTime})
	if not request.ok: return request
	ticket = s.mainBattle.duplicate(true)
	s.mainBattle = null
	ticket.challengeId = row.claimId
	ticket.characterId = cid
	ticket.tier = tier_id
	ticket.reward = row.reward.duplicate(true)
	ticket.items = row.get("items", {}).duplicate(true)
	var encounter = character_challenge_encounter(cid, tier_id)
	if encounter.is_empty(): return fail("角色试炼敌阵配置缺失")
	ticket.encounterVersion = encounter.version
	ticket.encounter = encounter.duplicate(true)
	s.characterChallenges.active = ticket
	return _character_challenge_request(ticket)
static func _character_challenge_request(ticket: Dictionary) -> Dictionary:
	var row = GameData.named(extension_rules().characterChallenge.tiers, int(ticket.tier))
	var title = str(row.get("name", "万仙试炼"))
	var options = {"battleId": ticket.id, "seed": ticket.seed, "method": ticket.method, "pill": ticket.pill, "ruleVersion": ticket.ruleVersion, "contextName": "%s · %s" % [GameData.character(ticket.characterId).name, title]}
	options.autoOnly = bool(ticket.get("autoOnly", false))
	options.petSupport = ticket.get("petSupport", {}).duplicate(true)
	# Legacy admitted battles retain their original enemies until settled/cancelled.
	if ticket.has("encounter"):
		options.enemies = ticket.encounter.enemies.duplicate(true)
		options.contextName = ticket.encounter.name
	return ok({"battleId": ticket.id, "stageId": ticket.stageId, "team": ticket.team.duplicate(true), "options": options})
static func _validate_character_result(ticket: Dictionary, battle: Dictionary) -> String:
	if ticket.get("autoOnly", false):
		var verified: String = GameCombat.replay_auto(_character_challenge_request(ticket).data, battle)
		if not verified.is_empty(): return verified
	if ticket.id != battle.get("id") or battle.get("stageId") != ticket.stageId or battle.get("seed") != ticket.seed or battle.get("ruleVersion") != ticket.ruleVersion or battle.get("trial", true) or not battle.get("boons", ["invalid"]).is_empty(): return "战斗不属于当前角色试炼"
	if not battle.get("units") is Array: return "角色试炼战斗单位无效"
	var allies: Array = []
	var enemies: Array = []
	for unit in battle.units:
		if not unit is Dictionary: return "角色试炼单位无效"
		if unit.get("side") == "ally": allies.append(unit)
		elif unit.get("side") == "enemy": enemies.append(unit)
		else: return "角色试炼阵营无效"
	if allies.size() != ticket.team.size(): return "角色试炼队伍不符"
	for i in allies.size():
		for key in ["id", "level", "branch", "treasure"]:
			if allies[i].get(key) != ticket.team[i].get(key): return "角色试炼队伍快照不符"
		if allies[i].get("equipmentStats", {}) != ticket.team[i].get("equipmentStats", {}): return "角色试炼装备快照不符"
		if bool(allies[i].get("branchUnlocked", false)) != bool(ticket.team[i].get("branchUnlocked", false)): return "角色试炼专精快照不符"
	if battle.get("method") != ticket.method or battle.get("pill") != ticket.pill: return "角色试炼携带快照不符"
	var expected: Array = ticket.encounter.enemies if ticket.has("encounter") else GameData.stage(int(ticket.stageId)).enemies
	if enemies.size() != expected.size(): return "角色试炼敌阵不符"
	for i in enemies.size():
		if enemies[i].get("id") != expected[i].id or enemies[i].get("maxHp") != expected[i].hp or enemies[i].get("role") != expected[i].role: return "角色试炼敌阵快照不符"
		if not _nat(enemies[i].get("hp"), int(expected[i].hp)): return "角色试炼敌方生命无效"
	if battle.get("result") not in ["win", "lose"]: return "战斗尚未结束"
	if int(battle.get("actionCount", 0)) <= 0: return "试炼尚未执行真实战斗"
	if battle.result == "win":
		for enemy in enemies:
			if enemy.hp > 0: return "敌人尚未击败"
		if allies.filter(func(u): return u.get("hp", 0) > 0).is_empty(): return "没有存活同伴，不能结算胜利"
	return ""
static func _settle_character_challenge(s: Dictionary, battle: Dictionary) -> Dictionary:
	var ticket = s.characterChallenges.active
	if not ticket: return fail("没有进行中的角色试炼")
	var battle_error = _validate_character_result(ticket, battle)
	if battle_error: return fail(battle_error)
	if battle.result != "win": return ok({"won": false, "reward": empty_resources()})
	if ticket.challengeId in s.characterChallenges.claimed: return fail("此角色试炼奖励已经领取")
	var error = _grant_items(s, ticket.items)
	if error: return fail(error)
	gain(s, ticket.reward)
	s.characterChallenges.claimed.append(ticket.challengeId)
	s.characterChallenges.active = null
	s.stats.battles += 1
	record_daily(s, "battle")
	var drops = load("res://scripts/game_equipment.gd").reward_drops(s, "challenge:" + ticket.challengeId, {"sourceId": ticket.id, "stageId": ticket.stageId}, 1)
	if not drops.ok: return drops
	return ok({"won": true, "first": true, "reward": ticket.reward, "items": ticket.items, "equipment": drops.data})
static func _validate_content_ledgers(s: Dictionary) -> String:
	var missions = s.get("idleMissions", {"active": [], "claimed": []})
	if not missions is Dictionary or not missions.get("active") is Array or missions.active.size() > 3 or not _strings(missions.get("claimed")): return "派遣台账无效"
	var assigned = {}
	var ids = {}
	for mission in missions.active:
		if not mission is Dictionary or not _strings([mission.get("id")], 1) or ids.has(mission.id) or mission.id in missions.claimed: return "派遣编号无效"
		ids[mission.id] = true
		var def = GameData.named(extension_rules().idleMissions, mission.get("missionId"))
		if def.is_empty() or mission.get("ruleVersion") != "godot-idle-v1" or not _strings(mission.get("characters"), int(def.maxCharacters)) or mission.characters.size() < def.minCharacters or not _nat(mission.get("startedAt")) or not _nat(mission.get("readyAt")) or mission.readyAt - mission.startedAt != def.duration or mission.get("reward") != def.reward or mission.get("items") != def.get("items", {}): return "派遣快照无效"
		if def.unlockStage > 0 and not _has_num(s.cleared, int(def.unlockStage)): return "派遣前置未完成"
		for cid in mission.characters:
			if not s.owned.has(cid) or assigned.has(cid): return "派遣角色重复或不存在"
			assigned[cid] = true
	var shop = s.get("shopLedger", {})
	if not shop is Dictionary: return "商店台账无效"
	for key in shop:
		if not key is String or key.length() < 12 or not _date_string(key.substr(0, 10)) or key[10] != ":": return "商店日期无效"
		var def = GameData.named(extension_rules().shopItems, key.substr(11))
		if def.is_empty() or not _nat(shop[key], int(def.dailyLimit)): return "商店购买数量无效"
	var challenges = s.get("characterChallenges", {"active": null, "claimed": []})
	if not challenges is Dictionary or not _strings(challenges.get("claimed"), GameData.content("CHARACTERS").size() * 3): return "角色试炼台账无效"
	for id in challenges.claimed:
		var parts = id.split(":")
		if parts.size() != 2 or not s.owned.has(parts[0]) or not parts[1].is_valid_int() or not int(parts[1]) in [1, 2, 3]: return "角色试炼领取来源无效"
	if challenges.get("active") != null:
		var ticket = challenges.active
		if not ticket is Dictionary or not s.owned.has(ticket.get("characterId")) or not _nat(ticket.get("tier"), 3) or ticket.tier < 1 or ticket.get("challengeId") != "%s:%d" % [ticket.characterId, int(ticket.tier)] or ticket.challengeId in challenges.claimed: return "角色试炼快照无效"
		var def = GameData.named(extension_rules().characterChallenge.tiers, ticket.tier)
		if def.is_empty() or ticket.get("stageId") != def.stageId or ticket.get("reward") != def.reward or ticket.get("items") != def.get("items", {}): return "角色试炼奖励快照无效"
		if ticket.has("encounter"):
			var encounter = character_challenge_encounter(str(ticket.characterId), int(ticket.tier))
			if encounter.is_empty() or ticket.get("encounterVersion") != encounter.get("version") or ticket.encounter != encounter: return "角色试炼专属敌阵被修改或版本不兼容"
		if not _strings([ticket.get("id")], 1) or not _nat(ticket.get("seed"), 4294967295) or not _nat(ticket.get("createdAt")) or not ticket.get("ruleVersion") is String or not ticket.get("team") is Array or ticket.team.is_empty() or ticket.team.size() > 5: return "角色试炼战斗票据无效"
		var members = []
		for member in ticket.team:
			if not member is Dictionary or (member.get("id") != GameFramework.LORD and not s.owned.has(member.get("id"))) or not _nat(member.get("level"), 20) or member.level < 1 or not member.get("branch") in ["A", "B"] or not _nat(member.get("treasure"), 3): return "角色试炼队伍无效"
			members.append(member.id)
		if not _strings(members, 5) or not ticket.characterId in members: return "角色试炼主试未编入队伍"
		if ticket.get("method") != null and GameData.named(GameData.economy("METHODS"), ticket.method).is_empty(): return "角色试炼法门无效"
		if ticket.get("pill") != null and not ticket.pill in ["training", "ward", "heal", "cleanse"]: return "角色试炼丹药无效"
	if not _strings(s.get("claimedMockReceipts", [])): return "模拟回执记录无效"
	if not s.get("claimedMockReceipts", []).is_empty() and (not s.get("mockAccount") or not s.get("mockRealm") or s.demo != null): return "模拟回执不能进入普通或展示档"
	return ""
