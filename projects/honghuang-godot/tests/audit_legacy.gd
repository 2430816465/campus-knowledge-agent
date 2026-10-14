extends SceneTree
var checks := 0
var failures: Array = []
var evidence: Array = []
var phase := "preaudit"
func check(value: bool,label: String) -> void:
	checks += 1
	if not value: failures.append(label); push_error("LEGACY AUDIT: " + label)
func tx(store: GameStore,name: String,args: Dictionary = {}) -> Variant:
	var result := store.transact(name,args,int(store.state.lastTime))
	check(result.ok,name + ": " + result.get("error",""))
	return result.get("data")
func run_battle(req: Dictionary) -> Dictionary:
	var battle := GameCombat.create(req.stageId,req.team,req.options)
	var steps := 0
	while battle.get("result") == null and steps < 1000:
		var actor := GameCombat.current_actor(battle)
		if actor.get("side") == "ally" and battle.method and int(battle.methodUses) == 0: GameCombat.use_method(battle)
		check(GameCombat.auto_act(battle),"legacy-restored native combat action")
		steps += 1
	check(battle.get("result") == "win","legacy-restored actual battle wins")
	evidence.append({"battleId":battle.id,"stage":battle.stageId,"result":battle.result,"actions":steps})
	return battle
func _initialize() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--audit-phase="): phase=arg.trim_prefix("--audit-phase=")
	var fixtures: Array = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/legacy-saves.json"))
	for fixture in fixtures:
		var directory := "user://tests/audit-legacy-%s-%d" % [fixture.id,Time.get_ticks_usec()]
		var store := GameStore.new(directory)
		check(store.load_slot("normal").ok,"create isolated legacy destination")
		var source := directory.path_join("untouched-browser-export.json")
		var file := FileAccess.open(source,FileAccess.WRITE);file.store_string(fixture.encoded);file.close()
		check(store.import_save(source).ok,"actual legacy file import " + fixture.id)
		check(FileAccess.get_file_as_string(source) == fixture.encoded,"original browser export bytes untouched")
		var expected_resources: Dictionary = GameData.normalize(fixture.state.resources)
		check(store.state.resources == expected_resources,"all legacy resources preserved " + fixture.id)
		var expected_team: Array = store.state.team.duplicate()
		store.release()
		store = GameStore.new(directory)
		check(store.load_slot("normal").ok and store.state.resources == expected_resources and store.state.team == expected_team,"legacy import survives process-level native reload")
		if store.state.expeditions.active:
			var run_id: String = store.state.expeditions.active.id
			var safety := 0
			while store.state.expeditions.active.status != "complete" and safety < 10:
				if store.state.expeditions.active.status == "choice": tx(store,"chooseBoon",{"id":GameExpedition.expedition_candidates(store.state)[0]})
				else:
					var req = tx(store,"prepareExpeditionBattle")
					if req: tx(store,"settleExpeditionBattle",{"battle":run_battle(req)})
				safety += 1
			tx(store,"closeExpedition",{"runId":run_id})
			check(store.state.expeditions.active == null,"restored old active expedition completes actual route")
		else:
			var req = tx(store,"prepareMainBattle",{"stageId":1,"options":{"seed":96315,"now":store.state.lastTime}})
			if req: tx(store,"settleMainBattle",{"battle":run_battle(req)})
		check(GameEconomy.validate_state(store.state).is_empty(),"legacy progressed post-recovery state validates")
		store.release()
	var report := {"phase":phase,"utc":Time.get_datetime_string_from_system(true),"fixtures":fixtures.size(),"checks":checks,"failures":failures,"actual_battles":evidence}
	var out := FileAccess.open("res://docs/audits/%s-legacy.json" % phase,FileAccess.WRITE);out.store_string(JSON.stringify(report,"  "));out.close()
	print(JSON.stringify(report))
	quit(0 if failures.is_empty() else 1)
