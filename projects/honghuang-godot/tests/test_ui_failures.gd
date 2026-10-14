extends SceneTree
var checks := 0
var failures: Array=[]
var app: Control
func check(value: bool, message: String) -> void:
	checks+=1
	if not value: failures.append(message); push_error(message)
func _initialize() -> void: _run.call_deferred()
func _labels(node: Node) -> Array:
	var result: Array=[]
	if node is Label: result.append(node.text)
	for child: Node in node.get_children(): result.append_array(_labels(child))
	return result
func _run() -> void:
	app=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	await process_frame
	app._load_slot("demo:expedition-project")
	check(app.command("setTeam",{"ids":["nezha","huangfeihu","bigan"]}).ok,"prepare spare real team slot")
	var before: Dictionary=app.state().duplicate(true)
	app.store.fail_writes=true
	app._quick_join("yangjian")
	check(app.state()==before,"failed quick join preserves exact state")
	check(app.toast_label.text.contains("失败") and not app.toast_label.text.contains("已加入"),"quick join leaves failure visible")
	app.store.fail_writes=false
	app._quick_join("yangjian")
	check(app.state().team.has("yangjian") and app.toast_label.text.contains("已加入"),"quick join retry commits and acknowledges")
	check(app.command("startExpedition",{"routeId":"danfire"}).ok,"start real isolated expedition")
	var guard: int=0
	while app.state().expeditions.active.status!="complete" and guard<12:
		guard+=1
		if app.state().expeditions.active.status=="choice":
			var candidate: Variant=GameExpedition.expedition_candidates(app.state())[0]
			check(app.command("chooseBoon",{"id":candidate.id if candidate is Dictionary else candidate},false).ok,"actual boon choice")
		else:
			var request: Dictionary=app.command("prepareExpeditionBattle",{},false)
			check(request.ok,"prepare real expedition battle")
			if not request.ok: break
			var b: Dictionary=GameCombat.create(request.data.stageId,request.data.team,request.data.options)
			var steps: int=0
			while b.result==null and steps<1000: GameCombat.auto_act(b); steps+=1
			check(b.result=="win","actual expedition battle wins")
			check(app.command("settleExpeditionBattle",{"battle":b},false).ok,"actual expedition node settlement")
			if b.result!="win": break
	check(app.state().expeditions.active.status=="complete","real completed expedition reaches claim")
	before=app.state().duplicate(true)
	app.store.fail_writes=true
	app._continue_expedition()
	check(app.state()==before,"failed expedition claim preserves pending rewards and state")
	check(app.toast_label.text.contains("失败") and not app.toast_label.text.contains("已结算"),"expedition failure not overwritten by success toast")
	app.store.fail_writes=false
	app._continue_expedition()
	check(app.state().expeditions.active==null and app.toast_label.text.contains("已结算"),"completed claim retry saves once")
	var after_claim: Dictionary=app.state().resources.duplicate()
	app._continue_expedition()
	check(app.state().resources==after_claim,"repeat claim does not duplicate rewards")
	app._open_character("yangjian")
	# Trials now have their own single-screen dossier entry.
	app.body.find_child("SingleScreenCharacter",true,false)._show_challenges()
	var labels: String="\n".join(PackedStringArray(_labels(app.modal_box)))
	var challenge: Dictionary=GameEconomy.character_challenge_status(app.state(),"yangjian")[0]
	check(labels.contains(challenge.encounterName) and labels.contains(challenge.mechanic) and labels.contains(challenge.focusSkill),"challenge preparation shows actual named enemy mechanic and own skill")
	app._close_modal()
	app.selected_character=""
	app.page=1
	app.roster_query="女娲"
	app.filter="全部"
	app.rarity_filter="三星"
	app._render()
	var roster: Control=app.body.get_node_or_null("FactionRoster")
	check(roster!=null,"new faction card wall is the integrated roster")
	check(not app.has_method("_fill_roster_grid") and not app.has_method("_roster_choice"),"legacy roster pagination and filter implementation removed")
	check(app.roster_query.is_empty() and app.rarity_filter=="全部","legacy hidden filters cannot omit faction members")
	check(roster.faction_buttons.size()==8 and not roster.faction_buttons.has("全部"),"eight direct faction choices replace the all-characters pager")
	var reached: Dictionary={}
	for faction: String in roster.factions:
		roster.faction_buttons[faction].pressed.emit()
		check(roster.selected_faction==faction and app.filter==faction,"faction control selects "+faction)
		var expected: Array=[]
		for hero: Dictionary in GameData.content("CHARACTERS"):
			if str(hero.faction)==faction: expected.append(str(hero.id))
		var actual: Array=_roster_ids(roster)
		check(actual==expected,"faction contains every member without pagination: "+faction)
		for id: String in actual: reached[id]=true
		check(roster.find_child("RosterPages",true,false)==null,"no old roster page controls: "+faction)
	check(reached.size()==50,"all 50 characters reachable through faction selection")
	roster.faction_buttons["上古"].pressed.emit()
	check(roster.cards.size()==1 and roster.cards[0].get_meta("character_id")=="nvwa","expansion heroine reachable directly in her faction")
	roster.cards[0].pressed.emit()
	check(app.selected_character=="nvwa" and app.body.get_node_or_null("SingleScreenCharacter")!=null,"compact card opens actual character detail")
	app._back_characters()
	check(app.body.get_node("FactionRoster").selected_faction=="上古","returning from detail preserves the selected faction")
	app._mock_menu()
	check(app.mock_service.command("test_a","device_1","login",{"nickname":"恢复验证"}).ok,"create actual local service fixture")
	check(app.mock_service.command("test_a","device_1","chat_send",{"text":"备份中的消息","channel":"world"}).ok,"commit backed-up service action")
	check(app.mock_service.command("test_a","device_1","chat_send",{"text":"备份之后的消息","channel":"world"}).ok,"commit later service action")
	var game_before_restore: Dictionary=app.state().duplicate(true)
	var damaged: FileAccess=FileAccess.open(app.mock_service.path,FileAccess.WRITE)
	damaged.store_string("intentional isolated corrupt service fixture"); damaged.close()
	check(not app.mock_service.load_data().ok,"detect actual corrupt service file")
	app._mock_menu()
	check(not app.state().has("mockAccount") and _buttons(app.modal_box).has("恢复模拟服务备份"),"recovery is accessible before login")
	app._mock_restore_confirm()
	var confirmation: String=" ".join(PackedStringArray(_labels(app.modal_box)))
	check(confirmation.contains("全部测试账号") and confirmation.contains("公会") and confirmation.contains("云版本") and confirmation.contains("不会改写"),"confirmation describes whole-service rollback and game cache isolation")
	app.mock_service.fail_writes=true
	app._mock_restore_backup()
	check(app.mock_service._corrupt and not app.toast_label.text.contains("已恢复"),"failed service restore remains blocked and never reports success")
	check(app.state()==game_before_restore,"failed service restore never changes game profile")
	app.mock_service.fail_writes=false
	app._mock_restore_backup()
	check(not app.mock_service._corrupt and app.toast_label.text.contains("已恢复"),"service restore success is acknowledged only after commit")
	check(app.state()==game_before_restore,"successful whole-service restore leaves game profile unchanged")
	app.queue_free()
	await process_frame
	var f: FileAccess=FileAccess.open("res://docs/audits/ui-failure-tests.json",FileAccess.WRITE)
	f.store_string(JSON.stringify({"checks":checks,"failures":failures,"visual":false},"  ")); f.close()
	print("UI FAILURE REGRESSIONS: %d checks, %d failures" % [checks,failures.size()])
	quit(0 if failures.is_empty() else 1)

func _buttons(node: Node) -> Array:
	var result: Array=[]
	if node is Button: result.append(node.text)
	for child: Node in node.get_children(): result.append_array(_buttons(child))
	return result

func _roster_ids(node: Node) -> Array:
	var result: Array=[]
	if node.has_meta("character_id"): result.append(node.get_meta("character_id"))
	for child: Node in node.get_children(): result.append_array(_roster_ids(child))
	return result
