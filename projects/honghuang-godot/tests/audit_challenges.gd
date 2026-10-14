extends SceneTree
## Independent durable ticket boundary test. Demonstration progression is explicit
## and isolated; battle results are obtained from legal actions, never fabricated.
var checks := 0
var failures: Array = []
var evidence: Array = []
var phase := "preaudit"
var store: GameStore
var now := 0
func check(value: bool, label: String) -> void:
	checks += 1
	if not value: failures.append(label); push_error("CHALLENGE AUDIT: " + label)
func tx(name: String, args: Dictionary = {}) -> Variant:
	var result := store.transact(name, args, now)
	check(result.ok, name + " " + result.get("error", ""))
	return result.get("data")
func finish(request: Dictionary, label: String) -> Dictionary:
	var battle := GameCombat.create(request.stageId, request.team, request.options)
	check(not battle.has("error"), "native create " + label)
	if battle.has("error"): return {}
	var actions := 0
	while battle.result == null and actions < 2000:
		check(GameCombat.auto_act(battle), "legal battle action " + label)
		actions += 1
	check(battle.result == "win", "real victory " + label)
	evidence.append({"label": label, "id": battle.id, "result": battle.result, "actions": battle.actionCount, "rounds": battle.round, "ruleVersion": battle.ruleVersion})
	return battle
func reject(battle: Dictionary, label: String) -> void:
	var before := JSON.stringify(store.state)
	var disk := FileAccess.get_file_as_string(store._path)
	var result := store.transact("settleCharacterChallenge", {"battle": battle}, now)
	check(not result.ok, "reject " + label)
	check(JSON.stringify(store.state) == before and FileAccess.get_file_as_string(store._path) == disk, "full memory/disk rollback " + label)
