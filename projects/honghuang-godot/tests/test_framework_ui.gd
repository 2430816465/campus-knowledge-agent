extends SceneTree
var app: Control
var checks: int = 0
var failures: Array = []
func _initialize() -> void: run.call_deferred()
func check(value: bool, note: String) -> void:
	checks += 1
	if not value: failures.append(note); push_error(note)
func frames() -> void:
	for i in range(15): await process_frame
func run() -> void:
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_DISABLED
	root.size = Vector2i(540,960)
	app = load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true); root.add_child(app); app.set_process(false)
	app.audio.sound_enabled = false
	app.store.state = GameEconomy.create_state(1791388800000)
	for cmd in [["progDiscipleRecruit",{}],["fwPetSummon",{}],["estateOrdersRefresh",{}]]:
		var r: Dictionary = GameEconomy.command(app.store.state,cmd[0],cmd[1],int(app.state().lastTime))
		check(r.ok,"fixture "+cmd[0]+": "+str(r.get("error","")))
	for size in [Vector2i(540,960),Vector2i(360,800)]:
		root.size = size; await frames()
		for tab in FrameworkScreen.TABS:
			app._framework_page(tab); await frames()
			check(app.system_view == "framework:"+tab,"native route "+tab)
			check(app.body.get_child_count() > 4,"built functional page "+tab)
			check(app.body_scroll.scroll_vertical == 0,"page has no vertical scrolling "+tab)
			if DisplayServer.get_name() != "headless":
				await RenderingServer.frame_post_draw
				root.get_texture().get_image().save_png("res://evidence/framework-ui-%dx%d-%s.png" % [size.x,size.y,tab])
	app._systems_page("049"); await frames()
	check(app.system_view == "framework:挑战","tower route uses new framework")
	for id in ["048","051","061"]:
		app._systems_page(id); await frames()
		check(app.system_view == id,"distinct retained activity route "+id)
	app._go(3); await frames()
	check(app.page == 3,"existing summon remains reachable")
	app._go(5); await frames()
	var entry: Button = app.foundation_home.get_node("Design/Profile/FrameworkEntry")
	check(entry != null,"actual current home includes framework entry")
	entry.pressed.emit(); await frames()
	check(app.system_view == "framework:阵容","home profile button enters functional framework")
	app.store.release(); app.queue_free(); await frames()
	print("FRAMEWORK UI CHECKS ",checks," FAILURES ",failures.size())
	quit(0 if failures.is_empty() else 1)
