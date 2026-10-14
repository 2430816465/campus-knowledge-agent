extends SceneTree
## OS focus verification, then a full isolated game for manual review.
var app: Control
var records: Array=[]
var held_action := -1
func _initialize() -> void: _run.call_deferred()
func _run() -> void:
	root.size=Vector2i(540,960)
	app=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	app._load_slot("demo:roster")
	app._go(1)
	root.window_input.connect(_input)
	root.focus_exited.connect(_lost)
	root.focus_entered.connect(_gained)
	print("F7 starts long native focus fixture. F8 returns to roster. F12 saves current full game screen.")
func _input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo: return
	if event.keycode==KEY_F7: _start()
	if event.keycode==KEY_F8:
		if is_instance_valid(app.battle_view): app._leave_battle()
		app._go(1)
	if event.keycode==KEY_F12: _shot.call_deferred()
func _start() -> void:
	if is_instance_valid(app.battle_view): app._leave_battle()
	app._enter_battle({"stageId":12,"team":[{"id":"yunxiao","level":5,"branch":"A","treasure":1},{"id":"qiongxiao","level":5,"branch":"A","treasure":1},{"id":"bixiao","level":5,"branch":"A","treasure":1}],"options":{"seed":713,"trial":true,"contextName":"原生切后台验证","enemies":[{"id":"native-focus-target","name":"静修陪练","role":"soldier","row":"front","hp":500000,"atk":1,"def":20,"speed":1}]}},"trial")
	app.battle_view.automatic=true
	app.audio.configure({"sound":true,"music":true})
	app.audio.cue("skill")
	_record("armed")
func _lost() -> void:
	if is_instance_valid(app.battle_view): held_action=int(app.battle_view.battle.actionCount)
	_record("native_focus_exited")
func _gained() -> void: _record("native_focus_entered")
func _record(kind: String) -> void:
	var item: Dictionary={"event":kind,"utc":Time.get_datetime_string_from_system(true),"mainSuspended":app.presentation_suspended,"audioBackgrounded":app.audio.backgrounded,"voices":app.audio.voices.size()}
	if is_instance_valid(app.battle_view):
		item["actionCount"]=app.battle_view.battle.actionCount
		item["battleBackgrounded"]=app.battle_view.backgrounded
		item["effectNodes"]=app.battle_view.arena.get_children().filter(func(n: Node) -> bool: return n is BattleEffects).size()
		if kind=="native_focus_entered" and held_action>=0: item["noActionsWhileAway"]=held_action==int(app.battle_view.battle.actionCount)
	records.append(item)
	var f: FileAccess=FileAccess.open("res://docs/audits/native-focus-resume.json",FileAccess.WRITE)
	f.store_string(JSON.stringify({"operatingSystemSignals":true,"events":records},"  "));f.close()
func _shot() -> void:
	await RenderingServer.frame_post_draw
	var path: String="res://docs/audits/ui-manual-%d.png" % Time.get_ticks_msec()
	root.get_texture().get_image().save_png(path)
	print("NATIVE MANUAL SCREEN ",path)