func _initialize() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--audit-phase="): phase = arg.trim_prefix("--audit-phase=")
	var dir := "user://tests/audit-challenge-%s-%d" % [phase, Time.get_ticks_usec()]
	store = GameStore.new(dir)
	check(store.load_slot("demo:expedition-project").ok, "isolated demonstrator for durable boundary testing")
	now = int(store.state.lastTime)
	var main = tx("prepareMainBattle", {"stageId": 1, "options": {"seed": 5271, "now": now}})
	if main == null: _finish(); return
	var battle := finish(main, "earn equipment in isolated demo")
	if battle.is_empty(): _finish(); return
	tx("settleMainBattle", {"battle": battle})
	var artifact: Dictionary = store.state.equipment.items[0]
	tx("equipArtifact", {"id": artifact.id, "characterId": "nezha"})
	tx("selectPill", {"id": "ward"})
	var pills := int(store.state.items.ward)
	var request = tx("prepareCharacterChallenge", {"characterId": "nezha", "tier": 1})
	if request == null: _finish(); return
	check(int(store.state.items.ward) == pills - 1, "one admission consumes one pill")
	var snapshot: Dictionary = store.state.characterChallenges.active.duplicate(true)
	check(snapshot.has("encounter") and not snapshot.team[0].get("equipmentStats", {}).is_empty(), "real tailored encounter and equipped actor snapshot persisted")
	check(store.export_save(dir.path_join("active-challenge.json")).ok, "real admitted challenge export")
	store.release()
	store = GameStore.new(dir)
	check(store.load_slot("demo:expedition-project").ok, "native active challenge reload")
	check(GameData.normalize(store.state.characterChallenges.active) == GameData.normalize(snapshot), "frozen snapshot survives documented JSON integer normalization")
	tx("resetCharacter", {"id": "nezha"})
	tx("setTeam", {"ids": ["yangjian", "bigan", "huangfeihu"]})
	tx("unequipArtifact", {"characterId": "nezha", "slot": artifact.slot})
	var resumed = tx("prepareCharacterChallenge", {"characterId": "nezha", "tier": 1})
	check(GameData.normalize(resumed) == GameData.normalize(request), "resume after reset/removal/unequip retains frozen fight values")
	var original_fight:=GameCombat.create(request.stageId,request.team,request.options)
	var reloaded_fight:=GameCombat.create(resumed.stageId,resumed.team,resumed.options)
	check(GameData.normalize(original_fight.units)==GameData.normalize(reloaded_fight.units),"original and reloaded snapshots produce identical actual combat unit stats")
	check(int(store.state.items.ward) == pills - 1, "resume never consumes a second pill")
	battle = finish(resumed, "resumed original tailored challenge")
	if battle.is_empty(): _finish(); return
	for change in ["id", "seed", "ruleVersion", "trial", "boons", "enemyId", "enemyMaxHp", "enemyRole", "livingEnemy", "allyLevel", "allyEquipment", "branchAccess", "method", "pill", "noActions", "unfinished"]:
		var fake := battle.duplicate(true)
		match change:
			"id": fake.id += "-other"
			"seed": fake.seed += 1
			"ruleVersion": fake.ruleVersion = "unrecognized-version"
			"trial": fake.trial = true
			"boons": fake.boons = ["unknown"]
			"enemyId": fake.units[-1].id += "-substitute"
			"enemyMaxHp": fake.units[-1].maxHp += 1
			"enemyRole": fake.units[-1].role = "substitute"
			"livingEnemy": fake.units[-1].hp = 1
			"allyLevel": fake.units[0].level += 1
			"allyEquipment": fake.units[0].equipmentStats = {"atkFlat": 100000}
			"branchAccess": fake.units[0].branchUnlocked = not fake.units[0].get("branchUnlocked", false)
			"method": fake.method = "attack"
			"pill": fake.pill = "heal"
			"noActions": fake.actionCount = 0
			"unfinished": fake.result = null
		reject(fake, change)
	var before := JSON.stringify(store.state)
	var disk := FileAccess.get_file_as_string(store._path)
	store.fail_writes = true
	var failed := store.transact("settleCharacterChallenge", {"battle": battle}, now)
	check(not failed.ok and JSON.stringify(store.state) == before and FileAccess.get_file_as_string(store._path) == disk, "failed durable settlement preserves frozen ticket/rewards/RNG")
	store.fail_writes = false
	var clears: Array = store.state.cleared.duplicate()
	var assets: Dictionary = store.state.resources.duplicate(true)
	var count: int = store.state.equipment.items.size()
	var settled = tx("settleCharacterChallenge", {"battle": battle})
	check(settled != null and settled.won and store.state.characterChallenges.active == null and "nezha:1" in store.state.characterChallenges.claimed, "retry settles real win once and clears admission")
	check(store.state.cleared == clears and store.state.equipment.items.size() == count + 1, "reward isolation and exactly one real gear drop")
	for key in assets: check(store.state.resources[key] == assets[key] + int(snapshot.reward.get(key, 0)), "canonical one-time currency " + key)
	reject(battle, "already-settled real battle")
	store.release()
	store = GameStore.new(dir)
	check(store.load_slot("demo:expedition-project").ok and "nezha:1" in store.state.characterChallenges.claimed, "completed real claim durably reloads")
	check(GameEconomy.validate_state(store.state).is_empty(), "valid durable postchallenge state")
	var version_probe := GameEconomy.demo_state("expedition-project", now)
	var new_request := GameEconomy.command(version_probe, "prepareCharacterChallenge", {"characterId": "nezha", "tier": 2}, now)
	check(new_request.ok, "prepare distinct encounter version probe")
	if new_request.ok:
		var tampered := version_probe.duplicate(true)
		tampered.characterChallenges.active.encounterVersion = "incompatible-encounter"
		check(not GameStore.decode_save(GameStore.encode_save(tampered)).ok, "reject incompatible encounter version even with fresh envelope checksum")
		tampered = version_probe.duplicate(true)
		tampered.characterChallenges.active.encounter.enemies[0].atk += 1
		check(not GameStore.decode_save(GameStore.encode_save(tampered)).ok, "reject changed enemy rules even with fresh envelope checksum")
		version_probe.characterChallenges.active.erase("encounter")
		version_probe.characterChallenges.active.erase("encounterVersion")
		var legacy := GameStore.decode_save(GameStore.encode_save(version_probe))
		check(legacy.ok, "older pre-tailored admitted ticket is retained for compatible recovery")
		if legacy.ok:
			var legacy_request := GameEconomy.command(legacy.data, "prepareCharacterChallenge", {"characterId": "nezha", "tier": 2}, now)
			check(legacy_request.ok and not legacy_request.data.options.has("enemies"), "older ticket resumes its original mainline enemy rules")
			var old_battle := finish(legacy_request.data, "legacy admitted challenge")
			check(not old_battle.is_empty() and GameEconomy.command(legacy.data, "settleCharacterChallenge", {"battle": old_battle}, now).ok, "legacy actual victory settles after migration")
	_finish()
func _finish() -> void:
	if store: store.release()
	var report := {"phase": phase, "utc": Time.get_datetime_string_from_system(true), "checks": checks, "failures": failures, "actual_battles": evidence, "scope": "Isolated demonstration progression for negative boundaries; actual legal native combat and durable Store operations; not ordinary progression evidence."}
	var file := FileAccess.open("res://docs/audits/%s-challenges.json" % phase, FileAccess.WRITE)
	file.store_string(JSON.stringify(report, "  ")); file.close()
	print(JSON.stringify(report))
	quit(0 if failures.is_empty() else 1)
