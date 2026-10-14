extends SceneTree
var checks = 0
var failures: Array = []
func check(value: bool, label: String) -> void:
	checks += 1
	if not value:
		failures.append(label)
		push_error(label)
func _initialize() -> void:
	var ids: Dictionary = {}
	var profiles: Dictionary = {}
	var outcomes: Dictionary = {}
	for hero in GameData.content("CHARACTERS"):
		for tier in [1, 2, 3]:
			var encounter = GameEconomy.character_challenge_encounter(hero.id, tier)
			check(not encounter.is_empty(), "encounter " + hero.id)
			check(encounter.focusSkill == hero.skillName and encounter.mechanic.length() > 10, "own skill and tactic " + hero.id)
			profiles[encounter.profile] = true
			for enemy in encounter.enemies:
				check(not ids.has(enemy.id), "globally unique foe " + enemy.id)
				ids[enemy.id] = true
			var s = GameEconomy.demo_state("expedition-project", 1700000000000)
			s.team = [hero.id]
			for partner in ["nezha", "taiyi", "huangfeihu", "leizhenzi", "yangjian"]:
				if not partner in s.team and s.team.size() < 5: s.team.append(partner)
			var row = GameEconomy.character_challenge_status(s, hero.id)[tier - 1]
			check(row.encounterName == encounter.name and row.enemies == encounter.enemies, "UI truthful encounter")
			var request = GameEconomy.command(s, "prepareCharacterChallenge", {"characterId": hero.id, "tier": tier}, int(s.lastTime))
			check(request.ok, "prepare %s:%s %s" % [hero.id, tier, request.error])
			if not request.ok: continue
			check(GameEconomy.validate_state(s).is_empty(), "valid ticket " + hero.id)
			check(request.data.options.enemies == encounter.enemies, "actual tailored enemies")
			var restored = GameStore.decode_save(GameStore.encode_save(s))
			check(restored.ok, "challenge save reload " + hero.id)
			if restored.ok:
				var resumed = GameEconomy.command(restored.data, "prepareCharacterChallenge", {"characterId": hero.id, "tier": tier}, int(s.lastTime))
				check(resumed.ok and resumed.data == request.data, "resume immutable enemies")
			var tampered = s.duplicate(true)
			tampered.characterChallenges.active.encounter.enemies[0].hp += 1
			check(not GameEconomy.validate_state(tampered).is_empty(), "reject changed encounter")
			var battle = GameCombat.create(request.data.stageId, request.data.team, request.data.options)
			var limit = 0
			while battle.result == null and limit < 2000:
				GameCombat.auto_act(battle)
				limit += 1
			check(battle.result in ["win", "lose"], "terminates " + hero.id)
			outcomes[hero.id + ":" + str(tier)] = battle.result
			var fake = battle.duplicate(true)
			fake.units[-1].id = "mainline_fake"
			var before = JSON.stringify(s)
			check(not GameEconomy.command(s, "settleCharacterChallenge", {"battle": fake}, int(s.lastTime)).ok, "reject substitute enemies")
			check(JSON.stringify(s) == before, "rejected result rollback")
			var clears = s.cleared.duplicate()
			var result = GameEconomy.command(s, "settleCharacterChallenge", {"battle": battle}, int(s.lastTime))
			check(result.ok, "settle real challenge " + hero.id + " " + result.error)
			check(s.cleared == clears, "no mainline reward pollution")
			if battle.result == "win":
				check(not GameEconomy.command(s, "settleCharacterChallenge", {"battle": battle}, int(s.lastTime)).ok, "no double reward")
			check(GameEconomy.validate_state(s).is_empty(), "valid after battle " + hero.id)
	check(profiles.size() >= 8, "eight or more genuine tactical profiles")
	check(outcomes.size() == 150, "all 150 battles actually run")
	var report = {"suite": "character_challenges", "checks": checks, "failures": failures, "profiles": profiles.keys(), "battles": outcomes}
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://docs/audits"))
	var f = FileAccess.open("res://docs/audits/character-challenge-tests.json", FileAccess.WRITE)
	f.store_string(JSON.stringify(report, "\t"))
	f.close()
	print("CHARACTER_CHALLENGES ", checks, " checks; failures=", failures.size(), " battles=", outcomes.size())
	quit(0 if failures.is_empty() else 1)
