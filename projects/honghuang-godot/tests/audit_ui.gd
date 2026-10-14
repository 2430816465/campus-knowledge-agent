extends SceneTree
var app: Control
var checks := 0
var failures: Array = []
var layout_observations: Array = []
var audit_phase := "preaudit"
func check(value: bool,label: String) -> void:
	checks += 1
	if not value: failures.append(label); push_error("INDEPENDENT UI: " + label)
func _initialize() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--audit-phase="): audit_phase=arg.trim_prefix("--audit-phase=")
	_run.call_deferred()
func _labels(node: Node) -> Array:
	var result: Array = []
	if node is Button: result.append(node.text)
	for child in node.get_children(): result.append_array(_labels(child))
	return result
func _inspect_layout(node: Node,page_name: String,viewport_width: int) -> void:
	if node is HBoxContainer and node.is_visible_in_tree() and node.get_combined_minimum_size().x > viewport_width - 16:
		layout_observations.append({"page":page_name,"viewport":viewport_width,"minimum_row_width":node.get_combined_minimum_size().x,"buttons":_labels(node)})
	for child in node.get_children(): _inspect_layout(child,page_name,viewport_width)
func _run() -> void:
	app = load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	await process_frame
	check(app.store.base_dir.begins_with("user://ui-tests-"),"UI tests use isolated base directory")
	app._start_main(1)
	await process_frame
	var b: Dictionary = app.last_battle
	var steps := 0
	while b.get("result") == null and steps < 300:
		check(GameCombat.auto_act(b),"real normal UI combat action")
		steps += 1
	check(b.result == "win","normal native battle really wins")
	app._battle_finished(b)
	check(app.settlement.ok,"normal UI battle commits")
	app._leave_battle()
	var gear: Dictionary = app.state().equipment.items[0]
	check(app.command("equipArtifact",{"id":gear.id,"characterId":"nezha"}).ok,"equip real normal drop")
	var extras: Dictionary = GameEquipment.stats_for(app.state(),"nezha").duplicate(true)
	var before: Dictionary = app.state().duplicate(true)
	app.trial_current = true
	app.trial_ids = ["nezha","huangfeihu","bigan"]
	app._start_trial("break")
	await process_frame
	var actual: Dictionary = GameData.named(app.last_battle.units,"nezha")
	check(actual.get("equipmentStats",{}) == extras,"current-build trial snapshots actually equipped attributes")
	check(app.last_battle.trial,"trial really marked no-reward")
	app._leave_battle()
	check(app.state().resources == before.resources and GameData.normalize(app.state().equipment) == GameData.normalize(before.equipment) and app.state().cleared == before.cleared,"enter/leave actual trial preserves normal assets and clears")
	for width in [360,540,800]:
		root.size = Vector2i(width,960)
		await process_frame
		for page in 5:
			app._go(page)
			await process_frame
			_inspect_layout(app,"navigation-%d" % page,width)
		for view in ["gear","mail","shop","idle","mock"]:
			match view:
				"gear": app._gear_bag()
				"mail": app._local_mail()
				"shop": app._shop()
				"idle": app._idle_missions()
				"mock": app._mock_menu()
			await process_frame
			await process_frame
			_inspect_layout(app.overlay,view,width)
		app._close_modal()
	app._load_slot("demo:expedition-project")
	app._start_challenge("nezha",1)
	await process_frame
	check(is_instance_valid(app.battle_view) and app.state().characterChallenges.active != null,"real character challenge enters native battle")
	var frozen: Dictionary = app.state().characterChallenges.active.duplicate(true)
	app._leave_battle()
	check(app.command("resetCharacter",{"id":"nezha"}).ok,"character may be reset outside frozen challenge")
	var next_team: Array = app.state().team.duplicate()
	next_team.erase("nezha")
	check(app.command("setTeam",{"ids":next_team}).ok,"current team may change outside frozen challenge")
	for tab in ["主线","秘境","演武"]:
		app.page = 2; app.subpage = tab; app._render()
		await process_frame
		var labels := _labels(app.body)
		check("继续锁定试炼" in labels and "结束本次试炼" in labels,"active challenge resume and abandon visible on " + tab)
	app._start_challenge("nezha",1)
	await process_frame
	check(is_instance_valid(app.battle_view),"resume challenge after hero reset/removal still enters battle")
	check(app.last_battle.id == frozen.id and app.last_battle.seed == frozen.seed,"resume uses exact original battle and random seed")
	check(GameData.named(app.last_battle.units,"nezha").level == 11,"resumed challenge keeps old real cultivation")
	app._leave_battle()
	check(app.command("abandonCharacterChallenge",{}).ok,"abandon active challenge saves")
	app._start_main(1)
	await process_frame
	check(is_instance_valid(app.battle_view),"ordinary battle access restored after abandon")
	app._leave_battle()
	app._load_slot("normal")
	check(app.state().resources == before.resources and GameData.normalize(app.state().equipment) == GameData.normalize(before.equipment),"demo challenge work never enters normal assets")
	var full_report: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://docs/audits/%s-flow.json" % audit_phase))
	if full_report is Dictionary:
		var path: String = full_report.get("facts",{}).get("all_content_ordinary",{}).get("exported_path","")
		if not path.is_empty():
			check(app.store.import_save(path).ok,"import actual fully progressed ordinary fixture into isolated UI-test slot")
			for facility in app.state().buildings:
				app._show_building(str(facility.id))
				await process_frame
				check(app.modal_box != null,"actual management opens for " + str(facility.type))
				if facility.type in ["alchemy","forge","relicworkshop"]:
					check("加入队列" in _labels(app.modal_box),"actual recipe queue exposed for " + str(facility.type))
			app._close_modal()
	var report := {"label":audit_phase, "utc":Time.get_datetime_string_from_system(true), "checks":checks,"failures":failures,"layout_observations":layout_observations,"visual":false}
	var file := FileAccess.open("res://docs/audits/%s-ui-independent.json" % audit_phase,FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"  ")); file.close()
	app.queue_free()
	await process_frame
	print(JSON.stringify(report))
	quit(0 if failures.is_empty() else 1)
