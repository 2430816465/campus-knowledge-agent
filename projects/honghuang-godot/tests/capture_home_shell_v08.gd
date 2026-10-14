extends SceneTree
## Full shell integration, stored in a unique UI-test profile; never reads player saves.
var failures: Array[String] = []
func _initialize() -> void: _run.call_deferred()
func _run() -> void:
	root.content_scale_mode=Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_size=Vector2i.ZERO
	root.size=Vector2i(540,960)
	var app: Control=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	app.set_process(false)
	app.audio.sound_enabled=false
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://evidence/home-v08"))
	for dimensions: Vector2i in [Vector2i(540,960),Vector2i(360,640),Vector2i(320,568)]:
		root.size=dimensions
		app._go(5)
		for frame in range(20): await process_frame
		var home: Control=app.body.get_node("CultivationHome")
		var context: String="%dx%d" % [dimensions.x,dimensions.y]
		if app.header.visible: failures.append(context+" shows duplicate header")
		if app.page_bar.visible: failures.append(context+" shows a pager")
		if app.body_scroll.scroll_vertical>0 or app.body_scroll.scroll_horizontal>0: failures.append(context+" scrolls")
		if home.get_global_rect().end.y>app.nav.get_global_rect().position.y+1: failures.append(context+" overlaps navigation")
		if DisplayServer.get_name()!="headless":
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png("res://evidence/home-v08/"+context+"-shell.png")
		print("HOME_SHELL ",context," home=",home.get_global_rect()," nav=",app.nav.get_global_rect())
	for failure in failures: print("FAIL ",failure)
	print("HOME_SHELL failures=",failures.size())
	quit(0 if failures.is_empty() else 1)
