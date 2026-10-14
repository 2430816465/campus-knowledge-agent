extends SceneTree
## Ordinary new-save integration: commands and native combat only, no asset grants/clear edits.
var checks = 0
var failures: Array = []
var store: GameStore
var clock_ms = 0
var flow_evidence: Array = []
func check(value: bool, label: String) -> void:
	checks += 1
	if not value:
		failures.append(label)
		push_error(label)
func tx(name: String, args: Dictionary = {}) -> Variant:
	var result = store.transact(name, args, clock_ms)
	check(result.get("ok", false), name + ": " + str(result.get("error", "")))
	return result.get("data")
func construct(type: String, plot: String) -> String:
	var b = tx("build", {"type": type, "plot": plot})
	if b == null: return ""
	clock_ms += 46000
	tx("advance")
	check(GameEconomy.building(store.state, b.id).readyAt == 0, "construction complete")
	return b.id
func finish(b: Dictionary, manual: bool = false) -> void:
	var steps = 0
	var manual_actions = 0
	while b.get("result") == null and steps < 2000:
		var actor = GameCombat.current_actor(b)
		if not actor.is_empty() and actor.side == "ally" and b.round >= 2 and not b.methodUses and b.method: GameCombat.use_method(b)
		if manual and not b.get("autoOnly",false) and not actor.is_empty() and actor.side == "ally":
			var kind = "skill" if actor.id == "nezha" and actor.cd == 0 else "attack"
			var targets = GameCombat.legal_targets(b, kind)
			check(not targets.is_empty(), "manual target exists")
			if targets.is_empty(): break
			check(GameCombat.act(b, {"kind": kind, "targetId": targets[0]}), "manual action")
			manual_actions += 1
		else:
			check(GameCombat.auto_act(b), "automatic legal action")
		steps += 1
	check(b.get("result") == "win", "real battle wins: %s %s" % [b.get("id"), b.get("log", []).slice(-6)])
	if manual: check(manual_actions == 0 if b.get("autoOnly",false) else manual_actions > 0, "admitted battle follows its saved control mode")
	flow_evidence.append({"battleId": b.id, "stageId": b.stageId, "rounds": b.round, "steps": steps, "result": b.result, "manualActions": manual_actions})
func _initialize() -> void:
	for gift in ["yangjian", "zhaogongming", "yunxiao"]:
		_flow(gift)
	var f = FileAccess.open("res://docs/Godot-ordinary-flow-evidence.json", FileAccess.WRITE)
	f.store_string(JSON.stringify({"environment": "Godot 4.6.3 headless; native Store/Economy/Combat/Expedition", "injected": "Isolated command clocks and deterministic RNG only. No resource grants, demo import, manual progress edits or sweeps.", "screenTest": false, "checks": checks, "failures": failures, "battles": flow_evidence}, "  "))
	f.close()
	print("ORDINARY FLOW CHECKS: %d, FAILURES: %d, ACTUAL BATTLES: %d" % [checks, failures.size(), flow_evidence.size()])
	quit(0 if failures.is_empty() else 1)
