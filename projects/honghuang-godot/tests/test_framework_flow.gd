extends "res://tests/test_framework_rules.gd"
var app: Control
func frames(n: int = 4) -> void:
	for i in range(n): await process_frame
func complete_actual_battle() -> Dictionary:
	var b: Dictionary = app.battle_view.battle
	for i in range(5000):
		if b.result != null: break
		GameCombat.auto_act(b)
	check(b.result != null,"foreground real auto battle finishes")
	app.battle_view.battle = b; app.battle_view.locked = 0
	app.battle_view._process(0.01)
	return b
func run() -> void:
	root.size = Vector2i(540,960)
	app = load("res://scenes/main.tscn").instantiate(); app.set_meta("ui_test",true)
	root.add_child(app); app.set_process(false); app.audio.sound_enabled = false
	var fixture: Dictionary = rich(); fixture.revision = app.store.state.revision
	app.store.state = fixture; app.store.state.settings.simplified = true
	app._framework_page("挑战"); await frames()
	app.framework_auto_set = true; app.framework_auto_args = {"kind":"set","difficulty":1,"dungeon":0}
	app._framework_action("challengePrepare",app.framework_auto_args); await frames()
	check(is_instance_valid(app.battle_view) and app.battle_context == "framework","functional UI starts saved framework battle")
	if not is_instance_valid(app.battle_view):
		push_error(str(app.store.last_error)); app.store.release(); app.queue_free(); finish(); return
	app.battle_view.set_process(false)
	var b: Dictionary = complete_actual_battle()
	check(app.state().framework.challenges.completed.has(b.id),"view finish submits real replay validation")
	await create_timer(1.35).timeout; await frames()
	check(app.state().framework.challenges.completed[b.id].claimed and app.state().framework.challenges.stamina == 100,"foreground loop claims first victory once")
	check(is_instance_valid(app.battle_view) and app.battle_view.battle.id != b.id,"foreground loop starts a new actual battle")
	app.battle_view.set_process(false); app._suspend_presentation()
	var second: Dictionary = complete_actual_battle()
	check(not app.state().framework.challenges.completed.has(second.id),"backgrounded view cannot submit or reward")
	app._resume_presentation(); app.battle_view.ignore_resume_delta = false; app.battle_view._process(.01)
	app.framework_auto_set = false
	await create_timer(1.35).timeout; await frames()
	check(app.state().framework.challenges.completed.has(second.id) and not app.state().framework.challenges.completed[second.id].claimed,"stop control leaves saved victory for manual claim")
	var count: int = app.state().equipment.items.size()
	app._leave_battle(); await frames()
	check(app.system_view == "framework:挑战" and app.frame.visible,"return route reaches functional challenge hub")
	check(app.state().equipment.items.size() == count,"stop/return does not implicitly award twice")
	app.store.release(); app.queue_free(); await frames()
	finish()
