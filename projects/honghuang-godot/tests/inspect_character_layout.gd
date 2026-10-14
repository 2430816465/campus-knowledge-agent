extends SceneTree
func _initialize() -> void: inspect.call_deferred()
func inspect() -> void:
	root.content_scale_mode=Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_size=Vector2i.ZERO
	var app: Control=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	await process_frame
	app.set_process(false)
	for dimensions in [Vector2i(540,960),Vector2i(360,800)]:
		root.size=dimensions
		app._open_character("nezha")
		for i in range(5): await process_frame
		var page: CharacterScreen=app.body.find_child("SingleScreenCharacter",true,false)
		for tab in ["培养","灵宝"]:
			page._select_tab(tab)
			for i in range(5): await process_frame
			print(dimensions," ",tab," actual ",page.size," minimum ",page.get_combined_minimum_size()," body ",app.body_scroll.size)
			for child: Control in page.get_children(): print(child.get_class()," ",child.size," min ",child.get_combined_minimum_size())
	app.queue_free()
	await process_frame
	quit()
