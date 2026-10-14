extends SceneTree
var checks:=0
var failures: Array[String]=[]
func _initialize()->void: _run.call_deferred()
func inspect_buttons(node: Node,bounds: Rect2,context: String)->void:
	if node is Control and not node.is_visible_in_tree(): return
	if node is Button:
		checks+=1
		if not bounds.grow(0.5).encloses(node.get_global_rect()): failures.append(context+" outside "+str(node.name)+" "+str(node.get_global_rect()))
	for child in node.get_children(): inspect_buttons(child,bounds,context)
func capture(app: Control,context: String)->void:
	for frame in range(16): await process_frame
	inspect_buttons(app.body,app.body_scroll.get_global_rect(),context)
	checks+=2
	if app.page_bar.visible: failures.append(context+" visible page bar")
	if app.body_scroll.scroll_vertical!=0: failures.append(context+" scroll offset")
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png("res://evidence/collection-v08/"+context+".png")
	print(context," body=",app.body_scroll.get_global_rect()," page=",app.page_bar.visible)
func _run()->void:
	root.content_scale_mode=Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_size=Vector2i.ZERO
	root.size=Vector2i(540,960)
	var app: Control=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	app.set_process(false)
	app.audio.sound_enabled=false
	var resources_before: String=JSON.stringify(app.state().resources)
	var history_before: String=JSON.stringify(app.state().get("drawHistory",[]))
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://evidence/collection-v08"))
	for dimensions: Vector2i in [Vector2i(540,960),Vector2i(360,800),Vector2i(320,568)]:
		root.size=dimensions
		for page in [1,3]:
			app.set_meta("summon_v05_mode","permanent")
			app._go(page)
			var context: String="%dx%d-%s" % [dimensions.x,dimensions.y,"roster" if page==1 else "summon"]
			await capture(app,context)
			if page==1:
				app._open_character("nezha")
				await capture(app,"%dx%d-character" % [dimensions.x,dimensions.y])
				app.body.get_node("SingleScreenCharacter")._select_tab("装备")
				await capture(app,"%dx%d-equipment" % [dimensions.x,dimensions.y])
				app.set_meta("hero_tab","培养")
			if page==3:
				app.body.get_node("SummonScreen")._set_mode("exchange")
				await capture(app,"%dx%d-exchange" % [dimensions.x,dimensions.y])
	checks+=2
	if resources_before!=JSON.stringify(app.state().resources): failures.append("presentation changed resources")
	if history_before!=JSON.stringify(app.state().get("drawHistory",[])): failures.append("presentation created a draw")
	for failure in failures: print("FAIL ",failure)
	print("COLLECTION_V08 checks=",checks," failures=",failures.size())
	quit(0 if failures.is_empty() else 1)
