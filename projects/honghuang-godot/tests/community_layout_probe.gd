extends SceneTree
func _initialize() -> void: _run.call_deferred()
func _run() -> void:
	root.size=Vector2i(360,800)
	root.content_scale_size=Vector2i(360,800)
	var app: Control=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	await process_frame
	app.command("guildJoin",{"id":"qingyun"})
	for dimensions: Vector2i in [Vector2i(540,960),Vector2i(360,800),Vector2i(320,844)]:
		root.size=dimensions
		root.content_scale_size=dimensions
		for frame: int in 4: await process_frame
		for tab: String in ["委托","商店","成员","捐献"]:
			app.set_meta("community_tab",tab)
			app._go(6)
			for frame: int in 4: await process_frame
			var parts: Array=[]
			for child: Node in app.body.get_child(0).get_children(): parts.append([child.get_class(),child.get_combined_minimum_size().y])
			print("LAYOUT ",dimensions," ",tab," min=",app.body.get_combined_minimum_size().y," available=",app.body_scroll.size.y," pieces=",parts)
		app._go(7)
		for frame: int in 4: await process_frame
		print("LAYOUT ",dimensions," ranking min=",app.body.get_combined_minimum_size().y," available=",app.body_scroll.size.y)
	app.store.release()
	app.queue_free()
	await process_frame
	quit()
