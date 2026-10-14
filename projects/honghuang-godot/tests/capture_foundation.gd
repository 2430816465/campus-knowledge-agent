extends SceneTree
## Real renderer only. Example: --script res://tests/capture_foundation.gd -- --view=home --state=reference --size=540x960 --out=...
var app: Control
func _initialize() -> void: run.call_deferred()
func run() -> void:
	if DisplayServer.get_name() == "headless":
		push_error("Visual capture requires a real renderer"); quit(2); return
	var options: Dictionary = {"view":"home","state":"reference","size":"540x960","out":"res://evidence/ui-foundation/home.png"}
	for arg: String in OS.get_cmdline_user_args():
		if "=" in arg:
			var pair: PackedStringArray = arg.trim_prefix("--").split("=",true,1)
			options[pair[0]] = pair[1]
	var dimensions: PackedStringArray = str(options.size).split("x")
	root.size = Vector2i(int(dimensions[0]),int(dimensions[1]))
	root.content_scale_size = root.size
	if options.get("safe","") == "notch":
		root.set_meta(GameSafeArea.TEST_INSETS,Vector4(0,32,0,24))
		root.set_meta("ui_capsule_bottom",66.0)
	app = load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	app.set_process(false)
	app.audio.sound_enabled = false
	app.toast_label.hide()
	await process_frame
	if options.view == "summon": app._go(3)
	elif options.view == "components":
		app.hide()
		var preview: Control = load("res://scenes/ui/component_preview.tscn").instantiate()
		root.add_child(preview)
		if options.get("scroll","") == "bottom":
			await process_frame
			preview.get_node("Scroll").scroll_vertical = 10000
	else:
		app.foundation_home.configure(app,options.state == "reference")
		if options.view == "result":
			if options.state == "reference": app.foundation_home.show_result()
			else: app.foundation_home.forge()
	for i: int in 12: await process_frame
	await create_timer(0.5).timeout
	await RenderingServer.frame_post_draw
	var output: String = str(options.out)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output.get_base_dir()))
	var error: Error = root.get_texture().get_image().save_png(output)
	print("REAL_RENDER_CAPTURE ",output," ",root.size," status=",error)
	app.store.release()
	quit(0 if error == OK else 1)
