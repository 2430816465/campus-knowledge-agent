extends SceneTree
class LateFailStore extends GameStore:
	var reject_commit: bool = false
	var rejected_equipment: Dictionary = {}
	func _commit(value: Dictionary, backup: bool) -> Dictionary:
		if reject_commit:
			rejected_equipment = value.equipment.duplicate(true)
			return {"ok": false, "error": "test: disk failed after equipment roll"}
		return super._commit(value, backup)
var checks: int = 0
var failures: Array = []
func check(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures.append(message)
		push_error(message)
func state(seed_value: int = 1700000000000) -> Dictionary:
	var s: Dictionary = GameEconomy.create_state(seed_value)
	GameEquipment.ensure_state(s)
	s.resources.stone = 900000
	s.items["relic-essence"] = 999
	return s
func action(s: Dictionary, name: String, args: Dictionary = {}) -> Dictionary:
	var result: Dictionary = GameEquipment.command(s, name, args)
	check(result.ok, name + ": " + str(result.error))
	return result
func rejected(s: Dictionary, name: String, args: Dictionary = {}) -> void:
	var before: String = JSON.stringify(s)
	var result: Dictionary = GameEquipment.command(s, name, args)
	check(not result.ok, name + " must reject")
	check(JSON.stringify(s) == before, name + " rejection preserves all assets and RNG")
func _initialize() -> void:
	_test_random_rolls()
	_test_transactions()
	_test_sets_and_power()
	_test_filter_and_recovery()
	_test_validation()
	_test_store()
	_test_real_battle_rewards()
	_test_reload_progression()
	_test_late_write_failure()
	print("EQUIPMENT CHECKS: %d, FAILURES: %d" % [checks, failures.size()])
	quit(0 if failures.is_empty() else 1)

func _test_random_rolls() -> void:
	var initial_counts: Dictionary = {}
	var tiers: Dictionary = {}
	var mains: Dictionary = {}
	for seed_value in range(1, 601):
		var s: Dictionary = state(seed_value * 73471)
		s.equipment.randomState = seed_value * 73471
		var rarity: int = 3 + seed_value % 3
		var slot: String = GameEquipment.slots()[seed_value % 5].id
		var original_rng: Dictionary = s.randomStreams.duplicate(true)
		var dropped: Dictionary = GameEquipment.grant_drop(s, {"rarity": rarity, "slot": slot, "sourceId": "test-combat"})
		check(not dropped.is_empty(), "drop exists seed%d" % seed_value)
		check(GameEquipment.validate(s).is_empty(), "legal initial artifact seed%d" % seed_value)
		if slot == "flower": check(dropped.mainStat == "hpFlat", "flower fixed HP")
		if slot == "feather": check(dropped.mainStat == "atkFlat", "feather fixed ATK")
		check(dropped.initialCount in [rarity - 2, rarity - 1], "correct initial count for rarity")
		initial_counts[str(rarity) + ":" + str(dropped.initialCount)] = true
		mains[dropped.mainStat] = true
		var before: String = JSON.stringify(s)
		for j in range(4):
			var preview: Dictionary = GameEquipment.enhance_preview(s, dropped.id, GameEquipment.max_level(rarity))
			check(preview.ok and preview.data.affordable, "max level affordable preview")
		check(before == JSON.stringify(s), "repeated previews do not roll RNG or mutate")
		var result: Dictionary = action(s, "enhanceArtifact", {"id": dropped.id, "targetLevel": GameEquipment.max_level(rarity)})
		var finished: Dictionary = GameEquipment.item(s, dropped.id)
		check(finished.level == GameEquipment.max_level(rarity), "12/16/20 maximum")
		check(finished.mainValue > dropped.mainValue, "main grows with level")
		check(finished.substats.size() == 4, "max4 distinct substats")
		check(finished.enhancements.size() == rarity, "every4 upgrade event count")
		check(GameEquipment.validate(s).is_empty(), "legal final artifact seed%d" % seed_value)
		for sub in finished.substats:
			check(sub.stat != finished.mainStat, "main excluded from subs")
			for tier in sub.rolls: tiers[tier] = true
		check(s.randomStreams == original_rng, "equipment RNG does not consume summon/battle/expedition streams")
		check(result.data.changes.size() == rarity, "all milestones returned for UI")
		var a: Dictionary = state(seed_value * 73471)
		a.equipment.randomState = seed_value * 73471
		var again: Dictionary = GameEquipment.grant_drop(a, {"rarity": rarity, "slot": slot, "sourceId": "test-combat"})
		action(a, "enhanceArtifact", {"id": again.id, "targetLevel": GameEquipment.max_level(rarity)})
		check(a.equipment == s.equipment, "same saved RNG reproduces complete result")
		if seed_value <= 12: rejected(s, "enhanceArtifact", {"id": dropped.id, "targetLevel": GameEquipment.max_level(rarity) + 1})
	check(initial_counts.size() == 6, "all legal initial counts observed")
	check(tiers.size() == 4, "all four roll quality tiers observed")
	check(mains.size() == 10, "all supported main stats observed")

func _test_transactions() -> void:
	var s: Dictionary = state()
	var a: Dictionary = GameEquipment.grant_drop(s, {"rarity": 5, "slot": "flower"})
	var before: Dictionary = s.duplicate(true)
	var preview: Dictionary = GameEquipment.enhance_preview(s, a.id, 4)
	var result: Dictionary = action(s, "enhanceArtifact", {"id": a.id, "targetLevel": 4, "txid": "once"})
	check(int(before.resources.stone) - int(s.resources.stone) == int(preview.data.costs.stone), "stone cost exact")
	check(int(before.items["relic-essence"]) - int(s.items["relic-essence"]) == int(preview.data.essence), "essence cost exact")
	check(result.data.item.mainValue == preview.data.mainAfter, "deterministic main preview exact")
	var after: String = JSON.stringify(s)
	action(s, "enhanceArtifact", {"id": a.id, "targetLevel": 4, "txid": "once"})
	check(after == JSON.stringify(s), "txid retry idempotent no reroll/no spend")
	rejected(s, "enhanceArtifact", {"id": a.id, "targetLevel": 8, "txid": "once"})
	rejected(s, "enhanceArtifact", {"id": a.id, "targetLevel": 7.5})
	s.resources.stone = 0
	rejected(s, "enhanceArtifact", {"id": a.id, "targetLevel": 8})
	s.resources.stone = 900000
	s.items["relic-essence"] = 0
	rejected(s, "enhanceArtifact", {"id": a.id, "targetLevel": 8})
	var b: Dictionary = GameEquipment.grant_drop(s, {"rarity": 4})
	action(s, "lockArtifact", {"id": b.id, "value": true})
	rejected(s, "salvageArtifacts", {"ids": [b.id]})
	rejected(s, "enhanceArtifact", {"id": a.id, "targetLevel": 8, "consumeIds": [b.id]})
	action(s, "lockArtifact", {"id": b.id, "value": false})
	action(s, "favoriteArtifact", {"id": b.id, "value": true})
	rejected(s, "salvageArtifacts", {"ids": [b.id]})
	action(s, "favoriteArtifact", {"id": b.id, "value": false})
	action(s, "equipArtifact", {"id": b.id, "characterId": "nezha"})
	rejected(s, "salvageArtifacts", {"ids": [b.id]})
	rejected(s, "equipArtifact", {"id": b.id, "characterId": "bigan"})
	action(s, "unequipArtifact", {"characterId": "nezha", "slot": b.slot})
	rejected(s, "salvageArtifacts", {"ids": [b.id, b.id]})
	s.items["relic-essence"] = 999
	rejected(s, "salvageArtifacts", {"ids": [b.id]})
	s.items["relic-essence"] = 0
	var salvaged: Dictionary = action(s, "salvageArtifacts", {"ids": [b.id], "txid": "salvage-once"})
	check(GameEquipment.item(s, b.id).is_empty() and s.items["relic-essence"] == salvaged.data.essence, "salvage real assets")
	after = JSON.stringify(s)
	action(s, "salvageArtifacts", {"ids": [b.id], "txid": "salvage-once"})
	check(after == JSON.stringify(s), "salvage repeat cannot duplicate assets")
	var rewarded: Dictionary = GameEquipment.reward_drops(s, "victory-1", {"stageId": 12}, 2)
	check(rewarded.ok and rewarded.data.items.size() == 2, "real victory hook gives2 drops")
	after = JSON.stringify(s)
	check(GameEquipment.reward_drops(s, "victory-1", {"stageId": 1}, 1).ok, "reward retry returns old result")
	check(after == JSON.stringify(s), "reward retry doesn't roll or add")
	check(not GameEquipment.command(s, "grantArtifact").ok, "no public free-drop command")

func _test_sets_and_power() -> void:
	var s: Dictionary = state()
	var power_before: int = GameEquipment.character_power(s, "nezha")
	var no_gear: Dictionary = GameCombat.member_stats({"id": "nezha", "level": s.owned.nezha.level, "treasure": s.owned.nezha.treasure})
	var shown: Dictionary = GameEquipment.character_stats(s, "nezha")
	check(shown.hp == no_gear.maxHp and shown.atk == no_gear.atk and shown.def == no_gear.def, "no gear UI math equals combat")
	check(GameEquipment.stats_for(s, "nezha").is_empty(), "no gear hook truly empty")
	for i in range(5):
		var a: Dictionary = GameEquipment.grant_drop(s, {"rarity": 5, "slot": GameEquipment.slots()[i].id, "setId": "void-slayer"})
		action(s, "equipArtifact", {"id": a.id, "characterId": "nezha"})
		var bonuses: Array = GameEquipment.set_bonuses(s, "nezha")
		check(bonuses.size() == (0 if i == 0 else 1 if i < 3 else 2), "2/4set bonuses threshold")
	var gear: Dictionary = GameEquipment.stats_for(s, "nezha")
	check(gear.atkPercent >= 0.18 and gear.damageBonus >= 0.15, "two and four piece actual stats")
	var actual: Dictionary = GameCombat.member_stats({"id": "nezha", "level": s.owned.nezha.level, "treasure": s.owned.nezha.treasure, "equipmentStats": gear})
	shown = GameEquipment.character_stats(s, "nezha")
	check(shown.hp == actual.maxHp and shown.atk == actual.atk and shown.def == actual.def and shown.speed == actual.speed, "equipment UI stats equal combat stats")
	check(shown.critRate == actual.critRate and shown.critDamage == actual.critDamage, "crit math equals combat")
	check(GameEquipment.character_power(s, "nezha") > power_before, "equipped actual stats increase indicator")
	var sum: int = 0
	for id in s.team: sum += GameEquipment.character_power(s, id)
	check(sum == GameEquipment.team_power(s), "team power is sum without victory gating")
	var frozen: Dictionary = gear.duplicate(true)
	var first: Dictionary = s.equipment.items[0]
	action(s, "enhanceArtifact", {"id": first.id, "targetLevel": 4})
	check(frozen == gear, "returned stat snapshot not aliased to future enhancement")
	var new_drop: Dictionary = GameEquipment.grant_drop(s, {"rarity": 5, "slot": "flower", "setId": "green-lotus"})
	action(s, "enhanceArtifact", {"id": new_drop.id, "targetLevel": 20})
	action(s, "equipBestArtifacts", {"characterId": "bigan"})
	for id in s.equipment.equipped.nezha.values(): check(not id in s.equipment.equipped.get("bigan", {}).values(), "autoequip doesn't steal")
	check(GameEquipment.validate(s).is_empty(), "equipped complete state validates")

func _test_filter_and_recovery() -> void:
	var s: Dictionary = state()
	var target: Dictionary = GameEquipment.grant_drop(s, {"rarity": 5, "slot": "flower"})
	var feed: Dictionary = GameEquipment.grant_drop(s, {"rarity": 4, "slot": "feather"})
	action(s, "enhanceArtifact", {"id": feed.id, "targetLevel": 8})
	var feed_now: Dictionary = GameEquipment.item(s, feed.id)
	var recovered: int = GameEquipment.feed_xp(feed_now)
	check(recovered == 200 + int(floor(feed_now.xp * 0.8)), "feeding recovers80percent plus raritybase")
	var p: Dictionary = GameEquipment.enhance_preview(s, target.id, 4, [feed.id])
	check(p.ok and p.data.materialXp == recovered and p.data.targetLevel >= 4, "feeding preview shows any overlevel before confirming")
	action(s, "enhanceArtifact", {"id": target.id, "targetLevel": 4, "consumeIds": [feed.id]})
	check(GameEquipment.item(s, feed.id).is_empty(), "feeding destroys exactly consumed artifact")
	check(GameEquipment.item(s, target.id).xp == p.data.finalXp, "feeding preview XP exact")
	rejected(s, "enhanceArtifact", {"id": target.id, "targetLevel": 12, "consumeIds": [target.id]})
	action(s, "favoriteArtifact", {"id": target.id, "value": true})
	var before: String = JSON.stringify(s)
	var found: Array = GameEquipment.items(s, {"slot": "flower", "rarity": 5, "favorite": true}, "newest")
	check(found.size() == 1 and found[0].id == target.id, "filters and sorting match")
	found[0].level = 999
	check(before == JSON.stringify(s), "filtered rows are safe copies")
	var encoded: String = GameStore.encode_save(s)
	var decoded: Dictionary = GameStore.decode_save(encoded)
	if not decoded.ok: print("DECODE FAILURE: ", decoded)
	elif not _same(decoded.data.equipment, s.equipment): _diff(decoded.data.equipment, s.equipment, "equipment")
	check(decoded.ok and _same(decoded.data.equipment, s.equipment), "save/export/import preserves all rolls and RNG")
	var normal: Dictionary = GameEconomy.create_state(1024)
	var demo: Dictionary = GameEconomy.demo_state("start", 1024)
	if demo.is_empty():
		var first_preset: String = str(GameData.all().demoStates.keys()[0])
		demo = GameEconomy.demo_state(first_preset, 1024)
	GameEquipment.ensure_state(demo)
	var normal_before: String = JSON.stringify(normal)
	GameEquipment.reward_drops(demo, "demo-win", {"stageId": 12}, 3)
	check(JSON.stringify(normal) == normal_before, "demo drop and RNG isolated from normal")

func _test_validation() -> void:
	var s: Dictionary = state()
	var a: Dictionary = GameEquipment.grant_drop(s, {"rarity": 5})
	action(s, "enhanceArtifact", {"id": a.id, "targetLevel": 20})
	for defect in ["main", "duplicate", "tier", "history", "level", "rng", "equipped", "xp"]:
		var broken: Dictionary = s.duplicate(true)
		var gear: Dictionary = broken.equipment.items[0]
		match defect:
			"main": gear.mainValue += 5
			"duplicate": gear.substats[1].stat = gear.substats[0].stat
			"tier": gear.substats[0].rolls[0] = 10
			"history": gear.enhancements[0].value = 999
			"level": gear.level = 21
			"rng": broken.equipment.randomState = 0
			"equipped": broken.equipment.equipped = {"nezha": {gear.slot: gear.id}, "bigan": {gear.slot: gear.id}}
			"xp": gear.xp = -1
		check(not GameEquipment.validate(broken).is_empty(), "reject corrupted equipment " + defect)
	var overflow: Dictionary = state()
	for i in range(500): GameEquipment.grant_drop(overflow, {"rarity": 3})
	var rng: int = int(overflow.equipment.randomState)
	var full: Dictionary = GameEquipment.reward_drops(overflow, "full-bag", {}, 2)
	check(full.ok and full.data.overflowStone == 200 and full.data.items.is_empty(), "full bag converts openly instead of locking victory")
	check(overflow.equipment.items.size() == 500 and overflow.equipment.randomState == rng, "overflow neither exceeds cap nor consumes RNG")

func _test_store() -> void:
	var directory: String = "user://equipment-tests-" + str(Time.get_ticks_usec())
	var store: GameStore = GameStore.new(directory)
	check(store.load_slot("normal").ok, "equipment store normal slot")
	store.state.resources.stone = 50000
	store.state.items["relic-essence"] = 100
	var a: Dictionary = GameEquipment.grant_drop(store.state, {"rarity": 5})
	check(store._commit(store.state, true).ok, "fixture persisted before transaction")
	var before: String = JSON.stringify(store.state)
	store.fail_writes = true
	var result: Dictionary = store.transact("enhanceArtifact", {"id": a.id, "targetLevel": 4, "txid": "saved-enhance"})
	check(not result.ok and JSON.stringify(store.state) == before, "failed save preserves item/RNG/assets")
	store.fail_writes = false
	var clone: Dictionary = store.state.duplicate(true)
	var expected: Dictionary = GameEquipment.command(clone, "enhanceArtifact", {"id": a.id, "targetLevel": 4, "txid": "saved-enhance"})
	result = store.transact("enhanceArtifact", {"id": a.id, "targetLevel": 4, "txid": "saved-enhance"})
	check(result.ok and expected.ok and store.state.equipment == clone.equipment, "retry saved upgrade same deterministic roll")
	var normal_gear: Dictionary = store.state.equipment.duplicate(true)
	store.release()
	check(store.load_slot("normal").ok and _same(store.state.equipment, normal_gear), "reload doesn't reroll")
	var demo_slot: String = "demo:" + str(GameData.economy("DEMO_PRESETS")[0].id)
	check(store.load_slot(demo_slot).ok, "separate demo equipment store")
	GameEquipment.grant_drop(store.state, {"rarity": 5})
	check(store._commit(store.state, true).ok, "demo gear persisted separately")
	store.release()
	check(store.load_slot("normal").ok and _same(store.state.equipment, normal_gear), "normal remains unchanged after demo")
	store.release()

func _diff(a: Variant, b: Variant, path: String) -> void:
	if a is Dictionary and b is Dictionary:
		for key in a:
			if not b.has(key): print("DIFF new key ", path, ".", key)
			elif a[key] != b[key]: _diff(a[key], b[key], path + "." + str(key))
		for key in b:
			if not a.has(key): print("DIFF missing key ", path, ".", key)
	elif a is Array and b is Array:
		if a.size() != b.size(): print("DIFF sizes ", path)
		else:
			for i in range(a.size()):
				if a[i] != b[i]: _diff(a[i], b[i], path + "[" + str(i) + "]")
	else: print("DIFF ", path, ": ", a, " vs ", b, " types ", typeof(a), " / ", typeof(b))

func _same(a: Variant, b: Variant) -> bool: return GameData.normalize(a) == GameData.normalize(b)

func _fight(request: Dictionary) -> Dictionary:
	var battle: Dictionary = GameCombat.create(int(request.stageId), request.team, request.options)
	check(not battle.has("error"), "native battle created")
	var steps: int = 0
	while battle.get("result") == null and steps < 2000:
		if not GameCombat.auto_act(battle): break
		steps += 1
	check(battle.get("result") != null, "native battle reaches terminal result")
	return battle
func _test_real_battle_rewards() -> void:
	var s: Dictionary = state()
	for id in s.team: s.owned[id].level = 20
	var gear: Dictionary = GameEquipment.grant_drop(s, {"rarity": 5, "slot": "feather"})
	action(s, "equipArtifact", {"id": gear.id, "characterId": "nezha"})
	var prepared: Dictionary = GameEconomy.command(s, "prepareMainBattle", {"stageId": 1}, int(s.lastTime))
	check(prepared.ok, "real battle accepts gear")
	var locked_stats: Dictionary = s.mainBattle.team[0].get("equipmentStats", {}).duplicate(true)
	action(s, "enhanceArtifact", {"id": gear.id, "targetLevel": 20})
	check(s.mainBattle.team[0].get("equipmentStats", {}) == locked_stats, "active battle gear snapshot frozen across upgrade")
	var battle: Dictionary = _fight(prepared.data)
	check(battle.result == "win", "real battle fixture wins without altering result")
	var before_count: int = s.equipment.items.size()
	var settled: Dictionary = GameEconomy.command(s, "settleMainBattle", {"battle": battle}, int(s.lastTime))
	check(settled.ok and settled.data.get("won", false), "actual equipped victory settles")
	check(s.equipment.items.size() == before_count + 1 and settled.data.equipment.items.size() == 1, "main victory creates one real artifact")
	var after: String = JSON.stringify(s)
	check(GameEconomy.command(s, "settleMainBattle", {"battle": battle}, int(s.lastTime)).ok, "same battle retry accepted idempotently")
	check(JSON.stringify(s) == after, "real battle duplicate does not create gear")
	var no_reward: Dictionary = state()
	check(GameEconomy.command(no_reward, "settleVictory", {"battleId": "legacy-only", "stageId": 1}, int(no_reward.lastTime)).ok, "legacy helper remains compatible")
	check(no_reward.equipment.items.is_empty(), "legacy direct helper not free artifact faucet")
	var challenge: Dictionary = GameEconomy.command(s, "prepareCharacterChallenge", {"characterId": "nezha", "tier": 1}, int(s.lastTime))
	check(challenge.ok, "character challenge prepares")
	if challenge.ok:
		var challenge_battle: Dictionary = _fight(challenge.data)
		check(challenge_battle.result == "win", "actual character challenge win")
		before_count = s.equipment.items.size()
		var result: Dictionary = GameEconomy.command(s, "settleCharacterChallenge", {"battle": challenge_battle}, int(s.lastTime))
		check(result.ok and s.equipment.items.size() == before_count + 1, "challenge real victory grants one gear")
	check(GameEconomy.validate_state(s).is_empty(), "full economy validates after actual gear battles")
func _test_reload_progression() -> void:
	for seed_value in range(1, 101):
		var source: Dictionary = state(seed_value * 949)
		var gear: Dictionary = GameEquipment.grant_drop(source, {"rarity": 5})
		action(source, "enhanceArtifact", {"id": gear.id, "targetLevel": 4})
		var decoded: Dictionary = GameStore.decode_save(GameStore.encode_save(source))
		check(decoded.ok, "seeded enhanced save decodes")
		if not decoded.ok: continue
		var resumed: Dictionary = decoded.data
		action(source, "enhanceArtifact", {"id": gear.id, "targetLevel": 20})
		action(resumed, "enhanceArtifact", {"id": gear.id, "targetLevel": 20})
		check(_same(source.equipment, resumed.equipment), "reload midprogress preserves subsequent roll sequence")

func _test_late_write_failure() -> void:
	var store: LateFailStore = LateFailStore.new("user://equipment-late-write-" + str(Time.get_ticks_usec()))
	check(store.load_slot("normal").ok, "late failure fixture normal slot")
	store.state.resources.stone = 50000
	store.state.items["relic-essence"] = 500
	var gear: Dictionary = GameEquipment.grant_drop(store.state, {"rarity": 5})
	check(store._commit(store.state, true).ok, "late failure fixture gear committed")
	var before: String = JSON.stringify(store.state)
	var disk_before: String = FileAccess.get_file_as_string(store._path)
	store.reject_commit = true
	var failed: Dictionary = store.transact("enhanceArtifact", {"id": gear.id, "targetLevel": 20})
	check(not failed.ok and not store.rejected_equipment.is_empty(), "write failure occurs after actual random roll")
	check(store.rejected_equipment.items[0].level == 20 and store.rejected_equipment.randomState != store.state.equipment.randomState, "rejected draft had random milestone outcomes")
	check(JSON.stringify(store.state) == before and FileAccess.get_file_as_string(store._path) == disk_before, "post-roll write failure leaves memory and disk unchanged")
	store.reject_commit = false
	var retry: Dictionary = store.transact("enhanceArtifact", {"id": gear.id, "targetLevel": 20})
	check(retry.ok and store.state.equipment == store.rejected_equipment, "post-roll write retry cannot reroll improved outcomes")
	store.release()