func _flow(gift: String) -> void:
	store = GameStore.new("user://test-economy-flow-%s-%d" % [gift, Time.get_ticks_usec()])
	# Start this ordinary fixture at noon so its explicit 20-minute command
	# clock cannot cross midnight and correctly reset the daily objectives.
	clock_ms = 1800014400000
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(store.base_dir))
	var fresh: FileAccess = FileAccess.open(store.base_dir.path_join("normal.json"), FileAccess.WRITE)
	fresh.store_string(GameStore.encode_save(GameEconomy.create_state(clock_ms)))
	fresh.close()
	check(store.load_slot("normal").ok, "fresh normal slot")
	clock_ms = int(store.state.lastTime)
	check(store.state.resources.ticket == 12 and store.state.owned.size() == 3, "real base economy")
	var rng_step = [0]
	var draw = tx("summon", {"count": 1, "txid": "first-draw", "rng": func():
		var value = 0.01 if rng_step[0] % 2 == 0 else 0.0
		rng_step[0] += 1
		return value
	})
	if draw == null: return
	check(draw[0].id == "nezha" and draw[0].duplicate and store.state.resources.ticket == 11, "starter duplicate, no draw luck")
	if gift == "zhaogongming":
		tx("upgradeCharacter", {"id": "nezha"})
		tx("upgradeCharacter", {"id": "nezha"})
	var farm = construct("farm", "p2")
	var library = construct("library", "p3")
	tx("researchMethod", {"id": "ward"})
	clock_ms += 60000
	tx("harvest")
	construct("arena", "p4")
	tx("claimTask", {"id": "build"})
	tx("claimTask", {"id": "harvest"})
	var forge = ""
	for stage in range(1, 13):
		if stage in [4, 8, 12]:
			var level = 3 if stage == 4 else 7 if stage == 8 else 11
			for id in store.state.team.duplicate():
				while store.state.owned[id].level < level:
					if tx("upgradeCharacter", {"id": id}) == null: return
			tx("switchBranch", {"id": "bigan", "branch": "B"})
		var request = tx("prepareMainBattle", {"stageId": stage, "options": {"seed": 6000 + stage, "now": clock_ms}})
		if request == null: return
		var b = GameCombat.create(request.stageId, request.team, request.options)
		check(not b.has("error"), "create actual battle")
		if b.has("error"): return
		finish(b, stage == 1)
		var result = tx("settleMainBattle", {"battle": b})
		if result == null or not result.get("won", false): return
		check(result.first, "first actual clear")
		var resources = store.state.resources.duplicate(true)
		tx("settleMainBattle", {"battle": b})
		check(store.state.resources == resources, "duplicate actual result no reward")
		if stage == 3: tx("chooseGift", {"id": gift})
		if stage % 4 == 0:
			tx("integrateCore", {"id": "spring" if stage == 4 else "furnace" if stage == 8 else "thunder"})
			if stage == 4:
				forge = construct("forge", "p5")
				var alchemy = construct("alchemy", "p6")
				for id in store.state.team: tx("repairTreasure", {"id": id})
				tx("queueRecipe", {"id": forge, "recipeId": "refine"})
				tx("queueRecipe", {"id": alchemy, "recipeId": "ward"})
				clock_ms += 60000
				tx("harvest")
				tx("selectPill", {"id": "ward"})
		clock_ms += 60000
	check(store.state.cleared.size() == 12 and store.state.owned.size() == 5, "3 chapters guaranteed team")
	for id in ["estate", "battle", "cultivation", "summary"]: tx("claimDailyTask", {"id": id})
	for route in ["danfire", "thundermarsh"]:
		var run_id = "route-%s-%s" % [gift, route]
		tx("startExpedition", {"routeId": route, "options": {"id": run_id, "seed": 681, "now": clock_ms}})
		var nodes = 0
		while store.state.expeditions.active and store.state.expeditions.active.status != "complete" and nodes < 10:
			if store.state.expeditions.active.status == "choice":
				var choices = GameExpedition.expedition_candidates(store.state)
				tx("chooseBoon", {"id": choices[0]})
			else:
				var req = tx("prepareExpeditionBattle")
				if req == null: return
				var battle = GameCombat.create(req.stageId, req.team, req.options)
				finish(battle)
				var result = tx("settleExpeditionBattle", {"battle": battle})
				if result == null or not result.won: return
			nodes += 1
		var summary = tx("closeExpedition", {"runId": run_id})
		if summary == null: return
		check(summary.complete and summary.reward.ticket == 0 and summary.reward.fate == 0, "real complete route rewards")
		tx("closeExpedition", {"runId": run_id})
	tx("beginThunderProject")
	tx("submitThunderStage", {"stage": "survey"})
	tx("queueRecipe", {"id": forge, "recipeId": "thunder-component"})
	clock_ms += 60000
	tx("harvestBuilding", {"id": forge})
	tx("submitThunderStage", {"stage": "prepare"})
	tx("submitThunderStage", {"stage": "stabilize"})
	tx("chooseThunderDirection", {"direction": "forge"})
	tx("queueThunderRepair", {"buildingId": forge, "id": gift})
	clock_ms += 60000
	tx("harvestBuilding", {"id": forge})
	check(store.state.owned[gift].treasure == 2, "real engineered second repair")
	tx("chooseThunderDirection", {"direction": "teaching"})
	tx("selectMethod", {"id": "thunderward"})
	tx("moveBuilding", {"id": farm, "plot": "p8"})
	tx("assign", {"id": library, "characterId": "bigan"})
	tx("upgradeBuilding", {"id": farm})
	clock_ms += 31000
	tx("advance")
	var expected: Dictionary = GameData.normalize(store.state.duplicate(true))
	var directory = store.base_dir
	store.release()
	store = GameStore.new(directory)
	var reloaded = store.load_slot("normal")
	if store.state != expected:
		for key in expected:
			if expected[key] != store.state.get(key): print("RELOAD DIFF ", key, " BEFORE=", expected[key], " AFTER=", store.state.get(key))
	check(reloaded.ok and store.state == expected, "native durable reload exact final state: " + str(reloaded))
	store.release()
