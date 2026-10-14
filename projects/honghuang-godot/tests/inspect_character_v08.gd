extends SceneTree
func _initialize()->void: _run.call_deferred()
func _run()->void:
	root.content_scale_mode=Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_size=Vector2i.ZERO
	var app: Control=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	app.set_process(false)
	for dimensions: Vector2i in [Vector2i(540,960),Vector2i(320,568)]:
		root.size=dimensions
		app._open_character("yangjian")
		for n in range(10): await process_frame
		var page: CharacterScreen=app.body.get_node("SingleScreenCharacter")
		for tab in CharacterScreen.TABS:
			page._select_tab(tab)
			for n in range(16):
				await process_frame
				if n in [3,7,15]: print(dimensions," ",tab," frame",n," rect",page.get_global_rect()," min",page.get_combined_minimum_size()," body",app.body_scroll.get_global_rect()," pages",app.page_bar.visible)
			for child: Control in page.get_children(): print(child.get_class()," ",child.size," min",child.get_combined_minimum_size())
			if tab=="仙人志":
				page._lore_view("身世")
				for n in range(16): await process_frame
				print("BIO ",page.get_global_rect()," min",page.get_combined_minimum_size()," BODY ",app.body.size," bodymin",app.body.get_combined_minimum_size()," canvas",app.body.get_parent().size); app.body.size=app.body_scroll.size; for n in range(6): await process_frame; print("RESET ",page.size," body",app.body.size)
	quit()

