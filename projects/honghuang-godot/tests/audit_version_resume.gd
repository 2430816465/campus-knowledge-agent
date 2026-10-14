extends SceneTree
var checks := 0
var failures: Array=[]
var phase:="preaudit"
func check(value:bool,label:String)->void:
	checks+=1
	if not value:failures.append(label);push_error("VERSION AUDIT: "+label)
func _initialize()->void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--audit-phase="):phase=arg.trim_prefix("--audit-phase=")
	_run.call_deferred()
func buttons(node:Node)->Array:
	var values:Array=[]
	if node is Button:values.append(node)
	for child in node.get_children():values.append_array(buttons(child))
	return values
func _run()->void:
	var app:Control=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	await process_frame
	app._load_slot("demo:expedition-project")
	check(app.command("prepareCharacterChallenge",{"characterId":"nezha","tier":1},false).ok,"prepare authentic challenge snapshot")
	var old:Dictionary=app.state().duplicate(true)
	old.characterChallenges.active.ruleVersion="v0.2.0"
	var path:String=app.store.base_dir.path_join("previous-rules-challenge.json")
	var file:=FileAccess.open(path,FileAccess.WRITE)
	file.store_string(GameStore.encode_save(old));file.close()
	check(app.store.import_save(path).ok,"import structurally valid prior-version challenge fixture")
	var before:Dictionary=app.state().resources.duplicate(true)
	app._start_challenge("nezha",1)
	await process_frame
	check(not is_instance_valid(app.battle_view),"obsolete combat rules return visible error without constructing invalid battle scene")
	check(app.toast_label.text.contains("版本") or app.toast_label.text.contains("更新"),"obsolete challenge explains version incompatibility")
	check(app.state().resources==before and app.state().characterChallenges.active!=null,"incompatible challenge preserves assets and prior admission")
	if is_instance_valid(app.battle_view):app._leave_battle()
	check(app.command("abandonCharacterChallenge",{},false).ok,"old-version challenge can be explicitly abandoned")
	app._start_main(1)
	await process_frame
	check(is_instance_valid(app.battle_view) and not app.last_battle.has("error"),"abandon permits an actual current-version native battle")
	app._leave_battle()
	old=app.state().duplicate(true)
	old.mainBattle.ruleVersion="v0.2.0"
	file=FileAccess.open(path,FileAccess.WRITE)
	file.store_string(GameStore.encode_save(old));file.close()
	check(app.store.import_save(path).ok,"import structurally valid prior-version MAIN ticket")
	app.page=2;app.subpage="主线";app._render()
	await process_frame
	var abandon:Button
	var continue_visible:=false
	for button in buttons(app.body):
		if button.text=="放弃本次战前记录":abandon=button
		if button.text=="继续历练":continue_visible=true
	check(continue_visible and abandon!=null,"old MAIN admission exposes both continue and actual abandon button")
	before=app.state().resources.duplicate(true)
	app._start_main(1)
	await process_frame
	check(not is_instance_valid(app.battle_view) and (app.toast_label.text.contains("版本") or app.toast_label.text.contains("更新")),"old MAIN continuation visibly rejects incompatible rules without blank combat")
	check(app.state().resources==before and app.state().mainBattle!=null,"old MAIN continuation preserves assets and stored admission")
	if abandon!=null:abandon.pressed.emit()
	check(app.state().mainBattle==null,"actual native abandon button clears old MAIN admission")
	app._start_main(1)
	await process_frame
	check(is_instance_valid(app.battle_view) and not app.last_battle.has("error"),"current MAIN battle starts after actual abandon button")
	var actions:=0
	while app.last_battle.get("result")==null and actions<1000:
		check(GameCombat.auto_act(app.last_battle),"actual legal battle after old MAIN migration")
		actions+=1
	check(app.last_battle.get("result")=="win","current MAIN battle wins after old admission recovery")
	app._battle_finished(app.last_battle)
	check(app.settlement.ok,"actual post-recovery MAIN victory commits")
	app._leave_battle()
	app.queue_free()
	await process_frame
	var output:=FileAccess.open("res://docs/audits/%s-version-resume.json"%phase,FileAccess.WRITE)
	output.store_string(JSON.stringify({"phase":phase,"utc":Time.get_datetime_string_from_system(true),"checks":checks,"failures":failures,"post_main_recovery_battle_actions":actions,"scope":"Actual isolated GUI entries from structurally valid saved challenge and MAIN admissions under v0.2.0. Visible rejection, native abandon button, current battle restart and actual victory settlement."},"  "));output.close()
	print("VERSION RESUME ",checks," checks / ",failures.size()," failures")
	quit(0 if failures.is_empty() else 1)
